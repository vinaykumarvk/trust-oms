/**
 * E2E Opportunity, Task & Notification Tests — CRM Phases 7 & 8
 *
 * Verifies:
 * - Opportunity CRUD with auto-generated code (OPP-NNNNNN)
 * - Opportunity stage progression (IDENTIFIED -> QUALIFYING -> PROPOSAL -> NEGOTIATION -> WON)
 * - Stage validation (invalid transitions blocked)
 * - Loss reason mandatory for LOST stage
 * - Pipeline dashboard aggregation
 * - Task CRUD with auto-generated code (TSK-NNNNNN)
 * - Task status transitions
 * - Overdue task detection
 * - Notification creation (notify, notifyMultiple)
 * - Notification read/unread tracking
 * - Notification pagination
 *
 * Uses Vitest mocks — no real DB connection required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the DB module to prevent real connections (vi.hoisted for hoisting)
// ---------------------------------------------------------------------------

const {
  mockSelect, mockInsert, mockUpdate, mockFrom, mockWhere,
  mockReturning, mockValues, mockSet, mockGroupBy, mockOrderBy,
  mockLimit, mockOffset, mockExecute,
  selectChain, insertChain, updateChain,
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
  const _mockExecute = vi.fn();

  // Build chain object first, then configure mocks to return it
  const _selectChain: Record<string, any> = {};
  _selectChain.from = _mockFrom;
  _selectChain.where = _mockWhere;
  _selectChain.groupBy = _mockGroupBy;
  _selectChain.orderBy = _mockOrderBy;
  _selectChain.limit = _mockLimit;
  _selectChain.offset = _mockOffset;

  // Configure each mock to return the chain
  _mockFrom.mockReturnValue(_selectChain);
  _mockWhere.mockReturnValue(_selectChain);
  _mockGroupBy.mockReturnValue(_selectChain);
  _mockOrderBy.mockReturnValue(_selectChain);
  _mockLimit.mockReturnValue(_selectChain);
  _mockOffset.mockReturnValue(_selectChain);

  const _insertChain = {
    values: _mockValues.mockReturnValue({ returning: _mockReturning }),
  };

  const _updateChain = {
    set: _mockSet.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: _mockReturning }) }),
  };

  return {
    mockSelect: _mockSelect, mockInsert: _mockInsert, mockUpdate: _mockUpdate,
    mockFrom: _mockFrom, mockWhere: _mockWhere, mockReturning: _mockReturning,
    mockValues: _mockValues, mockSet: _mockSet, mockGroupBy: _mockGroupBy,
    mockOrderBy: _mockOrderBy, mockLimit: _mockLimit, mockOffset: _mockOffset,
    mockExecute: _mockExecute,
    selectChain: _selectChain, insertChain: _insertChain, updateChain: _updateChain,
  };
});

vi.mock('../../server/db', () => ({
  db: {
    select: mockSelect.mockReturnValue(selectChain),
    insert: mockInsert.mockReturnValue(insertChain),
    update: mockUpdate.mockReturnValue(updateChain),
    execute: mockExecute,
  },
}));

vi.mock('../../server/services/audit-logger', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import services under test — AFTER mocks are set up
// ---------------------------------------------------------------------------

import { opportunityService } from '../../server/services/opportunity-service';
import { taskManagementService } from '../../server/services/task-management-service';
import { notificationInboxService } from '../../server/services/notification-inbox-service';

// ===========================================================================
// Test Suite
// ===========================================================================

describe('Opportunity, Task & Notification — CRM Phases 7 & 8', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Re-establish default chain returns after resetAllMocks
    mockFrom.mockReturnValue(selectChain);
    mockWhere.mockReturnValue(selectChain);
    mockGroupBy.mockReturnValue(selectChain);
    mockOrderBy.mockReturnValue(selectChain);
    mockLimit.mockReturnValue(selectChain);
    mockOffset.mockReturnValue(selectChain);
    mockSelect.mockReturnValue(selectChain);
    mockInsert.mockReturnValue(insertChain);
    mockUpdate.mockReturnValue(updateChain);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockSet.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockReturning }) });
  });

  // =========================================================================
  // 1. Opportunity CRUD
  // =========================================================================

  describe('Opportunity CRUD', () => {
    it('should create an opportunity with auto-generated OPP-NNNNNN code', async () => {
      // Mock generateOpportunityCode — no existing opportunities
      mockExecute.mockResolvedValueOnce({ rows: [] });

      mockReturning.mockResolvedValueOnce([{
        id: 1,
        opportunity_code: 'OPP-000001',
        name: 'Investment Portfolio Upsell',
        stage: 'IDENTIFIED',
        pipeline_value: '5000000',
        pipeline_currency: 'PHP',
      }]);

      const result = await opportunityService.create({
        name: 'Investment Portfolio Upsell',
        pipeline_value: '5000000',
        probability: 30,
      });

      expect(result).toBeDefined();
      expect(result.opportunity_code).toMatch(/^OPP-\d{6}$/);
      expect(result.stage).toBe('IDENTIFIED');
      expect(result.pipeline_currency).toBe('PHP');
    });

    it('should increment opportunity code from last existing', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ opportunity_code: 'OPP-000042' }],
      });

      mockReturning.mockResolvedValueOnce([{
        id: 2,
        opportunity_code: 'OPP-000043',
        name: 'Trust Fund Setup',
        stage: 'IDENTIFIED',
      }]);

      const result = await opportunityService.create({
        name: 'Trust Fund Setup',
      });

      expect(result).toBeDefined();
      expect(result.opportunity_code).toBe('OPP-000043');
    });

    it('should default pipeline_currency to PHP', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });

      mockReturning.mockResolvedValueOnce([{
        id: 1,
        opportunity_code: 'OPP-000001',
        pipeline_currency: 'PHP',
        stage: 'IDENTIFIED',
      }]);

      const result = await opportunityService.create({
        name: 'Test Opportunity',
      });

      expect(result.pipeline_currency).toBe('PHP');
    });

    it('should retrieve an opportunity by ID', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        opportunity_code: 'OPP-000001',
        name: 'Investment Portfolio Upsell',
        stage: 'QUALIFYING',
        pipeline_value: '5000000',
      }]);

      const result = await opportunityService.getById(1);

      expect(result).toBeDefined();
      expect(result.opportunity_code).toBe('OPP-000001');
      expect(result.name).toBe('Investment Portfolio Upsell');
    });

    it('should throw when opportunity not found by ID', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(opportunityService.getById(999)).rejects.toThrow('Opportunity not found');
    });

    it('should update opportunity fields', async () => {
      // Mock the initial select to fetch existing opportunity (service reads before update)
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        name: 'Old Opportunity',
        opportunity_code: 'OPP-000001',
        pipeline_value: '5000000',
        lead_id: null,
        prospect_id: null,
        client_id: null,
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          name: 'Updated Opportunity',
          pipeline_value: '7500000',
          probability: 60,
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // Mock conversationHistory insert (service logs field updates)
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const result = await opportunityService.update(1, {
        name: 'Updated Opportunity',
        pipeline_value: '7500000',
        probability: 60,
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Updated Opportunity');
      expect(result.pipeline_value).toBe('7500000');
    });
  });

  // =========================================================================
  // 2. Opportunity Stage Progression
  // =========================================================================

  describe('Opportunity Stage Progression', () => {
    it('should progress from IDENTIFIED to QUALIFYING', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'IDENTIFIED',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          stage: 'QUALIFYING',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await opportunityService.updateStage(1, 'QUALIFYING');
      expect(result.stage).toBe('QUALIFYING');
    });

    it('should progress from QUALIFYING to PROPOSAL', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'QUALIFYING',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          stage: 'PROPOSAL',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await opportunityService.updateStage(1, 'PROPOSAL');
      expect(result.stage).toBe('PROPOSAL');
    });

    it('should progress from PROPOSAL to NEGOTIATION', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'PROPOSAL',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          stage: 'NEGOTIATION',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await opportunityService.updateStage(1, 'NEGOTIATION');
      expect(result.stage).toBe('NEGOTIATION');
    });

    it('should progress from NEGOTIATION to WON and set won_date', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'NEGOTIATION',
        name: 'Test Opp',
        opportunity_code: 'OPP-000001',
        lead_id: null,
        prospect_id: null,
        client_id: null,
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          stage: 'WON',
          won_date: new Date(),
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // Mock conversationHistory insert for WON stage
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const result = await opportunityService.updateStage(1, 'WON');
      expect(result.stage).toBe('WON');
      expect(result.won_date).toBeDefined();
    });

    it('should allow transition from any active stage to LOST with reason', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'PROPOSAL',
        name: 'Test Opp',
        opportunity_code: 'OPP-000001',
        lead_id: null,
        prospect_id: null,
        client_id: null,
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          stage: 'LOST',
          loss_reason: 'Competitor offered better terms',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // Mock conversationHistory insert for LOST stage
      mockValues.mockReturnValueOnce({ returning: vi.fn().mockResolvedValueOnce([{}]) });

      const result = await opportunityService.updateStage(1, 'LOST', 'Competitor offered better terms');
      expect(result.stage).toBe('LOST');
      expect(result.loss_reason).toBe('Competitor offered better terms');
    });
  });

  // =========================================================================
  // 3. Stage Validation — Invalid Transitions
  // =========================================================================

  describe('Opportunity Stage Validation — Invalid Transitions', () => {
    it('should reject invalid stage value', async () => {
      await expect(
        opportunityService.updateStage(1, 'INVALID_STAGE'),
      ).rejects.toThrow('Invalid stage: INVALID_STAGE');
    });

    it('should reject stage change on WON opportunity', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'WON',
      }]);

      await expect(
        opportunityService.updateStage(1, 'NEGOTIATION'),
      ).rejects.toThrow('Cannot change stage of WON or LOST opportunities');
    });

    it('should reject stage change on LOST opportunity', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'LOST',
      }]);

      await expect(
        opportunityService.updateStage(1, 'QUALIFYING'),
      ).rejects.toThrow('Cannot change stage of WON or LOST opportunities');
    });

    it('should throw when opportunity not found for stage update', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(
        opportunityService.updateStage(999, 'QUALIFYING'),
      ).rejects.toThrow('Opportunity not found');
    });
  });

  // =========================================================================
  // 4. Loss Reason Mandatory for LOST Stage
  // =========================================================================

  describe('Loss Reason Mandatory for LOST Stage', () => {
    it('should reject LOST stage without loss_reason', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'NEGOTIATION',
      }]);

      await expect(
        opportunityService.updateStage(1, 'LOST'),
      ).rejects.toThrow('loss_reason is mandatory for LOST stage');
    });

    it('should reject LOST stage with empty loss_reason', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'NEGOTIATION',
      }]);

      await expect(
        opportunityService.updateStage(1, 'LOST', ''),
      ).rejects.toThrow('loss_reason is mandatory for LOST stage');
    });

    it('should reject LOST stage with whitespace-only loss_reason', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'NEGOTIATION',
      }]);

      await expect(
        opportunityService.updateStage(1, 'LOST', '   '),
      ).rejects.toThrow('loss_reason is mandatory for LOST stage');
    });

    it('should accept LOST stage with valid loss_reason', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        stage: 'QUALIFYING',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          stage: 'LOST',
          loss_reason: 'Client chose another provider',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await opportunityService.updateStage(1, 'LOST', 'Client chose another provider');
      expect(result.stage).toBe('LOST');
    });
  });

  // =========================================================================
  // 5. Pipeline Dashboard Aggregation
  // =========================================================================

  describe('Pipeline Dashboard Aggregation', () => {
    it('should aggregate pipeline data by stage', async () => {
      mockGroupBy.mockResolvedValueOnce([
        { stage: 'IDENTIFIED', count: 5, total_value: '10000000', weighted_value: '2000000' },
        { stage: 'QUALIFYING', count: 3, total_value: '7500000', weighted_value: '3000000' },
        { stage: 'PROPOSAL', count: 2, total_value: '15000000', weighted_value: '9000000' },
        { stage: 'WON', count: 1, total_value: '5000000', weighted_value: '5000000' },
      ]);

      const result = await opportunityService.getPipelineDashboard();

      expect(result).toBeDefined();
      expect(result.by_stage).toHaveLength(4);
      expect(result.total_pipeline_value).toBe(37500000);
      expect(result.weighted_pipeline_value).toBe(19000000);
    });

    it('should return zeros when no opportunities exist', async () => {
      mockGroupBy.mockResolvedValueOnce([]);

      const result = await opportunityService.getPipelineDashboard();

      expect(result.by_stage).toHaveLength(0);
      expect(result.total_pipeline_value).toBe(0);
      expect(result.weighted_pipeline_value).toBe(0);
    });

    it('should handle stages with null pipeline values gracefully', async () => {
      mockGroupBy.mockResolvedValueOnce([
        { stage: 'IDENTIFIED', count: 2, total_value: '0', weighted_value: '0' },
      ]);

      const result = await opportunityService.getPipelineDashboard();

      expect(result.total_pipeline_value).toBe(0);
      expect(result.weighted_pipeline_value).toBe(0);
    });
  });

  // =========================================================================
  // 6. Opportunity Code Format
  // =========================================================================

  describe('Opportunity Code Format — OPP-NNNNNN', () => {
    it('should match OPP-NNNNNN pattern', () => {
      const pattern = /^OPP-\d{6}$/;
      expect(pattern.test('OPP-000001')).toBe(true);
      expect(pattern.test('OPP-999999')).toBe(true);
      expect(pattern.test('OPP-000100')).toBe(true);
    });

    it('should not match invalid formats', () => {
      const pattern = /^OPP-\d{6}$/;
      expect(pattern.test('OPP-00001')).toBe(false); // 5 digits
      expect(pattern.test('OPP-0000001')).toBe(false); // 7 digits
      expect(pattern.test('TSK-000001')).toBe(false); // Wrong prefix
      expect(pattern.test('opp-000001')).toBe(false); // Lowercase
    });
  });

  // =========================================================================
  // 7. Task CRUD
  // =========================================================================

  describe('Task CRUD', () => {
    it('should create a task with auto-generated TSK-NNNNNN code', async () => {
      // Mock generateTaskCode — no existing tasks
      mockExecute.mockResolvedValueOnce({ rows: [] });

      mockReturning.mockResolvedValueOnce([{
        id: 1,
        task_code: 'TSK-000001',
        title: 'Follow up with client',
        task_status: 'PENDING',
        priority: 'MEDIUM',
      }]);

      const result = await taskManagementService.create({
        title: 'Follow up with client',
      });

      expect(result).toBeDefined();
      expect(result.task_code).toMatch(/^TSK-\d{6}$/);
      expect(result.task_status).toBe('PENDING');
      expect(result.priority).toBe('MEDIUM');
    });

    it('should increment task code from last existing', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ task_code: 'TSK-000015' }],
      });

      mockReturning.mockResolvedValueOnce([{
        id: 2,
        task_code: 'TSK-000016',
        title: 'Prepare proposal',
        task_status: 'PENDING',
      }]);

      const result = await taskManagementService.create({
        title: 'Prepare proposal',
        priority: 'HIGH',
      });

      expect(result).toBeDefined();
      expect(result.task_code).toBe('TSK-000016');
    });

    it('should create task with all optional fields', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });

      mockReturning.mockResolvedValueOnce([{
        id: 3,
        task_code: 'TSK-000001',
        title: 'Detailed Task',
        description: 'Full description here',
        task_type: 'FOLLOW_UP',
        priority: 'HIGH',
        due_date: '2026-05-15',
        reminder_date: '2026-05-14',
        assigned_to: 20,
        assigned_by: 10,
        related_entity_type: 'OPPORTUNITY',
        related_entity_id: 5,
        task_status: 'PENDING',
      }]);

      // Mock the notification insert for task assignment (P1-09)
      mockReturning.mockResolvedValueOnce([{
        id: 100,
        recipient_user_id: 20,
        type: 'TASK_ASSIGNED',
        title: 'New Task Assigned',
      }]);

      const result = await taskManagementService.create({
        title: 'Detailed Task',
        description: 'Full description here',
        task_type: 'FOLLOW_UP',
        priority: 'HIGH',
        due_date: '2026-05-15',
        reminder_date: '2026-05-14',
        assigned_to: 20,
        assigned_by: 10,
        assigned_by_role: 'BO_HEAD', // Exempt from branch check
        related_entity_type: 'OPPORTUNITY',
        related_entity_id: 5,
      });

      expect(result).toBeDefined();
      expect(result.priority).toBe('HIGH');
      expect(result.assigned_to).toBe(20);
    });

    it('should retrieve a task by ID', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        task_code: 'TSK-000001',
        title: 'Follow up with client',
        task_status: 'PENDING',
        priority: 'MEDIUM',
      }]);

      const result = await taskManagementService.getById(1);

      expect(result).toBeDefined();
      expect(result.task_code).toBe('TSK-000001');
    });

    it('should throw when task not found by ID', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(taskManagementService.getById(999)).rejects.toThrow('Task not found');
    });

    it('should update task fields', async () => {
      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          title: 'Updated Task Title',
          priority: 'HIGH',
          due_date: '2026-06-01',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await taskManagementService.update(1, {
        title: 'Updated Task Title',
        priority: 'HIGH',
        due_date: '2026-06-01',
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Updated Task Title');
      expect(result.priority).toBe('HIGH');
    });
  });

  // =========================================================================
  // 8. Task Status Transitions
  // =========================================================================

  describe('Task Status Transitions', () => {
    it('should transition PENDING to IN_PROGRESS', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        task_status: 'PENDING',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          task_status: 'IN_PROGRESS',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await taskManagementService.updateStatus(1, 'IN_PROGRESS');
      expect(result.task_status).toBe('IN_PROGRESS');
    });

    it('should transition IN_PROGRESS to COMPLETED with notes', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        task_status: 'IN_PROGRESS',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          task_status: 'COMPLETED',
          completed_at: new Date(),
          completion_notes: 'All items addressed',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await taskManagementService.updateStatus(1, 'COMPLETED', 'All items addressed');
      expect(result.task_status).toBe('COMPLETED');
      expect(result.completed_at).toBeDefined();
      expect(result.completion_notes).toBe('All items addressed');
    });

    it('should transition PENDING to CANCELLED', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        task_status: 'PENDING',
      }]);

      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          task_status: 'CANCELLED',
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await taskManagementService.updateStatus(1, 'CANCELLED');
      expect(result.task_status).toBe('CANCELLED');
    });

    it('should reject status change on COMPLETED task', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        task_status: 'COMPLETED',
      }]);

      await expect(
        taskManagementService.updateStatus(1, 'IN_PROGRESS'),
      ).rejects.toThrow('Cannot change status of COMPLETED or CANCELLED tasks');
    });

    it('should reject status change on CANCELLED task', async () => {
      mockWhere.mockResolvedValueOnce([{
        id: 1,
        task_status: 'CANCELLED',
      }]);

      await expect(
        taskManagementService.updateStatus(1, 'PENDING'),
      ).rejects.toThrow('Cannot change status of COMPLETED or CANCELLED tasks');
    });

    it('should reject invalid status value', async () => {
      await expect(
        taskManagementService.updateStatus(1, 'INVALID_STATUS'),
      ).rejects.toThrow('Invalid status: INVALID_STATUS');
    });

    it('should throw when task not found for status update', async () => {
      mockWhere.mockResolvedValueOnce([]);

      await expect(
        taskManagementService.updateStatus(999, 'IN_PROGRESS'),
      ).rejects.toThrow('Task not found');
    });
  });

  // =========================================================================
  // 9. Overdue Task Detection
  // =========================================================================

  describe('Overdue Task Detection', () => {
    it('should return tasks past due_date that are not COMPLETED or CANCELLED', async () => {
      const overdueTasks = [
        { id: 1, task_code: 'TSK-000001', task_status: 'PENDING', due_date: '2026-04-01' },
        { id: 2, task_code: 'TSK-000002', task_status: 'IN_PROGRESS', due_date: '2026-04-10' },
      ];

      mockWhere.mockResolvedValueOnce(overdueTasks);

      const result = await taskManagementService.getOverdueTasks();

      expect(result).toHaveLength(2);
      expect(result[0].task_status).not.toBe('COMPLETED');
      expect(result[0].task_status).not.toBe('CANCELLED');
      expect(result[1].task_status).not.toBe('COMPLETED');
      expect(result[1].task_status).not.toBe('CANCELLED');
    });

    it('should return empty array when no overdue tasks', async () => {
      mockWhere.mockResolvedValueOnce([]);

      const result = await taskManagementService.getOverdueTasks();

      expect(result).toHaveLength(0);
    });

    it('should detect tasks needing reminders', async () => {
      const reminderTasks = [
        { id: 3, task_code: 'TSK-000003', task_status: 'PENDING', reminder_date: '2026-04-23' },
      ];

      mockWhere.mockResolvedValueOnce(reminderTasks);

      const result = await taskManagementService.getTasksNeedingReminder();

      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // 10. Task Code Format
  // =========================================================================

  describe('Task Code Format — TSK-NNNNNN', () => {
    it('should match TSK-NNNNNN pattern', () => {
      const pattern = /^TSK-\d{6}$/;
      expect(pattern.test('TSK-000001')).toBe(true);
      expect(pattern.test('TSK-999999')).toBe(true);
      expect(pattern.test('TSK-000100')).toBe(true);
    });

    it('should not match invalid formats', () => {
      const pattern = /^TSK-\d{6}$/;
      expect(pattern.test('TSK-00001')).toBe(false); // 5 digits
      expect(pattern.test('TSK-0000001')).toBe(false); // 7 digits
      expect(pattern.test('OPP-000001')).toBe(false); // Wrong prefix
      expect(pattern.test('tsk-000001')).toBe(false); // Lowercase
    });
  });

  // =========================================================================
  // 11. Notification Creation
  // =========================================================================

  describe('Notification Creation', () => {
    it('should create a single notification via notify()', async () => {
      mockReturning.mockResolvedValueOnce([{
        id: 1,
        recipient_user_id: 10,
        type: 'MEETING_REMINDER',
        title: 'Meeting in 30 minutes',
        message: 'Your meeting with Client A is starting soon',
        channel: 'IN_APP',
        is_read: false,
      }]);

      const result = await notificationInboxService.notify({
        recipient_user_id: 10,
        type: 'MEETING_REMINDER',
        title: 'Meeting in 30 minutes',
        message: 'Your meeting with Client A is starting soon',
      });

      expect(result).toBeDefined();
      expect(result.recipient_user_id).toBe(10);
      expect(result.type).toBe('MEETING_REMINDER');
      expect(result.is_read).toBe(false);
      expect(result.channel).toBe('IN_APP');
    });

    it('should default channel to IN_APP when not specified', async () => {
      mockReturning.mockResolvedValueOnce([{
        id: 2,
        recipient_user_id: 20,
        type: 'TASK_ASSIGNED',
        title: 'New task assigned',
        channel: 'IN_APP',
        is_read: false,
      }]);

      const result = await notificationInboxService.notify({
        recipient_user_id: 20,
        type: 'TASK_ASSIGNED',
        title: 'New task assigned',
      });

      expect(result.channel).toBe('IN_APP');
    });

    it('should create notifications for multiple users via notifyMultiple()', async () => {
      mockReturning.mockResolvedValueOnce([
        { id: 1, recipient_user_id: 10, type: 'ANNOUNCEMENT', title: 'System Update', is_read: false },
        { id: 2, recipient_user_id: 20, type: 'ANNOUNCEMENT', title: 'System Update', is_read: false },
        { id: 3, recipient_user_id: 30, type: 'ANNOUNCEMENT', title: 'System Update', is_read: false },
      ]);

      const result = await notificationInboxService.notifyMultiple(
        [10, 20, 30],
        {
          type: 'ANNOUNCEMENT',
          title: 'System Update',
          message: 'System maintenance scheduled',
        },
      );

      expect(result).toHaveLength(3);
      expect(result[0].recipient_user_id).toBe(10);
      expect(result[1].recipient_user_id).toBe(20);
      expect(result[2].recipient_user_id).toBe(30);
    });

    it('should return empty array when notifyMultiple called with empty user list', async () => {
      const result = await notificationInboxService.notifyMultiple(
        [],
        {
          type: 'ANNOUNCEMENT',
          title: 'No Recipients',
        },
      );

      expect(result).toHaveLength(0);
      // Verify no DB insert was made
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should create notification with related entity reference', async () => {
      mockReturning.mockResolvedValueOnce([{
        id: 4,
        recipient_user_id: 10,
        type: 'OPPORTUNITY_WON',
        title: 'Opportunity Won!',
        related_entity_type: 'OPPORTUNITY',
        related_entity_id: 42,
        is_read: false,
      }]);

      const result = await notificationInboxService.notify({
        recipient_user_id: 10,
        type: 'OPPORTUNITY_WON',
        title: 'Opportunity Won!',
        related_entity_type: 'OPPORTUNITY',
        related_entity_id: 42,
      });

      expect(result.related_entity_type).toBe('OPPORTUNITY');
      expect(result.related_entity_id).toBe(42);
    });
  });

  // =========================================================================
  // 12. Notification Read/Unread Tracking
  // =========================================================================

  describe('Notification Read/Unread Tracking', () => {
    it('should mark a single notification as read', async () => {
      const mockUpdateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([{
          id: 1,
          recipient_user_id: 10,
          is_read: true,
          read_at: new Date(),
        }]),
      });
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      const result = await notificationInboxService.markAsRead(1, 10);

      expect(result).toBeDefined();
      expect(result.is_read).toBe(true);
      expect(result.read_at).toBeDefined();
    });

    it('should mark all notifications as read for a user', async () => {
      const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
      mockSet.mockReturnValueOnce({ where: mockUpdateWhere });

      // markAllAsRead returns void
      await notificationInboxService.markAllAsRead(10);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          is_read: true,
        }),
      );
    });

    it('should return unread count for a user', async () => {
      mockWhere.mockResolvedValueOnce([{ count: 5 }]);

      const result = await notificationInboxService.getUnreadCount(10);

      expect(result).toBe(5);
    });

    it('should return 0 unread count when all notifications are read', async () => {
      mockWhere.mockResolvedValueOnce([{ count: 0 }]);

      const result = await notificationInboxService.getUnreadCount(10);

      expect(result).toBe(0);
    });
  });

  // =========================================================================
  // 13. Notification Pagination
  // =========================================================================

  describe('Notification Pagination', () => {
    it('should list notifications with default pagination (page 1, pageSize 20)', async () => {
      const notifications = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        recipient_user_id: 10,
        type: 'INFO',
        title: `Notification ${i + 1}`,
        is_read: false,
      }));

      // Mock paginated results
      mockOffset.mockResolvedValueOnce(notifications);

      // Mock count (first where call returns chain for data query, second returns count)
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 5 }]);

      const result = await notificationInboxService.listForUser(10);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should paginate with custom page and pageSize', async () => {
      const notifications = [
        { id: 11, recipient_user_id: 10, type: 'INFO', title: 'Notification 11', is_read: true },
        { id: 12, recipient_user_id: 10, type: 'INFO', title: 'Notification 12', is_read: false },
      ];

      mockOffset.mockResolvedValueOnce(notifications);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 22 }]);

      const result = await notificationInboxService.listForUser(10, 2, 10);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(22);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
    });

    it('should return empty data with correct pagination when no notifications', async () => {
      mockOffset.mockResolvedValueOnce([]);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 0 }]);

      const result = await notificationInboxService.listForUser(10);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
    });
  });

  // =========================================================================
  // 14. Opportunity Listing with Filters
  // =========================================================================

  describe('Opportunity Listing', () => {
    it('should list opportunities with pagination', async () => {
      const opps = [
        { id: 1, opportunity_code: 'OPP-000001', stage: 'IDENTIFIED' },
        { id: 2, opportunity_code: 'OPP-000002', stage: 'QUALIFYING' },
      ];

      mockOffset.mockResolvedValueOnce(opps);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 2 }]);

      const result = await opportunityService.list({ page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('should filter opportunities by stage', async () => {
      mockOffset.mockResolvedValueOnce([
        { id: 1, opportunity_code: 'OPP-000001', stage: 'PROPOSAL' },
      ]);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 1 }]);

      const result = await opportunityService.list({ stage: 'PROPOSAL' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].stage).toBe('PROPOSAL');
    });
  });

  // =========================================================================
  // 15. Task Listing with Filters
  // =========================================================================

  describe('Task Listing', () => {
    it('should list tasks with pagination', async () => {
      const tasks = [
        { id: 1, task_code: 'TSK-000001', task_status: 'PENDING' },
        { id: 2, task_code: 'TSK-000002', task_status: 'IN_PROGRESS' },
      ];

      mockOffset.mockResolvedValueOnce(tasks);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 2 }]);

      const result = await taskManagementService.list({ page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter tasks by assigned_to', async () => {
      mockOffset.mockResolvedValueOnce([
        { id: 1, task_code: 'TSK-000001', assigned_to: 10, task_status: 'PENDING' },
      ]);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 1 }]);

      const result = await taskManagementService.list({ assigned_to: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].assigned_to).toBe(10);
    });

    it('should filter tasks by status', async () => {
      mockOffset.mockResolvedValueOnce([]);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 0 }]);

      const result = await taskManagementService.list({ task_status: 'COMPLETED' });

      expect(result.data).toHaveLength(0);
    });

    it('should filter tasks by priority', async () => {
      mockOffset.mockResolvedValueOnce([
        { id: 1, task_code: 'TSK-000001', priority: 'HIGH', task_status: 'PENDING' },
      ]);
      mockWhere.mockReturnValueOnce(selectChain).mockResolvedValueOnce([{ count: 1 }]);

      const result = await taskManagementService.list({ priority: 'HIGH' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].priority).toBe('HIGH');
    });
  });

  // =========================================================================
  // 16. Service Exports & Method Verification
  // =========================================================================

  describe('Service Exports', () => {
    it('opportunityService should export all required methods', () => {
      expect(typeof opportunityService.create).toBe('function');
      expect(typeof opportunityService.getById).toBe('function');
      expect(typeof opportunityService.update).toBe('function');
      expect(typeof opportunityService.updateStage).toBe('function');
      expect(typeof opportunityService.list).toBe('function');
      expect(typeof opportunityService.getPipelineDashboard).toBe('function');
    });

    it('taskManagementService should export all required methods', () => {
      expect(typeof taskManagementService.create).toBe('function');
      expect(typeof taskManagementService.getById).toBe('function');
      expect(typeof taskManagementService.update).toBe('function');
      expect(typeof taskManagementService.updateStatus).toBe('function');
      expect(typeof taskManagementService.list).toBe('function');
      expect(typeof taskManagementService.getOverdueTasks).toBe('function');
      expect(typeof taskManagementService.getTasksNeedingReminder).toBe('function');
    });

    it('notificationInboxService should export all required methods', () => {
      expect(typeof notificationInboxService.notify).toBe('function');
      expect(typeof notificationInboxService.notifyMultiple).toBe('function');
      expect(typeof notificationInboxService.listForUser).toBe('function');
      expect(typeof notificationInboxService.getUnreadCount).toBe('function');
      expect(typeof notificationInboxService.markAsRead).toBe('function');
      expect(typeof notificationInboxService.markAllAsRead).toBe('function');
    });
  });
});
