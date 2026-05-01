/**
 * operations-extended.ts — Securities Services, Operations, Order Mgmt,
 * Risk Management, Reporting, and General Requirements Routes
 *
 * Covers: SS-01–SS-06, OPS-01–OPS-07, OM-01–OM-03, RM-01/02, RA-01/02, GR-01–GR-05
 */

import { Router, Request, Response } from 'express';
import {
  securitiesService,
  operationsService,
  orderExtensionService,
  assetSwapService,
  reportingService,
} from '../../services/operations-extended-service';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) => fn(req, res).catch((err: any) => {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  });
}

// ─── Securities Services ─────────────────────────────────────────────────────

// Stock transfers
router.get('/stock-transfers', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const transfers = await securitiesService.listStockTransfers(req.query.security_id as string);
  res.json(transfers);
}));

router.post('/stock-transfers', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const transfer = await securitiesService.createStockTransfer(req.body, userId);
  res.status(201).json(transfer);
}));

router.patch('/stock-transfers/:transferId/status', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const transfer = await securitiesService.updateTransferStatus(req.params.transferId, req.body.status, userId);
  res.json(transfer);
}));

router.post('/stock-transfers/bulk-import', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await securitiesService.bulkImportTransfers(req.body.records, req.body.source_agent, userId);
  res.status(201).json(result);
}));

// Stock rights
router.get('/stock-rights', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const rights = await securitiesService.listStockRights(req.query.security_id as string);
  res.json(rights);
}));

router.post('/stock-rights', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const right = await securitiesService.createStockRight(req.body, userId);
  res.status(201).json(right);
}));

// Unclaimed certificates
router.get('/unclaimed-certificates', requireBackOfficeRole(), asyncHandler(async (_req, res) => {
  const certs = await securitiesService.listUnclaimedCertificates();
  res.json(certs);
}));

router.post('/unclaimed-certificates', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const cert = await securitiesService.createUnclaimedCertificate(req.body, userId);
  res.status(201).json(cert);
}));

// Stockholder meetings
router.get('/stockholder-meetings', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const meetings = await securitiesService.listStockholderMeetings(req.query.security_id as string);
  res.json(meetings);
}));

router.post('/stockholder-meetings', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const meeting = await securitiesService.createStockholderMeeting(req.body, userId);
  res.status(201).json(meeting);
}));

router.patch('/stockholder-meetings/:meetingId/voting', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const meeting = await securitiesService.recordVotingResults(req.params.meetingId, req.body, userId);
  res.json(meeting);
}));

// ─── Operations ──────────────────────────────────────────────────────────────

// Bank reconciliation
router.get('/bank-reconciliations', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const recons = await operationsService.listReconciliations(req.query.bank_account as string);
  res.json(recons);
}));

router.post('/bank-reconciliations', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const recon = await operationsService.createReconciliation(req.body, userId);
  res.status(201).json(recon);
}));

// Number series
router.get('/number-series', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const series = await operationsService.listNumberSeries(req.query.series_type as string);
  res.json(series);
}));

router.post('/number-series', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const series = await operationsService.createNumberSeries(req.body, userId);
  res.status(201).json(series);
}));

router.post('/number-series/:seriesId/next', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const next = await operationsService.getNextNumber(req.params.seriesId);
  res.json({ next_number: next });
}));

// Checks
router.get('/checks', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const checks = await operationsService.listChecks({
    status: req.query.status as string,
    bank_account: req.query.bank_account as string,
  });
  res.json(checks);
}));

router.post('/checks', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const check = await operationsService.issueCheck(req.body, userId);
  res.status(201).json(check);
}));

router.patch('/checks/:checkId/status', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const check = await operationsService.updateCheckStatus(req.params.checkId, req.body.status, userId);
  res.json(check);
}));

// Properties / depreciation
router.get('/properties', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const properties = await operationsService.listProperties(req.query.portfolio_id as string);
  res.json(properties);
}));

router.post('/properties', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const property = await operationsService.createProperty(req.body, userId);
  res.status(201).json(property);
}));

router.post('/properties/:assetId/depreciate', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const property = await operationsService.computeDepreciation(req.params.assetId, userId);
  res.json(property);
}));

