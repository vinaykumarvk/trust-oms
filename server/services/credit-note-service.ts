/**
 * Credit Note Service (TrustFees Pro -- Phase 9)
 *
 * Manages credit note lifecycle: ISSUED -> APPLIED | CANCELLED.
 *
 * Methods:
 *   - issueCreditNote(relatedInvoiceId, amount, currency, reasonCode) -- Create credit note
 *   - applyCreditNote(creditNoteId) -- ISSUED -> APPLIED
 *   - cancelCreditNote(creditNoteId) -- ISSUED -> CANCELLED, restore invoice balance
 *   - getCreditNotes(filters) -- Paginated list
 *   - getCreditNoteById(id) -- Single credit note with invoice details
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

/* ---------- Helpers ---------- */

async function getNextCreditNoteNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();

  const seqResult = await db
    .select({ maxNum: sql<string>`MAX(${schema.creditNotes.credit_note_number})` })
    .from(schema.creditNotes);

  let seqCounter = 0;
  const maxNum = seqResult[0]?.maxNum;
  if (maxNum) {
    const match = maxNum.match(/CN-\d{4}-(\d{7})/);
    if (match) {
      seqCounter = parseInt(match[1], 10);
    }
  }

  seqCounter++;
  return `CN-${currentYear}-${String(seqCounter).padStart(7, '0')}`;
}

/* ---------- Main Service ---------- */

export const creditNoteService = {
  /**
   * Issue a credit note linked to an invoice.
   * Reduces the invoice grand_total by the credit amount.
   */
  async issueCreditNote(
    relatedInvoiceId: number,
    amount: number,
    currency: string,
    reasonCode: string,
  ) {
    // Validate invoice
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, relatedInvoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice not found: ${relatedInvoiceId}`);
    }

    if (amount <= 0) {
      throw new Error('Credit note amount must be positive');
    }

    const grandTotal = parseFloat(invoice.grand_total);
    if (amount > grandTotal) {
      throw new Error(`Credit note amount ${amount} exceeds invoice grand total ${grandTotal}`);
    }

    const creditNoteNumber = await getNextCreditNoteNumber();

    // Create credit note
    const [creditNote] = await db
      .insert(schema.creditNotes)
      .values({
        credit_note_number: creditNoteNumber,
        related_invoice_id: relatedInvoiceId,
        amount: String(amount),
        currency,
        reason_code: reasonCode,
        cn_status: 'ISSUED',
      })
      .returning();

    // Update invoice grand_total (reduce by credit amount)
    const newGrandTotal = Math.round((grandTotal - amount) * 10000) / 10000;
    await db
      .update(schema.tfpInvoices)
      .set({
        grand_total: String(newGrandTotal),
        updated_at: new Date(),
      })
      .where(eq(schema.tfpInvoices.id, relatedInvoiceId));

    return creditNote;
  },

  /**
   * Apply a credit note: ISSUED -> APPLIED.
   */
  async applyCreditNote(creditNoteId: number) {
    const [creditNote] = await db
      .select()
      .from(schema.creditNotes)
      .where(eq(schema.creditNotes.id, creditNoteId))
      .limit(1);

    if (!creditNote) {
      throw new Error(`Credit note not found: ${creditNoteId}`);
    }

    if (creditNote.cn_status !== 'ISSUED') {
      throw new Error(`Cannot apply credit note in status ${creditNote.cn_status}; must be ISSUED`);
    }

    const [updated] = await db
      .update(schema.creditNotes)
      .set({ cn_status: 'APPLIED', updated_at: new Date() })
      .where(eq(schema.creditNotes.id, creditNoteId))
      .returning();

    return updated;
  },

  /**
   * Cancel a credit note: ISSUED -> CANCELLED. Restore invoice balance.
   */
  async cancelCreditNote(creditNoteId: number) {
    const [creditNote] = await db
      .select()
      .from(schema.creditNotes)
      .where(eq(schema.creditNotes.id, creditNoteId))
      .limit(1);

    if (!creditNote) {
      throw new Error(`Credit note not found: ${creditNoteId}`);
    }

    if (creditNote.cn_status !== 'ISSUED') {
      throw new Error(`Cannot cancel credit note in status ${creditNote.cn_status}; must be ISSUED`);
    }

    // Restore invoice balance
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, creditNote.related_invoice_id))
      .limit(1);

    if (invoice) {
      const currentTotal = parseFloat(invoice.grand_total);
      const creditAmount = parseFloat(creditNote.amount);
      const restoredTotal = Math.round((currentTotal + creditAmount) * 10000) / 10000;

      await db
        .update(schema.tfpInvoices)
        .set({
          grand_total: String(restoredTotal),
          updated_at: new Date(),
        })
        .where(eq(schema.tfpInvoices.id, creditNote.related_invoice_id));
    }

    const [updated] = await db
      .update(schema.creditNotes)
      .set({ cn_status: 'CANCELLED', updated_at: new Date() })
      .where(eq(schema.creditNotes.id, creditNoteId))
      .returning();

    return updated;
  },

  /**
   * List credit notes with filters and pagination.
   */
  async getCreditNotes(filters?: {
    cn_status?: string;
    related_invoice_id?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.cn_status) {
      conditions.push(eq(schema.creditNotes.cn_status, filters.cn_status as any));
    }

    if (filters?.related_invoice_id) {
      conditions.push(eq(schema.creditNotes.related_invoice_id, filters.related_invoice_id));
    }

    if (filters?.date_from) {
      conditions.push(sql`${schema.creditNotes.issued_at} >= ${filters.date_from}` as any);
    }

    if (filters?.date_to) {
      conditions.push(sql`${schema.creditNotes.issued_at} <= ${filters.date_to}T23:59:59Z` as any);
    }

    if (filters?.search) {
      conditions.push(
        sql`(${schema.creditNotes.credit_note_number} ILIKE ${'%' + filters.search + '%'} OR ${schema.creditNotes.reason_code} ILIKE ${'%' + filters.search + '%'})` as any,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: schema.creditNotes.id,
        credit_note_number: schema.creditNotes.credit_note_number,
        related_invoice_id: schema.creditNotes.related_invoice_id,
        invoice_number: schema.tfpInvoices.invoice_number,
        customer_id: schema.tfpInvoices.customer_id,
        amount: schema.creditNotes.amount,
        currency: schema.creditNotes.currency,
        reason_code: schema.creditNotes.reason_code,
        cn_status: schema.creditNotes.cn_status,
        issued_at: schema.creditNotes.issued_at,
        created_at: schema.creditNotes.created_at,
      })
      .from(schema.creditNotes)
      .innerJoin(schema.tfpInvoices, eq(schema.creditNotes.related_invoice_id, schema.tfpInvoices.id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.creditNotes.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.creditNotes)
      .where(where);

    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get a single credit note with invoice details.
   */
  async getCreditNoteById(id: number) {
    const [creditNote] = await db
      .select()
      .from(schema.creditNotes)
      .where(eq(schema.creditNotes.id, id))
      .limit(1);

    if (!creditNote) {
      throw new Error(`Credit note not found: ${id}`);
    }

    // Get related invoice
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, creditNote.related_invoice_id))
      .limit(1);

    return {
      ...creditNote,
      invoice: invoice ?? null,
    };
  },
};
