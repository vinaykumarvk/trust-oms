import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  computeApprovalClaimExpiryDate,
  evaluateApprovalAutoUnclaim,
  validateApprovalAutoUnclaimPolicy,
} from '../../server/services/approval-auto-unclaim-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-C-003 approval auto-unclaim business-day and branch-calendar policy', () => {
  it('computes expiry using business days and skips market holidays', async () => {
    const holidays = new Set(['2026-06-12']);
    const isBusinessDay = async (_calendarKey: string, date: string) => {
      const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      return day !== 0 && day !== 6 && !holidays.has(date);
    };

    const expiresOn = await computeApprovalClaimExpiryDate({
      claimedAt: new Date('2026-06-10T01:00:00.000Z'),
      policy: { thresholdBusinessDays: 2, calendarKey: 'PSE', timezone: 'Asia/Manila' },
      isBusinessDay,
    });

    expect(expiresOn).toBe('2026-06-15');
  });

  it('marks a claim expired only when the configured business-day expiry date is reached', async () => {
    const isBusinessDay = async (_calendarKey: string, date: string) => {
      const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      return day !== 0 && day !== 6;
    };

    const evaluation = await evaluateApprovalAutoUnclaim({
      claimedAt: new Date('2026-06-10T01:00:00.000Z'),
      now: new Date('2026-06-12T00:30:00.000Z'),
      policy: { thresholdBusinessDays: 2, calendarKey: 'PSE', timezone: 'Asia/Manila' },
      isBusinessDay,
    });

    expect(evaluation.expired).toBe(true);
    expect(evaluation.businessDaysElapsed).toBe(2);
    expect(evaluation.evaluatedDates.map((entry) => entry.date)).toEqual(['2026-06-11', '2026-06-12']);
  });

  it('rejects invalid auto-unclaim policy settings', () => {
    expect(() => validateApprovalAutoUnclaimPolicy({
      thresholdBusinessDays: 99,
      calendarKey: 'PSE',
      timezone: 'Asia/Manila',
    })).toThrow(ValidationError);
  });

  it('persists branch calendars and approval claim expiry evidence', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("calendar_key: text('calendar_key').notNull().default('PSE')");
    expect(schemaSource).toContain("timezone: text('timezone').notNull().default('Asia/Manila')");
    expect(schemaSource).toContain("claim_calendar_key: text('claim_calendar_key')");
    expect(schemaSource).toContain("claim_expires_on: date('claim_expires_on')");
    expect(schemaSource).toContain("auto_unclaim_evidence: jsonb('auto_unclaim_evidence').notNull().default({})");
  });

  it('wires branch-calendar policy into claim and scheduler processing', () => {
    const serviceSource = read('server/services/approval-workflow-service.ts');
    expect(serviceSource).toContain('resolveApprovalAutoUnclaimPolicy({ branchId: callReport?.branch_id })');
    expect(serviceSource).toContain('computeApprovalClaimExpiryDate');
    expect(serviceSource).toContain('evaluateApprovalAutoUnclaim');
    expect(serviceSource).toContain('claim_expires_on: claimExpiresOn');
    expect(serviceSource).toContain('auto_unclaim_evidence: evaluation');
  });

  it('ships a migration for approval auto-unclaim hardening', () => {
    const migrationSource = read('drizzle/20260504_extend_call_report_approval_auto_unclaim.sql');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS calendar_key text NOT NULL DEFAULT');
    expect(migrationSource).toContain('ALTER COLUMN supervisor_id DROP NOT NULL');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS claim_expires_on date');
    expect(migrationSource).toContain('MIGRATION_BACKFILL');
  });
});
