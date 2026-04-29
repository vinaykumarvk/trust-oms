/**
 * Transfer Service (Phase 3F)
 *
 * Handles security transfers between portfolios: inter-portfolio,
 * intra-portfolio, scripless, and certificated.
 *
 * Lifecycle: PENDING_APPROVAL -> APPROVED -> EXECUTED
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import crypto from 'crypto';

export const transferService = {
  /** Initiate a transfer between portfolios */
  async initiateTransfer(data: {
    fromPortfolioId: string;
    toPortfolioId: string;
    securityId: number;
    quantity: number;
    type: string;
    initiatedBy?: number;
  }) {
    // Validate source portfolio exists
    const [fromPortfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, data.fromPortfolioId))
      .limit(1);

    if (!fromPortfolio) {
      throw new Error(`Source portfolio not found: ${data.fromPortfolioId}`);
    }

    // Validate target portfolio exists
    const [toPortfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, data.toPortfolioId))
      .limit(1);

    if (!toPortfolio) {
      throw new Error(`Target portfolio not found: ${data.toPortfolioId}`);
    }

    // Validate security exists
    const [security] = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.id, data.securityId))
      .limit(1);

    if (!security) {
      throw new Error(`Security not found: ${data.securityId}`);
    }

    // Check sufficient position in source portfolio
    const [position] = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, data.fromPortfolioId),
          eq(schema.positions.security_id, data.securityId),
        ),
      )
      .limit(1);

    const availableQty = parseFloat(position?.quantity ?? '0');
    if (availableQty < data.quantity) {
      throw new Error(
        `Insufficient position: available ${availableQty}, requested ${data.quantity}`,
      );
    }

    // Create transfer record
    const [transfer] = await db
      .insert(schema.transfers)
      .values({
        from_portfolio_id: data.fromPortfolioId,
        to_portfolio_id: data.toPortfolioId,
        security_id: data.securityId,
        quantity: String(data.quantity),
        type: data.type,
        transfer_status: 'PENDING_APPROVAL',
        created_by: data.initiatedBy ? String(data.initiatedBy) : null,
      })
      .returning();

    return transfer;
  },

  /** Approve a pending transfer */
  async approveTransfer(transferId: number, approvedBy: number) {
    const [transfer] = await db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, transferId))
      .limit(1);

    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    if (transfer.transfer_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot approve transfer in status ${transfer.transfer_status}; must be PENDING_APPROVAL`,
      );
    }

    const [updated] = await db
      .update(schema.transfers)
      .set({
        transfer_status: 'APPROVED',
        updated_by: String(approvedBy),
        updated_at: new Date(),
      })
      .where(eq(schema.transfers.id, transferId))
      .returning();

    return updated;
  },

  /** Execute an approved transfer: debit source, credit target positions */
  async executeTransfer(transferId: number) {
    const [transfer] = await db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, transferId))
      .limit(1);

    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    if (transfer.transfer_status !== 'APPROVED') {
      throw new Error(
        `Cannot execute transfer in status ${transfer.transfer_status}; must be APPROVED`,
      );
    }

    const quantity = parseFloat(transfer.quantity ?? '0');
    const securityId = transfer.security_id;
    const fromPortfolioId = transfer.from_portfolio_id;
    const toPortfolioId = transfer.to_portfolio_id;

    if (!securityId || !fromPortfolioId || !toPortfolioId) {
      throw new Error(`Transfer ${transferId} is missing required portfolio or security references`);
    }

    // Debit source position
    const [sourcePosition] = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, fromPortfolioId),
          eq(schema.positions.security_id, securityId),
        ),
      )
      .limit(1);

    if (!sourcePosition) {
      throw new Error(`Source position not found for portfolio ${fromPortfolioId}, security ${securityId}`);
    }

    const sourceQty = parseFloat(sourcePosition.quantity ?? '0');
    if (sourceQty < quantity) {
      throw new Error(
        `Insufficient position at execution: available ${sourceQty}, requested ${quantity}`,
      );
    }

    const newSourceQty = sourceQty - quantity;
    await db
      .update(schema.positions)
      .set({
        quantity: String(newSourceQty),
        updated_at: new Date(),
      })
      .where(eq(schema.positions.id, sourcePosition.id));

    // Credit target position (find or create)
    let [targetPosition] = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, toPortfolioId),
          eq(schema.positions.security_id, securityId),
        ),
      )
      .limit(1);

    // FR-TRF-007: Propagate cost-basis from source to target on in-kind transfers.
    // Compute per-unit cost basis from source and apply to transferred quantity.
    const sourceCostBasis = parseFloat(sourcePosition.cost_basis ?? '0');
    const sourceMarketValue = parseFloat(sourcePosition.market_value ?? '0');
    const perUnitCost = sourceQty > 0 ? (sourceCostBasis / sourceQty) * quantity : 0;
    const perUnitMV = sourceQty > 0 ? (sourceMarketValue / sourceQty) * quantity : 0;

    // Reduce source cost_basis and market_value proportionally
    const newSourceCost = sourceCostBasis - perUnitCost;
    const newSourceMV = sourceMarketValue - perUnitMV;
    await db
      .update(schema.positions)
      .set({
        cost_basis: String(Math.max(0, newSourceCost)),
        market_value: String(Math.max(0, newSourceMV)),
        unrealized_pnl: String(Math.max(0, newSourceMV) - Math.max(0, newSourceCost)),
        updated_at: new Date(),
      })
      .where(eq(schema.positions.id, sourcePosition.id));

    if (targetPosition) {
      const targetQty = parseFloat(targetPosition.quantity ?? '0') + quantity;
      const targetCost = parseFloat(targetPosition.cost_basis ?? '0') + perUnitCost;
      const targetMV = parseFloat(targetPosition.market_value ?? '0') + perUnitMV;
      await db
        .update(schema.positions)
        .set({
          quantity: String(targetQty),
          cost_basis: String(targetCost),
          market_value: String(targetMV),
          unrealized_pnl: String(targetMV - targetCost),
          updated_at: new Date(),
        })
        .where(eq(schema.positions.id, targetPosition.id));
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      await db
        .insert(schema.positions)
        .values({
          portfolio_id: toPortfolioId,
          security_id: securityId,
          quantity: String(quantity),
          cost_basis: String(perUnitCost),
          market_value: String(perUnitMV),
          unrealized_pnl: String(perUnitMV - perUnitCost),
          as_of_date: todayStr,
        });
    }

    // Mark transfer as EXECUTED
    const [updated] = await db
      .update(schema.transfers)
      .set({
        transfer_status: 'EXECUTED',
        updated_at: new Date(),
      })
      .where(eq(schema.transfers.id, transferId))
      .returning();

    return updated;
  },

  // =========================================================================
  // FR-TRF-008: External Trustee Bank Transfers (SWIFT MT540/MT542)
  // =========================================================================

  /**
   * Generate a SWIFT-format message reference (16 chars max per SWIFT spec).
   * Format: TOMSYYYYMMDD + random 4-char hex.
   */
  _generateSwiftRef(): string {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `TOMS${today}${rand}`;
  },

  /**
   * Build SWIFT MT540 (Receive Free) or MT542 (Deliver Free) message structure.
   * This produces a structured representation; in production it would be
   * serialised to the ISO 15022 FIN format via a SWIFT gateway.
   */
  _buildSwiftMessage(params: {
    messageType: 'MT540' | 'MT542';
    senderBIC: string;
    receiverBIC: string;
    swiftRef: string;
    isin: string | null;
    securityName: string | null;
    quantity: number;
    tradeDate: string;
    settlementDate: string;
    safekeepingAccount: string;
  }) {
    return {
      messageType: params.messageType,
      senderBIC: params.senderBIC,
      receiverBIC: params.receiverBIC,
      transactionReference: params.swiftRef,
      // Block 1 — General Information
      block1: {
        functionOfMessage: 'NEWM', // New message
        senderReference: params.swiftRef,
      },
      // Block 2 — Trade Details
      block2: {
        placeOfTrade: 'XPHS', // Philippine Stock Exchange
        tradeDate: params.tradeDate,
        settlementDate: params.settlementDate,
        settlementType: 'FREE', // free of payment (FOP)
      },
      // Block 3 — Financial Instrument
      block3: {
        isin: params.isin ?? 'UNKNOWN',
        description: params.securityName ?? 'N/A',
        quantity: params.quantity,
      },
      // Block 4 — Account Details
      block4: {
        safekeepingAccount: params.safekeepingAccount,
        deliveringAgent: params.messageType === 'MT542' ? params.senderBIC : params.receiverBIC,
        receivingAgent: params.messageType === 'MT542' ? params.receiverBIC : params.senderBIC,
      },
    };
  },

  /**
   * Initiate an external inter-custodian transfer via SWIFT.
   * Creates a transfer record with type='EXTERNAL' and status='PENDING_CUSTODIAN',
   * stores the generated SWIFT message reference, and returns both the transfer
   * record and the SWIFT message structure.
   */
  async initiateExternalTransfer(data: {
    fromPortfolioId: string;
    externalCustodian: { bic: string; account: string };
    securityId: number;
    quantity: number;
    initiatedBy?: number;
  }) {
    // Validate source portfolio
    const [fromPortfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, data.fromPortfolioId))
      .limit(1);

    if (!fromPortfolio) {
      throw new Error(`Source portfolio not found: ${data.fromPortfolioId}`);
    }

    // Validate security
    const [security] = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.id, data.securityId))
      .limit(1);

    if (!security) {
      throw new Error(`Security not found: ${data.securityId}`);
    }

    // Validate BIC format (8 or 11 alphanumeric chars)
    const bicRegex = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/;
    if (!bicRegex.test(data.externalCustodian.bic)) {
      throw new Error(
        `Invalid BIC/SWIFT code: ${data.externalCustodian.bic}. Must be 8 or 11 alphanumeric characters.`,
      );
    }

    if (!data.externalCustodian.account || data.externalCustodian.account.length < 4) {
      throw new Error('External custodian account number is required (minimum 4 characters)');
    }

    // Check sufficient position
    const [position] = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, data.fromPortfolioId),
          eq(schema.positions.security_id, data.securityId),
        ),
      )
      .limit(1);

    const availableQty = parseFloat(position?.quantity ?? '0');
    if (availableQty < data.quantity) {
      throw new Error(
        `Insufficient position: available ${availableQty}, requested ${data.quantity}`,
      );
    }

    // Generate SWIFT reference and build message
    const swiftRef = this._generateSwiftRef();
    const todayStr = new Date().toISOString().split('T')[0];
    const settlementDate = new Date();
    settlementDate.setDate(settlementDate.getDate() + 2); // T+2 settlement
    const settlementDateStr = settlementDate.toISOString().split('T')[0];

    // Sender BIC: our custodian (defaulting to BDO SWIFT code)
    const senderBIC = process.env.CUSTODIAN_BIC ?? 'BNORPHMMXXX';

    const swiftMessage = this._buildSwiftMessage({
      messageType: 'MT542', // Deliver Free — we are sending securities out
      senderBIC,
      receiverBIC: data.externalCustodian.bic,
      swiftRef,
      isin: security.isin,
      securityName: security.name,
      quantity: data.quantity,
      tradeDate: todayStr,
      settlementDate: settlementDateStr,
      safekeepingAccount: data.externalCustodian.account,
    });

    // Create transfer record with EXTERNAL type and PENDING_CUSTODIAN status
    // We store the swift_ref and external custodian details in created_by / status fields
    // as the transfers table does not have dedicated columns for these.
    // In production, a dedicated swift_transfers table would be preferable.
    const [transfer] = await db
      .insert(schema.transfers)
      .values({
        from_portfolio_id: data.fromPortfolioId,
        to_portfolio_id: null, // external — no internal target portfolio
        security_id: data.securityId,
        quantity: String(data.quantity),
        type: 'EXTERNAL',
        transfer_status: 'PENDING_CUSTODIAN',
        created_by: data.initiatedBy ? String(data.initiatedBy) : null,
        // Store SWIFT ref and custodian details in correlation_id and status for traceability
        correlation_id: swiftRef,
        status: `SWIFT:${data.externalCustodian.bic}|ACCT:${data.externalCustodian.account}`,
      })
      .returning();

    return {
      transfer,
      swiftRef,
      swiftMessage,
      settlementDate: settlementDateStr,
    };
  },

  /**
   * Confirm an external transfer after receiving custodian settlement confirmation.
   * Marks the transfer as EXECUTED and debits the source position.
   */
  async confirmExternalTransfer(
    transferId: number,
    confirmation: {
      custodianRef?: string;
      confirmedBy?: number;
    },
  ) {
    const [transfer] = await db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, transferId))
      .limit(1);

    if (!transfer) {
      throw new Error(`Transfer not found: ${transferId}`);
    }

    if (transfer.type !== 'EXTERNAL') {
      throw new Error(`Transfer ${transferId} is not an external transfer`);
    }

    if (transfer.transfer_status !== 'PENDING_CUSTODIAN') {
      throw new Error(
        `Cannot confirm transfer in status ${transfer.transfer_status}; must be PENDING_CUSTODIAN`,
      );
    }

    const quantity = parseFloat(transfer.quantity ?? '0');
    const securityId = transfer.security_id;
    const fromPortfolioId = transfer.from_portfolio_id;

    if (!securityId || !fromPortfolioId) {
      throw new Error(`Transfer ${transferId} is missing required references`);
    }

    // Debit source position
    const [sourcePosition] = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, fromPortfolioId),
          eq(schema.positions.security_id, securityId),
        ),
      )
      .limit(1);

    if (!sourcePosition) {
      throw new Error(
        `Source position not found for portfolio ${fromPortfolioId}, security ${securityId}`,
      );
    }

    const sourceQty = parseFloat(sourcePosition.quantity ?? '0');
    if (sourceQty < quantity) {
      throw new Error(
        `Insufficient position at confirmation: available ${sourceQty}, requested ${quantity}`,
      );
    }

    // Reduce position and proportionally reduce cost basis / market value
    const sourceCostBasis = parseFloat(sourcePosition.cost_basis ?? '0');
    const sourceMarketValue = parseFloat(sourcePosition.market_value ?? '0');
    const perUnitCost = sourceQty > 0 ? (sourceCostBasis / sourceQty) * quantity : 0;
    const perUnitMV = sourceQty > 0 ? (sourceMarketValue / sourceQty) * quantity : 0;
    const newQty = sourceQty - quantity;
    const newCost = sourceCostBasis - perUnitCost;
    const newMV = sourceMarketValue - perUnitMV;

    await db
      .update(schema.positions)
      .set({
        quantity: String(newQty),
        cost_basis: String(Math.max(0, newCost)),
        market_value: String(Math.max(0, newMV)),
        unrealized_pnl: String(Math.max(0, newMV) - Math.max(0, newCost)),
        updated_at: new Date(),
      })
      .where(eq(schema.positions.id, sourcePosition.id));

    // Mark transfer as EXECUTED with custodian reference
    const custodianNote = confirmation.custodianRef
      ? ` | CUSTODIAN_REF:${confirmation.custodianRef}`
      : '';

    const [updated] = await db
      .update(schema.transfers)
      .set({
        transfer_status: 'EXECUTED',
        updated_by: confirmation.confirmedBy
          ? String(confirmation.confirmedBy)
          : 'CUSTODIAN',
        updated_at: new Date(),
        status: (transfer.status ?? '') + custodianNote,
      })
      .where(eq(schema.transfers.id, transferId))
      .returning();

    return {
      transfer: updated,
      swiftRef: transfer.correlation_id,
      debitedQuantity: quantity,
      custodianRef: confirmation.custodianRef ?? null,
    };
  },

  /** List transfers with filters and pagination */
  async getTransfers(filters: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(eq(schema.transfers.transfer_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.transfers)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.transfers.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.transfers)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
