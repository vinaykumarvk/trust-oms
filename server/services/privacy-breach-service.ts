import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { logAuditEvent } from './audit-logger';
import { ConflictError, NotFoundError, ValidationError } from './service-errors';
import {
  appendPrivacyBreachHistory,
  assessPrivacyBreach,
  buildPrivacyBreachHistoryEntry,
  buildPrivacyBreachPlaybook,
  normalizeAffectedClientIds,
  normalizeClosureEvidence,
  normalizeDataCategories,
  normalizeNotificationEvidence,
  type PrivacyBreachHistoryEntry,
  type PrivacyBreachPlaybookStep,
} from './privacy-breach-policy';

type BreachNotification = typeof schema.breachNotifications.$inferSelect;

interface PrivacyBreachAuditContext {
  actorUserId?: number | null;
  actorRole?: string;
  ipAddress?: string;
  correlationId?: string;
}

interface ReportPrivacyBreachInput {
  breachType?: string;
  title: string;
  description?: string;
  detectedAt?: Date | string;
  affectedCount?: number;
  affectedClientIds?: unknown;
  dataCategories?: unknown;
  sensitivePersonalInformation?: boolean;
  identityFraudRisk?: boolean;
  realRiskOfSeriousHarm?: boolean;
  unauthorizedAcquisition?: boolean;
  containmentLog?: string;
  remediationPlan?: string;
}

interface TriagePrivacyBreachInput {
  affectedCount?: number;
  affectedClientIds?: unknown;
  dataCategories?: unknown;
  sensitivePersonalInformation?: boolean;
  identityFraudRisk?: boolean;
  realRiskOfSeriousHarm?: boolean;
  unauthorizedAcquisition?: boolean;
  notes?: string;
}

function actorString(actorUserId?: number | null): string | undefined {
  return actorUserId == null ? undefined : String(actorUserId);
}

function appendHistorySql(entry: PrivacyBreachHistoryEntry) {
  return sql`COALESCE(${schema.breachNotifications.status_history}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`;
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nextIncidentId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `PRB-${stamp}-${Date.now()}`;
}

