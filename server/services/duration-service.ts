/**
 * Duration Service (Phase 3J)
 *
 * BDO RFI Gap #6 — Risk Analytics.
 * Computes Macaulay Duration, Modified Duration, and
 * Benchmark Duration for fixed-income portfolios.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface DurationPosition {
  securityId: number;
  ticker: string | null;
  duration: number;
  weight: number;
}

interface MacaulayDurationResult {
  portfolioId: string;
  macaulayDuration: number;
  weightedPositions: DurationPosition[];
  asOfDate: string;
}

interface ModifiedDurationResult {
  portfolioId: string;
  modifiedDuration: number;
  macaulayDuration: number;
  weightedPositions: DurationPosition[];
  asOfDate: string;
}

interface BenchmarkDurationResult {
  benchmarkId: string;
  macaulayDuration: number;
  modifiedDuration: number;
  asOfDate: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simplified Macaulay Duration for a single bond.
 *
 * Uses the closed-form approximation:
 *   D = (1 + y/f) / (y/f)  -  (1 + y/f + T*(c/f - y/f)) / (c/f * ((1 + y/f)^(T*f) - 1) + y/f)
 *
 * For simplicity (stub), we use the shortcut:
 *   D = [ (1+y) / y ] - [ (1+y + T*(c - y)) / (c * ((1+y)^T - 1) + y) ]
 *
 * where c = coupon rate (decimal), y = yield (decimal), T = years to maturity,
 * assuming annual frequency.
 */
