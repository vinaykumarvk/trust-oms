export type ContributionMatchStatus = 'AUTO_MATCH' | 'REVIEW' | 'NO_MATCH';

export interface ContributionMatchItemDraft {
  portfolio_id?: string | null;
  currency?: string | null;
  amount?: string | number | null;
  source_account?: string | null;
  external_reference?: string | null;
  item_type?: string | null;
}

export interface ContributionCandidateDraft {
  id: number;
  portfolio_id?: string | null;
  currency?: string | null;
  amount?: string | number | null;
  source_account?: string | null;
  external_reference?: string | null;
  contribution_status?: string | null;
}

export interface ContributionMatchDecision {
  status: ContributionMatchStatus;
  confidence: number;
  method: string;
  reasons: string[];
  contribution_id?: number;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function amountDelta(a: string | number | null | undefined, b: string | number | null | undefined): number | null {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left === null || right === null) return null;
  return Math.abs(left - right);
}

export function contributionItemAgeDays(receivedAt: string | Date | null | undefined, asOf: Date = new Date()): number {
  if (!receivedAt) return 0;
  const received = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  if (Number.isNaN(received.getTime())) return 0;
  return Math.max(0, Math.floor((asOf.getTime() - received.getTime()) / (24 * 60 * 60 * 1000)));
}

export function scoreContributionCandidate(
  item: ContributionMatchItemDraft,
  candidate: ContributionCandidateDraft,
  amountTolerance = 0.01,
): ContributionMatchDecision {
  const reasons: string[] = [];
  let score = 0;

  if (normalizeText(item.portfolio_id) && normalizeText(item.portfolio_id) === normalizeText(candidate.portfolio_id)) {
    score += 0.35;
    reasons.push('PORTFOLIO_MATCH');
  }

  if (normalizeText(item.currency) && normalizeText(item.currency) === normalizeText(candidate.currency)) {
    score += 0.2;
    reasons.push('CURRENCY_MATCH');
  }

  const delta = amountDelta(item.amount, candidate.amount);
  if (delta !== null && delta <= amountTolerance) {
    score += 0.25;
    reasons.push('AMOUNT_MATCH');
  }

  const sourceAccountMatches = normalizeText(item.source_account)
    && normalizeText(item.source_account) === normalizeText(candidate.source_account);
  if (sourceAccountMatches) {
    score += 0.1;
    reasons.push('SOURCE_ACCOUNT_MATCH');
  }

  const referenceMatches = normalizeText(item.external_reference)
    && normalizeText(item.external_reference) === normalizeText(candidate.external_reference);
  if (referenceMatches) {
    score += 0.1;
    reasons.push('REFERENCE_MATCH');
  }

  const confidence = Math.round(Math.min(score, 1) * 10000) / 10000;
  const hasCoreMatch = reasons.includes('PORTFOLIO_MATCH')
    && reasons.includes('CURRENCY_MATCH')
    && reasons.includes('AMOUNT_MATCH');

  if (confidence >= 0.9 && hasCoreMatch) {
    return { status: 'AUTO_MATCH', confidence, method: 'EXACT_REFERENCE_OR_ACCOUNT', reasons, contribution_id: candidate.id };
  }

  if (confidence >= 0.8 && hasCoreMatch) {
    return { status: 'REVIEW', confidence, method: 'CORE_FIELDS_WITHOUT_STRONG_REFERENCE', reasons, contribution_id: candidate.id };
  }

  return { status: 'NO_MATCH', confidence, method: 'NO_ELIGIBLE_CANDIDATE', reasons, contribution_id: candidate.id };
}

export function selectBestContributionMatch(
  item: ContributionMatchItemDraft,
  candidates: ContributionCandidateDraft[],
  amountTolerance = 0.01,
): ContributionMatchDecision {
  const scored = candidates
    .map((candidate) => scoreContributionCandidate(item, candidate, amountTolerance))
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  return best ?? {
    status: 'NO_MATCH',
    confidence: 0,
    method: 'NO_CANDIDATES',
    reasons: ['NO_CANDIDATES'],
  };
}
