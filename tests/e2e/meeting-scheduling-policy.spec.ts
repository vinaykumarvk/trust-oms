import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  evaluateMeetingScheduling,
  meetingWindowsOverlap,
  validateMeetingSchedulingWindow,
} from '../../server/services/meeting-scheduling-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-C-002 meeting scheduling conflicts and market-holiday warnings', () => {
  it('detects organizer and relationship overlaps as persisted warning evidence', () => {
    const evaluation = evaluateMeetingScheduling({
      candidate: {
        organizerUserId: 10,
        clientId: 'C-100',
        startTime: '2026-06-10T02:00:00.000Z',
        endTime: '2026-06-10T03:00:00.000Z',
      },
      existingMeetings: [
        {
          id: 1,
          title: 'Portfolio Review',
          organizerUserId: 10,
          clientId: 'C-200',
          startTime: '2026-06-10T02:30:00.000Z',
          endTime: '2026-06-10T03:30:00.000Z',
          status: 'SCHEDULED',
        },
        {
          id: 2,
          title: 'Trust Review',
          organizerUserId: 20,
          clientId: 'C-100',
          startTime: '2026-06-10T02:15:00.000Z',
          endTime: '2026-06-10T02:45:00.000Z',
          status: 'SCHEDULED',
        },
      ],
      calendarKey: 'PSE',
      meetingDate: '2026-06-10',
      isBusinessDay: true,
    });

    expect(evaluation.validationStatus).toBe('WARNING');
    expect(evaluation.conflictStatus).toBe('WARNING');
    expect(evaluation.conflicts.map((conflict) => conflict.conflict_type)).toEqual([
      'ORGANIZER_OVERLAP',
      'CLIENT_OVERLAP',
    ]);
  });

  it('warns when a meeting falls on a configured market non-business day', () => {
    const evaluation = evaluateMeetingScheduling({
      candidate: {
        organizerUserId: 10,
        startTime: '2026-06-12T02:00:00.000Z',
        endTime: '2026-06-12T03:00:00.000Z',
      },
      existingMeetings: [],
      calendarKey: 'pse',
      meetingDate: '2026-06-12',
      isBusinessDay: false,
      holidayName: 'Independence Day',
    });

    expect(evaluation.validationStatus).toBe('WARNING');
    expect(evaluation.marketHolidayWarning).toBe(true);
    expect(evaluation.marketHolidayName).toBe('Independence Day');
    expect(evaluation.warnings[0]).toMatchObject({
      code: 'MARKET_NON_BUSINESS_DAY',
      calendar_key: 'PSE',
      date: '2026-06-12',
    });
  });

  it('keeps adjacent meetings from being reported as overlaps', () => {
    expect(meetingWindowsOverlap(
      '2026-06-10T02:00:00.000Z',
      '2026-06-10T03:00:00.000Z',
      '2026-06-10T03:00:00.000Z',
      '2026-06-10T04:00:00.000Z',
    )).toBe(false);
  });

  it('rejects invalid scheduling windows before persistence', () => {
    expect(() => validateMeetingSchedulingWindow({
      startTime: '2026-06-10T02:00:00.000Z',
      endTime: '2026-06-10T02:10:00.000Z',
      now: new Date('2026-06-01T00:00:00.000Z'),
    })).toThrow(ValidationError);
  });

  it('persists scheduling governance fields on meetings', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("calendar_key: text('calendar_key').notNull().default('PSE')");
    expect(schemaSource).toContain("scheduling_validation_status: text('scheduling_validation_status').notNull().default('PASSED')");
    expect(schemaSource).toContain("scheduling_conflicts: jsonb('scheduling_conflicts').notNull().default([])");
    expect(schemaSource).toContain("market_holiday_warning: boolean('market_holiday_warning').notNull().default(false)");
  });

  it('wires scheduling policy and market calendar checks into meeting create/update/reschedule', () => {
    const serviceSource = read('server/services/meeting-service.ts');
    expect(serviceSource).toContain('evaluateSchedulingForMeeting');
    expect(serviceSource).toContain('marketCalendarService.isBusinessDay(calendarKey, meetingDate)');
    expect(serviceSource).toContain('schedulingEvidenceUpdates(schedulingEvaluation)');
    expect(serviceSource).toContain('excluded_meeting_id: id');
  });

  it('ships a migration for scheduling warning evidence', () => {
    const migrationSource = read('drizzle/20260504_extend_meeting_scheduling_controls.sql');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS scheduling_validation_status text NOT NULL DEFAULT');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS scheduling_conflicts jsonb NOT NULL DEFAULT');
    expect(migrationSource).toContain('MIGRATION_BACKFILL');
    expect(migrationSource).toContain('meetings_scheduling_window_idx');
  });
});
