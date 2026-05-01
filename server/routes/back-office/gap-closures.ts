/**
 * gap-closures.ts — API routes for P0/P1 PARTIAL BDO RFI gap closures
 *
 * Exposes endpoints for: holiday calendar, batch transfers, cash flow
 * projections, settlement files, report exports, fiscal closing,
 * transaction advices, and real-time settlement connectors.
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  schedulerEnhancements,
  holidayCalendarService,
  bulkOrderImportService,
  batchTransferService,
  cashFlowProjectionService,
  settlementFileService,
  reportExportService,
  fiscalClosingService,
  transactionAdviceService,
  realtimeSettlementService,
  batchAccountService,
  scheduledPlanBatchService,
} from '../../services/partial-gap-closure-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

// ─── P-01: Scheduler Enhancements ──────────────────────────────────────────

/** Get job history for a schedule */
router.get('/scheduler/history/:scheduleId', asyncHandler(async (req, res) => {
  const scheduleId = parseInt(req.params.scheduleId, 10);
  if (isNaN(scheduleId)) return res.status(400).json({ error: 'Invalid scheduleId' });
  const history = await schedulerEnhancements.getJobHistory(scheduleId);
  res.json(history);
}));

// ─── P-02: Holiday Calendar ────────────────────────────────────────────────

/** Get holidays for a year */
router.get('/holidays', asyncHandler(async (req, res) => {
  const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10);
  const market = String(req.query.market ?? 'PSE');
  const holidays = await holidayCalendarService.getHolidaysForYear(year, market);
  res.json(holidays);
}));

/** Add a holiday */
router.post('/holidays', asyncHandler(async (req, res) => {
  const holiday = await holidayCalendarService.addHoliday(req.body);
  res.status(201).json(holiday);
}));

/** Bulk import holidays */
router.post('/holidays/bulk', asyncHandler(async (req, res) => {
  const { holidays } = req.body;
  if (!Array.isArray(holidays)) return res.status(400).json({ error: 'holidays must be an array' });
  const result = await holidayCalendarService.bulkImportHolidays(holidays);
  res.status(201).json({ imported: result.length });
}));

/** Check if date is business day */
router.get('/holidays/check', asyncHandler(async (req, res) => {
  const date = String(req.query.date ?? '');
  if (!date) return res.status(400).json({ error: 'date is required' });
  const market = String(req.query.market ?? 'PSE');
  const isBd = await holidayCalendarService.isBusinessDay(date, market);
  const nextBd = isBd ? date : await holidayCalendarService.getNextBusinessDay(date, market);
  res.json({ date, is_business_day: isBd, next_business_day: nextBd });
}));

/** Calculate T+N settlement date */
router.get('/holidays/settlement-date', asyncHandler(async (req, res) => {
  const tradeDate = String(req.query.trade_date ?? '');
  const days = parseInt(String(req.query.days ?? '2'), 10);
  if (!tradeDate) return res.status(400).json({ error: 'trade_date is required' });
  const market = String(req.query.market ?? 'PSE');
  const settlementDate = await holidayCalendarService.calculateSettlementDate(tradeDate, days, market);
  res.json({ trade_date: tradeDate, days, settlement_date: settlementDate, market });
}));

/** Validate NAV date */
router.get('/holidays/validate-nav', asyncHandler(async (req, res) => {
  const date = String(req.query.date ?? '');
  if (!date) return res.status(400).json({ error: 'date is required' });
  const result = await holidayCalendarService.validateNavDate(date);
  res.json(result);
}));

// ─── P-03/P-04: Bulk Order Import ──────────────────────────────────────────

/** Validate order rows before import */
router.post('/bulk-orders/validate', asyncHandler(async (req, res) => {
  const { rows, portfolioId } = req.body;
  if (!Array.isArray(rows) || !portfolioId) {
    return res.status(400).json({ error: 'rows (array) and portfolioId are required' });
  }
  const result = await bulkOrderImportService.validateOrderRows(rows, portfolioId);
  res.json(result);
}));

/** Create orders from validated batch */
router.post('/bulk-orders/create', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { batchId, rows, portfolioId } = req.body;
  if (!Array.isArray(rows) || !portfolioId || !batchId) {
    return res.status(400).json({ error: 'batchId, rows, and portfolioId are required' });
  }
  const result = await bulkOrderImportService.createOrdersFromBatch(batchId, rows, portfolioId, String(userId));
  res.status(201).json(result);
}));

// ─── P-05: Batch Transfers ─────────────────────────────────────────────────

/** Create a transfer group */
router.post('/transfer-groups', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const group = await batchTransferService.createTransferGroup({
    groupType: req.body.groupType ?? 'BATCH',
    description: req.body.description ?? '',
    initiatedBy: String(userId),
  });
  res.status(201).json(group);
}));

