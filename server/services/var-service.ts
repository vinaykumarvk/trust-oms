/**
 * VAR (Value at Risk) Service (Phase 3J)
 *
 * BDO RFI Gap #6 — Risk Analytics.
 * Computes Historical, Parametric, and Monte Carlo VaR,
 * back-tests VaR predictions, and compares theoretical
 * yield income against actual P&L.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, gte, lte } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Z-scores for common confidence levels */
const Z_SCORES: Record<number, number> = {
  0.90: 1.282,
  0.95: 1.645,
  0.99: 2.326,
};

/** Generate normally distributed random number using Box-Muller transform */
function randomNormal(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** Compute percentile from a sorted (ascending) array */
function percentile(sortedArr: number[], p: number): number {
  const idx = Math.floor(p * sortedArr.length);
  return sortedArr[Math.min(idx, sortedArr.length - 1)];
}

/** Generate synthetic daily returns for a position (stub) */
function syntheticReturns(marketValue: number, count: number): number[] {
  const dailyVol = 0.015; // ~1.5% daily vol assumption
  const dailyMean = 0.0003; // slight positive drift
  const returns: number[] = [];
  for (let i = 0; i < count; i++) {
    returns.push(randomNormal(dailyMean, dailyVol) * marketValue);
  }
  return returns;
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface VARResult {
  portfolioId: string;
  method: 'HISTORICAL' | 'PARAMETRIC' | 'MONTE_CARLO';
  confidenceLevel: number;
  horizon: number;
  var: number;
  varPct: number;
  portfolioValue: number;
  computedAt: string;
}

interface BackTestPrediction {
  date: string;
  predictedVar: number;
  actualPnl: number;
  breached: boolean;
}

interface BackTestResult {
  portfolioId: string;
  period: number;
  predictions: BackTestPrediction[];
  breachCount: number;
  breachPct: number;
}

interface IncomeBackTestResult {
  expected: number;
  actual: number;
  variance: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const varService = {
  /**
   * Compute Value at Risk for a portfolio.
   *
   * @param portfolioId  Target portfolio
   * @param method       HISTORICAL | PARAMETRIC | MONTE_CARLO
   * @param confidenceLevel  e.g. 0.95 (default)
   * @param horizon      Holding period in days (default 1)
   */
  async computeVAR(
    portfolioId: string,
    method: 'HISTORICAL' | 'PARAMETRIC' | 'MONTE_CARLO',
    confidenceLevel: number = 0.95,
    horizon: number = 1,
  ): Promise<VARResult> {
    // Fetch positions with current market values
    const positions = await db
      .select({
        id: schema.positions.id,
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        market_value: schema.positions.market_value,
      })
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // Total portfolio value
    let portfolioValue = 0;
    for (const pos of positions) {
      portfolioValue += Number(pos.market_value ?? 0);
    }

    if (portfolioValue === 0) {
      return {
        portfolioId,
        method,
        confidenceLevel,
        horizon,
        var: 0,
        varPct: 0,
        portfolioValue: 0,
        computedAt: new Date().toISOString(),
      };
    }

    let varAbsolute = 0;

    if (method === 'HISTORICAL') {
      // Historical simulation: last 252 daily returns (stubbed synthetic)
      const dayCount = 252;

      // Generate synthetic portfolio-level daily P&L
      const portfolioPnLs: number[] = [];
      for (let d = 0; d < dayCount; d++) {
        let dayPnl = 0;
        for (const pos of positions) {
          const mv = Number(pos.market_value ?? 0);
          const ret = syntheticReturns(mv, 1)[0];
          dayPnl += ret;
        }
        portfolioPnLs.push(dayPnl);
      }

      // Sort losses ascending (most negative first)
      const sorted = [...portfolioPnLs].sort((a, b) => a - b);

      // Pick the loss at (1 - confidenceLevel) percentile
      const lossIdx = Math.floor((1 - confidenceLevel) * sorted.length);
      varAbsolute = Math.abs(sorted[Math.min(lossIdx, sorted.length - 1)]);

      // Scale for horizon
      varAbsolute = varAbsolute * Math.sqrt(horizon);
    } else if (method === 'PARAMETRIC') {
      // Parametric (Variance-Covariance) approach
      const zScore = Z_SCORES[confidenceLevel] ?? 1.645;

      // Compute portfolio mean and stddev from position-level synthetic returns
      const allReturns: number[] = [];
      for (const pos of positions) {
        const mv = Number(pos.market_value ?? 0);
        const returns = syntheticReturns(mv, 252);
        allReturns.push(...returns);
      }

      // Portfolio-level statistics
      const portReturns: number[] = [];
      const posCount = positions.length || 1;
      for (let d = 0; d < 252; d++) {
        let dayReturn = 0;
        for (let p = 0; p < posCount; p++) {
          dayReturn += allReturns[d * posCount + p] ?? 0;
        }
        portReturns.push(dayReturn);
      }

      const mean =
        portReturns.reduce((s, v) => s + v, 0) / portReturns.length;
      const variance =
        portReturns.reduce((s, v) => s + (v - mean) ** 2, 0) /
        portReturns.length;
      const stddev = Math.sqrt(variance);

      // VAR = |mean - z * stddev * sqrt(horizon)|
      varAbsolute = Math.abs(mean - zScore * stddev * Math.sqrt(horizon));
    } else {
      // Monte Carlo simulation
      const N = 10_000;

      // Estimate mean and stddev per position from synthetic data
      const posStats: { mean: number; stddev: number }[] = [];
      for (const pos of positions) {
        const mv = Number(pos.market_value ?? 0);
        const returns = syntheticReturns(mv, 252);
        const m = returns.reduce((s, v) => s + v, 0) / returns.length;
        const v =
          returns.reduce((s, r) => s + (r - m) ** 2, 0) / returns.length;
        posStats.push({ mean: m, stddev: Math.sqrt(v) });
      }

      // Generate N scenarios
      const scenarioPnLs: number[] = [];
      for (let i = 0; i < N; i++) {
        let pnl = 0;
        for (const ps of posStats) {
          pnl += randomNormal(ps.mean, ps.stddev) * Math.sqrt(horizon);
        }
        scenarioPnLs.push(pnl);
      }

      // Sort ascending
      scenarioPnLs.sort((a, b) => a - b);

      // Pick loss at (1 - confidenceLevel)
      const lossIdx = Math.floor((1 - confidenceLevel) * N);
      varAbsolute = Math.abs(scenarioPnLs[Math.min(lossIdx, N - 1)]);
    }

    const varPct =
      portfolioValue > 0 ? (varAbsolute / portfolioValue) * 100 : 0;

    return {
      portfolioId,
      method,
      confidenceLevel,
      horizon,
      var: Math.round(varAbsolute * 100) / 100,
      varPct: Math.round(varPct * 10000) / 10000,
      portfolioValue: Math.round(portfolioValue * 100) / 100,
      computedAt: new Date().toISOString(),
    };
  },

  /**
   * Back-test VaR predictions over a period.
   * Compares predicted VaR vs simulated actual P&L for each day.
   */
  async backTestVAR(
    portfolioId: string,
    period: number = 252,
  ): Promise<BackTestResult> {
    // Fetch current positions for base value
    const positions = await db
      .select({
        market_value: schema.positions.market_value,
      })
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let portfolioValue = 0;
    for (const pos of positions) {
      portfolioValue += Number(pos.market_value ?? 0);
    }

    const predictions: BackTestPrediction[] = [];
    let breachCount = 0;
    const baseDate = new Date();

    for (let d = 0; d < period; d++) {
      const dateStr = new Date(
        baseDate.getTime() - (period - d) * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      // Stub: predicted VaR at 95% 1-day
      const dailyVol = 0.015;
      const zScore = 1.645;
      const predictedVar =
        Math.round(portfolioValue * dailyVol * zScore * 100) / 100;

      // Stub: simulated actual P&L
      const actualPnl =
        Math.round(randomNormal(0, portfolioValue * dailyVol) * 100) / 100;

      const breached = actualPnl < -predictedVar;
      if (breached) breachCount++;

      predictions.push({
        date: dateStr,
        predictedVar,
        actualPnl,
        breached,
      });
    }

    return {
      portfolioId,
      period,
      predictions,
      breachCount,
      breachPct:
        period > 0
          ? Math.round((breachCount / period) * 10000) / 100
          : 0,
    };
  },

  /**
   * Compare theoretical yield income vs actual P&L over a period.
   *
   * Theoretical income = sum of coupon_rate * market_value * (period / 365)
   * Actual = sum of unrealized P&L changes (stubbed).
   */
  async backTestVsTheoreticalIncome(
    portfolioId: string,
    period: number = 90,
  ): Promise<IncomeBackTestResult> {
    // Fetch positions with security details for coupon info
    const positionsWithSec = await db
      .select({
        market_value: schema.positions.market_value,
        unrealized_pnl: schema.positions.unrealized_pnl,
        coupon_rate: schema.securities.coupon_rate,
        asset_class: schema.securities.asset_class,
      })
      .from(schema.positions)
      .innerJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let expectedIncome = 0;
    let actualIncome = 0;

    for (const pos of positionsWithSec) {
      const mv = Number(pos.market_value ?? 0);
      const coupon = Number(pos.coupon_rate ?? 0);

      // Theoretical: annualized coupon pro-rated over the period
      expectedIncome += (coupon / 100) * mv * (period / 365);

      // Actual: use unrealized P&L as proxy (stub)
      actualIncome += Number(pos.unrealized_pnl ?? 0) * (period / 365);
    }

    expectedIncome = Math.round(expectedIncome * 100) / 100;
    actualIncome = Math.round(actualIncome * 100) / 100;
    const variance = Math.round((actualIncome - expectedIncome) * 100) / 100;

    return {
      expected: expectedIncome,
      actual: actualIncome,
      variance,
    };
  },
};
