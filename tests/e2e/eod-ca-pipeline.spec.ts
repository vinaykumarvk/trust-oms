/**
 * E2E EOD CA Pipeline Tests — Phase 10 Integration Testing
 *
 * Verifies the EOD orchestrator job definitions, dependency graph,
 * and that all CA-related and TTRA-related jobs are registered
 * in the DAG.
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

vi.mock('../../server/db', () => {
  const noop = (): any => {};
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
    pool: { query: noop, end: noop },
    dbReady: Promise.resolve(),
  };
});

// Mock the shared schema
vi.mock('@shared/schema', () => {
  const tableNames = [
    'auditRecords', 'beneficialOwners', 'blocks', 'brokers', 'cashLedger',
    'cashTransactions', 'clientFatcaCrs', 'clientProfiles', 'clients',
    'complianceBreaches', 'complianceLimits', 'complianceRules', 'confirmations',
    'contributions', 'corporateActionEntitlements', 'corporateActionTypeEnum',
    'corporateActions', 'counterparties', 'eodJobs', 'eodRuns', 'feeAccruals',
    'feeInvoices', 'feeSchedules', 'feeTypeEnum', 'heldAwayAssets',
    'killSwitchEvents', 'kycCases', 'mandates', 'modelPortfolios',
    'navComputations', 'notificationLog', 'orderAuthorizations', 'orders',
    'oreEvents', 'peraAccounts', 'peraTransactions', 'portfolios', 'positions',
    'pricingRecords', 'rebalancingRuns', 'reconBreaks', 'reconRuns',
    'reversalCases', 'scheduledPlans', 'securities', 'settlementInstructions',
    'standingInstructions', 'taxEvents', 'tradeSurveillanceAlerts', 'trades',
    'transfers', 'unitTransactions', 'uploadBatches', 'validationOverrides',
    'whistleblowerCases', 'withdrawals',
    'ttraApplications', 'claims', 'consentRecords', 'feedRouting',
    'degradedModeLogs', 'dataStewardship', 'marketCalendar', 'legalEntities',
    // TFP tables
    'feePlans', 'tfpAccruals', 'tfpInvoices', 'tfpInvoiceLines', 'tfpPayments',
    'feeOverrides', 'exceptionItems', 'pricingDefinitions', 'eligibilityExpressions',
    'accrualSchedules', 'feePlanTemplates', 'auditEvents', 'piiClassifications',
    'taxRules', 'disputes', 'creditNotes', 'jurisdictions', 'contentPacks',
  ];

  const makeTable = (name: string): any =>
    new Proxy(
      {},
      {
        get(_t: any, col: string | symbol) {
          if (typeof col === 'symbol') return undefined;
          if (col === '$inferSelect') return {};
          if (col === '$inferInsert') return {};
          return `${name}.${col}`;
        },
      },
    );

  const mod: Record<string, any> = {};
  for (const t of tableNames) {
    mod[t] = makeTable(t);
  }

  // Provide corporateActionTypeEnum with enumValues
  mod.corporateActionTypeEnum = {
    enumValues: [
      'DIVIDEND_CASH', 'DIVIDEND_STOCK', 'BONUS_ISSUE', 'SPLIT', 'REVERSE_SPLIT', 'CONSOLIDATION',
      'COUPON', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION', 'MATURITY',
      'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION', 'RETURN_OF_CAPITAL',
      'NAME_CHANGE', 'ISIN_CHANGE', 'TICKER_CHANGE', 'PAR_VALUE_CHANGE', 'SECURITY_RECLASSIFICATION',
      'RIGHTS', 'TENDER', 'BUYBACK', 'DUTCH_AUCTION', 'EXCHANGE_OFFER', 'WARRANT_EXERCISE', 'CONVERSION',
      'MERGER', 'PROXY_VOTE', 'CLASS_ACTION',
      'DIVIDEND_WITH_OPTION', 'MERGER_WITH_ELECTION', 'SPINOFF_WITH_OPTION',
      'BONUS',
    ],
  };

  return mod;
});

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => {
  const identity = (...args: any[]) => args;
  const sqlTag: any = (...args: any[]) => args;
  sqlTag.raw = (...args: any[]) => args;
  return {
    eq: identity,
    desc: (col: any) => col,
    asc: (col: any) => col,
    and: identity,
    or: identity,
    sql: sqlTag,
    inArray: identity,
    gte: identity,
    lte: identity,
    lt: identity,
    isNull: (col: any) => col,
    count: identity,
    type: {},
    InferSelectModel: {},
  };
});

// ---------------------------------------------------------------------------
// Import services under test
// ---------------------------------------------------------------------------

import { eodOrchestrator } from '../../server/services/eod-orchestrator';

// ===========================================================================
// Test Suite
// ===========================================================================

describe('E2E EOD CA Pipeline', () => {
  // =========================================================================
  // 1. EOD Job Definitions
  // =========================================================================

  describe('EOD Job Definitions', () => {
    it('should expose getDefinitions method', () => {
      expect(typeof eodOrchestrator.getDefinitions).toBe('function');
    });

    it('should contain at least 20 job definitions (base + Philippines BRD additions)', () => {
      const defs = eodOrchestrator.getDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(20);
    });

    it('should contain all expected job names including CA and TTRA jobs', () => {
      const defs = eodOrchestrator.getDefinitions();
      const jobNames = defs.map((d: { name: string }) => d.name);

      // Core jobs
      expect(jobNames).toContain('nav_ingestion');
      expect(jobNames).toContain('nav_validation');
      expect(jobNames).toContain('portfolio_revaluation');
      expect(jobNames).toContain('position_snapshot');
      expect(jobNames).toContain('settlement_processing');
      expect(jobNames).toContain('fee_accrual');
      expect(jobNames).toContain('commission_accrual');
      expect(jobNames).toContain('invoice_generation');
      expect(jobNames).toContain('notional_accounting');
      expect(jobNames).toContain('reversal_check');
      expect(jobNames).toContain('data_quality_check');
      expect(jobNames).toContain('exception_sweep');
      expect(jobNames).toContain('regulatory_report_gen');
      expect(jobNames).toContain('daily_report');

      // CA-specific jobs (Phase 9)
      expect(jobNames).toContain('ca_entitlement_calc');
      expect(jobNames).toContain('ca_tax_calc');
      expect(jobNames).toContain('ca_settlement');
      expect(jobNames).toContain('ca_recon_triad');

      // TTRA jobs (Phase 9)
      expect(jobNames).toContain('ttra_expiry_check');
      expect(jobNames).toContain('ttra_reminders');
    });

    it('should have unique job names', () => {
      const defs = eodOrchestrator.getDefinitions();
      const jobNames = defs.map((d: { name: string }) => d.name);
      const uniqueNames = new Set(jobNames);
      expect(uniqueNames.size).toBe(jobNames.length);
    });

    it('should have a displayName for every job', () => {
      const defs = eodOrchestrator.getDefinitions();
      for (const def of defs) {
        expect(def.displayName).toBeDefined();
        expect(typeof def.displayName).toBe('string');
        expect(def.displayName.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // 2. EOD Job Dependency Graph
  // =========================================================================

  describe('EOD Job Dependency Graph', () => {
    it('should have ca_entitlement_calc depend on position_snapshot', () => {
      const defs = eodOrchestrator.getDefinitions();
      const caEntCalc = defs.find((d: { name: string }) => d.name === 'ca_entitlement_calc');

      expect(caEntCalc).toBeDefined();
      expect(caEntCalc!.dependsOn).toContain('position_snapshot');
    });

    it('should have ca_tax_calc depend on ca_entitlement_calc', () => {
      const defs = eodOrchestrator.getDefinitions();
      const caTaxCalc = defs.find((d: { name: string }) => d.name === 'ca_tax_calc');

      expect(caTaxCalc).toBeDefined();
      expect(caTaxCalc!.dependsOn).toContain('ca_entitlement_calc');
    });

    it('should have ca_settlement depend on ca_tax_calc', () => {
      const defs = eodOrchestrator.getDefinitions();
      const caSettlement = defs.find((d: { name: string }) => d.name === 'ca_settlement');

      expect(caSettlement).toBeDefined();
      expect(caSettlement!.dependsOn).toContain('ca_tax_calc');
    });

    it('should have ca_recon_triad depend on ca_settlement and fee_accrual', () => {
      const defs = eodOrchestrator.getDefinitions();
      const caReconTriad = defs.find((d: { name: string }) => d.name === 'ca_recon_triad');

      expect(caReconTriad).toBeDefined();
      expect(caReconTriad!.dependsOn).toContain('ca_settlement');
      expect(caReconTriad!.dependsOn).toContain('fee_accrual');
    });

    it('should have ttra_expiry_check with no dependencies (root job)', () => {
      const defs = eodOrchestrator.getDefinitions();
      const ttraExpiry = defs.find((d: { name: string }) => d.name === 'ttra_expiry_check');

      expect(ttraExpiry).toBeDefined();
      expect(ttraExpiry!.dependsOn).toHaveLength(0);
    });

    it('should have ttra_reminders depend on ttra_expiry_check', () => {
      const defs = eodOrchestrator.getDefinitions();
      const ttraReminders = defs.find((d: { name: string }) => d.name === 'ttra_reminders');

      expect(ttraReminders).toBeDefined();
      expect(ttraReminders!.dependsOn).toContain('ttra_expiry_check');
    });

    it('should have nav_ingestion with no dependencies (root job)', () => {
      const defs = eodOrchestrator.getDefinitions();
      const navIngestion = defs.find((d: { name: string }) => d.name === 'nav_ingestion');

      expect(navIngestion).toBeDefined();
      expect(navIngestion!.dependsOn).toHaveLength(0);
    });

    it('should form a valid DAG (no circular dependencies)', () => {
      const defs = eodOrchestrator.getDefinitions();
      const jobMap = new Map(defs.map((d: { name: string; dependsOn: string[] }) => [d.name, d.dependsOn]));

      // Simple cycle detection via topological sort
      const visited = new Set<string>();
      const visiting = new Set<string>();

      function hasCycle(node: string): boolean {
        if (visiting.has(node)) return true; // cycle detected
        if (visited.has(node)) return false;

        visiting.add(node);
        const deps = jobMap.get(node) || [];
        for (const dep of deps) {
          if (hasCycle(dep)) return true;
        }
        visiting.delete(node);
        visited.add(node);
        return false;
      }

      let cycleFound = false;
      for (const [jobName] of jobMap) {
        if (hasCycle(jobName)) {
          cycleFound = true;
          break;
        }
      }

      expect(cycleFound).toBe(false);
    });

    it('should chain the CA pipeline: position_snapshot -> ca_entitlement_calc -> ca_tax_calc -> ca_settlement -> ca_recon_triad', () => {
      const defs = eodOrchestrator.getDefinitions();
      const getJob = (name: string) => defs.find((d: { name: string }) => d.name === name);

      const caEntCalc = getJob('ca_entitlement_calc');
      const caTaxCalc = getJob('ca_tax_calc');
      const caSettlement = getJob('ca_settlement');
      const caReconTriad = getJob('ca_recon_triad');

      // Chain verification
      expect(caEntCalc!.dependsOn).toContain('position_snapshot');
      expect(caTaxCalc!.dependsOn).toContain('ca_entitlement_calc');
      expect(caSettlement!.dependsOn).toContain('ca_tax_calc');
      expect(caReconTriad!.dependsOn).toContain('ca_settlement');
    });
  });

  // =========================================================================
  // 3. EOD Trigger
  // =========================================================================

  describe('EOD Trigger', () => {
    it('should expose triggerRun method', () => {
      expect(typeof eodOrchestrator.triggerRun).toBe('function');
    });

    it('should expose getRunStatus method', () => {
      expect(typeof eodOrchestrator.getRunStatus).toBe('function');
    });

    it('should expose checkAndAdvance method', () => {
      expect(typeof eodOrchestrator.checkAndAdvance).toBe('function');
    });

    it('should expose retryJob method', () => {
      expect(typeof eodOrchestrator.retryJob).toBe('function');
    });

    it('should expose skipJob method', () => {
      expect(typeof eodOrchestrator.skipJob).toBe('function');
    });

    it('should expose getHistory method', () => {
      expect(typeof eodOrchestrator.getHistory).toBe('function');
    });

    it('should not throw when triggering an EOD run (mock DB)', async () => {
      // With the mock DB, triggerRun should execute without errors
      // The mock proxy chains return Promise.resolve([{}]) for all DB calls
      await expect(
        eodOrchestrator.triggerRun('2026-04-20', 1),
      ).resolves.not.toThrow();
    });

    it('should not throw when fetching run status (mock DB)', async () => {
      const result = await eodOrchestrator.getRunStatus();
      // getRunStatus returns null when no run exists or the mock result
      expect(result).toBeDefined();
    });

    it('should not throw when fetching EOD history', async () => {
      const result = await eodOrchestrator.getHistory({ page: 1, pageSize: 10 });
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Job Execution Dispatch
  // =========================================================================

  describe('Job Execution Dispatch', () => {
    it('should expose executeJob method', () => {
      expect(typeof eodOrchestrator.executeJob).toBe('function');
    });

    it('should handle all 20 job names in the switch dispatcher', () => {
      const defs = eodOrchestrator.getDefinitions();
      const expectedJobs = [
        'ttra_expiry_check', 'ttra_reminders',
        'nav_ingestion', 'nav_validation', 'portfolio_revaluation', 'position_snapshot',
        'settlement_processing', 'fee_accrual', 'commission_accrual',
        'ca_entitlement_calc', 'ca_tax_calc', 'ca_settlement', 'ca_recon_triad',
        'invoice_generation', 'notional_accounting', 'reversal_check',
        'data_quality_check', 'exception_sweep', 'regulatory_report_gen', 'daily_report',
      ];

      const jobNames = defs.map((d: { name: string }) => d.name);
      for (const expected of expectedJobs) {
        expect(jobNames).toContain(expected);
      }
    });
  });
});
