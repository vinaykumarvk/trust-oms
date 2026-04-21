/**
 * Maker-Checker Service
 *
 * Implements tiered approval workflows for TrustOMS Philippines.
 * Supports THREE approval tiers based on PHP amount thresholds:
 *   - TWO_EYES:  amount <= 50M PHP  (1 approver)
 *   - FOUR_EYES: 50M < amount <= 500M PHP  (2 approvers)
 *   - SIX_EYES:  amount > 500M PHP  (3 approvers)
 *
 * Functions:
 *   registerEntityTable()   - Register a Drizzle table for dynamic entity lookups
 *   getEntityTable()        - Retrieve registered entity table
 *   submitForApproval()     - Submit a mutation for approval (or auto-approve)
 *   reviewRequest()         - Approve or reject a pending request
 *   applyApprovedChange()   - Execute the create/update/delete on the entity table
 *   batchApprove()          - Batch approve multiple requests
 *   batchReject()           - Batch reject multiple requests
 *   cancelRequest()         - Cancel own pending request
 */

import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { eq, and, inArray, sql, getTableColumns } from 'drizzle-orm';
import { db } from '../db';
import { approvalWorkflowDefinitions, approvalRequests } from '@shared/schema';
import { logAuditEvent } from './audit-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnyPgTable = PgTable<any>;

