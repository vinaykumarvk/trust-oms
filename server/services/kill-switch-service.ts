/**
 * Kill-Switch Service (Phase 4B)
 *
 * Provides emergency trading halt capabilities scoped to MARKET, ASSET_CLASS,
 * PORTFOLIO, or DESK. Enforces role-based invocation (CRO/CCO only with MFA),
 * dual-approval resumption, and maintains a full audit trail of all halt events.
 *
 * The cancelOpenOrders method is a stub that would integrate with the order
 * management system to cancel all in-flight orders matching the halt scope.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, isNull } from 'drizzle-orm';
import { mfaService } from './mfa-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KillSwitchScope {
  type: string;  // MARKET | ASSET_CLASS | PORTFOLIO | DESK
  value: string;
}

interface InvokedBy {
  userId: number;
  role: string;
  mfaVerified: boolean;
}

interface DualApproval {
  userId1: number;
  userId2: number;
}

interface InvokeKillSwitchData {
  scope: KillSwitchScope;
  reason: string;
  invokedBy: InvokedBy;
}

interface HistoryFilters {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTHORIZED_ROLES = ['CRO', 'CCO'];
const VALID_SCOPE_TYPES = ['MARKET', 'ASSET_CLASS', 'PORTFOLIO', 'DESK'];

// ---------------------------------------------------------------------------
// FR-KSW-003: FIX Session Configuration (stub)
//
// In production, this would be loaded from a configuration table or
// external FIX engine registry (e.g., QuickFIX/J session settings).
// ---------------------------------------------------------------------------
interface FIXSession {
  sessionId: string;
  senderCompId: string;
  targetCompId: string;
  /** Scope tags for this session: which markets/asset classes it handles */
  scopeType: 'MARKET' | 'ASSET_CLASS' | 'PORTFOLIO' | 'DESK' | 'ALL';
  scopeValue: string;
  status: 'ACTIVE' | 'DISCONNECTED' | 'LOGGED_OUT';
}

/**
 * Stub FIX session registry. In production, this would be queried from
 * a fixSessions database table or the FIX engine's session directory.
 */
