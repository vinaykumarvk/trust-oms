/**
 * Corporate Actions API Routes (Phase 3C)
 *
 * Provides endpoints for corporate action lifecycle management:
 * ingestion, entitlement calculation, election, tax treatment,
 * and position/cash adjustment posting.
 *
 *   GET    /                       -- List CAs (?status, type, page, pageSize)
 *   GET    /upcoming               -- Upcoming CAs (?days=30)
 *   POST   /                       -- Ingest CA
 *   GET    /:id/entitlements       -- Get entitlements for CA
 *   POST   /:id/calculate          -- Calculate entitlements for all portfolios
 *   POST   /entitlements/:id/elect -- Process election
 *   POST   /entitlements/:id/post  -- Post CA adjustment
 */

import { Router } from 'express';
import { corporateActionsService } from '../../services/corporate-actions-service';
import { asyncHandler } from '../../middleware/async-handler';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// ============================================================================
// Static routes (must be declared before parameterized routes)
// ============================================================================

/** GET /upcoming -- Upcoming corporate actions within N days */
router.get(
  '/upcoming',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const data = await corporateActionsService.getUpcomingCAs(days);
    res.json({ data });
  }),
);

/** GET / -- List corporate actions with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };
    const result = await corporateActionsService.getCorporateActions(filters);
    res.json(result);
  }),
);

/** POST / -- Ingest a new corporate action */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      securityId,
      type,
      exDate,
      recordDate,
      paymentDate,
      ratio,
      amountPerShare,
      electionDeadline,
      source,
    } = req.body;

    if (!securityId || !type || !exDate || !recordDate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message:
            'securityId, type, exDate, and recordDate are required',
        },
      });
    }

    const ca = await corporateActionsService.ingestCorporateAction({
      securityId,
      type,
      exDate,
      recordDate,
      paymentDate,
      ratio,
      amountPerShare,
      electionDeadline,
      source,
    });

    res.status(201).json({ data: ca });
  }),
);

// ============================================================================
// Entitlement sub-routes (before /:id to avoid conflict)
// ============================================================================

/** POST /entitlements/:id/elect -- Process election on an entitlement */
router.post(
  '/entitlements/:id/elect',
  asyncHandler(async (req, res) => {
    const entitlementId = parseInt(req.params.id, 10);
    if (isNaN(entitlementId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid entitlement ID' },
      });
    }

    const { option } = req.body;
    if (!option) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'option is required (CASH, REINVEST, TENDER, RIGHTS)',
        },
      });
    }

    const result = await corporateActionsService.processElection(
      entitlementId,
      option,
    );
    res.json({ data: result });
  }),
);

/** POST /entitlements/:id/post -- Post CA adjustment for an entitlement */
router.post(
  '/entitlements/:id/post',
  asyncHandler(async (req, res) => {
    const entitlementId = parseInt(req.params.id, 10);
    if (isNaN(entitlementId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid entitlement ID' },
      });
    }

    const result =
      await corporateActionsService.postCaAdjustment(entitlementId);
    res.json({ data: result });
  }),
);

// ============================================================================
// Parameterized CA routes
// ============================================================================

/** GET /:id/entitlements -- Get entitlements for a specific corporate action */
router.get(
  '/:id/entitlements',
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    const data = await corporateActionsService.getEntitlements(caId);
    res.json({ data });
  }),
);

/** POST /:id/calculate -- Calculate entitlements for all portfolios holding the security */
router.post(
  '/:id/calculate',
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    // Get the CA to find the security
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, caId))
      .limit(1);

    if (!ca) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Corporate action ${caId} not found`,
        },
      });
    }

    // Find all portfolios with positions in this security
    const positions = await db
      .select({ portfolio_id: schema.positions.portfolio_id })
      .from(schema.positions)
      .where(eq(schema.positions.security_id, ca.security_id!));

    const entitlements = [];
    const errors: Array<{ portfolioId: string | null; error: string }> = [];

    for (const pos of positions) {
      if (!pos.portfolio_id) continue;
      try {
        const entitlement =
          await corporateActionsService.calculateEntitlement(
            caId,
            pos.portfolio_id,
          );
        entitlements.push(entitlement);
      } catch (err: any) {
        errors.push({
          portfolioId: pos.portfolio_id,
          error: err.message,
        });
      }
    }

    res.status(201).json({
      data: {
        calculated: entitlements.length,
        errors: errors.length,
        entitlements,
        ...(errors.length > 0 ? { errorDetails: errors } : {}),
      },
    });
  }),
);

export default router;
