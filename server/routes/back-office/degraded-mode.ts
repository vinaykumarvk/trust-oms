import { Router } from 'express';
import { requireBackOfficeRole, requireAnyRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { degradedModeService, applyOverride, clearOverride } from '../../services/degraded-mode-service';
import { httpStatusFromError, safeErrorMessage, ValidationError, NotFoundError } from '../../services/service-errors';
import { logAuditEvent } from '../../services/audit-logger';

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
  const rawPage = parseInt(page as string, 10);
  const rawPageSize = parseInt(pageSize as string, 10);
  const result = await degradedModeService.getIncidentHistory({
    page: isNaN(rawPage) || rawPage < 1 ? 1 : rawPage,
    pageSize: isNaN(rawPageSize) || rawPageSize < 1 ? 25 : Math.min(rawPageSize, 200),
  });
  res.json(result);
}));

router.get('/kpi/:year', asyncHandler(async (req: any, res: any) => {
  const year = parseInt(req.params.year, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'year must be a valid 4-digit year' } });
  }
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

// -------------------------------------------------------------------------
// Feed override management (BO_HEAD and SYSTEM_ADMIN only)
// -------------------------------------------------------------------------

router.post(
  '/:feed/override',
  requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN'),
  asyncHandler(async (req: any, res: any) => {
    try {
      const feedName = req.params.feed as string;
      const { status, reason, expires_hours } = req.body as {
        status?: string;
        reason?: string;
        expires_hours?: number;
      };

      if (status !== 'OVERRIDE_UP' && status !== 'OVERRIDE_DOWN') {
        throw new ValidationError('status must be "OVERRIDE_UP" or "OVERRIDE_DOWN"');
      }
      if (typeof reason !== 'string' || reason.length < 10 || reason.length > 500) {
        throw new ValidationError('reason must be between 10 and 500 characters');
      }

      const userId = req.userId as number | undefined;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthenticated' });
      }

      const hours = typeof expires_hours === 'number' && expires_hours > 0 ? expires_hours : 24;
      const expiresAt = new Date(Date.now() + hours * 3_600_000);

      applyOverride(feedName, status, reason, expiresAt, userId);

      // Audit log — fire-and-forget
      void logAuditEvent({
        entityType: 'FEED',
        entityId: feedName,
        action: 'FEED_HEALTH_OVERRIDE',
        actorId: String(userId),
        actorRole: req.userRole,
        ipAddress: req.ip,
        correlationId: req.id,
        metadata: {
          override_status: status,
          reason,
          expires_at: expiresAt.toISOString(),
        },
      });

      return res.status(200).json({
        feed: feedName,
        status,
        reason,
        expiresAt: expiresAt.toISOString(),
        overrideBy: userId,
      });
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        return res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
      }
      // Map plain Error from applyOverride (feed not found)
      const message = err instanceof Error ? err.message : 'Internal server error';
      const isFeedNotFound = message.includes('not found in registry');
      return res.status(isFeedNotFound ? 404 : 500).json({ error: isFeedNotFound ? message : 'Internal server error' });
    }
  }),
);

router.post(
  '/:feed/clear-override',
  requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN'),
  asyncHandler(async (req: any, res: any) => {
    try {
      const feedName = req.params.feed as string;
      clearOverride(feedName);

      // Audit log — fire-and-forget
      const userId = req.userId as number | undefined;
      void logAuditEvent({
        entityType: 'FEED',
        entityId: feedName,
        action: 'FEED_HEALTH_OVERRIDE_CLEARED',
        actorId: userId ? String(userId) : undefined,
        actorRole: req.userRole,
        ipAddress: req.ip,
        correlationId: req.id,
        metadata: { feed: feedName },
      });

      return res.status(200).json({ feed: feedName, overrideCleared: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      const isFeedNotFound = message.includes('not found in registry');
      return res.status(isFeedNotFound ? 404 : 500).json({ error: isFeedNotFound ? message : 'Internal server error' });
    }
  }),
);

export default router;
