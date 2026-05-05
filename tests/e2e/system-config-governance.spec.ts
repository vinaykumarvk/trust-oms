import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildSystemConfigDiffPayload,
  buildSystemConfigVersionId,
  normalizeSystemConfigKey,
  normalizeSystemConfigScope,
  requireSystemConfigChangeReason,
  validateSystemConfigValue,
} from '../../server/services/system-config-governance-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-K-004 system configuration governance', () => {
  it('normalizes keys/scopes and validates typed config values', () => {
    expect(normalizeSystemConfigKey(' crm_late_filing_days ')).toBe('CRM_LATE_FILING_DAYS');
    expect(normalizeSystemConfigScope(undefined, undefined)).toEqual({ scopeType: 'INSTITUTION', scopeId: null });
    expect(normalizeSystemConfigScope('branch', 'BGC-01')).toEqual({ scopeType: 'BRANCH', scopeId: 'BGC-01' });

    expect(validateSystemConfigValue('5', 'INTEGER', '1', '10')).toBe('5');
    expect(validateSystemConfigValue('0.125', 'DECIMAL', '0', '1')).toBe('0.125');
    expect(validateSystemConfigValue('false', 'BOOLEAN')).toBe('false');
    expect(validateSystemConfigValue('{"days":5}', 'JSON')).toBe('{"days":5}');

    expect(() => normalizeSystemConfigScope('branch', null)).toThrow(ValidationError);
    expect(() => validateSystemConfigValue('5.5', 'INTEGER')).toThrow(ValidationError);
    expect(() => validateSystemConfigValue('maybe', 'BOOLEAN')).toThrow(ValidationError);
    expect(() => requireSystemConfigChangeReason('short')).toThrow(ValidationError);
  });

  it('builds deterministic governance identifiers and redacted diff evidence', () => {
    const versionId = buildSystemConfigVersionId('crm.late-filing-days', 3, new Date('2026-05-04T01:02:03.000Z'));
    expect(versionId).toBe('CFG-CRM_LATE_FILING_DAYS-V0003-20260504010203');

    const diff = buildSystemConfigDiffPayload('5', '3');
    expect(diff.changed).toBe(true);
    expect(diff.previous_hash).toHaveLength(64);
    expect(diff.proposed_hash).toHaveLength(64);
    expect(diff.previous_length).toBe(1);
    expect(diff.proposed_length).toBe(1);
  });

  it('extends the schema with scoped active config and durable version history', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("scope_type: text('scope_type').notNull().default('INSTITUTION')");
    expect(schemaSource).toContain("approval_status: text('approval_status').notNull().default('APPROVED')");
    expect(schemaSource).toContain("pending_config_value: text('pending_config_value')");
    expect(schemaSource).toContain("last_governance_version_id: text('last_governance_version_id')");
    expect(schemaSource).toContain('export const systemConfigVersions = pgTable');
    expect(schemaSource).toContain("config_version_id: text('config_version_id').unique().notNull()");
    expect(schemaSource).toContain("rollback_of_version_id: text('rollback_of_version_id')");
    expect(schemaSource).toContain("uniqueIndex('ux_system_config_versions_id').on(table.config_version_id)");
    expect(schemaSource).toContain("index('idx_system_config_versions_key_scope').on(table.config_key, table.scope_type, table.scope_id)");
  });

  it('adds durable governance service operations and replaces the in-memory versioning helper', () => {
    const serviceSource = read('server/services/system-config-governance-service.ts');
    expect(serviceSource).toContain('async submitChange');
    expect(serviceSource).toContain('async approveChange');
    expect(serviceSource).toContain('async rejectChange');
    expect(serviceSource).toContain('async rollbackConfig');
    expect(serviceSource).toContain('schema.systemConfigVersions');
    expect(serviceSource).toContain('CONFIG_CHANGE_APPROVED');
    expect(serviceSource).toContain('CONFIG_CHANGE_ROLLED_BACK');
    expect(serviceSource).toContain("pg_notify(");

    const legacySource = read('server/services/config-versioning-service.ts');
    expect(legacySource).toContain('Deprecated compatibility facade');
    expect(legacySource).not.toContain('const versionHistory');
    expect(legacySource).not.toContain('new Map<string, Record<string, unknown>>');
  });

  it('exposes submit, approve, reject, history, and rollback routes without bypassing existing PUT hardening', () => {
    const routeSource = read('server/routes/back-office/system-config.ts');
    expect(routeSource).toContain("router.get('/versions'");
    expect(routeSource).toContain("'/changes/:versionId/approve'");
    expect(routeSource).toContain("'/changes/:versionId/reject'");
    expect(routeSource).toContain("'/:key/changes'");
    expect(routeSource).toContain("'/:key/rollback'");
    expect(routeSource).toContain("requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')");
    expect(routeSource).toContain('VERSION_CONFLICT');
    expect(routeSource).toContain('systemConfigGovernanceService.submitChange');
  });

  it('ships a migration and distributed runtime-cache invalidation hook', () => {
    const migrationSource = read('drizzle/20260504_add_system_config_governance.sql');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS system_config_versions');
    expect(migrationSource).toContain('rollback_of_version_id text');
    expect(migrationSource).toContain('idx_system_config_versions_key_scope');
    expect(migrationSource).toContain('Historical system configuration backfill');

    const callReportSource = read('server/services/call-report-service.ts');
    expect(callReportSource).toContain('initializeLateFilingConfigListener');
    expect(callReportSource).toContain('LISTEN system_config_changed');

    const routesSource = read('server/routes.ts');
    expect(routesSource).toContain('initializeLateFilingConfigListener().catch');
  });
});
