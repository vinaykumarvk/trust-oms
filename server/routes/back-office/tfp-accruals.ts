/**
 * TFP Accrual API Routes (TrustFees Pro -- Phase 6)
 *
 * Provides endpoints for accrual management:
 *   GET    /             -- List accruals with filters (accrual_date, portfolio_id, fee_plan_id, accrual_status, page, pageSize)
 *   GET    /summary      -- Summary for date: total accrued amount, count, breakdown by fee_type
 *   POST   /run          -- Manual daily accrual trigger (body: { date })
 *   GET    /:id          -- Single accrual detail with resolved fee plan and portfolio info
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { tfpAccrualEngine } from '../../services/tfp-accrual-engine';
import { asyncHandler } from '../../middleware/async-handler';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List accruals with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      accrual_date: req.query.accrual_date as string | undefined,
      portfolio_id: req.query.portfolio_id as string | undefined,
      fee_plan_id: req.query.fee_plan_id
        ? parseInt(req.query.fee_plan_id as string, 10)
        : undefined,
      accrual_status: req.query.accrual_status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await tfpAccrualEngine.listAccruals(filters);
    res.json(result);
  }),
);

/** GET /summary -- Summary statistics for a given date */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const date = req.query.date as string | undefined;
    const result = await tfpAccrualEngine.getSummary(date);
    res.json({ data: result });
  }),
);

/** GET /:id -- Get a single accrual with resolved references */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid accrual ID' },
      });
    }

    try {
      const record = await tfpAccrualEngine.getAccrualById(id);
      res.json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
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
// Manual Accrual Trigger
// ============================================================================

/** POST /run -- Trigger daily accrual for a given date */
router.post(
  '/run',
  asyncHandler(async (req: any, res: any) => {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date is required (format: YYYY-MM-DD)',
        },
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date must be in YYYY-MM-DD format',
        },
      });
    }

    try {
      const result = await tfpAccrualEngine.runDailyAccrual(date);
      res.json({ data: result });
    } catch (err) {
      throw err;
    }
  }),
);

export default router;
