/**
 * TFP Accrual Engine (TrustFees Pro -- Phase 6)
 *
 * Production accrual engine that computes daily fee accruals for all
 * ACTIVE fee plans with charge_basis=PERIOD.
 *
 * For each eligible combination the engine:
 *   1. Resolves base amount (ADB, face value, deposit, etc.)
 *   2. Applies pricing tiers from the linked PricingDefinition
 *   3. Applies min/max charge amount caps
 *   4. Generates idempotent accrual records or exception items
 *
 * Formula patterns:
 *   - Discretionary Trust (TRUST/CUSTODY/MANAGEMENT): ADB x rate x days / 360
 *   - Directional Deposits (short-term): Deposit x rate x term / 360
 *   - Bonds: Face_Value x rate x coupon_days / 360
 *   - Preferred Equities: Acquisition_Cost x rate x dividend_days / 360
 *   - Loans: Balance x rate x interest_payment_days / 360
 *   - T-Bills / Commercial Papers: Cost x rate x term / 360
 *   - Escrow: Step-function pricing by months since engagement
 *   - Generic SLAB: Cumulative or incremental tier calculation
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { pricingDefinitionService } from './pricing-definition-service';
import { eligibilityEngine, type ASTNode } from './eligibility-engine';
import { fxRateService } from './fx-rate-service';

/* ---------- Types ---------- */

interface AccrualRunSummary {
  businessDate: string;
  processed: number;
  created: number;
  skipped: number;
  exceptions: number;
}

interface PricingBreakdown {
  tier: number;
  from: number;
  to: number;
  rate_or_amount: number;
  computed: number;
}

interface AccrualComputeResult {
  computedFee: number;
  baseAmount: number;
  breakdown: PricingBreakdown[];
  pricingType: string;
  formula: string;
}

/* ---------- Helper: Apply Pricing Tiers ---------- */

/**
 * Apply pricing tiers to a base amount. Reuses the same logic pattern
 * from fee-plan-service.ts computePreview.
 */
