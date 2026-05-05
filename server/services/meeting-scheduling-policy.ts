import { ValidationError } from './service-errors';

export type MeetingSchedulingValidationStatus = 'PASSED' | 'WARNING' | 'BLOCKED';
export type MeetingSchedulingConflictStatus = 'NONE' | 'WARNING' | 'BLOCKED';

export interface MeetingSchedulingCandidate {
  id?: number | null;
  title?: string | null;
  organizerUserId: number;
  inviteeUserIds?: number[];
  leadId?: number | null;
  prospectId?: number | null;
  clientId?: string | null;
  startTime: Date | string;
  endTime: Date | string;
}

export interface ExistingMeetingWindow {
  id: number;
  title?: string | null;
  organizerUserId?: number | null;
  leadId?: number | null;
  prospectId?: number | null;
  clientId?: string | null;
  startTime: Date | string;
  endTime: Date | string;
  status?: string | null;
}

export interface MeetingSchedulingConflict {
  meeting_id: number;
  conflict_type: 'ORGANIZER_OVERLAP' | 'CLIENT_OVERLAP' | 'PROSPECT_OVERLAP' | 'LEAD_OVERLAP' | 'INVITEE_OVERLAP';
  severity: 'WARNING' | 'BLOCKED';
  title: string | null;
  start_time: string;
  end_time: string;
  message: string;
}

export interface MeetingSchedulingWarning {
  code: 'MARKET_NON_BUSINESS_DAY' | 'MARKET_CALENDAR_LOOKUP_FAILED';
  severity: 'WARNING';
  message: string;
  calendar_key?: string;
  date?: string;
}

export interface MeetingSchedulingEvaluation {
  validationStatus: MeetingSchedulingValidationStatus;
  conflictStatus: MeetingSchedulingConflictStatus;
  conflicts: MeetingSchedulingConflict[];
  warnings: MeetingSchedulingWarning[];
  calendarKey: string;
  meetingDate: string;
  marketHolidayWarning: boolean;
  marketHolidayName: string | null;
  evaluatedAt: string;
}

export function parseMeetingDate(value: Date | string, fieldName: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }
  return parsed;
}

export function validateMeetingSchedulingWindow(input: {
  startTime: Date | string;
  endTime: Date | string;
  now?: Date;
  requireFuture?: boolean;
  minDurationMinutes?: number;
  maxDurationHours?: number;
}): { startTime: Date; endTime: Date; durationMinutes: number } {
  const startTime = parseMeetingDate(input.startTime, 'start_time');
  const endTime = parseMeetingDate(input.endTime, 'end_time');
  const minDurationMinutes = input.minDurationMinutes ?? 15;
  const maxDurationHours = input.maxDurationHours ?? 8;

  if (endTime <= startTime) {
    throw new ValidationError('end_time must be after start_time');
  }
  if (input.requireFuture !== false && startTime <= (input.now ?? new Date())) {
    throw new ValidationError('start_time must be in the future');
  }

  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));
  if (durationMinutes < minDurationMinutes) {
    throw new ValidationError(`Meeting duration must be at least ${minDurationMinutes} minutes`);
  }
  if (durationMinutes > maxDurationHours * 60) {
    throw new ValidationError(`Meeting duration cannot exceed ${maxDurationHours} hours`);
  }

  return { startTime, endTime, durationMinutes };
}

export function meetingWindowsOverlap(
  firstStart: Date | string,
  firstEnd: Date | string,
  secondStart: Date | string,
  secondEnd: Date | string,
): boolean {
  const aStart = parseMeetingDate(firstStart, 'first_start_time').getTime();
  const aEnd = parseMeetingDate(firstEnd, 'first_end_time').getTime();
  const bStart = parseMeetingDate(secondStart, 'second_start_time').getTime();
  const bEnd = parseMeetingDate(secondEnd, 'second_end_time').getTime();
  return aStart < bEnd && aEnd > bStart;
}

function activeSchedulingStatus(status?: string | null): boolean {
  return !status || status === 'SCHEDULED';
}

