/**
 * RM Dashboard API Routes
 *
 * Provides aggregated data for the Relationship Manager cockpit:
 *   GET /api/v1/rm-dashboard/summary        -- Combined overview (book, tasks, pipeline, alerts)
 *   GET /api/v1/rm-dashboard/aum-breakdown   -- AUM breakdown by product type
 *   GET /api/v1/rm-dashboard/pipeline        -- Order pipeline funnel
 *   GET /api/v1/rm-dashboard/alerts          -- Client alerts
 *   GET /api/v1/rm-dashboard/pending-tasks   -- Pending tasks summary
 *
 * All endpoints accept `rmId` as a query parameter (e.g., ?rmId=1).
 */

import { Router } from 'express';
import { rmDashboardService } from '../services/rm-dashboard-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

/**
 * Parse and validate the rmId query parameter.
 * Returns the parsed number or null if missing/invalid.
 */
function parseRmId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** GET /summary -- Combined RM dashboard overview */
router.get('/summary', asyncHandler(async (req, res) => {
  const rmId = parseRmId(req.query.rmId);
  if (rmId === null) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'rmId query parameter is required' } });
  }

  const [bookOfBusiness, pendingTasks, orderPipeline, clientAlerts] = await Promise.all([
    rmDashboardService.getBookOfBusiness(rmId),
    rmDashboardService.getPendingTasks(rmId),
    rmDashboardService.getOrderPipeline(rmId),
    rmDashboardService.getClientAlerts(rmId),
  ]);

  res.json({
    book_of_business: bookOfBusiness,
    pending_tasks: pendingTasks,
    order_pipeline: orderPipeline,
    client_alerts: clientAlerts,
  });
}));

/** GET /aum-breakdown -- AUM breakdown by product type */
router.get('/aum-breakdown', asyncHandler(async (req, res) => {
  const rmId = parseRmId(req.query.rmId);
  if (rmId === null) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'rmId query parameter is required' } });
  }

  const data = await rmDashboardService.getAumByProductType(rmId);
  res.json(data);
}));

/** GET /pipeline -- Order pipeline funnel */
router.get('/pipeline', asyncHandler(async (req, res) => {
  const rmId = parseRmId(req.query.rmId);
  if (rmId === null) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'rmId query parameter is required' } });
  }

  const data = await rmDashboardService.getOrderPipeline(rmId);
  res.json(data);
}));

/** GET /alerts -- Client alerts */
router.get('/alerts', asyncHandler(async (req, res) => {
  const rmId = parseRmId(req.query.rmId);
  if (rmId === null) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'rmId query parameter is required' } });
  }

  const data = await rmDashboardService.getClientAlerts(rmId);
  res.json(data);
}));

/** GET /pending-tasks -- Pending tasks summary */
router.get('/pending-tasks', asyncHandler(async (req, res) => {
  const rmId = parseRmId(req.query.rmId);
  if (rmId === null) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'rmId query parameter is required' } });
  }

  const data = await rmDashboardService.getPendingTasks(rmId);
  res.json(data);
}));

export default router;
