/**
 * Danamon OEMS tests
 *
 * Covers the enterprise OEMS domain service added for the Danamon RFP:
 * calculations, service surface, durable command paths, and route registration.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../server/db', () => {
  const asyncChain = (): any =>
    new Proxy(Promise.resolve([{}]) as any, {
      get(target: any, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop].bind(target);
        }
        return (..._args: any[]) => asyncChain();
      },
    });

  const dbProxy: any = new Proxy(
    {},
    {
      get() {
        return (..._args: any[]) => asyncChain();
      },
    },
  );

  return {
    db: dbProxy,
    pool: { query: vi.fn(), end: vi.fn() },
    dbReady: Promise.resolve(),
  };
});

import oemsRouter from '../../server/routes/oems';
import { evaluateCutoffWindow, oemsService } from '../../server/services/oems-service';

const root = process.cwd();

describe('Danamon OEMS domain', () => {
  it('exposes the required enterprise workflow methods', () => {
    expect(typeof oemsService.createProduct).toBe('function');
    expect(typeof oemsService.createParameterSet).toBe('function');
    expect(typeof oemsService.createChannelSession).toBe('function');
    expect(typeof oemsService.validateChannelSession).toBe('function');
    expect(typeof oemsService.listParameterSets).toBe('function');
    expect(typeof oemsService.updateParameterSet).toBe('function');
    expect(typeof oemsService.rejectParameterSet).toBe('function');
    expect(typeof oemsService.retireParameterSet).toBe('function');
    expect(typeof oemsService.createOrder).toBe('function');
    expect(typeof oemsService.listOrderStatusTransitions).toBe('function');
    expect(typeof oemsService.evaluateOrderCutoff).toBe('function');
    expect(typeof oemsService.acknowledgeValidationWarnings).toBe('function');
    expect(typeof oemsService.validateOrder).toBe('function');
    expect(typeof oemsService.createOdaRecommendation).toBe('function');
    expect(typeof oemsService.collectOdaRecommendations).toBe('function');
    expect(typeof oemsService.createMldTranche).toBe('function');
    expect(typeof oemsService.createMfBondOrder).toBe('function');
    expect(typeof oemsService.retrieveWealthCustomerStaticData).toBe('function');
    expect(typeof oemsService.maintainWealthStaticData).toBe('function');
    expect(typeof oemsService.resolveWealthStaticDataConflict).toBe('function');
    expect(typeof oemsService.createWealthProductSnapshot).toBe('function');
    expect(typeof oemsService.validateWealthCoreProductSetup).toBe('function');
    expect(typeof oemsService.registerSidAccount).toBe('function');
    expect(typeof oemsService.initiatePfeRegistration).toBe('function');
    expect(typeof oemsService.syncSalesCertificationToWealthCore).toBe('function');
    expect(typeof oemsService.lockBondLivePrice).toBe('function');
    expect(typeof oemsService.handoffMfBondOrderToWealthCore).toBe('function');
    expect(typeof oemsService.syncWealthCoreOrderStatus).toBe('function');
    expect(typeof oemsService.createFxTodayOrder).toBe('function');
    expect(typeof oemsService.createFxLiveRate).toBe('function');
    expect(typeof oemsService.refreshFxTodayRate).toBe('function');
    expect(typeof oemsService.approveFxTreasurySnd).toBe('function');
    expect(typeof oemsService.confirmFxLhbuPurposeCode).toBe('function');
    expect(typeof oemsService.runFxTodayEodSettlementCheck).toBe('function');
    expect(typeof oemsService.getFxTodayBlotter).toBe('function');
    expect(typeof oemsService.registerWealthLendingFacility).toBe('function');
    expect(typeof oemsService.addWealthLendingCollateral).toBe('function');
    expect(typeof oemsService.retrieveWealthLendingMarketPrices).toBe('function');
    expect(typeof oemsService.retrieveWealthLendingOutstanding).toBe('function');
    expect(typeof oemsService.runWealthLendingM2m).toBe('function');
    expect(typeof oemsService.publishWealthLendingLimitVisibility).toBe('function');
    expect(typeof oemsService.getWealthLendingFacilityVisibility).toBe('function');
    expect(typeof oemsService.recordWealthLendingCureAction).toBe('function');
    expect(typeof oemsService.instructWealthLendingSellCollateral).toBe('function');
    expect(typeof oemsService.listWealthLendingInstructions).toBe('function');
    expect(typeof oemsService.logIntegrationMessage).toBe('function');
    expect(typeof oemsService.createIntegrationAdapter).toBe('function');
    expect(typeof oemsService.updateIntegrationAdapterSecurity).toBe('function');
    expect(typeof oemsService.previewIntegrationAdapterSecurityControls).toBe('function');
    expect(typeof oemsService.listIntegrationAdapters).toBe('function');
    expect(typeof oemsService.assertProductionIntegrationHandoff).toBe('function');
    expect(typeof oemsService.getProductionIntegrationReadinessReport).toBe('function');
    expect(typeof oemsService.executeIntegrationAdapter).toBe('function');
    expect(typeof oemsService.recordIntegrationAdapterHealth).toBe('function');
    expect(typeof oemsService.listIntegrationAdapterExecutions).toBe('function');
    expect(typeof oemsService.createApprovalWorkflowDefinition).toBe('function');
    expect(typeof oemsService.listApprovalWorkflowDefinitions).toBe('function');
    expect(typeof oemsService.enqueueApprovalQueueItem).toBe('function');
    expect(typeof oemsService.listApprovalQueueItems).toBe('function');
    expect(typeof oemsService.reassignApprovalQueueItem).toBe('function');
    expect(typeof oemsService.getOemsRoleControlTower).toBe('function');
    expect(typeof oemsService.decideApprovalQueueItem).toBe('function');
    expect(typeof oemsService.createNotificationTemplate).toBe('function');
    expect(typeof oemsService.submitNotificationTemplate).toBe('function');
    expect(typeof oemsService.approveNotificationTemplate).toBe('function');
    expect(typeof oemsService.dispatchNotificationEvent).toBe('function');
    expect(typeof oemsService.retryNotificationDelivery).toBe('function');
    expect(typeof oemsService.getNotificationOperationsReport).toBe('function');
    expect(typeof oemsService.previewReport).toBe('function');
    expect(typeof oemsService.startExportJob).toBe('function');
    expect(typeof oemsService.renderReportArtifact).toBe('function');
    expect(typeof oemsService.getReportRenderArtifact).toBe('function');
    expect(typeof oemsService.listReportRenderArtifacts).toBe('function');
    expect(typeof oemsService.registerMigrationRollbackScript).toBe('function');
    expect(typeof oemsService.verifyMigrationRollbackScript).toBe('function');
    expect(typeof oemsService.rehearseMigrationRollbackScript).toBe('function');
    expect(typeof oemsService.listMigrationRollbackScripts).toBe('function');
    expect(typeof oemsService.enqueueMigrationCompatibilityItem).toBe('function');
    expect(typeof oemsService.listMigrationCompatibilityQueue).toBe('function');
    expect(typeof oemsService.resolveMigrationCompatibilityItem).toBe('function');
    expect(typeof oemsService.listExportJobs).toBe('function');
    expect(typeof oemsService.retryExportJob).toBe('function');
    expect(typeof oemsService.requestTransactionHistory).toBe('function');
    expect(typeof oemsService.createPortfolioHolding).toBe('function');
    expect(typeof oemsService.getCombinedPortfolioView).toBe('function');
    expect(typeof oemsService.exportPortfolioView).toBe('function');
    expect(typeof oemsService.listDigitalVerifications).toBe('function');
    expect(typeof oemsService.recordDigitalVerificationAttempt).toBe('function');
    expect(typeof oemsService.expireDigitalVerification).toBe('function');
    expect(typeof oemsService.cancelDigitalVerification).toBe('function');
    expect(typeof oemsService.approveDigitalVerificationFallback).toBe('function');
    expect(typeof oemsService.invalidateDigitalVerification).toBe('function');
    expect(typeof oemsService.getSignedDigitalVerificationDocument).toBe('function');
    expect(typeof oemsService.createDocumentChecklistRule).toBe('function');
    expect(typeof oemsService.listDocumentChecklistRules).toBe('function');
    expect(typeof oemsService.generateDocumentChecklist).toBe('function');
    expect(typeof oemsService.getDocumentChecklist).toBe('function');
    expect(typeof oemsService.assertDocumentChecklistReady).toBe('function');
    expect(typeof oemsService.listDocuments).toBe('function');
    expect(typeof oemsService.generateEFormDocument).toBe('function');
    expect(typeof oemsService.signDocument).toBe('function');
    expect(typeof oemsService.registerDocumentWithDms).toBe('function');
    expect(typeof oemsService.registerDocumentWithNcbs).toBe('function');
    expect(typeof oemsService.retryDocumentRegistration).toBe('function');
    expect(typeof oemsService.createRiskQuestionnaireVersion).toBe('function');
    expect(typeof oemsService.approveRiskQuestionnaire).toBe('function');
    expect(typeof oemsService.createRiskProfileAssessment).toBe('function');
    expect(typeof oemsService.recordExternalRiskProfile).toBe('function');
    expect(typeof oemsService.syncRiskProfileToExternal).toBe('function');
    expect(typeof oemsService.validateRiskProfileForOrder).toBe('function');
    expect(typeof oemsService.getRiskProfileReport).toBe('function');
    expect(typeof oemsService.precheckOdaOrder).toBe('function');
    expect(typeof oemsService.registerOdaOrder).toBe('function');
    expect(typeof oemsService.createOdaReferenceRate).toBe('function');
    expect(typeof oemsService.authorizeOdaOrder).toBe('function');
    expect(typeof oemsService.holdOdaFunds).toBe('function');
    expect(typeof oemsService.releaseOdaFunds).toBe('function');
    expect(typeof oemsService.runOdaCotCollection).toBe('function');
    expect(typeof oemsService.requestOdaTreasuryUpdate).toBe('function');
    expect(typeof oemsService.approveOdaTreasuryUpdate).toBe('function');
    expect(typeof oemsService.syncOdaToFp8007).toBe('function');
    expect(typeof oemsService.getOdaFundReleaseReport).toBe('function');
    expect(typeof oemsService.calculateMldMaturityPayout).toBe('function');
    expect(typeof oemsService.issueMldFundInstruction).toBe('function');
    expect(typeof oemsService.runMldPreTradeRecheck).toBe('function');
    expect(typeof oemsService.recordMldFixingOutcome).toBe('function');
    expect(typeof oemsService.matureMldTranche).toBe('function');
    expect(typeof oemsService.listMldOrderDetails).toBe('function');
    expect(typeof oemsService.listMldFundInstructions).toBe('function');
    expect(typeof oemsService.createProductSecurityMaster).toBe('function');
    expect(typeof oemsService.listProductSecurityMaster).toBe('function');
    expect(typeof oemsService.submitProductSecurityMaster).toBe('function');
    expect(typeof oemsService.approveProductSecurityMaster).toBe('function');
    expect(typeof oemsService.validateProductTicketCapture).toBe('function');
    expect(typeof oemsService.createProductOrderTicket).toBe('function');
    expect(typeof oemsService.validateProductOrderTicket).toBe('function');
    expect(typeof oemsService.submitProductOrderTicket).toBe('function');
    expect(typeof oemsService.createPolicyRuleTraceability).toBe('function');
    expect(typeof oemsService.listPolicyRuleTraceability).toBe('function');
    expect(typeof oemsService.assertCertifiedPolicyTraceability).toBe('function');
    expect(typeof oemsService.invalidatePolicyTraceabilityOnRuleChange).toBe('function');
    expect(typeof oemsService.recordSourceSystemEvidence).toBe('function');
    expect(typeof oemsService.classifySourceEvidenceStatus).toBe('function');
    expect(typeof oemsService.recordOemsAuditEvent).toBe('function');
    expect(typeof oemsService.listOemsAuditEvents).toBe('function');
    expect(typeof oemsService.replayOemsAuditTimeline).toBe('function');
    expect(typeof oemsService.enqueueOemsOutboxEvent).toBe('function');
    expect(typeof oemsService.createOemsFeatureFlag).toBe('function');
    expect(typeof oemsService.isOemsFeatureEnabled).toBe('function');
    expect(typeof oemsService.createOemsControlOwnership).toBe('function');
    expect(typeof oemsService.listOemsControlOwnership).toBe('function');
    expect(typeof oemsService.linkOemsControlIncident).toBe('function');
    expect(typeof oemsService.attestOemsControl).toBe('function');
    expect(typeof oemsService.getOemsControlRecertificationReport).toBe('function');
    expect(typeof oemsService.createReconciliationObligation).toBe('function');
    expect(typeof oemsService.listReconciliationObligations).toBe('function');
    expect(typeof oemsService.closeReconciliationObligation).toBe('function');
    expect(typeof oemsService.createOemsFeeTaxSchedule).toBe('function');
    expect(typeof oemsService.approveOemsFeeTaxSchedule).toBe('function');
    expect(typeof oemsService.listOemsFeeTaxSchedules).toBe('function');
    expect(typeof oemsService.calculateFeeTaxFromScheduleInput).toBe('function');
    expect(typeof oemsService.calculateOrderChargesFromSchedules).toBe('function');
    expect(typeof oemsService.validateOdaTicketCapture).toBe('function');
    expect(typeof oemsService.createOdaOrderTicket).toBe('function');
    expect(typeof oemsService.validateOdaOrderTicket).toBe('function');
    expect(typeof oemsService.submitOdaOrderTicket).toBe('function');
    expect(typeof oemsService.getOdaReleaseGateReport).toBe('function');
  });

  it('calculates ODA maturity amounts using tenor, rate, and tax', () => {
    const result = oemsService.calculateOdaNominal({
      nominalAmount: 100_000_000,
      ratePercent: 6,
      tenorDays: 30,
      taxRatePercent: 20,
    });

    expect(result.grossInterest).toBe(493_150.6849);
    expect(result.taxAmount).toBe(98_630.137);
    expect(result.netInterest).toBe(394_520.5479);
    expect(result.maturityAmount).toBe(100_394_520.5479);
  });

  it('flags ODA reference-rate outages and calculates order cost before swap', () => {
    const precheck = oemsService.precheckOdaOrder({
      customerId: 'CUST-001',
      currencyPair: 'USD/IDR',
      direction: 'BUY',
      odaType: 'SINGLE',
      effectiveType: 'INTRADAY',
      nominalAmount: 50_000_000,
      ratePercent: 16_100,
      referenceRateStatus: 'UNAVAILABLE',
      minimumPlacementAmount: 10_000_000,
      availableBalance: 75_000_000,
      cifStatus: 'PASS',
      skuStatus: 'PASS',
      pfeStatus: 'PASS',
      debitAccountNo: '001',
      creditAccountNo: '002',
    });

    expect(precheck.hasBlocking).toBe(true);
    expect(precheck.findings.map((finding) => finding.ruleCode)).toContain('REFERENCE_RATE_UNAVAILABLE');
    expect(oemsService.calculateOdaOrderCostBeforeSwap({ amount: 1000, ratePercent: 16_100 })).toBe(16_100_000);
  });

  it('calculates MLD maturity payout with tax and max-return bonus', () => {
    const payout = oemsService.calculateMldMaturityPayout({
      principalAmount: 100_000_000,
      minimumInterestRatePercent: 1,
      bonusPayoutRatePercent: 4,
      taxRatePercent: 20,
      outcome: 'MAX_RETURN',
    });

    expect(payout.minimumInterestAmount).toBe(1_000_000);
    expect(payout.bonusPayoutAmount).toBe(4_000_000);
    expect(payout.taxAmount).toBe(1_000_000);
    expect(payout.netPayoutAmount).toBe(104_000_000);
  });

  it('classifies minimum trustworthy order source evidence states', () => {
    expect(oemsService.classifySourceEvidenceStatus({ evidenceStatus: 'AVAILABLE' })).toMatchObject({
      evidenceStatus: 'AVAILABLE',
      blocking: false,
      nextAction: 'ALLOW_VALIDATION',
    });
    expect(oemsService.classifySourceEvidenceStatus({ evidenceStatus: 'PENDING' })).toMatchObject({
      evidenceStatus: 'PENDING',
      blocking: true,
      nextAction: 'WAIT_FOR_SOURCE',
    });
    expect(oemsService.classifySourceEvidenceStatus({
      evidenceStatus: 'DEGRADED_APPROVED',
      fallbackApprovalId: 'APQ-001',
    })).toMatchObject({
      evidenceStatus: 'DEGRADED_APPROVED',
      blocking: false,
      nextAction: 'ALLOW_WITH_RECONCILIATION',
    });

    expect(() => oemsService.classifySourceEvidenceStatus({ evidenceStatus: 'FAILED' }))
      .toThrow('Failed source evidence requires failure_code');
    expect(() => oemsService.classifySourceEvidenceStatus({ evidenceStatus: 'UNKNOWN' }))
      .toThrow('Unsupported source evidence status');
  });

  it('enforces policy traceability and feature-flag foundation validation before persistence', async () => {
    await expect(oemsService.createProductSecurityMaster({
      productCode: 'ODA-USD-IDR',
      productFamily: 'ODA',
      displayName: 'USD/IDR ODA',
      riskScore: 7,
    }, 'tester')).rejects.toThrow('Invalid positive integer value');

    await expect(oemsService.createPolicyRuleTraceability({
      ruleCode: 'ODA-COT-001',
      policyReference: 'ODA Cutoff Policy 2.1',
      controlObjective: 'Block ODA orders after configured COT',
      testReference: '',
      certificationStatus: 'CERTIFIED',
    }, 'tester')).rejects.toThrow('Policy traceability test_reference is required');

    await expect(oemsService.createOemsFeatureFlag({
      flagCode: 'OEMS_ODA_TICKET_V1',
      rolloutPercent: 101,
    }, 'tester')).rejects.toThrow('Feature flag rollout_percent must be between 0 and 100');

    process.env.OEMS_FLAG_OEMS_ODA_TICKET_V1 = 'true';
    expect(oemsService.isOemsFeatureEnabled('OEMS_ODA_TICKET_V1')).toBe(true);
    delete process.env.OEMS_FLAG_OEMS_ODA_TICKET_V1;
  });

  it('validates ODA ticket capture before production-intent draft order creation', () => {
    const incomplete = oemsService.validateOdaTicketCapture({
      customerId: 'CIF-001',
      currencyPair: 'USD/IDR',
      direction: 'BUY',
      effectiveType: 'INTRADAY',
      tenorDays: 30,
      nominalAmount: 100_000_000,
      ratePercent: 6.25,
      referenceRate: 6.1,
      valueDate: '2026-05-06',
      cutoffAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      cifStatus: 'PASS',
      skuStatus: 'PASS',
      pfeStatus: 'PASS',
      referenceRateStatus: 'PASS',
      availableBalance: 200_000_000,
      productionIntent: true,
    });

    expect(incomplete.readyForValidation).toBe(false);
    expect(incomplete.findings.map((finding) => finding.ruleCode)).toContain('ODA_SECURITY_MAPPING_REQUIRED');
    expect(incomplete.findings.map((finding) => finding.ruleCode)).toContain('ODA_PRODUCTION_SECURITY_REQUIRED');

    const stale = oemsService.validateOdaTicketCapture({
      securityId: 'SEC-ODA-001',
      customerId: 'CIF-001',
      currencyPair: 'USD/IDR',
      direction: 'BUY',
      effectiveType: 'INTRADAY',
      tenorDays: 30,
      nominalAmount: 100_000_000,
      ratePercent: 6.25,
      referenceRate: 6.1,
      valueDate: '2026-05-06',
      cutoffAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      cifStatus: 'PASS',
      skuStatus: 'STALE',
      pfeStatus: 'PASS',
      referenceRateStatus: 'PASS',
      availableBalance: 200_000_000,
      productionIntent: true,
    });

    expect(stale.readyForValidation).toBe(false);
    expect(stale.findings.map((finding) => finding.ruleCode)).toContain('SOURCE_EVIDENCE_STALE');
  });

  it('validates Wealth Core quota, offering period, and performance evidence', async () => {
    const result = await oemsService.validateWealthCoreProductSetup({
      productCode: 'MF-IDR-BALANCED',
      amount: 150_000_000,
      quotaRemaining: 100_000_000,
      offeringStart: '2026-05-01',
      offeringEnd: '2026-05-03',
      performanceRequired: true,
      performanceStatus: 'MISSING',
      tradeDate: '2026-05-04',
    });

    expect(result.passed).toBe(false);
    expect(result.performanceClaimsAllowed).toBe(false);
    expect(result.findings.map((finding) => finding.ruleCode)).toEqual(expect.arrayContaining([
      'OEMS-WEALTH-QUOTA-001',
      'OEMS-WEALTH-OFFERING-002',
      'OEMS-WEALTH-PERFORMANCE-001',
    ]));
  });

  it('calculates eligible collateral and LTV for wealth lending', () => {
    const eligibleValue = oemsService.calculateEligibleCollateralValue({
      marketValue: 5_000_000_000,
      haircutPercent: 20,
    });
    const ltv = oemsService.calculateLtv({
      outstandingAmount: 2_000_000_000,
      eligibleCollateralValue: eligibleValue,
    });

    expect(eligibleValue).toBe(4_000_000_000);
    expect(ltv).toBe(0.5);
  });

  it('calculates wealth-lending cure requirements for warning and breach handling', () => {
    const result = oemsService.calculateWealthLendingCureRequirement({
      outstandingAmount: 1_200_000_000,
      eligibleCollateralValue: 1_800_000_000,
      ltvWarning: 0.55,
      ltvLimit: 0.65,
      curePeriodDays: 5,
    });

    expect(result.breachLevel).toBe('BREACH');
    expect(result.cureStatus).toBe('OPEN');
    expect(result.overdraftLimitAmount).toBe(1_170_000_000);
    expect(result.repaymentRequired).toBe(210_000_000);
    expect(result.topUpRequired).toBe(381_818_181.8182);
  });

  it('masks and encrypts adapter payloads while enforcing address filters', () => {
    const preview = oemsService.previewIntegrationAdapterSecurityControls({
      targetSystem: 'WEALTH_CORE',
      endpointUrl: '/integrations/wealth-core/v1',
      allowedAddressPatterns: ['/integrations/*'],
      allowedSourceCidrs: ['10.0.0.0/8'],
      encryptionRequired: true,
      sensitiveFieldPaths: ['customerId', 'loanAccountNo', 'amount'],
      payload: {
        customerId: 'CUST-001',
        loanAccountNo: 'LN-001',
        amount: 1_000_000,
        instruction: 'TEST',
      },
      sourceAddress: '10.10.1.25',
      destinationAddress: '/integrations/wealth-core/v1',
    });

    expect(preview.payloadEncrypted).toBe(true);
    expect(preview.securityDecision.addressFiltering).toBe('ENFORCED');
    expect(preview.maskedPayload).toMatchObject({
      customerId: { masked: true },
      loanAccountNo: { masked: true },
      amount: { masked: true },
      instruction: 'TEST',
    });
    expect(() => oemsService.previewIntegrationAdapterSecurityControls({
      targetSystem: 'WEALTH_CORE',
      endpointUrl: 'http://unsafe.example.test',
      requireTls: true,
      payload: { customerId: 'CUST-001' },
    })).toThrow('ADAPTER_TRANSPORT_POLICY_BLOCKED');
  });

  it('calculates fee, tax, and settlement dates from effective-dated schedules', () => {
    const result = oemsService.calculateFeeTaxFromScheduleInput({
      amount: 100_000_000,
      quantity: 10,
      tradeDate: '2026-05-01',
      schedules: [
        {
          scheduleId: 'FTS-MF-SUB',
          feeType: 'FRONT_END_LOAD',
          feeRateType: 'PERCENTAGE',
          feeRate: 1.25,
          taxRate: 11,
          settlementLagDays: 2,
          calendarKey: 'ID_BUSINESS',
        },
        {
          scheduleId: 'FTS-CUSTODY',
          feeType: 'CUSTODY_FEE',
          feeRateType: 'FLAT',
          feeRate: 50_000,
          taxRate: 11,
          settlementLagDays: 1,
          calendarKey: 'ID_BUSINESS',
        },
      ],
    });

    expect(result.totalCharges).toBe(1_300_000);
    expect(result.totalTax).toBe(143_000);
    expect(result.settlementAmount).toBe(98_557_000);
    expect(result.indicativeSettlementDate).toBe('2026-05-05');
  });

  it('validates product-specific ticket capture for non-ODA families', () => {
    const mld = oemsService.validateProductTicketCapture({
      productFamily: 'MLD',
      securityId: 'SEC-MLD-001',
      customerId: 'CUST-001',
      transactionType: 'MLD_SUBSCRIPTION',
      amount: 250_000_000,
      trancheId: 'TRN-001',
      valueDate: '2026-05-06',
      maturityDate: '2027-05-06',
      ncbsHoldStatus: 'AVAILABLE',
      callbackStatus: 'CONFIRMED',
      sourceEvidence: [{ evidenceType: 'NCBS_HOLD', evidenceStatus: 'AVAILABLE', sourceSystem: 'NCBS' }],
    });
    const fx = oemsService.validateProductTicketCapture({
      productFamily: 'FX_TODAY',
      securityId: 'SEC-FX-001',
      customerId: 'CUST-001',
      transactionType: 'FX_TODAY_BUY',
      amount: 75_000,
      currencyPair: 'USD/IDR',
      direction: 'BUY',
      specialRate: 16100,
      customerConfirmationStatus: 'CONFIRMED',
      underlyingDocumentStatus: 'VERIFIED',
      sourceEvidence: [{ evidenceType: 'TREASURY_RATE', evidenceStatus: 'AVAILABLE', sourceSystem: 'TREASURY' }],
    });

    expect(mld.readyForValidation).toBe(true);
    expect(fx.readyForValidation).toBe(true);
    expect(oemsService.validateProductTicketCapture({
      productFamily: 'BOND',
      transactionType: 'BOND_SELL',
      amount: 0,
    } as any).findings.some((finding: any) => finding.severity === 'BLOCKING')).toBe(true);
  });

  it('blocks invalid collateral haircuts', () => {
    expect(() => oemsService.calculateEligibleCollateralValue({
      marketValue: 1_000_000,
      haircutPercent: 125,
    })).toThrow('Haircut percent must be between 0 and 100');
  });

  it('enforces reject-after-COT cutoff rules using product timezone', () => {
    const result = evaluateCutoffWindow({
      cutoffTime: '15:00',
      cutoffAction: 'REJECT_AFTER_COT',
      timezone: 'Asia/Jakarta',
      calendarKeys: ['ID'],
      channelTimestamp: new Date('2026-05-04T09:00:01.000Z'),
      currentDateIsBusinessDay: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.afterCutoff).toBe(true);
    expect(result.reason).toContain('after configured COT');
  });

  it('defers next-business-day cutoff rules to the resolved processing date', () => {
    const result = evaluateCutoffWindow({
      cutoffTime: '15:00',
      cutoffAction: 'NEXT_BUSINESS_DAY',
      timezone: 'Asia/Jakarta',
      calendarKeys: ['ID', 'US'],
      channelTimestamp: new Date('2026-05-04T09:30:00.000Z'),
      currentDateIsBusinessDay: true,
      nextBusinessDate: '2026-05-05',
    });

    expect(result.allowed).toBe(true);
    expect(result.afterCutoff).toBe(true);
    expect(result.processingDate).toBe('2026-05-05');
    expect(result.calendarKeys).toEqual(['ID', 'US']);
  });

  it('fails cutoff evaluation when calendar configuration is missing', () => {
    expect(() => evaluateCutoffWindow({
      cutoffTime: '15:00',
      cutoffAction: 'NEXT_BUSINESS_DAY',
      timezone: 'Asia/Jakarta',
      calendarKeys: [],
      channelTimestamp: new Date('2026-05-04T09:30:00.000Z'),
    })).toThrow('CALENDAR_NOT_CONFIGURED');
  });

  it('can execute durable command paths with the mocked database layer', async () => {
    await expect(oemsService.createProduct({
      productCode: 'ODA-IDR-1M',
      productName: 'IDR ODA 1 Month',
      productFamily: 'ODA',
      currency: 'IDR',
      riskScore: 2,
      productScore: 2,
      minSubscriptionAmount: 10_000_000,
    }, 'tester')).resolves.toBeDefined();

    await expect(oemsService.createOrder({
      productFamily: 'MUTUAL_FUND',
      transactionType: 'SUBSCRIPTION',
      customerId: 'CUST-001',
      portfolioId: 'PF-001',
      amount: 50_000_000,
      customerRiskScore: 4,
      productScore: 3,
      externalRefs: { CRM: 'CRM-ORDER-001' },
    }, 'tester')).resolves.toBeDefined();

    await expect(oemsService.createFxTodayOrder({
      currencyPair: 'USD/IDR',
      dealtCurrency: 'USD',
      counterCurrency: 'IDR',
      amount: 75_000,
      specialRate: 16_100,
      quoteTtlSeconds: 30,
    }, 'tester')).resolves.toBeDefined();
  });

  it('registers the core OEMS API routes', () => {
    const paths = (oemsRouter as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);

    expect(paths).toContain('/summary');
    expect(paths).toContain('/channel-sessions');
    expect(paths).toContain('/channel-sessions/:sessionId/validate');
    expect(paths).toContain('/products');
    expect(paths).toContain('/product-security-master');
    expect(paths).toContain('/product-security-master/:securityId/submit');
    expect(paths).toContain('/product-security-master/:securityId/approve');
    expect(paths).toContain('/product-tickets/validate-capture');
    expect(paths).toContain('/product-tickets');
    expect(paths).toContain('/product-tickets/:ticketId/validate');
    expect(paths).toContain('/product-tickets/:ticketId/submit');
    expect(paths).toContain('/policy-rule-traceability');
    expect(paths).toContain('/policy-rule-traceability/invalidate');
    expect(paths).toContain('/source-system-evidence');
    expect(paths).toContain('/reconciliation-obligations');
    expect(paths).toContain('/reconciliation-obligations/:obligationId/close');
    expect(paths).toContain('/audit-events');
    expect(paths).toContain('/audit-replay');
    expect(paths).toContain('/outbox-events');
    expect(paths).toContain('/feature-flags');
    expect(paths).toContain('/feature-flags/:flagCode/enabled');
    expect(paths).toContain('/control-ownership');
    expect(paths).toContain('/control-ownership/:controlId/attest');
    expect(paths).toContain('/control-ownership/:controlId/incidents');
    expect(paths).toContain('/control-ownership/recertification-report');
    expect(paths).toContain('/parameter-sets');
    expect(paths).toContain('/orders');
    expect(paths).toContain('/orders/:orderId/transitions');
    expect(paths).toContain('/orders/:orderId/cutoff/evaluate');
    expect(paths).toContain('/orders/:orderId/charges/scheduled');
    expect(paths).toContain('/fee-tax-schedules');
    expect(paths).toContain('/fee-tax-schedules/:scheduleId/approve');
    expect(paths).toContain('/orders/:orderId/validation-warnings/acknowledge');
    expect(paths).toContain('/document-rules');
    expect(paths).toContain('/orders/:orderId/documents');
    expect(paths).toContain('/orders/:orderId/documents/checklist');
    expect(paths).toContain('/orders/:orderId/documents/checklist/generate');
    expect(paths).toContain('/orders/:orderId/documents/eforms');
    expect(paths).toContain('/documents/:documentId/sign');
    expect(paths).toContain('/documents/:documentId/dms/register');
    expect(paths).toContain('/documents/:documentId/ncbs/register');
    expect(paths).toContain('/documents/:documentId/retry');
    expect(paths).toContain('/risk/questionnaires');
    expect(paths).toContain('/risk/questionnaires/:id/approve');
    expect(paths).toContain('/risk/product-mappings');
    expect(paths).toContain('/risk/assessments');
    expect(paths).toContain('/risk/customers/:customerId/latest');
    expect(paths).toContain('/risk/customers/:customerId/external-profile');
    expect(paths).toContain('/risk/assessments/:assessmentId/sync/:targetSystem');
    expect(paths).toContain('/orders/:orderId/risk/validate');
    expect(paths).toContain('/risk/reports/profile-status');
    expect(paths).toContain('/orders/:orderId/digital-verifications');
    expect(paths).toContain('/orders/:orderId/digital-verifications/:verificationId/attempts');
    expect(paths).toContain('/orders/:orderId/digital-verifications/:verificationId/expire');
    expect(paths).toContain('/orders/:orderId/digital-verifications/:verificationId/cancel');
    expect(paths).toContain('/orders/:orderId/digital-verifications/:verificationId/fallback-approve');
    expect(paths).toContain('/orders/:orderId/digital-verifications/:verificationId/download');
    expect(paths).toContain('/oda/recommendations');
    expect(paths).toContain('/oda/tickets');
    expect(paths).toContain('/oda/tickets/validate-capture');
    expect(paths).toContain('/oda/tickets/:ticketId/validate');
    expect(paths).toContain('/oda/tickets/:ticketId/submit');
    expect(paths).toContain('/oda/release-gate');
    expect(paths).toContain('/oda/orders');
    expect(paths).toContain('/oda/orders/precheck');
    expect(paths).toContain('/oda/reference-rates');
    expect(paths).toContain('/oda/recommendations/:id/authorize');
    expect(paths).toContain('/oda/recommendations/:id/hold');
    expect(paths).toContain('/oda/recommendations/:id/release');
    expect(paths).toContain('/oda/recommendations/:id/cancel');
    expect(paths).toContain('/oda/collections/run-cot');
    expect(paths).toContain('/oda/daily-summary');
    expect(paths).toContain('/oda/collections/:groupId/treasury-updates');
    expect(paths).toContain('/oda/treasury-updates/:updateId/approve');
    expect(paths).toContain('/oda/fp8007-syncs');
    expect(paths).toContain('/oda/fund-instructions');
    expect(paths).toContain('/oda/reports/fund-release');
    expect(paths).toContain('/mld/tranches');
    expect(paths).toContain('/mld/tranches/:id/pretrade-recheck/run');
    expect(paths).toContain('/mld/tranches/:id/mature');
    expect(paths).toContain('/mld/order-details');
    expect(paths).toContain('/mld/fund-instructions');
    expect(paths).toContain('/mld/orders/:orderId/fixing');
    expect(paths).toContain('/wealth/static-data');
    expect(paths).toContain('/wealth/static-data/retrieve');
    expect(paths).toContain('/wealth/static-data/:staticDataId/resolve');
    expect(paths).toContain('/wealth/products');
    expect(paths).toContain('/wealth/products/:productCode/performance');
    expect(paths).toContain('/wealth/products/validate-setup');
    expect(paths).toContain('/wealth/sid-accounts');
    expect(paths).toContain('/wealth/pfe-registrations');
    expect(paths).toContain('/wealth/sales-certifications/sync');
    expect(paths).toContain('/mf-bond/order-details');
    expect(paths).toContain('/mf-bond/pricing-locks');
    expect(paths).toContain('/mf-bond/orders');
    expect(paths).toContain('/mf-bond/orders/:orderId/bond-price-locks');
    expect(paths).toContain('/mf-bond/orders/:orderId/wealth-core/handoff');
    expect(paths).toContain('/mf-bond/orders/:orderId/wealth-core/status');
    expect(paths).toContain('/fx-today/live-rates');
    expect(paths).toContain('/fx-today/details');
    expect(paths).toContain('/fx-today/blotter');
    expect(paths).toContain('/fx-today/orders');
    expect(paths).toContain('/fx-today/orders/:orderId/rate-refresh');
    expect(paths).toContain('/fx-today/orders/:orderId/treasury-snd');
    expect(paths).toContain('/fx-today/orders/:orderId/lhbu');
    expect(paths).toContain('/fx-today/eod-settlement-check');
    expect(paths).toContain('/wealth-lending/facilities');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/collateral');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/visibility');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/prices/retrieve');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/outstanding/retrieve');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/m2m');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/limit-visibility');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/cure-actions');
    expect(paths).toContain('/wealth-lending/facilities/:facilityId/sell-collateral');
    expect(paths).toContain('/wealth-lending/instructions');
    expect(paths).toContain('/portfolios/holdings');
    expect(paths).toContain('/portfolios/:customerId');
    expect(paths).toContain('/portfolios/:customerId/export');
    expect(paths).toContain('/integrations');
    expect(paths).toContain('/integration-adapters');
    expect(paths).toContain('/integration-adapters/:adapterId/security');
    expect(paths).toContain('/integration-adapters/:adapterId/production-gate');
    expect(paths).toContain('/integration-adapters/production-readiness/report');
    expect(paths).toContain('/integration-adapters/:adapterId/execute');
    expect(paths).toContain('/integration-adapters/:adapterId/health');
    expect(paths).toContain('/integration-adapter-executions');
    expect(paths).toContain('/approval-workflows');
    expect(paths).toContain('/approval-queue');
    expect(paths).toContain('/control-tower');
    expect(paths).toContain('/approval-queue/:queueItemId/reassign');
    expect(paths).toContain('/approval-queue/:queueItemId/decision');
    expect(paths).toContain('/notifications/templates');
    expect(paths).toContain('/notifications/templates/:id/approve');
    expect(paths).toContain('/notifications/events');
    expect(paths).toContain('/notifications/deliveries');
    expect(paths).toContain('/notifications/deliveries/:id/retry');
    expect(paths).toContain('/notifications/operations-report');
    expect(paths).toContain('/reports');
    expect(paths).toContain('/reports/exports');
    expect(paths).toContain('/reports/exports/:jobId/retry');
    expect(paths).toContain('/reports/exports/:jobId/render');
    expect(paths).toContain('/reports/render-artifacts');
    expect(paths).toContain('/reports/render-artifacts/:artifactId');
    expect(paths).toContain('/migration-rollbacks');
    expect(paths).toContain('/migration-rollbacks/:rollbackId/verify');
    expect(paths).toContain('/migration-rollbacks/:rollbackId/rehearse');
    expect(paths).toContain('/migration-compatibility-queue');
    expect(paths).toContain('/migration-compatibility-queue/:queueId/resolve');
    expect(paths).toContain('/reports/transaction-history/search');
    expect(paths).toContain('/reports/:reportCode');
    expect(paths).toContain('/reports/:reportCode/exports');
  });

  it('persists lifecycle schema and migration artifacts for partial BRD closures', () => {
    const schemaSource = readFileSync(path.join(root, 'packages/shared/src/schema.ts'), 'utf8');
    const migrationSource = readFileSync(path.join(root, 'drizzle/20260504_extend_danamon_oems_lifecycle.sql'), 'utf8');
    const rollbackSource = readFileSync(path.join(root, 'drizzle/20260504_extend_danamon_oems_lifecycle.rollback.sql'), 'utf8');
    const securityLendingMigrationSource = readFileSync(path.join(root, 'drizzle/20260504_harden_oems_adapters_and_lending.sql'), 'utf8');
    const securityLendingRollbackSource = readFileSync(path.join(root, 'drizzle/20260504_harden_oems_adapters_and_lending.rollback.sql'), 'utf8');
    const serviceSource = readFileSync(path.join(root, 'server/services/oems-service.ts'), 'utf8');

    expect(schemaSource).toContain('VALIDATION_PENDING_EXTERNAL');
    expect(schemaSource).toContain('PENDING_CUSTOMER_VERIFICATION');
    expect(schemaSource).toContain('assisted_by_user_id');
    expect(schemaSource).toContain('oemsOrderStatusTransitions');
    expect(schemaSource).toContain('oemsChannelSessions');
    expect(schemaSource).toContain('oemsDigitalVerificationAttempts');
    expect(schemaSource).toContain('payload_hash');
    expect(schemaSource).toContain('signature_evidence');
    expect(schemaSource).toContain('oemsDocumentChecklistRules');
    expect(schemaSource).toContain('document_id');
    expect(schemaSource).toContain('REGISTERED_DMS');
    expect(schemaSource).toContain('QUARANTINED');
    expect(schemaSource).toContain('expected_file_hash');
    expect(schemaSource).toContain('oemsRiskQuestionnaireVersions');
    expect(schemaSource).toContain('oemsRiskProfileAssessments');
    expect(schemaSource).toContain('oemsProductRiskMappings');
    expect(schemaSource).toContain('strict_risk_profile');
    expect(schemaSource).toContain('conflict_status');
    expect(schemaSource).toContain('oemsOdaReferenceRates');
    expect(schemaSource).toContain('oemsOdaOrderLegs');
    expect(schemaSource).toContain('oemsOdaFundInstructions');
    expect(schemaSource).toContain('oemsOdaTreasuryUpdates');
    expect(schemaSource).toContain('oemsOdaDailySummaries');
    expect(schemaSource).toContain('oemsOdaFp8007Syncs');
    expect(schemaSource).toContain('minimum_collective_amount');
    expect(schemaSource).toContain('oemsMldOrderDetails');
    expect(schemaSource).toContain('oemsMldFundInstructions');
    expect(schemaSource).toContain('oemsMldPretradeRechecks');
    expect(schemaSource).toContain('oemsMldCallbacks');
    expect(schemaSource).toContain('oemsMldFixingOutcomes');
    expect(schemaSource).toContain('TRADED_PENDING_DEALING_ID');
    expect(schemaSource).toContain('oemsWealthCustomerStaticData');
    expect(schemaSource).toContain('oemsWealthProductSnapshots');
    expect(schemaSource).toContain('oemsMfBondOrderDetails');
    expect(schemaSource).toContain('oemsBondPricingLocks');
    expect(schemaSource).toContain('oemsFxLiveRates');
    expect(schemaSource).toContain('oemsFxTodayDetails');
    expect(schemaSource).toContain('oemsFxTodayBlotterEntries');
    expect(schemaSource).toContain('wealth_core_rejection_reason');
    expect(schemaSource).toContain('lhbu_purpose_code');
    expect(schemaSource).toContain('DBANK_PRO');
    expect(schemaSource).toContain('oemsNotificationTemplateStatusEnum');
    expect(schemaSource).toContain('oemsNotificationDeliveryAttempts');
    expect(schemaSource).toContain('allowed_formats');
    expect(schemaSource).toContain('export_job_id');
    expect(schemaSource).toContain('oemsTransactionHistoryRequests');
    expect(schemaSource).toContain('local_market_value');
    expect(schemaSource).toContain('realized_gain_loss');
    expect(schemaSource).toContain('source_status');
    expect(schemaSource).toContain('cutoff_action');
    expect(schemaSource).toContain('oemsIntegrationAdapters');
    expect(schemaSource).toContain('oemsIntegrationAdapterExecutions');
    expect(schemaSource).toContain('require_tls');
    expect(schemaSource).toContain('request_payload_masked');
    expect(schemaSource).toContain('payload_encrypted');
    expect(schemaSource).toContain('oemsWealthLendingMarketPrices');
    expect(schemaSource).toContain('oemsWealthLendingOutstandingSnapshots');
    expect(schemaSource).toContain('oemsWealthLendingInstructions');
    expect(schemaSource).toContain('oemsWealthLendingCureActions');
    expect(schemaSource).toContain('oemsReportRenderArtifacts');
    expect(schemaSource).toContain('oemsApprovalWorkflowDefinitions');
    expect(schemaSource).toContain('oemsApprovalQueueItems');
    expect(schemaSource).toContain('oemsMigrationRollbackScripts');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_channel_sessions');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_order_status_transitions');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_digital_verification_attempts');
    expect(migrationSource).toContain('PENDING_CUSTOMER_VERIFICATION');
    expect(migrationSource).toContain('signature_evidence');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_document_checklist_rules');
    expect(migrationSource).toContain('REGISTERED_DMS');
    expect(migrationSource).toContain('expected_file_hash');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_risk_questionnaire_versions');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_risk_profile_assessments');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_product_risk_mappings');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_oda_reference_rates');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_oda_order_legs');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_oda_fund_instructions');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_oda_treasury_updates');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_oda_daily_summaries');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_oda_fp8007_syncs');
    expect(migrationSource).toContain('ODA_FUND_RELEASE');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_mld_order_details');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_mld_fund_instructions');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_mld_pretrade_rechecks');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_mld_callbacks');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_mld_fixing_outcomes');
    expect(migrationSource).toContain('MLD_MATURITY_PAYOUT');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_wealth_customer_static_data');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_wealth_product_snapshots');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_mf_bond_order_details');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_bond_pricing_locks');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_fx_live_rates');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_fx_today_details');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_fx_today_blotter_entries');
    expect(migrationSource).toContain('MF_BOND_WEALTH_CORE_HANDOFF');
    expect(migrationSource).toContain('FX_TODAY_EOD_EXCEPTION');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_notification_delivery_attempts');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_transaction_history_requests');
    expect(migrationSource).toContain('allowed_formats');
    expect(migrationSource).toContain('export_job_id');
    expect(migrationSource).toContain('PORTFOLIO_PERFORMANCE');
    expect(migrationSource).toContain('local_market_value');
    expect(migrationSource).toContain('ALTER COLUMN channel SET DEFAULT');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_integration_adapters');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_integration_adapter_executions');
    expect(migrationSource).toContain('ADP-WEALTH-CORE');
    expect(migrationSource).toContain('ADP-NCBS');
    expect(migrationSource).toContain('ADP-DOCUSIGN-ESIGN');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_report_render_artifacts');
    expect(migrationSource).toContain('OEMS_RFP_REPORT_PACK');
    expect(migrationSource).toContain('OEMS_ADAPTER_RECONCILIATION');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_approval_workflow_definitions');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_approval_queue_items');
    expect(migrationSource).toContain('OEMS-ODA-ORDER-APPROVAL');
    expect(migrationSource).toContain('OEMS-REPORT-EXPORT-APPROVAL');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_migration_rollback_scripts');
    expect(migrationSource).toContain('20260504_extend_danamon_oems_lifecycle.rollback.sql');
    expect(rollbackSource).toContain('DROP TABLE IF EXISTS oems_approval_queue_items');
    expect(rollbackSource).toContain('DROP TABLE IF EXISTS oems_integration_adapters');
    expect(rollbackSource).toContain('DROP TABLE IF EXISTS oems_report_render_artifacts');
    expect(securityLendingMigrationSource).toContain('ADD COLUMN IF NOT EXISTS require_tls');
    expect(securityLendingMigrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_wealth_lending_market_prices');
    expect(securityLendingMigrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_wealth_lending_outstanding_snapshots');
    expect(securityLendingMigrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_wealth_lending_instructions');
    expect(securityLendingMigrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_wealth_lending_cure_actions');
    expect(securityLendingMigrationSource).toContain('payload_encrypted');
    expect(securityLendingRollbackSource).toContain('DROP TABLE IF EXISTS oems_wealth_lending_cure_actions');
    expect(securityLendingRollbackSource).toContain('DROP COLUMN IF EXISTS payload_encrypted');
    expect(serviceSource).toContain('Sales-assisted OEMS orders require assisted_by_user_id and branch_code');
    expect(serviceSource).toContain('INVALID_CHANNEL_CONTEXT');
    expect(serviceSource).toContain('INVALID_CHANNEL_CONTEXT: channel altered');
    expect(serviceSource).toContain('CALENDAR_NOT_CONFIGURED');
    expect(serviceSource).toContain('Maker cannot approve their own OEMS parameter changes');
    expect(serviceSource).toContain('Active parameter versions cannot overlap');
    expect(serviceSource).toContain('Maker cannot approve their own OEMS notification template');
    expect(serviceSource).toContain('Critical transactional notifications cannot be disabled or retired');
    expect(serviceSource).toContain('PASSWORD_PROTECTED_ATTACHMENT_REQUIRED');
    expect(serviceSource).toContain('PARTIALLY_DELIVERED');
    expect(serviceSource).toContain('nonBlockingBusinessTransaction');
    expect(serviceSource).toContain('UNSUPPORTED_FORMAT');
    expect(serviceSource).toContain('Treasury Summary Deal Report cannot be downloaded');
    expect(serviceSource).toContain('BIG_DATA_UNAVAILABLE');
    expect(serviceSource).toContain('PROTECTED_SPREADSHEET');
    expect(serviceSource).toContain('Customer users can only view their own OEMS portfolio');
    expect(serviceSource).toContain('missingSourcesNotMergedAsZero');
    expect(serviceSource).toContain('PORTFOLIO_SOURCE_SYNC');
    expect(serviceSource).toContain('BSM fallback approval is available only where digital verification has not been implemented for this channel/product');
    expect(serviceSource).toContain('A verified payload cannot be modified without invalidating the verification and requiring re-verification');
    expect(serviceSource).toContain('Third-party signature outage places orders in PENDING_CUSTOMER_VERIFICATION');
    expect(serviceSource).toContain('Multiple failed OTP attempts lock the verification request and require new issuance');
    expect(serviceSource).toContain('Required missing or rejected documents block submission or execution based on workflow rule');
    expect(serviceSource).toContain('File hash mismatch quarantines the document and prevents use in authorization');
    expect(serviceSource).toContain('DOCUMENT_HASH_MISMATCH_QUARANTINE');
    expect(serviceSource).toContain('NCBS_CIM13');
    expect(serviceSource).toContain('Partial questionnaire answers cannot generate active risk profile');
    expect(serviceSource).toContain('Expired risk profile blocks new investment orders until reassessment or approved exception');
    expect(serviceSource).toContain('External Wealth Core profile conflicts with OEMS profile; stricter profile is used until resolved');
    expect(serviceSource).toContain('RISK_PROFILE_SYNC');
    expect(serviceSource).toContain('REFERENCE_RATE_UNAVAILABLE: Missing Treasury rate source blocks rate-dependent submission');
    expect(serviceSource).toContain('OCO orders must define linked legs and cancel the alternate leg when one leg executes');
    expect(serviceSource).toContain('Sales-originated ODA routes to BSM authorization when digital verification is unavailable');
    expect(serviceSource).toContain('Treasury checker cannot approve their own ODA execution update');
    expect(serviceSource).toContain('ODA amendment and cancellation are allowed only before COT unless checker rejects');
    expect(serviceSource).toContain('ODA_FUND_RELEASE');
    expect(serviceSource).toContain('ODA_FP8007_SYNC');
    expect(serviceSource).toContain('MLD trade date equals value date');
    expect(serviceSource).toContain('MLD fixing date equals maturity date');
    expect(serviceSource).toContain('principalProtectionAppliesOnlyIfHeldUntilMaturity');
    expect(serviceSource).toContain('If NCBS hold fails, MLD order cannot reach final master blotter');
    expect(serviceSource).toContain('MLD callback must be completed before TD creation instruction');
    expect(serviceSource).toContain('TRADED_PENDING_DEALING_ID: NCBS TD creation succeeded but dealing ID retrieval failed');
    expect(serviceSource).toContain('Maturity payout deducts tax according to active tax rules');
    expect(serviceSource).toContain('A tranche cannot move to MATURED until all child orders have a final outcome or exception');
    expect(serviceSource).toContain('Failed maturity credit instruction creates a critical operations exception and notification');
    expect(serviceSource).toContain('Failed customer data retrieval blocks order entry and logs affected source');
    expect(serviceSource).toContain('Missing performance data disables performance claims but does not block unless Wealth Core setup requires performance evidence');
    expect(serviceSource).toContain('Digital verification expiry blocks Wealth Core handoff');
    expect(serviceSource).toContain('Bond live pricing out of range routes to Treasury, in-range exceptions route to supervisor approval');
    expect(serviceSource).toContain('Wealth Core handoff status sync captures downstream rejection reason');
    expect(serviceSource).toContain('FX Today rate changed during confirmation; customer must reconfirm refreshed rate');
    expect(serviceSource).toContain('Underlying document is required when debit currency is IDR and amount is above configured threshold');
    expect(serviceSource).toContain('Pending FX Today settlement at EOD triggers alert and exception report');
    expect(serviceSource).toContain('Certified adapters replace logging-only stubs with contract, retry, idempotency and reconciliation evidence');
    expect(serviceSource).toContain('ADAPTER_ADDRESS_FILTER_BLOCKED');
    expect(serviceSource).toContain('ADAPTER_SOURCE_FILTER_BLOCKED');
    expect(serviceSource).toContain('WEALTH_LENDING_MARKET_PRICE_RETRIEVAL');
    expect(serviceSource).toContain('WEALTH_LENDING_OUTSTANDING_RETRIEVAL');
    expect(serviceSource).toContain('PUBLISH_LIMIT_VISIBILITY');
    expect(serviceSource).toContain('SELL_COLLATERAL');
    expect(serviceSource).toContain('OEMS_WEALTH_LENDING_SELL_COLLATERAL_FAILED');
    expect(serviceSource).toContain('Renderer-backed report artifacts persist file URL, checksum, source manifest and protection evidence');
    expect(serviceSource).toContain('Danamon role matrix approval queues assign reviewer roles and block maker self-approval');
    expect(serviceSource).toContain('Rollback scripts are registered and checksum-verifiable for OEMS migrations');
  });

  it('persists minimum trustworthy order schema and migration artifacts', () => {
    const schemaSource = readFileSync(path.join(root, 'packages/shared/src/schema.ts'), 'utf8');
    const migrationSource = readFileSync(path.join(root, 'drizzle/20260506_add_oems_minimum_trustworthy_order.sql'), 'utf8');
    const serviceSource = readFileSync(path.join(root, 'server/services/oems-service.ts'), 'utf8');
    const routesSource = readFileSync(path.join(root, 'server/routes/oems.ts'), 'utf8');
    const odaTicketUiSource = readFileSync(path.join(root, 'apps/back-office/src/pages/oems-ticket-oda.tsx'), 'utf8');
    const productTicketUiSource = readFileSync(path.join(root, 'apps/back-office/src/pages/oems-product-ticket-workbench.tsx'), 'utf8');
    const controlTowerUiSource = readFileSync(path.join(root, 'apps/back-office/src/pages/oems-control-tower.tsx'), 'utf8');
    const ruleTraceabilityUiSource = readFileSync(path.join(root, 'apps/back-office/src/pages/oems-rule-traceability.tsx'), 'utf8');
    const backOfficeRoutesSource = readFileSync(path.join(root, 'apps/back-office/src/routes/index.tsx'), 'utf8');
    const cutoverRunbookSource = readFileSync(path.join(root, 'docs/operations/oda-cutover-runbook.md'), 'utf8');
    const nfrEvidenceSource = readFileSync(path.join(root, 'docs/reviews/oms-nfr-evidence-2026-05-06.md'), 'utf8');

    expect(schemaSource).toContain('oemsProductSecurityMaster');
    expect(schemaSource).toContain('oemsPolicyRuleTraceability');
    expect(schemaSource).toContain('oemsProductOrderTickets');
    expect(schemaSource).toContain('oemsSourceSystemEvidence');
    expect(schemaSource).toContain('oemsOutboxEvents');
    expect(schemaSource).toContain('oemsAuditEvents');
    expect(schemaSource).toContain('oemsFeatureFlags');
    expect(schemaSource).toContain('oemsControlOwnership');
    expect(schemaSource).toContain('oemsControlAttestations');
    expect(schemaSource).toContain('oemsReconciliationObligations');
    expect(schemaSource).toContain('oemsFeeTaxSchedules');
    expect(schemaSource).toContain('oemsMigrationCompatibilityQueue');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_product_security_master');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_policy_rule_traceability');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_product_order_tickets');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_source_system_evidence');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_outbox_events');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_audit_events');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_feature_flags');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_control_ownership');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_control_attestations');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_reconciliation_obligations');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_fee_tax_schedules');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS oems_migration_compatibility_queue');
    expect(migrationSource).toContain("evidence_status IN ('AVAILABLE','STALE','FAILED','PENDING','CONFLICT','DEGRADED_APPROVED')");
    expect(migrationSource).toContain("certification_status IN ('DRAFT','CERTIFIED','EXPIRED','REVOKED')");
    expect(migrationSource).toContain('ux_oems_outbox_idempotency');
    expect(serviceSource).toContain('Degraded source evidence requires fallback_approval_id');
    expect(serviceSource).toContain('Degraded-mode reconciliation requires customer_impact');
    expect(serviceSource).toContain('FEE_TAX_SCHEDULE_NOT_CONFIGURED');
    expect(serviceSource).toContain('is not CERTIFIED for production handoff');
    expect(serviceSource).toContain('OEMS_CONTROL_ATTESTED');
    expect(serviceSource).toContain('OEMS_APPROVAL_QUEUE_REASSIGNED');
    expect(serviceSource).toContain('Policy traceability policy_reference is required');
    expect(serviceSource).toContain('Feature flag rollout_percent must be between 0 and 100');
    expect(serviceSource).toContain('ODA_GENERIC_WIZARD_BLOCKED');
    expect(serviceSource).toContain('OEMS_ODA_TICKET_SUBMITTED');
    expect(serviceSource).toContain('OEMS_ODA_ORDER_SUBMITTED');
    expect(serviceSource).toContain('WORKFLOW_NOT_CONFIGURED');
    expect(serviceSource).toContain('RULE_POLICY_TRACEABILITY_REQUIRED');
    expect(serviceSource).toContain('OEMS_POLICY_TRACEABILITY_INVALIDATED');
    expect(serviceSource).toContain('OEMS_PRODUCT_TICKET_WORKFLOW_SUBMITTED');
    expect(serviceSource).toContain('PRODUCT_ORDER_STATUS_APPROVAL_AUDIT_OUTBOX');
    expect(serviceSource).toContain('APPROVAL_DECISION_STATUS_AUDIT_OUTBOX');
    expect(serviceSource).toContain('OEMS_CONTROL_INCIDENT_LINKED');
    expect(serviceSource).toContain('OEMS_MIGRATION_ROLLBACK_REHEARSED');
    expect(serviceSource).toContain('OEMS_MIGRATION_COMPATIBILITY_ITEM_CREATED');
    expect(serviceSource).toContain('settlementCalendarSource');
    expect(serviceSource).toContain('getProductionIntegrationReadinessReport');
    expect(serviceSource).toContain('special rate');
    expect(serviceSource).toContain('replayOemsAuditTimeline');
    expect(routesSource).toContain('/integration-adapters/production-readiness/report');
    expect(routesSource).toContain('/control-ownership/:controlId/incidents');
    expect(routesSource).toContain('/migration-rollbacks/:rollbackId/rehearse');
    expect(routesSource).toContain('/migration-compatibility-queue');
    expect(routesSource).toContain("/oda/tickets/:ticketId/submit");
    expect(routesSource).toContain('/oda/release-gate');
    expect(routesSource).toContain('/audit-replay');
    expect(odaTicketUiSource).toContain('Source Evidence');
    expect(odaTicketUiSource).toContain('Document Checklist');
    expect(odaTicketUiSource).toContain('Digital Verification');
    expect(odaTicketUiSource).toContain('/api/v1/oems/oda/tickets');
    expect(odaTicketUiSource).toContain('/api/v1/oems/orders/${createdOrderId}/documents/checklist/generate');
    expect(odaTicketUiSource).toContain('/api/v1/oems/orders/${createdOrderId}/documents');
    expect(odaTicketUiSource).toContain('/api/v1/oems/orders/${createdOrderId}/digital-verifications');
    expect(odaTicketUiSource).toContain('OEMS_ODA_TICKET_V1');
    expect(productTicketUiSource).toContain('Product Ticket Workbench');
    expect(productTicketUiSource).toContain('Family Documents');
    expect(controlTowerUiSource).toContain('OEMS Control Tower');
    expect(controlTowerUiSource).toContain('Reassignment');
    expect(controlTowerUiSource).toContain('Incident Link');
    expect(controlTowerUiSource).toContain('/api/v1/oems/control-ownership/${incidentLink.controlId}/incidents');
    expect(ruleTraceabilityUiSource).toContain('Rule Traceability');
    expect(ruleTraceabilityUiSource).toContain('Structured Editor');
    expect(backOfficeRoutesSource).toContain('oems-ticket-oda');
    expect(backOfficeRoutesSource).toContain('oems-product-ticket-workbench');
    expect(backOfficeRoutesSource).toContain('oems-control-tower');
    expect(backOfficeRoutesSource).toContain('oems-rule-traceability');
    expect(cutoverRunbookSource).toContain('Pre-Cutover Gates');
    expect(cutoverRunbookSource).toContain('Rollback Steps');
    expect(nfrEvidenceSource).toContain('Remaining External NFR Evidence Needed');
  });
});
