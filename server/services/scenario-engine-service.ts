/**
 * Scenario Engine Service (Phase 6B)
 *
 * Provides what-if pre-trade impact analysis for portfolio managers and RMs.
 * Simulates proposed orders against real portfolio positions to show:
 *   - Allocation shifts (before/after)
 *   - Mandate compliance checks
 *   - Concentration risk impact
 *   - Sector exposure changes
 *   - Performance & risk estimates
 *   - Tax impact projections
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProposedOrder {
  securityId: number;
  side: string;
  quantity: number;
  price: number;
}

interface AllocationEntry {
  assetClass: string;
  weight: number;
  marketValue: number;
}

interface MandateCompliance {
  status: 'PASS' | 'WARN' | 'BREACH';
  details: string[];
}

interface ConcentrationImpact {
  currentConcentration: number;
  postTradeConcentration: number;
  limit: number;
  status: string;
}

interface SectorExposureChange {
  sector: string;
  currentWeight: number;
  postTradeWeight: number;
}

interface PerformanceEstimate {
  estimatedReturn: number;
  riskImpact: number;
}

interface TaxImpact {
  estimatedTax: number;
  shortTermGains: number;
  longTermGains: number;
}

interface ScenarioResult {
  id: string;
  portfolioId: string;
  proposedOrder: ProposedOrder;
  currentAllocation: AllocationEntry[];
  postTradeAllocation: AllocationEntry[];
  mandateCompliance: MandateCompliance;
  concentrationImpact: ConcentrationImpact;
  sectorExposureChange: SectorExposureChange[];
  performanceEstimate: PerformanceEstimate;
  taxImpact: TaxImpact;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// In-memory scenario history (keyed by portfolio ID)
// ---------------------------------------------------------------------------

const scenarioHistory = new Map<string, ScenarioResult[]>();
const MAX_HISTORY = 50;

function storeScenario(portfolioId: string, result: ScenarioResult): void {
  const existing = scenarioHistory.get(portfolioId) ?? [];
  existing.unshift(result);
  if (existing.length > MAX_HISTORY) {
    existing.length = MAX_HISTORY;
  }
  scenarioHistory.set(portfolioId, existing);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateScenarioId(): string {
  return `SCN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/** Deterministic hash for reproducible mock values */
function simpleHash(n: number): number {
  let h = n * 2654435761;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return Math.abs(h);
}

/** Build allocation breakdown from position data */
function buildAllocation(
  positionMap: Map<number, { marketValue: number; assetClass: string }>,
): AllocationEntry[] {
  const classMap = new Map<string, number>();
  let totalMV = 0;

  positionMap.forEach((pos: { marketValue: number; assetClass: string }) => {
    const cls = pos.assetClass || 'UNKNOWN';
    classMap.set(cls, (classMap.get(cls) ?? 0) + pos.marketValue);
    totalMV += pos.marketValue;
  });

  const allocation: AllocationEntry[] = [];
  classMap.forEach((mv: number, cls: string) => {
    allocation.push({
      assetClass: cls,
      weight: totalMV > 0 ? Math.round((mv / totalMV) * 10000) / 100 : 0,
      marketValue: Math.round(mv * 100) / 100,
    });
  });

  return allocation.sort((a: AllocationEntry, b: AllocationEntry) => b.weight - a.weight);
}

