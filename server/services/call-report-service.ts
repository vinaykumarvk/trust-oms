/**
 * Call Report Management Service (CRM-CR)
 *
 * Manages the full lifecycle of call reports: creation with meeting validation,
 * editing (DRAFT/RETURNED only), submission with business-day calculation for
 * late-filing approval routing, auto-approval for on-time filings,
 * conversation history logging, and automatic follow-up meeting creation.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, asc, ilike, or, gte, lte } from 'drizzle-orm';
import { generateMeetingCode } from './meeting-service';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from './service-errors';
import { notificationInboxService } from './notification-inbox-service';
import { taskManagementService } from './task-management-service';
import { marketCalendarService } from './market-calendar-service';
import { tagCallReport } from './platform-intelligence-client';

type CallReport = typeof schema.callReports.$inferSelect;
type ActionItem = typeof schema.actionItems.$inferSelect;

// ---------------------------------------------------------------------------
// Phase 2B: Runtime-configurable late-filing threshold
// ---------------------------------------------------------------------------

// In-memory cache for CRM_LATE_FILING_DAYS pulled from system_config.
// Cache TTL: 5 minutes. Invalidated on PUT /system-config/CRM_LATE_FILING_DAYS.
let _lateFilingDaysCache: number | null = null;
let _lateFilingCacheExpiry = 0;

export function invalidateLateFilingCache(): void {
  _lateFilingCacheExpiry = 0;
}

export async function getLateFilingDays(): Promise<number> {
  if (_lateFilingCacheExpiry > Date.now() && _lateFilingDaysCache !== null) {
    return _lateFilingDaysCache;
  }
  try {
    const [row] = await db
      .select()
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.config_key, 'CRM_LATE_FILING_DAYS'))
      .limit(1);
    if (row) {
      _lateFilingDaysCache = parseInt(row.config_value, 10) || 5;
    } else {
      _lateFilingDaysCache = parseInt(process.env.CRM_LATE_FILING_DAYS ?? '5', 10) || 5;
    }
  } catch {
    _lateFilingDaysCache = parseInt(process.env.CRM_LATE_FILING_DAYS ?? '5', 10) || 5;
  }
  _lateFilingCacheExpiry = Date.now() + 5 * 60 * 1000;
  return _lateFilingDaysCache;
}

// GAP-008: Late-filing threshold — kept as env-based fallback for non-async contexts.
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;

// ============================================================================
// Helpers
// ============================================================================

async function generateReportCode(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const pattern = `CR-${ym}-%`;
  const result = await db.execute(sql`SELECT report_code FROM call_reports WHERE report_code LIKE ${pattern} ORDER BY report_code DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).report_code;
    const lastSeq = parseInt(lastCode.split('-').pop() || '0', 10);
    nextSeq = lastSeq + 1;
  }
  return `CR-${ym}-${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Count business days (weekdays only, skipping Sat/Sun) between two dates.
 * startDate is inclusive, endDate is exclusive.
 */
function calculateBusinessDays(startDate: string, endDate: Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Normalize to midnight
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end <= start) return 0;

  let count = 0;
  const current = new Date(start);
  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Count business days between two dates using the PSE market calendar.
 * Falls back to the weekday-only calculation if the calendar lookup fails.
 * startDate is inclusive, endDate is exclusive.
 */
