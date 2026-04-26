/**
 * PDF Invoice Service (TrustFees Pro — BRD Gap A07)
 *
 * Generates binary PDF invoice documents using PDFKit with proper header,
 * line items table, tax summary, and totals. Stores pdf_url reference on invoice.
 */

import PDFDocument from 'pdfkit';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatMoney(val: string | number | null | undefined, currency = 'PHP'): string {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return `${currency} ${(isNaN(n) ? 0 : n).toFixed(2)}`;
}

/** Collect pdfkit output chunks into a single Buffer. */
function bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const pdfInvoiceService = {
  /**
   * Generate a binary PDF representation of an invoice.
   * Returns a Buffer containing proper PDF bytes (starts with %PDF-).
   */
  async generateInvoicePdf(invoiceId: number): Promise<Buffer> {
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    const lines = await db
      .select()
      .from(schema.tfpInvoiceLines)
      .where(eq(schema.tfpInvoiceLines.invoice_id, invoiceId));

    const [customer] = await db
      .select()
      .from(schema.customerReferences)
      .where(eq(schema.customerReferences.customer_id, invoice.customer_id))
      .limit(1);

    const pdfBuffer = await this.buildPdf(invoice, lines, customer);

    // Store reference URL
    const pdfUrl = `/api/v1/tfp-invoices/${invoiceId}/pdf`;
    await db
      .update(schema.tfpInvoices)
      .set({ pdf_url: pdfUrl, updated_at: new Date() })
      .where(eq(schema.tfpInvoices.id, invoiceId));

    return pdfBuffer;
  },

  /** Build a PDFKit document and return the binary buffer. */
  async buildPdf(invoice: any, lines: any[], customer: any): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const bufferPromise = bufferFromDoc(doc);

    const currency = invoice.currency ?? 'PHP';
    const BLUE = '#1e40af';
    const GRAY = '#6b7280';
    const LIGHT = '#f3f4f6';

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor(BLUE).text('TRUST OMS', 50, 50);
    doc.fontSize(10).fillColor(GRAY).text('TrustFees Pro — Fee Invoice', 50, 75);

    doc.fontSize(18).fillColor('#111827').text('INVOICE', 400, 50, { align: 'right' });

    // Invoice meta block (right side)
    const metaTop = 80;
    doc.fontSize(9).fillColor(GRAY);
    doc.text('Invoice No:', 370, metaTop, { continued: true }).fillColor('#111827').text(` ${invoice.invoice_number}`);
    doc.fillColor(GRAY).text('Invoice Date:', 370, metaTop + 14, { continued: true }).fillColor('#111827').text(` ${formatDate(invoice.invoice_date)}`);
    doc.fillColor(GRAY).text('Due Date:', 370, metaTop + 28, { continued: true }).fillColor('#111827').text(` ${formatDate(invoice.due_date)}`);
    doc.fillColor(GRAY).text('Status:', 370, metaTop + 42, { continued: true }).fillColor('#111827').text(` ${invoice.invoice_status}`);
    if (invoice.fx_rate) {
      doc.fillColor(GRAY).text('FX Rate:', 370, metaTop + 56, { continued: true }).fillColor('#111827').text(` ${invoice.fx_rate}`);
    }

    // ── Divider ─────────────────────────────────────────────────────────────
    doc.moveTo(50, 140).lineTo(545, 140).strokeColor('#d1d5db').lineWidth(1).stroke();

    // ── Bill To ─────────────────────────────────────────────────────────────
    doc.fontSize(9).fillColor(GRAY).text('BILL TO', 50, 155);
    doc.fontSize(10).fillColor('#111827');
    if (customer?.display_name) {
      doc.text(customer.display_name, 50, 168);
    }
    doc.fontSize(9).fillColor(GRAY).text(`Customer ID: ${invoice.customer_id}`, 50, customer?.display_name ? 182 : 168);
    if (customer?.customer_type) {
      doc.text(`Type: ${customer.customer_type}`, 50, customer?.display_name ? 196 : 182);
    }

    // ── Line Items Table ─────────────────────────────────────────────────────
    const tableTop = 240;
    const colX = { num: 50, desc: 75, qty: 330, unit: 380, amount: 470 };

    // Table header background
    doc.rect(50, tableTop, 495, 18).fill(BLUE);
    doc.fontSize(8).fillColor('#ffffff');
    doc.text('#', colX.num, tableTop + 5);
    doc.text('Description', colX.desc, tableTop + 5);
    doc.text('Qty', colX.qty, tableTop + 5, { width: 40, align: 'right' });
    doc.text('Unit Price', colX.unit, tableTop + 5, { width: 80, align: 'right' });
    doc.text('Amount', colX.amount, tableTop + 5, { width: 75, align: 'right' });

    // Rows
    let y = tableTop + 18;
    lines.forEach((line, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : LIGHT;
      doc.rect(50, y, 495, 16).fill(bg);
      doc.fontSize(8).fillColor('#111827');
      doc.text(String(i + 1), colX.num, y + 4);
      const desc = String(line.description ?? 'Fee charge').substring(0, 50);
      doc.text(desc, colX.desc, y + 4, { width: 245 });
      doc.text(String(line.quantity ?? 1), colX.qty, y + 4, { width: 40, align: 'right' });
      doc.text(parseFloat(line.unit_amount ?? '0').toFixed(2), colX.unit, y + 4, { width: 80, align: 'right' });
      doc.text(parseFloat(line.line_amount ?? '0').toFixed(2), colX.amount, y + 4, { width: 75, align: 'right' });
      y += 16;
    });

    // ── Totals ───────────────────────────────────────────────────────────────
    y += 10;
    const totalsX = 370;

    const subtotal = parseFloat(invoice.total_amount ?? '0');
    const tax = parseFloat(invoice.tax_amount ?? '0');
    const grand = parseFloat(invoice.grand_total ?? '0');

    doc.fontSize(9).fillColor(GRAY).text('Subtotal:', totalsX, y, { continued: true }).fillColor('#111827').text(` ${formatMoney(subtotal, currency)}`, { align: 'right' });
    y += 14;
    doc.fillColor(GRAY).text('Tax:', totalsX, y, { continued: true }).fillColor('#111827').text(` ${formatMoney(tax, currency)}`, { align: 'right' });
    y += 2;
    doc.moveTo(totalsX, y + 10).lineTo(545, y + 10).strokeColor('#d1d5db').lineWidth(0.5).stroke();
    y += 16;
    doc.fontSize(11).fillColor(BLUE).font('Helvetica-Bold')
      .text('TOTAL DUE:', totalsX, y, { continued: true })
      .text(` ${formatMoney(grand, currency)}`, { align: 'right' });

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.fontSize(7).fillColor(GRAY).font('Helvetica')
      .text(
        `Generated by TrustOMS TrustFees Pro  •  ${new Date().toISOString()}`,
        50,
        doc.page.height - 40,
        { align: 'center', width: 495 },
      );

    doc.end();
    return bufferPromise;
  },
};
