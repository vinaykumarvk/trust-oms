/**
 * Risk Profiling API Routes
 *
 * Handles questionnaire maintenance, risk appetite mapping, asset allocation config,
 * customer risk assessments, deviations, escalations, and supervisor dashboard.
 */

import { Router } from 'express';
import { riskProfilingService } from '../../services/risk-profiling-service';
import { requireBackOfficeRole } from '../../middleware/role-auth';

const router = Router();

// ============================================================================
// Questionnaire Maintenance (Maker-Checker)
// ============================================================================

router.get('/questionnaires', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { entity_id, search, status, page = '1', page_size = '25' } = req.query;
    const result = await riskProfilingService.listQuestionnaires(
      (entity_id as string) || 'default',
      {
        search: search as string,
        status: status as string,
        page: parseInt(page as string, 10),
        pageSize: parseInt(page_size as string, 10),
      },
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/questionnaires/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.getQuestionnaire(parseInt(req.params.id, 10));
    if (!result) return res.status(404).json({ error: 'Questionnaire not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/questionnaires', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.createQuestionnaire(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/questionnaires/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.updateQuestionnaire(parseInt(req.params.id, 10), req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/questionnaires/:id/authorize', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const checkerId = (req as any).user?.id;
    if (!checkerId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.authorizeQuestionnaire(parseInt(req.params.id, 10), checkerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/questionnaires/:id/reject', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const checkerId = (req as any).user?.id;
    if (!checkerId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.rejectQuestionnaire(parseInt(req.params.id, 10), checkerId, req.body.rejection_reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/questionnaires/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    await riskProfilingService.deleteQuestionnaire(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Questions ---

router.post('/questionnaires/:questionnaireId/questions', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.addQuestion(parseInt(req.params.questionnaireId, 10), req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/questions/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.updateQuestion(parseInt(req.params.id, 10), req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/questions/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    await riskProfilingService.deleteQuestion(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Answer Options ---

router.post('/questions/:questionId/options', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.addAnswerOption(parseInt(req.params.questionId, 10), req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/options/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.updateAnswerOption(parseInt(req.params.id, 10), req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/options/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    await riskProfilingService.deleteAnswerOption(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Score Normalization Ranges ---

router.put('/questions/:questionId/normalization-ranges', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.setNormalizationRanges(parseInt(req.params.questionId, 10), req.body.ranges);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Risk Appetite Mapping (Maker-Checker)
// ============================================================================

router.get('/risk-appetite', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const entityId = (req.query.entity_id as string) || 'default';
    const result = await riskProfilingService.listRiskAppetiteMappings(entityId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/risk-appetite', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.createRiskAppetiteMapping(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/risk-appetite/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.updateRiskAppetiteMapping(parseInt(req.params.id, 10), req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/risk-appetite/:id/authorize', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const checkerId = (req as any).user?.id;
    if (!checkerId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.authorizeRiskAppetiteMapping(parseInt(req.params.id, 10), checkerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/risk-appetite/:id/reject', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const checkerId = (req as any).user?.id;
    if (!checkerId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.rejectRiskAppetiteMapping(parseInt(req.params.id, 10), checkerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Asset Allocation Config (Maker-Checker)
// ============================================================================

router.get('/asset-allocation', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const entityId = (req.query.entity_id as string) || 'default';
    const result = await riskProfilingService.listAssetAllocationConfigs(entityId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/asset-allocation', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.createAssetAllocationConfig(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/asset-allocation/:id', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.updateAssetAllocationConfig(parseInt(req.params.id, 10), req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/asset-allocation/:id/authorize', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const checkerId = (req as any).user?.id;
    if (!checkerId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.authorizeAssetAllocationConfig(parseInt(req.params.id, 10), checkerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/asset-allocation/:id/reject', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const checkerId = (req as any).user?.id;
    if (!checkerId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.rejectAssetAllocationConfig(parseInt(req.params.id, 10), checkerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Customer Risk Assessment
// ============================================================================

router.post('/assessments/compute-score', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { questionnaire_id, responses } = req.body;
    const result = await riskProfilingService.computeRiskScore(questionnaire_id, responses);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/assessments', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const assessedBy = (req as any).user?.id;
    if (!assessedBy) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.createRiskAssessment(
      req.body.customer_id,
      req.body.questionnaire_id,
      req.body.responses,
      assessedBy,
      req.body.deviation,
      req.body.device_info,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/assessments/customer/:customerId', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.listCustomerAssessments(req.params.customerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/assessments/customer/:customerId/active', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.getCustomerRiskProfile(req.params.customerId);
    if (!result) return res.status(404).json({ error: 'No active risk profile found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/assessments/:id/approve-deviation', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const supervisorId = (req as any).user?.id;
    if (!supervisorId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.approveDeviation(parseInt(req.params.id, 10), supervisorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Product Risk Deviations
// ============================================================================

router.post('/deviations/check', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { customer_id, product_risk_code } = req.body;
    const result = await riskProfilingService.checkProductRiskDeviation(customer_id, product_risk_code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/deviations', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.recordProductRiskDeviation(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/deviations/:id/acknowledge', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.acknowledgeDeviation(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Compliance Escalations
// ============================================================================

router.get('/escalations', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const entityId = (req.query.entity_id as string) || 'default';
    const result = await riskProfilingService.listEscalations(entityId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/escalations/:id/resolve', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const result = await riskProfilingService.resolveEscalation(
      parseInt(req.params.id, 10),
      req.body.resolution_action,
      req.body.resolution_notes,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Cascading Config Validation
// ============================================================================

router.get('/validate-config', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const entityId = (req.query.entity_id as string) || 'default';
    const result = await riskProfilingService.validateCascadingConfig(entityId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Supervisor Dashboard
// ============================================================================

router.get('/supervisor/dashboard', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const supervisorId = (req as any).user?.id;
    if (!supervisorId) return res.status(401).json({ error: 'Authentication required' });
    const result = await riskProfilingService.getLeadStatusSummary(supervisorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Risk Profiling Completion Report (FR-033 — G-056)
// ============================================================================

router.get('/reports/completion', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { entity_id, date_from, date_to, rm_id, branch_id } = req.query;
    const result = await riskProfilingService.getRiskProfilingCompletionReport({
      entityId: (entity_id as string) || 'default',
      dateFrom: date_from as string | undefined,
      dateTo: date_to as string | undefined,
      rmId: rm_id ? parseInt(rm_id as string, 10) : undefined,
      branchId: branch_id ? parseInt(branch_id as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Audit Logs (compliance/audit access only — FR-039.BR1)
// ============================================================================

router.get('/audit-logs', requireBackOfficeRole(), async (req, res, next) => {
  try {
    const { entity_id, customer_id, page = '1', page_size = '20' } = req.query;
    // Return audit trail from customerRiskProfiles / productRiskDeviations / complianceEscalations
    res.json({ message: 'Audit log endpoint — restrict to COMPLIANCE/AUDIT roles', data: [] });
  } catch (err) {
    next(err);
  }
});

export default router;
