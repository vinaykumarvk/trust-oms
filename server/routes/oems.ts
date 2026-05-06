import type { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { denyBusinessApproval, requireAnyRole } from '../middleware/role-auth';
import { httpStatusFromError, safeErrorMessage, ValidationError } from '../services/service-errors';
import { oemsService, type OemsProductFamily } from '../services/oems-service';
import { listAggregationRules, validateAggregationCompatibility, type AggregationCandidate } from '../services/blotter-aggregation-policy';

const router = Router();

const requireOemsRole = () => requireAnyRole(
  'RELATIONSHIP_MANAGER',
  'SENIOR_RM',
  'TRADER',
  'SENIOR_TRADER',
  'BO_MAKER',
  'BO_CHECKER',
  'BO_HEAD',
  'MO_MAKER',
  'MO_CHECKER',
  'TREASURY',
  'TREASURY_SND',
  'FI_OPERATION',
  'TRADE_SERVICE',
  'BSM',
  'HEAD_TELLER',
  'SYSTEM_ADMIN',
);

router.use(requireOemsRole());

function actor(req: Request): string {
  return String((req as any).user?.id ?? (req as any).userId ?? 'system');
}

function actorRole(req: Request): string | undefined {
  return String((req as any).userRole ?? (req as any).user?.role ?? '').trim() || undefined;
}

function actorCustomerId(req: Request): string | undefined {
  return String((req as any).user?.customerId ?? (req as any).user?.clientId ?? '').trim() || undefined;
}

function intParam(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ValidationError(`${label} must be a positive integer`);
  return parsed;
}

function sendServiceError(res: Response, err: unknown) {
  res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
}

function serviceRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('[OEMS]', err);
      sendServiceError(res, err);
    }
  });
}

router.get('/summary', serviceRoute(async (_req, res) => {
  res.json(await oemsService.getWorkbenchSummary());
}));

router.post('/channel-sessions', serviceRoute(async (req, res) => {
  const session = await oemsService.createChannelSession(req.body, actor(req));
  res.status(201).json(session);
}));

router.post('/channel-sessions/:sessionId/validate', serviceRoute(async (req, res) => {
  res.json(await oemsService.validateChannelSession(req.params.sessionId, req.body, actor(req)));
}));

router.get('/products', serviceRoute(async (req, res) => {
  res.json(await oemsService.listProducts({
    productFamily: req.query.productFamily as OemsProductFamily | undefined,
    activeOnly: req.query.activeOnly === 'true',
  }));
}));

router.post('/products', serviceRoute(async (req, res) => {
  const product = await oemsService.createProduct(req.body, actor(req));
  res.status(201).json(product);
}));

router.get('/clients', serviceRoute(async (req, res) => {
  const search = String(req.query.search ?? '');
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  res.json(await oemsService.searchClients(search, limit));
}));

router.get('/clients/:clientId/portfolios', serviceRoute(async (req, res) => {
  res.json(await oemsService.getClientPortfolios(req.params.clientId));
}));

router.post('/parameter-sets', serviceRoute(async (req, res) => {
  const parameterSet = await oemsService.createParameterSet(req.body, actor(req));
  res.status(201).json(parameterSet);
}));

router.get('/parameter-sets', serviceRoute(async (req, res) => {
  res.json(await oemsService.listParameterSets({
    productId: req.query.productId ? Number(req.query.productId) : undefined,
    status: req.query.status as any,
    channel: req.query.channel as any,
  }));
}));

router.patch('/parameter-sets/:id', serviceRoute(async (req, res) => {
  res.json(await oemsService.updateParameterSet(intParam(req.params.id, 'Parameter set ID'), req.body, actor(req)));
}));

router.post('/parameter-sets/:id/submit', serviceRoute(async (req, res) => {
  res.json(await oemsService.submitParameterSet(intParam(req.params.id, 'Parameter set ID'), actor(req)));
}));

router.post('/parameter-sets/:id/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveParameterSet(intParam(req.params.id, 'Parameter set ID'), actor(req)));
}));

router.post('/parameter-sets/:id/reject', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectParameterSet(
    intParam(req.params.id, 'Parameter set ID'),
    req.body?.reason ?? req.body?.reviewComments,
    actor(req),
  ));
}));

router.post('/parameter-sets/:id/retire', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.retireParameterSet(
    intParam(req.params.id, 'Parameter set ID'),
    req.body?.reason,
    actor(req),
  ));
}));

router.get('/orders', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOrders({
    productFamily: req.query.productFamily as OemsProductFamily | undefined,
    status: req.query.status as string | undefined,
    customerId: req.query.customerId as string | undefined,
    portfolioId: req.query.portfolioId as string | undefined,
    search: req.query.search as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.post('/orders', serviceRoute(async (req, res) => {
  const order = await oemsService.createOrder(req.body, actor(req));
  res.status(201).json(order);
}));

router.get('/orders/:orderId', serviceRoute(async (req, res) => {
  res.json(await oemsService.getOrder(req.params.orderId));
}));

router.get('/orders/:orderId/transitions', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOrderStatusTransitions(req.params.orderId));
}));

router.post('/orders/:orderId/cutoff/evaluate', serviceRoute(async (req, res) => {
  res.json(await oemsService.evaluateOrderCutoff(req.params.orderId, req.body));
}));

router.post('/orders/:orderId/charges', serviceRoute(async (req, res) => {
  res.json(await oemsService.calculateOrderCharges(req.params.orderId, actor(req)));
}));

router.get('/orders/:orderId/charges', serviceRoute(async (req, res) => {
  res.json(await oemsService.getOrderCharges(req.params.orderId));
}));

router.post('/orders/:orderId/validate', serviceRoute(async (req, res) => {
  res.json(await oemsService.validateOrder(req.params.orderId, actor(req)));
}));

router.post('/orders/:orderId/validation-warnings/acknowledge', serviceRoute(async (req, res) => {
  res.json(await oemsService.acknowledgeValidationWarnings(req.params.orderId, req.body?.ruleCodes, actor(req)));
}));

router.post('/orders/:orderId/submit', serviceRoute(async (req, res) => {
  res.json(await oemsService.submitOrder(req.params.orderId, actor(req)));
}));

