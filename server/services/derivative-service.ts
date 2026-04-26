/**
 * Derivative Service (FR-DER-001 / FR-DER-002)
 *
 * CRUD operations for derivative instrument setups, derivative tagging
 * on orders, and pre-trade margin checks.
 *
 * FR-DER-001: Derivative instrument setup management
 * FR-DER-002: Derivative tagging on orders + margin validation
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DerivativeSetup = InferSelectModel<typeof schema.derivativeSetups>;

/** Allowed instrument types from the enum */
const VALID_INSTRUMENT_TYPES = [
  'OPTION_CALL',
  'OPTION_PUT',
  'FUTURES',
  'FORWARD',
  'SWAP',
  'WARRANT',
] as const;

type InstrumentType = typeof VALID_INSTRUMENT_TYPES[number];

interface DerivativeSetupInput {
  instrument_type: InstrumentType;
  underlier?: string;
  underlier_security_id?: number;
  notional?: string;
  strike_price?: string;
  expiry_date?: string;
  margin_req?: string;
  max_notional_limit?: string;
  allowed_underliers?: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface MarginCheckResult {
  rule: string;
  passed: boolean;
  severity: 'hard' | 'soft' | null;
  message: string;
  overridable: boolean;
}

interface ListParams {
  page?: number;
  pageSize?: number;
  instrument_type?: string;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validate a derivative setup against business rules:
 *   1. notional must not exceed max_notional_limit
 *   2. expiry_date must be in the future
 *   3. underlier must be in allowed_underliers list (if list is defined)
 */
function validateDerivativeSetupData(
  setup: Partial<DerivativeSetup> | DerivativeSetupInput,
): ValidationResult {
  const errors: string[] = [];

  // Rule 1: Notional must not exceed max_notional_limit
  const notional = Number(setup.notional ?? 0);
  const maxNotional = Number(setup.max_notional_limit ?? 0);

  if (maxNotional > 0 && notional > maxNotional) {
    errors.push(
      `Notional ${notional.toLocaleString()} exceeds max_notional_limit ${maxNotional.toLocaleString()}`,
    );
  }

  // Rule 2: expiry_date must be in the future
  if (setup.expiry_date) {
    const expiryDate = new Date(setup.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiryDate <= today) {
      errors.push(
        `Expiry date ${setup.expiry_date} must be in the future`,
      );
    }
  }

  // Rule 3: underlier must be in allowed_underliers (when list is defined)
  const allowedUnderliers = setup.allowed_underliers as string[] | null | undefined;
  if (
    allowedUnderliers &&
    Array.isArray(allowedUnderliers) &&
    allowedUnderliers.length > 0 &&
    setup.underlier
  ) {
    if (!allowedUnderliers.includes(setup.underlier)) {
      errors.push(
        `Underlier "${setup.underlier}" is not in the allowed underliers list: [${allowedUnderliers.join(', ')}]`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const derivativeService = {
  // =========================================================================
  // FR-DER-001: CRUD Operations
  // =========================================================================

  /**
   * Create a new derivative setup.
   * Validates notional limits before insertion.
   */
  async createSetup(data: DerivativeSetupInput): Promise<DerivativeSetup> {
    // Validate before insert
    const validation = validateDerivativeSetupData(data);
    if (!validation.valid) {
      throw new Error(
        `Derivative setup validation failed: ${validation.errors.join('; ')}`,
      );
    }

    const [setup] = await db
      .insert(schema.derivativeSetups)
      .values({
        instrument_type: data.instrument_type,
        underlier: data.underlier,
        underlier_security_id: data.underlier_security_id,
        notional: data.notional,
        strike_price: data.strike_price,
        expiry_date: data.expiry_date,
        margin_req: data.margin_req,
        max_notional_limit: data.max_notional_limit,
        allowed_underliers: data.allowed_underliers,
      })
      .returning();

    return setup;
  },

  /**
   * Fetch a single derivative setup by ID.
   * Returns null if not found or soft-deleted.
   */
  async getSetup(id: number): Promise<DerivativeSetup | null> {
    const [setup] = await db
      .select()
      .from(schema.derivativeSetups)
      .where(
        and(
          eq(schema.derivativeSetups.id, id),
          eq(schema.derivativeSetups.is_deleted, false),
        ),
      )
      .limit(1);

    return setup ?? null;
  },

  /**
   * List derivative setups with pagination and optional instrument_type filter.
   */
  async listSetups(params: ListParams): Promise<{
    data: DerivativeSetup[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions = [eq(schema.derivativeSetups.is_deleted, false)];

    if (params.instrument_type) {
      conditions.push(
        eq(
          schema.derivativeSetups.instrument_type,
          params.instrument_type as InstrumentType,
        ),
      );
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const data = await db
      .select()
      .from(schema.derivativeSetups)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.derivativeSetups.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.derivativeSetups)
      .where(where);

    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Update an existing derivative setup.
   * Validates updated fields against business rules.
   */
  async updateSetup(
    id: number,
    data: Partial<DerivativeSetupInput>,
  ): Promise<DerivativeSetup> {
    // Fetch existing to merge for validation
    const existing = await derivativeService.getSetup(id);
    if (!existing) {
      throw new Error(`Derivative setup not found: ${id}`);
    }

    // Merge existing values with updates for full validation
    const merged = {
      ...existing,
      ...data,
    };

    const validation = validateDerivativeSetupData(merged);
    if (!validation.valid) {
      throw new Error(
        `Derivative setup validation failed: ${validation.errors.join('; ')}`,
      );
    }

    const [updated] = await db
      .update(schema.derivativeSetups)
      .set({
        ...(data.instrument_type !== undefined && {
          instrument_type: data.instrument_type,
        }),
        ...(data.underlier !== undefined && { underlier: data.underlier }),
        ...(data.underlier_security_id !== undefined && {
          underlier_security_id: data.underlier_security_id,
        }),
        ...(data.notional !== undefined && { notional: data.notional }),
        ...(data.strike_price !== undefined && {
          strike_price: data.strike_price,
        }),
        ...(data.expiry_date !== undefined && {
          expiry_date: data.expiry_date,
        }),
        ...(data.margin_req !== undefined && { margin_req: data.margin_req }),
        ...(data.max_notional_limit !== undefined && {
          max_notional_limit: data.max_notional_limit,
        }),
        ...(data.allowed_underliers !== undefined && {
          allowed_underliers: data.allowed_underliers,
        }),
        updated_at: new Date(),
      })
      .where(eq(schema.derivativeSetups.id, id))
      .returning();

    return updated;
  },

  /**
   * Soft-delete a derivative setup by setting is_deleted = true.
   */
  async deleteSetup(id: number): Promise<{ success: boolean }> {
    const existing = await derivativeService.getSetup(id);
    if (!existing) {
      throw new Error(`Derivative setup not found: ${id}`);
    }

    await db
      .update(schema.derivativeSetups)
      .set({
        is_deleted: true,
        updated_at: new Date(),
      })
      .where(eq(schema.derivativeSetups.id, id));

    return { success: true };
  },

  /**
   * Validate a derivative setup against business rules.
   * Public wrapper around the internal validation logic.
   */
  validateDerivativeSetup(
    setup: Partial<DerivativeSetup> | DerivativeSetupInput,
  ): ValidationResult {
    return validateDerivativeSetupData(setup);
  },

  // =========================================================================
  // FR-DER-002: Derivative Tagging on Orders
  // =========================================================================

  /**
   * Attach a derivative setup to an order.
   *
   * Looks up the derivative setup, validates it, then updates the order's
   * derivative_setup_id field. Also auto-populates margin requirement and
   * expiry date from the setup into the order's reason_code/notes field.
   *
   * @param orderId           - The order to tag
   * @param derivativeSetupId - The derivative setup ID to attach
   * @returns The updated order
   */
  async attachDerivativeToOrder(
    orderId: string,
    derivativeSetupId: number,
  ): Promise<InferSelectModel<typeof schema.orders>> {
    // 1. Fetch the derivative setup
    const setup = await derivativeService.getSetup(derivativeSetupId);
    if (!setup) {
      throw new Error(`Derivative setup not found: ${derivativeSetupId}`);
    }

    // 2. Validate the setup is still valid (not expired, etc.)
    const validation = validateDerivativeSetupData(setup);
    if (!validation.valid) {
      throw new Error(
        `Cannot attach invalid derivative setup: ${validation.errors.join('; ')}`,
      );
    }

    // 3. Fetch the order
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // 4. Build auto-populated notes from derivative setup
    const derivativeNotes = [
      `[Derivative] Type: ${setup.instrument_type}`,
      setup.underlier ? `Underlier: ${setup.underlier}` : null,
      setup.margin_req ? `Margin Req: ${Number(setup.margin_req).toLocaleString()}` : null,
      setup.expiry_date ? `Expiry: ${setup.expiry_date}` : null,
      setup.notional ? `Notional: ${Number(setup.notional).toLocaleString()}` : null,
      setup.strike_price ? `Strike: ${Number(setup.strike_price).toLocaleString()}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    // Append derivative info to existing reason_code (used as notes field)
    const existingNotes = order.reason_code ?? '';
    const updatedNotes = existingNotes
      ? `${existingNotes} | ${derivativeNotes}`
      : derivativeNotes;

    // 5. Update the order with derivative_setup_id and enriched notes
    const [updated] = await db
      .update(schema.orders)
      .set({
        derivative_setup_id: derivativeSetupId,
        reason_code: updatedNotes,
        updated_at: new Date(),
      })
      .where(eq(schema.orders.order_id, orderId))
      .returning();

    return updated;
  },

  /**
   * Pre-trade margin check for a derivative order.
   *
   * Verifies that the portfolio associated with the order has sufficient
   * available cash to cover the derivative's margin requirement.
   *
   * @param orderId - The order to check
   * @returns A ValidationResult-style object compatible with pre-trade checks
   */
  async checkDerivativeMargin(orderId: string): Promise<MarginCheckResult> {
    const RULE_NAME = 'FR-DER-002:MARGIN_CHECK';

    // 1. Fetch the order
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      return {
        rule: RULE_NAME,
        passed: false,
        severity: 'hard',
        message: `Order not found: ${orderId}`,
        overridable: false,
      };
    }

    // 2. Check if order has a derivative setup attached
    if (!order.derivative_setup_id) {
      return {
        rule: RULE_NAME,
        passed: true,
        severity: null,
        message: 'No derivative setup attached to this order; margin check not applicable',
        overridable: false,
      };
    }

    // 3. Fetch the derivative setup
    const [setup] = await db
      .select()
      .from(schema.derivativeSetups)
      .where(
        and(
          eq(schema.derivativeSetups.id, order.derivative_setup_id),
          eq(schema.derivativeSetups.is_deleted, false),
        ),
      )
      .limit(1);

    if (!setup) {
      return {
        rule: RULE_NAME,
        passed: false,
        severity: 'hard',
        message: `Derivative setup ${order.derivative_setup_id} not found or deleted`,
        overridable: false,
      };
    }

    const marginRequired = Number(setup.margin_req ?? 0);

    // If no margin requirement defined, pass the check
    if (marginRequired <= 0) {
      return {
        rule: RULE_NAME,
        passed: true,
        severity: null,
        message: 'No margin requirement defined for this derivative setup',
        overridable: false,
      };
    }

    // 4. Fetch portfolio's available cash from cash_ledger
    if (!order.portfolio_id) {
      return {
        rule: RULE_NAME,
        passed: false,
        severity: 'hard',
        message: 'Order has no portfolio_id; cannot check margin',
        overridable: false,
      };
    }

    const cashEntries = await db
      .select({
        balance: schema.cashLedger.balance,
        available_balance: schema.cashLedger.available_balance,
        currency: schema.cashLedger.currency,
      })
      .from(schema.cashLedger)
      .where(eq(schema.cashLedger.portfolio_id, order.portfolio_id));

    // Sum available balances across all cash ledger entries for the portfolio
    let totalAvailableCash = 0;
    for (const entry of cashEntries) {
      totalAvailableCash += Number(entry.available_balance ?? entry.balance ?? 0);
    }

    // 5. Compare margin requirement against available cash
    if (totalAvailableCash >= marginRequired) {
      const utilizationPct =
        marginRequired > 0
          ? ((marginRequired / totalAvailableCash) * 100).toFixed(2)
          : '0.00';

      return {
        rule: RULE_NAME,
        passed: true,
        severity: null,
        message: `Sufficient margin: available cash ${totalAvailableCash.toLocaleString()} >= margin required ${marginRequired.toLocaleString()} (${utilizationPct}% utilization)`,
        overridable: false,
      };
    }

    // Insufficient margin — check if close enough for soft breach
    const shortfall = marginRequired - totalAvailableCash;
    const shortfallPct =
      marginRequired > 0 ? (shortfall / marginRequired) * 100 : 100;

    // If shortfall is <= 10%, treat as soft breach (overridable with justification)
    if (shortfallPct <= 10) {
      return {
        rule: RULE_NAME,
        passed: false,
        severity: 'soft',
        message: `Margin shortfall of ${shortfall.toLocaleString()} (${shortfallPct.toFixed(2)}%): available cash ${totalAvailableCash.toLocaleString()} < margin required ${marginRequired.toLocaleString()}`,
        overridable: true,
      };
    }

    // Hard breach — significant shortfall
    return {
      rule: RULE_NAME,
      passed: false,
      severity: 'hard',
      message: `Insufficient margin: available cash ${totalAvailableCash.toLocaleString()} < margin required ${marginRequired.toLocaleString()} (shortfall: ${shortfall.toLocaleString()})`,
      overridable: false,
    };
  },
};