async function calculateBusinessDaysPSE(startDate: string, endDate: Date): Promise<number> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end <= start) return 0;

  let count = 0;
  const current = new Date(start);
  while (current < end) {
    const dateStr = current.toISOString().split('T')[0];
    const isBD = await marketCalendarService.isBusinessDay('PSE', dateStr);
    if (isBD) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ============================================================================
// Service
// ============================================================================

export const callReportService = {
  /**
   * Create a new call report.
   * For SCHEDULED type, validates meeting exists and is COMPLETED.
   */
  async create(data: {
    report_type?: string;
    meeting_id?: number;
    campaign_id?: number;
    lead_id?: number;
    prospect_id?: number;
    client_id?: string;
    related_entity_type?: string;
    related_entity_id?: number;
    filed_by: number;
    meeting_date: string;
    meeting_type: string;
    subject: string;
    summary: string;
    discussion_summary?: string;
    topics_discussed?: unknown;
    products_discussed?: unknown;
    outcome?: string;
    follow_up_required?: boolean;
    follow_up_date?: string;
    parent_report_id?: number;
    attachment_urls?: unknown;
    meeting_reason?: string;
    person_met?: string;
    client_status?: string;
    state_of_mind?: string;
    next_meeting_start?: string;
    next_meeting_end?: string;
    branch_id?: number;
    action_items?: Array<{
      description: string;
      assigned_to?: number;
      due_date: string;
      priority?: string;
    }>;
  }): Promise<CallReport> {
    const reportType = data.report_type || 'STANDALONE';

    if (!data.summary || data.summary.trim().length < 20) {
      throw new ValidationError('summary must be at least 20 characters');
    }

    // GAP-032: Validate attachment size limits (10 MB per file, 50 MB total)
    if (data.attachment_urls && Array.isArray(data.attachment_urls)) {
      const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
      const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB
      let totalSize = 0;
      for (const att of data.attachment_urls as Array<{ url?: string; file_size?: number } | string>) {
        if (typeof att === 'object' && att !== null && typeof att.file_size === 'number') {
          if (att.file_size > MAX_FILE_BYTES) {
            throw new ValidationError(`Attachment exceeds the 10 MB per-file limit`);
          }
          totalSize += att.file_size;
        }
      }
      if (totalSize > MAX_TOTAL_BYTES) {
        throw new ValidationError(`Total attachment size exceeds the 50 MB limit`);
      }
    }

    // BR-021: Cannot file call report if meeting_date is in the future
    if (data.meeting_date) {
      const meetingDate = new Date(data.meeting_date);
      meetingDate.setHours(23, 59, 59, 999); // allow same-day filings
      if (meetingDate > new Date()) {
        throw new ValidationError('Cannot file a call report for a meeting that has not yet occurred. meeting_date must be today or in the past.');
      }
    }

    // P1-10: Standalone call reports cannot be backdated more than 30 days
    if (reportType === 'STANDALONE' && data.meeting_date) {
      const meetingDate = new Date(data.meeting_date);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (meetingDate < thirtyDaysAgo) {
        throw new ValidationError('Standalone call reports cannot be backdated more than 30 days. Please contact BO_HEAD for approval if this is a legitimate late filing.');
      }
    }

    // Validate meeting for SCHEDULED reports
    if (reportType === 'SCHEDULED') {
      if (!data.meeting_id) {
        throw new ValidationError('meeting_id is required for SCHEDULED call reports');
      }
      const [meeting] = await db
        .select()
        .from(schema.meetings)
        .where(eq(schema.meetings.id, data.meeting_id));

      if (!meeting) {
        throw new NotFoundError(`Meeting ${data.meeting_id} not found`);
      }
      if (meeting.meeting_status !== 'COMPLETED') {
        throw new ValidationError(
          `Meeting ${data.meeting_id} must be COMPLETED before filing a call report. Current status: ${meeting.meeting_status}`,
        );
      }

      // Check for duplicate call report for this meeting
      const existingReports = await db
        .select()
        .from(schema.callReports)
        .where(eq(schema.callReports.meeting_id, data.meeting_id))
        .limit(1);
      if (existingReports.length > 0) {
        throw new ConflictError('A call report already exists for this meeting');
      }
    }

    const hasActionItems = Boolean(data.action_items && data.action_items.length > 0);
    let effectiveBranchId = data.branch_id ?? null;
    if (effectiveBranchId === null && hasActionItems) {
      const [filer] = await db
        .select({ branch_id: schema.users.branch_id })
        .from(schema.users)
        .where(eq(schema.users.id, data.filed_by))
        .limit(1);
      effectiveBranchId = filer?.branch_id ?? null;
    }

    const report_code = await generateReportCode();

    return await db.transaction(async (tx: typeof db) => {
      const [report] = await tx
        .insert(schema.callReports)
        .values({
          report_code,
          // Drizzle enum types require cast when value comes from untyped input
          report_type: reportType as typeof schema.callReportTypeEnum.enumValues[number],
          meeting_id: data.meeting_id ?? null,
          campaign_id: data.campaign_id ?? null,
          lead_id: data.lead_id ?? null,
          prospect_id: data.prospect_id ?? null,
          client_id: data.client_id ?? null,
          related_entity_type: data.related_entity_type ?? null,
          related_entity_id: data.related_entity_id ?? null,
          filed_by: data.filed_by,
          meeting_date: data.meeting_date,
          // Drizzle enum types require cast when value comes from untyped input
          meeting_type: data.meeting_type as typeof schema.meetingTypeEnum.enumValues[number],
          subject: data.subject,
          summary: data.summary,
          discussion_summary: data.discussion_summary ?? null,
          topics_discussed: data.topics_discussed ?? [],
          products_discussed: data.products_discussed ?? [],
          outcome: data.outcome ?? null,
          follow_up_required: data.follow_up_required ?? false,
          follow_up_date: data.follow_up_date ?? null,
          parent_report_id: data.parent_report_id ?? null,
          attachment_urls: data.attachment_urls ?? [],
          report_status: 'DRAFT',
          requires_supervisor_approval: false,
          // Drizzle enum types require cast when value comes from untyped input
          meeting_reason: (data.meeting_reason as typeof schema.meetingReasonEnum.enumValues[number]) ?? null,
          person_met: data.person_met ?? null,
          client_status: data.client_status ?? null,
          state_of_mind: data.state_of_mind ?? null,
          next_meeting_start: data.next_meeting_start
            ? new Date(data.next_meeting_start)
            : null,
          next_meeting_end: data.next_meeting_end
            ? new Date(data.next_meeting_end)
            : null,
          branch_id: effectiveBranchId,
        })
        .returning();

      // Create action items if provided
      if (data.action_items && data.action_items.length > 0) {
        // GAP-025: validate each final assignee is in the same branch as the report filer
        if (effectiveBranchId !== null) {
          for (const item of data.action_items) {
            const assigneeId = item.assigned_to ?? data.filed_by;
            const [assignee] = await tx
              .select({ branch_id: schema.users.branch_id })
              .from(schema.users)
              .where(eq(schema.users.id, assigneeId))
              .limit(1);
            if (!assignee) {
              throw new ValidationError(`Action item assignee (user ${assigneeId}) does not exist`);
            }
            if (assignee.branch_id !== null && assignee.branch_id !== effectiveBranchId) {
              throw new ValidationError(`Action item assignee (user ${assigneeId}) is not in the same branch as the report filer`);
            }
          }
        }
        await tx.insert(schema.actionItems).values(
          data.action_items.map((item) => ({
            call_report_id: report.id,
            description: item.description,
            // BR-038: assigned_to defaults to the filing RM if not explicitly set
            assigned_to: item.assigned_to ?? data.filed_by,
            due_date: item.due_date,
            priority: item.priority || 'MEDIUM',
          })),
        );
        // GAP-019: ConversationHistory entry for action-items creation
        await tx.insert(schema.conversationHistory).values({
          lead_id: data.lead_id ?? null,
          prospect_id: data.prospect_id ?? null,
          client_id: data.client_id ?? null,
          interaction_type: 'NOTE',
          interaction_date: new Date(),
          summary: `${data.action_items.length} action item(s) created for call report ${report_code}`,
          reference_type: 'call_report',
          reference_id: report.id,
          created_by: data.filed_by ? String(data.filed_by) : null,
        } as any);
      }

      return report;
    });
  },

  /**
   * Update a call report. Only allowed when status is DRAFT or RETURNED.
   */
  async update(id: number, data: Record<string, unknown>, userId?: number): Promise<CallReport> {
    const [existing] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, id));

    if (!existing) {
      throw new NotFoundError(`Call report ${id} not found`);
    }

    // IDOR protection: verify ownership
    if (userId && existing.filed_by !== userId) {
      throw new ForbiddenError('Not authorized to modify this call report');
    }

    if (existing.report_status !== 'DRAFT' && existing.report_status !== 'RETURNED') {
      throw new ValidationError(
        `Cannot update call report in status "${existing.report_status}". Only DRAFT or RETURNED reports can be edited.`,
      );
    }

    // GAP-032: Validate attachment size limits on update
    if (data.attachment_urls && Array.isArray(data.attachment_urls)) {
      const MAX_FILE_BYTES = 10 * 1024 * 1024;
      const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
      let totalSize = 0;
      for (const att of data.attachment_urls as Array<{ url?: string; file_size?: number } | string>) {
        if (typeof att === 'object' && att !== null && typeof att.file_size === 'number') {
          if (att.file_size > MAX_FILE_BYTES) throw new ValidationError('Attachment exceeds the 10 MB per-file limit');
          totalSize += att.file_size;
        }
      }
      if (totalSize > MAX_TOTAL_BYTES) throw new ValidationError('Total attachment size exceeds the 50 MB limit');
    }

    // Allowlist: only permit these fields to be updated
    const ALLOWED_FIELDS = [
      'subject', 'summary', 'discussion_summary', 'topics_discussed',
      'products_discussed', 'outcome', 'follow_up_required', 'follow_up_date',
      'person_met', 'state_of_mind', 'client_status', 'meeting_reason',
      'attachment_urls', 'next_meeting_start', 'next_meeting_end', 'remarks',
    ] as const;

    const updateData: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in data) {
        updateData[field] = data[field];
      }
    }

    const [updated] = await db
      .update(schema.callReports)
      // Drizzle .set() requires exact column types; dynamic field map needs cast
      .set({
        ...updateData,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.callReports.id, id))
      .returning();

    return updated;
  },

  /**
   * Fire-and-forget AI tagging via Platform Intelligence Service.
   * Stores the returned tags (topics, sentiment, action_items, keywords)
   * back onto the call report. Does NOT block the submit response.
   */
  _backgroundTag(reportId: number, summary: string, clientId?: string | null): void {
    tagCallReport(reportId, summary, clientId ?? undefined)
      .then(async (tags) => {
        if (!tags) return; // platform not configured or unavailable
        await db
          .update(schema.callReports)
          .set({ ai_tags: tags as any, updated_at: new Date() })
          .where(eq(schema.callReports.id, reportId));
      })
      .catch((err: unknown) => {
        // Non-fatal — log and move on
        console.warn('[call-report-service] AI tagging failed:', err instanceof Error ? err.message : err);
      });
  },

  /**
   * Submit a call report for approval or auto-approve.
   *
   * - Calculates business days since meeting
   * - If > 5 business days: routes to supervisor approval
   * - Otherwise: auto-approves
   * - Updates meeting call_report_status
   * - Logs to conversation history
   * - Auto-creates next meeting if dates provided
   */
  async submit(id: number, userId: number, callerRole?: string): Promise<CallReport> {
    const [report] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, id));

    if (!report) {
      throw new NotFoundError(`Call report ${id} not found`);
    }

    // IDOR protection: verify ownership
    if (userId && report.filed_by !== userId) {
      throw new ForbiddenError('Not authorized to modify this call report');
    }

    // BR-028: BRANCH_ASSOCIATE can only file standalone call reports
    if (callerRole === 'BRANCH_ASSOCIATE' && report.report_type !== 'STANDALONE') {
      throw new ForbiddenError('BRANCH_ASSOCIATE role can only file standalone call reports.');
    }

    if (report.report_status !== 'DRAFT' && report.report_status !== 'RETURNED') {
      throw new ValidationError(
        `Cannot submit call report in status "${report.report_status}". Only DRAFT or RETURNED reports can be submitted.`,
      );
    }

    const now = new Date();

    // Standalone reports always auto-approve — skip the threshold check
    if (report.report_type === 'STANDALONE') {
      const result = await db.transaction(async (tx: typeof db) => {
        const [updated] = await tx
          .update(schema.callReports)
          // Drizzle .set() requires exact column types; dynamic field map needs cast
          .set({
            filed_date: now,
            days_since_meeting: 0,
            requires_supervisor_approval: false,
            report_status: 'APPROVED',
            approved_at: now,
            updated_at: now,
          } as any)
          .where(eq(schema.callReports.id, id))
          .returning();

        // Update meeting call_report_status if linked
        if (report.meeting_id) {
          await tx
            .update(schema.meetings)
            // Drizzle .set() requires exact column types; dynamic field map needs cast
            .set({ call_report_status: 'FILED', updated_at: now } as any)
            .where(eq(schema.meetings.id, report.meeting_id));
        }

        // Insert conversation history entry
        await tx.insert(schema.conversationHistory).values({
          lead_id: report.lead_id ?? null,
          prospect_id: report.prospect_id ?? null,
          client_id: report.client_id ?? null,
          interaction_type: 'CALL_REPORT_FILED',
          interaction_date: now,
          summary: `Call report ${report.report_code} filed (standalone). Status: APPROVED.`,
          reference_type: 'call_report',
          reference_id: id,
          created_by: String(userId),
        });

        // Auto-create next meeting if dates provided
        if (report.next_meeting_start && report.next_meeting_end) {
          const meetingCode = await generateMeetingCode();

          await tx.insert(schema.meetings).values({
            meeting_code: meetingCode,
            title: `Follow-up: ${report.subject}`,
            meeting_type: report.meeting_type,
            lead_id: report.lead_id ?? null,
            prospect_id: report.prospect_id ?? null,
            client_id: report.client_id ?? null,
            organizer_user_id: report.filed_by,
            start_time: new Date(report.next_meeting_start),
            end_time: new Date(report.next_meeting_end),
            meeting_status: 'SCHEDULED',
            branch_id: report.branch_id ?? null,
            is_all_day: false,
            reminder_sent: false,
          });
        }

        return updated;
      });

      // Fire-and-forget AI tagging (non-blocking)
      this._backgroundTag(id, report.summary, report.client_id);

      return result;
    }

    const [daysSinceMeeting, lateFilingThreshold] = await Promise.all([
      calculateBusinessDaysPSE(report.meeting_date, now),
      getLateFilingDays(),
    ]);
    const requiresApproval = daysSinceMeeting > lateFilingThreshold;

    const submitted = await db.transaction(async (tx: typeof db) => {
      let updatePayload: Record<string, unknown>;

      if (requiresApproval) {
        // Late filing — route to supervisor
        updatePayload = {
          filed_date: now,
          days_since_meeting: daysSinceMeeting,
          requires_supervisor_approval: true,
          report_status: 'PENDING_APPROVAL',
          approval_submitted_at: now,
          updated_at: now,
        };

        // Create approval record with a placeholder supervisor_id (will be claimed later)
        await tx.insert(schema.callReportApprovals).values({
          call_report_id: id,
          supervisor_id: userId,
          action: 'PENDING',
        });

        // GAP-014: Notify the filing RM that their late report is pending supervisor approval
        await notificationInboxService.notifyChannels({
          recipient_user_id: userId,
          type: 'CALL_REPORT_PENDING_APPROVAL',
          title: 'Call Report Submitted for Approval',
          message: `Your call report ${report.report_code} was filed ${daysSinceMeeting} business days after the meeting and requires supervisor approval.`,
          channels: ['IN_APP', 'EMAIL'],
          related_entity_type: 'call_report',
          related_entity_id: id,
        });

        // GAP-014: Notify branch supervisors of the new pending approval
        if (report.branch_id) {
          const supervisors = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
              and(
                eq(schema.users.branch_id, report.branch_id),
                eq(schema.users.is_active, true),
              ),
            );
          const supervisorIds = supervisors
            .map((u: { id: number }) => u.id)
            .filter((id: number) => id !== userId);
          if (supervisorIds.length > 0) {
            await notificationInboxService.notifyMultipleChannels(supervisorIds, {
              type: 'CALL_REPORT_PENDING_APPROVAL',
              title: 'New Call Report Pending Approval',
              message: `Call report ${report.report_code} has been submitted for approval review.`,
              channels: ['IN_APP', 'EMAIL'],
              related_entity_type: 'call_report',
              related_entity_id: id,
            });
          }
        }

        // BR-023: Create a SYSTEM_GENERATED task for BO_HEAD when report is filed >5 business days late
        await taskManagementService.create({
          title: `Review late-filed call report ${report.report_code}`,
          description: `Call report ${report.report_code} was filed ${daysSinceMeeting} business days after the meeting (threshold: ${lateFilingThreshold} days). Supervisor review required.`,
          task_type: 'SYSTEM_GENERATED',
          priority: 'HIGH',
          due_date: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          related_entity_type: 'call_report',
          related_entity_id: id,
        });
      } else {
        // On-time filing — auto-approve
        updatePayload = {
          filed_date: now,
          days_since_meeting: daysSinceMeeting,
          requires_supervisor_approval: false,
          report_status: 'APPROVED',
          approved_at: now,
          updated_at: now,
        };
      }

      const [updated] = await tx
        .update(schema.callReports)
        // Drizzle .set() requires exact column types; dynamic field map needs cast
        .set(updatePayload as any)
        .where(eq(schema.callReports.id, id))
        .returning();

      // Update meeting call_report_status if linked
      if (report.meeting_id) {
        await tx
          .update(schema.meetings)
          // Drizzle .set() requires exact column types; dynamic field map needs cast
          .set({ call_report_status: 'FILED', updated_at: now } as any)
          .where(eq(schema.meetings.id, report.meeting_id));
      }

      // Insert conversation history entry
      await tx.insert(schema.conversationHistory).values({
        lead_id: report.lead_id ?? null,
        prospect_id: report.prospect_id ?? null,
        client_id: report.client_id ?? null,
        interaction_type: 'CALL_REPORT_FILED',
        interaction_date: now,
        summary: `Call report ${report.report_code} filed (${daysSinceMeeting} business days since meeting). Status: ${requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED'}.`,
        reference_type: 'call_report',
        reference_id: id,
        created_by: String(userId),
      });

      // Auto-create next meeting if dates provided
      if (report.next_meeting_start && report.next_meeting_end) {
        const meetingCode = await generateMeetingCode();

        await tx.insert(schema.meetings).values({
          meeting_code: meetingCode,
          title: `Follow-up: ${report.subject}`,
          meeting_type: report.meeting_type,
          lead_id: report.lead_id ?? null,
          prospect_id: report.prospect_id ?? null,
          client_id: report.client_id ?? null,
          organizer_user_id: report.filed_by,
          start_time: new Date(report.next_meeting_start),
          end_time: new Date(report.next_meeting_end),
          meeting_status: 'SCHEDULED',
          branch_id: report.branch_id ?? null,
          is_all_day: false,
          reminder_sent: false,
        });
      }

      return updated;
    });

    // Fire-and-forget AI tagging (non-blocking)
    this._backgroundTag(id, report.summary, report.client_id);

    return submitted;
  },

  /**
   * List call reports with filters and pagination.
   */
  async getAll(filters: {
    reportStatus?: string;
    reportType?: string;
    meetingReason?: string;
    filedBy?: number;
    branchId?: number;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: CallReport[]; total: number; page: number; pageSize: number; has_next: boolean; has_previous: boolean }> {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.reportStatus) {
      // Drizzle enum types require cast when filter value comes from untyped input
      conditions.push(eq(schema.callReports.report_status, filters.reportStatus as typeof schema.callReportStatusEnum.enumValues[number]));
    }
    if (filters.reportType) {
      // Drizzle enum types require cast when filter value comes from untyped input
      conditions.push(eq(schema.callReports.report_type, filters.reportType as typeof schema.callReportTypeEnum.enumValues[number]));
    }
    if (filters.meetingReason) {
      conditions.push(eq(schema.callReports.meeting_reason, filters.meetingReason as typeof schema.meetingReasonEnum.enumValues[number]));
    }
    if (filters.filedBy) {
      conditions.push(eq(schema.callReports.filed_by, filters.filedBy));
    }
    if (filters.branchId) {
      conditions.push(eq(schema.callReports.branch_id, filters.branchId));
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(schema.callReports.subject, term),
          ilike(schema.callReports.summary, term),
        )!,
      );
    }
    if (filters.startDate) {
      conditions.push(gte(schema.callReports.meeting_date, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(schema.callReports.meeting_date, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(schema.callReports)
        .where(whereClause)
        .orderBy(desc(schema.callReports.meeting_date))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.callReports)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    // GAP-027: include has_next / has_previous for cursor-style pagination
    return { data, total, page, pageSize, has_next: page * pageSize < total, has_previous: page > 1 };
  },

  /**
   * Get a single call report by ID, with its action items.
   */
  async getById(id: number): Promise<CallReport & { actionItems: ActionItem[] }> {
    const [report] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, id));

    if (!report) {
      throw new NotFoundError(`Call report ${id} not found`);
    }

    const actionItemsList = await db
      .select()
      .from(schema.actionItems)
      .where(eq(schema.actionItems.call_report_id, id))
      .orderBy(asc(schema.actionItems.due_date));

    return { ...report, actionItems: actionItemsList };
  },

  /**
   * Calculate business days between two dates (public for testing).
   */
  calculateBusinessDays,

  // ── FR-011: Call Report Feedback ──────────────────────────────────────────

  /**
   * Add feedback to a call report (P0-02).
   * Feedback is immutable once created. Private feedback only visible to author + filing RM.
   */
  async addFeedback(callReportId: number, data: {
    feedback_by: number;
    feedback_type: string;
    comment: string;
    is_private?: boolean;
    sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    source?: string; // GAP-017: CALENDAR | CUSTOMER_DASHBOARD
  }) {
    if (!data.comment || data.comment.trim().length < 10) {
      throw new ValidationError('comment must be at least 10 characters');
    }
    if (data.comment.length > 2000) {
      throw new ValidationError('comment must be at most 2000 characters');
    }

    const VALID_TYPES = ['GENERAL', 'COACHING', 'COMPLIANCE_FLAG', 'QUALITY_ISSUE'] as const;
    if (!VALID_TYPES.includes(data.feedback_type as any)) {
      throw new ValidationError(`feedback_type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    // Verify call report exists
    const [report] = await db
      .select({ id: schema.callReports.id })
      .from(schema.callReports)
      .where(eq(schema.callReports.id, callReportId))
      .limit(1);
    if (!report) throw new NotFoundError(`Call report ${callReportId} not found`);

    const [callReport] = await db
      .select({ lead_id: schema.callReports.lead_id, prospect_id: schema.callReports.prospect_id, client_id: schema.callReports.client_id, report_code: schema.callReports.report_code })
      .from(schema.callReports)
      .where(eq(schema.callReports.id, callReportId))
      .limit(1);

    const [feedback] = await db
      .insert(schema.callReportFeedback)
      .values({
        call_report_id: callReportId,
        feedback_by: data.feedback_by,
        feedback_type: data.feedback_type,
        comment: data.comment.trim(),
        sentiment: (data.sentiment ?? 'NEUTRAL') as any,
        is_private: data.is_private ?? false,
        source: data.source ?? 'CALENDAR', // GAP-017
      } as any)
      .returning();

    // GAP-019: ConversationHistory entry for supervisor feedback (non-private only)
    if (!data.is_private && callReport) {
      await db.insert(schema.conversationHistory).values({
        lead_id: callReport.lead_id ?? null,
        prospect_id: callReport.prospect_id ?? null,
        client_id: callReport.client_id ?? null,
        interaction_type: 'NOTE',
        interaction_date: new Date(),
        summary: `Supervisor feedback (${data.feedback_type}) added to call report ${callReport.report_code}`,
        reference_type: 'call_report',
        reference_id: callReportId,
        created_by: String(data.feedback_by),
      } as any);
    }

    return feedback;
  },

  /**
   * List feedback for a call report.
   * Private feedback filtered to author and the report's filing RM only.
   */
  async listFeedback(callReportId: number, requestingUserId: number) {
    const [report] = await db
      .select({ id: schema.callReports.id, filed_by: schema.callReports.filed_by })
      .from(schema.callReports)
      .where(eq(schema.callReports.id, callReportId))
      .limit(1);
    if (!report) throw new NotFoundError(`Call report ${callReportId} not found`);

    const allFeedback = await db
      .select()
      .from(schema.callReportFeedback)
      .where(eq(schema.callReportFeedback.call_report_id, callReportId))
      .orderBy(schema.callReportFeedback.created_at);

    type FeedbackRow = typeof schema.callReportFeedback.$inferSelect;
    // Filter private feedback: only visible to author or filing RM
    return allFeedback.filter(
      (f: FeedbackRow) => !f.is_private || f.feedback_by === requestingUserId || report.filed_by === requestingUserId,
    );
  },

  // ── FR-012: Linked Call Report Chain ──────────────────────────────────────

  /**
   * Get the full interaction chain for a call report (P0-03).
   * Traverses parent_report_id links to build an ordered chain.
   */
  async getChain(callReportId: number): Promise<Array<typeof schema.callReports.$inferSelect>> {
    // Fetch current report
    const [report] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, callReportId))
      .limit(1);
    if (!report) throw new NotFoundError(`Call report ${callReportId} not found`);

    // Walk up the parent chain (max 50 hops to prevent runaway queries)
    const chain: Array<typeof schema.callReports.$inferSelect> = [report];
    const seen = new Set<number>([callReportId]);
    let current = report;

    while (current.parent_report_id && !seen.has(current.parent_report_id)) {
      seen.add(current.parent_report_id);
      const [parent] = await db
        .select()
        .from(schema.callReports)
        .where(eq(schema.callReports.id, current.parent_report_id))
        .limit(1);
      if (!parent) break;
      chain.unshift(parent); // prepend so chain is oldest-first
      current = parent;
      if (chain.length >= 50) break; // safety cap
    }

    return chain;
  },

  /**
   * Link a call report to a parent report (P0-03).
   * Validates: same client_id, no circular reference.
   */
  async linkToParent(callReportId: number, parentReportId: number, userId: number) {
    if (callReportId === parentReportId) {
      throw new ValidationError('A call report cannot be linked to itself');
    }

    const [report] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, callReportId))
      .limit(1);
    if (!report) throw new NotFoundError(`Call report ${callReportId} not found`);
    if (report.filed_by !== userId) throw new ForbiddenError('Not the report owner');

    const [parent] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, parentReportId))
      .limit(1);
    if (!parent) throw new NotFoundError(`Parent call report ${parentReportId} not found`);

    // Same client check
    if (report.client_id && parent.client_id && report.client_id !== parent.client_id) {
      throw new ValidationError('Cannot link call reports for different clients');
    }

    // Circular reference check: walk the parent's chain; if callReportId appears, reject
    const parentChain = await this.getChain(parentReportId);
    if (parentChain.some((r) => r.id === callReportId)) {
      throw new ValidationError('Circular link detected: this would create a cycle');
    }

    const [updated] = await db
      .update(schema.callReports)
      .set({ parent_report_id: parentReportId, updated_at: new Date() })
      .where(eq(schema.callReports.id, callReportId))
      .returning();

    return updated;
  },

  // ── FR-010: Call Report Approval Queue ────────────────────────────────────

  /**
   * List call reports awaiting supervisor review (P1-02 approval queue).
   * Scoped to the supervisor's branch or all if admin.
   */
  async getApprovalQueue(filters?: {
    branch_id?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [
      sql`${schema.callReports.report_status} IN ('SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL')`,
    ];
    if (filters?.branch_id) {
      conditions.push(eq(schema.callReports.branch_id, filters.branch_id));
    }
    const where = and(...conditions);

    const data = await db
      .select()
      .from(schema.callReports)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(
        // Late-filed first, then oldest submission
        desc(schema.callReports.requires_supervisor_approval),
        schema.callReports.approval_submitted_at,
      );

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.callReports)
      .where(where);

    return { data, total: Number(count), page, pageSize };
  },

  /**
   * Approve a call report in the approval queue (P0-08: supervisor action).
   * Guards: supervisor cannot approve their own report.
   */
  async approveFromQueue(callReportId: number, supervisorId: number, data: {
    quality_score?: number;
    comments?: string;
  }) {
    const report = await this.getById(callReportId);
    if (!['SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL'].includes(report.report_status)) {
      throw new ConflictError(`Cannot approve report in status: ${report.report_status}`);
    }
    // SoD: supervisor cannot approve own report
    if (report.filed_by === supervisorId) {
      throw new ForbiddenError('Separation of duties: cannot approve your own call report');
    }
    if (data.quality_score !== undefined && (data.quality_score < 1 || data.quality_score > 5)) {
      throw new ValidationError('quality_score must be between 1 and 5');
    }

    const [updated] = await db
      .update(schema.callReports)
      .set({
        report_status: 'APPROVED',
        approved_by: supervisorId,
        approved_at: new Date(),
        ...(data.quality_score !== undefined && { quality_score: data.quality_score }),
        updated_at: new Date(),
      })
      .where(eq(schema.callReports.id, callReportId))
      .returning();

    // GAP-012: Notify the RM of the approval decision
    if (updated.filed_by) {
      await notificationInboxService.notify({
        recipient_user_id: updated.filed_by,
        type: 'CALL_REPORT_APPROVED',
        title: 'Call Report Approved',
        message: `Your call report ${updated.report_code} has been approved.`,
        channel: 'IN_APP',
        related_entity_type: 'call_report',
        related_entity_id: callReportId,
      });
    }

    return updated;
  },

  /**
   * Reject / request-info on a call report in the approval queue.
   */
  async rejectFromQueue(callReportId: number, supervisorId: number, data: {
    action: 'REJECT' | 'REQUEST_INFO';
    reason: string;
  }) {
    if (!data.reason || data.reason.trim().length < 20) {
      throw new ValidationError('rejection_reason must be at least 20 characters');
    }
    const report = await this.getById(callReportId);
    if (!['SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL'].includes(report.report_status)) {
      throw new ConflictError(`Cannot act on report in status: ${report.report_status}`);
    }
    if (report.filed_by === supervisorId) {
      throw new ForbiddenError('Separation of duties: cannot reject your own call report');
    }

    const newStatus = data.action === 'REQUEST_INFO' ? 'UNDER_REVIEW' : 'REJECTED';

    const [updated] = await db
      .update(schema.callReports)
      .set({
        report_status: newStatus,
        rejection_reason: data.reason.trim(),
        updated_at: new Date(),
      })
      .where(eq(schema.callReports.id, callReportId))
      .returning();

    // GAP-012: Notify the RM of the rejection/request-info decision
    if (updated.filed_by) {
      const isReject = data.action === 'REJECT';
      await notificationInboxService.notify({
        recipient_user_id: updated.filed_by,
        type: 'CALL_REPORT_RETURNED',
        title: isReject ? 'Call Report Rejected' : 'Call Report: More Information Requested',
        message: isReject
          ? `Your call report ${updated.report_code} has been rejected. Reason: ${data.reason.trim()}`
          : `Your call report ${updated.report_code} requires additional information: ${data.reason.trim()}`,
        channel: 'IN_APP',
        related_entity_type: 'call_report',
        related_entity_id: callReportId,
      });
    }

    return updated;
  },

  /**
   * GAP-026: Update an action item's status or completion notes.
   * Blocks re-opening of COMPLETED or CANCELLED items.
   */
  async updateActionItem(id: number, data: {
    action_status?: string;
    completion_notes?: string;
    due_date?: string;
    priority?: string;
    actor_user_id?: number;
  }): Promise<ActionItem> {
    const [item] = await db.select().from(schema.actionItems).where(eq(schema.actionItems.id, id)).limit(1);
    if (!item) throw new NotFoundError(`Action item ${id} not found`);

    if (data.actor_user_id && item.assigned_to !== data.actor_user_id && item.created_by_user_id !== data.actor_user_id) {
      throw new ForbiddenError('Only the action item assignee or creator can update this action item');
    }

    // GAP-026: Cannot re-open COMPLETED or CANCELLED items
    if ((item.action_status === 'COMPLETED' || item.action_status === 'CANCELLED') && data.action_status) {
      if (data.action_status === 'OPEN' || data.action_status === 'IN_PROGRESS') {
        throw new ValidationError(`Cannot re-open an action item in status "${item.action_status}"`);
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (data.action_status !== undefined) {
      updates.action_status = data.action_status;
      if (data.action_status === 'COMPLETED') {
        updates.completed_at = new Date();
      }
    }
    if (data.completion_notes !== undefined) updates.completion_notes = data.completion_notes;
    if (data.due_date !== undefined) updates.due_date = data.due_date;
    if (data.priority !== undefined) updates.priority = data.priority;

    const [updated] = await db
      .update(schema.actionItems)
      .set(updates as any)
      .where(eq(schema.actionItems.id, id))
      .returning();

    return updated;
  },
};
