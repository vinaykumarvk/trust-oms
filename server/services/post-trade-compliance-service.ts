/**
 * Post-Trade Compliance Service (Phase 3G)
 *
 * Provides post-trade review capabilities including position-vs-limit
 * checking across portfolios, expiring line detection, multi-portfolio
 * concentration analysis, breach aging reports, and escalation workflows.
 *
 * BDO RFI Gap #4 — Post-Trade Compliance Engine.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, gte, lte } from 'drizzle-orm';
import { complianceLimitService, type LimitCheckResult } from './compliance-limit-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostTradeBreachResult {
  limitId: number;
  limitType: string;
  dimension: string;
  dimensionId: string | null;
  currentExposure: number;
  limitAmount: number;
  utilizationPct: number;
  severity: 'hard' | 'soft';
  message: string;
}

interface BreachAgingBucket {
  bucket: string;
  count: number;
  breaches: Array<{
    id: number;
    order_id: string | null;
    rule: string;
    severity: string;
    description: string | null;
    created_at: Date;
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const postTradeComplianceService = {
  /**
   * Run post-trade review for a portfolio.
   * Checks all positions against active compliance limits and returns breaches.
   */
  async runPostTradeReview(portfolioId: string): Promise<{
    portfolioId: string;
    reviewedAt: string;
    breaches: PostTradeBreachResult[];
    totalChecks: number;
  }> {
    const breaches: PostTradeBreachResult[] = [];
    let totalChecks = 0;

    // Get all positions for the portfolio
    const positions = await db
      .select({
        positionId: schema.positions.id,
        securityId: schema.positions.security_id,
        quantity: schema.positions.quantity,
        marketValue: schema.positions.market_value,
        sector: schema.securities.sector,
        securityName: schema.securities.name,
      })
      .from(schema.positions)
      .leftJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // Get portfolio AUM for concentration calculations
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    const aum = parseFloat(portfolio?.aum ?? '0');

    // Get all active limits
    const activeLimits = await db
      .select()
      .from(schema.complianceLimits)
      .where(eq(schema.complianceLimits.is_active, true));

    // Check each limit against current state
    for (const limit of activeLimits) {
      totalChecks++;
      const limitAmount = parseFloat(limit.limit_amount ?? '0');
      if (limitAmount === 0) continue;

      const currentExposure = parseFloat(limit.current_exposure ?? '0');
      const warningPct = limit.warning_threshold_pct ?? 80;
      const utilizationPct = (currentExposure / limitAmount) * 100;

      // Check issuer/sector limits against this portfolio specifically
      if (limit.limit_type === 'sector' && limit.dimension_id) {
        const sectorPositions = positions.filter(
          (p: { sector: string | null }) => p.sector === limit.dimension_id,
        );
        const sectorMv = sectorPositions.reduce(
          (sum: number, p: { marketValue: string | null }) => sum + parseFloat(p.marketValue ?? '0'),
          0,
        );

        if (aum > 0) {
          const sectorPct = (sectorMv / aum) * 100;
          if (sectorPct >= 100 * (limitAmount / aum)) {
            breaches.push({
              limitId: limit.id,
              limitType: limit.limit_type,
              dimension: limit.dimension,
              dimensionId: limit.dimension_id,
              currentExposure: sectorMv,
              limitAmount,
              utilizationPct: sectorPct,
              severity: 'hard',
              message: `Sector ${limit.dimension_id} concentration ${sectorPct.toFixed(1)}% exceeds limit`,
            });
            continue;
          }
        }
      }

      // General limit utilization check
      if (utilizationPct >= 100) {
        breaches.push({
          limitId: limit.id,
          limitType: limit.limit_type,
          dimension: limit.dimension,
          dimensionId: limit.dimension_id ?? null,
          currentExposure,
          limitAmount,
          utilizationPct,
          severity: 'hard',
          message: `${limit.limit_type} limit breached: ${currentExposure.toLocaleString()} / ${limitAmount.toLocaleString()} (${utilizationPct.toFixed(1)}%)`,
        });
      } else if (utilizationPct >= warningPct) {
        breaches.push({
          limitId: limit.id,
          limitType: limit.limit_type,
          dimension: limit.dimension,
          dimensionId: limit.dimension_id ?? null,
          currentExposure,
          limitAmount,
          utilizationPct,
          severity: 'soft',
          message: `${limit.limit_type} limit warning: ${currentExposure.toLocaleString()} / ${limitAmount.toLocaleString()} (${utilizationPct.toFixed(1)}%)`,
        });
      }
    }

    return {
      portfolioId,
      reviewedAt: new Date().toISOString(),
      breaches,
      totalChecks,
    };
  },

  /**
   * Get compliance limits expiring within the specified number of days.
   */
  async getExpiringLines(daysAhead: number = 30): Promise<{
    daysAhead: number;
    expiringLimits: Array<{
      id: number;
      limit_type: string;
      dimension: string;
      dimension_id: string | null;
      limit_amount: string | null;
      effective_to: string | null;
      daysUntilExpiry: number;
    }>;
  }> {
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const todayStr = today.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];

    const rows = await db
      .select()
      .from(schema.complianceLimits)
      .where(
        and(
          eq(schema.complianceLimits.is_active, true),
          sql`${schema.complianceLimits.effective_to} IS NOT NULL`,
          gte(schema.complianceLimits.effective_to, todayStr),
          lte(schema.complianceLimits.effective_to, futureStr),
        ),
      )
      .orderBy(schema.complianceLimits.effective_to);

    const expiringLimits = rows.map((row: typeof schema.complianceLimits.$inferSelect) => {
      const expiryDate = new Date(row.effective_to!);
      const diffMs = expiryDate.getTime() - today.getTime();
      const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        id: row.id,
        limit_type: row.limit_type,
        dimension: row.dimension,
        dimension_id: row.dimension_id,
        limit_amount: row.limit_amount,
        effective_to: row.effective_to,
        daysUntilExpiry,
      };
    });

    return { daysAhead, expiringLimits };
  },

  /**
   * Multi-portfolio concentration analysis.
   * Checks cross-portfolio aggregate exposure to issuers and sectors.
   */
  async multiPortfolioAnalysis(portfolioIds: string[]): Promise<{
    portfolioCount: number;
    sectorConcentrations: Array<{
      sector: string;
      totalMarketValue: number;
      portfolioBreakdown: Array<{ portfolioId: string; marketValue: number }>;
    }>;
    totalAum: number;
  }> {
    // Get aggregate positions across all specified portfolios grouped by sector
    const sectorData = await db
      .select({
        portfolioId: schema.positions.portfolio_id,
        sector: schema.securities.sector,
        totalMv: sql<string>`coalesce(sum(${schema.positions.market_value}::numeric), 0)`,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(sql`${schema.positions.portfolio_id} IN (${sql.join(portfolioIds.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(schema.positions.portfolio_id, schema.securities.sector);

    // Get total AUM for the portfolios
    const aumData = await db
      .select({
        totalAum: sql<string>`coalesce(sum(${schema.portfolios.aum}::numeric), 0)`,
      })
      .from(schema.portfolios)
      .where(sql`${schema.portfolios.portfolio_id} IN (${sql.join(portfolioIds.map((id) => sql`${id}`), sql`, `)})`);

    const totalAum = parseFloat(aumData[0]?.totalAum ?? '0');

    // Group by sector
    const sectorMap = new Map<
      string,
      { totalMarketValue: number; portfolioBreakdown: Array<{ portfolioId: string; marketValue: number }> }
    >();

    for (const row of sectorData) {
      const sector = row.sector ?? 'UNKNOWN';
      const mv = parseFloat(row.totalMv ?? '0');
      const pid = row.portfolioId ?? 'UNKNOWN';

      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { totalMarketValue: 0, portfolioBreakdown: [] });
      }

      const entry = sectorMap.get(sector)!;
      entry.totalMarketValue += mv;
      entry.portfolioBreakdown.push({ portfolioId: pid, marketValue: mv });
    }

    const sectorConcentrations = Array.from(sectorMap.entries()).map(([sector, data]) => ({
      sector,
      ...data,
    }));

    return {
      portfolioCount: portfolioIds.length,
      sectorConcentrations,
      totalAum,
    };
  },

  /**
   * Get breach aging — unresolved validation overrides (breaches) grouped by age.
   * Buckets: 0-1 day, 2-3 days, 4-7 days, 7+ days.
   */
  async getBreachAging(): Promise<{
    summary: Array<{ bucket: string; count: number }>;
    details: BreachAgingBucket[];
  }> {
    // Get all unresolved breaches (overrides without an approved_by)
    const unresolvedBreaches = await db
      .select()
      .from(schema.validationOverrides)
      .where(sql`${schema.validationOverrides.approved_by} IS NULL`)
      .orderBy(desc(schema.validationOverrides.created_at));

    const now = new Date();

    const buckets: Record<string, BreachAgingBucket> = {
      '0-1d': { bucket: '0-1d', count: 0, breaches: [] },
      '2-3d': { bucket: '2-3d', count: 0, breaches: [] },
      '4-7d': { bucket: '4-7d', count: 0, breaches: [] },
      '7+d': { bucket: '7+d', count: 0, breaches: [] },
    };

    for (const breach of unresolvedBreaches) {
      const createdAt = breach.created_at;
      const diffMs = now.getTime() - createdAt.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let bucketKey: string;
      if (diffDays <= 1) {
        bucketKey = '0-1d';
      } else if (diffDays <= 3) {
        bucketKey = '2-3d';
      } else if (diffDays <= 7) {
        bucketKey = '4-7d';
      } else {
        bucketKey = '7+d';
      }

      buckets[bucketKey].count++;
      buckets[bucketKey].breaches.push({
        id: breach.id,
        order_id: breach.order_id,
        rule: breach.validation_rule,
        severity: breach.severity,
        description: breach.breach_description,
        created_at: createdAt,
      });
    }

    const details = Object.values(buckets);
    const summary = details.map(({ bucket, count }) => ({ bucket, count }));

    return { summary, details };
  },

  /**
   * Escalate a breach — mark a validation override for escalation.
   * Updates the breach record with escalation metadata.
   */
  async escalateBreach(breachId: number): Promise<{
    id: number;
    escalated: boolean;
    escalatedAt: string;
  }> {
    const [breach] = await db
      .select()
      .from(schema.validationOverrides)
      .where(eq(schema.validationOverrides.id, breachId))
      .limit(1);

    if (!breach) {
      throw new Error(`Validation override (breach) not found: ${breachId}`);
    }

    // Mark as escalated by updating the status and timestamp
    await db
      .update(schema.validationOverrides)
      .set({
        status: 'escalated',
        updated_at: new Date(),
      })
      .where(eq(schema.validationOverrides.id, breachId));

    return {
      id: breachId,
      escalated: true,
      escalatedAt: new Date().toISOString(),
    };
  },
};
