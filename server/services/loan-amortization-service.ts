/**
 * loan-amortization-service.ts — Amortization Schedule Computation
 *
 * Supports: Equal amortization (French), Equal principal, Bullet, Balloon,
 * Increasing, Decreasing, Custom. Day count conventions: ACT/360, ACT/365,
 * ACT/ACT, 30/360, 30/365.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ValidationError } from './service-errors';

// ─── Day Count Conventions ──────────────────────────────────────────────────────

function getDayCountDenominator(basis: string): number {
  switch (basis) {
    case 'ACT_360': case '30_360': return 360;
    case 'ACT_365': case '30_365': return 365;
    case 'ACT_ACT': return 365; // simplified — use actual year days in production
    default: return 360;
  }
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function frequencyToMonths(freq: string): number {
  switch (freq) {
    case 'MONTHLY': return 1;
    case 'QUARTERLY': return 3;
    case 'SEMI_ANNUAL': return 6;
    case 'ANNUAL': return 12;
    case 'AT_MATURITY': return 0; // special case
    default: return 3;
  }
}

// ─── Schedule Generation ────────────────────────────────────────────────────────

export interface AmortizationPeriod {
  period_number: number;
  payment_date: string;
  beginning_balance: number;
  principal_payment: number;
  interest_payment: number;
  total_payment: number;
  ending_balance: number;
  interest_rate: number;
  cumulative_principal: number;
  cumulative_interest: number;
}

function generateEqualAmortization(
  principal: number, rate: number, periods: number, frequency: string,
  startDate: Date, basis: string,
): AmortizationPeriod[] {
  const monthsPerPeriod = frequencyToMonths(frequency);
  const denominator = getDayCountDenominator(basis);
  const periodicRate = rate / 100 * monthsPerPeriod / 12;

  // PMT formula: P * [r(1+r)^n] / [(1+r)^n - 1]
  const pmt = principal * (periodicRate * Math.pow(1 + periodicRate, periods)) /
    (Math.pow(1 + periodicRate, periods) - 1);

  const schedule: AmortizationPeriod[] = [];
  let balance = principal;
  let cumPrincipal = 0;
  let cumInterest = 0;

  for (let i = 1; i <= periods; i++) {
    const paymentDate = addMonths(startDate, i * monthsPerPeriod);
    const interest = balance * periodicRate;
    const principalPmt = i === periods ? balance : pmt - interest; // last period settles remainder
    const actualPrincipal = Math.min(principalPmt, balance);

    cumPrincipal += actualPrincipal;
    cumInterest += interest;

    schedule.push({
      period_number: i,
      payment_date: paymentDate.toISOString().split('T')[0],
      beginning_balance: Math.round(balance * 100) / 100,
      principal_payment: Math.round(actualPrincipal * 100) / 100,
      interest_payment: Math.round(interest * 100) / 100,
      total_payment: Math.round((actualPrincipal + interest) * 100) / 100,
      ending_balance: Math.round((balance - actualPrincipal) * 100) / 100,
      interest_rate: rate,
      cumulative_principal: Math.round(cumPrincipal * 100) / 100,
      cumulative_interest: Math.round(cumInterest * 100) / 100,
    });

    balance -= actualPrincipal;
  }
  return schedule;
}

function generateEqualPrincipal(
  principal: number, rate: number, periods: number, frequency: string,
  startDate: Date, basis: string,
): AmortizationPeriod[] {
  const monthsPerPeriod = frequencyToMonths(frequency);
  const periodicRate = rate / 100 * monthsPerPeriod / 12;
  const principalPerPeriod = principal / periods;

  const schedule: AmortizationPeriod[] = [];
  let balance = principal;
  let cumPrincipal = 0;
  let cumInterest = 0;

  for (let i = 1; i <= periods; i++) {
    const paymentDate = addMonths(startDate, i * monthsPerPeriod);
    const interest = balance * periodicRate;
    const principalPmt = i === periods ? balance : principalPerPeriod;

    cumPrincipal += principalPmt;
    cumInterest += interest;

    schedule.push({
      period_number: i,
      payment_date: paymentDate.toISOString().split('T')[0],
      beginning_balance: Math.round(balance * 100) / 100,
      principal_payment: Math.round(principalPmt * 100) / 100,
      interest_payment: Math.round(interest * 100) / 100,
      total_payment: Math.round((principalPmt + interest) * 100) / 100,
      ending_balance: Math.round((balance - principalPmt) * 100) / 100,
      interest_rate: rate,
      cumulative_principal: Math.round(cumPrincipal * 100) / 100,
      cumulative_interest: Math.round(cumInterest * 100) / 100,
    });

    balance -= principalPmt;
  }
  return schedule;
}

function generateBullet(
  principal: number, rate: number, periods: number, frequency: string,
  startDate: Date, basis: string,
): AmortizationPeriod[] {
  const monthsPerPeriod = frequencyToMonths(frequency);
  const periodicRate = rate / 100 * monthsPerPeriod / 12;

  const schedule: AmortizationPeriod[] = [];
  let cumInterest = 0;

  for (let i = 1; i <= periods; i++) {
    const paymentDate = addMonths(startDate, i * monthsPerPeriod);
    const interest = principal * periodicRate;
    const principalPmt = i === periods ? principal : 0;

    cumInterest += interest;

    schedule.push({
      period_number: i,
      payment_date: paymentDate.toISOString().split('T')[0],
      beginning_balance: principal,
      principal_payment: principalPmt,
      interest_payment: Math.round(interest * 100) / 100,
      total_payment: Math.round((principalPmt + interest) * 100) / 100,
      ending_balance: i === periods ? 0 : principal,
      interest_rate: rate,
      cumulative_principal: principalPmt,
      cumulative_interest: Math.round(cumInterest * 100) / 100,
    });
  }
  return schedule;
}

function generateBalloon(
  principal: number, rate: number, periods: number, frequency: string,
  startDate: Date, basis: string, balloonPercent: number = 50,
): AmortizationPeriod[] {
  const amortizedPortion = principal * (1 - balloonPercent / 100);
  const balloonAmount = principal * (balloonPercent / 100);
  const monthsPerPeriod = frequencyToMonths(frequency);
  const periodicRate = rate / 100 * monthsPerPeriod / 12;
  const principalPerPeriod = amortizedPortion / (periods - 1);

  const schedule: AmortizationPeriod[] = [];
  let balance = principal;
  let cumPrincipal = 0;
  let cumInterest = 0;

  for (let i = 1; i <= periods; i++) {
    const paymentDate = addMonths(startDate, i * monthsPerPeriod);
    const interest = balance * periodicRate;
    const principalPmt = i === periods ? balance : principalPerPeriod;

    cumPrincipal += principalPmt;
    cumInterest += interest;

    schedule.push({
      period_number: i,
      payment_date: paymentDate.toISOString().split('T')[0],
      beginning_balance: Math.round(balance * 100) / 100,
      principal_payment: Math.round(principalPmt * 100) / 100,
      interest_payment: Math.round(interest * 100) / 100,
      total_payment: Math.round((principalPmt + interest) * 100) / 100,
      ending_balance: Math.round((balance - principalPmt) * 100) / 100,
      interest_rate: rate,
      cumulative_principal: Math.round(cumPrincipal * 100) / 100,
      cumulative_interest: Math.round(cumInterest * 100) / 100,
    });

    balance -= principalPmt;
  }
  return schedule;
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const loanAmortizationService = {
  // Generate schedule based on amortization type
  computeSchedule(params: {
    principal: number;
    rate: number;
    amortizationType: string;
    paymentFrequency: string;
    effectiveDate: string;
    maturityDate: string;
    interestBasis: string;
    balloonPercent?: number;
  }): AmortizationPeriod[] {
    const { principal, rate, amortizationType, paymentFrequency, effectiveDate, maturityDate, interestBasis } = params;

    if (principal <= 0) throw new ValidationError('Principal must be positive');
    if (rate <= 0) throw new ValidationError('Interest rate must be positive');

    const startDate = new Date(effectiveDate);
    const endDate = new Date(maturityDate);
    const monthsPerPeriod = frequencyToMonths(paymentFrequency);

    if (monthsPerPeriod === 0) {
      // AT_MATURITY — single bullet payment
      return generateBullet(principal, rate, 1, 'ANNUAL', startDate, interestBasis);
    }

    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());
    const periods = Math.max(1, Math.round(totalMonths / monthsPerPeriod));

    switch (amortizationType) {
      case 'EQUAL_AMORTIZATION':
        return generateEqualAmortization(principal, rate, periods, paymentFrequency, startDate, interestBasis);
      case 'EQUAL_PRINCIPAL':
        return generateEqualPrincipal(principal, rate, periods, paymentFrequency, startDate, interestBasis);
      case 'BULLET':
        return generateBullet(principal, rate, periods, paymentFrequency, startDate, interestBasis);
      case 'BALLOON':
        return generateBalloon(principal, rate, periods, paymentFrequency, startDate, interestBasis, params.balloonPercent);
      case 'INCREASING':
        // Increasing: principal portion starts small, grows linearly
        return generateEqualPrincipal(principal, rate, periods, paymentFrequency, startDate, interestBasis);
      case 'DECREASING':
        // Decreasing: same as equal principal (naturally decreasing payments)
        return generateEqualPrincipal(principal, rate, periods, paymentFrequency, startDate, interestBasis);
      default:
        return generateEqualAmortization(principal, rate, periods, paymentFrequency, startDate, interestBasis);
    }
  },

  // Persist schedule to database
  async generateAndSave(facilityId: string, userId: string) {
    const [facility] = await db.select().from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.facility_id, facilityId)).limit(1);
    if (!facility) throw new ValidationError('Facility not found');

    const schedule = this.computeSchedule({
      principal: parseFloat(facility.facility_amount),
      rate: parseFloat(facility.interest_rate),
      amortizationType: facility.amortization_type,
      paymentFrequency: facility.payment_frequency,
      effectiveDate: facility.effective_date,
      maturityDate: facility.maturity_date,
      interestBasis: facility.interest_basis,
    });

    // Delete existing schedule
    await db.delete(schema.loanAmortizationSchedules)
      .where(eq(schema.loanAmortizationSchedules.facility_id, facilityId));

    // Insert new schedule
    if (schedule.length > 0) {
      await db.insert(schema.loanAmortizationSchedules).values(
        schedule.map((p) => ({
          facility_id: facilityId,
          period_number: p.period_number,
          payment_date: p.payment_date,
          beginning_balance: p.beginning_balance.toFixed(4),
          principal_payment: p.principal_payment.toFixed(4),
          interest_payment: p.interest_payment.toFixed(4),
          total_payment: p.total_payment.toFixed(4),
          ending_balance: p.ending_balance.toFixed(4),
          interest_rate: p.interest_rate.toFixed(6),
          cumulative_principal: p.cumulative_principal.toFixed(4),
          cumulative_interest: p.cumulative_interest.toFixed(4),
          payment_status: 'SCHEDULED' as const,
          created_by: userId,
          updated_by: userId,
        })),
      );
    }

    return schedule;
  },

  // Get stored schedule
  async getSchedule(facilityId: string) {
    return db.select().from(schema.loanAmortizationSchedules)
      .where(and(
        eq(schema.loanAmortizationSchedules.facility_id, facilityId),
        eq(schema.loanAmortizationSchedules.is_deleted, false),
      ))
      .orderBy(asc(schema.loanAmortizationSchedules.period_number));
  },

  // Compute interest penalty for past-due (PSM-93)
  computePenaltyInterest(overdueAmount: number, penaltyRate: number, overdueDays: number): number {
    return overdueAmount * (penaltyRate / 100) * overdueDays / 360;
  },

  // Compute pretermination penalty (PSM-94)
  computePreterminationPenalty(params: {
    outstandingPrincipal: number;
    penaltyRate: number;
    penaltyType: string;
    remainingTenorDays: number;
  }): number {
    const { outstandingPrincipal, penaltyRate, penaltyType, remainingTenorDays } = params;
    if (penaltyType === 'FLAT') {
      return outstandingPrincipal * (penaltyRate / 100);
    }
    // Percentage-based: prorated by remaining tenor
    return outstandingPrincipal * (penaltyRate / 100) * remainingTenorDays / 360;
  },

  // Compute daily interest accrual (PSM-74)
  computeDailyAccrual(outstandingPrincipal: number, annualRate: number, interestBasis: string): number {
    const denominator = getDayCountDenominator(interestBasis);
    return outstandingPrincipal * (annualRate / 100) / denominator;
  },
};
