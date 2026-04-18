/**
 * Rebalancing Service (Phase 3H)
 *
 * Orchestrates single-portfolio and group rebalancing, cash-event
 * rebalancing, run lifecycle (draft -> approve -> execute), and
 * blotter editing. Supports held-away asset inclusion.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { modelPortfolioService } from './model-portfolio-service';

/** Shape of a single allocation from the model JSONB */
interface ModelAllocation {
  asset_class: string;
  target_pct: number;
  min_pct: number;
  max_pct: number;
}

/** Single trade entry in the generated blotter JSONB */
interface BlotterEntry {
  portfolioId: string;
  securityId: number;
  ticker: string | null;
  assetClass: string | null;
  side: 'BUY' | 'SELL';
  quantity: number;
  estimatedValue: number;
}

/** Options for rebalancing operations */
interface RebalanceOptions {
  runType?: 'SIMULATION' | 'LIVE';
  includeHeldAway?: boolean;
}

export const rebalancingService = {
  // ---------------------------------------------------------------------------
  // Single-portfolio rebalancing
  // ---------------------------------------------------------------------------

  /**
   * Rebalance a single portfolio against a model.
   * Generates a trade blotter and persists a rebalancing run record.
   */
  async rebalanceSingle(
    portfolioId: string,
    modelId: number,
    options?: RebalanceOptions,
  ) {
    const runType = options?.runType ?? 'SIMULATION';
    const includeHeldAway = options?.includeHeldAway ?? false;

    // Fetch model
    const [model] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, modelId))
      .limit(1);

    if (!model) throw new Error('Model portfolio not found');

    const allocations = (model.allocations ?? []) as unknown as ModelAllocation[];

    // Fetch positions with security info
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

    // Total market value from positions
    let totalMV = 0;
    for (const pos of positions) {
      totalMV += Number(pos.market_value ?? 0);
    }

    // Held-away contribution by asset class
    const heldAwayByClass: Record<string, number> = {};

    if (includeHeldAway) {
      const heldAway = await db
        .select()
        .from(schema.heldAwayAssets)
        .where(eq(schema.heldAwayAssets.portfolio_id, portfolioId));

      for (const ha of heldAway) {
        const cls = ha.asset_class ?? 'UNKNOWN';
        const mv = Number(ha.market_value ?? 0);
        heldAwayByClass[cls] = (heldAwayByClass[cls] ?? 0) + mv;
        totalMV += mv;
      }
    }

    // Actual MV per asset class (positions only — held-away counted in total but not tradable)
    const actualMVByClass: Record<string, number> = {};
    for (const p of positions) {
      const cls = p.asset_class ?? 'UNKNOWN';
      actualMVByClass[cls] = (actualMVByClass[cls] ?? 0) + Number(p.market_value ?? 0);
    }

    // Target MV per class from model, minus held-away already present
    const targetMVByClass: Record<string, number> = {};
    for (const alloc of allocations) {
      const fullTargetMV = (alloc.target_pct / 100) * totalMV;
      const heldAwayMV = heldAwayByClass[alloc.asset_class] ?? 0;
      targetMVByClass[alloc.asset_class] = fullTargetMV - heldAwayMV;
    }

    // Generate blotter
    const blotter: BlotterEntry[] = [];

    for (const p of positions) {
      const cls = p.asset_class ?? 'UNKNOWN';
      const actualClassMV = actualMVByClass[cls] ?? 0;
      const targetClassMV = targetMVByClass[cls] ?? 0;

      if (actualClassMV === 0) continue;

      const positionMV = Number(p.market_value ?? 0);
      const positionShare = positionMV / actualClassMV;
      const classDelta = targetClassMV - actualClassMV;
      const positionDelta = classDelta * positionShare;

      if (Math.abs(positionDelta) < 0.01) continue;

      const pricePerUnit =
        Number(p.quantity ?? 0) > 0 ? positionMV / Number(p.quantity ?? 1) : 0;

      const deltaQty =
        pricePerUnit > 0 ? Math.round(Math.abs(positionDelta) / pricePerUnit) : 0;

      if (deltaQty === 0) continue;

      blotter.push({
        portfolioId,
        securityId: p.security_id!,
        ticker: p.ticker,
        assetClass: p.asset_class,
        side: positionDelta > 0 ? 'BUY' : 'SELL',
        quantity: deltaQty,
        estimatedValue: Math.round(Math.abs(positionDelta) * 100) / 100,
      });
    }

    // Persist rebalancing run
    const [run] = await db
      .insert(schema.rebalancingRuns)
      .values({
        portfolio_ids: [portfolioId] as unknown as Record<string, unknown>,
        model_portfolio_id: modelId,
        run_type: runType,
        rebalancing_status: 'DRAFT',
        input_params: {
          includeHeldAway,
          totalMV,
          heldAwayByClass,
        } as unknown as Record<string, unknown>,
        generated_blotter: blotter as unknown as Record<string, unknown>,
      })
      .returning();

    return run;
  },

  // ---------------------------------------------------------------------------
  // Group rebalancing
  // ---------------------------------------------------------------------------

  /**
   * Rebalance multiple portfolios against a single model.
   * Creates one rebalancing run record with all portfolio ids and a combined blotter.
   */
  async rebalanceGroup(
    portfolioIds: string[],
    modelId: number,
    options?: RebalanceOptions,
  ) {
    const runType = options?.runType ?? 'SIMULATION';
    const includeHeldAway = options?.includeHeldAway ?? false;

    const allBlotterEntries: BlotterEntry[] = [];

    for (const portfolioId of portfolioIds) {
      // Use the same logic as single rebalancing to generate blotter per portfolio
      const singleRun = await this.rebalanceSingle(portfolioId, modelId, {
        runType,
        includeHeldAway,
      });

      // Collect blotter entries from the generated run
      const entries = (singleRun.generated_blotter ?? []) as unknown as BlotterEntry[];
      allBlotterEntries.push(...entries);

      // Delete the individual run since we'll create a consolidated one
      await db
        .delete(schema.rebalancingRuns)
        .where(eq(schema.rebalancingRuns.id, singleRun.id));
    }

    // Create consolidated run
    const [run] = await db
      .insert(schema.rebalancingRuns)
      .values({
        portfolio_ids: portfolioIds as unknown as Record<string, unknown>,
        model_portfolio_id: modelId,
        run_type: runType,
        rebalancing_status: 'DRAFT',
        input_params: {
          includeHeldAway,
          portfolioCount: portfolioIds.length,
        } as unknown as Record<string, unknown>,
        generated_blotter: allBlotterEntries as unknown as Record<string, unknown>,
      })
      .returning();

    return run;
  },

  // ---------------------------------------------------------------------------
  // Cash-event rebalancing
  // ---------------------------------------------------------------------------

  /**
   * Adjust rebalancing considering a cash inflow or outflow.
   * An inflow increases the target total; an outflow decreases it.
   */
  async rebalanceOnCashEvent(
    portfolioId: string,
    cashAmount: number,
    direction: 'INFLOW' | 'OUTFLOW',
    modelId: number,
  ) {
    // Fetch model
    const [model] = await db
      .select()
      .from(schema.modelPortfolios)
      .where(eq(schema.modelPortfolios.id, modelId))
      .limit(1);

    if (!model) throw new Error('Model portfolio not found');

    const allocations = (model.allocations ?? []) as unknown as ModelAllocation[];

    // Fetch positions
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

    let currentMV = 0;
    for (const pos of positions) {
      currentMV += Number(pos.market_value ?? 0);
    }

    const adjustedCash = direction === 'INFLOW' ? cashAmount : -cashAmount;
    const targetTotalMV = currentMV + adjustedCash;

    if (targetTotalMV <= 0) {
      throw new Error('Cash outflow exceeds total portfolio value');
    }

    // Actual MV per class
    const actualMVByClass: Record<string, number> = {};
    for (const p of positions) {
      const cls = p.asset_class ?? 'UNKNOWN';
      actualMVByClass[cls] = (actualMVByClass[cls] ?? 0) + Number(p.market_value ?? 0);
    }

    // Target MV per class based on adjusted total
    const targetMVByClass: Record<string, number> = {};
    for (const alloc of allocations) {
      targetMVByClass[alloc.asset_class] = (alloc.target_pct / 100) * targetTotalMV;
    }

    // Generate blotter
    const blotter: BlotterEntry[] = [];

    for (const p of positions) {
      const cls = p.asset_class ?? 'UNKNOWN';
      const actualClassMV = actualMVByClass[cls] ?? 0;
      const targetClassMV = targetMVByClass[cls] ?? 0;

      if (actualClassMV === 0) continue;

      const positionMV = Number(p.market_value ?? 0);
      const positionShare = positionMV / actualClassMV;
      const classDelta = targetClassMV - actualClassMV;
      const positionDelta = classDelta * positionShare;

      if (Math.abs(positionDelta) < 0.01) continue;

      const pricePerUnit =
        Number(p.quantity ?? 0) > 0 ? positionMV / Number(p.quantity ?? 1) : 0;

      const deltaQty =
        pricePerUnit > 0 ? Math.round(Math.abs(positionDelta) / pricePerUnit) : 0;

      if (deltaQty === 0) continue;

      blotter.push({
        portfolioId,
        securityId: p.security_id!,
        ticker: p.ticker,
        assetClass: p.asset_class,
        side: positionDelta > 0 ? 'BUY' : 'SELL',
        quantity: deltaQty,
        estimatedValue: Math.round(Math.abs(positionDelta) * 100) / 100,
      });
    }

    // Persist run
    const [run] = await db
      .insert(schema.rebalancingRuns)
      .values({
        portfolio_ids: [portfolioId] as unknown as Record<string, unknown>,
        model_portfolio_id: modelId,
        run_type: 'SIMULATION',
        rebalancing_status: 'DRAFT',
        input_params: {
          cashEvent: true,
          cashAmount,
          direction,
          currentMV,
          targetTotalMV,
        } as unknown as Record<string, unknown>,
        generated_blotter: blotter as unknown as Record<string, unknown>,
      })
      .returning();

    return run;
  },

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  /** Set a DRAFT run to APPROVED */
  async approveRun(runId: number, approvedBy: number) {
    const [run] = await db
      .select()
      .from(schema.rebalancingRuns)
      .where(eq(schema.rebalancingRuns.id, runId))
      .limit(1);

    if (!run) throw new Error('Rebalancing run not found');
    if (run.rebalancing_status !== 'DRAFT') {
      throw new Error(`Cannot approve run in status ${run.rebalancing_status}`);
    }

    const [updated] = await db
      .update(schema.rebalancingRuns)
      .set({
        rebalancing_status: 'APPROVED',
        updated_at: new Date(),
        updated_by: String(approvedBy),
      })
      .where(eq(schema.rebalancingRuns.id, runId))
      .returning();

    return updated;
  },

  /** Set an APPROVED run to EXECUTED */
  async executeRun(runId: number, executedBy: number) {
    const [run] = await db
      .select()
      .from(schema.rebalancingRuns)
      .where(eq(schema.rebalancingRuns.id, runId))
      .limit(1);

    if (!run) throw new Error('Rebalancing run not found');
    if (run.rebalancing_status !== 'APPROVED') {
      throw new Error(`Cannot execute run in status ${run.rebalancing_status}`);
    }

    const [updated] = await db
      .update(schema.rebalancingRuns)
      .set({
        rebalancing_status: 'EXECUTED',
        executed_at: new Date(),
        executed_by: executedBy,
        updated_at: new Date(),
        updated_by: String(executedBy),
      })
      .where(eq(schema.rebalancingRuns.id, runId))
      .returning();

    return updated;
  },

  // ---------------------------------------------------------------------------
  // Run queries
  // ---------------------------------------------------------------------------

  /** List rebalancing runs with optional filters and pagination */
  async getRuns(filters?: {
    status?: string;
    portfolioId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.status) {
      conditions.push(
        eq(
          schema.rebalancingRuns.rebalancing_status,
          filters.status as 'DRAFT' | 'APPROVED' | 'EXECUTED' | 'CANCELLED',
        ),
      );
    }

    if (filters?.portfolioId) {
      conditions.push(
        sql`${schema.rebalancingRuns.portfolio_ids}::jsonb @> ${JSON.stringify([filters.portfolioId])}::jsonb` as any,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.rebalancingRuns)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.rebalancingRuns.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.rebalancingRuns)
      .where(where);

    const total = Number(countResult[0]?.count ?? 0);
    return { data, total, page, pageSize };
  },

  /** Get a single run by id */
  async getRun(id: number) {
    const [run] = await db
      .select()
      .from(schema.rebalancingRuns)
      .where(eq(schema.rebalancingRuns.id, id))
      .limit(1);

    return run ?? null;
  },

  // ---------------------------------------------------------------------------
  // Blotter editing
  // ---------------------------------------------------------------------------

  /** Update the generated_blotter on a DRAFT run */
  async editBlotter(runId: number, updatedBlotter: BlotterEntry[]) {
    const [run] = await db
      .select()
      .from(schema.rebalancingRuns)
      .where(eq(schema.rebalancingRuns.id, runId))
      .limit(1);

    if (!run) throw new Error('Rebalancing run not found');
    if (run.rebalancing_status !== 'DRAFT') {
      throw new Error('Can only edit blotter on DRAFT runs');
    }

    const [updated] = await db
      .update(schema.rebalancingRuns)
      .set({
        generated_blotter: updatedBlotter as unknown as Record<string, unknown>,
        updated_at: new Date(),
      })
      .where(eq(schema.rebalancingRuns.id, runId))
      .returning();

    return updated;
  },
};
