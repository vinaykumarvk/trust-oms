import { describe, expect, it } from 'vitest';
import {
  TFP_ACCOUNTING_EVENT_SCHEMA_VERSION,
  buildTfpAccountingEventContract,
  validateTfpAccountingEventInput,
} from '../../server/services/tfp-accounting-event-contract';

describe('TFP accounting event contract', () => {
  it('builds a stable idempotent accrual accounting event', () => {
    const input = {
      eventType: 'TFP_ACCRUAL_CREATED' as const,
      sourceTransactionType: 'TFP_ACCRUAL',
      sourceTransactionId: 101,
      sourceEventId: 'ACCRUAL:PLAN-1:PORT-1:2026-05-04',
      aggregateType: 'FEE_PLAN',
      aggregateId: 1,
      customerId: 'CUST-001',
      portfolioId: 'PORT-001',
      feePlanId: 1,
      accrualId: 101,
      amount: '1250.12345',
      currency: 'php',
      accountingDate: '2026-05-04',
    };

    const first = buildTfpAccountingEventContract(input);
    const second = buildTfpAccountingEventContract(input);

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.schemaVersion).toBe(TFP_ACCOUNTING_EVENT_SCHEMA_VERSION);
    expect(first.amount).toBe(1250.1235);
    expect(first.currency).toBe('PHP');
    expect(first.payload).toMatchObject({
      schema_version: TFP_ACCOUNTING_EVENT_SCHEMA_VERSION,
      event_type: 'TFP_ACCRUAL_CREATED',
      journal_hint: {
        debit: 'ACCRUED_FEE_RECEIVABLE',
        credit: 'FEE_INCOME',
        basis: 'ACCRUAL',
      },
    });
  });

  it('builds invoice issue events with source transaction evidence', () => {
    const event = buildTfpAccountingEventContract({
      eventType: 'TFP_INVOICE_ISSUED',
      sourceTransactionType: 'TFP_INVOICE',
      sourceTransactionId: 12,
      sourceEventId: 'INV-2026-0000012',
      aggregateType: 'TFP_INVOICE',
      aggregateId: 12,
      customerId: 'CUST-002',
      invoiceId: 12,
      amount: 5000,
      currency: 'PHP',
      accountingDate: '2026-05-04',
      metadata: { tax_amount: 600 },
    });

    expect(event.payload).toMatchObject({
      source_transaction: {
        type: 'TFP_INVOICE',
        id: '12',
        event_id: 'INV-2026-0000012',
      },
      journal_hint: {
        debit: 'ACCOUNTS_RECEIVABLE',
        credit: 'FEE_INCOME_AND_TAX_PAYABLE',
        basis: 'INVOICE',
      },
      metadata: { tax_amount: 600 },
    });
  });

  it('rejects invalid source, amount, and accounting-date fields', () => {
    const errors = validateTfpAccountingEventInput({
      eventType: 'TFP_ACCRUAL_CREATED',
      sourceTransactionType: '',
      sourceTransactionId: '',
      aggregateType: 'FEE_PLAN',
      aggregateId: 1,
      amount: -1,
      currency: '',
      accountingDate: '2026-02-31',
    });

    expect(errors).toContain('sourceTransactionType is required');
    expect(errors).toContain('sourceTransactionId is required');
    expect(errors).toContain('amount cannot be negative');
    expect(errors).toContain('currency is required');
    expect(errors).toContain('accountingDate must be a valid YYYY-MM-DD date');
  });
});
