/**
 * Eligibility Expression API Routes (TrustFees Pro — Phase 3)
 *
 * CRUD + approval lifecycle + test evaluation for eligibility expressions.
 *
 *   GET    /                  -- List (?status, page, pageSize, search)
 *   GET    /:id               -- Single expression
 *   POST   /                  -- Create
 *   PUT    /:id               -- Update (DRAFT only)
 *   POST   /:id/submit        -- Submit for approval
 *   POST   /:id/approve       -- Approve (SoD enforced)
 *   POST   /:id/reject        -- Reject → back to DRAFT
 *   POST   /:id/retire        -- Retire (blocked if active fee-plan refs)
 *   POST   /:id/test          -- Test expression (body: { context: {...} })
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { eligibilityExpressionService } from '../../services/eligibility-expression-service';
import { asyncHandler } from '../../middleware/async-handler';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List eligibility expressions */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };
    const result = await eligibilityExpressionService.getAll(filters);
    res.json(result);
  }),
);

/** GET /:id -- Single eligibility expression */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Invalid ID' } });
    }

    try {
      const record = await eligibilityExpressionService.getById(id);
      res.json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Create & Update
// ============================================================================

/** POST / -- Create a new eligibility expression */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const { eligibilityCode, eligibilityName, expression } = req.body;

    if (!eligibilityCode || !eligibilityName || !expression) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'eligibilityCode, eligibilityName, and expression are required',
        },
      });
    }

    try {
      const record = await eligibilityExpressionService.create({
        eligibilityCode,
        eligibilityName,
        expression,
        createdBy: req.userId ?? req.body.createdBy,
      });
      res.status(201).json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('Invalid expression')) {
        return res.status(400).json({
          error: { code: 'INVALID_EXPRESSION', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** PUT /:id -- Update an existing DRAFT expression */
router.put(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Invalid ID' } });
    }

    const { eligibilityName, expression } = req.body;

    try {
      const record = await eligibilityExpressionService.update(id, {
        eligibilityName,
        expression,
        updatedBy: req.userId ?? req.body.updatedBy,
      });
      res.json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (
        msg.includes('Only DRAFT') ||
        msg.includes('Invalid expression')
      ) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Lifecycle: Submit / Approve / Reject / Retire
// ============================================================================

/** POST /:id/submit -- Submit for approval */
router.post(
  '/:id/submit',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Invalid ID' } });
    }

    try {
      const record = await eligibilityExpressionService.submit(
        id,
        req.userId ?? req.body.submittedBy,
      );
      res.json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (msg.includes('Only DRAFT')) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

/** POST /:id/approve -- Approve (SoD enforced) */
router.post(
  '/:id/approve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Invalid ID' } });
    }

    try {
      const record = await eligibilityExpressionService.approve(
        id,
        req.userId ?? req.body.approvedBy,
      );
      res.json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (
        msg.includes('Only PENDING_APPROVAL') ||
        msg.includes('Separation of Duties')
      ) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

/** POST /:id/reject -- Reject (returns to DRAFT) */
router.post(
  '/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Invalid ID' } });
    }

    try {
      const record = await eligibilityExpressionService.reject(
        id,
        req.userId ?? req.body.rejectedBy,
      );
      res.json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (msg.includes('Only PENDING_APPROVAL')) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

/** POST /:id/retire -- Retire (blocked if referenced by ACTIVE fee plans) */
router.post(
  '/:id/retire',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Invalid ID' } });
    }

    try {
      const record = await eligibilityExpressionService.retire(
        id,
        req.userId ?? req.body.retiredBy,
      );
      res.json({ data: record });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (
        msg.includes('Only ACTIVE') ||
        msg.includes('Cannot retire')
      ) {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Test Expression
// ============================================================================

/** POST /:id/test -- Test expression against a sample context */
router.post(
  '/:id/test',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Invalid ID' } });
    }

    const { context } = req.body;
    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'context object is required in request body',
        },
      });
    }

    try {
      const result = await eligibilityExpressionService.testExpression(id, context);
      res.json({ data: result });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      throw err;
    }
  }),
);

export default router;
