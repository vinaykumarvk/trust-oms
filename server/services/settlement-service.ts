/**
 * Settlement & Cash Ledger Service (Phase 3A)
 *
 * Handles settlement lifecycle from confirmed trade through to
 * cash posting, SWIFT message generation, PhilPaSS routing, and
 * Finacle GL integration.
 *
 * BRD FR-CSH: Settlement instructions, SSI resolution, bulk settle,
 * official receipt generation, and cut-off time management.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel, gte, lte } from 'drizzle-orm';

type SettlementInstruction = InferSelectModel<typeof schema.settlementInstructions>;
type Trade = InferSelectModel<typeof schema.trades>;
type Confirmation = InferSelectModel<typeof schema.confirmations>;

// Counter for official receipt numbering within a session
let receiptSeq = 0;

export const settlementService = {
  /** Initialize settlement from a confirmed trade */
  async initializeSettlement(confirmationId: number) {
    // Get the confirmation
    const [confirmation] = await db
      .select()
      .from(schema.confirmations)
      .where(eq(schema.confirmations.id, confirmationId))
      .limit(1);

    if (!confirmation) {
      throw new Error(`Confirmation not found: ${confirmationId}`);
    }

    if (confirmation.match_status !== 'CONFIRMED') {
      throw new Error(
        `Cannot initialize settlement for confirmation in status ${confirmation.match_status}; must be CONFIRMED`,
      );
    }

    // Get the trade record
    const tradeId = confirmation.trade_id;
    if (!tradeId) {
      throw new Error(`Confirmation ${confirmationId} has no associated trade_id`);
    }

    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, tradeId))
      .limit(1);

    if (!trade) {
      throw new Error(`Trade not found: ${tradeId}`);
    }

    // Get the order to determine side, currency, and book-only flag
    let order = null;
    if (trade.order_id) {
      const [orderRow] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.order_id, trade.order_id))
        .limit(1);
      order = orderRow ?? null;
    }

    // Resolve SSI for routing details
    const ssiDetails = await this.resolveSSI(tradeId);

    const currency = order?.currency ?? 'PHP';
    const cashAmount =
      parseFloat(trade.execution_price ?? '0') *
      parseFloat(trade.execution_qty ?? '0');

    // Determine if book-only (e.g. internal transfer, same custodian)
    const isBookOnly = order?.payment_mode === 'BOOK' || false;

    // Generate official receipt for cash-receipt type settlements
    const officialReceiptNo =
      order?.side === 'SELL' ? this.generateOfficialReceipt() : null;

    // Compute value date (T+2 for equities, T+1 for fixed income, T+0 for FX)
    const today = new Date();
    const valueDateOffset = 2; // Default T+2 for equities
    const valueDate = new Date(today);
    valueDate.setDate(valueDate.getDate() + valueDateOffset);
    const valueDateStr = valueDate.toISOString().split('T')[0];

    // Create settlement instruction
    const [settlement] = await db
      .insert(schema.settlementInstructions)
      .values({
        trade_id: tradeId,
        ssi_id: ssiDetails.ssi_id,
        swift_message_type: isBookOnly ? null : ssiDetails.swift_message_type,
        routing_bic: isBookOnly ? null : ssiDetails.routing_bic,
        value_date: valueDateStr,
        settlement_status: 'PENDING',
        cash_amount: String(cashAmount),
        currency,
        is_book_only: isBookOnly,
        official_receipt_no: officialReceiptNo,
      })
      .returning();

    return settlement;
  },

  /** Resolve SSI for a trade based on counterparty + security type */
  async resolveSSI(tradeId: string): Promise<{
    ssi_id: string;
    routing_bic: string;
    swift_message_type: string;
  }> {
    // Get the trade to determine currency from the linked order
    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, tradeId))
      .limit(1);

    if (!trade) {
      throw new Error(`Trade not found: ${tradeId}`);
    }

    let currency = 'PHP';
    if (trade.order_id) {
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.order_id, trade.order_id))
        .limit(1);
      if (order) {
        currency = order.currency ?? 'PHP';
      }
    }

    // Stub: return default SSI based on currency
    if (currency === 'PHP') {
      return {
        ssi_id: 'SSI-PHP-PHILPASS',
        routing_bic: 'PHICPHMM',
        swift_message_type: 'MT543', // Deliver free of payment (local)
      };
    } else if (currency === 'USD') {
      return {
        ssi_id: 'SSI-USD-SWIFT',
        routing_bic: 'CITIUS33',
        swift_message_type: 'MT540', // Receive free of payment
      };
    } else {
      // Manual settlement for other currencies
      return {
        ssi_id: 'SSI-MANUAL',
        routing_bic: '',
        swift_message_type: 'MT548', // Settlement status
      };
    }
  },

  /** Generate SWIFT message stub (MT540-548) */
  async generateSwiftMessage(
    settlementId: number,
    messageType: string,
  ): Promise<{ messageId: string; messageType: string; status: string }> {
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    // Stub: generate a mock SWIFT message reference
    const messageId = `SWIFT-${messageType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Update settlement with SWIFT details
    await db
      .update(schema.settlementInstructions)
      .set({
        swift_message_type: messageType,
        updated_at: new Date(),
      })
      .where(eq(schema.settlementInstructions.id, settlementId));

    return {
      messageId,
      messageType,
      status: 'SENT',
    };
  },

  /** Route to PhilPaSS stub (RTGS) */
  async routeToPhilPaSS(
    settlementId: number,
  ): Promise<{ philpassRef: string; status: string }> {
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    // Stub: generate PhilPaSS reference
    const philpassRef = `PPSS-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    await db
      .update(schema.settlementInstructions)
      .set({
        philpass_ref: philpassRef,
        updated_at: new Date(),
      })
      .where(eq(schema.settlementInstructions.id, settlementId));

    return {
      philpassRef,
      status: 'SUBMITTED',
    };
  },

  /** Post cash ledger entries (debit/credit) */
  async postCashLedger(settlementId: number) {
    // Get the settlement instruction
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    if (!settlement.trade_id) {
      throw new Error(`Settlement ${settlementId} has no associated trade_id`);
    }

    // Get the trade and order for portfolio_id and side
    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, settlement.trade_id))
      .limit(1);

    if (!trade) {
      throw new Error(`Trade not found: ${settlement.trade_id}`);
    }

    let portfolioId: string | null = null;
    let side: string | null = null;

    if (trade.order_id) {
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.order_id, trade.order_id))
        .limit(1);
      if (order) {
        portfolioId = order.portfolio_id;
        side = order.side;
      }
    }

    if (!portfolioId) {
      throw new Error(`Cannot determine portfolio for settlement ${settlementId}`);
    }

    const currency = settlement.currency ?? 'PHP';
    const cashAmount = parseFloat(settlement.cash_amount ?? '0');

    // For BUY: debit cash (negative), For SELL: credit cash (positive)
    const amount = side === 'BUY' ? -cashAmount : cashAmount;

    // Find or create cash ledger for the portfolio + currency
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
          account_type: 'SETTLEMENT',
          currency,
          balance: '0',
          available_balance: '0',
          as_of_date: todayStr,
        })
        .returning();
      ledger = newLedger;
    }

    // Insert cash transaction record
    const [transaction] = await db
      .insert(schema.cashTransactions)
      .values({
        cash_ledger_id: ledger.id,
        type: side === 'BUY' ? 'DEBIT' : 'CREDIT',
        amount: String(amount),
        currency,
        counterparty: trade.broker_id ? `BROKER-${trade.broker_id}` : null,
        reference: `SETTLE-${settlementId}`,
        value_date: settlement.value_date ?? todayStr,
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

    return {
      ledger_id: ledger.id,
      transaction_id: transaction.id,
      amount,
      new_balance: newBalance,
    };
  },

  /** Post to Finacle GL stub */
  async postToFinacle(
    settlementId: number,
  ): Promise<{ finacleRef: string; status: string }> {
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    // Stub: generate Finacle GL reference
    const finacleRef = `FIN-GL-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    await db
      .update(schema.settlementInstructions)
      .set({
        finacle_gl_ref: finacleRef,
        updated_at: new Date(),
      })
      .where(eq(schema.settlementInstructions.id, settlementId));

    return {
      finacleRef,
      status: 'POSTED',
    };
  },

  /** Mark settlement as settled */
  async markSettled(settlementId: number) {
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    if (settlement.settlement_status === 'SETTLED') {
      throw new Error(`Settlement ${settlementId} is already settled`);
    }

    const [updated] = await db
      .update(schema.settlementInstructions)
      .set({
        settlement_status: 'SETTLED',
        settled_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.settlementInstructions.id, settlementId))
      .returning();

    return updated;
  },

  /** Mark settlement as failed */
  async markFailed(settlementId: number, reason: string) {
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    const [updated] = await db
      .update(schema.settlementInstructions)
      .set({
        settlement_status: 'FAILED',
        updated_at: new Date(),
      })
      .where(eq(schema.settlementInstructions.id, settlementId))
      .returning();

    return { ...updated, failure_reason: reason };
  },

  /** Retry a failed settlement */
  async retrySettlement(settlementId: number) {
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    if (settlement.settlement_status !== 'FAILED') {
      throw new Error(
        `Cannot retry settlement in status ${settlement.settlement_status}; must be FAILED`,
      );
    }

    // Reset to PENDING for re-processing
    const [updated] = await db
      .update(schema.settlementInstructions)
      .set({
        settlement_status: 'PENDING',
        updated_at: new Date(),
      })
      .where(eq(schema.settlementInstructions.id, settlementId))
      .returning();

    return updated;
  },

  /** Get settlement queue with filters */
  async getSettlementQueue(filters: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(
        eq(
          schema.settlementInstructions.settlement_status,
          filters.status as 'PENDING' | 'MATCHED' | 'FAILED' | 'SETTLED' | 'REVERSED',
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: schema.settlementInstructions.id,
        trade_id: schema.settlementInstructions.trade_id,
        ssi_id: schema.settlementInstructions.ssi_id,
        swift_message_type: schema.settlementInstructions.swift_message_type,
        routing_bic: schema.settlementInstructions.routing_bic,
        value_date: schema.settlementInstructions.value_date,
        settlement_status: schema.settlementInstructions.settlement_status,
        cash_amount: schema.settlementInstructions.cash_amount,
        currency: schema.settlementInstructions.currency,
        settled_at: schema.settlementInstructions.settled_at,
        finacle_gl_ref: schema.settlementInstructions.finacle_gl_ref,
        philpass_ref: schema.settlementInstructions.philpass_ref,
        is_book_only: schema.settlementInstructions.is_book_only,
        official_receipt_no: schema.settlementInstructions.official_receipt_no,
        custodian_group: schema.settlementInstructions.custodian_group,
        settlement_account_level: schema.settlementInstructions.settlement_account_level,
        created_at: schema.settlementInstructions.created_at,
        // Trade details from join
        execution_price: schema.trades.execution_price,
        execution_qty: schema.trades.execution_qty,
        execution_time: schema.trades.execution_time,
        order_id: schema.trades.order_id,
        block_id: schema.trades.block_id,
        broker_id: schema.trades.broker_id,
      })
      .from(schema.settlementInstructions)
      .leftJoin(
        schema.trades,
        eq(schema.settlementInstructions.trade_id, schema.trades.trade_id),
      )
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.settlementInstructions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.settlementInstructions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get today's cut-off times (Philippine market times) */
  getCutOffs(): {
    equities: string;
    fixed_income: string;
    fx: string;
    general: string;
  } {
    return {
      equities: '14:30',
      fixed_income: '15:00',
      fx: '11:00',
      general: '16:00',
    };
  },

  /** Bulk settle by counterparty/currency/date (Gap #8) */
  async bulkSettle(filters: {
    counterparty?: string;
    currency?: string;
    valueDate?: string;
  }): Promise<{
    settled_count: number;
    failed_count: number;
    results: Array<{ id: number; status: string; error?: string }>;
  }> {
    // Find all PENDING settlements matching filters
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.settlementInstructions.settlement_status, 'PENDING'),
    ];

    if (filters.currency) {
      conditions.push(eq(schema.settlementInstructions.currency, filters.currency));
    }

    if (filters.valueDate) {
      conditions.push(eq(schema.settlementInstructions.value_date, filters.valueDate));
    }

    const where = and(...conditions);

    let pendingSettlements = await db
      .select()
      .from(schema.settlementInstructions)
      .where(where)
      .orderBy(schema.settlementInstructions.id);

    // If counterparty filter specified, further filter by trade's broker
    if (filters.counterparty) {
      const filtered: typeof pendingSettlements = [];
      for (const s of pendingSettlements) {
        if (s.trade_id) {
          const [trade] = await db
            .select()
            .from(schema.trades)
            .where(eq(schema.trades.trade_id, s.trade_id))
            .limit(1);
          if (trade && trade.broker_id !== null && `BROKER-${trade.broker_id}` === filters.counterparty) {
            filtered.push(s);
          }
        }
      }
      pendingSettlements = filtered;
    }

    let settledCount = 0;
    let failedCount = 0;
    const results: Array<{ id: number; status: string; error?: string }> = [];

    for (const settlement of pendingSettlements) {
      try {
        await this.postCashLedger(settlement.id);
        await this.markSettled(settlement.id);
        settledCount++;
        results.push({ id: settlement.id, status: 'SETTLED' });
      } catch (err: unknown) {
        failedCount++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.push({ id: settlement.id, status: 'FAILED', error: errorMessage });
      }
    }

    return {
      settled_count: settledCount,
      failed_count: failedCount,
      results,
    };
  },

  /** Generate Official Receipt number (Gap #8) */
  generateOfficialReceipt(): string {
    receiptSeq++;
    const now = new Date();
    const pad = (n: number, len: number = 2) => String(n).padStart(len, '0');
    const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const seq = String(receiptSeq).padStart(6, '0');
    return `OR-${datePart}-${seq}`;
  },
};
