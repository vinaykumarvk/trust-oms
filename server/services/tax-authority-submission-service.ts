import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { logAuditEvent } from './audit-logger';
import { ConflictError, NotFoundError, ValidationError } from './service-errors';
import {
  buildEfpsSubmissionPayload,
  buildTaxAuthorityEvidence,
  buildTaxAuthorityIdempotencyKey,
  buildTaxAuthorityPayloadHash,
  buildTaxAuthoritySubmissionId,
  nextTaxAuthorityRetryAt,
  normalizeTaxAuthorityAcknowledgementStatus,
  normalizeTaxAuthoritySubmissionMode,
  requireEfpsSubmissionReady,
  taxAuthoritySubmissionStatusFromAck,
} from './tax-authority-integration-policy';

type Form1601Fq = typeof schema.form1601fq.$inferSelect;
type TaxAuthoritySubmission = typeof schema.taxAuthoritySubmissions.$inferSelect;

export interface TaxAuthorityActorContext {
  actorId?: string | number | null;
  actorRole?: string | null;
  ipAddress?: string;
  correlationId?: string;
}

export interface SubmitForm1601FqToEfpsInput {
  submissionMode?: string | null;
  channel?: string | null;
  maxAttempts?: number;
}

export interface AcknowledgeTaxAuthoritySubmissionInput {
  acknowledgementStatus?: string | null;
  authorityReference?: string | null;
  acknowledgementPayload?: Record<string, unknown> | null;
  rejectionReason?: string | null;
}

export interface RetryTaxAuthoritySubmissionInput {
  reason?: string | null;
}

function actorId(context?: TaxAuthorityActorContext): string | undefined {
  if (context?.actorId === undefined || context.actorId === null) return undefined;
  return String(context.actorId);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function requireReason(reason: string | null | undefined, fallback: string): string {
  const normalized = (reason || fallback).trim();
  if (normalized.length < 10) throw new ValidationError('reason must be at least 10 characters');
  return normalized;
}

function retryHistoryEntry(action: string, context: TaxAuthorityActorContext | undefined, reason?: string | null) {
  return {
    action,
    at: new Date().toISOString(),
    actor_id: actorId(context) ?? null,
    reason: reason ?? null,
  };
}

function appendRetryHistorySql(entry: Record<string, unknown>) {
  return sql`coalesce(${schema.taxAuthoritySubmissions.retry_history}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`;
}

async function auditTaxAuthorityAction(
  action: string,
  submissionId: string,
  context: TaxAuthorityActorContext | undefined,
  changes: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    entityType: 'tax_authority_submission',
    entityId: submissionId,
    action,
    actorId: actorId(context),
    actorRole: context?.actorRole ?? undefined,
    source: {
      system: 'TRUST_OMS',
      channel: 'BACK_OFFICE',
      component: 'tax-authority-submission-service',
    },
    changes,
    ipAddress: context?.ipAddress,
    correlationId: context?.correlationId,
  });
}

async function getFiling(id: number): Promise<Form1601Fq> {
  const [filing] = await db
    .select()
    .from(schema.form1601fq)
    .where(and(eq(schema.form1601fq.id, id), eq(schema.form1601fq.is_deleted, false)))
    .limit(1);

  if (!filing) throw new NotFoundError(`Form 1601-FQ filing ${id} not found`);
  return filing;
}

function filingDraft(filing: Form1601Fq, input: SubmitForm1601FqToEfpsInput) {
  return {
    filingId: filing.id,
    formType: '1601FQ' as const,
    quarter: filing.quarter,
    year: filing.year,
    totalWithheld: filing.total_withheld,
    xmlPayload: filing.xml_payload,
    authorityCode: 'BIR',
    channel: input.channel || filing.efps_channel || 'EFPS',
    submissionMode: input.submissionMode || 'MANUAL_EVIDENCE',
  };
}

