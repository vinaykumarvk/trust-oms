import { describe, expect, it } from 'vitest';
import {
  validateEffectiveDateWindow,
  validatePricingDefinitionWindows,
} from '../../server/services/pricing-window-validation-service';

describe('pricing window validation', () => {
  it('accepts contiguous open-ended slab tiers', () => {
    const errors = validatePricingDefinitionWindows({
      pricing_type: 'SLAB_CUMULATIVE_RATE',
      pricing_tiers: [
        { from: 0, to: 1_000_000, rate: 0.2 },
        { from: 1_000_000, to: 5_000_000, rate: 0.15 },
        { from: 5_000_000, to: 0, rate: 0.1 },
      ],
    });

    expect(errors).toEqual([]);
  });

  it('rejects slab tier gaps and overlaps', () => {
    const gapErrors = validatePricingDefinitionWindows({
      pricing_type: 'SLAB_CUMULATIVE_RATE',
      pricing_tiers: [
        { from: 0, to: 1_000_000, rate: 0.2 },
        { from: 2_000_000, to: 0, rate: 0.1 },
      ],
    });
    const overlapErrors = validatePricingDefinitionWindows({
      pricing_type: 'SLAB_INCREMENTAL_AMOUNT',
      pricing_tiers: [
        { from: 0, to: 1_000_000, amount: 1000 },
        { from: 900_000, to: 0, amount: 1500 },
      ],
    });

    expect(gapErrors.some((error) => error.includes('gap or overlap'))).toBe(true);
    expect(overlapErrors.some((error) => error.includes('gap or overlap'))).toBe(true);
  });

  it('rejects invalid slab bounds and missing open-ended final coverage', () => {
    const errors = validatePricingDefinitionWindows({
      pricing_type: 'SLAB_CUMULATIVE_RATE',
      pricing_tiers: [
        { from: 0, to: 1_000_000, rate: 0.2 },
        { from: 1_000_000, to: 500_000, rate: 0.1 },
      ],
    });

    expect(errors).toContain('Pricing tier 2 from (1000000) must be less than to (500000)');
    expect(errors).toContain('SLAB_CUMULATIVE_RATE requires an open-ended final tier to cover the configured billing base');
  });

  it('rejects step-function window gaps and missing amounts', () => {
    const errors = validatePricingDefinitionWindows({
      pricing_type: 'STEP_FUNCTION',
      step_windows: [
        { from_month: 0, to_month: 6, amount: 250 },
        { from_month: 7, to_month: 0 },
      ],
    });

    expect(errors).toContain('Step window 2 creates gap or overlap: expected from_month 6, received 7');
    expect(errors).toContain('Step window 2 requires amount');
  });

  it('accepts contiguous open-ended step-function windows', () => {
    const errors = validatePricingDefinitionWindows({
      pricing_type: 'STEP_FUNCTION',
      step_windows: [
        { from_month: 0, to_month: 6, amount: 250 },
        { from_month: 6, to_month: 12, amount: 500 },
        { from_month: 12, to_month: 0, amount: 750 },
      ],
    });

    expect(errors).toEqual([]);
  });

  it('rejects invalid fee-plan effective periods', () => {
    const errors = validateEffectiveDateWindow({
      effective_date: '2026-12-31',
      expiry_date: '2026-01-01',
      label: 'Fee plan effective window',
    });

    expect(errors).toContain('Fee plan effective window expiry_date cannot be before effective_date');
  });
});
