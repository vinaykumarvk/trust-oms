/**
 * Fee Engine Service (Phase 3C)
 *
 * Manages fee schedule definition, daily accruals, billing period
 * invoice generation, waivers, and UITF TER calculation.
 *
 * Supports Philippine trust fee types: TRUSTEE, MANAGEMENT, CUSTODY,
 * PERFORMANCE, and UITF_TER with PCT_AUM, FLAT, and TIERED methods.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

/** Shape of a tier bracket in tiered_rates JSONB */
interface TierBracket {
  from: number;
  to: number;
  rate: number;
}

export const feeEngineService = {
  /** Define a new fee schedule for a portfolio */
  async defineSchedule(data: {
    portfolioId: string;
    feeType: (typeof schema.feeTypeEnum.enumValues)[number];
    method: string;
    ratePct?: string;
    tieredRates?: TierBracket[];
    effectiveFrom: string;
    effectiveTo?: string;
  }) {
    const [schedule] = await db
      .insert(schema.feeSchedules)
      .values({
        portfolio_id: data.portfolioId,
        fee_type: data.feeType,
        calculation_method: data.method,
        rate_pct: data.ratePct ?? null,
        tiered_rates: data.tieredRates ? (data.tieredRates as unknown as Record<string, unknown>) : null,
        effective_from: data.effectiveFrom,
        effective_to: data.effectiveTo ?? null,
      })
      .returning();

    return schedule;
  },

  /** List fee schedules, optionally filtered by portfolio */
  async getSchedules(portfolioId?: string) {
    const where = portfolioId
      ? eq(schema.feeSchedules.portfolio_id, portfolioId)
      : undefined;

    const data = await db
      .select()
      .from(schema.feeSchedules)
      .where(where)
      .orderBy(desc(schema.feeSchedules.created_at));

    return data;
  },

  /** Run daily accrual across all active fee schedules for a given date */
  async runDailyAccrual(date: string) {
    // Get all active fee schedules where effective_from <= date and (effective_to is null or >= date)
    const activeSchedules = await db
      .select()
      .from(schema.feeSchedules)
      .where(
        and(
          lte(schema.feeSchedules.effective_from, date),
          sql`(${schema.feeSchedules.effective_to} IS NULL OR ${schema.feeSchedules.effective_to} >= ${date})`,
        ),
      );

    const results: Array<{
      scheduleId: number;
      portfolioId: string | null;
      accrualAmount: number;
    }> = [];

    for (const schedule of activeSchedules) {
      let accrualAmount = 0;
      const method = schedule.calculation_method;
      const ratePct = parseFloat(schedule.rate_pct ?? '0');

      if (method === 'PCT_AUM') {
        // Get latest NAV for the portfolio as AUM proxy
        const aum = await getPortfolioAUM(schedule.portfolio_id!);
        accrualAmount = (aum * ratePct) / 100 / 365;
      } else if (method === 'FLAT') {
        // Flat daily accrual = annual rate / 365
        accrualAmount = ratePct / 365;
      } else if (method === 'TIERED') {
        // Tiered: lookup bracket based on AUM
        const aum = await getPortfolioAUM(schedule.portfolio_id!);
        const tiers = (schedule.tiered_rates as unknown as TierBracket[]) ?? [];
        const applicableTier = tiers.find(
          (t) => aum >= t.from && aum < t.to,
        );
        const tierRate = applicableTier ? applicableTier.rate : ratePct;
        accrualAmount = (aum * tierRate) / 100 / 365;
      }

      // Insert accrual record
      await db.insert(schema.feeAccruals).values({
        fee_schedule_id: schedule.id,
        accrual_date: date,
        amount: String(accrualAmount),
      });

      results.push({
        scheduleId: schedule.id,
        portfolioId: schedule.portfolio_id,
        accrualAmount,
      });
    }

    return {
      date,
      schedulesProcessed: results.length,
      accruals: results,
    };
  },

  /** Run billing period: generate invoices for all active schedules in the period */
  async runBillingPeriod(periodFrom: string, periodTo: string) {
    // Get distinct portfolio/schedule combinations with accruals in the period
    const activeSchedules = await db
      .select()
      .from(schema.feeSchedules)
      .where(
        and(
          lte(schema.feeSchedules.effective_from, periodTo),
          sql`(${schema.feeSchedules.effective_to} IS NULL OR ${schema.feeSchedules.effective_to} >= ${periodFrom})`,
        ),
      );

    const invoices: Array<{
      invoiceId: number;
      portfolioId: string | null;
      grossAmount: number;
      taxAmount: number;
      netAmount: number;
    }> = [];

    for (const schedule of activeSchedules) {
      const invoice = await feeEngineService.generateInvoice(
        schedule.portfolio_id!,
        schedule.id,
        periodFrom,
        periodTo,
      );
      invoices.push({
        invoiceId: invoice.id,
        portfolioId: schedule.portfolio_id,
        grossAmount: parseFloat(invoice.gross_amount ?? '0'),
        taxAmount: parseFloat(invoice.tax_amount ?? '0'),
        netAmount: parseFloat(invoice.net_amount ?? '0'),
      });
    }

    return {
      periodFrom,
      periodTo,
      invoicesGenerated: invoices.length,
      invoices,
    };
  },

  /** Generate a single invoice for a portfolio + fee schedule over a period */
  async generateInvoice(
    portfolioId: string,
    feeScheduleId: number,
    periodFrom: string,
    periodTo: string,
  ) {
    // Sum accruals for the schedule within the period
    const accrualResult = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.feeAccruals.amount}::numeric), 0)`,
      })
      .from(schema.feeAccruals)
      .where(
        and(
          eq(schema.feeAccruals.fee_schedule_id, feeScheduleId),
          gte(schema.feeAccruals.accrual_date, periodFrom),
          lte(schema.feeAccruals.accrual_date, periodTo),
        ),
      );

    const grossAmount = parseFloat(accrualResult[0]?.total ?? '0');

    // Apply 12% VAT (Philippine stub rate)
    const vatRate = 0.12;
    const taxAmount = grossAmount * vatRate;
    const netAmount = grossAmount + taxAmount;

    const [invoice] = await db
      .insert(schema.feeInvoices)
      .values({
        portfolio_id: portfolioId,
        fee_schedule_id: feeScheduleId,
        period_from: periodFrom,
        period_to: periodTo,
        gross_amount: String(grossAmount),
        tax_amount: String(taxAmount),
        net_amount: String(netAmount),
        invoice_status: 'DRAFT',
      })
      .returning();

    return invoice;
  },

  /** Process a fee waiver on an invoice */
  async processWaiver(invoiceId: number, reason: string, waivedBy: number) {
    const [invoice] = await db
      .select()
      .from(schema.feeInvoices)
      .where(eq(schema.feeInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    if (invoice.invoice_status === 'WAIVED') {
      throw new Error(`Invoice ${invoiceId} is already waived`);
    }

    const [updated] = await db
      .update(schema.feeInvoices)
      .set({
        invoice_status: 'WAIVED',
        gl_ref: `WAIVER:${reason}:BY:${waivedBy}`,
        updated_at: new Date(),
        updated_by: String(waivedBy),
      })
      .where(eq(schema.feeInvoices.id, invoiceId))
      .returning();

    return updated;
  },

  /** Calculate UITF Total Expense Ratio for a portfolio over a period */
  async calculateUITFTER(
    portfolioId: string,
    periodFrom: string,
    periodTo: string,
  ) {
    // Total fees charged in the period (from invoices)
    const feeResult = await db
      .select({
        totalFees: sql<string>`COALESCE(SUM(${schema.feeInvoices.gross_amount}::numeric), 0)`,
      })
      .from(schema.feeInvoices)
      .where(
        and(
          eq(schema.feeInvoices.portfolio_id, portfolioId),
          gte(schema.feeInvoices.period_from, periodFrom),
          lte(schema.feeInvoices.period_to, periodTo),
        ),
      );

    const totalFees = parseFloat(feeResult[0]?.totalFees ?? '0');

    // Average AUM for the period (average of total_nav from nav_computations)
    const aumResult = await db
      .select({
        avgAum: sql<string>`COALESCE(AVG(${schema.navComputations.total_nav}::numeric), 0)`,
      })
      .from(schema.navComputations)
      .where(
        and(
          eq(schema.navComputations.portfolio_id, portfolioId),
          gte(schema.navComputations.computation_date, periodFrom),
          lte(schema.navComputations.computation_date, periodTo),
        ),
      );

    const avgAum = parseFloat(aumResult[0]?.avgAum ?? '0');

    // TER = (total fees / average AUM) x 100
    const ter = avgAum > 0 ? (totalFees / avgAum) * 100 : 0;

    return {
      portfolioId,
      periodFrom,
      periodTo,
      totalFees,
      averageAUM: avgAum,
      ter: parseFloat(ter.toFixed(4)),
    };
  },

  /** List invoices with optional filters */
  async getInvoices(filters: {
    portfolioId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.portfolioId) {
      conditions.push(
        eq(schema.feeInvoices.portfolio_id, filters.portfolioId),
      );
    }

    if (filters.status) {
      conditions.push(eq(schema.feeInvoices.invoice_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.feeInvoices)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.feeInvoices.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.feeInvoices)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get accrual status for a date (or today) */
  async getAccrualStatus(date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const accruals = await db
      .select({
        fee_schedule_id: schema.feeAccruals.fee_schedule_id,
        accrual_date: schema.feeAccruals.accrual_date,
        amount: schema.feeAccruals.amount,
      })
      .from(schema.feeAccruals)
      .where(eq(schema.feeAccruals.accrual_date, targetDate))
      .orderBy(schema.feeAccruals.fee_schedule_id);

    const totalAccrued = accruals.reduce(
      (sum: number, a: { amount: string | null }) => sum + parseFloat(a.amount ?? '0'),
      0,
    );

    return {
      date: targetDate,
      accrualCount: accruals.length,
      totalAccrued,
      accruals,
    };
  },
};

/** Helper: Get the latest total_nav as AUM proxy for a portfolio */
async function getPortfolioAUM(portfolioId: string): Promise<number> {
  const [latest] = await db
    .select({ total_nav: schema.navComputations.total_nav })
    .from(schema.navComputations)
    .where(eq(schema.navComputations.portfolio_id, portfolioId))
    .orderBy(desc(schema.navComputations.computation_date))
    .limit(1);

  return parseFloat(latest?.total_nav ?? '0');
}
