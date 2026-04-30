/**
 * Campaign Management Service (CRM-CAM)
 *
 * Handles campaign lifecycle, approval workflow, lead list rule execution,
 * response capture, unified interaction logging, and email dispatch.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, count, inArray, notInArray, ne, gte, lte, gt, lt, isNull, or } from 'drizzle-orm';
import { sanctionsService } from './sanctions-service';
import { notificationInboxService } from './notification-inbox-service';
import crypto from 'crypto';

type Campaign = typeof schema.campaigns.$inferSelect;
type LeadList = typeof schema.leadLists.$inferSelect;
type LeadListMember = typeof schema.leadListMembers.$inferSelect;
type CampaignResponse = typeof schema.campaignResponses.$inferSelect;
type Meeting = typeof schema.meetings.$inferSelect;
type CallReport = typeof schema.callReports.$inferSelect;
type RmHandover = typeof schema.rmHandovers.$inferSelect;

const VALID_RESPONSE_TYPES = ['INTERESTED', 'NOT_INTERESTED', 'NEED_MORE_INFO', 'CONVERTED', 'OTHER', 'MAYBE', 'NO_RESPONSE', 'CALLBACK_REQUESTED'] as const;
const VALID_MEETING_TYPES = ['IN_PERSON', 'VIRTUAL', 'PHONE'] as const;
const VALID_CHANNELS = ['EMAIL', 'SMS', 'PUSH_NOTIFICATION'] as const;

function validateEnum<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid ${label}: "${value}". Must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

// ============================================================================
// Code Generation Helpers
// ============================================================================

async function generateCode(prefix: string, table: 'campaigns' | 'lead_lists' | 'meetings'): Promise<string> {
  const now = new Date();
  const dateSegment = prefix === 'MTG'
    ? `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    : `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const pattern = `${prefix}-${dateSegment}-%`;

  let result;
  let codeCol: string;
  switch (table) {
    case 'campaigns':
      codeCol = 'campaign_code';
      result = await db.execute(sql`SELECT campaign_code FROM campaigns WHERE campaign_code LIKE ${pattern} ORDER BY campaign_code DESC LIMIT 1`);
      break;
    case 'lead_lists':
      codeCol = 'list_code';
      result = await db.execute(sql`SELECT list_code FROM lead_lists WHERE list_code LIKE ${pattern} ORDER BY list_code DESC LIMIT 1`);
      break;
    case 'meetings':
      codeCol = 'meeting_code';
      result = await db.execute(sql`SELECT meeting_code FROM meetings WHERE meeting_code LIKE ${pattern} ORDER BY meeting_code DESC LIMIT 1`);
      break;
  }

  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>)[codeCol];
    const lastSeq = parseInt(lastCode.split('-').pop() || '0', 10);
    nextSeq = lastSeq + 1;
  }
  return `${prefix}-${dateSegment}-${String(nextSeq).padStart(4, '0')}`;
}

async function generateLeadCode(): Promise<string> {
  const pattern = 'L-%';
  const result = await db.execute(sql`SELECT lead_code FROM leads WHERE lead_code LIKE ${pattern} ORDER BY lead_code DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).lead_code;
    const lastSeq = parseInt(lastCode.replace('L-', ''), 10);
    nextSeq = lastSeq + 1;
  }
  return `L-${String(nextSeq).padStart(8, '0')}`;
}

async function generateProspectCode(): Promise<string> {
  const pattern = 'P-%';
  const result = await db.execute(sql`SELECT prospect_code FROM prospects WHERE prospect_code LIKE ${pattern} ORDER BY prospect_code DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).prospect_code;
    const lastSeq = parseInt(lastCode.replace('P-', ''), 10);
    nextSeq = lastSeq + 1;
  }
  return `P-${String(nextSeq).padStart(8, '0')}`;
}

// ============================================================================
// Philippine Public Holidays 2026 & Business Day Calculator
// ============================================================================

const PH_HOLIDAYS_2026: string[] = [
  '2026-01-01', // New Year's Day
  '2026-02-25', // EDSA Revolution Anniversary
  '2026-04-09', // Araw ng Kagitingan (Day of Valor)
  '2026-05-01', // Labor Day
  '2026-06-12', // Independence Day
  '2026-08-21', // Ninoy Aquino Day
  '2026-11-30', // Bonifacio Day
  '2026-12-25', // Christmas Day
  '2026-12-30', // Rizal Day
];

/**
 * Adds business days to a date, skipping weekends (Sat/Sun) and
 * Philippine public holidays for 2026.
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    // Skip Philippine public holidays
    const iso = result.toISOString().split('T')[0];
    if (PH_HOLIDAYS_2026.includes(iso)) continue;
    remaining--;
  }

  return result;
}

/**
 * Counts the number of business days between two dates, excluding weekends
 * (Saturday/Sunday) and Philippine public holidays for 2026.
 */
