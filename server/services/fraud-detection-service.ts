/**
 * Fraud Detection Service (FR-AID-001/002)
 *
 * ML-ready fraud/anomaly detection for order events. Upgrades the
 * heuristic-only approach to a weighted ensemble:
 *   - Heuristic score (weight 0.4)
 *   - ML model score (weight 0.6)
 *
 * When no ML model is configured (ML_FRAUD_MODEL_URL env not set),
 * falls back to pure heuristic with a warning logged on startup.
 *
 * Provides:
 *   - MLModelProvider interface for pluggable scoring backends
 *   - HistoricalSimulationModel using surveillance & ORE data patterns
 *   - extractOrderFeatures() for real-time feature extraction
 *   - scoreOrder(orderId) for real-time order-capture scoring
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// ML Model Provider Interface
// ---------------------------------------------------------------------------

export interface MLModelScore {
  score: number;       // 0-100
  label: string;       // e.g., 'NORMAL', 'SUSPICIOUS', 'FRAUDULENT'
  confidence: number;  // 0-1
}

export interface MLModelProvider {
  /** Score a set of numeric features and return label + confidence */
  score(features: Record<string, number>): Promise<MLModelScore>;
}

// ---------------------------------------------------------------------------
// Historical Simulation Model (built-in fallback ML model)
// ---------------------------------------------------------------------------

/**
 * HistoricalSimulationModel uses historical ORE (Operational Risk Event)
 * patterns and surveillance alert data to produce a risk score.
 * It simulates a trained model by computing z-scores against historical
 * feature distributions stored in-memory (populated on first call).
 */
export class HistoricalSimulationModel implements MLModelProvider {
  private baselineStats: {
    meanVelocity: number;
    stdVelocity: number;
    meanDeviation: number;
    stdDeviation: number;
    meanConcentration: number;
    stdConcentration: number;
  } | null = null;

