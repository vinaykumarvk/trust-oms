/**
 * PERA Service (Phase 3I)
 *
 * Personal Equity & Retirement Account — BSP-regulated.
 * Handles contributor onboarding, contributions, withdrawals,
 * transfers, TCC processing, and BSP reporting (BDO RFI Gap #9 Critical).
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

/** Maximum number of PERA products per contributor (BSP regulation) */
const MAX_PERA_PRODUCTS = 5;

/** Default unqualified withdrawal penalty percentage */
const DEFAULT_PENALTY_PCT = 0.05;

export const peraService = {
  /** Validate that a contributor does not exceed the maximum PERA products */
  async validateMaxProducts(contributorId: string) {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.peraAccounts)
      .where(
        and(
          eq(schema.peraAccounts.contributor_id, contributorId),
          eq(schema.peraAccounts.pera_status, 'ACTIVE'),
        ),
      );

    const count = Number(countResult[0]?.count ?? 0);

    if (count >= MAX_PERA_PRODUCTS) {
      throw new Error(
        `Contributor ${contributorId} already has ${count} active PERA products (max ${MAX_PERA_PRODUCTS})`,
      );
    }

    return { contributorId, activeCount: count, maxAllowed: MAX_PERA_PRODUCTS };
  },

  /** Onboard a new PERA contributor */
  async onboardContributor(data: {
    contributorId: string;
    administrator?: string;
    productId: number;
    tin: string;
    maxContributionAnnual?: number;
  }) {
    // Validate max products
    await peraService.validateMaxProducts(data.contributorId);

    const [account] = await db
      .insert(schema.peraAccounts)
      .values({
        contributor_id: data.contributorId,
        administrator: data.administrator ?? null,
        product_id: data.productId,
        balance: '0',
        contribution_ytd: '0',
        max_contribution_annual: data.maxContributionAnnual
          ? String(data.maxContributionAnnual)
          : null,
        tin: data.tin,
        pera_status: 'ACTIVE',
      })
      .returning();

    return account;
  },

  /** Process a contribution to a PERA account */
  async processContribution(peraAccountId: number, amount: number) {
    if (amount <= 0) {
      throw new Error('Contribution amount must be positive');
    }

    const [account] = await db
      .select()
      .from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.id, peraAccountId))
      .limit(1);

    if (!account) {
      throw new Error(`PERA account not found: ${peraAccountId}`);
    }

    if (account.pera_status !== 'ACTIVE') {
      throw new Error(`PERA account ${peraAccountId} is not active (status: ${account.pera_status})`);
    }

    // Validate annual contribution limit
    const currentYtd = parseFloat(account.contribution_ytd ?? '0');
    const maxAnnual = account.max_contribution_annual
      ? parseFloat(account.max_contribution_annual)
      : null;

    if (maxAnnual !== null && currentYtd + amount > maxAnnual) {
      throw new Error(
        `Contribution would exceed annual limit: current YTD ${currentYtd} + ${amount} > max ${maxAnnual}`,
      );
    }

    // Insert PERA transaction
    const [txn] = await db
      .insert(schema.peraTransactions)
      .values({
        pera_account_id: peraAccountId,
        type: 'CONTRIBUTION',
        amount: String(amount),
        pera_txn_status: 'COMPLETED',
      })
      .returning();

    // Update account balance and contribution_ytd
    const newBalance = parseFloat(account.balance ?? '0') + amount;
    const newYtd = currentYtd + amount;

    await db
      .update(schema.peraAccounts)
      .set({
        balance: String(newBalance),
        contribution_ytd: String(newYtd),
        updated_at: new Date(),
      })
      .where(eq(schema.peraAccounts.id, peraAccountId));

    return {
      transaction: txn,
      new_balance: newBalance,
      contribution_ytd: newYtd,
    };
  },

  /** Process a qualified withdrawal (no penalty) */
  async processQualifiedWithdrawal(peraAccountId: number) {
    const [account] = await db
      .select()
      .from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.id, peraAccountId))
      .limit(1);

    if (!account) {
      throw new Error(`PERA account not found: ${peraAccountId}`);
    }

    const balance = parseFloat(account.balance ?? '0');

    if (balance <= 0) {
      throw new Error(`PERA account ${peraAccountId} has no balance to withdraw`);
    }

    // Insert PERA transaction — full balance withdrawal, no penalty
    const [txn] = await db
      .insert(schema.peraTransactions)
      .values({
        pera_account_id: peraAccountId,
        type: 'QUALIFIED_WITHDRAWAL',
        amount: String(balance),
        penalty_amount: '0',
        pera_txn_status: 'COMPLETED',
      })
      .returning();

    // Debit full balance
    await db
      .update(schema.peraAccounts)
      .set({
        balance: '0',
        updated_at: new Date(),
      })
      .where(eq(schema.peraAccounts.id, peraAccountId));

    return {
      transaction: txn,
      withdrawn_amount: balance,
      penalty_amount: 0,
      new_balance: 0,
    };
  },

  /** Process an unqualified withdrawal (with penalty) */
  async processUnqualifiedWithdrawal(peraAccountId: number, penaltyPct?: number) {
    const penalty = penaltyPct ?? DEFAULT_PENALTY_PCT;

    const [account] = await db
      .select()
      .from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.id, peraAccountId))
      .limit(1);

    if (!account) {
      throw new Error(`PERA account not found: ${peraAccountId}`);
    }

    const balance = parseFloat(account.balance ?? '0');

    if (balance <= 0) {
      throw new Error(`PERA account ${peraAccountId} has no balance to withdraw`);
    }

    const penaltyAmount = balance * penalty;

    // Insert PERA transaction — full balance withdrawal with penalty
    const [txn] = await db
      .insert(schema.peraTransactions)
      .values({
        pera_account_id: peraAccountId,
        type: 'UNQUALIFIED_WITHDRAWAL',
        amount: String(balance),
        penalty_amount: String(penaltyAmount),
        pera_txn_status: 'COMPLETED',
      })
      .returning();

    // Debit full balance
    await db
      .update(schema.peraAccounts)
      .set({
        balance: '0',
        updated_at: new Date(),
      })
      .where(eq(schema.peraAccounts.id, peraAccountId));

    return {
      transaction: txn,
      withdrawn_amount: balance,
      penalty_amount: penaltyAmount,
      net_amount: balance - penaltyAmount,
      new_balance: 0,
    };
  },

  /** Transfer PERA investment to a different product */
  async transferToProduct(peraAccountId: number, targetProductId: number) {
    const [account] = await db
      .select()
      .from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.id, peraAccountId))
      .limit(1);

    if (!account) {
      throw new Error(`PERA account not found: ${peraAccountId}`);
    }

    if (account.pera_status !== 'ACTIVE') {
      throw new Error(`PERA account ${peraAccountId} is not active`);
    }

    const [txn] = await db
      .insert(schema.peraTransactions)
      .values({
        pera_account_id: peraAccountId,
        type: 'TRANSFER_PRODUCT',
        amount: account.balance,
        target_product_id: targetProductId,
        pera_txn_status: 'COMPLETED',
      })
      .returning();

    // Update product on account
    await db
      .update(schema.peraAccounts)
      .set({
        product_id: targetProductId,
        updated_at: new Date(),
      })
      .where(eq(schema.peraAccounts.id, peraAccountId));

    return { transaction: txn };
  },

  /** Transfer PERA account to a different administrator */
  async transferToAdministrator(peraAccountId: number, targetAdmin: string) {
    const [account] = await db
      .select()
      .from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.id, peraAccountId))
      .limit(1);

    if (!account) {
      throw new Error(`PERA account not found: ${peraAccountId}`);
    }

    if (account.pera_status !== 'ACTIVE') {
      throw new Error(`PERA account ${peraAccountId} is not active`);
    }

    const [txn] = await db
      .insert(schema.peraTransactions)
      .values({
        pera_account_id: peraAccountId,
        type: 'TRANSFER_ADMIN',
        amount: account.balance,
        target_admin: targetAdmin,
        pera_txn_status: 'COMPLETED',
      })
      .returning();

    // Mark account as transferred
    await db
      .update(schema.peraAccounts)
      .set({
        pera_status: 'TRANSFERRED',
        updated_at: new Date(),
      })
      .where(eq(schema.peraAccounts.id, peraAccountId));

    return { transaction: txn };
  },

  /** Generate BSP contributor file (stub) */
  async generateBSPContributorFile() {
    const contributors = await db
      .select()
      .from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.pera_status, 'ACTIVE'))
      .orderBy(schema.peraAccounts.contributor_id);

    return {
      report_type: 'BSP_CONTRIBUTOR_FILE',
      generated_at: new Date().toISOString(),
      total_contributors: contributors.length,
      contributors: contributors.map((c: any) => ({
        contributor_id: c.contributor_id,
        tin: c.tin,
        bsp_pera_id: c.bsp_pera_id,
        administrator: c.administrator,
        balance: c.balance,
        contribution_ytd: c.contribution_ytd,
      })),
    };
  },

  /** Generate BSP transaction file (stub) */
  async generateBSPTransactionFile() {
    const transactions = await db
      .select()
      .from(schema.peraTransactions)
      .orderBy(desc(schema.peraTransactions.created_at))
      .limit(1000);

    return {
      report_type: 'BSP_TRANSACTION_FILE',
      generated_at: new Date().toISOString(),
      total_transactions: transactions.length,
      transactions: transactions.map((t: any) => ({
        id: t.id,
        pera_account_id: t.pera_account_id,
        type: t.type,
        amount: t.amount,
        penalty_amount: t.penalty_amount,
        tcc_ref: t.tcc_ref,
        status: t.pera_txn_status,
        created_at: t.created_at,
      })),
    };
  },

  /** Process Tax Credit Certificate (TCC) */
  async processTCC(contributorId: string, tccRef: string) {
    // Find an active PERA account for this contributor
    const [account] = await db
      .select()
      .from(schema.peraAccounts)
      .where(
        and(
          eq(schema.peraAccounts.contributor_id, contributorId),
          eq(schema.peraAccounts.pera_status, 'ACTIVE'),
        ),
      )
      .limit(1);

    if (!account) {
      throw new Error(`No active PERA account found for contributor: ${contributorId}`);
    }

    const [txn] = await db
      .insert(schema.peraTransactions)
      .values({
        pera_account_id: account.id,
        type: 'TCC',
        amount: '0',
        tcc_ref: tccRef,
        pera_txn_status: 'COMPLETED',
      })
      .returning();

    return { transaction: txn };
  },

  /**
   * Check PERA annual contribution cut-off per RA 11505.
   * Enforces the PHP 100,000 maximum annual contribution limit.
   * Returns allowance status without modifying any data.
   */
  async checkPERAContributionCutoff(
    accountId: number,
    amount: number,
    year: number,
  ): Promise<{
    allowed: boolean;
    currentYTD: number;
    remainingAllowance: number;
    message: string;
  }> {
    const RA11505_ANNUAL_LIMIT = 100_000;

    if (amount <= 0) {
      return {
        allowed: false,
        currentYTD: 0,
        remainingAllowance: 0,
        message: 'Contribution amount must be positive',
      };
    }

    // Fetch the PERA account
    const [account] = await db
      .select()
      .from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.id, accountId))
      .limit(1);

    if (!account) {
      return {
        allowed: false,
        currentYTD: 0,
        remainingAllowance: 0,
        message: `PERA account not found: ${accountId}`,
      };
    }

    if (account.pera_status !== 'ACTIVE') {
      return {
        allowed: false,
        currentYTD: 0,
        remainingAllowance: 0,
        message: `PERA account ${accountId} is not active (status: ${account.pera_status})`,
      };
    }

    // For the requested year, compute YTD contributions.
    // If the requested year is the current calendar year, use the stored contribution_ytd.
    // Otherwise, sum completed contribution transactions for that year.
    const currentYear = new Date().getFullYear();
    let currentYTD: number;

    if (year === currentYear) {
      currentYTD = parseFloat(account.contribution_ytd ?? '0');
    } else {
      // Sum contributions for the specified year from transactions
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const [result] = await db
        .select({ total: sql<string>`coalesce(sum(${schema.peraTransactions.amount}), '0')` })
        .from(schema.peraTransactions)
        .where(
          and(
            eq(schema.peraTransactions.pera_account_id, accountId),
            eq(schema.peraTransactions.type, 'CONTRIBUTION'),
            eq(schema.peraTransactions.pera_txn_status, 'COMPLETED'),
            sql`${schema.peraTransactions.created_at} >= ${yearStart}::timestamp`,
            sql`${schema.peraTransactions.created_at} < (${yearEnd}::date + interval '1 day')::timestamp`,
          ),
        );
      currentYTD = parseFloat(result?.total ?? '0');
    }

    const remainingAllowance = Math.max(0, RA11505_ANNUAL_LIMIT - currentYTD);
    const projectedTotal = currentYTD + amount;

    if (projectedTotal > RA11505_ANNUAL_LIMIT) {
      return {
        allowed: false,
        currentYTD,
        remainingAllowance,
        message:
          `Contribution of PHP ${amount.toLocaleString()} would exceed the RA 11505 annual limit of PHP ${RA11505_ANNUAL_LIMIT.toLocaleString()}. ` +
          `Current YTD: PHP ${currentYTD.toLocaleString()}, remaining allowance: PHP ${remainingAllowance.toLocaleString()}.`,
      };
    }

    return {
      allowed: true,
      currentYTD,
      remainingAllowance: remainingAllowance - amount,
      message:
        `Contribution of PHP ${amount.toLocaleString()} is within the RA 11505 annual limit. ` +
        `Current YTD: PHP ${currentYTD.toLocaleString()}, post-contribution remaining: PHP ${(remainingAllowance - amount).toLocaleString()}.`,
    };
  },

  /** List PERA accounts with filters and pagination */
  async getAccounts(filters: {
    contributorId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.contributorId) {
      conditions.push(eq(schema.peraAccounts.contributor_id, filters.contributorId));
    }

    if (filters.status) {
      conditions.push(eq(schema.peraAccounts.pera_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.peraAccounts)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.peraAccounts.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.peraAccounts)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** List transactions for a PERA account with pagination */
  async getTransactions(
    peraAccountId: number,
    filters?: { page?: number; pageSize?: number },
  ) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const where = eq(schema.peraTransactions.pera_account_id, peraAccountId);

    const data = await db
      .select()
      .from(schema.peraTransactions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.peraTransactions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.peraTransactions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
