import type * as schema from '@shared/schema';
import type { TrustRelatedPartyInput } from './trust-account-foundation-service';

export type TrustProductType = typeof schema.trustProductTypeEnum.enumValues[number];
export type TrustMandateType = typeof schema.trustMandateTypeEnum.enumValues[number];

export interface TrustProductMandateInput {
  mandate_type?: TrustMandateType;
  investment_authority?: string | null;
  signing_rule?: Record<string, unknown> | null;
  risk_limits?: Record<string, unknown> | null;
  document_reference?: string | null;
}

export interface TrustProductOnboardingValidationInput {
  product_type: TrustProductType;
  base_currency: string;
  mandate?: TrustProductMandateInput | null;
  related_parties: TrustRelatedPartyInput[];
  onboarding_reference?: string | null;
}

export interface TrustProductOnboardingValidationResult {
  status: 'PASSED' | 'FAILED' | 'PASSED_WITH_WARNINGS';
  errors: string[];
  warnings: string[];
  evidence: Record<string, unknown>;
}

const PRODUCT_RULES: Record<TrustProductType, {
  allowedMandates: TrustMandateType[];
  defaultMandate: TrustMandateType;
  minimumSignatories: number;
  requiredPartyTypes?: string[];
  requireDocument?: boolean;
}> = {
  IMA_DIRECTED: {
    allowedMandates: ['DIRECTED'],
    defaultMandate: 'DIRECTED',
    minimumSignatories: 1,
  },
  IMA_DISCRETIONARY: {
    allowedMandates: ['DISCRETIONARY'],
    defaultMandate: 'DISCRETIONARY',
    minimumSignatories: 1,
  },
  PMT: {
    allowedMandates: ['DISCRETIONARY', 'OTHER'],
    defaultMandate: 'DISCRETIONARY',
    minimumSignatories: 1,
    requiredPartyTypes: ['BENEFICIARY'],
  },
  UITF: {
    allowedMandates: ['DIRECTED', 'OTHER'],
    defaultMandate: 'DIRECTED',
    minimumSignatories: 1,
  },
  PRE_NEED: {
    allowedMandates: ['OTHER', 'DISCRETIONARY'],
    defaultMandate: 'OTHER',
    minimumSignatories: 1,
    requiredPartyTypes: ['BENEFICIARY'],
  },
  EMPLOYEE_BENEFIT: {
    allowedMandates: ['AGENCY', 'OTHER'],
    defaultMandate: 'AGENCY',
    minimumSignatories: 2,
    requiredPartyTypes: ['TRUSTEE', 'AUTHORIZED_SIGNATORY'],
    requireDocument: true,
  },
  ESCROW: {
    allowedMandates: ['ESCROW'],
    defaultMandate: 'ESCROW',
    minimumSignatories: 2,
    requiredPartyTypes: ['SETTLOR', 'BENEFICIARY'],
    requireDocument: true,
  },
  AGENCY: {
    allowedMandates: ['AGENCY'],
    defaultMandate: 'AGENCY',
    minimumSignatories: 1,
    requireDocument: true,
  },
  SAFEKEEPING: {
    allowedMandates: ['SAFEKEEPING'],
    defaultMandate: 'SAFEKEEPING',
    minimumSignatories: 1,
    requireDocument: true,
  },
};

function numberFromRule(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function defaultMandateTypeForProduct(productType: TrustProductType): TrustMandateType {
  return PRODUCT_RULES[productType]?.defaultMandate ?? 'OTHER';
}

export function validateTrustProductOnboarding(
  input: TrustProductOnboardingValidationInput,
  validatedAt: Date = new Date(),
): TrustProductOnboardingValidationResult {
  const rule = PRODUCT_RULES[input.product_type];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rule) {
    errors.push(`Unsupported trust product type ${input.product_type}`);
  }

  const mandateType = input.mandate?.mandate_type ?? rule?.defaultMandate ?? 'OTHER';
  if (rule && !rule.allowedMandates.includes(mandateType)) {
    errors.push(`Product ${input.product_type} requires mandate type ${rule.allowedMandates.join(' or ')}, received ${mandateType}`);
  }

  const requiredSignatories = numberFromRule(input.mandate?.signing_rule?.required_signatories) ?? 1;
  if (rule && requiredSignatories < rule.minimumSignatories) {
    errors.push(`Product ${input.product_type} requires at least ${rule.minimumSignatories} authorized signatories`);
  }

  const partyTypes = new Set(input.related_parties.map((party) => party.party_type));
  for (const requiredPartyType of rule?.requiredPartyTypes ?? []) {
    if (!partyTypes.has(requiredPartyType as any)) {
      errors.push(`Product ${input.product_type} requires related party type ${requiredPartyType}`);
    }
  }

  const documentReference = input.mandate?.document_reference ?? input.onboarding_reference ?? null;
  if (rule?.requireDocument && !documentReference) {
    errors.push(`Product ${input.product_type} requires mandate document reference`);
  }

  if (!input.base_currency || input.base_currency.trim().length !== 3) {
    errors.push('base_currency must be a 3-character ISO currency code');
  }

  if (input.product_type === 'IMA_DISCRETIONARY' && !input.mandate?.risk_limits) {
    warnings.push('IMA_DISCRETIONARY onboarding has no explicit risk_limits; default empty limits will be stored');
  }

  const status = errors.length > 0 ? 'FAILED' : warnings.length > 0 ? 'PASSED_WITH_WARNINGS' : 'PASSED';
  return {
    status,
    errors,
    warnings,
    evidence: {
      product_type: input.product_type,
      mandate_type: mandateType,
      base_currency: input.base_currency,
      required_signatories: requiredSignatories,
      related_party_types: Array.from(partyTypes),
      document_reference_present: Boolean(documentReference),
      validated_at: validatedAt.toISOString(),
      rule: rule ? {
        allowed_mandates: rule.allowedMandates,
        minimum_signatories: rule.minimumSignatories,
        required_party_types: rule.requiredPartyTypes ?? [],
        require_document: rule.requireDocument ?? false,
      } : null,
    },
  };
}