export interface SubmitForApprovalParams {
  entityType: string;
  entityId: string | null;
  action: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  previousValues?: Record<string, unknown> | null;
  submittedBy: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewDecision {
  requestId: number;
  reviewerId: string;
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
}

// ---------------------------------------------------------------------------
// Tiered approval thresholds (PHP)
// ---------------------------------------------------------------------------

const TIER_THRESHOLDS = {
  TWO_EYES: 50_000_000, // <= 50M
  FOUR_EYES: 500_000_000, // <= 500M
  // SIX_EYES: > 500M
} as const;

// ---------------------------------------------------------------------------
// Entity table registry for dynamic lookups
// ---------------------------------------------------------------------------

const entityTableMap = new Map<string, AnyPgTable>();

export function registerEntityTable(entityKey: string, table: AnyPgTable): void {
  entityTableMap.set(entityKey, table);
}

export function getEntityTable(entityType: string): AnyPgTable | undefined {
  return entityTableMap.get(entityType);
}

// ---------------------------------------------------------------------------
// Helper: get primary key column from table
// ---------------------------------------------------------------------------

function getPkColumn(table: AnyPgTable): PgColumn | null {
  const columns = getTableColumns(table) as Record<string, PgColumn> | undefined;
  if (!columns) return null;
  // Try common PK names
  return columns.id ?? columns.client_id ?? columns.portfolio_id ?? columns.order_id ?? columns.trade_id ?? columns.block_id ?? columns.entity_key ?? null;
}

// ---------------------------------------------------------------------------
// Helper: determine approval tier from amount
// ---------------------------------------------------------------------------

function determineTier(payload: Record<string, unknown>): 'TWO_EYES' | 'FOUR_EYES' | 'SIX_EYES' {
  // Extract amount from common field names
  const amountValue =
    payload.amount ??
    payload.aum ??
    payload.total_nav ??
    payload.gross_amount ??
    payload.net_amount ??
    payload.cash_amount ??
    payload.market_value ??
    payload.quantity ??
    0;

  const amount = typeof amountValue === 'string' ? parseFloat(amountValue) : Number(amountValue);

  if (isNaN(amount) || amount <= TIER_THRESHOLDS.TWO_EYES) {
    return 'TWO_EYES';
  }
  if (amount <= TIER_THRESHOLDS.FOUR_EYES) {
    return 'FOUR_EYES';
  }
  return 'SIX_EYES';
}

// ---------------------------------------------------------------------------
// submitForApproval
// ---------------------------------------------------------------------------

export async function submitForApproval(
  params: SubmitForApprovalParams,
  userRole?: string,
): Promise<{ id: number; status: 'APPROVED' | 'PENDING'; autoApproved: boolean }> {
  const { entityType, entityId, action, payload, previousValues, submittedBy, metadata } = params;

  // Look up workflow definition
  let workflow: any = null;
  try {
    const workflows = await db
      .select()
      .from(approvalWorkflowDefinitions)
      .where(
        and(
          eq(approvalWorkflowDefinitions.entity_type, entityType),
          eq(approvalWorkflowDefinitions.action, action),
          eq(approvalWorkflowDefinitions.is_active, true),
        ),
      )
      .limit(1);
    workflow = workflows[0] ?? null;
  } catch {
    // Table may not exist yet — treat as no workflow
  }

  // No workflow defined — auto-approve and apply immediately
  if (!workflow) {
    const applied = await applyChange(entityType, entityId, action, payload);

    const [request] = await db
      .insert(approvalRequests)
      .values({
        entity_type: entityType,
        entity_id: applied.entityId ?? entityId,
        action,
        approval_status: 'APPROVED',
        payload: payload as Record<string, unknown>,
        previous_values: (previousValues as Record<string, unknown>) ?? null,
        submitted_by: isNaN(Number(submittedBy)) ? null : Number(submittedBy),
        submitted_at: new Date(),
        reviewed_by: isNaN(Number(submittedBy)) ? null : Number(submittedBy),
        reviewed_at: new Date(),
        review_comment: 'Auto-approved: no workflow defined',
        is_sla_breached: false,
      })
      .returning();

    logAuditEvent({
      entityType,
      entityId: applied.entityId ?? entityId ?? 'unknown',
      action: 'AUTHORIZE',
      actorId: submittedBy,
      actorRole: userRole,
      changes: { autoApproved: true, payload },
      metadata: metadata ?? undefined,
    }).catch(() => {});

    return { id: request.id, status: 'APPROVED', autoApproved: true };
  }

  // Check if user's role is in auto_approve_roles
  const autoApproveRoles: string[] = Array.isArray(workflow.auto_approve_roles)
    ? workflow.auto_approve_roles
    : [];

  if (userRole && autoApproveRoles.includes(userRole)) {
    const applied = await applyChange(entityType, entityId, action, payload);

    const [request] = await db
      .insert(approvalRequests)
      .values({
        entity_type: entityType,
        entity_id: applied.entityId ?? entityId,
        action,
        approval_status: 'APPROVED',
        payload: payload as Record<string, unknown>,
        previous_values: (previousValues as Record<string, unknown>) ?? null,
        submitted_by: isNaN(Number(submittedBy)) ? null : Number(submittedBy),
        submitted_at: new Date(),
        reviewed_by: isNaN(Number(submittedBy)) ? null : Number(submittedBy),
        reviewed_at: new Date(),
        review_comment: `Auto-approved: role ${userRole} in auto_approve_roles`,
        is_sla_breached: false,
      })
      .returning();

    logAuditEvent({
      entityType,
      entityId: applied.entityId ?? entityId ?? 'unknown',
      action: 'AUTHORIZE',
      actorId: submittedBy,
      actorRole: userRole,
      changes: { autoApproved: true, role: userRole, payload },
    }).catch(() => {});

    return { id: request.id, status: 'APPROVED', autoApproved: true };
  }

  // Determine approval tier
  const tier = determineTier(payload);

  // Calculate SLA deadline
  const slaHours = workflow.sla_hours ?? 24;
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  // Insert pending approval request
  const [request] = await db
    .insert(approvalRequests)
    .values({
      entity_type: entityType,
      entity_id: entityId,
      action,
      approval_status: 'PENDING',
      payload: { ...payload, _approvalTier: tier } as Record<string, unknown>,
      previous_values: (previousValues as Record<string, unknown>) ?? null,
      submitted_by: isNaN(Number(submittedBy)) ? null : Number(submittedBy),
      submitted_at: new Date(),
      sla_deadline: slaDeadline,
      is_sla_breached: false,
    })
    .returning();

  logAuditEvent({
    entityType,
    entityId: entityId ?? 'pending',
    action: 'CREATE',
    actorId: submittedBy,
    actorRole: userRole,
    changes: { submittedForApproval: true, tier, action, payload },
    metadata: { approvalRequestId: request.id, slaDeadline: slaDeadline.toISOString() },
  }).catch(() => {});

  return { id: request.id, status: 'PENDING', autoApproved: false };
}

// ---------------------------------------------------------------------------
// reviewRequest — approve or reject a pending request
// ---------------------------------------------------------------------------

export async function reviewRequest(
  requestId: number,
  reviewerId: string,
  decision: 'APPROVED' | 'REJECTED',
  comment?: string,
): Promise<{ success: boolean; message: string }> {
  // Fetch the request
  const rows = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, requestId))
    .limit(1);

  const request = rows[0];
  if (!request) {
    return { success: false, message: 'Approval request not found' };
  }

  if (request.approval_status !== 'PENDING') {
    return { success: false, message: `Request already ${request.approval_status}` };
  }

  // Self-approval prevention
  if (request.submitted_by !== null && String(request.submitted_by) === reviewerId) {
    return { success: false, message: 'Self-approval is not permitted' };
  }

  const reviewerIdNum = isNaN(Number(reviewerId)) ? null : Number(reviewerId);

  if (decision === 'APPROVED') {
    // Apply the change
    const payload = (request.payload as Record<string, unknown>) ?? {};
    // Remove tier metadata before applying
    const { _approvalTier, ...cleanPayload } = payload;

    await applyChange(
      request.entity_type ?? '',
      request.entity_id,
      (request.action as 'create' | 'update' | 'delete') ?? 'create',
      cleanPayload,
    );

    await db
      .update(approvalRequests)
      .set({
        approval_status: 'APPROVED',
        reviewed_by: reviewerIdNum,
        reviewed_at: new Date(),
        review_comment: comment ?? null,
      })
      .where(eq(approvalRequests.id, requestId));

    logAuditEvent({
      entityType: request.entity_type ?? '',
      entityId: request.entity_id ?? 'unknown',
      action: 'AUTHORIZE',
      actorId: reviewerId,
      changes: { decision: 'APPROVED', payload: cleanPayload },
      metadata: { approvalRequestId: requestId },
    }).catch(() => {});

    return { success: true, message: 'Request approved and changes applied' };
  }

  // REJECTED
  await db
    .update(approvalRequests)
    .set({
      approval_status: 'REJECTED',
      reviewed_by: reviewerIdNum,
      reviewed_at: new Date(),
      review_comment: comment ?? null,
    })
    .where(eq(approvalRequests.id, requestId));

  logAuditEvent({
    entityType: request.entity_type ?? '',
    entityId: request.entity_id ?? 'unknown',
    action: 'REJECT',
    actorId: reviewerId,
    changes: { decision: 'REJECTED', comment },
    metadata: { approvalRequestId: requestId },
  }).catch(() => {});

  return { success: true, message: 'Request rejected' };
}

