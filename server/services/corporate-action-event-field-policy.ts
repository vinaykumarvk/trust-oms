import { ValidationError } from './service-errors';

export type CorporateActionType = string;
export type CorporateActionFieldType = 'date' | 'number' | 'string' | 'object';

export interface CorporateActionFieldRule {
  field: string;
  type: CorporateActionFieldType;
  required: boolean;
  label: string;
}

export interface CorporateActionFieldValidationResult {
  status: 'PASSED' | 'FAILED';
  type: CorporateActionType;
  requiredFields: string[];
  optionalFields: string[];
  normalizedPayload: Record<string, unknown>;
  errors: Array<{
    field: string;
    code: string;
    message: string;
  }>;
}

export interface CorporateActionFieldHistoryEntry {
  action: 'VALIDATED' | 'SCRUB_VALIDATED' | 'AMENDED';
  status: 'PASSED' | 'FAILED';
  at: string;
  actor_id?: string | null;
  errors: CorporateActionFieldValidationResult['errors'];
  required_fields: string[];
}

const COMMON_REQUIRED: CorporateActionFieldRule[] = [
  { field: 'security_id', type: 'number', required: true, label: 'Security ID' },
  { field: 'ex_date', type: 'date', required: true, label: 'Ex-date' },
  { field: 'record_date', type: 'date', required: true, label: 'Record date' },
];

const FIELD_ALIASES: Record<string, string[]> = {
  security_id: ['security_id', 'securityId'],
  ex_date: ['ex_date', 'exDate'],
  record_date: ['record_date', 'recordDate'],
  payment_date: ['payment_date', 'paymentDate'],
  ratio: ['ratio'],
  amount_per_share: ['amount_per_share', 'amountPerShare'],
  election_deadline: ['election_deadline', 'electionDeadline'],
  new_name: ['new_name', 'newName'],
  new_isin: ['new_isin', 'newIsin'],
  new_ticker: ['new_ticker', 'newTicker'],
  new_par_value: ['new_par_value', 'newParValue'],
  new_security_class: ['new_security_class', 'newSecurityClass'],
  meeting_date: ['meeting_date', 'meetingDate'],
  ballot_deadline: ['ballot_deadline', 'ballotDeadline'],
  claim_deadline: ['claim_deadline', 'claimDeadline'],
  effective_date: ['effective_date', 'effectiveDate'],
  consideration_details: ['consideration_details', 'considerationDetails'],
  subscription_price: ['subscription_price', 'subscriptionPrice', 'amount_per_share', 'amountPerShare'],
  tender_price: ['tender_price', 'tenderPrice', 'amount_per_share', 'amountPerShare'],
  exercise_price: ['exercise_price', 'exercisePrice'],
  new_security_id: ['new_security_id', 'newSecurityId'],
};

