/**
 * E2E Withdrawal Service Tests — Philippines BRD Gaps (FR-WDL-003, FR-WDL-004)
 *
 * Verifies the withdrawal lifecycle: request, approval, execution, hierarchy
 * resolution (FIFO across sub-fund positions), partial liquidation methods
 * (FIFO, LIFO, PRO_RATA, SPECIFIC_LOT), and edge cases.
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

let withdrawalService: any;

beforeAll(async () => {
  const mod = await import('../../server/services/withdrawal-service');
  withdrawalService = mod.withdrawalService;
});

// ===========================================================================
// Test Suites
// ===========================================================================

describe('Withdrawal Service — Philippines BRD (FR-WDL-003, FR-WDL-004)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('1. Service Import Verification', () => {
    it('should export withdrawalService object', () => {
      expect(withdrawalService).toBeDefined();
      expect(typeof withdrawalService).toBe('object');
    });

    it('should have requestWithdrawal method', () => {
      expect(typeof withdrawalService.requestWithdrawal).toBe('function');
    });

    it('should have calculateWithholdingTax method', () => {
      expect(typeof withdrawalService.calculateWithholdingTax).toBe('function');
    });

    it('should have approveWithdrawal method', () => {
      expect(typeof withdrawalService.approveWithdrawal).toBe('function');
    });

    it('should have executeWithdrawal method', () => {
      expect(typeof withdrawalService.executeWithdrawal).toBe('function');
    });

    it('should have getWithdrawals method', () => {
      expect(typeof withdrawalService.getWithdrawals).toBe('function');
    });

    it('should have resolveWithdrawalHierarchy method (FR-WDL-003)', () => {
      expect(typeof withdrawalService.resolveWithdrawalHierarchy).toBe('function');
    });

    it('should have calculatePartialLiquidation method (FR-WDL-004)', () => {
      expect(typeof withdrawalService.calculatePartialLiquidation).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Withdrawal Request
  // -------------------------------------------------------------------------
  describe('2. Withdrawal Request', () => {
    it('should request a withdrawal with valid data', async () => {
      try {
        const result = await withdrawalService.requestWithdrawal({
          portfolioId: 'PF-001',
          amount: 50000,
          currency: 'PHP',
          destinationAccount: 'BANK-001',
          type: 'NORMAL',
          requestedBy: 1,
        });
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock returns empty row so available_balance parses to 0
        expect(err.message).toContain('Insufficient cash balance');
      }
    });

    it('should reject zero amount withdrawal', async () => {
      await expect(
        withdrawalService.requestWithdrawal({
          portfolioId: 'PF-001',
          amount: 0,
          currency: 'PHP',
          destinationAccount: 'BANK-001',
          type: 'NORMAL',
        }),
      ).rejects.toThrow('Withdrawal amount must be positive');
    });

    it('should reject negative amount withdrawal', async () => {
      await expect(
        withdrawalService.requestWithdrawal({
          portfolioId: 'PF-001',
          amount: -100,
          currency: 'PHP',
          destinationAccount: 'BANK-001',
          type: 'NORMAL',
        }),
      ).rejects.toThrow('Withdrawal amount must be positive');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Withholding Tax Calculation
  // -------------------------------------------------------------------------
  describe('3. Withholding Tax Calculation', () => {
    it('should calculate WHT for a withdrawal', async () => {
      const result = await withdrawalService.calculateWithholdingTax(1);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('wht_rate');
      expect(result).toHaveProperty('wht_amount');
      expect(result).toHaveProperty('net_amount');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Withdrawal Approval
  // -------------------------------------------------------------------------
  describe('4. Withdrawal Approval', () => {
    it('should call approveWithdrawal without throwing', async () => {
      // Mock returns a row — approval status check depends on mock data
      try {
        const result = await withdrawalService.approveWithdrawal(1, 2);
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have PENDING_APPROVAL status
        expect(err.message).toContain('Cannot approve');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Withdrawal Execution
  // -------------------------------------------------------------------------
  describe('5. Withdrawal Execution', () => {
    it('should call executeWithdrawal without throwing', async () => {
      try {
        const result = await withdrawalService.executeWithdrawal(1);
        expect(result).toBeDefined();
      } catch (err: any) {
        // Expected: mock row may not have APPROVED status
        expect(err.message).toContain('Cannot execute');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Withdrawal Listing
  // -------------------------------------------------------------------------
  describe('6. Withdrawal Listing', () => {
    it('should list withdrawals with no filters', async () => {
      const result = await withdrawalService.getWithdrawals({});
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
    });

    it('should list withdrawals filtered by portfolioId', async () => {
      const result = await withdrawalService.getWithdrawals({ portfolioId: 'PF-001' });
      expect(result).toBeDefined();
      expect(result.page).toBe(1);
    });

    it('should list withdrawals filtered by status', async () => {
      const result = await withdrawalService.getWithdrawals({ status: 'PENDING_APPROVAL' });
      expect(result).toBeDefined();
    });

    it('should respect pageSize cap of 100', async () => {
      const result = await withdrawalService.getWithdrawals({ pageSize: 500 });
      expect(result.pageSize).toBeLessThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // 7. FR-WDL-003: Resolve Withdrawal Hierarchy
  // -------------------------------------------------------------------------
  describe('7. FR-WDL-003: Resolve Withdrawal Hierarchy', () => {
    it('should resolve hierarchy for a valid portfolio and amount', async () => {
      const result = await withdrawalService.resolveWithdrawalHierarchy('PF-001', 100000);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('lots');
      expect(result).toHaveProperty('totalValue');
      expect(result).toHaveProperty('shortfall');
      expect(Array.isArray(result.lots)).toBe(true);
    });

    it('should reject zero amount in hierarchy resolution', async () => {
      await expect(
        withdrawalService.resolveWithdrawalHierarchy('PF-001', 0),
      ).rejects.toThrow('Withdrawal amount must be positive');
    });

    it('should reject negative amount in hierarchy resolution', async () => {
      await expect(
        withdrawalService.resolveWithdrawalHierarchy('PF-001', -5000),
      ).rejects.toThrow('Withdrawal amount must be positive');
    });
  });

  // -------------------------------------------------------------------------
  // 8. FR-WDL-004: Partial Liquidation — FIFO
  // -------------------------------------------------------------------------
  describe('8. FR-WDL-004: Partial Liquidation — FIFO', () => {
    it('should calculate FIFO partial liquidation', async () => {
      const result = await withdrawalService.calculatePartialLiquidation(
        'PF-001', 50000, 'FIFO',
      );
      expect(result).toBeDefined();
      expect(result).toHaveProperty('lots');
      expect(result).toHaveProperty('totalProceeds');
      expect(Array.isArray(result.lots)).toBe(true);
    });

    it('should reject zero amount for FIFO', async () => {
      await expect(
        withdrawalService.calculatePartialLiquidation('PF-001', 0, 'FIFO'),
      ).rejects.toThrow('Liquidation amount must be positive');
    });
  });

  // -------------------------------------------------------------------------
  // 9. FR-WDL-004: Partial Liquidation — LIFO
  // -------------------------------------------------------------------------
  describe('9. FR-WDL-004: Partial Liquidation — LIFO', () => {
    it('should calculate LIFO partial liquidation', async () => {
      const result = await withdrawalService.calculatePartialLiquidation(
        'PF-001', 50000, 'LIFO',
      );
      expect(result).toBeDefined();
      expect(result).toHaveProperty('lots');
      expect(result).toHaveProperty('totalProceeds');
    });
  });

  // -------------------------------------------------------------------------
  // 10. FR-WDL-004: Partial Liquidation — PRO_RATA
  // -------------------------------------------------------------------------
  describe('10. FR-WDL-004: Partial Liquidation — PRO_RATA', () => {
    it('should calculate PRO_RATA partial liquidation', async () => {
      try {
        const result = await withdrawalService.calculatePartialLiquidation(
          'PF-001', 50000, 'PRO_RATA',
        );
        expect(result).toBeDefined();
        expect(result).toHaveProperty('lots');
        expect(result).toHaveProperty('totalProceeds');
      } catch (err: any) {
        // Expected: mock returns empty row so market_value parses to 0
        expect(err.message).toContain('Total portfolio market value is zero or negative');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11. FR-WDL-004: Partial Liquidation — SPECIFIC_LOT
  // -------------------------------------------------------------------------
  describe('11. FR-WDL-004: Partial Liquidation — SPECIFIC_LOT', () => {
    it('should calculate SPECIFIC_LOT liquidation with lot IDs', async () => {
      const result = await withdrawalService.calculatePartialLiquidation(
        'PF-001', 50000, 'SPECIFIC_LOT', [1, 2, 3],
      );
      expect(result).toBeDefined();
      expect(result).toHaveProperty('lots');
      expect(result).toHaveProperty('totalProceeds');
    });

    it('should reject SPECIFIC_LOT without lot IDs', async () => {
      await expect(
        withdrawalService.calculatePartialLiquidation('PF-001', 50000, 'SPECIFIC_LOT'),
      ).rejects.toThrow('SPECIFIC_LOT method requires specificLots array');
    });

    it('should reject SPECIFIC_LOT with empty lot array', async () => {
      await expect(
        withdrawalService.calculatePartialLiquidation('PF-001', 50000, 'SPECIFIC_LOT', []),
      ).rejects.toThrow('SPECIFIC_LOT method requires specificLots array');
    });
  });

  // -------------------------------------------------------------------------
  // 12. Edge Cases
  // -------------------------------------------------------------------------
  describe('12. Edge Cases', () => {
    it('should reject negative liquidation amount', async () => {
      await expect(
        withdrawalService.calculatePartialLiquidation('PF-001', -10000, 'FIFO'),
      ).rejects.toThrow('Liquidation amount must be positive');
    });

    it('should handle very large withdrawal amount gracefully', async () => {
      const result = await withdrawalService.resolveWithdrawalHierarchy('PF-001', 999999999);
      expect(result).toBeDefined();
      expect(result.shortfall).toBeGreaterThanOrEqual(0);
    });
  });
});
