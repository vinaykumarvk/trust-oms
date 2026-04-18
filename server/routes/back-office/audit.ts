/**
 * Audit Trail API Routes
 *
 * Provides endpoints for viewing and verifying audit records:
 *   GET  /api/v1/audit                             — Paginated list with filters
 *   GET  /api/v1/audit/summary                     — Dashboard summary stats
 *   GET  /api/v1/audit/:entityType/:entityId       — Entity audit history
 *   GET  /api/v1/audit/verify-chain/:entityType/:entityId — Hash chain verification
 */

import { createHash } from 'crypto';
import { Router } from 'express';
import { db } from '../../db';
import { auditRecords } from '@shared/schema';
import { eq, and, desc, asc, sql, or, ilike, gte, lte } from 'drizzle-orm';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/audit — Paginated list
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 25));
    const offset = (page - 1) * pageSize;

    const entityType = req.query.entityType as string | undefined;
    const action = req.query.action as string | undefined;
    const actorId = req.query.actorId as string | undefined;
    const search = req.query.search as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'created_at';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    // Build where conditions
    const conditions: ReturnType<typeof eq>[] = [];

    if (entityType) {
      conditions.push(eq(auditRecords.entity_type, entityType));
    }

    if (action) {
      conditions.push(eq(auditRecords.action, action as any));
    }

    if (actorId) {
      conditions.push(eq(auditRecords.actor_id, actorId));
    }

    if (dateFrom) {
      conditions.push(gte(auditRecords.created_at, new Date(dateFrom)));
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(auditRecords.created_at, toDate));
    }

    if (search) {
      conditions.push(
        or(
          ilike(auditRecords.entity_type, `%${search}%`),
          ilike(auditRecords.entity_id, `%${search}%`),
          ilike(auditRecords.actor_id, `%${search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort column
    const sortColumn =
      sortBy === 'entity_type'
        ? auditRecords.entity_type
        : sortBy === 'action'
          ? auditRecords.action
          : sortBy === 'actor_id'
            ? auditRecords.actor_id
            : auditRecords.created_at;

    const orderFn = sortOrder === 'asc' ? asc : desc;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(auditRecords)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditRecords)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    res.json({ data: rows, total, page, pageSize });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/audit/summary — Dashboard stats
// ---------------------------------------------------------------------------

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayCount, weekCount, monthCount, byAction, topUsers, topEntityTypes] =
      await Promise.all([
        // Events today
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditRecords)
          .where(gte(auditRecords.created_at, todayStart)),

        // Events this week
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditRecords)
          .where(gte(auditRecords.created_at, weekStart)),

        // Events this month
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditRecords)
          .where(gte(auditRecords.created_at, monthStart)),

        // By action
        db
          .select({
            action: auditRecords.action,
            count: sql<number>`count(*)::int`,
          })
          .from(auditRecords)
          .groupBy(auditRecords.action)
          .orderBy(desc(sql`count(*)`)),

        // Top users
        db
          .select({
            actorId: auditRecords.actor_id,
            actorRole: auditRecords.actor_role,
            count: sql<number>`count(*)::int`,
          })
          .from(auditRecords)
          .where(gte(auditRecords.created_at, monthStart))
          .groupBy(auditRecords.actor_id, auditRecords.actor_role)
          .orderBy(desc(sql`count(*)`))
          .limit(10),

        // Top entity types
        db
          .select({
            entityType: auditRecords.entity_type,
            count: sql<number>`count(*)::int`,
          })
          .from(auditRecords)
          .groupBy(auditRecords.entity_type)
          .orderBy(desc(sql`count(*)`))
          .limit(10),
      ]);

    res.json({
      today: todayCount[0]?.count ?? 0,
      thisWeek: weekCount[0]?.count ?? 0,
      thisMonth: monthCount[0]?.count ?? 0,
      byAction,
      topUsers,
      topEntityTypes,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/audit/verify-chain/:entityType/:entityId — Hash chain verification
// NOTE: This must be defined BEFORE the /:entityType/:entityId route
// ---------------------------------------------------------------------------

router.get(
  '/verify-chain/:entityType/:entityId',
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params;

    const records = await db
      .select()
      .from(auditRecords)
      .where(
        and(
          eq(auditRecords.entity_type, entityType),
          eq(auditRecords.entity_id, entityId),
        ),
      )
      .orderBy(asc(auditRecords.id));

    if (records.length === 0) {
      return res.json({
        valid: true,
        totalRecords: 0,
        message: 'No audit records found for this entity',
      });
    }

    let expectedPreviousHash = 'GENESIS';
    let firstBrokenRecord: number | undefined;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      // Verify the previous_hash links correctly
      if (record.previous_hash !== expectedPreviousHash) {
        firstBrokenRecord = i;
        break;
      }

      // Recompute the record hash
      const payload = JSON.stringify({
        entityType: record.entity_type,
        entityId: record.entity_id,
        action: record.action,
        actorId: record.actor_id ?? null,
        changes: record.changes ?? null,
        timestamp: record.created_at.toISOString(),
      });

      const recomputedHash = createHash('sha256')
        .update(payload + expectedPreviousHash)
        .digest('hex');

      if (record.record_hash !== recomputedHash) {
        firstBrokenRecord = i;
        break;
      }

      expectedPreviousHash = record.record_hash ?? '';
    }

    if (firstBrokenRecord !== undefined) {
      return res.json({
        valid: false,
        totalRecords: records.length,
        firstBrokenRecord,
        message: `Hash chain integrity broken at record index ${firstBrokenRecord}`,
      });
    }

    res.json({
      valid: true,
      totalRecords: records.length,
      message: 'Hash chain integrity verified successfully',
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/audit/:entityType/:entityId — Entity audit history
// ---------------------------------------------------------------------------

router.get(
  '/:entityType/:entityId',
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params;

    const records = await db
      .select()
      .from(auditRecords)
      .where(
        and(
          eq(auditRecords.entity_type, entityType),
          eq(auditRecords.entity_id, entityId),
        ),
      )
      .orderBy(desc(auditRecords.created_at));

    // Check chain integrity
    const orderedRecords = [...records].sort((a, b) => Number(a.id) - Number(b.id));
    let chainIntegrity = true;
    let prevHash = 'GENESIS';

    for (const record of orderedRecords) {
      if (record.previous_hash !== prevHash) {
        chainIntegrity = false;
        break;
      }
      prevHash = record.record_hash ?? '';
    }

    // Map to the format expected by EntityAuditHistory component
    const mapped = records.map((r: typeof records[number]) => ({
      id: r.id,
      action: r.action,
      actor: r.actor_id ?? 'Unknown',
      timestamp: r.created_at.toISOString(),
      changesSummary: summarizeChanges(r.changes as Record<string, unknown> | null),
      oldValues: extractOldValues(r.changes as Record<string, unknown> | null),
      newValues: extractNewValues(r.changes as Record<string, unknown> | null),
      hash: r.record_hash ?? '',
      previousHash: r.previous_hash ?? '',
    }));

    res.json({ records: mapped, chainIntegrity });
  }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeChanges(changes: Record<string, unknown> | null): string {
  if (!changes) return '';
  const keys = Object.keys(changes);
  if (keys.length <= 3) return `Changed: ${keys.join(', ')}`;
  return `Changed ${keys.length} fields: ${keys.slice(0, 3).join(', ')}...`;
}

function extractOldValues(
  changes: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!changes) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value && typeof value === 'object' && 'old' in (value as any)) {
      result[key] = (value as any).old;
    }
  }
  return result;
}

function extractNewValues(
  changes: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!changes) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value && typeof value === 'object' && 'new' in (value as any)) {
      result[key] = (value as any).new;
    }
  }
  return result;
}

export default router;
