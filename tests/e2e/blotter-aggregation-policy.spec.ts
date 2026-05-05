import { describe, expect, it } from 'vitest';
import {
  assertAggregationCompatible,
  bucketByAggregationRules,
  BLOTTER_AGGREGATION_RULES,
  computeAggregationKey,
  listAggregationRules,
  validateAggregationCompatibility,
  type AggregationCandidate,
} from '../../server/services/blotter-aggregation-policy';
import { ValidationError } from '../../server/services/service-errors';

function makeCandidate(overrides: Partial<AggregationCandidate> & { id: number }): AggregationCandidate {
  return {
    direction: 'BUY',
    currency_pair: 'USD/IDR',
    effective_type: 'INTRADAY',
    oda_type: 'SINGLE',
    tenor_days: 1,
    value_date: '2026-05-05',
    customer_type: 'INDIVIDUAL',
    rate: '16250.00',
    channel: 'OEMS_DIRECT',
    product_id: 1,
    nominal_amount: '500000000',
    minimum_collective_amount: '1000000000',
    order_cost_before_swap: '10000000',
    ...overrides,
  };
}

describe('Blotter Aggregation Policy', () => {
  it('defines 10 aggregation rules with correct priorities and enforcement', () => {
    const rules = listAggregationRules();
    expect(rules).toHaveLength(10);
    expect(rules[0].code).toBe('DIRECTION_SEGREGATION');
    expect(rules[0].enforcement).toBe('MANDATORY');
    expect(rules[9].code).toBe('CHANNEL_SEGREGATION');
    expect(rules[9].enforcement).toBe('ADVISORY');

    // All mandatory except channel
    const mandatory = rules.filter(r => r.enforcement === 'MANDATORY');
    expect(mandatory).toHaveLength(9);
  });

  describe('DIRECTION_SEGREGATION', () => {
    it('prevents BUY and SELL orders from being aggregated', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, direction: 'BUY' }),
        makeCandidate({ id: 2, direction: 'SELL' }),
      ]);
      const mandatory = violations.filter(v => v.enforcement === 'MANDATORY');
      expect(mandatory.length).toBeGreaterThan(0);
      expect(mandatory.some(v => v.ruleCode === 'DIRECTION_SEGREGATION')).toBe(true);
    });
  });

  describe('CURRENCY_PAIR_SEGREGATION', () => {
    it('prevents orders for different currency pairs from being aggregated', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, currency_pair: 'USD/IDR' }),
        makeCandidate({ id: 2, currency_pair: 'EUR/IDR' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'CURRENCY_PAIR_SEGREGATION')).toBe(true);
    });
  });

  describe('EFFECTIVE_TYPE_SEGREGATION', () => {
    it('prevents INTRADAY and OVERNIGHT orders from being mixed', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, effective_type: 'INTRADAY' }),
        makeCandidate({ id: 2, effective_type: 'OVERNIGHT' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'EFFECTIVE_TYPE_SEGREGATION')).toBe(true);
    });

    it('prevents INTRADAY and GOOD_TILL_DATE orders from being mixed', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, effective_type: 'INTRADAY' }),
        makeCandidate({ id: 2, effective_type: 'GOOD_TILL_DATE' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'EFFECTIVE_TYPE_SEGREGATION')).toBe(true);
    });
  });

  describe('ODA_TYPE_SEGREGATION', () => {
    it('prevents SINGLE orders from being mixed with IF_DONE orders', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, oda_type: 'SINGLE' }),
        makeCandidate({ id: 2, oda_type: 'IF_DONE' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'ODA_TYPE_SEGREGATION')).toBe(true);
    });

    it('prevents SINGLE orders from being mixed with OCO orders', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, oda_type: 'SINGLE' }),
        makeCandidate({ id: 2, oda_type: 'OCO' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'ODA_TYPE_SEGREGATION')).toBe(true);
    });

    it('prevents IF_DONE and OCO from being mixed', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, oda_type: 'IF_DONE' }),
        makeCandidate({ id: 2, oda_type: 'OCO' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'ODA_TYPE_SEGREGATION')).toBe(true);
    });
  });

  describe('TENOR_SEGREGATION', () => {
    it('prevents orders with different tenors from being aggregated', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, tenor_days: 1 }),
        makeCandidate({ id: 2, tenor_days: 7 }),
      ]);
      expect(violations.some(v => v.ruleCode === 'TENOR_SEGREGATION')).toBe(true);
    });
  });

  describe('VALUE_DATE_SEGREGATION', () => {
    it('prevents orders with different value dates from being aggregated', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, value_date: '2026-05-05' }),
        makeCandidate({ id: 2, value_date: '2026-05-06' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'VALUE_DATE_SEGREGATION')).toBe(true);
    });
  });

  describe('CUSTOMER_TYPE_SEGREGATION', () => {
    it('prevents individual and institutional orders from being mixed', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, customer_type: 'INDIVIDUAL' }),
        makeCandidate({ id: 2, customer_type: 'INSTITUTIONAL' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'CUSTOMER_TYPE_SEGREGATION')).toBe(true);
    });
  });

  describe('RATE_BAND_SEGREGATION', () => {
    it('prevents orders with different target rates from being grouped', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, rate: '16250.00' }),
        makeCandidate({ id: 2, rate: '16300.00' }),
      ]);
      expect(violations.some(v => v.ruleCode === 'RATE_BAND_SEGREGATION')).toBe(true);
    });
  });

  describe('PRODUCT_SEGREGATION', () => {
    it('prevents orders from different products from being aggregated', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, product_id: 1 }),
        makeCandidate({ id: 2, product_id: 2 }),
      ]);
      expect(violations.some(v => v.ruleCode === 'PRODUCT_SEGREGATION')).toBe(true);
    });
  });

  describe('CHANNEL_SEGREGATION (advisory)', () => {
    it('flags channel mismatch as advisory (not mandatory)', () => {
      const violations = validateAggregationCompatibility([
        makeCandidate({ id: 1, channel: 'OEMS_DIRECT' }),
        makeCandidate({ id: 2, channel: 'BRANCH' }),
      ]);
      const channelViolations = violations.filter(v => v.ruleCode === 'CHANNEL_SEGREGATION');
      expect(channelViolations.length).toBeGreaterThan(0);
      expect(channelViolations[0].enforcement).toBe('ADVISORY');
    });

    it('does not block aggregation due to advisory channel mismatch', () => {
      expect(() => assertAggregationCompatible([
        makeCandidate({ id: 1, channel: 'OEMS_DIRECT' }),
        makeCandidate({ id: 2, channel: 'BRANCH' }),
      ])).not.toThrow();
    });
  });

  describe('assertAggregationCompatible', () => {
    it('passes when all orders are identical across mandatory dimensions', () => {
      expect(() => assertAggregationCompatible([
        makeCandidate({ id: 1 }),
        makeCandidate({ id: 2 }),
        makeCandidate({ id: 3 }),
      ])).not.toThrow();
    });

    it('throws ValidationError when mandatory rules are violated', () => {
      expect(() => assertAggregationCompatible([
        makeCandidate({ id: 1, direction: 'BUY' }),
        makeCandidate({ id: 2, direction: 'SELL' }),
      ])).toThrow(ValidationError);
    });

    it('includes rule code and details in error message', () => {
      try {
        assertAggregationCompatible([
          makeCandidate({ id: 1, direction: 'BUY', currency_pair: 'USD/IDR' }),
          makeCandidate({ id: 2, direction: 'SELL', currency_pair: 'EUR/IDR' }),
        ]);
      } catch (err: any) {
        expect(err.message).toContain('DIRECTION_SEGREGATION');
        expect(err.message).toContain('rule violation');
      }
    });
  });

  describe('bucketByAggregationRules', () => {
    it('groups compatible orders into the same bucket', () => {
      const result = bucketByAggregationRules([
        makeCandidate({ id: 1, nominal_amount: '500000000' }),
        makeCandidate({ id: 2, nominal_amount: '700000000' }),
        makeCandidate({ id: 3, nominal_amount: '300000000' }),
      ]);
      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0].orderCount).toBe(3);
      expect(result.buckets[0].totalNominal).toBe(1_500_000_000);
      expect(result.buckets[0].recommendationIds).toEqual([1, 2, 3]);
    });

    it('separates incompatible orders into different buckets', () => {
      const result = bucketByAggregationRules([
        makeCandidate({ id: 1, direction: 'BUY', currency_pair: 'USD/IDR' }),
        makeCandidate({ id: 2, direction: 'SELL', currency_pair: 'USD/IDR' }),
        makeCandidate({ id: 3, direction: 'BUY', currency_pair: 'EUR/IDR' }),
        makeCandidate({ id: 4, direction: 'BUY', currency_pair: 'USD/IDR' }),
      ]);
      expect(result.buckets).toHaveLength(3);

      const buyUsd = result.buckets.find(b => b.direction === 'BUY' && b.currencyPair === 'USD/IDR');
      const sellUsd = result.buckets.find(b => b.direction === 'SELL' && b.currencyPair === 'USD/IDR');
      const buyEur = result.buckets.find(b => b.direction === 'BUY' && b.currencyPair === 'EUR/IDR');

      expect(buyUsd!.recommendationIds).toEqual([1, 4]);
      expect(sellUsd!.recommendationIds).toEqual([2]);
      expect(buyEur!.recommendationIds).toEqual([3]);
    });

    it('separates by effective type (INTRADAY vs OVERNIGHT)', () => {
      const result = bucketByAggregationRules([
        makeCandidate({ id: 1, effective_type: 'INTRADAY' }),
        makeCandidate({ id: 2, effective_type: 'OVERNIGHT' }),
        makeCandidate({ id: 3, effective_type: 'INTRADAY' }),
      ]);
      expect(result.buckets).toHaveLength(2);
      const intraday = result.buckets.find(b => b.effectiveType === 'INTRADAY');
      expect(intraday!.recommendationIds).toEqual([1, 3]);
    });

    it('separates SINGLE from structured orders (IF_DONE, OCO)', () => {
      const result = bucketByAggregationRules([
        makeCandidate({ id: 1, oda_type: 'SINGLE' }),
        makeCandidate({ id: 2, oda_type: 'IF_DONE' }),
        makeCandidate({ id: 3, oda_type: 'SINGLE' }),
        makeCandidate({ id: 4, oda_type: 'OCO' }),
      ]);
      expect(result.buckets).toHaveLength(3);
    });

    it('evaluates minimum collective amount per bucket', () => {
      const result = bucketByAggregationRules([
        makeCandidate({ id: 1, nominal_amount: '300000000', minimum_collective_amount: '1000000000' }),
        makeCandidate({ id: 2, nominal_amount: '400000000', minimum_collective_amount: '500000000' }),
      ], { minimumCollectiveAmount: 500_000_000 });

      expect(result.buckets[0].minimumCollectiveAmount).toBe(1_000_000_000);
      expect(result.buckets[0].totalNominal).toBe(700_000_000);
    });

    it('includes rules applied in the result', () => {
      const result = bucketByAggregationRules([makeCandidate({ id: 1 })]);
      expect(result.rulesApplied).toContain('DIRECTION_SEGREGATION');
      expect(result.rulesApplied).toContain('CURRENCY_PAIR_SEGREGATION');
      expect(result.rulesApplied).toContain('EFFECTIVE_TYPE_SEGREGATION');
      expect(result.rulesApplied).toContain('ODA_TYPE_SEGREGATION');
      expect(result.rulesApplied).toContain('TENOR_SEGREGATION');
      expect(result.rulesApplied).toContain('VALUE_DATE_SEGREGATION');
      expect(result.rulesApplied).toContain('CUSTOMER_TYPE_SEGREGATION');
      expect(result.rulesApplied).toContain('RATE_BAND_SEGREGATION');
      expect(result.rulesApplied).toContain('PRODUCT_SEGREGATION');
      expect(result.rulesApplied).toContain('CHANNEL_SEGREGATION');
    });
  });

  describe('computeAggregationKey', () => {
    it('produces identical keys for compatible orders', () => {
      const key1 = computeAggregationKey(makeCandidate({ id: 1 }));
      const key2 = computeAggregationKey(makeCandidate({ id: 2 }));
      expect(key1).toBe(key2);
    });

    it('produces different keys when any mandatory dimension differs', () => {
      const base = makeCandidate({ id: 1 });
      const diffDirection = makeCandidate({ id: 2, direction: 'SELL' });
      const diffPair = makeCandidate({ id: 3, currency_pair: 'EUR/IDR' });
      const diffTenor = makeCandidate({ id: 4, tenor_days: 7 });

      const baseKey = computeAggregationKey(base);
      expect(computeAggregationKey(diffDirection)).not.toBe(baseKey);
      expect(computeAggregationKey(diffPair)).not.toBe(baseKey);
      expect(computeAggregationKey(diffTenor)).not.toBe(baseKey);
    });
  });

  describe('integration with OEMS service', () => {
    it('the blotter-aggregation-policy module is imported by oems-service', () => {
      const { readFileSync } = require('fs');
      const source = readFileSync('server/services/oems-service.ts', 'utf8');
      expect(source).toContain("from './blotter-aggregation-policy'");
      expect(source).toContain('bucketByAggregationRules');
      expect(source).toContain('assertAggregationCompatible');
      expect(source).toContain('blotter_aggregation_policy_v1');
    });

    it('the aggregation rules API route is registered', () => {
      const { readFileSync } = require('fs');
      const source = readFileSync('server/routes/oems.ts', 'utf8');
      expect(source).toContain("router.get('/oda/aggregation-rules'");
      expect(source).toContain("router.post('/oda/aggregation-validate'");
    });
  });
});
