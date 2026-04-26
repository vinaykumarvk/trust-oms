/**
 * CRM Expense Routes (FR-020 — BRD Gap P0-01)
 *
 * GET    /              — List expenses (scoped to user or team)
 * POST   /              — Create expense (DRAFT)
 * GET    /:id           — Get expense detail
 * PATCH  /:id           — Update DRAFT expense
 * POST   /:id/submit    — Submit for approval
 * POST   /:id/approve   — Approve (supervisor only)
 * POST   /:id/reject    — Reject with reason (supervisor only)
 */

import { Router } from 'express';
import { requireCRMRole } from '../../middleware/role-auth';
import { expenseService } from '../../services/expense-service';
import { asyncHandler } from '../../middleware/async-handler';

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id)) throw new Error('Invalid ID');
  return id;
}

const router = Router();
router.use(requireCRMRole());

// ── List ──────────────────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const userId: number = req.user?.id ?? req.userId;
    const filters = {
      submitted_by: req.query.submitted_by
        ? parseInt(req.query.submitted_by as string, 10)
        : (req.query.all ? undefined : userId),
      expense_status: req.query.expense_status as string | undefined,
      call_report_id: req.query.call_report_id
        ? parseInt(req.query.call_report_id as string, 10)
        : undefined,
      meeting_id: req.query.meeting_id
        ? parseInt(req.query.meeting_id as string, 10)
        : undefined,
      branch_id: req.query.branch_id
        ? parseInt(req.query.branch_id as string, 10)
        : undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25,
    };
    const result = await expenseService.list(filters);
    res.json(result);
  }),
);

// ── Create ────────────────────────────────────────────────────────────────────

router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const userId: number = req.user?.id ?? req.userId;
    const { expense_type, amount, currency, expense_date, description, receipt_url,
            call_report_id, meeting_id, branch_id } = req.body;

    if (!expense_type || amount === undefined || !expense_date || !description) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Required: expense_type, amount, expense_date, description',
        },
      });
    }

    try {
      const expense = await expenseService.create({
        expense_type, amount, currency, expense_date, description, receipt_url,
        call_report_id, meeting_id, branch_id, submitted_by: userId,
      });
      res.status(201).json({ data: expense });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: msg } });
    }
  }),
);

// ── Get by ID ─────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    try {
      const expense = await expenseService.getById(parseId(req.params.id));
      res.json({ data: expense });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      throw err;
    }
  }),
);

// ── Update (DRAFT only) ───────────────────────────────────────────────────────

router.patch(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const userId: number = req.user?.id ?? req.userId;
    try {
      const expense = await expenseService.update(parseId(req.params.id), userId, req.body);
      res.json({ data: expense });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      if (msg.includes('Forbidden') || msg.includes('Cannot edit')) {
        return res.status(409).json({ error: { code: 'WORKFLOW_VIOLATION', message: msg } });
      }
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: msg } });
    }
  }),
);

// ── Submit ────────────────────────────────────────────────────────────────────

router.post(
  '/:id/submit',
  asyncHandler(async (req: any, res: any) => {
    const userId: number = req.user?.id ?? req.userId;
    try {
      const expense = await expenseService.submit(parseId(req.params.id), userId);
      res.json({ data: expense });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      if (msg.includes('Forbidden') || msg.includes('Cannot submit')) {
        return res.status(409).json({ error: { code: 'WORKFLOW_VIOLATION', message: msg } });
      }
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: msg } });
    }
  }),
);

// ── Approve (supervisor) ──────────────────────────────────────────────────────

router.post(
  '/:id/approve',
  asyncHandler(async (req: any, res: any) => {
    const userId: number = req.user?.id ?? req.userId;
    try {
      const expense = await expenseService.approve(parseId(req.params.id), userId);
      res.json({ data: expense });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      if (msg.includes('Cannot approve')) {
        return res.status(409).json({ error: { code: 'WORKFLOW_VIOLATION', message: msg } });
      }
      throw err;
    }
  }),
);

// ── Reject (supervisor) ───────────────────────────────────────────────────────

router.post(
  '/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const userId: number = req.user?.id ?? req.userId;
    const { reason } = req.body;
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'reason must be at least 5 characters' },
      });
    }
    try {
      const expense = await expenseService.reject(parseId(req.params.id), userId, String(reason));
      res.json({ data: expense });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      if (msg.includes('Cannot reject')) {
        return res.status(409).json({ error: { code: 'WORKFLOW_VIOLATION', message: msg } });
      }
      throw err;
    }
  }),
);

export default router;
