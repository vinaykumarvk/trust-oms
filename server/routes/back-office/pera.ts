/**
 * PERA Routes (Phase 3I)
 *
 * Personal Equity & Retirement Account — BSP-regulated.
 *
 *   GET    /accounts                    — List PERA accounts
 *   POST   /accounts/onboard            — Onboard contributor
 *   POST   /accounts/:id/contribute     — Process contribution
 *   POST   /accounts/:id/withdraw-q     — Qualified withdrawal
 *   POST   /accounts/:id/withdraw-uq    — Unqualified withdrawal
 *   POST   /accounts/:id/transfer-product   — Transfer to product
 *   POST   /accounts/:id/transfer-admin     — Transfer to administrator
 *   GET    /transactions                — List PERA transactions
 *   POST   /tcc                         — Process TCC
 *   GET    /bsp/contributor-file        — Generate BSP contributor file
 *   GET    /bsp/transaction-file        — Generate BSP transaction file
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { peraService } from '../../services/pera-service';

const router = Router();
router.use(requireBackOfficeRole());

// =============================================================================
// PERA Accounts
// =============================================================================

/** GET /accounts -- List PERA accounts */
router.get(
  '/accounts',
  asyncHandler(async (req, res) => {
    const result = await peraService.getAccounts({
      contributorId: req.query.contributorId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** POST /accounts/onboard -- Onboard a PERA contributor */
router.post(
  '/accounts/onboard',
  asyncHandler(async (req, res) => {
    const { contributorId, administrator, productId, tin } = req.body;

    if (!contributorId || !administrator || !productId || !tin) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'contributorId, administrator, productId, and tin are required',
        },
      });
    }

    const account = await peraService.onboardContributor({
      contributorId,
      administrator,
      productId,
      tin,
    });
    res.status(201).json(account);
  }),
);

/** POST /accounts/:id/contribute -- Process a PERA contribution */
router.post(
  '/accounts/:id/contribute',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid PERA account ID' },
      });
    }

    const { amount } = req.body;
    if (!amount) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'amount is required' },
      });
    }

    const result = await peraService.processContribution(id, parseFloat(amount));
    res.json(result);
  }),
);

/** POST /accounts/:id/withdraw-q -- Qualified withdrawal */
router.post(
  '/accounts/:id/withdraw-q',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid PERA account ID' },
      });
    }

    const result = await peraService.processQualifiedWithdrawal(id);
    res.json(result);
  }),
);

/** POST /accounts/:id/withdraw-uq -- Unqualified withdrawal */
router.post(
  '/accounts/:id/withdraw-uq',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid PERA account ID' },
      });
    }

    const penaltyPct = req.body.penaltyPct
      ? parseFloat(req.body.penaltyPct)
      : undefined;

    const result = await peraService.processUnqualifiedWithdrawal(id, penaltyPct);
    res.json(result);
  }),
);

/** POST /accounts/:id/transfer-product -- Transfer to another PERA product */
router.post(
  '/accounts/:id/transfer-product',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid PERA account ID' },
      });
    }

    const { targetProductId } = req.body;
    if (!targetProductId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'targetProductId is required' },
      });
    }

    const result = await peraService.transferToProduct(id, parseInt(targetProductId));
    res.json(result);
  }),
);

/** POST /accounts/:id/transfer-admin -- Transfer to another administrator */
router.post(
  '/accounts/:id/transfer-admin',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid PERA account ID' },
      });
    }

    const { targetAdmin } = req.body;
    if (!targetAdmin) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'targetAdmin is required' },
      });
    }

    const result = await peraService.transferToAdministrator(id, targetAdmin);
    res.json(result);
  }),
);

// =============================================================================
// PERA Transactions
// =============================================================================

/** GET /transactions -- List PERA transactions */
router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const peraAccountId = req.query.peraAccountId
      ? parseInt(req.query.peraAccountId as string)
      : undefined;

    if (!peraAccountId || isNaN(peraAccountId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'peraAccountId is required' },
      });
    }

    const result = await peraService.getTransactions(peraAccountId, {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

// =============================================================================
// TCC (Tax Clearance Certificate)
// =============================================================================

/** POST /tcc -- Process a TCC for a contributor */
router.post(
  '/tcc',
  asyncHandler(async (req, res) => {
    const { contributorId, tccRef } = req.body;

    if (!contributorId || !tccRef) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'contributorId and tccRef are required',
        },
      });
    }

    const result = await peraService.processTCC(contributorId, tccRef);
    res.json(result);
  }),
);

// =============================================================================
// BSP Reporting
// =============================================================================

/** GET /bsp/contributor-file -- Generate BSP contributor file */
router.get(
  '/bsp/contributor-file',
  asyncHandler(async (_req, res) => {
    const result = await peraService.generateBSPContributorFile();
    res.json({ data: result });
  }),
);

/** GET /bsp/transaction-file -- Generate BSP transaction file */
router.get(
  '/bsp/transaction-file',
  asyncHandler(async (_req, res) => {
    const result = await peraService.generateBSPTransactionFile();
    res.json({ data: result });
  }),
);

export default router;
