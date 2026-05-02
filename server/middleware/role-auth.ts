/**
 * Role-Based Authorization Guards
 *
 * Express middleware factories for enforcing role-based access control.
 * Uses the `req.userRole` field set by the auth middleware.
 *
 * IMPORTANT — SYSTEM_ADMIN is NOT a blanket superuser bypass.
 * It is explicitly listed in the role arrays where admin access is
 * appropriate (e.g. back-office, feed-operator).  SYSTEM_ADMIN is
 * intentionally EXCLUDED from business-transaction approval flows
 * (CA settlement, claims payout, tax corrections) via the
 * `denyBusinessApproval` guard.
 *
 * Office-level guards:
 *   requireBackOfficeRole()   — BO_MAKER, BO_CHECKER, BO_HEAD, SYSTEM_ADMIN
 *   requireFrontOfficeRole()  — RELATIONSHIP_MANAGER, SENIOR_RM, TRADER, SENIOR_TRADER
 *   requireMidOfficeRole()    — MO_MAKER, MO_CHECKER, FUND_ACCOUNTANT
 *   requireComplianceRole()   — COMPLIANCE_OFFICER, CCO
 *   requireRiskRole()         — RISK_OFFICER, CRO
 *   requireExecutiveRole()    — TRUST_BUSINESS_HEAD, CRO, CCO
 *
 * Domain-specific guards:
 *   requireCARole()           — CA_ANALYST, CA_APPROVER, BO_MAKER, BO_CHECKER, BO_HEAD
 *   requireTaxRole()          — TAX_SPECIALIST, BO_MAKER, BO_CHECKER, BO_HEAD
 *   requireClaimsRole()       — CLAIMS_ANALYST, CLAIMS_APPROVER, BO_MAKER, BO_CHECKER, BO_HEAD
 *   requirePrivacyRole()      — PRIVACY_OFFICER, DATA_STEWARD, COMPLIANCE_OFFICER, CCO
 *   requireFeedOperatorRole() — FEED_OPERATOR, BO_HEAD, SYSTEM_ADMIN
 *
 * Business-approval deny guard:
 *   denyBusinessApproval()    — blocks SYSTEM_ADMIN from approving business transactions
 *
 * Also provides `logDataAccess()` for fire-and-forget PII access audit logging.
 */

import type { Request, Response, NextFunction } from 'express';
import { logAuditEvent } from '../services/audit-logger';

// ---------------------------------------------------------------------------
// Generic role guard — NO blanket SYSTEM_ADMIN bypass
// ---------------------------------------------------------------------------

