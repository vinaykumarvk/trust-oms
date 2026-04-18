/**
 * ESG Scoring Service (Phase 6B)
 *
 * Provides Environmental, Social, and Governance scoring for securities
 * and portfolios. Uses deterministic mock scoring based on security IDs
 * for development, with hooks for future data provider integration.
 *
 * Features:
 *   - Individual security ESG scores (E/S/G breakdown)
 *   - Portfolio-level weighted average ESG scores
 *   - Detailed component breakdowns with carbon intensity
 *   - ESG exclusion screening (tobacco, weapons, fossil fuels, etc.)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ESGScore {
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  carbonIntensity: number;
  controversyScore: number;
}

interface PortfolioESG {
  portfolioId: string;
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  carbonIntensity: number;
  averageControversyScore: number;
  totalPositions: number;
  scoredPositions: number;
  totalMarketValue: number;
}

interface ESGBreakdownEntry {
  securityId: number;
  securityName: string;
  assetClass: string;
  weight: number;
  marketValue: number;
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  carbonIntensity: number;
  controversyScore: number;
  controversyFlag: boolean;
}

interface ESGBreakdown {
  portfolioId: string;
  holdings: ESGBreakdownEntry[];
  aggregated: {
    environmental: number;
    social: number;
    governance: number;
    overall: number;
    carbonIntensity: number;
    highControversyCount: number;
  };
  environmentalComponents: {
    label: string;
    score: number;
  }[];
  socialComponents: {
    label: string;
    score: number;
  }[];
  governanceComponents: {
    label: string;
    score: number;
  }[];
}

interface ScreeningFlag {
  securityId: number;
  securityName: string;
  assetClass: string;
  weight: number;
  marketValue: number;
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

interface ESGScreeningResult {
  portfolioId: string;
  totalPositions: number;
  flaggedCount: number;
  flaggedWeight: number;
  flaggedMarketValue: number;
  flags: ScreeningFlag[];
}

// ---------------------------------------------------------------------------
// Exclusion categories and keywords
// ---------------------------------------------------------------------------

const EXCLUSION_CATEGORIES: {
  category: string;
  keywords: string[];
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}[] = [
  {
    category: 'Tobacco',
    keywords: ['tobacco', 'cigarette', 'smoking', 'nicotine', 'PMI', 'altria'],
    severity: 'HIGH',
  },
  {
    category: 'Controversial Weapons',
    keywords: ['weapons', 'arms', 'munitions', 'cluster', 'landmine', 'defense', 'military'],
    severity: 'HIGH',
  },
  {
    category: 'Fossil Fuels',
    keywords: ['coal', 'oil', 'petroleum', 'fossil', 'crude', 'natural gas', 'drilling', 'fracking'],
    severity: 'MEDIUM',
  },
  {
    category: 'Gambling',
    keywords: ['gambling', 'casino', 'betting', 'lottery', 'gaming'],
    severity: 'LOW',
  },
  {
    category: 'Adult Entertainment',
    keywords: ['adult', 'entertainment', 'xxx'],
    severity: 'LOW',
  },
  {
    category: 'Thermal Coal',
    keywords: ['thermal coal', 'coal mining', 'coal power'],
    severity: 'HIGH',
  },
  {
    category: 'Nuclear Weapons',
    keywords: ['nuclear weapon', 'atomic weapon'],
    severity: 'HIGH',
  },
  {
    category: 'Palm Oil (Deforestation)',
    keywords: ['palm oil', 'deforestation', 'plantation'],
    severity: 'MEDIUM',
  },
];

// ---------------------------------------------------------------------------
// Deterministic mock score generator
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic pseudo-random number from a seed.
 * Uses a simple multiplicative hash to ensure reproducibility.
 */
function seededRandom(seed: number, offset: number = 0): number {
  let h = (seed + offset) * 2654435761;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (Math.abs(h) % 10000) / 10000;
}

/**
 * Generate ESG scores for a security based on its ID.
 * Scores range from 0-100 (higher = better ESG performance).
 * Carbon intensity in tCO2e/M$ revenue.
 * Controversy score 0-10 (0 = no controversy, 10 = severe).
 */
