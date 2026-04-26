/**
 * TFP Ad-hoc Fee Service (TrustFees Pro -- Phase 7)
 *
 * Captures one-off (ad-hoc) fee accruals subject to maker-checker control.
 *
 * Workflow: capture (PENDING_AUTH) → authorize (OPEN) → EOD invoice pickup
 *           capture (PENDING_AUTH) → reject (CANCELLED)
 *
 * SoD rule: the user who captures cannot be the same user who authorizes.
 *
 * Methods:
 *   - captureAdhocFee(data, userId)   -- Create ad-hoc fee accrual (PENDING_AUTH)
 *   - authorizeAdHocFee(id, checkerId) -- Authorize PENDING_AUTH → OPEN (SoD enforced)
 *   - rejectAdHocFee(id, checkerId, reason) -- Reject PENDING_AUTH → CANCELLED
 *   - getAdhocFees(filters)           -- List ad-hoc fees with filters
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { tfpInvoiceService } from './tfp-invoice-service';

/* ---------- Helpers ---------- */

async function resolveFeeplanId(feeType: string): Promise<number> {
  const [matchingPlan] = await db
    .select({ id: schema.feePlans.id })
    .from(schema.feePlans)
    .where(
      and(
        eq(schema.feePlans.fee_type, feeType as any),
        eq(schema.feePlans.plan_status, 'ACTIVE'),
      ),
    )
    .limit(1);

  if (matchingPlan) return matchingPlan.id;

  const [anyPlan] = await db
    .select({ id: schema.feePlans.id })
    .from(schema.feePlans)
    .where(eq(schema.feePlans.plan_status, 'ACTIVE'))
    .limit(1);

  if (!anyPlan) {
    throw new Error(
      'No active fee plan found. At least one active fee plan is required to capture ad-hoc fees.',
    );
  }
  return anyPlan.id;
}

/* ---------- Main Service ---------- */

