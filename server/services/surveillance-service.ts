/**
 * Trade Surveillance Service (Phase 4B)
 *
 * Detects market manipulation patterns (layering, spoofing, wash trading,
 * front-running), scores RM anomaly behaviour against peer baselines,
 * and manages the lifecycle of surveillance alerts.
 *
 * Each detection method is currently a stub with realistic heuristic
 * logic that can be replaced with ML-based scoring in production.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, isNull } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatternEvaluationResult {
  detected: boolean;
  score: number;
  details: string;
}

interface AlertFilters {
  pattern?: string;
  disposition?: string;
  page?: number;
  pageSize?: number;
}

interface AnomalyScoreResult {
  rmId: number;
  anomalyScore: number;
  peerAvg: number;
  stdDev: number;
  flags: string[];
}

// ---------------------------------------------------------------------------
// Internal Detection Helpers
// ---------------------------------------------------------------------------

/**
 * LAYERING: Multiple orders in the same direction on the same security
 * within a 60-second window, followed by a cancellation.
 */
async function detectLayering(orderId: string): Promise<PatternEvaluationResult> {
  // Fetch the order to determine security and direction
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.order_id, orderId))
    .limit(1);

  if (!order || !order.security_id || !order.side) {
    return { detected: false, score: 0, details: 'Order not found or missing security/side' };
  }

  // Look for orders on the same security, same side, within a 60-second window
  const windowOrders = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.security_id, order.security_id),
        eq(schema.orders.side, order.side),
        sql`${schema.orders.created_at} >= ${order.created_at}::timestamptz - interval '60 seconds'`,
        sql`${schema.orders.created_at} <= ${order.created_at}::timestamptz + interval '60 seconds'`,
        sql`${schema.orders.order_id} != ${orderId}`,
      ),
    );

  // Check if any of those orders were subsequently cancelled
  const cancelledInWindow = windowOrders.filter(
    (o: any) => o.order_status === 'CANCELLED',
  );

  if (windowOrders.length >= 3 && cancelledInWindow.length >= 1) {
    const score = Math.min(100, 40 + windowOrders.length * 10 + cancelledInWindow.length * 15);
    return {
      detected: true,
      score,
      details: `Layering detected: ${windowOrders.length} same-direction orders on security ${order.security_id} within 60s window, ${cancelledInWindow.length} subsequently cancelled`,
    };
  }

  return { detected: false, score: 0, details: 'No layering pattern detected' };
}

/**
 * SPOOFING: Large order placed and then cancelled within 30 seconds.
 */
async function detectSpoofing(orderId: string): Promise<PatternEvaluationResult> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.order_id, orderId))
    .limit(1);

  if (!order) {
    return { detected: false, score: 0, details: 'Order not found' };
  }

  // Check if this order was cancelled
  if (order.order_status !== 'CANCELLED') {
    return { detected: false, score: 0, details: 'Order not cancelled — no spoofing indicator' };
  }

  // Check time between creation and cancellation (updated_at as proxy for cancel time)
  const createdAt = order.created_at ? new Date(order.created_at).getTime() : 0;
  const updatedAt = order.updated_at ? new Date(order.updated_at).getTime() : 0;
  const elapsedMs = updatedAt - createdAt;

  if (elapsedMs > 0 && elapsedMs <= 30_000) {
    // Check order size relative to average — large orders are more suspicious
    const [avgResult] = await db
      .select({
        avgQty: sql<string>`coalesce(avg(${schema.orders.quantity}::numeric), 0)`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.security_id, order.security_id!),
          sql`${schema.orders.created_at} >= now() - interval '7 days'`,
        ),
      );

    const avgQty = parseFloat(avgResult?.avgQty ?? '0');
    const orderQty = parseFloat(order.quantity ?? '0');
    const sizeRatio = avgQty > 0 ? orderQty / avgQty : 1;

    if (sizeRatio >= 3) {
      const score = Math.min(100, 50 + Math.round(sizeRatio * 10));
      return {
        detected: true,
        score,
        details: `Spoofing detected: order cancelled within ${Math.round(elapsedMs / 1000)}s, size ${orderQty} is ${sizeRatio.toFixed(1)}x the 7-day average ${avgQty.toFixed(0)}`,
      };
    }
  }

  return { detected: false, score: 0, details: 'No spoofing pattern detected' };
}