/** Determine sector from asset class using keyword heuristics */
function inferSector(assetClass: string, securityId: number): string {
  const upper = (assetClass ?? '').toUpperCase();
  if (upper.includes('EQUITY') || upper.includes('STOCK')) {
    const sectors = ['Financials', 'Technology', 'Healthcare', 'Consumer', 'Energy', 'Industrials', 'Utilities', 'Real Estate'];
    return sectors[securityId % sectors.length];
  }
  if (upper.includes('BOND') || upper.includes('FIXED')) {
    const bondSectors = ['Government', 'Corporate', 'Municipal', 'High Yield'];
    return bondSectors[securityId % bondSectors.length];
  }
  if (upper.includes('CASH') || upper.includes('MONEY')) return 'Cash & Equivalents';
  return 'Other';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const scenarioEngineService = {
  /**
   * Analyze the impact of a proposed order on a portfolio.
   * Fetches real positions from DB, simulates the trade, and returns
   * comprehensive impact metrics.
   */
  async analyzeImpact(
    portfolioId: string,
    proposedOrder: ProposedOrder,
  ): Promise<ScenarioResult> {
    // 1. Fetch current positions with security details
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        cost_basis: schema.positions.cost_basis,
        market_value: schema.positions.market_value,
        asset_class: schema.securities.asset_class,
        sector: schema.securities.sector,
        currency: schema.securities.currency,
        name: schema.securities.name,
        as_of_date: schema.positions.as_of_date,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // 2. Fetch mandate constraints
    const [mandate] = await db
      .select()
      .from(schema.mandates)
      .where(eq(schema.mandates.portfolio_id, portfolioId))
      .limit(1);

    // 3. Fetch the target security info
    const [targetSecurity] = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.id, proposedOrder.securityId))
      .limit(1);

    const targetAssetClass = targetSecurity?.asset_class ?? 'UNKNOWN';
    const targetSector = targetSecurity?.sector ?? inferSector(targetAssetClass, proposedOrder.securityId);

    // 4. Build current position map
    const currentPositions = new Map<number, {
      quantity: number;
      marketValue: number;
      costBasis: number;
      assetClass: string;
      sector: string;
      securityId: number;
    }>();

    let totalCurrentMV = 0;

    for (const p of positions) {
      const mv = Number(p.market_value ?? 0);
      totalCurrentMV += mv;
      currentPositions.set(p.security_id!, {
        quantity: Number(p.quantity ?? 0),
        marketValue: mv,
        costBasis: Number(p.cost_basis ?? 0),
        assetClass: p.asset_class ?? 'UNKNOWN',
        sector: p.sector ?? inferSector(p.asset_class ?? '', p.security_id!),
        securityId: p.security_id!,
      });
    }

    // 5. Current allocation
    const currentAllocMap = new Map<number, { marketValue: number; assetClass: string }>();
    currentPositions.forEach((pos: any, secId: number) => {
      currentAllocMap.set(secId, { marketValue: pos.marketValue, assetClass: pos.assetClass });
    });
    const currentAllocation = buildAllocation(currentAllocMap);

    // 6. Simulate post-trade positions
    const postPositions = new Map(currentPositions);
    const tradeValue = proposedOrder.quantity * proposedOrder.price;

    const existing = postPositions.get(proposedOrder.securityId) ?? {
      quantity: 0,
      marketValue: 0,
      costBasis: 0,
      assetClass: targetAssetClass,
      sector: targetSector,
      securityId: proposedOrder.securityId,
    };

    let realizedGain = 0;

    if (proposedOrder.side.toUpperCase() === 'BUY') {
      existing.quantity += proposedOrder.quantity;
      existing.marketValue += tradeValue;
      existing.costBasis += tradeValue;
    } else {
      // SELL
      const avgCost = existing.quantity > 0 ? existing.costBasis / existing.quantity : 0;
      realizedGain = (proposedOrder.price - avgCost) * proposedOrder.quantity;
      existing.quantity -= proposedOrder.quantity;
      existing.marketValue -= tradeValue;
      existing.costBasis -= avgCost * proposedOrder.quantity;
    }

    postPositions.set(proposedOrder.securityId, existing);

    // Remove positions with zero or negative quantities
    postPositions.forEach((pos: any, secId: number) => {
      if (pos.quantity <= 0) {
        postPositions.delete(secId);
      }
    });

    // 7. Post-trade allocation
    const postAllocMap = new Map<number, { marketValue: number; assetClass: string }>();
    postPositions.forEach((pos: any, secId: number) => {
      postAllocMap.set(secId, { marketValue: pos.marketValue, assetClass: pos.assetClass });
    });
    const postTradeAllocation = buildAllocation(postAllocMap);

    // 8. Post-trade total MV
    let totalPostMV = 0;
    postPositions.forEach((pos: any) => {
      totalPostMV += pos.marketValue;
    });

    // 9. Mandate compliance check
    const mandateCompliance = checkMandateCompliance(
      mandate,
      postPositions,
      totalPostMV,
      proposedOrder.securityId,
    );

    // 10. Concentration impact
    const currentSecMV = currentPositions.get(proposedOrder.securityId)?.marketValue ?? 0;
    const postSecMV = postPositions.get(proposedOrder.securityId)?.marketValue ?? 0;

    const maxSingleIssuerPct = mandate ? Number(mandate.max_single_issuer_pct ?? 10) : 10;

    const currentConcentration = totalCurrentMV > 0
      ? Math.round((currentSecMV / totalCurrentMV) * 10000) / 100
      : 0;
    const postTradeConcentration = totalPostMV > 0
      ? Math.round((postSecMV / totalPostMV) * 10000) / 100
      : 0;

    const concentrationImpact: ConcentrationImpact = {
      currentConcentration,
      postTradeConcentration,
      limit: maxSingleIssuerPct,
      status: postTradeConcentration > maxSingleIssuerPct
        ? 'BREACH'
        : postTradeConcentration > maxSingleIssuerPct * 0.8
          ? 'WARNING'
          : 'OK',
    };

    // 11. Sector exposure change
    const sectorCurrentMap = new Map<string, number>();
    const sectorPostMap = new Map<string, number>();

    currentPositions.forEach((pos: any) => {
      sectorCurrentMap.set(pos.sector, (sectorCurrentMap.get(pos.sector) ?? 0) + pos.marketValue);
    });

    postPositions.forEach((pos: any) => {
      sectorPostMap.set(pos.sector, (sectorPostMap.get(pos.sector) ?? 0) + pos.marketValue);
    });

    const allSectors = new Set<string>([...sectorCurrentMap.keys(), ...sectorPostMap.keys()]);
    const sectorExposureChange: SectorExposureChange[] = Array.from(allSectors).map((sector: string) => {
      const currentSectorMV = sectorCurrentMap.get(sector) ?? 0;
      const postSectorMV = sectorPostMap.get(sector) ?? 0;
      return {
        sector,
        currentWeight: totalCurrentMV > 0
          ? Math.round((currentSectorMV / totalCurrentMV) * 10000) / 100
          : 0,
        postTradeWeight: totalPostMV > 0
          ? Math.round((postSectorMV / totalPostMV) * 10000) / 100
          : 0,
      };
    }).sort((a: SectorExposureChange, b: SectorExposureChange) =>
      Math.abs(b.postTradeWeight - b.currentWeight) - Math.abs(a.postTradeWeight - a.currentWeight)
    );

    // 12. Performance estimate (heuristic based on asset class)
    const assetClassRiskReturn: Record<string, { ret: number; risk: number }> = {
      EQUITY: { ret: 0.08, risk: 0.18 },
      STOCK: { ret: 0.08, risk: 0.18 },
      COMMON_STOCK: { ret: 0.08, risk: 0.18 },
      PREFERRED_STOCK: { ret: 0.06, risk: 0.12 },
      BOND: { ret: 0.04, risk: 0.06 },
      FIXED_INCOME: { ret: 0.04, risk: 0.06 },
      GOVERNMENT_BOND: { ret: 0.035, risk: 0.04 },
      CORPORATE_BOND: { ret: 0.05, risk: 0.08 },
      CASH: { ret: 0.02, risk: 0.01 },
      MONEY_MARKET: { ret: 0.025, risk: 0.01 },
      REAL_ESTATE: { ret: 0.06, risk: 0.14 },
      ALTERNATIVES: { ret: 0.07, risk: 0.16 },
    };

    const upperTarget = targetAssetClass.toUpperCase().replace(/[\s-]/g, '_');
    const riskReturn = assetClassRiskReturn[upperTarget] ?? { ret: 0.05, risk: 0.10 };
    const tradeWeight = totalPostMV > 0 ? tradeValue / totalPostMV : 0;

    const performanceEstimate: PerformanceEstimate = {
      estimatedReturn: Math.round(riskReturn.ret * tradeWeight * 10000) / 100,
      riskImpact: Math.round(riskReturn.risk * tradeWeight * 10000) / 100,
    };

    // 13. Tax impact (Philippine tax rates)
    const shortTermRate = 0.30; // 30% for < 1 year (corporate income tax rate)
    const longTermStockRate = 0.006; // 0.6% stock transaction tax for listed
    const longTermBondRate = 0.20; // 20% for interest income on bonds

    let shortTermGains = 0;
    let longTermGains = 0;

    if (proposedOrder.side.toUpperCase() === 'SELL' && realizedGain > 0) {
      // Check holding period — use as_of_date heuristic
      const positionData = positions.find((p: any) => p.security_id === proposedOrder.securityId);
      const asOfDate = positionData?.as_of_date ? new Date(positionData.as_of_date) : new Date();
      const holdingDays = Math.floor((Date.now() - asOfDate.getTime()) / (1000 * 60 * 60 * 24));

      if (holdingDays < 365) {
        shortTermGains = realizedGain;
      } else {
        longTermGains = realizedGain;
      }
    }

    const estimatedTax =
      Math.round((shortTermGains * shortTermRate + longTermGains * (
        upperTarget.includes('STOCK') || upperTarget.includes('EQUITY')
          ? longTermStockRate
          : longTermBondRate
      )) * 100) / 100;

    const taxImpact: TaxImpact = {
      estimatedTax,
      shortTermGains: Math.round(shortTermGains * 100) / 100,
      longTermGains: Math.round(longTermGains * 100) / 100,
    };

    // 14. Build result
    const result: ScenarioResult = {
      id: generateScenarioId(),
      portfolioId,
      proposedOrder,
      currentAllocation,
      postTradeAllocation,
      mandateCompliance,
      concentrationImpact,
      sectorExposureChange,
      performanceEstimate,
      taxImpact,
      timestamp: new Date().toISOString(),
    };

    // Store in history
    storeScenario(portfolioId, result);

    return result;
  },

  /**
   * Retrieve recent scenario simulations for a portfolio.
   */
  async getScenarioHistory(portfolioId: string): Promise<ScenarioResult[]> {
    return scenarioHistory.get(portfolioId) ?? [];
  },
};

