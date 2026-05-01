/**
 * trust-account-enrichment-service.ts
 *
 * Closes Metrobank gaps MB-GAP-006, MB-GAP-007, MB-GAP-008, MB-GAP-009:
 * - Account metadata enrichment (sales officer, AMLA type, discretion, etc.)
 * - Joint account setup and relationship graph
 * - Special instructions with trigger dates and recurrence
 * - Closure validation, hold/garnishment lifecycle, status history, dormancy
 */

import { db } from '../db';
import { eq, and, sql, desc, lte, isNull, or } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { NotFoundError, ValidationError } from './service-errors';

// ─── MB-GAP-006: Account Metadata Enrichment ──────────────────────────────

export const accountMetadataService = {
  /** Update trust account enrichment fields */
  async updateMetadata(
    accountId: string,
    fields: {
      sales_officer_id?: number;
      account_officer_id?: number;
      portfolio_manager_id?: number;
      referring_unit?: string;
      tbg_division?: string;
      sa_no?: string;
      sa_name?: string;
      mailing_instructions?: Record<string, unknown>;
      statement_frequency?: string;
      amla_type?: string;
      discretion_flag?: boolean;
      tax_status?: string;
      escrow_contract_expiry?: string;
    },
    userId: string,
  ) {
    const existing = await db
      .select({ account_id: schema.trustAccounts.account_id })
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Trust account not found');

    const validFrequencies = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'ON_DEMAND'];
    if (fields.statement_frequency && !validFrequencies.includes(fields.statement_frequency)) {
      throw new ValidationError(`statement_frequency must be one of: ${validFrequencies.join(', ')}`);
    }
    const validAmla = ['LOW', 'NORMAL', 'HIGH', 'PEP'];
    if (fields.amla_type && !validAmla.includes(fields.amla_type)) {
      throw new ValidationError(`amla_type must be one of: ${validAmla.join(', ')}`);
    }
    const validTax = ['TAXABLE', 'TAX_EXEMPT', 'REDUCED_RATE'];
    if (fields.tax_status && !validTax.includes(fields.tax_status)) {
      throw new ValidationError(`tax_status must be one of: ${validTax.join(', ')}`);
    }

    const updatePayload: Record<string, unknown> = { updated_by: userId };
    if (fields.sales_officer_id !== undefined) updatePayload.sales_officer_id = fields.sales_officer_id;
    if (fields.account_officer_id !== undefined) updatePayload.account_officer_id = fields.account_officer_id;
    if (fields.portfolio_manager_id !== undefined) updatePayload.portfolio_manager_id = fields.portfolio_manager_id;
    if (fields.referring_unit !== undefined) updatePayload.referring_unit = fields.referring_unit;
    if (fields.tbg_division !== undefined) updatePayload.tbg_division = fields.tbg_division;
    if (fields.sa_no !== undefined) updatePayload.sa_no = fields.sa_no;
    if (fields.sa_name !== undefined) updatePayload.sa_name = fields.sa_name;
    if (fields.mailing_instructions !== undefined) updatePayload.mailing_instructions = fields.mailing_instructions;
    if (fields.statement_frequency !== undefined) updatePayload.statement_frequency = fields.statement_frequency;
    if (fields.amla_type !== undefined) updatePayload.amla_type = fields.amla_type;
    if (fields.discretion_flag !== undefined) updatePayload.discretion_flag = fields.discretion_flag;
    if (fields.tax_status !== undefined) updatePayload.tax_status = fields.tax_status;
    if (fields.escrow_contract_expiry !== undefined) updatePayload.escrow_contract_expiry = fields.escrow_contract_expiry;

    const [updated] = await db
      .update(schema.trustAccounts)
      .set(updatePayload)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .returning();
    return updated;
  },
};

// ─── MB-GAP-007: Joint Account & Relationship Graph ───────────────────────

