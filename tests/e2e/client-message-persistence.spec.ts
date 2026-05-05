import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('client portal persistent messaging closure', () => {
  it('uses persisted client_messages records with audit events for create, read, and reply', () => {
    const serviceSource = readFileSync('server/services/client-message-service.ts', 'utf8');

    expect(serviceSource).toContain('insert(schema.clientMessages)');
    expect(serviceSource).toContain('threadId = `thr-${randomUUID()}`');
    expect(serviceSource).toContain('created_by: actorId');
    expect(serviceSource).toContain('updated_by: actorId');
    expect(serviceSource).toContain("action: 'CLIENT_MESSAGE_CREATED'");
    expect(serviceSource).toContain("action: 'CLIENT_MESSAGE_READ'");
    expect(serviceSource).toContain("action: 'CLIENT_MESSAGE_REPLIED'");
    expect(serviceSource).toContain("source_channel: data.audit?.sourceChannel ?? 'CLIENT_PORTAL'");
  });

  it('keeps client portal message routes scoped to the authenticated session', () => {
    const routeSource = readFileSync('server/routes/client-portal.ts', 'utf8');

    expect(routeSource).toContain('const clientId = req.clientId');
    expect(routeSource).toContain('recipient_client_id: clientId');
    expect(routeSource).toContain('audit: portalMessageAudit(req)');
    expect(routeSource).toContain('clientMessageService.markRead(id, clientId, portalMessageAudit(req))');
    expect(routeSource).toContain('numericPortalUserId(req)');
    expect(routeSource).not.toContain('Number(userId) || 1');
  });

  it('removes static message client fallbacks from the client portal messages page', () => {
    const pageSource = readFileSync('apps/client-portal/src/pages/messages.tsx', 'utf8');
    const layoutSource = readFileSync('apps/client-portal/src/components/layout/ClientPortalLayout.tsx', 'utf8');

    expect(pageSource).toContain('apiUrl("/api/v1/client-portal/messages")');
    expect(pageSource).toContain('queryKey: ["client-portal", "messages", "session"]');
    expect(pageSource).toContain('queryKey: ["client-portal", "messages-unread", "session"]');
    expect(pageSource).not.toContain('CLT-001');
    expect(pageSource).not.toContain('trustoms-client-user');
    expect(layoutSource).toContain('messageSessionKey = clientUser.clientId || "session"');
    expect(layoutSource).toContain('headerMessageSessionKey = JSON.parse(stored).clientId || "session"');
  });
});
