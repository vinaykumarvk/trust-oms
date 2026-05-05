import { describe, expect, it } from 'vitest';
import {
  appendExceptionHistory,
  assignmentHistoryEntry,
  calculateExceptionSlaDueAt,
  statusHistoryEntry,
} from '../../server/services/exception-queue-policy';

describe('exception queue policy', () => {
  it('calculates severity-based SLA due dates', () => {
    const start = new Date('2026-05-04T00:00:00.000Z');

    expect(calculateExceptionSlaDueAt('P1', start).toISOString()).toBe('2026-05-04T04:00:00.000Z');
    expect(calculateExceptionSlaDueAt('P2', start).toISOString()).toBe('2026-05-04T08:00:00.000Z');
    expect(calculateExceptionSlaDueAt('P3', start).toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });

  it('builds auditable status and assignment history entries', () => {
    const status = statusHistoryEntry('IN_PROGRESS', 'ops.user1', 'ASSIGNED', new Date('2026-05-04T01:00:00.000Z'));
    const assignment = assignmentHistoryEntry('FEE_OPS', 'ops.user1', 'lead', 'MANUAL_ASSIGN', new Date('2026-05-04T01:01:00.000Z'));

    expect(status).toEqual({
      status: 'IN_PROGRESS',
      changed_at: '2026-05-04T01:00:00.000Z',
      changed_by: 'ops.user1',
      reason: 'ASSIGNED',
    });
    expect(assignment).toEqual({
      assigned_to_team: 'FEE_OPS',
      assigned_to_user: 'ops.user1',
      changed_at: '2026-05-04T01:01:00.000Z',
      changed_by: 'lead',
      reason: 'MANUAL_ASSIGN',
    });
  });

  it('appends history without mutating the existing value', () => {
    const existing = [statusHistoryEntry('OPEN', 'SYSTEM', 'CREATED', new Date('2026-05-04T00:00:00.000Z'))];
    const next = appendExceptionHistory(
      existing,
      statusHistoryEntry('RESOLVED', 'ops.user1', 'FIXED', new Date('2026-05-04T02:00:00.000Z')),
    );

    expect(existing).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1].status).toBe('RESOLVED');
  });
});
