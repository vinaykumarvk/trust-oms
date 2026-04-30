import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/task-management-service.ts', 'utf8');
const routeSource = readFileSync('server/routes/back-office/tasks.ts', 'utf8');

describe('task assignment branch controls', () => {
  it('uses one branch/hierarchy guard for task create and reassignment updates', () => {
    expect(serviceSource).toContain('async function assertTaskAssigneeAllowed');
    expect(serviceSource.match(/await assertTaskAssigneeAllowed/g)).toHaveLength(2);
    expect(serviceSource).toContain("['BO_HEAD', 'SYSTEM_ADMIN'].includes(data.assigned_by_role)");
    expect(serviceSource).toContain('Task assignee not found');
    expect(serviceSource).toContain('Tasks can only be assigned to users in the same branch');
  });

  it('passes authenticated actor context into update reassignment checks', () => {
    expect(routeSource).toContain('assigned_by: user?.id');
    expect(routeSource).toContain('assigned_by_role: user?.role ?? (req as any).userRole');
    expect(routeSource).toContain('assigned_by_branch_id: user?.branch_id ?? (req as any).userBranchId');
  });
});
