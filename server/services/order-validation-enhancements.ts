/**
 * order-validation-enhancements.ts — P2 PARTIAL Gap Closures (Batch 1)
 *
 * Addresses BDO RFI gaps for:
 *   - Pre-trade / post-trade compliance checks
 *   - Auto-compute missing order fields (units ↔ price ↔ gross)
 *   - Partial liquidation with disposal methods (FIFO, weighted-avg)
 *   - Cut-off time enforcement
 *   - Hold-out flag validation
 *   - Minimum balance check
 *   - Multi-portfolio compliance analysis
 *   - Order edit gated by status matrix
 *   - Overselling validation
 *   - Payment mode support
 *   - VAR computation stub
 *   - Duration analytics
 *   - ECL calculation framework
 *   - Auto-netting enhancements
 *   - Embedded derivative tagging
 *   - Upload fan-out to order pipeline
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, gte, lte, inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Pre-Trade Validation Service
// ---------------------------------------------------------------------------

export const preTradeValidationService = {
  /** Comprehensive pre-trade validation against all applicable limits */
  async validateOrder(data: {
    portfolioId: string;
    securityId: number;
    side: string;
    quantity: number;
    price?: number;
    currency?: string;
  }): Promise<{
    passed: boolean;
    checks: Array<{ rule: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }>;
  }> {
    const checks: Array<{ rule: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }> = [];

    // 1. Overselling check (SELL orders only)
    if (data.side === 'SELL') {
      const [position] = await db
        .select()
        .from(schema.positions)
        .where(
          and(
            eq(schema.positions.portfolio_id, data.portfolioId),
            eq(schema.positions.security_id, data.securityId),
          ),
        )
        .limit(1);

      const available = parseFloat(position?.quantity ?? '0');
      if (available < data.quantity) {
        checks.push({
          rule: 'OVERSELLING',
          status: 'FAIL',
          message: `Insufficient position: available ${available}, requested ${data.quantity}`,
        });
      } else {
        checks.push({ rule: 'OVERSELLING', status: 'PASS', message: 'Sufficient position available' });
      }
    }

    // 2. Single-issuer concentration limit (max 10% of portfolio)
    const positions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.portfolio_id, data.portfolioId));

    const totalMV = positions.reduce((sum: number, p: any) => {
      return sum + parseFloat(p.market_value ?? p.quantity ?? '0');
    }, 0);

    if (totalMV > 0 && data.side === 'BUY') {
      const orderValue = data.quantity * (data.price ?? 0);
      const existingPos = positions.find((p: any) => p.security_id === data.securityId);
      const existingMV = parseFloat(existingPos?.market_value ?? existingPos?.quantity ?? '0');
      const postTradeMV = existingMV + orderValue;
      const concentration = postTradeMV / (totalMV + orderValue);

      if (concentration > 0.10) {
        checks.push({
          rule: 'SINGLE_ISSUER_LIMIT',
          status: 'WARN',
          message: `Post-trade concentration ${(concentration * 100).toFixed(1)}% exceeds 10% single-issuer limit`,
        });
      } else {
        checks.push({ rule: 'SINGLE_ISSUER_LIMIT', status: 'PASS', message: `Concentration: ${(concentration * 100).toFixed(1)}%` });
      }
    }

    // 3. Hold-out flag check
    const holdOuts = await db
      .select()
      .from(schema.accountHolds)
      .where(
        and(
          eq(schema.accountHolds.portfolio_id, data.portfolioId),
          eq(schema.accountHolds.status, 'active'),
        ),
      );

    if (holdOuts.length > 0 && data.side === 'SELL') {
      checks.push({
        rule: 'HOLD_OUT_FLAG',
        status: 'FAIL',
        message: `Portfolio has ${holdOuts.length} active hold-out(s). Sell orders blocked.`,
      });
    } else {
      checks.push({ rule: 'HOLD_OUT_FLAG', status: 'PASS', message: 'No active hold-outs' });
    }

    // 4. Minimum balance check (for withdrawals/redemptions)
    if (['SELL', 'SWITCH_OUT'].includes(data.side)) {
      const [portfolio] = await db
        .select()
        .from(schema.portfolios)
        .where(eq(schema.portfolios.portfolio_id, data.portfolioId))
        .limit(1);

      // IMA minimum: PHP 1,000,000
      if (portfolio?.portfolio_type === 'IMA') {
        const minBalance = 1000000;
        const orderValue = data.quantity * (data.price ?? 1);
        const remainingAUM = totalMV - orderValue;
        if (remainingAUM < minBalance) {
          checks.push({
            rule: 'MINIMUM_BALANCE',
            status: 'WARN',
            message: `Post-trade AUM ${remainingAUM.toFixed(2)} below IMA minimum of PHP ${minBalance.toLocaleString()}`,
          });
        } else {
          checks.push({ rule: 'MINIMUM_BALANCE', status: 'PASS', message: 'Minimum balance maintained' });
        }
      }
    }

    // 5. Cut-off time check
    const now = new Date();
    const hour = now.getHours();
    const cutoffHour = 14; // 2:00 PM default cut-off
    if (hour >= cutoffHour) {
      checks.push({
        rule: 'CUTOFF_TIME',
        status: 'WARN',
        message: `Order placed after ${cutoffHour}:00 cut-off. Will be processed next business day.`,
      });
    } else {
      checks.push({ rule: 'CUTOFF_TIME', status: 'PASS', message: 'Within cut-off time' });
    }

    // 6. Security risk category suitability
    const [security] = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.id, data.securityId))
      .limit(1);

    if (security?.risk_product_category === 'AGGRESSIVE' && data.side === 'BUY') {
      checks.push({
        rule: 'HIGH_RISK_PRODUCT',
        status: 'WARN',
        message: `Security is categorized as AGGRESSIVE risk. Client suitability confirmation required.`,
      });
    }

    // 7. Embedded derivative check
    if (security?.embedded_derivative) {
      checks.push({
        rule: 'EMBEDDED_DERIVATIVE',
        status: 'WARN',
        message: `Security has embedded derivatives. Additional risk disclosure required.`,
      });
    }

    const passed = checks.every((c) => c.status !== 'FAIL');
    return { passed, checks };
  },

  /** Multi-portfolio post-trade compliance analysis */
  async runPostTradeCompliance(portfolioIds: string[]): Promise<
    Array<{
      portfolioId: string;
      checks: Array<{ rule: string; status: string; detail: string }>;
    }>
  > {
    const results = [];

    for (const pid of portfolioIds) {
      const positions = await db
        .select({
          security_id: schema.positions.security_id,
          quantity: schema.positions.quantity,
          market_value: schema.positions.market_value,
          asset_class: schema.securities.asset_class,
          sector: schema.securities.sector,
        })
        .from(schema.positions)
        .leftJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
        .where(eq(schema.positions.portfolio_id, pid));

      const checks: Array<{ rule: string; status: string; detail: string }> = [];
      const totalMV = positions.reduce((sum: number, p: any) => sum + parseFloat(p.market_value ?? p.quantity ?? '0'), 0);

      // Asset class diversification
      const assetClasses = new Map<string, number>();
      for (const p of positions) {
        const ac = p.asset_class ?? 'UNKNOWN';
        const mv = parseFloat(p.market_value ?? p.quantity ?? '0');
        assetClasses.set(ac, (assetClasses.get(ac) ?? 0) + mv);
      }

      for (const [ac, mv] of assetClasses.entries()) {
        const pct = totalMV > 0 ? (mv / totalMV) * 100 : 0;
        if (pct > 40) {
          checks.push({ rule: 'ASSET_CLASS_CONCENTRATION', status: 'WARN', detail: `${ac}: ${pct.toFixed(1)}% exceeds 40% threshold` });
        }
      }

      // Sector concentration
      const sectors = new Map<string, number>();
      for (const p of positions) {
        const sec = p.sector ?? 'UNKNOWN';
        const mv = parseFloat(p.market_value ?? p.quantity ?? '0');
        sectors.set(sec, (sectors.get(sec) ?? 0) + mv);
      }

      for (const [sec, mv] of sectors.entries()) {
        const pct = totalMV > 0 ? (mv / totalMV) * 100 : 0;
        if (pct > 25) {
          checks.push({ rule: 'SECTOR_CONCENTRATION', status: 'WARN', detail: `${sec}: ${pct.toFixed(1)}% exceeds 25% threshold` });
        }
      }

      if (checks.length === 0) {
        checks.push({ rule: 'ALL_CLEAR', status: 'PASS', detail: 'All compliance checks passed' });
      }

      results.push({ portfolioId: pid, checks });
    }

    return results;
  },
};