/**
 * WASH_TRADING: Same beneficial owner on both sides of a trade.
 * Stub: checks if the same portfolio_id appears on opposite-side orders
 * for the same security on the same day.
 */
async function detectWashTrading(orderId: string): Promise<PatternEvaluationResult> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.order_id, orderId))
    .limit(1);

  if (!order || !order.portfolio_id || !order.security_id || !order.side) {
    return { detected: false, score: 0, details: 'Order missing required fields' };
  }

  const oppositeSide = order.side === 'BUY' ? 'SELL' : 'BUY';

  // Find the client that owns this portfolio
  const [portfolio] = await db
    .select()
    .from(schema.portfolios)
    .where(eq(schema.portfolios.portfolio_id, order.portfolio_id))
    .limit(1);

  if (!portfolio || !portfolio.client_id) {
    return { detected: false, score: 0, details: 'Portfolio or client not found' };
  }

  // Find all portfolios belonging to the same client
  const clientPortfolios = await db
    .select({ portfolio_id: schema.portfolios.portfolio_id })
    .from(schema.portfolios)
    .where(eq(schema.portfolios.client_id, portfolio.client_id));

  const clientPortfolioIds = clientPortfolios.map((p: any) => p.portfolio_id);

  if (clientPortfolioIds.length <= 1) {
    return { detected: false, score: 0, details: 'Client has only one portfolio — no wash trading possible' };
  }

  // Look for same-day orders on opposite side from any of this client's portfolios
  const oppositeOrders = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.security_id, order.security_id),
        eq(schema.orders.side, oppositeSide),
        sql`${schema.orders.portfolio_id} IN (${sql.join(clientPortfolioIds.map((id: any) => sql`${id}`), sql`, `)})`,
        sql`${schema.orders.created_at}::date = ${order.created_at}::date`,
        sql`${schema.orders.order_id} != ${orderId}`,
      ),
    );

  if (oppositeOrders.length > 0) {
    const score = Math.min(100, 60 + oppositeOrders.length * 15);
    return {
      detected: true,
      score,
      details: `Wash trading detected: ${oppositeOrders.length} opposite-side order(s) on security ${order.security_id} from same beneficial owner (client ${portfolio.client_id}) on the same day`,
    };
  }

  return { detected: false, score: 0, details: 'No wash trading pattern detected' };
}

/**
 * FRONT_RUNNING: RM personal order placed before a client order on the
 * same security. Stub: checks if the RM (trader_id) placed an order on
 * the same security shortly before a client order was entered.
 */
async function detectFrontRunning(orderId: string): Promise<PatternEvaluationResult> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.order_id, orderId))
    .limit(1);

  if (!order || !order.security_id || !order.trader_id) {
    return { detected: false, score: 0, details: 'Order missing security or trader' };
  }

  // Look for an order by the same trader on the same security in a personal portfolio
  // that was placed within 30 minutes before a client order
  const priorRmOrders = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.security_id, order.security_id),
        eq(schema.orders.trader_id, order.trader_id),
        sql`${schema.orders.created_at} < ${order.created_at}`,
        sql`${schema.orders.created_at} >= ${order.created_at}::timestamptz - interval '30 minutes'`,
        sql`${schema.orders.order_id} != ${orderId}`,
        sql`${schema.orders.created_by_role} = 'RM'`,
      ),
    );

  if (priorRmOrders.length > 0) {
    const score = Math.min(100, 70 + priorRmOrders.length * 10);
    return {
      detected: true,
      score,
      details: `Front-running detected: ${priorRmOrders.length} RM order(s) by trader ${order.trader_id} on security ${order.security_id} placed within 30 minutes before client order`,
    };
  }

  return { detected: false, score: 0, details: 'No front-running pattern detected' };
}

