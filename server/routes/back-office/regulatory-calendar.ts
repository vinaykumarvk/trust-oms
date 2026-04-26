import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { regulatoryCalendarService } from '../../services/regulatory-calendar-service';

const router = Router();
router.use(requireBackOfficeRole());

/** GET / — list regulatory calendar entries with filters */
router.get('/', asyncHandler(async (req: any, res: any) => {
  const { status, jurisdiction_id, category, page, pageSize } = req.query;
  const result = await regulatoryCalendarService.getAll({
    status: status as string | undefined,
    jurisdiction_id: jurisdiction_id ? Number(jurisdiction_id) : undefined,
    category: category as string | undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

/** POST / — create a new regulatory calendar entry */
router.post('/', asyncHandler(async (req: any, res: any) => {
  const { title, description, regulatory_body, jurisdiction_id, effective_date, category, impact } = req.body;
  if (!title || !effective_date) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'title and effective_date are required' },
    });
  }
  const result = await regulatoryCalendarService.create({
    title,
    description,
    regulatory_body,
    jurisdiction_id,
    effective_date,
    category,
    impact,
  });
  res.status(201).json({ data: result });
}));

/** GET /upcoming — get upcoming regulatory items */
router.get('/upcoming', asyncHandler(async (req: any, res: any) => {
  const daysAhead = req.query.days_ahead ? Number(req.query.days_ahead) : 90;
  const data = await regulatoryCalendarService.getUpcoming(daysAhead);
  res.json({ data, total: data.length });
}));

/** GET /:id — get regulatory calendar entry by id */
router.get('/:id', asyncHandler(async (req: any, res: any) => {
  const result = await regulatoryCalendarService.getById(Number(req.params.id));
  res.json({ data: result });
}));

/** PUT /:id — update a regulatory calendar entry */
router.put('/:id', asyncHandler(async (req: any, res: any) => {
  const { title, description, regulatory_body, jurisdiction_id, effective_date, category, status, impact } = req.body;
  const result = await regulatoryCalendarService.update(Number(req.params.id), {
    title,
    description,
    regulatory_body,
    jurisdiction_id,
    effective_date,
    category,
    status,
    impact,
  });
  res.json({ data: result });
}));

/** POST /check-notifications — check for upcoming regulatory notifications */
router.post('/check-notifications', asyncHandler(async (req: any, res: any) => {
  const businessDate = req.body.business_date ? new Date(req.body.business_date) : new Date();
  const notifications = await regulatoryCalendarService.checkNotifications(businessDate);
  res.json({ data: notifications });
}));

export default router;