router.patch('/orders/:orderId', serviceRoute(async (req, res) => {
  res.json(await oemsService.amendOrder(req.params.orderId, req.body, actor(req)));
}));

router.post('/orders/:orderId/cancel', serviceRoute(async (req, res) => {
  res.json(await oemsService.cancelOrder(
    req.params.orderId,
    req.body?.reason ?? 'User requested cancellation',
    actor(req),
    { checkerRepair: req.body?.checkerRepair === true },
  ));
}));

router.get('/document-rules', serviceRoute(async (req, res) => {
  res.json(await oemsService.listDocumentChecklistRules({
    productFamily: req.query.productFamily as any,
    transactionType: req.query.transactionType as string | undefined,
    channel: req.query.channel as any,
    activeOnly: req.query.activeOnly === undefined ? true : req.query.activeOnly !== 'false',
  }));
}));

router.post('/document-rules', serviceRoute(async (req, res) => {
  const rule = await oemsService.createDocumentChecklistRule(req.body, actor(req));
  res.status(201).json(rule);
}));

router.get('/orders/:orderId/documents', serviceRoute(async (req, res) => {
  res.json(await oemsService.listDocuments(req.params.orderId));
}));

router.get('/orders/:orderId/documents/checklist', serviceRoute(async (req, res) => {
  res.json(await oemsService.getDocumentChecklist(req.params.orderId));
}));

router.post('/orders/:orderId/documents/checklist/generate', serviceRoute(async (req, res) => {
  res.json(await oemsService.generateDocumentChecklist(req.params.orderId, actor(req)));
}));

router.post('/orders/:orderId/documents', serviceRoute(async (req, res) => {
  const document = await oemsService.registerDocument(req.params.orderId, req.body, actor(req));
  res.status(201).json(document);
}));

router.post('/orders/:orderId/documents/eforms', serviceRoute(async (req, res) => {
  const document = await oemsService.generateEFormDocument(req.params.orderId, req.body, actor(req));
  res.status(201).json(document);
}));

router.post('/documents/:documentId/sign', serviceRoute(async (req, res) => {
  res.json(await oemsService.signDocument(req.params.documentId, req.body, actor(req)));
}));

router.post('/documents/:documentId/dms/register', serviceRoute(async (req, res) => {
  res.json(await oemsService.registerDocumentWithDms(req.params.documentId, req.body, actor(req)));
}));

router.post('/documents/:documentId/ncbs/register', serviceRoute(async (req, res) => {
  res.json(await oemsService.registerDocumentWithNcbs(req.params.documentId, req.body, actor(req)));
}));

router.post('/documents/:documentId/retry', serviceRoute(async (req, res) => {
  res.json(await oemsService.retryDocumentRegistration(req.params.documentId, actor(req)));
}));

router.get('/risk/questionnaires', serviceRoute(async (req, res) => {
  res.json(await oemsService.listRiskQuestionnaires({
    status: req.query.status as any,
    activeOnly: req.query.activeOnly === 'true',
  }));
}));

router.post('/risk/questionnaires', serviceRoute(async (req, res) => {
  const questionnaire = await oemsService.createRiskQuestionnaireVersion(req.body, actor(req));
  res.status(201).json(questionnaire);
}));

router.post('/risk/questionnaires/:id/submit', serviceRoute(async (req, res) => {
  res.json(await oemsService.submitRiskQuestionnaire(Number(req.params.id), actor(req)));
}));

router.post('/risk/questionnaires/:id/approve', serviceRoute(async (req, res) => {
  res.json(await oemsService.approveRiskQuestionnaire(Number(req.params.id), actor(req)));
}));

router.post('/risk/questionnaires/:id/reject', serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectRiskQuestionnaire(Number(req.params.id), req.body?.reason ?? 'Rejected from workbench', actor(req)));
}));

router.post('/risk/product-mappings', serviceRoute(async (req, res) => {
  const mapping = await oemsService.createProductRiskMapping(req.body, actor(req));
  res.status(201).json(mapping);
}));

router.post('/risk/product-mappings/:id/approve', serviceRoute(async (req, res) => {
  res.json(await oemsService.approveProductRiskMapping(Number(req.params.id), actor(req)));
}));

router.post('/risk/assessments', serviceRoute(async (req, res) => {
  const assessment = await oemsService.createRiskProfileAssessment(req.body, actor(req));
  res.status(201).json(assessment);
}));

router.get('/risk/customers/:customerId/latest', serviceRoute(async (req, res) => {
  res.json(await oemsService.getLatestRiskProfile(req.params.customerId));
}));

router.post('/risk/customers/:customerId/external-profile', serviceRoute(async (req, res) => {
  res.json(await oemsService.recordExternalRiskProfile(req.params.customerId, req.body, actor(req)));
}));

router.post('/risk/assessments/:assessmentId/sync/:targetSystem', serviceRoute(async (req, res) => {
  res.json(await oemsService.syncRiskProfileToExternal(
    req.params.assessmentId,
    req.params.targetSystem.toUpperCase() as 'RBS' | 'AVANTRADE',
    actor(req),
  ));
}));

router.post('/orders/:orderId/risk/validate', serviceRoute(async (req, res) => {
  res.json(await oemsService.validateRiskProfileForOrder(req.params.orderId, { persist: req.body?.persist === true }));
}));

router.get('/risk/reports/profile-status', serviceRoute(async (req, res) => {
  res.json(await oemsService.getRiskProfileReport({
    expiringWithinDays: req.query.expiringWithinDays ? Number(req.query.expiringWithinDays) : undefined,
  }));
}));

router.get('/orders/:orderId/digital-verifications', serviceRoute(async (req, res) => {
  res.json(await oemsService.listDigitalVerifications(req.params.orderId));
}));

router.post('/orders/:orderId/digital-verifications', serviceRoute(async (req, res) => {
  const verification = await oemsService.createDigitalVerification(req.params.orderId, req.body, actor(req));
  res.status(201).json(verification);
}));

router.get('/orders/:orderId/digital-verifications/:verificationId/attempts', serviceRoute(async (req, res) => {
  res.json(await oemsService.listDigitalVerificationAttempts(req.params.orderId, req.params.verificationId));
}));

