/**
 * Reconciliation Service (Phase 3B)
 *
 * Handles transaction and position reconciliation, break management,
 * aging analysis, and resolution workflows.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel } from 'drizzle-orm';

type Trade = InferSelectModel<typeof schema.trades>;

export const reconciliationService = {
  // -------------------------------------------------------------------------
  // Run transaction reconciliation for a date
  // -------------------------------------------------------------------------
  async runTransactionRecon(date: string, triggeredBy?: number) {
    // Create the recon run record
    const [run] = await db
      .insert(schema.reconRuns)
      .values({
        type: 'TRANSACTION',
        run_date: date,
        recon_status: 'RUNNING',
        started_at: new Date(),
        triggered_by: triggeredBy ?? null,
      })
      .returning();

    try {
      // Get all trades for the date (trades with execution_time on this date)
      const trades = await db
        .select()
        .from(schema.trades)
        .where(
          sql`${schema.trades.execution_time}::date = ${date}`,
        );

      // Get all confirmations for those trades
      const tradeIds = trades.map((t: Trade) => t.trade_id);

      let confirmations: Array<{
        id: number;
        trade_id: string | null;
        match_status: string | null;
        exception_reason: string | null;
      }> = [];

      if (tradeIds.length > 0) {
        confirmations = await db
          .select({
            id: schema.confirmations.id,
            trade_id: schema.confirmations.trade_id,
            match_status: schema.confirmations.match_status,
            exception_reason: schema.confirmations.exception_reason,
          })
          .from(schema.confirmations)
          .where(
            sql`${schema.confirmations.trade_id} = ANY(${tradeIds})`,
          );
      }

      const confirmedTradeIds = new Set(
        confirmations.map((c) => c.trade_id).filter(Boolean),
      );

      const breaks: Array<{
        type: string;
        entity_id: string;
        break_type: string;
        internal_value: string | null;
        external_value: string | null;
        difference: string | null;
      }> = [];

      // Trades without confirmations = MISSING_EXTERNAL break
      for (const trade of trades) {
        if (!confirmedTradeIds.has(trade.trade_id)) {
          breaks.push({
            type: 'TRANSACTION',
            entity_id: trade.trade_id,
            break_type: 'MISSING_EXTERNAL',
            internal_value: trade.execution_price,
            external_value: null,
            difference: null,
          });
        }
      }

      // Confirmations with EXCEPTION status = price/qty mismatch break
      for (const conf of confirmations) {
        if (conf.match_status === 'EXCEPTION') {
          const reason = conf.exception_reason ?? '';
          const breakType = reason.toLowerCase().includes('price')
            ? 'PRICE_MISMATCH'
            : reason.toLowerCase().includes('quantity')
              ? 'QUANTITY_MISMATCH'
              : 'PRICE_MISMATCH';

          breaks.push({
            type: 'TRANSACTION',
            entity_id: conf.trade_id ?? String(conf.id),
            break_type: breakType,
            internal_value: null,
            external_value: null,
            difference: null,
          });
        }
      }

      // Insert break records
      for (const brk of breaks) {
        await db.insert(schema.reconBreaks).values({
          run_id: run.id,
          type: brk.type,
          entity_id: brk.entity_id,
          break_type: brk.break_type,
          internal_value: brk.internal_value,
          external_value: brk.external_value,
          difference: brk.difference,
          break_status: 'OPEN',
        });
      }

      // Update run with totals
      const totalRecords = trades.length;
      const matchedRecords = totalRecords - breaks.length;

      const [updatedRun] = await db
        .update(schema.reconRuns)
        .set({
          recon_status: 'COMPLETED',
          completed_at: new Date(),
          total_records: totalRecords,
          matched_records: Math.max(matchedRecords, 0),
          breaks_found: breaks.length,
        })
        .where(eq(schema.reconRuns.id, run.id))
        .returning();

      return { run: updatedRun, breaks_created: breaks.length };
    } catch (err) {
      // Mark run as failed
      await db
        .update(schema.reconRuns)
        .set({
          recon_status: 'FAILED',
          completed_at: new Date(),
        })
        .where(eq(schema.reconRuns.id, run.id));

      throw err;
    }
  },

  // -------------------------------------------------------------------------
  // Run internal triad reconciliation (custody vs. accounting) for a date
  // -------------------------------------------------------------------------
  async runInternalTriadRecon(date: string, triggeredBy?: number) {
    // Create the recon run record
    const [run] = await db
      .insert(schema.reconRuns)
      .values({
        type: 'INTERNAL_TRIAD',
        run_date: date,
        recon_status: 'RUNNING',
        started_at: new Date(),
        triggered_by: triggeredBy ?? null,
      })
      .returning();

    try {
      // Step 1: Query all positions (custody source of truth)
      const positions = await db
        .select()
        .from(schema.positions);

      // Step 2: Query all NAV computations for the specified date (accounting valuation)
      const navComps = await db
        .select()
        .from(schema.navComputations)
        .where(eq(schema.navComputations.computation_date, date));

      // Step 3: Group positions by portfolio_id
      const positionsByPortfolio = new Map<string, typeof positions>();
      for (const pos of positions) {
        const pid = pos.portfolio_id ?? '__unknown__';
        const group = positionsByPortfolio.get(pid);
        if (group) {
          group.push(pos);
        } else {
          positionsByPortfolio.set(pid, [pos]);
        }
      }

      // Build a lookup of NAV computations by portfolio_id
      const navByPortfolio = new Map<string, typeof navComps[number]>();
      for (const nav of navComps) {
        if (nav.portfolio_id) {
          navByPortfolio.set(nav.portfolio_id, nav);
        }
      }

      // Step 4: For each portfolio, compare custody total vs accounting total
      const breaks: Array<{
        type: string;
        entity_id: string;
        break_type: string;
        internal_value: string;
        external_value: string;
        difference: string;
      }> = [];

      // Collect all unique portfolio IDs from both positions and NAV computations
      const allPortfolioIds = new Set<string>([
        ...positionsByPortfolio.keys(),
        ...navByPortfolio.keys(),
      ]);

      for (const portfolioId of allPortfolioIds) {
        if (portfolioId === '__unknown__') continue;

        // Sum position market_values as custodyTotal
        const portfolioPositions = positionsByPortfolio.get(portfolioId) ?? [];
        const custodyTotal = portfolioPositions.reduce(
          (sum: number, pos: typeof positions[number]) =>
            sum + parseFloat(pos.market_value ?? '0'),
          0,
        );

        // Find the NAV computation for this portfolio and date
        const navComp = navByPortfolio.get(portfolioId);
        const accountingTotal = navComp ? parseFloat(navComp.total_nav ?? '0') : 0;

        // Calculate variance
        const variance = Math.abs(custodyTotal - accountingTotal);

        // If variance > threshold, create a break
        if (variance > 0.01) {
          breaks.push({
            type: 'INTERNAL_TRIAD',
            entity_id: portfolioId,
            break_type: 'CUSTODY_VS_ACCOUNTING',
            internal_value: String(custodyTotal),
            external_value: String(accountingTotal),
            difference: String(custodyTotal - accountingTotal),
          });
        }
      }

      // Step 5: Insert break records
      for (const brk of breaks) {
        await db.insert(schema.reconBreaks).values({
          run_id: run.id,
          type: brk.type,
          entity_id: brk.entity_id,
          break_type: brk.break_type,
          internal_value: brk.internal_value,
          external_value: brk.external_value,
          difference: brk.difference,
          break_status: 'OPEN',
        });
      }

      // Step 6: Update run record with totals
      const totalRecords = allPortfolioIds.size - (positionsByPortfolio.has('__unknown__') ? 1 : 0);
      const matchedRecords = totalRecords - breaks.length;

      const [updatedRun] = await db
        .update(schema.reconRuns)
        .set({
          recon_status: 'COMPLETED',
          completed_at: new Date(),
          total_records: totalRecords,
          matched_records: Math.max(matchedRecords, 0),
          breaks_found: breaks.length,
        })
        .where(eq(schema.reconRuns.id, run.id))
        .returning();

      return { run: updatedRun, breaks_created: breaks.length };
    } catch (err) {
      // Mark run as failed
      await db
        .update(schema.reconRuns)
        .set({
          recon_status: 'FAILED',
          completed_at: new Date(),
        })
        .where(eq(schema.reconRuns.id, run.id));

      throw err;
    }
  },

  // -------------------------------------------------------------------------
  // Run position reconciliation for a date
  // -------------------------------------------------------------------------
  async runPositionRecon(date: string, triggeredBy?: number) {
    // Create the recon run record
    const [run] = await db
      .insert(schema.reconRuns)
      .values({
        type: 'POSITION',
        run_date: date,
        recon_status: 'RUNNING',
        started_at: new Date(),
        triggered_by: triggeredBy ?? null,
      })
      .returning();

    try {
      // Get all positions
      const positions = await db
        .select()
        .from(schema.positions);

      const totalRecords = positions.length;
      const breaks: Array<{
        type: string;
        entity_id: string;
        break_type: string;
        internal_value: string;
        external_value: string;
        difference: string;
      }> = [];

      // Simulate external comparison: generate breaks for ~5-10% of positions
      for (const pos of positions) {
        const shouldBreak = Math.random() < 0.08; // ~8% break rate
        if (shouldBreak) {
          const qty = parseFloat(pos.quantity ?? '0');
          // Simulate a small quantity discrepancy
          const externalQty = qty + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 10 + 1);
          const diff = qty - externalQty;

          breaks.push({
            type: 'POSITION',
            entity_id: String(pos.id),
            break_type: 'QUANTITY_MISMATCH',
            internal_value: String(qty),
            external_value: String(externalQty),
            difference: String(diff),
          });
        }
      }

      // Insert break records
      for (const brk of breaks) {
        await db.insert(schema.reconBreaks).values({
          run_id: run.id,
          type: brk.type,
          entity_id: brk.entity_id,
          break_type: brk.break_type,
          internal_value: brk.internal_value,
          external_value: brk.external_value,
          difference: brk.difference,
          break_status: 'OPEN',
        });
      }

      const matchedRecords = totalRecords - breaks.length;

      const [updatedRun] = await db
        .update(schema.reconRuns)
        .set({
          recon_status: 'COMPLETED',
          completed_at: new Date(),
          total_records: totalRecords,
          matched_records: Math.max(matchedRecords, 0),
          breaks_found: breaks.length,
        })
        .where(eq(schema.reconRuns.id, run.id))
        .returning();

      return { run: updatedRun, breaks_created: breaks.length };
    } catch (err) {
      await db
        .update(schema.reconRuns)
        .set({
          recon_status: 'FAILED',
          completed_at: new Date(),
        })
        .where(eq(schema.reconRuns.id, run.id));

      throw err;
    }
  },

  // -------------------------------------------------------------------------
  // Get breaks with filters
  // -------------------------------------------------------------------------
  async getBreaks(filters: {
    type?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.type) {
      conditions.push(eq(schema.reconBreaks.type, filters.type));
    }
    if (filters.status) {
      conditions.push(
        eq(schema.reconBreaks.break_status, filters.status as 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED'),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.reconBreaks)
      .where(where)
      .orderBy(desc(schema.reconBreaks.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.reconBreaks)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // Resolve a break
  // -------------------------------------------------------------------------
  async resolveBreak(
    breakId: number,
    resolution: { resolvedBy: number; notes: string },
  ) {
    const [brk] = await db
      .select()
      .from(schema.reconBreaks)
      .where(eq(schema.reconBreaks.id, breakId))
      .limit(1);

    if (!brk) throw new Error(`Break not found: ${breakId}`);
    if (brk.break_status === 'RESOLVED') {
      throw new Error(`Break ${breakId} is already resolved`);
    }

    const [updated] = await db
      .update(schema.reconBreaks)
      .set({
        break_status: 'RESOLVED',
        resolved_by: resolution.resolvedBy,
        resolved_at: new Date(),
        resolution_notes: resolution.notes,
        updated_at: new Date(),
      })
      .where(eq(schema.reconBreaks.id, breakId))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Get break aging buckets
  // -------------------------------------------------------------------------
  async getBreakAging() {
    // Query open (unresolved) breaks
    const openBreaks = await db
      .select({
        id: schema.reconBreaks.id,
        created_at: schema.reconBreaks.created_at,
      })
      .from(schema.reconBreaks)
      .where(
        and(
          sql`${schema.reconBreaks.break_status} != 'RESOLVED'`,
        ),
      );

    const now = Date.now();
    const buckets: Record<string, number> = {
      '0-1d': 0,
      '2-3d': 0,
      '4-7d': 0,
      '7+d': 0,
    };

    for (const brk of openBreaks) {
      const ageDays = (now - new Date(brk.created_at).getTime()) / 86_400_000;
      if (ageDays <= 1) {
        buckets['0-1d']++;
      } else if (ageDays <= 3) {
        buckets['2-3d']++;
      } else if (ageDays <= 7) {
        buckets['4-7d']++;
      } else {
        buckets['7+d']++;
      }
    }

    return {
      buckets,
      total: openBreaks.length,
    };
  },

  // -------------------------------------------------------------------------
  // Get reconciliation summary
  // -------------------------------------------------------------------------
  async getSummary() {
    const runs = await db.select().from(schema.reconRuns).where(eq(schema.reconRuns.is_deleted, false));
    const breaks = await db.select().from(schema.reconBreaks).where(eq(schema.reconBreaks.is_deleted, false));
    const today = new Date().toISOString().split('T')[0];

    const lastRun = runs.sort((a: typeof runs[number], b: typeof runs[number]) => (b.started_at?.getTime() || 0) - (a.started_at?.getTime() || 0))[0];
    const openBreaks = breaks.filter((b: typeof breaks[number]) => b.break_status === 'OPEN' || b.break_status === 'INVESTIGATING');
    const resolvedToday = breaks.filter((b: typeof breaks[number]) => b.resolved_at && b.resolved_at.toISOString().split('T')[0] === today);

    return {
      totalRuns: runs.length,
      lastRunStatus: lastRun?.recon_status || 'N/A',
      lastRunDate: lastRun?.run_date || null,
      openBreaks: openBreaks.length,
      resolvedToday: resolvedToday.length,
    };
  },

  // -------------------------------------------------------------------------
  // Get recon run history
  // -------------------------------------------------------------------------
  async getRunHistory(params?: {
    type?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params?.page ?? 1;
    const pageSize = Math.min(params?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (params?.type) {
      conditions.push(eq(schema.reconRuns.type, params.type));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.reconRuns)
      .where(where)
      .orderBy(desc(schema.reconRuns.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.reconRuns)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
