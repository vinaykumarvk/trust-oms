import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
const serviceSource = readFileSync('server/services/call-report-service.ts', 'utf8');
const migrationSource = readFileSync('drizzle/20260430_add_user_timezone.sql', 'utf8');

describe('call-report timezone business-day coverage', () => {
  it('adds an RM timezone field with a Manila fallback migration', () => {
    expect(schemaSource).toContain("timezone: text('timezone').default('Asia/Manila')");
    expect(migrationSource).toContain("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Manila'");
  });

  it('calculates late-filing business days using the RM timezone', () => {
    expect(serviceSource).toContain("const DEFAULT_RM_TIMEZONE = 'Asia/Manila'");
    expect(serviceSource).toContain('function isoDateInTimezone');
    expect(serviceSource).toContain('async function getRmTimezone');
    expect(serviceSource).toContain('calculateBusinessDaysPSE(report.meeting_date, now, rmTimezone)');
  });
});
