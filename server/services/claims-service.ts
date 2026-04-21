/**
 * Claims & Compensation Service (TRUST-CA 360 Phase 6)
 *
 * Manages the full lifecycle of claims: creation, investigation,
 * root-cause classification, approval workflow (with SoD), settlement
 * via cash ledger, and regulatory disclosure tracking.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { cashLedgerService } from './cash-ledger-service';

/** Determine approval tier based on claim amount */
function determineApprovalTier(amount: number): 'AUTO' | 'MANAGER' | 'HEAD' | 'EXEC_COMMITTEE' {
  if (amount <= 50_000) return 'AUTO';
  if (amount <= 500_000) return 'MANAGER';
  if (amount <= 5_000_000) return 'HEAD';
  return 'EXEC_COMMITTEE';
}

export const claimsService = {
  /** Create a new claim with auto-generated reference and approval tier */
  async createClaim(data: {
    event_id?: number;
    account_id: string;
    origination: 'CLIENT_RAISED' | 'INTERNALLY_DETECTED' | 'REGULATOR_RAISED';
    claim_amount: number;
    currency?: string;
    regulatory_disclosure_required?: boolean;
    created_by?: string;
  }) {
    const year = new Date().getFullYear();

    // Count existing claims this year for sequence
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.claims)
      .where(sql`${schema.claims.claim_reference} LIKE ${'CLM-' + year + '-%'}`);
    const seq = Number(countResult[0]?.count ?? 0) + 1;
    const claimReference = `CLM-${year}-${String(seq).padStart(6, '0')}`;
    const claimId = `CLM-${Date.now()}`;

    const amount = Number(data.claim_amount);
    const approvalTier = determineApprovalTier(amount);

    const [result] = await db
      .insert(schema.claims)
      .values({
        claim_id: claimId,
        claim_reference: claimReference,
        event_id: data.event_id ?? null,
        account_id: data.account_id,
        origination: data.origination,
        claim_amount: String(amount),
        currency: data.currency || 'PHP',
        approval_tier: approvalTier,
        claim_status: 'DRAFT',
        regulatory_disclosure_required: data.regulatory_disclosure_required ?? false,
        supporting_docs: [],
        created_by: data.created_by || 'system',
        updated_by: data.created_by || 'system',
      })
      .returning();

    return result;
  },

  /** Transition from DRAFT to INVESTIGATING */
  async submitForInvestigation(claimId: number) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);
    if (claim.claim_status !== 'DRAFT') {
      throw new Error(`Cannot investigate: claim status is ${claim.claim_status}, expected DRAFT`);
    }

    const now = new Date();
    const slaDeadline = new Date(now);
    slaDeadline.setDate(slaDeadline.getDate() + 5); // 5-day SLA

    await db
      .update(schema.claims)
      .set({
        claim_status: 'INVESTIGATING',
        investigation_started_at: now,
        investigation_sla_deadline: slaDeadline,
        updated_at: now,
        updated_by: 'system',
      })
      .where(eq(schema.claims.id, claimId));

    return { ...claim, claim_status: 'INVESTIGATING', investigation_started_at: now, investigation_sla_deadline: slaDeadline };
  },

  /** Append documents to supporting_docs JSON array */
  async addEvidence(claimId: number, documents: string[]) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const existingDocs = Array.isArray(claim.supporting_docs) ? (claim.supporting_docs as string[]) : [];
    const updatedDocs = [...existingDocs, ...documents];

    await db
      .update(schema.claims)
      .set({
        supporting_docs: updatedDocs,
        updated_at: new Date(),
        updated_by: 'system',
      })
      .where(eq(schema.claims.id, claimId));

    return { ...claim, supporting_docs: updatedDocs };
  },

  /** Set the root cause code for a claim */
  async classifyRootCause(claimId: number, rootCauseCode: 'DEADLINE_MISSED' | 'TAX_ERROR' | 'FEE_ERROR' | 'WRONG_OPTION' | 'SYSTEM_OUTAGE' | 'DATA_QUALITY' | 'VENDOR_FAILURE' | 'OTHER') {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);

    await db
      .update(schema.claims)
      .set({
        root_cause_code: rootCauseCode,
        updated_at: new Date(),
        updated_by: 'system',
      })
      .where(eq(schema.claims.id, claimId));

    return { ...claim, root_cause_code: rootCauseCode };
  },

  /** Transition from INVESTIGATING to PENDING_APPROVAL */
  async submitForApproval(claimId: number) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);
    if (claim.claim_status !== 'INVESTIGATING') {
      throw new Error(`Cannot submit for approval: claim status is ${claim.claim_status}, expected INVESTIGATING`);
    }

    await db
      .update(schema.claims)
      .set({
        claim_status: 'PENDING_APPROVAL',
        updated_at: new Date(),
        updated_by: 'system',
      })
      .where(eq(schema.claims.id, claimId));

    return { ...claim, claim_status: 'PENDING_APPROVAL' };
  },

  /** Approve a claim (enforces Separation of Duties) */
  async approve(claimId: number, approverId: string) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);
    if (claim.claim_status !== 'PENDING_APPROVAL') {
      throw new Error(`Cannot approve: claim status is ${claim.claim_status}, expected PENDING_APPROVAL`);
    }

    // Separation of Duties: approver must differ from creator
    if (claim.created_by && claim.created_by === approverId) {
      throw new Error('Separation of Duties violation: approver cannot be the same as the claim creator');
    }

    const approverIdNum = parseInt(approverId, 10);
    const now = new Date();

    await db
      .update(schema.claims)
      .set({
        claim_status: 'APPROVED',
        approved_by: isNaN(approverIdNum) ? null : approverIdNum,
        approved_at: now,
        updated_at: now,
        updated_by: approverId,
      })
      .where(eq(schema.claims.id, claimId));

    return { ...claim, claim_status: 'APPROVED', approved_by: approverIdNum, approved_at: now };
  },

  /** Reject a claim with a reason */
  async reject(claimId: number, approverId: string, reason: string) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);
    if (claim.claim_status !== 'PENDING_APPROVAL') {
      throw new Error(`Cannot reject: claim status is ${claim.claim_status}, expected PENDING_APPROVAL`);
    }

    const now = new Date();

    await db
      .update(schema.claims)
      .set({
        claim_status: 'REJECTED',
        rejection_reason: reason,
        updated_at: now,
        updated_by: approverId,
      })
      .where(eq(schema.claims.id, claimId));

    return { ...claim, claim_status: 'REJECTED', rejection_reason: reason };
  },

  /** Settle payout: post to cash ledger and mark as PAID */
  async settlePayout(claimId: number) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);
    if (claim.claim_status !== 'APPROVED') {
      throw new Error(`Cannot settle: claim status is ${claim.claim_status}, expected APPROVED`);
    }

    // Post debit entry to the cash ledger
    const portfolioId = claim.account_id || 'DEFAULT';
    const ledgerResult = await cashLedgerService.postEntry({
      portfolioId,
      type: 'DEBIT',
      amount: Math.abs(parseFloat(claim.claim_amount)),
      currency: claim.currency,
      reference: claim.claim_reference,
    });

    const now = new Date();
    await db
      .update(schema.claims)
      .set({
        claim_status: 'PAID',
        compensation_settlement_id: ledgerResult.transaction_id,
        updated_at: now,
        updated_by: 'system',
      })
      .where(eq(schema.claims.id, claimId));

    return {
      ...claim,
      claim_status: 'PAID',
      compensation_settlement_id: ledgerResult.transaction_id,
      ledger: ledgerResult,
    };
  },

  /** Withdraw a claim (only before APPROVED) */
  async withdraw(claimId: number) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const preApprovalStatuses = ['DRAFT', 'INVESTIGATING', 'PENDING_APPROVAL'];
    if (!preApprovalStatuses.includes(claim.claim_status ?? '')) {
      throw new Error(`Cannot withdraw: claim status is ${claim.claim_status}, must be before APPROVED`);
    }

    await db
      .update(schema.claims)
      .set({
        claim_status: 'WITHDRAWN',
        updated_at: new Date(),
        updated_by: 'system',
      })
      .where(eq(schema.claims.id, claimId));

    return { ...claim, claim_status: 'WITHDRAWN' };
  },

  /** Process regulatory disclosure for a paid claim */
  async checkDisclosure(claimId: number) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));

    if (!claim) throw new Error(`Claim ${claimId} not found`);

    if (claim.regulatory_disclosure_required && claim.claim_status === 'PAID') {
      await db
        .update(schema.claims)
        .set({
          claim_status: 'DISCLOSED',
          updated_at: new Date(),
          updated_by: 'system',
        })
        .where(eq(schema.claims.id, claimId));

      return { ...claim, claim_status: 'DISCLOSED' };
    }

    return claim;
  },

  /** Get paginated list of claims with optional filters */
  async getClaims(filters: {
    status?: string;
    origination?: string;
    rootCause?: string;
    page?: number;
    pageSize?: number;
  }) {
    const all = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.is_deleted, false))
      .orderBy(desc(schema.claims.created_at));

    let filtered = all;
    if (filters.status) {
      filtered = filtered.filter((c: typeof all[number]) => c.claim_status === filters.status);
    }
    if (filters.origination) {
      filtered = filtered.filter((c: typeof all[number]) => c.origination === filters.origination);
    }
    if (filters.rootCause) {
      filtered = filtered.filter((c: typeof all[number]) => c.root_cause_code === filters.rootCause);
    }

    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 25, 100);
    const total = filtered.length;
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    return { data, total, page, pageSize };
  },

  /** Get a single claim by its DB id */
  async getClaimById(claimId: number) {
    const [claim] = await db
      .select()
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.id, claimId),
          eq(schema.claims.is_deleted, false),
        ),
      );
    return claim || null;
  },

  /** Dashboard summary: counts by status + total amount by root cause */
  async getDashboardSummary() {
    const all = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.is_deleted, false));

    const byStatus = {
      draft: all.filter((c: typeof all[number]) => c.claim_status === 'DRAFT').length,
      investigating: all.filter((c: typeof all[number]) => c.claim_status === 'INVESTIGATING').length,
      pendingApproval: all.filter((c: typeof all[number]) => c.claim_status === 'PENDING_APPROVAL').length,
      approved: all.filter((c: typeof all[number]) => c.claim_status === 'APPROVED').length,
      paid: all.filter((c: typeof all[number]) => c.claim_status === 'PAID').length,
      rejected: all.filter((c: typeof all[number]) => c.claim_status === 'REJECTED').length,
      withdrawn: all.filter((c: typeof all[number]) => c.claim_status === 'WITHDRAWN').length,
      disclosed: all.filter((c: typeof all[number]) => c.claim_status === 'DISCLOSED').length,
    };

    // Total paid amount
    const paidClaims = all.filter((c: typeof all[number]) => c.claim_status === 'PAID' || c.claim_status === 'DISCLOSED');
    const totalPaidAmount = paidClaims.reduce((sum: number, c: typeof all[number]) => sum + parseFloat(c.claim_amount || '0'), 0);

    // Total claim amount by root cause
    const rootCauseSummary: Record<string, { count: number; totalAmount: number }> = {};
    for (const c of all) {
      const rc = c.root_cause_code || 'UNCLASSIFIED';
      if (!rootCauseSummary[rc]) {
        rootCauseSummary[rc] = { count: 0, totalAmount: 0 };
      }
      rootCauseSummary[rc].count++;
      rootCauseSummary[rc].totalAmount += parseFloat(c.claim_amount || '0');
    }

    // SLA breaches: open claims older than 5 days
    const now = new Date();
    const openStatuses = ['DRAFT', 'INVESTIGATING', 'PENDING_APPROVAL'];
    const slaBreaches = all.filter((c: typeof all[number]) => {
      if (!openStatuses.includes(c.claim_status ?? '')) return false;
      const createdAt = new Date(c.created_at);
      const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays > 5;
    }).length;

    return { byStatus, totalPaidAmount, rootCauseSummary, slaBreaches, total: all.length };
  },

  /** Aging report: open claims grouped by age buckets */
  async getAgingReport() {
    const openStatuses = ['DRAFT', 'INVESTIGATING', 'PENDING_APPROVAL', 'APPROVED'];
    const all = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.is_deleted, false));

    const openClaims = all.filter((c: typeof all[number]) => openStatuses.includes(c.claim_status ?? ''));

    const now = new Date();
    const buckets = {
      '0-2d': [] as typeof openClaims,
      '3-5d': [] as typeof openClaims,
      '5+d': [] as typeof openClaims,
    };

    for (const c of openClaims) {
      const createdAt = new Date(c.created_at);
      const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 2) {
        buckets['0-2d'].push(c);
      } else if (diffDays <= 5) {
        buckets['3-5d'].push(c);
      } else {
        buckets['5+d'].push(c);
      }
    }

    return {
      '0-2d': { count: buckets['0-2d'].length, claims: buckets['0-2d'] },
      '3-5d': { count: buckets['3-5d'].length, claims: buckets['3-5d'] },
      '5+d': { count: buckets['5+d'].length, claims: buckets['5+d'] },
    };
  },
};
