/**
 * Trades & Execution API Routes (Phase 2A)
 *
 * Provides endpoints for aggregation, placement, and fill management:
 *   POST   /api/v1/trades/blocks                    -- Create block from orders
 *   GET    /api/v1/trades/blocks                    -- List working blocks
 *   GET    /api/v1/trades/blocks/suggestions        -- Auto-combine suggestions (Gap #3)
 *   GET    /api/v1/trades/blocks/:id                -- Get block detail with child orders
 *   POST   /api/v1/trades/blocks/:id/allocate       -- Set allocation policy for a block
 *   POST   /api/v1/trades/blocks/:id/place          -- Place block with broker
 *   DELETE /api/v1/trades/blocks/:id/placement      -- Cancel placement
 *   GET    /api/v1/trades/blocks/:id/fills          -- Get fills for a block
 *   POST   /api/v1/trades/fills                     -- Record a fill
 *   GET    /api/v1/trades/fills/order/:orderId      -- Get fills for an order
 *   GET    /api/v1/trades/brokers/compare            -- Broker comparison
 *   GET    /api/v1/trades/aggregation-view           -- Get aggregation view
 */

import { Router } from 'express';
import { aggregationService } from '../services/aggregation-service';
import { placementService } from '../services/placement-service';
import { fillService } from '../services/fill-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// ============================================================================
// Static routes MUST come before parameterized routes to avoid shadowing
// ============================================================================

/** GET /aggregation-view -- Get aggregation view */
router.get('/aggregation-view', asyncHandler(async (req, res) => {
  const traderId = req.query.traderId ? parseInt(req.query.traderId as string) : undefined;
  const result = await aggregationService.getAggregationView(traderId);
  res.json({ data: result, total: result.length });
}));

/** GET /brokers/compare -- Broker comparison */
router.get('/brokers/compare', asyncHandler(async (req, res) => {
  const securityId = parseInt(req.query.securityId as string);
  if (!securityId || isNaN(securityId)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'securityId query parameter is required' } });
  }
  const result = await placementService.getBrokerComparison(securityId);
  res.json({ data: result, total: result.length });
}));

// ============================================================================
// Block routes
// ============================================================================

/** POST /blocks -- Create block from orders */
router.post('/blocks', asyncHandler(async (req, res) => {
  const { orderIds, traderId } = req.body;
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'orderIds array is required and must not be empty' } });
  }
  if (!traderId) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'traderId is required' } });
  }
  const block = await aggregationService.createBlock(orderIds, traderId);
  res.status(201).json(block);
}));

/** GET /blocks -- List working blocks */
router.get('/blocks', asyncHandler(async (req, res) => {
  const blocks = await aggregationService.getWorkingBlocks();
  res.json({ data: blocks, total: blocks.length });
}));

/** GET /blocks/suggestions -- Auto-combine suggestions (Gap #3) */
router.get('/blocks/suggestions', asyncHandler(async (req, res) => {
  const suggestions = await aggregationService.suggestBlocks();
  res.json({ data: suggestions, total: suggestions.length });
}));

/** GET /blocks/:id -- Get block detail with child orders */
router.get('/blocks/:id', asyncHandler(async (req, res) => {
  const block = await aggregationService.getBlock(req.params.id);
  if (!block) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Block not found' } });
  }
  res.json(block);
}));

/** POST /blocks/:id/allocate -- Set allocation policy for a block */
router.post('/blocks/:id/allocate', asyncHandler(async (req, res) => {
  const { policy } = req.body;
  if (!policy || !['PRO_RATA', 'PRIORITY'].includes(policy)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'policy must be PRO_RATA or PRIORITY' } });
  }
  const result = await aggregationService.allocateBlock(req.params.id, policy);
  res.json(result);
}));

/** POST /blocks/:id/place -- Place block with broker */
router.post('/blocks/:id/place', asyncHandler(async (req, res) => {
  const { brokerId } = req.body;
  if (!brokerId) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'brokerId is required' } });
  }
  const result = await placementService.placeBlock(req.params.id, brokerId);
  res.json(result);
}));

/** DELETE /blocks/:id/placement -- Cancel placement */
router.delete('/blocks/:id/placement', asyncHandler(async (req, res) => {
  const result = await placementService.cancelPlacement(req.params.id);
  res.json(result);
}));

/** GET /blocks/:id/fills -- Get fills for a block */
router.get('/blocks/:id/fills', asyncHandler(async (req, res) => {
  const fills = await fillService.getBlockFills(req.params.id);
  res.json({ data: fills, total: fills.length });
}));

// ============================================================================
// Fill routes
// ============================================================================

/** POST /fills -- Record a fill */
router.post('/fills', asyncHandler(async (req, res) => {
  const { blockId, brokerId, executionPrice, executionQty, executionTime } = req.body;
  if (!blockId || !brokerId || executionPrice === undefined || executionQty === undefined) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'blockId, brokerId, executionPrice, and executionQty are required' },
    });
  }
  const result = await fillService.recordFill({
    blockId,
    brokerId,
    executionPrice: parseFloat(executionPrice),
    executionQty: parseFloat(executionQty),
    executionTime: executionTime ? new Date(executionTime) : undefined,
  });
  res.status(201).json(result);
}));

/** GET /fills/order/:orderId -- Get fills for an order */
router.get('/fills/order/:orderId', asyncHandler(async (req, res) => {
  const fills = await fillService.getOrderFills(req.params.orderId);
  res.json({ data: fills, total: fills.length });
}));

export default router;
