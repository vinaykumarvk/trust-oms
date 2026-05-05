import { ValidationError } from './service-errors';

export type NotificationSeverity = 'CRITICAL' | 'P1' | 'P2' | 'P3';
export type NotificationLifecycleStatus = 'OPEN' | 'ACKNOWLEDGED' | 'ESCALATED' | 'CLOSED';

export interface NotificationGovernanceHistoryEntry {
  action: 'CREATED' | 'ACKNOWLEDGED' | 'ESCALATED' | 'CLOSED';
  status: NotificationLifecycleStatus;
  at: string;
  actor_user_id: number | null;
  notes?: string;
  owner_user_id?: number | null;
  owner_team?: string | null;
  escalation_user_id?: number | null;
  escalation_team?: string | null;
  evidence?: Record<string, unknown>;
}

export interface NotificationClosureEvidence {
  notes: string;
  resolution_code?: string;
  evidence_refs?: unknown[];
}

const SLA_HOURS_BY_SEVERITY: Record<NotificationSeverity, number> = {
  CRITICAL: 4,
  P1: 8,
  P2: 24,
  P3: 72,
};

export function normalizeNotificationSeverity(value?: string | null): NotificationSeverity {
  const normalized = String(value || 'P3').trim().toUpperCase();
  if (normalized === 'CRITICAL' || normalized === 'P0') return 'CRITICAL';
  if (normalized === 'P1' || normalized === 'HIGH') return 'P1';
  if (normalized === 'P2' || normalized === 'MEDIUM') return 'P2';
  if (normalized === 'P3' || normalized === 'LOW') return 'P3';
  throw new ValidationError(`Unsupported notification severity: ${value}`);
}

export function notificationDueAt(
  severity: NotificationSeverity,
  from: Date = new Date(),
  explicitDueAt?: Date | string | null,
): Date {
  if (explicitDueAt) {
    const parsed = explicitDueAt instanceof Date ? explicitDueAt : new Date(explicitDueAt);
    if (Number.isNaN(parsed.getTime())) throw new ValidationError('sla_due_at must be a valid date');
    return parsed;
  }

  return new Date(from.getTime() + SLA_HOURS_BY_SEVERITY[severity] * 60 * 60 * 1000);
}

export function buildNotificationHistoryEntry(data: {
  action: NotificationGovernanceHistoryEntry['action'];
  status: NotificationLifecycleStatus;
  actorUserId?: number | null;
  at?: Date;
  notes?: string;
  ownerUserId?: number | null;
  ownerTeam?: string | null;
  escalationUserId?: number | null;
  escalationTeam?: string | null;
  evidence?: Record<string, unknown>;
}): NotificationGovernanceHistoryEntry {
  return {
    action: data.action,
    status: data.status,
    at: (data.at ?? new Date()).toISOString(),
    actor_user_id: data.actorUserId ?? null,
    ...(data.notes ? { notes: data.notes } : {}),
    ...(data.ownerUserId !== undefined ? { owner_user_id: data.ownerUserId } : {}),
    ...(data.ownerTeam !== undefined ? { owner_team: data.ownerTeam } : {}),
    ...(data.escalationUserId !== undefined ? { escalation_user_id: data.escalationUserId } : {}),
    ...(data.escalationTeam !== undefined ? { escalation_team: data.escalationTeam } : {}),
    ...(data.evidence ? { evidence: data.evidence } : {}),
  };
}

export function appendNotificationHistory(
  current: unknown,
  entry: NotificationGovernanceHistoryEntry,
): NotificationGovernanceHistoryEntry[] {
  const existing = Array.isArray(current) ? current : [];
  return [...existing, entry];
}

export function normalizeNotificationClosureEvidence(input: unknown): NotificationClosureEvidence {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('closure evidence is required');
  }

  const evidence = input as Record<string, unknown>;
  const notes = typeof evidence.notes === 'string' ? evidence.notes.trim() : '';
  if (notes.length < 10) {
    throw new ValidationError('closure evidence notes must be at least 10 characters');
  }

  return {
    notes,
    ...(typeof evidence.resolution_code === 'string' && evidence.resolution_code.trim()
      ? { resolution_code: evidence.resolution_code.trim() }
      : {}),
    ...(Array.isArray(evidence.evidence_refs) ? { evidence_refs: evidence.evidence_refs } : {}),
  };
}
