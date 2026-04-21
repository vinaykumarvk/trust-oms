/**
 * Suitability Assessment API Routes
 *
 * Provides endpoints for client suitability profiling and order checks:
 *   POST /api/v1/suitability/:clientId/capture    — Capture/update suitability profile
 *   GET  /api/v1/suitability/:clientId/current     — Get current suitability profile
 *   GET  /api/v1/suitability/:clientId/history     — Get suitability profile history
 *   POST /api/v1/suitability/check-order/:orderId  — Check order suitability
 */

import { Router } from 'express';
import { suitabilityService } from '../services/suitability-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

/** POST /api/v1/suitability/:clientId/capture */
router.post('/:clientId/capture', asyncHandler(async (req, res) => {
  const profile = await suitabilityService.captureSuitabilityProfile(req.params.clientId, req.body);
  const riskProfile = suitabilityService.scoreSuitability(req.body);
  res.json({ data: { profile, riskProfile } });
}));

/** GET /api/v1/suitability/:clientId/current */
router.get('/:clientId/current', asyncHandler(async (req, res) => {
  const profile = await suitabilityService.getCurrentProfile(req.params.clientId);
  if (!profile) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No suitability profile found' } });
  }
  res.json({ data: profile });
}));

/** GET /api/v1/suitability/:clientId/history */
router.get('/:clientId/history', asyncHandler(async (req, res) => {
  const history = await suitabilityService.getProfileHistory(req.params.clientId);
  res.json({ data: history, total: history.length });
}));

/** POST /api/v1/suitability/check-order/:orderId */
router.post('/check-order/:orderId', asyncHandler(async (req, res) => {
  const result = await suitabilityService.checkOrderSuitability(req.params.orderId);
  res.json({ data: result });
}));

export default router;
