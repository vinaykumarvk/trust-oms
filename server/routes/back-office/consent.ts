import { Router } from 'express';
import { requireBackOfficeRole, requireAnyRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { consentService } from '../../services/consent-service';

const router = Router();
router.use(requireBackOfficeRole());

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

router.post('/erasure/:clientId/process', requireAnyRole('BO_HEAD', 'COMPLIANCE_OFFICER'), asyncHandler(async (req: any, res: any) => {
  const result = await consentService.processErasure(req.params.clientId);
  res.json(result);
}));

router.get('/erasure-queue', asyncHandler(async (req: any, res: any) => {
  const queue = await consentService.getErasureQueue();
  res.json({ data: queue, total: queue.length });
}));

// ============================================================================
// Breach Notifications (Phase 8E — Privacy / Data Protection)
// ============================================================================

/** GET /breach-notifications -- List breach notifications with optional status filter */
router.get('/breach-notifications', asyncHandler(async (req: any, res: any) => {
  const { status } = req.query;
  const data = await consentService.getBreachNotifications(
    status ? { status: status as string } : undefined,
  );
  res.json({ data, total: data.length });
}));

/** POST /breach-notifications -- Initiate a new breach notification */
router.post('/breach-notifications', requireAnyRole('BO_HEAD', 'COMPLIANCE_OFFICER'), asyncHandler(async (req: any, res: any) => {
  const { breach_type, affected_count, containment_log, remediation_plan } = req.body;
  if (!breach_type || !affected_count || !containment_log || !remediation_plan) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'breach_type, affected_count, containment_log, and remediation_plan are required' },
    });
  }

  const result = await consentService.initiateBreachNotification({
    breach_type,
    affected_count: parseInt(affected_count, 10),
    containment_log,
    remediation_plan,
  });
  res.status(201).json({ data: result });
}));

/** POST /breach-notifications/:id/notify-npc -- Notify the NPC for a breach */
router.post('/breach-notifications/:id/notify-npc', requireAnyRole('BO_HEAD', 'COMPLIANCE_OFFICER'), asyncHandler(async (req: any, res: any) => {
  const breachId = req.params.id;
  try {
    const result = await consentService.notifyNPC(breachId);
    res.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'NPC notification failed';
    return res.status(400).json({
      error: { code: 'NPC_NOTIFY_FAILED', message },
    });
  }
}));

export default router;
