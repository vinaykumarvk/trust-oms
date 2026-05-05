import { describe, expect, it } from 'vitest';
import {
  buildCoreBankingIdempotencyKey,
  getCoreBankingContract,
  nextRetryAt,
  validateCoreBankingInstruction,
} from '../../server/services/core-banking-contract-policy';

describe('Core banking adapter contract policy', () => {
  it('defines owner, retry, and acknowledgement requirements per operation', () => {
    const contract = getCoreBankingContract('CASA_DEBIT');

    expect(contract.ownerTeam).toBe('SETTLEMENT_OPS');
    expect(contract.maxRetries).toBe(3);
    expect(contract.retryBackoffSeconds).toBe(300);
    expect(contract.acknowledgementRequired).toBe(true);
  });

  it('validates required Finacle account debit payload fields', () => {
    const errors = validateCoreBankingInstruction({
      targetSystem: 'FINACLE',
      operation: 'CASA_DEBIT',
      entityType: 'SETTLEMENT',
      entityId: 'SET-001',
      payload: {
        accountNumber: '0012345678',
        amount: '1000.00',
        currency: 'PHP',
      },
    });

    expect(errors).toContain('valueDate is required for CASA_DEBIT');
    expect(errors).toContain('purpose is required for CASA_DEBIT');
  });

  it('builds stable idempotency keys from contract-defined fields only', () => {
    const base = {
      targetSystem: 'FINACLE',
      operation: 'GL_POST' as const,
      entityType: 'GL_JOURNAL',
      entityId: 'JRN-001',
      payload: {
        journalRef: 'JRN-001',
        postingDate: '2026-05-04',
        debitAccount: '1000',
        creditAccount: '2000',
        amount: '500.00',
        currency: 'PHP',
        nonIdempotentNote: 'first',
      },
    };

    const changedNonKeyField = {
      ...base,
      payload: { ...base.payload, nonIdempotentNote: 'second' },
    };

    expect(buildCoreBankingIdempotencyKey(base)).toBe(
      buildCoreBankingIdempotencyKey(changedNonKeyField),
    );
  });

  it('calculates deterministic retry windows from retry count and backoff', () => {
    const from = new Date('2026-05-04T00:00:00.000Z');
    expect(nextRetryAt(0, 300, from).toISOString()).toBe('2026-05-04T00:05:00.000Z');
    expect(nextRetryAt(2, 300, from).toISOString()).toBe('2026-05-04T00:15:00.000Z');
  });
});
