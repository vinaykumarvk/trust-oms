import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RETRY' | 'DLQ';

interface NotificationPayload {
  event_type: string;
  channel: NotificationChannel;
  recipient_id: string;
  recipient_type: string;
  content: string;
}

interface DispatchInput {
  eventType: string;
  channel: NotificationChannel;
  recipientId: string;
  recipientType: string;
  content: string;
}

interface NotificationFilters {
  channel?: NotificationChannel;
  status?: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

interface UserPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
}

// ---------------------------------------------------------------------------
// PII keywords that must never appear in SMS content
// ---------------------------------------------------------------------------

const PII_KEYWORDS = ['ssn', 'social security', 'passport', 'password', 'secret', 'credit card', 'card number'];

// ---------------------------------------------------------------------------
// Regulatory event types (always bypass consent check)
// ---------------------------------------------------------------------------

const REGULATORY_EVENTS = [
  'ORDER_LIFECYCLE',
  'MANDATE_BREACH',
  'KYC_EXPIRY',
  'KILL_SWITCH',
  'BSP_REPORT',
];

// ---------------------------------------------------------------------------
// In-memory stores (stubs for preferences and retry tracking)
// ---------------------------------------------------------------------------

const preferencesStore = new Map<string, UserPreferences>();
const retryCountStore = new Map<number, number>();
/** Maps notification id -> original content for re-dispatch on retry */
const contentStore = new Map<number, string>();

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const notificationService = {
  // ==========================================================================
  // Phase 1 (unchanged) — low-level send & order event helper
  // ==========================================================================

  /** Send a notification (in-app only for Phase 1; email/SMS in later phase) */
  async send(payload: NotificationPayload) {
    const contentHash = Buffer.from(payload.content).toString('base64').substring(0, 64);

    const [log] = await db.insert(schema.notificationLog).values({
      event_type: payload.event_type,
      channel: payload.channel,
      recipient_id: payload.recipient_id,
      recipient_type: payload.recipient_type,
      content_hash: contentHash,
      sent_at: new Date(),
      notification_status: 'SENT',
    }).returning();

    return log;
  },

  /** Emit order state transition events */
  async emitOrderEvent(orderId: string, event: string, actorId: string) {
    // In-app notification only for Phase 1
    await this.send({
      event_type: `order.${event}`,
      channel: 'IN_APP',
      recipient_id: actorId,
      recipient_type: 'user',
      content: `Order ${orderId}: ${event}`,
    });
  },

  // ==========================================================================
  // Phase 5D — Multi-channel dispatch
  // ==========================================================================

  /**
   * Dispatch a notification through the requested channel.
   *
   * 1. Consent is verified (regulatory events always send).
   * 2. A PENDING record is created in notification_log.
   * 3. Channel-specific SLA simulation marks the record as SENT / DELIVERED.
   */
  async dispatch(data: DispatchInput) {
    // --- Consent gate ---
    const allowed = await this.checkConsentAsync(data.recipientId, data.channel, data.eventType);
    if (!allowed) {
      return { skipped: true, reason: 'consent_denied', channel: data.channel };
    }

    const contentHash = Buffer.from(data.content).toString('base64').substring(0, 64);

    // --- Insert as PENDING ---
    const [record] = await db.insert(schema.notificationLog).values({
      event_type: data.eventType,
      channel: data.channel,
      recipient_id: data.recipientId,
      recipient_type: data.recipientType,
      content_hash: contentHash,
      sent_at: new Date(),
      notification_status: 'PENDING' as string,
    }).returning();

    // Stash content for potential retries
    contentStore.set(record.id, data.content);

    // --- Channel-specific delivery simulation ---
    return this._simulateDelivery(record, data);
  },

  /**
   * Simulate channel-specific delivery and SLA timing.
   * Updates the DB record status accordingly.
   */
  async _simulateDelivery(
    record: typeof schema.notificationLog.$inferSelect,
    data: DispatchInput,
  ) {
    const { channel, content } = data;

    try {
      switch (channel) {
        // IN_APP — immediate delivery (SLA <=2 s)
        case 'IN_APP': {
          const [updated] = await db.update(schema.notificationLog)
            .set({ notification_status: 'DELIVERED', delivered_at: new Date() })
            .where(eq(schema.notificationLog.id, record.id))
            .returning();
          return updated;
        }

        // PUSH — mark SENT, then DELIVERED after simulated delay (SLA <=10 s)
        case 'PUSH': {
          await db.update(schema.notificationLog)
            .set({ notification_status: 'SENT' })
            .where(eq(schema.notificationLog.id, record.id));

          // Non-blocking: schedule delivered update after a short delay
          setTimeout(async () => {
            try {
              await db.update(schema.notificationLog)
                .set({ notification_status: 'DELIVERED', delivered_at: new Date() })
                .where(eq(schema.notificationLog.id, record.id));
            } catch { /* best-effort */ }
          }, 2_000);

          const [sent] = await db.select()
            .from(schema.notificationLog)
            .where(eq(schema.notificationLog.id, record.id));
          return sent;
        }

        // EMAIL — mark SENT (SLA <=5 min, delivery confirmed externally)
        case 'EMAIL': {
          const [updated] = await db.update(schema.notificationLog)
            .set({ notification_status: 'SENT' })
            .where(eq(schema.notificationLog.id, record.id))
            .returning();
          return updated;
        }

        // SMS — validate content (<=160 chars, no PII), then mark SENT (SLA <=30 s)
        case 'SMS': {
          if (content.length > 160) {
            await db.update(schema.notificationLog)
              .set({ notification_status: 'FAILED' })
              .where(eq(schema.notificationLog.id, record.id));
            return { ...record, notification_status: 'FAILED', error: 'SMS content exceeds 160 characters' };
          }

          const lower = content.toLowerCase();
          const hasPII = PII_KEYWORDS.some((kw) => lower.includes(kw));
          if (hasPII) {
            await db.update(schema.notificationLog)
              .set({ notification_status: 'FAILED' })
              .where(eq(schema.notificationLog.id, record.id));
            return { ...record, notification_status: 'FAILED', error: 'SMS content contains PII keywords' };
          }

          const [updated] = await db.update(schema.notificationLog)
            .set({ notification_status: 'SENT' })
            .where(eq(schema.notificationLog.id, record.id))
            .returning();
          return updated;
        }

        default: {
          await db.update(schema.notificationLog)
            .set({ notification_status: 'FAILED' })
            .where(eq(schema.notificationLog.id, record.id));
          return { ...record, notification_status: 'FAILED', error: `Unsupported channel: ${channel}` };
        }
      }
    } catch (err) {
      await db.update(schema.notificationLog)
        .set({ notification_status: 'FAILED' })
        .where(eq(schema.notificationLog.id, record.id));
      return { ...record, notification_status: 'FAILED', error: err instanceof Error ? err.message : String(err) };
    }
  },

  // ==========================================================================
  // Batch dispatch
  // ==========================================================================

  /** Dispatch multiple notifications in one call. */
  async dispatchBatch(notifications: DispatchInput[]) {
    const results = await Promise.allSettled(
      notifications.map((n) => this.dispatch(n)),
    );
    return results.map((r) =>
      r.status === 'fulfilled' ? r.value : { error: (r as PromiseRejectedResult).reason?.message },
    );
  },

  // ==========================================================================
  // Retry failed
  // ==========================================================================

  /**
   * Find FAILED notifications with retry_count < 3 and re-dispatch.
   * After 3 failures mark as DLQ (dead-letter queue).
   */
  async retryFailed() {
    const failed = await db.select()
      .from(schema.notificationLog)
      .where(eq(schema.notificationLog.notification_status, 'FAILED'));

    const results: Array<{ id: number; outcome: string }> = [];

    for (const item of failed) {
      const retries = retryCountStore.get(item.id) ?? 0;

      if (retries >= 3) {
        // Mark as DLQ — no more retries
        await db.update(schema.notificationLog)
          .set({ notification_status: 'DLQ' })
          .where(eq(schema.notificationLog.id, item.id));
        results.push({ id: item.id, outcome: 'DLQ' });
        continue;
      }

      // Bump retry counter
      retryCountStore.set(item.id, retries + 1);

      // Mark as RETRY before re-dispatch
      await db.update(schema.notificationLog)
        .set({ notification_status: 'RETRY' })
        .where(eq(schema.notificationLog.id, item.id));

      // Attempt re-dispatch — reuse original content if cached
      const originalContent = contentStore.get(item.id) ?? '';
      try {
        const dispatched = await this.dispatch({
          eventType: item.event_type ?? '',
          channel: (item.channel ?? 'IN_APP') as NotificationChannel,
          recipientId: item.recipient_id ?? '',
          recipientType: item.recipient_type ?? '',
          content: originalContent,
        });
        results.push({
          id: item.id,
          outcome: (dispatched as any)?.notification_status ?? 'RETRIED',
        });
      } catch {
        results.push({ id: item.id, outcome: 'RETRY_FAILED' });
      }
    }

    return { processed: results.length, results };
  },

  // ==========================================================================
  // Notification queries
  // ==========================================================================

  /** Get a single notification by id. */
  async getById(id: number) {
    const [row] = await db.select()
      .from(schema.notificationLog)
      .where(eq(schema.notificationLog.id, id));
    return row ?? null;
  },

  /** Get paginated notifications for a recipient with optional filters. */
  async getNotifications(recipientId: string, filters: NotificationFilters = {}) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.notificationLog.recipient_id, recipientId)];

    if (filters.channel) {
      conditions.push(eq(schema.notificationLog.channel, filters.channel));
    }
    if (filters.status) {
      conditions.push(eq(schema.notificationLog.notification_status, filters.status));
    }
    if (filters.unreadOnly) {
      // "unread" = anything that is not explicitly 'READ'
      conditions.push(sql`${schema.notificationLog.notification_status} != 'READ'`);
    }

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const data = await db.select()
      .from(schema.notificationLog)
      .where(where!)
      .orderBy(desc(schema.notificationLog.sent_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.notificationLog)
      .where(where!);

    return { data, total: Number(count), page, pageSize };
  },

  // ==========================================================================
  // Mark as read
  // ==========================================================================

  /** Mark a notification as read. */
  async markAsRead(notificationId: number) {
    const [updated] = await db.update(schema.notificationLog)
      .set({ notification_status: 'READ', delivered_at: new Date() })
      .where(eq(schema.notificationLog.id, notificationId))
      .returning();
    return updated ?? null;
  },

  // ==========================================================================
  // Preferences (stub — stored in-memory)
  // ==========================================================================

  /** Get notification preferences for a user (stub: defaults). */
  getPreferences(userId: string): UserPreferences {
    return preferencesStore.get(userId) ?? { email: true, sms: true, push: true, inApp: true };
  },

  /** Update notification preferences for a user (stub: in-memory). */
  updatePreferences(userId: string, prefs: Partial<UserPreferences>): UserPreferences {
    const current = this.getPreferences(userId);
    const merged = { ...current, ...prefs };
    preferencesStore.set(userId, merged);
    return merged;
  },

  /**
   * Get a persisted channel preference for one event.
   * Missing rows default to enabled and non-critical, matching legacy behavior.
   */
  async getChannelPreference(userId: string, eventType: string, channel: NotificationChannel) {
    const [row] = await db.select()
      .from(schema.notificationPreferences)
      .where(and(
        eq(schema.notificationPreferences.user_id, userId),
        eq(schema.notificationPreferences.event_type, eventType),
        eq(schema.notificationPreferences.channel, channel),
      ))
      .limit(1);

    return row ?? {
      user_id: userId,
      event_type: eventType,
      channel,
      enabled: true,
      is_critical: REGULATORY_EVENTS.includes(eventType),
    };
  },

  /**
   * Persist a single event/channel preference. Critical notifications cannot
   * be disabled, which enforces the BRD requirement at the service layer.
   */
  async updateChannelPreference(
    userId: string,
    eventType: string,
    channel: NotificationChannel,
    enabled: boolean,
    options: { isCritical?: boolean } = {},
  ) {
    const existing = await this.getChannelPreference(userId, eventType, channel);
    const isCritical = Boolean(options.isCritical ?? existing.is_critical ?? REGULATORY_EVENTS.includes(eventType));

    if (isCritical && !enabled) {
      throw new Error('Critical notifications cannot be disabled');
    }

    const [current] = await db.select()
      .from(schema.notificationPreferences)
      .where(and(
        eq(schema.notificationPreferences.user_id, userId),
        eq(schema.notificationPreferences.event_type, eventType),
        eq(schema.notificationPreferences.channel, channel),
      ))
      .limit(1);

    if (current) {
      const [updated] = await db.update(schema.notificationPreferences)
        .set({
          enabled,
          is_critical: isCritical,
          updated_at: new Date(),
        })
        .where(eq(schema.notificationPreferences.id, current.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(schema.notificationPreferences)
      .values({
        user_id: userId,
        event_type: eventType,
        channel,
        enabled,
        is_critical: isCritical,
      })
      .returning();
    return created;
  },

  // ==========================================================================
  // Consent check
  // ==========================================================================

  /**
   * Check whether the recipient has consented to receive notifications
   * on the given channel for the given event type.
   *
   * Regulatory events (ORDER_LIFECYCLE, MANDATE_BREACH, KYC_EXPIRY,
   * KILL_SWITCH, BSP_REPORT) always return true.
   *
   * For other events, returns the corresponding preference flag.
   */
  checkConsent(recipientId: string, channel: string, eventType: string): boolean {
    // Regulatory events are mandatory — always send
    if (REGULATORY_EVENTS.includes(eventType)) {
      return true;
    }

    const prefs = this.getPreferences(recipientId);

    switch (channel) {
      case 'EMAIL': return prefs.email;
      case 'SMS': return prefs.sms;
      case 'PUSH': return prefs.push;
      case 'IN_APP': return prefs.inApp;
      default: return true;
    }
  },

  /**
   * Async consent check backed by notification_preferences. Dispatch uses this
   * path; the synchronous checkConsent remains for legacy callers and tests.
   */
  async checkConsentAsync(recipientId: string, channel: NotificationChannel, eventType: string): Promise<boolean> {
    if (REGULATORY_EVENTS.includes(eventType)) {
      return true;
    }

    try {
      const pref = await this.getChannelPreference(recipientId, eventType, channel);
      if (pref.is_critical) return true;
      return pref.enabled !== false;
    } catch {
      return this.checkConsent(recipientId, channel, eventType);
    }
  },
};
