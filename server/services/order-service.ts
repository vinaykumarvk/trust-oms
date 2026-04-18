import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel } from 'drizzle-orm';

type Order = InferSelectModel<typeof schema.orders>;

function generateTRN(): string {
  const now = new Date();
  const pad = (n: number, len: number = 2) => String(n).padStart(len, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `TRN-${datePart}-${timePart}-${seq}`;
}

function generateOrderId(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export const orderService = {
  /** Create a new order */
  async createOrder(orderData: Partial<Order> & { portfolio_id: string; security_id: number; side: 'BUY' | 'SELL' }, userId: string) {
    const orderId = generateOrderId();
    const trn = generateTRN();
    const orderNo = `ON-${Date.now()}`;

    const [order] = await db.insert(schema.orders).values({
      order_id: orderId,
      order_no: orderNo,
      transaction_ref_no: trn,
      portfolio_id: orderData.portfolio_id,
      type: orderData.type ?? 'LIMIT',
      side: orderData.side,
      security_id: orderData.security_id,
      quantity: orderData.quantity,
      limit_price: orderData.limit_price,
      stop_price: orderData.stop_price,
      currency: orderData.currency ?? 'PHP',
      value_date: orderData.value_date,
      reason_code: orderData.reason_code,
      client_reference: orderData.client_reference,
      order_status: 'DRAFT',
      time_in_force: orderData.time_in_force ?? 'DAY',
      payment_mode: orderData.payment_mode,
      trader_id: orderData.trader_id,
      future_trade_date: orderData.future_trade_date,
      disposal_method: orderData.disposal_method,
      parent_order_id: orderData.parent_order_id,
      scheduled_plan_id: orderData.scheduled_plan_id,
      suitability_check_result: orderData.suitability_check_result,
      created_by: userId,
      created_by_role: orderData.created_by_role,
    }).returning();

    return order;
  },

  /** Submit order for authorization (Draft -> Pending-Auth) */
  async submitForAuthorization(orderId: string) {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');
    if (order.order_status !== 'DRAFT') throw new Error(`Cannot submit order in status ${order.order_status}`);

    const [updated] = await db.update(schema.orders)
      .set({ order_status: 'PENDING_AUTH', updated_at: new Date() })
      .where(eq(schema.orders.order_id, orderId))
      .returning();
    return updated;
  },

  /** Get single order */
  async getOrder(orderId: string) {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    return order ?? null;
  },

  /** List orders with filtering */
  async listOrders(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    portfolio_id?: string;
    side?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    trader_id?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions = [eq(schema.orders.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.orders.order_status, params.status as any));
    if (params.portfolio_id) conditions.push(eq(schema.orders.portfolio_id, params.portfolio_id));
    if (params.side) conditions.push(eq(schema.orders.side, params.side as any));
    if (params.trader_id) conditions.push(eq(schema.orders.trader_id, params.trader_id));
    if (params.search) {
      conditions.push(
        sql`(${schema.orders.order_id} ILIKE ${`%${params.search}%`} OR ${schema.orders.order_no} ILIKE ${`%${params.search}%`} OR ${schema.orders.transaction_ref_no} ILIKE ${`%${params.search}%`})`
      );
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const data = await db.select().from(schema.orders)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.orders.created_at));

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(schema.orders).where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Update a draft order */
  async updateOrder(orderId: string, data: Partial<Order>) {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');

    // Edit-post-submission status matrix (Gap #2)
    const editableStatuses = ['DRAFT', 'PENDING_AUTH', 'REJECTED'];
    if (!editableStatuses.includes(order.order_status ?? '')) {
      throw new Error(`Cannot edit order in status ${order.order_status}`);
    }

    const [updated] = await db.update(schema.orders)
      .set({ ...data, updated_at: new Date() })
      .where(eq(schema.orders.order_id, orderId))
      .returning();
    return updated;
  },

  /** Cancel an order (Draft/Pending-Auth only) */
  async cancelOrder(orderId: string) {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');

    const cancellableStatuses = ['DRAFT', 'PENDING_AUTH'];
    if (!cancellableStatuses.includes(order.order_status ?? '')) {
      throw new Error(`Cannot cancel order in status ${order.order_status}`);
    }

    const [updated] = await db.update(schema.orders)
      .set({ order_status: 'CANCELLED', updated_at: new Date() })
      .where(eq(schema.orders.order_id, orderId))
      .returning();
    return updated;
  },

  /** Revert / un-cancel an order (Gap #2) */
  async revertOrder(orderId: string) {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');
    if (order.order_status !== 'CANCELLED') throw new Error('Can only revert cancelled orders');

    // T+3 age limit check
    const cancelledAt = order.updated_at ?? order.created_at;
    const daysSince = Math.floor((Date.now() - new Date(cancelledAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 3) throw new Error('Cannot revert: order cancelled more than T+3 days ago');

    const [updated] = await db.update(schema.orders)
      .set({ order_status: 'DRAFT', updated_at: new Date() })
      .where(eq(schema.orders.order_id, orderId))
      .returning();
    return updated;
  },

  /** Get order timeline (state transitions) */
  async getOrderTimeline(orderId: string) {
    const auditRecords = await db.select().from(schema.auditRecords)
      .where(and(
        eq(schema.auditRecords.entity_type, 'orders'),
        eq(schema.auditRecords.entity_id, orderId),
      ))
      .orderBy(schema.auditRecords.created_at);
    return auditRecords;
  },

  /** Auto-compute missing field (Gap #1): given 2 of {units, price, gross}, compute the third */
  autoCompute(params: { quantity?: number; price?: number; grossAmount?: number }): {
    quantity?: number; price?: number; grossAmount?: number;
  } {
    const { quantity, price, grossAmount } = params;
    if (quantity && price && !grossAmount) {
      return { quantity, price, grossAmount: quantity * price };
    }
    if (quantity && grossAmount && !price) {
      return { quantity, price: grossAmount / quantity, grossAmount };
    }
    if (price && grossAmount && !quantity) {
      return { quantity: grossAmount / price, price, grossAmount };
    }
    return params;
  },
};
