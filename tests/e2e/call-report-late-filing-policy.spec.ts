import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  evaluateCallReportLateFiling,
  isoDateInBusinessTimezone,
  validateLateFilingPolicy,
} from '../../server/services/call-report-late-filing-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-C-001 call-report late filing SLA policy', () => {
  it('evaluates SLA using configured timezone, calendar, holidays, and threshold', async () => {
    const holidays = new Set(['2026-05-01']);
    const evaluation = await evaluateCallReportLateFiling({
      meetingDate: '2026-04-30',
      filedAt: new Date('2026-05-08T01:00:00.000Z'),
      policy: {
        thresholdBusinessDays: 5,
        calendarKey: 'PSE',
        timezone: 'Asia/Manila',
      },
      isBusinessDay: async (_calendarKey, date) => {
        const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        return day !== 0 && day !== 6 && !holidays.has(date);
      },
    });

    expect(evaluation.filedLocalDate).toBe('2026-05-08');
    expect(evaluation.businessDaysElapsed).toBe(5);
    expect(evaluation.requiresSupervisorApproval).toBe(false);
    expect(evaluation.evaluatedDates).toContainEqual({ date: '2026-05-01', businessDay: false });
  });

  it('rejects invalid governed policy settings', () => {
    expect(() => validateLateFilingPolicy({
      thresholdBusinessDays: 31,
      calendarKey: 'PSE',
      timezone: 'Asia/Manila',
    })).toThrow(ValidationError);

    expect(isoDateInBusinessTimezone(new Date('2026-05-04T18:00:00.000Z'), 'Asia/Manila')).toBe('2026-05-05');
  });

  it('persists SLA policy and explanation evidence on call reports', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("late_filing_calendar_key: text('late_filing_calendar_key')");
    expect(schemaSource).toContain("late_filing_timezone: text('late_filing_timezone')");
    expect(schemaSource).toContain("late_filing_threshold_days: integer('late_filing_threshold_days')");
    expect(schemaSource).toContain("late_filing_due_date: date('late_filing_due_date')");
    expect(schemaSource).toContain("late_filing_evaluation: jsonb('late_filing_evaluation').notNull().default({})");
  });

  it('wires governed policy evaluation into call report submission', () => {
    const serviceSource = read('server/services/call-report-service.ts');
    expect(serviceSource).toContain('getLateFilingCalendarKey');
    expect(serviceSource).toContain('evaluateLateFilingSla');
    expect(serviceSource).toContain('evaluateCallReportLateFiling');
    expect(serviceSource).toContain('late_filing_calendar_key: lateFilingEvaluation.policy.calendarKey');
    expect(serviceSource).toContain('late_filing_evaluation: lateFilingEvidence');
    expect(serviceSource).toContain('marketCalendarService.isBusinessDay(key, date)');
  });

  it('ships a migration to backfill late filing evidence defaults', () => {
    const migrationSource = read('drizzle/20260504_extend_call_report_late_filing_evidence.sql');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS late_filing_calendar_key text');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS late_filing_evaluation jsonb NOT NULL DEFAULT');
    expect(migrationSource).toContain("'MIGRATION_BACKFILL'");
  });
});
