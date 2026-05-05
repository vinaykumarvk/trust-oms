/**
 * Approval Workflow Service (Call Report Late-Filing Approvals)
 *
 * Manages the supervisor approval queue for call reports filed more than
 * 5 business days after the meeting. Supports claim, approve, and reject
 * actions with full conversation-history audit trail.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, or, count } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ValidationError } from './service-errors';
import { notificationInboxService } from './notification-inbox-service';
import { marketCalendarService } from './market-calendar-service';
import {
  computeApprovalClaimExpiryDate,
  evaluateApprovalAutoUnclaim,
  type ApprovalAutoUnclaimEvaluation,
  type ApprovalAutoUnclaimPolicy,
} from './approval-auto-unclaim-policy';

const MIN_REJECTION_COMMENT_CHARS = 20;
const DEFAULT_AUTO_UNCLAIM_DAYS = 2;
const DEFAULT_AUTO_UNCLAIM_CALENDAR_KEY = 'PSE';
const DEFAULT_AUTO_UNCLAIM_TIMEZONE = 'Asia/Manila';

async function getConfigValue(configKey: string, fallback: string): Promise<string> {
  try {
    const [row] = await db
      .select({ config_value: schema.systemConfig.config_value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.config_key, configKey))
      .limit(1);
    return row?.config_value?.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function resolveApprovalAutoUnclaimPolicy(input: {
  branchId?: number | null;
  calendarKey?: string | null;
  timezone?: string | null;
} = {}): Promise<ApprovalAutoUnclaimPolicy> {
  const [thresholdRaw, defaultCalendarKey, defaultTimezone] = await Promise.all([
    getConfigValue('CRM_APPROVAL_AUTO_UNCLAIM_BUSINESS_DAYS', String(DEFAULT_AUTO_UNCLAIM_DAYS)),
    getConfigValue('CRM_APPROVAL_AUTO_UNCLAIM_CALENDAR_KEY', DEFAULT_AUTO_UNCLAIM_CALENDAR_KEY),
    getConfigValue('CRM_APPROVAL_AUTO_UNCLAIM_TIMEZONE', DEFAULT_AUTO_UNCLAIM_TIMEZONE),
  ]);

  let branchCalendarKey: string | null = null;
  let branchTimezone: string | null = null;
  if (input.branchId) {
    try {
      const [branch] = await db
        .select({ calendar_key: schema.branches.calendar_key, timezone: schema.branches.timezone })
        .from(schema.branches)
        .where(eq(schema.branches.id, input.branchId))
        .limit(1);
      branchCalendarKey = branch?.calendar_key ?? null;
      branchTimezone = branch?.timezone ?? null;
    } catch {
      branchCalendarKey = null;
      branchTimezone = null;
    }
  }

  return {
    thresholdBusinessDays: parseInt(thresholdRaw, 10) || DEFAULT_AUTO_UNCLAIM_DAYS,
    calendarKey: input.calendarKey || branchCalendarKey || defaultCalendarKey,
    timezone: input.timezone || branchTimezone || defaultTimezone,
  };
}

function expiryDateToTimestamp(expiryDate: string): Date {
  return new Date(`${expiryDate}T00:00:00.000Z`);
}

function appendClaimHistory(history: unknown, entry: Record<string, unknown>): Record<string, unknown>[] {
  const current = Array.isArray(history) ? history as Record<string, unknown>[] : [];
  return [...current.slice(-49), entry];
}

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
      .select({
        branch_id: schema.callReports.branch_id,
        filed_by: schema.callReports.filed_by,
        report_code: schema.callReports.report_code,
      })
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

    const now = new Date();
    const autoUnclaimPolicy = await resolveApprovalAutoUnclaimPolicy({ branchId: callReport?.branch_id });
    const claimExpiresOn = await computeApprovalClaimExpiryDate({
      claimedAt: now,
      policy: autoUnclaimPolicy,
      isBusinessDay: (calendarKey, date) => marketCalendarService.isBusinessDay(calendarKey, date),
    });

    const [updated] = await db
      .update(schema.callReportApprovals)
      // Drizzle .set() requires exact column types; dynamic field map needs cast
      .set({
        action: 'CLAIMED',
        claimed_at: now,
        supervisor_id: supervisorId,
        claim_calendar_key: autoUnclaimPolicy.calendarKey,
        claim_timezone: autoUnclaimPolicy.timezone,
        claim_expires_on: claimExpiresOn,
        claim_expires_at: expiryDateToTimestamp(claimExpiresOn),
        claim_history: appendClaimHistory(approval.claim_history, {
          action: 'CLAIMED',
          at: now.toISOString(),
          supervisor_id: supervisorId,
          calendar_key: autoUnclaimPolicy.calendarKey,
          timezone: autoUnclaimPolicy.timezone,
          expires_on: claimExpiresOn,
        }),
        updated_at: now,
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

      // GAP-014: Notify the filing RM of the approval decision via in-app and email channels
      if (report?.filed_by) {
        await notificationInboxService.notifyChannels({
          recipient_user_id: report.filed_by,
          type: 'CALL_REPORT_APPROVED',
          title: 'Call Report Approved',
          message: `Your call report ${report.report_code} has been approved.${comments ? ` Reviewer note: ${comments}` : ''}`,
          channels: ['IN_APP', 'EMAIL'],
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

      // GAP-014: Notify the filing RM of the rejection decision via in-app and email channels
      if (report?.filed_by) {
        await notificationInboxService.notifyChannels({
          recipient_user_id: report.filed_by,
          type: 'CALL_REPORT_REJECTED',
          title: 'Call Report Returned for Revision',
          message: `Your call report ${report.report_code} has been returned. Reason: ${comments.trim()}`,
          channels: ['IN_APP', 'EMAIL'],
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
  async processExpiredClaims(now = new Date()): Promise<number> {
    const claimed = await db
      .select({
        id: schema.callReportApprovals.id,
        supervisor_id: schema.callReportApprovals.supervisor_id,
        call_report_id: schema.callReportApprovals.call_report_id,
        claimed_at: schema.callReportApprovals.claimed_at,
        claim_calendar_key: schema.callReportApprovals.claim_calendar_key,
        claim_timezone: schema.callReportApprovals.claim_timezone,
        claim_history: schema.callReportApprovals.claim_history,
        auto_unclaim_count: schema.callReportApprovals.auto_unclaim_count,
        branch_id: schema.callReports.branch_id,
        report_code: schema.callReports.report_code,
      })
      .from(schema.callReportApprovals)
      .innerJoin(schema.callReports, eq(schema.callReportApprovals.call_report_id, schema.callReports.id))
      .where(and(
        eq(schema.callReportApprovals.action, 'CLAIMED'),
        sql`${schema.callReportApprovals.claimed_at} IS NOT NULL`,
      ));

    if (!Array.isArray(claimed) || claimed.length === 0) return 0;

    let released = 0;
    for (const rec of claimed) {
      if (!rec.claimed_at) continue;
      const policy = await resolveApprovalAutoUnclaimPolicy({
        branchId: rec.branch_id,
        calendarKey: rec.claim_calendar_key,
        timezone: rec.claim_timezone,
      });
      const evaluation: ApprovalAutoUnclaimEvaluation = await evaluateApprovalAutoUnclaim({
        claimedAt: rec.claimed_at,
        now,
        policy,
        isBusinessDay: (calendarKey, date) => marketCalendarService.isBusinessDay(calendarKey, date),
      });
      if (!evaluation.expired) continue;

      await db
        .update(schema.callReportApprovals)
        .set({
          action: 'PENDING',
          supervisor_id: null,
          claimed_at: null,
          claim_expires_on: null,
          claim_expires_at: null,
          last_auto_unclaimed_at: now,
          auto_unclaim_count: Number(rec.auto_unclaim_count ?? 0) + 1,
          auto_unclaim_evidence: evaluation,
          claim_history: appendClaimHistory(rec.claim_history, {
            action: 'AUTO_UNCLAIMED',
            at: now.toISOString(),
            previous_supervisor_id: rec.supervisor_id,
            evaluation,
          }),
          updated_at: now,
          updated_by: 'APPROVAL_AUTO_UNCLAIM_JOB',
        } as any)
        .where(eq(schema.callReportApprovals.id, rec.id));

      if (rec.supervisor_id) {
        await notificationInboxService.notifyChannels({
          recipient_user_id: rec.supervisor_id,
          type: 'CALL_REPORT_PENDING_APPROVAL',
          title: 'Call Report Claim Released',
          message: `Call report ${rec.report_code} was released after ${evaluation.businessDaysElapsed} business days without a decision.`,
          channels: ['IN_APP', 'EMAIL'],
          related_entity_type: 'call_report_approval',
          related_entity_id: rec.id,
        });
      }
      released++;
    }

    return released;
  },
};
