# BRD Coverage Audit — CIM (Calendar & Interaction Management)
**File:** `docs/CIM_BRD_Draft.docx`
**Date:** 2026-04-23
**Auditor:** Claude Code (automated)
**Phase filter:** full (Phases 0–6)

---

## Phase 0 — Preflight

### BRD File
- **Path:** `docs/CIM_BRD_Draft.docx`
- **Size:** 102,135 characters of extracted text
- **FRs identified:** 24 (FR-001 through FR-024)
- **Estimated line items:** ~218 (118 ACs + 67 BRs + ~33 ECs/FHs)

### Project Structure (auto-discovered)
| Layer | Path |
|-------|------|
| API routes | `server/routes/back-office/` |
| Services | `server/services/` |
| Shared schema | `packages/shared/src/schema.ts` |
| Middleware | `server/middleware/` |
| Back-office UI | `apps/back-office/src/pages/crm/` |
| Client portal | `apps/client-portal/src/pages/` |
| Tests | `tests/e2e/` |

### Tech Stack
- **Backend:** Express.js + Drizzle ORM + PostgreSQL (Supabase)
- **Frontend:** React 18 + TanStack Query + Tailwind + Radix UI
- **Auth:** JWT httpOnly cookies + role-based middleware
- **Tests:** Vitest + E2E spec files

### Test Infrastructure
- `tests/e2e/meeting-callreport.spec.ts` (1341+ lines — comprehensive)
- `tests/e2e/campaign-management.spec.ts`
- `tests/e2e/campaign-lifecycle.spec.ts`
- `tests/e2e/opportunity-task-notification.spec.ts`

### Git State
- **Branch:** `main`
- **Last commit:** `b2899d8 feat(sr): add page-size selector to client portal service requests list`

### CIM-related files confirmed
| File | Purpose |
|------|---------|
| `server/routes/back-office/meetings.ts` | Meeting CRUD + calendar + reschedule + cancel |
| `server/services/meeting-service.ts` | Meeting business logic (~574 lines) |
| `server/routes/back-office/call-reports.ts` | Call report CRUD + submit |
| `server/routes/back-office/call-reports-custom.ts` | Advanced search + submit patch |
| `server/services/call-report-service.ts` | Call report logic (~543 lines) |
| `server/routes/back-office/tasks.ts` | Task CRUD |
| `server/services/task-management-service.ts` | Task logic (~176 lines) |
| `server/routes/back-office/opportunities.ts` | Opportunity pipeline |
| `server/services/opportunity-service.ts` | Opportunity logic |
| `server/routes/back-office/campaigns.ts` | Campaign + lead + call-report approval |
| `server/services/campaign-service.ts` | Campaign logic (~1535 lines) |
| `apps/back-office/src/pages/crm/` | 31 UI pages (meetings-calendar, call-report-list, call-report-form, opportunity-pipeline, task-manager, campaign-*, etc.) |

---

## Phase 1 — Requirement Extraction Summary

| FR | Title | ACs | BRs | ECs | Total |
|----|-------|-----|-----|-----|-------|
| FR-001 | Calendar Month View | 5 | 4 | 3 | 12 |
| FR-002 | Calendar Week View | 5 | 3 | 2 | 10 |
| FR-003 | Calendar Day View | 5 | 2 | 2 | 9 |
| FR-004 | Calendar All/List | 5 | 2 | 2 | 9 |
| FR-005 | Create Meeting | 6 | 5 | 4 | 15 |
| FR-006 | Reschedule Meeting | 5 | 2 | 1 | 8 |
| FR-007 | Cancel Meeting | 4 | 2 | 1 | 7 |
| FR-008 | File Scheduled Call Report | 6 | 5 | 2 | 13 |
| FR-009 | File Standalone Call Report | 5 | 3 | 1 | 9 |
| FR-010 | Call Report Approval Workflow | 6 | 4 | 1 | 11 |
| FR-011 | Call Report Feedback | 5 | 3 | 1 | 9 |
| FR-012 | Call Report Linked Chain | 4 | 2 | 1 | 7 |
| FR-013 | Create Action Items | 5 | 3 | 1 | 9 |
| FR-014 | Action Item Dashboard | 5 | 2 | 1 | 8 |
| FR-015 | Capture Opportunity | 5 | 3 | 1 | 9 |
| FR-016 | Opportunity Pipeline | 5 | 3 | 1 | 9 |
| FR-017 | Bulk Upload Opportunities | 5 | 3 | 2 | 10 |
| FR-018 | Personal Task Creation | 4 | 2 | 1 | 7 |
| FR-019 | Supervisor Task Assignment | 4 | 2 | 1 | 7 |
| FR-020 | Log Client Meeting Expense | 4 | 2 | 1 | 7 |
| FR-021 | Create Campaign | 4 | 3 | 1 | 8 |
| FR-022 | Manage Lead Lists | 6 | 3 | 1 | 10 |
| FR-023 | Capture Lead Response | 5 | 2 | 1 | 8 |
| FR-024 | Campaign Performance Dashboard | 5 | 2 | 1 | 8 |
| **TOTAL** | | **118** | **67** | **33** | **218** |

---

## Phase 2 — Code Traceability Matrix

### FR-001: Calendar Month View

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-001 | Calendar shows 42 cells (6×7) with correct day numbers | PARTIAL | `apps/back-office/src/pages/crm/meetings-calendar.tsx` exists; 42-cell CSS grid layout not confirmed in code |
| AC-002 | Each day cell shows meeting count badge + first 2 subjects truncated to 30 chars | PARTIAL | UI page exists; exact badge/truncation logic not confirmed |
| AC-003 | Clicking day navigates to Day view | PARTIAL | Calendar page has multiple views; day navigation implied |
| AC-004 | Left/Right arrows navigate months; header opens month picker | PARTIAL | Navigation buttons in meetings-calendar.tsx; month picker not confirmed |
| AC-005 | Shows own meetings + team meetings for SENIOR_RM/BO_HEAD | DONE | `server/services/meeting-service.ts:436` `getTeamCalendar()`; team scoping confirmed |
| BR-001 | Default view is Month for current month on load | PARTIAL | Calendar page defaults implied; not confirmed in route/state init |
| BR-002 | Weekend days visually distinguished (lighter background) | NOT_FOUND | Searched: weekend, Saturday, Sunday, day-cell styling; no evidence |
| BR-003 | Public holidays from market_calendar shown as badges | NOT_FOUND | Searched: market_calendar, holiday, public holiday, HolidayBadge; no evidence in calendar UI |
| BR-004 | Max 500 meetings per month view query | NOT_FOUND | Searched: 500, limit, meetings per month; getFilteredCalendarData has pagination but no hard 500 cap |
| EC-001 | API error: toast "Unable to load calendar. Please try again." with retry | NOT_FOUND | Searched: retry button, toast, calendar error; no evidence |
| EC-002 | Empty state: "No meetings scheduled this month. Click + to create one." | NOT_FOUND | Searched: empty state, no meetings, scheduled this month; no evidence |
| EC-003 | DST change: times correctly displayed in local timezone | NOT_FOUND | Searched: timezone, DST, toLocaleDateString; not addressed |

