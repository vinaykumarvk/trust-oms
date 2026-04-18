/**
 * Pre-Trade Validation Service (Phase 3G)
 *
 * Orchestrates all pre-trade compliance checks on an order before
 * it can be authorized or executed. Each check maps to a specific
 * BRD FR-PTC requirement from the BDO RFI.
 *
 * Returns an array of ValidationResult entries. Hard breaches block
 * the order; soft breaches allow override with justification.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { complianceLimitService } from './compliance-limit-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  rule: string;
  passed: boolean;
  severity: 'hard' | 'soft' | null;
  message: string;
  overridable: boolean;
}

interface OrderWithDetails {
  order: typeof schema.orders.$inferSelect;
  portfolio: typeof schema.portfolios.$inferSelect | null;
  security: typeof schema.securities.$inferSelect | null;
}

// ---------------------------------------------------------------------------
// Helpers — Load order with related entities
// ---------------------------------------------------------------------------

async function loadOrderWithDetails(orderId: string): Promise<OrderWithDetails> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.order_id, orderId))
    .limit(1);

  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  let portfolio: typeof schema.portfolios.$inferSelect | null = null;
  if (order.portfolio_id) {
    const [p] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, order.portfolio_id))
      .limit(1);
    portfolio = p ?? null;
  }

  let security: typeof schema.securities.$inferSelect | null = null;
  if (order.security_id) {
    const [s] = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.id, order.security_id))
      .limit(1);
    security = s ?? null;
  }

  return { order, portfolio, security };
}

// ---------------------------------------------------------------------------
// Individual Pre-Trade Checks
// ---------------------------------------------------------------------------

/**
 * FR-PTC-006: Short-sell detection.
 * If the order side is SELL, verify the portfolio holds sufficient quantity.
 */
