/**
 * FX Rate Service (TrustFees Pro — BRD Gap A02)
 *
 * Provides FX rates with in-memory caching and circuit breaker protection.
 * Staleness threshold: 4 hours.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { getBreaker } from './circuit-breaker';

const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CachedRate {
  mid_rate: number;
  fetchedAt: number;
  businessDate: string;
}

// In-memory cache: key = "FROM:TO:DATE"
const rateCache = new Map<string, CachedRate>();

const fxBreaker = getBreaker('fx-rate-db', {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
});

export const fxRateService = {
  /**
   * Get the FX rate for a currency pair on a business date.
   * Returns mid_rate and is_stale flag.
   */
  async getFxRate(
    fromCurrency: string,
    toCurrency: string,
    businessDate: string,
  ): Promise<{ mid_rate: number; is_stale: boolean }> {
    // Same currency -> 1:1
    if (fromCurrency === toCurrency) {
      return { mid_rate: 1, is_stale: false };
    }

    const cacheKey = `${fromCurrency}:${toCurrency}:${businessDate}`;

    // Check cache first
    const cached = rateCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      return {
        mid_rate: cached.mid_rate,
        is_stale: age > STALE_THRESHOLD_MS,
      };
    }

    // Query DB through circuit breaker
    try {
      const rate = await fxBreaker.call(async () => {
        // Try direct pair
        const [direct] = await db
          .select({ mid_rate: sql<string>`COALESCE(${schema.fxRates.mid_rate}::text, '0')` })
          .from(schema.fxRates)
          .where(
            and(
              eq(schema.fxRates.currency_from, fromCurrency),
              eq(schema.fxRates.currency_to, toCurrency),
              eq(schema.fxRates.business_date, businessDate),
            ),
          )
          .limit(1);

        if (direct && parseFloat(direct.mid_rate) > 0) {
          return parseFloat(direct.mid_rate);
        }

        // Try inverse pair
        const [inverse] = await db
          .select({ mid_rate: sql<string>`COALESCE(${schema.fxRates.mid_rate}::text, '0')` })
          .from(schema.fxRates)
          .where(
            and(
              eq(schema.fxRates.currency_from, toCurrency),
              eq(schema.fxRates.currency_to, fromCurrency),
              eq(schema.fxRates.business_date, businessDate),
            ),
          )
          .limit(1);

        if (inverse && parseFloat(inverse.mid_rate) > 0) {
          return 1 / parseFloat(inverse.mid_rate);
        }

        // Fallback: get latest rate regardless of date
        const [latest] = await db
          .select({ mid_rate: sql<string>`COALESCE(${schema.fxRates.mid_rate}::text, '0')` })
          .from(schema.fxRates)
          .where(
            and(
              eq(schema.fxRates.currency_from, fromCurrency),
              eq(schema.fxRates.currency_to, toCurrency),
            ),
          )
          .orderBy(desc(schema.fxRates.business_date))
          .limit(1);

        if (latest && parseFloat(latest.mid_rate) > 0) {
          return parseFloat(latest.mid_rate);
        }

        // No rate found — return 1 as default
        return 1;
      });

      // Cache the result
      rateCache.set(cacheKey, {
        mid_rate: rate,
        fetchedAt: Date.now(),
        businessDate,
      });

      return { mid_rate: rate, is_stale: false };
    } catch {
      // Circuit breaker is open or DB query failed — check for stale cache
      const staleKey = `${fromCurrency}:${toCurrency}`;
      for (const [key, value] of rateCache.entries()) {
        if (key.startsWith(staleKey)) {
          return { mid_rate: value.mid_rate, is_stale: true };
        }
      }

      // No cached data at all — return 1 with stale flag
      return { mid_rate: 1, is_stale: true };
    }
  },

  /** Clear the FX rate cache */
  clearCache() {
    rateCache.clear();
  },

  // ---------------------------------------------------------------------------
  // FR-CSH-003: FX Hedge Linkage CRUD
  // ---------------------------------------------------------------------------

  /** Create a new hedge linkage record */
  async createHedgeLinkage(data: {
    order_id?: string;
    settlement_id?: number;
    hedge_type: 'SPOT' | 'FORWARD' | 'NDF' | 'SWAP';
    currency_pair: string;
    notional_amount: number;
    forward_rate?: number;
    spot_rate?: number;
    maturity_date?: string;
    hedge_status?: string;
  }) {
    const [linkage] = await db
      .insert(schema.fxHedgeLinkages)
      .values({
        order_id: data.order_id ?? null,
        settlement_id: data.settlement_id ?? null,
        hedge_type: data.hedge_type,
        currency_pair: data.currency_pair,
        notional_amount: String(data.notional_amount),
        forward_rate: data.forward_rate != null ? String(data.forward_rate) : null,
        spot_rate: data.spot_rate != null ? String(data.spot_rate) : null,
        maturity_date: data.maturity_date ?? null,
        hedge_status: data.hedge_status ?? 'OPEN',
      })
      .returning();

    return linkage;
  },

  /** Get all hedge linkages for a given order */
  async getHedgesForOrder(orderId: string) {
    return db
      .select()
      .from(schema.fxHedgeLinkages)
      .where(eq(schema.fxHedgeLinkages.order_id, orderId))
      .orderBy(desc(schema.fxHedgeLinkages.created_at));
  },

  /** Get all hedge linkages for a given settlement instruction */
  async getHedgesForSettlement(settlementId: number) {
    return db
      .select()
      .from(schema.fxHedgeLinkages)
      .where(eq(schema.fxHedgeLinkages.settlement_id, settlementId))
      .orderBy(desc(schema.fxHedgeLinkages.created_at));
  },

  /**
   * Compute net unhedged exposure for an order.
   *
   * Exposure = order's FX settlement amount minus the sum of all OPEN hedge
   * notional amounts linked to the order.
   */
  async computeHedgeExposure(orderId: string) {
    // Fetch the order's FX settlement amount
    const [order] = await db
      .select({
        fx_settlement_amount: schema.orders.fx_settlement_amount,
        fx_currency_pair: schema.orders.fx_currency_pair,
        currency: schema.orders.currency,
        quantity: schema.orders.quantity,
      })
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const grossExposure = parseFloat(order.fx_settlement_amount ?? order.quantity ?? '0');

    // Sum all OPEN hedge notional amounts for this order
    const [hedgeSum] = await db
      .select({
        total_hedged: sql<string>`COALESCE(SUM(${schema.fxHedgeLinkages.notional_amount}), 0)`,
      })
      .from(schema.fxHedgeLinkages)
      .where(
        and(
          eq(schema.fxHedgeLinkages.order_id, orderId),
          eq(schema.fxHedgeLinkages.hedge_status, 'OPEN'),
        ),
      );

    const totalHedged = parseFloat(hedgeSum?.total_hedged ?? '0');
    const netUnhedged = grossExposure - totalHedged;
    const hedgeRatio = grossExposure > 0 ? totalHedged / grossExposure : 0;

    return {
      order_id: orderId,
      currency_pair: order.fx_currency_pair ?? order.currency,
      gross_exposure: grossExposure,
      total_hedged: totalHedged,
      net_unhedged: netUnhedged,
      hedge_ratio: hedgeRatio,
      fully_hedged: netUnhedged <= 0,
    };
  },
};
