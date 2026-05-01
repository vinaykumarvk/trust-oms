/**
 * pf-extension-service.ts — Provident Fund Extension Service
 *
 * Closes remaining Metrobank MB-GAP-023 sub-gaps on top of existing EBT module:
 * - Member transfer between funds
 * - Member merge (duplicate cleanup)
 * - Forfeiture of unvested balance
 * - Fund NAVPU valuation
 * - Member unit balance tracking
 * - Loan amortization schedule
 * - Benefit payment scheduling (lump-sum vs annuity)
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { NotFoundError, ValidationError } from './service-errors';

function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// ─── Member Transfer ──────────────────────────────────────────────────────────

export const pfMemberTransferService = {
  /**
   * Transfer a member from one plan to another (multi-employer portability).
   * Closes their balance in the source plan and opens in the target plan.
   */
  async transferMember(
    memberId: string,
    targetPlanId: string,
    userId: string,
    transferBalance = true,
  ) {
    // Get current member
    const [member] = await db.select().from(schema.ebtMembers)
      .where(eq(schema.ebtMembers.member_id, memberId)).limit(1);
    if (!member) throw new NotFoundError('Member not found');
    if (member.member_status !== 'ACTIVE') {
      throw new ValidationError('Only ACTIVE members can be transferred');
    }

    // Validate target plan exists
    const [targetPlan] = await db.select().from(schema.ebtPlans)
      .where(eq(schema.ebtPlans.plan_id, targetPlanId)).limit(1);
    if (!targetPlan) throw new NotFoundError('Target plan not found');
    if (member.plan_id === targetPlanId) {
      throw new ValidationError('Member is already in the target plan');
    }

    const now = new Date().toISOString().slice(0, 10);
    const balance = Number(member.current_balance) || 0;
    const vestedPct = Number(member.vesting_percentage) || 0;
    const vestedAmount = balance * (vestedPct / 100);

    // Mark source member as TRANSFERRED
    await db.update(schema.ebtMembers).set({
      member_status: 'SEPARATED' as any,
      separation_date: now,
      separation_reason: 'OTHER' as any,
      current_balance: transferBalance ? '0' : member.current_balance,
      remarks: `Transferred to plan ${targetPlanId}`,
      updated_by: userId,
    }).where(eq(schema.ebtMembers.member_id, memberId));

    // Create new member record in target plan
    const newMemberId = generateId('MBR');
    const [newMember] = await db.insert(schema.ebtMembers).values({
      member_id: newMemberId,
      plan_id: targetPlanId,
      employee_id: member.employee_id,
      first_name: member.first_name,
      last_name: member.last_name,
      middle_name: member.middle_name,
      date_of_birth: member.date_of_birth,
      date_of_hire: member.date_of_hire,
      enrollment_date: now,
      member_status: 'ACTIVE',
      department: member.department,
      position: member.position,
      monthly_salary: member.monthly_salary,
      years_of_service: member.years_of_service,
      vesting_percentage: String(vestedPct),
      current_balance: transferBalance ? String(vestedAmount) : '0',
      total_employer_contributions: transferBalance ? String(vestedAmount) : '0',
      beneficiary_name: member.beneficiary_name,
      beneficiary_relationship: member.beneficiary_relationship,
      remarks: `Transferred from plan ${member.plan_id}, member ${memberId}`,
      created_by: userId,
      updated_by: userId,
    }).returning();

    return {
      source_member_id: memberId,
      target_member_id: newMemberId,
      transferred_amount: transferBalance ? vestedAmount : 0,
      forfeited_amount: transferBalance ? (balance - vestedAmount) : 0,
      new_member: newMember,
    };
  },
};

// ─── Member Merge ─────────────────────────────────────────────────────────────

