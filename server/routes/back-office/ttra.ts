import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { ttraService } from '../../services/ttra-service';

const router = Router();

router.get('/summary', asyncHandler(async (req: any, res: any) => {
  const summary = await ttraService.getDashboardSummary();
  res.json(summary);
}));

router.get('/expiring', asyncHandler(async (req: any, res: any) => {
  const days = parseInt(req.query.days as string) || 60;
  const applications = await ttraService.getExpiringApplications(days);
  res.json({ data: applications, total: applications.length });
}));

router.get('/', asyncHandler(async (req: any, res: any) => {
  const { status, treaty_country, client_id, page = '1', pageSize = '25' } = req.query;
  const result = await ttraService.getApplications({
    status: status as string,
    treatyCountry: treaty_country as string,
    clientId: client_id as string,
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
  });
  res.json(result);
}));

router.get('/:id', asyncHandler(async (req: any, res: any) => {
  const app = await ttraService.getApplicationById(req.params.id);
  if (!app) return res.status(404).json({ error: 'TTRA application not found' });
  res.json(app);
}));

router.post('/', asyncHandler(async (req: any, res: any) => {
  const { clientId, treatyCountry, corDocumentRef, effectiveFrom, effectiveTo } = req.body;
  if (!clientId || !treatyCountry || !corDocumentRef || !effectiveFrom || !effectiveTo) {
    return res.status(400).json({ error: 'Missing required fields: clientId, treatyCountry, corDocumentRef, effectiveFrom, effectiveTo' });
  }
  const result = await ttraService.createApplication(req.body);
  res.status(201).json(result);
}));

router.put('/:id/status', asyncHandler(async (req: any, res: any) => {
  const { status, rulingNo } = req.body;
  if (!status) return res.status(400).json({ error: 'Missing required field: status' });
  const result = await ttraService.updateStatus(req.params.id, status, rulingNo);
  res.json(result);
}));

router.post('/batch/expiry-check', asyncHandler(async (req: any, res: any) => {
  const result = await ttraService.processExpiryFallback();
  res.json(result);
}));

router.post('/batch/reminders', asyncHandler(async (req: any, res: any) => {
  const result = await ttraService.sendExpiryReminders();
  res.json(result);
}));

export default router;
