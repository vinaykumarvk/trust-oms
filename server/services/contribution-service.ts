/**
 * Contribution Service (Phase 3F)
 *
 * Handles recording, approval, and posting of cash contributions
 * to trust portfolios.
 *
 * Lifecycle: PENDING_APPROVAL -> APPROVED -> POSTED (credits cash ledger)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, or, sql } from 'drizzle-orm';
import { trustAccountFoundationService } from './trust-account-foundation-service';
import { exceptionQueueService } from './exception-queue-service';
import {
  contributionItemAgeDays,
  selectBestContributionMatch,
  type ContributionMatchDecision,
} from './contribution-matching-policy';

function actorToText(actor: string | number | null | undefined): string | null {
  if (actor === null || actor === undefined || actor === '') return null;
  return String(actor);
}

function buildSourceObjectUri(itemId: number | string): string {
  return `contribution-match://items/${itemId}`;
}

async function closeContributionException(
  exceptionId: number | null | undefined,
  actor: string | number | null | undefined,
  notes: string,
  resolutionCode: string,
  evidence: Record<string, unknown>,
): Promise<void> {
  if (!exceptionId) return;
  const actorId = actorToText(actor) ?? 'SYSTEM';
  try {
    await exceptionQueueService.assignException(exceptionId, actorId);
  } catch {
    // The exception may already be assigned or in a terminal state.
  }
  try {
    await exceptionQueueService.resolveException(exceptionId, notes, {
      resolution_code: resolutionCode,
      resolution_evidence: evidence,
      root_cause_code: 'CONTRIBUTION_MATCHING',
      resolved_by: actorId,
    });
  } catch {
    // Matching resolution must not fail just because the linked exception was already closed.
  }
}

export const contributionService = {
  /** Record a new contribution */
  async recordContribution(data: {
    portfolioId: string;
    amount: number;
    currency: string;
    sourceAccount: string;
    type: string;
    externalReference?: string;
    recordedBy?: number;
  }) {
    // Validate portfolio exists
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, data.portfolioId))
      .limit(1);

    if (!portfolio) {
      throw new Error(`Portfolio not found: ${data.portfolioId}`);
    }

    if (data.amount <= 0) {
      throw new Error('Contribution amount must be positive');
    }

    const [contribution] = await db
      .insert(schema.contributions)
      .values({
        portfolio_id: data.portfolioId,
        amount: String(data.amount),
        currency: data.currency,
        source_account: data.sourceAccount,
        external_reference: data.externalReference ?? null,
        type: data.type,
        contribution_status: 'PENDING_APPROVAL',
        match_status: 'AWAITING_INCOMING',
        match_evidence: {},
        created_by: data.recordedBy ? String(data.recordedBy) : null,
      })
      .returning();

    return contribution;
  },

  /** Approve a pending contribution */
  async approveContribution(contributionId: number, approvedBy: number, signerPartyIds: number[] = []) {
    const [contribution] = await db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId))
      .limit(1);

    if (!contribution) {
      throw new Error(`Contribution not found: ${contributionId}`);
    }

    if (contribution.contribution_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot approve contribution in status ${contribution.contribution_status}; must be PENDING_APPROVAL`,
      );
    }

    if (contribution.portfolio_id) {
      await trustAccountFoundationService.assertPortfolioMandateAuthority(contribution.portfolio_id, {
        action: 'contribution',
        amount: contribution.amount,
        signer_party_ids: signerPartyIds,
        actor_id: approvedBy,
        related_entity_type: 'CONTRIBUTION',
        related_entity_id: contributionId,
      });
    }

    const [updated] = await db
      .update(schema.contributions)
      .set({
        contribution_status: 'APPROVED',
        updated_by: String(approvedBy),
        updated_at: new Date(),
      })
      .where(eq(schema.contributions.id, contributionId))
      .returning();

    return updated;
  },

  /** Post an approved contribution to the cash ledger */
  async postContribution(contributionId: number) {
    const [contribution] = await db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId))
      .limit(1);

    if (!contribution) {
      throw new Error(`Contribution not found: ${contributionId}`);
    }

    if (contribution.contribution_status !== 'APPROVED') {
      throw new Error(
        `Cannot post contribution in status ${contribution.contribution_status}; must be APPROVED`,
      );
    }

    const portfolioId = contribution.portfolio_id;
    const currency = contribution.currency ?? 'PHP';
    const amount = parseFloat(contribution.amount ?? '0');

    if (!portfolioId) {
      throw new Error(`Contribution ${contributionId} has no portfolio_id`);
    }

    // Find or create cash ledger for portfolio + currency
    let [ledger] = await db
      .select()
      .from(schema.cashLedger)
      .where(
        and(
          eq(schema.cashLedger.portfolio_id, portfolioId),
          eq(schema.cashLedger.currency, currency),
        ),
      )
      .limit(1);

    const todayStr = new Date().toISOString().split('T')[0];

    if (!ledger) {
      const [newLedger] = await db
        .insert(schema.cashLedger)
        .values({
          portfolio_id: portfolioId,
          account_type: 'GENERAL',
          currency,
          balance: '0',
          available_balance: '0',
          as_of_date: todayStr,
        })
        .returning();
      ledger = newLedger;
    }

    // Insert cash transaction (credit)
    const [transaction] = await db
      .insert(schema.cashTransactions)
      .values({
        cash_ledger_id: ledger.id,
        type: 'CREDIT',
        amount: String(amount),
        currency,
        reference: `CONTRIB-${contributionId}`,
        value_date: todayStr,
      })
      .returning();

    // Atomic ledger balance increment — prevents lost-update race condition
    const [updatedLedger] = await db
      .update(schema.cashLedger)
      .set({
        balance: sql`(${schema.cashLedger.balance}::numeric + ${amount})::text`,
        available_balance: sql`(${schema.cashLedger.available_balance}::numeric + ${amount})::text`,
        as_of_date: todayStr,
        updated_at: new Date(),
      })
      .where(eq(schema.cashLedger.id, ledger.id))
      .returning();

    // FR-CON-006: Generate a tax event for the contribution.
    // In-kind contributions may trigger capital gains recognition;
    // cash contributions record the inflow for Documentary Stamp Tax (DST)
    // tracking where applicable under Philippine tax regulations.
    await db
      .insert(schema.taxEvents)
      .values({
        portfolio_id: portfolioId,
        tax_type: 'WHT',
        gross_amount: String(amount),
        tax_rate: '0',
        tax_amount: '0',
        source: 'CONTRIBUTION',
        filing_status: 'PENDING',
        certificate_ref: `CONTRIB-${contributionId}`,
      })
      .catch((err: unknown) => {
        // Non-blocking: tax event failure should not prevent contribution posting
        console.error('[ContributionService] Failed to create tax event:', err instanceof Error ? err.message : err);
      });

    // Mark contribution as POSTED
    const [updated] = await db
      .update(schema.contributions)
      .set({
        contribution_status: 'POSTED',
        updated_at: new Date(),
      })
      .where(eq(schema.contributions.id, contributionId))
      .returning();

    return {
      contribution: updated,
      ledger_id: ledger.id,
      transaction_id: transaction.id,
      amount,
      new_balance: parseFloat(updatedLedger.balance ?? '0'),
      tax_event_type: 'WHT',
    };
  },

  // ---------------------------------------------------------------------------
  // FR-CON-006: Unmatched Inventory View
  // ---------------------------------------------------------------------------

  /**
   * Query positions for a portfolio that don't have matching settlement
   * instructions yet. Returns each position with its security, quantity,
   * cost_basis, and matched / unmatched status.
   */
  async getUnmatchedInventory(portfolioId: string) {
    // Left-join positions to settlement instructions via orders -> trades.
    // A position is "matched" when there exists at least one settlement
    // instruction for a trade whose parent order is in the same portfolio
    // and for the same security.
    const rows = await db
      .select({
        position_id: schema.positions.id,
        security_id: schema.positions.security_id,
        security_name: schema.securities.name,
        quantity: schema.positions.quantity,
        cost_basis: schema.positions.cost_basis,
        as_of_date: schema.positions.as_of_date,
        settlement_count: sql<number>`COUNT(${schema.settlementInstructions.id})::int`,
      })
      .from(schema.positions)
      .leftJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .leftJoin(
        schema.orders,
        and(
          eq(schema.orders.portfolio_id, schema.positions.portfolio_id),
          eq(schema.orders.security_id, schema.positions.security_id),
        ),
      )
      .leftJoin(
        schema.trades,
        eq(schema.trades.order_id, schema.orders.order_id),
      )
      .leftJoin(
        schema.settlementInstructions,
        eq(schema.settlementInstructions.trade_id, schema.trades.trade_id),
      )
      .where(eq(schema.positions.portfolio_id, portfolioId))
      .groupBy(
        schema.positions.id,
        schema.positions.security_id,
        schema.securities.name,
        schema.positions.quantity,
        schema.positions.cost_basis,
        schema.positions.as_of_date,
      );

    return rows.map((r: typeof rows[number]) => ({
      position_id: r.position_id,
      security_id: r.security_id,
      security_name: r.security_name,
      quantity: parseFloat(r.quantity ?? '0'),
      cost_basis: parseFloat(r.cost_basis ?? '0'),
      as_of_date: r.as_of_date,
      status: r.settlement_count > 0 ? 'MATCHED' as const : 'UNMATCHED' as const,
    }));
  },

  /**
   * Live volume decrement — reduce a position's quantity when a settlement
   * match is posted. Throws if quantity would go negative.
   */
  async decrementInventory(positionId: number, quantity: number) {
    if (quantity <= 0) {
      throw new Error('Decrement quantity must be positive');
    }

    // Atomic decrement with WHERE guard — prevents TOCTOU race condition.
    // The WHERE clause ensures quantity >= requested, so concurrent calls
    // cannot drive the balance negative.
    const result = await db
      .update(schema.positions)
      .set({
        quantity: sql`(${schema.positions.quantity}::numeric - ${quantity})::text`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(schema.positions.id, positionId),
          sql`${schema.positions.quantity}::numeric >= ${quantity}`,
        ),
      )
      .returning();

    if (result.length === 0) {
      // Distinguish "not found" from "insufficient quantity"
      const [position] = await db
        .select()
        .from(schema.positions)
        .where(eq(schema.positions.id, positionId))
        .limit(1);

      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }
      const currentQty = parseFloat(position.quantity ?? '0');
      throw new Error(
        `Insufficient quantity: requested ${quantity} but position only has ${currentQty}`,
      );
    }

    const updated = result[0];
    const newQty = parseFloat(updated.quantity ?? '0');

    return {
      position_id: positionId,
      previous_quantity: newQty + quantity,
      decremented_by: quantity,
      new_quantity: newQty,
      position: updated,
    };
  },

  /**
   * Ingest an inbound cash/security contribution item and immediately attempt
   * deterministic matching against recorded contributions.
   */
  async ingestContributionMatchItem(data: {
    itemType?: 'CASH' | 'SECURITY';
    portfolioId?: string;
    trustAccountId?: string;
    currency?: string;
    amount?: number;
    securityId?: number;
    quantity?: number;
    sourceAccount?: string;
    externalReference: string;
    sourceSystem?: string;
    sourcePayload?: Record<string, unknown>;
    valueDate?: string;
    receivedAt?: Date;
    actorId?: string | number;
  }) {
    if (!data.externalReference) {
      throw new Error('externalReference is required');
    }
    if (!data.portfolioId && !data.trustAccountId) {
      throw new Error('portfolioId or trustAccountId is required');
    }
    if (data.itemType !== 'SECURITY' && (!data.currency || !data.amount || data.amount <= 0)) {
      throw new Error('Cash match items require positive amount and currency');
    }

    const now = new Date();
    const [item] = await db
      .insert(schema.contributionMatchItems)
      .values({
        item_type: data.itemType ?? 'CASH',
        portfolio_id: data.portfolioId ?? null,
        trust_account_id: data.trustAccountId ?? null,
        currency: data.currency ?? null,
        amount: data.amount === undefined ? null : String(data.amount),
        security_id: data.securityId ?? null,
        quantity: data.quantity === undefined ? null : String(data.quantity),
        source_account: data.sourceAccount ?? null,
        external_reference: data.externalReference,
        source_system: data.sourceSystem ?? 'MANUAL',
        source_payload: data.sourcePayload ?? {},
        received_at: data.receivedAt ?? now,
        value_date: data.valueDate ?? null,
        match_status: 'UNMATCHED',
        match_evidence: {},
        created_by: actorToText(data.actorId),
        updated_by: actorToText(data.actorId),
      })
      .returning();

    const candidates = data.portfolioId
      ? await db
          .select()
          .from(schema.contributions)
          .where(
            and(
              eq(schema.contributions.portfolio_id, data.portfolioId),
              data.currency ? eq(schema.contributions.currency, data.currency) : sql`true`,
            ),
          )
          .orderBy(desc(schema.contributions.created_at))
          .limit(50)
      : [];

    const decision = selectBestContributionMatch(item, candidates as any[]);
    if (decision.status === 'AUTO_MATCH' && decision.contribution_id) {
      const linked = await this.linkContributionMatchItem(item.id, decision.contribution_id, {
        matchedBy: data.actorId ?? 'SYSTEM',
        matchDecision: decision,
        notes: 'Auto-matched during inbound item ingestion.',
      });
      return { item: linked.item, contribution: linked.contribution, decision };
    }

    const exception = await exceptionQueueService.createException({
      exception_type: 'OTHER',
      exception_domain: 'CONTRIBUTIONS',
      severity: decision.status === 'REVIEW' ? 'P2' : 'P1',
      title: `Unmatched ${String(item.item_type).toLowerCase()} contribution ${item.external_reference}`,
      description: decision.status === 'REVIEW'
        ? 'Inbound contribution has a likely candidate but requires operations review.'
        : 'Inbound contribution could not be matched to a recorded contribution.',
      source_system: item.source_system ?? 'CONTRIBUTION_MATCHING',
      source_object_uri: buildSourceObjectUri(item.id),
      aggregate_type: 'CONTRIBUTION_MATCH_ITEM',
      aggregate_id: String(item.id),
      assigned_to_team: 'OPERATIONS',
      client_impact: true,
      details: {
        item_id: item.id,
        external_reference: item.external_reference,
        portfolio_id: item.portfolio_id,
        amount: item.amount,
        currency: item.currency,
        decision,
      },
    });

    const [updatedItem] = await db
      .update(schema.contributionMatchItems)
      .set({
        match_status: decision.status === 'REVIEW' ? 'INVESTIGATING' : 'UNMATCHED',
        match_evidence: { decision },
        exception_id: exception.id,
        updated_at: new Date(),
        updated_by: actorToText(data.actorId),
      })
      .where(eq(schema.contributionMatchItems.id, item.id))
      .returning();

    return { item: updatedItem, decision, exception };
  },

  /**
   * Re-run matching over unresolved inbound items.
   */
  async runContributionMatching(data: { limit?: number; actorId?: string | number } = {}) {
    const limit = Math.min(data.limit ?? 100, 500);
    const items = await db
      .select()
      .from(schema.contributionMatchItems)
      .where(
        or(
          eq(schema.contributionMatchItems.match_status, 'UNMATCHED'),
          eq(schema.contributionMatchItems.match_status, 'INVESTIGATING'),
        ),
      )
      .limit(limit);

    let matched = 0;
    let investigating = 0;
    let unmatched = 0;

    for (const item of items) {
      const candidates = item.portfolio_id
        ? await db
            .select()
            .from(schema.contributions)
            .where(
              and(
                eq(schema.contributions.portfolio_id, item.portfolio_id),
                item.currency ? eq(schema.contributions.currency, item.currency) : sql`true`,
              ),
            )
            .orderBy(desc(schema.contributions.created_at))
            .limit(50)
        : [];

      const decision = selectBestContributionMatch(item, candidates as any[]);
      if (decision.status === 'AUTO_MATCH' && decision.contribution_id) {
        await this.linkContributionMatchItem(item.id, decision.contribution_id, {
          matchedBy: data.actorId ?? 'SYSTEM',
          matchDecision: decision,
          notes: 'Auto-matched during contribution matching run.',
        });
        matched++;
      } else {
        await db
          .update(schema.contributionMatchItems)
          .set({
            match_status: decision.status === 'REVIEW' ? 'INVESTIGATING' : 'UNMATCHED',
            match_evidence: { decision },
            updated_at: new Date(),
            updated_by: actorToText(data.actorId),
          })
          .where(eq(schema.contributionMatchItems.id, item.id));
        if (decision.status === 'REVIEW') investigating++;
        else unmatched++;
      }
    }

    return { scanned: items.length, matched, investigating, unmatched };
  },

  /**
   * Manually link an inbound contribution item to a recorded contribution.
   */
  async linkContributionMatchItem(
    itemId: number,
    contributionId: number,
    options: {
      matchedBy?: string | number;
      notes?: string;
      matchDecision?: ContributionMatchDecision;
    } = {},
  ) {
    const [item] = await db
      .select()
      .from(schema.contributionMatchItems)
      .where(eq(schema.contributionMatchItems.id, itemId))
      .limit(1);

    if (!item) {
      throw new Error(`Contribution match item not found: ${itemId}`);
    }

    const [contribution] = await db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.id, contributionId))
      .limit(1);

    if (!contribution) {
      throw new Error(`Contribution not found: ${contributionId}`);
    }

    const decision = options.matchDecision
      ?? selectBestContributionMatch(item, [contribution as any]);
    const now = new Date();
    const matchedBy = actorToText(options.matchedBy) ?? 'SYSTEM';
    const evidence = {
      decision,
      notes: options.notes ?? null,
      item_external_reference: item.external_reference,
      linked_at: now.toISOString(),
    };

    const [updatedItem] = await db
      .update(schema.contributionMatchItems)
      .set({
        match_status: 'MATCHED',
        matched_contribution_id: contributionId,
        matched_at: now,
        matched_by: matchedBy,
        match_confidence: String(decision.confidence),
        match_method: decision.method === 'NO_ELIGIBLE_CANDIDATE' ? 'MANUAL_LINK' : decision.method,
        match_evidence: evidence,
        investigation_notes: options.notes ?? item.investigation_notes ?? null,
        updated_at: now,
        updated_by: matchedBy,
      })
      .where(eq(schema.contributionMatchItems.id, itemId))
      .returning();

    const [updatedContribution] = await db
      .update(schema.contributions)
      .set({
        match_status: 'MATCHED',
        matched_item_id: itemId,
        matched_at: now,
        matched_by: matchedBy,
        match_confidence: String(decision.confidence),
        match_evidence: evidence,
        external_reference: contribution.external_reference ?? item.external_reference,
        unmatched_reason: null,
        updated_at: now,
        updated_by: matchedBy,
      })
      .where(eq(schema.contributions.id, contributionId))
      .returning();

    await closeContributionException(
      item.exception_id,
      matchedBy,
      `Contribution match item ${itemId} linked to contribution ${contributionId}.`,
      'MATCHED',
      evidence,
    );

    return { item: updatedItem, contribution: updatedContribution, decision };
  },

  /**
   * Resolve an unmatched inbound item without linking it to a contribution.
   */
  async resolveContributionMatchItem(
    itemId: number,
    data: {
      resolutionCode: string;
      resolutionNotes?: string;
      resolutionEvidence?: Record<string, unknown>;
      resolvedBy?: string | number;
    },
  ) {
    if (!data.resolutionCode) {
      throw new Error('resolutionCode is required');
    }

    const [item] = await db
      .select()
      .from(schema.contributionMatchItems)
      .where(eq(schema.contributionMatchItems.id, itemId))
      .limit(1);

    if (!item) {
      throw new Error(`Contribution match item not found: ${itemId}`);
    }

    const now = new Date();
    const resolvedBy = actorToText(data.resolvedBy) ?? 'SYSTEM';
    const evidence = {
      ...(data.resolutionEvidence ?? {}),
      resolution_notes: data.resolutionNotes ?? null,
      resolved_at: now.toISOString(),
    };

    const [updated] = await db
      .update(schema.contributionMatchItems)
      .set({
        match_status: 'RESOLVED',
        resolved_at: now,
        resolution_code: data.resolutionCode,
        resolution_evidence: evidence,
        investigation_notes: data.resolutionNotes ?? item.investigation_notes ?? null,
        updated_at: now,
        updated_by: resolvedBy,
      })
      .where(eq(schema.contributionMatchItems.id, itemId))
      .returning();

    await closeContributionException(
      item.exception_id,
      resolvedBy,
      data.resolutionNotes ?? `Contribution match item ${itemId} resolved as ${data.resolutionCode}.`,
      data.resolutionCode,
      evidence,
    );

    return updated;
  },

  /** Operational workbench list for unmatched/investigating contribution items. */
  async getUnmatchedContributionInventory(filters: {
    portfolioId?: string;
    status?: string;
    itemType?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (filters.portfolioId) {
      conditions.push(eq(schema.contributionMatchItems.portfolio_id, filters.portfolioId));
    }
    if (filters.itemType) {
      conditions.push(eq(schema.contributionMatchItems.item_type, filters.itemType));
    }
    if (filters.status) {
      conditions.push(eq(schema.contributionMatchItems.match_status, filters.status));
    } else {
      conditions.push(
        or(
          eq(schema.contributionMatchItems.match_status, 'UNMATCHED'),
          eq(schema.contributionMatchItems.match_status, 'INVESTIGATING'),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(schema.contributionMatchItems)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.contributionMatchItems.received_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.contributionMatchItems)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return {
      data: rows.map((row: any) => ({
        ...row,
        age_days: contributionItemAgeDays(row.received_at),
      })),
      total,
      page,
      pageSize,
    };
  },

  /** List contributions with filters and pagination */
  async getContributions(filters: {
    portfolioId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.portfolioId) {
      conditions.push(eq(schema.contributions.portfolio_id, filters.portfolioId));
    }

    if (filters.status) {
      conditions.push(eq(schema.contributions.contribution_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.contributions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.contributions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.contributions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
