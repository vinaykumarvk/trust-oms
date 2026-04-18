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

/**
 * Auth middleware - verifies Supabase JWT
 * Full implementation in Phase 0C
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for public paths
  const publicPaths = ['/api/v1/health', '/health', '/readiness'];
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // For development, allow unauthenticated requests
    if (process.env.NODE_ENV === 'development') {
      req.userId = 'dev-user';
      req.userRole = 'system_admin';
      req.userEmail = 'dev@trustoms.local';
      return next();
    }
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header', correlation_id: (req as any).id },
    });
  }

  // TODO: Verify Supabase JWT token (Phase 0C)
  // For now, pass through in development
  req.userId = 'dev-user';
  req.userRole = 'system_admin';
  req.userEmail = 'dev@trustoms.local';
  next();
}
