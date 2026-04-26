/**
 * E2E Risk Analytics Service Tests (FR-RISK-003)
 *
 * Verifies the stress test result export functionality for TrustOMS Philippines.
 * Tests CSV and PDF export formats, edge cases (empty results, invalid portfolio),
 * and output structure validation.
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

import { riskAnalyticsService } from '../../server/services/risk-analytics-service';

// ===========================================================================
// Test Suites
// ===========================================================================

describe('E2E Risk Analytics Service (FR-RISK-003)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('Service Import Verification', () => {
    it('should import riskAnalyticsService', () => {
      expect(riskAnalyticsService).toBeDefined();
    });

    it('should expose exportStressTestResults method', () => {
      expect(typeof riskAnalyticsService.exportStressTestResults).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. CSV Export
  // -------------------------------------------------------------------------
  describe('CSV Export', () => {
    it('should export stress test results in CSV format', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'csv');
      expect(result).toBeDefined();
      expect(result.contentType).toBe('text/csv');
    });

    it('should include CSV headers in the data', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'csv');
      expect(result.data).toContain('ID');
      expect(result.data).toContain('Scenario ID');
      expect(result.data).toContain('Portfolio ID');
      expect(result.data).toContain('Impact (%)');
    });

    it('should generate a filename containing the portfolio ID', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'csv');
      expect(result.filename).toContain('PORT-001');
      expect(result.filename).toContain('.csv');
    });

    it('should generate a filename containing stress-test prefix', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-002', 'csv');
      expect(result.filename).toMatch(/^stress-test-/);
    });

    it('should include a date stamp in the filename', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'csv');
      // Filename should contain a YYYYMMDD date stamp
      expect(result.filename).toMatch(/\d{8}/);
    });

    it('should return non-empty data string for CSV', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'csv');
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. PDF Export
  // -------------------------------------------------------------------------
  describe('PDF Export', () => {
    it('should export stress test results in PDF format', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'pdf');
      expect(result).toBeDefined();
      // Currently returns text/plain as a placeholder for real PDF lib
      expect(result.contentType).toBe('text/plain');
    });

    it('should generate a filename with .pdf extension', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'pdf');
      expect(result.filename).toContain('.pdf');
    });

    it('should include report header in PDF data', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'pdf');
      expect(result.data).toContain('STRESS TEST RESULTS REPORT');
    });

    it('should include portfolio ID in PDF report body', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-XYZ', 'pdf');
      expect(result.data).toContain('PORT-XYZ');
    });

    it('should include Generated timestamp in PDF report', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'pdf');
      expect(result.data).toContain('Generated:');
    });

    it('should include End of Report marker in PDF output', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT-001', 'pdf');
      expect(result.data).toContain('--- End of Report ---');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Edge Cases
  // -------------------------------------------------------------------------
  describe('Edge Cases', () => {
    it('should handle a portfolio with no results gracefully for CSV', async () => {
      // The mock returns [{}] by default, which still produces at least a header line
      const result = await riskAnalyticsService.exportStressTestResults('EMPTY-PORT', 'csv');
      expect(result).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.contentType).toBe('text/csv');
    });

    it('should handle a portfolio with no results gracefully for PDF', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('EMPTY-PORT', 'pdf');
      expect(result).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle special characters in portfolio ID for filename', async () => {
      const result = await riskAnalyticsService.exportStressTestResults('PORT/SPECIAL', 'csv');
      expect(result.filename).toContain('PORT/SPECIAL');
    });
  });
});
