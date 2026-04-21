/**
 * Fee Override Service (TrustFees Pro -- Phase 8)
 *
 * Manages override requests for fee amounts at any stage:
 *   ORDER_CAPTURE | ACCRUAL | INVOICE | PAYMENT
 *
 * Auto-approval logic:
 *   - If delta_pct is within the fee plan's lower_threshold_pct..upper_threshold_pct,
 *     the override is AUTO_APPROVED and applied immediately.
 *   - Otherwise it goes to PENDING for Checker approval (Segregation of Duties).
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or, gte, lte } from 'drizzle-orm';

export const feeOverrideService = {
  /**
   * Create an override request.
   *
   * Calculates delta_pct and checks the fee plan's threshold range.
   * If within range -> AUTO_APPROVED and applied immediately.
   * Otherwise -> PENDING (requires Checker approval).
   */
  async requestOverride(data: {
    fee_plan_id: number;
    accrual_id?: number;
    invoice_id?: number;
    override_stage: string;
    original_amount: string;
    overridden_amount: string;
    reason_code: string;
    reason_notes: string;
    requested_by: string;
  }) {
    const originalAmt = parseFloat(data.original_amount);
    const overriddenAmt = parseFloat(data.overridden_amount);

    if (isNaN(originalAmt) || isNaN(overriddenAmt)) {
      throw new Error('original_amount and overridden_amount must be valid numbers');
    }

    if (originalAmt === 0) {
      throw new Error('original_amount cannot be zero');
    }

    // Calculate delta percentage
    const deltaPct = Math.abs(overriddenAmt - originalAmt) / originalAmt * 100;

    // Fetch the Fee Plan to get threshold percentages
    const [feePlan] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, data.fee_plan_id))
      .limit(1);

    if (!feePlan) {
      throw new Error(`Fee plan not found: ${data.fee_plan_id}`);
    }

    const lowerThresholdPct = parseFloat(feePlan.lower_threshold_pct ?? '0.05');
    const upperThresholdPct = parseFloat(feePlan.upper_threshold_pct ?? '0.40');

    // Determine if auto-approval applies
    const withinThreshold = deltaPct >= lowerThresholdPct && deltaPct <= upperThresholdPct;
    const overrideStatus = withinThreshold ? 'AUTO_APPROVED' : 'PENDING';

    // Insert the override record
    const [override] = await db
      .insert(schema.feeOverrides)
      .values({
        stage: data.override_stage,
        accrual_id: data.accrual_id ?? null,
        invoice_id: data.invoice_id ?? null,
        original_amount: data.original_amount,
        overridden_amount: data.overridden_amount,
        delta_pct: deltaPct.toFixed(6),
        reason_code: data.reason_code,
        reason_notes: data.reason_notes,
        requested_by: data.requested_by,
        override_status: overrideStatus,
        created_by: data.requested_by,
      })
      .returning();

    // If AUTO_APPROVED, apply immediately
    if (overrideStatus === 'AUTO_APPROVED') {
      await this.applyOverride(override.id, data.overridden_amount, data.accrual_id, data.invoice_id);
    }

    return {
      ...override,
      auto_approved: overrideStatus === 'AUTO_APPROVED',
      fee_plan_code: feePlan.fee_plan_code,
      lower_threshold_pct: lowerThresholdPct,
      upper_threshold_pct: upperThresholdPct,
    };
  },

  /**
   * Apply the overridden amount to the linked accrual or invoice.
   */
  async applyOverride(
    overrideId: number,
    overriddenAmount: string,
    accrualId?: number | null,
    invoiceId?: number | null,
  ) {
    // Update accrual applied_fee if accrual_id is linked
    if (accrualId) {
      await db
        .update(schema.tfpAccruals)
        .set({
          applied_fee: overriddenAmount,
          override_id: overrideId,
          updated_at: new Date(),
        })
        .where(eq(schema.tfpAccruals.id, accrualId));
    }

    // Update invoice total_amount if invoice_id is linked
    if (invoiceId) {
      await db
        .update(schema.tfpInvoices)
        .set({
          total_amount: overriddenAmount,
          updated_at: new Date(),
        })
        .where(eq(schema.tfpInvoices.id, invoiceId));
    }
  },

  /**
   * Approve a PENDING override (PENDING -> APPROVED).
   * Segregation of Duties: approverId must not equal requested_by.
   * Applies the overridden amount to the linked accrual or invoice.
   */
  async approveOverride(overrideId: number, approverId: string) {
    const [override] = await db
      .select()
      .from(schema.feeOverrides)
      .where(eq(schema.feeOverrides.id, overrideId))
      .limit(1);

    if (!override) {
      throw new Error(`Override not found: ${overrideId}`);
    }

    if (override.override_status !== 'PENDING') {
      throw new Error(
        `Cannot approve override in ${override.override_status} status. Only PENDING overrides can be approved.`,
      );
    }

    // Segregation of Duties check
    if (override.created_by && approverId === override.created_by) {
      throw new Error(
        'Segregation of Duties violation: approver cannot be the same person who requested the override.',
      );
    }

    const [updated] = await db
      .update(schema.feeOverrides)
      .set({
        override_status: 'APPROVED',
        approved_by: approverId,
        updated_at: new Date(),
        updated_by: approverId,
      })
      .where(eq(schema.feeOverrides.id, overrideId))
      .returning();

    // Apply the overridden amount
    await this.applyOverride(
      overrideId,
      override.overridden_amount,
      override.accrual_id,
      override.invoice_id,
    );

    return updated;
  },

  /**
   * Reject a PENDING override (PENDING -> REJECTED).
   * Original amount is retained.
   */
  async rejectOverride(overrideId: number, approverId: string, comment: string) {
    const [override] = await db
      .select()
      .from(schema.feeOverrides)
      .where(eq(schema.feeOverrides.id, overrideId))
      .limit(1);

    if (!override) {
      throw new Error(`Override not found: ${overrideId}`);
    }

    if (override.override_status !== 'PENDING') {
      throw new Error(
        `Cannot reject override in ${override.override_status} status. Only PENDING overrides can be rejected.`,
      );
    }

    const [updated] = await db
      .update(schema.feeOverrides)
      .set({
        override_status: 'REJECTED',
        approved_by: approverId,
        reason_notes: `${override.reason_notes}\n---\nRejection: ${comment}`,
        updated_at: new Date(),
        updated_by: approverId,
      })
      .where(eq(schema.feeOverrides.id, overrideId))
      .returning();

    return updated;
  },

  /**
   * List overrides with filters and pagination.
   */
  async getOverrides(filters?: {
    override_stage?: string;
    override_status?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.override_stage) {
      conditions.push(
        eq(schema.feeOverrides.stage, filters.override_stage as any),
      );
    }

    if (filters?.override_status) {
      conditions.push(
        eq(schema.feeOverrides.override_status, filters.override_status as any),
      );
    }

    if (filters?.date_from) {
      conditions.push(
        gte(schema.feeOverrides.created_at, new Date(filters.date_from)),
      );
    }

    if (filters?.date_to) {
      conditions.push(
        lte(schema.feeOverrides.created_at, new Date(filters.date_to + 'T23:59:59.999Z')),
      );
    }

    if (filters?.search) {
      conditions.push(
        or(
          ilike(schema.feeOverrides.reason_code, `%${filters.search}%`),
          ilike(schema.feeOverrides.reason_notes, `%${filters.search}%`),
          ilike(schema.feeOverrides.requested_by, `%${filters.search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.feeOverrides)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.feeOverrides.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.feeOverrides)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get pending overrides for the approval queue.
   * Ordered by created_at (oldest first).
   */
  async getPendingOverrides() {
    const data = await db
      .select()
      .from(schema.feeOverrides)
      .where(eq(schema.feeOverrides.override_status, 'PENDING'))
      .orderBy(schema.feeOverrides.created_at);

    return { data, total: data.length };
  },

  /**
   * Get a single override by ID with fee plan details.
   */
  async getOverrideById(id: number) {
    const [override] = await db
      .select()
      .from(schema.feeOverrides)
      .where(eq(schema.feeOverrides.id, id))
      .limit(1);

    if (!override) {
      throw new Error(`Override not found: ${id}`);
    }

    // Resolve fee plan info from linked accrual or invoice
    let feePlanInfo: { fee_plan_code: string; fee_plan_name: string; lower_threshold_pct: string; upper_threshold_pct: string } | null = null;

    if (override.accrual_id) {
      const [accrual] = await db
        .select({ fee_plan_id: schema.tfpAccruals.fee_plan_id })
        .from(schema.tfpAccruals)
        .where(eq(schema.tfpAccruals.id, override.accrual_id))
        .limit(1);

      if (accrual?.fee_plan_id) {
        const [plan] = await db
          .select({
            fee_plan_code: schema.feePlans.fee_plan_code,
            fee_plan_name: schema.feePlans.fee_plan_name,
            lower_threshold_pct: schema.feePlans.lower_threshold_pct,
            upper_threshold_pct: schema.feePlans.upper_threshold_pct,
          })
          .from(schema.feePlans)
          .where(eq(schema.feePlans.id, accrual.fee_plan_id))
          .limit(1);

        if (plan) {
          feePlanInfo = {
            fee_plan_code: plan.fee_plan_code,
            fee_plan_name: plan.fee_plan_name,
            lower_threshold_pct: plan.lower_threshold_pct ?? '0.05',
            upper_threshold_pct: plan.upper_threshold_pct ?? '0.40',
          };
        }
      }
    }

    return {
      ...override,
      fee_plan: feePlanInfo,
    };
  },
};
