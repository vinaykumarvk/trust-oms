/**
 * Role-Based Authorization Guards
 *
 * Express middleware factories for enforcing role-based access control.
 * Uses the `req.userRole` field set by the auth middleware.
 *
 * Convenience guards group roles by office/function:
 *   requireBackOfficeRole()   — BO_MAKER, BO_CHECKER, BO_HEAD, SYSTEM_ADMIN
 *   requireFrontOfficeRole()  — RELATIONSHIP_MANAGER, SENIOR_RM, TRADER, SENIOR_TRADER
 *   requireMidOfficeRole()    — MO_MAKER, MO_CHECKER, FUND_ACCOUNTANT
 *   requireComplianceRole()   — COMPLIANCE_OFFICER, CCO
 *   requireRiskRole()         — RISK_OFFICER, CRO
 *   requireExecutiveRole()    — TRUST_BUSINESS_HEAD, CRO, CCO
 *
 * Also provides `logDataAccess()` for fire-and-forget PII access audit logging.
 */

import type { Request, Response, NextFunction } from 'express';
import { logAuditEvent } from '../services/audit-logger';

// ---------------------------------------------------------------------------
// Generic role guard
// ---------------------------------------------------------------------------

export function requireAnyRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // SYSTEM_ADMIN always passes (superuser bypass)
    if (req.userRole === 'SYSTEM_ADMIN' || req.userRole === 'system_admin') {
      return next();
    }

    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          requiredRoles: roles,
          currentRole: req.userRole ?? null,
          correlation_id: req.id,
        },
      });
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Office-level guards
// ---------------------------------------------------------------------------

export const requireBackOfficeRole = () =>
  requireAnyRole('BO_MAKER', 'BO_CHECKER', 'BO_HEAD', 'SYSTEM_ADMIN');

export const requireFrontOfficeRole = () =>
  requireAnyRole('RELATIONSHIP_MANAGER', 'SENIOR_RM', 'TRADER', 'SENIOR_TRADER');

export const requireMidOfficeRole = () =>
  requireAnyRole('MO_MAKER', 'MO_CHECKER', 'FUND_ACCOUNTANT');

export const requireComplianceRole = () =>
  requireAnyRole('COMPLIANCE_OFFICER', 'CCO');

export const requireRiskRole = () =>
  requireAnyRole('RISK_OFFICER', 'CRO');

export const requireExecutiveRole = () =>
  requireAnyRole('TRUST_BUSINESS_HEAD', 'CRO', 'CCO');

// ---------------------------------------------------------------------------
// PII data access logging
// ---------------------------------------------------------------------------

export function logDataAccess(resourceType: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Fire-and-forget audit log for PII-sensitive route access
    logAuditEvent({
      entityType: resourceType,
      entityId: 'access',
      action: 'ACCESS',
      actorId: req.userId,
      actorRole: req.userRole,
      ipAddress: req.ip,
      correlationId: req.id,
      metadata: {
        method: req.method,
        path: req.path,
        query: req.query,
      },
    }).catch(() => {});

    next();
  };
}