/** Add transfers to a group */
router.post('/transfer-groups/:groupId/transfers', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { transfers } = req.body;
  if (!Array.isArray(transfers)) return res.status(400).json({ error: 'transfers must be an array' });
  const result = await batchTransferService.addTransfersToGroup(
    req.params.groupId,
    transfers.map((t: any) => ({ ...t, createdBy: String(userId) })),
  );
  res.status(201).json(result);
}));

/** Execute all transfers in a group */
router.post('/transfer-groups/:groupId/execute', asyncHandler(async (req, res) => {
  const result = await batchTransferService.executeTransferGroup(req.params.groupId);
  res.json(result);
}));

/** Get transfer group details */
router.get('/transfer-groups/:groupId', asyncHandler(async (req, res) => {
  const group = await batchTransferService.getTransferGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Transfer group not found' });
  res.json(group);
}));

// ─── P-06: Batch Account Creation ──────────────────────────────────────────

/** Batch create portfolios */
router.post('/batch-accounts', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { accounts } = req.body;
  if (!Array.isArray(accounts)) return res.status(400).json({ error: 'accounts must be an array' });
  const result = await batchAccountService.batchCreatePortfolios(accounts, String(userId));
  res.status(201).json(result);
}));

// ─── P-07/P-08: Cash Flow Projections ──────────────────────────────────────

/** Generate cash flow projections for a portfolio */
router.post('/cash-flow-projections/:portfolioId', asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) return res.status(400).json({ error: 'fromDate and toDate are required' });
  const projections = await cashFlowProjectionService.generateProjections(
    req.params.portfolioId,
    fromDate,
    toDate,
  );
  res.status(201).json({ count: projections.length, projections });
}));

/** Get existing projections */
router.get('/cash-flow-projections/:portfolioId', asyncHandler(async (req, res) => {
  const fromDate = req.query.from_date ? String(req.query.from_date) : undefined;
  const toDate = req.query.to_date ? String(req.query.to_date) : undefined;
  const projections = await cashFlowProjectionService.getProjections(
    req.params.portfolioId,
    fromDate,
    toDate,
  );
  res.json(projections);
}));

/** Get monthly cash flow summary */
router.get('/cash-flow-projections/:portfolioId/summary', asyncHandler(async (req, res) => {
  const fromDate = String(req.query.from_date ?? '');
  const toDate = String(req.query.to_date ?? '');
  if (!fromDate || !toDate) return res.status(400).json({ error: 'from_date and to_date required' });
  const summary = await cashFlowProjectionService.getMonthlySummary(
    req.params.portfolioId,
    fromDate,
    toDate,
  );
  res.json(summary);
}));

// ─── P-09/P-10/P-11: Settlement Files ──────────────────────────────────────

/** Generate batch settlement file */
router.post('/settlement-files', asyncHandler(async (req, res) => {
  const { settlementIds, fileType } = req.body;
  if (!Array.isArray(settlementIds) || !fileType) {
    return res.status(400).json({ error: 'settlementIds (array) and fileType are required' });
  }
  const file = await settlementFileService.generateBatchSettlementFile(settlementIds, fileType);
  res.status(201).json(file);
}));

/** Mark file as transmitted */
router.patch('/settlement-files/:fileId/transmit', asyncHandler(async (req, res) => {
  const result = await settlementFileService.markTransmitted(req.params.fileId, req.body.transmissionRef);
  if (!result) return res.status(404).json({ error: 'File not found' });
  res.json(result);
}));

/** Mark file as acknowledged */
router.patch('/settlement-files/:fileId/acknowledge', asyncHandler(async (req, res) => {
  const result = await settlementFileService.markAcknowledged(req.params.fileId);
  if (!result) return res.status(404).json({ error: 'File not found' });
  res.json(result);
}));

/** Get settlement files */
router.get('/settlement-files', asyncHandler(async (req, res) => {
  const files = await settlementFileService.getFiles({
    fileType: req.query.file_type ? String(req.query.file_type) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
  });
  res.json(files);
}));

// ─── P-12: Report Export ────────────────────────────────────────────────────

/** Export data in CSV format */
router.post('/reports/export/csv', asyncHandler(async (req, res) => {
  const { headers, rows } = req.body;
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'headers and rows arrays required' });
  }
  const csv = reportExportService.exportCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
  res.send(csv);
}));

/** Export data in Excel XML format */
router.post('/reports/export/excel', asyncHandler(async (req, res) => {
  const { headers, rows, sheetName } = req.body;
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'headers and rows arrays required' });
  }
  const excel = reportExportService.exportExcel(headers, rows, sheetName);
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', 'attachment; filename="report.xml"');
  res.send(excel);
}));

