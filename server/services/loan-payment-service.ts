/**
 * loan-payment-service.ts — Loan Payment Processing
 *
 * PSM-72: Collection of principal and income repayments
 * PSM-73: Prepayments, rollovers, extensions
 * PSM-82: Monitoring of receivables and payables
 * PSM-93: Interest penalties for past-due
 * PSM-94: Pretermination penalties
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, lte, gte, inArray } from 'drizzle-orm';
import { NotFoundError, ValidationError } from './service-errors';
import { loanAmortizationService } from './loan-amortization-service';

function generatePaymentId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 99999) + 1;
  return `LP-${year}-${String(seq).padStart(5, '0')}`;
}

export const loanPaymentService = {
  // ── List payments for a facility ──────────────────────────────────────────
  async listPayments(facilityId: string, params?: { status?: string; page?: number; pageSize?: number }) {
    const page = params?.page ?? 1;
    const pageSize = Math.min(params?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [
      eq(schema.loanPayments.facility_id, facilityId),
      eq(schema.loanPayments.is_deleted, false),
    ];
    if (params?.status) {
      conditions.push(eq(schema.loanPayments.payment_status, params.status as any));
    }
    const where = and(...conditions);

    const [data, countResult] = await Promise.all([
      db.select().from(schema.loanPayments)
        .where(where).limit(pageSize).offset(offset)
        .orderBy(schema.loanPayments.scheduled_date),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.loanPayments).where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
  },

  // ── Record payment (PSM-72) ───────────────────────────────────────────────
  async recordPayment(facilityId: string, data: any, userId: string) {
    const [facility] = await db.select().from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.facility_id, facilityId)).limit(1);
    if (!facility) throw new NotFoundError('Facility not found');

    const principalAmount = parseFloat(data.principal_amount || '0');
    const interestAmount = parseFloat(data.interest_amount || '0');
    const penaltyAmount = parseFloat(data.penalty_amount || '0');
    const totalAmount = principalAmount + interestAmount + penaltyAmount;

    // WHT computation (default 20% on interest for PH)
    const whtRate = parseFloat(data.wht_rate || '0.20');
    const whtAmount = interestAmount * whtRate;
    const netAmount = totalAmount - whtAmount;

    const paymentId = generatePaymentId();

    const [payment] = await db.insert(schema.loanPayments).values({
      payment_id: paymentId,
      facility_id: facilityId,
      payment_type: data.payment_type || 'PRINCIPAL_AND_INTEREST',
      payment_status: 'PAID',
      scheduled_date: data.scheduled_date,
      actual_date: data.actual_date || new Date().toISOString().split('T')[0],
      principal_amount: principalAmount.toFixed(4),
      interest_amount: interestAmount.toFixed(4),
      penalty_amount: penaltyAmount.toFixed(4),
      total_amount: totalAmount.toFixed(4),
      payment_reference: data.payment_reference,
      wht_amount: whtAmount.toFixed(4),
      net_amount: netAmount.toFixed(4),
      is_prepayment: data.is_prepayment || false,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();

    // Update facility outstanding principal
    if (principalAmount > 0) {
      const newOutstanding = parseFloat(facility.outstanding_principal ?? '0') - principalAmount;
      const updateSet: any = {
        outstanding_principal: Math.max(0, newOutstanding).toFixed(4),
        updated_at: new Date(),
        updated_by: userId,
      };
      // For revolving credit, restore availability
      if (facility.loan_type === 'REVOLVING_CREDIT') {
        const newAvailable = parseFloat(facility.available_amount ?? '0') + principalAmount;
        updateSet.available_amount = newAvailable.toFixed(4);
      }
      await db.update(schema.loanFacilities)
        .set(updateSet)
        .where(eq(schema.loanFacilities.facility_id, facilityId));
    }

    // Mark matching amortization schedule entry as PAID
    if (data.scheduled_date) {
      await db.update(schema.loanAmortizationSchedules)
        .set({ payment_status: 'PAID', updated_at: new Date(), updated_by: userId } as any)
        .where(and(
          eq(schema.loanAmortizationSchedules.facility_id, facilityId),
          eq(schema.loanAmortizationSchedules.payment_date, data.scheduled_date),
        ));
    }

    return payment;
  },

  // ── Process prepayment with penalty (PSM-73, PSM-94) ──────────────────────
  async processPrepayment(facilityId: string, data: any, userId: string) {
    const [facility] = await db.select().from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.facility_id, facilityId)).limit(1);
    if (!facility) throw new NotFoundError('Facility not found');

    const prepaymentAmount = parseFloat(data.amount);
    const outstanding = parseFloat(facility.outstanding_principal ?? '0');

    if (prepaymentAmount > outstanding) {
      throw new ValidationError(`Prepayment amount (${prepaymentAmount}) exceeds outstanding principal (${outstanding})`);
    }

    // Calculate pretermination penalty
    let penaltyAmount = 0;
    if (facility.pretermination_penalty_rate) {
      const maturity = new Date(facility.maturity_date);
      const today = new Date();
      const remainingDays = Math.max(0, Math.round((maturity.getTime() - today.getTime()) / 86400000));

      penaltyAmount = loanAmortizationService.computePreterminationPenalty({
        outstandingPrincipal: prepaymentAmount,
        penaltyRate: parseFloat(facility.pretermination_penalty_rate),
        penaltyType: facility.pretermination_penalty_type || 'PERCENTAGE',
        remainingTenorDays: remainingDays,
      });
    }

    // Record the prepayment
    const payment = await this.recordPayment(facilityId, {
      payment_type: 'PREPAYMENT',
      principal_amount: prepaymentAmount.toFixed(4),
      interest_amount: '0',
      penalty_amount: penaltyAmount.toFixed(4),
      actual_date: data.actual_date || new Date().toISOString().split('T')[0],
      payment_reference: data.payment_reference,
      is_prepayment: true,
      wht_rate: '0',
      remarks: data.remarks || `Prepayment: ${prepaymentAmount}, Penalty: ${penaltyAmount.toFixed(2)}`,
    }, userId);

    // Regenerate amortization schedule if partial prepayment
    const newOutstanding = outstanding - prepaymentAmount;
    if (newOutstanding > 0) {
      await loanAmortizationService.generateAndSave(facilityId, userId);
    }

    return { payment, penaltyAmount: Math.round(penaltyAmount * 100) / 100, newOutstanding };
  },

  // ── Receivables & Aging (PSM-82) ──────────────────────────────────────────
  async listReceivables(params?: {
    facilityId?: string;
    agingBucket?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params?.page ?? 1;
    const pageSize = Math.min(params?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [eq(schema.loanReceivables.is_deleted, false)];
    if (params?.facilityId) {
      conditions.push(eq(schema.loanReceivables.facility_id, params.facilityId));
    }
    if (params?.agingBucket) {
      conditions.push(eq(schema.loanReceivables.aging_bucket, params.agingBucket));
    }
    const where = and(...conditions);

    const [data, countResult] = await Promise.all([
      db.select().from(schema.loanReceivables)
        .where(where).limit(pageSize).offset(offset)
        .orderBy(schema.loanReceivables.due_date),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.loanReceivables).where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
  },

  async getAgingSummary() {
    const result = await db.select({
      aging_bucket: schema.loanReceivables.aging_bucket,
      count: sql<number>`count(*)`,
      total_amount: sql<string>`coalesce(sum(${schema.loanReceivables.amount}::numeric), 0)`,
      total_balance: sql<string>`coalesce(sum(${schema.loanReceivables.balance}::numeric), 0)`,
    }).from(schema.loanReceivables)
      .where(eq(schema.loanReceivables.is_deleted, false))
      .groupBy(schema.loanReceivables.aging_bucket);
    return result;
  },

  // ── Mark overdue payments batch ───────────────────────────────────────────
  async markOverduePayments() {
    const today = new Date().toISOString().split('T')[0];
    const result = await db.update(schema.loanPayments)
      .set({ payment_status: 'OVERDUE', updated_at: new Date(), updated_by: 'SYSTEM' } as any)
      .where(and(
        eq(schema.loanPayments.is_deleted, false),
        inArray(schema.loanPayments.payment_status, ['SCHEDULED', 'DUE'] as any),
        lte(schema.loanPayments.scheduled_date, today),
      ))
      .returning();
    return result.length;
  },
};
