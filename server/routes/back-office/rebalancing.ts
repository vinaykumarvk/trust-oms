/**
 * Rebalancing API Routes (Phase 3H)
 *
 * Portfolio Modeling & Rebalancing — BDO RFI Gap #5 Critical.
 *
 *   GET    /models                          -- List model portfolios
 *   POST   /models                          -- Create model
 *   PUT    /models/:id                      -- Update model
 *   DELETE /models/:id                      -- Soft delete model
 *   GET    /models/:id/compare/:portfolioId -- Compare portfolio to model
 *   GET    /models/:id/actions/:portfolioId -- Get rebalancing actions
 *   POST   /simulate/what-if                -- What-if simulation
 *   POST   /simulate/stress-test            -- Stress test
 *   POST   /simulate/constant-mix           -- Constant mix simulation
 *   POST   /rebalance/single                -- Rebalance single portfolio
 *   POST   /rebalance/group                 -- Rebalance group
 *   POST   /rebalance/cash-event            -- Rebalance on cash event
 *   GET    /runs                            -- List runs
 *   GET    /runs/:id                        -- Get run detail
 *   PUT    /runs/:id/blotter                -- Edit blotter
 *   POST   /runs/:id/approve                -- Approve run
 *   POST   /runs/:id/execute                -- Execute run
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { modelPortfolioService } from '../../services/model-portfolio-service';
import { simulationEngineService } from '../../services/simulation-engine-service';
import { rebalancingService } from '../../services/rebalancing-service';

const router = Router();
router.use(requireBackOfficeRole());

// =============================================================================
// Model Portfolios
// =============================================================================

/** GET /models -- List model portfolios */
router.get(
  '/models',
  asyncHandler(async (req, res) => {
    const isActive =
      req.query.isActive !== undefined
        ? req.query.isActive === 'true'
        : undefined;
    const page = req.query.page
      ? parseInt(req.query.page as string, 10)
      : undefined;
    const pageSize = req.query.pageSize
      ? parseInt(req.query.pageSize as string, 10)
      : undefined;

    const result = await modelPortfolioService.getModels({ isActive, page, pageSize });
    res.json(result);
  }),
);

/** POST /models -- Create model portfolio */
router.post(
  '/models',
  asyncHandler(async (req, res) => {
    const { name, description, allocations, benchmarkId } = req.body;

    if (!name || !allocations || !Array.isArray(allocations)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'name and allocations (array) are required',
        },
      });
    }

    const model = await modelPortfolioService.createModel({
      name,
      description,
      allocations,
      benchmarkId,
    });

    res.status(201).json({ data: model });
  }),
);

/** PUT /models/:id -- Update model portfolio */
router.put(
  '/models/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid model ID' },
      });
    }

    const { name, description, allocations, benchmarkId, isActive } = req.body;
    const model = await modelPortfolioService.updateModel(id, {
      name,
      description,
      allocations,
      benchmarkId,
      isActive,
    });

    res.json({ data: model });
  }),
);

/** DELETE /models/:id -- Soft delete model portfolio */
router.delete(
  '/models/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid model ID' },
      });
    }

    const model = await modelPortfolioService.deleteModel(id);
    res.json({ data: model });
  }),
);

/** GET /models/:id/compare/:portfolioId -- Compare portfolio to model */
router.get(
  '/models/:id/compare/:portfolioId',
  asyncHandler(async (req, res) => {
    const modelId = parseInt(req.params.id, 10);
    if (isNaN(modelId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid model ID' },
      });
    }

    const { portfolioId } = req.params;
    const deviations = await modelPortfolioService.comparePortfolioToModel(
      portfolioId,
      modelId,
    );

    res.json({ data: deviations });
  }),
);

/** GET /models/:id/actions/:portfolioId -- Get rebalancing actions */
router.get(
  '/models/:id/actions/:portfolioId',
  asyncHandler(async (req, res) => {
    const modelId = parseInt(req.params.id, 10);
    if (isNaN(modelId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid model ID' },
      });
    }

    const { portfolioId } = req.params;
    const actions = await modelPortfolioService.getRebalancingActions(
      portfolioId,
      modelId,
    );

    res.json({ data: actions });
  }),
);

// =============================================================================
// Simulation
// =============================================================================

/** POST /simulate/what-if -- What-if trade simulation */
router.post(
  '/simulate/what-if',
  asyncHandler(async (req, res) => {
    const { portfolioId, proposedTrades } = req.body;

    if (!portfolioId || !proposedTrades || !Array.isArray(proposedTrades)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId and proposedTrades (array) are required',
        },
      });
    }

    const result = await simulationEngineService.simulateWhatIf(
      portfolioId,
      proposedTrades,
    );

    res.json({ data: result });
  }),
);

