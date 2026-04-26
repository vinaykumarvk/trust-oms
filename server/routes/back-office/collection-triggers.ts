/**
 * Collection Trigger Routes (TrustFees Pro — BRD Gap C12)
 *
 * Endpoints for triggering fee collection on corporate action events,
 * maturity, pre-termination, and redemption-via-sale.
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { collectionTriggerService } from '../../services/collection-trigger-service';

const router = Router();
router.use(requireBackOfficeRole());

/** POST /on-corporate-action — Trigger collection on corporate action */
router.post(
  '/on-corporate-action',
  asyncHandler(async (req: any, res: any) => {
    const { ca_id, portfolio_id, fee_plan_id } = req.body;
    if (!ca_id || !portfolio_id) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Required: ca_id, portfolio_id' } });
    }
    const result = await collectionTriggerService.triggerOnCorporateAction(ca_id, portfolio_id, fee_plan_id);
    res.status(201).json({ data: result });
  }),
);

/** POST /on-maturity — Trigger collection on instrument maturity */
router.post(
  '/on-maturity',
  asyncHandler(async (req: any, res: any) => {
    const { security_id, portfolio_id, maturity_date } = req.body;
    if (!security_id || !portfolio_id) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Required: security_id, portfolio_id' } });
    }
    const result = await collectionTriggerService.triggerOnMaturity(security_id, portfolio_id, maturity_date);
    res.status(201).json({ data: result });
  }),
);

/** POST /on-pre-termination — Trigger collection on early termination */
router.post(
  '/on-pre-termination',
  asyncHandler(async (req: any, res: any) => {
    const { account_id, portfolio_id, termination_date } = req.body;
    if (!account_id || !portfolio_id) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Required: account_id, portfolio_id' } });
    }
    const result = await collectionTriggerService.triggerOnPreTermination(account_id, portfolio_id, termination_date);
    res.status(201).json({ data: result });
  }),
);

/** POST /on-redemption-via-sale — Trigger collection on redemption via sale */
router.post(
  '/on-redemption-via-sale',
  asyncHandler(async (req: any, res: any) => {
    const { trade_id, portfolio_id } = req.body;
    if (!trade_id || !portfolio_id) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Required: trade_id, portfolio_id' } });
    }
    const result = await collectionTriggerService.triggerOnRedemptionViaSale(trade_id, portfolio_id);
    res.status(201).json({ data: result });
  }),
);

export default router;
