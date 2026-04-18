/**
 * Compliance Limits API Routes (Phase 3G)
 *
 * Provides endpoints for compliance limit management, pre-trade
 * order validation, validation overrides, and post-trade review.
 *
 * BDO RFI Gap #4 — Pre/Post-Trade Compliance Engine.
 *
 *   GET    /limits                         -- List limits with filters
 *   POST   /limits                         -- Upsert limit
 *   DELETE  /limits/:id                    -- Soft delete limit
 *   POST   /validate-order/:orderId        -- Run pre-trade validation
 *   GET    /overrides                      -- List validation overrides
 *   POST   /overrides                      -- Create override
 *   GET    /post-trade/review/:portfolioId -- Run post-trade review
 *   GET    /post-trade/expiring-lines      -- Expiring lines
 *   GET    /post-trade/breach-aging        -- Breach aging summary
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { requireRole } from '../../middleware/auth';
import { complianceLimitService } from '../../services/compliance-limit-service';
import { preTradeValidationService } from '../../services/pre-trade-validation-service';
import { postTradeComplianceService } from '../../services/post-trade-compliance-service';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const router = Router();

// ============================================================================
// Compliance Limits CRUD
// ============================================================================

/** GET /limits -- List limits with optional filters */
router.get(
  '/limits',
  asyncHandler(async (req, res) => {
    const filters = {
      limit_type: req.query.limit_type as string | undefined,
      dimension: req.query.dimension as string | undefined,
      is_active: req.query.is_active !== undefined
        ? req.query.is_active === 'true'
        : undefined,
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await complianceLimitService.getLimits(filters);
    res.json(result);
  }),
);

/** POST /limits -- Upsert a compliance limit */
router.post(
  '/limits',
  requireRole('COMPLIANCE_OFFICER', 'RISK_OFFICER'),
  asyncHandler(async (req, res) => {
    const {
      id,
      limit_type,
      dimension,
      dimension_id,
      limit_amount,
      current_exposure,
      warning_threshold_pct,
      is_active,
      effective_from,
      effective_to,
    } = req.body;

    if (!limit_type || !dimension || !limit_amount) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'limit_type, dimension, and limit_amount are required',
        },
      });
    }

    const result = await complianceLimitService.upsertLimit({
      id,
      limit_type,
      dimension,
      dimension_id,
      limit_amount,
      current_exposure,
      warning_threshold_pct,
      is_active,
      effective_from,
      effective_to,
    });

    res.status(id ? 200 : 201).json({ data: result });
  }),
);

/** DELETE /limits/:id -- Soft delete a compliance limit */
router.delete(
  '/limits/:id',
  requireRole('COMPLIANCE_OFFICER', 'RISK_OFFICER'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid limit ID' },
      });
    }

    const result = await complianceLimitService.deleteLimit(id);
    res.json({ data: result });
  }),
);

// ============================================================================
// Pre-Trade Validation
// ============================================================================

/** POST /validate-order/:orderId -- Run pre-trade validation on an order */
router.post(
  '/validate-order/:orderId',
  requireRole('COMPLIANCE_OFFICER', 'RISK_OFFICER'),
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'orderId is required' },
      });
    }

    const result = await preTradeValidationService.validateOrder(orderId);
    res.json({ data: result });
  }),
);

// ============================================================================
// Validation Overrides
// ============================================================================

/** GET /overrides -- List validation overrides with optional filters */
router.get(
  '/overrides',
  asyncHandler(async (req, res) => {
    const orderId = req.query.order_id as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = Math.min(
      req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25,
      100,
    );
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (orderId) {
      conditions.push(eq(schema.validationOverrides.order_id, orderId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.validationOverrides)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.validationOverrides.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.validationOverrides)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    res.json({ data, total, page, pageSize });
  }),
);

/** POST /overrides -- Create a validation override */
router.post(
  '/overrides',
  requireRole('COMPLIANCE_OFFICER', 'RISK_OFFICER'),
  asyncHandler(async (req, res) => {
    const {
      orderId,
      validationRule,
      severity,
      breachDescription,
      overrideJustification,
      overriddenBy,
    } = req.body;

    if (!orderId || !validationRule || !severity || !overriddenBy) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message:
            'orderId, validationRule, severity, and overriddenBy are required',
        },
      });
    }

    if (severity !== 'HARD' && severity !== 'SOFT') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'severity must be HARD or SOFT',
        },
      });
    }

    const [override] = await db
      .insert(schema.validationOverrides)
      .values({
        order_id: orderId,
        validation_rule: validationRule,
        severity: severity as 'HARD' | 'SOFT',
        breach_description: breachDescription,
        override_justification: overrideJustification,
        overridden_by: parseInt(overriddenBy, 10),
        overridden_at: new Date(),
      })
      .returning();

    res.status(201).json({ data: override });
  }),
);

// ============================================================================
// Post-Trade Compliance
// ============================================================================

/** GET /post-trade/review/:portfolioId -- Run post-trade review */
router.get(
  '/post-trade/review/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;

    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const result = await postTradeComplianceService.runPostTradeReview(portfolioId);
    res.json({ data: result });
  }),
);

/** GET /post-trade/expiring-lines -- Lines expiring within N days */
router.get(
  '/post-trade/expiring-lines',
  asyncHandler(async (req, res) => {
    const daysAhead = req.query.daysAhead
      ? parseInt(req.query.daysAhead as string, 10)
      : 30;

    const result = await postTradeComplianceService.getExpiringLines(daysAhead);
    res.json({ data: result });
  }),
);

/** GET /post-trade/breach-aging -- Breach aging summary */
router.get(
  '/post-trade/breach-aging',
  asyncHandler(async (req, res) => {
    const result = await postTradeComplianceService.getBreachAging();
    res.json({ data: result });
  }),
);

export default router;
