import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { degradedModeService } from '../../services/degraded-mode-service';

const router = Router();
router.use(requireBackOfficeRole());

router.get('/feed-health', asyncHandler(async (req: any, res: any) => {
  const health = degradedModeService.getFeedHealthStatus();
  res.json(health);
}));

router.get('/active', asyncHandler(async (req: any, res: any) => {
  const incidents = await degradedModeService.getActiveIncidents();
  res.json({ data: incidents, hasActiveIncident: incidents.length > 0 });
}));

router.get('/history', asyncHandler(async (req: any, res: any) => {
  const { page = '1', pageSize = '25' } = req.query;
  const result = await degradedModeService.getIncidentHistory({
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
  });
  res.json(result);
}));

router.get('/kpi/:year', asyncHandler(async (req: any, res: any) => {
  const year = parseInt(req.params.year);
  const result = await degradedModeService.getDegradedModeDays(year);
  res.json(result);
}));

router.post('/report', asyncHandler(async (req: any, res: any) => {
  const { failedComponent, fallbackPath, impactedEventIds } = req.body;
  if (!failedComponent || !fallbackPath) {
    return res.status(400).json({ error: 'Missing required fields: failedComponent, fallbackPath' });
  }
  const result = await degradedModeService.reportIncident(req.body);
  res.status(201).json(result);
}));

router.put('/:incidentId/resolve', asyncHandler(async (req: any, res: any) => {
  const result = await degradedModeService.resolveIncident(req.params.incidentId);
  res.json(result);
}));

router.put('/:incidentId/rca', asyncHandler(async (req: any, res: any) => {
  const result = await degradedModeService.completeRCA(req.params.incidentId);
  res.json(result);
}));

export default router;