export const pfMemberMergeService = {
  /** Merge a duplicate member into a primary member (same plan) */
  async mergeDuplicate(primaryMemberId: string, duplicateMemberId: string, userId: string) {
    const [primary] = await db.select().from(schema.ebtMembers)
      .where(eq(schema.ebtMembers.member_id, primaryMemberId)).limit(1);
    const [duplicate] = await db.select().from(schema.ebtMembers)
      .where(eq(schema.ebtMembers.member_id, duplicateMemberId)).limit(1);

    if (!primary) throw new NotFoundError('Primary member not found');
    if (!duplicate) throw new NotFoundError('Duplicate member not found');
    if (primary.plan_id !== duplicate.plan_id) {
      throw new ValidationError('Members must be in the same plan to merge');
    }

    // Consolidate balances
    const mergedBalance = (Number(primary.current_balance) || 0) + (Number(duplicate.current_balance) || 0);
    const mergedEmployer = (Number(primary.total_employer_contributions) || 0) + (Number(duplicate.total_employer_contributions) || 0);
    const mergedEmployee = (Number(primary.total_employee_contributions) || 0) + (Number(duplicate.total_employee_contributions) || 0);
    const mergedEarnings = (Number(primary.total_earnings) || 0) + (Number(duplicate.total_earnings) || 0);

    // Update primary with merged totals
    await db.update(schema.ebtMembers).set({
      current_balance: String(mergedBalance),
      total_employer_contributions: String(mergedEmployer),
      total_employee_contributions: String(mergedEmployee),
      total_earnings: String(mergedEarnings),
      remarks: `Merged with ${duplicateMemberId}. ${primary.remarks ?? ''}`.trim(),
      updated_by: userId,
    }).where(eq(schema.ebtMembers.member_id, primaryMemberId));

    // Re-assign contributions from duplicate to primary
    await db.update(schema.ebtContributions).set({
      member_id: primaryMemberId,
      updated_by: userId,
    }).where(eq(schema.ebtContributions.member_id, duplicateMemberId));

    // Soft-delete duplicate
    await db.update(schema.ebtMembers).set({
      is_deleted: true,
      member_status: 'INACTIVE' as any,
      remarks: `Merged into ${primaryMemberId}`,
      updated_by: userId,
    }).where(eq(schema.ebtMembers.member_id, duplicateMemberId));

    return {
      primary_member_id: primaryMemberId,
      merged_member_id: duplicateMemberId,
      final_balance: mergedBalance,
    };
  },
};

// ─── Forfeiture ───────────────────────────────────────────────────────────────

export const pfForfeitureService = {
  /**
   * Compute forfeiture on separation. Unvested portion is returned to fund.
   */
  async computeForfeiture(memberId: string) {
    const [member] = await db.select().from(schema.ebtMembers)
      .where(eq(schema.ebtMembers.member_id, memberId)).limit(1);
    if (!member) throw new NotFoundError('Member not found');

    const balance = Number(member.current_balance) || 0;
    const vestPct = Number(member.vesting_percentage) || 0;
    const vestedAmount = balance * (vestPct / 100);
    const forfeitedAmount = balance - vestedAmount;

    return {
      member_id: memberId,
      total_balance: balance,
      vesting_percentage: vestPct,
      vested_amount: vestedAmount,
      forfeited_amount: forfeitedAmount,
    };
  },

  /** Execute forfeiture — debit unvested from member, credit to fund */
  async executeForfeiture(memberId: string, userId: string) {
    const result = await this.computeForfeiture(memberId);
    if (result.forfeited_amount <= 0) return { ...result, executed: false, reason: 'Nothing to forfeit' };

    // Reduce member balance to vested amount only
    await db.update(schema.ebtMembers).set({
      current_balance: String(result.vested_amount),
      total_withdrawals: sql`coalesce(${schema.ebtMembers.total_withdrawals}::numeric, 0) + ${result.forfeited_amount}`,
      remarks: `Forfeiture applied: ${result.forfeited_amount.toFixed(2)} (unvested)`,
      updated_by: userId,
    }).where(eq(schema.ebtMembers.member_id, memberId));

    return { ...result, executed: true };
  },
};

// ─── Fund Valuation / NAVPU ──────────────────────────────────────────────────

