import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createHash } from 'crypto';

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      added++;
    }
  }
  return d;
}

export const dsarService = {
  async submitRequest(data: {
    request_type: string;
    requestor_name: string;
    requestor_email: string;
    subject_client_id: number;
    description?: string;
  }) {
    const now = new Date();
    const responseDeadline = addBusinessDays(now, 15);

    const [result] = await db
      .insert(schema.dsarRequests)
      .values({
        request_type: data.request_type,
        requestor_name: data.requestor_name,
        requestor_email: data.requestor_email,
        subject_client_id: data.subject_client_id,
        description: data.description ?? null,
        dsar_status: 'NEW',
        submitted_at: now,
        response_deadline: responseDeadline.toISOString().split('T')[0],
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();

    return result;
  },

  async processRequest(dsarId: number, userId: number) {
    const [dsar] = await db
      .select()
      .from(schema.dsarRequests)
      .where(eq(schema.dsarRequests.id, dsarId));

    if (!dsar) throw new Error(`DSAR request not found: ${dsarId}`);
    if (dsar.dsar_status !== 'NEW') {
      throw new Error(`DSAR ${dsarId} cannot be processed from status ${dsar.dsar_status}`);
    }

    // Compile PII inventory from piiClassifications table
    const piiClassifications = await db
      .select()
      .from(schema.piiClassifications)
      .where(eq(schema.piiClassifications.is_deleted, false));

    const piiInventory = piiClassifications.map((c: typeof piiClassifications[number]) => ({
      aggregate_type: c.aggregate_type,
      field_path: c.field_path,
      classification: c.classification,
      redaction_rule: c.redaction_rule,
    }));

    const now = new Date();
    let retentionNote: string | null = null;
    const retentionCheck = {
      checked_at: now.toISOString(),
      request_type: dsar.request_type,
      blocking_retention: dsar.request_type === 'ERASURE',
      basis: dsar.request_type === 'ERASURE'
        ? ['AMLA/BSP/BIR retention must be cleared before destructive erasure']
        : [],
    };
    if (dsar.request_type === 'ERASURE') {
      retentionNote = 'Erasure request — retention rules must be checked before proceeding. Data with active regulatory retention cannot be erased.';
    }
    const responsePayload = {
      request_id: dsarId,
      request_type: dsar.request_type,
      subject_client_id: dsar.subject_client_id,
      pii_inventory: piiInventory,
      retention_check: retentionCheck,
      generated_at: now.toISOString(),
    };
    const responseHash = hashPayload(responsePayload);

    const [result] = await db
      .update(schema.dsarRequests)
      .set({
        dsar_status: 'AWAITING_DPO',
        processed_at: now,
        processed_by: userId,
        artifact_bundle_url: `dsar://response-bundle/${dsarId}/${responseHash}`,
        response_payload_hash: responseHash,
        pii_inventory: {
          classifications: piiInventory,
          compiled_at: now.toISOString(),
          retention_note: retentionNote,
        },
        retention_check: retentionCheck,
        archival_status: 'READY_FOR_ARCHIVE',
        updated_by: String(userId),
        updated_at: now,
      })
      .where(eq(schema.dsarRequests.id, dsarId))
      .returning();

    return result;
  },

  async approveDsarResponse(dsarId: number, dpoUserId: number) {
    const [dsar] = await db
      .select()
      .from(schema.dsarRequests)
      .where(eq(schema.dsarRequests.id, dsarId));

    if (!dsar) throw new Error(`DSAR request not found: ${dsarId}`);
    if (dsar.dsar_status !== 'AWAITING_DPO') {
      throw new Error(`DSAR ${dsarId} cannot be approved from status ${dsar.dsar_status}`);
    }

    const now = new Date();
    const dpoEvidence = {
      approved_by: dpoUserId,
      approved_at: now.toISOString(),
      response_payload_hash: dsar.response_payload_hash,
      artifact_bundle_url: dsar.artifact_bundle_url,
    };
    const [result] = await db
      .update(schema.dsarRequests)
      .set({
        dsar_status: 'COMPLETED',
        approved_at: now,
        approved_by: dpoUserId,
        dpo_decision_evidence: dpoEvidence,
        delivery_status: 'READY',
        updated_by: String(dpoUserId),
        updated_at: now,
      })
      .where(eq(schema.dsarRequests.id, dsarId))
      .returning();

    return result;
  },

  async recordDelivery(dsarId: number, deliveredBy: number, evidence: {
    channel?: string;
    recipient?: string;
    delivery_reference?: string;
  }) {
    const [dsar] = await db
      .select()
      .from(schema.dsarRequests)
      .where(eq(schema.dsarRequests.id, dsarId));
    if (!dsar) throw new Error(`DSAR request not found: ${dsarId}`);
    if (dsar.dsar_status !== 'COMPLETED') {
      throw new Error(`DSAR ${dsarId} must be completed before delivery can be recorded`);
    }
    const now = new Date();
    const deliveryEvidence = {
      delivered_by: deliveredBy,
      delivered_at: now.toISOString(),
      channel: evidence.channel ?? 'SECURE_PORTAL',
      recipient: evidence.recipient ?? dsar.requestor_email,
      delivery_reference: evidence.delivery_reference ?? null,
      response_payload_hash: dsar.response_payload_hash,
    };
    const [updated] = await db
      .update(schema.dsarRequests)
      .set({
        delivery_status: 'DELIVERED',
        delivery_evidence: deliveryEvidence,
        updated_by: String(deliveredBy),
        updated_at: now,
      })
      .where(eq(schema.dsarRequests.id, dsarId))
      .returning();
    return updated;
  },

  async archiveResponse(dsarId: number, archivedBy: number, evidence: {
    archive_uri?: string;
    retention_until?: string;
  }) {
    const [dsar] = await db
      .select()
      .from(schema.dsarRequests)
      .where(eq(schema.dsarRequests.id, dsarId));
    if (!dsar) throw new Error(`DSAR request not found: ${dsarId}`);
    const now = new Date();
    const archivalEvidence = {
      archived_by: archivedBy,
      archived_at: now.toISOString(),
      archive_uri: evidence.archive_uri ?? `worm://dsar/${dsarId}/${dsar.response_payload_hash ?? 'pending'}`,
      retention_until: evidence.retention_until ?? null,
      response_payload_hash: dsar.response_payload_hash,
    };
    const [updated] = await db
      .update(schema.dsarRequests)
      .set({
        archival_status: 'ARCHIVED',
        archival_evidence: archivalEvidence,
        updated_by: String(archivedBy),
        updated_at: now,
      })
      .where(eq(schema.dsarRequests.id, dsarId))
      .returning();
    return updated;
  },

  async rejectDsar(dsarId: number, reason: string) {
    const [dsar] = await db
      .select()
      .from(schema.dsarRequests)
      .where(eq(schema.dsarRequests.id, dsarId));

    if (!dsar) throw new Error(`DSAR request not found: ${dsarId}`);

    const now = new Date();
    const [result] = await db
      .update(schema.dsarRequests)
      .set({
        dsar_status: 'REJECTED',
        description: dsar.description
          ? `${dsar.description}\n\nRejection reason: ${reason}`
          : `Rejection reason: ${reason}`,
        updated_by: 'system',
        updated_at: now,
      })
      .where(eq(schema.dsarRequests.id, dsarId))
      .returning();

    return result;
  },

  async getAll(filters: {
    status?: string;
    request_type?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.dsarRequests.is_deleted, false)];

    if (filters.status) {
      conditions.push(eq(schema.dsarRequests.dsar_status, filters.status as any));
    }
    if (filters.request_type) {
      conditions.push(eq(schema.dsarRequests.request_type, filters.request_type));
    }

    const data = await db
      .select()
      .from(schema.dsarRequests)
      .where(and(...conditions))
      .orderBy(desc(schema.dsarRequests.submitted_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.dsarRequests)
      .where(and(...conditions));

    return { data, total: Number(count), page, pageSize };
  },

  async getById(id: number) {
    const [result] = await db
      .select()
      .from(schema.dsarRequests)
      .where(
        and(
          eq(schema.dsarRequests.id, id),
          eq(schema.dsarRequests.is_deleted, false),
        ),
      );

    if (!result) throw new Error(`DSAR request not found: ${id}`);
    return result;
  },

  async checkSlaBreaches(businessDate: Date) {
    const allOpen = await db
      .select()
      .from(schema.dsarRequests)
      .where(
        and(
          eq(schema.dsarRequests.is_deleted, false),
          sql`${schema.dsarRequests.dsar_status} NOT IN ('COMPLETED', 'REJECTED')`,
        ),
      );

    const breaches: Array<{
      id: number;
      request_type: string;
      requestor_name: string;
      response_deadline: string;
      days_remaining: number;
      severity: 'T-5' | 'T-1' | 'OVERDUE';
    }> = [];

    for (const dsar of allOpen) {
      const deadline = new Date(dsar.response_deadline);
      const diffMs = deadline.getTime() - businessDate.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysRemaining <= 5) {
        let severity: 'T-5' | 'T-1' | 'OVERDUE';
        if (daysRemaining < 0) {
          severity = 'OVERDUE';
        } else if (daysRemaining <= 1) {
          severity = 'T-1';
        } else {
          severity = 'T-5';
        }

        breaches.push({
          id: dsar.id,
          request_type: dsar.request_type,
          requestor_name: dsar.requestor_name,
          response_deadline: dsar.response_deadline,
          days_remaining: daysRemaining,
          severity,
        });
        await db
          .update(schema.dsarRequests)
          .set({
            sla_alerts: sql`COALESCE(${schema.dsarRequests.sla_alerts}, '[]'::jsonb) || ${JSON.stringify([{ severity, days_remaining: daysRemaining, alerted_at: businessDate.toISOString() }])}::jsonb`,
            updated_at: new Date(),
            updated_by: 'DSAR_SLA_JOB',
          } as any)
          .where(eq(schema.dsarRequests.id, dsar.id));
      }
    }

    return breaches;
  },
};