export const jointAccountService = {
  /** Configure joint account type and max holders */
  async configureJointAccount(
    accountId: string,
    jointType: string,
    maxHolders: number,
    userId: string,
  ) {
    const validTypes = ['SOLE', 'JOINT_AND', 'JOINT_OR'];
    if (!validTypes.includes(jointType)) {
      throw new ValidationError(`joint_account_type must be one of: ${validTypes.join(', ')}`);
    }
    if (maxHolders < 1 || maxHolders > 20) {
      throw new ValidationError('max_joint_holders must be between 1 and 20');
    }
    if (jointType === 'SOLE' && maxHolders > 1) {
      throw new ValidationError('SOLE accounts can only have 1 holder');
    }

    // Validate current related parties count doesn't exceed max
    const parties = await db
      .select({ id: schema.trustRelatedParties.id })
      .from(schema.trustRelatedParties)
      .where(
        and(
          eq(schema.trustRelatedParties.trust_account_id, accountId),
          sql`${schema.trustRelatedParties.party_type} IN ('SETTLOR', 'CO_TRUSTEE', 'BENEFICIARY')`,
          eq(schema.trustRelatedParties.is_deleted, false),
        ),
      );
    if (parties.length > maxHolders) {
      throw new ValidationError(
        `Cannot set max_joint_holders to ${maxHolders} — account already has ${parties.length} holder-type parties`,
      );
    }

    const [updated] = await db
      .update(schema.trustAccounts)
      .set({ joint_account_type: jointType, max_joint_holders: maxHolders, updated_by: userId })
      .where(eq(schema.trustAccounts.account_id, accountId))
      .returning();
    return updated;
  },

  /** Get relationship graph for a trust account */
  async getRelationshipGraph(accountId: string) {
    const account = await db
      .select({
        account_id: schema.trustAccounts.account_id,
        account_name: schema.trustAccounts.account_name,
        client_id: schema.trustAccounts.client_id,
        joint_account_type: schema.trustAccounts.joint_account_type,
        max_joint_holders: schema.trustAccounts.max_joint_holders,
      })
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .limit(1);
    if (!account.length) throw new NotFoundError('Trust account not found');

    const parties = await db
      .select()
      .from(schema.trustRelatedParties)
      .where(
        and(
          eq(schema.trustRelatedParties.trust_account_id, accountId),
          eq(schema.trustRelatedParties.is_deleted, false),
        ),
      );

    // Group by party type for graph
    const graph: Record<string, Array<{
      id: number;
      legal_name: string;
      client_id: string | null;
      ownership_pct: string | null;
      signing_limit: string | null;
      is_ubo: boolean;
      is_authorized_signatory: boolean;
      kyc_status: string | null;
    }>> = {};

    for (const p of parties) {
      const type = p.party_type ?? 'OTHER';
      if (!graph[type]) graph[type] = [];
      graph[type].push({
        id: p.id,
        legal_name: p.legal_name,
        client_id: p.client_id,
        ownership_pct: p.ownership_pct,
        signing_limit: p.signing_limit,
        is_ubo: p.is_ubo,
        is_authorized_signatory: p.is_authorized_signatory,
        kyc_status: p.kyc_status,
      });
    }

    return {
      account: account[0],
      total_parties: parties.length,
      graph,
    };
  },

  /** Get cross-account relationship graph for a client */
  async getClientRelationshipGraph(clientId: string) {
    const accounts = await db
      .select({
        account_id: schema.trustAccounts.account_id,
        account_name: schema.trustAccounts.account_name,
        product_type: schema.trustAccounts.product_type,
        joint_account_type: schema.trustAccounts.joint_account_type,
      })
      .from(schema.trustAccounts)
      .where(
        and(
          eq(schema.trustAccounts.client_id, clientId),
          eq(schema.trustAccounts.is_deleted, false),
        ),
      );

    const result = [];
    for (const acct of accounts) {
      const parties = await db
        .select({
          party_type: schema.trustRelatedParties.party_type,
          legal_name: schema.trustRelatedParties.legal_name,
          ownership_pct: schema.trustRelatedParties.ownership_pct,
        })
        .from(schema.trustRelatedParties)
        .where(
          and(
            eq(schema.trustRelatedParties.trust_account_id, acct.account_id),
            eq(schema.trustRelatedParties.is_deleted, false),
          ),
        );
      result.push({ ...acct, parties });
    }
    return result;
  },
};

