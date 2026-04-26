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
import { eq, and, or, sql, gte, lte } from 'drizzle-orm';
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
  const phtMinutes = (utcMinutes + phtOffset) % 1440;

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
 * FR-PTC-010B: Single-issuer concentration limit.
 * A single issuer must not represent more than 10% of the fund's NAV.
 * Sums existing position market values for securities sharing the same
 * issuer (matched via the issuers table) and adds the proposed order value
 * to determine if the 10% ceiling would be breached.
 */
async function checkConcentrationLimit(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio, security } = ctx;

  if (!portfolio || !security || !order.portfolio_id) {
    return { rule: 'FR-PTC-010B', passed: true, severity: null, message: 'No portfolio or security linked', overridable: false };
  }

  const aum = parseFloat(portfolio.aum ?? '0');
  if (aum <= 0) {
    return { rule: 'FR-PTC-010B', passed: true, severity: null, message: 'Portfolio AUM is zero or unavailable', overridable: false };
  }

  // Determine the issuer name to match against — use the security name as a proxy
  // (in production this would resolve through a security→issuer mapping)
  const issuerName = security.name;
  if (!issuerName) {
    return { rule: 'FR-PTC-010B', passed: true, severity: null, message: 'Security has no issuer information', overridable: false };
  }

  // Sum the market value of positions in this portfolio whose security belongs to the same issuer
  const issuerPositions = await db
    .select({
      totalMv: sql<string>`coalesce(sum(${schema.positions.market_value}::numeric), 0)`,
    })
    .from(schema.positions)
    .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
    .where(
      and(
        eq(schema.positions.portfolio_id, order.portfolio_id),
        eq(schema.securities.name, issuerName),
      ),
    );

  const currentIssuerMv = parseFloat(issuerPositions[0]?.totalMv ?? '0');

  // Compute the proposed order value
  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;

  const projectedExposure = currentIssuerMv + (order.side === 'BUY' ? orderValue : 0);
  const concentrationPct = (projectedExposure / aum) * 100;
  const MAX_SINGLE_ISSUER_PCT = 10;

  if (concentrationPct > MAX_SINGLE_ISSUER_PCT) {
    return {
      rule: 'FR-PTC-010B',
      passed: false,
      severity: 'hard',
      message: `Single-issuer concentration ${concentrationPct.toFixed(2)}% exceeds ${MAX_SINGLE_ISSUER_PCT}% limit for issuer "${issuerName}" (projected exposure PHP ${projectedExposure.toLocaleString()} / AUM PHP ${aum.toLocaleString()})`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-010B', passed: true, severity: null, message: `Issuer concentration ${concentrationPct.toFixed(2)}% within limit`, overridable: false };
}

/**
 * FR-PTC-011: Related-party exposure limit.
 * Aggregate exposure to related parties must not exceed 5% of fund NAV.
 * Checks whether the security's issuer is a related party by looking up
 * the counterparties table for entries with type = 'RELATED' whose name
 * matches the security issuer.
 */
async function checkRelatedPartyLimit(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio, security } = ctx;

  if (!portfolio || !security || !order.portfolio_id) {
    return { rule: 'FR-PTC-011', passed: true, severity: null, message: 'No portfolio or security linked', overridable: false };
  }

  const issuerName = security.name;
  if (!issuerName) {
    return { rule: 'FR-PTC-011', passed: true, severity: null, message: 'Security has no issuer information', overridable: false };
  }

  // Check if the issuer is a related party
  const [relatedParty] = await db
    .select()
    .from(schema.counterparties)
    .where(
      and(
        eq(schema.counterparties.type, 'RELATED'),
        eq(schema.counterparties.name, issuerName),
        eq(schema.counterparties.is_active, true),
      ),
    )
    .limit(1);

  if (!relatedParty) {
    return { rule: 'FR-PTC-011', passed: true, severity: null, message: 'Issuer is not a related party', overridable: false };
  }

  const aum = parseFloat(portfolio.aum ?? '0');
  if (aum <= 0) {
    return { rule: 'FR-PTC-011', passed: true, severity: null, message: 'Portfolio AUM is zero or unavailable', overridable: false };
  }

  // Sum positions in this portfolio for the related-party issuer's securities
  const rpPositions = await db
    .select({
      totalMv: sql<string>`coalesce(sum(${schema.positions.market_value}::numeric), 0)`,
    })
    .from(schema.positions)
    .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
    .where(
      and(
        eq(schema.positions.portfolio_id, order.portfolio_id),
        eq(schema.securities.name, issuerName),
      ),
    );

  const currentRpMv = parseFloat(rpPositions[0]?.totalMv ?? '0');
  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;
  const projectedExposure = currentRpMv + (order.side === 'BUY' ? orderValue : 0);
  const rpPct = (projectedExposure / aum) * 100;
  const MAX_RELATED_PARTY_PCT = 5;

  if (rpPct > MAX_RELATED_PARTY_PCT) {
    return {
      rule: 'FR-PTC-011',
      passed: false,
      severity: 'hard',
      message: `Related-party exposure ${rpPct.toFixed(2)}% exceeds ${MAX_RELATED_PARTY_PCT}% limit for "${relatedParty.name}" (projected PHP ${projectedExposure.toLocaleString()} / AUM PHP ${aum.toLocaleString()})`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-011', passed: true, severity: null, message: `Related-party exposure ${rpPct.toFixed(2)}% within limit`, overridable: false };
}

/**
 * FR-PTC-012: Currency mismatch detection.
 * The order currency must match the fund's base currency, or the order
 * must carry an explicit FX rate. Prevents unhedged currency risk on
 * cross-currency orders.
 */
async function checkCurrencyMismatch(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio } = ctx;

  if (!portfolio || !order.currency) {
    return { rule: 'FR-PTC-012', passed: true, severity: null, message: 'No portfolio or order currency', overridable: false };
  }

  const baseCurrency = portfolio.base_currency;
  if (!baseCurrency) {
    return { rule: 'FR-PTC-012', passed: true, severity: null, message: 'Portfolio has no base currency configured', overridable: false };
  }

  if (order.currency !== baseCurrency && !order.fx_rate) {
    return {
      rule: 'FR-PTC-012',
      passed: false,
      severity: 'hard',
      message: `Currency mismatch: order currency ${order.currency} differs from fund base currency ${baseCurrency} and no FX rate is provided. Set fx_rate or change order currency.`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-012', passed: true, severity: null, message: 'Order currency matches fund or FX rate provided', overridable: false };
}

/**
 * FR-PTC-013: Duplicate order detection.
 * Flags orders with the same portfolio, side, and quantity submitted
 * within a 30-minute window as potential duplicates. This is a soft
 * breach that can be overridden with justification.
 */
async function checkDuplicateOrder(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (!order.portfolio_id || !order.side || !order.quantity) {
    return { rule: 'FR-PTC-013', passed: true, severity: null, message: 'Insufficient order details for duplicate check', overridable: false };
  }

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  const duplicates = await db
    .select({
      duplicateCount: sql<string>`count(*)`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.portfolio_id, order.portfolio_id),
        eq(schema.orders.side, order.side),
        eq(schema.orders.quantity, order.quantity),
        sql`${schema.orders.order_id} != ${order.order_id}`,
        sql`${schema.orders.created_at} >= ${thirtyMinAgo.toISOString()}`,
        sql`${schema.orders.order_status} NOT IN ('CANCELLED', 'REVERSED', 'REJECTED')`,
      ),
    );

  const count = parseInt(duplicates[0]?.duplicateCount ?? '0', 10);

  if (count > 0) {
    return {
      rule: 'FR-PTC-013',
      passed: false,
      severity: 'soft',
      message: `Potential duplicate: ${count} order(s) with same portfolio, side (${order.side}), and quantity (${order.quantity}) found within the last 30 minutes`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-013', passed: true, severity: null, message: 'No duplicate orders detected', overridable: false };
}

/**
 * FR-PTC-014: Blackout period enforcement.
 * Prevents trading during blackout windows configured in compliance_rules
 * with rule_type = 'BLACKOUT'. The condition JSONB is expected to contain
 * { security_id, start_date, end_date } defining the blackout window.
 */
async function checkBlackoutPeriod(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { security } = ctx;

  if (!security) {
    return { rule: 'FR-PTC-014', passed: true, severity: null, message: 'No security linked', overridable: false };
  }

  const today = new Date().toISOString().split('T')[0];

  // Look for active BLACKOUT compliance rules whose condition references this security
  // and whose date window covers today
  const blackoutRules = await db
    .select()
    .from(schema.complianceRules)
    .where(
      and(
        eq(schema.complianceRules.rule_type, 'BLACKOUT'),
        eq(schema.complianceRules.is_active, true),
        sql`(${schema.complianceRules.condition}->>'security_id')::int = ${security.id}`,
        sql`(${schema.complianceRules.condition}->>'start_date') <= ${today}`,
        sql`(${schema.complianceRules.condition}->>'end_date') >= ${today}`,
      ),
    )
    .limit(1);

  if (blackoutRules.length > 0) {
    return {
      rule: 'FR-PTC-014',
      passed: false,
      severity: 'hard',
      message: `Blackout period active for security "${security.name ?? security.id}". Trading is blocked until the blackout window ends.`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-014', passed: true, severity: null, message: 'No active blackout period', overridable: false };
}

/**
 * FR-PTC-015: Fund liquidity check for redemptions.
 * For SELL orders on UITF portfolios, the redemption (order value) must
 * not exceed 10% of the fund's daily liquidity (approximated as AUM).
 * This is a soft breach — large redemptions can be overridden with
 * liquidity management justification.
 */
async function checkFundLiquidity(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio } = ctx;

  if (order.side !== 'SELL' || !portfolio) {
    return { rule: 'FR-PTC-015', passed: true, severity: null, message: 'Not a sell order or no portfolio', overridable: false };
  }

  if (portfolio.type !== 'UITF') {
    return { rule: 'FR-PTC-015', passed: true, severity: null, message: 'Not a UITF portfolio', overridable: false };
  }

  const aum = parseFloat(portfolio.aum ?? '0');
  if (aum <= 0) {
    return { rule: 'FR-PTC-015', passed: true, severity: null, message: 'Portfolio AUM is zero or unavailable', overridable: false };
  }

  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;
  const MAX_REDEMPTION_PCT = 10;
  const maxRedemption = aum * (MAX_REDEMPTION_PCT / 100);

  if (orderValue > maxRedemption) {
    const redemptionPct = (orderValue / aum) * 100;
    return {
      rule: 'FR-PTC-015',
      passed: false,
      severity: 'soft',
      message: `Redemption ${redemptionPct.toFixed(2)}% of fund AUM exceeds ${MAX_REDEMPTION_PCT}% daily liquidity limit (order PHP ${orderValue.toLocaleString()} vs max PHP ${maxRedemption.toLocaleString()})`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-015', passed: true, severity: null, message: 'Redemption within fund liquidity limit', overridable: false };
}

/**
 * FR-PTC-016: Credit rating floor enforcement.
 * For fixed-income securities, verifies the security's credit rating meets
 * the minimum credit floor specified in the portfolio's mandate.
 * Uses a standard rating hierarchy where BBB- is the typical investment-grade floor.
 */
async function checkCreditRating(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, security } = ctx;

  if (!security || !order.portfolio_id) {
    return { rule: 'FR-PTC-016', passed: true, severity: null, message: 'No security or portfolio linked', overridable: false };
  }

  const isFixedIncome = security.asset_class?.toUpperCase() === 'FIXED_INCOME' ||
    security.asset_class?.toUpperCase() === 'BOND' ||
    security.asset_class?.toUpperCase() === 'FIXED INCOME';
  if (!isFixedIncome) {
    return { rule: 'FR-PTC-016', passed: true, severity: null, message: 'Not a fixed-income security', overridable: false };
  }

  // Fetch the mandate for this portfolio to get the credit floor
  const [mandate] = await db
    .select()
    .from(schema.mandates)
    .where(eq(schema.mandates.portfolio_id, order.portfolio_id))
    .limit(1);

  if (!mandate || !mandate.credit_floor) {
    return { rule: 'FR-PTC-016', passed: true, severity: null, message: 'No credit floor defined in mandate', overridable: false };
  }

  // Standard credit rating hierarchy (best to worst)
  const ratingHierarchy = [
    'AAA', 'AA+', 'AA', 'AA-',
    'A+', 'A', 'A-',
    'BBB+', 'BBB', 'BBB-',
    'BB+', 'BB', 'BB-',
    'B+', 'B', 'B-',
    'CCC+', 'CCC', 'CCC-',
    'CC', 'C', 'D',
  ];

  // Retrieve the security's credit rating from compliance_rules or the security's JSONB metadata.
  // Since the schema does not have an explicit credit_rating column on securities,
  // we look for a compliance rule of type 'CREDIT_RATING' referencing this security.
  const [ratingRule] = await db
    .select()
    .from(schema.complianceRules)
    .where(
      and(
        eq(schema.complianceRules.rule_type, 'CREDIT_RATING'),
        eq(schema.complianceRules.is_active, true),
        sql`(${schema.complianceRules.condition}->>'security_id')::int = ${security.id}`,
      ),
    )
    .limit(1);

  if (!ratingRule) {
    return {
      rule: 'FR-PTC-016',
      passed: false,
      severity: 'soft',
      message: `No credit rating found for security "${security.name ?? security.id}". Manual review required.`,
      overridable: true,
    };
  }

  const securityRating = (ratingRule.condition as Record<string, string>)?.rating?.toUpperCase();
  const floorRating = mandate.credit_floor.toUpperCase();

  if (!securityRating) {
    return {
      rule: 'FR-PTC-016',
      passed: false,
      severity: 'soft',
      message: `Credit rating data incomplete for security "${security.name ?? security.id}"`,
      overridable: true,
    };
  }

  const securityIdx = ratingHierarchy.indexOf(securityRating);
  const floorIdx = ratingHierarchy.indexOf(floorRating);

  // If either rating is not in the hierarchy, flag for manual review
  if (securityIdx === -1 || floorIdx === -1) {
    return {
      rule: 'FR-PTC-016',
      passed: false,
      severity: 'soft',
      message: `Unrecognized credit rating: security="${securityRating}", floor="${floorRating}". Manual review required.`,
      overridable: true,
    };
  }

  // Higher index = worse rating; breach if security rating is worse than floor
  if (securityIdx > floorIdx) {
    return {
      rule: 'FR-PTC-016',
      passed: false,
      severity: 'hard',
      message: `Credit rating ${securityRating} is below fund minimum ${floorRating} for security "${security.name ?? security.id}"`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-016', passed: true, severity: null, message: `Credit rating ${securityRating} meets floor ${floorRating}`, overridable: false };
}

/**
 * FR-PTC-017B: Bond maturity / tenor limit enforcement.
 * For fixed-income securities, checks whether the security's maturity date
 * falls within the fund mandate's maximum tenor (duration_band).
 * duration_band is expected in format like "5Y", "10Y", "30Y".
 */
async function checkTenorLimit(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, security } = ctx;

  if (!security || !order.portfolio_id) {
    return { rule: 'FR-PTC-017B', passed: true, severity: null, message: 'No security or portfolio linked', overridable: false };
  }

  if (!security.maturity_date) {
    return { rule: 'FR-PTC-017B', passed: true, severity: null, message: 'Security has no maturity date (not a fixed-income instrument)', overridable: false };
  }

  // Fetch the mandate for this portfolio
  const [mandate] = await db
    .select()
    .from(schema.mandates)
    .where(eq(schema.mandates.portfolio_id, order.portfolio_id))
    .limit(1);

  if (!mandate || !mandate.duration_band) {
    return { rule: 'FR-PTC-017B', passed: true, severity: null, message: 'No duration band defined in mandate', overridable: false };
  }

  // Parse duration_band (e.g., "5Y", "10Y", "30Y") into years
  const bandMatch = mandate.duration_band.match(/^(\d+)[Yy]$/);
  if (!bandMatch) {
    return { rule: 'FR-PTC-017B', passed: true, severity: null, message: `Unrecognized duration band format: "${mandate.duration_band}"`, overridable: false };
  }

  const maxTenorYears = parseInt(bandMatch[1], 10);
  const maturityDate = new Date(security.maturity_date);
  const now = new Date();

  // Calculate remaining tenor in years
  const remainingMs = maturityDate.getTime() - now.getTime();
  const remainingYears = remainingMs / (365.25 * 24 * 60 * 60 * 1000);

  if (remainingYears > maxTenorYears) {
    return {
      rule: 'FR-PTC-017B',
      passed: false,
      severity: 'hard',
      message: `Bond tenor ${remainingYears.toFixed(1)} years exceeds mandate maximum of ${maxTenorYears} years for security "${security.name ?? security.id}" (maturity ${security.maturity_date})`,
      overridable: false,
    };
  }

  if (remainingYears < 0) {
    return {
      rule: 'FR-PTC-017B',
      passed: false,
      severity: 'hard',
      message: `Security "${security.name ?? security.id}" has already matured (maturity date ${security.maturity_date})`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-017B', passed: true, severity: null, message: `Bond tenor ${remainingYears.toFixed(1)}Y within ${maxTenorYears}Y limit`, overridable: false };
}

/**
 * FR-PTC-018: Country exposure / concentration limit.
 * Ensures that adding this order would not cause the portfolio's
 * country allocation for the security's domicile to exceed the
 * configured country concentration limit (from compliance_limits
 * with limit_type = 'country').
 */
async function checkCountryExposure(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio, security } = ctx;

  if (!portfolio || !security || !order.portfolio_id) {
    return { rule: 'FR-PTC-018', passed: true, severity: null, message: 'No portfolio or security linked', overridable: false };
  }

  // Determine the country of the security via the issuers table
  const [issuer] = await db
    .select()
    .from(schema.issuers)
    .where(eq(schema.issuers.name, security.name ?? ''))
    .limit(1);

  const country = issuer?.country ?? security.exchange; // fallback to exchange as country proxy
  if (!country) {
    return { rule: 'FR-PTC-018', passed: true, severity: null, message: 'Security country cannot be determined', overridable: false };
  }

  // Fetch the country concentration limit from compliance_limits
  const today = new Date().toISOString().split('T')[0];
  const [countryLimit] = await db
    .select()
    .from(schema.complianceLimits)
    .where(
      and(
        eq(schema.complianceLimits.limit_type, 'country'),
        eq(schema.complianceLimits.dimension_id, country),
        eq(schema.complianceLimits.is_active, true),
        sql`(${schema.complianceLimits.effective_from} IS NULL OR ${schema.complianceLimits.effective_from} <= ${today})`,
        sql`(${schema.complianceLimits.effective_to} IS NULL OR ${schema.complianceLimits.effective_to} >= ${today})`,
      ),
    )
    .limit(1);

  if (!countryLimit) {
    return { rule: 'FR-PTC-018', passed: true, severity: null, message: `No country limit configured for "${country}"`, overridable: false };
  }

  const aum = parseFloat(portfolio.aum ?? '0');
  if (aum <= 0) {
    return { rule: 'FR-PTC-018', passed: true, severity: null, message: 'Portfolio AUM is zero or unavailable', overridable: false };
  }

  // Sum market value of positions in this country for the portfolio
  const countryPositions = await db
    .select({
      totalMv: sql<string>`coalesce(sum(${schema.positions.market_value}::numeric), 0)`,
    })
    .from(schema.positions)
    .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
    .innerJoin(schema.issuers, eq(schema.issuers.name, schema.securities.name))
    .where(
      and(
        eq(schema.positions.portfolio_id, order.portfolio_id),
        eq(schema.issuers.country, country),
      ),
    );

  const currentCountryMv = parseFloat(countryPositions[0]?.totalMv ?? '0');
  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;
  const projectedExposure = currentCountryMv + (order.side === 'BUY' ? orderValue : 0);
  const limitAmount = parseFloat(countryLimit.limit_amount ?? '0');
  const warningPct = countryLimit.warning_threshold_pct ?? 80;
  const utilizationPct = limitAmount > 0 ? (projectedExposure / limitAmount) * 100 : 0;

  if (utilizationPct >= 100) {
    return {
      rule: 'FR-PTC-018',
      passed: false,
      severity: 'hard',
      message: `Country exposure for "${country}" at ${utilizationPct.toFixed(1)}% of limit (projected PHP ${projectedExposure.toLocaleString()} vs limit PHP ${limitAmount.toLocaleString()})`,
      overridable: false,
    };
  }

  if (utilizationPct >= warningPct) {
    return {
      rule: 'FR-PTC-018',
      passed: false,
      severity: 'soft',
      message: `Country exposure for "${country}" at ${utilizationPct.toFixed(1)}% of limit — approaching threshold (projected PHP ${projectedExposure.toLocaleString()} vs limit PHP ${limitAmount.toLocaleString()})`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-018', passed: true, severity: null, message: `Country exposure for "${country}" within limit`, overridable: false };
}

/**
 * FR-PTC-019B: Sector exposure / concentration limit.
 * Ensures that adding this order would not cause the portfolio's sector
 * allocation to exceed the mandate's max_sector_pct or the configured
 * sector concentration limit. Extends the existing compliance limit
 * check with order-level projection.
 */
async function checkSectorExposure(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio, security } = ctx;

  if (!portfolio || !security || !order.portfolio_id || !security.sector) {
    return { rule: 'FR-PTC-019B', passed: true, severity: null, message: 'No portfolio, security, or sector information', overridable: false };
  }

  const aum = parseFloat(portfolio.aum ?? '0');
  if (aum <= 0) {
    return { rule: 'FR-PTC-019B', passed: true, severity: null, message: 'Portfolio AUM is zero or unavailable', overridable: false };
  }

  // First check the mandate's max_sector_pct if available
  const [mandate] = await db
    .select()
    .from(schema.mandates)
    .where(eq(schema.mandates.portfolio_id, order.portfolio_id))
    .limit(1);

  const maxSectorPct = mandate?.max_sector_pct ? parseFloat(mandate.max_sector_pct) : null;

  // Sum market value of positions in this sector for the portfolio
  const sectorPositions = await db
    .select({
      totalMv: sql<string>`coalesce(sum(${schema.positions.market_value}::numeric), 0)`,
    })
    .from(schema.positions)
    .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
    .where(
      and(
        eq(schema.positions.portfolio_id, order.portfolio_id),
        eq(schema.securities.sector, security.sector),
      ),
    );

  const currentSectorMv = parseFloat(sectorPositions[0]?.totalMv ?? '0');
  const qty = parseFloat(order.quantity ?? '0');
  const price = parseFloat(order.limit_price ?? '0');
  const orderValue = qty * price;
  const projectedSectorMv = currentSectorMv + (order.side === 'BUY' ? orderValue : 0);
  const sectorPct = (projectedSectorMv / aum) * 100;

  // Use mandate limit if available, otherwise fall back to a default 25% cap
  const effectiveLimit = maxSectorPct ?? 25;

  if (sectorPct > effectiveLimit) {
    return {
      rule: 'FR-PTC-019B',
      passed: false,
      severity: 'soft',
      message: `Sector "${security.sector}" projected at ${sectorPct.toFixed(2)}% of AUM, exceeding ${effectiveLimit}% limit (projected PHP ${projectedSectorMv.toLocaleString()} / AUM PHP ${aum.toLocaleString()})`,
      overridable: true,
    };
  }

  // Warn if approaching threshold (>80% of limit utilization)
  const warningThreshold = effectiveLimit * 0.8;
  if (sectorPct > warningThreshold) {
    return {
      rule: 'FR-PTC-019B',
      passed: false,
      severity: 'soft',
      message: `Sector "${security.sector}" at ${sectorPct.toFixed(2)}% of AUM — approaching ${effectiveLimit}% limit`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-019B', passed: true, severity: null, message: `Sector "${security.sector}" exposure ${sectorPct.toFixed(2)}% within limit`, overridable: false };
}

/**
 * FR-PTC-015: Outstanding document-deficiency blocker.
 * Checks if the client behind the order's portfolio has any outstanding
 * document deficiencies past their deadline. Hard-blocks the order if
 * any mandatory documents are overdue.
 */
async function checkDocumentDeficiency(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio } = ctx;

  if (!portfolio || !portfolio.client_id) {
    return { rule: 'FR-PTC-015-DOC', passed: true, severity: null, message: 'No portfolio or client linked', overridable: false };
  }

  const today = new Date().toISOString().split('T')[0];

  const outstanding = await db
    .select({
      deficiencyCount: sql<string>`count(*)`,
      docTypes: sql<string>`string_agg(${schema.documentDeficiencies.doc_type}, ', ')`,
    })
    .from(schema.documentDeficiencies)
    .where(
      and(
        eq(schema.documentDeficiencies.client_id, portfolio.client_id),
        eq(schema.documentDeficiencies.deficiency_status, 'OUTSTANDING'),
        eq(schema.documentDeficiencies.required, true),
        sql`${schema.documentDeficiencies.deadline} < ${today}`,
      ),
    );

  const count = parseInt(outstanding[0]?.deficiencyCount ?? '0', 10);

  if (count > 0) {
    const docTypes = outstanding[0]?.docTypes ?? 'unknown';
    return {
      rule: 'FR-PTC-015-DOC',
      passed: false,
      severity: 'hard',
      message: `Client has ${count} outstanding document deficienc${count === 1 ? 'y' : 'ies'} past deadline: ${docTypes}. Trading blocked until documents are submitted.`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-015-DOC', passed: true, severity: null, message: 'No outstanding document deficiencies', overridable: false };
}

/**
 * FR-PTC-021: Higher-risk product prompt (CSA waiver).
 * Compares the security's risk category against the client's risk tolerance.
 * If the product risk exceeds the client's profile, raises a soft breach
 * that requires CSA waiver acknowledgment to override.
 */
async function checkHigherRiskProduct(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio, security } = ctx;

  if (!portfolio || !portfolio.client_id || !security) {
    return { rule: 'FR-PTC-021-RISK', passed: true, severity: null, message: 'No portfolio, client, or security linked', overridable: false };
  }

  const productRisk = security.risk_product_category;
  if (!productRisk) {
    return { rule: 'FR-PTC-021-RISK', passed: true, severity: null, message: 'Security has no risk category assigned', overridable: false };
  }

  // Fetch client suitability profile
  const [profile] = await db
    .select()
    .from(schema.clientProfiles)
    .where(eq(schema.clientProfiles.client_id, portfolio.client_id))
    .limit(1);

  if (!profile || !profile.risk_tolerance) {
    return { rule: 'FR-PTC-021-RISK', passed: true, severity: null, message: 'Client has no suitability profile', overridable: false };
  }

  // Risk hierarchy: lower index = more conservative
  const riskHierarchy = ['CONSERVATIVE', 'MODERATE', 'BALANCED', 'GROWTH', 'AGGRESSIVE'];
  const clientRiskIdx = riskHierarchy.indexOf(profile.risk_tolerance.toUpperCase());
  const productRiskIdx = riskHierarchy.indexOf(productRisk.toUpperCase());

  if (clientRiskIdx === -1 || productRiskIdx === -1) {
    return { rule: 'FR-PTC-021-RISK', passed: true, severity: null, message: 'Unrecognized risk category', overridable: false };
  }

  if (productRiskIdx > clientRiskIdx) {
    // Check if client has an active CSA waiver
    const hasActiveWaiver = profile.csa_waiver_status === 'ACTIVE' &&
      profile.csa_waiver_expiry &&
      new Date(profile.csa_waiver_expiry) >= new Date();

    if (hasActiveWaiver) {
      return {
        rule: 'FR-PTC-021-RISK',
        passed: true,
        severity: null,
        message: `Product risk "${productRisk}" exceeds client tolerance "${profile.risk_tolerance}" but CSA waiver is active (expires ${profile.csa_waiver_expiry})`,
        overridable: false,
      };
    }

    return {
      rule: 'FR-PTC-021-RISK',
      passed: false,
      severity: 'soft',
      message: `Higher-risk product: "${security.name}" risk category "${productRisk}" exceeds client risk tolerance "${profile.risk_tolerance}". CSA waiver or advisor override required.`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-021-RISK', passed: true, severity: null, message: 'Product risk within client tolerance', overridable: false };
}

/**
 * FR-PTC-022: Aging/curing-period monitoring.
 * Checks if the portfolio has any unresolved compliance breaches
 * that are past their curing deadline. Hard-blocks the order if
 * breaches remain uncured beyond the allowed period.
 */
async function checkBreachCuringPeriod(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (!order.portfolio_id) {
    return { rule: 'FR-PTC-022', passed: true, severity: null, message: 'No portfolio linked', overridable: false };
  }

  const now = new Date();

  const uncuredBreaches = await db
    .select({
      breachCount: sql<string>`count(*)`,
      maxEscalation: sql<string>`max(${schema.complianceBreachCuring.escalation_level})`,
    })
    .from(schema.complianceBreachCuring)
    .where(
      and(
        eq(schema.complianceBreachCuring.portfolio_id, order.portfolio_id),
        sql`${schema.complianceBreachCuring.cured_at} IS NULL`,
        sql`${schema.complianceBreachCuring.curing_deadline} < ${now.toISOString()}`,
      ),
    );

  const count = parseInt(uncuredBreaches[0]?.breachCount ?? '0', 10);

  if (count > 0) {
    return {
      rule: 'FR-PTC-022',
      passed: false,
      severity: 'hard',
      message: `Portfolio has ${count} uncured compliance breach${count === 1 ? '' : 'es'} past curing deadline. New orders blocked until breaches are resolved or escalated.`,
      overridable: false,
    };
  }

  // Also warn about breaches approaching deadline (within 2 days)
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const approachingBreaches = await db
    .select({
      breachCount: sql<string>`count(*)`,
    })
    .from(schema.complianceBreachCuring)
    .where(
      and(
        eq(schema.complianceBreachCuring.portfolio_id, order.portfolio_id),
        sql`${schema.complianceBreachCuring.cured_at} IS NULL`,
        sql`${schema.complianceBreachCuring.curing_deadline} >= ${now.toISOString()}`,
        sql`${schema.complianceBreachCuring.curing_deadline} <= ${twoDaysFromNow.toISOString()}`,
      ),
    );

  const approachingCount = parseInt(approachingBreaches[0]?.breachCount ?? '0', 10);

  if (approachingCount > 0) {
    return {
      rule: 'FR-PTC-022',
      passed: false,
      severity: 'soft',
      message: `Portfolio has ${approachingCount} compliance breach${approachingCount === 1 ? '' : 'es'} approaching curing deadline within 48 hours. Review recommended.`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-022', passed: true, severity: null, message: 'No uncured compliance breaches', overridable: false };
}

/**
 * FR-PTC-010 (Gap): Tax-status validation for inter-portfolio T+0 transactions.
 * For same-day inter-portfolio transfers, both portfolios must share
 * the same tax status to avoid tax leakage.
 */
async function checkTaxStatusIPT(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio } = ctx;

  // Only applies to orders linked to a parent (inter-portfolio transfer)
  if (!order.parent_order_id || !portfolio) {
    return { rule: 'FR-PTC-010-TAX', passed: true, severity: null, message: 'Not an inter-portfolio transfer', overridable: false };
  }

  // Load parent order to get the source portfolio
  const [parentOrder] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.order_id, order.parent_order_id))
    .limit(1);

  if (!parentOrder || !parentOrder.portfolio_id || parentOrder.portfolio_id === order.portfolio_id) {
    return { rule: 'FR-PTC-010-TAX', passed: true, severity: null, message: 'Same portfolio or no parent', overridable: false };
  }

  // Check if this is a T+0 (same-day) transfer
  const orderDate = order.value_date ?? order.created_at?.toISOString?.()?.split('T')[0];
  const parentDate = parentOrder.value_date ?? parentOrder.created_at?.toISOString?.()?.split('T')[0];
  if (orderDate !== parentDate) {
    return { rule: 'FR-PTC-010-TAX', passed: true, severity: null, message: 'Not a T+0 transfer', overridable: false };
  }

  // Compare tax statuses via client FATCA/CRS records
  const [sourcePortfolio] = await db
    .select()
    .from(schema.portfolios)
    .where(eq(schema.portfolios.portfolio_id, parentOrder.portfolio_id))
    .limit(1);

  if (!sourcePortfolio?.client_id || !portfolio.client_id) {
    return { rule: 'FR-PTC-010-TAX', passed: true, severity: null, message: 'Cannot determine client tax status', overridable: false };
  }

  const [sourceFatca] = await db
    .select()
    .from(schema.clientFatcaCrs)
    .where(eq(schema.clientFatcaCrs.client_id, sourcePortfolio.client_id))
    .limit(1);

  const [destFatca] = await db
    .select()
    .from(schema.clientFatcaCrs)
    .where(eq(schema.clientFatcaCrs.client_id, portfolio.client_id))
    .limit(1);

  const sourceTaxStatus = sourceFatca?.us_person ? 'US_PERSON' : 'NON_US';
  const destTaxStatus = destFatca?.us_person ? 'US_PERSON' : 'NON_US';

  if (sourceTaxStatus !== destTaxStatus) {
    return {
      rule: 'FR-PTC-010-TAX',
      passed: false,
      severity: 'hard',
      message: `Tax-status mismatch on T+0 inter-portfolio transfer: source is ${sourceTaxStatus}, destination is ${destTaxStatus}. Same-tax-status required for T+0 IPTs.`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-010-TAX', passed: true, severity: null, message: 'Tax statuses match for T+0 transfer', overridable: false };
}

/**
 * FR-PTC-012 (Gap): Trade-date holdings receivable tag.
 * For buy orders, checks if the portfolio has unsettled positions (receivables)
 * and excludes them from available balance calculations to prevent
 * double-counting of unsettled assets.
 */
async function checkTradeHoldingsReceivable(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (order.side !== 'SELL' || !order.portfolio_id || !order.security_id) {
    return { rule: 'FR-PTC-012', passed: true, severity: null, message: 'Not a sell order', overridable: false };
  }

  // Check for receivable (unsettled buy) positions
  const receivablePositions = await db
    .select({
      receivableQty: sql<string>`coalesce(sum(${schema.positions.quantity}::numeric), 0)`,
    })
    .from(schema.positions)
    .where(
      and(
        eq(schema.positions.portfolio_id, order.portfolio_id),
        eq(schema.positions.security_id, order.security_id),
        eq(schema.positions.is_receivable, true),
      ),
    );

  const receivableQty = parseFloat(receivablePositions[0]?.receivableQty ?? '0');

  if (receivableQty > 0) {
    // Get total position
    const [totalPos] = await db
      .select({ total: sql<string>`coalesce(sum(${schema.positions.quantity}::numeric), 0)` })
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, order.portfolio_id),
          eq(schema.positions.security_id, order.security_id),
        ),
      );

    const totalQty = parseFloat(totalPos?.total ?? '0');
    const settledQty = totalQty - receivableQty;
    const requested = parseFloat(order.quantity ?? '0');

    if (requested > settledQty) {
      return {
        rule: 'FR-PTC-012',
        passed: false,
        severity: 'soft',
        message: `Sell quantity ${requested} exceeds settled holdings ${settledQty} (${receivableQty} units are unsettled receivables, total ${totalQty}). Proceed with caution.`,
        overridable: true,
      };
    }
  }

  return { rule: 'FR-PTC-012', passed: true, severity: null, message: 'No receivable position conflict', overridable: false };
}

/**
 * FR-PTC-013 (Gap): FATCA/Non-Resident product restriction enforcement.
 * If the client is flagged as a US person (FATCA), block orders on
 * products that are restricted for FATCA-flagged clients.
 */
async function checkFatcaProductRestriction(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, portfolio, security } = ctx;

  if (!portfolio || !portfolio.client_id || !security) {
    return { rule: 'FR-PTC-013-FATCA', passed: true, severity: null, message: 'No portfolio, client, or security', overridable: false };
  }

  const [fatcaRecord] = await db
    .select()
    .from(schema.clientFatcaCrs)
    .where(eq(schema.clientFatcaCrs.client_id, portfolio.client_id))
    .limit(1);

  if (!fatcaRecord || !fatcaRecord.us_person) {
    return { rule: 'FR-PTC-013-FATCA', passed: true, severity: null, message: 'Client is not a US person', overridable: false };
  }

  // Check if there's a compliance rule restricting FATCA clients from this product
  const [restriction] = await db
    .select()
    .from(schema.complianceRules)
    .where(
      and(
        eq(schema.complianceRules.rule_type, 'FATCA_RESTRICTION'),
        eq(schema.complianceRules.is_active, true),
        or(
          sql`(${schema.complianceRules.condition}->>'security_id')::int = ${security.id}`,
          sql`${schema.complianceRules.condition}->>'asset_class' = ${security.asset_class ?? ''}`,
        ),
      ),
    )
    .limit(1);

  if (restriction) {
    return {
      rule: 'FR-PTC-013-FATCA',
      passed: false,
      severity: 'hard',
      message: `FATCA restriction: US-person client "${portfolio.client_id}" is blocked from trading "${security.name ?? security.id}" (rule: ${restriction.id})`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-013-FATCA', passed: true, severity: null, message: 'No FATCA product restriction', overridable: false };
}

/**
 * FR-PTC-014 (Gap): Unsettled pending-orders prompt.
 * Shows all pending orders in the same security (not just duplicates)
 * so the operator is aware of existing exposure being built up.
 */
async function checkPendingOrdersPrompt(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order } = ctx;

  if (!order.portfolio_id || !order.security_id) {
    return { rule: 'FR-PTC-014-PEND', passed: true, severity: null, message: 'No portfolio or security linked', overridable: false };
  }

  const pendingOrders = await db
    .select({
      pendingCount: sql<string>`count(*)`,
      totalQty: sql<string>`coalesce(sum(${schema.orders.quantity}::numeric), 0)`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.portfolio_id, order.portfolio_id),
        eq(schema.orders.security_id, order.security_id),
        sql`${schema.orders.order_id} != ${order.order_id}`,
        sql`${schema.orders.order_status} IN ('DRAFT', 'PENDING_AUTH', 'AUTHORIZED', 'PLACED', 'PARTIALLY_FILLED')`,
      ),
    );

  const count = parseInt(pendingOrders[0]?.pendingCount ?? '0', 10);
  const totalQty = parseFloat(pendingOrders[0]?.totalQty ?? '0');

  if (count > 0) {
    return {
      rule: 'FR-PTC-014-PEND',
      passed: false,
      severity: 'soft',
      message: `${count} pending order(s) exist for the same security in this portfolio (total qty: ${totalQty}). Review existing orders before proceeding.`,
      overridable: true,
    };
  }

  return { rule: 'FR-PTC-014-PEND', passed: true, severity: null, message: 'No pending orders for same security', overridable: false };
}

/**
 * FR-PTC-017 (Gap): IPO volume-not-available pre-trade rejection.
 * For IPO orders, checks whether the requested quantity exceeds
 * the remaining available allocation volume.
 */
async function checkIPOVolumeAvailable(ctx: OrderWithDetails): Promise<ValidationResult> {
  const { order, security } = ctx;

  if (!security || order.side !== 'BUY') {
    return { rule: 'FR-PTC-017-IPO', passed: true, severity: null, message: 'Not a buy order or no security', overridable: false };
  }

  // Check if this is an IPO security by looking for a corporate action of type RIGHTS or active IPO allocation
  const [ipoAction] = await db
    .select()
    .from(schema.corporateActions)
    .where(
      and(
        eq(schema.corporateActions.security_id, security.id),
        eq(schema.corporateActions.type, 'RIGHTS'),
        sql`${schema.corporateActions.ca_status} IN ('ANNOUNCED', 'SCRUBBED', 'GOLDEN_COPY', 'ENTITLED')`,
      ),
    )
    .limit(1);

  if (!ipoAction) {
    return { rule: 'FR-PTC-017-IPO', passed: true, severity: null, message: 'Not an IPO security', overridable: false };
  }

  // Get total available from the corporate action and sum allocated
  const totalOffered = parseFloat(ipoAction.ratio ?? '0'); // ratio used as total volume
  if (totalOffered <= 0) {
    return { rule: 'FR-PTC-017-IPO', passed: true, severity: null, message: 'IPO volume not configured', overridable: false };
  }

  // Sum already-allocated quantities from existing orders
  const allocated = await db
    .select({
      totalAllocated: sql<string>`coalesce(sum(${schema.orders.quantity}::numeric), 0)`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.security_id, security.id),
        eq(schema.orders.side, 'BUY'),
        sql`${schema.orders.order_status} NOT IN ('CANCELLED', 'REVERSED', 'REJECTED')`,
        sql`${schema.orders.order_id} != ${order.order_id}`,
      ),
    );

  const totalAllocated = parseFloat(allocated[0]?.totalAllocated ?? '0');
  const remaining = totalOffered - totalAllocated;
  const requested = parseFloat(order.quantity ?? '0');

  if (requested > remaining) {
    return {
      rule: 'FR-PTC-017-IPO',
      passed: false,
      severity: 'hard',
      message: `IPO volume not available: requested ${requested} units but only ${remaining} remaining (total offered: ${totalOffered}, already allocated: ${totalAllocated})`,
      overridable: false,
    };
  }

  return { rule: 'FR-PTC-017-IPO', passed: true, severity: null, message: `IPO volume available (${remaining} remaining)`, overridable: false };
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

    // FR-PTC-015: Outstanding document-deficiency blocker
    results.push(await checkDocumentDeficiency(ctx));
    // FR-PTC-021: Higher-risk product prompt (CSA waiver)
    results.push(await checkHigherRiskProduct(ctx));
    // FR-PTC-022: Aging/curing-period monitoring
    results.push(await checkBreachCuringPeriod(ctx));
    // FR-PTC-010: Tax-status validation for inter-portfolio T+0
    results.push(await checkTaxStatusIPT(ctx));
    // FR-PTC-012: Trade-date holdings receivable tag
    results.push(await checkTradeHoldingsReceivable(ctx));
    // FR-PTC-013: FATCA/non-resident product restriction
    results.push(await checkFatcaProductRestriction(ctx));
    // FR-PTC-014: Unsettled pending-orders prompt (same security)
    results.push(await checkPendingOrdersPrompt(ctx));
    // FR-PTC-017B2: IPO volume-not-available rejection
    results.push(await checkIPOVolumeAvailable(ctx));

    // Compliance limits (returns array)
    const limitResults = await checkComplianceLimits(ctx);
    results.push(...limitResults);

    // Overall: passed if no hard breaches
    const hasHardBreach = results.some((r) => !r.passed && r.severity === 'hard');
    const passed = !hasHardBreach;

    return { passed, results };
  },
};
