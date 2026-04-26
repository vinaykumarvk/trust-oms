import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, inArray, asc, desc, type InferSelectModel } from 'drizzle-orm';

type Order = InferSelectModel<typeof schema.orders>;
type Block = InferSelectModel<typeof schema.blocks>;
type Trade = InferSelectModel<typeof schema.trades>;

function generateBlockId(): string {
  return `BLK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export const aggregationService = {
  /** Get all authorized orders grouped by security for the trader to build blocks */
  async getAggregationView(traderId?: number) {
    const conditions = [
      eq(schema.orders.order_status, 'AUTHORIZED'),
      eq(schema.orders.is_deleted, false),
    ];
    if (traderId) {
      conditions.push(eq(schema.orders.trader_id, traderId));
    }

    const orders: Array<{
      order_id: string;
      order_no: string | null;
      portfolio_id: string | null;
      security_id: number | null;
      side: 'BUY' | 'SELL' | null;
      type: 'MARKET' | 'LIMIT' | 'STOP' | null;
      quantity: string | null;
      limit_price: string | null;
      stop_price: string | null;
      trader_id: number | null;
      created_at: Date;
      security_name: string | null;
    }> = await db
      .select({
        order_id: schema.orders.order_id,
        order_no: schema.orders.order_no,
        portfolio_id: schema.orders.portfolio_id,
        security_id: schema.orders.security_id,
        side: schema.orders.side,
        type: schema.orders.type,
        quantity: schema.orders.quantity,
        limit_price: schema.orders.limit_price,
        stop_price: schema.orders.stop_price,
        trader_id: schema.orders.trader_id,
        created_at: schema.orders.created_at,
        security_name: schema.securities.name,
      })
      .from(schema.orders)
      .leftJoin(schema.securities, eq(schema.orders.security_id, schema.securities.id))
      .where(and(...conditions))
      .orderBy(asc(schema.orders.created_at));

    // Group by security_id + side
    const groups = new Map<
      string,
      {
        security_id: number;
        security_name: string | null;
        side: string;
        orders: typeof orders;
        total_qty: number;
        order_count: number;
      }
    >();

    for (const order of orders) {
      const key = `${order.security_id}-${order.side}`;
      if (!groups.has(key)) {
        groups.set(key, {
          security_id: order.security_id!,
          security_name: order.security_name,
          side: order.side!,
          orders: [],
          total_qty: 0,
          order_count: 0,
        });
      }
      const group = groups.get(key)!;
      group.orders.push(order);
      group.total_qty += parseFloat(order.quantity ?? '0');
      group.order_count += 1;
    }

    return Array.from(groups.values());
  },

  /** Create a block from a set of order IDs. Validates all orders are for same security/side and AUTHORIZED. */
  async createBlock(orderIds: string[], traderId: number) {
    if (!orderIds.length) {
      throw new Error('At least one order ID is required');
    }

    // Fetch all orders
    const orders: Order[] = await db
      .select()
      .from(schema.orders)
      .where(inArray(schema.orders.order_id, orderIds));

    // Validate all orders exist
    if (orders.length !== orderIds.length) {
      const foundIds = new Set(orders.map((o: Order) => o.order_id));
      const missing = orderIds.filter((id: string) => !foundIds.has(id));
      throw new Error(`Orders not found: ${missing.join(', ')}`);
    }

    // Validate all orders are AUTHORIZED
    const nonAuthorized = orders.filter((o: Order) => o.order_status !== 'AUTHORIZED');
    if (nonAuthorized.length > 0) {
      throw new Error(
        `Orders must be in AUTHORIZED status. Invalid: ${nonAuthorized.map((o: Order) => `${o.order_id} (${o.order_status})`).join(', ')}`
      );
    }

    // Validate same security_id
    const securityIds = new Set(orders.map((o: Order) => o.security_id));
    if (securityIds.size > 1) {
      throw new Error('All orders must be for the same security');
    }

    // Validate same side
    const sides = new Set(orders.map((o: Order) => o.side));
    if (sides.size > 1) {
      throw new Error('All orders must have the same side (BUY or SELL)');
    }

    const securityId = orders[0].security_id!;
    const side = orders[0].side!;
    const totalQty = orders.reduce((sum: number, o: Order) => sum + parseFloat(o.quantity ?? '0'), 0);
    const blockId = generateBlockId();

    // Insert block
    const [block] = await db
      .insert(schema.blocks)
      .values({
        block_id: blockId,
        security_id: securityId,
        side: side as 'BUY' | 'SELL',
        total_qty: String(totalQty),
        allocation_policy: 'PRO_RATA',
        block_status: 'OPEN',
        trader_id: traderId,
        created_by: String(traderId),
      })
      .returning();

    // Update all child orders to AGGREGATED
    await db
      .update(schema.orders)
      .set({ order_status: 'AGGREGATED', updated_at: new Date() })
      .where(inArray(schema.orders.order_id, orderIds));

    return { ...block, orders };
  },

  /** Allocate fills from a block back to child orders using pro-rata or priority policy */
  async allocateBlock(blockId: string, policy: 'PRO_RATA' | 'PRIORITY') {
    // Fetch block
    const [block] = await db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.block_id, blockId))
      .limit(1);

    if (!block) throw new Error('Block not found');

    // Update allocation policy on the block
    const [updated] = await db
      .update(schema.blocks)
      .set({ allocation_policy: policy, updated_at: new Date() })
      .where(eq(schema.blocks.block_id, blockId))
      .returning();

    // Fetch child orders (orders that were aggregated into this block).
    // We find them via trades that reference this block, or by status + timing.
    // Since orders don't have block_id, we identify them by looking at trades
    // linked to this block. For blocks with no fills yet, we return the plan.
    const trades: Trade[] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.block_id, blockId));

    // Get unique order IDs from trades
    const orderIds = [...new Set(trades.map((t: Trade) => t.order_id).filter(Boolean))] as string[];

    let childOrders: Order[] = [];
    if (orderIds.length > 0) {
      childOrders = await db
        .select()
        .from(schema.orders)
        .where(inArray(schema.orders.order_id, orderIds));
    }

    const totalQty = parseFloat(block.total_qty ?? '0');

    // Build allocation plan
    const allocationPlan = childOrders.map((order: Order, index: number) => {
      const orderQty = parseFloat(order.quantity ?? '0');
      let allocationPct: number;

      if (policy === 'PRO_RATA') {
        allocationPct = totalQty > 0 ? orderQty / totalQty : 0;
      } else {
        // PRIORITY: orders filled in creation order; percentage is conceptual
        allocationPct = totalQty > 0 ? orderQty / totalQty : 0;
      }

      return {
        order_id: order.order_id,
        quantity: orderQty,
        allocation_pct: allocationPct,
        priority: index + 1,
      };
    });

    return { block: updated, allocation_policy: policy, allocation_plan: allocationPlan };
  },

  /** Get all working blocks (status: OPEN, PLACED, PARTIALLY_FILLED) */
  async getWorkingBlocks() {
    const blocks = await db
      .select({
        block_id: schema.blocks.block_id,
        security_id: schema.blocks.security_id,
        side: schema.blocks.side,
        total_qty: schema.blocks.total_qty,
        allocation_policy: schema.blocks.allocation_policy,
        block_status: schema.blocks.block_status,
        trader_id: schema.blocks.trader_id,
        created_at: schema.blocks.created_at,
        security_name: schema.securities.name,
      })
      .from(schema.blocks)
      .leftJoin(schema.securities, eq(schema.blocks.security_id, schema.securities.id))
      .where(
        sql`${schema.blocks.block_status} IN ('OPEN', 'PLACED', 'PARTIALLY_FILLED') AND ${schema.blocks.is_deleted} = false`
      )
      .orderBy(asc(schema.blocks.created_at));

    return blocks;
  },

  /** Get block details with child orders */
  async getBlock(blockId: string) {
    const [block] = await db
      .select({
        block_id: schema.blocks.block_id,
        security_id: schema.blocks.security_id,
        side: schema.blocks.side,
        total_qty: schema.blocks.total_qty,
        allocation_policy: schema.blocks.allocation_policy,
        block_status: schema.blocks.block_status,
        trader_id: schema.blocks.trader_id,
        created_at: schema.blocks.created_at,
        security_name: schema.securities.name,
      })
      .from(schema.blocks)
      .leftJoin(schema.securities, eq(schema.blocks.security_id, schema.securities.id))
      .where(eq(schema.blocks.block_id, blockId))
      .limit(1);

    if (!block) return null;

    // Get child trades for this block
    const trades: Trade[] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.block_id, blockId));

    // Get unique child order IDs from trades
    const orderIds = [...new Set(trades.map((t: Trade) => t.order_id).filter(Boolean))] as string[];

    let childOrders: Order[] = [];
    if (orderIds.length > 0) {
      childOrders = await db
        .select()
        .from(schema.orders)
        .where(inArray(schema.orders.order_id, orderIds));
    }

    // Calculate fill stats
    const totalFilled = trades.reduce((sum: number, t: Trade) => sum + parseFloat(t.execution_qty ?? '0'), 0);
    const totalQty = parseFloat(block.total_qty ?? '0');
    const fillPct = totalQty > 0 ? (totalFilled / totalQty) * 100 : 0;

    return {
      ...block,
      child_orders: childOrders,
      trades,
      fill_stats: {
        total_qty: totalQty,
        total_filled: totalFilled,
        fill_pct: fillPct,
        remaining: totalQty - totalFilled,
      },
    };
  },

  /** Auto-combine: find similar open orders (same security, same side, same type) and suggest blocks */
  async suggestBlocks() {
    const result = await db
      .select({
        security_id: schema.orders.security_id,
        side: schema.orders.side,
        type: schema.orders.type,
        security_name: schema.securities.name,
        order_count: sql<number>`count(*)::int`,
        total_qty: sql<string>`sum(${schema.orders.quantity}::numeric)`,
      })
      .from(schema.orders)
      .leftJoin(schema.securities, eq(schema.orders.security_id, schema.securities.id))
      .where(
        and(
          eq(schema.orders.order_status, 'AUTHORIZED'),
          eq(schema.orders.is_deleted, false)
        )
      )
      .groupBy(schema.orders.security_id, schema.orders.side, schema.orders.type, schema.securities.name)
      .having(sql`count(*) > 1`);

    // For each group, fetch the actual orders
    const suggestions = [];
    for (const group of result) {
      const conditions = [
        eq(schema.orders.order_status, 'AUTHORIZED'),
        eq(schema.orders.is_deleted, false),
      ];
      if (group.security_id !== null) {
        conditions.push(eq(schema.orders.security_id, group.security_id));
      }
      if (group.side !== null) {
        conditions.push(eq(schema.orders.side, group.side));
      }
      if (group.type !== null) {
        conditions.push(eq(schema.orders.type, group.type));
      }

      const orders: Order[] = await db
        .select()
        .from(schema.orders)
        .where(and(...conditions))
        .orderBy(asc(schema.orders.created_at));

      suggestions.push({
        security_id: group.security_id,
        security_name: group.security_name,
        side: group.side,
        type: group.type,
        order_count: group.order_count,
        total_qty: group.total_qty,
        order_ids: orders.map((o: Order) => o.order_id),
        orders,
      });
    }

    return suggestions;
  },

  // ---------------------------------------------------------------------------
  // FR-AGG-009: Waitlist Auto-Allocation (time-receipt priority)
  // ---------------------------------------------------------------------------

  /**
   * Add an order to a block's waitlist with time-receipt priority.
   * Priority rank is auto-assigned as max(existing rank) + 1.
   */
  async addToWaitlist(blockId: string, orderId: string, requestedQty: number) {
    if (requestedQty <= 0) {
      throw new Error('Requested quantity must be positive');
    }

    // Verify the block exists
    const [block] = await db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.block_id, blockId))
      .limit(1);

    if (!block) {
      throw new Error(`Block not found: ${blockId}`);
    }

    // Atomic INSERT with inline SELECT for priority rank — prevents
    // duplicate ranks from concurrent inserts.
    const result = await db.execute(sql`
      INSERT INTO block_waitlist_entries (block_id, order_id, priority_rank, requested_qty, allocated_qty, waitlist_status, queued_at)
      VALUES (
        ${blockId},
        ${orderId},
        COALESCE((SELECT MAX(priority_rank) FROM block_waitlist_entries WHERE block_id = ${blockId}), 0) + 1,
        ${String(requestedQty)},
        '0',
        'QUEUED',
        NOW()
      )
      RETURNING *
    `);

    const entry = result.rows[0];
    return entry;
  },

  /**
   * Auto-allocate available quantity to queued waitlist orders by priority
   * (lowest rank = highest priority = earliest queued).
   *
   * Returns the list of entries that received allocations.
   */
  async processWaitlist(blockId: string, availableQty: number) {
    if (availableQty <= 0) {
      return [];
    }

    // Use a transaction with FOR UPDATE to prevent double-allocation
    // from concurrent calls.
    return db.transaction(async (tx: typeof db) => {
      // Lock rows to prevent concurrent allocation
      const entries = await tx
        .select()
        .from(schema.blockWaitlistEntries)
        .where(
          and(
            eq(schema.blockWaitlistEntries.block_id, blockId),
            sql`${schema.blockWaitlistEntries.waitlist_status} IN ('QUEUED', 'PARTIALLY_ALLOCATED')`,
          ),
        )
        .orderBy(asc(schema.blockWaitlistEntries.priority_rank))
        .for('update');

      let remaining = availableQty;
      const allocated: Array<typeof entries[number]> = [];

      for (const entry of entries) {
        if (remaining <= 0) break;

        const requested = parseFloat(entry.requested_qty ?? '0');
        const alreadyAllocated = parseFloat(entry.allocated_qty ?? '0');
        const still_needed = requested - alreadyAllocated;

        if (still_needed <= 0) continue;

        const fillAmount = Math.min(still_needed, remaining);
        const newAllocated = alreadyAllocated + fillAmount;
        const newStatus = newAllocated >= requested ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED';

        const [updated] = await tx
          .update(schema.blockWaitlistEntries)
          .set({
            allocated_qty: String(newAllocated),
            waitlist_status: newStatus as 'QUEUED' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED' | 'CANCELLED',
            updated_at: new Date(),
          })
          .where(eq(schema.blockWaitlistEntries.id, entry.id))
          .returning();

        allocated.push(updated);
        remaining -= fillAmount;
      }

      return allocated;
    });
  },

  /**
   * Handle an order backing out of a block waitlist.
   * Cancels the entry and re-allocates its freed quantity to the next orders
   * in the waitlist.
   */
  async handleBackout(blockId: string, orderId: string) {
    // Find the entry
    const [entry] = await db
      .select()
      .from(schema.blockWaitlistEntries)
      .where(
        and(
          eq(schema.blockWaitlistEntries.block_id, blockId),
          eq(schema.blockWaitlistEntries.order_id, orderId),
          sql`${schema.blockWaitlistEntries.waitlist_status} != 'CANCELLED'`,
        ),
      )
      .limit(1);

    if (!entry) {
      throw new Error(`Waitlist entry not found for block ${blockId}, order ${orderId}`);
    }

    const freedQty = parseFloat(entry.allocated_qty ?? '0');

    // Cancel the entry
    await db
      .update(schema.blockWaitlistEntries)
      .set({
        waitlist_status: 'CANCELLED',
        updated_at: new Date(),
      })
      .where(eq(schema.blockWaitlistEntries.id, entry.id));

    // Re-allocate freed quantity to remaining waitlist entries
    let reAllocated: Array<typeof entry> = [];
    if (freedQty > 0) {
      reAllocated = await aggregationService.processWaitlist(blockId, freedQty);
    }

    return {
      cancelled_entry: { ...entry, waitlist_status: 'CANCELLED' },
      freed_qty: freedQty,
      re_allocated_entries: reAllocated,
    };
  },
};
