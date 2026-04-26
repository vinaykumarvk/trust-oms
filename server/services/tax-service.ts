/**
 * Tax Service (FR-TAX-003) - 1601-FQ Quarterly Filing
 *
 * Generates BIR Form 1601-FQ (Quarterly Remittance Return of
 * Final Income Taxes Withheld) by aggregating WHT data from the
 * taxEvents table.
 *
 * Produces XML per the BIR eFPS schema format and persists filings
 * to the form1601fq table.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Month ranges per quarter (1-indexed) */
const QUARTER_MONTHS: Record<number, { start: number; end: number }> = {
  1: { start: 1, end: 3 },
  2: { start: 4, end: 6 },
  3: { start: 7, end: 9 },
  4: { start: 10, end: 12 },
};

// ---------------------------------------------------------------------------
// Helper: Standard pagination defaults
// ---------------------------------------------------------------------------
function paginationDefaults(page?: number, limit?: number) {
  const p = Math.max(page ?? 1, 1);
  const l = Math.min(Math.max(limit ?? 25, 1), 200);
  return { page: p, limit: l, offset: (p - 1) * l };
}

// ---------------------------------------------------------------------------
// Helper: Build date range for a fiscal quarter
// ---------------------------------------------------------------------------
function quarterDateRange(quarter: number, year: number) {
  if (quarter < 1 || quarter > 4) {
    throw new Error(`Invalid quarter: ${quarter}. Must be 1-4.`);
  }
  if (year < 2000 || year > 2100) {
    throw new Error(`Invalid year: ${year}. Must be between 2000 and 2100.`);
  }

  const { start, end } = QUARTER_MONTHS[quarter];
  const startDate = `${year}-${String(start).padStart(2, '0')}-01`;

  // Last day of the end month
  const lastDay = new Date(year, end, 0).getDate();
  const endDate = `${year}-${String(end).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Helper: Generate BIR 1601-FQ XML
// ---------------------------------------------------------------------------
interface WhtLineItem {
  tin: string | null;
  taxRate: string | null;
  grossAmount: string | null;
  taxAmount: string | null;
  tradeId: string | null;
  portfolioId: string | null;
}

function generateXml(
  quarter: number,
  year: number,
  totalWithheld: number,
  lineItems: WhtLineItem[],
): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const { start, end } = QUARTER_MONTHS[quarter];
  const fromPeriod = `${pad2(start)}/01/${year}`;
  const lastDay = new Date(year, end, 0).getDate();
  const toPeriod = `${pad2(end)}/${pad2(lastDay)}/${year}`;
  const filingDate = new Date().toISOString().split('T')[0];

  // Escape XML special characters
  const esc = (s: string | null | undefined) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lineItemsXml = lineItems
    .map(
      (item, idx) => `    <ScheduleItem>
      <ItemNo>${idx + 1}</ItemNo>
      <PayeeTIN>${esc(item.tin)}</PayeeTIN>
      <AtcCode>WC010</AtcCode>
      <GrossIncome>${Number(item.grossAmount ?? 0).toFixed(2)}</GrossIncome>
      <TaxRate>${Number(item.taxRate ?? 0).toFixed(4)}</TaxRate>
      <TaxWithheld>${Number(item.taxAmount ?? 0).toFixed(2)}</TaxWithheld>
      <TradeRef>${esc(item.tradeId)}</TradeRef>
      <PortfolioRef>${esc(item.portfolioId)}</PortfolioRef>
    </ScheduleItem>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<BIRForm1601FQ xmlns="urn:bir:efps:1601fq" version="2024">
  <Header>
    <FormType>1601-FQ</FormType>
    <Quarter>${quarter}</Quarter>
    <Year>${year}</Year>
    <FromPeriod>${fromPeriod}</FromPeriod>
    <ToPeriod>${toPeriod}</ToPeriod>
    <FilingDate>${filingDate}</FilingDate>
    <AmendedReturn>N</AmendedReturn>
  </Header>
  <Summary>
    <TotalGrossIncome>${lineItems.reduce((sum, i) => sum + Number(i.grossAmount ?? 0), 0).toFixed(2)}</TotalGrossIncome>
    <TotalTaxWithheld>${totalWithheld.toFixed(2)}</TotalTaxWithheld>
    <TotalRemittance>${totalWithheld.toFixed(2)}</TotalRemittance>
    <Penalties>0.00</Penalties>
    <TotalAmountDue>${totalWithheld.toFixed(2)}</TotalAmountDue>
  </Summary>
  <Schedule>
${lineItemsXml}
  </Schedule>
</BIRForm1601FQ>`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const taxService = {
  /**
   * Generate a BIR Form 1601-FQ for a given quarter and year.
   *
   * Aggregates all WHT tax events whose created_at falls within the quarter,
   * produces XML per the BIR eFPS schema, and stores the filing in form1601fq.
   *
   * If a filing for the same quarter/year already exists in DRAFT, it is
   * replaced. If it exists in a non-DRAFT status, an error is thrown.
   */
  async generateForm1601FQ(quarter: number, year: number) {
    // Validate inputs
    if (quarter < 1 || quarter > 4) {
      throw new Error(`Invalid quarter: ${quarter}. Must be 1-4.`);
    }
    if (year < 2000 || year > 2100) {
      throw new Error(`Invalid year: ${year}.`);
    }

    // Check for existing filing
    const [existingFiling] = await db
      .select()
      .from(schema.form1601fq)
      .where(
        and(
          eq(schema.form1601fq.quarter, quarter),
          eq(schema.form1601fq.year, year),
          eq(schema.form1601fq.is_deleted, false),
        ),
      )
      .limit(1);

    if (existingFiling && existingFiling.filing_status !== 'DRAFT') {
      throw new Error(
        `A filing for Q${quarter} ${year} already exists with status '${existingFiling.filing_status}'. Cannot regenerate a non-DRAFT filing.`,
      );
    }

    // Build date range for the quarter
    const { startDate, endDate } = quarterDateRange(quarter, year);

    // Aggregate WHT tax events for the quarter
    const whtEvents = await db
      .select({
        id: schema.taxEvents.id,
        trade_id: schema.taxEvents.trade_id,
        portfolio_id: schema.taxEvents.portfolio_id,
        gross_amount: schema.taxEvents.gross_amount,
        tax_rate: schema.taxEvents.tax_rate,
        tax_amount: schema.taxEvents.tax_amount,
        tin: schema.taxEvents.tin,
      })
      .from(schema.taxEvents)
      .where(
        and(
          eq(schema.taxEvents.tax_type, 'WHT'),
          eq(schema.taxEvents.is_deleted, false),
          gte(schema.taxEvents.created_at, new Date(`${startDate}T00:00:00Z`)),
          lte(schema.taxEvents.created_at, new Date(`${endDate}T23:59:59.999Z`)),
        ),
      );

    // Build line items
    const lineItems: WhtLineItem[] = whtEvents.map((evt: Record<string, unknown>) => ({
      tin: evt.tin as string | null,
      taxRate: evt.tax_rate as string | null,
      grossAmount: evt.gross_amount as string | null,
      taxAmount: evt.tax_amount as string | null,
      tradeId: evt.trade_id as string | null,
      portfolioId: evt.portfolio_id as string | null,
    }));

    // Compute totals
    const totalWithheld = lineItems.reduce(
      (sum, item) => sum + Number(item.taxAmount ?? 0),
      0,
    );

    // Generate XML payload
    const xmlPayload = generateXml(quarter, year, totalWithheld, lineItems);

    const now = new Date();

    // Upsert: if an existing DRAFT filing exists, update it; otherwise insert
    if (existingFiling) {
      const [updated] = await db
        .update(schema.form1601fq)
        .set({
          total_withheld: String(totalWithheld),
          xml_payload: xmlPayload,
          filing_status: 'DRAFT',
          updated_at: now,
        })
        .where(eq(schema.form1601fq.id, existingFiling.id))
        .returning();

      return {
        filing: updated,
        lineItemCount: lineItems.length,
        totalWithheld,
      };
    }

    const [filing] = await db
      .insert(schema.form1601fq)
      .values({
        quarter,
        year,
        total_withheld: String(totalWithheld),
        xml_payload: xmlPayload,
        filing_status: 'DRAFT',
        created_at: now,
        updated_at: now,
      })
      .returning();

    return {
      filing,
      lineItemCount: lineItems.length,
      totalWithheld,
    };
  },

  /**
   * Fetch a single filing record by ID.
   */
  async getForm1601FQ(id: number) {
    const [filing] = await db
      .select()
      .from(schema.form1601fq)
      .where(
        and(
          eq(schema.form1601fq.id, id),
          eq(schema.form1601fq.is_deleted, false),
        ),
      )
      .limit(1);

    if (!filing) throw new Error(`Filing ${id} not found`);
    return filing;
  },

  /**
   * List filings with pagination and optional filters.
   */
  async listFilings(params: {
    page?: number;
    pageSize?: number;
    quarter?: number;
    year?: number;
    status?: string;
  }) {
    const { page, limit, offset } = paginationDefaults(
      params.page,
      params.pageSize,
    );

    const conditions = [eq(schema.form1601fq.is_deleted, false)];
    if (params.quarter) {
      conditions.push(eq(schema.form1601fq.quarter, params.quarter));
    }
    if (params.year) {
      conditions.push(eq(schema.form1601fq.year, params.year));
    }
    if (params.status) {
      conditions.push(eq(schema.form1601fq.filing_status, params.status));
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const data = await db
      .select()
      .from(schema.form1601fq)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.form1601fq.year), desc(schema.form1601fq.quarter));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.form1601fq)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize: limit };
  },

  /**
   * Submit a DRAFT filing (marks it as SUBMITTED and sets filing_date).
   */
  async submitFiling(id: number, submissionRef?: string) {
    const [filing] = await db
      .select()
      .from(schema.form1601fq)
      .where(eq(schema.form1601fq.id, id))
      .limit(1);

    if (!filing) throw new Error(`Filing ${id} not found`);
    if (filing.filing_status !== 'DRAFT') {
      throw new Error(
        `Cannot submit filing in status '${filing.filing_status}'. Only DRAFT filings can be submitted.`,
      );
    }

    const now = new Date();
    const filingDate = now.toISOString().split('T')[0];

    const [updated] = await db
      .update(schema.form1601fq)
      .set({
        filing_status: 'SUBMITTED',
        filing_date: filingDate,
        submission_ref: submissionRef ?? null,
        updated_at: now,
      })
      .where(eq(schema.form1601fq.id, id))
      .returning();

    return updated;
  },
};
