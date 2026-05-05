import { Router } from 'express';
import { requirePrivacyRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import {
  buildPrivacyBreachAuditContext,
  privacyBreachService,
} from '../../services/privacy-breach-service';

const router = Router();
router.use(requirePrivacyRole());

/** GET /sla-breaches - stamp overdue NPC/data-subject notification timers */
router.get('/sla-breaches', asyncHandler(async (req: any, res: any) => {
  const asOf = req.query.as_of ? new Date(String(req.query.as_of)) : new Date();
  const result = await privacyBreachService.checkNotificationSlaBreaches(asOf);
  res.json({ data: result, total: result.length });
}));

/** GET / - list privacy breach incidents */
router.get('/', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.listIncidents({
    status: req.query.status as string | undefined,
    playbookStatus: req.query.playbook_status as string | undefined,
    notificationRequired: req.query.notification_required === 'true' ? true : undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
}));

/** POST / - report a new privacy breach incident */
router.post('/', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.reportIncident({
    breachType: req.body.breach_type,
    title: req.body.title,
    description: req.body.description,
    detectedAt: req.body.detected_at,
    affectedCount: req.body.affected_count == null ? undefined : Number(req.body.affected_count),
    affectedClientIds: req.body.affected_client_ids,
    dataCategories: req.body.data_categories,
    sensitivePersonalInformation: req.body.sensitive_personal_information,
    identityFraudRisk: req.body.identity_fraud_risk,
    realRiskOfSeriousHarm: req.body.real_risk_of_serious_harm,
    unauthorizedAcquisition: req.body.unauthorized_acquisition,
    containmentLog: req.body.containment_log,
    remediationPlan: req.body.remediation_plan,
  }, buildPrivacyBreachAuditContext(req));
  res.status(201).json({ data: result });
}));

/** GET /:id - get one privacy breach incident */
router.get('/:id', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.getIncident(req.params.id);
  res.json({ data: result });
}));

/** POST /:id/triage - record DPO triage and notification decision */
router.post('/:id/triage', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.triageIncident(req.params.id, {
    affectedCount: req.body.affected_count == null ? undefined : Number(req.body.affected_count),
    affectedClientIds: req.body.affected_client_ids,
    dataCategories: req.body.data_categories,
    sensitivePersonalInformation: req.body.sensitive_personal_information,
    identityFraudRisk: req.body.identity_fraud_risk,
    realRiskOfSeriousHarm: req.body.real_risk_of_serious_harm,
    unauthorizedAcquisition: req.body.unauthorized_acquisition,
    notes: req.body.notes,
  }, buildPrivacyBreachAuditContext(req));
  res.json({ data: result });
}));

/** POST /:id/containment - record containment evidence */
router.post('/:id/containment', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.recordContainment(req.params.id, {
    containmentLog: req.body.containment_log,
    evidence: req.body.evidence,
  }, buildPrivacyBreachAuditContext(req));
  res.json({ data: result });
}));

/** POST /:id/notify-npc - record NPC DBNMS submission evidence */
router.post('/:id/notify-npc', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.recordNpcNotification(req.params.id, {
    channel: req.body.channel,
    reference: req.body.reference,
    submittedAt: req.body.submitted_at,
    payload: req.body.payload,
    attachments: req.body.attachments,
    notes: req.body.notes,
  }, buildPrivacyBreachAuditContext(req));
  res.json({ data: result });
}));

/** POST /:id/notify-data-subjects - record affected-client notice evidence */
router.post('/:id/notify-data-subjects', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.recordDataSubjectNotification(req.params.id, {
    channel: req.body.channel,
    reference: req.body.reference,
    submittedAt: req.body.submitted_at,
    payload: req.body.payload,
    attachments: req.body.attachments,
    notes: req.body.notes,
  }, buildPrivacyBreachAuditContext(req));
  res.json({ data: result });
}));

/** POST /:id/close - close after containment and required notifications */
router.post('/:id/close', asyncHandler(async (req: any, res: any) => {
  const result = await privacyBreachService.closeIncident(req.params.id, {
    rootCause: req.body.root_cause,
    correctiveActions: req.body.corrective_actions,
    residualRisk: req.body.residual_risk,
    notes: req.body.notes,
    remediationPlan: req.body.remediation_plan,
  }, buildPrivacyBreachAuditContext(req));
  res.json({ data: result });
}));

export default router;
