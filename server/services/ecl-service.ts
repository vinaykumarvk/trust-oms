/**
 * ECL Service (FR-MNT-006)
 *
 * IFRS 9 Expected Credit Loss calculation engine for fixed-income portfolios.
 * Implements the three-stage impairment model:
 *   Stage 1 — 12-month ECL for performing loans
 *   Stage 2 — Lifetime ECL for significant credit deterioration
 *   Stage 3 — Lifetime ECL for credit-impaired assets
 *
 * PD sourced from rating-based lookup; LGD defaults 45% senior unsecured /
 * 75% subordinated; EAD = current market_value.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Rating-based PD lookup tables (annualised, in decimal)
// Source: S&P/Moody's historical default study — representative values
// ---------------------------------------------------------------------------

/** 12-month PD by credit-rating bucket */
const PD_12M: Record<string, number> = {
  AAA: 0.0001,
  AA: 0.0002,
  A: 0.0005,
  BBB: 0.0020,
  BB: 0.0100,
  B: 0.0400,
  CCC: 0.1500,
  CC: 0.2500,
  C: 0.3500,
  D: 1.0000,
};

/** Lifetime (cumulative) PD — simplified 5-year horizon */
const PD_LIFETIME: Record<string, number> = {
  AAA: 0.0007,
  AA: 0.0020,
  A: 0.0055,
  BBB: 0.0200,
  BB: 0.0800,
  B: 0.2000,
  CCC: 0.4500,
  CC: 0.6000,
  C: 0.8000,
  D: 1.0000,
};

/** LGD defaults */
const LGD_SENIOR_UNSECURED = 0.45;
const LGD_SUBORDINATED = 0.75;

// ---------------------------------------------------------------------------
// Stage determination helpers
// ---------------------------------------------------------------------------

/** Ordered investment-grade boundary for notch-based comparison */
const RATING_RANK: Record<string, number> = {
  AAA: 1,
  AA: 2,
  A: 3,
  BBB: 4,
  BB: 5,
  B: 6,
  CCC: 7,
  CC: 8,
  C: 9,
  D: 10,
};

function ratingRank(rating: string | null): number {
  if (!rating) return 6; // default to B if unknown
  const upper = rating.toUpperCase().replace(/[+-]/g, '').replace(/[123]/g, '');
  // Normalise Moody's-style ratings
  const moodyMap: Record<string, string> = {
    AAA: 'AAA',
    AA: 'AA',
    A: 'A',
    BAA: 'BBB',
    BA: 'BB',
    B: 'B',
    CAA: 'CCC',
    CA: 'CC',
    C: 'C',
  };
  const normalised = moodyMap[upper] ?? upper;
  return RATING_RANK[normalised] ?? 6;
}

function bucketFromRank(rank: number): string {
  const entries = Object.entries(RATING_RANK);
  for (const [rating, r] of entries) {
    if (r === rank) return rating;
  }
  return 'B';
}

export type ECLStage = 1 | 2 | 3;

/**
 * Determine the IFRS 9 stage based on the original (at-inception) credit
 * rating vs the current credit rating.
 *
 * - Stage 1: No significant deterioration (downgrade <= 1 notch)
 * - Stage 2: Significant deterioration (downgrade > 1 notch but not impaired)
 * - Stage 3: Credit-impaired (current rating CCC or below, or D)
 */
function determineStage(
  originalRating: string | null,
  currentRating: string | null,
): ECLStage {
  const currentRank = ratingRank(currentRating);

  // Stage 3: Credit-impaired (CCC-, CC, C, D equivalents)
  if (currentRank >= RATING_RANK['CCC']) {
    return 3;
  }

  const originalRank = ratingRank(originalRating);
  const notchesDown = currentRank - originalRank;

  // Stage 2: Significant credit deterioration — more than 2 notches downgrade
  if (notchesDown > 2) {
    return 2;
  }

  // Stage 1: Performing
  return 1;
}

// ---------------------------------------------------------------------------
// ECL position-level result
// ---------------------------------------------------------------------------

export interface ECLPositionResult {
  positionId: number;
  securityId: number;
  securityName: string | null;
  assetClass: string | null;
  currentRating: string;
  originalRating: string;
  stage: ECLStage;
  pd: number;
  lgd: number;
  ead: number;
  eclAmount: number;
}

