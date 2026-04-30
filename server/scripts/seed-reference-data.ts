/**
 * Seed Reference Data
 *
 * Inserts initial reference data for:
 *   - Countries
 *   - Currencies
 *   - Asset Classes
 *   - Branches
 *   - Exchanges
 *   - Trust Product Types
 *   - Fee Types
 *   - Tax Codes
 *
 * Safe to run multiple times (uses ON CONFLICT DO NOTHING via code-level checks).
 *
 * Usage:
 *   npx tsx server/scripts/seed-reference-data.ts
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { seedTrustFeesProData } from './seed-trustfees-pro';

// ---------------------------------------------------------------------------
// Helper: Insert rows if not already present (by code field)
// ---------------------------------------------------------------------------

async function seedTable<T extends Record<string, unknown>>(
  tableName: string,
  table: any,
  rows: T[],
  uniqueField: string = 'code',
) {
  console.log(`Seeding ${tableName}...`);
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const col = table[uniqueField];
      if (!col) {
        // No unique field to check, just insert
        await db.insert(table).values(row as any);
        inserted++;
        continue;
      }

      const existing = await db
        .select()
        .from(table)
        .where(eq(col, row[uniqueField]))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(table).values(row as any);
      inserted++;
    } catch (err) {
      // Handle unique constraint violations gracefully
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('unique') || message.includes('duplicate')) {
        skipped++;
      } else {
        console.error(`  Error inserting ${tableName} row:`, message);
      }
    }
  }

  console.log(`  ${tableName}: ${inserted} inserted, ${skipped} skipped (already exist)`);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const countriesData = [
  { code: 'PH', name: 'Philippines', iso_alpha3: 'PHL' },
  { code: 'US', name: 'United States', iso_alpha3: 'USA' },
  { code: 'JP', name: 'Japan', iso_alpha3: 'JPN' },
  { code: 'SG', name: 'Singapore', iso_alpha3: 'SGP' },
  { code: 'HK', name: 'Hong Kong', iso_alpha3: 'HKG' },
  { code: 'GB', name: 'United Kingdom', iso_alpha3: 'GBR' },
  { code: 'AU', name: 'Australia', iso_alpha3: 'AUS' },
  { code: 'CN', name: 'China', iso_alpha3: 'CHN' },
  { code: 'KR', name: 'South Korea', iso_alpha3: 'KOR' },
  { code: 'TH', name: 'Thailand', iso_alpha3: 'THA' },
  { code: 'MY', name: 'Malaysia', iso_alpha3: 'MYS' },
  { code: 'ID', name: 'Indonesia', iso_alpha3: 'IDN' },
  { code: 'VN', name: 'Vietnam', iso_alpha3: 'VNM' },
  { code: 'DE', name: 'Germany', iso_alpha3: 'DEU' },
  { code: 'CH', name: 'Switzerland', iso_alpha3: 'CHE' },
  { code: 'CA', name: 'Canada', iso_alpha3: 'CAN' },
  { code: 'NZ', name: 'New Zealand', iso_alpha3: 'NZL' },
];

const currenciesData = [
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimal_places: 2 },
  { code: 'USD', name: 'United States Dollar', symbol: '$', decimal_places: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimal_places: 0 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimal_places: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimal_places: 2 },
  { code: 'GBP', name: 'British Pound Sterling', symbol: '£', decimal_places: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimal_places: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimal_places: 2 },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimal_places: 0 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimal_places: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimal_places: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimal_places: 0 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimal_places: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimal_places: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimal_places: 2 },
];

const assetClassesData = [
  { code: 'EQ', name: 'Equity', description: 'Listed and unlisted equities, common and preferred shares' },
  { code: 'FI', name: 'Fixed Income', description: 'Government and corporate bonds, notes, and other debt instruments' },
  { code: 'MM', name: 'Money Market', description: 'Short-term instruments: T-bills, commercial paper, repos, time deposits' },
  { code: 'ALT', name: 'Alternatives', description: 'Hedge funds, private equity, commodities, and other alternative investments' },
  { code: 'RE', name: 'Real Estate', description: 'Real estate investment trusts (REITs) and direct property investments' },
  { code: 'FX', name: 'Foreign Exchange', description: 'Currency instruments and FX derivatives' },
  { code: 'DRV', name: 'Derivatives', description: 'Options, futures, swaps, and other derivative instruments' },
  { code: 'CASH', name: 'Cash & Equivalents', description: 'Cash on hand, bank deposits, and highly liquid short-term instruments' },
];

const branchesData = [
  { code: 'MNL-HQ', name: 'Manila Head Office', address: 'Ayala Avenue, Makati City, Metro Manila', region: 'NCR' },
  { code: 'MKT', name: 'Makati Branch', address: 'Gil Puyat Avenue, Makati City, Metro Manila', region: 'NCR' },
  { code: 'CEB', name: 'Cebu Branch', address: 'Cebu Business Park, Cebu City', region: 'Visayas' },
  { code: 'DVO', name: 'Davao Branch', address: 'JP Laurel Avenue, Davao City', region: 'Mindanao' },
  { code: 'CLK', name: 'Clark Branch', address: 'Clark Freeport Zone, Pampanga', region: 'Central Luzon' },
  { code: 'BGC', name: 'Bonifacio Global City', address: '5th Avenue, BGC, Taguig City, Metro Manila', region: 'NCR' },
  { code: 'ORT', name: 'Ortigas Branch', address: 'Ortigas Center, Pasig City, Metro Manila', region: 'NCR' },
];

const exchangesData = [
  { code: 'PSE', name: 'Philippine Stock Exchange', country_code: 'PH', timezone: 'Asia/Manila' },
  { code: 'NYSE', name: 'New York Stock Exchange', country_code: 'US', timezone: 'America/New_York' },
  { code: 'NASDAQ', name: 'NASDAQ Stock Market', country_code: 'US', timezone: 'America/New_York' },
  { code: 'TSE', name: 'Tokyo Stock Exchange', country_code: 'JP', timezone: 'Asia/Tokyo' },
  { code: 'SGX', name: 'Singapore Exchange', country_code: 'SG', timezone: 'Asia/Singapore' },
  { code: 'HKEX', name: 'Hong Kong Stock Exchange', country_code: 'HK', timezone: 'Asia/Hong_Kong' },
  { code: 'LSE', name: 'London Stock Exchange', country_code: 'GB', timezone: 'Europe/London' },
  { code: 'ASX', name: 'Australian Securities Exchange', country_code: 'AU', timezone: 'Australia/Sydney' },
  { code: 'KRX', name: 'Korea Exchange', country_code: 'KR', timezone: 'Asia/Seoul' },
  { code: 'SET', name: 'Stock Exchange of Thailand', country_code: 'TH', timezone: 'Asia/Bangkok' },
];

const trustProductTypesData = [
  { code: 'IMA_DIRECTED', name: 'IMA Directed', description: 'Investment Management Account with client-directed trades' },
  { code: 'IMA_DISCRETIONARY', name: 'IMA Discretionary', description: 'Investment Management Account with discretionary management' },
  { code: 'PMT', name: 'Personal Management Trust', description: 'Personal management trust accounts' },
  { code: 'UITF', name: 'Unit Investment Trust Fund', description: 'Pooled fund vehicle regulated by BSP' },
  { code: 'PRE_NEED', name: 'Pre-Need Trust', description: 'Pre-need plan trust fund management' },
  { code: 'EMPLOYEE_BENEFIT', name: 'Employee Benefit Trust', description: 'Retirement and employee benefit trust accounts' },
  { code: 'ESCROW', name: 'Escrow', description: 'Escrow agency accounts' },
  { code: 'AGENCY', name: 'Agency', description: 'General agency accounts' },
  { code: 'SAFEKEEPING', name: 'Safekeeping', description: 'Securities safekeeping and custody services' },
];

const feeTypesData = [
  { code: 'TRUSTEE', name: 'Trustee Fee', description: 'Annual trustee fee charged on AUM', calculation_method: 'PERCENTAGE' },
  { code: 'MANAGEMENT', name: 'Management Fee', description: 'Investment management fee', calculation_method: 'PERCENTAGE' },
  { code: 'CUSTODY', name: 'Custody Fee', description: 'Securities custody and safekeeping fee', calculation_method: 'TIERED' },
  { code: 'PERFORMANCE', name: 'Performance Fee', description: 'Performance-based incentive fee', calculation_method: 'PERCENTAGE' },
  { code: 'UITF_TER', name: 'UITF Total Expense Ratio', description: 'Total expense ratio for UITF products', calculation_method: 'PERCENTAGE' },
  { code: 'ADMIN', name: 'Administrative Fee', description: 'General administrative processing fee', calculation_method: 'FIXED' },
  { code: 'TRANSACTION', name: 'Transaction Fee', description: 'Per-transaction processing fee', calculation_method: 'FIXED' },
];

// ---------------------------------------------------------------------------
// TrustFees Pro — Reference & Sample Data
// ---------------------------------------------------------------------------

const jurisdictionsData = [
  { code: 'PH', name: 'Philippines', locale: 'en-PH', residency_zone: 'PH-onshore', is_active: true },
  { code: 'SG', name: 'Singapore', locale: 'en-SG', residency_zone: 'SG-onshore', is_active: true },
  { code: 'ID', name: 'Indonesia', locale: 'id-ID', residency_zone: 'ID-onshore', is_active: false },
];

const pricingDefinitionsData = [
  {
    pricing_code: 'CUST_SLAB_3T', pricing_name: 'Custody Fee 3-Tier Cumulative', pricing_type: 'SLAB_CUMULATIVE_RATE' as const,
    currency: 'PHP', pricing_tiers: [{ from: 0, to: 10000000, rate: 1.5 }, { from: 10000000, to: 50000000, rate: 1.0 }, { from: 50000000, to: null, rate: 0.5 }],
    version: 1, library_status: 'ACTIVE' as const,
  },
  {
    pricing_code: 'DISC_TIER', pricing_name: 'Discretionary Tiered Incremental', pricing_type: 'SLAB_INCREMENTAL_RATE' as const,
    currency: 'PHP', pricing_tiers: [{ from: 1000000, to: 5000000, rate: 1.0 }, { from: 5000000, to: 20000000, rate: 0.5 }, { from: 20000000, to: 100000000, rate: 0.3 }, { from: 100000000, to: null, rate: 0.2 }],
    version: 1, library_status: 'ACTIVE' as const,
  },
  {
    pricing_code: 'ESC_STEP_3M10K', pricing_name: 'Escrow 3-Month Step (60k/10k)', pricing_type: 'STEP_FUNCTION' as const,
    currency: 'PHP', pricing_tiers: [], step_windows: [{ from_month: 1, to_month: 3, amount: 60000 }, { from_month: 4, to_month: null, amount: 10000 }],
    version: 1, library_status: 'ACTIVE' as const,
  },
  {
    pricing_code: 'FIXED_RATE_1PCT', pricing_name: 'Fixed Rate 1%', pricing_type: 'FIXED_RATE' as const,
    currency: 'PHP', pricing_tiers: [{ rate: 1.0 }],
    version: 1, library_status: 'ACTIVE' as const,
  },
  {
    pricing_code: 'EQ_BROKERAGE', pricing_name: 'Equity Brokerage Commission', pricing_type: 'SLAB_CUMULATIVE_RATE' as const,
    currency: 'PHP', pricing_tiers: [{ from: 0, to: 1000000, rate: 0.25 }, { from: 1000000, to: null, rate: 0.20 }],
    version: 1, library_status: 'ACTIVE' as const,
  },
];

const eligibilityExpressionsData = [
  {
    eligibility_code: 'ALL_DISCRETIONARY', eligibility_name: 'All Discretionary Portfolios',
    expression: { op: 'EQ', field: 'portfolio_type', value: 'IMA_DISCRETIONARY' },
    library_status: 'ACTIVE' as const,
  },
  {
    eligibility_code: 'ALL_DIRECTIONAL', eligibility_name: 'All Directional Portfolios',
    expression: { op: 'EQ', field: 'portfolio_type', value: 'IMA_DIRECTED' },
    library_status: 'ACTIVE' as const,
  },
  {
    eligibility_code: 'EQ_BOA', eligibility_name: 'Equity via Bank of America',
    expression: { op: 'AND', children: [{ op: 'EQ', field: 'asset_class', value: 'EQUITY' }, { op: 'EQ', field: 'broker_id', value: 'BOA' }] },
    library_status: 'ACTIVE' as const,
  },
  {
    eligibility_code: 'ALL_BUY_EX_IPO', eligibility_name: 'All Buy except IPO',
    expression: { op: 'AND', children: [{ op: 'EQ', field: 'event_type', value: 'BUY' }, { op: 'NOT', children: [{ op: 'EQ', field: 'txn_subtype', value: 'IPO' }] }] },
    library_status: 'ACTIVE' as const,
  },
];

const accrualSchedulesData = [
  {
    schedule_code: 'SCH_DLY_MTH', schedule_name: 'Daily Accrual, Monthly Invoice',
    accrual_enabled: true, accrual_frequency: 'DAILY' as const, accrual_method: 'ABSOLUTE' as const,
    basis_frequency: 'DAILY' as const, invoice_frequency: 'MONTHLY' as const,
    due_date_offset_days: 20, reversal_enabled: false, upfront_amortization: false,
    library_status: 'ACTIVE' as const,
  },
  {
    schedule_code: 'SCH_DLY_QTR', schedule_name: 'Daily Accrual, Quarterly Invoice',
    accrual_enabled: true, accrual_frequency: 'DAILY' as const, accrual_method: 'ABSOLUTE' as const,
    basis_frequency: 'DAILY' as const, invoice_frequency: 'QUARTERLY' as const,
    due_date_offset_days: 30, reversal_enabled: true, reversal_age_days: 90, upfront_amortization: false,
    library_status: 'ACTIVE' as const,
  },
  {
    schedule_code: 'SCH_MTH_MTH', schedule_name: 'Monthly Accrual, Monthly Invoice',
    accrual_enabled: true, accrual_frequency: 'MONTHLY' as const, accrual_method: 'AVERAGE' as const,
    basis_frequency: 'DAILY' as const, invoice_frequency: 'MONTHLY' as const,
    due_date_offset_days: 15, reversal_enabled: false, upfront_amortization: false,
    library_status: 'ACTIVE' as const,
  },
];

const feePlanTemplatesData = [
  {
    template_code: 'TPL_DISC_STD_PH', template_name: 'Discretionary Trust Fee — Standard (PH)',
    category: 'TRUST_DISC' as const, is_active: true,
    default_payload: { charge_basis: 'PERIOD', fee_type: 'TRUST', source_party: 'INVESTOR', target_party: 'BANK', comparison_basis: 'AUM', value_basis: 'AUM', rate_type: 'ANNUALIZED', aum_basis_include_uitf: false, aum_basis_include_3p_funds: false },
  },
  {
    template_code: 'TPL_ESCROW_BS_PH', template_name: 'Escrow Buy-Sell with Step (PH)',
    category: 'ESCROW' as const, is_active: true,
    default_payload: { charge_basis: 'PERIOD', fee_type: 'ESCROW', source_party: 'INVESTOR', target_party: 'BANK', comparison_basis: 'AUM', value_basis: 'PRINCIPAL', rate_type: 'FLAT' },
  },
  {
    template_code: 'TPL_RET_FUND_PH', template_name: 'Retirement Fund — Full Discretionary (PH)',
    category: 'RETIREMENT' as const, is_active: true,
    default_payload: { charge_basis: 'PERIOD', fee_type: 'TRUST', source_party: 'INVESTOR', target_party: 'BANK', comparison_basis: 'AUM', value_basis: 'AUM', rate_type: 'ANNUALIZED' },
  },
  {
    template_code: 'TPL_DIR_BOND_PH', template_name: 'Directional Trust — Bond (PH)',
    category: 'TRUST_DIR' as const, is_active: true,
    default_payload: { charge_basis: 'PERIOD', fee_type: 'TRUST', source_party: 'INVESTOR', target_party: 'BANK', comparison_basis: 'AUM', value_basis: 'FACE_VALUE', rate_type: 'ANNUALIZED' },
  },
  {
    template_code: 'TPL_EQUITY_BROKERAGE', template_name: 'Equity Brokerage Commission',
    category: 'TXN' as const, is_active: true,
    default_payload: { charge_basis: 'EVENT', fee_type: 'COMMISSION', source_party: 'INVESTOR', target_party: 'BROKER', comparison_basis: 'TXN_AMOUNT', value_basis: 'TXN_AMOUNT', rate_type: 'FLAT' },
  },
];

const tfpTaxRulesData = [
  { tax_code: 'VAT12', name: 'Value Added Tax 12%', tax_rule_type: 'VAT' as const, rate: '12.000000', applicable_fee_types: ['TRUST', 'CUSTODY', 'MANAGEMENT', 'ADMIN', 'ESCROW'], effective_date: '2026-01-01' },
  { tax_code: 'WHT2', name: 'Withholding Tax 2%', tax_rule_type: 'WHT' as const, rate: '2.000000', applicable_fee_types: ['TRUST', 'MANAGEMENT'], effective_date: '2026-01-01' },
  { tax_code: 'DST-PH', name: 'Documentary Stamp Tax', tax_rule_type: 'DST' as const, rate: '0.500000', applicable_fee_types: ['COMMISSION'], effective_date: '2026-01-01' },
];

const taxCodesData = [
  { code: 'WHT-20', name: 'WHT 20% Resident', rate: '20', type: 'WHT', applicability: 'Withholding tax on interest income for resident individuals' },
  { code: 'WHT-25', name: 'WHT 25% Non-Resident', rate: '25', type: 'WHT', applicability: 'Withholding tax on interest income for non-resident aliens engaged in business' },
  { code: 'WHT-30', name: 'WHT 30% NRANETB', rate: '30', type: 'WHT', applicability: 'Withholding tax for non-resident aliens not engaged in trade or business' },
  { code: 'WHT-10-DIV', name: 'WHT 10% Dividends', rate: '10', type: 'WHT', applicability: 'Withholding tax on cash dividends from domestic corporations' },
  { code: 'WHT-15-FI', name: 'WHT 15% Fixed Income', rate: '15', type: 'WHT', applicability: 'Withholding tax on government bond interest for individuals' },
  { code: 'FATCA-US', name: 'FATCA US Person', rate: '30', type: 'FATCA', applicability: 'FATCA withholding for US persons with non-compliant FFIs' },
  { code: 'CRS-STD', name: 'CRS Standard', rate: '0', type: 'CRS', applicability: 'Common Reporting Standard — no withholding, reporting only' },
  { code: 'WHT-EXEMPT', name: 'Tax Exempt', rate: '0', type: 'WHT', applicability: 'Tax-exempt entities (government, qualified retirement funds)' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedReferenceData() {
  console.log('Seeding reference data...\n');

  await seedTable('countries', schema.countries, countriesData);
  await seedTable('currencies', schema.currencies, currenciesData);
  await seedTable('asset_classes', schema.assetClasses, assetClassesData);
  await seedTable('branches', schema.branches, branchesData);
  await seedTable('exchanges', schema.exchanges, exchangesData);
  await seedTable('trust_product_types', schema.trustProductTypes, trustProductTypesData);
  await seedTable('fee_types', schema.feeTypes, feeTypesData);
  await seedTable('tax_codes', schema.taxCodes, taxCodesData);

  // TrustFees Pro reference data
  await seedTable('jurisdictions', schema.jurisdictions, jurisdictionsData);
  await seedTable('pricing_definitions', schema.pricingDefinitions, pricingDefinitionsData, 'pricing_code');
  await seedTable('eligibility_expressions', schema.eligibilityExpressions, eligibilityExpressionsData, 'eligibility_code');
  await seedTable('accrual_schedules', schema.accrualSchedules, accrualSchedulesData, 'schedule_code');
  await seedTable('fee_plan_templates', schema.feePlanTemplates, feePlanTemplatesData, 'template_code');
  await seedTable('tax_rules', schema.taxRules, tfpTaxRulesData, 'tax_code');

  // Seed Philippine Market Calendar 2026
  const phHolidays2026 = [
    { calendar_key: 'PH', date: '2026-01-01', is_business_day: false, is_settlement_day: false, holiday_name: "New Year's Day", source: 'BSP' },
    { calendar_key: 'PH', date: '2026-01-02', is_business_day: false, is_settlement_day: false, holiday_name: "Special Non-Working Day", source: 'BSP' },
    { calendar_key: 'PH', date: '2026-02-25', is_business_day: false, is_settlement_day: false, holiday_name: 'EDSA People Power Revolution Anniversary', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-04-01', is_business_day: false, is_settlement_day: false, holiday_name: 'Eid al-Fitr', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-04-02', is_business_day: false, is_settlement_day: false, holiday_name: 'Maundy Thursday', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-04-03', is_business_day: false, is_settlement_day: false, holiday_name: 'Good Friday', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-04-04', is_business_day: false, is_settlement_day: false, holiday_name: 'Black Saturday', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-04-09', is_business_day: false, is_settlement_day: false, holiday_name: 'Araw ng Kagitingan', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-05-01', is_business_day: false, is_settlement_day: false, holiday_name: 'Labor Day', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-06-08', is_business_day: false, is_settlement_day: false, holiday_name: 'Eid al-Adha', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-06-12', is_business_day: false, is_settlement_day: false, holiday_name: 'Independence Day', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-08-21', is_business_day: false, is_settlement_day: false, holiday_name: 'Ninoy Aquino Day', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-08-31', is_business_day: false, is_settlement_day: false, holiday_name: 'National Heroes Day', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-11-01', is_business_day: false, is_settlement_day: false, holiday_name: "All Saints' Day", source: 'BSP' },
    { calendar_key: 'PH', date: '2026-11-02', is_business_day: false, is_settlement_day: false, holiday_name: "All Souls' Day", source: 'BSP' },
    { calendar_key: 'PH', date: '2026-11-30', is_business_day: false, is_settlement_day: false, holiday_name: 'Bonifacio Day', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-12-08', is_business_day: false, is_settlement_day: false, holiday_name: 'Feast of the Immaculate Conception', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-12-24', is_business_day: false, is_settlement_day: false, holiday_name: 'Christmas Eve', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-12-25', is_business_day: false, is_settlement_day: false, holiday_name: 'Christmas Day', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-12-30', is_business_day: false, is_settlement_day: false, holiday_name: 'Rizal Day', source: 'BSP' },
    { calendar_key: 'PH', date: '2026-12-31', is_business_day: false, is_settlement_day: false, holiday_name: "New Year's Eve", source: 'BSP' },
  ];

  console.log('Seeding PH Market Calendar 2026...');
  for (const h of phHolidays2026) {
    await db.insert(schema.marketCalendar).values({
      ...h,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    }).onConflictDoNothing();
  }
  console.log(`  Seeded ${phHolidays2026.length} PH holidays for 2026`);

  // Seed Legal Entities
  const legalEntities = [
    { entity_code: 'TRUST', entity_name: 'Trust Business', regulator: 'BSP', license_ref: 'TL-001', base_currency: 'PHP', data_segregation_scope: 'HARD' as const },
    { entity_code: 'IMA', entity_name: 'Investment Management Account', regulator: 'SEC', license_ref: 'IMA-055', base_currency: 'PHP', data_segregation_scope: 'HARD' as const },
    { entity_code: 'CUST', entity_name: 'Custodial Service', regulator: 'BSP', license_ref: 'CL-010', base_currency: 'PHP', data_segregation_scope: 'SOFT' as const },
  ];

  console.log('Seeding Legal Entities...');
  for (const le of legalEntities) {
    await db.insert(schema.legalEntities).values({
      ...le,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    }).onConflictDoNothing();
  }
  console.log(`  Seeded ${legalEntities.length} legal entities`);

  // ---------------------------------------------------------------------------
  // TRUST-CA 360 — Corporate Actions Sample Data
  // ---------------------------------------------------------------------------

  const corporateActionsData = [
    {
      security_id: 1,
      type: 'DIVIDEND_CASH' as const,
      ex_date: '2026-05-15',
      record_date: '2026-05-14',
      payment_date: '2026-06-01',
      amount_per_share: '2.50',
      ca_status: 'ANNOUNCED',
      source: 'Bloomberg',
    },
    {
      security_id: 2,
      type: 'SPLIT' as const,
      ex_date: '2026-06-01',
      record_date: '2026-05-29',
      ratio: '2',
      ca_status: 'SCRUBBED',
      source: 'Reuters',
    },
    {
      security_id: 3,
      type: 'RIGHTS' as const,
      ex_date: '2026-07-01',
      record_date: '2026-06-30',
      ratio: '0.1',
      ca_status: 'GOLDEN_COPY',
      source: 'PDTC',
    },
    {
      security_id: 4,
      type: 'COUPON' as const,
      ex_date: '2026-04-01',
      record_date: '2026-03-31',
      payment_date: '2026-04-15',
      amount_per_share: '5.00',
      ca_status: 'ENTITLED',
      source: 'Bloomberg',
    },
    {
      security_id: 5,
      type: 'DIVIDEND_CASH' as const,
      ex_date: '2026-03-10',
      record_date: '2026-03-09',
      payment_date: '2026-03-25',
      amount_per_share: '3.75',
      ca_status: 'ELECTED',
      source: 'Bloomberg',
    },
    {
      security_id: 1,
      type: 'DIVIDEND_CASH' as const,
      ex_date: '2026-01-15',
      record_date: '2026-01-14',
      payment_date: '2026-02-01',
      amount_per_share: '2.00',
      ca_status: 'SETTLED',
      source: 'Bloomberg',
    },
    {
      security_id: 3,
      type: 'MERGER' as const,
      ex_date: '2026-09-01',
      record_date: '2026-08-28',
      ca_status: 'ANNOUNCED',
      source: 'Reuters',
    },
  ];

  console.log('Seeding Corporate Actions...');
  for (const ca of corporateActionsData) {
    await db.insert(schema.corporateActions).values({
      ...ca,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    } as any).onConflictDoNothing();
  }
  console.log(`  Seeded ${corporateActionsData.length} corporate actions`);

  // Seed entitlements for ENTITLED / ELECTED / SETTLED CAs (IDs 4, 5, 6)
  const entitlementsData = [
    {
      corporate_action_id: 4,
      portfolio_id: 'PORT-001',
      entitled_qty: '10000',
      elected_option: null,
      tax_treatment: null,
      posted: false,
    },
    {
      corporate_action_id: 4,
      portfolio_id: 'PORT-002',
      entitled_qty: '5000',
      elected_option: null,
      tax_treatment: null,
      posted: false,
    },
    {
      corporate_action_id: 5,
      portfolio_id: 'PORT-001',
      entitled_qty: '7500',
      elected_option: 'CASH',
      tax_treatment: 'WHT_25PCT_STATUTORY',
      posted: false,
    },
    {
      corporate_action_id: 6,
      portfolio_id: 'PORT-001',
      entitled_qty: '20000',
      elected_option: 'CASH',
      tax_treatment: 'WHT_15PCT_TREATY',
      posted: true,
    },
    {
      corporate_action_id: 6,
      portfolio_id: 'PORT-003',
      entitled_qty: '8000',
      elected_option: 'CASH',
      tax_treatment: 'WHT_25PCT_STATUTORY',
      posted: true,
    },
  ];

  console.log('Seeding CA Entitlements...');
  for (const ent of entitlementsData) {
    await db.insert(schema.corporateActionEntitlements).values({
      ...ent,
      created_at: new Date(),
      updated_at: new Date(),
    } as any).onConflictDoNothing();
  }
  console.log(`  Seeded ${entitlementsData.length} CA entitlements`);

  // ---------------------------------------------------------------------------
  // TRUST-CA 360 — TTRA Applications Sample Data
  // ---------------------------------------------------------------------------

  const ttraApplicationsData = [
    {
      ttra_id: 'TTRA-SEED-001',
      client_id: '1',
      treaty_country: 'US',
      cor_document_ref: 'COR-2025-001',
      ttra_status: 'APPROVED' as const,
      effective_from: '2025-01-01',
      effective_to: '2027-12-31',
      next_review_due: '2027-11-01',
      bir_ctrr_ruling_no: 'CTRR-2025-00456',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      ttra_id: 'TTRA-SEED-002',
      client_id: '2',
      treaty_country: 'JP',
      cor_document_ref: 'COR-2024-002',
      ttra_status: 'APPROVED' as const,
      effective_from: '2024-01-01',
      effective_to: '2026-06-30',
      next_review_due: '2026-05-01',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      ttra_id: 'TTRA-SEED-003',
      client_id: '3',
      treaty_country: 'SG',
      cor_document_ref: 'COR-2026-003',
      ttra_status: 'APPLIED' as const,
      effective_from: '2026-04-01',
      effective_to: '2028-03-31',
      next_review_due: '2028-01-30',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      ttra_id: 'TTRA-SEED-004',
      client_id: '4',
      treaty_country: 'DE',
      cor_document_ref: 'COR-2026-004',
      ttra_status: 'UNDER_REVIEW' as const,
      effective_from: '2026-03-15',
      effective_to: '2028-03-14',
      next_review_due: '2028-01-13',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      ttra_id: 'TTRA-SEED-005',
      client_id: '5',
      treaty_country: 'UK',
      cor_document_ref: 'COR-2023-005',
      ttra_status: 'EXPIRED' as const,
      effective_from: '2023-01-01',
      effective_to: '2025-12-31',
      next_review_due: '2025-11-01',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      ttra_id: 'TTRA-SEED-006',
      client_id: '5',
      treaty_country: 'UK',
      cor_document_ref: 'COR-2026-006',
      ttra_status: 'RENEWAL_PENDING' as const,
      effective_from: '2026-01-01',
      effective_to: '2028-12-31',
      next_review_due: '2028-11-01',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  console.log('Seeding TTRA Applications...');
  for (const ttra of ttraApplicationsData) {
    await db.insert(schema.ttraApplications).values(ttra as any).onConflictDoNothing();
  }
  console.log(`  Seeded ${ttraApplicationsData.length} TTRA applications`);

  // ---------------------------------------------------------------------------
  // TRUST-CA 360 — Claims Sample Data
  // ---------------------------------------------------------------------------

  const claimsData = [
    {
      claim_id: 'CLM-SEED-001',
      claim_reference: 'CLM-2026-000001',
      account_id: 'ACC-001',
      origination: 'INTERNALLY_DETECTED' as const,
      root_cause_code: 'DEADLINE_MISSED' as const,
      claim_amount: '150000',
      currency: 'PHP',
      approval_tier: 'MANAGER' as const,
      claim_status: 'INVESTIGATING' as const,
      regulatory_disclosure_required: false,
      supporting_docs: [],
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      claim_id: 'CLM-SEED-002',
      claim_reference: 'CLM-2026-000002',
      account_id: 'ACC-002',
      origination: 'CLIENT_RAISED' as const,
      root_cause_code: 'TAX_ERROR' as const,
      claim_amount: '50000',
      currency: 'PHP',
      approval_tier: 'AUTO' as const,
      claim_status: 'APPROVED' as const,
      regulatory_disclosure_required: false,
      supporting_docs: ['tax-cert-001.pdf'],
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      claim_id: 'CLM-SEED-003',
      claim_reference: 'CLM-2026-000003',
      account_id: 'ACC-003',
      origination: 'INTERNALLY_DETECTED' as const,
      root_cause_code: 'DATA_QUALITY' as const,
      claim_amount: '25000',
      currency: 'PHP',
      approval_tier: 'AUTO' as const,
      claim_status: 'PAID' as const,
      regulatory_disclosure_required: false,
      supporting_docs: ['reconciliation-report.pdf'],
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      claim_id: 'CLM-SEED-004',
      claim_reference: 'CLM-2026-000004',
      account_id: 'ACC-001',
      origination: 'CLIENT_RAISED' as const,
      root_cause_code: null,
      claim_amount: '75000',
      currency: 'PHP',
      approval_tier: 'MANAGER' as const,
      claim_status: 'DRAFT' as const,
      regulatory_disclosure_required: false,
      supporting_docs: [],
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      claim_id: 'CLM-SEED-005',
      claim_reference: 'CLM-2026-000005',
      account_id: 'ACC-004',
      origination: 'REGULATOR_RAISED' as const,
      root_cause_code: 'SYSTEM_OUTAGE' as const,
      claim_amount: '3000000',
      currency: 'PHP',
      approval_tier: 'HEAD' as const,
      claim_status: 'PENDING_APPROVAL' as const,
      regulatory_disclosure_required: true,
      supporting_docs: ['regulator-notice.pdf', 'system-logs.pdf'],
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  console.log('Seeding Claims...');
  for (const claim of claimsData) {
    await db.insert(schema.claims).values(claim as any).onConflictDoNothing();
  }
  console.log(`  Seeded ${claimsData.length} claims`);

  // ---------------------------------------------------------------------------
  // TRUST-CA 360 — Consent Records Sample Data
  // ---------------------------------------------------------------------------

  const consentRecordsData = [
    {
      consent_id: 'CON-SEED-001',
      client_id: '1',
      purpose: 'OPERATIONAL' as const,
      channel_scope: ['EMAIL', 'IN_APP'],
      granted: true,
      granted_at: new Date('2025-06-01'),
      legal_basis: 'CONTRACT' as const,
      dpa_ref: 'DPA-2025-001',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      consent_id: 'CON-SEED-002',
      client_id: '2',
      purpose: 'MARKETING' as const,
      channel_scope: ['EMAIL', 'SMS'],
      granted: true,
      granted_at: new Date('2025-07-01'),
      legal_basis: 'CONSENT' as const,
      dpa_ref: 'DPA-2025-002',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      consent_id: 'CON-SEED-003',
      client_id: '3',
      purpose: 'AUTOMATED_DECISION' as const,
      channel_scope: ['IN_APP'],
      granted: false,
      granted_at: new Date('2025-03-01'),
      withdrawn_at: new Date('2025-09-15'),
      legal_basis: 'CONSENT' as const,
      dpa_ref: 'DPA-2025-003',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  console.log('Seeding Consent Records...');
  for (const consent of consentRecordsData) {
    await db.insert(schema.consentRecords).values(consent as any).onConflictDoNothing();
  }
  console.log(`  Seeded ${consentRecordsData.length} consent records`);

  // ---------------------------------------------------------------------------
  // TRUST-CA 360 — Feed Routing Configs Sample Data
  // ---------------------------------------------------------------------------

  const feedRoutingData = [
    {
      routing_id: 'FR-SEED-001',
      security_segment: 'PH_BLUE_CHIP' as const,
      primary_source: 'Bloomberg',
      secondary_source: 'Reuters',
      cost_tier: 'BASELINE' as const,
      active_flag: true,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      routing_id: 'FR-SEED-002',
      security_segment: 'FOREIGN_G10' as const,
      primary_source: 'Reuters',
      secondary_source: 'Bloomberg',
      cost_tier: 'PREMIUM' as const,
      active_flag: true,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      routing_id: 'FR-SEED-003',
      security_segment: 'FIXED_INCOME' as const,
      primary_source: 'Bloomberg',
      secondary_source: 'PDTC',
      cost_tier: 'BASELINE' as const,
      active_flag: true,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  console.log('Seeding Feed Routing Configs...');
  for (const fr of feedRoutingData) {
    await db.insert(schema.feedRouting).values(fr as any).onConflictDoNothing();
  }
  console.log(`  Seeded ${feedRoutingData.length} feed routing configs`);

  // -------------------------------------------------------------------------
  // TrustFees Pro — Operational / Demo Data (Phase 11)
  // -------------------------------------------------------------------------
  await seedTrustFeesProData();

  console.log('\nReference data seeding complete.');
}

export { seedReferenceData };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedReferenceData()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
