import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  appendNotificationHistory,
  buildNotificationHistoryEntry,
  normalizeNotificationClosureEvidence,
  normalizeNotificationSeverity,
  notificationDueAt,
} from '../../server/services/notification-governance-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-K-003 notification governance policy', () => {
  it('normalizes severities and computes SLA due dates', () => {
    expect(normalizeNotificationSeverity('critical')).toBe('CRITICAL');
    expect(normalizeNotificationSeverity('P0')).toBe('CRITICAL');
    expect(normalizeNotificationSeverity('high')).toBe('P1');
    expect(normalizeNotificationSeverity(undefined)).toBe('P3');

    const start = new Date('2026-05-04T00:00:00.000Z');
    expect(notificationDueAt('CRITICAL', start).toISOString()).toBe('2026-05-04T04:00:00.000Z');
    expect(notificationDueAt('P2', start).toISOString()).toBe('2026-05-05T00:00:00.000Z');
    expect(notificationDueAt('P3', start, '2026-05-06T10:00:00.000Z').toISOString()).toBe('2026-05-06T10:00:00.000Z');
    expect(() => normalizeNotificationSeverity('urgent')).toThrow(ValidationError);
  });

  it('requires closure evidence and preserves lifecycle history entries', () => {
    expect(() => normalizeNotificationClosureEvidence({ notes: 'too short' })).toThrow(ValidationError);
    expect(normalizeNotificationClosureEvidence({
      notes: 'Resolved after reconciling the operational case',
      resolution_code: 'RESOLVED',
      evidence_refs: ['case-123'],
    })).toEqual({
      notes: 'Resolved after reconciling the operational case',
      resolution_code: 'RESOLVED',
      evidence_refs: ['case-123'],
    });

    const entry = buildNotificationHistoryEntry({
      action: 'ESCALATED',
      status: 'ESCALATED',
      actorUserId: 11,
      notes: 'Escalated to operations control',
      escalationTeam: 'OPERATIONS_CONTROL',
    });

    const history = appendNotificationHistory([{ action: 'CREATED' }], entry);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      action: 'ESCALATED',
      status: 'ESCALATED',
      actor_user_id: 11,
      escalation_team: 'OPERATIONS_CONTROL',
    });
  });

  it('extends the CRM notification schema with accountable workflow fields', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("severity: text('severity').notNull().default('P3')");
    expect(schemaSource).toContain("lifecycle_status: text('lifecycle_status').notNull().default('OPEN')");
    expect(schemaSource).toContain("owner_user_id: integer('owner_user_id').references(() => users.id)");
    expect(schemaSource).toContain("sla_due_at: timestamp('sla_due_at', { withTimezone: true })");
    expect(schemaSource).toContain("closure_evidence: jsonb('closure_evidence')");
    expect(schemaSource).toContain("governance_history: jsonb('governance_history').notNull().default([])");
    expect(schemaSource).toContain("index('crm_notifications_owner_idx').on(table.owner_user_id)");
    expect(schemaSource).toContain("index('crm_notifications_sla_due_idx').on(table.sla_due_at)");
  });

  it('adds service methods for acknowledgement, escalation, closure, and audit events', () => {
    const serviceSource = read('server/services/notification-inbox-service.ts');
    expect(serviceSource).toContain('async acknowledge');
    expect(serviceSource).toContain('async escalate');
    expect(serviceSource).toContain('async close');
    expect(serviceSource).toContain('NOTIFICATION_ACKNOWLEDGED');
    expect(serviceSource).toContain('NOTIFICATION_ESCALATED');
    expect(serviceSource).toContain('NOTIFICATION_CLOSED');
    expect(serviceSource).toContain('governance_history: appendHistorySql');
    expect(serviceSource).toContain('normalizeNotificationClosureEvidence');
  });

  it('exposes notification lifecycle actions through back-office routes', () => {
    const routeSource = read('server/routes/back-office/notifications.ts');
    expect(routeSource).toContain("router.post('/:id/acknowledge'");
    expect(routeSource).toContain("router.post('/:id/escalate'");
    expect(routeSource).toContain("router.post('/:id/close'");
    expect(routeSource).toContain('notificationAuditContext');
    expect(routeSource).toContain('notificationInboxService.markAllAsRead(userId, notificationAuditContext(req))');
  });

  it('ships a migration that backfills ownership, SLA, history, and indexes', () => {
    const migrationSource = read('drizzle/20260504_extend_crm_notifications_governance.sql');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS owner_user_id integer REFERENCES users(id)');
    expect(migrationSource).toContain("governance_history jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(migrationSource).toContain('owner_user_id = COALESCE(owner_user_id, recipient_user_id)');
    expect(migrationSource).toContain("created_at + interval '72 hours'");
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS crm_notifications_lifecycle_idx');
  });
});
