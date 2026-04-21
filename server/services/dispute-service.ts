/**
 * Dispute Service (TrustFees Pro -- Phase 9)
 *
 * Manages invoice disputes lifecycle: OPEN -> INVESTIGATING -> RESOLVED/REJECTED.
 *
 * Methods:
 *   - raiseDispute(invoiceId, raisedBy, reason)    -- Create dispute, mark invoice DISPUTED
 *   - investigate(disputeId)                       -- OPEN -> INVESTIGATING
 *   - resolve(disputeId, resolution, refundAmount) -- Issue credit note, INVESTIGATING -> RESOLVED
 *   - rejectDispute(disputeId, reason)             -- INVESTIGATING -> REJECTED, restore invoice
 *   - getDisputes(filters)                         -- Paginated list
 *   - getDisputeById(id)                           -- Single dispute with invoice + credit notes
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, or } from 'drizzle-orm';
import { creditNoteService } from './credit-note-service';

/* ---------- Main Service ---------- */

export const disputeService = {
  /**
   * Raise a dispute on an invoice. Sets invoice status to DISPUTED.
   */
  async raiseDispute(invoiceId: number, raisedBy: string, reason: string) {
    // 1. Verify invoice exists and is disputable
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    const disputableStatuses = ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'];
    if (!disputableStatuses.includes(invoice.invoice_status)) {
      throw new Error(`Cannot dispute invoice in status ${invoice.invoice_status}; must be ISSUED, OVERDUE, or PARTIALLY_PAID`);
    }

    // 2. Create dispute
    const [dispute] = await db
      .insert(schema.disputes)
      .values({
        invoice_id: invoiceId,
        raised_by: raisedBy,
        reason,
        dispute_status: 'OPEN',
      })
      .returning();

    // 3. Update invoice status to DISPUTED
    await db
      .update(schema.tfpInvoices)
      .set({ invoice_status: 'DISPUTED', updated_at: new Date() })
      .where(eq(schema.tfpInvoices.id, invoiceId));

    return dispute;
  },

  /**
   * Start investigation: OPEN -> INVESTIGATING.
   */
  async investigate(disputeId: number) {
    const [dispute] = await db
      .select()
      .from(schema.disputes)
      .where(eq(schema.disputes.id, disputeId))
      .limit(1);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    if (dispute.dispute_status !== 'OPEN') {
      throw new Error(`Cannot investigate dispute in status ${dispute.dispute_status}; must be OPEN`);
    }

    const [updated] = await db
      .update(schema.disputes)
      .set({ dispute_status: 'INVESTIGATING', updated_at: new Date() })
      .where(eq(schema.disputes.id, disputeId))
      .returning();

    return updated;
  },

  /**
   * Resolve a dispute. Optionally issue a credit note for partial/full refund.
   * INVESTIGATING -> RESOLVED.
   */
  async resolve(disputeId: number, resolution: string, refundAmount?: number) {
    const [dispute] = await db
      .select()
      .from(schema.disputes)
      .where(eq(schema.disputes.id, disputeId))
      .limit(1);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    if (dispute.dispute_status !== 'INVESTIGATING') {
      throw new Error(`Cannot resolve dispute in status ${dispute.dispute_status}; must be INVESTIGATING`);
    }

    // Get invoice for currency info
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, dispute.invoice_id))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice not found for dispute: ${dispute.invoice_id}`);
    }

    let creditNoteId: number | null = null;

    // If refund requested, create a credit note
    if (refundAmount && refundAmount > 0) {
      const grandTotal = parseFloat(invoice.grand_total);
      if (refundAmount > grandTotal) {
        throw new Error(`Refund amount ${refundAmount} exceeds invoice grand total ${grandTotal}`);
      }

      const creditNote = await creditNoteService.issueCreditNote(
        dispute.invoice_id,
        refundAmount,
        invoice.currency,
        'DISPUTE_RESOLUTION',
      );

      creditNoteId = creditNote.id;
    }

    // Update dispute to RESOLVED
    const [updated] = await db
      .update(schema.disputes)
      .set({
        dispute_status: 'RESOLVED',
        resolution_notes: resolution,
        resolved_at: new Date(),
        credit_note_id: creditNoteId,
        updated_at: new Date(),
      })
      .where(eq(schema.disputes.id, disputeId))
      .returning();

    return updated;
  },

  /**
   * Reject a dispute. INVESTIGATING -> REJECTED. Restore invoice to prior status.
   */
  async rejectDispute(disputeId: number, reason: string) {
    const [dispute] = await db
      .select()
      .from(schema.disputes)
      .where(eq(schema.disputes.id, disputeId))
      .limit(1);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    if (dispute.dispute_status !== 'INVESTIGATING') {
      throw new Error(`Cannot reject dispute in status ${dispute.dispute_status}; must be INVESTIGATING`);
    }

    // Update dispute
    const [updated] = await db
      .update(schema.disputes)
      .set({
        dispute_status: 'REJECTED',
        resolution_notes: reason,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.disputes.id, disputeId))
      .returning();

    // Restore invoice status: check if overdue based on due_date
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, dispute.invoice_id))
      .limit(1);

    if (invoice) {
      const today = new Date().toISOString().split('T')[0];
      const restoredStatus = invoice.due_date < today ? 'OVERDUE' : 'ISSUED';

      await db
        .update(schema.tfpInvoices)
        .set({ invoice_status: restoredStatus, updated_at: new Date() })
        .where(eq(schema.tfpInvoices.id, dispute.invoice_id));
    }

    return updated;
  },

  /**
   * List disputes with filters and pagination.
   */
  async getDisputes(filters?: {
    dispute_status?: string;
    customer_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    // Join disputes with invoices for customer filtering and display
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.dispute_status) {
      conditions.push(eq(schema.disputes.dispute_status, filters.dispute_status as any));
    }

    if (filters?.customer_id) {
      conditions.push(eq(schema.tfpInvoices.customer_id, filters.customer_id));
    }

    if (filters?.date_from) {
      conditions.push(sql`${schema.disputes.created_at} >= ${filters.date_from}`);
    }

    if (filters?.date_to) {
      conditions.push(sql`${schema.disputes.created_at} <= ${filters.date_to}T23:59:59Z`);
    }

    if (filters?.search) {
      conditions.push(
        sql`(${schema.disputes.reason} ILIKE ${'%' + filters.search + '%'} OR ${schema.tfpInvoices.invoice_number} ILIKE ${'%' + filters.search + '%'})`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: schema.disputes.id,
        invoice_id: schema.disputes.invoice_id,
        invoice_number: schema.tfpInvoices.invoice_number,
        customer_id: schema.tfpInvoices.customer_id,
        raised_by: schema.disputes.raised_by,
        reason: schema.disputes.reason,
        dispute_status: schema.disputes.dispute_status,
        resolution_notes: schema.disputes.resolution_notes,
        resolved_at: schema.disputes.resolved_at,
        credit_note_id: schema.disputes.credit_note_id,
        created_at: schema.disputes.created_at,
        grand_total: schema.tfpInvoices.grand_total,
        currency: schema.tfpInvoices.currency,
      })
      .from(schema.disputes)
      .innerJoin(schema.tfpInvoices, eq(schema.disputes.invoice_id, schema.tfpInvoices.id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.disputes.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.disputes)
      .innerJoin(schema.tfpInvoices, eq(schema.disputes.invoice_id, schema.tfpInvoices.id))
      .where(where);

    const total = Number(countResult[0]?.count ?? 0);

    // Summary stats
    const summaryResult = await db
      .select({
        status: schema.disputes.dispute_status,
        count: sql<number>`count(*)`,
      })
      .from(schema.disputes)
      .groupBy(schema.disputes.dispute_status);

    const summary: Record<string, number> = {};
    for (const row of summaryResult) {
      summary[row.status] = Number(row.count);
    }

    // Credit notes issued this month
    const monthStart = new Date().toISOString().substring(0, 7) + '-01';
    const cnResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.creditNotes)
      .where(sql`${schema.creditNotes.issued_at} >= ${monthStart}`);

    const creditNotesThisMonth = Number(cnResult[0]?.count ?? 0);

    return {
      data,
      total,
      page,
      pageSize,
      summary: {
        open: summary['OPEN'] ?? 0,
        investigating: summary['INVESTIGATING'] ?? 0,
        resolved: summary['RESOLVED'] ?? 0,
        rejected: summary['REJECTED'] ?? 0,
        credit_notes_this_month: creditNotesThisMonth,
      },
    };
  },

  /**
   * Get a single dispute with invoice details and credit notes.
   */
  async getDisputeById(id: number) {
    const [dispute] = await db
      .select()
      .from(schema.disputes)
      .where(eq(schema.disputes.id, id))
      .limit(1);

    if (!dispute) {
      throw new Error(`Dispute not found: ${id}`);
    }

    // Get invoice
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, dispute.invoice_id))
      .limit(1);

    // Get invoice lines
    const invoiceLines = invoice
      ? await db
          .select()
          .from(schema.tfpInvoiceLines)
          .where(eq(schema.tfpInvoiceLines.invoice_id, invoice.id))
      : [];

    // Get linked credit notes
    const creditNotes = await db
      .select()
      .from(schema.creditNotes)
      .where(eq(schema.creditNotes.related_invoice_id, dispute.invoice_id))
      .orderBy(desc(schema.creditNotes.created_at));

    return {
      ...dispute,
      invoice: invoice
        ? {
            ...invoice,
            lines: invoiceLines,
          }
        : null,
      credit_notes: creditNotes,
    };
  },
};
