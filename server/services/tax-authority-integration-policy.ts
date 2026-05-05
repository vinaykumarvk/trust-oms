import { createHash } from 'crypto';
import { ValidationError } from './service-errors';

export type TaxAuthoritySubmissionStatus =
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'FAILED'
  | 'RETRY_SCHEDULED';

export type TaxAuthorityAcknowledgementStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'FAILED';
export type TaxAuthoritySubmissionMode = 'LIVE' | 'SANDBOX' | 'MANUAL_EVIDENCE';

export interface EfpsSubmissionDraft {
  filingId: number;
  formType: '1601FQ';
  quarter: number;
  year: number;
  totalWithheld: string | null;
  xmlPayload: string | null;
  authorityCode?: string | null;
  channel?: string | null;
  submissionMode?: string | null;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeTaxAuthoritySubmissionMode(value?: string | null): TaxAuthoritySubmissionMode {
  const normalized = String(value || 'MANUAL_EVIDENCE').trim().toUpperCase();
  if (normalized === 'LIVE' || normalized === 'SANDBOX' || normalized === 'MANUAL_EVIDENCE') {
    return normalized;
  }
  throw new ValidationError(`Unsupported tax authority submission mode: ${value}`);
}

export function normalizeTaxAuthorityAcknowledgementStatus(value?: string | null): TaxAuthorityAcknowledgementStatus {
  const normalized = String(value || 'PENDING').trim().toUpperCase();
  if (normalized === 'PENDING' || normalized === 'ACCEPTED' || normalized === 'REJECTED' || normalized === 'FAILED') {
    return normalized;
  }
  throw new ValidationError(`Unsupported tax authority acknowledgement status: ${value}`);
}

export function taxAuthoritySubmissionStatusFromAck(
  ackStatus: TaxAuthorityAcknowledgementStatus,
): TaxAuthoritySubmissionStatus {
  if (ackStatus === 'ACCEPTED') return 'ACCEPTED';
  if (ackStatus === 'REJECTED') return 'REJECTED';
  if (ackStatus === 'FAILED') return 'FAILED';
  return 'SUBMITTED';
}

export function requireEfpsSubmissionReady(draft: EfpsSubmissionDraft): void {
  if (!Number.isInteger(draft.filingId) || draft.filingId <= 0) {
    throw new ValidationError('filingId must be a positive integer');
  }
  if (draft.formType !== '1601FQ') {
    throw new ValidationError('only BIR Form 1601-FQ eFPS submission is supported');
  }
  if (!Number.isInteger(draft.quarter) || draft.quarter < 1 || draft.quarter > 4) {
    throw new ValidationError('quarter must be 1-4');
  }
  if (!Number.isInteger(draft.year) || draft.year < 2000 || draft.year > 2100) {
    throw new ValidationError('year must be between 2000 and 2100');
  }
  if (!draft.xmlPayload || !draft.xmlPayload.includes('<BIRForm1601FQ')) {
    throw new ValidationError('1601-FQ XML payload is required before eFPS submission');
  }
}

export function buildTaxAuthorityPayloadHash(xmlPayload: string): string {
  return sha256(xmlPayload);
}

export function buildTaxAuthorityIdempotencyKey(draft: EfpsSubmissionDraft): string {
  requireEfpsSubmissionReady(draft);
  const payloadHash = buildTaxAuthorityPayloadHash(draft.xmlPayload || '');
  return sha256(stableStringify({
    authorityCode: String(draft.authorityCode || 'BIR').toUpperCase(),
    channel: String(draft.channel || 'EFPS').toUpperCase(),
    formType: draft.formType,
    filingId: draft.filingId,
    quarter: draft.quarter,
    year: draft.year,
    payloadHash,
  }));
}

export function buildTaxAuthoritySubmissionId(draft: EfpsSubmissionDraft, at: Date = new Date()): string {
  const stamp = at.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `TAX-${String(draft.authorityCode || 'BIR').toUpperCase()}-${draft.formType}-Q${draft.quarter}-${draft.year}-${stamp}`;
}

export function nextTaxAuthorityRetryAt(
  attemptCount: number,
  from: Date = new Date(),
  baseBackoffMinutes = 30,
): Date {
  const multiplier = Math.max(1, attemptCount);
  return new Date(from.getTime() + baseBackoffMinutes * multiplier * 60 * 1000);
}

export function buildEfpsSubmissionPayload(draft: EfpsSubmissionDraft): Record<string, unknown> {
  requireEfpsSubmissionReady(draft);
  const submissionMode = normalizeTaxAuthoritySubmissionMode(draft.submissionMode);
  const payloadHash = buildTaxAuthorityPayloadHash(draft.xmlPayload || '');
  return {
    authority_code: String(draft.authorityCode || 'BIR').toUpperCase(),
    channel: String(draft.channel || 'EFPS').toUpperCase(),
    submission_mode: submissionMode,
    form_type: draft.formType,
    period_key: `${draft.year}-Q${draft.quarter}`,
    filing_id: draft.filingId,
    total_withheld: draft.totalWithheld ?? '0',
    payload_hash: payloadHash,
    xml_payload: draft.xmlPayload,
    credential_profile: submissionMode === 'LIVE' ? 'BIR_EFPS_PRODUCTION' : 'MANUAL_OR_SANDBOX',
  };
}

export function buildTaxAuthorityEvidence(data: {
  action: string;
  submissionId: string;
  authorityReference?: string | null;
  acknowledgementStatus?: string | null;
  actorId?: string | number | null;
  reason?: string | null;
  payloadHash?: string | null;
  at?: Date;
}): Record<string, unknown> {
  return {
    action: data.action,
    submission_id: data.submissionId,
    authority_reference: data.authorityReference ?? null,
    acknowledgement_status: data.acknowledgementStatus ?? null,
    actor_id: data.actorId == null ? null : String(data.actorId),
    reason: data.reason ?? null,
    payload_hash: data.payloadHash ?? null,
    occurred_at: (data.at ?? new Date()).toISOString(),
  };
}
