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
// Service
// ---------------------------------------------------------------------------

export const killSwitchService = {
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

    // Validate MFA
    if (!invokedBy.mfaVerified) {
      throw new Error(
        'MFA verification required: the kill switch can only be invoked with a verified MFA session.',
      );
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

    return halt;
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
