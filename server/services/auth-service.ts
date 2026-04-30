/**
 * Authentication Service (Phase 0C)
 *
 * PostgreSQL-based auth with JWT access/refresh token pair.
 * Uses `jose` for JWT signing/verification and `bcryptjs` for password hashing.
 *
 * Token lifecycle:
 *   - Access token: short-lived (15 min), signed with JWT_SECRET
 *   - Refresh token: longer-lived (7 days), stored as SHA-256 hash in `sessions` table
 *   - On refresh, old session is revoked and new session + tokens issued
 */

import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, isNull, gt } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const JWT_SECRET_RAW = process.env.JWT_SECRET || (isDevOrTest ? 'trustoms-dev-secret-change-in-production' : '');
if (!JWT_SECRET_RAW && !isDevOrTest) {
  throw new Error('FATAL: JWT_SECRET environment variable is required in production. Refusing to start with no secret.');
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoginInput {
  username: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
  role: string;
  department: string | null;
  office: string | null;
  clientId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

async function signAccessToken(user: AuthUser): Promise<string> {
  const claims: Record<string, string> = {
    sub: String(user.id),
    role: user.role,
    email: user.email || '',
    name: user.fullName || '',
    office: user.office || '',
  };
  if (user.clientId) {
    claims.clientId = user.clientId;
  }
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .setIssuer('trustoms')
    .sign(JWT_SECRET);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const authService = {
  /**
   * Verify a JWT access token and return the payload.
   * Throws if token is invalid, expired, or tampered.
   */
  async verifyAccessToken(token: string) {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      issuer: 'trustoms',
    });
    return payload;
  },

  /**
   * Hash a plaintext password for storage.
   */
  async hashPassword(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
  },

  /**
   * Authenticate a user by username/password and return a token pair.
   */
  async login(input: LoginInput): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const { username, password, ipAddress, userAgent } = input;

    // Look up user
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.username, username), eq(schema.users.is_active, true)))
      .limit(1);

    if (!user) {
      throw new AuthError('Invalid credentials', 401);
    }

    if (!user.password_hash) {
      throw new AuthError('Account has no password set — contact administrator', 401);
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AuthError('Invalid credentials', 401);
    }

    // Build auth user
    const authUser: AuthUser = {
      id: user.id,
      username: user.username!,
      email: user.email,
      fullName: user.full_name,
      role: user.role || 'rm',
      department: user.department,
      office: user.office,
      clientId: user.client_id,
    };

    // Generate tokens
    const accessToken = await signAccessToken(authUser);
    const refreshToken = generateRefreshToken();

    // Store refresh token hash in sessions table
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await db.insert(schema.sessions).values({
      user_id: user.id,
      refresh_token_hash: hashRefreshToken(refreshToken),
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      expires_at: expiresAt,
    });

    // Update last_login
    await db
      .update(schema.users)
      .set({ last_login: new Date() })
      .where(eq(schema.users.id, user.id));

    return {
      user: authUser,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes in seconds
      },
    };
  },

  /**
   * Issue a new token pair using a valid refresh token.
   * The old session is revoked and a new one created (token rotation).
   */
  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const tokenHash = hashRefreshToken(refreshToken);

    // Find active session
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.refresh_token_hash, tokenHash),
          isNull(schema.sessions.revoked_at),
          gt(schema.sessions.expires_at, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      throw new AuthError('Invalid or expired refresh token', 401);
    }

    // Revoke the old session (token rotation)
    await db
      .update(schema.sessions)
      .set({ revoked_at: new Date() })
      .where(eq(schema.sessions.id, session.id));

    // Look up user
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, session.user_id), eq(schema.users.is_active, true)))
      .limit(1);

    if (!user) {
      throw new AuthError('User account disabled', 403);
    }

    const authUser: AuthUser = {
      id: user.id,
      username: user.username!,
      email: user.email,
      fullName: user.full_name,
      role: user.role || 'rm',
      department: user.department,
      office: user.office,
      clientId: user.client_id,
    };

    // Issue new tokens
    const newAccessToken = await signAccessToken(authUser);
    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await db.insert(schema.sessions).values({
      user_id: user.id,
      refresh_token_hash: hashRefreshToken(newRefreshToken),
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      expires_at: expiresAt,
    });

    return {
      user: authUser,
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900,
      },
    };
  },

  /**
   * Revoke all sessions for a user (logout everywhere).
   */
  async logout(userId: number): Promise<void> {
    await db
      .update(schema.sessions)
      .set({ revoked_at: new Date() })
      .where(and(eq(schema.sessions.user_id, userId), isNull(schema.sessions.revoked_at)));
  },

  /**
   * Revoke a single session by refresh token.
   */
  async logoutSingle(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await db
      .update(schema.sessions)
      .set({ revoked_at: new Date() })
      .where(eq(schema.sessions.refresh_token_hash, tokenHash));
  },

  /**
   * Change password for a user. Verifies old password first.
   */
  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user || !user.password_hash) {
      throw new AuthError('User not found', 404);
    }

    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      throw new AuthError('Current password is incorrect', 401);
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db
      .update(schema.users)
      .set({ password_hash: newHash, updated_at: new Date() })
      .where(eq(schema.users.id, userId));

    // Revoke all sessions (force re-login)
    await this.logout(userId);
  },

  /**
   * Get current user profile from a verified token payload.
   */
  async getProfile(userId: number): Promise<AuthUser> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      throw new AuthError('User not found', 404);
    }

    return {
      id: user.id,
      username: user.username!,
      email: user.email,
      fullName: user.full_name,
      role: user.role || 'rm',
      department: user.department,
      office: user.office,
      clientId: user.client_id,
    };
  },
};

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
