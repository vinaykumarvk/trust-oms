/**
 * P2/P3 Gap Closure Routes — Medium/Low priority functional gaps
 *
 * Mounted at /api/v1/p2-gaps
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  glAuthQueueService,
  caRecurringEventService,
  caAnomalyService,
  navIngestionService,
  allocationDriftService,
  meetingDuplicateService,
  negativeListAuditService,
  leadStatusAuditService,
} from '../../services/p2-gap-closure-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

function getUserId(req: any): string | null {
  return (req as any).user?.id ? String((req as any).user.id) : null;
}

// ============================================================================
// GL-AUTH-005: Authorization Queue Filter
// ============================================================================

router.get('/auth-queue', asyncHandler(async (req, res) => {
  const data = await glAuthQueueService.getFilteredQueue({
    module: req.query.module as string,
    program: req.query.program as string,
    user_id: req.query.user_id ? parseInt(req.query.user_id as string) : undefined,
    status: req.query.status as string,
  });
  res.json({ data });
}));

// ============================================================================
// CA-FR-005: Recurring CA Event Creation
// ============================================================================

router.post('/ca-recurring', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { business_date } = req.body;
  if (!business_date) return res.status(400).json({ error: 'business_date required' });
  try {
    const data = await caRecurringEventService.checkAndCreateRecurring(business_date, parseInt(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ============================================================================
// CA-FR-040p: Anomaly Detection
// ============================================================================

router.get('/ca-anomaly/:securityId', asyncHandler(async (req, res) => {
  const securityId = parseInt(req.params.securityId, 10);
  if (isNaN(securityId)) return res.status(400).json({ error: 'Invalid security_id' });
  const data = await caAnomalyService.detectRateAnomalies(securityId);
  res.json({ data });
}));

// ============================================================================
// FR-NAV-001p: NAV Ingestion EOD
// ============================================================================

router.post('/nav-ingestion', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { business_date } = req.body;
  if (!business_date) return res.status(400).json({ error: 'business_date required' });
  const data = await navIngestionService.runEodIngestion(business_date, parseInt(userId));
  res.json({ data });
}));

// ============================================================================
// RP-009: Portfolio Allocation Drift
// ============================================================================

router.get('/allocation-drift/:portfolioId', asyncHandler(async (req, res) => {
  const data = await allocationDriftService.evaluateDrift(req.params.portfolioId);
  res.json({ data });
}));

// ============================================================================
// CAL-024: Duplicate Meeting Detection
// ============================================================================

router.get('/meeting-duplicate-check', asyncHandler(async (req, res) => {
  const rmId = parseInt(req.query.rm_id as string);
  const startTime = req.query.start_time as string;
  if (isNaN(rmId) || !startTime) return res.status(400).json({ error: 'rm_id and start_time required' });
  const data = await meetingDuplicateService.checkDuplicate(rmId, startTime);
  res.json({ data });
}));

// ============================================================================
// LP-03: Negative List Audit
// ============================================================================

router.post('/negative-list-audit', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { client_id, result } = req.body;
  if (!client_id || !result) return res.status(400).json({ error: 'client_id and result required' });
  const data = await negativeListAuditService.logCheck(client_id, result, userId);
  res.json({ data });
}));

// ============================================================================
// LP-04: Lead Status Audit
// ============================================================================

router.post('/lead-status-audit', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { lead_id, from_status, to_status } = req.body;
  if (!lead_id || !to_status) return res.status(400).json({ error: 'lead_id and to_status required' });
  const data = await leadStatusAuditService.logStatusChange(parseInt(lead_id), from_status ?? '', to_status, userId);
  res.json({ data });
}));

export default router;
