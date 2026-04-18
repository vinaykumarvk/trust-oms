/**
 * Withdrawal Service (Phase 3F)
 *
 * Handles withdrawal requests, withholding tax calculation,
 * approval, and execution (debiting cash ledger).
 *
 * Lifecycle: PENDING_APPROVAL -> APPROVED -> EXECUTED (debits cash ledger)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export const withdrawalService = {
  /** Request a withdrawal from a portfolio */
  async requestWithdrawal(data: {
    portfolioId: string;
    amount: number;
    currency: string;
    destinationAccount: string;
    type: string;
    requestedBy?: number;
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
      throw new Error('Withdrawal amount must be positive');
    }

    // Check sufficient cash balance
    const [ledger] = await db
      .select()
      .from(schema.cashLedger)
      .where(
        and(
          eq(schema.cashLedger.portfolio_id, data.portfolioId),
          eq(schema.cashLedger.currency, data.currency),
        ),
      )
      .limit(1);

    const availableBalance = parseFloat(ledger?.available_balance ?? '0');
    if (availableBalance < data.amount) {
      throw new Error(
        `Insufficient cash balance: available ${availableBalance}, requested ${data.amount}`,
      );
    }

    const [withdrawal] = await db
      .insert(schema.withdrawals)
      .values({
        portfolio_id: data.portfolioId,
        amount: String(data.amount),
        currency: data.currency,
        destination_account: data.destinationAccount,
        type: data.type,
        tax_withholding: '0',
        withdrawal_status: 'PENDING_APPROVAL',
        created_by: data.requestedBy ? String(data.requestedBy) : null,
      })
      .returning();

    return withdrawal;
  },

  /** Calculate withholding tax for a withdrawal (stub: 0% for most, 25% for early) */
  async calculateWithholdingTax(withdrawalId: number) {
    const [withdrawal] = await db
      .select()
      .from(schema.withdrawals)
      .where(eq(schema.withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      throw new Error(`Withdrawal not found: ${withdrawalId}`);
    }

    const amount = parseFloat(withdrawal.amount ?? '0');

    // Stub logic: 25% WHT for early withdrawal type, 0% for all others
    const isEarly = withdrawal.type === 'EARLY_WITHDRAWAL';
    const whtRate = isEarly ? 0.25 : 0;
    const whtAmount = amount * whtRate;

    const [updated] = await db
      .update(schema.withdrawals)
      .set({
        tax_withholding: String(whtAmount),
        updated_at: new Date(),
      })
      .where(eq(schema.withdrawals.id, withdrawalId))
      .returning();

    return {
      withdrawal: updated,
      wht_rate: whtRate,
      wht_amount: whtAmount,
      net_amount: amount - whtAmount,
    };
  },

  /** Approve a pending withdrawal */
  async approveWithdrawal(withdrawalId: number, approvedBy: number) {
    const [withdrawal] = await db
      .select()
      .from(schema.withdrawals)
      .where(eq(schema.withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      throw new Error(`Withdrawal not found: ${withdrawalId}`);
    }

    if (withdrawal.withdrawal_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot approve withdrawal in status ${withdrawal.withdrawal_status}; must be PENDING_APPROVAL`,
      );
    }

    const [updated] = await db
      .update(schema.withdrawals)
      .set({
        withdrawal_status: 'APPROVED',
        updated_by: String(approvedBy),
        updated_at: new Date(),
      })
      .where(eq(schema.withdrawals.id, withdrawalId))
      .returning();

    return updated;
  },

  /** Execute an approved withdrawal: debit cash ledger */
  async executeWithdrawal(withdrawalId: number) {
    const [withdrawal] = await db
      .select()
      .from(schema.withdrawals)
      .where(eq(schema.withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      throw new Error(`Withdrawal not found: ${withdrawalId}`);
    }

    if (withdrawal.withdrawal_status !== 'APPROVED') {
      throw new Error(
        `Cannot execute withdrawal in status ${withdrawal.withdrawal_status}; must be APPROVED`,
      );
    }

    const portfolioId = withdrawal.portfolio_id;
    const currency = withdrawal.currency ?? 'PHP';
    const grossAmount = parseFloat(withdrawal.amount ?? '0');
    const taxWithholding = parseFloat(withdrawal.tax_withholding ?? '0');
    const netAmount = grossAmount - taxWithholding;

    if (!portfolioId) {
      throw new Error(`Withdrawal ${withdrawalId} has no portfolio_id`);
    }

    // Find the cash ledger for portfolio + currency
    const [ledger] = await db
      .select()
      .from(schema.cashLedger)
      .where(
        and(
          eq(schema.cashLedger.portfolio_id, portfolioId),
          eq(schema.cashLedger.currency, currency),
        ),
      )
      .limit(1);

    if (!ledger) {
      throw new Error(`No cash ledger found for portfolio ${portfolioId}, currency ${currency}`);
    }

    const currentBalance = parseFloat(ledger.balance ?? '0');
    if (currentBalance < netAmount) {
      throw new Error(
        `Insufficient cash for withdrawal: balance ${currentBalance}, net amount ${netAmount}`,
      );
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Insert cash transaction (debit the net amount)
    const [transaction] = await db
      .insert(schema.cashTransactions)
      .values({
        cash_ledger_id: ledger.id,
        type: 'DEBIT',
        amount: String(-netAmount),
        currency,
        reference: `WITHDRAW-${withdrawalId}`,
        value_date: todayStr,
      })
      .returning();

    // Update ledger balance
    const newBalance = currentBalance - netAmount;
    const newAvailable = parseFloat(ledger.available_balance ?? '0') - netAmount;

    await db
      .update(schema.cashLedger)
      .set({
        balance: String(newBalance),
        available_balance: String(newAvailable),
        as_of_date: todayStr,
        updated_at: new Date(),
      })
      .where(eq(schema.cashLedger.id, ledger.id));

    // Mark withdrawal as EXECUTED
    const [updated] = await db
      .update(schema.withdrawals)
      .set({
        withdrawal_status: 'EXECUTED',
        updated_at: new Date(),
      })
      .where(eq(schema.withdrawals.id, withdrawalId))
      .returning();

    return {
      withdrawal: updated,
      ledger_id: ledger.id,
      transaction_id: transaction.id,
      net_amount: netAmount,
      tax_withheld: taxWithholding,
      new_balance: newBalance,
    };
  },

  /** List withdrawals with filters and pagination */
  async getWithdrawals(filters: {
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
      conditions.push(eq(schema.withdrawals.portfolio_id, filters.portfolioId));
    }

    if (filters.status) {
      conditions.push(eq(schema.withdrawals.withdrawal_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.withdrawals)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.withdrawals.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.withdrawals)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
