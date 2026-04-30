import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/back-office/call-reports.ts', 'utf8');
const customRouteSource = readFileSync('server/routes/back-office/call-reports-custom.ts', 'utf8');

describe('call-report authenticated user propagation', () => {
  it('normalizes authenticated user ids in the main call-report routes', () => {
    expect(routeSource).toContain('function parseAuthenticatedUserId(req: any): number | null');
    expect(routeSource).toContain('const raw = req.user?.id ?? req.userId');
    expect(routeSource).toContain('const id = parseInt(String(raw), 10)');
    expect(routeSource).toContain('return isNaN(id) ? null : id');
  });

  it('requires a normalized user id before owner-sensitive call-report operations', () => {
    const ownerSensitiveCalls = [
      'callReportService.submit',
      'callReportService.create',
      'callReportService.update',
      'callReportService.listFeedback',
      'callReportService.addFeedback',
      'callReportService.linkToParent',
      'callReportService.approveFromQueue',
      'callReportService.rejectFromQueue',
    ];

    for (const serviceCall of ownerSensitiveCalls) {
      const callIndex = routeSource.indexOf(serviceCall);
      expect(callIndex, `${serviceCall} should exist`).toBeGreaterThanOrEqual(0);
      const parserBeforeCall = routeSource.lastIndexOf('const userId = parseAuthenticatedUserId(req)', callIndex);
      const authCheckBeforeCall = routeSource.lastIndexOf('Authentication required', callIndex);
      expect(parserBeforeCall, `${serviceCall} should parse authenticated user id`).toBeGreaterThanOrEqual(0);
      expect(authCheckBeforeCall, `${serviceCall} should reject missing user id`).toBeGreaterThan(parserBeforeCall);
    }
  });

  it('normalizes user ids for custom call-report search and submit routes', () => {
    expect(customRouteSource).toContain('function parseAuthenticatedUserId(req: any): number | null');
    expect(customRouteSource).toContain('const userId = parseAuthenticatedUserId(req) ?? undefined');
    expect(customRouteSource).toContain('const userId = parseAuthenticatedUserId(req)');
    expect(customRouteSource).not.toContain('const userId = (req as any).user?.id ?? (req as any).userId');
  });
});
