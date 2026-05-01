/**
 * security-master-extensions-service.ts — MB-GAP-014
 *
 * Services for non-financial asset management:
 * - Instrument sub-type master (Philippine government securities, corporate bonds, etc.)
 * - Deposit placements (time deposits, special savings, structured deposits)
 * - Property assets (land, building, TCT/CCT with valuations)
 * - Safekeeping vault operations (vault master, access logs, inventory)
 * - Non-financial assets (artwork, jewelry, collectibles)
 */

import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  instrumentSubTypes,
  depositPlacements,
  propertyAssets,
  propertyValuations,
  safekeepingVaults,
  vaultAccessLogs,
  nonFinancialAssets,
  securities,
  unclaimedCertificates,
} from '@shared/schema';
import { NotFoundError, ValidationError } from './service-errors';

// ─── Instrument Sub-Type Service ──────────────────────────────────────────────

export const instrumentSubTypeService = {
  async create(data: {
    code: string;
    name: string;
    asset_class: string;
    description?: string;
    is_government?: boolean;
    is_listed?: boolean;
    tenor_category?: string;
    regulatory_category?: string;
    userId: string;
  }) {
    const existing = await db
      .select({ id: instrumentSubTypes.id })
      .from(instrumentSubTypes)
      .where(eq(instrumentSubTypes.code, data.code))
      .limit(1);
    if (existing.length > 0) throw new ValidationError(`Instrument sub-type code '${data.code}' already exists`);

    const [row] = await db.insert(instrumentSubTypes).values({
      code: data.code,
      name: data.name,
      asset_class: data.asset_class,
      description: data.description,
      is_government: data.is_government ?? false,
      is_listed: data.is_listed ?? true,
      tenor_category: data.tenor_category,
      regulatory_category: data.regulatory_category,
      created_by: data.userId,
    }).returning();
    return row;
  },

  async list(assetClass?: string) {
    const conditions = [eq(instrumentSubTypes.is_active, true)];
    if (assetClass) conditions.push(eq(instrumentSubTypes.asset_class, assetClass));
    return db.select().from(instrumentSubTypes).where(and(...conditions)).orderBy(instrumentSubTypes.code);
  },

  async update(id: number, data: Record<string, unknown>, userId: string) {
    const [existing] = await db.select().from(instrumentSubTypes).where(eq(instrumentSubTypes.id, id));
    if (!existing) throw new NotFoundError('Instrument sub-type not found');
    const [row] = await db.update(instrumentSubTypes)
      .set({ ...data, updated_by: userId } as any)
      .where(eq(instrumentSubTypes.id, id))
      .returning();
    return row;
  },

  async deactivate(id: number, userId: string) {
    const [existing] = await db.select().from(instrumentSubTypes).where(eq(instrumentSubTypes.id, id));
    if (!existing) throw new NotFoundError('Instrument sub-type not found');
    // Check if any securities reference this sub-type
    const [inUse] = await db.select({ cnt: sql<number>`count(*)` })
      .from(securities)
      .where(eq(securities.instrument_sub_type, existing.code));
    if (Number(inUse?.cnt) > 0) throw new ValidationError(`Cannot deactivate: ${inUse.cnt} securities reference this sub-type`);
    const [row] = await db.update(instrumentSubTypes)
      .set({ is_active: false, updated_by: userId })
      .where(eq(instrumentSubTypes.id, id))
      .returning();
    return row;
  },
};

// ─── Deposit Placement Service ────────────────────────────────────────────────

