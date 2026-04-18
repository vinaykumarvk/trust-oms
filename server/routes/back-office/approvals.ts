/**
 * Approval Queue API Routes
 *
 * Provides endpoints for managing the maker-checker approval workflow:
 *   GET  /api/v1/approvals           — Paginated list with filters
 *   GET  /api/v1/approvals/summary   — Dashboard summary counts
 *   GET  /api/v1/approvals/:id       — Single approval request detail
 *   POST /api/v1/approvals/:id/approve  — Approve a pending request
 *   POST /api/v1/approvals/:id/reject   — Reject a pending request
 *   POST /api/v1/approvals/:id/cancel   — Cancel own pending request
 *   POST /api/v1/approvals/batch-approve — Batch approve
 *   POST /api/v1/approvals/batch-reject  — Batch reject
 */

import { Router } from 'express';
import { db } from '../../db';
import { approvalRequests, users } from '@shared/schema';
import { eq, and, desc, sql, or, ilike, gte, lte, inArray } from 'drizzle-orm';
import { asyncHandler } from '../../middleware/async-handler';
import {
  reviewRequest,
  batchApprove,
  batchReject,
  cancelRequest,
} from '../../services/maker-checker';
import { logAuditEvent } from '../../services/audit-logger';

const router = Router();

// ---------------------------------------------------------------------------
// Aliases for joined user columns
// ---------------------------------------------------------------------------

const submitterAlias = {
  submitterName: users.full_name,
  submitterEmail: users.email,
};

