#!/usr/bin/env tsx
/**
 * seed-demo-supplement.ts — Bulk up thin tables for demo readiness
 *
 * Adds realistic volume to operational, GL, fee, compliance, and EOD tables
 * that were seeded with only 1 record by seed-group-c.
 *
 * Idempotent: checks count before inserting. Safe to run multiple times.
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { db } from '../db';
import * as s from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

const SYSTEM = 'seed-supplement';
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]) => arr[rand(0, arr.length - 1)];

async function count(table: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
}

// ─── Refs ───────────────────────────────────────────────────────────────────
async function loadRefs() {
  const portfolios = await db.select().from(s.portfolios).limit(11);
  const securities = await db.select().from(s.securities).limit(16);
  const clients = await db.select().from(s.clients).limit(10);
  const users = await db.select().from(s.users).limit(15);
  const glHeads = await db.select().from(s.glHeads).limit(20);
  return { portfolios, securities, clients, users, glHeads };
}

// ─── Orders & Trades ────────────────────────────────────────────────────────
async function seedOrders(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.orders);
  if (existing >= 25) { console.log(`  orders: ${existing} (sufficient)`); return; }

  const needed = 30 - existing;
  const statuses = ['DRAFT', 'PENDING_AUTH', 'AUTHORIZED', 'PLACED', 'FILLED', 'CONFIRMED', 'SETTLED', 'CANCELLED'] as const;
  const sides = ['BUY', 'SELL'] as const;
  const orderTypes = ['MARKET', 'LIMIT', 'STOP'] as const;

  for (let i = 0; i < needed; i++) {
    const sec = pick(refs.securities);
    const ptf = pick(refs.portfolios);
    const status = pick([...statuses]);
    const qty = rand(100, 10000);
    const price = parseFloat((rand(50, 5000) + Math.random()).toFixed(2));
    const ordId = `ORD-SUP-${String(existing + i + 1).padStart(3, '0')}`;
    await db.insert(s.orders).values({
      order_id: ordId,
      portfolio_id: ptf.portfolio_id,
      security_id: sec.id,
      type: pick([...orderTypes]),
      side: pick([...sides]),
      quantity: qty.toString(),
      limit_price: price.toString(),
      order_status: status,
      value_date: daysAgo(rand(1, 60)),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  orders: ${existing} → ${existing + needed}`);
}

async function seedTrades(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.trades);
  if (existing >= 15) { console.log(`  trades: ${existing} (sufficient)`); return; }

  const needed = 20 - existing;
  const statuses = ['EXECUTED', 'SETTLED', 'CANCELLED'] as const;

  for (let i = 0; i < needed; i++) {
    const sec = pick(refs.securities);
    const ptf = pick(refs.portfolios);
    const qty = rand(100, 5000);
    const price = parseFloat((rand(50, 5000) + Math.random()).toFixed(2));
    const trdId = `TRD-SUP-${String(existing + i + 1).padStart(3, '0')}`;
    await db.insert(s.trades).values({
      trade_id: trdId,
      portfolio_id: ptf.portfolio_id,
      security_id: sec.id,
      side: pick(['BUY', 'SELL']),
      quantity: qty.toString(),
      price: price.toString(),
      trade_date: daysAgo(rand(1, 60)),
      settlement_date: daysAgo(rand(0, 57)),
      trade_status: pick([...statuses]),
      broker_id: rand(1, 3),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  trades: ${existing} → ${existing + needed}`);
}

// ─── Withdrawals & Transfers ────────────────────────────────────────────────
async function seedWithdrawals(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.withdrawals);
  if (existing >= 5) { console.log(`  withdrawals: ${existing} (sufficient)`); return; }

  const needed = 8 - existing;
  const statuses = ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'] as const;

  for (let i = 0; i < needed; i++) {
    const ptf = pick(refs.portfolios);
    const clt = pick(refs.clients);
    await db.insert(s.withdrawals).values({
      portfolio_id: ptf.portfolio_id,
      client_id: clt.client_id,
      amount: (rand(50000, 5000000)).toString(),
      currency: 'PHP',
      withdrawal_type: pick(['FULL', 'PARTIAL']),
      withdrawal_status: pick([...statuses]),
      requested_date: daysAgo(rand(1, 45)),
      bank_account: `BDO-${rand(1000, 9999)}-${rand(100000, 999999)}`,
      reason: pick(['Living expenses', 'Education', 'Real estate', 'Emergency fund', 'Reinvestment']),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  withdrawals: ${existing} → ${existing + needed}`);
}

async function seedTransfers(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.transfers);
  if (existing >= 4) { console.log(`  transfers: ${existing} (sufficient)`); return; }

  const needed = 6 - existing;
  const statuses = ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'] as const;

  for (let i = 0; i < needed; i++) {
    const from = refs.portfolios[rand(0, 4)];
    const to = refs.portfolios[rand(5, 10)];
    await db.insert(s.transfers).values({
      from_portfolio_id: from.portfolio_id,
      to_portfolio_id: to.portfolio_id,
      transfer_type: pick(['IN_SPECIE', 'CASH']),
      amount: (rand(100000, 10000000)).toString(),
      currency: 'PHP',
      transfer_status: pick([...statuses]),
      transfer_date: daysAgo(rand(1, 30)),
      reason: pick(['Portfolio consolidation', 'Client request', 'Rebalancing', 'Maturity rollover']),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  transfers: ${existing} → ${existing + needed}`);
}

// ─── Fee Management ─────────────────────────────────────────────────────────
async function seedFeeInvoices(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.feeInvoices);
  if (existing >= 8) { console.log(`  fee_invoices: ${existing} (sufficient)`); return; }

  const needed = 12 - existing;
  const statuses = ['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED'] as const;

  for (let i = 0; i < needed; i++) {
    const ptf = pick(refs.portfolios);
    const month = rand(1, 12);
    await db.insert(s.feeInvoices).values({
      portfolio_id: ptf.portfolio_id,
      invoice_number: `INV-2026-${String(existing + i + 1).padStart(4, '0')}`,
      invoice_date: new Date(2026, month - 1, 1),
      due_date: new Date(2026, month - 1, 28),
      total_amount: (rand(5000, 500000)).toString(),
      currency: 'PHP',
      invoice_status: pick([...statuses]),
      period_from: new Date(2026, month - 2, 1),
      period_to: new Date(2026, month - 1, 0),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  fee_invoices: ${existing} → ${existing + needed}`);
}

async function seedFeeAccruals(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.feeAccruals);
  if (existing >= 8) { console.log(`  fee_accruals: ${existing} (sufficient)`); return; }

  const needed = 12 - existing;
  for (let i = 0; i < needed; i++) {
    const ptf = pick(refs.portfolios);
    await db.insert(s.feeAccruals).values({
      portfolio_id: ptf.portfolio_id,
      fee_type: pick(['TRUSTEE', 'MANAGEMENT', 'CUSTODY']),
      accrual_date: daysAgo(rand(1, 90)),
      amount: (rand(1000, 100000)).toString(),
      currency: 'PHP',
      accrual_status: pick(['ACCRUED', 'POSTED', 'REVERSED']),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  fee_accruals: ${existing} → ${existing + needed}`);
}

async function seedFeeSchedules(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.feeSchedules);
  if (existing >= 5) { console.log(`  fee_schedules: ${existing} (sufficient)`); return; }

  const needed = Math.min(8, refs.portfolios.length) - existing;
  for (let i = 0; i < needed; i++) {
    const ptf = refs.portfolios[existing + i];
    if (!ptf) break;
    await db.insert(s.feeSchedules).values({
      portfolio_id: ptf.portfolio_id,
      fee_type: pick(['TRUSTEE', 'MANAGEMENT', 'CUSTODY']),
      rate: (rand(10, 200) / 100).toString(),
      rate_type: pick(['PERCENTAGE', 'FLAT']),
      frequency: pick(['MONTHLY', 'QUARTERLY', 'ANNUALLY']),
      effective_from: new Date(2026, 0, 1),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  fee_schedules: ${existing} → ${existing + needed}`);
}

async function seedDisputes() {
  const existing = await count(s.disputes);
  if (existing >= 3) { console.log(`  disputes: ${existing} (sufficient)`); return; }
  const invoices = await db.select().from(s.tfpInvoices).limit(10);
  if (invoices.length === 0) { console.log(`  disputes: no invoices to reference`); return; }
  const needed = 5 - existing;
  for (let i = 0; i < needed; i++) {
    await db.insert(s.disputes).values({
      invoice_id: pick(invoices).id,
      raised_by: pick(['CLT-001', 'CLT-002', 'CLT-003']),
      reason: pick([
        'Client disputes trustee fee calculation for Q1',
        'Rate mismatch between contract and invoice',
        'Billing error on custody fee for March',
        'Performance fee calculation methodology disagreement',
        'Incorrect AUM base used for management fee',
      ]),
      dispute_status: pick(['OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED']),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  disputes: ${existing} → ${existing + needed}`);
}

// ─── GL Transactions ────────────────────────────────────────────────────────
async function seedGlJournals(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.glJournalBatches);
  if (existing >= 8) { console.log(`  gl_journal_batches: ${existing} (sufficient)`); return; }

  const [acctUnit] = await db.select().from(s.accountingUnits).limit(1);
  if (!acctUnit) { console.log(`  gl_journal_batches: no accounting unit`); return; }

  const needed = 10 - existing;
  const statuses = ['DRAFT', 'PENDING_AUTH', 'AUTHORIZED', 'POSTED', 'REVERSED'] as const;

  for (let i = 0; i < needed; i++) {
    const day = daysAgo(rand(1, 90));
    const amt = rand(10000, 5000000);
    const [batch] = await db.insert(s.glJournalBatches).values({
      batch_ref: `JNL-2026-${String(existing + i + 1).padStart(4, '0')}`,
      source_system: 'TRUSTOMS',
      posting_mode: pick(['MANUAL', 'BATCH', 'EOD']),
      accounting_unit_id: acctUnit.id,
      transaction_date: day,
      value_date: day,
      batch_status: pick([...statuses]),
      total_debit: amt.toString(),
      total_credit: amt.toString(),
      narration: pick([
        'Monthly fee accrual posting',
        'Interest income recognition',
        'Dividend receipt posting',
        'FX revaluation adjustment',
        'NAV computation posting',
        'Settlement cash movement',
      ]),
      maker_id: pick(refs.users).id,
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).returning();

    // Add 2-4 journal lines per batch
    const lines = rand(2, 4);
    const headIds = refs.glHeads.map(h => h.id);
    for (let j = 0; j < lines; j++) {
      const lineAmt = (rand(5000, 2000000)).toString();
      await db.insert(s.glJournalLines).values({
        batch_id: batch.id,
        line_no: j + 1,
        gl_head_id: pick(headIds),
        dr_cr: j % 2 === 0 ? 'DR' : 'CR',
        amount: lineAmt,
        currency: 'PHP',
        base_currency: 'PHP',
        base_amount: lineAmt,
      } as any).onConflictDoNothing();
    }
  }
  console.log(`  gl_journal_batches: ${existing} → ${existing + needed} (with lines)`);
}

// ─── EOD & Reconciliation ───────────────────────────────────────────────────
async function seedEodRuns() {
  const existing = await count(s.eodRuns);
  if (existing >= 8) { console.log(`  eod_runs: ${existing} (sufficient)`); return; }

  const needed = 14 - existing;
  for (let i = 0; i < needed; i++) {
    const day = daysAgo(needed - i);
    const status = i < needed - 2 ? 'COMPLETED' : pick(['RUNNING', 'COMPLETED', 'FAILED']);
    const [run] = await db.insert(s.eodRuns).values({
      run_date: day,
      eod_status: status,
      started_at: day,
      completed_at: status === 'RUNNING' ? null : new Date(day.getTime() + rand(60, 600) * 1000),
      total_jobs: rand(8, 15),
      completed_jobs: status === 'COMPLETED' ? rand(8, 15) : rand(3, 7),
      failed_jobs: status === 'FAILED' ? rand(1, 3) : 0,
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).returning();

    // Add 3-5 jobs per run
    const jobNames = ['PRICING_UPDATE', 'NAV_COMPUTATION', 'FEE_ACCRUAL', 'COMPLIANCE_CHECK',
      'POSITION_RECON', 'CASH_RECON', 'FX_REVALUATION', 'REPORT_GENERATION'];
    const jobCount = rand(3, 5);
    for (let j = 0; j < jobCount; j++) {
      await db.insert(s.eodJobs).values({
        eod_run_id: run.id,
        job_name: jobNames[j],
        job_status: j < jobCount - 1 ? 'COMPLETED' : pick(['COMPLETED', 'FAILED']),
        started_at: day,
        completed_at: new Date(day.getTime() + rand(10, 120) * 1000),
        records_processed: rand(10, 500),
        created_by: SYSTEM, updated_by: SYSTEM,
      } as any).onConflictDoNothing();
    }
  }
  console.log(`  eod_runs: ${existing} → ${existing + needed} (with jobs)`);
}

async function seedReconRuns() {
  const existing = await count(s.reconRuns);
  if (existing >= 4) { console.log(`  recon_runs: ${existing} (sufficient)`); return; }

  const needed = 7 - existing;
  for (let i = 0; i < needed; i++) {
    const day = daysAgo(rand(1, 30));
    const [run] = await db.insert(s.reconRuns).values({
      type: pick(['POSITION', 'CASH', 'NAV', 'TRADE']),
      run_date: day,
      recon_status: pick(['COMPLETED', 'FAILED', 'RUNNING']),
      total_records: rand(50, 500),
      matched_records: rand(40, 490),
      breaks_found: rand(0, 10),
      started_at: day,
      completed_at: new Date(day.getTime() + rand(30, 300) * 1000),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).returning();

    const breakCount = rand(1, 3);
    for (let j = 0; j < breakCount; j++) {
      await db.insert(s.reconBreaks).values({
        run_id: run.id,
        type: pick(['QUANTITY_MISMATCH', 'PRICE_MISMATCH', 'MISSING_RECORD', 'SETTLEMENT_DIFF']),
        break_status: pick(['OPEN', 'INVESTIGATING', 'RESOLVED', 'ESCALATED']),
        internal_value: (rand(1000, 100000)).toString(),
        external_value: (rand(1000, 100000)).toString(),
        difference: rand(1, 5000),
        created_by: SYSTEM, updated_by: SYSTEM,
      } as any).onConflictDoNothing();
    }
  }
  console.log(`  recon_runs: ${existing} → ${existing + needed} (with breaks)`);
}

// ─── Compliance & Risk ──────────────────────────────────────────────────────
async function seedComplianceBreaches(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.complianceBreaches);
  if (existing >= 5) { console.log(`  compliance_breaches: ${existing} (sufficient)`); return; }

  const needed = 8 - existing;
  const statuses = ['OPEN', 'INVESTIGATING', 'REMEDIATED', 'ESCALATED', 'CLOSED'] as const;

  for (let i = 0; i < needed; i++) {
    const ptf = pick(refs.portfolios);
    await db.insert(s.complianceBreaches).values({
      portfolio_id: ptf.portfolio_id,
      rule_id: rand(1, 5),
      breach_type: pick(['CONCENTRATION', 'SECTOR_LIMIT', 'COUNTERPARTY', 'MANDATE', 'REGULATORY']),
      severity: pick(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      breach_status: pick([...statuses]),
      breach_date: daysAgo(rand(1, 60)),
      actual_value: (rand(10, 50)).toString(),
      limit_value: (rand(5, 25)).toString(),
      description: pick([
        'Single name concentration exceeds 10% limit',
        'Sector exposure to financials at 32% (limit 30%)',
        'Counterparty exposure to BDO exceeds threshold',
        'Mandate deviation: equity allocation above band',
        'Regulatory limit: government bond minimum not met',
      ]),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  compliance_breaches: ${existing} → ${existing + needed}`);
}

async function seedSurveillanceAlerts(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.tradeSurveillanceAlerts);
  if (existing >= 4) { console.log(`  trade_surveillance_alerts: ${existing} (sufficient)`); return; }

  const needed = 8 - existing;
  for (let i = 0; i < needed; i++) {
    await db.insert(s.tradeSurveillanceAlerts).values({
      alert_type: pick(['FRONT_RUNNING', 'CHURNING', 'WASH_TRADE', 'INSIDER_TRADING', 'SPOOFING']),
      alert_status: pick(['NEW', 'INVESTIGATING', 'ESCALATED', 'CLEARED', 'CONFIRMED']),
      severity: pick(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      portfolio_id: pick(refs.portfolios).portfolio_id,
      security_id: pick(refs.securities).id,
      description: pick([
        'Unusual trading pattern detected: multiple rapid buy-sell cycles',
        'Trade executed shortly before material announcement',
        'Cross-trade between related accounts flagged',
        'Large block trade at market close — potential window dressing',
        'Order pattern suggests layering/spoofing behavior',
      ]),
      detected_at: daysAgo(rand(1, 30)),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  trade_surveillance_alerts: ${existing} → ${existing + needed}`);
}

async function seedOreEvents() {
  const existing = await count(s.oreEvents);
  if (existing >= 4) { console.log(`  ore_events: ${existing} (sufficient)`); return; }

  const needed = 6 - existing;
  for (let i = 0; i < needed; i++) {
    await db.insert(s.oreEvents).values({
      event_type: pick(['PROCESS_FAILURE', 'SYSTEM_ERROR', 'HUMAN_ERROR', 'VENDOR_ISSUE', 'DATA_QUALITY']),
      event_status: pick(['OPEN', 'INVESTIGATING', 'MITIGATED', 'CLOSED']),
      severity: pick(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      description: pick([
        'EOD batch job failed due to database timeout',
        'Incorrect NAV published to client portal for 2 hours',
        'Manual trade entry with wrong quantity — reversed',
        'Pricing feed vendor delivered stale prices',
        'Settlement instruction sent to wrong custodian',
        'Duplicate trade execution due to system retry',
      ]),
      financial_impact: (rand(0, 500000)).toString(),
      event_date: daysAgo(rand(1, 60)),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  ore_events: ${existing} → ${existing + needed}`);
}

async function seedWhistleblowerCases() {
  const existing = await count(s.whistleblowerCases);
  if (existing >= 3) { console.log(`  whistleblower_cases: ${existing} (sufficient)`); return; }

  const needed = 4 - existing;
  for (let i = 0; i < needed; i++) {
    await db.insert(s.whistleblowerCases).values({
      case_reference: `WB-2026-${String(existing + i + 1).padStart(3, '0')}`,
      case_status: pick(['RECEIVED', 'INVESTIGATING', 'ESCALATED', 'CLOSED']),
      category: pick(['FRAUD', 'MISCONDUCT', 'POLICY_VIOLATION', 'CONFLICT_OF_INTEREST']),
      description: pick([
        'Report of unauthorized trading activity',
        'Suspected favoritism in client allocation',
        'Allegation of personal account front-running',
        'Concern about undisclosed conflict of interest',
      ]),
      severity: pick(['LOW', 'MEDIUM', 'HIGH']),
      received_date: daysAgo(rand(5, 90)),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  whistleblower_cases: ${existing} → ${existing + needed}`);
}

// ─── Audit & Notifications ──────────────────────────────────────────────────
async function seedAuditRecords(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.auditRecords);
  if (existing >= 15) { console.log(`  audit_records: ${existing} (sufficient)`); return; }

  const needed = 25 - existing;
  for (let i = 0; i < needed; i++) {
    const user = pick(refs.users);
    await db.insert(s.auditRecords).values({
      action: pick(['CREATE', 'UPDATE', 'DELETE', 'AUTHORIZE', 'REJECT', 'LOGIN', 'EXPORT']),
      entity_type: pick(['ORDER', 'TRADE', 'CLIENT', 'PORTFOLIO', 'FEE_INVOICE', 'COMPLIANCE_RULE', 'USER']),
      entity_id: String(rand(1, 100)),
      actor_id: String(user.id),
      actor_role: user.role || 'rm',
      ip_address: `10.0.${rand(1, 254)}.${rand(1, 254)}`,
      changes: { field: pick(['status', 'amount', 'quantity', 'rate']), old: 'PENDING', new: 'APPROVED' },
    } as any).onConflictDoNothing();
  }
  console.log(`  audit_records: ${existing} → ${existing + needed}`);
}

async function seedNotificationLog(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.notificationLog);
  if (existing >= 15) { console.log(`  notification_log: ${existing} (sufficient)`); return; }

  const needed = 20 - existing;
  for (let i = 0; i < needed; i++) {
    await db.insert(s.notificationLog).values({
      user_id: pick(refs.users).id,
      channel: pick(['EMAIL', 'SMS', 'IN_APP', 'PUSH']),
      notification_type: pick(['ORDER_APPROVED', 'COMPLIANCE_BREACH', 'FEE_INVOICE', 'KYC_EXPIRY', 'MEETING_REMINDER']),
      subject: pick([
        'Order ORD-2026-0015 approved',
        'Compliance breach detected: concentration limit',
        'Fee invoice INV-2026-0003 generated',
        'KYC review due in 30 days',
        'Meeting with client tomorrow at 10:00 AM',
      ]),
      delivery_status: pick(['SENT', 'DELIVERED', 'FAILED', 'PENDING']),
      sent_at: daysAgo(rand(0, 30)),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  notification_log: ${existing} → ${existing + needed}`);
}

// ─── Reversals & Tax ────────────────────────────────────────────────────────
async function seedReversals(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.reversalCases);
  if (existing >= 3) { console.log(`  reversal_cases: ${existing} (sufficient)`); return; }

  const needed = 5 - existing;
  for (let i = 0; i < needed; i++) {
    await db.insert(s.reversalCases).values({
      reversal_reference: `REV-2026-${String(existing + i + 1).padStart(3, '0')}`,
      reversal_type: pick(['TRADE', 'FEE', 'CONTRIBUTION', 'WITHDRAWAL']),
      reversal_status: pick(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED']),
      original_reference: `TXN-2026-${String(rand(1, 100)).padStart(4, '0')}`,
      amount: (rand(5000, 500000)).toString(),
      currency: 'PHP',
      reason: pick([
        'Duplicate execution — client requested reversal',
        'Incorrect amount entered — correcting',
        'Wrong security — fat finger error',
        'Client changed withdrawal instructions',
        'Fee calculation error — rebilling',
      ]),
      requested_by: pick(refs.users).id,
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  reversal_cases: ${existing} → ${existing + needed}`);
}

async function seedTaxEvents(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.taxEvents);
  if (existing >= 4) { console.log(`  tax_events: ${existing} (sufficient)`); return; }

  const trades = await db.select().from(s.trades).limit(20);
  const needed = 8 - existing;
  for (let i = 0; i < needed; i++) {
    const ptf = pick(refs.portfolios);
    await db.insert(s.taxEvents).values({
      trade_id: trades.length > 0 ? pick(trades).trade_id : null,
      portfolio_id: ptf.portfolio_id,
      tax_type: pick(['WHT', 'FATCA', 'CRS']),
      gross_amount: (rand(10000, 1000000)).toString(),
      tax_rate: pick(['0.25', '0.15', '0.10', '0.12', '0.02']),
      tax_amount: (rand(1000, 200000)).toString(),
      filing_status: pick(['DRAFT', 'FILED', 'PAID']),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  tax_events: ${existing} → ${existing + needed}`);
}

// ─── Sanctions & Reports ────────────────────────────────────────────────────
async function seedSanctionsLog(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.sanctionsScreeningLog);
  if (existing >= 4) { console.log(`  sanctions_screening_log: ${existing} (sufficient)`); return; }

  const needed = 8 - existing;
  for (let i = 0; i < needed; i++) {
    const clt = pick(refs.clients);
    await db.insert(s.sanctionsScreeningLog).values({
      entity_type: 'CLIENT',
      entity_id: clt.client_id,
      provider: pick(['WORLDCHECK', 'DOWJONES', 'OFAC']),
      screened_name: clt.client_id,
      hit_count: rand(0, 3),
      screening_status: pick(['CLEAR', 'HIT', 'FALSE_POSITIVE', 'PENDING']),
      created_by: SYSTEM, updated_by: SYSTEM,
    } as any).onConflictDoNothing();
  }
  console.log(`  sanctions_screening_log: ${existing} → ${existing + needed}`);
}

async function seedReportLog(refs: Awaited<ReturnType<typeof loadRefs>>) {
  const existing = await count(s.reportGenerationLog);
  if (existing >= 4) { console.log(`  report_generation_log: ${existing} (sufficient)`); return; }

  const needed = 8 - existing;
  for (let i = 0; i < needed; i++) {
    await db.insert(s.reportGenerationLog).values({
      report_type: pick(['PORTFOLIO_VALUATION', 'COMPLIANCE_SUMMARY', 'FEE_BILLING', 'FRPTI', 'CLIENT_STATEMENT', 'NAV_REPORT']),
      generated_by: pick(refs.users).id,
      generated_at: daysAgo(rand(0, 60)),
      row_count: rand(10, 500),
      retention_until: new Date(2027, 11, 31),
    } as any).onConflictDoNothing();
  }
  console.log(`  report_generation_log: ${existing} → ${existing + needed}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
export async function seedDemoSupplement() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TrustOMS — Demo Data Supplement                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const refs = await loadRefs();
  console.log(`  Loaded: ${refs.portfolios.length} portfolios, ${refs.securities.length} securities, ${refs.clients.length} clients, ${refs.users.length} users, ${refs.glHeads.length} GL heads\n`);

  const seeders: [string, () => Promise<void>][] = [
    ['orders', () => seedOrders(refs)],
    ['trades', () => seedTrades(refs)],
    ['withdrawals', () => seedWithdrawals(refs)],
    ['transfers', () => seedTransfers(refs)],
    ['fee_invoices', () => seedFeeInvoices(refs)],
    ['fee_accruals', () => seedFeeAccruals(refs)],
    ['fee_schedules', () => seedFeeSchedules(refs)],
    ['disputes', () => seedDisputes()],
    ['gl_journals', () => seedGlJournals(refs)],
    ['eod_runs', () => seedEodRuns()],
    ['recon_runs', () => seedReconRuns()],
    ['compliance_breaches', () => seedComplianceBreaches(refs)],
    ['surveillance_alerts', () => seedSurveillanceAlerts(refs)],
    ['ore_events', () => seedOreEvents()],
    ['whistleblower_cases', () => seedWhistleblowerCases()],
    ['reversals', () => seedReversals(refs)],
    ['tax_events', () => seedTaxEvents(refs)],
    ['audit_records', () => seedAuditRecords(refs)],
    ['notification_log', () => seedNotificationLog(refs)],
    ['sanctions_log', () => seedSanctionsLog(refs)],
    ['report_log', () => seedReportLog(refs)],
  ];

  const failures: string[] = [];
  for (const [name, fn] of seeders) {
    try { await fn(); } catch (e: any) { console.error(`  [FAIL] ${name}: ${e.message?.slice(0, 200)}`); failures.push(name); }
  }
  if (failures.length > 0) console.log(`\n  [WARN] ${failures.length} seeder(s) failed: ${failures.join(', ')}`);

  console.log('\n  [DONE] Demo supplement seeding complete.\n');
}

// ─── Entry point ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemoSupplement()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FATAL]', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
