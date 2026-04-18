/**
 * Bulk Upload Service (Phase 3E)
 *
 * Handles batch lifecycle: creation, validation, submission,
 * authorization, rollback, and error reporting.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

// In-memory error reports (keyed by batchId). In production this would
// be persisted to object storage or a dedicated table.
const errorReports = new Map<number, Array<{ row: number; field: string; message: string }>>();

export const bulkUploadService = {
  // -------------------------------------------------------------------------
  // Create a new batch
  // -------------------------------------------------------------------------
  async createBatch(data: {
    filename: string;
    rowCount: number;
    uploadedBy: number;
  }) {
    const [batch] = await db
      .insert(schema.uploadBatches)
      .values({
        filename: data.filename,
        row_count: data.rowCount,
        accepted_rows: 0,
        rejected_rows: 0,
        upload_status: 'CREATED',
        uploaded_by: data.uploadedBy,
        rollback_status: null,
      })
      .returning();

    return batch;
  },

  // -------------------------------------------------------------------------
  // Validate batch rows
  // -------------------------------------------------------------------------
  async validateBatch(batchId: number, rows: Array<Record<string, unknown>>) {
    const [batch] = await db
      .select()
      .from(schema.uploadBatches)
      .where(eq(schema.uploadBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    const errors: Array<{ row: number; field: string; message: string }> = [];
    let accepted = 0;
    let rejected = 0;

    const requiredFields = ['account_id', 'amount', 'currency'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let rowValid = true;

      // Check required fields
      for (const field of requiredFields) {
        if (row[field] === undefined || row[field] === null || row[field] === '') {
          errors.push({
            row: i + 1,
            field,
            message: `Missing required field: ${field}`,
          });
          rowValid = false;
        }
      }

      // Validate amount is numeric
      if (row['amount'] !== undefined && row['amount'] !== null && row['amount'] !== '') {
        const amount = Number(row['amount']);
        if (isNaN(amount)) {
          errors.push({
            row: i + 1,
            field: 'amount',
            message: `Invalid numeric value: ${String(row['amount'])}`,
          });
          rowValid = false;
        }
      }

      // Validate currency format (3-letter ISO)
      if (typeof row['currency'] === 'string' && !/^[A-Z]{3}$/.test(row['currency'])) {
        errors.push({
          row: i + 1,
          field: 'currency',
          message: `Invalid currency code: ${row['currency']}`,
        });
        rowValid = false;
      }

      if (rowValid) {
        accepted++;
      } else {
        rejected++;
      }
    }

    // Store error report
    errorReports.set(batchId, errors);

    const [updated] = await db
      .update(schema.uploadBatches)
      .set({
        accepted_rows: accepted,
        rejected_rows: rejected,
        upload_status: 'VALIDATED',
        error_report_url: errors.length > 0 ? `/api/v1/uploads/${batchId}/errors` : null,
        updated_at: new Date(),
      })
      .where(eq(schema.uploadBatches.id, batchId))
      .returning();

    return {
      batch: updated,
      accepted,
      rejected,
      errors,
    };
  },

  // -------------------------------------------------------------------------
  // Submit batch for authorization
  // -------------------------------------------------------------------------
  async submitBatch(batchId: number) {
    const [batch] = await db
      .select()
      .from(schema.uploadBatches)
      .where(eq(schema.uploadBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }
    if (batch.upload_status !== 'VALIDATED') {
      throw new Error(
        `Batch ${batchId} is not validated (current: ${batch.upload_status})`,
      );
    }

    const [updated] = await db
      .update(schema.uploadBatches)
      .set({
        upload_status: 'PENDING_AUTH',
        updated_at: new Date(),
      })
      .where(eq(schema.uploadBatches.id, batchId))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Authorize batch
  // -------------------------------------------------------------------------
  async authorizeBatch(batchId: number, authorizedBy: number) {
    const [batch] = await db
      .select()
      .from(schema.uploadBatches)
      .where(eq(schema.uploadBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }
    if (batch.upload_status !== 'PENDING_AUTH') {
      throw new Error(
        `Batch ${batchId} is not pending authorization (current: ${batch.upload_status})`,
      );
    }

    const [updated] = await db
      .update(schema.uploadBatches)
      .set({
        authorized_by: authorizedBy,
        upload_status: 'AUTHORIZED',
        updated_at: new Date(),
      })
      .where(eq(schema.uploadBatches.id, batchId))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Rollback batch
  // -------------------------------------------------------------------------
  async rollbackBatch(batchId: number) {
    const [batch] = await db
      .select()
      .from(schema.uploadBatches)
      .where(eq(schema.uploadBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }
    if (batch.upload_status !== 'AUTHORIZED') {
      throw new Error(
        `Batch ${batchId} is not authorized (current: ${batch.upload_status})`,
      );
    }

    // Set rolling back
    await db
      .update(schema.uploadBatches)
      .set({
        rollback_status: 'ROLLING_BACK',
        updated_at: new Date(),
      })
      .where(eq(schema.uploadBatches.id, batchId));

    // Simulate rollback processing, then set rolled back
    const [updated] = await db
      .update(schema.uploadBatches)
      .set({
        rollback_status: 'ROLLED_BACK',
        updated_at: new Date(),
      })
      .where(eq(schema.uploadBatches.id, batchId))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Get batch status
  // -------------------------------------------------------------------------
  async getBatchStatus(batchId: number) {
    const [batch] = await db
      .select()
      .from(schema.uploadBatches)
      .where(eq(schema.uploadBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    return batch;
  },

  // -------------------------------------------------------------------------
  // Get batches (paginated, filterable)
  // -------------------------------------------------------------------------
  async getBatches(filters: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(eq(schema.uploadBatches.upload_status, filters.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.uploadBatches)
      .where(where)
      .orderBy(desc(schema.uploadBatches.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.uploadBatches)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // Get error report for a batch
  // -------------------------------------------------------------------------
  async getErrorReport(batchId: number) {
    const [batch] = await db
      .select()
      .from(schema.uploadBatches)
      .where(eq(schema.uploadBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    const errors = errorReports.get(batchId) ?? [];

    return {
      batchId,
      filename: batch.filename,
      totalErrors: errors.length,
      errors,
    };
  },
};
