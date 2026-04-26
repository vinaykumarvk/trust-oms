/**
 * TFP Ad-hoc Fee API Routes (TrustFees Pro -- Phase 7)
 *
 * Maker-checker workflow:
 *   POST   /           -- Capture (maker) → PENDING_AUTH
 *   POST   /:id/authorize -- Authorize (checker, SoD enforced) → OPEN
 *   POST   /:id/reject  -- Reject (checker, SoD enforced) → CANCELLED
 *   GET    /           -- List ad-hoc fees
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { tfpAdhocFeeService } from '../../services/tfp-adhoc-fee-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List
// ============================================================================

/** GET / -- List ad-hoc fees with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      accrual_status: req.query.accrual_status as string | undefined,
      customer_id: req.query.customer_id as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    };
    const result = await tfpAdhocFeeService.getAdhocFees(filters);
    res.json(result);
  }),
);

// ============================================================================
// Capture (Maker)
// ============================================================================

/** POST / -- Capture an ad-hoc fee (creates PENDING_AUTH, awaits checker authorization) */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const { customer_id, portfolio_id, fee_type, amount, currency, reason } = req.body;
    const userId: string = req.userId ?? req.user?.id ?? 'unknown';

    if (!customer_id || !fee_type || !amount || !currency || !reason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Required fields: customer_id, fee_type, amount, currency, reason',
        },
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'amount must be a positive number' },
      });
    }

    try {
      const result = await tfpAdhocFeeService.captureAdhocFee(
        { customer_id, portfolio_id, fee_type, amount, currency, reason },
        userId,
      );
      // 202 — pending checker authorization
      res.status(202).json({ data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('No active fee plan')) {
        return res.status(400).json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Authorize (Checker)
// ============================================================================

/** POST /:id/authorize -- Checker authorizes PENDING_AUTH → OPEN (SoD enforced) */
router.post(
  '/:id/authorize',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid accrual ID' } });

    const checkerId: string = req.userId ?? req.user?.id ?? 'unknown';

    try {
      const result = await tfpAdhocFeeService.authorizeAdHocFee(id, checkerId);
      res.json({ data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      if (msg.includes('Separation of duties') || msg.includes('not pending')) {
        return res.status(409).json({ error: { code: 'WORKFLOW_VIOLATION', message: msg } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Reject (Checker)
// ============================================================================

/** POST /:id/reject -- Checker rejects PENDING_AUTH → CANCELLED (SoD enforced) */
router.post(
  '/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid accrual ID' } });

    const checkerId: string = req.userId ?? req.user?.id ?? 'unknown';
    const { reason } = req.body;

    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'reason must be at least 5 characters' } });
    }

    try {
      const result = await tfpAdhocFeeService.rejectAdHocFee(id, checkerId, String(reason));
      res.json({ data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      if (msg.includes('Separation of duties') || msg.includes('not pending')) {
        return res.status(409).json({ error: { code: 'WORKFLOW_VIOLATION', message: msg } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// GAP-C09: Immediate Ad-hoc Invoice (still requires auth before EOD pickup)
// ============================================================================

/** POST /:id/invoice-now -- Capture and immediately invoice (still PENDING_AUTH until authorized) */
router.post(
  '/:id/invoice-now',
  asyncHandler(async (req: any, res: any) => {
    const { customer_id, portfolio_id, fee_type, amount, currency, reason } = req.body;
    const userId: string = req.userId ?? req.user?.id ?? 'unknown';

    if (!customer_id || !fee_type || !amount || !currency || !reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Required fields: customer_id, fee_type, amount, currency, reason' },
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'amount must be a positive number' },
      });
    }

    try {
      const result = await tfpAdhocFeeService.captureAndInvoice(
        { customer_id, portfolio_id, fee_type, amount, currency, reason },
        userId,
      );
      res.status(202).json({ data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('No active fee plan')) {
        return res.status(400).json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

export default router;
