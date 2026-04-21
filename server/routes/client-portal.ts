/**
 * Client Portal API Routes (Phase 5C)
 *
 * Self-service endpoints for the client-facing portal:
 *   GET  /api/v1/client-portal/portfolio-summary/:clientId  -- Portfolio summary
 *   GET  /api/v1/client-portal/allocation/:portfolioId      -- Asset allocation
 *   GET  /api/v1/client-portal/performance/:portfolioId     -- Performance (TWR/IRR)
 *   GET  /api/v1/client-portal/holdings/:portfolioId        -- Detailed holdings
 *   GET  /api/v1/client-portal/transactions/:portfolioId    -- Recent transactions
 *   GET  /api/v1/client-portal/statements/:clientId         -- Available statements
 *   POST /api/v1/client-portal/request-action               -- Request an action
 *   GET  /api/v1/client-portal/notifications/:clientId      -- Notifications
 */

import { Router } from 'express';
import { clientPortalService } from '../services/client-portal-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// ---------------------------------------------------------------------------
// Portfolio Summary
// ---------------------------------------------------------------------------

/** GET /portfolio-summary/:clientId -- Aggregated portfolio overview */
router.get(
  '/portfolio-summary/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const data = await clientPortalService.getPortfolioSummary(clientId);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/** GET /allocation/:portfolioId -- Asset allocation breakdown */
router.get(
  '/allocation/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getAllocation(portfolioId);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/** GET /performance/:portfolioId?period=1Y -- TWR / IRR performance */
router.get(
  '/performance/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const period = (req.query.period as string) || '1Y';

    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getPerformance(portfolioId, period);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

/** GET /holdings/:portfolioId -- Detailed position list */
router.get(
  '/holdings/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getHoldings(portfolioId);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Recent Transactions
// ---------------------------------------------------------------------------

/** GET /transactions/:portfolioId -- Recent transactions */
router.get(
  '/transactions/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const limit = parseInt(String(req.query.limit ?? '20'), 10);

    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getRecentTransactions(
      portfolioId,
      Number.isNaN(limit) ? 20 : limit,
    );
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** GET /statements/:clientId -- Available statements list */
router.get(
  '/statements/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    const period = req.query.period as string | undefined;

    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const data = await clientPortalService.getStatements(clientId, period);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Action Request
// ---------------------------------------------------------------------------

/** POST /request-action -- Submit a client action request */
router.post(
  '/request-action',
  asyncHandler(async (req, res) => {
    const { clientId, actionType, details } = req.body;

    if (!clientId || !actionType) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'clientId and actionType are required',
        },
      });
    }

    const data = await clientPortalService.requestAction(
      clientId,
      actionType,
      details ?? {},
    );
    res.status(201).json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** GET /notifications/:clientId -- Client notifications */
router.get(
  '/notifications/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const data = await clientPortalService.getNotifications(clientId);
    res.json({ data });
  }),
);

export default router;
