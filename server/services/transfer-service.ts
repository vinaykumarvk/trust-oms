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

    if (targetPosition) {
      const targetQty = parseFloat(targetPosition.quantity ?? '0') + quantity;
      await db
        .update(schema.positions)
        .set({
          quantity: String(targetQty),
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
          cost_basis: '0',
          market_value: '0',
          unrealized_pnl: '0',
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
