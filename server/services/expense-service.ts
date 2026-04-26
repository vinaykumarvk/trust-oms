/**
 * CRM Expense Service (FR-020 — BRD Gap P0-01)
 *
 * Tracks client-meeting expenses (travel, meals, entertainment, etc.) with
 * a simple approval workflow: DRAFT → SUBMITTED → APPROVED / REJECTED.
 *
 * Business rules:
 *   - expense_date max 30 days in the past
 *   - Expenses > PHP 10,000 require receipt_url
 *   - Only BO_HEAD / supervisor can approve / reject
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_BACKDATE_DAYS = 30;
const HIGH_VALUE_THRESHOLD = 10000; // PHP

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateExpenseRef(): Promise<string> {
  const today = new Date();
  const prefix = `EXP-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const [last] = await db
    .select({ ref: schema.crmExpenses.expense_ref })
    .from(schema.crmExpenses)
    .where(sql`${schema.crmExpenses.expense_ref} LIKE ${prefix + '-%'}`)
    .orderBy(desc(schema.crmExpenses.expense_ref))
    .limit(1);
  const seq = last ? parseInt(last.ref.split('-').pop() ?? '0', 10) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const expenseService = {
  /**
   * Create a new expense in DRAFT status.
   */
  async create(data: {
    call_report_id?: number;
    meeting_id?: number;
    expense_type: string;
    amount: number;
    currency?: string;
    expense_date: string;
    description: string;
    receipt_url?: string;
    branch_id?: number;
    submitted_by: number;
  }) {
    // Validate amount
    if (data.amount <= 0) throw new Error('amount must be a positive number');

    // Validate backdate limit
    const expenseDate = new Date(data.expense_date);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_BACKDATE_DAYS);
    if (expenseDate < cutoff) {
      throw new Error(`expense_date cannot be more than ${MAX_BACKDATE_DAYS} days in the past`);
    }
    if (expenseDate > new Date()) {
      throw new Error('expense_date cannot be in the future');
    }

    // High-value receipt requirement
    if (data.amount > HIGH_VALUE_THRESHOLD && !data.receipt_url) {
      throw new Error(`Expenses over PHP ${HIGH_VALUE_THRESHOLD.toLocaleString()} require a receipt attachment`);
    }

    const expense_ref = await generateExpenseRef();
    const currency = data.currency ?? 'PHP';

    const [expense] = await db
      .insert(schema.crmExpenses)
      .values({
        expense_ref,
        call_report_id: data.call_report_id ?? null,
        meeting_id: data.meeting_id ?? null,
        expense_type: data.expense_type,
        amount: String(data.amount),
        currency,
        expense_date: data.expense_date,
        description: data.description,
        receipt_url: data.receipt_url ?? null,
        expense_status: 'DRAFT',
        submitted_by: data.submitted_by,
        branch_id: data.branch_id ?? null,
      })
      .returning();

    return expense;
  },

  /**
   * Get a single expense by ID.
   */
  async getById(id: number) {
    const [expense] = await db
      .select()
      .from(schema.crmExpenses)
      .where(eq(schema.crmExpenses.id, id))
      .limit(1);
    if (!expense) throw new Error(`Expense not found: ${id}`);
    return expense;
  },

  /**
   * Update a DRAFT expense.
   */
  async update(id: number, userId: number, data: {
    expense_type?: string;
    amount?: number;
    currency?: string;
    expense_date?: string;
    description?: string;
    receipt_url?: string;
    call_report_id?: number;
    meeting_id?: number;
  }) {
    const expense = await this.getById(id);
    if (expense.submitted_by !== userId) throw new Error('Forbidden: not the expense owner');
    if (expense.expense_status !== 'DRAFT') {
      throw new Error(`Cannot edit expense in status: ${expense.expense_status}`);
    }

    if (data.amount !== undefined && data.amount <= 0) {
      throw new Error('amount must be a positive number');
    }
    if (data.expense_date) {
      const expenseDate = new Date(data.expense_date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - MAX_BACKDATE_DAYS);
      if (expenseDate < cutoff) {
        throw new Error(`expense_date cannot be more than ${MAX_BACKDATE_DAYS} days in the past`);
      }
    }

    const newAmount = data.amount ?? parseFloat(expense.amount as string);
    const newReceipt = data.receipt_url ?? expense.receipt_url;
    if (newAmount > HIGH_VALUE_THRESHOLD && !newReceipt) {
      throw new Error(`Expenses over PHP ${HIGH_VALUE_THRESHOLD.toLocaleString()} require a receipt attachment`);
    }

    const [updated] = await db
      .update(schema.crmExpenses)
      .set({
        ...(data.expense_type && { expense_type: data.expense_type }),
        ...(data.amount !== undefined && { amount: String(data.amount) }),
        ...(data.currency && { currency: data.currency }),
        ...(data.expense_date && { expense_date: data.expense_date }),
        ...(data.description && { description: data.description }),
        ...(data.receipt_url !== undefined && { receipt_url: data.receipt_url }),
        ...(data.call_report_id !== undefined && { call_report_id: data.call_report_id }),
        ...(data.meeting_id !== undefined && { meeting_id: data.meeting_id }),
        updated_at: new Date(),
      })
      .where(eq(schema.crmExpenses.id, id))
      .returning();

    return updated;
  },

  /**
   * Submit a DRAFT expense for approval.
   */
  async submit(id: number, userId: number) {
    const expense = await this.getById(id);
    if (expense.submitted_by !== userId) throw new Error('Forbidden: not the expense owner');
    if (expense.expense_status !== 'DRAFT') {
      throw new Error(`Cannot submit expense in status: ${expense.expense_status}`);
    }

    // Re-validate high-value rule on submit
    const amount = parseFloat(expense.amount as string);
    if (amount > HIGH_VALUE_THRESHOLD && !expense.receipt_url) {
      throw new Error(`Expenses over PHP ${HIGH_VALUE_THRESHOLD.toLocaleString()} require a receipt attachment before submission`);
    }

    const [updated] = await db
      .update(schema.crmExpenses)
      .set({ expense_status: 'SUBMITTED', updated_at: new Date() })
      .where(eq(schema.crmExpenses.id, id))
      .returning();

    return updated;
  },

  /**
   * Approve a SUBMITTED expense.
   */
  async approve(id: number, approverId: number) {
    const expense = await this.getById(id);
    if (expense.expense_status !== 'SUBMITTED') {
      throw new Error(`Cannot approve expense in status: ${expense.expense_status}`);
    }

    const [updated] = await db
      .update(schema.crmExpenses)
      .set({
        expense_status: 'APPROVED',
        approved_by: approverId,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.crmExpenses.id, id))
      .returning();

    return updated;
  },

  /**
   * Reject a SUBMITTED expense with a reason.
   */
  async reject(id: number, approverId: number, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new Error('rejection_reason must be at least 5 characters');
    }
    const expense = await this.getById(id);
    if (expense.expense_status !== 'SUBMITTED') {
      throw new Error(`Cannot reject expense in status: ${expense.expense_status}`);
    }

    const [updated] = await db
      .update(schema.crmExpenses)
      .set({
        expense_status: 'REJECTED',
        rejection_reason: reason.trim(),
        approved_by: approverId,
        updated_at: new Date(),
      })
      .where(eq(schema.crmExpenses.id, id))
      .returning();

    return updated;
  },

  /**
   * List expenses with optional filters and pagination.
   */
  async list(filters?: {
    submitted_by?: number;
    expense_status?: string;
    call_report_id?: number;
    meeting_id?: number;
    date_from?: string;
    date_to?: string;
    branch_id?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (filters?.submitted_by) conditions.push(eq(schema.crmExpenses.submitted_by, filters.submitted_by));
    if (filters?.expense_status) conditions.push(eq(schema.crmExpenses.expense_status, filters.expense_status));
    if (filters?.call_report_id) conditions.push(eq(schema.crmExpenses.call_report_id, filters.call_report_id));
    if (filters?.meeting_id) conditions.push(eq(schema.crmExpenses.meeting_id, filters.meeting_id));
    if (filters?.branch_id) conditions.push(eq(schema.crmExpenses.branch_id, filters.branch_id));
    if (filters?.date_from) conditions.push(sql`${schema.crmExpenses.expense_date} >= ${filters.date_from}`);
    if (filters?.date_to) conditions.push(sql`${schema.crmExpenses.expense_date} <= ${filters.date_to}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.crmExpenses)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.crmExpenses.created_at));

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.crmExpenses)
      .where(where);

    return { data, total: Number(count), page, pageSize };
  },
};