// ---------------------------------------------------------------------------
// applyChange — execute the create/update/delete on the entity table
// ---------------------------------------------------------------------------

async function applyChange(
  entityType: string,
  entityId: string | null | undefined,
  action: 'create' | 'update' | 'delete',
  payload: Record<string, unknown>,
): Promise<{ entityId: string | null }> {
  const table = getEntityTable(entityType);
  if (!table) {
    console.warn(`[MAKER-CHECKER] No entity table registered for "${entityType}"`);
    return { entityId: entityId ?? null };
  }

  const pkCol = getPkColumn(table);

  if (action === 'create') {
    const [created] = await db.insert(table).values(payload as Record<string, unknown>).returning();
    const createdRecord = created as Record<string, unknown>;
    const newId = createdRecord?.id ?? createdRecord?.entity_key ?? null;
    return { entityId: newId ? String(newId) : null };
  }

  if (action === 'update' && entityId && pkCol) {
    const lookupValue = isNaN(Number(entityId)) ? entityId : Number(entityId);
    await db.update(table).set(payload as Record<string, unknown>).where(eq(pkCol, lookupValue));
    return { entityId };
  }

  if (action === 'delete' && entityId && pkCol) {
    const lookupValue = isNaN(Number(entityId)) ? entityId : Number(entityId);
    const columns = getTableColumns(table) as Record<string, PgColumn> | undefined;
    if (columns && 'is_deleted' in columns) {
      await db.update(table).set({ is_deleted: true } as Record<string, unknown>).where(eq(pkCol, lookupValue));
    } else {
      await db.delete(table).where(eq(pkCol, lookupValue));
    }
    return { entityId };
  }

  return { entityId: entityId ?? null };
}