export const pfFundValuationService = {
  /** Record a daily fund valuation / NAVPU */
  async recordValuation(input: {
    plan_id: string;
    valuation_date: string;
    total_fund_assets: number;
    total_units_outstanding: number;
    userId: string;
  }) {
    if (input.total_units_outstanding <= 0) {
      throw new ValidationError('total_units_outstanding must be > 0');
    }
    const navpu = input.total_fund_assets / input.total_units_outstanding;

    // Get previous NAVPU
    const [prev] = await db.select({ navpu: schema.pfFundValuations.navpu })
      .from(schema.pfFundValuations)
      .where(eq(schema.pfFundValuations.plan_id, input.plan_id))
      .orderBy(desc(schema.pfFundValuations.valuation_date))
      .limit(1);

    const prevNavpu = prev ? Number(prev.navpu) : null;
    const dailyReturn = prevNavpu ? ((navpu - prevNavpu) / prevNavpu) * 100 : null;

    const [row] = await db.insert(schema.pfFundValuations).values({
      plan_id: input.plan_id,
      valuation_date: input.valuation_date,
      total_fund_assets: String(input.total_fund_assets),
      total_units_outstanding: String(input.total_units_outstanding),
      navpu: String(navpu),
      previous_navpu: prevNavpu !== null ? String(prevNavpu) : null,
      daily_return_pct: dailyReturn !== null ? String(dailyReturn) : null,
      created_by: input.userId,
      updated_by: input.userId,
    }).returning();

    return row;
  },

  /** Get valuation history for a plan */
  async getValuationHistory(planId: string, limit = 90) {
    return db.select().from(schema.pfFundValuations)
      .where(eq(schema.pfFundValuations.plan_id, planId))
      .orderBy(desc(schema.pfFundValuations.valuation_date))
      .limit(limit);
  },

  /** Get latest NAVPU for a plan */
  async getLatestNavpu(planId: string) {
    const [row] = await db.select().from(schema.pfFundValuations)
      .where(eq(schema.pfFundValuations.plan_id, planId))
      .orderBy(desc(schema.pfFundValuations.valuation_date))
      .limit(1);
    return row ?? null;
  },
};

// ─── Member Unit Balance ─────────────────────────────────────────────────────

export const pfMemberUnitService = {
  /** Record a unit transaction (subscription/redemption) */
  async recordUnitTransaction(input: {
    member_id: string;
    plan_id: string;
    transaction_date: string;
    transaction_type: string;
    amount: number;
    navpu: number;
    reference_id?: string;
    userId: string;
  }) {
    const units = input.amount / input.navpu;

    // Get current running units
    const [lastEntry] = await db.select({ running_units: schema.pfMemberUnits.running_units })
      .from(schema.pfMemberUnits)
      .where(
        and(
          eq(schema.pfMemberUnits.member_id, input.member_id),
          eq(schema.pfMemberUnits.plan_id, input.plan_id),
        ),
      )
      .orderBy(desc(schema.pfMemberUnits.id))
      .limit(1);

    const currentUnits = lastEntry ? Number(lastEntry.running_units) : 0;
    const isCredit = ['SUBSCRIPTION', 'CONTRIBUTION', 'TRANSFER_IN', 'EARNINGS'].includes(input.transaction_type);
    const newRunning = isCredit ? currentUnits + units : currentUnits - units;

    if (newRunning < 0) {
      throw new ValidationError('Insufficient units for redemption');
    }

    const [row] = await db.insert(schema.pfMemberUnits).values({
      member_id: input.member_id,
      plan_id: input.plan_id,
      transaction_date: input.transaction_date,
      transaction_type: input.transaction_type,
      units: String(isCredit ? units : -units),
      navpu_at_transaction: String(input.navpu),
      amount: String(isCredit ? input.amount : -input.amount),
      running_units: String(newRunning),
      reference_id: input.reference_id ?? null,
      created_by: input.userId,
      updated_by: input.userId,
    }).returning();

    return row;
  },

  /** Get unit ledger for a member */
  async getUnitLedger(memberId: string, planId: string) {
    return db.select().from(schema.pfMemberUnits)
      .where(
        and(
          eq(schema.pfMemberUnits.member_id, memberId),
          eq(schema.pfMemberUnits.plan_id, planId),
        ),
      )
      .orderBy(desc(schema.pfMemberUnits.id));
  },

  /** Get current unit balance */
  async getUnitBalance(memberId: string, planId: string) {
    const [last] = await db.select({
      running_units: schema.pfMemberUnits.running_units,
    })
      .from(schema.pfMemberUnits)
      .where(
        and(
          eq(schema.pfMemberUnits.member_id, memberId),
          eq(schema.pfMemberUnits.plan_id, planId),
        ),
      )
      .orderBy(desc(schema.pfMemberUnits.id))
      .limit(1);

    const units = last ? Number(last.running_units) : 0;

    // Get latest NAVPU to compute market value
    const latestNav = await pfFundValuationService.getLatestNavpu(planId);
    const navpu = latestNav ? Number(latestNav.navpu) : 1;
    const marketValue = units * navpu;

    return { member_id: memberId, plan_id: planId, units, navpu, market_value: marketValue };
  },
};

