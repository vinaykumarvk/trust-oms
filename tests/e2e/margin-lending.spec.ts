/**
 * Margin Lending tests
 *
 * Covers the WQ Margin Lending BRD implementation: financial calculations,
 * maker-checker guardrails, durable service paths, API surface, schema,
 * migration artifacts, and UI wiring.
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

import marginLendingRouter from '../../server/routes/margin-lending';
import { marginLendingService, validateMakerCheckerDecision } from '../../server/services/margin-lending-service';

const root = process.cwd();

describe('Margin Lending domain', () => {
  it('exposes the required BRD service surface', () => {
    expect(typeof marginLendingService.createAttributeSetting).toBe('function');
    expect(typeof marginLendingService.createReference).toBe('function');
    expect(typeof marginLendingService.createScripSetting).toBe('function');
    expect(typeof marginLendingService.createExposureLimit).toBe('function');
    expect(typeof marginLendingService.createCrossCurrencyHaircut).toBe('function');
    expect(typeof marginLendingService.createFacilityGroup).toBe('function');
    expect(typeof marginLendingService.createFacility).toBe('function');
    expect(typeof marginLendingService.createPortfolioLink).toBe('function');
    expect(typeof marginLendingService.createAssetSetting).toBe('function');
    expect(typeof marginLendingService.copyRecord).toBe('function');
    expect(typeof marginLendingService.getCreditView).toBe('function');
    expect(typeof marginLendingService.createMarginCallCaseFromSnapshot).toBe('function');
    expect(typeof marginLendingService.processMarginCallSnapshots).toBe('function');
    expect(typeof marginLendingService.updateMarginCallCase).toBe('function');
    expect(typeof marginLendingService.listMarginCallActions).toBe('function');
    expect(typeof marginLendingService.decideMarginCallCase).toBe('function');
    expect(typeof marginLendingService.runEod).toBe('function');
    expect(typeof marginLendingService.runSimulation).toBe('function');
    expect(typeof marginLendingService.getReport).toBe('function');
    expect(typeof marginLendingService.renderReportCsv).toBe('function');
    expect(typeof marginLendingService.listAuditEvents).toBe('function');
  });

  it('calculates cross-currency haircut as buffer plus volatility', () => {
    expect(marginLendingService.calculateCrossCurrencyHaircut({
      sourceCurrency: 'USD',
      targetCurrency: 'IDR',
      bufferPercent: 3,
      volatilityPercent: 5,
    })).toBe(8);

    expect(() => marginLendingService.calculateCrossCurrencyHaircut({
      sourceCurrency: 'IDR',
      targetCurrency: 'IDR',
      bufferPercent: 3,
      volatilityPercent: 5,
    })).toThrow('Source currency and target currency cannot be the same');
  });

  it('calculates GCMV, NCMV, drawing power, and margin status', () => {
    const normal = marginLendingService.calculateMarginMetrics({
      marketValue: 1_000_000,
      exposureAmount: 750_000,
      ltvPercent: 70,
      topUpPercent: 80,
      sellOutPercent: 90,
    });
    expect(normal.gcmvAmount).toBe(700_000);
    expect(normal.ncmvAmount).toBe(-50_000);
    expect(normal.marginStatus).toBe('NORMAL');

    const marginCall = marginLendingService.calculateMarginMetrics({
      marketValue: 1_000_000,
      exposureAmount: 850_000,
      ltvPercent: 70,
      topUpPercent: 80,
      sellOutPercent: 90,
    });
    expect(marginCall.marginStatus).toBe('MARGIN_CALL');
    expect(marginCall.shortfallAmount).toBe(50_000);

    const sellOut = marginLendingService.calculateMarginMetrics({
      marketValue: 1_000_000,
      exposureAmount: 950_000,
      ltvPercent: 70,
      topUpPercent: 80,
      sellOutPercent: 90,
      crossCurrencyHaircutPercent: 8,
    });
    expect(sellOut.effectiveLtvPercent).toBe(62);
    expect(sellOut.gcmvAmount).toBe(620_000);
    expect(sellOut.marginStatus).toBe('SELL_OUT');
  });

  it('enforces maker-checker separation', () => {
    expect(() => validateMakerCheckerDecision({
      makerUserId: 'u-maker',
      checkerUserId: 'u-maker',
    })).toThrow('MAKER_CHECKER_VIOLATION');
  });

  it('resolves authorized hierarchy and currency haircut before margin calculation', () => {
    const resolution = marginLendingService.resolveAuthorizedRuleHierarchy({
      businessDate: '2026-05-04',
      baseNumber: 'BASE-001',
      securityCode: 'IDGB-10Y',
      assetCurrency: 'USD',
      facilityCurrency: 'IDR',
      ltvPercent: 70,
      topUpPercent: 80,
      sellOutPercent: 90,
      assetSettings: [{
        asset_setting_id: 'AST-1',
        base_number: 'BASE-001',
        security_code: 'IDGB-10Y',
        inheritance_flag: false,
        ltv_percent: '64',
        top_up_percent: '76',
        sell_out_percent: '86',
        record_status: 'AUTHORIZED',
        effective_from: '2026-01-01',
      }],
      crossCurrencyHaircuts: [{
        haircut_id: 'FXHC-1',
        source_currency: 'USD',
        target_currency: 'IDR',
        haircut_percent: '8',
        record_status: 'AUTHORIZED',
        effective_from: '2026-01-01',
      }],
    });

    expect(resolution).toMatchObject({
      ltvPercent: 64,
      topUpPercent: 76,
      sellOutPercent: 86,
      crossCurrencyHaircutPercent: 8,
      ruleSource: 'AUTHORIZED_ASSET_SETTING',
    });
    expect(resolution.authorizedRuleIds).toEqual(['AST-1', 'FXHC-1']);
  });

  it('blocks missing cross-currency haircut for mismatched currencies', async () => {
    await expect(marginLendingService.getCreditView({
      baseNumber: 'BASE-001',
      marketValue: 1_000_000,
      exposureAmount: 800_000,
      ltvPercent: 70,
      topUpPercent: 80,
      sellOutPercent: 90,
      facilityCurrency: 'IDR',
      assetCurrency: 'USD',
    }, 'tester')).rejects.toThrow('ML_CROSS_CURRENCY_HAIRCUT_MISSING');
  });

  it('can execute durable Margin Lending command paths with mocked database', async () => {
    await expect(marginLendingService.createCrossCurrencyHaircut({
      sourceCurrency: 'USD',
      targetCurrency: 'IDR',
      bufferPercent: 3,
      volatilityPercent: 5,
      effectiveFrom: '2026-05-04',
    }, 'tester')).resolves.toBeDefined();

    await expect(marginLendingService.createFacilityGroup({
      baseNumber: 'BASE-001',
      baseName: 'Private Banking Base',
      startDate: '2026-05-04',
      maturityDate: '2027-05-04',
      limitAmount: 3_000_000_000,
      utilizedAmount: 1_200_000_000,
      currency: 'IDR',
    }, 'tester')).resolves.toBeDefined();

    await expect(marginLendingService.runEod({
      jobId: 'ML-EOD-DAILY',
      jobType: 'MARGIN_CALL_PROCESS',
      businessDate: '2026-05-04',
      noticePeriodDays: 5,
      portfolioSnapshots: [{
        baseNumber: 'BASE-001',
        portfolioId: 'PF-001',
        marketValue: 2_500_000_000,
        exposureAmount: 2_300_000_000,
        ltvPercent: 70,
        topUpPercent: 80,
        sellOutPercent: 90,
      }],
    }, 'tester')).resolves.toMatchObject({
      job_id: 'ML-EOD-DAILY',
      run_status: 'COMPLETED',
    });
  });

  it('keeps simulations non-mutating and returns before/after widgets', async () => {
    const result = await marginLendingService.runSimulation({
      simulationType: 'CUSTOMER',
      baseNumber: 'BASE-001',
      beforeMetrics: { marketValue: 2_500_000_000, exposureAmount: 2_100_000_000, ltvPercent: 70, topUpPercent: 80, sellOutPercent: 90 },
      afterMetrics: { marketValue: 3_000_000_000, exposureAmount: 1_900_000_000, ltvPercent: 70, topUpPercent: 80, sellOutPercent: 90 },
    }, 'tester');

    expect(result.comparisonPayload.beforeStatus).toBe('MARGIN_CALL');
    expect(result.comparisonPayload.afterStatus).toBe('NORMAL');
    expect(result.comparisonPayload.widgets.creditView.grid).toHaveLength(2);
  });

  it('applies add/delete/modify simulation actions when after metrics are not supplied', async () => {
    const result = await marginLendingService.runSimulation({
      simulationType: 'CUSTOMER',
      baseNumber: 'BASE-001',
      beforeMetrics: { marketValue: 2_500_000_000, exposureAmount: 2_100_000_000, ltvPercent: 70, topUpPercent: 80, sellOutPercent: 90 },
      assetActions: [{ securityCode: 'IDGB-10Y', action: 'ADD', marketValue: 500_000_000 }],
      exposureActions: [{ facilityId: 'FAC-1', action: 'DELETE', exposureAmount: 100_000_000 }],
    }, 'tester');

    expect(result.comparisonPayload.actionSemanticsApplied).toBe(true);
    expect(result.comparisonPayload.afterStatus).toBe('NORMAL');
    expect(result.comparisonPayload.widgets.assets).toHaveLength(1);
    expect(result.comparisonPayload.widgets.exposures).toHaveLength(1);
  });

  it('renders report CSV output with headers', async () => {
    const csv = await marginLendingService.renderReportCsv('MARGIN_CALL_PORTFOLIO', {}, 'tester');
    expect(csv.contentType).toContain('text/csv');
    expect(csv.fileName).toContain('margin_call_portfolio');
    expect(csv.content).toContain('case_id,case_level,market_value');
  });

  it('registers the Margin Lending API routes required by the BRD', () => {
    const paths = (marginLendingRouter as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);

    expect(paths).toContain('/summary');
    expect(paths).toContain('/attribute-settings');
    expect(paths).toContain('/attribute-settings/:settingId/authorize');
    expect(paths).toContain('/attribute-settings/:settingId/copy');
    expect(paths).toContain('/references');
    expect(paths).toContain('/scrip-settings');
    expect(paths).toContain('/exposure-limits');
    expect(paths).toContain('/cross-currency-haircuts');
    expect(paths).toContain('/facility-groups');
    expect(paths).toContain('/facilities');
    expect(paths).toContain('/facilities/imports');
    expect(paths).toContain('/portfolio-links');
    expect(paths).toContain('/asset-settings');
    expect(paths).toContain('/credit-view');
    expect(paths).toContain('/margin-call-cases');
    expect(paths).toContain('/margin-call-cases/process');
    expect(paths).toContain('/margin-call-cases/:caseId/actions');
    expect(paths).toContain('/margin-call-cases/:caseId/authorize');
    expect(paths).toContain('/eod-runs');
    expect(paths).toContain('/simulations');
    expect(paths).toContain('/reports/:reportCode');
    expect(paths).toContain('/reports/:reportCode/export.csv');
    expect(paths).toContain('/audit-events');
  });

  it('persists schema, migration, UI, and BRD coverage artifacts', () => {
    const schemaSource = readFileSync(path.join(root, 'packages/shared/src/schema.ts'), 'utf8');
    const migrationSource = readFileSync(path.join(root, 'drizzle/20260504_add_margin_lending.sql'), 'utf8');
    const rollbackSource = readFileSync(path.join(root, 'drizzle/20260504_add_margin_lending.rollback.sql'), 'utf8');
    const serviceSource = readFileSync(path.join(root, 'server/services/margin-lending-service.ts'), 'utf8');
    const routerSource = readFileSync(path.join(root, 'server/routes/margin-lending.ts'), 'utf8');
    const uiSource = readFileSync(path.join(root, 'apps/back-office/src/pages/margin-lending-workbench.tsx'), 'utf8');
    const navSource = readFileSync(path.join(root, 'apps/back-office/src/config/navigation.ts'), 'utf8');
    const brdSource = readFileSync(path.join(root, 'docs/Margin-Lending-BRD-v1.md'), 'utf8');
    const gapSource = readFileSync(path.join(root, 'docs/gap-analysis-margin-lending-2026-05-04.md'), 'utf8');

    expect(schemaSource).toContain('mlAttributeSettings');
    expect(schemaSource).toContain('mlReferences');
    expect(schemaSource).toContain('mlScripSettings');
    expect(schemaSource).toContain('mlExposureLimits');
    expect(schemaSource).toContain('mlCrossCurrencyHaircuts');
    expect(schemaSource).toContain('mlFacilityGroups');
    expect(schemaSource).toContain('mlFacilities');
    expect(schemaSource).toContain('mlPortfolioLinks');
    expect(schemaSource).toContain('mlAssetSettings');
    expect(schemaSource).toContain('mlMarginCallCases');
    expect(schemaSource).toContain('mlEodRuns');
    expect(schemaSource).toContain('mlSimulationRuns');
    expect(schemaSource).toContain('mlAuditEvents');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS ml_attribute_settings');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS ml_margin_call_cases');
    expect(migrationSource).toContain('ux_ml_eod_idempotency');
    expect(rollbackSource).toContain('DROP TABLE IF EXISTS ml_attribute_settings');
    expect(serviceSource).toContain('ML_CROSS_CURRENCY_HAIRCUT_MISSING');
    expect(serviceSource).toContain('ML_ADVICE_GENERATION_FAILED');
    expect(routerSource).toContain('requireMarginLendingRole');
    expect(routerSource).toContain('requireMlWriteRole');
    expect(routerSource).toContain('requireMlOperatorRole');
    expect(routerSource).toContain('INTERNAL_AUDITOR');
    expect(uiSource).toContain('Margin Calls');
    expect(uiSource).toContain('Manual Closure');
    expect(uiSource).toContain('Facility Group ID');
    expect(uiSource).toContain('Simulation');
    expect(navSource).toContain('/operations/margin-lending');
    expect(brdSource).toContain('FR-016 Margin Simulation');
    expect(gapSource).toContain('Priority Plan');
  });
});
