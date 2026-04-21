/**
 * Withdrawal Routes (Phase 3F)
 *
 *   GET    /                    — List withdrawals (?portfolioId, status, page, pageSize)
 *   POST   /                    — Request withdrawal
 *   POST   /:id/calculate-tax   — Calculate withholding tax
 *   POST   /:id/approve         — Approve
 *   POST   /:id/execute         — Execute
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { withdrawalService } from '../../services/withdrawal-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

/** GET / -- List withdrawals with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await withdrawalService.getWithdrawals({
      portfolioId: req.query.portfolioId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** POST / -- Request a new withdrawal */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { portfolioId, amount, currency, destinationAccount, type } = req.body;

    if (!portfolioId || !amount || !currency || !destinationAccount || !type) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId, amount, currency, destinationAccount, and type are required',
        },
      });
    }

    const withdrawal = await withdrawalService.requestWithdrawal({
      portfolioId,
      amount: parseFloat(amount),
      currency,
      destinationAccount,
      type,
    });
    res.status(201).json(withdrawal);
  }),
);

/** POST /:id/calculate-tax -- Calculate withholding tax */
router.post(
  '/:id/calculate-tax',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid withdrawal ID' },
      });
    }

    const result = await withdrawalService.calculateWithholdingTax(id);
    res.json(result);
  }),
);

/** POST /:id/approve -- Approve a pending withdrawal */
router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid withdrawal ID' },
      });
    }

    const approvedBy = req.body.approvedBy ?? 1;
    const result = await withdrawalService.approveWithdrawal(id, approvedBy);
    res.json(result);
  }),
);

/** POST /:id/execute -- Execute an approved withdrawal */
router.post(
  '/:id/execute',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid withdrawal ID' },
      });
    }

    const result = await withdrawalService.executeWithdrawal(id);
    res.json(result);
  }),
);

export default router;
