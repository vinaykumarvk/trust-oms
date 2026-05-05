import { createHash } from 'crypto';

export type CoreBankingOperation =
  | 'CIF_LOOKUP'
  | 'ACCOUNT_VALIDATE'
  | 'BALANCE_INQUIRY'
  | 'CASA_DEBIT'
  | 'CASA_CREDIT'
  | 'GL_POST'
  | 'STATEMENT_FETCH'
  | 'TAX_PAYMENT';

export interface CoreBankingInstructionDraft {
  targetSystem: string;
  operation: CoreBankingOperation;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}

export interface CoreBankingOperationContract {
  operation: CoreBankingOperation;
  ownerTeam: string;
  requiredFields: string[];
  idempotencyFields: string[];
  maxRetries: number;
  retryBackoffSeconds: number;
  acknowledgementRequired: boolean;
}

const CONTRACTS: Record<CoreBankingOperation, CoreBankingOperationContract> = {
  CIF_LOOKUP: {
    operation: 'CIF_LOOKUP',
    ownerTeam: 'CLIENT_DATA_OPS',
    requiredFields: ['cifNumber'],
    idempotencyFields: ['cifNumber'],
    maxRetries: 2,
    retryBackoffSeconds: 120,
    acknowledgementRequired: true,
  },
  ACCOUNT_VALIDATE: {
    operation: 'ACCOUNT_VALIDATE',
    ownerTeam: 'ACCOUNT_OPS',
    requiredFields: ['accountNumber', 'currency'],
    idempotencyFields: ['accountNumber', 'currency'],
    maxRetries: 2,
    retryBackoffSeconds: 120,
    acknowledgementRequired: true,
  },
  BALANCE_INQUIRY: {
    operation: 'BALANCE_INQUIRY',
    ownerTeam: 'ACCOUNT_OPS',
    requiredFields: ['accountNumber', 'asOfDate'],
    idempotencyFields: ['accountNumber', 'asOfDate'],
    maxRetries: 2,
    retryBackoffSeconds: 60,
    acknowledgementRequired: true,
  },
  CASA_DEBIT: {
    operation: 'CASA_DEBIT',
    ownerTeam: 'SETTLEMENT_OPS',
    requiredFields: ['accountNumber', 'amount', 'currency', 'valueDate', 'purpose'],
    idempotencyFields: ['accountNumber', 'amount', 'currency', 'valueDate', 'purpose'],
    maxRetries: 3,
    retryBackoffSeconds: 300,
    acknowledgementRequired: true,
  },
  CASA_CREDIT: {
    operation: 'CASA_CREDIT',
    ownerTeam: 'SETTLEMENT_OPS',
    requiredFields: ['accountNumber', 'amount', 'currency', 'valueDate', 'purpose'],
    idempotencyFields: ['accountNumber', 'amount', 'currency', 'valueDate', 'purpose'],
    maxRetries: 3,
    retryBackoffSeconds: 300,
    acknowledgementRequired: true,
  },
  GL_POST: {
    operation: 'GL_POST',
    ownerTeam: 'FINANCE_OPS',
    requiredFields: ['journalRef', 'debitAccount', 'creditAccount', 'amount', 'currency', 'postingDate'],
    idempotencyFields: ['journalRef', 'postingDate'],
    maxRetries: 3,
    retryBackoffSeconds: 300,
    acknowledgementRequired: true,
  },
  STATEMENT_FETCH: {
    operation: 'STATEMENT_FETCH',
    ownerTeam: 'CLIENT_REPORTING',
    requiredFields: ['accountNumber', 'period'],
    idempotencyFields: ['accountNumber', 'period'],
    maxRetries: 2,
    retryBackoffSeconds: 300,
    acknowledgementRequired: true,
  },
  TAX_PAYMENT: {
    operation: 'TAX_PAYMENT',
    ownerTeam: 'TAX_OPS',
    requiredFields: ['taxReference', 'amount', 'currency', 'paymentDate'],
    idempotencyFields: ['taxReference', 'paymentDate'],
    maxRetries: 3,
    retryBackoffSeconds: 600,
    acknowledgementRequired: true,
  },
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function hasValue(payload: Record<string, unknown>, field: string): boolean {
  const value = payload[field];
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

export function getCoreBankingContract(operation: CoreBankingOperation): CoreBankingOperationContract {
  return CONTRACTS[operation];
}

export function validateCoreBankingInstruction(draft: CoreBankingInstructionDraft): string[] {
  const contract = CONTRACTS[draft.operation];
  if (!contract) return [`unsupported core banking operation: ${String(draft.operation)}`];

  const errors: string[] = [];
  if (!draft.targetSystem) errors.push('targetSystem is required');
  if (!draft.entityType) errors.push('entityType is required');
  if (!draft.entityId) errors.push('entityId is required');
  for (const field of contract.requiredFields) {
    if (!hasValue(draft.payload, field)) errors.push(`${field} is required for ${draft.operation}`);
  }
  return errors;
}

export function buildCoreBankingIdempotencyKey(draft: CoreBankingInstructionDraft): string {
  const contract = CONTRACTS[draft.operation];
  const selectedPayload: Record<string, unknown> = {};
  for (const field of contract?.idempotencyFields ?? []) {
    selectedPayload[field] = draft.payload[field] ?? null;
  }
  const raw = stableStringify({
    targetSystem: draft.targetSystem,
    operation: draft.operation,
    entityType: draft.entityType,
    entityId: draft.entityId,
    payload: selectedPayload,
  });
  return createHash('sha256').update(raw).digest('hex');
}

export function nextRetryAt(
  retryCount: number,
  retryBackoffSeconds: number,
  from: Date = new Date(),
): Date {
  const multiplier = Math.max(1, retryCount + 1);
  return new Date(from.getTime() + retryBackoffSeconds * multiplier * 1000);
}