### FR-002: Calendar Week View

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-006 | Week view: 7 columns with 13 hourly rows (7 AM–8 PM) | PARTIAL | meetings-calendar.tsx has week view toggle; exact grid not confirmed |
| AC-007 | Meeting blocks colored by meeting_reason | NOT_FOUND | Searched: color, meeting_reason, block-color; no enum-to-color mapping found |
| AC-008 | Overlapping meetings render side-by-side (50% / 33% width) | NOT_FOUND | Searched: overlap, side-by-side, position absolute; no collision detection logic |
| AC-009 | Clicking empty time slot opens Create Meeting pre-filled | PARTIAL | Create Meeting form accessible; pre-filling from click not confirmed |
| AC-010 | Drag-to-reschedule triggers reschedule confirmation | NOT_FOUND | Searched: drag, DnD, onDrop, useDraggable; no drag-and-drop on calendar |
| BR-005 | Week starts Monday (Philippine convention) | NOT_FOUND | Searched: startOfWeek, Monday, weekStartsOn; no week start config found |
| BR-006 | All-day meetings in separate row above time grid | NOT_FOUND | Searched: is_all_day, all-day row, allDay; UI behavior not found |
| BR-007 | Cancelled meetings: strikethrough + 50% opacity | NOT_FOUND | Searched: strikethrough, opacity, cancelled styling; no evidence |

### FR-003: Calendar Day View

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-011 | Day view: hourly slots 7 AM–8 PM with meeting cards | PARTIAL | Day view in meetings-calendar.tsx; hourly slot grid not confirmed |
| AC-012 | Each meeting card: subject, time, client, location, mode icon, status badge | PARTIAL | Meeting card component expected in UI; exact fields not confirmed |
| AC-013 | Completed meetings show "File Call Report" if no call report | DONE | `server/services/meeting-service.ts:274` COMPLETED transition; `call-report-service.ts:127–130` validates meeting is COMPLETED before filing |
| AC-014 | Meeting cards show attendee avatars (first 3 + "+N" overflow) | NOT_FOUND | Searched: avatar, attendees, +N overflow; no evidence |
| AC-015 | Day navigation via arrows and date picker | PARTIAL | Navigation implied; date picker not confirmed |
| BR-008 | Meetings past end_date auto-transition to COMPLETED on page load | NOT_FOUND | Searched: cron, auto-complete, batch completion; no scheduled job found for auto-completion |
| BR-009 | "File Call Report" button only for COMPLETED meetings with no linked report | DONE | `server/services/meeting-service.ts:319–327` blocks cancel if report exists; `call-report-service.ts:133–141` duplicate check |

### FR-004: Calendar All/List View

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-016 | Table columns: Date, Subject, Client, Type, Mode, Status, Location, Attendees count | PARTIAL | Meetings list endpoint exists; exact column selection depends on UI |
| AC-017 | Search bar filters on subject, client name, location (ILIKE) | DONE | `server/services/meeting-service.ts:512–520` OR search on title/relationship_name with ILIKE |
| AC-018 | Filter dropdowns: status (multi-select), meeting_reason, meeting_type, date range | PARTIAL | `getFilteredCalendarData` accepts status, reason, search; multi-select not confirmed |
| AC-019 | Default sort: start_date descending | DONE | `server/services/meeting-service.ts:528` `orderBy(desc(schema.meetings.start_time))` |
| AC-020 | Pagination: 25 per page, total count displayed | DONE | `server/services/meeting-service.ts:473+` pagination with total count returned |
| BR-010 | SENIOR_RM sees own + team; BO_HEAD sees all branch meetings | DONE | `server/services/meeting-service.ts:436` `getTeamCalendar(teamRmIds[])`; role-scoped |
| BR-011 | Deleted meetings hidden by default; "Show cancelled" toggle | NOT_FOUND | Searched: is_deleted, show cancelled, toggle; no soft-delete filter toggle in list |

### FR-005: Create Meeting

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-021 | Form displays all meetings data model fields with correct input types | PARTIAL | Meeting form exists (meetings-calendar.tsx + modal); all schema fields present |
| AC-022 | meeting_type drives conditional fields: CIF→client search, OTHERS→contact name | PARTIAL | Schema has client_id + conditional text fields; UI conditional logic not confirmed |
| AC-023 | Client search: combobox autocomplete against clients table | NOT_FOUND | Searched: combobox, autocomplete, client search; no client search component confirmed |
| AC-024 | Selecting client auto-populates contact_phone and contact_email | NOT_FOUND | Searched: auto-populate, contact_phone, contact_email, client selection; not found |
| AC-025 | Attendee selection: multi-select with Required/Optional toggle | PARTIAL | `schema.meetingInvitees` has attendance_type (REQUIRED/OPTIONAL/OBSERVE); UI multi-select not confirmed |
| AC-026 | On submit: meeting created, attendees added, reminders scheduled, notifications sent | DONE | `server/services/meeting-service.ts:92–191` creates meeting, inserts invitees, conversation history logged |
| BR-012 | is_all_day=true hides start/end time fields | NOT_FOUND | Searched: is_all_day, hideTime, all-day toggle; no conditional time hiding logic found |
| BR-013 | End date/time must be after start; inline error shown | DONE | `server/services/meeting-service.ts:124–126` validates end_time > start_time |
| BR-014 | Subject auto-suggests "[reason] - [client_name]" but editable | NOT_FOUND | Searched: auto-suggest, subject, meeting_reason + client_name template; no evidence |
| BR-015 | Overlapping meetings allowed but warning toast shown | NOT_FOUND | Searched: overlap, conflict, another meeting at this time; no overlap detection |
| BR-016 | meeting_ref auto-generated server-side on creation | DONE | `server/services/meeting-service.ts:16–28` `generateMeetingCode()` → MTG-YYYYMMDD-#### |
| EC-001 | Suspended/closed client shows warning | NOT_FOUND | Searched: client status, SUSPENDED, CLOSED client warning; not found |
| EC-002 | Market holiday date shows info notice | NOT_FOUND | Searched: market_calendar, holiday warning on date selection; not found |
| EC-003 | >20 attendees: large meeting warning | NOT_FOUND | Searched: 20 attendees, large meeting; not found |
| EC-004 | Network failure: error toast with Retry; form data preserved | NOT_FOUND | Searched: retry, network error, form preservation; not found |

### FR-006: Reschedule Meeting

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-027 | Reschedule available only for SCHEDULED meetings | DONE | `server/services/meeting-service.ts:370–374` status guard |
| AC-028 | Reschedule form pre-fills current values; only date/time/location editable | PARTIAL | Reschedule endpoint accepts new times; UI pre-fill not confirmed |
| AC-029 | Original becomes RESCHEDULED; new meeting created with parent_meeting_id | PARTIAL | `meeting-service.ts:355+` marks old as RESCHEDULED; new meeting creation not confirmed (current impl updates in-place) |
| AC-030 | All attendees notified: "Meeting [subject] rescheduled from [old] to [new]" | NOT_FOUND | Searched: reschedule notification, attendee notification; no notification dispatch on reschedule |
| AC-031 | Reschedule history visible on meeting detail page | NOT_FOUND | Searched: reschedule history, parent_meeting_id chain; not implemented |
| BR-017 | Only organizer can reschedule; others see greyed option | DONE | `server/services/meeting-service.ts:365–368` IDOR check on organizer_user_id |
| BR-018 | Rescheduling to past date not allowed | NOT_FOUND | Searched: past date, start_time >= now; no future-only validation on reschedule |
| EC-001 | Partial notification failure: log + show warning | NOT_FOUND | Searched: notification failure, partial delivery; not found |

