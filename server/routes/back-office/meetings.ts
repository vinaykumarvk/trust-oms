/**
 * Meeting Management Routes (CRM-MTG)
 */

import { Router } from 'express';
import { meetingService } from '../../services/meeting-service';
import { requireCRMRole } from '../../middleware/role-auth';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id)) throw new Error('Invalid ID');
  return id;
}

const router = Router();

// Get calendar data — enhanced with filters and pagination
router.get('/calendar', requireCRMRole(), async (req, res) => {
  try {
    const { start_date, end_date, startDate, endDate, status, reason, organizer, branch, search, page, pageSize } = req.query;
    const data = await meetingService.getFilteredCalendarData({
      startDate: (startDate || start_date) as string | undefined,
      endDate: (endDate || end_date) as string | undefined,
      meetingStatus: status as string | undefined,
      meetingReason: reason as string | undefined,
      organizerUserId: organizer ? (parseInt(organizer as string, 10) || undefined) : undefined,
      branchId: branch ? (parseInt(branch as string, 10) || undefined) : undefined,
      search: search as string | undefined,
      page: page ? (parseInt(page as string, 10) || 1) : undefined,
      pageSize: pageSize ? (parseInt(pageSize as string, 10) || undefined) : undefined,
    });
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get team calendar (SRM)
router.get('/team-calendar', requireCRMRole(), async (req, res) => {
  try {
    const { team_rm_ids, start_date, end_date } = req.query;
    if (!team_rm_ids || !start_date || !end_date) {
      return res.status(400).json({ error: 'team_rm_ids, start_date, end_date required' });
    }
    const rmIds = (team_rm_ids as string).split(',').map(Number);
    const data = await meetingService.getTeamCalendar(rmIds, start_date as string, end_date as string);
    res.json({ data });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark meeting as completed (FR-018)
router.patch('/:id/complete', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const data = await meetingService.complete(parseId(req.params.id), userId);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Cancel meeting
router.patch('/:id/cancel', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const callerRole: string | undefined = (req as any).user?.roles?.[0] ?? (req as any).userRole;
    const { cancel_reason } = req.body;
    const data = await meetingService.cancel(parseId(req.params.id), cancel_reason, userId, callerRole);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Also support POST for backward compatibility
router.post('/:id/cancel', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const callerRole: string | undefined = (req as any).user?.roles?.[0] ?? (req as any).userRole;
    const { cancel_reason } = req.body;
    const data = await meetingService.cancel(parseId(req.params.id), cancel_reason, userId, callerRole);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Reschedule meeting
router.patch('/:id/reschedule', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { start_time, end_time } = req.body;
    if (!start_time || !end_time) {
      return res.status(400).json({ error: 'start_time and end_time required' });
    }
    const data = await meetingService.reschedule(parseId(req.params.id), start_time, end_time, userId);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Update invitees
router.put('/:id/invitees', requireCRMRole(), async (req, res) => {
  try {
    const { invitees } = req.body;
    if (!Array.isArray(invitees)) {
      return res.status(400).json({ error: 'invitees array is required' });
    }
    const data = await meetingService.updateInvitees(parseId(req.params.id), invitees);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Get single meeting
router.get('/:id', requireCRMRole(), async (req, res) => {
  try {
    const data = await meetingService.getById(parseId(req.params.id));
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Create meeting
router.post('/', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { title, meeting_type, mode, purpose, start_time, end_time, location, notes, is_all_day, meeting_reason, meeting_reason_other, reminder_minutes, lead_id, prospect_id, client_id, invitees } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } });
    }
    if (!meeting_type || typeof meeting_type !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'meeting_type is required' } });
    }
    if (!start_time || !end_time) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'start_time and end_time are required' } });
    }
    if (!userId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authenticated user required' } });
    }

    const data = await meetingService.create({ title: title.trim(), meeting_type, mode, purpose, start_time, end_time, location, notes, is_all_day, meeting_reason, meeting_reason_other, reminder_minutes, lead_id, prospect_id, client_id, invitees, organizer_user_id: userId });
    res.status(201).json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

// Update meeting
router.patch('/:id', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    // SEC-09: userId must be present for IDOR check to run
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const data = await meetingService.update(parseId(req.params.id), req.body, userId);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

export default router;
