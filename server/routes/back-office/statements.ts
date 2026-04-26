/**
 * Back-Office Statement Routes (Phase 3C)
 *
 * GET  /                — List all client statements (paginated)
 * POST /:id/regenerate  — Trigger statement regeneration
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { statementService } from '../../services/statement-service';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { desc, count } from 'drizzle-orm';

const router = Router();

router.use(requireBackOfficeRole());

// ---------------------------------------------------------------------------
// GET / — All statements (back-office view, no client filter)
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rawPage = parseInt(req.query.page as string, 10);
    const rawPageSize = parseInt(req.query.pageSize as string, 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const pageSize = isNaN(rawPageSize) || rawPageSize < 1 ? 20 : Math.min(rawPageSize, 100);
    const offset = (page - 1) * pageSize;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(schema.clientStatements)
        .orderBy(desc(schema.clientStatements.period))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: count() })
        .from(schema.clientStatements),
    ]);

    res.json({ data: rows, total: Number(total), page, pageSize });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/regenerate — Trigger regeneration
// ---------------------------------------------------------------------------

router.post(
  '/:id/regenerate',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid statement ID' } });
    }

    try {
      await statementService.triggerRegenerate(id);
      // TC-STMT-013: accepted = async background job; respond 202 per spec
      res.status(202).json({ data: { message: `Statement ${id} queued for regeneration` } });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

export default router;