function parseDate(value: Date | string | undefined, label: string): Date {
  const date = value == null ? new Date() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} must be a valid date`);
  return date;
}

function updateStep(
  steps: unknown,
  code: string,
  status: PrivacyBreachPlaybookStep['status'],
  completedAt?: Date,
): PrivacyBreachPlaybookStep[] {
  const current = jsonArray(steps) as PrivacyBreachPlaybookStep[];
  return current.map((step) => {
    if (step.code !== code) return step;
    return {
      ...step,
      status,
      completed_at: completedAt ? completedAt.toISOString() : step.completed_at ?? null,
    };
  });
}

function updateSteps(
  steps: unknown,
  updates: Array<{ code: string; status: PrivacyBreachPlaybookStep['status']; completedAt?: Date }>,
): PrivacyBreachPlaybookStep[] {
  return updates.reduce(
    (current, update) => updateStep(current, update.code, update.status, update.completedAt),
    jsonArray(steps) as PrivacyBreachPlaybookStep[],
  );
}

function notifiableStatusAfterNotification(incident: BreachNotification, notifiedType: 'NPC' | 'DATA_SUBJECT') {
  if (notifiedType === 'NPC') return 'NPC_NOTIFIED' as const;
  return 'DATA_SUBJECT_NOTIFIED' as const;
}

async function auditPrivacyBreach(
  action: string,
  breachId: string,
  context: PrivacyBreachAuditContext | undefined,
  changes: Record<string, unknown>,
) {
  await logAuditEvent({
    entityType: 'breach_notifications',
    entityId: breachId,
    action,
    actorId: actorString(context?.actorUserId),
    actorRole: context?.actorRole,
    actorSource: context?.actorUserId == null ? 'SYSTEM' : 'USER',
    source: {
      system: 'TRUST_OMS',
      channel: 'BACK_OFFICE',
      component: 'privacy-breach-service',
    },
    changes,
    ipAddress: context?.ipAddress,
    correlationId: context?.correlationId,
  });
}

async function getIncidentOrThrow(breachId: string): Promise<BreachNotification> {
  const [incident] = await db
    .select()
    .from(schema.breachNotifications)
    .where(
      and(
        eq(schema.breachNotifications.breach_id, breachId),
        eq(schema.breachNotifications.is_deleted, false),
      ),
    );

  if (!incident) throw new NotFoundError(`Privacy breach incident not found: ${breachId}`);
  return incident;
}

function assertOpen(incident: BreachNotification) {
  if (incident.breach_status === 'CLOSED') {
    throw new ConflictError(`Privacy breach incident ${incident.breach_id} is already closed`);
  }
}

export const privacyBreachService = {
  async reportIncident(data: ReportPrivacyBreachInput, context?: PrivacyBreachAuditContext) {
    const title = data.title?.trim();
    if (!title) throw new ValidationError('title is required');

    const detectedAt = parseDate(data.detectedAt, 'detected_at');
    const affectedClientIds = normalizeAffectedClientIds(data.affectedClientIds);
    const affectedCount = data.affectedCount ?? Math.max(affectedClientIds.length, 1);
    const dataCategories = normalizeDataCategories(data.dataCategories);
    const assessment = assessPrivacyBreach({
      affectedCount,
      dataCategories,
      sensitivePersonalInformation: data.sensitivePersonalInformation,
      identityFraudRisk: data.identityFraudRisk,
      realRiskOfSeriousHarm: data.realRiskOfSeriousHarm,
      unauthorizedAcquisition: data.unauthorizedAcquisition,
      detectedAt,
    });
    const now = new Date();
    const breachId = nextIncidentId();
    const historyEntry = buildPrivacyBreachHistoryEntry({
      action: 'REPORTED',
      status: 'REPORTED',
      actorUserId: context?.actorUserId,
      createdAt: now,
    });

    const [incident] = await db
      .insert(schema.breachNotifications)
      .values({
        breach_id: breachId,
        breach_type: data.breachType ?? 'PERSONAL_DATA_BREACH',
        title,
        description: data.description ?? null,
        detected_at: detectedAt,
        reported_at: now,
        reported_by: context?.actorUserId ?? null,
        npc_deadline: assessment.npcDeadline,
        npc_notification_required: assessment.npcNotificationRequired,
        data_subject_notification_required: assessment.dataSubjectNotificationRequired,
        data_subject_notification_deadline: assessment.dataSubjectNotificationDeadline,
        affected_count: affectedCount,
        affected_client_ids: affectedClientIds,
        data_categories: assessment.dataCategories,
        sensitive_personal_information: Boolean(data.sensitivePersonalInformation),
        identity_fraud_risk: Boolean(data.identityFraudRisk),
        real_risk_of_serious_harm: Boolean(data.realRiskOfSeriousHarm),
        risk_assessment: {
          severity: assessment.severity,
          notification_basis: assessment.notificationBasis,
          assessed_at: now.toISOString(),
          npc_notification_required: assessment.npcNotificationRequired,
          data_subject_notification_required: assessment.dataSubjectNotificationRequired,
        },
        playbook_status: 'REPORTED',
        playbook_steps: buildPrivacyBreachPlaybook(assessment),
        status_history: [historyEntry],
        containment_log: data.containmentLog ?? null,
        remediation_plan: data.remediationPlan ?? null,
        breach_status: 'DETECTED',
        created_by: actorString(context?.actorUserId),
        updated_by: actorString(context?.actorUserId),
      })
      .returning();

    await auditPrivacyBreach('PRIVACY_BREACH_REPORTED', breachId, context, {
      affected_count: affectedCount,
      severity: assessment.severity,
      npc_notification_required: assessment.npcNotificationRequired,
    });

    return incident;
  },

  async triageIncident(breachId: string, data: TriagePrivacyBreachInput, context?: PrivacyBreachAuditContext) {
    const incident = await getIncidentOrThrow(breachId);
    assertOpen(incident);

    const affectedClientIds = data.affectedClientIds == null
      ? normalizeAffectedClientIds(incident.affected_client_ids)
      : normalizeAffectedClientIds(data.affectedClientIds);
    const affectedCount = data.affectedCount ?? incident.affected_count ?? Math.max(affectedClientIds.length, 1);
    const dataCategories = data.dataCategories == null
      ? normalizeDataCategories(incident.data_categories)
      : normalizeDataCategories(data.dataCategories);
    const assessment = assessPrivacyBreach({
      affectedCount,
      dataCategories,
      sensitivePersonalInformation: data.sensitivePersonalInformation ?? incident.sensitive_personal_information,
      identityFraudRisk: data.identityFraudRisk ?? incident.identity_fraud_risk,
      realRiskOfSeriousHarm: data.realRiskOfSeriousHarm ?? incident.real_risk_of_serious_harm,
      unauthorizedAcquisition: data.unauthorizedAcquisition,
      detectedAt: incident.detected_at,
    });
    const now = new Date();
    const historyEntry = buildPrivacyBreachHistoryEntry({
      action: 'TRIAGED',
      status: 'TRIAGED',
      actorUserId: context?.actorUserId,
      notes: data.notes,
      createdAt: now,
    });
    const playbookSteps = updateStep(buildPrivacyBreachPlaybook(assessment), 'TRIAGE', 'DONE', now);

    const [updated] = await db
      .update(schema.breachNotifications)
      .set({
        affected_count: affectedCount,
        affected_client_ids: affectedClientIds,
        data_categories: assessment.dataCategories,
        sensitive_personal_information: Boolean(data.sensitivePersonalInformation ?? incident.sensitive_personal_information),
        identity_fraud_risk: Boolean(data.identityFraudRisk ?? incident.identity_fraud_risk),
        real_risk_of_serious_harm: Boolean(data.realRiskOfSeriousHarm ?? incident.real_risk_of_serious_harm),
        npc_deadline: assessment.npcDeadline,
        npc_notification_required: assessment.npcNotificationRequired,
        data_subject_notification_required: assessment.dataSubjectNotificationRequired,
        data_subject_notification_deadline: assessment.dataSubjectNotificationDeadline,
        risk_assessment: {
          severity: assessment.severity,
          notification_basis: assessment.notificationBasis,
          assessed_at: now.toISOString(),
          triage_notes: data.notes ?? null,
          npc_notification_required: assessment.npcNotificationRequired,
          data_subject_notification_required: assessment.dataSubjectNotificationRequired,
        },
        playbook_status: 'TRIAGED',
        playbook_steps: playbookSteps,
        status_history: appendHistorySql(historyEntry),
        breach_status: 'TRIAGED',
        updated_by: actorString(context?.actorUserId),
        updated_at: now,
      } as any)
      .where(eq(schema.breachNotifications.breach_id, breachId))
      .returning();

    await auditPrivacyBreach('PRIVACY_BREACH_TRIAGED', breachId, context, {
      severity: assessment.severity,
      npc_notification_required: assessment.npcNotificationRequired,
      data_subject_notification_required: assessment.dataSubjectNotificationRequired,
    });

    return updated;
  },

  async recordContainment(breachId: string, data: {
    containmentLog: string;
    evidence?: Record<string, unknown>;
  }, context?: PrivacyBreachAuditContext) {
    const incident = await getIncidentOrThrow(breachId);
    assertOpen(incident);

    const containmentLog = data.containmentLog?.trim();
    if (!containmentLog || containmentLog.length < 10) {
      throw new ValidationError('containment_log must be at least 10 characters');
    }

    const now = new Date();
    const historyEntry = buildPrivacyBreachHistoryEntry({
      action: 'CONTAINED',
      status: 'CONTAINED',
      actorUserId: context?.actorUserId,
      notes: containmentLog,
      createdAt: now,
    });
    const playbookSteps = updateStep(incident.playbook_steps, 'CONTAINMENT', 'DONE', now);

    const [updated] = await db
      .update(schema.breachNotifications)
      .set({
        containment_status: 'CONTAINED',
        containment_log: containmentLog,
        containment_evidence: {
          ...(data.evidence ?? {}),
          contained_by: context?.actorUserId ?? null,
          contained_at: now.toISOString(),
        },
        playbook_status: 'CONTAINED',
        playbook_steps: playbookSteps,
        status_history: appendHistorySql(historyEntry),
        breach_status: incident.breach_status === 'DETECTED' || incident.breach_status === 'TRIAGED'
          ? 'CONTAINED'
          : incident.breach_status,
        updated_by: actorString(context?.actorUserId),
        updated_at: now,
      } as any)
      .where(eq(schema.breachNotifications.breach_id, breachId))
      .returning();

    await auditPrivacyBreach('PRIVACY_BREACH_CONTAINED', breachId, context, {
      containment_status: 'CONTAINED',
    });

    return updated;
  },

  async recordNpcNotification(breachId: string, data: {
    channel?: string;
    reference?: string;
    submittedAt?: Date | string;
    payload?: unknown;
    attachments?: string[];
    notes?: string | null;
  }, context?: PrivacyBreachAuditContext) {
    const incident = await getIncidentOrThrow(breachId);
    assertOpen(incident);

    const evidence = normalizeNotificationEvidence({
      channel: data.channel ?? 'NPC_DBNMS',
      reference: data.reference,
      submittedAt: data.submittedAt,
      payload: data.payload,
      attachments: data.attachments,
      notes: data.notes,
    });
    const submittedAt = new Date(evidence.submitted_at);
    const withinDeadline = submittedAt.getTime() <= incident.npc_deadline.getTime();
    const now = new Date();
    const historyEntry = buildPrivacyBreachHistoryEntry({
      action: 'NPC_NOTIFIED',
      status: 'NPC_NOTIFIED',
      actorUserId: context?.actorUserId,
      notes: evidence.reference,
      createdAt: now,
    });
    const playbookSteps = updateStep(incident.playbook_steps, 'NPC_NOTIFICATION', 'DONE', submittedAt);

    const [updated] = await db
      .update(schema.breachNotifications)
      .set({
        npc_notified_at: submittedAt,
        npc_notification_evidence: {
          ...evidence,
          within_72h_deadline: withinDeadline,
        },
        playbook_status: 'NPC_NOTIFIED',
        playbook_steps: playbookSteps,
        status_history: appendHistorySql(historyEntry),
        breach_status: notifiableStatusAfterNotification(incident, 'NPC'),
        updated_by: actorString(context?.actorUserId),
        updated_at: now,
      } as any)
      .where(eq(schema.breachNotifications.breach_id, breachId))
      .returning();

    await auditPrivacyBreach('PRIVACY_BREACH_NPC_NOTIFIED', breachId, context, {
      reference: evidence.reference,
      within_72h_deadline: withinDeadline,
    });

    return updated;
  },

  async recordDataSubjectNotification(breachId: string, data: {
    channel?: string;
    reference?: string;
    submittedAt?: Date | string;
    payload?: unknown;
    attachments?: string[];
    notes?: string | null;
  }, context?: PrivacyBreachAuditContext) {
    const incident = await getIncidentOrThrow(breachId);
    assertOpen(incident);

    const evidence = normalizeNotificationEvidence({
      channel: data.channel ?? 'SECURE_CLIENT_NOTICE',
      reference: data.reference,
      submittedAt: data.submittedAt,
      payload: data.payload,
      attachments: data.attachments,
      notes: data.notes,
    });
    const submittedAt = new Date(evidence.submitted_at);
    const deadline = incident.data_subject_notification_deadline ?? incident.npc_deadline;
    const withinDeadline = submittedAt.getTime() <= deadline.getTime();
    const now = new Date();
    const historyEntry = buildPrivacyBreachHistoryEntry({
      action: 'DATA_SUBJECT_NOTIFIED',
      status: 'DATA_SUBJECT_NOTIFIED',
      actorUserId: context?.actorUserId,
      notes: evidence.reference,
      createdAt: now,
    });
    const playbookSteps = updateStep(incident.playbook_steps, 'DATA_SUBJECT_NOTIFICATION', 'DONE', submittedAt);

    const [updated] = await db
      .update(schema.breachNotifications)
      .set({
        data_subject_notified_at: submittedAt,
        data_subject_notification_evidence: {
          ...evidence,
          within_72h_deadline: withinDeadline,
        },
        playbook_status: 'DATA_SUBJECT_NOTIFIED',
        playbook_steps: playbookSteps,
        status_history: appendHistorySql(historyEntry),
        breach_status: notifiableStatusAfterNotification(incident, 'DATA_SUBJECT'),
        updated_by: actorString(context?.actorUserId),
        updated_at: now,
      } as any)
      .where(eq(schema.breachNotifications.breach_id, breachId))
      .returning();

    await auditPrivacyBreach('PRIVACY_BREACH_DATA_SUBJECT_NOTIFIED', breachId, context, {
      reference: evidence.reference,
      within_72h_deadline: withinDeadline,
    });

    return updated;
  },

  async closeIncident(breachId: string, data: {
    rootCause?: string;
    correctiveActions?: string[];
    residualRisk?: string;
    notes?: string;
    remediationPlan?: string;
  }, context?: PrivacyBreachAuditContext) {
    const incident = await getIncidentOrThrow(breachId);
    assertOpen(incident);

    if (incident.containment_status !== 'CONTAINED') {
      throw new ConflictError(`Privacy breach incident ${breachId} must be contained before closure`);
    }
    if (incident.npc_notification_required && !incident.npc_notified_at) {
      throw new ConflictError(`Privacy breach incident ${breachId} requires NPC notification before closure`);
    }
    if (incident.data_subject_notification_required && !incident.data_subject_notified_at) {
      throw new ConflictError(`Privacy breach incident ${breachId} requires data subject notification before closure`);
    }

    const closureEvidence = normalizeClosureEvidence({
      rootCause: data.rootCause,
      correctiveActions: data.correctiveActions,
      residualRisk: data.residualRisk,
      notes: data.notes,
    });
    const now = new Date();
    const historyEntry = buildPrivacyBreachHistoryEntry({
      action: 'CLOSED',
      status: 'CLOSED',
      actorUserId: context?.actorUserId,
      notes: closureEvidence.notes,
      createdAt: now,
    });
    const playbookSteps = updateSteps(incident.playbook_steps, [
      { code: 'REMEDIATION', status: 'DONE', completedAt: now },
      { code: 'CLOSURE', status: 'DONE', completedAt: now },
    ]);

    const [updated] = await db
      .update(schema.breachNotifications)
      .set({
        breach_status: 'CLOSED',
        playbook_status: 'CLOSED',
        playbook_steps: playbookSteps,
        closure_evidence: closureEvidence,
        closed_at: now,
        closed_by: context?.actorUserId ?? null,
        remediation_plan: data.remediationPlan ?? incident.remediation_plan,
        status_history: appendHistorySql(historyEntry),
        updated_by: actorString(context?.actorUserId),
        updated_at: now,
      } as any)
      .where(eq(schema.breachNotifications.breach_id, breachId))
      .returning();

    await auditPrivacyBreach('PRIVACY_BREACH_CLOSED', breachId, context, {
      root_cause: closureEvidence.root_cause,
      corrective_actions: closureEvidence.corrective_actions,
      residual_risk: closureEvidence.residual_risk,
    });

    return updated;
  },

  async checkNotificationSlaBreaches(asOf: Date = new Date()) {
    const incidents = await db
      .select()
      .from(schema.breachNotifications)
      .where(
        and(
          eq(schema.breachNotifications.is_deleted, false),
          sql`${schema.breachNotifications.breach_status} != 'CLOSED'`,
        ),
      );

    const breaches: Array<{
      breach_id: string;
      timer: 'NPC_NOTIFICATION' | 'DATA_SUBJECT_NOTIFICATION';
      due_at: string;
      hours_overdue: number;
    }> = [];

    for (const incident of incidents) {
      const checks = [
        {
          timer: 'NPC_NOTIFICATION' as const,
          required: incident.npc_notification_required,
          done: Boolean(incident.npc_notified_at),
          dueAt: incident.npc_deadline,
        },
        {
          timer: 'DATA_SUBJECT_NOTIFICATION' as const,
          required: incident.data_subject_notification_required,
          done: Boolean(incident.data_subject_notified_at),
          dueAt: incident.data_subject_notification_deadline ?? incident.npc_deadline,
        },
      ];

      const alerts = checks
        .filter((check) => check.required && !check.done && asOf.getTime() > check.dueAt.getTime())
        .map((check) => ({
          breach_id: incident.breach_id,
          timer: check.timer,
          due_at: check.dueAt.toISOString(),
          hours_overdue: Math.ceil((asOf.getTime() - check.dueAt.getTime()) / (60 * 60 * 1000)),
          alerted_at: asOf.toISOString(),
        }));

      if (alerts.length > 0) {
        breaches.push(...alerts.map(({ alerted_at, ...alert }) => alert));
        await db
          .update(schema.breachNotifications)
          .set({
            sla_alerts: sql`COALESCE(${schema.breachNotifications.sla_alerts}, '[]'::jsonb) || ${JSON.stringify(alerts)}::jsonb`,
            updated_by: 'PRIVACY_BREACH_SLA_JOB',
            updated_at: new Date(),
          } as any)
          .where(eq(schema.breachNotifications.breach_id, incident.breach_id));
      }
    }

    return breaches;
  },

  async getIncident(breachId: string) {
    return getIncidentOrThrow(breachId);
  },

  async listIncidents(filters: {
    status?: string;
    playbookStatus?: string;
    notificationRequired?: boolean;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const conditions = [eq(schema.breachNotifications.is_deleted, false)];

    if (filters.status) {
      conditions.push(eq(schema.breachNotifications.breach_status, filters.status as any));
    }
    if (filters.playbookStatus) {
      conditions.push(eq(schema.breachNotifications.playbook_status, filters.playbookStatus));
    }
    if (filters.notificationRequired === true) {
      conditions.push(sql`(${schema.breachNotifications.npc_notification_required} = true OR ${schema.breachNotifications.data_subject_notification_required} = true)` as any);
    }

    const whereClause = and(...conditions);
    const data = await db
      .select()
      .from(schema.breachNotifications)
      .where(whereClause)
      .orderBy(desc(schema.breachNotifications.detected_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.breachNotifications)
      .where(whereClause);

    return { data, total: Number(count), page, pageSize };
  },
};

export function buildPrivacyBreachAuditContext(req: {
  user?: { id?: number; role?: string };
  userId?: number | string;
  userRole?: string;
  ip?: string;
  id?: string;
}): PrivacyBreachAuditContext {
  const rawUserId = req.user?.id ?? req.userId;
  const actorUserId = typeof rawUserId === 'number'
    ? rawUserId
    : typeof rawUserId === 'string' && /^\d+$/.test(rawUserId)
      ? Number(rawUserId)
      : null;

  return {
    actorUserId,
    actorRole: req.user?.role ?? req.userRole,
    ipAddress: req.ip,
    correlationId: req.id,
  };
}
