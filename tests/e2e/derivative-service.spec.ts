/**
 * E2E Derivative Service Tests (FR-DER-001, FR-DER-002)
 *
 * Verifies derivative instrument setup management (CRUD), validation
 * of notional limits / margin / allowed underliers, and derivative
 * tagging on orders with pre-trade margin checks.
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi } from 'vitest';

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
    InferSelectModel: undefined,
  };
});

// ---------------------------------------------------------------------------
// Import service under test
// ---------------------------------------------------------------------------

import { derivativeService } from '../../server/services/derivative-service';

// ===========================================================================
// Test Suites
// ===========================================================================

describe('E2E Derivative Service (FR-DER-001, FR-DER-002)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('Service Import Verification', () => {
    it('should import derivativeService', () => {
      expect(derivativeService).toBeDefined();
    });

    it('should expose createSetup method', () => {
      expect(typeof derivativeService.createSetup).toBe('function');
    });

    it('should expose getSetup method', () => {
      expect(typeof derivativeService.getSetup).toBe('function');
    });

    it('should expose listSetups method', () => {
      expect(typeof derivativeService.listSetups).toBe('function');
    });

    it('should expose updateSetup method', () => {
      expect(typeof derivativeService.updateSetup).toBe('function');
    });

    it('should expose deleteSetup method', () => {
      expect(typeof derivativeService.deleteSetup).toBe('function');
    });

    it('should expose validateDerivativeSetup method', () => {
      expect(typeof derivativeService.validateDerivativeSetup).toBe('function');
    });

    it('should expose attachDerivativeToOrder method', () => {
      expect(typeof derivativeService.attachDerivativeToOrder).toBe('function');
    });

    it('should expose checkDerivativeMargin method', () => {
      expect(typeof derivativeService.checkDerivativeMargin).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. FR-DER-001: Derivative Setup Validation
  // -------------------------------------------------------------------------
  describe('FR-DER-001: Setup Validation', () => {
    it('should validate a valid derivative setup', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'FUTURES',
        notional: '500000',
        max_notional_limit: '1000000',
        expiry_date: '2028-12-31',
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject notional exceeding max_notional_limit', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'OPTION_CALL',
        notional: '2000000',
        max_notional_limit: '1000000',
        expiry_date: '2028-12-31',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('exceeds');
    });

    it('should reject expired derivative (past expiry_date)', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'SWAP',
        notional: '100000',
        max_notional_limit: '500000',
        expiry_date: '2020-01-01',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('future'))).toBe(true);
    });

    it('should reject underlier not in allowed_underliers list', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'FORWARD',
        underlier: 'INVALID_SEC',
        allowed_underliers: ['SEC-001', 'SEC-002', 'SEC-003'],
        expiry_date: '2028-12-31',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('allowed underliers'))).toBe(true);
    });

    it('should pass when underlier is in the allowed list', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'FORWARD',
        underlier: 'SEC-002',
        allowed_underliers: ['SEC-001', 'SEC-002', 'SEC-003'],
        expiry_date: '2028-12-31',
      });
      expect(result.valid).toBe(true);
    });

    it('should pass when no allowed_underliers list is defined', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'WARRANT',
        underlier: 'ANY_UNDERLIER',
        expiry_date: '2028-12-31',
      });
      expect(result.valid).toBe(true);
    });

    it('should pass when max_notional_limit is zero (no limit)', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'FUTURES',
        notional: '999999999',
        max_notional_limit: '0',
        expiry_date: '2028-12-31',
      });
      expect(result.valid).toBe(true);
    });

    it('should accumulate multiple validation errors', () => {
      const result = derivativeService.validateDerivativeSetup({
        instrument_type: 'OPTION_PUT',
        notional: '5000000',
        max_notional_limit: '1000000',
        expiry_date: '2020-01-01',
        underlier: 'BAD_SEC',
        allowed_underliers: ['GOOD_SEC'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // 3. FR-DER-001: CRUD Operations
  // -------------------------------------------------------------------------
  describe('FR-DER-001: CRUD Operations', () => {
    it('should create a derivative setup', async () => {
      const result = await derivativeService.createSetup({
        instrument_type: 'FUTURES',
        notional: '500000',
        max_notional_limit: '1000000',
        expiry_date: '2028-12-31',
        margin_req: '50000',
      });
      expect(result).toBeDefined();
    });

    it('should reject creation of setup with validation errors', async () => {
      await expect(
        derivativeService.createSetup({
          instrument_type: 'OPTION_CALL',
          notional: '2000000',
          max_notional_limit: '1000000',
          expiry_date: '2028-12-31',
        }),
      ).rejects.toThrow('validation failed');
    });

    it('should fetch a derivative setup by ID', async () => {
      const result = await derivativeService.getSetup(1);
      // Mock returns [{}], so result may be an empty object or null-ish
      expect(result).toBeDefined();
    });

    it('should list derivative setups with pagination', async () => {
      const result = await derivativeService.listSetups({ page: 1, pageSize: 10 });
      expect(result).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // 4. FR-DER-002: Order Tagging and Margin Check
  // -------------------------------------------------------------------------
  describe('FR-DER-002: Order Tagging', () => {
    it('should check derivative margin for an order', async () => {
      const result = await derivativeService.checkDerivativeMargin('ORD-001');
      expect(result).toBeDefined();
      expect(result.rule).toBe('FR-DER-002:MARGIN_CHECK');
      expect(typeof result.passed).toBe('boolean');
    });

    it('should return severity field in margin check result', async () => {
      const result = await derivativeService.checkDerivativeMargin('ORD-002');
      expect(['hard', 'soft', null]).toContain(result.severity);
    });

    it('should return overridable field in margin check result', async () => {
      const result = await derivativeService.checkDerivativeMargin('ORD-003');
      expect(typeof result.overridable).toBe('boolean');
    });

    it('should return a message in margin check result', async () => {
      const result = await derivativeService.checkDerivativeMargin('ORD-004');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });
  });
});
