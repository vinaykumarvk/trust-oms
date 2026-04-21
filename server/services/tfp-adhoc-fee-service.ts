/**
 * TFP Ad-hoc Fee Service (TrustFees Pro -- Phase 7)
 *
 * Captures one-off (ad-hoc) fee accruals that get picked up by the next
 * invoice generation cycle.
 *
 * Methods:
 *   - captureAdhocFee(data)    -- Create ad-hoc fee accrual (accrual_status=OPEN)
 *   - getAdhocFees(filters)    -- List ad-hoc fees with filters
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

/* ---------- Main Service ---------- */

export const tfpAdhocFeeService = {
  /**
   * Capture an ad-hoc fee accrual.
   * Creates an OPEN accrual record that will be picked up by the next
   * invoice generation cycle.
   */
  async captureAdhocFee(data: {
    customer_id: string;
    portfolio_id?: string;
    fee_type: string;
    amount: number;
    currency: string;
    reason: string;
  }) {
    const today = new Date().toISOString().split('T')[0];
    const roundedAmount = Math.round(data.amount * 10000) / 10000;

    // Find a fee plan matching the fee_type for proper linkage, or use a default
    const [matchingPlan] = await db
      .select({ id: schema.feePlans.id })
      .from(schema.feePlans)
      .where(
        and(
          eq(schema.feePlans.fee_type, data.fee_type as any),
          eq(schema.feePlans.plan_status, 'ACTIVE'),
        ),
      )
      .limit(1);

    // If no matching plan found, use the first active plan as a fallback
    let feePlanId: number;
    if (matchingPlan) {
      feePlanId = matchingPlan.id;
    } else {
      const [anyPlan] = await db
        .select({ id: schema.feePlans.id })
        .from(schema.feePlans)
        .where(eq(schema.feePlans.plan_status, 'ACTIVE'))
        .limit(1);

      if (!anyPlan) {
        // Create a minimal reference -- fee_plan_id is required
        throw new Error(
          'No active fee plan found. At least one active fee plan is required to capture ad-hoc fees.',
        );
      }
      feePlanId = anyPlan.id;
    }

    const idempotencyKey = `ADHOC:${data.customer_id}:${data.fee_type}:${today}:${Date.now()}`;

    const [accrual] = await db
      .insert(schema.tfpAccruals)
      .values({
        fee_plan_id: feePlanId,
        customer_id: data.customer_id,
        portfolio_id: data.portfolio_id ?? null,
        security_id: null,
        transaction_id: null,
        base_amount: String(roundedAmount),
        computed_fee: String(roundedAmount),
        applied_fee: String(roundedAmount),
        currency: data.currency,
        fx_rate_locked: null,
        accrual_date: today,
        accrual_status: 'OPEN',
        override_id: null,
        exception_id: null,
        idempotency_key: idempotencyKey,
      })
      .returning();

    return {
      accrual,
      message: `Ad-hoc fee of ${data.currency} ${roundedAmount} created for ${data.customer_id}. Will be included in next invoice generation.`,
    };
  },

  /**
   * List ad-hoc fees with optional filters.
   * Ad-hoc fees are identified by idempotency_key starting with "ADHOC:".
   */
  async getAdhocFees(filters?: {
    accrual_status?: string;
    customer_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    // Filter for ad-hoc fees only
    conditions.push(sql`${schema.tfpAccruals.idempotency_key} LIKE 'ADHOC:%'` as any);

    if (filters?.accrual_status) {
      conditions.push(eq(schema.tfpAccruals.accrual_status, filters.accrual_status as any));
    }

    if (filters?.customer_id) {
      conditions.push(eq(schema.tfpAccruals.customer_id, filters.customer_id));
    }

    if (filters?.date_from) {
      conditions.push(
        sql`${schema.tfpAccruals.accrual_date} >= ${filters.date_from}` as any,
      );
    }

    if (filters?.date_to) {
      conditions.push(
        sql`${schema.tfpAccruals.accrual_date} <= ${filters.date_to}` as any,
      );
    }

    const where = and(...conditions);

    const data = await db
      .select({
        id: schema.tfpAccruals.id,
        fee_plan_id: schema.tfpAccruals.fee_plan_id,
        customer_id: schema.tfpAccruals.customer_id,
        portfolio_id: schema.tfpAccruals.portfolio_id,
        base_amount: schema.tfpAccruals.base_amount,
        computed_fee: schema.tfpAccruals.computed_fee,
        applied_fee: schema.tfpAccruals.applied_fee,
        currency: schema.tfpAccruals.currency,
        accrual_date: schema.tfpAccruals.accrual_date,
        accrual_status: schema.tfpAccruals.accrual_status,
        idempotency_key: schema.tfpAccruals.idempotency_key,
        created_at: schema.tfpAccruals.created_at,
        fee_plan_code: schema.feePlans.fee_plan_code,
        fee_type: schema.feePlans.fee_type,
      })
      .from(schema.tfpAccruals)
      .leftJoin(schema.feePlans, eq(schema.tfpAccruals.fee_plan_id, schema.feePlans.id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.tfpAccruals.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tfpAccruals)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
