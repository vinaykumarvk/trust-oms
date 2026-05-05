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
import { tfpAuditService } from './tfp-audit-service';
import {
  resolveProductFeeFormula,
  type ProductFeeFormulaPolicy,
} from './tfp-fee-calculation-policy';
import { tfpAccountingEventService } from './tfp-accounting-event-service';
import { exceptionQueueService } from './exception-queue-service';

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

interface PortfolioCandidate {
  id: string;
  customerId: string;
  portfolioType?: string | null;
}

interface BaseAmountResult {
  amount: number;
  formula: string;
  formulaPolicy: ProductFeeFormulaPolicy;
  sourceEvidence: Record<string, unknown>;
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

/* ---------- Helpers: Base Amount Resolution ---------- */

function toNumber(value: unknown): number {
  const parsed = parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getPortfolioAum(portfolioId: string): Promise<{ amount: number; evidence: Record<string, unknown> }> {
  const [portfolio] = await db
    .select({
      portfolio_id: schema.portfolios.portfolio_id,
      type: schema.portfolios.type,
      aum: schema.portfolios.aum,
    })
    .from(schema.portfolios)
    .where(eq(schema.portfolios.portfolio_id, portfolioId))
    .limit(1);

  const amount = toNumber(portfolio?.aum);
  if (amount <= 0) {
    throw new Error(`No portfolio AUM available for ${portfolioId}`);
  }

  return {
    amount,
    evidence: {
      source_table: 'portfolios',
      source_field: 'aum',
      portfolio_id: portfolio?.portfolio_id ?? portfolioId,
      portfolio_type: portfolio?.type ?? null,
    },
  };
}

/**
 * Calculates Average Daily Balance for a portfolio using month-to-date NAV.
 * Falls back to latest NAV, then explicitly to portfolio AUM. It no longer
 * uses synthetic values because fee accruals need auditable source evidence.
 */
async function getADB(portfolioId: string, date: string): Promise<{ amount: number; evidence: Record<string, unknown> }> {
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

  if (avgNav > 0) {
    return {
      amount: avgNav,
      evidence: {
        source_table: 'nav_computations',
        source_field: 'avg(total_nav)',
        portfolio_id: portfolioId,
        from_date: monthStart,
        to_date: date,
      },
    };
  }

  // Fallback: try latest single NAV
  const [latestNav] = await db
    .select({ total_nav: schema.navComputations.total_nav })
    .from(schema.navComputations)
    .where(eq(schema.navComputations.portfolio_id, portfolioId))
    .orderBy(desc(schema.navComputations.computation_date))
    .limit(1);

  if (latestNav?.total_nav) {
    return {
      amount: parseFloat(latestNav.total_nav),
      evidence: {
        source_table: 'nav_computations',
        source_field: 'latest(total_nav)',
        portfolio_id: portfolioId,
      },
    };
  }

  const portfolioAum = await getPortfolioAum(portfolioId);
  return {
    amount: portfolioAum.amount,
    evidence: {
      ...portfolioAum.evidence,
      fallback_reason: 'missing_nav_computations',
    },
  };
}

/**
 * Get position value by basis type for a portfolio/security. Position-based
 * fee plans must have a real source amount; falling back to ADB would create
 * the wrong product formula.
 */
async function getPositionBase(
  portfolioId: string,
  securityId: string | null,
  valueBasis: string,
  date: string,
): Promise<{
  amount: number;
  evidence: Record<string, unknown>;
  securityAssetClass?: string | null;
  securityInstrumentSubType?: string | null;
}> {
  const conditions = [eq(schema.positions.portfolio_id, portfolioId)];
  if (securityId) {
    conditions.push(eq(schema.positions.security_id, parseInt(securityId, 10)));
  }

  const [position] = await db
    .select({
      id: schema.positions.id,
      quantity: schema.positions.quantity,
      market_value: schema.positions.market_value,
      cost_basis: schema.positions.cost_basis,
      face_value: schema.positions.face_value,
      principal_balance: schema.positions.principal_balance,
      notional_amount: schema.positions.notional_amount,
      acquisition_cost: schema.positions.acquisition_cost,
      as_of_date: schema.positions.as_of_date,
      security_id: schema.positions.security_id,
    })
    .from(schema.positions)
    .where(and(...conditions))
    .orderBy(desc(schema.positions.as_of_date))
    .limit(1);

  if (!position) {
    throw new Error(`No position source available for ${portfolioId} ${valueBasis} fee base on ${date}`);
  }

  let security: {
    id?: number | null;
    asset_class?: string | null;
    instrument_sub_type?: string | null;
    par_value?: string | null;
  } | null = null;

  const resolvedSecurityId = securityId ? parseInt(securityId, 10) : position.security_id;
  if (resolvedSecurityId) {
    const [securityRow] = await db
      .select({
        id: schema.securities.id,
        asset_class: schema.securities.asset_class,
        instrument_sub_type: schema.securities.instrument_sub_type,
        par_value: schema.securities.par_value,
      })
      .from(schema.securities)
      .where(eq(schema.securities.id, resolvedSecurityId))
      .limit(1);
    security = securityRow ?? null;
  }

  const normalizedBasis = String(valueBasis ?? '').toUpperCase();
  const parValue = toNumber(security?.par_value) || 1000;
  let amount = 0;
  let sourceField = '';
  let derivation: Record<string, unknown> = {};

  switch (normalizedBasis) {
    case 'FACE_VALUE':
      amount = toNumber(position.face_value);
      sourceField = 'positions.face_value';
      if (amount <= 0) {
        const quantity = toNumber(position.quantity);
        amount = quantity * parValue;
        sourceField = 'positions.quantity x securities.par_value';
        derivation = { quantity, par_value: parValue, par_value_fallback_used: !security?.par_value };
      }
      break;
    case 'COST':
      amount = toNumber(position.acquisition_cost) || toNumber(position.cost_basis) || toNumber(position.market_value);
      sourceField = position.acquisition_cost ? 'positions.acquisition_cost' : position.cost_basis ? 'positions.cost_basis' : 'positions.market_value';
      break;
    case 'PRINCIPAL':
      amount = toNumber(position.principal_balance) || toNumber(position.market_value);
      sourceField = position.principal_balance ? 'positions.principal_balance' : 'positions.market_value';
      break;
    case 'NOTIONAL':
      amount = toNumber(position.notional_amount) || toNumber(position.market_value);
      sourceField = position.notional_amount ? 'positions.notional_amount' : 'positions.market_value';
      break;
    default:
      throw new Error(`Unsupported position value basis ${valueBasis}`);
  }

  if (amount <= 0) {
    throw new Error(`Position ${position.id ?? 'unknown'} has no positive ${valueBasis} base amount`);
  }

  return {
    amount,
    evidence: {
      source_table: 'positions',
      source_field: sourceField,
      portfolio_id: portfolioId,
      position_id: position.id ?? null,
      security_id: resolvedSecurityId ?? null,
      as_of_date: position.as_of_date ?? null,
      ...derivation,
    },
    securityAssetClass: security?.asset_class ?? null,
    securityInstrumentSubType: security?.instrument_sub_type ?? null,
  };
}

async function getCashOrTransactionBase(
  portfolioId: string,
  date: string,
): Promise<{ amount: number; evidence: Record<string, unknown> }> {
  const cashResult = await db
    .select({
      amount: sql<string>`COALESCE(SUM(${schema.cashLedger.balance}::numeric), 0)`,
    })
    .from(schema.cashLedger)
    .where(
      and(
        eq(schema.cashLedger.portfolio_id, portfolioId),
        sql`${schema.cashLedger.as_of_date} <= ${date}`,
      ),
    );

  const amount = toNumber(cashResult[0]?.amount);
  if (amount <= 0) {
    throw new Error(`No cash or transaction amount source available for ${portfolioId} on ${date}`);
  }

  return {
    amount,
    evidence: {
      source_table: 'cash_ledger',
      source_field: 'sum(balance)',
      portfolio_id: portfolioId,
      as_of_or_before: date,
    },
  };
}

/* ---------- Helper: Get Base Amount ---------- */

/**
 * Resolves the base amount for fee computation based on the fee plan's
 * value_basis and fee_type. Handles the various Philippine trust
 * instrument types.
 */
async function getBaseAmount(
  feePlan: any,
  portfolio: PortfolioCandidate,
  securityId: string | null,
  date: string,
): Promise<BaseAmountResult> {
  let formulaPolicy = resolveProductFeeFormula(feePlan, {
    portfolioId: portfolio.id,
    businessDate: date,
    portfolioType: portfolio.portfolioType,
    securityId,
  });

  let amount = 0;
  let sourceEvidence: Record<string, unknown> = {};

  switch (formulaPolicy.baseSource) {
    case 'NAV_MTD_AVERAGE':
    case 'AVG_INVESTMENT': {
      const adb = await getADB(portfolio.id, date);
      amount = adb.amount;
      sourceEvidence = adb.evidence;
      break;
    }
    case 'PORTFOLIO_AUM':
    case 'PORTFOLIO_BUM': {
      const aum = await getPortfolioAum(portfolio.id);
      amount = aum.amount;
      sourceEvidence = {
        ...aum.evidence,
        requested_base_source: formulaPolicy.baseSource,
      };
      break;
    }
    case 'POSITION_FACE_VALUE':
    case 'POSITION_COST':
    case 'POSITION_PRINCIPAL':
    case 'POSITION_NOTIONAL': {
      const positionBase = await getPositionBase(
        portfolio.id,
        securityId,
        formulaPolicy.expectedValueBasis,
        date,
      );
      amount = positionBase.amount;
      sourceEvidence = positionBase.evidence;
      formulaPolicy = resolveProductFeeFormula(feePlan, {
        portfolioId: portfolio.id,
        businessDate: date,
        portfolioType: portfolio.portfolioType,
        securityId,
        securityAssetClass: positionBase.securityAssetClass,
        securityInstrumentSubType: positionBase.securityInstrumentSubType,
      });
      break;
    }
    case 'CASH_OR_TRANSACTION_AMOUNT': {
      const cashBase = await getCashOrTransactionBase(portfolio.id, date);
      amount = cashBase.amount;
      sourceEvidence = cashBase.evidence;
      break;
    }
    case 'ESCROW_STEP_WINDOW': {
      amount = 1;
      sourceEvidence = {
        source_table: 'pricing_definitions',
        source_field: 'step_windows',
        portfolio_id: portfolio.id,
        note: 'STEP_FUNCTION pricing supplies the fee amount; base amount is nominal',
      };
      break;
    }
    default:
      throw new Error(`Unsupported fee base source ${formulaPolicy.baseSource}`);
  }

  return {
    amount,
    formula: `${formulaPolicy.formulaCode}: ${formulaPolicy.formulaDescription}`,
    formulaPolicy,
    sourceEvidence,
  };
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

        // 2b. Resolve eligible portfolios.
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
            const {
              amount: baseAmount,
              formula,
              formulaPolicy,
              sourceEvidence,
            } = await getBaseAmount(
              plan,
              portfolio,
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
            const [accrual] = await db.insert(schema.tfpAccruals).values({
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
            }).returning();

            try {
              await tfpAuditService.logEvent(
                'TFP_ACCRUAL',
                String(accrual?.id ?? idempotencyKey),
                'ACCRUAL_CALCULATED',
                {
                  fee_plan_id: plan.id,
                  fee_plan_code: plan.fee_plan_code,
                  portfolio_id: portfolioId,
                  customer_id: customerId,
                  product_family: formulaPolicy.productFamily,
                  formula_code: formulaPolicy.formulaCode,
                  formula,
                  base_source: formulaPolicy.baseSource,
                  base_amount: baseRounded,
                  base_source_evidence: sourceEvidence,
                  pricing_type: pricingDef.pricing_type,
                  pricing_currency: planCurrency,
                  pricing_breakdown: breakdown,
                  period: {
                    business_date: businessDate,
                    period_source: formulaPolicy.periodSource,
                    period_days: formulaPolicy.periodDays,
                    annualization_base: formulaPolicy.annualizationBase,
                  },
                  tax: {
                    treatment: formulaPolicy.taxTreatment,
                    accrual_tax_amount: 0,
                    note: 'Tax is computed at invoice generation from approved tax rules.',
                  },
                  override: {
                    status: override?.id ? 'APPROVED_APPLIED' : 'NONE',
                    override_id: override?.id ?? null,
                  },
                  amounts: {
                    computed_fee: computedRounded,
                    applied_fee: appliedRounded,
                    min_charge_amount: minCharge,
                    max_charge_amount: maxCharge,
                  },
                  fx: {
                    fx_rate_locked: fxRateLocked,
                  },
                  idempotency_key: idempotencyKey,
                },
                null,
              );
            } catch (auditErr) {
              const auditMessage = auditErr instanceof Error ? auditErr.message : String(auditErr);
              await createException(
                plan,
                businessDate,
                'ACCRUAL_MISMATCH',
                `Accrual ${accrual?.id ?? idempotencyKey} created but calculation audit logging failed: ${auditMessage}`,
                customerId,
              );
              summary.exceptions++;
            }

            try {
              await tfpAccountingEventService.queueEvent({
                eventType: 'TFP_ACCRUAL_CREATED',
                sourceTransactionType: 'TFP_ACCRUAL',
                sourceTransactionId: String(accrual?.id ?? idempotencyKey),
                sourceEventId: idempotencyKey,
                aggregateType: 'FEE_PLAN',
                aggregateId: String(plan.id),
                customerId,
                portfolioId,
                feePlanId: plan.id,
                accrualId: accrual?.id ?? null,
                amount: appliedRounded,
                currency: planCurrency,
                accountingDate: businessDate,
                metadata: {
                  fee_plan_code: plan.fee_plan_code,
                  pricing_definition_id: plan.pricing_definition_id,
                  formula_code: formulaPolicy.formulaCode,
                  base_source: formulaPolicy.baseSource,
                  computed_fee: computedRounded,
                  idempotency_key: idempotencyKey,
                },
              });
            } catch (eventErr) {
              const eventMessage = eventErr instanceof Error ? eventErr.message : String(eventErr);
              await createException(
                plan,
                businessDate,
                'ACCRUAL_MISMATCH',
                `Accrual ${accrual?.id ?? idempotencyKey} created but accounting event queueing failed: ${eventMessage}`,
                customerId,
              );
              summary.exceptions++;
            }

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
): Promise<PortfolioCandidate[]> {
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
        const eligible: PortfolioCandidate[] = [];

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
              portfolioType: p.portfolio_type ?? null,
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
  return portfolios.map((p: any, index: number) => ({
    id: p.id ?? `PORT-UNKNOWN-${index + 1}`,
    customerId: p.customerId ?? 'UNKNOWN',
    portfolioType: p.portfolio_type ?? null,
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
  await exceptionQueueService.createException({
    exception_type: exceptionType,
    exception_domain: 'TRUST_FEES',
    severity: 'P2',
    title: `Accrual failure: ${plan.fee_plan_code} on ${businessDate}`,
    description: details,
    customer_id: customerId,
    source_system: 'TFP_ACCRUAL_ENGINE',
    source_object_uri: `trust-fees://accruals/${plan.id}/${businessDate}`,
    aggregate_type: 'FEE_ACCRUAL',
    aggregate_id: `${plan.id}:${businessDate}`,
    details: { message: details, fee_plan_id: plan.id, business_date: businessDate },
    assigned_to_team: 'FEE_OPS',
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
