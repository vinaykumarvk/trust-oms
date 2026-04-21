/**
 * TFP Payment API Routes (TrustFees Pro -- Phase 7)
 *
 * Endpoints:
 *   GET    /                      -- List payments with filters
 *   GET    /by-invoice/:invoiceId -- Payments for a specific invoice
 *   POST   /                      -- Capture payment
 *   POST   /:id/reverse           -- Reverse payment (body: { reason })
 */

import { Router } from 'express';
import { tfpPaymentService } from '../../services/tfp-payment-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List payments with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      payment_status: req.query.payment_status as string | undefined,
      invoice_id: req.query.invoice_id
        ? parseInt(req.query.invoice_id as string, 10)
        : undefined,
      payment_date_from: req.query.payment_date_from as string | undefined,
      payment_date_to: req.query.payment_date_to as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await tfpPaymentService.getPayments(filters);
    res.json(result);
  }),
);

/** GET /by-invoice/:invoiceId -- Payments for a specific invoice */
router.get(
  '/by-invoice/:invoiceId',
  asyncHandler(async (req: any, res: any) => {
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (isNaN(invoiceId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid invoice ID' },
      });
    }

    const result = await tfpPaymentService.getPaymentsForInvoice(invoiceId);
    res.json({ data: result });
  }),
);

// ============================================================================
// Payment Capture & Reversal
// ============================================================================

/** POST / -- Capture a payment */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const { invoice_id, amount, currency, payment_date, payment_method, reference_no } =
      req.body;

    // Validate required fields
    if (!invoice_id || !amount || !currency || !payment_date || !payment_method || !reference_no) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message:
            'Required fields: invoice_id, amount, currency, payment_date, payment_method, reference_no',
        },
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'amount must be a positive number',
        },
      });
    }

    try {
      const result = await tfpPaymentService.capturePayment({
        invoice_id,
        amount,
        currency,
        payment_date,
        payment_method,
        reference_no,
      });
      res.status(201).json({ data: result });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot record')) {
        return res.status(400).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /:id/reverse -- Reverse a payment */
router.post(
  '/:id/reverse',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid payment ID' },
      });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'reason is required for reversal',
        },
      });
    }

    try {
      const result = await tfpPaymentService.reversePayment(id, reason);
      res.json({ data: result });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      if (err.message?.includes('Cannot reverse')) {
        return res.status(400).json({
          error: { code: 'INVALID_STATUS', message: err.message },
        });
      }
      throw err;
    }
  }),
);

export default router;
