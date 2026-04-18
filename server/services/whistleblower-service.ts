import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const VALID_CHANNELS = ['HOTLINE', 'EMAIL', 'WEB_PORTAL', 'WALK_IN'] as const;

const VALID_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'INVESTIGATING',
  'RESOLVED',
  'CLOSED',
] as const;

type IntakeChannel = (typeof VALID_CHANNELS)[number];
type CaseStatus = (typeof VALID_STATUSES)[number];

export const whistleblowerService = {
  /**
   * Submit a new whistleblower case.
   * Validates the intake channel. Initializes status as SUBMITTED.
   */
  async submitCase(data: {
    channel: string;
    description: string;
    anonymous: boolean;
  }) {
    if (!VALID_CHANNELS.includes(data.channel as IntakeChannel)) {
      throw new Error(
        `Invalid intake channel "${data.channel}". Must be one of: ${VALID_CHANNELS.join(', ')}`,
      );
    }

    const [wbCase] = await db
      .insert(schema.whistleblowerCases)
      .values({
        intake_channel: data.channel,
        description: data.description,
        anonymous: data.anonymous,
        case_status: 'SUBMITTED',
        dpo_notified: false,
      })
      .returning();

    return wbCase;
  },

  /**
   * Assign a CCO reviewer to a whistleblower case.
   * Moves status to UNDER_REVIEW.
   */
  async assignReviewer(caseId: number, ccoId: number) {
    const [updated] = await db
      .update(schema.whistleblowerCases)
      .set({
        cco_reviewer_id: ccoId,
        case_status: 'UNDER_REVIEW',
        updated_at: new Date(),
      })
      .where(eq(schema.whistleblowerCases.id, caseId))
      .returning();

    if (!updated) {
      throw new Error(`Whistleblower case ${caseId} not found`);
    }

    return updated;
  },

  /**
   * Update case status and/or resolution.
   * Validates status is one of the allowed values.
   */
  async updateCase(
    caseId: number,
    data: { status?: string; resolution?: string },
  ) {
    if (data.status && !VALID_STATUSES.includes(data.status as CaseStatus)) {
      throw new Error(
        `Invalid case status "${data.status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      );
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (data.status) updates.case_status = data.status;
    if (data.resolution) updates.resolution = data.resolution;

    const [updated] = await db
      .update(schema.whistleblowerCases)
      .set(updates)
      .where(eq(schema.whistleblowerCases.id, caseId))
      .returning();

    if (!updated) {
      throw new Error(`Whistleblower case ${caseId} not found`);
    }

    return updated;
  },

  /**
   * Notify the Data Protection Officer for a case.
   * In production this would trigger an email/notification.
   */
  async notifyDPO(caseId: number) {
    const [updated] = await db
      .update(schema.whistleblowerCases)
      .set({
        dpo_notified: true,
        updated_at: new Date(),
      })
      .where(eq(schema.whistleblowerCases.id, caseId))
      .returning();

    if (!updated) {
      throw new Error(`Whistleblower case ${caseId} not found`);
    }

    // In production: send notification to DPO via email/SMS/system alert
    return updated;
  },

  /**
   * Get paginated list of whistleblower cases with optional filters.
   */
  async getCases(filters: {
    status?: string;
    anonymous?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.status) {
      conditions.push(eq(schema.whistleblowerCases.case_status, filters.status));
    }
    if (filters.anonymous !== undefined) {
      conditions.push(eq(schema.whistleblowerCases.anonymous, filters.anonymous));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.whistleblowerCases)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.whistleblowerCases.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.whistleblowerCases)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get a single whistleblower case by ID.
   */
  async getCase(id: number) {
    const [wbCase] = await db
      .select()
      .from(schema.whistleblowerCases)
      .where(eq(schema.whistleblowerCases.id, id))
      .limit(1);

    return wbCase ?? null;
  },

  /**
   * Conduct Risk Dashboard aggregation.
   * Returns total cases by status, anonymous vs named ratio,
   * average resolution time, and monthly trend (last 12 months).
   */
  async getConductRiskDashboard() {
    // Total cases by status
    const allCases = await db.select().from(schema.whistleblowerCases);

    const byStatus: Record<string, number> = {};
    for (const c of allCases) {
      const status = c.case_status ?? 'UNKNOWN';
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }

    // Anonymous vs named ratio
    const anonymousCount = allCases.filter((c: any) => c.anonymous === true).length;
    const namedCount = allCases.filter((c: any) => c.anonymous === false).length;

    // Average resolution time (from created_at to updated_at for RESOLVED/CLOSED cases)
    const resolvedCases = allCases.filter(
      (c: any) => c.case_status === 'RESOLVED' || c.case_status === 'CLOSED',
    );
    let avgResolutionDays = 0;
    if (resolvedCases.length > 0) {
      const totalDays = resolvedCases.reduce((sum: number, c: any) => {
        const created = new Date(c.created_at).getTime();
        const updated = new Date(c.updated_at).getTime();
        return sum + (updated - created) / (1000 * 60 * 60 * 24);
      }, 0);
      avgResolutionDays = Math.round((totalDays / resolvedCases.length) * 100) / 100;
    }

    // Monthly trend (last 12 months)
    const now = new Date();
    const twelveMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 11,
      1,
    );

    const monthlyTrend: { month: string; count: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(
        twelveMonthsAgo.getFullYear(),
        twelveMonthsAgo.getMonth() + i,
        1,
      );
      const monthEnd = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        1,
      );

      const count = allCases.filter((c: any) => {
        const created = new Date(c.created_at);
        return created >= monthDate && created < monthEnd;
      }).length;

      const label = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrend.push({ month: label, count });
    }

    return {
      totalCases: allCases.length,
      byStatus,
      anonymousCount,
      namedCount,
      anonymousRatio:
        allCases.length > 0
          ? Math.round((anonymousCount / allCases.length) * 10000) / 10000
          : 0,
      avgResolutionDays,
      monthlyTrend,
    };
  },
};
