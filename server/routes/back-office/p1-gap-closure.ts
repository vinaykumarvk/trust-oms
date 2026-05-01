/**
 * Gap Closure Routes — All P1/P2/P3 functional gaps from consolidated register
 *
 * Mounted at /api/v1/gap-closure
 *
 * GL gaps:
 *   /charge-setup — GL-FEE-002/004 Charge CRUD with min/max
 *   /fee-override — GL-FEE-006 Fee override before NAV
 *   /valuation-params — GL-VAL-001 Valuation parameters
 *   /price-overrides — GL-VAL-002 Market price override
 *   /portfolio-classifications — GL-PORT-001 CRUD
 *   /portfolio-closure — GL-PORT-004 Closure accounting
 *   /nav-pre-checks — GL-FUND-007 Pre-checks
 *   /navpu-report — GL-FUND-009 NAVPU data wiring
 *   /nav-summary — GL-REP-006 NAV summary
 *   /accrual-ledger — GL-REP-007 Accrual ledger report
 *   /holding-statement — GL-REP-008 Holding statement
 *   /fund-factsheet — GL-REP-008 Fund factsheet
 *   /sod-events — GL-SOD-001 SOD event processing
 *
 * Non-GL gaps:
 *   /uitf-ter — TFP-TER historical persistence
 *   /tfp-bridge — TFP-GL-BRIDGE accrual bridging
 *   /tfp-reversal — TFP-REVERSE manual fee reversal
 *   /order-auth-reset — FR-AUT-004 edit resets authorization
 *   /broker-charges — FR-EXE-011 daily broker charge distribution
 *   /withdrawal-hierarchy — FR-WDL-007 income-first hierarchy
 *   /nostro-recon — FR-CSH-001p nostro reconciliation
 *   /fx-deals — FR-CSH-002p FX deal capture
 *   /fatca-ides — FR-TAX-003p IDES XML envelope
 *   /knowledge-base — SR-007 KB CRUD
 *   /sr-tasks — SR-004 sub-task CRUD
 *   /sr-escalation — SR-003 SLA breach escalation
 *   /sr-notification — SR-010 client notification
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  glChargeSetupService,
  glFeeOverrideService,
  glValuationService,
  glPortfolioClassificationService,
  glPortfolioClosureService,
  glNavPreCheckService,
  glNavReportService,
  glExceptionService,
  glSodService,
} from '../../services/gl-gap-closure-service';
import {
  uitfTerService,
  tfpGlBridgeService,
  tfpManualReversalService,
  orderAuthResetService,
  brokerChargeService,
  withdrawalHierarchyService,
  nostroReconService,
  fxDealService,
  fatcaIdesService,
  knowledgeBaseService,
  srTaskService,
  srEscalationService,
  srNotificationService,
} from '../../services/gap-closure-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

function getUserId(req: any): string | null {
  return (req as any).user?.id ? String((req as any).user.id) : null;
}

// ============================================================================
// GL-FEE-002/004: Charge Setup CRUD
// ============================================================================

router.post('/charge-setup', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await glChargeSetupService.create({ ...req.body, userId });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/charge-setup', asyncHandler(async (req, res) => {
  const fundId = req.query.fund_id ? parseInt(req.query.fund_id as string) : undefined;
  const asOfDate = req.query.as_of_date as string | undefined;
  const data = await glChargeSetupService.list(fundId, asOfDate);
  res.json({ data });
}));

router.patch('/charge-setup/:id', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await glChargeSetupService.update(id, req.body, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/charge-setup/:id/deactivate', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await glChargeSetupService.deactivate(id, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/charge-setup/compute', asyncHandler(async (req, res) => {
  const { charge_setup, base_amount, tenor_days } = req.body;
  if (!charge_setup || base_amount === undefined) {
    return res.status(400).json({ error: 'charge_setup and base_amount required' });
  }
  const fee = glChargeSetupService.computeChargedAmount(charge_setup, parseFloat(base_amount), tenor_days);
  res.json({ data: { computed_fee: fee } });
}));

// ============================================================================
// GL-FEE-006: Fee Override before NAV
// ============================================================================

router.post('/fee-override', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { nav_computation_id, override_fees, reason } = req.body;
  if (!nav_computation_id || override_fees === undefined || !reason) {
    return res.status(400).json({ error: 'nav_computation_id, override_fees, reason required' });
  }
  try {
    const data = await glFeeOverrideService.overrideComputedFee(
      parseInt(nav_computation_id), parseFloat(override_fees), reason, parseInt(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ============================================================================
// GL-VAL-001: Valuation Parameters
// ============================================================================

router.post('/valuation-params', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await glValuationService.createParameters({ ...req.body, userId });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/valuation-params', asyncHandler(async (req, res) => {
  const fundId = req.query.fund_id ? parseInt(req.query.fund_id as string) : undefined;
  const data = await glValuationService.listParameters(fundId);
  res.json({ data });
}));

router.get('/valuation-params/:fundId/effective', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const data = await glValuationService.getParameters(fundId, req.query.as_of_date as string);
  res.json({ data });
}));

router.patch('/valuation-params/:id', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await glValuationService.updateParameters(id, req.body, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ============================================================================
// GL-VAL-002: Market Price Overrides
// ============================================================================

router.post('/price-overrides', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await glValuationService.createPriceOverride({ ...req.body, userId });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/price-overrides/:fundId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const data = await glValuationService.listPriceOverrides(
    fundId, req.query.date_from as string, req.query.date_to as string);
  res.json({ data });
}));

router.post('/price-overrides/:id/approve', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const data = await glValuationService.approvePriceOverride(id, parseInt(userId));
  res.json({ data });
}));

// GL-VAL-003p: Fallback price resolution
router.get('/fallback-price/:fundId/:securityId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  const securityId = parseInt(req.params.securityId, 10);
  if (isNaN(fundId) || isNaN(securityId)) return res.status(400).json({ error: 'Invalid params' });
  const data = await glValuationService.resolveFallbackPrice(
    securityId, req.query.price_date as string ?? new Date().toISOString().split('T')[0], fundId);
  res.json({ data });
}));

// ============================================================================
// GL-PORT-001: Portfolio Classification CRUD
// ============================================================================

router.post('/portfolio-classifications', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await glPortfolioClassificationService.create({ ...req.body, userId });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/portfolio-classifications', asyncHandler(async (req, res) => {
  const fundId = req.query.fund_id ? parseInt(req.query.fund_id as string) : undefined;
  const data = await glPortfolioClassificationService.list(fundId);
  res.json({ data });
}));

router.patch('/portfolio-classifications/:id', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await glPortfolioClassificationService.update(id, req.body, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.delete('/portfolio-classifications/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const data = await glPortfolioClassificationService.remove(id);
  res.json({ data });
}));

// ============================================================================
// GL-PORT-004: Portfolio Closure
// ============================================================================

router.post('/portfolio-closure', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { portfolio_id, closure_date } = req.body;
  if (!portfolio_id || !closure_date) return res.status(400).json({ error: 'portfolio_id and closure_date required' });
  const data = await glPortfolioClosureService.closePortfolio({
    portfolioId: parseInt(portfolio_id), closureDate: closure_date, userId: parseInt(userId),
  });
  res.json({ data });
}));

// ============================================================================
// GL-FUND-007: NAV Pre-Checks
// ============================================================================

router.get('/nav-pre-checks/:fundId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const navDate = req.query.nav_date as string ?? new Date().toISOString().split('T')[0];
  const data = await glNavPreCheckService.runPreChecks(fundId, navDate);
  res.json({ data });
}));

// ============================================================================
// GL-FUND-009: NAVPU Report + GL-REP-006: NAV Summary
// ============================================================================

router.get('/navpu-report/:fundId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const data = await glNavReportService.getNavpuReport(
    fundId, req.query.date_from as string, req.query.date_to as string);
  res.json({ data });
}));

router.get('/nav-summary/:fundId/:navDate', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const data = await glNavReportService.getNavSummary(fundId, req.params.navDate);
  res.json({ data });
}));

// GL-REP-007: Accrual Ledger Report
router.get('/accrual-ledger/:fundId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });
  const data = await glNavReportService.getAccrualLedgerReport(fundId, date_from as string, date_to as string);
  res.json({ data });
}));

// GL-REP-008: Holding Statement + Fund Factsheet
router.get('/holding-statement/:fundId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const asOfDate = req.query.as_of_date as string ?? new Date().toISOString().split('T')[0];
  const data = await glNavReportService.getHoldingStatement(fundId, asOfDate);
  res.json({ data });
}));

router.get('/fund-factsheet/:fundId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const data = await glNavReportService.getFundFactsheet(fundId);
  if (!data) return res.status(404).json({ error: 'Fund not found' });
  res.json({ data });
}));

// ============================================================================
// GL-SOD-001: SOD Event Processing
// ============================================================================

router.post('/sod-events', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { business_date } = req.body;
  if (!business_date) return res.status(400).json({ error: 'business_date required' });
  const data = await glSodService.processSodEvents(business_date, parseInt(userId));
  res.json({ data });
}));

// ============================================================================
// TFP-TER: UITF TER
// ============================================================================

router.post('/uitf-ter/compute', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { fund_id, period } = req.body;
  if (!fund_id || !period) return res.status(400).json({ error: 'fund_id and period required' });
  try {
    const data = await uitfTerService.computeAndStore(parseInt(fund_id), period, parseInt(userId));
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/uitf-ter/:fundId', asyncHandler(async (req, res) => {
  const fundId = parseInt(req.params.fundId, 10);
  if (isNaN(fundId)) return res.status(400).json({ error: 'Invalid fund_id' });
  const data = await uitfTerService.getHistory(fundId);
  res.json({ data });
}));

// ============================================================================
// TFP-GL-BRIDGE: Accrual Bridge
// ============================================================================

router.post('/tfp-bridge', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { business_date } = req.body;
  if (!business_date) return res.status(400).json({ error: 'business_date required' });
  try {
    const data = await tfpGlBridgeService.bridgeAccrualsToGl(business_date, parseInt(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ============================================================================
// TFP-REVERSE: Manual Fee Reversal
// ============================================================================

router.post('/tfp-reversal/:invoiceId', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const invoiceId = parseInt(req.params.invoiceId, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ error: 'Invalid invoice_id' });
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });
  try {
    const data = await tfpManualReversalService.reverseInvoice(invoiceId, reason, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ============================================================================
// FR-AUT-004: Order Auth Reset on Edit
// ============================================================================

router.post('/order-auth-reset/:orderId', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const orderId = req.params.orderId;
  if (!orderId) return res.status(400).json({ error: 'Invalid order_id' });
  try {
    const data = await orderAuthResetService.resetOnEdit(orderId, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ============================================================================
// FR-EXE-011: Broker Charge Distribution
// ============================================================================

router.post('/broker-charges/distribute', asyncHandler(async (req, res) => {
  const { business_date } = req.body;
  if (!business_date) return res.status(400).json({ error: 'business_date required' });
  const data = await brokerChargeService.distributeDailyCharges(business_date);
  res.json({ data });
}));

// ============================================================================
// FR-WDL-007: Income-First Withdrawal Hierarchy
// ============================================================================

router.get('/withdrawal-hierarchy/:portfolioId', asyncHandler(async (req, res) => {
  const amount = parseFloat(req.query.amount as string);
  if (isNaN(amount)) return res.status(400).json({ error: 'amount query param required' });
  const data = await withdrawalHierarchyService.computeHierarchy(req.params.portfolioId, amount);
  res.json({ data });
}));

// ============================================================================
// FR-CSH-001p: Nostro Reconciliation
// ============================================================================

router.post('/nostro-recon', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { gl_head_id, recon_date, bank_balance } = req.body;
  if (!gl_head_id || !recon_date || bank_balance === undefined) {
    return res.status(400).json({ error: 'gl_head_id, recon_date, bank_balance required' });
  }
  try {
    const data = await nostroReconService.runDailyRecon(
      parseInt(gl_head_id), recon_date, parseFloat(bank_balance), parseInt(userId));
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/nostro-recon', asyncHandler(async (req, res) => {
  const glHeadId = req.query.gl_head_id ? parseInt(req.query.gl_head_id as string) : undefined;
  const data = await nostroReconService.listRecons(
    glHeadId, req.query.date_from as string, req.query.date_to as string);
  res.json({ data });
}));

// ============================================================================
// FR-CSH-002p: FX Deal Capture
// ============================================================================

router.post('/fx-deals', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await fxDealService.create({ ...req.body, userId });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/fx-deals', asyncHandler(async (req, res) => {
  const data = await fxDealService.list({
    portfolio_id: req.query.portfolio_id as string,
    deal_type: req.query.deal_type as string,
    status: req.query.status as string,
  });
  res.json({ data });
}));

router.post('/fx-deals/:id/confirm', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const data = await fxDealService.confirm(id, userId);
  res.json({ data });
}));

router.post('/fx-deals/:id/settle', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { settlement_reference } = req.body;
  if (!settlement_reference) return res.status(400).json({ error: 'settlement_reference required' });
  const data = await fxDealService.settle(id, settlement_reference, userId);
  res.json({ data });
}));

// ============================================================================
// FR-TAX-003p: FATCA/CRS IDES XML
// ============================================================================

router.post('/fatca-ides/generate', asyncHandler(async (req, res) => {
  const { reporting_period, reporting_fi, accounts } = req.body;
  if (!reporting_period || !reporting_fi || !accounts) {
    return res.status(400).json({ error: 'reporting_period, reporting_fi, accounts required' });
  }
  const xml = fatcaIdesService.generateIdesXml(reporting_period, { reporting_fi, accounts });
  res.type('application/xml').send(xml);
}));

// ============================================================================
// SR-007: Knowledge Base
// ============================================================================

router.post('/knowledge-base', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await knowledgeBaseService.create({ ...req.body, userId });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/knowledge-base', asyncHandler(async (req, res) => {
  const data = await knowledgeBaseService.list(
    req.query.category as string, req.query.search as string);
  res.json({ data });
}));

router.get('/knowledge-base/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const data = await knowledgeBaseService.getById(id);
  if (!data) return res.status(404).json({ error: 'Article not found' });
  res.json({ data });
}));

router.patch('/knowledge-base/:id', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await knowledgeBaseService.update(id, req.body, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/knowledge-base/:id/helpful', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const data = await knowledgeBaseService.markHelpful(id);
  res.json({ data });
}));

// ============================================================================
// SR-004: Sub-Tasks
// ============================================================================

router.post('/sr-tasks', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await srTaskService.create({ ...req.body, userId });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/sr-tasks/:srId', asyncHandler(async (req, res) => {
  const srId = parseInt(req.params.srId, 10);
  if (isNaN(srId)) return res.status(400).json({ error: 'Invalid sr_id' });
  const data = await srTaskService.listBySr(srId);
  res.json({ data });
}));

router.patch('/sr-tasks/:id', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await srTaskService.update(id, req.body, userId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ============================================================================
// SR-003: SLA Breach Escalation
// ============================================================================

router.post('/sr-escalation/check', asyncHandler(async (_req, res) => {
  const data = await srEscalationService.checkBreaches();
  res.json({ data });
}));

// ============================================================================
// SR-010: SR Client Notification
// ============================================================================

router.post('/sr-notification/:srId', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const srId = parseInt(req.params.srId, 10);
  if (isNaN(srId)) return res.status(400).json({ error: 'Invalid sr_id' });
  const { new_status } = req.body;
  if (!new_status) return res.status(400).json({ error: 'new_status required' });
  const data = await srNotificationService.notifyStatusChange(srId, new_status, userId);
  res.json({ data });
}));

export default router;