// ---------------------------------------------------------------------------
// Mandate Compliance Helpers
// ---------------------------------------------------------------------------

function checkMandateCompliance(
  mandate: any,
  positions: Map<number, any>,
  totalMV: number,
  targetSecurityId: number,
): MandateCompliance {
  const details: string[] = [];
  let worstStatus = 'PASS' as string;

  if (!mandate) {
    details.push('No mandate defined for this portfolio — compliance check skipped');
    return { status: 'PASS', details };
  }

  // Check max single issuer concentration
  const maxSingleIssuerPct = Number(mandate.max_single_issuer_pct ?? 10);
  positions.forEach((pos: any, secId: number) => {
    const weight = totalMV > 0 ? (pos.marketValue / totalMV) * 100 : 0;
    if (weight > maxSingleIssuerPct) {
      worstStatus = 'BREACH';
      details.push(
        `Security ${secId} concentration ${weight.toFixed(2)}% exceeds limit ${maxSingleIssuerPct}%`,
      );
    } else if (weight > maxSingleIssuerPct * 0.8) {
      if (worstStatus !== 'BREACH') worstStatus = 'WARN';
      details.push(
        `Security ${secId} concentration ${weight.toFixed(2)}% approaching limit ${maxSingleIssuerPct}%`,
      );
    }
  });

  // Check max sector concentration
  const maxSectorPct = Number(mandate.max_sector_pct ?? 25);
  const sectorMap = new Map<string, number>();
  positions.forEach((pos: any) => {
    sectorMap.set(pos.sector, (sectorMap.get(pos.sector) ?? 0) + pos.marketValue);
  });

  sectorMap.forEach((sectorMV: number, sector: string) => {
    const sectorWeight = totalMV > 0 ? (sectorMV / totalMV) * 100 : 0;
    if (sectorWeight > maxSectorPct) {
      worstStatus = 'BREACH';
      details.push(
        `Sector "${sector}" at ${sectorWeight.toFixed(2)}% exceeds limit ${maxSectorPct}%`,
      );
    } else if (sectorWeight > maxSectorPct * 0.8) {
      if (worstStatus !== 'BREACH') worstStatus = 'WARN';
      details.push(
        `Sector "${sector}" at ${sectorWeight.toFixed(2)}% approaching limit ${maxSectorPct}%`,
      );
    }
  });

  // Check min/max allocation constraints
  const minAllocation = (mandate.min_allocation ?? {}) as Record<string, number>;
  const maxAllocation = (mandate.max_allocation ?? {}) as Record<string, number>;

  const classMap = new Map<string, number>();
  positions.forEach((pos: any) => {
    classMap.set(pos.assetClass, (classMap.get(pos.assetClass) ?? 0) + pos.marketValue);
  });

  for (const [cls, minPct] of Object.entries(minAllocation)) {
    const classMV = classMap.get(cls) ?? 0;
    const classWeight = totalMV > 0 ? (classMV / totalMV) * 100 : 0;
    if (classWeight < Number(minPct)) {
      if (worstStatus !== 'BREACH') worstStatus = 'WARN';
      details.push(
        `Asset class "${cls}" at ${classWeight.toFixed(2)}% below minimum ${minPct}%`,
      );
    }
  }

  for (const [cls, maxPctVal] of Object.entries(maxAllocation)) {
    const classMV = classMap.get(cls) ?? 0;
    const classWeight = totalMV > 0 ? (classMV / totalMV) * 100 : 0;
    if (classWeight > Number(maxPctVal)) {
      worstStatus = 'BREACH';
      details.push(
        `Asset class "${cls}" at ${classWeight.toFixed(2)}% exceeds maximum ${maxPctVal}%`,
      );
    }
  }

  // Check restricted securities
  const restricted = (mandate.restricted_securities ?? []) as number[];
  if (restricted.includes(targetSecurityId)) {
    worstStatus = 'BREACH';
    details.push(`Security ${targetSecurityId} is on the restricted securities list`);
  }

  if (details.length === 0) {
    details.push('All mandate constraints satisfied');
  }

  return { status: worstStatus as 'PASS' | 'WARN' | 'BREACH', details };
}
