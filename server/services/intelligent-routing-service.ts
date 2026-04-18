/**
 * Intelligent Order Routing Service (Phase 6C)
 *
 * Smart broker selection engine for the Philippine equities market.
 * Scores brokers by historical fill rate, slippage, commission, and latency
 * to produce ranked recommendations. Maintains routing decision logs and
 * per-broker execution quality analytics with monthly trends.
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrokerProfile {
  brokerId: string;
  brokerName: string;
  fillRate: number;
  avgSlippage: number;
  commission: number;
  avgLatencyMs: number;
  specializations: string[];
  monthlyTrend: { month: string; fillRate: number; slippage: number }[];
  volumeHandled: number;
  rejectionRate: number;
  active: boolean;
}

interface BrokerRecommendation {
  brokerId: string;
  brokerName: string;
  score: number;
  fillRate: number;
  avgSlippage: number;
  commission: number;
  avgLatencyMs: number;
  specializations: string[];
}

interface RecommendationResult {
  recommendations: BrokerRecommendation[];
  bestPick: string;
  reasoning: string;
}

interface ExecutionQuality {
  brokerId: string;
  brokerName: string;
  fillRate: number;
  avgSlippage: number;
  avgLatencyMs: number;
  volumeHandled: number;
  rejectionRate: number;
  monthlyTrend: { month: string; fillRate: number; slippage: number }[];
}

interface RoutingDecision {
  decisionId: string;
  securityId: number;
  securityName: string;
  quantity: number;
  side: string;
  selectedBrokerId: string;
  selectedBrokerName: string;
  score: number;
  alternativeCount: number;
  reasoning: string;
  outcome: 'PENDING' | 'FILLED' | 'PARTIAL' | 'REJECTED';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mock broker data — Philippine brokers
// ---------------------------------------------------------------------------

const BROKERS: BrokerProfile[] = [
  {
    brokerId: 'BRK-COL',
    brokerName: 'COL Financial',
    fillRate: 0.965,
    avgSlippage: 0.0012,
    commission: 0.0025,
    avgLatencyMs: 42,
    specializations: ['EQUITIES', 'SMALL_CAP', 'RETAIL'],
    volumeHandled: 245000000,
    rejectionRate: 0.008,
    active: true,
    monthlyTrend: [
      { month: '2026-01', fillRate: 0.958, slippage: 0.0014 },
      { month: '2026-02', fillRate: 0.962, slippage: 0.0013 },
      { month: '2026-03', fillRate: 0.968, slippage: 0.0011 },
      { month: '2026-04', fillRate: 0.971, slippage: 0.0010 },
    ],
  },
  {
    brokerId: 'BRK-FMETRO',
    brokerName: 'First Metro Securities',
    fillRate: 0.978,
    avgSlippage: 0.0008,
    commission: 0.0020,
    avgLatencyMs: 35,
    specializations: ['EQUITIES', 'FIXED_INCOME', 'INSTITUTIONAL'],
    volumeHandled: 380000000,
    rejectionRate: 0.005,
    active: true,
    monthlyTrend: [
      { month: '2026-01', fillRate: 0.975, slippage: 0.0009 },
      { month: '2026-02', fillRate: 0.977, slippage: 0.0008 },
      { month: '2026-03', fillRate: 0.980, slippage: 0.0007 },
      { month: '2026-04', fillRate: 0.979, slippage: 0.0008 },
    ],
  },
  {
    brokerId: 'BRK-BPI',
    brokerName: 'BPI Trade',
    fillRate: 0.952,
    avgSlippage: 0.0015,
    commission: 0.0025,
    avgLatencyMs: 48,
    specializations: ['EQUITIES', 'RETAIL', 'BLUE_CHIP'],
    volumeHandled: 195000000,
    rejectionRate: 0.012,
    active: true,
    monthlyTrend: [
      { month: '2026-01', fillRate: 0.948, slippage: 0.0017 },
      { month: '2026-02', fillRate: 0.951, slippage: 0.0016 },
      { month: '2026-03', fillRate: 0.954, slippage: 0.0014 },
      { month: '2026-04', fillRate: 0.955, slippage: 0.0013 },
    ],
  },
  {
    brokerId: 'BRK-ABACUS',
    brokerName: 'Abacus Securities',
    fillRate: 0.941,
    avgSlippage: 0.0018,
    commission: 0.0022,
    avgLatencyMs: 55,
    specializations: ['EQUITIES', 'SMALL_CAP', 'MINING'],
    volumeHandled: 120000000,
    rejectionRate: 0.015,
    active: true,
    monthlyTrend: [
      { month: '2026-01', fillRate: 0.935, slippage: 0.0021 },
      { month: '2026-02', fillRate: 0.939, slippage: 0.0019 },
      { month: '2026-03', fillRate: 0.943, slippage: 0.0017 },
      { month: '2026-04', fillRate: 0.946, slippage: 0.0016 },
    ],
  },
  {
    brokerId: 'BRK-CLSA',
    brokerName: 'CLSA Philippines',
    fillRate: 0.988,
    avgSlippage: 0.0005,
    commission: 0.0015,
    avgLatencyMs: 28,
    specializations: ['EQUITIES', 'LARGE_CAP', 'INSTITUTIONAL', 'CROSS_BORDER'],
    volumeHandled: 520000000,
    rejectionRate: 0.003,
    active: true,
    monthlyTrend: [
      { month: '2026-01', fillRate: 0.986, slippage: 0.0006 },
      { month: '2026-02', fillRate: 0.987, slippage: 0.0005 },
      { month: '2026-03', fillRate: 0.989, slippage: 0.0005 },
      { month: '2026-04', fillRate: 0.990, slippage: 0.0004 },
    ],
  },
  {
    brokerId: 'BRK-MAYBANK',
    brokerName: 'Maybank ATR Kim Eng',
    fillRate: 0.971,
    avgSlippage: 0.0010,
    commission: 0.0018,
    avgLatencyMs: 38,
    specializations: ['EQUITIES', 'FIXED_INCOME', 'DERIVATIVES', 'ASEAN'],
    volumeHandled: 310000000,
    rejectionRate: 0.006,
    active: true,
    monthlyTrend: [
      { month: '2026-01', fillRate: 0.968, slippage: 0.0012 },
      { month: '2026-02', fillRate: 0.970, slippage: 0.0011 },
      { month: '2026-03', fillRate: 0.973, slippage: 0.0009 },
      { month: '2026-04', fillRate: 0.974, slippage: 0.0009 },
    ],
  },
  {
    brokerId: 'BRK-SB',
    brokerName: 'SB Equities',
    fillRate: 0.934,
    avgSlippage: 0.0020,
    commission: 0.0028,
    avgLatencyMs: 62,
    specializations: ['EQUITIES', 'RETAIL', 'PROPERTY'],
    volumeHandled: 88000000,
    rejectionRate: 0.018,
    active: true,
    monthlyTrend: [
      { month: '2026-01', fillRate: 0.928, slippage: 0.0023 },
      { month: '2026-02', fillRate: 0.931, slippage: 0.0022 },
      { month: '2026-03', fillRate: 0.936, slippage: 0.0019 },
      { month: '2026-04', fillRate: 0.940, slippage: 0.0017 },
    ],
  },
];

// ---------------------------------------------------------------------------
// In-memory decision log
// ---------------------------------------------------------------------------

const routingDecisions: RoutingDecision[] = [];

// Security name helper
const SECURITY_NAMES: Record<number, string> = {
  1: 'SM Investments (SM)',
  2: 'Ayala Corporation (AC)',
  3: 'BDO Unibank (BDO)',
  4: 'JG Summit (JGS)',
  5: 'PLDT Inc (TEL)',
  6: 'Aboitiz Equity (AEV)',
  7: 'Metro Pacific (MPI)',
  8: 'Universal Robina (URC)',
  9: 'Bank of the Philippine Islands (BPI)',
  10: 'Globe Telecom (GLO)',
  11: 'Monde Nissin (MONDE)',
  12: 'Converge ICT (CNVRG)',
  13: 'Manila Electric (MER)',
  14: 'Wilcon Depot (WLCON)',
  15: 'Semirara Mining (SCC)',
};

// ---------------------------------------------------------------------------
// Scoring Engine
// ---------------------------------------------------------------------------

function scoreBroker(
  broker: BrokerProfile,
  quantity: number,
  side: string,
): number {
  // Weighted scoring: fillRate (35%), slippage (25%), commission (20%), latency (20%)
  const fillScore = broker.fillRate * 35;
  const slippageScore = (1 - Math.min(broker.avgSlippage / 0.003, 1)) * 25;
  const commissionScore = (1 - Math.min(broker.commission / 0.003, 1)) * 20;
  const latencyScore = (1 - Math.min(broker.avgLatencyMs / 100, 1)) * 20;

  let score = fillScore + slippageScore + commissionScore + latencyScore;

  // Bonus for institutional brokers on large orders
  if (quantity >= 100000 && broker.specializations.includes('INSTITUTIONAL')) {
    score += 3;
  }

  // Bonus for brokers specializing in relevant order side
  if (side === 'SELL' && broker.fillRate > 0.97) {
    score += 1.5; // Better liquidity sourcing for sells
  }

  // Penalize high rejection rate
  score -= broker.rejectionRate * 100;

  return Number(Math.min(100, Math.max(0, score)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const intelligentRoutingService = {
  /**
   * Recommend a broker for an order based on composite scoring.
   */
  recommendBroker(securityId: number, quantity: number, side: string): RecommendationResult {
    const recommendations = BROKERS
      .filter((b: any) => b.active)
      .map((broker: any) => {
        const score = scoreBroker(broker, quantity, side);
        return {
          brokerId: broker.brokerId,
          brokerName: broker.brokerName,
          score,
          fillRate: broker.fillRate,
          avgSlippage: broker.avgSlippage,
          commission: broker.commission,
          avgLatencyMs: broker.avgLatencyMs,
          specializations: broker.specializations,
        };
      })
      .sort((a: any, b: any) => b.score - a.score);

    const best = recommendations[0];
    const secName = SECURITY_NAMES[securityId] ?? `Security #${securityId}`;

    const reasoning =
      `${best.brokerName} is the top recommendation for ${side} ${quantity.toLocaleString()} shares of ${secName} ` +
      `with a composite score of ${best.score}/100. Key advantages: ` +
      `${(best.fillRate * 100).toFixed(1)}% fill rate, ` +
      `${(best.avgSlippage * 100).toFixed(2)}% avg slippage, ` +
      `${best.avgLatencyMs}ms latency. ` +
      (best.specializations.includes('INSTITUTIONAL') && quantity >= 100000
        ? 'Institutional specialization bonus applied for large order. '
        : '') +
      `Runner-up: ${recommendations[1]?.brokerName} (score: ${recommendations[1]?.score}).`;

    // Log the decision
    const decision: RoutingDecision = {
      decisionId: randomUUID(),
      securityId,
      securityName: secName,
      quantity,
      side,
      selectedBrokerId: best.brokerId,
      selectedBrokerName: best.brokerName,
      score: best.score,
      alternativeCount: recommendations.length - 1,
      reasoning,
      outcome: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    routingDecisions.push(decision);

    return { recommendations, bestPick: best.brokerId, reasoning };
  },

  /**
   * Analyze execution quality for a specific broker over a period.
   */
  analyzeExecutionQuality(brokerId: string, period: string): ExecutionQuality | null {
    const broker = BROKERS.find((b: any) => b.brokerId === brokerId);
    if (!broker) return null;

    // Filter monthly trend based on period
    let trendMonths = broker.monthlyTrend;
    if (period === '1M') {
      trendMonths = broker.monthlyTrend.slice(-1);
    } else if (period === '3M') {
      trendMonths = broker.monthlyTrend.slice(-3);
    }
    // '6M', '1Y', 'ALL' → return all available

    return {
      brokerId: broker.brokerId,
      brokerName: broker.brokerName,
      fillRate: broker.fillRate,
      avgSlippage: broker.avgSlippage,
      avgLatencyMs: broker.avgLatencyMs,
      volumeHandled: broker.volumeHandled,
      rejectionRate: broker.rejectionRate,
      monthlyTrend: trendMonths,
    };
  },

  /**
   * Get broker leaderboard ranked by composite score.
   */
  getBrokerLeaderboard(): {
    rank: number;
    brokerId: string;
    brokerName: string;
    compositeScore: number;
    fillRate: number;
    avgSlippage: number;
    commission: number;
    avgLatencyMs: number;
    volumeHandled: number;
    specializations: string[];
  }[] {
    const scored = BROKERS
      .filter((b: any) => b.active)
      .map((broker: any) => {
        const compositeScore = scoreBroker(broker, 10000, 'BUY'); // neutral baseline
        return {
          brokerId: broker.brokerId,
          brokerName: broker.brokerName,
          compositeScore,
          fillRate: broker.fillRate,
          avgSlippage: broker.avgSlippage,
          commission: broker.commission,
          avgLatencyMs: broker.avgLatencyMs,
          volumeHandled: broker.volumeHandled,
          specializations: broker.specializations,
        };
      })
      .sort((a: any, b: any) => b.compositeScore - a.compositeScore);

    return scored.map((b: any, idx: number) => ({ rank: idx + 1, ...b }));
  },

  /**
   * Get routing decision log with optional filters.
   */
  getRoutingDecisionLog(filters: {
    brokerId?: string;
    side?: string;
    outcome?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    let filtered = [...routingDecisions];
    if (filters.brokerId) {
      filtered = filtered.filter((d: any) => d.selectedBrokerId === filters.brokerId);
    }
    if (filters.side) {
      filtered = filtered.filter((d: any) => d.side === filters.side);
    }
    if (filters.outcome) {
      filtered = filtered.filter((d: any) => d.outcome === filters.outcome);
    }

    filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  /**
   * Get list of all brokers (for dropdowns).
   */
  getBrokers() {
    return BROKERS.map((b: any) => ({
      brokerId: b.brokerId,
      brokerName: b.brokerName,
      active: b.active,
      specializations: b.specializations,
    }));
  },

  /**
   * Seed demo routing decisions.
   */
  seedDemoData() {
    if (routingDecisions.length > 0) return;

    const sides = ['BUY', 'SELL'];
    const outcomes: Array<'FILLED' | 'PARTIAL' | 'REJECTED' | 'PENDING'> = ['FILLED', 'FILLED', 'FILLED', 'PARTIAL', 'REJECTED', 'PENDING'];

    for (let i = 0; i < 20; i++) {
      const secId = (i % 15) + 1;
      const qty = Math.floor(1000 + Math.random() * 200000);
      const side = sides[i % 2];
      const result = this.recommendBroker(secId, qty, side);

      // Assign random outcome to the decision (last one pushed)
      const lastDecision = routingDecisions[routingDecisions.length - 1];
      if (lastDecision) {
        lastDecision.outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        lastDecision.createdAt = new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)).toISOString();
      }
    }
  },
};

// Seed demo data on module load
intelligentRoutingService.seedDemoData();
