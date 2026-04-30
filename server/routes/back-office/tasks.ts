/**
 * Task Management Routes (CRM-TASK)
 */

import { Router } from 'express';
import { taskManagementService } from '../../services/task-management-service';
import { requireCRMRole } from '../../middleware/role-auth';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'An error occurred';
}

const router = Router();

// List tasks
router.get('/', requireCRMRole(), async (req, res) => {
  try {
    const { assigned_to, task_status, priority, page, pageSize } = req.query;
    const data = await taskManagementService.list({
      assigned_to: assigned_to ? parseInt(assigned_to as string) : undefined,
      task_status: task_status as string,
      priority: priority as string,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined,
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get overdue tasks
router.get('/overdue', requireCRMRole(), async (req, res) => {
  try {
    const data = await taskManagementService.getOverdueTasks();
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single task
router.get('/:id', requireCRMRole(), async (req, res) => {
  try {
    const data = await taskManagementService.getById(parseInt(req.params.id));
    res.json(data);
  } catch (err: unknown) {
    res.status(404).json({ error: errMsg(err) });
  }
});

// Create task
router.post('/', requireCRMRole(), async (req, res) => {
  try {
    const user = (req as any).user;
    const userId = user?.id;
    const data = await taskManagementService.create({
      ...req.body,
      assigned_by: userId,
      assigned_by_role: user?.role ?? (req as any).userRole,
      assigned_by_branch_id: user?.branch_id ?? (req as any).userBranchId,
    });
    res.status(201).json(data);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

// Update task
router.patch('/:id', requireCRMRole(), async (req, res) => {
  try {
    const user = (req as any).user;
    const data = await taskManagementService.update(parseInt(req.params.id), {
      ...req.body,
      assigned_by: user?.id,
      assigned_by_role: user?.role ?? (req as any).userRole,
      assigned_by_branch_id: user?.branch_id ?? (req as any).userBranchId,
    });
    res.json(data);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

// Update task status
router.post('/:id/status', requireCRMRole(), async (req, res) => {
  try {
    const { status, completion_notes } = req.body;
    const data = await taskManagementService.updateStatus(parseInt(req.params.id), status, completion_notes);
    res.json(data);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
