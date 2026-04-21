/**
 * TFP Invoice Service (TrustFees Pro -- Phase 7)
 *
 * Handles invoice generation, issuance, ageing, and lifecycle management.
 *
 * Methods:
 *   - generateInvoices(periodFrom, periodTo) -- Aggregate OPEN accruals by customer x currency
 *   - issueInvoice(invoiceId)                -- DRAFT -> ISSUED
 *   - getInvoices(filters)                   -- Paginated list with filters
 *   - getInvoiceDetail(id)                   -- Invoice with lines and payments
 *   - markOverdue()                          -- Batch: ISSUED past due_date -> OVERDUE
 *   - getAgeing()                            -- Ageing buckets with counts and amounts
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, inArray, or, lte, gte } from 'drizzle-orm';

/* ---------- Helpers ---------- */

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/* ---------- Main Service ---------- */

export const tfpInvoiceService = {
  /**
   * Generate invoices by aggregating OPEN accruals within a period range.
   * Groups accruals by (customer_id x currency) and creates one invoice per group.
   */
  async generateInvoices(periodFrom: string, periodTo: string) {
    const today = todayStr();
    let invoicesCreated = 0;
    let totalAmount = 0;
    const exceptions: string[] = [];

    // 1. Fetch OPEN accruals within the period range
    const openAccruals = await db
      .select()
      .from(schema.tfpAccruals)
      .where(
        and(
          eq(schema.tfpAccruals.accrual_status, 'OPEN'),
          sql`${schema.tfpAccruals.accrual_date} >= ${periodFrom}`,
          sql`${schema.tfpAccruals.accrual_date} <= ${periodTo}`,
        ),
      );

    if (openAccruals.length === 0) {
      return { invoices_created: 0, total_amount: 0, exceptions: ['No OPEN accruals found in the specified period'] };
    }

    // 2. Group accruals by customer_id x currency
    const groups = new Map<string, typeof openAccruals>();
    for (const acc of openAccruals) {
      const key = `${acc.customer_id}::${acc.currency}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(acc);
    }

    // 3. Get the next invoice sequence number
    const seqResult = await db
      .select({ maxNum: sql<string>`MAX(${schema.tfpInvoices.invoice_number})` })
      .from(schema.tfpInvoices);

    let seqCounter = 0;
    const maxNum = seqResult[0]?.maxNum;
    if (maxNum) {
      // Extract the numeric part from INV-YYYY-NNNNNNN
      const match = maxNum.match(/INV-\d{4}-(\d{7})/);
      if (match) {
        seqCounter = parseInt(match[1], 10);
      }
    }

    const currentYear = new Date().getFullYear();

    // 4. For each group, create an invoice with lines
    for (const [key, accruals] of groups) {
      const [customerId, currency] = key.split('::');

      try {
        seqCounter++;
        const invoiceNumber = `INV-${currentYear}-${String(seqCounter).padStart(7, '0')}`;

        // Calculate line amounts
        let lineTotalAmount = 0;
        let lineTaxAmount = 0;

        // Resolve fee plan info for descriptions and accrual schedule for due_date offset
        const feePlanIds = [...new Set(accruals.map((a: any) => a.fee_plan_id))] as number[];
        const feePlanMap = new Map<number, any>();
        let dueDateOffset = 30; // default

        if (feePlanIds.length > 0) {
          const plans = await db
            .select()
            .from(schema.feePlans)
            .where(inArray(schema.feePlans.id, feePlanIds));

          for (const p of plans) {
            feePlanMap.set(p.id, p);

            // Try to get due_date_offset from accrual schedule
            if (p.accrual_schedule_id) {
              const [schedule] = await db
                .select({ due_date_offset_days: schema.accrualSchedules.due_date_offset_days })
                .from(schema.accrualSchedules)
                .where(eq(schema.accrualSchedules.id, p.accrual_schedule_id))
                .limit(1);
              if (schedule?.due_date_offset_days) {
                dueDateOffset = schedule.due_date_offset_days;
              }
            }
          }
        }

        // Look up jurisdiction for tax rules
        // Get the customer's jurisdiction (or use first fee plan's jurisdiction)
        let jurisdictionId: number | null = null;
        const [custRef] = await db
          .select({ jurisdiction_id: schema.customerReferences.jurisdiction_id })
          .from(schema.customerReferences)
          .where(eq(schema.customerReferences.customer_id, customerId))
          .limit(1);

        if (custRef?.jurisdiction_id) {
          jurisdictionId = custRef.jurisdiction_id;
        } else {
          // Fallback: use fee plan's jurisdiction
          for (const p of feePlanMap.values()) {
            if (p.jurisdiction_id) {
              jurisdictionId = p.jurisdiction_id;
              break;
            }
          }
        }

        // Look up applicable tax rules for this jurisdiction
        const taxRules = jurisdictionId
          ? await db
              .select()
              .from(schema.taxRules)
              .where(
                and(
                  eq(schema.taxRules.jurisdiction_id, jurisdictionId),
                  sql`${schema.taxRules.effective_date} <= ${today}`,
                  sql`(${schema.taxRules.expiry_date} IS NULL OR ${schema.taxRules.expiry_date} >= ${today})`,
                ),
              )
          : [];

        // Build invoice line items
        const lineValues: Array<{
          accrualId: number;
          description: string;
          lineAmount: number;
          taxCode: string | null;
          taxAmount: number;
        }> = [];

        for (const acc of accruals) {
          const feePlan = feePlanMap.get(acc.fee_plan_id);
          const feeType = feePlan?.fee_type ?? 'OTHER';
          const description = feePlan
            ? `${feePlan.fee_plan_name} (${feeType}) - ${acc.accrual_date}`
            : `Fee accrual - ${acc.accrual_date}`;

          const lineAmt = parseFloat(acc.applied_fee);

          // Apply tax rules matching this fee type
          let lineTax = 0;
          let taxCode: string | null = null;
          for (const rule of taxRules) {
            const applicableTypes = (rule.applicable_fee_types as string[]) ?? [];
            if (applicableTypes.length === 0 || applicableTypes.includes(feeType)) {
              const rate = parseFloat(rule.rate);
              lineTax = lineAmt * (rate / 100);
              taxCode = rule.tax_code;
              break; // Apply first matching rule
            }
          }

          lineValues.push({
            accrualId: acc.id,
            description,
            lineAmount: Math.round(lineAmt * 10000) / 10000,
            taxCode,
            taxAmount: Math.round(lineTax * 10000) / 10000,
          });

          lineTotalAmount += lineAmt;
          lineTaxAmount += lineTax;
        }

        // Round totals
        lineTotalAmount = Math.round(lineTotalAmount * 10000) / 10000;
        lineTaxAmount = Math.round(lineTaxAmount * 10000) / 10000;
        const grandTotal = Math.round((lineTotalAmount + lineTaxAmount) * 10000) / 10000;

        const dueDate = addDays(today, dueDateOffset);

        // Insert the invoice
        const [invoice] = await db
          .insert(schema.tfpInvoices)
          .values({
            invoice_number: invoiceNumber,
            customer_id: customerId,
            jurisdiction_id: jurisdictionId,
            currency,
            total_amount: String(lineTotalAmount),
            tax_amount: String(lineTaxAmount),
            grand_total: String(grandTotal),
            invoice_date: today,
            due_date: dueDate,
            invoice_status: 'DRAFT',
          })
          .returning();

        // Insert invoice lines
        for (const line of lineValues) {
          await db.insert(schema.tfpInvoiceLines).values({
            invoice_id: invoice.id,
            accrual_id: line.accrualId,
            description: line.description,
            quantity: '1',
            unit_amount: String(line.lineAmount),
            line_amount: String(line.lineAmount),
            tax_code: line.taxCode,
            tax_amount: String(line.taxAmount),
          });
        }

        // Mark accruals as INVOICED
        const accrualIds = accruals.map((a: any) => a.id) as number[];
        await db
          .update(schema.tfpAccruals)
          .set({ accrual_status: 'INVOICED' })
          .where(inArray(schema.tfpAccruals.id, accrualIds));

        invoicesCreated++;
        totalAmount += grandTotal;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        exceptions.push(`Failed to generate invoice for ${customerId}/${currency}: ${msg}`);
      }
    }

    return {
      invoices_created: invoicesCreated,
      total_amount: Math.round(totalAmount * 10000) / 10000,
      exceptions,
    };
  },

  /**
   * Issue an invoice: DRAFT -> ISSUED
   */
  async issueInvoice(invoiceId: number) {
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    if (invoice.invoice_status !== 'DRAFT') {
      throw new Error(`Cannot issue invoice in status ${invoice.invoice_status}; must be DRAFT`);
    }

    const [updated] = await db
      .update(schema.tfpInvoices)
      .set({ invoice_status: 'ISSUED', updated_at: new Date() })
      .where(eq(schema.tfpInvoices.id, invoiceId))
      .returning();

    return updated;
  },

  /**
   * List invoices with pagination and filters.
   */
  async getInvoices(filters?: {
    invoice_status?: string;
    customer_id?: string;
    date_from?: string;
    date_to?: string;
    currency?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.invoice_status) {
      conditions.push(eq(schema.tfpInvoices.invoice_status, filters.invoice_status as any));
    }

    if (filters?.customer_id) {
      conditions.push(eq(schema.tfpInvoices.customer_id, filters.customer_id));
    }

    if (filters?.date_from) {
      conditions.push(sql`${schema.tfpInvoices.invoice_date} >= ${filters.date_from}`);
    }

    if (filters?.date_to) {
      conditions.push(sql`${schema.tfpInvoices.invoice_date} <= ${filters.date_to}`);
    }

    if (filters?.currency) {
      conditions.push(eq(schema.tfpInvoices.currency, filters.currency));
    }

    if (filters?.search) {
      conditions.push(
        sql`(${schema.tfpInvoices.invoice_number} ILIKE ${'%' + filters.search + '%'} OR ${schema.tfpInvoices.customer_id} ILIKE ${'%' + filters.search + '%'})`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.tfpInvoices)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.tfpInvoices.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tfpInvoices)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get invoice detail with lines and payments.
   */
  async getInvoiceDetail(id: number) {
    const [invoice] = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, id))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice not found: ${id}`);
    }

    const lines = await db
      .select()
      .from(schema.tfpInvoiceLines)
      .where(eq(schema.tfpInvoiceLines.invoice_id, id));

    const payments = await db
      .select()
      .from(schema.tfpPayments)
      .where(eq(schema.tfpPayments.invoice_id, id))
      .orderBy(desc(schema.tfpPayments.created_at));

    // Calculate paid amount
    const paidAmount = payments
      .filter((p: any) => p.payment_status === 'POSTED')
      .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);

    const grandTotal = parseFloat(invoice.grand_total);
    const remainingBalance = Math.round((grandTotal - paidAmount) * 10000) / 10000;

    return {
      ...invoice,
      lines,
      payments,
      paid_amount: Math.round(paidAmount * 10000) / 10000,
      remaining_balance: remainingBalance,
    };
  },

  /**
   * Batch mark overdue: find ISSUED invoices past due_date and update to OVERDUE.
   */
  async markOverdue() {
    const today = todayStr();

    const result = await db
      .update(schema.tfpInvoices)
      .set({ invoice_status: 'OVERDUE', updated_at: new Date() })
      .where(
        and(
          eq(schema.tfpInvoices.invoice_status, 'ISSUED'),
          sql`${schema.tfpInvoices.due_date} < ${today}`,
        ),
      )
      .returning({ id: schema.tfpInvoices.id });

    return { marked_overdue: result.length };
  },

  /**
   * Ageing report: buckets with counts and amounts.
   */
  async getAgeing() {
    const today = todayStr();

    // Fetch all ISSUED and OVERDUE invoices
    const invoices = await db
      .select({
        id: schema.tfpInvoices.id,
        grand_total: schema.tfpInvoices.grand_total,
        due_date: schema.tfpInvoices.due_date,
        invoice_status: schema.tfpInvoices.invoice_status,
      })
      .from(schema.tfpInvoices)
      .where(
        or(
          eq(schema.tfpInvoices.invoice_status, 'ISSUED'),
          eq(schema.tfpInvoices.invoice_status, 'OVERDUE'),
          eq(schema.tfpInvoices.invoice_status, 'PARTIALLY_PAID'),
        ),
      );

    const buckets = {
      current: { count: 0, amount: 0 },
      '1_30': { count: 0, amount: 0 },
      '31_60': { count: 0, amount: 0 },
      '61_90': { count: 0, amount: 0 },
      '90_plus': { count: 0, amount: 0 },
    };

    for (const inv of invoices) {
      const daysOverdue = daysBetween(inv.due_date, today);
      const amount = parseFloat(inv.grand_total);

      if (daysOverdue <= 0) {
        buckets.current.count++;
        buckets.current.amount += amount;
      } else if (daysOverdue <= 30) {
        buckets['1_30'].count++;
        buckets['1_30'].amount += amount;
      } else if (daysOverdue <= 60) {
        buckets['31_60'].count++;
        buckets['31_60'].amount += amount;
      } else if (daysOverdue <= 90) {
        buckets['61_90'].count++;
        buckets['61_90'].amount += amount;
      } else {
        buckets['90_plus'].count++;
        buckets['90_plus'].amount += amount;
      }
    }

    // Round amounts
    for (const bucket of Object.values(buckets)) {
      bucket.amount = Math.round(bucket.amount * 10000) / 10000;
    }

    const totalOutstanding = Object.values(buckets).reduce((s, b) => s + b.amount, 0);

    return {
      buckets,
      total_outstanding: Math.round(totalOutstanding * 10000) / 10000,
      total_invoices: invoices.length,
    };
  },

  /**
   * Get summary statistics for the invoice dashboard.
   */
  async getSummary() {
    const today = todayStr();
    const monthStart = today.substring(0, 7) + '-01';

    // Total invoices
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tfpInvoices);
    const totalInvoices = Number(totalResult[0]?.count ?? 0);

    // Outstanding amount (ISSUED + OVERDUE + PARTIALLY_PAID)
    const outstandingResult = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.tfpInvoices.grand_total}::numeric), 0)`,
      })
      .from(schema.tfpInvoices)
      .where(
        or(
          eq(schema.tfpInvoices.invoice_status, 'ISSUED'),
          eq(schema.tfpInvoices.invoice_status, 'OVERDUE'),
          eq(schema.tfpInvoices.invoice_status, 'PARTIALLY_PAID'),
        ),
      );
    const outstandingAmount = parseFloat(outstandingResult[0]?.total ?? '0');

    // Overdue count
    const overdueResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.invoice_status, 'OVERDUE'));
    const overdueCount = Number(overdueResult[0]?.count ?? 0);

    // This month's revenue (PAID invoices within this month)
    const paidResult = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.tfpInvoices.grand_total}::numeric), 0)`,
      })
      .from(schema.tfpInvoices)
      .where(
        and(
          eq(schema.tfpInvoices.invoice_status, 'PAID'),
          sql`${schema.tfpInvoices.invoice_date} >= ${monthStart}`,
          sql`${schema.tfpInvoices.invoice_date} <= ${today}`,
        ),
      );
    const monthRevenue = parseFloat(paidResult[0]?.total ?? '0');

    return {
      total_invoices: totalInvoices,
      outstanding_amount: Math.round(outstandingAmount * 10000) / 10000,
      overdue_count: overdueCount,
      month_revenue: Math.round(monthRevenue * 10000) / 10000,
    };
  },
};
