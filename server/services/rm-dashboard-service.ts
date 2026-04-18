import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel } from 'drizzle-orm';

type Order = InferSelectModel<typeof schema.orders>;
type Portfolio = InferSelectModel<typeof schema.portfolios>;
type Client = InferSelectModel<typeof schema.clients>;

/**
 * RM Dashboard Aggregation Service
 *
 * Provides data for the Relationship Manager cockpit:
 *   - Book of Business (client count, total AUM, breakdown by product type)
 *   - Pending tasks (orders pending auth, KYC expiry, suitability refresh, breaches)
 *   - Order pipeline funnel (orders by status stage)
 *   - Client alerts (KYC expiring, compliance breaches, rejected orders)
 *   - AUM breakdown by product type
 *
 * NOTE: Until a formal RM-client relationship field exists, we approximate
 * ownership via `orders.created_by` and portfolio/client joins through orders.
 */
export const rmDashboardService = {

  /**
   * Get book of business for an RM.
   * Returns client count, total AUM, and breakdown by portfolio product type.
   */
  async getBookOfBusiness(rmId: number) {
    // Get distinct portfolio_ids from orders created by this RM
    const rmPortfolios = db
      .selectDistinct({ portfolio_id: schema.orders.portfolio_id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.created_by, String(rmId)),
          eq(schema.orders.is_deleted, false),
        ),
      )
      .as('rm_portfolios');

    // Join with portfolios to get AUM and types
    const portfolioData = await db
      .select({
        portfolio_id: schema.portfolios.portfolio_id,
        client_id: schema.portfolios.client_id,
        type: schema.portfolios.type,
        aum: schema.portfolios.aum,
      })
      .from(schema.portfolios)
      .innerJoin(rmPortfolios, eq(schema.portfolios.portfolio_id, rmPortfolios.portfolio_id));

    // Compute aggregates in application code for clarity
    const clientIds = new Set<string>();
    let totalAum = 0;
    const breakdownMap = new Map<string, { count: number; aum: number }>();

    for (const row of portfolioData) {
      if (row.client_id) clientIds.add(row.client_id);
      const aum = parseFloat(row.aum ?? '0');
      totalAum += aum;

      const pType = row.type ?? 'UNKNOWN';
      const existing = breakdownMap.get(pType) ?? { count: 0, aum: 0 };
      existing.count += 1;
      existing.aum += aum;
      breakdownMap.set(pType, existing);
    }

    const breakdown = Array.from(breakdownMap.entries()).map(([type, data]) => ({
      product_type: type,
      portfolio_count: data.count,
      aum: data.aum,
    }));

    return {
      client_count: clientIds.size,
      total_aum: totalAum,
      portfolio_count: portfolioData.length,
      breakdown,
    };
  },

  /**
   * Get pending tasks for the RM.
   * Returns counts of: orders pending auth, KYC expiring within 30 days,
   * suitability reviews due, and compliance limit breaches/warnings.
   */
  async getPendingTasks(rmId: number) {
    // 1. Orders pending authorization
    const [pendingAuthResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.created_by, String(rmId)),
          eq(schema.orders.order_status, 'PENDING_AUTH'),
          eq(schema.orders.is_deleted, false),
        ),
      );
    const pendingAuthCount = Number(pendingAuthResult?.count ?? 0);

    // 2. KYC cases expiring within 30 days
    // Get client_ids linked to this RM through orders
    const rmClientIds = db
      .selectDistinct({ client_id: schema.portfolios.client_id })
      .from(schema.portfolios)
      .innerJoin(
        schema.orders,
        and(
          eq(schema.orders.portfolio_id, schema.portfolios.portfolio_id),
          eq(schema.orders.created_by, String(rmId)),
          eq(schema.orders.is_deleted, false),
        ),
      )
      .as('rm_client_ids');

    const [kycExpiringResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.kycCases)
      .innerJoin(rmClientIds, eq(schema.kycCases.client_id, rmClientIds.client_id))
      .where(
        and(
          sql`${schema.kycCases.expiry_date} IS NOT NULL`,
          sql`${schema.kycCases.expiry_date} <= (CURRENT_DATE + INTERVAL '30 days')`,
          eq(schema.kycCases.is_deleted, false),
        ),
      );
    const kycExpiringCount = Number(kycExpiringResult?.count ?? 0);

    // 3. KYC cases in pending status
    const [kycPendingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.kycCases)
      .innerJoin(rmClientIds, eq(schema.kycCases.client_id, rmClientIds.client_id))
      .where(
        and(
          eq(schema.kycCases.kyc_status, 'PENDING'),
          eq(schema.kycCases.is_deleted, false),
        ),
      );
    const kycPendingCount = Number(kycPendingResult?.count ?? 0);

    // 4. Suitability reviews due (next_review_date on kycCases within 30 days, as proxy)
    const [suitabilityDueResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.kycCases)
      .innerJoin(rmClientIds, eq(schema.kycCases.client_id, rmClientIds.client_id))
      .where(
        and(
          sql`${schema.kycCases.next_review_date} IS NOT NULL`,
          sql`${schema.kycCases.next_review_date} <= (CURRENT_DATE + INTERVAL '30 days')`,
          eq(schema.kycCases.is_deleted, false),
        ),
      );
    const suitabilityDueCount = Number(suitabilityDueResult?.count ?? 0);

    // 5. Compliance limit warnings (current_exposure > warning_threshold_pct% of limit_amount)
    const [breachResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.complianceLimits)
      .where(
        and(
          eq(schema.complianceLimits.is_active, true),
          sql`CAST(${schema.complianceLimits.current_exposure} AS NUMERIC) > (CAST(${schema.complianceLimits.limit_amount} AS NUMERIC) * ${schema.complianceLimits.warning_threshold_pct} / 100)`,
        ),
      );
    const complianceBreachCount = Number(breachResult?.count ?? 0);

    return {
      orders_pending_auth: pendingAuthCount,
      kyc_expiring: kycExpiringCount,
      kyc_pending: kycPendingCount,
      suitability_reviews_due: suitabilityDueCount,
      compliance_breaches: complianceBreachCount,
      total: pendingAuthCount + kycExpiringCount + kycPendingCount + suitabilityDueCount + complianceBreachCount,
    };
  },

  /**
   * Get order pipeline funnel.
   * Returns count of orders in each status stage for the RM.
   */
  async getOrderPipeline(rmId: number) {
    const pipeline = await db
      .select({
        status: schema.orders.order_status,
        count: sql<number>`count(*)`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.created_by, String(rmId)),
          eq(schema.orders.is_deleted, false),
        ),
      )
      .groupBy(schema.orders.order_status);

    // Define the canonical stage ordering
    const stageOrder = [
      'DRAFT',
      'PENDING_AUTH',
      'AUTHORIZED',
      'REJECTED',
      'AGGREGATED',
      'PLACED',
      'PARTIALLY_FILLED',
      'FILLED',
      'CONFIRMED',
      'SETTLED',
      'REVERSAL_PENDING',
      'REVERSED',
      'CANCELLED',
    ] as const;

    // Build a map from the raw results
    const statusMap = new Map<string, number>();
    for (const row of pipeline) {
      if (row.status) statusMap.set(row.status, Number(row.count));
    }

    // Return stages in canonical order, including zeros
    const stages = stageOrder.map((stage) => ({
      status: stage,
      count: statusMap.get(stage) ?? 0,
    }));

    const totalOrders = stages.reduce((sum, s) => sum + s.count, 0);

    return { stages, total_orders: totalOrders };
  },

  /**
   * Get client alerts for the RM.
   * Returns KYC expiring, compliance breaches, and recently rejected orders.
   */
  async getClientAlerts(rmId: number) {
    // Sub-query: RM's client IDs via portfolio/orders link
    const rmClientIds = db
      .selectDistinct({ client_id: schema.portfolios.client_id })
      .from(schema.portfolios)
      .innerJoin(
        schema.orders,
        and(
          eq(schema.orders.portfolio_id, schema.portfolios.portfolio_id),
          eq(schema.orders.created_by, String(rmId)),
          eq(schema.orders.is_deleted, false),
        ),
      )
      .as('rm_client_ids');

    // 1. KYC expiring within 30 days
    const kycExpiring = await db
      .select({
        id: schema.kycCases.id,
        client_id: schema.kycCases.client_id,
        kyc_status: schema.kycCases.kyc_status,
        expiry_date: schema.kycCases.expiry_date,
        next_review_date: schema.kycCases.next_review_date,
      })
      .from(schema.kycCases)
      .innerJoin(rmClientIds, eq(schema.kycCases.client_id, rmClientIds.client_id))
      .where(
        and(
          sql`${schema.kycCases.expiry_date} IS NOT NULL`,
          sql`${schema.kycCases.expiry_date} <= (CURRENT_DATE + INTERVAL '30 days')`,
          eq(schema.kycCases.is_deleted, false),
        ),
      )
      .orderBy(schema.kycCases.expiry_date)
      .limit(50);

    // 2. Compliance limit breaches
    const complianceBreaches = await db
      .select({
        id: schema.complianceLimits.id,
        limit_type: schema.complianceLimits.limit_type,
        dimension: schema.complianceLimits.dimension,
        dimension_id: schema.complianceLimits.dimension_id,
        limit_amount: schema.complianceLimits.limit_amount,
        current_exposure: schema.complianceLimits.current_exposure,
        warning_threshold_pct: schema.complianceLimits.warning_threshold_pct,
      })
      .from(schema.complianceLimits)
      .where(
        and(
          eq(schema.complianceLimits.is_active, true),
          sql`CAST(${schema.complianceLimits.current_exposure} AS NUMERIC) > (CAST(${schema.complianceLimits.limit_amount} AS NUMERIC) * ${schema.complianceLimits.warning_threshold_pct} / 100)`,
        ),
      )
      .limit(50);

    // 3. Recently rejected orders (last 30 days)
    const rejectedOrders = await db
      .select({
        order_id: schema.orders.order_id,
        order_no: schema.orders.order_no,
        portfolio_id: schema.orders.portfolio_id,
        side: schema.orders.side,
        security_id: schema.orders.security_id,
        quantity: schema.orders.quantity,
        updated_at: schema.orders.updated_at,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.created_by, String(rmId)),
          eq(schema.orders.order_status, 'REJECTED'),
          eq(schema.orders.is_deleted, false),
          sql`${schema.orders.updated_at} >= (CURRENT_TIMESTAMP - INTERVAL '30 days')`,
        ),
      )
      .orderBy(desc(schema.orders.updated_at))
      .limit(50);

    return {
      kyc_expiring: kycExpiring,
      compliance_breaches: complianceBreaches,
      rejected_orders: rejectedOrders,
      summary: {
        kyc_expiring_count: kycExpiring.length,
        compliance_breach_count: complianceBreaches.length,
        rejected_order_count: rejectedOrders.length,
        total: kycExpiring.length + complianceBreaches.length + rejectedOrders.length,
      },
    };
  },

  /**
   * Get AUM breakdown by product type for the RM's clients.
   */
  async getAumByProductType(rmId: number) {
    // Sub-query: portfolio IDs from RM's orders
    const rmPortfolios = db
      .selectDistinct({ portfolio_id: schema.orders.portfolio_id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.created_by, String(rmId)),
          eq(schema.orders.is_deleted, false),
        ),
      )
      .as('rm_portfolios');

    const breakdown = await db
      .select({
        product_type: schema.portfolios.type,
        portfolio_count: sql<number>`count(*)`,
        total_aum: sql<number>`COALESCE(SUM(CAST(${schema.portfolios.aum} AS NUMERIC)), 0)`,
      })
      .from(schema.portfolios)
      .innerJoin(rmPortfolios, eq(schema.portfolios.portfolio_id, rmPortfolios.portfolio_id))
      .groupBy(schema.portfolios.type);

    type BreakdownRow = (typeof breakdown)[number];
    const totalAum = breakdown.reduce((sum: number, row: BreakdownRow) => sum + Number(row.total_aum), 0);

    return {
      breakdown: breakdown.map((row: BreakdownRow) => ({
        product_type: row.product_type ?? 'UNKNOWN',
        portfolio_count: Number(row.portfolio_count),
        total_aum: Number(row.total_aum),
        percentage: totalAum > 0 ? Number(((Number(row.total_aum) / totalAum) * 100).toFixed(2)) : 0,
      })),
      total_aum: totalAum,
    };
  },
};