async function checkShortSell(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (order.side !== 'SELL' || !order.portfolio_id || !order.security_id) {
    return { rule: 'FR-PTC-006', passed: true, severity: null, message: 'Not a sell order', overridable: false };
  }

  const [position] = await db
    .select()
    .from(schema.positions)
    .where(
      and(
        eq(schema.positions.portfolio_id, order.portfolio_id),
        eq(schema.positions.security_id, order.security_id),
      ),
    )
    .limit(1);

  const held = parseFloat(position?.quantity ?? '0');
  const requested = parseFloat(order.quantity ?? '0');

  if (held < requested) {
    return {
      rule: 'FR-PTC-006',
      passed: false,
      severity: 'hard',
      message: `Short-sell detected: position ${held} < order quantity ${requested}`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-006', passed: true, severity: null, message: 'Position sufficient for sell', overridable: false };
}

/**
 * FR-PTC-007: Overselling vs actual (available) positions.
 * Checks available quantity, not just total, by deducting any pending sell orders.
 */
async function checkOverselling(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (order.side !== 'SELL' || !order.portfolio_id || !order.security_id) {
    return { rule: 'FR-PTC-007', passed: true, severity: null, message: 'Not a sell order', overridable: false };
  }

  const [position] = await db
    .select()
    .from(schema.positions)
    .where(
      and(
        eq(schema.positions.portfolio_id, order.portfolio_id),
        eq(schema.positions.security_id, order.security_id),
      ),
    )
    .limit(1);

  const totalQty = parseFloat(position?.quantity ?? '0');

  // Sum pending sell orders for the same portfolio + security (excluding current order)
  const pendingSells = await db
    .select({
      totalPending: sql<string>`coalesce(sum(${schema.orders.quantity}::numeric), 0)`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.portfolio_id, order.portfolio_id),
        eq(schema.orders.security_id, order.security_id),
        eq(schema.orders.side, 'SELL'),
        sql`${schema.orders.order_status} IN ('DRAFT', 'PENDING_AUTH', 'AUTHORIZED', 'PLACED', 'PARTIALLY_FILLED')`,
        sql`${schema.orders.order_id} != ${order.order_id}`,
      ),
    );

  const pendingQty = parseFloat(pendingSells[0]?.totalPending ?? '0');
  const availableQty = totalQty - pendingQty;
  const requested = parseFloat(order.quantity ?? '0');

  if (availableQty < requested) {
    return {
      rule: 'FR-PTC-007',
      passed: false,
      severity: 'hard',
      message: `Overselling: available quantity ${availableQty} (total ${totalQty} - pending sells ${pendingQty}) < order ${requested}`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-007', passed: true, severity: null, message: 'Available quantity sufficient', overridable: false };
}

/**
 * FR-PTC-008: Hold-out flag blocking.
 * If the security is flagged as held-out (inactive), block the order.
 */
async function checkHoldOutFlag(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { security } = ctx;

  if (!security) {
    return { rule: 'FR-PTC-008', passed: true, severity: null, message: 'No security linked', overridable: false };
  }

  // Use is_active = false as hold-out proxy (securities flagged inactive are held out)
  if (security.is_active === false) {
    return {
      rule: 'FR-PTC-008',
      passed: false,
      severity: 'hard',
      message: `Security ${security.name ?? security.id} is flagged as held-out / inactive`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-008', passed: true, severity: null, message: 'Security not held out', overridable: false };
}

/**
 * FR-PTC-009: IMA minimum face value PHP 1,000,000.
 * For IMA-type portfolios, the minimum order value must be PHP 1M.
 */
async function checkImaMinimumFace(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio } = ctx;

  if (!portfolio) {
    return { rule: 'FR-PTC-009', passed: true, severity: null, message: 'No portfolio linked', overridable: false };
  }

  const isIma = portfolio.type === 'IMA_DIRECTED' || portfolio.type === 'IMA_DISCRETIONARY';
  if (!isIma) {
    return { rule: 'FR-PTC-009', passed: true, severity: null, message: 'Not an IMA portfolio', overridable: false };
  }

  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;
  const IMA_MIN_FACE = 1_000_000; // PHP 1,000,000

  if (orderValue > 0 && orderValue < IMA_MIN_FACE) {
    return {
      rule: 'FR-PTC-009',
      passed: false,
      severity: 'hard',
      message: `IMA minimum face not met: order value PHP ${orderValue.toLocaleString()} < PHP ${IMA_MIN_FACE.toLocaleString()}`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-009', passed: true, severity: null, message: 'IMA minimum face satisfied', overridable: false };
}

/**
 * FR-PTC-010: No co-mingling between IMA accounts.
 * Verifies the order stays within a single IMA portfolio and does not
 * cross-allocate to a different IMA account.
 */
async function checkImaComingling(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio } = ctx;

  if (!portfolio) {
    return { rule: 'FR-PTC-010', passed: true, severity: null, message: 'No portfolio linked', overridable: false };
  }

  const isIma = portfolio.type === 'IMA_DIRECTED' || portfolio.type === 'IMA_DISCRETIONARY';
  if (!isIma) {
    return { rule: 'FR-PTC-010', passed: true, severity: null, message: 'Not an IMA portfolio', overridable: false };
  }

  // If the order has a parent_order_id, check that the parent belongs to the same portfolio
  if (order.parent_order_id) {
    const [parent] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, order.parent_order_id))
      .limit(1);

    if (parent && parent.portfolio_id !== order.portfolio_id) {
      return {
        rule: 'FR-PTC-010',
        passed: false,
        severity: 'hard',
        message: `IMA co-mingling detected: order portfolio ${order.portfolio_id} differs from parent order portfolio ${parent.portfolio_id}`,
        overridable: false,
      };
    }
  }

  return { rule: 'FR-PTC-010', passed: true, severity: null, message: 'No IMA co-mingling', overridable: false };
}

/**
 * FR-PTC-017: Cut-off time enforcement.
 * PHT 11:30 for UITF orders, 14:30 for equity orders.
 */
async function checkCutOffTime(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { portfolio, security } = ctx;

  // Get current Philippine time (UTC+8)
  const now = new Date();
  const phtOffset = 8 * 60; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const phtMinutes = utcMinutes + phtOffset;

  const isUitf = portfolio?.type === 'UITF';
  const isEquity = security?.asset_class?.toUpperCase() === 'EQUITY';

  if (isUitf) {
    const cutOff = 11 * 60 + 30; // 11:30 PHT
    if (phtMinutes > cutOff) {
      return {
        rule: 'FR-PTC-017',
        passed: false,
        severity: 'soft',
        message: `UITF cut-off time exceeded: current PHT ${Math.floor(phtMinutes / 60)}:${String(phtMinutes % 60).padStart(2, '0')} > 11:30`,
        overridable: true,
      };
    }
  }

  if (isEquity) {
    const cutOff = 14 * 60 + 30; // 14:30 PHT
    if (phtMinutes > cutOff) {
      return {
        rule: 'FR-PTC-017',
        passed: false,
        severity: 'soft',
        message: `Equity cut-off time exceeded: current PHT ${Math.floor(phtMinutes / 60)}:${String(phtMinutes % 60).padStart(2, '0')} > 14:30`,
        overridable: true,
      };
    }
  }

  return { rule: 'FR-PTC-017', passed: true, severity: null, message: 'Within cut-off time', overridable: false };
}

/**
 * FR-PTC-019: Unfunded-order rejection.
 * Checks if cash balance covers order value. Allows override with
 * "funding in transit" justification.
 */
async function checkUnfundedOrder(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (order.side !== 'BUY' || !order.portfolio_id) {
    return { rule: 'FR-PTC-019', passed: true, severity: null, message: 'Not a buy order or no portfolio', overridable: false };
  }

  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;

  if (orderValue === 0) {
    return { rule: 'FR-PTC-019', passed: true, severity: null, message: 'Order value is zero', overridable: false };
  }

  // Get cash balance for the portfolio
  const cashRows = await db
    .select({
      totalAvailable: sql<string>`coalesce(sum(${schema.cashLedger.available_balance}::numeric), 0)`,
    })
    .from(schema.cashLedger)
    .where(eq(schema.cashLedger.portfolio_id, order.portfolio_id));

  const availableCash = parseFloat(cashRows[0]?.totalAvailable ?? '0');

  if (availableCash < orderValue) {
    return {
      rule: 'FR-PTC-019',
      passed: false,
      severity: 'soft',
      message: `Unfunded order: available cash PHP ${availableCash.toLocaleString()} < order value PHP ${orderValue.toLocaleString()}. Override allowed with "funding in transit" justification.`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-019', passed: true, severity: null, message: 'Sufficient cash balance', overridable: false };
}

/**
 * FR-PTC-021: Minimum-balance check.
 * After order execution, the portfolio cash must remain >= 0 (minimum balance).
 */
async function checkMinimumBalance(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (order.side !== 'BUY' || !order.portfolio_id) {
    return { rule: 'FR-PTC-021', passed: true, severity: null, message: 'Not a buy order or no portfolio', overridable: false };
  }

  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;

  // Get total cash balance
  const cashRows = await db
    .select({
      totalBalance: sql<string>`coalesce(sum(${schema.cashLedger.balance}::numeric), 0)`,
    })
    .from(schema.cashLedger)
    .where(eq(schema.cashLedger.portfolio_id, order.portfolio_id));

  const currentBalance = parseFloat(cashRows[0]?.totalBalance ?? '0');
  const projectedBalance = currentBalance - orderValue;
  const MINIMUM_BALANCE = 0; // Configurable minimum

  if (projectedBalance < MINIMUM_BALANCE) {
    return {
      rule: 'FR-PTC-021',
      passed: false,
      severity: 'soft',
      message: `Minimum balance breach: projected cash PHP ${projectedBalance.toLocaleString()} after order would fall below minimum PHP ${MINIMUM_BALANCE.toLocaleString()}`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-021', passed: true, severity: null, message: 'Minimum balance maintained', overridable: false };
}

/**
 * Compliance limits check: runs all applicable limit checks from
 * the compliance-limit-service based on order attributes.
 */
async function checkComplianceLimits(ctx: OrderWithDetails): Promise<ValidationResult[]> {
  const { order, portfolio, security } = ctx;
  const results: ValidationResult[] = [];

  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;

  // Trader limit
  if (order.trader_id) {
    const traderCheck = await complianceLimitService.checkTraderLimit(String(order.trader_id), orderValue);
    results.push({
      rule: 'LIMIT_TRADER',
      passed: traderCheck.passed,
      severity: traderCheck.severity,
      message: traderCheck.passed
        ? 'Trader limit OK'
        : `Trader limit breach: exposure ${traderCheck.currentExposure} vs limit ${traderCheck.limit}`,
      overridable: traderCheck.severity === 'soft',
    });
  }

  // Issuer limit (security as issuer proxy)
  if (order.security_id && order.portfolio_id) {
    const issuerCheck = await complianceLimitService.checkIssuerLimit(String(order.security_id), order.portfolio_id);
    results.push({
      rule: 'LIMIT_ISSUER',
      passed: issuerCheck.passed,
      severity: issuerCheck.severity,
      message: issuerCheck.passed
        ? 'Issuer concentration OK'
        : `Issuer concentration breach: exposure ${issuerCheck.currentExposure} vs limit ${issuerCheck.limit}`,
      overridable: issuerCheck.severity === 'soft',
    });
  }

  // Sector limit
  if (security?.sector && order.portfolio_id) {
    const sectorCheck = await complianceLimitService.checkSectorLimit(security.sector, order.portfolio_id);
    results.push({
      rule: 'LIMIT_SECTOR',
      passed: sectorCheck.passed,
      severity: sectorCheck.severity,
      message: sectorCheck.passed
        ? 'Sector concentration OK'
        : `Sector concentration breach: exposure ${sectorCheck.currentExposure} vs limit ${sectorCheck.limit}`,
      overridable: sectorCheck.severity === 'soft',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const preTradeValidationService = {
  /**
   * Run all pre-trade validation checks on an order.
   * Returns the aggregate pass/fail status and individual results.
   */
  async validateOrder(orderId: string): Promise<{ passed: boolean; results: ValidationResult[] }> {
    const ctx = await loadOrderWithDetails(orderId);
    const results: ValidationResult[] = [];

    // Run all individual checks
    results.push(await checkShortSell(ctx));
    results.push(await checkOverselling(ctx));
    results.push(await checkHoldOutFlag(ctx));
    results.push(await checkImaMinimumFace(ctx));
    results.push(await checkImaComingling(ctx));
    results.push(await checkCutOffTime(ctx));
    results.push(await checkUnfundedOrder(ctx));
    results.push(await checkMinimumBalance(ctx));

    // Compliance limits (returns array)
    const limitResults = await checkComplianceLimits(ctx);
    results.push(...limitResults);

    // Overall: passed if no hard breaches
    const hasHardBreach = results.some((r) => !r.passed && r.severity === 'hard');
    const passed = !hasHardBreach;

    return { passed, results };
  },
};
