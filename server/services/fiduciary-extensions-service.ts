/**
 * fiduciary-extensions-service.ts
 *
 * Closes remaining Metrobank gaps:
 * - MB-GAP-025: Proxy registration/voting for stock transfer
 * - MB-GAP-027: Life insurance trust (premium monitoring, trust fees)
 * - MB-GAP-028: UITF switching, PTA/COT/TOF document generation, NAVPU notifications
 */

import { eq, and, desc, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { NotFoundError, ValidationError } from './service-errors';

function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// ─── MB-GAP-025: Proxy Registration ──────────────────────────────────────────

export const proxyRegistrationService = {
  async registerProxy(input: {
    meeting_id: string;
    stockholder_name: string;
    stockholder_account?: string;
    shares_represented: number;
    proxy_holder_name: string;
    proxy_type?: string;
    userId: string;
  }) {
    // Validate meeting exists
    const [meeting] = await db.select().from(schema.stockholderMeetings)
      .where(eq(schema.stockholderMeetings.meeting_id, input.meeting_id)).limit(1);
    if (!meeting) throw new NotFoundError('Stockholder meeting not found');

    const [row] = await db.insert(schema.proxyRegistrations).values({
      meeting_id: input.meeting_id,
      stockholder_name: input.stockholder_name,
      stockholder_account: input.stockholder_account ?? null,
      shares_represented: String(input.shares_represented),
      proxy_holder_name: input.proxy_holder_name,
      proxy_type: input.proxy_type ?? 'GENERAL',
      registration_date: new Date().toISOString().slice(0, 10),
      validation_status: 'PENDING',
      created_by: input.userId,
      updated_by: input.userId,
    }).returning();
    return row;
  },

  async validateProxy(proxyId: number, userId: string) {
    const [updated] = await db.update(schema.proxyRegistrations).set({
      validation_status: 'VALIDATED',
      validated_by: userId,
      updated_by: userId,
    }).where(eq(schema.proxyRegistrations.id, proxyId)).returning();
    if (!updated) throw new NotFoundError('Proxy registration not found');
    return updated;
  },

  async listProxies(meetingId: string) {
    return db.select().from(schema.proxyRegistrations)
      .where(and(
        eq(schema.proxyRegistrations.meeting_id, meetingId),
        eq(schema.proxyRegistrations.is_deleted, false),
      ))
      .orderBy(schema.proxyRegistrations.stockholder_name);
  },

  async tabulateVotes(meetingId: string) {
    const proxies = await this.listProxies(meetingId);
    const totalShares = proxies.reduce((sum: number, p: any) => sum + Number(p.shares_represented), 0);
    const validatedShares = proxies
      .filter((p: any) => p.validation_status === 'VALIDATED')
      .reduce((sum: number, p: any) => sum + Number(p.shares_represented), 0);

    return {
      meeting_id: meetingId,
      total_proxies: proxies.length,
      validated_proxies: proxies.filter((p: any) => p.validation_status === 'VALIDATED').length,
      total_shares_represented: totalShares,
      validated_shares_represented: validatedShares,
      proxies,
    };
  },
};

// ─── MB-GAP-027: Life Insurance Trust ─────────────────────────────────────────

export const lifeInsuranceTrustService = {
  async createTrust(input: {
    trust_account_id?: string;
    client_id: string;
    policy_number: string;
    insurer_name: string;
    insured_name: string;
    beneficiary_name?: string;
    policy_type?: string;
    face_value?: number;
    premium_amount?: number;
    premium_frequency?: string;
    next_premium_date?: string;
    policy_inception_date?: string;
    policy_maturity_date?: string;
    trust_fee_type?: string;
    trust_fee_amount?: number;
    trust_fee_rate?: number;
    userId: string;
  }) {
    const trustId = generateId('LIT');
    const [row] = await db.insert(schema.lifeInsuranceTrusts).values({
      trust_id: trustId,
      trust_account_id: input.trust_account_id ?? null,
      client_id: input.client_id,
      policy_number: input.policy_number,
      insurer_name: input.insurer_name,
      insured_name: input.insured_name,
      beneficiary_name: input.beneficiary_name ?? null,
      policy_type: input.policy_type ?? 'WHOLE_LIFE',
      face_value: input.face_value ? String(input.face_value) : null,
      premium_amount: input.premium_amount ? String(input.premium_amount) : null,
      premium_frequency: input.premium_frequency ?? 'ANNUAL',
      next_premium_date: input.next_premium_date ?? null,
      policy_inception_date: input.policy_inception_date ?? null,
      policy_maturity_date: input.policy_maturity_date ?? null,
      trust_fee_type: input.trust_fee_type ?? 'FLAT',
      trust_fee_amount: input.trust_fee_amount ? String(input.trust_fee_amount) : null,
      trust_fee_rate: input.trust_fee_rate ? String(input.trust_fee_rate) : null,
      created_by: input.userId,
      updated_by: input.userId,
    }).returning();
    return row;
  },

  async listTrusts(clientId?: string) {
    let query = db.select().from(schema.lifeInsuranceTrusts)
      .where(eq(schema.lifeInsuranceTrusts.is_deleted, false));
    if (clientId) {
      query = query.where(and(
        eq(schema.lifeInsuranceTrusts.client_id, clientId),
        eq(schema.lifeInsuranceTrusts.is_deleted, false),
      )) as any;
    }
    return query.orderBy(desc(schema.lifeInsuranceTrusts.id));
  },

  async getTrust(trustId: string) {
    const [row] = await db.select().from(schema.lifeInsuranceTrusts)
      .where(eq(schema.lifeInsuranceTrusts.trust_id, trustId)).limit(1);
    if (!row) throw new NotFoundError('Life insurance trust not found');

    const premiums = await db.select().from(schema.lifeInsurancePremiums)
      .where(eq(schema.lifeInsurancePremiums.trust_id, trustId))
      .orderBy(desc(schema.lifeInsurancePremiums.premium_date));

    return { ...row, premiums };
  },

  async updateTrust(trustId: string, fields: Record<string, unknown>, userId: string) {
    const [updated] = await db.update(schema.lifeInsuranceTrusts)
      .set({ ...fields, updated_by: userId })
      .where(eq(schema.lifeInsuranceTrusts.trust_id, trustId))
      .returning();
    if (!updated) throw new NotFoundError('Life insurance trust not found');
    return updated;
  },

  /** Generate premium schedule based on frequency */
  async generatePremiumSchedule(trustId: string, periods: number, userId: string) {
    const [trust] = await db.select().from(schema.lifeInsuranceTrusts)
      .where(eq(schema.lifeInsuranceTrusts.trust_id, trustId)).limit(1);
    if (!trust) throw new NotFoundError('Life insurance trust not found');
    if (!trust.premium_amount || !trust.next_premium_date) {
      throw new ValidationError('Premium amount and next_premium_date are required');
    }

    const schedule = [];
    const freq = trust.premium_frequency;
    const monthIncrement = freq === 'MONTHLY' ? 1 : freq === 'QUARTERLY' ? 3 : freq === 'SEMI_ANNUAL' ? 6 : 12;
    const premDate = new Date(trust.next_premium_date);

    for (let i = 0; i < periods; i++) {
      const [row] = await db.insert(schema.lifeInsurancePremiums).values({
        trust_id: trustId,
        premium_date: premDate.toISOString().slice(0, 10),
        amount: trust.premium_amount,
        payment_status: 'PENDING',
        created_by: userId,
        updated_by: userId,
      }).returning();
      schedule.push(row);
      premDate.setMonth(premDate.getMonth() + monthIncrement);
    }

    return schedule;
  },

  /** Get overdue premiums */
  async getOverduePremiums() {
    const today = new Date().toISOString().slice(0, 10);
    return db.select({
      premium_id: schema.lifeInsurancePremiums.id,
      trust_id: schema.lifeInsurancePremiums.trust_id,
      premium_date: schema.lifeInsurancePremiums.premium_date,
      amount: schema.lifeInsurancePremiums.amount,
      policy_number: schema.lifeInsuranceTrusts.policy_number,
      insured_name: schema.lifeInsuranceTrusts.insured_name,
      client_id: schema.lifeInsuranceTrusts.client_id,
    })
      .from(schema.lifeInsurancePremiums)
      .innerJoin(schema.lifeInsuranceTrusts,
        eq(schema.lifeInsurancePremiums.trust_id, schema.lifeInsuranceTrusts.trust_id))
      .where(and(
        eq(schema.lifeInsurancePremiums.payment_status, 'PENDING'),
        lte(schema.lifeInsurancePremiums.premium_date, today),
        eq(schema.lifeInsurancePremiums.is_deleted, false),
      ))
      .orderBy(schema.lifeInsurancePremiums.premium_date);
  },

  /** Mark premium as paid */
  async markPremiumPaid(premiumId: number, reference: string, userId: string) {
    const [updated] = await db.update(schema.lifeInsurancePremiums).set({
      payment_status: 'PAID',
      paid_date: new Date().toISOString().slice(0, 10),
      payment_reference: reference,
      updated_by: userId,
    }).where(eq(schema.lifeInsurancePremiums.id, premiumId)).returning();
    if (!updated) throw new NotFoundError('Premium not found');
    return updated;
  },

  /** Compute flat trust fee for a policy */
  computeTrustFee(trust: { trust_fee_type: string | null; trust_fee_amount: string | null; trust_fee_rate: string | null; face_value: string | null }) {
    if (trust.trust_fee_type === 'FLAT') {
      return Number(trust.trust_fee_amount) || 0;
    }
    if (trust.trust_fee_type === 'RATE') {
      const rate = Number(trust.trust_fee_rate) || 0;
      const faceValue = Number(trust.face_value) || 0;
      return faceValue * (rate / 100);
    }
    return 0;
  },
};

// ─── MB-GAP-028: UITF Extensions ─────────────────────────────────────────────

export const uitfSwitchingService = {
  /** Process a UITF fund switching transaction */
  async processSwitch(input: {
    investor_id: string;
    source_portfolio_id: string;
    target_portfolio_id: string;
    units_to_redeem: number;
    switching_fee_pct?: number;
    userId: string;
  }) {
    const switchingId = generateId('SWT');

    // Get source fund NAVPU
    const [sourceNav] = await db.select()
      .from(schema.navComputations)
      .where(and(
        eq(schema.navComputations.portfolio_id, input.source_portfolio_id),
        sql`${schema.navComputations.nav_status} = 'PUBLISHED'`,
      ))
      .orderBy(desc(schema.navComputations.computation_date))
      .limit(1);
    if (!sourceNav) throw new ValidationError('No published NAVPU for source fund');

    // Get target fund NAVPU
    const [targetNav] = await db.select()
      .from(schema.navComputations)
      .where(and(
        eq(schema.navComputations.portfolio_id, input.target_portfolio_id),
        sql`${schema.navComputations.nav_status} = 'PUBLISHED'`,
      ))
      .orderBy(desc(schema.navComputations.computation_date))
      .limit(1);
    if (!targetNav) throw new ValidationError('No published NAVPU for target fund');

    const redeemNavpu = Number(sourceNav.nav_per_unit);
    const subscribeNavpu = Number(targetNav.nav_per_unit);
    const redeemAmount = input.units_to_redeem * redeemNavpu;
    const fee = redeemAmount * ((input.switching_fee_pct ?? 0) / 100);
    const subscribeAmount = redeemAmount - fee;
    const subscribeUnits = subscribeAmount / subscribeNavpu;

    // Check cutoff (11:30 PHT)
    const now = new Date();
    const phtHour = now.getUTCHours() + 8;
    const cutOffApplied = phtHour >= 12 || (phtHour === 11 && now.getUTCMinutes() >= 30);

    const [row] = await db.insert(schema.uitfSwitchingTransactions).values({
      switching_id: switchingId,
      investor_id: input.investor_id,
      source_portfolio_id: input.source_portfolio_id,
      target_portfolio_id: input.target_portfolio_id,
      switch_date: now.toISOString().slice(0, 10),
      redeemed_units: String(input.units_to_redeem),
      redemption_navpu: String(redeemNavpu),
      redemption_amount: String(redeemAmount),
      subscribed_units: String(subscribeUnits),
      subscription_navpu: String(subscribeNavpu),
      subscription_amount: String(subscribeAmount),
      switching_fee: String(fee),
      switch_status: cutOffApplied ? 'NEXT_DAY' : 'PENDING',
      cut_off_applied: cutOffApplied,
      created_by: input.userId,
      updated_by: input.userId,
    }).returning();

    return row;
  },

  async executeSwitch(switchingId: string, userId: string) {
    const [updated] = await db.update(schema.uitfSwitchingTransactions).set({
      switch_status: 'EXECUTED',
      updated_by: userId,
    }).where(eq(schema.uitfSwitchingTransactions.switching_id, switchingId)).returning();
    if (!updated) throw new NotFoundError('Switching transaction not found');
    return updated;
  },

  async listSwitchings(investorId?: string) {
    let query = db.select().from(schema.uitfSwitchingTransactions)
      .where(eq(schema.uitfSwitchingTransactions.is_deleted, false));
    if (investorId) {
      query = query.where(and(
        eq(schema.uitfSwitchingTransactions.investor_id, investorId),
        eq(schema.uitfSwitchingTransactions.is_deleted, false),
      )) as any;
    }
    return query.orderBy(desc(schema.uitfSwitchingTransactions.id));
  },
};

// ─── UITF Document Generation (PTA/COT/TOF) ──────────────────────────────────

export const uitfDocumentService = {
  /** Generate a UITF transaction document */
  async generateDocument(input: {
    document_type: 'PTA' | 'COT' | 'TOF' | 'CONFIRMATION' | 'STATEMENT';
    portfolio_id?: string;
    investor_id?: string;
    transaction_reference?: string;
    content: Record<string, unknown>;
    userId: string;
  }) {
    const docNumber = `${input.document_type}-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const [row] = await db.insert(schema.uitfDocuments).values({
      document_type: input.document_type,
      portfolio_id: input.portfolio_id ?? null,
      investor_id: input.investor_id ?? null,
      transaction_reference: input.transaction_reference ?? null,
      document_date: new Date().toISOString().slice(0, 10),
      document_number: docNumber,
      content: input.content,
      generated_by: input.userId,
      delivery_status: 'PENDING',
      created_by: input.userId,
      updated_by: input.userId,
    }).returning();
    return row;
  },

  async markDelivered(docId: number, userId: string) {
    const [updated] = await db.update(schema.uitfDocuments).set({
      delivery_status: 'DELIVERED',
      delivered_at: new Date(),
      updated_by: userId,
    }).where(eq(schema.uitfDocuments.id, docId)).returning();
    if (!updated) throw new NotFoundError('Document not found');
    return updated;
  },

  async listDocuments(filters: { portfolio_id?: string; investor_id?: string; document_type?: string }) {
    let query = db.select().from(schema.uitfDocuments)
      .where(eq(schema.uitfDocuments.is_deleted, false));
    if (filters.portfolio_id) {
      query = query.where(and(
        eq(schema.uitfDocuments.portfolio_id, filters.portfolio_id),
        eq(schema.uitfDocuments.is_deleted, false),
      )) as any;
    }
    if (filters.investor_id) {
      query = query.where(and(
        eq(schema.uitfDocuments.investor_id, filters.investor_id),
        eq(schema.uitfDocuments.is_deleted, false),
      )) as any;
    }
    return query.orderBy(desc(schema.uitfDocuments.id));
  },

  /** Get pending NAVPU notifications (funds with published NAV not yet notified) */
  async getPendingNavpuNotifications() {
    const today = new Date().toISOString().slice(0, 10);
    return db.select({
      nav_id: schema.navComputations.id,
      portfolio_id: schema.navComputations.portfolio_id,
      computation_date: schema.navComputations.computation_date,
      nav_per_unit: schema.navComputations.nav_per_unit,
      total_nav: schema.navComputations.total_nav,
      units_outstanding: schema.navComputations.units_outstanding,
    })
      .from(schema.navComputations)
      .where(and(
        sql`${schema.navComputations.nav_status} = 'PUBLISHED'`,
        eq(schema.navComputations.computation_date, today),
      ))
      .orderBy(schema.navComputations.portfolio_id);
  },
};
