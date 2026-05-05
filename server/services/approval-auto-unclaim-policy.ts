import { ValidationError } from './service-errors';

export interface ApprovalAutoUnclaimPolicy {
  thresholdBusinessDays: number;
  calendarKey: string;
  timezone: string;
}

export interface ApprovalAutoUnclaimEvaluation {
  policy: ApprovalAutoUnclaimPolicy;
  claimedAt: string;
  claimedLocalDate: string;
  evaluatedLocalDate: string;
  expiresOn: string;
  businessDaysElapsed: number;
  expired: boolean;
  evaluatedDates: Array<{ date: string; businessDay: boolean }>;
}

export type ApprovalBusinessDayChecker = (calendarKey: string, date: string) => Promise<boolean>;

export function validateApprovalAutoUnclaimPolicy(policy: ApprovalAutoUnclaimPolicy): ApprovalAutoUnclaimPolicy {
  if (!Number.isInteger(policy.thresholdBusinessDays) || policy.thresholdBusinessDays < 0 || policy.thresholdBusinessDays > 10) {
    throw new ValidationError('Approval auto-unclaim threshold must be an integer between 0 and 10 business days');
  }
  if (!policy.calendarKey?.trim()) throw new ValidationError('Approval auto-unclaim calendar key is required');
  if (!policy.timezone?.trim()) throw new ValidationError('Approval auto-unclaim timezone is required');
  return {
    thresholdBusinessDays: policy.thresholdBusinessDays,
    calendarKey: policy.calendarKey.trim().toUpperCase(),
    timezone: policy.timezone.trim(),
  };
}

export function isoDateInApprovalTimezone(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function addDaysToIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export async function computeApprovalClaimExpiryDate(input: {
  claimedAt: Date;
  policy: ApprovalAutoUnclaimPolicy;
  isBusinessDay: ApprovalBusinessDayChecker;
}): Promise<string> {
  const policy = validateApprovalAutoUnclaimPolicy(input.policy);
  let current = isoDateInApprovalTimezone(input.claimedAt, policy.timezone);
  let businessDays = 0;
  if (policy.thresholdBusinessDays === 0) return current;

  while (businessDays < policy.thresholdBusinessDays) {
    current = addDaysToIsoDate(current, 1);
    if (await input.isBusinessDay(policy.calendarKey, current)) {
      businessDays++;
    }
  }
  return current;
}

export async function evaluateApprovalAutoUnclaim(input: {
  claimedAt: Date;
  now: Date;
  policy: ApprovalAutoUnclaimPolicy;
  isBusinessDay: ApprovalBusinessDayChecker;
}): Promise<ApprovalAutoUnclaimEvaluation> {
  const policy = validateApprovalAutoUnclaimPolicy(input.policy);
  const claimedLocalDate = isoDateInApprovalTimezone(input.claimedAt, policy.timezone);
  const evaluatedLocalDate = isoDateInApprovalTimezone(input.now, policy.timezone);
  const expiresOn = await computeApprovalClaimExpiryDate({
    claimedAt: input.claimedAt,
    policy,
    isBusinessDay: input.isBusinessDay,
  });

  let current = claimedLocalDate;
  let businessDaysElapsed = 0;
  const evaluatedDates: ApprovalAutoUnclaimEvaluation['evaluatedDates'] = [];

  while (current < evaluatedLocalDate) {
    current = addDaysToIsoDate(current, 1);
    const businessDay = await input.isBusinessDay(policy.calendarKey, current);
    evaluatedDates.push({ date: current, businessDay });
    if (businessDay) businessDaysElapsed++;
  }

  return {
    policy,
    claimedAt: input.claimedAt.toISOString(),
    claimedLocalDate,
    evaluatedLocalDate,
    expiresOn,
    businessDaysElapsed,
    expired: evaluatedLocalDate >= expiresOn,
    evaluatedDates,
  };
}
