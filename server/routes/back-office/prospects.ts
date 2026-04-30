/**
 * Prospect Management — Custom Routes (CRM Phase 2)
 *
 * Domain-specific endpoints beyond standard CRUD:
 * - Drop with mandatory reason
 * - Reactivate
 * - Recommend for client conversion
 * - Prospect-to-Customer mapping (link-customer)
 * - Sub-entity management (family, addresses, identifications, lifestyle, documents)
 * - My Prospects dashboard
 */

import { Router } from 'express';
import { requireCRMRole, logDataAccess } from '../../middleware/role-auth';
import { prospectService } from '../../services/prospect-service';
import { conversionService } from '../../services/conversion-service';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const router = Router();
router.use(requireCRMRole());

// ============================================================================
// Dashboard
// ============================================================================

/** My Prospects dashboard data */
router.get('/prospects/dashboard', async (req, res) => {
  try {
    const result = await prospectService.getDashboardData(
      req.userId || 'unknown',
      req.userRole || '',
      (req as any).userBranchId,
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

/** Funnel analytics */
router.get('/prospects/funnel', async (req, res) => {
  try {
    const result = await conversionService.getFunnelAnalytics({
      userId: req.userId,
      userRole: req.userRole,
      branchId: (req as any).userBranchId,
    });
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// G-25: Bulk Prospect Upload
// ============================================================================

/** Bulk create prospects from JSON array (max 500 rows) */
router.post('/prospects/bulk-upload', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'rows array is required' } });
    }
    const result = await prospectService.bulkCreate(rows, req.userId || 'unknown');
    const statusCode = result.failure_count === result.total ? 422 : 200;
    res.status(statusCode).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Prospect Lifecycle
// ============================================================================

/** Drop a prospect with mandatory reason */
router.post('/prospects/:id/drop', async (req, res) => {
  try {
    const { drop_reason } = req.body;
    if (!drop_reason || typeof drop_reason !== 'string' || drop_reason.trim().length < 10) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'drop_reason is required and must be at least 10 characters' },
      });
    }
    const result = await prospectService.drop(
      parseInt(req.params.id),
      drop_reason,
      req.userId || 'unknown',
      req.userRole || (req as any).user?.role,
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Reactivate a dropped prospect */
router.post('/prospects/:id/reactivate', async (req, res) => {
  try {
    const result = await prospectService.reactivate(
      parseInt(req.params.id),
      req.userId || 'unknown',
      req.userRole || (req as any).user?.role,
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Recommend prospect for client conversion */
router.post('/prospects/:id/recommend', async (req, res) => {
  try {
    const result = await prospectService.recommend(
      parseInt(req.params.id),
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** G-026: Field-level merge preview before Prospect-to-Customer conversion */
router.get('/prospects/:id/merge-preview', logDataAccess('prospect-merge-preview'), async (req, res) => {
  try {
    const { client_id } = req.query as { client_id?: string };
    if (!client_id) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'client_id query parameter is required' },
      });
    }
    const data = await conversionService.getMergePreview(parseInt(req.params.id), client_id);
    res.json({ data });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Link prospect to customer (Prospect-to-Customer conversion) */
router.post('/prospects/:id/link-customer', logDataAccess('prospect-conversion'), async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'client_id is required' },
      });
    }
    const result = await conversionService.prospectToCustomer(
      parseInt(req.params.id),
      client_id,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result, message: 'Prospect converted to customer successfully' });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Sub-Entity Management — Family Members
// ============================================================================

router.post('/prospects/:id/family-members', async (req, res) => {
  try {
    const result = await prospectService.addFamilyMember(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/prospects/:id/family-members/:memberId', async (req, res) => {
  try {
    const result = await prospectService.updateFamilyMember(
      parseInt(req.params.memberId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/prospects/:id/family-members/:memberId', async (req, res) => {
  try {
    const result = await prospectService.removeFamilyMember(
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

router.post('/prospects/:id/addresses', async (req, res) => {
  try {
    const result = await prospectService.addAddress(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/prospects/:id/addresses/:addressId', async (req, res) => {
  try {
    const result = await prospectService.updateAddress(
      parseInt(req.params.addressId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/prospects/:id/addresses/:addressId', async (req, res) => {
  try {
    const result = await prospectService.removeAddress(
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

router.post('/prospects/:id/identifications', async (req, res) => {
  try {
    const result = await prospectService.addIdentification(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/prospects/:id/identifications/:identId', async (req, res) => {
  try {
    const result = await prospectService.updateIdentification(
      parseInt(req.params.identId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/prospects/:id/identifications/:identId', async (req, res) => {
  try {
    const result = await prospectService.removeIdentification(
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

router.post('/prospects/:id/lifestyle', async (req, res) => {
  try {
    const result = await prospectService.addLifestyle(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/prospects/:id/lifestyle/:lifestyleId', async (req, res) => {
  try {
    const result = await prospectService.updateLifestyle(
      parseInt(req.params.lifestyleId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/prospects/:id/lifestyle/:lifestyleId', async (req, res) => {
  try {
    const result = await prospectService.removeLifestyle(
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

router.post('/prospects/:id/documents', async (req, res) => {
  try {
    const result = await prospectService.addDocument(
      parseInt(req.params.id),
      req.body,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.put('/prospects/:id/documents/:docId', async (req, res) => {
  try {
    const result = await prospectService.updateDocument(
      parseInt(req.params.docId),
      req.body,
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

router.delete('/prospects/:id/documents/:docId', async (req, res) => {
  try {
    const result = await prospectService.removeDocument(
      parseInt(req.params.docId),
      req.userId || 'unknown',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

export default router;