router.post('/orders/:orderId/digital-verifications/:verificationId/attempts', serviceRoute(async (req, res) => {
  res.json(await oemsService.recordDigitalVerificationAttempt(
    req.params.orderId,
    { ...req.body, verificationId: req.params.verificationId },
    actor(req),
  ));
}));

router.post('/orders/:orderId/digital-verifications/complete', serviceRoute(async (req, res) => {
  res.json(await oemsService.completeDigitalVerification(req.params.orderId, req.body, actor(req)));
}));

router.post('/orders/:orderId/digital-verifications/:verificationId/expire', serviceRoute(async (req, res) => {
  res.json(await oemsService.expireDigitalVerification(req.params.orderId, req.params.verificationId, actor(req)));
}));

router.post('/orders/:orderId/digital-verifications/:verificationId/cancel', serviceRoute(async (req, res) => {
  res.json(await oemsService.cancelDigitalVerification(
    req.params.orderId,
    req.params.verificationId,
    req.body?.reason ?? 'Digital verification cancelled',
    actor(req),
  ));
}));

router.post('/orders/:orderId/digital-verifications/:verificationId/fallback-approve', serviceRoute(async (req, res) => {
  res.json(await oemsService.approveDigitalVerificationFallback(
    req.params.orderId,
    { ...req.body, verificationId: req.params.verificationId },
    actor(req),
  ));
}));

router.post('/orders/:orderId/digital-verifications/:verificationId/invalidate', serviceRoute(async (req, res) => {
  res.json(await oemsService.invalidateDigitalVerification(
    req.params.orderId,
    req.body?.reason ?? 'Digital verification invalidated by operations',
    actor(req),
    req.params.verificationId,
  ));
}));

router.get('/orders/:orderId/digital-verifications/:verificationId/download', serviceRoute(async (req, res) => {
  res.json(await oemsService.getSignedDigitalVerificationDocument(req.params.orderId, req.params.verificationId));
}));

router.post('/oda/recommendations', serviceRoute(async (req, res) => {
  const result = await oemsService.createOdaRecommendation(req.body, actor(req));
  res.status(201).json(result);
}));

router.post('/oda/orders', serviceRoute(async (req, res) => {
  const result = await oemsService.registerOdaOrder(req.body, actor(req));
  res.status(201).json(result);
}));

router.post('/oda/orders/precheck', serviceRoute(async (req, res) => {
  res.json(oemsService.precheckOdaOrder(req.body));
}));

router.get('/oda/recommendations', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaRecommendations({
    lifecycle: req.query.lifecycle as string | undefined,
    cutoffFrom: req.query.cutoffFrom as string | undefined,
    cutoffTo: req.query.cutoffTo as string | undefined,
  }));
}));

router.post('/oda/recommendations/calculate', serviceRoute(async (req, res) => {
  res.json(oemsService.calculateOdaNominal(req.body));
}));

router.post('/oda/recommendations/order-cost', serviceRoute(async (req, res) => {
  res.json({ orderCostBeforeSwap: oemsService.calculateOdaOrderCostBeforeSwap(req.body) });
}));

router.post('/oda/reference-rates', serviceRoute(async (req, res) => {
  const result = await oemsService.createOdaReferenceRate(req.body, actor(req));
  res.status(201).json(result);
}));

router.get('/oda/reference-rates', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaReferenceRates({
    currencyPair: req.query.currencyPair as string | undefined,
    rateDate: req.query.rateDate as string | undefined,
    status: req.query.status as string | undefined,
  }));
}));

router.post('/oda/recommendations/:id/authorize', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.authorizeOdaOrder(
    intParam(req.params.id, 'ODA recommendation ID'),
    req.body,
    actor(req),
  ));
}));

router.post('/oda/recommendations/:id/hold', serviceRoute(async (req, res) => {
  res.json(await oemsService.holdOdaFunds(
    intParam(req.params.id, 'ODA recommendation ID'),
    req.body,
    actor(req),
  ));
}));

router.post('/oda/recommendations/:id/release', serviceRoute(async (req, res) => {
  res.json(await oemsService.releaseOdaFunds(
    intParam(req.params.id, 'ODA recommendation ID'),
    req.body,
    actor(req),
  ));
}));

router.post('/oda/recommendations/:id/cancel', serviceRoute(async (req, res) => {
  res.json(await oemsService.cancelOdaRecommendation(
    intParam(req.params.id, 'ODA recommendation ID'),
    req.body,
    actor(req),
  ));
}));

// ─── Blotter Aggregation Rules ───────────────────────────────────────────────

router.get('/oda/aggregation-rules', serviceRoute(async (_req, res) => {
  res.json({ rules: listAggregationRules() });
}));

router.post('/oda/aggregation-validate', serviceRoute(async (req, res) => {
  const candidates = req.body.candidates as AggregationCandidate[];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new ValidationError('candidates array is required');
  }
  const violations = validateAggregationCompatibility(candidates);
  const canAggregate = violations.filter(v => v.enforcement === 'MANDATORY').length === 0;
  res.json({ canAggregate, violations });
}));

router.post('/oda/collections', serviceRoute(async (req, res) => {
  const result = await oemsService.collectOdaRecommendations(req.body, actor(req));
  res.status(201).json(result);
}));

router.post('/oda/collections/run-cot', serviceRoute(async (req, res) => {
  res.json(await oemsService.runOdaCotCollection(req.body, actor(req)));
}));

router.get('/oda/daily-summary', serviceRoute(async (req, res) => {
  res.json(await oemsService.getOdaDailySummary({
    summaryDate: req.query.summaryDate as string | undefined,
    minimumCollectiveAmount: req.query.minimumCollectiveAmount ? Number(req.query.minimumCollectiveAmount) : undefined,
  }, actor(req)));
}));

router.post('/oda/collections/:groupId/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveOdaBlotterGroup(intParam(req.params.groupId, 'ODA group ID'), actor(req)));
}));

router.post('/oda/collections/:groupId/treasury-updates', serviceRoute(async (req, res) => {
  const result = await oemsService.requestOdaTreasuryUpdate(
    intParam(req.params.groupId, 'ODA group ID'),
    req.body,
    actor(req),
  );
  res.status(201).json(result);
}));

