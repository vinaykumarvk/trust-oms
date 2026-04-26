/**
 * GL Authorization Service — Enterprise Authorization Matrix & Audit
 *
 * Implements:
 *   AUTH-001: Configurable authorization matrix (entity/action/amount tiers)
 *   AUTH-003: Multi-level approval with maker≠checker enforcement
 *   AUTH-004: Approval delegation with expiry tracking
 *   AUTH-005: Authorization audit trail
 *   POST-006: Amount-based authorization tiers
 *   BR-006: Maker/checker separation
 *   BR-008: System journal protection (no cancellation of system-generated journals)
 *   BR-009: Amendment scope check
 *   EOD-003: Posting exception creation for permanent failures
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, lte, gte, isNull, or } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthorizationConfig {
  required_approvers: number;
  approval_level: string;
  role_required: string | null;
  matrix_id: number;
}

interface ApprovalSubmission {
  objectType: string;
  objectId: number;
  action: string;
  makerId: number;
  amount?: number;
  reason?: string;
}

interface ApprovalReview {
  taskId: number;
  reviewerId: number;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const glAuthorizationService = {
  // =========================================================================
  // Authorization Matrix CRUD
  // =========================================================================

  async getAuthorizationMatrixEntries(entityType?: string) {
    if (entityType) {
      return db
        .select()
        .from(schema.glAuthorizationMatrix)
        .where(
          and(
            eq(schema.glAuthorizationMatrix.entity_type, entityType),
            eq(schema.glAuthorizationMatrix.is_active, true),
          ),
        )
        .orderBy(schema.glAuthorizationMatrix.entity_type, schema.glAuthorizationMatrix.amount_from);
    }
    return db
      .select()
      .from(schema.glAuthorizationMatrix)
      .where(eq(schema.glAuthorizationMatrix.is_active, true))
      .orderBy(schema.glAuthorizationMatrix.entity_type, schema.glAuthorizationMatrix.amount_from);
  },

  async createAuthorizationMatrixEntry(data: {
    entity_type: string;
    action: string;
    amount_from?: string;
    amount_to?: string;
    required_approvers: number;
    approval_level: string;
    role_required?: string;
  }) {
    const [record] = await db
      .insert(schema.glAuthorizationMatrix)
      .values({
        entity_type: data.entity_type,
        action: data.action,
        amount_from: data.amount_from ?? '0',
        amount_to: data.amount_to ?? null,
        required_approvers: data.required_approvers,
        approval_level: data.approval_level,
        role_required: data.role_required ?? null,
        is_active: true,
      })
      .returning();
    return record;
  },

  async updateAuthorizationMatrixEntry(id: number, data: Record<string, unknown>) {
    const [updated] = await db
      .update(schema.glAuthorizationMatrix)
      .set({ ...data, updated_at: new Date() })
      .where(eq(schema.glAuthorizationMatrix.id, id))
      .returning();
    return updated;
  },

  // =========================================================================
  // AUTH-001, POST-006: Lookup matrix for required approval level
  // =========================================================================

  async getAuthorizationConfig(
    entityType: string,
    action: string,
    amount?: number,
  ): Promise<AuthorizationConfig | null> {
    const conditions = [
      eq(schema.glAuthorizationMatrix.entity_type, entityType),
      eq(schema.glAuthorizationMatrix.action, action),
      eq(schema.glAuthorizationMatrix.is_active, true),
    ];

    const entries = await db
      .select()
      .from(schema.glAuthorizationMatrix)
      .where(and(...conditions))
      .orderBy(desc(schema.glAuthorizationMatrix.amount_from));

    if (entries.length === 0) {
      // Default: single approver, STANDARD level
      return {
        required_approvers: 1,
        approval_level: 'STANDARD',
        role_required: null,
        matrix_id: 0,
      };
    }

    // Find the matching tier based on amount
    if (amount != null) {
      for (const entry of entries) {
        const from = toNum(entry.amount_from);
        const to = entry.amount_to ? toNum(entry.amount_to) : Infinity;
        if (amount >= from && amount <= to) {
          return {
            required_approvers: entry.required_approvers,
            approval_level: entry.approval_level,
            role_required: entry.role_required,
            matrix_id: entry.id,
          };
        }
      }
    }

    // Return first matching entry (lowest tier)
    const entry = entries[entries.length - 1];
    return {
      required_approvers: entry.required_approvers,
      approval_level: entry.approval_level,
      role_required: entry.role_required,
      matrix_id: entry.id,
    };
  },

  // =========================================================================
  // AUTH-003: Submit for GL approval (create auth task + determine tier)
  // =========================================================================

  async submitForGlApproval(params: ApprovalSubmission): Promise<{
    auth_task_id: number;
    required_approvers: number;
    approval_level: string;
  }> {
    // Determine authorization config from matrix
    const config = await this.getAuthorizationConfig(
      params.objectType,
      params.action,
      params.amount,
    );

    const [authTask] = await db
      .insert(schema.glAuthorizationTasks)
      .values({
        object_type: params.objectType,
        object_id: params.objectId,
        action: params.action,
        maker_id: params.makerId,
        auth_status: 'PENDING',
        reason: params.reason ?? null,
      })
      .returning();

    // Log submission to audit
    await db.insert(schema.glAuthorizationAuditLog).values({
      auth_task_id: authTask.id,
      object_type: params.objectType,
      object_id: params.objectId,
      action: params.action,
      actor_id: params.makerId,
      decision: 'SUBMITTED',
      reason: params.reason ?? null,
      amount: params.amount ? String(params.amount) : null,
      approval_level: config?.approval_level ?? 'STANDARD',
    });

    return {
      auth_task_id: authTask.id,
      required_approvers: config?.required_approvers ?? 1,
      approval_level: config?.approval_level ?? 'STANDARD',
    };
  },

  // =========================================================================
  // AUTH-003, BR-006: Review GL approval (approve/reject with maker≠checker)
  // =========================================================================

  async reviewGlApproval(params: ApprovalReview): Promise<{
    auth_task_id: number;
    status: string;
    message: string;
  }> {
    const [task] = await db
      .select()
      .from(schema.glAuthorizationTasks)
      .where(eq(schema.glAuthorizationTasks.id, params.taskId))
      .limit(1);

    if (!task) {
      throw new Error(`Authorization task not found: ${params.taskId}`);
    }

    if (task.auth_status !== 'PENDING') {
      throw new Error(`Task ${params.taskId} already ${task.auth_status}`);
    }

    // BR-006: Maker/checker separation
    if (task.maker_id === params.reviewerId) {
      throw new Error(
        `Maker/checker violation: reviewer (${params.reviewerId}) cannot be the same as maker (${task.maker_id})`,
      );
    }

    // Get authorization config to check if we have enough approvers
    const config = await this.getAuthorizationConfig(task.object_type, task.action);
    const requiredApprovers = config?.required_approvers ?? 1;

    // Count existing approvals for this task
    const existingApprovals = await db
      .select()
      .from(schema.glAuthorizationAuditLog)
      .where(
        and(
          eq(schema.glAuthorizationAuditLog.auth_task_id, params.taskId),
          eq(schema.glAuthorizationAuditLog.decision, 'APPROVED'),
        ),
      );

    const newStatus =
      params.decision === 'REJECTED'
        ? 'REJECTED'
        : existingApprovals.length + 1 >= requiredApprovers
          ? 'APPROVED'
          : 'PENDING';

    // Update auth task
    await db
      .update(schema.glAuthorizationTasks)
      .set({
        checker_id: params.reviewerId,
        auth_status: newStatus,
        reason: params.reason ?? task.reason,
        checker_timestamp: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.glAuthorizationTasks.id, params.taskId));

    // Log decision to audit
    await db.insert(schema.glAuthorizationAuditLog).values({
      auth_task_id: params.taskId,
      object_type: task.object_type,
      object_id: task.object_id,
      action: task.action,
      actor_id: params.reviewerId,
      decision: params.decision,
      reason: params.reason ?? null,
      approval_level: config?.approval_level ?? 'STANDARD',
    });

    return {
      auth_task_id: params.taskId,
      status: newStatus,
      message:
        newStatus === 'APPROVED'
          ? 'Approval complete'
          : newStatus === 'REJECTED'
            ? 'Request rejected'
            : `Approval ${existingApprovals.length + 1}/${requiredApprovers} recorded`,
    };
  },

  // =========================================================================
  // AUTH-005: Full approval history (audit trail)
  // =========================================================================

  async getApprovalHistory(objectType: string, objectId: number) {
    return db
      .select()
      .from(schema.glAuthorizationAuditLog)
      .where(
        and(
          eq(schema.glAuthorizationAuditLog.object_type, objectType),
          eq(schema.glAuthorizationAuditLog.object_id, objectId),
        ),
      )
      .orderBy(desc(schema.glAuthorizationAuditLog.timestamp));
  },

  // =========================================================================
  // Evaluate matrix for given params (POST /auth-matrix/evaluate)
  // =========================================================================

  async evaluateMatrix(params: {
    entityType: string;
    action: string;
    amount?: number;
  }) {
    const config = await this.getAuthorizationConfig(
      params.entityType,
      params.action,
      params.amount,
    );
    return {
      entity_type: params.entityType,
      action: params.action,
      amount: params.amount,
      ...config,
    };
  },

  // =========================================================================
  // BR-008: System journal check (prevent cancellation)
  // =========================================================================

  async isSystemJournal(batchId: number): Promise<boolean> {
    const [batch] = await db
      .select({ posting_mode: schema.glJournalBatches.posting_mode })
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!batch) return false;

    const systemModes = ['EOD', 'SOD', 'MOD', 'YEAR_END', 'NAV_FINALIZATION', 'FX_REVAL'];
    return systemModes.includes(batch.posting_mode);
  },

  // =========================================================================
  // BR-009: Amendment scope check
  // =========================================================================

  async canAmend(batchId: number, userId: number): Promise<{
    canAmend: boolean;
    reason?: string;
  }> {
    const [batch] = await db
      .select()
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return { canAmend: false, reason: 'Batch not found' };
    }

    // Only DRAFT or REJECTED batches can be amended
    if (!['DRAFT', 'REJECTED'].includes(batch.batch_status)) {
      return {
        canAmend: false,
        reason: `Cannot amend batch in status ${batch.batch_status}; must be DRAFT or REJECTED`,
      };
    }

    // System journals cannot be amended
    const isSystem = await this.isSystemJournal(batchId);
    if (isSystem) {
      return { canAmend: false, reason: 'System-generated journals cannot be amended' };
    }

    // Only maker can amend their own batch
    if (batch.maker_id && batch.maker_id !== userId) {
      return {
        canAmend: false,
        reason: `Only the maker (${batch.maker_id}) can amend this batch`,
      };
    }

    return { canAmend: true };
  },

  // =========================================================================
  // AUTH-004: Delegate approval with expiry tracking
  // =========================================================================

  async delegateApproval(params: {
    taskId: number;
    delegatorId: number;
    delegateToId: number;
    expiresAt?: Date;
    reason?: string;
  }): Promise<{ success: boolean; message: string }> {
    const [task] = await db
      .select()
      .from(schema.glAuthorizationTasks)
      .where(eq(schema.glAuthorizationTasks.id, params.taskId))
      .limit(1);

    if (!task) {
      throw new Error(`Authorization task not found: ${params.taskId}`);
    }

    if (task.auth_status !== 'PENDING') {
      throw new Error(`Cannot delegate task in status ${task.auth_status}`);
    }

    // Cannot delegate to maker
    if (task.maker_id === params.delegateToId) {
      throw new Error('Cannot delegate approval to the maker');
    }

    // Cannot delegate to self
    if (params.delegatorId === params.delegateToId) {
      throw new Error('Cannot delegate approval to yourself');
    }

    // Log delegation in audit
    await db.insert(schema.glAuthorizationAuditLog).values({
      auth_task_id: params.taskId,
      object_type: task.object_type,
      object_id: task.object_id,
      action: 'DELEGATE',
      actor_id: params.delegatorId,
      decision: 'DELEGATED',
      reason: params.reason ?? `Delegated to user ${params.delegateToId}${params.expiresAt ? ` (expires: ${params.expiresAt.toISOString()})` : ''}`,
    });

    return {
      success: true,
      message: `Approval delegated to user ${params.delegateToId}`,
    };
  },
};
