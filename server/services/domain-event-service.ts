import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { logAuditEvent } from './audit-logger';
import { ConflictError, NotFoundError } from './service-errors';
import {
  buildDomainEventEnvelope,
  buildDomainReplayHistoryEntry,
  requireReplayReason,
  type DomainEventInput,
  type DomainReplayHistoryEntry,
} from './domain-event-idempotency-policy';

type DomainEvent = typeof schema.domainEvents.$inferSelect;

function actorText(actorId?: string | number | null): string | null {
  if (actorId === null || actorId === undefined || actorId === '') return null;
  return String(actorId);
}

function appendReplayHistorySql(entry: DomainReplayHistoryEntry) {
  return sql`COALESCE(${schema.domainEvents.replay_history}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`;
}

function nextReplayRequestId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `DER-${stamp}-${Date.now()}`;
}

async function auditDomainEvent(
  action: string,
  domainEventId: string,
  actorId: string | number | null | undefined,
  changes: Record<string, unknown>,
) {
  await logAuditEvent({
    entityType: 'domain_events',
    entityId: domainEventId,
    action,
    actorId: actorText(actorId) ?? undefined,
    actorSource: actorId == null ? 'SYSTEM' : 'USER',
    source: {
      system: 'TRUST_OMS',
      component: 'domain-event-service',
    },
    changes,
  });
}

async function getEventByDomainId(domainEventId: string): Promise<DomainEvent> {
  const [event] = await db
    .select()
    .from(schema.domainEvents)
    .where(
      and(
        eq(schema.domainEvents.domain_event_id, domainEventId),
        eq(schema.domainEvents.is_deleted, false),
      ),
    )
    .limit(1);

  if (!event) throw new NotFoundError(`Domain event not found: ${domainEventId}`);
  return event;
}

