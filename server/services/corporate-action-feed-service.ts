import { createHash } from 'crypto';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logAuditEvent } from './audit-logger';
import { corporateActionsService } from './corporate-actions-service';
import {
  parseCorporateActionFeed,
  type CorporateActionFeedFormat,
} from './corporate-action-feed-parser';
import { domainEventService } from './domain-event-service';

type RawPayload = string | Record<string, unknown> | unknown[];

interface IngestFeedMessageInput {
  sourceSystem: string;
  format: CorporateActionFeedFormat;
  payload: RawPayload;
  receivedAt?: Date;
  actorId?: string;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function payloadForJsonb(payload: RawPayload): Record<string, unknown> | unknown[] {
  return typeof payload === 'string' ? { raw: payload } : payload;
}

function buildFeedMessageId(sourceSystem: string, format: string, payloadHash: string): string {
  return `CAFEED-${sourceSystem}-${format}-${payloadHash.slice(0, 16)}`.replace(/[^A-Z0-9_-]/gi, '_');
}

async function recordCaFeedDomainEvent(input: {
  sourceSystem: string;
  format: CorporateActionFeedFormat;
  externalEventId?: string | null;
  idempotencyKey: string;
  payloadHash: string;
  payload: RawPayload;
  parseStatus: string;
  actorId?: string;
}) {
  try {
    await domainEventService.recordEvent({
      eventType: 'CORPORATE_ACTION_FEED_MESSAGE_RECEIVED',
      schemaVersion: 1,
      aggregateType: 'CORPORATE_ACTION_FEED_MESSAGE',
      aggregateId: input.externalEventId ?? input.payloadHash,
      sourceSystem: input.sourceSystem,
      sourceReference: input.externalEventId ?? `${input.format}:${input.payloadHash}`,
      idempotencyKey: input.idempotencyKey,
      payload: {
        feed_format: input.format,
        payload_hash: input.payloadHash,
        parse_status: input.parseStatus,
        raw_payload: payloadForJsonb(input.payload),
      },
    }, input.actorId);
  } catch (err: unknown) {
    await logAuditEvent({
      entityType: 'corporate_action_feed_message',
      entityId: input.externalEventId ?? input.payloadHash,
      action: 'DOMAIN_EVENT_LEDGER_FAILED',
      actorId: input.actorId,
      changes: {
        idempotency_key: input.idempotencyKey,
        error: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  }
}

export const corporateActionFeedService = {
  async ingestFeedMessage(input: IngestFeedMessageInput) {
    const payloadHash = hashPayload(input.payload);
    const parsed = parseCorporateActionFeed({
      sourceSystem: input.sourceSystem,
      format: input.format,
      payload: input.payload,
    });
    const externalEventId = parsed.normalized.externalEventId;
    const idempotencyKey = [
      input.sourceSystem,
      input.format,
      externalEventId ?? 'NO_EXTERNAL_EVENT',
      payloadHash,
    ].join('|');

    const [existing] = await db
      .select()
      .from(schema.corporateActionFeedMessages)
      .where(eq(schema.corporateActionFeedMessages.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing) {
      await recordCaFeedDomainEvent({
        sourceSystem: input.sourceSystem,
        format: input.format,
        externalEventId,
        idempotencyKey,
        payloadHash,
        payload: input.payload,
        parseStatus: existing.parse_status,
        actorId: input.actorId,
      });
      await logAuditEvent({
        entityType: 'corporate_action_feed_message',
        entityId: String(existing.id),
        action: 'DUPLICATE_REPLAY_DETECTED',
        actorId: input.actorId,
        changes: {
          idempotency_key: idempotencyKey,
          source_system: input.sourceSystem,
          feed_format: input.format,
        },
      });
      return {
        status: 'DUPLICATE',
        feedMessage: existing,
        corporateActionId: existing.corporate_action_id ?? null,
        idempotencyKey,
      };
    }

    const [feedMessage] = await db
      .insert(schema.corporateActionFeedMessages)
      .values({
        feed_message_id: buildFeedMessageId(input.sourceSystem, input.format, payloadHash),
        source_system: input.sourceSystem,
        feed_format: input.format,
        external_event_id: externalEventId,
        external_security_id: parsed.normalized.externalSecurityId,
        payload_hash: payloadHash,
        idempotency_key: idempotencyKey,
        raw_payload: payloadForJsonb(input.payload) as Record<string, unknown>,
        normalized_payload: parsed.normalized as unknown as Record<string, unknown>,
        parse_status: parsed.validationErrors.length > 0 ? 'VALIDATION_FAILED' : 'PARSED',
        validation_errors: parsed.validationErrors,
        received_at: input.receivedAt ?? new Date(),
        parsed_at: new Date(),
        created_by: input.actorId ?? null,
        updated_by: input.actorId ?? null,
      })
      .returning();

    await recordCaFeedDomainEvent({
      sourceSystem: input.sourceSystem,
      format: input.format,
      externalEventId,
      idempotencyKey,
      payloadHash,
      payload: input.payload,
      parseStatus: feedMessage.parse_status,
      actorId: input.actorId,
    });

    await logAuditEvent({
      entityType: 'corporate_action_feed_message',
      entityId: String(feedMessage.id),
      action: parsed.validationErrors.length > 0 ? 'FEED_VALIDATION_FAILED' : 'FEED_PARSED',
      actorId: input.actorId,
      changes: {
        source_system: input.sourceSystem,
        feed_format: input.format,
        external_event_id: externalEventId,
        payload_hash: payloadHash,
        validation_errors: parsed.validationErrors,
      },
    });

    if (parsed.validationErrors.length > 0) {
      return {
        status: 'VALIDATION_FAILED',
        feedMessage,
        validationErrors: parsed.validationErrors,
        idempotencyKey,
      };
    }

    const ca = await corporateActionsService.ingestCorporateAction({
      securityId: parsed.normalized.securityId!,
      type: parsed.normalized.type as (typeof schema.corporateActionTypeEnum.enumValues)[number],
      exDate: parsed.normalized.exDate!,
      recordDate: parsed.normalized.recordDate!,
      paymentDate: parsed.normalized.paymentDate ?? undefined,
      ratio: parsed.normalized.ratio ?? undefined,
      amountPerShare: parsed.normalized.amountPerShare ?? undefined,
      electionDeadline: parsed.normalized.electionDeadline ?? undefined,
      source: `${input.sourceSystem}:${input.format}`,
      calendarKey: parsed.normalized.calendarKey ?? undefined,
      eventPayload: parsed.normalized as unknown as Record<string, unknown>,
      actorId: input.actorId,
    });

    const [updatedMessage] = await db
      .update(schema.corporateActionFeedMessages)
      .set({
        parse_status: 'INGESTED',
        corporate_action_id: ca.id,
        ingested_at: new Date(),
        updated_at: new Date(),
        updated_by: input.actorId ?? null,
      })
      .where(eq(schema.corporateActionFeedMessages.id, feedMessage.id))
      .returning();

    await logAuditEvent({
      entityType: 'corporate_action_feed_message',
      entityId: String(feedMessage.id),
      action: 'FEED_INGESTED',
      actorId: input.actorId,
      changes: {
        corporate_action_id: ca.id,
        idempotency_key: idempotencyKey,
      },
    });

    return {
      status: 'INGESTED',
      feedMessage: updatedMessage,
      corporateAction: ca,
      idempotencyKey,
    };
  },

  async replayFeedMessage(id: number, actorId?: string) {
    const [feedMessage] = await db
      .select()
      .from(schema.corporateActionFeedMessages)
      .where(eq(schema.corporateActionFeedMessages.id, id))
      .limit(1);

    if (!feedMessage) {
      throw new Error(`Corporate action feed message not found: ${id}`);
    }

    if (feedMessage.corporate_action_id) {
      return {
        status: 'ALREADY_INGESTED',
        feedMessage,
        corporateActionId: feedMessage.corporate_action_id,
      };
    }

    const rawPayload = (feedMessage.raw_payload as Record<string, unknown>)?.raw
      ?? feedMessage.raw_payload as RawPayload;
    const parsed = parseCorporateActionFeed({
      sourceSystem: feedMessage.source_system,
      format: feedMessage.feed_format as CorporateActionFeedFormat,
      payload: rawPayload,
    });

    if (parsed.validationErrors.length > 0) {
      const [updated] = await db
        .update(schema.corporateActionFeedMessages)
        .set({
          parse_status: 'VALIDATION_FAILED',
          normalized_payload: parsed.normalized as unknown as Record<string, unknown>,
          validation_errors: parsed.validationErrors,
          replay_count: (feedMessage.replay_count ?? 0) + 1,
          last_replayed_at: new Date(),
          updated_at: new Date(),
          updated_by: actorId ?? null,
        })
        .where(eq(schema.corporateActionFeedMessages.id, id))
        .returning();
      return { status: 'VALIDATION_FAILED', feedMessage: updated, validationErrors: parsed.validationErrors };
    }

    const ca = await corporateActionsService.ingestCorporateAction({
      securityId: parsed.normalized.securityId!,
      type: parsed.normalized.type as (typeof schema.corporateActionTypeEnum.enumValues)[number],
      exDate: parsed.normalized.exDate!,
      recordDate: parsed.normalized.recordDate!,
      paymentDate: parsed.normalized.paymentDate ?? undefined,
      ratio: parsed.normalized.ratio ?? undefined,
      amountPerShare: parsed.normalized.amountPerShare ?? undefined,
      electionDeadline: parsed.normalized.electionDeadline ?? undefined,
      source: `${feedMessage.source_system}:${feedMessage.feed_format}:REPLAY`,
      calendarKey: parsed.normalized.calendarKey ?? undefined,
      eventPayload: parsed.normalized as unknown as Record<string, unknown>,
      actorId,
    });

    const [updated] = await db
      .update(schema.corporateActionFeedMessages)
      .set({
        parse_status: 'REPLAYED_INGESTED',
        normalized_payload: parsed.normalized as unknown as Record<string, unknown>,
        validation_errors: [],
        corporate_action_id: ca.id,
        replay_count: (feedMessage.replay_count ?? 0) + 1,
        last_replayed_at: new Date(),
        ingested_at: new Date(),
        updated_at: new Date(),
        updated_by: actorId ?? null,
      })
      .where(eq(schema.corporateActionFeedMessages.id, id))
      .returning();

    await logAuditEvent({
      entityType: 'corporate_action_feed_message',
      entityId: String(id),
      action: 'FEED_REPLAYED',
      actorId,
      changes: {
        corporate_action_id: ca.id,
        replay_count: (feedMessage.replay_count ?? 0) + 1,
      },
    });

    return { status: 'REPLAYED_INGESTED', feedMessage: updated, corporateAction: ca };
  },
};