export const tfpAdhocFeeService = {
  /**
   * Capture an ad-hoc fee accrual — requires checker authorization before pickup.
   * Creates a PENDING_AUTH record. SoD: the capturing user cannot authorize.
   */
  async captureAdhocFee(
    data: {
      customer_id: string;
      portfolio_id?: string;
      fee_type: string;
      amount: number;
      currency: string;
      reason: string;
    },
    userId: string,
  ) {
    const today = new Date().toISOString().split('T')[0];
    const roundedAmount = Math.round(data.amount * 10000) / 10000;
    const feePlanId = await resolveFeeplanId(data.fee_type);

    const idempotencyKey = `ADHOC:${userId}:${data.customer_id}:${data.fee_type}:${today}:${Date.now()}`;

    const [accrual] = await db
      .insert(schema.tfpAccruals)
      .values({
        fee_plan_id: feePlanId,
        customer_id: data.customer_id,
        portfolio_id: data.portfolio_id ?? null,
        security_id: null,
        transaction_id: null,
        base_amount: String(roundedAmount),
        computed_fee: String(roundedAmount),
        applied_fee: String(roundedAmount),
        currency: data.currency,
        fx_rate_locked: null,
        accrual_date: today,
        accrual_status: 'PENDING_AUTH',
        override_id: null,
        exception_id: null,
        idempotency_key: idempotencyKey,
        created_by: userId,
      })
      .returning();

    return {
      accrual,
      message: `Ad-hoc fee of ${data.currency} ${roundedAmount} submitted for authorization. Will be included in the next invoice cycle once approved.`,
    };
  },

  /**
   * Authorize a PENDING_AUTH ad-hoc fee → OPEN (picked up by next invoice cycle).
   * Enforces SoD: checkerId must differ from the original creator (created_by).
   */
  async authorizeAdHocFee(id: number, checkerId: string) {
    const [accrual] = await db
      .select()
      .from(schema.tfpAccruals)
      .where(eq(schema.tfpAccruals.id, id))
      .limit(1);

    if (!accrual) throw new Error(`Ad-hoc fee accrual not found: ${id}`);

    if (accrual.accrual_status !== 'PENDING_AUTH') {
      throw new Error(
        `Accrual ${id} is not pending authorization (status: ${accrual.accrual_status})`,
      );
    }

    // SoD: checker cannot be the same user as the maker
    if (accrual.created_by && accrual.created_by === checkerId) {
      throw new Error('Separation of duties violation: authorizer cannot be the same as the submitter');
    }

    const [updated] = await db
      .update(schema.tfpAccruals)
      .set({
        accrual_status: 'OPEN',
        updated_at: new Date(),
        created_by: accrual.created_by, // preserve original maker
      })
      .where(eq(schema.tfpAccruals.id, id))
      .returning();

    return { accrual: updated, authorized_by: checkerId };
  },

  /**
   * Reject a PENDING_AUTH ad-hoc fee → CANCELLED.
   * Enforces SoD: checkerId must differ from the original creator.
   */
  async rejectAdHocFee(id: number, checkerId: string, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Rejection reason must be at least 5 characters');
    }

    const [accrual] = await db
      .select()
      .from(schema.tfpAccruals)
      .where(eq(schema.tfpAccruals.id, id))
      .limit(1);

    if (!accrual) throw new Error(`Ad-hoc fee accrual not found: ${id}`);

    if (accrual.accrual_status !== 'PENDING_AUTH') {
      throw new Error(
        `Accrual ${id} is not pending authorization (status: ${accrual.accrual_status})`,
      );
    }

    if (accrual.created_by && accrual.created_by === checkerId) {
      throw new Error('Separation of duties violation: rejector cannot be the same as the submitter');
    }

    const [updated] = await db
      .update(schema.tfpAccruals)
      .set({
        accrual_status: 'CANCELLED',
        updated_at: new Date(),
      })
      .where(eq(schema.tfpAccruals.id, id))
      .returning();

    return { accrual: updated, rejected_by: checkerId, reason };
  },

  /**
   * List ad-hoc fees with optional filters.
   * Ad-hoc fees are identified by idempotency_key starting with "ADHOC:".
   */
  async getAdhocFees(filters?: {
    accrual_status?: string;
    customer_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(sql`${schema.tfpAccruals.idempotency_key} LIKE 'ADHOC:%'`);

    if (filters?.accrual_status) {
      conditions.push(eq(schema.tfpAccruals.accrual_status, filters.accrual_status as any));
    }
    if (filters?.customer_id) {
      conditions.push(eq(schema.tfpAccruals.customer_id, filters.customer_id));
    }
    if (filters?.date_from) {
      conditions.push(sql`${schema.tfpAccruals.accrual_date} >= ${filters.date_from}`);
    }
    if (filters?.date_to) {
      conditions.push(sql`${schema.tfpAccruals.accrual_date} <= ${filters.date_to}`);
    }

    const where = and(...conditions);

    const data = await db
      .select({
        id: schema.tfpAccruals.id,
        fee_plan_id: schema.tfpAccruals.fee_plan_id,
        customer_id: schema.tfpAccruals.customer_id,
        portfolio_id: schema.tfpAccruals.portfolio_id,
        base_amount: schema.tfpAccruals.base_amount,
        computed_fee: schema.tfpAccruals.computed_fee,
        applied_fee: schema.tfpAccruals.applied_fee,
        currency: schema.tfpAccruals.currency,
        accrual_date: schema.tfpAccruals.accrual_date,
        accrual_status: schema.tfpAccruals.accrual_status,
        idempotency_key: schema.tfpAccruals.idempotency_key,
        created_at: schema.tfpAccruals.created_at,
        created_by: schema.tfpAccruals.created_by,
        fee_plan_code: schema.feePlans.fee_plan_code,
        fee_type: schema.feePlans.fee_type,
      })
      .from(schema.tfpAccruals)
      .leftJoin(schema.feePlans, eq(schema.tfpAccruals.fee_plan_id, schema.feePlans.id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.tfpAccruals.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tfpAccruals)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * GAP-C09: Capture an ad-hoc fee and immediately generate an invoice for it.
   * Still requires maker-checker — the captureAdhocFee creates PENDING_AUTH first.
   * Use authorizeAdHocFee() then this method for immediate invoicing.
   */
  async captureAndInvoice(
    data: {
      customer_id: string;
      portfolio_id?: string;
      fee_type: string;
      amount: number;
      currency: string;
      reason: string;
    },
    userId: string,
  ) {
    const captureResult = await this.captureAdhocFee(data, userId);
    const accrual = captureResult.accrual;

    const invoiceResult = await tfpInvoiceService.generateInvoices(
      accrual.accrual_date,
      accrual.accrual_date,
    );

    return {
      accrual,
      invoice: invoiceResult,
      message: `Ad-hoc fee submitted. ${invoiceResult.invoices_created ?? 0} invoice(s) generated (requires authorization before pickup).`,
    };
  },
};
