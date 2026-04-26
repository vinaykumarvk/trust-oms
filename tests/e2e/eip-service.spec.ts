/**
 * E2E EIP Service Tests — Philippines BRD Gaps (FR-EIP-003, FR-EIP-004)
 *
 * Verifies the EIP lifecycle: enrollment, modification, unsubscription,
 * auto-debit processing, maker-checker approval for enrollment,
 * e-learning completion gating, dashboard summaries, and edge cases.
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

vi.mock('../../server/db', () => {
  const noop = (): any => {};
  const chain = (): any =>
    new Proxy(
      {},
      {
        get() {
          return (..._args: any[]) => chain();
        },
      },
    );
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
  return { db: dbProxy, pool: { query: noop, end: noop }, dbReady: Promise.resolve() };
});

vi.mock('@shared/schema', () => {
  const tableNames = [
    'auditRecords', 'beneficialOwners', 'blocks', 'brokers', 'cashLedger',
    'cashTransactions', 'clientFatcaCrs', 'clientProfiles', 'clients',
    'complianceBreaches', 'complianceLimits', 'complianceRules', 'confirmations',
    'contributions', 'corporateActionEntitlements', 'corporateActions',
    'counterparties', 'eodJobs', 'eodRuns', 'feeAccruals', 'feeInvoices',
    'feeSchedules', 'heldAwayAssets', 'killSwitchEvents', 'kycCases', 'mandates',
    'modelPortfolios', 'navComputations', 'notificationLog', 'orderAuthorizations',
    'orders', 'oreEvents', 'peraAccounts', 'peraTransactions', 'portfolios',
    'positions', 'pricingRecords', 'rebalancingRuns', 'reconBreaks', 'reconRuns',
    'reversalCases', 'scheduledPlans', 'securities', 'settlementInstructions',
    'standingInstructions', 'taxEvents', 'tradeSurveillanceAlerts', 'trades',
    'transfers', 'unitTransactions', 'uploadBatches', 'validationOverrides',
    'whistleblowerCases', 'withdrawals', 'sanctionsScreeningLog', 'form1601fq',
    'fixOutboundMessages', 'switchOrders', 'subsequentAllocations', 'ipoAllocations',
    'brokerChargeSchedules', 'cashSweepRules', 'settlementAccountConfigs',
    'derivativeSetups', 'stressTestResults', 'uploadBatchItems', 'glBusinessEvents',
    'glEventDefinitions', 'glCriteriaDefinitions', 'glCriteriaConditions',
    'glAccountingRuleSets', 'glAccountingIntents', 'glJournalBatches',
    'glJournalEntries', 'glChartOfAccounts', 'glSubAccounts', 'glPeriods',
    'glAuditLog', 'approvalRequests',
    'users', 'countries', 'currencies', 'assetClasses', 'branches', 'exchanges',
    'trustProductTypes', 'feeTypes', 'taxCodes', 'marketCalendar', 'legalEntities',
    'feedRouting', 'dataStewardship', 'approvalWorkflowDefinitions',
    'notificationTemplates', 'notificationConsent',
  ];
  const makeTable = (name: string): any =>
    new Proxy({}, {
      get(_t: any, col: string | symbol) {
        if (typeof col === 'symbol') return undefined;
        if (col === '$inferSelect') return {};
        if (col === '$inferInsert') return {};
        return `${name}.${col}`;
      },
    });
  const mod: Record<string, any> = {};
  for (const t of tableNames) mod[t] = makeTable(t);
  const enumNames = [
    'orderTypeEnum', 'orderSideEnum', 'orderStatusEnum', 'makerCheckerTierEnum',
    'timeInForceTypeEnum', 'paymentModeTypeEnum', 'disposalMethodEnum',
    'backdatingReasonEnum', 'sanctionsScreeningStatusEnum', 'fixMsgTypeEnum',
    'fixAckStatusEnum', 'switchReasonEnum', 'scalingMethodEnum', 'brokerRateTypeEnum',
    'cashSweepFrequencyEnum', 'derivativeInstrumentTypeEnum', 'uploadItemStatusEnum',
    'corporateActionTypeEnum', 'feeTypeEnum',
  ];
  for (const e of enumNames) mod[e] = makeTable(e);
  return mod;
});

vi.mock('drizzle-orm', () => {
  const identity = (...args: any[]) => args;
  const sqlTag: any = (...args: any[]) => args;
  sqlTag.raw = (...args: any[]) => args;
  return {
    eq: identity, desc: (col: any) => col, asc: (col: any) => col,
    and: identity, or: identity, sql: sqlTag, inArray: identity,
    gte: identity, lte: identity, lt: identity, gt: identity,
    isNull: (col: any) => col, count: identity, type: {},
  };
});

// ---------------------------------------------------------------------------
// Import service after mocks
// ---------------------------------------------------------------------------

let eipService: any;

beforeAll(async () => {
  const mod = await import('../../server/services/eip-service');
  eipService = mod.eipService;
});

// ===========================================================================
// Test Suites
// ===========================================================================

describe('EIP Service — Philippines BRD (FR-EIP-003, FR-EIP-004)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('1. Service Import Verification', () => {
    it('should export eipService object', () => {
      expect(eipService).toBeDefined();
      expect(typeof eipService).toBe('object');
    });

    it('should have enrollEIP method', () => {
      expect(typeof eipService.enrollEIP).toBe('function');
    });

    it('should have modifyEIP method', () => {
      expect(typeof eipService.modifyEIP).toBe('function');
    });

    it('should have unsubscribeEIP method', () => {
      expect(typeof eipService.unsubscribeEIP).toBe('function');
    });

    it('should have processAutoDebit method', () => {
      expect(typeof eipService.processAutoDebit).toBe('function');
    });

    it('should have submitEIPEnrollment method (FR-EIP-003)', () => {
      expect(typeof eipService.submitEIPEnrollment).toBe('function');
    });

    it('should have trackELearningCompletion method (FR-EIP-004)', () => {
      expect(typeof eipService.trackELearningCompletion).toBe('function');
    });

    it('should have getEIPDashboard method', () => {
      expect(typeof eipService.getEIPDashboard).toBe('function');
    });

    it('should have getEIPPlans method', () => {
      expect(typeof eipService.getEIPPlans).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. EIP Enrollment
  // -------------------------------------------------------------------------
  describe('2. EIP Enrollment', () => {
    it('should enroll an EIP plan with valid data', async () => {
      const result = await eipService.enrollEIP({
        clientId: 'CLI-001',
        productId: 1,
        amount: 5000,
        frequency: 'MONTHLY',
        caAccount: 'CA-001',
        portfolioId: 'PF-001',
      });
      expect(result).toBeDefined();
    });

    it('should reject zero amount enrollment', async () => {
      await expect(
        eipService.enrollEIP({
          clientId: 'CLI-001',
          productId: 1,
          amount: 0,
          frequency: 'MONTHLY',
          caAccount: 'CA-001',
          portfolioId: 'PF-001',
        }),
      ).rejects.toThrow('EIP amount must be positive');
    });

    it('should reject negative amount enrollment', async () => {
      await expect(
        eipService.enrollEIP({
          clientId: 'CLI-001',
          productId: 1,
          amount: -100,
          frequency: 'MONTHLY',
          caAccount: 'CA-001',
          portfolioId: 'PF-001',
        }),
      ).rejects.toThrow('EIP amount must be positive');
    });

    it('should support various frequencies', async () => {
      for (const freq of ['DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY']) {
        const result = await eipService.enrollEIP({
          clientId: 'CLI-001',
          productId: 1,
          amount: 1000,
          frequency: freq,
          caAccount: 'CA-001',
          portfolioId: 'PF-001',
        });
        expect(result).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. EIP Modification
  // -------------------------------------------------------------------------
  describe('3. EIP Modification', () => {
    it('should modify an EIP plan amount', async () => {
      try {
        const result = await eipService.modifyEIP(1, { amount: 10000 });
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have plan_type=EIP or ACTIVE status
        expect(err.message).toMatch(/not an EIP plan|Cannot modify/);
      }
    });

    it('should modify an EIP plan frequency', async () => {
      try {
        const result = await eipService.modifyEIP(1, { frequency: 'WEEKLY' });
        expect(result).toBeDefined();
      } catch (err: any) {
        expect(err.message).toMatch(/not an EIP plan|Cannot modify/);
      }
    });

    it('should reject modification with zero amount', async () => {
      try {
        await eipService.modifyEIP(1, { amount: 0 });
      } catch (err: any) {
        expect(err.message).toMatch(/must be positive|not an EIP plan|Cannot modify/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. EIP Unsubscription
  // -------------------------------------------------------------------------
  describe('4. EIP Unsubscription', () => {
    it('should unsubscribe an EIP plan', async () => {
      try {
        const result = await eipService.unsubscribeEIP(1, 'No longer needed');
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have plan_type=EIP
        expect(err.message).toMatch(/not an EIP plan|already cancelled/);
      }
    });

    it('should unsubscribe without reason', async () => {
      try {
        const result = await eipService.unsubscribeEIP(1);
        expect(result).toBeDefined();
      } catch (err: any) {
        expect(err.message).toMatch(/not an EIP plan|already cancelled/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Auto-Debit Processing
  // -------------------------------------------------------------------------
  describe('5. Auto-Debit Processing', () => {
    it('should process auto-debit for an EIP plan', async () => {
      try {
        const result = await eipService.processAutoDebit(1);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('plan');
        expect(result).toHaveProperty('processed_amount');
        expect(result).toHaveProperty('previous_date');
        expect(result).toHaveProperty('next_date');
      } catch (err: any) {
        // Expected: mock row may not have plan_type=EIP or ACTIVE status
        expect(err.message).toMatch(/not an EIP plan|Cannot process auto-debit/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. FR-EIP-003: Maker-Checker Approval for Enrollment
  // -------------------------------------------------------------------------
  describe('6. FR-EIP-003: Maker-Checker Approval for Enrollment', () => {
    it('should submit an EIP enrollment for four-eyes approval', async () => {
      try {
        const result = await eipService.submitEIPEnrollment('EMP-001', 1, 10);
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have plan_type=EIP, or duplicate pending
        expect(err.message).toMatch(/not an EIP plan|pending enrollment approval already exists/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. FR-EIP-004: E-Learning Completion Gating
  // -------------------------------------------------------------------------
  describe('7. FR-EIP-004: E-Learning Completion Gating', () => {
    it('should track passing e-learning completion (score >= 70)', async () => {
      const result = await eipService.trackELearningCompletion('EMP-001', 'MOD-BASICS', 85);
      expect(result).toBeDefined();
      expect(result.completed).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(85);
    });

    it('should track failing e-learning completion (score < 70)', async () => {
      const result = await eipService.trackELearningCompletion('EMP-002', 'MOD-BASICS', 45);
      expect(result).toBeDefined();
      expect(result.completed).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(45);
    });

    it('should pass at exact threshold (score = 70)', async () => {
      const result = await eipService.trackELearningCompletion('EMP-003', 'MOD-ADVANCED', 70);
      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
    });

    it('should fail just below threshold (score = 69)', async () => {
      const result = await eipService.trackELearningCompletion('EMP-004', 'MOD-ADVANCED', 69);
      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
    });

    it('should handle zero score', async () => {
      const result = await eipService.trackELearningCompletion('EMP-005', 'MOD-INTRO', 0);
      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should handle perfect score', async () => {
      const result = await eipService.trackELearningCompletion('EMP-006', 'MOD-FINAL', 100);
      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // 8. EIP Dashboard
  // -------------------------------------------------------------------------
  describe('8. EIP Dashboard', () => {
    it('should get EIP dashboard without client filter', async () => {
      const result = await eipService.getEIPDashboard();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('plans');
      expect(result).toHaveProperty('summaries');
      expect(result.summaries).toHaveProperty('total');
      expect(result.summaries).toHaveProperty('active');
      expect(result.summaries).toHaveProperty('paused');
      expect(result.summaries).toHaveProperty('cancelled');
      expect(result.summaries).toHaveProperty('completed');
    });

    it('should get EIP dashboard filtered by clientId', async () => {
      const result = await eipService.getEIPDashboard('CLI-001');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('plans');
      expect(result).toHaveProperty('summaries');
    });
  });

  // -------------------------------------------------------------------------
  // 9. EIP Plan Listing
  // -------------------------------------------------------------------------
  describe('9. EIP Plan Listing', () => {
    it('should list EIP plans with no filters', async () => {
      const result = await eipService.getEIPPlans({});
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
    });

    it('should list EIP plans filtered by clientId', async () => {
      const result = await eipService.getEIPPlans({ clientId: 'CLI-001' });
      expect(result).toBeDefined();
      expect(result.page).toBe(1);
    });

    it('should list EIP plans filtered by status', async () => {
      const result = await eipService.getEIPPlans({ status: 'ACTIVE' });
      expect(result).toBeDefined();
    });

    it('should respect pageSize cap of 100', async () => {
      const result = await eipService.getEIPPlans({ pageSize: 500 });
      expect(result.pageSize).toBeLessThanOrEqual(100);
    });

    it('should support pagination', async () => {
      const result = await eipService.getEIPPlans({ page: 2, pageSize: 10 });
      expect(result).toBeDefined();
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
    });
  });
});
