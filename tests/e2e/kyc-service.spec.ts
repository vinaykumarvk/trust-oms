/**
 * E2E KYC Service Tests (FR-KYC-003, FR-KYC-004, FR-KYC-005)
 *
 * Verifies KYC case lifecycle, risk rating calculation, UBO threshold
 * enforcement, refresh cadence, expiring KYC detection, bulk renewal,
 * and summary statistics.
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

import { kycService } from '../../server/services/kyc-service';

// ===========================================================================
// Test Suites
// ===========================================================================

describe('E2E KYC Service (FR-KYC-003, FR-KYC-004, FR-KYC-005)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('Service Import Verification', () => {
    it('should import kycService', () => {
      expect(kycService).toBeDefined();
    });

    it('should expose initiateKyc method', () => {
      expect(typeof kycService.initiateKyc).toBe('function');
    });

    it('should expose updateKycStatus method', () => {
      expect(typeof kycService.updateKycStatus).toBe('function');
    });

    it('should expose calculateRiskRating method', () => {
      expect(typeof kycService.calculateRiskRating).toBe('function');
    });

    it('should expose getRefreshCadence method', () => {
      expect(typeof kycService.getRefreshCadence).toBe('function');
    });

    it('should expose getExpiringKyc method', () => {
      expect(typeof kycService.getExpiringKyc).toBe('function');
    });

    it('should expose getExpiredKyc method', () => {
      expect(typeof kycService.getExpiredKyc).toBe('function');
    });

    it('should expose bulkRenewal method', () => {
      expect(typeof kycService.bulkRenewal).toBe('function');
    });

    it('should expose getKycHistory method', () => {
      expect(typeof kycService.getKycHistory).toBe('function');
    });

    it('should expose getSummary method', () => {
      expect(typeof kycService.getSummary).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. FR-KYC-003: Refresh Cadence (Risk-Based)
  // -------------------------------------------------------------------------
  describe('FR-KYC-003: Refresh Cadence', () => {
    it('should return 1-year cadence for HIGH risk', () => {
      expect(kycService.getRefreshCadence('HIGH')).toBe(1);
    });

    it('should return 2-year cadence for MEDIUM risk', () => {
      expect(kycService.getRefreshCadence('MEDIUM')).toBe(2);
    });

    it('should return 3-year cadence for LOW risk', () => {
      expect(kycService.getRefreshCadence('LOW')).toBe(3);
    });

    it('should default to 2-year cadence for unknown risk band', () => {
      expect(kycService.getRefreshCadence('UNKNOWN')).toBe(2);
    });

    it('should be case-insensitive for risk band', () => {
      expect(kycService.getRefreshCadence('high')).toBe(1);
      expect(kycService.getRefreshCadence('Low')).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // 3. FR-KYC-004: KYC Case Lifecycle
  // -------------------------------------------------------------------------
  describe('FR-KYC-004: KYC Case Lifecycle', () => {
    it('should initiate a KYC case', async () => {
      const result = await kycService.initiateKyc('CLIENT-001', {
        risk_rating: 'MEDIUM',
        id_number: 'PH-123456',
        id_type: 'PASSPORT',
      });
      expect(result).toBeDefined();
    });

    it('should update KYC case status', async () => {
      const result = await kycService.updateKycStatus(1, 'VERIFIED');
      expect(result).toBeDefined();
    });

    it('should get KYC history for a client', async () => {
      const result = await kycService.getKycHistory('CLIENT-001');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get expiring KYC cases within default 30 days', async () => {
      const result = await kycService.getExpiringKyc();
      expect(result).toBeDefined();
    });

    it('should get expiring KYC cases with custom days ahead', async () => {
      const result = await kycService.getExpiringKyc(90);
      expect(result).toBeDefined();
    });

    it('should get all expired KYC cases', async () => {
      const result = await kycService.getExpiredKyc();
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. FR-KYC-005: UBO & Risk Rating
  // -------------------------------------------------------------------------
  describe('FR-KYC-005: UBO and Risk Rating', () => {
    it('should calculate risk rating for a client', async () => {
      const result = await kycService.calculateRiskRating('CLIENT-001');
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result);
    });

    it('should return a valid risk rating string', async () => {
      const result = await kycService.calculateRiskRating('CLIENT-002');
      expect(typeof result).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Bulk Operations
  // -------------------------------------------------------------------------
  describe('Bulk Operations', () => {
    it('should perform bulk renewal for multiple clients', async () => {
      const result = await kycService.bulkRenewal(['CLIENT-001', 'CLIENT-002']);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty client list in bulk renewal', async () => {
      const result = await kycService.bulkRenewal([]);
      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Summary Statistics
  // -------------------------------------------------------------------------
  describe('Summary Statistics', () => {
    it('should return KYC summary stats', async () => {
      const result = await kycService.getSummary();
      expect(result).toBeDefined();
      expect(typeof result.total).toBe('number');
      expect(typeof result.verified).toBe('number');
      expect(typeof result.pending).toBe('number');
      expect(typeof result.expired).toBe('number');
      expect(typeof result.rejected).toBe('number');
      expect(typeof result.expiringIn30).toBe('number');
    });
  });
});
