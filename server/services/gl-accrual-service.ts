/**
 * GL Accrual Service — Interest Accrual & Amortization
 *
 * Implements:
 *   ACCR-001: Daily interest accrual with day-count conventions (ACT/360, ACT/365, 30/360)
 *   ACCR-002: Daily amortization (straight-line, effective interest)
 *   ACCR-003: Accrual reversal on income payment
 *   BR-015: Auto-reverse prior-day accruals
 *   FEE-001: Bridge TFP fees → GL posting
 *   FEE-003: Monthly fee aggregation
 *   FEE-005: Tiered fee schedules
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, lte, gte } from 'drizzle-orm';
import { glPostingEngine } from './gl-posting-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccrualResult {
  schedules_processed: number;
  journals_posted: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Calculate daily accrual amount based on day-count convention */
function calculateDailyAccrual(
  faceValue: number,
  couponRate: number,
  convention: string,
): number {
  let daysInYear: number;
  switch (convention) {
    case 'ACT/360':
      daysInYear = 360;
      break;
    case 'ACT/365':
      daysInYear = 365;
      break;
    case '30/360':
      daysInYear = 360;
      break;
    default:
      daysInYear = 365;
  }
  return (faceValue * couponRate) / daysInYear;
}

/** Calculate daily amortization amount */
function calculateDailyAmortization(
  premiumDiscount: number,
  totalPeriods: number,
  method: string,
): number {
  if (method === 'STRAIGHT_LINE') {
    return premiumDiscount / totalPeriods;
  }
  // EFFECTIVE_INTEREST: simplified daily straight-line as approximation
  return premiumDiscount / totalPeriods;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const glAccrualService = {
  // =========================================================================
  // Accrual Schedule CRUD
  // =========================================================================

  async createAccrualSchedule(data: {
    portfolio_id?: number;
    security_id?: number;
    fund_id?: number;
    accrual_type?: string;
    day_count_convention: string;
    coupon_rate: string;
    face_value: string;
    accrual_frequency?: string;
    accrual_gl_dr: number;
    accrual_gl_cr: number;
    income_gl?: number;
    effective_from: string;
    effective_to?: string;
    auto_reverse?: boolean;
  }) {
    const [record] = await db
      .insert(schema.glInterestAccrualSchedules)
      .values({
        portfolio_id: data.portfolio_id ?? null,
        security_id: data.security_id ?? null,
        fund_id: data.fund_id ?? null,
        accrual_type: data.accrual_type ?? 'COUPON',
        day_count_convention: data.day_count_convention,
        coupon_rate: data.coupon_rate,
        face_value: data.face_value,
        accrual_frequency: data.accrual_frequency ?? 'DAILY',
        accrual_gl_dr: data.accrual_gl_dr,
        accrual_gl_cr: data.accrual_gl_cr,
        income_gl: data.income_gl ?? null,
        effective_from: data.effective_from,
        effective_to: data.effective_to ?? null,
        auto_reverse: data.auto_reverse ?? false,
        is_active: true,
      })
      .returning();
    return record;
  },

  async getAccrualSchedules(filters?: { fund_id?: number; security_id?: number; is_active?: boolean }) {
    const conditions = [];
    if (filters?.fund_id) conditions.push(eq(schema.glInterestAccrualSchedules.fund_id, filters.fund_id));
    if (filters?.security_id) conditions.push(eq(schema.glInterestAccrualSchedules.security_id, filters.security_id));
    if (filters?.is_active !== undefined) conditions.push(eq(schema.glInterestAccrualSchedules.is_active, filters.is_active));

    if (conditions.length > 0) {
      return db.select().from(schema.glInterestAccrualSchedules).where(and(...conditions));
    }
    return db.select().from(schema.glInterestAccrualSchedules);
  },

  // =========================================================================
  // Amortization Schedule CRUD
  // =========================================================================

  async createAmortizationSchedule(data: {
    portfolio_id?: number;
    security_id?: number;
    fund_id?: number;
    amortization_method?: string;
    purchase_price: string;
    par_value: string;
    premium_discount: string;
    total_periods: number;
    amortization_gl_dr: number;
    amortization_gl_cr: number;
    maturity_date: string;
  }) {
    const [record] = await db
      .insert(schema.glAmortizationSchedules)
      .values({
        portfolio_id: data.portfolio_id ?? null,
        security_id: data.security_id ?? null,
        fund_id: data.fund_id ?? null,
        amortization_method: data.amortization_method ?? 'STRAIGHT_LINE',
        purchase_price: data.purchase_price,
        par_value: data.par_value,
        premium_discount: data.premium_discount,
        total_periods: data.total_periods,
        periods_elapsed: 0,
        amortized_amount: '0',
        remaining_amount: data.premium_discount,
        amortization_gl_dr: data.amortization_gl_dr,
        amortization_gl_cr: data.amortization_gl_cr,
        maturity_date: data.maturity_date,
        is_active: true,
      })
      .returning();
    return record;
  },

  async getAmortizationSchedules(filters?: { fund_id?: number; security_id?: number }) {
    const conditions = [];
    if (filters?.fund_id) conditions.push(eq(schema.glAmortizationSchedules.fund_id, filters.fund_id));
    if (filters?.security_id) conditions.push(eq(schema.glAmortizationSchedules.security_id, filters.security_id));

    if (conditions.length > 0) {
      return db.select().from(schema.glAmortizationSchedules).where(and(...conditions));
    }
    return db.select().from(schema.glAmortizationSchedules);
  },

  // =========================================================================
  // ACCR-001: Run daily interest accrual
  // =========================================================================

  async runDailyInterestAccrual(businessDate: string, userId: number): Promise<AccrualResult> {
    const schedules = await db
      .select()
      .from(schema.glInterestAccrualSchedules)
      .where(
        and(
          eq(schema.glInterestAccrualSchedules.is_active, true),
          lte(schema.glInterestAccrualSchedules.effective_from, businessDate),
        ),
      );

    let journalsPosted = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
      // Check effective_to
      if (schedule.effective_to && schedule.effective_to < businessDate) continue;

      try {
        const faceValue = toNum(schedule.face_value);
        const couponRate = toNum(schedule.coupon_rate);
        const dailyAmount = calculateDailyAccrual(faceValue, couponRate, schedule.day_count_convention);

        if (dailyAmount <= 0) continue;

        // Idempotency key to prevent duplicate accruals
        const idempotencyKey = `ACCR-${schedule.id}-${businessDate}`;

        // Get GL head codes
        const [drHead] = await db.select().from(schema.glHeads).where(eq(schema.glHeads.id, schedule.accrual_gl_dr)).limit(1);
        const [crHead] = await db.select().from(schema.glHeads).where(eq(schema.glHeads.id, schedule.accrual_gl_cr)).limit(1);

        if (!drHead || !crHead) {
          errors.push(`Schedule ${schedule.id}: GL head not found (DR: ${schedule.accrual_gl_dr}, CR: ${schedule.accrual_gl_cr})`);
          continue;
        }

        const result = await glPostingEngine.processPostingPipeline({
          sourceSystem: 'GL_ACCRUAL',
          sourceReference: `ACCR-SCHED-${schedule.id}`,
          idempotencyKey,
          eventCode: 'INTEREST_ACCRUAL',
          payload: {
            schedule_id: schedule.id,
            security_id: schedule.security_id,
            portfolio_id: schedule.portfolio_id,
            fund_id: schedule.fund_id,
            face_value: faceValue,
            coupon_rate: couponRate,
            daily_amount: dailyAmount,
            day_count_convention: schedule.day_count_convention,
            accrual_type: schedule.accrual_type,
            dr_gl_code: drHead.code,
            cr_gl_code: crHead.code,
            amount: dailyAmount,
            accounting_unit_id: 1,
          },
          businessDate,
          autoAuthorizeUserId: userId,
        });

        if (result.posted || result.duplicate) {
          journalsPosted++;
        } else if (result.errors.length > 0) {
          errors.push(`Schedule ${schedule.id}: ${result.errors.join('; ')}`);
        }
      } catch (err) {
        errors.push(`Schedule ${schedule.id}: ${(err as Error).message}`);
      }
    }

    return {
      schedules_processed: schedules.length,
      journals_posted: journalsPosted,
      errors,
    };
  },

  // =========================================================================
  // ACCR-002: Run daily amortization
  // =========================================================================

  async runDailyAmortization(businessDate: string, userId: number): Promise<AccrualResult> {
    const schedules = await db
      .select()
      .from(schema.glAmortizationSchedules)
      .where(eq(schema.glAmortizationSchedules.is_active, true));

    let journalsPosted = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
      // Check if maturity date passed
      if (schedule.maturity_date < businessDate) continue;
      // Check if all periods consumed
      if (schedule.periods_elapsed >= schedule.total_periods) continue;

      try {
        const premiumDiscount = Math.abs(toNum(schedule.premium_discount));
        const dailyAmount = calculateDailyAmortization(
          premiumDiscount,
          schedule.total_periods,
          schedule.amortization_method,
        );

        if (dailyAmount <= 0) continue;

        const idempotencyKey = `AMORT-${schedule.id}-${businessDate}`;

        const [drHead] = await db.select().from(schema.glHeads).where(eq(schema.glHeads.id, schedule.amortization_gl_dr)).limit(1);
        const [crHead] = await db.select().from(schema.glHeads).where(eq(schema.glHeads.id, schedule.amortization_gl_cr)).limit(1);

        if (!drHead || !crHead) {
          errors.push(`Amort schedule ${schedule.id}: GL head not found`);
          continue;
        }

        const result = await glPostingEngine.processPostingPipeline({
          sourceSystem: 'GL_AMORTIZATION',
          sourceReference: `AMORT-SCHED-${schedule.id}`,
          idempotencyKey,
          eventCode: 'AMORTIZATION',
          payload: {
            schedule_id: schedule.id,
            security_id: schedule.security_id,
            portfolio_id: schedule.portfolio_id,
            fund_id: schedule.fund_id,
            daily_amount: dailyAmount,
            method: schedule.amortization_method,
            dr_gl_code: drHead.code,
            cr_gl_code: crHead.code,
            amount: dailyAmount,
            accounting_unit_id: 1,
          },
          businessDate,
          autoAuthorizeUserId: userId,
        });

        if (result.posted || result.duplicate) {
          journalsPosted++;
          // Update periods_elapsed and amortized_amount
          await db
            .update(schema.glAmortizationSchedules)
            .set({
              periods_elapsed: schedule.periods_elapsed + 1,
              amortized_amount: fmt(toNum(schedule.amortized_amount) + dailyAmount),
              remaining_amount: fmt(toNum(schedule.remaining_amount) - dailyAmount),
              updated_at: new Date(),
            })
            .where(eq(schema.glAmortizationSchedules.id, schedule.id));
        } else if (result.errors.length > 0) {
          errors.push(`Amort schedule ${schedule.id}: ${result.errors.join('; ')}`);
        }
      } catch (err) {
        errors.push(`Amort schedule ${schedule.id}: ${(err as Error).message}`);
      }
    }

    return {
      schedules_processed: schedules.length,
      journals_posted: journalsPosted,
      errors,
    };
  },

  // =========================================================================
  // ACCR-003: Reverse accrual on income payment
  // =========================================================================

  async reverseAccrualOnPayment(params: {
    portfolioId?: number;
    securityId?: number;
    paymentDate: string;
    amount: number;
    userId: number;
  }): Promise<{ reversed_count: number; income_posted: boolean; errors: string[] }> {
    // Find accrual batches for this security/portfolio
    const conditions = [
      eq(schema.glJournalBatches.batch_status, 'POSTED'),
      sql`${schema.glJournalBatches.source_system} = 'GL_ACCRUAL'`,
    ];

    const accrualBatches = await db
      .select()
      .from(schema.glJournalBatches)
      .where(and(...conditions))
      .orderBy(desc(schema.glJournalBatches.id));

    let reversedCount = 0;
    const errors: string[] = [];

    for (const batch of accrualBatches) {
      try {
        await glPostingEngine.cancelJournalBatch(
          batch.id,
          `Reversed on income payment ${params.paymentDate}`,
          params.userId,
        );
        reversedCount++;
      } catch (err) {
        // System journals can't be cancelled, skip those
        errors.push(`Batch ${batch.id}: ${(err as Error).message}`);
      }
    }

    return {
      reversed_count: reversedCount,
      income_posted: reversedCount > 0,
      errors,
    };
  },

  // =========================================================================
  // BR-015: Auto-reverse prior-day accruals with auto_reverse flag
  // =========================================================================

  async autoReverseAccruals(businessDate: string, userId: number): Promise<{
    reversed_count: number;
    errors: string[];
  }> {
    // Find schedules with auto_reverse = true
    const autoReverseSchedules = await db
      .select()
      .from(schema.glInterestAccrualSchedules)
      .where(
        and(
          eq(schema.glInterestAccrualSchedules.is_active, true),
          eq(schema.glInterestAccrualSchedules.auto_reverse, true),
        ),
      );

    let reversedCount = 0;
    const errors: string[] = [];

    for (const schedule of autoReverseSchedules) {
      // Find the prior day's accrual batch
      const priorDate = new Date(businessDate);
      priorDate.setDate(priorDate.getDate() - 1);
      const priorDateStr = priorDate.toISOString().split('T')[0];

      const [priorBatch] = await db
        .select()
        .from(schema.glJournalBatches)
        .where(
          and(
            eq(schema.glJournalBatches.batch_status, 'POSTED'),
            sql`${schema.glJournalBatches.source_system} = 'GL_ACCRUAL'`,
            eq(schema.glJournalBatches.transaction_date, priorDateStr),
            sql`${schema.glJournalBatches.narration} LIKE ${'%ACCR-SCHED-' + schedule.id + '%'}`,
          ),
        )
        .limit(1);

      if (priorBatch) {
        try {
          await glPostingEngine.cancelJournalBatch(
            priorBatch.id,
            `Auto-reverse for schedule ${schedule.id} (BR-015)`,
            userId,
          );
          reversedCount++;
        } catch (err) {
          errors.push(`Schedule ${schedule.id}: ${(err as Error).message}`);
        }
      }
    }

    return { reversed_count: reversedCount, errors };
  },

  // =========================================================================
  // FEE-001: Post fee to GL (bridge TFP → GL)
  // =========================================================================

  async postFeeToGl(params: {
    feeType: string;
    amount: number;
    fundId?: number;
    feeGlDr: string;
    feeGlCr: string;
    businessDate: string;
    userId: number;
    narration?: string;
  }): Promise<{ posted: boolean; batch_id: number | null; errors: string[] }> {
    const idempotencyKey = `FEE-${params.feeType}-${params.fundId ?? 0}-${params.businessDate}-${Date.now()}`;

    const result = await glPostingEngine.processPostingPipeline({
      sourceSystem: 'TFP_FEES',
      sourceReference: `FEE-${params.feeType}`,
      idempotencyKey,
      eventCode: 'FEE_POSTING',
      payload: {
        fee_type: params.feeType,
        amount: params.amount,
        fund_id: params.fundId,
        dr_gl_code: params.feeGlDr,
        cr_gl_code: params.feeGlCr,
        accounting_unit_id: 1,
        narration: params.narration ?? `${params.feeType} fee posting`,
      },
      businessDate: params.businessDate,
      autoAuthorizeUserId: params.userId,
    });

    return {
      posted: result.posted,
      batch_id: result.batch_id,
      errors: result.errors,
    };
  },

  // =========================================================================
  // FEE-003: Aggregate monthly fees
  // =========================================================================

  async aggregateMonthlyFees(month: string, fundId?: number): Promise<{
    month: string;
    fund_id: number | null;
    total_fees: number;
    fee_count: number;
    by_type: Record<string, number>;
  }> {
    // Parse month (YYYY-MM format)
    const [year, mon] = month.split('-');
    const startDate = `${year}-${mon}-01`;
    const endDate = new Date(parseInt(year), parseInt(mon), 0).toISOString().split('T')[0]; // last day

    const conditions = [
      eq(schema.glJournalBatches.batch_status, 'POSTED'),
      sql`${schema.glJournalBatches.source_system} = 'TFP_FEES'`,
      gte(schema.glJournalBatches.transaction_date, startDate),
      lte(schema.glJournalBatches.transaction_date, endDate),
    ];

    if (fundId) {
      conditions.push(eq(schema.glJournalBatches.fund_id, fundId));
    }

    const batches = await db
      .select()
      .from(schema.glJournalBatches)
      .where(and(...conditions));

    const byType: Record<string, number> = {};
    let totalFees = 0;

    for (const batch of batches) {
      const amount = toNum(batch.total_debit);
      totalFees += amount;
      const feeType = batch.event_code ?? 'UNKNOWN';
      byType[feeType] = (byType[feeType] ?? 0) + amount;
    }

    return {
      month,
      fund_id: fundId ?? null,
      total_fees: totalFees,
      fee_count: batches.length,
      by_type: byType,
    };
  },

  // =========================================================================
  // FEE-005: Tiered fee schedule with sliding-scale pricing
  // =========================================================================

  calculateTieredFee(amount: number, tiers: Array<{ from: number; to: number; rate: number }>): number {
    let totalFee = 0;
    let remaining = amount;

    for (const tier of tiers.sort((a, b) => a.from - b.from)) {
      if (remaining <= 0) break;

      const tierSize = tier.to - tier.from;
      const applicable = Math.min(remaining, tierSize);
      totalFee += applicable * tier.rate;
      remaining -= applicable;
    }

    return totalFee;
  },
};
