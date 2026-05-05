import { describe, expect, it } from 'vitest';

import {
  appendRiskQuestionnaireVersionHistory,
  assertRiskQuestionnaireMutable,
  assertRiskQuestionnaireReplacementAllowed,
  buildRiskQuestionnaireVersionHistoryEntry,
  isRiskQuestionnaireImmutable,
  nextRiskQuestionnaireVersionNo,
} from '../../server/services/risk-questionnaire-versioning-policy';

describe('Risk questionnaire versioning policy', () => {
  it('treats authorized and rejected questionnaires as immutable', () => {
    expect(isRiskQuestionnaireImmutable('AUTHORIZED')).toBe(true);
    expect(isRiskQuestionnaireImmutable('REJECTED')).toBe(true);
    expect(isRiskQuestionnaireImmutable('UNAUTHORIZED')).toBe(false);
    expect(isRiskQuestionnaireImmutable('MODIFIED')).toBe(false);
  });

  it('blocks direct edits to rejected questionnaires with a replacement-version error', () => {
    expect(() => assertRiskQuestionnaireMutable({ id: 10, authorization_status: 'REJECTED' }, 'edit')).toThrow(
      'Create a replacement version instead',
    );

    try {
      assertRiskQuestionnaireMutable({ id: 10, authorization_status: 'REJECTED' }, 'delete');
    } catch (err: any) {
      expect(err.code).toBe('QUESTIONNAIRE_IMMUTABLE');
      expect(err.status).toBe(422);
    }
  });

  it('allows replacement versions only for immutable questionnaire statuses', () => {
    expect(() => assertRiskQuestionnaireReplacementAllowed({ id: 1, authorization_status: 'REJECTED' })).not.toThrow();
    expect(() => assertRiskQuestionnaireReplacementAllowed({ id: 1, authorization_status: 'AUTHORIZED' })).not.toThrow();
    expect(() => assertRiskQuestionnaireReplacementAllowed({ id: 1, authorization_status: 'MODIFIED' })).toThrow(
      'Replacement versions are only required',
    );
  });

  it('computes the next explicit questionnaire version number', () => {
    expect(nextRiskQuestionnaireVersionNo({ id: 1, authorization_status: 'REJECTED', version_no: 3, version: 8 })).toBe(9);
    expect(nextRiskQuestionnaireVersionNo({ id: 1, authorization_status: 'REJECTED', version_no: null, version: 2 })).toBe(3);
    expect(nextRiskQuestionnaireVersionNo({ id: 1, authorization_status: 'REJECTED' })).toBe(2);
  });

  it('records bounded version history for replacement workflows', () => {
    const source = {
      id: 7,
      authorization_status: 'REJECTED',
      version_no: 2,
      questionnaire_name: 'Risk Questionnaire v2',
    };
    const entry = buildRiskQuestionnaireVersionHistoryEntry(
      source,
      8,
      99,
      'Update rejected answers',
      new Date('2026-05-04T00:00:00.000Z'),
    );
    const history = appendRiskQuestionnaireVersionHistory([], entry);

    expect(history).toEqual([
      {
        action: 'REPLACEMENT_VERSION_CREATED',
        at: '2026-05-04T00:00:00.000Z',
        source_questionnaire_id: 7,
        replacement_questionnaire_id: 8,
        source_status: 'REJECTED',
        source_version_no: 2,
        actor_id: 99,
        reason: 'Update rejected answers',
      },
    ]);
  });
});
