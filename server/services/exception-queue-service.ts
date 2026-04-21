/**
 * Exception Queue Service (TrustFees Pro -- Phase 8)
 *
 * Manages exception items with SLA tracking, auto-assignment,
 * escalation, and bulk operations.
 *
 * SLA targets by severity:
 *   P1 = 4 hours
 *   P2 = 8 hours
 *   P3 = 24 hours
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or, lte, gt, ne, inArray } from 'drizzle-orm';

// SLA duration in hours by severity
const SLA_HOURS: Record<string, number> = {
  P1: 4,
  P2: 8,
  P3: 24,
};

// Round-robin team members for auto-assignment
const TEAM_MEMBERS = [
  'ops.user1',
  'ops.user2',
  'ops.user3',
  'ops.user4',
  'ops.user5',
];

let roundRobinIndex = 0;

function getNextAssignee(): string {
  const assignee = TEAM_MEMBERS[roundRobinIndex % TEAM_MEMBERS.length];
  roundRobinIndex++;
  return assignee;
}

export const exceptionQueueService = {
  /**
   * Create a new exception item.
   * Computes sla_due_at based on severity and auto-assigns via round-robin.
   */
  async createException(data: {
    exception_type: string;
    severity?: string;
    title: string;
    description: string;
    customer_id?: string;
    aggregate_type: string;
    aggregate_id: string;
  }) {
    const severity = data.severity ?? 'P3';
    const slaHours = SLA_HOURS[severity] ?? 24;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);
    const assignedTo = getNextAssignee();

    const [exception] = await db
      .insert(schema.exceptionItems)
      .values({
        exception_type: data.exception_type as any,
        severity: severity as any,
        title: data.title,
        details: { description: data.description },
        customer_id: data.customer_id ?? null,
        source_aggregate_type: data.aggregate_type,
        source_aggregate_id: data.aggregate_id,
        assigned_to_team: 'OPERATIONS',
        assigned_to_user: assignedTo,
        exception_status: 'OPEN',
        sla_due_at: slaDueAt,
      })
      .returning();

    return exception;
  },

  /**
   * Assign an exception to a user (OPEN -> IN_PROGRESS).
   */
  async assignException(exceptionId: number, userId: string) {
    const [current] = await db
      .select()
      .from(schema.exceptionItems)
      .where(eq(schema.exceptionItems.id, exceptionId))
      .limit(1);

    if (!current) {
      throw new Error(`Exception not found: ${exceptionId}`);
    }

    if (current.exception_status !== 'OPEN' && current.exception_status !== 'IN_PROGRESS') {
      throw new Error(
        `Cannot assign exception in ${current.exception_status} status. Only OPEN or IN_PROGRESS exceptions can be assigned.`,
      );
    }

    const [updated] = await db
      .update(schema.exceptionItems)
      .set({
        exception_status: 'IN_PROGRESS',
        assigned_to_user: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.exceptionItems.id, exceptionId))
      .returning();

    return updated;
  },

  /**
   * Resolve an exception (IN_PROGRESS/ESCALATED -> RESOLVED).
   */
  async resolveException(exceptionId: number, resolutionNotes: string) {
    const [current] = await db
      .select()
      .from(schema.exceptionItems)
      .where(eq(schema.exceptionItems.id, exceptionId))
      .limit(1);

    if (!current) {
      throw new Error(`Exception not found: ${exceptionId}`);
    }

    if (current.exception_status !== 'IN_PROGRESS' && current.exception_status !== 'ESCALATED') {
      throw new Error(
        `Cannot resolve exception in ${current.exception_status} status. Only IN_PROGRESS or ESCALATED exceptions can be resolved.`,
      );
    }

    const [updated] = await db
      .update(schema.exceptionItems)
      .set({
        exception_status: 'RESOLVED',
        resolution_notes: resolutionNotes,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.exceptionItems.id, exceptionId))
      .returning();

    return updated;
  },

  /**
   * Escalate an exception (IN_PROGRESS -> ESCALATED).
   */
  async escalateException(exceptionId: number, reason?: string) {
    const [current] = await db
      .select()
      .from(schema.exceptionItems)
      .where(eq(schema.exceptionItems.id, exceptionId))
      .limit(1);

    if (!current) {
      throw new Error(`Exception not found: ${exceptionId}`);
    }

    if (current.exception_status !== 'IN_PROGRESS' && current.exception_status !== 'OPEN') {
      throw new Error(
        `Cannot escalate exception in ${current.exception_status} status. Only OPEN or IN_PROGRESS exceptions can be escalated.`,
      );
    }

    const [updated] = await db
      .update(schema.exceptionItems)
      .set({
        exception_status: 'ESCALATED',
        escalated_at: new Date(),
        resolution_notes: reason
          ? `Escalation reason: ${reason}${current.resolution_notes ? '\n' + current.resolution_notes : ''}`
          : current.resolution_notes,
        updated_at: new Date(),
      })
      .where(eq(schema.exceptionItems.id, exceptionId))
      .returning();

    return updated;
  },

  /**
   * Mark an exception as WONT_FIX.
   */
  async markWontFix(exceptionId: number, reason: string) {
    const [current] = await db
      .select()
      .from(schema.exceptionItems)
      .where(eq(schema.exceptionItems.id, exceptionId))
      .limit(1);

    if (!current) {
      throw new Error(`Exception not found: ${exceptionId}`);
    }

    if (current.exception_status === 'RESOLVED' || current.exception_status === 'WONT_FIX') {
      throw new Error(
        `Cannot mark exception in ${current.exception_status} status as WONT_FIX.`,
      );
    }

    const [updated] = await db
      .update(schema.exceptionItems)
      .set({
        exception_status: 'WONT_FIX',
        resolution_notes: `Won't fix: ${reason}`,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.exceptionItems.id, exceptionId))
      .returning();

    return updated;
  },

  /**
   * Check for SLA breaches and auto-escalate.
   * Called by EOD exception_sweep.
   */
  async checkSlaBreaches() {
    const now = new Date();

    // Find OPEN or IN_PROGRESS exceptions past their SLA deadline
    const breached = await db
      .select()
      .from(schema.exceptionItems)
      .where(
        and(
          lte(schema.exceptionItems.sla_due_at, now),
          or(
            eq(schema.exceptionItems.exception_status, 'OPEN'),
            eq(schema.exceptionItems.exception_status, 'IN_PROGRESS'),
          ),
        ),
      );

    let escalatedCount = 0;

    for (const item of breached) {
      await db
        .update(schema.exceptionItems)
        .set({
          exception_status: 'ESCALATED',
          escalated_at: now,
          resolution_notes: `Auto-escalated: SLA breach detected at ${now.toISOString()}${item.resolution_notes ? '\n' + item.resolution_notes : ''}`,
          updated_at: now,
        })
        .where(eq(schema.exceptionItems.id, item.id));
      escalatedCount++;
    }

    return {
      breaches_found: breached.length,
      escalated: escalatedCount,
    };
  },

  /**
   * List exceptions with filters and pagination.
   */
  async getExceptions(filters?: {
    severity?: string;
    exception_type?: string;
    exception_status?: string;
    assigned_to?: string;
    sla_state?: string; // 'on-time' | 'breached'
    customer_id?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.severity) {
      conditions.push(
        eq(schema.exceptionItems.severity, filters.severity as any),
      );
    }

    if (filters?.exception_type) {
      conditions.push(
        eq(schema.exceptionItems.exception_type, filters.exception_type as any),
      );
    }

    if (filters?.exception_status) {
      conditions.push(
        eq(schema.exceptionItems.exception_status, filters.exception_status as any),
      );
    }

    if (filters?.assigned_to) {
      conditions.push(
        eq(schema.exceptionItems.assigned_to_user, filters.assigned_to),
      );
    }

    if (filters?.customer_id) {
      conditions.push(
        eq(schema.exceptionItems.customer_id, filters.customer_id),
      );
    }

    if (filters?.sla_state) {
      const now = new Date();
      if (filters.sla_state === 'on-time') {
        conditions.push(gt(schema.exceptionItems.sla_due_at, now));
      } else if (filters.sla_state === 'breached') {
        conditions.push(
          and(
            lte(schema.exceptionItems.sla_due_at, now),
            or(
              eq(schema.exceptionItems.exception_status, 'OPEN'),
              eq(schema.exceptionItems.exception_status, 'IN_PROGRESS'),
              eq(schema.exceptionItems.exception_status, 'ESCALATED'),
            ),
          )!,
        );
      }
    }

    if (filters?.search) {
      conditions.push(
        or(
          ilike(schema.exceptionItems.title, `%${filters.search}%`),
          ilike(schema.exceptionItems.source_aggregate_id, `%${filters.search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.exceptionItems)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.exceptionItems.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.exceptionItems)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * KPI Dashboard for exceptions.
   */
  async getKpiDashboard() {
    // Status counts
    const statusCounts = await db
      .select({
        exception_status: schema.exceptionItems.exception_status,
        count: sql<number>`count(*)`,
      })
      .from(schema.exceptionItems)
      .groupBy(schema.exceptionItems.exception_status);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.exception_status] = Number(row.count);
    }

    const totalOpen = statusMap['OPEN'] ?? 0;
    const totalInProgress = statusMap['IN_PROGRESS'] ?? 0;
    const totalEscalated = statusMap['ESCALATED'] ?? 0;
    const totalResolved = statusMap['RESOLVED'] ?? 0;

    // SLA adherence: % of resolved exceptions resolved before sla_due_at
    const slaAdherenceResult = await db
      .select({
        total_resolved: sql<number>`count(*)`,
        on_time: sql<number>`count(*) FILTER (WHERE ${schema.exceptionItems.resolved_at} <= ${schema.exceptionItems.sla_due_at})`,
      })
      .from(schema.exceptionItems)
      .where(eq(schema.exceptionItems.exception_status, 'RESOLVED'));

    const totalResolvedForSla = Number(slaAdherenceResult[0]?.total_resolved ?? 0);
    const onTime = Number(slaAdherenceResult[0]?.on_time ?? 0);
    const slaAdherencePct = totalResolvedForSla > 0
      ? Math.round((onTime / totalResolvedForSla) * 10000) / 100
      : 100;

    // Backlog by severity (only non-resolved/wont-fix)
    const backlogBySeverity = await db
      .select({
        severity: schema.exceptionItems.severity,
        count: sql<number>`count(*)`,
      })
      .from(schema.exceptionItems)
      .where(
        and(
          ne(schema.exceptionItems.exception_status, 'RESOLVED'),
          ne(schema.exceptionItems.exception_status, 'WONT_FIX'),
        ),
      )
      .groupBy(schema.exceptionItems.severity);

    const backlogMap: Record<string, number> = { P1: 0, P2: 0, P3: 0 };
    for (const row of backlogBySeverity) {
      backlogMap[row.severity] = Number(row.count);
    }

    // Type distribution (all exceptions)
    const typeDist = await db
      .select({
        exception_type: schema.exceptionItems.exception_type,
        count: sql<number>`count(*)`,
      })
      .from(schema.exceptionItems)
      .groupBy(schema.exceptionItems.exception_type);

    const typeDistMap: Record<string, number> = {};
    for (const row of typeDist) {
      typeDistMap[row.exception_type] = Number(row.count);
    }

    // Average resolution hours
    const avgResolutionResult = await db
      .select({
        avg_hours: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${schema.exceptionItems.resolved_at} - ${schema.exceptionItems.created_at})) / 3600), 0)`,
      })
      .from(schema.exceptionItems)
      .where(eq(schema.exceptionItems.exception_status, 'RESOLVED'));

    const avgResolutionHours = Math.round(Number(avgResolutionResult[0]?.avg_hours ?? 0) * 100) / 100;

    return {
      sla_adherence_pct: slaAdherencePct,
      total_open: totalOpen,
      total_in_progress: totalInProgress,
      total_escalated: totalEscalated,
      total_resolved: totalResolved,
      backlog_by_severity: backlogMap,
      type_distribution: typeDistMap,
      avg_resolution_hours: avgResolutionHours,
    };
  },

  /**
   * Bulk reassign multiple exceptions to a new user.
   */
  async bulkReassign(exceptionIds: number[], newUserId: string) {
    if (!exceptionIds.length) {
      throw new Error('No exception IDs provided');
    }

    const result = await db
      .update(schema.exceptionItems)
      .set({
        assigned_to_user: newUserId,
        exception_status: 'IN_PROGRESS',
        updated_at: new Date(),
      })
      .where(
        and(
          inArray(schema.exceptionItems.id, exceptionIds),
          or(
            eq(schema.exceptionItems.exception_status, 'OPEN'),
            eq(schema.exceptionItems.exception_status, 'IN_PROGRESS'),
            eq(schema.exceptionItems.exception_status, 'ESCALATED'),
          ),
        ),
      )
      .returning();

    return { reassigned: result.length };
  },

  /**
   * Bulk resolve multiple exceptions with the same resolution notes.
   */
  async bulkResolve(exceptionIds: number[], resolutionNotes: string) {
    if (!exceptionIds.length) {
      throw new Error('No exception IDs provided');
    }

    const now = new Date();

    const result = await db
      .update(schema.exceptionItems)
      .set({
        exception_status: 'RESOLVED',
        resolution_notes: resolutionNotes,
        resolved_at: now,
        updated_at: now,
      })
      .where(
        and(
          inArray(schema.exceptionItems.id, exceptionIds),
          or(
            eq(schema.exceptionItems.exception_status, 'OPEN'),
            eq(schema.exceptionItems.exception_status, 'IN_PROGRESS'),
            eq(schema.exceptionItems.exception_status, 'ESCALATED'),
          ),
        ),
      )
      .returning();

    return { resolved: result.length };
  },
};
