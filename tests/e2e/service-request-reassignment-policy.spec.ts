import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  appendServiceRequestReassignmentHistory,
  assertServiceRequestReassignmentAllowed,
  buildServiceRequestReassignmentEntry,
  isServiceRequestReassignmentRole,
  normalizeServiceRequestReassignmentReason,
  SERVICE_REQUEST_REASSIGNMENT_ROLES,
} from '../../server/services/service-request-reassignment-policy';

describe('service request RM reassignment policy', () => {
  it('allows only configured operations-head or admin roles', () => {
    expect(SERVICE_REQUEST_REASSIGNMENT_ROLES).toEqual(['BO_HEAD', 'SYSTEM_ADMIN']);
    expect(assertServiceRequestReassignmentAllowed('bo_head')).toBe('BO_HEAD');
    expect(assertServiceRequestReassignmentAllowed('system-admin')).toBe('SYSTEM_ADMIN');

    expect(isServiceRequestReassignmentRole('bo_maker')).toBe(false);
    expect(isServiceRequestReassignmentRole('bo_checker')).toBe(false);
    expect(isServiceRequestReassignmentRole('relationship_manager')).toBe(false);
    expect(() => assertServiceRequestReassignmentAllowed('bo_checker')).toThrow(
      'RM reassignment requires BO_HEAD or SYSTEM_ADMIN authority',
    );
  });

  it('requires a meaningful reassignment reason', () => {
    expect(normalizeServiceRequestReassignmentReason(' Client transferred to BGC branch ')).toBe(
      'Client transferred to BGC branch',
    );
    expect(() => normalizeServiceRequestReassignmentReason('short')).toThrow(
      'RM reassignment reason must be at least 10 characters',
    );
  });

  it('builds bounded reassignment history entries', () => {
    const entry = buildServiceRequestReassignmentEntry({
      srId: 101,
      previousRmId: 10,
      newRmId: 20,
      changedBy: 'ops-head-1',
      changedByRole: 'bo_head',
      reason: 'Client portfolio moved to specialist RM',
      at: new Date('2026-05-04T00:00:00.000Z'),
    });

    expect(entry).toEqual({
      sr_id: 101,
      previous_rm_id: 10,
      new_rm_id: 20,
      changed_by: 'ops-head-1',
      changed_by_role: 'BO_HEAD',
      reason: 'Client portfolio moved to specialist RM',
      changed_at: '2026-05-04T00:00:00.000Z',
    });

    const longHistory = Array.from({ length: 50 }, (_, i) => ({
      ...entry,
      new_rm_id: i,
    }));
    const next = appendServiceRequestReassignmentHistory(longHistory, entry);
    expect(next).toHaveLength(50);
    expect(next.at(-1)).toEqual(entry);
  });

  it('wires route, service, schema, and migration controls', () => {
    const routeSource = readFileSync('server/routes/back-office/service-requests.ts', 'utf8');
    const serviceSource = readFileSync('server/services/service-request-service.ts', 'utf8');
    const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
    const migrationSource = readFileSync(
      'drizzle/20260504_extend_service_request_reassignment_controls.sql',
      'utf8',
    );

    expect(routeSource).toContain('actorRole: actorRoleFromRequest(req)');
    expect(routeSource).toContain('reason must be at least 10 characters');
    expect(routeSource).toContain('SERVICE_REQUEST_REASSIGNMENT_ROLES');
    expect(serviceSource).toContain('assertServiceRequestReassignmentAllowed(options.actorRole)');
    expect(serviceSource).toContain('RM_REASSIGNMENT_DENIED');
    expect(serviceSource).toContain('RM_REASSIGNED');
    expect(serviceSource).toContain('appendServiceRequestReassignmentHistory');
    expect(schemaSource).toContain("reassignment_history: jsonb('reassignment_history')");
    expect(schemaSource).toContain("last_reassignment_role: text('last_reassignment_role')");
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS reassignment_history jsonb');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS last_reassignment_reason text');
  });
});
