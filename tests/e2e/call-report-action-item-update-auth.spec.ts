import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/call-report-service.ts', 'utf8');
const routeSource = readFileSync('server/routes/back-office/call-reports.ts', 'utf8');

describe('call-report action item update authorization', () => {
  it('requires authenticated actor context before updating an action item', () => {
    const routeIndex = routeSource.indexOf("router.patch('/action-items/:id'");
    expect(routeIndex).toBeGreaterThanOrEqual(0);
    expect(routeSource.indexOf('const userId = parseAuthenticatedUserId(req)', routeIndex)).toBeGreaterThan(routeIndex);
    expect(routeSource.indexOf('Authentication required', routeIndex)).toBeGreaterThan(routeIndex);
    expect(routeSource).toContain('actor_user_id: userId');
  });

  it('allows only the assignee or creator to update an action item', () => {
    expect(serviceSource).toContain('actor_user_id?: number');
    expect(serviceSource).toContain('item.assigned_to !== data.actor_user_id');
    expect(serviceSource).toContain('item.created_by_user_id !== data.actor_user_id');
    expect(serviceSource).toContain('Only the action item assignee or creator can update this action item');
    expect(serviceSource).toContain('throw new ForbiddenError');
  });
});