router.post('/oda/collections/:groupId/deaggregate', serviceRoute(async (req, res) => {
  const { recommendationIds, reason } = req.body;
  if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
    throw new ValidationError('recommendationIds array is required');
  }
  res.json(await oemsService.deaggregateFromBlotterGroup(
    intParam(req.params.groupId, 'ODA group ID'),
    { recommendationIds, reason },
    actor(req),
  ));
}));

router.post('/oda/collections/:groupId/allocate', serviceRoute(async (req, res) => {
  const { executedAmount, allocationMethod, allocations } = req.body;
  if (!executedAmount || typeof executedAmount !== 'number') {
    throw new ValidationError('executedAmount (number) is required');
  }
  if (!['PROPORTIONATE', 'FIFO', 'MANUAL'].includes(allocationMethod)) {
    throw new ValidationError('allocationMethod must be PROPORTIONATE, FIFO, or MANUAL');
  }
  res.json(await oemsService.allocateOdaBlotterGroup(
    intParam(req.params.groupId, 'ODA group ID'),
    { executedAmount, allocationMethod, allocations },
    actor(req),
  ));
}));

router.get('/oda/collections/:groupId/allocations', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaAllocationLog(intParam(req.params.groupId, 'ODA group ID')));
}));

router.get('/oda/collections/:groupId/deaggregation-events', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaDeaggregationEvents(intParam(req.params.groupId, 'ODA group ID')));
}));

router.post('/oda/treasury-updates/:updateId/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveOdaTreasuryUpdate(req.params.updateId, req.body, actor(req)));
}));

router.post('/oda/fp8007-syncs', serviceRoute(async (req, res) => {
  const result = await oemsService.syncOdaToFp8007(req.body, actor(req));
  res.status(201).json(result);
}));

router.get('/oda/fund-instructions', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaFundInstructions({
    instructionType: req.query.instructionType as string | undefined,
    status: req.query.status as string | undefined,
    recommendationId: req.query.recommendationId ? Number(req.query.recommendationId) : undefined,
  }));
}));

router.get('/oda/reports/fund-release', serviceRoute(async (req, res) => {
  res.json(await oemsService.getOdaFundReleaseReport({
    status: req.query.status as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  }));
}));

router.post('/oda/recommendations/:id/execute', serviceRoute(async (req, res) => {
  res.json(await oemsService.executeOdaRecommendation(
    intParam(req.params.id, 'ODA recommendation ID'),
    req.body?.lifecycle ?? 'EXECUTED',
    actor(req),
  ));
}));

router.get('/mld/tranches', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMldTranches({ lifecycle: req.query.lifecycle as string | undefined }));
}));

router.post('/mld/tranches', serviceRoute(async (req, res) => {
  const tranche = await oemsService.createMldTranche(req.body, actor(req));
  res.status(201).json(tranche);
}));

router.post('/mld/tranches/:id/pretrade-recheck', serviceRoute(async (req, res) => {
  res.json(await oemsService.pretradeRecheckMldTranche(
    intParam(req.params.id, 'MLD tranche ID'),
    Number(req.body?.amount ?? 0),
    req.body?.tradeDate,
    req.body,
  ));
}));

router.post('/mld/tranches/:id/pretrade-recheck/run', serviceRoute(async (req, res) => {
  res.json(await oemsService.runMldPreTradeRecheck(
    intParam(req.params.id, 'MLD tranche ID'),
    req.body,
    actor(req),
  ));
}));

router.post('/mld/tranches/:id/mature', serviceRoute(async (req, res) => {
  res.json(await oemsService.matureMldTranche(intParam(req.params.id, 'MLD tranche ID'), actor(req)));
}));

router.get('/mld/order-details', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMldOrderDetails({
    trancheId: req.query.trancheId ? Number(req.query.trancheId) : undefined,
    tradeStatus: req.query.tradeStatus as string | undefined,
  }));
}));

router.get('/mld/fund-instructions', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMldFundInstructions({
    instructionType: req.query.instructionType as string | undefined,
    status: req.query.status as string | undefined,
    orderId: req.query.orderId as string | undefined,
  }));
}));

router.post('/mld/orders', serviceRoute(async (req, res) => {
  const result = await oemsService.createMldOrder(req.body, actor(req));
  res.status(201).json(result);
}));

router.post('/mld/orders/:orderId/callback', serviceRoute(async (req, res) => {
  res.json(await oemsService.recordMldCallback(req.params.orderId, req.body, actor(req)));
}));

router.post('/mld/orders/:orderId/trade', serviceRoute(async (req, res) => {
  res.json(await oemsService.tradeMldOrder(req.params.orderId, req.body, actor(req)));
}));

router.post('/mld/orders/:orderId/fixing', serviceRoute(async (req, res) => {
  const result = await oemsService.recordMldFixingOutcome(req.params.orderId, req.body, actor(req));
  res.status(201).json(result);
}));

router.post('/mld/orders/:orderId/mature', serviceRoute(async (req, res) => {
  res.json(await oemsService.matureMldOrder(req.params.orderId, req.body, actor(req)));
}));

router.get('/wealth/static-data', serviceRoute(async (req, res) => {
  res.json(await oemsService.listWealthCustomerStaticData({
    customerId: req.query.customerId as string | undefined,
    cif: req.query.cif as string | undefined,
    conflictStatus: req.query.conflictStatus as string | undefined,
  }));
}));

router.post('/wealth/static-data/retrieve', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.retrieveWealthCustomerStaticData(req.body, actor(req)));
}));

router.post('/wealth/static-data', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.maintainWealthStaticData(req.body, actor(req)));
}));

router.post('/wealth/static-data/:staticDataId/resolve', serviceRoute(async (req, res) => {
  res.json(await oemsService.resolveWealthStaticDataConflict(req.params.staticDataId, req.body, actor(req)));
}));

router.get('/wealth/products', serviceRoute(async (req, res) => {
  res.json(await oemsService.listWealthProductSnapshots({
    productFamily: req.query.productFamily as OemsProductFamily | undefined,
    productCode: req.query.productCode as string | undefined,
  }));
}));

router.post('/wealth/products', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.createWealthProductSnapshot(req.body, actor(req)));
}));

router.get('/wealth/products/:productCode/performance', serviceRoute(async (req, res) => {
  res.json(await oemsService.getWealthProductPerformance(req.params.productCode));
}));

