import type { Request, Response, NextFunction } from 'express';

// Extend Express Request with auth info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      userEmail?: string;
    }
  }
}

/** Paths that never require authentication */
const PUBLIC_PATHS = ['/api/v1/health', '/health', '/readiness'];

/**
 * Auth middleware — verifies Supabase JWT.
 *
 * In development mode (NODE_ENV=development) unauthenticated requests
 * are permitted with a default dev identity. A Bearer token, if
 * provided, must still have valid JWT structure.
 *
 * In production, a valid Bearer token is always required.
 *
 * TODO(Phase 0C): Replace the base64-decode stub with full Supabase
 *   JWT verification using `@supabase/supabase-js` or `jose`.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for public / health paths
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;

  // No token provided
  if (!authHeader?.startsWith('Bearer ')) {
    if (process.env.NODE_ENV === 'development') {
      // Dev fallback — limited role so RBAC guards still fire
      req.userId = 'dev-user';
      req.userRole = 'rm'; // NOT system_admin — forces RBAC evaluation
      req.userEmail = 'dev@trustoms.local';
      return next();
    }
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        correlation_id: (req as any).id,
      },
    });
  }

  // Extract and validate JWT structure (header.payload.signature)
  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Malformed JWT token',
        correlation_id: (req as any).id,
      },
    });
  }

  try {
    // Decode payload (base64url) — NOT a cryptographic verification.
    // Full verification (signature, expiry, issuer) is implemented in Phase 0C.
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    req.userId = payload.sub || payload.user_id || 'unknown';
    req.userRole = payload.role || payload.user_role || 'rm';
    req.userEmail = payload.email || '';
  } catch {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid JWT payload',
        correlation_id: (req as any).id,
      },
    });
  }

  next();
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
          correlation_id: (req as any).id,
        },
      });
    }
    next();
  };
}