// ─── Loan Amortization ───────────────────────────────────────────────────────

export const pfLoanAmortizationService = {
  /** Generate amortization schedule for a loan */
  async generateSchedule(loanId: string, userId: string) {
    const [loan] = await db.select().from(schema.ebtLoans)
      .where(eq(schema.ebtLoans.loan_id, loanId)).limit(1);
    if (!loan) throw new NotFoundError('Loan not found');

    const principal = Number(loan.original_amount);
    const annualRate = Number(loan.interest_rate) || 0;
    const monthlyRate = annualRate / 100 / 12;

    // Calculate months from loan_date to maturity_date
    const start = new Date(loan.loan_date ?? new Date());
    const end = new Date(loan.maturity_date ?? new Date());
    const months = Math.max(
      1,
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
    );

    // PMT formula for fixed monthly payment
    let monthlyPayment: number;
    if (monthlyRate === 0) {
      monthlyPayment = principal / months;
    } else {
      monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
    }

    // Delete existing schedule
    await db.delete(schema.pfLoanAmortization).where(eq(schema.pfLoanAmortization.loan_id, loanId));

    const schedule = [];
    let remaining = principal;
    const currentDate = new Date(start);

    for (let i = 1; i <= months; i++) {
      currentDate.setMonth(currentDate.getMonth() + 1);
      const interest = remaining * monthlyRate;
      const principalPortion = Math.min(monthlyPayment - interest, remaining);
      remaining = Math.max(0, remaining - principalPortion);

      const [row] = await db.insert(schema.pfLoanAmortization).values({
        loan_id: loanId,
        installment_no: i,
        due_date: currentDate.toISOString().slice(0, 10),
        principal: String(principalPortion.toFixed(4)),
        interest: String(interest.toFixed(4)),
        total_payment: String((principalPortion + interest).toFixed(4)),
        remaining_balance: String(remaining.toFixed(4)),
        created_by: userId,
        updated_by: userId,
      }).returning();
      schedule.push(row);
    }

    return {
      loan_id: loanId,
      original_amount: principal,
      monthly_payment: monthlyPayment,
      total_interest: (monthlyPayment * months) - principal,
      total_months: months,
      schedule,
    };
  },

  /** Get amortization schedule */
  async getSchedule(loanId: string) {
    return db.select().from(schema.pfLoanAmortization)
      .where(eq(schema.pfLoanAmortization.loan_id, loanId))
      .orderBy(schema.pfLoanAmortization.installment_no);
  },
};

// ─── Benefit Payment Scheduling ──────────────────────────────────────────────

