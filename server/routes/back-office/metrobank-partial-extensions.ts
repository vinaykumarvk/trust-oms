/**
 * metrobank-partial-extensions.ts — Routes for MB-GAP-003/013/017/018/019/021/030/031
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  udfValueService,
  restrictionMatrixService,
  withdrawalDispositionService,
  transferMatrixService,
  stockholderNoticeService,
  custodianReconService,
  multiBookService,
  impairmentService,
} from '../../services/metrobank-partial-extensions-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

// ─── MB-GAP-003: UDF Values ────────────────────────────────────────────────

router.post('/udf-values', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await udfValueService.setUdfValue({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/udf-values/:entityType/:entityId', asyncHandler(async (req, res) => {
  const data = await udfValueService.getUdfValues(req.params.entityType, req.params.entityId);
  res.json({ data });
}));

router.delete('/udf-values/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await udfValueService.deleteUdfValue(id);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── MB-GAP-013: Restriction Matrix ────────────────────────────────────────

router.post('/restrictions', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await restrictionMatrixService.createRule({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/restrictions', asyncHandler(async (req, res) => {
  const data = await restrictionMatrixService.listRules(req.query.restriction_type as string);
  res.json({ data });
}));

router.patch('/restrictions/:ruleId', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const ruleId = parseInt(req.params.ruleId, 10);
  if (isNaN(ruleId)) return res.status(400).json({ error: 'Invalid ruleId' });
  try {
    const data = await restrictionMatrixService.updateRule(ruleId, req.body, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/restrictions/evaluate', asyncHandler(async (req, res) => {
  try {
    const data = await restrictionMatrixService.evaluateRestrictions(req.body);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── MB-GAP-017: Withdrawal Disposition ─────────────────────────────────────

router.get('/withdrawal-disposition/:portfolioId', asyncHandler(async (req, res) => {
  const amount = parseFloat(req.query.amount as string);
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Valid positive amount required' });
  try {
    const data = await withdrawalDispositionService.computeDisposition(req.params.portfolioId, amount);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/withdrawal-blocks/:portfolioId', asyncHandler(async (req, res) => {
  const data = await withdrawalDispositionService.checkWithdrawalBlocks(req.params.portfolioId);
  res.json({ data });
}));

// ─── MB-GAP-018: Transfer Matrix ───────────────────────────────────────────

router.post('/multi-transfers', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await transferMatrixService.createMultiTransfer({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/multi-transfers/:sourcePortfolioId', asyncHandler(async (req, res) => {
  const data = await transferMatrixService.getTransferGroup(
    req.params.sourcePortfolioId,
    req.query.created_after as string,
  );
  res.json({ data });
}));

// ─── MB-GAP-019: Stockholder Notices ───────────────────────────────────────

router.post('/corporate-actions/:caId/notices', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const caId = parseInt(req.params.caId, 10);
  if (isNaN(caId)) return res.status(400).json({ error: 'Invalid caId' });
  try {
    const data = await stockholderNoticeService.generateNotices(caId, String(userId));
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/corporate-actions/:caId/notices', asyncHandler(async (req, res) => {
  const caId = parseInt(req.params.caId, 10);
  if (isNaN(caId)) return res.status(400).json({ error: 'Invalid caId' });
  const data = await stockholderNoticeService.listNotices(caId);
  res.json({ data });
}));

// ─── MB-GAP-021: Custodian Reconciliation ──────────────────────────────────

router.post('/custodian-recon', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await custodianReconService.createRecon({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/custodian-recon/:reconId/reconcile', asyncHandler(async (req, res) => {
  const reconId = parseInt(req.params.reconId, 10);
  if (isNaN(reconId)) return res.status(400).json({ error: 'Invalid reconId' });
  try {
    const data = await custodianReconService.reconcileHoldings(
      reconId, req.body.custodianRecords ?? [], req.body.portfolioId,
    );
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/custodian-recon', asyncHandler(async (req, res) => {
  const data = await custodianReconService.listReconciliations(req.query.custodian_name as string);
  res.json({ data });
}));

// ─── MB-GAP-030: Multi-Book COA ───────────────────────────────────────────

router.get('/gl-books/:bookCode/accounts', asyncHandler(async (req, res) => {
  const data = await multiBookService.getAccountsByBook(req.params.bookCode);
  res.json({ data });
}));

router.post('/gl-books/:glHeadId/assign', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const glHeadId = parseInt(req.params.glHeadId, 10);
  if (isNaN(glHeadId)) return res.status(400).json({ error: 'Invalid glHeadId' });
  try {
    const data = await multiBookService.assignToBook(glHeadId, req.body.bookCode, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/gl-books/:bookCode/trial-balance', asyncHandler(async (req, res) => {
  const asOfDate = req.query.as_of_date as string;
  if (!asOfDate) return res.status(400).json({ error: 'as_of_date required' });
  try {
    const data = await multiBookService.getTrialBalanceByBook(req.params.bookCode, asOfDate);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── MB-GAP-031: Impairment ───────────────────────────────────────────────

router.post('/impairments', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await impairmentService.createAssessment({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/impairments/:id/approve', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await impairmentService.approveAssessment(id, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/impairments/:id/reverse', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await impairmentService.reverseImpairment(id, req.body.reversalAmount, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/impairments/:portfolioId', asyncHandler(async (req, res) => {
  const data = await impairmentService.listAssessments(req.params.portfolioId);
  res.json({ data });
}));

router.get('/impairments/:portfolioId/triggers', asyncHandler(async (req, res) => {
  try {
    const data = await impairmentService.checkTriggers(req.params.portfolioId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

export default router;
