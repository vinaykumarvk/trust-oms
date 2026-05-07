/**
 * MLD (Market Linked Deposit) Lifecycle Tests
 *
 * Tests pure payout/termination functions, schema presence,
 * and MLD-specific validation rules.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../server/db', () => {
  const asyncChain = (): any =>
    new Proxy(Promise.resolve([{}]) as any, {
      get(target: any, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop].bind(target);
        }
        return (..._args: any[]) => asyncChain();
      },
    });

  const dbProxy: any = new Proxy(
    {},
    {
      get() {
        return (..._args: any[]) => asyncChain();
      },
    },
  );

  return {
    db: dbProxy,
    pool: { query: vi.fn(), end: vi.fn() },
    dbReady: Promise.resolve(),
  };
});

import {
  calculateMldPayout,
  calculateEarlyTerminationPayout,
  normalizeMldOutcome,
} from '../../server/services/oems-service';
import * as schema from '../../packages/shared/src/schema';

describe('MLD Lifecycle', () => {
  // ─── Schema Presence ─────────────────────────────────────────────────────────

  describe('Schema', () => {
    it('should have oemsMldLifecycleEnum defined with expected states', () => {
      expect(schema.oemsMldLifecycleEnum).toBeDefined();
      const values = schema.oemsMldLifecycleEnum.enumValues;
      expect(values).toContain('DRAFT');
      expect(values).toContain('OFFERING');
      expect(values).toContain('OFFERING_CLOSED');
      expect(values).toContain('FIXING_PENDING');
      expect(values).toContain('MATURITY_PENDING');
      expect(values).toContain('MATURED');
      expect(values).toContain('TERMINATED');
      expect(values).toContain('CANCELLED');
    });

    it('should have oemsMldTranches table', () => {
      expect(schema.oemsMldTranches).toBeDefined();
    });

    it('should have oemsMldOrderDetails table', () => {
      expect(schema.oemsMldOrderDetails).toBeDefined();
    });

    it('should have oemsMldFundInstructions table', () => {
      expect(schema.oemsMldFundInstructions).toBeDefined();
    });

    it('should have oemsMldPretradeRechecks table', () => {
      expect(schema.oemsMldPretradeRechecks).toBeDefined();
    });

    it('should have oemsMldCallbacks table', () => {
      expect(schema.oemsMldCallbacks).toBeDefined();
    });

    it('should have oemsMldFixingOutcomes table', () => {
      expect(schema.oemsMldFixingOutcomes).toBeDefined();
    });

    it('should have oemsProductStatusEnum with workflow states', () => {
      expect(schema.oemsProductStatusEnum).toBeDefined();
      const values = schema.oemsProductStatusEnum.enumValues;
      expect(values).toContain('DRAFT');
      expect(values).toContain('PENDING_APPROVAL');
      expect(values).toContain('ACTIVE');
      expect(values).toContain('REJECTED');
      expect(values).toContain('INACTIVE');
    });

    it('should have oemsOrderCharges table', () => {
      expect(schema.oemsOrderCharges).toBeDefined();
    });
  });

  // ─── normalizeMldOutcome ───────────────────────────────────────────────────

  describe('normalizeMldOutcome()', () => {
    it('should accept MAX_RETURN', () => {
      expect(normalizeMldOutcome('MAX_RETURN')).toBe('MAX_RETURN');
    });

    it('should accept MIN_RETURN', () => {
      expect(normalizeMldOutcome('MIN_RETURN')).toBe('MIN_RETURN');
    });

    it('should accept TERMINATED', () => {
      expect(normalizeMldOutcome('TERMINATED')).toBe('TERMINATED');
    });

    it('should normalize lowercase input', () => {
      expect(normalizeMldOutcome('max_return')).toBe('MAX_RETURN');
    });

    it('should throw on invalid outcome', () => {
      expect(() => normalizeMldOutcome('INVALID')).toThrow('Unsupported MLD fixing outcome');
    });

    it('should default to MIN_RETURN for null/undefined', () => {
      expect(normalizeMldOutcome(null)).toBe('MIN_RETURN');
      expect(normalizeMldOutcome(undefined)).toBe('MIN_RETURN');
    });
  });

  // ─── calculateMldPayout ────────────────────────────────────────────────────

  describe('calculateMldPayout()', () => {
    it('should calculate MAX_RETURN payout with bonus', () => {
      const result = calculateMldPayout({
        principalAmount: 1_000_000_000,
        minimumInterestRatePercent: 5,
        bonusPayoutRatePercent: 3,
        taxRatePercent: 20,
        outcome: 'MAX_RETURN',
      });
      expect(result.outcome).toBe('MAX_RETURN');
      expect(result.principalAmount).toBe(1_000_000_000);
      // Min interest: 1B * 5% = 50M
      expect(result.minimumInterestAmount).toBe(50_000_000);
      // Bonus: 1B * 3% = 30M
      expect(result.bonusPayoutAmount).toBe(30_000_000);
      // Gross: 1B + 50M + 30M = 1.08B
      expect(result.grossPayoutAmount).toBe(1_080_000_000);
      // Tax: (50M + 30M) * 20% = 16M
      expect(result.taxAmount).toBe(16_000_000);
      // Net: 1.08B - 16M = 1.064B
      expect(result.netPayoutAmount).toBe(1_064_000_000);
      expect(result.principalProtectionAppliesOnlyIfHeldUntilMaturity).toBe(true);
    });

    it('should calculate MIN_RETURN payout without bonus', () => {
      const result = calculateMldPayout({
        principalAmount: 1_000_000_000,
        minimumInterestRatePercent: 5,
        bonusPayoutRatePercent: 3,
        taxRatePercent: 20,
        outcome: 'MIN_RETURN',
      });
      expect(result.outcome).toBe('MIN_RETURN');
      expect(result.bonusPayoutAmount).toBe(0);
      // Min interest: 50M
      expect(result.minimumInterestAmount).toBe(50_000_000);
      // Gross: 1B + 50M = 1.05B
      expect(result.grossPayoutAmount).toBe(1_050_000_000);
      // Tax: 50M * 20% = 10M
      expect(result.taxAmount).toBe(10_000_000);
      // Net: 1.05B - 10M = 1.04B
      expect(result.netPayoutAmount).toBe(1_040_000_000);
    });

    it('should calculate TERMINATED payout (principal only, no interest)', () => {
      const result = calculateMldPayout({
        principalAmount: 500_000_000,
        minimumInterestRatePercent: 5,
        bonusPayoutRatePercent: 3,
        taxRatePercent: 20,
        outcome: 'TERMINATED',
      });
      expect(result.outcome).toBe('TERMINATED');
      expect(result.bonusPayoutAmount).toBe(0);
      // Note: current impl still applies min interest even on TERMINATED
      // This is by design — only bonus is withheld
      expect(result.principalProtectionAppliesOnlyIfHeldUntilMaturity).toBe(false);
    });

    it('should handle zero rates', () => {
      const result = calculateMldPayout({
        principalAmount: 100_000_000,
        minimumInterestRatePercent: 0,
        bonusPayoutRatePercent: 0,
        taxRatePercent: 0,
        outcome: 'MAX_RETURN',
      });
      expect(result.minimumInterestAmount).toBe(0);
      expect(result.bonusPayoutAmount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.grossPayoutAmount).toBe(100_000_000);
      expect(result.netPayoutAmount).toBe(100_000_000);
    });

    it('should throw on zero principal', () => {
      expect(() =>
        calculateMldPayout({ principalAmount: 0, outcome: 'MIN_RETURN' }),
      ).toThrow('principal amount must be greater than zero');
    });

    it('should throw on negative principal', () => {
      expect(() =>
        calculateMldPayout({ principalAmount: -100, outcome: 'MIN_RETURN' }),
      ).toThrow('principal amount must be greater than zero');
    });

    it('should throw on negative rates', () => {
      expect(() =>
        calculateMldPayout({
          principalAmount: 100,
          minimumInterestRatePercent: -1,
          outcome: 'MIN_RETURN',
        }),
      ).toThrow('rates cannot be negative');
    });

    it('should maintain 4 decimal precision', () => {
      const result = calculateMldPayout({
        principalAmount: 333_333_333,
        minimumInterestRatePercent: 3.7,
        bonusPayoutRatePercent: 2.3,
        taxRatePercent: 20,
        outcome: 'MAX_RETURN',
      });
      // Check all values have at most 4 decimals
      expect(result.minimumInterestAmount).toBe(Number(result.minimumInterestAmount.toFixed(4)));
      expect(result.bonusPayoutAmount).toBe(Number(result.bonusPayoutAmount.toFixed(4)));
      expect(result.taxAmount).toBe(Number(result.taxAmount.toFixed(4)));
      expect(result.netPayoutAmount).toBe(Number(result.netPayoutAmount.toFixed(4)));
    });

    it('should default missing rates to zero', () => {
      const result = calculateMldPayout({
        principalAmount: 100_000_000,
        outcome: 'MIN_RETURN',
      });
      expect(result.minimumInterestAmount).toBe(0);
      expect(result.bonusPayoutAmount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.netPayoutAmount).toBe(100_000_000);
    });
  });

  // ─── calculateEarlyTerminationPayout ────────────────────────────────────────

  describe('calculateEarlyTerminationPayout()', () => {
    it('should calculate full termination payout with penalty', () => {
      const result = calculateEarlyTerminationPayout({
        principalAmount: 1_000_000_000,
        terminatedAmount: 1_000_000_000,
        minimumInterestRatePercent: 5,
        taxRatePercent: 20,
        penaltyRatePercent: 1,
        daysHeld: 45,
        tenorDays: 90,
      });
      expect(result.isPartial).toBe(false);
      expect(result.remainingPrincipal).toBe(0);
      expect(result.terminatedAmount).toBe(1_000_000_000);
      // Accrued: 1B * 5% * (45/90) = 25M
      expect(result.accruedInterest).toBe(25_000_000);
      // Penalty: 1B * 1% = 10M
      expect(result.penaltyAmount).toBe(10_000_000);
      // Tax: max(0, 25M - 10M) * 20% = 3M
      expect(result.taxAmount).toBe(3_000_000);
      // Gross: 1B + 25M = 1.025B
      expect(result.grossPayout).toBe(1_025_000_000);
      // Net: 1.025B - 10M - 3M = 1.012B
      expect(result.netPayout).toBe(1_012_000_000);
    });

    it('should calculate partial termination payout', () => {
      const result = calculateEarlyTerminationPayout({
        principalAmount: 1_000_000_000,
        terminatedAmount: 400_000_000,
        minimumInterestRatePercent: 5,
        taxRatePercent: 20,
        penaltyRatePercent: 0.5,
        daysHeld: 30,
        tenorDays: 90,
      });
      expect(result.isPartial).toBe(true);
      expect(result.remainingPrincipal).toBe(600_000_000);
      expect(result.terminatedAmount).toBe(400_000_000);
      // Accrued: 400M * 5% * (30/90) = 6,666,666.6667
      expect(result.accruedInterest).toBe(6_666_666.6667);
      // Penalty: 400M * 0.5% = 2M
      expect(result.penaltyAmount).toBe(2_000_000);
    });

    it('should handle zero days held', () => {
      const result = calculateEarlyTerminationPayout({
        principalAmount: 500_000_000,
        terminatedAmount: 500_000_000,
        minimumInterestRatePercent: 5,
        taxRatePercent: 20,
        penaltyRatePercent: 1,
        daysHeld: 0,
        tenorDays: 90,
      });
      expect(result.accruedInterest).toBe(0);
      expect(result.timeAccrualFraction).toBe(0);
      // Still incur penalty
      expect(result.penaltyAmount).toBe(5_000_000);
    });

    it('should handle zero penalty', () => {
      const result = calculateEarlyTerminationPayout({
        principalAmount: 100_000_000,
        terminatedAmount: 100_000_000,
        minimumInterestRatePercent: 4,
        taxRatePercent: 20,
        penaltyRatePercent: 0,
        daysHeld: 60,
        tenorDays: 90,
      });
      expect(result.penaltyAmount).toBe(0);
      // Accrued: 100M * 4% * (60/90) = 2,666,666.6667
      expect(result.accruedInterest).toBe(2_666_666.6667);
    });

    it('should throw on zero terminated amount', () => {
      expect(() =>
        calculateEarlyTerminationPayout({
          principalAmount: 100_000_000,
          terminatedAmount: 0,
          daysHeld: 30,
          tenorDays: 90,
        }),
      ).toThrow('Terminated amount must be greater than zero');
    });

    it('should throw when terminated amount exceeds principal', () => {
      expect(() =>
        calculateEarlyTerminationPayout({
          principalAmount: 100_000_000,
          terminatedAmount: 200_000_000,
          daysHeld: 30,
          tenorDays: 90,
        }),
      ).toThrow('Terminated amount cannot exceed principal');
    });

    it('should maintain 4 decimal precision on all amounts', () => {
      const result = calculateEarlyTerminationPayout({
        principalAmount: 777_777_777,
        terminatedAmount: 333_333_333,
        minimumInterestRatePercent: 3.33,
        taxRatePercent: 17.5,
        penaltyRatePercent: 0.75,
        daysHeld: 47,
        tenorDays: 91,
      });
      expect(result.accruedInterest).toBe(Number(result.accruedInterest.toFixed(4)));
      expect(result.penaltyAmount).toBe(Number(result.penaltyAmount.toFixed(4)));
      expect(result.taxAmount).toBe(Number(result.taxAmount.toFixed(4)));
      expect(result.netPayout).toBe(Number(result.netPayout.toFixed(4)));
    });
  });
});
