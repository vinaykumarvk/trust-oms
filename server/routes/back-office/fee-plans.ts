/**
 * Fee Plan API Routes (TrustFees Pro -- Phase 5)
 *
 * Provides endpoints for Fee Plan management with full lifecycle:
 *   DRAFT -> PENDING_APPROVAL -> ACTIVE -> EXPIRED / SUSPENDED / SUPERSEDED
 *
 *   GET    /                         -- List (query: plan_status, fee_type, jurisdiction_id, page, pageSize, search)
 *   GET    /:id                      -- Get single plan with resolved references
 *   POST   /                         -- Create fee plan
 *   PUT    /:id                      -- Update draft plan
 *   POST   /:id/submit               -- Submit for approval
 *   POST   /:id/approve              -- Approve
 *   POST   /:id/reject               -- Reject (body: { comment })
 *   POST   /:id/suspend              -- Suspend
 *   POST   /:id/supersede            -- Supersede (creates new DRAFT clone)
 *   POST   /:id/rebind-pricing       -- Rebind pricing version (body: { pricing_version_id })
 *   POST   /compute-preview          -- Live fee computation preview
 *   GET    /by-pricing/:pricingId    -- Plans referencing a pricing definition
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { feePlanService } from '../../services/fee-plan-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List fee plans with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      plan_status: req.query.plan_status as string | undefined,
      fee_type: req.query.fee_type as string | undefined,
      jurisdiction_id: req.query.jurisdiction_id
        ? parseInt(req.query.jurisdiction_id as string, 10)
        : undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await feePlanService.getAll(filters);
    res.json(result);
  }),
);

/** GET /by-pricing/:pricingId -- Plans referencing a pricing definition */
router.get(
  '/by-pricing/:pricingId',
  asyncHandler(async (req: any, res: any) => {
    const pricingId = parseInt(req.params.pricingId, 10);
    if (isNaN(pricingId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid pricing definition ID' },
      });
    }

    const data = await feePlanService.getFeePlansForPricingVersion(pricingId);
    res.json({ data });
  }),
);

/** GET /:id -- Get a single fee plan with resolved references */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    try {
      const record = await feePlanService.getById(id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Create & Update
// ============================================================================

/** POST / -- Create a new fee plan */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const {
      fee_plan_code, fee_plan_name, description, charge_basis, fee_type,
      pricing_definition_id, pricing_binding_mode, eligibility_expression_id,
      accrual_schedule_id, jurisdiction_id, source_party, target_party,
      comparison_basis, value_basis, event_type,
      min_charge_amount, max_charge_amount,
      lower_threshold_pct, upper_threshold_pct, rate_type,
      aum_basis_include_uitf, aum_basis_include_3p_funds,
      market_value_includes_accruals_override,
      effective_date, expiry_date, template_id,
    } = req.body;

    if (!fee_plan_code || !fee_plan_name || !charge_basis || !fee_type || !source_party || !target_party || !comparison_basis || !value_basis || !effective_date) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'fee_plan_code, fee_plan_name, charge_basis, fee_type, source_party, target_party, comparison_basis, value_basis, and effective_date are required',
        },
      });
    }

    try {
      const record = await feePlanService.create({
        fee_plan_code, fee_plan_name, description, charge_basis, fee_type,
        pricing_definition_id, pricing_binding_mode, eligibility_expression_id,
        accrual_schedule_id, jurisdiction_id, source_party, target_party,
        comparison_basis, value_basis, event_type,
        min_charge_amount, max_charge_amount,
        lower_threshold_pct, upper_threshold_pct, rate_type,
        aum_basis_include_uitf, aum_basis_include_3p_funds,
        market_value_includes_accruals_override,
        effective_date, expiry_date, template_id,
        created_by: req.body.created_by || req.userId || null,
      });

      res.status(201).json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      if (msg.includes('duplicate') || code === '23505') {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE',
            message: `Fee plan code '${fee_plan_code}' already exists`,
          },
        });
      }
      if (msg.includes('requires')) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: msg },
        });
      }
      if (msg.includes('inactive') || msg.includes('not found')) {
        return res.status(422).json({
          error: { code: 'INVALID_REFERENCE', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** PUT /:id -- Update an existing DRAFT fee plan */
router.put(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    try {
      const record = await feePlanService.update(id, {
        ...req.body,
        updated_by: req.body.updated_by || req.userId || null,
      });
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot edit')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Lifecycle Transitions
// ============================================================================

/** POST /:id/submit -- Submit for approval (DRAFT -> PENDING_APPROVAL) */
router.post(
  '/:id/submit',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    try {
      const record = await feePlanService.submit(id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot submit')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/approve -- Approve (PENDING_APPROVAL -> ACTIVE) */
router.post(
  '/:id/approve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    const approverId = req.body.approverId || req.userId || null;
    if (!approverId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'approverId is required',
        },
      });
    }

    try {
      const record = await feePlanService.approve(id, approverId);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot approve')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      if (msg.includes('Segregation')) {
        return res.status(403).json({
          error: { code: 'SOD_VIOLATION', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/reject -- Reject (PENDING_APPROVAL -> DRAFT) */
router.post(
  '/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    const { comment } = req.body;
    if (!comment) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'comment is required when rejecting',
        },
      });
    }

    // GAP-C02: Rejection comment must be at least 10 characters
    if (comment.trim().length < 10) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Rejection comment must be at least 10 characters',
        },
      });
    }

    const approverId = req.body.approverId || req.userId || null;

    try {
      const record = await feePlanService.reject(id, approverId, comment);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot reject')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/suspend -- Suspend (ACTIVE -> SUSPENDED) */
router.post(
  '/:id/suspend',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    try {
      const record = await feePlanService.suspend(id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot suspend')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/supersede -- Supersede (ACTIVE -> SUPERSEDED, creates new DRAFT clone) */
router.post(
  '/:id/supersede',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    try {
      const result = await feePlanService.supersede(id);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot supersede')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/rebind-pricing -- Rebind pricing version for STRICT-bound plans */
router.post(
  '/:id/rebind-pricing',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fee plan ID' },
      });
    }

    const { pricing_version_id } = req.body;
    if (!pricing_version_id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'pricing_version_id is required',
        },
      });
    }

    try {
      const record = await feePlanService.rebindPricing(id, pricing_version_id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('only applicable') || msg.includes('exceeds')) {
        return res.status(422).json({
          error: { code: 'INVALID_OPERATION', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /compute-preview -- Live fee computation preview */
router.post(
  '/compute-preview',
  asyncHandler(async (req: any, res: any) => {
    const { fee_plan_id, aum_value, transaction_amount } = req.body;

    if (!fee_plan_id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'fee_plan_id is required',
        },
      });
    }

    try {
      const result = await feePlanService.computePreview(fee_plan_id, {
        aum_value: aum_value ? parseFloat(aum_value) : undefined,
        transaction_amount: transaction_amount ? parseFloat(transaction_amount) : undefined,
      });
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('no pricing definition')) {
        return res.status(422).json({
          error: { code: 'INVALID_OPERATION', message: msg },
        });
      }
      throw err;
    }
  }),
);

export default router;
