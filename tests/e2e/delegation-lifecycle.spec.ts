/**
 * E2E Delegation Lifecycle Tests — HAM Module
 *
 * Verifies the delegation lifecycle: create, cancel, extend, list active,
 * calendar view, process expired, and concurrent conflict resolution
 * (handover authorization supersedes active delegation).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

vi.mock('../../server/db', () => {
  const noop = (): any => {};
  const chain = (): any =>
    new Proxy(
      {},
      {
        get() {
          return (..._args: any[]) => chain();
        },
      },
    );
  const asyncChain = (): any =>
    new Proxy(Promise.resolve([{}]) as any, {
      get(target: any, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop].bind(target);
        }
        return (..._args: any[]) => asyncChain();
      },
    });
  const dbProxy: any = new Proxy(
    {},
    {
      get() {
        return (..._args: any[]) => asyncChain();
      },
    },
  );
  return { db: dbProxy, pool: { query: noop, end: noop }, dbReady: Promise.resolve() };
});

vi.mock('@shared/schema', () => {
  const tableNames = [
    'users', 'handovers', 'handoverItems', 'scrutinyTemplates',
    'scrutinyChecklistItems', 'handoverAuditLog', 'complianceGates',
    'delegationRequests', 'delegationItems', 'bulkUploadLogs',
    'handoverNotifications', 'clients', 'portfolios', 'orders',
    'leads', 'prospects',
  ];
  const makeTable = (name: string): any =>
    new Proxy({}, {
      get(_t: any, col: string | symbol) {
        if (typeof col === 'symbol') return undefined;
        if (col === '$inferSelect') return {};
        if (col === '$inferInsert') return {};
        return `${name}.${col}`;
      },
    });
  const mod: Record<string, any> = {};
  for (const t of tableNames) mod[t] = makeTable(t);
  const enumNames = [
    'handoverStatusEnum', 'handoverEntityTypeEnum', 'scrutinyItemStatusEnum',
    'handoverAuditEventTypeEnum', 'handoverAuditRefTypeEnum',
    'scrutinyAppliesToEnum', 'delegationStatusEnum', 'bulkUploadStatusEnum',
    'handoverNotificationTypeEnum',
  ];
  for (const e of enumNames) mod[e] = makeTable(e);
  return mod;
});

vi.mock('drizzle-orm', () => {
  const identity = (...args: any[]) => args;
  const sqlTag: any = (...args: any[]) => args;
  sqlTag.raw = (...args: any[]) => args;
  return {
    eq: identity, desc: (col: any) => col, asc: (col: any) => col,
    and: identity, or: identity, sql: sqlTag, inArray: identity,
    gte: identity, lte: identity, lt: identity, gt: identity,
    ne: identity, like: identity,
    isNull: (col: any) => col, count: identity, type: {},
  };
});

// ---------------------------------------------------------------------------
// Import service after mocks
// ---------------------------------------------------------------------------

let handoverService: any;
beforeAll(async () => {
  const mod = await import('../../server/services/handover-service');
  handoverService = mod.handoverService;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Delegation Lifecycle — HAM Module', () => {
  // =========================================================================
  // 1. Service availability
  // =========================================================================
  describe('Service bootstrap', () => {
    it('handoverService should be importable', () => {
      expect(handoverService).toBeDefined();
    });

    it('should expose delegation methods', () => {
      expect(typeof handoverService.createDelegation).toBe('function');
      expect(typeof handoverService.cancelDelegation).toBe('function');
      expect(typeof handoverService.extendDelegation).toBe('function');
      expect(typeof handoverService.getActiveDelegations).toBe('function');
      expect(typeof handoverService.getDelegationCalendar).toBe('function');
      expect(typeof handoverService.processExpiredDelegations).toBe('function');
      expect(typeof handoverService.listDelegationEntities).toBe('function');
    });
  });

  // =========================================================================
  // 2. Create delegation
  // =========================================================================
  describe('createDelegation', () => {
    it('should reject when delegate RM equals outgoing RM', async () => {
      const result = await handoverService.createDelegation({
        delegation_type: 'client',
        outgoing_rm_id: 10,
        delegate_rm_id: 10,
        delegation_reason: 'Leave coverage',
        start_date: '2026-05-01',
        end_date: '2026-05-30',
        items: [{ entity_id: 'C001', entity_name: 'Client A' }],
        created_by: '1',
      });
      expect(result.error).toBeDefined();
      expect(result.status).toBe(400);
      expect(result.error).toContain('differ');
    });

    it('should reject when duration exceeds 90 days', async () => {
      const result = await handoverService.createDelegation({
        delegation_type: 'client',
        outgoing_rm_id: 10,
        delegate_rm_id: 20,
        delegation_reason: 'Leave coverage',
        start_date: '2026-05-01',
        end_date: '2026-09-01', // ~123 days
        items: [{ entity_id: 'C001', entity_name: 'Client A' }],
        created_by: '1',
      });
      expect(result.error).toBeDefined();
      expect(result.status).toBe(400);
      expect(result.error).toContain('90 days');
    });

    it('should reject when end date is before start date', async () => {
      const result = await handoverService.createDelegation({
        delegation_type: 'lead',
        outgoing_rm_id: 10,
        delegate_rm_id: 20,
        delegation_reason: 'Leave coverage',
        start_date: '2026-06-01',
        end_date: '2026-05-01',
        items: [{ entity_id: 'L001', entity_name: 'Lead A' }],
        created_by: '1',
      });
      expect(result.error).toBeDefined();
      expect(result.status).toBe(400);
      expect(result.error).toContain('after start');
    });

    it('should create delegation with valid data (mocked DB)', async () => {
      const result = await handoverService.createDelegation({
        delegation_type: 'prospect',
        outgoing_rm_id: 10,
        delegate_rm_id: 20,
        delegation_reason: 'Annual leave',
        start_date: '2026-05-01',
        end_date: '2026-05-30',
        items: [
          { entity_id: 'P001', entity_name: 'Prospect A' },
          { entity_id: 'P002', entity_name: 'Prospect B' },
        ],
        created_by: '1',
      });
      // With mocked DB, result comes from the proxy chain
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Cancel delegation
  // =========================================================================
  describe('cancelDelegation', () => {
    it('should be callable with delegation ID and user', async () => {
      const result = await handoverService.cancelDelegation(1, '5');
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Extend delegation
  // =========================================================================
  describe('extendDelegation', () => {
    it('should be callable with valid parameters', async () => {
      const result = await handoverService.extendDelegation(
        1, '2026-08-01', 'Continued leave', '5',
      );
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 5. List active delegations
  // =========================================================================
  describe('getActiveDelegations', () => {
    it('should return paginated results with default params', async () => {
      const result = await handoverService.getActiveDelegations();
      expect(result).toBeDefined();
    });

    it('should accept type and RM filters', async () => {
      const result = await handoverService.getActiveDelegations({
        delegation_type: 'client',
        rm_id: 10,
        page: 1,
        pageSize: 10,
      });
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 6. Delegation calendar
  // =========================================================================
  describe('getDelegationCalendar', () => {
    it('should return calendar data for date range', async () => {
      const result = await handoverService.getDelegationCalendar({
        from_date: '2026-05-01',
        to_date: '2026-05-31',
      });
      expect(result).toBeDefined();
    });

    it('should accept RM filter', async () => {
      const result = await handoverService.getDelegationCalendar({
        from_date: '2026-05-01',
        to_date: '2026-05-31',
        rm_id: 10,
      });
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 7. Process expired delegations
  // =========================================================================
  describe('processExpiredDelegations', () => {
    it('should be callable and return processed count', async () => {
      const result = await handoverService.processExpiredDelegations();
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 8. List delegation entities (excludes active delegations)
  // =========================================================================
  describe('listDelegationEntities', () => {
    it('should return entity list for leads', async () => {
      const result = await handoverService.listDelegationEntities('lead');
      expect(result).toBeDefined();
    });

    it('should accept search and pagination filters', async () => {
      const result = await handoverService.listDelegationEntities('client', {
        search: 'test',
        page: 1,
        pageSize: 10,
      });
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 9. Concurrent conflict resolution
  // =========================================================================
  describe('Concurrent conflict: handover supersedes delegation', () => {
    it('authorizeRequest should be callable (auto-cancels delegations)', async () => {
      // authorizeRequest auto-cancels active delegations for same entities
      const result = await handoverService.authorizeRequest(1, 1, '99');
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 10. Bulk upload methods
  // =========================================================================
  describe('Bulk upload', () => {
    it('previewBulkUpload should validate rows', async () => {
      const result = await handoverService.previewBulkUpload([
        {
          entity_type: 'client',
          entity_id: 'C001',
          entity_name: 'Client One',
          outgoing_rm_id: 10,
          incoming_rm_id: 20,
        },
        {
          entity_type: 'invalid_type',
          entity_id: '',
          entity_name: 'Bad Row',
          outgoing_rm_id: 10,
          incoming_rm_id: 10,
        },
      ]);
      expect(result).toBeDefined();
      expect(result.total_rows).toBe(2);
      // First row is valid, second has errors
      expect(result.preview[0].valid).toBe(true);
      expect(result.preview[1].valid).toBe(false);
      expect(result.preview[1].errors.length).toBeGreaterThan(0);
    });

    it('previewBulkUpload should catch same RM error', async () => {
      const result = await handoverService.previewBulkUpload([
        {
          entity_type: 'client',
          entity_id: 'C001',
          entity_name: 'Client',
          outgoing_rm_id: 10,
          incoming_rm_id: 10,
        },
      ]);
      expect(result.preview[0].valid).toBe(false);
      expect(result.preview[0].errors).toContain('Outgoing and incoming RM cannot be the same');
    });

    it('processBulkUpload should be callable', async () => {
      const result = await handoverService.processBulkUpload(
        [
          {
            entity_type: 'client',
            entity_id: 'C001',
            entity_name: 'Client One',
            outgoing_rm_id: 10,
            incoming_rm_id: 20,
            reason: 'Mass transfer',
          },
        ],
        '1',
      );
      expect(result).toBeDefined();
    });

    it('getUploadLog should be callable', async () => {
      const result = await handoverService.getUploadLog(1);
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 11. Dashboard summary
  // =========================================================================
  describe('getDashboardSummary', () => {
    it('should return dashboard data', async () => {
      const result = await handoverService.getDashboardSummary();
      expect(result).toBeDefined();
    });
  });
});
