export type HandoverRouteType = 'SAME_BRANCH' | 'CROSS_BRANCH' | 'BRANCH_UNRESOLVED';

export interface HandoverRoutingActor {
  id: number;
  role?: string | null;
  branch_id?: number | null;
  office?: string | null;
  full_name?: string | null;
}

export interface BuildHandoverRouteInput {
  handoverId?: number | null;
  handoverNumber?: string | null;
  outgoingRm?: HandoverRoutingActor | null;
  incomingRm?: HandoverRoutingActor | null;
  sourceBranchId?: number | null;
  targetBranchId?: number | null;
  createdBy?: string | number | null;
  now?: Date;
  slaDeadline?: Date | string | null;
}

export interface HandoverAuthorizationRoute {
  routeType: HandoverRouteType;
  sourceBranchId: number | null;
  targetBranchId: number | null;
  checkerBranchId: number | null;
  secondaryCheckerBranchId: number | null;
  requiredCheckerRole: 'BO_CHECKER' | 'BO_HEAD';
  ownerTeam: string;
  escalationTeam: string;
  authorizationDueAt: Date;
  escalationDueAt: Date;
  reasonCodes: string[];
  snapshot: Record<string, unknown>;
}

export interface HandoverRoutingHistoryEntry {
  action: 'ROUTED' | 'AUTHORIZED' | 'ESCALATED' | 'REROUTED';
  at: string;
  actor_id: string | number | null;
  route_type: HandoverRouteType;
  owner_team: string;
  checker_branch_id: number | null;
  escalation_team: string;
  reason?: string | null;
  details?: Record<string, unknown>;
}

export interface HandoverAuthorizationDecision {
  allowed: boolean;
  status?: number;
  error?: string;
}

