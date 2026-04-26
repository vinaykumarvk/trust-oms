/**
 * E2E Meeting & Call Report Tests — CRM Phases 7 & 8
 *
 * Verifies:
 * - Meeting CRUD (create with auto-generated code MTG-YYYYMMDD-NNNN, getById, update)
 * - Meeting calendar data retrieval
 * - Meeting status transitions (complete, cancel with reason, reschedule)
 * - Meeting invitee management
 * - Call report CRUD (create, update only DRAFT/RETURNED)
 * - Call report submission workflow (business-day late detection, auto-approve if <=5 days)
 * - Call report lifecycle (DRAFT -> SUBMITTED -> APPROVED/RETURNED)
 * - Call report number format validation (CR-YYYYMM-NNNN)
 *
 * Uses Vitest mocks — no real DB connection required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the DB module to prevent real connections (vi.hoisted for hoisting)
// ---------------------------------------------------------------------------

const {
  mockSelect, mockInsert, mockUpdate, mockDelete, mockFrom, mockWhere,
  mockReturning, mockValues, mockSet, mockGroupBy, mockOrderBy,
  mockLimit, mockOffset, mockExecute, mockInnerJoin,
  selectChain, insertChain, updateChain, deleteChain,
} = vi.hoisted(() => {
  const _mockFrom = vi.fn();
  const _mockWhere = vi.fn();
  const _mockGroupBy = vi.fn();
  const _mockOrderBy = vi.fn();
  const _mockLimit = vi.fn();
  const _mockOffset = vi.fn();
  const _mockReturning = vi.fn();
  const _mockValues = vi.fn();
  const _mockSet = vi.fn();
  const _mockSelect = vi.fn();
  const _mockInsert = vi.fn();
  const _mockUpdate = vi.fn();
  const _mockDelete = vi.fn();
  const _mockExecute = vi.fn();
  const _mockInnerJoin = vi.fn();

  // Build chain object first, then configure mocks to return it
  const _selectChain: Record<string, any> = {};
  _selectChain.from = _mockFrom;
  _selectChain.where = _mockWhere;
  _selectChain.groupBy = _mockGroupBy;
  _selectChain.orderBy = _mockOrderBy;
  _selectChain.limit = _mockLimit;
  _selectChain.offset = _mockOffset;
  _selectChain.innerJoin = _mockInnerJoin;

  // Configure each mock to return the chain
  _mockFrom.mockReturnValue(_selectChain);
  _mockWhere.mockReturnValue(_selectChain);
  _mockGroupBy.mockReturnValue(_selectChain);
  _mockOrderBy.mockReturnValue(_selectChain);
  _mockLimit.mockReturnValue(_selectChain);
  _mockOffset.mockReturnValue(_selectChain);
  _mockInnerJoin.mockReturnValue(_selectChain);

  const _insertChain = {
    values: _mockValues.mockReturnValue({ returning: _mockReturning }),
  };

  const _updateChain = {
    set: _mockSet.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: _mockReturning }) }),
  };

  const _deleteChain = {
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockSelect: _mockSelect, mockInsert: _mockInsert, mockUpdate: _mockUpdate,
    mockDelete: _mockDelete, mockFrom: _mockFrom, mockWhere: _mockWhere,
    mockReturning: _mockReturning, mockValues: _mockValues, mockSet: _mockSet,
    mockGroupBy: _mockGroupBy, mockOrderBy: _mockOrderBy, mockLimit: _mockLimit,
    mockOffset: _mockOffset, mockExecute: _mockExecute, mockInnerJoin: _mockInnerJoin,
    selectChain: _selectChain, insertChain: _insertChain,
    updateChain: _updateChain, deleteChain: _deleteChain,
  };
});

vi.mock('../../server/db', () => {
  const dbObj: Record<string, any> = {
    select: mockSelect.mockReturnValue(selectChain),
    insert: mockInsert.mockReturnValue(insertChain),
    update: mockUpdate.mockReturnValue(updateChain),
    delete: mockDelete.mockReturnValue(deleteChain),
    execute: mockExecute,
    transaction: async (fn: (tx: any) => Promise<any>) => fn(dbObj),
  };
  return { db: dbObj };
});

vi.mock('../../server/services/audit-logger', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import services under test — AFTER mocks are set up
// ---------------------------------------------------------------------------

import { meetingService } from '../../server/services/meeting-service';
import { callReportService } from '../../server/services/call-report-service';

// ===========================================================================
// Test Suite
// ===========================================================================

describe('Meeting & Call Report — CRM Phases 7 & 8', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Re-establish default chain returns after resetAllMocks
    mockFrom.mockReturnValue(selectChain);
    mockWhere.mockReturnValue(selectChain);
    mockGroupBy.mockReturnValue(selectChain);
    mockOrderBy.mockReturnValue(selectChain);
    mockLimit.mockReturnValue(selectChain);
    mockOffset.mockReturnValue(selectChain);
    mockInnerJoin.mockReturnValue(selectChain);
    mockSelect.mockReturnValue(selectChain);
    mockInsert.mockReturnValue(insertChain);
    mockUpdate.mockReturnValue(updateChain);
    mockDelete.mockReturnValue(deleteChain);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockSet.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockReturning }) });
  });

  // =========================================================================
  // 1. Meeting CRUD
  // =========================================================================

  describe('Meeting CRUD', () => {
    it('should create a meeting with auto-generated MTG-YYYYMMDD-NNNN code', async () => {
      // Mock generateMeetingCode DB call (no existing meetings)
      mockExecute.mockResolvedValueOnce({ rows: [] });

      // resolveRelationshipName — no client/prospect/lead passed, so no DB call is made

      // Mock meeting insert returning (db.insert().values().returning())
      const now = new Date();
      const dateSegment = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const expectedCode = `MTG-${dateSegment}-0001`;

      mockReturning.mockResolvedValueOnce([{
        id: 1,
        meeting_code: expectedCode,
        title: 'Client Review',
        meeting_type: 'IN_PERSON',
        organizer_user_id: 10,
        start_time: new Date('2026-05-01T09:00:00Z'),
        end_time: new Date('2026-05-01T10:00:00Z'),
        meeting_status: 'SCHEDULED',
      }]);

      // conversationHistory insert uses db.insert().values() without .returning(),
      // so the default mockValues chain is sufficient — no override needed.

      const result = await meetingService.create({
        title: 'Client Review',
        meeting_type: 'IN_PERSON',
        organizer_user_id: 10,
        start_time: '2026-05-01T09:00:00Z',
        end_time: '2026-05-01T10:00:00Z',
      });

      expect(result).toBeDefined();
      expect(result.meeting_code).toMatch(/^MTG-\d{8}-\d{4}$/);
    });

    it('should increment sequence when existing meetings exist for today', async () => {
      const now = new Date();
      const dateSegment = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

      // Mock: existing meeting found
      mockExecute.mockResolvedValueOnce({
        rows: [{ meeting_code: `MTG-${dateSegment}-0003` }],
      });

      // resolveRelationshipName — no client/prospect/lead, no DB call

      // Mock insert returning
      mockReturning.mockResolvedValueOnce([{
        id: 2,
        meeting_code: `MTG-${dateSegment}-0004`,
        title: 'Follow-up',
        meeting_type: 'VIRTUAL',
        meeting_status: 'SCHEDULED',
      }]);

      // conversationHistory insert — no override needed

      const result = await meetingService.create({
        title: 'Follow-up',
        meeting_type: 'VIRTUAL',
        organizer_user_id: 10,
        start_time: '2026-05-01T14:00:00Z',
        end_time: '2026-05-01T15:00:00Z',
      });

      expect(result).toBeDefined();
      expect(result.meeting_code).toBe(`MTG-${dateSegment}-0004`);
    });

    it('should reject meeting creation when end_time is before start_time', async () => {
      await expect(
        meetingService.create({
          title: 'Bad Meeting',
          meeting_type: 'IN_PERSON',
          organizer_user_id: 10,
          start_time: '2026-05-01T10:00:00Z',
          end_time: '2026-05-01T09:00:00Z',
        }),
      ).rejects.toThrow('end_time must be after start_time');
    });

    it('should reject meeting creation when end_time equals start_time', async () => {
      await expect(
        meetingService.create({
          title: 'Zero-duration Meeting',
          meeting_type: 'IN_PERSON',
          organizer_user_id: 10,
          start_time: '2026-05-01T10:00:00Z',
          end_time: '2026-05-01T10:00:00Z',
        }),
      ).rejects.toThrow('end_time must be after start_time');
    });

    it('should retrieve a meeting by ID with invitees', async () => {
      const meetingData = {
        id: 1,
        meeting_code: 'MTG-20260501-0001',
        title: 'Client Review',
        meeting_status: 'SCHEDULED',
      };

      // Mock select -> from -> where returns meeting
      mockWhere.mockResolvedValueOnce([meetingData]);

      // Mock invitees select
      mockWhere.mockResolvedValueOnce([
        { id: 1, meeting_id: 1, user_id: 10, is_required: true },
        { id: 2, meeting_id: 1, user_id: 20, is_required: false },
      ]);

      const result = await meetingService.getById(1);

      expect(result).toBeDefined();
      expect(result.meeting_code).toBe('MTG-20260501-0001');
      expect(result.invitees).toHaveLength(2);
    });

    it('should throw when meeting not found by ID', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(meetingService.getById(999)).rejects.toThrow('Meeting not found');
    });

    it('should update meeting fields', async () => {
      // Mock the initial select to fetch the existing meeting (QUA-06 always fetches)
      mockLimit.mockResolvedValueOnce([{
        id: 1,
        title: 'Old Title',
        organizer_user_id: 10,
        start_time: new Date('2026-05-01T09:00:00Z'),
        end_time: new Date('2026-05-01T10:00:00Z'),
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          title: 'Updated Title',
          location: 'Conference Room B',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await meetingService.update(1, {
        title: 'Updated Title',
        location: 'Conference Room B',
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Updated Title');
      expect(result.location).toBe('Conference Room B');
    });

    it('should reject update when end_time is before start_time', async () => {
      // Mock the initial select to fetch the existing meeting (QUA-06 always fetches)
      mockLimit.mockResolvedValueOnce([{
        id: 1,
        title: 'Existing Meeting',
        organizer_user_id: 10,
        start_time: new Date('2026-05-01T08:00:00Z'),
        end_time: new Date('2026-05-01T10:00:00Z'),
      }]);

      await expect(
        meetingService.update(1, {
          start_time: '2026-05-01T10:00:00Z',
          end_time: '2026-05-01T09:00:00Z',
        }),
      ).rejects.toThrow('end_time must be after start_time');
    });
  });

  // =========================================================================
  // 2. Meeting Calendar Data
  // =========================================================================

  describe('Meeting Calendar Data Retrieval', () => {
    it('should retrieve meetings for a user within a date range (organizer + invitee)', async () => {
      const meetingA = {
        id: 1,
        meeting_code: 'MTG-20260501-0001',
        title: 'Meeting A',
        start_time: new Date('2026-05-01T09:00:00Z'),
        organizer_user_id: 10,
      };
      const meetingB = {
        id: 2,
        meeting_code: 'MTG-20260502-0001',
        title: 'Meeting B',
        start_time: new Date('2026-05-02T09:00:00Z'),
        organizer_user_id: 20,
      };

      // getCalendarData call order:
      //   Query 1: select().from().where().orderBy()  — organizer meetings
      //   Query 2: select({}).from().innerJoin().where() — invitee meetings
      // mockWhere is called twice: first must return selectChain, second is terminal.
      mockWhere
        .mockReturnValueOnce(selectChain)       // query 1 .where() — chain continues
        .mockResolvedValueOnce([{ meeting: meetingB }]); // query 2 .where() — terminal
      mockOrderBy.mockResolvedValueOnce([meetingA]); // query 1 .orderBy() — terminal

      const result = await meetingService.getCalendarData(10, '2026-05-01', '2026-05-31');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Both meetings should be present (deduplicated)
      expect(result.length).toBe(2);
    });

    it('should deduplicate meetings when user is both organizer and invitee', async () => {
      const meeting = {
        id: 1,
        meeting_code: 'MTG-20260501-0001',
        title: 'Meeting A',
        start_time: new Date('2026-05-01T09:00:00Z'),
        organizer_user_id: 10,
      };

      // Same meeting returned for organizer and invitee
      mockWhere
        .mockReturnValueOnce(selectChain)       // query 1 .where() — chain continues
        .mockResolvedValueOnce([{ meeting }]);   // query 2 .where() — terminal
      mockOrderBy.mockResolvedValueOnce([meeting]); // query 1 .orderBy() — terminal

      const result = await meetingService.getCalendarData(10, '2026-05-01', '2026-05-31');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should return sorted results by start_time', async () => {
      const meeting1 = { id: 1, start_time: new Date('2026-05-03T09:00:00Z') };
      const meeting2 = { id: 2, start_time: new Date('2026-05-01T09:00:00Z') };

      mockWhere
        .mockReturnValueOnce(selectChain)         // query 1 .where() — chain continues
        .mockResolvedValueOnce([{ meeting: meeting2 }]); // query 2 .where() — terminal
      mockOrderBy.mockResolvedValueOnce([meeting1]); // query 1 .orderBy() — terminal

      const result = await meetingService.getCalendarData(10, '2026-05-01', '2026-05-31');

      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });
  });

  // =========================================================================
  // 3. Meeting Status Transitions
  // =========================================================================

  describe('Meeting Status Transitions', () => {
    describe('Complete', () => {
      it('should complete a SCHEDULED meeting', async () => {
        // Mock select for meeting lookup: select().from().where().limit(1)
        // .where() returns selectChain by default, .limit() resolves to meeting data
        mockLimit.mockResolvedValueOnce([{
          id: 1,
          meeting_code: 'MTG-20260501-0001',
          title: 'Client Review',
          meeting_status: 'SCHEDULED',
          organizer_user_id: 10,
          lead_id: null,
          prospect_id: null,
          client_id: 'CLI-001',
        }]);

        // Mock update returning: update().set().where().returning()
        const mockUpdateWhere = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValueOnce([{
            id: 1,
            meeting_status: 'COMPLETED',
            call_report_status: 'PENDING',
            completed_at: new Date(),
          }]),
        });
        mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

        // conversationHistory insert uses db.insert().values() — default chain is fine

        const result = await meetingService.complete(1, 10);

        expect(result).toBeDefined();
        expect(result.meeting_status).toBe('COMPLETED');
        expect(result.call_report_status).toBe('PENDING');
      });

      it('should reject completing a non-SCHEDULED meeting', async () => {
        mockLimit.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'COMPLETED',
          organizer_user_id: 10,
        }]);

        await expect(meetingService.complete(1, 10)).rejects.toThrow(
          'Cannot complete meeting in COMPLETED status',
        );
      });

      it('should reject completing a CANCELLED meeting', async () => {
        mockLimit.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'CANCELLED',
          organizer_user_id: 10,
        }]);

        await expect(meetingService.complete(1, 10)).rejects.toThrow(
          'Cannot complete meeting in CANCELLED status',
        );
      });

      it('should throw when meeting not found for complete', async () => {
        mockLimit.mockResolvedValueOnce([]);

        await expect(meetingService.complete(999, 10)).rejects.toThrow('Meeting not found');
      });
    });

    describe('Cancel', () => {
      it('should cancel a SCHEDULED meeting with reason', async () => {
        mockWhere.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'SCHEDULED',
          organizer_user_id: 10,
          title: 'Client Review',
          lead_id: null,
          prospect_id: null,
          client_id: null,
        }]);

        const mockUpdateWhere = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValueOnce([{
            id: 1,
            meeting_status: 'CANCELLED',
            cancel_reason: 'Client unavailable',
          }]),
        });
        mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

        // conversationHistory insert — default chain is fine

        const result = await meetingService.cancel(1, 'Client unavailable', 10);

        expect(result).toBeDefined();
        expect(result.meeting_status).toBe('CANCELLED');
        expect(result.cancel_reason).toBe('Client unavailable');
      });

      it('should reject cancel without reason', async () => {
        await expect(meetingService.cancel(1, '', 10)).rejects.toThrow(
          'cancel_reason is required',
        );
      });

      it('should reject cancel with whitespace-only reason', async () => {
        await expect(meetingService.cancel(1, '   ', 10)).rejects.toThrow(
          'cancel_reason is required',
        );
      });

      it('should reject cancelling a COMPLETED meeting', async () => {
        mockWhere.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'COMPLETED',
          organizer_user_id: 10,
        }]);

        await expect(meetingService.cancel(1, 'Some reason', 10)).rejects.toThrow(
          'Cannot cancel meeting in COMPLETED status',
        );
      });

      it('should reject cancelling an already CANCELLED meeting', async () => {
        mockWhere.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'CANCELLED',
          organizer_user_id: 10,
        }]);

        await expect(meetingService.cancel(1, 'Some reason', 10)).rejects.toThrow(
          'Cannot cancel meeting in CANCELLED status',
        );
      });

      it('should throw when meeting not found for cancel', async () => {
        mockWhere.mockResolvedValueOnce([]);

        await expect(meetingService.cancel(999, 'Reason', 10)).rejects.toThrow(
          'Meeting not found',
        );
      });
    });

    describe('Reschedule', () => {
      it('should reschedule a SCHEDULED meeting to new times', async () => {
        // Mock select: select().from().where().limit(1)
        mockLimit.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'SCHEDULED',
          organizer_user_id: 10,
          title: 'Team Sync',
          start_time: new Date('2026-05-01T09:00:00Z'),
          lead_id: null,
          prospect_id: null,
          client_id: null,
        }]);

        // Mock update: update().set().where().returning()
        const mockUpdateWhere = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValueOnce([{
            id: 1,
            meeting_status: 'SCHEDULED',
            start_time: new Date('2026-05-05T09:00:00Z'),
            end_time: new Date('2026-05-05T10:00:00Z'),
          }]),
        });
        mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

        // conversationHistory insert — default chain is fine

        const result = await meetingService.reschedule(
          1,
          '2026-05-05T09:00:00Z',
          '2026-05-05T10:00:00Z',
          10,
        );

        expect(result).toBeDefined();
        expect(result.meeting_status).toBe('SCHEDULED');
      });

      it('should reject reschedule when end_time is before start_time', async () => {
        await expect(
          meetingService.reschedule(1, '2026-05-05T10:00:00Z', '2026-05-05T09:00:00Z', 10),
        ).rejects.toThrow('end_time must be after start_time');
      });

      it('should reject rescheduling a COMPLETED meeting', async () => {
        mockLimit.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'COMPLETED',
          organizer_user_id: 10,
        }]);

        await expect(
          meetingService.reschedule(1, '2026-05-05T09:00:00Z', '2026-05-05T10:00:00Z', 10),
        ).rejects.toThrow('Cannot reschedule meeting in COMPLETED status');
      });

      it('should reject rescheduling a CANCELLED meeting', async () => {
        mockLimit.mockResolvedValueOnce([{
          id: 1,
          meeting_status: 'CANCELLED',
          organizer_user_id: 10,
        }]);

        await expect(
          meetingService.reschedule(1, '2026-05-05T09:00:00Z', '2026-05-05T10:00:00Z', 10),
        ).rejects.toThrow('Cannot reschedule meeting in CANCELLED status');
      });

      it('should throw when meeting not found for reschedule', async () => {
        mockLimit.mockResolvedValueOnce([]);

        await expect(
          meetingService.reschedule(999, '2026-05-05T09:00:00Z', '2026-05-05T10:00:00Z', 10),
        ).rejects.toThrow('Meeting not found');
      });
    });
  });

  // =========================================================================
  // 4. Meeting Invitee Management
  // =========================================================================

  describe('Meeting Invitee Management', () => {
    it('should create meeting with invitees', async () => {
      // Mock generateMeetingCode
      mockExecute.mockResolvedValueOnce({ rows: [] });

      // resolveRelationshipName — no client/lead/prospect, returns immediately

      // Mock meeting insert: insert().values().returning()
      mockReturning.mockResolvedValueOnce([{
        id: 1,
        meeting_code: 'MTG-20260501-0001',
        title: 'Team Meeting',
        meeting_status: 'SCHEDULED',
      }]);

      // invitees insert and conversationHistory insert both use
      // db.insert().values() without .returning() — default chain is fine

      const result = await meetingService.create({
        title: 'Team Meeting',
        meeting_type: 'IN_PERSON',
        organizer_user_id: 10,
        start_time: '2026-05-01T09:00:00Z',
        end_time: '2026-05-01T10:00:00Z',
        invitees: [
          { user_id: 20, is_required: true },
          { user_id: 30, is_required: false },
        ],
      });

      expect(result).toBeDefined();
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should replace invitees via updateInvitees', async () => {
      // updateInvitees call order:
      //   1. select().from().where().limit(1) — meeting lookup
      //   2. delete().where() — delete old invitees
      //   3. insert().values() — insert new invitees (no .returning())
      //   4. return select().from().where() — return new invitees

      // mockWhere called twice: call 1 returns selectChain (chain continues to .limit()),
      // call 2 is terminal (returns invitees)
      mockWhere
        .mockReturnValueOnce(selectChain)   // step 1 .where() — chain continues
        .mockResolvedValueOnce([            // step 4 .where() — terminal
          { id: 10, meeting_id: 1, user_id: 50, is_required: true },
        ]);

      // step 1 .limit() resolves with meeting data
      mockLimit.mockResolvedValueOnce([{
        id: 1,
        meeting_code: 'MTG-20260501-0001',
        meeting_status: 'SCHEDULED',
      }]);

      // step 2 delete
      deleteChain.where = vi.fn().mockResolvedValueOnce(undefined);
      mockDelete.mockReturnValue(deleteChain);

      // step 3 insert — default chain is fine (no .returning() called)

      const result = await meetingService.updateInvitees(1, [
        { user_id: 50, is_required: true },
      ]);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should throw when updating invitees for non-existent meeting', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await expect(
        meetingService.updateInvitees(999, [{ user_id: 50 }]),
      ).rejects.toThrow('Meeting not found');
    });

    it('should clear all invitees when empty array passed', async () => {
      // updateInvitees call order:
      //   1. select().from().where().limit(1) — meeting lookup
      //   2. delete().where() — delete old invitees
      //   3. (skipped — empty array)
      //   4. return select().from().where() — return invitees (empty)

      // mockWhere: call 1 returns selectChain, call 2 is terminal (empty array)
      mockWhere
        .mockReturnValueOnce(selectChain)   // step 1 .where() — chain continues
        .mockResolvedValueOnce([]);          // step 4 .where() — terminal

      mockLimit.mockResolvedValueOnce([{
        id: 1,
        meeting_code: 'MTG-20260501-0001',
      }]);

      // Mock delete
      deleteChain.where = vi.fn().mockResolvedValueOnce(undefined);
      mockDelete.mockReturnValue(deleteChain);

      const result = await meetingService.updateInvitees(1, []);

      expect(result).toBeDefined();
      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. Call Report CRUD
  // =========================================================================

  describe('Call Report CRUD', () => {
    it('should create a standalone call report with auto-generated CR-YYYYMM-NNNN code', async () => {
      // Mock generateReportCode() → db.execute()
      mockExecute.mockResolvedValueOnce({ rows: [] });

      mockReturning.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_type: 'STANDALONE',
        report_status: 'DRAFT',
        subject: 'Quarterly Review',
        summary: 'Discussed portfolio performance',
        filed_by: 10,
        meeting_date: '2026-05-01',
      }]);

      const result = await callReportService.create({
        filed_by: 10,
        meeting_date: '2026-05-01',
        meeting_type: 'IN_PERSON',
        subject: 'Quarterly Review',
        summary: 'Discussed portfolio performance',
      });

      expect(result).toBeDefined();
      expect(result.report_code).toMatch(/^CR-\d{6}-\d{4}$/);
      expect(result.report_status).toBe('DRAFT');
    });

    it('should create a SCHEDULED call report linked to a completed meeting', async () => {
      // Mock meeting lookup — COMPLETED
      mockWhere.mockResolvedValueOnce([{
        id: 5,
        meeting_status: 'COMPLETED',
      }]);

      // Mock generateReportCode() → db.execute()
      mockExecute.mockResolvedValueOnce({ rows: [] });

      mockReturning.mockResolvedValueOnce([{
        id: 2,
        report_code: 'CR-202605-0002',
        report_type: 'SCHEDULED',
        report_status: 'DRAFT',
        meeting_id: 5,
      }]);

      const result = await callReportService.create({
        report_type: 'SCHEDULED',
        meeting_id: 5,
        filed_by: 10,
        meeting_date: '2026-05-01',
        meeting_type: 'IN_PERSON',
        subject: 'Post-Meeting Report',
        summary: 'Meeting follow-up notes',
      });

      expect(result).toBeDefined();
      expect(result.report_type).toBe('SCHEDULED');
      expect(result.meeting_id).toBe(5);
    });

    it('should reject SCHEDULED report without meeting_id', async () => {
      await expect(
        callReportService.create({
          report_type: 'SCHEDULED',
          filed_by: 10,
          meeting_date: '2026-05-01',
          meeting_type: 'IN_PERSON',
          subject: 'Missing meeting',
          summary: 'No meeting',
        }),
      ).rejects.toThrow('meeting_id is required for SCHEDULED call reports');
    });

    it('should reject SCHEDULED report for non-COMPLETED meeting', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 5,
        meeting_status: 'SCHEDULED',
      }]);

      await expect(
        callReportService.create({
          report_type: 'SCHEDULED',
          meeting_id: 5,
          filed_by: 10,
          meeting_date: '2026-05-01',
          meeting_type: 'IN_PERSON',
          subject: 'Bad Report',
          summary: 'Not completed',
        }),
      ).rejects.toThrow('Meeting 5 must be COMPLETED before filing a call report');
    });

    it('should reject SCHEDULED report when meeting not found', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(
        callReportService.create({
          report_type: 'SCHEDULED',
          meeting_id: 999,
          filed_by: 10,
          meeting_date: '2026-05-01',
          meeting_type: 'IN_PERSON',
          subject: 'Missing',
          summary: 'Missing',
        }),
      ).rejects.toThrow('Meeting 999 not found');
    });

    it('should create call report with action items', async () => {
      // Mock generateReportCode() → db.execute()
      mockExecute.mockResolvedValueOnce({ rows: [] });

      mockReturning.mockResolvedValueOnce([{
        id: 3,
        report_code: 'CR-202605-0003',
        report_status: 'DRAFT',
      }]);

      // Mock action items insert
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const result = await callReportService.create({
        filed_by: 10,
        meeting_date: '2026-05-01',
        meeting_type: 'IN_PERSON',
        subject: 'With Actions',
        summary: 'Report with action items',
        action_items: [
          { description: 'Follow up on proposal', assigned_to: 20, due_date: '2026-05-15' },
          { description: 'Send documents', assigned_to: 10, due_date: '2026-05-10', priority: 'HIGH' },
        ],
      });

      expect(result).toBeDefined();
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should retrieve a call report by ID with action items', async () => {
      // Mock report select
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        subject: 'Test Report',
        report_status: 'DRAFT',
      }]);

      // Mock action items select
      mockOrderBy.mockResolvedValueOnce([
        { id: 1, call_report_id: 1, description: 'Action 1', due_date: '2026-05-10' },
        { id: 2, call_report_id: 1, description: 'Action 2', due_date: '2026-05-15' },
      ]);

      const result = await callReportService.getById(1);

      expect(result).toBeDefined();
      expect(result.report_code).toBe('CR-202605-0001');
      expect(result.actionItems).toHaveLength(2);
    });

    it('should throw when call report not found by ID', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(callReportService.getById(999)).rejects.toThrow('Call report 999 not found');
    });
  });

  // =========================================================================
  // 6. Call Report Update Restrictions
  // =========================================================================

  describe('Call Report Update — DRAFT/RETURNED Only', () => {
    it('should allow update when status is DRAFT', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'DRAFT',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          subject: 'Updated Subject',
          report_status: 'DRAFT',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await callReportService.update(1, { subject: 'Updated Subject' });

      expect(result).toBeDefined();
      expect(result.subject).toBe('Updated Subject');
    });

    it('should allow update when status is RETURNED', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'RETURNED',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          summary: 'Revised summary',
          report_status: 'RETURNED',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await callReportService.update(1, { summary: 'Revised summary' });

      expect(result).toBeDefined();
      expect(result.summary).toBe('Revised summary');
    });

    it('should reject update when status is APPROVED', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'APPROVED',
      }]);

      await expect(
        callReportService.update(1, { subject: 'Cannot Change' }),
      ).rejects.toThrow('Cannot update call report in status "APPROVED"');
    });

    it('should reject update when status is PENDING_APPROVAL', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'PENDING_APPROVAL',
      }]);

      await expect(
        callReportService.update(1, { subject: 'Cannot Change' }),
      ).rejects.toThrow('Cannot update call report in status "PENDING_APPROVAL"');
    });

    it('should throw when updating non-existent call report', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(
        callReportService.update(999, { subject: 'No Report' }),
      ).rejects.toThrow('Call report 999 not found');
    });

    it('should not allow modifying report_code or report_status directly', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'DRAFT',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          report_code: 'CR-202605-0001',
          report_status: 'DRAFT',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // The service strips out id, report_code, report_status from update data
      await callReportService.update(1, {
        report_code: 'CR-HACKED-9999',
        report_status: 'APPROVED',
        subject: 'Legit Update',
      } as any);

      // Verify the set call did NOT include report_code or report_status
      const setCallArgs = mockSet.mock.calls[0][0];
      expect(setCallArgs).not.toHaveProperty('report_code');
      expect(setCallArgs).not.toHaveProperty('report_status');
      expect(setCallArgs).not.toHaveProperty('id');
    });
  });

  // =========================================================================
  // 7. Call Report Submission Workflow
  // =========================================================================

  describe('Call Report Submission Workflow', () => {
    it('should auto-approve when filed within 5 business days', async () => {
      // Meeting was yesterday (1 business day ago assuming weekday)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const meetingDate = yesterday.toISOString().split('T')[0];

      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'DRAFT',
        filed_by: 10,
        meeting_date: meetingDate,
        meeting_id: null,
        lead_id: null,
        prospect_id: null,
        client_id: null,
        next_meeting_start: null,
        next_meeting_end: null,
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          report_status: 'APPROVED',
          requires_supervisor_approval: false,
          days_since_meeting: 1,
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // Mock conversationHistory insert
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const result = await callReportService.submit(1, 10);

      expect(result).toBeDefined();
      expect(result.report_status).toBe('APPROVED');
      expect(result.requires_supervisor_approval).toBe(false);
    });

    it('should route to supervisor approval when filed > 5 business days late', async () => {
      // Meeting was 10 business days ago
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 14); // ~10 business days
      const meetingDate = pastDate.toISOString().split('T')[0];

      mockWhere.mockResolvedValueOnce([{
        id: 2,
        report_code: 'CR-202605-0002',
        report_status: 'DRAFT',
        filed_by: 10,
        meeting_date: meetingDate,
        meeting_id: null,
        lead_id: null,
        prospect_id: null,
        client_id: null,
        next_meeting_start: null,
        next_meeting_end: null,
      }]);

      // Mock approval insert
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 2,
          report_status: 'PENDING_APPROVAL',
          requires_supervisor_approval: true,
          days_since_meeting: 10,
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // Mock conversationHistory insert
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const result = await callReportService.submit(2, 10);

      expect(result).toBeDefined();
      expect(result.report_status).toBe('PENDING_APPROVAL');
      expect(result.requires_supervisor_approval).toBe(true);
    });

    it('should reject submission of APPROVED report', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'APPROVED',
        filed_by: 10,
      }]);

      await expect(callReportService.submit(1, 10)).rejects.toThrow(
        'Cannot submit call report in status "APPROVED"',
      );
    });

    it('should reject submission of PENDING_APPROVAL report', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'PENDING_APPROVAL',
        filed_by: 10,
      }]);

      await expect(callReportService.submit(1, 10)).rejects.toThrow(
        'Cannot submit call report in status "PENDING_APPROVAL"',
      );
    });

    it('should allow re-submission of RETURNED report', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const meetingDate = yesterday.toISOString().split('T')[0];

      mockWhere.mockResolvedValueOnce([{
        id: 3,
        report_code: 'CR-202605-0003',
        report_status: 'RETURNED',
        filed_by: 10,
        meeting_date: meetingDate,
        meeting_id: null,
        lead_id: null,
        prospect_id: null,
        client_id: null,
        next_meeting_start: null,
        next_meeting_end: null,
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 3,
          report_status: 'APPROVED',
          requires_supervisor_approval: false,
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // Mock conversationHistory insert
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const result = await callReportService.submit(3, 10);

      expect(result).toBeDefined();
      expect(result.report_status).toBe('APPROVED');
    });

    it('should throw when submitting non-existent report', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(callReportService.submit(999, 10)).rejects.toThrow(
        'Call report 999 not found',
      );
    });

    it('should update meeting call_report_status to FILED when linked', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const meetingDate = yesterday.toISOString().split('T')[0];

      mockWhere.mockResolvedValueOnce([{
        id: 1,
        report_code: 'CR-202605-0001',
        report_status: 'DRAFT',
        filed_by: 10,
        meeting_date: meetingDate,
        meeting_id: 5,
        lead_id: null,
        prospect_id: null,
        client_id: null,
        next_meeting_start: null,
        next_meeting_end: null,
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          report_status: 'APPROVED',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // Mock meeting update (call_report_status = 'FILED')
      const mockMeetingUpdateWhere = vi.fn().mockResolvedValueOnce(undefined);
      mockSet.mockReturnValueOnce({ where: mockMeetingUpdateWhere });

      // Mock conversationHistory insert
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      await callReportService.submit(1, 10);

      // Verify update was called for meetings table
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 8. Business Day Calculation
  // =========================================================================

  describe('Business Day Calculation', () => {
    it('should count weekdays only between two dates', () => {
      // Monday to Friday = 5 business days
      const result = callReportService.calculateBusinessDays(
        '2026-05-04', // Monday
        new Date('2026-05-09'), // Saturday (exclusive)
      );
      expect(result).toBe(5);
    });

    it('should return 0 when end date is same as start date', () => {
      const result = callReportService.calculateBusinessDays(
        '2026-05-04',
        new Date('2026-05-04'),
      );
      expect(result).toBe(0);
    });

    it('should return 0 when end date is before start date', () => {
      const result = callReportService.calculateBusinessDays(
        '2026-05-04',
        new Date('2026-05-01'),
      );
      expect(result).toBe(0);
    });

    it('should skip weekends in count', () => {
      // Monday May 4 to Monday May 11 = 5 business days (Sat/Sun excluded)
      const result = callReportService.calculateBusinessDays(
        '2026-05-04',
        new Date('2026-05-11'),
      );
      expect(result).toBe(5);
    });

    it('should count across two weeks correctly', () => {
      // 2 full weeks (Mon to Mon) = 10 business days
      const result = callReportService.calculateBusinessDays(
        '2026-05-04',
        new Date('2026-05-18'),
      );
      expect(result).toBe(10);
    });

    it('should handle start on Saturday correctly', () => {
      // Saturday May 2 to Monday May 4 = 0 business days (Sat/Sun skipped)
      const result = callReportService.calculateBusinessDays(
        '2026-05-02', // Saturday
        new Date('2026-05-04'), // Monday
      );
      expect(result).toBe(0);
    });

    it('should handle start on Sunday correctly', () => {
      // Sunday May 3 to Monday May 4 = 0 business days (Sun skipped)
      const result = callReportService.calculateBusinessDays(
        '2026-05-03', // Sunday
        new Date('2026-05-04'), // Monday
      );
      expect(result).toBe(0);
    });
  });

  // =========================================================================
  // 9. Call Report Number Format Validation
  // =========================================================================

  describe('Call Report Number Format — CR-YYYYMM-NNNN', () => {
    it('should match CR-YYYYMM-NNNN pattern', () => {
      const pattern = /^CR-\d{6}-\d{4}$/;
      expect(pattern.test('CR-202605-0001')).toBe(true);
      expect(pattern.test('CR-202612-9999')).toBe(true);
      expect(pattern.test('CR-202601-0100')).toBe(true);
    });

    it('should not match invalid formats', () => {
      const pattern = /^CR-\d{6}-\d{4}$/;
      expect(pattern.test('CR-20260-0001')).toBe(false); // 5-digit year-month
      expect(pattern.test('CR-202605-001')).toBe(false); // 3-digit sequence
      expect(pattern.test('CR-202605-00001')).toBe(false); // 5-digit sequence
      expect(pattern.test('MTG-202605-0001')).toBe(false); // Wrong prefix
      expect(pattern.test('cr-202605-0001')).toBe(false); // Lowercase
    });
  });

  // =========================================================================
  // 10. Meeting Code Format Validation
  // =========================================================================

  describe('Meeting Code Format — MTG-YYYYMMDD-NNNN', () => {
    it('should match MTG-YYYYMMDD-NNNN pattern', () => {
      const pattern = /^MTG-\d{8}-\d{4}$/;
      expect(pattern.test('MTG-20260501-0001')).toBe(true);
      expect(pattern.test('MTG-20261231-9999')).toBe(true);
      expect(pattern.test('MTG-20260101-0100')).toBe(true);
    });

    it('should not match invalid formats', () => {
      const pattern = /^MTG-\d{8}-\d{4}$/;
      expect(pattern.test('MTG-2026051-0001')).toBe(false); // 7-digit date
      expect(pattern.test('MTG-20260501-001')).toBe(false); // 3-digit sequence
      expect(pattern.test('CR-20260501-0001')).toBe(false); // Wrong prefix
    });
  });

  // =========================================================================
  // 11. Service Exports & Method Verification
  // =========================================================================

  describe('Service Exports', () => {
    it('meetingService should export all required methods', () => {
      expect(typeof meetingService.create).toBe('function');
      expect(typeof meetingService.getById).toBe('function');
      expect(typeof meetingService.update).toBe('function');
      expect(typeof meetingService.complete).toBe('function');
      expect(typeof meetingService.cancel).toBe('function');
      expect(typeof meetingService.reschedule).toBe('function');
      expect(typeof meetingService.getCalendarData).toBe('function');
      expect(typeof meetingService.getTeamCalendar).toBe('function');
      expect(typeof meetingService.getPendingReminders).toBe('function');
      expect(typeof meetingService.markReminderSent).toBe('function');
      expect(typeof meetingService.getFilteredCalendarData).toBe('function');
      expect(typeof meetingService.updateInvitees).toBe('function');
    });

    it('callReportService should export all required methods', () => {
      expect(typeof callReportService.create).toBe('function');
      expect(typeof callReportService.update).toBe('function');
      expect(typeof callReportService.submit).toBe('function');
      expect(typeof callReportService.getAll).toBe('function');
      expect(typeof callReportService.getById).toBe('function');
      expect(typeof callReportService.calculateBusinessDays).toBe('function');
    });
  });
});
