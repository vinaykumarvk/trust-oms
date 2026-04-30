import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/call-report-service.ts', 'utf8');

describe('call-report action item assignment controls', () => {
  it('derives report branch from the filer when branch_id is not supplied', () => {
    expect(serviceSource).toContain('let effectiveBranchId = data.branch_id ?? null');
    expect(serviceSource).toContain('where(eq(schema.users.id, data.filed_by))');
    expect(serviceSource).toContain('effectiveBranchId = filer?.branch_id ?? null');
    expect(serviceSource).toContain('branch_id: effectiveBranchId');
  });

  it('validates the final assignee after applying the filing-RM default', () => {
    expect(serviceSource).toContain('const assigneeId = item.assigned_to ?? data.filed_by');
    expect(serviceSource).toContain('where(eq(schema.users.id, assigneeId))');
    expect(serviceSource).toContain('Action item assignee (user ${assigneeId}) does not exist');
    expect(serviceSource).toContain('assignee.branch_id !== effectiveBranchId');
    expect(serviceSource).toContain('Action item assignee (user ${assigneeId}) is not in the same branch as the report filer');
  });
});
