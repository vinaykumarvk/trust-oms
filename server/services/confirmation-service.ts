/**
 * Confirmation & Matching Service (Phase 2B)
 *
 * Handles trade confirmation matching against counterparty data,
 * exception management, and bulk confirmation workflows.
 *
 * BRD FR-NAV-005: dual-source deviation > 0.25% flags exception.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel, isNull, count } from 'drizzle-orm';

type Trade = InferSelectModel<typeof schema.trades>;
type Confirmation = InferSelectModel<typeof schema.confirmations>;

export const confirmationService = {
  /**
   * Auto-match a trade against counterparty data.
   * Match criteria: quantity (exact), price within tolerance.
   * BRD FR-NAV-005: dual-source deviation > 0.25% flags exception.
   */
  async autoMatch(
    tradeId: string,
    counterpartyData: {
      counterparty_ref: string;
      execution_price: number;
      execution_qty: number;
      settlement_date?: string;
    },
  ) {
    // Fetch the trade record
    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, tradeId))
      .limit(1);

    if (!trade) {
      throw new Error(`Trade not found: ${tradeId}`);
    }

    const tradePrice = parseFloat(trade.execution_price ?? '0');
    const tradeQty = parseFloat(trade.execution_qty ?? '0');
    const counterpartyPrice = counterpartyData.execution_price;
    const counterpartyQty = counterpartyData.execution_qty;

    // Price deviation calculation
    const deviation = tradePrice > 0
      ? Math.abs(counterpartyPrice - tradePrice) / tradePrice
      : 0;

    // Quantity must match exactly
    const qtyMatch = tradeQty === counterpartyQty;

    const tolerance = this.getMatchTolerance();
    const priceOk = deviation <= tolerance;

    const toleranceCheck = {
      price_ok: priceOk,
      qty_ok: qtyMatch,
      deviation_pct: deviation * 100,
      date_ok: true, // settlement date check placeholder
    };

    // Determine match status
    let matchStatus: string;
    let exceptionReason: string | null = null;

    if (priceOk && qtyMatch) {
      matchStatus = 'MATCHED';
    } else {
      matchStatus = 'EXCEPTION';
      const reasons: string[] = [];
      if (!priceOk) {
        reasons.push(
          `Price deviation ${(deviation * 100).toFixed(4)}% exceeds tolerance ${(tolerance * 100).toFixed(2)}% (trade: ${tradePrice}, counterparty: ${counterpartyPrice})`,
        );
      }
      if (!qtyMatch) {
        reasons.push(
          `Quantity mismatch (trade: ${tradeQty}, counterparty: ${counterpartyQty})`,
        );
      }
      exceptionReason = reasons.join('; ');
    }

    // Insert confirmation record
    const [confirmation] = await db
      .insert(schema.confirmations)
      .values({
        trade_id: tradeId,
        match_method: 'AUTO',
        match_status: matchStatus,
        counterparty_ref: counterpartyData.counterparty_ref,
        tolerance_check: toleranceCheck,
        exception_reason: exceptionReason,
      })
      .returning();

    return confirmation;
  },

  /** Get configurable price tolerance -- default 0.25% per BRD */
  getMatchTolerance(): number {
    return 0.0025; // 0.25%
  },

  /** Flag a trade as exception manually */
  async flagException(tradeId: string, reason: string) {
    // Verify trade exists
    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, tradeId))
      .limit(1);

    if (!trade) {
      throw new Error(`Trade not found: ${tradeId}`);
    }

    // Check if confirmation already exists for this trade
    const [existing] = await db
      .select()
      .from(schema.confirmations)
      .where(eq(schema.confirmations.trade_id, tradeId))
      .limit(1);

    if (existing) {
      // Update existing confirmation to EXCEPTION
      const [updated] = await db
        .update(schema.confirmations)
        .set({
          match_status: 'EXCEPTION',
          exception_reason: reason,
          updated_at: new Date(),
        })
        .where(eq(schema.confirmations.id, existing.id))
        .returning();
      return updated;
    }

    // Insert new confirmation as EXCEPTION
    const [confirmation] = await db
      .insert(schema.confirmations)
      .values({
        trade_id: tradeId,
        match_method: 'MANUAL',
        match_status: 'EXCEPTION',
        exception_reason: reason,
      })
      .returning();

    return confirmation;
  },

  /** Resolve an exception -- mark confirmed or re-match */
  async resolveException(
    confirmationId: number,
    resolution: {
      action: 'CONFIRM' | 'REJECT' | 'REMATCH';
      resolvedBy: number;
      notes?: string;
    },
  ) {
    const [confirmation] = await db
      .select()
      .from(schema.confirmations)
      .where(eq(schema.confirmations.id, confirmationId))
      .limit(1);

    if (!confirmation) {
      throw new Error(`Confirmation not found: ${confirmationId}`);
    }

    if (confirmation.match_status !== 'EXCEPTION') {
      throw new Error(
        `Cannot resolve confirmation in status ${confirmation.match_status}; must be EXCEPTION`,
      );
    }

    let newStatus: string;
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    switch (resolution.action) {
      case 'CONFIRM':
        newStatus = 'CONFIRMED';
        updateData.confirmed_by = resolution.resolvedBy;
        updateData.confirmed_at = new Date();
        updateData.match_method = 'MANUAL';
        break;
      case 'REJECT':
        newStatus = 'UNMATCHED';
        break;
      case 'REMATCH':
        newStatus = 'UNMATCHED';
        updateData.exception_reason = null;
        break;
      default:
        throw new Error(`Invalid resolution action: ${resolution.action}`);
    }

    updateData.match_status = newStatus;
    if (resolution.notes) {
      updateData.exception_reason = resolution.notes;
    }

    const [updated] = await db
      .update(schema.confirmations)
      .set(updateData)
      .where(eq(schema.confirmations.id, confirmationId))
      .returning();

    return updated;
  },

  /** Get confirmation queue with filters */
  async getConfirmationQueue(filters: {
    status?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(eq(schema.confirmations.match_status, filters.status));
    }

    if (filters.search) {
      conditions.push(
        sql`(
          ${schema.confirmations.trade_id} ILIKE ${`%${filters.search}%`}
          OR ${schema.confirmations.counterparty_ref} ILIKE ${`%${filters.search}%`}
          OR ${schema.confirmations.exception_reason} ILIKE ${`%${filters.search}%`}
        )` as any,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: schema.confirmations.id,
        trade_id: schema.confirmations.trade_id,
        match_method: schema.confirmations.match_method,
        match_status: schema.confirmations.match_status,
        counterparty_ref: schema.confirmations.counterparty_ref,
        tolerance_check: schema.confirmations.tolerance_check,
        exception_reason: schema.confirmations.exception_reason,
        confirmed_by: schema.confirmations.confirmed_by,
        confirmed_at: schema.confirmations.confirmed_at,
        created_at: schema.confirmations.created_at,
        updated_at: schema.confirmations.updated_at,
        // Trade details from join
        execution_price: schema.trades.execution_price,
        execution_qty: schema.trades.execution_qty,
        execution_time: schema.trades.execution_time,
        order_id: schema.trades.order_id,
        block_id: schema.trades.block_id,
        broker_id: schema.trades.broker_id,
      })
      .from(schema.confirmations)
      .leftJoin(schema.trades, eq(schema.confirmations.trade_id, schema.trades.trade_id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.confirmations.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.confirmations)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get summary counts by status */
  async getSummary() {
    const result = await db
      .select({
        match_status: schema.confirmations.match_status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.confirmations)
      .groupBy(schema.confirmations.match_status);

    const summary: Record<string, number> = {
      unmatched: 0,
      matched: 0,
      exception: 0,
      confirmed: 0,
      total: 0,
    };

    for (const row of result) {
      const status = (row.match_status ?? '').toLowerCase();
      if (status in summary) {
        summary[status] = row.count;
      }
      summary.total += row.count;
    }

    return summary;
  },

  /** Bulk confirm all MATCHED items */
  async bulkConfirm(confirmationIds: number[], confirmedBy: number) {
    if (confirmationIds.length === 0) {
      throw new Error('No confirmation IDs provided');
    }

    const now = new Date();
    const results: Confirmation[] = [];

    for (const id of confirmationIds) {
      const [confirmation] = await db
        .select()
        .from(schema.confirmations)
        .where(eq(schema.confirmations.id, id))
        .limit(1);

      if (!confirmation) {
        continue; // skip missing
      }

      if (confirmation.match_status !== 'MATCHED') {
        continue; // skip non-matched
      }

      const [updated] = await db
        .update(schema.confirmations)
        .set({
          match_status: 'CONFIRMED',
          confirmed_by: confirmedBy,
          confirmed_at: now,
          updated_at: now,
        })
        .where(eq(schema.confirmations.id, id))
        .returning();

      results.push(updated);
    }

    return {
      confirmed: results.length,
      total_requested: confirmationIds.length,
      results,
    };
  },

  /** Get unresolved exceptions with aging */
  async getExceptions(filters: {
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const where = and(
      eq(schema.confirmations.match_status, 'EXCEPTION'),
      isNull(schema.confirmations.confirmed_at),
    );

    const data = await db
      .select({
        id: schema.confirmations.id,
        trade_id: schema.confirmations.trade_id,
        match_method: schema.confirmations.match_method,
        match_status: schema.confirmations.match_status,
        counterparty_ref: schema.confirmations.counterparty_ref,
        tolerance_check: schema.confirmations.tolerance_check,
        exception_reason: schema.confirmations.exception_reason,
        created_at: schema.confirmations.created_at,
        updated_at: schema.confirmations.updated_at,
        // Trade details
        execution_price: schema.trades.execution_price,
        execution_qty: schema.trades.execution_qty,
        order_id: schema.trades.order_id,
        broker_id: schema.trades.broker_id,
        // Aging: days since creation
        aging_days: sql<number>`EXTRACT(EPOCH FROM (NOW() - ${schema.confirmations.created_at})) / 86400`,
      })
      .from(schema.confirmations)
      .leftJoin(schema.trades, eq(schema.confirmations.trade_id, schema.trades.trade_id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.confirmations.created_at));

    // Add aging bucket to each row
    const dataWithBuckets = data.map((row: typeof data[number]) => {
      const agingDays = Number(row.aging_days ?? 0);
      let aging_bucket: string;
      if (agingDays <= 1) {
        aging_bucket = '0-1d';
      } else if (agingDays <= 3) {
        aging_bucket = '2-3d';
      } else if (agingDays <= 7) {
        aging_bucket = '4-7d';
      } else {
        aging_bucket = '7+d';
      }
      return { ...row, aging_bucket };
    });

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.confirmations)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    // Bucket summary
    const bucketResult = await db
      .select({
        bucket: sql<string>`
          CASE
            WHEN EXTRACT(EPOCH FROM (NOW() - ${schema.confirmations.created_at})) / 86400 <= 1 THEN '0-1d'
            WHEN EXTRACT(EPOCH FROM (NOW() - ${schema.confirmations.created_at})) / 86400 <= 3 THEN '2-3d'
            WHEN EXTRACT(EPOCH FROM (NOW() - ${schema.confirmations.created_at})) / 86400 <= 7 THEN '4-7d'
            ELSE '7+d'
          END`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.confirmations)
      .where(where)
      .groupBy(sql`
        CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - ${schema.confirmations.created_at})) / 86400 <= 1 THEN '0-1d'
          WHEN EXTRACT(EPOCH FROM (NOW() - ${schema.confirmations.created_at})) / 86400 <= 3 THEN '2-3d'
          WHEN EXTRACT(EPOCH FROM (NOW() - ${schema.confirmations.created_at})) / 86400 <= 7 THEN '4-7d'
          ELSE '7+d'
        END`);

    const buckets: Record<string, number> = {
      '0-1d': 0,
      '2-3d': 0,
      '4-7d': 0,
      '7+d': 0,
    };
    for (const row of bucketResult) {
      buckets[row.bucket] = row.count;
    }

    return { data: dataWithBuckets, total, page, pageSize, buckets };
  },
};