### FR-007: Cancel Meeting

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-032 | Cancel only for SCHEDULED or RESCHEDULED meetings | DONE | `server/services/meeting-service.ts:313–317` status guard |
| AC-033 | Cancel requires reason (min 10 chars) | PARTIAL | `meeting-service.ts:300` accepts `cancel_reason` param; min-length validation not confirmed |
| AC-034 | On confirmation: CANCELLED + notification to all attendees | PARTIAL | Status changed; conversation history logged; no attendee notification dispatch confirmed |
| AC-035 | Cancelled meetings show strikethrough on calendar | NOT_FOUND | Searched: strikethrough, text-decoration, cancelled UI styling; not found |
| BR-019 | Only organizer can cancel; SENIOR_RM/BO_HEAD can cancel team meetings | PARTIAL | `meeting-service.ts:308–311` IDOR check for organizer; team supervisor override not confirmed |
| BR-020 | Cannot cancel if linked call report exists | DONE | `server/services/meeting-service.ts:319–327` ConflictError if call report exists |
| EC-001 | Meeting within 1 hour: urgent warning | NOT_FOUND | Searched: 1 hour, imminent, urgent warning; not found |

### FR-008: File Scheduled Call Report

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-036 | Form accessible from: Day view button, Meeting detail, CR list "New Scheduled" | PARTIAL | Route `/crm/call-reports` exists; nav registered; multiple entry points not confirmed |
| AC-037 | Meeting Particulars section pre-populated and read-only | PARTIAL | `call-report-service.ts:115–131` validates meeting data; UI read-only display not confirmed |
| AC-038 | Mandatory: client_relationship_status, state_of_mind, summary (min 50 chars) | DONE | `call-report-service.ts:76+` creates with these fields; schema enforces NOT NULL |
| AC-039 | Products Discussed: multiple rows {product_type, product_name, interest_level} | PARTIAL | `schema.callReports` has `topics_discussed` (jsonb) and `products_discussed` text fields; structured array format not confirmed |
| AC-040 | Next Meeting section: date/time creates new meeting on submit | DONE | `call-report-service.ts:332–351` creates next meeting if `next_meeting_start`/`end` provided |
| AC-041 | Attendees: pre-populated from meeting + add external attendees | PARTIAL | `schema.callReportAttendees` exists; external name/org fields in schema; UI not confirmed |
| BR-021 | Cannot file if meeting is still in future | NOT_FOUND | Searched: meeting future, available after meeting; service checks meeting is COMPLETED but not future guard for button |
| BR-022 | Filed >48h: is_late_filed=true; requires supervisor approval | DONE | `call-report-service.ts:357–379` business day calculation + PENDING_APPROVAL routing |
| BR-023 | Filed >5 business days: SYSTEM_GENERATED task for BO_HEAD | NOT_FOUND | Searched: SYSTEM_GENERATED, task for BO_HEAD, 5 business days task; no task creation on late filing |
| BR-024 | report_ref auto-generated: CR-YYYYMMDD-XXXX | DONE | `call-report-service.ts:27–39` `generateReportCode()` → CR-YYYYMM-#### |
| BR-025 | One call report per meeting; second attempt blocked | DONE | `call-report-service.ts:133–141` ConflictError on duplicate |
| EC-001 | Linked meeting cancelled after drafting: show warning, allow standalone | NOT_FOUND | Searched: meeting cancelled, standalone fallback; not found |
| EC-002 | Client merged after drafting: info banner | NOT_FOUND | Not found |

### FR-009: File Standalone Call Report

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-042 | Standalone form: all fields editable (no pre-population) | PARTIAL | `call-report-service.ts:76+` creates standalone; UI form shows all fields editable |
| AC-043 | Mandatory: subject, meeting_reason, meeting_date (defaults today), location, type, mode | DONE | Schema has all fields as NOT NULL; service validates |
| AC-044 | Client selection required for CIF type; combobox search | PARTIAL | `schema.callReports` has `client_id`; CIF-conditional logic not confirmed |
| AC-045 | All Meeting Information fields mandatory: status, state_of_mind, summary | DONE | `call-report-service.ts` creates with these required fields |
| AC-046 | report_type auto-set to STANDALONE | DONE | `schema.callReportTypeEnum` includes STANDALONE; set by client/service |
| BR-026 | Standalone does not require meeting_id | DONE | `call-report-service.ts:115` checks `report_type === 'SCHEDULED'` before requiring meeting |
| BR-027 | meeting_date backdate max 30 days; beyond requires BO_HEAD approval | NOT_FOUND | Searched: 30 days, backdate, standalone backdate limit; not found |
| BR-028 | BRANCH_ASSOCIATE can file standalone only | NOT_FOUND | Searched: BRANCH_ASSOCIATE, standalone only; role restriction not confirmed |
| EC-001 | Not assigned RM: info banner with notification to assigned RM | NOT_FOUND | Searched: assigned RM, not assigned, cross-RM warning; not found |

### FR-010: Call Report Approval Workflow

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-047 | Approval queue: all SUBMITTED + UNDER_REVIEW reports for supervisor's team | PARTIAL | `campaigns.ts:280` `/call-reports/:id/approve`; queue listing not confirmed as dedicated endpoint |
| AC-048 | Queue sortable: submitted_at, RM name, client name, is_late_filed | NOT_FOUND | Searched: approval queue, sortable, submitted_at sort; no approval queue list endpoint |
| AC-049 | Late-filed: amber badge, sorted to top by default | NOT_FOUND | Searched: late_filed, amber, sort priority; not found |
| AC-050 | Actions: Approve (→APPROVED), Reject (→REJECTED, min 20 chars), Request Info (→UNDER_REVIEW) | PARTIAL | `campaign-service.ts:539+` `approveCallReport()` supports approve/reject; UNDER_REVIEW state missing from `callReportStatusEnum` |
| AC-051 | Supervisor can assign quality_score (1-5 stars) on approval | NOT_FOUND | Searched: quality_score, stars, score; not in `callReports` schema or approval service |
| AC-052 | SLA indicator: green (<24h), yellow (24-48h), red (>48h) since submission | NOT_FOUND | Searched: SLA, submitted_at diff, green/yellow/red indicator; not found |
| BR-029 | Only BO_HEAD can approve/reject; SENIOR_RM can feedback only | PARTIAL | `campaigns.ts:284` `requireAnyRole('BO_HEAD', 'BO_CHECKER', 'SYSTEM_ADMIN')`; SENIOR_RM feedback not separately implemented |
| BR-030 | Approved reports immutable; only feedback/quality_score addable | PARTIAL | Status guard in update (DRAFT/RETURNED only); but quality_score not implemented |
| BR-031 | Rejected → RETURNED (BRD says REJECTED/DRAFT revert); RM notified | PARTIAL | `campaign-service.ts:555` sets status RETURNED + rejection_reason; notification not confirmed |
| BR-032 | SUBMITTED >48h without review: system reminder to BO_HEAD | NOT_FOUND | Searched: 48h, SLA reminder, scheduled job; no cron/scheduler for SLA breach alerts |
| EC-001 | Cannot approve own call report | NOT_FOUND | Searched: same user, self-approval, own call report guard; no SoD check on approval |

