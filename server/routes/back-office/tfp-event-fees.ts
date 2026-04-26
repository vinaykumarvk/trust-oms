/**
 * TFP Event Fee Routes (TrustFees Pro — BRD Gap C06)
 *
 * Endpoints for previewing and capturing event-based fees.
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { feePlanService } from '../../services/fee-plan-service';

const router = Router();
router.use(requireBackOfficeRole());

/** POST /preview — Preview event fee calculation */
router.post(
  '/preview',
  asyncHandler(async (req: any, res: any) => {
    const { fee_plan_id, transaction_amount, event_type } = req.body;
    if (!fee_plan_id) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Required: fee_plan_id' } });
    }
    const preview = await feePlanService.computePreview(fee_plan_id, {
      transaction_amount: transaction_amount ?? 0,
    });
    res.json({ data: { ...preview, event_type } });
  }),
);

/** POST /capture — Capture an event-based fee */
router.post(
  '/capture',
  asyncHandler(async (req: any, res: any) => {
    const { fee_plan_id, customer_id, portfolio_id, transaction_id, transaction_amount, event_type, currency } = req.body;
    if (!fee_plan_id || !customer_id || !transaction_amount) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Required: fee_plan_id, customer_id, transaction_amount' },
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const idempotencyKey = `EVENT:${fee_plan_id}:${customer_id}:${transaction_id ?? today}:${Date.now()}`;

    // Compute fee using preview
    const preview = await feePlanService.computePreview(fee_plan_id, {
      transaction_amount: transaction_amount ?? 0,
    });

    const appliedFee = Math.round(preview.computed_fee * 10000) / 10000;

    const [accrual] = await db
      .insert(schema.tfpAccruals)
      .values({
        fee_plan_id,
        customer_id,
        portfolio_id: portfolio_id ?? null,
        security_id: null,
        transaction_id: transaction_id ?? null,
        base_amount: String(transaction_amount),
        computed_fee: String(appliedFee),
        applied_fee: String(appliedFee),
        currency: currency ?? 'PHP',
        fx_rate_locked: null,
        accrual_date: today,
        accrual_status: 'OPEN',
        override_id: null,
        exception_id: null,
        idempotency_key: idempotencyKey,
      })
      .returning();

    res.status(201).json({ data: accrual });
  }),
);

export default router;
