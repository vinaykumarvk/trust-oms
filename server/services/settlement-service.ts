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
import { eq, desc, and, sql, inArray, type InferSelectModel, gte, lte } from 'drizzle-orm';

type SettlementInstruction = InferSelectModel<typeof schema.settlementInstructions>;
type Trade = InferSelectModel<typeof schema.trades>;
type Confirmation = InferSelectModel<typeof schema.confirmations>;

// Counter for official receipt numbering within a session
let receiptSeq = 0;

/** Round to 2 decimal places (cents) to avoid floating-point drift */
function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

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

  /** Resolve SSI for a trade based on counterparty + security type (FR-SET-005) */
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
    let portfolioId: string | null = null;
    if (trade.order_id) {
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.order_id, trade.order_id))
        .limit(1);
      if (order) {
        currency = order.currency ?? 'PHP';
        portfolioId = order.portfolio_id;
      }
    }

    // FR-SET-005: Look up settlementAccountConfigs for this currency
    // First try a config matching the currency specifically
    const configs = await db
      .select()
      .from(schema.settlementAccountConfigs)
      .where(eq(schema.settlementAccountConfigs.currency, currency));

    if (configs.length > 0) {
      // Prefer a default config, otherwise use the first match
      const defaultConfig = configs.find((c: Record<string, unknown>) => c.is_default === true);
      const config = defaultConfig ?? configs[0];

      return {
        ssi_id: config.ssi_id ?? `SSI-${currency}-CONFIG`,
        routing_bic: config.routing_bic ?? '',
        swift_message_type: config.swift_message_type ?? 'MT543',
      };
    }

    // Fall back to hardcoded defaults when no config found
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

  /**
   * FR-EXE-012: Unified Settlement Amount Calculator
   *
   * Computes a full breakdown of settlement amounts for a given order:
   * gross amount, broker commission, exchange fees, clearing fees, VAT,
   * total fees, and net settlement amount.
   *
   * Fee schedules are configurable via the feeSchedule parameter; defaults
   * are set per asset class following Philippine market conventions:
   *   - Equity: commission 0.25%, exchange 0.005%, clearing 0.01%, SCCP 0.01%, VAT 12%
   *   - Fixed income: commission 0.05%, exchange 0.005%, clearing 0.01%, VAT 12%
   *   - FX: commission 0.01%, VAT 12%
   *   - UITF/Mutual Fund: no commission (NAV-based)
   *
   * For equity SELL orders, a 0.6% stock transaction tax (sales tax) applies.
   *
   * @param order - Order details: side, quantity, price, asset_class, currency
   * @param feeSchedule - Optional overrides for fee rates (as decimals, e.g. 0.0025 = 0.25%)
   * @returns Unified breakdown with all fee components and net settlement amount
   */
  calculateSettlementAmounts(
    order: {
      side: 'BUY' | 'SELL';
      quantity: number;
      price: number;
      asset_class: string;
      currency: string;
    },
    feeSchedule?: {
      brokerCommissionRate?: number;
      exchangeFeeRate?: number;
      clearingFeeRate?: number;
      vatRate?: number;
      sccpTransactionFeeRate?: number;
      salesTaxRate?: number;
    },
  ): {
    gross_amount: number;
    broker_commission: number;
    exchange_fees: number;
    clearing_fees: number;
    sccp_transaction_fee: number;
    vat: number;
    sales_tax: number;
    total_fees: number;
    net_settlement_amount: number;
    currency: string;
    side: string;
    breakdown: Record<string, number>;
  } {
    const { side, quantity, price, asset_class, currency } = order;

    if (quantity <= 0) throw new Error('Quantity must be positive');
    if (price <= 0) throw new Error('Price must be positive');

    // --- Default fee schedules per asset class ---
    let defaults: {
      brokerCommissionRate: number;
      exchangeFeeRate: number;
      clearingFeeRate: number;
      vatRate: number;
      sccpTransactionFeeRate: number;
      salesTaxRate: number;
    };

    const assetUpper = (asset_class ?? 'EQUITY').toUpperCase();

    switch (assetUpper) {
      case 'FIXED_INCOME':
      case 'BOND':
      case 'GOVERNMENT_SECURITIES':
        defaults = {
          brokerCommissionRate: 0.0005,     // 0.05% for fixed income
          exchangeFeeRate: 0.00005,         // 0.005%
          clearingFeeRate: 0.0001,          // 0.01%
          vatRate: 0.12,                    // 12%
          sccpTransactionFeeRate: 0,        // N/A for fixed income
          salesTaxRate: 0,
        };
        break;
      case 'FX':
      case 'FOREX':
        defaults = {
          brokerCommissionRate: 0.0001,     // 0.01% (spread-based typically)
          exchangeFeeRate: 0,
          clearingFeeRate: 0,
          vatRate: 0.12,
          sccpTransactionFeeRate: 0,
          salesTaxRate: 0,
        };
        break;
      case 'UITF':
      case 'MUTUAL_FUND':
        defaults = {
          brokerCommissionRate: 0,          // NAV-based, no broker commission
          exchangeFeeRate: 0,
          clearingFeeRate: 0,
          vatRate: 0.12,
          sccpTransactionFeeRate: 0,
          salesTaxRate: 0,
        };
        break;
      default:
        // Equity / default (PSE standard rates)
        defaults = {
          brokerCommissionRate: 0.0025,     // 0.25%
          exchangeFeeRate: 0.00005,         // 0.005%
          clearingFeeRate: 0.0001,          // 0.01%
          vatRate: 0.12,                    // 12%
          sccpTransactionFeeRate: 0.0001,   // 0.01% SCCP
          salesTaxRate: side === 'SELL' ? 0.006 : 0, // 0.6% stock transaction tax on SELL only
        };
        break;
    }

    // Apply overrides from feeSchedule parameter
    const rates = {
      brokerCommissionRate: feeSchedule?.brokerCommissionRate ?? defaults.brokerCommissionRate,
      exchangeFeeRate: feeSchedule?.exchangeFeeRate ?? defaults.exchangeFeeRate,
      clearingFeeRate: feeSchedule?.clearingFeeRate ?? defaults.clearingFeeRate,
      vatRate: feeSchedule?.vatRate ?? defaults.vatRate,
      sccpTransactionFeeRate: feeSchedule?.sccpTransactionFeeRate ?? defaults.sccpTransactionFeeRate,
      salesTaxRate: feeSchedule?.salesTaxRate ?? defaults.salesTaxRate,
    };

    // --- Compute amounts ---
    const gross_amount = round(quantity * price);

    const broker_commission = round(gross_amount * rates.brokerCommissionRate);
    const exchange_fees = round(gross_amount * rates.exchangeFeeRate);
    const clearing_fees = round(gross_amount * rates.clearingFeeRate);
    const sccp_transaction_fee = round(gross_amount * rates.sccpTransactionFeeRate);

    // VAT is applied on commission + exchange fees + clearing fees + SCCP fee
    const taxableBase = broker_commission + exchange_fees + clearing_fees + sccp_transaction_fee;
    const vat = round(taxableBase * rates.vatRate);

    // Sales tax (e.g., stock transaction tax on SELL for Philippine equities)
    const sales_tax = round(gross_amount * rates.salesTaxRate);

    const total_fees = round(
      broker_commission + exchange_fees + clearing_fees +
      sccp_transaction_fee + vat + sales_tax,
    );

    // Net settlement: BUY = gross + fees (buyer pays more), SELL = gross - fees (seller receives less)
    const net_settlement_amount =
      side === 'BUY'
        ? round(gross_amount + total_fees)
        : round(gross_amount - total_fees);

    return {
      gross_amount,
      broker_commission,
      exchange_fees,
      clearing_fees,
      sccp_transaction_fee,
      vat,
      sales_tax,
      total_fees,
      net_settlement_amount,
      currency,
      side,
      breakdown: {
        quantity,
        price,
        gross_amount,
        broker_commission,
        exchange_fees,
        clearing_fees,
        sccp_transaction_fee,
        vat,
        sales_tax,
        total_fees,
        net_settlement_amount,
        broker_commission_rate: rates.brokerCommissionRate,
        exchange_fee_rate: rates.exchangeFeeRate,
        clearing_fee_rate: rates.clearingFeeRate,
        vat_rate: rates.vatRate,
        sccp_fee_rate: rates.sccpTransactionFeeRate,
        sales_tax_rate: rates.salesTaxRate,
      },
    };
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

  /**
   * FR-STL-006: Cross-portfolio netting
   *
   * Groups PENDING settlement instructions by counterparty + currency + value_date.
   * For each group, computes the net amount (sum of BUY amounts minus SELL amounts)
   * and creates a single netted settlement instruction replacing the individual ones.
   * Original instructions are marked as NETTED with a reference to the net instruction.
   */
  async netSettlements(filters?: {
    currency?: string;
    valueDate?: string;
  }): Promise<{
    groups_processed: number;
    instructions_netted: number;
    net_instructions_created: number;
    details: Array<{
      counterparty: string;
      currency: string;
      value_date: string;
      original_count: number;
      net_amount: number;
      net_instruction_id: number;
    }>;
  }> {
    // 1. Fetch all PENDING settlement instructions
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.settlementInstructions.settlement_status, 'PENDING'),
    ];

    if (filters?.currency) {
      conditions.push(eq(schema.settlementInstructions.currency, filters.currency));
    }

    if (filters?.valueDate) {
      conditions.push(eq(schema.settlementInstructions.value_date, filters.valueDate));
    }

    const pendingInstructions = await db
      .select()
      .from(schema.settlementInstructions)
      .where(and(...conditions))
      .orderBy(schema.settlementInstructions.id);

    // 2. Enrich each instruction with its counterparty (from trade -> broker) and side
    type EnrichedInstruction = {
      instruction: typeof pendingInstructions[0];
      counterparty: string;
      side: string;
    };

    const enriched: EnrichedInstruction[] = [];

    for (const instr of pendingInstructions) {
      let counterparty = 'UNKNOWN';
      let side = 'BUY';

      if (instr.trade_id) {
        const [trade] = await db
          .select()
          .from(schema.trades)
          .where(eq(schema.trades.trade_id, instr.trade_id))
          .limit(1);

        if (trade) {
          counterparty = trade.broker_id !== null ? `BROKER-${trade.broker_id}` : 'UNKNOWN';

          if (trade.order_id) {
            const [order] = await db
              .select({ side: schema.orders.side })
              .from(schema.orders)
              .where(eq(schema.orders.order_id, trade.order_id))
              .limit(1);
            if (order?.side) {
              side = order.side;
            }
          }
        }
      }

      enriched.push({ instruction: instr, counterparty, side });
    }

    // 3. Group by counterparty + currency + value_date
    const groupKey = (e: EnrichedInstruction) =>
      `${e.counterparty}|${e.instruction.currency ?? 'PHP'}|${e.instruction.value_date ?? ''}`;

    const groups = new Map<string, EnrichedInstruction[]>();
    for (const e of enriched) {
      const key = groupKey(e);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    let groupsProcessed = 0;
    let instructionsNetted = 0;
    let netInstructionsCreated = 0;
    const details: Array<{
      counterparty: string;
      currency: string;
      value_date: string;
      original_count: number;
      net_amount: number;
      net_instruction_id: number;
    }> = [];

    // 4. For each group with 2+ instructions, compute net and create netted instruction
    for (const [, group] of groups) {
      if (group.length < 2) continue; // No netting needed for single instructions

      const sample = group[0];
      const currency = sample.instruction.currency ?? 'PHP';
      const valueDate = sample.instruction.value_date ?? new Date().toISOString().split('T')[0];
      const counterparty = sample.counterparty;

      // Compute net: BUY amounts are positive outflow, SELL amounts are negative (net received)
      let netAmount = 0;
      for (const e of group) {
        const amount = parseFloat(e.instruction.cash_amount ?? '0');
        if (e.side === 'BUY') {
          netAmount += amount; // cash out
        } else {
          netAmount -= amount; // cash in
        }
      }

      // Create the net settlement instruction
      const [netInstruction] = await db
        .insert(schema.settlementInstructions)
        .values({
          trade_id: null, // Netted instruction is not linked to a single trade
          ssi_id: sample.instruction.ssi_id,
          swift_message_type: sample.instruction.swift_message_type,
          routing_bic: sample.instruction.routing_bic,
          value_date: valueDate,
          settlement_status: 'PENDING',
          cash_amount: String(Math.abs(netAmount)),
          currency,
          is_book_only: sample.instruction.is_book_only,
          custodian_group: sample.instruction.custodian_group,
          settlement_account_level: sample.instruction.settlement_account_level,
        })
        .returning();

      // Mark original instructions as SETTLED with a netting reference
      // (Using SETTLED status since NETTED is not in the enum; we store netting
      //  reference in finacle_gl_ref for traceability)
      const originalIds = group.map((e) => e.instruction.id);
      await db
        .update(schema.settlementInstructions)
        .set({
          settlement_status: 'SETTLED',
          finacle_gl_ref: `NETTED-REF-${netInstruction.id}`,
          settled_at: new Date(),
          updated_at: new Date(),
        })
        .where(inArray(schema.settlementInstructions.id, originalIds));

      groupsProcessed++;
      instructionsNetted += group.length;
      netInstructionsCreated++;
      details.push({
        counterparty,
        currency,
        value_date: valueDate,
        original_count: group.length,
        net_amount: netAmount,
        net_instruction_id: netInstruction.id,
      });
    }

    console.log(
      `[Netting] Processed ${groupsProcessed} groups, netted ${instructionsNetted} instructions into ${netInstructionsCreated} net instructions`,
    );

    return {
      groups_processed: groupsProcessed,
      instructions_netted: instructionsNetted,
      net_instructions_created: netInstructionsCreated,
      details,
    };
  },

  /**
   * FR-STL-010: DVP/RVP settlement lifecycle
   *
   * Processes Delivery vs Payment (DVP) or Receive vs Payment (RVP) settlement.
   * - DVP: securities delivery is contingent on cash receipt
   * - RVP: cash payment is contingent on securities receipt
   *
   * Validates both cash leg and securities leg are ready, then sets status to MATCHED.
   */
  async processDVP(
    settlementId: number,
    legUpdates?: {
      cash_leg_confirmed?: boolean;
      securities_leg_confirmed?: boolean;
    },
  ): Promise<{
    settlement_id: number;
    settlement_type: 'DVP' | 'RVP';
    cash_leg_status: 'PENDING' | 'CONFIRMED';
    securities_leg_status: 'PENDING' | 'CONFIRMED';
    settlement_status: string;
    matched: boolean;
  }> {
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

    if (settlement.settlement_status === 'FAILED') {
      throw new Error(`Settlement ${settlementId} has failed; retry before processing DVP`);
    }

    // Determine DVP vs RVP from the underlying order's side
    // DVP = we deliver securities and receive cash (SELL side)
    // RVP = we receive securities and deliver cash (BUY side)
    let side: string = 'BUY';
    if (settlement.trade_id) {
      const [trade] = await db
        .select()
        .from(schema.trades)
        .where(eq(schema.trades.trade_id, settlement.trade_id))
        .limit(1);

      if (trade?.order_id) {
        const [order] = await db
          .select({ side: schema.orders.side })
          .from(schema.orders)
          .where(eq(schema.orders.order_id, trade.order_id))
          .limit(1);
        if (order?.side) {
          side = order.side;
        }
      }
    }

    const settlementType: 'DVP' | 'RVP' = side === 'SELL' ? 'DVP' : 'RVP';

    // Track leg statuses via custodian_group (cash leg) and settlement_account_level (securities leg)
    // We use these text fields to persist leg confirmation state:
    //   custodian_group: 'CASH_CONFIRMED' or null
    //   settlement_account_level: 'SEC_CONFIRMED' or null
    let cashLegConfirmed = settlement.custodian_group === 'CASH_CONFIRMED';
    let securitiesLegConfirmed = settlement.settlement_account_level === 'SEC_CONFIRMED';

    // Apply incoming leg updates
    if (legUpdates?.cash_leg_confirmed) {
      cashLegConfirmed = true;
    }
    if (legUpdates?.securities_leg_confirmed) {
      securitiesLegConfirmed = true;
    }

    // Persist leg status updates
    const updateFields: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (cashLegConfirmed) {
      updateFields.custodian_group = 'CASH_CONFIRMED';
    }
    if (securitiesLegConfirmed) {
      updateFields.settlement_account_level = 'SEC_CONFIRMED';
    }

    // DVP: securities delivery contingent on cash receipt
    //   -> both legs must be confirmed to proceed
    // RVP: cash payment contingent on securities receipt
    //   -> both legs must be confirmed to proceed
    let matched = false;

    if (cashLegConfirmed && securitiesLegConfirmed) {
      // Both legs confirmed — set to MATCHED
      updateFields.settlement_status = 'MATCHED';
      matched = true;
    } else if (settlementType === 'DVP' && !cashLegConfirmed && securitiesLegConfirmed) {
      // DVP: securities ready but waiting for cash — hold
      // Status remains PENDING
    } else if (settlementType === 'RVP' && cashLegConfirmed && !securitiesLegConfirmed) {
      // RVP: cash ready but waiting for securities — hold
      // Status remains PENDING
    }

    await db
      .update(schema.settlementInstructions)
      .set(updateFields as any)
      .where(eq(schema.settlementInstructions.id, settlementId));

    const finalStatus = matched
      ? 'MATCHED'
      : settlement.settlement_status ?? 'PENDING';

    return {
      settlement_id: settlementId,
      settlement_type: settlementType,
      cash_leg_status: cashLegConfirmed ? 'CONFIRMED' : 'PENDING',
      securities_leg_status: securitiesLegConfirmed ? 'CONFIRMED' : 'PENDING',
      settlement_status: finalStatus,
      matched,
    };
  },

  /**
   * Execute Cash Sweep (FR-SET-004)
   *
   * EOD job: for each active rule in cashSweepRules, check if the portfolio's
   * idle cash (from cashLedger) exceeds threshold_amount. If so, log the
   * sweep action as a cash transaction.
   */
  async executeCashSweep(): Promise<{
    rulesEvaluated: number;
    sweepsTriggered: number;
    details: Array<{
      rule_id: number;
      portfolio_id: string;
      idle_cash: number;
      threshold: number;
      swept_amount: number;
      target_fund_id: string | null;
    }>;
  }> {
    // Fetch all active cash sweep rules
    const activeRules = await db
      .select()
      .from(schema.cashSweepRules)
      .where(eq(schema.cashSweepRules.is_active, true));

    const todayStr = new Date().toISOString().split('T')[0];
    let sweepsTriggered = 0;
    const details: Array<{
      rule_id: number;
      portfolio_id: string;
      idle_cash: number;
      threshold: number;
      swept_amount: number;
      target_fund_id: string | null;
    }> = [];

    for (const rule of activeRules) {
      if (!rule.portfolio_id) continue;

      const threshold = parseFloat(rule.threshold_amount ?? '0');

      // Get total idle cash for the portfolio across all currencies
      const balanceResult = await db
        .select({
          total_available: sql<string>`COALESCE(SUM(${schema.cashLedger.available_balance}::numeric), 0)`,
        })
        .from(schema.cashLedger)
        .where(eq(schema.cashLedger.portfolio_id, rule.portfolio_id));

      const idleCash = parseFloat(balanceResult[0]?.total_available ?? '0');

      if (idleCash > threshold) {
        const sweptAmount = idleCash - threshold;

        // Find the primary cash ledger for this portfolio (first available)
        const [ledger] = await db
          .select()
          .from(schema.cashLedger)
          .where(eq(schema.cashLedger.portfolio_id, rule.portfolio_id))
          .limit(1);

        if (ledger) {
          // Log the sweep as a DEBIT cash transaction
          await db.insert(schema.cashTransactions).values({
            cash_ledger_id: ledger.id,
            type: 'DEBIT',
            amount: String(-sweptAmount),
            currency: ledger.currency ?? 'PHP',
            reference: `CASH-SWEEP-${rule.id}-${todayStr}`,
            counterparty: rule.target_fund_id
              ? `FUND-${rule.target_fund_id}`
              : null,
            value_date: todayStr,
          });

          // Update ledger balance
          const newBalance = parseFloat(ledger.balance ?? '0') - sweptAmount;
          const newAvailable =
            parseFloat(ledger.available_balance ?? '0') - sweptAmount;

          await db
            .update(schema.cashLedger)
            .set({
              balance: String(newBalance),
              available_balance: String(newAvailable),
              as_of_date: todayStr,
              updated_at: new Date(),
            })
            .where(eq(schema.cashLedger.id, ledger.id));
        }

        sweepsTriggered++;
        details.push({
          rule_id: rule.id,
          portfolio_id: rule.portfolio_id,
          idle_cash: idleCash,
          threshold,
          swept_amount: sweptAmount,
          target_fund_id: rule.target_fund_id,
        });
      }
    }

    console.log(
      `[CashSweep] Evaluated ${activeRules.length} rules, triggered ${sweepsTriggered} sweeps`,
    );

    return {
      rulesEvaluated: activeRules.length,
      sweepsTriggered,
      details,
    };
  },
};
