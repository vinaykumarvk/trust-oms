import { describe, expect, it } from 'vitest';

import {
  normalizeAssetClassCode,
  summarizeAllocationByRiskCategory,
  validateAssetAllocationTaxonomy,
} from '../../server/services/asset-allocation-taxonomy-policy';

describe('Asset allocation taxonomy policy', () => {
  const references = [
    { id: 1, code: 'EQUITY', name: 'Equity', is_deleted: false },
    { id: 2, code: 'FIXED_INCOME', name: 'Fixed Income', is_deleted: false },
    { id: 3, code: 'DEPRECATED_CLASS', name: 'Deprecated', is_deleted: true },
  ];

  it('normalizes user-entered asset class labels to taxonomy codes', () => {
    expect(normalizeAssetClassCode('fixed income')).toBe('FIXED_INCOME');
    expect(normalizeAssetClassCode('money-market')).toBe('MONEY_MARKET');
  });

  it('binds allocation lines to approved asset class references', () => {
    const result = validateAssetAllocationTaxonomy(
      [
        {
          risk_category: 'MODERATE',
          asset_class: 'fixed income',
          allocation_percentage: '40',
        },
      ],
      references,
      new Date('2026-05-04T00:00:00.000Z'),
    );

    expect(result.valid).toBe(true);
    expect(result.lines[0]).toMatchObject({
      asset_class: 'FIXED_INCOME',
      asset_class_id: 2,
      asset_class_code: 'FIXED_INCOME',
    });
    expect(result.lines[0].taxonomy_snapshot).toEqual({
      asset_class_id: 2,
      asset_class_code: 'FIXED_INCOME',
      asset_class_name: 'Fixed Income',
      taxonomy_source: 'asset_classes',
      validated_at: '2026-05-04T00:00:00.000Z',
    });
  });

  it('rejects unknown or deleted asset class references', () => {
    const result = validateAssetAllocationTaxonomy(
      [
        { risk_category: 'AGGRESSIVE', asset_class: 'crypto', allocation_percentage: '10' },
        { risk_category: 'AGGRESSIVE', asset_class: 'DEPRECATED_CLASS', allocation_percentage: '10' },
      ],
      references,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain('not in the approved asset class taxonomy');
  });

  it('summarizes allocation percentage by risk category for review screens', () => {
    const summary = summarizeAllocationByRiskCategory([
      { risk_category: 'moderate', allocation_percentage: '60' },
      { risk_category: 'MODERATE', allocation_percentage: '40' },
      { risk_category: 'AGGRESSIVE', allocation_percentage: '100' },
    ]);

    expect(summary).toEqual({ MODERATE: 100, AGGRESSIVE: 100 });
  });
});
