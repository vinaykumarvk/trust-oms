/**
 * Approval Workflow Service (Call Report Late-Filing Approvals)
 *
 * Manages the supervisor approval queue for call reports filed more than
 * 5 business days after the meeting. Supports claim, approve, and reject
 * actions with full conversation-history audit trail.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, or, count, lte } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ValidationError } from './service-errors';
import { notificationInboxService } from './notification-inbox-service';

const MIN_REJECTION_COMMENT_CHARS = 20;

// ============================================================================
// Service
// ============================================================================

export const approvalWorkflowService = {
  /**
   * Get pending (or claimed) call-report approvals with joined report data.
   * Paginated.
   */
  async getPendingApprovals(filters: {
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const whereClause = or(
      eq(schema.callReportApprovals.action, 'PENDING'),
      eq(schema.callReportApprovals.action, 'CLAIMED'),
    );

    const [data, countResult] = await Promise.all([
      db
        .select({
          id: schema.callReportApprovals.id,
          call_report_id: schema.callReportApprovals.call_report_id,
          supervisor_id: schema.callReportApprovals.supervisor_id,
          action: schema.callReportApprovals.action,
          claimed_at: schema.callReportApprovals.claimed_at,
          decided_at: schema.callReportApprovals.decided_at,
          reviewer_comments: schema.callReportApprovals.reviewer_comments,
          // Joined call report fields
          report_code: schema.callReports.report_code,
          subject: schema.callReports.subject,
          summary: schema.callReports.summary,
          meeting_date: schema.callReports.meeting_date,
          filed_by: schema.callReports.filed_by,
          days_since_meeting: schema.callReports.days_since_meeting,
          branch_id: schema.callReports.branch_id,
          report_status: schema.callReports.report_status,
        })
        .from(schema.callReportApprovals)
        .innerJoin(
          schema.callReports,
          eq(schema.callReportApprovals.call_report_id, schema.callReports.id),
        )
        .where(whereClause)
        .orderBy(desc(schema.callReportApprovals.created_at))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.callReportApprovals)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Claim a pending approval so the supervisor can review it.
   */
  async claim(approvalId: number, supervisorId: number) {
    const [approval] = await db
      .select()
      .from(schema.callReportApprovals)
      .where(eq(schema.callReportApprovals.id, approvalId));

    if (!approval) {
      throw new NotFoundError(`Approval record ${approvalId} not found`);
    }

    if (approval.action !== 'PENDING') {
      throw new ValidationError(
        `Cannot claim approval in status "${approval.action}". Only PENDING approvals can be claimed.`,
      );
    }

    // CCR-GAP-005: Supervisor can only claim approvals within their branch (BO_HEAD/SYSTEM_ADMIN are exempt)
    const [callReport] = await db
      .select({ branch_id: schema.callReports.branch_id, filed_by: schema.callReports.filed_by })
      .from(schema.callReports)
      .where(eq(schema.callReports.id, approval.call_report_id))
      .limit(1);
    if (callReport?.branch_id !== null && callReport?.branch_id !== undefined) {
      const [supervisor] = await db
        .select({ branch_id: schema.users.branch_id, role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, supervisorId))
        .limit(1);
      const isSuperAdmin = supervisor?.role && ['BO_HEAD', 'SYSTEM_ADMIN'].includes(supervisor.role);
      if (!isSuperAdmin && supervisor?.branch_id !== null && supervisor?.branch_id !== callReport.branch_id) {
        throw new ForbiddenError('You can only claim approvals for call reports in your branch');
      }
    }

    const [claimedCount] = await db
      .select({ total: count() })
      .from(schema.callReportApprovals)
      .where(and(
        eq(schema.callReportApprovals.supervisor_id, supervisorId),
        eq(schema.callReportApprovals.action, 'CLAIMED'),
      ));
    if (Number(claimedCount?.total ?? 0) >= 20) {
      throw new ValidationError('Supervisor already has 20 claimed approvals. Complete or release existing claims before claiming more.');
    }

    const [updated] = await db
      .update(schema.callReportApprovals)
      // Drizzle .set() requires exact column types; dynamic field map needs cast
      .set({
        action: 'CLAIMED',
        claimed_at: new Date(),
        supervisor_id: supervisorId,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.callReportApprovals.id, approvalId))
      .returning();

    return updated;
  },

  /**
   * Approve a claimed call-report approval.
   * Updates both the approval record and the parent call report.
   */
  /**
   * AC-051: quality_score is a 1-5 integer rating optionally assigned by the supervisor at approval.
   */
  async approve(approvalId: number, supervisorId: number, comments?: string, quality_score?: number) {
    if (quality_score !== undefined && (quality_score < 1 || quality_score > 5 || !Number.isInteger(quality_score))) {
      throw new ValidationError('quality_score must be an integer between 1 and 5');
    }
    const [approval] = await db
      .select()
      .from(schema.callReportApprovals)
      .where(eq(schema.callReportApprovals.id, approvalId));

    if (!approval) {
      throw new NotFoundError(`Approval record ${approvalId} not found`);
    }

    if (approval.action !== 'CLAIMED') {
      throw new ValidationError(
        `Cannot approve: approval is in status "${approval.action}". Must be CLAIMED first.`,
      );
    }

    if (approval.supervisor_id !== supervisorId) {
      throw new ForbiddenError(
        `Cannot approve: this approval is claimed by supervisor ${approval.supervisor_id}, not ${supervisorId}.`,
      );
    }

    // P1-03: SoD guard — supervisor cannot approve their own filed report
    const [callReport] = await db
      .select({ filed_by: schema.callReports.filed_by })
      .from(schema.callReports)
      .where(eq(schema.callReports.id, approval.call_report_id))
      .limit(1);
    if (callReport && callReport.filed_by === supervisorId) {
      throw new ForbiddenError('Segregation of duties violation: cannot approve a call report you filed yourself');
    }

    const now = new Date();

    return await db.transaction(async (tx: typeof db) => {
      // Update approval record
      const [updatedApproval] = await tx
        .update(schema.callReportApprovals)
        // Drizzle .set() requires exact column types; dynamic field map needs cast
        .set({
          action: 'APPROVED',
          decided_at: now,
          reviewer_comments: comments ?? null,
          updated_at: now,
        } as any)
        .where(eq(schema.callReportApprovals.id, approvalId))
        .returning();

      // Update call report status (AC-051: persist quality_score if provided)
      await tx
        .update(schema.callReports)
        // Drizzle .set() requires exact column types; dynamic field map needs cast
        .set({
          report_status: 'APPROVED',
          approved_by: supervisorId,
          approved_at: now,
          updated_at: now,
          ...(quality_score !== undefined ? { quality_score } : {}),
        } as any)
        .where(eq(schema.callReports.id, approval.call_report_id));

      // Fetch report for conversation history context
      const [report] = await tx
        .select()
        .from(schema.callReports)
        .where(eq(schema.callReports.id, approval.call_report_id));

      // Insert conversation history entry
      if (report) {
        await tx.insert(schema.conversationHistory).values({
          lead_id: report.lead_id ?? null,
          prospect_id: report.prospect_id ?? null,
          client_id: report.client_id ?? null,
          interaction_type: 'CALL_REPORT_APPROVED',
          interaction_date: now,
          summary: `Call report ${report.report_code} approved by supervisor ${supervisorId}.${comments ? ` Comments: ${comments}` : ''}`,
          reference_type: 'call_report',
          reference_id: approval.call_report_id,
          created_by: String(supervisorId),
        });
      }

      // GAP-012: Notify the filing RM of the approval decision
      if (report?.filed_by) {
        await notificationInboxService.notify({
          recipient_user_id: report.filed_by,
          type: 'CALL_REPORT_APPROVED',
          title: 'Call Report Approved',
          message: `Your call report ${report.report_code} has been approved.${comments ? ` Reviewer note: ${comments}` : ''}`,
          channel: 'IN_APP',
          related_entity_type: 'call_report',
          related_entity_id: approval.call_report_id,
        });
      }

      return updatedApproval;
    });
  },

  /**
   * Reject a claimed call-report approval.
   * Updates both the approval record and returns the call report for revision.
   */
  async reject(approvalId: number, supervisorId: number, comments: string) {
    if (!comments || comments.trim().length < MIN_REJECTION_COMMENT_CHARS) {
      throw new ValidationError(`Reviewer comments must be at least ${MIN_REJECTION_COMMENT_CHARS} characters`);
    }

    const [approval] = await db
      .select()
      .from(schema.callReportApprovals)
      .where(eq(schema.callReportApprovals.id, approvalId));

    if (!approval) {
      throw new NotFoundError(`Approval record ${approvalId} not found`);
    }

    if (approval.action !== 'CLAIMED') {
      throw new ValidationError(
        `Cannot reject: approval is in status "${approval.action}". Must be CLAIMED first.`,
      );
    }

    if (approval.supervisor_id !== supervisorId) {
      throw new ForbiddenError(
        `Cannot reject: this approval is claimed by supervisor ${approval.supervisor_id}, not ${supervisorId}.`,
      );
    }

    const now = new Date();

    return await db.transaction(async (tx: typeof db) => {
      // Update approval record
      const [updatedApproval] = await tx
        .update(schema.callReportApprovals)
        // Drizzle .set() requires exact column types; dynamic field map needs cast
        .set({
          action: 'REJECTED',
          decided_at: now,
          reviewer_comments: comments.trim(),
          updated_at: now,
        } as any)
        .where(eq(schema.callReportApprovals.id, approvalId))
        .returning();

      // Update call report status to RETURNED
      await tx
        .update(schema.callReports)
        // Drizzle .set() requires exact column types; dynamic field map needs cast
        .set({
          report_status: 'RETURNED',
          rejection_reason: comments.trim(),
          updated_at: now,
        } as any)
        .where(eq(schema.callReports.id, approval.call_report_id));

      // Fetch report for conversation history context
      const [report] = await tx
        .select()
        .from(schema.callReports)
        .where(eq(schema.callReports.id, approval.call_report_id));

      // Insert conversation history entry
      if (report) {
        await tx.insert(schema.conversationHistory).values({
          lead_id: report.lead_id ?? null,
          prospect_id: report.prospect_id ?? null,
          client_id: report.client_id ?? null,
          interaction_type: 'CALL_REPORT_REJECTED',
          interaction_date: now,
          summary: `Call report ${report.report_code} rejected by supervisor ${supervisorId}. Reason: ${comments.trim()}`,
          reference_type: 'call_report',
          reference_id: approval.call_report_id,
          created_by: String(supervisorId),
        });
      }

      // GAP-012: Notify the filing RM of the rejection decision
      if (report?.filed_by) {
        await notificationInboxService.notify({
          recipient_user_id: report.filed_by,
          type: 'CALL_REPORT_REJECTED',
          title: 'Call Report Returned for Revision',
          message: `Your call report ${report.report_code} has been returned. Reason: ${comments.trim()}`,
          channel: 'IN_APP',
          related_entity_type: 'call_report',
          related_entity_id: approval.call_report_id,
        });
      }

      return updatedApproval;
    });
  },

  /**
   * GAP-011: Auto-unclaim approvals claimed for > 2 business days without a decision.
   * Resets CLAIMED → PENDING and clears supervisor_id so another supervisor can pick it up.
   * Called by the nightly scheduler in routes.ts.
   */
  async processExpiredClaims(): Promise<number> {
    // 2 business days ≈ 2 * 24h; simple calendar-day approximation is acceptable here
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);

    const expired = await db
      .select({ id: schema.callReportApprovals.id, supervisor_id: schema.callReportApprovals.supervisor_id })
      .from(schema.callReportApprovals)
      .where(and(
        eq(schema.callReportApprovals.action, 'CLAIMED'),
        lte(schema.callReportApprovals.claimed_at, cutoff),
      ));

    if (expired.length === 0) return 0;

    for (const rec of expired) {
      await db
        .update(schema.callReportApprovals)
        .set({
          action: 'PENDING',
          supervisor_id: null,
          claimed_at: null,
          updated_at: new Date(),
        } as any)
        .where(eq(schema.callReportApprovals.id, rec.id));
    }

    return expired.length;
  },
};