function computeSingleBondDuration(
  couponRate: number,
  yieldRate: number,
  yearsToMaturity: number,
  frequency: number = 1,
): number {
  if (yearsToMaturity <= 0) return 0;
  if (couponRate <= 0) return yearsToMaturity; // Zero-coupon

  const c = couponRate / frequency;
  const y = yieldRate / frequency;
  const n = yearsToMaturity * frequency;

  if (y <= 0) {
    // When yield is zero, use weighted average of coupon timings
    const totalPeriods = Math.ceil(n);
    let numerator = 0;
    let denominator = 0;
    for (let t = 1; t <= totalPeriods; t++) {
      const cf = t < totalPeriods ? c : c + 1;
      numerator += t * cf;
      denominator += cf;
    }
    return denominator > 0 ? numerator / denominator / frequency : yearsToMaturity;
  }

  // Standard Macaulay Duration formula using present value of cash flows
  const totalPeriods = Math.ceil(n);
  let pvWeightedSum = 0;
  let pvSum = 0;

  for (let t = 1; t <= totalPeriods; t++) {
    const cf = t < totalPeriods ? c : c + 1; // Last period includes principal
    const discountFactor = Math.pow(1 + y, -t);
    pvWeightedSum += t * cf * discountFactor;
    pvSum += cf * discountFactor;
  }

  if (pvSum === 0) return yearsToMaturity;

  // Convert from periods to years
  return pvWeightedSum / pvSum / frequency;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const durationService = {
  /**
   * Compute portfolio-level Macaulay Duration.
   * Only considers fixed-income positions (BOND, FIXED_INCOME).
   */
  async computeMacaulayDuration(
    portfolioId: string,
    asOfDate?: string,
  ): Promise<MacaulayDurationResult> {
    const effectiveDate = asOfDate ?? new Date().toISOString().slice(0, 10);

    // Fetch fixed-income positions with security data
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        market_value: schema.positions.market_value,
        ticker: schema.securities.bloomberg_ticker,
        asset_class: schema.securities.asset_class,
        coupon_rate: schema.securities.coupon_rate,
        maturity_date: schema.securities.maturity_date,
        yield_rate: schema.securities.yield_rate,
        coupon_frequency: schema.securities.coupon_frequency,
      })
      .from(schema.positions)
      .innerJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // Filter to fixed-income only
    const fixedIncomeClasses = ['BOND', 'FIXED_INCOME', 'GOVERNMENT_BOND', 'CORPORATE_BOND'];
    const fiPositions = positions.filter(
      (p: any) => p.asset_class && fixedIncomeClasses.includes(p.asset_class.toUpperCase()),
    );

    // Compute total market value of fixed-income positions
    let totalMV = 0;
    for (const pos of fiPositions) {
      totalMV += Number(pos.market_value ?? 0);
    }

    const weightedPositions: DurationPosition[] = [];
    let portfolioDuration = 0;

    for (const pos of fiPositions) {
      const mv = Number(pos.market_value ?? 0);
      const weight = totalMV > 0 ? mv / totalMV : 0;
      const coupon = Number(pos.coupon_rate ?? 0) / 100;
      const yld = Number(pos.yield_rate ?? pos.coupon_rate ?? 0) / 100;
      const frequency = Number(pos.coupon_frequency ?? 2); // default semi-annual

      // Years to maturity
      let yearsToMaturity = 5; // default stub
      if (pos.maturity_date) {
        const matDate = new Date(pos.maturity_date);
        const asOf = new Date(effectiveDate);
        yearsToMaturity = Math.max(
          0,
          (matDate.getTime() - asOf.getTime()) / (365.25 * 86_400_000),
        );
      }

      const duration = computeSingleBondDuration(coupon, yld, yearsToMaturity, frequency);

      weightedPositions.push({
        securityId: pos.security_id!,
        ticker: pos.ticker,
        duration: Math.round(duration * 10000) / 10000,
        weight: Math.round(weight * 10000) / 10000,
      });

      portfolioDuration += duration * weight;
    }

    return {
      portfolioId,
      macaulayDuration: Math.round(portfolioDuration * 10000) / 10000,
      weightedPositions,
      asOfDate: effectiveDate,
    };
  },

  /**
   * Compute portfolio-level Modified Duration.
   * modifiedDuration = macaulayDuration / (1 + yield / frequency)
   */
  async computeModifiedDuration(
    portfolioId: string,
    asOfDate?: string,
  ): Promise<ModifiedDurationResult> {
    const macResult = await this.computeMacaulayDuration(portfolioId, asOfDate);

    // Compute weighted average yield and frequency from positions
    const positions = await db
      .select({
        market_value: schema.positions.market_value,
        yield_rate: schema.securities.yield_rate,
        coupon_rate: schema.securities.coupon_rate,
        coupon_frequency: schema.securities.coupon_frequency,
        asset_class: schema.securities.asset_class,
      })
      .from(schema.positions)
      .innerJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .where(eq(schema.positions.portfolio_id, portfolioId));

    const fixedIncomeClasses = ['BOND', 'FIXED_INCOME', 'GOVERNMENT_BOND', 'CORPORATE_BOND'];
    const fiPositions = positions.filter(
      (p: any) => p.asset_class && fixedIncomeClasses.includes(p.asset_class.toUpperCase()),
    );

    let totalMV = 0;
    let weightedYield = 0;
    let weightedFreq = 0;

    for (const pos of fiPositions) {
      const mv = Number(pos.market_value ?? 0);
      const yld = Number(pos.yield_rate ?? pos.coupon_rate ?? 0) / 100;
      const freq = Number(pos.coupon_frequency ?? 2);
      totalMV += mv;
      weightedYield += yld * mv;
      weightedFreq += freq * mv;
    }

    const avgYield = totalMV > 0 ? weightedYield / totalMV : 0.05;
    const avgFreq = totalMV > 0 ? weightedFreq / totalMV : 2;

    const modifiedDuration =
      macResult.macaulayDuration / (1 + avgYield / avgFreq);

    // Recompute position-level modified durations
    const modPositions: DurationPosition[] = macResult.weightedPositions.map(
      (wp) => ({
        securityId: wp.securityId,
        ticker: wp.ticker,
        duration:
          Math.round(
            (wp.duration / (1 + avgYield / avgFreq)) * 10000,
          ) / 10000,
        weight: wp.weight,
      }),
    );

    return {
      portfolioId,
      modifiedDuration: Math.round(modifiedDuration * 10000) / 10000,
      macaulayDuration: macResult.macaulayDuration,
      weightedPositions: modPositions,
      asOfDate: macResult.asOfDate,
    };
  },

  /**
   * Compute benchmark duration (stub).
   * Returns simulated benchmark duration metrics.
   */
  async computeBenchmarkDuration(
    benchmarkId: string,
    asOfDate?: string,
  ): Promise<BenchmarkDurationResult> {
    const effectiveDate = asOfDate ?? new Date().toISOString().slice(0, 10);

    // Stub: return simulated benchmark duration values
    // In production this would query an external benchmark data source
    const macaulayDuration = 4.85;
    const avgYield = 0.055;
    const avgFreq = 2;
    const modifiedDuration = macaulayDuration / (1 + avgYield / avgFreq);

    return {
      benchmarkId,
      macaulayDuration: Math.round(macaulayDuration * 10000) / 10000,
      modifiedDuration: Math.round(modifiedDuration * 10000) / 10000,
      asOfDate: effectiveDate,
    };
  },
};