router.post('/wealth/products/validate-setup', serviceRoute(async (req, res) => {
  res.json(await oemsService.validateWealthCoreProductSetup(req.body));
}));

router.post('/wealth/sid-accounts', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.registerSidAccount(req.body, actor(req)));
}));

router.post('/wealth/pfe-registrations', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.initiatePfeRegistration(req.body, actor(req)));
}));

router.post('/wealth/sales-certifications/sync', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.syncSalesCertificationToWealthCore(req.body, actor(req)));
}));

router.get('/mf-bond/order-details', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMfBondOrderDetails({
    productFamily: req.query.productFamily as 'MUTUAL_FUND' | 'BOND' | undefined,
    wealthCoreStatus: req.query.wealthCoreStatus as string | undefined,
  }));
}));

router.get('/mf-bond/pricing-locks', serviceRoute(async (req, res) => {
  res.json(await oemsService.listBondPricingLocks({
    orderId: req.query.orderId as string | undefined,
    approvalRoute: req.query.approvalRoute as string | undefined,
  }));
}));

router.post('/mf-bond/orders', serviceRoute(async (req, res) => {
  const result = await oemsService.createMfBondOrder(req.body, actor(req));
  res.status(201).json(result);
}));

router.patch('/mf-bond/orders/:orderId', serviceRoute(async (req, res) => {
  res.json(await oemsService.amendMfBondOrder(req.params.orderId, req.body, actor(req)));
}));

router.post('/mf-bond/orders/:orderId/reject', serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectMfBondOrder(req.params.orderId, req.body, actor(req)));
}));

router.post('/mf-bond/orders/:orderId/bond-price-locks', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.lockBondLivePrice(req.params.orderId, req.body, actor(req)));
}));

router.post('/mf-bond/orders/:orderId/wealth-core/handoff', serviceRoute(async (req, res) => {
  res.status(202).json(await oemsService.handoffMfBondOrderToWealthCore(req.params.orderId, req.body, actor(req)));
}));

router.post('/mf-bond/orders/:orderId/wealth-core/status', serviceRoute(async (req, res) => {
  res.json(await oemsService.syncWealthCoreOrderStatus(req.params.orderId, req.body, actor(req)));
}));

router.get('/fx-today/live-rates', serviceRoute(async (req, res) => {
  res.json(await oemsService.listFxLiveRates({
    currencyPair: req.query.currencyPair as string | undefined,
    status: req.query.status as string | undefined,
  }));
}));

router.post('/fx-today/live-rates', serviceRoute(async (req, res) => {
  res.status(201).json(await oemsService.createFxLiveRate(req.body, actor(req)));
}));

router.get('/fx-today/details', serviceRoute(async (req, res) => {
  res.json(await oemsService.listFxTodayDetails({
    settlementStatus: req.query.settlementStatus as string | undefined,
    confirmationStatus: req.query.confirmationStatus as string | undefined,
  }));
}));

router.get('/fx-today/blotter', serviceRoute(async (req, res) => {
  res.json(await oemsService.getFxTodayBlotter({
    settlementStatus: req.query.settlementStatus as string | undefined,
    currencyPair: req.query.currencyPair as string | undefined,
  }));
}));

router.post('/fx-today/orders', serviceRoute(async (req, res) => {
  const result = await oemsService.createFxTodayOrder(req.body, actor(req));
  res.status(201).json(result);
}));

router.post('/fx-today/orders/:orderId/rate-refresh', serviceRoute(async (req, res) => {
  res.json(await oemsService.refreshFxTodayRate(req.params.orderId, req.body, actor(req)));
}));

router.post('/fx-today/orders/:orderId/confirm', serviceRoute(async (req, res) => {
  res.json(await oemsService.confirmFxTodayOrder(req.params.orderId, req.body, actor(req)));
}));

router.post('/fx-today/orders/:orderId/treasury-snd', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveFxTreasurySnd(req.params.orderId, req.body, actor(req)));
}));

router.post('/fx-today/orders/:orderId/lhbu', serviceRoute(async (req, res) => {
  res.json(await oemsService.confirmFxLhbuPurposeCode(req.params.orderId, req.body, actor(req)));
}));

router.post('/fx-today/orders/:orderId/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveFxTodayOrder(req.params.orderId, req.body, actor(req)));
}));

router.post('/fx-today/eod-settlement-check', serviceRoute(async (req, res) => {
  res.json(await oemsService.runFxTodayEodSettlementCheck(req.body, actor(req)));
}));

router.post('/wealth-lending/facilities', serviceRoute(async (req, res) => {
  const facility = await oemsService.registerWealthLendingFacility(req.body, actor(req));
  res.status(201).json(facility);
}));

router.post('/wealth-lending/facilities/:facilityId/collateral', serviceRoute(async (req, res) => {
  const collateral = await oemsService.addWealthLendingCollateral(req.params.facilityId, req.body, actor(req));
  res.status(201).json(collateral);
}));

router.get('/wealth-lending/facilities/:facilityId/visibility', serviceRoute(async (req, res) => {
  res.json(await oemsService.getWealthLendingFacilityVisibility(req.params.facilityId, {
    channel: req.query.channel as string | undefined,
    actorCustomerId: actorCustomerId(req),
  }, actor(req)));
}));

router.post('/wealth-lending/facilities/:facilityId/prices/retrieve', serviceRoute(async (req, res) => {
  res.json(await oemsService.retrieveWealthLendingMarketPrices(req.params.facilityId, req.body, actor(req)));
}));

router.post('/wealth-lending/facilities/:facilityId/outstanding/retrieve', serviceRoute(async (req, res) => {
  res.json(await oemsService.retrieveWealthLendingOutstanding(req.params.facilityId, req.body, actor(req)));
}));

router.post('/wealth-lending/facilities/:facilityId/m2m', serviceRoute(async (req, res) => {
  res.json(await oemsService.runWealthLendingM2m(req.params.facilityId, req.body, actor(req)));
}));

router.post('/wealth-lending/facilities/:facilityId/limit-visibility', serviceRoute(async (req, res) => {
  res.json(await oemsService.publishWealthLendingLimitVisibility(req.params.facilityId, req.body, actor(req)));
}));

