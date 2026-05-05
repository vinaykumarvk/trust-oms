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
import { logAuditEvent } from './audit-logger';
import {
  appendStatementAccessHistory,
  buildStatementAccessEntry,
  computeStatementContentHash,
  retentionPolicyForStatement,
  statementRetentionUntil,
} from './statement-download-policy';
import { clientPortalEvidenceService, portalEvidenceContext } from './client-portal-evidence-service';

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

export interface StatementDownloadContext {
  actorId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  requesterType?: string | null;
  sourceChannel?: string | null;
  userAgent?: string | null;
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
    context: StatementDownloadContext = {},
  ): Promise<{ buffer: Buffer; statement: Statement; contentHash: string; retentionUntil: string }> {
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
    const contentHash = computeStatementContentHash(buffer);

    if (statement.content_hash && statement.content_hash !== contentHash) {
      await logAuditEvent({
        entityType: 'client_statement',
        entityId: String(statementId),
        action: 'STATEMENT_INTEGRITY_FAILED',
        actorId: context.actorId ?? clientId,
        actorRole: context.actorRole ?? 'CLIENT',
        ipAddress: context.ipAddress ?? undefined,
        correlationId: context.correlationId ?? undefined,
        metadata: {
          client_id: clientId,
          expected_hash: statement.content_hash,
          actual_hash: contentHash,
          file_reference: statement.file_reference,
        },
      });
      throw new ConflictError('Statement file integrity check failed');
    }

    const now = new Date();
    const actorId = context.actorId ?? clientId;
    const retentionPolicy = statement.retention_policy ?? retentionPolicyForStatement(statement.statement_type);
    const retentionUntil = statement.retention_until ?? statementRetentionUntil(statement.generated_at ?? statement.created_at ?? now);
    const accessEntry = buildStatementAccessEntry({
      requesterType: context.requesterType ?? 'CLIENT',
      requesterId: actorId,
      ipAddress: context.ipAddress,
      contentHash,
      at: now,
    });

    await db
      .update(schema.clientStatements)
      .set({
        download_count: (statement.download_count ?? 0) + 1,
        last_downloaded_at: now,
        last_downloaded_by: actorId,
        last_downloaded_ip: context.ipAddress ?? null,
        storage_provider: statement.storage_provider ?? 'LOCAL',
        content_hash: statement.content_hash ?? contentHash,
        file_size_bytes: statement.file_size_bytes ?? buffer.length,
        retention_policy: retentionPolicy,
        retention_until: retentionUntil,
        access_history: appendStatementAccessHistory(statement.access_history, accessEntry),
        updated_at: now,
      })
      .where(eq(schema.clientStatements.id, statementId));

    await logAuditEvent({
      entityType: 'client_statement',
      entityId: String(statementId),
      action: 'STATEMENT_DOWNLOADED',
      actorId,
      actorRole: context.actorRole ?? 'CLIENT',
      ipAddress: context.ipAddress ?? undefined,
      correlationId: context.correlationId ?? undefined,
      changes: {
        download_count: { old: statement.download_count ?? 0, new: (statement.download_count ?? 0) + 1 },
        last_downloaded_at: now.toISOString(),
      },
      metadata: {
        client_id: clientId,
        period: statement.period,
        statement_type: statement.statement_type,
        file_reference: statement.file_reference,
        storage_provider: statement.storage_provider ?? 'LOCAL',
        content_hash: contentHash,
        retention_policy: retentionPolicy,
        retention_until: retentionUntil,
        report_pack_output_id: statement.report_pack_output_id ?? null,
      },
    });

    await clientPortalEvidenceService.recordStatementDownload(
      statement,
      {
        contentHash,
        retentionUntil,
        fileSizeBytes: buffer.length,
      },
      portalEvidenceContext({
        actorId,
        actorRole: context.actorRole,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
        sourceChannel: context.sourceChannel ?? 'CLIENT_PORTAL',
      }),
    ).catch(() => {});

    return { buffer, statement, contentHash, retentionUntil };
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
        content_hash: null,
        updated_at: new Date(),
      })
      .where(eq(schema.clientStatements.id, statementId));
  }
}

export const statementService = new StatementService();
