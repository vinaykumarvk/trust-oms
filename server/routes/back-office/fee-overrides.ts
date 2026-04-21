/**
 * Fee Override Routes (TrustFees Pro -- Phase 8)
 *
 *   GET    /              -- List overrides (query: override_stage, override_status, date_from, date_to, search, page, pageSize)
 *   GET    /pending       -- Pending approval queue
 *   GET    /:id           -- Single override with fee plan details
 *   POST   /              -- Request override
 *   POST   /:id/approve   -- Approve (body: { approverId })
 *   POST   /:id/reject    -- Reject (body: { approverId, comment })
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { feeOverrideService } from '../../services/fee-override-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List overrides with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      override_stage: req.query.override_stage as string | undefined,
      override_status: req.query.override_status as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await feeOverrideService.getOverrides(filters);
    res.json(result);
  }),
);

/** GET /pending -- Pending override queue */
router.get(
  '/pending',
  asyncHandler(async (_req, res) => {
    const result = await feeOverrideService.getPendingOverrides();
    res.json(result);
  }),
);

/** GET /:id -- Single override with fee plan details */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid override ID' },
      });
    }

    try {
      const record = await feeOverrideService.getOverrideById(id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Create & Actions
// ============================================================================

/** POST / -- Request an override */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const {
      fee_plan_id, accrual_id, invoice_id, override_stage,
      original_amount, overridden_amount, reason_code, reason_notes, requested_by,
    } = req.body;

    if (!fee_plan_id || !override_stage || !original_amount || !overridden_amount || !reason_code || !reason_notes || !requested_by) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'fee_plan_id, override_stage, original_amount, overridden_amount, reason_code, reason_notes, and requested_by are required',
        },
      });
    }

    try {
      const record = await feeOverrideService.requestOverride({
        fee_plan_id,
        accrual_id,
        invoice_id,
        override_stage,
        original_amount: String(original_amount),
        overridden_amount: String(overridden_amount),
        reason_code,
        reason_notes,
        requested_by,
      });

      res.status(201).json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('cannot be zero') || msg.includes('valid numbers')) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/approve -- Approve a pending override */
router.post(
  '/:id/approve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid override ID' },
      });
    }

    const approverId = req.body.approverId;
    if (!approverId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'approverId is required' },
      });
    }

    try {
      const record = await feeOverrideService.approveOverride(id, approverId);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot approve')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      if (msg.includes('Segregation')) {
        return res.status(403).json({
          error: { code: 'SOD_VIOLATION', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/reject -- Reject a pending override */
router.post(
  '/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid override ID' },
      });
    }

    const { approverId, comment } = req.body;
    if (!approverId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'approverId is required' },
      });
    }
    if (!comment) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'comment is required when rejecting' },
      });
    }

    try {
      const record = await feeOverrideService.rejectOverride(id, approverId, comment);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot reject')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

export default router;
