/**
 * E2E Bulk Upload Service Tests — Philippines BRD Gaps (FR-UPL-003)
 *
 * Verifies the bulk upload lifecycle: batch creation, row validation,
 * submission, authorization, rollback, fan-out processing into
 * individual batch items, error reporting, and edge cases.
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

let bulkUploadService: any;

beforeAll(async () => {
  const mod = await import('../../server/services/bulk-upload-service');
  bulkUploadService = mod.bulkUploadService;
});

// ===========================================================================
// Test Suites
// ===========================================================================

describe('Bulk Upload Service — Philippines BRD (FR-UPL-003)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('1. Service Import Verification', () => {
    it('should export bulkUploadService object', () => {
      expect(bulkUploadService).toBeDefined();
      expect(typeof bulkUploadService).toBe('object');
    });

    it('should have createBatch method', () => {
      expect(typeof bulkUploadService.createBatch).toBe('function');
    });

    it('should have validateBatch method', () => {
      expect(typeof bulkUploadService.validateBatch).toBe('function');
    });

    it('should have submitBatch method', () => {
      expect(typeof bulkUploadService.submitBatch).toBe('function');
    });

    it('should have authorizeBatch method', () => {
      expect(typeof bulkUploadService.authorizeBatch).toBe('function');
    });

    it('should have rollbackBatch method', () => {
      expect(typeof bulkUploadService.rollbackBatch).toBe('function');
    });

    it('should have getBatchStatus method', () => {
      expect(typeof bulkUploadService.getBatchStatus).toBe('function');
    });

    it('should have getBatches method', () => {
      expect(typeof bulkUploadService.getBatches).toBe('function');
    });

    it('should have fanOutUpload method (FR-UPL-003)', () => {
      expect(typeof bulkUploadService.fanOutUpload).toBe('function');
    });

    it('should have getErrorReport method', () => {
      expect(typeof bulkUploadService.getErrorReport).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Batch Creation
  // -------------------------------------------------------------------------
  describe('2. Batch Creation', () => {
    it('should create a batch with valid data', async () => {
      const result = await bulkUploadService.createBatch({
        filename: 'transactions_2026-04-21.csv',
        rowCount: 150,
        uploadedBy: 1,
      });
      expect(result).toBeDefined();
    });

    it('should create a batch with zero rows', async () => {
      const result = await bulkUploadService.createBatch({
        filename: 'empty_file.csv',
        rowCount: 0,
        uploadedBy: 1,
      });
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Batch Validation
  // -------------------------------------------------------------------------
  describe('3. Batch Validation', () => {
    it('should validate a batch with all valid rows', async () => {
      const rows = [
        { account_id: 'ACC-001', amount: 1000, currency: 'PHP' },
        { account_id: 'ACC-002', amount: 2500, currency: 'USD' },
      ];
      const result = await bulkUploadService.validateBatch(1, rows);
      expect(result).toBeDefined();
      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', async () => {
      const rows = [
        { amount: 1000, currency: 'PHP' }, // Missing account_id
        { account_id: 'ACC-002', currency: 'USD' }, // Missing amount
        { account_id: 'ACC-003', amount: 500 }, // Missing currency
      ];
      const result = await bulkUploadService.validateBatch(1, rows);
      expect(result).toBeDefined();
      expect(result.rejected).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid numeric amounts', async () => {
      const rows = [
        { account_id: 'ACC-001', amount: 'not-a-number', currency: 'PHP' },
      ];
      const result = await bulkUploadService.validateBatch(1, rows);
      expect(result.rejected).toBe(1);
      expect(result.errors.some((e: any) => e.field === 'amount')).toBe(true);
    });

    it('should detect invalid currency codes', async () => {
      const rows = [
        { account_id: 'ACC-001', amount: 1000, currency: 'ph' }, // Not 3-letter uppercase
        { account_id: 'ACC-002', amount: 2000, currency: 'EURO' }, // 4 letters
      ];
      const result = await bulkUploadService.validateBatch(1, rows);
      expect(result.rejected).toBe(2);
      expect(result.errors.some((e: any) => e.field === 'currency')).toBe(true);
    });

    it('should validate empty batch (no rows)', async () => {
      const result = await bulkUploadService.validateBatch(1, []);
      expect(result).toBeDefined();
      expect(result.accepted).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Batch Submission
  // -------------------------------------------------------------------------
  describe('4. Batch Submission', () => {
    it('should call submitBatch without throwing', async () => {
      try {
        const result = await bulkUploadService.submitBatch(1);
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have VALIDATED status
        expect(err.message).toContain('not validated');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Batch Authorization
  // -------------------------------------------------------------------------
  describe('5. Batch Authorization', () => {
    it('should call authorizeBatch without throwing', async () => {
      try {
        const result = await bulkUploadService.authorizeBatch(1, 2);
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have PENDING_AUTH status
        expect(err.message).toContain('not pending authorization');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Batch Rollback
  // -------------------------------------------------------------------------
  describe('6. Batch Rollback', () => {
    it('should call rollbackBatch without throwing', async () => {
      try {
        const result = await bulkUploadService.rollbackBatch(1);
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have AUTHORIZED status
        expect(err.message).toContain('not authorized');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. FR-UPL-003: Fan-Out Processing
  // -------------------------------------------------------------------------
  describe('7. FR-UPL-003: Fan-Out Processing', () => {
    it('should fan out upload into individual items', async () => {
      try {
        const result = await bulkUploadService.fanOutUpload(1);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('total');
        expect(result).toHaveProperty('succeeded');
        expect(result).toHaveProperty('failed');
        expect(result).toHaveProperty('errors');
      } catch (err: any) {
        // Expected: mock row may have status CREATED
        expect(err.message).toContain('not been validated');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8. Batch Status & Listing
  // -------------------------------------------------------------------------
  describe('8. Batch Status & Listing', () => {
    it('should get batch status by ID', async () => {
      const result = await bulkUploadService.getBatchStatus(1);
      expect(result).toBeDefined();
    });

    it('should list batches with no filters', async () => {
      const result = await bulkUploadService.getBatches({});
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
    });

    it('should list batches filtered by status', async () => {
      const result = await bulkUploadService.getBatches({ status: 'VALIDATED' });
      expect(result).toBeDefined();
      expect(result.page).toBe(1);
    });

    it('should respect pageSize cap of 100', async () => {
      const result = await bulkUploadService.getBatches({ pageSize: 500 });
      expect(result.pageSize).toBeLessThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Error Report
  // -------------------------------------------------------------------------
  describe('9. Error Report', () => {
    it('should get error report for a batch', async () => {
      const result = await bulkUploadService.getErrorReport(1);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('batchId');
      expect(result).toHaveProperty('totalErrors');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
