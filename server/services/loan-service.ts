/**
 * loan-service.ts — Corporate Trust / Loan Management Service
 *
 * Core service for loan facility lifecycle: CRUD, status transitions,
 * participant management, and balance reconciliation.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, ilike, or, gte, lte, inArray } from 'drizzle-orm';
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from './service-errors';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateFacilityId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 9999) + 1;
  return `LF-${year}-${String(seq).padStart(4, '0')}`;
}

function generatePaymentId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 99999) + 1;
  return `LP-${year}-${String(seq).padStart(5, '0')}`;
}

function generateAvailmentId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 9999) + 1;
  return `AV-${year}-${String(seq).padStart(4, '0')}`;
}

function generateAmendmentId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 9999) + 1;
  return `AMD-${year}-${String(seq).padStart(4, '0')}`;
}

// ─── Loan Facility CRUD ─────────────────────────────────────────────────────────

export const loanService = {
  // ── List facilities ───────────────────────────────────────────────────────
  async listFacilities(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    loanType?: string;
    clientId?: string;
    search?: string;
    maturityFrom?: string;
    maturityTo?: string;
  }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [eq(schema.loanFacilities.is_deleted, false)];

    if (params.status) {
      conditions.push(eq(schema.loanFacilities.loan_status, params.status as any));
    }
    if (params.loanType) {
      conditions.push(eq(schema.loanFacilities.loan_type, params.loanType as any));
    }
    if (params.clientId) {
      conditions.push(eq(schema.loanFacilities.client_id, params.clientId));
    }
    if (params.search) {
      conditions.push(
        or(
          ilike(schema.loanFacilities.facility_id, `%${params.search}%`),
          ilike(schema.loanFacilities.facility_name, `%${params.search}%`),
        ),
      );
    }
    if (params.maturityFrom) {
      conditions.push(gte(schema.loanFacilities.maturity_date, params.maturityFrom));
    }
    if (params.maturityTo) {
      conditions.push(lte(schema.loanFacilities.maturity_date, params.maturityTo));
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [data, countResult] = await Promise.all([
      db.select().from(schema.loanFacilities)
        .where(where)
        .limit(pageSize)
        .offset(offset)
        .orderBy(desc(schema.loanFacilities.created_at)),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.loanFacilities)
        .where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
  },

  // ── Get single facility ───────────────────────────────────────────────────
  async getFacility(facilityId: string) {
    const [record] = await db.select().from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.facility_id, facilityId)).limit(1);
    if (!record) throw new NotFoundError('Loan facility not found');
    return record;
  },

  // ── Create facility ───────────────────────────────────────────────────────
  async createFacility(data: any, userId: string) {
    const facilityId = data.facility_id || generateFacilityId();

    // Check unique
    const [existing] = await db.select({ id: schema.loanFacilities.id })
      .from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.facility_id, facilityId)).limit(1);
    if (existing) throw new ConflictError(`Facility ID ${facilityId} already exists`);

    // Validate dates
    if (data.maturity_date && data.effective_date && data.maturity_date <= data.effective_date) {
      throw new ValidationError('Maturity date must be after effective date');
    }

    const [record] = await db.insert(schema.loanFacilities).values({
      ...data,
      facility_id: facilityId,
      loan_status: 'DRAFT',
      available_amount: data.facility_amount,
      outstanding_principal: '0',
      disbursed_amount: '0',
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  // ── Update facility ───────────────────────────────────────────────────────
  async updateFacility(facilityId: string, data: any, userId: string) {
    const facility = await this.getFacility(facilityId);

    if (!['DRAFT', 'PENDING_APPROVAL'].includes(facility.loan_status)) {
      throw new ForbiddenError('Can only edit facilities in DRAFT or PENDING_APPROVAL status');
    }

    if (data.maturity_date && data.effective_date && data.maturity_date <= data.effective_date) {
      throw new ValidationError('Maturity date must be after effective date');
    }

    const [updated] = await db.update(schema.loanFacilities)
      .set({ ...data, updated_at: new Date(), updated_by: userId })
      .where(eq(schema.loanFacilities.facility_id, facilityId))
      .returning();
    return updated;
  },

  // ── Status transitions ────────────────────────────────────────────────────
  async submitForApproval(facilityId: string, userId: string) {
    const facility = await this.getFacility(facilityId);
    if (facility.loan_status !== 'DRAFT') {
      throw new ValidationError('Only DRAFT facilities can be submitted for approval');
    }
    const [updated] = await db.update(schema.loanFacilities)
      .set({
        loan_status: 'PENDING_APPROVAL',
        maker_checker_status: 'PENDING',
        updated_at: new Date(),
        updated_by: userId,
      })
      .where(eq(schema.loanFacilities.facility_id, facilityId))
      .returning();
    return updated;
  },

  async approveFacility(facilityId: string, userId: string) {
    const facility = await this.getFacility(facilityId);
    if (facility.loan_status !== 'PENDING_APPROVAL') {
      throw new ValidationError('Only PENDING_APPROVAL facilities can be approved');
    }
    const [updated] = await db.update(schema.loanFacilities)
      .set({
        loan_status: 'APPROVED',
        maker_checker_status: 'APPROVED',
        approved_by: parseInt(userId, 10) || null,
        approved_at: new Date(),
        updated_at: new Date(),
        updated_by: userId,
      })
      .where(eq(schema.loanFacilities.facility_id, facilityId))
      .returning();
    return updated;
  },

  async activateFacility(facilityId: string, userId: string) {
    const facility = await this.getFacility(facilityId);
    if (facility.loan_status !== 'APPROVED') {
      throw new ValidationError('Only APPROVED facilities can be activated');
    }
    const [updated] = await db.update(schema.loanFacilities)
      .set({
        loan_status: 'ACTIVE',
        updated_at: new Date(),
        updated_by: userId,
      })
      .where(eq(schema.loanFacilities.facility_id, facilityId))
      .returning();
    return updated;
  },

  async closeFacility(facilityId: string, userId: string) {
    const facility = await this.getFacility(facilityId);
    if (parseFloat(facility.outstanding_principal ?? '0') > 0) {
      throw new ValidationError('Cannot close facility with outstanding principal');
    }
    const [updated] = await db.update(schema.loanFacilities)
      .set({ loan_status: 'CLOSED', updated_at: new Date(), updated_by: userId })
      .where(eq(schema.loanFacilities.facility_id, facilityId))
      .returning();
    return updated;
  },

  async defaultFacility(facilityId: string, userId: string) {
    const facility = await this.getFacility(facilityId);
    if (facility.loan_status !== 'ACTIVE') {
      throw new ValidationError('Only ACTIVE facilities can be marked as defaulted');
    }
    const [updated] = await db.update(schema.loanFacilities)
      .set({ loan_status: 'DEFAULTED', updated_at: new Date(), updated_by: userId })
      .where(eq(schema.loanFacilities.facility_id, facilityId))
      .returning();
    return updated;
  },

  // ── Participants (PSM-70: purchase/sale of loans) ─────────────────────────
  async listParticipants(facilityId: string) {
    return db.select().from(schema.loanParticipants)
      .where(and(
        eq(schema.loanParticipants.facility_id, facilityId),
        eq(schema.loanParticipants.is_deleted, false),
      ))
      .orderBy(desc(schema.loanParticipants.created_at));
  },

  async addParticipant(facilityId: string, data: any, userId: string) {
    await this.getFacility(facilityId); // ensure exists

    // Validate total share <= 100
    const existing = await this.listParticipants(facilityId);
    const totalShare = existing.reduce((sum: number, p: any) => sum + parseFloat(p.share_percentage ?? '0'), 0);
    const newShare = parseFloat(data.share_percentage ?? '0');
    if (totalShare + newShare > 100) {
      throw new ValidationError(`Total participant share would exceed 100% (current: ${totalShare}%, adding: ${newShare}%)`);
    }

    const [record] = await db.insert(schema.loanParticipants).values({
      ...data,
      facility_id: facilityId,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  async removeParticipant(participantId: number, userId: string) {
    const [updated] = await db.update(schema.loanParticipants)
      .set({ is_deleted: true, updated_at: new Date(), updated_by: userId })
      .where(eq(schema.loanParticipants.id, participantId))
      .returning();
    if (!updated) throw new NotFoundError('Participant not found');
    return updated;
  },

  // ── Availments / Drawdowns (PSM-80) ───────────────────────────────────────
  async listAvailments(facilityId: string) {
    return db.select().from(schema.loanAvailments)
      .where(and(
        eq(schema.loanAvailments.facility_id, facilityId),
        eq(schema.loanAvailments.is_deleted, false),
      ))
      .orderBy(desc(schema.loanAvailments.created_at));
  },

  async createAvailment(facilityId: string, data: any, userId: string) {
    const facility = await this.getFacility(facilityId);

    if (facility.loan_status !== 'ACTIVE') {
      throw new ValidationError('Availments can only be created for ACTIVE facilities');
    }

    const available = parseFloat(facility.available_amount ?? '0');
    const requestAmount = parseFloat(data.amount);
    if (requestAmount > available) {
      throw new ValidationError(`Availment amount (${requestAmount}) exceeds available amount (${available})`);
    }

    const availmentId = generateAvailmentId();
    const [record] = await db.insert(schema.loanAvailments).values({
      ...data,
      availment_id: availmentId,
      facility_id: facilityId,
      availment_status: 'REQUESTED',
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  async approveAvailment(availmentId: number, userId: string) {
    const [availment] = await db.select().from(schema.loanAvailments)
      .where(eq(schema.loanAvailments.id, availmentId)).limit(1);
    if (!availment) throw new NotFoundError('Availment not found');

    if (availment.availment_status !== 'REQUESTED') {
      throw new ValidationError('Only REQUESTED availments can be approved');
    }

    // Update availment status
    const [updated] = await db.update(schema.loanAvailments)
      .set({
        availment_status: 'APPROVED',
        approved_by: parseInt(userId, 10) || null,
        approved_at: new Date(),
        updated_at: new Date(),
        updated_by: userId,
      })
      .where(eq(schema.loanAvailments.id, availmentId))
      .returning();

    return updated;
  },

  async disburseAvailment(availmentId: number, userId: string) {
    const [availment] = await db.select().from(schema.loanAvailments)
      .where(eq(schema.loanAvailments.id, availmentId)).limit(1);
    if (!availment) throw new NotFoundError('Availment not found');

    if (availment.availment_status !== 'APPROVED') {
      throw new ValidationError('Only APPROVED availments can be disbursed');
    }

    const facility = await this.getFacility(availment.facility_id);
    const amount = parseFloat(availment.amount);
    const newDisbursed = parseFloat(facility.disbursed_amount ?? '0') + amount;
    const newOutstanding = parseFloat(facility.outstanding_principal ?? '0') + amount;
    const newAvailable = parseFloat(facility.facility_amount) - newDisbursed;

    // Update availment
    await db.update(schema.loanAvailments)
      .set({ availment_status: 'DISBURSED', updated_at: new Date(), updated_by: userId })
      .where(eq(schema.loanAvailments.id, availmentId));

    // Update facility balances
    await db.update(schema.loanFacilities)
      .set({
        disbursed_amount: newDisbursed.toFixed(4),
        outstanding_principal: newOutstanding.toFixed(4),
        available_amount: newAvailable.toFixed(4),
        updated_at: new Date(),
        updated_by: userId,
      })
      .where(eq(schema.loanFacilities.facility_id, availment.facility_id));

    return { availmentId, disbursed: amount, newOutstanding, newAvailable };
  },

  // ── Amendments (PSM-75) ───────────────────────────────────────────────────
  async listAmendments(facilityId: string) {
    return db.select().from(schema.loanAmendments)
      .where(and(
        eq(schema.loanAmendments.facility_id, facilityId),
        eq(schema.loanAmendments.is_deleted, false),
      ))
      .orderBy(desc(schema.loanAmendments.created_at));
  },

  async createAmendment(facilityId: string, data: any, userId: string) {
    const facility = await this.getFacility(facilityId);

    if (!['ACTIVE', 'RESTRUCTURED'].includes(facility.loan_status)) {
      throw new ValidationError('Amendments can only be made to ACTIVE or RESTRUCTURED facilities');
    }

    const amendmentId = generateAmendmentId();

    // If amending a field on the facility, apply the change
    if (data.field_changed && data.new_value !== undefined) {
      const fieldMap: Record<string, string> = {
        interest_rate: 'interest_rate',
        maturity_date: 'maturity_date',
        facility_amount: 'facility_amount',
        spread: 'spread',
        payment_frequency: 'payment_frequency',
      };
      const dbField = fieldMap[data.field_changed];
      if (dbField) {
        const updateData: any = {
          [dbField]: data.new_value,
          updated_at: new Date(),
          updated_by: userId,
        };
        await db.update(schema.loanFacilities)
          .set(updateData)
          .where(eq(schema.loanFacilities.facility_id, facilityId));
      }
    }

    const [record] = await db.insert(schema.loanAmendments).values({
      amendment_id: amendmentId,
      facility_id: facilityId,
      amendment_date: data.amendment_date || new Date().toISOString().split('T')[0],
      amendment_type: data.amendment_type,
      field_changed: data.field_changed,
      old_value: data.old_value,
      new_value: data.new_value,
      reason: data.reason,
      approved_by: parseInt(userId, 10) || null,
      approved_at: new Date(),
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  // ── Dashboard metrics ─────────────────────────────────────────────────────
  async getDashboardSummary() {
    const [summary] = await db.select({
      total_facilities: sql<number>`count(*)`,
      total_outstanding: sql<string>`coalesce(sum(${schema.loanFacilities.outstanding_principal}::numeric), 0)`,
      total_available: sql<string>`coalesce(sum(${schema.loanFacilities.available_amount}::numeric), 0)`,
      active_count: sql<number>`count(*) filter (where ${schema.loanFacilities.loan_status} = 'ACTIVE')`,
    }).from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.is_deleted, false));

    // Overdue payments
    const [overdue] = await db.select({
      overdue_count: sql<number>`count(*)`,
      overdue_amount: sql<string>`coalesce(sum(${schema.loanPayments.total_amount}::numeric), 0)`,
    }).from(schema.loanPayments)
      .where(and(
        eq(schema.loanPayments.payment_status, 'OVERDUE'),
        eq(schema.loanPayments.is_deleted, false),
      ));

    return {
      ...summary,
      overdue_count: overdue?.overdue_count ?? 0,
      overdue_amount: overdue?.overdue_amount ?? '0',
    };
  },

  async getUpcomingPayments(daysAhead: number = 15) {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];

    return db.select().from(schema.loanPayments)
      .where(and(
        eq(schema.loanPayments.is_deleted, false),
        inArray(schema.loanPayments.payment_status, ['SCHEDULED', 'DUE'] as any),
        gte(schema.loanPayments.scheduled_date, today),
        lte(schema.loanPayments.scheduled_date, futureDate),
      ))
      .orderBy(schema.loanPayments.scheduled_date);
  },

  async getOverduePayments() {
    return db.select().from(schema.loanPayments)
      .where(and(
        eq(schema.loanPayments.is_deleted, false),
        eq(schema.loanPayments.payment_status, 'OVERDUE'),
      ))
      .orderBy(schema.loanPayments.scheduled_date);
  },
};
