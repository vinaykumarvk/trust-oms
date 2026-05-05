#!/usr/bin/env tsx
/**
 * seed-enterprise-modules.ts — Demo data for FX ODA, MLD, Margin Lending, and Trust Accounts
 *
 * Populates the enterprise modules added in the OEMS gap closure and trust banking sprints
 * with realistic demo data suitable for product demonstrations.
 *
 * Idempotent: checks count before inserting. Safe to run multiple times.
 *
 * Usage:
 *   DATABASE_URL='...' npx tsx server/scripts/seed-enterprise-modules.ts
 */

import 'dotenv/config';
import { db } from '../db';
import * as s from '../../packages/shared/src/schema';
import { sql } from 'drizzle-orm';

const AUD = { created_by: 'SYSTEM', updated_by: 'SYSTEM' };
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

async function count(table: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
}

// ─── FX ODA Products ─────────────────────────────────────────────────────────
async function seedOdaProducts() {
  const existing = await count(s.oemsProducts);
  if (existing >= 8) { console.log(`  oems_products: ${existing} (sufficient)`); return; }

  const products = [
    {
      product_code: 'ODA-202605-001',
      product_name: 'FX ODA USD/IDR Intraday',
      product_family: 'ODA' as const,
      currency: 'IDR',
      product_status: 'ACTIVE' as const,
      is_active: true,
      currency_pair_from: 'USD',
      currency_pair_to: 'IDR',
      reference_rate_source: 'JISDOR',
      oda_transaction_types_allowed: ['SPOT', 'TODAY', 'TOM'],
      effective_date_types_allowed: ['INTRADAY'],
      min_placement_amount: '100000000',
      min_collective_order_amount: '500000000',
      spread_tolerance_percent: '0.0025',
      cutoff_intraday: '14:00',
      cutoff_overnight: '10:00',
      cutoff_gtd: '14:00',
      cutoff_timezone: 'Asia/Jakarta',
      eligible_account_types: ['SAVINGS', 'CURRENT', 'TIME_DEPOSIT'],
      sales_cert_required: true,
      sales_cert_type: 'STRUCTURED_PRODUCT',
      trade_ideas_enabled: true,
      trade_ideas_rate: '16250.00',
      trade_ideas_message: 'USD weakening trend — consider conversion',
      submitted_by: 'SYSTEM',
      submitted_at: daysAgo(30),
      approved_by: 'BO_CHECKER_1',
      approved_at: daysAgo(29),
    },
    {
      product_code: 'ODA-202605-002',
      product_name: 'FX ODA EUR/IDR Overnight',
      product_family: 'ODA' as const,
      currency: 'IDR',
      product_status: 'ACTIVE' as const,
      is_active: true,
      currency_pair_from: 'EUR',
      currency_pair_to: 'IDR',
      reference_rate_source: 'ECB_REF',
      oda_transaction_types_allowed: ['SPOT', 'TODAY', 'TOM'],
      effective_date_types_allowed: ['OVERNIGHT'],
      min_placement_amount: '50000000',
      min_collective_order_amount: '250000000',
      spread_tolerance_percent: '0.003',
      cutoff_intraday: '14:00',
      cutoff_overnight: '09:30',
      cutoff_timezone: 'Asia/Jakarta',
      eligible_account_types: ['SAVINGS', 'CURRENT'],
      sales_cert_required: true,
      sales_cert_type: 'FX_DERIVATIVE',
      submitted_by: 'SYSTEM',
      submitted_at: daysAgo(25),
      approved_by: 'BO_CHECKER_1',
      approved_at: daysAgo(24),
    },
    {
      product_code: 'ODA-202605-003',
      product_name: 'FX ODA SGD/IDR GTD',
      product_family: 'ODA' as const,
      currency: 'IDR',
      product_status: 'PENDING_APPROVAL' as const,
      is_active: false,
      currency_pair_from: 'SGD',
      currency_pair_to: 'IDR',
      reference_rate_source: 'MAS_REF',
      oda_transaction_types_allowed: ['SPOT', 'GTD'],
      effective_date_types_allowed: ['GTD'],
      min_placement_amount: '75000000',
      min_collective_order_amount: '300000000',
      spread_tolerance_percent: '0.002',
      cutoff_intraday: '13:30',
      cutoff_gtd: '13:30',
      cutoff_timezone: 'Asia/Jakarta',
      eligible_account_types: ['SAVINGS', 'CURRENT', 'TIME_DEPOSIT'],
      sales_cert_required: false,
      submitted_by: 'RM_MAKER_1',
      submitted_at: daysAgo(2),
    },
    {
      product_code: 'ODA-202605-004',
      product_name: 'FX ODA JPY/IDR Intraday',
      product_family: 'ODA' as const,
      currency: 'IDR',
      product_status: 'DRAFT' as const,
      is_active: false,
      currency_pair_from: 'JPY',
      currency_pair_to: 'IDR',
      reference_rate_source: 'BOJ_REF',
      oda_transaction_types_allowed: ['SPOT'],
      effective_date_types_allowed: ['INTRADAY'],
      min_placement_amount: '5000000000',
      min_collective_order_amount: '10000000000',
      spread_tolerance_percent: '0.004',
      cutoff_intraday: '13:00',
      cutoff_timezone: 'Asia/Jakarta',
      eligible_account_types: ['SAVINGS'],
      sales_cert_required: false,
    },
    {
      product_code: 'MLD-202605-001',
      product_name: 'MLD DKI One Touch Series A',
      product_family: 'MLD' as const,
      currency: 'IDR',
      product_status: 'ACTIVE' as const,
      is_active: true,
      min_placement_amount: '500000000',
      submitted_by: 'SYSTEM',
      submitted_at: daysAgo(60),
      approved_by: 'BO_CHECKER_1',
      approved_at: daysAgo(59),
    },
    {
      product_code: 'MLD-202605-002',
      product_name: 'MLD DKI No Touch Series B',
      product_family: 'MLD' as const,
      currency: 'IDR',
      product_status: 'ACTIVE' as const,
      is_active: true,
      min_placement_amount: '250000000',
      submitted_by: 'SYSTEM',
      submitted_at: daysAgo(45),
      approved_by: 'BO_CHECKER_1',
      approved_at: daysAgo(44),
    },
  ];

  for (const p of products) {
    await db.insert(s.oemsProducts).values({ ...p, ...AUD } as any).onConflictDoNothing();
  }
  console.log(`  oems_products: seeded ${products.length} products`);
}

