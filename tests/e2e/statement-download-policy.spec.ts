import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  appendStatementAccessHistory,
  buildStatementAccessEntry,
  computeStatementContentHash,
  retentionPolicyForStatement,
  statementRetentionUntil,
} from '../../server/services/statement-download-policy';

describe('statement download policy', () => {
  it('computes statement content hashes and retention metadata', () => {
    expect(computeStatementContentHash(Buffer.from('official statement'))).toHaveLength(64);
    expect(computeStatementContentHash(Buffer.from('official statement'))).toBe(
      computeStatementContentHash(Buffer.from('official statement')),
    );
    expect(retentionPolicyForStatement('TAX_CERTIFICATE')).toBe('TAX_CERTIFICATE_7Y');
    expect(retentionPolicyForStatement('ANNUAL')).toBe('ANNUAL_STATEMENT_7Y');
    expect(retentionPolicyForStatement('MONTHLY')).toBe('CLIENT_STATEMENT_7Y');
    expect(statementRetentionUntil(new Date('2026-05-04T00:00:00.000Z'))).toBe('2033-05-04');
  });

  it('builds bounded statement download access history', () => {
    const entry = buildStatementAccessEntry({
      requesterType: 'CLIENT',
      requesterId: 'portal-user-1',
      ipAddress: '127.0.0.1',
      contentHash: 'a'.repeat(64),
      at: new Date('2026-05-04T00:00:00.000Z'),
    });

    expect(entry).toEqual({
      action: 'DOWNLOAD',
      requester_type: 'CLIENT',
      requester_id: 'portal-user-1',
      accessed_at: '2026-05-04T00:00:00.000Z',
      ip_address: '127.0.0.1',
      content_hash: 'a'.repeat(64),
    });

    const next = appendStatementAccessHistory(Array.from({ length: 50 }, () => entry), entry);
    expect(next).toHaveLength(50);
    expect(next.at(-1)).toEqual(entry);
  });

  it('wires official statement download through session-scoped routes, blob UI, audit, and retention columns', () => {
    const serviceSource = readFileSync('server/services/statement-service.ts', 'utf8');
    const routeSource = readFileSync('server/routes/client-portal.ts', 'utf8');
    const pageSource = readFileSync('apps/client-portal/src/pages/statements.tsx', 'utf8');
    const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
    const migrationSource = readFileSync(
      'drizzle/20260504_extend_client_statement_download_controls.sql',
      'utf8',
    );

    expect(serviceSource).toContain("action: 'STATEMENT_DOWNLOADED'");
    expect(serviceSource).toContain("action: 'STATEMENT_INTEGRITY_FAILED'");
    expect(serviceSource).toContain('appendStatementAccessHistory(statement.access_history, accessEntry)');
    expect(serviceSource).toContain('retention_until: retentionUntil');
    expect(serviceSource).not.toContain('console.log');

    expect(routeSource).toContain("'/statements'");
    expect(routeSource).toContain("'/statements/:statementId/download'");
    expect(routeSource).toContain('statementService.download(statementId, sessionClientId, portalStatementAudit(req))');
    expect(routeSource).toContain('safeContentDisposition(statementDownloadFilename(result.statement))');
    expect(routeSource).toContain("res.setHeader('X-Statement-Hash', result.contentHash)");

    expect(pageSource).toContain('fetchStatementBlob(statement.id)');
    expect(pageSource).toContain('return { blob: await res.blob(), filename }');
    expect(pageSource).toContain('apiUrl("/api/v1/client-portal/statements")');
    expect(pageSource).not.toContain('CLT-001');
    expect(pageSource).not.toContain('trustoms-client-user');

    expect(schemaSource).toContain("content_hash: text('content_hash')");
    expect(schemaSource).toContain("retention_policy: text('retention_policy')");
    expect(schemaSource).toContain("access_history: jsonb('access_history')");
    expect(schemaSource).toContain("report_pack_output_id: integer('report_pack_output_id')");
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS retention_until date');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS access_history jsonb');
  });
});