// ---------------------------------------------------------------------------
// applyApprovedChange — public wrapper
// ---------------------------------------------------------------------------

export async function applyApprovedChange(
  request: {
    entity_type: string | null;
    entity_id: string | null;
    action: string | null;
    payload: unknown;
  },
): Promise<{ entityId: string | null }> {
  const payload = (request.payload as Record<string, unknown>) ?? {};
  const { _approvalTier, ...cleanPayload } = payload;

  return applyChange(
    request.entity_type ?? '',
    request.entity_id,
    (request.action as 'create' | 'update' | 'delete') ?? 'create',
    cleanPayload,
  );
}

// ---------------------------------------------------------------------------
// batchApprove — approve multiple pending requests
// ---------------------------------------------------------------------------

export async function batchApprove(
  requestIds: number[],
  reviewerId: string,
): Promise<{ approved: number[]; failed: Array<{ id: number; reason: string }> }> {
  const approved: number[] = [];
  const failed: Array<{ id: number; reason: string }> = [];

  for (const id of requestIds) {
    const result = await reviewRequest(id, reviewerId, 'APPROVED');
    if (result.success) {
      approved.push(id);
    } else {
      failed.push({ id, reason: result.message });
    }
  }

  return { approved, failed };
}

// ---------------------------------------------------------------------------
// batchReject — reject multiple pending requests
// ---------------------------------------------------------------------------

export async function batchReject(
  requestIds: number[],
  reviewerId: string,
  comment?: string,
): Promise<{ rejected: number[]; failed: Array<{ id: number; reason: string }> }> {
  const rejected: number[] = [];
  const failed: Array<{ id: number; reason: string }> = [];

  for (const id of requestIds) {
    const result = await reviewRequest(id, reviewerId, 'REJECTED', comment);
    if (result.success) {
      rejected.push(id);
    } else {
      failed.push({ id, reason: result.message });
    }
  }

  return { rejected, failed };
}

// ---------------------------------------------------------------------------
// cancelRequest — cancel own pending request
// ---------------------------------------------------------------------------

export async function cancelRequest(
  requestId: number,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const rows = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, requestId))
    .limit(1);

  const request = rows[0];
  if (!request) {
    return { success: false, message: 'Approval request not found' };
  }

  if (request.approval_status !== 'PENDING') {
    return { success: false, message: `Cannot cancel: request is ${request.approval_status}` };
  }

  // Only the submitter can cancel
  if (request.submitted_by !== null && String(request.submitted_by) !== userId) {
    return { success: false, message: 'Only the submitter can cancel this request' };
  }

  await db
    .update(approvalRequests)
    .set({
      approval_status: 'CANCELLED',
      reviewed_at: new Date(),
      review_comment: 'Cancelled by submitter',
    })
    .where(eq(approvalRequests.id, requestId));

  logAuditEvent({
    entityType: request.entity_type ?? '',
    entityId: request.entity_id ?? 'unknown',
    action: 'UPDATE',
    actorId: userId,
    changes: { cancelled: true },
    metadata: { approvalRequestId: requestId },
  }).catch(() => {});

  return { success: true, message: 'Request cancelled' };
}
