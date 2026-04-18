/**
 * NAV & Fund Accounting API Routes (Phase 2C)
 *
 * Provides endpoints for NAV computation, validation, publishing,
 * and unit issuance/redemption for UITF funds.
 *
 *   GET    /api/v1/nav/status                    -- All funds' NAV status
 *   POST   /api/v1/nav/compute/:portfolioId      -- Compute NAV
 *   POST   /api/v1/nav/units/issue               -- Issue units (UITF subscription)
 *   POST   /api/v1/nav/units/redeem              -- Redeem units (UITF withdrawal)
 *   POST   /api/v1/nav/units/reconcile           -- Reconcile units
 *   GET    /api/v1/nav/:portfolioId/history       -- NAV history
 *   POST   /api/v1/nav/:id/validate              -- Validate NAV
 *   POST   /api/v1/nav/:id/publish               -- Publish NAV
 */

import { Router } from 'express';
import { navService } from '../services/nav-service';
import { unitService } from '../services/unit-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// ---------------------------------------------------------------
// Static / prefix routes MUST come before parameterized routes
// to avoid route shadowing.
// ---------------------------------------------------------------

/** GET /status -- All funds' NAV status for a given date */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const navDate = req.query.date as string | undefined;
    const result = await navService.getNavStatus(navDate);
    res.json({ data: result, total: result.length });
  }),
);

/** POST /compute/:portfolioId -- Compute NAV for a portfolio */
router.post(
  '/compute/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const { navDate } = req.body;
    if (!navDate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'navDate is required in request body (YYYY-MM-DD)',
        },
      });
    }
    const result = await navService.computeNav(portfolioId, navDate);
    res.status(201).json({ data: result });
  }),
);

/** POST /units/issue -- Issue units for a UITF subscription */
router.post(
  '/units/issue',
  asyncHandler(async (req, res) => {
    const { portfolioId, amount, investorId, transactionDate } = req.body;
    if (!portfolioId || !amount || !investorId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId, amount, and investorId are required',
        },
      });
    }
    const result = await unitService.issueUnits({
      portfolioId,
      amount: parseFloat(amount),
      investorId,
      transactionDate,
    });
    res.status(201).json({ data: result });
  }),
);

/** POST /units/redeem -- Redeem units for a UITF withdrawal */
router.post(
  '/units/redeem',
  asyncHandler(async (req, res) => {
    const { portfolioId, units, investorId, transactionDate } = req.body;
    if (!portfolioId || !units || !investorId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId, units, and investorId are required',
        },
      });
    }
    const result = await unitService.redeemUnits({
      portfolioId,
      units: parseFloat(units),
      investorId,
      transactionDate,
    });
    res.status(201).json({ data: result });
  }),
);

/** POST /units/reconcile -- Reconcile units for a portfolio */
router.post(
  '/units/reconcile',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.body;
    if (!portfolioId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId is required',
        },
      });
    }
    const result = await unitService.reconcileUnits(portfolioId);
    res.json({ data: result });
  }),
);

// ---------------------------------------------------------------
// Parameterized routes (must come AFTER static routes)
// ---------------------------------------------------------------

/** GET /:portfolioId/history -- NAV history for a portfolio */
router.get(
  '/:portfolioId/history',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const history = await navService.getNavHistory(
      portfolioId,
      startDate,
      endDate,
    );
    res.json({ data: history, total: history.length });
  }),
);

/** POST /:id/validate -- Validate NAV */
router.post(
  '/:id/validate',
  asyncHandler(async (req, res) => {
    const navId = parseInt(req.params.id, 10);
    if (isNaN(navId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid NAV id' },
      });
    }
    const result = await navService.validateNav(navId);
    res.json({ data: result });
  }),
);

/** POST /:id/publish -- Publish NAV */
router.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const navId = parseInt(req.params.id, 10);
    if (isNaN(navId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid NAV id' },
      });
    }
    const { publishedBy } = req.body;
    if (!publishedBy) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'publishedBy (user id) is required',
        },
      });
    }
    const result = await navService.publishNav(
      navId,
      parseInt(publishedBy, 10),
    );
    res.json({ data: result });
  }),
);

export default router;
