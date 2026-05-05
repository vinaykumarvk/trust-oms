/**
 * Notification Inbox Service (CRM-NOTIF)
 *
 * Handles user-scoped in-app notifications with accountable lifecycle controls.
 * Other services call `notify()` to create user-visible operational alerts.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logAuditEvent } from './audit-logger';
import { NotFoundError, ValidationError } from './service-errors';
import {
  buildNotificationHistoryEntry,
  normalizeNotificationClosureEvidence,
  normalizeNotificationSeverity,
  notificationDueAt,
  type NotificationClosureEvidence,
  type NotificationGovernanceHistoryEntry,
  type NotificationLifecycleStatus,
} from './notification-governance-policy';

type CrmNotification = typeof schema.crmNotifications.$inferSelect;
type InboxChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH' | 'PAGER_DUTY';

interface NotificationAuditContext {
  actor_user_id?: number | null;
  actor_role?: string;
  ip_address?: string;
  correlation_id?: string;
  source_channel?: string;
}

interface NotificationGovernanceInput {
  severity?: string;
  owner_user_id?: number | null;
  owner_team?: string | null;
  sla_due_at?: Date | string | null;
  actor_user_id?: number | null;
  audit?: NotificationAuditContext;
}

interface NotificationInput extends NotificationGovernanceInput {
  recipient_user_id: number;
  type: string;
  title: string;
  message?: string;
  channel?: string;
  related_entity_type?: string;
  related_entity_id?: number;
}

interface NotificationBulkInput extends NotificationGovernanceInput {
  type: string;
  title: string;
  message?: string;
  channel?: string;
  related_entity_type?: string;
  related_entity_id?: number;
}

interface NotificationChannelsInput extends Omit<NotificationInput, 'channel'> {
  channels: InboxChannel[];
}

interface NotificationBulkChannelsInput extends Omit<NotificationBulkInput, 'channel'> {
  channels: InboxChannel[];
}

function auditActor(context?: NotificationAuditContext, fallbackUserId?: number | null): string | undefined {
  const actor = context?.actor_user_id ?? fallbackUserId;
  return actor == null ? undefined : String(actor);
}

function appendHistorySql(entry: NotificationGovernanceHistoryEntry) {
  return sql`coalesce(${schema.crmNotifications.governance_history}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`;
}

function buildGovernanceValues(data: NotificationGovernanceInput & { recipient_user_id: number }) {
  const severity = normalizeNotificationSeverity(data.severity);
  const ownerUserId = data.owner_user_id ?? data.recipient_user_id;
  const ownerTeam = data.owner_team ?? null;
  const dueAt = notificationDueAt(severity, new Date(), data.sla_due_at);
  const actorUserId = data.audit?.actor_user_id ?? data.actor_user_id ?? null;
  const createdEntry = buildNotificationHistoryEntry({
    action: 'CREATED',
    status: 'OPEN',
    actorUserId,
    ownerUserId,
    ownerTeam,
  });

  return {
    severity,
    lifecycle_status: 'OPEN' as NotificationLifecycleStatus,
    owner_user_id: ownerUserId,
    owner_team: ownerTeam,
    sla_due_at: dueAt,
    governance_history: [createdEntry],
    created_by: actorUserId == null ? undefined : String(actorUserId),
    updated_by: actorUserId == null ? undefined : String(actorUserId),
  };
}

async function auditNotification(
  action: string,
  notificationId: number | string,
  context: NotificationAuditContext | undefined,
  changes: Record<string, unknown>,
  fallbackUserId?: number | null,
) {
  await logAuditEvent({
    entityType: 'crm_notifications',
    entityId: String(notificationId),
    action,
    actorId: auditActor(context, fallbackUserId),
    actorRole: context?.actor_role,
    actorSource: context?.actor_user_id || fallbackUserId ? 'USER' : 'SYSTEM',
    source: {
      system: 'TRUST_OMS',
      channel: context?.source_channel ?? 'BACK_OFFICE',
      component: 'notification-inbox-service',
    },
    changes,
    ipAddress: context?.ip_address,
    correlationId: context?.correlation_id,
  });
}

function assertReason(reason: unknown, label: string): string {
  const value = typeof reason === 'string' ? reason.trim() : '';
  if (value.length < 10) throw new ValidationError(`${label} must be at least 10 characters`);
  return value;
}

export const notificationInboxService = {
  async notify(data: NotificationInput): Promise<CrmNotification> {
    const governance = buildGovernanceValues(data);
    const [notification] = await db.insert(schema.crmNotifications).values({
      recipient_user_id: data.recipient_user_id,
      type: data.type as any,
      title: data.title,
      message: data.message,
      channel: (data.channel || 'IN_APP') as any,
      related_entity_type: data.related_entity_type,
      related_entity_id: data.related_entity_id,
      ...governance,
    }).returning();

    if (notification) {
      await auditNotification('NOTIFICATION_CREATED', notification.id, data.audit, {
        recipient_user_id: data.recipient_user_id,
        type: data.type,
        channel: data.channel || 'IN_APP',
        severity: governance.severity,
        owner_user_id: governance.owner_user_id,
        owner_team: governance.owner_team,
        sla_due_at: governance.sla_due_at.toISOString(),
      }, data.actor_user_id ?? data.recipient_user_id);
    }

    return notification;
  },

  async notifyChannels(data: NotificationChannelsInput): Promise<CrmNotification[]> {
    const channels = [...new Set(data.channels)];
    if (channels.length === 0) return [];

    const values = channels.map((channel) => {
      const governance = buildGovernanceValues(data);
      return {
        recipient_user_id: data.recipient_user_id,
        type: data.type as any,
        title: data.title,
        message: data.message,
        channel: channel as any,
        related_entity_type: data.related_entity_type,
        related_entity_id: data.related_entity_id,
        ...governance,
      };
    });

    const notifications: CrmNotification[] = await db.insert(schema.crmNotifications)
      .values(values)
      .returning();

    await Promise.all(notifications.map((notification) => auditNotification(
      'NOTIFICATION_CREATED',
      notification.id,
      data.audit,
      { channel: notification.channel, severity: notification.severity, owner_user_id: notification.owner_user_id },
      data.actor_user_id ?? data.recipient_user_id,
    )));

    return notifications;
  },

  async notifyMultiple(userIds: number[], data: NotificationBulkInput): Promise<CrmNotification[]> {
    if (userIds.length === 0) return [];

    const values = userIds.map((userId) => {
      const governance = buildGovernanceValues({ ...data, recipient_user_id: userId });
      return {
        recipient_user_id: userId,
        type: data.type as any,
        title: data.title,
        message: data.message,
        channel: (data.channel || 'IN_APP') as any,
        related_entity_type: data.related_entity_type,
        related_entity_id: data.related_entity_id,
        ...governance,
      };
    });

    const notifications: CrmNotification[] = await db.insert(schema.crmNotifications)
      .values(values)
      .returning();

    await Promise.all(notifications.map((notification) => auditNotification(
      'NOTIFICATION_CREATED',
      notification.id,
      data.audit,
      { channel: notification.channel, severity: notification.severity, owner_user_id: notification.owner_user_id },
      data.actor_user_id ?? notification.recipient_user_id,
    )));

    return notifications;
  },

  async notifyMultipleChannels(userIds: number[], data: NotificationBulkChannelsInput): Promise<CrmNotification[]> {
    const channels = [...new Set(data.channels)];
    if (userIds.length === 0 || channels.length === 0) return [];

    const values = userIds.flatMap((userId) => channels.map((channel) => {
      const governance = buildGovernanceValues({ ...data, recipient_user_id: userId });
      return {
        recipient_user_id: userId,
        type: data.type as any,
        title: data.title,
        message: data.message,
        channel: channel as any,
        related_entity_type: data.related_entity_type,
        related_entity_id: data.related_entity_id,
        ...governance,
      };
    }));

    const notifications: CrmNotification[] = await db.insert(schema.crmNotifications)
      .values(values)
      .returning();

    await Promise.all(notifications.map((notification) => auditNotification(
      'NOTIFICATION_CREATED',
      notification.id,
      data.audit,
      { channel: notification.channel, severity: notification.severity, owner_user_id: notification.owner_user_id },
      data.actor_user_id ?? notification.recipient_user_id,
    )));

    return notifications;
  },

  async listForUser(userId: number, page = 1, rawPageSize = 20): Promise<{ data: CrmNotification[]; total: number; page: number; pageSize: number }> {
    const pageSize = Math.min(rawPageSize, 100);
    const offset = (page - 1) * pageSize;

    const notifications = await db.select().from(schema.crmNotifications)
      .where(eq(schema.crmNotifications.recipient_user_id, userId))
      .orderBy(desc(schema.crmNotifications.created_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count: total }] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.crmNotifications)
      .where(eq(schema.crmNotifications.recipient_user_id, userId));

    return { data: notifications, total, page, pageSize };
  },

  async getUnreadCount(userId: number): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.crmNotifications)
      .where(and(
        eq(schema.crmNotifications.recipient_user_id, userId),
        eq(schema.crmNotifications.is_read, false),
      ));

    return count;
  },

  async markAsRead(
    notificationId: number,
    userId: number,
    context?: NotificationAuditContext,
    notes?: string,
  ): Promise<CrmNotification> {
    const now = new Date();
    const history = buildNotificationHistoryEntry({
      action: 'ACKNOWLEDGED',
      status: 'ACKNOWLEDGED',
      actorUserId: userId,
      notes: notes?.trim() || 'Notification acknowledged by owner',
    });

    const [updated] = await db.update(schema.crmNotifications)
      .set({
        is_read: true,
        read_at: now,
        lifecycle_status: 'ACKNOWLEDGED',
        acknowledged_at: now,
        acknowledged_by: userId,
        governance_history: appendHistorySql(history),
        updated_by: String(userId),
        updated_at: now,
      })
      .where(and(
        eq(schema.crmNotifications.id, notificationId),
        eq(schema.crmNotifications.recipient_user_id, userId),
      ))
      .returning();

    if (!updated) throw new NotFoundError('Notification not found');

    await auditNotification('NOTIFICATION_ACKNOWLEDGED', notificationId, context, {
      lifecycle_status: 'ACKNOWLEDGED',
      acknowledged_by: userId,
      acknowledged_at: now.toISOString(),
    }, userId);

    return updated;
  },

  async acknowledge(
    notificationId: number,
    userId: number,
    data: { notes?: string; audit?: NotificationAuditContext } = {},
  ): Promise<CrmNotification> {
    return this.markAsRead(notificationId, userId, data.audit, data.notes);
  },

  async escalate(
    notificationId: number,
    actorUserId: number,
    data: {
      escalation_user_id?: number | null;
      escalation_team?: string | null;
      reason: string;
      audit?: NotificationAuditContext;
    },
  ): Promise<CrmNotification> {
    const reason = assertReason(data.reason, 'escalation reason');
    if (!data.escalation_user_id && !data.escalation_team) {
      throw new ValidationError('escalation_user_id or escalation_team is required');
    }

    const now = new Date();
    const history = buildNotificationHistoryEntry({
      action: 'ESCALATED',
      status: 'ESCALATED',
      actorUserId,
      notes: reason,
      escalationUserId: data.escalation_user_id ?? null,
      escalationTeam: data.escalation_team ?? null,
    });

    const [updated] = await db.update(schema.crmNotifications)
      .set({
        lifecycle_status: 'ESCALATED',
        escalated_at: now,
        escalated_to_user_id: data.escalation_user_id ?? null,
        escalated_to_team: data.escalation_team ?? null,
        owner_user_id: data.escalation_user_id ?? undefined,
        owner_team: data.escalation_team ?? undefined,
        governance_history: appendHistorySql(history),
        updated_by: String(actorUserId),
        updated_at: now,
      })
      .where(eq(schema.crmNotifications.id, notificationId))
      .returning();

    if (!updated) throw new NotFoundError('Notification not found');

    await auditNotification('NOTIFICATION_ESCALATED', notificationId, data.audit, {
      lifecycle_status: 'ESCALATED',
      escalated_to_user_id: data.escalation_user_id ?? null,
      escalated_to_team: data.escalation_team ?? null,
      reason,
    }, actorUserId);

    return updated;
  },

  async close(
    notificationId: number,
    actorUserId: number,
    data: {
      evidence: NotificationClosureEvidence | Record<string, unknown>;
      audit?: NotificationAuditContext;
    },
  ): Promise<CrmNotification> {
    const evidence = normalizeNotificationClosureEvidence(data.evidence);
    const evidenceRecord = evidence as unknown as Record<string, unknown>;
    const now = new Date();
    const history = buildNotificationHistoryEntry({
      action: 'CLOSED',
      status: 'CLOSED',
      actorUserId,
      notes: evidence.notes,
      evidence: evidenceRecord,
    });

    const [updated] = await db.update(schema.crmNotifications)
      .set({
        lifecycle_status: 'CLOSED',
        is_read: true,
        read_at: now,
        closed_at: now,
        closed_by: actorUserId,
        closure_evidence: evidence,
        governance_history: appendHistorySql(history),
        updated_by: String(actorUserId),
        updated_at: now,
      })
      .where(eq(schema.crmNotifications.id, notificationId))
      .returning();

    if (!updated) throw new NotFoundError('Notification not found');

    await auditNotification('NOTIFICATION_CLOSED', notificationId, data.audit, {
      lifecycle_status: 'CLOSED',
      closed_by: actorUserId,
      closure_evidence: evidence,
    }, actorUserId);

    return updated;
  },

  async markAllAsRead(userId: number, context?: NotificationAuditContext): Promise<void> {
    const now = new Date();
    const history = buildNotificationHistoryEntry({
      action: 'ACKNOWLEDGED',
      status: 'ACKNOWLEDGED',
      actorUserId: userId,
      notes: 'Bulk notification acknowledgement',
    });

    await db.update(schema.crmNotifications)
      .set({
        is_read: true,
        read_at: now,
        lifecycle_status: 'ACKNOWLEDGED',
        acknowledged_at: now,
        acknowledged_by: userId,
        governance_history: appendHistorySql(history),
        updated_by: String(userId),
        updated_at: now,
      })
      .where(and(
        eq(schema.crmNotifications.recipient_user_id, userId),
        eq(schema.crmNotifications.is_read, false),
      ));

    await auditNotification('NOTIFICATIONS_BULK_ACKNOWLEDGED', `user:${userId}`, context, {
      lifecycle_status: 'ACKNOWLEDGED',
      acknowledged_by: userId,
      acknowledged_at: now.toISOString(),
    }, userId);
  },
};