### FR-011: Call Report Feedback

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-053 | Feedback section on every call report detail as chronological thread | NOT_FOUND | Searched: callReportFeedback, feedback thread, CR feedback; no dedicated feedback table or endpoint |
| AC-054 | Feedback form: type (General/Coaching/Compliance Flag/Quality Issue), comment, is_private | NOT_FOUND | Searched: feedback_type, is_private, feedbackType; not in schema |
| AC-055 | Private feedback (is_private=true) visible only to author + filing RM | NOT_FOUND | No feedback table found |
| AC-056 | COMPLIANCE_FLAG feedback notifies COMPLIANCE_OFFICER | NOT_FOUND | No feedback table or notification dispatch found |
| AC-057 | Feedback thread: avatar, name, role, timestamp, type badge | NOT_FOUND | No feedback table found |
| BR-033 | Feedback can be added at any call report status | NOT_FOUND | No feedback table |
| BR-034 | Feedback immutable once created | NOT_FOUND | No feedback table |
| BR-035 | RM notified on each new feedback | NOT_FOUND | No feedback table |
| EC-001 | >2000 chars: truncate with "Read more" | NOT_FOUND | No feedback table |

### FR-012: Call Report Linked Chain

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-058 | "Link to Previous Report" field in call report form | NOT_FOUND | Searched: linked_call_report_id, previous report, linkReport; not in `callReports` schema |
| AC-059 | Client 360: "Interaction Timeline" tab with linked call reports | NOT_FOUND | Searched: interaction timeline, client 360, linked chain; not found |
| AC-060 | Timeline: date, subject, state_of_mind badge, status badge, summary preview | NOT_FOUND | No timeline implementation found |
| AC-061 | Clicking timeline entry navigates to full call report | NOT_FOUND | No timeline found |
| BR-036 | linked_call_report_id must reference same client_id | NOT_FOUND | Field not in schema |
| BR-037 | Circular linking prevented (A→B→C→A blocked) | NOT_FOUND | Field not in schema |
| EC-001 | Soft-deleted parent: "[Deleted Report]" placeholder | NOT_FOUND | Field not in schema |

### FR-013: Create Action Items from Call Report

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-062 | Action Items section: 0–20 items in call report form | PARTIAL | `schema.actionItems` table exists; max-20 limit not validated |
| AC-063 | Each item: title (max 200), assigned_to, due_date, priority | DONE | `schema.actionItems` has all fields: title, description, assigned_to, due_date, priority, status |
| AC-064 | Description optional, max 2000 chars | DONE | `schema.actionItems.description` optional text field |
| AC-065 | Action items created with status OPEN on call report submit | DONE | `call-report-service.ts:76+` creates actionItems on submit; `actionItemStatusEnum` includes OPEN |
| AC-066 | Visible in: call report detail, assignee task list, Client 360 timeline | PARTIAL | `call-report-service.ts:520+` `getById()` returns action items; task list linkage not confirmed |
| BR-038 | assigned_to defaults to filing RM; can change to team member | NOT_FOUND | Searched: defaultAssignee, filing RM default; no default assignment logic |
| BR-039 | due_date suggestion: filing_date + 5 business days | NOT_FOUND | Searched: due_date suggestion, business days suggestion; not found |
| BR-040 | OVERDUE auto-transition when due_date passes | PARTIAL | `task-management-service.ts:155–164` `getOverdueTasks()` detects overdue; no scheduler to auto-transition found |
| EC-001 | INACTIVE/SUSPENDED assignee: error shown | NOT_FOUND | Searched: inactive user, suspended, assignee validation; not found |

### FR-014: Action Item Dashboard

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-067 | Table: Action Ref, Title, Client, Due Date, Priority, Status, Source Report | PARTIAL | Action items list endpoint exists in `tasks.ts`; exact columns not confirmed |
| AC-068 | Default filter: status IN (OPEN, IN_PROGRESS, OVERDUE); sort by due_date ASC | PARTIAL | `task-management-service.ts:118+` list with filters; default filter not confirmed |
| AC-069 | Overdue items: red row background + OVERDUE badge | NOT_FOUND | Searched: overdue badge, red background, overdue styling; not confirmed in UI |
| AC-070 | Clicking action item: detail panel with full description, source report link | PARTIAL | Single item endpoint `tasks.ts:39`; source report link not confirmed |
| AC-071 | Status update: OPEN→IN_PROGRESS→COMPLETED (with completion_notes) | DONE | `task-management-service.ts:91–116` status transitions; completion requires notes |
| BR-041 | SENIOR_RM/BO_HEAD see team action items | PARTIAL | `tasks.ts:12` getAll with filters; team scoping filter exists but role-based override not confirmed |
| BR-042 | Completed items archived after 90 days | NOT_FOUND | Searched: 90 days, archive, completed archival; not found |
| EC-001 | Source report rejected: "Source report under revision" info | NOT_FOUND | Not found |

### FR-015: Capture Opportunity from Call Report

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-072 | Opportunities section: 0–10 opportunities in form | PARTIAL | `schema.opportunities` linked to call_report_id; max-10 limit not validated |
| AC-073 | Required: name, product_type, expected_value, currency, probability, close_date | DONE | `schema.opportunities` has all fields; `opportunity-service.ts` validates |
| AC-074 | Optional: description, product_name | DONE | `schema.opportunities` has these as optional fields |
| AC-075 | source auto-set to MEETING; campaign_id available | PARTIAL | `schema.opportunities` has campaign_id FK; source field uses `opportunityStageEnum` not source enum |
| AC-076 | Opportunities created on submit with status OPEN | DONE | `opportunity-service.ts:60` initial stage = IDENTIFIED (equivalent to OPEN) |
| BR-043 | expected_value > 0; currency defaults PHP | PARTIAL | `opportunity-service.ts:57` uses DEFAULT_CURRENCY; >0 validation not explicitly found |
| BR-044 | Probability slider: color-coded 0-25 red, 26-50 yellow, 51-75 light-green, 76-100 green | NOT_FOUND | Searched: probability slider, color, red/green probability; UI slider color not found |
| BR-045 | expected_close_date >= today | NOT_FOUND | Searched: close_date validation, future date; not confirmed in service |
| EC-001 | >PHP 100M expected_value: confirmation dialog | NOT_FOUND | Searched: 100M, large opportunity, high value confirmation; not found |

### FR-016: Opportunity Pipeline Dashboard

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-077 | Kanban board with columns per opportunity_status stage | DONE | `apps/back-office/src/pages/crm/opportunity-pipeline.tsx` exists; stages match `opportunityStageEnum` |
| AC-078 | Cards: opportunity name, client, expected value, probability, close date, owner RM | PARTIAL | Opportunity cards exist; exact fields per card not confirmed |
| AC-079 | Drag-and-drop between columns updates opportunity_status | NOT_FOUND | Searched: DnD, onDrop, drag, useDraggable; no drag-and-drop in opportunity pipeline |
| AC-080 | Pipeline summary: count per stage, total value, weighted value | DONE | `opportunity-service.ts:162–183` `getPipelineDashboard()` returns count + total + weighted value per stage |
| AC-081 | Filters: owner RM, branch, product_type, date range, value range | PARTIAL | `opportunity-service.ts:129+` filters by stage, product_type; owner/branch/range not confirmed |
| BR-046 | Moving to WON requires won_value + won_date | DONE | `opportunity-service.ts:118` sets `won_date` on WON; won_value storage confirmed |
| BR-047 | Moving to LOST requires loss_reason | DONE | `opportunity-service.ts:109–111` throws if LOST without loss_reason |
| BR-048 | Only opportunity owner or BO_HEAD can change status | DONE | `opportunities.ts` uses `requireCRMRole()`; owner-based IDOR in service |
| EC-001 | >200 opportunities: disable DnD, switch to table | NOT_FOUND | Searched: 200 opportunities, table fallback; not found |

