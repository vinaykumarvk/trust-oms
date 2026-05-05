import { ValidationError } from './service-errors';

export interface CallReportLateFilingPolicy {
  thresholdBusinessDays: number;
  calendarKey: string;
  timezone: string;
}

export interface CallReportLateFilingEvaluation {
  policy: CallReportLateFilingPolicy;
  meetingDate: string;
  filedLocalDate: string;
  businessDaysElapsed: number;
  dueDate: string;
  requiresSupervisorApproval: boolean;
  evaluatedDates: Array<{ date: string; businessDay: boolean }>;
}

export type BusinessDayChecker = (calendarKey: string, date: string) => Promise<boolean>;

export function validateLateFilingPolicy(policy: CallReportLateFilingPolicy): CallReportLateFilingPolicy {
  if (!Number.isInteger(policy.thresholdBusinessDays) || policy.thresholdBusinessDays < 0 || policy.thresholdBusinessDays > 30) {
    throw new ValidationError('Late filing threshold must be an integer between 0 and 30 business days');
  }
  if (!policy.calendarKey?.trim()) throw new ValidationError('Late filing calendar key is required');
  if (!policy.timezone?.trim()) throw new ValidationError('Late filing timezone is required');
  return {
    thresholdBusinessDays: policy.thresholdBusinessDays,
    calendarKey: policy.calendarKey.trim().toUpperCase(),
    timezone: policy.timezone.trim(),
  };
}

export function isoDateInBusinessTimezone(date: Date, timezone: string): string {
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

export async function evaluateCallReportLateFiling(input: {
  meetingDate: string;
  filedAt: Date;
  policy: CallReportLateFilingPolicy;
  isBusinessDay: BusinessDayChecker;
}): Promise<CallReportLateFilingEvaluation> {
  const policy = validateLateFilingPolicy(input.policy);
  const filedLocalDate = isoDateInBusinessTimezone(input.filedAt, policy.timezone);
  if (filedLocalDate <= input.meetingDate) {
    return {
      policy,
      meetingDate: input.meetingDate,
      filedLocalDate,
      businessDaysElapsed: 0,
      dueDate: input.meetingDate,
      requiresSupervisorApproval: false,
      evaluatedDates: [],
    };
  }

  let current = input.meetingDate;
  let businessDaysElapsed = 0;
  let dueDate = input.meetingDate;
  const evaluatedDates: CallReportLateFilingEvaluation['evaluatedDates'] = [];

  while (current < filedLocalDate) {
    const businessDay = await input.isBusinessDay(policy.calendarKey, current);
    evaluatedDates.push({ date: current, businessDay });
    if (businessDay) {
      businessDaysElapsed++;
      if (businessDaysElapsed === policy.thresholdBusinessDays) {
        dueDate = current;
      }
    }
    current = addDaysToIsoDate(current, 1);
  }

  if (policy.thresholdBusinessDays === 0) dueDate = input.meetingDate;
  if (businessDaysElapsed < policy.thresholdBusinessDays) dueDate = filedLocalDate;

  return {
    policy,
    meetingDate: input.meetingDate,
    filedLocalDate,
    businessDaysElapsed,
    dueDate,
    requiresSupervisorApproval: businessDaysElapsed > policy.thresholdBusinessDays,
    evaluatedDates,
  };
}