router.post('/wealth-lending/facilities/:facilityId/cure-actions', serviceRoute(async (req, res) => {
  const action = await oemsService.recordWealthLendingCureAction(req.params.facilityId, req.body, actor(req));
  res.status(201).json(action);
}));

router.post('/wealth-lending/facilities/:facilityId/sell-collateral', serviceRoute(async (req, res) => {
  const instruction = await oemsService.instructWealthLendingSellCollateral(req.params.facilityId, req.body, actor(req));
  res.status(201).json(instruction);
}));

router.get('/wealth-lending/instructions', serviceRoute(async (req, res) => {
  res.json(await oemsService.listWealthLendingInstructions({
    facilityId: req.query.facilityId as string | undefined,
    instructionType: req.query.instructionType as string | undefined,
    status: req.query.status as string | undefined,
  }));
}));

router.post('/portfolios/holdings', serviceRoute(async (req, res) => {
  const holding = await oemsService.createPortfolioHolding(req.body, actor(req));
  res.status(201).json(holding);
}));

router.get('/portfolios/:customerId', serviceRoute(async (req, res) => {
  const sourceStatus = typeof req.query.sourceStatus === 'string' ? JSON.parse(req.query.sourceStatus) : undefined;
  const fxRates = typeof req.query.fxRates === 'string' ? JSON.parse(req.query.fxRates) : undefined;
  res.json(await oemsService.getCombinedPortfolioView({
    customerId: req.params.customerId,
    portfolioId: req.query.portfolioId as string | undefined,
    productFamily: req.query.productFamily as OemsProductFamily | undefined,
    holdingMetric: req.query.holdingMetric as string | undefined,
    sourceStatus,
    fxRates,
    asOfDate: req.query.asOfDate as string | undefined,
    actorRole: actorRole(req),
    actorCustomerId: actorCustomerId(req),
  }, actor(req)));
}));

router.post('/portfolios/:customerId/export', serviceRoute(async (req, res) => {
  const job = await oemsService.exportPortfolioView(req.params.customerId, req.body, actor(req));
  res.status(job.export_status === 'READY' ? 201 : 202).json(job);
}));

router.get('/integrations', serviceRoute(async (req, res) => {
  res.json(await oemsService.listIntegrationMessages({ status: req.query.status as string | undefined }));
}));

router.post('/integrations', serviceRoute(async (req, res) => {
  const message = await oemsService.logIntegrationMessage(req.body, actor(req));
  res.status(201).json(message);
}));

router.post('/integrations/:id/retry', serviceRoute(async (req, res) => {
  res.json(await oemsService.retryIntegrationMessage(intParam(req.params.id, 'Integration message ID'), actor(req)));
}));

router.get('/integration-adapters', serviceRoute(async (req, res) => {
  res.json(await oemsService.listIntegrationAdapters({
    targetSystem: req.query.targetSystem as string | undefined,
    status: req.query.status as string | undefined,
    certificationStatus: req.query.certificationStatus as string | undefined,
  }));
}));

router.post('/integration-adapters', serviceRoute(async (req, res) => {
  const adapter = await oemsService.createIntegrationAdapter(req.body, actor(req));
  res.status(201).json(adapter);
}));

router.patch('/integration-adapters/:adapterId/security', serviceRoute(async (req, res) => {
  res.json(await oemsService.updateIntegrationAdapterSecurity(req.params.adapterId, req.body, actor(req)));
}));

router.post('/integration-adapters/:adapterId/execute', serviceRoute(async (req, res) => {
  const execution = await oemsService.executeIntegrationAdapter(req.params.adapterId, req.body, actor(req));
  res.status(execution.execution_status === 'QUEUED' ? 202 : 201).json(execution);
}));

router.post('/integration-adapters/:adapterId/health', serviceRoute(async (req, res) => {
  res.json(await oemsService.recordIntegrationAdapterHealth(req.params.adapterId, req.body, actor(req)));
}));

router.get('/integration-adapter-executions', serviceRoute(async (req, res) => {
  res.json(await oemsService.listIntegrationAdapterExecutions({
    adapterId: req.query.adapterId as string | undefined,
    targetSystem: req.query.targetSystem as string | undefined,
    status: req.query.status as string | undefined,
  }));
}));

router.get('/approval-workflows', serviceRoute(async (req, res) => {
  res.json(await oemsService.listApprovalWorkflowDefinitions({
    productFamily: req.query.productFamily as OemsProductFamily | undefined,
    status: req.query.status as string | undefined,
    entityType: req.query.entityType as string | undefined,
  }));
}));

router.post('/approval-workflows', serviceRoute(async (req, res) => {
  const workflow = await oemsService.createApprovalWorkflowDefinition(req.body, actor(req));
  res.status(201).json(workflow);
}));

router.get('/approval-queue', serviceRoute(async (req, res) => {
  res.json(await oemsService.listApprovalQueueItems({
    status: req.query.status as string | undefined,
    assignedRole: req.query.assignedRole as string | undefined,
    orderId: req.query.orderId as string | undefined,
    entityId: req.query.entityId as string | undefined,
  }));
}));

router.post('/approval-queue', serviceRoute(async (req, res) => {
  const item = await oemsService.enqueueApprovalQueueItem(req.body, actor(req));
  res.status(201).json(item);
}));

router.post('/approval-queue/:queueItemId/decision', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.decideApprovalQueueItem(req.params.queueItemId, req.body, actor(req)));
}));

router.get('/notifications/templates', serviceRoute(async (req, res) => {
  res.json(await oemsService.listNotificationTemplates({
    eventCode: req.query.eventCode as string | undefined,
    status: req.query.status as any,
    productFamily: req.query.productFamily as OemsProductFamily | undefined,
  }));
}));

router.post('/notifications/templates', serviceRoute(async (req, res) => {
  const template = await oemsService.createNotificationTemplate(req.body, actor(req));
  res.status(201).json(template);
}));

router.post('/notifications/templates/:id/submit', serviceRoute(async (req, res) => {
  res.json(await oemsService.submitNotificationTemplate(intParam(req.params.id, 'Notification template ID'), actor(req)));
}));

router.post('/notifications/templates/:id/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveNotificationTemplate(intParam(req.params.id, 'Notification template ID'), actor(req)));
}));