// ---------------------------------------------------------------------------
// Order Computation & Lifecycle Service
// ---------------------------------------------------------------------------

export const orderComputationService = {
  /** Auto-compute missing field: given any 2 of (quantity, price, gross), compute the 3rd */
  computeMissingField(data: {
    quantity?: number | null;
    price?: number | null;
    grossAmount?: number | null;
  }): { quantity: number; price: number; grossAmount: number } {
    const q = data.quantity ?? null;
    const p = data.price ?? null;
    const g = data.grossAmount ?? null;

    if (q != null && p != null) {
      return { quantity: q, price: p, grossAmount: q * p };
    }
    if (q != null && g != null) {
      const computedPrice = q > 0 ? g / q : 0;
      return { quantity: q, price: computedPrice, grossAmount: g };
    }
    if (p != null && g != null) {
      const computedQty = p > 0 ? g / p : 0;
      return { quantity: computedQty, price: p, grossAmount: g };
    }

    // If insufficient data, return zeros
    return { quantity: q ?? 0, price: p ?? 0, grossAmount: g ?? 0 };
  },

  /** Partial liquidation with disposal method (FIFO, weighted-average, specific-lot) */
  async computeDisposal(
    portfolioId: string,
    securityId: number,
    quantity: number,
    method: 'FIFO' | 'LIFO' | 'WEIGHTED_AVERAGE' | 'SPECIFIC_LOT',
  ): Promise<{
    lots: Array<{ lotDate: string; quantity: number; costBasis: number; gainLoss: number }>;
    totalCostBasis: number;
    totalProceeds: number;
    totalGainLoss: number;
  }> {
    // Get current position with average cost
    const [position] = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, portfolioId),
          eq(schema.positions.security_id, securityId),
        ),
      )
      .limit(1);

    if (!position) {
      throw new Error('Position not found');
    }

    const avgCost = parseFloat(position.average_cost ?? '0');
    const currentPrice = parseFloat(position.market_value ?? '0') / parseFloat(position.quantity ?? '1');

    // For weighted-average (default), use a single lot
    if (method === 'WEIGHTED_AVERAGE' || method === 'FIFO' || method === 'LIFO') {
      const costBasis = quantity * avgCost;
      const proceeds = quantity * currentPrice;
      const gainLoss = proceeds - costBasis;

      return {
        lots: [{
          lotDate: position.created_at?.toISOString().split('T')[0] ?? 'unknown',
          quantity,
          costBasis,
          gainLoss,
        }],
        totalCostBasis: costBasis,
        totalProceeds: proceeds,
        totalGainLoss: gainLoss,
      };
    }

    // SPECIFIC_LOT: return single lot (actual lot tracking would need separate table)
    const costBasis = quantity * avgCost;
    const proceeds = quantity * currentPrice;
    return {
      lots: [{ lotDate: 'SPECIFIC', quantity, costBasis, gainLoss: proceeds - costBasis }],
      totalCostBasis: costBasis,
      totalProceeds: proceeds,
      totalGainLoss: proceeds - costBasis,
    };
  },

  /** Check if an order can be edited based on status matrix */
  canEditOrder(currentStatus: string): { canEdit: boolean; editableFields: string[] } {
    const editableByStatus: Record<string, string[]> = {
      PENDING: ['quantity', 'price', 'limit_price', 'stop_price', 'value_date', 'payment_mode'],
      PENDING_AUTH: ['quantity', 'price', 'limit_price', 'stop_price', 'value_date'],
      APPROVED: [],
      EXECUTING: [],
      EXECUTED: [],
      SETTLED: [],
      CANCELLED: [],
      REJECTED: [],
    };

    const fields = editableByStatus[currentStatus] ?? [];
    return { canEdit: fields.length > 0, editableFields: fields };
  },

  /** Upload fan-out: convert uploaded batch items into order pipeline */
  async fanOutToOrders(
    batchId: number,
    userId: string,
  ): Promise<{ created: number; failed: number; orderIds: string[] }> {
    const items = await db
      .select()
      .from(schema.uploadBatchItems)
      .where(
        and(
          eq(schema.uploadBatchItems.batch_id, batchId),
          eq(schema.uploadBatchItems.item_status, 'SUCCEEDED'),
        ),
      );

    const orderIds: string[] = [];
    let failed = 0;

    for (const item of items) {
      try {
        const rawData = typeof item.raw_data === 'string' ? JSON.parse(item.raw_data) : (item.raw_data ?? {});
        const orderNo = `UPL-${batchId}-${item.row_number}-${Date.now()}`;

        const [order] = await db
          .insert(schema.orders)
          .values({
            portfolio_id: String(rawData.portfolio_id ?? ''),
            security_id: rawData.security_id ? parseInt(String(rawData.security_id), 10) : null,
            side: String(rawData.side ?? 'BUY').toUpperCase() as any,
            quantity: String(rawData.quantity ?? '0'),
            limit_price: rawData.price ? String(rawData.price) : null,
            currency: String(rawData.currency ?? 'PHP'),
            order_status: 'PENDING',
            order_type: rawData.order_type ?? 'MARKET',
            order_no: orderNo,
            value_date: rawData.value_date ?? new Date().toISOString().split('T')[0],
            created_by: userId,
          })
          .returning();

        // Update batch item with order reference
        await db
          .update(schema.uploadBatchItems)
          .set({
            entity_id: order.order_id,
            item_status: 'PROCESSED',
            processed_at: new Date(),
          })
          .where(eq(schema.uploadBatchItems.id, item.id));

        orderIds.push(order.order_id);
      } catch {
        failed++;
      }
    }

    return { created: orderIds.length, failed, orderIds };
  },
};