export const domainEventService = {
  async recordEvent(input: DomainEventInput, actorId?: string | number | null, tx: typeof db = db) {
    const envelope = buildDomainEventEnvelope(input);

    const [existing] = await tx
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.idempotency_key, envelope.idempotencyKey))
      .limit(1);

    if (existing) {
      const duplicateHistoryEntry = buildDomainReplayHistoryEntry({
        action: 'DUPLICATE_SEEN',
        status: existing.replay_status ?? 'NOT_REQUESTED',
        actorId,
        reason: 'Duplicate event received with matching idempotency key',
      });
      const [updated] = await tx
        .update(schema.domainEvents)
        .set({
          duplicate_count: sql`${schema.domainEvents.duplicate_count} + 1`,
          last_seen_at: new Date(),
          last_duplicate_at: new Date(),
          replay_history: appendReplayHistorySql(duplicateHistoryEntry),
          updated_by: actorText(actorId),
          updated_at: new Date(),
        } as any)
        .where(eq(schema.domainEvents.id, existing.id))
        .returning();

      await auditDomainEvent('DOMAIN_EVENT_DUPLICATE_SEEN', existing.domain_event_id, actorId, {
        idempotency_key: envelope.idempotencyKey,
        duplicate_count: Number(existing.duplicate_count ?? 0) + 1,
      });

      return { event: updated ?? existing, envelope, created: false, duplicate: true };
    }

    const [event] = await tx
      .insert(schema.domainEvents)
      .values({
        domain_event_id: envelope.domainEventId,
        event_type: envelope.eventType,
        schema_version: envelope.schemaVersion,
        aggregate_type: envelope.aggregateType,
        aggregate_id: envelope.aggregateId,
        source_system: envelope.sourceSystem,
        source_reference: envelope.sourceReference,
        idempotency_key: envelope.idempotencyKey,
        event_correlation_id: envelope.correlationId,
        causation_id: envelope.causationId,
        parent_event_id: envelope.parentEventId,
        payload_hash: envelope.payloadHash,
        event_payload: envelope.payload,
        event_status: 'RECORDED',
        replay_status: 'NOT_REQUESTED',
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        created_by: actorText(actorId),
        updated_by: actorText(actorId),
      } as any)
      .returning();

    await auditDomainEvent('DOMAIN_EVENT_RECORDED', envelope.domainEventId, actorId, {
      event_type: envelope.eventType,
      aggregate_type: envelope.aggregateType,
      aggregate_id: envelope.aggregateId,
      idempotency_key: envelope.idempotencyKey,
      payload_hash: envelope.payloadHash,
    });

    return { event, envelope, created: true, duplicate: false };
  },

  async requestReplay(domainEventId: string, reason: unknown, actorId?: string | number | null) {
    const event = await getEventByDomainId(domainEventId);
    if (event.event_status === 'FAILED' && !event.failure_reason) {
      throw new ConflictError(`Domain event ${domainEventId} is failed without failure evidence`);
    }

    const replayReason = requireReplayReason(reason);
    const replayRequestId = nextReplayRequestId();
    const now = new Date();
    const historyEntry = buildDomainReplayHistoryEntry({
      action: 'REPLAY_REQUESTED',
      status: 'REQUESTED',
      replayRequestId,
      actorId,
      reason: replayReason,
      createdAt: now,
    });

    const [request] = await db
      .insert(schema.domainEventReplayRequests)
      .values({
        replay_request_id: replayRequestId,
        domain_event_id: domainEventId,
        replay_reason: replayReason,
        replay_status: 'PENDING',
        requested_by: actorText(actorId),
        requested_at: now,
        created_by: actorText(actorId),
        updated_by: actorText(actorId),
      })
      .returning();

    await db
      .update(schema.domainEvents)
      .set({
        replay_status: 'REQUESTED',
        replay_history: appendReplayHistorySql(historyEntry),
        updated_by: actorText(actorId),
        updated_at: now,
      } as any)
      .where(eq(schema.domainEvents.domain_event_id, domainEventId));

    await auditDomainEvent('DOMAIN_EVENT_REPLAY_REQUESTED', domainEventId, actorId, {
      replay_request_id: replayRequestId,
      replay_reason: replayReason,
    });

    return request;
  },

  async markReplayStarted(replayRequestId: string, actorId?: string | number | null) {
    const [request] = await db
      .select()
      .from(schema.domainEventReplayRequests)
      .where(eq(schema.domainEventReplayRequests.replay_request_id, replayRequestId))
      .limit(1);
    if (!request) throw new NotFoundError(`Replay request not found: ${replayRequestId}`);
    if (request.replay_status !== 'PENDING') {
      throw new ConflictError(`Replay request ${replayRequestId} cannot start from ${request.replay_status}`);
    }

    const now = new Date();
    const historyEntry = buildDomainReplayHistoryEntry({
      action: 'REPLAY_STARTED',
      status: 'IN_PROGRESS',
      replayRequestId,
      actorId,
      reason: request.replay_reason,
      createdAt: now,
    });

    const [updated] = await db
      .update(schema.domainEventReplayRequests)
      .set({
        replay_status: 'IN_PROGRESS',
        started_at: now,
        attempt_count: sql`${schema.domainEventReplayRequests.attempt_count} + 1`,
        updated_by: actorText(actorId),
        updated_at: now,
      } as any)
      .where(eq(schema.domainEventReplayRequests.replay_request_id, replayRequestId))
      .returning();

    await db
      .update(schema.domainEvents)
      .set({
        replay_status: 'IN_PROGRESS',
        replay_history: appendReplayHistorySql(historyEntry),
        updated_by: actorText(actorId),
        updated_at: now,
      } as any)
      .where(eq(schema.domainEvents.domain_event_id, request.domain_event_id));

    return updated;
  },

  async completeReplay(
    replayRequestId: string,
    resultPayload: Record<string, unknown> = {},
    actorId?: string | number | null,
  ) {
    const [request] = await db
      .select()
      .from(schema.domainEventReplayRequests)
      .where(eq(schema.domainEventReplayRequests.replay_request_id, replayRequestId))
      .limit(1);
    if (!request) throw new NotFoundError(`Replay request not found: ${replayRequestId}`);

    const now = new Date();
    const historyEntry = buildDomainReplayHistoryEntry({
      action: 'REPLAY_COMPLETED',
      status: 'COMPLETED',
      replayRequestId,
      actorId,
      reason: request.replay_reason,
      resultPayload,
      createdAt: now,
    });

    const [updated] = await db
      .update(schema.domainEventReplayRequests)
      .set({
        replay_status: 'COMPLETED',
        completed_at: now,
        result_payload: resultPayload,
        updated_by: actorText(actorId),
        updated_at: now,
      } as any)
      .where(eq(schema.domainEventReplayRequests.replay_request_id, replayRequestId))
      .returning();

    await db
      .update(schema.domainEvents)
      .set({
        replay_status: 'COMPLETED',
        replay_count: sql`${schema.domainEvents.replay_count} + 1`,
        last_replayed_at: now,
        replay_history: appendReplayHistorySql(historyEntry),
        updated_by: actorText(actorId),
        updated_at: now,
      } as any)
      .where(eq(schema.domainEvents.domain_event_id, request.domain_event_id));

    await auditDomainEvent('DOMAIN_EVENT_REPLAY_COMPLETED', request.domain_event_id, actorId, {
      replay_request_id: replayRequestId,
      result_payload: resultPayload,
    });

    return updated;
  },

  async failReplay(
    replayRequestId: string,
    failureReason: string,
    actorId?: string | number | null,
  ) {
    const [request] = await db
      .select()
      .from(schema.domainEventReplayRequests)
      .where(eq(schema.domainEventReplayRequests.replay_request_id, replayRequestId))
      .limit(1);
    if (!request) throw new NotFoundError(`Replay request not found: ${replayRequestId}`);

    const now = new Date();
    const historyEntry = buildDomainReplayHistoryEntry({
      action: 'REPLAY_FAILED',
      status: 'FAILED',
      replayRequestId,
      actorId,
      reason: request.replay_reason,
      failureReason,
      createdAt: now,
    });

    const [updated] = await db
      .update(schema.domainEventReplayRequests)
      .set({
        replay_status: 'FAILED',
        completed_at: now,
        failure_reason: failureReason,
        updated_by: actorText(actorId),
        updated_at: now,
      } as any)
      .where(eq(schema.domainEventReplayRequests.replay_request_id, replayRequestId))
      .returning();

    await db
      .update(schema.domainEvents)
      .set({
        replay_status: 'FAILED',
        failure_reason: failureReason,
        replay_history: appendReplayHistorySql(historyEntry),
        updated_by: actorText(actorId),
        updated_at: now,
      } as any)
      .where(eq(schema.domainEvents.domain_event_id, request.domain_event_id));

    return updated;
  },

  async getEvent(domainEventId: string) {
    return getEventByDomainId(domainEventId);
  },

  async listEvents(filters: {
    eventType?: string;
    aggregateType?: string;
    aggregateId?: string;
    replayStatus?: string;
    limit?: number;
  } = {}) {
    const conditions = [eq(schema.domainEvents.is_deleted, false)];
    if (filters.eventType) conditions.push(eq(schema.domainEvents.event_type, filters.eventType));
    if (filters.aggregateType) conditions.push(eq(schema.domainEvents.aggregate_type, filters.aggregateType));
    if (filters.aggregateId) conditions.push(eq(schema.domainEvents.aggregate_id, filters.aggregateId));
    if (filters.replayStatus) conditions.push(eq(schema.domainEvents.replay_status, filters.replayStatus));

    return db
      .select()
      .from(schema.domainEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.domainEvents.created_at))
      .limit(Math.min(filters.limit ?? 100, 500));
  },

  async listReplayRequests(filters: { status?: string; limit?: number } = {}) {
    const conditions = [eq(schema.domainEventReplayRequests.is_deleted, false)];
    if (filters.status) conditions.push(eq(schema.domainEventReplayRequests.replay_status, filters.status));

    return db
      .select()
      .from(schema.domainEventReplayRequests)
      .where(and(...conditions))
      .orderBy(desc(schema.domainEventReplayRequests.requested_at))
      .limit(Math.min(filters.limit ?? 100, 500));
  },
};
