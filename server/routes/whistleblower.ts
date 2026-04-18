/**
 * Whistleblower Case Management API Routes (Phase 4C)
 *
 * Provides endpoints for whistleblower case intake, review,
 * DPO notification, and conduct risk dashboard.
 *
 *   GET    /                      — List whistleblower cases (CCO only in production)
 *   GET    /conduct-risk          — Conduct risk dashboard
 *   GET    /:id                   — Get single case
 *   POST   /                      — Submit new whistleblower case
 *   POST   /:id/assign           — Assign CCO reviewer
 *   PUT    /:id                   — Update case status/resolution
 *   POST   /:id/notify-dpo       — Notify DPO
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { requireRole } from '../middleware/auth';
import { whistleblowerService } from '../services/whistleblower-service';

const router = Router();

/** GET / — List whistleblower cases with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      anonymous:
        req.query.anonymous !== undefined
          ? req.query.anonymous === 'true'
          : undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await whistleblowerService.getCases(filters);
    res.json(result);
  }),
);

/** GET /conduct-risk — Conduct risk dashboard */
router.get(
  '/conduct-risk',
  asyncHandler(async (_req, res) => {
    const dashboard = await whistleblowerService.getConductRiskDashboard();
    res.json(dashboard);
  }),
);

/** GET /:id — Get single whistleblower case */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid case ID' },
      });
    }

    const wbCase = await whistleblowerService.getCase(id);
    if (!wbCase) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Whistleblower case ${id} not found`,
        },
      });
    }

    res.json(wbCase);
  }),
);

/** POST / — Submit a new whistleblower case */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { channel, description, anonymous } = req.body;

    if (!channel || !description || anonymous == null) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'channel, description, and anonymous are required',
        },
      });
    }

    const wbCase = await whistleblowerService.submitCase({
      channel,
      description,
      anonymous,
    });
    res.status(201).json(wbCase);
  }),
);

/** POST /:id/assign — Assign a CCO reviewer to the case */
router.post(
  '/:id/assign',
  requireRole('COMPLIANCE_OFFICER', 'ETHICS_OFFICER'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid case ID' },
      });
    }

    const { ccoId } = req.body;
    if (!ccoId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'ccoId is required' },
      });
    }

    const wbCase = await whistleblowerService.assignReviewer(
      id,
      parseInt(ccoId, 10),
    );
    res.json(wbCase);
  }),
);

/** PUT /:id — Update case status and/or resolution */
router.put(
  '/:id',
  requireRole('COMPLIANCE_OFFICER', 'ETHICS_OFFICER'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid case ID' },
      });
    }

    const { status, resolution } = req.body;
    if (!status && !resolution) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'At least one of status or resolution is required',
        },
      });
    }

    const wbCase = await whistleblowerService.updateCase(id, {
      status,
      resolution,
    });
    res.json(wbCase);
  }),
);

/** POST /:id/notify-dpo — Notify DPO for this case */
router.post(
  '/:id/notify-dpo',
  requireRole('COMPLIANCE_OFFICER', 'ETHICS_OFFICER'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid case ID' },
      });
    }

    const wbCase = await whistleblowerService.notifyDPO(id);
    res.json(wbCase);
  }),
);

export default router;
