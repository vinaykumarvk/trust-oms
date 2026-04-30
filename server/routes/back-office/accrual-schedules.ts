/**
 * Accrual Schedule Library API Routes (Phase 4 — TrustFees Pro)
 *
 * Provides CRUD + lifecycle endpoints for accrual schedule definitions.
 *
 *   GET    /               -- List (query: status, page, pageSize, search)
 *   GET    /:id            -- Single schedule
 *   POST   /               -- Create
 *   PUT    /:id            -- Update
 *   POST   /:id/submit     -- Submit for approval
 *   POST   /:id/approve    -- Approve (SoD)
 *   POST   /:id/reject     -- Reject back to DRAFT
 *   POST   /:id/retire     -- Retire (blocked if ACTIVE feePlans reference it)
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { accrualScheduleService } from '../../services/accrual-schedule-service';
import { asyncHandler } from '../../middleware/async-handler';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List
// ============================================================================

/** GET / -- List accrual schedules with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    };
    const result = await accrualScheduleService.getAll(filters);
    res.json(result);
  }),
);

// ============================================================================
// Single
// ============================================================================

/** GET /:id -- Get a single accrual schedule */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid schedule ID' },
      });
    }

    try {
      const schedule = await accrualScheduleService.getById(id);
      res.json({ data: schedule });
    } catch (err) {
      const msg = safeErrorMessage(err);
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
// Create
// ============================================================================

/** POST / -- Create a new accrual schedule */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { schedule_code, schedule_name } = req.body;

    if (!schedule_code || !schedule_name) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'schedule_code and schedule_name are required',
        },
      });
    }

    try {
      const schedule = await accrualScheduleService.create(req.body);
      res.status(201).json({ data: schedule });
    } catch (err) {
      const msg = safeErrorMessage(err);
      const code = (err as { code?: string })?.code;
      if (msg.includes('Validation failed')) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: msg },
        });
      }
      if (msg.includes('unique') || code === '23505') {
        return res.status(409).json({
          error: { code: 'DUPLICATE', message: `Schedule code '${schedule_code}' already exists` },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Update
// ============================================================================

/** PUT /:id -- Update an existing accrual schedule */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid schedule ID' },
      });
    }

    try {
      const updated = await accrualScheduleService.update(id, req.body);
      res.json({ data: updated });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (msg.includes('Cannot update') || msg.includes('Validation failed')) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: msg } });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Lifecycle
// ============================================================================

/** POST /:id/submit -- Submit for approval */
router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid schedule ID' },
      });
    }

    try {
      const updated = await accrualScheduleService.submit(id);
      res.json({ data: updated });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (msg.includes('Cannot submit') || msg.includes('Validation failed')) {
        return res.status(400).json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

/** POST /:id/approve -- Approve schedule (SoD) */
router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid schedule ID' },
      });
    }

    try {
      const updated = await accrualScheduleService.approve(id);
      res.json({ data: updated });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (msg.includes('Cannot approve')) {
        return res.status(400).json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

/** POST /:id/reject -- Reject schedule back to DRAFT */
router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid schedule ID' },
      });
    }

    try {
      const updated = await accrualScheduleService.reject(id);
      res.json({ data: updated });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (msg.includes('Cannot reject')) {
        return res.status(400).json({ error: { code: 'INVALID_STATE', message: msg } });
      }
      throw err;
    }
  }),
);

/** POST /:id/retire -- Retire schedule (blocked if active fee plans reference it) */
router.post(
  '/:id/retire',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid schedule ID' },
      });
    }

    try {
      const updated = await accrualScheduleService.retire(id);
      res.json({ data: updated });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      if (msg.includes('Cannot retire')) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: msg } });
      }
      throw err;
    }
  }),
);

export default router;
