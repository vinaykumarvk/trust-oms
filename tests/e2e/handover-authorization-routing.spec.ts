import { describe, expect, it } from 'vitest';

import {
  appendHandoverRoutingHistory,
  buildHandoverAuthorizationRoute,
  evaluateHandoverCheckerAuthorization,
  makeHandoverRoutingHistoryEntry,
} from '../../server/services/handover-routing-policy';

describe('Handover authorization routing policy', () => {
  it('routes same-branch handovers to branch authorization with BO_CHECKER role', () => {
    const now = new Date('2026-05-04T00:00:00.000Z');
    const route = buildHandoverAuthorizationRoute({
      outgoingRm: { id: 10, role: 'RM', branch_id: 101 },
      incomingRm: { id: 20, role: 'RM', branch_id: 101 },
      createdBy: '10',
      now,
    });

    expect(route.routeType).toBe('SAME_BRANCH');
    expect(route.checkerBranchId).toBe(101);
    expect(route.requiredCheckerRole).toBe('BO_CHECKER');
    expect(route.ownerTeam).toBe('BRANCH_AUTHORIZATION');
    expect(route.snapshot.authorization_due_at).toBe('2026-05-06T00:00:00.000Z');
  });

  it('routes cross-branch handovers to the target branch and records source branch as secondary', () => {
    const now = new Date('2026-05-04T00:00:00.000Z');
    const route = buildHandoverAuthorizationRoute({
      outgoingRm: { id: 10, role: 'RM', branch_id: 101 },
      incomingRm: { id: 20, role: 'RM', branch_id: 202 },
      handoverNumber: 'HAM-2026-000001',
      createdBy: '10',
      now,
    });

    expect(route.routeType).toBe('CROSS_BRANCH');
    expect(route.checkerBranchId).toBe(202);
    expect(route.secondaryCheckerBranchId).toBe(101);
    expect(route.ownerTeam).toBe('TARGET_BRANCH_AUTHORIZATION');
    expect(route.reasonCodes).toContain('SOURCE_TARGET_BRANCH_DIFFER');
    expect(route.snapshot.authorization_due_at).toBe('2026-05-05T00:00:00.000Z');
  });

  it('requires BO_HEAD when either RM branch is unresolved', () => {
    const route = buildHandoverAuthorizationRoute({
      outgoingRm: { id: 10, role: 'RM', branch_id: null },
      incomingRm: { id: 20, role: 'RM', branch_id: 202 },
      now: new Date('2026-05-04T00:00:00.000Z'),
    });

    expect(route.routeType).toBe('BRANCH_UNRESOLVED');
    expect(route.requiredCheckerRole).toBe('BO_HEAD');
    expect(route.checkerBranchId).toBeNull();
    expect(route.ownerTeam).toBe('BO_HEAD');
    expect(route.reasonCodes).toContain('MISSING_BRANCH_ASSIGNMENT');
  });

  it('blocks target-branch handover authorization by a checker from another branch', () => {
    const route = buildHandoverAuthorizationRoute({
      outgoingRm: { id: 10, role: 'RM', branch_id: 101 },
      incomingRm: { id: 20, role: 'RM', branch_id: 202 },
      createdBy: '10',
    });

    const decision = evaluateHandoverCheckerAuthorization(
      route,
      { id: 99, role: 'BO_CHECKER', branch_id: 101 },
      '10',
    );

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.error).toContain('branch 202');
  });

  it('allows BO_HEAD to override cross-branch branch ownership while keeping maker-checker separation', () => {
    const route = buildHandoverAuthorizationRoute({
      outgoingRm: { id: 10, role: 'RM', branch_id: 101 },
      incomingRm: { id: 20, role: 'RM', branch_id: 202 },
      createdBy: '10',
    });

    const decision = evaluateHandoverCheckerAuthorization(
      route,
      { id: 99, role: 'BO_HEAD', branch_id: 303 },
      '10',
    );

    expect(decision.allowed).toBe(true);
  });

  it('records routing history entries with escalation ownership', () => {
    const route = buildHandoverAuthorizationRoute({
      outgoingRm: { id: 10, role: 'RM', branch_id: 101 },
      incomingRm: { id: 20, role: 'RM', branch_id: 202 },
      now: new Date('2026-05-04T00:00:00.000Z'),
    });
    const routed = makeHandoverRoutingHistoryEntry(route, 'ROUTED', '10', 'HANDOVER_CREATED', undefined, new Date('2026-05-04T00:00:00.000Z'));
    const escalated = makeHandoverRoutingHistoryEntry(route, 'ESCALATED', 'system', 'AUTHORIZATION_SLA_BREACH', { previous_owner_team: route.ownerTeam }, new Date('2026-05-05T01:00:00.000Z'));
    const history = appendHandoverRoutingHistory([routed], escalated);

    expect(history).toHaveLength(2);
    expect(history[1].action).toBe('ESCALATED');
    expect(history[1].escalation_team).toBe('BO_HEAD');
    expect(history[1].details).toEqual({ previous_owner_team: 'TARGET_BRANCH_AUTHORIZATION' });
  });
});
