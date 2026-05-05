export interface DedupeDecisionMatch {
  rule_id: number;
  stop_type: 'SOFT_STOP' | 'HARD_STOP';
  matched_entity_type: string;
  matched_entity_id: number | string;
  matched_fields: Record<string, string>;
}

export interface DedupeDecisionResultInput {
  matches: DedupeDecisionMatch[];
  has_hard_stop: boolean;
  has_soft_stop: boolean;
}

export interface DedupeOverrideApprovalInput {
  override_reason?: string | null;
  reason?: string | null;
  reason_code?: string | null;
  reviewer_user_id?: number | string | null;
  approved_by_user_id?: number | string | null;
  reviewer_comments?: string | null;
}

export type DedupeDecisionStatus = 'CLEAR' | 'HARD_STOP' | 'SOFT_STOP' | 'APPROVED_OVERRIDE';

export interface DedupeOnboardingDecision {
  status: DedupeDecisionStatus;
  blocked: boolean;
  requires_override: boolean;
  matches: DedupeDecisionMatch[];
  errors: string[];
  override?: {
    reason: string;
    reason_code: string | null;
    reviewer_user_id: number;
    reviewer_comments: string | null;
  };
}

function trimText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numericUserId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildDedupeOnboardingDecision(
  result: DedupeDecisionResultInput,
  options: {
    maker_user_id?: number | string | null;
    override?: DedupeOverrideApprovalInput | null;
  } = {},
): DedupeOnboardingDecision {
  if (result.has_hard_stop) {
    return {
      status: 'HARD_STOP',
      blocked: true,
      requires_override: false,
      matches: result.matches,
      errors: ['Hard-stop duplicate detected; override is not permitted'],
    };
  }

  if (result.matches.length === 0) {
    return {
      status: 'CLEAR',
      blocked: false,
      requires_override: false,
      matches: [],
      errors: [],
    };
  }

  const override = options.override ?? null;
  const reason = trimText(override?.override_reason ?? override?.reason ?? null);
  const reviewerUserId = numericUserId(override?.reviewer_user_id ?? override?.approved_by_user_id ?? null);
  const makerUserId = numericUserId(options.maker_user_id ?? null);
  const errors: string[] = [];

  if (!reason || reason.length < 10) {
    errors.push('Soft-stop duplicate override requires override_reason of at least 10 characters');
  }
  if (!reviewerUserId) {
    errors.push('Soft-stop duplicate override requires reviewer_user_id');
  }
  if (makerUserId && reviewerUserId && makerUserId === reviewerUserId) {
    errors.push('Soft-stop duplicate override reviewer must be distinct from maker');
  }

  if (errors.length > 0) {
    return {
      status: 'SOFT_STOP',
      blocked: true,
      requires_override: true,
      matches: result.matches,
      errors,
    };
  }

  return {
    status: 'APPROVED_OVERRIDE',
    blocked: false,
    requires_override: true,
    matches: result.matches,
    errors: [],
    override: {
      reason: reason as string,
      reason_code: trimText(override?.reason_code ?? null),
      reviewer_user_id: reviewerUserId as number,
      reviewer_comments: trimText(override?.reviewer_comments ?? null),
    },
  };
}
