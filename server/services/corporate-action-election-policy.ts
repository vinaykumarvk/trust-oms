import { ValidationError } from './service-errors';

export type CorporateActionElectionChannel =
  | 'SYSTEM'
  | 'CLIENT_PORTAL'
  | 'BRANCH_ASSISTED'
  | 'RM_ASSISTED'
  | 'BACK_OFFICE'
  | 'CALL_CENTER';

export interface CorporateActionElectionEvidence {
  mandate_ref?: string;
  client_instruction_ref?: string;
  signed_form_ref?: string;
  recorded_call_ref?: string;
  portal_confirmation_ref?: string;
  notes?: string;
}

export interface NormalizedCorporateActionElection {
  option: string;
  channel: CorporateActionElectionChannel;
  assistedByUserId: string | null;
  branchCode: string | null;
  capturedByUserId: string | null;
  makerUserId: string | null;
  checkerUserId: string | null;
  makerCheckerStatus: string;
  authorityEvidence: CorporateActionElectionEvidence;
  captureNotes: string | null;
}

export interface CorporateActionElectionHistoryEntry {
  action: 'ELECTION_CAPTURED';
  option: string;
  channel: CorporateActionElectionChannel;
  at: string;
  captured_by_user_id: string | null;
  assisted_by_user_id: string | null;
  branch_code: string | null;
  maker_user_id: string | null;
  checker_user_id: string | null;
  maker_checker_status: string;
  authority_evidence: CorporateActionElectionEvidence;
}

const VALID_OPTIONS = ['CASH', 'REINVEST', 'TENDER', 'RIGHTS'];
const VALID_CHANNELS: CorporateActionElectionChannel[] = [
  'SYSTEM',
  'CLIENT_PORTAL',
  'BRANCH_ASSISTED',
  'RM_ASSISTED',
  'BACK_OFFICE',
  'CALL_CENTER',
];
const ASSISTED_CHANNELS = new Set<CorporateActionElectionChannel>([
  'BRANCH_ASSISTED',
  'RM_ASSISTED',
  'BACK_OFFICE',
  'CALL_CENTER',
]);
const AUTHORITY_KEYS: Array<keyof CorporateActionElectionEvidence> = [
  'mandate_ref',
  'client_instruction_ref',
  'signed_form_ref',
  'recorded_call_ref',
  'portal_confirmation_ref',
];

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeEvidence(input: unknown): CorporateActionElectionEvidence {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    ...(optionalString(record.mandate_ref ?? record.mandateRef) ? { mandate_ref: optionalString(record.mandate_ref ?? record.mandateRef)! } : {}),
    ...(optionalString(record.client_instruction_ref ?? record.clientInstructionRef) ? { client_instruction_ref: optionalString(record.client_instruction_ref ?? record.clientInstructionRef)! } : {}),
    ...(optionalString(record.signed_form_ref ?? record.signedFormRef) ? { signed_form_ref: optionalString(record.signed_form_ref ?? record.signedFormRef)! } : {}),
    ...(optionalString(record.recorded_call_ref ?? record.recordedCallRef) ? { recorded_call_ref: optionalString(record.recorded_call_ref ?? record.recordedCallRef)! } : {}),
    ...(optionalString(record.portal_confirmation_ref ?? record.portalConfirmationRef) ? { portal_confirmation_ref: optionalString(record.portal_confirmation_ref ?? record.portalConfirmationRef)! } : {}),
    ...(optionalString(record.notes) ? { notes: optionalString(record.notes)! } : {}),
  };
}

function hasAuthorityEvidence(evidence: CorporateActionElectionEvidence): boolean {
  return AUTHORITY_KEYS.some((key) => Boolean(evidence[key]));
}

export function normalizeCorporateActionElectionCapture(input: {
  option: string;
  channel?: string | null;
  assistedByUserId?: string | number | null;
  branchCode?: string | null;
  capturedByUserId?: string | number | null;
  makerUserId?: string | number | null;
  checkerUserId?: string | number | null;
  authorityEvidence?: unknown;
  captureNotes?: string | null;
}): NormalizedCorporateActionElection {
  const option = String(input.option || '').trim().toUpperCase();
  if (!VALID_OPTIONS.includes(option)) {
    throw new ValidationError(`Invalid election option: ${input.option}. Must be one of ${VALID_OPTIONS.join(', ')}`);
  }

  const channel = String(input.channel || 'SYSTEM').trim().toUpperCase() as CorporateActionElectionChannel;
  if (!VALID_CHANNELS.includes(channel)) {
    throw new ValidationError(`Invalid election channel: ${input.channel}`);
  }

  const assistedByUserId = optionalString(input.assistedByUserId);
  const branchCode = optionalString(input.branchCode);
  const capturedByUserId = optionalString(input.capturedByUserId);
  const makerUserId = optionalString(input.makerUserId);
  const checkerUserId = optionalString(input.checkerUserId);
  const authorityEvidence = normalizeEvidence(input.authorityEvidence);
  const captureNotes = optionalString(input.captureNotes);

  if (ASSISTED_CHANNELS.has(channel)) {
    if (!capturedByUserId) throw new ValidationError('capturedByUserId is required for assisted elections');
    if (!hasAuthorityEvidence(authorityEvidence)) {
      throw new ValidationError('authority evidence is required for assisted elections');
    }
  }

  if ((channel === 'BRANCH_ASSISTED' || channel === 'RM_ASSISTED') && !branchCode) {
    throw new ValidationError('branchCode is required for branch or RM assisted elections');
  }

  if ((channel === 'BRANCH_ASSISTED' || channel === 'RM_ASSISTED' || channel === 'CALL_CENTER') && !assistedByUserId) {
    throw new ValidationError('assistedByUserId is required for this election channel');
  }

  if ((makerUserId && !checkerUserId) || (!makerUserId && checkerUserId)) {
    throw new ValidationError('makerUserId and checkerUserId must both be supplied when maker-checker evidence is recorded');
  }

  if (makerUserId && checkerUserId && makerUserId === checkerUserId) {
    throw new ValidationError('makerUserId and checkerUserId must be different');
  }

  return {
    option,
    channel,
    assistedByUserId,
    branchCode,
    capturedByUserId,
    makerUserId,
    checkerUserId,
    makerCheckerStatus: makerUserId && checkerUserId ? 'APPROVED' : channel === 'SYSTEM' ? 'NOT_REQUIRED' : 'CHECKER_CAPTURED',
    authorityEvidence,
    captureNotes,
  };
}

export function buildCorporateActionElectionHistoryEntry(
  election: NormalizedCorporateActionElection,
): CorporateActionElectionHistoryEntry {
  return {
    action: 'ELECTION_CAPTURED',
    option: election.option,
    channel: election.channel,
    at: new Date().toISOString(),
    captured_by_user_id: election.capturedByUserId,
    assisted_by_user_id: election.assistedByUserId,
    branch_code: election.branchCode,
    maker_user_id: election.makerUserId,
    checker_user_id: election.checkerUserId,
    maker_checker_status: election.makerCheckerStatus,
    authority_evidence: election.authorityEvidence,
  };
}
