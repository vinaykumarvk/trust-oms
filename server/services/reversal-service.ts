/**
 * Reversal Service (Phase 3E)
 *
 * Handles reversal case lifecycle: request, compliance approval,
 * execution of reversing entries, and queue management.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { notificationService } from './notification-service';

export const reversalService = {
  // -------------------------------------------------------------------------
  // Request a new reversal
  // -------------------------------------------------------------------------
  async requestReversal(data: {
    transactionId: string;
    reason: string;
    evidence?: string;
    requestedBy: number;
  }) {
    // H-002: reason is mandatory — reject empty/blank values
    if (!data.reason || !data.reason.trim()) {
      throw new Error('Reversal reason is required and cannot be blank.');
    }

    const [reversalCase] = await db
      .insert(schema.reversalCases)
      .values({
        original_transaction_id: data.transactionId,
        type: 'REVERSAL',
        reason: data.reason,
        evidence_url: data.evidence ?? null,
        requested_by: data.requestedBy,
        reversal_status: 'PENDING_COMPLIANCE',
      })
      .returning();

    return reversalCase;
  },

  // -------------------------------------------------------------------------
  // Approve a reversal (compliance)
  // -------------------------------------------------------------------------
  async approveReversal(caseId: number, approvedBy: number) {
    const [existing] = await db
      .select()
      .from(schema.reversalCases)
      .where(eq(schema.reversalCases.id, caseId))
      .limit(1);

    if (!existing) {
      throw new Error(`Reversal case not found: ${caseId}`);
    }
    if (existing.reversal_status !== 'PENDING_COMPLIANCE') {
      throw new Error(
        `Reversal case ${caseId} is not pending compliance (current: ${existing.reversal_status})`,
      );
    }
    if (existing.requested_by === approvedBy) {
      throw new Error('Self-approval is not allowed: approver must differ from requester');
    }

    const [updated] = await db
      .update(schema.reversalCases)
      .set({
        approved_by: approvedBy,
        reversal_status: 'APPROVED',
        updated_at: new Date(),
      })
      .where(eq(schema.reversalCases.id, caseId))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Reject a reversal
  // -------------------------------------------------------------------------
  async rejectReversal(caseId: number, _rejectedBy: number, reason: string) {
    const [existing] = await db
      .select()
      .from(schema.reversalCases)
      .where(eq(schema.reversalCases.id, caseId))
      .limit(1);

    if (!existing) {
      throw new Error(`Reversal case not found: ${caseId}`);
    }
    if (existing.reversal_status !== 'PENDING_COMPLIANCE') {
      throw new Error(
        `Reversal case ${caseId} is not pending compliance (current: ${existing.reversal_status})`,
      );
    }

    const [updated] = await db
      .update(schema.reversalCases)
      .set({
        reversal_status: 'REJECTED',
        reason: `${existing.reason ?? ''} | REJECTION: ${reason}`,
        updated_at: new Date(),
      })
      .where(eq(schema.reversalCases.id, caseId))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Execute a reversal (generate reversing entries)
  // -------------------------------------------------------------------------
  async executeReversal(caseId: number) {
    const [existing] = await db
      .select()
      .from(schema.reversalCases)
      .where(eq(schema.reversalCases.id, caseId))
      .limit(1);

    if (!existing) {
      throw new Error(`Reversal case not found: ${caseId}`);
    }
    if (existing.reversal_status !== 'APPROVED') {
      throw new Error(
        `Reversal case ${caseId} is not approved (current: ${existing.reversal_status})`,
      );
    }

    // Stub: generate reversing entries based on original transaction info
    const reversingEntries = {
      original_transaction_id: existing.original_transaction_id,
      reversal_date: new Date().toISOString(),
      entries: [
        {
          account: 'DEBIT',
          amount: 0,
          description: `Reversal of transaction ${existing.original_transaction_id}`,
        },
        {
          account: 'CREDIT',
          amount: 0,
          description: `Reversal of transaction ${existing.original_transaction_id}`,
        },
      ],
    };

    const [updated] = await db
      .update(schema.reversalCases)
      .set({
        reversal_status: 'EXECUTED',
        reversing_entries: reversingEntries,
        updated_at: new Date(),
      })
      .where(eq(schema.reversalCases.id, caseId))
      .returning();

    // FR-REV-002: Dispatch reversal advice notification to the requester
    const recipientId = existing.requested_by ? String(existing.requested_by) : 'system';
    const adviceContent = [
      `Reversal Case #${caseId} has been executed.`,
      `Original Transaction: ${existing.original_transaction_id}`,
      `Reason: ${existing.reason ?? 'N/A'}`,
      `Reversal Date: ${reversingEntries.reversal_date}`,
      `Reversing Entries: ${reversingEntries.entries.map((e: { account: string; amount: number; description: string }) => `${e.account} ${e.description}`).join('; ')}`,
      `Status: EXECUTED`,
    ].join('\n');

    await notificationService.dispatch({
      eventType: 'REVERSAL_ADVICE',
      channel: 'EMAIL',
      recipientId,
      recipientType: 'user',
      content: adviceContent,
    });

    return updated;
  },

  // -------------------------------------------------------------------------
  // Get reversal queue (paginated, filterable)
  // -------------------------------------------------------------------------
  async getReversalQueue(filters: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(eq(schema.reversalCases.reversal_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.reversalCases)
      .where(where)
      .orderBy(desc(schema.reversalCases.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.reversalCases)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // Get a single reversal case
  // -------------------------------------------------------------------------
  async getReversalCase(caseId: number) {
    const [reversalCase] = await db
      .select()
      .from(schema.reversalCases)
      .where(eq(schema.reversalCases.id, caseId))
      .limit(1);

    if (!reversalCase) {
      throw new Error(`Reversal case not found: ${caseId}`);
    }

    return reversalCase;
  },
};
