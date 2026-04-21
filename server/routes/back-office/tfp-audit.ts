/**
 * TFP Audit Routes (TrustFees Pro -- Phase 9)
 *
 *   GET    /events        -- Search audit events (query: aggregate_type, aggregate_id, event_type, actor_id, date_from, date_to, page, pageSize)
 *   GET    /events/export -- Export events as JSON (query: same filters + format=json)
 *   POST   /verify-chain  -- Verify HMAC chain (body: { from_date?, to_date? })
 *   POST   /flush         -- Manual flush (trigger window flush)
 */

import { Router } from 'express';
import { tfpAuditService } from '../../services/tfp-audit-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

// ============================================================================
// Event Search & Export
// ============================================================================

/** GET /events -- Search audit events */
router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const filters = {
      aggregate_type: req.query.aggregate_type as string | undefined,
      aggregate_id: req.query.aggregate_id as string | undefined,
      event_type: req.query.event_type as string | undefined,
      actor_id: req.query.actor_id as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
    };

    const result = await tfpAuditService.searchEvents(filters);
    res.json(result);
  }),
);

/** GET /events/export -- Export events as JSON with PII redaction */
router.get(
  '/events/export',
  asyncHandler(async (req, res) => {
    const filters = {
      aggregate_type: req.query.aggregate_type as string | undefined,
      aggregate_id: req.query.aggregate_id as string | undefined,
      event_type: req.query.event_type as string | undefined,
      actor_id: req.query.actor_id as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
    };

    const format = (req.query.format as string) ?? 'json';
    const events = await tfpAuditService.exportEvents(filters, format);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-events-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(events);
  }),
);

// ============================================================================
// Chain Verification & Flush
// ============================================================================

/** POST /verify-chain -- Verify HMAC chain integrity */
router.post(
  '/verify-chain',
  asyncHandler(async (req: any, res: any) => {
    const { from_date, to_date } = req.body ?? {};
    const result = await tfpAuditService.verifyChain(from_date, to_date);
    res.json(result);
  }),
);

/** POST /flush -- Manual window flush */
router.post(
  '/flush',
  asyncHandler(async (_req, res) => {
    const result = await tfpAuditService.flushWindow();
    res.json(result);
  }),
);

export default router;