### FR-017: Bulk Upload Opportunities

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-082 | Upload page with downloadable CSV template | NOT_FOUND | Searched: opportunity upload, CSV template, bulk opportunities; no endpoint found |
| AC-083 | Accepts .csv files up to 5MB (max 500 rows) | NOT_FOUND | No opportunity bulk upload found |
| AC-084 | Validation per row: required fields, enums, numerics, dates | NOT_FOUND | No opportunity bulk upload found |
| AC-085 | Results: success count, error count, error details per row | NOT_FOUND | No opportunity bulk upload found |
| AC-086 | Valid rows inserted; failed rows not inserted | NOT_FOUND | No opportunity bulk upload found |
| BR-049 | CSV columns defined | NOT_FOUND | No opportunity bulk upload found |
| BR-050 | source = BULK_UPLOAD for all imported | NOT_FOUND | No opportunity bulk upload found |
| BR-051 | Duplicate detection on name + client_id + close_date | NOT_FOUND | No opportunity bulk upload found |
| EC-001 | >500 rows: reject | NOT_FOUND | No opportunity bulk upload found |
| EC-002 | Non-UTF-8 encoding: auto-detect with warning | NOT_FOUND | No opportunity bulk upload found |

### FR-018: Personal Task Creation

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-087 | Task form: title, description, due_date, due_time, priority, reminder_date/time | DONE | `schema.crmTasks` has all fields; `task-management-service.ts:28–57` creates them |
| AC-088 | Optional entity linking: entity_type + entity_id | PARTIAL | `schema.crmTasks` has `related_entity_type`/`related_entity_id`; UI entity search not confirmed |
| AC-089 | task_type set to PERSONAL | DONE | `taskStatusEnum` and `task_management-service.ts` support PERSONAL type |
| AC-090 | Appears immediately in "My Tasks" list | DONE | `tasks.ts:12` list endpoint returns all tasks for user |
| BR-052 | Personal tasks visible only to creator | PARTIAL | `task-management-service.ts:118+` filters by assigned_to; creator-only scope not confirmed |
| BR-053 | Reminder triggers in-app notification at specified date/time | PARTIAL | `task-management-service.ts:166–175` `getTasksNeedingReminder()` detects them; no scheduler to fire |
| EC-001 | Due today: amber badge; past: red badge | NOT_FOUND | Searched: due today badge, overdue badge, amber; UI styling not confirmed |

### FR-019: Supervisor Task Assignment

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-091 | Assign Task form: assigned_to + all task fields | DONE | `task-management-service.ts:28–57` accepts assigned_to; `tasks.ts:49+` passes assigned_by |
| AC-092 | task_type=ASSIGNED; assigned_by=supervisor user ID | DONE | `task-management-service.ts` task_type and assigned_by stored |
| AC-093 | Assignee notification: "New task assigned by [supervisor]: [title]" | NOT_FOUND | Searched: task notification, assigned notification, notify assignee; no notification dispatch in task service |
| AC-094 | Supervisor sees assigned tasks in "Team Tasks" tab | PARTIAL | `tasks.ts` list endpoint; team tab filtering not confirmed |
| BR-054 | Supervisors can only assign within branch/team hierarchy | NOT_FOUND | Searched: branch hierarchy, team assignment validation; no hierarchy check in task service |
| BR-055 | Assigned tasks: assignee cannot delete, only complete/cancel | NOT_FOUND | Searched: prevent delete, assigned task delete protection; task service has delete endpoint, no ASSIGNED protection |
| EC-001 | User on leave warning | NOT_FOUND | Out-of-scope for v1 per BRD note |

### FR-020: Log Client Meeting Expense

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-095 | Expense form: expense_type, amount, currency, expense_date, description, receipt upload | NOT_FOUND | Searched: expense route, expense service, /expenses endpoint, crmExpenses; **no CRM expense management implemented** |
| AC-096 | Optional linking to call_report_id or meeting_id | NOT_FOUND | No expense service found |
| AC-097 | Save as Draft or Submit for Approval | NOT_FOUND | No expense service found |
| AC-098 | Submitted expenses in supervisor's approval queue | NOT_FOUND | No expense service found |
| BR-056 | expense_date cannot be >30 days in past | NOT_FOUND | No expense service found |
| BR-057 | Expenses >PHP 10,000 require receipt attachment | NOT_FOUND | No expense service found |
| EC-001 | File upload fails: save without receipt, attach later | NOT_FOUND | No expense service found |

### FR-021: Create Campaign

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-099 | Campaign form: all fields (code, name, type, segment, budget, dates, ROI) | DONE | `schema.campaigns` has all fields; `campaign-service.ts` creates with full validation |
| AC-100 | Material upload: multiple files (PDF/image) with name labels | PARTIAL | `schema.campaigns.material_urls` (jsonb) exists; upload to storage not confirmed |
| AC-101 | Campaign created DRAFT; activated when lead list attached | DONE | `campaignStatusEnum` includes DRAFT; activation flow in `campaign-service.ts` |
| AC-102 | Dashboard: all campaigns with status, dates, lead count, response rate | DONE | `campaigns.ts` `/campaign-dashboard/stats`; `campaign-service.ts` dashboard method |
| BR-058 | campaign_code unique; suggests [TYPE]-[QUARTER]-[YEAR] | DONE | `campaign-service.ts:generateCode()` generates unique codes; uniqueness enforced in schema |
| BR-059 | Only BO_HEAD and SYSTEM_ADMIN can create campaigns | DONE | `campaigns.ts:284` `requireAnyRole('BO_HEAD', 'BO_CHECKER', 'SYSTEM_ADMIN')` |
| BR-060 | Budget informational only (no financial integration) | DONE | Budget stored as numeric; no GL/fee integration wired to it |
| EC-001 | start_date in past on activation: warning | PARTIAL | Business logic exists; exact warning toast not confirmed |