export function requireAnyRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const normalizedRole = req.userRole?.toUpperCase();
    if (!normalizedRole || !roles.includes(normalizedRole)) {
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
// Business-approval deny guard
// ---------------------------------------------------------------------------

/**
 * Blocks SYSTEM_ADMIN from approving business transactions.
 *
 * Use this middleware BEFORE the role-check on any route that represents
 * a business-critical approval action (CA settlement approval, claims
 * payout approval, tax correction approval, etc.).
 *
 * Example:
 *   router.post('/ca/settle/:id/approve',
 *     denyBusinessApproval(),
 *     requireCARole(),
 *     caController.approveSettlement,
 *   );
 */
export function denyBusinessApproval() {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.userRole;
    if (role === 'SYSTEM_ADMIN' || role === 'system_admin') {
      logAuditEvent({
        entityType: 'BUSINESS_APPROVAL',
        entityId: req.params?.id ?? 'unknown',
        action: 'DENIED',
        actorId: req.userId,
        actorRole: role,
        ipAddress: req.ip,
        correlationId: req.id,
        metadata: {
          reason: 'SYSTEM_ADMIN cannot approve business transactions',
          method: req.method,
          path: req.path,
        },
      }).catch(() => {});

      return res.status(403).json({
        error: {
          code: 'BUSINESS_APPROVAL_DENIED',
          message:
            'SYSTEM_ADMIN accounts cannot approve business transactions. ' +
            'Use a domain-specific role (e.g. CA_APPROVER, CLAIMS_APPROVER, TAX_SPECIALIST).',
          currentRole: role,
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
  requireAnyRole('RELATIONSHIP_MANAGER', 'SENIOR_RM', 'TRADER', 'SENIOR_TRADER', 'SYSTEM_ADMIN');

export const requireMidOfficeRole = () =>
  requireAnyRole('MO_MAKER', 'MO_CHECKER', 'FUND_ACCOUNTANT', 'SYSTEM_ADMIN');

export const requireComplianceRole = () =>
  requireAnyRole('COMPLIANCE_OFFICER', 'CCO', 'SYSTEM_ADMIN');

export const requireRiskRole = () =>
  requireAnyRole('RISK_OFFICER', 'CRO', 'SYSTEM_ADMIN');

export const requireExecutiveRole = () =>
  requireAnyRole('TRUST_BUSINESS_HEAD', 'CRO', 'CCO', 'SYSTEM_ADMIN');

/** CRM — relationship managers, senior RMs, and back-office staff */
export const requireCRMRole = () =>
  requireAnyRole('RELATIONSHIP_MANAGER', 'SENIOR_RM', 'BO_MAKER', 'BO_CHECKER', 'BO_HEAD', 'SYSTEM_ADMIN');

// ---------------------------------------------------------------------------
// Domain-specific guards
// ---------------------------------------------------------------------------

/** Corporate Actions — analysts, approvers, and back-office staff */
export const requireCARole = () =>
  requireAnyRole('CA_ANALYST', 'CA_APPROVER', 'BO_MAKER', 'BO_CHECKER', 'BO_HEAD');

/** Tax — tax specialists and back-office staff */
export const requireTaxRole = () =>
  requireAnyRole('TAX_SPECIALIST', 'BO_MAKER', 'BO_CHECKER', 'BO_HEAD');

/** Claims — claims analysts, approvers, and back-office staff */
export const requireClaimsRole = () =>
  requireAnyRole('CLAIMS_ANALYST', 'CLAIMS_APPROVER', 'BO_MAKER', 'BO_CHECKER', 'BO_HEAD');

/** Privacy / Data Protection — privacy officers, data stewards, compliance */
export const requirePrivacyRole = () =>
  requireAnyRole('PRIVACY_OFFICER', 'DATA_STEWARD', 'COMPLIANCE_OFFICER', 'CCO');

/** Feed Operations — feed operators, BO head, and system admin */
export const requireFeedOperatorRole = () =>
  requireAnyRole('FEED_OPERATOR', 'BO_HEAD', 'SYSTEM_ADMIN');

/** Handover & Assignment Management — RM, BO roles, compliance, and system admin */
export const requireHandoverRole = () =>
  requireAnyRole('RELATIONSHIP_MANAGER', 'SENIOR_RM', 'BO_MAKER', 'BO_CHECKER', 'BO_HEAD', 'COMPLIANCE_OFFICER', 'SYSTEM_ADMIN');

// ---------------------------------------------------------------------------
// GAP-C15: Fine-grained permission matrix
// ---------------------------------------------------------------------------

const PERMISSION_MATRIX: Record<string, Record<string, string[]>> = {
  fee_plan: { create: ['BO_HEAD', 'SYSTEM_ADMIN'], approve: ['BO_HEAD', 'SYSTEM_ADMIN'], delete: ['SYSTEM_ADMIN'] },
  content_pack: { activate: ['BO_HEAD', 'SYSTEM_ADMIN'], rollback: ['SYSTEM_ADMIN'] },
  dsar: { approve: ['DPO', 'SYSTEM_ADMIN'], process: ['COMPLIANCE_OFFICER', 'DPO', 'SYSTEM_ADMIN'] },
  exception: { escalate: ['BO_HEAD', 'SYSTEM_ADMIN'], bulk_resolve: ['BO_HEAD', 'SYSTEM_ADMIN'] },
  handover: {
    create: ['RM', 'BO_MAKER', 'SYSTEM_ADMIN'],
    submit: ['RM', 'BO_MAKER', 'SYSTEM_ADMIN'],
    authorize: ['BO_CHECKER', 'BO_HEAD', 'SYSTEM_ADMIN'],
    reject: ['BO_CHECKER', 'BO_HEAD', 'SYSTEM_ADMIN'],
    cancel: ['RM', 'BO_MAKER', 'BO_HEAD', 'SYSTEM_ADMIN'],
    reverse: ['BO_HEAD', 'SYSTEM_ADMIN'],
    run_compliance: ['BO_CHECKER', 'BO_HEAD', 'COMPLIANCE_OFFICER', 'SYSTEM_ADMIN'],
    view_audit: ['BO_CHECKER', 'BO_HEAD', 'COMPLIANCE_OFFICER', 'AUDIT', 'SYSTEM_ADMIN'],
  },
};

/**
 * GAP-C15: Fine-grained permission middleware factory.
 * Checks req.user.roles (array) or req.userRole (string) against
 * PERMISSION_MATRIX[resource][action].
 */
export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const allowedRoles = PERMISSION_MATRIX[resource]?.[action];
    if (!allowedRoles) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `No permission rule defined for ${resource}:${action}`,
          correlation_id: req.id,
        },
      });
    }

    // Support both req.user.roles (array) and req.userRole (string)
    const userRoles: string[] = (req as any).user?.roles
      ?? (req.userRole ? [req.userRole.toUpperCase()] : []);

    const hasPermission = userRoles.some((role: string) => allowedRoles.includes(role.toUpperCase()));

    if (!hasPermission) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Permission denied for ${resource}:${action}`,
          requiredRoles: allowedRoles,
          currentRoles: userRoles,
          correlation_id: req.id,
        },
      });
    }

    next();
  };
}

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
