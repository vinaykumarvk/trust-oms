import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildClientAcceptanceEvidence,
  buildProposalDisclosureSnapshot,
  defaultSuitabilityDisclosureContent,
  hashDisclosurePayload,
} from '../../server/services/proposal-disclosure-policy';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-F-003 suitability disclosure and acceptance evidence', () => {
  it('hashes disclosure content and builds proposal snapshots with version metadata', () => {
    const content = defaultSuitabilityDisclosureContent();
    const contentHash = hashDisclosurePayload(content);
    const snapshot = buildProposalDisclosureSnapshot({
      proposal: {
        id: 10,
        proposal_number: 'PROP-2026-001',
        title: 'UITF Allocation',
        customer_id: 'CL-100',
        risk_profile_id: 7,
      },
      disclosureVersion: {
        id: 3,
        disclosure_code: 'SUITABILITY_STANDARD',
        version_no: 2,
        title: content.title,
        content,
        content_hash: contentHash,
      },
      suitabilityDetails: { checks: [{ name: 'RISK_LEVEL_CHECK', passed: true }] },
    });

    expect(contentHash).toHaveLength(64);
    expect(snapshot).toMatchObject({
      proposal_id: 10,
      disclosure_version_id: 3,
      disclosure_version_no: 2,
      disclosure_content_hash: contentHash,
    });
  });

  it('builds client acceptance evidence tied to the accepted disclosure hash', () => {
    const acceptedAt = new Date('2026-05-04T00:00:00.000Z');
    expect(buildClientAcceptanceEvidence({
      evidenceId: 8,
      acceptedBy: 99,
      acceptedAt,
      disclosureContentHash: 'abc123',
      disclosureVersionId: 2,
      channel: 'CLIENT_PORTAL',
      acceptanceMethod: 'OTP',
    })).toMatchObject({
      evidence_id: 8,
      accepted_by: 99,
      accepted_at: acceptedAt.toISOString(),
      disclosure_content_hash: 'abc123',
      disclosure_version_id: 2,
    });
  });

  it('persists disclosure versions and proposal-level evidence', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain('export const suitabilityDisclosureVersions = pgTable');
    expect(schemaSource).toContain('export const proposalDisclosureEvidence = pgTable');
    expect(schemaSource).toContain("disclosure_snapshot: jsonb('disclosure_snapshot').notNull().default({})");
    expect(schemaSource).toContain("client_acceptance_evidence: jsonb('client_acceptance_evidence').notNull().default({})");
    expect(schemaSource).toContain("acceptance_status: text('acceptance_status').notNull().default('PENDING')");
  });

  it('wires disclosure preparation into send-to-client and acceptance flows', () => {
    const serviceSource = read('server/services/proposal-service.ts');
    expect(serviceSource).toContain('prepareProposalDisclosureEvidence');
    expect(serviceSource).toContain('ensureSuitabilityDisclosureVersion');
    expect(serviceSource).toContain('buildProposalDisclosureSnapshot');
    expect(serviceSource).toContain('Disclosure acceptance evidence is required before client acceptance');
    expect(serviceSource).toContain('buildClientAcceptanceEvidence');
    expect(serviceSource).toContain("disclosure_status: 'ACCEPTED'");
  });

  it('exposes disclosure version management routes', () => {
    const routeSource = read('server/routes/back-office/proposals.ts');
    expect(routeSource).toContain("router.get('/disclosures/versions'");
    expect(routeSource).toContain("router.post('/disclosures/versions'");
    expect(routeSource).toContain('acceptance_method: req.body.acceptance_method');
  });

  it('ships a migration for disclosure content versioning and evidence', () => {
    const migrationSource = read('drizzle/20260504_add_suitability_disclosure_evidence.sql');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS suitability_disclosure_versions');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS proposal_disclosure_evidence');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS disclosure_status text NOT NULL DEFAULT');
    expect(migrationSource).toContain('SUITABILITY_STANDARD');
  });
});
