/**
 * Simulation Engine Service (Phase 3H)
 *
 * Provides what-if trade simulation, stress-test scenario analysis,
 * and constant-mix rebalancing simulation for portfolio modeling.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

/** Proposed trade for what-if analysis */
interface ProposedTrade {
  securityId: number;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}

/** Portfolio-level metrics snapshot */
interface PortfolioMetrics {
  totalMarketValue: number;
  weightedYield: number;
  weightedDuration: number;
  estimatedROI: number;
}

/** Stress-test scenario key */
type StressScenario =
  | 'INTEREST_RATE_SHOCK'
  | 'EQUITY_CRASH'
  | 'CREDIT_WIDENING'
  | 'CURRENCY_DEVALUATION';

/** Model allocation shape from JSONB */
interface ModelAllocation {
  asset_class: string;
  target_pct: number;
  min_pct: number;
  max_pct: number;
}

/** Stress scenario multipliers by asset_class keyword */
const STRESS_MULTIPLIERS: Record<StressScenario, Record<string, number>> = {
  INTEREST_RATE_SHOCK: {
    BOND: -0.05,
    FIXED_INCOME: -0.05,
    GOVERNMENT_BOND: -0.05,
    CORPORATE_BOND: -0.05,
  },
  EQUITY_CRASH: {
    EQUITY: -0.20,
    STOCK: -0.20,
    COMMON_STOCK: -0.20,
    PREFERRED_STOCK: -0.20,
  },
  CREDIT_WIDENING: {
    CORPORATE_BOND: -0.03,
    CREDIT: -0.03,
    HIGH_YIELD: -0.03,
    FIXED_INCOME: -0.03,
  },
  CURRENCY_DEVALUATION: {
    FOREIGN_CURRENCY: -0.10,
    FX: -0.10,
  },
};

/** Helper: look up the stress multiplier for a given asset class under a scenario */
function getMultiplier(scenario: StressScenario, assetClass: string): number {
  const map = STRESS_MULTIPLIERS[scenario];
  const upper = (assetClass ?? '').toUpperCase().replace(/[\s-]/g, '_');

  // Direct match first
  if (map[upper] !== undefined) return map[upper];

  // Partial/keyword match
  for (const [key, mult] of Object.entries(map)) {
    if (upper.includes(key)) return mult;
  }

  return 0; // no impact for classes not in scenario
}

