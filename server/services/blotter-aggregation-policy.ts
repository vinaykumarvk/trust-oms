/**
 * Blotter Aggregation Rules — ODA/MLD Order Grouping Policy
 *
 * Defines the rules that govern which orders may be aggregated into a single
 * blotter group for collective placement. Orders that violate any rule MUST
 * be placed into separate blotter groups.
 *
 * Rule Categories:
 *   1. Direction Segregation — BUY and SELL cannot be mixed
 *   2. Currency Pair Segregation — different pairs cannot be mixed
 *   3. Effective Type Segregation — INTRADAY, OVERNIGHT, GTD cannot be mixed
 *   4. ODA Type Segregation — SINGLE orders cannot mix with IF_DONE/OCO
 *   5. Tenor Segregation — different tenor days cannot be mixed
 *   6. Value Date Segregation — different value dates cannot be mixed
 *   7. Customer Type Segregation — INDIVIDUAL and INSTITUTIONAL cannot be mixed
 *   8. Rate Tolerance — orders with target rates outside tolerance band cannot be mixed
 *   9. Product ID Segregation — orders from different products cannot be mixed
 *  10. Channel Segregation — segregate by channel when product requires it
 */

import { ValidationError } from './service-errors';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AggregationCandidate {
  id: number;
  direction: string;
  currency_pair: string;
  effective_type: string;
  oda_type: string;
  tenor_days: number;
  value_date?: string | null;
  customer_type: string;
  rate: string | number;
  channel: string;
  product_id?: number | null;
  nominal_amount: string | number;
  minimum_collective_amount?: string | number | null;
  order_cost_before_swap?: string | number | null;
}

export interface AggregationRule {
  /** Short code for the rule (e.g., 'DIRECTION_SEGREGATION') */
  code: string;
  /** Human-readable description */
  description: string;
  /** Priority order — lower numbers are evaluated first */
  priority: number;
  /** Whether this rule is mandatory (violation = hard reject) or advisory (warning only) */
  enforcement: 'MANDATORY' | 'ADVISORY';
  /**
   * Compute the bucket key component for this rule.
   * Orders with different keys for ANY mandatory rule cannot be aggregated.
   */
  computeKey: (candidate: AggregationCandidate) => string;
}

export interface AggregationViolation {
  ruleCode: string;
  ruleDescription: string;
  enforcement: 'MANDATORY' | 'ADVISORY';
  candidateId: number;
  expectedValue: string;
  actualValue: string;
}

export interface AggregationBucket {
  key: string;
  ruleKeys: Record<string, string>;
  direction: string;
  currencyPair: string;
  effectiveType: string;
  odaType: string;
  tenorDays: number;
  valueDate: string | null;
  customerType: string;
  rate: number;
  channel: string;
  productId: number | null;
  totalNominal: number;
  orderCostBeforeSwap: number;
  orderCount: number;
  minimumCollectiveAmount: number;
  recommendationIds: number[];
}

export interface AggregationResult {
  buckets: AggregationBucket[];
  violations: AggregationViolation[];
  rulesApplied: string[];
}

// ─── Rule Definitions ────────────────────────────────────────────────────────

