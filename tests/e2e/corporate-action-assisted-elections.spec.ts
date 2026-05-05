import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildCorporateActionElectionHistoryEntry,
  normalizeCorporateActionElectionCapture,
} from '../../server/services/corporate-action-election-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-H-004 assisted corporate-action elections', () => {
  it('requires authority evidence for assisted election capture', () => {
    expect(() => normalizeCorporateActionElectionCapture({
      option: 'CASH',
      channel: 'BACK_OFFICE',
      capturedByUserId: '44',
    })).toThrow(ValidationError);

    const election = normalizeCorporateActionElectionCapture({
      option: 'cash',
      channel: 'BRANCH_ASSISTED',
      assistedByUserId: '21',
      branchCode: 'MKT',
      capturedByUserId: '44',
      makerUserId: '43',
      checkerUserId: '44',
      authorityEvidence: { client_instruction_ref: 'CI-2026-0001' },
      captureNotes: 'Captured from signed branch instruction',
    });

    expect(election).toMatchObject({
      option: 'CASH',
      channel: 'BRANCH_ASSISTED',
      assistedByUserId: '21',
      branchCode: 'MKT',
      makerCheckerStatus: 'APPROVED',
      authorityEvidence: { client_instruction_ref: 'CI-2026-0001' },
    });
  });

  it('rejects weak maker-checker evidence and records history entries', () => {
    expect(() => normalizeCorporateActionElectionCapture({
      option: 'RIGHTS',
      channel: 'RM_ASSISTED',
      assistedByUserId: '21',
      branchCode: 'MKT',
      capturedByUserId: '21',
      makerUserId: '21',
      checkerUserId: '21',
      authorityEvidence: { signed_form_ref: 'FORM-1' },
    })).toThrow(ValidationError);

    const election = normalizeCorporateActionElectionCapture({
      option: 'RIGHTS',
      channel: 'RM_ASSISTED',
      assistedByUserId: '21',
      branchCode: 'MKT',
      capturedByUserId: '44',
      authorityEvidence: { signed_form_ref: 'FORM-1' },
    });
    const history = buildCorporateActionElectionHistoryEntry(election);

    expect(history).toMatchObject({
      action: 'ELECTION_CAPTURED',
      option: 'RIGHTS',
      channel: 'RM_ASSISTED',
      assisted_by_user_id: '21',
      branch_code: 'MKT',
      maker_checker_status: 'CHECKER_CAPTURED',
    });
  });

  it('extends entitlements with channel, authority, maker-checker, and history fields', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("election_status: text('election_status').notNull().default('PENDING')");
    expect(schemaSource).toContain("election_channel: text('election_channel')");
    expect(schemaSource).toContain("assisted_by_user_id: text('assisted_by_user_id')");
    expect(schemaSource).toContain("authority_evidence: jsonb('authority_evidence').notNull().default({})");
    expect(schemaSource).toContain("maker_checker_status: text('maker_checker_status').notNull().default('NOT_REQUIRED')");
    expect(schemaSource).toContain("election_history: jsonb('election_history').notNull().default([])");
    expect(schemaSource).toContain("index('corporate_action_entitlements_election_channel_idx').on(table.election_channel)");
  });

  it('wires assisted election capture into service, route, and UI', () => {
    const serviceSource = read('server/services/corporate-actions-service.ts');
    expect(serviceSource).toContain('normalizeCorporateActionElectionCapture');
    expect(serviceSource).toContain('appendElectionHistorySql');
    expect(serviceSource).toContain('CA_ELECTION_CAPTURED');
    expect(serviceSource).toContain('authority_evidence: election.authorityEvidence');

    const routeSource = read('server/routes/back-office/corporate-actions.ts');
    expect(routeSource).toContain("channel: channel ?? 'BACK_OFFICE'");
    expect(routeSource).toContain('authorityEvidence');
    expect(routeSource).toContain('makerUserId');
    expect(routeSource).toContain('checkerUserId');

    const uiSource = read('apps/back-office/src/pages/corporate-actions.tsx');
    expect(uiSource).toContain('Capture Channel');
    expect(uiSource).toContain('Instruction Reference');
    expect(uiSource).toContain('authorityEvidence');
    expect(uiSource).toContain('electEvidenceReady');
  });

  it('ships a migration that backfills existing elections', () => {
    const migrationSource = read('drizzle/20260504_extend_ca_entitlement_assisted_elections.sql');
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS election_channel text");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS authority_evidence jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migrationSource).toContain("WHEN elected_option IS NOT NULL THEN jsonb_build_array");
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS corporate_action_entitlements_election_status_idx');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS corporate_action_entitlements_election_channel_idx');
  });
});
