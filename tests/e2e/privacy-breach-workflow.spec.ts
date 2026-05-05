import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assessPrivacyBreach,
  breachNotificationDueAt,
  normalizeClosureEvidence,
  normalizeNotificationEvidence,
} from '../../server/services/privacy-breach-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-H-007 privacy breach notification workflow', () => {
  it('classifies notifiable DPA incidents and computes 72-hour NPC/data-subject timers', () => {
    const detectedAt = new Date('2026-05-04T01:00:00.000Z');
    const assessment = assessPrivacyBreach({
      affectedCount: 1200,
      dataCategories: ['tin', 'account number'],
      sensitivePersonalInformation: true,
      realRiskOfSeriousHarm: true,
      detectedAt,
    });

    expect(breachNotificationDueAt(detectedAt).toISOString()).toBe('2026-05-07T01:00:00.000Z');
    expect(assessment.npcNotificationRequired).toBe(true);
    expect(assessment.dataSubjectNotificationRequired).toBe(true);
    expect(assessment.npcDeadline.toISOString()).toBe('2026-05-07T01:00:00.000Z');
    expect(assessment.dataCategories).toEqual(['TIN', 'ACCOUNT_NUMBER']);
    expect(assessment.notificationBasis).toContain('REAL_RISK_OF_SERIOUS_HARM');
    expect(assessment.severity).toBe('HIGH');
  });

  it('requires durable notification references and DPO closure evidence', () => {
    const evidence = normalizeNotificationEvidence({
      reference: 'NPC-DBNMS-2026-0001',
      submittedAt: '2026-05-04T10:00:00.000Z',
      payload: { breach_id: 'PRB-1', affected_count: 10 },
      attachments: ['npc-report.pdf'],
    });

    expect(evidence.channel).toBe('NPC_DBNMS');
    expect(evidence.payload_hash).toHaveLength(64);
    expect(() => normalizeNotificationEvidence({ reference: '' })).toThrow(ValidationError);
    expect(() => normalizeClosureEvidence({
      rootCause: 'short',
      correctiveActions: [],
      residualRisk: '',
      notes: 'short',
    })).toThrow(ValidationError);
    expect(normalizeClosureEvidence({
      rootCause: 'Misconfigured vendor export filter',
      correctiveActions: ['Disabled export', 'Added dual approval for releases'],
      residualRisk: 'LOW',
      notes: 'DPO reviewed evidence and approved closure',
    })).toMatchObject({ residual_risk: 'LOW' });
  });

  it('extends breach notifications with playbook, notification, SLA, and closure evidence', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("'TRIAGED', 'CONTAINED', 'NPC_NOTIFIED', 'DATA_SUBJECT_NOTIFIED'");
    expect(schemaSource).toContain("npc_notification_required: boolean('npc_notification_required').notNull().default(false)");
    expect(schemaSource).toContain("data_subject_notification_required: boolean('data_subject_notification_required').notNull().default(false)");
    expect(schemaSource).toContain("data_subject_notification_deadline: timestamp('data_subject_notification_deadline', { withTimezone: true })");
    expect(schemaSource).toContain("affected_client_ids: jsonb('affected_client_ids').notNull().default([])");
    expect(schemaSource).toContain("playbook_steps: jsonb('playbook_steps').notNull().default([])");
    expect(schemaSource).toContain("closure_evidence: jsonb('closure_evidence').notNull().default({})");
    expect(schemaSource).toContain("index('breach_notifications_data_subject_deadline_idx').on(table.data_subject_notification_deadline)");
  });

  it('adds service controls for triage, containment, notifications, closure gates, and SLA alerts', () => {
    const serviceSource = read('server/services/privacy-breach-service.ts');
    expect(serviceSource).toContain('async triageIncident');
    expect(serviceSource).toContain('async recordContainment');
    expect(serviceSource).toContain('async recordNpcNotification');
    expect(serviceSource).toContain('async recordDataSubjectNotification');
    expect(serviceSource).toContain('async checkNotificationSlaBreaches');
    expect(serviceSource).toContain('requires NPC notification before closure');
    expect(serviceSource).toContain('within_72h_deadline');
    expect(serviceSource).toContain('PRIVACY_BREACH_NPC_NOTIFIED');
    expect(serviceSource).toContain('playbook_steps: buildPrivacyBreachPlaybook(assessment)');
  });

  it('exposes a privacy-role protected breach workflow API', () => {
    const routeSource = read('server/routes/back-office/privacy-breaches.ts');
    expect(routeSource).toContain('router.use(requirePrivacyRole())');
    expect(routeSource).toContain("router.get('/sla-breaches'");
    expect(routeSource).toContain("router.post('/:id/triage'");
    expect(routeSource).toContain("router.post('/:id/containment'");
    expect(routeSource).toContain("router.post('/:id/notify-npc'");
    expect(routeSource).toContain("router.post('/:id/notify-data-subjects'");
    expect(routeSource).toContain("router.post('/:id/close'");

    const routesSource = read('server/routes.ts');
    expect(routesSource).toContain("app.use('/api/v1/privacy-breaches', privacyBreachesRouter)");
  });

  it('surfaces the workflow in the Privacy Center workbench', () => {
    const uiSource = read('apps/back-office/src/pages/consent-privacy-center.tsx');
    expect(uiSource).toContain("queryKey: ['privacy-breaches']");
    expect(uiSource).toContain("jsonRequest('/api/v1/privacy-breaches'");
    expect(uiSource).toContain('Breach Playbook');
    expect(uiSource).toContain("action: 'notify-data-subjects'");
    expect(uiSource).toContain('Breach Timers');
  });

  it('ships a migration for breach playbook evidence and timer indexes', () => {
    const migrationSource = read('drizzle/20260504_add_privacy_breach_workflow.sql');
    expect(migrationSource).toContain("ALTER TYPE breach_notification_status ADD VALUE IF NOT EXISTS 'TRIAGED'");
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS npc_notification_required boolean NOT NULL DEFAULT false');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS data_subject_notification_deadline timestamptz');
    expect(migrationSource).toContain('MIGRATION_BACKFILL');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS breach_notifications_data_subject_deadline_idx');
  });
});
