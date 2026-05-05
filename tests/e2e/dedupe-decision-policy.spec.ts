import { describe, expect, it } from 'vitest';
import { buildDedupeOnboardingDecision } from '../../server/services/dedupe-decision-policy';

const softMatch = {
  rule_id: 2,
  stop_type: 'SOFT_STOP' as const,
  matched_entity_type: 'LEAD',
  matched_entity_id: 10,
  matched_fields: { first_name: 'ana', last_name: 'reyes' },
};

describe('dedupe onboarding decision policy', () => {
  it('hard stops are blocked without an override path', () => {
    const decision = buildDedupeOnboardingDecision({
      matches: [{ ...softMatch, stop_type: 'HARD_STOP', rule_id: 1 }],
      has_hard_stop: true,
      has_soft_stop: false,
    });

    expect(decision.status).toBe('HARD_STOP');
    expect(decision.blocked).toBe(true);
    expect(decision.requires_override).toBe(false);
    expect(decision.errors).toContain('Hard-stop duplicate detected; override is not permitted');
  });

  it('soft stops block until reason and reviewer approval are supplied', () => {
    const decision = buildDedupeOnboardingDecision(
      {
        matches: [softMatch],
        has_hard_stop: false,
        has_soft_stop: true,
      },
      {
        maker_user_id: 100,
        override: { override_reason: 'same name' },
      },
    );

    expect(decision.status).toBe('SOFT_STOP');
    expect(decision.blocked).toBe(true);
    expect(decision.errors).toContain('Soft-stop duplicate override requires override_reason of at least 10 characters');
    expect(decision.errors).toContain('Soft-stop duplicate override requires reviewer_user_id');
  });

  it('soft stops proceed only with a distinct reviewer approval', () => {
    const decision = buildDedupeOnboardingDecision(
      {
        matches: [softMatch],
        has_hard_stop: false,
        has_soft_stop: true,
      },
      {
        maker_user_id: 100,
        override: {
          override_reason: 'Verified different individual after KYC document review',
          reviewer_user_id: 101,
          reviewer_comments: 'Approved after ID comparison',
        },
      },
    );

    expect(decision.status).toBe('APPROVED_OVERRIDE');
    expect(decision.blocked).toBe(false);
    expect(decision.override).toMatchObject({
      reviewer_user_id: 101,
      reason: 'Verified different individual after KYC document review',
    });
  });

  it('rejects maker self-approval', () => {
    const decision = buildDedupeOnboardingDecision(
      {
        matches: [softMatch],
        has_hard_stop: false,
        has_soft_stop: true,
      },
      {
        maker_user_id: 100,
        override: {
          override_reason: 'Verified different individual after KYC document review',
          reviewer_user_id: 100,
        },
      },
    );

    expect(decision.status).toBe('SOFT_STOP');
    expect(decision.blocked).toBe(true);
    expect(decision.errors).toContain('Soft-stop duplicate override reviewer must be distinct from maker');
  });
});
