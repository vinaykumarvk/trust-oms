/**
 * Fee Engine API Routes (Phase 3C)
 *
 * Provides endpoints for fee schedule management, daily accruals,
 * billing period processing, invoice management, waivers, and
 * UITF TER calculation.
 *
 *   GET    /schedules              -- List fee schedules (?portfolioId)
 *   POST   /schedules              -- Define schedule
 *   GET    /invoices               -- List invoices (?portfolioId, status, page, pageSize)
 *   POST   /accruals/run           -- Run daily accrual (body: { date })
 *   POST   /billing/run            -- Run billing period (body: { periodFrom, periodTo })
 *   POST   /invoices/:id/waive     -- Process waiver (body: { reason, waivedBy })
 *   GET    /accruals/status        -- Accrual status (?date)
 *   GET    /ter/:portfolioId       -- Calculate UITF TER (?periodFrom, periodTo)
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { feeEngineService } from '../../services/fee-engine-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// Summary
// ============================================================================

/** GET /summary -- Fee engine summary */
router.get('/summary', asyncHandler(async (req: any, res: any) => {
  const summary = await feeEngineService.getSummary();
  res.json(summary);
}));

// ============================================================================
// Fee Schedules
// ============================================================================

/** GET /schedules -- List fee schedules */
router.get(
  '/schedules',
  asyncHandler(async (req, res) => {
    const portfolioId = req.query.portfolioId as string | undefined;
    const data = await feeEngineService.getSchedules(portfolioId);
    res.json({ data });
  }),
);

/** POST /schedules -- Define a new fee schedule */
router.post(
  '/schedules',
  asyncHandler(async (req, res) => {
    const { portfolioId, feeType, method, ratePct, tieredRates, effectiveFrom, effectiveTo } =
      req.body;

    if (!portfolioId || !feeType || !method || !effectiveFrom) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId, feeType, method, and effectiveFrom are required',
        },
      });
    }

    const schedule = await feeEngineService.defineSchedule({
      portfolioId,
      feeType,
      method,
      ratePct,
      tieredRates,
      effectiveFrom,
      effectiveTo,
    });

    res.status(201).json({ data: schedule });
  }),
);

// ============================================================================
// Accruals
// ============================================================================

/** POST /accruals/run -- Run daily accrual */
router.post(
  '/accruals/run',
  asyncHandler(async (req, res) => {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date is required (YYYY-MM-DD)',
        },
      });
    }

    const result = await feeEngineService.runDailyAccrual(date);
    res.status(201).json({ data: result });
  }),
);

/** GET /accruals/status -- Accrual status for a given date */
router.get(
  '/accruals/status',
  asyncHandler(async (req, res) => {
    const date = req.query.date as string | undefined;
    const result = await feeEngineService.getAccrualStatus(date);
    res.json({ data: result });
  }),
);

// ============================================================================
// Billing & Invoices
// ============================================================================

/** POST /billing/run -- Run billing period to generate invoices */
router.post(
  '/billing/run',
  asyncHandler(async (req, res) => {
    const { periodFrom, periodTo } = req.body;
    if (!periodFrom || !periodTo) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'periodFrom and periodTo are required (YYYY-MM-DD)',
        },
      });
    }

    const result = await feeEngineService.runBillingPeriod(
      periodFrom,
      periodTo,
    );
    res.status(201).json({ data: result });
  }),
);

/** GET /invoices -- List invoices with optional filters */
router.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const filters = {
      portfolioId: req.query.portfolioId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };
    const result = await feeEngineService.getInvoices(filters);
    res.json(result);
  }),
);

/** POST /invoices/:id/waive -- Process a fee waiver */
router.post(
  '/invoices/:id/waive',
  asyncHandler(async (req: any, res: any) => {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid invoice ID' },
      });
    }

    const { reason } = req.body;
    const waivedBy = req.body.waivedBy || req.userId || 'system';
    if (!reason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'reason is required',
        },
      });
    }

    const result = await feeEngineService.processWaiver(
      invoiceId,
      reason,
      parseInt(waivedBy, 10),
    );
    res.json({ data: result });
  }),
);

// ============================================================================
// UITF TER
// ============================================================================

/** GET /ter/:portfolioId -- Calculate UITF Total Expense Ratio */
router.get(
  '/ter/:portfolioId',
  asyncHandler(async (req: any, res: any) => {
    const { portfolioId } = req.params;
    const periodFrom = (req.query.periodFrom || req.query.from) as string;
    const periodTo = (req.query.periodTo || req.query.to) as string;

    if (!periodFrom || !periodTo) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'periodFrom and periodTo query parameters are required',
        },
      });
    }

    const result = await feeEngineService.calculateUITFTER(
      portfolioId,
      periodFrom,
      periodTo,
    );
    res.json({ data: result });
  }),
);

export default router;
