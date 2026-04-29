/**
 * ECL Routes (FR-MNT-006)
 *
 * Expected Credit Loss computation endpoints.
 *
 *   GET  /pd-tables                — PD / LGD reference tables
 *   GET  /portfolio/:portfolioId   — Compute ECL for one portfolio
 *   POST /batch                    — Batch ECL across all portfolios
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { eclService } from '../../services/ecl-service';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();
router.use(requireBackOfficeRole());

/** GET /pd-tables — PD/LGD reference lookup tables */
router.get(
  '/pd-tables',
  asyncHandler(async (_req, res) => {
    const tables = eclService.getPDTables();
    res.json({ data: tables });
  }),
);

/** GET /portfolio/:portfolioId — Compute ECL for a specific portfolio */
router.get(
  '/portfolio/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    try {
      const result = await eclService.computeECL(portfolioId);
      res.json({ data: result });
    } catch (err) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

/** POST /batch — Compute ECL for all active portfolios */
router.post(
  '/batch',
  asyncHandler(async (_req, res) => {
    try {
      const result = await eclService.computeECLBatch();
      res.json({ data: result });
    } catch (err) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

export default router;
