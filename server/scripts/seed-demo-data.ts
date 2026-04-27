/**
 * seed-demo-data.ts — Philippines Trust Banking Demo Data
 *
 * Seeds realistic transactional data across all major modules so every
 * dashboard, workbench, and report renders with meaningful content.
 *
 * Coverage:
 *   1. Users (trust officers, RMs, compliance, traders, branch heads)
 *   2. Clients (HNWIs, corporates, foundations) + KYC + profiles
 *   3. Securities (PSE blue chips, government bonds, corporate bonds, UITFs)
 *   4. Counterparties & brokers
 *   5. Portfolios (IMA, PMT, UITF, Escrow, Employee Benefit)
 *   6. Positions + cash ledger (current holdings)
 *   7. Pricing records (60-day price history)
 *   8. NAV computations (for UITF)
 *   9. Orders + trades + settlements (recent activity)
 *  10. Contributions & withdrawals
 *  11. Corporate actions (dividends, splits)
 *  12. Fee plans assigned to portfolios
 *  13. TFP accruals & invoices
 *  14. Compliance rules & one open breach
 *  15. Risk profiles (questionnaires answered)
 *  16. CRM: meetings, call reports, opportunities
 *  17. Service requests
 *  18. Client messages
 *  19. Audit events
 *  20. TTRA application
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx server/scripts/seed-demo-data.ts
 *
 * Safe to run repeatedly — skips existing rows by primary key / unique field.
 */

import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// ─── helpers ────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const PASSWORD_HASH = bcrypt.hashSync('password123', BCRYPT_ROUNDS);
const TODAY = new Date().toISOString().split('T')[0];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().split('T')[0];
}

async function upsertUser(data: Record<string, unknown>) {
  const existing = await db.select().from(schema.users)
    .where(eq(schema.users.username, data.username as string)).limit(1);
  if (existing.length) return existing[0].id;
  const [r] = await db.insert(schema.users).values(data as any).returning({ id: schema.users.id });
  return r.id;
}

async function upsertClient(data: Record<string, unknown>) {
  const existing = await db.select().from(schema.clients)
    .where(eq(schema.clients.client_id, data.client_id as string)).limit(1);
  if (existing.length) return;
  await db.insert(schema.clients).values(data as any);
}

async function upsertPortfolio(data: Record<string, unknown>) {
  const existing = await db.select().from(schema.portfolios)
    .where(eq(schema.portfolios.portfolio_id, data.portfolio_id as string)).limit(1);
  if (existing.length) return;
  await db.insert(schema.portfolios).values(data as any);
}

async function upsertSecurity(isin: string, data: Record<string, unknown>) {
  const existing = await db.select().from(schema.securities)
    .where(eq(schema.securities.isin, isin)).limit(1);
  if (existing.length) return existing[0].id;
  const [r] = await db.insert(schema.securities).values(data as any).returning({ id: schema.securities.id });
  return r.id;
}

// ─── 1. USERS ────────────────────────────────────────────────────────────────

async function seedUsers() {
  console.log('\n[1] Seeding users...');

  const users = [
    // Trust Officers (licensed, BSP-regulated)
    { username: 'trust_officer_1', password_hash: PASSWORD_HASH, full_name: 'Maria Santos-Reyes', email: 'msantos@trustoms.local', role: 'bo_maker', department: 'Trust Operations', office: 'Manila HQ' },
    { username: 'trust_officer_2', password_hash: PASSWORD_HASH, full_name: 'Jose dela Cruz', email: 'jdelacruz@trustoms.local', role: 'bo_maker', department: 'Trust Operations', office: 'BGC Branch' },
    { username: 'trust_officer_3', password_hash: PASSWORD_HASH, full_name: 'Ana Mendoza', email: 'amendoza@trustoms.local', role: 'bo_maker', department: 'Trust Operations', office: 'Makati Branch' },
    // Back-Office Checkers
    { username: 'checker_1', password_hash: PASSWORD_HASH, full_name: 'Roberto Lim', email: 'rlim@trustoms.local', role: 'bo_checker', department: 'Trust Operations', office: 'Manila HQ' },
    { username: 'checker_2', password_hash: PASSWORD_HASH, full_name: 'Carmen Villanueva', email: 'cvillanueva@trustoms.local', role: 'bo_checker', department: 'Trust Operations', office: 'Cebu Branch' },
    // Relationship Managers
    { username: 'rm_1', password_hash: PASSWORD_HASH, full_name: 'Patrick Tan', email: 'ptan@trustoms.local', role: 'bo_maker', department: 'Private Banking', office: 'Manila HQ' },
    { username: 'rm_2', password_hash: PASSWORD_HASH, full_name: 'Sophia Garcia', email: 'sgarcia@trustoms.local', role: 'bo_maker', department: 'Private Banking', office: 'BGC Branch' },
    { username: 'rm_3', password_hash: PASSWORD_HASH, full_name: 'Marco Ramos', email: 'mramos@trustoms.local', role: 'bo_maker', department: 'Private Banking', office: 'Cebu Branch' },
    // Compliance Officer
    { username: 'compliance_officer', password_hash: PASSWORD_HASH, full_name: 'Atty. Diana Flores', email: 'dflores@trustoms.local', role: 'bo_checker', department: 'Compliance', office: 'Manila HQ' },
    // Portfolio Manager / Trader
    { username: 'portfolio_mgr', password_hash: PASSWORD_HASH, full_name: 'Kevin Uy', email: 'kuy@trustoms.local', role: 'bo_maker', department: 'Investment Management', office: 'Manila HQ' },
    // Branch Head
    { username: 'branch_head', password_hash: PASSWORD_HASH, full_name: 'Theresa Aquino', email: 'taquino@trustoms.local', role: 'bo_head', department: 'Trust Operations', office: 'Manila HQ' },
  ];

  const ids: Record<string, number> = {};
  for (const u of users) {
    ids[u.username] = await upsertUser(u);
  }
  // keep admin/bo_head/bo_maker/bo_checker from bootstrap — just add IDs
  const admin = await db.select().from(schema.users).where(eq(schema.users.username, 'admin')).limit(1);
  ids['admin'] = admin[0]?.id ?? 1;
  const boHead = await db.select().from(schema.users).where(eq(schema.users.username, 'bo_head')).limit(1);
  ids['bo_head'] = boHead[0]?.id ?? 2;

  console.log(`  → ${Object.keys(ids).length} users ready`);
  return ids;
}

// ─── 2. CLIENTS ──────────────────────────────────────────────────────────────

