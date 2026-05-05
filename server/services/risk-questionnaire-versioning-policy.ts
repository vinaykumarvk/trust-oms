export type RiskQuestionnaireStatus = 'UNAUTHORIZED' | 'MODIFIED' | 'AUTHORIZED' | 'REJECTED' | string;

export interface RiskQuestionnaireVersionState {
  id: number;
  authorization_status: RiskQuestionnaireStatus;
  parent_questionnaire_id?: number | null;
  supersedes_questionnaire_id?: number | null;
  replaced_by_questionnaire_id?: number | null;
  version_no?: number | null;
  version?: number | null;
  questionnaire_name?: string | null;
}

export function isRiskQuestionnaireImmutable(status: RiskQuestionnaireStatus | null | undefined): boolean {
  return status === 'AUTHORIZED' || status === 'REJECTED';
}

export function assertRiskQuestionnaireMutable(
  questionnaire: Pick<RiskQuestionnaireVersionState, 'id' | 'authorization_status'> | null | undefined,
  operation: string,
): void {
  if (!questionnaire) {
    throw new Error('Questionnaire not found');
  }
  if (isRiskQuestionnaireImmutable(questionnaire.authorization_status)) {
    const err = new Error(
      `Cannot ${operation} questionnaire ${questionnaire.id} in ${questionnaire.authorization_status} status. Create a replacement version instead.`,
    );
    (err as any).status = 422;
    (err as any).code = 'QUESTIONNAIRE_IMMUTABLE';
    throw err;
  }
}

export function assertRiskQuestionnaireReplacementAllowed(
  questionnaire: Pick<RiskQuestionnaireVersionState, 'id' | 'authorization_status'> | null | undefined,
): void {
  if (!questionnaire) {
    throw new Error('Questionnaire not found');
  }
  if (!isRiskQuestionnaireImmutable(questionnaire.authorization_status)) {
    const err = new Error(
      `Replacement versions are only required for AUTHORIZED or REJECTED questionnaires; current status is ${questionnaire.authorization_status}`,
    );
    (err as any).status = 422;
    (err as any).code = 'REPLACEMENT_NOT_REQUIRED';
    throw err;
  }
}

export function nextRiskQuestionnaireVersionNo(questionnaire: RiskQuestionnaireVersionState): number {
  return Math.max(Number(questionnaire.version_no ?? 0), Number(questionnaire.version ?? 0), 1) + 1;
}

export function buildRiskQuestionnaireVersionHistoryEntry(
  source: RiskQuestionnaireVersionState,
  replacementId: number | null,
  actorId: string | number | null,
  reason: string,
  at: Date = new Date(),
): Record<string, unknown> {
  return {
    action: 'REPLACEMENT_VERSION_CREATED',
    at: at.toISOString(),
    source_questionnaire_id: source.id,
    replacement_questionnaire_id: replacementId,
    source_status: source.authorization_status,
    source_version_no: source.version_no ?? source.version ?? 1,
    actor_id: actorId,
    reason,
  };
}

export function appendRiskQuestionnaireVersionHistory(
  existing: unknown,
  entry: Record<string, unknown>,
): Record<string, unknown>[] {
  const base = Array.isArray(existing) ? existing as Record<string, unknown>[] : [];
  return [...base, entry].slice(-50);
}
