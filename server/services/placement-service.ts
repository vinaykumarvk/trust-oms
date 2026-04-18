import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, inArray, type InferSelectModel } from 'drizzle-orm';

type Block = InferSelectModel<typeof schema.blocks>;
type Trade = InferSelectModel<typeof schema.trades>;

export const placementService = {
  /** Select a broker for a block. Returns broker metrics for comparison. */
  async getBrokerMetrics(blockId: string) {
    const [block] = await db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.block_id, blockId))
      .limit(1);

    if (!block) throw new Error('Block not found');

    const securityId = block.security_id;
    if (!securityId) throw new Error('Block has no security_id');

    return this.getBrokerComparison(securityId);
  },

  /** Place a block with a broker (transitions block to PLACED) */
  async placeBlock(blockId: string, brokerId: number) {
    // Validate block exists and is OPEN
    const [block] = await db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.block_id, blockId))
      .limit(1);

    if (!block) throw new Error('Block not found');
    if (block.block_status !== 'OPEN') {
      throw new Error(`Cannot place block in status ${block.block_status}. Block must be OPEN.`);
    }

    // Validate broker exists
    const [broker] = await db
      .select()
      .from(schema.brokers)
      .where(eq(schema.brokers.id, brokerId))
      .limit(1);

    if (!broker) throw new Error('Broker not found');

    // Update block status to PLACED
    const [updatedBlock] = await db
      .update(schema.blocks)
      .set({
        block_status: 'PLACED',
        updated_at: new Date(),
      })
      .where(eq(schema.blocks.block_id, blockId))
      .returning();

    // Find child orders via trades linked to this block
    const trades: Trade[] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.block_id, blockId));

    const orderIds = [...new Set(trades.map((t: Trade) => t.order_id).filter(Boolean))] as string[];

    if (orderIds.length > 0) {
      await db
        .update(schema.orders)
        .set({ order_status: 'PLACED', updated_at: new Date() })
        .where(inArray(schema.orders.order_id, orderIds));
    }

    return { block: updatedBlock, broker_id: brokerId };
  },

  /** Cancel a placement (only if PLACED, not yet filled) */
  async cancelPlacement(blockId: string) {
    const [block] = await db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.block_id, blockId))
      .limit(1);

    if (!block) throw new Error('Block not found');
    if (block.block_status !== 'PLACED') {
      throw new Error(`Cannot cancel placement for block in status ${block.block_status}. Block must be PLACED.`);
    }

    // Check if any fills exist
    const fills = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.trades)
      .where(eq(schema.trades.block_id, blockId));

    const fillCount = Number(fills[0]?.count ?? 0);
    if (fillCount > 0) {
      throw new Error('Cannot cancel placement: block already has fills');
    }

    // Revert block to OPEN
    const [updatedBlock] = await db
      .update(schema.blocks)
      .set({
        block_status: 'OPEN',
        updated_at: new Date(),
      })
      .where(eq(schema.blocks.block_id, blockId))
      .returning();

    // Revert child orders back to AGGREGATED
    const trades: Trade[] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.block_id, blockId));

    const orderIds = [...new Set(trades.map((t: Trade) => t.order_id).filter(Boolean))] as string[];

    if (orderIds.length > 0) {
      await db
        .update(schema.orders)
        .set({ order_status: 'AGGREGATED', updated_at: new Date() })
        .where(inArray(schema.orders.order_id, orderIds));
    }

    return updatedBlock;
  },

  /** Get broker comparison data: fill rate, avg commission, avg slippage */
  async getBrokerComparison(securityId: number) {
    const metrics = await db
      .select({
        broker_id: schema.trades.broker_id,
        trade_count: sql<number>`count(*)::int`,
        avg_slippage_bps: sql<string>`avg(${schema.trades.slippage_bps}::numeric)`,
        total_execution_qty: sql<string>`sum(${schema.trades.execution_qty}::numeric)`,
        avg_execution_price: sql<string>`avg(${schema.trades.execution_price}::numeric)`,
      })
      .from(schema.trades)
      .innerJoin(schema.blocks, eq(schema.trades.block_id, schema.blocks.block_id))
      .where(eq(schema.blocks.security_id, securityId))
      .groupBy(schema.trades.broker_id);

    // Calculate fill rate per broker: filled blocks / total blocks for this security
    const brokerStats = [];
    for (const metric of metrics) {
      if (!metric.broker_id) continue;

      // Get broker details
      const [broker] = await db
        .select()
        .from(schema.brokers)
        .where(eq(schema.brokers.id, metric.broker_id))
        .limit(1);

      brokerStats.push({
        broker_id: metric.broker_id,
        broker,
        trade_count: metric.trade_count,
        avg_slippage_bps: metric.avg_slippage_bps ? parseFloat(metric.avg_slippage_bps) : null,
        total_execution_qty: metric.total_execution_qty,
        avg_execution_price: metric.avg_execution_price,
      });
    }

    // Sort by trade_count descending (proxy for fill rate)
    brokerStats.sort((a, b) => b.trade_count - a.trade_count);

    return brokerStats;
  },
};
