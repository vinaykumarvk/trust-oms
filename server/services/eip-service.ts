/**
 * EIP Service (Phase 3I)
 *
 * Equity Investment Plan lifecycle management.
 * Handles enrollment, modification, unsubscription, and auto-debit processing
 * for scheduled EIP plans (BDO RFI Gap #9 Critical).
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

export const eipService = {
  /** Enroll a new EIP plan */
  async enrollEIP(data: {
    clientId: string;
    productId: number;
    amount: number;
    frequency: string;
    caAccount: string;
    portfolioId: string;
  }) {
    if (data.amount <= 0) {
      throw new Error('EIP amount must be positive');
    }

    const nextExecutionDate = computeNextExecutionDate(data.frequency);

    const [plan] = await db
      .insert(schema.scheduledPlans)
      .values({
        client_id: data.clientId,
        portfolio_id: data.portfolioId,
        plan_type: 'EIP',
        product_id: data.productId,
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

  /** Modify an existing EIP plan */
  async modifyEIP(
    planId: number,
    changes: { amount?: number; frequency?: string; caAccount?: string },
  ) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`EIP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'EIP') {
      throw new Error(`Plan ${planId} is not an EIP plan`);
    }

    if (plan.scheduled_plan_status !== 'ACTIVE') {
      throw new Error(`Cannot modify EIP plan in status ${plan.scheduled_plan_status}`);
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (changes.amount !== undefined) {
      if (changes.amount <= 0) {
        throw new Error('EIP amount must be positive');
      }
      updates.amount = String(changes.amount);
    }

    if (changes.frequency !== undefined) {
      updates.frequency = changes.frequency;
      updates.next_execution_date = computeNextExecutionDate(changes.frequency);
    }

    if (changes.caAccount !== undefined) {
      updates.ca_sa_account = changes.caAccount;
    }

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set(updates)
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return updated;
  },

  /** Unsubscribe (cancel) an EIP plan */
  async unsubscribeEIP(planId: number, reason?: string) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`EIP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'EIP') {
      throw new Error(`Plan ${planId} is not an EIP plan`);
    }

    if (plan.scheduled_plan_status === 'CANCELLED') {
      throw new Error(`EIP plan ${planId} is already cancelled`);
    }

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set({
        scheduled_plan_status: 'CANCELLED',
        status: reason ?? 'Unsubscribed',
        updated_at: new Date(),
      })
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return updated;
  },

  /** Process auto-debit for an EIP plan (stub) */
  async processAutoDebit(planId: number) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`EIP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'EIP') {
      throw new Error(`Plan ${planId} is not an EIP plan`);
    }

    if (plan.scheduled_plan_status !== 'ACTIVE') {
      throw new Error(`Cannot process auto-debit for plan in status ${plan.scheduled_plan_status}`);
    }

    // Stub: log auto-debit event
    console.log(
      `[EIP] Auto-debit processed for plan ${planId}: amount=${plan.amount}, account=${plan.ca_sa_account}`,
    );

    // Advance next_execution_date
    const currentDate = plan.next_execution_date
      ? new Date(plan.next_execution_date)
      : new Date();
    const nextDate = computeNextExecutionDate(plan.frequency ?? 'MONTHLY', currentDate);

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set({
        next_execution_date: nextDate,
        updated_at: new Date(),
      })
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return {
      plan: updated,
      processed_amount: plan.amount,
      previous_date: plan.next_execution_date,
      next_date: nextDate,
    };
  },

  /** Get EIP dashboard with status summaries */
  async getEIPDashboard(clientId?: string) {
    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(schema.scheduledPlans.plan_type, 'EIP'));

    if (clientId) {
      conditions.push(eq(schema.scheduledPlans.client_id, clientId));
    }

    const where = and(...conditions);

    const plans = await db
      .select()
      .from(schema.scheduledPlans)
      .where(where)
      .orderBy(desc(schema.scheduledPlans.created_at));

    // Compute status summaries
    const summaries = {
      total: plans.length,
      active: plans.filter((p: any) => p.scheduled_plan_status === 'ACTIVE').length,
      paused: plans.filter((p: any) => p.scheduled_plan_status === 'PAUSED').length,
      cancelled: plans.filter((p: any) => p.scheduled_plan_status === 'CANCELLED').length,
      completed: plans.filter((p: any) => p.scheduled_plan_status === 'COMPLETED').length,
    };

    return { plans, summaries };
  },

  /** Get EIP plans with filters and pagination */
  async getEIPPlans(filters: {
    clientId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(schema.scheduledPlans.plan_type, 'EIP'));

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