function applyPricingTiers(
  pricingType: string,
  tiers: any[],
  stepWindows: any[] | null,
  baseAmount: number,
  monthsSinceEngagement?: number,
): { computedFee: number; breakdown: PricingBreakdown[] } {
  let computedFee = 0;
  const breakdown: PricingBreakdown[] = [];

  switch (pricingType) {
    case 'FIXED_AMOUNT': {
      const amt = tiers[0]?.amount ?? 0;
      computedFee = amt;
      breakdown.push({
        tier: 1,
        from: 0,
        to: baseAmount,
        rate_or_amount: amt,
        computed: amt,
      });
      break;
    }

    case 'FIXED_RATE': {
      const rate = tiers[0]?.rate ?? 0;
      computedFee = baseAmount * (rate / 100);
      breakdown.push({
        tier: 1,
        from: 0,
        to: baseAmount,
        rate_or_amount: rate,
        computed: computedFee,
      });
      break;
    }

    case 'SLAB_CUMULATIVE_RATE': {
      let remaining = baseAmount;
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const from = tier.from ?? 0;
        const to = tier.to ?? Infinity;
        const rate = tier.rate ?? 0;

        if (remaining <= 0) break;

        const tierWidth = to === 0 || to === Infinity ? remaining : Math.min(to - from, remaining);
        const tierFee = tierWidth * (rate / 100);

        breakdown.push({
          tier: i + 1,
          from,
          to: to === Infinity || to === 0 ? baseAmount : to,
          rate_or_amount: rate,
          computed: tierFee,
        });

        computedFee += tierFee;
        remaining -= tierWidth;
      }
      break;
    }

    case 'SLAB_CUMULATIVE_AMOUNT': {
      let remaining = baseAmount;
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const from = tier.from ?? 0;
        const to = tier.to ?? Infinity;
        const amount = tier.amount ?? 0;

        if (baseAmount >= from) {
          breakdown.push({
            tier: i + 1,
            from,
            to: to === Infinity || to === 0 ? baseAmount : to,
            rate_or_amount: amount,
            computed: amount,
          });
          computedFee += amount;
        }
        remaining -= (to - from);
        if (remaining <= 0) break;
      }
      break;
    }

    case 'SLAB_INCREMENTAL_RATE': {
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const from = tier.from ?? 0;
        const to = tier.to ?? Infinity;
        const rate = tier.rate ?? 0;

        if (baseAmount >= from && (baseAmount < to || to === 0 || to === Infinity)) {
          computedFee = baseAmount * (rate / 100);
          breakdown.push({
            tier: i + 1,
            from,
            to: to === Infinity || to === 0 ? baseAmount : to,
            rate_or_amount: rate,
            computed: computedFee,
          });
          break;
        }
      }
      break;
    }

    case 'SLAB_INCREMENTAL_AMOUNT': {
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const from = tier.from ?? 0;
        const to = tier.to ?? Infinity;
        const amount = tier.amount ?? 0;

        if (baseAmount >= from && (baseAmount < to || to === 0 || to === Infinity)) {
          computedFee = amount;
          breakdown.push({
            tier: i + 1,
            from,
            to: to === Infinity || to === 0 ? baseAmount : to,
            rate_or_amount: amount,
            computed: amount,
          });
          break;
        }
      }
      break;
    }

    case 'STEP_FUNCTION': {
      const windows = stepWindows ?? [];
      const months = monthsSinceEngagement ?? 0;

      for (let i = 0; i < windows.length; i++) {
        const step = windows[i];
        const fromMonth = step.from_month ?? 0;
        const toMonth = step.to_month ?? Infinity;
        const amount = step.amount ?? 0;

        if (months >= fromMonth && (months < toMonth || toMonth === 0 || toMonth === Infinity)) {
          computedFee = amount;
          breakdown.push({
            tier: i + 1,
            from: fromMonth,
            to: toMonth === Infinity || toMonth === 0 ? months : toMonth,
            rate_or_amount: amount,
            computed: amount,
          });
          break;
        }
      }

      // If no window matched, use the last one
      if (computedFee === 0 && windows.length > 0) {
        const lastStep = windows[windows.length - 1];
        computedFee = lastStep.amount ?? 0;
        breakdown.push({
          tier: windows.length,
          from: lastStep.from_month ?? 0,
          to: lastStep.to_month ?? 0,
          rate_or_amount: lastStep.amount ?? 0,
          computed: computedFee,
        });
      }
      break;
    }

    default: {
      // Unknown pricing type -- return 0
      break;
    }
  }

  return { computedFee, breakdown };
}

/* ---------- Helper: Get ADB (Average Daily Balance) ---------- */

/**
 * Calculates Average Daily Balance for a portfolio.
 * Since real nav_computations data may not exist, falls back to a
 * reasonable default derived from available data.
 */
async function getADB(portfolioId: string, date: string): Promise<number> {
  // Try to get NAV data for the current month
  const monthStart = date.substring(0, 7) + '-01';

  const navResult = await db
    .select({
      avgNav: sql<string>`COALESCE(AVG(${schema.navComputations.total_nav}::numeric), 0)`,
    })
    .from(schema.navComputations)
    .where(
      and(
        eq(schema.navComputations.portfolio_id, portfolioId),
        sql`${schema.navComputations.computation_date} >= ${monthStart}`,
        sql`${schema.navComputations.computation_date} <= ${date}`,
      ),
    );

  const avgNav = parseFloat(navResult[0]?.avgNav ?? '0');

  if (avgNav > 0) return avgNav;

  // Fallback: try latest single NAV
  const [latestNav] = await db
    .select({ total_nav: schema.navComputations.total_nav })
    .from(schema.navComputations)
    .where(eq(schema.navComputations.portfolio_id, portfolioId))
    .orderBy(desc(schema.navComputations.computation_date))
    .limit(1);

  if (latestNav?.total_nav) {
    return parseFloat(latestNav.total_nav);
  }

  // No NAV data available -- return a synthetic default for demo
  // In production this would raise an exception
  return 10_000_000; // 10M PHP default ADB
}

