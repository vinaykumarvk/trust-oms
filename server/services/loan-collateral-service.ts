/**
 * loan-collateral-service.ts — Collateral Management & Revaluation
 *
 * PSM-79: Loans and collateral revaluations
 * PSM-86: Safekeeping of titles and securities agreements
 * PSM-87: Monitor sound value of collateral
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, lte, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError } from './service-errors';

function generateCollateralId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 9999) + 1;
  return `COL-${year}-${String(seq).padStart(4, '0')}`;
}

export const loanCollateralService = {
  // ── List collaterals for a facility ───────────────────────────────────────
  async listCollaterals(facilityId: string) {
    return db.select().from(schema.loanCollaterals)
      .where(and(
        eq(schema.loanCollaterals.facility_id, facilityId),
        eq(schema.loanCollaterals.is_deleted, false),
      ))
      .orderBy(desc(schema.loanCollaterals.created_at));
  },

  // ── Register collateral ───────────────────────────────────────────────────
  async createCollateral(facilityId: string, data: any, userId: string) {
    const collateralId = generateCollateralId();

    // Compute LTV if possible
    let ltv: string | undefined;
    if (data.appraised_value) {
      const [facility] = await db.select({ outstanding_principal: schema.loanFacilities.outstanding_principal })
        .from(schema.loanFacilities)
        .where(eq(schema.loanFacilities.facility_id, facilityId)).limit(1);
      if (facility) {
        const outstanding = parseFloat(facility.outstanding_principal ?? '0');
        const appraised = parseFloat(data.appraised_value);
        if (appraised > 0) {
          ltv = ((outstanding / appraised) * 100).toFixed(6);
        }
      }
    }

    const [record] = await db.insert(schema.loanCollaterals).values({
      ...data,
      collateral_id: collateralId,
      facility_id: facilityId,
      ltv_ratio: ltv ?? data.ltv_ratio,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  // ── Update collateral ────────────────────────────────────────────────────
  async updateCollateral(collateralId: string, data: any, userId: string) {
    const [existing] = await db.select().from(schema.loanCollaterals)
      .where(eq(schema.loanCollaterals.collateral_id, collateralId)).limit(1);
    if (!existing) throw new NotFoundError('Collateral not found');

    const [updated] = await db.update(schema.loanCollaterals)
      .set({ ...data, updated_at: new Date(), updated_by: userId })
      .where(eq(schema.loanCollaterals.collateral_id, collateralId))
      .returning();
    return updated;
  },

  // ── Revaluation (PSM-79) ─────────────────────────────────────────────────
  async recordRevaluation(collateralId: string, data: any, userId: string) {
    const [collateral] = await db.select().from(schema.loanCollaterals)
      .where(eq(schema.loanCollaterals.collateral_id, collateralId)).limit(1);
    if (!collateral) throw new NotFoundError('Collateral not found');

    // Compute new LTV
    const [facility] = await db.select({ outstanding_principal: schema.loanFacilities.outstanding_principal })
      .from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.facility_id, collateral.facility_id)).limit(1);

    let ltv: string | undefined;
    if (facility && data.appraised_value) {
      const outstanding = parseFloat(facility.outstanding_principal ?? '0');
      const appraised = parseFloat(data.appraised_value);
      if (appraised > 0) ltv = ((outstanding / appraised) * 100).toFixed(6);
    }

    // Insert valuation record
    const [valuation] = await db.insert(schema.loanCollateralValuations).values({
      collateral_id: collateralId,
      valuation_date: data.valuation_date || new Date().toISOString().split('T')[0],
      appraised_value: data.appraised_value,
      market_value: data.market_value,
      forced_sale_value: data.forced_sale_value,
      appraiser: data.appraiser,
      valuation_method: data.valuation_method,
      ltv_ratio: ltv,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();

    // Update collateral with new values
    await db.update(schema.loanCollaterals).set({
      appraised_value: data.appraised_value ?? collateral.appraised_value,
      appraisal_date: data.valuation_date || new Date().toISOString().split('T')[0],
      market_value: data.market_value ?? collateral.market_value,
      forced_sale_value: data.forced_sale_value ?? collateral.forced_sale_value,
      ltv_ratio: ltv ?? collateral.ltv_ratio,
      updated_at: new Date(),
      updated_by: userId,
    }).where(eq(schema.loanCollaterals.collateral_id, collateralId));

    return valuation;
  },

  // ── Valuation history ─────────────────────────────────────────────────────
  async getValuationHistory(collateralId: string) {
    return db.select().from(schema.loanCollateralValuations)
      .where(and(
        eq(schema.loanCollateralValuations.collateral_id, collateralId),
        eq(schema.loanCollateralValuations.is_deleted, false),
      ))
      .orderBy(desc(schema.loanCollateralValuations.valuation_date));
  },

  // ── LTV Monitoring (PSM-87) ───────────────────────────────────────────────
  async getHighLtvCollaterals(threshold: number = 80) {
    return db.select().from(schema.loanCollaterals)
      .where(and(
        eq(schema.loanCollaterals.is_deleted, false),
        sql`${schema.loanCollaterals.ltv_ratio}::numeric > ${threshold}`,
      ))
      .orderBy(desc(sql`${schema.loanCollaterals.ltv_ratio}::numeric`));
  },

  // ── Expiring insurance alerts ─────────────────────────────────────────────
  async getExpiringInsurance(daysAhead: number = 30) {
    const futureDate = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];
    return db.select().from(schema.loanCollaterals)
      .where(and(
        eq(schema.loanCollaterals.is_deleted, false),
        lte(schema.loanCollaterals.insurance_expiry, futureDate),
      ))
      .orderBy(schema.loanCollaterals.insurance_expiry);
  },

  // ── Sound value summary for a facility ────────────────────────────────────
  async getFacilityCollateralSummary(facilityId: string) {
    const [summary] = await db.select({
      total_appraised: sql<string>`coalesce(sum(${schema.loanCollaterals.appraised_value}::numeric), 0)`,
      total_market: sql<string>`coalesce(sum(${schema.loanCollaterals.market_value}::numeric), 0)`,
      total_fsv: sql<string>`coalesce(sum(${schema.loanCollaterals.forced_sale_value}::numeric), 0)`,
      count: sql<number>`count(*)`,
    }).from(schema.loanCollaterals)
      .where(and(
        eq(schema.loanCollaterals.facility_id, facilityId),
        eq(schema.loanCollaterals.is_deleted, false),
      ));
    return summary;
  },
};