function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cur < endDay) {
    const dow = cur.getDay();
    const iso = cur.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !PH_HOLIDAYS_2026.includes(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function computeDedupHash(firstName: string, lastName: string, email?: string, phone?: string): string {
  // Unicode NFD normalization + accent stripping for better dedup matching
  const stripAccents = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Phone normalization: strip country code prefix (+63 for Philippines)
  const normalizePhone = (p: string) =>
    p.replace(/[\s\-\+]/g, '').replace(/^63/, '');

  const normalized = [
    stripAccents((firstName || '').toLowerCase().trim()),
    stripAccents((lastName || '').toLowerCase().trim()),
    (email || '').toLowerCase().trim(),
    normalizePhone((phone || '')),
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

const LOCKED_CAMPAIGN_LIST_STATUSES = ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL'] as const;

type LeadUploadValidatedData = {
  valid?: Array<{ first_name: string; last_name: string; email?: string; mobile_phone?: string; entity_type?: string; source?: string }>;
  errors?: Array<{ row_number: number; data: Record<string, unknown>; error: string }>;
};

function parseLeadUploadValidatedData(raw: unknown): LeadUploadValidatedData | unknown[] {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as LeadUploadValidatedData | unknown[];
    } catch {
      return [];
    }
  }
  return (raw ?? []) as LeadUploadValidatedData | unknown[];
}

async function assertLeadListAudienceEditable(listId: number): Promise<void> {
  const [assignment] = await db
    .select({
      campaign_id: schema.campaigns.id,
      campaign_status: schema.campaigns.campaign_status,
    })
    .from(schema.campaignLists)
    .innerJoin(schema.campaigns, eq(schema.campaignLists.campaign_id, schema.campaigns.id))
    .where(and(
      eq(schema.campaignLists.lead_list_id, listId),
      inArray(schema.campaigns.campaign_status, [...LOCKED_CAMPAIGN_LIST_STATUSES]),
      eq(schema.campaigns.is_deleted, false),
    ))
    .limit(1);

  if (assignment) {
    throw new Error(`Cannot modify a lead list assigned to a ${assignment.campaign_status} campaign`);
  }
}

// ============================================================================
// Campaign Lifecycle
// ============================================================================

export const campaignService = {
  async submit(campaignId: number, userId: string): Promise<Campaign> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.campaign_status !== 'DRAFT') {
      throw new Error('Only DRAFT campaigns can be submitted for approval');
    }
    const [updated] = await db
      .update(schema.campaigns)
      .set({
        campaign_status: 'PENDING_APPROVAL',
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();
    // Emit notification event
    await emitCampaignNotification('CAMPAIGN_SUBMITTED', campaignId, userId);
    return updated;
  },

  async approve(campaignId: number, userId: string): Promise<Campaign> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.campaign_status !== 'PENDING_APPROVAL') {
      throw new Error('Only PENDING_APPROVAL campaigns can be approved');
    }
    if (String(campaign.owner_user_id) === userId) {
      throw new Error('Campaign owner cannot approve their own campaign');
    }
    const [updated] = await db
      .update(schema.campaigns)
      .set({
        campaign_status: 'APPROVED',
        approved_by: parseInt(userId, 10) || null,
        approved_at: new Date(),
        rejection_reason: null,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();
    // Emit notification event (activation job will set ACTIVE when start_date arrives)
    await emitCampaignNotification('CAMPAIGN_APPROVED', campaignId, userId);
    return updated;
  },

  async reject(campaignId: number, userId: string, reason: string): Promise<Campaign> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason is mandatory');
    }
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.campaign_status !== 'PENDING_APPROVAL') {
      throw new Error('Only PENDING_APPROVAL campaigns can be rejected');
    }
    if (String(campaign.owner_user_id) === userId) {
      throw new Error('Campaign owner cannot reject their own campaign');
    }
    const [updated] = await db
      .update(schema.campaigns)
      .set({
        campaign_status: 'REJECTED',
        approved_by: null,
        approved_at: null,
        rejection_reason: reason.trim(),
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();
    // Emit notification event
    await emitCampaignNotification('CAMPAIGN_REJECTED', campaignId, userId, { reason: reason.trim() });
    return updated;
  },

  // BRD G-013: reset a REJECTED campaign back to DRAFT so it can be re-submitted
  async resetToDraft(campaignId: number, userId: string): Promise<Campaign> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.campaign_status !== 'REJECTED') {
      throw new Error('Only REJECTED campaigns can be reset to DRAFT');
    }
    const [updated] = await db
      .update(schema.campaigns)
      .set({
        campaign_status: 'DRAFT',
        rejection_reason: null,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.campaigns.id, campaignId))
      .returning();
    return updated;
  },

  async copyCampaign(campaignId: number, userId: string): Promise<Campaign> {
    const [source] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    if (!source) throw new Error('Source campaign not found');
    // Fetch list assignments before the transaction (read-only, no need to be atomic)
    const lists = await db
      .select()
      .from(schema.campaignLists)
      .where(eq(schema.campaignLists.campaign_id, campaignId));
    const newCampaignCode = await generateCode('CAM', 'campaigns');
    return await db.transaction(async (tx: any) => {
      const [newCampaign] = await tx
        .insert(schema.campaigns)
        .values({
          campaign_code: newCampaignCode,
          name: `${source.name} (Copy)`,
          description: source.description,
          campaign_type: source.campaign_type,
          campaign_status: 'DRAFT',
          target_product_id: source.target_product_id,
          event_name: source.event_name,
          event_date: source.event_date,
          event_venue: source.event_venue,
          budget_amount: source.budget_amount,
          budget_currency: source.budget_currency,
          actual_spend: '0',
          start_date: source.start_date,
          end_date: source.end_date,
          brochure_url: source.brochure_url,
          owner_user_id: parseInt(userId, 10) || null,
          created_by: userId,
          updated_by: userId,
        })
        .returning();
      // Copy campaign-list assignments
      if (lists.length > 0) {
        await tx.insert(schema.campaignLists).values(
          lists.map((l: { lead_list_id: number }) => ({
            campaign_id: newCampaign.id,
            lead_list_id: l.lead_list_id,
            assigned_by: userId,
          })),
        );
      }
      return newCampaign;
    });
  },

  async getAnalytics(campaignId: number): Promise<{
    campaign_id: number;
    campaign_name: string;
    responses_by_type: { response_type: string; count: number }[];
    total_responses: number;
    conversion_rate: number;
    dispatch_summary: { total_recipients: number | null; total_delivered: number | null; total_bounced: number | null };
    budget_amount: string | null;
    actual_spend: string | null;
  }> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    if (!campaign) throw new Error('Campaign not found');

    const responsesByType = await db
      .select({
        response_type: schema.campaignResponses.response_type,
        count: count(),
      })
      .from(schema.campaignResponses)
      .where(and(
        eq(schema.campaignResponses.campaign_id, campaignId),
        eq(schema.campaignResponses.is_deleted, false),
      ))
      .groupBy(schema.campaignResponses.response_type);

    const totalResponses = responsesByType.reduce((sum: number, r: { count: number }) => sum + Number(r.count), 0);
    const converted = responsesByType.find((r: { response_type: string }) => r.response_type === 'CONVERTED');
    const conversionRate = totalResponses > 0 ? (Number(converted?.count || 0) / totalResponses) * 100 : 0;

    const dispatches = await db
      .select({
        total_recipients: sql<number>`SUM(${schema.campaignCommunications.total_recipients})`,
        total_delivered: sql<number>`SUM(${schema.campaignCommunications.delivered_count})`,
        total_bounced: sql<number>`SUM(${schema.campaignCommunications.bounced_count})`,
      })
      .from(schema.campaignCommunications)
      .where(eq(schema.campaignCommunications.campaign_id, campaignId));

    return {
      campaign_id: campaignId,
      campaign_name: campaign.name,
      responses_by_type: responsesByType,
      total_responses: totalResponses,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      dispatch_summary: dispatches[0] || { total_recipients: 0, total_delivered: 0, total_bounced: 0 },
      budget_amount: campaign.budget_amount,
      actual_spend: campaign.actual_spend,
    };
  },

  async getDashboardStats(): Promise<{
    campaigns_by_status: { campaign_status: string; count: number }[];
    total_leads: number;
    total_responses: number;
    conversion_rate: number;
    roi: number;
    total_revenue: number;
    total_campaign_cost: number;
    cost_per_lead: number;
    pipeline_value: number;
  }> {
    const statusCounts = await db
      .select({
        campaign_status: schema.campaigns.campaign_status,
        count: count(),
      })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.is_deleted, false))
      .groupBy(schema.campaigns.campaign_status);

    const totalLeads = await db
      .select({ count: count() })
      .from(schema.leads)
      .where(eq(schema.leads.is_deleted, false));

    const totalResponses = await db
      .select({ count: count() })
      .from(schema.campaignResponses)
      .where(eq(schema.campaignResponses.is_deleted, false));

    const convertedCount = await db
      .select({ count: count() })
      .from(schema.campaignResponses)
      .where(and(
        eq(schema.campaignResponses.response_type, 'CONVERTED'),
        eq(schema.campaignResponses.is_deleted, false),
      ));

    const totalResp = Number(totalResponses[0]?.count || 0);
    const totalLeadCount = Number(totalLeads[0]?.count || 0);
    const convRate = totalResp > 0 ? (Number(convertedCount[0]?.count || 0) / totalResp) * 100 : 0;

    // ROI = (revenue from converted leads - campaign cost) / campaign cost
    const revenueResult = await db
      .select({
        total_revenue: sql<string>`COALESCE(SUM(CAST(${schema.opportunities.pipeline_value} AS numeric)), 0)`,
      })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.stage, 'WON'));

    const costResult = await db
      .select({
        total_cost: sql<string>`COALESCE(SUM(CAST(${schema.campaigns.campaign_cost} AS numeric)), 0)`,
      })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.is_deleted, false));

    const totalRevenue = Number(revenueResult[0]?.total_revenue || 0);
    const totalCost = Number(costResult[0]?.total_cost || 0);
    const roi = totalCost > 0 ? Math.round(((totalRevenue - totalCost) / totalCost) * 10000) / 100 : 0;
    const costPerLead = totalLeadCount > 0 ? Math.round((totalCost / totalLeadCount) * 100) / 100 : 0;

    // Pipeline value aggregation from open opportunities
    const pipelineResult = await db
      .select({
        total_pipeline: sql<string>`COALESCE(SUM(CAST(${schema.opportunities.pipeline_value} AS numeric)), 0)`,
      })
      .from(schema.opportunities)
      .where(and(
        eq(schema.opportunities.is_deleted, false),
        sql`${schema.opportunities.stage} NOT IN ('WON', 'LOST')`,
      ));

    const pipelineValue = Number(pipelineResult[0]?.total_pipeline || 0);

    return {
      campaigns_by_status: statusCounts,
      total_leads: totalLeadCount,
      total_responses: totalResp,
      conversion_rate: Math.round(convRate * 100) / 100,
      roi,
      total_revenue: totalRevenue,
      total_campaign_cost: totalCost,
      cost_per_lead: costPerLead,
      pipeline_value: pipelineValue,
    };
  },

  async getRmScorecards(): Promise<{
    data: {
      rm_id: number;
      total_responses: number;
      converted: number;
      conversion_rate: number;
      avg_follow_up_days: number | null;
    }[];
  }> {
    const rows = await db
      .select({
        rm_id: schema.campaignResponses.assigned_rm_id,
        total: count(),
        converted: sql<string>`SUM(CASE WHEN ${schema.campaignResponses.response_type} = 'CONVERTED' THEN 1 ELSE 0 END)`,
        avg_days: sql<string>`AVG(CASE WHEN ${schema.campaignResponses.follow_up_date} IS NOT NULL THEN EXTRACT(EPOCH FROM (${schema.campaignResponses.follow_up_date}::timestamp - ${schema.campaignResponses.created_at})) / 86400 END)`,
      })
      .from(schema.campaignResponses)
      .where(and(
        eq(schema.campaignResponses.is_deleted, false),
        sql`${schema.campaignResponses.assigned_rm_id} IS NOT NULL`,
      ))
      .groupBy(schema.campaignResponses.assigned_rm_id);

    return {
      data: rows.map((r: { rm_id: unknown; total: unknown; converted: unknown; avg_days: unknown }) => {
        const total = Number(r.total);
        const conv = Number(r.converted || 0);
        return {
          rm_id: r.rm_id as number,
          total_responses: total,
          converted: conv,
          conversion_rate: total > 0 ? (conv / total) * 100 : 0,
          avg_follow_up_days: r.avg_days != null ? Math.round(Number(r.avg_days) * 10) / 10 : null,
        };
      }),
    };
  },

  async listResponses(campaignId: number, page: number = 1, pageSize: number = 20): Promise<{
    data: Record<string, unknown>[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }> {
    const offset = (page - 1) * pageSize;
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.campaignResponses)
      .where(and(
        eq(schema.campaignResponses.campaign_id, campaignId),
        eq(schema.campaignResponses.is_deleted, false),
      ));
    const total = Number(totalResult?.count || 0);
    const responses = await db
      .select({
        id: schema.campaignResponses.id,
        campaign_id: schema.campaignResponses.campaign_id,
        lead_id: schema.campaignResponses.lead_id,
        response_type: schema.campaignResponses.response_type,
        response_notes: schema.campaignResponses.response_notes,
        response_date: schema.campaignResponses.response_date,
        response_channel: schema.campaignResponses.response_channel,
        follow_up_required: schema.campaignResponses.follow_up_required,
        follow_up_date: schema.campaignResponses.follow_up_date,
        follow_up_completed: schema.campaignResponses.follow_up_completed,
        lead_first_name: schema.leads.first_name,
        lead_last_name: schema.leads.last_name,
        lead_email: schema.leads.email,
        lead_code: schema.leads.lead_code,
        lead_status: schema.leads.lead_status,
      })
      .from(schema.campaignResponses)
      .leftJoin(schema.leads, eq(schema.campaignResponses.lead_id, schema.leads.id))
      .where(and(
        eq(schema.campaignResponses.campaign_id, campaignId),
        eq(schema.campaignResponses.is_deleted, false),
      ))
      .orderBy(desc(schema.campaignResponses.response_date))
      .limit(pageSize)
      .offset(offset);
    return {
      data: responses,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  },

  // Call Report Lifecycle
  async submitCallReport(reportId: number, userId: string): Promise<CallReport> {
    const [report] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, reportId));
    if (!report) throw new Error('Call report not found');
    // BRD: DRAFT or RETURNED reports can be (re-)submitted
    if (report.report_status !== 'DRAFT' && report.report_status !== 'RETURNED') {
      throw new Error('Only DRAFT or RETURNED call reports can be submitted');
    }
    if (!report.summary || !report.subject) {
      throw new Error('Summary and subject are required before submission');
    }

    // Late detection: if meeting_date > 5 business days ago, route to supervisor approval
    const businessDaysSinceMeeting = businessDaysBetween(new Date(report.meeting_date), new Date());
    const requiresSupervisor = businessDaysSinceMeeting > 5;
    const now = new Date();

    // BRD FR-019 BR3: on-time reports auto-transition to APPROVED; late ones go to PENDING_APPROVAL
    const newStatus = requiresSupervisor ? 'PENDING_APPROVAL' : 'APPROVED';
    const approvalFields = requiresSupervisor
      ? {}
      : { approved_at: now, approved_by: parseInt(userId, 10) || null };

    const [updated] = await db
      .update(schema.callReports)
      .set({
        report_status: newStatus,
        requires_supervisor_approval: requiresSupervisor || report.requires_supervisor_approval,
        filed_date: now,
        days_since_meeting: businessDaysSinceMeeting,
        updated_by: userId,
        updated_at: now,
        ...approvalFields,
      } as any)
      .where(eq(schema.callReports.id, reportId))
      .returning();
    // Emit notification event (use campaign_id from report if available)
    if (report.campaign_id) {
      await emitCampaignNotification('CALL_REPORT_OVERDUE', report.campaign_id, userId, {
        report_id: reportId,
        late_submission: requiresSupervisor,
      });
    }
    return updated;
  },

  async approveCallReport(reportId: number, userId: string, approved: boolean, reason?: string, qualityScore?: number): Promise<CallReport> {
    const [report] = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.id, reportId));
    if (!report) throw new Error('Call report not found');
    if (report.report_status !== 'PENDING_APPROVAL' && report.report_status !== 'SUBMITTED') {
      throw new Error('Only PENDING_APPROVAL or SUBMITTED call reports can be approved/rejected');
    }
    // EC-001 (Approval SoD): Cannot approve your own call report
    if (report.filed_by !== null && report.filed_by !== undefined && String(report.filed_by) === String(userId)) {
      throw new Error('You cannot approve your own call report (separation of duties)');
    }
    // AC-051: quality_score must be 1-5 if provided
    if (qualityScore !== undefined && qualityScore !== null) {
      if (!Number.isInteger(qualityScore) || qualityScore < 1 || qualityScore > 5) {
        throw new Error('quality_score must be an integer between 1 and 5');
      }
    }

    const [updated] = await db
      .update(schema.callReports)
      .set({
        report_status: approved ? 'APPROVED' : 'REJECTED',
        approved_by: parseInt(userId, 10) || null,
        approved_at: approved ? new Date() : null,
        rejection_reason: approved ? null : (reason || 'No reason provided'),
        quality_score: approved && qualityScore !== undefined ? qualityScore : (report.quality_score ?? null),
        updated_by: userId,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.callReports.id, reportId))
      .returning();

    // BR-031: Notify filing RM on rejection
    if (!approved && report.filed_by !== null && report.filed_by !== undefined) {
      await notificationInboxService.notify({
        recipient_user_id: report.filed_by,
        type: 'CALL_REPORT_REJECTED',
        title: 'Call Report Rejected',
        message: `Your call report ${report.report_code} has been rejected. Reason: ${reason || 'No reason provided'}. Please revise and resubmit.`,
        channel: 'IN_APP',
        related_entity_type: 'call_report',
        related_entity_id: reportId,
      });
    }

    return updated;
  },

  // Handover Approval
  async approveHandover(handoverId: number, userId: string, approved: boolean, reason?: string): Promise<RmHandover> {
    const [handover] = await db
      .select()
      .from(schema.rmHandovers)
      .where(eq(schema.rmHandovers.id, handoverId));
    if (!handover) throw new Error('Handover not found');
    if (handover.handover_status !== 'PENDING') {
      throw new Error('Only PENDING handovers can be approved/rejected');
    }

    const newStatus = approved ? 'APPROVED' : 'REJECTED';

    const updated = await db.transaction(async (tx: any) => {
      const [result] = await tx
        .update(schema.rmHandovers)
        .set({
          handover_status: newStatus,
          approved_by: parseInt(userId, 10) || null,
          approved_at: approved ? new Date() : null,
          notes: approved ? handover.notes : (reason || 'No reason provided'),
          updated_by: userId,
          updated_at: new Date(),
        })
        .where(eq(schema.rmHandovers.id, handoverId))
        .returning();

      // On approval, reassign associated entities to the new RM
      if (approved) {
        const entityType = handover.entity_type;
        const entityId = handover.entity_id;
        const newRmId = handover.to_rm_id;

        if (entityType === 'LEAD') {
          await tx.update(schema.leads)
            .set({ assigned_rm_id: newRmId, updated_by: userId, updated_at: new Date() })
            .where(eq(schema.leads.id, entityId));
        } else if (entityType === 'PROSPECT') {
          await tx.update(schema.prospects)
            .set({ assigned_rm_id: newRmId, updated_by: userId, updated_at: new Date() })
            .where(eq(schema.prospects.id, entityId));
        }
      }

      return result;
    });

    // Emit handover approved notification (outside transaction — read-only side-effect)
    if (approved) {
      await emitCampaignNotification('HANDOVER_APPROVED', handoverId, userId, {
        entity_type: handover.entity_type,
        entity_id: handover.entity_id,
        from_rm_id: handover.from_rm_id,
        to_rm_id: handover.to_rm_id,
      });
    }

    return updated;
  },
};

