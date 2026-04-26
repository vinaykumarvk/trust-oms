/**
 * Scheduled Post-Trade Review Service (FR-PTC-005)
 *
 * Provides configurable daily/weekly/monthly scheduled post-trade
 * compliance reviews. Integrates with post-trade-compliance-service
 * to run automated reviews on portfolios based on their schedules.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, lte } from 'drizzle-orm';

interface ReviewRunResult {
  portfolioId: string;
  breachCount: number;
  expiringLineCount: number;
  ranAt: Date;
}

export const scheduledReviewService = {
  /**
   * Create or update a review schedule for a portfolio.
   */
  async upsertSchedule(data: {
    portfolioId: string;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  }) {
    const [existing] = await db
      .select()
      .from(schema.postTradeReviewSchedules)
      .where(eq(schema.postTradeReviewSchedules.portfolio_id, data.portfolioId))
      .limit(1);

    const nextRun = computeNextRun(data.frequency);

    if (existing) {
      await db
        .update(schema.postTradeReviewSchedules)
        .set({
          frequency: data.frequency,
          next_run_at: nextRun,
          is_active: true,
          updated_at: new Date(),
        })
        .where(eq(schema.postTradeReviewSchedules.id, existing.id));
      return { ...existing, frequency: data.frequency, next_run_at: nextRun };
    }

    const [created] = await db
      .insert(schema.postTradeReviewSchedules)
      .values({
        portfolio_id: data.portfolioId,
        frequency: data.frequency,
        next_run_at: nextRun,
        is_active: true,
      })
      .returning();

    return created;
  },

  /**
   * Get all schedules that are due for execution.
   */
  async getDueSchedules() {
    const now = new Date();
    return db
      .select()
      .from(schema.postTradeReviewSchedules)
      .where(
        and(
          eq(schema.postTradeReviewSchedules.is_active, true),
          lte(schema.postTradeReviewSchedules.next_run_at, now),
        ),
      );
  },

  /**
   * Execute all due post-trade reviews. Called by EOD orchestrator
   * or a cron job. Returns results for each reviewed portfolio.
   */
  async executeDueReviews(): Promise<ReviewRunResult[]> {
    const dueSchedules = await this.getDueSchedules();
    const results: ReviewRunResult[] = [];

    for (const schedule of dueSchedules) {
      if (!schedule.portfolio_id) continue;

      // Run the post-trade compliance check
      const breaches = await runPostTradeCheck(schedule.portfolio_id);
      const expiringLines = await countExpiringLines(schedule.portfolio_id);

      const now = new Date();

      // Update schedule with next run date
      await db
        .update(schema.postTradeReviewSchedules)
        .set({
          last_run_at: now,
          next_run_at: computeNextRun(schedule.frequency ?? 'DAILY'),
          updated_at: now,
        })
        .where(eq(schema.postTradeReviewSchedules.id, schedule.id));

      results.push({
        portfolioId: schedule.portfolio_id,
        breachCount: breaches,
        expiringLineCount: expiringLines,
        ranAt: now,
      });
    }

    return results;
  },

  /**
   * List all review schedules (optionally filtered by active status).
   */
  async listSchedules(activeOnly = true) {
    const conditions = activeOnly
      ? eq(schema.postTradeReviewSchedules.is_active, true)
      : undefined;

    return db
      .select()
      .from(schema.postTradeReviewSchedules)
      .where(conditions);
  },

  /**
   * Deactivate a schedule.
   */
  async deactivateSchedule(portfolioId: string) {
    await db
      .update(schema.postTradeReviewSchedules)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(schema.postTradeReviewSchedules.portfolio_id, portfolioId));
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeNextRun(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case 'DAILY':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'WEEKLY':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'MONTHLY':
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

async function runPostTradeCheck(portfolioId: string): Promise<number> {
  // Check active compliance limits scoped to this portfolio (via dimension_id)
  // or global limits (null dimension_id).
  const limits = await db
    .select()
    .from(schema.complianceLimits)
    .where(
      and(
        eq(schema.complianceLimits.is_active, true),
        sql`(${schema.complianceLimits.dimension_id} = ${portfolioId} OR ${schema.complianceLimits.dimension_id} IS NULL)`,
      ),
    );

  let breachCount = 0;

  for (const limit of limits) {
    const exposure = parseFloat(limit.current_exposure ?? '0');
    const maxLimit = parseFloat(limit.limit_amount ?? '0');
    if (maxLimit > 0 && exposure >= maxLimit) {
      breachCount++;

      // Record breach in compliance_breaches if not already tracked
      const existing = await db
        .select()
        .from(schema.complianceBreaches)
        .where(
          and(
            eq(schema.complianceBreaches.rule_id, limit.id),
            eq(schema.complianceBreaches.portfolio_id, portfolioId),
            sql`${schema.complianceBreaches.resolved_at} IS NULL`,
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(schema.complianceBreaches).values({
          rule_id: limit.id,
          portfolio_id: portfolioId,
          breach_description: `Post-trade review: ${limit.limit_type} limit "${limit.dimension}" breached (exposure ${exposure} >= limit ${maxLimit})`,
          detected_at: new Date(),
        });
      }
    }
  }

  return breachCount;
}

async function countExpiringLines(portfolioId: string): Promise<number> {
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = await db
    .select({ cnt: sql<string>`count(*)` })
    .from(schema.complianceLimits)
    .where(
      and(
        eq(schema.complianceLimits.is_active, true),
        sql`${schema.complianceLimits.effective_to} IS NOT NULL`,
        sql`${schema.complianceLimits.effective_to} <= ${thirtyDaysFromNow}`,
      ),
    );

  return parseInt(result[0]?.cnt ?? '0', 10);
}
