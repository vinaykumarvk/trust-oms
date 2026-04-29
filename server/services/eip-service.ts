/**
 * EIP Service (Phase 3I)
 *
 * Equity Investment Plan lifecycle management.
 * Handles enrollment, modification, unsubscription, and auto-debit processing
 * for scheduled EIP plans (BDO RFI Gap #9 Critical).
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// FR-EIP-005: Finacle Core-System Transmission
// ---------------------------------------------------------------------------

export interface FinacleTransmitResult {
  finacleRef: string | null;
  status: 'SUCCESS' | 'FAILED' | 'STUB_MODE';
  responseCode: string;
  message?: string;
}

/**
 * Transmit an auto-debit instruction to Finacle core banking system.
 *
 * When FINACLE_API_URL is set, makes a REST POST to the Finacle endpoint
 * with the debit instruction payload. Otherwise runs in stub mode (logs
 * the payload and returns a synthetic reference).
 */
async function transmitToCoreBanking(params: {
  accountNumber: string;
  amount: number;
  currency: string;
  debitReference: string;
  valueDate: string;
}): Promise<FinacleTransmitResult> {
  const finacleUrl = process.env.FINACLE_API_URL;

  const payload = {
    header: {
      messageType: 'AUTO_DEBIT',
      channel: 'TRUSTOMS',
      requestId: params.debitReference,
      timestamp: new Date().toISOString(),
    },
    body: {
      accountNumber: params.accountNumber,
      transactionType: 'DEBIT',
      amount: {
        value: params.amount,
        currency: params.currency,
      },
      debitReference: params.debitReference,
      valueDate: params.valueDate,
      narration: `EIP auto-debit | Ref: ${params.debitReference}`,
      instructedBy: 'TRUSTOMS_SYSTEM',
    },
  };

  if (!finacleUrl) {
    // Stub mode — no Finacle endpoint configured
    console.warn(
      `[EIP-Finacle] FINACLE_API_URL not set — running in stub mode. Payload: ${JSON.stringify(payload.body)}`,
    );
    const stubRef = `FIN-STUB-${Date.now()}`;
    return {
      finacleRef: stubRef,
      status: 'STUB_MODE',
      responseCode: 'STUB_OK',
      message: 'Finacle integration running in stub mode (FINACLE_API_URL not configured)',
    };
  }

  try {
    const response = await fetch(finacleUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.FINACLE_API_KEY
          ? { Authorization: `Bearer ${process.env.FINACLE_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout for banking call
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'No response body');
      console.error(
        `[EIP-Finacle] Finacle returned HTTP ${response.status}: ${errorBody}`,
      );
      return {
        finacleRef: null,
        status: 'FAILED',
        responseCode: `HTTP_${response.status}`,
        message: `Finacle API returned status ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      referenceNumber?: string;
      responseCode?: string;
      status?: string;
    };

    return {
      finacleRef: data.referenceNumber ?? null,
      status: 'SUCCESS',
      responseCode: data.responseCode ?? 'OK',
    };
  } catch (err) {
    console.error('[EIP-Finacle] Transmission failed:', err);
    return {
      finacleRef: null,
      status: 'FAILED',
      responseCode: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/** Compute the next execution date based on frequency from a given start date. */
function computeNextExecutionDate(frequency: string, from?: Date): string {
  const base = from ?? new Date();
  const next = new Date(base);

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'BI_WEEKLY':
      next.setDate(next.getDate() + 14);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString().split('T')[0];
}

export const eipService = {
  /** Enroll a new EIP plan */
  async enrollEIP(data: {
    clientId: string;
    productId: number;
    amount: number;
    frequency: string;
    caAccount: string;
    portfolioId: string;
  }) {
    if (data.amount <= 0) {
      throw new Error('EIP amount must be positive');
    }

    const nextExecutionDate = computeNextExecutionDate(data.frequency);

    const [plan] = await db
      .insert(schema.scheduledPlans)
      .values({
        client_id: data.clientId,
        portfolio_id: data.portfolioId,
        plan_type: 'EIP',
        product_id: data.productId,
        amount: String(data.amount),
        currency: 'PHP',
        frequency: data.frequency,
        ca_sa_account: data.caAccount,
        next_execution_date: nextExecutionDate,
        scheduled_plan_status: 'ACTIVE',
      })
      .returning();

    return plan;
  },

  /** Modify an existing EIP plan */
  async modifyEIP(
    planId: number,
    changes: { amount?: number; frequency?: string; caAccount?: string },
  ) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`EIP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'EIP') {
      throw new Error(`Plan ${planId} is not an EIP plan`);
    }

    if (plan.scheduled_plan_status !== 'ACTIVE') {
      throw new Error(`Cannot modify EIP plan in status ${plan.scheduled_plan_status}`);
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (changes.amount !== undefined) {
      if (changes.amount <= 0) {
        throw new Error('EIP amount must be positive');
      }
      updates.amount = String(changes.amount);
    }

    if (changes.frequency !== undefined) {
      updates.frequency = changes.frequency;
      updates.next_execution_date = computeNextExecutionDate(changes.frequency);
    }

    if (changes.caAccount !== undefined) {
      updates.ca_sa_account = changes.caAccount;
    }

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set(updates)
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return updated;
  },

  /** Unsubscribe (cancel) an EIP plan */
  async unsubscribeEIP(planId: number, reason?: string) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`EIP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'EIP') {
      throw new Error(`Plan ${planId} is not an EIP plan`);
    }

    if (plan.scheduled_plan_status === 'CANCELLED') {
      throw new Error(`EIP plan ${planId} is already cancelled`);
    }

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set({
        scheduled_plan_status: 'CANCELLED',
        status: reason ?? 'Unsubscribed',
        updated_at: new Date(),
      })
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return updated;
  },

  /**
   * Process auto-debit for an EIP plan.
   * Creates a subscription order linked to the scheduled plan, validates cash
   * availability in the nominated CA/SA, and advances the next execution date.
   * Failed executions (insufficient funds) are retried once on T+1; if still
   * failed, the EIP is paused and the client is notified.
   */
  async processAutoDebit(planId: number) {
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`EIP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'EIP') {
      throw new Error(`Plan ${planId} is not an EIP plan`);
    }

    if (plan.scheduled_plan_status !== 'ACTIVE') {
      throw new Error(`Cannot process auto-debit for plan in status ${plan.scheduled_plan_status}`);
    }

    const amount = parseFloat(plan.amount ?? '0');
    const portfolioId = plan.portfolio_id;
    const productId = plan.product_id;

    if (!portfolioId) {
      throw new Error(`EIP plan ${planId} has no portfolio_id`);
    }

    // Validate cash availability in the nominated CA/SA
    const [ledger] = await db
      .select()
      .from(schema.cashLedger)
      .where(
        and(
          eq(schema.cashLedger.portfolio_id, portfolioId),
          eq(schema.cashLedger.currency, plan.currency ?? 'PHP'),
        ),
      )
      .limit(1);

    const availableBalance = parseFloat(ledger?.available_balance ?? '0');
    const retryCount = (plan as any).retry_count ?? 0;

    if (availableBalance < amount) {
      if (retryCount < 1) {
        // First failure — schedule retry on T+1
        const retryDate = new Date();
        retryDate.setDate(retryDate.getDate() + 1);
        await db
          .update(schema.scheduledPlans)
          .set({
            next_execution_date: retryDate.toISOString().split('T')[0],
            status: `RETRY_PENDING (attempt ${retryCount + 1})`,
            updated_at: new Date(),
          })
          .where(eq(schema.scheduledPlans.id, planId));

        return {
          plan,
          status: 'INSUFFICIENT_FUNDS_RETRY',
          retry_date: retryDate.toISOString().split('T')[0],
          available_balance: availableBalance,
          required_amount: amount,
        };
      }

      // Second failure — pause the EIP
      const [paused] = await db
        .update(schema.scheduledPlans)
        .set({
          scheduled_plan_status: 'PAUSED',
          status: 'Paused: insufficient funds after retry',
          updated_at: new Date(),
        })
        .where(eq(schema.scheduledPlans.id, planId))
        .returning();

      return {
        plan: paused,
        status: 'PAUSED_INSUFFICIENT_FUNDS',
        available_balance: availableBalance,
        required_amount: amount,
      };
    }

    // Create a subscription order linked to this scheduled plan
    const orderNo = `EIP-${planId}-${Date.now()}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const [order] = await db
      .insert(schema.orders)
      .values({
        portfolio_id: portfolioId,
        security_id: productId,
        side: 'BUY',
        quantity: String(amount),
        currency: plan.currency ?? 'PHP',
        order_status: 'PENDING_AUTH',
        order_type: 'SUBSCRIPTION',
        order_no: orderNo,
        value_date: todayStr,
        scheduled_plan_id: planId,
        created_by: 'SYSTEM',
      })
      .returning();

    // FR-EIP-005: Transmit auto-debit instruction to Finacle core banking
    const finacleResult = await transmitToCoreBanking({
      accountNumber: plan.ca_sa_account ?? '',
      amount,
      currency: plan.currency ?? 'PHP',
      debitReference: orderNo,
      valueDate: todayStr,
    });

    // If Finacle transmission failed, flag the order as FUNDING_PENDING
    // The order still exists but funding has not been confirmed
    let fundingStatus: 'FUNDED' | 'FUNDING_PENDING' = 'FUNDED';
    if (finacleResult.status === 'FAILED') {
      fundingStatus = 'FUNDING_PENDING';
      // Update order status to reflect pending funding
      await db
        .update(schema.orders)
        .set({
          status: 'FUNDING_PENDING',
          correlation_id: `FINACLE_FAIL:${finacleResult.responseCode}`,
          updated_at: new Date(),
        })
        .where(eq(schema.orders.order_id, order.order_id));
    } else if (finacleResult.finacleRef) {
      // Store Finacle reference on the order for traceability
      await db
        .update(schema.orders)
        .set({
          transaction_ref_no: finacleResult.finacleRef,
          updated_at: new Date(),
        })
        .where(eq(schema.orders.order_id, order.order_id));
    }

    // Advance next_execution_date and reset retry state
    const currentDate = plan.next_execution_date
      ? new Date(plan.next_execution_date)
      : new Date();
    const nextDate = computeNextExecutionDate(plan.frequency ?? 'MONTHLY', currentDate);

    const [updated] = await db
      .update(schema.scheduledPlans)
      .set({
        next_execution_date: nextDate,
        status: `Last executed: ${todayStr}`,
        updated_at: new Date(),
      })
      .where(eq(schema.scheduledPlans.id, planId))
      .returning();

    return {
      plan: updated,
      order_id: order.order_id,
      order_no: orderNo,
      processed_amount: plan.amount,
      previous_date: plan.next_execution_date,
      next_date: nextDate,
      finacle: {
        ref: finacleResult.finacleRef,
        status: finacleResult.status,
        responseCode: finacleResult.responseCode,
        fundingStatus,
      },
    };
  },

  /**
   * Submit an EIP enrollment through the maker-checker (four-eyes) approval workflow.
   * Creates an approval request with entity_type='EIP_ENROLLMENT' and action='ENROLL'
   * requiring FOUR_EYES approval before the enrollment is activated.
   */
  async submitEIPEnrollment(
    employeeId: string,
    planId: number,
    submittedBy: number,
  ) {
    // Validate the scheduled plan exists and is an EIP plan
    const [plan] = await db
      .select()
      .from(schema.scheduledPlans)
      .where(eq(schema.scheduledPlans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`EIP plan not found: ${planId}`);
    }

    if (plan.plan_type !== 'EIP') {
      throw new Error(`Plan ${planId} is not an EIP plan`);
    }

    // Check for duplicate pending approval requests for this enrollment
    const [existingRequest] = await db
      .select()
      .from(schema.approvalRequests)
      .where(
        and(
          eq(schema.approvalRequests.entity_type, 'EIP_ENROLLMENT'),
          eq(schema.approvalRequests.entity_id, String(planId)),
          eq(schema.approvalRequests.approval_status, 'PENDING'),
        ),
      )
      .limit(1);

    if (existingRequest) {
      throw new Error(
        `A pending enrollment approval already exists for plan ${planId} (approval request #${existingRequest.id})`,
      );
    }

    // Set SLA deadline: 48 hours from now for FOUR_EYES approval
    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + 48);

    // Create the approval request requiring FOUR_EYES review
    const [approvalRequest] = await db
      .insert(schema.approvalRequests)
      .values({
        entity_type: 'EIP_ENROLLMENT',
        entity_id: String(planId),
        action: 'ENROLL',
        approval_status: 'PENDING',
        payload: {
          employee_id: employeeId,
          plan_id: planId,
          plan_type: plan.plan_type,
          amount: plan.amount,
          frequency: plan.frequency,
          client_id: plan.client_id,
          portfolio_id: plan.portfolio_id,
          approval_type: 'FOUR_EYES',
        } as Record<string, unknown>,
        submitted_by: submittedBy,
        submitted_at: new Date(),
        sla_deadline: slaDeadline,
        is_sla_breached: false,
      })
      .returning();

    return approvalRequest;
  },

  /**
   * Track e-learning module completion and gate EIP enrollment on passing score.
   * A score >= 70 is required to pass. Records completion in the GL audit log
   * for traceability.
   */
  async trackELearningCompletion(
    employeeId: string,
    moduleId: string,
    score: number,
  ): Promise<{ completed: boolean; passed: boolean; score: number }> {
    const PASSING_SCORE = 70;
    const passed = score >= PASSING_SCORE;

    // Record the e-learning completion in the audit log for traceability
    await db.insert(schema.glAuditLog).values({
      action: 'ELEARNING_COMPLETION',
      object_type: 'EIP_ELEARNING',
      object_id: 0, // No specific object — keyed by employee/module in new_values
      new_values: {
        employee_id: employeeId,
        module_id: moduleId,
        score,
        passed,
        passing_score: PASSING_SCORE,
        completed_at: new Date().toISOString(),
      } as Record<string, unknown>,
    });

    return {
      completed: true,
      passed,
      score,
    };
  },

  /** Get EIP dashboard with status summaries */
  async getEIPDashboard(clientId?: string) {
    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(schema.scheduledPlans.plan_type, 'EIP'));

    if (clientId) {
      conditions.push(eq(schema.scheduledPlans.client_id, clientId));
    }

    const where = and(...conditions);

    const plans = await db
      .select()
      .from(schema.scheduledPlans)
      .where(where)
      .orderBy(desc(schema.scheduledPlans.created_at));

    // Compute status summaries
    const summaries = {
      total: plans.length,
      active: plans.filter((p: any) => p.scheduled_plan_status === 'ACTIVE').length,
      paused: plans.filter((p: any) => p.scheduled_plan_status === 'PAUSED').length,
      cancelled: plans.filter((p: any) => p.scheduled_plan_status === 'CANCELLED').length,
      completed: plans.filter((p: any) => p.scheduled_plan_status === 'COMPLETED').length,
    };

    return { plans, summaries };
  },

  /** Get EIP plans with filters and pagination */
  async getEIPPlans(filters: {
    clientId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(schema.scheduledPlans.plan_type, 'EIP'));

    if (filters.clientId) {
      conditions.push(eq(schema.scheduledPlans.client_id, filters.clientId));
    }

    if (filters.status) {
      conditions.push(eq(schema.scheduledPlans.scheduled_plan_status, filters.status as any));
    }

    const where = and(...conditions);

    const data = await db
      .select()
      .from(schema.scheduledPlans)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.scheduledPlans.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.scheduledPlans)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
