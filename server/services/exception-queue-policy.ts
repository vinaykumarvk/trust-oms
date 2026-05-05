export const EXCEPTION_SLA_HOURS: Record<string, number> = {
  P1: 4,
  P2: 8,
  P3: 24,
};

export interface ExceptionHistoryEntry {
  status?: string;
  assigned_to_team?: string | null;
  assigned_to_user?: string | null;
  changed_at: string;
  changed_by: string | null;
  reason: string | null;
}

export function calculateExceptionSlaDueAt(
  severity: string,
  startedAt: Date = new Date(),
  slaHours: Record<string, number> = EXCEPTION_SLA_HOURS,
): Date {
  const hours = slaHours[severity] ?? slaHours.P3 ?? 24;
  return new Date(startedAt.getTime() + hours * 60 * 60 * 1000);
}

function asHistoryArray(value: unknown): ExceptionHistoryEntry[] {
  return Array.isArray(value) ? value as ExceptionHistoryEntry[] : [];
}

export function appendExceptionHistory(
  current: unknown,
  entry: ExceptionHistoryEntry,
): ExceptionHistoryEntry[] {
  return [...asHistoryArray(current), entry];
}

export function statusHistoryEntry(
  status: string,
  changedBy: string | number | null | undefined,
  reason?: string | null,
  at: Date = new Date(),
): ExceptionHistoryEntry {
  return {
    status,
    changed_at: at.toISOString(),
    changed_by: changedBy === null || changedBy === undefined ? null : String(changedBy),
    reason: reason ?? null,
  };
}

export function assignmentHistoryEntry(
  assignedToTeam: string,
  assignedToUser: string | null | undefined,
  changedBy: string | number | null | undefined,
  reason?: string | null,
  at: Date = new Date(),
): ExceptionHistoryEntry {
  return {
    assigned_to_team: assignedToTeam,
    assigned_to_user: assignedToUser ?? null,
    changed_at: at.toISOString(),
    changed_by: changedBy === null || changedBy === undefined ? null : String(changedBy),
    reason: reason ?? null,
  };
}
