import { describe, expect, it } from 'vitest';
import { validateAndNormalizeTrustRelatedParties } from '../../server/services/trust-related-party-policy';

describe('trust related-party onboarding policy', () => {
  it('flags 25 percent UBOs for screening and keeps ownership evidence', () => {
    const result = validateAndNormalizeTrustRelatedParties([
      {
        local_id: 'ana',
        party_type: 'UBO',
        legal_name: 'Ana Reyes',
        ownership_pct: '30',
      },
      {
        local_id: 'ben',
        party_type: 'AUTHORIZED_SIGNATORY',
        legal_name: 'Ben Santos',
        authority_scope: { instructions: true },
        authority_document_ref: 'BOARD-RES-001',
        effective_from: '2026-05-04',
        signing_limit: '5000000',
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.summary.uboThresholdPartyCount).toBe(1);
    expect(result.parties[0]).toMatchObject({
      is_ubo: true,
      ubo_threshold_flag: true,
      screening_required: true,
      control_type: 'BENEFICIAL_OWNERSHIP',
    });
  });

  it('warns when no shareholder reaches the 25 percent threshold', () => {
    const parties = Array.from({ length: 10 }, (_, index) => ({
      local_id: `owner-${index + 1}`,
      party_type: 'BENEFICIARY' as const,
      legal_name: `Owner ${index + 1}`,
      ownership_pct: '10',
    }));

    const result = validateAndNormalizeTrustRelatedParties([
      ...parties,
      {
        local_id: 'signer',
        party_type: 'AUTHORIZED_SIGNATORY',
        legal_name: 'Corporate Secretary',
        authority_scope: { instructions: true },
        authority_document_ref: 'SEC-CERT-001',
        effective_from: '2026-05-04',
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('No shareholder meets 25%; disclose control basis and route for Compliance review');
    expect(result.summary.complianceReviewRequiredCount).toBe(10);
    expect(result.parties.filter((party) => party.compliance_review_required)).toHaveLength(10);
  });

  it('blocks authorized signatories without authority evidence', () => {
    const result = validateAndNormalizeTrustRelatedParties([
      {
        local_id: 'signer',
        party_type: 'AUTHORIZED_SIGNATORY',
        legal_name: 'Missing Authority',
        authority_scope: { instructions: true },
      },
    ]);

    expect(result.errors).toContain('Missing Authority requires authority_document_ref');
    expect(result.errors).toContain('Missing Authority requires effective_from');
  });

  it('blocks invalid ownership totals and effective-date windows', () => {
    const result = validateAndNormalizeTrustRelatedParties([
      {
        local_id: 'owner-a',
        party_type: 'UBO',
        legal_name: 'Owner A',
        ownership_pct: '60',
      },
      {
        local_id: 'owner-b',
        party_type: 'UBO',
        legal_name: 'Owner B',
        ownership_pct: '50',
      },
      {
        local_id: 'signer',
        party_type: 'AUTHORIZED_SIGNATORY',
        legal_name: 'Expired Signer',
        authority_scope: { instructions: true },
        authority_document_ref: 'BOARD-RES-002',
        effective_from: '2026-05-05',
        effective_to: '2026-05-04',
      },
    ]);

    expect(result.errors).toContain('Related-party ownership total 110 exceeds 100');
    expect(result.errors).toContain('Expired Signer effective_to cannot be before effective_from');
  });

  it('validates ownership hierarchy references and cycle risk', () => {
    const result = validateAndNormalizeTrustRelatedParties([
      {
        local_id: 'holdco',
        parent_local_id: 'subsidiary',
        party_type: 'RELATED_ENTITY',
        legal_name: 'HoldCo',
        ownership_pct: '60',
      },
      {
        local_id: 'subsidiary',
        parent_local_id: 'holdco',
        party_type: 'UBO',
        legal_name: 'Subsidiary Owner',
        ownership_pct: '40',
      },
      {
        local_id: 'signer',
        party_type: 'AUTHORIZED_SIGNATORY',
        legal_name: 'Signer',
        authority_scope: { instructions: true },
        authority_document_ref: 'BOARD-RES-003',
        effective_from: '2026-05-04',
      },
    ]);

    expect(result.errors).toContain('Ownership hierarchy cycle detected at holdco');
  });
});
