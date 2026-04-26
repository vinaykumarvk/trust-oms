/**
 * Risk Analytics Service (FR-RISK-003)
 *
 * Provides stress test result export functionality for TrustOMS Philippines.
 * Queries stress_test_results for a given portfolio and exports as CSV or PDF.
 *
 * PDF generation is structured for future library integration; currently
 * returns a text-based representation.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StressTestRow {
  id: number;
  scenario_id: string | null;
  scenario_name: string | null;
  portfolio_id: string | null;
  impact_pct: string | null;
  impact_amount: string | null;
  run_date: string | null;
  parameters: unknown;
}

interface ExportResult {
  data: string;
  contentType: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'ID',
  'Scenario ID',
  'Scenario Name',
  'Portfolio ID',
  'Impact (%)',
  'Impact Amount',
  'Run Date',
  'Parameters',
] as const;

/**
 * Escape a single CSV field value.
 * Wraps in double-quotes if the value contains commas, quotes, or newlines.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert a single stress test row into a CSV line.
 */
function rowToCsvLine(row: StressTestRow): string {
  const fields: string[] = [
    String(row.id),
    row.scenario_id ?? '',
    row.scenario_name ?? '',
    row.portfolio_id ?? '',
    row.impact_pct ?? '',
    row.impact_amount ?? '',
    row.run_date ?? '',
    row.parameters ? JSON.stringify(row.parameters) : '',
  ];
  return fields.map(escapeCsvField).join(',');
}

/**
 * Build a complete CSV string from an array of stress test rows.
 */
function buildCsv(rows: StressTestRow[]): string {
  const headerLine = CSV_HEADERS.join(',');
  const dataLines = rows.map(rowToCsvLine);
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Build a text-based PDF representation.
 *
 * This is structured so a real PDF library (e.g. pdfkit, puppeteer) can be
 * swapped in later. For now, it generates a formatted plain-text document
 * that mirrors what the PDF layout would contain.
 */
function buildPdfPlaceholder(portfolioId: string, rows: StressTestRow[]): string {
  const lines: string[] = [];
  const divider = '='.repeat(100);
  const thinDivider = '-'.repeat(100);

  lines.push(divider);
  lines.push('STRESS TEST RESULTS REPORT');
  lines.push(divider);
  lines.push(`Portfolio: ${portfolioId}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total Scenarios: ${rows.length}`);
  lines.push(divider);
  lines.push('');

  if (rows.length === 0) {
    lines.push('No stress test results found for this portfolio.');
  } else {
    // Summary statistics
    const impacts = rows
      .map((r) => Number(r.impact_pct ?? 0))
      .filter((v) => !isNaN(v));

    if (impacts.length > 0) {
      const maxImpact = Math.max(...impacts);
      const minImpact = Math.min(...impacts);
      const avgImpact = impacts.reduce((sum, v) => sum + v, 0) / impacts.length;

      lines.push('SUMMARY');
      lines.push(thinDivider);
      lines.push(`  Worst Impact:   ${maxImpact.toFixed(4)}%`);
      lines.push(`  Best Impact:    ${minImpact.toFixed(4)}%`);
      lines.push(`  Average Impact: ${avgImpact.toFixed(4)}%`);
      lines.push('');
    }

    // Detail rows
    lines.push('SCENARIO DETAILS');
    lines.push(thinDivider);

    for (const row of rows) {
      lines.push(`  Scenario: ${row.scenario_name ?? row.scenario_id ?? 'N/A'}`);
      lines.push(`    ID:            ${row.scenario_id ?? 'N/A'}`);
      lines.push(`    Impact (%):    ${row.impact_pct ?? 'N/A'}`);
      lines.push(`    Impact Amount: ${row.impact_amount ?? 'N/A'}`);
      lines.push(`    Run Date:      ${row.run_date ?? 'N/A'}`);
      if (row.parameters) {
        lines.push(`    Parameters:    ${JSON.stringify(row.parameters)}`);
      }
      lines.push(thinDivider);
    }
  }

  lines.push('');
  lines.push('--- End of Report ---');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const riskAnalyticsService = {
  /**
   * Export stress test results for a portfolio in the specified format.
   *
   * Queries the stressTestResults table for all rows matching the portfolio,
   * ordered by run_date descending (most recent first).
   *
   * @param portfolioId - The portfolio to export results for
   * @param format      - 'csv' or 'pdf'
   * @returns ExportResult with data string, MIME content type, and filename
   */
  async exportStressTestResults(
    portfolioId: string,
    format: 'csv' | 'pdf',
  ): Promise<ExportResult> {
    // Query all stress test results for this portfolio, most recent first
    const rows = await db
      .select({
        id: schema.stressTestResults.id,
        scenario_id: schema.stressTestResults.scenario_id,
        scenario_name: schema.stressTestResults.scenario_name,
        portfolio_id: schema.stressTestResults.portfolio_id,
        impact_pct: schema.stressTestResults.impact_pct,
        impact_amount: schema.stressTestResults.impact_amount,
        run_date: schema.stressTestResults.run_date,
        parameters: schema.stressTestResults.parameters,
      })
      .from(schema.stressTestResults)
      .where(eq(schema.stressTestResults.portfolio_id, portfolioId))
      .orderBy(desc(schema.stressTestResults.run_date));

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (format === 'csv') {
      const csvData = buildCsv(rows as StressTestRow[]);
      return {
        data: csvData,
        contentType: 'text/csv',
        filename: `stress-test-${portfolioId}-${timestamp}.csv`,
      };
    }

    // PDF format — generate text-based placeholder (swap in real PDF lib later)
    const pdfData = buildPdfPlaceholder(portfolioId, rows as StressTestRow[]);
    return {
      data: pdfData,
      // When a real PDF lib is integrated, change to 'application/pdf'
      contentType: 'text/plain',
      filename: `stress-test-${portfolioId}-${timestamp}.pdf`,
    };
  },
};
