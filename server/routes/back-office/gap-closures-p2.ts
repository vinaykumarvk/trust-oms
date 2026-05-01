/**
 * gap-closures-p2.ts — API routes for P2 PARTIAL BDO RFI gap closures
 *
 * Exposes: pre-trade validation, order computation, duration analytics,
 * VaR, ECL, portfolio rebalancing, stress testing, standing instructions,
 * pretermination, withdrawal hierarchy, PERA stubs, FATCA, branch visibility,
 * official receipts.
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  preTradeValidationService,
  orderComputationService,
  riskAnalyticsService,
} from '../../services/order-validation-enhancements';
import {
  portfolioRebalancingService,
  stressTestService,
  standingInstructionService,
  preterminationService,
  withdrawalHierarchyService,
  peraValidationService,
  fatcaValidationService,
  transactionRefService,
  branchVisibilityService,
  officialReceiptService,
} from '../../services/portfolio-modeling-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

// ─── Pre-Trade Validation ──────────────────────────────────────────────────

router.post('/pre-trade/validate', asyncHandler(async (req, res) => {
  const result = await preTradeValidationService.validateOrder(req.body);
  res.json(result);
}));

router.post('/post-trade/compliance', asyncHandler(async (req, res) => {
  const { portfolioIds } = req.body;
  if (!Array.isArray(portfolioIds)) return res.status(400).json({ error: 'portfolioIds array required' });
  const result = await preTradeValidationService.runPostTradeCompliance(portfolioIds);
  res.json(result);
}));

// ─── Order Computation ─────────────────────────────────────────────────────

router.post('/orders/compute-missing', asyncHandler(async (_req, res) => {
  const result = orderComputationService.computeMissingField(_req.body);
  res.json(result);
}));

router.post('/orders/disposal', asyncHandler(async (req, res) => {
  const { portfolioId, securityId, quantity, method } = req.body;
  if (!portfolioId || !securityId || !quantity) {
    return res.status(400).json({ error: 'portfolioId, securityId, quantity required' });
  }
  try {
    const result = await orderComputationService.computeDisposal(
      portfolioId, securityId, quantity, method ?? 'WEIGHTED_AVERAGE',
    );
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/orders/can-edit/:status', asyncHandler(async (req, res) => {
  const result = orderComputationService.canEditOrder(req.params.status);
  res.json(result);
}));

router.post('/orders/fan-out/:batchId', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const batchId = parseInt(req.params.batchId, 10);
  if (isNaN(batchId)) return res.status(400).json({ error: 'Invalid batchId' });
  const result = await orderComputationService.fanOutToOrders(batchId, String(userId));
  res.json(result);
}));

// ─── Duration & Risk Analytics ─────────────────────────────────────────────

router.get('/analytics/duration/:portfolioId', asyncHandler(async (req, res) => {
  const result = await riskAnalyticsService.computePortfolioDuration(req.params.portfolioId);
  res.json(result);
}));

router.post('/analytics/duration/compute', asyncHandler(async (req, res) => {
  const result = riskAnalyticsService.computeMacaulayDuration(req.body);
  res.json(result);
}));

router.post('/analytics/var', asyncHandler(async (req, res) => {
  const result = riskAnalyticsService.computeParametricVaR(req.body);
  res.json(result);
}));

router.post('/analytics/ecl', asyncHandler(async (req, res) => {
  const result = riskAnalyticsService.computeECL(req.body);
  res.json(result);
}));

// ─── Portfolio Rebalancing ─────────────────────────────────────────────────

router.post('/portfolio/rebalance', asyncHandler(async (req, res) => {
  const { portfolioId, modelPortfolioId, totalTargetAUM } = req.body;
  if (!portfolioId || !modelPortfolioId) {
    return res.status(400).json({ error: 'portfolioId and modelPortfolioId required' });
  }
  const result = await portfolioRebalancingService.rebalanceAgainstModel(
    portfolioId, modelPortfolioId, totalTargetAUM,
  );
  res.json(result);
}));

router.post('/portfolio/constant-mix', asyncHandler(async (req, res) => {
  const { portfolioId, targetAllocation, tolerancePct } = req.body;
  if (!portfolioId || !Array.isArray(targetAllocation)) {
    return res.status(400).json({ error: 'portfolioId and targetAllocation array required' });
  }
  const result = await portfolioRebalancingService.constantMixRebalance(
    portfolioId, targetAllocation, tolerancePct,
  );
  res.json(result);
}));

// ─── Stress Testing ────────────────────────────────────────────────────────

router.post('/portfolio/stress-test', asyncHandler(async (req, res) => {
  const { portfolioId, scenario, customShocks } = req.body;
  if (!portfolioId || !scenario) {
    return res.status(400).json({ error: 'portfolioId and scenario required' });
  }
  const result = await stressTestService.runStressTest(portfolioId, scenario, customShocks);
  res.json(result);
}));

// ─── Standing Instructions ─────────────────────────────────────────────────

router.post('/standing-instructions', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await standingInstructionService.createInstruction({ ...req.body, userId: String(userId) });
  res.status(201).json(result);
}));

router.get('/standing-instructions/:portfolioId', asyncHandler(async (req, res) => {
  const result = await standingInstructionService.getInstructions(req.params.portfolioId);
  res.json(result);
}));

router.delete('/standing-instructions/:planId', asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  if (isNaN(planId)) return res.status(400).json({ error: 'Invalid planId' });
  const result = await standingInstructionService.cancelInstruction(planId);
  if (!result) return res.status(404).json({ error: 'Instruction not found' });
  res.json(result);
}));

// ─── Pretermination ────────────────────────────────────────────────────────

router.post('/pretermination/compute', asyncHandler(async (req, res) => {
  const { portfolioId, requestedAmount, reason } = req.body;
  if (!portfolioId || !requestedAmount) {
    return res.status(400).json({ error: 'portfolioId and requestedAmount required' });
  }
  try {
    const result = await preterminationService.computePreterminationPenalty({
      portfolioId, requestedAmount, reason,
    });
    res.json(result);
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── Withdrawal Hierarchy ──────────────────────────────────────────────────

router.post('/withdrawal/hierarchy', asyncHandler(async (req, res) => {
  const { portfolioId, requestedAmount } = req.body;
  if (!portfolioId || !requestedAmount) {
    return res.status(400).json({ error: 'portfolioId and requestedAmount required' });
  }
  const result = await withdrawalHierarchyService.computeWithdrawalSources(portfolioId, requestedAmount);
  res.json(result);
}));

// ─── PERA Stubs ────────────────────────────────────────────────────────────

router.get('/pera/check-tin', asyncHandler(async (req, res) => {
  const tin = String(req.query.tin ?? '');
  if (!tin) return res.status(400).json({ error: 'tin required' });
  const result = await peraValidationService.checkTINExistence(tin);
  res.json(result);
}));

router.get('/pera/check-duplicate', asyncHandler(async (req, res) => {
  const tin = String(req.query.tin ?? '');
  if (!tin) return res.status(400).json({ error: 'tin required' });
  const result = await peraValidationService.checkDuplicatePERA(tin);
  res.json(result);
}));

router.get('/pera/max-products', asyncHandler(async (req, res) => {
  const tin = String(req.query.tin ?? '');
  if (!tin) return res.status(400).json({ error: 'tin required' });
  const result = await peraValidationService.validateMaxProducts(tin);
  res.json(result);
}));

// ─── FATCA ─────────────────────────────────────────────────────────────────

router.get('/fatca/:clientId', asyncHandler(async (req, res) => {
  const result = await fatcaValidationService.validateFATCA(req.params.clientId);
  res.json(result);
}));

// ─── Transaction Reference ─────────────────────────────────────────────────

router.get('/txn-ref/generate', asyncHandler(async (_req, res) => {
  const prefix = _req.query.prefix ? String(_req.query.prefix) : 'TXN';
  res.json({ reference: transactionRefService.generateRef(prefix) });
}));

// ─── Branch Visibility ─────────────────────────────────────────────────────

router.get('/branch/clients', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const branch = req.query.branch ? String(req.query.branch) : undefined;
  const result = await branchVisibilityService.getVisibleClients(userId, branch);
  res.json(result);
}));

// ─── Official Receipt ──────────────────────────────────────────────────────

router.post('/receipt/generate', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = officialReceiptService.generateReceipt({
    ...req.body,
    receivedBy: String(userId),
  });
  res.json(result);
}));

export default router;
