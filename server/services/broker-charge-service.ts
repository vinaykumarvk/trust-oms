/**
 * Broker Charge Service (Philippines BRD FR-EXE-005)
 *
 * Calculates broker charges/commissions based on tiered schedules.
 * Supports FLAT, PERCENTAGE, and TIERED rate types with
 * configurable minimum charges per bracket.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, asc } from 'drizzle-orm';

interface ChargeBreakdownItem {
  tier_min: number;
  tier_max: number | null;
  rate_type: string;
  rate: number;
  applicable_amount: number;
  tier_fee: number;
}

export const brokerChargeService = {
  /**
   * Calculate broker charges for a given trade value.
   *
   * @param brokerId   - The broker ID
   * @param assetClass - e.g. 'EQUITY', 'FIXED_INCOME', 'FX'
   * @param tradeValue - The gross trade value in local currency
   */
  async calculateBrokerCharges(
    brokerId: number,
    assetClass: string,
    tradeValue: number,
  ): Promise<{
    fee: number;
    breakdown: ChargeBreakdownItem[];
  }> {
    if (tradeValue <= 0) {
      return { fee: 0, breakdown: [] };
    }

    // Look up tiered schedule from brokerChargeSchedules table
    const tiers = await db
      .select()
      .from(schema.brokerChargeSchedules)
      .where(
        and(
          eq(schema.brokerChargeSchedules.broker_id, brokerId),
          eq(schema.brokerChargeSchedules.asset_class, assetClass),
        ),
      )
      .orderBy(asc(schema.brokerChargeSchedules.tier_min));

    if (tiers.length === 0) {
      throw new Error(
        `No charge schedule found for broker ${brokerId}, asset class ${assetClass}`,
      );
    }

    const breakdown: ChargeBreakdownItem[] = [];
    let totalFee = 0;

    // Determine the rate type from the first tier (all tiers share the same rate_type for a broker+asset_class)
    const primaryRateType = tiers[0].rate_type ?? 'PERCENTAGE';

    switch (primaryRateType) {
      case 'FLAT': {
        // FLAT: fee = rate value (fixed amount regardless of trade value)
        const rate = parseFloat(tiers[0].rate ?? '0');
        const minCharge = parseFloat(tiers[0].min_charge ?? '0');
        totalFee = Math.max(rate, minCharge);

        breakdown.push({
          tier_min: parseFloat(tiers[0].tier_min ?? '0'),
          tier_max: tiers[0].tier_max ? parseFloat(tiers[0].tier_max) : null,
          rate_type: 'FLAT',
          rate,
          applicable_amount: tradeValue,
          tier_fee: totalFee,
        });
        break;
      }

      case 'PERCENTAGE': {
        // PERCENTAGE: fee = tradeValue * rate / 100
        const rate = parseFloat(tiers[0].rate ?? '0');
        const minCharge = parseFloat(tiers[0].min_charge ?? '0');
        const computedFee = tradeValue * rate / 100;
        totalFee = Math.max(computedFee, minCharge);

        breakdown.push({
          tier_min: parseFloat(tiers[0].tier_min ?? '0'),
          tier_max: tiers[0].tier_max ? parseFloat(tiers[0].tier_max) : null,
          rate_type: 'PERCENTAGE',
          rate,
          applicable_amount: tradeValue,
          tier_fee: totalFee,
        });
        break;
      }

      case 'TIERED': {
        // TIERED: sum of tier amounts based on bracket ranges
        let remainingValue = tradeValue;

        for (const tier of tiers) {
          if (remainingValue <= 0) break;

          const tierMin = parseFloat(tier.tier_min ?? '0');
          const tierMax = tier.tier_max ? parseFloat(tier.tier_max) : Infinity;
          const rate = parseFloat(tier.rate ?? '0');
          const minCharge = parseFloat(tier.min_charge ?? '0');

          // The band width for this tier
          const bandWidth = tierMax === Infinity
            ? remainingValue
            : Math.max(0, tierMax - tierMin);

          // How much of the trade value falls in this tier
          const applicableAmount = Math.min(remainingValue, bandWidth);

          if (applicableAmount <= 0) continue;

          const tierFee = Math.max(applicableAmount * rate / 100, minCharge);
          totalFee += tierFee;
          remainingValue -= applicableAmount;

          breakdown.push({
            tier_min: tierMin,
            tier_max: tierMax === Infinity ? null : tierMax,
            rate_type: 'TIERED',
            rate,
            applicable_amount: applicableAmount,
            tier_fee: tierFee,
          });
        }
        break;
      }

      default:
        throw new Error(`Unsupported rate type: ${primaryRateType}`);
    }

    // Round to 2 decimal places
    totalFee = Math.round(totalFee * 100) / 100;

    return {
      fee: totalFee,
      breakdown,
    };
  },

  /** List charge schedules for a broker, optionally filtered by asset class */
  async getSchedules(brokerId: number, assetClass?: string) {
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.brokerChargeSchedules.broker_id, brokerId),
    ];

    if (assetClass) {
      conditions.push(eq(schema.brokerChargeSchedules.asset_class, assetClass));
    }

    const schedules = await db
      .select()
      .from(schema.brokerChargeSchedules)
      .where(and(...conditions))
      .orderBy(asc(schema.brokerChargeSchedules.tier_min));

    return schedules;
  },

  /** Create or update a charge schedule tier */
  async upsertTier(data: {
    brokerId: number;
    assetClass: string;
    tierMin: number;
    tierMax?: number;
    rateType: 'FLAT' | 'PERCENTAGE' | 'TIERED';
    rate: number;
    minCharge?: number;
  }) {
    const [tier] = await db
      .insert(schema.brokerChargeSchedules)
      .values({
        broker_id: data.brokerId,
        asset_class: data.assetClass,
        tier_min: String(data.tierMin),
        tier_max: data.tierMax !== undefined ? String(data.tierMax) : null,
        rate_type: data.rateType,
        rate: String(data.rate),
        min_charge: data.minCharge !== undefined ? String(data.minCharge) : null,
      })
      .returning();

    return tier;
  },
};
