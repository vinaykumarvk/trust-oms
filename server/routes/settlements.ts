/**
 * Settlement & Cash Ledger API Routes (Phase 3A)
 *
 * Provides endpoints for settlement lifecycle, cash ledger operations,
 * and liquidity management.
 *
 *   GET    /                                -- Settlement queue (?status, page, pageSize)
 *   GET    /cut-offs                        -- Today's cut-off times
 *   POST   /bulk-settle                     -- Bulk settle (body: { counterparty?, currency?, valueDate? })
 *   GET    /cash-ledger/liquidity-heatmap   -- Liquidity heat-map (T/T+1/T+2)
 *   GET    /cash-ledger/:portfolioId        -- Cash ledger for portfolio (?currency, startDate, endDate)
 *   POST   /:confirmationId/initiate        -- Initialize settlement from confirmation
 *   POST   /:id/settle                      -- Mark settled
 *   POST   /:id/fail                        -- Mark failed (body: { reason })
 *   POST   /:id/retry                       -- Retry failed settlement
 */

import { Router } from 'express';
import { settlementService } from '../services/settlement-service';
import { cashLedgerService } from '../services/cash-ledger-service';
import { asyncHandler } from '../middleware/async-handler';
import { requireBackOfficeRole } from '../middleware/role-auth';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// Static routes MUST come before parameterized routes to avoid shadowing
// ============================================================================

/** GET / -- Settlement queue with filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await settlementService.getSettlementQueue({
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** GET /cut-offs -- Today's cut-off times */
router.get(
  '/cut-offs',
  asyncHandler(async (_req, res) => {
    const cutOffs = settlementService.getCutOffs();
    res.json({ data: cutOffs });
  }),
);

/** POST /bulk-settle -- Bulk settle matching settlements */
router.post(
  '/bulk-settle',
  asyncHandler(async (req, res) => {
    const { counterparty, currency, valueDate } = req.body;
    const result = await settlementService.bulkSettle({
      counterparty,
      currency,
      valueDate,
    });
    res.json({ data: result });
  }),
);

/** GET /cash-ledger/liquidity-heatmap -- Liquidity heat-map (T/T+1/T+2) */
router.get(
  '/cash-ledger/liquidity-heatmap',
  asyncHandler(async (_req, res) => {
    const heatmap = await cashLedgerService.getLiquidityHeatMap();
    res.json({ data: heatmap });
  }),
);

/** GET /cash-ledger/:portfolioId -- Cash ledger for a portfolio */
router.get(
  '/cash-ledger/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const currency = req.query.currency as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined;

    // Get balances
    const balances = await cashLedgerService.getBalance(portfolioId, currency);

    // Get transactions
    const transactions = await cashLedgerService.getTransactions(portfolioId, {
      startDate,
      endDate,
      page,
      pageSize,
    });

    res.json({
      data: {
        balances,
        transactions: transactions.data,
      },
      pagination: {
        page: transactions.page,
        pageSize: transactions.pageSize,
        total: transactions.total,
      },
    });
  }),
);

// ============================================================================
// Parameterized routes
// ============================================================================

/** POST /:confirmationId/initiate -- Initialize settlement from a confirmed trade */
router.post(
  '/:confirmationId/initiate',
  asyncHandler(async (req, res) => {
    const confirmationId = parseInt(req.params.confirmationId);
    if (isNaN(confirmationId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid confirmation ID' },
      });
    }

    const settlement = await settlementService.initializeSettlement(confirmationId);
    res.status(201).json({ data: settlement });
  }),
);

/** POST /:id/settle -- Mark settlement as settled */
router.post(
  '/:id/settle',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid settlement ID' },
      });
    }

    const result = await settlementService.markSettled(id);
    res.json({ data: result });
  }),
);

/** POST /:id/fail -- Mark settlement as failed */
router.post(
  '/:id/fail',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid settlement ID' },
      });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }

    const result = await settlementService.markFailed(id, reason);
    res.json({ data: result });
  }),
);

/** POST /:id/retry -- Retry a failed settlement */
router.post(
  '/:id/retry',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid settlement ID' },
      });
    }

    const result = await settlementService.retrySettlement(id);
    res.json({ data: result });
  }),
);

export default router;
