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
import { eq, desc, and, asc, sql, inArray } from 'drizzle-orm';

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

  // -------------------------------------------------------------------------
  // FR-WDL-003: Resolve Withdrawal Hierarchy (FIFO across sub-fund positions)
  // -------------------------------------------------------------------------
  async resolveWithdrawalHierarchy(portfolioId: string, amount: number) {
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    // Fetch portfolio to get inception_date for lock-up check
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    if (!portfolio) {
      throw new Error(`Portfolio not found: ${portfolioId}`);
    }

    // Fetch all positions for the portfolio, ordered FIFO (oldest first)
    const positions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, portfolioId))
      .orderBy(asc(schema.positions.created_at));

    const today = new Date();
    const lots: Array<{
      securityId: number | null;
      quantity: number;
      value: number;
    }> = [];
    let accumulated = 0;

    for (const pos of positions) {
      if (accumulated >= amount) break;

      // Respect lock-up: if inception_date + lock_up_period > today, skip.
      // Use portfolio inception_date as proxy for position lock-up period.
      // Default lock-up: 5 years from inception if inception_date exists.
      if (portfolio.inception_date) {
        const inceptionDate = new Date(portfolio.inception_date);
        const lockUpEnd = new Date(inceptionDate);
        lockUpEnd.setFullYear(lockUpEnd.getFullYear() + 5);
        if (lockUpEnd > today) {
          // Position is still within lock-up period — skip
          continue;
        }
      }

      const posValue = parseFloat(pos.market_value ?? '0');
      const posQty = parseFloat(pos.quantity ?? '0');

      if (posValue <= 0 || posQty <= 0) continue;

      const remaining = amount - accumulated;

      if (posValue <= remaining) {
        // Liquidate entire position
        lots.push({
          securityId: pos.security_id,
          quantity: posQty,
          value: posValue,
        });
        accumulated += posValue;
      } else {
        // Partial liquidation of this position
        const fraction = remaining / posValue;
        const partialQty = posQty * fraction;
        lots.push({
          securityId: pos.security_id,
          quantity: Math.round(partialQty * 1e6) / 1e6,
          value: remaining,
        });
        accumulated += remaining;
      }
    }

    const shortfall = amount - accumulated;

    return {
      lots,
      totalValue: accumulated,
      shortfall: shortfall > 0 ? Math.round(shortfall * 100) / 100 : 0,
    };
  },

  // -------------------------------------------------------------------------
  // FR-WDL-004: Calculate Partial Liquidation
  // -------------------------------------------------------------------------
  async calculatePartialLiquidation(
    portfolioId: string,
    amount: number,
    method: 'FIFO' | 'LIFO' | 'PRO_RATA' | 'SPECIFIC_LOT',
    specificLots?: number[],
  ) {
    if (amount <= 0) {
      throw new Error('Liquidation amount must be positive');
    }

    if (method === 'SPECIFIC_LOT' && (!specificLots || specificLots.length === 0)) {
      throw new Error('SPECIFIC_LOT method requires specificLots array');
    }

    // Fetch positions based on method
    let positions: (typeof schema.positions.$inferSelect)[];

    if (method === 'SPECIFIC_LOT') {
      positions = await db
        .select()
        .from(schema.positions)
        .where(
          and(
            eq(schema.positions.portfolio_id, portfolioId),
            inArray(schema.positions.id, specificLots!),
          ),
        );
    } else {
      const orderDirection = method === 'LIFO'
        ? desc(schema.positions.created_at)
        : asc(schema.positions.created_at); // FIFO and PRO_RATA both fetch ASC

      positions = await db
        .select()
        .from(schema.positions)
        .where(eq(schema.positions.portfolio_id, portfolioId))
        .orderBy(orderDirection);
    }

    if (positions.length === 0) {
      throw new Error(`No positions found for portfolio: ${portfolioId}`);
    }

    const lots: Array<{
      positionId: number;
      securityId: number | null;
      quantityToSell: number;
      estimatedProceeds: number;
    }> = [];

    if (method === 'PRO_RATA') {
      // Calculate total portfolio market value
      const totalMV = positions.reduce(
        (sum, p) => sum + parseFloat(p.market_value ?? '0'),
        0,
      );

      if (totalMV <= 0) {
        throw new Error('Total portfolio market value is zero or negative');
      }

      // Each position contributes proportionally
      const liquidationRatio = Math.min(amount / totalMV, 1);
      let totalProceeds = 0;

      for (const pos of positions) {
        const mv = parseFloat(pos.market_value ?? '0');
        const qty = parseFloat(pos.quantity ?? '0');
        if (mv <= 0 || qty <= 0) continue;

        const proceeds = mv * liquidationRatio;
        const qtyToSell = qty * liquidationRatio;

        lots.push({
          positionId: pos.id,
          securityId: pos.security_id,
          quantityToSell: Math.round(qtyToSell * 1e6) / 1e6,
          estimatedProceeds: Math.round(proceeds * 100) / 100,
        });
        totalProceeds += proceeds;
      }

      return {
        lots,
        totalProceeds: Math.round(totalProceeds * 100) / 100,
      };
    }

    // FIFO, LIFO, SPECIFIC_LOT — sequential accumulation
    let accumulated = 0;

    for (const pos of positions) {
      if (accumulated >= amount) break;

      const mv = parseFloat(pos.market_value ?? '0');
      const qty = parseFloat(pos.quantity ?? '0');
      if (mv <= 0 || qty <= 0) continue;

      const remaining = amount - accumulated;

      if (mv <= remaining) {
        // Fully liquidate this position
        lots.push({
          positionId: pos.id,
          securityId: pos.security_id,
          quantityToSell: qty,
          estimatedProceeds: mv,
        });
        accumulated += mv;
      } else {
        // Partially liquidate
        const fraction = remaining / mv;
        const partialQty = qty * fraction;
        lots.push({
          positionId: pos.id,
          securityId: pos.security_id,
          quantityToSell: Math.round(partialQty * 1e6) / 1e6,
          estimatedProceeds: Math.round(remaining * 100) / 100,
        });
        accumulated += remaining;
      }
    }

    return {
      lots,
      totalProceeds: Math.round(accumulated * 100) / 100,
    };
  },
};