function conflictMessage(type: MeetingSchedulingConflict['conflict_type'], title: string | null): string {
  const label = title ? `"${title}"` : 'another meeting';
  switch (type) {
    case 'ORGANIZER_OVERLAP':
      return `Organizer has an overlapping scheduled meeting with ${label}`;
    case 'INVITEE_OVERLAP':
      return `Invitee has an overlapping scheduled meeting with ${label}`;
    case 'CLIENT_OVERLAP':
      return `Client has an overlapping scheduled meeting with ${label}`;
    case 'PROSPECT_OVERLAP':
      return `Prospect has an overlapping scheduled meeting with ${label}`;
    case 'LEAD_OVERLAP':
      return `Lead has an overlapping scheduled meeting with ${label}`;
    default:
      return `Scheduling overlap detected with ${label}`;
  }
}

function classifyConflict(candidate: MeetingSchedulingCandidate, meeting: ExistingMeetingWindow): MeetingSchedulingConflict['conflict_type'] | null {
  if (meeting.organizerUserId != null && meeting.organizerUserId === candidate.organizerUserId) {
    return 'ORGANIZER_OVERLAP';
  }
  if (candidate.clientId && meeting.clientId === candidate.clientId) return 'CLIENT_OVERLAP';
  if (candidate.prospectId && meeting.prospectId === candidate.prospectId) return 'PROSPECT_OVERLAP';
  if (candidate.leadId && meeting.leadId === candidate.leadId) return 'LEAD_OVERLAP';
  if (candidate.inviteeUserIds?.length && meeting.organizerUserId != null && candidate.inviteeUserIds.includes(meeting.organizerUserId)) {
    return 'INVITEE_OVERLAP';
  }
  return null;
}

export function evaluateMeetingScheduling(input: {
  candidate: MeetingSchedulingCandidate;
  existingMeetings: ExistingMeetingWindow[];
  calendarKey: string;
  meetingDate: string;
  isBusinessDay: boolean;
  holidayName?: string | null;
  evaluatedAt?: Date;
  excludedMeetingId?: number | null;
}): MeetingSchedulingEvaluation {
  const candidateWindow = validateMeetingSchedulingWindow({
    startTime: input.candidate.startTime,
    endTime: input.candidate.endTime,
    requireFuture: false,
  });
  const conflicts: MeetingSchedulingConflict[] = [];

  for (const meeting of input.existingMeetings) {
    if (meeting.id === input.excludedMeetingId || meeting.id === input.candidate.id) continue;
    if (!activeSchedulingStatus(meeting.status)) continue;
    if (!meetingWindowsOverlap(candidateWindow.startTime, candidateWindow.endTime, meeting.startTime, meeting.endTime)) continue;

    const conflictType = classifyConflict(input.candidate, meeting);
    if (!conflictType) continue;
    const startTime = parseMeetingDate(meeting.startTime, 'existing_start_time');
    const endTime = parseMeetingDate(meeting.endTime, 'existing_end_time');
    conflicts.push({
      meeting_id: meeting.id,
      conflict_type: conflictType,
      severity: 'WARNING',
      title: meeting.title ?? null,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      message: conflictMessage(conflictType, meeting.title ?? null),
    });
  }

  const warnings: MeetingSchedulingWarning[] = [];
  const calendarKey = input.calendarKey.trim().toUpperCase();
  if (!input.isBusinessDay) {
    warnings.push({
      code: 'MARKET_NON_BUSINESS_DAY',
      severity: 'WARNING',
      calendar_key: calendarKey,
      date: input.meetingDate,
      message: input.holidayName
        ? `Meeting falls on ${input.holidayName} in ${calendarKey}`
        : `Meeting falls on a non-business day in ${calendarKey}`,
    });
  }

  const conflictStatus: MeetingSchedulingConflictStatus = conflicts.length > 0 ? 'WARNING' : 'NONE';
  const validationStatus: MeetingSchedulingValidationStatus = conflictStatus !== 'NONE' || warnings.length > 0 ? 'WARNING' : 'PASSED';

  return {
    validationStatus,
    conflictStatus,
    conflicts,
    warnings,
    calendarKey,
    meetingDate: input.meetingDate,
    marketHolidayWarning: !input.isBusinessDay,
    marketHolidayName: input.holidayName ?? null,
    evaluatedAt: (input.evaluatedAt ?? new Date()).toISOString(),
  };
}
