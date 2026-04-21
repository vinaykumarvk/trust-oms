/**
 * Fee Plan Template Library API Routes (Phase 4 — TrustFees Pro)
 *
 * Provides CRUD + instantiation endpoints for fee plan templates.
 *
 *   GET    /                   -- List (query: category, page, pageSize, search)
 *   GET    /:id                -- Single template
 *   POST   /                   -- Create
 *   PUT    /:id                -- Update
 *   POST   /:id/toggle-active  -- Toggle active status
 *   GET    /:id/instantiate    -- Get pre-filled FeePlan from template
 */

import { Router } from 'express';
import { feePlanTemplateService } from '../../services/fee-plan-template-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// List
// ============================================================================

/** GET / -- List fee plan templates with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    };
    const result = await feePlanTemplateService.getAll(filters);
    res.json(result);
  }),
);

// ============================================================================
// Single
// ============================================================================

/** GET /:id -- Get a single fee plan template */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid template ID' },
      });
    }

    try {
      const template = await feePlanTemplateService.getById(id);
      res.json({ data: template });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Instantiate (must be before /:id to avoid route conflict)
// ============================================================================

/** GET /:id/instantiate -- Get pre-filled FeePlan fields from template */
router.get(
  '/:id/instantiate',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid template ID' },
      });
    }

    try {
      const prefilledPlan = await feePlanTemplateService.instantiate(id);
      res.json({ data: prefilledPlan });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
      }
      if (err.message?.includes('inactive')) {
        return res.status(400).json({ error: { code: 'INACTIVE_TEMPLATE', message: err.message } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Create
// ============================================================================

/** POST / -- Create a new fee plan template */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { template_code, template_name, category, default_payload } = req.body;

    if (!template_code || !template_name || !category || !default_payload) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'template_code, template_name, category, and default_payload are required',
        },
      });
    }

    try {
      const template = await feePlanTemplateService.create(req.body);
      res.status(201).json({ data: template });
    } catch (err: any) {
      if (err.message?.includes('Validation') || err.message?.includes('required')) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: err.message },
        });
      }
      if (err.message?.includes('unique') || err.code === '23505') {
        return res.status(409).json({
          error: { code: 'DUPLICATE', message: `Template code '${template_code}' already exists` },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Update
// ============================================================================

/** PUT /:id -- Update an existing fee plan template */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid template ID' },
      });
    }

    try {
      const updated = await feePlanTemplateService.update(id, req.body);
      res.json({ data: updated });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Toggle Active
// ============================================================================

/** POST /:id/toggle-active -- Toggle active/inactive status */
router.post(
  '/:id/toggle-active',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid template ID' },
      });
    }

    try {
      const updated = await feePlanTemplateService.toggleActive(id);
      res.json({ data: updated });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
      }
      throw err;
    }
  }),
);

export default router;
