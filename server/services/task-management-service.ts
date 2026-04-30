/**
 * Task Management Service (CRM-TASK)
 *
 * Handles CRM task CRUD, assignment, status transitions,
 * overdue detection, and reminder notifications.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, lt, ne, or } from 'drizzle-orm';
import { notificationInboxService } from './notification-inbox-service';

type CrmTask = typeof schema.crmTasks.$inferSelect;

async function generateTaskCode(): Promise<string> {
  const result = await db.execute(sql`SELECT task_code FROM crm_tasks ORDER BY id DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).task_code;
    const lastSeq = parseInt(lastCode.replace('TSK-', ''), 10);
    nextSeq = lastSeq + 1;
  }
  return `TSK-${String(nextSeq).padStart(6, '0')}`;
}

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

async function assertTaskAssigneeAllowed(data: {
  assigned_to?: number;
  assigned_by?: number;
  assigned_by_role?: string;
  assigned_by_branch_id?: number;
}): Promise<void> {
  // CIM BR-054: Supervisors can only assign tasks to users in their branch/team hierarchy.
  // BO_HEAD and SYSTEM_ADMIN are exempt.
  if (!data.assigned_to || !data.assigned_by || data.assigned_to === data.assigned_by) return;

  const isExempt = data.assigned_by_role && ['BO_HEAD', 'SYSTEM_ADMIN'].includes(data.assigned_by_role);
  if (isExempt) return;

  const [assignee] = await db
    .select({ branch_id: schema.users.branch_id })
    .from(schema.users)
    .where(eq(schema.users.id, data.assigned_to))
    .limit(1);

  if (!assignee) {
    throw new Error('Task assignee not found');
  }

  if (
    data.assigned_by_branch_id !== undefined &&
    assignee.branch_id !== null &&
    assignee.branch_id !== data.assigned_by_branch_id
  ) {
    throw new Error('Tasks can only be assigned to users in the same branch');
  }
}

export const taskManagementService = {
  async create(data: {
    title: string;
    description?: string;
    task_type?: string;
    priority?: string;
    due_date?: string;
    reminder_date?: string;
    assigned_to?: number;
    assigned_by?: number;
    assigned_by_role?: string;
    assigned_by_branch_id?: number;
    related_entity_type?: string;
    related_entity_id?: number;
  }): Promise<CrmTask> {
    const task_code = await generateTaskCode();

    await assertTaskAssigneeAllowed(data);

    const [task] = await db.insert(schema.crmTasks).values({
      task_code,
      title: data.title,
      description: data.description,
      task_type: data.task_type,
      priority: (data.priority || 'MEDIUM') as any,
      due_date: data.due_date,
      reminder_date: data.reminder_date,
      assigned_to: data.assigned_to,
      assigned_by: data.assigned_by,
      related_entity_type: data.related_entity_type,
      related_entity_id: data.related_entity_id,
    }).returning();

    // P1-09: Notify assignee when a task is assigned to them
    if (data.assigned_to) {
      await notificationInboxService.notify({
        recipient_user_id: data.assigned_to,
        type: 'TASK_ASSIGNED',
        title: 'New Task Assigned',
        message: `You have been assigned task "${data.title}" (${task_code}).${data.due_date ? ` Due: ${data.due_date}.` : ''}`,
        channel: 'IN_APP',
        related_entity_type: 'crm_task',
        related_entity_id: task.id,
      });
    }

    return task;
  },

  async getById(id: number): Promise<CrmTask> {
    const [task] = await db.select().from(schema.crmTasks)
      .where(eq(schema.crmTasks.id, id));
    if (!task) throw new Error('Task not found');
    return task;
  },

  async update(id: number, data: Partial<{
    title: string;
    description: string;
    task_type: string;
    priority: string;
    due_date: string;
    reminder_date: string;
    assigned_to: number;
    assigned_by: number;
    assigned_by_role: string;
    assigned_by_branch_id: number;
  }>): Promise<CrmTask> {
    if (data.assigned_to !== undefined) {
      await assertTaskAssigneeAllowed({
        assigned_to: data.assigned_to,
        assigned_by: data.assigned_by,
        assigned_by_role: data.assigned_by_role,
        assigned_by_branch_id: data.assigned_by_branch_id,
      });
    }

    type TaskUpdate = Partial<typeof schema.crmTasks.$inferInsert>;
    const allowedFields: TaskUpdate = {};
    if (data.title !== undefined) allowedFields.title = data.title;
    if (data.description !== undefined) allowedFields.description = data.description;
    if (data.task_type !== undefined) allowedFields.task_type = data.task_type;
    if (data.priority !== undefined) allowedFields.priority = data.priority as typeof schema.crmTasks.$inferInsert['priority'];
    if (data.due_date !== undefined) allowedFields.due_date = data.due_date;
    if (data.reminder_date !== undefined) allowedFields.reminder_date = data.reminder_date;
    if (data.assigned_to !== undefined) allowedFields.assigned_to = data.assigned_to;

    const [updated] = await db.update(schema.crmTasks)
      .set(allowedFields)
      .where(eq(schema.crmTasks.id, id))
      .returning();
    return updated;
  },

  async updateStatus(id: number, newStatus: string, completion_notes?: string): Promise<CrmTask> {
    if (!VALID_STATUSES.includes(newStatus as any)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const [task] = await db.select().from(schema.crmTasks)
      .where(eq(schema.crmTasks.id, id));
    if (!task) throw new Error('Task not found');

    if (task.task_status === 'COMPLETED' || task.task_status === 'CANCELLED') {
      throw new Error('Cannot change status of COMPLETED or CANCELLED tasks');
    }

    type TaskUpdate = Partial<typeof schema.crmTasks.$inferInsert>;
    const updates: TaskUpdate = { task_status: newStatus as typeof schema.crmTasks.$inferInsert['task_status'] };
    if (newStatus === 'COMPLETED') {
      updates.completed_at = new Date();
      updates.completion_notes = completion_notes;
    }

    const [updated] = await db.update(schema.crmTasks)
      .set(updates)
      .where(eq(schema.crmTasks.id, id))
      .returning();

    return updated;
  },

  async list(filters?: {
    assigned_to?: number;
    task_status?: string;
    priority?: string;
    task_type?: string;
    created_by?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: CrmTask[]; total: number; page: number; pageSize: number }> {
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (filters?.assigned_to) {
      conditions.push(eq(schema.crmTasks.assigned_to, filters.assigned_to));
    }
    if (filters?.task_status) {
      conditions.push(eq(schema.crmTasks.task_status, filters.task_status as any));
    }
    if (filters?.priority) {
      conditions.push(eq(schema.crmTasks.priority, filters.priority as any));
    }
    if (filters?.task_type) {
      conditions.push(eq(schema.crmTasks.task_type, filters.task_type));
    }
    // P2-17: Personal tasks (task_type=PERSONAL) are filtered to creator only
    if (filters?.created_by) {
      conditions.push(
        or(
          ne(schema.crmTasks.task_type, 'PERSONAL'),
          eq((schema.crmTasks as any).created_by, filters.created_by),
        ) as ReturnType<typeof eq>,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const tasks = await db.select().from(schema.crmTasks)
      .where(where)
      .orderBy(desc(schema.crmTasks.created_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count: total }] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.crmTasks)
      .where(where);

    return { data: tasks, total, page, pageSize };
  },

  async delete(id: number): Promise<void> {
    const [task] = await db.select().from(schema.crmTasks)
      .where(eq(schema.crmTasks.id, id));
    if (!task) throw new Error('Task not found');

    // P2-19: Cannot delete assigned tasks — only complete or cancel them
    if (task.assigned_to !== null && task.assigned_to !== undefined) {
      throw new Error('Cannot delete an assigned task. Complete or cancel it instead.');
    }

    await db.delete(schema.crmTasks).where(eq(schema.crmTasks.id, id));
  },

  async getOverdueTasks(): Promise<CrmTask[]> {
    const now = new Date().toISOString().split('T')[0];
    const tasks = await db.select().from(schema.crmTasks)
      .where(and(
        lt(sql`${schema.crmTasks.due_date}::date`, sql`${now}::date`),
        ne(schema.crmTasks.task_status, 'COMPLETED' as any),
        ne(schema.crmTasks.task_status, 'CANCELLED' as any),
      ));
    return tasks;
  },

  async getTasksNeedingReminder(): Promise<CrmTask[]> {
    const today = new Date().toISOString().split('T')[0];
    const tasks = await db.select().from(schema.crmTasks)
      .where(and(
        eq(sql`${schema.crmTasks.reminder_date}::date`, sql`${today}::date`),
        ne(schema.crmTasks.task_status, 'COMPLETED' as any),
        ne(schema.crmTasks.task_status, 'CANCELLED' as any),
      ));
    return tasks;
  },
};