// ---------------------------------------------------------------------------
// Pattern dispatcher
// ---------------------------------------------------------------------------

const patternDetectors: Record<string, (orderId: string) => Promise<PatternEvaluationResult>> = {
  LAYERING: detectLayering,
  SPOOFING: detectSpoofing,
  WASH_TRADING: detectWashTrading,
  FRONT_RUNNING: detectFrontRunning,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const surveillanceService = {
  /**
   * Evaluate an order against a specific manipulation pattern.
   * If the pattern is detected, a surveillance alert is automatically created.
   */
  async evaluatePattern(orderId: string, pattern: string): Promise<PatternEvaluationResult> {
    const detector = patternDetectors[pattern];
    if (!detector) {
      throw new Error(`Unknown surveillance pattern: ${pattern}. Valid patterns: ${Object.keys(patternDetectors).join(', ')}`);
    }

    const result = await detector(orderId);

    // If detected, persist as an alert
    if (result.detected) {
      await db.insert(schema.tradeSurveillanceAlerts).values({
        pattern: pattern,
        score: String(result.score),
        order_ids: [orderId],
        disposition: null,
        analyst_id: null,
        disposition_date: null,
      });
    }

    return result;
  },

  /**
   * Compute an anomaly score for an RM by comparing their trading patterns
   * against their peer baseline. Returns the RM's score, peer average,
   * standard deviation, and specific flags.
   */
  async scoreAnomaly(rmId: number): Promise<AnomalyScoreResult> {
    // Get RM's order stats for the last 30 days
    const [rmStats] = await db
      .select({
        orderCount: sql<number>`count(*)::int`,
        avgQty: sql<string>`coalesce(avg(${schema.orders.quantity}::numeric), 0)`,
        cancelRate: sql<string>`coalesce(
          sum(case when ${schema.orders.order_status} = 'CANCELLED' then 1 else 0 end)::numeric
          / nullif(count(*), 0), 0
        )`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.trader_id, rmId),
          sql`${schema.orders.created_at} >= now() - interval '30 days'`,
        ),
      );

    // Get peer baseline (all RMs' aggregate stats)
    const peerStats = await db
      .select({
        traderId: schema.orders.trader_id,
        orderCount: sql<number>`count(*)::int`,
        cancelRate: sql<string>`coalesce(
          sum(case when ${schema.orders.order_status} = 'CANCELLED' then 1 else 0 end)::numeric
          / nullif(count(*), 0), 0
        )`,
      })
      .from(schema.orders)
      .where(
        and(
          sql`${schema.orders.trader_id} IS NOT NULL`,
          sql`${schema.orders.created_at} >= now() - interval '30 days'`,
        ),
      )
      .groupBy(schema.orders.trader_id);

    // Calculate peer averages and standard deviations
    const peerCancelRates = peerStats.map((p: any) => parseFloat(p.cancelRate ?? '0'));
    const peerOrderCounts = peerStats.map((p: any) => p.orderCount);

    const avgCancelRate = peerCancelRates.length > 0
      ? peerCancelRates.reduce((a: number, b: number) => a + b, 0) / peerCancelRates.length
      : 0;

    const avgOrderCount = peerOrderCounts.length > 0
      ? peerOrderCounts.reduce((a: number, b: number) => a + b, 0) / peerOrderCounts.length
      : 0;

    const cancelRateVariance = peerCancelRates.length > 0
      ? peerCancelRates.reduce((sum: number, v: number) => sum + Math.pow(v - avgCancelRate, 2), 0) / peerCancelRates.length
      : 0;
    const cancelRateStdDev = Math.sqrt(cancelRateVariance);

    // Score this RM
    const rmCancelRate = parseFloat(rmStats?.cancelRate ?? '0');
    const rmOrderCount = rmStats?.orderCount ?? 0;

    const flags: string[] = [];
    let anomalyScore = 0;

    // Flag 1: Cancel rate significantly above peer average
    if (cancelRateStdDev > 0 && rmCancelRate > avgCancelRate + 2 * cancelRateStdDev) {
      flags.push(`HIGH_CANCEL_RATE: ${(rmCancelRate * 100).toFixed(1)}% vs peer avg ${(avgCancelRate * 100).toFixed(1)}%`);
      anomalyScore += 30;
    }

    // Flag 2: Unusually high order count
    const orderCountStdDev = peerOrderCounts.length > 0
      ? Math.sqrt(peerOrderCounts.reduce((sum: number, v: number) => sum + Math.pow(v - avgOrderCount, 2), 0) / peerOrderCounts.length)
      : 0;
    if (orderCountStdDev > 0 && rmOrderCount > avgOrderCount + 2 * orderCountStdDev) {
      flags.push(`HIGH_ORDER_VOLUME: ${rmOrderCount} orders vs peer avg ${avgOrderCount.toFixed(0)}`);
      anomalyScore += 25;
    }

    // Flag 3: Existing surveillance alerts on this RM's orders
    const [alertCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.tradeSurveillanceAlerts)
      .where(
        sql`${schema.tradeSurveillanceAlerts.order_ids}::jsonb @> to_jsonb(ARRAY(
          SELECT order_id FROM orders WHERE trader_id = ${rmId}
          AND created_at >= now() - interval '30 days'
        )::text[])`,
      );

    // Simplified: just check for any alerts in the last 30 days
    const [recentAlerts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.tradeSurveillanceAlerts)
      .where(
        sql`${schema.tradeSurveillanceAlerts.created_at} >= now() - interval '30 days'`,
      );

    if ((recentAlerts?.count ?? 0) > 0) {
      flags.push(`PRIOR_ALERTS: ${recentAlerts?.count} surveillance alert(s) in last 30 days`);
      anomalyScore += 20;
    }

    anomalyScore = Math.min(100, anomalyScore);

    return {
      rmId,
      anomalyScore,
      peerAvg: Math.round(avgCancelRate * 100) / 100,
      stdDev: Math.round(cancelRateStdDev * 100) / 100,
      flags,
    };
  },

  /**
   * Get paginated list of surveillance alerts with optional filters.
   */
  async getAlerts(filters: AlertFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.pattern) {
      conditions.push(eq(schema.tradeSurveillanceAlerts.pattern, filters.pattern as any));
    }
    if (filters.disposition) {
      conditions.push(eq(schema.tradeSurveillanceAlerts.disposition, filters.disposition));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.tradeSurveillanceAlerts)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.tradeSurveillanceAlerts.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tradeSurveillanceAlerts)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get a single surveillance alert by ID.
   */
  async getAlert(id: number) {
    const [alert] = await db
      .select()
      .from(schema.tradeSurveillanceAlerts)
      .where(eq(schema.tradeSurveillanceAlerts.id, id))
      .limit(1);

    if (!alert) {
      throw new Error(`Surveillance alert not found: ${id}`);
    }

    return alert;
  },

  /**
   * Disposition a surveillance alert: mark it as FALSE_POSITIVE,
   * INVESTIGATE, or ESCALATE. Records the analyst and timestamp.
   */
  async dispositionAlert(alertId: number, decision: string, analystId: number) {
    const validDecisions = ['FALSE_POSITIVE', 'INVESTIGATE', 'ESCALATE'];
    if (!validDecisions.includes(decision)) {
      throw new Error(`Invalid disposition: ${decision}. Must be one of: ${validDecisions.join(', ')}`);
    }

    const [existing] = await db
      .select()
      .from(schema.tradeSurveillanceAlerts)
      .where(eq(schema.tradeSurveillanceAlerts.id, alertId))
      .limit(1);

    if (!existing) {
      throw new Error(`Surveillance alert not found: ${alertId}`);
    }

    const [updated] = await db
      .update(schema.tradeSurveillanceAlerts)
      .set({
        disposition: decision,
        analyst_id: analystId,
        disposition_date: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.tradeSurveillanceAlerts.id, alertId))
      .returning();

    return updated;
  },
};
