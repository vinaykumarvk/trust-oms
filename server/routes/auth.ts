/**
 * Authentication API Routes (Phase 0C)
 *
 * Public endpoints (no auth required):
 *   POST   /login           -- Authenticate and receive token pair
 *   POST   /refresh          -- Exchange refresh token for new token pair
 *
 * Protected endpoints (auth required):
 *   POST   /logout           -- Revoke current session
 *   POST   /logout-all       -- Revoke all sessions for current user
 *   GET    /me               -- Get current user profile
 *   PUT    /change-password   -- Change password (requires old password)
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { authService, AuthError } from '../services/auth-service';

const router = Router();

// =============================================================================
// Public — no auth required
// =============================================================================

/** POST /login -- Authenticate and receive token pair */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'username and password are required' },
      });
    }

    try {
      const { user, tokens } = await authService.login({
        username,
        password,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Set httpOnly cookies (invisible to JS — mitigates XSS token theft)
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('trustoms-access-token', tokens.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });
      res.cookie('trustoms-refresh-token', tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/v1/auth',
      });

      res.json({
        data: {
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({
          error: { code: 'AUTH_FAILED', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** POST /refresh -- Exchange refresh token for new token pair */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    // Accept refresh token from body or httpOnly cookie
    const refreshToken = req.body.refreshToken || req.cookies?.['trustoms-refresh-token'];

    if (!refreshToken) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'refreshToken is required' },
      });
    }

    try {
      const { user, tokens } = await authService.refresh(
        refreshToken,
        req.ip,
        req.headers['user-agent'],
      );

      // Set httpOnly cookies
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('trustoms-access-token', tokens.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });
      res.cookie('trustoms-refresh-token', tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/v1/auth',
      });

      res.json({
        data: {
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({
          error: { code: 'AUTH_FAILED', message: err.message },
        });
      }
      throw err;
    }
  }),
);

// =============================================================================
// Protected — auth required
// =============================================================================

/** POST /logout -- Revoke current session */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    // Accept refresh token from body or httpOnly cookie
    const refreshToken = req.body.refreshToken || req.cookies?.['trustoms-refresh-token'];

    if (refreshToken) {
      await authService.logoutSingle(refreshToken);
    } else if (req.userId) {
      // If no refresh token provided, revoke all sessions
      const userId = parseInt(req.userId, 10);
      if (!isNaN(userId)) {
        await authService.logout(userId);
      }
    }

    // Clear httpOnly cookies
    res.clearCookie('trustoms-access-token', { path: '/' });
    res.clearCookie('trustoms-refresh-token', { path: '/api/v1/auth' });

    res.json({ data: { message: 'Logged out successfully' } });
  }),
);

/** POST /logout-all -- Revoke all sessions for current user */
router.post(
  '/logout-all',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.userId || '0', 10);
    if (!userId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    await authService.logout(userId);

    // Clear httpOnly cookies
    res.clearCookie('trustoms-access-token', { path: '/' });
    res.clearCookie('trustoms-refresh-token', { path: '/api/v1/auth' });

    res.json({ data: { message: 'All sessions revoked' } });
  }),
);

/** GET /me -- Get current user profile */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.userId || '0', 10);
    if (!userId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    try {
      const profile = await authService.getProfile(userId);
      res.json({ data: profile });
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      throw err;
    }
  }),
);

/** PUT /change-password -- Change password */
router.put(
  '/change-password',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.userId || '0', 10);
    if (!userId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'oldPassword and newPassword are required' },
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'New password must be at least 8 characters' },
      });
    }

    try {
      await authService.changePassword(userId, oldPassword, newPassword);
      res.json({ data: { message: 'Password changed. All sessions revoked — please login again.' } });
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({
          error: { code: 'AUTH_FAILED', message: err.message },
        });
      }
      throw err;
    }
  }),
);

export default router;