const SPECIFIC_RULES: Record<string, CorporateActionFieldRule[]> = {
  DIVIDEND_CASH: [
    { field: 'payment_date', type: 'date', required: true, label: 'Payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Amount per share' },
  ],
  DIVIDEND_STOCK: [{ field: 'ratio', type: 'number', required: true, label: 'Stock dividend ratio' }],
  DIVIDEND_WITH_OPTION: [
    { field: 'payment_date', type: 'date', required: true, label: 'Payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Amount per share' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  BONUS: [{ field: 'ratio', type: 'number', required: true, label: 'Bonus ratio' }],
  BONUS_ISSUE: [{ field: 'ratio', type: 'number', required: true, label: 'Bonus issue ratio' }],
  SPLIT: [{ field: 'ratio', type: 'number', required: true, label: 'Split ratio' }],
  REVERSE_SPLIT: [{ field: 'ratio', type: 'number', required: true, label: 'Reverse split ratio' }],
  CONSOLIDATION: [{ field: 'ratio', type: 'number', required: true, label: 'Consolidation ratio' }],
  COUPON: [
    { field: 'payment_date', type: 'date', required: true, label: 'Coupon payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Coupon rate or amount' },
  ],
  PARTIAL_REDEMPTION: [
    { field: 'payment_date', type: 'date', required: true, label: 'Redemption payment date' },
    { field: 'ratio', type: 'number', required: true, label: 'Redemption ratio' },
  ],
  FULL_REDEMPTION: [
    { field: 'payment_date', type: 'date', required: true, label: 'Redemption payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Redemption amount' },
  ],
  MATURITY: [
    { field: 'payment_date', type: 'date', required: true, label: 'Maturity payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Maturity amount' },
  ],
  CAPITAL_DISTRIBUTION: [
    { field: 'payment_date', type: 'date', required: true, label: 'Payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Distribution amount' },
  ],
  CAPITAL_GAINS_DISTRIBUTION: [
    { field: 'payment_date', type: 'date', required: true, label: 'Payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Distribution amount' },
  ],
  RETURN_OF_CAPITAL: [
    { field: 'payment_date', type: 'date', required: true, label: 'Payment date' },
    { field: 'amount_per_share', type: 'number', required: true, label: 'Return of capital amount' },
  ],
  RIGHTS: [
    { field: 'ratio', type: 'number', required: true, label: 'Rights ratio' },
    { field: 'subscription_price', type: 'number', required: true, label: 'Subscription price' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  TENDER: [
    { field: 'tender_price', type: 'number', required: true, label: 'Tender price' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  TENDER_OFFER: [
    { field: 'tender_price', type: 'number', required: true, label: 'Tender offer price' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  BUYBACK: [{ field: 'tender_price', type: 'number', required: true, label: 'Buyback price' }],
  DUTCH_AUCTION: [
    { field: 'tender_price', type: 'number', required: true, label: 'Auction reference price' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  EXCHANGE_OFFER: [
    { field: 'ratio', type: 'number', required: true, label: 'Exchange ratio' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  WARRANT_EXERCISE: [
    { field: 'ratio', type: 'number', required: true, label: 'Exercise ratio' },
    { field: 'exercise_price', type: 'number', required: true, label: 'Exercise price' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Exercise deadline' },
  ],
  CONVERSION: [
    { field: 'ratio', type: 'number', required: true, label: 'Conversion ratio' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Conversion deadline' },
  ],
  MERGER: [
    { field: 'effective_date', type: 'date', required: true, label: 'Merger effective date' },
    { field: 'consideration_details', type: 'object', required: true, label: 'Consideration details' },
  ],
  MERGER_WITH_ELECTION: [
    { field: 'effective_date', type: 'date', required: true, label: 'Merger effective date' },
    { field: 'consideration_details', type: 'object', required: true, label: 'Consideration details' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  SPINOFF_WITH_OPTION: [
    { field: 'ratio', type: 'number', required: true, label: 'Spinoff allocation ratio' },
    { field: 'new_security_id', type: 'number', required: true, label: 'New security ID' },
    { field: 'election_deadline', type: 'date', required: true, label: 'Election deadline' },
  ],
  NAME_CHANGE: [{ field: 'new_name', type: 'string', required: true, label: 'New security name' }],
  ISIN_CHANGE: [{ field: 'new_isin', type: 'string', required: true, label: 'New ISIN' }],
  TICKER_CHANGE: [{ field: 'new_ticker', type: 'string', required: true, label: 'New ticker' }],
  PAR_VALUE_CHANGE: [{ field: 'new_par_value', type: 'number', required: true, label: 'New par value' }],
  SECURITY_RECLASSIFICATION: [{ field: 'new_security_class', type: 'string', required: true, label: 'New security class' }],
  PROXY_VOTE: [
    { field: 'meeting_date', type: 'date', required: true, label: 'Meeting date' },
    { field: 'ballot_deadline', type: 'date', required: true, label: 'Ballot deadline' },
  ],
  CLASS_ACTION: [{ field: 'claim_deadline', type: 'date', required: true, label: 'Claim deadline' }],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstPresent(source: Record<string, unknown>, field: string): unknown {
  for (const alias of FIELD_ALIASES[field] ?? [field]) {
    if (source[alias] !== undefined && source[alias] !== null && source[alias] !== '') return source[alias];
  }
  return undefined;
}

function isDateString(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPositiveNumber(value: unknown): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function isValidForType(value: unknown, type: CorporateActionFieldType): boolean {
  if (type === 'date') return isDateString(value);
  if (type === 'number') return isPositiveNumber(value);
  if (type === 'string') return typeof value === 'string' && value.trim().length > 0;
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getCorporateActionFieldRules(type: CorporateActionType): CorporateActionFieldRule[] {
  return [...COMMON_REQUIRED, ...(SPECIFIC_RULES[type] ?? [])];
}

export function validateCorporateActionEventFields(input: {
  type: CorporateActionType;
  securityId?: number | null;
  security_id?: number | null;
  exDate?: string | null;
  ex_date?: string | null;
  recordDate?: string | null;
  record_date?: string | null;
  paymentDate?: string | null;
  payment_date?: string | null;
  ratio?: string | null;
  amountPerShare?: string | null;
  amount_per_share?: string | null;
  electionDeadline?: string | null;
  election_deadline?: string | null;
  eventPayload?: Record<string, unknown> | null;
  event_payload?: Record<string, unknown> | null;
}): CorporateActionFieldValidationResult {
  const payload = {
    ...asRecord(input.event_payload),
    ...asRecord(input.eventPayload),
  };
  const assignDefined = (field: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') payload[field] = value;
  };
  assignDefined('security_id', input.security_id ?? input.securityId);
  assignDefined('ex_date', input.ex_date ?? input.exDate);
  assignDefined('record_date', input.record_date ?? input.recordDate);
  assignDefined('payment_date', input.payment_date ?? input.paymentDate);
  assignDefined('ratio', input.ratio);
  assignDefined('amount_per_share', input.amount_per_share ?? input.amountPerShare);
  assignDefined('election_deadline', input.election_deadline ?? input.electionDeadline);
  const rules = getCorporateActionFieldRules(input.type);
  const normalizedPayload: Record<string, unknown> = {};
  const errors: CorporateActionFieldValidationResult['errors'] = [];

  for (const rule of rules) {
    const value = firstPresent(payload, rule.field);
    if (value !== undefined) normalizedPayload[rule.field] = value;
    if (rule.required && value === undefined) {
      errors.push({
        field: rule.field,
        code: 'CA_FIELD_REQUIRED',
        message: `${rule.label} is required for ${input.type}`,
      });
      continue;
    }
    if (value !== undefined && !isValidForType(value, rule.type)) {
      errors.push({
        field: rule.field,
        code: 'CA_FIELD_INVALID',
        message: `${rule.label} must be a valid ${rule.type}`,
      });
    }
  }

  for (const [key, value] of Object.entries({ ...asRecord(input.event_payload), ...asRecord(input.eventPayload) })) {
    if (value !== undefined && normalizedPayload[key] === undefined) normalizedPayload[key] = value;
  }

  return {
    status: errors.length > 0 ? 'FAILED' : 'PASSED',
    type: input.type,
    requiredFields: rules.filter((rule) => rule.required).map((rule) => rule.field),
    optionalFields: rules.filter((rule) => !rule.required).map((rule) => rule.field),
    normalizedPayload,
    errors,
  };
}

export function buildCorporateActionFieldHistoryEntry(
  validation: CorporateActionFieldValidationResult,
  action: CorporateActionFieldHistoryEntry['action'],
  actorId?: string | null,
): CorporateActionFieldHistoryEntry {
  return {
    action,
    status: validation.status,
    at: new Date().toISOString(),
    actor_id: actorId ?? null,
    errors: validation.errors,
    required_fields: validation.requiredFields,
  };
}

export function assertCorporateActionFieldsValid(validation: CorporateActionFieldValidationResult): void {
  if (validation.status === 'PASSED') return;
  throw new ValidationError(validation.errors.map((error) => error.message).join('; '));
}