// ─── MLD Tranches ────────────────────────────────────────────────────────────
async function seedMldTranches() {
  const existing = await count(s.oemsMldTranches);
  if (existing >= 4) { console.log(`  oems_mld_tranches: ${existing} (sufficient)`); return; }

  const tranches = [
    {
      tranche_code: 'MLD-TR-202605-001',
      tranche_name: 'DKI One Touch USD/IDR Series A Tranche 1',
      currency: 'IDR',
      option_type: 'ONE_TOUCH',
      underlying_reference: 'USD/IDR',
      indicative_rate: '7.25',
      minimum_interest_rate: '4.50',
      bonus_payout_rate: '2.75',
      strike_rate: '16500.00',
      tax_rate: '0.20',
      offering_start: dateStr(daysAgo(14)),
      offering_end: dateStr(daysFromNow(7)),
      trade_date: dateStr(daysFromNow(8)),
      value_date: dateStr(daysFromNow(10)),
      fixing_date: dateStr(daysFromNow(100)),
      maturity_date: dateStr(daysFromNow(105)),
      quota_amount: '50000000000',
      booked_amount: '32500000000',
      min_investment: '500000000',
      max_investment: '10000000000',
      lifecycle: 'OFFERING' as const,
      product_status: 'ACTIVE' as const,
      option_style: 'EUROPEAN',
      observation_period_start: dateStr(daysFromNow(10)),
      observation_period_end: dateStr(daysFromNow(100)),
      cutoff_time: '14:00',
      cutoff_timezone: 'Asia/Jakarta',
      eligible_account_types: ['SAVINGS', 'CURRENT'],
      sales_cert_required: true,
      sales_cert_type: 'STRUCTURED_PRODUCT',
      risk_rating: 'MODERATE',
      submitted_by: 'SYSTEM',
      submitted_at: daysAgo(20),
      approved_by: 'BO_CHECKER_1',
      approved_at: daysAgo(19),
    },
    {
      tranche_code: 'MLD-TR-202605-002',
      tranche_name: 'DKI No Touch EUR/IDR Series B Tranche 1',
      currency: 'IDR',
      option_type: 'NO_TOUCH',
      underlying_reference: 'EUR/IDR',
      indicative_rate: '6.80',
      minimum_interest_rate: '4.00',
      bonus_payout_rate: '2.80',
      strike_rate: '17800.00',
      tax_rate: '0.20',
      offering_start: dateStr(daysAgo(7)),
      offering_end: dateStr(daysFromNow(14)),
      trade_date: dateStr(daysFromNow(15)),
      value_date: dateStr(daysFromNow(17)),
      fixing_date: dateStr(daysFromNow(107)),
      maturity_date: dateStr(daysFromNow(112)),
      quota_amount: '30000000000',
      booked_amount: '8750000000',
      min_investment: '250000000',
      max_investment: '5000000000',
      lifecycle: 'OFFERING' as const,
      product_status: 'ACTIVE' as const,
      option_style: 'AMERICAN',
      observation_period_start: dateStr(daysFromNow(17)),
      observation_period_end: dateStr(daysFromNow(107)),
      upper_limit: '18200.00',
      lower_limit: '17400.00',
      cutoff_time: '13:30',
      cutoff_timezone: 'Asia/Jakarta',
      eligible_account_types: ['SAVINGS', 'CURRENT', 'TIME_DEPOSIT'],
      sales_cert_required: true,
      sales_cert_type: 'STRUCTURED_PRODUCT',
      risk_rating: 'AGGRESSIVE',
      submitted_by: 'SYSTEM',
      submitted_at: daysAgo(10),
      approved_by: 'BO_CHECKER_1',
      approved_at: daysAgo(9),
    },
    {
      tranche_code: 'MLD-TR-202605-003',
      tranche_name: 'DKI Double No Touch USD/IDR Series C',
      currency: 'IDR',
      option_type: 'DOUBLE_NO_TOUCH',
      underlying_reference: 'USD/IDR',
      indicative_rate: '8.10',
      minimum_interest_rate: '5.00',
      bonus_payout_rate: '3.10',
      strike_rate: '16300.00',
      tax_rate: '0.20',
      offering_start: dateStr(daysFromNow(5)),
      offering_end: dateStr(daysFromNow(20)),
      trade_date: dateStr(daysFromNow(21)),
      value_date: dateStr(daysFromNow(23)),
      fixing_date: dateStr(daysFromNow(113)),
      maturity_date: dateStr(daysFromNow(120)),
      quota_amount: '75000000000',
      booked_amount: '0',
      min_investment: '1000000000',
      max_investment: '15000000000',
      lifecycle: 'DRAFT' as const,
      product_status: 'PENDING_APPROVAL' as const,
      option_style: 'EUROPEAN',
      upper_limit: '16800.00',
      lower_limit: '15800.00',
      cutoff_time: '14:00',
      cutoff_timezone: 'Asia/Jakarta',
      eligible_account_types: ['SAVINGS', 'CURRENT'],
      sales_cert_required: true,
      sales_cert_type: 'STRUCTURED_PRODUCT',
      risk_rating: 'MODERATE',
      submitted_by: 'RM_MAKER_1',
      submitted_at: daysAgo(1),
    },
  ];

  for (const t of tranches) {
    await db.insert(s.oemsMldTranches).values({ ...t, ...AUD } as any).onConflictDoNothing();
  }
  console.log(`  oems_mld_tranches: seeded ${tranches.length} tranches`);
}

