/**
 * Dispute Routes (TrustFees Pro -- Phase 9)
 *
 *   GET    /              -- List disputes (query: dispute_status, customer_id, date_from, date_to, search, page, pageSize)
 *   GET    /:id           -- Single dispute with invoice + credit notes
 *   POST   /              -- Raise dispute (body: { invoice_id, reason })
 *   POST   /:id/investigate -- Start investigation
 *   POST   /:id/resolve   -- Resolve (body: { resolution, refund_amount? })
 *   POST   /:id/reject    -- Reject (body: { reason })
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { disputeService } from '../../services/dispute-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List disputes with filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      dispute_status: req.query.dispute_status as string | undefined,
      customer_id: req.query.customer_id as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    };

    const result = await disputeService.getDisputes(filters);
    res.json(result);
  }),
);

/** GET /:id -- Single dispute with full details */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid dispute ID' },
      });
    }

    try {
      const record = await disputeService.getDisputeById(id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

// ============================================================================
// Create & Actions
// ============================================================================

/** POST / -- Raise a dispute */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const { invoice_id, reason } = req.body;

    if (!invoice_id || !reason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'invoice_id and reason are required',
        },
      });
    }

    // Use the authenticated user or a default
    const raisedBy = (req as any).user?.username ?? req.body.raised_by ?? 'system';

    try {
      const record = await disputeService.raiseDispute(invoice_id, raisedBy, reason);
      res.status(201).json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot dispute')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/investigate -- Start investigation */
router.post(
  '/:id/investigate',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid dispute ID' },
      });
    }

    try {
      const record = await disputeService.investigate(id);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot investigate')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/resolve -- Resolve dispute with optional refund */
router.post(
  '/:id/resolve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid dispute ID' },
      });
    }

    const { resolution, refund_amount } = req.body;
    if (!resolution) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'resolution is required' },
      });
    }

    try {
      const record = await disputeService.resolve(
        id,
        resolution,
        refund_amount ? parseFloat(refund_amount) : undefined,
      );
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot resolve')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      if (msg.includes('exceeds')) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/reject -- Reject dispute */
router.post(
  '/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid dispute ID' },
      });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }

    try {
      const record = await disputeService.rejectDispute(id, reason);
      res.json({ data: record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot reject')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

export default router;
