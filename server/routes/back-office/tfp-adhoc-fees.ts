/**
 * TFP Ad-hoc Fee API Routes (TrustFees Pro -- Phase 7)
 *
 * Endpoints:
 *   GET    /  -- List ad-hoc fees
 *   POST   /  -- Capture ad-hoc fee
 */

import { Router } from 'express';
import { tfpAdhocFeeService } from '../../services/tfp-adhoc-fee-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// List & Capture
// ============================================================================

/** GET / -- List ad-hoc fees with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = {
      accrual_status: req.query.accrual_status as string | undefined,
      customer_id: req.query.customer_id as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : undefined,
    };

    const result = await tfpAdhocFeeService.getAdhocFees(filters);
    res.json(result);
  }),
);

/** POST / -- Capture an ad-hoc fee */
router.post(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const { customer_id, portfolio_id, fee_type, amount, currency, reason } = req.body;

    // Validate required fields
    if (!customer_id || !fee_type || !amount || !currency || !reason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Required fields: customer_id, fee_type, amount, currency, reason',
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
      const result = await tfpAdhocFeeService.captureAdhocFee({
        customer_id,
        portfolio_id,
        fee_type,
        amount,
        currency,
        reason,
      });
      res.status(201).json({ data: result });
    } catch (err: any) {
      if (err.message?.includes('No active fee plan')) {
        return res.status(400).json({
          error: { code: 'INVALID_STATE', message: err.message },
        });
      }
      throw err;
    }
  }),
);

export default router;