const SAME_BRANCH_AUTH_HOURS = 48;
const CROSS_BRANCH_AUTH_HOURS = 24;
const UNRESOLVED_BRANCH_AUTH_HOURS = 12;
const ESCALATION_AFTER_DUE_HOURS = 8;

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function earlierDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export function normalizeHandoverRole(role: string | null | undefined): string {
  return String(role ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function isBoHeadOrAdmin(role: string): boolean {
  return role === 'BO_HEAD' || role === 'SYSTEM_ADMIN' || role.includes('HEAD');
}

function isBoChecker(role: string): boolean {
  return role === 'BO_CHECKER' || role.includes('CHECKER') || role.includes('SUPERVISOR') || role.includes('BRANCH_MANAGER');
}

export function buildHandoverAuthorizationRoute(input: BuildHandoverRouteInput): HandoverAuthorizationRoute {
  const now = input.now ?? new Date();
  const sourceBranchId = input.sourceBranchId ?? input.outgoingRm?.branch_id ?? null;
  const targetBranchId = input.targetBranchId ?? input.incomingRm?.branch_id ?? null;

  let routeType: HandoverRouteType;
  if (sourceBranchId == null || targetBranchId == null) {
    routeType = 'BRANCH_UNRESOLVED';
  } else if (sourceBranchId === targetBranchId) {
    routeType = 'SAME_BRANCH';
  } else {
    routeType = 'CROSS_BRANCH';
  }

  const configuredSla = asDate(input.slaDeadline);
  const defaultDue = routeType === 'CROSS_BRANCH'
    ? addHours(now, CROSS_BRANCH_AUTH_HOURS)
    : routeType === 'BRANCH_UNRESOLVED'
      ? addHours(now, UNRESOLVED_BRANCH_AUTH_HOURS)
      : addHours(now, SAME_BRANCH_AUTH_HOURS);
  const authorizationDueAt = configuredSla ? earlierDate(defaultDue, configuredSla) : defaultDue;
  const escalationDueAt = addHours(authorizationDueAt, ESCALATION_AFTER_DUE_HOURS);
  const requiredCheckerRole = routeType === 'BRANCH_UNRESOLVED' ? 'BO_HEAD' : 'BO_CHECKER';
  const ownerTeam = routeType === 'CROSS_BRANCH'
    ? 'TARGET_BRANCH_AUTHORIZATION'
    : routeType === 'BRANCH_UNRESOLVED'
      ? 'BO_HEAD'
      : 'BRANCH_AUTHORIZATION';

  const reasonCodes = [
    routeType === 'CROSS_BRANCH' ? 'SOURCE_TARGET_BRANCH_DIFFER' : null,
    routeType === 'BRANCH_UNRESOLVED' ? 'MISSING_BRANCH_ASSIGNMENT' : null,
  ].filter((code): code is string => Boolean(code));

  const checkerBranchId = routeType === 'BRANCH_UNRESOLVED' ? null : targetBranchId;
  const secondaryCheckerBranchId = routeType === 'CROSS_BRANCH' ? sourceBranchId : null;

  const snapshot = {
    route_type: routeType,
    source_branch_id: sourceBranchId,
    target_branch_id: targetBranchId,
    checker_branch_id: checkerBranchId,
    secondary_checker_branch_id: secondaryCheckerBranchId,
    required_checker_role: requiredCheckerRole,
    owner_team: ownerTeam,
    escalation_team: 'BO_HEAD',
    authorization_due_at: authorizationDueAt.toISOString(),
    escalation_due_at: escalationDueAt.toISOString(),
    reason_codes: reasonCodes,
    handover_id: input.handoverId ?? null,
    handover_number: input.handoverNumber ?? null,
    created_by: input.createdBy ?? null,
    routed_at: now.toISOString(),
  };

  return {
    routeType,
    sourceBranchId,
    targetBranchId,
    checkerBranchId,
    secondaryCheckerBranchId,
    requiredCheckerRole,
    ownerTeam,
    escalationTeam: 'BO_HEAD',
    authorizationDueAt,
    escalationDueAt,
    reasonCodes,
    snapshot,
  };
}

export function makeHandoverRoutingHistoryEntry(
  route: HandoverAuthorizationRoute,
  action: HandoverRoutingHistoryEntry['action'],
  actorId: string | number | null,
  reason?: string | null,
  details?: Record<string, unknown>,
  at: Date = new Date(),
): HandoverRoutingHistoryEntry {
  return {
    action,
    at: at.toISOString(),
    actor_id: actorId,
    route_type: route.routeType,
    owner_team: route.ownerTeam,
    checker_branch_id: route.checkerBranchId,
    escalation_team: route.escalationTeam,
    reason: reason ?? null,
    details,
  };
}

export function appendHandoverRoutingHistory(
  existing: unknown,
  entry: HandoverRoutingHistoryEntry,
): HandoverRoutingHistoryEntry[] {
  const base = Array.isArray(existing) ? existing : [];
  return [...base, entry].slice(-50) as HandoverRoutingHistoryEntry[];
}

export function evaluateHandoverCheckerAuthorization(
  route: Pick<HandoverAuthorizationRoute, 'routeType' | 'checkerBranchId' | 'requiredCheckerRole'>,
  checker: HandoverRoutingActor | null | undefined,
  makerId: string | number | null | undefined,
): HandoverAuthorizationDecision {
  if (!checker?.id) {
    return { allowed: false, status: 403, error: 'Checker identity is required for handover authorization' };
  }

  if (makerId != null && String(checker.id) === String(makerId)) {
    return { allowed: false, status: 403, error: 'Checker cannot authorize own submissions (segregation of duties)' };
  }

  const checkerRole = normalizeHandoverRole(checker.role);
  const hasRequiredRole = route.requiredCheckerRole === 'BO_HEAD'
    ? isBoHeadOrAdmin(checkerRole)
    : isBoChecker(checkerRole) || isBoHeadOrAdmin(checkerRole);
  if (!hasRequiredRole) {
    return {
      allowed: false,
      status: 403,
      error: `Checker role ${checker.role ?? 'UNKNOWN'} is not permitted for ${route.routeType} handover authorization`,
    };
  }

  const branchOverride = isBoHeadOrAdmin(checkerRole);
  if (route.checkerBranchId != null && !branchOverride && checker.branch_id !== route.checkerBranchId) {
    return {
      allowed: false,
      status: 403,
      error: `Checker must belong to branch ${route.checkerBranchId} for ${route.routeType} handover authorization`,
    };
  }

  if (route.routeType === 'BRANCH_UNRESOLVED' && !branchOverride) {
    return {
      allowed: false,
      status: 403,
      error: 'Branch-unresolved handovers must be authorized by BO_HEAD or SYSTEM_ADMIN',
    };
  }

  return { allowed: true };
}
