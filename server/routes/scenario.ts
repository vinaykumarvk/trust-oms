/**
 * Scenario Engine & ESG API Routes (Phase 6B)
 *
 * Top-level routes at /api/v1/scenario:
 *   POST /analyze                       -- What-if impact analysis
 *   GET  /history/:portfolioId          -- Scenario simulation history
 *   GET  /esg/security/:securityId      -- Individual security ESG score
 *   GET  /esg/portfolio/:portfolioId    -- Portfolio-level ESG scores
 *   GET  /esg/breakdown/:portfolioId    -- Detailed ESG breakdown per holding
 *   GET  /esg/screening/:portfolioId    -- ESG exclusion screening
 */

import { Router } from 'express';
import { scenarioEngineService } from '../services/scenario-engine-service';
import { esgService } from '../services/esg-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// ---------------------------------------------------------------------------
// What-If Scenario Analysis
// ---------------------------------------------------------------------------

/** POST /api/v1/scenario/analyze -- Analyze trade impact on portfolio */
router.post('/analyze', asyncHandler(async (req, res) => {
  const { portfolioId, proposedOrder } = req.body;

  if (!portfolioId || !proposedOrder) {
    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'portfolioId and proposedOrder are required',
      },
    });
  }

  if (!proposedOrder.securityId || !proposedOrder.side || !proposedOrder.quantity || !proposedOrder.price) {
    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'proposedOrder must include securityId, side, quantity, and price',
      },
    });
  }

  const result = await scenarioEngineService.analyzeImpact(portfolioId, {
    securityId: Number(proposedOrder.securityId),
    side: String(proposedOrder.side).toUpperCase(),
    quantity: Number(proposedOrder.quantity),
    price: Number(proposedOrder.price),
  });

  res.json(result);
}));

/** GET /api/v1/scenario/history/:portfolioId -- Recent simulation history */
router.get('/history/:portfolioId', asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  const history = await scenarioEngineService.getScenarioHistory(portfolioId);
  res.json({ data: history, total: history.length });
}));

// ---------------------------------------------------------------------------
// ESG Scoring
// ---------------------------------------------------------------------------

/** GET /api/v1/scenario/esg/security/:securityId -- Individual security ESG */
router.get('/esg/security/:securityId', asyncHandler(async (req, res) => {
  const securityId = parseInt(req.params.securityId, 10);
  if (isNaN(securityId)) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'securityId must be a number' },
    });
  }

  const score = await esgService.getESGScore(securityId);
  res.json(score);
}));

/** GET /api/v1/scenario/esg/portfolio/:portfolioId -- Portfolio ESG scores */
router.get('/esg/portfolio/:portfolioId', asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  const result = await esgService.getPortfolioESG(portfolioId);
  res.json(result);
}));

/** GET /api/v1/scenario/esg/breakdown/:portfolioId -- Detailed ESG breakdown */
router.get('/esg/breakdown/:portfolioId', asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  const result = await esgService.getESGBreakdown(portfolioId);
  res.json(result);
}));

/** GET /api/v1/scenario/esg/screening/:portfolioId -- ESG exclusion screening */
router.get('/esg/screening/:portfolioId', asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  const result = await esgService.getESGScreening(portfolioId);
  res.json(result);
}));

export default router;
