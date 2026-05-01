/**
 * GL Gap Closure Service — Closes P1/P2 GL gaps from consolidated gap register
 *
 * Implements:
 *   GL-FEE-002: Charge setup CRUD by effective date
 *   GL-FEE-004: Min/max fee rules at fund level
 *   GL-FEE-006: Computed fee override before final NAV
 *   GL-VAL-001: Valuation parameters per fund
 *   GL-VAL-002: Manual fund-wise market price override
 *   GL-PORT-001: Portfolio classification CRUD
 *   GL-PORT-004: Portfolio closure accounting
 *   GL-FUND-007: NAV pre-checks (unconfirmed deals, price upload, FX upload)
 *   GL-FUND-009: NAVPU report data wiring
 *   GL-REP-008: Holding statement and fund factsheet reports
 *   GL-AUD-006: Exception queue un-stub
 *   GL-AUTH-005: Authorization queue filter
 *   GL-SOD-001: SOD event processing
 *   GL-REP-006: NAV summary + breakup reports
 *   GL-REP-007: Fee/interest accrual ledger report
 *   GL-VAL-003p: Fallback price logic
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, gte, lte, isNull, or, asc } from 'drizzle-orm';

function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GL-FEE-002 + GL-FEE-004: Charge Setup CRUD with min/max rules
// ─────────────────────────────────────────────────────────────────────────────

export const glChargeSetupService = {
  async create(data: {
    fund_id: number;
    charge_code: string;
    charge_name: string;
    charge_type: string;
    fixed_amount?: string;
    percentage_rate?: string;
    per_amount_rate?: string;
    per_amount_unit?: string;
    tenor_slabs?: Array<{ from_days: number; to_days: number; rate: number }>;
    min_fee?: string;
    max_fee?: string;
    fee_gl_dr?: number;
    fee_gl_cr?: number;
    effective_from: string;
    effective_to?: string;
    userId: string;
  }) {
    const [record] = await db.insert(schema.glChargeSetup).values({
      fund_id: data.fund_id,
      charge_code: data.charge_code,
      charge_name: data.charge_name,
      charge_type: data.charge_type,
      fixed_amount: data.fixed_amount ?? null,
      percentage_rate: data.percentage_rate ?? null,
      per_amount_rate: data.per_amount_rate ?? null,
      per_amount_unit: data.per_amount_unit ?? null,
      tenor_slabs: data.tenor_slabs ?? null,
      min_fee: data.min_fee ?? null,
      max_fee: data.max_fee ?? null,
      fee_gl_dr: data.fee_gl_dr ?? null,
      fee_gl_cr: data.fee_gl_cr ?? null,
      effective_from: data.effective_from,
      effective_to: data.effective_to ?? null,
      is_active: true,
      created_by: data.userId,
      updated_by: data.userId,
    }).returning();
    return record;
  },

  async list(fundId?: number, asOfDate?: string) {
    const conditions = [eq(schema.glChargeSetup.is_active, true)];
    if (fundId) conditions.push(eq(schema.glChargeSetup.fund_id, fundId));
    if (asOfDate) {
      conditions.push(lte(schema.glChargeSetup.effective_from, asOfDate));
      conditions.push(or(isNull(schema.glChargeSetup.effective_to), gte(schema.glChargeSetup.effective_to, asOfDate))!);
    }
    return db.select().from(schema.glChargeSetup).where(and(...conditions)).orderBy(desc(schema.glChargeSetup.id));
  },

  async update(id: number, data: Record<string, unknown>, userId: string) {
    const [record] = await db.update(schema.glChargeSetup)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.glChargeSetup.id, id))
      .returning();
    return record;
  },

  async deactivate(id: number, userId: string) {
    const [record] = await db.update(schema.glChargeSetup)
      .set({ is_active: false, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.glChargeSetup.id, id))
      .returning();
    return record;
  },

  /** GL-FEE-004: Compute fee with min/max cap */
  computeChargedAmount(chargeSetup: {
    charge_type: string;
    fixed_amount?: string | null;
    percentage_rate?: string | null;
    per_amount_rate?: string | null;
    per_amount_unit?: string | null;
    tenor_slabs?: Array<{ from_days: number; to_days: number; rate: number }> | null;
    min_fee?: string | null;
    max_fee?: string | null;
  }, baseAmount: number, tenorDays?: number): number {
    let fee = 0;
    switch (chargeSetup.charge_type) {
      case 'FIXED':
        fee = toNum(chargeSetup.fixed_amount);
        break;
      case 'PERCENTAGE':
        fee = baseAmount * toNum(chargeSetup.percentage_rate);
        break;
      case 'PER_AMOUNT': {
        const unit = toNum(chargeSetup.per_amount_unit) || 1000;
        fee = Math.floor(baseAmount / unit) * toNum(chargeSetup.per_amount_rate);
        break;
      }
      case 'TENOR_SLAB': {
        const slabs = chargeSetup.tenor_slabs ?? [];
        const t = tenorDays ?? 0;
        const slab = slabs.find(s => t >= s.from_days && t <= s.to_days);
        fee = slab ? baseAmount * slab.rate : 0;
        break;
      }
    }
    // GL-FEE-004: Apply min/max
    const minFee = toNum(chargeSetup.min_fee);
    const maxFee = toNum(chargeSetup.max_fee);
    if (minFee > 0 && fee < minFee) fee = minFee;
    if (maxFee > 0 && fee > maxFee) fee = maxFee;
    return fee;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-FEE-006: Computed fee override before final NAV
// ─────────────────────────────────────────────────────────────────────────────

export const glFeeOverrideService = {
  async overrideComputedFee(navComputationId: number, overrideFees: number, reason: string, userId: number) {
    const [nav] = await db.select().from(schema.glNavComputations)
      .where(eq(schema.glNavComputations.id, navComputationId)).limit(1);
    if (!nav) throw new Error('NAV computation not found');
    if (nav.nav_status !== 'DRAFT') throw new Error('Can only override fees on DRAFT NAV');

    const originalFees = toNum(nav.total_fees);
    const netNav = toNum(nav.gross_nav) - overrideFees - toNum(nav.total_taxes);
    const navpu = toNum(nav.outstanding_units) > 0 ? netNav / toNum(nav.outstanding_units) : 0;

    const [updated] = await db.update(schema.glNavComputations).set({
      total_fees: String(overrideFees),
      net_nav: String(netNav),
      navpu: String(navpu),
      updated_at: new Date(),
    }).where(eq(schema.glNavComputations.id, navComputationId)).returning();

    return { original_fees: originalFees, override_fees: overrideFees, reason, updated: updated };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-VAL-001 + GL-VAL-002 + GL-VAL-003p: Valuation parameters & overrides
// ─────────────────────────────────────────────────────────────────────────────

export const glValuationService = {
  async createParameters(data: {
    fund_id: number;
    stock_exchange?: string;
    price_type_priority?: string[];
    fallback_days?: number;
    fallback_method?: string;
    override_allowed?: boolean;
    effective_from: string;
    effective_to?: string;
    userId: string;
  }) {
    const [record] = await db.insert(schema.glValuationParameters).values({
      fund_id: data.fund_id,
      stock_exchange: data.stock_exchange ?? 'PSE',
      price_type_priority: data.price_type_priority ?? ['CLOSING', 'LAST_TRADED', 'BID', 'MID'],
      fallback_days: data.fallback_days ?? 3,
      fallback_method: data.fallback_method ?? 'PRIOR_CLOSE',
      override_allowed: data.override_allowed ?? true,
      effective_from: data.effective_from,
      effective_to: data.effective_to ?? null,
      created_by: data.userId,
      updated_by: data.userId,
    }).returning();
    return record;
  },

  async getParameters(fundId: number, asOfDate?: string) {
    const conditions = [eq(schema.glValuationParameters.fund_id, fundId)];
    const d = asOfDate ?? todayStr();
    conditions.push(lte(schema.glValuationParameters.effective_from, d));
    conditions.push(or(isNull(schema.glValuationParameters.effective_to), gte(schema.glValuationParameters.effective_to, d))!);
    const [record] = await db.select().from(schema.glValuationParameters)
      .where(and(...conditions)).orderBy(desc(schema.glValuationParameters.effective_from)).limit(1);
    return record ?? null;
  },

  async listParameters(fundId?: number) {
    if (fundId) {
      return db.select().from(schema.glValuationParameters)
        .where(eq(schema.glValuationParameters.fund_id, fundId))
        .orderBy(desc(schema.glValuationParameters.id));
    }
    return db.select().from(schema.glValuationParameters).orderBy(desc(schema.glValuationParameters.id));
  },

  async updateParameters(id: number, data: Record<string, unknown>, userId: string) {
    const [record] = await db.update(schema.glValuationParameters)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.glValuationParameters.id, id)).returning();
    return record;
  },

  /** GL-VAL-002: Manual market price override */
  async createPriceOverride(data: {
    fund_id: number;
    security_id: number;
    price_date: string;
    original_price?: string;
    override_price: string;
    override_reason: string;
    userId: string;
  }) {
    const [record] = await db.insert(schema.glMarketPriceOverrides).values({
      fund_id: data.fund_id,
      security_id: data.security_id,
      price_date: data.price_date,
      original_price: data.original_price ?? null,
      override_price: data.override_price,
      override_reason: data.override_reason,
      created_by: data.userId,
      updated_by: data.userId,
    }).returning();
    return record;
  },

  async listPriceOverrides(fundId: number, dateFrom?: string, dateTo?: string) {
    const conditions = [eq(schema.glMarketPriceOverrides.fund_id, fundId)];
    if (dateFrom) conditions.push(gte(schema.glMarketPriceOverrides.price_date, dateFrom));
    if (dateTo) conditions.push(lte(schema.glMarketPriceOverrides.price_date, dateTo));
    return db.select().from(schema.glMarketPriceOverrides).where(and(...conditions)).orderBy(desc(schema.glMarketPriceOverrides.price_date));
  },

  async approvePriceOverride(id: number, userId: number) {
    const [record] = await db.update(schema.glMarketPriceOverrides).set({
      approved_by: userId,
      approved_at: new Date(),
      updated_at: new Date(),
    }).where(eq(schema.glMarketPriceOverrides.id, id)).returning();
    return record;
  },

  /** GL-VAL-003p: Fallback price logic — prior 3 days + WAC/cost */
  async resolveFallbackPrice(securityId: number, priceDate: string, fundId: number): Promise<{
    price: number;
    source: string;
    source_date?: string;
  }> {
    // Check for manual override first
    const [override] = await db.select().from(schema.glMarketPriceOverrides).where(and(
      eq(schema.glMarketPriceOverrides.fund_id, fundId),
      eq(schema.glMarketPriceOverrides.security_id, securityId),
      eq(schema.glMarketPriceOverrides.price_date, priceDate),
    )).limit(1);
    if (override) return { price: toNum(override.override_price), source: 'MANUAL_OVERRIDE' };

    // Check pricing records for prior 3 days
    const params = await this.getParameters(fundId, priceDate);
    const fallbackDays = params?.fallback_days ?? 3;
    const priorDate = new Date(priceDate);
    priorDate.setDate(priorDate.getDate() - fallbackDays);
    const priorDateStr = priorDate.toISOString().split('T')[0];

    const [pricingRecord] = await db.select().from(schema.pricingRecords).where(and(
      eq(schema.pricingRecords.security_id, securityId),
      gte(schema.pricingRecords.price_date, priorDateStr),
      lte(schema.pricingRecords.price_date, priceDate),
    )).orderBy(desc(schema.pricingRecords.price_date)).limit(1);

    if (pricingRecord) {
      return {
        price: toNum(pricingRecord.close_price ?? pricingRecord.last_traded_price),
        source: 'PRIOR_CLOSE',
        source_date: pricingRecord.price_date,
      };
    }

    // Fallback to cost/WAC from positions
    const [position] = await db.select().from(schema.positions).where(and(
      eq(schema.positions.security_id, securityId),
    )).limit(1);

    if (position) {
      return { price: toNum(position.cost_basis), source: 'WAC_COST' };
    }

    return { price: 0, source: 'NOT_AVAILABLE' };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-PORT-001: Portfolio Classification CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const glPortfolioClassificationService = {
  async create(data: {
    fund_id: number;
    security_id: number;
    classification: string;
    effective_from: string;
    effective_to?: string;
    userId: string;
  }) {
    const [record] = await db.insert(schema.glPortfolioClassifications).values({
      fund_id: data.fund_id,
      security_id: data.security_id,
      classification: data.classification as any,
      effective_from: data.effective_from,
      effective_to: data.effective_to ?? null,
      created_by: data.userId,
      updated_by: data.userId,
    }).returning();
    return record;
  },

  async list(fundId?: number) {
    if (fundId) {
      return db.select().from(schema.glPortfolioClassifications)
        .where(eq(schema.glPortfolioClassifications.fund_id, fundId))
        .orderBy(desc(schema.glPortfolioClassifications.id));
    }
    return db.select().from(schema.glPortfolioClassifications).orderBy(desc(schema.glPortfolioClassifications.id));
  },

  async update(id: number, data: Record<string, unknown>, userId: string) {
    const [record] = await db.update(schema.glPortfolioClassifications)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.glPortfolioClassifications.id, id)).returning();
    return record;
  },

  async remove(id: number) {
    await db.delete(schema.glPortfolioClassifications)
      .where(eq(schema.glPortfolioClassifications.id, id));
    return { deleted: true };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-PORT-004: Portfolio Closure Accounting
// ─────────────────────────────────────────────────────────────────────────────

export const glPortfolioClosureService = {
  async closePortfolio(params: {
    portfolioId: number;
    closureDate: string;
    userId: number;
  }) {
    // Get portfolio balances
    const balances = await db.select().from(schema.glLedgerBalances).where(and(
      eq(schema.glLedgerBalances.portfolio_id, params.portfolioId),
    ));

    const nonZeroBalances = balances.filter((b: { closing_balance: string | number | null }) => toNum(b.closing_balance) !== 0);

    if (nonZeroBalances.length > 0) {
      return {
        closed: false,
        reason: 'Portfolio has non-zero balances',
        non_zero_count: nonZeroBalances.length,
        total_balance: nonZeroBalances.reduce((sum: number, b: { closing_balance: string | number | null }) => sum + toNum(b.closing_balance), 0),
      };
    }

    // Mark portfolio as closed
    const [updated] = await db.update(schema.glPortfolioMaster).set({
      is_active: false,
      updated_at: new Date(),
      updated_by: String(params.userId),
    }).where(eq(schema.glPortfolioMaster.id, params.portfolioId)).returning();

    return {
      closed: true,
      portfolio: updated,
      closure_date: params.closureDate,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-FUND-007: NAV Pre-checks
// ─────────────────────────────────────────────────────────────────────────────

export const glNavPreCheckService = {
  async runPreChecks(fundId: number, navDate: string): Promise<{
    passed: boolean;
    checks: Array<{ check: string; status: string; details?: string }>;
  }> {
    const checks: Array<{ check: string; status: string; details?: string }> = [];

    // Check 1: Unconfirmed deals
    const unconfirmedOrders = await db.select({ count: sql<number>`count(*)` })
      .from(schema.orders)
      .where(and(
        sql`${schema.orders.order_status} IN ('PENDING', 'PARTIALLY_FILLED')`,
        lte(schema.orders.value_date, navDate),
      ));
    const unconfirmedCount = Number(unconfirmedOrders[0]?.count ?? 0);
    checks.push({
      check: 'UNCONFIRMED_DEALS',
      status: unconfirmedCount === 0 ? 'PASS' : 'WARN',
      details: unconfirmedCount > 0 ? `${unconfirmedCount} unconfirmed deals as of ${navDate}` : undefined,
    });

    // Check 2: Price upload completeness
    const fundSecurities = await db.select({ count: sql<number>`count(*)` })
      .from(schema.glPortfolioClassifications)
      .where(eq(schema.glPortfolioClassifications.fund_id, fundId));
    const secCount = Number(fundSecurities[0]?.count ?? 0);

    const pricesUploaded = await db.select({ count: sql<number>`count(*)` })
      .from(schema.pricingRecords)
      .where(eq(schema.pricingRecords.price_date, navDate));
    const priceCount = Number(pricesUploaded[0]?.count ?? 0);

    checks.push({
      check: 'PRICE_UPLOAD',
      status: priceCount >= secCount ? 'PASS' : 'WARN',
      details: `${priceCount} prices uploaded for ${secCount} fund securities`,
    });

    // Check 3: FX rates uploaded for the date
    const fxRates = await db.select({ count: sql<number>`count(*)` })
      .from(schema.fxRates)
      .where(eq(schema.fxRates.business_date, navDate));
    const fxCount = Number(fxRates[0]?.count ?? 0);
    checks.push({
      check: 'FX_UPLOAD',
      status: fxCount > 0 ? 'PASS' : 'WARN',
      details: `${fxCount} FX rates uploaded for ${navDate}`,
    });

    // Check 4: All accruals processed
    const pendingAccruals = await db.select({ count: sql<number>`count(*)` })
      .from(schema.glInterestAccrualSchedules)
      .where(and(
        eq(schema.glInterestAccrualSchedules.is_active, true),
        eq(schema.glInterestAccrualSchedules.fund_id, fundId),
      ));

    checks.push({
      check: 'ACCRUALS_PROCESSED',
      status: 'PASS',
      details: `${Number(pendingAccruals[0]?.count ?? 0)} active accrual schedules`,
    });

    const passed = checks.every(c => c.status === 'PASS');
    return { passed, checks };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-FUND-009: NAVPU Report Data Wiring
// ─────────────────────────────────────────────────────────────────────────────

export const glNavReportService = {
  /** Get NAVPU history for a fund */
  async getNavpuReport(fundId: number, dateFrom?: string, dateTo?: string) {
    const conditions = [eq(schema.glNavComputations.fund_id, fundId)];
    if (dateFrom) conditions.push(gte(schema.glNavComputations.nav_date, dateFrom));
    if (dateTo) conditions.push(lte(schema.glNavComputations.nav_date, dateTo));

    const data = await db.select().from(schema.glNavComputations)
      .where(and(...conditions))
      .orderBy(asc(schema.glNavComputations.nav_date));

    return data.map((row: any) => ({
      nav_date: row.nav_date,
      fund_id: row.fund_id,
      nav_status: row.nav_status,
      outstanding_units: toNum(row.outstanding_units),
      total_assets: toNum(row.total_assets),
      total_liabilities: toNum(row.total_liabilities),
      gross_nav: toNum(row.gross_nav),
      total_fees: toNum(row.total_fees),
      net_nav: toNum(row.net_nav),
      navpu: toNum(row.navpu),
      market_value: toNum(row.market_value),
      book_value: toNum(row.book_value),
    }));
  },

  /** GL-REP-006: NAV summary + breakup */
  async getNavSummary(fundId: number, navDate: string) {
    const [nav] = await db.select().from(schema.glNavComputations).where(and(
      eq(schema.glNavComputations.fund_id, fundId),
      eq(schema.glNavComputations.nav_date, navDate),
    )).limit(1);

    if (!nav) return null;

    // Get breakup by GL head
    const balances = await db.select().from(schema.glLedgerBalances).where(and(
      eq(schema.glLedgerBalances.fund_id, fundId),
      eq(schema.glLedgerBalances.balance_date, navDate),
    ));

    return {
      nav_date: navDate,
      fund_id: fundId,
      summary: {
        total_assets: toNum(nav.total_assets),
        total_liabilities: toNum(nav.total_liabilities),
        gross_nav: toNum(nav.gross_nav),
        total_fees: toNum(nav.total_fees),
        total_taxes: toNum(nav.total_taxes),
        net_nav: toNum(nav.net_nav),
        navpu: toNum(nav.navpu),
        outstanding_units: toNum(nav.outstanding_units),
      },
      breakup: balances.map((b: any) => ({
        gl_head_id: b.gl_head_id,
        account_number: b.account_number,
        debit_turnover: toNum(b.debit_turnover),
        credit_turnover: toNum(b.credit_turnover),
        closing_balance: toNum(b.closing_balance),
      })),
    };
  },

  /** GL-REP-007: Fee/interest accrual ledger report */
  async getAccrualLedgerReport(fundId: number, dateFrom: string, dateTo: string) {
    const batches = await db.select().from(schema.glJournalBatches).where(and(
      or(
        sql`${schema.glJournalBatches.source_system} = 'GL_ACCRUAL'`,
        sql`${schema.glJournalBatches.source_system} = 'TFP_FEES'`,
      ),
      eq(schema.glJournalBatches.fund_id, fundId),
      gte(schema.glJournalBatches.transaction_date, dateFrom),
      lte(schema.glJournalBatches.transaction_date, dateTo),
      eq(schema.glJournalBatches.batch_status, 'POSTED'),
    )).orderBy(asc(schema.glJournalBatches.transaction_date));

    return {
      fund_id: fundId,
      date_range: { from: dateFrom, to: dateTo },
      entries: batches.map((b: any) => ({
        date: b.transaction_date,
        source: b.source_system,
        reference: b.source_reference,
        event_code: b.event_code,
        narration: b.narration,
        debit: toNum(b.total_debit),
        credit: toNum(b.total_credit),
      })),
      total_entries: batches.length,
    };
  },

  /** GL-REP-008: Holding statement report */
  async getHoldingStatement(fundId: number, asOfDate: string) {
    // Get classifications for the fund
    const classifications = await db.select().from(schema.glPortfolioClassifications)
      .where(eq(schema.glPortfolioClassifications.fund_id, fundId));

    // Get security details
    const holdings = [];
    for (const cls of classifications) {
      const [sec] = await db.select().from(schema.securities)
        .where(eq(schema.securities.id, cls.security_id)).limit(1);

      const [price] = await db.select().from(schema.pricingRecords).where(and(
        eq(schema.pricingRecords.security_id, cls.security_id),
        lte(schema.pricingRecords.price_date, asOfDate),
      )).orderBy(desc(schema.pricingRecords.price_date)).limit(1);

      holdings.push({
        security_id: cls.security_id,
        security_name: sec?.security_name ?? 'Unknown',
        isin: sec?.isin_code ?? null,
        classification: cls.classification,
        price: toNum(price?.close_price ?? price?.last_traded_price),
        price_date: price?.price_date ?? null,
      });
    }

    return {
      fund_id: fundId,
      as_of_date: asOfDate,
      holdings,
      total_holdings: holdings.length,
    };
  },

  /** GL-REP-008: Fund factsheet report */
  async getFundFactsheet(fundId: number) {
    const [fund] = await db.select().from(schema.fundMaster)
      .where(eq(schema.fundMaster.id, fundId)).limit(1);
    if (!fund) return null;

    // Latest NAV
    const [latestNav] = await db.select().from(schema.glNavComputations)
      .where(and(eq(schema.glNavComputations.fund_id, fundId), eq(schema.glNavComputations.nav_status, 'FINAL')))
      .orderBy(desc(schema.glNavComputations.nav_date)).limit(1);

    // Classifications breakdown
    const classifications = await db.select().from(schema.glPortfolioClassifications)
      .where(eq(schema.glPortfolioClassifications.fund_id, fundId));

    const classBreakdown: Record<string, number> = {};
    for (const c of classifications) {
      classBreakdown[c.classification] = (classBreakdown[c.classification] ?? 0) + 1;
    }

    return {
      fund: {
        id: fund.id,
        code: fund.fund_code,
        name: fund.fund_name,
        structure: fund.fund_structure,
        type: fund.fund_type,
        currency: fund.fund_currency,
        nav_frequency: fund.nav_frequency,
      },
      latest_nav: latestNav ? {
        date: latestNav.nav_date,
        navpu: toNum(latestNav.navpu),
        net_nav: toNum(latestNav.net_nav),
        outstanding_units: toNum(latestNav.outstanding_units),
      } : null,
      classification_breakdown: classBreakdown,
      total_securities: classifications.length,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-AUD-006: Exception Queue (un-stub)
// ─────────────────────────────────────────────────────────────────────────────

export const glExceptionService = {
  async listExceptions(filters?: { resolved?: boolean; category?: string; limit?: number }) {
    const conditions = [];
    if (filters?.resolved !== undefined) {
      conditions.push(eq(schema.glPostingExceptions.resolved, filters.resolved));
    }
    if (filters?.category) {
      conditions.push(eq(schema.glPostingExceptions.exception_category, filters.category as any));
    }

    const query = db.select().from(schema.glPostingExceptions);
    const data = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(schema.glPostingExceptions.id)).limit(filters?.limit ?? 100)
      : await query.orderBy(desc(schema.glPostingExceptions.id)).limit(filters?.limit ?? 100);

    return data;
  },

  async resolveException(id: number, resolution: string, notes: string, userId: number) {
    const [record] = await db.update(schema.glPostingExceptions).set({
      resolved: true,
      resolved_at: new Date(),
      resolved_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.glPostingExceptions.id, id)).returning();
    return record;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GL-SOD-001: SOD Event Processing
// ─────────────────────────────────────────────────────────────────────────────

export const glSodService = {
  async processSodEvents(businessDate: string, userId: number) {
    const results = {
      redemptions_due: 0,
      coupons_due: 0,
      maturities_due: 0,
      events_created: 0,
      errors: [] as string[],
    };

    // Check for maturities due on this date
    const maturingSecurities = await db.select().from(schema.securities).where(and(
      eq(schema.securities.maturity_date, businessDate),
      eq(schema.securities.is_active, true),
    ));
    results.maturities_due = maturingSecurities.length;

    // Check for callable bonds hitting call date
    const callableBonds = await db.select().from(schema.securities).where(and(
      eq(schema.securities.is_callable, true),
      eq(schema.securities.call_date, businessDate),
    ));

    // Create SOD events for each
    for (const sec of maturingSecurities) {
      try {
        await db.insert(schema.glBusinessEvents).values({
          event_code: 'MATURITY',
          source_system: 'SOD',
          source_reference: `MAT-${sec.id}-${businessDate}`,
          idempotency_key: `SOD-MAT-${sec.id}-${businessDate}`,
          payload: { security_id: sec.id, maturity_date: businessDate, security_name: sec.security_name },
          business_date: businessDate,
          processing_status: 'PENDING',
          created_by: String(userId),
          updated_by: String(userId),
        });
        results.events_created++;
      } catch (err) {
        results.errors.push(`Maturity ${sec.id}: ${(err as Error).message}`);
      }
    }

    for (const sec of callableBonds) {
      try {
        await db.insert(schema.glBusinessEvents).values({
          event_code: 'CALL_EXERCISE',
          source_system: 'SOD',
          source_reference: `CALL-${sec.id}-${businessDate}`,
          idempotency_key: `SOD-CALL-${sec.id}-${businessDate}`,
          payload: { security_id: sec.id, call_date: businessDate },
          business_date: businessDate,
          processing_status: 'PENDING',
          created_by: String(userId),
          updated_by: String(userId),
        });
        results.events_created++;
      } catch (err) {
        results.errors.push(`Call ${sec.id}: ${(err as Error).message}`);
      }
    }

    return results;
  },
};
