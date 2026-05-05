import { describe, expect, it } from 'vitest';
import {
  contributionItemAgeDays,
  scoreContributionCandidate,
  selectBestContributionMatch,
} from '../../server/services/contribution-matching-policy';

describe('contribution matching policy', () => {
  const item = {
    portfolio_id: 'PF-001',
    currency: 'PHP',
    amount: '100000.00',
    source_account: 'BPI-001',
    external_reference: 'BANK-REF-001',
  };

  it('auto-matches when portfolio, currency, amount, source account, and reference align', () => {
    const decision = scoreContributionCandidate(item, {
      id: 10,
      portfolio_id: 'PF-001',
      currency: 'PHP',
      amount: '100000.00',
      source_account: 'BPI-001',
      external_reference: 'BANK-REF-001',
    });

    expect(decision.status).toBe('AUTO_MATCH');
    expect(decision.confidence).toBe(1);
    expect(decision.contribution_id).toBe(10);
  });

  it('routes core-field matches without strong reference to review', () => {
    const decision = scoreContributionCandidate(item, {
      id: 11,
      portfolio_id: 'PF-001',
      currency: 'PHP',
      amount: '100000.00',
      source_account: 'OTHER',
      external_reference: 'OTHER-REF',
    });

    expect(decision.status).toBe('REVIEW');
    expect(decision.confidence).toBe(0.8);
  });

  it('does not match when amount or portfolio breaks core matching', () => {
    const decision = scoreContributionCandidate(item, {
      id: 12,
      portfolio_id: 'PF-002',
      currency: 'PHP',
      amount: '99000.00',
      source_account: 'BPI-001',
      external_reference: 'BANK-REF-001',
    });

    expect(decision.status).toBe('NO_MATCH');
  });

  it('selects the highest-confidence candidate', () => {
    const decision = selectBestContributionMatch(item, [
      {
        id: 20,
        portfolio_id: 'PF-001',
        currency: 'PHP',
        amount: '100000.00',
        source_account: 'OTHER',
        external_reference: 'OTHER-REF',
      },
      {
        id: 21,
        portfolio_id: 'PF-001',
        currency: 'PHP',
        amount: '100000.00',
        source_account: 'BPI-001',
        external_reference: 'BANK-REF-001',
      },
    ]);

    expect(decision.status).toBe('AUTO_MATCH');
    expect(decision.contribution_id).toBe(21);
  });

  it('calculates whole-day age for workbench ageing', () => {
    expect(
      contributionItemAgeDays(
        '2026-05-01T10:00:00.000Z',
        new Date('2026-05-04T12:00:00.000Z'),
      ),
    ).toBe(3);
  });
});
