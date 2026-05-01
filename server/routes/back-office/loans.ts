/**
 * loans.ts — Corporate Trust / Loan Management Routes
 *
 * Endpoints for loan facilities, payments, amortization, collaterals,
 * MPCs, amendments, receivables, and dashboard.
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { loanService } from '../../services/loan-service';
import { loanAmortizationService } from '../../services/loan-amortization-service';
import { loanPaymentService } from '../../services/loan-payment-service';
import { loanCollateralService } from '../../services/loan-collateral-service';
import { mpcService } from '../../services/mpc-service';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';

const router = Router();
router.use(requireBackOfficeRole());

// ─── Dashboard ──────────────────────────────────────────────────────────────────

router.get('/dashboard/summary', asyncHandler(async (_req, res) => {
  const summary = await loanService.getDashboardSummary();
  res.json(summary);
}));

router.get('/dashboard/upcoming-payments', asyncHandler(async (req, res) => {
  const days = req.query.days ? parseInt(req.query.days as string, 10) : 15;
  if (isNaN(days)) return res.status(400).json({ error: { message: 'Invalid days parameter' } });
  const payments = await loanService.getUpcomingPayments(days);
  res.json(payments);
}));

router.get('/dashboard/overdue', asyncHandler(async (_req, res) => {
  const payments = await loanService.getOverduePayments();
  res.json(payments);
}));

// ─── Receivables (global, not facility-scoped) ──────────────────────────────────

router.get('/receivables', asyncHandler(async (req, res) => {
  const { facilityId, agingBucket, page, pageSize } = req.query;
  const result = await loanPaymentService.listReceivables({
    facilityId: facilityId as string,
    agingBucket: agingBucket as string,
    page: page ? parseInt(page as string, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
  });
  res.json(result);
}));

router.get('/receivables/aging', asyncHandler(async (_req, res) => {
  const summary = await loanPaymentService.getAgingSummary();
  res.json(summary);
}));

// ─── Facilities CRUD ────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const { status, loanType, clientId, search, maturityFrom, maturityTo, page, pageSize } = req.query;
  const result = await loanService.listFacilities({
    status: status as string,
    loanType: loanType as string,
    clientId: clientId as string,
    search: search as string,
    maturityFrom: maturityFrom as string,
    maturityTo: maturityTo as string,
    page: page ? parseInt(page as string, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
  });
  res.json(result);
}));

router.get('/:facilityId', asyncHandler(async (req, res) => {
  try {
    const facility = await loanService.getFacility(req.params.facilityId);
    res.json(facility);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.createFacility(req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.patch('/:facilityId', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.updateFacility(req.params.facilityId, req.body, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Status transitions ─────────────────────────────────────────────────────────

router.post('/:facilityId/submit', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.submitForApproval(req.params.facilityId, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/approve', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.approveFacility(req.params.facilityId, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/activate', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.activateFacility(req.params.facilityId, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/close', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.closeFacility(req.params.facilityId, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Participants ───────────────────────────────────────────────────────────────

router.get('/:facilityId/participants', asyncHandler(async (req, res) => {
  const participants = await loanService.listParticipants(req.params.facilityId);
  res.json(participants);
}));

router.post('/:facilityId/participants', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.addParticipant(req.params.facilityId, req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Payments ───────────────────────────────────────────────────────────────────

router.get('/:facilityId/payments', asyncHandler(async (req, res) => {
  const { status, page, pageSize } = req.query;
  const result = await loanPaymentService.listPayments(req.params.facilityId, {
    status: status as string,
    page: page ? parseInt(page as string, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
  });
  res.json(result);
}));

router.post('/:facilityId/payments', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanPaymentService.recordPayment(req.params.facilityId, req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/prepay', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanPaymentService.processPrepayment(req.params.facilityId, req.body, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Availments ─────────────────────────────────────────────────────────────────

router.get('/:facilityId/availments', asyncHandler(async (req, res) => {
  const availments = await loanService.listAvailments(req.params.facilityId);
  res.json(availments);
}));

router.post('/:facilityId/availments', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.createAvailment(req.params.facilityId, req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/availments/:id/approve', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid availment ID' } });
    const result = await loanService.approveAvailment(id, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/availments/:id/disburse', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid availment ID' } });
    const result = await loanService.disburseAvailment(id, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Amortization ───────────────────────────────────────────────────────────────

router.get('/:facilityId/amortization', asyncHandler(async (req, res) => {
  const schedule = await loanAmortizationService.getSchedule(req.params.facilityId);
  res.json(schedule);
}));

router.post('/:facilityId/amortization/generate', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const schedule = await loanAmortizationService.generateAndSave(req.params.facilityId, userId);
    res.json(schedule);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Collaterals ────────────────────────────────────────────────────────────────

router.get('/:facilityId/collaterals', asyncHandler(async (req, res) => {
  const collaterals = await loanCollateralService.listCollaterals(req.params.facilityId);
  res.json(collaterals);
}));

router.post('/:facilityId/collaterals', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanCollateralService.createCollateral(req.params.facilityId, req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.patch('/:facilityId/collaterals/:collateralId', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanCollateralService.updateCollateral(req.params.collateralId, req.body, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/collaterals/:collateralId/revalue', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanCollateralService.recordRevaluation(req.params.collateralId, req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.get('/:facilityId/collaterals/:collateralId/valuations', asyncHandler(async (req, res) => {
  const history = await loanCollateralService.getValuationHistory(req.params.collateralId);
  res.json(history);
}));

router.get('/:facilityId/collaterals-summary', asyncHandler(async (req, res) => {
  const summary = await loanCollateralService.getFacilityCollateralSummary(req.params.facilityId);
  res.json(summary);
}));

// ─── MPCs ───────────────────────────────────────────────────────────────────────

router.get('/:facilityId/mpcs', asyncHandler(async (req, res) => {
  const mpcs = await mpcService.listMpcs(req.params.facilityId);
  res.json(mpcs);
}));

router.post('/:facilityId/mpcs', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await mpcService.issueMpc(req.params.facilityId, req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/mpcs/:mpcId/cancel', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await mpcService.cancelMpc(req.params.mpcId, req.body.reason, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/:facilityId/mpcs/:mpcId/transfer', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await mpcService.transferMpc(req.params.mpcId, req.body.new_holder_id, userId);
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Amendments ─────────────────────────────────────────────────────────────────

router.get('/:facilityId/amendments', asyncHandler(async (req, res) => {
  const amendments = await loanService.listAmendments(req.params.facilityId);
  res.json(amendments);
}));

router.post('/:facilityId/amendments', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  try {
    const result = await loanService.createAmendment(req.params.facilityId, req.body, userId);
    res.status(201).json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

// ─── Documents ──────────────────────────────────────────────────────────────────

router.get('/:facilityId/documents', asyncHandler(async (req, res) => {
  const docs = await db.select().from(schema.loanDocuments)
    .where(and(
      eq(schema.loanDocuments.facility_id, req.params.facilityId),
      eq(schema.loanDocuments.is_deleted, false),
    ));
  res.json(docs);
}));

router.post('/:facilityId/documents', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  const docId = `DOC-${Date.now()}`;
  const [record] = await db.insert(schema.loanDocuments).values({
    document_id: docId,
    facility_id: req.params.facilityId,
    ...req.body,
    created_by: userId,
    updated_by: userId,
  }).returning();
  res.status(201).json(record);
}));

// ─── Tax & Insurance ────────────────────────────────────────────────────────────

router.get('/:facilityId/tax-insurance', asyncHandler(async (req, res) => {
  const items = await db.select().from(schema.loanTaxInsurance)
    .where(and(
      eq(schema.loanTaxInsurance.facility_id, req.params.facilityId),
      eq(schema.loanTaxInsurance.is_deleted, false),
    ));
  res.json(items);
}));

router.post('/:facilityId/tax-insurance', asyncHandler(async (req, res) => {
  const userId = String((req as any).user?.id || '');
  if (!(req as any).user?.id) return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  const [record] = await db.insert(schema.loanTaxInsurance).values({
    facility_id: req.params.facilityId,
    ...req.body,
    created_by: userId,
    updated_by: userId,
  }).returning();
  res.status(201).json(record);
}));

export default router;
