/**
 * Notification System API Routes (Phase 5D)
 *
 * Provides endpoints for multi-channel notification dispatch, retrieval,
 * read-marking, and preference management.
 *
 *   GET    /api/v1/notifications                     -- List notifications (filtered)
 *   GET    /api/v1/notifications/:id                 -- Get single notification
 *   PUT    /api/v1/notifications/:id/read            -- Mark notification as read
 *   GET    /api/v1/notifications/preferences/:userId -- Get user preferences
 *   PUT    /api/v1/notifications/preferences/:userId -- Update user preferences
 *   POST   /api/v1/notifications/dispatch            -- Dispatch a notification
 *   POST   /api/v1/notifications/retry-failed        -- Retry all failed notifications
 */

import { Router } from 'express';
import { notificationService } from '../services/notification-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// --------------------------------------------------------------------------
// GET /preferences/:userId — must be registered BEFORE /:id to avoid clash
// --------------------------------------------------------------------------

/** GET /preferences/:userId — Get notification preferences for a user */
router.get('/preferences/:userId', asyncHandler(async (req, res) => {
  const prefs = notificationService.getPreferences(req.params.userId);
  res.json(prefs);
}));

/** PUT /preferences/:userId — Update notification preferences for a user */
router.put('/preferences/:userId', asyncHandler(async (req, res) => {
  const { email, sms, push, inApp } = req.body;
  const updated = notificationService.updatePreferences(req.params.userId, {
    email,
    sms,
    push,
    inApp,
  });
  res.json(updated);
}));

// --------------------------------------------------------------------------
// POST /dispatch — Dispatch a notification
// --------------------------------------------------------------------------

router.post('/dispatch', asyncHandler(async (req, res) => {
  const { eventType, channel, recipientId, recipientType, content } = req.body;

  if (!eventType || !channel || !recipientId || !content) {
    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'eventType, channel, recipientId, and content are required',
      },
    });
  }

  const result = await notificationService.dispatch({
    eventType,
    channel,
    recipientId,
    recipientType: recipientType ?? 'user',
    content,
  });

  res.status(201).json(result);
}));

// --------------------------------------------------------------------------
// POST /retry-failed — Retry all failed notifications
// --------------------------------------------------------------------------

router.post('/retry-failed', asyncHandler(async (_req, res) => {
  const result = await notificationService.retryFailed();
  res.json(result);
}));

// --------------------------------------------------------------------------
// GET / — List notifications for a recipient
// --------------------------------------------------------------------------

router.get('/', asyncHandler(async (req, res) => {
  const recipientId = req.query.recipientId as string;
  if (!recipientId) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'recipientId query param is required' },
    });
  }

  const result = await notificationService.getNotifications(recipientId, {
    channel: req.query.channel as any,
    status: req.query.status as string,
    unreadOnly: req.query.unreadOnly === 'true',
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 25,
  });

  res.json(result);
}));

// --------------------------------------------------------------------------
// GET /:id — Get a single notification
// --------------------------------------------------------------------------

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid notification id' } });
  }

  const notification = await notificationService.getById(id);
  if (!notification) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
  }

  res.json(notification);
}));

// --------------------------------------------------------------------------
// PUT /:id/read — Mark a notification as read
// --------------------------------------------------------------------------

router.put('/:id/read', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid notification id' } });
  }

  const updated = await notificationService.markAsRead(id);
  if (!updated) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
  }

  res.json(updated);
}));

export default router;
