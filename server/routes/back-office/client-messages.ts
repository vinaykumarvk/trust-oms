/**
 * Back-Office Client Messages Routes (Phase 3A)
 *
 * GET  /                 — list all messages (BO view, no client scoping)
 * POST /:id/reply        — RM replies to an existing message
 */

import { Router } from 'express';
import { clientMessageService } from '../../services/client-message-service';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';

const router = Router();

// ---------------------------------------------------------------------------
// GET / — list all messages with optional filters (BO sees all)
// ---------------------------------------------------------------------------

router.get('/', requireBackOfficeRole(), async (req, res) => {
  try {
    const {
      client_id,
      is_read,
      status,
      sender_type,
      date_from,
      date_to,
      page,
      pageSize,
    } = req.query;

    // Support both `is_read` (boolean string) and `status` (unread/read/all) filter params
    let isReadFilter: boolean | undefined;
    if (is_read === 'true') {
      isReadFilter = true;
    } else if (is_read === 'false') {
      isReadFilter = false;
    } else if (status === 'unread') {
      isReadFilter = false;
    } else if (status === 'read') {
      isReadFilter = true;
    }

    const result = await clientMessageService.listAllForBO({
      client_id: client_id as string | undefined,
      is_read: isReadFilter,
      sender_type: sender_type as string | undefined,
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
      page: page ? (parseInt(page as string, 10) || 1) : undefined,
      pageSize: pageSize ? (parseInt(pageSize as string, 10) || undefined) : undefined,
    });

    res.json(result);
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/reply — RM replies to an existing message
// ---------------------------------------------------------------------------

router.post('/:id/reply', requireBackOfficeRole(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const { body } = req.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'body is required' } });
    }

    const senderId = (req as any).user?.id ?? (req as any).userId;
    if (!senderId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const reply = await clientMessageService.reply(id, Number(senderId), body);
    res.status(201).json({ data: reply });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

export default router;
