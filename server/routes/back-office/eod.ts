/**
 * EOD Processing API Routes (Phase 3B)
 *
 * Provides endpoints for triggering, monitoring, and managing
 * End-of-Day processing runs.
 *
 *   GET    /status           -- Latest EOD run status
 *   GET    /status/:runId    -- Specific run status with jobs
 *   POST   /trigger          -- Trigger new run (body: { runDate, triggeredBy })
 *   POST   /jobs/:id/retry   -- Retry failed job
 *   POST   /jobs/:id/skip    -- Skip stuck job
 *   GET    /history          -- Run history (?page, pageSize)
 *   GET    /definitions      -- Job definitions (static DAG)
 */

import { Router } from 'express';
import { eodOrchestrator } from '../../services/eod-orchestrator';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// Static routes
// ============================================================================

/** GET /status -- Latest EOD run status */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const result = await eodOrchestrator.getRunStatus();
    if (!result) {
      return res.json({ data: null, message: 'No EOD runs found' });
    }
    res.json({ data: result });
  }),
);

/** GET /history -- Run history */
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const pageSize = req.query.pageSize
      ? parseInt(req.query.pageSize as string)
      : undefined;
    const result = await eodOrchestrator.getHistory({ page, pageSize });
    res.json(result);
  }),
);

/** GET /definitions -- Job definitions (static DAG) */
router.get(
  '/definitions',
  asyncHandler(async (_req, res) => {
    res.json({ data: eodOrchestrator.getDefinitions() });
  }),
);

/** POST /trigger -- Trigger new EOD run */
router.post(
  '/trigger',
  asyncHandler(async (req: any, res: any) => {
    const runDate = req.body.runDate || req.body.run_date;
    const { triggeredBy } = req.body;
    if (!runDate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'runDate is required (YYYY-MM-DD)',
        },
      });
    }
    if (!triggeredBy) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'triggeredBy (user id) is required',
        },
      });
    }
    const result = await eodOrchestrator.triggerRun(
      runDate,
      parseInt(triggeredBy, 10),
    );
    res.status(201).json({ data: result });
  }),
);

// ============================================================================
// Parameterized routes
// ============================================================================

/** GET /status/:runId -- Specific run status with jobs */
router.get(
  '/status/:runId',
  asyncHandler(async (req, res) => {
    const runId = parseInt(req.params.runId, 10);
    if (isNaN(runId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid run ID' },
      });
    }
    const result = await eodOrchestrator.getRunStatus(runId);
    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `EOD run ${runId} not found` },
      });
    }
    res.json({ data: result });
  }),
);

/** POST /jobs/:id/retry -- Retry a failed job */
router.post(
  '/jobs/:id/retry',
  asyncHandler(async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid job ID' },
      });
    }
    const result = await eodOrchestrator.retryJob(jobId);
    res.json({ data: result });
  }),
);

/** POST /jobs/:id/skip -- Skip a stuck job */
router.post(
  '/jobs/:id/skip',
  asyncHandler(async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid job ID' },
      });
    }
    const result = await eodOrchestrator.skipJob(jobId);
    res.json({ data: result });
  }),
);

export default router;
