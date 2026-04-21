import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, lte, gte } from 'drizzle-orm';

export const ttraService = {
  async createApplication(data: {
    clientId: string;
    treatyCountry: string;
    corDocumentRef: string;
    effectiveFrom: string;
    effectiveTo: string;
  }) {
    const ttraId = `TTRA-${Date.now()}`;
    const effectiveTo = new Date(data.effectiveTo);
    const reviewDue = new Date(effectiveTo);
    reviewDue.setDate(reviewDue.getDate() - 60);

    const [result] = await db
      .insert(schema.ttraApplications)
      .values({
        ttra_id: ttraId,
        client_id: data.clientId,
        treaty_country: data.treatyCountry,
        cor_document_ref: data.corDocumentRef,
        ttra_status: 'APPLIED',
        effective_from: data.effectiveFrom,
        effective_to: data.effectiveTo,
        next_review_due: reviewDue.toISOString().split('T')[0],
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();

    return result;
  },

  async updateStatus(ttraId: string, newStatus: string, rulingNo?: string) {
    const [app] = await db
      .select()
      .from(schema.ttraApplications)
      .where(eq(schema.ttraApplications.ttra_id, ttraId));

    if (!app) throw new Error(`TTRA ${ttraId} not found`);

    const validTransitions: Record<string, string[]> = {
      APPLIED: ['UNDER_REVIEW', 'RENEWAL_PENDING'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED'],
      APPROVED: ['EXPIRED', 'RENEWAL_PENDING'],
      REJECTED: ['RENEWAL_PENDING'],
      EXPIRED: ['RENEWAL_PENDING'],
      RENEWAL_PENDING: ['APPLIED'],
    };

    const allowed = validTransitions[app.ttra_status || ''] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid transition from ${app.ttra_status} to ${newStatus}`);
    }

    const updateData: Record<string, any> = {
      ttra_status: newStatus,
      updated_by: 'system',
      updated_at: new Date(),
    };

    if (rulingNo) {
      updateData.bir_ctrr_ruling_no = rulingNo;
    }

    await db
      .update(schema.ttraApplications)
      .set(updateData)
      .where(eq(schema.ttraApplications.id, app.id));

    return { ...app, ...updateData };
  },

  async getExpiringApplications(daysAhead: number = 60) {
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const apps = await db
      .select()
      .from(schema.ttraApplications)
      .where(
        and(
          eq(schema.ttraApplications.ttra_status, 'APPROVED'),
          eq(schema.ttraApplications.is_deleted, false),
          lte(schema.ttraApplications.next_review_due, futureDate.toISOString().split('T')[0]),
          gte(schema.ttraApplications.next_review_due, today.toISOString().split('T')[0]),
        ),
      );

    return apps;
  },

  async processExpiryFallback() {
    const today = new Date().toISOString().split('T')[0];

    const expired = await db
      .select()
      .from(schema.ttraApplications)
      .where(
        and(
          eq(schema.ttraApplications.ttra_status, 'APPROVED'),
          eq(schema.ttraApplications.is_deleted, false),
          lte(schema.ttraApplications.effective_to, today),
        ),
      );

    let count = 0;
    for (const app of expired) {
      await db
        .update(schema.ttraApplications)
        .set({
          ttra_status: 'EXPIRED',
          updated_by: 'system-batch',
          updated_at: new Date(),
        })
        .where(eq(schema.ttraApplications.id, app.id));

      // Clear ttra_id on linked portfolios to force statutory rate fallback
      if (app.ttra_id) {
        await db
          .update(schema.portfolios)
          .set({ ttra_id: null, updated_by: 'system-batch', updated_at: new Date() })
          .where(eq(schema.portfolios.ttra_id, app.ttra_id));
      }
      count++;
    }

    return { expiredCount: count };
  },

  async sendExpiryReminders() {
    const milestones = [60, 30, 15, 1];
    const today = new Date();
    let remindersSent = 0;

    for (const days of milestones) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + days);
      const targetStr = targetDate.toISOString().split('T')[0];

      const apps = await db
        .select()
        .from(schema.ttraApplications)
        .where(
          and(
            eq(schema.ttraApplications.ttra_status, 'APPROVED'),
            eq(schema.ttraApplications.is_deleted, false),
            eq(schema.ttraApplications.effective_to, targetStr),
          ),
        );

      remindersSent += apps.length;
      // In production: send notifications to Tax Officer + Client
    }

    return { remindersSent };
  },

  async getApplications(filters: {
    status?: string;
    treatyCountry?: string;
    clientId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const all = await db
      .select()
      .from(schema.ttraApplications)
      .where(eq(schema.ttraApplications.is_deleted, false));

    let filtered = all;
    if (filters.status) filtered = filtered.filter((a: typeof all[number]) => a.ttra_status === filters.status);
    if (filters.treatyCountry) filtered = filtered.filter((a: typeof all[number]) => a.treaty_country === filters.treatyCountry);
    if (filters.clientId) filtered = filtered.filter((a: typeof all[number]) => a.client_id === filters.clientId);

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 25;
    const total = filtered.length;
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    return { data, total, page, pageSize };
  },

  async getApplicationById(ttraId: string) {
    const [app] = await db
      .select()
      .from(schema.ttraApplications)
      .where(
        and(
          eq(schema.ttraApplications.ttra_id, ttraId),
          eq(schema.ttraApplications.is_deleted, false),
        ),
      );
    return app || null;
  },

  async getDashboardSummary() {
    const all = await db
      .select()
      .from(schema.ttraApplications)
      .where(eq(schema.ttraApplications.is_deleted, false));

    const today = new Date();
    const sixtyDaysOut = new Date(today);
    sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);

    const byStatus = {
      applied: all.filter((a: typeof all[number]) => a.ttra_status === 'APPLIED').length,
      underReview: all.filter((a: typeof all[number]) => a.ttra_status === 'UNDER_REVIEW').length,
      approved: all.filter((a: typeof all[number]) => a.ttra_status === 'APPROVED').length,
      expired: all.filter((a: typeof all[number]) => a.ttra_status === 'EXPIRED').length,
      rejected: all.filter((a: typeof all[number]) => a.ttra_status === 'REJECTED').length,
      renewalPending: all.filter((a: typeof all[number]) => a.ttra_status === 'RENEWAL_PENDING').length,
    };

    const expiringSoon = all.filter((a: typeof all[number]) =>
      a.ttra_status === 'APPROVED' &&
      a.effective_to &&
      a.effective_to <= sixtyDaysOut.toISOString().split('T')[0] &&
      a.effective_to >= today.toISOString().split('T')[0]
    ).length;

    return { ...byStatus, expiringSoon, total: all.length };
  },
};
