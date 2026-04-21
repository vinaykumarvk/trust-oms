/**
 * TFP Reversal Service (TrustFees Pro -- Phase 7)
 *
 * Handles automatic fee reversal for overdue invoices when the associated
 * accrual schedule has reversal_enabled=true and the invoice has aged beyond
 * reversal_age_days.
 *
 * Methods:
 *   - checkReversals(businessDate)  -- Called by EOD reversal_check job
 *   - getReversalCandidates()       -- List upcoming reversals for review
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

/* ---------- Helpers ---------- */

function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/* ---------- Main Service ---------- */

export const tfpReversalService = {
  /**
   * Check and process reversals for overdue invoices.
   * Called by the EOD reversal_check job.
   *
   * For each OVERDUE invoice whose linked accrual schedule has reversal_enabled=true
   * and invoice age >= reversal_age_days:
   *   1. Create reversal accrual entries (negative amounts)
   *   2. Update invoice status to CANCELLED
   *   3. Mark original accruals as REVERSED
   */
  async checkReversals(businessDate: string) {
    let reversalsProcessed = 0;
    let invoicesCancelled = 0;

    // 1. Find all OVERDUE invoices
    const overdueInvoices = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.invoice_status, 'OVERDUE'));

    if (overdueInvoices.length === 0) {
      return { reversals_processed: 0, invoices_cancelled: 0 };
    }

    // 2. For each overdue invoice, check if reversal applies
    for (const invoice of overdueInvoices) {
      try {
        // Get invoice lines to find linked accruals
        const lines = await db
          .select()
          .from(schema.tfpInvoiceLines)
          .where(eq(schema.tfpInvoiceLines.invoice_id, invoice.id));

        if (lines.length === 0) continue;

        // Get the fee plans associated with the accruals
        const accrualIds = lines.map((l: any) => l.accrual_id) as number[];
        const accruals = await db
          .select()
          .from(schema.tfpAccruals)
          .where(inArray(schema.tfpAccruals.id, accrualIds));

        if (accruals.length === 0) continue;

        // Check each fee plan's accrual schedule for reversal settings
        const feePlanIds = [...new Set(accruals.map((a: any) => a.fee_plan_id))] as number[];
        const feePlans = await db
          .select()
          .from(schema.feePlans)
          .where(inArray(schema.feePlans.id, feePlanIds));

        let reversalEnabled = false;
        let reversalAgeDays = 90; // default

        for (const plan of feePlans) {
          if (plan.accrual_schedule_id) {
            const [schedule] = await db
              .select()
              .from(schema.accrualSchedules)
              .where(eq(schema.accrualSchedules.id, plan.accrual_schedule_id))
              .limit(1);

            if (schedule?.reversal_enabled) {
              reversalEnabled = true;
              if (schedule.reversal_age_days) {
                reversalAgeDays = schedule.reversal_age_days;
              }
              break;
            }
          }
        }

        if (!reversalEnabled) continue;

        // Check if invoice has aged beyond reversal_age_days
        const invoiceAge = daysBetween(invoice.invoice_date, businessDate);
        if (invoiceAge < reversalAgeDays) continue;

        // 3. Process the reversal
        // 3a. Create reversal accrual entries (negative amounts)
        for (const accrual of accruals) {
          if (accrual.accrual_status === 'REVERSED') continue;

          const reversalIdempotencyKey = `REVERSAL:${accrual.idempotency_key}:${businessDate}`;

          // Check idempotency
          const [existing] = await db
            .select({ id: schema.tfpAccruals.id })
            .from(schema.tfpAccruals)
            .where(eq(schema.tfpAccruals.idempotency_key, reversalIdempotencyKey))
            .limit(1);

          if (existing) continue;

          // Create reversal accrual (negative amount)
          await db.insert(schema.tfpAccruals).values({
            fee_plan_id: accrual.fee_plan_id,
            customer_id: accrual.customer_id,
            portfolio_id: accrual.portfolio_id,
            security_id: accrual.security_id,
            transaction_id: accrual.transaction_id,
            base_amount: accrual.base_amount,
            computed_fee: String(-parseFloat(accrual.computed_fee)),
            applied_fee: String(-parseFloat(accrual.applied_fee)),
            currency: accrual.currency,
            fx_rate_locked: accrual.fx_rate_locked,
            accrual_date: businessDate,
            accrual_status: 'REVERSED',
            override_id: null,
            exception_id: null,
            idempotency_key: reversalIdempotencyKey,
          });

          // Mark original accrual as REVERSED
          await db
            .update(schema.tfpAccruals)
            .set({ accrual_status: 'REVERSED', updated_at: new Date() })
            .where(eq(schema.tfpAccruals.id, accrual.id));

          reversalsProcessed++;
        }

        // 3b. Update invoice status to CANCELLED
        await db
          .update(schema.tfpInvoices)
          .set({ invoice_status: 'CANCELLED', updated_at: new Date() })
          .where(eq(schema.tfpInvoices.id, invoice.id));

        invoicesCancelled++;
      } catch (err) {
        console.error(
          `[TFP Reversal] Error processing invoice ${invoice.invoice_number}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return {
      reversals_processed: reversalsProcessed,
      invoices_cancelled: invoicesCancelled,
    };
  },

  /**
   * List upcoming reversals for review.
   * Returns OVERDUE invoices approaching reversal_age_days from their linked schedules.
   */
  async getReversalCandidates() {
    const today = new Date().toISOString().split('T')[0];

    // Get all OVERDUE invoices
    const overdueInvoices = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.invoice_status, 'OVERDUE'))
      .orderBy(desc(schema.tfpInvoices.invoice_date));

    const candidates: Array<{
      invoice_id: number;
      invoice_number: string;
      customer_id: string;
      grand_total: string;
      invoice_date: string;
      due_date: string;
      days_overdue: number;
      reversal_age_days: number;
      days_until_reversal: number;
      reversal_enabled: boolean;
    }> = [];

    for (const invoice of overdueInvoices) {
      // Get linked accruals via invoice lines
      const lines = await db
        .select({ accrual_id: schema.tfpInvoiceLines.accrual_id })
        .from(schema.tfpInvoiceLines)
        .where(eq(schema.tfpInvoiceLines.invoice_id, invoice.id))
        .limit(1);

      if (lines.length === 0) continue;

      // Get fee plan from accrual
      const [accrual] = await db
        .select({ fee_plan_id: schema.tfpAccruals.fee_plan_id })
        .from(schema.tfpAccruals)
        .where(eq(schema.tfpAccruals.id, lines[0].accrual_id))
        .limit(1);

      if (!accrual) continue;

      // Get accrual schedule from fee plan
      const [plan] = await db
        .select({ accrual_schedule_id: schema.feePlans.accrual_schedule_id })
        .from(schema.feePlans)
        .where(eq(schema.feePlans.id, accrual.fee_plan_id))
        .limit(1);

      let reversalEnabled = false;
      let reversalAgeDays = 90;

      if (plan?.accrual_schedule_id) {
        const [schedule] = await db
          .select()
          .from(schema.accrualSchedules)
          .where(eq(schema.accrualSchedules.id, plan.accrual_schedule_id))
          .limit(1);

        if (schedule) {
          reversalEnabled = schedule.reversal_enabled;
          reversalAgeDays = schedule.reversal_age_days ?? 90;
        }
      }

      const invoiceAge = daysBetween(invoice.invoice_date, today);
      const daysOverdue = daysBetween(invoice.due_date, today);
      const daysUntilReversal = Math.max(0, reversalAgeDays - invoiceAge);

      candidates.push({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
        grand_total: invoice.grand_total,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        days_overdue: Math.max(0, daysOverdue),
        reversal_age_days: reversalAgeDays,
        days_until_reversal: daysUntilReversal,
        reversal_enabled: reversalEnabled,
      });
    }

    return candidates;
  },
};
