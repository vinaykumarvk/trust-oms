/**
 * Contribution Routes (Phase 3F)
 *
 *   GET    /              — List contributions (?portfolioId, status, page, pageSize)
 *   POST   /              — Record contribution
 *   POST   /:id/approve   — Approve
 *   POST   /:id/post      — Post to cash ledger
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { contributionService } from '../../services/contribution-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

/** GET / -- List contributions with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await contributionService.getContributions({
      portfolioId: req.query.portfolioId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** POST / -- Record a new contribution */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { portfolioId, amount, currency, sourceAccount, type } = req.body;

    if (!portfolioId || !amount || !currency || !sourceAccount || !type) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId, amount, currency, sourceAccount, and type are required',
        },
      });
    }

    const contribution = await contributionService.recordContribution({
      portfolioId,
      amount: parseFloat(amount),
      currency,
      sourceAccount,
      type,
    });
    res.status(201).json(contribution);
  }),
);

/** POST /:id/approve -- Approve a pending contribution */
router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid contribution ID' },
      });
    }

    const approvedBy = req.body.approvedBy ?? 1;
    const signerPartyIds = Array.isArray(req.body.signerPartyIds)
      ? req.body.signerPartyIds.map((value: unknown) => parseInt(String(value), 10)).filter(Number.isFinite)
      : [];
    const result = await contributionService.approveContribution(id, approvedBy, signerPartyIds);
    res.json(result);
  }),
);

/** POST /:id/post -- Post an approved contribution to the cash ledger */
router.post(
  '/:id/post',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid contribution ID' },
      });
    }

    const result = await contributionService.postContribution(id);
    res.json(result);
  }),
);

export default router;
