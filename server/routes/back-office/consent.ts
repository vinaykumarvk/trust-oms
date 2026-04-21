import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { consentService } from '../../services/consent-service';

const router = Router();

router.get('/client/:clientId', asyncHandler(async (req: any, res: any) => {
  const consents = await consentService.getClientConsents(req.params.clientId);
  res.json({ data: consents });
}));

router.get('/check/:clientId/:purpose', asyncHandler(async (req: any, res: any) => {
  const hasConsent = await consentService.checkConsent(req.params.clientId, req.params.purpose);
  res.json({ hasConsent });
}));

router.post('/', asyncHandler(async (req: any, res: any) => {
  const { clientId, purpose, channelScope, legalBasis, dpaRef } = req.body;
  if (!clientId || !purpose || !legalBasis || !dpaRef) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const result = await consentService.grantConsent(req.body);
  res.status(201).json(result);
}));

router.put('/:consentId/withdraw', asyncHandler(async (req: any, res: any) => {
  const result = await consentService.withdrawConsent(req.params.consentId);
  res.json(result);
}));

router.post('/erasure/:clientId', asyncHandler(async (req: any, res: any) => {
  const result = await consentService.requestErasure(req.params.clientId);
  res.json(result);
}));

router.post('/erasure/:clientId/process', asyncHandler(async (req: any, res: any) => {
  const result = await consentService.processErasure(req.params.clientId);
  res.json(result);
}));

router.get('/erasure-queue', asyncHandler(async (req: any, res: any) => {
  const queue = await consentService.getErasureQueue();
  res.json({ data: queue, total: queue.length });
}));

export default router;