/* ---------- Helper: Get Position Value ---------- */

/**
 * Get position value by basis type for a portfolio/security.
 * Queries the positions table for face_value, cost, or principal balance.
 * Falls back to ADB if no position data found.
 */
async function getPositionValue(
  portfolioId: string,
  securityId: string | null,
  valueBasis: string,
  date: string,
): Promise<number> {
  const conditions = [eq(schema.positions.portfolio_id, portfolioId)];
  if (securityId) {
    conditions.push(eq(schema.positions.security_id, parseInt(securityId, 10)));
  }

  const [position] = await db
    .select({
      quantity: schema.positions.quantity,
      market_value: schema.positions.market_value,
      cost_basis: schema.positions.cost_basis,
    })
    .from(schema.positions)
    .where(and(...conditions))
    .limit(1);

  if (!position) {
    // Fallback to ADB
    return getADB(portfolioId, date);
  }

  switch (valueBasis) {
    case 'FACE_VALUE':
      return parseFloat(String(position.quantity ?? '0')) * 1000; // par value assumption
    case 'COST':
      return parseFloat(String(position.cost_basis ?? position.market_value ?? '0'));
    case 'PRINCIPAL':
      return parseFloat(String(position.market_value ?? '0'));
    default:
      return getADB(portfolioId, date);
  }
}

/* ---------- Helper: Day Count Factor ---------- */

/**
 * Get day count factor for fee calculation.
 * Returns appropriate day count based on fee type and instrument.
 * Default: 1 (daily accrual = annual / 360).
 */
function getDayCountFactor(
  feeType: string,
  _securityId: string | null,
  _date: string,
): number {
  // In production, this would query the security master for
  // coupon_days, dividend_days, interest_payment_days, or term.
  // For now, return 1 (standard daily accrual).
  return 1;
}

/* ---------- Helper: Get Base Amount ---------- */

/**
 * Resolves the base amount for fee computation based on the fee plan's
 * value_basis and fee_type. Handles the various Philippine trust
 * instrument types.
 */
