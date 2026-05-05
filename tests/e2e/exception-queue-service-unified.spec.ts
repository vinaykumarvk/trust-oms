import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  insertValues: [] as any[],
  updateValues: [] as any[],
  selectQueues: [] as any[][],
  auditEvents: [] as any[],
}));

vi.mock('../../server/db', () => {
  function selectChain(): any {
    return {
      from: () => selectChain(),
      where: () => selectChain(),
      limit: async () => mockState.selectQueues.shift() ?? [],
      then: (resolve: any, reject: any) => Promise.resolve(mockState.selectQueues.shift() ?? []).then(resolve, reject),
    };
  }

  function insertChain(): any {
    return {
      values: (values: any) => {
        mockState.insertValues.push(values);
        return {
          returning: async () => [{ id: 101, ...values }],
        };
      },
    };
  }

  function updateChain(): any {
    return {
      set: (values: any) => {
        mockState.updateValues.push(values);
        return {
          where: () => ({
            returning: async () => [{ id: 101, ...values }],
            then: (resolve: any, reject: any) => Promise.resolve([{ id: 101, ...values }]).then(resolve, reject),
          }),
        };
      },
    };
  }

  return {
    db: {
      select: () => selectChain(),
      insert: () => insertChain(),
      update: () => updateChain(),
    },
  };
});

vi.mock('@shared/schema', () => {
  const table = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, prop: string | symbol) {
          if (typeof prop === 'symbol') return undefined;
          return `${name}.${prop}`;
        },
      },
    );

  return {
    exceptionItems: table('exception_items'),
  };
});

vi.mock('drizzle-orm', () => {
  const identity = (...args: any[]) => args;
  const sqlTag: any = (...args: any[]) => args;
  return {
    eq: identity,
    and: identity,
    or: identity,
    lte: identity,
    gt: identity,
    ne: identity,
    inArray: identity,
    ilike: identity,
    desc: (value: any) => value,
    sql: sqlTag,
  };
});

vi.mock('../../server/services/tfp-audit-service', () => ({
  tfpAuditService: {
    logEvent: vi.fn(async (...args: any[]) => {
      mockState.auditEvents.push(args);
      return { id: mockState.auditEvents.length };
    }),
  },
}));

import { exceptionQueueService } from '../../server/services/exception-queue-service';

describe('unified exception queue service', () => {
  beforeEach(() => {
    mockState.insertValues.length = 0;
    mockState.updateValues.length = 0;
    mockState.selectQueues.length = 0;
    mockState.auditEvents.length = 0;
  });

  it('creates domain-scoped exceptions with source URI, SLA, and history', async () => {
    await exceptionQueueService.createException({
      exception_type: 'OTHER',
      exception_domain: 'CORE_BANKING',
      severity: 'P2',
      title: 'Core banking adapter returned an error',
      description: 'Adapter rejected the instruction.',
      source_system: 'FINACLE',
      source_object_uri: 'core-banking://FINACLE/instructions/CBI-001',
      aggregate_type: 'CORE_BANKING_INSTRUCTION',
      aggregate_id: 'CBI-001',
      assigned_to_team: 'CORE_OPS',
      client_impact: true,
    });

    const inserted = mockState.insertValues[0];
    expect(inserted).toMatchObject({
      exception_type: 'OTHER',
      exception_domain: 'CORE_BANKING',
      severity: 'P2',
      source_system: 'FINACLE',
      source_object_uri: 'core-banking://FINACLE/instructions/CBI-001',
      assigned_to_team: 'CORE_OPS',
      exception_status: 'OPEN',
      client_impact: true,
      regulatory_impact: false,
    });
    expect(inserted.sla_started_at).toBeInstanceOf(Date);
    expect(inserted.sla_due_at.getTime() - inserted.sla_started_at.getTime()).toBe(8 * 60 * 60 * 1000);
    expect(inserted.assignment_history).toHaveLength(1);
    expect(inserted.status_history[0]).toMatchObject({ status: 'OPEN', changed_by: 'SYSTEM', reason: 'CREATED' });
    expect(mockState.auditEvents[0][2]).toBe('EXCEPTION_CREATED');
  });

  it('records assignment and resolution history during lifecycle changes', async () => {
    mockState.selectQueues.push([
      {
        id: 101,
        exception_status: 'OPEN',
        assigned_to_team: 'CORE_OPS',
        assignment_history: [],
        status_history: [],
        last_status_changed_at: new Date('2026-05-04T00:00:00.000Z'),
      },
    ]);

    await exceptionQueueService.assignException(101, 'ops.user1');
    expect(mockState.updateValues[0]).toMatchObject({
      exception_status: 'IN_PROGRESS',
      assigned_to_user: 'ops.user1',
    });
    expect(mockState.updateValues[0].assignment_history[0]).toMatchObject({
      assigned_to_team: 'CORE_OPS',
      assigned_to_user: 'ops.user1',
      changed_by: 'ops.user1',
      reason: 'ASSIGNED',
    });
    expect(mockState.updateValues[0].status_history[0]).toMatchObject({
      status: 'IN_PROGRESS',
      changed_by: 'ops.user1',
      reason: 'ASSIGNED',
    });

    mockState.selectQueues.push([
      {
        id: 101,
        exception_status: 'IN_PROGRESS',
        status_history: mockState.updateValues[0].status_history,
      },
    ]);

    await exceptionQueueService.resolveException(101, 'Instruction corrected and replayed.', {
      resolution_code: 'REPLAYED',
      resolution_evidence: { replay_id: 'RPL-001' },
      root_cause_code: 'ADAPTER_MAPPING',
      resolved_by: 'ops.user1',
    });

    expect(mockState.updateValues[1]).toMatchObject({
      exception_status: 'RESOLVED',
      resolution_code: 'REPLAYED',
      resolution_evidence: { replay_id: 'RPL-001' },
      root_cause_code: 'ADAPTER_MAPPING',
    });
    expect(mockState.updateValues[1].status_history.at(-1)).toMatchObject({
      status: 'RESOLVED',
      changed_by: 'ops.user1',
      reason: 'RESOLVED',
    });
  });

  it('marks SLA breach timestamp and history when auto-escalating overdue items', async () => {
    mockState.selectQueues.push([
      {
        id: 201,
        exception_status: 'OPEN',
        sla_due_at: new Date('2026-05-03T00:00:00.000Z'),
        sla_breached_at: null,
        resolution_notes: null,
        status_history: [],
      },
    ]);

    const result = await exceptionQueueService.checkSlaBreaches();

    expect(result).toEqual({ breaches_found: 1, escalated: 1 });
    expect(mockState.updateValues[0].exception_status).toBe('ESCALATED');
    expect(mockState.updateValues[0].sla_breached_at).toBeInstanceOf(Date);
    expect(mockState.updateValues[0].status_history[0]).toMatchObject({
      status: 'ESCALATED',
      changed_by: 'SYSTEM',
      reason: 'SLA_BREACH',
    });
  });
});
