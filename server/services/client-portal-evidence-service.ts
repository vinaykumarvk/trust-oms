import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { logAuditEvent } from './audit-logger';
import {
  buildPortalEvidenceEnvelope,
  type PortalEvidenceInput,
} from './client-portal-evidence-policy';

interface PortalEvidenceAuditContext {
  actorId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  sourceChannel?: string | null;
}

type ClientMessage = typeof schema.clientMessages.$inferSelect;
type ClientStatement = typeof schema.clientStatements.$inferSelect;

function actorText(context?: PortalEvidenceAuditContext): string | null {
  return context?.actorId ?? null;
}

export const clientPortalEvidenceService = {
  async recordEvent(input: PortalEvidenceInput) {
    const envelope = buildPortalEvidenceEnvelope(input);
    const [existing] = await db
      .select()
      .from(schema.clientPortalEvidenceEvents)
      .where(eq(schema.clientPortalEvidenceEvents.evidence_event_id, envelope.evidenceEventId))
      .limit(1);

    if (existing) return existing;

    const [event] = await db
      .insert(schema.clientPortalEvidenceEvents)
      .values({
        evidence_event_id: envelope.evidenceEventId,
        client_id: envelope.clientId,
        portal_user_id: envelope.portalUserId,
        event_type: envelope.eventType,
        action: envelope.action,
        source_channel: envelope.sourceChannel,
        source_entity_type: envelope.sourceEntityType,
        source_entity_id: envelope.sourceEntityId,
        source_entity_ref: envelope.sourceEntityRef,
        direction: envelope.direction,
        event_status: envelope.eventStatus,
        notification_status: envelope.notificationStatus,
        content_hash: envelope.contentHash,
        evidence_payload: envelope.evidencePayload,
        notification_payload: envelope.notificationPayload,
        ip_address: envelope.ipAddress,
        user_agent: envelope.userAgent,
        correlation_id: envelope.correlationId,
        occurred_at: envelope.occurredAt,
        created_by: envelope.portalUserId,
        updated_by: envelope.portalUserId,
      })
      .returning();

    await logAuditEvent({
      entityType: 'client_portal_evidence_event',
      entityId: envelope.evidenceEventId,
      action: 'CLIENT_PORTAL_EVIDENCE_RECORDED',
      actorId: envelope.portalUserId ?? undefined,
      actorRole: 'CLIENT_PORTAL',
      ipAddress: envelope.ipAddress ?? undefined,
      correlationId: envelope.correlationId ?? undefined,
      changes: {
        client_id: envelope.clientId,
        event_type: envelope.eventType,
        action: envelope.action,
        source_entity_type: envelope.sourceEntityType,
        source_entity_id: envelope.sourceEntityId,
      },
    });

    return event;
  },

  async recordMessageEvent(
    message: ClientMessage,
    action: 'MESSAGE_SENT' | 'MESSAGE_READ',
    context?: PortalEvidenceAuditContext,
  ) {
    return this.recordEvent({
      clientId: message.recipient_client_id,
      portalUserId: context?.actorId ?? message.sender_id,
      eventType: action,
      action,
      sourceChannel: context?.sourceChannel ?? 'CLIENT_PORTAL',
      sourceEntityType: 'CLIENT_MESSAGE',
      sourceEntityId: message.id,
      sourceEntityRef: message.thread_id,
      direction: message.sender_type === 'CLIENT' ? 'OUTBOUND' : 'INBOUND',
      eventStatus: message.is_read || action === 'MESSAGE_READ' ? 'READ' : 'SENT',
      evidencePayload: {
        thread_id: message.thread_id,
        sender_type: message.sender_type,
        subject: message.subject,
        related_sr_id: message.related_sr_id,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      correlationId: context?.correlationId,
      occurredAt: action === 'MESSAGE_READ' ? (message.read_at ?? new Date()) : message.sent_at,
    });
  },

  async recordStatementDownload(
    statement: ClientStatement,
    input: {
      contentHash: string;
      retentionUntil: string;
      fileSizeBytes: number;
    },
    context?: PortalEvidenceAuditContext,
  ) {
    return this.recordEvent({
      clientId: statement.client_id,
      portalUserId: context?.actorId,
      eventType: 'STATEMENT_DOWNLOADED',
      action: 'DOWNLOAD',
      sourceChannel: context?.sourceChannel ?? 'CLIENT_PORTAL',
      sourceEntityType: 'CLIENT_STATEMENT',
      sourceEntityId: statement.id,
      sourceEntityRef: statement.period,
      direction: 'OUTBOUND',
      eventStatus: 'DELIVERED',
      contentHash: input.contentHash,
      evidencePayload: {
        statement_type: statement.statement_type,
        period: statement.period,
        file_reference: statement.file_reference,
        file_size_bytes: input.fileSizeBytes,
        retention_policy: statement.retention_policy,
        retention_until: input.retentionUntil,
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      correlationId: context?.correlationId,
    });
  },

  async recordNotificationEvent(input: {
    clientId: string;
    notificationId: number | string;
    eventType?: string | null;
    channel?: string | null;
    notificationStatus?: string | null;
    sentAt?: Date | null;
    deliveredAt?: Date | null;
  }) {
    return this.recordEvent({
      clientId: input.clientId,
      eventType: 'PORTAL_NOTIFICATION',
      action: 'NOTIFICATION_DELIVERED',
      sourceChannel: input.channel ?? 'IN_APP',
      sourceEntityType: 'NOTIFICATION_LOG',
      sourceEntityId: input.notificationId,
      direction: 'INBOUND',
      eventStatus: input.notificationStatus ?? 'SENT',
      notificationStatus: input.notificationStatus,
      notificationPayload: {
        event_type: input.eventType ?? null,
        channel: input.channel ?? null,
        sent_at: input.sentAt?.toISOString() ?? null,
        delivered_at: input.deliveredAt?.toISOString() ?? null,
      },
      occurredAt: input.deliveredAt ?? input.sentAt ?? new Date(),
    });
  },

  async listForClient(
    clientId: string,
    filters: { eventType?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
    const conditions = [
      eq(schema.clientPortalEvidenceEvents.client_id, clientId),
    ];
    if (filters.eventType) {
      conditions.push(eq(schema.clientPortalEvidenceEvents.event_type, filters.eventType));
    }

    const data = await db
      .select()
      .from(schema.clientPortalEvidenceEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.clientPortalEvidenceEvents.occurred_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, page, pageSize };
  },
};

export function portalEvidenceContext(context?: PortalEvidenceAuditContext): PortalEvidenceAuditContext {
  return {
    actorId: actorText(context),
    actorRole: context?.actorRole ?? 'CLIENT_PORTAL',
    ipAddress: context?.ipAddress ?? null,
    userAgent: context?.userAgent ?? null,
    correlationId: context?.correlationId ?? null,
    sourceChannel: context?.sourceChannel ?? 'CLIENT_PORTAL',
  };
}
