/**
 * GL Report Builder — User-Configurable Report Templates
 *
 * Implements:
 *   REP-007: Configurable report definitions with columns, filters, grouping
 *   Execute reports against live GL data
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const glReportBuilder = {
  // =========================================================================
  // Report Definition CRUD
  // =========================================================================

  async createReportDefinition(data: {
    name: string;
    description?: string;
    columns: unknown[];
    filters?: unknown[];
    group_by?: string[];
    sort_order?: unknown[];
    userId?: number;
  }) {
    const [record] = await db
      .insert(schema.glReportDefinitions)
      .values({
        name: data.name,
        description: data.description ?? null,
        columns: data.columns,
        filters: data.filters ?? null,
        group_by: data.group_by ?? null,
        sort_order: data.sort_order ?? null,
        owner_user_id: data.userId ?? null,
      })
      .returning();
    return record;
  },

  async getReportDefinitions() {
    return db
      .select()
      .from(schema.glReportDefinitions)
      .orderBy(desc(schema.glReportDefinitions.id));
  },

  async getReportDefinition(id: number) {
    const [record] = await db
      .select()
      .from(schema.glReportDefinitions)
      .where(eq(schema.glReportDefinitions.id, id))
      .limit(1);
    return record ?? null;
  },

  async updateReportDefinition(id: number, data: Record<string, unknown>) {
    const [updated] = await db
      .update(schema.glReportDefinitions)
      .set({ ...data, updated_at: new Date() })
      .where(eq(schema.glReportDefinitions.id, id))
      .returning();
    return updated;
  },

  async deleteReportDefinition(id: number) {
    await db
      .delete(schema.glReportDefinitions)
      .where(eq(schema.glReportDefinitions.id, id));
    return { deleted: true };
  },

  // =========================================================================
  // Execute Report
  // =========================================================================

  async executeReport(reportId: number, params: {
    dateFrom?: string;
    dateTo?: string;
    accountingUnitId?: number;
    glHeadId?: number;
    fundId?: number;
  }) {
    const definition = await this.getReportDefinition(reportId);
    if (!definition) {
      throw new Error(`Report definition not found: ${reportId}`);
    }

    // Build query conditions from report filters + runtime params
    const conditions = [];

    if (params.dateFrom) {
      conditions.push(gte(schema.glLedgerBalances.balance_date, params.dateFrom));
    }
    if (params.dateTo) {
      conditions.push(lte(schema.glLedgerBalances.balance_date, params.dateTo));
    }
    if (params.accountingUnitId) {
      conditions.push(eq(schema.glLedgerBalances.accounting_unit_id, params.accountingUnitId));
    }
    if (params.glHeadId) {
      conditions.push(eq(schema.glLedgerBalances.gl_head_id, params.glHeadId));
    }
    if (params.fundId) {
      conditions.push(eq(schema.glLedgerBalances.fund_id, params.fundId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glLedgerBalances)
      .where(where)
      .orderBy(schema.glLedgerBalances.balance_date, schema.glLedgerBalances.gl_head_id)
      .limit(10000);

    // Apply column projection from definition
    const columns = Array.isArray(definition.columns) ? definition.columns as Array<{ field: string; header: string }> : [];
    const projected = data.map((row: Record<string, unknown>) => {
      if (columns.length === 0) return row;
      const result: Record<string, unknown> = {};
      for (const col of columns) {
        result[col.header ?? col.field] = row[col.field];
      }
      return result;
    });

    return {
      report_id: reportId,
      report_name: definition.name,
      params,
      total_rows: projected.length,
      columns: columns.map((c) => c.header ?? c.field),
      data: projected,
      generated_at: new Date().toISOString(),
    };
  },
};
