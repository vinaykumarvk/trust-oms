import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
const serviceSource = readFileSync('server/services/notification-service.ts', 'utf8');

describe('Notification preferences persistence controls', () => {
  it('defines a durable notification_preferences table with critical notification support', () => {
    expect(schemaSource).toContain("notification_preferences");
    expect(schemaSource).toContain("user_id: text('user_id').notNull()");
    expect(schemaSource).toContain("event_type: text('event_type').notNull()");
    expect(schemaSource).toContain("enabled: boolean('enabled').notNull().default(true)");
    expect(schemaSource).toContain("is_critical: boolean('is_critical').notNull().default(false)");
    expect(schemaSource).toContain('notification_preferences_user_event_channel_idx');
  });

  it('uses async DB-backed preference checks in dispatch and blocks critical opt-out', () => {
    expect(serviceSource).toContain('await this.checkConsentAsync(data.recipientId, data.channel, data.eventType)');
    expect(serviceSource).toContain('getChannelPreference');
    expect(serviceSource).toContain('updateChannelPreference');
    expect(serviceSource).toContain('Critical notifications cannot be disabled');
    expect(serviceSource).toContain('schema.notificationPreferences');
  });
});
