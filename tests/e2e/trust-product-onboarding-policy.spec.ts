import { describe, expect, it } from 'vitest';

import {
  defaultMandateTypeForProduct,
  validateTrustProductOnboarding,
} from '../../server/services/trust-product-onboarding-policy';

describe('Trust product onboarding policy', () => {
  it('maps product types to product-specific default mandate types', () => {
    expect(defaultMandateTypeForProduct('IMA_DISCRETIONARY')).toBe('DISCRETIONARY');
    expect(defaultMandateTypeForProduct('IMA_DIRECTED')).toBe('DIRECTED');
    expect(defaultMandateTypeForProduct('ESCROW')).toBe('ESCROW');
    expect(defaultMandateTypeForProduct('SAFEKEEPING')).toBe('SAFEKEEPING');
  });

  it('passes standard discretionary IMA onboarding while recording missing risk-limit warnings', () => {
    const result = validateTrustProductOnboarding(
      {
        product_type: 'IMA_DISCRETIONARY',
        base_currency: 'PHP',
        mandate: { mandate_type: 'DISCRETIONARY', signing_rule: { required_signatories: 1 } },
        onboarding_reference: 'PROSPECT:1',
        related_parties: [
          {
            party_type: 'SETTLOR',
            legal_name: 'Maria Santos',
            is_authorized_signatory: true,
          },
        ],
      },
      new Date('2026-05-04T00:00:00.000Z'),
    );

    expect(result.status).toBe('PASSED_WITH_WARNINGS');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings[0]).toContain('risk_limits');
    expect(result.evidence).toMatchObject({
      product_type: 'IMA_DISCRETIONARY',
      mandate_type: 'DISCRETIONARY',
      base_currency: 'PHP',
      required_signatories: 1,
      document_reference_present: true,
      validated_at: '2026-05-04T00:00:00.000Z',
    });
  });

  it('blocks escrow onboarding without escrow mandate controls', () => {
    const result = validateTrustProductOnboarding({
      product_type: 'ESCROW',
      base_currency: 'PHP',
      mandate: { mandate_type: 'DISCRETIONARY', signing_rule: { required_signatories: 1 } },
      related_parties: [{ party_type: 'SETTLOR', legal_name: 'Depositor' }],
    });

    expect(result.status).toBe('FAILED');
    expect(result.errors).toContain('Product ESCROW requires mandate type ESCROW, received DISCRETIONARY');
    expect(result.errors).toContain('Product ESCROW requires at least 2 authorized signatories');
    expect(result.errors).toContain('Product ESCROW requires related party type BENEFICIARY');
    expect(result.errors).toContain('Product ESCROW requires mandate document reference');
  });

  it('requires employee benefit trust onboarding to include trustee/signatory evidence', () => {
    const result = validateTrustProductOnboarding({
      product_type: 'EMPLOYEE_BENEFIT',
      base_currency: 'PHP',
      mandate: {
        mandate_type: 'AGENCY',
        signing_rule: { required_signatories: 2 },
        document_reference: 'DOC-EBT-001',
      },
      related_parties: [{ party_type: 'BENEFICIARY', legal_name: 'Plan Member' }],
    });

    expect(result.status).toBe('FAILED');
    expect(result.errors).toContain('Product EMPLOYEE_BENEFIT requires related party type TRUSTEE');
    expect(result.errors).toContain('Product EMPLOYEE_BENEFIT requires related party type AUTHORIZED_SIGNATORY');
  });
});
