/**
 * Circuit Breaker Dashboard Routes (TrustFees Pro — BRD Gap A03)
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { getAllBreakers, resetBreaker } from '../../services/circuit-breaker';

const router = Router();
router.use(requireBackOfficeRole());

/** GET / — List all circuit breaker states */
router.get(
  '/',
  asyncHandler(async (_req: any, res: any) => {
    const breakers = getAllBreakers().map(b => b.getStats());
    res.json({ data: breakers });
  }),
);

/** POST /:name/reset — Manually reset a circuit breaker */
router.post(
  '/:name/reset',
  asyncHandler(async (req: any, res: any) => {
    const { name } = req.params;
    const success = resetBreaker(name);
    if (!success) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Circuit breaker '${name}' not found` } });
    }
    res.json({ data: { name, state: 'CLOSED', message: 'Circuit breaker reset successfully' } });
  }),
);

export default router;