// ─── Margin Lending ──────────────────────────────────────────────────────────
async function seedMarginLending() {
  const existingGroups = await count(s.mlFacilityGroups);
  if (existingGroups >= 3) { console.log(`  ml_facility_groups: ${existingGroups} (sufficient)`); return; }

  const groups = [
    {
      facility_group_id: 'MLFG-001',
      base_number: 'BASE-PB-001',
      base_name: 'PT Maju Sejahtera Private Banking',
      customer_id: null as string | null,
      description: 'High-net-worth private banking margin facility',
      start_date: dateStr(daysAgo(365)),
      maturity_date: dateStr(daysFromNow(365)),
      limit_amount: '5000000000000',
      utilized_amount: '3200000000000',
      available_drawing_power: '1800000000000',
      currency: 'IDR',
      record_status: 'AUTHORIZED',
      authorized_by: 'RISK_OFFICER_1',
      authorized_at: daysAgo(360),
    },
    {
      facility_group_id: 'MLFG-002',
      base_number: 'BASE-PB-002',
      base_name: 'CV Berkah Sentosa Priority Banking',
      customer_id: null as string | null,
      description: 'Priority banking margin facility — multi-currency',
      start_date: dateStr(daysAgo(180)),
      maturity_date: dateStr(daysFromNow(545)),
      limit_amount: '2000000000000',
      utilized_amount: '1450000000000',
      available_drawing_power: '550000000000',
      currency: 'IDR',
      record_status: 'AUTHORIZED',
      authorized_by: 'RISK_OFFICER_1',
      authorized_at: daysAgo(175),
    },
    {
      facility_group_id: 'MLFG-003',
      base_number: 'BASE-INST-001',
      base_name: 'Dana Pensiun Telkom Institutional',
      customer_id: null as string | null,
      description: 'Institutional pension fund margin facility',
      start_date: dateStr(daysAgo(30)),
      maturity_date: dateStr(daysFromNow(335)),
      limit_amount: '10000000000000',
      utilized_amount: '0',
      available_drawing_power: '10000000000000',
      currency: 'IDR',
      record_status: 'DRAFT',
    },
  ];

  for (const g of groups) {
    await db.insert(s.mlFacilityGroups).values({ ...g, ...AUD } as any).onConflictDoNothing();
  }
  console.log(`  ml_facility_groups: seeded ${groups.length} groups`);

  const facilities = [
    {
      facility_id: 'MLF-001',
      facility_group_id: 'MLFG-001',
      source_system: 'CBS_CORE',
      source_facility_ref: 'CBS-FAC-98765',
      asset_class: 'FIXED_INCOME',
      sub_asset_class: 'GOVERNMENT_BOND',
      currency: 'IDR',
      limit_amount: '3000000000000',
      utilized_amount: '2100000000000',
      available_amount: '900000000000',
      facility_status: 'ACTIVE',
      payload: { ltv_percent: 70, top_up_percent: 80, sell_out_percent: 90 },
    },
    {
      facility_id: 'MLF-002',
      facility_group_id: 'MLFG-001',
      source_system: 'CBS_CORE',
      source_facility_ref: 'CBS-FAC-98766',
      asset_class: 'EQUITY',
      sub_asset_class: 'BLUE_CHIP',
      currency: 'IDR',
      limit_amount: '2000000000000',
      utilized_amount: '1100000000000',
      available_amount: '900000000000',
      facility_status: 'ACTIVE',
      payload: { ltv_percent: 60, top_up_percent: 75, sell_out_percent: 85 },
    },
    {
      facility_id: 'MLF-003',
      facility_group_id: 'MLFG-002',
      source_system: 'CBS_CORE',
      source_facility_ref: 'CBS-FAC-44321',
      asset_class: 'FIXED_INCOME',
      sub_asset_class: 'CORPORATE_BOND',
      currency: 'IDR',
      limit_amount: '2000000000000',
      utilized_amount: '1450000000000',
      available_amount: '550000000000',
      facility_status: 'ACTIVE',
      payload: { ltv_percent: 65, top_up_percent: 78, sell_out_percent: 88 },
    },
    {
      facility_id: 'MLF-004',
      facility_group_id: 'MLFG-002',
      source_system: 'CBS_PRIORITY',
      source_facility_ref: 'PRI-FAC-11234',
      asset_class: 'EQUITY',
      sub_asset_class: 'MID_CAP',
      currency: 'USD',
      limit_amount: '50000000',
      utilized_amount: '32000000',
      available_amount: '18000000',
      facility_status: 'ACTIVE',
      payload: { ltv_percent: 55, top_up_percent: 70, sell_out_percent: 80, fx_haircut_percent: 8 },
    },
  ];

  for (const f of facilities) {
    await db.insert(s.mlFacilities).values({ ...f, ...AUD } as any).onConflictDoNothing();
  }
  console.log(`  ml_facilities: seeded ${facilities.length} facilities`);
}