export const depositPlacementService = {
  async create(data: {
    portfolio_id: string;
    deposit_type: string;
    bank_name: string;
    bank_branch?: string;
    account_number?: string;
    currency?: string;
    principal_amount: string;
    interest_rate?: string;
    placement_date: string;
    maturity_date?: string;
    term_days?: number;
    interest_computation?: string;
    pre_termination_penalty_pct?: string;
    auto_rollover?: boolean;
    withholding_tax_rate?: string;
    certificate_number?: string;
    remarks?: string;
    userId: string;
  }) {
    const validTypes = ['TIME_DEPOSIT', 'SPECIAL_SAVINGS', 'STRUCTURED_DEPOSIT', 'FIXED_DEPOSIT'];
    if (!validTypes.includes(data.deposit_type)) {
      throw new ValidationError(`Invalid deposit_type. Must be one of: ${validTypes.join(', ')}`);
    }
    if (Number(data.principal_amount) <= 0) throw new ValidationError('principal_amount must be positive');

    const placementId = `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [row] = await db.insert(depositPlacements).values({
      placement_id: placementId,
      portfolio_id: data.portfolio_id,
      deposit_type: data.deposit_type,
      bank_name: data.bank_name,
      bank_branch: data.bank_branch,
      account_number: data.account_number,
      currency: data.currency ?? 'PHP',
      principal_amount: data.principal_amount,
      interest_rate: data.interest_rate,
      placement_date: data.placement_date,
      maturity_date: data.maturity_date,
      term_days: data.term_days,
      interest_computation: data.interest_computation ?? 'ACTUAL_360',
      pre_termination_penalty_pct: data.pre_termination_penalty_pct,
      auto_rollover: data.auto_rollover ?? false,
      withholding_tax_rate: data.withholding_tax_rate ?? '0.20',
      certificate_number: data.certificate_number,
      remarks: data.remarks,
      created_by: data.userId,
    }).returning();
    return row;
  },

  async listByPortfolio(portfolioId: string) {
    return db.select().from(depositPlacements)
      .where(eq(depositPlacements.portfolio_id, portfolioId))
      .orderBy(desc(depositPlacements.placement_date));
  },

  async getById(id: number) {
    const [row] = await db.select().from(depositPlacements).where(eq(depositPlacements.id, id));
    if (!row) throw new NotFoundError('Deposit placement not found');
    return row;
  },

  async preterminate(id: number, userId: string) {
    const [row] = await db.select().from(depositPlacements).where(eq(depositPlacements.id, id));
    if (!row) throw new NotFoundError('Deposit placement not found');
    if (row.placement_status !== 'ACTIVE') throw new ValidationError('Only ACTIVE placements can be pre-terminated');
    const [updated] = await db.update(depositPlacements)
      .set({ placement_status: 'PRE_TERMINATED', updated_by: userId })
      .where(eq(depositPlacements.id, id))
      .returning();
    return updated;
  },

  async rollover(id: number, newMaturityDate: string, newRate?: string, userId?: string) {
    const [row] = await db.select().from(depositPlacements).where(eq(depositPlacements.id, id));
    if (!row) throw new NotFoundError('Deposit placement not found');
    if (row.placement_status !== 'ACTIVE' && row.placement_status !== 'MATURED') {
      throw new ValidationError('Only ACTIVE or MATURED placements can be rolled over');
    }
    const [updated] = await db.update(depositPlacements)
      .set({
        placement_status: 'ROLLED_OVER',
        updated_by: userId,
      })
      .where(eq(depositPlacements.id, id))
      .returning();

    // Create new placement with rollover
    const newPlacementId = `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [newPlacement] = await db.insert(depositPlacements).values({
      placement_id: newPlacementId,
      portfolio_id: row.portfolio_id,
      deposit_type: row.deposit_type,
      bank_name: row.bank_name,
      bank_branch: row.bank_branch,
      account_number: row.account_number,
      currency: row.currency,
      principal_amount: row.principal_amount,
      interest_rate: newRate ?? row.interest_rate,
      placement_date: row.maturity_date ?? new Date().toISOString().split('T')[0],
      maturity_date: newMaturityDate,
      term_days: row.term_days,
      interest_computation: row.interest_computation,
      pre_termination_penalty_pct: row.pre_termination_penalty_pct,
      auto_rollover: row.auto_rollover,
      rollover_count: (row.rollover_count ?? 0) + 1,
      withholding_tax_rate: row.withholding_tax_rate,
      certificate_number: row.certificate_number,
      remarks: `Rolled over from ${row.placement_id}`,
      created_by: userId,
    }).returning();
    return { previousPlacement: updated, newPlacement };
  },

  async computeAccruedInterest(id: number) {
    const [row] = await db.select().from(depositPlacements).where(eq(depositPlacements.id, id));
    if (!row) throw new NotFoundError('Deposit placement not found');
    const principal = Number(row.principal_amount);
    const rate = Number(row.interest_rate ?? 0);
    const placementDate = new Date(row.placement_date);
    const today = new Date();
    const daysHeld = Math.floor((today.getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24));
    const divisor = row.interest_computation === 'ACTUAL_365' ? 365 : 360;
    const grossInterest = principal * (rate / 100) * (daysHeld / divisor);
    const wht = Number(row.withholding_tax_rate ?? 0);
    const taxAmount = grossInterest * wht;
    const netInterest = grossInterest - taxAmount;
    return {
      placement_id: row.placement_id,
      principal,
      rate,
      days_held: daysHeld,
      day_count_basis: row.interest_computation,
      gross_interest: Math.round(grossInterest * 100) / 100,
      withholding_tax_rate: wht,
      tax_amount: Math.round(taxAmount * 100) / 100,
      net_interest: Math.round(netInterest * 100) / 100,
    };
  },
};