router.post('/notifications/templates/:id/reject', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectNotificationTemplate(
    intParam(req.params.id, 'Notification template ID'),
    req.body?.reason ?? req.body?.reviewComments,
    actor(req),
  ));
}));

router.post('/notifications/templates/:id/retire', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.retireNotificationTemplate(
    intParam(req.params.id, 'Notification template ID'),
    req.body?.reason,
    actor(req),
  ));
}));

router.post('/notifications/events', serviceRoute(async (req, res) => {
  const result = await oemsService.dispatchNotificationEvent(req.body, actor(req));
  res.status(202).json(result);
}));

router.get('/notifications/deliveries', serviceRoute(async (req, res) => {
  res.json(await oemsService.listNotificationDeliveries({
    status: req.query.status as string | undefined,
    eventCode: req.query.eventCode as string | undefined,
    channel: req.query.channel as any,
    orderId: req.query.orderId as string | undefined,
    operationsOnly: req.query.operationsOnly === 'true',
  }));
}));

router.post('/notifications/deliveries/:id/retry', serviceRoute(async (req, res) => {
  res.json(await oemsService.retryNotificationDelivery(intParam(req.params.id, 'Notification delivery ID'), actor(req)));
}));

router.post('/notifications/deliveries/:id/result', serviceRoute(async (req, res) => {
  res.json(await oemsService.markNotificationDeliveryResult(
    intParam(req.params.id, 'Notification delivery ID'),
    req.body,
    actor(req),
  ));
}));

router.get('/notifications/operations-report', serviceRoute(async (req, res) => {
  res.json(await oemsService.getNotificationOperationsReport({ status: req.query.status as string | undefined }));
}));

router.get('/reports', serviceRoute(async (req, res) => {
  res.json(await oemsService.listReportDefinitions({
    productFamily: req.query.productFamily as OemsProductFamily | undefined,
    category: req.query.category as string | undefined,
    activeOnly: req.query.activeOnly === 'false' ? false : undefined,
  }));
}));

router.post('/reports', serviceRoute(async (req, res) => {
  const report = await oemsService.createReportDefinition(req.body, actor(req));
  res.status(201).json(report);
}));

router.get('/reports/exports', serviceRoute(async (req, res) => {
  res.json(await oemsService.listExportJobs({
    status: req.query.status as string | undefined,
    reportCode: req.query.reportCode as string | undefined,
    requestedBy: req.query.requestedBy as string | undefined,
  }));
}));

router.get('/reports/exports/:jobId', serviceRoute(async (req, res) => {
  res.json(await oemsService.getExportJob(req.params.jobId));
}));

router.post('/reports/exports/:jobId/retry', serviceRoute(async (req, res) => {
  res.json(await oemsService.retryExportJob(req.params.jobId, actor(req)));
}));

router.get('/reports/render-artifacts', serviceRoute(async (req, res) => {
  res.json(await oemsService.listReportRenderArtifacts({
    exportJobId: req.query.exportJobId as string | undefined,
    reportCode: req.query.reportCode as string | undefined,
    status: req.query.status as string | undefined,
  }));
}));

router.get('/reports/render-artifacts/:artifactId', serviceRoute(async (req, res) => {
  res.json(await oemsService.getReportRenderArtifact(req.params.artifactId));
}));

router.post('/reports/exports/:jobId/render', serviceRoute(async (req, res) => {
  const artifact = await oemsService.renderReportArtifact(req.params.jobId, req.body, actor(req));
  res.status(201).json(artifact);
}));

router.get('/migration-rollbacks', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMigrationRollbackScripts({
    status: req.query.status as string | undefined,
    migrationName: req.query.migrationName as string | undefined,
  }));
}));

router.post('/migration-rollbacks', serviceRoute(async (req, res) => {
  const rollback = await oemsService.registerMigrationRollbackScript(req.body, actor(req));
  res.status(201).json(rollback);
}));

router.post('/migration-rollbacks/:rollbackId/verify', serviceRoute(async (req, res) => {
  res.json(await oemsService.verifyMigrationRollbackScript(req.params.rollbackId, req.body, actor(req)));
}));

router.post('/reports/transaction-history/search', serviceRoute(async (req, res) => {
  res.status(202).json(await oemsService.requestTransactionHistory(req.body, actor(req)));
}));

router.get('/reports/:reportCode', serviceRoute(async (req, res) => {
  res.json(await oemsService.previewReport(req.params.reportCode, req.query));
}));

router.post('/reports/:reportCode/exports', serviceRoute(async (req, res) => {
  const job = await oemsService.startExportJob(req.params.reportCode, req.body, actor(req));
  res.status(job.export_status === 'READY' ? 201 : 202).json(job);
}));

router.post('/reports/:reportCode/export', serviceRoute(async (req, res) => {
  const job = await oemsService.startExportJob(req.params.reportCode, req.body, actor(req));
  res.status(job.export_status === 'READY' ? 201 : 202).json(job);
}));

// ============================================================================
// Enhanced Product Setup — FX ODA Product Approval Workflow
// ============================================================================

router.get('/products/enhanced', serviceRoute(async (req, res) => {
  res.json(await oemsService.listProductsEnhanced({
    search: req.query.search as string | undefined,
    currencyPair: req.query.currencyPair as string | undefined,
    status: req.query.status as string | undefined,
    productFamily: req.query.productFamily as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.post('/products/enhanced', serviceRoute(async (req, res) => {
  const product = await oemsService.createProductEnhanced(req.body, actor(req));
  res.status(201).json(product);
}));

router.patch('/products/:id', serviceRoute(async (req, res) => {
  res.json(await oemsService.modifyProduct(intParam(req.params.id, 'Product ID'), req.body, actor(req)));
}));

router.post('/products/:id/submit', serviceRoute(async (req, res) => {
  res.json(await oemsService.submitProduct(intParam(req.params.id, 'Product ID'), actor(req)));
}));

router.post('/products/:id/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveProduct(intParam(req.params.id, 'Product ID'), actor(req)));
}));

router.post('/products/:id/reject', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectProduct(intParam(req.params.id, 'Product ID'), req.body?.reason, actor(req)));
}));

router.post('/products/:id/deactivate', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.deactivateProduct(intParam(req.params.id, 'Product ID'), req.body?.reason, actor(req)));
}));