export const pfBenefitPaymentService = {
  /**
   * Schedule benefit payments — lump-sum or annuity.
   * Call after claim is APPROVED.
   */
  async schedulePayments(input: {
    claim_id: string;
    member_id: string;
    payment_mode: 'LUMP_SUM' | 'MONTHLY_ANNUITY' | 'QUARTERLY_ANNUITY';
    start_date: string;
    total_installments?: number;
    userId: string;
  }) {
    // Get claim amount
    const [claim] = await db.select().from(schema.ebtBenefitClaims)
      .where(eq(schema.ebtBenefitClaims.claim_id, input.claim_id)).limit(1);
    if (!claim) throw new NotFoundError('Claim not found');
    if (claim.claim_status !== 'APPROVED') {
      throw new ValidationError('Claim must be APPROVED to schedule payments');
    }

    const netAmount = Number(claim.net_benefit_amount) || 0;
    if (netAmount <= 0) throw new ValidationError('Net benefit amount must be > 0');

    // Delete any existing schedule for this claim
    await db.delete(schema.pfBenefitPayments).where(eq(schema.pfBenefitPayments.claim_id, input.claim_id));

    const payments = [];

    if (input.payment_mode === 'LUMP_SUM') {
      const [row] = await db.insert(schema.pfBenefitPayments).values({
        claim_id: input.claim_id,
        member_id: input.member_id,
        payment_mode: 'LUMP_SUM',
        scheduled_date: input.start_date,
        amount: String(netAmount),
        payment_status: 'SCHEDULED',
        sequence_no: 1,
        total_installments: 1,
        created_by: input.userId,
        updated_by: input.userId,
      }).returning();
      payments.push(row);
    } else {
      const installments = input.total_installments ?? (input.payment_mode === 'MONTHLY_ANNUITY' ? 12 : 4);
      const perInstallment = netAmount / installments;
      const monthIncrement = input.payment_mode === 'MONTHLY_ANNUITY' ? 1 : 3;

      const payDate = new Date(input.start_date);
      for (let i = 1; i <= installments; i++) {
        const [row] = await db.insert(schema.pfBenefitPayments).values({
          claim_id: input.claim_id,
          member_id: input.member_id,
          payment_mode: input.payment_mode,
          scheduled_date: payDate.toISOString().slice(0, 10),
          amount: String(i === installments ? (netAmount - perInstallment * (installments - 1)).toFixed(4) : perInstallment.toFixed(4)),
          payment_status: 'SCHEDULED',
          sequence_no: i,
          total_installments: installments,
          created_by: input.userId,
          updated_by: input.userId,
        }).returning();
        payments.push(row);
        payDate.setMonth(payDate.getMonth() + monthIncrement);
      }
    }

    // Update claim status to PROCESSING
    await db.update(schema.ebtBenefitClaims).set({
      claim_status: 'PROCESSING',
      updated_by: input.userId,
    }).where(eq(schema.ebtBenefitClaims.claim_id, input.claim_id));

    return { claim_id: input.claim_id, payment_mode: input.payment_mode, payments };
  },

  /** Get payment schedule for a claim */
  async getPaymentSchedule(claimId: string) {
    return db.select().from(schema.pfBenefitPayments)
      .where(eq(schema.pfBenefitPayments.claim_id, claimId))
      .orderBy(schema.pfBenefitPayments.sequence_no);
  },

  /** Mark a payment as paid */
  async markPaid(paymentId: number, reference: string, userId: string) {
    const [updated] = await db.update(schema.pfBenefitPayments).set({
      payment_status: 'PAID',
      paid_date: new Date().toISOString().slice(0, 10),
      payment_reference: reference,
      updated_by: userId,
    }).where(eq(schema.pfBenefitPayments.id, paymentId)).returning();
    if (!updated) throw new NotFoundError('Payment not found');

    // Check if all payments are complete → mark claim as RELEASED
    const remaining = await db.select({ count: sql<number>`count(*)` })
      .from(schema.pfBenefitPayments)
      .where(and(
        eq(schema.pfBenefitPayments.claim_id, updated.claim_id),
        sql`${schema.pfBenefitPayments.payment_status} != 'PAID'`,
      ));
    if (Number(remaining[0]?.count) === 0) {
      await db.update(schema.ebtBenefitClaims).set({
        claim_status: 'RELEASED',
        released_date: new Date().toISOString().slice(0, 10),
        updated_by: userId,
      }).where(eq(schema.ebtBenefitClaims.claim_id, updated.claim_id));
    }

    return updated;
  },
};
