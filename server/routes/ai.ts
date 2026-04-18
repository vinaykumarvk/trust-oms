/**
 * AI Suitability & Intelligent Order Routing API Routes (Phase 6C)
 *
 * Provides endpoints for:
 *   POST /api/v1/ai/suitability/predict              — Predict risk profile via AI engine
 *   GET  /api/v1/ai/suitability/explain/:predictionId — Explain a prediction
 *   GET  /api/v1/ai/suitability/shadow/:clientId      — Run shadow-mode comparison
 *   GET  /api/v1/ai/suitability/metrics               — Get model performance metrics
 *   GET  /api/v1/ai/suitability/history               — Get prediction history
 *   GET  /api/v1/ai/suitability/shadow-results        — Get all shadow results
 *   POST /api/v1/ai/routing/recommend                 — Get broker recommendation
 *   GET  /api/v1/ai/routing/quality/:brokerId         — Broker execution quality
 *   GET  /api/v1/ai/routing/leaderboard               — Broker leaderboard
 *   GET  /api/v1/ai/routing/decisions                 — Routing decision log
 *   GET  /api/v1/ai/routing/brokers                   — List brokers
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { aiSuitabilityService } from '../services/ai-suitability-service';
import { intelligentRoutingService } from '../services/intelligent-routing-service';

const router = Router();

// ---------------------------------------------------------------------------
// AI Suitability Endpoints
// ---------------------------------------------------------------------------

/** POST /suitability/predict — Predict risk profile from client features */
router.post('/suitability/predict', asyncHandler(async (req, res) => {
  const { clientId, ...features } = req.body;
  const prediction = aiSuitabilityService.predictRiskProfile(features, clientId);
  res.json(prediction);
}));

/** GET /suitability/explain/:predictionId — Explain a prediction */
router.get('/suitability/explain/:predictionId', asyncHandler(async (req, res) => {
  const explanation = aiSuitabilityService.explainPrediction(req.params.predictionId);
  if (!explanation) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prediction not found' } });
  }
  res.json(explanation);
}));

/** GET /suitability/shadow/:clientId — Run shadow-mode comparison */
router.get('/suitability/shadow/:clientId', asyncHandler(async (req, res) => {
  const result = await aiSuitabilityService.shadowMode(req.params.clientId);
  res.json(result);
}));

/** GET /suitability/metrics — Get model performance metrics */
router.get('/suitability/metrics', asyncHandler(async (_req, res) => {
  const metrics = aiSuitabilityService.getModelMetrics();
  res.json(metrics);
}));

/** GET /suitability/history — Get prediction history */
router.get('/suitability/history', asyncHandler(async (req, res) => {
  const { clientId, page, pageSize } = req.query;
  const result = aiSuitabilityService.getPredictionHistory({
    clientId: clientId as string | undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

/** GET /suitability/shadow-results — Get all shadow mode results */
router.get('/suitability/shadow-results', asyncHandler(async (_req, res) => {
  const results = aiSuitabilityService.getShadowResults();
  res.json({ data: results, total: results.length });
}));

// ---------------------------------------------------------------------------
// Intelligent Routing Endpoints
// ---------------------------------------------------------------------------

/** POST /routing/recommend — Get broker recommendation */
router.post('/routing/recommend', asyncHandler(async (req, res) => {
  const { securityId, quantity, side } = req.body;
  if (!securityId || !quantity || !side) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'securityId, quantity, and side are required' },
    });
  }
  const result = intelligentRoutingService.recommendBroker(
    Number(securityId),
    Number(quantity),
    String(side).toUpperCase(),
  );
  res.json(result);
}));

/** GET /routing/quality/:brokerId — Broker execution quality analytics */
router.get('/routing/quality/:brokerId', asyncHandler(async (req, res) => {
  const period = (req.query.period as string) ?? 'ALL';
  const result = intelligentRoutingService.analyzeExecutionQuality(req.params.brokerId, period);
  if (!result) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Broker not found' } });
  }
  res.json(result);
}));

/** GET /routing/leaderboard — Broker leaderboard */
router.get('/routing/leaderboard', asyncHandler(async (_req, res) => {
  const leaderboard = intelligentRoutingService.getBrokerLeaderboard();
  res.json({ data: leaderboard, total: leaderboard.length });
}));

/** GET /routing/decisions — Routing decision log */
router.get('/routing/decisions', asyncHandler(async (req, res) => {
  const { brokerId, side, outcome, page, pageSize } = req.query;
  const result = intelligentRoutingService.getRoutingDecisionLog({
    brokerId: brokerId as string | undefined,
    side: side as string | undefined,
    outcome: outcome as string | undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

/** GET /routing/brokers — List all brokers */
router.get('/routing/brokers', asyncHandler(async (_req, res) => {
  const brokers = intelligentRoutingService.getBrokers();
  res.json({ data: brokers, total: brokers.length });
}));

export default router;
