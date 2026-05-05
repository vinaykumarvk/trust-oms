export const TFP_ACCOUNTING_EVENT_SCHEMA_VERSION = 1;

export type TfpAccountingEventType =
  | 'TFP_ACCRUAL_CREATED'
  | 'TFP_ACCRUAL_REVERSED'
  | 'TFP_INVOICE_ISSUED'
  | 'TFP_PAYMENT_POSTED';

export interface TfpAccountingEventInput {
  eventType: TfpAccountingEventType;
  sourceTransactionType: string;
  sourceTransactionId: string | number;
  sourceEventId?: string | null;
  aggregateType: string;
  aggregateId: string | number;
  customerId?: string | null;
  portfolioId?: string | null;
  feePlanId?: number | null;
  accrualId?: number | null;
  invoiceId?: number | null;
  amount: number | string;
  currency: string;
  accountingDate: string;
  metadata?: Record<string, unknown>;
}

export interface TfpAccountingEventContract {
  schemaVersion: number;
  idempotencyKey: string;
  eventType: TfpAccountingEventType;
  sourceTransactionType: string;
  sourceTransactionId: string;
  sourceEventId: string | null;
  aggregateType: string;
  aggregateId: string;
  amount: number;
  currency: string;
  accountingDate: string;
  payload: Record<string, unknown>;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeToken(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function amountNumber(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function journalHint(eventType: TfpAccountingEventType): Record<string, unknown> {
  switch (eventType) {
    case 'TFP_ACCRUAL_CREATED':
      return {
        debit: 'ACCRUED_FEE_RECEIVABLE',
        credit: 'FEE_INCOME',
        basis: 'ACCRUAL',
      };
    case 'TFP_ACCRUAL_REVERSED':
      return {
        debit: 'FEE_INCOME',
        credit: 'ACCRUED_FEE_RECEIVABLE',
        basis: 'REVERSAL',
      };
    case 'TFP_INVOICE_ISSUED':
      return {
        debit: 'ACCOUNTS_RECEIVABLE',
        credit: 'FEE_INCOME_AND_TAX_PAYABLE',
        basis: 'INVOICE',
      };
    case 'TFP_PAYMENT_POSTED':
      return {
        debit: 'CASH_OR_CLEARING',
        credit: 'ACCOUNTS_RECEIVABLE',
        basis: 'CASH',
      };
  }
}

export function validateTfpAccountingEventInput(input: TfpAccountingEventInput): string[] {
  const errors: string[] = [];
  const amount = amountNumber(input.amount);

  if (!input.eventType) errors.push('eventType is required');
  if (!String(input.sourceTransactionType ?? '').trim()) errors.push('sourceTransactionType is required');
  if (!String(input.sourceTransactionId ?? '').trim()) errors.push('sourceTransactionId is required');
  if (!String(input.aggregateType ?? '').trim()) errors.push('aggregateType is required');
  if (!String(input.aggregateId ?? '').trim()) errors.push('aggregateId is required');
  if (!Number.isFinite(amount)) errors.push('amount must be numeric');
  if (Number.isFinite(amount) && amount < 0) errors.push('amount cannot be negative');
  if (!String(input.currency ?? '').trim()) errors.push('currency is required');
  if (!input.accountingDate || !isValidDate(input.accountingDate)) {
    errors.push('accountingDate must be a valid YYYY-MM-DD date');
  }

  return errors;
}

export function buildTfpAccountingEventContract(
  input: TfpAccountingEventInput,
): TfpAccountingEventContract {
  const errors = validateTfpAccountingEventInput(input);
  if (errors.length > 0) {
    throw new Error(`TFP accounting event contract invalid: ${errors.join('; ')}`);
  }

  const sourceTransactionId = String(input.sourceTransactionId);
  const sourceEventId = input.sourceEventId ? String(input.sourceEventId) : null;
  const aggregateId = String(input.aggregateId);
  const idSource = sourceEventId ?? sourceTransactionId;
  const idempotencyKey = [
    'TFP-AE',
    `v${TFP_ACCOUNTING_EVENT_SCHEMA_VERSION}`,
    normalizeToken(input.eventType),
    normalizeToken(input.sourceTransactionType),
    normalizeToken(idSource),
  ].join(':');
  const amount = Math.round(amountNumber(input.amount) * 10000) / 10000;
  const currency = String(input.currency).toUpperCase();

  const payload = {
    schema_version: TFP_ACCOUNTING_EVENT_SCHEMA_VERSION,
    event_type: input.eventType,
    source_transaction: {
      type: input.sourceTransactionType,
      id: sourceTransactionId,
      event_id: sourceEventId,
    },
    aggregate: {
      type: input.aggregateType,
      id: aggregateId,
    },
    customer_id: input.customerId ?? null,
    portfolio_id: input.portfolioId ?? null,
    fee_plan_id: input.feePlanId ?? null,
    accrual_id: input.accrualId ?? null,
    invoice_id: input.invoiceId ?? null,
    amount,
    currency,
    accounting_date: input.accountingDate,
    journal_hint: journalHint(input.eventType),
    metadata: input.metadata ?? {},
  };

  return {
    schemaVersion: TFP_ACCOUNTING_EVENT_SCHEMA_VERSION,
    idempotencyKey,
    eventType: input.eventType,
    sourceTransactionType: input.sourceTransactionType,
    sourceTransactionId,
    sourceEventId,
    aggregateType: input.aggregateType,
    aggregateId,
    amount,
    currency,
    accountingDate: input.accountingDate,
    payload,
  };
}
