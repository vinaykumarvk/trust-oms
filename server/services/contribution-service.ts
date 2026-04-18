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

    // Update ledger balance
    const newBalance = parseFloat(ledger.balance ?? '0') + amount;
    const newAvailable = parseFloat(ledger.available_balance ?? '0') + amount;

    await db
      .update(schema.cashLedger)
      .set({
        balance: String(newBalance),
        available_balance: String(newAvailable),
        as_of_date: todayStr,
        updated_at: new Date(),
      })
      .where(eq(schema.cashLedger.id, ledger.id));

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
      new_balance: newBalance,
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
