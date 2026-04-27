/**
 * Call Report Routes (CRM-CR)
 *
 * Basic CRUD and workflow routes for call reports.
 * Late-filing approval workflow is handled by cr-approvals routes.
 */

import { Router } from 'express';
import { callReportService } from '../../services/call-report-service';
import { requireCRMRole } from '../../middleware/role-auth';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id)) throw new Error('Invalid ID');
  return id;
}

const router = Router();

// Submit call report for approval (now requires userId for approval routing)
router.post('/:id/submit', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id ?? parseInt((req as any).userId, 10);
    if (!userId || isNaN(userId)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const callerRole = (req as any).user?.role as string | undefined;
    const data = await callReportService.submit(parseId(req.params.id), userId, callerRole);
    res.json(data);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Get single call report with action items
router.get('/:id', requireCRMRole(), async (req, res) => {
  try {
    const data = await callReportService.getById(parseId(req.params.id));
    res.json(data);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Create call report
router.post('/', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const data = await callReportService.create({ ...req.body, filed_by: userId });
    res.status(201).json(data);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Update call report (only DRAFT/RETURNED)
router.patch('/:id', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    // SEC-09: userId must be present for IDOR check to run
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const data = await callReportService.update(parseId(req.params.id), req.body, userId);
    res.json(data);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Search/list call reports with filters
router.get('/', requireCRMRole(), async (req, res) => {
  try {
    const filters = {
      reportStatus: req.query.reportStatus as string | undefined,
      reportType: req.query.reportType as string | undefined,
      filedBy: req.query.filedBy ? (parseInt(req.query.filedBy as string, 10) || undefined) : undefined,
      branchId: req.query.branchId ? (parseInt(req.query.branchId as string, 10) || undefined) : undefined,
      search: req.query.search as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };
    const data = await callReportService.getAll(filters);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── FR-011: Feedback (P0-02) ──────────────────────────────────────────────────

// GET /:id/feedback — list feedback (private entries filtered by requestor)
router.get('/:id/feedback', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id ?? parseInt((req as any).userId);
    const data = await callReportService.listFeedback(parseId(req.params.id), userId);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// POST /:id/feedback — add feedback (immutable once created; GAP-020: sentiment field)
router.post('/:id/feedback', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id ?? parseInt((req as any).userId);
    // GAP-017: source field — CALENDAR or CUSTOMER_DASHBOARD
    const { feedback_type, comment, is_private, sentiment, source } = req.body;
    if (!feedback_type || !comment) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Required: feedback_type, comment' },
      });
    }
    const validSources = ['CALENDAR', 'CUSTOMER_DASHBOARD'];
    if (source && !validSources.includes(source)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `source must be one of: ${validSources.join(', ')}` } });
    }
    const data = await callReportService.addFeedback(parseId(req.params.id), {
      feedback_by: userId, feedback_type, comment, is_private, sentiment, source,
    });
    res.status(201).json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// ── FR-012: Linked Chain (P0-03) ──────────────────────────────────────────────

// GET /:id/chain — get the full interaction chain for a call report
router.get('/:id/chain', requireCRMRole(), async (req, res) => {
  try {
    const data = await callReportService.getChain(parseId(req.params.id));
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// POST /:id/link-parent — link call report to a parent in the chain
router.post('/:id/link-parent', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id ?? parseInt((req as any).userId);
    const { parent_report_id } = req.body;
    if (!parent_report_id || typeof parent_report_id !== 'number') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Required: parent_report_id (number)' },
      });
    }
    const data = await callReportService.linkToParent(
      parseId(req.params.id), parent_report_id, userId,
    );
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// ── FR-010: Approval Queue (P1-02) ────────────────────────────────────────────

// GET /approval-queue — list reports awaiting supervisor review
router.get('/approval-queue', requireCRMRole(), async (req, res) => {
  try {
    const filters = {
      branch_id: req.query.branch_id ? parseInt(req.query.branch_id as string, 10) : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25,
    };
    const data = await callReportService.getApprovalQueue(filters);
    res.json(data);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// POST /:id/approve-queue — approve from queue with quality score (P0-04)
router.post('/:id/approve-queue', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id ?? parseInt((req as any).userId);
    const { quality_score, comments } = req.body;
    const data = await callReportService.approveFromQueue(parseId(req.params.id), userId, {
      quality_score, comments,
    });
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// POST /:id/reject-queue — reject or request info from queue (P0-08: UNDER_REVIEW / REJECTED)
router.post('/:id/reject-queue', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id ?? parseInt((req as any).userId);
    const { action, reason } = req.body;
    if (!action || !['REJECT', 'REQUEST_INFO'].includes(action)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'action must be REJECT or REQUEST_INFO' },
      });
    }
    if (!reason || String(reason).trim().length < 20) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'reason must be at least 20 characters' },
      });
    }
    const data = await callReportService.rejectFromQueue(
      parseId(req.params.id), userId, { action, reason },
    );
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// PATCH /action-items/:id — update action item status/notes (GAP-026: blocks re-open of COMPLETED)
router.patch('/action-items/:id', requireCRMRole(), async (req, res) => {
  try {
    const { action_status, completion_notes, due_date, priority } = req.body;
    const data = await callReportService.updateActionItem(parseId(req.params.id), {
      action_status, completion_notes, due_date, priority,
    });
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// GAP-021: Export call reports to CSV
router.get('/export', requireCRMRole(), async (req, res) => {
  try {
    const filters = {
      reportStatus: req.query.reportStatus as string | undefined,
      reportType: req.query.reportType as string | undefined,
      filedBy: req.query.filedBy ? (parseInt(req.query.filedBy as string, 10) || undefined) : undefined,
      branchId: req.query.branchId ? (parseInt(req.query.branchId as string, 10) || undefined) : undefined,
      search: req.query.search as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page: 1,
      pageSize: 5000, // max export rows
    };

    const { data } = await callReportService.getAll(filters);

    // Build CSV
    const headers = [
      'report_code', 'report_type', 'subject', 'meeting_date',
      'filed_by', 'report_status', 'days_since_meeting',
      'requires_supervisor_approval', 'branch_id', 'created_at',
      'transport_mode', 'transport_cost', 'from_location', 'to_location',
    ];

    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const rows = data.map((r: Record<string, unknown>) =>
      headers.map((h) => escape(r[h])).join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="call-reports-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
