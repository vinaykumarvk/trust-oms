import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildEfpsSubmissionPayload,
  buildTaxAuthorityIdempotencyKey,
  buildTaxAuthorityPayloadHash,
  buildTaxAuthoritySubmissionId,
  nextTaxAuthorityRetryAt,
  normalizeTaxAuthorityAcknowledgementStatus,
  normalizeTaxAuthoritySubmissionMode,
  requireEfpsSubmissionReady,
  taxAuthoritySubmissionStatusFromAck,
} from '../../server/services/tax-authority-integration-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const draft = {
  filingId: 12,
  formType: '1601FQ' as const,
  quarter: 1,
  year: 2026,
  totalWithheld: '1250.00',
  xmlPayload: '<BIRForm1601FQ><Header /></BIRForm1601FQ>',
  authorityCode: 'BIR',
  channel: 'EFPS',
  submissionMode: 'MANUAL_EVIDENCE',
};

describe('TB-H-005 eFPS and tax authority integration boundary', () => {
  it('validates eFPS-ready 1601-FQ packets and deterministic idempotency', () => {
    expect(() => requireEfpsSubmissionReady(draft)).not.toThrow();
    expect(normalizeTaxAuthoritySubmissionMode('sandbox')).toBe('SANDBOX');
    expect(normalizeTaxAuthorityAcknowledgementStatus('accepted')).toBe('ACCEPTED');
    expect(taxAuthoritySubmissionStatusFromAck('REJECTED')).toBe('REJECTED');

    const keyA = buildTaxAuthorityIdempotencyKey(draft);
    const keyB = buildTaxAuthorityIdempotencyKey({ ...draft, submissionMode: 'SANDBOX' });
    expect(keyA).toBe(keyB);
    expect(keyA).toHaveLength(64);
    expect(buildTaxAuthorityPayloadHash(draft.xmlPayload)).toHaveLength(64);

    expect(buildTaxAuthoritySubmissionId(draft, new Date('2026-05-04T02:03:04.000Z')))
      .toBe('TAX-BIR-1601FQ-Q1-2026-20260504020304');

    const retryAt = nextTaxAuthorityRetryAt(2, new Date('2026-05-04T00:00:00.000Z'), 30);
    expect(retryAt.toISOString()).toBe('2026-05-04T01:00:00.000Z');
  });

  it('rejects incomplete packets before external submission is recorded', () => {
    expect(() => requireEfpsSubmissionReady({ ...draft, xmlPayload: null })).toThrow(ValidationError);
    expect(() => requireEfpsSubmissionReady({ ...draft, quarter: 5 })).toThrow(ValidationError);
    expect(() => normalizeTaxAuthoritySubmissionMode('ftp')).toThrow(ValidationError);
    expect(() => normalizeTaxAuthorityAcknowledgementStatus('done')).toThrow(ValidationError);
  });

  it('builds an explicit eFPS request payload without requiring live credentials', () => {
    const payload = buildEfpsSubmissionPayload(draft);
    expect(payload).toMatchObject({
      authority_code: 'BIR',
      channel: 'EFPS',
      submission_mode: 'MANUAL_EVIDENCE',
      form_type: '1601FQ',
      period_key: '2026-Q1',
      filing_id: 12,
      credential_profile: 'MANUAL_OR_SANDBOX',
    });
    expect(payload.payload_hash).toHaveLength(64);
    expect(payload.xml_payload).toContain('<BIRForm1601FQ');
  });

  it('extends schema with filing-level authority evidence and submission ledger', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("efps_submission_id: text('efps_submission_id')");
    expect(schemaSource).toContain("authority_acknowledgement_payload: jsonb('authority_acknowledgement_payload').notNull().default({})");
    expect(schemaSource).toContain("submission_attempt_count: integer('submission_attempt_count').notNull().default(0)");
    expect(schemaSource).toContain('export const taxAuthoritySubmissions = pgTable');
    expect(schemaSource).toContain("submission_id: text('submission_id').unique().notNull()");
    expect(schemaSource).toContain("idempotency_key: text('idempotency_key').unique().notNull()");
    expect(schemaSource).toContain("retry_history: jsonb('retry_history').notNull().default([])");
    expect(schemaSource).toContain("uniqueIndex('ux_tax_authority_idempotency').on(table.idempotency_key)");
  });

  it('adds service operations for submit, acknowledge, retry, and audit evidence', () => {
    const serviceSource = read('server/services/tax-authority-submission-service.ts');
    expect(serviceSource).toContain('async submitForm1601FqToEfps');
    expect(serviceSource).toContain('async acknowledgeSubmission');
    expect(serviceSource).toContain('async scheduleRetry');
    expect(serviceSource).toContain('TAX_AUTHORITY_SUBMITTED');
    expect(serviceSource).toContain('TAX_AUTHORITY_ACK_');
    expect(serviceSource).toContain('TAX_AUTHORITY_RETRY_SCHEDULED');
    expect(serviceSource).toContain('schema.taxAuthoritySubmissions');
    expect(serviceSource).toContain('buildTaxAuthorityIdempotencyKey');
  });

  it('exposes governed tax authority routes and migration support', () => {
    const routeSource = read('server/routes/back-office/tax.ts');
    expect(routeSource).toContain("'/authority-submissions'");
    expect(routeSource).toContain("'/1601fq/:id/efps-submit'");
    expect(routeSource).toContain("'/authority-submissions/:submissionId/acknowledge'");
    expect(routeSource).toContain("'/authority-submissions/:submissionId/retry'");
    expect(routeSource).toContain("requireAnyRole('TAX_SPECIALIST', 'BO_HEAD', 'SYSTEM_ADMIN')");

    const migrationSource = read('drizzle/20260504_add_tax_authority_efps_submissions.sql');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS tax_authority_submissions');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS authority_acknowledgement_payload jsonb');
    expect(migrationSource).toContain('ux_tax_authority_idempotency');
    expect(migrationSource).toContain('BACKFILL_TAX_AUTHORITY_SUBMISSION');
  });
});