// ─── Trust Accounts ──────────────────────────────────────────────────────────
async function seedTrustAccounts() {
  const existing = await count(s.trustAccounts);
  if (existing >= 5) { console.log(`  trust_accounts: ${existing} (sufficient)`); return; }

  // Get a client ref
  const [client] = await db.select().from(s.clients).limit(1);
  const clientId = client?.client_id ?? 'CLIENT-001';

  const accounts = [
    {
      account_id: 'TA-PH-001',
      client_id: clientId,
      product_type: 'UITF' as const,
      account_name: 'Santos Family Trust — UITF Growth',
      base_currency: 'PHP',
      account_status: 'ACTIVE' as const,
      onboarding_reference_type: 'PROSPECT',
      onboarding_reference_id: 'PROS-2026-001',
      opened_at: daysAgo(120),
      statement_frequency: 'QUARTERLY',
      amla_type: 'NORMAL',
      tax_status: 'TAXABLE',
      joint_account_type: 'SOLE',
    },
    {
      account_id: 'TA-PH-002',
      client_id: clientId,
      product_type: 'ITFA' as const,
      account_name: 'Santos Family Trust — ITFA Conservative',
      base_currency: 'PHP',
      account_status: 'ACTIVE' as const,
      onboarding_reference_type: 'PROSPECT',
      onboarding_reference_id: 'PROS-2026-002',
      opened_at: daysAgo(90),
      statement_frequency: 'MONTHLY',
      amla_type: 'NORMAL',
      tax_status: 'TAXABLE',
      joint_account_type: 'SOLE',
    },
    {
      account_id: 'TA-PH-003',
      client_id: clientId,
      product_type: 'ESCROW' as const,
      account_name: 'Metro Properties Escrow Account',
      base_currency: 'PHP',
      account_status: 'ACTIVE' as const,
      onboarding_reference_type: 'DIRECT',
      onboarding_reference_id: 'DIR-2026-001',
      opened_at: daysAgo(60),
      statement_frequency: 'MONTHLY',
      amla_type: 'ENHANCED_DD',
      tax_status: 'EXEMPT',
      escrow_contract_expiry: dateStr(daysFromNow(300)),
      joint_account_type: 'JOINT_AND',
      max_joint_holders: 3,
    },
    {
      account_id: 'TA-PH-004',
      client_id: clientId,
      product_type: 'PENSION' as const,
      account_name: 'PagIBIG Employee Retirement Trust',
      base_currency: 'PHP',
      account_status: 'ACTIVE' as const,
      onboarding_reference_type: 'CORPORATE',
      onboarding_reference_id: 'CORP-2026-001',
      opened_at: daysAgo(200),
      statement_frequency: 'QUARTERLY',
      amla_type: 'NORMAL',
      tax_status: 'EXEMPT',
      discretion_flag: true,
      joint_account_type: 'SOLE',
    },
    {
      account_id: 'TA-PH-005',
      client_id: clientId,
      product_type: 'UITF' as const,
      account_name: 'Reyes Education Trust — UITF Balanced',
      base_currency: 'PHP',
      account_status: 'DRAFT' as const,
      onboarding_validation_status: 'PENDING',
      joint_account_type: 'JOINT_OR',
      max_joint_holders: 2,
    },
  ];

  for (const a of accounts) {
    await db.insert(s.trustAccounts).values({ ...a, ...AUD } as any).onConflictDoNothing();
  }
  console.log(`  trust_accounts: seeded ${accounts.length} accounts`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
export async function seedEnterpriseModules() {
  console.log('Seeding enterprise module demo data...\n');

  await seedOdaProducts();
  await seedMldTranches();
  await seedMarginLending();
  await seedTrustAccounts();

  console.log('\nDone.');
}

// Direct execution
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedEnterpriseModules()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
