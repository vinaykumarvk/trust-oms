import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const TIER_THRESHOLDS = {
  TWO_EYES: 50_000_000,   // <= PHP 50M
  FOUR_EYES: 500_000_000, // PHP 50M - 500M
  // Above 500M -> SIX_EYES
};

export const authorizationService = {
  /** Determine authorization tier based on order amount */
  determineAuthTier(orderAmount: number): 'TWO_EYES' | 'FOUR_EYES' | 'SIX_EYES' {
    if (orderAmount <= TIER_THRESHOLDS.TWO_EYES) return 'TWO_EYES';
    if (orderAmount <= TIER_THRESHOLDS.FOUR_EYES) return 'FOUR_EYES';
    return 'SIX_EYES';
  },

  /** Get required number of approvers per tier */
  getRequiredApprovers(tier: 'TWO_EYES' | 'FOUR_EYES' | 'SIX_EYES'): number {
    switch (tier) {
      case 'TWO_EYES': return 1;  // SRM alone
      case 'FOUR_EYES': return 2; // SRM + Risk Officer
      case 'SIX_EYES': return 3;  // SRM + Risk + Compliance (committee)
    }
  },

  /** Authorize an order */
  async authorizeOrder(orderId: string, approverId: number, approverRole: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
    // Fetch order
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');
    if (order.order_status !== 'PENDING_AUTH') throw new Error(`Order is not pending authorization (status: ${order.order_status})`);

    // Self-approval prevention
    if (order.created_by === String(approverId)) {
      throw new Error('Self-authorization is not permitted');
    }

    // Check for duplicate authorization by same approver
    const existingAuth = await db.select().from(schema.orderAuthorizations)
      .where(and(
        eq(schema.orderAuthorizations.order_id, orderId),
        eq(schema.orderAuthorizations.approver_id, approverId),
      )).limit(1);
    if (existingAuth.length > 0) throw new Error('Approver has already reviewed this order');

    // Record authorization
    const [auth] = await db.insert(schema.orderAuthorizations).values({
      order_id: orderId,
      tier: order.authorization_tier ?? 'TWO_EYES',
      approver_id: approverId,
      approver_role: approverRole,
      decision,
      comment: comment ?? null,
      decided_at: new Date(),
    }).returning();

    // If rejected, immediately reject the order
    if (decision === 'REJECTED') {
      await db.update(schema.orders)
        .set({ order_status: 'REJECTED', updated_at: new Date() })
        .where(eq(schema.orders.order_id, orderId));
      return { auth, orderStatus: 'REJECTED' as const };
    }

    // Check if authorization is complete
    const isComplete = await this.checkAuthorizationComplete(orderId);
    if (isComplete) {
      await db.update(schema.orders)
        .set({ order_status: 'AUTHORIZED', updated_at: new Date() })
        .where(eq(schema.orders.order_id, orderId));
      return { auth, orderStatus: 'AUTHORIZED' as const };
    }

    return { auth, orderStatus: 'PENDING_AUTH' as const };
  },

  /** Check if all required approvals are collected */
  async checkAuthorizationComplete(orderId: string): Promise<boolean> {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) return false;

    const tier = (order.authorization_tier ?? 'TWO_EYES') as 'TWO_EYES' | 'FOUR_EYES' | 'SIX_EYES';
    const required = this.getRequiredApprovers(tier);

    const approvals = await db.select().from(schema.orderAuthorizations)
      .where(and(
        eq(schema.orderAuthorizations.order_id, orderId),
        eq(schema.orderAuthorizations.decision, 'APPROVED'),
      ));

    return approvals.length >= required;
  },

  /** Get authorizations for an order */
  async getOrderAuthorizations(orderId: string) {
    return db.select().from(schema.orderAuthorizations)
      .where(eq(schema.orderAuthorizations.order_id, orderId))
      .orderBy(schema.orderAuthorizations.decided_at);
  },

  /** Get orders pending authorization */
  async getPendingOrders(params?: { tier?: string }) {
    const conditions = [
      eq(schema.orders.order_status, 'PENDING_AUTH'),
      eq(schema.orders.is_deleted, false),
    ];
    if (params?.tier) {
      conditions.push(eq(schema.orders.authorization_tier, params.tier as any));
    }

    return db.select().from(schema.orders)
      .where(and(...conditions))
      .orderBy(schema.orders.created_at);
  },
};
