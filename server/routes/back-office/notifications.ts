/**
 * Notification Inbox Routes (CRM-NOTIF)
 */

import { Router } from 'express';
import { notificationInboxService } from '../../services/notification-inbox-service';
import { requireCRMRole } from '../../middleware/role-auth';

const router = Router();

// Get unread count
router.get('/unread-count', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const count = await notificationInboxService.getUnreadCount(userId);
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List notifications for current user
router.get('/', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const data = await notificationInboxService.listForUser(userId, page, pageSize);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark single notification as read
router.post('/:id/read', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const data = await notificationInboxService.markAsRead(parseInt(req.params.id), userId);
    res.json(data);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'An error occurred' });
  }
});

// Mark all as read
router.post('/mark-all-read', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    await notificationInboxService.markAllAsRead(userId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
