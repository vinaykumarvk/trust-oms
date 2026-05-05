/**
 * Contribution Routes (Phase 3F)
 *
 *   GET    /              — List contributions (?portfolioId, status, page, pageSize)
 *   POST   /              — Record contribution
 *   GET    /matching/unmatched — Contribution matching workbench queue
 *   POST   /matching/items — Ingest inbound cash/security item
 *   POST   /matching/run — Re-run contribution matching
 *   POST   /matching/items/:itemId/link — Link item to contribution
 *   POST   /matching/items/:itemId/resolve — Resolve unmatched item
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
    const { portfolioId, amount, currency, sourceAccount, type, externalReference } = req.body;

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
      externalReference,
    });
    res.status(201).json(contribution);
  }),
);

/** GET /matching/unmatched -- List unresolved inbound contribution items */
router.get(
  '/matching/unmatched',
  asyncHandler(async (req, res) => {
    const result = await contributionService.getUnmatchedContributionInventory({
      portfolioId: req.query.portfolioId as string | undefined,
      status: req.query.status as string | undefined,
      itemType: req.query.itemType as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    });
    res.json(result);
  }),
);

/** POST /matching/items -- Ingest an inbound cash/security contribution item */
router.post(
  '/matching/items',
  asyncHandler(async (req: any, res) => {
    const {
      itemType,
      portfolioId,
      trustAccountId,
      currency,
      amount,
      securityId,
      quantity,
      sourceAccount,
      externalReference,
      sourceSystem,
      sourcePayload,
      valueDate,
    } = req.body;

    if (!externalReference) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'externalReference is required' },
      });
    }

    const result = await contributionService.ingestContributionMatchItem({
      itemType,
      portfolioId,
      trustAccountId,
      currency,
      amount: amount === undefined ? undefined : parseFloat(String(amount)),
      securityId: securityId === undefined ? undefined : parseInt(String(securityId), 10),
      quantity: quantity === undefined ? undefined : parseFloat(String(quantity)),
      sourceAccount,
      externalReference,
      sourceSystem,
      sourcePayload,
      valueDate,
      actorId: req.userId ?? req.body.actorId,
    });
    res.status(201).json(result);
  }),
);

/** POST /matching/run -- Re-run matching for unresolved inbound items */
router.post(
  '/matching/run',
  asyncHandler(async (req: any, res) => {
    const result = await contributionService.runContributionMatching({
      limit: req.body.limit === undefined ? undefined : parseInt(String(req.body.limit), 10),
      actorId: req.userId ?? req.body.actorId,
    });
    res.json(result);
  }),
);

/** POST /matching/items/:itemId/link -- Link an inbound item to a contribution */
router.post(
  '/matching/items/:itemId/link',
  asyncHandler(async (req: any, res: any) => {
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid match item ID' },
      });
    }

    const contributionId = parseInt(String(req.body.contributionId), 10);
    if (!Number.isFinite(contributionId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'contributionId is required' },
      });
    }

    const result = await contributionService.linkContributionMatchItem(itemId, contributionId, {
      matchedBy: req.userId ?? req.body.matchedBy,
      notes: req.body.notes,
    });
    res.json(result);
  }),
);

/** POST /matching/items/:itemId/resolve -- Resolve an unmatched item without linking */
router.post(
  '/matching/items/:itemId/resolve',
  asyncHandler(async (req: any, res: any) => {
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid match item ID' },
      });
    }

    const { resolutionCode, resolutionNotes, resolutionEvidence } = req.body;
    if (!resolutionCode) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'resolutionCode is required' },
      });
    }

    const result = await contributionService.resolveContributionMatchItem(itemId, {
      resolutionCode,
      resolutionNotes,
      resolutionEvidence,
      resolvedBy: req.userId ?? req.body.resolvedBy,
    });
    res.json(result);
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