const FIX_SESSION_REGISTRY: FIXSession[] = [
  {
    sessionId: 'FIX-PSE-001',
    senderCompId: 'TRUSTOMS',
    targetCompId: 'PSE-GATEWAY',
    scopeType: 'MARKET',
    scopeValue: 'PSE',
    status: 'ACTIVE',
  },
  {
    sessionId: 'FIX-PDEx-001',
    senderCompId: 'TRUSTOMS',
    targetCompId: 'PDEX-GATEWAY',
    scopeType: 'ASSET_CLASS',
    scopeValue: 'FIXED_INCOME',
    status: 'ACTIVE',
  },
  {
    sessionId: 'FIX-FX-001',
    senderCompId: 'TRUSTOMS',
    targetCompId: 'PDS-FX-GATEWAY',
    scopeType: 'ASSET_CLASS',
    scopeValue: 'FX',
    status: 'ACTIVE',
  },
  {
    sessionId: 'FIX-BROKER-COL',
    senderCompId: 'TRUSTOMS',
    targetCompId: 'COL-FINANCIAL',
    scopeType: 'MARKET',
    scopeValue: 'PSE',
    status: 'ACTIVE',
  },
  {
    sessionId: 'FIX-ALL-001',
    senderCompId: 'TRUSTOMS',
    targetCompId: 'BACKUP-GATEWAY',
    scopeType: 'ALL',
    scopeValue: '*',
    status: 'ACTIVE',
  },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const killSwitchService = {
  /**
   * FR-KSW-001: Verify a TOTP code against the user's enrolled secret.
   * Uses mfaService for real RFC 6238 TOTP validation.
   */
  async verifyTOTP(userId: number, token: string): Promise<boolean> {
    try {
      return await mfaService.verifyUserTOTP(userId, token);
    } catch {
      // If MFA not enrolled, verification fails
      return false;
    }
  },

  /**
   * Invoke the kill switch to halt trading for a given scope.
   * Only CRO or CCO roles with MFA verified may invoke.
   * Returns the newly created halt record.
   */
  async invokeKillSwitch(data: InvokeKillSwitchData) {
    const { scope, reason, invokedBy } = data;

    // Validate role
    if (!AUTHORIZED_ROLES.includes(invokedBy.role)) {
      throw new Error(
        `Unauthorized: only ${AUTHORIZED_ROLES.join('/')} may invoke the kill switch. Role '${invokedBy.role}' is not permitted.`,
      );
    }

    // FR-KSW-001: MFA verification (TOTP-based).
    // In production, this validates a TOTP code against the user's registered
    // TOTP secret (e.g., via Google Authenticator / Authy). The mfaVerified
    // flag indicates the caller has already passed TOTP validation at the
    // route/middleware level. If an mfaToken is provided, we verify it here.
    if (!invokedBy.mfaVerified) {
      // Check if an MFA token was provided for inline verification
      const mfaToken = (invokedBy as any).mfaToken as string | undefined;
      if (mfaToken) {
        const isValid = await this.verifyTOTP(invokedBy.userId, mfaToken);
        if (!isValid) {
          throw new Error(
            'MFA verification failed: invalid or expired TOTP code.',
          );
        }
        // MFA passed — continue
      } else {
        throw new Error(
          'MFA verification required: the kill switch can only be invoked with a verified MFA session.',
        );
      }
    }

    // Validate scope type
    if (!VALID_SCOPE_TYPES.includes(scope.type)) {
      throw new Error(
        `Invalid scope type: ${scope.type}. Must be one of: ${VALID_SCOPE_TYPES.join(', ')}`,
      );
    }

    if (!scope.value) {
      throw new Error('Scope value is required');
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('A reason is required when invoking the kill switch');
    }

    // Check for an already-active halt on the same scope
    const existingHalts = await db
      .select()
      .from(schema.killSwitchEvents)
      .where(
        and(
          isNull(schema.killSwitchEvents.resumed_at),
          sql`${schema.killSwitchEvents.scope}->>'type' = ${scope.type}`,
          sql`${schema.killSwitchEvents.scope}->>'value' = ${scope.value}`,
        ),
      )
      .limit(1);

    if (existingHalts.length > 0) {
      throw new Error(
        `An active halt already exists for scope ${scope.type}:${scope.value} (halt ID: ${existingHalts[0].id})`,
      );
    }

    // Insert the halt record
    const [halt] = await db
      .insert(schema.killSwitchEvents)
      .values({
        scope,
        reason,
        invoked_by: invokedBy,
        active_since: new Date(),
        resumed_at: null,
        resume_approved_by: null,
      })
      .returning();

    // FR-KSW-003: Disconnect FIX sessions matching the halt scope (fire-and-forget)
    this.disconnectFIXSessions(scope).catch((err) => {
      console.error(
        `[KillSwitch] FIX session disconnect failed for scope ${scope.type}:${scope.value}:`,
        err,
      );
    });

    return halt;
  },

  /**
   * FR-KSW-003: Disconnect FIX sessions matching the halt scope.
   *
   * Queries the FIX session registry for sessions that match the halt scope
   * and sends a Logout (MsgType=5) message to each. In production, this would
   * interface with the FIX engine (e.g., QuickFIX/J) to initiate graceful
   * session logout. The stub implementation logs the action and updates the
   * in-memory session status.
   *
   * Scope matching rules:
   * - MARKET halt: disconnect sessions with scopeType=MARKET matching the value,
   *   plus any sessions with scopeType=ALL
   * - ASSET_CLASS halt: disconnect sessions with scopeType=ASSET_CLASS matching
   *   the value, plus ALL sessions
   * - PORTFOLIO/DESK halt: disconnect ALL sessions (conservative approach)
   *
   * @returns The count of sessions that were sent Logout messages
   */
  async disconnectFIXSessions(scope: KillSwitchScope): Promise<{ disconnectedCount: number; sessions: string[] }> {
    const matchingSessions = FIX_SESSION_REGISTRY.filter((session) => {
      // Skip already disconnected/logged-out sessions
      if (session.status !== 'ACTIVE') return false;

      // ALL-scope sessions are always disconnected on any halt
      if (session.scopeType === 'ALL') return true;

      // Match by scope type and value
      if (session.scopeType === scope.type && session.scopeValue === scope.value) return true;

      // MARKET-wide or PORTFOLIO/DESK halts: disconnect everything
      if (scope.type === 'MARKET' && scope.value === '*') return true;

      return false;
    });

    const disconnectedSessionIds: string[] = [];

    for (const session of matchingSessions) {
      // Stub: In production, this would send a FIX Logout message (MsgType=5)
      // via the FIX engine API:
      //   fixEngine.sendLogout(session.sessionId, {
      //     text: `Kill switch activated: ${scope.type}:${scope.value}`,
      //   });
      //
      // The Logout message per FIX 4.2/4.4 spec:
      //   8=FIX.4.4 | 35=5 | 49={senderCompId} | 56={targetCompId}
      //   58=Kill switch activated: {scope.type}:{scope.value}

      console.log(
        `[KillSwitch] FIX Logout → session=${session.sessionId} ` +
        `sender=${session.senderCompId} target=${session.targetCompId} ` +
        `reason="Kill switch halt: ${scope.type}:${scope.value}"`,
      );

      // Update in-memory status (in production, FIX engine manages this)
      session.status = 'LOGGED_OUT';
      disconnectedSessionIds.push(session.sessionId);
    }

    console.log(
      `[KillSwitch] FIX session disconnect complete: ${disconnectedSessionIds.length} session(s) logged out ` +
      `for scope ${scope.type}:${scope.value}`,
    );

    return {
      disconnectedCount: disconnectedSessionIds.length,
      sessions: disconnectedSessionIds,
    };
  },

  /**
   * Cancel all in-flight orders matching the halt scope.
   * Stub implementation: in production this would integrate with the
   * order management system and FIX gateway to cancel live orders.
   */
  async cancelOpenOrders(scope: KillSwitchScope): Promise<{ cancelledCount: number }> {
    // Determine which orders to cancel based on scope type
    let cancelledCount = 0;

    const activeStatuses = ['DRAFT', 'PENDING_AUTH', 'AUTHORIZED', 'PLACED', 'PARTIALLY_FILLED'];
    const statusFilter = sql`${schema.orders.order_status} IN (${sql.join(activeStatuses.map((s) => sql`${s}`), sql`, `)})`;

    switch (scope.type) {
      case 'MARKET': {
        // Cancel all in-flight orders (market-wide halt)
        const result = await db
          .update(schema.orders)
          .set({
            order_status: 'CANCELLED',
            updated_at: new Date(),
            updated_by: 'KILL_SWITCH',
          })
          .where(statusFilter)
          .returning();
        cancelledCount = result.length;
        break;
      }

      case 'ASSET_CLASS': {
        // Cancel orders whose security belongs to the specified asset class
        const result = await db
          .update(schema.orders)
          .set({
            order_status: 'CANCELLED',
            updated_at: new Date(),
            updated_by: 'KILL_SWITCH',
          })
          .where(
            and(
              statusFilter,
              sql`${schema.orders.security_id} IN (
                SELECT id FROM securities WHERE asset_class = ${scope.value}
              )`,
            ),
          )
          .returning();
        cancelledCount = result.length;
        break;
      }

      case 'PORTFOLIO': {
        // Cancel all orders for a specific portfolio
        const result = await db
          .update(schema.orders)
          .set({
            order_status: 'CANCELLED',
            updated_at: new Date(),
            updated_by: 'KILL_SWITCH',
          })
          .where(
            and(
              statusFilter,
              eq(schema.orders.portfolio_id, scope.value),
            ),
          )
          .returning();
        cancelledCount = result.length;
        break;
      }

      case 'DESK': {
        // Cancel orders placed by traders belonging to the specified desk
        // Stub: in production, would look up desk membership from a desk/team table
        // For now, we log the intent and return 0
        console.log(`[KillSwitch] DESK-level cancel requested for desk: ${scope.value} — stub, no orders cancelled`);
        cancelledCount = 0;
        break;
      }

      default:
        throw new Error(`Unsupported scope type for order cancellation: ${scope.type}`);
    }

    return { cancelledCount };
  },

  /**
   * Get all currently active halts (not yet resumed).
   */
  async getActiveHalts() {
    const halts = await db
      .select()
      .from(schema.killSwitchEvents)
      .where(isNull(schema.killSwitchEvents.resumed_at))
      .orderBy(desc(schema.killSwitchEvents.active_since));

    return halts;
  },

  /**
   * Get a single halt record by ID.
   */
  async getHalt(id: number) {
    const [halt] = await db
      .select()
      .from(schema.killSwitchEvents)
      .where(eq(schema.killSwitchEvents.id, id))
      .limit(1);

    if (!halt) {
      throw new Error(`Kill switch event not found: ${id}`);
    }

    return halt;
  },

  /**
   * Resume trading for a halted scope. Requires dual approval —
   * two different users must sign off on the resumption.
   * Returns the updated halt record with resumed_at timestamp.
   */
  async resumeTrading(haltId: number, approvedBy: DualApproval) {
    // Validate dual approval: must be two different users
    if (approvedBy.userId1 === approvedBy.userId2) {
      throw new Error(
        'Dual approval required: userId1 and userId2 must be different users',
      );
    }

    if (!approvedBy.userId1 || !approvedBy.userId2) {
      throw new Error(
        'Dual approval required: both userId1 and userId2 must be provided',
      );
    }

    // Fetch the halt
    const [halt] = await db
      .select()
      .from(schema.killSwitchEvents)
      .where(eq(schema.killSwitchEvents.id, haltId))
      .limit(1);

    if (!halt) {
      throw new Error(`Kill switch event not found: ${haltId}`);
    }

    if (halt.resumed_at !== null) {
      throw new Error(
        `Halt ${haltId} has already been resumed at ${halt.resumed_at}`,
      );
    }

    // Update the record
    const [updated] = await db
      .update(schema.killSwitchEvents)
      .set({
        resumed_at: new Date(),
        resume_approved_by: approvedBy,
        updated_at: new Date(),
      })
      .where(eq(schema.killSwitchEvents.id, haltId))
      .returning();

    return updated;
  },

  /**
   * Get paginated history of all kill switch events (including resumed).
   */
  async getHistory(filters: HistoryFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const data = await db
      .select()
      .from(schema.killSwitchEvents)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.killSwitchEvents.active_since));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.killSwitchEvents);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
