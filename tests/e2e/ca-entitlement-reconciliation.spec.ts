import { describe, expect, it } from 'vitest';
import { buildCorporateActionEntitlementReconBreaks } from '../../server/services/reconciliation-service';

describe('Corporate action entitlement/election reconciliation', () => {
  it('passes when custody and client statement lines match internal entitlement and election', () => {
    const breaks = buildCorporateActionEntitlementReconBreaks(
      [{ entitlementId: 1, portfolioId: 'PTF-001', entitledQty: 250, electedOption: 'CASH', posted: true }],
      [{ portfolioId: 'PTF-001', entitledQty: 250, electedOption: 'CASH' }],
      [{ portfolioId: 'PTF-001', entitledQty: 250, electedOption: 'CASH' }],
    );

    expect(breaks).toEqual([]);
  });

  it('creates custody quantity and election breaks', () => {
    const breaks = buildCorporateActionEntitlementReconBreaks(
      [{ entitlementId: 1, portfolioId: 'PTF-001', entitledQty: 250, electedOption: 'CASH', posted: true }],
      [{ portfolioId: 'PTF-001', entitledQty: 200, electedOption: 'REINVEST' }],
      [{ portfolioId: 'PTF-001', entitledQty: 250, electedOption: 'CASH' }],
    );

    expect(breaks.map((b) => b.break_type)).toContain('ENTITLEMENT_CUSTODY_QTY_MISMATCH');
    expect(breaks.map((b) => b.break_type)).toContain('ELECTION_CUSTODY_MISMATCH');
  });

  it('creates client statement breaks and accounting not-posted break', () => {
    const breaks = buildCorporateActionEntitlementReconBreaks(
      [{ entitlementId: 7, portfolioId: 'PTF-007', entitledQty: 100, electedOption: 'CASH', posted: false }],
      [{ portfolioId: 'PTF-007', entitledQty: 100, electedOption: 'CASH' }],
      [{ portfolioId: 'PTF-007', entitledQty: 90, electedOption: 'REINVEST' }],
    );

    expect(breaks.map((b) => b.break_type)).toEqual([
      'ENTITLEMENT_STATEMENT_QTY_MISMATCH',
      'ELECTION_STATEMENT_MISMATCH',
      'ACCOUNTING_NOT_POSTED',
    ]);
  });

  it('creates missing source breaks for absent custody and statement records', () => {
    const breaks = buildCorporateActionEntitlementReconBreaks(
      [{ entitlementId: 9, portfolioId: 'PTF-009', entitledQty: 500, electedOption: null, posted: true }],
      [],
      [],
    );

    expect(breaks.map((b) => b.break_type)).toEqual([
      'MISSING_CUSTODY_CONFIRMATION',
      'MISSING_CLIENT_STATEMENT_LINE',
    ]);
  });
});