// ─── MB-GAP-008: Special Instructions ─────────────────────────────────────

export const specialInstructionService = {
  async create(input: {
    trust_account_id: string;
    instruction_type: string;
    title: string;
    description?: string;
    trigger_date?: string;
    recurrence_rule?: string;
    assigned_to?: number;
    userId: string;
  }) {
    const validTypes = ['BIRTHDAY', 'ANNIVERSARY', 'ESCROW_EXPIRY', 'MATURITY', 'RECURRING', 'ONE_TIME', 'CUSTOM'];
    if (!validTypes.includes(input.instruction_type)) {
      throw new ValidationError(`instruction_type must be one of: ${validTypes.join(', ')}`);
    }

    // Compute next trigger date
    let nextTrigger = input.trigger_date ?? null;
    if (input.recurrence_rule && input.recurrence_rule !== 'NONE' && input.trigger_date) {
      nextTrigger = computeNextTrigger(input.trigger_date, input.recurrence_rule);
    }

    const [row] = await db
      .insert(schema.trustSpecialInstructions)
      .values({
        trust_account_id: input.trust_account_id,
        instruction_type: input.instruction_type,
        title: input.title,
        description: input.description,
        trigger_date: input.trigger_date,
        recurrence_rule: input.recurrence_rule ?? 'NONE',
        next_trigger_date: nextTrigger,
        is_active: true,
        assigned_to: input.assigned_to,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .returning();
    return row;
  },

  async list(trustAccountId: string) {
    return db
      .select()
      .from(schema.trustSpecialInstructions)
      .where(
        and(
          eq(schema.trustSpecialInstructions.trust_account_id, trustAccountId),
          eq(schema.trustSpecialInstructions.is_deleted, false),
        ),
      )
      .orderBy(schema.trustSpecialInstructions.next_trigger_date);
  },

  async update(instrId: number, fields: Record<string, unknown>, userId: string) {
    const existing = await db
      .select()
      .from(schema.trustSpecialInstructions)
      .where(eq(schema.trustSpecialInstructions.id, instrId))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Special instruction not found');

    const payload: Record<string, unknown> = { ...fields, updated_by: userId };
    // Recompute next trigger if trigger_date or recurrence changed
    if (fields.trigger_date || fields.recurrence_rule) {
      const triggerDate = (fields.trigger_date as string) ?? existing[0].trigger_date;
      const recurrence = (fields.recurrence_rule as string) ?? existing[0].recurrence_rule;
      if (triggerDate && recurrence && recurrence !== 'NONE') {
        payload.next_trigger_date = computeNextTrigger(triggerDate, recurrence);
      }
    }

    const [updated] = await db
      .update(schema.trustSpecialInstructions)
      .set(payload)
      .where(eq(schema.trustSpecialInstructions.id, instrId))
      .returning();
    return updated;
  },

  async remove(instrId: number, userId: string) {
    const [updated] = await db
      .update(schema.trustSpecialInstructions)
      .set({ is_deleted: true, is_active: false, updated_by: userId })
      .where(eq(schema.trustSpecialInstructions.id, instrId))
      .returning();
    if (!updated) throw new NotFoundError('Special instruction not found');
    return updated;
  },

  /** Get all pending instructions due on or before today */
  async getPendingNotifications() {
    const today = new Date().toISOString().slice(0, 10);
    return db
      .select({
        id: schema.trustSpecialInstructions.id,
        trust_account_id: schema.trustSpecialInstructions.trust_account_id,
        instruction_type: schema.trustSpecialInstructions.instruction_type,
        title: schema.trustSpecialInstructions.title,
        description: schema.trustSpecialInstructions.description,
        next_trigger_date: schema.trustSpecialInstructions.next_trigger_date,
        assigned_to: schema.trustSpecialInstructions.assigned_to,
        account_name: schema.trustAccounts.account_name,
      })
      .from(schema.trustSpecialInstructions)
      .innerJoin(
        schema.trustAccounts,
        eq(schema.trustSpecialInstructions.trust_account_id, schema.trustAccounts.account_id),
      )
      .where(
        and(
          eq(schema.trustSpecialInstructions.is_active, true),
          eq(schema.trustSpecialInstructions.is_deleted, false),
          lte(schema.trustSpecialInstructions.next_trigger_date, today),
          isNull(schema.trustSpecialInstructions.notified_at),
        ),
      )
      .orderBy(schema.trustSpecialInstructions.next_trigger_date);
  },

  /** Mark instruction as notified and advance next trigger */
  async markNotified(instrId: number, userId: string) {
    const existing = await db
      .select()
      .from(schema.trustSpecialInstructions)
      .where(eq(schema.trustSpecialInstructions.id, instrId))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Special instruction not found');

    const instr = existing[0];
    const now = new Date();
    const payload: Record<string, unknown> = { notified_at: now, updated_by: userId };

    // Advance next trigger for recurring
    if (instr.recurrence_rule && instr.recurrence_rule !== 'NONE' && instr.next_trigger_date) {
      payload.next_trigger_date = computeNextTrigger(instr.next_trigger_date, instr.recurrence_rule);
      payload.notified_at = null; // Reset for next cycle
    } else {
      // One-time: deactivate
      payload.is_active = false;
    }

    const [updated] = await db
      .update(schema.trustSpecialInstructions)
      .set(payload)
      .where(eq(schema.trustSpecialInstructions.id, instrId))
      .returning();
    return updated;
  },
};

function computeNextTrigger(fromDate: string, rule: string): string {
  const d = new Date(fromDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Advance past today
  let result = new Date(d);
  const advance = () => {
    switch (rule) {
      case 'ANNUAL': result.setFullYear(result.getFullYear() + 1); break;
      case 'MONTHLY': result.setMonth(result.getMonth() + 1); break;
      case 'QUARTERLY': result.setMonth(result.getMonth() + 3); break;
      default: return;
    }
  };

  // Advance until we're in the future
  let safety = 0;
  while (result <= today && safety < 1000) {
    advance();
    safety++;
  }
  return result.toISOString().slice(0, 10);
}

// ─── MB-GAP-009: Closure Validation, Hold Lifecycle, Status History ───────

export const accountLifecycleService = {
  /** Validate if a trust account can be closed */
  async validateClosure(accountId: string): Promise<{
    canClose: boolean;
    blockers: string[];
  }> {
    const blockers: string[] = [];

    // Check account exists and get portfolio
    const account = await db
      .select({
        account_id: schema.trustAccounts.account_id,
        primary_portfolio_id: schema.trustAccounts.primary_portfolio_id,
        account_status: schema.trustAccounts.account_status,
      })
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .limit(1);
    if (!account.length) throw new NotFoundError('Trust account not found');
    if (account[0].account_status === 'CLOSED') {
      throw new ValidationError('Account is already closed');
    }

    const portfolioId = account[0].primary_portfolio_id;

    // Check holdings > 0
    if (portfolioId) {
      const holdings = await db
        .select({ total: sql<number>`coalesce(sum(${schema.positions.quantity}), 0)` })
        .from(schema.positions)
        .where(eq(schema.positions.portfolio_id, portfolioId));
      if (Number(holdings[0]?.total) > 0) {
        blockers.push('Account has outstanding holdings (positions with quantity > 0)');
      }

      // Check cash balance > 0
      const cash = await db
        .select({ total: sql<number>`coalesce(sum(${schema.cashLedger.balance}), 0)` })
        .from(schema.cashLedger)
        .where(eq(schema.cashLedger.portfolio_id, portfolioId));
      if (Number(cash[0]?.total) > 0) {
        blockers.push('Account has positive cash balance');
      }

      // Check pending orders
      const orders = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.portfolio_id, portfolioId),
            sql`${schema.orders.status} IN ('PENDING', 'SUBMITTED', 'APPROVED')`,
          ),
        );
      if (Number(orders[0]?.count) > 0) {
        blockers.push('Account has pending/submitted/approved orders');
      }

      // Check active holds
      const holds = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.accountHolds)
        .where(
          and(
            eq(schema.accountHolds.portfolio_id, portfolioId),
            eq(schema.accountHolds.status, 'active'),
            eq(schema.accountHolds.is_deleted, false),
          ),
        );
      if (Number(holds[0]?.count) > 0) {
        blockers.push('Account has active holds/garnishments');
      }
    }

    // Check unposted GL batches
    const unpostedGl = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glJournalBatches)
      .where(
        and(
          sql`${schema.glJournalBatches.batch_ref} LIKE ${'%' + accountId + '%'}`,
          sql`${schema.glJournalBatches.batch_status} IN ('DRAFT', 'PENDING')`,
        ),
      );
    if (Number(unpostedGl[0]?.count) > 0) {
      blockers.push('Account has unposted GL journal batches');
    }

    return { canClose: blockers.length === 0, blockers };
  },

  /** Close a trust account (with validation) */
  async closeAccount(accountId: string, reason: string, userId: string) {
    const validation = await this.validateClosure(accountId);
    if (!validation.canClose) {
      throw new ValidationError(`Cannot close account: ${validation.blockers.join('; ')}`);
    }

    const account = await db
      .select({ account_status: schema.trustAccounts.account_status })
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .limit(1);

    const previousStatus = account[0]?.account_status;
    const now = new Date();

    // Update account status
    const [updated] = await db
      .update(schema.trustAccounts)
      .set({
        account_status: 'CLOSED',
        closed_at: now,
        updated_by: userId,
      })
      .where(eq(schema.trustAccounts.account_id, accountId))
      .returning();

    // Record status history
    await db.insert(schema.trustAccountStatusHistory).values({
      trust_account_id: accountId,
      previous_status: previousStatus,
      new_status: 'CLOSED',
      change_reason: reason,
      changed_by: Number(userId) || null,
      effective_date: now.toISOString().slice(0, 10),
      created_by: userId,
      updated_by: userId,
    });

    // Record foundation event
    await db.insert(schema.trustAccountFoundationEvents).values({
      trust_account_id: accountId,
      event_type: 'ACCOUNT_CLOSED',
      payload: { reason, closed_by: userId },
      actor_id: Number(userId) || null,
      created_by: userId,
      updated_by: userId,
    });

    return updated;
  },

  /** Change account status with history tracking */
  async changeStatus(
    accountId: string,
    newStatus: string,
    reason: string,
    userId: string,
    approvalRequired = false,
  ) {
    const validStatuses = ['DRAFT', 'PENDING_DOCUMENTS', 'ACTIVE', 'SUSPENDED', 'CLOSED'];
    if (!validStatuses.includes(newStatus)) {
      throw new ValidationError(`Invalid status: ${newStatus}`);
    }

    if (newStatus === 'CLOSED') {
      return this.closeAccount(accountId, reason, userId);
    }

    const account = await db
      .select({ account_status: schema.trustAccounts.account_status })
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .limit(1);
    if (!account.length) throw new NotFoundError('Trust account not found');

    const previousStatus = account[0].account_status;

    const [updated] = await db
      .update(schema.trustAccounts)
      .set({
        account_status: newStatus as any,
        updated_by: userId,
        ...(newStatus === 'ACTIVE' ? { opened_at: new Date() } : {}),
      })
      .where(eq(schema.trustAccounts.account_id, accountId))
      .returning();

    await db.insert(schema.trustAccountStatusHistory).values({
      trust_account_id: accountId,
      previous_status: previousStatus,
      new_status: newStatus,
      change_reason: reason,
      changed_by: Number(userId) || null,
      effective_date: new Date().toISOString().slice(0, 10),
      approval_required: approvalRequired,
      created_by: userId,
      updated_by: userId,
    });

    return updated;
  },

  /** Get status history for an account */
  async getStatusHistory(accountId: string) {
    return db
      .select()
      .from(schema.trustAccountStatusHistory)
      .where(eq(schema.trustAccountStatusHistory.trust_account_id, accountId))
      .orderBy(desc(schema.trustAccountStatusHistory.id));
  },

  /** Place a hold/garnishment on a trust account */
  async placeHold(input: {
    trust_account_id: string;
    portfolio_id: string;
    hold_type: string;
    hold_scope: string;
    reason: string;
    court_order_ref?: string;
    effective_date?: string;
    security_id?: string;
    held_quantity?: number;
    held_amount?: number;
    userId: string;
  }) {
    const holdId = `HOLD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const [hold] = await db
      .insert(schema.accountHolds)
      .values({
        hold_id: holdId,
        client_id: null,
        portfolio_id: input.portfolio_id,
        security_id: input.security_id ?? null,
        hold_type: input.hold_type as any,
        hold_scope: input.hold_scope as any,
        is_partial: !!input.security_id,
        held_quantity: input.held_quantity ? String(input.held_quantity) : null,
        held_amount: input.held_amount ? String(input.held_amount) : null,
        effective_date: input.effective_date ?? new Date().toISOString().slice(0, 10),
        reason: input.reason,
        court_order_ref: input.court_order_ref ?? null,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .returning();

    // Record hold history
    await db.insert(schema.trustHoldHistory).values({
      hold_id: holdId,
      trust_account_id: input.trust_account_id,
      action: 'PLACED',
      previous_state: null,
      change_reason: input.reason,
      changed_by: Number(input.userId) || null,
      created_by: input.userId,
      updated_by: input.userId,
    });

    return hold;
  },

  /** Lift a hold (requires approval context) */
  async liftHold(
    holdId: string,
    reason: string,
    userId: string,
    approverId?: string,
  ) {
    const existing = await db
      .select()
      .from(schema.accountHolds)
      .where(eq(schema.accountHolds.hold_id, holdId))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Hold not found');

    const hold = existing[0];
    if (hold.release_date) throw new ValidationError('Hold is already lifted');

    const now = new Date();
    const [updated] = await db
      .update(schema.accountHolds)
      .set({
        release_date: now.toISOString().slice(0, 10),
        released_by: approverId ?? userId,
        status: 'released',
        updated_by: userId,
      })
      .where(eq(schema.accountHolds.hold_id, holdId))
      .returning();

    // Find linked trust account from hold history
    const historyRec = await db
      .select({ trust_account_id: schema.trustHoldHistory.trust_account_id })
      .from(schema.trustHoldHistory)
      .where(eq(schema.trustHoldHistory.hold_id, holdId))
      .limit(1);

    await db.insert(schema.trustHoldHistory).values({
      hold_id: holdId,
      trust_account_id: historyRec[0]?.trust_account_id ?? null,
      action: 'LIFTED',
      previous_state: { status: hold.status, effective_date: hold.effective_date },
      change_reason: reason,
      changed_by: Number(userId) || null,
      approved_by: approverId ? Number(approverId) || null : null,
      approved_at: approverId ? now : null,
      created_by: userId,
      updated_by: userId,
    });

    return updated;
  },

  /** Get holds for a trust account (via portfolio) */
  async getHoldsForAccount(accountId: string) {
    const account = await db
      .select({ primary_portfolio_id: schema.trustAccounts.primary_portfolio_id })
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .limit(1);
    if (!account.length) throw new NotFoundError('Trust account not found');

    const portfolioId = account[0].primary_portfolio_id;
    if (!portfolioId) return [];

    return db
      .select()
      .from(schema.accountHolds)
      .where(
        and(
          eq(schema.accountHolds.portfolio_id, portfolioId),
          eq(schema.accountHolds.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.accountHolds.id));
  },

  /** Get hold history for a trust account */
  async getHoldHistory(accountId: string) {
    return db
      .select()
      .from(schema.trustHoldHistory)
      .where(eq(schema.trustHoldHistory.trust_account_id, accountId))
      .orderBy(desc(schema.trustHoldHistory.id));
  },

  /** Link dormancy tracking to a trust account */
  async getDormancyForAccount(accountId: string) {
    const account = await db
      .select({ primary_portfolio_id: schema.trustAccounts.primary_portfolio_id })
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, accountId))
      .limit(1);
    if (!account.length) throw new NotFoundError('Trust account not found');

    const portfolioId = account[0].primary_portfolio_id;
    if (!portfolioId) return null;

    const dormancy = await db
      .select()
      .from(schema.accountDormancy)
      .where(eq(schema.accountDormancy.portfolio_id, portfolioId))
      .limit(1);
    return dormancy[0] ?? null;
  },
};
