import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, inArray, asc, type InferSelectModel } from 'drizzle-orm';

type Trade = InferSelectModel<typeof schema.trades>;
type Order = InferSelectModel<typeof schema.orders>;
type Block = InferSelectModel<typeof schema.blocks>;

function generateTradeId(): string {
  return `TRD-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export const fillService = {
  /** Record a fill (execution) for a block from the broker */
  async recordFill(data: {
    blockId: string;
    brokerId: number;
    executionPrice: number;
    executionQty: number;
    executionTime?: Date;
  }) {
    const { blockId, brokerId, executionPrice, executionQty, executionTime } = data;

    // Validate block exists and is in a fillable state
    const [block] = await db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.block_id, blockId))
      .limit(1);

    if (!block) throw new Error('Block not found');

    const fillableStatuses = ['PLACED', 'PARTIALLY_FILLED'];
    if (!fillableStatuses.includes(block.block_status ?? '')) {
      throw new Error(`Cannot record fill for block in status ${block.block_status}. Block must be PLACED or PARTIALLY_FILLED.`);
    }

    // Validate execution qty doesn't exceed remaining
    const existingFills = await db
      .select({
        total_filled: sql<string>`coalesce(sum(${schema.trades.execution_qty}::numeric), 0)`,
      })
      .from(schema.trades)
      .where(
        and(
          eq(schema.trades.block_id, blockId),
          eq(schema.trades.fill_type, 'BLOCK')
        )
      );

    const alreadyFilled = parseFloat(existingFills[0]?.total_filled ?? '0');
    const totalQty = parseFloat(block.total_qty ?? '0');
    const remaining = totalQty - alreadyFilled;

    if (executionQty > remaining) {
      throw new Error(`Fill quantity ${executionQty} exceeds remaining quantity ${remaining}`);
    }

    // Get child orders for this block via existing trade allocations
    const priorAllocations: Trade[] = await db
      .select()
      .from(schema.trades)
      .where(
        and(
          eq(schema.trades.block_id, blockId),
          sql`${schema.trades.order_id} IS NOT NULL`
        )
      );

    let childOrderIds: string[] = [...new Set(priorAllocations.map((t: Trade) => t.order_id).filter(Boolean))] as string[];

    // If no prior allocations, find child orders that belong to this block.
    // Orders in AGGREGATED/PLACED status for same security_id and side as the block.
    if (childOrderIds.length === 0) {
      const conditions = [
        eq(schema.orders.is_deleted, false),
        eq(schema.orders.security_id, block.security_id!),
        eq(schema.orders.side, block.side!),
        sql`${schema.orders.order_status} IN ('AGGREGATED', 'PLACED', 'PARTIALLY_FILLED')`,
      ];

      const candidateOrders: Order[] = await db
        .select()
        .from(schema.orders)
        .where(and(...conditions))
        .orderBy(asc(schema.orders.created_at));

      childOrderIds = candidateOrders.map((o: Order) => o.order_id);
    }

    // Fetch child orders
    let childOrders: Order[] = [];
    if (childOrderIds.length > 0) {
      childOrders = await db
        .select()
        .from(schema.orders)
        .where(inArray(schema.orders.order_id, childOrderIds))
        .orderBy(asc(schema.orders.created_at));
    }

    // Record the block-level fill
    const blockTradeId = generateTradeId();
    const execTime = executionTime ?? new Date();

    // Calculate slippage if we have reference prices from child orders
    let slippageBps: number | null = null;
    const limitPrices = childOrders
      .map((o: Order) => parseFloat(o.limit_price ?? '0'))
      .filter((p: number) => p > 0);
    if (limitPrices.length > 0) {
      const avgLimitPrice =
        limitPrices.reduce((sum: number, p: number) => sum + p, 0) / limitPrices.length;
      if (avgLimitPrice > 0) {
        slippageBps = ((executionPrice - avgLimitPrice) / avgLimitPrice) * 10000;
        // For BUY orders, positive slippage = worse (paid more)
        // For SELL orders, negative slippage = worse (received less)
        if (block.side === 'SELL') {
          slippageBps = -slippageBps;
        }
      }
    }

    const [blockTrade] = await db
      .insert(schema.trades)
      .values({
        trade_id: blockTradeId,
        order_id: null,
        block_id: blockId,
        broker_id: brokerId,
        execution_price: String(executionPrice),
        execution_qty: String(executionQty),
        execution_time: execTime,
        slippage_bps: slippageBps !== null ? String(slippageBps) : null,
        fill_type: 'BLOCK',
        created_by: 'system',
      })
      .returning();

    // Allocate fill to child orders using pro-rata (default)
    const allocationPolicy = block.allocation_policy ?? 'PRO_RATA';
    const childTrades: Trade[] = [];

    if (childOrders.length > 0) {
      if (allocationPolicy === 'PRO_RATA') {
        // Pro-rata: each order gets fills proportional to its quantity / block total_qty
        let allocatedQty = 0;

        for (let i = 0; i < childOrders.length; i++) {
          const order = childOrders[i];
          const orderQty = parseFloat(order.quantity ?? '0');
          const allocationPct = totalQty > 0 ? orderQty / totalQty : 0;

          let orderFillQty: number;
          if (i === childOrders.length - 1) {
            // Last order gets the remainder to avoid rounding issues
            orderFillQty = executionQty - allocatedQty;
          } else {
            orderFillQty = Math.round(executionQty * allocationPct * 100) / 100;
          }

          if (orderFillQty <= 0) continue;
          allocatedQty += orderFillQty;

          // Calculate order-specific slippage
          const orderLimitPrice = parseFloat(order.limit_price ?? '0');
          let orderSlippageBps: number | null = null;
          if (orderLimitPrice > 0) {
            orderSlippageBps = ((executionPrice - orderLimitPrice) / orderLimitPrice) * 10000;
            if (block.side === 'SELL') {
              orderSlippageBps = -orderSlippageBps;
            }
          }

          const childTradeId = generateTradeId();
          const [childTrade] = await db
            .insert(schema.trades)
            .values({
              trade_id: childTradeId,
              order_id: order.order_id,
              block_id: blockId,
              broker_id: brokerId,
              execution_price: String(executionPrice),
              execution_qty: String(orderFillQty),
              execution_time: execTime,
              slippage_bps: orderSlippageBps !== null ? String(orderSlippageBps) : null,
              allocation_pct: String(allocationPct * 100),
              fill_type: 'ALLOCATION',
              created_by: 'system',
            })
            .returning();

          childTrades.push(childTrade);
        }
      } else {
        // PRIORITY: fill orders in creation order until exhausted
        let remainingFillQty = executionQty;

        for (const order of childOrders) {
          if (remainingFillQty <= 0) break;

          const orderQty = parseFloat(order.quantity ?? '0');

          // Calculate how much this order still needs
          const existingOrderFills = await db
            .select({
              total: sql<string>`coalesce(sum(${schema.trades.execution_qty}::numeric), 0)`,
            })
            .from(schema.trades)
            .where(
              and(
                eq(schema.trades.order_id, order.order_id),
                eq(schema.trades.fill_type, 'ALLOCATION')
              )
            );

          const orderAlreadyFilled = parseFloat(existingOrderFills[0]?.total ?? '0');
          const orderRemaining = orderQty - orderAlreadyFilled;

          if (orderRemaining <= 0) continue;

          const orderFillQty = Math.min(remainingFillQty, orderRemaining);
          remainingFillQty -= orderFillQty;

          const allocationPct = totalQty > 0 ? orderQty / totalQty : 0;

          const orderLimitPrice = parseFloat(order.limit_price ?? '0');
          let orderSlippageBps: number | null = null;
          if (orderLimitPrice > 0) {
            orderSlippageBps = ((executionPrice - orderLimitPrice) / orderLimitPrice) * 10000;
            if (block.side === 'SELL') {
              orderSlippageBps = -orderSlippageBps;
            }
          }

          const childTradeId = generateTradeId();
          const [childTrade] = await db
            .insert(schema.trades)
            .values({
              trade_id: childTradeId,
              order_id: order.order_id,
              block_id: blockId,
              broker_id: brokerId,
              execution_price: String(executionPrice),
              execution_qty: String(orderFillQty),
              execution_time: execTime,
              slippage_bps: orderSlippageBps !== null ? String(orderSlippageBps) : null,
              allocation_pct: String(allocationPct * 100),
              fill_type: 'ALLOCATION',
              created_by: 'system',
            })
            .returning();

          childTrades.push(childTrade);
        }
      }

      // Update child order statuses
      for (const order of childOrders) {
        const orderQty = parseFloat(order.quantity ?? '0');

        // Sum all allocated fills for this order
        const orderFillsResult = await db
          .select({
            total: sql<string>`coalesce(sum(${schema.trades.execution_qty}::numeric), 0)`,
          })
          .from(schema.trades)
          .where(
            and(
              eq(schema.trades.order_id, order.order_id),
              eq(schema.trades.fill_type, 'ALLOCATION')
            )
          );

        const orderTotalFilled = parseFloat(orderFillsResult[0]?.total ?? '0');
        const newStatus = orderTotalFilled >= orderQty ? 'FILLED' : 'PARTIALLY_FILLED';

        await db
          .update(schema.orders)
          .set({ order_status: newStatus, updated_at: new Date() })
          .where(eq(schema.orders.order_id, order.order_id));
      }
    }

    // Update block status
    const allBlockFills = await db
      .select({
        total: sql<string>`coalesce(sum(${schema.trades.execution_qty}::numeric), 0)`,
      })
      .from(schema.trades)
      .where(
        and(
          eq(schema.trades.block_id, blockId),
          eq(schema.trades.fill_type, 'BLOCK')
        )
      );

    const totalBlockFilled = parseFloat(allBlockFills[0]?.total ?? '0');
    const newBlockStatus = totalBlockFilled >= totalQty ? 'FILLED' : 'PARTIALLY_FILLED';

    await db
      .update(schema.blocks)
      .set({ block_status: newBlockStatus, updated_at: new Date() })
      .where(eq(schema.blocks.block_id, blockId));

    return {
      block_trade: blockTrade,
      child_trades: childTrades,
      block_status: newBlockStatus,
      total_qty: totalQty,
      total_filled: totalBlockFilled,
      remaining: totalQty - totalBlockFilled,
    };
  },

  /** Get fills for a block */
  async getBlockFills(blockId: string) {
    const fills: Trade[] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.block_id, blockId))
      .orderBy(asc(schema.trades.execution_time));

    return fills;
  },

  /** Get fills for an order */
  async getOrderFills(orderId: string) {
    const fills: Trade[] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.order_id, orderId))
      .orderBy(asc(schema.trades.execution_time));

    return fills;
  },
};