export const simulationEngineService = {
  // ---------------------------------------------------------------------------
  // What-If Trade Simulation
  // ---------------------------------------------------------------------------

  /**
   * Simulate the impact of proposed trades on portfolio metrics.
   * Returns current vs. projected metrics plus trading P&L.
   */
  async simulateWhatIf(
    portfolioId: string,
    proposedTrades: ProposedTrade[],
  ) {
    // Fetch current positions with security details
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        cost_basis: schema.positions.cost_basis,
        market_value: schema.positions.market_value,
        asset_class: schema.securities.asset_class,
        currency: schema.securities.currency,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // Current metrics
    const currentMetrics = computeMetrics(positions);

    // Clone positions and apply trades
    const positionMap = new Map<number, { quantity: number; marketValue: number; costBasis: number; assetClass: string; currency: string }>();
    for (const p of positions) {
      positionMap.set(p.security_id!, {
        quantity: Number(p.quantity ?? 0),
        marketValue: Number(p.market_value ?? 0),
        costBasis: Number(p.cost_basis ?? 0),
        assetClass: p.asset_class ?? 'UNKNOWN',
        currency: p.currency ?? 'PHP',
      });
    }

    let tradingGainLoss = 0;
    let totalCost = 0;

    for (const trade of proposedTrades) {
      const existing = positionMap.get(trade.securityId) ?? {
        quantity: 0,
        marketValue: 0,
        costBasis: 0,
        assetClass: 'UNKNOWN',
        currency: 'PHP',
      };

      const tradeValue = trade.quantity * trade.price;
      totalCost += tradeValue;

      if (trade.side === 'BUY') {
        existing.quantity += trade.quantity;
        existing.marketValue += tradeValue;
        existing.costBasis += tradeValue;
      } else {
        // SELL
        const avgCost =
          existing.quantity > 0 ? existing.costBasis / existing.quantity : 0;
        const realizedGain = (trade.price - avgCost) * trade.quantity;
        tradingGainLoss += realizedGain;

        existing.quantity -= trade.quantity;
        existing.marketValue -= tradeValue;
        existing.costBasis -= avgCost * trade.quantity;
      }

      positionMap.set(trade.securityId, existing);
    }

    // Build projected positions for metric computation
    const projectedPositions = Array.from(positionMap.values()).map((p) => ({
      market_value: String(p.marketValue),
      cost_basis: String(p.costBasis),
      asset_class: p.assetClass,
      currency: p.currency,
    }));

    const projectedMetrics = computeMetrics(projectedPositions);

    return {
      currentMetrics,
      projectedMetrics,
      tradingGainLoss: Math.round(tradingGainLoss * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
    };
  },

  // ---------------------------------------------------------------------------
  // Stress Test Simulation
  // ---------------------------------------------------------------------------

  /**
   * Apply scenario multipliers to portfolio positions and return impact.
   */
  async simulateStressTest(
    portfolioId: string,
    scenario: StressScenario,
  ) {
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        market_value: schema.positions.market_value,
        asset_class: schema.securities.asset_class,
        ticker: schema.securities.bloomberg_ticker,
        currency: schema.securities.currency,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let currentTotalMV = 0;
    for (const pos of positions) {
      currentTotalMV += Number(pos.market_value ?? 0);
    }

    const impactDetails: {
      securityId: number | null;
      ticker: string | null;
      assetClass: string | null;
      currentMV: number;
      multiplier: number;
      impact: number;
      stressedMV: number;
    }[] = positions.map((p: typeof positions[number]) => {
      const mv = Number(p.market_value ?? 0);
      const multiplier = getMultiplier(scenario, p.asset_class ?? '');
      const impact = mv * multiplier;
      const stressedMV = mv + impact;

      return {
        securityId: p.security_id,
        ticker: p.ticker,
        assetClass: p.asset_class,
        currentMV: Math.round(mv * 100) / 100,
        multiplier,
        impact: Math.round(impact * 100) / 100,
        stressedMV: Math.round(stressedMV * 100) / 100,
      };
    });

    let totalImpact = 0;
    for (const d of impactDetails) {
      totalImpact += d.impact;
    }
    const stressedTotalMV = currentTotalMV + totalImpact;

    return {
      scenario,
      currentTotalMV: Math.round(currentTotalMV * 100) / 100,
      stressedTotalMV: Math.round(stressedTotalMV * 100) / 100,
      totalImpact: Math.round(totalImpact * 100) / 100,
      totalImpactPct:
        currentTotalMV > 0
          ? Math.round((totalImpact / currentTotalMV) * 10000) / 100
          : 0,
      details: impactDetails,
    };
  },

  // ---------------------------------------------------------------------------
  // Constant-Mix Rebalancing Simulation
  // ---------------------------------------------------------------------------

  /**
   * Simulate a constant-mix rebalancing and return the projected portfolio
   * after the rebalance aligns it to the model.
   */
  async simulateConstantMix(portfolioId: string, modelId: number) {
    // Fetch model
    const [model] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, modelId))
      .limit(1);

    if (!model) throw new Error('Model portfolio not found');

    const allocations = (model.allocations ?? []) as unknown as ModelAllocation[];

    // Fetch positions
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        market_value: schema.positions.market_value,
        asset_class: schema.securities.asset_class,
        ticker: schema.securities.bloomberg_ticker,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let totalMV = 0;
    for (const pos of positions) {
      totalMV += Number(pos.market_value ?? 0);
    }

    // Target MV per asset class from model
    const targetMVByClass: Record<string, number> = {};
    for (const alloc of allocations) {
      targetMVByClass[alloc.asset_class] = (alloc.target_pct / 100) * totalMV;
    }

    // Actual MV per asset class
    const actualMVByClass: Record<string, number> = {};
    for (const p of positions) {
      const cls = p.asset_class ?? 'UNKNOWN';
      actualMVByClass[cls] = (actualMVByClass[cls] ?? 0) + Number(p.market_value ?? 0);
    }

    // Project each position to its target weight
    const projectedPositions = positions.map((p: typeof positions[number]) => {
      const cls = p.asset_class ?? 'UNKNOWN';
      const actualClassMV = actualMVByClass[cls] ?? 0;
      const targetClassMV = targetMVByClass[cls] ?? 0;
      const currentMV = Number(p.market_value ?? 0);

      // Scale this position proportionally within its class
      const scaleFactor =
        actualClassMV > 0 ? targetClassMV / actualClassMV : 0;
      const projectedMV = currentMV * scaleFactor;
      const delta = projectedMV - currentMV;

      return {
        securityId: p.security_id,
        ticker: p.ticker,
        assetClass: p.asset_class,
        currentMV: Math.round(currentMV * 100) / 100,
        projectedMV: Math.round(projectedMV * 100) / 100,
        delta: Math.round(delta * 100) / 100,
        action: delta > 0.01 ? 'BUY' as const : delta < -0.01 ? 'SELL' as const : 'HOLD' as const,
      };
    });

    // Summary by asset class
    const allocationSummary = allocations.map((alloc) => {
      const actualMV = actualMVByClass[alloc.asset_class] ?? 0;
      const targetMVVal = targetMVByClass[alloc.asset_class] ?? 0;
      return {
        assetClass: alloc.asset_class,
        targetPct: alloc.target_pct,
        currentMV: Math.round(actualMV * 100) / 100,
        projectedMV: Math.round(targetMVVal * 100) / 100,
        delta: Math.round((targetMVVal - actualMV) * 100) / 100,
      };
    });

    return {
      modelId,
      modelName: model.name,
      portfolioId,
      totalMV: Math.round(totalMV * 100) / 100,
      positions: projectedPositions,
      allocationSummary,
    };
  },
};

