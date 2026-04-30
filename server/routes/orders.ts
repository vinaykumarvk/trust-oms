/**
 * Order Management API Routes
 *
 * Provides endpoints for the full order lifecycle:
 *   POST   /api/v1/orders                    -- Create order
 *   GET    /api/v1/orders                    -- List orders (with filtering)
 *   POST   /api/v1/orders/auto-compute       -- Auto-compute missing field (Gap #1)
 *   GET    /api/v1/orders/pending-auth        -- Pending authorization queue
 *   GET    /api/v1/orders/:id                -- Get single order
 *   PUT    /api/v1/orders/:id                -- Update draft order
 *   POST   /api/v1/orders/:id/submit         -- Submit for authorization
 *   POST   /api/v1/orders/:id/authorize      -- Authorize order
 *   POST   /api/v1/orders/:id/reject         -- Reject order (shortcut)
 *   DELETE /api/v1/orders/:id                -- Cancel order
 *   POST   /api/v1/orders/:id/revert         -- Revert/un-cancel (Gap #2)
 *   GET    /api/v1/orders/:id/timeline       -- Order state transition history
 *   GET    /api/v1/orders/:id/authorizations -- Get authorization chain
 */

import { Router } from 'express';
import { orderService } from '../services/order-service';
import { authorizationService } from '../services/authorization-service';
import { suitabilityService } from '../services/suitability-service';
import { notificationService } from '../services/notification-service';
import { asyncHandler } from '../middleware/async-handler';
import { requireFrontOfficeRole, requireAnyRole } from '../middleware/role-auth';

const router = Router();

// Front-office users can create and submit orders
router.use(requireFrontOfficeRole());

/** POST /api/v1/orders -- Create order */
router.post('/', asyncHandler(async (req, res) => {
  const userId = req.userId ?? 'system';
  const order = await orderService.createOrder(req.body, userId);

  // Run suitability check if order has a portfolio
  let suitabilityCheck = null;
  if (order.order_id) {
    try {
      suitabilityCheck = await suitabilityService.checkOrderSuitability(order.order_id);
      // Store result on order
      await orderService.updateOrder(order.order_id, {
        suitability_check_result: suitabilityCheck as any,
      });
    } catch {
      // Non-blocking: suitability check failure doesn't prevent order creation
    }
  }

  // Determine authorization tier
  const orderAmount = parseFloat(order.quantity ?? '0') * parseFloat(order.limit_price ?? '0');
  const tier = authorizationService.determineAuthTier(orderAmount);
  await orderService.updateOrder(order.order_id, {
    authorization_tier: tier,
  });

  res.status(201).json({
    data: {
      ...order,
      authorization_tier: tier,
      suitability_check: suitabilityCheck,
    },
  });
}));

/** GET /api/v1/orders -- List orders */
router.get('/', asyncHandler(async (req, res) => {
  const result = await orderService.listOrders({
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 25,
    status: req.query.status as string,
    portfolio_id: req.query.portfolio_id as string,
    side: req.query.side as string,
    search: req.query.search as string,
    trader_id: req.query.trader_id ? parseInt(req.query.trader_id as string) : undefined,
  });
  res.json(result);
}));

/** POST /api/v1/orders/auto-compute -- Auto-compute missing field (Gap #1) */
router.post('/auto-compute', asyncHandler(async (req, res) => {
  const result = orderService.autoCompute(req.body);
  res.json({ data: result });
}));

/** GET /api/v1/orders/pending-auth -- Pending authorization queue */
router.get('/pending-auth', asyncHandler(async (req, res) => {
  const tier = req.query.tier as string;
  const orders = await authorizationService.getPendingOrders({ tier });
  res.json({ data: orders, total: orders.length });
}));

/** GET /api/v1/orders/:id -- Get single order */
router.get('/:id', asyncHandler(async (req, res) => {
  const order = await orderService.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
  res.json({ data: order });
}));

/** PUT /api/v1/orders/:id -- Update draft order */
router.put('/:id', asyncHandler(async (req, res) => {
  const order = await orderService.updateOrder(req.params.id, req.body);
  res.json({ data: order });
}));

/** POST /api/v1/orders/:id/submit -- Submit for authorization */
router.post('/:id/submit', asyncHandler(async (req, res) => {
  const order = await orderService.submitForAuthorization(req.params.id);
  await notificationService.emitOrderEvent(req.params.id, 'submitted', req.userId ?? 'system');
  res.json({ data: order });
}));

/** POST /api/v1/orders/:id/authorize -- Authorize order (requires senior/checker role) */
router.post('/:id/authorize', requireAnyRole('SENIOR_RM', 'SENIOR_TRADER', 'BO_CHECKER'), asyncHandler(async (req, res) => {
  const { decision, comment } = req.body;
  const approverId = parseInt(req.userId ?? '0', 10);
  const approverRole = req.userRole ?? 'SRM';
  if (!approverId || !decision) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'decision is required' } });
  }

  const result = await authorizationService.authorizeOrder(
    req.params.id, approverId, approverRole, decision, comment
  );

  // Emit notification
  await notificationService.emitOrderEvent(req.params.id, decision.toLowerCase(), req.userId ?? '');

  res.json({ data: result });
}));

/** POST /api/v1/orders/:id/reject -- Reject order (shortcut) */
router.post('/:id/reject', requireAnyRole('SENIOR_RM', 'SENIOR_TRADER', 'BO_CHECKER'), asyncHandler(async (req, res) => {
  const { comment } = req.body;
  const result = await authorizationService.authorizeOrder(
    req.params.id, parseInt(req.userId ?? '0', 10), req.userRole ?? 'SRM', 'REJECTED', comment
  );
  res.json({ data: result });
}));

/** DELETE /api/v1/orders/:id -- Cancel order */
router.delete('/:id', asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id);
  res.json({ data: order });
}));

/** POST /api/v1/orders/:id/revert -- Revert/un-cancel (Gap #2) */
router.post('/:id/revert', asyncHandler(async (req, res) => {
  const order = await orderService.revertOrder(req.params.id);
  res.json({ data: order });
}));

/** GET /api/v1/orders/:id/timeline -- Order state transition history */
router.get('/:id/timeline', asyncHandler(async (req, res) => {
  const timeline = await orderService.getOrderTimeline(req.params.id);
  res.json({ data: timeline, total: timeline.length });
}));

/** GET /api/v1/orders/:id/authorizations -- Get authorization chain */
router.get('/:id/authorizations', asyncHandler(async (req, res) => {
  const auths = await authorizationService.getOrderAuthorizations(req.params.id);
  res.json({ data: auths, total: auths.length });
}));

export default router;
