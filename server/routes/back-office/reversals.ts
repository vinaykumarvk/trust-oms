/**
 * Reversal API Routes (Phase 3E)
 *
 * Provides endpoints for reversal case management:
 * request, approve, reject, execute, and queue listing.
 *
 *   GET    /              -- Reversal queue (?status, page, pageSize)
 *   POST   /              -- Request reversal
 *   GET    /:id           -- Get reversal case detail
 *   POST   /:id/approve   -- Approve (compliance)
 *   POST   /:id/reject    -- Reject (body: { reason })
 *   POST   /:id/execute   -- Execute reversal
 */

import { Router } from 'express';
import { reversalService } from '../../services/reversal-service';
import { asyncHandler } from '../../middleware/async-handler';
import { requireRole } from '../../middleware/auth';

const router = Router();

// ============================================================================
// Static routes
// ============================================================================

/** GET / -- Reversal queue */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const pageSize = req.query.pageSize
      ? parseInt(req.query.pageSize as string)
      : undefined;
    const result = await reversalService.getReversalQueue({
      status,
      page,
      pageSize,
    });
    res.json(result);
  }),
);

/** POST / -- Request a new reversal */
router.post(
  '/',
  requireRole('COMPLIANCE_OFFICER', 'OPERATIONS_HEAD'),
  asyncHandler(async (req, res) => {
    const { transactionId, reason, evidence, requestedBy } = req.body;
    if (!transactionId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'transactionId is required' },
      });
    }
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }
    if (!requestedBy) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'requestedBy (user id) is required' },
      });
    }
    const result = await reversalService.requestReversal({
      transactionId,
      reason,
      evidence,
      requestedBy: parseInt(requestedBy, 10),
    });
    res.status(201).json({ data: result });
  }),
);

// ============================================================================
// Parameterized routes
// ============================================================================

/** GET /:id -- Get reversal case detail */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid reversal case ID' },
      });
    }
    try {
      const result = await reversalService.getReversalCase(id);
      res.json({ data: result });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/approve -- Approve reversal */
router.post(
  '/:id/approve',
  requireRole('COMPLIANCE_OFFICER', 'OPERATIONS_HEAD'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid reversal case ID' },
      });
    }
    const { approvedBy } = req.body;
    if (!approvedBy) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'approvedBy (user id) is required' },
      });
    }
    try {
      const result = await reversalService.approveReversal(
        id,
        parseInt(approvedBy, 10),
      );
      res.json({ data: result });
    } catch (err: any) {
      if (err.message?.includes('Self-approval')) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: err.message },
        });
      }
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/reject -- Reject reversal */
router.post(
  '/:id/reject',
  requireRole('COMPLIANCE_OFFICER', 'OPERATIONS_HEAD'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid reversal case ID' },
      });
    }
    const { reason, rejectedBy } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }
    try {
      const result = await reversalService.rejectReversal(
        id,
        rejectedBy ? parseInt(rejectedBy, 10) : 0,
        reason,
      );
      res.json({ data: result });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/execute -- Execute reversal */
router.post(
  '/:id/execute',
  requireRole('COMPLIANCE_OFFICER', 'OPERATIONS_HEAD'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid reversal case ID' },
      });
    }
    try {
      const result = await reversalService.executeReversal(id);
      res.json({ data: result });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      throw err;
    }
  }),
);

export default router;