// =============================================================================
// Helpers
// =============================================================================

function computeMetrics(
  positions: { market_value?: string | null; cost_basis?: string | null; asset_class?: string | null; currency?: string | null }[],
): PortfolioMetrics {
  let totalMV = 0;
  let totalCost = 0;

  for (const p of positions) {
    totalMV += Number(p.market_value ?? 0);
    totalCost += Number(p.cost_basis ?? 0);
  }

  const estimatedROI = totalCost > 0 ? ((totalMV - totalCost) / totalCost) * 100 : 0;

  // Simplified yield/duration — in production these would be looked up from
  // security master data. Here we use placeholder heuristics based on
  // asset class composition.
  let bondMV = 0;
  let equityMV = 0;
  for (const p of positions) {
    const cls = (p.asset_class ?? '').toUpperCase();
    const mv = Number(p.market_value ?? 0);
    if (cls.includes('BOND') || cls.includes('FIXED')) bondMV += mv;
    if (cls.includes('EQUITY') || cls.includes('STOCK')) equityMV += mv;
  }

  // Heuristic: bonds yield ~4%, equities ~2% dividend
  const weightedYield =
    totalMV > 0
      ? ((bondMV * 0.04 + equityMV * 0.02) / totalMV) * 100
      : 0;

  // Heuristic: bond duration ~5yr weighted by MV share
  const weightedDuration = totalMV > 0 ? (bondMV / totalMV) * 5 : 0;

  return {
    totalMarketValue: Math.round(totalMV * 100) / 100,
    weightedYield: Math.round(weightedYield * 100) / 100,
    weightedDuration: Math.round(weightedDuration * 100) / 100,
    estimatedROI: Math.round(estimatedROI * 100) / 100,
  };
}