// Loan refunds
router.get('/loan-refunds', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const refunds = await operationsService.listLoanRefunds(req.query.portfolio_id as string);
  res.json(refunds);
}));

router.post('/loan-refunds', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const refund = await operationsService.createLoanRefund(req.body, userId);
  res.status(201).json(refund);
}));

router.post('/loan-refunds/:refundId/approve', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const refund = await operationsService.approveLoanRefund(req.params.refundId, userId);
  res.json(refund);
}));

// ─── Order Management Extensions ─────────────────────────────────────────────

// Trade imports
router.get('/trade-imports', requireBackOfficeRole(), asyncHandler(async (_req, res) => {
  const imports = await orderExtensionService.listTradeImports();
  res.json(imports);
}));

router.post('/trade-imports', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const imp = await orderExtensionService.createTradeImport(req.body, userId);
  res.status(201).json(imp);
}));

router.get('/trade-imports/:importId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const imp = await orderExtensionService.getTradeImport(req.params.importId);
  res.json(imp);
}));

// Held-away assets
router.get('/held-away/:portfolioId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const assets = await orderExtensionService.listHeldAwayAssets(req.params.portfolioId);
  res.json(assets);
}));

router.post('/held-away', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const asset = await orderExtensionService.bookHeldAwayAsset(req.body, userId);
  res.status(201).json(asset);
}));

// ─── Risk Management ─────────────────────────────────────────────────────────

router.get('/asset-swaps', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const swaps = await assetSwapService.listAssetSwaps(req.query.portfolio_id as string);
  res.json(swaps);
}));

router.post('/asset-swaps', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const swap = await assetSwapService.createAssetSwap(req.body, userId);
  res.status(201).json(swap);
}));

router.post('/asset-swaps/:swapId/book-fee', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const swap = await assetSwapService.bookSwapFee(req.params.swapId, parseFloat(req.body.fee_amount), userId);
  res.json(swap);
}));

router.get('/asset-swaps/upcoming-coupons', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const days = req.query.days ? parseInt(req.query.days as string) : 15;
  const swaps = await assetSwapService.getUpcomingCoupons(days);
  res.json(swaps);
}));

// ─── Reporting & Analytics ───────────────────────────────────────────────────

// CTR
router.get('/ctr', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const ctrs = await reportingService.listCTRs({
    status: req.query.status as string,
    client_id: req.query.client_id as string,
  });
  res.json(ctrs);
}));

router.post('/ctr', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const ctr = await reportingService.createCTR(req.body, userId);
  res.status(201).json(ctr);
}));

router.post('/ctr/:reportId/file', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const ctr = await reportingService.fileCTR(req.params.reportId, userId);
  res.json(ctr);
}));

// Escheat
router.get('/escheats', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const records = await reportingService.listEscheatRecords(req.query.status as string);
  res.json(records);
}));

router.post('/escheats', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const record = await reportingService.createEscheatRecord(req.body, userId);
  res.status(201).json(record);
}));

router.post('/escheats/:escheatId/file', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const record = await reportingService.fileEscheat(req.params.escheatId, req.body.reference, userId);
  res.json(record);
}));

// Report templates
router.get('/report-templates', requireBackOfficeRole(), asyncHandler(async (_req, res) => {
  const templates = await reportingService.listReportTemplates();
  res.json(templates);
}));

router.post('/report-templates', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const template = await reportingService.createReportTemplate(req.body, userId);
  res.status(201).json(template);
}));

// Protected reports
router.get('/protected-reports', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const reports = await reportingService.listProtectedReports(req.query.client_id as string);
  res.json(reports);
}));

router.post('/protected-reports', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const report = await reportingService.createProtectedReport(req.body, userId);
  res.status(201).json(report);
}));

// Data migrations
router.get('/data-migrations', requireBackOfficeRole(), asyncHandler(async (_req, res) => {
  const migrations = await reportingService.listDataMigrations();
  res.json(migrations);
}));

router.post('/data-migrations', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const migration = await reportingService.createDataMigration(req.body, userId);
  res.status(201).json(migration);
}));

router.patch('/data-migrations/:migrationId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const migration = await reportingService.updateMigrationProgress(req.params.migrationId, req.body, userId);
  res.json(migration);
}));

export default router;
