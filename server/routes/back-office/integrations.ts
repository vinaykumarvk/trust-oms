/**
 * Integration Hub API Routes (Phase 6A)
 *
 * Provides endpoints for the BRD 7.1 external connector registry,
 * health monitoring, order routing rules, activity logging,
 * and dry-run simulation for Philippine trust OMS integrations.
 *
 *   GET    /                         -- List all connectors
 *   GET    /routing-rules            -- List routing rules
 *   POST   /routing-rules            -- Create routing rule
 *   PUT    /routing-rules/:ruleId    -- Update routing rule
 *   DELETE /routing-rules/:ruleId    -- Delete routing rule
 *   GET    /activity-log             -- Get activity log
 *   POST   /simulate                 -- Simulate order routing
 *   GET    /:id                      -- Get connector detail
 *   POST   /:id/test                 -- Test connection
 *   PUT    /:id                      -- Update connector config
 *   GET    /:id/metrics              -- Get connector metrics
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { integrationService } from '../../services/integration-service';

const router = Router();
router.use(requireBackOfficeRole());

// =============================================================================
// Connector List
// =============================================================================

/** GET / -- List all connectors with health status */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const connectors = await integrationService.getConnectors();
    res.json({ data: connectors, total: connectors.length });
  }),
);

// =============================================================================
// Routing Rules (must be registered BEFORE /:id to avoid conflict)
// =============================================================================

/** GET /routing-rules -- List all order routing rules */
router.get(
  '/routing-rules',
  asyncHandler(async (_req, res) => {
    const rules = await integrationService.getRoutingRules();
    res.json({ data: rules, total: rules.length });
  }),
);

/** POST /routing-rules -- Create a new routing rule */
router.post(
  '/routing-rules',
  asyncHandler(async (req, res) => {
    const { security_type, side, connector_id, fallback_connector_id, priority } = req.body;

    if (!security_type || !side || !connector_id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'security_type, side, and connector_id are required',
        },
      });
    }

    const validSides = ['BUY', 'SELL', 'ANY'];
    if (!validSides.includes(side)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `side must be one of: ${validSides.join(', ')}`,
        },
      });
    }

    const rule = await integrationService.createRoutingRule({
      security_type,
      side,
      connector_id,
      fallback_connector_id,
      priority,
    });

    res.status(201).json({ data: rule });
  }),
);

/** PUT /routing-rules/:ruleId -- Update a routing rule */
router.put(
  '/routing-rules/:ruleId',
  asyncHandler(async (req, res) => {
    const { ruleId } = req.params;
    const { security_type, side, connector_id, fallback_connector_id, priority, enabled } = req.body;

    const rule = await integrationService.updateRoutingRule(ruleId, {
      security_type,
      side,
      connector_id,
      fallback_connector_id,
      priority,
      enabled,
    });

    res.json({ data: rule });
  }),
);

/** DELETE /routing-rules/:ruleId -- Delete a routing rule */
router.delete(
  '/routing-rules/:ruleId',
  asyncHandler(async (req, res) => {
    const { ruleId } = req.params;
    const result = await integrationService.deleteRoutingRule(ruleId);
    res.json({ data: result });
  }),
);

// =============================================================================
// Activity Log
// =============================================================================

/** GET /activity-log -- Get integration activity log with optional filters */
router.get(
  '/activity-log',
  asyncHandler(async (req, res) => {
    const filters = {
      connector: req.query.connector as string | undefined,
      eventType: req.query.eventType as string | undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined,
    };

    const result = await integrationService.getActivityLog(filters);
    res.json(result);
  }),
);

// =============================================================================
// Simulation
// =============================================================================

/** POST /simulate -- Dry-run order routing simulation */
router.post(
  '/simulate',
  asyncHandler(async (req, res) => {
    const { securityType, side, quantity } = req.body;

    if (!securityType || !side) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'securityType and side are required',
        },
      });
    }

    const validSides = ['BUY', 'SELL'];
    if (!validSides.includes(side)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `side must be one of: ${validSides.join(', ')}`,
        },
      });
    }

    const qty = typeof quantity === 'number' && quantity > 0 ? quantity : 1000;

    const result = await integrationService.simulateOrderRouting(securityType, side, qty);
    res.json({ data: result });
  }),
);

// =============================================================================
// Connector Detail (after static routes to avoid /:id catching 'routing-rules')
// =============================================================================

/** GET /:id -- Get a single connector's detail */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const connector = await integrationService.getConnector(id);
    res.json({ data: connector });
  }),
);

/** POST /:id/test -- Test connection to a connector */
router.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await integrationService.testConnection(id);
    res.json({ data: result });
  }),
);

/** PUT /:id -- Update a connector's configuration */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { endpoint, status, enabled, credentials_configured } = req.body;

    const validStatuses = ['HEALTHY', 'DEGRADED', 'DOWN', 'DISABLED'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `status must be one of: ${validStatuses.join(', ')}`,
        },
      });
    }

    const connector = await integrationService.updateConnector(id, {
      endpoint,
      status,
      enabled,
      credentials_configured,
    });

    res.json({ data: connector });
  }),
);

/** GET /:id/metrics -- Get connector performance metrics */
router.get(
  '/:id/metrics',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const period = (req.query.period as string) || '24h';

    const validPeriods = ['1h', '6h', '24h', '7d', '30d'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `period must be one of: ${validPeriods.join(', ')}`,
        },
      });
    }

    const metrics = await integrationService.getConnectorMetrics(id, period);
    res.json({ data: metrics });
  }),
);

export default router;
