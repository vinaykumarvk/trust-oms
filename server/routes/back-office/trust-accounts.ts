import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';
import { trustAccountFoundationService } from '../../services/trust-account-foundation-service';
import {
  accountMetadataService,
  jointAccountService,
  specialInstructionService,
  accountLifecycleService,
} from '../../services/trust-account-enrichment-service';

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

// ─── MB-GAP-006: Account Metadata ─────────────────────────────────────────

router.patch(
  '/:accountId',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const data = await accountMetadataService.updateMetadata(
        req.params.accountId,
        req.body,
        String(userId),
      );
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

// ─── MB-GAP-007: Joint Account & Relationship Graph ───────────────────────

router.patch(
  '/:accountId/joint-config',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { joint_account_type, max_joint_holders } = req.body;
      const data = await jointAccountService.configureJointAccount(
        req.params.accountId,
        joint_account_type,
        max_joint_holders,
        String(userId),
      );
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.get(
  '/:accountId/relationship-graph',
  asyncHandler(async (req, res) => {
    try {
      const data = await jointAccountService.getRelationshipGraph(req.params.accountId);
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.get(
  '/client/:clientId/relationship-graph',
  asyncHandler(async (req, res) => {
    const data = await jointAccountService.getClientRelationshipGraph(req.params.clientId);
    res.json({ data });
  }),
);

// ─── MB-GAP-008: Special Instructions ─────────────────────────────────────

router.post(
  '/:accountId/special-instructions',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const data = await specialInstructionService.create({
        ...req.body,
        trust_account_id: req.params.accountId,
        userId: String(userId),
      });
      res.status(201).json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.get(
  '/:accountId/special-instructions',
  asyncHandler(async (req, res) => {
    const data = await specialInstructionService.list(req.params.accountId);
    res.json({ data });
  }),
);

router.patch(
  '/special-instructions/:instrId',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const instrId = parseInt(req.params.instrId, 10);
    if (isNaN(instrId)) return res.status(400).json({ error: 'Invalid instrId' });
    try {
      const data = await specialInstructionService.update(instrId, req.body, String(userId));
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.delete(
  '/special-instructions/:instrId',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const instrId = parseInt(req.params.instrId, 10);
    if (isNaN(instrId)) return res.status(400).json({ error: 'Invalid instrId' });
    try {
      const data = await specialInstructionService.remove(instrId, String(userId));
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.get(
  '/special-instructions/pending',
  asyncHandler(async (_req, res) => {
    const data = await specialInstructionService.getPendingNotifications();
    res.json({ data });
  }),
);

// ─── MB-GAP-009: Closure, Holds, Status History ──────────────────────────

router.post(
  '/:accountId/validate-closure',
  asyncHandler(async (req, res) => {
    try {
      const data = await accountLifecycleService.validateClosure(req.params.accountId);
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.post(
  '/:accountId/close',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const data = await accountLifecycleService.closeAccount(
        req.params.accountId,
        req.body.reason ?? 'Closure requested',
        String(userId),
      );
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.post(
  '/:accountId/change-status',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const data = await accountLifecycleService.changeStatus(
        req.params.accountId,
        req.body.new_status,
        req.body.reason ?? '',
        String(userId),
        req.body.approval_required ?? false,
      );
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.get(
  '/:accountId/status-history',
  asyncHandler(async (req, res) => {
    const data = await accountLifecycleService.getStatusHistory(req.params.accountId);
    res.json({ data });
  }),
);

router.get(
  '/:accountId/holds',
  asyncHandler(async (req, res) => {
    try {
      const data = await accountLifecycleService.getHoldsForAccount(req.params.accountId);
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.post(
  '/:accountId/holds',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const account = req.params.accountId;
      const data = await accountLifecycleService.placeHold({
        ...req.body,
        trust_account_id: account,
        userId: String(userId),
      });
      res.status(201).json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.post(
  '/holds/:holdId/lift',
  asyncHandler(async (req: any, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const data = await accountLifecycleService.liftHold(
        req.params.holdId,
        req.body.reason ?? 'Hold lifted',
        String(userId),
        req.body.approver_id,
      );
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.get(
  '/:accountId/hold-history',
  asyncHandler(async (req, res) => {
    const data = await accountLifecycleService.getHoldHistory(req.params.accountId);
    res.json({ data });
  }),
);

router.get(
  '/:accountId/dormancy',
  asyncHandler(async (req, res) => {
    try {
      const data = await accountLifecycleService.getDormancyForAccount(req.params.accountId);
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

export default router;
