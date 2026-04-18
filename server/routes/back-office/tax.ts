/**
 * Tax Engine API Routes (Phase 3D)
 *
 * Endpoints for tax event management, WHT calculation,
 * BIR form generation, FATCA/CRS reporting, and 1601-FQ filing.
 *
 *   GET    /events           -- Tax events with filters
 *   GET    /summary          -- Tax summary for a period
 *   POST   /calculate-wht    -- Calculate WHT for a trade
 *   POST   /bir/:formType    -- Generate BIR form (2306/2307/2316)
 *   POST   /fatca/:year      -- Generate FATCA report
 *   POST   /crs/:year        -- Generate CRS report
 *   POST   /1601fq/:month    -- Generate 1601-FQ monthly filing
 */

import { Router } from 'express';
import { taxEngineService } from '../../services/tax-engine-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// Static routes (MUST come before parameterized routes)
// ============================================================================

/** GET /events -- Tax events with filters */
router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const result = await taxEngineService.getTaxEvents({
      portfolioId: req.query.portfolioId as string | undefined,
      taxType: req.query.taxType as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    });
    res.json(result);
  }),
);

/** GET /summary -- Tax summary for a period */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const periodFrom = req.query.periodFrom as string;
    const periodTo = req.query.periodTo as string;

    if (!periodFrom || !periodTo) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'periodFrom and periodTo query params are required (YYYY-MM-DD)',
        },
      });
    }

    const result = await taxEngineService.getTaxSummary(periodFrom, periodTo);
    res.json({ data: result });
  }),
);

/** POST /calculate-wht -- Calculate WHT for a trade */
router.post(
  '/calculate-wht',
  asyncHandler(async (req, res) => {
    const { tradeId } = req.body;
    if (!tradeId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'tradeId is required' },
      });
    }

    const result = await taxEngineService.calculateWHT(tradeId);
    res.status(201).json({ data: result });
  }),
);

// ============================================================================
// Parameterized routes
// ============================================================================

/** POST /bir/:formType -- Generate BIR form */
router.post(
  '/bir/:formType',
  asyncHandler(async (req, res) => {
    const formType = req.params.formType as '2306' | '2307' | '2316';
    if (!['2306', '2307', '2316'].includes(formType)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'formType must be 2306, 2307, or 2316',
        },
      });
    }

    const { portfolioId, periodFrom, periodTo } = req.body;
    if (!periodFrom || !periodTo) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'periodFrom and periodTo are required (YYYY-MM-DD)',
        },
      });
    }

    const result = await taxEngineService.generateBIRForm(formType, {
      portfolioId,
      periodFrom,
      periodTo,
    });
    res.status(201).json({ data: result });
  }),
);

/** POST /fatca/:year -- Generate FATCA report */
router.post(
  '/fatca/:year',
  asyncHandler(async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'year must be a valid 4-digit year' },
      });
    }

    const result = await taxEngineService.generateFATCAReport(year);
    res.status(201).json({ data: result });
  }),
);

/** POST /crs/:year -- Generate CRS report */
router.post(
  '/crs/:year',
  asyncHandler(async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'year must be a valid 4-digit year' },
      });
    }

    const result = await taxEngineService.generateCRSReport(year);
    res.status(201).json({ data: result });
  }),
);

/** POST /1601fq/:month -- Generate 1601-FQ monthly filing */
router.post(
  '/1601fq/:month',
  asyncHandler(async (req, res) => {
    const month = req.params.month;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'month must be in YYYY-MM format',
        },
      });
    }

    const result = await taxEngineService.generate1601FQ(month);
    res.status(201).json({ data: result });
  }),
);

export default router;
