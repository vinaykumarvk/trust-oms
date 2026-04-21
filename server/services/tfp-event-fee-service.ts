/**
 * TFP Event Fee Service (TrustFees Pro -- Phase 6)
 *
 * Handles EVENT-based fees (charge_basis=EVENT), such as:
 *   - Subscription / Redemption fees
 *   - Transaction commissions
 *   - One-off administrative charges
 *
 * Provides:
 *   - computePreview: Real-time fee preview without persisting
 *   - captureEventFee: Persist event-based fee as tfpAccrual record
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { pricingDefinitionService } from './pricing-definition-service';
import { eligibilityEngine, type ASTNode } from './eligibility-engine';

/* ---------- Types ---------- */

interface TransactionContext {
  customer_id: string;
  portfolio_id: string;
  security_id?: string;
  transaction_id?: string;
  transaction_amount: number;
  transaction_type?: string;
  asset_class?: string;
  market?: string;
  currency?: string;
}

interface EventFeeResult {
  computed_fee: number;
  applied_fee: number;
  base_amount: number;
  breakdown: Array<{
    tier: number;
    from: number;
    to: number;
    rate_or_amount: number;
    computed: number;
  }>;
  pricing_type: string;
  eligible: boolean;
  eligibility_trace?: any;
  formula: string;
  fee_plan_code: string;
  fee_plan_name: string;
  fee_type: string;
}

/* ---------- Helper: Apply Pricing Tiers (Event) ---------- */

function applyEventPricingTiers(
  pricingType: string,
  tiers: any[],
  baseAmount: number,
): { computedFee: number; breakdown: EventFeeResult['breakdown'] } {
  let computedFee = 0;
  const breakdown: EventFeeResult['breakdown'] = [];

  switch (pricingType) {
    case 'FIXED_AMOUNT': {
      const amt = tiers[0]?.amount ?? 0;
      computedFee = amt;
      breakdown.push({ tier: 1, from: 0, to: baseAmount, rate_or_amount: amt, computed: amt });
      break;
    }

    case 'FIXED_RATE': {
      const rate = tiers[0]?.rate ?? 0;
      computedFee = baseAmount * (rate / 100);
      breakdown.push({ tier: 1, from: 0, to: baseAmount, rate_or_amount: rate, computed: computedFee });
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
          tier: i + 1, from, to: to === Infinity || to === 0 ? baseAmount : to,
          rate_or_amount: rate, computed: tierFee,
        });
        computedFee += tierFee;
        remaining -= tierWidth;
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
            tier: i + 1, from, to: to === Infinity || to === 0 ? baseAmount : to,
            rate_or_amount: rate, computed: computedFee,
          });
          break;
        }
      }
      break;
    }

    case 'SLAB_CUMULATIVE_AMOUNT': {
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const from = tier.from ?? 0;
        const to = tier.to ?? Infinity;
        const amount = tier.amount ?? 0;
        if (baseAmount >= from) {
          breakdown.push({
            tier: i + 1, from, to: to === Infinity || to === 0 ? baseAmount : to,
            rate_or_amount: amount, computed: amount,
          });
          computedFee += amount;
        }
        if (to !== Infinity && to !== 0 && baseAmount < to) break;
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
            tier: i + 1, from, to: to === Infinity || to === 0 ? baseAmount : to,
            rate_or_amount: amount, computed: amount,
          });
          break;
        }
      }
      break;
    }

    default:
      break;
  }

  return { computedFee, breakdown };
}

/* ---------- Event Fee Service ---------- */

