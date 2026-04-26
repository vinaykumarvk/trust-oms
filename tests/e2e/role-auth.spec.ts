/**
 * E2E Role-Based Authorization Tests — Phase 10 Integration Testing
 *
 * Verifies the role-based authorization middleware guards:
 * - SYSTEM_ADMIN is blocked from approving CA settlements, claims, and tax corrections
 * - CA_ANALYST can access CA routes
 * - CLAIMS_ANALYST can access claims routes
 * - PRIVACY_OFFICER can access privacy routes
 * - denyBusinessApproval middleware blocks SYSTEM_ADMIN
 *
 * Since tests run without a real DB or Express server, we invoke the
 * middleware factories directly with mock req/res/next objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the audit-logger to prevent real DB calls from logAuditEvent
// ---------------------------------------------------------------------------

vi.mock('../../server/services/audit-logger', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import middleware under test
// ---------------------------------------------------------------------------

import {
  requireAnyRole,
  requireCARole,
  requireClaimsRole,
  requirePrivacyRole,
  requireTaxRole,
  requireBackOfficeRole,
  requireFrontOfficeRole,
  requireMidOfficeRole,
  requireComplianceRole,
  requireRiskRole,
  requireExecutiveRole,
  requireFeedOperatorRole,
  denyBusinessApproval,
  logDataAccess,
} from '../../server/middleware/role-auth';

// ---------------------------------------------------------------------------
// Helpers — create mock Express req / res / next
// ---------------------------------------------------------------------------

function mockReq(overrides: Partial<{ userRole: string; userId: string; id: string; ip: string; method: string; path: string; params: Record<string, string>; query: Record<string, string> }> = {}): any {
  return {
    userRole: overrides.userRole ?? null,
    userId: overrides.userId ?? 'user-001',
    id: overrides.id ?? 'corr-001',
    ip: overrides.ip ?? '127.0.0.1',
    method: overrides.method ?? 'POST',
    path: overrides.path ?? '/test',
    params: overrides.params ?? {},
    query: overrides.query ?? {},
  };
}

function mockRes(): any {
  const res: any = {
    statusCode: null,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe('E2E Role-Based Authorization', () => {
  // =========================================================================
  // 1. Middleware Export Verification
  // =========================================================================

  describe('Middleware Export Verification', () => {
    it('should export requireAnyRole as a function', () => {
      expect(typeof requireAnyRole).toBe('function');
    });

    it('should export denyBusinessApproval as a function', () => {
      expect(typeof denyBusinessApproval).toBe('function');
    });

    it('should export all office-level guards', () => {
      expect(typeof requireBackOfficeRole).toBe('function');
      expect(typeof requireFrontOfficeRole).toBe('function');
      expect(typeof requireMidOfficeRole).toBe('function');
      expect(typeof requireComplianceRole).toBe('function');
      expect(typeof requireRiskRole).toBe('function');
      expect(typeof requireExecutiveRole).toBe('function');
    });

    it('should export all domain-specific guards', () => {
      expect(typeof requireCARole).toBe('function');
      expect(typeof requireTaxRole).toBe('function');
      expect(typeof requireClaimsRole).toBe('function');
      expect(typeof requirePrivacyRole).toBe('function');
      expect(typeof requireFeedOperatorRole).toBe('function');
    });

    it('should export logDataAccess as a function', () => {
      expect(typeof logDataAccess).toBe('function');
    });
  });

  // =========================================================================
  // 2. denyBusinessApproval — blocks SYSTEM_ADMIN
  // =========================================================================

  describe('denyBusinessApproval — blocks SYSTEM_ADMIN', () => {
    it('should block SYSTEM_ADMIN with 403 and BUSINESS_APPROVAL_DENIED code', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      denyBusinessApproval()(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('BUSINESS_APPROVAL_DENIED');
      expect(next).not.toHaveBeenCalled();
    });

    it('should block system_admin (lowercase) with 403', () => {
      const req = mockReq({ userRole: 'system_admin' });
      const res = mockRes();
      const next = vi.fn();

      denyBusinessApproval()(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('BUSINESS_APPROVAL_DENIED');
      expect(next).not.toHaveBeenCalled();
    });

    it('should include currentRole in the error response', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      denyBusinessApproval()(req, res, next);

      expect(res.body.error.currentRole).toBe('SYSTEM_ADMIN');
    });

    it('should include guidance to use domain-specific roles in message', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      denyBusinessApproval()(req, res, next);

      expect(res.body.error.message).toContain('CA_APPROVER');
      expect(res.body.error.message).toContain('CLAIMS_APPROVER');
      expect(res.body.error.message).toContain('TAX_SPECIALIST');
    });

    it('should allow CA_APPROVER through without blocking', () => {
      const req = mockReq({ userRole: 'CA_APPROVER' });
      const res = mockRes();
      const next = vi.fn();

      denyBusinessApproval()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('should allow CLAIMS_APPROVER through without blocking', () => {
      const req = mockReq({ userRole: 'CLAIMS_APPROVER' });
      const res = mockRes();
      const next = vi.fn();

      denyBusinessApproval()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('should allow TAX_SPECIALIST through without blocking', () => {
      const req = mockReq({ userRole: 'TAX_SPECIALIST' });
      const res = mockRes();
      const next = vi.fn();

      denyBusinessApproval()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });
  });

  // =========================================================================
  // 3. SYSTEM_ADMIN blocked from CA settlement approval
  // =========================================================================

  describe('SYSTEM_ADMIN blocked from CA settlement approval', () => {
    it('should block SYSTEM_ADMIN from CA routes (not in requireCARole allowed list)', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      requireCARole()(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(next).not.toHaveBeenCalled();
    });

    it('should include requiredRoles in error response for CA guard', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      requireCARole()(req, res, next);

      expect(res.body.error.requiredRoles).toContain('CA_ANALYST');
      expect(res.body.error.requiredRoles).toContain('CA_APPROVER');
      expect(res.body.error.requiredRoles).not.toContain('SYSTEM_ADMIN');
    });
  });

  // =========================================================================
  // 4. SYSTEM_ADMIN blocked from claims approval
  // =========================================================================

  describe('SYSTEM_ADMIN blocked from claims approval', () => {
    it('should block SYSTEM_ADMIN from claims routes (not in requireClaimsRole allowed list)', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      requireClaimsRole()(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(next).not.toHaveBeenCalled();
    });

    it('should include requiredRoles in error response for claims guard', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      requireClaimsRole()(req, res, next);

      expect(res.body.error.requiredRoles).toContain('CLAIMS_ANALYST');
      expect(res.body.error.requiredRoles).toContain('CLAIMS_APPROVER');
      expect(res.body.error.requiredRoles).not.toContain('SYSTEM_ADMIN');
    });
  });

  // =========================================================================
  // 5. SYSTEM_ADMIN blocked from tax corrections
  // =========================================================================

  describe('SYSTEM_ADMIN blocked from tax corrections', () => {
    it('should block SYSTEM_ADMIN from tax routes (not in requireTaxRole allowed list)', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      requireTaxRole()(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(next).not.toHaveBeenCalled();
    });

    it('should include requiredRoles in error response for tax guard', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      requireTaxRole()(req, res, next);

      expect(res.body.error.requiredRoles).toContain('TAX_SPECIALIST');
      expect(res.body.error.requiredRoles).not.toContain('SYSTEM_ADMIN');
    });
  });

  // =========================================================================
  // 6. CA_ANALYST can access CA routes
  // =========================================================================

  describe('CA_ANALYST can access CA routes', () => {
    it('should allow CA_ANALYST through requireCARole guard', () => {
      const req = mockReq({ userRole: 'CA_ANALYST' });
      const res = mockRes();
      const next = vi.fn();

      requireCARole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('should allow CA_APPROVER through requireCARole guard', () => {
      const req = mockReq({ userRole: 'CA_APPROVER' });
      const res = mockRes();
      const next = vi.fn();

      requireCARole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow BO_MAKER through requireCARole guard (back-office staff)', () => {
      const req = mockReq({ userRole: 'BO_MAKER' });
      const res = mockRes();
      const next = vi.fn();

      requireCARole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 7. CLAIMS_ANALYST can access claims routes
  // =========================================================================

  describe('CLAIMS_ANALYST can access claims routes', () => {
    it('should allow CLAIMS_ANALYST through requireClaimsRole guard', () => {
      const req = mockReq({ userRole: 'CLAIMS_ANALYST' });
      const res = mockRes();
      const next = vi.fn();

      requireClaimsRole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('should allow CLAIMS_APPROVER through requireClaimsRole guard', () => {
      const req = mockReq({ userRole: 'CLAIMS_APPROVER' });
      const res = mockRes();
      const next = vi.fn();

      requireClaimsRole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow BO_HEAD through requireClaimsRole guard', () => {
      const req = mockReq({ userRole: 'BO_HEAD' });
      const res = mockRes();
      const next = vi.fn();

      requireClaimsRole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 8. PRIVACY_OFFICER can access privacy routes
  // =========================================================================

  describe('PRIVACY_OFFICER can access privacy routes', () => {
    it('should allow PRIVACY_OFFICER through requirePrivacyRole guard', () => {
      const req = mockReq({ userRole: 'PRIVACY_OFFICER' });
      const res = mockRes();
      const next = vi.fn();

      requirePrivacyRole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('should allow DATA_STEWARD through requirePrivacyRole guard', () => {
      const req = mockReq({ userRole: 'DATA_STEWARD' });
      const res = mockRes();
      const next = vi.fn();

      requirePrivacyRole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow COMPLIANCE_OFFICER through requirePrivacyRole guard', () => {
      const req = mockReq({ userRole: 'COMPLIANCE_OFFICER' });
      const res = mockRes();
      const next = vi.fn();

      requirePrivacyRole()(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should block SYSTEM_ADMIN from privacy routes', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN' });
      const res = mockRes();
      const next = vi.fn();

      requirePrivacyRole()(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 9. requireAnyRole — generic guard behavior
  // =========================================================================

  describe('requireAnyRole — generic guard behavior', () => {
    it('should return 403 when userRole is null', () => {
      const req = mockReq({ userRole: undefined });
      const res = mockRes();
      const next = vi.fn();

      requireAnyRole('BO_MAKER', 'BO_CHECKER')(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('Insufficient permissions');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when userRole does not match any listed role', () => {
      const req = mockReq({ userRole: 'TRADER' });
      const res = mockRes();
      const next = vi.fn();

      requireAnyRole('BO_MAKER', 'BO_CHECKER')(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() when userRole matches one of the listed roles', () => {
      const req = mockReq({ userRole: 'BO_MAKER' });
      const res = mockRes();
      const next = vi.fn();

      requireAnyRole('BO_MAKER', 'BO_CHECKER')(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('should include correlation_id in the error response', () => {
      const req = mockReq({ userRole: 'TRADER', id: 'test-corr-123' });
      const res = mockRes();
      const next = vi.fn();

      requireAnyRole('BO_MAKER')(req, res, next);

      expect(res.body.error.correlation_id).toBe('test-corr-123');
    });

    it('should include currentRole and requiredRoles in error response', () => {
      const req = mockReq({ userRole: 'TRADER' });
      const res = mockRes();
      const next = vi.fn();

      requireAnyRole('BO_MAKER', 'BO_CHECKER')(req, res, next);

      expect(res.body.error.currentRole).toBe('TRADER');
      expect(res.body.error.requiredRoles).toEqual(['BO_MAKER', 'BO_CHECKER']);
    });
  });

  // =========================================================================
  // 10. Combined denyBusinessApproval + domain guard scenario
  // =========================================================================

  describe('Combined denyBusinessApproval + domain guard scenario', () => {
    it('should block SYSTEM_ADMIN at the denyBusinessApproval step before reaching CA guard', () => {
      const req = mockReq({ userRole: 'SYSTEM_ADMIN', params: { id: 'CA-001' } });
      const res = mockRes();
      const next = vi.fn();

      // Simulate the middleware chain: denyBusinessApproval -> requireCARole
      denyBusinessApproval()(req, res, next);

      // SYSTEM_ADMIN should be blocked at step 1
      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('BUSINESS_APPROVAL_DENIED');
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow CA_APPROVER through denyBusinessApproval then through requireCARole', () => {
      const req = mockReq({ userRole: 'CA_APPROVER', params: { id: 'CA-001' } });
      const res = mockRes();
      const next1 = vi.fn();

      // Step 1: denyBusinessApproval
      denyBusinessApproval()(req, res, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      // Step 2: requireCARole
      const next2 = vi.fn();
      requireCARole()(req, res, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });

    it('should allow TAX_SPECIALIST through denyBusinessApproval then through requireTaxRole', () => {
      const req = mockReq({ userRole: 'TAX_SPECIALIST' });
      const res = mockRes();
      const next1 = vi.fn();

      denyBusinessApproval()(req, res, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      const next2 = vi.fn();
      requireTaxRole()(req, res, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 11. logDataAccess — PII audit logging
  // =========================================================================

  describe('logDataAccess — PII audit logging', () => {
    it('should return a middleware function', () => {
      const mw = logDataAccess('CLIENT_PII');
      expect(typeof mw).toBe('function');
    });

    it('should call next() without blocking the request', () => {
      const req = mockReq({ userRole: 'PRIVACY_OFFICER', method: 'GET', path: '/clients/123' });
      const res = mockRes();
      const next = vi.fn();

      logDataAccess('CLIENT_PII')(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });
  });
});
