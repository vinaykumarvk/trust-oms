/**
 * Platform Feature Service Routes — Back Office
 *
 * Exposes precomputed entity features from the shared platform feature store.
 * Routes degrade gracefully when PLATFORM_FEATURE_SERVICE_URL is not set.
 *
 * Mount point: /api/v1/features (registered in back-office index)
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import {
  getEntityFeatures,
  getBatchEntityFeatures,
  getFeatureHistory,
  listFeatureDefinitions,
  triggerComputeRun,
  isPlatformAvailable,
} from '../../services/platform-feature-client';

const router = Router();

// ─── platform health ──────────────────────────────────────────────────────────

// GET /features/platform-status
// Returns whether the platform feature service is reachable.
router.get('/platform-status', requireBackOfficeRole(), async (_req, res) => {
  const available = await isPlatformAvailable();
  res.json({ available, configured: !!process.env.PLATFORM_FEATURE_SERVICE_URL });
});

// ─── feature definitions ──────────────────────────────────────────────────────

// GET /features/definitions?entity=portfolio&priority=P0
router.get('/definitions', requireBackOfficeRole(), async (req, res) => {
  try {
    const { entity, priority } = req.query as Record<string, string>;
    const definitions = await listFeatureDefinitions(entity, priority);
    res.json({ definitions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feature definitions' });
  }
});

// ─── single entity features ───────────────────────────────────────────────────

// GET /features/:entityType/:entityId
// e.g. GET /features/portfolio/PTF-001
// e.g. GET /features/client/CLT-001?features=portfolio.market_value_php,portfolio.return_ytd
router.get('/:entityType/:entityId', requireBackOfficeRole(), async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const featureIds = req.query.features
      ? (req.query.features as string).split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const features = await getEntityFeatures(entityType, entityId, featureIds);
    res.json({ entity_type: entityType, entity_id: entityId, features });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entity features' });
  }
});

// ─── feature history ──────────────────────────────────────────────────────────

// GET /features/:entityType/:entityId/history?feature_id=portfolio.return_ytd&from=2026-01-01&to=2026-04-27
router.get('/:entityType/:entityId/history', requireBackOfficeRole(), async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { feature_id, from, to } = req.query as Record<string, string>;

    if (!feature_id || !from || !to) {
      return res.status(400).json({ error: 'feature_id, from, and to are required' });
    }

    const history = await getFeatureHistory(
      entityType,
      entityId,
      feature_id,
      new Date(from),
      new Date(to),
    );

    res.json({ entity_type: entityType, entity_id: entityId, feature_id, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feature history' });
  }
});

// ─── batch entity features ────────────────────────────────────────────────────

// POST /features/batch
// Body: { entity_type: 'portfolio', entity_ids: ['PTF-001','PTF-002'], feature_ids?: [...] }
router.post('/batch', requireBackOfficeRole(), async (req, res) => {
  try {
    const { entity_type, entity_ids, feature_ids } = req.body as {
      entity_type: string;
      entity_ids:  string[];
      feature_ids?: string[];
    };

    if (!entity_type || !Array.isArray(entity_ids) || entity_ids.length === 0) {
      return res.status(400).json({ error: 'entity_type and entity_ids[] are required' });
    }

    if (entity_ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 entity IDs per batch request' });
    }

    const features = await getBatchEntityFeatures(entity_type, entity_ids, feature_ids);
    res.json({ entity_type, features });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch batch entity features' });
  }
});

// ─── admin: trigger compute ───────────────────────────────────────────────────

// POST /features/compute
// Body: { priority?: 'P0'|'P1'|'P2', entity_type?: string }
// Triggers an on-demand feature compute run (admin only).
router.post('/compute', requireBackOfficeRole(), async (req, res) => {
  try {
    const { priority = 'P0', entity_type } = req.body as {
      priority?:    'P0' | 'P1' | 'P2';
      entity_type?: string;
    };

    const result = await triggerComputeRun(priority, entity_type);

    if (!result) {
      return res.status(503).json({
        error: 'Platform feature service unavailable',
        configured: !!process.env.PLATFORM_FEATURE_SERVICE_URL,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger compute run' });
  }
});

export default router;
