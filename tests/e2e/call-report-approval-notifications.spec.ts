import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const callReportServiceSource = readFileSync('server/services/call-report-service.ts', 'utf8');
const approvalWorkflowSource = readFileSync('server/services/approval-workflow-service.ts', 'utf8');
const inboxServiceSource = readFileSync('server/services/notification-inbox-service.ts', 'utf8');
const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');

describe('call-report approval notification channels', () => {
  it('supports persisted multi-channel inbox notifications', () => {
    expect(inboxServiceSource).toContain('async notifyChannels');
    expect(inboxServiceSource).toContain('async notifyMultipleChannels');
    expect(inboxServiceSource).toContain('channels: InboxChannel[]');
    expect(inboxServiceSource).toContain('userIds.flatMap');
  });

  it('defines call-report approval notification types in the CRM notification enum', () => {
    expect(schemaSource).toContain("'CALL_REPORT_PENDING_APPROVAL'");
    expect(schemaSource).toContain("'CALL_REPORT_APPROVED'");
    expect(schemaSource).toContain("'CALL_REPORT_REJECTED'");
  });

  it('notifies filing RM and branch supervisors through in-app and email channels on late submission', () => {
    const submitBlock = callReportServiceSource.slice(
      callReportServiceSource.indexOf('const requiresApproval = daysSinceMeeting > lateFilingThreshold'),
      callReportServiceSource.indexOf('// BR-023: Create a SYSTEM_GENERATED task'),
    );

    expect(submitBlock).toContain('notificationInboxService.notifyChannels');
    expect(submitBlock).toContain('notificationInboxService.notifyMultipleChannels');
    expect(submitBlock).toContain("type: 'CALL_REPORT_PENDING_APPROVAL'");
    expect(submitBlock).toContain("channels: ['IN_APP', 'EMAIL']");
  });

  it('notifies filing RM through in-app and email channels on approval decisions', () => {
    expect(approvalWorkflowSource).toContain('notificationInboxService.notifyChannels');
    expect(approvalWorkflowSource).toContain("type: 'CALL_REPORT_APPROVED'");
    expect(approvalWorkflowSource).toContain("type: 'CALL_REPORT_REJECTED'");
    expect(approvalWorkflowSource).toContain("channels: ['IN_APP', 'EMAIL']");
  });
});
