import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const BASEL_CATEGORIES = [
  'Internal Fraud',
  'External Fraud',
  'Employment Practices',
  'Clients/Products',
  'Damage to Assets',
  'Business Disruption',
  'Execution/Delivery',
] as const;

type BaselCategory = (typeof BASEL_CATEGORIES)[number];

export const oreService = {
  /**
   * Record a new Operational Risk Event.
   * Validates that baselCategory is one of the Basel II 7 event types.
   */
  async recordEvent(data: { baselCategory: string; description: string }) {
    if (!BASEL_CATEGORIES.includes(data.baselCategory as BaselCategory)) {
      throw new Error(
        `Invalid Basel category "${data.baselCategory}". Must be one of: ${BASEL_CATEGORIES.join(', ')}`,
      );
    }

    const [event] = await db
      .insert(schema.oreEvents)
      .values({
        basel_category: data.baselCategory,
        description: data.description,
        reported_to_bsp: false,
      })
      .returning();

    return event;
  },

  /**
   * Quantify loss figures for an existing ORE.
   * Validates: netLoss <= grossLoss, recovery <= grossLoss.
   */
  async quantifyLoss(
    oreId: number,
    grossLoss: number,
    netLoss: number,
    recovery: number,
  ) {
    if (netLoss > grossLoss) {
      throw new Error('Net loss cannot exceed gross loss');
    }
    if (recovery > grossLoss) {
      throw new Error('Recovery cannot exceed gross loss');
    }

    const [updated] = await db
      .update(schema.oreEvents)
      .set({
        gross_loss: String(grossLoss),
        net_loss: String(netLoss),
        recovery: String(recovery),
        updated_at: new Date(),
      })
      .where(eq(schema.oreEvents.id, oreId))
      .returning();

    if (!updated) {
      throw new Error(`ORE event ${oreId} not found`);
    }

    return updated;
  },

  /**
   * Record root cause analysis and corrective action for an ORE.
   */
  async recordRootCause(
    oreId: number,
    rootCause: string,
    correctiveAction: string,
  ) {
    const [updated] = await db
      .update(schema.oreEvents)
      .set({
        root_cause: rootCause,
        corrective_action: correctiveAction,
        updated_at: new Date(),
      })
      .where(eq(schema.oreEvents.id, oreId))
      .returning();

    if (!updated) {
      throw new Error(`ORE event ${oreId} not found`);
    }

    return updated;
  },

  /**
   * Mark an ORE as reported to BSP.
   */
  async markReportedToBSP(oreId: number) {
    const [updated] = await db
      .update(schema.oreEvents)
      .set({
        reported_to_bsp: true,
        updated_at: new Date(),
      })
      .where(eq(schema.oreEvents.id, oreId))
      .returning();

    if (!updated) {
      throw new Error(`ORE event ${oreId} not found`);
    }

    return updated;
  },

  /**
   * Get paginated list of ORE events with optional filters.
   */
  async getEvents(filters: {
    baselCategory?: string;
    reportedToBsp?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.baselCategory) {
      conditions.push(eq(schema.oreEvents.basel_category, filters.baselCategory));
    }
    if (filters.reportedToBsp !== undefined) {
      conditions.push(eq(schema.oreEvents.reported_to_bsp, filters.reportedToBsp));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.oreEvents)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.oreEvents.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.oreEvents)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get a single ORE event by ID.
   */
  async getEvent(id: number) {
    const [event] = await db
      .select()
      .from(schema.oreEvents)
      .where(eq(schema.oreEvents.id, id))
      .limit(1);

    return event ?? null;
  },

  /**
   * Generate a quarterly ORE report.
   * @param quarter - format "YYYY-QN" e.g. "2026-Q1"
   * Returns summary by category, total losses, and event list.
   */
  async generateQuarterlyReport(quarter: string) {
    const match = quarter.match(/^(\d{4})-Q([1-4])$/);
    if (!match) {
      throw new Error('Invalid quarter format. Expected "YYYY-QN" e.g. "2026-Q1"');
    }

    const year = parseInt(match[1], 10);
    const q = parseInt(match[2], 10);

    // Quarter start/end months (1-indexed)
    const startMonth = (q - 1) * 3; // 0-indexed for Date constructor
    const endMonth = startMonth + 3;

    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(year, endMonth, 1); // first day of next quarter

    const events = await db
      .select()
      .from(schema.oreEvents)
      .where(
        and(
          sql`${schema.oreEvents.created_at} >= ${startDate.toISOString()}`,
          sql`${schema.oreEvents.created_at} < ${endDate.toISOString()}`,
        ),
      )
      .orderBy(desc(schema.oreEvents.created_at));

    // Summarize by category
    const byCategory: Record<string, number> = {};
    let totalGrossLoss = 0;
    let totalNetLoss = 0;
    let totalRecovery = 0;

    for (const event of events) {
      const cat = event.basel_category ?? 'Unknown';
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      totalGrossLoss += parseFloat(event.gross_loss ?? '0');
      totalNetLoss += parseFloat(event.net_loss ?? '0');
      totalRecovery += parseFloat(event.recovery ?? '0');
    }

    return {
      quarter,
      totalEvents: events.length,
      byCategory,
      totalGrossLoss,
      totalNetLoss,
      totalRecovery,
      events,
    };
  },
};
