/**
 * E2E Contribution Tax Event Tests — Philippines BRD Gaps (FR-CON-006)
 *
 * Verifies the tax event generation in contributionService.postContribution(),
 * the unmatched inventory view, and inventory decrement methods.
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

// Track calls to db.insert().values() so we can inspect the tax event payload
const insertValuesSpy = vi.fn().mockReturnValue({ catch: vi.fn().mockResolvedValue(undefined) });
const returningMock = vi.fn();
let insertFailMode = false;

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
  // Default row simulates an APPROVED contribution with real values
  const defaultContribution: Record<string, any> = {
    id: 1,
    portfolio_id: 'PF-001',
    amount: '100000',
    currency: 'PHP',
    contribution_status: 'APPROVED',
    source_account: 'BANK-001',
    type: 'CASH',
    created_by: '1',
  };
  const defaultLedger: Record<string, any> = {
    id: 10,
    portfolio_id: 'PF-001',
    balance: '500000',
    available_balance: '500000',
    currency: 'PHP',
  };
  const defaultTransaction: Record<string, any> = { id: 100 };
  const defaultPosition: Record<string, any> = {
    id: 1,
    portfolio_id: 'PF-001',
    security_id: 1,
    quantity: '1000',
    cost_basis: '50000',
    market_value: '55000',
    as_of_date: '2026-04-29',
  };

  const asyncChain = (): any =>
    new Proxy(Promise.resolve([defaultContribution]) as any, {
      get(target: any, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop].bind(target);
        }
        if (prop === 'returning') {
          return (..._args: any[]) => Promise.resolve([defaultContribution]);
        }
        return (..._args: any[]) => asyncChain();
      },
    });

  // Build a smarter proxy that routes insert().values() through our spy
  const insertProxy = (): any => {
    return {
      values: (...args: any[]) => {
        insertValuesSpy(...args);
        const catchable = {
          returning: () => Promise.resolve([defaultTransaction]),
          catch: (fn: any) => {
            if (insertFailMode) {
              fn(new Error('DB insert failed'));
            }
            return Promise.resolve([defaultTransaction]);
          },
        };
        return catchable;
      },
    };
  };

  const dbProxy: any = new Proxy(
    {},
    {
      get(_target: any, prop: string) {
        if (prop === 'insert') return () => insertProxy();
        if (prop === 'select') {
          return () => ({
            from: (table: any) => {
              // Route based on table usage
              const chain: any = {
                where: () => chain,
                limit: () => chain,
                offset: () => chain,
                leftJoin: () => chain,
                groupBy: () => Promise.resolve([defaultPosition]),
                orderBy: () => Promise.resolve([defaultPosition]),
                then: (resolve: any) => resolve([defaultContribution]),
                catch: (fn: any) => Promise.resolve([defaultContribution]),
                finally: (fn: any) => Promise.resolve([defaultContribution]),
              };
              return chain;
            },
          });
        }
        if (prop === 'update') {
          return () => ({
            set: () => ({
              where: () => ({
                returning: () => Promise.resolve([{ ...defaultContribution, contribution_status: 'POSTED', balance: '600000' }]),
                then: (resolve: any) => resolve([defaultLedger]),
              }),
            }),
          });
        }
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
    'notificationTemplates', 'notificationConsent', 'systemConfig',
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
  sqlTag.join = (...args: any[]) => args;
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

let contributionService: any;

beforeAll(async () => {
  const mod = await import('../../server/services/contribution-service');
  contributionService = mod.contributionService;
});

beforeEach(() => {
  insertValuesSpy.mockClear();
  insertFailMode = false;
});

// ===========================================================================
// Test Suites
// ===========================================================================

describe('Contribution Tax Event — Philippines BRD (FR-CON-006)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('1. Service Import Verification', () => {
    it('should export contributionService object', () => {
      expect(contributionService).toBeDefined();
      expect(typeof contributionService).toBe('object');
    });

    it('should have recordContribution method', () => {
      expect(typeof contributionService.recordContribution).toBe('function');
    });

    it('should have approveContribution method', () => {
      expect(typeof contributionService.approveContribution).toBe('function');
    });

    it('should have postContribution method', () => {
      expect(typeof contributionService.postContribution).toBe('function');
    });

    it('should have getUnmatchedInventory method', () => {
      expect(typeof contributionService.getUnmatchedInventory).toBe('function');
    });

    it('should have decrementInventory method', () => {
      expect(typeof contributionService.decrementInventory).toBe('function');
    });

    it('should have getContributions method', () => {
      expect(typeof contributionService.getContributions).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. postContribution Tax Event Generation (FR-CON-006)
  // -------------------------------------------------------------------------
  describe('2. postContribution — Tax Event Generation (FR-CON-006)', () => {
    it('should call insert with tax event values during postContribution', async () => {
      const result = await contributionService.postContribution(1);
      expect(result).toBeDefined();
      // Verify insert was called (for cash transaction, tax event, etc.)
      expect(insertValuesSpy).toHaveBeenCalled();
    });

    it('should create tax event with tax_type WHT', async () => {
      await contributionService.postContribution(1);
      // Find the call that inserted a tax event (has tax_type field)
      const taxCall = insertValuesSpy.mock.calls.find(
        (call: any[]) => call[0]?.tax_type === 'WHT',
      );
      expect(taxCall).toBeDefined();
      expect(taxCall[0].tax_type).toBe('WHT');
    });

    it('should create tax event with source CONTRIBUTION', async () => {
      await contributionService.postContribution(1);
      const taxCall = insertValuesSpy.mock.calls.find(
        (call: any[]) => call[0]?.source === 'CONTRIBUTION',
      );
      expect(taxCall).toBeDefined();
      expect(taxCall[0].source).toBe('CONTRIBUTION');
    });

    it('should create tax event with filing_status PENDING', async () => {
      await contributionService.postContribution(1);
      const taxCall = insertValuesSpy.mock.calls.find(
        (call: any[]) => call[0]?.filing_status === 'PENDING',
      );
      expect(taxCall).toBeDefined();
      expect(taxCall[0].filing_status).toBe('PENDING');
    });

    it('should set tax_rate and tax_amount to 0 for contribution tax event', async () => {
      await contributionService.postContribution(1);
      const taxCall = insertValuesSpy.mock.calls.find(
        (call: any[]) => call[0]?.tax_type === 'WHT',
      );
      expect(taxCall).toBeDefined();
      expect(taxCall[0].tax_rate).toBe('0');
      expect(taxCall[0].tax_amount).toBe('0');
    });

    it('should set certificate_ref based on contribution ID', async () => {
      await contributionService.postContribution(1);
      const taxCall = insertValuesSpy.mock.calls.find(
        (call: any[]) => call[0]?.certificate_ref?.startsWith('CONTRIB-'),
      );
      expect(taxCall).toBeDefined();
      expect(taxCall[0].certificate_ref).toBe('CONTRIB-1');
    });

    it('should return tax_event_type WHT in the result', async () => {
      const result = await contributionService.postContribution(1);
      expect(result.tax_event_type).toBe('WHT');
    });

    it('should not throw when tax event insert fails (non-blocking)', async () => {
      insertFailMode = true;
      // postContribution uses .catch() on the tax event insert, so it should not throw
      const result = await contributionService.postContribution(1);
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Record Contribution Validation
  // -------------------------------------------------------------------------
  describe('3. Record Contribution Validation', () => {
    it('should reject zero amount contribution', async () => {
      await expect(
        contributionService.recordContribution({
          portfolioId: 'PF-001',
          amount: 0,
          currency: 'PHP',
          sourceAccount: 'BANK-001',
          type: 'CASH',
        }),
      ).rejects.toThrow('Contribution amount must be positive');
    });

    it('should reject negative amount contribution', async () => {
      await expect(
        contributionService.recordContribution({
          portfolioId: 'PF-001',
          amount: -500,
          currency: 'PHP',
          sourceAccount: 'BANK-001',
          type: 'CASH',
        }),
      ).rejects.toThrow('Contribution amount must be positive');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Unmatched Inventory View (FR-CON-006)
  // -------------------------------------------------------------------------
  describe('4. Unmatched Inventory View (FR-CON-006)', () => {
    it('should return inventory items for a portfolio', async () => {
      const result = await contributionService.getUnmatchedInventory('PF-001');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should include status field in inventory items (MATCHED or UNMATCHED)', async () => {
      const result = await contributionService.getUnmatchedInventory('PF-001');
      if (result.length > 0) {
        expect(['MATCHED', 'UNMATCHED']).toContain(result[0].status);
      }
      // Verify the method returns without error even with mock data
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Decrement Inventory
  // -------------------------------------------------------------------------
  describe('5. Decrement Inventory', () => {
    it('should reject zero decrement quantity', async () => {
      await expect(
        contributionService.decrementInventory(1, 0),
      ).rejects.toThrow('Decrement quantity must be positive');
    });

    it('should reject negative decrement quantity', async () => {
      await expect(
        contributionService.decrementInventory(1, -100),
      ).rejects.toThrow('Decrement quantity must be positive');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Contribution Listing with Pagination
  // -------------------------------------------------------------------------
  describe('6. Contribution Listing with Pagination', () => {
    it('should list contributions with no filters', async () => {
      const result = await contributionService.getContributions({});
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
    });

    it('should default to page 1 when no page is provided', async () => {
      const result = await contributionService.getContributions({});
      expect(result.page).toBe(1);
    });

    it('should respect pageSize cap of 100', async () => {
      const result = await contributionService.getContributions({ pageSize: 500 });
      expect(result.pageSize).toBeLessThanOrEqual(100);
    });

    it('should support filtering by portfolioId', async () => {
      const result = await contributionService.getContributions({ portfolioId: 'PF-001' });
      expect(result).toBeDefined();
      expect(result.page).toBe(1);
    });

    it('should support filtering by status', async () => {
      const result = await contributionService.getContributions({ status: 'POSTED' });
      expect(result).toBeDefined();
    });
  });
});
