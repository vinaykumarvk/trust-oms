/**
 * Notification Inbox Service (CRM-NOTIF)
 *
 * Handles user-scoped in-app notifications with read/unread tracking.
 * Other services call `notify()` to create user-visible notifications.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

type CrmNotification = typeof schema.crmNotifications.$inferSelect;

export const notificationInboxService = {
  async notify(data: {
    recipient_user_id: number;
    type: string;
    title: string;
    message?: string;
    channel?: string;
    related_entity_type?: string;
    related_entity_id?: number;
  }): Promise<CrmNotification> {
    const [notification] = await db.insert(schema.crmNotifications).values({
      recipient_user_id: data.recipient_user_id,
      type: data.type as any,
      title: data.title,
      message: data.message,
      channel: (data.channel || 'IN_APP') as any,
      related_entity_type: data.related_entity_type,
      related_entity_id: data.related_entity_id,
    }).returning();

    return notification;
  },

  async notifyMultiple(userIds: number[], data: {
    type: string;
    title: string;
    message?: string;
    channel?: string;
    related_entity_type?: string;
    related_entity_id?: number;
  }): Promise<CrmNotification[]> {
    if (userIds.length === 0) return [];

    const values = userIds.map((userId) => ({
      recipient_user_id: userId,
      type: data.type as any,
      title: data.title,
      message: data.message,
      channel: (data.channel || 'IN_APP') as any,
      related_entity_type: data.related_entity_type,
      related_entity_id: data.related_entity_id,
    }));

    const notifications = await db.insert(schema.crmNotifications)
      .values(values)
      .returning();

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

  async markAsRead(notificationId: number, userId: number): Promise<CrmNotification> {
    const [updated] = await db.update(schema.crmNotifications)
      .set({
        is_read: true,
        read_at: new Date(),
      })
      .where(and(
        eq(schema.crmNotifications.id, notificationId),
        eq(schema.crmNotifications.recipient_user_id, userId),
      ))
      .returning();

    return updated;
  },

  async markAllAsRead(userId: number): Promise<void> {
    await db.update(schema.crmNotifications)
      .set({
        is_read: true,
        read_at: new Date(),
      })
      .where(and(
        eq(schema.crmNotifications.recipient_user_id, userId),
        eq(schema.crmNotifications.is_read, false),
      ));
  },
};