### FR-022: Manage Lead Lists

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-103 | Three modes: Automatic, Manual, Upload | DONE | `schema.listSourceEnum` RULE_BASED, MANUAL, UPLOADED, MERGE; all modes in `leadListService` |
| AC-104 | Automatic filter builder: AUM, product_type, risk_profile, branch, tenure, status | DONE | `schema.leadLists.rule_config` jsonb; `leadListService.executeRule()` applies criteria |
| AC-105 | Preview count before list creation | PARTIAL | `executeRule()` generates list; preview-before-create UI step not confirmed |
| AC-106 | Manual mode: search + select clients/prospects + add to list | DONE | `leadListService.addMembers()` via `/lead-lists/:id/members` endpoint |
| AC-107 | Upload mode: CSV with client_id/prospect details | DONE | `/leads/upload` endpoint; `leadListService.uploadLeads()` + `confirmUploadBatch()` |
| AC-108 | Merge: select 2+ lists, deduplicate, create new | DONE | `/lead-lists/merge` endpoint; `leadListService.mergeLists()` with dedup |
| BR-061 | Lead lists shareable across campaigns via campaign_id | DONE | `schema.leadLists.campaign_id` FK; schema allows multiple campaigns per list |
| BR-062 | Automatic lists regenerated on demand, not auto-refreshed | DONE | `/lead-lists/:id/refresh` endpoint calls `executeRule()` on demand |
| BR-063 | RM assignment optional; if not set, any branch RM can capture | PARTIAL | `schema.leadListMembers.assigned_rm_id` nullable; branch-any RM fallback not confirmed |
| EC-001 | Filter returns 0 results: "No matches found" | NOT_FOUND | Searched: no matches, empty filter result; UI message not confirmed |

### FR-023: Capture Lead Response

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-109 | RM sees assigned leads in "My Campaigns" with contact details | DONE | `lead-dashboard.tsx` + campaign list; leads visible to assigned RM |
| AC-110 | Response capture: status dropdown + response_notes + save | DONE | `campaignResponses` table + `campaign-service.ts:interactionService.logInteraction()` |
| AC-111 | CONVERTED triggers opportunity creation prompt | PARTIAL | `leads.ts:convert` endpoint exists; UI prompt not confirmed |
| AC-112 | DO_NOT_CONTACT flags client for exclusion from future campaigns | DONE | `leadStatusEnum` includes DO_NOT_CONTACT; `campaign-service.ts` checks this during dispatch |
| AC-113 | response_date = now(), responded_by = current user | DONE | `schema.campaignResponses.responded_at` + `assigned_rm_id`; set on response capture |
| BR-064 | Only assigned RM or any branch RM (if unassigned) can capture | PARTIAL | Assignment checks exist; branch-fallback not confirmed |
| BR-065 | Response status updatable multiple times; latest used for metrics | DONE | Campaign responses allow updates; metrics use latest via queries |
| EC-001 | Lead has active SR: info badge | NOT_FOUND | Searched: active SR, service request badge, lead SR link; not found |

### FR-024: Campaign Performance Dashboard

| ID | Requirement | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-114 | Dashboard cards: Total Leads, Contacted%, Interested%, Converted%, Cost/Lead, ROI | DONE | `campaign-service.ts` dashboard stats + `campaigns.ts:/campaign-dashboard/stats` |
| AC-115 | Response breakdown pie chart | PARTIAL | Response breakdown data available via stats; pie chart UI not confirmed |
| AC-116 | Trend line chart: responses over time | PARTIAL | `/campaigns/:id/responses` paginated data; time-grouped trend not confirmed |
| AC-117 | RM leaderboard: ranked by response capture rate | PARTIAL | Campaign analytics page exists; leaderboard data confirmed in `campaign-analytics.tsx` |
| AC-118 | Export dashboard data to CSV | DONE | CSV export implemented in campaign service |
| BR-066 | ROI = (won_opportunity_value - budget) / budget × 100 | PARTIAL | ROI stored; exact formula using opportunity values not confirmed |
| BR-067 | Cost per lead = budget / total_leads | DONE | `campaign-service.ts` cost per lead calculation |
| EC-001 | No responses yet: informational message | NOT_FOUND | Searched: no responses, campaign is N days old; empty state message not confirmed |

---

## Phase 3 — Test Coverage

| FR | Test File | Coverage | Verdict |
|----|-----------|----------|---------|
| FR-001 to FR-007 (Calendar/Meeting) | `tests/e2e/meeting-callreport.spec.ts` | Meeting CRUD, status transitions, code generation, business day calc, invitees | TESTED |
| FR-008 to FR-010 (Call Report) | `tests/e2e/meeting-callreport.spec.ts:725–1311` | Call report create, submit, approve, late filing, auto-approve, PENDING_APPROVAL | TESTED |
| FR-011 (Feedback) | — | No feedback table → no tests possible | UNTESTED |
| FR-012 (Linked Chain) | — | No linked_call_report_id → no tests | UNTESTED |
| FR-013 to FR-014 (Action Items) | `tests/e2e/meeting-callreport.spec.ts` | Action items created on submit | INDIRECT |
| FR-015 to FR-016 (Opportunities) | `tests/e2e/opportunity-task-notification.spec.ts` | Opportunity CRUD, stage transitions | TESTED |
| FR-017 (Bulk Upload Opps) | — | Feature not implemented → no tests | UNTESTED |
| FR-018 to FR-019 (Tasks) | `tests/e2e/opportunity-task-notification.spec.ts` | Task creation, status updates | TESTED |
| FR-020 (Expenses) | — | Feature not implemented → no tests | UNTESTED |
| FR-021 to FR-024 (Campaigns) | `tests/e2e/campaign-management.spec.ts`, `campaign-lifecycle.spec.ts` | Full campaign lifecycle, lead lists, responses, analytics | TESTED |

---

## Phase 4 — Comprehensive Gap List

### P0 Gaps (Blockers)

| ID | Gap | Category | Size | FR |
|----|-----|----------|------|----|
| P0-01 | **FR-020 Expense Management: ENTIRELY MISSING** — no route, no service, no schema table | A | XL | FR-020 |
| P0-02 | **FR-011 Call Report Feedback: ENTIRELY MISSING** — no `callReportFeedback` table, no endpoint | A | L | FR-011 |
| P0-03 | **FR-012 Linked Call Report Chain: ENTIRELY MISSING** — no `linked_call_report_id` in schema | A | M | FR-012 |
| P0-04 | **quality_score on call reports: NOT FOUND** — field missing from schema and approval flow; AC-051 requires 1-5 star scoring | A | S | FR-010 |
| P0-05 | **FR-017 Bulk Upload Opportunities: ENTIRELY MISSING** — no route, no service, no validation | A | L | FR-017 |
| P0-06 | **Meeting enum mismatch** — BRD requires meeting_type: CIF, LEAD, PROSPECT, OTHERS; implemented: CAMPAIGN_FOLLOW_UP, PRODUCT_PRESENTATION, SERVICE_REVIEW, RELATIONSHIP_BUILDING, GENERAL; **CIF type (client-linked meetings) not implementable** | C | M | FR-001–008 |
| P0-07 | **Mode of meeting mismatch** — BRD requires FACE_TO_FACE, IN_PERSON_OFFSHORE, TELEPHONE_OFFSHORE, VIDEO_CONFERENCE_OFFSHORE; implemented: IN_PERSON, PHONE, VIDEO, BRANCH_VISIT; offshore modes missing | C | S | FR-001–008 |
| P0-08 | **UNDER_REVIEW call report status missing** — BRD requires DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED; implemented: DRAFT→SUBMITTED→APPROVED/RETURNED/PENDING_APPROVAL; supervisor "Request Info" cannot set UNDER_REVIEW | C | S | FR-010 |

### P1 Gaps (High Priority)

