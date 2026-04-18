/**
 * Model Portfolio Service (Phase 3H)
 *
 * Manages model portfolio CRUD, portfolio-vs-model comparison,
 * and rebalancing action generation for BDO RFI Gap #5.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

/** Shape of a single allocation slot in the model's JSONB column */
interface ModelAllocation {
  asset_class: string;
  target_pct: number;
  min_pct: number;
  max_pct: number;
}

/** Deviation row returned by comparePortfolioToModel */
interface DeviationRow {
  assetClass: string;
  targetPct: number;
  actualPct: number;
  deviationPct: number;
  overUnder: 'OVER' | 'UNDER' | 'ON_TARGET';
}

/** Rebalancing trade action returned by getRebalancingActions */
interface RebalancingAction {
  securityId: number;
  ticker: string | null;
  assetClass: string | null;
  side: 'BUY' | 'SELL';
  quantity: number;
  estimatedValue: number;
}

export const modelPortfolioService = {
  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /** Create a new model portfolio */
  async createModel(data: {
    name: string;
    description?: string;
    allocations: ModelAllocation[];
    benchmarkId?: number;
  }) {
    const [model] = await db
      .insert(schema.modelPortfolios)
      .values({
        name: data.name,
        description: data.description ?? null,
        allocations: data.allocations as unknown as Record<string, unknown>,
        benchmark_id: data.benchmarkId ?? null,
        is_active: true,
      })
      .returning();

    return model;
  },

  /** Update an existing model portfolio */
  async updateModel(
    id: number,
    data: Partial<{
      name: string;
      description: string;
      allocations: ModelAllocation[];
      benchmarkId: number;
      isActive: boolean;
    }>,
  ) {
    const [existing] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, id))
      .limit(1);

    if (!existing) throw new Error('Model portfolio not found');

    const [updated] = await db
      .update(schema.modelPortfolios)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.allocations !== undefined && {
          allocations: data.allocations as unknown as Record<string, unknown>,
        }),
        ...(data.benchmarkId !== undefined && { benchmark_id: data.benchmarkId }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        updated_at: new Date(),
      })
      .where(eq(schema.modelPortfolios.id, id))
      .returning();

    return updated;
  },

  /** List model portfolios with optional active filter */
  async getModels(filters?: { isActive?: boolean; page?: number; pageSize?: number }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.isActive !== undefined) {
      conditions.push(eq(schema.modelPortfolios.is_active, filters.isActive));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.modelPortfolios)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.modelPortfolios.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.modelPortfolios)
      .where(where);

    const total = Number(countResult[0]?.count ?? 0);
    return { data, total, page, pageSize };
  },

  /** Get a single model portfolio by id */
  async getModel(id: number) {
    const [model] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, id))
      .limit(1);

    return model ?? null;
  },

  /** Soft-delete a model portfolio (set is_active = false) */
  async deleteModel(id: number) {
    const [existing] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, id))
      .limit(1);

    if (!existing) throw new Error('Model portfolio not found');

    const [updated] = await db
      .update(schema.modelPortfolios)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(schema.modelPortfolios.id, id))
      .returning();

    return updated;
  },

  // ---------------------------------------------------------------------------
  // Comparison & Rebalancing Actions
  // ---------------------------------------------------------------------------

  /** Compare a portfolio's current allocations against a model's targets */
  async comparePortfolioToModel(
    portfolioId: string,
    modelId: number,
  ): Promise<DeviationRow[]> {
    // Fetch model
    const [model] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, modelId))
      .limit(1);

    if (!model) throw new Error('Model portfolio not found');

    const allocations = (model.allocations ?? []) as unknown as ModelAllocation[];

    // Fetch portfolio positions with security join for asset_class
    const positions = await db
      .select({
        market_value: schema.positions.market_value,
        asset_class: schema.securities.asset_class,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // Total portfolio market value
    let totalMV = 0;
    for (const p of positions) {
      totalMV += Number(p.market_value ?? 0);
    }

    // Group positions by asset_class
    const actualByClass: Record<string, number> = {};
    for (const p of positions) {
      const cls = p.asset_class ?? 'UNKNOWN';
      actualByClass[cls] = (actualByClass[cls] ?? 0) + Number(p.market_value ?? 0);
    }

    // Build deviation rows
    const deviations: DeviationRow[] = allocations.map((alloc) => {
      const actualMV = actualByClass[alloc.asset_class] ?? 0;
      const actualPct = totalMV > 0 ? (actualMV / totalMV) * 100 : 0;
      const deviationPct = actualPct - alloc.target_pct;
      let overUnder: DeviationRow['overUnder'] = 'ON_TARGET';
      if (deviationPct > 0.01) overUnder = 'OVER';
      else if (deviationPct < -0.01) overUnder = 'UNDER';

      return {
        assetClass: alloc.asset_class,
        targetPct: alloc.target_pct,
        actualPct: Math.round(actualPct * 100) / 100,
        deviationPct: Math.round(deviationPct * 100) / 100,
        overUnder,
      };
    });

    return deviations;
  },

  /** Generate buy/sell actions to realign a portfolio with a model */
  async getRebalancingActions(
    portfolioId: string,
    modelId: number,
  ): Promise<RebalancingAction[]> {
    // Fetch model
    const [model] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, modelId))
      .limit(1);

    if (!model) throw new Error('Model portfolio not found');

    const allocations = (model.allocations ?? []) as unknown as ModelAllocation[];

    // Fetch positions with security details
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
    for (const p of positions) {
      totalMV += Number(p.market_value ?? 0);
    }

    if (totalMV <= 0) return [];

    // Build target MV per asset class
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

    // For each position, compute proportional adjustment
    const actions: RebalancingAction[] = [];

    for (const p of positions) {
      const cls = p.asset_class ?? 'UNKNOWN';
      const actualClassMV = actualMVByClass[cls] ?? 0;
      const targetClassMV = targetMVByClass[cls] ?? 0;

      if (actualClassMV === 0) continue;

      // Proportional share of this position within its class
      const positionMV = Number(p.market_value ?? 0);
      const positionShare = positionMV / actualClassMV;
      const classDelta = targetClassMV - actualClassMV;
      const positionDelta = classDelta * positionShare;

      if (Math.abs(positionDelta) < 0.01) continue;

      const pricePerUnit =
        Number(p.quantity ?? 0) > 0
          ? positionMV / Number(p.quantity ?? 1)
          : 0;

      const deltaQty =
        pricePerUnit > 0 ? Math.round(Math.abs(positionDelta) / pricePerUnit) : 0;

      if (deltaQty === 0) continue;

      actions.push({
        securityId: p.security_id!,
        ticker: p.ticker,
        assetClass: p.asset_class,
        side: positionDelta > 0 ? 'BUY' : 'SELL',
        quantity: deltaQty,
        estimatedValue: Math.round(Math.abs(positionDelta) * 100) / 100,
      });
    }

    return actions;
  },
};
