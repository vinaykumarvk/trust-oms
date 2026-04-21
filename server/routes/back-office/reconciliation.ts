/**
 * Reconciliation API Routes (Phase 3B)
 *
 * Provides endpoints for triggering reconciliation runs,
 * viewing/resolving breaks, and aging analysis.
 *
 *   GET    /runs              -- Recon run history (?type, page, pageSize)
 *   POST   /runs/internal-triad -- Trigger internal triad recon (body: { date, triggeredBy })
 *   POST   /runs/transaction  -- Trigger transaction recon (body: { date, triggeredBy })
 *   POST   /runs/position     -- Trigger position recon (body: { date, triggeredBy })
 *   GET    /breaks            -- Get breaks (?type, status, page, pageSize)
 *   GET    /breaks/aging      -- Break aging buckets
 *   POST   /breaks/:id/resolve -- Resolve break (body: { resolvedBy, notes })
 */

import { Router } from 'express';
import { reconciliationService } from '../../services/reconciliation-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// Static routes
// ============================================================================

/** GET /summary -- Reconciliation summary */
router.get('/summary', asyncHandler(async (req: any, res: any) => {
  const summary = await reconciliationService.getSummary();
  res.json(summary);
}));

/** GET /runs -- Recon run history */
router.get(
  '/runs',
  asyncHandler(async (req, res) => {
    const type = req.query.type as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const pageSize = req.query.pageSize
      ? parseInt(req.query.pageSize as string)
      : undefined;
    const result = await reconciliationService.getRunHistory({
      type,
      page,
      pageSize,
    });
    res.json(result);
  }),
);

/** POST /runs/internal-triad -- Trigger internal triad reconciliation */
router.post(
  '/runs/internal-triad',
  asyncHandler(async (req: any, res: any) => {
    const runDate = req.body.date || req.body.run_date;
    const { triggeredBy } = req.body;
    if (!runDate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date is required (YYYY-MM-DD)',
        },
      });
    }
    const result = await reconciliationService.runInternalTriadRecon(
      runDate,
      triggeredBy ? parseInt(triggeredBy, 10) : undefined,
    );
    res.status(201).json({ data: result });
  }),
);

/** POST /runs/transaction -- Trigger transaction reconciliation */
router.post(
  '/runs/transaction',
  asyncHandler(async (req: any, res: any) => {
    const runDate = req.body.date || req.body.run_date;
    const { triggeredBy } = req.body;
    if (!runDate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date is required (YYYY-MM-DD)',
        },
      });
    }
    const result = await reconciliationService.runTransactionRecon(
      runDate,
      triggeredBy ? parseInt(triggeredBy, 10) : undefined,
    );
    res.status(201).json({ data: result });
  }),
);

/** POST /runs/position -- Trigger position reconciliation */
router.post(
  '/runs/position',
  asyncHandler(async (req, res) => {
    const { date, triggeredBy } = req.body;
    if (!date) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date is required (YYYY-MM-DD)',
        },
      });
    }
    const result = await reconciliationService.runPositionRecon(
      date,
      triggeredBy ? parseInt(triggeredBy, 10) : undefined,
    );
    res.status(201).json({ data: result });
  }),
);

/** GET /breaks -- Get breaks with filters */
router.get(
  '/breaks',
  asyncHandler(async (req, res) => {
    const result = await reconciliationService.getBreaks({
      type: req.query.type as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string)
        : undefined,
    });
    res.json(result);
  }),
);

/** GET /breaks/aging -- Break aging buckets */
router.get(
  '/breaks/aging',
  asyncHandler(async (_req, res) => {
    const result = await reconciliationService.getBreakAging();
    res.json({ data: result });
  }),
);

// ============================================================================
// Parameterized routes
// ============================================================================

/** POST /breaks/:id/resolve -- Resolve a break */
router.post(
  '/breaks/:id/resolve',
  asyncHandler(async (req: any, res: any) => {
    const breakId = parseInt(req.params.id, 10);
    if (isNaN(breakId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid break ID' },
      });
    }

    const resolvedBy = req.body.resolvedBy || req.userId || 'system';
    const { notes } = req.body;
    if (!notes) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'notes is required' },
      });
    }

    const result = await reconciliationService.resolveBreak(breakId, {
      resolvedBy: parseInt(resolvedBy, 10),
      notes,
    });
    res.json({ data: result });
  }),
);

export default router;
