/**
 * MFA Service
 *
 * Handles TOTP enrollment, verification, and backup codes.
 * Uses otpauth library for RFC 6238 compliant TOTP generation/validation.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import crypto from 'node:crypto';

const ISSUER = 'TrustOMS';
const BACKUP_CODE_COUNT = 8;

/** Generate a random base32 secret for TOTP */
function generateSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

/** Generate backup codes (8 random 8-char alphanumeric codes) */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

/** Hash a backup code for storage */
function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

export const mfaService = {
  /**
   * Start MFA enrollment: generate secret, return QR code data URL and backup codes.
   * Does NOT activate MFA yet — user must verify with a code first.
   */
  async enrollMFA(userId: number) {
    // Check if user exists
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check for existing active enrollment
    const [existing] = await db
      .select()
      .from(schema.mfaEnrollments)
      .where(eq(schema.mfaEnrollments.user_id, userId))
      .limit(1);

    if (existing?.verified_at) {
      throw new Error('MFA is already enrolled and verified. Disable MFA first to re-enroll.');
    }

    // Delete any unverified enrollment
    if (existing && !existing.verified_at) {
      await db
        .delete(schema.mfaEnrollments)
        .where(eq(schema.mfaEnrollments.id, existing.id));
    }

    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    const hashedCodes = backupCodes.map(hashBackupCode);

    // Create TOTP instance for QR code generation
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: user.email || user.username || `user-${userId}`,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const otpauthUri = totp.toString();

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

    // Store enrollment (unverified)
    await db
      .insert(schema.mfaEnrollments)
      .values({
        user_id: userId,
        totp_secret: secret,
        backup_codes: JSON.stringify(hashedCodes),
        verified_at: null,
      });

    return {
      secret,           // Show to user for manual entry
      qrCodeDataUrl,    // For scanning with authenticator app
      backupCodes,      // Show once, user must save these
      otpauthUri,       // For advanced users
    };
  },

  /**
   * Verify a TOTP code to confirm enrollment.
   * Sets verified_at and enables MFA on the user record.
   */
  async verifyEnrollment(userId: number, token: string) {
    const [enrollment] = await db
      .select()
      .from(schema.mfaEnrollments)
      .where(eq(schema.mfaEnrollments.user_id, userId))
      .limit(1);

    if (!enrollment) {
      throw new Error('No MFA enrollment found. Start enrollment first.');
    }

    if (enrollment.verified_at) {
      throw new Error('MFA enrollment is already verified.');
    }

    const isValid = this.verifyTOTP(enrollment.totp_secret, token);
    if (!isValid) {
      throw new Error('Invalid TOTP code. Please try again with a fresh code from your authenticator app.');
    }

    // Mark enrollment as verified
    await db
      .update(schema.mfaEnrollments)
      .set({ verified_at: new Date(), updated_at: new Date() })
      .where(eq(schema.mfaEnrollments.id, enrollment.id));

    // Enable MFA on user record
    await db
      .update(schema.users)
      .set({ mfa_enabled: true, updated_at: new Date() })
      .where(eq(schema.users.id, userId));

    return { success: true, message: 'MFA enrollment verified and activated.' };
  },

  /**
   * Verify a TOTP code against a stored secret.
   * Allows a 1-step window (+/- 30 seconds) for clock drift.
   */
  verifyTOTP(secret: string, token: string): boolean {
    if (!/^\d{6}$/.test(token)) {
      return false;
    }

    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    // delta: null means invalid, 0 means exact match, +/-1 means within window
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  },

  /**
   * Verify a TOTP code for a specific user (used by kill-switch and other MFA-protected operations).
   * Looks up the user's enrollment and validates the token.
   */
  async verifyUserTOTP(userId: number, token: string): Promise<boolean> {
    // First try TOTP
    const [enrollment] = await db
      .select()
      .from(schema.mfaEnrollments)
      .where(eq(schema.mfaEnrollments.user_id, userId))
      .limit(1);

    if (!enrollment || !enrollment.verified_at) {
      throw new Error('MFA is not enrolled for this user. Enroll MFA first.');
    }

    // Try TOTP code
    if (this.verifyTOTP(enrollment.totp_secret, token)) {
      return true;
    }

    // Try backup code
    const hashedToken = hashBackupCode(token);
    const storedCodes: string[] = JSON.parse(enrollment.backup_codes || '[]');
    const codeIndex = storedCodes.indexOf(hashedToken);

    if (codeIndex >= 0) {
      // Remove used backup code
      storedCodes.splice(codeIndex, 1);
      await db
        .update(schema.mfaEnrollments)
        .set({
          backup_codes: JSON.stringify(storedCodes),
          updated_at: new Date(),
        })
        .where(eq(schema.mfaEnrollments.id, enrollment.id));
      return true;
    }

    return false;
  },

  /**
   * Disable MFA for a user. Deletes enrollment and clears the flag.
   */
  async disableMFA(userId: number) {
    await db
      .delete(schema.mfaEnrollments)
      .where(eq(schema.mfaEnrollments.user_id, userId));

    await db
      .update(schema.users)
      .set({ mfa_enabled: false, updated_at: new Date() })
      .where(eq(schema.users.id, userId));

    return { success: true, message: 'MFA has been disabled.' };
  },

  /**
   * Get MFA status for a user.
   */
  async getMFAStatus(userId: number) {
    const [user] = await db
      .select({ mfa_enabled: schema.users.mfa_enabled })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const [enrollment] = await db
      .select({
        id: schema.mfaEnrollments.id,
        verified_at: schema.mfaEnrollments.verified_at,
        backup_codes: schema.mfaEnrollments.backup_codes,
      })
      .from(schema.mfaEnrollments)
      .where(eq(schema.mfaEnrollments.user_id, userId))
      .limit(1);

    const backupCodesRemaining = enrollment?.backup_codes
      ? JSON.parse(enrollment.backup_codes).length
      : 0;

    return {
      mfa_enabled: user.mfa_enabled ?? false,
      enrolled: !!enrollment,
      verified: !!enrollment?.verified_at,
      backup_codes_remaining: backupCodesRemaining,
    };
  },

  /**
   * Regenerate backup codes (requires valid TOTP code first).
   */
  async regenerateBackupCodes(userId: number, totpToken: string) {
    const isValid = await this.verifyUserTOTP(userId, totpToken);
    if (!isValid) {
      throw new Error('Invalid TOTP code. Backup code regeneration requires a valid authenticator code.');
    }

    const newCodes = generateBackupCodes();
    const hashedCodes = newCodes.map(hashBackupCode);

    await db
      .update(schema.mfaEnrollments)
      .set({
        backup_codes: JSON.stringify(hashedCodes),
        updated_at: new Date(),
      })
      .where(eq(schema.mfaEnrollments.user_id, userId));

    return { backupCodes: newCodes };
  },
};
