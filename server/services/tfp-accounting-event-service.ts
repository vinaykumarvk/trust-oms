import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import {
  TfpAccountingEventInput,
  buildTfpAccountingEventContract,
  type TfpAccountingEventContract,
} from './tfp-accounting-event-contract';
import { tfpAuditService } from './tfp-audit-service';
import { domainEventService } from './domain-event-service';

type DbLike = typeof db;

function actorText(actorId: string | number | null | undefined): string | null {
  if (actorId === null || actorId === undefined || actorId === '') return null;
  return String(actorId);
}

async function recordSharedDomainEvent(
  contract: TfpAccountingEventContract,
  actorId: string | number | null | undefined,
  tx: DbLike,
) {
  try {
    await domainEventService.recordEvent({
      eventType: contract.eventType,
      schemaVersion: contract.schemaVersion,
      aggregateType: contract.aggregateType,
      aggregateId: contract.aggregateId,
      sourceSystem: 'TRUSTFEES_PRO',
      sourceReference: `${contract.sourceTransactionType}:${contract.sourceTransactionId}`,
      idempotencyKey: contract.idempotencyKey,
      correlationId: contract.sourceEventId,
      payload: contract.payload,
    }, actorId, tx);
  } catch (err: unknown) {
    await tfpAuditService.logEvent(
      'TFP_ACCOUNTING_EVENT',
      contract.idempotencyKey,
      'DOMAIN_EVENT_LEDGER_FAILED',
      {
        event_type: contract.eventType,
        idempotency_key: contract.idempotencyKey,
        error: err instanceof Error ? err.message : String(err),
      },
      actorText(actorId),
    ).catch(() => {});
  }
}

export const tfpAccountingEventService = {
  async queueEvent(
    input: TfpAccountingEventInput,
    actorId?: string | number | null,
    tx: DbLike = db,
  ) {
    const contract = buildTfpAccountingEventContract(input);

    const [existing] = await tx
      .select()
      .from(schema.tfpAccountingEvents)
      .where(eq(schema.tfpAccountingEvents.idempotency_key, contract.idempotencyKey))
      .limit(1);

    if (existing) {
      await recordSharedDomainEvent(contract, actorId, tx);
      return { event: existing, contract, created: false };
    }

    const [event] = await tx
      .insert(schema.tfpAccountingEvents)
      .values({
        event_type: contract.eventType,
        schema_version: contract.schemaVersion,
        idempotency_key: contract.idempotencyKey,
        source_transaction_type: contract.sourceTransactionType,
        source_transaction_id: contract.sourceTransactionId,
        source_event_id: contract.sourceEventId,
        aggregate_type: contract.aggregateType,
        aggregate_id: contract.aggregateId,
        customer_id: input.customerId ?? null,
        portfolio_id: input.portfolioId ?? null,
        fee_plan_id: input.feePlanId ?? null,
        accrual_id: input.accrualId ?? null,
        invoice_id: input.invoiceId ?? null,
        amount: String(contract.amount),
        currency: contract.currency,
        accounting_date: contract.accountingDate,
        event_payload: contract.payload,
        publish_status: 'PENDING',
        acknowledgement_status: 'UNACKNOWLEDGED',
        created_by: actorText(actorId),
        updated_by: actorText(actorId),
      } as any)
      .returning();

    await recordSharedDomainEvent(contract, actorId, tx);

    await tfpAuditService.logEvent(
      'TFP_ACCOUNTING_EVENT',
      String(event?.id ?? contract.idempotencyKey),
      'ACCOUNTING_EVENT_QUEUED',
      {
        event_type: contract.eventType,
        schema_version: contract.schemaVersion,
        idempotency_key: contract.idempotencyKey,
        source_transaction_type: contract.sourceTransactionType,
        source_transaction_id: contract.sourceTransactionId,
      },
      actorText(actorId),
    );

    return { event, contract, created: true };
  },

  async acknowledgeEvent(
    eventId: number,
    input: {
      acknowledgement_status: 'ACKNOWLEDGED' | 'REJECTED' | 'FAILED';
      acknowledgement_ref?: string | null;
      acknowledgement_payload?: Record<string, unknown> | null;
      failure_reason?: string | null;
    },
    actorId?: string | number | null,
  ) {
    const publishStatus = input.acknowledgement_status === 'ACKNOWLEDGED'
      ? 'ACKNOWLEDGED'
      : 'FAILED';

    const [updated] = await db
      .update(schema.tfpAccountingEvents)
      .set({
        publish_status: publishStatus,
        acknowledgement_status: input.acknowledgement_status,
        acknowledgement_ref: input.acknowledgement_ref ?? null,
        acknowledgement_payload: input.acknowledgement_payload ?? null,
        acknowledged_at: new Date(),
        failure_reason: input.failure_reason ?? null,
        updated_by: actorText(actorId),
        updated_at: new Date(),
      } as any)
      .where(eq(schema.tfpAccountingEvents.id, eventId))
      .returning();

    return updated;
  },

  async replayEvent(eventId: number, actorId?: string | number | null) {
    const [event] = await db
      .select()
      .from(schema.tfpAccountingEvents)
      .where(eq(schema.tfpAccountingEvents.id, eventId))
      .limit(1);

    if (!event) {
      throw new Error(`TFP accounting event not found: ${eventId}`);
    }

    const [updated] = await db
      .update(schema.tfpAccountingEvents)
      .set({
        publish_status: 'PENDING',
        acknowledgement_status: 'UNACKNOWLEDGED',
        acknowledgement_ref: null,
        acknowledgement_payload: null,
        acknowledged_at: null,
        failure_reason: null,
        replay_count: Number(event.replay_count ?? 0) + 1,
        last_replayed_at: new Date(),
        updated_by: actorText(actorId),
        updated_at: new Date(),
      } as any)
      .where(eq(schema.tfpAccountingEvents.id, eventId))
      .returning();

    return updated;
  },

  async listEvents(filters?: {
    publish_status?: string;
    acknowledgement_status?: string;
    event_type?: string;
    limit?: number;
  }) {
    const conditions = [];
    if (filters?.publish_status) {
      conditions.push(eq(schema.tfpAccountingEvents.publish_status, filters.publish_status));
    }
    if (filters?.acknowledgement_status) {
      conditions.push(eq(schema.tfpAccountingEvents.acknowledgement_status, filters.acknowledgement_status));
    }
    if (filters?.event_type) {
      conditions.push(eq(schema.tfpAccountingEvents.event_type, filters.event_type));
    }

    return db
      .select()
      .from(schema.tfpAccountingEvents)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.tfpAccountingEvents.created_at))
      .limit(Math.min(filters?.limit ?? 100, 500));
  },
};
