import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';
import { domainEventService } from '../../services/domain-event-service';

const router = Router();
router.use(requireBackOfficeRole());

function actor(req: any) {
  return req.userId || req.body?.actor_id || 'system';
}

router.get('/replay-requests', asyncHandler(async (req, res) => {
  const data = await domainEventService.listReplayRequests({
    status: req.query.status as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({ data });
}));

router.post('/replay-requests/:requestId/start', asyncHandler(async (req: any, res) => {
  try {
    const data = await domainEventService.markReplayStarted(req.params.requestId, actor(req));
    res.json({ data });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/replay-requests/:requestId/complete', asyncHandler(async (req: any, res) => {
  try {
    const data = await domainEventService.completeReplay(
      req.params.requestId,
      req.body.result_payload ?? {},
      actor(req),
    );
    res.json({ data });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.post('/replay-requests/:requestId/fail', asyncHandler(async (req: any, res) => {
  try {
    const data = await domainEventService.failReplay(
      req.params.requestId,
      req.body.failure_reason,
      actor(req),
    );
    res.json({ data });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.get('/', asyncHandler(async (req, res) => {
  const data = await domainEventService.listEvents({
    eventType: req.query.event_type as string | undefined,
    aggregateType: req.query.aggregate_type as string | undefined,
    aggregateId: req.query.aggregate_id as string | undefined,
    replayStatus: req.query.replay_status as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({ data });
}));

router.post('/', asyncHandler(async (req: any, res) => {
  try {
    const result = await domainEventService.recordEvent({
      eventType: req.body.event_type,
      aggregateType: req.body.aggregate_type,
      aggregateId: req.body.aggregate_id,
      sourceSystem: req.body.source_system,
      sourceReference: req.body.source_reference,
      schemaVersion: req.body.schema_version,
      payload: req.body.event_payload ?? {},
      correlationId: req.body.correlation_id,
      causationId: req.body.causation_id,
      parentEventId: req.body.parent_event_id,
      idempotencyKey: req.body.idempotency_key,
    }, actor(req));
    res.status(result.created ? 201 : 200).json({ data: result.event, duplicate: result.duplicate });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const data = await domainEventService.getEvent(req.params.id);
  res.json({ data });
}));

router.post('/:id/replay-requests', asyncHandler(async (req: any, res) => {
  try {
    const data = await domainEventService.requestReplay(
      req.params.id,
      req.body.replay_reason,
      actor(req),
    );
    res.status(201).json({ data });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
  }
}));

export default router;
