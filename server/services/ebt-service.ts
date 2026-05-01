/**
 * ebt-service.ts — Employee Benefit Trust (EBT) Service
 *
 * Core service for EBT plan management, member lifecycle, contributions,
 * balance sheet derivation, separation processing, reinstatement validation,
 * benefit claims, loan interfacing, and rule bypass.
 *
 * Closes BDO RFI gaps: EBT-01 through EBT-09, EBT-14
 */

import { eq, and, desc, asc, sql, gte, lte, inArray, isNull, or, ne } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { NotFoundError, ValidationError, ConflictError } from './service-errors';

// ─── Plan Management ─────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export const ebtService = {
  // ─── Plans ───────────────────────────────────────────────────────────────────

  async listPlans(filters?: { employer_client_id?: string; is_multi_employer?: boolean }) {
    let query = db.select().from(schema.ebtPlans).where(eq(schema.ebtPlans.is_deleted, false));
    if (filters?.employer_client_id) {
      query = query.where(eq(schema.ebtPlans.employer_client_id, filters.employer_client_id)) as any;
    }
    return query.orderBy(desc(schema.ebtPlans.created_at));
  },

  async getPlan(planId: string) {
    const [plan] = await db.select().from(schema.ebtPlans)
      .where(and(eq(schema.ebtPlans.plan_id, planId), eq(schema.ebtPlans.is_deleted, false)))
      .limit(1);
    if (!plan) throw new NotFoundError(`Plan ${planId} not found`);
    return plan;
  },

  async createPlan(data: Record<string, any>, userId: string) {
    const planId = generateId('EBT');
    const [plan] = await db.insert(schema.ebtPlans).values({
      plan_id: planId,
      plan_name: data.plan_name,
      employer_client_id: data.employer_client_id,
      portfolio_id: data.portfolio_id,
      plan_type: data.plan_type ?? 'DEFINED_CONTRIBUTION',
      effective_date: data.effective_date,
      vesting_years: data.vesting_years ?? 5,
      vesting_schedule: data.vesting_schedule,
      employer_contribution_rate: data.employer_contribution_rate,
      employee_contribution_rate: data.employee_contribution_rate,
      is_multi_employer: data.is_multi_employer ?? false,
      allow_rule_bypass: data.allow_rule_bypass ?? false,
      minimum_benefit_amount: data.minimum_benefit_amount,
      minimum_benefit_enabled: data.minimum_benefit_enabled ?? false,
      tax_exempt_threshold: data.tax_exempt_threshold,
      income_distribution_method: data.income_distribution_method ?? 'PRO_RATA_BALANCE',
      income_distribution_frequency: data.income_distribution_frequency ?? 'QUARTERLY',
      reinstatement_cutoff_days: data.reinstatement_cutoff_days ?? 365,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return plan;
  },

  async updatePlan(planId: string, data: Record<string, any>, userId: string) {
    await this.getPlan(planId);
    const [updated] = await db.update(schema.ebtPlans)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.ebtPlans.plan_id, planId))
      .returning();
    return updated;
  },

  // ─── Members ─────────────────────────────────────────────────────────────────

  async listMembers(planId: string, filters?: { status?: string; page?: number; pageSize?: number }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    let conditions = [
      eq(schema.ebtMembers.plan_id, planId),
      eq(schema.ebtMembers.is_deleted, false),
    ];
    if (filters?.status) {
      conditions.push(eq(schema.ebtMembers.member_status, filters.status as any));
    }

    const members = await db.select().from(schema.ebtMembers)
      .where(and(...conditions))
      .orderBy(asc(schema.ebtMembers.last_name), asc(schema.ebtMembers.first_name))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.ebtMembers)
      .where(and(...conditions));

    return { data: members, total: count, page, pageSize };
  },

  async getMember(memberId: string) {
    const [member] = await db.select().from(schema.ebtMembers)
      .where(and(eq(schema.ebtMembers.member_id, memberId), eq(schema.ebtMembers.is_deleted, false)))
      .limit(1);
    if (!member) throw new NotFoundError(`Member ${memberId} not found`);
    return member;
  },

  async createMember(data: Record<string, any>, userId: string) {
    const memberId = generateId('MBR');
    const [member] = await db.insert(schema.ebtMembers).values({
      member_id: memberId,
      plan_id: data.plan_id,
      employee_id: data.employee_id,
      first_name: data.first_name,
      last_name: data.last_name,
      middle_name: data.middle_name,
      date_of_birth: data.date_of_birth,
      date_of_hire: data.date_of_hire,
      enrollment_date: data.enrollment_date ?? new Date().toISOString().split('T')[0],
      member_status: 'ACTIVE',
      department: data.department,
      position: data.position,
      monthly_salary: data.monthly_salary,
      beneficiary_name: data.beneficiary_name,
      beneficiary_relationship: data.beneficiary_relationship,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return member;
  },

  async updateMember(memberId: string, data: Record<string, any>, userId: string) {
    await this.getMember(memberId);
    const [updated] = await db.update(schema.ebtMembers)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.ebtMembers.member_id, memberId))
      .returning();
    return updated;
  },

  // ─── Contributions ───────────────────────────────────────────────────────────

  async listContributions(memberId: string, filters?: { type?: string }) {
    let conditions = [
      eq(schema.ebtContributions.member_id, memberId),
      eq(schema.ebtContributions.is_deleted, false),
    ];
    if (filters?.type) {
      conditions.push(eq(schema.ebtContributions.contribution_type, filters.type as any));
    }
    return db.select().from(schema.ebtContributions)
      .where(and(...conditions))
      .orderBy(desc(schema.ebtContributions.contribution_date));
  },

  async recordContribution(data: Record<string, any>, userId: string) {
    const member = await this.getMember(data.member_id);

    // EBT-02: Validate reinstatement — cannot contribute if SEPARATED unless reinstated
    if (member.member_status === 'SEPARATED' || member.member_status === 'RETIRED') {
      throw new ValidationError(
        `Cannot record contribution for ${member.member_status} member. Reinstatement required first.`
      );
    }

    const contributionId = generateId('CTR');
    const [contribution] = await db.insert(schema.ebtContributions).values({
      contribution_id: contributionId,
      plan_id: member.plan_id,
      member_id: data.member_id,
      contribution_type: data.contribution_type,
      contribution_date: data.contribution_date,
      period_start: data.period_start,
      period_end: data.period_end,
      amount: data.amount,
      reference: data.reference,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();

    // Update member totals
    const field = data.contribution_type === 'EMPLOYER'
      ? 'total_employer_contributions'
      : 'total_employee_contributions';
    await db.update(schema.ebtMembers)
      .set({
        [field]: sql`COALESCE(${schema.ebtMembers[field]}, '0')::numeric + ${data.amount}::numeric`,
        current_balance: sql`COALESCE(${schema.ebtMembers.current_balance}, '0')::numeric + ${data.amount}::numeric`,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.ebtMembers.member_id, data.member_id));

    return contribution;
  },

  // ─── Balance Sheet Derivation (EBT-01: PSM-25) ──────────────────────────────

  async generateBalanceSheet(memberId: string, asOfDate: string, userId: string) {
    const member = await this.getMember(memberId);

    // Get all contributions up to date
    const contributions = await db.select().from(schema.ebtContributions)
      .where(and(
        eq(schema.ebtContributions.member_id, memberId),
        lte(schema.ebtContributions.contribution_date, asOfDate),
        eq(schema.ebtContributions.is_deleted, false),
      ))
      .orderBy(asc(schema.ebtContributions.contribution_date));

    const employerContrib = contributions
      .filter((c: any) => c.contribution_type === 'EMPLOYER')
      .reduce((sum: number, c: any) => sum + parseFloat(c.amount ?? '0'), 0);
    const employeeContrib = contributions
      .filter((c: any) => c.contribution_type === 'EMPLOYEE' || c.contribution_type === 'VOLUNTARY')
      .reduce((sum: number, c: any) => sum + parseFloat(c.amount ?? '0'), 0);

    // Get loans
    const loans = await db.select().from(schema.ebtLoans)
      .where(and(
        eq(schema.ebtLoans.member_id, memberId),
        eq(schema.ebtLoans.loan_status, 'ACTIVE'),
        eq(schema.ebtLoans.is_deleted, false),
      ));
    const loanDeductions = loans.reduce((sum: number, l: any) => sum + parseFloat(l.outstanding_balance ?? '0'), 0);

    // Get previous balance sheet for opening balance
    const [prevSheet] = await db.select().from(schema.ebtBalanceSheets)
      .where(and(
        eq(schema.ebtBalanceSheets.member_id, memberId),
        sql`${schema.ebtBalanceSheets.as_of_date} < ${asOfDate}`,
        eq(schema.ebtBalanceSheets.is_deleted, false),
      ))
      .orderBy(desc(schema.ebtBalanceSheets.as_of_date))
      .limit(1);

    const openingBalance = prevSheet ? parseFloat(prevSheet.closing_balance ?? '0') : 0;

    // Get income distributions for this member in the period
    const incomeDistributions = await db.select().from(schema.ebtIncomeDistributions)
      .where(and(
        eq(schema.ebtIncomeDistributions.plan_id, member.plan_id),
        lte(schema.ebtIncomeDistributions.distribution_date, asOfDate),
        eq(schema.ebtIncomeDistributions.is_deleted, false),
      ));

    // Calculate earnings (simplified — pro-rata from distributions)
    let investmentEarnings = 0;
    for (const dist of incomeDistributions) {
      const details = dist.details as any[];
      if (Array.isArray(details)) {
        const memberShare = details.find((d: any) => d.member_id === memberId);
        if (memberShare) investmentEarnings += parseFloat(memberShare.amount ?? '0');
      }
    }

    // Get vesting percentage
    const plan = await this.getPlan(member.plan_id);
    const yearsOfService = parseFloat(member.years_of_service ?? '0');
    const vestingPct = this.computeVestingPercentage(plan, yearsOfService);

    const closingBalance = openingBalance + employerContrib + employeeContrib
      + investmentEarnings - loanDeductions;
    const vestedAmount = closingBalance * (vestingPct / 100);

    const sheetId = generateId('BSH');
    const derivationDetails = {
      contributions_breakdown: contributions.map((c: any) => ({
        date: c.contribution_date,
        type: c.contribution_type,
        amount: c.amount,
        reference: c.reference,
      })),
      loans_breakdown: loans.map((l: any) => ({
        loan_id: l.loan_id,
        outstanding: l.outstanding_balance,
        source: l.source_system,
      })),
      vesting: { years_of_service: yearsOfService, percentage: vestingPct },
      income_distributions: incomeDistributions.length,
    };

    // Upsert balance sheet
    const existing = await db.select().from(schema.ebtBalanceSheets)
      .where(and(
        eq(schema.ebtBalanceSheets.member_id, memberId),
        eq(schema.ebtBalanceSheets.as_of_date, asOfDate),
      )).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(schema.ebtBalanceSheets)
        .set({
          opening_balance: openingBalance.toFixed(4),
          employer_contributions: employerContrib.toFixed(4),
          employee_contributions: employeeContrib.toFixed(4),
          investment_earnings: investmentEarnings.toFixed(4),
          loan_deductions: loanDeductions.toFixed(4),
          closing_balance: closingBalance.toFixed(4),
          vested_amount: vestedAmount.toFixed(4),
          derivation_details: derivationDetails,
          updated_by: userId,
          updated_at: new Date(),
        })
        .where(eq(schema.ebtBalanceSheets.id, existing[0].id))
        .returning();
      return updated;
    }

    const [sheet] = await db.insert(schema.ebtBalanceSheets).values({
      sheet_id: sheetId,
      member_id: memberId,
      plan_id: member.plan_id,
      as_of_date: asOfDate,
      opening_balance: openingBalance.toFixed(4),
      employer_contributions: employerContrib.toFixed(4),
      employee_contributions: employeeContrib.toFixed(4),
      investment_earnings: investmentEarnings.toFixed(4),
      loan_deductions: loanDeductions.toFixed(4),
      closing_balance: closingBalance.toFixed(4),
      vested_amount: vestedAmount.toFixed(4),
      derivation_details: derivationDetails,
      created_by: userId,
      updated_by: userId,
    }).returning();

    return sheet;
  },

  async getBalanceSheet(memberId: string, asOfDate?: string) {
    let conditions = [
      eq(schema.ebtBalanceSheets.member_id, memberId),
      eq(schema.ebtBalanceSheets.is_deleted, false),
    ];
    if (asOfDate) {
      conditions.push(eq(schema.ebtBalanceSheets.as_of_date, asOfDate));
    }
    return db.select().from(schema.ebtBalanceSheets)
      .where(and(...conditions))
      .orderBy(desc(schema.ebtBalanceSheets.as_of_date));
  },

  // ─── Vesting Computation ─────────────────────────────────────────────────────

  computeVestingPercentage(plan: any, yearsOfService: number): number {
    // Use vesting schedule if defined (array of {year, percentage})
    if (plan.vesting_schedule && Array.isArray(plan.vesting_schedule)) {
      const schedule = plan.vesting_schedule as Array<{ year: number; percentage: number }>;
      const sorted = [...schedule].sort((a, b) => b.year - a.year);
      for (const tier of sorted) {
        if (yearsOfService >= tier.year) return tier.percentage;
      }
      return 0;
    }
    // Default: linear vesting over vesting_years
    const vestingYears = plan.vesting_years ?? 5;
    if (yearsOfService >= vestingYears) return 100;
    return Math.min(100, (yearsOfService / vestingYears) * 100);
  },

  // ─── Separation Processing (EBT-03: PSM-35) ─────────────────────────────────

  async validateSeparationEligibility(memberId: string, separationReason: string) {
    const member = await this.getMember(memberId);
    const plan = await this.getPlan(member.plan_id);

    const errors: string[] = [];

    // Must be ACTIVE
    if (member.member_status !== 'ACTIVE' && member.member_status !== 'REINSTATED') {
      errors.push(`Member status is ${member.member_status}; must be ACTIVE or REINSTATED`);
    }

    // Check for outstanding loans
    const activeLoans = await db.select().from(schema.ebtLoans)
      .where(and(
        eq(schema.ebtLoans.member_id, memberId),
        eq(schema.ebtLoans.loan_status, 'ACTIVE'),
        eq(schema.ebtLoans.is_deleted, false),
      ));
    if (activeLoans.length > 0) {
      const totalOutstanding = activeLoans.reduce(
        (sum: number, l: any) => sum + parseFloat(l.outstanding_balance ?? '0'), 0
      );
      errors.push(`Outstanding loan balance of ${totalOutstanding.toFixed(2)} will be deducted from benefit`);
    }

    // Check vesting
    const yearsOfService = parseFloat(member.years_of_service ?? '0');
    const vestingPct = this.computeVestingPercentage(plan, yearsOfService);

    // Check separation reason validity
    const [reason] = await db.select().from(schema.ebtSeparationReasons)
      .where(and(
        eq(schema.ebtSeparationReasons.reason_code, separationReason),
        eq(schema.ebtSeparationReasons.is_active, true),
      )).limit(1);

    if (!reason) {
      errors.push(`Invalid or inactive separation reason: ${separationReason}`);
    }

    // Check pending claims
    const pendingClaims = await db.select().from(schema.ebtBenefitClaims)
      .where(and(
        eq(schema.ebtBenefitClaims.member_id, memberId),
        inArray(schema.ebtBenefitClaims.claim_status, ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']),
      ));
    if (pendingClaims.length > 0) {
      errors.push(`Member has ${pendingClaims.length} pending benefit claim(s)`);
    }

    return {
      eligible: errors.filter(e => !e.startsWith('Outstanding')).length === 0,
      warnings: errors,
      member_status: member.member_status,
      years_of_service: yearsOfService,
      vesting_percentage: vestingPct,
      active_loans: activeLoans.length,
      loan_deduction: activeLoans.reduce(
        (sum: number, l: any) => sum + parseFloat(l.outstanding_balance ?? '0'), 0
      ),
    };
  },

  async processSeparation(memberId: string, data: Record<string, any>, userId: string) {
    const eligibility = await this.validateSeparationEligibility(memberId, data.separation_reason);
    if (!eligibility.eligible) {
      throw new ValidationError(`Member not eligible for separation: ${eligibility.warnings.join('; ')}`);
    }

    // Update member status
    await db.update(schema.ebtMembers)
      .set({
        member_status: 'SEPARATED',
        separation_date: data.separation_date,
        separation_reason: data.separation_reason,
        years_of_service: eligibility.years_of_service.toFixed(2),
        vesting_percentage: eligibility.vesting_percentage.toFixed(6),
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.ebtMembers.member_id, memberId));

    return { memberId, status: 'SEPARATED', ...eligibility };
  },

  // ─── Reinstatement (EBT-02: PSM-30) ─────────────────────────────────────────

  async validateReinstatement(memberId: string) {
    const member = await this.getMember(memberId);
    const plan = await this.getPlan(member.plan_id);

    if (member.member_status !== 'SEPARATED') {
      throw new ValidationError(`Only SEPARATED members can be reinstated. Current status: ${member.member_status}`);
    }

    const separationDate = member.separation_date ? new Date(member.separation_date) : null;
    if (!separationDate) {
      throw new ValidationError('Member has no separation date recorded');
    }

    const now = new Date();
    const daysSinceSeparation = Math.floor((now.getTime() - separationDate.getTime()) / (1000 * 60 * 60 * 24));
    const cutoffDays = plan.reinstatement_cutoff_days ?? 365;
    const withinCutoff = daysSinceSeparation <= cutoffDays;

    // Check if benefits were already released
    const releasedClaims = await db.select().from(schema.ebtBenefitClaims)
      .where(and(
        eq(schema.ebtBenefitClaims.member_id, memberId),
        eq(schema.ebtBenefitClaims.claim_status, 'RELEASED'),
      ));

    const requiresRecontribution = releasedClaims.length > 0;
    const recontributionAmount = releasedClaims.reduce(
      (sum: number, c: any) => sum + parseFloat(c.net_benefit_amount ?? '0'), 0
    );

    return {
      eligible: withinCutoff,
      days_since_separation: daysSinceSeparation,
      cutoff_days: cutoffDays,
      within_cutoff: withinCutoff,
      requires_recontribution: requiresRecontribution,
      recontribution_amount: recontributionAmount,
      previous_balance: member.current_balance,
    };
  },

  async reinstateMemember(memberId: string, data: Record<string, any>, userId: string) {
    const validation = await this.validateReinstatement(memberId);
    if (!validation.eligible) {
      throw new ValidationError(
        `Reinstatement not allowed: ${validation.days_since_separation} days since separation exceeds cutoff of ${validation.cutoff_days} days`
      );
    }

    const member = await this.getMember(memberId);
    const reinstatementId = generateId('RST');

    // Record reinstatement
    await db.insert(schema.ebtReinstatements).values({
      reinstatement_id: reinstatementId,
      member_id: memberId,
      plan_id: member.plan_id,
      original_separation_date: member.separation_date,
      reinstatement_date: data.reinstatement_date ?? new Date().toISOString().split('T')[0],
      days_since_separation: validation.days_since_separation,
      within_cutoff: validation.within_cutoff,
      previous_balance: member.current_balance,
      reinstated_balance: member.current_balance,
      requires_recontribution: validation.requires_recontribution,
      recontribution_amount: validation.recontribution_amount.toFixed(4),
      approved_by: userId,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    });

    // Update member status
    await db.update(schema.ebtMembers)
      .set({
        member_status: 'REINSTATED',
        separation_date: null,
        separation_reason: null,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.ebtMembers.member_id, memberId));

    return { reinstatement_id: reinstatementId, ...validation };
  },

  // ─── Separation Reasons (EBT-05: PSM-37) ────────────────────────────────────

  async listSeparationReasons() {
    return db.select().from(schema.ebtSeparationReasons)
      .where(eq(schema.ebtSeparationReasons.is_deleted, false))
      .orderBy(asc(schema.ebtSeparationReasons.reason_name));
  },

  async createSeparationReason(data: Record<string, any>, userId: string) {
    const existing = await db.select().from(schema.ebtSeparationReasons)
      .where(eq(schema.ebtSeparationReasons.reason_code, data.reason_code))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError(`Separation reason code ${data.reason_code} already exists`);
    }
    const [reason] = await db.insert(schema.ebtSeparationReasons).values({
      reason_code: data.reason_code,
      reason_name: data.reason_name,
      description: data.description,
      requires_notice_period: data.requires_notice_period ?? false,
      notice_period_days: data.notice_period_days,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return reason;
  },

  async updateSeparationReason(id: number, data: Record<string, any>, userId: string) {
    const [updated] = await db.update(schema.ebtSeparationReasons)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.ebtSeparationReasons.id, id))
      .returning();
    if (!updated) throw new NotFoundError(`Separation reason #${id} not found`);
    return updated;
  },

  // ─── Benefit Types (EBT-04: PSM-36) ─────────────────────────────────────────

  async listBenefitTypes() {
    return db.select().from(schema.ebtBenefitTypes)
      .where(eq(schema.ebtBenefitTypes.is_deleted, false))
      .orderBy(asc(schema.ebtBenefitTypes.benefit_name));
  },

  async createBenefitType(data: Record<string, any>, userId: string) {
    const existing = await db.select().from(schema.ebtBenefitTypes)
      .where(eq(schema.ebtBenefitTypes.benefit_code, data.benefit_code))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError(`Benefit type code ${data.benefit_code} already exists`);
    }
    const [bt] = await db.insert(schema.ebtBenefitTypes).values({
      benefit_code: data.benefit_code,
      benefit_name: data.benefit_name,
      benefit_category: data.benefit_category,
      description: data.description,
      is_taxable: data.is_taxable ?? true,
      tax_rate: data.tax_rate,
      requires_documentation: data.requires_documentation ?? false,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return bt;
  },

  async updateBenefitType(id: number, data: Record<string, any>, userId: string) {
    const [updated] = await db.update(schema.ebtBenefitTypes)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.ebtBenefitTypes.id, id))
      .returning();
    if (!updated) throw new NotFoundError(`Benefit type #${id} not found`);
    return updated;
  },

  // ─── Benefit Claims ──────────────────────────────────────────────────────────

  async listClaims(filters?: { plan_id?: string; member_id?: string; status?: string }) {
    let conditions = [eq(schema.ebtBenefitClaims.is_deleted, false)];
    if (filters?.plan_id) conditions.push(eq(schema.ebtBenefitClaims.plan_id, filters.plan_id));
    if (filters?.member_id) conditions.push(eq(schema.ebtBenefitClaims.member_id, filters.member_id));
    if (filters?.status) conditions.push(eq(schema.ebtBenefitClaims.claim_status, filters.status as any));
    return db.select().from(schema.ebtBenefitClaims)
      .where(and(...conditions))
      .orderBy(desc(schema.ebtBenefitClaims.created_at));
  },

  async createClaim(data: Record<string, any>, userId: string) {
    const member = await this.getMember(data.member_id);
    const plan = await this.getPlan(member.plan_id);

    const claimId = generateId('CLM');
    const yearsOfService = parseFloat(member.years_of_service ?? '0');
    const vestingPct = this.computeVestingPercentage(plan, yearsOfService);

    // Compute benefit amount based on method
    let grossBenefit = 0;
    let computationDetails: any = {};
    const calcMethod = data.calculation_method ?? 'STANDARD';

    if (calcMethod === 'CLIENT_PROVIDED' && plan.allow_rule_bypass) {
      // EBT-08: PSM-41 — Use client-provided amount
      grossBenefit = parseFloat(data.client_provided_amount ?? '0');
      computationDetails = { method: 'CLIENT_PROVIDED', client_amount: grossBenefit };
    } else if (calcMethod === 'GRATUITY') {
      // Get gratuity rules
      const gratuityResult = await ebtGratuityService.computeGratuity(
        member.plan_id, data.member_id, yearsOfService,
        parseFloat(member.monthly_salary ?? '0'), data.separation_reason
      );
      grossBenefit = gratuityResult.amount;
      computationDetails = gratuityResult;
    } else {
      // Standard: vested balance
      grossBenefit = parseFloat(member.current_balance ?? '0') * (vestingPct / 100);
      computationDetails = {
        method: 'STANDARD',
        balance: member.current_balance,
        vesting_pct: vestingPct,
        vested_amount: grossBenefit,
      };
    }

    // EBT-09: PSM-42 — Check minimum benefit
    if (plan.minimum_benefit_enabled && plan.minimum_benefit_amount) {
      const minBenefit = parseFloat(plan.minimum_benefit_amount);
      if (grossBenefit < minBenefit) {
        grossBenefit = minBenefit;
        computationDetails.minimum_benefit_applied = true;
        computationDetails.original_amount = computationDetails.vested_amount ?? computationDetails.amount;
        computationDetails.floor_amount = minBenefit;
      }
    }

    // Loan deduction (EBT-06/07)
    const activeLoans = await db.select().from(schema.ebtLoans)
      .where(and(
        eq(schema.ebtLoans.member_id, data.member_id),
        eq(schema.ebtLoans.loan_status, 'ACTIVE'),
        eq(schema.ebtLoans.is_deleted, false),
      ));
    const loanDeduction = activeLoans.reduce(
      (sum: number, l: any) => sum + parseFloat(l.outstanding_balance ?? '0'), 0
    );

    // Tax computation
    const taxAmount = await ebtGratuityService.computeTax(
      member.plan_id, grossBenefit, yearsOfService, data.separation_reason
    );

    const netBenefit = grossBenefit - taxAmount - loanDeduction - parseFloat(data.other_deductions ?? '0');

    const [claim] = await db.insert(schema.ebtBenefitClaims).values({
      claim_id: claimId,
      plan_id: member.plan_id,
      member_id: data.member_id,
      benefit_code: data.benefit_code,
      claim_status: 'DRAFT',
      separation_reason: data.separation_reason,
      separation_date: data.separation_date,
      years_of_service_at_separation: yearsOfService.toFixed(2),
      calculation_method: calcMethod,
      gross_benefit_amount: grossBenefit.toFixed(4),
      tax_amount: taxAmount.toFixed(4),
      loan_deduction: loanDeduction.toFixed(4),
      other_deductions: data.other_deductions ?? '0',
      net_benefit_amount: netBenefit.toFixed(4),
      minimum_benefit_applied: computationDetails.minimum_benefit_applied ?? false,
      client_provided_amount: data.client_provided_amount,
      computation_details: computationDetails,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();

    return claim;
  },

  async approveClaim(claimId: string, userId: string) {
    const [claim] = await db.select().from(schema.ebtBenefitClaims)
      .where(eq(schema.ebtBenefitClaims.claim_id, claimId))
      .limit(1);
    if (!claim) throw new NotFoundError(`Claim ${claimId} not found`);
    if (claim.claim_status !== 'SUBMITTED' && claim.claim_status !== 'UNDER_REVIEW') {
      throw new ValidationError(`Cannot approve claim in ${claim.claim_status} status`);
    }
    const [updated] = await db.update(schema.ebtBenefitClaims)
      .set({
        claim_status: 'APPROVED',
        approved_by: userId,
        approved_date: new Date().toISOString().split('T')[0],
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.ebtBenefitClaims.claim_id, claimId))
      .returning();
    return updated;
  },

  async releaseClaim(claimId: string, userId: string) {
    const [claim] = await db.select().from(schema.ebtBenefitClaims)
      .where(eq(schema.ebtBenefitClaims.claim_id, claimId))
      .limit(1);
    if (!claim) throw new NotFoundError(`Claim ${claimId} not found`);
    if (claim.claim_status !== 'APPROVED') {
      throw new ValidationError(`Cannot release claim in ${claim.claim_status} status`);
    }

    // Mark loans as settled on release
    if (parseFloat(claim.loan_deduction ?? '0') > 0) {
      await db.update(schema.ebtLoans)
        .set({ loan_status: 'PAID', updated_by: userId, updated_at: new Date() })
        .where(and(
          eq(schema.ebtLoans.member_id, claim.member_id),
          eq(schema.ebtLoans.loan_status, 'ACTIVE'),
        ));
    }

    const [updated] = await db.update(schema.ebtBenefitClaims)
      .set({
        claim_status: 'RELEASED',
        released_date: new Date().toISOString().split('T')[0],
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.ebtBenefitClaims.claim_id, claimId))
      .returning();

    // Update member withdrawal totals
    await db.update(schema.ebtMembers)
      .set({
        total_withdrawals: sql`COALESCE(${schema.ebtMembers.total_withdrawals}, '0')::numeric + ${claim.net_benefit_amount}::numeric`,
        current_balance: sql`COALESCE(${schema.ebtMembers.current_balance}, '0')::numeric - ${claim.gross_benefit_amount}::numeric`,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.ebtMembers.member_id, claim.member_id));

    return updated;
  },

  // ─── Loan Interfacing (EBT-06: PSM-38, EBT-07: PSM-39) ─────────────────────

  async listLoans(memberId: string) {
    return db.select().from(schema.ebtLoans)
      .where(and(
        eq(schema.ebtLoans.member_id, memberId),
        eq(schema.ebtLoans.is_deleted, false),
      ))
      .orderBy(desc(schema.ebtLoans.loan_date));
  },

  async interfaceLoan(data: Record<string, any>, userId: string) {
    await this.getMember(data.member_id);
    const loanId = generateId('ELN');
    const [loan] = await db.insert(schema.ebtLoans).values({
      loan_id: loanId,
      plan_id: data.plan_id,
      member_id: data.member_id,
      loan_status: 'ACTIVE',
      original_amount: data.original_amount,
      outstanding_balance: data.outstanding_balance ?? data.original_amount,
      interest_rate: data.interest_rate,
      loan_date: data.loan_date,
      maturity_date: data.maturity_date,
      source_system: data.source_system ?? 'BANK_LOAN_SYSTEM',
      source_reference: data.source_reference,
      interfaced_date: new Date().toISOString().split('T')[0],
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return loan;
  },

  async updateLoan(loanId: string, data: Record<string, any>, userId: string) {
    const [existing] = await db.select().from(schema.ebtLoans)
      .where(eq(schema.ebtLoans.loan_id, loanId)).limit(1);
    if (!existing) throw new NotFoundError(`Loan ${loanId} not found`);
    const [updated] = await db.update(schema.ebtLoans)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.ebtLoans.loan_id, loanId))
      .returning();
    return updated;
  },

  async bulkInterfaceLoans(loans: Record<string, any>[], userId: string) {
    const results = [];
    for (const loan of loans) {
      const result = await this.interfaceLoan(loan, userId);
      results.push(result);
    }
    return results;
  },

  // ─── Dashboard Summary ───────────────────────────────────────────────────────

  async getDashboardSummary(planId?: string) {
    let planCondition = planId
      ? and(eq(schema.ebtMembers.plan_id, planId), eq(schema.ebtMembers.is_deleted, false))
      : eq(schema.ebtMembers.is_deleted, false);

    const [memberStats] = await db.select({
      total_members: sql<number>`count(*)::int`,
      active_members: sql<number>`count(*) filter (where ${schema.ebtMembers.member_status} = 'ACTIVE')::int`,
      separated_members: sql<number>`count(*) filter (where ${schema.ebtMembers.member_status} = 'SEPARATED')::int`,
      total_balance: sql<string>`COALESCE(sum(${schema.ebtMembers.current_balance}::numeric), 0)::text`,
      total_employer_contrib: sql<string>`COALESCE(sum(${schema.ebtMembers.total_employer_contributions}::numeric), 0)::text`,
      total_employee_contrib: sql<string>`COALESCE(sum(${schema.ebtMembers.total_employee_contributions}::numeric), 0)::text`,
    }).from(schema.ebtMembers).where(planCondition);

    let claimCondition = planId
      ? and(eq(schema.ebtBenefitClaims.plan_id, planId), eq(schema.ebtBenefitClaims.is_deleted, false))
      : eq(schema.ebtBenefitClaims.is_deleted, false);

    const [claimStats] = await db.select({
      pending_claims: sql<number>`count(*) filter (where ${schema.ebtBenefitClaims.claim_status} in ('SUBMITTED', 'UNDER_REVIEW'))::int`,
      approved_claims: sql<number>`count(*) filter (where ${schema.ebtBenefitClaims.claim_status} = 'APPROVED')::int`,
      released_amount: sql<string>`COALESCE(sum(case when ${schema.ebtBenefitClaims.claim_status} = 'RELEASED' then ${schema.ebtBenefitClaims.net_benefit_amount}::numeric else 0 end), 0)::text`,
    }).from(schema.ebtBenefitClaims).where(claimCondition);

    return { ...memberStats, ...claimStats };
  },
};

// ─── Gratuity & Tax Service (EBT-10, EBT-11, EBT-12, EBT-13) ──────────────

export const ebtGratuityService = {
  // EBT-10: PSM-18 — Gratuity calculation
  async computeGratuity(
    planId: string,
    memberId: string,
    yearsOfService: number,
    monthlySalary: number,
    separationReason?: string,
  ) {
    const rules = await db.select().from(schema.ebtGratuityRules)
      .where(and(
        eq(schema.ebtGratuityRules.plan_id, planId),
        eq(schema.ebtGratuityRules.is_active, true),
        eq(schema.ebtGratuityRules.is_deleted, false),
      ))
      .orderBy(asc(schema.ebtGratuityRules.min_years_of_service));

    if (rules.length === 0) {
      return { amount: 0, method: 'GRATUITY', error: 'No gratuity rules configured for this plan' };
    }

    // Find applicable rule
    let applicableRule = null;
    for (const rule of rules) {
      const minYears = parseFloat(rule.min_years_of_service ?? '0');
      const maxYears = rule.max_years_of_service ? parseFloat(rule.max_years_of_service) : Infinity;

      if (yearsOfService >= minYears && yearsOfService <= maxYears) {
        // Check if separation reason is applicable
        if (rule.applicable_separation_reasons && separationReason) {
          const reasons = rule.applicable_separation_reasons as string[];
          if (Array.isArray(reasons) && reasons.length > 0 && !reasons.includes(separationReason)) {
            continue;
          }
        }
        applicableRule = rule;
        break;
      }
    }

    if (!applicableRule) {
      return { amount: 0, method: 'GRATUITY', error: 'No applicable gratuity rule for years of service' };
    }

    const multiplier = parseFloat(applicableRule.multiplier ?? '0');
    let baseAmount = monthlySalary;
    if (applicableRule.base_type === 'ANNUAL_SALARY') {
      baseAmount = monthlySalary * 12;
    } else if (applicableRule.base_type === 'HALF_MONTH_SALARY') {
      baseAmount = monthlySalary / 2;
    }

    let amount = baseAmount * multiplier * yearsOfService;

    // Apply cap
    if (applicableRule.cap_amount) {
      const cap = parseFloat(applicableRule.cap_amount);
      if (amount > cap) amount = cap;
    }

    return {
      method: 'GRATUITY',
      amount,
      rule_id: applicableRule.rule_id,
      multiplier,
      base_type: applicableRule.base_type,
      base_amount: baseAmount,
      years_of_service: yearsOfService,
      capped: applicableRule.cap_amount ? amount >= parseFloat(applicableRule.cap_amount) : false,
    };
  },

  // ─── Gratuity Rules CRUD ─────────────────────────────────────────────────────

  async listGratuityRules(planId: string) {
    return db.select().from(schema.ebtGratuityRules)
      .where(and(
        eq(schema.ebtGratuityRules.plan_id, planId),
        eq(schema.ebtGratuityRules.is_deleted, false),
      ))
      .orderBy(asc(schema.ebtGratuityRules.min_years_of_service));
  },

  async createGratuityRule(data: Record<string, any>, userId: string) {
    const ruleId = generateId('GRT');
    const [rule] = await db.insert(schema.ebtGratuityRules).values({
      rule_id: ruleId,
      plan_id: data.plan_id,
      min_years_of_service: data.min_years_of_service ?? '0',
      max_years_of_service: data.max_years_of_service,
      multiplier: data.multiplier,
      base_type: data.base_type ?? 'MONTHLY_SALARY',
      cap_amount: data.cap_amount,
      applicable_separation_reasons: data.applicable_separation_reasons,
      is_active: true,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return rule;
  },

  // ─── Tax Computation (EBT-11, EBT-12: PSM-19, PSM-20) ──────────────────────

  async computeTax(planId: string, grossAmount: number, yearsOfService: number, separationReason?: string): Promise<number> {
    const rules = await db.select().from(schema.ebtTaxRules)
      .where(and(
        eq(schema.ebtTaxRules.plan_id, planId),
        eq(schema.ebtTaxRules.is_active, true),
        eq(schema.ebtTaxRules.is_deleted, false),
        eq(schema.ebtTaxRules.applies_to, 'WITHDRAWAL'),
      ));

    if (rules.length === 0) return 0;

    // Check exemptions first (EBT-12)
    for (const rule of rules) {
      if (rule.is_exempt) {
        const minYearsExempt = rule.min_years_for_exemption ? parseFloat(rule.min_years_for_exemption) : 0;
        if (yearsOfService >= minYearsExempt) {
          return 0; // Tax exempt
        }
      }
    }

    // Apply tax
    let totalTax = 0;
    for (const rule of rules) {
      if (rule.is_exempt) continue;
      const threshold = rule.threshold_amount ? parseFloat(rule.threshold_amount) : 0;
      const taxRate = parseFloat(rule.tax_rate ?? '0');
      const taxableAmount = Math.max(0, grossAmount - threshold);
      totalTax += taxableAmount * taxRate;
    }

    return totalTax;
  },

  // ─── Tax Rules CRUD ──────────────────────────────────────────────────────────

  async listTaxRules(planId: string) {
    return db.select().from(schema.ebtTaxRules)
      .where(and(
        eq(schema.ebtTaxRules.plan_id, planId),
        eq(schema.ebtTaxRules.is_deleted, false),
      ))
      .orderBy(asc(schema.ebtTaxRules.tax_type));
  },

  async createTaxRule(data: Record<string, any>, userId: string) {
    const ruleId = generateId('TXR');
    const [rule] = await db.insert(schema.ebtTaxRules).values({
      rule_id: ruleId,
      plan_id: data.plan_id,
      tax_type: data.tax_type,
      applies_to: data.applies_to,
      threshold_amount: data.threshold_amount,
      tax_rate: data.tax_rate,
      is_exempt: data.is_exempt ?? false,
      exemption_reason: data.exemption_reason,
      min_years_for_exemption: data.min_years_for_exemption,
      effective_date: data.effective_date,
      expiry_date: data.expiry_date,
      is_active: true,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return rule;
  },

  // ─── Income Distribution (EBT-13: PSM-21) ───────────────────────────────────

  async distributeIncome(planId: string, data: Record<string, any>, userId: string) {
    const plan = await ebtService.getPlan(planId);
    const totalIncome = parseFloat(data.total_income);

    // Get all active members
    const members = await db.select().from(schema.ebtMembers)
      .where(and(
        eq(schema.ebtMembers.plan_id, planId),
        inArray(schema.ebtMembers.member_status, ['ACTIVE', 'REINSTATED']),
        eq(schema.ebtMembers.is_deleted, false),
      ));

    if (members.length === 0) {
      throw new ValidationError('No active members in plan');
    }

    const method = data.distribution_method ?? plan.income_distribution_method ?? 'PRO_RATA_BALANCE';
    const totalBalance = members.reduce((sum: number, m: any) => sum + parseFloat(m.current_balance ?? '0'), 0);

    const details: any[] = [];
    for (const member of members) {
      let share = 0;
      const balance = parseFloat(member.current_balance ?? '0');

      switch (method) {
        case 'PRO_RATA_BALANCE':
          share = totalBalance > 0 ? (balance / totalBalance) * totalIncome : 0;
          break;
        case 'EQUAL_SHARE':
          share = totalIncome / members.length;
          break;
        case 'UNITS_HELD':
          share = totalBalance > 0 ? (balance / totalBalance) * totalIncome : 0;
          break;
        default:
          share = totalBalance > 0 ? (balance / totalBalance) * totalIncome : 0;
      }

      details.push({
        member_id: member.member_id,
        member_name: `${member.first_name} ${member.last_name}`,
        balance,
        share_percentage: totalBalance > 0 ? (balance / totalBalance * 100) : 0,
        amount: parseFloat(share.toFixed(4)),
      });

      // Credit earnings to member
      await db.update(schema.ebtMembers)
        .set({
          total_earnings: sql`COALESCE(${schema.ebtMembers.total_earnings}, '0')::numeric + ${share.toFixed(4)}::numeric`,
          current_balance: sql`COALESCE(${schema.ebtMembers.current_balance}, '0')::numeric + ${share.toFixed(4)}::numeric`,
          updated_by: userId,
          updated_at: new Date(),
        })
        .where(eq(schema.ebtMembers.member_id, member.member_id));
    }

    const distributionId = generateId('DST');
    const [distribution] = await db.insert(schema.ebtIncomeDistributions).values({
      distribution_id: distributionId,
      plan_id: planId,
      distribution_date: data.distribution_date ?? new Date().toISOString().split('T')[0],
      period_start: data.period_start,
      period_end: data.period_end,
      total_income: totalIncome.toFixed(4),
      distribution_method: method,
      total_distributed: totalIncome.toFixed(4),
      member_count: members.length,
      details,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();

    return distribution;
  },

  async listIncomeDistributions(planId: string) {
    return db.select().from(schema.ebtIncomeDistributions)
      .where(and(
        eq(schema.ebtIncomeDistributions.plan_id, planId),
        eq(schema.ebtIncomeDistributions.is_deleted, false),
      ))
      .orderBy(desc(schema.ebtIncomeDistributions.distribution_date));
  },
};
