/**
 * Claims & Compensation Routes (TRUST-CA 360 Phase 6)
 *
 * REST endpoints for claim lifecycle management:
 * creation, investigation, evidence, root-cause classification,
 * approval/rejection (with SoD), settlement, withdrawal, and disclosure.
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { claimsService } from '../../services/claims-service';

const router = Router();

/** GET / — paginated list of claims with optional filters */
router.get('/', asyncHandler(async (req: any, res: any) => {
  const { status, origination, root_cause, page = '1', pageSize = '25' } = req.query;
  const result = await claimsService.getClaims({
    status: status as string | undefined,
    origination: origination as string | undefined,
    rootCause: root_cause as string | undefined,
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
  });
  res.json(result);
}));

/** GET /summary — dashboard summary (counts by status, root cause amounts) */
router.get('/summary', asyncHandler(async (_req: any, res: any) => {
  const summary = await claimsService.getDashboardSummary();
  res.json(summary);
}));

/** GET /aging — aging report with open claims grouped by age buckets */
router.get('/aging', asyncHandler(async (_req: any, res: any) => {
  const report = await claimsService.getAgingReport();
  res.json(report);
}));

/** POST / — create a new claim */
router.post('/', asyncHandler(async (req: any, res: any) => {
  const { event_id, account_id, origination, claim_amount, currency, regulatory_disclosure_required } = req.body;
  if (!account_id || !origination || claim_amount == null) {
    return res.status(400).json({ error: 'Missing required fields: account_id, origination, claim_amount' });
  }
  const result = await claimsService.createClaim({
    event_id: event_id ? parseInt(event_id as string, 10) : undefined,
    account_id,
    origination,
    claim_amount: parseFloat(claim_amount),
    currency,
    regulatory_disclosure_required: !!regulatory_disclosure_required,
    created_by: req.userId || 'system',
  });
  res.status(201).json(result);
}));

/** GET /:id — single claim detail */
router.get('/:id', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const claim = await claimsService.getClaimById(id);
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  res.json(claim);
}));

/** PUT /:id/investigate — transition to INVESTIGATING */
router.put('/:id/investigate', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const result = await claimsService.submitForInvestigation(id);
  res.json(result);
}));

/** PUT /:id/evidence — add evidence documents */
router.put('/:id/evidence', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const { documents } = req.body;
  if (!Array.isArray(documents) || documents.length === 0) {
    return res.status(400).json({ error: 'Missing required field: documents (non-empty array)' });
  }
  const result = await claimsService.addEvidence(id, documents);
  res.json(result);
}));

/** PUT /:id/root-cause — classify root cause */
router.put('/:id/root-cause', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const { rootCauseCode } = req.body;
  if (!rootCauseCode) {
    return res.status(400).json({ error: 'Missing required field: rootCauseCode' });
  }
  const result = await claimsService.classifyRootCause(id, rootCauseCode);
  res.json(result);
}));

/** PUT /:id/submit-approval — transition to PENDING_APPROVAL */
router.put('/:id/submit-approval', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const result = await claimsService.submitForApproval(id);
  res.json(result);
}));

/** PUT /:id/approve — approve (SoD enforced) */
router.put('/:id/approve', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const approverId = req.userId || 'unknown';
  const result = await claimsService.approve(id, approverId);
  res.json(result);
}));

/** PUT /:id/reject — reject with reason */
router.put('/:id/reject', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'Missing required field: reason' });
  }
  const approverId = req.userId || 'unknown';
  const result = await claimsService.reject(id, approverId, reason);
  res.json(result);
}));

/** PUT /:id/settle — settle payout via cash ledger */
router.put('/:id/settle', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const result = await claimsService.settlePayout(id);
  res.json(result);
}));

/** PUT /:id/withdraw — withdraw claim */
router.put('/:id/withdraw', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const result = await claimsService.withdraw(id);
  res.json(result);
}));

/** PUT /:id/disclose — process regulatory disclosure */
router.put('/:id/disclose', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const result = await claimsService.checkDisclosure(id);
  res.json(result);
}));

export default router;