async function seedClients(userIds: Record<string, number>) {
  console.log('\n[2] Seeding clients...');

  const clients = [
    // High Net Worth Individuals
    {
      client_id: 'CLT-001',
      legal_name: 'Eduardo Soriano Tan',
      type: 'INDIVIDUAL',
      tin: '123-456-789-000',
      birth_date: '1965-03-15',
      address: { street: '88 Ayala Avenue', city: 'Makati City', province: 'Metro Manila', zip: '1226', country: 'PH' },
      contact: { mobile: '+63 917 123 4567', email: 'etanpersonal@gmail.com' },
      risk_profile: 'GROWTH',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_1'],
    },
    {
      client_id: 'CLT-002',
      legal_name: 'Maria Cristina Reyes-Lopez',
      type: 'INDIVIDUAL',
      tin: '234-567-890-000',
      birth_date: '1972-07-22',
      address: { street: '12 Bonifacio High Street', city: 'Taguig', province: 'Metro Manila', zip: '1634', country: 'PH' },
      contact: { mobile: '+63 918 234 5678', email: 'mcreyes@outlook.com' },
      risk_profile: 'BALANCED',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_1'],
    },
    {
      client_id: 'CLT-003',
      legal_name: 'Antonio Jose Domingo III',
      type: 'INDIVIDUAL',
      tin: '345-678-901-000',
      birth_date: '1958-11-04',
      address: { street: '1 Forbes Park', city: 'Makati City', province: 'Metro Manila', zip: '1220', country: 'PH' },
      contact: { mobile: '+63 919 345 6789', email: 'ajdomingo@yahoo.com' },
      risk_profile: 'CONSERVATIVE',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_2'],
    },
    {
      client_id: 'CLT-004',
      legal_name: 'Luz Maglalang-Santos',
      type: 'INDIVIDUAL',
      tin: '456-789-012-000',
      birth_date: '1980-02-28',
      address: { street: '55 Camp John Hay', city: 'Baguio City', province: 'Benguet', zip: '2600', country: 'PH' },
      contact: { mobile: '+63 920 456 7890', email: 'lsantos@gmail.com' },
      risk_profile: 'MODERATE',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_2'],
    },
    {
      client_id: 'CLT-005',
      legal_name: 'Carlos Miguel Bautista',
      type: 'INDIVIDUAL',
      tin: '567-890-123-000',
      birth_date: '1990-06-10',
      address: { street: '32 Salinas Drive', city: 'Lahug, Cebu City', province: 'Cebu', zip: '6000', country: 'PH' },
      contact: { mobile: '+63 921 567 8901', email: 'cmbautista@icloud.com' },
      risk_profile: 'AGGRESSIVE',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_3'],
    },
    // Corporate Clients
    {
      client_id: 'CLT-006',
      legal_name: 'Pagkakaisa Holdings Corporation',
      type: 'CORPORATE',
      tin: '678-901-234-000',
      birth_date: null,
      address: { street: '100 Valero Street', city: 'Salcedo Village, Makati', province: 'Metro Manila', zip: '1227', country: 'PH' },
      contact: { phone: '+63 2 8123 4567', email: 'trust@pagkakaisa.com.ph' },
      risk_profile: 'BALANCED',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_1'],
    },
    {
      client_id: 'CLT-007',
      legal_name: 'Visayas Agri-Industrial Inc.',
      type: 'CORPORATE',
      tin: '789-012-345-000',
      birth_date: null,
      address: { street: '5 M.J. Cuenco Avenue', city: 'Cebu City', province: 'Cebu', zip: '6000', country: 'PH' },
      contact: { phone: '+63 32 234 5678', email: 'finance@visayasagri.ph' },
      risk_profile: 'MODERATE',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_3'],
    },
    // Foundation / Non-profit
    {
      client_id: 'CLT-008',
      legal_name: 'Pag-asa Foundation Inc.',
      type: 'FOUNDATION',
      tin: '890-123-456-000',
      birth_date: null,
      address: { street: '88 EDSA', city: 'Mandaluyong', province: 'Metro Manila', zip: '1550', country: 'PH' },
      contact: { phone: '+63 2 8765 4321', email: 'treasurer@pagasafoundation.org' },
      risk_profile: 'CONSERVATIVE',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_1'],
    },
    // Government / Pension
    {
      client_id: 'CLT-009',
      legal_name: 'Mindanao Development Authority',
      type: 'GOVERNMENT',
      tin: '901-234-567-000',
      birth_date: null,
      address: { street: 'Cagayan de Oro City Hall', city: 'Cagayan de Oro', province: 'Misamis Oriental', zip: '9000', country: 'PH' },
      contact: { phone: '+63 88 456 7890', email: 'trust@mda.gov.ph' },
      risk_profile: 'CONSERVATIVE',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_2'],
    },
    // Pre-need client
    {
      client_id: 'CLT-010',
      legal_name: 'Graceful Life Memorial Plans Corp.',
      type: 'CORPORATE',
      tin: '012-345-678-000',
      birth_date: null,
      address: { street: '200 Quezon Avenue', city: 'Quezon City', province: 'Metro Manila', zip: '1100', country: 'PH' },
      contact: { phone: '+63 2 8888 0001', email: 'trust@gracefullife.ph' },
      risk_profile: 'CONSERVATIVE',
      client_status: 'ACTIVE',
      assigned_rm_id: userIds['rm_1'],
    },
  ];

  for (const c of clients) {
    await upsertClient(c);
  }

  // Client profiles
  const profiles = [
    { client_id: 'CLT-001', risk_tolerance: 'GROWTH', investment_horizon: '10+ years', knowledge_level: 'SOPHISTICATED', source_of_wealth: 'Business income and real estate', income: '15000000', net_worth: '450000000' },
    { client_id: 'CLT-002', risk_tolerance: 'BALANCED', investment_horizon: '7 years', knowledge_level: 'INTERMEDIATE', source_of_wealth: 'Professional income and inheritance', income: '8000000', net_worth: '120000000' },
    { client_id: 'CLT-003', risk_tolerance: 'CONSERVATIVE', investment_horizon: '3 years', knowledge_level: 'BASIC', source_of_wealth: 'Retirement and rental income', income: '5000000', net_worth: '280000000' },
    { client_id: 'CLT-004', risk_tolerance: 'MODERATE', investment_horizon: '5 years', knowledge_level: 'INTERMEDIATE', source_of_wealth: 'Salary and investments', income: '3500000', net_worth: '45000000' },
    { client_id: 'CLT-005', risk_tolerance: 'AGGRESSIVE', investment_horizon: '15+ years', knowledge_level: 'SOPHISTICATED', source_of_wealth: 'Technology business', income: '12000000', net_worth: '85000000' },
    { client_id: 'CLT-006', risk_tolerance: 'BALANCED', investment_horizon: '5 years', knowledge_level: 'SOPHISTICATED', source_of_wealth: 'Business operations', income: '80000000', net_worth: '600000000' },
    { client_id: 'CLT-007', risk_tolerance: 'MODERATE', investment_horizon: '7 years', knowledge_level: 'INTERMEDIATE', source_of_wealth: 'Agricultural and industrial operations', income: '45000000', net_worth: '350000000' },
    { client_id: 'CLT-008', risk_tolerance: 'CONSERVATIVE', investment_horizon: 'Perpetual', knowledge_level: 'INTERMEDIATE', source_of_wealth: 'Donations and endowment', income: '25000000', net_worth: '180000000' },
    { client_id: 'CLT-009', risk_tolerance: 'CONSERVATIVE', investment_horizon: 'Perpetual', knowledge_level: 'BASIC', source_of_wealth: 'Government appropriations', income: '0', net_worth: '500000000' },
    { client_id: 'CLT-010', risk_tolerance: 'CONSERVATIVE', investment_horizon: 'Long-term', knowledge_level: 'INTERMEDIATE', source_of_wealth: 'Pre-need plan collections', income: '120000000', net_worth: '980000000' },
  ];

  for (const p of profiles) {
    const exists = await db.select().from(schema.clientProfiles)
      .where(eq(schema.clientProfiles.client_id, p.client_id)).limit(1);
    if (!exists.length) await db.insert(schema.clientProfiles).values(p as any);
  }

  // KYC cases
  const kyc = [
    { client_id: 'CLT-001', kyc_status: 'VERIFIED', risk_rating: 'LOW', id_type: 'PASSPORT', id_number: 'P1234567A', expiry_date: '2028-03-15', refresh_cadence_years: 3, next_review_date: daysAgo(-365) },
    { client_id: 'CLT-002', kyc_status: 'VERIFIED', risk_rating: 'LOW', id_type: 'DRIVERS_LICENSE', id_number: 'N07-12-345678', expiry_date: '2027-07-22', refresh_cadence_years: 3, next_review_date: daysAgo(-365) },
    { client_id: 'CLT-003', kyc_status: 'VERIFIED', risk_rating: 'MEDIUM', id_type: 'PASSPORT', id_number: 'P9876543B', expiry_date: '2026-11-04', refresh_cadence_years: 2, next_review_date: daysAgo(-30) },
    { client_id: 'CLT-004', kyc_status: 'VERIFIED', risk_rating: 'LOW', id_type: 'SSS_ID', id_number: '12-3456789-0', expiry_date: null, refresh_cadence_years: 3, next_review_date: daysAgo(-180) },
    { client_id: 'CLT-005', kyc_status: 'VERIFIED', risk_rating: 'MEDIUM', id_type: 'PASSPORT', id_number: 'P5566778C', expiry_date: '2030-06-10', refresh_cadence_years: 3, next_review_date: daysAgo(-500) },
    { client_id: 'CLT-006', kyc_status: 'VERIFIED', risk_rating: 'LOW', id_type: 'SEC_REGISTRATION', id_number: 'CS201234567', expiry_date: null, refresh_cadence_years: 2, next_review_date: daysAgo(-200) },
    { client_id: 'CLT-007', kyc_status: 'VERIFIED', risk_rating: 'LOW', id_type: 'SEC_REGISTRATION', id_number: 'CS200876543', expiry_date: null, refresh_cadence_years: 2, next_review_date: daysAgo(-90) },
    { client_id: 'CLT-008', kyc_status: 'VERIFIED', risk_rating: 'LOW', id_type: 'SEC_REGISTRATION', id_number: 'CN200412345', expiry_date: null, refresh_cadence_years: 3, next_review_date: daysAgo(-120) },
    { client_id: 'CLT-009', kyc_status: 'VERIFIED', risk_rating: 'LOW', id_type: 'GOVERNMENT_MANDATE', id_number: 'MDA-2018-001', expiry_date: null, refresh_cadence_years: 5, next_review_date: daysAgo(-400) },
    { client_id: 'CLT-010', kyc_status: 'VERIFIED', risk_rating: 'MEDIUM', id_type: 'IC_LICENSE', id_number: 'IC-PN-2019-001', expiry_date: '2027-12-31', refresh_cadence_years: 2, next_review_date: daysAgo(-60) },
  ];
  for (const k of kyc) {
    const exists = await db.select().from(schema.kycCases)
      .where(eq(schema.kycCases.client_id, k.client_id)).limit(1);
    if (!exists.length) await db.insert(schema.kycCases).values(k as any);
  }

  console.log('  → 10 clients + profiles + KYC ready');
}

// ─── 3. SECURITIES ────────────────────────────────────────────────────────────