export const taxAuthoritySubmissionService = {
  async listSubmissions(filters: {
    filingId?: number;
    status?: string;
  } = {}): Promise<TaxAuthoritySubmission[]> {
    const conditions = [eq(schema.taxAuthoritySubmissions.is_deleted, false)];
    if (filters.filingId) conditions.push(eq(schema.taxAuthoritySubmissions.form1601fq_id, filters.filingId));
    if (filters.status) conditions.push(eq(schema.taxAuthoritySubmissions.submission_status, filters.status));

    return db
      .select()
      .from(schema.taxAuthoritySubmissions)
      .where(and(...conditions))
      .orderBy(desc(schema.taxAuthoritySubmissions.submitted_at));
  },

  async submitForm1601FqToEfps(
    filingId: number,
    input: SubmitForm1601FqToEfpsInput = {},
    context?: TaxAuthorityActorContext,
  ): Promise<{ filing: Form1601Fq; submission: TaxAuthoritySubmission; reused: boolean }> {
    const filing = await getFiling(filingId);
    const draft = filingDraft(filing, input);
    requireEfpsSubmissionReady(draft);
    const submissionMode = normalizeTaxAuthoritySubmissionMode(draft.submissionMode);
    const idempotencyKey = buildTaxAuthorityIdempotencyKey(draft);
    const payloadHash = buildTaxAuthorityPayloadHash(draft.xmlPayload || '');

    const [existing] = await db
      .select()
      .from(schema.taxAuthoritySubmissions)
      .where(and(
        eq(schema.taxAuthoritySubmissions.idempotency_key, idempotencyKey),
        eq(schema.taxAuthoritySubmissions.is_deleted, false),
      ))
      .limit(1);

    if (existing) {
      return { filing, submission: existing, reused: true };
    }

    const now = new Date();
    const submissionId = buildTaxAuthoritySubmissionId(draft, now);
    const requestPayload = buildEfpsSubmissionPayload(draft);
    const maxAttempts = Math.max(1, Math.min(Number(input.maxAttempts ?? 3), 10));

    const [submission] = await db
      .insert(schema.taxAuthoritySubmissions)
      .values({
        submission_id: submissionId,
        form1601fq_id: filing.id,
        tax_form_type: '1601FQ',
        authority_code: 'BIR',
        channel: String(draft.channel || 'EFPS').toUpperCase(),
        submission_mode: submissionMode,
        period_key: `${filing.year}-Q${filing.quarter}`,
        idempotency_key: idempotencyKey,
        payload_hash: payloadHash,
        request_payload: requestPayload,
        response_payload: {},
        submission_status: 'SUBMITTED',
        acknowledgement_status: 'PENDING',
        attempt_count: 1,
        max_attempts: maxAttempts,
        submitted_by: actorId(context),
        submitted_at: now,
        retry_history: [retryHistoryEntry('SUBMITTED', context, `Submitted ${submissionMode} eFPS packet`)],
        evidence_payload: buildTaxAuthorityEvidence({
          action: 'SUBMIT_EFPS_PACKET',
          submissionId,
          acknowledgementStatus: 'PENDING',
          actorId: context?.actorId,
          payloadHash,
          at: now,
        }),
        created_by: actorId(context),
        updated_by: actorId(context),
      })
      .returning();

    const [updatedFiling] = await db
      .update(schema.form1601fq)
      .set({
        filing_status: 'SUBMITTED',
        filing_date: filing.filing_date ?? today(),
        submission_ref: submissionId,
        efps_submission_id: submissionId,
        efps_channel: String(draft.channel || 'EFPS').toUpperCase(),
        authority_status: 'SUBMITTED',
        submission_payload_hash: payloadHash,
        submission_attempt_count: (filing.submission_attempt_count ?? 0) + 1,
        last_submitted_at: now,
        next_retry_at: null,
        last_submission_error: null,
        authority_evidence_payload: buildTaxAuthorityEvidence({
          action: 'SUBMIT_EFPS_PACKET',
          submissionId,
          acknowledgementStatus: 'PENDING',
          actorId: context?.actorId,
          payloadHash,
          at: now,
        }),
        updated_at: now,
        updated_by: actorId(context),
      })
      .where(eq(schema.form1601fq.id, filing.id))
      .returning();

    await auditTaxAuthorityAction('TAX_AUTHORITY_SUBMITTED', submissionId, context, {
      filing_id: filing.id,
      form_type: '1601FQ',
      period_key: `${filing.year}-Q${filing.quarter}`,
      submission_mode: submissionMode,
      payload_hash: payloadHash,
    });

    return { filing: updatedFiling, submission, reused: false };
  },

  async acknowledgeSubmission(
    submissionId: string,
    input: AcknowledgeTaxAuthoritySubmissionInput,
    context?: TaxAuthorityActorContext,
  ): Promise<{ filing: Form1601Fq | null; submission: TaxAuthoritySubmission }> {
    const [submission] = await db
      .select()
      .from(schema.taxAuthoritySubmissions)
      .where(eq(schema.taxAuthoritySubmissions.submission_id, submissionId))
      .limit(1);

    if (!submission || submission.is_deleted) throw new NotFoundError(`Tax authority submission '${submissionId}' not found`);

    const acknowledgementStatus = normalizeTaxAuthorityAcknowledgementStatus(input.acknowledgementStatus);
    if (acknowledgementStatus === 'PENDING') {
      throw new ValidationError('acknowledgement_status must be ACCEPTED, REJECTED, or FAILED');
    }

    const authorityReference = input.authorityReference?.trim() || submission.authority_reference || null;
    if (acknowledgementStatus === 'ACCEPTED' && !authorityReference) {
      throw new ValidationError('authority_reference is required for accepted eFPS acknowledgement');
    }

    const now = new Date();
    const submissionStatus = taxAuthoritySubmissionStatusFromAck(acknowledgementStatus);
    const acknowledgementPayload = input.acknowledgementPayload ?? {};
    const [updatedSubmission] = await db
      .update(schema.taxAuthoritySubmissions)
      .set({
        submission_status: submissionStatus,
        acknowledgement_status: acknowledgementStatus,
        authority_reference: authorityReference,
        acknowledgement_payload: acknowledgementPayload,
        response_payload: acknowledgementPayload,
        acknowledged_at: now,
        last_error: acknowledgementStatus === 'ACCEPTED' ? null : input.rejectionReason ?? 'Authority acknowledgement did not accept filing',
        retry_history: appendRetryHistorySql(retryHistoryEntry(`ACK_${acknowledgementStatus}`, context, input.rejectionReason)),
        evidence_payload: buildTaxAuthorityEvidence({
          action: `ACK_${acknowledgementStatus}`,
          submissionId,
          authorityReference,
          acknowledgementStatus,
          actorId: context?.actorId,
          payloadHash: submission.payload_hash,
          reason: input.rejectionReason,
          at: now,
        }),
        updated_at: now,
        updated_by: actorId(context),
      })
      .where(eq(schema.taxAuthoritySubmissions.id, submission.id))
      .returning();

    let updatedFiling: Form1601Fq | null = null;
    if (submission.form1601fq_id) {
      const [filing] = await db
        .update(schema.form1601fq)
        .set({
          filing_status: submissionStatus,
          authority_status: submissionStatus,
          authority_reference: authorityReference,
          authority_acknowledgement_payload: acknowledgementPayload,
          last_submission_error: acknowledgementStatus === 'ACCEPTED' ? null : input.rejectionReason ?? 'Authority acknowledgement did not accept filing',
          authority_evidence_payload: buildTaxAuthorityEvidence({
            action: `ACK_${acknowledgementStatus}`,
            submissionId,
            authorityReference,
            acknowledgementStatus,
            actorId: context?.actorId,
            payloadHash: submission.payload_hash,
            reason: input.rejectionReason,
            at: now,
          }),
          updated_at: now,
          updated_by: actorId(context),
        })
        .where(eq(schema.form1601fq.id, submission.form1601fq_id))
        .returning();
      updatedFiling = filing ?? null;
    }

    await auditTaxAuthorityAction(`TAX_AUTHORITY_ACK_${acknowledgementStatus}`, submissionId, context, {
      authority_reference: authorityReference,
      acknowledgement_status: acknowledgementStatus,
      submission_status: submissionStatus,
    });

    return { filing: updatedFiling, submission: updatedSubmission };
  },

  async scheduleRetry(
    submissionId: string,
    input: RetryTaxAuthoritySubmissionInput,
    context?: TaxAuthorityActorContext,
  ): Promise<TaxAuthoritySubmission> {
    const [submission] = await db
      .select()
      .from(schema.taxAuthoritySubmissions)
      .where(eq(schema.taxAuthoritySubmissions.submission_id, submissionId))
      .limit(1);

    if (!submission || submission.is_deleted) throw new NotFoundError(`Tax authority submission '${submissionId}' not found`);
    if (submission.submission_status === 'ACCEPTED') throw new ConflictError('accepted tax authority submissions cannot be retried');
    if ((submission.attempt_count ?? 0) >= (submission.max_attempts ?? 3)) {
      throw new ConflictError('tax authority submission has reached the maximum retry count');
    }

    const reason = requireReason(input.reason, 'Retry scheduled for tax authority submission');
    const now = new Date();
    const nextRetry = nextTaxAuthorityRetryAt(submission.attempt_count ?? 1, now);
    const [updated] = await db
      .update(schema.taxAuthoritySubmissions)
      .set({
        submission_status: 'RETRY_SCHEDULED',
        acknowledgement_status: 'PENDING',
        attempt_count: (submission.attempt_count ?? 0) + 1,
        next_retry_at: nextRetry,
        last_error: reason,
        retry_history: appendRetryHistorySql(retryHistoryEntry('RETRY_SCHEDULED', context, reason)),
        evidence_payload: buildTaxAuthorityEvidence({
          action: 'RETRY_SCHEDULED',
          submissionId,
          acknowledgementStatus: 'PENDING',
          actorId: context?.actorId,
          payloadHash: submission.payload_hash,
          reason,
          at: now,
        }),
        updated_at: now,
        updated_by: actorId(context),
      })
      .where(eq(schema.taxAuthoritySubmissions.id, submission.id))
      .returning();

    if (submission.form1601fq_id) {
      await db
        .update(schema.form1601fq)
        .set({
          authority_status: 'RETRY_SCHEDULED',
          next_retry_at: nextRetry,
          last_submission_error: reason,
          updated_at: now,
          updated_by: actorId(context),
        })
        .where(eq(schema.form1601fq.id, submission.form1601fq_id));
    }

    await auditTaxAuthorityAction('TAX_AUTHORITY_RETRY_SCHEDULED', submissionId, context, {
      next_retry_at: nextRetry.toISOString(),
      reason,
    });

    return updated;
  },
};
