/**
 * Handover & Assignment Management (HAM) Routes
 *
 * Phase 1: Core handover endpoints (entity lists, request CRUD, checklist, impact, RM list)
 * Phase 2: Authorization, delegation, bulk upload, batch operations (added later)
 * Phase 3: CSV exports, reversal workflow
 */

import { Router } from 'express';
import { requireBackOfficeRole, requireAnyRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { handoverService } from '../../services/handover-service';

function csvEscape(val: unknown): string {
  const s = val == null ? '' : String(val);
  // Prevent CSV injection — prefix dangerous characters
  const sanitized = /^[=+\-@|]/.test(s) ? `'${s}` : s;
  // Wrap in quotes if contains comma, quote, or newline
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, and, desc, count } from 'drizzle-orm';

const router = Router();
router.use(requireBackOfficeRole());

// ---------------------------------------------------------------------------
// Entity Lists — GET /leads, /prospects, /clients
// ---------------------------------------------------------------------------

router.get('/leads', asyncHandler(async (req: any, res: any) => {
  // HAM-GAP-008: location and language quick-filter params
  const { search, branch, location, language, page, pageSize } = req.query;
  const result = await handoverService.listEntities('lead', {
    search: search as string,
    branch: branch as string,
    location: location as string,
    language: language as string,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

router.get('/prospects', asyncHandler(async (req: any, res: any) => {
  // HAM-GAP-008: location and language quick-filter params
  const { search, branch, location, language, page, pageSize } = req.query;
  const result = await handoverService.listEntities('prospect', {
    search: search as string,
    branch: branch as string,
    location: location as string,
    language: language as string,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

router.get('/clients', asyncHandler(async (req: any, res: any) => {
  // HAM-GAP-008: clients don't have a leads/prospects table — location/language ignored gracefully
  const { search, branch, location, language, page, pageSize } = req.query;
  const result = await handoverService.listEntities('client', {
    search: search as string,
    branch: branch as string,
    location: location as string,
    language: language as string,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

// ---------------------------------------------------------------------------
// Create Handover Request — POST /request
// ---------------------------------------------------------------------------

router.post('/request', asyncHandler(async (req: any, res: any) => {
  const {
    entity_type, outgoing_rm_id, incoming_rm_id, incoming_srm_id,
    reason, branch_code, items, scrutiny_checklist,
  } = req.body;

  if (!entity_type || !outgoing_rm_id || !incoming_rm_id || !reason) {
    return res.status(400).json({ error: 'Missing required fields: entity_type, outgoing_rm_id, incoming_rm_id, reason' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const userId = req.userId || req.body.created_by || '1';
  const result = await handoverService.createHandoverRequest({
    entity_type,
    outgoing_rm_id: Number(outgoing_rm_id),
    incoming_rm_id: Number(incoming_rm_id),
    incoming_srm_id: incoming_srm_id ? Number(incoming_srm_id) : undefined,
    reason,
    branch_code: branch_code ?? undefined,
    items,
    scrutiny_checklist: scrutiny_checklist ?? [],
    created_by: userId,
  });

  res.status(201).json(result);
}));

// ---------------------------------------------------------------------------
// Get Handover Request by ID — GET /request/:id
// ---------------------------------------------------------------------------

router.get('/request/:id', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid request ID' });
  }
  const result = await handoverService.getHandoverRequest(id);
  if (!result) {
    return res.status(404).json({ error: 'Handover request not found' });
  }
  res.json(result);
}));

// ---------------------------------------------------------------------------
// Handover History / Audit Trail — GET /history
// ---------------------------------------------------------------------------

router.get('/history', asyncHandler(async (req: any, res: any) => {
  const { event_type, reference_type, dateFrom, dateTo, actor_id, entity_id, status, page, pageSize } = req.query;
  const result = await handoverService.getHandoverHistory({
    event_type: event_type as string,
    reference_type: reference_type as string,
    dateFrom: dateFrom as string,
    dateTo: dateTo as string,
    actor_id: actor_id ? Number(actor_id) : undefined,
    entity_id: entity_id ? Number(entity_id) : undefined,
    status: status as string | undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

// ---------------------------------------------------------------------------
// Scrutiny Checklist Configuration — GET /checklist-config
// ---------------------------------------------------------------------------

router.get('/checklist-config', asyncHandler(async (_req: any, res: any) => {
  const config = await handoverService.getChecklistConfig();
  res.json({ data: config });
}));

// ---------------------------------------------------------------------------
// Client Impact Assessment — GET /client-impact/:clientId
// ---------------------------------------------------------------------------

router.get('/client-impact/:clientId', asyncHandler(async (req: any, res: any) => {
  const result = await handoverService.getClientImpact(req.params.clientId);
  res.json(result);
}));

// ---------------------------------------------------------------------------
// RM List for Dropdowns — GET /rms
// ---------------------------------------------------------------------------

router.get('/rms', asyncHandler(async (req: any, res: any) => {
  const { search, branch, supervisor_id } = req.query;
  const rms = await handoverService.listRMs({
    search: search as string,
    branch: branch as string,
    supervisor_id: supervisor_id ? Number(supervisor_id) : undefined,
  });
  res.json({ data: rms });
}));

// ---------------------------------------------------------------------------
// Dashboard Summary — GET /dashboard
// ---------------------------------------------------------------------------

router.get('/dashboard', asyncHandler(async (_req: any, res: any) => {
  const summary = await handoverService.getDashboardSummary();
  res.json(summary);
}));

// ===========================================================================
// Phase 2 — Authorization Endpoints (Checker role)
// ===========================================================================

router.get('/pending', asyncHandler(async (req: any, res: any) => {
  const { entity_type, search, page, pageSize } = req.query;
  const result = await handoverService.getPendingRequests({
    entity_type: entity_type as string,
    search: search as string,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

router.post('/authorize/:id', requireAnyRole('BO_CHECKER', 'BO_HEAD'), asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const { version } = req.body;
  if (isNaN(id) || version === undefined) {
    return res.status(400).json({ error: 'Missing id or version' });
  }
  const checkerId = req.userId || req.body.checker_id || '0';
  const result = await handoverService.authorizeRequest(id, Number(version), String(Number(checkerId)));
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json(result);
}));

router.post('/reject/:id', requireAnyRole('BO_CHECKER', 'BO_HEAD'), asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const { version, reason } = req.body;
  if (isNaN(id) || version === undefined || !reason) {
    return res.status(400).json({ error: 'Missing id, version, or reason' });
  }
  const checkerId = req.userId || req.body.checker_id || '0';
  const result = await handoverService.rejectRequest(id, Number(version), String(Number(checkerId)), reason);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json(result);
}));

router.post('/batch-authorize', requireAnyRole('BO_CHECKER', 'BO_HEAD'), asyncHandler(async (req: any, res: any) => {
  const { request_ids, versions } = req.body;
  if (!Array.isArray(request_ids) || !Array.isArray(versions) || request_ids.length === 0) {
    return res.status(400).json({ error: 'Missing request_ids or versions arrays' });
  }
  if (request_ids.length !== versions.length) {
    return res.status(400).json({ error: 'request_ids and versions arrays must have the same length' });
  }
  if (request_ids.length > 100) {
    return res.status(400).json({ error: 'Batch size exceeds maximum of 100' });
  }
  const checkerId = req.userId || req.body.checker_id || '0';
  const result = await handoverService.batchAuthorize(
    request_ids.map(Number),
    versions.map(Number),
    String(Number(checkerId)),
  );
  res.json(result);
}));

router.post('/batch-reject', requireAnyRole('BO_CHECKER', 'BO_HEAD'), asyncHandler(async (req: any, res: any) => {
  const { request_ids, versions, reason } = req.body;
  if (!Array.isArray(request_ids) || !Array.isArray(versions) || !reason) {
    return res.status(400).json({ error: 'Missing request_ids, versions, or reason' });
  }
  if (request_ids.length !== versions.length) {
    return res.status(400).json({ error: 'request_ids and versions arrays must have the same length' });
  }
  if (request_ids.length > 100) {
    return res.status(400).json({ error: 'Batch size exceeds maximum of 100' });
  }
  const checkerId = req.userId || req.body.checker_id || '0';
  const result = await handoverService.batchReject(
    request_ids.map(Number),
    versions.map(Number),
    String(Number(checkerId)),
    reason,
  );
  res.json(result);
}));

router.patch('/request/:id', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid request ID' });
  }
  const makerId = req.userId || req.body.maker_id || '0';
  const result = await handoverService.amendRequest(id, req.body, String(makerId));
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json(result);
}));

// ===========================================================================
// Phase 2 — Delegation Endpoints
// ===========================================================================

router.get('/delegation/leads', asyncHandler(async (req: any, res: any) => {
  const { search, branch, page, pageSize } = req.query;
  const result = await handoverService.listDelegationEntities('lead', {
    search: search as string, branch: branch as string,
    page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

router.get('/delegation/prospects', asyncHandler(async (req: any, res: any) => {
  const { search, branch, page, pageSize } = req.query;
  const result = await handoverService.listDelegationEntities('prospect', {
    search: search as string, branch: branch as string,
    page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

router.get('/delegation/clients', asyncHandler(async (req: any, res: any) => {
  const { search, branch, page, pageSize } = req.query;
  const result = await handoverService.listDelegationEntities('client', {
    search: search as string, branch: branch as string,
    page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

router.post('/delegation/request', asyncHandler(async (req: any, res: any) => {
  const {
    delegation_type, outgoing_rm_id, delegate_rm_id, delegate_srm_id,
    branch_code, delegation_reason, start_date, end_date, items,
  } = req.body;

  if (!delegation_type || !outgoing_rm_id || !delegate_rm_id || !delegation_reason || !start_date || !end_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const userId = req.userId || req.body.created_by || '1';
  const result = await handoverService.createDelegation({
    delegation_type,
    outgoing_rm_id: Number(outgoing_rm_id),
    delegate_rm_id: Number(delegate_rm_id),
    delegate_srm_id: delegate_srm_id ? Number(delegate_srm_id) : undefined,
    branch_code,
    delegation_reason,
    start_date,
    end_date,
    items,
    created_by: userId,
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.status(201).json(result);
}));

router.get('/delegation/active', asyncHandler(async (req: any, res: any) => {
  const { delegation_type, rm_id, page, pageSize } = req.query;
  const result = await handoverService.getActiveDelegations({
    delegation_type: delegation_type as string,
    rm_id: rm_id ? Number(rm_id) : undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

router.post('/delegation/cancel/:id', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid delegation ID' });
  const userId = req.userId || req.body.cancelled_by || '0';
  const result = await handoverService.cancelDelegation(id, String(userId));
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json(result);
}));

router.get('/delegation/calendar', asyncHandler(async (req: any, res: any) => {
  const { from_date, to_date, rm_id, branch_code } = req.query;
  const result = await handoverService.getDelegationCalendar({
    from_date: from_date as string,
    to_date: to_date as string,
    rm_id: rm_id ? Number(rm_id) : undefined,
    branch_code: branch_code as string | undefined,
  });
  res.json(result);
}));

router.post('/delegation/extend/:id', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const { new_end_date, reason } = req.body;
  if (isNaN(id) || !new_end_date || !reason) {
    return res.status(400).json({ error: 'Missing id, new_end_date, or reason' });
  }
  const userId = req.userId || req.body.requested_by || '0';
  const result = await handoverService.extendDelegation(id, new_end_date, reason, String(userId));
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json(result);
}));

// ===========================================================================
// Phase 2 — Bulk Upload Endpoints
// ===========================================================================

router.post('/bulk-upload/preview', asyncHandler(async (req: any, res: any) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Missing rows array' });
  }
  const result = await handoverService.previewBulkUpload(rows);
  res.json(result);
}));

router.post('/bulk-upload', asyncHandler(async (req: any, res: any) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Missing rows array' });
  }
  // HAM-GAP-015: max 5000 rows per upload
  if (rows.length > 5000) {
    return res.status(400).json({ error: `Maximum 5,000 rows per upload. Received: ${rows.length}` });
  }
  // HAM-GAP-015: approximate 10MB check on serialised payload
  const payloadBytes = Buffer.byteLength(JSON.stringify(rows), 'utf8');
  if (payloadBytes > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Upload payload exceeds 10 MB limit' });
  }
  const userId = req.userId || req.body.uploader_id || '0';
  const result = await handoverService.processBulkUpload(rows, String(userId));
  res.json(result);
}));

router.get('/upload-log/:id', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid upload log ID' });
  const log = await handoverService.getUploadLog(id);
  if (!log) return res.status(404).json({ error: 'Upload log not found' });
  res.json({ data: log });
}));

// ---------------------------------------------------------------------------
// Notification endpoints — GET /notifications, PATCH /notifications/:id/read
// ---------------------------------------------------------------------------

router.get('/notifications', asyncHandler(async (req: any, res: any) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { unread_only, page = '1', pageSize = '20' } = req.query;

  const conditions = [eq(schema.handoverNotifications.recipient_user_id, Number(userId))];
  if (unread_only === 'true') {
    conditions.push(eq(schema.handoverNotifications.is_read, false));
  }

  const pageNum = Number(page);
  const size = Math.min(Number(pageSize), 100);

  const notifications = await db
    .select()
    .from(schema.handoverNotifications)
    .where(and(...conditions))
    .orderBy(desc(schema.handoverNotifications.created_at))
    .limit(size)
    .offset((pageNum - 1) * size);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.handoverNotifications)
    .where(and(...conditions));

  res.json({ data: notifications, total, page: pageNum, pageSize: size });
}));

router.patch('/notifications/mark-all-read', asyncHandler(async (req: any, res: any) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  await db
    .update(schema.handoverNotifications)
    .set({ is_read: true, updated_at: new Date(), updated_by: String(userId) })
    .where(
      and(
        eq(schema.handoverNotifications.recipient_user_id, Number(userId)),
        eq(schema.handoverNotifications.is_read, false),
      )
    );

  res.json({ success: true });
}));

router.patch('/notifications/:id/read', asyncHandler(async (req: any, res: any) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const notifId = Number(req.params.id);
  const [updated] = await db
    .update(schema.handoverNotifications)
    .set({ is_read: true, updated_at: new Date(), updated_by: String(userId) })
    .where(
      and(
        eq(schema.handoverNotifications.id, notifId),
        eq(schema.handoverNotifications.recipient_user_id, Number(userId)),
      )
    )
    .returning();

  if (!updated) return res.status(404).json({ error: 'Notification not found' });
  res.json({ data: updated });
}));

// ===========================================================================
// Phase 3 — CSV Export Endpoints
// ===========================================================================

router.get('/export/dashboard', requireAnyRole('BO_HEAD', 'BO_CHECKER'), asyncHandler(async (req: any, res: any) => {
  const { branch_code, from_date, to_date } = req.query;
  const summary = await handoverService.getDashboardSummary({
    branch_code: branch_code as string,
    from_date: from_date as string,
    to_date: to_date as string,
  });

  const rows = (summary.recent_handovers || []).map((h: any) => [
    csvEscape(h.handover_number),
    csvEscape(h.entity_type),
    csvEscape(h.status),
    csvEscape(h.outgoing_rm_name),
    csvEscape(h.incoming_rm_name),
    csvEscape(h.created_at),
    csvEscape(h.sla_deadline),
    csvEscape(h.sla_status),
  ].join(','));

  const header = 'Handover Number,Entity Type,Status,Outgoing RM,Incoming RM,Created At,SLA Deadline,SLA Status';
  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="handover-dashboard.csv"');
  res.send(csv);
}));

router.get('/export/audit-trail', requireAnyRole('BO_HEAD', 'BO_CHECKER'), asyncHandler(async (req: any, res: any) => {
  const { reference_type, from_date, to_date } = req.query;
  const result = await handoverService.getHandoverHistory({
    reference_type: reference_type as string,
    dateFrom: from_date as string,
    dateTo: to_date as string,
    page: 1,
    pageSize: 100, // capped at 100; for larger exports paginate client-side
  });

  const rows = (result.data || []).map((e: any) => [
    csvEscape(e.id),
    csvEscape(e.event_type),
    csvEscape(e.reference_type),
    csvEscape(e.reference_id),
    csvEscape(e.actor_id),
    csvEscape(e.actor_role),
    csvEscape(e.actor_name),
    csvEscape(e.created_at),
    csvEscape(JSON.stringify(e.details)),
  ].join(','));

  const header = 'ID,Event Type,Reference Type,Reference ID,Actor ID,Actor Role,Actor Name,Created At,Details';
  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="handover-audit-trail.csv"');
  res.send(csv);
}));

// ===========================================================================
// Phase 3 — Reversal Endpoints
// ===========================================================================

router.post('/request/:id/reversal', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { reason } = req.body;
  const result = await handoverService.initiateReversal(id, Number(userId), reason);
  if ((result as any).error) return res.status((result as any).status || 400).json({ error: (result as any).error });
  res.json(result);
}));

router.post('/request/:id/reversal/approve', requireAnyRole('BO_CHECKER', 'BO_HEAD'), asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await handoverService.approveReversal(id, Number(userId));
  if ((result as any).error) return res.status((result as any).status || 400).json({ error: (result as any).error });
  res.json(result);
}));

router.post('/request/:id/reversal/reject', requireAnyRole('BO_CHECKER', 'BO_HEAD'), asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { reason } = req.body;
  const result = await handoverService.rejectReversal(id, Number(userId), reason);
  if ((result as any).error) return res.status((result as any).status || 400).json({ error: (result as any).error });
  res.json(result);
}));

// ===========================================================================
// Phase 4: Submit / Cancel / Compliance Gates / Scrutiny / Audit / SLA
// ===========================================================================

// POST /request/:id/submit — DRAFT → PENDING_AUTH
router.post('/request/:id/submit', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const userId = Number(req.userId);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await handoverService.submitHandoverRequest(id, userId);
  if (!result.success) return res.status(result.status || 400).json({ error: result.error });
  res.json({ data: { success: true } });
}));

// POST /request/:id/cancel
router.post('/request/:id/cancel', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const userId = Number(req.userId);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason is required' });
  const result = await handoverService.cancelHandoverRequest(id, userId, reason);
  if (!result.success) return res.status(result.status || 400).json({ error: result.error });
  res.json({ data: { success: true } });
}));

// GET /request/:id/compliance-gates
router.get('/request/:id/compliance-gates', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const gates = await handoverService.getComplianceGates(id);
  res.json({ data: { gates } });
}));

// POST /request/:id/compliance-gates/run
router.post('/request/:id/compliance-gates/run', requireAnyRole('BO_CHECKER', 'BO_HEAD', 'COMPLIANCE_OFFICER'), asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const userId = Number(req.userId);
  const userRole = req.userRole ?? 'BO_CHECKER';
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await handoverService.runComplianceGates(id, userId, userRole);
  res.json({ data: result });
}));

// GET /request/:id/scrutiny
router.get('/request/:id/scrutiny', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const items = await handoverService.getScrutinyChecklist(id);
  res.json({ data: { items } });
}));

// PATCH /request/:id/scrutiny/:itemId
router.patch('/request/:id/scrutiny/:itemId', asyncHandler(async (req: any, res: any) => {
  const handoverId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const userId = Number(req.userId);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { status, remarks } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  const result = await handoverService.updateScrutinyItem(handoverId, itemId, userId, { status, remarks });
  if (!result.success) return res.status(result.status || 400).json({ error: result.error });
  res.json({ data: { success: true } });
}));

// GET /request/:id/audit
router.get('/request/:id/audit', asyncHandler(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const log = await handoverService.getAuditLog(id);
  res.json({ data: { log } });
}));

// GET /sla/breached
router.get('/sla/breached', requireAnyRole('BO_HEAD', 'COMPLIANCE_OFFICER', 'SYSTEM_ADMIN'), asyncHandler(async (req: any, res: any) => {
  const handovers = await handoverService.getSlaBreachedHandovers();
  res.json({ data: { handovers } });
}));

export default router;