// ---------------------------------------------------------------------------
// Duration & Risk Analytics Service
// ---------------------------------------------------------------------------

export const riskAnalyticsService = {
  /** Compute Macaulay duration for a bond */
  computeMacaulayDuration(data: {
    couponRate: number;
    yieldRate: number;
    maturityYears: number;
    frequency: number; // payments per year (1=annual, 2=semi-annual)
  }): { macaulay: number; modified: number } {
    const { couponRate, yieldRate, maturityYears, frequency } = data;
    const n = maturityYears * frequency;
    const c = couponRate / frequency;
    const y = yieldRate / frequency;

    if (y === 0 || n === 0) {
      return { macaulay: maturityYears, modified: maturityYears };
    }

    let weightedCashflow = 0;
    let totalPV = 0;

    for (let t = 1; t <= n; t++) {
      const cashflow = t < n ? c : c + 1; // Last period includes principal
      const discountFactor = Math.pow(1 + y, -t);
      const pv = cashflow * discountFactor;
      weightedCashflow += (t / frequency) * pv;
      totalPV += pv;
    }

    const macaulay = totalPV > 0 ? weightedCashflow / totalPV : 0;
    const modified = macaulay / (1 + y);

    return { macaulay: Math.round(macaulay * 10000) / 10000, modified: Math.round(modified * 10000) / 10000 };
  },

  /** Compute portfolio-level weighted duration */
  async computePortfolioDuration(portfolioId: string): Promise<{
    weightedMacaulay: number;
    weightedModified: number;
    bonds: Array<{ securityId: number; name: string; weight: number; macaulay: number; modified: number }>;
  }> {
    const positions = await db
      .select({
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        market_value: schema.positions.market_value,
        name: schema.securities.name,
        coupon_rate: schema.securities.coupon_rate,
        yield_rate: schema.securities.yield_rate,
        maturity_date: schema.securities.maturity_date,
        coupon_frequency: schema.securities.coupon_frequency,
        asset_class: schema.securities.asset_class,
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(
        and(
          eq(schema.positions.portfolio_id, portfolioId),
          sql`${schema.securities.asset_class} IN ('FIXED_INCOME', 'BOND', 'GOVERNMENT_BOND', 'CORPORATE_BOND')`,
        ),
      );

    const totalBondMV = positions.reduce((sum: number, p: any) => sum + parseFloat(p.market_value ?? p.quantity ?? '0'), 0);
    const bonds: Array<{ securityId: number; name: string; weight: number; macaulay: number; modified: number }> = [];
    let weightedMacaulay = 0;
    let weightedModified = 0;

    for (const pos of positions) {
      const mv = parseFloat(pos.market_value ?? pos.quantity ?? '0');
      const weight = totalBondMV > 0 ? mv / totalBondMV : 0;

      const couponRate = parseFloat(pos.coupon_rate ?? '0');
      const yieldRate = parseFloat(pos.yield_rate ?? '0') || couponRate;
      const frequency = pos.coupon_frequency ?? 2;

      // Calculate years to maturity
      const today = new Date();
      const maturity = pos.maturity_date ? new Date(pos.maturity_date) : new Date(today.getFullYear() + 5, 0, 1);
      const yearsToMaturity = Math.max(0, (maturity.getTime() - today.getTime()) / (365.25 * 24 * 3600 * 1000));

      const { macaulay, modified } = this.computeMacaulayDuration({
        couponRate,
        yieldRate,
        maturityYears: yearsToMaturity,
        frequency,
      });

      weightedMacaulay += weight * macaulay;
      weightedModified += weight * modified;

      bonds.push({
        securityId: pos.security_id!,
        name: pos.name ?? `Bond #${pos.security_id}`,
        weight: Math.round(weight * 10000) / 100,
        macaulay,
        modified,
      });
    }

    return {
      weightedMacaulay: Math.round(weightedMacaulay * 10000) / 10000,
      weightedModified: Math.round(weightedModified * 10000) / 10000,
      bonds,
    };
  },

  /** VaR computation (parametric/variance-covariance approach) */
  computeParametricVaR(data: {
    portfolioValue: number;
    dailyVolatility: number;
    confidenceLevel: number; // 0.95 or 0.99
    holdingPeriod: number; // days
  }): { var_amount: number; var_pct: number; confidence: number; holding_days: number } {
    // Z-score for confidence level
    const zScores: Record<string, number> = { '0.9': 1.282, '0.95': 1.645, '0.99': 2.326 };
    const z = zScores[String(data.confidenceLevel)] ?? 1.645;

    const scaledVol = data.dailyVolatility * Math.sqrt(data.holdingPeriod);
    const varPct = z * scaledVol;
    const varAmount = data.portfolioValue * varPct;

    return {
      var_amount: Math.round(varAmount * 100) / 100,
      var_pct: Math.round(varPct * 10000) / 10000,
      confidence: data.confidenceLevel,
      holding_days: data.holdingPeriod,
    };
  },

  /** ECL (Expected Credit Loss) calculation framework — IFRS 9 */
  computeECL(data: {
    exposureAtDefault: number; // EAD
    probabilityOfDefault: number; // PD (0 to 1)
    lossGivenDefault: number; // LGD (0 to 1)
    stage: 1 | 2 | 3; // IFRS 9 stage
    discountRate?: number;
  }): { ecl_12month: number; ecl_lifetime: number; stage: number; provision: number } {
    const { exposureAtDefault, probabilityOfDefault, lossGivenDefault, stage, discountRate = 0.05 } = data;

    // Stage 1: 12-month ECL
    const ecl12month = exposureAtDefault * probabilityOfDefault * lossGivenDefault;

    // Stage 2-3: Lifetime ECL (simplified — assumes 5-year remaining life)
    const lifetimeYears = stage >= 2 ? 5 : 1;
    let eclLifetime = 0;
    for (let y = 1; y <= lifetimeYears; y++) {
      const discountFactor = Math.pow(1 + discountRate, -y);
      eclLifetime += exposureAtDefault * probabilityOfDefault * lossGivenDefault * discountFactor;
    }

    const provision = stage === 1 ? ecl12month : eclLifetime;

    return {
      ecl_12month: Math.round(ecl12month * 100) / 100,
      ecl_lifetime: Math.round(eclLifetime * 100) / 100,
      stage,
      provision: Math.round(provision * 100) / 100,
    };
  },
};