// ============================================================================
// Enhanced MLD Tranche Setup — Approval Workflow
// ============================================================================

router.get('/mld/tranches/enhanced', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMldTranchesEnhanced({
    search: req.query.search as string | undefined,
    optionType: req.query.optionType as string | undefined,
    status: req.query.status as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.post('/mld/tranches/enhanced', serviceRoute(async (req, res) => {
  const tranche = await oemsService.createMldTrancheEnhanced(req.body, actor(req));
  res.status(201).json(tranche);
}));

router.patch('/mld/tranches/:id', serviceRoute(async (req, res) => {
  res.json(await oemsService.modifyMldTranche(intParam(req.params.id, 'Tranche ID'), req.body, actor(req)));
}));

router.post('/mld/tranches/:id/submit', serviceRoute(async (req, res) => {
  res.json(await oemsService.submitMldTranche(intParam(req.params.id, 'Tranche ID'), actor(req)));
}));

router.post('/mld/tranches/:id/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveMldTranche(intParam(req.params.id, 'Tranche ID'), actor(req)));
}));

router.post('/mld/tranches/:id/reject', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectMldTranche(intParam(req.params.id, 'Tranche ID'), req.body?.reason, actor(req)));
}));

router.post('/mld/tranches/:id/deactivate', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.deactivateMldTranche(intParam(req.params.id, 'Tranche ID'), req.body?.reason, actor(req)));
}));

// ============================================================================
// ODA Order Management — Pending Approval, Blotter, Treasury Summary, Trade Conf, Cancelled
// ============================================================================

router.get('/oda/pending-approval', serviceRoute(async (req, res) => {
  res.json(await oemsService.listPendingApprovalOdaOrders({
    branch: req.query.branch as string | undefined,
    currencyPair: req.query.currencyPair as string | undefined,
    orderType: req.query.orderType as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.post('/oda/recommendations/:id/approve-order', serviceRoute(async (req, res) => {
  res.json(await oemsService.approveOdaOrderEnhanced(intParam(req.params.id, 'Recommendation ID'), req.body ?? {}, actor(req)));
}));

router.post('/oda/recommendations/:id/reject-order', serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectOdaOrderWithReason(intParam(req.params.id, 'Recommendation ID'), req.body?.reason, actor(req)));
}));

router.post('/oda/recommendations/:id/request-info', serviceRoute(async (req, res) => {
  res.json(await oemsService.requestOdaMoreInfo(intParam(req.params.id, 'Recommendation ID'), req.body?.comment, actor(req)));
}));

router.get('/oda/blotter/enhanced', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaBlotterEnhanced({
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    currencyPair: req.query.currencyPair as string | undefined,
    lifecycle: req.query.lifecycle as string | undefined,
    orderType: req.query.orderType as string | undefined,
    direction: req.query.direction as string | undefined,
    branch: req.query.branch as string | undefined,
    search: req.query.search as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.get('/oda/treasury-summary/detailed', serviceRoute(async (req, res) => {
  res.json(await oemsService.getOdaTreasurySummaryWithDetails({
    date: req.query.date as string | undefined,
    currencyPair: req.query.currencyPair as string | undefined,
    direction: req.query.direction as string | undefined,
  }));
}));

router.post('/oda/trade-confirmations', serviceRoute(async (req, res) => {
  const conf = await oemsService.createOdaTradeConfirmation(req.body, actor(req));
  res.status(201).json(conf);
}));

router.get('/oda/trade-confirmations', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaTradeConfirmations({
    date: req.query.date as string | undefined,
    currencyPair: req.query.currencyPair as string | undefined,
    status: req.query.status as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.post('/oda/trade-confirmations/:id/approve', denyBusinessApproval(), serviceRoute(async (req, res) => {
  res.json(await oemsService.approveOdaTradeConfirmation(intParam(req.params.id, 'Confirmation ID'), req.body ?? {}, actor(req)));
}));

router.get('/oda/cancelled', serviceRoute(async (req, res) => {
  res.json(await oemsService.listOdaCancelledOrders({
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    currencyPair: req.query.currencyPair as string | undefined,
    reason: req.query.reason as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.post('/oda/cancelled/:id/retry-unhold', serviceRoute(async (req, res) => {
  res.json(await oemsService.retryOdaUnhold(intParam(req.params.id, 'Recommendation ID'), actor(req)));
}));

router.post('/oda/cancelled/:id/resend-notification', serviceRoute(async (req, res) => {
  res.json(await oemsService.resendOdaNotification(intParam(req.params.id, 'Recommendation ID'), req.body?.eventCode ?? 'ODA_STATUS', actor(req)));
}));

// ============================================================================
// MLD Order Management — Pending Approval, Blotter, Cancelled
// ============================================================================

router.get('/mld/pending-approval', serviceRoute(async (req, res) => {
  res.json(await oemsService.listPendingApprovalMldOrders({
    trancheId: req.query.trancheId ? Number(req.query.trancheId) : undefined,
    search: req.query.search as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.post('/mld/orders/:orderId/approve-order', serviceRoute(async (req, res) => {
  res.json(await oemsService.approveMldOrderEnhanced(intParam(req.params.orderId, 'Order ID'), req.body ?? {}, actor(req)));
}));

router.post('/mld/orders/:orderId/reject-order', serviceRoute(async (req, res) => {
  res.json(await oemsService.rejectMldOrderWithReason(intParam(req.params.orderId, 'Order ID'), req.body?.reason, actor(req)));
}));

router.post('/mld/orders/:orderId/request-info', serviceRoute(async (req, res) => {
  res.json(await oemsService.requestMldMoreInfo(intParam(req.params.orderId, 'Order ID'), req.body?.comment, actor(req)));
}));

router.get('/mld/blotter/enhanced', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMldBlotterEnhanced({
    trancheId: req.query.trancheId ? Number(req.query.trancheId) : undefined,
    lifecycle: req.query.lifecycle as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

router.get('/mld/cancelled', serviceRoute(async (req, res) => {
  res.json(await oemsService.listMldCancelledOrders({
    lifecycle: req.query.lifecycle as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  }));
}));

export default router;
