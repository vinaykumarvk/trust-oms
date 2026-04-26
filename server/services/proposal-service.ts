/**
 * Proposal Service (Investment Proposal Module)
 *
 * Manages the full lifecycle of investment proposals:
 *   DRAFT -> SUBMITTED -> L1_APPROVED -> COMPLIANCE_APPROVED -> SENT_TO_CLIENT -> CLIENT_ACCEPTED
 *
 * Includes:
 *   - Proposal CRUD with auto-generated proposal numbers
 *   - Line item management with allocation validation
 *   - Suitability checks against customer risk profiles
 *   - What-if portfolio analytics (return, std dev, Sharpe, max drawdown)
 *   - Multi-level approval workflow (L1 supervisor, compliance, client)
 *   - Reporting queries (pipeline, risk mismatch, product rating)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';
import { notificationInboxService } from './notification-inbox-service';

// TODO: These financial constants are hardcoded for the initial implementation.
// In a future iteration, move them to a configuration table (e.g. system_config
// or proposal_config) so they can be managed per entity without code changes.
// Ticket: RISK-CFG-001
const RISK_FREE_RATE = 6.5; // 6.5% annualized risk-free rate
const CONCENTRATION_LIMIT_PCT = 40; // No single asset class > 40%
const CLIENT_OFFER_EXPIRY_DAYS = 30; // Days before client offer expires

export const proposalService = {
  // ---------------------------------------------------------------------------
  // 1. Proposal CRUD
  // ---------------------------------------------------------------------------

  /**
   * List proposals with pagination, optional filters, and joins to customer / RM.
   */
  async listProposals(filters: {
    entityId?: string;
    rmId?: number;
    customerId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.investmentProposals.is_deleted, false),
    ];

    if (filters.entityId) {
      conditions.push(eq(schema.investmentProposals.entity_id, filters.entityId));
    }
    if (filters.rmId) {
      conditions.push(eq(schema.investmentProposals.rm_id, filters.rmId));
    }
    if (filters.customerId) {
      conditions.push(eq(schema.investmentProposals.customer_id, filters.customerId));
    }
    if (filters.status) {
      conditions.push(eq(schema.investmentProposals.proposal_status, filters.status as any));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const rows = await db
      .select({
        proposal: schema.investmentProposals,
        customer_name: schema.clients.legal_name,
        rm_name: schema.users.full_name,
      })
      .from(schema.investmentProposals)
      .leftJoin(schema.clients, eq(schema.investmentProposals.customer_id, schema.clients.client_id))
      .leftJoin(schema.users, eq(schema.investmentProposals.rm_id, schema.users.id))
      .where(whereClause)
      .orderBy(desc(schema.investmentProposals.created_at))
      .limit(pageSize)
      .offset(offset);

    const [countResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.investmentProposals)
      .where(whereClause);

    return {
      data: rows.map((r: any) => ({
        ...r.proposal,
        customer_name: r.customer_name,
        rm_name: r.rm_name,
      })),
      pagination: {
        page,
        pageSize,
        total: countResult?.total ?? 0,
        totalPages: Math.ceil((countResult?.total ?? 0) / pageSize),
      },
    };
  },

  /**
   * Get a single proposal by ID with its line items, approvals, and risk profile.
   */
  async getProposal(id: number) {
    const [proposal] = await db
      .select()
      .from(schema.investmentProposals)
      .where(and(eq(schema.investmentProposals.id, id), eq(schema.investmentProposals.is_deleted, false)));

    if (!proposal) {
      throw new Error(`Proposal not found: ${id}`);
    }

    const lineItems = await db
      .select()
      .from(schema.proposalLineItems)
      .where(eq(schema.proposalLineItems.proposal_id, id))
      .orderBy(schema.proposalLineItems.id);

    const approvals = await db
      .select()
      .from(schema.proposalApprovals)
      .where(eq(schema.proposalApprovals.proposal_id, id))
      .orderBy(desc(schema.proposalApprovals.acted_at));

    const [riskProfile] = await db
      .select()
      .from(schema.customerRiskProfiles)
      .where(eq(schema.customerRiskProfiles.id, proposal.risk_profile_id));

    return {
      ...proposal,
      lineItems,
      approvals,
      riskProfile: riskProfile ?? null,
    };
  },

  /**
   * Create a new proposal in DRAFT status.
   * Auto-generates proposal_number as PROP-YYYYMMDD-XXXX.
   * Validates the customer has an active, non-expired risk profile.
   */
  async createProposal(data: {
    customer_id: string;
    risk_profile_id?: number;
    title: string;
    investment_objective: string;
    time_horizon_years: number;
    proposed_amount: string;
    currency?: string;
    rm_id: number;
    entity_id?: string;
    created_by?: string;
  }) {
    // Auto-resolve risk_profile_id if not provided
    if (!data.risk_profile_id && data.customer_id) {
      const activeProfile = await db.select().from(schema.customerRiskProfiles)
        .where(and(
          eq(schema.customerRiskProfiles.customer_id, data.customer_id),
          eq(schema.customerRiskProfiles.is_active, true),
        )).limit(1);
      if (activeProfile.length > 0) {
        data.risk_profile_id = activeProfile[0].id;
      }
    }

    if (!data.risk_profile_id) {
      throw new Error(`No active risk profile found for customer ${data.customer_id}. Please provide risk_profile_id or ensure the customer has an active risk profile.`);
    }

    // Validate risk profile is active and not expired
    const [riskProfile] = await db
      .select()
      .from(schema.customerRiskProfiles)
      .where(
        and(
          eq(schema.customerRiskProfiles.id, data.risk_profile_id),
          eq(schema.customerRiskProfiles.customer_id, data.customer_id),
        ),
      );

    if (!riskProfile) {
      throw new Error(`Risk profile ${data.risk_profile_id} not found for customer ${data.customer_id}`);
    }
    if (!riskProfile.is_active) {
      throw new Error('Customer risk profile is not active');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (riskProfile.expiry_date && riskProfile.expiry_date < today) {
      throw new Error(`Customer risk profile expired on ${riskProfile.expiry_date}`);
    }

    // Generate proposal number: PROP-YYYYMMDD-XXXX with retry for race condition
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PROP-${dateStr}-`;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const [seqResult] = await db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(schema.investmentProposals)
          .where(ilike(schema.investmentProposals.proposal_number, `${prefix}%`));

        const seq = (seqResult?.cnt ?? 0) + 1 + attempt;
        const proposalNumber = `${prefix}${String(seq).padStart(4, '0')}`;

        const [inserted] = await db
          .insert(schema.investmentProposals)
          .values({
            proposal_number: proposalNumber,
            customer_id: data.customer_id,
            risk_profile_id: data.risk_profile_id,
            title: data.title,
            investment_objective: data.investment_objective as any,
            time_horizon_years: data.time_horizon_years,
            proposed_amount: data.proposed_amount,
            currency: data.currency ?? 'INR',
            proposal_status: 'DRAFT',
            rm_id: data.rm_id,
            entity_id: data.entity_id ?? 'default',
            created_by: data.created_by ?? null,
            updated_by: data.created_by ?? null,
          })
          .returning();

        return inserted;
      } catch (err: any) {
        // Retry on unique constraint violation (duplicate proposal number)
        const isDuplicate = err?.code === '23505' || err?.message?.includes('duplicate') || err?.message?.includes('unique');
        if (isDuplicate && attempt < MAX_RETRIES - 1) {
          continue;
        }
        throw err;
      }
    }

    throw new Error('Failed to generate a unique proposal number after maximum retries');
  },

  /**
   * Update a proposal. Only DRAFT status proposals may be edited.
   * Increments version on each update. Requires `version` for optimistic locking.
   */
  async updateProposal(
    id: number,
    data: Record<string, unknown>,
  ) {
    const expectedVersion = data.version as number | undefined;
    if (expectedVersion == null) {
      const err = new Error('version field is required for optimistic locking');
      (err as any).code = 'VERSION_CONFLICT';
      throw err;
    }

    const [current] = await db
      .select()
      .from(schema.investmentProposals)
      .where(and(eq(schema.investmentProposals.id, id), eq(schema.investmentProposals.is_deleted, false)));

    if (!current) {
      throw new Error(`Proposal not found: ${id}`);
    }
    if (current.proposal_status !== 'DRAFT') {
      throw new Error(`Cannot edit proposal in ${current.proposal_status} status. Only DRAFT proposals can be edited.`);
    }

    const allowedFields = [
      'title', 'investment_objective', 'time_horizon_years',
      'proposed_amount', 'currency', 'risk_profile_id',
    ];

    const setValues: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: (data.updated_by as string) ?? null,
      version: (current.version ?? 1) + 1,
    };

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        setValues[field] = data[field];
      }
    }

    const [updated] = await db
      .update(schema.investmentProposals)
      .set(setValues as any)
      .where(
        and(
          eq(schema.investmentProposals.id, id),
          eq(schema.investmentProposals.version, expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      const err = new Error(
        `Proposal ${id} has been modified by another user. Expected version ${expectedVersion} but found ${current.version}.`,
      );
      (err as any).code = 'VERSION_CONFLICT';
      throw err;
    }

    return updated;
  },

  /**
   * Soft-delete a proposal. Only DRAFT proposals may be deleted.
   */
  async deleteProposal(id: number) {
    const [current] = await db
      .select()
      .from(schema.investmentProposals)
      .where(and(eq(schema.investmentProposals.id, id), eq(schema.investmentProposals.is_deleted, false)));

    if (!current) {
      throw new Error(`Proposal not found: ${id}`);
    }
    if (current.proposal_status !== 'DRAFT') {
      throw new Error(`Cannot delete proposal in ${current.proposal_status} status. Only DRAFT proposals can be deleted.`);
    }

    const [deleted] = await db
      .update(schema.investmentProposals)
      .set({ is_deleted: true, updated_at: new Date() } as any)
      .where(eq(schema.investmentProposals.id, id))
      .returning();

    return deleted;
  },

  // ---------------------------------------------------------------------------
  // 2. Line Item Management
  // ---------------------------------------------------------------------------

  /**
   * Add a line item to a proposal. Validates that total allocation does not exceed 100%.
   */
  async addLineItem(
    proposalId: number,
    data: {
      asset_class: string;
      product_id?: string;
      product_name?: string;
      product_risk_code?: number;
      allocation_percentage: string;
      allocation_amount: string;
      expected_return_pct?: string;
      created_by?: string;
    },
  ) {
    // Validate proposal exists and is in an editable state
    const [proposal] = await db
      .select()
      .from(schema.investmentProposals)
      .where(and(eq(schema.investmentProposals.id, proposalId), eq(schema.investmentProposals.is_deleted, false)));

    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    if (proposal.proposal_status !== 'DRAFT') {
      throw new Error('Cannot modify line items on non-DRAFT proposals');
    }

    // Check allocation won't exceed 100%
    const [allocResult] = await db
      .select({ total: sql<string>`coalesce(sum(allocation_percentage::numeric), 0)` })
      .from(schema.proposalLineItems)
      .where(eq(schema.proposalLineItems.proposal_id, proposalId));

    const currentTotal = parseFloat(allocResult?.total ?? '0');
    const newAlloc = parseFloat(data.allocation_percentage);
    if (currentTotal + newAlloc > 100) {
      throw new Error(
        `Total allocation would be ${(currentTotal + newAlloc).toFixed(2)}%, which exceeds 100%. ` +
        `Current total: ${currentTotal.toFixed(2)}%.`,
      );
    }

    const [inserted] = await db
      .insert(schema.proposalLineItems)
      .values({
        proposal_id: proposalId,
        asset_class: data.asset_class,
        product_id: data.product_id ?? null,
        product_name: data.product_name ?? null,
        product_risk_code: data.product_risk_code ?? null,
        allocation_percentage: data.allocation_percentage,
        allocation_amount: data.allocation_amount,
        expected_return_pct: data.expected_return_pct ?? null,
        risk_deviation_flagged: false,
        deviation_acknowledged: false,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return inserted;
  },

  /**
   * Update an existing line item.
   */
  async updateLineItem(
    id: number,
    data: Record<string, unknown>,
  ) {
    const [current] = await db
      .select()
      .from(schema.proposalLineItems)
      .where(eq(schema.proposalLineItems.id, id));

    if (!current) {
      throw new Error(`Line item not found: ${id}`);
    }

    // Verify proposal is in DRAFT status
    const [proposal] = await db
      .select()
      .from(schema.investmentProposals)
      .where(eq(schema.investmentProposals.id, current.proposal_id));

    if (!proposal || proposal.proposal_status !== 'DRAFT') {
      throw new Error('Cannot modify line items on non-DRAFT proposals');
    }

    const allowedFields = [
      'asset_class', 'product_id', 'product_name', 'product_risk_code',
      'allocation_percentage', 'allocation_amount', 'expected_return_pct',
      'deviation_acknowledged',
    ];

    const setValues: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: (data.updated_by as string) ?? null,
    };

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        setValues[field] = data[field];
      }
    }

    // If allocation is changing, validate the total
    if (data.allocation_percentage !== undefined) {
      const [allocResult] = await db
        .select({ total: sql<string>`coalesce(sum(allocation_percentage::numeric), 0)` })
        .from(schema.proposalLineItems)
        .where(
          and(
            eq(schema.proposalLineItems.proposal_id, current.proposal_id),
            sql`${schema.proposalLineItems.id} != ${id}`,
          ),
        );

      const othersTotal = parseFloat(allocResult?.total ?? '0');
      const newAlloc = parseFloat(data.allocation_percentage as string);
      if (othersTotal + newAlloc > 100) {
        throw new Error(
          `Total allocation would be ${(othersTotal + newAlloc).toFixed(2)}%, which exceeds 100%.`,
        );
      }
    }

    const [updated] = await db
      .update(schema.proposalLineItems)
      .set(setValues as any)
      .where(eq(schema.proposalLineItems.id, id))
      .returning();

    return updated;
  },

  /**
   * Delete a line item.
   */
  async deleteLineItem(id: number) {
    const [current] = await db
      .select()
      .from(schema.proposalLineItems)
      .where(eq(schema.proposalLineItems.id, id));

    if (!current) {
      throw new Error(`Line item not found: ${id}`);
    }

    // Verify proposal is in DRAFT status
    const [proposal] = await db
      .select()
      .from(schema.investmentProposals)
      .where(eq(schema.investmentProposals.id, current.proposal_id));

    if (!proposal || proposal.proposal_status !== 'DRAFT') {
      throw new Error('Cannot modify line items on non-DRAFT proposals');
    }

    await db
      .update(schema.proposalLineItems)
      .set({ is_deleted: true, updated_at: new Date() } as any)
      .where(eq(schema.proposalLineItems.id, id));

    return { deleted: true, id };
  },

  /**
   * Validate that all line items for a proposal sum to exactly 100%.
   */
  async validateAllocation(proposalId: number) {
    const [allocResult] = await db
      .select({ total: sql<string>`coalesce(sum(allocation_percentage::numeric), 0)` })
      .from(schema.proposalLineItems)
      .where(eq(schema.proposalLineItems.proposal_id, proposalId));

    const total = parseFloat(allocResult?.total ?? '0');
    const isValid = Math.abs(total - 100) < 0.01; // tolerance for floating point

    return {
      valid: isValid,
      totalAllocation: total,
      message: isValid
        ? 'Allocation sums to 100%.'
        : `Allocation sums to ${total.toFixed(2)}%, expected 100%.`,
    };
  },

  // ---------------------------------------------------------------------------
  // 3. Suitability Check
  // ---------------------------------------------------------------------------

  /**
   * Run a suitability check on a proposal.
   * - Compares product_risk_code vs customer effective_risk_code
   * - Checks concentration limits (no single asset class > 40%)
   * - Checks for unacknowledged deviations
   */
  async runSuitabilityCheck(proposalId: number) {
    const proposal = await this.getProposal(proposalId);
    const { lineItems, riskProfile } = proposal;

    if (!riskProfile) {
      throw new Error('No risk profile found for this proposal');
    }

    const customerRiskCode = riskProfile.effective_risk_code;
    const checks: { name: string; passed: boolean; message: string; severity: 'BLOCKER' | 'WARNING' }[] = [];

    // -- Check 1: Product risk vs customer risk --
    let riskMismatchPassed = true;
    const flaggedItems: string[] = [];

    for (const item of lineItems) {
      const productRisk = item.product_risk_code ?? 0;
      const isFlagged = productRisk > customerRiskCode;

      // Update the flag on the line item
      if (isFlagged !== (item.risk_deviation_flagged ?? false)) {
        await db
          .update(schema.proposalLineItems)
          .set({ risk_deviation_flagged: isFlagged, updated_at: new Date() } as any)
          .where(eq(schema.proposalLineItems.id, item.id));
      }

      if (isFlagged) {
        riskMismatchPassed = false;
        flaggedItems.push(
          `${item.product_name ?? item.product_id ?? item.asset_class} ` +
          `(product risk ${productRisk} > customer risk ${customerRiskCode})`,
        );
      }
    }

    checks.push({
      name: 'RISK_LEVEL_CHECK',
      passed: riskMismatchPassed,
      message: riskMismatchPassed
        ? 'All products are within the customer risk tolerance.'
        : `Risk mismatch on: ${flaggedItems.join('; ')}`,
      severity: 'BLOCKER' as const,
    });

    // -- Check 2: Concentration limits --
    const assetClassAlloc: Record<string, number> = {};
    for (const item of lineItems) {
      const cls = item.asset_class;
      assetClassAlloc[cls] = (assetClassAlloc[cls] ?? 0) + parseFloat(String(item.allocation_percentage));
    }

    let concentrationPassed = true;
    const concentrationBreaches: string[] = [];
    for (const [cls, pct] of Object.entries(assetClassAlloc)) {
      if (pct > CONCENTRATION_LIMIT_PCT) {
        concentrationPassed = false;
        concentrationBreaches.push(`${cls}: ${pct.toFixed(2)}%`);
      }
    }

    checks.push({
      name: 'CONCENTRATION_LIMIT',
      passed: concentrationPassed,
      message: concentrationPassed
        ? `No single asset class exceeds ${CONCENTRATION_LIMIT_PCT}%.`
        : `Concentration breach: ${concentrationBreaches.join('; ')}`,
      severity: 'BLOCKER' as const,
    });

    // -- Check 3: Unacknowledged deviations --
    const unacknowledged = lineItems.filter(
      (item: any) => item.risk_deviation_flagged && !item.deviation_acknowledged,
    );
    const deviationPassed = unacknowledged.length === 0;

    checks.push({
      name: 'DEVIATION_ACKNOWLEDGEMENT',
      passed: deviationPassed,
      message: deviationPassed
        ? 'All risk deviations have been acknowledged.'
        : `${unacknowledged.length} line item(s) have unacknowledged risk deviations.`,
      severity: 'WARNING' as const,
    });

    // -- Overall result --
    const passed = checks.every((c) => c.passed);
    const details = { checks };

    // Persist suitability results on the proposal
    await db
      .update(schema.investmentProposals)
      .set({
        suitability_check_passed: passed,
        suitability_check_details: details,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.investmentProposals.id, proposalId));

    return { passed, details };
  },

  // ---------------------------------------------------------------------------
  // 4. What-If Analysis
  // ---------------------------------------------------------------------------

  /**
   * Compute portfolio-level what-if metrics from line item allocations.
   * - Weighted portfolio return
   * - Weighted portfolio std dev (simplified: weighted average)
   * - Sharpe ratio = (return - risk_free) / std_dev
   * - Max drawdown estimate = -2 * std_dev
   */
  async computeWhatIfMetrics(proposalId: number) {
    const lineItems = await db
      .select()
      .from(schema.proposalLineItems)
      .where(eq(schema.proposalLineItems.proposal_id, proposalId));

    if (lineItems.length === 0) {
      throw new Error('No line items found for proposal');
    }

    let weightedReturn = 0;
    let weightedStdDev = 0;
    let totalAlloc = 0;

    for (const item of lineItems) {
      const alloc = parseFloat(String(item.allocation_percentage)) / 100;
      const ret = parseFloat(String(item.expected_return_pct ?? '0'));
      // NOTE: Standard deviation estimated as 60% of expected return. This is a simplified
      // heuristic. For production use, integrate actual product-level volatility data from
      // the market data feed to compute proper portfolio standard deviation.
      const stdDev = ret * 0.6;

      weightedReturn += alloc * ret;
      weightedStdDev += alloc * stdDev;
      totalAlloc += alloc;
    }

    // Normalize in case allocations don't sum to exactly 100%
    if (totalAlloc > 0 && Math.abs(totalAlloc - 1) > 0.001) {
      weightedReturn /= totalAlloc;
      weightedStdDev /= totalAlloc;
    }

    const sharpeRatio =
      weightedStdDev > 0
        ? (weightedReturn - RISK_FREE_RATE) / weightedStdDev
        : 0;

    const maxDrawdown = -2 * weightedStdDev;

    const metrics = {
      expected_return_pct: parseFloat(weightedReturn.toFixed(4)),
      expected_std_dev_pct: parseFloat(weightedStdDev.toFixed(4)),
      sharpe_ratio: parseFloat(sharpeRatio.toFixed(4)),
      max_drawdown_pct: parseFloat(maxDrawdown.toFixed(4)),
    };

    // Persist metrics on the proposal
    await db
      .update(schema.investmentProposals)
      .set({
        expected_return_pct: String(metrics.expected_return_pct),
        expected_std_dev_pct: String(metrics.expected_std_dev_pct),
        sharpe_ratio: String(metrics.sharpe_ratio),
        max_drawdown_pct: String(metrics.max_drawdown_pct),
        updated_at: new Date(),
      } as any)
      .where(eq(schema.investmentProposals.id, proposalId));

    return metrics;
  },

  // ---------------------------------------------------------------------------
  // 5. Approval Workflow (State Machine)
  // ---------------------------------------------------------------------------

  /**
   * Submit a DRAFT proposal for approval. Runs suitability check first.
   */
  async submitProposal(proposalId: number) {
    const [proposal] = await db
      .select()
      .from(schema.investmentProposals)
      .where(and(eq(schema.investmentProposals.id, proposalId), eq(schema.investmentProposals.is_deleted, false)));

    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.proposal_status !== 'DRAFT') {
      throw new Error(`Cannot submit proposal in ${proposal.proposal_status} status. Must be DRAFT.`);
    }

    // Run suitability check before submission (FR-026.BR1 — G-044)
    const suitabilityResult = await this.runSuitabilityCheck(proposalId);
    const blockerFailures = suitabilityResult.details.checks.filter(
      (c: any) => c.severity === 'BLOCKER' && !c.passed,
    );
    if (blockerFailures.length > 0) {
      const err = new Error(
        'Proposal cannot be submitted: suitability check failed with blocking issues',
      );
      (err as any).status = 422;
      (err as any).code = 'SUITABILITY_BLOCKER';
      (err as any).details = blockerFailures;
      throw err;
    }

    const [updated] = await db
      .update(schema.investmentProposals)
      .set({ proposal_status: 'SUBMITTED', updated_at: new Date() } as any)
      .where(eq(schema.investmentProposals.id, proposalId))
      .returning();

    return updated;
  },

  /**
   * L1 supervisor approves: SUBMITTED -> L1_APPROVED
   */
  async approveL1(proposalId: number, supervisorId: number, comments?: string) {
    const proposal = await db.transaction(async (tx: any) => {
      const updated = await this._transitionStatusTx(tx, proposalId, 'SUBMITTED', 'L1_APPROVED');

      await tx.insert(schema.proposalApprovals).values({
        proposal_id: proposalId,
        approval_level: 'L1_SUPERVISOR' as any,
        action: 'APPROVED' as any,
        acted_by: supervisorId,
        comments: comments ?? null,
      });

      return updated;
    });

    // G-045: Notify Compliance Officers that a proposal has passed L1 approval
    try {
      const complianceOfficers = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq((schema.users as any).role, 'COMPLIANCE_OFFICER'));
      const recipientIds = complianceOfficers.map((u: { id: number }) => u.id);
      if (recipientIds.length > 0) {
        await notificationInboxService.notifyMultiple(recipientIds, {
          type: 'PROPOSAL_L1_APPROVED',
          title: 'Proposal Awaiting Compliance Review',
          message: `Proposal #${(proposal as any).proposal_number} has been approved by L1 supervisor and is pending compliance review.`,
          channel: 'IN_APP',
          related_entity_type: 'investment_proposal',
          related_entity_id: proposalId,
        });
      }
    } catch (notifErr) {
      console.error('[ProposalService] Failed to notify compliance officers on L1 approval:', notifErr);
    }

    return proposal;
  },

  /**
   * L1 supervisor rejects: SUBMITTED -> L1_REJECTED
   */
  async rejectL1(proposalId: number, supervisorId: number, comments?: string) {
    return await db.transaction(async (tx: any) => {
      const proposal = await this._transitionStatusTx(tx, proposalId, 'SUBMITTED', 'L1_REJECTED');

      await tx.insert(schema.proposalApprovals).values({
        proposal_id: proposalId,
        approval_level: 'L1_SUPERVISOR' as any,
        action: 'REJECTED' as any,
        acted_by: supervisorId,
        comments: comments ?? null,
      });

      return proposal;
    });
  },

  /**
   * Compliance officer approves: L1_APPROVED -> COMPLIANCE_APPROVED
   */
  async approveCompliance(proposalId: number, complianceOfficerId: number, comments?: string) {
    return await db.transaction(async (tx: any) => {
      const proposal = await this._transitionStatusTx(tx, proposalId, 'L1_APPROVED', 'COMPLIANCE_APPROVED');

      await tx.insert(schema.proposalApprovals).values({
        proposal_id: proposalId,
        approval_level: 'COMPLIANCE' as any,
        action: 'APPROVED' as any,
        acted_by: complianceOfficerId,
        comments: comments ?? null,
      });

      return proposal;
    });
  },

  /**
   * Compliance officer rejects: L1_APPROVED -> COMPLIANCE_REJECTED
   */
  async rejectCompliance(proposalId: number, complianceOfficerId: number, comments?: string) {
    return await db.transaction(async (tx: any) => {
      const proposal = await this._transitionStatusTx(tx, proposalId, 'L1_APPROVED', 'COMPLIANCE_REJECTED');

      await tx.insert(schema.proposalApprovals).values({
        proposal_id: proposalId,
        approval_level: 'COMPLIANCE' as any,
        action: 'REJECTED' as any,
        acted_by: complianceOfficerId,
        comments: comments ?? null,
      });

      return proposal;
    });
  },

  /**
   * Send proposal to client: COMPLIANCE_APPROVED -> SENT_TO_CLIENT
   * Sets expires_at = 30 days from now.
   */
  async sendToClient(proposalId: number) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CLIENT_OFFER_EXPIRY_DAYS);

    const [proposal] = await db
      .select()
      .from(schema.investmentProposals)
      .where(and(eq(schema.investmentProposals.id, proposalId), eq(schema.investmentProposals.is_deleted, false)));

    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.proposal_status !== 'COMPLIANCE_APPROVED') {
      throw new Error(
        `Cannot send to client from ${proposal.proposal_status} status. Must be COMPLIANCE_APPROVED.`,
      );
    }

    const [updated] = await db
      .update(schema.investmentProposals)
      .set({
        proposal_status: 'SENT_TO_CLIENT',
        expires_at: expiresAt,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.investmentProposals.id, proposalId))
      .returning();

    return updated;
  },

  /**
   * Client accepts the proposal: SENT_TO_CLIENT -> CLIENT_ACCEPTED
   */
  async clientAccept(proposalId: number, clientId: number) {
    return await db.transaction(async (tx: any) => {
      const [proposal] = await tx
        .select()
        .from(schema.investmentProposals)
        .where(and(eq(schema.investmentProposals.id, proposalId), eq(schema.investmentProposals.is_deleted, false)));

      if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
      if (proposal.proposal_status !== 'SENT_TO_CLIENT') {
        throw new Error(
          `Cannot accept from ${proposal.proposal_status} status. Must be SENT_TO_CLIENT.`,
        );
      }

      const [updated] = await tx
        .update(schema.investmentProposals)
        .set({
          proposal_status: 'CLIENT_ACCEPTED',
          client_accepted_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where(eq(schema.investmentProposals.id, proposalId))
        .returning();

      await tx.insert(schema.proposalApprovals).values({
        proposal_id: proposalId,
        approval_level: 'CLIENT' as any,
        action: 'APPROVED' as any,
        acted_by: clientId,
        comments: null,
      });

      return updated;
    });
  },

  /**
   * Client rejects the proposal: SENT_TO_CLIENT -> CLIENT_REJECTED
   */
  async clientReject(proposalId: number, clientId: number, reason?: string) {
    return await db.transaction(async (tx: any) => {
      const [proposal] = await tx
        .select()
        .from(schema.investmentProposals)
        .where(and(eq(schema.investmentProposals.id, proposalId), eq(schema.investmentProposals.is_deleted, false)));

      if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
      if (proposal.proposal_status !== 'SENT_TO_CLIENT') {
        throw new Error(
          `Cannot reject from ${proposal.proposal_status} status. Must be SENT_TO_CLIENT.`,
        );
      }

      const [updated] = await tx
        .update(schema.investmentProposals)
        .set({
          proposal_status: 'CLIENT_REJECTED',
          client_rejected_at: new Date(),
          client_rejection_reason: reason ?? null,
          updated_at: new Date(),
        } as any)
        .where(eq(schema.investmentProposals.id, proposalId))
        .returning();

      await tx.insert(schema.proposalApprovals).values({
        proposal_id: proposalId,
        approval_level: 'CLIENT' as any,
        action: 'REJECTED' as any,
        acted_by: clientId,
        comments: reason ?? null,
      });

      return updated;
    });
  },

  /**
   * Return a proposal for revision (from any approved/rejected state back to DRAFT).
   */
  async returnForRevision(
    proposalId: number,
    actorId: number,
    level: string,
    comments: string,
  ) {
    return await db.transaction(async (tx: any) => {
      const [proposal] = await tx
        .select()
        .from(schema.investmentProposals)
        .where(and(eq(schema.investmentProposals.id, proposalId), eq(schema.investmentProposals.is_deleted, false)));

      if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
      if (proposal.proposal_status === 'DRAFT') {
        throw new Error('Proposal is already in DRAFT status.');
      }

      const [updated] = await tx
        .update(schema.investmentProposals)
        .set({
          proposal_status: 'DRAFT',
          updated_at: new Date(),
          version: (proposal.version ?? 1) + 1,
        } as any)
        .where(eq(schema.investmentProposals.id, proposalId))
        .returning();

      await tx.insert(schema.proposalApprovals).values({
        proposal_id: proposalId,
        approval_level: level as any,
        action: 'RETURNED_FOR_REVISION' as any,
        acted_by: actorId,
        comments,
      });

      return updated;
    });
  },

  // ---------------------------------------------------------------------------
  // 6. PDF Generation Stub
  // ---------------------------------------------------------------------------

  /**
   * Generate a proposal PDF (stub implementation).
   * Returns a placeholder URL and persists it on the proposal.
   */
  async generateProposalPdf(proposalId: number) {
    const proposal = await this.getProposal(proposalId);

    // Placeholder URL - actual PDF generation is out of scope for initial impl
    const pdfUrl = `/api/proposals/${proposalId}/pdf/${proposal.proposal_number}.pdf`;

    await db
      .update(schema.investmentProposals)
      .set({
        proposal_pdf_url: pdfUrl,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.investmentProposals.id, proposalId));

    return {
      proposal_id: proposalId,
      proposal_number: proposal.proposal_number,
      pdf_url: pdfUrl,
      generated_at: new Date().toISOString(),
    };
  },

  // ---------------------------------------------------------------------------
  // 7. Reporting Queries
  // ---------------------------------------------------------------------------

  /**
   * Pipeline report: count proposals grouped by status for a given entity and date range.
   */
  async getProposalPipelineReport(
    entityId: string,
    dateFrom: string,
    dateTo: string,
  ) {
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !ISO_DATE.test(dateFrom)) throw new Error('Invalid date_from format. Expected YYYY-MM-DD');
    if (dateTo && !ISO_DATE.test(dateTo)) throw new Error('Invalid date_to format. Expected YYYY-MM-DD');

    const rows = await db
      .select({
        status: schema.investmentProposals.proposal_status,
        count: sql<number>`count(*)::int`,
        total_amount: sql<string>`coalesce(sum(proposed_amount::numeric), 0)`,
      })
      .from(schema.investmentProposals)
      .where(
        and(
          eq(schema.investmentProposals.entity_id, entityId),
          eq(schema.investmentProposals.is_deleted, false),
          sql`${schema.investmentProposals.created_at} >= ${dateFrom}::timestamptz`,
          sql`${schema.investmentProposals.created_at} <= ${dateTo}::timestamptz`,
        ),
      )
      .groupBy(schema.investmentProposals.proposal_status)
      .orderBy(schema.investmentProposals.proposal_status);

    const sentCount = rows.find((r: any) => r.status === 'SENT_TO_CLIENT')?.count ?? 0;
    const acceptedCount = rows.find((r: any) => r.status === 'CLIENT_ACCEPTED')?.count ?? 0;
    const conversion_rate = sentCount > 0 ? parseFloat(((acceptedCount / sentCount) * 100).toFixed(2)) : 0;

    return {
      entity_id: entityId,
      date_from: dateFrom,
      date_to: dateTo,
      pipeline: rows,
      conversion_rate,
    };
  },

  /**
   * Risk mismatch report: list proposals that have line items with risk_deviation_flagged = true.
   */
  async getRiskMismatchReport(entityId: string) {
    const rows = await db
      .select({
        proposal_id: schema.investmentProposals.id,
        proposal_number: schema.investmentProposals.proposal_number,
        title: schema.investmentProposals.title,
        customer_id: schema.investmentProposals.customer_id,
        proposal_status: schema.investmentProposals.proposal_status,
        line_item_id: schema.proposalLineItems.id,
        product_name: schema.proposalLineItems.product_name,
        product_risk_code: schema.proposalLineItems.product_risk_code,
        allocation_percentage: schema.proposalLineItems.allocation_percentage,
        deviation_acknowledged: schema.proposalLineItems.deviation_acknowledged,
        deviation_id: schema.productRiskDeviations.id,
        deviation_recorded_at: schema.productRiskDeviations.created_at,
        deviation_context: schema.productRiskDeviations.context,
      })
      .from(schema.investmentProposals)
      .innerJoin(
        schema.proposalLineItems,
        eq(schema.proposalLineItems.proposal_id, schema.investmentProposals.id),
      )
      .leftJoin(
        schema.productRiskDeviations,
        and(
          eq(schema.productRiskDeviations.customer_id, schema.investmentProposals.customer_id),
          eq(schema.productRiskDeviations.product_id, schema.proposalLineItems.product_id),
          eq(schema.productRiskDeviations.is_deleted, false),
        ),
      )
      .where(
        and(
          eq(schema.investmentProposals.entity_id, entityId),
          eq(schema.investmentProposals.is_deleted, false),
          eq(schema.proposalLineItems.risk_deviation_flagged, true),
        ),
      )
      .orderBy(desc(schema.investmentProposals.created_at));

    // G-059: Summary stats — total mismatches, acknowledged count, acknowledged %
    const acknowledgedCount = rows.filter((r: { deviation_acknowledged: boolean | null }) => r.deviation_acknowledged === true).length;
    const acknowledgedPct = rows.length > 0 ? parseFloat(((acknowledgedCount / rows.length) * 100).toFixed(2)) : 0;

    return {
      entity_id: entityId,
      mismatches: rows,
      total: rows.length,
      acknowledged_count: acknowledgedCount,
      unacknowledged_count: rows.length - acknowledgedCount,
      acknowledged_percentage: acknowledgedPct,
    };
  },

  /**
   * Transaction by product rating report: group accepted proposals by product_risk_code.
   */
  async getTransactionByProductRatingReport(
    entityId: string,
    dateFrom: string,
    dateTo: string,
  ) {
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !ISO_DATE.test(dateFrom)) throw new Error('Invalid date_from format. Expected YYYY-MM-DD');
    if (dateTo && !ISO_DATE.test(dateTo)) throw new Error('Invalid date_to format. Expected YYYY-MM-DD');

    const rows = await db
      .select({
        product_risk_code: schema.proposalLineItems.product_risk_code,
        proposal_count: sql<number>`count(distinct ${schema.investmentProposals.id})::int`,
        line_item_count: sql<number>`count(*)::int`,
        total_allocation_amount: sql<string>`coalesce(sum(${schema.proposalLineItems.allocation_amount}::numeric), 0)`,
      })
      .from(schema.investmentProposals)
      .innerJoin(
        schema.proposalLineItems,
        eq(schema.proposalLineItems.proposal_id, schema.investmentProposals.id),
      )
      .where(
        and(
          eq(schema.investmentProposals.entity_id, entityId),
          eq(schema.investmentProposals.is_deleted, false),
          eq(schema.investmentProposals.proposal_status, 'CLIENT_ACCEPTED' as any),
          sql`${schema.investmentProposals.client_accepted_at} >= ${dateFrom}::timestamptz`,
          sql`${schema.investmentProposals.client_accepted_at} <= ${dateTo}::timestamptz`,
        ),
      )
      .groupBy(schema.proposalLineItems.product_risk_code)
      .orderBy(schema.proposalLineItems.product_risk_code);

    return {
      entity_id: entityId,
      date_from: dateFrom,
      date_to: dateTo,
      by_product_rating: rows,
    };
  },

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Transition proposal status with validation. Throws if current status does not match expected.
   */
  async _transitionStatus(
    proposalId: number,
    expectedCurrentStatus: string,
    newStatus: string,
  ) {
    return this._transitionStatusTx(db, proposalId, expectedCurrentStatus, newStatus);
  },

  /**
   * Transition proposal status within a transaction context.
   */
  async _transitionStatusTx(
    tx: any,
    proposalId: number,
    expectedCurrentStatus: string,
    newStatus: string,
  ) {
    const [proposal] = await tx
      .select()
      .from(schema.investmentProposals)
      .where(and(eq(schema.investmentProposals.id, proposalId), eq(schema.investmentProposals.is_deleted, false)));

    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    if (proposal.proposal_status !== expectedCurrentStatus) {
      throw new Error(
        `Invalid status transition: expected ${expectedCurrentStatus}, got ${proposal.proposal_status}.`,
      );
    }

    const [updated] = await tx
      .update(schema.investmentProposals)
      .set({ proposal_status: newStatus, updated_at: new Date() } as any)
      .where(eq(schema.investmentProposals.id, proposalId))
      .returning();

    return updated;
  },
};
