/**
 * Compliance Workbench API Routes (Phase 4A)
 *
 * Provides endpoints for the compliance workbench (breach management,
 * AML alerts, surveillance alerts, STR queue, health score) and
 * compliance rules engine (CRUD + evaluation).
 *
 * Workbench:
 *   GET    /breaches              -- List breaches (paginated, filterable)
 *   GET    /breaches/:id          -- Single breach with rule details
 *   POST   /breaches/:id/resolve  -- Resolve a breach
 *   GET    /aml-alerts            -- AML alerts
 *   GET    /surveillance-alerts   -- Trade surveillance alerts
 *   GET    /str-queue             -- STR queue
 *   GET    /score                 -- Compliance health score
 *
 * Rules:
 *   GET    /rules                    -- List rules
 *   GET    /rules/:id                -- Single rule
 *   POST   /rules                    -- Create rule
 *   PUT    /rules/:id                -- Update rule
 *   DELETE /rules/:id                -- Soft-delete rule
 *   POST   /rules/evaluate-order     -- Evaluate an order
 *   POST   /rules/evaluate-position  -- Evaluate a portfolio position
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { complianceService } from '../../services/compliance-service';
import { complianceRulesService } from '../../services/compliance-rules-service';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// Workbench — Breaches
// ============================================================================

/** GET /breaches -- List breaches with optional filters */
router.get(
  '/breaches',
  asyncHandler(async (req, res) => {
    const filters = {
      portfolioId: req.query.portfolioId as string | undefined,
      status: req.query.status as 'open' | 'resolved' | undefined,
      severity: req.query.severity as string | undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await complianceService.getBreaches(filters);
    res.json(result);
  }),
);

/** GET /breaches/:id -- Single breach with rule details */
router.get(
  '/breaches/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid breach ID' },
      });
    }
    try {
      const result = await complianceService.getBreach(id);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /breaches/:id/resolve -- Resolve a breach */
router.post(
  '/breaches/:id/resolve',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid breach ID' },
      });
    }
    const { resolution } = req.body;
    if (!resolution) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'resolution is required',
        },
      });
    }
    try {
      const result = await complianceService.resolveBreach(id, resolution);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('already resolved')) {
        return res.status(409).json({
          error: { code: 'CONFLICT', message: msg },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Workbench — AML, Surveillance, STR, Score
// ============================================================================

/** GET /aml-alerts -- AML alerts (flagged KYC cases) */
router.get(
  '/aml-alerts',
  asyncHandler(async (req, res) => {
    const filters = {
      riskRating: req.query.riskRating as string | undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await complianceService.getAmlAlerts(filters);
    res.json(result);
  }),
);

/** GET /surveillance-alerts -- Trade surveillance alerts */
router.get(
  '/surveillance-alerts',
  asyncHandler(async (req, res) => {
    const filters = {
      pattern: req.query.pattern as string | undefined,
      disposition: req.query.disposition as string | undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await complianceService.getSurveillanceAlerts(filters);
    res.json(result);
  }),
);

/** GET /str-queue -- Suspicious Transaction Reports queue */
router.get(
  '/str-queue',
  asyncHandler(async (_req, res) => {
    const result = await complianceService.getStrQueue();
    res.json({ data: result });
  }),
);

/** GET /score -- Compliance health score */
router.get(
  '/score',
  asyncHandler(async (_req, res) => {
    const result = await complianceService.getComplianceScore();
    res.json({ data: result });
  }),
);

// ============================================================================
// Rules — CRUD
// ============================================================================

/** GET /rules -- List rules with optional filters */
router.get(
  '/rules',
  asyncHandler(async (req, res) => {
    const filters = {
      ruleType: req.query.ruleType as string | undefined,
      entityType: req.query.entityType as string | undefined,
      isActive:
        req.query.isActive !== undefined
          ? req.query.isActive === 'true'
          : undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await complianceRulesService.getRules(filters);
    res.json(result);
  }),
);

/** POST /rules -- Create a new rule */
router.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const { ruleType, entityType, condition, action, severity } = req.body;

    if (!ruleType || !entityType || !condition || !action || !severity) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message:
            'ruleType, entityType, condition, action, and severity are required',
        },
      });
    }

    const result = await complianceRulesService.createRule({
      ruleType,
      entityType,
      condition,
      action,
      severity,
    });
    res.status(201).json({ data: result });
  }),
);

/** POST /rules/evaluate-order -- Evaluate an order against all active rules */
router.post(
  '/rules/evaluate-order',
  asyncHandler(async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'orderId is required' },
      });
    }

    try {
      const results = await complianceRulesService.evaluateOrder(orderId);
      const allPassed = results.every((r) => r.passed);
      res.json({ data: { orderId, allPassed, results } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /rules/evaluate-position -- Evaluate positions for a portfolio */
router.post(
  '/rules/evaluate-position',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    try {
      const results =
        await complianceRulesService.evaluatePosition(portfolioId);
      const allPassed = results.every((r) => r.passed);
      res.json({ data: { portfolioId, allPassed, results } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
// Rules — Parameterized routes (must come after static /rules/* routes)
// ============================================================================

/** GET /rules/:id -- Single rule */
router.get(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule ID' },
      });
    }
    try {
      const result = await complianceRulesService.getRule(id);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** PUT /rules/:id -- Update a rule */
router.put(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule ID' },
      });
    }
    const { ruleType, entityType, condition, action, severity, isActive } =
      req.body;

    try {
      const result = await complianceRulesService.updateRule(id, {
        ruleType,
        entityType,
        condition,
        action,
        severity,
        isActive,
      });
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** DELETE /rules/:id -- Soft-delete a rule */
router.delete(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule ID' },
      });
    }
    try {
      const result = await complianceRulesService.deleteRule(id);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

export default router;
