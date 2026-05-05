/**
 * Client Message Service (Phase 3A)
 *
 * Handles RM-to-client and client-to-RM messaging with thread support.
 * Provides list, create, mark-read, unread count, BO list, and reply operations.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ValidationError } from './service-errors';
import { notificationInboxService } from './notification-inbox-service';
import { logAuditEvent } from './audit-logger';
import { randomUUID } from 'crypto';
import { clientPortalEvidenceService, portalEvidenceContext } from './client-portal-evidence-service';

type ClientMessage = typeof schema.clientMessages.$inferSelect;

interface MessageAuditContext {
  actorId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  sourceChannel?: string | null;
  userAgent?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateBody(body: string): void {
  if (!body || body.trim().length === 0) {
    throw new ValidationError('Message body is required');
  }
  if (body.trim().length > 5000) {
    throw new ValidationError('Message body must not exceed 5000 characters');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const clientMessageService = {
  /**
   * Create a new message (client→RM, RM→client, or SYSTEM→client).
   * Generates thread_id if this is a new thread (no parent, no thread provided).
   */
  async create(data: {
    sender_id: number;
    sender_type: 'RM' | 'CLIENT' | 'SYSTEM';
    recipient_client_id: string;
    subject?: string;
    body: string;
    thread_id?: string | null;
    parent_message_id?: number | null;
    related_sr_id?: number | null;
    audit?: MessageAuditContext;
  }): Promise<ClientMessage> {
    validateBody(data.body);

    // If no thread_id and no parent, this is a new thread — subject is required
    const isNewThread = !data.thread_id && !data.parent_message_id;
    if (isNewThread && (!data.subject || data.subject.trim().length === 0)) {
      throw new ValidationError('Subject is required when starting a new message thread');
    }

    let threadId = data.thread_id ?? null;

    // If replying with a parent but no explicit thread_id, inherit from parent
    if (data.parent_message_id) {
      const [parent] = await db
        .select({
          thread_id: schema.clientMessages.thread_id,
          recipient_client_id: schema.clientMessages.recipient_client_id,
        })
        .from(schema.clientMessages)
        .where(
          and(
            eq(schema.clientMessages.id, data.parent_message_id),
            eq(schema.clientMessages.is_deleted, false),
          ),
        )
        .limit(1);

      if (!parent) {
        throw new NotFoundError('Parent message not found');
      }

      if (parent.recipient_client_id !== data.recipient_client_id) {
        throw new ForbiddenError('Access denied');
      }

      if (parent?.thread_id) {
        threadId = parent.thread_id;
      }
    } else if (threadId) {
      const [thread] = await db
        .select({ recipient_client_id: schema.clientMessages.recipient_client_id })
        .from(schema.clientMessages)
        .where(
          and(
            eq(schema.clientMessages.thread_id, threadId),
            eq(schema.clientMessages.is_deleted, false),
          ),
        )
        .limit(1);

      if (!thread) {
        throw new ValidationError('Thread not found');
      }

      if (thread.recipient_client_id !== data.recipient_client_id) {
        throw new ForbiddenError('Access denied');
      }
    }

    if (data.related_sr_id) {
      const [sr] = await db
        .select({ client_id: schema.serviceRequests.client_id })
        .from(schema.serviceRequests)
        .where(
          and(
            eq(schema.serviceRequests.id, data.related_sr_id),
            eq(schema.serviceRequests.is_deleted, false),
          ),
        )
        .limit(1);

      if (!sr) {
        throw new ValidationError('Related service request not found');
      }

      if (sr.client_id !== data.recipient_client_id) {
        throw new ForbiddenError('Access denied');
      }
    }

    // Generate a thread_id for new threads
    if (!threadId) {
      threadId = `thr-${randomUUID()}`;
    }

    const actorId = data.audit?.actorId ?? String(data.sender_id);
    const [message] = await db
      .insert(schema.clientMessages)
      .values({
        sender_id: data.sender_id,
        sender_type: data.sender_type,
        recipient_client_id: data.recipient_client_id,
        subject: data.subject ?? null,
        body: data.body.trim(),
        thread_id: threadId,
        parent_message_id: data.parent_message_id ?? null,
        related_sr_id: data.related_sr_id ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .returning();

    await logAuditEvent({
      entityType: 'client_message',
      entityId: String(message.id),
      action: 'CLIENT_MESSAGE_CREATED',
      actorId,
      actorRole: data.audit?.actorRole ?? data.sender_type,
      ipAddress: data.audit?.ipAddress ?? undefined,
      correlationId: data.audit?.correlationId ?? undefined,
      changes: {
        sender_type: data.sender_type,
        recipient_client_id: data.recipient_client_id,
        thread_id: threadId,
        parent_message_id: data.parent_message_id ?? null,
        related_sr_id: data.related_sr_id ?? null,
      },
      metadata: {
        source_channel: data.audit?.sourceChannel ?? 'CLIENT_PORTAL',
      },
    });

    await clientPortalEvidenceService.recordMessageEvent(
      message,
      'MESSAGE_SENT',
      portalEvidenceContext(data.audit),
    ).catch(() => {});

    return message;
  },

  /**
   * List messages for a specific client (client portal view).
   * Returns paginated messages sorted by sent_at DESC, plus unread count.
   */
  async listForClient(
    clientId: string,
    filters: { page?: number; pageSize?: number },
  ): Promise<{ data: ClientMessage[]; total: number; unread_count: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const data = await db
      .select()
      .from(schema.clientMessages)
      .where(
        and(
          eq(schema.clientMessages.recipient_client_id, clientId),
          eq(schema.clientMessages.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.clientMessages.sent_at))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.clientMessages)
      .where(
        and(
          eq(schema.clientMessages.recipient_client_id, clientId),
          eq(schema.clientMessages.is_deleted, false),
        ),
      );

    const unread_count = await clientMessageService.getUnreadCount(clientId);

    return { data, total, unread_count };
  },

  /**
   * Mark a message as read. IDOR-safe: verifies the message belongs to the client.
   * Idempotent — no-op if already read.
   */
  async markRead(messageId: number, clientId: string, audit?: MessageAuditContext): Promise<void> {
    const [message] = await db
      .select()
      .from(schema.clientMessages)
      .where(
        and(
          eq(schema.clientMessages.id, messageId),
          eq(schema.clientMessages.is_deleted, false),
        ),
      )
      .limit(1);

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.recipient_client_id !== clientId) {
      throw new ForbiddenError('Access denied');
    }

    // Idempotent — only update if not already read
    const actorId = audit?.actorId ?? clientId;
    if (!message.is_read) {
      await db
        .update(schema.clientMessages)
        .set({ is_read: true, read_at: new Date(), updated_at: new Date(), updated_by: actorId })
        .where(eq(schema.clientMessages.id, messageId));
    }

    await logAuditEvent({
      entityType: 'client_message',
      entityId: String(messageId),
      action: 'CLIENT_MESSAGE_READ',
      actorId,
      actorRole: audit?.actorRole ?? 'CLIENT',
      ipAddress: audit?.ipAddress ?? undefined,
      correlationId: audit?.correlationId ?? undefined,
      metadata: {
        recipient_client_id: clientId,
        was_already_read: Boolean(message.is_read),
        source_channel: audit?.sourceChannel ?? 'CLIENT_PORTAL',
      },
    });

    await clientPortalEvidenceService.recordMessageEvent(
      message,
      'MESSAGE_READ',
      portalEvidenceContext(audit),
    ).catch(() => {});
  },

  /**
   * Return the unread message count for a given client.
   */
  async getUnreadCount(clientId: string): Promise<number> {
    const [{ cnt }] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(schema.clientMessages)
      .where(
        and(
          eq(schema.clientMessages.recipient_client_id, clientId),
          eq(schema.clientMessages.is_read, false),
          eq(schema.clientMessages.is_deleted, false),
        ),
      );

    return cnt;
  },

  /**
   * Back-office view: list all messages with optional filters.
   * No client-scoping restriction — BO sees all messages.
   */
  async listAllForBO(filters: {
    client_id?: string;
    is_read?: boolean;
    sender_type?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: ClientMessage[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.clientMessages.is_deleted, false)];

    if (filters.client_id) {
      conditions.push(eq(schema.clientMessages.recipient_client_id, filters.client_id));
    }

    if (filters.is_read !== undefined) {
      conditions.push(eq(schema.clientMessages.is_read, filters.is_read));
    }

    if (filters.sender_type) {
      conditions.push(
        eq(schema.clientMessages.sender_type, filters.sender_type as 'RM' | 'CLIENT' | 'SYSTEM'),
      );
    }

    if (filters.date_from) {
      const fromDate = new Date(filters.date_from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(schema.clientMessages.sent_at, fromDate));
      }
    }

    if (filters.date_to) {
      const toDate = new Date(filters.date_to);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(schema.clientMessages.sent_at, toDate));
      }
    }

    const where = and(...conditions);

    const data = await db
      .select()
      .from(schema.clientMessages)
      .where(where)
      .orderBy(desc(schema.clientMessages.sent_at))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.clientMessages)
      .where(where);

    return { data, total };
  },

  /**
   * RM replies to an existing message.
   * Inherits thread_id and recipient_client_id from the parent message.
   * Triggers an in-app notification for the RM who owns the parent's client.
   */
  async reply(
    parentMessageId: number,
    senderId: number,
    body: string,
    audit?: MessageAuditContext,
  ): Promise<ClientMessage> {
    validateBody(body);

    const [parent] = await db
      .select()
      .from(schema.clientMessages)
      .where(
        and(
          eq(schema.clientMessages.id, parentMessageId),
          eq(schema.clientMessages.is_deleted, false),
        ),
      )
      .limit(1);

    if (!parent) {
      throw new NotFoundError('Parent message not found');
    }

    const actorId = audit?.actorId ?? String(senderId);
    const [reply] = await db
      .insert(schema.clientMessages)
      .values({
        sender_id: senderId,
        sender_type: 'RM',
        recipient_client_id: parent.recipient_client_id,
        subject: parent.subject ? `Re: ${parent.subject}` : null,
        body: body.trim(),
        thread_id: parent.thread_id,
        parent_message_id: parentMessageId,
        related_sr_id: parent.related_sr_id ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .returning();

    await logAuditEvent({
      entityType: 'client_message',
      entityId: String(reply.id),
      action: 'CLIENT_MESSAGE_REPLIED',
      actorId,
      actorRole: audit?.actorRole ?? 'RM',
      ipAddress: audit?.ipAddress ?? undefined,
      correlationId: audit?.correlationId ?? undefined,
      changes: {
        recipient_client_id: parent.recipient_client_id,
        thread_id: parent.thread_id,
        parent_message_id: parentMessageId,
        related_sr_id: parent.related_sr_id ?? null,
      },
      metadata: {
        source_channel: audit?.sourceChannel ?? 'BACK_OFFICE',
      },
    });

    // Notify the client that they have a new message reply — fire-and-forget
    // Look up the portal user for this client to send notification
    const [portalUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.client_id, parent.recipient_client_id))
      .limit(1);

    if (portalUser) {
      notificationInboxService.notify({
        recipient_user_id: portalUser.id,
        type: 'MESSAGE',
        title: 'New Message from Your Relationship Manager',
        message: `You have received a reply to your message (ID: ${parentMessageId}).`,
        related_entity_type: 'CLIENT_MESSAGE',
        related_entity_id: reply.id,
      }).catch(() => {
        // Non-critical — swallow notification errors
      });
    }

    return reply;
  },
};
