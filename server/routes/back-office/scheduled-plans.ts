/**
 * Scheduled Plans Routes (Phase 3I)
 *
 * EIP / ERP / Standing Instructions endpoints.
 *
 *   GET    /eip                  — List EIP plans
 *   GET    /eip/dashboard        — EIP dashboard
 *   POST   /eip/enroll           — Enroll EIP
 *   POST   /eip/:id/modify       — Modify EIP
 *   POST   /eip/:id/unsubscribe  — Unsubscribe EIP
 *   POST   /eip/:id/auto-debit   — Process auto-debit
 *
 *   GET    /erp                  — List ERP plans
 *   POST   /erp/enroll           — Enroll ERP
 *   POST   /erp/:id/unsubscribe  — Unsubscribe ERP
 *   POST   /erp/:id/auto-credit  — Process auto-credit
 *
 *   GET    /instructions         — List standing instructions
 *   GET    /instructions/due     — Get due instructions
 *   POST   /instructions         — Create instruction
 *   POST   /instructions/:id/modify       — Modify instruction
 *   POST   /instructions/:id/deactivate   — Deactivate instruction
 *   POST   /instructions/pre-terminate    — Pre-terminate by account
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { eipService } from '../../services/eip-service';
import { erpService } from '../../services/erp-service';
import { standingInstructionsService } from '../../services/standing-instructions-service';

const router = Router();

// =============================================================================
// EIP (Equity Investment Plan)
// =============================================================================

/** GET /eip -- List EIP plans */
router.get(
  '/eip',
  asyncHandler(async (req, res) => {
    const result = await eipService.getEIPPlans({
      clientId: req.query.clientId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** GET /eip/dashboard -- EIP dashboard */
router.get(
  '/eip/dashboard',
  asyncHandler(async (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    const result = await eipService.getEIPDashboard(clientId);
    res.json({ data: result });
  }),
);

/** POST /eip/enroll -- Enroll a new EIP */
router.post(
  '/eip/enroll',
  asyncHandler(async (req, res) => {
    const { clientId, portfolioId, productId, amount, frequency, caAccount } = req.body;

    if (!clientId || !portfolioId || !productId || !amount || !frequency || !caAccount) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'clientId, portfolioId, productId, amount, frequency, and caAccount are required',
        },
      });
    }

    const plan = await eipService.enrollEIP({
      clientId,
      portfolioId,
      productId: parseInt(productId),
      amount: parseFloat(amount),
      frequency,
      caAccount,
    });
    res.status(201).json(plan);
  }),
);

/** POST /eip/:id/modify -- Modify an EIP */
router.post(
  '/eip/:id/modify',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid plan ID' },
      });
    }

    const result = await eipService.modifyEIP(id, req.body);
    res.json(result);
  }),
);

/** POST /eip/:id/unsubscribe -- Unsubscribe from an EIP */
router.post(
  '/eip/:id/unsubscribe',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid plan ID' },
      });
    }

    const result = await eipService.unsubscribeEIP(id, req.body.reason);
    res.json(result);
  }),
);

/** POST /eip/:id/auto-debit -- Process auto-debit for an EIP */
router.post(
  '/eip/:id/auto-debit',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid plan ID' },
      });
    }

    const result = await eipService.processAutoDebit(id);
    res.json(result);
  }),
);

// =============================================================================
// ERP (Equity Redemption Plan)
// =============================================================================

/** GET /erp -- List ERP plans */
router.get(
  '/erp',
  asyncHandler(async (req, res) => {
    const result = await erpService.getERPPlans({
      clientId: req.query.clientId as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** POST /erp/enroll -- Enroll a new ERP */
router.post(
  '/erp/enroll',
  asyncHandler(async (req, res) => {
    const { clientId, portfolioId, amount, frequency, caAccount } = req.body;

    if (!clientId || !portfolioId || !amount || !frequency || !caAccount) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'clientId, portfolioId, amount, frequency, and caAccount are required',
        },
      });
    }

    const plan = await erpService.enrollERP({
      clientId,
      portfolioId,
      amount: parseFloat(amount),
      frequency,
      caAccount,
    });
    res.status(201).json(plan);
  }),
);

/** POST /erp/:id/unsubscribe -- Unsubscribe from an ERP */
router.post(
  '/erp/:id/unsubscribe',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid plan ID' },
      });
    }

    const result = await erpService.unsubscribeERP(id);
    res.json(result);
  }),
);

/** POST /erp/:id/auto-credit -- Process auto-credit for an ERP */
router.post(
  '/erp/:id/auto-credit',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid plan ID' },
      });
    }

    const result = await erpService.processAutoCredit(id);
    res.json(result);
  }),
);

// =============================================================================
// Standing Instructions (IMA/TA)
// =============================================================================

/** GET /instructions -- List standing instructions */
router.get(
  '/instructions',
  asyncHandler(async (req, res) => {
    const result = await standingInstructionsService.getInstructions({
      portfolioId: req.query.portfolioId as string | undefined,
      type: req.query.type as string | undefined,
      isActive: req.query.activeOnly === 'true' ? true : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
    });
    res.json(result);
  }),
);

/** GET /instructions/due -- Get instructions due for execution */
router.get(
  '/instructions/due',
  asyncHandler(async (req, res) => {
    const date = req.query.date as string | undefined;
    const result = await standingInstructionsService.getDueInstructions(date);
    res.json({ data: result });
  }),
);

/** POST /instructions -- Create a standing instruction */
router.post(
  '/instructions',
  asyncHandler(async (req, res) => {
    const { portfolioId, accountId, type, params } = req.body;

    if (!portfolioId || !type || !params) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'portfolioId, type, and params are required',
        },
      });
    }

    const validTypes = ['AUTO_ROLL', 'AUTO_CREDIT', 'AUTO_WITHDRAWAL'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: `type must be one of: ${validTypes.join(', ')}`,
        },
      });
    }

    const instruction = await standingInstructionsService.createInstruction({
      portfolioId,
      accountId,
      type,
      params,
    });
    res.status(201).json(instruction);
  }),
);

/** POST /instructions/:id/modify -- Modify a standing instruction */
router.post(
  '/instructions/:id/modify',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid instruction ID' },
      });
    }

    const result = await standingInstructionsService.modifyInstruction(id, req.body);
    res.json(result);
  }),
);

/** POST /instructions/:id/deactivate -- Deactivate a standing instruction */
router.post(
  '/instructions/:id/deactivate',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid instruction ID' },
      });
    }

    const result = await standingInstructionsService.deactivateInstruction(id);
    res.json(result);
  }),
);

/** POST /instructions/pre-terminate -- Pre-terminate instructions for an account */
router.post(
  '/instructions/pre-terminate',
  asyncHandler(async (req, res) => {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'accountId is required',
        },
      });
    }

    const result = await standingInstructionsService.processPreTermination(accountId);
    res.json(result);
  }),
);

export default router;
