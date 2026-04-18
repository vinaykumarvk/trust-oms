/**
 * KYC Management API Routes
 *
 * Provides endpoints for managing KYC lifecycle:
 *   GET  /api/v1/kyc/summary                — KYC dashboard summary stats
 *   GET  /api/v1/kyc/expiring?days=30       — KYC cases expiring within N days
 *   POST /api/v1/kyc/:clientId/initiate     — Initiate a new KYC case
 *   POST /api/v1/kyc/:clientId/verify       — Verify (approve) a pending KYC case
 *   POST /api/v1/kyc/:clientId/reject       — Reject a pending KYC case
 *   POST /api/v1/kyc/bulk-renewal           — Bulk renewal of KYC cases
 *   GET  /api/v1/kyc/:clientId/history      — KYC history for a client
 *   GET  /api/v1/kyc/:clientId/risk-rating  — Calculate risk rating for a client
 */

import { Router } from 'express';
import { type InferSelectModel } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { kycService } from '../../services/kyc-service';
import { asyncHandler } from '../../middleware/async-handler';

type KycCase = InferSelectModel<typeof schema.kycCases>;

const router = Router();

/** GET /api/v1/kyc/summary */
router.get('/summary', asyncHandler(async (_req, res) => {
  const summary = await kycService.getSummary();
  res.json(summary);
}));

/** GET /api/v1/kyc/expiring?days=30 */
router.get('/expiring', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days as string) || 30;
  const cases = await kycService.getExpiringKyc(days);
  res.json({ data: cases, total: cases.length });
}));

/** POST /api/v1/kyc/:clientId/initiate */
router.post('/:clientId/initiate', asyncHandler(async (req, res) => {
  const kycCase = await kycService.initiateKyc(req.params.clientId, req.body);
  res.status(201).json(kycCase);
}));

/** POST /api/v1/kyc/:clientId/verify */
router.post('/:clientId/verify', asyncHandler(async (req, res) => {
  // Find latest pending KYC case for client
  const history = await kycService.getKycHistory(req.params.clientId);
  const pendingCase = history.find((c: KycCase) => c.kyc_status === 'PENDING');
  if (!pendingCase) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No pending KYC case found' } });
  }
  const updated = await kycService.updateKycStatus(pendingCase.id, 'VERIFIED');
  res.json(updated);
}));

/** POST /api/v1/kyc/:clientId/reject */
router.post('/:clientId/reject', asyncHandler(async (req, res) => {
  const history = await kycService.getKycHistory(req.params.clientId);
  const pendingCase = history.find((c: KycCase) => c.kyc_status === 'PENDING');
  if (!pendingCase) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No pending KYC case found' } });
  }
  const updated = await kycService.updateKycStatus(pendingCase.id, 'REJECTED');
  res.json(updated);
}));

/** POST /api/v1/kyc/bulk-renewal */
router.post('/bulk-renewal', asyncHandler(async (req, res) => {
  const { clientIds } = req.body;
  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'clientIds array required' } });
  }
  const results = await kycService.bulkRenewal(clientIds);
  res.json({ data: results, total: results.length });
}));

/** GET /api/v1/kyc/:clientId/history */
router.get('/:clientId/history', asyncHandler(async (req, res) => {
  const history = await kycService.getKycHistory(req.params.clientId);
  res.json({ data: history, total: history.length });
}));

/** GET /api/v1/kyc/:clientId/risk-rating */
router.get('/:clientId/risk-rating', asyncHandler(async (req, res) => {
  const rating = await kycService.calculateRiskRating(req.params.clientId);
  res.json({ clientId: req.params.clientId, riskRating: rating });
}));

export default router;
