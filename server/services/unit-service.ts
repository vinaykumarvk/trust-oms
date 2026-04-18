import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel } from 'drizzle-orm';

const PHT_CUTOFF_HOUR = 11;
const PHT_CUTOFF_MINUTE = 30;
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

export const unitService = {
  /**
   * Check if transaction is after 11:30 PHT cut-off.
   * If so, effective date becomes the next calendar day.
   */
  enforceCutOff(transactionDate?: Date): {
    effectiveDate: string;
    isNextDay: boolean;
  } {
    const now = transactionDate ?? new Date();

    // Convert to PHT (UTC+8)
    const phtTime = new Date(now.getTime() + PHT_OFFSET_MS);
    const phtHours = phtTime.getUTCHours();
    const phtMinutes = phtTime.getUTCMinutes();

    const isPastCutOff =
      phtHours > PHT_CUTOFF_HOUR ||
      (phtHours === PHT_CUTOFF_HOUR && phtMinutes >= PHT_CUTOFF_MINUTE);

    // Get the PHT date (YYYY-MM-DD)
    const phtDateStr = phtTime.toISOString().split('T')[0];

    if (isPastCutOff) {
      // Next calendar day
      const nextDay = new Date(phtTime.getTime() + 24 * 60 * 60 * 1000);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      return { effectiveDate: nextDayStr, isNextDay: true };
    }

    return { effectiveDate: phtDateStr, isNextDay: false };
  },

  /**
   * Issue units for a UITF subscription.
   * units = amount / nav_per_unit
   */
  async issueUnits(data: {
    portfolioId: string;
    amount: number;
    investorId: string;
    transactionDate?: string;
  }) {
    // Enforce cut-off
    const txDate = data.transactionDate
      ? new Date(data.transactionDate)
      : undefined;
    const { effectiveDate, isNextDay } = this.enforceCutOff(txDate);

    // Get latest NAVpu from navComputations for the portfolio
    const [latestNav] = await db
      .select()
      .from(schema.navComputations)
      .where(
        and(
          eq(schema.navComputations.portfolio_id, data.portfolioId),
          eq(schema.navComputations.nav_status, 'PUBLISHED'),
        ),
      )
      .orderBy(desc(schema.navComputations.computation_date))
      .limit(1);

    const navPerUnit = parseFloat(latestNav?.nav_per_unit ?? '0');
    if (navPerUnit <= 0) {
      throw new Error(
        'No published NAV available for this portfolio. Cannot compute units.',
      );
    }

    const unitsIssued = data.amount / navPerUnit;

    // Record the transaction in unitTransactions
    const [record] = await db
      .insert(schema.unitTransactions)
      .values({
        portfolio_id: data.portfolioId,
        type: 'SUBSCRIPTION',
        units: String(unitsIssued),
        nav_per_unit: String(navPerUnit),
        amount: String(data.amount),
        investor_id: data.investorId,
        transaction_date: effectiveDate,
        cut_off_applied: isNextDay,
      })
      .returning();

    return {
      transaction_id: record.id,
      units_issued: unitsIssued,
      nav_per_unit: navPerUnit,
      effective_date: effectiveDate,
      cut_off_applied: isNextDay,
      amount: data.amount,
    };
  },

  /**
   * Redeem units for a UITF withdrawal.
   * redemption_amount = units x nav_per_unit
   */
  async redeemUnits(data: {
    portfolioId: string;
    units: number;
    investorId: string;
    transactionDate?: string;
  }) {
    // Enforce cut-off
    const txDate = data.transactionDate
      ? new Date(data.transactionDate)
      : undefined;
    const { effectiveDate, isNextDay } = this.enforceCutOff(txDate);

    // Get latest published NAVpu
    const [latestNav] = await db
      .select()
      .from(schema.navComputations)
      .where(
        and(
          eq(schema.navComputations.portfolio_id, data.portfolioId),
          eq(schema.navComputations.nav_status, 'PUBLISHED'),
        ),
      )
      .orderBy(desc(schema.navComputations.computation_date))
      .limit(1);

    const navPerUnit = parseFloat(latestNav?.nav_per_unit ?? '0');
    if (navPerUnit <= 0) {
      throw new Error(
        'No published NAV available for this portfolio. Cannot compute redemption.',
      );
    }

    const redemptionAmount = data.units * navPerUnit;

    // Record the transaction in unitTransactions
    const [record] = await db
      .insert(schema.unitTransactions)
      .values({
        portfolio_id: data.portfolioId,
        type: 'REDEMPTION',
        units: String(-data.units), // negative for redemption
        nav_per_unit: String(navPerUnit),
        amount: String(-redemptionAmount), // negative for outflow
        investor_id: data.investorId,
        transaction_date: effectiveDate,
        cut_off_applied: isNextDay,
      })
      .returning();

    return {
      transaction_id: record.id,
      units_redeemed: data.units,
      nav_per_unit: navPerUnit,
      redemption_amount: redemptionAmount,
      effective_date: effectiveDate,
      cut_off_applied: isNextDay,
    };
  },

  /**
   * Reconcile units: total issued - total redeemed = outstanding.
   */
  async reconcileUnits(portfolioId: string) {
    // Sum all unit transactions for the portfolio
    const result = await db
      .select({
        total_units: sql<string>`COALESCE(SUM(CAST(${schema.unitTransactions.units} AS numeric)), 0)`,
        subscription_count: sql<number>`COUNT(*) FILTER (WHERE ${schema.unitTransactions.type} = 'SUBSCRIPTION')`,
        redemption_count: sql<number>`COUNT(*) FILTER (WHERE ${schema.unitTransactions.type} = 'REDEMPTION')`,
        total_subscribed: sql<string>`COALESCE(SUM(CAST(${schema.unitTransactions.units} AS numeric)) FILTER (WHERE ${schema.unitTransactions.type} = 'SUBSCRIPTION'), 0)`,
        total_redeemed: sql<string>`COALESCE(SUM(ABS(CAST(${schema.unitTransactions.units} AS numeric))) FILTER (WHERE ${schema.unitTransactions.type} = 'REDEMPTION'), 0)`,
      })
      .from(schema.unitTransactions)
      .where(eq(schema.unitTransactions.portfolio_id, portfolioId));

    const row = result[0];

    // Get latest NAV for comparison
    const [latestNav] = await db
      .select()
      .from(schema.navComputations)
      .where(eq(schema.navComputations.portfolio_id, portfolioId))
      .orderBy(desc(schema.navComputations.computation_date))
      .limit(1);

    const navUnitsOutstanding = parseFloat(
      latestNav?.units_outstanding ?? '0',
    );
    const computedUnitsOutstanding = parseFloat(row?.total_units ?? '0');
    const discrepancy = Math.abs(
      navUnitsOutstanding - computedUnitsOutstanding,
    );

    return {
      portfolio_id: portfolioId,
      total_subscribed: parseFloat(row?.total_subscribed ?? '0'),
      total_redeemed: parseFloat(row?.total_redeemed ?? '0'),
      units_outstanding: computedUnitsOutstanding,
      nav_units_outstanding: navUnitsOutstanding,
      discrepancy,
      is_reconciled: discrepancy < 0.01,
      subscription_count: Number(row?.subscription_count ?? 0),
      redemption_count: Number(row?.redemption_count ?? 0),
    };
  },
};
