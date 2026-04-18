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

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

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

  console.log('\nReference data seeding complete.');
}

seedReferenceData()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