// ─── Property Asset Service ───────────────────────────────────────────────────

export const propertyAssetService = {
  async create(data: {
    portfolio_id: string;
    property_type: string;
    title_type?: string;
    title_number?: string;
    registry_of_deeds?: string;
    lot_number?: string;
    block_number?: string;
    survey_number?: string;
    tax_declaration_number?: string;
    address?: string;
    city_municipality?: string;
    province?: string;
    land_area_sqm?: string;
    floor_area_sqm?: string;
    acquisition_date?: string;
    acquisition_cost?: string;
    current_appraised_value?: string;
    last_appraisal_date?: string;
    appraiser_name?: string;
    zonal_value?: string;
    assessed_value?: string;
    rental_income_monthly?: string;
    tenant_name?: string;
    lease_start_date?: string;
    lease_end_date?: string;
    insurance_policy_number?: string;
    insurance_expiry_date?: string;
    encumbrances?: string;
    remarks?: string;
    userId: string;
  }) {
    const validTypes = ['LAND', 'BUILDING', 'CONDOMINIUM_UNIT', 'COMMERCIAL', 'RESIDENTIAL', 'AGRICULTURAL', 'INDUSTRIAL'];
    if (!validTypes.includes(data.property_type)) {
      throw new ValidationError(`Invalid property_type. Must be one of: ${validTypes.join(', ')}`);
    }
    const propertyId = `PROP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [row] = await db.insert(propertyAssets).values({
      property_id: propertyId,
      portfolio_id: data.portfolio_id,
      property_type: data.property_type,
      title_type: data.title_type,
      title_number: data.title_number,
      registry_of_deeds: data.registry_of_deeds,
      lot_number: data.lot_number,
      block_number: data.block_number,
      survey_number: data.survey_number,
      tax_declaration_number: data.tax_declaration_number,
      address: data.address,
      city_municipality: data.city_municipality,
      province: data.province,
      land_area_sqm: data.land_area_sqm,
      floor_area_sqm: data.floor_area_sqm,
      acquisition_date: data.acquisition_date,
      acquisition_cost: data.acquisition_cost,
      current_appraised_value: data.current_appraised_value,
      last_appraisal_date: data.last_appraisal_date,
      appraiser_name: data.appraiser_name,
      zonal_value: data.zonal_value,
      assessed_value: data.assessed_value,
      rental_income_monthly: data.rental_income_monthly,
      tenant_name: data.tenant_name,
      lease_start_date: data.lease_start_date,
      lease_end_date: data.lease_end_date,
      insurance_policy_number: data.insurance_policy_number,
      insurance_expiry_date: data.insurance_expiry_date,
      encumbrances: data.encumbrances,
      remarks: data.remarks,
      created_by: data.userId,
    }).returning();
    return row;
  },

  async listByPortfolio(portfolioId: string) {
    return db.select().from(propertyAssets)
      .where(eq(propertyAssets.portfolio_id, portfolioId))
      .orderBy(propertyAssets.property_type);
  },

  async getById(id: number) {
    const [row] = await db.select().from(propertyAssets).where(eq(propertyAssets.id, id));
    if (!row) throw new NotFoundError('Property asset not found');
    return row;
  },

  async update(id: number, data: Record<string, unknown>, userId: string) {
    const [existing] = await db.select().from(propertyAssets).where(eq(propertyAssets.id, id));
    if (!existing) throw new NotFoundError('Property asset not found');
    const [row] = await db.update(propertyAssets)
      .set({ ...data, updated_by: userId } as any)
      .where(eq(propertyAssets.id, id))
      .returning();
    return row;
  },

  async addValuation(data: {
    property_id: string;
    valuation_date: string;
    valuation_type: string;
    appraised_value: string;
    appraiser_name?: string;
    appraiser_license?: string;
    valuation_report_ref?: string;
    remarks?: string;
    userId: string;
  }) {
    const [prop] = await db.select().from(propertyAssets)
      .where(eq(propertyAssets.property_id, data.property_id));
    if (!prop) throw new NotFoundError('Property asset not found');

    const [row] = await db.insert(propertyValuations).values({
      property_id: data.property_id,
      valuation_date: data.valuation_date,
      valuation_type: data.valuation_type,
      appraised_value: data.appraised_value,
      appraiser_name: data.appraiser_name,
      appraiser_license: data.appraiser_license,
      valuation_report_ref: data.valuation_report_ref,
      remarks: data.remarks,
      created_by: data.userId,
    }).returning();

    // Update the property's current appraised value
    await db.update(propertyAssets)
      .set({
        current_appraised_value: data.appraised_value,
        last_appraisal_date: data.valuation_date,
        appraiser_name: data.appraiser_name,
        updated_by: data.userId,
      })
      .where(eq(propertyAssets.property_id, data.property_id));

    return row;
  },

  async getValuationHistory(propertyId: string) {
    return db.select().from(propertyValuations)
      .where(eq(propertyValuations.property_id, propertyId))
      .orderBy(desc(propertyValuations.valuation_date));
  },
};

// ─── Safekeeping Vault Service ────────────────────────────────────────────────

export const safekeepingVaultService = {
  async createVault(data: {
    vault_code: string;
    vault_name: string;
    location: string;
    branch_code?: string;
    vault_type?: string;
    total_capacity?: number;
    access_level?: string;
    custodian_name?: string;
    remarks?: string;
    userId: string;
  }) {
    const existing = await db.select({ id: safekeepingVaults.id })
      .from(safekeepingVaults)
      .where(eq(safekeepingVaults.vault_code, data.vault_code))
      .limit(1);
    if (existing.length > 0) throw new ValidationError(`Vault code '${data.vault_code}' already exists`);

    const [row] = await db.insert(safekeepingVaults).values({
      vault_code: data.vault_code,
      vault_name: data.vault_name,
      location: data.location,
      branch_code: data.branch_code,
      vault_type: data.vault_type ?? 'MAIN',
      total_capacity: data.total_capacity,
      access_level: data.access_level ?? 'RESTRICTED',
      custodian_name: data.custodian_name,
      remarks: data.remarks,
      created_by: data.userId,
    }).returning();
    return row;
  },

  async listVaults() {
    return db.select().from(safekeepingVaults)
      .where(eq(safekeepingVaults.is_active, true))
      .orderBy(safekeepingVaults.vault_code);
  },

  async updateVault(id: number, data: Record<string, unknown>, userId: string) {
    const [existing] = await db.select().from(safekeepingVaults).where(eq(safekeepingVaults.id, id));
    if (!existing) throw new NotFoundError('Vault not found');
    const [row] = await db.update(safekeepingVaults)
      .set({ ...data, updated_by: userId } as any)
      .where(eq(safekeepingVaults.id, id))
      .returning();
    return row;
  },

  async logAccess(data: {
    vault_id: number;
    access_type: string;
    certificate_ids?: unknown;
    witness_name?: string;
    purpose?: string;
    remarks?: string;
    userId: string;
  }) {
    const [vault] = await db.select().from(safekeepingVaults).where(eq(safekeepingVaults.id, data.vault_id));
    if (!vault) throw new NotFoundError('Vault not found');
    if (!vault.is_active) throw new ValidationError('Vault is inactive');

    const validTypes = ['DEPOSIT', 'WITHDRAWAL', 'INSPECTION', 'INVENTORY', 'TRANSFER'];
    if (!validTypes.includes(data.access_type)) {
      throw new ValidationError(`Invalid access_type. Must be one of: ${validTypes.join(', ')}`);
    }

    const [row] = await db.insert(vaultAccessLogs).values({
      vault_id: data.vault_id,
      accessed_by: parseInt(data.userId, 10),
      access_type: data.access_type,
      certificate_ids: data.certificate_ids,
      witness_name: data.witness_name,
      purpose: data.purpose,
      remarks: data.remarks,
      created_by: data.userId,
    }).returning();

    // Update vault capacity for deposits/withdrawals
    if (data.access_type === 'DEPOSIT') {
      await db.update(safekeepingVaults)
        .set({ used_capacity: sql`COALESCE(${safekeepingVaults.used_capacity}, 0) + 1` })
        .where(eq(safekeepingVaults.id, data.vault_id));
    } else if (data.access_type === 'WITHDRAWAL') {
      await db.update(safekeepingVaults)
        .set({ used_capacity: sql`GREATEST(COALESCE(${safekeepingVaults.used_capacity}, 0) - 1, 0)` })
        .where(eq(safekeepingVaults.id, data.vault_id));
    }

    return row;
  },

  async getAccessLog(vaultId: number) {
    return db.select().from(vaultAccessLogs)
      .where(eq(vaultAccessLogs.vault_id, vaultId))
      .orderBy(desc(vaultAccessLogs.access_date));
  },

  async getVaultInventory(vaultId: number) {
    const [vault] = await db.select().from(safekeepingVaults).where(eq(safekeepingVaults.id, vaultId));
    if (!vault) throw new NotFoundError('Vault not found');

    // Get certificates stored in this vault
    const certificates = await db.select().from(unclaimedCertificates)
      .where(eq(unclaimedCertificates.vault_reference, vault.vault_code));

    // Get non-financial assets stored in this vault
    const nfAssets = await db.select().from(nonFinancialAssets)
      .where(eq(nonFinancialAssets.vault_id, vaultId));

    return {
      vault,
      certificates,
      non_financial_assets: nfAssets,
      total_items: certificates.length + nfAssets.length,
    };
  },
};

// ─── Non-Financial Asset Service ──────────────────────────────────────────────

export const nonFinancialAssetService = {
  async create(data: {
    portfolio_id: string;
    asset_category: string;
    description: string;
    acquisition_date?: string;
    acquisition_cost?: string;
    current_valuation?: string;
    last_valuation_date?: string;
    appraiser_name?: string;
    storage_location?: string;
    vault_id?: number;
    insurance_policy_number?: string;
    insurance_value?: string;
    insurance_expiry_date?: string;
    condition_rating?: string;
    provenance?: string;
    serial_number?: string;
    dimensions?: string;
    remarks?: string;
    userId: string;
  }) {
    const validCategories = ['ARTWORK', 'JEWELRY', 'COLLECTIBLES', 'ANTIQUES', 'PRECIOUS_METALS', 'VEHICLES', 'EQUIPMENT', 'OTHER'];
    if (!validCategories.includes(data.asset_category)) {
      throw new ValidationError(`Invalid asset_category. Must be one of: ${validCategories.join(', ')}`);
    }

    const assetId = `NFA-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [row] = await db.insert(nonFinancialAssets).values({
      asset_id: assetId,
      portfolio_id: data.portfolio_id,
      asset_category: data.asset_category,
      description: data.description,
      acquisition_date: data.acquisition_date,
      acquisition_cost: data.acquisition_cost,
      current_valuation: data.current_valuation,
      last_valuation_date: data.last_valuation_date,
      appraiser_name: data.appraiser_name,
      storage_location: data.storage_location,
      vault_id: data.vault_id,
      insurance_policy_number: data.insurance_policy_number,
      insurance_value: data.insurance_value,
      insurance_expiry_date: data.insurance_expiry_date,
      condition_rating: data.condition_rating,
      provenance: data.provenance,
      serial_number: data.serial_number,
      dimensions: data.dimensions,
      remarks: data.remarks,
      created_by: data.userId,
    }).returning();
    return row;
  },

  async listByPortfolio(portfolioId: string) {
    return db.select().from(nonFinancialAssets)
      .where(eq(nonFinancialAssets.portfolio_id, portfolioId))
      .orderBy(nonFinancialAssets.asset_category);
  },

  async getById(id: number) {
    const [row] = await db.select().from(nonFinancialAssets).where(eq(nonFinancialAssets.id, id));
    if (!row) throw new NotFoundError('Non-financial asset not found');
    return row;
  },

  async update(id: number, data: Record<string, unknown>, userId: string) {
    const [existing] = await db.select().from(nonFinancialAssets).where(eq(nonFinancialAssets.id, id));
    if (!existing) throw new NotFoundError('Non-financial asset not found');
    const [row] = await db.update(nonFinancialAssets)
      .set({ ...data, updated_by: userId } as any)
      .where(eq(nonFinancialAssets.id, id))
      .returning();
    return row;
  },

  async updateValuation(id: number, data: {
    current_valuation: string;
    appraiser_name?: string;
    userId: string;
  }) {
    const [existing] = await db.select().from(nonFinancialAssets).where(eq(nonFinancialAssets.id, id));
    if (!existing) throw new NotFoundError('Non-financial asset not found');
    const today = new Date().toISOString().split('T')[0];
    const [row] = await db.update(nonFinancialAssets)
      .set({
        current_valuation: data.current_valuation,
        last_valuation_date: today,
        appraiser_name: data.appraiser_name,
        updated_by: data.userId,
      })
      .where(eq(nonFinancialAssets.id, id))
      .returning();
    return row;
  },

  /** Get consolidated non-financial asset portfolio summary */
  async getPortfolioSummary(portfolioId: string) {
    const assets = await db.select().from(nonFinancialAssets)
      .where(and(
        eq(nonFinancialAssets.portfolio_id, portfolioId),
        eq(nonFinancialAssets.asset_status, 'HELD'),
      ));

    const byCategory: Record<string, { count: number; total_cost: number; total_valuation: number }> = {};
    let totalCost = 0;
    let totalValuation = 0;

    for (const asset of assets) {
      const cat = asset.asset_category;
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total_cost: 0, total_valuation: 0 };
      byCategory[cat].count++;
      const cost = Number(asset.acquisition_cost ?? 0);
      const val = Number(asset.current_valuation ?? 0);
      byCategory[cat].total_cost += cost;
      byCategory[cat].total_valuation += val;
      totalCost += cost;
      totalValuation += val;
    }

    // Include property assets
    const properties = await db.select().from(propertyAssets)
      .where(and(
        eq(propertyAssets.portfolio_id, portfolioId),
        eq(propertyAssets.property_status, 'HELD'),
      ));
    let propertyTotalCost = 0;
    let propertyTotalValuation = 0;
    for (const p of properties) {
      propertyTotalCost += Number(p.acquisition_cost ?? 0);
      propertyTotalValuation += Number(p.current_appraised_value ?? 0);
    }

    // Include deposit placements
    const deposits = await db.select().from(depositPlacements)
      .where(and(
        eq(depositPlacements.portfolio_id, portfolioId),
        eq(depositPlacements.placement_status, 'ACTIVE'),
      ));
    let depositTotal = 0;
    for (const d of deposits) {
      depositTotal += Number(d.principal_amount ?? 0);
    }

    return {
      portfolio_id: portfolioId,
      non_financial_assets: {
        count: assets.length,
        total_acquisition_cost: Math.round(totalCost * 100) / 100,
        total_current_valuation: Math.round(totalValuation * 100) / 100,
        by_category: byCategory,
      },
      property_assets: {
        count: properties.length,
        total_acquisition_cost: Math.round(propertyTotalCost * 100) / 100,
        total_appraised_value: Math.round(propertyTotalValuation * 100) / 100,
      },
      deposit_placements: {
        count: deposits.length,
        total_principal: Math.round(depositTotal * 100) / 100,
      },
    };
  },
};
