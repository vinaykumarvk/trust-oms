/**
 * Meeting Management Service (CRM-MTG)
 *
 * Handles meeting CRUD, calendar views, reminders, invitee notifications,
 * and team calendar aggregation for SRM.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, asc, gte, lte, between, ilike, or } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from './service-errors';
import { notificationInboxService } from './notification-inbox-service';

type MeetingRow = typeof schema.meetings.$inferSelect;
type MeetingInvitee = typeof schema.meetingInvitees.$inferSelect;

export async function generateMeetingCode(): Promise<string> {
  const now = new Date();
  const dateSegment = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const pattern = `MTG-${dateSegment}-%`;
  const result = await db.execute(sql`SELECT meeting_code FROM meetings WHERE meeting_code LIKE ${pattern} ORDER BY meeting_code DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).meeting_code;
    const lastSeq = parseInt(lastCode.split('-').pop() || '0', 10);
    nextSeq = lastSeq + 1;
  }
  return `MTG-${dateSegment}-${String(nextSeq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Helpers for Calendar & Call Report Module
// ---------------------------------------------------------------------------

async function resolveRelationshipName(
  leadId?: number | null,
  prospectId?: number | null,
  clientId?: string | null,
): Promise<{ name: string; phone: string | null; email: string | null }> {
  if (clientId) {
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.client_id, clientId))
      .limit(1);
    if (client) {
      const c = client as Record<string, unknown>;
      return {
        name: (typeof c.client_name === 'string' ? c.client_name : null) ?? clientId,
        phone: typeof c.phone === 'string' ? c.phone : null,
        email: typeof c.email === 'string' ? c.email : null,
      };
    }
  }
  if (prospectId) {
    const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.id, prospectId)).limit(1);
    if (prospect) {
      return { name: `${prospect.first_name} ${prospect.last_name}`, phone: prospect.mobile_phone, email: prospect.email };
    }
  }
  if (leadId) {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).limit(1);
    if (lead) {
      return { name: `${lead.first_name} ${lead.last_name}`, phone: lead.mobile_phone, email: lead.email };
    }
  }
  return { name: '', phone: null, email: null };
}

async function insertConversationHistory(entry: {
  lead_id?: number | null;
  prospect_id?: number | null;
  client_id?: string | null;
  interaction_type: (typeof schema.conversationTypeEnum.enumValues)[number];
  summary: string;
  reference_type?: string;
  reference_id?: number;
  created_by?: string | null;
}, txOrDb: typeof db = db) {
  await txOrDb.insert(schema.conversationHistory).values({
    lead_id: entry.lead_id ?? null,
    prospect_id: entry.prospect_id ?? null,
    client_id: entry.client_id ?? null,
    interaction_type: entry.interaction_type,
    summary: entry.summary,
    reference_type: entry.reference_type ?? null,
    reference_id: entry.reference_id ?? null,
    created_by: entry.created_by ?? null,
  });
}

export const meetingService = {
  async create(data: {
    title: string;
    meeting_type: string;
    mode?: string;
    purpose?: string;
    meeting_reason?: string;
    meeting_reason_other?: string;
    is_all_day?: boolean;
    campaign_id?: number;
    lead_id?: number;
    prospect_id?: number;
    client_id?: string;
    related_entity_type?: string;
    related_entity_id?: number;
    organizer_user_id: number;
    start_time: string;
    end_time: string;
    location?: string;
    reminder_minutes?: number;
    notes?: string;
    branch_id?: number;
    created_by?: string;
    invitees?: Array<{
      user_id?: number;
      lead_id?: number;
      prospect_id?: number;
      client_id?: string;
      is_required?: boolean;
    }>;
  }): Promise<MeetingRow> {
    const startTime = new Date(data.start_time);
    const endTime = new Date(data.end_time);
    if (startTime <= new Date()) {
      throw new ValidationError('start_time must be in the future');
    }
    if (endTime <= startTime) {
      throw new ValidationError('end_time must be after start_time');
    }
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    // BRD G-023: minimum 15-minute duration
    if (durationMs < 15 * 60 * 1000) {
      throw new ValidationError('Meeting duration must be at least 15 minutes');
    }
    if (durationHours > 8) {
      throw new ValidationError('Meeting duration cannot exceed 8 hours');
    }

    // BRD CALL-031: at least one required invitee must be specified
    const hasRequiredInvitee = data.invitees && data.invitees.some((inv) => inv.is_required !== false);
    if (!hasRequiredInvitee) {
      throw new ValidationError('At least one required invitee must be specified');
    }

    // GAP-024: Duplicate meeting detection — warn if organizer has a meeting ±30 min of this slot
    const windowStart = new Date(startTime.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(endTime.getTime() + 30 * 60 * 1000);
    const conflicts = await db
      .select({ id: schema.meetings.id, title: schema.meetings.title, start_time: schema.meetings.start_time })
      .from(schema.meetings)
      .where(
        and(
          eq(schema.meetings.organizer_user_id, data.organizer_user_id),
          eq(schema.meetings.is_deleted, false),
          lte(schema.meetings.start_time, windowEnd),
          gte(schema.meetings.end_time, windowStart),
        ),
      )
      .limit(1);
    if (conflicts.length > 0) {
      // Warning only — not a hard block; include conflict info in response via metadata property
      (data as Record<string, unknown>)._conflict_warning = `Scheduling conflict: overlaps with meeting "${conflicts[0].title}" at ${new Date(conflicts[0].start_time).toISOString()}`;
    }

    const meeting_code = await generateMeetingCode();

    // Resolve relationship name + contact info
    const rel = await resolveRelationshipName(data.lead_id, data.prospect_id, data.client_id);

    const result = await db.transaction(async (tx: typeof db) => {
      const [meeting] = await tx.insert(schema.meetings).values({
        meeting_code,
        title: data.title,
        // Drizzle enum types require cast when value comes from untyped input
        meeting_type: data.meeting_type as typeof schema.meetingTypeEnum.enumValues[number],
        mode: data.mode as typeof schema.meetingModeEnum.enumValues[number],
        purpose: data.purpose as typeof schema.meetingPurposeEnum.enumValues[number],
        meeting_reason: data.meeting_reason as typeof schema.meetingReasonEnum.enumValues[number],
        meeting_reason_other: data.meeting_reason_other,
        is_all_day: data.is_all_day ?? false,
        campaign_id: data.campaign_id,
        lead_id: data.lead_id,
        prospect_id: data.prospect_id,
        client_id: data.client_id,
        related_entity_type: data.related_entity_type,
        related_entity_id: data.related_entity_id,
        organizer_user_id: data.organizer_user_id,
        start_time: startTime,
        end_time: endTime,
        location: data.location,
        reminder_minutes: data.reminder_minutes ?? 30,
        notes: data.notes,
        relationship_name: rel.name || null,
        contact_phone: rel.phone,
        contact_email: rel.email,
        call_report_status: null,
        branch_id: data.branch_id,
        created_by: data.created_by,
      }).returning();

      if (data.invitees && data.invitees.length > 0) {
        await tx.insert(schema.meetingInvitees).values(
          data.invitees.map((inv) => ({
            meeting_id: meeting.id,
            user_id: inv.user_id,
            lead_id: inv.lead_id,
            prospect_id: inv.prospect_id,
            client_id: inv.client_id,
            is_required: inv.is_required ?? true,
          }))
        );
      }

      // ConversationHistory side effect
      await insertConversationHistory({
        lead_id: data.lead_id,
        prospect_id: data.prospect_id,
        client_id: data.client_id,
        interaction_type: 'MEETING_SCHEDULED',
        summary: `Meeting "${data.title}" scheduled for ${startTime.toLocaleDateString()}`,
        reference_type: 'MEETING',
        reference_id: meeting.id,
        created_by: data.created_by,
      }, tx);

      return meeting;
    });

    // GAP-024: attach conflict warning to the result (non-blocking)
    const conflictWarning = (data as Record<string, unknown>)._conflict_warning as string | undefined;
    if (conflictWarning) {
      return { ...result, conflict_warning: conflictWarning } as MeetingRow;
    }
    return result;
  },

  async getById(id: number): Promise<MeetingRow & { invitees: MeetingInvitee[] }> {
    const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id));
    if (!meeting) throw new NotFoundError('Meeting not found');

    const invitees = await db.select().from(schema.meetingInvitees)
      .where(eq(schema.meetingInvitees.meeting_id, id));

    return { ...meeting, invitees };
  },

  async update(id: number, data: Partial<{
    title: string;
    meeting_type: string;
    mode: string;
    start_time: string;
    end_time: string;
    location: string;
    reminder_minutes: number;
    notes: string;
    is_all_day: boolean;
  }>, userId?: number): Promise<MeetingRow> {
    // Always fetch the existing meeting for IDOR check and partial-time validation (QUA-06)
    const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1);
    if (!meeting) throw new NotFoundError('Meeting not found');

    // IDOR protection: verify ownership
    if (userId) {
      if (meeting.organizer_user_id !== userId) {
        throw new ForbiddenError('Not authorized to modify this meeting');
      }
    }

    // QUA-05: Use !== undefined instead of truthiness to avoid skipping falsy values
    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.meeting_type !== undefined) updates.meeting_type = data.meeting_type;
    if (data.mode !== undefined) updates.mode = data.mode;
    if (data.start_time !== undefined) updates.start_time = new Date(data.start_time);
    if (data.end_time !== undefined) updates.end_time = new Date(data.end_time);
    if (data.location !== undefined) updates.location = data.location;
    if (data.reminder_minutes !== undefined) updates.reminder_minutes = data.reminder_minutes;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.is_all_day !== undefined) updates.is_all_day = data.is_all_day;

    // QUA-06: Validate resulting times when either start_time or end_time is provided,
    // cross-checking against the existing meeting's stored values
    if (updates.start_time !== undefined || updates.end_time !== undefined) {
      const effectiveStart = (updates.start_time ?? meeting.start_time) as Date;
      const effectiveEnd = (updates.end_time ?? meeting.end_time) as Date;
      if (new Date(effectiveEnd) <= new Date(effectiveStart)) {
        throw new ValidationError('end_time must be after start_time');
      }
    }

    const [updated] = await db.update(schema.meetings)
      .set(updates)
      .where(eq(schema.meetings.id, id))
      .returning();
    return updated;
  },

  /**
   * Mark a meeting as completed (FR-018).
   */
  async complete(id: number, userId: number): Promise<MeetingRow> {
    const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1);
    if (!meeting) throw new NotFoundError(`Meeting not found: ${id}`);

    // IDOR protection: verify ownership
    if (userId && meeting.organizer_user_id !== userId) {
      throw new ForbiddenError('Not authorized to modify this meeting');
    }

    if (meeting.meeting_status !== 'SCHEDULED') {
      throw new ValidationError(
        `Cannot complete meeting in ${meeting.meeting_status} status. Only SCHEDULED meetings can be completed.`,
      );
    }

    return await db.transaction(async (tx: typeof db) => {
      const [updated] = await tx.update(schema.meetings)
        .set({
          meeting_status: 'COMPLETED',
          completed_at: new Date(),
          completed_by: userId,
          call_report_status: 'PENDING',
          updated_at: new Date(),
          updated_by: String(userId),
        })
        .where(eq(schema.meetings.id, id))
        .returning();

      await insertConversationHistory({
        lead_id: meeting.lead_id,
        prospect_id: meeting.prospect_id,
        client_id: meeting.client_id,
        interaction_type: 'MEETING_COMPLETED',
        summary: `Meeting "${meeting.title}" marked as completed`,
        reference_type: 'MEETING',
        reference_id: id,
        created_by: String(userId),
      }, tx);

      return updated;
    });
  },

  async cancel(id: number, cancel_reason: string, userId?: number, callerRole?: string): Promise<MeetingRow> {
    // AC-033: cancel_reason is required with a minimum length of 10 characters
    if (!cancel_reason || cancel_reason.trim().length === 0) {
      throw new ValidationError('cancel_reason is required');
    }
    if (cancel_reason.trim().length < 10) {
      throw new ValidationError('cancel_reason must be at least 10 characters');
    }

    const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id));
    if (!meeting) throw new NotFoundError('Meeting not found');

    // P2-07: SENIOR_RM and BO_HEAD can cancel any team meeting (supervisor override)
    const isSupervisor = callerRole === 'SENIOR_RM' || callerRole === 'BO_HEAD' || callerRole === 'SYSTEM_ADMIN';
    const isTeamMeeting = meeting.meeting_type === 'TEAM';
    // IDOR protection: verify ownership; supervisors may override for team meetings
    if (userId && meeting.organizer_user_id !== userId && !(isSupervisor && isTeamMeeting)) {
      throw new ForbiddenError('Not authorized to modify this meeting');
    }

    if (meeting.meeting_status !== 'SCHEDULED') {
      throw new ValidationError(
        `Cannot cancel meeting in ${meeting.meeting_status} status. Only SCHEDULED meetings can be cancelled.`,
      );
    }

    // Check if a call report already exists for this meeting
    const existingReports = await db
      .select()
      .from(schema.callReports)
      .where(eq(schema.callReports.meeting_id, id))
      .limit(1);
    if (existingReports.length > 0) {
      throw new ConflictError('Cannot cancel a meeting that has an associated call report');
    }

    const result = await db.transaction(async (tx: typeof db) => {
      const [updated] = await tx.update(schema.meetings)
        .set({
          meeting_status: 'CANCELLED',
          cancel_reason: cancel_reason.trim(),
          updated_at: new Date(),
          updated_by: userId ? String(userId) : null,
        })
        .where(eq(schema.meetings.id, id))
        .returning();

      await insertConversationHistory({
        lead_id: meeting.lead_id,
        prospect_id: meeting.prospect_id,
        client_id: meeting.client_id,
        interaction_type: 'MEETING_CANCELLED',
        summary: `Meeting "${meeting.title}" cancelled: ${cancel_reason.trim()}`,
        reference_type: 'MEETING',
        reference_id: id,
        created_by: userId ? String(userId) : null,
      }, tx);

      return updated;
    });

    // AC-034: Notify all attendees of cancellation
    try {
      const invitees = await db.select({ user_id: schema.meetingInvitees.user_id })
        .from(schema.meetingInvitees)
        .where(eq(schema.meetingInvitees.meeting_id, id));
      const recipientIds = invitees
        .map((i: { user_id: number | null }) => i.user_id)
        .filter((uid: number | null): uid is number => uid !== null && uid !== userId);
      if (recipientIds.length > 0) {
        await notificationInboxService.notifyMultiple(recipientIds, {
          type: 'MEETING_CANCELLED',
          title: 'Meeting Cancelled',
          message: `Meeting "${meeting.title}" has been cancelled. Reason: ${cancel_reason.trim()}`,
          channel: 'IN_APP',
          related_entity_type: 'meeting',
          related_entity_id: id,
        });
      }
    } catch (notifErr) {
      console.error('[Meeting] Failed to notify attendees of cancellation:', notifErr);
    }

    return result;
  },

  async reschedule(id: number, new_start_time: string, new_end_time: string, userId?: number): Promise<MeetingRow> {
    const startTime = new Date(new_start_time);
    const endTime = new Date(new_end_time);
    // P2-06: Rescheduling to a past date is not allowed
    if (startTime <= new Date()) {
      throw new ValidationError('Cannot reschedule a meeting to a past date/time. New start_time must be in the future.');
    }
    if (endTime <= startTime) {
      throw new ValidationError('end_time must be after start_time');
    }

    const [meeting] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1);
    if (!meeting) throw new NotFoundError('Meeting not found');

    // IDOR protection: verify ownership
    if (userId && meeting.organizer_user_id !== userId) {
      throw new ForbiddenError('Not authorized to modify this meeting');
    }

    if (meeting.meeting_status !== 'SCHEDULED') {
      throw new ValidationError(
        `Cannot reschedule meeting in ${meeting.meeting_status} status. Only SCHEDULED meetings can be rescheduled.`,
      );
    }

    // CRIT-2: Generate code before the transaction to avoid using pool inside tx.
    // The DB unique constraint on meeting_code remains the authoritative collision guard.
    const newMeetingCode = await generateMeetingCode();

    // AC-029: Reschedule creates a NEW meeting and marks old as RESCHEDULED
    const newMeeting = await db.transaction(async (tx: typeof db) => {
      // 1. Read existing invitees BEFORE making any changes (HIGH-5: avoid reading stale state)
      const existingInvitees = await tx.select().from(schema.meetingInvitees)
        .where(eq(schema.meetingInvitees.meeting_id, id));

      // 2. Create the new meeting with all the same fields but new times and parent_meeting_id set
      const [created] = await tx.insert(schema.meetings).values({
        meeting_code: newMeetingCode,
        title: meeting.title,
        meeting_type: meeting.meeting_type,
        mode: meeting.mode ?? undefined,
        purpose: meeting.purpose ?? undefined,
        meeting_reason: meeting.meeting_reason ?? undefined,
        meeting_reason_other: meeting.meeting_reason_other ?? undefined,
        is_all_day: meeting.is_all_day,
        campaign_id: meeting.campaign_id ?? undefined,
        lead_id: meeting.lead_id ?? undefined,
        prospect_id: meeting.prospect_id ?? undefined,
        client_id: meeting.client_id ?? undefined,
        related_entity_type: meeting.related_entity_type ?? undefined,
        related_entity_id: meeting.related_entity_id ?? undefined,
        organizer_user_id: meeting.organizer_user_id,
        start_time: startTime,
        end_time: endTime,
        location: meeting.location ?? undefined,
        reminder_minutes: meeting.reminder_minutes ?? 30,
        notes: meeting.notes ?? undefined,
        relationship_name: meeting.relationship_name ?? undefined,
        contact_phone: meeting.contact_phone ?? undefined,
        contact_email: meeting.contact_email ?? undefined,
        branch_id: meeting.branch_id ?? undefined,
        meeting_status: 'SCHEDULED',
        reminder_sent: false,
        parent_meeting_id: id,   // AC-029: link back to original meeting
        created_by: userId ? String(userId) : undefined,
      }).returning();

      // 3. Mark the old meeting as RESCHEDULED and store the reference to the new meeting
      await tx.update(schema.meetings)
        .set({
          meeting_status: 'RESCHEDULED',
          rescheduled_to_id: created.id,
          updated_at: new Date(),
          updated_by: userId ? String(userId) : null,
        })
        .where(eq(schema.meetings.id, id));

      // 4. Copy existing invitees to the new meeting (read before tx started — see HIGH-5 fix)
      if (existingInvitees.length > 0) {
        await tx.insert(schema.meetingInvitees).values(
          existingInvitees.map((inv: MeetingInvitee) => ({
            meeting_id: created.id,
            user_id: inv.user_id ?? undefined,
            lead_id: inv.lead_id ?? undefined,
            prospect_id: inv.prospect_id ?? undefined,
            client_id: inv.client_id ?? undefined,
            is_required: inv.is_required,
            rsvp_status: 'PENDING' as const,
            attended: false,
          })),
        );
      }

      await insertConversationHistory({
        lead_id: meeting.lead_id,
        prospect_id: meeting.prospect_id,
        client_id: meeting.client_id,
        interaction_type: 'MEETING_RESCHEDULED',
        summary: `Meeting "${meeting.title}" rescheduled from ${meeting.start_time?.toLocaleDateString()} to ${startTime.toLocaleDateString()} (new meeting #${created.id})`,
        reference_type: 'MEETING',
        reference_id: created.id,
        created_by: userId ? String(userId) : null,
      }, tx);

      return created;
    });

    // AC-030: Notify all attendees of reschedule
    try {
      const invitees = await db.select({ user_id: schema.meetingInvitees.user_id })
        .from(schema.meetingInvitees)
        .where(eq(schema.meetingInvitees.meeting_id, newMeeting.id));
      const recipientIds = invitees
        .map((i: { user_id: number | null }) => i.user_id)
        .filter((uid: number | null): uid is number => uid !== null && uid !== userId);
      if (recipientIds.length > 0) {
        await notificationInboxService.notifyMultiple(recipientIds, {
          type: 'MEETING_RESCHEDULED',
          title: 'Meeting Rescheduled',
          message: `Meeting "${meeting.title}" has been rescheduled from ${meeting.start_time?.toLocaleDateString()} to ${startTime.toLocaleDateString()}.`,
          channel: 'IN_APP',
          related_entity_type: 'meeting',
          related_entity_id: newMeeting.id,
        });
      }
    } catch (notifErr) {
      console.error('[Meeting] Failed to notify attendees of reschedule:', notifErr);
    }

    return newMeeting;
  },

  async getCalendarData(userId: number, startDate: string, endDate: string): Promise<MeetingRow[]> {
    const meetings = await db.select().from(schema.meetings)
      .where(and(
        eq(schema.meetings.organizer_user_id, userId),
        gte(schema.meetings.start_time, new Date(startDate)),
        lte(schema.meetings.start_time, new Date(endDate)),
      ))
      .orderBy(schema.meetings.start_time);

    const invitedMeetings = await db.select({
      meeting: schema.meetings,
    }).from(schema.meetingInvitees)
      .innerJoin(schema.meetings, eq(schema.meetingInvitees.meeting_id, schema.meetings.id))
      .where(and(
        eq(schema.meetingInvitees.user_id, userId),
        gte(schema.meetings.start_time, new Date(startDate)),
        lte(schema.meetings.start_time, new Date(endDate)),
      ));

    const allMeetings = [
      ...meetings,
      ...invitedMeetings.map((m: { meeting: typeof meetings[0] }) => m.meeting),
    ];

    // Deduplicate by id
    const seen = new Set<number>();
    return allMeetings.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  },

  async getTeamCalendar(teamRmIds: number[], startDate: string, endDate: string): Promise<MeetingRow[]> {
    const meetings = await db.select().from(schema.meetings)
      .where(and(
        sql`${schema.meetings.organizer_user_id} = ANY(${teamRmIds})`,
        gte(schema.meetings.start_time, new Date(startDate)),
        lte(schema.meetings.start_time, new Date(endDate)),
      ))
      .orderBy(schema.meetings.start_time);

    return meetings;
  },

  async getPendingReminders(): Promise<MeetingRow[]> {
    const now = new Date();
    const meetings = await db.select().from(schema.meetings)
      .where(and(
        eq(schema.meetings.meeting_status, 'SCHEDULED'),
        eq(schema.meetings.reminder_1h_sent, false),
        lte(schema.meetings.start_time, new Date(now.getTime() + 24 * 60 * 60 * 1000)),
        gte(schema.meetings.start_time, now),
      ));

    return meetings.filter((m: { start_time: Date; reminder_minutes: number | null }) => {
      const reminderTime = new Date(new Date(m.start_time).getTime() - (m.reminder_minutes ?? 30) * 60 * 1000);
      return now >= reminderTime;
    });
  },

  /**
   * GAP-037: Return SCHEDULED meetings starting in the 24-hour window (23h-25h from now)
   * that have not yet been reminded. Does NOT mark reminder_sent.
   */
  async get24hPendingReminders(): Promise<MeetingRow[]> {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    return db.select().from(schema.meetings)
      .where(and(
        eq(schema.meetings.meeting_status, 'SCHEDULED'),
        eq(schema.meetings.reminder_24h_sent, false),
        gte(schema.meetings.start_time, windowStart),
        lte(schema.meetings.start_time, windowEnd),
      ));
  },

  async markReminderSent(meetingId: number, reminderType: '1h' | '24h' | 'custom' = 'custom'): Promise<void> {
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (reminderType === '24h') {
      updates.reminder_24h_sent = true;
    } else if (reminderType === '1h') {
      updates.reminder_1h_sent = true;
      updates.reminder_sent = true;
    } else {
      updates.reminder_sent = true;
    }

    await db.update(schema.meetings)
      .set(updates as any)
      .where(eq(schema.meetings.id, meetingId));
  },

  /**
   * BR-008: Auto-transition past meetings to COMPLETED.
   *
   * Queries for SCHEDULED meetings whose end_time is more than 1 hour in the
   * past and batch-updates them to COMPLETED. Run as a fire-and-forget
   * side-effect when listing meetings so the calendar always reflects reality.
   */
  async autoCompletePastMeetings(): Promise<void> {
    // Only auto-complete meetings older than 1 hour (to allow for running meetings)
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    try {
      await db
        .update(schema.meetings)
        .set({
          meeting_status: 'COMPLETED',
          completed_at: new Date(),
          call_report_status: 'PENDING',
          updated_at: new Date(),
          updated_by: 'SYSTEM',   // HIGH-4: mark system-driven completions for audit trail
        })
        .where(
          and(
            eq(schema.meetings.meeting_status, 'SCHEDULED'),
            lte(schema.meetings.end_time, cutoff),
          ),
        );
    } catch (err) {
      // Non-fatal — log and move on
      console.error('[Meeting] BR-008 autoCompletePastMeetings failed:', err);
    }
  },

  /**
   * BRD FR-019: Auto-transition stale scheduled meetings to NO_SHOW.
   *
   * Manual completion remains explicit through complete(). The batch path marks
   * unattended meetings past the grace period as no-show and records conversation
   * history so supervisors can audit why no call report may be filed.
   */
  async processNoShowMeetings(graceMinutes = 60): Promise<number> {
    const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);

    const staleMeetings = await db
      .select()
      .from(schema.meetings)
      .where(
        and(
          eq(schema.meetings.meeting_status, 'SCHEDULED'),
          eq(schema.meetings.is_deleted, false),
          lte(schema.meetings.end_time, cutoff),
        ),
      );

    for (const meeting of staleMeetings) {
      await db.transaction(async (tx: typeof db) => {
        await tx.update(schema.meetings)
          .set({
            meeting_status: 'NO_SHOW',
            call_report_status: 'NO_SHOW',
            updated_at: new Date(),
            updated_by: 'SYSTEM_NO_SHOW_JOB',
          } as any)
          .where(eq(schema.meetings.id, meeting.id));

        await insertConversationHistory({
          lead_id: meeting.lead_id,
          prospect_id: meeting.prospect_id,
          client_id: meeting.client_id,
          interaction_type: 'MEETING_NO_SHOW',
          summary: `Meeting "${meeting.title}" marked as no-show by scheduler`,
          reference_type: 'MEETING',
          reference_id: meeting.id,
          created_by: 'SYSTEM_NO_SHOW_JOB',
        }, tx);
      });

      if (meeting.organizer_user_id) {
        await notificationInboxService.notify({
          recipient_user_id: meeting.organizer_user_id,
          type: 'MEETING_NO_SHOW',
          title: 'Meeting Marked No-Show',
          message: `Meeting "${meeting.title}" was marked as no-show after the configured grace period.`,
          channel: 'IN_APP',
          related_entity_type: 'meeting',
          related_entity_id: meeting.id,
        });
      }
    }

    return staleMeetings.length;
  },

  /**
   * Enhanced calendar data endpoint with filters and pagination.
   */
  async getFilteredCalendarData(filters: {
    startDate?: string;
    endDate?: string;
    meetingStatus?: string;
    meetingReason?: string;
    organizerUserId?: number;
    branchId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: MeetingRow[]; total: number; page: number; pageSize: number }> {
    // FR-019: Fire-and-forget no-show transition for stale scheduled meetings.
    void this.processNoShowMeetings();

    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 100, 200);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.startDate) {
      conditions.push(gte(schema.meetings.start_time, new Date(filters.startDate)));
    }
    if (filters.endDate) {
      conditions.push(lte(schema.meetings.start_time, new Date(filters.endDate)));
    }
    if (filters.meetingStatus) {
      // Drizzle enum types require cast when filter value comes from untyped input
      conditions.push(eq(schema.meetings.meeting_status, filters.meetingStatus as typeof schema.meetingStatusEnum.enumValues[number]));
    }
    if (filters.meetingReason) {
      // Drizzle enum types require cast when filter value comes from untyped input
      conditions.push(eq(schema.meetings.meeting_reason, filters.meetingReason as typeof schema.meetingReasonEnum.enumValues[number]));
    }
    if (filters.organizerUserId) {
      conditions.push(eq(schema.meetings.organizer_user_id, filters.organizerUserId));
    }
    if (filters.branchId) {
      conditions.push(eq(schema.meetings.branch_id, filters.branchId));
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(schema.meetings.title, searchTerm),
          ilike(schema.meetings.relationship_name, searchTerm),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      db.select().from(schema.meetings)
        .where(where)
        .orderBy(asc(schema.meetings.start_time))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.meetings)
        .where(where),
    ]);

    return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
  },

  /**
   * Replace invitees for a meeting.
   */
  async updateInvitees(
    meetingId: number,
    invitees: Array<{
      user_id?: number | null;
      lead_id?: number | null;
      prospect_id?: number | null;
      client_id?: string | null;
      is_required?: boolean;
    }>,
  ): Promise<MeetingInvitee[]> {
    const [meeting] = await db.select().from(schema.meetings)
      .where(eq(schema.meetings.id, meetingId)).limit(1);
    if (!meeting) throw new NotFoundError(`Meeting not found: ${meetingId}`);

    await db.delete(schema.meetingInvitees)
      .where(eq(schema.meetingInvitees.meeting_id, meetingId));

    if (invitees.length > 0) {
      await db.insert(schema.meetingInvitees).values(
        invitees.map((inv) => ({
          meeting_id: meetingId,
          user_id: inv.user_id ?? null,
          lead_id: inv.lead_id ?? null,
          prospect_id: inv.prospect_id ?? null,
          client_id: inv.client_id ?? null,
          is_required: inv.is_required ?? true,
          rsvp_status: 'PENDING' as const,
          attended: false,
        })),
      );
    }

    return db.select().from(schema.meetingInvitees)
      .where(eq(schema.meetingInvitees.meeting_id, meetingId));
  },
};
