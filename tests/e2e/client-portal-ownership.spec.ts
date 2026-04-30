import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/client-portal.ts', 'utf8');
const serviceSource = readFileSync('server/services/client-portal-service.ts', 'utf8');

describe('Client portal object ownership controls', () => {
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
});