export const tfpEventFeeService = {
  /**
   * Compute a fee preview for an event-based fee plan.
   * Does NOT persist; returns the computed result with full breakdown and trace.
   */
  async computePreview(
    feePlanId: number,
    transactionContext: TransactionContext,
  ): Promise<EventFeeResult> {
    // Fetch fee plan
    const [plan] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, feePlanId))
      .limit(1);

    if (!plan) {
      throw new Error(`Fee plan not found: ${feePlanId}`);
    }

    if (plan.charge_basis !== 'EVENT') {
      throw new Error(`Fee plan ${feePlanId} is not an EVENT-based plan (is ${plan.charge_basis})`);
    }

    // Check eligibility
    let eligible = true;
    let eligibilityTrace: any = null;

    if (plan.eligibility_expression_id) {
      const [exprRecord] = await db
        .select()
        .from(schema.eligibilityExpressions)
        .where(eq(schema.eligibilityExpressions.id, plan.eligibility_expression_id))
        .limit(1);

      if (exprRecord?.expression) {
        const context: Record<string, any> = {
          transaction_type: transactionContext.transaction_type,
          asset_class: transactionContext.asset_class,
          market: transactionContext.market,
          transaction_amount: transactionContext.transaction_amount,
          fee_type: plan.fee_type,
        };

        const evalResult = eligibilityEngine.evaluate(
          exprRecord.expression as ASTNode,
          context,
        );
        eligible = evalResult.result;
        eligibilityTrace = evalResult.trace;
      }
    }

    if (!eligible) {
      return {
        computed_fee: 0,
        applied_fee: 0,
        base_amount: transactionContext.transaction_amount,
        breakdown: [],
        pricing_type: 'N/A',
        eligible: false,
        eligibility_trace: eligibilityTrace,
        formula: 'Not eligible',
        fee_plan_code: plan.fee_plan_code,
        fee_plan_name: plan.fee_plan_name,
        fee_type: plan.fee_type,
      };
    }

    // Resolve pricing definition
    if (!plan.pricing_definition_id) {
      throw new Error(`Fee plan ${feePlanId} has no pricing definition assigned`);
    }

    const pricingDef = await pricingDefinitionService.getById(plan.pricing_definition_id);
    const tiers = (pricingDef.pricing_tiers as any[]) ?? [];
    const baseAmount = transactionContext.transaction_amount;

    // Apply pricing tiers
    const { computedFee, breakdown } = applyEventPricingTiers(
      pricingDef.pricing_type,
      tiers,
      baseAmount,
    );

    // Apply min/max charge caps
    let appliedFee = computedFee;
    const minCharge = parseFloat(plan.min_charge_amount ?? '0');
    const maxCharge = plan.max_charge_amount ? parseFloat(plan.max_charge_amount) : null;

    if (appliedFee < minCharge) {
      appliedFee = minCharge;
    }
    if (maxCharge !== null && appliedFee > maxCharge) {
      appliedFee = maxCharge;
    }

    return {
      computed_fee: Math.round(computedFee * 10000) / 10000,
      applied_fee: Math.round(appliedFee * 10000) / 10000,
      base_amount: baseAmount,
      breakdown,
      pricing_type: pricingDef.pricing_type,
      eligible: true,
      eligibility_trace: eligibilityTrace,
      formula: `${pricingDef.pricing_type}(transaction_amount=${baseAmount})`,
      fee_plan_code: plan.fee_plan_code,
      fee_plan_name: plan.fee_plan_name,
      fee_type: plan.fee_type,
    };
  },

  /**
   * Capture an event-based fee by persisting it as a tfpAccrual record.
   */
  async captureEventFee(
    feePlanId: number,
    transactionId: string,
    transactionContext: TransactionContext,
  ): Promise<any> {
    // Compute the fee first
    const preview = await this.computePreview(feePlanId, transactionContext);

    if (!preview.eligible) {
      return {
        captured: false,
        reason: 'Not eligible per eligibility expression',
        preview,
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const idempotencyKey = `${feePlanId}:${transactionId}:${today}`;

    // Check idempotency
    const [existing] = await db
      .select({ id: schema.tfpAccruals.id })
      .from(schema.tfpAccruals)
      .where(eq(schema.tfpAccruals.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing) {
      return {
        captured: false,
        reason: 'Duplicate -- event fee already captured',
        existing_id: existing.id,
        preview,
      };
    }

    // Insert accrual
    const [accrual] = await db
      .insert(schema.tfpAccruals)
      .values({
        fee_plan_id: feePlanId,
        customer_id: transactionContext.customer_id,
        portfolio_id: transactionContext.portfolio_id,
        security_id: transactionContext.security_id ?? null,
        transaction_id: transactionId,
        base_amount: String(preview.base_amount),
        computed_fee: String(preview.computed_fee),
        applied_fee: String(preview.applied_fee),
        currency: transactionContext.currency ?? 'PHP',
        fx_rate_locked: null,
        accrual_date: today,
        accrual_status: 'OPEN',
        override_id: null,
        exception_id: null,
        idempotency_key: idempotencyKey,
      })
      .returning();

    return {
      captured: true,
      accrual,
      preview,
    };
  },
};
