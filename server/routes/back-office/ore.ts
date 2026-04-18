/**
 * ORE (Operational Risk Events) Ledger API Routes (Phase 4C)
 *
 * Provides endpoints for managing the Operational Risk Event ledger
 * per Basel II event-type taxonomy and BSP reporting requirements.
 *
 *   GET    /                      — List ORE events (paginated, filterable)
 *   GET    /quarterly-report      — Generate quarterly ORE report
 *   GET    /:id                   — Get single ORE event
 *   POST   /                      — Record new ORE event
 *   POST   /:id/quantify         — Quantify loss figures
 *   POST   /:id/root-cause       — Record root cause & corrective action
 *   POST   /:id/report-bsp       — Mark as reported to BSP
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { oreService } from '../../services/ore-service';

const router = Router();

/** GET / — List ORE events with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      baselCategory: req.query.baselCategory as string | undefined,
      reportedToBsp:
        req.query.reportedToBsp !== undefined
          ? req.query.reportedToBsp === 'true'
          : undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await oreService.getEvents(filters);
    res.json(result);
  }),
);

/** GET /quarterly-report — Generate quarterly ORE report */
router.get(
  '/quarterly-report',
  asyncHandler(async (req, res) => {
    const quarter = req.query.quarter as string;
    if (!quarter) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'quarter query parameter is required (e.g. "2026-Q1")',
        },
      });
    }

    const report = await oreService.generateQuarterlyReport(quarter);
    res.json(report);
  }),
);

/** GET /:id — Get single ORE event */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid event ID' },
      });
    }

    const event = await oreService.getEvent(id);
    if (!event) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `ORE event ${id} not found` },
      });
    }

    res.json(event);
  }),
);

/** POST / — Record a new ORE event */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { baselCategory, description } = req.body;

    if (!baselCategory || !description) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'baselCategory and description are required',
        },
      });
    }

    const event = await oreService.recordEvent({ baselCategory, description });
    res.status(201).json(event);
  }),
);

/** POST /:id/quantify — Quantify loss figures for an ORE event */
router.post(
  '/:id/quantify',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid event ID' },
      });
    }

    const { grossLoss, netLoss, recovery } = req.body;

    if (grossLoss == null || netLoss == null || recovery == null) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'grossLoss, netLoss, and recovery are required',
        },
      });
    }

    const event = await oreService.quantifyLoss(
      id,
      parseFloat(grossLoss),
      parseFloat(netLoss),
      parseFloat(recovery),
    );
    res.json(event);
  }),
);

/** POST /:id/root-cause — Record root cause and corrective action */
router.post(
  '/:id/root-cause',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid event ID' },
      });
    }

    const { rootCause, correctiveAction } = req.body;

    if (!rootCause || !correctiveAction) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'rootCause and correctiveAction are required',
        },
      });
    }

    const event = await oreService.recordRootCause(id, rootCause, correctiveAction);
    res.json(event);
  }),
);

/** POST /:id/report-bsp — Mark event as reported to BSP */
router.post(
  '/:id/report-bsp',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid event ID' },
      });
    }

    const event = await oreService.markReportedToBSP(id);
    res.json(event);
  }),
);

export default router;
