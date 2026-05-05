export const SERVICE_REQUEST_REASSIGNMENT_ROLES = ['BO_HEAD', 'SYSTEM_ADMIN'] as const;

export interface ServiceRequestReassignmentHistoryEntry {
  sr_id: number;
  previous_rm_id: number | null;
  new_rm_id: number;
  changed_by: string;
  changed_by_role: string;
  reason: string;
  changed_at: string;
}

export function normalizeServiceRequestRole(role: string | null | undefined): string {
  return String(role ?? '').trim().replace(/[\s-]+/g, '_').toUpperCase();
}

export function isServiceRequestReassignmentRole(role: string | null | undefined): boolean {
  const normalized = normalizeServiceRequestRole(role);
  return (SERVICE_REQUEST_REASSIGNMENT_ROLES as readonly string[]).includes(normalized);
}

export function assertServiceRequestReassignmentAllowed(role: string | null | undefined): string {
  const normalized = normalizeServiceRequestRole(role);
  if (!isServiceRequestReassignmentRole(normalized)) {
    const err = new Error('RM reassignment requires BO_HEAD or SYSTEM_ADMIN authority') as Error & {
      code?: string;
      statusCode?: number;
      requiredRoles?: readonly string[];
    };
    err.code = 'SR_REASSIGNMENT_FORBIDDEN';
    err.statusCode = 403;
    err.requiredRoles = SERVICE_REQUEST_REASSIGNMENT_ROLES;
    throw err;
  }
  return normalized;
}

export function normalizeServiceRequestReassignmentReason(reason: string | null | undefined): string {
  const normalized = String(reason ?? '').trim();
  if (normalized.length < 10) {
    const err = new Error('RM reassignment reason must be at least 10 characters') as Error & {
      code?: string;
      statusCode?: number;
    };
    err.code = 'SR_REASSIGNMENT_REASON_REQUIRED';
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

export function buildServiceRequestReassignmentEntry(input: {
  srId: number;
  previousRmId: number | null;
  newRmId: number;
  changedBy: string | number;
  changedByRole: string;
  reason: string;
  at?: Date;
}): ServiceRequestReassignmentHistoryEntry {
  return {
    sr_id: input.srId,
    previous_rm_id: input.previousRmId,
    new_rm_id: input.newRmId,
    changed_by: String(input.changedBy),
    changed_by_role: normalizeServiceRequestRole(input.changedByRole),
    reason: normalizeServiceRequestReassignmentReason(input.reason),
    changed_at: (input.at ?? new Date()).toISOString(),
  };
}

export function appendServiceRequestReassignmentHistory(
  current: unknown,
  entry: ServiceRequestReassignmentHistoryEntry,
): ServiceRequestReassignmentHistoryEntry[] {
  const history = Array.isArray(current) ? current as ServiceRequestReassignmentHistoryEntry[] : [];
  return [...history, entry].slice(-50);
}
