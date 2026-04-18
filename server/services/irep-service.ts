/**
 * IREP (Investment Risk Evaluation Process) Service (Phase 3J)
 *
 * BDO RFI Gap #6 — Risk Analytics.
 * Captures client dispositions on price movements,
 * monitors security price movement thresholds,
 * and provides an IREP dashboard.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface ClientDisposition {
  clientId: string;
  priceMovementPct: number;
  disposition: 'HOLD' | 'SELL' | 'BUY_MORE';
  capturedAt: string;
}

interface PriceMovementCheck {
  securityId: number;
  ticker: string | null;
  currentPrice: number;
  previousPrice: number;
  changePct: number;
  breached: boolean;
  threshold: number;
}

interface IREPDashboard {
  flaggedSecurities: number;
  totalMonitored: number;
  recentDispositions: ClientDisposition[];
  lastChecked: string;
}

// ---------------------------------------------------------------------------
// In-memory store (stub for client dispositions)
// In production, persist to a dedicated table.
// ---------------------------------------------------------------------------

const dispositionStore: ClientDisposition[] = [];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const irepService = {
  /**
   * Capture a client's disposition in response to a price movement.
   * Stub: stores in memory. Production would persist to DB.
   */
  async captureClientDisposition(
    clientId: string,
    priceMovementPct: number,
    disposition: 'HOLD' | 'SELL' | 'BUY_MORE',
  ): Promise<ClientDisposition> {
    // Validate client exists
    const [client] = await db
      .select({ client_id: schema.clients.client_id })
      .from(schema.clients)
      .where(eq(schema.clients.client_id, clientId))
      .limit(1);

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    const record: ClientDisposition = {
      clientId,
      priceMovementPct,
      disposition,
      capturedAt: new Date().toISOString(),
    };

    dispositionStore.push(record);

    return record;
  },

  /**
   * Check if a security's latest price movement exceeds a threshold.
   * Compares the two most recent pricing records.
   */
  async checkPriceMovementThreshold(
    securityId: number,
    threshold: number = 5,
  ): Promise<PriceMovementCheck> {
    // Fetch the two most recent pricing records for the security
    const prices = await db
      .select({
        close_price: schema.pricingRecords.close_price,
        price_date: schema.pricingRecords.price_date,
      })
      .from(schema.pricingRecords)
      .where(eq(schema.pricingRecords.security_id, securityId))
      .orderBy(desc(schema.pricingRecords.price_date))
      .limit(2);

    // Fetch security ticker
    const [security] = await db
      .select({ ticker: schema.securities.bloomberg_ticker })
      .from(schema.securities)
      .where(eq(schema.securities.id, securityId))
      .limit(1);

    const ticker = security?.ticker ?? null;

    if (prices.length < 2) {
      const currentPrice = prices.length > 0 ? Number(prices[0].close_price ?? 0) : 0;
      return {
        securityId,
        ticker,
        currentPrice,
        previousPrice: 0,
        changePct: 0,
        breached: false,
        threshold,
      };
    }

    const currentPrice = Number(prices[0].close_price ?? 0);
    const previousPrice = Number(prices[1].close_price ?? 0);

    const changePct =
      previousPrice !== 0
        ? ((currentPrice - previousPrice) / previousPrice) * 100
        : 0;

    const breached = Math.abs(changePct) > threshold;

    return {
      securityId,
      ticker,
      currentPrice: Math.round(currentPrice * 10000) / 10000,
      previousPrice: Math.round(previousPrice * 10000) / 10000,
      changePct: Math.round(changePct * 10000) / 10000,
      breached,
      threshold,
    };
  },

  /**
   * Aggregate IREP dashboard view.
   * Scans all active securities for significant price moves and
   * summarises recent client dispositions.
   */
  async getIREPDashboard(): Promise<IREPDashboard> {
    const defaultThreshold = 5;

    // Fetch all active securities
    const activeSecs = await db
      .select({ id: schema.securities.id })
      .from(schema.securities)
      .where(eq(schema.securities.is_active, true));

    let flaggedCount = 0;

    for (const sec of activeSecs) {
      const check = await this.checkPriceMovementThreshold(
        sec.id,
        defaultThreshold,
      );
      if (check.breached) {
        flaggedCount++;
      }
    }

    // Recent dispositions — last 50
    const recentDispositions = dispositionStore
      .slice(-50)
      .reverse();

    return {
      flaggedSecurities: flaggedCount,
      totalMonitored: activeSecs.length,
      recentDispositions,
      lastChecked: new Date().toISOString(),
    };
  },
};
