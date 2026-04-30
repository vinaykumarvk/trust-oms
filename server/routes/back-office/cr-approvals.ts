/**
 * Call Report Approval Routes (Calendar & Call Report Management)
 *
 * Supervisor approval endpoints for late-filed call reports:
 *   GET    /                — List pending/claimed approvals
 *   PATCH  /:id/claim       — Claim a pending approval
 *   PATCH  /:id/approve     — Approve a claimed approval
 *   PATCH  /:id/reject      — Reject a claimed approval
 */

import { Router } from 'express';
import { requireBackOfficeRole, requireAnyRole } from '../../middleware/role-auth';
import { approvalWorkflowService } from '../../services/approval-workflow-service';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id)) throw new Error('Invalid ID');
  return id;
}

function parseAuthenticatedUserId(req: any): number | null {
  const raw = req.user?.id ?? req.userId;
  if (raw === undefined || raw === null || raw === '') return null;
  const id = parseInt(String(raw), 10);
  return isNaN(id) ? null : id;
}

const asyncHandler = (fn: Function) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const router = Router();

// ---------------------------------------------------------------------------
// GET / — List pending/claimed call-report approvals
// ---------------------------------------------------------------------------

router.get(
  '/',
  requireBackOfficeRole(),
  asyncHandler(async (req: any, res: any) => {
    const filters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
    };

    const result = await approvalWorkflowService.getPendingApprovals(filters);
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// PATCH /:id/claim — Claim a pending approval for review
// ---------------------------------------------------------------------------

router.patch(
  '/:id/claim',
  requireAnyRole('BO_CHECKER', 'BO_HEAD'),
  asyncHandler(async (req: any, res: any) => {
    const id = parseId(req.params.id);

    const supervisorId = parseAuthenticatedUserId(req);
    if (!supervisorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const result = await approvalWorkflowService.claim(id, supervisorId);
      res.json({ data: result });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      return res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

// ---------------------------------------------------------------------------
// PATCH /:id/approve — Approve a claimed call-report approval
// ---------------------------------------------------------------------------

router.patch(
  '/:id/approve',
  requireAnyRole('BO_CHECKER', 'BO_HEAD'),
  asyncHandler(async (req: any, res: any) => {
    const id = parseId(req.params.id);

    const supervisorId = parseAuthenticatedUserId(req);
    if (!supervisorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { comments, quality_score } = req.body ?? {};

    try {
      const result = await approvalWorkflowService.approve(id, supervisorId, comments, quality_score);
      res.json({ data: result });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      return res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

// ---------------------------------------------------------------------------
// PATCH /:id/reject — Reject a claimed call-report approval
// ---------------------------------------------------------------------------

router.patch(
  '/:id/reject',
  requireAnyRole('BO_CHECKER', 'BO_HEAD'),
  asyncHandler(async (req: any, res: any) => {
    const id = parseId(req.params.id);

    const supervisorId = parseAuthenticatedUserId(req);
    if (!supervisorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { comments } = req.body ?? {};
    if (!comments || typeof comments !== 'string' || comments.trim().length < 20) {
      return res.status(400).json({ error: 'Reviewer comments must be at least 20 characters' });
    }

    try {
      const result = await approvalWorkflowService.reject(id, supervisorId, comments);
      res.json({ data: result });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      return res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

export default router;
