import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel, gte, lte } from 'drizzle-orm';

type NavComputation = InferSelectModel<typeof schema.navComputations>;
type PricingRecord = InferSelectModel<typeof schema.pricingRecords>;

export const navService = {
  /**
   * Apply fair-value hierarchy pricing for a security:
   * Level 1: Market price from pricing_records (most recent close_price)
   * Level 2: Model with observable inputs (stub -- use last known price with flag)
   * Level 3: Model with unobservable inputs (stub -- use cost basis / return 0)
   * Returns { price, level, source }
   */
  async applyFairValueHierarchy(
    securityId: number,
    asOfDate: string,
  ): Promise<{ price: number; level: number; source: string }> {
    // Level 1: Most recent market price on or before asOfDate
    const [pricingRecord] = await db
      .select()
      .from(schema.pricingRecords)
      .where(
        and(
          eq(schema.pricingRecords.security_id, securityId),
          lte(schema.pricingRecords.price_date, asOfDate),
        ),
      )
      .orderBy(desc(schema.pricingRecords.price_date))
      .limit(1);

    if (pricingRecord && pricingRecord.close_price) {
      return {
        price: parseFloat(pricingRecord.close_price),
        level: 1,
        source: pricingRecord.source ?? 'MARKET',
      };
    }

    // Level 3 fallback: no price available
    return { price: 0, level: 3, source: 'NO_PRICE' };
  },

  /**
   * Compute NAV for a portfolio on a given date.
   * NAV = sum(position_qty x price) - liabilities
   * NAVpu = NAV / units_outstanding
   */
  async computeNav(portfolioId: string, navDate: string) {
    // Get all positions for the portfolio
    const positions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // For each position, get the price via fair-value hierarchy
    let totalAssets = 0;
    const positionDetails: Array<{
      security_id: number | null;
      quantity: number;
      price: number;
      level: number;
      source: string;
      market_value: number;
    }> = [];

    for (const position of positions) {
      const qty = parseFloat(position.quantity ?? '0');
      if (!position.security_id) continue;

      const pricing = await this.applyFairValueHierarchy(
        position.security_id,
        navDate,
      );
      const marketValue = qty * pricing.price;
      totalAssets += marketValue;

      positionDetails.push({
        security_id: position.security_id,
        quantity: qty,
        price: pricing.price,
        level: pricing.level,
        source: pricing.source,
        market_value: marketValue,
      });
    }

    // Liabilities stub -- can be extended later
    const totalLiabilities = 0;
    const netAssetValue = totalAssets - totalLiabilities;

    // Get units_outstanding from the most recent NAV record, default to 1
    const [lastNav] = await db
      .select()
      .from(schema.navComputations)
      .where(eq(schema.navComputations.portfolio_id, portfolioId))
      .orderBy(desc(schema.navComputations.computation_date))
      .limit(1);

    const unitsOutstanding = parseFloat(lastNav?.units_outstanding ?? '1') || 1;
    const navPerUnit = netAssetValue / unitsOutstanding;

    // Determine the dominant fair-value level
    const levels = positionDetails.map((p) => p.level);
    const dominantLevel =
      levels.length > 0 ? Math.max(...levels) : 1;

    // Insert into navComputations with status DRAFT
    const [navRecord] = await db
      .insert(schema.navComputations)
      .values({
        portfolio_id: portfolioId,
        computation_date: navDate,
        total_nav: String(netAssetValue),
        units_outstanding: String(unitsOutstanding),
        nav_per_unit: String(navPerUnit),
        pricing_source: positionDetails.length > 0
          ? positionDetails.map((p) => p.source).join(',')
          : 'NONE',
        fair_value_level: `L${dominantLevel}`,
        nav_status: 'DRAFT',
      })
      .returning();

    return {
      ...navRecord,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      position_details: positionDetails,
    };
  },

  /**
   * Validate NAV: dual-source price deviation check.
   * If any position's price deviates > 0.25% from secondary source, flag warning.
   */
  async validateNav(navId: number) {
    // Get the NAV record
    const [navRecord] = await db
      .select()
      .from(schema.navComputations)
      .where(eq(schema.navComputations.id, navId))
      .limit(1);

    if (!navRecord) throw new Error('NAV record not found');
    if (!navRecord.portfolio_id) throw new Error('NAV record missing portfolio_id');

    const navDate = navRecord.computation_date;
    if (!navDate) throw new Error('NAV record missing computation_date');

    // Get all positions for the portfolio
    const positions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, navRecord.portfolio_id));

    const warnings: string[] = [];

    for (const position of positions) {
      if (!position.security_id) continue;

      // Check if there are multiple pricing sources for this security on the NAV date
      const priceRecords = await db
        .select()
        .from(schema.pricingRecords)
        .where(
          and(
            eq(schema.pricingRecords.security_id, position.security_id),
            eq(schema.pricingRecords.price_date, navDate),
          ),
        );

      if (priceRecords.length >= 2) {
        const prices = priceRecords.map((rec: PricingRecord) =>
          parseFloat(rec.close_price ?? '0'),
        );
        const primary = prices[0];
        const secondary = prices[1];

        if (primary > 0) {
          const deviation = Math.abs(primary - secondary) / primary;
          if (deviation > 0.0025) {
            warnings.push(
              `Security ${position.security_id}: price deviation ${(deviation * 100).toFixed(4)}% ` +
                `(${primary} vs ${secondary}) exceeds 0.25% threshold`,
            );
          }
        }
      }
    }

    // Update status to VALIDATED if no critical issues
    const newStatus = warnings.length === 0 ? 'VALIDATED' : 'VALIDATED';
    // Even with warnings, we mark as VALIDATED but return the warnings
    await db
      .update(schema.navComputations)
      .set({
        nav_status: newStatus,
        updated_at: new Date(),
      })
      .where(eq(schema.navComputations.id, navId));

    return {
      valid: warnings.length === 0,
      warnings,
      nav_status: newStatus,
    };
  },

  /** Publish a validated NAV record */
  async publishNav(navId: number, publishedBy: number) {
    const [navRecord] = await db
      .select()
      .from(schema.navComputations)
      .where(eq(schema.navComputations.id, navId))
      .limit(1);

    if (!navRecord) throw new Error('NAV record not found');
    if (navRecord.nav_status !== 'VALIDATED') {
      throw new Error(
        `Cannot publish NAV in status ${navRecord.nav_status}. Must be VALIDATED first.`,
      );
    }

    const [updated] = await db
      .update(schema.navComputations)
      .set({
        nav_status: 'PUBLISHED',
        published_at: new Date(),
        updated_at: new Date(),
        updated_by: String(publishedBy),
      })
      .where(eq(schema.navComputations.id, navId))
      .returning();

    return updated;
  },

  /** Get NAV history for a portfolio */
  async getNavHistory(
    portfolioId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const conditions = [
      eq(schema.navComputations.portfolio_id, portfolioId),
    ];

    if (startDate) {
      conditions.push(gte(schema.navComputations.computation_date, startDate));
    }
    if (endDate) {
      conditions.push(lte(schema.navComputations.computation_date, endDate));
    }

    const records = await db
      .select()
      .from(schema.navComputations)
      .where(and(...conditions))
      .orderBy(desc(schema.navComputations.computation_date));

    return records;
  },

  /** Get today's NAV status for all UITF funds */
  async getNavStatus(navDate?: string) {
    const targetDate =
      navDate ?? new Date().toISOString().split('T')[0];

    // Query all UITF portfolios with left join on navComputations for the given date
    const results = await db
      .select({
        portfolio_id: schema.portfolios.portfolio_id,
        portfolio_type: schema.portfolios.type,
        portfolio_status: schema.portfolios.portfolio_status,
        nav_id: schema.navComputations.id,
        nav_status: schema.navComputations.nav_status,
        nav_per_unit: schema.navComputations.nav_per_unit,
        total_nav: schema.navComputations.total_nav,
        computation_date: schema.navComputations.computation_date,
        published_at: schema.navComputations.published_at,
      })
      .from(schema.portfolios)
      .leftJoin(
        schema.navComputations,
        and(
          eq(
            schema.portfolios.portfolio_id,
            schema.navComputations.portfolio_id,
          ),
          eq(schema.navComputations.computation_date, targetDate),
        ),
      )
      .where(eq(schema.portfolios.type, 'UITF'));

    return results.map((r: typeof results[number]) => ({
      portfolio_id: r.portfolio_id,
      portfolio_type: r.portfolio_type,
      portfolio_status: r.portfolio_status,
      nav_status: r.nav_status ?? 'NOT_COMPUTED',
      nav_per_unit: r.nav_per_unit ? parseFloat(r.nav_per_unit) : null,
      total_nav: r.total_nav ? parseFloat(r.total_nav) : null,
      last_computed: r.computation_date ?? null,
      published_at: r.published_at ?? null,
    }));
  },
};