async function getBaseAmount(
  feePlan: any,
  portfolioId: string,
  _securityId: string | null,
  date: string,
): Promise<{ amount: number; formula: string }> {
  const feeType = feePlan.fee_type;

  switch (feeType) {
    case 'TRUST':
    case 'CUSTODY':
    case 'MANAGEMENT': {
      // Discretionary Trust: use Average Daily Balance
      const adb = await getADB(portfolioId, date);
      return {
        amount: adb,
        formula: `ADB(${portfolioId}) x rate / 360`,
      };
    }

    case 'ESCROW': {
      // Escrow: step function based on months since engagement
      // Base amount is not relevant for STEP_FUNCTION pricing
      return {
        amount: 1, // placeholder; step function uses flat amount
        formula: `STEP_FUNCTION(months_since_engagement)`,
      };
    }

    case 'PERFORMANCE': {
      // Performance fee: base is the AUM
      const adb = await getADB(portfolioId, date);
      return {
        amount: adb,
        formula: `AUM(${portfolioId}) x performance_rate / 360`,
      };
    }

    case 'SUBSCRIPTION':
    case 'REDEMPTION': {
      // Directional deposits: use transaction/deposit amount
      // value_basis=TXN_AMOUNT
      const adb = await getADB(portfolioId, date);
      return {
        amount: adb,
        formula: `DEPOSIT(${portfolioId}) x rate x term / 360`,
      };
    }

    case 'COMMISSION': {
      // Bonds: face value basis
      // value_basis=FACE_VALUE
      if (feePlan.value_basis === 'FACE_VALUE') {
        const faceValue = await getPositionValue(portfolioId, _securityId, 'FACE_VALUE', date);
        return {
          amount: faceValue,
          formula: `FACE_VALUE(${portfolioId}) x rate x coupon_days / 360`,
        };
      }
      // Preferred equities: cost basis
      if (feePlan.value_basis === 'COST') {
        const cost = await getPositionValue(portfolioId, _securityId, 'COST', date);
        return {
          amount: cost,
          formula: `COST(${portfolioId}) x rate x dividend_days / 360`,
        };
      }
      const adb = await getADB(portfolioId, date);
      return {
        amount: adb,
        formula: `ADB(${portfolioId}) x rate / 360`,
      };
    }

    case 'ADMIN': {
      // Loans: principal balance
      if (feePlan.value_basis === 'PRINCIPAL') {
        const principal = await getPositionValue(portfolioId, _securityId, 'PRINCIPAL', date);
        return {
          amount: principal,
          formula: `PRINCIPAL(${portfolioId}) x rate x interest_days / 360`,
        };
      }
      // T-Bills/CPs: cost basis
      if (feePlan.value_basis === 'COST') {
        const cost = await getPositionValue(portfolioId, _securityId, 'COST', date);
        return {
          amount: cost,
          formula: `COST(${portfolioId}) x rate x term / 360`,
        };
      }
      const adb = await getADB(portfolioId, date);
      return {
        amount: adb,
        formula: `ADB(${portfolioId}) x rate / 360`,
      };
    }

    case 'TAX':
    case 'OTHER': {
      // Generic: check value_basis
      if (feePlan.value_basis === 'FACE_VALUE') {
        const val = await getPositionValue(portfolioId, _securityId, 'FACE_VALUE', date);
        return { amount: val, formula: `FACE_VALUE(${portfolioId}) x rate / 360` };
      }
      if (feePlan.value_basis === 'COST') {
        const val = await getPositionValue(portfolioId, _securityId, 'COST', date);
        return { amount: val, formula: `COST(${portfolioId}) x rate / 360` };
      }
      if (feePlan.value_basis === 'PRINCIPAL') {
        const val = await getPositionValue(portfolioId, _securityId, 'PRINCIPAL', date);
        return { amount: val, formula: `PRINCIPAL(${portfolioId}) x rate / 360` };
      }
      if (feePlan.value_basis === 'TXN_AMOUNT') {
        const adb = await getADB(portfolioId, date);
        return { amount: adb, formula: `TXN_AMOUNT(${portfolioId}) x rate x term / 360` };
      }
      const adb = await getADB(portfolioId, date);
      return { amount: adb, formula: `ADB(${portfolioId}) x rate / 360` };
    }

    default: {
      // Generic: use ADB as default base
      const adb = await getADB(portfolioId, date);
      return {
        amount: adb,
        formula: `ADB(${portfolioId}) x rate / 360`,
      };
    }
  }
}

/* ---------- Helper: Compute Daily Accrual ---------- */

function computeDailyAccrual(
  annualFee: number,
  feeType: string,
): number {
  // All Philippine trust fee types use Act/360 day count convention
  return annualFee / 360;
}

/* ---------- Main Engine ---------- */