async function seedSecurities() {
  console.log('\n[3] Seeding securities...');
  const securities = [
    // PSE Blue Chips
    { isin: 'PHY211571907', bloomberg_ticker: 'BDO PM', local_code: 'BDO', name: 'BDO Unibank Inc.', asset_class: 'EQ', sector: 'FINANCIALS', exchange: 'PSE', currency: 'PHP', risk_product_category: 'GROWTH', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    { isin: 'PHY087751016', bloomberg_ticker: 'BPI PM', local_code: 'BPI', name: 'Bank of the Philippine Islands', asset_class: 'EQ', sector: 'FINANCIALS', exchange: 'PSE', currency: 'PHP', risk_product_category: 'GROWTH', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    { isin: 'PHY813681018', bloomberg_ticker: 'SM PM', local_code: 'SM', name: 'SM Investments Corporation', asset_class: 'EQ', sector: 'CONSUMER_DISC', exchange: 'PSE', currency: 'PHP', risk_product_category: 'GROWTH', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    { isin: 'PHY022761016', bloomberg_ticker: 'AC PM', local_code: 'AC', name: 'Ayala Corporation', asset_class: 'EQ', sector: 'INDUSTRIALS', exchange: 'PSE', currency: 'PHP', risk_product_category: 'GROWTH', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    { isin: 'PHY49480X1028', bloomberg_ticker: 'JGS PM', local_code: 'JGS', name: 'JG Summit Holdings Inc.', asset_class: 'EQ', sector: 'INDUSTRIALS', exchange: 'PSE', currency: 'PHP', risk_product_category: 'BALANCED', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    { isin: 'PHY7375P1002', bloomberg_ticker: 'TEL PM', local_code: 'TEL', name: 'PLDT Inc.', asset_class: 'EQ', sector: 'COMMUNICATION', exchange: 'PSE', currency: 'PHP', risk_product_category: 'BALANCED', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    { isin: 'PHY614822019', bloomberg_ticker: 'MER PM', local_code: 'MER', name: 'Manila Electric Company', asset_class: 'EQ', sector: 'UTILITIES', exchange: 'PSE', currency: 'PHP', risk_product_category: 'MODERATE', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    { isin: 'PHY613761016', bloomberg_ticker: 'MEG PM', local_code: 'MEG', name: 'Megaworld Corporation', asset_class: 'EQ', sector: 'REAL_ESTATE', exchange: 'PSE', currency: 'PHP', risk_product_category: 'BALANCED', pricing_source_hierarchy: ['BLOOMBERG', 'PSE'] },
    // Philippine Government Securities
    { isin: 'PHGOV10Y2026', bloomberg_ticker: 'RPGB 6 1/4 01/14/36', local_code: 'RPGB-2036', name: 'Republic of Philippines T-Bond 6.25% 2036', asset_class: 'FI', sector: 'GOVERNMENT', exchange: 'PDEx', currency: 'PHP', coupon_rate: '6.25', maturity_date: '2036-01-14', yield_rate: '6.45', coupon_frequency: 2, risk_product_category: 'CONSERVATIVE', pricing_source_hierarchy: ['BLOOMBERG', 'PDEX'] },
    { isin: 'PHGOV05Y2028', bloomberg_ticker: 'RPGB 5 7/8 01/14/28', local_code: 'RPGB-2028', name: 'Republic of Philippines T-Bond 5.875% 2028', asset_class: 'FI', sector: 'GOVERNMENT', exchange: 'PDEx', currency: 'PHP', coupon_rate: '5.875', maturity_date: '2028-01-14', yield_rate: '6.10', coupon_frequency: 2, risk_product_category: 'CONSERVATIVE', pricing_source_hierarchy: ['BLOOMBERG', 'PDEX'] },
    { isin: 'PHGOV10Y2031', bloomberg_ticker: 'RPGB 6 1/2 01/14/31', local_code: 'RPGB-2031', name: 'Republic of Philippines T-Bond 6.50% 2031', asset_class: 'FI', sector: 'GOVERNMENT', exchange: 'PDEx', currency: 'PHP', coupon_rate: '6.50', maturity_date: '2031-01-14', yield_rate: '6.60', coupon_frequency: 2, risk_product_category: 'CONSERVATIVE', pricing_source_hierarchy: ['BLOOMBERG', 'PDEX'] },
    // Philippine Dollar Bond
    { isin: 'XS2345678901', bloomberg_ticker: 'PHILIP 4 1/2 01/21/35', local_code: 'ROP-2035', name: 'Republic of Philippines 4.50% 2035 (USD)', asset_class: 'FI', sector: 'GOVERNMENT', exchange: 'SGX', currency: 'USD', coupon_rate: '4.50', maturity_date: '2035-01-21', yield_rate: '4.70', coupon_frequency: 2, risk_product_category: 'CONSERVATIVE', pricing_source_hierarchy: ['BLOOMBERG', 'REUTERS'] },
    // Corporate Bonds
    { isin: 'PH3BA0000085', bloomberg_ticker: 'BDO 5.50 2027', local_code: 'BDO-BOND-2027', name: 'BDO Unibank Corporate Bond 5.50% 2027', asset_class: 'FI', sector: 'FINANCIALS', exchange: 'PDEx', currency: 'PHP', coupon_rate: '5.50', maturity_date: '2027-06-15', yield_rate: '5.80', coupon_frequency: 4, risk_product_category: 'MODERATE', pricing_source_hierarchy: ['BLOOMBERG', 'PDEX'] },
    { isin: 'PH3SM0000121', bloomberg_ticker: 'SM 5.00 2028', local_code: 'SM-BOND-2028', name: 'SM Investments Bond 5.00% 2028', asset_class: 'FI', sector: 'CONSUMER_DISC', exchange: 'PDEx', currency: 'PHP', coupon_rate: '5.00', maturity_date: '2028-09-20', yield_rate: '5.30', coupon_frequency: 4, risk_product_category: 'MODERATE', pricing_source_hierarchy: ['BLOOMBERG', 'PDEX'] },
    // Money Market
    { isin: 'PHTBILL91D', bloomberg_ticker: 'RPTB 91D', local_code: 'RPTB-91', name: 'Republic of Philippines T-Bill 91-day', asset_class: 'MM', sector: 'GOVERNMENT', exchange: 'PDEx', currency: 'PHP', coupon_rate: '0', maturity_date: null, yield_rate: '5.90', coupon_frequency: 0, risk_product_category: 'CONSERVATIVE', pricing_source_hierarchy: ['BSP', 'PDEX'] },
    // UITF NAV unit
    { isin: 'PHUITFBOND01', bloomberg_ticker: null, local_code: 'UITF-BOND-PHP', name: 'PHP Bond UITF (per unit)', asset_class: 'MM', sector: 'COLLECTIVE_INVESTMENT', exchange: null, currency: 'PHP', risk_product_category: 'CONSERVATIVE', pricing_source_hierarchy: ['INTERNAL'] },
  ];

  const ids: Record<string, number> = {};
  for (const s of securities) {
    const id = await upsertSecurity(s.isin, s as any);
    ids[s.local_code] = id!;
  }
  console.log(`  → ${securities.length} securities ready`);
  return ids;
}

// ─── 4. COUNTERPARTIES & BROKERS ─────────────────────────────────────────────

async function seedCounterparties() {
  console.log('\n[4] Seeding counterparties & brokers...');

  const cps = [
    { name: 'COL Financial Group Inc.', lei: 'PH-LEI-COL001', bic: 'COLBPHM1', type: 'BROKER', settlement_instructions: { dtcc: 'COLB001', pdtc: 'COL001' }, is_active: true },
    { name: 'BPI Securities Corporation', lei: 'PH-LEI-BPISEC', bic: 'BPISPHM1', type: 'BROKER', settlement_instructions: { pdtc: 'BPIS001' }, is_active: true },
    { name: 'First Metro Securities Brokerage', lei: 'PH-LEI-FMSB01', bic: 'MBTCPHM1', type: 'BROKER', settlement_instructions: { pdtc: 'FMSB001' }, is_active: true },
    { name: 'Philippine Dealing and Exchange Corp', lei: 'PH-LEI-PDEX01', bic: 'PDEXPHM1', type: 'EXCHANGE', settlement_instructions: {}, is_active: true },
    { name: 'Bureau of Treasury - Philippines', lei: 'PH-LEI-BTR001', bic: 'BTPIPHM1', type: 'GOVERNMENT', settlement_instructions: { swift: 'BTPIPHM1' }, is_active: true },
  ];

  const cpIds: number[] = [];
  for (const cp of cps) {
    const exists = await db.select().from(schema.counterparties).where(eq(schema.counterparties.name, cp.name)).limit(1);
    if (exists.length) { cpIds.push(exists[0].id); continue; }
    const [r] = await db.insert(schema.counterparties).values(cp as any).returning({ id: schema.counterparties.id });
    cpIds.push(r.id);
  }

  // Brokers (first 3 are brokers)
  const brokerIds: number[] = [];
  for (let i = 0; i < 3; i++) {
    const exists = await db.select().from(schema.brokers).where(eq(schema.brokers.counterparty_id, cpIds[i])).limit(1);
    if (exists.length) { brokerIds.push(exists[0].id); continue; }
    const [r] = await db.insert(schema.brokers).values({
      counterparty_id: cpIds[i],
      commission_schedule: { default_rate_bps: i === 0 ? 25 : i === 1 ? 20 : 30 },
      fix_session_config: { session_id: `FIX${i + 1}` },
    } as any).returning({ id: schema.brokers.id });
    brokerIds.push(r.id);
  }

  console.log(`  → ${cps.length} counterparties, ${brokerIds.length} brokers ready`);
  return { cpIds, brokerIds };
}

// ─── 5. PORTFOLIOS ────────────────────────────────────────────────────────────

async function seedPortfolios() {
  console.log('\n[5] Seeding portfolios...');

  const portfolios = [
    // IMA Discretionary (professional discretion)
    { portfolio_id: 'PTF-001', client_id: 'CLT-001', type: 'IMA_DISCRETIONARY', base_currency: 'PHP', aum: '245000000.00', inception_date: '2018-01-15', portfolio_status: 'ACTIVE' },
    { portfolio_id: 'PTF-002', client_id: 'CLT-002', type: 'IMA_DISCRETIONARY', base_currency: 'PHP', aum: '88500000.00', inception_date: '2020-03-01', portfolio_status: 'ACTIVE' },
    // IMA Directed (client directs investment)
    { portfolio_id: 'PTF-003', client_id: 'CLT-003', type: 'IMA_DIRECTED', base_currency: 'PHP', aum: '156000000.00', inception_date: '2015-06-30', portfolio_status: 'ACTIVE' },
    { portfolio_id: 'PTF-004', client_id: 'CLT-005', type: 'IMA_DIRECTED', base_currency: 'PHP', aum: '42000000.00', inception_date: '2022-08-15', portfolio_status: 'ACTIVE' },
    // PMT (Personal Management Trust)
    { portfolio_id: 'PTF-005', client_id: 'CLT-004', type: 'PMT', base_currency: 'PHP', aum: '28500000.00', inception_date: '2019-05-20', portfolio_status: 'ACTIVE' },
    // UITF (pooled)
    { portfolio_id: 'PTF-006', client_id: 'CLT-006', type: 'UITF', base_currency: 'PHP', aum: '350000000.00', inception_date: '2010-01-02', portfolio_status: 'ACTIVE' },
    // Escrow
    { portfolio_id: 'PTF-007', client_id: 'CLT-007', type: 'ESCROW', base_currency: 'PHP', aum: '125000000.00', inception_date: '2021-11-01', portfolio_status: 'ACTIVE' },
    // Employee Benefit Trust
    { portfolio_id: 'PTF-008', client_id: 'CLT-009', type: 'EMPLOYEE_BENEFIT', base_currency: 'PHP', aum: '490000000.00', inception_date: '2008-03-15', portfolio_status: 'ACTIVE' },
    // Pre-Need
    { portfolio_id: 'PTF-009', client_id: 'CLT-010', type: 'PRE_NEED', base_currency: 'PHP', aum: '780000000.00', inception_date: '2005-01-01', portfolio_status: 'ACTIVE' },
    // Foundation PMT
    { portfolio_id: 'PTF-010', client_id: 'CLT-008', type: 'PMT', base_currency: 'PHP', aum: '95000000.00', inception_date: '2016-07-01', portfolio_status: 'ACTIVE' },
    // A second IMA for CLT-001 (USD-denominated)
    { portfolio_id: 'PTF-011', client_id: 'CLT-001', type: 'IMA_DISCRETIONARY', base_currency: 'USD', aum: '1850000.00', inception_date: '2021-09-01', portfolio_status: 'ACTIVE' },
  ];

  for (const p of portfolios) await upsertPortfolio(p);
  console.log(`  → ${portfolios.length} portfolios ready`);

  // Mandates for discretionary portfolios
  const mandates = [
    { portfolio_id: 'PTF-001', min_allocation: { EQ: 40, FI: 30, MM: 5 }, max_allocation: { EQ: 70, FI: 50, MM: 20 }, max_single_issuer_pct: '10', max_sector_pct: '30', credit_floor: 'BBB-', benchmark_id: 'PSEi' },
    { portfolio_id: 'PTF-002', min_allocation: { EQ: 30, FI: 40, MM: 10 }, max_allocation: { EQ: 60, FI: 60, MM: 30 }, max_single_issuer_pct: '10', max_sector_pct: '25', credit_floor: 'BBB', benchmark_id: 'PHIL_BALANCED' },
    { portfolio_id: 'PTF-011', min_allocation: { FI: 50, MM: 10 }, max_allocation: { EQ: 40, FI: 80, MM: 30 }, max_single_issuer_pct: '15', max_sector_pct: '40', credit_floor: 'BB+', benchmark_id: 'US_AGGREGATE' },
  ];
  for (const m of mandates) {
    const ex = await db.select().from(schema.mandates).where(eq(schema.mandates.portfolio_id, m.portfolio_id)).limit(1);
    if (!ex.length) await db.insert(schema.mandates).values(m as any);
  }
}

// ─── 6. PRICING RECORDS (60-day history) ─────────────────────────────────────

async function seedPricingRecords(secIds: Record<string, number>) {
  console.log('\n[6] Seeding pricing records (60 days)...');

  const basePrice: Record<string, number> = {
    'BDO': 130.50, 'BPI': 108.00, 'SM': 905.00, 'AC': 680.00,
    'JGS': 52.50, 'TEL': 1400.00, 'MER': 305.00, 'MEG': 2.18,
    'RPGB-2036': 98.25, 'RPGB-2028': 99.80, 'RPGB-2031': 97.50,
    'ROP-2035': 94.50,
    'BDO-BOND-2027': 101.20, 'SM-BOND-2028': 100.75,
    'RPTB-91': 99.50,
    'UITF-BOND-PHP': 1.4523,
  };

  let count = 0;
  for (const [code, secId] of Object.entries(secIds)) {
    if (!secId || !basePrice[code]) continue;
    const base = basePrice[code];
    for (let d = 60; d >= 0; d--) {
      const priceDate = daysAgo(d);
      const exists = await db.select().from(schema.pricingRecords)
        .where(and(eq(schema.pricingRecords.security_id, secId), eq(schema.pricingRecords.price_date, priceDate))).limit(1);
      if (exists.length) continue;
      const drift = (Math.random() - 0.48) * 0.015;
      const price = +(base * (1 + drift * (60 - d) / 60)).toFixed(4);
      await db.insert(schema.pricingRecords).values({ security_id: secId, price_date: priceDate, close_price: String(price), source: 'BLOOMBERG' } as any);
      count++;
    }
  }
  console.log(`  → ${count} pricing records inserted`);
}

// ─── 7. POSITIONS & CASH ──────────────────────────────────────────────────────

async function seedPositions(secIds: Record<string, number>) {
  console.log('\n[7] Seeding positions & cash ledger...');

  const positions = [
    // PTF-001 (Discretionary, growth, PHP 245M AUM)
    { portfolio_id: 'PTF-001', security_id: secIds['BDO'], quantity: '500000', cost_basis: '62500000', market_value: '65250000', unrealized_pnl: '2750000', as_of_date: TODAY },
    { portfolio_id: 'PTF-001', security_id: secIds['SM'], quantity: '80000', cost_basis: '68000000', market_value: '72400000', unrealized_pnl: '4400000', as_of_date: TODAY },
    { portfolio_id: 'PTF-001', security_id: secIds['AC'], quantity: '100000', cost_basis: '65000000', market_value: '68000000', unrealized_pnl: '3000000', as_of_date: TODAY },
    { portfolio_id: 'PTF-001', security_id: secIds['RPGB-2036'], quantity: '30000000', cost_basis: '29250000', market_value: '29475000', unrealized_pnl: '225000', as_of_date: TODAY },
    // PTF-002 (Discretionary, balanced, PHP 88.5M AUM)
    { portfolio_id: 'PTF-002', security_id: secIds['BPI'], quantity: '200000', cost_basis: '20800000', market_value: '21600000', unrealized_pnl: '800000', as_of_date: TODAY },
    { portfolio_id: 'PTF-002', security_id: secIds['MEG'], quantity: '10000000', cost_basis: '20500000', market_value: '21800000', unrealized_pnl: '1300000', as_of_date: TODAY },
    { portfolio_id: 'PTF-002', security_id: secIds['RPGB-2028'], quantity: '40000000', cost_basis: '39800000', market_value: '39920000', unrealized_pnl: '120000', as_of_date: TODAY },
    // PTF-003 (Directed, conservative, PHP 156M AUM)
    { portfolio_id: 'PTF-003', security_id: secIds['RPGB-2036'], quantity: '80000000', cost_basis: '77400000', market_value: '78600000', unrealized_pnl: '1200000', as_of_date: TODAY },
    { portfolio_id: 'PTF-003', security_id: secIds['BDO-BOND-2027'], quantity: '50000000', cost_basis: '49800000', market_value: '50600000', unrealized_pnl: '800000', as_of_date: TODAY },
    { portfolio_id: 'PTF-003', security_id: secIds['RPTB-91'], quantity: '20000000', cost_basis: '20000000', market_value: '19900000', unrealized_pnl: '-100000', as_of_date: TODAY },
    // PTF-004 (Directed, aggressive, PHP 42M AUM)
    { portfolio_id: 'PTF-004', security_id: secIds['BDO'], quantity: '150000', cost_basis: '18750000', market_value: '19575000', unrealized_pnl: '825000', as_of_date: TODAY },
    { portfolio_id: 'PTF-004', security_id: secIds['JGS'], quantity: '300000', cost_basis: '15000000', market_value: '15750000', unrealized_pnl: '750000', as_of_date: TODAY },
    // PTF-005 (PMT, moderate, PHP 28.5M AUM)
    { portfolio_id: 'PTF-005', security_id: secIds['MER'], quantity: '50000', cost_basis: '14500000', market_value: '15250000', unrealized_pnl: '750000', as_of_date: TODAY },
    { portfolio_id: 'PTF-005', security_id: secIds['RPGB-2031'], quantity: '10000000', cost_basis: '9800000', market_value: '9750000', unrealized_pnl: '-50000', as_of_date: TODAY },
    // PTF-007 (Escrow, PHP 125M AUM - mostly fixed income)
    { portfolio_id: 'PTF-007', security_id: secIds['RPGB-2028'], quantity: '100000000', cost_basis: '99400000', market_value: '99800000', unrealized_pnl: '400000', as_of_date: TODAY },
    { portfolio_id: 'PTF-007', security_id: secIds['SM-BOND-2028'], quantity: '20000000', cost_basis: '20000000', market_value: '20150000', unrealized_pnl: '150000', as_of_date: TODAY },
    // PTF-008 (Employee Benefit, PHP 490M)
    { portfolio_id: 'PTF-008', security_id: secIds['RPGB-2036'], quantity: '200000000', cost_basis: '193000000', market_value: '196500000', unrealized_pnl: '3500000', as_of_date: TODAY },
    { portfolio_id: 'PTF-008', security_id: secIds['BDO'], quantity: '800000', cost_basis: '96000000', market_value: '104400000', unrealized_pnl: '8400000', as_of_date: TODAY },
    { portfolio_id: 'PTF-008', security_id: secIds['TEL'], quantity: '100000', cost_basis: '135000000', market_value: '140000000', unrealized_pnl: '5000000', as_of_date: TODAY },
    // PTF-011 (USD IMA, USD 1.85M AUM)
    { portfolio_id: 'PTF-011', security_id: secIds['ROP-2035'], quantity: '1000000', cost_basis: '940000', market_value: '945000', unrealized_pnl: '5000', as_of_date: TODAY },
  ];

  let count = 0;
  for (const p of positions) {
    const exists = await db.select().from(schema.positions)
      .where(and(eq(schema.positions.portfolio_id, p.portfolio_id), eq(schema.positions.security_id, p.security_id))).limit(1);
    if (!exists.length) { await db.insert(schema.positions).values(p as any); count++; }
  }

  // Cash ledger
  const cash = [
    { portfolio_id: 'PTF-001', account_type: 'SETTLEMENT', currency: 'PHP', balance: '9875000', available_balance: '9875000', as_of_date: TODAY },
    { portfolio_id: 'PTF-002', account_type: 'SETTLEMENT', currency: 'PHP', balance: '5180000', available_balance: '5180000', as_of_date: TODAY },
    { portfolio_id: 'PTF-003', account_type: 'SETTLEMENT', currency: 'PHP', balance: '7100000', available_balance: '7100000', as_of_date: TODAY },
    { portfolio_id: 'PTF-004', account_type: 'SETTLEMENT', currency: 'PHP', balance: '6675000', available_balance: '6675000', as_of_date: TODAY },
    { portfolio_id: 'PTF-005', account_type: 'SETTLEMENT', currency: 'PHP', balance: '3500000', available_balance: '3500000', as_of_date: TODAY },
    { portfolio_id: 'PTF-006', account_type: 'SETTLEMENT', currency: 'PHP', balance: '15000000', available_balance: '15000000', as_of_date: TODAY },
    { portfolio_id: 'PTF-007', account_type: 'SETTLEMENT', currency: 'PHP', balance: '5050000', available_balance: '5050000', as_of_date: TODAY },
    { portfolio_id: 'PTF-008', account_type: 'SETTLEMENT', currency: 'PHP', balance: '49600000', available_balance: '49600000', as_of_date: TODAY },
    { portfolio_id: 'PTF-009', account_type: 'SETTLEMENT', currency: 'PHP', balance: '32000000', available_balance: '32000000', as_of_date: TODAY },
    { portfolio_id: 'PTF-010', account_type: 'SETTLEMENT', currency: 'PHP', balance: '7250000', available_balance: '7250000', as_of_date: TODAY },
    { portfolio_id: 'PTF-011', account_type: 'SETTLEMENT', currency: 'USD', balance: '905000', available_balance: '905000', as_of_date: TODAY },
  ];
  let cashCount = 0;
  for (const c of cash) {
    const ex = await db.select().from(schema.cashLedger)
      .where(and(eq(schema.cashLedger.portfolio_id, c.portfolio_id), eq(schema.cashLedger.currency, c.currency))).limit(1);
    if (!ex.length) { await db.insert(schema.cashLedger).values(c as any); cashCount++; }
  }

  console.log(`  → ${count} positions, ${cashCount} cash ledger entries ready`);
}

// ─── 8. NAV COMPUTATIONS ─────────────────────────────────────────────────────

async function seedNavComputations(secIds: Record<string, number>) {
  console.log('\n[8] Seeding NAV computations (UITF 90-day history)...');

  let count = 0;
  let navPerUnit = 1.4523;
  for (let d = 90; d >= 0; d--) {
    const computationDate = daysAgo(d);
    const exists = await db.select().from(schema.navComputations)
      .where(and(eq(schema.navComputations.portfolio_id, 'PTF-006'), eq(schema.navComputations.computation_date, computationDate))).limit(1);
    if (exists.length) continue;
    navPerUnit = +(navPerUnit * (1 + (Math.random() - 0.47) * 0.002)).toFixed(6);
    const totalNav = +(navPerUnit * 240_000_000).toFixed(2);
    await db.insert(schema.navComputations).values({
      portfolio_id: 'PTF-006',
      computation_date: computationDate,
      nav_per_unit: String(navPerUnit),
      total_nav: String(totalNav),
      units_outstanding: '240000000',
      pricing_source: 'BLOOMBERG',
      nav_status: 'PUBLISHED',
      fair_value_level: 'L1',
      deviation_pct: String(+(Math.random() * 0.05).toFixed(4)),
      deviation_flagged: false,
    } as any);
    count++;
  }
  console.log(`  → ${count} NAV records inserted`);
}

// ─── 9. ORDERS, TRADES & SETTLEMENTS ─────────────────────────────────────────

async function seedOrders(secIds: Record<string, number>, brokerIds: number[], userIds: Record<string, number>) {
  console.log('\n[9] Seeding orders, trades & settlements...');

  const traderId = userIds['portfolio_mgr'] ?? userIds['bo_maker'] ?? 3;

  const orders = [
    { order_id: 'ORD-001', order_no: 'ON-2026-0001', portfolio_id: 'PTF-001', type: 'MARKET', side: 'BUY', security_id: secIds['BDO'], quantity: '100000', currency: 'PHP', order_status: 'SETTLED', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: daysAgo(30), transaction_ref_no: 'TXN-2026-0001' },
    { order_id: 'ORD-002', order_no: 'ON-2026-0002', portfolio_id: 'PTF-001', type: 'LIMIT', side: 'BUY', security_id: secIds['AC'], quantity: '50000', limit_price: '675.00', currency: 'PHP', order_status: 'SETTLED', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: daysAgo(20), transaction_ref_no: 'TXN-2026-0002' },
    { order_id: 'ORD-003', order_no: 'ON-2026-0003', portfolio_id: 'PTF-002', type: 'MARKET', side: 'BUY', security_id: secIds['BPI'], quantity: '80000', currency: 'PHP', order_status: 'SETTLED', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: daysAgo(25), transaction_ref_no: 'TXN-2026-0003' },
    { order_id: 'ORD-004', order_no: 'ON-2026-0004', portfolio_id: 'PTF-003', type: 'MARKET', side: 'BUY', security_id: secIds['RPGB-2036'], quantity: '50000000', currency: 'PHP', order_status: 'SETTLED', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: daysAgo(45), transaction_ref_no: 'TXN-2026-0004' },
    { order_id: 'ORD-005', order_no: 'ON-2026-0005', portfolio_id: 'PTF-004', type: 'MARKET', side: 'BUY', security_id: secIds['JGS'], quantity: '300000', currency: 'PHP', order_status: 'SETTLED', authorization_tier: 'TWO_EYES', trader_id: traderId, value_date: daysAgo(15), transaction_ref_no: 'TXN-2026-0005' },
    { order_id: 'ORD-006', order_no: 'ON-2026-0006', portfolio_id: 'PTF-001', type: 'MARKET', side: 'SELL', security_id: secIds['MEG'], quantity: '5000000', currency: 'PHP', order_status: 'SETTLED', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: daysAgo(10), transaction_ref_no: 'TXN-2026-0006' },
    { order_id: 'ORD-007', order_no: 'ON-2026-0007', portfolio_id: 'PTF-008', type: 'MARKET', side: 'BUY', security_id: secIds['TEL'], quantity: '100000', currency: 'PHP', order_status: 'SETTLED', authorization_tier: 'SIX_EYES', trader_id: traderId, value_date: daysAgo(60), transaction_ref_no: 'TXN-2026-0007' },
    { order_id: 'ORD-008', order_no: 'ON-2026-0008', portfolio_id: 'PTF-011', type: 'MARKET', side: 'BUY', security_id: secIds['ROP-2035'], quantity: '1000000', currency: 'USD', order_status: 'SETTLED', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: daysAgo(90), transaction_ref_no: 'TXN-2026-0008' },
    // Pending authorization
    { order_id: 'ORD-009', order_no: 'ON-2026-0009', portfolio_id: 'PTF-002', type: 'LIMIT', side: 'BUY', security_id: secIds['SM'], quantity: '20000', limit_price: '900.00', currency: 'PHP', order_status: 'PENDING_AUTH', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: daysAgo(1), transaction_ref_no: 'TXN-2026-0009' },
    { order_id: 'ORD-010', order_no: 'ON-2026-0010', portfolio_id: 'PTF-001', type: 'MARKET', side: 'BUY', security_id: secIds['MER'], quantity: '25000', currency: 'PHP', order_status: 'AUTHORIZED', authorization_tier: 'FOUR_EYES', trader_id: traderId, value_date: TODAY, transaction_ref_no: 'TXN-2026-0010' },
  ];

  let orderCount = 0;
  for (const o of orders) {
    const ex = await db.select().from(schema.orders).where(eq(schema.orders.order_id, o.order_id)).limit(1);
    if (ex.length) continue;
    await db.insert(schema.orders).values(o as any);
    orderCount++;
  }

  // Trades for settled orders
  const trades = [
    { trade_id: 'TRD-001', order_id: 'ORD-001', broker_id: brokerIds[0], execution_price: '130.00', execution_qty: '100000', execution_time: new Date(Date.now() - 30 * 864e5), slippage_bps: '2', fill_type: 'FULL' },
    { trade_id: 'TRD-002', order_id: 'ORD-002', broker_id: brokerIds[0], execution_price: '675.50', execution_qty: '50000', execution_time: new Date(Date.now() - 20 * 864e5), slippage_bps: '1', fill_type: 'FULL' },
    { trade_id: 'TRD-003', order_id: 'ORD-003', broker_id: brokerIds[1], execution_price: '108.50', execution_qty: '80000', execution_time: new Date(Date.now() - 25 * 864e5), slippage_bps: '3', fill_type: 'FULL' },
    { trade_id: 'TRD-004', order_id: 'ORD-004', broker_id: brokerIds[2], execution_price: '98.10', execution_qty: '50000000', execution_time: new Date(Date.now() - 45 * 864e5), slippage_bps: '0', fill_type: 'FULL' },
    { trade_id: 'TRD-005', order_id: 'ORD-005', broker_id: brokerIds[0], execution_price: '52.20', execution_qty: '300000', execution_time: new Date(Date.now() - 15 * 864e5), slippage_bps: '5', fill_type: 'FULL' },
    { trade_id: 'TRD-006', order_id: 'ORD-006', broker_id: brokerIds[1], execution_price: '2.20', execution_qty: '5000000', execution_time: new Date(Date.now() - 10 * 864e5), slippage_bps: '4', fill_type: 'FULL' },
    { trade_id: 'TRD-007', order_id: 'ORD-007', broker_id: brokerIds[0], execution_price: '1380.00', execution_qty: '100000', execution_time: new Date(Date.now() - 60 * 864e5), slippage_bps: '2', fill_type: 'FULL' },
    { trade_id: 'TRD-008', order_id: 'ORD-008', broker_id: brokerIds[1], execution_price: '94.80', execution_qty: '1000000', execution_time: new Date(Date.now() - 90 * 864e5), slippage_bps: '1', fill_type: 'FULL' },
  ];
  let tradeCount = 0;
  for (const t of trades) {
    const ex = await db.select().from(schema.trades).where(eq(schema.trades.trade_id, t.trade_id)).limit(1);
    if (ex.length) continue;
    await db.insert(schema.trades).values(t as any);
    tradeCount++;
  }

  console.log(`  → ${orderCount} orders, ${tradeCount} trades ready`);
}

// ─── 10. CONTRIBUTIONS & WITHDRAWALS ─────────────────────────────────────────

async function seedContributions() {
  console.log('\n[10] Seeding contributions & withdrawals...');

  const contribs = [
    { portfolio_id: 'PTF-001', amount: '50000000', currency: 'PHP', source_account: 'BDO-CA-001234', type: 'INITIAL', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-001', amount: '20000000', currency: 'PHP', source_account: 'BDO-CA-001234', type: 'TOP_UP', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-002', amount: '30000000', currency: 'PHP', source_account: 'BPI-SA-098765', type: 'INITIAL', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-003', amount: '100000000', currency: 'PHP', source_account: 'BDO-CA-445566', type: 'INITIAL', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-004', amount: '40000000', currency: 'PHP', source_account: 'BPI-CA-778899', type: 'INITIAL', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-005', amount: '25000000', currency: 'PHP', source_account: 'BPI-SA-112233', type: 'INITIAL', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-006', amount: '350000000', currency: 'PHP', source_account: 'MULTIPLE', type: 'SUBSCRIPTION', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-007', amount: '125000000', currency: 'PHP', source_account: 'VISAYAS-AGRI-MAIN', type: 'ESCROW_PLACEMENT', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-008', amount: '490000000', currency: 'PHP', source_account: 'MDA-PENSION-FUND', type: 'INITIAL', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-009', amount: '780000000', currency: 'PHP', source_account: 'GRACEFUL-TRUST-FUND', type: 'PRE_NEED_COLLECTION', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-010', amount: '95000000', currency: 'PHP', source_account: 'PAGASA-ENDOWMENT', type: 'INITIAL', contribution_status: 'SETTLED' },
    { portfolio_id: 'PTF-011', amount: '1850000', currency: 'USD', source_account: 'CITI-USD-001234', type: 'INITIAL', contribution_status: 'SETTLED' },
  ];
  for (const c of contribs) {
    const ex = await db.select().from(schema.contributions)
      .where(and(eq(schema.contributions.portfolio_id, c.portfolio_id), eq(schema.contributions.type, c.type))).limit(1);
    if (!ex.length) await db.insert(schema.contributions).values(c as any);
  }

  // One withdrawal example
  const ex = await db.select().from(schema.withdrawals)
    .where(eq(schema.withdrawals.portfolio_id, 'PTF-005')).limit(1);
  if (!ex.length) {
    await db.insert(schema.withdrawals).values({
      portfolio_id: 'PTF-005', amount: '2000000', currency: 'PHP',
      destination_account: 'BPI-SA-112233', type: 'PARTIAL', tax_withholding: '40000', withdrawal_status: 'SETTLED',
    } as any);
  }

  console.log('  → contributions & withdrawals ready');
}

// ─── 11. CORPORATE ACTIONS ────────────────────────────────────────────────────

async function seedCorporateActions(secIds: Record<string, number>) {
  console.log('\n[11] Seeding corporate actions...');

  const cas = [
    { security_id: secIds['BDO'], type: 'DIVIDEND_CASH', ex_date: daysAgo(45), record_date: daysAgo(43), payment_date: daysAgo(30), amount_per_share: '4.00', source: 'BLOOMBERG', ca_status: 'SETTLED', scrub_status: 'GOLDEN_COPY', esg_flag: false, event_version: 1 },
    { security_id: secIds['BPI'], type: 'DIVIDEND_CASH', ex_date: daysAgo(60), record_date: daysAgo(58), payment_date: daysAgo(45), amount_per_share: '2.50', source: 'BLOOMBERG', ca_status: 'SETTLED', scrub_status: 'GOLDEN_COPY', esg_flag: false, event_version: 1 },
    { security_id: secIds['SM'], type: 'DIVIDEND_STOCK', ex_date: daysAgo(30), record_date: daysAgo(28), payment_date: daysAgo(15), ratio: '0.05', source: 'BLOOMBERG', ca_status: 'SETTLED', scrub_status: 'GOLDEN_COPY', esg_flag: false, event_version: 1 },
    { security_id: secIds['TEL'], type: 'DIVIDEND_CASH', ex_date: daysAgo(15), record_date: daysAgo(13), payment_date: daysAgo(2), amount_per_share: '68.00', source: 'BLOOMBERG', ca_status: 'ENTITLED', scrub_status: 'GOLDEN_COPY', esg_flag: false, event_version: 1 },
    { security_id: secIds['RPGB-2036'], type: 'COUPON', ex_date: daysAgo(180), record_date: daysAgo(180), payment_date: daysAgo(180), amount_per_share: '3125.00', source: 'BTR', ca_status: 'SETTLED', scrub_status: 'GOLDEN_COPY', esg_flag: false, event_version: 1 },
    // Upcoming — for workbench demo
    { security_id: secIds['MER'], type: 'DIVIDEND_CASH', ex_date: daysAgo(-7), record_date: daysAgo(-5), payment_date: daysAgo(-20), amount_per_share: '9.10', source: 'BLOOMBERG', ca_status: 'ANNOUNCED', scrub_status: 'SCRUBBED', esg_flag: false, event_version: 1 },
  ];

  let count = 0;
  const caIds: number[] = [];
  for (const ca of cas) {
    const ex = await db.select().from(schema.corporateActions)
      .where(and(eq(schema.corporateActions.security_id, ca.security_id), eq(schema.corporateActions.type, ca.type as any), eq(schema.corporateActions.ex_date, ca.ex_date))).limit(1);
    if (ex.length) { caIds.push(ex[0].id); continue; }
    const [r] = await db.insert(schema.corporateActions).values(ca as any).returning({ id: schema.corporateActions.id });
    caIds.push(r.id);
    count++;
  }
  console.log(`  → ${count} corporate actions inserted`);
  return caIds;
}

// ─── 12. COMPLIANCE RULES & BREACH ────────────────────────────────────────────

async function seedCompliance() {
  console.log('\n[12] Seeding compliance rules & breach...');

  const rules = [
    { rule_type: 'SINGLE_ISSUER_LIMIT', entity_type: 'PORTFOLIO', condition: { max_pct: 10 }, action: 'BLOCK', severity: 'HARD', is_active: true },
    { rule_type: 'SECTOR_CONCENTRATION', entity_type: 'PORTFOLIO', condition: { max_pct: 35 }, action: 'WARN', severity: 'SOFT', is_active: true },
    { rule_type: 'MINIMUM_LIQUIDITY', entity_type: 'PORTFOLIO', condition: { min_pct: 5 }, action: 'WARN', severity: 'SOFT', is_active: true },
    { rule_type: 'CREDIT_FLOOR', entity_type: 'SECURITY', condition: { min_rating: 'BBB-' }, action: 'BLOCK', severity: 'HARD', is_active: true },
    { rule_type: 'FOREIGN_EXPOSURE_LIMIT', entity_type: 'PORTFOLIO', condition: { max_pct: 25 }, action: 'WARN', severity: 'SOFT', is_active: true },
  ];

  const ruleIds: number[] = [];
  for (const r of rules) {
    const ex = await db.select().from(schema.complianceRules).where(eq(schema.complianceRules.rule_type, r.rule_type)).limit(1);
    if (ex.length) { ruleIds.push(ex[0].id); continue; }
    const [res] = await db.insert(schema.complianceRules).values(r as any).returning({ id: schema.complianceRules.id });
    ruleIds.push(res.id);
  }

  // One open breach for demo
  if (ruleIds[1]) {
    const ex = await db.select().from(schema.complianceBreaches).where(eq(schema.complianceBreaches.portfolio_id, 'PTF-004')).limit(1);
    if (!ex.length) {
      await db.insert(schema.complianceBreaches).values({
        rule_id: ruleIds[1], portfolio_id: 'PTF-004', order_id: 'ORD-005',
        breach_description: 'JGS sector (Industrials) concentration reached 37.5% against 35% limit following ORD-005 execution',
        detected_at: new Date(Date.now() - 15 * 864e5),
      } as any);
    }
  }
  console.log('  → compliance rules & 1 open breach ready');
}


// ─── 13. CRM: MEETINGS, CALL REPORTS, OPPORTUNITIES ──────────────────────────

async function seedCRM(userIds: Record<string, number>) {
  console.log('\n[13] Seeding CRM data...');

  // Meetings — use schema-compliant fields
  const meetingRows = [
    {
      meeting_code: 'MTG-001',
      title: 'Annual Portfolio Review — Eduardo Tan',
      client_id: 'CLT-001',
      organizer_user_id: userIds['rm_1'],
      start_time: new Date(Date.now() - 14 * 864e5),
      end_time:   new Date(Date.now() - 14 * 864e5 + 3600_000),
      meeting_type: 'SERVICE_REVIEW' as const,
      mode: 'IN_PERSON' as const,
      purpose: 'PORTFOLIO_REVIEW' as const,
      location: 'Manila HQ, Boardroom 3',
      meeting_status: 'COMPLETED' as const,
      notes: 'Portfolio performance review, rebalancing proposal, UITF subscription',
    },
    {
      meeting_code: 'MTG-002',
      title: 'Onboarding Meeting — Carlos Bautista',
      client_id: 'CLT-005',
      organizer_user_id: userIds['rm_3'],
      start_time: new Date(Date.now() - 30 * 864e5),
      end_time:   new Date(Date.now() - 30 * 864e5 + 5400_000),
      meeting_type: 'GENERAL' as const,
      mode: 'IN_PERSON' as const,
      purpose: 'ONBOARDING' as const,
      location: 'Cebu Branch, Room 2',
      meeting_status: 'COMPLETED' as const,
      notes: 'Trust agreement signing, risk profiling, portfolio mandate discussion',
    },
    {
      meeting_code: 'MTG-003',
      title: 'Quarterly Update — Pagkakaisa Holdings',
      client_id: 'CLT-006',
      organizer_user_id: userIds['rm_1'],
      start_time: new Date(Date.now() - 7 * 864e5),
      end_time:   new Date(Date.now() - 7 * 864e5 + 2700_000),
      meeting_type: 'SERVICE_REVIEW' as const,
      mode: 'IN_PERSON' as const,
      purpose: 'PORTFOLIO_REVIEW' as const,
      location: 'Client office, Salcedo Village',
      meeting_status: 'COMPLETED' as const,
      notes: 'Q1 performance, UITF subscriptions, corporate bond opportunities',
    },
    {
      meeting_code: 'MTG-004',
      title: 'Portfolio Review — Maria Reyes-Lopez',
      client_id: 'CLT-002',
      organizer_user_id: userIds['rm_1'],
      start_time: new Date(Date.now() + 3 * 864e5),
      end_time:   new Date(Date.now() + 3 * 864e5 + 3600_000),
      meeting_type: 'SERVICE_REVIEW' as const,
      mode: 'IN_PERSON' as const,
      purpose: 'PORTFOLIO_REVIEW' as const,
      location: 'Manila HQ, Room 5',
      meeting_status: 'SCHEDULED' as const,
      notes: 'Q1 review, proposed rebalancing toward bonds',
    },
    {
      meeting_code: 'MTG-005',
      title: 'Investment Proposal — Mindanao Dev Authority',
      client_id: 'CLT-009',
      organizer_user_id: userIds['rm_2'],
      start_time: new Date(Date.now() + 7 * 864e5),
      end_time:   new Date(Date.now() + 7 * 864e5 + 7200_000),
      meeting_type: 'PRODUCT_PRESENTATION' as const,
      mode: 'IN_PERSON' as const,
      purpose: 'PRODUCT_PRESENTATION' as const,
      location: 'Cagayan de Oro City Hall',
      meeting_status: 'SCHEDULED' as const,
      notes: 'Revised EB trust investment policy, ROP bonds proposal',
    },
  ];

  const meetingIds: number[] = [];
  for (const m of meetingRows) {
    const ex = await db.select().from(schema.meetings)
      .where(eq(schema.meetings.meeting_code, m.meeting_code)).limit(1);
    if (ex.length) { meetingIds.push(ex[0].id); continue; }
    const [r] = await db.insert(schema.meetings).values(m as any).returning({ id: schema.meetings.id });
    meetingIds.push(r.id);
  }

  // Call reports for completed meetings
  const crRows = [
    {
      report_code: 'CR-001',
      meeting_id: meetingIds[0],
      client_id: 'CLT-001',
      filed_by: userIds['rm_1'],
      subject: 'Annual Portfolio Review — Eduardo Tan',
      meeting_type: 'SERVICE_REVIEW' as const,
      meeting_date: daysAgo(14),
      summary: 'Reviewed FY2025 portfolio performance (IMA Disc up 12.4% vs PSEi 8.2%). Agreed to rebalance: reduce MER to 5%, add RPGB-2031.',
      outcome: 'Client considering additional PHP 20M top-up. Rebalancing order tickets to be prepared.',
      report_status: 'APPROVED' as const,
      filed_date: new Date(Date.now() - 13 * 864e5),
    },
    {
      report_code: 'CR-002',
      meeting_id: meetingIds[1],
      client_id: 'CLT-005',
      filed_by: userIds['rm_3'],
      subject: 'Onboarding Meeting — Carlos Bautista',
      meeting_type: 'GENERAL' as const,
      meeting_date: daysAgo(30),
      summary: 'Completed onboarding. Signed trust agreement. Risk profiling score 78 — AGGRESSIVE. Agreed on directed IMA with PHP 40M initial investment.',
      outcome: 'Submit KYC for compliance review, open portfolio PTF-004.',
      report_status: 'APPROVED' as const,
      filed_date: new Date(Date.now() - 29 * 864e5),
    },
    {
      report_code: 'CR-003',
      meeting_id: meetingIds[2],
      client_id: 'CLT-006',
      filed_by: userIds['rm_1'],
      subject: 'Quarterly Update — Pagkakaisa Holdings',
      meeting_type: 'SERVICE_REVIEW' as const,
      meeting_date: daysAgo(7),
      summary: 'UITF performance discussed — 6M return 4.1% vs benchmark 3.8%. Client wants to increase UITF subscription by PHP 50M.',
      outcome: 'Prepare UITF subscription instructions and bond term sheet.',
      report_status: 'DRAFT' as const,
      filed_date: new Date(Date.now() - 6 * 864e5),
    },
  ];

  for (const cr of crRows) {
    if (!cr.meeting_id) continue;
    const ex = await db.select().from(schema.callReports)
      .where(eq(schema.callReports.report_code, cr.report_code)).limit(1);
    if (!ex.length) await db.insert(schema.callReports).values(cr as any);
  }

  // Opportunities
  const oppRows = [
    {
      opportunity_code: 'OPP-001',
      name: 'PTF-001 Top-Up — PHP 20M IMA Discretionary',
      client_id: 'CLT-001',
      product_type: 'IMA_DISCRETIONARY',
      pipeline_value: '20000000',
      stage: 'PROPOSAL' as const,
      probability: 80,
      expected_close_date: daysAgo(-14),
    },
    {
      opportunity_code: 'OPP-002',
      name: 'UITF Subscription Increase — PHP 50M',
      client_id: 'CLT-006',
      product_type: 'UITF',
      pipeline_value: '50000000',
      stage: 'NEGOTIATION' as const,
      probability: 90,
      expected_close_date: daysAgo(-7),
    },
    {
      opportunity_code: 'OPP-003',
      name: 'EB Trust Rebalancing — ROP Bonds',
      client_id: 'CLT-009',
      product_type: 'IMA_DIRECTED',
      pipeline_value: '100000000',
      stage: 'IDENTIFIED' as const,
      probability: 50,
      expected_close_date: daysAgo(-30),
    },
    {
      opportunity_code: 'OPP-004',
      name: 'Escrow Renewal — PHP 125M',
      client_id: 'CLT-007',
      product_type: 'ESCROW',
      pipeline_value: '125000000',
      stage: 'WON' as const,
      probability: 100,
      expected_close_date: daysAgo(30),
    },
  ];

  for (const o of oppRows) {
    const ex = await db.select().from(schema.opportunities)
      .where(eq(schema.opportunities.opportunity_code, o.opportunity_code)).limit(1);
    if (!ex.length) await db.insert(schema.opportunities).values(o as any);
  }

  console.log(`  → ${meetingRows.length} meetings, ${crRows.length} call reports, ${oppRows.length} opportunities ready`);
}

// ─── 14. SERVICE REQUESTS ─────────────────────────────────────────────────────

async function seedServiceRequests(userIds: Record<string, number>) {
  console.log('\n[14] Seeding service requests...');

  const srs = [
    {
      request_id: 'SR-2026-0001',
      client_id: 'CLT-001',
      sr_type: 'REVIEW_PORTFOLIO' as const,
      sr_details: 'Client requests PHP 5,000,000 partial withdrawal from PTF-001 for property purchase.',
      priority: 'MEDIUM' as const,
      sr_status: 'NEW' as const,
      assigned_rm_id: userIds['rm_1'],
    },
    {
      request_id: 'SR-2026-0002',
      client_id: 'CLT-003',
      sr_type: 'ADDRESS_CHANGE' as const,
      sr_details: 'Client relocated to BGC. Update address to Unit 45B, Grand Hyatt Residences, 8th Ave, BGC, Taguig.',
      priority: 'LOW' as const,
      sr_status: 'COMPLETED' as const,
      assigned_rm_id: userIds['rm_2'],
    },
    {
      request_id: 'SR-2026-0003',
      client_id: 'CLT-002',
      sr_type: 'REVIEW_PORTFOLIO' as const,
      sr_details: 'Client requests rebalancing: reduce equity to 40%, increase fixed income to 50%, cash 10%.',
      priority: 'MEDIUM' as const,
      sr_status: 'APPROVED' as const,
      assigned_rm_id: userIds['rm_1'],
    },
    {
      request_id: 'SR-2026-0004',
      client_id: 'CLT-008',
      sr_type: 'STATEMENT_REQUEST' as const,
      sr_details: 'Foundation trustees require audited trust account statement for annual general meeting. Period: Jan 1 – Dec 31, 2025.',
      priority: 'HIGH' as const,
      sr_status: 'NEW' as const,
      assigned_rm_id: userIds['rm_1'],
    },
    {
      request_id: 'SR-2026-0005',
      client_id: 'CLT-010',
      sr_type: 'GENERAL_INQUIRY' as const,
      sr_details: 'Annual KYC renewal for Graceful Life Memorial Plans. IC license expiry approaching Dec 31, 2027.',
      priority: 'MEDIUM' as const,
      sr_status: 'NEW' as const,
      assigned_rm_id: userIds['rm_2'],
    },
  ];

  for (const sr of srs) {
    const ex = await db.select().from(schema.serviceRequests)
      .where(eq(schema.serviceRequests.request_id, sr.request_id)).limit(1);
    if (!ex.length) await db.insert(schema.serviceRequests).values(sr as any);
  }
  console.log(`  → ${srs.length} service requests ready`);
}

// ─── 15. CLIENT MESSAGES ─────────────────────────────────────────────────────

async function seedClientMessages(userIds: Record<string, number>) {
  console.log('\n[15] Seeding client messages...');

  const adminId = userIds['admin'];
  const msgs = [
    {
      sender_id: userIds['rm_1'],
      sender_type: 'RM' as const,
      recipient_client_id: 'CLT-001',
      subject: 'Q1 2026 Portfolio Statement',
      body: 'Dear Mr. Tan, please find attached your Q1 2026 portfolio statement for account PTF-001. Total portfolio value as of March 31, 2026 is PHP 245,125,000. Performance: +4.2% QTD.',
      is_read: true,
    },
    {
      sender_id: adminId,
      sender_type: 'SYSTEM' as const,
      recipient_client_id: 'CLT-001',
      subject: 'Re: Withdrawal Request Confirmation',
      body: 'Dear Mr. Tan, we confirm receipt of your withdrawal instruction for PHP 5,000,000 from PTF-001. Processing is underway. Expected value date: T+3 business days.',
      is_read: false,
    },
    {
      sender_id: userIds['rm_1'],
      sender_type: 'RM' as const,
      recipient_client_id: 'CLT-002',
      subject: 'Upcoming Portfolio Review',
      body: 'Dear Ms. Reyes-Lopez, this is a reminder of your scheduled portfolio review on ' + daysAgo(-3) + ' at 10:00 AM at Manila HQ. Please bring any updated investment preferences.',
      is_read: true,
    },
    {
      sender_id: userIds['rm_1'],
      sender_type: 'RM' as const,
      recipient_client_id: 'CLT-006',
      subject: 'UITF Performance Update — April 2026',
      body: 'Dear Pagkakaisa Holdings, the PHP Bond UITF NAV as of April 25, 2026 is PHP 1.4523 per unit. YTD return: +3.85%.',
      is_read: false,
    },
    {
      sender_id: adminId,
      sender_type: 'SYSTEM' as const,
      recipient_client_id: 'CLT-009',
      subject: 'Employee Benefit Trust — Annual Actuarial Report Due',
      body: 'Dear MDA Trust Committee, the annual actuarial valuation report for the Employee Benefit Trust (PTF-008) is due by June 30, 2026 per BSP regulations.',
      is_read: false,
    },
  ];

  for (const m of msgs) {
    const ex = await db.select().from(schema.clientMessages)
      .where(and(
        eq(schema.clientMessages.recipient_client_id, m.recipient_client_id),
        eq(schema.clientMessages.subject, m.subject!),
      )).limit(1);
    if (!ex.length) await db.insert(schema.clientMessages).values(m as any);
  }
  console.log(`  → ${msgs.length} client messages ready`);
}

// ─── 16. TTRA APPLICATION ────────────────────────────────────────────────────

async function seedTTRA() {
  console.log('\n[16] Seeding TTRA application...');

  const ex = await db.select().from(schema.ttraApplications)
    .where(eq(schema.ttraApplications.ttra_id, 'TTRA-2026-001')).limit(1);
  if (!ex.length) {
    await db.insert(schema.ttraApplications).values({
      ttra_id: 'TTRA-2026-001',
      client_id: 'CLT-001',
      treaty_country: 'US',
      cor_document_ref: 'COR-2025-ETA-001',
      bir_ctrr_ruling_no: 'BIR-CTRR-2025-1234',
      ttra_status: 'APPROVED',
      effective_from: monthsAgo(6),
      effective_to: daysAgo(-365),
      next_review_due: daysAgo(-180),
    } as any);
  }
  console.log('  → TTRA application ready');
}

// ─── 17. AUDIT EVENTS ────────────────────────────────────────────────────────

async function seedAuditEvents(userIds: Record<string, number>) {
  console.log('\n[17] Seeding audit events...');

  const events = [
    { actor_id: String(userIds['rm_1']), actor_role: 'bo_maker', action: 'CREATE', entity_type: 'order', entity_id: 'ORD-009', description: 'Created limit buy order for SM PM — PTF-002', ip_address: '10.0.0.101' },
    { actor_id: String(userIds['trust_officer_1']), actor_role: 'bo_maker', action: 'CREATE', entity_type: 'service_request', entity_id: 'SR-2026-0001', description: 'Opened withdrawal service request for CLT-001', ip_address: '10.0.0.102' },
    { actor_id: String(userIds['checker_1']), actor_role: 'bo_checker', action: 'AUTHORIZE', entity_type: 'order', entity_id: 'ORD-001', description: 'Authorized BDO buy order for PTF-001', ip_address: '10.0.0.103' },
    { actor_id: String(userIds['compliance_officer']), actor_role: 'bo_checker', action: 'ACCESS', entity_type: 'compliance_breach', entity_id: 'CBR-001', description: 'Reviewed sector concentration breach on PTF-004', ip_address: '10.0.0.104' },
    { actor_id: String(userIds['admin']), actor_role: 'bo_admin', action: 'UPDATE', entity_type: 'user', entity_id: String(userIds['trust_officer_3']), description: 'Activated user account for Ana Mendoza', ip_address: '10.0.0.100' },
  ];

  for (const e of events) {
    await db.insert(schema.auditEvents).values({ ...e, created_at: new Date() } as any).catch(() => {});
  }
  console.log(`  → ${events.length} audit events inserted`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TrustOMS Philippines — Demo Data Seed                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Target: ${process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://***@') ?? '(local)'}`);

  try {
    const userIds = await seedUsers();
    await seedClients(userIds);
    const secIds = await seedSecurities();
    const { brokerIds } = await seedCounterparties();
    await seedPortfolios();
    await seedPricingRecords(secIds);
    await seedPositions(secIds);
    await seedNavComputations(secIds);
    await seedOrders(secIds, brokerIds, userIds);
    await seedContributions();
    await seedCorporateActions(secIds);
    await seedCompliance();
    await seedCRM(userIds);
    await seedServiceRequests(userIds);
    await seedClientMessages(userIds);
    await seedTTRA();
    await seedAuditEvents(userIds);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   Seed completed successfully!                                ║');
    console.log('║                                                                ║');
    console.log('║   Login credentials (password: password123):                  ║');
    console.log('║   admin / bo_head / bo_maker / bo_checker                     ║');
    console.log('║   trust_officer_1 / trust_officer_2 / trust_officer_3         ║');
    console.log('║   rm_1 / rm_2 / rm_3                                          ║');
    console.log('║   checker_1 / checker_2                                        ║');
    console.log('║   compliance_officer / portfolio_mgr / branch_head            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  } catch (err) {
    console.error('\n[ERROR] Seed failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
