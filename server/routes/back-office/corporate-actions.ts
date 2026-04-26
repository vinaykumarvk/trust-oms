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
import { requireBackOfficeRole, requireAnyRole, requireCARole, denyBusinessApproval } from '../../middleware/role-auth';
import { corporateActionsService } from '../../services/corporate-actions-service';
import { asyncHandler } from '../../middleware/async-handler';
import { requireApproval } from '../../middleware/maker-checker';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// Static routes (must be declared before parameterized routes)
// ============================================================================

/** GET /summary -- Corporate actions summary */
router.get('/summary', asyncHandler(async (req: any, res: any) => {
  const summary = await corporateActionsService.getSummary();
  res.json(summary);
}));

/** GET /history -- Corporate actions history */
router.get('/history', asyncHandler(async (req: any, res: any) => {
  const { from, to, type, status, page = '1', pageSize = '25' } = req.query;
  const history = await corporateActionsService.getHistory({
    from: from as string,
    to: to as string,
    type: type as string,
    status: status as string,
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
  });
  res.json(history);
}));

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
  requireApproval('corporate_actions'),
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
      calendarKey,
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
      calendarKey,
    });

    res.status(201).json({ data: ca });
  }),
);

// ============================================================================
// Entitlement sub-routes (before /:id to avoid conflict)
// ============================================================================

/** POST /entitlements/:id/elect -- Process election (requires BO_CHECKER or BO_HEAD) */
router.post(
  '/entitlements/:id/elect',
  requireAnyRole('BO_CHECKER', 'BO_HEAD'),
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

/** POST /entitlements/:id/post -- Post CA adjustment (requires BO_CHECKER or BO_HEAD) */
router.post(
  '/entitlements/:id/post',
  requireAnyRole('BO_CHECKER', 'BO_HEAD'),
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
// Parameterized CA routes — lifecycle actions (before generic /:id)
// ============================================================================

/** PUT /:id/scrub -- Scrub a corporate action (validate fields + cross-reference security) */
router.put(
  '/:id/scrub',
  requireApproval('corporate_actions'),
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    try {
      const result = await corporateActionsService.scrubEvent(caId);
      res.json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Scrub failed';
      return res.status(400).json({
        error: { code: 'SCRUB_FAILED', message },
      });
    }
  }),
);

/** PUT /:id/golden-copy -- Promote a scrubbed CA to golden copy */
router.put(
  '/:id/golden-copy',
  requireApproval('corporate_actions'),
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    try {
      const result = await corporateActionsService.goldenCopy(caId);
      res.json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Golden copy promotion failed';
      return res.status(400).json({
        error: { code: 'GOLDEN_COPY_FAILED', message },
      });
    }
  }),
);

/** POST /:id/simulate -- Simulate entitlement (read-only, no maker-checker) */
router.post(
  '/:id/simulate',
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    const { portfolioId } = req.body;
    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    try {
      const result = await corporateActionsService.simulateEntitlement(caId, portfolioId);
      res.json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Simulation failed';
      return res.status(400).json({
        error: { code: 'SIMULATION_FAILED', message },
      });
    }
  }),
);

// ============================================================================
// Amendment, Cancellation, Replay & Settlement Override (Phase 3C+)
// ============================================================================

/** PUT /:id/amend -- Amend a corporate action event */
router.put(
  '/:id/amend',
  denyBusinessApproval(),
  requireCARole(),
  requireApproval('corporate_actions'),
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    const { exDate, recordDate, paymentDate, ratio, amountPerShare, electionDeadline, source, type } = req.body;
    const userId = (req as any).userId ?? 'unknown';

    try {
      const result = await corporateActionsService.amendEvent(
        caId,
        { exDate, recordDate, paymentDate, ratio, amountPerShare, electionDeadline, source, type },
        userId,
      );
      res.json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Amendment failed';
      return res.status(400).json({
        error: { code: 'AMEND_FAILED', message },
      });
    }
  }),
);

/** POST /:id/cancel -- Cancel a corporate action event */
router.post(
  '/:id/cancel',
  denyBusinessApproval(),
  requireCARole(),
  requireApproval('corporate_actions'),
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Cancellation reason is required' },
      });
    }

    const userId = (req as any).userId ?? 'unknown';

    try {
      const result = await corporateActionsService.cancelEvent(caId, reason, userId);
      res.json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cancellation failed';
      return res.status(400).json({
        error: { code: 'CANCEL_FAILED', message },
      });
    }
  }),
);

/** POST /:id/replay -- Replay entitlement calculation from golden copy */
router.post(
  '/:id/replay',
  requireCARole(),
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    try {
      const result = await corporateActionsService.replayEvent(caId);
      res.json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Replay failed';
      return res.status(400).json({
        error: { code: 'REPLAY_FAILED', message },
      });
    }
  }),
);

/** PUT /:id/settlement-date -- Override the settlement/payment date */
router.put(
  '/:id/settlement-date',
  denyBusinessApproval(),
  requireCARole(),
  requireApproval('corporate_actions'),
  asyncHandler(async (req, res) => {
    const caId = parseInt(req.params.id, 10);
    if (isNaN(caId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid corporate action ID' },
      });
    }

    const { newDate, reason } = req.body;
    if (!newDate || !reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'newDate and reason are required' },
      });
    }

    try {
      const result = await corporateActionsService.overrideSettlementDate(caId, newDate, reason);
      res.json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Settlement date override failed';
      return res.status(400).json({
        error: { code: 'SETTLEMENT_OVERRIDE_FAILED', message },
      });
    }
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
  requireApproval('corporate_actions'),
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
      } catch (err) {
        errors.push({
          portfolioId: pos.portfolio_id,
          error: err instanceof Error ? err.message : String(err),
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
