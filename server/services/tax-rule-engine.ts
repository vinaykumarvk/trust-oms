/**
 * Tax Rule Engine (TrustFees Pro -- Phase 9)
 *
 * TFP-specific tax rule engine that works with the taxRules table
 * (content-pack-managed tax rules with jurisdiction + fee type matching).
 *
 * This is distinct from the existing tax-engine-service.ts which handles
 * Philippine WHT/BIR/FATCA/CRS for trades and corporate actions.
 *
 * Methods:
 *   - getApplicableRules(jurisdictionId, feeType, date) -- Find matching rules
 *   - computeTax(amount, rules) -- Apply VAT/WHT/DST rules
 *   - getTaxSummary(periodFrom, periodTo, jurisdictionId?) -- Aggregate tax from invoices
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, gte, lte, type InferSelectModel } from 'drizzle-orm';

type TaxRule = InferSelectModel<typeof schema.taxRules>;

/* ---------- Types ---------- */

interface TaxLine {
  tax_type: string;
  tax_code: string;
  name: string;
  rate: number;
  amount: number;
}

interface TaxComputeResult {
  tax_lines: TaxLine[];
  total_tax: number;
}

/* ---------- Main Service ---------- */

export const taxRuleEngine = {
  /**
   * Find active tax rules for a given jurisdiction + fee type on a given date.
   */
  async getApplicableRules(jurisdictionId: number, feeType: string, date: string) {
    const rules = await db
      .select()
      .from(schema.taxRules)
      .where(
        and(
          eq(schema.taxRules.jurisdiction_id, jurisdictionId),
          sql`${schema.taxRules.effective_date} <= ${date}`,
          sql`(${schema.taxRules.expiry_date} IS NULL OR ${schema.taxRules.expiry_date} >= ${date})`,
        ),
      );

    // Filter to rules whose applicable_fee_types includes the given feeType (or is empty = all types)
    return rules.filter((rule: TaxRule) => {
      const applicableTypes = (rule.applicable_fee_types as string[]) ?? [];
      return applicableTypes.length === 0 || applicableTypes.includes(feeType);
    });
  },

  /**
   * Apply tax rules to a fee amount.
   *
   * Tax types:
   *   - VAT: additive (amount x rate)
   *   - WHT: subtractive (amount x rate, deducted from payment)
   *   - DST: per-transaction flat amount (rate treated as fixed amount)
   *   - OTHER: additive (amount x rate)
   */
  computeTax(amount: number, rules: Array<{ tax_rule_type: string; tax_code: string; name: string; rate: string }>) {
    const taxLines: TaxLine[] = [];
    let totalTax = 0;

    for (const rule of rules) {
      const rate = parseFloat(rule.rate);
      let taxAmount = 0;

      switch (rule.tax_rule_type) {
        case 'VAT':
          taxAmount = amount * (rate / 100);
          break;
        case 'WHT':
          // WHT is subtractive from payment but still reported as a tax line
          taxAmount = amount * (rate / 100);
          break;
        case 'DST':
          // DST: rate is treated as the flat per-transaction amount
          taxAmount = rate;
          break;
        default:
          // OTHER: additive
          taxAmount = amount * (rate / 100);
          break;
      }

      taxAmount = Math.round(taxAmount * 10000) / 10000;

      taxLines.push({
        tax_type: rule.tax_rule_type,
        tax_code: rule.tax_code,
        name: rule.name,
        rate,
        amount: taxAmount,
      });

      totalTax += taxAmount;
    }

    totalTax = Math.round(totalTax * 10000) / 10000;

    return { tax_lines: taxLines, total_tax: totalTax } as TaxComputeResult;
  },

  /**
   * Aggregate tax amounts by type and period from invoice lines.
   */
  async getTaxSummary(periodFrom: string, periodTo: string, jurisdictionId?: number) {
    const conditions: ReturnType<typeof eq>[] = [];

    conditions.push(sql`${schema.tfpInvoices.invoice_date} >= ${periodFrom}`);
    conditions.push(sql`${schema.tfpInvoices.invoice_date} <= ${periodTo}`);

    if (jurisdictionId) {
      conditions.push(eq(schema.tfpInvoices.jurisdiction_id, jurisdictionId));
    }

    const where = and(...conditions);

    // Get invoices in the period
    const invoices = await db
      .select()
      .from(schema.tfpInvoices)
      .where(where);

    // Aggregate by tax code from invoice lines
    const taxByCode: Record<string, { tax_code: string; total_amount: number; line_count: number }> = {};
    let totalTaxAmount = 0;
    let totalFeeAmount = 0;

    for (const invoice of invoices) {
      const lines = await db
        .select()
        .from(schema.tfpInvoiceLines)
        .where(eq(schema.tfpInvoiceLines.invoice_id, invoice.id));

      for (const line of lines) {
        const taxCode = line.tax_code ?? 'NONE';
        const taxAmt = parseFloat(line.tax_amount);
        const lineAmt = parseFloat(line.line_amount);

        if (!taxByCode[taxCode]) {
          taxByCode[taxCode] = { tax_code: taxCode, total_amount: 0, line_count: 0 };
        }

        taxByCode[taxCode].total_amount += taxAmt;
        taxByCode[taxCode].line_count += 1;
        totalTaxAmount += taxAmt;
        totalFeeAmount += lineAmt;
      }
    }

    // Round totals
    totalTaxAmount = Math.round(totalTaxAmount * 10000) / 10000;
    totalFeeAmount = Math.round(totalFeeAmount * 10000) / 10000;

    for (const entry of Object.values(taxByCode)) {
      entry.total_amount = Math.round(entry.total_amount * 10000) / 10000;
    }

    return {
      period_from: periodFrom,
      period_to: periodTo,
      jurisdiction_id: jurisdictionId ?? null,
      invoice_count: invoices.length,
      total_fee_amount: totalFeeAmount,
      total_tax_amount: totalTaxAmount,
      effective_tax_rate: totalFeeAmount > 0
        ? Math.round((totalTaxAmount / totalFeeAmount) * 10000) / 10000
        : 0,
      by_tax_code: Object.values(taxByCode),
    };
  },
};
