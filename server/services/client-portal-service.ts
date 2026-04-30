/**
 * Client Portal Service (Phase 5C)
 *
 * Provides data and actions for the client self-service portal:
 *   - Portfolio summary & allocation
 *   - Performance (TWR / IRR stubs)
 *   - Holdings & recent transactions
 *   - Statement list
 *   - Action requests (contribution, withdrawal, transfer, redemption)
 *   - Notifications
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export const clientPortalService = {
  /**
   * Verify that a portfolio belongs to the authenticated client.
   * Client portal portfolio routes must call this before exposing holdings,
   * performance, allocation, or transaction data keyed only by portfolioId.
   */
  async portfolioBelongsToClient(portfolioId: string, clientId: string): Promise<boolean> {
    const [portfolio] = await db
      .select({ portfolio_id: schema.portfolios.portfolio_id })
      .from(schema.portfolios)
      .where(
        and(
          eq(schema.portfolios.portfolio_id, portfolioId),
          eq(schema.portfolios.client_id, clientId),
          eq(schema.portfolios.is_deleted, false),
        ),
      )
      .limit(1);

    return Boolean(portfolio);
  },

  // ---------------------------------------------------------------------------
  // Portfolio Summary
  // ---------------------------------------------------------------------------

  /**
   * Get aggregated portfolio summary for a client.
   * Returns total AUM, portfolio count, and per-portfolio details.
   */
  async getPortfolioSummary(clientId: string) {
    const portfolios = await db
      .select({
        portfolio_id: schema.portfolios.portfolio_id,
        type: schema.portfolios.type,
        base_currency: schema.portfolios.base_currency,
        aum: schema.portfolios.aum,
        portfolio_status: schema.portfolios.portfolio_status,
        inception_date: schema.portfolios.inception_date,
      })
      .from(schema.portfolios)
      .where(
        and(
          eq(schema.portfolios.client_id, clientId),
          eq(schema.portfolios.is_deleted, false),
        ),
      );

    const totalAum = portfolios.reduce(
      (sum: number, p: any) => sum + parseFloat(p.aum ?? '0'),
      0,
    );

    return {
      totalAum,
      portfolioCount: portfolios.length,
      portfolios: portfolios.map((p: any) => ({
        id: p.portfolio_id,
        name: `${p.type ?? 'Portfolio'} - ${p.portfolio_id}`,
        productType: p.type,
        marketValue: parseFloat(p.aum ?? '0'),
        currency: p.base_currency ?? 'PHP',
        status: p.portfolio_status,
        inceptionDate: p.inception_date,
      })),
    };
  },

  // ---------------------------------------------------------------------------
  // Allocation
  // ---------------------------------------------------------------------------

  /**
   * Get asset allocation for a portfolio (grouped by asset class from positions).
   */
  async getAllocation(portfolioId: string) {
    const positionRows = await db
      .select({
        asset_class: schema.securities.asset_class,
        market_value: schema.positions.market_value,
      })
      .from(schema.positions)
      .innerJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .where(
        and(
          eq(schema.positions.portfolio_id, portfolioId),
          eq(schema.positions.is_deleted, false),
        ),
      );

    const totalValue = positionRows.reduce(
      (sum: number, r: any) => sum + parseFloat(r.market_value ?? '0'),
      0,
    );

    // Group by asset class
    const grouped: Record<string, number> = {};
    for (const row of positionRows) {
      const cls = row.asset_class ?? 'Other';
      grouped[cls] = (grouped[cls] ?? 0) + parseFloat(row.market_value ?? '0');
    }

    const allocations = Object.entries(grouped).map(([assetClass, mv]) => ({
      assetClass,
      weight: totalValue > 0 ? (mv / totalValue) * 100 : 0,
      marketValue: mv,
    }));

    return { allocations, totalValue };
  },

  // ---------------------------------------------------------------------------
  // Performance (stub formulas)
  // ---------------------------------------------------------------------------

  /**
   * Compute stub TWR and IRR for a portfolio over a given period.
   * In production these would be calculated from actual transaction-weighted flows.
   */
  async getPerformance(portfolioId: string, period: string) {
    // Fetch current AUM as proxy
    const [portfolio] = await db
      .select({ aum: schema.portfolios.aum, inception_date: schema.portfolios.inception_date })
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    const aum = parseFloat(portfolio?.aum ?? '0');

    // Stub: generate synthetic returns based on period
    const periodMultipliers: Record<string, number> = {
      '1M': 0.008,
      '3M': 0.024,
      '6M': 0.052,
      '1Y': 0.098,
      'YTD': 0.065,
      'SI': 0.182,
    };

    const multiplier = periodMultipliers[period] ?? periodMultipliers['1Y'];

    const twr = multiplier * 100; // e.g. 9.8%
    const irr = (multiplier - 0.002) * 100; // slightly lower
    const benchmarkReturn = (multiplier - 0.005) * 100;

    const periodLabels: Record<string, string> = {
      '1M': '1 Month',
      '3M': '3 Months',
      '6M': '6 Months',
      '1Y': '1 Year',
      'YTD': 'Year to Date',
      'SI': 'Since Inception',
    };

    // Stub data points (monthly)
    const now = new Date();
    const dataPoints: { date: string; value: number }[] = [];
    const monthCount = period === '1M' ? 1 : period === '3M' ? 3 : period === '6M' ? 6 : 12;
    for (let i = monthCount; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const growth = 1 + (multiplier * ((monthCount - i) / monthCount));
      dataPoints.push({
        date: d.toISOString().slice(0, 10),
        value: Math.round(aum * growth * 100) / 100,
      });
    }

    return {
      twr: Math.round(twr * 100) / 100,
      irr: Math.round(irr * 100) / 100,
      benchmarkReturn: Math.round(benchmarkReturn * 100) / 100,
      periodLabel: periodLabels[period] ?? period,
      dataPoints,
    };
  },

  // ---------------------------------------------------------------------------
  // Statements (stub)
  // ---------------------------------------------------------------------------

  /**
   * Return list of available statements for a client.
   * Stub: generates synthetic statement entries.
   */
  async getStatements(clientId: string, period?: string) {
    // In production this would query a statements / reports table
    const now = new Date();
    const statements: Array<{
      id: string;
      period: string;
      type: string;
      generatedAt: string;
      downloadUrl: string;
    }> = [];

    const types = ['Monthly Statement', 'Quarterly Report', 'Tax Certificate'];

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const periodStr = d.toISOString().slice(0, 7); // YYYY-MM

      if (period && !periodStr.startsWith(period)) continue;

      const typeIdx = i % 3 === 0 ? 1 : 0; // quarterly every 3 months
      statements.push({
        id: `stmt-${clientId}-${periodStr}`,
        period: periodStr,
        type: types[typeIdx],
        generatedAt: new Date(d.getFullYear(), d.getMonth() + 1, 5).toISOString(),
        downloadUrl: `/api/v1/client-portal/statements/${clientId}/download/${periodStr}`,
      });
    }

    // Add a tax certificate for year-end
    statements.push({
      id: `stmt-${clientId}-tax-${now.getFullYear() - 1}`,
      period: `${now.getFullYear() - 1}`,
      type: 'Tax Certificate',
      generatedAt: new Date(now.getFullYear(), 2, 15).toISOString(),
      downloadUrl: `/api/v1/client-portal/statements/${clientId}/download/tax-${now.getFullYear() - 1}`,
    });

    return { statements };
  },

  // ---------------------------------------------------------------------------
  // Action Requests
  // ---------------------------------------------------------------------------

  /**
   * Clients can REQUEST actions (contribution, withdrawal, transfer, redemption).
   * These do NOT execute immediately -- they create a request record for back-office approval.
   */
  async requestAction(
    clientId: string,
    actionType: string,
    details: Record<string, unknown>,
  ) {
    const validTypes = ['CONTRIBUTION', 'WITHDRAWAL', 'TRANSFER', 'REDEMPTION'];
    if (!validTypes.includes(actionType)) {
      throw new Error(`Invalid action type: ${actionType}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Generate a reference number
    const refNo = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // In production: insert into a client_action_requests table.
    // Stub: return the request object as confirmation.
    const request = {
      id: refNo,
      clientId,
      actionType,
      details,
      status: 'PENDING_REVIEW',
      submittedAt: new Date().toISOString(),
      referenceNumber: refNo,
    };

    return request;
  },

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  /**
   * Get notifications for a client from notification_log.
   */
  async getNotifications(clientId: string) {
    const notifications = await db
      .select()
      .from(schema.notificationLog)
      .where(
        and(
          eq(schema.notificationLog.recipient_id, clientId),
          eq(schema.notificationLog.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.notificationLog.sent_at))
      .limit(50);

    return {
      notifications: notifications.map((n: any) => ({
        id: n.id,
        eventType: n.event_type,
        channel: n.channel,
        status: n.notification_status,
        sentAt: n.sent_at?.toISOString() ?? null,
        deliveredAt: n.delivered_at?.toISOString() ?? null,
      })),
    };
  },

  // ---------------------------------------------------------------------------
  // Holdings (detailed positions)
  // ---------------------------------------------------------------------------

  /**
   * Detailed position list for a portfolio with security info, P&L.
   */
  async getHoldings(portfolioId: string) {
    const holdings = await db
      .select({
        position_id: schema.positions.id,
        security_id: schema.positions.security_id,
        security_name: schema.securities.name,
        asset_class: schema.securities.asset_class,
        isin: schema.securities.isin,
        currency: schema.securities.currency,
        quantity: schema.positions.quantity,
        cost_basis: schema.positions.cost_basis,
        market_value: schema.positions.market_value,
        unrealized_pnl: schema.positions.unrealized_pnl,
        as_of_date: schema.positions.as_of_date,
      })
      .from(schema.positions)
      .innerJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .where(
        and(
          eq(schema.positions.portfolio_id, portfolioId),
          eq(schema.positions.is_deleted, false),
        ),
      );

    const totalMarketValue = holdings.reduce(
      (sum: number, h: any) => sum + parseFloat(h.market_value ?? '0'),
      0,
    );

    return {
      holdings: holdings.map((h: any) => {
        const mv = parseFloat(h.market_value ?? '0');
        const cost = parseFloat(h.cost_basis ?? '0');
        const qty = parseFloat(h.quantity ?? '0');
        const pnl = parseFloat(h.unrealized_pnl ?? '0');
        const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
        const price = qty > 0 ? mv / qty : 0;
        const weight = totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0;

        return {
          positionId: h.position_id,
          securityId: h.security_id,
          securityName: h.security_name ?? 'Unknown',
          assetClass: h.asset_class ?? 'Other',
          isin: h.isin,
          currency: h.currency ?? 'PHP',
          quantity: qty,
          price: Math.round(price * 10000) / 10000,
          costBasis: cost,
          marketValue: mv,
          weight: Math.round(weight * 100) / 100,
          pnl,
          pnlPct: Math.round(pnlPct * 100) / 100,
          asOfDate: h.as_of_date,
        };
      }),
      totalMarketValue,
    };
  },

  // ---------------------------------------------------------------------------
  // Recent Transactions
  // ---------------------------------------------------------------------------

  /**
   * Recent transactions for a portfolio (from orders table).
   */
  async getRecentTransactions(portfolioId: string, limit: number = 20) {
    const transactions = await db
      .select({
        order_id: schema.orders.order_id,
        order_no: schema.orders.order_no,
        type: schema.orders.type,
        side: schema.orders.side,
        security_id: schema.orders.security_id,
        security_name: schema.securities.name,
        quantity: schema.orders.quantity,
        limit_price: schema.orders.limit_price,
        currency: schema.orders.currency,
        order_status: schema.orders.order_status,
        value_date: schema.orders.value_date,
        created_at: schema.orders.created_at,
      })
      .from(schema.orders)
      .leftJoin(
        schema.securities,
        eq(schema.orders.security_id, schema.securities.id),
      )
      .where(
        and(
          eq(schema.orders.portfolio_id, portfolioId),
          eq(schema.orders.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.orders.created_at))
      .limit(limit);

    return {
      transactions: transactions.map((t: any) => ({
        orderId: t.order_id,
        orderNo: t.order_no,
        type: t.type,
        side: t.side,
        securityName: t.security_name ?? 'Unknown',
        quantity: parseFloat(t.quantity ?? '0'),
        price: parseFloat(t.limit_price ?? '0'),
        currency: t.currency ?? 'PHP',
        status: t.order_status,
        valueDate: t.value_date,
        createdAt: t.created_at?.toISOString() ?? null,
      })),
    };
  },
};
