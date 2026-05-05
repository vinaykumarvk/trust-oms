export const UBO_THRESHOLD_PERCENT = 25;

export const TRUST_RELATED_PARTY_TYPES = [
  'SETTLOR',
  'BENEFICIARY',
  'TRUSTEE',
  'CO_TRUSTEE',
  'AUTHORIZED_SIGNATORY',
  'UBO',
  'GUARDIAN',
  'PROTECTOR',
  'RELATED_ENTITY',
  'OTHER',
] as const;

export type TrustRelatedPartyType = typeof TRUST_RELATED_PARTY_TYPES[number];

export interface TrustRelatedPartyPolicyInput {
  local_id?: string | null;
  party_reference?: string | null;
  parent_local_id?: string | null;
  parent_party_reference?: string | null;
  parent_party_id?: number | null;
  party_type: TrustRelatedPartyType;
  legal_name: string;
  client_id?: string | null;
  ownership_pct?: string | number | null;
  authority_scope?: Record<string, unknown> | null;
  signing_limit?: string | number | null;
  is_ubo?: boolean;
  is_authorized_signatory?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  relationship_to_account?: string | null;
  ownership_path?: unknown[] | null;
  control_type?: string | null;
  authority_document_ref?: string | null;
  authority_verified_at?: string | Date | null;
  authority_verified_by?: number | null;
  verification_status?: string | null;
  screening_status?: string | null;
  screening_case_ref?: string | null;
}

export interface TrustRelatedPartyPolicyOptions {
  uboThresholdPct?: number;
  minimumAuthorizedSignatories?: number;
  requireAuthorityDocument?: boolean;
  requireEffectiveFrom?: boolean;
}

export interface NormalizedTrustRelatedParty extends TrustRelatedPartyPolicyInput {
  party_reference: string | null;
  parent_party_reference: string | null;
  ownership_pct: string | null;
  signing_limit: string | null;
  is_ubo: boolean;
  is_authorized_signatory: boolean;
  effective_from: string | null;
  effective_to: string | null;
  ownership_path: unknown[];
  control_type: string | null;
  authority_document_ref: string | null;
  authority_verified_at: Date | null;
  authority_verified_by: number | null;
  verification_status: string;
  screening_status: string;
  screening_required: boolean;
  ubo_threshold_flag: boolean;
  compliance_review_required: boolean;
}