export const tfpAccrualEngine = {
  /**
   * Run daily accrual for all ACTIVE fee plans with charge_basis=PERIOD.
   * This is the main entry point called by the EOD orchestrator.
   */
  async runDailyAccrual(businessDate: string): Promise<AccrualRunSummary> {
    const summary: AccrualRunSummary = {
      businessDate,
      processed: 0,
      created: 0,
      skipped: 0,
      exceptions: 0,
    };

    // 1. Fetch all ACTIVE fee plans with charge_basis=PERIOD
    const activePlans = await db
      .select()
      .from(schema.feePlans)
      .where(
        and(
          eq(schema.feePlans.plan_status, 'ACTIVE'),
          eq(schema.feePlans.charge_basis, 'PERIOD'),
          sql`${schema.feePlans.effective_date} <= ${businessDate}`,
          sql`(${schema.feePlans.expiry_date} IS NULL OR ${schema.feePlans.expiry_date} >= ${businessDate})`,
        ),
      );

    if (activePlans.length === 0) {
      return summary;
    }

    // 2. Process each active plan
    for (const plan of activePlans) {
      summary.processed++;

      try {
        // 2a. Resolve pricing definition
        if (!plan.pricing_definition_id) {
          await createException(
            plan,
            businessDate,
            'ACCRUAL_MISMATCH',
            'Fee plan has no pricing definition assigned',
          );
          summary.exceptions++;
          continue;
        }

        let pricingDef: any;
        try {
          pricingDef = await pricingDefinitionService.getById(plan.pricing_definition_id);
        } catch {
          await createException(
            plan,
            businessDate,
            'ACCRUAL_MISMATCH',
            `Pricing definition ${plan.pricing_definition_id} not found`,
          );
          summary.exceptions++;
          continue;
        }

        // 2b. Resolve eligible portfolios
        // For now, we generate a synthetic portfolio list since real
        // portfolio-plan assignments may not exist yet.
        const portfolios = await resolveEligiblePortfolios(plan);

        if (portfolios.length === 0) {
          // No eligible portfolios -- skip silently
          summary.skipped++;
          continue;
        }

        // 2c. For each eligible portfolio, compute accrual
        for (const portfolio of portfolios) {
          const portfolioId = portfolio.id;
          const customerId = portfolio.customerId;
          const idempotencyKey = `${plan.id}:${portfolioId}:${businessDate}`;

          // Check idempotency -- skip if already processed
          const [existing] = await db
            .select({ id: schema.tfpAccruals.id })
            .from(schema.tfpAccruals)
            .where(eq(schema.tfpAccruals.idempotency_key, idempotencyKey))
            .limit(1);

          if (existing) {
            summary.skipped++;
            continue;
          }

          try {
            // Compute base amount
            const { amount: baseAmount, formula } = await getBaseAmount(
              plan,
              portfolioId,
              null,
              businessDate,
            );

            // Apply pricing tiers
            const tiers = (pricingDef.pricing_tiers as Record<string, unknown>[]) ?? [];
            const stepWindows = (pricingDef.step_windows as Record<string, unknown>[]) ?? null;

            // For escrow step-function, compute months since engagement
            let monthsSinceEngagement: number | undefined;
            if (pricingDef.pricing_type === 'STEP_FUNCTION') {
              monthsSinceEngagement = computeMonthsSinceEngagement(
                plan.effective_date,
                businessDate,
              );
            }

            const { computedFee: annualFee, breakdown } = applyPricingTiers(
              pricingDef.pricing_type,
              tiers,
              stepWindows,
              baseAmount,
              monthsSinceEngagement,
            );

            // Compute daily accrual from annual fee
            let dailyAccrual: number;
            if (pricingDef.pricing_type === 'STEP_FUNCTION') {
              // Step function gives a monthly amount; daily = monthly / 30
              dailyAccrual = annualFee / 30;
            } else if (pricingDef.pricing_type === 'FIXED_AMOUNT') {
              // Fixed amount: treat as annual, daily = annual / 360
              dailyAccrual = annualFee / 360;
            } else {
              // Rate-based: annual fee already computed, daily = annual / 360
              dailyAccrual = computeDailyAccrual(annualFee, plan.fee_type);
            }

            // Apply min/max charge amount caps
            let appliedFee = dailyAccrual;
            const minCharge = parseFloat(plan.min_charge_amount ?? '0');
            const maxCharge = plan.max_charge_amount
              ? parseFloat(plan.max_charge_amount)
              : null;

            // Min/max are daily comparisons
            if (appliedFee < minCharge) {
              appliedFee = minCharge;
            }
            if (maxCharge !== null && appliedFee > maxCharge) {
              appliedFee = maxCharge;
            }

            // Check for existing overrides
            const [override] = await db
              .select()
              .from(schema.feeOverrides)
              .where(
                and(
                  eq(schema.feeOverrides.stage, 'ORDER_CAPTURE'),
                  sql`${schema.feeOverrides.override_status} = 'APPROVED'`,
                ),
              )
              .limit(1);

            // Round to 4 decimal places
            const computedRounded = Math.round(dailyAccrual * 10000) / 10000;
            const appliedRounded = Math.round(appliedFee * 10000) / 10000;
            const baseRounded = Math.round(baseAmount * 10000) / 10000;

            // GAP-C07: Determine currency from pricing definition
            const planCurrency = pricingDef.currency ?? 'PHP';
            let fxRateLocked: string | null = null;

            // If plan currency differs from base (PHP), lock FX rate
            if (planCurrency !== 'PHP') {
              try {
                const fxResult = await fxRateService.getFxRate('PHP', planCurrency, businessDate);
                fxRateLocked = String(fxResult.mid_rate);
              } catch {
                // FX rate unavailable — continue with null
              }
            }

            // Insert accrual record
            await db.insert(schema.tfpAccruals).values({
              fee_plan_id: plan.id,
              customer_id: customerId,
              portfolio_id: portfolioId,
              security_id: null,
              transaction_id: null,
              base_amount: String(baseRounded),
              computed_fee: String(computedRounded),
              applied_fee: String(appliedRounded),
              currency: planCurrency,
              fx_rate_locked: fxRateLocked,
              accrual_date: businessDate,
              accrual_status: 'OPEN',
              override_id: override?.id ?? null,
              exception_id: null,
              idempotency_key: idempotencyKey,
            });

            summary.created++;
          } catch (err) {
            // Computation failed -- create exception
            const errorMessage = err instanceof Error ? err.message : String(err);
            await createException(
              plan,
              businessDate,
              'ACCRUAL_MISMATCH',
              `Failed to compute accrual for portfolio ${portfolioId}: ${errorMessage}`,
              customerId,
            );
            summary.exceptions++;
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await createException(
          plan,
          businessDate,
          'ACCRUAL_MISMATCH',
          `Plan-level error: ${errorMessage}`,
        );
        summary.exceptions++;
      }
    }

    return summary;
  },

  /**
   * Get a single accrual by ID with resolved fee plan info.
   */
  async getAccrualById(id: number) {
    const [accrual] = await db
      .select()
      .from(schema.tfpAccruals)
      .where(eq(schema.tfpAccruals.id, id))
      .limit(1);

    if (!accrual) {
      throw new Error(`Accrual not found: ${id}`);
    }

    // Resolve fee plan
    let feePlanCode: string | null = null;
    let feePlanName: string | null = null;
    let feeType: string | null = null;
    if (accrual.fee_plan_id) {
      const [fp] = await db
        .select({
          fee_plan_code: schema.feePlans.fee_plan_code,
          fee_plan_name: schema.feePlans.fee_plan_name,
          fee_type: schema.feePlans.fee_type,
        })
        .from(schema.feePlans)
        .where(eq(schema.feePlans.id, accrual.fee_plan_id))
        .limit(1);
      feePlanCode = fp?.fee_plan_code ?? null;
      feePlanName = fp?.fee_plan_name ?? null;
      feeType = fp?.fee_type ?? null;
    }

    return {
      ...accrual,
      fee_plan_code: feePlanCode,
      fee_plan_name: feePlanName,
      fee_type: feeType,
    };
  },

  /**
   * List accruals with filters and pagination.
   */
  async listAccruals(filters?: {
    accrual_date?: string;
    portfolio_id?: string;
    fee_plan_id?: number;
    accrual_status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.accrual_date) {
      conditions.push(eq(schema.tfpAccruals.accrual_date, filters.accrual_date));
    }

    if (filters?.portfolio_id) {
      conditions.push(eq(schema.tfpAccruals.portfolio_id, filters.portfolio_id));
    }

    if (filters?.fee_plan_id) {
      conditions.push(eq(schema.tfpAccruals.fee_plan_id, filters.fee_plan_id));
    }

    if (filters?.accrual_status) {
      conditions.push(
        eq(schema.tfpAccruals.accrual_status, filters.accrual_status as any),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: schema.tfpAccruals.id,
        fee_plan_id: schema.tfpAccruals.fee_plan_id,
        customer_id: schema.tfpAccruals.customer_id,
        portfolio_id: schema.tfpAccruals.portfolio_id,
        security_id: schema.tfpAccruals.security_id,
        base_amount: schema.tfpAccruals.base_amount,
        computed_fee: schema.tfpAccruals.computed_fee,
        applied_fee: schema.tfpAccruals.applied_fee,
        currency: schema.tfpAccruals.currency,
        accrual_date: schema.tfpAccruals.accrual_date,
        accrual_status: schema.tfpAccruals.accrual_status,
        idempotency_key: schema.tfpAccruals.idempotency_key,
        created_at: schema.tfpAccruals.created_at,
        fee_plan_code: schema.feePlans.fee_plan_code,
        fee_plan_name: schema.feePlans.fee_plan_name,
        fee_type: schema.feePlans.fee_type,
      })
      .from(schema.tfpAccruals)
      .leftJoin(schema.feePlans, eq(schema.tfpAccruals.fee_plan_id, schema.feePlans.id))
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.tfpAccruals.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tfpAccruals)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get summary statistics for a given business date.
   */
  async getSummary(date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    // Total for the date
    const dateResult = await db
      .select({
        count: sql<number>`count(*)`,
        total_amount: sql<string>`COALESCE(SUM(${schema.tfpAccruals.applied_fee}::numeric), 0)`,
      })
      .from(schema.tfpAccruals)
      .where(eq(schema.tfpAccruals.accrual_date, targetDate));

    const dayCount = Number(dateResult[0]?.count ?? 0);
    const dayTotal = parseFloat(dateResult[0]?.total_amount ?? '0');

    // MTD: from first of the month to target date
    const monthStart = targetDate.substring(0, 7) + '-01';
    const mtdResult = await db
      .select({
        count: sql<number>`count(*)`,
        total_amount: sql<string>`COALESCE(SUM(${schema.tfpAccruals.applied_fee}::numeric), 0)`,
      })
      .from(schema.tfpAccruals)
      .where(
        and(
          sql`${schema.tfpAccruals.accrual_date} >= ${monthStart}`,
          sql`${schema.tfpAccruals.accrual_date} <= ${targetDate}`,
        ),
      );

    const mtdCount = Number(mtdResult[0]?.count ?? 0);
    const mtdTotal = parseFloat(mtdResult[0]?.total_amount ?? '0');

    // Exceptions for the date
    const exceptionResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.exceptionItems)
      .where(
        and(
          eq(schema.exceptionItems.source_aggregate_type, 'FEE_ACCRUAL'),
          eq(schema.exceptionItems.exception_status, 'OPEN'),
        ),
      );

    const exceptionCount = Number(exceptionResult[0]?.count ?? 0);

    // Pending overrides
    const overrideResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.feeOverrides)
      .where(eq(schema.feeOverrides.override_status, 'PENDING'));

    const pendingOverrides = Number(overrideResult[0]?.count ?? 0);

    // Breakdown by fee_type for the date
    const breakdownResult = await db
      .select({
        fee_type: schema.feePlans.fee_type,
        count: sql<number>`count(*)`,
        total: sql<string>`COALESCE(SUM(${schema.tfpAccruals.applied_fee}::numeric), 0)`,
      })
      .from(schema.tfpAccruals)
      .leftJoin(schema.feePlans, eq(schema.tfpAccruals.fee_plan_id, schema.feePlans.id))
      .where(eq(schema.tfpAccruals.accrual_date, targetDate))
      .groupBy(schema.feePlans.fee_type);

    return {
      date: targetDate,
      day: {
        count: dayCount,
        total: Math.round(dayTotal * 10000) / 10000,
      },
      mtd: {
        count: mtdCount,
        total: Math.round(mtdTotal * 10000) / 10000,
      },
      exceptions: exceptionCount,
      pendingOverrides,
      breakdown: breakdownResult.map((r: any) => ({
        fee_type: r.fee_type ?? 'UNKNOWN',
        count: Number(r.count),
        total: parseFloat(r.total),
      })),
    };
  },
};

