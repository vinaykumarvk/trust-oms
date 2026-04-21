import type { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';

// Extend Express Request with auth info
declare global {
  namespace Express {
    interface Request {
      /** Correlation / request ID set by request-id middleware. */
      id?: string;
      userId?: string;
      userRole?: string;
      userEmail?: string;
    }
  }
}

/** Paths that never require authentication */
const PUBLIC_PATHS = ['/api/v1/health', '/health', '/readiness', '/api/v1/auth/login', '/api/v1/auth/refresh'];

const JWT_SECRET_RAW = process.env.JWT_SECRET || 'trustoms-dev-secret-change-in-production';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

/**
 * Auth middleware — verifies JWT signed by auth-service.
 *
 * In development mode (NODE_ENV=development) unauthenticated requests
 * are permitted with a default dev identity so the app is usable
 * without a real login. A Bearer token, if provided, is still fully
 * verified (signature, expiry, issuer).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for public / health paths
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;

  // Extract token: Bearer header takes priority, then httpOnly cookie fallback
  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies?.['trustoms-access-token']) {
    token = req.cookies['trustoms-access-token'];
  }

  // No token provided
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      req.userId = 'dev-user';
      req.userRole = 'rm';
      req.userEmail = 'dev@trustoms.local';
      return next();
    }
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        correlation_id: req.id,
      },
    });
  }

  jose
    .jwtVerify(token, JWT_SECRET, { issuer: 'trustoms' })
    .then(({ payload }) => {
      req.userId = (payload.sub as string) || 'unknown';
      req.userRole = (payload.role as string) || 'rm';
      req.userEmail = (payload.email as string) || '';
      next();
    })
    .catch(() => {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          correlation_id: req.id,
        },
      });
    });
}

/**
 * Role guard factory — returns middleware that rejects requests
 * whose `req.userRole` is not in the allowed set.
 *
 * Usage:
 *   router.post('/dangerous', requireRole('HEAD_TRADER', 'COMPLIANCE_OFFICER'), handler);
 */
export function requireRole(...roles: string[]) {
  const allowed = new Set(roles.map((r) => r.toLowerCase()));
  // system_admin always passes role checks
  allowed.add('system_admin');

  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req.userRole || '').toLowerCase();
    if (!allowed.has(role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Role '${req.userRole}' is not authorized for this action`,
          correlation_id: req.id,
        },
      });
    }
    next();
  };
}
