import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/back-office/call-reports.ts', 'utf8');
const customRouteSource = readFileSync('server/routes/back-office/call-reports-custom.ts', 'utf8');
const backOfficeIndexSource = readFileSync('server/routes/back-office/index.ts', 'utf8');
const serviceSource = readFileSync('server/services/call-report-service.ts', 'utf8');

describe('call-report routing and filters', () => {
  it('registers single-segment specific routes before the dynamic id route', () => {
    const exportRoute = routeSource.indexOf("router.get('/export'");
    const approvalQueueRoute = routeSource.indexOf("router.get('/approval-queue'");
    const idRoute = routeSource.indexOf("router.get('/:id'");

    expect(exportRoute).toBeGreaterThanOrEqual(0);
    expect(approvalQueueRoute).toBeGreaterThanOrEqual(0);
    expect(idRoute).toBeGreaterThanOrEqual(0);
    expect(exportRoute).toBeLessThan(idRoute);
    expect(approvalQueueRoute).toBeLessThan(idRoute);
  });

  it('passes meetingReason through list and export routes into service filtering', () => {
    expect(routeSource.match(/meetingReason: req\.query\.meetingReason as string \| undefined/g)).toHaveLength(2);
    expect(customRouteSource).toContain('meetingReason: req.query.meetingReason as string | undefined');
    expect(serviceSource).toContain('meetingReason?: string');
    expect(serviceSource).toContain('if (filters.meetingReason)');
    expect(serviceSource).toContain('eq(schema.callReports.meeting_reason, filters.meetingReason as typeof schema.meetingReasonEnum.enumValues[number])');
  });

  it('mounts custom call-report routes before dynamic-id routes so /search is reachable', () => {
    const customMount = backOfficeIndexSource.indexOf("router.use('/call-reports', callReportsCustomRoutes)");
    const standardMount = backOfficeIndexSource.indexOf("router.use('/call-reports', callReportRoutes)");
    const crudMount = backOfficeIndexSource.indexOf('createCrudRouter(schema.callReports');

    expect(customMount).toBeGreaterThanOrEqual(0);
    expect(standardMount).toBeGreaterThanOrEqual(0);
    expect(crudMount).toBeGreaterThanOrEqual(0);
    expect(customMount).toBeLessThan(standardMount);
    expect(standardMount).toBeLessThan(crudMount);
  });
});