export interface TrustRelatedPartyValidationResult {
  parties: NormalizedTrustRelatedParty[];
  errors: string[];
  warnings: string[];
  summary: {
    authorizedSignatoryCount: number;
    uboThresholdPartyCount: number;
    complianceReviewRequiredCount: number;
    ownershipTotalPct: number;
  };
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDecimalText(value: string | number | null | undefined): string | null {
  const parsed = toNumber(value);
  return parsed === null ? null : String(parsed);
}

function isValidDateText(value: string | null | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasUsableAuthorityScope(scope: Record<string, unknown> | null | undefined): boolean {
  if (!scope || typeof scope !== 'object') return false;
  return Object.values(scope).some((value) => value === true);
}

function partyRef(party: TrustRelatedPartyPolicyInput, index: number): string | null {
  return blankToNull(party.party_reference ?? party.local_id ?? `party-${index + 1}`);
}

function parentRef(party: TrustRelatedPartyPolicyInput): string | null {
  return blankToNull(party.parent_party_reference ?? party.parent_local_id ?? null);
}

function buildOwnershipPath(
  party: TrustRelatedPartyPolicyInput,
  normalized: Map<string, NormalizedTrustRelatedParty>,
): unknown[] {
  if (Array.isArray(party.ownership_path) && party.ownership_path.length > 0) {
    return party.ownership_path;
  }

  const ref = blankToNull(party.party_reference ?? party.local_id ?? null);
  if (!ref) return [];

  const path: Array<Record<string, unknown>> = [];
  let current: NormalizedTrustRelatedParty | undefined = normalized.get(ref);
  const seen = new Set<string>();

  while (current?.party_reference && !seen.has(current.party_reference)) {
    seen.add(current.party_reference);
    path.unshift({
      party_reference: current.party_reference,
      legal_name: current.legal_name,
      party_type: current.party_type,
      ownership_pct: current.ownership_pct,
    });
    current = current.parent_party_reference ? normalized.get(current.parent_party_reference) : undefined;
  }

  return path;
}

function detectHierarchyErrors(parties: NormalizedTrustRelatedParty[]): string[] {
  const errors: string[] = [];
  const byRef = new Map<string, NormalizedTrustRelatedParty>();

  for (const party of parties) {
    if (!party.party_reference) continue;
    if (byRef.has(party.party_reference)) {
      errors.push(`Duplicate related-party reference ${party.party_reference}`);
    }
    byRef.set(party.party_reference, party);
  }

  for (const party of parties) {
    if (!party.parent_party_reference) continue;
    if (party.parent_party_reference === party.party_reference) {
      errors.push(`${party.legal_name} cannot reference itself as parent`);
    } else if (!byRef.has(party.parent_party_reference)) {
      errors.push(`${party.legal_name} references unknown parent ${party.parent_party_reference}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(ref: string): void {
    if (visited.has(ref)) return;
    if (visiting.has(ref)) {
      errors.push(`Ownership hierarchy cycle detected at ${ref}`);
      return;
    }
    visiting.add(ref);
    const parent = byRef.get(ref)?.parent_party_reference;
    if (parent) visit(parent);
    visiting.delete(ref);
    visited.add(ref);
  }

  for (const ref of byRef.keys()) visit(ref);
  return errors;
}

export function validateAndNormalizeTrustRelatedParties(
  parties: TrustRelatedPartyPolicyInput[],
  options: TrustRelatedPartyPolicyOptions = {},
): TrustRelatedPartyValidationResult {
  const threshold = options.uboThresholdPct ?? UBO_THRESHOLD_PERCENT;
  const minimumSignatories = Math.max(0, options.minimumAuthorizedSignatories ?? 1);
  const requireAuthorityDocument = options.requireAuthorityDocument ?? true;
  const requireEffectiveFrom = options.requireEffectiveFrom ?? true;
  const errors: string[] = [];
  const warnings: string[] = [];

  const normalized = parties.map((party, index): NormalizedTrustRelatedParty => {
    const legalName = blankToNull(party.legal_name);
    const ownershipPct = toNumber(party.ownership_pct);
    const signingLimit = toNumber(party.signing_limit);
    const isUbo = party.is_ubo ?? party.party_type === 'UBO';
    const isAuthorizedSignatory = party.is_authorized_signatory ?? party.party_type === 'AUTHORIZED_SIGNATORY';
    const uboThresholdFlag = ownershipPct !== null && ownershipPct >= threshold;
    const authorityDocumentRef = blankToNull(party.authority_document_ref);
    const effectiveFrom = blankToNull(party.effective_from);
    const effectiveTo = blankToNull(party.effective_to);
    const authorityVerifiedAt = toDate(party.authority_verified_at);
    const verificationStatus = blankToNull(party.verification_status)
      ?? (authorityVerifiedAt ? 'VERIFIED' : 'PENDING');

    if (!TRUST_RELATED_PARTY_TYPES.includes(party.party_type)) {
      errors.push(`Related party ${index + 1} has unsupported party_type ${String(party.party_type)}`);
    }
    if (!legalName) {
      errors.push(`Related party ${index + 1} requires legal_name`);
    }
    if (party.ownership_pct !== undefined && party.ownership_pct !== null && ownershipPct === null) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} has invalid ownership_pct`);
    }
    if (ownershipPct !== null && (ownershipPct < 0 || ownershipPct > 100)) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} ownership_pct must be between 0 and 100`);
    }
    if ((isUbo || party.party_type === 'UBO') && ownershipPct === null) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} requires ownership_pct for UBO capture`);
    }
    if (party.signing_limit !== undefined && party.signing_limit !== null && signingLimit === null) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} has invalid signing_limit`);
    }
    if (signingLimit !== null && signingLimit < 0) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} signing_limit cannot be negative`);
    }
    if (!isValidDateText(effectiveFrom)) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} has invalid effective_from`);
    }
    if (!isValidDateText(effectiveTo)) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} has invalid effective_to`);
    }
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} effective_to cannot be before effective_from`);
    }

    if (isAuthorizedSignatory) {
      if (requireAuthorityDocument && !authorityDocumentRef) {
        errors.push(`${legalName ?? `Related party ${index + 1}`} requires authority_document_ref`);
      }
      if (requireEffectiveFrom && !effectiveFrom) {
        errors.push(`${legalName ?? `Related party ${index + 1}`} requires effective_from`);
      }
      if (!hasUsableAuthorityScope(party.authority_scope)) {
        errors.push(`${legalName ?? `Related party ${index + 1}`} requires authority_scope`);
      }
    }

    if (verificationStatus === 'VERIFIED' && (!authorityDocumentRef || !authorityVerifiedAt || !party.authority_verified_by)) {
      errors.push(`${legalName ?? `Related party ${index + 1}`} verified authority requires document, verified_at, and verified_by`);
    }

    return {
      ...party,
      legal_name: legalName ?? '',
      party_reference: partyRef(party, index),
      parent_party_reference: parentRef(party),
      ownership_pct: toDecimalText(party.ownership_pct),
      signing_limit: toDecimalText(party.signing_limit),
      is_ubo: isUbo,
      is_authorized_signatory: isAuthorizedSignatory,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      ownership_path: [],
      control_type: blankToNull(party.control_type)
        ?? (isUbo ? 'BENEFICIAL_OWNERSHIP' : isAuthorizedSignatory ? 'SIGNING_AUTHORITY' : null),
      authority_document_ref: authorityDocumentRef,
      authority_verified_at: authorityVerifiedAt,
      authority_verified_by: party.authority_verified_by ?? null,
      verification_status: verificationStatus,
      screening_status: blankToNull(party.screening_status) ?? 'PENDING',
      screening_case_ref: blankToNull(party.screening_case_ref),
      screening_required: isUbo || uboThresholdFlag,
      ubo_threshold_flag: uboThresholdFlag,
      compliance_review_required: false,
    };
  });

  errors.push(...detectHierarchyErrors(normalized));

  const ownershipTotal = normalized.reduce((sum, party) => sum + (toNumber(party.ownership_pct) ?? 0), 0);
  if (ownershipTotal > 100.0001) {
    errors.push(`Related-party ownership total ${ownershipTotal} exceeds 100`);
  }

  const thresholdParties = normalized.filter((party) => party.ubo_threshold_flag);
  const partiesWithOwnership = normalized.filter((party) => toNumber(party.ownership_pct) !== null);
  const noThresholdOwner = partiesWithOwnership.length > 0 && thresholdParties.length === 0;
  if (noThresholdOwner) {
    warnings.push('No shareholder meets 25%; disclose control basis and route for Compliance review');
    for (const party of partiesWithOwnership) {
      party.compliance_review_required = true;
    }
  }

  const normalizedByRef = new Map<string, NormalizedTrustRelatedParty>();
  for (const party of normalized) {
    if (party.party_reference) normalizedByRef.set(party.party_reference, party);
  }
  for (const party of normalized) {
    party.ownership_path = buildOwnershipPath(party, normalizedByRef);
  }

  const authorizedSignatoryCount = normalized.filter((party) => party.is_authorized_signatory).length;
  if (authorizedSignatoryCount < minimumSignatories) {
    errors.push(`Requires ${minimumSignatories} authorized signatory/signatories; received ${authorizedSignatoryCount}`);
  }

  return {
    parties: normalized,
    errors,
    warnings,
    summary: {
      authorizedSignatoryCount,
      uboThresholdPartyCount: thresholdParties.length,
      complianceReviewRequiredCount: normalized.filter((party) => party.compliance_review_required).length,
      ownershipTotalPct: ownershipTotal,
    },
  };
}