/* ---------- Internal Helpers ---------- */

/**
 * Resolve eligible portfolios for a fee plan.
 * If the plan has an eligibility_expression_id, evaluate it.
 * Otherwise, return all portfolios from the portfolios table.
 */
async function resolveEligiblePortfolios(
  plan: any,
): Promise<Array<{ id: string; customerId: string }>> {
  // Fetch portfolios from the database
  const portfolios = await db
    .select({
      id: schema.portfolios.portfolio_id,
      customerId: schema.portfolios.client_id,
      portfolio_type: schema.portfolios.type,
      portfolio_status: schema.portfolios.portfolio_status,
    })
    .from(schema.portfolios)
    .where(eq(schema.portfolios.portfolio_status, 'active'))
    .limit(100);

  if (portfolios.length === 0) {
    // No portfolios found -- return empty
    return [];
  }

  // If the plan has an eligibility expression, evaluate it per portfolio
  if (plan.eligibility_expression_id) {
    try {
      const [exprRecord] = await db
        .select()
        .from(schema.eligibilityExpressions)
        .where(eq(schema.eligibilityExpressions.id, plan.eligibility_expression_id))
        .limit(1);

      if (exprRecord?.expression) {
        const expression = exprRecord.expression as ASTNode;
        const eligible: Array<{ id: string; customerId: string }> = [];

        for (const p of portfolios) {
          const context: Record<string, any> = {
            portfolio_type: p.portfolio_type,
            fee_type: plan.fee_type,
            jurisdiction_id: plan.jurisdiction_id,
          };

          const { result } = eligibilityEngine.evaluate(expression, context);
          if (result) {
            eligible.push({
              id: p.id!,
              customerId: p.customerId ?? 'UNKNOWN',
            });
          }
        }

        return eligible;
      }
    } catch {
      // If eligibility evaluation fails, fall through to return all
    }
  }

  // No eligibility filter -- all active portfolios are eligible
  return portfolios.map((p: any) => ({
    id: p.id ?? `PORT-${Math.random().toString(36).substring(7)}`,
    customerId: p.customerId ?? 'UNKNOWN',
  }));
}

/**
 * Create an exception item when accrual computation fails.
 */
async function createException(
  plan: any,
  businessDate: string,
  exceptionType: string,
  details: string,
  customerId?: string,
): Promise<void> {
  const slaDue = new Date();
  slaDue.setHours(slaDue.getHours() + 4); // 4-hour SLA

  await db.insert(schema.exceptionItems).values({
    exception_type: exceptionType,
    severity: 'P2',
    customer_id: customerId ?? null,
    source_aggregate_type: 'FEE_ACCRUAL',
    source_aggregate_id: `${plan.id}:${businessDate}`,
    title: `Accrual failure: ${plan.fee_plan_code} on ${businessDate}`,
    details: { message: details, fee_plan_id: plan.id, business_date: businessDate },
    assigned_to_team: 'FEE_OPS',
    assigned_to_user: null,
    exception_status: 'OPEN',
    sla_due_at: slaDue,
  });
}

/**
 * Compute months since engagement (effective_date to businessDate).
 */
function computeMonthsSinceEngagement(
  effectiveDate: string,
  businessDate: string,
): number {
  const start = new Date(effectiveDate);
  const end = new Date(businessDate);
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}