// ---------------------------------------------------------------------------
// GET /api/v1/approvals — Paginated list
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 25));
    const offset = (page - 1) * pageSize;

    const status = req.query.status as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const search = req.query.search as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const view = req.query.view as string | undefined;

    // Build where conditions
    const conditions: ReturnType<typeof eq>[] = [];

    if (status) {
      conditions.push(eq(approvalRequests.approval_status, status.toUpperCase() as any));
    }

    if (entityType) {
      conditions.push(eq(approvalRequests.entity_type, entityType));
    }

    if (view === 'my-submissions' && req.userId) {
      const userIdNum = parseInt(req.userId);
      if (!isNaN(userIdNum)) {
        conditions.push(eq(approvalRequests.submitted_by, userIdNum));
      }
    }

    if (dateFrom) {
      conditions.push(gte(approvalRequests.submitted_at, new Date(dateFrom)));
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(approvalRequests.submitted_at, toDate));
    }

    if (search) {
      conditions.push(
        or(
          ilike(approvalRequests.entity_type, `%${search}%`),
          ilike(approvalRequests.entity_id, `%${search}%`),
          ilike(approvalRequests.action, `%${search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // We need submitter and reviewer names via subselects for cleaner Drizzle usage
    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: approvalRequests.id,
          entity_type: approvalRequests.entity_type,
          entity_id: approvalRequests.entity_id,
          action: approvalRequests.action,
          approval_status: approvalRequests.approval_status,
          payload: approvalRequests.payload,
          previous_values: approvalRequests.previous_values,
          submitted_by: approvalRequests.submitted_by,
          submitted_at: approvalRequests.submitted_at,
          reviewed_by: approvalRequests.reviewed_by,
          reviewed_at: approvalRequests.reviewed_at,
          review_comment: approvalRequests.review_comment,
          sla_deadline: approvalRequests.sla_deadline,
          is_sla_breached: approvalRequests.is_sla_breached,
          submitter_name: sql<string>`(SELECT full_name FROM users WHERE id = ${approvalRequests.submitted_by})`,
          reviewer_name: sql<string>`(SELECT full_name FROM users WHERE id = ${approvalRequests.reviewed_by})`,
        })
        .from(approvalRequests)
        .where(whereClause)
        .orderBy(desc(approvalRequests.submitted_at))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(approvalRequests)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    res.json({ data: rows, total, page, pageSize });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/approvals/summary — Dashboard counts
// ---------------------------------------------------------------------------

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pending, approvedToday, rejectedToday, slaBreached] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(approvalRequests)
        .where(eq(approvalRequests.approval_status, 'PENDING')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.approval_status, 'APPROVED'),
            gte(approvalRequests.reviewed_at, todayStart),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.approval_status, 'REJECTED'),
            gte(approvalRequests.reviewed_at, todayStart),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(approvalRequests)
        .where(eq(approvalRequests.is_sla_breached, true)),
    ]);

    res.json({
      pending: pending[0]?.count ?? 0,
      approvedToday: approvedToday[0]?.count ?? 0,
      rejectedToday: rejectedToday[0]?.count ?? 0,
      slaBreached: slaBreached[0]?.count ?? 0,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/v1/approvals/:id — Single approval detail
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: { message: 'Invalid approval ID' } });
    }

    const rows = await db
      .select({
        id: approvalRequests.id,
        entity_type: approvalRequests.entity_type,
        entity_id: approvalRequests.entity_id,
        action: approvalRequests.action,
        approval_status: approvalRequests.approval_status,
        payload: approvalRequests.payload,
        previous_values: approvalRequests.previous_values,
        submitted_by: approvalRequests.submitted_by,
        submitted_at: approvalRequests.submitted_at,
        reviewed_by: approvalRequests.reviewed_by,
        reviewed_at: approvalRequests.reviewed_at,
        review_comment: approvalRequests.review_comment,
        sla_deadline: approvalRequests.sla_deadline,
        is_sla_breached: approvalRequests.is_sla_breached,
        submitter_name: sql<string>`(SELECT full_name FROM users WHERE id = ${approvalRequests.submitted_by})`,
        reviewer_name: sql<string>`(SELECT full_name FROM users WHERE id = ${approvalRequests.reviewed_by})`,
      })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: 'Approval request not found' } });
    }

    res.json(rows[0]);
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/approvals/:id/approve
// ---------------------------------------------------------------------------

router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: { message: 'Invalid approval ID' } });
    }

    const { comment } = req.body ?? {};
    const reviewerId = req.userId ?? 'unknown';

    const result = await reviewRequest(id, reviewerId, 'APPROVED', comment);

    if (!result.success) {
      return res.status(400).json({ error: { message: result.message } });
    }

    res.json({ success: true, message: result.message });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/approvals/:id/reject
// ---------------------------------------------------------------------------

router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: { message: 'Invalid approval ID' } });
    }

    const { comment } = req.body ?? {};
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ error: { message: 'Comment is required for rejection' } });
    }

    const reviewerId = req.userId ?? 'unknown';
    const result = await reviewRequest(id, reviewerId, 'REJECTED', comment.trim());

    if (!result.success) {
      return res.status(400).json({ error: { message: result.message } });
    }

    res.json({ success: true, message: result.message });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/approvals/:id/cancel
// ---------------------------------------------------------------------------

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: { message: 'Invalid approval ID' } });
    }

    const userId = req.userId ?? 'unknown';
    const result = await cancelRequest(id, userId);

    if (!result.success) {
      return res.status(400).json({ error: { message: result.message } });
    }

    res.json({ success: true, message: result.message });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/approvals/batch-approve
// ---------------------------------------------------------------------------

router.post(
  '/batch-approve',
  asyncHandler(async (req, res) => {
    const { ids, comment } = req.body ?? {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: { message: 'ids array is required' } });
    }

    const reviewerId = req.userId ?? 'unknown';
    const result = await batchApprove(ids.map(Number), reviewerId);

    logAuditEvent({
      entityType: 'approval_requests',
      entityId: 'batch',
      action: 'AUTHORIZE',
      actorId: reviewerId,
      changes: { batchApproved: result.approved, batchFailed: result.failed },
    }).catch(() => {});

    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// POST /api/v1/approvals/batch-reject
// ---------------------------------------------------------------------------

router.post(
  '/batch-reject',
  asyncHandler(async (req, res) => {
    const { ids, comment } = req.body ?? {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: { message: 'ids array is required' } });
    }

    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ error: { message: 'Comment is required for batch rejection' } });
    }

    const reviewerId = req.userId ?? 'unknown';
    const result = await batchReject(ids.map(Number), reviewerId, comment.trim());

    logAuditEvent({
      entityType: 'approval_requests',
      entityId: 'batch',
      action: 'REJECT',
      actorId: reviewerId,
      changes: { batchRejected: result.rejected, batchFailed: result.failed, comment },
    }).catch(() => {});

    res.json(result);
  }),
);

export default router;
