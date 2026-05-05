/**
 * Back-Office Service Request Routes
 *
 * Protected by requireBackOfficeRole(). Provides RM/Teller operations
 * for the service request lifecycle.
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { serviceRequestService } from '../../services/service-request-service';
import { SERVICE_REQUEST_REASSIGNMENT_ROLES } from '../../services/service-request-reassignment-policy';

const router = Router();
router.use(requireBackOfficeRole());

function actorIdFromRequest(req: any): string {
  return String(req.userId ?? req.user?.id ?? 'unknown');
}

function actorRoleFromRequest(req: any): string {
  const userRoles = req.user?.roles;
  const role = Array.isArray(userRoles) ? userRoles[0] : userRoles ?? req.user?.role ?? req.userRole;
  return String(role ?? '');
}

function ipFromRequest(req: any): string | undefined {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}

/** GET / — Paginated list (RM queue) */
router.get('/', asyncHandler(async (req: any, res: any) => {
  const { status, priority, search, page, pageSize } = req.query;
  const result = await serviceRequestService.getServiceRequests({
    status: status as string,
    priority: priority as string,
    search: search as string,
    page: page ? parseInt(page as string, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
  });
  res.json(result);
}));

/** GET /summary — KPI dashboard */
router.get('/summary', asyncHandler(async (_req: any, res: any) => {
  const summary = await serviceRequestService.getSummary();
  res.json(summary);
}));

/** GET /:id — Detail */
router.get('/:id', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const sr = await serviceRequestService.getServiceRequestById(id);
  if (!sr) return res.status(404).json({ error: 'Service request not found' });
  res.json(sr);
}));

/** GET /:id/history — Status history timeline */
router.get('/:id/history', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const history = await serviceRequestService.getStatusHistory(id);
  res.json({ data: history });
}));

/** PUT /:id — RM updates (branch, unit, date, docs) */
router.put('/:id', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const userId = String(req.userId ?? req.user?.id ?? req.body.updated_by ?? 'unknown');
  const result = await serviceRequestService.updateServiceRequest(id, req.body, userId);
  res.json(result);
}));

/** PUT /:id/send-for-verification — RM → teller */
router.put('/:id/send-for-verification', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const userId = actorIdFromRequest(req);
  const result = await serviceRequestService.sendForVerification(id, req.body, userId);
  res.json(result);
}));

/** PUT /:id/complete — Teller completes */
router.put('/:id/complete', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const tellerId = req.body.teller_id || req.userId || req.user?.id;
  const userId = String(req.userId ?? req.user?.id ?? tellerId ?? 'unknown');
  const result = await serviceRequestService.completeRequest(id, tellerId, userId);
  res.json(result);
}));

/** PUT /:id/incomplete — Teller marks incomplete */
router.put('/:id/incomplete', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const tellerId = req.body.teller_id || req.userId || req.user?.id;
  const userId = String(req.userId ?? req.user?.id ?? tellerId ?? 'unknown');
  const notes = req.body.notes || '';
  const result = await serviceRequestService.markIncomplete(id, tellerId, notes, userId);
  res.json(result);
}));

/** PUT /:id/reject — Reject with reason */
router.put('/:id/reject', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const reason = req.body.reason;
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });
  const userId = actorIdFromRequest(req);
  const result = await serviceRequestService.rejectRequest(id, reason, userId);
  res.json(result);
}));

/** PUT /:id/reassign — Reassign RM (ops manager / admin) */
router.put('/:id/reassign', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'valid service request id is required' } });
  }

  const newRmId = Number(req.body.new_rm_id);
  if (!Number.isInteger(newRmId) || newRmId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'new_rm_id must be a positive integer' } });
  }

  const reason = String(req.body.reason ?? '').trim();
  if (reason.length < 10) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'reason must be at least 10 characters' } });
  }

  try {
    const result = await serviceRequestService.reassignRM(id, newRmId, actorIdFromRequest(req), {
      actorRole: actorRoleFromRequest(req),
      reason,
      ipAddress: ipFromRequest(req),
      correlationId: req.id,
    });
    res.json({ data: result });
  } catch (err: any) {
    if (err?.statusCode === 403) {
      return res.status(403).json({
        error: {
          code: err.code ?? 'FORBIDDEN',
          message: err.message,
          requiredRoles: SERVICE_REQUEST_REASSIGNMENT_ROLES,
          currentRole: actorRoleFromRequest(req) || null,
          correlation_id: req.id,
        },
      });
    }
    if (err?.statusCode === 400) {
      return res.status(400).json({
        error: { code: err.code ?? 'VALIDATION_ERROR', message: err.message, correlation_id: req.id },
      });
    }
    throw err;
  }
}));

export default router;
