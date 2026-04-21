/**
 * Pricing Definition API Routes (TrustFees Pro — Phase 2)
 *
 * Provides endpoints for the Pricing Definition library with
 * full CRUD and lifecycle management (DRAFT → PENDING_APPROVAL → ACTIVE → RETIRED).
 *
 *   GET    /                 -- List (query: status, pricing_type, page, pageSize, search)
 *   GET    /:id              -- Get single
 *   POST   /                 -- Create
 *   PUT    /:id              -- Update
 *   POST   /:id/submit       -- Submit for approval
 *   POST   /:id/approve      -- Approve
 *   POST   /:id/reject       -- Reject (body: { comment })
 *   POST   /:id/retire       -- Retire
 */

import { Router } from 'express';
import { pricingDefinitionService } from '../../services/pricing-definition-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List pricing definitions with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      pricing_type: req.query.pricing_type as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await pricingDefinitionService.getAll(filters);
    res.json(result);
  }),
);

/** GET /:id -- Get a single pricing definition */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid pricing definition ID' },
      });
    }

    try {
      const record = await pricingDefinitionService.getById(id);
      res.json({ data: record });
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
// Create & Update
// ============================================================================

/** POST / -- Create a new pricing definition */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const { pricing_code, pricing_name, pricing_type, currency, pricing_tiers, step_windows } =
      req.body;

    if (!pricing_code || !pricing_name || !pricing_type) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'pricing_code, pricing_name, and pricing_type are required',
        },
      });
    }

    try {
      const record = await pricingDefinitionService.create({
        pricing_code,
        pricing_name,
        pricing_type,
        currency,
        pricing_tiers,
        step_windows,
        created_by: req.body.created_by || req.userId || null,
      });

      res.status(201).json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.code === '23505') {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE',
            message: `Pricing code '${pricing_code}' already exists`,
          },
        });
      }
      throw err;
    }
  }),
);

/** PUT /:id -- Update an existing pricing definition */
router.put(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid pricing definition ID' },
      });
    }

    const { pricing_name, pricing_type, currency, pricing_tiers, step_windows } =
      req.body;

    try {
      const record = await pricingDefinitionService.update(id, {
        pricing_name,
        pricing_type,
        currency,
        pricing_tiers,
        step_windows,
        updated_by: req.body.updated_by || req.userId || null,
      });

      res.json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot edit')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Lifecycle Transitions
// ============================================================================

/** POST /:id/submit -- Submit for approval (DRAFT → PENDING_APPROVAL) */
router.post(
  '/:id/submit',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid pricing definition ID' },
      });
    }

    try {
      const record = await pricingDefinitionService.submit(id);
      res.json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot submit')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/approve -- Approve (PENDING_APPROVAL → ACTIVE) */
router.post(
  '/:id/approve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid pricing definition ID' },
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
      const record = await pricingDefinitionService.approve(id, approverId);
      res.json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot approve')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      if (err.message?.includes('Segregation')) {
        return res.status(403).json({
          error: { code: 'SOD_VIOLATION', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/reject -- Reject (PENDING_APPROVAL → DRAFT) */
router.post(
  '/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid pricing definition ID' },
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

    const approverId = req.body.approverId || req.userId || null;

    try {
      const record = await pricingDefinitionService.reject(id, approverId, comment);
      res.json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot reject')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/retire -- Retire (ACTIVE → RETIRED) */
router.post(
  '/:id/retire',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid pricing definition ID' },
      });
    }

    try {
      const record = await pricingDefinitionService.retire(id);
      res.json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot retire')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

export const pricingDefinitionsRouter = router;
