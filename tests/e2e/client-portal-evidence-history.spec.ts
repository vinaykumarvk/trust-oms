import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildPortalEvidenceEnvelope,
  hashPortalEvidencePayload,
} from '../../server/services/client-portal-evidence-policy';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-J-003 client portal evidence and notification history', () => {
  it('builds stable portal evidence envelopes with content and notification evidence', () => {
    const envelope = buildPortalEvidenceEnvelope({
      clientId: 'CLT-001',
      portalUserId: '101',
      eventType: 'statement.downloaded',
      action: 'download',
      sourceEntityType: 'client_statement',
      sourceEntityId: 99,
      sourceEntityRef: '2026-04',
      contentHash: 'a'.repeat(64),
      evidencePayload: { b: 2, a: 1 },
      notificationPayload: { channel: 'IN_APP' },
      occurredAt: new Date('2026-05-04T00:00:00.000Z'),
    });

    expect(envelope.evidenceEventId).toMatch(/^CPE-STATEMENT_DOWNLOADED-CLT-001-/);
    expect(envelope.eventType).toBe('STATEMENT_DOWNLOADED');
    expect(envelope.action).toBe('DOWNLOAD');
    expect(envelope.sourceEntityType).toBe('CLIENT_STATEMENT');
    expect(envelope.contentHash).toBe('a'.repeat(64));
    expect(hashPortalEvidencePayload({ a: 1, b: 2 })).toBe(hashPortalEvidencePayload({ b: 2, a: 1 }));
  });

  it('adds a unified client portal evidence ledger', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain('export const clientPortalEvidenceEvents = pgTable');
    expect(schemaSource).toContain("evidence_event_id: text('evidence_event_id').unique().notNull()");
    expect(schemaSource).toContain("client_id: text('client_id').references(() => clients.client_id).notNull()");
    expect(schemaSource).toContain("source_entity_type: text('source_entity_type').notNull()");
    expect(schemaSource).toContain("notification_payload: jsonb('notification_payload').notNull().default({})");
    expect(schemaSource).toContain("index('idx_client_portal_evidence_client').on(table.client_id, table.occurred_at)");
  });

  it('records message, statement, and notification evidence through shared service methods', () => {
    const serviceSource = read('server/services/client-portal-evidence-service.ts');
    expect(serviceSource).toContain('async recordMessageEvent');
    expect(serviceSource).toContain('async recordStatementDownload');
    expect(serviceSource).toContain('async recordNotificationEvent');
    expect(serviceSource).toContain('async listForClient');
    expect(serviceSource).toContain('CLIENT_PORTAL_EVIDENCE_RECORDED');

    const messageSource = read('server/services/client-message-service.ts');
    expect(messageSource).toContain('clientPortalEvidenceService.recordMessageEvent');
    expect(messageSource).toContain("'MESSAGE_SENT'");
    expect(messageSource).toContain("'MESSAGE_READ'");

    const statementSource = read('server/services/statement-service.ts');
    expect(statementSource).toContain('clientPortalEvidenceService.recordStatementDownload');
    expect(statementSource).toContain('fileSizeBytes: buffer.length');

    const portalSource = read('server/services/client-portal-service.ts');
    expect(portalSource).toContain('clientPortalEvidenceService.recordNotificationEvent');
  });

  it('exposes session-scoped evidence history in the client portal API and UI', () => {
    const routeSource = read('server/routes/client-portal.ts');
    expect(routeSource).toContain("'/evidence-history'");
    expect(routeSource).toContain('clientPortalEvidenceService.listForClient(clientId');
    expect(routeSource).toContain('pageSize ? (parseInt(pageSize as string, 10) || 25) : 25');

    const messagesPage = read('apps/client-portal/src/pages/messages.tsx');
    expect(messagesPage).toContain('apiUrl("/api/v1/client-portal/evidence-history?pageSize=6")');
    expect(messagesPage).toContain('Activity History');
    expect(messagesPage).toContain('recentEvidence.map');
  });

  it('ships migration support and backfills messages, statement downloads, and notifications', () => {
    const migrationSource = read('drizzle/20260504_add_client_portal_evidence_history.sql');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS client_portal_evidence_events');
    expect(migrationSource).toContain('idx_client_portal_evidence_client');
    expect(migrationSource).toContain('FROM client_messages');
    expect(migrationSource).toContain('FROM client_statements');
    expect(migrationSource).toContain('FROM notification_log');
    expect(migrationSource).toContain('ON CONFLICT (evidence_event_id) DO NOTHING');
  });
});
