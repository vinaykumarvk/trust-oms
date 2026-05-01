/**
 * seed-loan-data.ts — Corporate Trust / Loan Management Demo Data
 *
 * Seeds sample loan facilities, payments, amortization schedules,
 * collaterals, MPCs, documents, amendments, and receivables.
 */

import 'dotenv/config';
import { db } from '../db';
import * as s from '@shared/schema';
import { sql } from 'drizzle-orm';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export async function seedLoanData() {
  console.log('\n=== Seeding Corporate Trust / Loan Management Data ===\n');

  // ── 1. Loan Facilities ────────────────────────────────────────────────────
  const facilities = [
    {
      facility_id: 'LF-2026-0001',
      facility_name: 'SM Prime Holdings Term Loan',
      loan_type: 'TERM_LOAN' as const,
      loan_status: 'ACTIVE' as const,
      currency: 'PHP',
      facility_amount: '5000000000.0000',
      outstanding_principal: '3750000000.0000',
      available_amount: '0.0000',
      disbursed_amount: '5000000000.0000',
      interest_type: 'FIXED' as const,
      interest_rate: '6.500000',
      interest_basis: 'ACT_360' as const,
      amortization_type: 'EQUAL_AMORTIZATION' as const,
      payment_frequency: 'QUARTERLY' as const,
      effective_date: '2025-01-15',
      maturity_date: '2030-01-15',
      first_payment_date: '2025-04-15',
      next_payment_date: '2026-07-15',
      penalty_rate: '3.000000',
      pretermination_penalty_rate: '2.000000',
      pretermination_penalty_type: 'PERCENTAGE',
      grace_period_days: 5,
      trustee_role: 'TRUSTEE',
      purpose: 'Expansion of SM retail malls in Visayas and Mindanao',
      maker_checker_status: 'APPROVED',
    },
    {
      facility_id: 'LF-2026-0002',
      facility_name: 'Ayala Land Revolving Credit Facility',
      loan_type: 'REVOLVING_CREDIT' as const,
      loan_status: 'ACTIVE' as const,
      currency: 'PHP',
      facility_amount: '2000000000.0000',
      outstanding_principal: '800000000.0000',
      available_amount: '1200000000.0000',
      disbursed_amount: '800000000.0000',
      interest_type: 'FLOATING' as const,
      interest_rate: '5.750000',
      spread: '1.500000',
      benchmark_rate: 'BVAL-91D',
      interest_basis: 'ACT_365' as const,
      amortization_type: 'BULLET' as const,
      payment_frequency: 'MONTHLY' as const,
      repricing_frequency: 'QUARTERLY' as const,
      effective_date: '2025-06-01',
      maturity_date: '2028-06-01',
      next_payment_date: '2026-06-01',
      next_repricing_date: '2026-09-01',
      trustee_role: 'FACILITY_AGENT',
      purpose: 'Working capital for real estate development pipeline',
      maker_checker_status: 'APPROVED',
    },
    {
      facility_id: 'LF-2026-0003',
      facility_name: 'DMCI Holdings Project Finance',
      loan_type: 'PROJECT_FINANCE' as const,
      loan_status: 'ACTIVE' as const,
      currency: 'PHP',
      facility_amount: '10000000000.0000',
      outstanding_principal: '9500000000.0000',
      available_amount: '0.0000',
      disbursed_amount: '10000000000.0000',
      interest_type: 'FIXED' as const,
      interest_rate: '7.250000',
      interest_basis: '30_360' as const,
      amortization_type: 'EQUAL_PRINCIPAL' as const,
      payment_frequency: 'SEMI_ANNUAL' as const,
      effective_date: '2024-03-01',
      maturity_date: '2034-03-01',
      next_payment_date: '2026-09-01',
      syndication_flag: true,
      number_of_participants: 5,
      trustee_role: 'COLLATERAL_AGENT',
      purpose: 'DMCI Semirara mining and power generation expansion',
      maker_checker_status: 'APPROVED',
    },
    {
      facility_id: 'LF-2026-0004',
      facility_name: 'JG Summit Syndicated Loan',
      loan_type: 'SYNDICATED_LOAN' as const,
      loan_status: 'ACTIVE' as const,
      currency: 'PHP',
      facility_amount: '8000000000.0000',
      outstanding_principal: '6400000000.0000',
      available_amount: '0.0000',
      disbursed_amount: '8000000000.0000',
      interest_type: 'FLOATING' as const,
      interest_rate: '6.250000',
      spread: '2.000000',
      benchmark_rate: 'TBILL-364D',
      interest_basis: 'ACT_360' as const,
      amortization_type: 'EQUAL_AMORTIZATION' as const,
      payment_frequency: 'QUARTERLY' as const,
      repricing_frequency: 'SEMI_ANNUAL' as const,
      effective_date: '2024-06-15',
      maturity_date: '2031-06-15',
      next_payment_date: '2026-06-15',
      syndication_flag: true,
      number_of_participants: 8,
      trustee_role: 'TRUSTEE',
      maker_checker_status: 'APPROVED',
    },
    {
      facility_id: 'LF-2026-0005',
      facility_name: 'Metro Pacific Mortgage Loan',
      loan_type: 'MORTGAGE_LOAN' as const,
      loan_status: 'DRAFT' as const,
      currency: 'PHP',
      facility_amount: '3000000000.0000',
      outstanding_principal: '0.0000',
      available_amount: '3000000000.0000',
      disbursed_amount: '0.0000',
      interest_type: 'FIXED' as const,
      interest_rate: '8.000000',
      interest_basis: 'ACT_365' as const,
      amortization_type: 'EQUAL_AMORTIZATION' as const,
      payment_frequency: 'MONTHLY' as const,
      effective_date: '2026-07-01',
      maturity_date: '2036-07-01',
      pretermination_penalty_rate: '3.000000',
      pretermination_penalty_type: 'PERCENTAGE',
      trustee_role: 'COLLATERAL_AGENT',
      purpose: 'Commercial real estate acquisition in BGC',
    },
  ];

  for (const f of facilities) {
    await db.insert(s.loanFacilities).values({
      ...f,
      created_by: 'seed',
      updated_by: 'seed',
    } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${facilities.length} loan facilities`);

  // ── 2. Loan Participants (for syndicated loans) ───────────────────────────
  const participants = [
    { facility_id: 'LF-2026-0003', participant_role: 'LEAD_ARRANGER', commitment_amount: '4000000000.0000', share_percentage: '40.000000' },
    { facility_id: 'LF-2026-0003', participant_role: 'PARTICIPANT', commitment_amount: '2000000000.0000', share_percentage: '20.000000' },
    { facility_id: 'LF-2026-0003', participant_role: 'PARTICIPANT', commitment_amount: '2000000000.0000', share_percentage: '20.000000' },
    { facility_id: 'LF-2026-0003', participant_role: 'PARTICIPANT', commitment_amount: '1000000000.0000', share_percentage: '10.000000' },
    { facility_id: 'LF-2026-0003', participant_role: 'PARTICIPANT', commitment_amount: '1000000000.0000', share_percentage: '10.000000' },
    { facility_id: 'LF-2026-0004', participant_role: 'LEAD_ARRANGER', commitment_amount: '2400000000.0000', share_percentage: '30.000000' },
    { facility_id: 'LF-2026-0004', participant_role: 'PARTICIPANT', commitment_amount: '1600000000.0000', share_percentage: '20.000000' },
    { facility_id: 'LF-2026-0004', participant_role: 'PARTICIPANT', commitment_amount: '1600000000.0000', share_percentage: '20.000000' },
  ];

  for (const p of participants) {
    await db.insert(s.loanParticipants).values({ ...p, created_by: 'seed', updated_by: 'seed' } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${participants.length} loan participants`);

  // ── 3. Loan Payments ──────────────────────────────────────────────────────
  const payments = [
    { payment_id: 'LP-2025-00001', facility_id: 'LF-2026-0001', payment_type: 'PRINCIPAL_AND_INTEREST' as const, payment_status: 'PAID' as const, scheduled_date: '2025-04-15', actual_date: '2025-04-15', principal_amount: '250000000.0000', interest_amount: '81250000.0000', total_amount: '331250000.0000', wht_amount: '16250000.0000', net_amount: '315000000.0000' },
    { payment_id: 'LP-2025-00002', facility_id: 'LF-2026-0001', payment_type: 'PRINCIPAL_AND_INTEREST' as const, payment_status: 'PAID' as const, scheduled_date: '2025-07-15', actual_date: '2025-07-15', principal_amount: '250000000.0000', interest_amount: '77187500.0000', total_amount: '327187500.0000', wht_amount: '15437500.0000', net_amount: '311750000.0000' },
    { payment_id: 'LP-2025-00003', facility_id: 'LF-2026-0001', payment_type: 'PRINCIPAL_AND_INTEREST' as const, payment_status: 'PAID' as const, scheduled_date: '2025-10-15', actual_date: '2025-10-15', principal_amount: '250000000.0000', interest_amount: '73125000.0000', total_amount: '323125000.0000', wht_amount: '14625000.0000', net_amount: '308500000.0000' },
    { payment_id: 'LP-2026-00001', facility_id: 'LF-2026-0001', payment_type: 'PRINCIPAL_AND_INTEREST' as const, payment_status: 'PAID' as const, scheduled_date: '2026-01-15', actual_date: '2026-01-15', principal_amount: '250000000.0000', interest_amount: '69062500.0000', total_amount: '319062500.0000', wht_amount: '13812500.0000', net_amount: '305250000.0000' },
    { payment_id: 'LP-2026-00002', facility_id: 'LF-2026-0001', payment_type: 'PRINCIPAL_AND_INTEREST' as const, payment_status: 'PAID' as const, scheduled_date: '2026-04-15', actual_date: '2026-04-14', principal_amount: '250000000.0000', interest_amount: '65000000.0000', total_amount: '315000000.0000', wht_amount: '13000000.0000', net_amount: '302000000.0000' },
    { payment_id: 'LP-2026-00003', facility_id: 'LF-2026-0001', payment_type: 'PRINCIPAL_AND_INTEREST' as const, payment_status: 'SCHEDULED' as const, scheduled_date: '2026-07-15', principal_amount: '250000000.0000', interest_amount: '60937500.0000', total_amount: '310937500.0000' },
    { payment_id: 'LP-2026-00004', facility_id: 'LF-2026-0002', payment_type: 'INTEREST' as const, payment_status: 'PAID' as const, scheduled_date: '2026-01-01', actual_date: '2026-01-02', principal_amount: '0.0000', interest_amount: '3833333.0000', total_amount: '3833333.0000' },
    { payment_id: 'LP-2026-00005', facility_id: 'LF-2026-0002', payment_type: 'INTEREST' as const, payment_status: 'PAID' as const, scheduled_date: '2026-02-01', actual_date: '2026-02-01', principal_amount: '0.0000', interest_amount: '3833333.0000', total_amount: '3833333.0000' },
    { payment_id: 'LP-2026-00006', facility_id: 'LF-2026-0003', payment_type: 'PRINCIPAL_AND_INTEREST' as const, payment_status: 'OVERDUE' as const, scheduled_date: '2026-03-01', principal_amount: '500000000.0000', interest_amount: '172187500.0000', total_amount: '672187500.0000', days_overdue: 61 },
  ];

  for (const p of payments) {
    await db.insert(s.loanPayments).values({ ...p, created_by: 'seed', updated_by: 'seed' } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${payments.length} loan payments`);

  // ── 4. Loan Collaterals ───────────────────────────────────────────────────
  const collaterals = [
    { collateral_id: 'COL-2026-0001', facility_id: 'LF-2026-0001', collateral_type: 'REAL_ESTATE' as const, description: 'SM Mall of Asia Complex - Tower 1', location: 'Pasay City, Metro Manila', title_reference: 'TCT-123456', appraised_value: '8000000000.0000', appraisal_date: '2025-01-10', market_value: '10000000000.0000', forced_sale_value: '6000000000.0000', insurance_policy: 'FI-2025-9876', insurance_expiry: '2026-12-31', insurance_amount: '8000000000.0000', lien_position: 1, ltv_ratio: '46.875000', custodian: 'BDO Trust Vault - Main Office', revaluation_frequency: 'ANNUAL' },
    { collateral_id: 'COL-2026-0002', facility_id: 'LF-2026-0003', collateral_type: 'EQUIPMENT' as const, description: 'Semirara Mining Corp - Mining Equipment Fleet', location: 'Semirara Island, Caluya, Antique', appraised_value: '5000000000.0000', appraisal_date: '2024-06-15', market_value: '4500000000.0000', forced_sale_value: '3000000000.0000', lien_position: 1, ltv_ratio: '190.000000', custodian: 'On-site', revaluation_frequency: 'SEMI_ANNUAL' },
    { collateral_id: 'COL-2026-0003', facility_id: 'LF-2026-0003', collateral_type: 'REAL_ESTATE' as const, description: 'DMCI Industrial Complex - Mandaluyong', location: 'Mandaluyong City', title_reference: 'TCT-789012', appraised_value: '12000000000.0000', appraisal_date: '2024-03-01', market_value: '14000000000.0000', forced_sale_value: '9000000000.0000', insurance_policy: 'FI-2024-5432', insurance_expiry: '2026-06-30', insurance_amount: '12000000000.0000', lien_position: 1, ltv_ratio: '55.882000', custodian: 'BDO Trust Vault - Makati Branch' },
    { collateral_id: 'COL-2026-0004', facility_id: 'LF-2026-0005', collateral_type: 'REAL_ESTATE' as const, description: 'BGC Commercial Lot - 5th Avenue', location: 'Bonifacio Global City, Taguig', title_reference: 'TCT-345678', appraised_value: '4500000000.0000', market_value: '5000000000.0000', forced_sale_value: '3500000000.0000', lien_position: 1, ltv_ratio: '66.667000', custodian: 'BDO Trust Vault - Main Office' },
  ];

  for (const c of collaterals) {
    await db.insert(s.loanCollaterals).values({ ...c, created_by: 'seed', updated_by: 'seed' } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${collaterals.length} loan collaterals`);

  // ── 5. MPCs ───────────────────────────────────────────────────────────────
  const mpcs = [
    { mpc_id: 'MPC-2026-000001', facility_id: 'LF-2026-0001', certificate_number: 'CERT-2025-000001', face_value: '1000000000.0000', issue_date: '2025-01-15', maturity_date: '2030-01-15', interest_rate: '6.500000', mpc_status: 'ACTIVE' as const, participation_percentage: '20.000000' },
    { mpc_id: 'MPC-2026-000002', facility_id: 'LF-2026-0001', certificate_number: 'CERT-2025-000002', face_value: '2000000000.0000', issue_date: '2025-01-15', maturity_date: '2030-01-15', interest_rate: '6.500000', mpc_status: 'ACTIVE' as const, participation_percentage: '40.000000' },
    { mpc_id: 'MPC-2026-000003', facility_id: 'LF-2026-0001', certificate_number: 'CERT-2025-000003', face_value: '500000000.0000', issue_date: '2025-02-01', maturity_date: '2030-01-15', interest_rate: '6.500000', mpc_status: 'CANCELLED' as const, cancellation_date: '2025-08-15', cancellation_reason: 'Investor requested full redemption', participation_percentage: '10.000000' },
  ];

  for (const m of mpcs) {
    await db.insert(s.mpcs).values({ ...m, created_by: 'seed', updated_by: 'seed' } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${mpcs.length} MPCs`);

  // ── 6. Loan Documents ─────────────────────────────────────────────────────
  const docs = [
    { document_id: 'DOC-LN-001', facility_id: 'LF-2026-0001', document_type: 'LOAN_AGREEMENT' as const, document_name: 'SM Prime Term Loan Agreement', custodian_location: 'BDO Trust Vault - Main Office', vault_reference: 'V-2025-001', received_date: '2025-01-10', is_original: true },
    { document_id: 'DOC-LN-002', facility_id: 'LF-2026-0001', document_type: 'MORTGAGE_DEED' as const, document_name: 'Deed of Real Estate Mortgage - MOA Tower 1', custodian_location: 'BDO Trust Vault - Main Office', vault_reference: 'V-2025-002', received_date: '2025-01-10', is_original: true },
    { document_id: 'DOC-LN-003', facility_id: 'LF-2026-0001', document_type: 'INSURANCE_POLICY' as const, document_name: 'Fire Insurance - MOA Tower 1', expiry_date: '2026-12-31', custodian_location: 'BDO Trust Vault - Main Office', received_date: '2025-01-12', is_original: false },
    { document_id: 'DOC-LN-004', facility_id: 'LF-2026-0003', document_type: 'LOAN_AGREEMENT' as const, document_name: 'DMCI Project Finance Facility Agreement', custodian_location: 'BDO Trust Vault - Makati Branch', vault_reference: 'V-2024-015', received_date: '2024-03-01', is_original: true },
    { document_id: 'DOC-LN-005', facility_id: 'LF-2026-0003', document_type: 'COLLATERAL_ASSIGNMENT' as const, document_name: 'Assignment of Mining Equipment', custodian_location: 'BDO Trust Vault - Makati Branch', vault_reference: 'V-2024-016', received_date: '2024-03-01', is_original: true },
    { document_id: 'DOC-LN-006', facility_id: 'LF-2026-0003', document_type: 'SECURITY_AGREEMENT' as const, document_name: 'Pledge of Industrial Complex', custodian_location: 'BDO Trust Vault - Makati Branch', vault_reference: 'V-2024-017', received_date: '2024-03-01', is_original: true },
  ];

  for (const d of docs) {
    await db.insert(s.loanDocuments).values({ ...d, created_by: 'seed', updated_by: 'seed' } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${docs.length} loan documents`);

  // ── 7. Amendments ─────────────────────────────────────────────────────────
  const amendments = [
    { amendment_id: 'AMD-2026-0001', facility_id: 'LF-2026-0002', amendment_date: '2026-03-01', amendment_type: 'RATE_CHANGE', field_changed: 'interest_rate', old_value: '5.500000', new_value: '5.750000', reason: 'Quarterly repricing per BVAL-91D benchmark adjustment' },
    { amendment_id: 'AMD-2026-0002', facility_id: 'LF-2026-0004', amendment_date: '2025-12-15', amendment_type: 'COVENANT_WAIVER', reason: 'Temporary waiver of DSCR covenant for Q4 2025 due to seasonal revenue dip' },
  ];

  for (const a of amendments) {
    await db.insert(s.loanAmendments).values({ ...a, created_by: 'seed', updated_by: 'seed' } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${amendments.length} loan amendments`);

  // ── 8. Receivables ────────────────────────────────────────────────────────
  const receivables = [
    { facility_id: 'LF-2026-0001', receivable_type: 'INTEREST', dr_cr: 'DR' as const, due_date: '2026-07-15', amount: '60937500.0000', paid_amount: '0.0000', balance: '60937500.0000', aging_bucket: 'CURRENT' },
    { facility_id: 'LF-2026-0003', receivable_type: 'PRINCIPAL', dr_cr: 'DR' as const, due_date: '2026-03-01', amount: '500000000.0000', paid_amount: '0.0000', balance: '500000000.0000', aging_bucket: '61-90' },
    { facility_id: 'LF-2026-0003', receivable_type: 'INTEREST', dr_cr: 'DR' as const, due_date: '2026-03-01', amount: '172187500.0000', paid_amount: '0.0000', balance: '172187500.0000', aging_bucket: '61-90' },
    { facility_id: 'LF-2026-0004', receivable_type: 'PRINCIPAL_AND_INTEREST', dr_cr: 'DR' as const, due_date: '2026-06-15', amount: '428571000.0000', paid_amount: '0.0000', balance: '428571000.0000', aging_bucket: 'CURRENT' },
  ];

  for (const r of receivables) {
    await db.insert(s.loanReceivables).values({ ...r, created_by: 'seed', updated_by: 'seed' } as any).onConflictDoNothing();
  }
  console.log(`  [OK] ${receivables.length} loan receivables`);

  console.log('\n=== Corporate Trust / Loan Management seed complete ===\n');
}

// Entry point
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedLoanData()
    .then(() => process.exit(0))
    .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
}
