/**
 * TFP Payment Service (TrustFees Pro -- Phase 7)
 *
 * Handles payment capture, reversal, and listing for trust fee invoices.
 *
 * Methods:
 *   - capturePayment(data)            -- Record payment against invoice (full/partial/over)
 *   - getPayments(filters)            -- List payments with filters
 *   - reversePayment(paymentId, reason) -- POSTED -> REVERSED, adjust invoice balance
 *   - getPaymentsForInvoice(invoiceId) -- All payments for a specific invoice
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { fxRateService } from './fx-rate-service';
import { exceptionQueueService } from './exception-queue-service';

/* ---------- Main Service ---------- */

export const tfpPaymentService = {
  /**
   * Capture a payment against an invoice.
   * Handles full, partial, and over-payment scenarios.
   */
  async capturePayment(data: {
    invoice_id: number;
    amount: number;
    currency: string;
    payment_date: string;
    payment_method: string;
    reference_no: string;
  }) {
    // 1. Validate invoice exists
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, data.invoice_id))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice not found: ${data.invoice_id}`);
    }

    // 2. Verify invoice is in a payable status
    const payableStatuses = ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'];
    if (!payableStatuses.includes(invoice.invoice_status)) {
      throw new Error(
        `Cannot record payment for invoice in status ${invoice.invoice_status}; must be ISSUED, OVERDUE, or PARTIALLY_PAID`,
      );
    }

    // 3. Calculate existing paid amount
    const existingPayments = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.tfpPayments.amount}::numeric), 0)`,
      })
      .from(schema.tfpPayments)
      .where(
        and(
          eq(schema.tfpPayments.invoice_id, data.invoice_id),
          eq(schema.tfpPayments.payment_status, 'POSTED'),
        ),
      );

    const alreadyPaid = parseFloat(existingPayments[0]?.total ?? '0');
    const grandTotal = parseFloat(invoice.grand_total);

    // GAP-A09/C10: FX reconciliation if payment currency differs from invoice
    let effectiveAmount = data.amount;
    if (data.currency !== invoice.currency) {
      try {
        const fxResult = await fxRateService.getFxRate(data.currency, invoice.currency, data.payment_date);
        const convertedAmount = data.amount * fxResult.mid_rate;
        const diffPct = Math.abs(convertedAmount - data.amount) / data.amount;

        if (diffPct > 0.01) {
          await exceptionQueueService.createException({
            exception_type: 'PAYMENT_AMBIGUITY',
            severity: 'P2',
            title: `FX variance >1% on payment for invoice ${invoice.invoice_number}`,
            description: `Payment ${data.currency} ${data.amount} → ${invoice.currency} ${convertedAmount.toFixed(4)} (${(diffPct * 100).toFixed(2)}% variance)`,
            customer_id: invoice.customer_id,
            aggregate_type: 'PAYMENT',
            aggregate_id: String(data.invoice_id),
          });
        }
        effectiveAmount = convertedAmount;
      } catch {
        // FX rate unavailable — use original amount
      }
    }

    const remaining = grandTotal - alreadyPaid;
    const paymentAmount = effectiveAmount;

    // 4. Insert payment record
    const [payment] = await db
      .insert(schema.tfpPayments)
      .values({
        invoice_id: data.invoice_id,
        amount: String(Math.round(paymentAmount * 10000) / 10000),
        currency: data.currency,
        payment_date: data.payment_date,
        method: data.payment_method,
        reference_no: data.reference_no,
        payment_status: 'POSTED',
      })
      .returning();

    // 5. Determine new invoice status and handle over-payment
    const totalPaidAfter = alreadyPaid + paymentAmount;
    let newStatus: string;
    let exceptionCreated = false;

    if (totalPaidAfter >= grandTotal) {
      newStatus = 'PAID';

      // Check for over-payment
      if (totalPaidAfter > grandTotal) {
        const excess = Math.round((totalPaidAfter - grandTotal) * 10000) / 10000;

        // Create exception item for excess reconciliation
        const slaDue = new Date();
        slaDue.setHours(slaDue.getHours() + 4);

        await db.insert(schema.exceptionItems).values({
          exception_type: 'PAYMENT_AMBIGUITY',
          severity: 'P2',
          customer_id: invoice.customer_id,
          source_aggregate_type: 'PAYMENT',
          source_aggregate_id: String(payment.id),
          title: `Over-payment on ${invoice.invoice_number}: excess ${data.currency} ${excess}`,
          details: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            grand_total: grandTotal,
            total_paid: totalPaidAfter,
            excess_amount: excess,
            payment_id: payment.id,
          },
          assigned_to_team: 'FEE_OPS',
          assigned_to_user: null,
          exception_status: 'OPEN',
          sla_due_at: slaDue,
        });

        exceptionCreated = true;
      }
    } else {
      newStatus = 'PARTIALLY_PAID';
    }

    // 6. Update invoice status
    await db
      .update(schema.tfpInvoices)
      .set({ invoice_status: newStatus, updated_at: new Date() })
      .where(eq(schema.tfpInvoices.id, data.invoice_id));

    return {
      payment,
      invoice_status: newStatus,
      total_paid: Math.round(totalPaidAfter * 10000) / 10000,
      remaining_balance: Math.round(Math.max(0, grandTotal - totalPaidAfter) * 10000) / 10000,
      over_payment: exceptionCreated,
    };
  },

  /**
   * List payments with optional filters.
   */
  async getPayments(filters?: {
    payment_status?: string;
    invoice_id?: number;
    payment_date_from?: string;
    payment_date_to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.payment_status) {
      conditions.push(eq(schema.tfpPayments.payment_status, filters.payment_status as any));
    }

    if (filters?.invoice_id) {
      conditions.push(eq(schema.tfpPayments.invoice_id, filters.invoice_id));
    }

    if (filters?.payment_date_from) {
      conditions.push(
        sql`${schema.tfpPayments.payment_date} >= ${filters.payment_date_from}`,
      );
    }

    if (filters?.payment_date_to) {
      conditions.push(
        sql`${schema.tfpPayments.payment_date} <= ${filters.payment_date_to}`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Join with invoice for invoice_number
    const data = await db
      .select({
        id: schema.tfpPayments.id,
        invoice_id: schema.tfpPayments.invoice_id,
        amount: schema.tfpPayments.amount,
        currency: schema.tfpPayments.currency,
        payment_date: schema.tfpPayments.payment_date,
        method: schema.tfpPayments.method,
        reference_no: schema.tfpPayments.reference_no,
        payment_status: schema.tfpPayments.payment_status,
        created_at: schema.tfpPayments.created_at,
        invoice_number: schema.tfpInvoices.invoice_number,
        customer_id: schema.tfpInvoices.customer_id,
      })
      .from(schema.tfpPayments)
      .leftJoin(schema.tfpInvoices, eq(schema.tfpPayments.invoice_id, schema.tfpInvoices.id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.tfpPayments.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tfpPayments)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Reverse a payment: POSTED -> REVERSED.
   * Adjusts the invoice balance accordingly.
   */
  async reversePayment(paymentId: number, reason: string) {
    const [payment] = await db
      .select()
      .from(schema.tfpPayments)
      .where(eq(schema.tfpPayments.id, paymentId))
      .limit(1);

    if (!payment) {
      throw new Error(`Payment not found: ${paymentId}`);
    }

    if (payment.payment_status !== 'POSTED') {
      throw new Error(
        `Cannot reverse payment in status ${payment.payment_status}; must be POSTED`,
      );
    }

    // Reverse the payment
    await db
      .update(schema.tfpPayments)
      .set({ payment_status: 'REVERSED', updated_at: new Date() })
      .where(eq(schema.tfpPayments.id, paymentId));

    // Recalculate invoice balance if there is an associated invoice
    if (payment.invoice_id) {
      const [invoice] = await db
        .select()
        .from(schema.tfpInvoices)
        .where(eq(schema.tfpInvoices.id, payment.invoice_id))
        .limit(1);

      if (invoice) {
        // Recalculate total paid (excluding the reversed payment)
        const paidResult = await db
          .select({
            total: sql<string>`COALESCE(SUM(${schema.tfpPayments.amount}::numeric), 0)`,
          })
          .from(schema.tfpPayments)
          .where(
            and(
              eq(schema.tfpPayments.invoice_id, payment.invoice_id),
              eq(schema.tfpPayments.payment_status, 'POSTED'),
            ),
          );

        const totalPaid = parseFloat(paidResult[0]?.total ?? '0');
        const grandTotal = parseFloat(invoice.grand_total);

        let newStatus: string;
        if (totalPaid <= 0) {
          // Check if past due
          const today = new Date().toISOString().split('T')[0];
          newStatus = invoice.due_date < today ? 'OVERDUE' : 'ISSUED';
        } else if (totalPaid >= grandTotal) {
          newStatus = 'PAID';
        } else {
          newStatus = 'PARTIALLY_PAID';
        }

        await db
          .update(schema.tfpInvoices)
          .set({ invoice_status: newStatus, updated_at: new Date() })
          .where(eq(schema.tfpInvoices.id, payment.invoice_id));
      }
    }

    return {
      payment_id: paymentId,
      reversed: true,
      reason,
    };
  },

  /**
   * Get all payments for a specific invoice.
   */
  async getPaymentsForInvoice(invoiceId: number) {
    const payments = await db
      .select()
      .from(schema.tfpPayments)
      .where(eq(schema.tfpPayments.invoice_id, invoiceId))
      .orderBy(desc(schema.tfpPayments.created_at));

    return payments;
  },
};
