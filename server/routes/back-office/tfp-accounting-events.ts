import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';
import { tfpAccountingEventService } from '../../services/tfp-accounting-event-service';

const router = Router();
router.use(requireBackOfficeRole());

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await tfpAccountingEventService.listEvents({
      publish_status: req.query.publish_status as string | undefined,
      acknowledgement_status: req.query.acknowledgement_status as string | undefined,
      event_type: req.query.event_type as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json({ data });
  }),
);

router.post(
  '/:id/ack',
  asyncHandler(async (req: any, res) => {
    try {
      const eventId = parseInt(req.params.id, 10);
      if (Number.isNaN(eventId)) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid event ID' } });
      }
      const data = await tfpAccountingEventService.acknowledgeEvent(
        eventId,
        {
          acknowledgement_status: req.body.acknowledgement_status,
          acknowledgement_ref: req.body.acknowledgement_ref,
          acknowledgement_payload: req.body.acknowledgement_payload,
          failure_reason: req.body.failure_reason,
        },
        req.userId || req.body.updated_by || 'system',
      );
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

router.post(
  '/:id/replay',
  asyncHandler(async (req: any, res) => {
    try {
      const eventId = parseInt(req.params.id, 10);
      if (Number.isNaN(eventId)) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid event ID' } });
      }
      const data = await tfpAccountingEventService.replayEvent(
        eventId,
        req.userId || req.body.updated_by || 'system',
      );
      res.json({ data });
    } catch (err: unknown) {
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
  }),
);

export default router;
