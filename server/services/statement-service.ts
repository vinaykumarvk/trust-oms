/**
 * Statement Service (Phase 3C — Statement Download)
 *
 * Provides:
 *   - getForClient()       — paginated list of statements for a client
 *   - download()           — IDOR-guarded download with audit tracking
 *   - triggerRegenerate()  — back-office regeneration trigger
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, count } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from './service-errors';
import { getStorageProvider } from './storage-provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Statement = typeof schema.clientStatements.$inferSelect;

export interface StatementListFilters {
  page?: number;
  pageSize?: number;
}

export interface StatementListResult {
  data: Statement[];
  total: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class StatementService {
  /**
   * Return a paginated list of statements for the given client, ordered by
   * period descending (newest first).
   */
  async getForClient(
    clientId: string,
    filters: StatementListFilters = {},
  ): Promise<StatementListResult> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(schema.clientStatements)
        .where(eq(schema.clientStatements.client_id, clientId))
        .orderBy(desc(schema.clientStatements.period))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: count() })
        .from(schema.clientStatements)
        .where(eq(schema.clientStatements.client_id, clientId)),
    ]);

    return { data: rows, total: Number(total) };
  }

  /**
   * Download a statement by ID.
   *
   * Guards:
   *   - IDOR: statement.client_id must match the requesting clientId
   *   - Status: delivery_status must be AVAILABLE
   *
   * Side effects:
   *   - Increments download_count
   *   - Sets last_downloaded_at to now
   */
  async download(
    statementId: number,
    clientId: string,
  ): Promise<{ buffer: Buffer; statement: Statement }> {
    const [statement] = await db
      .select()
      .from(schema.clientStatements)
      .where(eq(schema.clientStatements.id, statementId))
      .limit(1);

    if (!statement) {
      throw new NotFoundError(`Statement ${statementId} not found`);
    }

    // IDOR guard
    if (statement.client_id !== clientId) {
      throw new ForbiddenError('Access denied: statement does not belong to your account');
    }

    // Status guard
    if (statement.delivery_status !== 'AVAILABLE') {
      throw new ValidationError(
        `Statement is not available for download. Current status: ${statement.delivery_status}`,
      );
    }

    // File reference must be present
    if (!statement.file_reference) {
      throw new ValidationError(
        'Statement is not available for download. Current status: PENDING',
      );
    }

    // Read file from storage
    const storageProvider = getStorageProvider();
    const buffer = await storageProvider.read(statement.file_reference);

    // Update download tracking (fire-and-forget — non-fatal)
    const now = new Date();
    db
      .update(schema.clientStatements)
      .set({
        download_count: (statement.download_count ?? 0) + 1,
        last_downloaded_at: now,
        updated_at: now,
      })
      .where(eq(schema.clientStatements.id, statementId))
      .catch((err: unknown) =>
        console.error('[StatementService] Failed to update download tracking:', err),
      );

    // Audit log (fire-and-forget)
    console.log(
      JSON.stringify({
        event: 'STATEMENT_DOWNLOADED',
        statement_id: statementId,
        client_id: clientId,
        period: statement.period,
        statement_type: statement.statement_type,
        timestamp: now.toISOString(),
      }),
    );

    return { buffer, statement };
  }

  /**
   * Trigger regeneration of a statement (back-office action).
   *
   * - Throws NotFoundError if the statement does not exist.
   * - Throws ConflictError if the statement is already generating.
   * - Sets delivery_status to GENERATING and clears any prior delivery_error.
   */
  async triggerRegenerate(statementId: number): Promise<void> {
    const [statement] = await db
      .select()
      .from(schema.clientStatements)
      .where(eq(schema.clientStatements.id, statementId))
      .limit(1);

    if (!statement) {
      throw new NotFoundError(`Statement ${statementId} not found`);
    }

    if (statement.delivery_status === 'GENERATING') {
      throw new ConflictError('Statement generation already in progress');
    }

    await db
      .update(schema.clientStatements)
      .set({
        delivery_status: 'GENERATING',
        delivery_error: null,
        updated_at: new Date(),
      })
      .where(eq(schema.clientStatements.id, statementId));

    console.log(`[StatementService] Statement regeneration triggered for statementId: ${statementId}`);
  }
}

export const statementService = new StatementService();
