import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routesSource = readFileSync('server/routes.ts', 'utf8');
const serviceSource = readFileSync('server/services/approval-workflow-service.ts', 'utf8');

describe('approval auto-unclaim scheduler coverage', () => {
  it('uses the approval workflow service as the single scheduler implementation', () => {
    expect(routesSource).toContain('runExpiredClaimsJob');
    expect(routesSource).toContain('approvalWorkflowService.processExpiredClaims()');
    expect(routesSource).toContain('[Approval-Scheduler]');
    expect(routesSource).not.toContain('runAutoUnclaimJob');
    expect(routesSource).not.toContain('[AutoUnclaim]');
  });

  it('resets expired claimed approvals to pending and clears claim ownership', () => {
    expect(serviceSource).toContain('processExpiredClaims');
    expect(serviceSource).toContain("eq(schema.callReportApprovals.action, 'CLAIMED')");
    expect(serviceSource).toContain('lte(schema.callReportApprovals.claimed_at, cutoff)');
    expect(serviceSource).toContain("action: 'PENDING'");
    expect(serviceSource).toContain('supervisor_id: null');
    expect(serviceSource).toContain('claimed_at: null');
  });
});