/** POST /simulate/stress-test -- Stress test simulation */
router.post(
  '/simulate/stress-test',
  asyncHandler(async (req, res) => {
    const { portfolioId, scenario } = req.body;

    const validScenarios = [
      'INTEREST_RATE_SHOCK',
      'EQUITY_CRASH',
      'CREDIT_WIDENING',
      'CURRENCY_DEVALUATION',
    ];

    if (!portfolioId || !scenario || !validScenarios.includes(scenario)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `portfolioId and scenario (${validScenarios.join(' | ')}) are required`,
        },
      });
    }

    const result = await simulationEngineService.simulateStressTest(
      portfolioId,
      scenario,
    );

    res.json({ data: result });
  }),
);

/** POST /simulate/constant-mix -- Constant mix rebalancing simulation */
router.post(
  '/simulate/constant-mix',
  asyncHandler(async (req, res) => {
    const { portfolioId, modelId } = req.body;

    if (!portfolioId || !modelId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId and modelId are required',
        },
      });
    }

    const result = await simulationEngineService.simulateConstantMix(
      portfolioId,
      modelId,
    );

    res.json({ data: result });
  }),
);

// =============================================================================
// Rebalancing Operations
// =============================================================================

/** POST /rebalance/single -- Rebalance single portfolio */
router.post(
  '/rebalance/single',
  asyncHandler(async (req, res) => {
    const { portfolioId, modelId, runType, includeHeldAway } = req.body;

    if (!portfolioId || !modelId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId and modelId are required',
        },
      });
    }

    const run = await rebalancingService.rebalanceSingle(portfolioId, modelId, {
      runType,
      includeHeldAway,
    });

    res.status(201).json({ data: run });
  }),
);

/** POST /rebalance/group -- Rebalance group of portfolios */
router.post(
  '/rebalance/group',
  asyncHandler(async (req, res) => {
    const { portfolioIds, modelId, runType, includeHeldAway } = req.body;

    if (!portfolioIds || !Array.isArray(portfolioIds) || portfolioIds.length === 0 || !modelId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioIds (non-empty array) and modelId are required',
        },
      });
    }

    const run = await rebalancingService.rebalanceGroup(portfolioIds, modelId, {
      runType,
      includeHeldAway,
    });

    res.status(201).json({ data: run });
  }),
);

/** POST /rebalance/cash-event -- Rebalance on cash event */
router.post(
  '/rebalance/cash-event',
  asyncHandler(async (req, res) => {
    const { portfolioId, cashAmount, direction, modelId } = req.body;

    if (!portfolioId || cashAmount === undefined || !direction || !modelId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId, cashAmount, direction, and modelId are required',
        },
      });
    }

    if (!['INFLOW', 'OUTFLOW'].includes(direction)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'direction must be INFLOW or OUTFLOW',
        },
      });
    }

    const run = await rebalancingService.rebalanceOnCashEvent(
      portfolioId,
      cashAmount,
      direction,
      modelId,
    );

    res.status(201).json({ data: run });
  }),
);

// =============================================================================
// Rebalancing Runs
// =============================================================================

/** GET /runs -- List rebalancing runs */
router.get(
  '/runs',
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      portfolioId: req.query.portfolioId as string | undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await rebalancingService.getRuns(filters);
    res.json(result);
  }),
);

/** GET /runs/:id -- Get run detail */
router.get(
  '/runs/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid run ID' },
      });
    }

    const run = await rebalancingService.getRun(id);
    if (!run) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Rebalancing run not found' },
      });
    }

    res.json({ data: run });
  }),
);

/** PUT /runs/:id/blotter -- Edit blotter on a DRAFT run */
router.put(
  '/runs/:id/blotter',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid run ID' },
      });
    }

    const { blotter } = req.body;
    if (!blotter || !Array.isArray(blotter)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'blotter (array) is required',
        },
      });
    }

    const updated = await rebalancingService.editBlotter(id, blotter);
    res.json({ data: updated });
  }),
);

/** POST /runs/:id/approve -- Approve a DRAFT run */
router.post(
  '/runs/:id/approve',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid run ID' },
      });
    }

    const { approvedBy } = req.body;
    if (!approvedBy) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'approvedBy is required',
        },
      });
    }

    const run = await rebalancingService.approveRun(
      id,
      parseInt(approvedBy, 10),
    );

    res.json({ data: run });
  }),
);

/** POST /runs/:id/execute -- Execute an APPROVED run */
router.post(
  '/runs/:id/execute',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid run ID' },
      });
    }

    const { executedBy } = req.body;
    if (!executedBy) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'executedBy is required',
        },
      });
    }

    const run = await rebalancingService.executeRun(
      id,
      parseInt(executedBy, 10),
    );

    res.json({ data: run });
  }),
);

export default router;
