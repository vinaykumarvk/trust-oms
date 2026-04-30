import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/back-office/cr-approvals.ts', 'utf8');
const serviceSource = readFileSync('server/services/approval-workflow-service.ts', 'utf8');

describe('call-report approval workflow controls', () => {
  it('normalizes authenticated supervisor ids before invoking approval actions', () => {
    expect(routeSource).toContain('function parseAuthenticatedUserId(req: any): number | null');
    expect(routeSource).toContain('const raw = req.user?.id ?? req.userId');
    expect(routeSource).toContain('const id = parseInt(String(raw), 10)');
    expect(routeSource).toContain('return isNaN(id) ? null : id');

    const claimRoute = routeSource.indexOf("'/:id/claim'");
    const approveRoute = routeSource.indexOf("'/:id/approve'");
    const rejectRoute = routeSource.indexOf("'/:id/reject'");

    for (const routeIndex of [claimRoute, approveRoute, rejectRoute]) {
      expect(routeIndex).toBeGreaterThanOrEqual(0);
      const parserCall = routeSource.indexOf('const supervisorId = parseAuthenticatedUserId(req)', routeIndex);
      const serviceCall = routeSource.indexOf('approvalWorkflowService.', routeIndex);

      expect(parserCall).toBeGreaterThan(routeIndex);
      expect(parserCall).toBeLessThan(serviceCall);
    }
  });

  it('keeps branch scoping and maximum claimed workload in the approval service', () => {
    expect(serviceSource).toContain('You can only claim approvals for call reports in your branch');
    expect(serviceSource).toContain("['BO_HEAD', 'SYSTEM_ADMIN'].includes(supervisor.role)");
    expect(serviceSource).toContain('count()');
    expect(serviceSource).toContain("eq(schema.callReportApprovals.action, 'CLAIMED')");
    expect(serviceSource).toContain('Supervisor already has 20 claimed approvals');
  });

  it('records decision audit history and notifies the filing RM', () => {
    expect(serviceSource).toContain("interaction_type: 'CALL_REPORT_APPROVED'");
    expect(serviceSource).toContain("interaction_type: 'CALL_REPORT_REJECTED'");
    expect(serviceSource).toContain('notificationInboxService.notifyChannels');
    expect(serviceSource).toContain("type: 'CALL_REPORT_APPROVED'");
    expect(serviceSource).toContain("type: 'CALL_REPORT_REJECTED'");
    expect(serviceSource).toContain("channels: ['IN_APP', 'EMAIL']");
    expect(serviceSource).toContain('related_entity_type: \'call_report\'');
  });
});