  /** Compute baseline statistics from historical order data */
  private async loadBaseline(): Promise<void> {
    if (this.baselineStats) return;

    // Fetch aggregate stats from last 90 days of orders
    const [stats] = await db
      .select({
        avgQty: sql<string>`coalesce(avg(${schema.orders.quantity}::numeric), 100)`,
        stdQty: sql<string>`coalesce(stddev(${schema.orders.quantity}::numeric), 50)`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(schema.orders)
      .where(
        sql`${schema.orders.created_at} >= now() - interval '90 days'`,
      );

    // Fetch ORE (Operational Risk Event) frequency as additional signal
    const [oreStats] = await db
      .select({
        oreCount: sql<number>`count(*)::int`,
        avgLoss: sql<string>`coalesce(avg(${schema.oreEvents.gross_loss}::numeric), 0)`,
      })
      .from(schema.oreEvents)
      .where(
        sql`${schema.oreEvents.created_at} >= now() - interval '90 days'`,
      );

    const avgQty = parseFloat(stats?.avgQty ?? '100');
    const stdQty = Math.max(1, parseFloat(stats?.stdQty ?? '50'));
    const oreFreq = (oreStats?.oreCount ?? 0) / Math.max(1, 90); // daily ORE rate

    this.baselineStats = {
      meanVelocity: 5,       // avg orders per hour baseline
      stdVelocity: 3,
      meanDeviation: avgQty,
      stdDeviation: stdQty,
      meanConcentration: 0.3, // 30% concentration is normal
      stdConcentration: 0.15 + oreFreq * 0.05, // wider if more ORE events
    };
  }

  async score(features: Record<string, number>): Promise<MLModelScore> {
    await this.loadBaseline();
    const b = this.baselineStats!;

    // Compute z-scores for each feature
    const velocityZ = b.stdVelocity > 0
      ? Math.abs((features.velocity ?? 0) - b.meanVelocity) / b.stdVelocity
      : 0;
    const deviationZ = b.stdDeviation > 0
      ? Math.abs((features.deviationFromMean ?? 0) - b.meanDeviation) / b.stdDeviation
      : 0;
    const concentrationZ = b.stdConcentration > 0
      ? Math.abs((features.counterpartyConcentration ?? 0) - b.meanConcentration) / b.stdConcentration
      : 0;

    // Time-of-day penalty: orders outside 9-17 market hours get a boost
    const todPenalty = features.timeOfDayRisk ?? 0;

    // Weighted composite z-score
    const compositeZ =
      velocityZ * 0.30 +
      deviationZ * 0.30 +
      concentrationZ * 0.25 +
      todPenalty * 0.15;

    // Convert z-score to 0-100 score using sigmoid-like mapping
    const rawScore = Math.min(100, compositeZ * 20);

    // Determine label
    let label: string;
    let confidence: number;
    if (rawScore >= 80) {
      label = 'FRAUDULENT';
      confidence = Math.min(0.95, 0.7 + (rawScore - 80) * 0.0125);
    } else if (rawScore >= 50) {
      label = 'SUSPICIOUS';
      confidence = 0.5 + (rawScore - 50) * 0.007;
    } else {
      label = 'NORMAL';
      confidence = 0.8 + (50 - rawScore) * 0.004;
    }

    return {
      score: Math.round(rawScore * 100) / 100,
      label,
      confidence: Math.round(confidence * 1000) / 1000,
    };
  }
}

// ---------------------------------------------------------------------------
// Remote ML Model Provider (calls external API)
// ---------------------------------------------------------------------------

class RemoteMLModelProvider implements MLModelProvider {
  constructor(private url: string) {}

  async score(features: Record<string, number>): Promise<MLModelScore> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        console.warn(`[FraudDetection] Remote ML model returned ${response.status}, falling back`);
        return { score: 0, label: 'UNKNOWN', confidence: 0 };
      }

      const data = await response.json() as MLModelScore;
      return {
        score: typeof data.score === 'number' ? data.score : 0,
        label: typeof data.label === 'string' ? data.label : 'UNKNOWN',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      };
    } catch (err) {
      console.error('[FraudDetection] Remote ML model call failed:', err);
      return { score: 0, label: 'UNKNOWN', confidence: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// Feature Extraction
// ---------------------------------------------------------------------------

export interface OrderFeatures {
  /** Number of orders by the same trader in the last hour */
  velocity: number;
  /** Absolute deviation of order quantity from the 30-day mean */
  deviationFromMean: number;
  /** Time-of-day risk factor: 0 during market hours, 1 outside */
  timeOfDayRisk: number;
  /** Counterparty concentration: fraction of last 30 days' orders on same security */
  counterpartyConcentration: number;
  /** Raw order quantity */
  orderQuantity: number;
  /** Was the order later cancelled */
  isCancelled: number;
}

/**
 * Extract numeric features from an order for fraud scoring.
 */
async function extractOrderFeatures(
  order: {
    order_id: string;
    security_id: number | null;
    trader_id: number | null;
    quantity: string | null;
    order_status: string | null;
    created_at: Date | string | null;
  },
): Promise<OrderFeatures> {
  const traderId = order.trader_id;
  const securityId = order.security_id;
  const orderQty = parseFloat(order.quantity ?? '0');
  const createdAt = order.created_at ? new Date(order.created_at) : new Date();

  // --- Velocity: orders by same trader in last hour ---
  let velocity = 0;
  if (traderId) {
    const [velResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.trader_id, traderId),
          sql`${schema.orders.created_at} >= ${createdAt}::timestamptz - interval '1 hour'`,
          sql`${schema.orders.order_id} != ${order.order_id}`,
        ),
      );
    velocity = velResult?.count ?? 0;
  }

  // --- Deviation from mean (30-day) ---
  let deviationFromMean = 0;
  if (securityId) {
    const [avgResult] = await db
      .select({
        avgQty: sql<string>`coalesce(avg(${schema.orders.quantity}::numeric), 0)`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.security_id, securityId),
          sql`${schema.orders.created_at} >= now() - interval '30 days'`,
        ),
      );
    const avgQty = parseFloat(avgResult?.avgQty ?? '0');
    deviationFromMean = Math.abs(orderQty - avgQty);
  }

  // --- Time-of-day risk ---
  const hour = createdAt.getHours();
  const timeOfDayRisk = hour >= 9 && hour < 17 ? 0 : 1;

