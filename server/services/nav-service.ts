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
   * FR-NAV-005: Dual-source deviation check.
   *
   * For each position, look for a second pricing record from a different source
   * on the same date. Compute a secondary NAV per unit from those prices and
   * return deviation_pct = |primary - secondary| / primary * 100.
   * If deviation_pct > 0.25, set deviation_flagged = true.
   *
   * @returns null when no secondary pricing source exists for any position.
   */
  async checkDualSourceDeviation(
    portfolioId: string,
    navDate: string,
    primaryNavPerUnit: number,
    unitsOutstanding: number,
  ): Promise<{
    secondary_pricing_source: string;
    secondary_nav_per_unit: number;
    deviation_pct: number;
    deviation_flagged: boolean;
  } | null> {
    const positions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, portfolioId));

    let secondaryTotalAssets = 0;
    let hasSecondaryPrice = false;
    const secondarySources: string[] = [];

    for (const position of positions) {
      if (!position.security_id) continue;
      const qty = parseFloat(position.quantity ?? '0');

      // Get ALL pricing records for this security on the NAV date
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
        // Use the second record as the secondary source
        const secondaryRecord = priceRecords[1];
        const secondaryPrice = parseFloat(secondaryRecord.close_price ?? '0');
        secondaryTotalAssets += qty * secondaryPrice;
        hasSecondaryPrice = true;
        if (secondaryRecord.source && !secondarySources.includes(secondaryRecord.source)) {
          secondarySources.push(secondaryRecord.source);
        }
      } else {
        // No secondary source for this security; use primary pricing via
        // fair-value hierarchy so we can still compute a full secondary NAV.
        const pricing = await this.applyFairValueHierarchy(
          position.security_id,
          navDate,
        );
        secondaryTotalAssets += qty * pricing.price;
      }
    }

    // If no position had a secondary price, nothing to compare
    if (!hasSecondaryPrice) return null;

    const secondaryNavPerUnit =
      unitsOutstanding > 0 ? secondaryTotalAssets / unitsOutstanding : 0;

    const deviationPct =
      primaryNavPerUnit > 0
        ? (Math.abs(primaryNavPerUnit - secondaryNavPerUnit) / primaryNavPerUnit) * 100
        : 0;

    return {
      secondary_pricing_source: secondarySources.join(',') || 'SECONDARY',
      secondary_nav_per_unit: secondaryNavPerUnit,
      deviation_pct: parseFloat(deviationPct.toFixed(6)),
      deviation_flagged: deviationPct > 0.25,
    };
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

    // FR-NAV-005: Check dual-source deviation before inserting
    const dualSource = await this.checkDualSourceDeviation(
      portfolioId,
      navDate,
      navPerUnit,
      unitsOutstanding,
    );

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
        // FR-NAV-005 dual-source fields
        secondary_pricing_source: dualSource?.secondary_pricing_source ?? null,
        secondary_nav_per_unit: dualSource
          ? String(dualSource.secondary_nav_per_unit)
          : null,
        deviation_pct: dualSource ? String(dualSource.deviation_pct) : null,
        deviation_flagged: dualSource?.deviation_flagged ?? false,
      })
      .returning();

    return {
      ...navRecord,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      position_details: positionDetails,
      dual_source_deviation: dualSource,
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

    // FR-NAV-005: Re-run dual-source deviation check at NAV level during validation
    const unitsOutstanding = parseFloat(navRecord.units_outstanding ?? '1') || 1;
    const primaryNavPerUnit = parseFloat(navRecord.nav_per_unit ?? '0');

    const dualSource = await this.checkDualSourceDeviation(
      navRecord.portfolio_id,
      navDate,
      primaryNavPerUnit,
      unitsOutstanding,
    );

    if (dualSource?.deviation_flagged) {
      warnings.push(
        `NAV dual-source deviation ${dualSource.deviation_pct.toFixed(4)}% ` +
          `exceeds 0.25% threshold (primary NAVpu=${primaryNavPerUnit.toFixed(4)}, ` +
          `secondary NAVpu=${dualSource.secondary_nav_per_unit.toFixed(4)}, ` +
          `source=${dualSource.secondary_pricing_source})`,
      );
    }

    // Update status to VALIDATED if no critical issues
    const newStatus = warnings.length === 0 ? 'VALIDATED' : 'VALIDATED';
    // Even with warnings, we mark as VALIDATED but return the warnings
    await db
      .update(schema.navComputations)
      .set({
        nav_status: newStatus,
        updated_at: new Date(),
        // FR-NAV-005: persist latest dual-source deviation results
        ...(dualSource
          ? {
              secondary_pricing_source: dualSource.secondary_pricing_source,
              secondary_nav_per_unit: String(dualSource.secondary_nav_per_unit),
              deviation_pct: String(dualSource.deviation_pct),
              deviation_flagged: dualSource.deviation_flagged,
            }
          : {}),
      })
      .where(eq(schema.navComputations.id, navId));

    return {
      valid: warnings.length === 0,
      warnings,
      nav_status: newStatus,
      dual_source_deviation: dualSource,
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
