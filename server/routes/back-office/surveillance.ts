/**
 * Trade Surveillance API Routes (Phase 4B)
 *
 * Provides endpoints for trade surveillance pattern evaluation,
 * alert management, alert disposition, and RM anomaly scoring.
 *
 *   POST   /evaluate              -- Evaluate a pattern on an order
 *   GET    /alerts                -- List alerts with filters
 *   GET    /alerts/:id            -- Get single alert
 *   POST   /alerts/:id/disposition -- Disposition an alert
 *   POST   /anomaly-score         -- Score an RM's anomaly
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { requireRole } from '../../middleware/auth';
import { surveillanceService } from '../../services/surveillance-service';
import { fraudDetectionService } from '../../services/fraud-detection-service';

const router = Router();
router.use(requireBackOfficeRole());

// =============================================================================
// Pattern Evaluation
// =============================================================================

/** POST /evaluate -- Evaluate a surveillance pattern against an order */
router.post(
  '/evaluate',
  requireRole('COMPLIANCE_OFFICER', 'SURVEILLANCE_OFFICER'),
  asyncHandler(async (req, res) => {
    const { orderId, pattern } = req.body;

    if (!orderId || !pattern) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'orderId and pattern are required',
        },
      });
    }

    const validPatterns = ['LAYERING', 'SPOOFING', 'WASH_TRADING', 'FRONT_RUNNING'];
    if (!validPatterns.includes(pattern)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `pattern must be one of: ${validPatterns.join(', ')}`,
        },
      });
    }

    const result = await surveillanceService.evaluatePattern(orderId, pattern);
    res.json({ data: result });
  }),
);

// =============================================================================
// Alert Management
// =============================================================================

/** GET /alerts -- List surveillance alerts with optional filters */
router.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const filters = {
      pattern: req.query.pattern as string | undefined,
      disposition: req.query.disposition as string | undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await surveillanceService.getAlerts(filters);
    res.json(result);
  }),
);

/** GET /alerts/:id -- Get a single surveillance alert */
router.get(
  '/alerts/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid alert ID' },
      });
    }

    const alert = await surveillanceService.getAlert(id);
    res.json({ data: alert });
  }),
);

/** POST /alerts/:id/disposition -- Disposition a surveillance alert */
router.post(
  '/alerts/:id/disposition',
  requireRole('COMPLIANCE_OFFICER', 'SURVEILLANCE_OFFICER'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid alert ID' },
      });
    }

    const { decision, analystId } = req.body;

    if (!decision || !analystId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'decision and analystId are required',
        },
      });
    }

    const validDecisions = ['FALSE_POSITIVE', 'INVESTIGATE', 'ESCALATE'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `decision must be one of: ${validDecisions.join(', ')}`,
        },
      });
    }

    const result = await surveillanceService.dispositionAlert(
      id,
      decision,
      parseInt(analystId, 10),
    );

    res.json({ data: result });
  }),
);

// =============================================================================
// Anomaly Scoring
// =============================================================================

/** POST /anomaly-score -- Compute anomaly score for an RM */
router.post(
  '/anomaly-score',
  requireRole('COMPLIANCE_OFFICER', 'SURVEILLANCE_OFFICER'),
  asyncHandler(async (req, res) => {
    const { rmId } = req.body;

    if (!rmId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'rmId is required',
        },
      });
    }

    const result = await surveillanceService.scoreAnomaly(parseInt(rmId, 10));
    res.json({ data: result });
  }),
);

// =============================================================================
// FR-AID-001/002: ML-Ready Fraud Detection
// =============================================================================

/** POST /fraud/score -- Score an order for fraud risk (ensemble: heuristic + ML) */
router.post(
  '/fraud/score',
  requireRole('COMPLIANCE_OFFICER', 'SURVEILLANCE_OFFICER'),
  asyncHandler(async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'orderId is required' },
      });
    }

    const result = await fraudDetectionService.scoreOrder(orderId);
    res.json({ data: result });
  }),
);

/** POST /fraud/features -- Extract fraud features for an order (explainability) */
router.post(
  '/fraud/features',
  requireRole('COMPLIANCE_OFFICER', 'SURVEILLANCE_OFFICER'),
  asyncHandler(async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'orderId is required' },
      });
    }

    const features = await fraudDetectionService.extractFeatures(orderId);
    res.json({ data: features });
  }),
);

/** GET /fraud/config -- Get current fraud detection ensemble configuration */
router.get(
  '/fraud/config',
  asyncHandler(async (_req, res) => {
    const config = fraudDetectionService.getConfig();
    res.json({ data: config });
  }),
);

export default router;
