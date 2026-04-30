import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes.ts', 'utf8');
const serviceSource = readFileSync('server/services/meeting-service.ts', 'utf8');
const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');

describe('meeting dual reminder controls', () => {
  it('uses dedicated persisted flags for 24-hour and 1-hour reminder eligibility', () => {
    expect(schemaSource).toContain("reminder_24h_sent: boolean('reminder_24h_sent').default(false).notNull()");
    expect(schemaSource).toContain("reminder_1h_sent: boolean('reminder_1h_sent').default(false).notNull()");
    expect(serviceSource).toContain('eq(schema.meetings.reminder_1h_sent, false)');
    expect(serviceSource).toContain('eq(schema.meetings.reminder_24h_sent, false)');
  });

  it('marks each reminder window with the matching persisted flag after notification', () => {
    expect(serviceSource).toContain("async markReminderSent(meetingId: number, reminderType: '1h' | '24h' | 'custom' = 'custom')");
    expect(serviceSource).toContain('updates.reminder_24h_sent = true');
    expect(serviceSource).toContain('updates.reminder_1h_sent = true');
    expect(serviceSource).toContain('updates.reminder_sent = true');
    expect(routeSource).toContain("meetingService.markReminderSent(meeting.id, '1h')");
    expect(routeSource).toContain("meetingService.markReminderSent(meeting.id, '24h')");
  });
});
