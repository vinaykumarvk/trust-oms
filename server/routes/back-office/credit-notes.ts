/**
 * Credit Note Routes (TrustFees Pro -- Phase 9)
 *
 *   GET    /              -- List credit notes (query: cn_status, related_invoice_id, date_from, date_to, search, page, pageSize)
 *   GET    /:id           -- Single credit note with invoice details
 *   POST   /              -- Issue credit note (body: { invoice_id, amount, currency, reason_code })
 *   POST   /:id/apply     -- Apply credit note
 *   POST   /:id/cancel    -- Cancel credit note
 */

import { Router } from 'express';
import { creditNoteService } from '../../services/credit-note-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List credit notes with filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      cn_status: req.query.cn_status as string | undefined,
      related_invoice_id: req.query.related_invoice_id
        ? parseInt(req.query.related_invoice_id as string, 10)
        : undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    };

    const result = await creditNoteService.getCreditNotes(filters);
    res.json(result);
  }),
);

/** GET /:id -- Single credit note */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid credit note ID' },
      });
    }

    try {
      const record = await creditNoteService.getCreditNoteById(id);
      res.json({ data: record });
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

// ============================================================================
// Create & Actions
// ============================================================================

/** POST / -- Issue a credit note */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const { invoice_id, amount, currency, reason_code } = req.body;

    if (!invoice_id || !amount || !currency || !reason_code) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'invoice_id, amount, currency, and reason_code are required',
        },
      });
    }

    try {
      const record = await creditNoteService.issueCreditNote(
        invoice_id,
        parseFloat(amount),
        currency,
        reason_code,
      );
      res.status(201).json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('must be positive') || err.message?.includes('exceeds')) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/apply -- Apply credit note */
router.post(
  '/:id/apply',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid credit note ID' },
      });
    }

    try {
      const record = await creditNoteService.applyCreditNote(id);
      res.json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot apply')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/cancel -- Cancel credit note */
router.post(
  '/:id/cancel',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid credit note ID' },
      });
    }

    try {
      const record = await creditNoteService.cancelCreditNote(id);
      res.json({ data: record });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot cancel')) {
        return res.status(422).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

export default router;