/** Export data as PDF-ready HTML */
router.post('/reports/export/pdf', asyncHandler(async (req, res) => {
  const { title, headers, rows, metadata } = req.body;
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'headers and rows arrays required' });
  }
  const html = reportExportService.exportPdfHtml(title ?? 'Report', headers, rows, metadata);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

// ─── P-13: Fiscal Closing ──────────────────────────────────────────────────

/** Initiate fiscal period close */
router.post('/fiscal-close', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { periodType, periodEnd } = req.body;
  if (!periodType || !periodEnd) {
    return res.status(400).json({ error: 'periodType and periodEnd are required' });
  }
  const result = await fiscalClosingService.initiatePeriodClose({
    periodType,
    periodEnd,
    closedBy: String(userId),
  });
  const status = result.status === 'BLOCKED' ? 409 : 200;
  res.status(status).json(result);
}));

/** Check fiscal period status */
router.get('/fiscal-close/status', asyncHandler(async (req, res) => {
  const periodEnd = String(req.query.period_end ?? '');
  if (!periodEnd) return res.status(400).json({ error: 'period_end is required' });
  const status = await fiscalClosingService.getPeriodStatus(periodEnd);
  res.json(status);
}));

// ─── P-14: Transaction Advices ─────────────────────────────────────────────

/** Generate contract note for a trade */
router.post('/transaction-advices', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { tradeId, confirmationId } = req.body;
  if (!tradeId) return res.status(400).json({ error: 'tradeId is required' });
  try {
    const advice = await transactionAdviceService.generateAdvice({
      tradeId,
      confirmationId,
      generatedBy: String(userId),
    });
    res.status(201).json(advice);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

/** Generate settlement advice */
router.post('/settlement-advices', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { settlementId } = req.body;
  if (!settlementId) return res.status(400).json({ error: 'settlementId is required' });
  try {
    const advice = await transactionAdviceService.generateSettlementAdvice(settlementId, String(userId));
    res.status(201).json(advice);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

/** Mark advice as delivered */
router.patch('/transaction-advices/:adviceId/deliver', asyncHandler(async (req, res) => {
  const result = await transactionAdviceService.markDelivered(req.params.adviceId);
  if (!result) return res.status(404).json({ error: 'Advice not found' });
  res.json(result);
}));

/** Get advices */
router.get('/transaction-advices', asyncHandler(async (req, res) => {
  const advices = await transactionAdviceService.getAdvices({
    portfolioId: req.query.portfolio_id ? String(req.query.portfolio_id) : undefined,
    clientId: req.query.client_id ? String(req.query.client_id) : undefined,
  });
  res.json(advices);
}));

// ─── P-15: Real-Time Settlement ────────────────────────────────────────────

/** Get all connector statuses */
router.get('/connectors/status', asyncHandler(async (req, res) => {
  const statuses = await realtimeSettlementService.getAllConnectorStatuses();
  res.json(statuses);
}));

/** Check single connector health */
router.get('/connectors/:connectorId/health', asyncHandler(async (req, res) => {
  const health = await realtimeSettlementService.checkConnectorHealth(req.params.connectorId);
  res.json(health);
}));

/** Route and submit settlement */
router.post('/connectors/route-settlement', asyncHandler(async (req, res) => {
  const { settlementId, securityType, amount, currency, valueDate } = req.body;
  if (!settlementId || !securityType || !amount) {
    return res.status(400).json({ error: 'settlementId, securityType, and amount are required' });
  }
  const result = await realtimeSettlementService.routeSettlement({
    settlementId,
    securityType,
    amount,
    currency: currency ?? 'PHP',
    valueDate: valueDate ?? new Date().toISOString().split('T')[0],
  });
  res.json(result);
}));

// ─── Batch EIP/ERP Processing ──────────────────────────────────────────────

/** Run batch EIP processing */
router.post('/scheduled-plans/batch-eip', asyncHandler(async (req, res) => {
  const { businessDate } = req.body;
  if (!businessDate) return res.status(400).json({ error: 'businessDate is required' });
  const result = await scheduledPlanBatchService.runEIPBatch(businessDate);
  res.json(result);
}));

/** Run batch ERP processing */
router.post('/scheduled-plans/batch-erp', asyncHandler(async (req, res) => {
  const { businessDate } = req.body;
  if (!businessDate) return res.status(400).json({ error: 'businessDate is required' });
  const result = await scheduledPlanBatchService.runERPBatch(businessDate);
  res.json(result);
}));

export default router;