function generateMockESG(securityId: number): ESGScore {
  // Base scores — deterministic from ID
  const envBase = 30 + seededRandom(securityId, 1) * 60;    // 30-90
  const socBase = 35 + seededRandom(securityId, 2) * 55;    // 35-90
  const govBase = 40 + seededRandom(securityId, 3) * 50;    // 40-90

  // Slight variation to make sub-components interesting
  const environmental = Math.round(envBase * 10) / 10;
  const social = Math.round(socBase * 10) / 10;
  const governance = Math.round(govBase * 10) / 10;

  // Weighted overall (E: 35%, S: 30%, G: 35%)
  const overall = Math.round((environmental * 0.35 + social * 0.30 + governance * 0.35) * 10) / 10;

  // Carbon intensity: lower scores mean more carbon intensive
  // Inverse relationship to environmental score
  const carbonIntensity = Math.round((100 - environmental) * 3.5 + seededRandom(securityId, 4) * 50);

  // Controversy score: 0-10
  const controversyScore = Math.round(seededRandom(securityId, 5) * 10 * 10) / 10;

  return {
    overall,
    environmental,
    social,
    governance,
    carbonIntensity,
    controversyScore,
  };
}

/**
 * Generate sub-component scores for E, S, and G pillars.
 */
function generateEnvironmentalComponents(securityId: number): { label: string; score: number }[] {
  return [
    { label: 'Climate Change Mitigation', score: Math.round((30 + seededRandom(securityId, 10) * 60) * 10) / 10 },
    { label: 'Natural Resource Use', score: Math.round((30 + seededRandom(securityId, 11) * 60) * 10) / 10 },
    { label: 'Pollution & Waste', score: Math.round((30 + seededRandom(securityId, 12) * 60) * 10) / 10 },
    { label: 'Biodiversity Impact', score: Math.round((30 + seededRandom(securityId, 13) * 60) * 10) / 10 },
    { label: 'Water Management', score: Math.round((30 + seededRandom(securityId, 14) * 60) * 10) / 10 },
  ];
}

function generateSocialComponents(securityId: number): { label: string; score: number }[] {
  return [
    { label: 'Labor Practices', score: Math.round((35 + seededRandom(securityId, 20) * 55) * 10) / 10 },
    { label: 'Human Rights', score: Math.round((35 + seededRandom(securityId, 21) * 55) * 10) / 10 },
    { label: 'Community Impact', score: Math.round((35 + seededRandom(securityId, 22) * 55) * 10) / 10 },
    { label: 'Customer Welfare', score: Math.round((35 + seededRandom(securityId, 23) * 55) * 10) / 10 },
    { label: 'Diversity & Inclusion', score: Math.round((35 + seededRandom(securityId, 24) * 55) * 10) / 10 },
  ];
}

function generateGovernanceComponents(securityId: number): { label: string; score: number }[] {
  return [
    { label: 'Board Structure', score: Math.round((40 + seededRandom(securityId, 30) * 50) * 10) / 10 },
    { label: 'Executive Compensation', score: Math.round((40 + seededRandom(securityId, 31) * 50) * 10) / 10 },
    { label: 'Shareholder Rights', score: Math.round((40 + seededRandom(securityId, 32) * 50) * 10) / 10 },
    { label: 'Audit & Controls', score: Math.round((40 + seededRandom(securityId, 33) * 50) * 10) / 10 },
    { label: 'Anti-Corruption', score: Math.round((40 + seededRandom(securityId, 34) * 50) * 10) / 10 },
  ];
}

/**
 * Determine if a security name matches any exclusion category.
 * Uses keyword matching against security name, asset class, and sector.
 */
