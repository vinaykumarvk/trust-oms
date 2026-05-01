/**
 * metrobank-extensions.ts — Routes for remaining Metrobank gap closures
 *
 * MB-GAP-002: User admin guards
 * MB-GAP-005: Scheduler extensions
 * MB-GAP-010: Fee monitoring
 * MB-GAP-011: Performance calculation
 * MB-GAP-012: Fee waivers
 * MB-GAP-015: Standing payment instructions
 * MB-GAP-020: Check management extensions
 * MB-GAP-022: Document checklist workflow
 * MB-GAP-032: Regulatory report runs
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  userAdminGuardService,
  schedulerExtensionService,
  feeMonitoringService,
  performanceCalculationService,
  feeWaiverService,
  standingPaymentService,
  checkManagementExtService,
  documentChecklistService,
  regulatoryReportExtService,
} from '../../services/metrobank-gap-closures-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

// ─── MB-GAP-002: User Admin Guards ──────────────────────────────────────────

router.get('/users/:userId/deactivation-check', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' });
  const data = await userAdminGuardService.validateUserDeactivation(userId);
  res.json({ data });
}));

router.get('/users/:userId/authorizer-coverage', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' });
  const data = await userAdminGuardService.validateBranchAuthorizerCoverage(userId);
  res.json({ data });
}));

// ─── MB-GAP-005: Scheduler Extensions ───────────────────────────────────────

router.post('/scheduler/coupon-events', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { portfolioId } = req.body;
  if (!portfolioId) return res.status(400).json({ error: 'portfolioId required' });
  try {
    const data = await schedulerExtensionService.scheduleCouponEvents(portfolioId, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/scheduler/maturity-events', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { portfolioId, daysAhead } = req.body;
  if (!portfolioId) return res.status(400).json({ error: 'portfolioId required' });
  try {
    const data = await schedulerExtensionService.scheduleMaturityEvents(portfolioId, daysAhead ?? 90, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/scheduler/upcoming/:portfolioId', asyncHandler(async (req, res) => {
  const daysAhead = parseInt(req.query.days_ahead as string, 10) || 30;
  const data = await schedulerExtensionService.listUpcomingEvents(req.params.portfolioId, daysAhead);
  res.json({ data });
}));

// ─── MB-GAP-010: Fee Monitoring ─────────────────────────────────────────────

router.post('/fee-monitoring/check-deviations', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await feeMonitoringService.checkAumDeviations(String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/fee-monitoring/uncollected', asyncHandler(async (req, res) => {
  const ageDays = parseInt(req.query.age_days as string, 10) || 90;
  const data = await feeMonitoringService.getUncollectedFees(ageDays);
  res.json({ data });
}));

router.get('/fee-monitoring/alerts', asyncHandler(async (req, res) => {
  const data = await feeMonitoringService.listAlerts(req.query.portfolio_id as string);
  res.json({ data });
}));

router.post('/fee-monitoring/alerts/:alertId/acknowledge', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const alertId = parseInt(req.params.alertId, 10);
  if (isNaN(alertId)) return res.status(400).json({ error: 'Invalid alertId' });
  try {
    const data = await feeMonitoringService.acknowledgeAlert(alertId, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── MB-GAP-011: Performance Calculation ────────────────────────────────────

router.get('/performance/:portfolioId/twr', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });
  try {
    const data = await performanceCalculationService.computeTWR(
      req.params.portfolioId, start_date as string, end_date as string,
    );
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/performance/:portfolioId/irr', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });
  try {
    const data = await performanceCalculationService.computeIRR(
      req.params.portfolioId, start_date as string, end_date as string,
    );
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/performance/:portfolioId/snapshot', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const snapshotDate = req.body.snapshot_date || new Date().toISOString().split('T')[0];
  try {
    const data = await performanceCalculationService.snapshotPerformance(
      req.params.portfolioId, snapshotDate, String(userId),
    );
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/performance/:portfolioId/history', asyncHandler(async (req, res) => {
  const data = await performanceCalculationService.getPerformanceHistory(req.params.portfolioId);
  res.json({ data });
}));

// ─── MB-GAP-012: Fee Waivers ───────────────────────────────────────────────

router.post('/fee-waivers', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await feeWaiverService.requestWaiver({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/fee-waivers/:waiverId/approve', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const waiverId = parseInt(req.params.waiverId, 10);
  if (isNaN(waiverId)) return res.status(400).json({ error: 'Invalid waiverId' });
  try {
    const data = await feeWaiverService.approveWaiver(waiverId, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/fee-waivers/:waiverId/reject', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const waiverId = parseInt(req.params.waiverId, 10);
  if (isNaN(waiverId)) return res.status(400).json({ error: 'Invalid waiverId' });
  try {
    const data = await feeWaiverService.rejectWaiver(waiverId, req.body.rejection_reason, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/fee-waivers', asyncHandler(async (req, res) => {
  const data = await feeWaiverService.listWaivers({
    portfolioId: req.query.portfolio_id as string,
    clientId: req.query.client_id as string,
    status: req.query.status as string,
  });
  res.json({ data });
}));

// ─── MB-GAP-015: Standing Payment Instructions ─────────────────────────────

router.post('/standing-instructions', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await standingPaymentService.createInstruction({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/standing-instructions/:portfolioId', asyncHandler(async (req, res) => {
  const data = await standingPaymentService.listInstructions(req.params.portfolioId);
  res.json({ data });
}));

router.post('/standing-instructions/:id/suspend', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await standingPaymentService.suspendInstruction(id, req.body.reason ?? '', String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/standing-instructions/:id/resume', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await standingPaymentService.resumeInstruction(id, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/standing-instructions/:id/cancel', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await standingPaymentService.cancelInstruction(id, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/standing-instructions/execute-due', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await standingPaymentService.executeDueInstructions(String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── MB-GAP-020: Check Management Extensions ───────────────────────────────

router.post('/checks/:checkId/stop-payment', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const checkId = parseInt(req.params.checkId, 10);
  if (isNaN(checkId)) return res.status(400).json({ error: 'Invalid checkId' });
  try {
    const data = await checkManagementExtService.stopPayment(checkId, req.body.reason, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/checks/detect-stale', asyncHandler(async (_req, res) => {
  const data = await checkManagementExtService.detectStaleChecks();
  res.json({ data });
}));

router.post('/checks/reconcile', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await checkManagementExtService.reconcileChecks(req.body.reconciliations ?? [], String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/checks/outstanding', asyncHandler(async (req, res) => {
  const data = await checkManagementExtService.getOutstandingChecks(req.query.bank_account as string);
  res.json({ data });
}));

// ─── MB-GAP-022: Document Checklist ─────────────────────────────────────────

router.post('/document-checklists', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await documentChecklistService.createChecklist({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/document-checklists', asyncHandler(async (req, res) => {
  const data = await documentChecklistService.listChecklists(req.query.applies_to as string);
  res.json({ data });
}));

router.post('/document-checklists/assign', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await documentChecklistService.assignChecklist({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.patch('/document-checklists/assignments/:assignmentId', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const assignmentId = parseInt(req.params.assignmentId, 10);
  if (isNaN(assignmentId)) return res.status(400).json({ error: 'Invalid assignmentId' });
  try {
    const data = await documentChecklistService.updateAssignment(assignmentId, { ...req.body, userId: String(userId) });
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/document-checklists/completion', asyncHandler(async (req, res) => {
  const { reference_type, reference_id } = req.query;
  if (!reference_type || !reference_id) return res.status(400).json({ error: 'reference_type and reference_id required' });
  const data = await documentChecklistService.getCompletionStatus(
    reference_type as string, reference_id as string,
  );
  res.json({ data });
}));

router.get('/document-checklists/deficiency-aging', asyncHandler(async (_req, res) => {
  const data = await documentChecklistService.getDeficiencyAging();
  res.json({ data });
}));

// ─── MB-GAP-032: Regulatory Report Runs ─────────────────────────────────────

router.post('/regulatory-reports/queue', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await regulatoryReportExtService.queueReportRun({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/regulatory-reports/:runId/start', asyncHandler(async (req, res) => {
  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) return res.status(400).json({ error: 'Invalid runId' });
  try {
    const data = await regulatoryReportExtService.startReportRun(runId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/regulatory-reports/:runId/complete', asyncHandler(async (req, res) => {
  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) return res.status(400).json({ error: 'Invalid runId' });
  try {
    const data = await regulatoryReportExtService.completeReportRun(runId, req.body);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/regulatory-reports/:runId/dispatch', asyncHandler(async (req, res) => {
  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) return res.status(400).json({ error: 'Invalid runId' });
  try {
    const data = await regulatoryReportExtService.markDispatched(runId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/regulatory-reports', asyncHandler(async (req, res) => {
  const data = await regulatoryReportExtService.listReportRuns({
    reportType: req.query.report_type as string,
    status: req.query.status as string,
    period: req.query.period as string,
  });
  res.json({ data });
}));

router.get('/regulatory-reports/dispatch-summary', asyncHandler(async (_req, res) => {
  const data = await regulatoryReportExtService.getDispatchSummary();
  res.json({ data });
}));

export default router;
