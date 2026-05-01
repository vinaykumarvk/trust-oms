/**
 * account-management-service.ts — Account & Fund Management Service
 *
 * Covers BDO RFI gaps: AFM-01 through AFM-14
 * - Copy account (AFM-01)
 * - Project account linking (AFM-02, AFM-03, AFM-05)
 * - Mother accounts / consolidation (AFM-04)
 * - Dormant account monitoring (AFM-07, AFM-13)
 * - Auto close / reopen (AFM-08, AFM-09)
 * - Hold-out tagging (AFM-10, AFM-11)
 * - Family office fees (AFM-12)
 * - Fee sharing (AFM-14)
 * - Advanced loan/collateral (AFM-06) — covered by loan module
 */

import { eq, and, desc, asc, sql, lte, isNull } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { NotFoundError, ValidationError, ConflictError } from './service-errors';

function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export const accountManagementService = {
  // ─── AFM-01: Copy Account ────────────────────────────────────────────────────

  async copyAccount(sourcePortfolioId: string, overrides: Record<string, any>, userId: string) {
    const [source] = await db.select().from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, sourcePortfolioId)).limit(1);
    if (!source) throw new NotFoundError(`Portfolio ${sourcePortfolioId} not found`);

    const newId = generateId('PTF');
    const copyData: any = { ...source };
    delete copyData.id;
    copyData.portfolio_id = newId;
    copyData.portfolio_status = 'DRAFT';
    copyData.inception_date = new Date().toISOString().split('T')[0];
    copyData.created_by = userId;
    copyData.updated_by = userId;
    copyData.created_at = new Date();
    copyData.updated_at = new Date();

    // Apply overrides
    Object.assign(copyData, overrides);

    const [newPortfolio] = await db.insert(schema.portfolios).values(copyData).returning();
    return { ...newPortfolio, copied_from: sourcePortfolioId };
  },

  // ─── AFM-04: Account Groups (Mother Accounts) ───────────────────────────────

  async listAccountGroups(clientId?: string) {
    let conditions = [eq(schema.accountGroups.is_deleted, false)];
    if (clientId) conditions.push(eq(schema.accountGroups.parent_client_id, clientId));
    return db.select().from(schema.accountGroups)
      .where(and(...conditions))
      .orderBy(asc(schema.accountGroups.group_name));
  },

  async createAccountGroup(data: Record<string, any>, userId: string) {
    const groupId = generateId('AGR');
    const [group] = await db.insert(schema.accountGroups).values({
      group_id: groupId,
      group_name: data.group_name,
      parent_client_id: data.parent_client_id,
      group_type: data.group_type ?? 'MOTHER_ACCOUNT',
      description: data.description,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return group;
  },

  async addToGroup(groupId: string, portfolioId: string, userId: string) {
    const [existing] = await db.select().from(schema.accountGroupMembers)
      .where(and(
        eq(schema.accountGroupMembers.group_id, groupId),
        eq(schema.accountGroupMembers.portfolio_id, portfolioId),
      )).limit(1);
    if (existing) throw new ConflictError('Portfolio already in this group');

    const [member] = await db.insert(schema.accountGroupMembers).values({
      group_id: groupId,
      portfolio_id: portfolioId,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return member;
  },

  async getGroupMembers(groupId: string) {
    return db.select().from(schema.accountGroupMembers)
      .where(eq(schema.accountGroupMembers.group_id, groupId));
  },

  async getConsolidatedAum(groupId: string) {
    const members = await this.getGroupMembers(groupId);
    const portfolioIds = members.map((m: any) => m.portfolio_id);
    if (portfolioIds.length === 0) return { total_aum: '0', count: 0 };

    const portfolios = await db.select().from(schema.portfolios)
      .where(sql`${schema.portfolios.portfolio_id} = ANY(${portfolioIds})`);

    const totalAum = portfolios.reduce(
      (sum: number, p: any) => sum + parseFloat(p.aum ?? '0'), 0
    );
    return { total_aum: totalAum.toFixed(4), count: portfolios.length, portfolios };
  },

  // ─── AFM-02/03/05: Account Linking ───────────────────────────────────────────

  async createAccountLink(data: Record<string, any>, userId: string) {
    const linkId = generateId('ALK');
    const [link] = await db.insert(schema.accountLinks).values({
      link_id: linkId,
      source_portfolio_id: data.source_portfolio_id,
      target_portfolio_id: data.target_portfolio_id,
      link_type: data.link_type,
      funding_level: data.funding_level,
      funding_priority: data.funding_priority,
      description: data.description,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return link;
  },

  async getLinkedAccounts(portfolioId: string) {
    const asSource = await db.select().from(schema.accountLinks)
      .where(and(
        eq(schema.accountLinks.source_portfolio_id, portfolioId),
        eq(schema.accountLinks.is_deleted, false),
      ));
    const asTarget = await db.select().from(schema.accountLinks)
      .where(and(
        eq(schema.accountLinks.target_portfolio_id, portfolioId),
        eq(schema.accountLinks.is_deleted, false),
      ));
    return { outgoing: asSource, incoming: asTarget };
  },

  // ─── AFM-10/11: Hold-Out Tagging ────────────────────────────────────────────

  async listHolds(filters?: { client_id?: string; portfolio_id?: string }) {
    let conditions = [eq(schema.accountHolds.is_deleted, false), isNull(schema.accountHolds.release_date)];
    if (filters?.client_id) conditions.push(eq(schema.accountHolds.client_id, filters.client_id));
    if (filters?.portfolio_id) conditions.push(eq(schema.accountHolds.portfolio_id, filters.portfolio_id));
    return db.select().from(schema.accountHolds)
      .where(and(...conditions))
      .orderBy(desc(schema.accountHolds.created_at));
  },

  async createHold(data: Record<string, any>, userId: string) {
    const holdId = generateId('HLD');
    const [hold] = await db.insert(schema.accountHolds).values({
      hold_id: holdId,
      client_id: data.client_id,
      portfolio_id: data.portfolio_id,
      security_id: data.security_id,
      hold_type: data.hold_type,
      hold_scope: data.hold_scope,
      is_partial: data.is_partial ?? false,
      held_quantity: data.held_quantity,
      held_amount: data.held_amount,
      promissory_note_ref: data.promissory_note_ref,
      loan_amount_secured: data.loan_amount_secured,
      borrower_details: data.borrower_details,
      maturity_date: data.maturity_date,
      court_order_ref: data.court_order_ref,
      effective_date: data.effective_date ?? new Date().toISOString().split('T')[0],
      reason: data.reason,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return hold;
  },

  async releaseHold(holdId: string, userId: string, reason?: string) {
    const [hold] = await db.select().from(schema.accountHolds)
      .where(eq(schema.accountHolds.hold_id, holdId)).limit(1);
    if (!hold) throw new NotFoundError(`Hold ${holdId} not found`);
    if (hold.release_date) throw new ValidationError('Hold already released');

    const [released] = await db.update(schema.accountHolds)
      .set({
        release_date: new Date().toISOString().split('T')[0],
        released_by: userId,
        reason: reason ?? hold.reason,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.accountHolds.hold_id, holdId))
      .returning();
    return released;
  },

  async getHoldHistory(portfolioId: string) {
    return db.select().from(schema.accountHolds)
      .where(and(
        eq(schema.accountHolds.portfolio_id, portfolioId),
        eq(schema.accountHolds.is_deleted, false),
      ))
      .orderBy(desc(schema.accountHolds.created_at));
  },

  // ─── AFM-07/08/09: Dormancy Management ──────────────────────────────────────

  async getDormancyStatus(portfolioId: string) {
    const [status] = await db.select().from(schema.accountDormancy)
      .where(eq(schema.accountDormancy.portfolio_id, portfolioId)).limit(1);
    return status;
  },

  async markDormant(portfolioId: string, userId: string) {
    const existing = await this.getDormancyStatus(portfolioId);
    const now = new Date().toISOString().split('T')[0];

    if (existing) {
      const [updated] = await db.update(schema.accountDormancy)
        .set({
          dormancy_status: 'DORMANT',
          dormant_since: now,
          updated_by: userId,
          updated_at: new Date(),
        })
        .where(eq(schema.accountDormancy.portfolio_id, portfolioId))
        .returning();
      return updated;
    }

    const [record] = await db.insert(schema.accountDormancy).values({
      portfolio_id: portfolioId,
      dormancy_status: 'DORMANT',
      dormant_since: now,
      dormancy_trigger_date: now,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  async autoCloseAccount(portfolioId: string, reason: string, parameters: any, userId: string) {
    const dormancy = await this.getDormancyStatus(portfolioId);
    if (!dormancy || dormancy.dormancy_status !== 'DORMANT') {
      throw new ValidationError('Account must be DORMANT before auto-closing');
    }

    const [updated] = await db.update(schema.accountDormancy)
      .set({
        dormancy_status: 'CLOSED',
        closed_date: new Date().toISOString().split('T')[0],
        close_reason: reason,
        close_parameters: parameters,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.accountDormancy.portfolio_id, portfolioId))
      .returning();
    return updated;
  },

  async reopenAccount(portfolioId: string, reason: string, userId: string) {
    const dormancy = await this.getDormancyStatus(portfolioId);
    if (!dormancy || dormancy.dormancy_status !== 'CLOSED') {
      throw new ValidationError('Only CLOSED accounts can be reopened');
    }

    const [updated] = await db.update(schema.accountDormancy)
      .set({
        dormancy_status: 'ACTIVE',
        reopened_date: new Date().toISOString().split('T')[0],
        reopened_by: userId,
        reopen_reason: reason,
        closed_date: null,
        close_reason: null,
        dormant_since: null,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.accountDormancy.portfolio_id, portfolioId))
      .returning();
    return updated;
  },

  // ─── AFM-12/14: Fee Sharing ──────────────────────────────────────────────────

  async listFeeSharingArrangements(portfolioId?: string) {
    let conditions = [eq(schema.feeSharingArrangements.is_deleted, false)];
    if (portfolioId) conditions.push(eq(schema.feeSharingArrangements.portfolio_id, portfolioId));
    return db.select().from(schema.feeSharingArrangements)
      .where(and(...conditions))
      .orderBy(desc(schema.feeSharingArrangements.created_at));
  },

  async createFeeSharingArrangement(data: Record<string, any>, userId: string) {
    const arrangementId = generateId('FSA');
    const [arrangement] = await db.insert(schema.feeSharingArrangements).values({
      arrangement_id: arrangementId,
      portfolio_id: data.portfolio_id,
      client_id: data.client_id,
      arrangement_type: data.arrangement_type,
      counterparty_name: data.counterparty_name,
      counterparty_share_pct: data.counterparty_share_pct,
      trust_share_pct: data.trust_share_pct,
      fee_basis: data.fee_basis ?? 'AUM',
      billing_frequency: data.billing_frequency ?? 'MONTHLY',
      effective_date: data.effective_date,
      expiry_date: data.expiry_date,
      is_active: true,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return arrangement;
  },

  async updateFeeSharingArrangement(arrangementId: string, data: Record<string, any>, userId: string) {
    const [updated] = await db.update(schema.feeSharingArrangements)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.feeSharingArrangements.arrangement_id, arrangementId))
      .returning();
    if (!updated) throw new NotFoundError(`Arrangement ${arrangementId} not found`);
    return updated;
  },
};