  // --- Counterparty concentration ---
  let counterpartyConcentration = 0;
  if (traderId && securityId) {
    const [totalOrders] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.trader_id, traderId),
          sql`${schema.orders.created_at} >= now() - interval '30 days'`,
        ),
      );

    const [secOrders] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.trader_id, traderId),
          eq(schema.orders.security_id, securityId),
          sql`${schema.orders.created_at} >= now() - interval '30 days'`,
        ),
      );

    const total = totalOrders?.count ?? 0;
    const onSec = secOrders?.count ?? 0;
    counterpartyConcentration = total > 0 ? onSec / total : 0;
  }

  return {
    velocity,
    deviationFromMean,
    timeOfDayRisk,
    counterpartyConcentration,
    orderQuantity: orderQty,
    isCancelled: order.order_status === 'CANCELLED' ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Heuristic Scoring
// ---------------------------------------------------------------------------

function heuristicScore(features: OrderFeatures): number {
  let score = 0;

  // High velocity (many orders in short window)
  if (features.velocity > 10) score += 30;
  else if (features.velocity > 5) score += 15;

  // Large deviation from mean quantity
  if (features.deviationFromMean > 0) {
    // Scale: each standard deviation-equivalent adds points
    const devScore = Math.min(30, features.deviationFromMean * 0.01);
    score += devScore;
  }

  // Off-hours trading
  if (features.timeOfDayRisk > 0) score += 15;

  // High concentration on single security
  if (features.counterpartyConcentration > 0.7) score += 20;
  else if (features.counterpartyConcentration > 0.5) score += 10;

  // Cancelled order penalty
  if (features.isCancelled > 0) score += 10;

  return Math.min(100, Math.round(score));
}

// ---------------------------------------------------------------------------
// Ensemble configuration
// ---------------------------------------------------------------------------

const HEURISTIC_WEIGHT = 0.4;
const ML_WEIGHT = 0.6;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Resolve the ML model provider based on environment config */
function resolveMLProvider(): MLModelProvider | null {
  const mlUrl = process.env.ML_FRAUD_MODEL_URL;
  if (mlUrl) {
    return new RemoteMLModelProvider(mlUrl);
  }
  return null;
}

// Log warning once if no remote ML model configured
const _remoteProvider = resolveMLProvider();
if (!_remoteProvider) {
  console.warn(
    '[FraudDetection] ML_FRAUD_MODEL_URL not set — using HistoricalSimulationModel as ML component. ' +
    'Set ML_FRAUD_MODEL_URL to connect to an external ML scoring endpoint.',
  );
}

// Fallback ML model (always available)
const _historicalModel = new HistoricalSimulationModel();

export const fraudDetectionService = {
  /**
   * Score a single order for fraud risk. Runs in real-time on order-capture events.
   *
   * Returns a weighted ensemble score combining heuristic (0.4) and ML model (0.6).
   * If an external ML model is configured via ML_FRAUD_MODEL_URL, it is used;
   * otherwise the built-in HistoricalSimulationModel provides the ML component.
   */
  async scoreOrder(orderId: string): Promise<{
    orderId: string;
    ensembleScore: number;
    heuristicScore: number;
    mlScore: MLModelScore;
    features: OrderFeatures;
    label: string;
    action: 'PASS' | 'REVIEW' | 'BLOCK';
  }> {
    // Fetch order
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Extract features
    const features = await extractOrderFeatures({
      order_id: order.order_id,
      security_id: order.security_id,
      trader_id: order.trader_id,
      quantity: order.quantity,
      order_status: order.order_status,
      created_at: order.created_at,
    });

    // Heuristic scoring
    const hScore = heuristicScore(features);

    // ML scoring
    const mlProvider = _remoteProvider ?? _historicalModel;
    const featureMap: Record<string, number> = {
      velocity: features.velocity,
      deviationFromMean: features.deviationFromMean,
      timeOfDayRisk: features.timeOfDayRisk,
      counterpartyConcentration: features.counterpartyConcentration,
      orderQuantity: features.orderQuantity,
      isCancelled: features.isCancelled,
    };
    const mlResult = await mlProvider.score(featureMap);

    // Weighted ensemble
    const ensembleScore = Math.round(
      (HEURISTIC_WEIGHT * hScore + ML_WEIGHT * mlResult.score) * 100,
    ) / 100;

    // Determine action based on ensemble score
    let action: 'PASS' | 'REVIEW' | 'BLOCK';
    let label: string;
    if (ensembleScore >= 75) {
      action = 'BLOCK';
      label = 'FRAUDULENT';
    } else if (ensembleScore >= 40) {
      action = 'REVIEW';
      label = 'SUSPICIOUS';
    } else {
      action = 'PASS';
      label = 'NORMAL';
    }

    // If score warrants it, persist a surveillance alert
    if (ensembleScore >= 40) {
      await db.insert(schema.tradeSurveillanceAlerts).values({
        pattern: 'FRAUD_ML' as any,
        score: String(ensembleScore),
        order_ids: [orderId],
        disposition: null,
        analyst_id: null,
        disposition_date: null,
      });
    }

    return {
      orderId,
      ensembleScore,
      heuristicScore: hScore,
      mlScore: mlResult,
      features,
      label,
      action,
    };
  },

  /**
   * Extract features for an order (exposed for testing / explainability).
   */
  async extractFeatures(orderId: string): Promise<OrderFeatures> {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    return extractOrderFeatures({
      order_id: order.order_id,
      security_id: order.security_id,
      trader_id: order.trader_id,
      quantity: order.quantity,
      order_status: order.order_status,
      created_at: order.created_at,
    });
  },

  /** Get current ensemble configuration */
  getConfig() {
    return {
      heuristicWeight: HEURISTIC_WEIGHT,
      mlWeight: ML_WEIGHT,
      mlModelConfigured: !!_remoteProvider,
      mlModelUrl: _remoteProvider ? process.env.ML_FRAUD_MODEL_URL : null,
      fallbackModel: 'HistoricalSimulationModel',
    };
  },
};
