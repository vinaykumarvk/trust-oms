import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';
import { trustAccountFoundationService } from '../../services/trust-account-foundation-service';

const router = Router();

router.use(requireBackOfficeRole());

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clientId = req.query.client_id as string | undefined;
    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'client_id query parameter is required' },
      });
    }

    const data = await trustAccountFoundationService.listForClient(clientId);
    res.json({ data });
  }),
);

router.get(
  '/:accountId',
  asyncHandler(async (req, res) => {
    try {
      const data = await trustAccountFoundationService.getFoundationDetail(req.params.accountId);
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.post(
  '/:accountId/authority-check',
  asyncHandler(async (req, res) => {
    try {
      const data = await trustAccountFoundationService.validateMandateAuthority(
        req.params.accountId,
        req.body,
      );
      res.status(data.passed ? 200 : 422).json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req: any, res) => {
    try {
      const data = await trustAccountFoundationService.createDefaultFoundation(
        req.body,
        req.userId || req.body.created_by || 'system',
      );
      res.status(201).json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

export default router;
