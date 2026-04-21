/**
 * Risk Analytics API Routes (Phase 3J)
 *
 * BDO RFI Gap #6 — Risk Analytics.
 *
 *   POST   /var/compute                    -- Compute VaR
 *   POST   /var/backtest                   -- Back-test VaR
 *   POST   /var/backtest-income            -- Back-test vs theoretical income
 *   GET    /duration/macaulay/:portfolioId -- Macaulay duration
 *   GET    /duration/modified/:portfolioId -- Modified duration
 *   GET    /duration/benchmark/:benchmarkId-- Benchmark duration
 *   POST   /irep/disposition               -- Capture client disposition
 *   GET    /irep/price-movement/:securityId-- Check price movement
 *   GET    /irep/dashboard                 -- IREP dashboard
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { varService } from '../../services/var-service';
import { durationService } from '../../services/duration-service';
import { irepService } from '../../services/irep-service';

const router = Router();
router.use(requireBackOfficeRole());

// =============================================================================
// VaR (Value at Risk)
// =============================================================================

/** POST /var/compute -- Compute VaR for a portfolio */
router.post(
  '/var/compute',
  asyncHandler(async (req, res) => {
    const { portfolioId, method, confidenceLevel, horizon } = req.body;

    if (!portfolioId || !method) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId and method are required',
        },
      });
    }

    const validMethods = ['HISTORICAL', 'PARAMETRIC', 'MONTE_CARLO'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `method must be one of: ${validMethods.join(', ')}`,
        },
      });
    }

    const result = await varService.computeVAR(
      portfolioId,
      method,
      confidenceLevel,
      horizon,
    );

    res.json({ data: result });
  }),
);

/** POST /var/backtest -- Back-test VaR predictions */
router.post(
  '/var/backtest',
  asyncHandler(async (req, res) => {
    const { portfolioId, period } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId is required',
        },
      });
    }

    const result = await varService.backTestVAR(portfolioId, period);
    res.json({ data: result });
  }),
);

/** POST /var/backtest-income -- Back-test vs theoretical income */
router.post(
  '/var/backtest-income',
  asyncHandler(async (req, res) => {
    const { portfolioId, period } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId is required',
        },
      });
    }

    const result = await varService.backTestVsTheoreticalIncome(
      portfolioId,
      period,
    );
    res.json({ data: result });
  }),
);

// =============================================================================
// Duration Analytics
// =============================================================================

/** GET /duration/macaulay/:portfolioId -- Macaulay duration */
router.get(
  '/duration/macaulay/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const asOfDate = req.query.asOfDate as string | undefined;

    const result = await durationService.computeMacaulayDuration(
      portfolioId,
      asOfDate,
    );
    res.json({ data: result });
  }),
);

/** GET /duration/modified/:portfolioId -- Modified duration */
router.get(
  '/duration/modified/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const asOfDate = req.query.asOfDate as string | undefined;

    const result = await durationService.computeModifiedDuration(
      portfolioId,
      asOfDate,
    );
    res.json({ data: result });
  }),
);

/** GET /duration/benchmark/:benchmarkId -- Benchmark duration */
router.get(
  '/duration/benchmark/:benchmarkId',
  asyncHandler(async (req, res) => {
    const { benchmarkId } = req.params;
    const asOfDate = req.query.asOfDate as string | undefined;

    const result = await durationService.computeBenchmarkDuration(
      benchmarkId,
      asOfDate,
    );
    res.json({ data: result });
  }),
);

// =============================================================================
// IREP (Investment Risk Evaluation Process)
// =============================================================================

/** POST /irep/disposition -- Capture client disposition */
router.post(
  '/irep/disposition',
  asyncHandler(async (req, res) => {
    const { clientId, priceMovementPct, disposition } = req.body;

    if (!clientId || priceMovementPct === undefined || !disposition) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'clientId, priceMovementPct, and disposition are required',
        },
      });
    }

    const validDispositions = ['HOLD', 'SELL', 'BUY_MORE'];
    if (!validDispositions.includes(disposition)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `disposition must be one of: ${validDispositions.join(', ')}`,
        },
      });
    }

    const result = await irepService.captureClientDisposition(
      clientId,
      priceMovementPct,
      disposition,
    );

    res.status(201).json({ data: result });
  }),
);

/** GET /irep/price-movement/:securityId -- Check price movement threshold */
router.get(
  '/irep/price-movement/:securityId',
  asyncHandler(async (req, res) => {
    const securityId = parseInt(req.params.securityId, 10);
    if (isNaN(securityId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid security ID' },
      });
    }

    const threshold = req.query.threshold
      ? parseFloat(req.query.threshold as string)
      : undefined;

    const result = await irepService.checkPriceMovementThreshold(
      securityId,
      threshold,
    );
    res.json({ data: result });
  }),
);

/** GET /irep/dashboard -- IREP dashboard */
router.get(
  '/irep/dashboard',
  asyncHandler(async (_req, res) => {
    const result = await irepService.getIREPDashboard();
    res.json({ data: result });
  }),
);

export default router;
