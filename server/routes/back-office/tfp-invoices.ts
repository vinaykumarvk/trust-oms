/**
 * TFP Invoice API Routes (TrustFees Pro -- Phase 7)
 *
 * Endpoints:
 *   GET    /            -- List invoices with filters
 *   GET    /ageing      -- Ageing report
 *   GET    /summary     -- Invoice summary statistics
 *   GET    /:id         -- Invoice detail with lines and payments
 *   POST   /generate    -- Generate invoices (body: { period_from, period_to })
 *   POST   /:id/issue   -- Issue invoice (DRAFT -> ISSUED)
 *   POST   /mark-overdue -- Batch mark overdue invoices
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { tfpInvoiceService } from '../../services/tfp-invoice-service';
import { pdfInvoiceService } from '../../services/pdf-invoice-service';
import { asyncHandler } from '../../middleware/async-handler';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// List & Read
// ============================================================================

/** GET / -- List invoices with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      invoice_status: req.query.invoice_status as string | undefined,
      customer_id: req.query.customer_id as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      currency: req.query.currency as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await tfpInvoiceService.getInvoices(filters);
    res.json(result);
  }),
);

/** GET /ageing -- Ageing report */
router.get(
  '/ageing',
  asyncHandler(async (_req, res) => {
    const result = await tfpInvoiceService.getAgeing();
    res.json({ data: result });
  }),
);

/** GET /summary -- Invoice summary statistics */
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const result = await tfpInvoiceService.getSummary();
    res.json({ data: result });
  }),
);

/** GET /:id -- Invoice detail with lines and payments */
router.get(
  '/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid invoice ID' },
      });
    }

    try {
      const result = await tfpInvoiceService.getInvoiceDetail(id);
      res.json({ data: result });
    } catch (err) {
      const msg = safeErrorMessage(err);
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
// Invoice Generation & Lifecycle
// ============================================================================

/** POST /generate -- Generate invoices from OPEN accruals */
router.post(
  '/generate',
  asyncHandler(async (req: any, res: any) => {
    const { period_from, period_to } = req.body;

    if (!period_from || !period_to) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'period_from and period_to are required (format: YYYY-MM-DD)',
        },
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(period_from) || !dateRegex.test(period_to)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'period_from and period_to must be in YYYY-MM-DD format',
        },
      });
    }

    const result = await tfpInvoiceService.generateInvoices(period_from, period_to);
    res.json({ data: result });
  }),
);

/** POST /:id/issue -- Issue an invoice (DRAFT -> ISSUED) */
router.post(
  '/:id/issue',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid invoice ID' },
      });
    }

    try {
      const result = await tfpInvoiceService.issueInvoice(id);
      res.json({ data: result });
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      if (msg.includes('Cannot issue')) {
        return res.status(400).json({
          error: { code: 'INVALID_STATUS', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /mark-overdue -- Batch mark overdue invoices */
router.post(
  '/mark-overdue',
  asyncHandler(async (_req, res) => {
    const result = await tfpInvoiceService.markOverdue();
    res.json({ data: result });
  }),
);

/** GET /:id/pdf — Generate and download invoice PDF (GAP-A07) */
router.get(
  '/:id/pdf',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid invoice ID' } });
    }
    try {
      const pdfBuffer = await pdfInvoiceService.generateInvoicePdf(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${id}.pdf`);
      res.send(pdfBuffer);
    } catch (err) {
      const msg = safeErrorMessage(err);
      if (msg.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
      }
      throw err;
    }
  }),
);

export default router;
