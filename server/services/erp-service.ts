/**
 * ERP Service (Phase 3I)
 *
 * Equity Redemption Plan lifecycle management.
 * Handles enrollment, unsubscription, and auto-credit processing
 * for scheduled ERP plans (BDO RFI Gap #9 Critical).
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

/** Compute the next execution date based on frequency from a given start date. */
function computeNextExecutionDate(frequency: string, from?: Date): string {
  const base = from ?? new Date();
  const next = new Date(base);

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'BI_WEEKLY':
      next.setDate(next.getDate() + 14);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString().split('T')[0];
}

export const erpService = {
  /** Enroll a new ERP plan */
  async enrollERP(data: {
    clientId: string;
    portfolioId: string;
    amount: number;
    frequency: string;
    caAccount: string;
  }) {
    if (data.amount <= 0) {
      throw new Error('ERP amount must be positive');
    }

    const nextExecutionDate = computeNextExecutionDate(data.frequency);

    const [plan] = await db
      .insert(schema.scheduledPlans)
      .values({
        client_id: data.clientId,
        portfolio_id: data.portfolioId,
        plan_type: 'ERP',
        amount: String(data.amount),
        currency: 'PHP',
        frequency: data.frequency,
        ca_sa_account: data.caAccount,
        next_execution_date: nextExecutionDate,
        scheduled_plan_status: 'ACTIVE',
      })
      .returning();

    return plan;
  },

  /** Unsubscribe (cancel) an ERP plan */
  async unsubscribeERP(planId: number) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`ERP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'ERP') {
      throw new Error(`Plan ${planId} is not an ERP plan`);
    }

    if (plan.scheduled_plan_status === 'CANCELLED') {
      throw new Error(`ERP plan ${planId} is already cancelled`);
    }

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set({
        scheduled_plan_status: 'CANCELLED',
        updated_at: new Date(),
      })
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return updated;
  },

  /**
   * Process auto-credit for an ERP plan.
   * Creates a redemption order linked to the scheduled plan, generates
   * proceeds credit to the nominated CA/SA, and advances the next execution date.
   */
  async processAutoCredit(planId: number) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`ERP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'ERP') {
      throw new Error(`Plan ${planId} is not an ERP plan`);
    }

    if (plan.scheduled_plan_status !== 'ACTIVE') {
      throw new Error(
        `Cannot process auto-credit for plan in status ${plan.scheduled_plan_status}`,
      );
    }

    const amount = parseFloat(plan.amount ?? '0');
    const portfolioId = plan.portfolio_id;

    if (!portfolioId) {
      throw new Error(`ERP plan ${planId} has no portfolio_id`);
    }

    // Create a redemption order linked to this scheduled plan
    const orderNo = `ERP-${planId}-${Date.now()}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const [order] = await db
      .insert(schema.orders)
      .values({
        portfolio_id: portfolioId,
        security_id: plan.product_id,
        side: 'SELL',
        quantity: String(amount),
        currency: plan.currency ?? 'PHP',
        order_status: 'PENDING_AUTH',
        order_type: 'REDEMPTION',
        order_no: orderNo,
        value_date: todayStr,
        scheduled_plan_id: planId,
        created_by: 'SYSTEM',
      })
      .returning();

    // Advance next_execution_date
    const currentDate = plan.next_execution_date
      ? new Date(plan.next_execution_date)
      : new Date();
    const nextDate = computeNextExecutionDate(plan.frequency ?? 'MONTHLY', currentDate);

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set({
        next_execution_date: nextDate,
        status: `Last executed: ${todayStr}`,
        updated_at: new Date(),
      })
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return {
      plan: updated,
      order_id: order.order_id,
      order_no: orderNo,
      processed_amount: plan.amount,
      previous_date: plan.next_execution_date,
      next_date: nextDate,
    };
  },

  /** Get ERP plans with filters and pagination */
  async getERPPlans(filters: {
    clientId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(schema.scheduledPlans.plan_type, 'ERP'));

    if (filters.clientId) {
      conditions.push(eq(schema.scheduledPlans.client_id, filters.clientId));
    }

    if (filters.status) {
      conditions.push(eq(schema.scheduledPlans.scheduled_plan_status, filters.status as any));
    }

    const where = and(...conditions);

    const data = await db
      .select()
      .from(schema.scheduledPlans)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.scheduledPlans.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.scheduledPlans)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
