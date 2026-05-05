import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/services/exception-queue-service', () => ({
  exceptionQueueService: {
    createException: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../server/services/notification-inbox-service', () => ({
  notificationInboxService: {
    notifyMultiple: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@shared/schema', () => ({
  users: {
    id: 'users.id',
    role: 'users.role',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((left, right) => ({ left, right })),
}));

import { validatePortalOwnership } from '../../server/middleware/portal-ownership';

const routeSource = readFileSync('server/routes/client-portal.ts', 'utf8');
const serviceSource = readFileSync('server/services/client-portal-service.ts', 'utf8');
const clientMessageServiceSource = readFileSync('server/services/client-message-service.ts', 'utf8');

describe('Client portal object ownership controls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines a service-level portfolio ownership check scoped by client_id', () => {
    expect(serviceSource).toContain('portfolioBelongsToClient');
    expect(serviceSource).toContain('eq(schema.portfolios.portfolio_id, portfolioId)');
    expect(serviceSource).toContain('eq(schema.portfolios.client_id, clientId)');
    expect(serviceSource).toContain('eq(schema.portfolios.is_deleted, false)');
  });

  it('guards every portfolioId client portal data route before service access', () => {
    const guardedRoutes = [
      { path: '/allocation/:portfolioId', serviceCall: 'clientPortalService.getAllocation' },
      { path: '/performance/:portfolioId', serviceCall: 'clientPortalService.getPerformance' },
      { path: '/holdings/:portfolioId', serviceCall: 'clientPortalService.getHoldings' },
      { path: '/transactions/:portfolioId', serviceCall: 'clientPortalService.getRecentTransactions' },
    ];

    for (const route of guardedRoutes) {
      const routeIndex = routeSource.indexOf(route.path);
      expect(routeIndex, `${route.path} route should exist`).toBeGreaterThanOrEqual(0);

      const nextServiceCall = routeSource.indexOf(route.serviceCall, routeIndex);
      const guardCall = routeSource.indexOf('assertPortfolioOwnership(req, res, portfolioId)', routeIndex);

      expect(guardCall, `${route.path} should call assertPortfolioOwnership`).toBeGreaterThan(routeIndex);
      expect(guardCall, `${route.path} guard should run before service access`).toBeLessThan(nextServiceCall);
    }
  });

  it('checks service request ownership before document upload', () => {
    const routeIndex = routeSource.indexOf("'/service-requests/:id/documents'");
    expect(routeIndex, 'SR document upload route should exist').toBeGreaterThanOrEqual(0);

    const ownershipCheck = routeSource.indexOf('assertSROwnership(req, res, srId)', routeIndex);
    const uploadCall = routeSource.indexOf('srDocumentService.upload', routeIndex);

    expect(ownershipCheck).toBeGreaterThan(routeIndex);
    expect(ownershipCheck).toBeLessThan(uploadCall);
  });

  it('uses the session-derived client identity for service request list and action count', () => {
    for (const routePath of ["'/service-requests/:clientId'", "'/service-requests/action-count/:clientId'"]) {
      const routeIndex = routeSource.indexOf(routePath);
      expect(routeIndex, `${routePath} route should exist`).toBeGreaterThanOrEqual(0);

      const sessionClient = routeSource.indexOf('const clientId = requirePortalClientIdentity(req, res);', routeIndex);
      const paramClient = routeSource.indexOf('req.params.clientId', routeIndex);

      expect(sessionClient, `${routePath} should derive clientId from the authenticated session`).toBeGreaterThan(routeIndex);
      if (paramClient > -1) {
        expect(paramClient, `${routePath} should not use req.params.clientId after middleware`).toBeLessThan(routeIndex);
      }
    }
  });

  it('checks service request ownership before document download and binds doc to the SR path', () => {
    const routeIndex = routeSource.indexOf("'/service-requests/:id/documents/:docId/download'");
    expect(routeIndex, 'SR document download route should exist').toBeGreaterThanOrEqual(0);

    const ownershipCheck = routeSource.indexOf('assertSROwnership(req, res, srId)', routeIndex);
    const downloadCall = routeSource.indexOf('srDocumentService.download(docId, requesterClientId, srId,', routeIndex);

    expect(ownershipCheck).toBeGreaterThan(routeIndex);
    expect(ownershipCheck).toBeLessThan(downloadCall);
  });

  it('rejects cross-client route access with a structured ownership violation', () => {
    const req = {
      clientId: 'CLT-001',
      userId: 'portal-user-1',
      params: { clientId: 'CLT-999' },
      path: '/api/v1/client-portal/service-requests/CLT-999',
      ip: '127.0.0.1',
      id: 'corr-1',
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    validatePortalOwnership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'PORTAL_OWNERSHIP_VIOLATION',
        message: 'Access denied: resource does not belong to your account',
      },
    });

    const event = JSON.parse(String(warn.mock.calls[0][0]));
    expect(event).toMatchObject({
      event: 'PORTAL_OWNERSHIP_VIOLATION',
      actor_id: 'CLT-001',
      resource_type: 'CLIENT_PORTAL_ROUTE',
      resource_id: 'CLT-999',
      attempted_client_id: 'CLT-999',
      actual_client_id: 'CLT-001',
      correlation_id: 'corr-1',
    });
    expect(event).not.toHaveProperty('body');
  });

  it('allows matching client route access', () => {
    const req = {
      clientId: 'CLT-001',
      userId: 'portal-user-2',
      params: { clientId: 'CLT-001' },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    validatePortalOwnership(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('guards client-created messages against cross-client thread and SR references', () => {
    expect(clientMessageServiceSource).toContain('parent.recipient_client_id !== data.recipient_client_id');
    expect(clientMessageServiceSource).toContain('thread.recipient_client_id !== data.recipient_client_id');
    expect(clientMessageServiceSource).toContain('select({ client_id: schema.serviceRequests.client_id })');
    expect(clientMessageServiceSource).toContain('sr.client_id !== data.recipient_client_id');
    expect(clientMessageServiceSource).toContain("throw new ForbiddenError('Access denied')");
  });
});
