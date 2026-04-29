/**
 * Transfer Routes (Phase 3F)
 *
 *   GET    /              — List transfers (?status, page, pageSize)
 *   POST   /              — Initiate transfer
 *   POST   /:id/approve   — Approve
 *   POST   /:id/execute   — Execute
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { transferService } from '../../services/transfer-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

/** GET / -- List transfers with optional filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await transferService.getTransfers({
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** POST / -- Initiate a new transfer */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { fromPortfolioId, toPortfolioId, securityId, quantity, type } = req.body;

    if (!fromPortfolioId || !toPortfolioId || !securityId || !quantity || !type) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'fromPortfolioId, toPortfolioId, securityId, quantity, and type are required',
        },
      });
    }

    const transfer = await transferService.initiateTransfer({
      fromPortfolioId,
      toPortfolioId,
      securityId: parseInt(securityId),
      quantity: parseFloat(quantity),
      type,
    });
    res.status(201).json(transfer);
  }),
);

/** POST /:id/approve -- Approve a pending transfer */
router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid transfer ID' },
      });
    }

    const approvedBy = req.body.approvedBy ?? 1;
    const result = await transferService.approveTransfer(id, approvedBy);
    res.json(result);
  }),
);

/** POST /:id/execute -- Execute an approved transfer */
router.post(
  '/:id/execute',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid transfer ID' },
      });
    }

    const result = await transferService.executeTransfer(id);
    res.json(result);
  }),
);

// =============================================================================
// FR-TRF-008: External Trustee Bank Transfers (SWIFT)
// =============================================================================

/** POST /external — Initiate an external inter-custodian transfer */
router.post(
  '/external',
  asyncHandler(async (req, res) => {
    const { fromPortfolioId, externalCustodian, securityId, quantity } = req.body;

    if (!fromPortfolioId || !externalCustodian || !securityId || !quantity) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message:
            'fromPortfolioId, externalCustodian (bic, account), securityId, and quantity are required',
        },
      });
    }

    if (!externalCustodian.bic || !externalCustodian.account) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'externalCustodian must include bic and account fields',
        },
      });
    }

    const result = await transferService.initiateExternalTransfer({
      fromPortfolioId,
      externalCustodian,
      securityId: parseInt(securityId),
      quantity: parseFloat(quantity),
    });
    res.status(201).json(result);
  }),
);

/** POST /:id/confirm-external — Confirm external transfer on custodian settlement */
router.post(
  '/:id/confirm-external',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid transfer ID' },
      });
    }

    const { custodianRef, confirmedBy } = req.body;
    const result = await transferService.confirmExternalTransfer(id, {
      custodianRef,
      confirmedBy: confirmedBy ? parseInt(confirmedBy) : undefined,
    });
    res.json(result);
  }),
);

export default router;
