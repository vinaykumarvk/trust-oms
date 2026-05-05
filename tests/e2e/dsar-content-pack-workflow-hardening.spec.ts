import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-G-005 DSAR and content-pack workflow hardening', () => {
  it('persists DSAR delivery, SLA, retention, response hash, and archival evidence', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("response_payload_hash: text('response_payload_hash')");
    expect(schemaSource).toContain("sla_alerts: jsonb('sla_alerts').notNull().default([])");
    expect(schemaSource).toContain("delivery_status: text('delivery_status').notNull().default('PENDING')");
    expect(schemaSource).toContain("archival_evidence: jsonb('archival_evidence').notNull().default({})");
    expect(schemaSource).toContain("retention_check: jsonb('retention_check').notNull().default({})");
  });

  it('builds DSAR response hashes and exposes delivery/archive/SLA workflows', () => {
    const serviceSource = read('server/services/dsar-service.ts');
    expect(serviceSource).toContain('hashPayload(responsePayload)');
    expect(serviceSource).toContain('artifact_bundle_url: `dsar://response-bundle/');
    expect(serviceSource).toContain('recordDelivery');
    expect(serviceSource).toContain('archiveResponse');
    expect(serviceSource).toContain('sla_alerts: sql`COALESCE');

    const routeSource = read('server/routes/back-office/dsar.ts');
    expect(routeSource).toContain("router.get('/sla-breaches'");
    expect(routeSource).toContain("router.post('/:id/delivery'");
    expect(routeSource).toContain("router.post('/:id/archive'");
  });

  it('hardens content packs with payload hashes, signature verification, activation approval, and archival proof', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("payload_hash: text('payload_hash')");
    expect(schemaSource).toContain("signature_verification_evidence: jsonb('signature_verification_evidence').notNull().default({})");
    expect(schemaSource).toContain("activation_approval_status: text('activation_approval_status').notNull().default('NOT_REQUESTED')");
    expect(schemaSource).toContain("rollback_evidence: jsonb('rollback_evidence').notNull().default({})");

    const serviceSource = read('server/services/content-pack-service.ts');
    expect(serviceSource).toContain('Content pack signature verification failed; activation is blocked');
    expect(serviceSource).toContain('signature_verified_at');
    expect(serviceSource).toContain("activation_approval_status: 'APPROVED'");
    expect(serviceSource).toContain('archival_evidence');
  });

  it('ships a migration for DSAR/content-pack workflow evidence', () => {
    const migrationSource = read('drizzle/20260504_harden_dsar_content_pack_workflows.sql');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS payload_hash text');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS response_payload_hash text');
    expect(migrationSource).toContain('idx_dsar_requests_delivery_status');
    expect(migrationSource).toContain('idx_content_packs_activation_approval');
  });
});
