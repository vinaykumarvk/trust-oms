/**
 * Lead Management — Custom Routes (CRM Phase 2)
 *
 * Domain-specific endpoints beyond standard CRUD:
 * - Lead-to-Prospect conversion (calls conversion-service)
 * - Lead status transitions
 * - Sub-entity management (family, addresses, identifications, lifestyle, documents)
 * - My Leads dashboard with KPI tiles
 */

import { Router } from 'express';
import { requireCRMRole, logDataAccess } from '../../middleware/role-auth';
import { leadService } from '../../services/lead-service';
import { conversionService } from '../../services/conversion-service';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const router = Router();
router.use(requireCRMRole());

// ============================================================================
// Dashboard
// ============================================================================

/** My Leads dashboard with KPI tiles */
router.get('/leads/dashboard', async (req, res) => {
  try {
    const result = await leadService.getDashboardData(
      req.userId || 'unknown',
      req.userRole || '',
      (req as any).userBranchId,
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Lead-to-Prospect Conversion
// ============================================================================

/** Convert a lead to a prospect */
router.post('/leads/:id/convert', logDataAccess('lead-conversion'), async (req, res) => {
  try {
    const result = await conversionService.leadToProspect(
      parseInt(req.params.id),
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result, message: 'Lead converted to prospect successfully' });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Status Transitions
// ============================================================================

/** Update lead status */
router.post('/leads/:id/status', async (req, res) => {
  try {
    const { status, drop_reason } = req.body;
    if (!status) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'status is required' } });
    }
    const result = await leadService.updateStatus(
      parseInt(req.params.id),
      status,
      req.userId || 'unknown',
      drop_reason,
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Sub-Entity Management — Family Members
// ============================================================================

router.post('/leads/:id/family-members', async (req, res) => {
  try {
    const result = await leadService.addFamilyMember(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/leads/:id/family-members/:memberId', async (req, res) => {
  try {
    const result = await leadService.updateFamilyMember(
      parseInt(req.params.memberId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/leads/:id/family-members/:memberId', async (req, res) => {
  try {
    const result = await leadService.removeFamilyMember(
      parseInt(req.params.memberId),
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Sub-Entity Management — Addresses
// ============================================================================

router.post('/leads/:id/addresses', async (req, res) => {
  try {
    const result = await leadService.addAddress(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/leads/:id/addresses/:addressId', async (req, res) => {
  try {
    const result = await leadService.updateAddress(
      parseInt(req.params.addressId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/leads/:id/addresses/:addressId', async (req, res) => {
  try {
    const result = await leadService.removeAddress(
      parseInt(req.params.addressId),
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Sub-Entity Management — Identifications
// ============================================================================

router.post('/leads/:id/identifications', async (req, res) => {
  try {
    const result = await leadService.addIdentification(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/leads/:id/identifications/:identId', async (req, res) => {
  try {
    const result = await leadService.updateIdentification(
      parseInt(req.params.identId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/leads/:id/identifications/:identId', async (req, res) => {
  try {
    const result = await leadService.removeIdentification(
      parseInt(req.params.identId),
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Sub-Entity Management — Lifestyle
// ============================================================================

router.post('/leads/:id/lifestyle', async (req, res) => {
  try {
    const result = await leadService.addLifestyle(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/leads/:id/lifestyle/:lifestyleId', async (req, res) => {
  try {
    const result = await leadService.updateLifestyle(
      parseInt(req.params.lifestyleId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/leads/:id/lifestyle/:lifestyleId', async (req, res) => {
  try {
    const result = await leadService.removeLifestyle(
      parseInt(req.params.lifestyleId),
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Sub-Entity Management — Documents
// ============================================================================

router.post('/leads/:id/documents', async (req, res) => {
  try {
    const result = await leadService.addDocument(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/leads/:id/documents/:docId', async (req, res) => {
  try {
    const result = await leadService.updateDocument(
      parseInt(req.params.docId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/leads/:id/documents/:docId', async (req, res) => {
  try {
    const result = await leadService.removeDocument(
      parseInt(req.params.docId),
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

export default router;
