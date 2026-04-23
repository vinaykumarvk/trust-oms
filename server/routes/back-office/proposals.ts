/**
 * Investment Proposal API Routes
 *
 * Handles proposal CRUD, line items, suitability checks, approval workflow,
 * what-if analysis, PDF generation, and reporting.
 */

import { Router } from 'express';
import { proposalService } from '../../services/proposal-service';
import { requireBackOfficeRole } from '../../middleware/role-auth';

const router = Router();

// ============================================================================
// Proposal CRUD
// ============================================================================

router.get('/', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { entity_id, rm_id, customer_id, status, page = '1', page_size = '25' } = req.query;
    const result = await proposalService.listProposals({
      entityId: entity_id as string,
      rmId: rm_id ? parseInt(rm_id as string, 10) : undefined,
      customerId: customer_id as string,
      status: status as string,
      page: parseInt(page as string, 10),
      pageSize: parseInt(page_size as string, 10),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.getProposal(parseInt(req.params.id, 10));
    if (!result) return res.status(404).json({ error: 'Proposal not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const rmId = (req as any).user?.id ?? (req as any).userId;
    if (!rmId) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    // Explicit field destructure prevents mass-assignment
    const {
      customer_id, risk_profile_id, title, investment_objective,
      time_horizon_years, proposed_amount, currency, entity_id, created_by,
    } = req.body;
    const result = await proposalService.createProposal({
      customer_id, risk_profile_id, title, investment_objective,
      time_horizon_years, proposed_amount, currency, entity_id, created_by,
      rm_id: rmId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.updateProposal(parseInt(req.params.id, 10), req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    await proposalService.deleteProposal(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Line Items
// ============================================================================

router.post('/:proposalId/line-items', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.addLineItem(parseInt(req.params.proposalId, 10), req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/line-items/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.updateLineItem(parseInt(req.params.id, 10), req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/line-items/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    await proposalService.deleteLineItem(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:proposalId/validate-allocation', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.validateAllocation(parseInt(req.params.proposalId, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Suitability Check
// ============================================================================

router.post('/:proposalId/suitability-check', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.runSuitabilityCheck(parseInt(req.params.proposalId, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// What-If Analysis
// ============================================================================

router.post('/:proposalId/what-if', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.computeWhatIfMetrics(parseInt(req.params.proposalId, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Approval Workflow
// ============================================================================

router.post('/:id/submit', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.submitProposal(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve-l1', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const actorId = (req as any).user?.id;
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    const result = await proposalService.approveL1(parseInt(req.params.id, 10), actorId, req.body.comments);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject-l1', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const actorId = (req as any).user?.id;
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    const result = await proposalService.rejectL1(parseInt(req.params.id, 10), actorId, req.body.comments);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve-compliance', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const actorId = (req as any).user?.id;
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    const result = await proposalService.approveCompliance(parseInt(req.params.id, 10), actorId, req.body.comments);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject-compliance', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const actorId = (req as any).user?.id;
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    const result = await proposalService.rejectCompliance(parseInt(req.params.id, 10), actorId, req.body.comments);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/send-to-client', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.sendToClient(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/client-accept', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const clientId = (req as any).user?.id;
    if (!clientId) return res.status(401).json({ error: 'Authentication required' });
    const result = await proposalService.clientAccept(parseInt(req.params.id, 10), clientId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/client-reject', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const clientId = (req as any).user?.id;
    if (!clientId) return res.status(401).json({ error: 'Authentication required' });
    const result = await proposalService.clientReject(parseInt(req.params.id, 10), clientId, req.body.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/return-for-revision', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const actorId = (req as any).user?.id;
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    const result = await proposalService.returnForRevision(
      parseInt(req.params.id, 10),
      actorId,
      req.body.level,
      req.body.comments,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// PDF Generation
// ============================================================================

router.post('/:id/generate-pdf', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await proposalService.generateProposalPdf(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Reporting
// ============================================================================

router.get('/reports/pipeline', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { entity_id, date_from, date_to } = req.query;
    const result = await proposalService.getProposalPipelineReport(
      (entity_id as string) || 'default',
      date_from as string,
      date_to as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/reports/risk-mismatch', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const entityId = (req.query.entity_id as string) || 'default';
    const result = await proposalService.getRiskMismatchReport(entityId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/reports/product-rating', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { entity_id, date_from, date_to } = req.query;
    const result = await proposalService.getTransactionByProductRatingReport(
      (entity_id as string) || 'default',
      date_from as string,
      date_to as string,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