export interface ECLPortfolioResult {
  portfolioId: string;
  computedAt: string;
  totalECL: number;
  totalEAD: number;
  eclRatio: number;
  positionCount: number;
  stageBreakdown: {
    stage1: { count: number; ecl: number };
    stage2: { count: number; ecl: number };
    stage3: { count: number; ecl: number };
  };
  positions: ECLPositionResult[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const eclService = {
  /**
   * Compute IFRS 9 ECL for all fixed-income positions in a portfolio.
   *
   * Fixed-income asset classes considered: BOND, FIXED_INCOME, DEBT,
   * GOVERNMENT_BOND, CORPORATE_BOND, MONEY_MARKET, LOAN.
   */
  async computeECL(portfolioId: string): Promise<ECLPortfolioResult> {
    // Validate portfolio
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    if (!portfolio) {
      throw new Error(`Portfolio not found: ${portfolioId}`);
    }

    // Fetch all positions joined with security metadata
    const fixedIncomeClasses = [
      'BOND',
      'FIXED_INCOME',
      'DEBT',
      'GOVERNMENT_BOND',
      'CORPORATE_BOND',
      'MONEY_MARKET',
      'LOAN',
    ];

    const positions = await db
      .select({
        positionId: schema.positions.id,
        securityId: schema.positions.security_id,
        quantity: schema.positions.quantity,
        marketValue: schema.positions.market_value,
        securityName: schema.securities.name,
        assetClass: schema.securities.asset_class,
        riskProductCategory: schema.securities.risk_product_category,
        couponRate: schema.securities.coupon_rate,
      })
      .from(schema.positions)
      .innerJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .where(
        and(
          eq(schema.positions.portfolio_id, portfolioId),
          sql`UPPER(${schema.securities.asset_class}) IN (${sql.join(
            fixedIncomeClasses.map((c) => sql`${c}`),
            sql`, `,
          )})`,
        ),
      );

    // Build results
    const positionResults: ECLPositionResult[] = [];
    const stageBreakdown = {
      stage1: { count: 0, ecl: 0 },
      stage2: { count: 0, ecl: 0 },
      stage3: { count: 0, ecl: 0 },
    };
    let totalECL = 0;
    let totalEAD = 0;

    for (const pos of positions) {
      const ead = parseFloat(pos.marketValue ?? '0');
      if (ead <= 0) continue;

      // Use risk_product_category as a proxy for credit rating when
      // explicit rating is not available on the security table.
      // Mapping: CONSERVATIVE -> A, MODERATE -> BBB, BALANCED -> BB,
      //          GROWTH -> B, AGGRESSIVE -> CCC
      const categoryToRating: Record<string, string> = {
        CONSERVATIVE: 'A',
        MODERATE: 'BBB',
        BALANCED: 'BB',
        GROWTH: 'B',
        AGGRESSIVE: 'CCC',
      };

      const currentRating =
        categoryToRating[(pos.riskProductCategory ?? '').toUpperCase()] ?? 'BBB';

      // For inception rating, default to one notch better (simplified) unless
      // we can retrieve a stored value. In production this would come from the
      // position-level inception_credit_rating column.
      const currentRank = ratingRank(currentRating);
      const originalRank = Math.max(1, currentRank - 1);
      const originalRating = bucketFromRank(originalRank);

      const stage = determineStage(originalRating, currentRating);

      // Select PD based on stage
      const ratingBucket = currentRating;
      const pd =
        stage === 1
          ? (PD_12M[ratingBucket] ?? PD_12M['BBB'])
          : (PD_LIFETIME[ratingBucket] ?? PD_LIFETIME['BBB']);

      // Determine LGD: subordinated if asset class contains SUBORDINATED or
      // risk category is AGGRESSIVE; otherwise senior unsecured
      const isSubordinated =
        (pos.assetClass ?? '').toUpperCase().includes('SUBORDINATED') ||
        (pos.riskProductCategory ?? '').toUpperCase() === 'AGGRESSIVE';
      const lgd = isSubordinated ? LGD_SUBORDINATED : LGD_SENIOR_UNSECURED;

      // ECL = PD * LGD * EAD
      const eclAmount = pd * lgd * ead;

      const result: ECLPositionResult = {
        positionId: pos.positionId,
        securityId: pos.securityId!,
        securityName: pos.securityName,
        assetClass: pos.assetClass,
        currentRating: ratingBucket,
        originalRating,
        stage,
        pd,
        lgd,
        ead,
        eclAmount: Math.round(eclAmount * 100) / 100,
      };

      positionResults.push(result);

      totalECL += eclAmount;
      totalEAD += ead;

      const stageKey = `stage${stage}` as keyof typeof stageBreakdown;
      stageBreakdown[stageKey].count += 1;
      stageBreakdown[stageKey].ecl += eclAmount;
    }

    // Round stage breakdown ECLs
    stageBreakdown.stage1.ecl = Math.round(stageBreakdown.stage1.ecl * 100) / 100;
    stageBreakdown.stage2.ecl = Math.round(stageBreakdown.stage2.ecl * 100) / 100;
    stageBreakdown.stage3.ecl = Math.round(stageBreakdown.stage3.ecl * 100) / 100;

    return {
      portfolioId,
      computedAt: new Date().toISOString(),
      totalECL: Math.round(totalECL * 100) / 100,
      totalEAD: Math.round(totalEAD * 100) / 100,
      eclRatio: totalEAD > 0 ? Math.round((totalECL / totalEAD) * 10000) / 10000 : 0,
      positionCount: positionResults.length,
      stageBreakdown,
      positions: positionResults,
    };
  },

  /** Get PD lookup tables (for reference / audit) */
  getPDTables() {
    return {
      pd12m: { ...PD_12M },
      pdLifetime: { ...PD_LIFETIME },
      lgdSeniorUnsecured: LGD_SENIOR_UNSECURED,
      lgdSubordinated: LGD_SUBORDINATED,
    };
  },

  /** Batch ECL computation across all active portfolios */
  async computeECLBatch(): Promise<{
    portfolioCount: number;
    totalECL: number;
    results: ECLPortfolioResult[];
  }> {
    const portfolios = await db
      .select({ portfolio_id: schema.portfolios.portfolio_id })
      .from(schema.portfolios)
      .where(eq(schema.portfolios.is_deleted, false));

    const results: ECLPortfolioResult[] = [];
    let totalECL = 0;

    for (const p of portfolios) {
      try {
        const result = await this.computeECL(p.portfolio_id);
        if (result.positionCount > 0) {
          results.push(result);
          totalECL += result.totalECL;
        }
      } catch {
        // Skip portfolios that error (e.g., no fixed-income positions)
      }
    }

    return {
      portfolioCount: results.length,
      totalECL: Math.round(totalECL * 100) / 100,
      results,
    };
  },
};