export const BLOTTER_AGGREGATION_RULES: AggregationRule[] = [
  {
    code: 'DIRECTION_SEGREGATION',
    description: 'BUY and SELL orders cannot be aggregated into the same blotter group',
    priority: 1,
    enforcement: 'MANDATORY',
    computeKey: (c) => c.direction?.toUpperCase() || 'BUY',
  },
  {
    code: 'CURRENCY_PAIR_SEGREGATION',
    description: 'Orders for different currency pairs cannot be aggregated',
    priority: 2,
    enforcement: 'MANDATORY',
    computeKey: (c) => (c.currency_pair || '').toUpperCase().replace(/\s/g, ''),
  },
  {
    code: 'EFFECTIVE_TYPE_SEGREGATION',
    description: 'Orders with different effective types (INTRADAY, OVERNIGHT, GTD) cannot be aggregated',
    priority: 3,
    enforcement: 'MANDATORY',
    computeKey: (c) => (c.effective_type || 'INTRADAY').toUpperCase(),
  },
  {
    code: 'ODA_TYPE_SEGREGATION',
    description: 'SINGLE orders cannot be mixed with structured orders (IF_DONE, OCO) in the same group',
    priority: 4,
    enforcement: 'MANDATORY',
    computeKey: (c) => {
      const type = (c.oda_type || 'SINGLE').toUpperCase();
      // SINGLE forms its own bucket; IF_DONE and OCO are separate from SINGLE but also from each other
      return type;
    },
  },
  {
    code: 'TENOR_SEGREGATION',
    description: 'Orders with different tenor/settlement periods cannot be aggregated',
    priority: 5,
    enforcement: 'MANDATORY',
    computeKey: (c) => String(c.tenor_days ?? 1),
  },
  {
    code: 'VALUE_DATE_SEGREGATION',
    description: 'Orders with different value dates cannot be aggregated',
    priority: 6,
    enforcement: 'MANDATORY',
    computeKey: (c) => c.value_date || 'SAME_DAY',
  },
  {
    code: 'CUSTOMER_TYPE_SEGREGATION',
    description: 'Individual and institutional customer orders must be placed in separate groups for regulatory reporting',
    priority: 7,
    enforcement: 'MANDATORY',
    computeKey: (c) => (c.customer_type || 'INDIVIDUAL').toUpperCase(),
  },
  {
    code: 'RATE_BAND_SEGREGATION',
    description: 'Orders with different target rates are grouped by exact rate to ensure consistent execution pricing',
    priority: 8,
    enforcement: 'MANDATORY',
    computeKey: (c) => String(Number(c.rate) || 0),
  },
  {
    code: 'PRODUCT_SEGREGATION',
    description: 'Orders from different products cannot be aggregated (different product rules/cutoffs may apply)',
    priority: 9,
    enforcement: 'MANDATORY',
    computeKey: (c) => String(c.product_id ?? 'NONE'),
  },
  {
    code: 'CHANNEL_SEGREGATION',
    description: 'Orders from different channels are kept separate for audit trail and SLA tracking',
    priority: 10,
    enforcement: 'ADVISORY',
    computeKey: (c) => (c.channel || 'OEMS_DIRECT').toUpperCase(),
  },
];

// ─── Aggregation Engine ──────────────────────────────────────────────────────

/**
 * Compute the composite aggregation key for a candidate using all mandatory rules.
 * Orders with identical composite keys are eligible for aggregation.
 */
export function computeAggregationKey(
  candidate: AggregationCandidate,
  rules: AggregationRule[] = BLOTTER_AGGREGATION_RULES,
): string {
  const mandatoryRules = rules
    .filter((r) => r.enforcement === 'MANDATORY')
    .sort((a, b) => a.priority - b.priority);

  return mandatoryRules.map((rule) => rule.computeKey(candidate)).join('|');
}

/**
 * Compute individual rule keys for a candidate (for diagnostics/display).
 */
export function computeRuleKeys(
  candidate: AggregationCandidate,
  rules: AggregationRule[] = BLOTTER_AGGREGATION_RULES,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rule of rules.sort((a, b) => a.priority - b.priority)) {
    result[rule.code] = rule.computeKey(candidate);
  }
  return result;
}

/**
 * Validate whether a set of candidates can be aggregated together.
 * Returns violations for any rules that would be broken.
 */
export function validateAggregationCompatibility(
  candidates: AggregationCandidate[],
  rules: AggregationRule[] = BLOTTER_AGGREGATION_RULES,
): AggregationViolation[] {
  if (candidates.length <= 1) return [];

  const violations: AggregationViolation[] = [];
  const referenceCandidate = candidates[0];
  const mandatoryRules = rules
    .filter((r) => r.enforcement === 'MANDATORY')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of mandatoryRules) {
    const referenceKey = rule.computeKey(referenceCandidate);
    for (let i = 1; i < candidates.length; i++) {
      const candidateKey = rule.computeKey(candidates[i]);
      if (candidateKey !== referenceKey) {
        violations.push({
          ruleCode: rule.code,
          ruleDescription: rule.description,
          enforcement: rule.enforcement,
          candidateId: candidates[i].id,
          expectedValue: referenceKey,
          actualValue: candidateKey,
        });
      }
    }
  }

  // Also check advisory rules
  const advisoryRules = rules.filter((r) => r.enforcement === 'ADVISORY');
  for (const rule of advisoryRules) {
    const referenceKey = rule.computeKey(referenceCandidate);
    for (let i = 1; i < candidates.length; i++) {
      const candidateKey = rule.computeKey(candidates[i]);
      if (candidateKey !== referenceKey) {
        violations.push({
          ruleCode: rule.code,
          ruleDescription: rule.description,
          enforcement: rule.enforcement,
          candidateId: candidates[i].id,
          expectedValue: referenceKey,
          actualValue: candidateKey,
        });
      }
    }
  }

  return violations;
}

