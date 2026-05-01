/**
 * seed-ebt-data.ts — Employee Benefit Trust Demo Data
 *
 * Seeds: plans, members, contributions, separation reasons, benefit types,
 * gratuity rules, tax rules, loans, and balance sheets.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

export async function seedEbtData() {
  console.log('  Seeding EBT data...');

  // ─── Separation Reasons ────────────────────────────────────────────────────
  const separationReasons = [
    { reason_code: 'RESIGNATION', reason_name: 'Voluntary Resignation', description: 'Employee voluntarily resigns', requires_notice_period: true, notice_period_days: 30 },
    { reason_code: 'RETIREMENT', reason_name: 'Retirement', description: 'Retirement at or after retirement age', requires_notice_period: false },
    { reason_code: 'TERMINATION', reason_name: 'Termination for Cause', description: 'Employer-initiated termination for cause', requires_notice_period: false },
    { reason_code: 'REDUNDANCY', reason_name: 'Redundancy', description: 'Position made redundant', requires_notice_period: true, notice_period_days: 30 },
    { reason_code: 'RETRENCHMENT', reason_name: 'Retrenchment', description: 'Business downsizing', requires_notice_period: true, notice_period_days: 30 },
    { reason_code: 'DEATH', reason_name: 'Death', description: 'Death of employee', requires_notice_period: false },
    { reason_code: 'DISABILITY', reason_name: 'Disability', description: 'Permanent disability', requires_notice_period: false },
    { reason_code: 'END_OF_CONTRACT', reason_name: 'End of Contract', description: 'Fixed-term contract ended', requires_notice_period: false },
  ];

  for (const sr of separationReasons) {
    const existing = await db.select().from(schema.ebtSeparationReasons)
      .where(eq(schema.ebtSeparationReasons.reason_code, sr.reason_code)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtSeparationReasons).values({
        ...sr,
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${separationReasons.length} separation reasons`);

  // ─── Benefit Types ─────────────────────────────────────────────────────────
  const benefitTypes = [
    { benefit_code: 'RET-STD', benefit_name: 'Standard Retirement Benefit', benefit_category: 'RETIREMENT' as const, is_taxable: true, tax_rate: '0.05' },
    { benefit_code: 'SEP-STD', benefit_name: 'Standard Separation Benefit', benefit_category: 'SEPARATION' as const, is_taxable: true, tax_rate: '0.10' },
    { benefit_code: 'DTH-BEN', benefit_name: 'Death Benefit', benefit_category: 'DEATH' as const, is_taxable: false },
    { benefit_code: 'DSB-BEN', benefit_name: 'Disability Benefit', benefit_category: 'DISABILITY' as const, is_taxable: false },
    { benefit_code: 'GRT-BEN', benefit_name: 'Gratuity Pay', benefit_category: 'GRATUITY' as const, is_taxable: true, tax_rate: '0.05' },
    { benefit_code: 'UNL-BEN', benefit_name: 'Unused Leave Conversion', benefit_category: 'UNUSED_LEAVES' as const, is_taxable: true, tax_rate: '0.20' },
    { benefit_code: 'CBA-BEN', benefit_name: 'CBA Benefits', benefit_category: 'CBA_BENEFIT' as const, is_taxable: true, tax_rate: '0.10' },
    { benefit_code: 'HON-BEN', benefit_name: 'Honoraria Payment', benefit_category: 'HONORARIA' as const, is_taxable: true, tax_rate: '0.15' },
  ];

  for (const bt of benefitTypes) {
    const existing = await db.select().from(schema.ebtBenefitTypes)
      .where(eq(schema.ebtBenefitTypes.benefit_code, bt.benefit_code)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtBenefitTypes).values({
        ...bt,
        is_active: true,
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${benefitTypes.length} benefit types`);

  // ─── Plans ─────────────────────────────────────────────────────────────────
  const plans = [
    {
      plan_id: 'EBT-001',
      plan_name: 'SM Group Employee Retirement Plan',
      employer_client_id: 'CLT-001',
      plan_type: 'DEFINED_CONTRIBUTION',
      effective_date: '2015-01-01',
      vesting_years: 5,
      vesting_schedule: [
        { year: 1, percentage: 0 },
        { year: 2, percentage: 20 },
        { year: 3, percentage: 40 },
        { year: 4, percentage: 60 },
        { year: 5, percentage: 100 },
      ],
      employer_contribution_rate: '0.05',
      employee_contribution_rate: '0.03',
      is_multi_employer: false,
      allow_rule_bypass: true,
      minimum_benefit_enabled: true,
      minimum_benefit_amount: '50000',
      tax_exempt_threshold: '100000',
      income_distribution_method: 'PRO_RATA_BALANCE' as const,
      reinstatement_cutoff_days: 365,
    },
    {
      plan_id: 'EBT-002',
      plan_name: 'Ayala Group Multi-Employer Benefit Trust',
      employer_client_id: 'CLT-002',
      plan_type: 'DEFINED_CONTRIBUTION',
      effective_date: '2018-07-01',
      vesting_years: 3,
      vesting_schedule: [
        { year: 1, percentage: 33 },
        { year: 2, percentage: 66 },
        { year: 3, percentage: 100 },
      ],
      employer_contribution_rate: '0.08',
      employee_contribution_rate: '0.02',
      is_multi_employer: true,
      allow_rule_bypass: false,
      minimum_benefit_enabled: false,
      income_distribution_method: 'EQUAL_SHARE' as const,
      reinstatement_cutoff_days: 180,
    },
  ];

  for (const p of plans) {
    const existing = await db.select().from(schema.ebtPlans)
      .where(eq(schema.ebtPlans.plan_id, p.plan_id)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtPlans).values({
        ...p,
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${plans.length} EBT plans`);

  // ─── Members ───────────────────────────────────────────────────────────────
  const members = [
    { member_id: 'MBR-001', plan_id: 'EBT-001', employee_id: 'EMP-1001', first_name: 'Maria', last_name: 'Santos', date_of_hire: '2015-03-15', enrollment_date: '2015-04-01', department: 'Finance', position: 'Senior Accountant', monthly_salary: '85000', member_status: 'ACTIVE' as const, years_of_service: '11.10', current_balance: '1250000' },
    { member_id: 'MBR-002', plan_id: 'EBT-001', employee_id: 'EMP-1002', first_name: 'Juan', last_name: 'Reyes', date_of_hire: '2018-06-01', enrollment_date: '2018-07-01', department: 'IT', position: 'Software Developer', monthly_salary: '72000', member_status: 'ACTIVE' as const, years_of_service: '7.90', current_balance: '680000' },
    { member_id: 'MBR-003', plan_id: 'EBT-001', employee_id: 'EMP-1003', first_name: 'Ana', last_name: 'Cruz', date_of_hire: '2020-01-15', enrollment_date: '2020-02-01', department: 'HR', position: 'HR Specialist', monthly_salary: '55000', member_status: 'ACTIVE' as const, years_of_service: '6.30', current_balance: '320000' },
    { member_id: 'MBR-004', plan_id: 'EBT-001', employee_id: 'EMP-1004', first_name: 'Pedro', last_name: 'Garcia', date_of_hire: '2010-08-01', enrollment_date: '2015-01-01', department: 'Operations', position: 'Plant Manager', monthly_salary: '120000', member_status: 'SEPARATED' as const, separation_date: '2025-12-31', separation_reason: 'RETIREMENT' as const, years_of_service: '15.40', vesting_percentage: '100', current_balance: '2800000' },
    { member_id: 'MBR-005', plan_id: 'EBT-002', employee_id: 'EMP-2001', first_name: 'Lucia', last_name: 'Tan', date_of_hire: '2019-09-01', enrollment_date: '2019-10-01', department: 'Marketing', position: 'Brand Manager', monthly_salary: '95000', member_status: 'ACTIVE' as const, years_of_service: '6.60', current_balance: '920000' },
    { member_id: 'MBR-006', plan_id: 'EBT-002', employee_id: 'EMP-2002', first_name: 'Carlos', last_name: 'Lim', date_of_hire: '2021-03-15', enrollment_date: '2021-04-01', department: 'Sales', position: 'Sales Executive', monthly_salary: '65000', member_status: 'ACTIVE' as const, years_of_service: '5.10', current_balance: '410000' },
  ];

  for (const m of members) {
    const existing = await db.select().from(schema.ebtMembers)
      .where(eq(schema.ebtMembers.member_id, m.member_id)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtMembers).values({
        ...m,
        total_employer_contributions: (parseFloat(m.current_balance) * 0.6).toFixed(4),
        total_employee_contributions: (parseFloat(m.current_balance) * 0.3).toFixed(4),
        total_earnings: (parseFloat(m.current_balance) * 0.1).toFixed(4),
        total_withdrawals: '0',
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${members.length} members`);

  // ─── Gratuity Rules ────────────────────────────────────────────────────────
  const gratuityRules = [
    { rule_id: 'GRT-001', plan_id: 'EBT-001', min_years_of_service: '0', max_years_of_service: '5', multiplier: '0.5', base_type: 'MONTHLY_SALARY' },
    { rule_id: 'GRT-002', plan_id: 'EBT-001', min_years_of_service: '5', max_years_of_service: '10', multiplier: '1.0', base_type: 'MONTHLY_SALARY' },
    { rule_id: 'GRT-003', plan_id: 'EBT-001', min_years_of_service: '10', max_years_of_service: null, multiplier: '1.5', base_type: 'MONTHLY_SALARY', cap_amount: '5000000' },
    { rule_id: 'GRT-004', plan_id: 'EBT-002', min_years_of_service: '0', multiplier: '1.0', base_type: 'HALF_MONTH_SALARY' },
  ];

  for (const g of gratuityRules) {
    const existing = await db.select().from(schema.ebtGratuityRules)
      .where(eq(schema.ebtGratuityRules.rule_id, g.rule_id)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtGratuityRules).values({
        ...g,
        is_active: true,
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${gratuityRules.length} gratuity rules`);

  // ─── Tax Rules ─────────────────────────────────────────────────────────────
  const taxRules = [
    { rule_id: 'TXR-001', plan_id: 'EBT-001', tax_type: 'WITHHOLDING', applies_to: 'WITHDRAWAL', tax_rate: '0.05', threshold_amount: '100000', is_exempt: false },
    { rule_id: 'TXR-002', plan_id: 'EBT-001', tax_type: 'RETIREMENT_EXEMPT', applies_to: 'WITHDRAWAL', tax_rate: '0', is_exempt: true, exemption_reason: 'RA 4917 - Retirement benefits exempt for 10+ years service and 50+ age', min_years_for_exemption: '10' },
    { rule_id: 'TXR-003', plan_id: 'EBT-001', tax_type: 'CONTRIBUTION', applies_to: 'CONTRIBUTION', tax_rate: '0', is_exempt: true, exemption_reason: 'Employer contributions are pre-tax' },
    { rule_id: 'TXR-004', plan_id: 'EBT-002', tax_type: 'WITHHOLDING', applies_to: 'WITHDRAWAL', tax_rate: '0.10', is_exempt: false },
  ];

  for (const t of taxRules) {
    const existing = await db.select().from(schema.ebtTaxRules)
      .where(eq(schema.ebtTaxRules.rule_id, t.rule_id)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtTaxRules).values({
        ...t,
        is_active: true,
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${taxRules.length} tax rules`);

  // ─── EBT Loans ─────────────────────────────────────────────────────────────
  const loans = [
    { loan_id: 'ELN-001', plan_id: 'EBT-001', member_id: 'MBR-001', loan_status: 'ACTIVE' as const, original_amount: '200000', outstanding_balance: '145000', interest_rate: '0.06', loan_date: '2024-03-15', maturity_date: '2027-03-15', source_system: 'BDO_LOAN_SYSTEM', source_reference: 'BDO-LN-2024-001', interfaced_date: '2024-03-20' },
    { loan_id: 'ELN-002', plan_id: 'EBT-001', member_id: 'MBR-002', loan_status: 'ACTIVE' as const, original_amount: '100000', outstanding_balance: '78000', interest_rate: '0.06', loan_date: '2025-01-10', maturity_date: '2028-01-10', source_system: 'BDO_LOAN_SYSTEM', source_reference: 'BDO-LN-2025-015', interfaced_date: '2025-01-15' },
    { loan_id: 'ELN-003', plan_id: 'EBT-001', member_id: 'MBR-004', loan_status: 'PAID' as const, original_amount: '300000', outstanding_balance: '0', interest_rate: '0.055', loan_date: '2022-06-01', maturity_date: '2025-06-01', source_system: 'BDO_LOAN_SYSTEM', source_reference: 'BDO-LN-2022-088', interfaced_date: '2022-06-05' },
  ];

  for (const l of loans) {
    const existing = await db.select().from(schema.ebtLoans)
      .where(eq(schema.ebtLoans.loan_id, l.loan_id)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtLoans).values({
        ...l,
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${loans.length} EBT loans`);

  // ─── Sample Contributions ──────────────────────────────────────────────────
  const contributions = [
    { contribution_id: 'CTR-001', plan_id: 'EBT-001', member_id: 'MBR-001', contribution_type: 'EMPLOYER' as const, contribution_date: '2026-01-31', amount: '4250', period_start: '2026-01-01', period_end: '2026-01-31' },
    { contribution_id: 'CTR-002', plan_id: 'EBT-001', member_id: 'MBR-001', contribution_type: 'EMPLOYEE' as const, contribution_date: '2026-01-31', amount: '2550', period_start: '2026-01-01', period_end: '2026-01-31' },
    { contribution_id: 'CTR-003', plan_id: 'EBT-001', member_id: 'MBR-002', contribution_type: 'EMPLOYER' as const, contribution_date: '2026-01-31', amount: '3600', period_start: '2026-01-01', period_end: '2026-01-31' },
    { contribution_id: 'CTR-004', plan_id: 'EBT-001', member_id: 'MBR-002', contribution_type: 'EMPLOYEE' as const, contribution_date: '2026-01-31', amount: '2160', period_start: '2026-01-01', period_end: '2026-01-31' },
  ];

  for (const c of contributions) {
    const existing = await db.select().from(schema.ebtContributions)
      .where(eq(schema.ebtContributions.contribution_id, c.contribution_id)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.ebtContributions).values({
        ...c,
        created_by: 'seed', updated_by: 'seed',
      });
    }
  }
  console.log(`    ✓ ${contributions.length} contributions`);

  console.log('  ✓ EBT data seeding complete');
}
