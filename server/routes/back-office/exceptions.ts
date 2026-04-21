/**
 * Exception Queue Routes (TrustFees Pro -- Phase 8)
 *
 *   GET    /               -- List exceptions (query: severity, exception_type, exception_status, assigned_to, sla_state, customer_id, search, page, pageSize)
 *   GET    /kpi            -- KPI dashboard
 *   GET    /:id            -- Single exception
 *   POST   /               -- Create exception
 *   POST   /:id/assign     -- Assign (body: { user_id })
 *   POST   /:id/resolve    -- Resolve (body: { resolution_notes })
 *   POST   /:id/escalate   -- Escalate (body: { reason? })
 *   POST   /:id/wont-fix   -- Mark won't fix (body: { reason })
 *   POST   /bulk-reassign  -- Bulk reassign (body: { exception_ids, user_id })
 *   POST   /bulk-resolve   -- Bulk resolve (body: { exception_ids, resolution_notes })
 *   POST   /check-sla      -- Manual SLA breach check
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { exceptionQueueService } from '../../services/exception-queue-service';
import { asyncHandler } from '../../middleware/async-handler';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List exceptions with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      severity: req.query.severity as string | undefined,
      exception_type: req.query.exception_type as string | undefined,
      exception_status: req.query.exception_status as string | undefined,
      assigned_to: req.query.assigned_to as string | undefined,
      sla_state: req.query.sla_state as string | undefined,
      customer_id: req.query.customer_id as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await exceptionQueueService.getExceptions(filters);
    res.json(result);
  }),
);

/** GET /kpi -- KPI dashboard */
router.get(
  '/kpi',
  asyncHandler(async (_req, res) => {
    const result = await exceptionQueueService.getKpiDashboard();
    res.json({ data: result });
  }),
);

/** GET /:id -- Single exception */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid exception ID' },
      });
    }

    const [record] = await db
      .select()
      .from(schema.exceptionItems)
      .where(eq(schema.exceptionItems.id, id))
      .limit(1);

    if (!record) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Exception not found: ${id}` },
      });
    }

    res.json({ data: record });
  }),
);

// ============================================================================
// Create & Actions
// ============================================================================

/** POST / -- Create exception */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const {
      exception_type, severity, title, description,
      customer_id, aggregate_type, aggregate_id,
    } = req.body;

    if (!exception_type || !title || !description || !aggregate_type || !aggregate_id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'exception_type, title, description, aggregate_type, and aggregate_id are required',
        },
      });
    }

    const record = await exceptionQueueService.createException({
      exception_type,
      severity,
      title,
      description,
      customer_id,
      aggregate_type,
      aggregate_id,
    });

    res.status(201).json({ data: record });
  }),
);

/** POST /:id/assign -- Assign exception to user */
router.post(
  '/:id/assign',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid exception ID' },
      });
    }

    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'user_id is required' },
      });
    }

    try {
      const record = await exceptionQueueService.assignException(id, user_id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot assign')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/resolve -- Resolve exception */
router.post(
  '/:id/resolve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid exception ID' },
      });
    }

    const { resolution_notes } = req.body;
    if (!resolution_notes) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'resolution_notes is required' },
      });
    }

    try {
      const record = await exceptionQueueService.resolveException(id, resolution_notes);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot resolve')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/escalate -- Escalate exception */
router.post(
  '/:id/escalate',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid exception ID' },
      });
    }

    try {
      const record = await exceptionQueueService.escalateException(id, req.body.reason);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot escalate')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/wont-fix -- Mark as won't fix */
router.post(
  '/:id/wont-fix',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid exception ID' },
      });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }

    try {
      const record = await exceptionQueueService.markWontFix(id, reason);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot mark')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Bulk Operations
// ============================================================================

/** POST /bulk-reassign -- Bulk reassign exceptions */
router.post(
  '/bulk-reassign',
  asyncHandler(async (req: any, res: any) => {
    const { exception_ids, user_id } = req.body;

    if (!exception_ids || !Array.isArray(exception_ids) || !exception_ids.length) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'exception_ids array is required' },
      });
    }
    if (!user_id) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'user_id is required' },
      });
    }

    const result = await exceptionQueueService.bulkReassign(exception_ids, user_id);
    res.json({ data: result });
  }),
);

/** POST /bulk-resolve -- Bulk resolve exceptions */
router.post(
  '/bulk-resolve',
  asyncHandler(async (req: any, res: any) => {
    const { exception_ids, resolution_notes } = req.body;

    if (!exception_ids || !Array.isArray(exception_ids) || !exception_ids.length) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'exception_ids array is required' },
      });
    }
    if (!resolution_notes) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'resolution_notes is required' },
      });
    }

    const result = await exceptionQueueService.bulkResolve(exception_ids, resolution_notes);
    res.json({ data: result });
  }),
);

/** POST /check-sla -- Manual SLA breach check */
router.post(
  '/check-sla',
  asyncHandler(async (_req, res) => {
    const result = await exceptionQueueService.checkSlaBreaches();
    res.json({ data: result });
  }),
);

export default router;
