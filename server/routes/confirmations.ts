/**
 * Confirmation & Matching API Routes (Phase 2B)
 *
 * Provides endpoints for trade confirmation matching, exception management,
 * and bulk confirmation workflows.
 *
 *   GET    /                        -- Confirmation queue (status, page, pageSize, search)
 *   GET    /summary                 -- Summary counts by status
 *   GET    /exceptions              -- Exception queue with aging
 *   POST   /bulk-confirm            -- Bulk confirm (body: { confirmationIds, confirmedBy })
 *   POST   /:tradeId/match          -- Auto-match a trade (body: counterpartyData)
 *   POST   /:tradeId/exception      -- Flag exception (body: { reason })
 *   POST   /:id/resolve             -- Resolve exception (body: { action, resolvedBy, notes })
 */

import { Router } from 'express';
import { confirmationService } from '../services/confirmation-service';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// ============================================================================
// Static routes MUST come before parameterized routes to avoid shadowing
// ============================================================================

/** GET / -- Confirmation queue with filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await confirmationService.getConfirmationQueue({
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
      search: req.query.search as string | undefined,
    });
    res.json(result);
  }),
);

/** GET /summary -- Summary counts by status */
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const result = await confirmationService.getSummary();
    res.json({ data: result });
  }),
);

/** GET /exceptions -- Exception queue with aging */
router.get(
  '/exceptions',
  asyncHandler(async (req, res) => {
    const result = await confirmationService.getExceptions({
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** POST /bulk-confirm -- Bulk confirm matched items */
router.post(
  '/bulk-confirm',
  asyncHandler(async (req, res) => {
    const { confirmationIds, confirmedBy } = req.body;
    if (!confirmationIds || !Array.isArray(confirmationIds) || confirmationIds.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'confirmationIds array is required and must not be empty',
        },
      });
    }
    if (!confirmedBy) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'confirmedBy is required' },
      });
    }
    const result = await confirmationService.bulkConfirm(confirmationIds, confirmedBy);
    res.json({ data: result });
  }),
);

// ============================================================================
// Parameterized routes
// ============================================================================

/** POST /:tradeId/match -- Auto-match a trade against counterparty data */
router.post(
  '/:tradeId/match',
  asyncHandler(async (req, res) => {
    const { tradeId } = req.params;
    const { counterparty_ref, execution_price, execution_qty, settlement_date } = req.body;

    if (!counterparty_ref || execution_price === undefined || execution_qty === undefined) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'counterparty_ref, execution_price, and execution_qty are required',
        },
      });
    }

    const result = await confirmationService.autoMatch(tradeId, {
      counterparty_ref,
      execution_price: parseFloat(execution_price),
      execution_qty: parseFloat(execution_qty),
      settlement_date,
    });
    res.status(201).json({ data: result });
  }),
);

/** POST /:tradeId/exception -- Flag a trade as exception manually */
router.post(
  '/:tradeId/exception',
  asyncHandler(async (req, res) => {
    const { tradeId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }

    const result = await confirmationService.flagException(tradeId, reason);
    res.json({ data: result });
  }),
);

/** POST /:id/resolve -- Resolve an exception */
router.post(
  '/:id/resolve',
  asyncHandler(async (req, res) => {
    const confirmationId = parseInt(req.params.id);
    if (isNaN(confirmationId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid confirmation ID' },
      });
    }

    const { action, resolvedBy, notes } = req.body;
    if (!action || !['CONFIRM', 'REJECT', 'REMATCH'].includes(action)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'action must be CONFIRM, REJECT, or REMATCH',
        },
      });
    }
    if (!resolvedBy) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'resolvedBy is required' },
      });
    }

    const result = await confirmationService.resolveException(confirmationId, {
      action,
      resolvedBy,
      notes,
    });
    res.json({ data: result });
  }),
);

export default router;
