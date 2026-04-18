/**
 * Kill-Switch API Routes (Phase 4B)
 *
 * Emergency trading halt endpoints. These are mounted at the top-level
 * routes directory (not back-office) because kill-switch actions are
 * time-critical and may be invoked outside normal back-office workflows.
 *
 *   POST   /                 -- Invoke kill switch
 *   GET    /active           -- Get active halts
 *   GET    /history          -- Get all halts (paginated)
 *   GET    /:id              -- Get single halt
 *   POST   /:id/resume       -- Resume trading (dual approval)
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { requireAnyRole } from '../middleware/role-auth';
import { killSwitchService } from '../services/kill-switch-service';

const router = Router();

// =============================================================================
// Invoke Kill Switch
// =============================================================================

/** POST / -- Invoke the kill switch to halt trading */
router.post(
  '/',
  requireAnyRole('CRO', 'CCO', 'HEAD_TRADER', 'COMPLIANCE_OFFICER'),
  asyncHandler(async (req, res) => {
    const { scope, reason } = req.body;

    if (!scope || !scope.type || !scope.value) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'scope with type and value is required',
        },
      });
    }

    if (!reason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'reason is required',
        },
      });
    }

    // Use authenticated identity from JWT — never trust client-supplied role
    const userIdNum = parseInt(req.userId || '0', 10) || 0;
    const halt = await killSwitchService.invokeKillSwitch({
      scope,
      reason,
      invokedBy: {
        userId: userIdNum,
        role: req.userRole!,
        mfaVerified: false, // TODO: MFA verification in Phase 0C
      },
    });

    // Attempt to cancel open orders for the halted scope
    const cancellation = await killSwitchService.cancelOpenOrders(scope);

    res.status(201).json({
      data: {
        halt,
        cancelledOrders: cancellation.cancelledCount,
      },
    });
  }),
);

// =============================================================================
// Query Halts
// =============================================================================

/** GET /active -- Get all currently active (non-resumed) halts */
router.get(
  '/active',
  asyncHandler(async (_req, res) => {
    const halts = await killSwitchService.getActiveHalts();
    res.json({ data: halts });
  }),
);

/** GET /history -- Get paginated history of all kill switch events */
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const filters = {
      page: req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await killSwitchService.getHistory(filters);
    res.json(result);
  }),
);

/** GET /:id -- Get a single halt record */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid halt ID' },
      });
    }

    const halt = await killSwitchService.getHalt(id);
    res.json({ data: halt });
  }),
);

// =============================================================================
// Resume Trading
// =============================================================================

/** POST /:id/resume -- Resume trading with dual approval */
router.post(
  '/:id/resume',
  requireAnyRole('CRO', 'CCO', 'HEAD_TRADER', 'COMPLIANCE_OFFICER'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid halt ID' },
      });
    }

    const { approvedBy } = req.body;

    if (!approvedBy || !approvedBy.userId1 || !approvedBy.userId2) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'approvedBy with userId1 and userId2 is required for dual approval',
        },
      });
    }

    if (approvedBy.userId1 === approvedBy.userId2) {
      return res.status(400).json({
        error: {
          code: 'DUAL_APPROVAL_REQUIRED',
          message: 'userId1 and userId2 must be different users for dual approval',
        },
      });
    }

    const result = await killSwitchService.resumeTrading(id, {
      userId1: approvedBy.userId1,
      userId2: approvedBy.userId2,
    });

    res.json({ data: result });
  }),
);

export default router;