/**
 * Assert that all candidates can be aggregated — throws ValidationError if not.
 */
export function assertAggregationCompatible(
  candidates: AggregationCandidate[],
  rules: AggregationRule[] = BLOTTER_AGGREGATION_RULES,
): void {
  const violations = validateAggregationCompatibility(candidates, rules);
  const mandatory = violations.filter((v) => v.enforcement === 'MANDATORY');
  if (mandatory.length > 0) {
    const summary = mandatory
      .slice(0, 5)
      .map((v) => `[${v.ruleCode}] rec#${v.candidateId}: expected=${v.expectedValue}, got=${v.actualValue}`)
      .join('; ');
    throw new ValidationError(
      `Cannot aggregate orders: ${mandatory.length} rule violation(s). ${summary}`,
    );
  }
}

/**
 * Bucket a set of candidates into aggregation-compatible groups.
 * This is the main entry point for the COT collection process.
 */
export function bucketByAggregationRules(
  candidates: AggregationCandidate[],
  params: { minimumCollectiveAmount?: number } = {},
  rules: AggregationRule[] = BLOTTER_AGGREGATION_RULES,
): AggregationResult {
  const buckets = new Map<string, AggregationBucket>();
  const violations: AggregationViolation[] = [];

  for (const candidate of candidates) {
    const compositeKey = computeAggregationKey(candidate, rules);
    const ruleKeys = computeRuleKeys(candidate, rules);
    const nominal = Number(candidate.nominal_amount) || 0;
    const cost = Number(candidate.order_cost_before_swap) || 0;
    const minimum = Number(candidate.minimum_collective_amount) || params.minimumCollectiveAmount || 0;

    const existing = buckets.get(compositeKey);
    if (existing) {
      existing.totalNominal += nominal;
      existing.orderCostBeforeSwap += cost;
      existing.orderCount += 1;
      existing.minimumCollectiveAmount = Math.max(existing.minimumCollectiveAmount, minimum);
      existing.recommendationIds.push(candidate.id);
    } else {
      buckets.set(compositeKey, {
        key: compositeKey,
        ruleKeys,
        direction: (candidate.direction || 'BUY').toUpperCase(),
        currencyPair: (candidate.currency_pair || '').toUpperCase(),
        effectiveType: (candidate.effective_type || 'INTRADAY').toUpperCase(),
        odaType: (candidate.oda_type || 'SINGLE').toUpperCase(),
        tenorDays: candidate.tenor_days ?? 1,
        valueDate: candidate.value_date || null,
        customerType: (candidate.customer_type || 'INDIVIDUAL').toUpperCase(),
        rate: Number(candidate.rate) || 0,
        channel: (candidate.channel || 'OEMS_DIRECT').toUpperCase(),
        productId: candidate.product_id ?? null,
        totalNominal: nominal,
        orderCostBeforeSwap: cost,
        orderCount: 1,
        minimumCollectiveAmount: minimum,
        recommendationIds: [candidate.id],
      });
    }
  }

  // Check advisory violations across the entire input
  const advisoryRules = rules.filter((r) => r.enforcement === 'ADVISORY');
  if (advisoryRules.length > 0 && candidates.length > 1) {
    const referenceCandidate = candidates[0];
    for (const rule of advisoryRules) {
      const referenceKey = rule.computeKey(referenceCandidate);
      for (let i = 1; i < candidates.length; i++) {
        const candidateKey = rule.computeKey(candidates[i]);
        if (candidateKey !== referenceKey) {
          violations.push({
            ruleCode: rule.code,
            ruleDescription: rule.description,
            enforcement: rule.enforcement,
            candidateId: candidates[i].id,
            expectedValue: referenceKey,
            actualValue: candidateKey,
          });
          break; // One violation per advisory rule is enough
        }
      }
    }
  }

  return {
    buckets: [...buckets.values()],
    violations,
    rulesApplied: rules.map((r) => r.code),
  };
}

/**
 * Return the list of rules as a serializable array (for API/UI display).
 */
export function listAggregationRules(): Array<{
  code: string;
  description: string;
  priority: number;
  enforcement: string;
}> {
  return BLOTTER_AGGREGATION_RULES
    .sort((a, b) => a.priority - b.priority)
    .map(({ code, description, priority, enforcement }) => ({
      code,
      description,
      priority,
      enforcement,
    }));
}
