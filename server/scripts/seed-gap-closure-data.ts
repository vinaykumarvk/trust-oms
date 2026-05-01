/**
 * seed-gap-closure-data.ts — Demo data for the 8 new gap-closure tables
 *
 * Tables seeded:
 *   1. gl_charge_setup       — Fee/charge configurations per fund
 *   2. gl_valuation_parameters — Valuation settings per fund
 *   3. gl_market_price_overrides — Manual price overrides (one example)
 *   4. uitf_ter_history      — Historical TER records
 *   5. fx_deals              — FX deal capture
 *   6. nostro_reconciliations — Daily nostro recon
 *   7. knowledge_base        — FAQ articles for service requests
 *   8. sr_tasks              — Sub-tasks for existing service requests
 *
 * Dependencies: seed-demo-data (users, securities, portfolios), seed-group-a (funds, GL heads)
 * Safe to run repeatedly — skips existing rows.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx server/scripts/seed-gap-closure-data.ts
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const PASSWORD_HASH = bcrypt.hashSync('password123', 12);
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

const AUDIT = {
  created_by: '1',
  updated_by: '1',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getFundIds(): Promise<Record<string, number>> {
  const funds = await db.select({ id: schema.fundMaster.id, code: schema.fundMaster.fund_code }).from(schema.fundMaster);
  const map: Record<string, number> = {};
  for (const f of funds) map[f.code] = f.id;
  return map;
}

async function getGlHeadIds(): Promise<Record<string, number>> {
  const heads = await db.select({ id: schema.glHeads.id, code: schema.glHeads.code }).from(schema.glHeads);
  const map: Record<string, number> = {};
  for (const h of heads) map[h.code] = h.id;
  return map;
}

async function getUserIds(): Promise<Record<string, number>> {
  const users = await db.select({ id: schema.users.id, username: schema.users.username }).from(schema.users);
  const map: Record<string, number> = {};
  for (const u of users) map[u.username] = u.id;
  return map;
}

async function getSecurityIds(): Promise<Record<string, number>> {
  const secs = await db.select({ id: schema.securities.id, local_code: schema.securities.local_code, name: schema.securities.name }).from(schema.securities);
  const map: Record<string, number> = {};
  for (const s of secs) {
    if (s.local_code) map[s.local_code] = s.id;
    if (s.name) map[s.name] = s.id;
  }
  return map;
}

async function getSrIds(): Promise<number[]> {
  const srs = await db.select({ id: schema.serviceRequests.id }).from(schema.serviceRequests).limit(5);
  return srs.map((s: { id: number }) => s.id);
}

// ─── 1. GL Charge Setup ─────────────────────────────────────────────────────

async function seedGlChargeSetup(fundIds: Record<string, number>, glHeadIds: Record<string, number>) {
  console.log('  Seeding gl_charge_setup...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.glChargeSetup);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  const charges = [
    {
      fund_id: fundIds['TBPF-001'],
      charge_code: 'MGMT-FEE-FI',
      charge_name: 'Management Fee — Fixed Income',
      charge_type: 'PERCENTAGE',
      percentage_rate: '0.75',
      min_fee: '500',
      max_fee: '500000',
      fee_gl_dr: glHeadIds['50100'] ?? null,
      fee_gl_cr: glHeadIds['40100'] ?? null,
      effective_from: '2024-01-01',
      is_active: true,
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBEF-001'],
      charge_code: 'MGMT-FEE-EQ',
      charge_name: 'Management Fee — Equity',
      charge_type: 'PERCENTAGE',
      percentage_rate: '1.50',
      min_fee: '1000',
      max_fee: '1000000',
      fee_gl_dr: glHeadIds['50100'] ?? null,
      fee_gl_cr: glHeadIds['40100'] ?? null,
      effective_from: '2024-01-01',
      is_active: true,
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBBF-001'],
      charge_code: 'MGMT-FEE-BAL',
      charge_name: 'Management Fee — Balanced',
      charge_type: 'PERCENTAGE',
      percentage_rate: '1.00',
      min_fee: '750',
      max_fee: '750000',
      fee_gl_dr: glHeadIds['50100'] ?? null,
      fee_gl_cr: glHeadIds['40100'] ?? null,
      effective_from: '2024-01-01',
      is_active: true,
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBMF-001'],
      charge_code: 'MGMT-FEE-MM',
      charge_name: 'Management Fee — Money Market',
      charge_type: 'PERCENTAGE',
      percentage_rate: '0.25',
      min_fee: '250',
      max_fee: '250000',
      fee_gl_dr: glHeadIds['50100'] ?? null,
      fee_gl_cr: glHeadIds['40100'] ?? null,
      effective_from: '2024-01-01',
      is_active: true,
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBPF-001'],
      charge_code: 'CUSTODIAN-FEE',
      charge_name: 'Custodian Fee — Fixed Income',
      charge_type: 'FIXED',
      fixed_amount: '25000',
      effective_from: '2024-01-01',
      is_active: true,
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBEF-001'],
      charge_code: 'PERF-FEE-EQ',
      charge_name: 'Performance Fee — Equity (tenor-slab)',
      charge_type: 'TENOR_SLAB',
      tenor_slabs: [
        { from_days: 0, to_days: 90, rate: 0 },
        { from_days: 91, to_days: 180, rate: 10 },
        { from_days: 181, to_days: 365, rate: 15 },
        { from_days: 366, to_days: 9999, rate: 20 },
      ],
      fee_gl_dr: glHeadIds['50100'] ?? null,
      fee_gl_cr: glHeadIds['40100'] ?? null,
      effective_from: '2024-01-01',
      is_active: true,
      ...AUDIT,
    },
  ];

  for (const c of charges) {
    if (!c.fund_id) continue;
    await db.insert(schema.glChargeSetup).values(c as any);
  }
  console.log(`    Inserted ${charges.filter(c => c.fund_id).length} charge setup records`);
}

// ─── 2. GL Valuation Parameters ──────────────────────────────────────────────

async function seedGlValuationParameters(fundIds: Record<string, number>) {
  console.log('  Seeding gl_valuation_parameters...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.glValuationParameters);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  const params = [
    {
      fund_id: fundIds['TBPF-001'],
      stock_exchange: 'PSE',
      price_type_priority: ['CLOSING', 'LAST_TRADED', 'BID'],
      fallback_days: 3,
      fallback_method: 'PRIOR_CLOSE',
      override_allowed: true,
      effective_from: '2024-01-01',
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBEF-001'],
      stock_exchange: 'PSE',
      price_type_priority: ['CLOSING', 'LAST_TRADED', 'MID'],
      fallback_days: 3,
      fallback_method: 'PRIOR_CLOSE',
      override_allowed: true,
      effective_from: '2024-01-01',
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBBF-001'],
      stock_exchange: 'PSE',
      price_type_priority: ['CLOSING', 'BID', 'MID'],
      fallback_days: 5,
      fallback_method: 'WAC',
      override_allowed: true,
      effective_from: '2024-01-01',
      ...AUDIT,
    },
    {
      fund_id: fundIds['TBMF-001'],
      stock_exchange: 'PDEx',
      price_type_priority: ['CLOSING', 'BID'],
      fallback_days: 3,
      fallback_method: 'COST',
      override_allowed: false,
      effective_from: '2024-01-01',
      ...AUDIT,
    },
  ];

  for (const p of params) {
    if (!p.fund_id) continue;
    await db.insert(schema.glValuationParameters).values(p as any);
  }
  console.log(`    Inserted ${params.filter(p => p.fund_id).length} valuation parameter records`);
}

// ─── 3. GL Market Price Override ──────────────────────────────────────────────

async function seedGlMarketPriceOverrides(fundIds: Record<string, number>, secIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('  Seeding gl_market_price_overrides...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.glMarketPriceOverrides);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  const fundId = fundIds['TBEF-001'];
  const secId = secIds['BDO'] ?? secIds['SM'] ?? Object.values(secIds)[0];
  const approver = userIds['bo_head'] ?? userIds['admin'];

  if (!fundId || !secId) { console.log('    Missing fund/security — skipping'); return; }

  await db.insert(schema.glMarketPriceOverrides).values({
    fund_id: fundId,
    security_id: secId,
    price_date: daysAgo(2),
    original_price: '148.50',
    override_price: '149.00',
    override_reason: 'PSE closing price delayed; using Bloomberg indicative close per RM confirmation',
    approved_by: approver,
    approved_at: new Date(),
    ...AUDIT,
  });
  console.log('    Inserted 1 price override record');
}

// ─── 4. UITF TER History ─────────────────────────────────────────────────────

async function seedUitfTerHistory(fundIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('  Seeding uitf_ter_history...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.uitfTerHistory);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  const computedBy = userIds['admin'] ?? 1;
  const terRecords = [
    // PHP Fixed Income Fund
    { fund_code: 'TBPF-001', period: '2025-Q4', total_expenses: '1250000', average_nav: '500000000', ter_pct: '0.25', breakdown: { management: 0.15, custodian: 0.05, audit: 0.03, others: 0.02 } },
    { fund_code: 'TBPF-001', period: '2026-Q1', total_expenses: '1375000', average_nav: '520000000', ter_pct: '0.26', breakdown: { management: 0.16, custodian: 0.05, audit: 0.03, others: 0.02 } },
    // Equity Growth Fund
    { fund_code: 'TBEF-001', period: '2025-Q4', total_expenses: '3750000', average_nav: '250000000', ter_pct: '1.50', breakdown: { management: 1.00, custodian: 0.10, trading: 0.25, audit: 0.10, others: 0.05 } },
    { fund_code: 'TBEF-001', period: '2026-Q1', total_expenses: '3900000', average_nav: '260000000', ter_pct: '1.50', breakdown: { management: 1.00, custodian: 0.10, trading: 0.25, audit: 0.10, others: 0.05 } },
    // Balanced Fund
    { fund_code: 'TBBF-001', period: '2025-Q4', total_expenses: '2000000', average_nav: '200000000', ter_pct: '1.00', breakdown: { management: 0.65, custodian: 0.08, trading: 0.15, audit: 0.07, others: 0.05 } },
    { fund_code: 'TBBF-001', period: '2026-Q1', total_expenses: '2100000', average_nav: '210000000', ter_pct: '1.00', breakdown: { management: 0.65, custodian: 0.08, trading: 0.15, audit: 0.07, others: 0.05 } },
    // Money Market Fund
    { fund_code: 'TBMF-001', period: '2025-Q4', total_expenses: '375000', average_nav: '300000000', ter_pct: '0.13', breakdown: { management: 0.08, custodian: 0.03, audit: 0.02 } },
    { fund_code: 'TBMF-001', period: '2026-Q1', total_expenses: '400000', average_nav: '320000000', ter_pct: '0.13', breakdown: { management: 0.08, custodian: 0.03, audit: 0.02 } },
  ];

  for (const t of terRecords) {
    const fundId = fundIds[t.fund_code];
    if (!fundId) continue;
    await db.insert(schema.uitfTerHistory).values({
      fund_id: fundId,
      period: t.period,
      total_expenses: t.total_expenses,
      average_nav: t.average_nav,
      ter_pct: t.ter_pct,
      breakdown: t.breakdown,
      computed_by: computedBy,
      ...AUDIT,
    });
  }
  console.log(`    Inserted ${terRecords.length} TER history records`);
}

// ─── 5. FX Deals ──────────────────────────────────────────────────────────────

async function seedFxDeals() {
  console.log('  Seeding fx_deals...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.fxDeals);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  const deals = [
    {
      deal_reference: 'FX-2026-0001',
      deal_type: 'SPOT',
      buy_currency: 'USD',
      sell_currency: 'PHP',
      buy_amount: '500000',
      sell_amount: '28250000',
      exchange_rate: '56.50',
      toap_rate: '56.45',
      value_date: daysAgo(5),
      deal_status: 'SETTLED',
      settlement_reference: 'STL-FX-001',
      ...AUDIT,
    },
    {
      deal_reference: 'FX-2026-0002',
      deal_type: 'SPOT',
      buy_currency: 'PHP',
      sell_currency: 'USD',
      buy_amount: '14130000',
      sell_amount: '250000',
      exchange_rate: '56.52',
      toap_rate: '56.50',
      value_date: daysAgo(3),
      deal_status: 'SETTLED',
      settlement_reference: 'STL-FX-002',
      ...AUDIT,
    },
    {
      deal_reference: 'FX-2026-0003',
      deal_type: 'FORWARD',
      buy_currency: 'USD',
      sell_currency: 'PHP',
      buy_amount: '1000000',
      sell_amount: '57000000',
      exchange_rate: '57.00',
      toap_rate: '56.55',
      value_date: daysAgo(-30), // 30 days in the future
      maturity_date: daysAgo(-30),
      deal_status: 'CONFIRMED',
      ...AUDIT,
    },
    {
      deal_reference: 'FX-2026-0004',
      deal_type: 'SPOT',
      buy_currency: 'EUR',
      sell_currency: 'PHP',
      buy_amount: '200000',
      sell_amount: '12320000',
      exchange_rate: '61.60',
      value_date: daysAgo(1),
      deal_status: 'CONFIRMED',
      ...AUDIT,
    },
    {
      deal_reference: 'FX-2026-0005',
      deal_type: 'SPOT',
      buy_currency: 'USD',
      sell_currency: 'PHP',
      buy_amount: '750000',
      sell_amount: '42412500',
      exchange_rate: '56.55',
      toap_rate: '56.50',
      value_date: TODAY,
      deal_status: 'PENDING',
      ...AUDIT,
    },
  ];

  for (const d of deals) {
    await db.insert(schema.fxDeals).values(d as any);
  }
  console.log(`    Inserted ${deals.length} FX deals`);
}

// ─── 6. Nostro Reconciliation ────────────────────────────────────────────────

async function seedNostroReconciliations(glHeadIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('  Seeding nostro_reconciliations...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.nostroReconciliations);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  // Use a cash/bank GL head
  const cashHeadId = glHeadIds['10100'] ?? glHeadIds['10200'] ?? Object.values(glHeadIds)[0];
  if (!cashHeadId) { console.log('    No GL head found — skipping'); return; }

  const reconciler = userIds['trust_officer_1'] ?? userIds['bo_maker'] ?? 1;

  const recons = [
    {
      gl_head_id: cashHeadId,
      recon_date: daysAgo(1),
      book_balance: '125000000.00',
      bank_balance: '125050000.00',
      difference: '50000.00',
      unmatched_items: [
        { ref: 'CHK-20260430-0042', amount: 30000, direction: 'BANK_ONLY' },
        { ref: 'TFR-20260430-0018', amount: 20000, direction: 'BANK_ONLY' },
      ],
      recon_status: 'EXCEPTION',
      ...AUDIT,
    },
    {
      gl_head_id: cashHeadId,
      recon_date: daysAgo(2),
      book_balance: '123500000.00',
      bank_balance: '123500000.00',
      difference: '0.00',
      unmatched_items: [],
      recon_status: 'MATCHED',
      reconciled_by: reconciler,
      reconciled_at: new Date(Date.now() - 2 * 86400000),
      ...AUDIT,
    },
    {
      gl_head_id: cashHeadId,
      recon_date: daysAgo(3),
      book_balance: '121200000.00',
      bank_balance: '121200000.00',
      difference: '0.00',
      unmatched_items: [],
      recon_status: 'MATCHED',
      reconciled_by: reconciler,
      reconciled_at: new Date(Date.now() - 3 * 86400000),
      ...AUDIT,
    },
  ];

  for (const r of recons) {
    await db.insert(schema.nostroReconciliations).values(r as any);
  }
  console.log(`    Inserted ${recons.length} nostro reconciliation records`);
}

// ─── 7. Knowledge Base ───────────────────────────────────────────────────────

async function seedKnowledgeBase() {
  console.log('  Seeding knowledge_base...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.knowledgeBase);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  const articles = [
    {
      title: 'How to Request a Portfolio Rebalancing',
      category: 'Portfolio Management',
      content: 'To request a portfolio rebalancing:\n\n1. Submit a Service Request of type "REVIEW_PORTFOLIO"\n2. Specify your target allocation (e.g., 60% equity, 30% fixed income, 10% cash)\n3. Your Trust Officer will review and execute the rebalancing within 3-5 business days\n4. A confirmation report will be sent once complete\n\nNote: Rebalancing may trigger capital gains tax events. Consult your Trust Officer for tax implications.',
      tags: ['portfolio', 'rebalancing', 'allocation'],
      is_published: true,
      view_count: 142,
      helpful_count: 89,
      ...AUDIT,
    },
    {
      title: 'Understanding UITF Fund Types',
      category: 'Products',
      content: 'TrustBank offers four UITF fund types:\n\n1. **Money Market Fund (TBMF-001)**: Low risk, invests in short-term government securities and deposits. Ideal for capital preservation.\n2. **Fixed Income Fund (TBPF-001)**: Moderate risk, invests in government and corporate bonds. Suitable for conservative investors.\n3. **Balanced Fund (TBBF-001)**: Medium risk, mix of equities and bonds. Good for moderate growth.\n4. **Equity Growth Fund (TBEF-001)**: Higher risk, primarily Philippine equities. Best for long-term growth.\n\nMinimum investment: PHP 10,000 for all funds.',
      tags: ['uitf', 'funds', 'investment', 'products'],
      is_published: true,
      view_count: 256,
      helpful_count: 178,
      ...AUDIT,
    },
    {
      title: 'How to Change Your Address or Contact Details',
      category: 'Account Maintenance',
      content: 'To update your address or contact details:\n\n1. Submit a Service Request of type "ADDRESS_CHANGE"\n2. Attach a valid government ID showing your new address, or a utility bill\n3. Updates are processed within 2 business days\n4. You will receive an SMS/email confirmation once the update is applied\n\nImportant: Changes to registered email or mobile number require additional verification.',
      tags: ['address', 'contact', 'update', 'kyc'],
      is_published: true,
      view_count: 198,
      helpful_count: 154,
      ...AUDIT,
    },
    {
      title: 'Withdrawal Process and Timeline',
      category: 'Transactions',
      content: 'Withdrawal requests are processed as follows:\n\n1. Submit withdrawal request via client portal or through your Trust Officer\n2. Trust Officer validates the request against your investment agreement\n3. Compliance review (same day for amounts under PHP 5M)\n4. Fund settlement: T+1 for money market, T+3 for bonds, T+5 for equities\n5. Proceeds credited to your designated bank account\n\nWithdrawal hierarchy: Income distributions are applied first, then principal. Early withdrawal penalties may apply per your trust agreement.',
      tags: ['withdrawal', 'redemption', 'settlement', 'timeline'],
      is_published: true,
      view_count: 312,
      helpful_count: 201,
      ...AUDIT,
    },
    {
      title: 'Annual Account Statement Request',
      category: 'Statements & Reports',
      content: 'Annual statements are automatically generated every January for the preceding calendar year.\n\nTo request an interim or special statement:\n1. Submit a Service Request of type "STATEMENT_REQUEST"\n2. Specify the period (from date — to date)\n3. Statements are generated within 2 business days\n4. Available for download via the client portal\n\nFormats available: PDF (default), Excel (upon request).',
      tags: ['statement', 'report', 'annual', 'download'],
      is_published: true,
      view_count: 167,
      helpful_count: 112,
      ...AUDIT,
    },
    {
      title: 'Corporate Actions: Dividends and Stock Splits',
      category: 'Corporate Actions',
      content: 'How corporate actions are processed:\n\n**Cash Dividends**: Automatically credited to your portfolio cash account on the payment date. Withholding tax is deducted per BIR regulations.\n\n**Stock Dividends**: Additional shares are credited to your position on the distribution date.\n\n**Stock Splits**: Your position quantity is adjusted automatically. No action required.\n\n**Rights Offerings**: Your Trust Officer will contact you to discuss participation options before the expiry date.\n\nAll corporate action notifications are sent via email and visible in your client portal.',
      tags: ['dividends', 'corporate-actions', 'splits', 'rights'],
      is_published: true,
      view_count: 89,
      helpful_count: 67,
      ...AUDIT,
    },
    {
      title: 'Risk Profile Assessment FAQ',
      category: 'Risk Profiling',
      content: 'Your risk profile determines suitable investment products:\n\n**When is it required?**: Before any new investment or at least once every 3 years.\n\n**How long does it take?**: The questionnaire takes approximately 10-15 minutes.\n\n**Can I change my risk profile?**: Yes, but a mismatch between your risk profile and current investments may trigger a suitability alert.\n\n**Who reviews it?**: Your assigned Trust Officer assesses the results. Profiles rated as AGGRESSIVE are reviewed by the supervisor.\n\n**What if I disagree?**: You may override with written acknowledgment, subject to supervisor approval.',
      tags: ['risk-profile', 'assessment', 'questionnaire', 'suitability'],
      is_published: true,
      view_count: 134,
      helpful_count: 98,
      ...AUDIT,
    },
    {
      title: 'Tax Compliance: FATCA and CRS Reporting',
      category: 'Compliance',
      content: 'TrustBank is required to comply with FATCA (US) and CRS (global) reporting:\n\n**FATCA**: If you are a US person (citizen, green card holder, or US tax resident), your account information is reported to the IRS via the BIR.\n\n**CRS**: If you are a tax resident of a CRS-participating jurisdiction other than the Philippines, your account details are reported to the relevant foreign tax authority.\n\n**What is reported?**: Account balance, income (dividends, interest), gross proceeds from sales.\n\n**Self-certification**: You must complete a self-certification form (W-8BEN or CRS form) upon account opening.\n\nFor questions, contact Compliance at compliance@trustbank.com.ph.',
      tags: ['fatca', 'crs', 'tax', 'compliance', 'reporting'],
      is_published: true,
      view_count: 76,
      helpful_count: 52,
      ...AUDIT,
    },
  ];

  for (const a of articles) {
    await db.insert(schema.knowledgeBase).values(a as any);
  }
  console.log(`    Inserted ${articles.length} knowledge base articles`);
}

// ─── 8. SR Tasks ──────────────────────────────────────────────────────────────

async function seedSrTasks(srIds: number[], userIds: Record<string, number>) {
  console.log('  Seeding sr_tasks...');

  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(schema.srTasks);
  if (Number(existing.count) > 0) { console.log('    Already seeded — skipping'); return; }

  if (srIds.length === 0) { console.log('    No service requests found — skipping'); return; }

  const to1 = userIds['trust_officer_1'] ?? 1;
  const to2 = userIds['trust_officer_2'] ?? 2;
  const checker = userIds['checker_1'] ?? userIds['bo_checker'] ?? 3;

  const tasks = [
    // Tasks for SR 1 (withdrawal request)
    { sr_id: srIds[0], task_title: 'Verify client withdrawal agreement terms', assigned_to: to1, task_status: 'COMPLETED', sort_order: 1, completed_at: new Date(Date.now() - 86400000), ...AUDIT },
    { sr_id: srIds[0], task_title: 'Check compliance pre-clearance', assigned_to: checker, task_status: 'COMPLETED', sort_order: 2, completed_at: new Date(Date.now() - 43200000), ...AUDIT },
    { sr_id: srIds[0], task_title: 'Execute partial withdrawal order', assigned_to: to1, task_status: 'IN_PROGRESS', sort_order: 3, ...AUDIT },
    { sr_id: srIds[0], task_title: 'Send client confirmation', assigned_to: to1, task_status: 'PENDING', sort_order: 4, due_date: new Date(Date.now() + 172800000), ...AUDIT },

    // Tasks for SR 2 (address change)
    { sr_id: srIds[1], task_title: 'Verify submitted government ID', assigned_to: to2, task_status: 'COMPLETED', sort_order: 1, completed_at: new Date(Date.now() - 172800000), ...AUDIT },
    { sr_id: srIds[1], task_title: 'Update client master record', assigned_to: to2, task_status: 'COMPLETED', sort_order: 2, completed_at: new Date(Date.now() - 86400000), ...AUDIT },
    { sr_id: srIds[1], task_title: 'Mail confirmation letter to new address', assigned_to: to2, task_status: 'PENDING', sort_order: 3, due_date: new Date(Date.now() + 86400000), ...AUDIT },
  ];

  // Add tasks for SR 3 if it exists
  if (srIds.length >= 3) {
    tasks.push(
      { sr_id: srIds[2], task_title: 'Review current portfolio allocation', assigned_to: to1, task_status: 'COMPLETED', sort_order: 1, completed_at: new Date(Date.now() - 259200000), ...AUDIT },
      { sr_id: srIds[2], task_title: 'Prepare rebalancing proposal', assigned_to: to1, task_status: 'IN_PROGRESS', sort_order: 2, ...AUDIT } as any,
      { sr_id: srIds[2], task_title: 'Obtain client consent for rebalancing', assigned_to: to1, task_status: 'PENDING', sort_order: 3, due_date: new Date(Date.now() + 259200000), ...AUDIT },
      { sr_id: srIds[2], task_title: 'Execute rebalancing trades', assigned_to: checker, task_status: 'PENDING', sort_order: 4, due_date: new Date(Date.now() + 432000000), ...AUDIT },
    );
  }

  for (const t of tasks) {
    await db.insert(schema.srTasks).values(t as any);
  }
  console.log(`    Inserted ${tasks.length} SR sub-tasks`);
}

// ─── 9. Client Portal Users ───────────────────────────────────────────────────

async function seedClientPortalUsers() {
  console.log('  Seeding client portal users...');

  const portalUsers = [
    { username: 'client_reyes', full_name: 'Eduardo Reyes', email: 'ereyes@client.trustoms.local', client_id: 'CLT-001' },
    { username: 'client_lim', full_name: 'Catherine Lim-Ong', email: 'clim@client.trustoms.local', client_id: 'CLT-002' },
    { username: 'client_dmci', full_name: 'DMCI Trust Admin', email: 'trust@dmci.com.ph', client_id: 'CLT-003' },
  ];

  let created = 0;
  for (const pu of portalUsers) {
    const [ex] = await db.select().from(schema.users).where(eq(schema.users.username, pu.username)).limit(1);
    if (ex) continue;
    await db.insert(schema.users).values({
      username: pu.username,
      password_hash: PASSWORD_HASH,
      full_name: pu.full_name,
      email: pu.email,
      role: 'bo_maker', // Portal access determined by client_id presence
      department: 'Client',
      office: 'Portal',
      client_id: pu.client_id,
    } as any);
    created++;
  }
  console.log(`    Created ${created} client portal users (${portalUsers.length - created} already existed)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function seedGapClosureData() {
  console.log('\n[seed-gap-closure-data] Seeding demo data for gap-closure tables...');

  const fundIds = await getFundIds();
  const glHeadIds = await getGlHeadIds();
  const userIds = await getUserIds();
  const secIds = await getSecurityIds();
  const srIds = await getSrIds();

  console.log(`  Found: ${Object.keys(fundIds).length} funds, ${Object.keys(glHeadIds).length} GL heads, ${Object.keys(userIds).length} users, ${Object.keys(secIds).length} securities, ${srIds.length} SRs`);

  await seedGlChargeSetup(fundIds, glHeadIds);
  await seedGlValuationParameters(fundIds);
  await seedGlMarketPriceOverrides(fundIds, secIds, userIds);
  await seedUitfTerHistory(fundIds, userIds);
  await seedFxDeals();
  await seedNostroReconciliations(glHeadIds, userIds);
  await seedKnowledgeBase();
  await seedSrTasks(srIds, userIds);
  await seedClientPortalUsers();

  console.log('[seed-gap-closure-data] Done.\n');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedGapClosureData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FATAL] seed-gap-closure-data failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