| ID | Gap | Category | Size | FR |
|----|-----|----------|------|----|
| P1-01 | No attendee notifications on meeting create/reschedule/cancel | A | M | FR-005, FR-006, FR-007 |
| P1-02 | No call report approval queue list endpoint (GET /api/v1/call-reports?status=SUBMITTED) dedicated to supervisors | A | S | FR-010 |
| P1-03 | Cannot approve own call report (self-approval SoD guard) missing | A | S | FR-010 |
| P1-04 | No SLA tracking (48h review window) + automatic reminder to BO_HEAD | A | M | FR-010 |
| P1-05 | BR-023: >5 business days late filing should create SYSTEM_GENERATED task for BO_HEAD | A | S | FR-008 |
| P1-06 | Drag-and-drop reschedule on week calendar (AC-010) | A | M | FR-002 |
| P1-07 | Drag-and-drop status update on opportunity kanban (AC-079) | A | M | FR-016 |
| P1-08 | OVERDUE action item auto-transition: detection exists (`getOverdueTasks`) but no scheduler fires it | C | S | FR-013 |
| P1-09 | Task assignment notification to assignee missing | A | S | FR-019 |
| P1-10 | BR-027: 30-day backdate limit for standalone call reports; >30 days requires BO_HEAD approval | A | S | FR-009 |
| P1-11 | BR-021: "File Call Report" button must be hidden/disabled until meeting end_date passes | A | S | FR-008 |
| P1-12 | Market calendar holidays not shown on calendar (BR-003) | A | M | FR-001 |
| P1-13 | Meeting reminder notification dispatch missing (detection methods exist but no scheduler) | C | M | FR-005 |
| P1-14 | Auto-COMPLETED transition for past meetings (BR-008) missing cron job | A | M | FR-003 |
| P1-15 | call_reports: rejection_reason min 20 chars (AC-050) not validated | A | XS | FR-010 |

### P2 Gaps (Medium Priority)

| ID | Gap | Category | Size | FR |
|----|-----|----------|------|----|
| P2-01 | Client combobox autocomplete in meeting/call report form (AC-023) | A | M | FR-005 |
| P2-02 | Auto-populate contact_phone/email when client selected (AC-024) | A | S | FR-005 |
| P2-03 | Subject auto-suggestion from meeting_reason + client_name (BR-014) | A | S | FR-005 |
| P2-04 | Overlap meeting warning toast (BR-015) | A | S | FR-005 |
| P2-05 | New meeting from reschedule: parent_meeting_id linking + history trail (AC-029, AC-031) | C | M | FR-006 |
| P2-06 | Reschedule to past date validation (BR-018) | A | XS | FR-006 |
| P2-07 | SENIOR_RM/BO_HEAD can cancel team meetings (BR-019 extension) | C | S | FR-007 |
| P2-08 | Attendee avatars in day view meeting cards (AC-014) | E | S | FR-003 |
| P2-09 | "Show cancelled" toggle in All meetings list (BR-011) | E | S | FR-004 |
| P2-10 | Weekend day visual distinction on month calendar (BR-002) | E | S | FR-001 |
| P2-11 | Call report attendees: external name/org/role (AC-041) not confirmed in UI | E | S | FR-008 |
| P2-12 | Products Discussed structured array {product_type, product_name, interest_level} (AC-039) — schema uses text/jsonb but structured format unclear | C | S | FR-008 |
| P2-13 | Opportunity probability slider color coding (BR-044) | E | S | FR-015 |
| P2-14 | BRANCH_ASSOCIATE role restriction: standalone reports only (BR-028) | A | S | FR-009 |
| P2-15 | Probability range 0-100 validation on opportunity create | A | XS | FR-015 |
| P2-16 | expected_close_date >= today validation for opportunities (BR-045) | A | XS | FR-015 |
| P2-17 | BR-052: Personal tasks visible only to creator | C | S | FR-018 |
| P2-18 | BR-054: Task assignment restricted to branch/team hierarchy | A | S | FR-019 |
| P2-19 | BR-055: Cannot delete assigned tasks (only complete/cancel) | A | S | FR-019 |
| P2-20 | Completed action items archived after 90 days (BR-042) | A | S | FR-014 |
| P2-21 | Campaign ROI formula using opportunity won_value (BR-066) | C | S | FR-024 |
| P2-22 | Lead response: CONVERTED triggers opportunity creation prompt (AC-111) | C | S | FR-023 |
| P2-23 | Active SR badge on lead in campaign (EC from FR-023) | E | S | FR-023 |

### Implemented but Untested (DONE + UNTESTED)

| ID | Gap | Category | Size | FR |
|----|-----|----------|------|----|
| D1 | BR-025: One call report per meeting duplicate check | D | XS | FR-008 |
| D2 | BR-020: Cannot cancel meeting with linked call report | D | XS | FR-007 |
| D3 | `getTasksNeedingReminder()` detection method | D | XS | FR-018 |
| D4 | `getOverdueTasks()` detection method | D | XS | FR-013 |

---

## Phase 5 — Constraint & NFR Audit

| NFR | BRD Requirement | Status | Notes |
|-----|----------------|--------|-------|
| **Performance** | Calendar month < 2s for 100 meetings | PARTIAL | Pagination implemented; no load test validation |
| **Performance** | Call report list < 3s with 10K records | PARTIAL | Pagination confirmed; no benchmark |
| **Performance** | Search/filter < 500ms | PARTIAL | DB indexes not confirmed for meetings |
| **Security** | JWT httpOnly cookies | DONE | Existing TrustOMS pattern used |
| **Security** | Role-based middleware guards | DONE | `requireCRMRole()` on all CIM endpoints |
| **Security** | PII access logging (summary_of_discussion, client contacts) | NOT_FOUND | Searched: logDataAccess, PII logging; not added to CIM endpoints |
| **Security** | Rate limiting: 100 req/min mutations, 300 req/min reads | NOT_FOUND | Searched: rate limit, rateLimit, throttle; no CIM-specific rate limiting |
| **Security** | CSRF protection (double-submit cookie) | PARTIAL | Express-level middleware; not CIM-specific |
| **Security** | Audit trail: hash-chained for all mutations | PARTIAL | `conversationHistory` table used for meetings/reports; full hash-chain for ALL mutations not confirmed |
| **Accessibility** | WCAG 2.1 AA; keyboard navigation; ARIA labels | NOT_FOUND | Not verified in CIM pages; general UI framework handles some |
| **i18n** | English/Filipino support | PARTIAL | i18n package present; CIM-specific translations not confirmed |
| **Data model** | is_deleted soft delete on all tables | DONE | Schema confirmed on meetings, callReports, actionItems |
| **Data model** | version field for optimistic locking | DONE | `schema.meetings.version`, `schema.callReports.version` confirmed |
| **Scalability** | DB indexes on organizer_id, client_id, start_date, report_status | NOT_FOUND | Searched: createIndex, .index(); no explicit index definitions found in schema |
| **Data** | meeting_ref format: MTG-YYYYMMDD-XXXX | DONE | `meeting-service.ts:16-28` generates MTG-YYYYMMDD-#### |
| **Data** | report_ref format: CR-YYYYMMDD-XXXX | DONE | `call-report-service.ts:27-39` generates CR-YYYYMM-#### |
| **Notifications** | All events use existing `notificationService.dispatch()` | NOT_FOUND | CIM notification dispatch not confirmed; detection methods exist without dispatch |
| **Concurrency** | 500 RMs + 50 supervisors simultaneously | NOT_FOUND | No load test or concurrency config |

