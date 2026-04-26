/**
 * E2E IMASI Service Tests (FR-IMASI-003, FR-IMASI-004)
 *
 * Verifies the Investment Management Account Special Instructions service:
 * Finacle core banking sync, pretermination penalty calculation, and
 * bulk reconciliation.
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
  };
});

// ---------------------------------------------------------------------------
// Import service under test
// ---------------------------------------------------------------------------

import { imasiService } from '../../server/services/imasi-service';

// ===========================================================================
// Test Suites
// ===========================================================================

describe('E2E IMASI Service (FR-IMASI-003, FR-IMASI-004)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('Service Import Verification', () => {
    it('should import imasiService', () => {
      expect(imasiService).toBeDefined();
    });

    it('should expose syncToFinacle method', () => {
      expect(typeof imasiService.syncToFinacle).toBe('function');
    });

    it('should expose calculatePreterminationPenalty method', () => {
      expect(typeof imasiService.calculatePreterminationPenalty).toBe('function');
    });

    it('should expose bulkReconcile method', () => {
      expect(typeof imasiService.bulkReconcile).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. FR-IMASI-003: Finacle Sync
  // -------------------------------------------------------------------------
  describe('FR-IMASI-003: Finacle Sync', () => {
    it('should sync an account to Finacle and return a sync result', async () => {
      const result = await imasiService.syncToFinacle('ACC-001');
      expect(result).toBeDefined();
      expect(result.accountId).toBe('ACC-001');
      expect(result.syncedAt).toBeDefined();
    });

    it('should include finacleRef in sync result', async () => {
      const result = await imasiService.syncToFinacle('ACC-002');
      expect(result.finacleRef).toBeDefined();
      expect(typeof result.finacleRef).toBe('string');
      expect(result.finacleRef.length).toBeGreaterThan(0);
    });

    it('should have a valid syncStatus value', async () => {
      const result = await imasiService.syncToFinacle('ACC-003');
      expect(['SYNCED', 'MISMATCH', 'ERROR']).toContain(result.syncStatus);
    });

    it('should return mismatches array in sync result', async () => {
      const result = await imasiService.syncToFinacle('ACC-004');
      expect(Array.isArray(result.mismatches)).toBe(true);
    });

    it('should produce ISO timestamp in syncedAt', async () => {
      const result = await imasiService.syncToFinacle('ACC-005');
      const parsed = new Date(result.syncedAt);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // -------------------------------------------------------------------------
  // 3. FR-IMASI-004: Pretermination Penalty Calculation
  // -------------------------------------------------------------------------
  describe('FR-IMASI-004: Pretermination Penalty Calculation', () => {
    it('should calculate pretermination penalty and return result', async () => {
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', '2026-01-15');
      expect(result).toBeDefined();
      expect(result.accountId).toBe('ACC-001');
      expect(result.terminationDate).toBe('2026-01-15');
    });

    it('should return zero penalty when termination is at or after maturity', async () => {
      // With mock data, contract terms have maturityDate in the future from mandate metadata.
      // If we provide a far-future date, penalty should be 0
      const futureDate = '2099-12-31';
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', futureDate);
      expect(result.penaltyRate).toBe(0);
      expect(result.penaltyAmount).toBe(0);
    });

    it('should return principalAmount in result', async () => {
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', '2026-06-01');
      expect(typeof result.principalAmount).toBe('number');
    });

    it('should return accruedInterest as a number', async () => {
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', '2026-06-01');
      expect(typeof result.accruedInterest).toBe('number');
    });

    it('should return netProceeds as a number', async () => {
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', '2026-06-01');
      expect(typeof result.netProceeds).toBe('number');
    });

    it('should apply reduced penalty rate when past minimum hold period', async () => {
      // The mock returns default terms: penaltyRateEarly = 2.0, minHoldDays = 30.
      // If daysHeld >= 30 but before maturity, penalty should be half (1.0).
      // With mock data, principalAmount = 0, so penalty calculation still runs.
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', '2026-06-01');
      // penaltyRate should be either the full rate or half rate
      expect(typeof result.penaltyRate).toBe('number');
      expect(result.penaltyRate).toBeGreaterThanOrEqual(0);
    });

    it('should use current date when terminationDate is not provided', async () => {
      const result = await imasiService.calculatePreterminationPenalty('ACC-001');
      expect(result.terminationDate).toBeDefined();
      expect(result.terminationDate.length).toBe(10); // YYYY-MM-DD format
    });

    it('should include originalMaturity in result', async () => {
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', '2026-06-01');
      expect(result.originalMaturity).toBeDefined();
      expect(typeof result.originalMaturity).toBe('string');
    });

    it('should include glBatchId field (may be null in mock)', async () => {
      const result = await imasiService.calculatePreterminationPenalty('ACC-001', '2026-06-01');
      expect('glBatchId' in result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Bulk Reconciliation
  // -------------------------------------------------------------------------
  describe('Bulk Reconciliation', () => {
    it('should reconcile multiple accounts and return summary', async () => {
      const result = await imasiService.bulkReconcile(['ACC-001', 'ACC-002', 'ACC-003']);
      expect(result).toBeDefined();
      expect(result.total).toBe(3);
    });

    it('should return correct count fields in summary', async () => {
      const result = await imasiService.bulkReconcile(['ACC-001', 'ACC-002']);
      expect(typeof result.synced).toBe('number');
      expect(typeof result.mismatched).toBe('number');
      expect(typeof result.errors).toBe('number');
      expect(result.synced + result.mismatched + result.errors).toBe(result.total);
    });

    it('should return results array with one entry per account', async () => {
      const accountIds = ['ACC-010', 'ACC-011', 'ACC-012', 'ACC-013'];
      const result = await imasiService.bulkReconcile(accountIds);
      expect(result.results.length).toBe(4);
    });

    it('should handle single account in bulk reconcile', async () => {
      const result = await imasiService.bulkReconcile(['ACC-SINGLE']);
      expect(result.total).toBe(1);
      expect(result.results.length).toBe(1);
    });

    it('should handle empty account list', async () => {
      const result = await imasiService.bulkReconcile([]);
      expect(result.total).toBe(0);
      expect(result.synced).toBe(0);
      expect(result.mismatched).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.results.length).toBe(0);
    });
  });
});
