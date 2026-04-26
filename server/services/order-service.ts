import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, inArray, lt, type InferSelectModel } from 'drizzle-orm';
import crypto from 'crypto';

type Order = InferSelectModel<typeof schema.orders>;

function generateTRN(): string {
  const now = new Date();
  const pad = (n: number, len: number = 2) => String(n).padStart(len, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const seq = String(crypto.randomInt(99999)).padStart(5, '0');
  return `TRN-${datePart}-${timePart}-${seq}`;
}

function generateOrderId(): string {
  return `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
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
      // FR-ORD-009: FX order fields (pass through when provided)
      fx_currency_pair: orderData.fx_currency_pair,
      fx_rate: orderData.fx_rate,
      fx_settlement_amount: orderData.fx_settlement_amount,
      fx_value_date: orderData.fx_value_date,
      // FR-ORD-013: GTD expiry date
      gtd_expiry_date: orderData.gtd_expiry_date,
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
    if (params.status) conditions.push(eq(schema.orders.order_status, params.status as typeof schema.orders.order_status.enumValues[number]));
    if (params.portfolio_id) conditions.push(eq(schema.orders.portfolio_id, params.portfolio_id));
    if (params.side) conditions.push(eq(schema.orders.side, params.side as typeof schema.orders.side.enumValues[number]));
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

  /** Update a draft order (FR-ORD-014: field-level edit restrictions for authorized+ statuses) */
  async updateOrder(orderId: string, data: Partial<Order>) {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');

    // FR-ORD-014: Statuses at or beyond AUTHORIZED where edits are heavily restricted
    const restrictedStatuses = ['AUTHORIZED', 'AGGREGATED', 'PLACED', 'PARTIALLY_FILLED', 'FILLED', 'CONFIRMED'];
    const allowedFieldsWhenRestricted = ['reason_code', 'value_date'];

    if (restrictedStatuses.includes(order.order_status ?? '')) {
      // Only allow editing notes (reason_code) and value_date
      const attemptedFields = Object.keys(data).filter(
        (key) => !['updated_at'].includes(key) && (data as Record<string, unknown>)[key] !== undefined
      );
      const restrictedFields = attemptedFields.filter(
        (field) => !allowedFieldsWhenRestricted.includes(field)
      );
      if (restrictedFields.length > 0) {
        const error = new Error(
          `Cannot edit fields [${restrictedFields.join(', ')}] when order status is ${order.order_status}. Only [${allowedFieldsWhenRestricted.join(', ')}] may be edited.`
        );
        (error as Error & { statusCode: number }).statusCode = 422;
        throw error;
      }
    } else {
      // Edit-post-submission status matrix (Gap #2)
      const editableStatuses = ['DRAFT', 'PENDING_AUTH', 'REJECTED'];
      if (!editableStatuses.includes(order.order_status ?? '')) {
        throw new Error(`Cannot edit order in status ${order.order_status}`);
      }
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

  // ===========================================================================
  // FR-ORD-007: Switch Orders
  // ===========================================================================

  /**
   * Create a switch order composed of a parent marker order, a redeem leg (SELL),
   * and a subscribe leg (BUY), all atomically linked via the switch_orders table.
   */
  async createSwitchOrder(
    redeemParams: Partial<Order> & { portfolio_id: string; security_id: number },
    subscribeParams: Partial<Order> & { portfolio_id: string; security_id: number },
    switchReason: 'REBALANCING' | 'CLIENT_REQUEST' | 'RISK_MITIGATION' | 'PRODUCT_MIGRATION' | 'OTHER',
    userId: string,
  ) {
    // 1. Create parent marker order
    const parentOrderId = generateOrderId();
    const parentTrn = generateTRN();
    const [parentOrder] = await db.insert(schema.orders).values({
      order_id: parentOrderId,
      order_no: `ON-${Date.now()}`,
      transaction_ref_no: parentTrn,
      portfolio_id: redeemParams.portfolio_id,
      type: 'MARKET',
      side: 'BUY', // marker side for the overall switch
      security_id: redeemParams.security_id,
      currency: redeemParams.currency ?? 'PHP',
      order_status: 'DRAFT',
      time_in_force: redeemParams.time_in_force ?? 'DAY',
      reason_code: `SWITCH:${switchReason}`,
      created_by: userId,
    }).returning();

    // 2. Create redeem leg (SELL)
    const redeemOrderId = generateOrderId();
    const redeemTrn = generateTRN();
    const [redeemLeg] = await db.insert(schema.orders).values({
      order_id: redeemOrderId,
      order_no: `ON-${Date.now()}-R`,
      transaction_ref_no: redeemTrn,
      portfolio_id: redeemParams.portfolio_id,
      type: redeemParams.type ?? 'MARKET',
      side: 'SELL',
      security_id: redeemParams.security_id,
      quantity: redeemParams.quantity,
      limit_price: redeemParams.limit_price,
      currency: redeemParams.currency ?? 'PHP',
      value_date: redeemParams.value_date,
      order_status: 'DRAFT',
      time_in_force: redeemParams.time_in_force ?? 'DAY',
      parent_order_id: parentOrderId,
      disposal_method: redeemParams.disposal_method,
      created_by: userId,
    }).returning();

    // 3. Create subscribe leg (BUY)
    const subscribeOrderId = generateOrderId();
    const subscribeTrn = generateTRN();
    const [subscribeLeg] = await db.insert(schema.orders).values({
      order_id: subscribeOrderId,
      order_no: `ON-${Date.now()}-S`,
      transaction_ref_no: subscribeTrn,
      portfolio_id: subscribeParams.portfolio_id,
      type: subscribeParams.type ?? 'MARKET',
      side: 'BUY',
      security_id: subscribeParams.security_id,
      quantity: subscribeParams.quantity,
      limit_price: subscribeParams.limit_price,
      currency: subscribeParams.currency ?? 'PHP',
      value_date: subscribeParams.value_date,
      order_status: 'DRAFT',
      time_in_force: subscribeParams.time_in_force ?? 'DAY',
      parent_order_id: parentOrderId,
      created_by: userId,
    }).returning();

    // 4. Insert into switchOrders linking table
    const [switchRecord] = await db.insert(schema.switchOrders).values({
      parent_order_id: parentOrderId,
      redeem_leg_order_id: redeemOrderId,
      subscribe_leg_order_id: subscribeOrderId,
      switch_reason: switchReason,
      switch_status: 'PENDING',
      created_by: userId,
    }).returning();

    return { parentOrder, redeemLeg, subscribeLeg, switchRecord };
  },

  // ===========================================================================
  // FR-ORD-008: Subsequent Allocation
  // ===========================================================================

  /**
   * Create subsequent allocation entries for an existing order.
   * Validates that allocation percentages sum to exactly 100%.
   */
  async createSubsequentAllocation(
    orderId: string,
    allocations: { fundId: string; percentage: number; amount: number }[],
  ) {
    // Validate order exists
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');

    // Validate percentages sum to 100%
    const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.0001) {
      const error = new Error(
        `Allocation percentages must sum to 100%. Current total: ${totalPercentage}%`
      );
      (error as Error & { statusCode: number }).statusCode = 422;
      throw error;
    }

    // Insert all allocation entries
    const insertedAllocations = await db.insert(schema.subsequentAllocations).values(
      allocations.map((a) => ({
        order_id: orderId,
        fund_id: a.fundId,
        percentage: String(a.percentage),
        amount: String(a.amount),
        created_by: order.created_by,
      })),
    ).returning();

    return insertedAllocations;
  },

  // ===========================================================================
  // FR-ORD-009: FX Rate Fetch (Bloomberg connector stub)
  // ===========================================================================

  /**
   * Fetch an FX rate for a given currency pair.
   * This is a stub for the Bloomberg FX connector; returns a mock rate.
   * In production, this will call the Bloomberg FXGO / Market Data API.
   */
  async fetchFxRate(currencyPair: string): Promise<{
    currencyPair: string;
    rate: number;
    source: string;
    timestamp: Date;
  }> {
    // Mock rates for common PHP pairs (production: replace with Bloomberg API call)
    const mockRates: Record<string, number> = {
      'USD/PHP': 55.8500,
      'PHP/USD': 0.0179,
      'EUR/PHP': 61.2300,
      'PHP/EUR': 0.0163,
      'GBP/PHP': 71.4500,
      'PHP/GBP': 0.0140,
      'JPY/PHP': 0.3720,
      'PHP/JPY': 2.6882,
      'SGD/PHP': 42.1200,
      'PHP/SGD': 0.0237,
      'HKD/PHP': 7.1800,
      'PHP/HKD': 0.1393,
      'CNY/PHP': 7.7100,
      'PHP/CNY': 0.1297,
    };

    const rate = mockRates[currencyPair.toUpperCase()];
    if (!rate) {
      throw new Error(`FX rate not available for pair: ${currencyPair}. Supported pairs: ${Object.keys(mockRates).join(', ')}`);
    }

    return {
      currencyPair: currencyPair.toUpperCase(),
      rate,
      source: 'MOCK_BLOOMBERG',
      timestamp: new Date(),
    };
  },

  // ===========================================================================
  // FR-ORD-013: GTD Auto-Cancel Expired Orders
  // ===========================================================================

  /**
   * Auto-cancel orders that have time_in_force='GTC' (proxy for GTD) and whose
   * gtd_expiry_date has passed. Only cancels orders still in pre-execution statuses.
   * Returns the count of cancelled orders.
   */
  async autoCancelExpiredGTD(): Promise<{ cancelledCount: number; cancelledOrderIds: string[] }> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Find expired GTD orders in cancellable pre-execution statuses
    const expiredOrders = await db.select({
      order_id: schema.orders.order_id,
    })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.time_in_force, 'GTC'),
          lt(schema.orders.gtd_expiry_date, today),
          inArray(schema.orders.order_status, ['DRAFT', 'PENDING_AUTH', 'AUTHORIZED']),
          eq(schema.orders.is_deleted, false),
        ),
      );

    if (expiredOrders.length === 0) {
      return { cancelledCount: 0, cancelledOrderIds: [] };
    }

    const orderIds = expiredOrders.map((o: Record<string, unknown>) => o.order_id as string);

    // Bulk update to CANCELLED
    await db.update(schema.orders)
      .set({
        order_status: 'CANCELLED',
        reason_code: 'GTD_AUTO_CANCEL',
        updated_at: new Date(),
      })
      .where(inArray(schema.orders.order_id, orderIds));

    return { cancelledCount: orderIds.length, cancelledOrderIds: orderIds };
  },

  // ===========================================================================
  // FR-ORD-012: Backdated Orders
  // ===========================================================================

  /**
   * Create a backdated order.
   *
   * Validates:
   * - Backdate reason must be provided
   * - Backdate approver must be provided (four-eyes principle)
   * - Backdated date must be within T-5 business days (excludes weekends)
   * - Approver must exist in users table
   *
   * Sets backdated_at, backdate_reason, and backdate_approver on the order.
   */
  async createBackdatedOrder(
    orderData: Partial<Order> & {
      portfolio_id: string;
      security_id: number;
      side: 'BUY' | 'SELL';
      value_date: string;
    },
    userId: string,
    backdateReason: string,
    backdateApprover: number,
  ) {
    // --- Validation ---
    if (!backdateReason || backdateReason.trim().length === 0) {
      throw new Error('Backdate reason is required for backdated orders');
    }

    if (!backdateApprover) {
      throw new Error('Backdate approver is required (four-eyes principle)');
    }

    // Verify the approver exists
    const [approver] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, backdateApprover))
      .limit(1);
    if (!approver) {
      throw new Error(`Backdate approver user ${backdateApprover} not found`);
    }

    // Parse the backdate (value_date) and check T-5 business days
    const backdateDate = new Date(orderData.value_date);
    if (isNaN(backdateDate.getTime())) {
      throw new Error('Invalid value_date for backdated order');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bdNormalized = new Date(backdateDate);
    bdNormalized.setHours(0, 0, 0, 0);

    if (bdNormalized >= today) {
      throw new Error('Backdated orders must have a value_date in the past');
    }

    // Count business days between backdateDate and today
    const businessDays = countBusinessDaysBetween(bdNormalized, today);
    if (businessDays > 5) {
      throw new Error(
        `Backdate exceeds T-5 business days limit. The value_date is ${businessDays} business days ago (max: 5).`,
      );
    }

    // --- Create the order with backdate fields ---
    const orderId = generateOrderId();
    const trn = generateTRN();
    const orderNo = `ON-${Date.now()}`;
    const now = new Date();

    const [order] = await db
      .insert(schema.orders)
      .values({
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
        fx_currency_pair: orderData.fx_currency_pair,
        fx_rate: orderData.fx_rate,
        fx_settlement_amount: orderData.fx_settlement_amount,
        fx_value_date: orderData.fx_value_date,
        gtd_expiry_date: orderData.gtd_expiry_date,
        // Backdating fields (FR-ORD-012)
        backdated_at: now,
        backdate_reason: backdateReason.trim(),
        backdate_approver: backdateApprover,
      })
      .returning();

    return order;
  },
};

// ---------------------------------------------------------------------------
// Helper: Count business days between two dates (excludes start, includes end)
// Weekends (Saturday = 6, Sunday = 0) are skipped.
// ---------------------------------------------------------------------------
function countBusinessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  current.setDate(current.getDate() + 1); // Start counting from the day after

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}
