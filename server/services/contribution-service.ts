/**
 * Contribution Service (Phase 3F)
 *
 * Handles recording, approval, and posting of cash contributions
 * to trust portfolios.
 *
 * Lifecycle: PENDING_APPROVAL -> APPROVED -> POSTED (credits cash ledger)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export const contributionService = {
  /** Record a new contribution */
  async recordContribution(data: {
    portfolioId: string;
    amount: number;
    currency: string;
    sourceAccount: string;
    type: string;
    recordedBy?: number;
  }) {
    // Validate portfolio exists
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, data.portfolioId))
      .limit(1);

    if (!portfolio) {
      throw new Error(`Portfolio not found: ${data.portfolioId}`);
    }

    if (data.amount <= 0) {
      throw new Error('Contribution amount must be positive');
    }

    const [contribution] = await db
      .insert(schema.contributions)
      .values({
        portfolio_id: data.portfolioId,
        amount: String(data.amount),
        currency: data.currency,
        source_account: data.sourceAccount,
        type: data.type,
        contribution_status: 'PENDING_APPROVAL',
        created_by: data.recordedBy ? String(data.recordedBy) : null,
      })
      .returning();

    return contribution;
  },

  /** Approve a pending contribution */
  async approveContribution(contributionId: number, approvedBy: number) {
    const [contribution] = await db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId))
      .limit(1);

    if (!contribution) {
      throw new Error(`Contribution not found: ${contributionId}`);
    }

    if (contribution.contribution_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot approve contribution in status ${contribution.contribution_status}; must be PENDING_APPROVAL`,
      );
    }

    const [updated] = await db
      .update(schema.contributions)
      .set({
        contribution_status: 'APPROVED',
        updated_by: String(approvedBy),
        updated_at: new Date(),
      })
      .where(eq(schema.contributions.id, contributionId))
      .returning();

    return updated;
  },

  /** Post an approved contribution to the cash ledger */
  async postContribution(contributionId: number) {
    const [contribution] = await db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId))
      .limit(1);

    if (!contribution) {
      throw new Error(`Contribution not found: ${contributionId}`);
    }

    if (contribution.contribution_status !== 'APPROVED') {
      throw new Error(
        `Cannot post contribution in status ${contribution.contribution_status}; must be APPROVED`,
      );
    }

    const portfolioId = contribution.portfolio_id;
    const currency = contribution.currency ?? 'PHP';
    const amount = parseFloat(contribution.amount ?? '0');

    if (!portfolioId) {
      throw new Error(`Contribution ${contributionId} has no portfolio_id`);
    }

    // Find or create cash ledger for portfolio + currency
    let [ledger] = await db
      .select()
      .from(schema.cashLedger)
      .where(
        and(
          eq(schema.cashLedger.portfolio_id, portfolioId),
          eq(schema.cashLedger.currency, currency),
        ),
      )
      .limit(1);

    const todayStr = new Date().toISOString().split('T')[0];

    if (!ledger) {
      const [newLedger] = await db
        .insert(schema.cashLedger)
        .values({
          portfolio_id: portfolioId,
          account_type: 'GENERAL',
          currency,
          balance: '0',
          available_balance: '0',
          as_of_date: todayStr,
        })
        .returning();
      ledger = newLedger;
    }

    // Insert cash transaction (credit)
    const [transaction] = await db
      .insert(schema.cashTransactions)
      .values({
        cash_ledger_id: ledger.id,
        type: 'CREDIT',
        amount: String(amount),
        currency,
        reference: `CONTRIB-${contributionId}`,
        value_date: todayStr,
      })
      .returning();

    // Atomic ledger balance increment — prevents lost-update race condition
    const [updatedLedger] = await db
      .update(schema.cashLedger)
      .set({
        balance: sql`(${schema.cashLedger.balance}::numeric + ${amount})::text`,
        available_balance: sql`(${schema.cashLedger.available_balance}::numeric + ${amount})::text`,
        as_of_date: todayStr,
        updated_at: new Date(),
      })
      .where(eq(schema.cashLedger.id, ledger.id))
      .returning();

    // FR-CON-006: Generate a tax event for the contribution.
    // In-kind contributions may trigger capital gains recognition;
    // cash contributions record the inflow for Documentary Stamp Tax (DST)
    // tracking where applicable under Philippine tax regulations.
    await db
      .insert(schema.taxEvents)
      .values({
        portfolio_id: portfolioId,
        tax_type: 'WHT',
        gross_amount: String(amount),
        tax_rate: '0',
        tax_amount: '0',
        source: 'CONTRIBUTION',
        filing_status: 'PENDING',
        certificate_ref: `CONTRIB-${contributionId}`,
      })
      .catch((err: unknown) => {
        // Non-blocking: tax event failure should not prevent contribution posting
        console.error('[ContributionService] Failed to create tax event:', err instanceof Error ? err.message : err);
      });

    // Mark contribution as POSTED
    const [updated] = await db
      .update(schema.contributions)
      .set({
        contribution_status: 'POSTED',
        updated_at: new Date(),
      })
      .where(eq(schema.contributions.id, contributionId))
      .returning();

    return {
      contribution: updated,
      ledger_id: ledger.id,
      transaction_id: transaction.id,
      amount,
      new_balance: parseFloat(updatedLedger.balance ?? '0'),
      tax_event_type: 'WHT',
    };
  },

  // ---------------------------------------------------------------------------
  // FR-CON-006: Unmatched Inventory View
  // ---------------------------------------------------------------------------

  /**
   * Query positions for a portfolio that don't have matching settlement
   * instructions yet. Returns each position with its security, quantity,
   * cost_basis, and matched / unmatched status.
   */
  async getUnmatchedInventory(portfolioId: string) {
    // Left-join positions to settlement instructions via orders -> trades.
    // A position is "matched" when there exists at least one settlement
    // instruction for a trade whose parent order is in the same portfolio
    // and for the same security.
    const rows = await db
      .select({
        position_id: schema.positions.id,
        security_id: schema.positions.security_id,
        security_name: schema.securities.name,
        quantity: schema.positions.quantity,
        cost_basis: schema.positions.cost_basis,
        as_of_date: schema.positions.as_of_date,
        settlement_count: sql<number>`COUNT(${schema.settlementInstructions.id})::int`,
      })
      .from(schema.positions)
      .leftJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .leftJoin(
        schema.orders,
        and(
          eq(schema.orders.portfolio_id, schema.positions.portfolio_id),
          eq(schema.orders.security_id, schema.positions.security_id),
        ),
      )
      .leftJoin(
        schema.trades,
        eq(schema.trades.order_id, schema.orders.order_id),
      )
      .leftJoin(
        schema.settlementInstructions,
        eq(schema.settlementInstructions.trade_id, schema.trades.trade_id),
      )
      .where(eq(schema.positions.portfolio_id, portfolioId))
      .groupBy(
        schema.positions.id,
        schema.positions.security_id,
        schema.securities.name,
        schema.positions.quantity,
        schema.positions.cost_basis,
        schema.positions.as_of_date,
      );

    return rows.map((r: typeof rows[number]) => ({
      position_id: r.position_id,
      security_id: r.security_id,
      security_name: r.security_name,
      quantity: parseFloat(r.quantity ?? '0'),
      cost_basis: parseFloat(r.cost_basis ?? '0'),
      as_of_date: r.as_of_date,
      status: r.settlement_count > 0 ? 'MATCHED' as const : 'UNMATCHED' as const,
    }));
  },

  /**
   * Live volume decrement — reduce a position's quantity when a settlement
   * match is posted. Throws if quantity would go negative.
   */
  async decrementInventory(positionId: number, quantity: number) {
    if (quantity <= 0) {
      throw new Error('Decrement quantity must be positive');
    }

    // Atomic decrement with WHERE guard — prevents TOCTOU race condition.
    // The WHERE clause ensures quantity >= requested, so concurrent calls
    // cannot drive the balance negative.
    const result = await db
      .update(schema.positions)
      .set({
        quantity: sql`(${schema.positions.quantity}::numeric - ${quantity})::text`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(schema.positions.id, positionId),
          sql`${schema.positions.quantity}::numeric >= ${quantity}`,
        ),
      )
      .returning();

    if (result.length === 0) {
      // Distinguish "not found" from "insufficient quantity"
      const [position] = await db
        .select()
        .from(schema.positions)
        .where(eq(schema.positions.id, positionId))
        .limit(1);

      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }
      const currentQty = parseFloat(position.quantity ?? '0');
      throw new Error(
        `Insufficient quantity: requested ${quantity} but position only has ${currentQty}`,
      );
    }

    const updated = result[0];
    const newQty = parseFloat(updated.quantity ?? '0');

    return {
      position_id: positionId,
      previous_quantity: newQty + quantity,
      decremented_by: quantity,
      new_quantity: newQty,
      position: updated,
    };
  },

  /** List contributions with filters and pagination */
  async getContributions(filters: {
    portfolioId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.portfolioId) {
      conditions.push(eq(schema.contributions.portfolio_id, filters.portfolioId));
    }

    if (filters.status) {
      conditions.push(eq(schema.contributions.contribution_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.contributions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.contributions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.contributions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
