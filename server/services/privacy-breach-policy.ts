import { createHash } from 'crypto';
import { ValidationError } from './service-errors';

export type PrivacyBreachSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PrivacyBreachPlaybookStepStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_REQUIRED';

export interface PrivacyBreachAssessmentInput {
  affectedCount: number;
  dataCategories?: string[];
  sensitivePersonalInformation?: boolean;
  identityFraudRisk?: boolean;
  realRiskOfSeriousHarm?: boolean;
  unauthorizedAcquisition?: boolean;
  detectedAt?: Date | string;
}

export interface PrivacyBreachAssessment {
  severity: PrivacyBreachSeverity;
  npcNotificationRequired: boolean;
  dataSubjectNotificationRequired: boolean;
  npcDeadline: Date;
  dataSubjectNotificationDeadline: Date | null;
  notificationBasis: string[];
  dataCategories: string[];
}

export interface PrivacyBreachPlaybookStep {
  code: string;
  label: string;
  status: PrivacyBreachPlaybookStepStatus;
  due_at?: string | null;
  completed_at?: string | null;
}

export interface PrivacyBreachHistoryEntry {
  action: string;
  status: string;
  actor_user_id?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface PrivacyBreachNotificationEvidence {
  channel: string;
  reference: string;
  submitted_at: string;
  payload_hash: string;
  attachments: string[];
  notes?: string | null;
}

export interface PrivacyBreachClosureEvidence {
  root_cause: string;
  corrective_actions: string[];
  residual_risk: string;
  notes: string;
}

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const HIGH_IMPACT_CATEGORIES = new Set([
  'ACCOUNT_NUMBER',
  'AUTH_CREDENTIALS',
  'BIOMETRIC',
  'DATE_OF_BIRTH',
  'FINANCIAL_PII',
  'GOVERNMENT_ID',
  'HEALTH',
  'PASSWORD',
  'SECURITY_QUESTION',
  'SPI',
  'TIN',
]);

function normalizeCode(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

export function normalizeDataCategories(categories: unknown): string[] {
  if (!Array.isArray(categories)) return [];
  return [...new Set(categories
    .map((category) => typeof category === 'string' ? normalizeCode(category) : '')
    .filter(Boolean))];
}

export function normalizeAffectedClientIds(clientIds: unknown): string[] {
  if (!Array.isArray(clientIds)) return [];
  return [...new Set(clientIds
    .map((clientId) => typeof clientId === 'string' || typeof clientId === 'number' ? String(clientId).trim() : '')
    .filter(Boolean))];
}

export function breachNotificationDueAt(knowledgeAt: Date | string): Date {
  const start = knowledgeAt instanceof Date ? knowledgeAt : new Date(knowledgeAt);
  if (Number.isNaN(start.getTime())) {
    throw new ValidationError('knowledge_at must be a valid date');
  }
  return new Date(start.getTime() + SEVENTY_TWO_HOURS_MS);
}

export function buildPrivacyBreachHistoryEntry(input: {
  action: string;
  status: string;
  actorUserId?: number | null;
  notes?: string | null;
  createdAt?: Date;
}): PrivacyBreachHistoryEntry {
  return {
    action: normalizeCode(input.action),
    status: normalizeCode(input.status),
    actor_user_id: input.actorUserId ?? null,
    notes: input.notes ?? null,
    created_at: (input.createdAt ?? new Date()).toISOString(),
  };
}

export function appendPrivacyBreachHistory(
  current: unknown,
  entry: PrivacyBreachHistoryEntry,
): PrivacyBreachHistoryEntry[] {
  const history = Array.isArray(current) ? current : [];
  return [...history, entry];
}

export function assessPrivacyBreach(input: PrivacyBreachAssessmentInput): PrivacyBreachAssessment {
  const affectedCount = Number(input.affectedCount);
  if (!Number.isFinite(affectedCount) || affectedCount < 1) {
    throw new ValidationError('affected_count must be greater than zero');
  }

  const categories = normalizeDataCategories(input.dataCategories);
  const hasHighImpactCategory = categories.some((category) => HIGH_IMPACT_CATEGORIES.has(category));
  const sensitivePersonalInformation = Boolean(input.sensitivePersonalInformation || hasHighImpactCategory);
  const identityFraudRisk = Boolean(input.identityFraudRisk || categories.includes('AUTH_CREDENTIALS') || categories.includes('PASSWORD'));
  const realRiskOfSeriousHarm = Boolean(input.realRiskOfSeriousHarm || identityFraudRisk || affectedCount >= 1000);
  const unauthorizedAcquisition = input.unauthorizedAcquisition !== false;

  const notificationBasis: string[] = [];
  if (sensitivePersonalInformation) notificationBasis.push('SENSITIVE_PERSONAL_INFORMATION');
  if (identityFraudRisk) notificationBasis.push('IDENTITY_FRAUD_RISK');
  if (realRiskOfSeriousHarm) notificationBasis.push('REAL_RISK_OF_SERIOUS_HARM');
  if (affectedCount >= 1000) notificationBasis.push('LARGE_AFFECTED_POPULATION');

  const notificationRequired = unauthorizedAcquisition && sensitivePersonalInformation && realRiskOfSeriousHarm;
  const detectedAt = input.detectedAt ?? new Date();
  const npcDeadline = breachNotificationDueAt(detectedAt);

  let severity: PrivacyBreachSeverity = 'LOW';
  if ((notificationRequired && affectedCount >= 10000) || categories.includes('BIOMETRIC') || categories.includes('AUTH_CREDENTIALS')) {
    severity = 'CRITICAL';
  } else if (notificationRequired || affectedCount >= 1000) {
    severity = 'HIGH';
  } else if (sensitivePersonalInformation || affectedCount >= 100) {
    severity = 'MEDIUM';
  }

  return {
    severity,
    npcNotificationRequired: notificationRequired,
    dataSubjectNotificationRequired: notificationRequired,
    npcDeadline,
    dataSubjectNotificationDeadline: notificationRequired ? npcDeadline : null,
    notificationBasis,
    dataCategories: categories,
  };
}

export function buildPrivacyBreachPlaybook(assessment: PrivacyBreachAssessment): PrivacyBreachPlaybookStep[] {
  const dueAt = assessment.npcDeadline.toISOString();
  return [
    { code: 'TRIAGE', label: 'Classify affected data and notification trigger', status: 'PENDING' },
    { code: 'CONTAINMENT', label: 'Contain unauthorized access and preserve evidence', status: 'PENDING' },
    {
      code: 'NPC_NOTIFICATION',
      label: 'Submit NPC breach notification package',
      status: assessment.npcNotificationRequired ? 'PENDING' : 'NOT_REQUIRED',
      due_at: assessment.npcNotificationRequired ? dueAt : null,
    },
    {
      code: 'DATA_SUBJECT_NOTIFICATION',
      label: 'Notify affected data subjects with assistance instructions',
      status: assessment.dataSubjectNotificationRequired ? 'PENDING' : 'NOT_REQUIRED',
      due_at: assessment.dataSubjectNotificationRequired ? dueAt : null,
    },
    { code: 'REMEDIATION', label: 'Complete root-cause fix and residual-risk review', status: 'PENDING' },
    { code: 'CLOSURE', label: 'DPO closure approval with evidence', status: 'PENDING' },
  ];
}

export function hashBreachPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function normalizeNotificationEvidence(input: {
  channel?: string;
  reference?: string;
  submittedAt?: Date | string;
  payload?: unknown;
  attachments?: string[];
  notes?: string | null;
}): PrivacyBreachNotificationEvidence {
  const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
  if (reference.length < 3) {
    throw new ValidationError('notification reference is required');
  }

  const submittedAt = input.submittedAt
    ? input.submittedAt instanceof Date ? input.submittedAt : new Date(input.submittedAt)
    : new Date();
  if (Number.isNaN(submittedAt.getTime())) {
    throw new ValidationError('submitted_at must be a valid date');
  }

  const attachments = Array.isArray(input.attachments)
    ? input.attachments.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    channel: input.channel?.trim() || 'NPC_DBNMS',
    reference,
    submitted_at: submittedAt.toISOString(),
    payload_hash: hashBreachPayload(input.payload ?? { reference, submitted_at: submittedAt.toISOString(), attachments }),
    attachments,
    notes: input.notes ?? null,
  };
}

export function normalizeClosureEvidence(input: {
  rootCause?: string;
  correctiveActions?: string[];
  residualRisk?: string;
  notes?: string;
}): PrivacyBreachClosureEvidence {
  const rootCause = input.rootCause?.trim() ?? '';
  const residualRisk = input.residualRisk?.trim() ?? '';
  const notes = input.notes?.trim() ?? '';
  const correctiveActions = Array.isArray(input.correctiveActions)
    ? input.correctiveActions.map((action) => action.trim()).filter(Boolean)
    : [];

  if (rootCause.length < 10) throw new ValidationError('root_cause must be at least 10 characters');
  if (correctiveActions.length === 0) throw new ValidationError('at least one corrective action is required');
  if (residualRisk.length < 3) throw new ValidationError('residual_risk is required');
  if (notes.length < 10) throw new ValidationError('closure notes must be at least 10 characters');

  return {
    root_cause: rootCause,
    corrective_actions: correctiveActions,
    residual_risk: residualRisk,
    notes,
  };
}