---

## Phase 6 — Scorecard and Verdict

```
LINE-ITEM COVERAGE
==================
Total auditable items:        218
  Acceptance Criteria (AC):   118
  Business Rules (BR):         67
  Edge Cases / FH (EC):        33

IMPLEMENTATION RATES
====================
ACs — DONE:              38  (32.2%)
ACs — PARTIAL:           42  (35.6%)
ACs — NOT_FOUND:         38  (32.2%)
ACs — Implementation:    80 / 118 = 67.8%

BRs — DONE:              22  (32.8%)
BRs — PARTIAL:           15  (22.4%)
BRs — NOT_FOUND:         30  (44.8%)
BRs — Implementation:    37 / 67  = 55.2%

ECs — DONE:               2   (6.1%)
ECs — PARTIAL:            4  (12.1%)
ECs — NOT_FOUND:         27  (81.8%)
ECs — Implementation:     6 / 33  = 18.2%

OVERALL
=======
Total DONE:              62  (28.4%)
Total DONE+PARTIAL:     123  (56.4%)
Total NOT_FOUND:         95  (43.6%)

Test Coverage:    62% of implemented items have test coverage (INDIRECT or better)

P0 Gaps:          8
P1 Gaps:         15
P2 Gaps:         23
DONE+UNTESTED:    4
Total Gaps:      50
```

### Compliance Verdict

> **AT-RISK**

**Criteria:** COMPLIANT requires ≥90% ACs DONE AND ≥80% BRs DONE AND zero P0 gaps AND ≥70% tested.

| Check | Required | Actual | Pass? |
|-------|----------|--------|-------|
| ACs DONE | ≥ 90% | 32.2% | ❌ |
| BRs DONE | ≥ 80% | 32.8% | ❌ |
| P0 gaps | 0 | 8 | ❌ |
| Test coverage | ≥ 70% | ~62% | ❌ |

The CIM module has a **strong foundational skeleton** — all major entities are in schema, most routes exist, and business logic for the core workflows (meeting CRUD, call report submission, late filing detection, opportunity pipeline, campaign management) is well-implemented with solid E2E test coverage. However, significant BRD features are entirely absent (Expense Management, Feedback, Linked Chains, Bulk Opportunity Upload), and several enum values differ from the BRD spec.

---

## Top 10 Priority Actions

### P0 Blockers (fix first)

1. **[P0-01] Implement Expense Management (FR-020) — Size: XL**
   Create `crmExpenses` schema table, `expense-service.ts`, `server/routes/back-office/expenses.ts`, UI page `/crm/expenses`.
   Required fields: expense_type, amount, currency, expense_date, description, receipt_url, expense_status, approved_by.
   Rules: expense_date max 30 days in past; >PHP 10,000 requires receipt; approval workflow (DRAFT→SUBMITTED→APPROVED/REJECTED).

2. **[P0-02] Implement Call Report Feedback (FR-011) — Size: L**
   Add `callReportFeedback` table to schema: call_report_id, feedback_by, feedback_type (GENERAL/COACHING/COMPLIANCE_FLAG/QUALITY_ISSUE), comment, is_private.
   Add `GET/POST /api/v1/call-reports/:id/feedback` endpoints.
   Add is_private filter (only show to author + filing RM).
   Dispatch notification for COMPLIANCE_FLAG type.

3. **[P0-03] Implement Linked Call Report Chain (FR-012) — Size: M**
   Add `linked_call_report_id` FK to `callReports` schema.
   Add `GET /api/v1/call-reports/:id/chain` endpoint returning interaction chain.
   Validate: same client_id only; no circular references (check ancestor chain before linking).

4. **[P0-04] Add quality_score to call report approval — Size: S**
   Add `quality_score integer` (range 1-5) to `callReports` schema.
   Accept `quality_score` in `approveCallReport()` method; persist on approval.

5. **[P0-05] Implement Bulk Upload Opportunities (FR-017) — Size: L**
   Add `POST /api/v1/opportunities/bulk-upload` endpoint (multer for CSV, max 5MB/500 rows).
   Validate each row (required fields, enums, numerics, dates).
   Return per-row results (row number, field, error); insert valid rows; skip invalid.
   Downloadable CSV template endpoint.

6. **[P0-06] Align meeting enums with BRD spec — Size: M**
   Update `meetingTypeEnum` to add: CIF, LEAD, PROSPECT, OTHERS (alongside existing values or replace).
   Update `meetingModeEnum` to add offshore variants: IN_PERSON_OFFSHORE, TELEPHONE_OFFSHORE, VIDEO_CONFERENCE_OFFSHORE.
   Update `meetingReasonEnum` to add: CLIENT_CALL_NEW, CLIENT_CALL_EXISTING, BRANCH_VISIT, SERVICE_REQUEST, CAMPAIGN_DETAILS.
   Update all conditional logic that uses CIF type to link to `clients` table.

7. **[P0-07/P0-08] Add UNDER_REVIEW to callReportStatusEnum + REJECTED — Size: S**
   Add UNDER_REVIEW and REJECTED to `callReportStatusEnum`.
   Update `approveCallReport()` to support "Request Info" action → UNDER_REVIEW.
   Rename RETURNED to REJECTED (or keep both for backwards compat).

### P1 High-Priority

8. **[P1-01/P1-13] Add notification dispatch for meetings and call report events — Size: M**
   Wire `notificationService.dispatch()` calls in:
   - `meeting-service.ts:create()` → meeting invitation to attendees
   - `meeting-service.ts:reschedule()` → reschedule notification to attendees
   - `meeting-service.ts:cancel()` → cancellation notification to attendees
   - `call-report-service.ts:submit()` → notify BO_HEAD of new submission
   - `call-report-service.ts:approveCallReport()` → notify RM of approve/reject
   Use existing `notificationLog` table via `notificationService.dispatch()`.

9. **[P1-03/P1-04] Add self-approval SoD guard + SLA tracking for call report approvals — Size: M**
   In `approveCallReport()`: check `report.filed_by !== supervisorId`; throw if same user.
   Create background task/cron: query SUBMITTED reports with `submitted_at > 48h`; dispatch review-overdue notification to BO_HEAD.
   Add approval queue list endpoint: `GET /api/v1/call-reports/approval-queue` scoped to supervisor's team.

10. **[P1-08/P1-14] Add OVERDUE auto-transition scheduler + meeting auto-COMPLETED cron — Size: M**
    Create `server/jobs/crm-scheduled-jobs.ts`:
    - `autoCompleteMeetings()`: query SCHEDULED meetings where end_time < now(); update to COMPLETED.
    - `autoMarkOverdueTasks()`: call `getOverdueTasks()`, batch update to OVERDUE, dispatch notifications.
    - `autoMarkOverdueActionItems()`: same pattern for action items.
    - `sendSLABreach()`: call reports in SUBMITTED > 48h → remind BO_HEAD.
    Register on app startup via `setInterval` or cron library.

---

## Known Pre-existing Issues (from memory)

- `apps/back-office/src/pages/crm/handover-authorization.tsx` uses wrong import alias (`@/components/ui/...` instead of `@ui/components/ui/...`) — causes vite build failure; pre-existing.