function checkExclusions(
  securityName: string,
  assetClass: string,
  sector: string,
  securityId: number,
): { category: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string } | null {
  const searchText = `${securityName} ${assetClass} ${sector}`.toLowerCase();

  // Deterministic flagging: some securities are flagged based on ID hash
  const flagChance = seededRandom(securityId, 99);

  for (const exclusion of EXCLUSION_CATEGORIES) {
    // Check keyword matches first
    for (const keyword of exclusion.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        return {
          category: exclusion.category,
          severity: exclusion.severity,
          reason: `Security name/sector matches "${keyword}" screening keyword`,
        };
      }
    }

    // Deterministic random flagging for demo purposes (~8% chance per category)
    if (flagChance < 0.08 && securityId % EXCLUSION_CATEGORIES.length === EXCLUSION_CATEGORIES.indexOf(exclusion)) {
      return {
        category: exclusion.category,
        severity: exclusion.severity,
        reason: `Flagged by third-party ESG data provider — ${exclusion.category} involvement detected`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const esgService = {
  /**
   * Get ESG scores for an individual security.
   * Returns deterministic mock scores based on security ID.
   */
  async getESGScore(securityId: number): Promise<ESGScore & { securityId: number; securityName: string }> {
    // Look up security name for enrichment
    const [security] = await db
      .select({ id: schema.securities.id, name: schema.securities.name })
      .from(schema.securities)
      .where(eq(schema.securities.id, securityId))
      .limit(1);

    const scores = generateMockESG(securityId);

    return {
      securityId,
      securityName: security?.name ?? `Security #${securityId}`,
      ...scores,
    };
  },

  /**
   * Get portfolio-level weighted-average ESG scores.
   * Queries real positions from DB and applies mock ESG per security.
   */
  async getPortfolioESG(portfolioId: string): Promise<PortfolioESG> {
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        market_value: schema.positions.market_value,
      })
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let totalMV = 0;
    for (const p of positions) {
      totalMV += Number(p.market_value ?? 0);
    }

    let weightedEnv = 0;
    let weightedSoc = 0;
    let weightedGov = 0;
    let weightedOverall = 0;
    let weightedCarbon = 0;
    let totalControversy = 0;
    let scoredCount = 0;

    for (const p of positions) {
      const mv = Number(p.market_value ?? 0);
      if (mv <= 0 || !p.security_id) continue;

      const weight = totalMV > 0 ? mv / totalMV : 0;
      const esg = generateMockESG(p.security_id);

      weightedEnv += esg.environmental * weight;
      weightedSoc += esg.social * weight;
      weightedGov += esg.governance * weight;
      weightedOverall += esg.overall * weight;
      weightedCarbon += esg.carbonIntensity * weight;
      totalControversy += esg.controversyScore;
      scoredCount++;
    }

    return {
      portfolioId,
      overall: Math.round(weightedOverall * 10) / 10,
      environmental: Math.round(weightedEnv * 10) / 10,
      social: Math.round(weightedSoc * 10) / 10,
      governance: Math.round(weightedGov * 10) / 10,
      carbonIntensity: Math.round(weightedCarbon),
      averageControversyScore: scoredCount > 0
        ? Math.round((totalControversy / scoredCount) * 10) / 10
        : 0,
      totalPositions: positions.length,
      scoredPositions: scoredCount,
      totalMarketValue: Math.round(totalMV * 100) / 100,
    };
  },

  /**
   * Get detailed ESG breakdown per holding with E/S/G component scores.
   */
  async getESGBreakdown(portfolioId: string): Promise<ESGBreakdown> {
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        market_value: schema.positions.market_value,
        name: schema.securities.name,
        asset_class: schema.securities.asset_class,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let totalMV = 0;
    for (const p of positions) {
      totalMV += Number(p.market_value ?? 0);
    }

    const holdings: ESGBreakdownEntry[] = positions.map((p: any) => {
      const mv = Number(p.market_value ?? 0);
      const weight = totalMV > 0 ? Math.round((mv / totalMV) * 10000) / 100 : 0;
      const esg = generateMockESG(p.security_id!);

      return {
        securityId: p.security_id!,
        securityName: p.name ?? `Security #${p.security_id}`,
        assetClass: p.asset_class ?? 'UNKNOWN',
        weight,
        marketValue: Math.round(mv * 100) / 100,
        overall: esg.overall,
        environmental: esg.environmental,
        social: esg.social,
        governance: esg.governance,
        carbonIntensity: esg.carbonIntensity,
        controversyScore: esg.controversyScore,
        controversyFlag: esg.controversyScore >= 7.0,
      };
    }).sort((a: ESGBreakdownEntry, b: ESGBreakdownEntry) => b.weight - a.weight);

    // Aggregated scores (weighted average)
    let aggEnv = 0;
    let aggSoc = 0;
    let aggGov = 0;
    let aggOverall = 0;
    let aggCarbon = 0;
    let highControversyCount = 0;

    for (const h of holdings) {
      const w = h.weight / 100;
      aggEnv += h.environmental * w;
      aggSoc += h.social * w;
      aggGov += h.governance * w;
      aggOverall += h.overall * w;
      aggCarbon += h.carbonIntensity * w;
      if (h.controversyFlag) highControversyCount++;
    }

    // Aggregate sub-component scores across portfolio
    const envComponents: { label: string; totalScore: number; totalWeight: number }[] = [];
    const socComponents: { label: string; totalScore: number; totalWeight: number }[] = [];
    const govComponents: { label: string; totalScore: number; totalWeight: number }[] = [];

    for (const h of holdings) {
      const w = h.weight / 100;

      const envSub = generateEnvironmentalComponents(h.securityId);
      for (const comp of envSub) {
        const existing = envComponents.find((c: any) => c.label === comp.label);
        if (existing) {
          existing.totalScore += comp.score * w;
          existing.totalWeight += w;
        } else {
          envComponents.push({ label: comp.label, totalScore: comp.score * w, totalWeight: w });
        }
      }

      const socSub = generateSocialComponents(h.securityId);
      for (const comp of socSub) {
        const existing = socComponents.find((c: any) => c.label === comp.label);
        if (existing) {
          existing.totalScore += comp.score * w;
          existing.totalWeight += w;
        } else {
          socComponents.push({ label: comp.label, totalScore: comp.score * w, totalWeight: w });
        }
      }

      const govSub = generateGovernanceComponents(h.securityId);
      for (const comp of govSub) {
        const existing = govComponents.find((c: any) => c.label === comp.label);
        if (existing) {
          existing.totalScore += comp.score * w;
          existing.totalWeight += w;
        } else {
          govComponents.push({ label: comp.label, totalScore: comp.score * w, totalWeight: w });
        }
      }
    }

    return {
      portfolioId,
      holdings,
      aggregated: {
        environmental: Math.round(aggEnv * 10) / 10,
        social: Math.round(aggSoc * 10) / 10,
        governance: Math.round(aggGov * 10) / 10,
        overall: Math.round(aggOverall * 10) / 10,
        carbonIntensity: Math.round(aggCarbon),
        highControversyCount,
      },
      environmentalComponents: envComponents.map((c: any) => ({
        label: c.label,
        score: Math.round((c.totalWeight > 0 ? c.totalScore / c.totalWeight : 0) * 10) / 10,
      })),
      socialComponents: socComponents.map((c: any) => ({
        label: c.label,
        score: Math.round((c.totalWeight > 0 ? c.totalScore / c.totalWeight : 0) * 10) / 10,
      })),
      governanceComponents: govComponents.map((c: any) => ({
        label: c.label,
        score: Math.round((c.totalWeight > 0 ? c.totalScore / c.totalWeight : 0) * 10) / 10,
      })),
    };
  },

  /**
   * Screen portfolio holdings against ESG exclusion criteria.
   * Returns flagged holdings with category, severity, and reason.
   */
  async getESGScreening(portfolioId: string): Promise<ESGScreeningResult> {
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        market_value: schema.positions.market_value,
        name: schema.securities.name,
        asset_class: schema.securities.asset_class,
        sector: schema.securities.sector,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let totalMV = 0;
    for (const p of positions) {
      totalMV += Number(p.market_value ?? 0);
    }

    const flags: ScreeningFlag[] = [];

    for (const p of positions) {
      const mv = Number(p.market_value ?? 0);
      const weight = totalMV > 0 ? Math.round((mv / totalMV) * 10000) / 100 : 0;

      const exclusion = checkExclusions(
        p.name ?? '',
        p.asset_class ?? '',
        p.sector ?? '',
        p.security_id!,
      );

      if (exclusion) {
        flags.push({
          securityId: p.security_id!,
          securityName: p.name ?? `Security #${p.security_id}`,
          assetClass: p.asset_class ?? 'UNKNOWN',
          weight,
          marketValue: Math.round(mv * 100) / 100,
          category: exclusion.category,
          severity: exclusion.severity,
          reason: exclusion.reason,
        });
      }
    }

    // Sort: HIGH severity first, then by weight
    flags.sort((a: ScreeningFlag, b: ScreeningFlag) => {
      const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      return sevDiff !== 0 ? sevDiff : b.weight - a.weight;
    });

    let flaggedWeight = 0;
    let flaggedMV = 0;
    for (const f of flags) {
      flaggedWeight += f.weight;
      flaggedMV += f.marketValue;
    }

    return {
      portfolioId,
      totalPositions: positions.length,
      flaggedCount: flags.length,
      flaggedWeight: Math.round(flaggedWeight * 100) / 100,
      flaggedMarketValue: Math.round(flaggedMV * 100) / 100,
      flags,
    };
  },
};
