/**
 * Notification Inbox Routes (CRM-NOTIF)
 */

import { Router } from 'express';
import { notificationInboxService } from '../../services/notification-inbox-service';
import { requireCRMRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError, ValidationError } from '../../services/service-errors';

const router = Router();

function currentUserId(req: any): number {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ValidationError('Authenticated user id is required');
  }
  return userId;
}

function notificationId(req: any): number {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid notification id');
  return id;
}

function notificationAuditContext(req: any) {
  return {
    actor_user_id: Number.isInteger(Number(req.user?.id)) ? Number(req.user.id) : null,
    actor_role: req.user?.role,
    ip_address: req.ip,
    correlation_id: req.headers['x-correlation-id']?.toString(),
    source_channel: 'BACK_OFFICE',
  };
}

// Get unread count
router.get('/unread-count', requireCRMRole(), async (req, res) => {
  try {
    const userId = currentUserId(req);
    const count = await notificationInboxService.getUnreadCount(userId);
    res.json({ count });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// List notifications for current user
router.get('/', requireCRMRole(), async (req, res) => {
  try {
    const userId = currentUserId(req);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const data = await notificationInboxService.listForUser(userId, page, pageSize);
    res.json(data);
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// Mark single notification as read
router.post('/:id/read', requireCRMRole(), async (req, res) => {
  try {
    const userId = currentUserId(req);
    const data = await notificationInboxService.markAsRead(notificationId(req), userId, notificationAuditContext(req));
    res.json(data);
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// Acknowledge a notification with optional operator notes
router.post('/:id/acknowledge', requireCRMRole(), async (req, res) => {
  try {
    const userId = currentUserId(req);
    const data = await notificationInboxService.acknowledge(notificationId(req), userId, {
      notes: req.body?.notes,
      audit: notificationAuditContext(req),
    });
    res.json(data);
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// Escalate a notification to another owner or team
router.post('/:id/escalate', requireCRMRole(), async (req, res) => {
  try {
    const userId = currentUserId(req);
    const data = await notificationInboxService.escalate(notificationId(req), userId, {
      escalation_user_id: req.body?.escalation_user_id,
      escalation_team: req.body?.escalation_team,
      reason: req.body?.reason,
      audit: notificationAuditContext(req),
    });
    res.json(data);
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// Close a notification with resolution evidence
router.post('/:id/close', requireCRMRole(), async (req, res) => {
  try {
    const userId = currentUserId(req);
    const data = await notificationInboxService.close(notificationId(req), userId, {
      evidence: req.body?.evidence ?? req.body,
      audit: notificationAuditContext(req),
    });
    res.json(data);
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// Mark all as read
router.post('/mark-all-read', requireCRMRole(), async (req, res) => {
  try {
    const userId = currentUserId(req);
    await notificationInboxService.markAllAsRead(userId, notificationAuditContext(req));
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

export default router;
