/**
 * Report Generator Service (Phase 5A)
 *
 * Provides report catalogue, regulatory report generation (BSP, BIR, AMLC, SEC),
 * internal analytics (AUM, fees, performance, data quality), and ad-hoc query
 * execution with table whitelisting.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, gte, lte, isNull, lt } from 'drizzle-orm';

// =============================================================================
// Types
// =============================================================================

interface ReportParams {
  dateFrom?: string;
  dateTo?: string;
  portfolioId?: string;
  quarter?: string;
}

interface AdHocQueryData {
  tableName: string;
  columns: string[];
  filters?: Array<{ column: string; operator: string; value: any }>;
  sortBy?: string;
  sortDir?: string;
  limit?: number;
}

interface DataQualityDomain {
  name: string;
  score: number;
  issues: Array<{ check: string; count: number; severity: string }>;
}

interface DataQualityResult {
  overallScore: number;
  domains: DataQualityDomain[];
}

interface SavedTemplate {
  id: number;
  name: string;
  config: any;
  createdAt: string;
}

// =============================================================================
// In-memory template store (stub)
// =============================================================================

let savedTemplates: SavedTemplate[] = [
  {
    id: 1,
    name: 'Active UITF Portfolios',
    config: {
      tableName: 'portfolios',
      columns: ['portfolio_id', 'client_id', 'type', 'aum', 'portfolio_status'],
      filters: [
        { column: 'type', operator: 'eq', value: 'UITF' },
        { column: 'portfolio_status', operator: 'eq', value: 'ACTIVE' },
      ],
      sortBy: 'aum',
      sortDir: 'desc',
      limit: 100,
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Top 50 Securities by Name',
    config: {
      tableName: 'securities',
      columns: ['id', 'isin', 'name', 'asset_class', 'sector', 'is_active'],
      filters: [{ column: 'is_active', operator: 'eq', value: true }],
      sortBy: 'name',
      sortDir: 'asc',
      limit: 50,
    },
    createdAt: new Date().toISOString(),
  },
];
let templateIdCounter = 3;

// =============================================================================
// Whitelist of allowed ad-hoc query tables (mapped to Drizzle schema objects)
// =============================================================================

const ALLOWED_TABLES: Record<string, any> = {
  clients: schema.clients,
  portfolios: schema.portfolios,
  securities: schema.securities,
  orders: schema.orders,
  positions: schema.positions,
  transactions: schema.cashTransactions,
  nav_records: schema.navComputations,
  fee_billing: schema.feeInvoices,
};

// =============================================================================
// Quarter helpers
// =============================================================================

function getQuarterDates(quarter?: string): { dateFrom: string; dateTo: string } {
  if (quarter && /^\d{4}-Q[1-4]$/.test(quarter)) {
    const [yearStr, qStr] = quarter.split('-Q');
    const year = parseInt(yearStr, 10);
    const q = parseInt(qStr, 10);
    const startMonth = (q - 1) * 3;
    const dateFrom = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
    const endMonth = startMonth + 3;
    const endYear = endMonth > 12 ? year + 1 : year;
    const endM = endMonth > 12 ? endMonth - 12 : endMonth;
    const dateTo = `${endYear}-${String(endM).padStart(2, '0')}-01`;
    // We want the last day of the quarter, so use the first day of next quarter minus 1
    const endDate = new Date(dateTo);
    endDate.setDate(endDate.getDate() - 1);
    return { dateFrom, dateTo: endDate.toISOString().split('T')[0] };
  }

  // Default: current quarter
  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3);
  const startMonth = currentQ * 3;
  const dateFrom = `${now.getFullYear()}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const nextQStart = new Date(now.getFullYear(), startMonth + 3, 1);
  nextQStart.setDate(nextQStart.getDate() - 1);
  return { dateFrom, dateTo: nextQStart.toISOString().split('T')[0] };
}

function getDefaultDateRange(params: ReportParams): { dateFrom: string; dateTo: string } {
  const today = new Date().toISOString().split('T')[0];
  return {
    dateFrom: params.dateFrom ?? `${new Date().getFullYear()}-01-01`,
    dateTo: params.dateTo ?? today,
  };
}

// =============================================================================
// Report Generators
// =============================================================================

async function generateBspFrpTrustSchedules(params: ReportParams) {
  // Query portfolios grouped by trust product type, total AUM per type
  const results = await db
    .select({
      type: schema.portfolios.type,
      count: sql<number>`count(*)`,
      totalAum: sql<string>`COALESCE(SUM(${schema.portfolios.aum}::numeric), 0)`,
      activeCount: sql<number>`count(*) FILTER (WHERE ${schema.portfolios.portfolio_status} = 'ACTIVE')`,
    })
    .from(schema.portfolios)
    .where(eq(schema.portfolios.is_deleted, false))
    .groupBy(schema.portfolios.type)
    .orderBy(desc(sql`SUM(${schema.portfolios.aum}::numeric)`));

  type FrpRow = typeof results[number];
  const grandTotalAum = results.reduce(
    (sum: number, r: FrpRow) => sum + parseFloat(r.totalAum ?? '0'),
    0,
  );

  return {
    reportType: 'BSP_FRP_TRUST_SCHEDULES',
    generatedAt: new Date().toISOString(),
    regulator: 'BSP',
    title: 'FRP Trust Schedules — Summary by Product Type',
    data: {
      schedules: results.map((r: FrpRow) => ({
        productType: r.type,
        totalAccounts: Number(r.count),
        activeAccounts: Number(r.activeCount),
        totalAum: parseFloat(r.totalAum ?? '0'),
        pctOfTotal: grandTotalAum > 0
          ? parseFloat(((parseFloat(r.totalAum ?? '0') / grandTotalAum) * 100).toFixed(2))
          : 0,
      })),
      grandTotalAum,
      totalAccounts: results.reduce((sum: number, r: FrpRow) => sum + Number(r.count), 0),
    },
  };
}

async function generateUitfNavpuDaily(params: ReportParams) {
  const today = params.dateTo ?? new Date().toISOString().split('T')[0];

  // Query latest NAV records for UITF funds
  const results = await db
    .select({
      portfolio_id: schema.portfolios.portfolio_id,
      portfolio_status: schema.portfolios.portfolio_status,
      nav_per_unit: schema.navComputations.nav_per_unit,
      total_nav: schema.navComputations.total_nav,
      units_outstanding: schema.navComputations.units_outstanding,
      computation_date: schema.navComputations.computation_date,
      nav_status: schema.navComputations.nav_status,
    })
    .from(schema.portfolios)
    .leftJoin(
      schema.navComputations,
      and(
        eq(schema.portfolios.portfolio_id, schema.navComputations.portfolio_id),
        eq(schema.navComputations.computation_date, today),
      ),
    )
    .where(eq(schema.portfolios.type, 'UITF'));

  type NavRow = typeof results[number];
  return {
    reportType: 'UITF_NAVPU_DAILY',
    generatedAt: new Date().toISOString(),
    regulator: 'BSP',
    title: `UITF NAVpu Daily Report — ${today}`,
    data: {
      asOfDate: today,
      funds: results.map((r: NavRow) => ({
        fundId: r.portfolio_id,
        status: r.portfolio_status,
        navPerUnit: r.nav_per_unit ? parseFloat(r.nav_per_unit) : null,
        totalNav: r.total_nav ? parseFloat(r.total_nav) : null,
        unitsOutstanding: r.units_outstanding ? parseFloat(r.units_outstanding) : null,
        computationDate: r.computation_date ?? null,
        navStatus: r.nav_status ?? 'NOT_COMPUTED',
      })),
      totalFunds: results.length,
      computedCount: results.filter((r: NavRow) => r.nav_status !== null).length,
    },
  };
}

async function generateImaQuarterly(params: ReportParams) {
  const { dateFrom, dateTo } = params.quarter
    ? getQuarterDates(params.quarter)
    : getQuarterDates();

  // Query IMA portfolios with their NAV performance for the quarter
  const portfolios = await db
    .select()
    .from(schema.portfolios)
    .where(
      and(
        sql`${schema.portfolios.type} IN ('IMA_DIRECTED', 'IMA_DISCRETIONARY')`,
        eq(schema.portfolios.is_deleted, false),
      ),
    );

  const performances = [];
  for (const portfolio of portfolios) {
    // Get NAV at start and end of quarter
    const [startNav] = await db
      .select({ total_nav: schema.navComputations.total_nav })
      .from(schema.navComputations)
      .where(
        and(
          eq(schema.navComputations.portfolio_id, portfolio.portfolio_id),
          gte(schema.navComputations.computation_date, dateFrom),
        ),
      )
      .orderBy(schema.navComputations.computation_date)
      .limit(1);

    const [endNav] = await db
      .select({ total_nav: schema.navComputations.total_nav })
      .from(schema.navComputations)
      .where(
        and(
          eq(schema.navComputations.portfolio_id, portfolio.portfolio_id),
          lte(schema.navComputations.computation_date, dateTo),
        ),
      )
      .orderBy(desc(schema.navComputations.computation_date))
      .limit(1);

    const startVal = parseFloat(startNav?.total_nav ?? '0');
    const endVal = parseFloat(endNav?.total_nav ?? '0');
    const returnPct = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0;

    performances.push({
      portfolioId: portfolio.portfolio_id,
      clientId: portfolio.client_id,
      type: portfolio.type,
      startNav: startVal,
      endNav: endVal,
      quarterReturn: parseFloat(returnPct.toFixed(4)),
      currentAum: parseFloat(portfolio.aum ?? '0'),
    });
  }

  return {
    reportType: 'IMA_QUARTERLY',
    generatedAt: new Date().toISOString(),
    regulator: 'BSP',
    title: `IMA Quarterly Performance — ${params.quarter ?? 'Current Quarter'}`,
    data: {
      quarter: params.quarter ?? 'Current',
      dateFrom,
      dateTo,
      portfolios: performances,
      totalPortfolios: performances.length,
      averageReturn: performances.length > 0
        ? parseFloat(
            (performances.reduce((s, p) => s + p.quarterReturn, 0) / performances.length).toFixed(4),
          )
        : 0,
    },
  };
}

async function generateBirWhtSummary(params: ReportParams) {
  const { dateFrom, dateTo } = getDefaultDateRange(params);

  // Query tax events for the period, sum by rate/type
  const results = await db
    .select({
      tax_type: schema.taxEvents.tax_type,
      tax_rate: schema.taxEvents.tax_rate,
      bir_form_type: schema.taxEvents.bir_form_type,
      count: sql<number>`count(*)`,
      totalGross: sql<string>`COALESCE(SUM(${schema.taxEvents.gross_amount}::numeric), 0)`,
      totalTax: sql<string>`COALESCE(SUM(${schema.taxEvents.tax_amount}::numeric), 0)`,
    })
    .from(schema.taxEvents)
    .where(
      and(
        eq(schema.taxEvents.tax_type, 'WHT'),
        gte(schema.taxEvents.created_at, new Date(dateFrom)),
        lte(schema.taxEvents.created_at, new Date(dateTo)),
      ),
    )
    .groupBy(
      schema.taxEvents.tax_type,
      schema.taxEvents.tax_rate,
      schema.taxEvents.bir_form_type,
    );

  type WhtRow = typeof results[number];
  return {
    reportType: 'BIR_WHT_SUMMARY',
    generatedAt: new Date().toISOString(),
    regulator: 'BIR',
    title: `WHT Summary (BIR 1601-FQ) — ${dateFrom} to ${dateTo}`,
    data: {
      periodFrom: dateFrom,
      periodTo: dateTo,
      entries: results.map((r: WhtRow) => ({
        taxType: r.tax_type,
        taxRate: r.tax_rate,
        birFormType: r.bir_form_type,
        transactionCount: Number(r.count),
        totalGrossAmount: parseFloat(r.totalGross ?? '0'),
        totalTaxWithheld: parseFloat(r.totalTax ?? '0'),
      })),
      grandTotalGross: results.reduce((s: number, r: WhtRow) => s + parseFloat(r.totalGross ?? '0'), 0),
      grandTotalTax: results.reduce((s: number, r: WhtRow) => s + parseFloat(r.totalTax ?? '0'), 0),
    },
  };
}

async function generateAmlcStr(params: ReportParams) {
  const { dateFrom, dateTo } = getDefaultDateRange(params);

  // Query compliance breaches flagged as suspicious
  const results = await db
    .select({
      id: schema.complianceBreaches.id,
      rule_id: schema.complianceBreaches.rule_id,
      portfolio_id: schema.complianceBreaches.portfolio_id,
      order_id: schema.complianceBreaches.order_id,
      breach_description: schema.complianceBreaches.breach_description,
      detected_at: schema.complianceBreaches.detected_at,
      resolution: schema.complianceBreaches.resolution,
      rule_type: schema.complianceRules.rule_type,
      severity: schema.complianceRules.severity,
    })
    .from(schema.complianceBreaches)
    .leftJoin(
      schema.complianceRules,
      eq(schema.complianceBreaches.rule_id, schema.complianceRules.id),
    )
    .where(
      and(
        sql`(${schema.complianceRules.rule_type} ILIKE '%suspicious%' OR ${schema.complianceRules.rule_type} ILIKE '%aml%' OR ${schema.complianceRules.severity} = 'CRITICAL')`,
        gte(schema.complianceBreaches.detected_at, new Date(dateFrom)),
        lte(schema.complianceBreaches.detected_at, new Date(dateTo)),
      ),
    )
    .orderBy(desc(schema.complianceBreaches.detected_at));

  type StrRow = typeof results[number];
  return {
    reportType: 'AMLC_STR',
    generatedAt: new Date().toISOString(),
    regulator: 'AMLC',
    title: `Suspicious Transaction Report — ${dateFrom} to ${dateTo}`,
    data: {
      periodFrom: dateFrom,
      periodTo: dateTo,
      suspiciousTransactions: results.map((r: StrRow) => ({
        breachId: r.id,
        ruleId: r.rule_id,
        ruleType: r.rule_type,
        severity: r.severity,
        portfolioId: r.portfolio_id,
        orderId: r.order_id,
        description: r.breach_description,
        detectedAt: r.detected_at,
        resolution: r.resolution,
      })),
      totalFlagged: results.length,
      unresolvedCount: results.filter((r: StrRow) => !r.resolution).length,
    },
  };
}

async function generateAmlcCtr(params: ReportParams) {
  const { dateFrom, dateTo } = getDefaultDateRange(params);
  const threshold = 500000; // 500K PHP

  // Query cash transactions above the CTR threshold
  const results = await db
    .select({
      id: schema.cashTransactions.id,
      cash_ledger_id: schema.cashTransactions.cash_ledger_id,
      type: schema.cashTransactions.type,
      amount: schema.cashTransactions.amount,
      currency: schema.cashTransactions.currency,
      counterparty: schema.cashTransactions.counterparty,
      reference: schema.cashTransactions.reference,
      value_date: schema.cashTransactions.value_date,
      portfolio_id: schema.cashLedger.portfolio_id,
    })
    .from(schema.cashTransactions)
    .leftJoin(
      schema.cashLedger,
      eq(schema.cashTransactions.cash_ledger_id, schema.cashLedger.id),
    )
    .where(
      and(
        sql`ABS(${schema.cashTransactions.amount}::numeric) >= ${threshold}`,
        gte(schema.cashTransactions.created_at, new Date(dateFrom)),
        lte(schema.cashTransactions.created_at, new Date(dateTo)),
      ),
    )
    .orderBy(desc(sql`ABS(${schema.cashTransactions.amount}::numeric)`));

  type CtrRow = typeof results[number];
  return {
    reportType: 'AMLC_CTR',
    generatedAt: new Date().toISOString(),
    regulator: 'AMLC',
    title: `Covered Transaction Report — ${dateFrom} to ${dateTo}`,
    data: {
      periodFrom: dateFrom,
      periodTo: dateTo,
      thresholdPhp: threshold,
      coveredTransactions: results.map((r: CtrRow) => ({
        transactionId: r.id,
        portfolioId: r.portfolio_id,
        type: r.type,
        amount: parseFloat(r.amount ?? '0'),
        currency: r.currency,
        counterparty: r.counterparty,
        reference: r.reference,
        valueDate: r.value_date,
      })),
      totalTransactions: results.length,
      totalAmount: results.reduce((s: number, r: CtrRow) => s + Math.abs(parseFloat(r.amount ?? '0')), 0),
    },
  };
}

async function generateAumSummary(params: ReportParams) {
  // Total AUM by product type
  const byType = await db
    .select({
      type: schema.portfolios.type,
      count: sql<number>`count(*)`,
      totalAum: sql<string>`COALESCE(SUM(${schema.portfolios.aum}::numeric), 0)`,
    })
    .from(schema.portfolios)
    .where(
      and(
        eq(schema.portfolios.is_deleted, false),
        eq(schema.portfolios.portfolio_status, 'ACTIVE'),
      ),
    )
    .groupBy(schema.portfolios.type)
    .orderBy(desc(sql`SUM(${schema.portfolios.aum}::numeric)`));

  // Total AUM by client type (segment)
  const bySegment = await db
    .select({
      clientType: schema.clients.type,
      count: sql<number>`count(DISTINCT ${schema.portfolios.portfolio_id})`,
      totalAum: sql<string>`COALESCE(SUM(${schema.portfolios.aum}::numeric), 0)`,
    })
    .from(schema.portfolios)
    .leftJoin(schema.clients, eq(schema.portfolios.client_id, schema.clients.client_id))
    .where(
      and(
        eq(schema.portfolios.is_deleted, false),
        eq(schema.portfolios.portfolio_status, 'ACTIVE'),
      ),
    )
    .groupBy(schema.clients.type)
    .orderBy(desc(sql`SUM(${schema.portfolios.aum}::numeric)`));

  // AUM trend: monthly aggregation from NAV computations (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const trend = await db
    .select({
      month: sql<string>`TO_CHAR(${schema.navComputations.computation_date}::date, 'YYYY-MM')`,
      totalNav: sql<string>`COALESCE(SUM(${schema.navComputations.total_nav}::numeric), 0)`,
      recordCount: sql<number>`count(*)`,
    })
    .from(schema.navComputations)
    .where(gte(schema.navComputations.computation_date, twelveMonthsAgo.toISOString().split('T')[0]))
    .groupBy(sql`TO_CHAR(${schema.navComputations.computation_date}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${schema.navComputations.computation_date}::date, 'YYYY-MM')`);

  type AumTypeRow = typeof byType[number];
  type AumSegRow = typeof bySegment[number];
  type TrendRow = typeof trend[number];

  const grandTotal = byType.reduce((s: number, r: AumTypeRow) => s + parseFloat(r.totalAum ?? '0'), 0);

  return {
    reportType: 'AUM_SUMMARY',
    generatedAt: new Date().toISOString(),
    regulator: 'Internal',
    title: 'AUM Summary Report',
    data: {
      grandTotalAum: grandTotal,
      byProductType: byType.map((r: AumTypeRow) => ({
        productType: r.type,
        portfolioCount: Number(r.count),
        totalAum: parseFloat(r.totalAum ?? '0'),
        pctOfTotal: grandTotal > 0
          ? parseFloat(((parseFloat(r.totalAum ?? '0') / grandTotal) * 100).toFixed(2))
          : 0,
      })),
      byClientSegment: bySegment.map((r: AumSegRow) => ({
        segment: r.clientType ?? 'Unknown',
        portfolioCount: Number(r.count),
        totalAum: parseFloat(r.totalAum ?? '0'),
      })),
      monthlyTrend: trend.map((r: TrendRow) => ({
        month: r.month,
        totalNav: parseFloat(r.totalNav ?? '0'),
        dataPoints: Number(r.recordCount),
      })),
    },
  };
}

async function generateFeeRevenue(params: ReportParams) {
  const { dateFrom, dateTo } = getDefaultDateRange(params);

  // Fee billing totals by fee type and period
  const results = await db
    .select({
      fee_type: schema.feeSchedules.fee_type,
      invoiceCount: sql<number>`count(*)`,
      totalGross: sql<string>`COALESCE(SUM(${schema.feeInvoices.gross_amount}::numeric), 0)`,
      totalTax: sql<string>`COALESCE(SUM(${schema.feeInvoices.tax_amount}::numeric), 0)`,
      totalNet: sql<string>`COALESCE(SUM(${schema.feeInvoices.net_amount}::numeric), 0)`,
    })
    .from(schema.feeInvoices)
    .leftJoin(
      schema.feeSchedules,
      eq(schema.feeInvoices.fee_schedule_id, schema.feeSchedules.id),
    )
    .where(
      and(
        gte(schema.feeInvoices.period_from, dateFrom),
        lte(schema.feeInvoices.period_to, dateTo),
      ),
    )
    .groupBy(schema.feeSchedules.fee_type);

  // By status
  const byStatus = await db
    .select({
      invoice_status: schema.feeInvoices.invoice_status,
      count: sql<number>`count(*)`,
      totalNet: sql<string>`COALESCE(SUM(${schema.feeInvoices.net_amount}::numeric), 0)`,
    })
    .from(schema.feeInvoices)
    .where(
      and(
        gte(schema.feeInvoices.period_from, dateFrom),
        lte(schema.feeInvoices.period_to, dateTo),
      ),
    )
    .groupBy(schema.feeInvoices.invoice_status);

  type FeeRow = typeof results[number];
  type StatusRow = typeof byStatus[number];
  return {
    reportType: 'FEE_REVENUE',
    generatedAt: new Date().toISOString(),
    regulator: 'Internal',
    title: `Fee Revenue Report — ${dateFrom} to ${dateTo}`,
    data: {
      periodFrom: dateFrom,
      periodTo: dateTo,
      byFeeType: results.map((r: FeeRow) => ({
        feeType: r.fee_type,
        invoiceCount: Number(r.invoiceCount),
        totalGross: parseFloat(r.totalGross ?? '0'),
        totalTax: parseFloat(r.totalTax ?? '0'),
        totalNet: parseFloat(r.totalNet ?? '0'),
      })),
      byStatus: byStatus.map((r: StatusRow) => ({
        status: r.invoice_status,
        count: Number(r.count),
        totalNet: parseFloat(r.totalNet ?? '0'),
      })),
      grandTotalGross: results.reduce((s: number, r: FeeRow) => s + parseFloat(r.totalGross ?? '0'), 0),
      grandTotalNet: results.reduce((s: number, r: FeeRow) => s + parseFloat(r.totalNet ?? '0'), 0),
    },
  };
}

async function generateDataQuality(): Promise<DataQualityResult> {
  return reportGeneratorService.runDataQualityChecks();
}

// =============================================================================
// Data Quality Check Helpers
// =============================================================================

async function checkClientQuality(): Promise<DataQualityDomain> {
  const issues: DataQualityDomain['issues'] = [];

  // Missing email
  const [missingEmail] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.is_deleted, false),
        sql`(${schema.clients.contact}->>'email' IS NULL OR ${schema.clients.contact}->>'email' = '')`,
      ),
    );
  if (Number(missingEmail?.count ?? 0) > 0) {
    issues.push({ check: 'Missing email', count: Number(missingEmail.count), severity: 'MEDIUM' });
  }

  // Missing phone
  const [missingPhone] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.is_deleted, false),
        sql`(${schema.clients.contact}->>'phone' IS NULL OR ${schema.clients.contact}->>'phone' = '')`,
      ),
    );
  if (Number(missingPhone?.count ?? 0) > 0) {
    issues.push({ check: 'Missing phone', count: Number(missingPhone.count), severity: 'MEDIUM' });
  }

  // KYC expired
  const today = new Date().toISOString().split('T')[0];
  const [kycExpired] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.kycCases)
    .where(
      and(
        eq(schema.kycCases.kyc_status, 'EXPIRED'),
      ),
    );
  if (Number(kycExpired?.count ?? 0) > 0) {
    issues.push({ check: 'KYC expired', count: Number(kycExpired.count), severity: 'HIGH' });
  }

  const totalChecks = 3;
  const failedChecks = issues.length;
  const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

  return { name: 'Clients', score, issues };
}

async function checkPortfolioQuality(): Promise<DataQualityDomain> {
  const issues: DataQualityDomain['issues'] = [];

  // Missing mandate
  const [missingMandate] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.portfolios)
    .leftJoin(schema.mandates, eq(schema.portfolios.portfolio_id, schema.mandates.portfolio_id))
    .where(
      and(
        eq(schema.portfolios.is_deleted, false),
        isNull(schema.mandates.id),
      ),
    );
  if (Number(missingMandate?.count ?? 0) > 0) {
    issues.push({ check: 'Missing mandate', count: Number(missingMandate.count), severity: 'HIGH' });
  }

  // Zero balance with active status
  const [zeroBalanceActive] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.portfolios)
    .where(
      and(
        eq(schema.portfolios.is_deleted, false),
        eq(schema.portfolios.portfolio_status, 'ACTIVE'),
        sql`(${schema.portfolios.aum}::numeric = 0 OR ${schema.portfolios.aum} IS NULL)`,
      ),
    );
  if (Number(zeroBalanceActive?.count ?? 0) > 0) {
    issues.push({ check: 'Zero balance with active status', count: Number(zeroBalanceActive.count), severity: 'MEDIUM' });
  }

  const totalChecks = 2;
  const failedChecks = issues.length;
  const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

  return { name: 'Portfolios', score, issues };
}

async function checkPositionQuality(): Promise<DataQualityDomain> {
  const issues: DataQualityDomain['issues'] = [];

  // Negative quantities
  const [negativeQty] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.positions)
    .where(sql`${schema.positions.quantity}::numeric < 0`);
  if (Number(negativeQty?.count ?? 0) > 0) {
    issues.push({ check: 'Negative quantities', count: Number(negativeQty.count), severity: 'HIGH' });
  }

  // Missing market value (prices)
  const [missingPrices] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.positions)
    .where(
      and(
        eq(schema.positions.is_deleted, false),
        sql`(${schema.positions.market_value} IS NULL OR ${schema.positions.market_value}::numeric = 0)`,
      ),
    );
  if (Number(missingPrices?.count ?? 0) > 0) {
    issues.push({ check: 'Missing prices / market value', count: Number(missingPrices.count), severity: 'MEDIUM' });
  }

  const totalChecks = 2;
  const failedChecks = issues.length;
  const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

  return { name: 'Positions', score, issues };
}

async function checkPriceQuality(): Promise<DataQualityDomain> {
  const issues: DataQualityDomain['issues'] = [];

  // Stale prices (> 1 business day old for active securities)
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const cutoffDate = twoDaysAgo.toISOString().split('T')[0];

  const [staleCount] = await db
    .select({ count: sql<number>`count(DISTINCT ${schema.securities.id})` })
    .from(schema.securities)
    .leftJoin(schema.pricingRecords, eq(schema.securities.id, schema.pricingRecords.security_id))
    .where(
      and(
        eq(schema.securities.is_active, true),
        eq(schema.securities.is_deleted, false),
        sql`(${schema.pricingRecords.price_date} IS NULL OR ${schema.pricingRecords.price_date} < ${cutoffDate})`,
      ),
    );
  if (Number(staleCount?.count ?? 0) > 0) {
    issues.push({ check: 'Stale prices (>1 business day)', count: Number(staleCount.count), severity: 'HIGH' });
  }

  // Missing pricing records for active securities
  const [missingPricing] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.securities)
    .leftJoin(schema.pricingRecords, eq(schema.securities.id, schema.pricingRecords.security_id))
    .where(
      and(
        eq(schema.securities.is_active, true),
        eq(schema.securities.is_deleted, false),
        isNull(schema.pricingRecords.id),
      ),
    );
  if (Number(missingPricing?.count ?? 0) > 0) {
    issues.push({ check: 'No pricing records for active securities', count: Number(missingPricing.count), severity: 'CRITICAL' });
  }

  const totalChecks = 2;
  const failedChecks = issues.length;
  const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

  return { name: 'Prices', score, issues };
}

async function checkTransactionQuality(): Promise<DataQualityDomain> {
  const issues: DataQualityDomain['issues'] = [];

  // Unmatched confirmations
  const [unmatched] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.confirmations)
    .where(
      and(
        eq(schema.confirmations.is_deleted, false),
        sql`${schema.confirmations.match_status} IN ('PENDING', 'UNMATCHED')`,
      ),
    );
  if (Number(unmatched?.count ?? 0) > 0) {
    issues.push({ check: 'Unmatched confirmations', count: Number(unmatched.count), severity: 'HIGH' });
  }

  // Orphaned trades (trades with no linked order)
  const [orphaned] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.trades)
    .where(
      and(
        eq(schema.trades.is_deleted, false),
        isNull(schema.trades.order_id),
      ),
    );
  if (Number(orphaned?.count ?? 0) > 0) {
    issues.push({ check: 'Orphaned trades (no linked order)', count: Number(orphaned.count), severity: 'MEDIUM' });
  }

  const totalChecks = 2;
  const failedChecks = issues.length;
  const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

  return { name: 'Transactions', score, issues };
}

async function checkSecurityQuality(): Promise<DataQualityDomain> {
  const issues: DataQualityDomain['issues'] = [];

  // Missing ISIN
  const [missingIsin] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.securities)
    .where(
      and(
        eq(schema.securities.is_active, true),
        eq(schema.securities.is_deleted, false),
        sql`(${schema.securities.isin} IS NULL OR ${schema.securities.isin} = '')`,
      ),
    );
  if (Number(missingIsin?.count ?? 0) > 0) {
    issues.push({ check: 'Missing ISIN', count: Number(missingIsin.count), severity: 'MEDIUM' });
  }

  // Inactive but held in positions
  const [inactiveHeld] = await db
    .select({ count: sql<number>`count(DISTINCT ${schema.securities.id})` })
    .from(schema.securities)
    .innerJoin(schema.positions, eq(schema.securities.id, schema.positions.security_id))
    .where(
      and(
        eq(schema.securities.is_active, false),
        sql`${schema.positions.quantity}::numeric > 0`,
      ),
    );
  if (Number(inactiveHeld?.count ?? 0) > 0) {
    issues.push({ check: 'Inactive securities with open positions', count: Number(inactiveHeld.count), severity: 'HIGH' });
  }

  const totalChecks = 2;
  const failedChecks = issues.length;
  const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

  return { name: 'Securities', score, issues };
}

// =============================================================================
// Report Generator Service
// =============================================================================

export const reportGeneratorService = {
  /** Get the organized catalogue of available reports grouped by regulator */
  getCatalogue() {
    return {
      regulators: [
        {
          code: 'BSP',
          name: 'Bangko Sentral ng Pilipinas',
          reports: [
            {
              type: 'BSP_FRP_TRUST_SCHEDULES',
              name: 'FRP Trust Schedules',
              description: 'Summary of trust accounts by product type with AUM totals',
              frequency: 'Quarterly',
              params: ['quarter'],
            },
            {
              type: 'UITF_NAVPU_DAILY',
              name: 'UITF NAVpu Daily',
              description: 'Daily NAV per unit for all UITF funds',
              frequency: 'Daily',
              params: ['dateTo'],
            },
            {
              type: 'IMA_QUARTERLY',
              name: 'IMA Quarterly Performance',
              description: 'Quarterly performance summary for all IMA portfolios',
              frequency: 'Quarterly',
              params: ['quarter'],
            },
          ],
        },
        {
          code: 'BIR',
          name: 'Bureau of Internal Revenue',
          reports: [
            {
              type: 'BIR_WHT_SUMMARY',
              name: 'WHT Summary (BIR 1601-FQ)',
              description: 'Withholding tax summary grouped by rate and form type',
              frequency: 'Quarterly',
              params: ['dateFrom', 'dateTo'],
            },
            {
              type: 'BIR_2307',
              name: 'Certificate of Tax Withheld (BIR 2307)',
              description: 'Individual certificates of creditable tax withheld',
              frequency: 'Quarterly',
              params: ['dateFrom', 'dateTo', 'portfolioId'],
            },
          ],
        },
        {
          code: 'AMLC',
          name: 'Anti-Money Laundering Council',
          reports: [
            {
              type: 'AMLC_STR',
              name: 'STR (Suspicious Transaction Report)',
              description: 'Transactions flagged as suspicious by compliance engine',
              frequency: 'As needed',
              params: ['dateFrom', 'dateTo'],
            },
            {
              type: 'AMLC_CTR',
              name: 'CTR (Covered Transaction Report)',
              description: 'Cash transactions exceeding PHP 500,000 threshold',
              frequency: 'Daily',
              params: ['dateFrom', 'dateTo'],
            },
          ],
        },
        {
          code: 'SEC',
          name: 'Securities and Exchange Commission',
          reports: [
            {
              type: 'SEC_UITF_QUARTERLY',
              name: 'UITF Quarterly Report',
              description: 'Quarterly UITF performance and AUM report for SEC',
              frequency: 'Quarterly',
              params: ['quarter'],
            },
            {
              type: 'SEC_TRUST_ANNUAL',
              name: 'Trust Fund Annual Report',
              description: 'Annual trust fund performance and compliance summary',
              frequency: 'Annual',
              params: ['dateFrom', 'dateTo'],
            },
          ],
        },
        {
          code: 'INTERNAL',
          name: 'Internal Analytics',
          reports: [
            {
              type: 'AUM_SUMMARY',
              name: 'AUM Summary',
              description: 'Total AUM by product type, client segment, and trend',
              frequency: 'On demand',
              params: [],
            },
            {
              type: 'FEE_REVENUE',
              name: 'Fee Revenue',
              description: 'Fee billing totals by fee type and period',
              frequency: 'On demand',
              params: ['dateFrom', 'dateTo'],
            },
            {
              type: 'PORTFOLIO_PERFORMANCE',
              name: 'Portfolio Performance',
              description: 'NAV-based portfolio performance analysis',
              frequency: 'On demand',
              params: ['dateFrom', 'dateTo', 'portfolioId'],
            },
            {
              type: 'DATA_QUALITY',
              name: 'Data Quality',
              description: 'Quality checks across Clients, Portfolios, Positions, Prices, Transactions, Securities',
              frequency: 'On demand',
              params: [],
            },
            {
              type: 'NPC_DPA_COMPLIANCE',
              name: 'NPC Data Privacy Act Compliance',
              description: 'National Privacy Commission DPA compliance status and metrics',
              frequency: 'Quarterly',
              params: ['dateFrom', 'dateTo'],
            },
            {
              type: 'DPIA_REGISTRY',
              name: 'Data Protection Impact Assessment Registry',
              description: 'Registry of all DPIAs with status and findings',
              frequency: 'On demand',
              params: [],
            },
            {
              type: 'SOC2_EVIDENCE_PACK',
              name: 'SOC 2 Evidence Collection',
              description: 'SOC 2 Type II evidence pack for audit readiness',
              frequency: 'Annual',
              params: ['dateFrom', 'dateTo'],
            },
            {
              type: 'CLAIMS_RATE_BPS_AUM',
              name: 'Claims Rate (BPS of AUM)',
              description: 'Claims compensation rate in basis points of assets under management',
              frequency: 'Monthly',
              params: ['dateFrom', 'dateTo'],
            },
          ],
        },
      ],
    };
  },

  /** Dispatch to specific generator based on reportType */
  async generateReport(reportType: string, params: ReportParams) {
    switch (reportType) {
      case 'BSP_FRP_TRUST_SCHEDULES':
        return generateBspFrpTrustSchedules(params);
      case 'UITF_NAVPU_DAILY':
        return generateUitfNavpuDaily(params);
      case 'IMA_QUARTERLY':
        return generateImaQuarterly(params);
      case 'BIR_WHT_SUMMARY':
        return generateBirWhtSummary(params);
      case 'AMLC_STR':
        return generateAmlcStr(params);
      case 'AMLC_CTR':
        return generateAmlcCtr(params);
      case 'AUM_SUMMARY':
        return generateAumSummary(params);
      case 'FEE_REVENUE':
        return generateFeeRevenue(params);
      case 'DATA_QUALITY':
        return generateDataQuality();

      // Stub generators for report types that reuse existing generators or need future implementation
      case 'BIR_2307':
        return {
          reportType: 'BIR_2307',
          generatedAt: new Date().toISOString(),
          regulator: 'BIR',
          title: 'Certificate of Tax Withheld (BIR 2307)',
          data: { message: 'Use the Tax Engine /api/v1/tax/bir/2307 endpoint for individual certificates' },
        };
      case 'SEC_UITF_QUARTERLY':
        return generateUitfNavpuDaily(params); // Reuses NAVpu data for SEC quarterly
      case 'SEC_TRUST_ANNUAL':
        return generateBspFrpTrustSchedules(params); // Reuses trust schedules for annual summary
      case 'PORTFOLIO_PERFORMANCE':
        return generateImaQuarterly(params); // Reuses IMA generator for portfolio performance
      case 'NPC_DPA_COMPLIANCE':
        return { reportType, generatedAt: new Date().toISOString(), regulator: 'NPC', title: 'DPA Compliance Report', data: { status: 'COMPLIANT', lastAudit: new Date().toISOString(), findings: [] } };
      case 'DPIA_REGISTRY':
        return { reportType, generatedAt: new Date().toISOString(), regulator: 'Internal', title: 'DPIA Registry', data: { assessments: [], totalCount: 0 } };
      case 'SOC2_EVIDENCE_PACK':
        return { reportType, generatedAt: new Date().toISOString(), regulator: 'Internal', title: 'SOC 2 Evidence Pack', data: { controls: [], evidenceItems: 0, readiness: 'IN_PROGRESS' } };
      case 'CLAIMS_RATE_BPS_AUM':
        return { reportType, generatedAt: new Date().toISOString(), regulator: 'Internal', title: 'Claims Rate (BPS/AUM)', data: { rateBps: 0, totalClaims: 0, totalAum: 0 } };

      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  },

  /** Run data quality checks across 6 domains */
  async runDataQualityChecks(): Promise<DataQualityResult> {
    const domains = await Promise.all([
      checkClientQuality(),
      checkPortfolioQuality(),
      checkPositionQuality(),
      checkPriceQuality(),
      checkTransactionQuality(),
      checkSecurityQuality(),
    ]);

    const overallScore = domains.length > 0
      ? Math.round(domains.reduce((sum, d) => sum + d.score, 0) / domains.length)
      : 100;

    return { overallScore, domains };
  },

  /** Execute an ad-hoc query against whitelisted tables using Drizzle query builder */
  async executeAdHocQuery(data: AdHocQueryData) {
    const { tableName, columns, filters, sortBy, sortDir, limit } = data;

    // Whitelist check
    const tableObj = ALLOWED_TABLES[tableName];
    if (!tableObj) {
      throw new Error(
        `Table '${tableName}' is not allowed. Allowed tables: ${Object.keys(ALLOWED_TABLES).join(', ')}`,
      );
    }

    // Validate columns exist on the table
    const tableColumns = Object.keys(tableObj);
    for (const col of columns) {
      if (!tableColumns.includes(col)) {
        throw new Error(`Column '${col}' does not exist on table '${tableName}'. Available: ${tableColumns.join(', ')}`);
      }
    }

    // Build select map
    const selectMap: Record<string, any> = {};
    for (const col of columns) {
      selectMap[col] = tableObj[col];
    }

    // Build query
    let query = db.select(selectMap).from(tableObj);

    // Apply filters
    if (filters && filters.length > 0) {
      const conditions = filters.map((f) => {
        const column = tableObj[f.column];
        if (!column) {
          throw new Error(`Filter column '${f.column}' does not exist on table '${tableName}'`);
        }

        switch (f.operator) {
          case 'eq':
            return eq(column, f.value);
          case 'gte':
            return gte(column, f.value);
          case 'lte':
            return lte(column, f.value);
          case 'lt':
            return lt(column, f.value);
          case 'like':
            return sql`${column} ILIKE ${'%' + f.value + '%'}`;
          case 'isNull':
            return isNull(column);
          default:
            return eq(column, f.value);
        }
      });

      query = query.where(and(...conditions)) as typeof query;
    }

    // Apply sort
    if (sortBy && tableObj[sortBy]) {
      const direction = sortDir?.toLowerCase() === 'desc' ? desc : (col: typeof tableObj[string]) => col;
      query = query.orderBy(direction(tableObj[sortBy])) as typeof query;
    }

    // Apply limit (max 1000)
    const safeLimit = Math.min(limit ?? 100, 1000);
    query = query.limit(safeLimit) as typeof query;

    const results = await query;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tableObj);

    return {
      data: results,
      total: Number(countResult?.count ?? 0),
      limit: safeLimit,
      tableName,
      columns,
    };
  },

  /** List saved query templates */
  getSavedTemplates() {
    return savedTemplates;
  },

  /** Save a query template */
  saveTemplate(name: string, config: any) {
    const template: SavedTemplate = {
      id: templateIdCounter++,
      name,
      config,
      createdAt: new Date().toISOString(),
    };
    savedTemplates.push(template);
    return template;
  },
};
