/**
 * fiduciary-extensions.ts — Routes for MB-GAP-025, MB-GAP-027, MB-GAP-028
 *
 * Proxy registration, life insurance trusts, UITF switching & documents.
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  proxyRegistrationService,
  lifeInsuranceTrustService,
  uitfSwitchingService,
  uitfDocumentService,
} from '../../services/fiduciary-extensions-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

// ─── MB-GAP-025: Proxy Registration ──────────────────────────────────────────

router.post('/proxy-registrations', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const data = await proxyRegistrationService.registerProxy({ ...req.body, userId: String(userId) });
  res.status(201).json({ data });
}));

router.get('/proxy-registrations/:meetingId', asyncHandler(async (req, res) => {
  const data = await proxyRegistrationService.listProxies(req.params.meetingId);
  res.json({ data });
}));

router.post('/proxy-registrations/:proxyId/validate', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const proxyId = parseInt(req.params.proxyId, 10);
  if (isNaN(proxyId)) return res.status(400).json({ error: 'Invalid proxyId' });
  const data = await proxyRegistrationService.validateProxy(proxyId, String(userId));
  res.json({ data });
}));

router.get('/proxy-registrations/:meetingId/tabulate', asyncHandler(async (req, res) => {
  const data = await proxyRegistrationService.tabulateVotes(req.params.meetingId);
  res.json({ data });
}));

// ─── MB-GAP-027: Life Insurance Trusts ───────────────────────────────────────

router.post('/life-insurance', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await lifeInsuranceTrustService.createTrust({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/life-insurance', asyncHandler(async (req, res) => {
  const data = await lifeInsuranceTrustService.listTrusts(req.query.client_id as string);
  res.json({ data });
}));

router.get('/life-insurance/:trustId', asyncHandler(async (req, res) => {
  try {
    const data = await lifeInsuranceTrustService.getTrust(req.params.trustId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.patch('/life-insurance/:trustId', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await lifeInsuranceTrustService.updateTrust(req.params.trustId, req.body, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/life-insurance/:trustId/premium-schedule', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const periods = parseInt(req.body.periods ?? '12', 10);
  try {
    const data = await lifeInsuranceTrustService.generatePremiumSchedule(req.params.trustId, periods, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/life-insurance-premiums/overdue', asyncHandler(async (_req, res) => {
  const data = await lifeInsuranceTrustService.getOverduePremiums();
  res.json({ data });
}));

router.post('/life-insurance-premiums/:premiumId/pay', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const premiumId = parseInt(req.params.premiumId, 10);
  if (isNaN(premiumId)) return res.status(400).json({ error: 'Invalid premiumId' });
  try {
    const data = await lifeInsuranceTrustService.markPremiumPaid(premiumId, req.body.reference ?? '', String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── MB-GAP-028: UITF Switching ──────────────────────────────────────────────

router.post('/uitf/switch', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await uitfSwitchingService.processSwitch({ ...req.body, userId: String(userId) });
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/uitf/switch/:switchingId/execute', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await uitfSwitchingService.executeSwitch(req.params.switchingId, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/uitf/switchings', asyncHandler(async (req, res) => {
  const data = await uitfSwitchingService.listSwitchings(req.query.investor_id as string);
  res.json({ data });
}));

// ─── MB-GAP-028: UITF Documents (PTA/COT/TOF) ──────────────────────────────

router.post('/uitf/documents', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await uitfDocumentService.generateDocument({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/uitf/documents', asyncHandler(async (req, res) => {
  const data = await uitfDocumentService.listDocuments({
    portfolio_id: req.query.portfolio_id as string,
    investor_id: req.query.investor_id as string,
    document_type: req.query.document_type as string,
  });
  res.json({ data });
}));

router.post('/uitf/documents/:docId/deliver', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const docId = parseInt(req.params.docId, 10);
  if (isNaN(docId)) return res.status(400).json({ error: 'Invalid docId' });
  try {
    const data = await uitfDocumentService.markDelivered(docId, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/uitf/navpu-notifications', asyncHandler(async (_req, res) => {
  const data = await uitfDocumentService.getPendingNavpuNotifications();
  res.json({ data });
}));

export default router;
