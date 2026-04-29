import { Router } from 'express';
import { mfaService } from '../../services/mfa-service';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();

/** Parse userId from req.userId (string from JWT) to number */
function parseUserId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** POST /enroll — Start MFA enrollment (generates secret + QR code) */
router.post('/enroll', async (req, res) => {
  try {
    const userId = parseUserId(req.userId);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const result = await mfaService.enrollMFA(userId);
    res.json(result);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

/** POST /verify — Verify TOTP code to confirm enrollment */
router.post('/verify', async (req, res) => {
  try {
    const userId = parseUserId(req.userId);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'TOTP token is required' });
    }

    const result = await mfaService.verifyEnrollment(userId, token);
    res.json(result);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

/** GET /status — Get MFA status for current user */
router.get('/status', async (req, res) => {
  try {
    const userId = parseUserId(req.userId);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const result = await mfaService.getMFAStatus(userId);
    res.json(result);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

/** POST /disable — Disable MFA */
router.post('/disable', async (req, res) => {
  try {
    const userId = parseUserId(req.userId);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'TOTP token is required to disable MFA' });
    }

    // Must verify current TOTP before disabling
    const isValid = await mfaService.verifyUserTOTP(userId, token);
    if (!isValid) {
      return res.status(403).json({ error: 'Invalid TOTP code' });
    }

    const result = await mfaService.disableMFA(userId);
    res.json(result);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

/** POST /backup-codes — Regenerate backup codes */
router.post('/backup-codes', async (req, res) => {
  try {
    const userId = parseUserId(req.userId);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'TOTP token is required' });
    }

    const result = await mfaService.regenerateBackupCodes(userId, token);
    res.json(result);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

export default router;
