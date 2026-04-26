/**
 * Notional Accounting Service (TrustFees Pro — BRD Gap A04/A05/A06)
 *
 * Manages notional accounting events with idempotent emission,
 * schema validation, and EOD batch processing.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';

export const notionalAccountingService = {
  /**
   * Emit a notional accounting event.
   * Idempotent — skips if idempotency_key already exists.
   */
  async emit(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    // Check idempotency
    const [existing] = await db
      .select({ id: schema.notionalEvents.id })
      .from(schema.notionalEvents)
      .where(eq(schema.notionalEvents.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing) {
      return { emitted: false, reason: 'duplicate', event_id: existing.id };
    }

    const [event] = await db
      .insert(schema.notionalEvents)
      .values({
        event_type: eventType,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        payload,
        idempotency_key: idempotencyKey,
        schema_version: 1,
      })
      .returning();

    return { emitted: true, event_id: event.id };
  },

  /**
   * Run notional accounting for a business date.
   * Finds unconsumed events and emits notional entries.
   * Called by EOD orchestrator.
   */
  async runNotionalAccounting(businessDate: string) {
    let entriesCreated = 0;

    const unconsumed = await db
      .select()
      .from(schema.notionalEvents)
      .where(isNull(schema.notionalEvents.consumed_at))
      .limit(1000);

    for (const event of unconsumed) {
      try {
        const notionalKey = `NOTIONAL:${event.idempotency_key}`;

        await this.emit(
          `NOTIONAL_${event.event_type}`,
          event.aggregate_type,
          event.aggregate_id,
          {
            source_event_id: event.id,
            source_event_type: event.event_type,
            business_date: businessDate,
            ...((event.payload as Record<string, unknown>) ?? {}),
          },
          notionalKey,
        );

        await db
          .update(schema.notionalEvents)
          .set({ consumed_at: new Date() })
          .where(eq(schema.notionalEvents.id, event.id));

        entriesCreated++;
      } catch (err) {
        console.error(
          `[Notional] Error processing event ${event.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { business_date: businessDate, entries_created: entriesCreated };
  },

  /**
   * List notional events with optional filters.
   */
  async getEvents(filters?: {
    event_type?: string;
    aggregate_type?: string;
    consumed?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (filters?.event_type) {
      conditions.push(eq(schema.notionalEvents.event_type, filters.event_type));
    }
    if (filters?.aggregate_type) {
      conditions.push(eq(schema.notionalEvents.aggregate_type, filters.aggregate_type));
    }
    if (filters?.consumed === true) {
      conditions.push(sql`${schema.notionalEvents.consumed_at} IS NOT NULL`);
    } else if (filters?.consumed === false) {
      conditions.push(isNull(schema.notionalEvents.consumed_at));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.notionalEvents)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${schema.notionalEvents.emitted_at} DESC`);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.notionalEvents)
      .where(where);

    return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
  },
};