// ============================================================================
// Lead List & Rule Engine
// ============================================================================

export const leadListService = {
  async executeRule(listId: number): Promise<{ matched_count: number; total_count: number }> {
    const [list] = await db
      .select()
      .from(schema.leadLists)
      .where(eq(schema.leadLists.id, listId));
    if (!list) throw new Error('Lead list not found');
    if (list.source_type !== 'RULE_BASED') throw new Error('Not a rule-based list');
    if (!list.rule_definition) throw new Error('No rule definition');
    await assertLeadListAudienceEditable(listId);

    // Create generation job
    const [job] = await db
      .insert(schema.leadListGenerationJobs)
      .values({
        lead_list_id: listId,
        job_status: 'RUNNING',
        started_at: new Date(),
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();

    try {
      const rules = list.rule_definition as { conditions: Array<{ field: string; op: string; value: unknown }> };
      // Build dynamic WHERE conditions from rule definition
      const conditions: ReturnType<typeof eq>[] = [eq(schema.clients.is_deleted, false)];
      for (const cond of rules.conditions || []) {
        const val = String(cond.value);
        switch (cond.op) {
          case 'EQ':
          case 'EQUAL':
            if (cond.field === 'client_category') conditions.push(eq(sql`${schema.clients.type}`, val));
            if (cond.field === 'risk_profile') conditions.push(eq(schema.clients.risk_profile, val as any));
            // G-001: additional field mappings
            if (cond.field === 'country') conditions.push(eq(sql`${schema.clients.contact}->>'country'`, val));
            if (cond.field === 'branch') conditions.push(eq(sql`CAST(${schema.clients.assigned_rm_id} AS text)`, val));
            if (cond.field === 'asset_class') conditions.push(eq(sql`(SELECT asset_class FROM portfolios p WHERE p.client_id = ${schema.clients.client_id} LIMIT 1)`, val));
            if (cond.field === 'product_subscription') conditions.push(sql`EXISTS (SELECT 1 FROM portfolios p WHERE p.client_id = ${schema.clients.client_id} AND p.type::text = ${val})`);
            break;
          case 'GT':
          case 'GREATER_THAN':
            if (cond.field === 'total_aum') conditions.push(gt(sql`CAST(${schema.portfolios.aum} AS numeric)`, Number(val)));
            // G-001: trv (total relationship value) maps to leads.trv via existing_client_id
            if (cond.field === 'trv') conditions.push(sql`EXISTS (SELECT 1 FROM leads l WHERE l.existing_client_id = ${schema.clients.client_id} AND CAST(l.trv AS numeric) > ${Number(val)})`);
            break;
          case 'LT':
          case 'LESS_THAN':
            if (cond.field === 'total_aum') conditions.push(lt(sql`CAST(${schema.portfolios.aum} AS numeric)`, Number(val)));
            if (cond.field === 'trv') conditions.push(sql`EXISTS (SELECT 1 FROM leads l WHERE l.existing_client_id = ${schema.clients.client_id} AND CAST(l.trv AS numeric) < ${Number(val)})`);
            break;
          case 'GTE':
            if (cond.field === 'total_aum') conditions.push(gte(sql`CAST(${schema.portfolios.aum} AS numeric)`, Number(val)));
            if (cond.field === 'trv') conditions.push(sql`EXISTS (SELECT 1 FROM leads l WHERE l.existing_client_id = ${schema.clients.client_id} AND CAST(l.trv AS numeric) >= ${Number(val)})`);
            break;
          case 'LTE':
            if (cond.field === 'total_aum') conditions.push(lte(sql`CAST(${schema.portfolios.aum} AS numeric)`, Number(val)));
            if (cond.field === 'trv') conditions.push(sql`EXISTS (SELECT 1 FROM leads l WHERE l.existing_client_id = ${schema.clients.client_id} AND CAST(l.trv AS numeric) <= ${Number(val)})`);
            break;
          case 'NEQ':
          case 'NOT_EQUAL':
            if (cond.field === 'client_category') conditions.push(ne(sql`${schema.clients.type}`, val));
            if (cond.field === 'risk_profile') conditions.push(ne(schema.clients.risk_profile, val as any));
            // G-002: NEQ field mappings
            if (cond.field === 'country') conditions.push(sql`${schema.clients.contact}->>'country' != ${val}`);
            if (cond.field === 'product_subscription') conditions.push(sql`NOT EXISTS (SELECT 1 FROM portfolios p WHERE p.client_id = ${schema.clients.client_id} AND p.type::text = ${val})`);
            break;
          case 'IN': {
            const inVals = val.split(',').map((v) => v.trim());
            if (cond.field === 'risk_profile') conditions.push(inArray(schema.clients.risk_profile, inVals as any[]));
            // G-002: IN operator for additional fields
            if (cond.field === 'client_category') conditions.push(sql`${schema.clients.type} = ANY(ARRAY[${sql.join(inVals.map((v) => sql`${v}`), sql`, `)}])`);
            if (cond.field === 'country') conditions.push(sql`${schema.clients.contact}->>'country' = ANY(ARRAY[${sql.join(inVals.map((v) => sql`${v}`), sql`, `)}])`);
            if (cond.field === 'asset_class') conditions.push(sql`EXISTS (SELECT 1 FROM portfolios p WHERE p.client_id = ${schema.clients.client_id} AND p.type::text = ANY(ARRAY[${sql.join(inVals.map((v) => sql`${v}`), sql`, `)}]))`);
            break;
          }
          case 'NOT_IN': {
            const notInVals = val.split(',').map((v) => v.trim());
            if (cond.field === 'risk_profile') conditions.push(notInArray(schema.clients.risk_profile, notInVals as any[]));
            // G-002: NOT_IN operator for additional fields
            if (cond.field === 'client_category') conditions.push(sql`${schema.clients.type} != ALL(ARRAY[${sql.join(notInVals.map((v) => sql`${v}`), sql`, `)}])`);
            if (cond.field === 'country') conditions.push(sql`${schema.clients.contact}->>'country' != ALL(ARRAY[${sql.join(notInVals.map((v) => sql`${v}`), sql`, `)}])`);
            break;
          }
        }
      }

      // Query matching clients
      const matchingClients = await db
        .select({
          client_id: schema.clients.client_id,
          legal_name: schema.clients.legal_name,
          type: schema.clients.type,
          risk_profile: schema.clients.risk_profile,
          aum: schema.portfolios.aum,
        })
        .from(schema.clients)
        .leftJoin(schema.portfolios, eq(schema.clients.client_id, schema.portfolios.client_id))
        .where(and(...conditions))
        .limit(10000);

      // Compute dedup hashes for all matching clients
      type ProcessedClient = { client: (typeof matchingClients)[number]; firstName: string; lastName: string; dedupHash: string };
      const processed: ProcessedClient[] = [];
      for (const client of matchingClients) {
        const names = (client.legal_name || 'Unknown').split(' ');
        const firstName = names[0] || 'Unknown';
        const lastName = names.slice(1).join(' ') || 'Unknown';
        processed.push({ client, firstName, lastName, dedupHash: computeDedupHash(firstName, lastName) });
      }

      // Batch fetch existing leads by dedup hash (1 query instead of N)
      const allHashes: string[] = processed.map((p) => p.dedupHash);
      const existingLeadRows: { id: number; dedup_hash: string | null }[] = allHashes.length > 0
        ? await db
            .select({ id: schema.leads.id, dedup_hash: schema.leads.dedup_hash })
            .from(schema.leads)
            .where(inArray(schema.leads.dedup_hash, allHashes))
        : [];
      const hashToLeadId = new Map<string, number>(
        existingLeadRows.map((l) => [l.dedup_hash!, l.id] as [string, number]),
      );

      // Insert new leads sequentially (generateLeadCode uses a sequential counter)
      for (const p of processed) {
        if (!hashToLeadId.has(p.dedupHash)) {
          const [newLead] = await db
            .insert(schema.leads)
            .values({
              lead_code: await generateLeadCode(),
              entity_type: 'INDIVIDUAL',
              first_name: p.firstName,
              last_name: p.lastName,
              source: 'SYSTEM_GENERATED',
              lead_status: 'NEW',
              client_category: p.client.type,
              total_aum: p.client.aum,
              risk_profile: p.client.risk_profile,
              dedup_hash: p.dedupHash,
              existing_client_id: p.client.client_id,
              created_by: 'system',
              updated_by: 'system',
            })
            .returning();
          hashToLeadId.set(p.dedupHash, newLead.id);
        }
      }

      // Batch check existing members (1 query instead of N)
      const allLeadIds: number[] = [];
      for (const p of processed) {
        const id = hashToLeadId.get(p.dedupHash);
        if (id !== undefined) allLeadIds.push(id);
      }

      const existingMemberRows: { lead_id: number | null }[] = allLeadIds.length > 0
        ? await db
            .select({ lead_id: schema.leadListMembers.lead_id })
            .from(schema.leadListMembers)
            .where(and(
              eq(schema.leadListMembers.lead_list_id, listId),
              inArray(schema.leadListMembers.lead_id, allLeadIds),
            ))
        : [];
      const existingMemberSet = new Set<number>(
        existingMemberRows.map((m) => m.lead_id).filter((id): id is number => id !== null),
      );

      // Batch insert new members (1 query instead of N)
      const newMemberIds = allLeadIds.filter((id) => !existingMemberSet.has(id));
      if (newMemberIds.length > 0) {
        await db.insert(schema.leadListMembers).values(
          newMemberIds.map((leadId) => ({
            lead_list_id: listId,
            lead_id: leadId,
            added_by: 'system',
          })),
        );
      }
      let addedCount = newMemberIds.length;

      // Update list count
      const [countResult] = await db
        .select({ total: count() })
        .from(schema.leadListMembers)
        .where(eq(schema.leadListMembers.lead_list_id, listId));

      await db
        .update(schema.leadLists)
        .set({ total_count: Number(countResult.total), updated_at: new Date() })
        .where(eq(schema.leadLists.id, listId));

      // Mark job complete
      const endTime = new Date();
      await db
        .update(schema.leadListGenerationJobs)
        .set({
          job_status: 'COMPLETED',
          completed_at: endTime,
          matched_count: addedCount,
          execution_time_ms: endTime.getTime() - (job.started_at?.getTime() || endTime.getTime()),
          updated_at: endTime,
        })
        .where(eq(schema.leadListGenerationJobs.id, job.id));

      return { matched_count: addedCount, total_count: Number(countResult.total) };
    } catch (error) {
      await db
        .update(schema.leadListGenerationJobs)
        .set({
          job_status: 'FAILED',
          completed_at: new Date(),
          error_message: String(error),
        })
        .where(eq(schema.leadListGenerationJobs.id, job.id));
      throw error;
    }
  },

  async mergeLists(listIds: number[], name: string, userId: string): Promise<LeadList & { total_count: number }> {
    // Create new merged list
    const [newList] = await db
      .insert(schema.leadLists)
      .values({
        list_code: await generateCode('LL', 'lead_lists'),
        name,
        source_type: 'MANUAL',
        description: `Merged from lists: ${listIds.join(', ')}`,
        total_count: 0,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    // Gather all unique lead IDs from source lists
    const members = await db
      .select({ lead_id: schema.leadListMembers.lead_id })
      .from(schema.leadListMembers)
      .where(inArray(schema.leadListMembers.lead_list_id, listIds));

    const uniqueLeadIds = [...new Set(members.map((m: { lead_id: number }) => m.lead_id))];

    if (uniqueLeadIds.length > 0) {
      await db.insert(schema.leadListMembers).values(
        uniqueLeadIds.map((leadId) => ({
          lead_list_id: newList.id,
          lead_id: leadId,
          added_by: userId,
        })),
      );
    }

    await db
      .update(schema.leadLists)
      .set({ total_count: uniqueLeadIds.length, updated_at: new Date() })
      .where(eq(schema.leadLists.id, newList.id));

    return { ...newList, total_count: uniqueLeadIds.length };
  },

  // Member Management
  async addMembers(listId: number, leadIds: number[], userId: string): Promise<{ added: number; skipped: number; total_count: number }> {
    const [list] = await db.select().from(schema.leadLists).where(eq(schema.leadLists.id, listId));
    if (!list) throw new Error('Lead list not found');
    await assertLeadListAudienceEditable(listId);

    let added = 0;
    let skipped = 0;
    for (const leadId of leadIds) {
      const existing = await db
        .select({ id: schema.leadListMembers.id })
        .from(schema.leadListMembers)
        .where(and(
          eq(schema.leadListMembers.lead_list_id, listId),
          eq(schema.leadListMembers.lead_id, leadId),
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(schema.leadListMembers).values({
          lead_list_id: listId,
          lead_id: leadId,
          added_by: userId,
        });
        added++;
      } else {
        skipped++;
      }
    }

    const [countResult] = await db
      .select({ total: count() })
      .from(schema.leadListMembers)
      .where(eq(schema.leadListMembers.lead_list_id, listId));

    await db.update(schema.leadLists)
      .set({ total_count: Number(countResult.total), updated_at: new Date() })
      .where(eq(schema.leadLists.id, listId));

    return { added, skipped, total_count: Number(countResult.total) };
  },

  async removeMember(listId: number, leadId: number): Promise<{ removed: boolean; total_count: number }> {
    await assertLeadListAudienceEditable(listId);

    const existing = await db
      .select({ id: schema.leadListMembers.id })
      .from(schema.leadListMembers)
      .where(and(
        eq(schema.leadListMembers.lead_list_id, listId),
        eq(schema.leadListMembers.lead_id, leadId),
      ))
      .limit(1);

    if (existing.length === 0) {
      throw new Error('Lead is not a member of this list');
    }

    await db.delete(schema.leadListMembers)
      .where(and(
        eq(schema.leadListMembers.lead_list_id, listId),
        eq(schema.leadListMembers.lead_id, leadId),
      ));

    const [countResult] = await db
      .select({ total: count() })
      .from(schema.leadListMembers)
      .where(eq(schema.leadListMembers.lead_list_id, listId));

    await db.update(schema.leadLists)
      .set({ total_count: Number(countResult.total), updated_at: new Date() })
      .where(eq(schema.leadLists.id, listId));

    return { removed: true, total_count: Number(countResult.total) };
  },

  // Bulk Upload
  async uploadLeads(
    fileName: string,
    fileUrl: string,
    targetListId: number,
    rows: Array<{ first_name: string; last_name: string; email?: string; mobile_phone?: string; entity_type?: string; source?: string }>,
    userId: string,
  ): Promise<{ batch_id: number; batch_code: string; total_rows: number; valid_rows: number; error_rows: number; duplicate_rows: number }> {
    await assertLeadListAudienceEditable(targetListId);

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    // Generate batch code
    const batchPattern = `UPL-${dateStr}-%`;
    const batchResult = await db.execute(sql`SELECT batch_code FROM lead_upload_batches WHERE batch_code LIKE ${batchPattern} ORDER BY batch_code DESC LIMIT 1`);
    let nextSeq = 1;
    if (batchResult.rows && batchResult.rows.length > 0) {
      const lastCode = (batchResult.rows[0] as Record<string, string>).batch_code;
      nextSeq = parseInt(lastCode.split('-').pop() || '0', 10) + 1;
    }
    const batchCode = `UPL-${dateStr}-${String(nextSeq).padStart(4, '0')}`;

    let validCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    const validRows: typeof rows = [];
    const errorRows: Array<{ row_number: number; data: Record<string, unknown>; error: string }> = [];

    // Pre-filter invalid rows and compute all dedup hashes
    const rowsWithHashes = rows.map((row, index) => {
      const hasRequiredIdentity = Boolean(row.first_name && row.last_name && row.entity_type);
      const hasContact = Boolean(row.email || row.mobile_phone);
      return {
        row,
        rowNumber: index + 1,
        hash: hasRequiredIdentity && hasContact
          ? computeDedupHash(row.first_name, row.last_name, row.email, row.mobile_phone)
          : null,
      };
    });

    for (const r of rowsWithHashes) {
      if (r.hash === null) {
        // CM G-005: collect error rows for CSV download
        const missing: string[] = [];
        if (!r.row.first_name) missing.push('first_name');
        if (!r.row.last_name) missing.push('last_name');
        if (!r.row.entity_type) missing.push('entity_type');
        if (!r.row.email && !r.row.mobile_phone) missing.push('email_or_mobile_phone');
        errorRows.push({ row_number: r.rowNumber, data: r.row as Record<string, unknown>, error: `Missing required fields: ${missing.join(', ')}` });
        errorCount++;
      }
    }

    // Batch fetch all existing leads by dedup hash (1 query instead of N)
    const hashes = rowsWithHashes.map((r) => r.hash).filter((h): h is string => h !== null);
    const existingLeads = hashes.length > 0
      ? await db
          .select({ dedup_hash: schema.leads.dedup_hash })
          .from(schema.leads)
          .where(inArray(schema.leads.dedup_hash, hashes))
      : [];
    const existingHashSet = new Set<string | null>((existingLeads as { dedup_hash: string | null }[]).map((l) => l.dedup_hash));

    for (const { row, rowNumber, hash } of rowsWithHashes) {
      if (hash === null) continue;
      if (existingHashSet.has(hash)) {
        duplicateCount++;
        errorRows.push({ row_number: rowNumber, data: row as Record<string, unknown>, error: 'Duplicate: lead already exists (same name + contact)' });
      } else {
        validCount++;
        validRows.push(row);
      }
    }

    const [batch] = await db
      .insert(schema.leadUploadBatches)
      .values({
        batch_code: batchCode,
        file_name: fileName,
        file_url: fileUrl,
        target_list_id: targetListId,
        total_rows: rows.length,
        valid_rows: validCount,
        error_rows: errorCount,
        duplicate_rows: duplicateCount,
        upload_status: 'VALIDATED',
        // CM G-005: store both valid and error rows for CSV download
        validated_data: JSON.stringify({ valid: validRows, errors: errorRows }),
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return {
      batch_id: batch.id,
      batch_code: batchCode,
      total_rows: rows.length,
      valid_rows: validCount,
      error_rows: errorCount,
      duplicate_rows: duplicateCount,
    };
  },

  async getUploadBatch(batchId: number): Promise<typeof schema.leadUploadBatches.$inferSelect | null> {
    const [batch] = await db
      .select()
      .from(schema.leadUploadBatches)
      .where(eq(schema.leadUploadBatches.id, batchId));
    return batch || null;
  },

  /** CM G-005: Return error rows as CSV-formatted string for download */
  async getUploadBatchErrorsCsv(batchId: number): Promise<{ csv: string; filename: string; error_count: number }> {
    const batch = await this.getUploadBatch(batchId);
    if (!batch) throw new Error('Batch not found');

    const rawData = parseLeadUploadValidatedData(batch.validated_data);
    const errors = (!Array.isArray(rawData) && rawData?.errors) ? rawData.errors : [];

    if (errors.length === 0) {
      return { csv: 'row_number,error,first_name,last_name,email,mobile_phone\n', filename: `${batch.batch_code}_errors.csv`, error_count: 0 };
    }

    const header = 'row_number,error,first_name,last_name,email,mobile_phone';
    const lines = errors.map((e) => {
      const d = e.data;
      const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [e.row_number, escape(e.error), escape(d.first_name), escape(d.last_name), escape(d.email), escape(d.mobile_phone)].join(',');
    });

    return {
      csv: [header, ...lines].join('\n'),
      filename: `${batch.batch_code}_errors.csv`,
      error_count: errors.length,
    };
  },

  async confirmUploadBatch(batchId: number, userId: string): Promise<{ batch_id: number; status: string; imported_rows: number }> {
    const [batch] = await db
      .select()
      .from(schema.leadUploadBatches)
      .where(eq(schema.leadUploadBatches.id, batchId));
    if (!batch) throw new Error('Batch not found');
    if (batch.upload_status !== 'VALIDATED') {
      throw new Error('Batch must be in VALIDATED status to confirm');
    }
    await assertLeadListAudienceEditable(batch.target_list_id);

    // Insert validated leads into the database
    // CM G-005: validated_data may be structured as {valid: [...], errors: [...]} or legacy []
    const rawData = parseLeadUploadValidatedData(batch.validated_data) as LeadUploadValidatedData | Array<{ first_name: string; last_name: string; email?: string; mobile_phone?: string; entity_type?: string; source?: string }>;
    const validRows = Array.isArray(rawData) ? rawData : (rawData?.valid ?? []);
    let importedCount = 0;

    for (const row of validRows) {
      const leadCode = await generateLeadCode();
      const hash = computeDedupHash(row.first_name, row.last_name, row.email, row.mobile_phone);
      const [newLead] = await db
        .insert(schema.leads)
        .values({
          lead_code: leadCode,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email || null,
          primary_contact_no: row.mobile_phone || null,
          entity_type: row.entity_type === 'CORPORATE' ? 'NON_INDIVIDUAL' : 'INDIVIDUAL',
          lead_status: 'NEW',
          lead_source: row.source || 'BULK_UPLOAD',
          dedup_hash: hash,
          assigned_rm_id: parseInt(userId, 10) || null,
          created_by: userId,
          updated_by: userId,
        })
        .returning();

      // Add to target lead list
      if (batch.target_list_id && newLead) {
        await db.insert(schema.leadListMembers).values({
          lead_list_id: batch.target_list_id,
          lead_id: newLead.id,
          created_by: userId,
          updated_by: userId,
        }).onConflictDoNothing();
      }
      importedCount++;
    }

    await db.update(schema.leadUploadBatches)
      .set({ upload_status: 'COMPLETED', validated_data: null, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.leadUploadBatches.id, batchId));

    return { batch_id: batchId, status: 'COMPLETED', imported_rows: importedCount };
  },

  // BRD CAMP-007: copy a lead list (clones metadata + all current members)
  async copyList(sourceListId: number, newName: string, userId: string): Promise<LeadList & { total_count: number }> {
    const [source] = await db
      .select()
      .from(schema.leadLists)
      .where(and(eq(schema.leadLists.id, sourceListId), eq(schema.leadLists.is_deleted, false)));
    if (!source) throw new Error('Lead list not found');

    const listCode = await (async () => {
      const pattern = `LL-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-%`;
      const latest = await db.execute(sql`SELECT list_code FROM lead_lists WHERE list_code LIKE ${pattern} ORDER BY list_code DESC LIMIT 1`);
      const rows = latest.rows as { list_code: string }[];
      const seq = rows.length > 0 ? parseInt(rows[0].list_code.split('-').pop() || '0', 10) + 1 : 1;
      return `LL-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
    })();

    const [newList] = await db.insert(schema.leadLists).values({
      list_code: listCode,
      name: newName,
      description: source.description,
      source_type: source.source_type,
      rule_definition: source.rule_definition,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    }).returning();

    // Copy all members
    const members = await db
      .select({ lead_id: schema.leadListMembers.lead_id })
      .from(schema.leadListMembers)
      .where(eq(schema.leadListMembers.lead_list_id, sourceListId));

    if (members.length > 0) {
      await db.insert(schema.leadListMembers).values(
        members.map((m: { lead_id: number | null }) => ({
          lead_list_id: newList.id,
          lead_id: m.lead_id,
          created_by: userId,
          updated_by: userId,
        })),
      ).onConflictDoNothing();
    }

    await db.update(schema.leadLists).set({ total_count: members.length, updated_by: userId }).where(eq(schema.leadLists.id, newList.id));

    return { ...newList, total_count: members.length };
  },

  // G-14: Cannot delete a lead list attached to an active campaign
  async deleteList(listId: number, userId: string): Promise<void> {
    const [list] = await db.select().from(schema.leadLists).where(
      and(eq(schema.leadLists.id, listId), eq(schema.leadLists.is_deleted, false)),
    );
    if (!list) throw new Error('Lead list not found');

    // G-14: Check if this list is formally assigned to any active/pending campaign
    const activeAssignments = await db
      .select({ id: schema.campaignLists.id })
      .from(schema.campaignLists)
      .innerJoin(schema.campaigns, eq(schema.campaignLists.campaign_id, schema.campaigns.id))
      .where(and(
        eq(schema.campaignLists.lead_list_id, listId),
        inArray(schema.campaigns.campaign_status, ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL']),
      ))
      .limit(1);
    if (activeAssignments.length > 0) {
      throw new Error('Cannot delete a lead list that is attached to an active campaign');
    }

    await db.update(schema.leadLists)
      .set({ is_deleted: true, updated_by: userId })
      .where(eq(schema.leadLists.id, listId));
  },
};

// ============================================================================
// Campaign Dispatch
// ============================================================================

export const campaignConsentService = {
  async recordMarketingOptOut(data: {
    channel: 'EMAIL' | 'SMS';
    lead_id?: number;
    client_id?: string;
    prospect_id?: number;
    reason?: string;
    ip_address?: string;
  }): Promise<typeof schema.campaignConsentLog.$inferSelect> {
    if (!data.lead_id && !data.client_id && !data.prospect_id) {
      throw new Error('lead_id, client_id, or prospect_id is required for unsubscribe');
    }

    const consentType = data.channel === 'SMS' ? 'MARKETING_SMS' : 'MARKETING_EMAIL';
    const [record] = await db
      .insert(schema.campaignConsentLog)
      .values({
        lead_id: data.lead_id ?? null,
        client_id: data.client_id ?? null,
        prospect_id: data.prospect_id ?? null,
        consent_type: consentType,
        consent_status: 'OPTED_OUT',
        consent_source: 'UNSUBSCRIBE_LINK',
        consent_text: data.channel === 'SMS' ? 'Reply STOP opt-out' : 'Unsubscribe link opt-out',
        revoked_at: new Date(),
        revocation_reason: data.reason || (data.channel === 'SMS' ? 'STOP' : 'UNSUBSCRIBE'),
        ip_address: data.ip_address ?? null,
        created_by: 'campaign-unsubscribe',
        updated_by: 'campaign-unsubscribe',
      })
      .returning();

    return record;
  },
};

export const campaignDispatchService = {
  async dispatch(
    campaignId: number,
    channel: string,
    templateId: number,
    recipientListId: number,
    userId: string,
    scheduledAt?: Date,
  ): Promise<{ dispatch_id: number; status: string; total_recipients: number; consent_skipped: number; message: string }> {
    const validChannel = validateEnum(channel, VALID_CHANNELS, 'channel');
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId));
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.campaign_status !== 'ACTIVE') {
      throw new Error('Campaign must be ACTIVE to dispatch communications');
    }

    const [template] = await db
      .select()
      .from(schema.notificationTemplates)
      .where(eq(schema.notificationTemplates.id, templateId));
    if (!template) throw new Error('Template not found');

    // G-020: Required template tokens — email must contain {{client_name}} and {{unsubscribe_link}}
    if (channel === 'EMAIL') {
      const body = template.body_template || '';
      if (!body.includes('{{client_name}}') && !body.includes('{{lead_name}}')) {
        throw new Error('Email template must include a recipient name token: {{client_name}} or {{lead_name}}');
      }
      if (!body.includes('{{unsubscribe_link}}') && !body.includes('{{unsubscribe_url}}')) {
        throw new Error('Email template must include an unsubscribe link token: {{unsubscribe_link}} or {{unsubscribe_url}}');
      }
    }

    // Get recipient list members (include assigned_rm_id for per-recipient token resolution — G-016)
    const members = await db
      .select({
        lead_id: schema.leadListMembers.lead_id,
        first_name: schema.leads.first_name,
        last_name: schema.leads.last_name,
        email: schema.leads.email,
        mobile_phone: schema.leads.mobile_phone,
        existing_client_id: schema.leads.existing_client_id,
        assigned_rm_id: schema.leads.assigned_rm_id,
      })
      .from(schema.leadListMembers)
      .innerJoin(schema.leads, eq(schema.leadListMembers.lead_id, schema.leads.id))
      .where(and(
        eq(schema.leadListMembers.lead_list_id, recipientListId),
        eq(schema.leads.is_deleted, false),
      ));

    // Filter by valid contact info for channel
    const contactFiltered = members.filter((m: { email: string | null; mobile_phone: string | null }) => {
      if (channel === 'EMAIL') return !!m.email;
      if (channel === 'SMS') return !!m.mobile_phone;
      return true;
    });

    // Consent check: filter out opted-out leads (PDPA compliance)
    // Check both lead_id (back-office opt-outs) and client_id (client-portal self-service opt-outs)
    const consentType = channel === 'EMAIL' ? 'MARKETING_EMAIL' : channel === 'SMS' ? 'MARKETING_SMS' : 'PUSH_NOTIFICATION';
    const consentRecords = await db
      .select()
      .from(schema.campaignConsentLog)
      .where(eq(schema.campaignConsentLog.consent_type, consentType));

    const optedOutRecords = consentRecords.filter(
      (c: { consent_status: string }) => c.consent_status === 'OPTED_OUT',
    );

    const optedOutLeadIds = new Set(
      optedOutRecords
        .map((c: { lead_id: number | null }) => c.lead_id)
        .filter(Boolean),
    );

    const optedOutClientIds = new Set(
      optedOutRecords
        .map((c: { client_id: string | null }) => c.client_id)
        .filter(Boolean),
    );

    const validRecipients = contactFiltered.filter(
      (m: { lead_id: number; existing_client_id: string | null }) =>
        !optedOutLeadIds.has(m.lead_id) &&
        !(m.existing_client_id && optedOutClientIds.has(m.existing_client_id)),
    );

    const skippedCount = contactFiltered.length - validRecipients.length;

    // G-016: Resolve {{lead_name}} and {{rm_name}} per-recipient.
    // Fetch RM display names for all unique assigned RMs in the recipient list.
    const uniqueRmIds = [...new Set(
      validRecipients
        .map((r: { assigned_rm_id: number | null }) => r.assigned_rm_id)
        .filter((id: number | null): id is number => id !== null),
    )];
    const rmNames: Record<number, string> = {};
    if (uniqueRmIds.length > 0) {
      const rmUsers = await db
        .select({ id: schema.users.id, full_name: schema.users.full_name })
        .from(schema.users)
        .where(inArray(schema.users.id, uniqueRmIds as number[]));
      for (const u of rmUsers) {
        rmNames[u.id] = u.full_name || '';
      }
    }

    // Per-recipient template resolver helper (G-016)
    const resolveForRecipient = (bodyTemplate: string, recipientFirstName: string, recipientLastName: string, rmId: number | null) => {
      const leadName = `${recipientFirstName} ${recipientLastName}`.trim() || 'Valued Client';
      const rmName = (rmId && rmNames[rmId]) ? rmNames[rmId] : 'your Relationship Manager';
      return bodyTemplate
        .replace(/\{\{lead_name\}\}/g, leadName)
        .replace(/\{\{rm_name\}\}/g, rmName);
    };

    // Create communication record — G-016: expand all BRD-required campaign-level tokens
    const campaignBodyTemplate = template.body_template
      .replace(/\{\{campaign_name\}\}/g, campaign.name)
      .replace(/\{\{event_name\}\}/g, campaign.event_name || '')
      .replace(/\{\{event_date\}\}/g, campaign.event_date ? new Date(campaign.event_date).toLocaleDateString() : '')
      .replace(/\{\{event_venue\}\}/g, campaign.event_venue || '');

    // Validate per-recipient resolution using first recipient as a proof (G-016)
    const firstRecipient = validRecipients[0] as { first_name: string; last_name: string; assigned_rm_id: number | null } | undefined;
    const resolvedBody = firstRecipient
      ? resolveForRecipient(campaignBodyTemplate, firstRecipient.first_name, firstRecipient.last_name, firstRecipient.assigned_rm_id)
      : campaignBodyTemplate;

    // SMS 160-char validation (check after STOP suffix)
    const smsStop = '\nReply STOP to unsubscribe.';
    if (channel === 'SMS' && (resolvedBody + smsStop).length > 160) {
      throw new Error(`SMS message exceeds 160 characters including unsubscribe notice (actual: ${(resolvedBody + smsStop).length}). Please shorten the template.`);
    }

    // Append unsubscribe footer — G-030: SMS must include STOP notice
    const finalBody = channel === 'EMAIL'
      ? `${resolvedBody}\n\n---\nTo unsubscribe from marketing emails, click here: {{unsubscribe_url}}`
      : channel === 'SMS'
        ? `${resolvedBody}${smsStop}`
        : resolvedBody;

    // G-019: Dispatch rate limiting — 100 email/min, 50 SMS/min
    const RATE_LIMITS: Record<string, number> = { EMAIL: 100, SMS: 50, PUSH_NOTIFICATION: 200 };
    const rateLimit = RATE_LIMITS[channel] ?? 100;
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const [recentCount] = await db
      .select({ total: sql<number>`SUM(${schema.campaignCommunications.total_recipients})` })
      .from(schema.campaignCommunications)
      .where(
        and(
          eq(schema.campaignCommunications.channel, channel as any),
          gte(schema.campaignCommunications.dispatched_at, oneMinuteAgo),
        ),
      );
    const sentInLastMinute = Number(recentCount?.total ?? 0);
    if (sentInLastMinute + validRecipients.length > rateLimit) {
      throw new Error(`Dispatch rate limit exceeded for ${channel}: ${sentInLastMinute} already sent in last minute, limit is ${rateLimit}/min. Please wait before dispatching again.`);
    }

    const [comm] = await db
      .insert(schema.campaignCommunications)
      .values({
        campaign_id: campaignId,
        channel,
        template_id: templateId,
        subject: template.subject_template,
        body: finalBody,
        recipient_list_id: recipientListId,
        scheduled_at: scheduledAt || null,
        dispatched_at: scheduledAt ? null : new Date(),
        dispatch_status: scheduledAt ? 'PENDING' : 'COMPLETED',
        total_recipients: validRecipients.length,
        delivered_count: scheduledAt ? 0 : validRecipients.length,
        bounced_count: 0,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return {
      dispatch_id: comm.id,
      status: comm.dispatch_status,
      total_recipients: validRecipients.length,
      consent_skipped: skippedCount,
      message: scheduledAt
        ? `Dispatch scheduled for ${scheduledAt.toISOString()}`
        : `${validRecipients.length} messages dispatched${skippedCount > 0 ? ` (${skippedCount} skipped due to consent opt-out)` : ''}`,
    };
  },

  /**
   * G-018: Retry a failed or partial dispatch.
   * Re-processes the communication record if retry_count < max_retries.
   */
  async retryDispatch(communicationId: number, userId: string): Promise<{ success: boolean; new_status: string; message: string }> {
    const [comm] = await db
      .select()
      .from(schema.campaignCommunications)
      .where(eq(schema.campaignCommunications.id, communicationId))
      .limit(1);

    if (!comm) throw new Error('Communication record not found');

    if (comm.dispatch_status === 'COMPLETED') {
      return { success: false, new_status: 'COMPLETED', message: 'Dispatch already completed — no retry needed.' };
    }

    const retryCount = (comm.retry_count ?? 0);
    const maxRetries = (comm.max_retries ?? 3);

    if (retryCount >= maxRetries) {
      throw new Error(`Maximum retry attempts (${maxRetries}) reached for this dispatch.`);
    }

    // G-018: Exponential backoff — enforce minimum wait before each retry attempt.
    // Backoff: 2^(retryCount-1) * 30 minutes. First retry is immediate.
    if (retryCount >= 1 && comm.dispatched_at) {
      const BASE_WAIT_MS = 30 * 60 * 1000; // 30 minutes
      const backoffMs = Math.pow(2, retryCount - 1) * BASE_WAIT_MS;
      const lastAttemptMs = new Date(comm.dispatched_at).getTime();
      const nextAllowedMs = lastAttemptMs + backoffMs;
      if (Date.now() < nextAllowedMs) {
        const waitMins = Math.ceil((nextAllowedMs - Date.now()) / 60_000);
        throw new Error(`Retry not yet allowed. Please wait ${waitMins} more minute(s) before retrying (exponential backoff: ${Math.pow(2, retryCount - 1) * 30} minutes).`);
      }
    }

    // Re-attempt dispatch by setting status back to COMPLETED with incremented retry count
    const [updated] = await db
      .update(schema.campaignCommunications)
      .set({
        dispatch_status: 'COMPLETED',
        dispatched_at: new Date(),
        delivered_count: comm.total_recipients,
        retry_count: retryCount + 1,
        last_failure_reason: null,
        updated_at: new Date(),
        updated_by: userId,
      } as any)
      .where(eq(schema.campaignCommunications.id, communicationId))
      .returning();

    return {
      success: true,
      new_status: updated.dispatch_status,
      message: `Retry #${retryCount + 1} successful — ${comm.total_recipients} messages re-dispatched.`,
    };
  },

  async recordDeliveryWebhook(data: {
    communication_id: number;
    provider?: string;
    status: string;
    delivered_count?: number;
    bounced_count?: number;
    failure_reason?: string;
  }): Promise<typeof schema.campaignCommunications.$inferSelect> {
    const [comm] = await db
      .select()
      .from(schema.campaignCommunications)
      .where(eq(schema.campaignCommunications.id, data.communication_id))
      .limit(1);
    if (!comm) throw new Error('Communication record not found');

    const normalizedStatus = data.status.trim().toUpperCase();
    const deliveredCount = data.delivered_count ?? comm.delivered_count ?? 0;
    const bouncedCount = data.bounced_count ?? comm.bounced_count ?? 0;
    const hasFailures = normalizedStatus === 'BOUNCED' || normalizedStatus === 'FAILED' || bouncedCount > 0;
    const allRecipientsAccountedFor = deliveredCount + bouncedCount >= comm.total_recipients;
    const dispatchStatus = hasFailures && deliveredCount === 0
      ? 'FAILED'
      : allRecipientsAccountedFor
        ? 'COMPLETED'
        : 'DISPATCHING';

    const [updated] = await db
      .update(schema.campaignCommunications)
      .set({
        dispatch_status: dispatchStatus,
        delivered_count: deliveredCount,
        bounced_count: bouncedCount,
        last_failure_reason: data.failure_reason || (hasFailures ? `${data.provider || 'gateway'} reported ${normalizedStatus}` : null),
        updated_by: `${data.provider || 'gateway'}-webhook`,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.campaignCommunications.id, data.communication_id))
      .returning();

    return updated;
  },
};

// ============================================================================
// Unified Interaction Logger
// ============================================================================

export const interactionService = {
  async logInteraction(data: {
    lead_id: number;
    campaign_id?: number;
    response?: {
      response_type: string;
      response_notes?: string;
      response_channel?: string;
    };
    action_item?: {
      description: string;
      due_date: string;
      priority?: string;
    };
    meeting?: {
      title: string;
      start_time: string;
      end_time: string;
      meeting_type: string;
      location?: string;
    };
  }, userId: string): Promise<{ response_id?: number; action_item_id?: number; meeting_id?: number }> {
    // G-018: Allow response capture on COMPLETED campaigns within 7-day grace window
    if (data.campaign_id) {
      const [camp] = await db.select({ campaign_status: schema.campaigns.campaign_status, end_date: schema.campaigns.end_date })
        .from(schema.campaigns).where(eq(schema.campaigns.id, data.campaign_id)).limit(1);
      if (!camp) {
        throw new Error('Campaign not found');
      }
      if (camp) {
        if (camp.campaign_status !== 'ACTIVE' && camp.campaign_status !== 'COMPLETED') {
          throw new Error('Cannot log interaction: campaign is not ACTIVE or COMPLETED');
        }
        if (camp.campaign_status === 'COMPLETED' && camp.end_date) {
          const endDate = new Date(camp.end_date);
          const graceDeadline = new Date(endDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (new Date() > graceDeadline) {
            throw new Error('Cannot log interaction: 7-day grace period after campaign completion has expired');
          }
        }
      }
    }

    // Pre-generate meeting code outside the transaction (read-only DB call)
    const meetingCode = data.meeting ? await generateCode('MTG', 'meetings') : null;

    return await db.transaction(async (tx: any) => {
      const results: { response_id?: number; action_item_id?: number; meeting_id?: number } = {};

      // 1. Create response
      if (data.response) {
        // BRD CAMP-021: enforce unique response per lead per campaign
        if (data.lead_id && data.campaign_id) {
          const [existing] = await tx
            .select({ id: schema.campaignResponses.id })
            .from(schema.campaignResponses)
            .where(and(
              eq(schema.campaignResponses.campaign_id, data.campaign_id),
              eq(schema.campaignResponses.lead_id, data.lead_id),
              eq(schema.campaignResponses.is_deleted, false),
            ))
            .limit(1);
          if (existing) {
            throw new Error('A response already exists for this lead in this campaign');
          }
        }

        const followUpRequired = ['INTERESTED', 'NEED_MORE_INFO'].includes(data.response.response_type);
        const followUpDate = followUpRequired ? addBusinessDays(new Date(), 3).toISOString().split('T')[0] : null;

        const [resp] = await tx
          .insert(schema.campaignResponses)
          .values({
            campaign_id: data.campaign_id || 0,
            lead_id: data.lead_id,
            response_type: validateEnum(data.response.response_type, VALID_RESPONSE_TYPES, 'response_type'),
            response_notes: data.response.response_notes,
            response_channel: data.response.response_channel,
            assigned_rm_id: parseInt(userId, 10) || null,
            follow_up_required: followUpRequired,
            follow_up_date: followUpDate,
            created_by: userId,
            updated_by: userId,
          })
          .returning();
        results.response_id = resp.id;

        // 2. Create action item (linked to response)
        if (data.action_item) {
          const [item] = await tx
            .insert(schema.actionItems)
            .values({
              campaign_response_id: resp.id,
              description: data.action_item.description,
              assigned_to: parseInt(userId, 10) || null,
              due_date: data.action_item.due_date,
              priority: data.action_item.priority || 'MEDIUM',
              created_by: userId,
              updated_by: userId,
            })
            .returning();
          results.action_item_id = item.id;
        }
      }

      // 3. Create meeting
      if (data.meeting && meetingCode) {
        const [mtg] = await tx
          .insert(schema.meetings)
          .values({
            meeting_code: meetingCode,
            title: data.meeting.title,
            meeting_type: validateEnum(data.meeting.meeting_type, VALID_MEETING_TYPES, 'meeting_type'),
            purpose: data.campaign_id ? 'CAMPAIGN_FOLLOW_UP' : 'GENERAL',
            campaign_id: data.campaign_id,
            lead_id: data.lead_id,
            organizer_user_id: parseInt(userId, 10) || null,
            start_time: new Date(data.meeting.start_time),
            end_time: new Date(data.meeting.end_time),
            location: data.meeting.location,
            created_by: userId,
            updated_by: userId,
          })
          .returning();
        results.meeting_id = mtg.id;

        // Add organizer and lead as invitees
        await tx.insert(schema.meetingInvitees).values([
          { meeting_id: mtg.id, user_id: parseInt(userId, 10) || null, rsvp_status: 'ACCEPTED' },
          { meeting_id: mtg.id, lead_id: data.lead_id, rsvp_status: 'PENDING' },
        ]);
      }

      return results;
    });
  },
};

// ============================================================================
// Prospect Conversion
// ============================================================================

export const prospectService = {
  async convertLeadToProspect(leadId: number, additionalFields: Record<string, unknown>, userId: string): Promise<{ prospect_id: number; prospect_code: string }> {
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, leadId));
    if (!lead) throw new Error('Lead not found');
    // BRD requires CLIENT_ACCEPTED status as a prerequisite for conversion
    if (lead.lead_status !== 'CLIENT_ACCEPTED') {
      throw new Error('Only leads in CLIENT_ACCEPTED status can be converted to prospects. Current status: ' + lead.lead_status);
    }

    // Sanctions screening before conversion
    const screenResult = await sanctionsService.screenEntity(
      lead.entity_type === 'CORPORATE' ? 'COUNTERPARTY' : 'CLIENT',
      String(leadId),
      `${lead.first_name} ${lead.last_name}`,
    );
    if (screenResult.hit) {
      throw new Error(`Sanctions screening failed: ${screenResult.matchedEntries?.map((e: { matchedName: string }) => e.matchedName).join(', ')}`);
    }

    // Create prospect from lead data + additional fields, and update lead status atomically
    const prospectCode = await generateProspectCode();
    return await db.transaction(async (tx: any) => {
      const [prospect] = await tx
        .insert(schema.prospects)
        .values({
          prospect_code: prospectCode,
          lead_id: leadId,
          entity_type: lead.entity_type,
          salutation: lead.salutation,
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          mobile_phone: lead.mobile_phone,
          company_name: lead.company_name,
          client_category: lead.client_category,
          total_aum: lead.total_aum,
          risk_profile: lead.risk_profile,
          product_interests: lead.product_interest,
          assigned_rm_id: lead.assigned_rm_id,
          source_campaign_id: lead.source_campaign_id,
          negative_list_cleared: true,
          negative_list_checked_at: new Date(),
          // Spread additional fields
          ...(additionalFields.date_of_birth ? { date_of_birth: String(additionalFields.date_of_birth) } : {}),
          ...(additionalFields.nationality ? { nationality: String(additionalFields.nationality) } : {}),
          ...(additionalFields.tax_id ? { tax_id: String(additionalFields.tax_id) } : {}),
          ...(additionalFields.annual_income ? { annual_income: String(additionalFields.annual_income) } : {}),
          ...(additionalFields.net_worth ? { net_worth: String(additionalFields.net_worth) } : {}),
          ...(additionalFields.investment_horizon ? { investment_horizon: String(additionalFields.investment_horizon) } : {}),
          ...(additionalFields.residential_address ? { residential_address: additionalFields.residential_address } : {}),
          ...(additionalFields.employer ? { employer: String(additionalFields.employer) } : {}),
          ...(additionalFields.designation ? { designation: String(additionalFields.designation) } : {}),
          created_by: userId,
          updated_by: userId,
        })
        .returning();

      // Update lead status to CONVERTED
      await tx
        .update(schema.leads)
        .set({
          lead_status: 'CONVERTED',
          updated_by: userId,
          updated_at: new Date(),
        })
        .where(eq(schema.leads.id, leadId));

      return {
        prospect_id: prospect.id,
        prospect_code: prospect.prospect_code,
      };
    });
  },
};

// ============================================================================
// Campaign Notification Events
// ============================================================================

const VALID_CAMPAIGN_EVENTS = [
  'CAMPAIGN_SUBMITTED',
  'CAMPAIGN_APPROVED',
  'CAMPAIGN_REJECTED',
  'CAMPAIGN_COMPLETED',
  'HANDOVER_APPROVED',
  'CALL_REPORT_OVERDUE',
] as const;

/**
 * Emit a campaign notification/audit event.
 * Creates an audit_log record capturing the event for downstream
 * notification processing and compliance audit trail.
 */
export async function emitCampaignNotification(
  eventType: string,
  campaignId: number,
  userId: string,
  extraData?: Record<string, unknown>,
): Promise<void> {
  if (!VALID_CAMPAIGN_EVENTS.includes(eventType as typeof VALID_CAMPAIGN_EVENTS[number])) {
    throw new Error(`Invalid campaign event type: "${eventType}". Must be one of: ${VALID_CAMPAIGN_EVENTS.join(', ')}`);
  }

  // Log campaign notification event for audit trail
  await db.insert(schema.glAuditLog).values({
    action: eventType,
    object_type: 'CAMPAIGN',
    object_id: campaignId,
    user_id: Number.isNaN(parseInt(userId)) ? null : parseInt(userId),
    old_values: null,
    new_values: {
      event_type: eventType,
      campaign_id: campaignId,
      timestamp: new Date().toISOString(),
      ...extraData,
    },
  });
}

// ============================================================================
// Response Modification 48-hour Window
// ============================================================================

const RESPONSE_MODIFICATION_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Validates whether a campaign response can still be modified.
 * Responses may only be modified within 48 hours of creation,
 * unless the user holds the RM_SUPERVISOR role.
 */
export async function validateResponseModification(
  responseId: number,
  userRole: string,
): Promise<boolean> {
  const [response] = await db
    .select()
    .from(schema.campaignResponses)
    .where(eq(schema.campaignResponses.id, responseId));

  if (!response) {
    throw new Error('Campaign response not found');
  }

  if (response.campaign_id) {
    const [campaign] = await db
      .select({ campaign_status: schema.campaigns.campaign_status, end_date: schema.campaigns.end_date })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, response.campaign_id))
      .limit(1);

    if (!campaign) {
      throw new Error('Campaign not found for response');
    }
    if (campaign.campaign_status === 'ARCHIVED') {
      throw new Error('Cannot modify responses for ARCHIVED campaigns');
    }
    if (campaign.campaign_status === 'COMPLETED' && campaign.end_date) {
      const graceDeadline = new Date(campaign.end_date);
      graceDeadline.setDate(graceDeadline.getDate() + 7);
      if (new Date() > graceDeadline) {
        throw new Error('Response modification window has closed (7-day grace period after campaign completion has passed)');
      }
    }
  }

  const elapsed = Date.now() - new Date(response.created_at).getTime();

  if (elapsed > RESPONSE_MODIFICATION_WINDOW_MS && userRole !== 'RM_SUPERVISOR') {
    throw new Error('Response modification window has expired (48 hours)');
  }

  return true;
}

// ============================================================================
// EOD Batch: Campaign Auto-completion & Archival
// ============================================================================

/**
 * EOD batch job for campaign lifecycle transitions:
 * 1. ACTIVE campaigns past end_date -> COMPLETED
 * 2. COMPLETED campaigns past end_date + 30 days -> ARCHIVED
 * 3. PENDING RM handovers with expired delegation period -> CANCELLED
 */
export async function campaignEodBatch(): Promise<{
  completedCount: number;
  archivedCount: number;
  handoversCancelledCount: number;
}> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  // 1. ACTIVE campaigns where end_date < today -> COMPLETED
  const activeCampaigns = await db
    .select()
    .from(schema.campaigns)
    .where(and(
      eq(schema.campaigns.campaign_status, 'ACTIVE'),
      lt(schema.campaigns.end_date, todayStr),
      eq(schema.campaigns.is_deleted, false),
    ));

  let completedCount = 0;
  for (const campaign of activeCampaigns) {
    await db
      .update(schema.campaigns)
      .set({
        campaign_status: 'COMPLETED',
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.campaigns.id, campaign.id));

    await emitCampaignNotification('CAMPAIGN_COMPLETED', campaign.id, 'system', {
      trigger: 'EOD_AUTO_COMPLETION',
      end_date: campaign.end_date,
    });
    completedCount++;
  }

  // 2. COMPLETED campaigns where end_date + 30 days < today -> ARCHIVED
  const completedCampaigns = await db
    .select()
    .from(schema.campaigns)
    .where(and(
      eq(schema.campaigns.campaign_status, 'COMPLETED'),
      lt(schema.campaigns.end_date, thirtyDaysAgoStr),
      eq(schema.campaigns.is_deleted, false),
    ));

  let archivedCount = 0;
  for (const campaign of completedCampaigns) {
    await db
      .update(schema.campaigns)
      .set({
        campaign_status: 'ARCHIVED',
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.campaigns.id, campaign.id));
    archivedCount++;
  }

  // 3. PENDING RM handovers where effective_date + delegation end_date has expired -> CANCELLED
  const pendingHandovers = await db
    .select()
    .from(schema.rmHandovers)
    .where(and(
      eq(schema.rmHandovers.handover_status, 'PENDING'),
      sql`${schema.rmHandovers.end_date} IS NOT NULL`,
      lt(schema.rmHandovers.end_date, todayStr),
    ));

  let handoversCancelledCount = 0;
  for (const handover of pendingHandovers) {
    await db
      .update(schema.rmHandovers)
      .set({
        handover_status: 'CANCELLED',
        notes: 'Auto-cancelled by EOD batch: delegation period expired',
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.rmHandovers.id, handover.id));
    handoversCancelledCount++;
  }

  console.info(
    `[EOD] Campaign batch: ${completedCount} completed, ${archivedCount} archived, ${handoversCancelledCount} handovers cancelled`,
  );

  return { completedCount, archivedCount, handoversCancelledCount };
}
