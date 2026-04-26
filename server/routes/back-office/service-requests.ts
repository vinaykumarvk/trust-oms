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

const router = Router();
router.use(requireBackOfficeRole());

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
  const userId = String(req.user?.id || req.body.updated_by || 'unknown');
  const result = await serviceRequestService.updateServiceRequest(id, req.body, userId);
  res.json(result);
}));

/** PUT /:id/send-for-verification — RM → teller */
router.put('/:id/send-for-verification', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const userId = String(req.user?.id || 'unknown');
  const result = await serviceRequestService.sendForVerification(id, req.body, userId);
  res.json(result);
}));

/** PUT /:id/complete — Teller completes */
router.put('/:id/complete', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const tellerId = req.body.teller_id || req.user?.id;
  const userId = String(req.user?.id || tellerId || 'unknown');
  const result = await serviceRequestService.completeRequest(id, tellerId, userId);
  res.json(result);
}));

/** PUT /:id/incomplete — Teller marks incomplete */
router.put('/:id/incomplete', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const tellerId = req.body.teller_id || req.user?.id;
  const userId = String(req.user?.id || tellerId || 'unknown');
  const notes = req.body.notes || '';
  const result = await serviceRequestService.markIncomplete(id, tellerId, notes, userId);
  res.json(result);
}));

/** PUT /:id/reject — Reject with reason */
router.put('/:id/reject', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const reason = req.body.reason;
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });
  const userId = String(req.user?.id || 'unknown');
  const result = await serviceRequestService.rejectRequest(id, reason, userId);
  res.json(result);
}));

/** PUT /:id/reassign — Reassign RM (ops manager / admin) */
router.put('/:id/reassign', asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const { new_rm_id } = req.body;
  if (!new_rm_id) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'new_rm_id is required' } });
  }
  const userId = String(req.user?.id || 'unknown');
  const result = await serviceRequestService.reassignRM(id, new_rm_id, userId);
  res.json({ data: result });
}));

export default router;
