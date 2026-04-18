/**
 * Cash Ledger Service (Phase 3A)
 *
 * Manages cash balances, transactions, and liquidity projections
 * for trust portfolios.
 *
 * BRD FR-CSH-004: Liquidity heat-map with T/T+1/T+2 cash positions.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

export const cashLedgerService = {
  /** Get balance for a portfolio in a currency */
  async getBalance(
    portfolioId: string,
    currency?: string,
  ): Promise<
    Array<{
      id: number;
      portfolio_id: string | null;
      account_type: string | null;
      currency: string | null;
      balance: string | null;
      available_balance: string | null;
      as_of_date: string | null;
    }>
  > {
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.cashLedger.portfolio_id, portfolioId),
    ];

    if (currency) {
      conditions.push(eq(schema.cashLedger.currency, currency));
    }

    const where = and(...conditions);

    const ledgers = await db
      .select({
        id: schema.cashLedger.id,
        portfolio_id: schema.cashLedger.portfolio_id,
        account_type: schema.cashLedger.account_type,
        currency: schema.cashLedger.currency,
        balance: schema.cashLedger.balance,
        available_balance: schema.cashLedger.available_balance,
        as_of_date: schema.cashLedger.as_of_date,
      })
      .from(schema.cashLedger)
      .where(where);

    return ledgers;
  },

  /** Post a cash entry */
  async postEntry(data: {
    portfolioId: string;
    type: string;
    amount: number;
    currency: string;
    reference: string;
  }) {
    const currency = data.currency || 'PHP';

    // Find or create cash ledger for the portfolio + currency
    let [ledger] = await db
      .select()
      .from(schema.cashLedger)
      .where(
        and(
          eq(schema.cashLedger.portfolio_id, data.portfolioId),
          eq(schema.cashLedger.currency, currency),
        ),
      )
      .limit(1);

    const todayStr = new Date().toISOString().split('T')[0];

    if (!ledger) {
      const [newLedger] = await db
        .insert(schema.cashLedger)
        .values({
          portfolio_id: data.portfolioId,
          account_type: 'GENERAL',
          currency,
          balance: '0',
          available_balance: '0',
          as_of_date: todayStr,
        })
        .returning();
      ledger = newLedger;
    }

    // Determine sign: CREDIT is positive, DEBIT is negative
    const signedAmount = data.type === 'DEBIT' ? -Math.abs(data.amount) : Math.abs(data.amount);

    // Insert cash transaction
    const [transaction] = await db
      .insert(schema.cashTransactions)
      .values({
        cash_ledger_id: ledger.id,
        type: data.type,
        amount: String(signedAmount),
        currency,
        reference: data.reference,
        value_date: todayStr,
      })
      .returning();

    // Update ledger balance
    const newBalance = parseFloat(ledger.balance ?? '0') + signedAmount;
    const newAvailable = parseFloat(ledger.available_balance ?? '0') + signedAmount;

    await db
      .update(schema.cashLedger)
      .set({
        balance: String(newBalance),
        available_balance: String(newAvailable),
        as_of_date: todayStr,
        updated_at: new Date(),
      })
      .where(eq(schema.cashLedger.id, ledger.id));

    return {
      transaction_id: transaction.id,
      ledger_id: ledger.id,
      amount: signedAmount,
      new_balance: newBalance,
    };
  },

  /** Get transactions for a portfolio */
  async getTransactions(
    portfolioId: string,
    params?: {
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = params?.page ?? 1;
    const pageSize = Math.min(params?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    // First, get ledger IDs for this portfolio
    const ledgers = await db
      .select({ id: schema.cashLedger.id })
      .from(schema.cashLedger)
      .where(eq(schema.cashLedger.portfolio_id, portfolioId));

    if (ledgers.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }

    const ledgerIds = ledgers.map((l: { id: number }) => l.id);

    // Build conditions for transactions
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.cashTransactions.cash_ledger_id} IN (${sql.join(
        ledgerIds.map((id: number) => sql`${id}`),
        sql`, `,
      )})` as any,
    ];

    if (params?.startDate) {
      conditions.push(gte(schema.cashTransactions.value_date, params.startDate));
    }

    if (params?.endDate) {
      conditions.push(lte(schema.cashTransactions.value_date, params.endDate));
    }

    const where = and(...conditions);

    const data = await db
      .select()
      .from(schema.cashTransactions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.cashTransactions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cashTransactions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get liquidity heat-map: T/T+1/T+2 cash positions by currency (BRD FR-CSH-004) */
  async getLiquidityHeatMap(): Promise<
    Array<{ currency: string; t0: number; t1: number; t2: number }>
  > {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const t1Date = new Date(today);
    t1Date.setDate(t1Date.getDate() + 1);
    const t1Str = t1Date.toISOString().split('T')[0];

    const t2Date = new Date(today);
    t2Date.setDate(t2Date.getDate() + 2);
    const t2Str = t2Date.toISOString().split('T')[0];

    // Get all cash ledger balances grouped by currency
    const balances = await db
      .select({
        currency: schema.cashLedger.currency,
        total_balance: sql<string>`COALESCE(SUM(${schema.cashLedger.balance}::numeric), 0)`,
      })
      .from(schema.cashLedger)
      .groupBy(schema.cashLedger.currency);

    // Build a map of currency -> current balance
    const currencyMap = new Map<string, number>();
    for (const row of balances) {
      if (row.currency) {
        currencyMap.set(row.currency, parseFloat(row.total_balance ?? '0'));
      }
    }

    // Get pending settlements due on T+1 grouped by currency
    const t1Settlements = await db
      .select({
        currency: schema.settlementInstructions.currency,
        total_amount: sql<string>`COALESCE(SUM(${schema.settlementInstructions.cash_amount}::numeric), 0)`,
      })
      .from(schema.settlementInstructions)
      .where(
        and(
          eq(schema.settlementInstructions.settlement_status, 'PENDING'),
          eq(schema.settlementInstructions.value_date, t1Str),
        ),
      )
      .groupBy(schema.settlementInstructions.currency);

    // Get pending settlements due on T+2 grouped by currency
    const t2Settlements = await db
      .select({
        currency: schema.settlementInstructions.currency,
        total_amount: sql<string>`COALESCE(SUM(${schema.settlementInstructions.cash_amount}::numeric), 0)`,
      })
      .from(schema.settlementInstructions)
      .where(
        and(
          eq(schema.settlementInstructions.settlement_status, 'PENDING'),
          eq(schema.settlementInstructions.value_date, t2Str),
        ),
      )
      .groupBy(schema.settlementInstructions.currency);

    // Build t1/t2 settlement maps
    const t1Map = new Map<string, number>();
    for (const row of t1Settlements) {
      if (row.currency) {
        t1Map.set(row.currency, parseFloat(row.total_amount ?? '0'));
      }
    }

    const t2Map = new Map<string, number>();
    for (const row of t2Settlements) {
      if (row.currency) {
        t2Map.set(row.currency, parseFloat(row.total_amount ?? '0'));
      }
    }

    // Collect all currencies seen
    const allCurrencies = new Set<string>();
    for (const c of currencyMap.keys()) allCurrencies.add(c);
    for (const c of t1Map.keys()) allCurrencies.add(c);
    for (const c of t2Map.keys()) allCurrencies.add(c);

    // If no data, return default PHP entry
    if (allCurrencies.size === 0) {
      return [{ currency: 'PHP', t0: 0, t1: 0, t2: 0 }];
    }

    const result: Array<{ currency: string; t0: number; t1: number; t2: number }> = [];

    for (const currency of allCurrencies) {
      const t0 = currencyMap.get(currency) ?? 0;
      const t1SettlementAmount = t1Map.get(currency) ?? 0;
      const t2SettlementAmount = t2Map.get(currency) ?? 0;

      result.push({
        currency,
        t0,
        t1: t0 + t1SettlementAmount,
        t2: t0 + t1SettlementAmount + t2SettlementAmount,
      });
    }

    return result;
  },
};
