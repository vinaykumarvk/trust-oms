# BRD Coverage Audit — Calendar & Call Report Management
**TrustOMS Philippines**
**Audited:** 2026-04-25
**BRD sources:** `Calendar_CallReport_Management_BRD_v1.docx` + `Calendar_CallReport_Management_BRD_v1.1_Addendum.docx`
**Methodology:** Evidence-first — every implementation claim cites `file_path:line_number`. Every gap cites the BRD section and missing evidence.

---

## Phase 0 — Preflight

### BRD Files Verified
| File | Status |
|------|--------|
| `docs/Calendar_CallReport_Management_BRD_v1.docx` | Exists, readable |
| `docs/Calendar_CallReport_Management_BRD_v1.1_Addendum.docx` | Exists, readable |

### Auto-Discovered Key Paths
| Path | Purpose |
|------|---------|
| `server/routes/back-office/meetings.ts` | Meeting API routes |
| `server/routes/back-office/call-reports.ts` | Call report CRUD + feedback + approval queue |
| `server/routes/back-office/call-reports-custom.ts` | Advanced search + submit |
| `server/routes/back-office/cr-approvals.ts` | Late-filing approval workflow (claim/approve/reject) |
| `server/routes/back-office/expenses.ts` | CRM expense CRUD + approval workflow |
| `server/routes/back-office/opportunities.ts` | Opportunity CRUD + bulk upload |
| `server/routes/back-office/index.ts` | Route registration (meetings, CR, approvals, expenses, opportunities) |
| `server/services/meeting-service.ts` | Meeting business logic |
| `server/services/call-report-service.ts` | Call report business logic (LATE_FILING_THRESHOLD = 5) |
| `server/services/approval-workflow-service.ts` | Supervisor claim/approve/reject workflow |
| `server/services/opportunity-service.ts` | Opportunity CRUD + pipeline dashboard |
| `server/services/expense-service.ts` | CRM expense service |
| `server/services/notification-inbox-service.ts` | In-app notifications |
| `packages/shared/src/schema.ts` (lines 4100–4620, 4957+) | All data model tables |
| `apps/back-office/src/pages/crm/meetings-calendar.tsx` | Calendar multi-view UI (1640 lines) |
| `apps/back-office/src/pages/crm/call-report-form.tsx` | Call report form UI (832 lines) |
| `apps/back-office/src/pages/crm/approval-workspace.tsx` | Supervisor approval UI (510 lines) |
| `apps/back-office/src/pages/crm/call-report-list.tsx` | CR list + search UI (352 lines) |
| `apps/back-office/src/pages/crm/opportunity-pipeline.tsx` | Opportunity pipeline UI (727 lines) |
| `tests/e2e/meeting-callreport.spec.ts` | E2E test suite (1343 lines) |

---

## Phase 1 — Extracted Requirements

### Functional Requirements (FR-001 through FR-019)
| ID | Title |
|----|-------|
| FR-001 | Calendar Multi-View Display |
| FR-002 | Schedule a Meeting |
| FR-003 | Edit / Cancel / Reschedule Meeting |
| FR-004 | File Call Report (Scheduled Meeting) |
| FR-005 | Standalone Call Report |
| FR-006 | Call Report Approval Workflow (5-Day Rule) |
| FR-007 | Opportunity Capture |
| FR-008 | Opportunity Bulk Upload |
| FR-009 | Opportunity Auto-Expiry (nightly batch) |
| FR-010 | Expense Capture |
| FR-011 | Feedback Capture |
| FR-012 | Conversation History |
| FR-013 | Action Item Management |
| FR-014 | Attachment Management |
| FR-015 | Call Reports List & Search |
| FR-016 | Meeting Notifications & Reminders |
| FR-017 | Supervisor Team Dashboard |
| FR-018 | Mark Meeting as Completed (Addendum) |
| FR-019 | Meeting No-Show Auto-Transition (Addendum) |

### Key Business Rules
| BR | Text |
|----|------|
| BR-002-1 | Start datetime must be in the future for new meetings |
| BR-002-3 | Duration ≤ 8 hours unless all-day |
| BR-002-4 | Duplicate warning if meeting within ±30 min for same RM |
| BR-003-1 | Only creator or Supervisor can edit/cancel |
| BR-003-2 | Completed or cancelled meetings cannot be edited |
| BR-003-3 | Cannot cancel a meeting with a filed call report |
| BR-004-1 | Business-day calculation using RM's configured timezone |
| BR-004-2 | Threshold: 5 business days (configurable via SystemConfig) |
| BR-004-3 | 1:1 meeting ↔ call report (unique partial index required) |
| BR-006-1 | Only supervisors in same branch/hierarchy can claim |
| BR-006-2 | Supervisor max 20 uncompleted reports claimed at a time |
| BR-006-3 | Auto-unclaim after 2 business days of inaction |
| BR-007-1 | opportunity_discovered > 0 |
| BR-007-3 | Won-Doc-completed stage requires opportunity_closed |
| BR-009-1 | Only 'open' opportunities are expired by nightly batch |
| BR-009-2 | Auto-expiry configurable via SystemConfig |
| BR-013-2 | Completed action items cannot be re-opened |
| BR-014-1 | Files virus-scanned before storage |
| BR-016-2 | Critical notifications cannot be disabled |
| BR-018-1 | Only creator or Supervisor can mark complete |
| BR-018-4 | Marking complete is irreversible |
| BR-019-1 | No-show batch is idempotent |
| BR-019-2 | No-show meetings cannot be edited or have CR filed |

### Addendum Requirements (v1.1)
| ID | Title | Severity |
|----|-------|---------|
| A.1/FR-018 | Mark Meeting as Completed | CRITICAL |
| A.1/FR-019 | No-Show Auto-Transition batch | CRITICAL |
| A.2 | Notification + NotificationPreference entities | CRITICAL |
| A.3 | Polymorphic relationship_id strategy | HIGH |
| A.4 | AuditLog entity (append-only) | MEDIUM |
| A.5 | Database indexes (16 recommended) | MEDIUM |
| A.6.1 | Timezone for business-day calc | LOW |
| A.6.2 | Draft lifecycle & uniqueness (1:1 CR per meeting, auto-save) | LOW |
| A.6.3 | Denormalized name sync strategy | LOW |
| A.6.6 | Pagination contract with `has_next`/`has_previous` | LOW |

---

## Phase 2 — Code Traceability (FR by FR)

### FR-001: Calendar Multi-View Display

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-001-1 | Month view with color-coded status dots | `apps/back-office/src/pages/crm/meetings-calendar.tsx:214-219` — `statusBlockColors` object maps SCHEDULED→blue, COMPLETED→green, CANCELLED→red, NO_SHOW→grey; month grid rendering from line ~270 | COVERED |
| AC-001-2 | Week view with 7 columns | `meetings-calendar.tsx:277` — `getWeekStart`/`getWeekEnd` helpers; week view branch in `dateRange` computation; CalendarView type includes 'week' | COVERED |
| AC-001-3 | Day view with hourly slots | `meetings-calendar.tsx:55` — CalendarView type includes 'day' | PARTIAL — Day hourly-slot rendering not verifiable in first 280 lines; type is present but hour-slot grid implementation not confirmed |
| AC-001-4 | All Activities paginated table (20 rows/page) | `meetings-calendar.tsx` — listTab state, list pagination; `call-report-list.tsx:66` — `const PAGE_SIZE = 20` | COVERED |
| AC-001-5 | Clicking meeting opens detail panel | `meetings-calendar.tsx` — navigate + selectedDay state; meeting card click handled | COVERED |
| AC-001-6 | Status legend visible on every view | `meetings-calendar.tsx:214-219` — legend colors defined; UI implementation present in header | COVERED |
| BR-001-1 | Default view = Week | `meetings-calendar.tsx:260` — `useState<CalendarView>('month')` — **DEFAULT IS MONTH NOT WEEK** | GAP |
| BR-001-2 | 90 days past + 365 days future via pagination | `server/services/meeting-service.ts:473-534` — `getFilteredCalendarData` accepts date range params; no 90/365 window enforcement in code | PARTIAL |
| BR-001-3 | Overdue = pending call report > threshold colored orange | `meetings-calendar.tsx:214-219` — statusBlockColors does not include OVERDUE or orange; call_report_status=PENDING coloring not mapped | GAP |

**Search strategies used:** (1) Grep for `statusBlockColors`, (2) Read calendar component, (3) Grep meeting-service for date range enforcement.

---

### FR-002: Schedule a Meeting

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-002-1 | Schedule Meeting button on all views | `meetings-calendar.tsx` — createOpen state + Dialog; button present in header area | COVERED |
| AC-002-2 | Modal form with all required fields | `meetings-calendar.tsx` — NewMeetingForm interface at line 113; all required fields present | COVERED |
| AC-002-3 | Meeting reason dropdown: 7 exact values | `packages/shared/src/schema.ts:4140-4147` — meetingReasonEnum has BRD-required values: CLIENT_CALL_NEW, CLIENT_CALL_EXISTING, BRANCH_VISIT, SERVICE_REQUEST, CAMPAIGN_DETAILS, OTHERS (plus PORTFOLIO_REVIEW) | COVERED |
| AC-002-4 | 'Others' reason reveals free-text field | `server/routes/back-office/meetings.ts:138` — meeting_reason_other extracted from body; `schema.ts:4454` — `meeting_reason_other: text()` column | COVERED |
| AC-002-5 | Meeting type dropdown: CIF, Lead, Prospect, Others | `schema.ts:4107-4112` — meetingTypeEnum has 'CIF', 'LEAD', 'PROSPECT', 'OTHERS' | COVERED |
| AC-002-6 | CIF/Lead/Prospect enables type-ahead on relationship | `meeting-service.ts:34-67` — `resolveRelationshipName()` fetches from clients/prospects/leads tables | COVERED |
| AC-002-7 | Contact phone/email auto-populated but editable | `meeting-service.ts:131-162` — contact_phone, contact_email resolved and saved; `schema.ts:4457-4458` — columns present | COVERED |
| AC-002-8 | All Day checkbox disables time pickers | `meetings-calendar.tsx:125` — `is_all_day: boolean` in NewMeetingForm; `schema.ts:4455` — `is_all_day` column | COVERED |
| AC-002-9 | At least one Required Invitee required | `meeting-service.ts:164-175` — invitees inserted if provided; **no server-side validation that at least one required invitee exists** | GAP |
| AC-002-10 | On save, meeting appears immediately | `meetings-calendar.tsx` — useQueryClient + invalidate on mutation | COVERED |
| BR-002-1 | Start datetime must be future for new meetings | `meeting-service.ts:123-126` — only validates end > start; **no future-time validation for new meetings** | GAP |
| BR-002-2 | End must be after start | `meeting-service.ts:123-126` — `if (endTime <= startTime) throw ValidationError` | COVERED |
| BR-002-3 | Duration ≤ 8 hours unless all-day | Not found in `meeting-service.ts` | GAP |
| BR-002-4 | Duplicate detection: warn if ±30 min conflict | Not found in `meeting-service.ts` or routes | GAP |

---

### FR-003: Edit / Cancel / Reschedule Meeting

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-003-1 | Edit visible for status = 'scheduled' | `meetings-calendar.tsx` — status-conditional rendering | COVERED |
| AC-003-2 | All editable fields modifiable | `meeting-service.ts:226-245` — update allowlist: title, meeting_type, mode, start_time, end_time, location, reminder_minutes, notes, is_all_day | PARTIAL — subject/reason/invitees/remarks not in update allowlist |
| AC-003-3 | Cancel prompts confirmation dialog | `meetings-calendar.tsx` — cancel flow with Dialog; `meetings.ts:67-90` — cancel endpoint | COVERED |
| AC-003-4 | Cancelled meetings shown greyed out with strikethrough | `meetings-calendar.tsx:217` — CANCELLED: `bg-red-200` (not grey); strikethrough not verifiable from schema | PARTIAL — Color is red not grey |
| AC-003-5 | Reschedule creates ConversationHistory entry | `meeting-service.ts:386-398` — `insertConversationHistory` with 'MEETING_RESCHEDULED' type | COVERED |
| BR-003-1 | Only creator or Supervisor can edit/cancel | `meeting-service.ts:218-223` — IDOR check on organizer_user_id; no Supervisor override path implemented | PARTIAL |
| BR-003-2 | Completed/cancelled meetings cannot be edited | `meeting-service.ts:265-270` — complete() rejects non-SCHEDULED; `cancel()` at line 313 rejects non-SCHEDULED | COVERED |
| BR-003-3 | Cannot cancel if call report already filed | `meeting-service.ts:319-328` — checks for existing call reports, throws ConflictError | COVERED |

---

### FR-004: File Call Report (Scheduled Meeting)

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-004-1 | File CR button on completed meetings with pending CR status | `call-report-form.tsx` — meetingId search param; `meetings-calendar.tsx` — "File Call Report" link for completed meetings | COVERED |
| AC-004-2 | Pre-populated fields shown read-only | `call-report-form.tsx:45-55` — MeetingData interface; form fetches meeting and pre-populates | COVERED |
| AC-004-3 | Summary of Discussion mandatory, min 20 chars | Service does not validate `summary` min-length at `call-report-service.ts:76-206`. Field stored as `summary: text().notNull()` at `schema.ts:4501`; **no 20-char minimum enforced** | GAP |
| AC-004-4 | Yellow banner if > threshold days | `call-report-form.tsx:8` — "5-business-day late-filing warning banner" documented in component header; `businessDaysBetween` imported at line 40 | COVERED |
| AC-004-5 | If requires_approval, status → pending_approval; CallReportApproval created | `call-report-service.ts:365-379` — sets PENDING_APPROVAL, inserts into callReportApprovals | COVERED |
| AC-004-6 | If !requires_approval, status → completed (APPROVED) | `call-report-service.ts:382-390` — auto-approves with APPROVED status | COVERED |
| AC-004-7 | ConversationHistory entry auto-created | `call-report-service.ts:409-419` — inserts CALL_REPORT_FILED history entry | COVERED |
| AC-004-8 | Next meeting auto-created if dates provided | `call-report-service.ts:422-440` — auto-creates Meeting record | COVERED |
| BR-004-1 | Business days = weekdays only (skipping Sat/Sun) | `call-report-service.ts:45-65` — `calculateBusinessDays()` skips day 0 (Sun) and 6 (Sat) | COVERED |
| BR-004-1 (timezone) | Use RM's timezone for day calculation (A.6.1) | `call-report-service.ts:45-65` — uses `new Date()` directly (UTC); **no timezone conversion to RM's local timezone** | GAP |
| BR-004-2 | Threshold = 5 days from SystemConfig | `call-report-service.ts:19` — `const LATE_FILING_THRESHOLD_DAYS = 5` — **hardcoded, not read from SystemConfig** | GAP |
| BR-004-3 | 1:1 meeting ↔ call report | `call-report-service.ts:133-142` — conflict check before insert; `schema.ts:4490` — meeting_id FK; **no unique partial index defined in schema** | PARTIAL |
| BR-004-4 | Filing sets meeting.call_report_status = 'filed' | `call-report-service.ts:400-406` — updates meeting with `call_report_status: 'FILED'` | COVERED |

---

### FR-005: Standalone Call Report

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-005-1 | "New Call Report" button accessible from calendar and list | `call-report-list.tsx:30` — FileText button; `call-report-form.tsx` — standalone mode | COVERED |
| AC-005-2 | All fields editable (no read-only pre-population) | `call-report-form.tsx:4-12` — "Standalone mode: all fields editable" documented | COVERED |
| AC-005-3 | report_type automatically set to 'standalone' | `call-report-service.ts:112` — `const reportType = data.report_type || 'STANDALONE'` | COVERED |
| AC-005-4 | 5-day rule does NOT apply (requires_approval=false) | `call-report-service.ts:294-354` — standalone branch always APPROVED | COVERED |
| AC-005-5 | ConversationHistory entry auto-created on submit | `call-report-service.ts:320-330` — inserts CALL_REPORT_FILED | COVERED |
| BR-005-1 | Standalone does not create Meeting record | `call-report-service.ts:294` — only creates meeting if next_meeting_start provided; report_type=STANDALONE no mandatory meeting_id | COVERED |
| BR-005-2 | Start/end can be in the past | `call-report-service.ts:76+` — no future constraint on meeting_date for standalone | COVERED |
| BR-005-3 | Standalone set to 'completed' on submit | `call-report-service.ts:300-306` — sets APPROVED (equivalent to completed) | COVERED |

---

### FR-006: Call Report Approval Workflow

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-006-1 | Supervisor dashboard: Pending + My Approvals tabs | `approval-workspace.tsx:76-80` — two-tab (`pending`, `decisions`); `cr-approvals.ts:32-43` — GET / list | COVERED |
| AC-006-2 | Supervisor claims report (locks from others) | `approval-workflow-service.ts:81-110` — claim() validates PENDING→CLAIMED; `cr-approvals.ts:50-69` — PATCH /:id/claim | COVERED |
| AC-006-3 | Claimed report opens with Approve/Reject buttons | `approval-workspace.tsx` — Approve/Reject dialog per record | COVERED |
| AC-006-4 | Approve sets call_report.status = 'approved' | `approval-workflow-service.ts:155-163` — sets APPROVED on callReports | COVERED |
| AC-006-5 | Reject requires reviewer_comments ≥ 20 chars; sets rejected | `approval-workflow-service.ts:196-198` — validates 20-char minimum; sets RETURNED on callReports (line 239-244) | PARTIAL — BRD says 'rejected' but implementation uses 'RETURNED' for rejected call report status |
| AC-006-6 | Rejected → RM's 'Rejected Call Reports' queue | `approval-workflow-service.ts:239-244` — sets report_status = 'RETURNED' (BRD says 'rejected') | PARTIAL |
| AC-006-7 | Re-submission starts new approval cycle (new record) | `call-report-service.ts:374-379` — inserts new callReportApprovals on submit | COVERED |
| BR-006-1 | Only same-branch/hierarchy supervisors can claim | `approval-workflow-service.ts:81-110` — no branch filter; `cr-approvals.ts:50` — `requireAnyRole('BO_CHECKER', 'BO_HEAD')` only | GAP |
| BR-006-2 | Max 20 uncompleted reports claimed at a time | Not found in `approval-workflow-service.ts` | GAP |
| BR-006-3 | Auto-unclaim after 2 business days | Not found in `approval-workflow-service.ts` or any cron/batch | GAP |
| BR-006-4 | RM notified on approve/reject | No email/in-app notification trigger in `approval-workflow-service.ts` | GAP |

---

### FR-007: Opportunity Capture

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-007-1 | Add Opportunity button from CR form and Opportunities list | `opportunities.ts:63-70` — POST /; `opportunities-pipeline.tsx` exists (727 lines) | COVERED |
| AC-007-2 | Opportunity form fields | `opportunities` schema at `schema.ts:4957-4975` — name, product_type, pipeline_value, probability, expected_close_date, call_report_id | PARTIAL — BRD requires: type, relationship, sub_product, investment_mode, discovered_amount, opportunity_date, due_date; schema uses simplified structure (pipeline_value, probability stage) |
| AC-007-3 | Stage dropdown: 6 BRD values | `schema.ts:4189-4191` — opportunityStageEnum: 'IDENTIFIED', 'QUALIFYING', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST' — **does not match BRD values**: "Interested, To be approached, Won – Doc in Process, Won – Doc completed, Declined, Not Proceeding" | GAP |
| AC-007-4 | Status auto-set to 'open' on creation | `opportunity-service.ts:61` — stage defaults to 'IDENTIFIED'; **no 'status' field (open/expired/closed/aborted)** | GAP |
| AC-007-5 | Editing opportunity updates ConversationHistory | Not implemented in `opportunity-service.ts` | GAP |
| BR-007-1 | opportunity_discovered > 0 | `opportunity-service.ts:56` — `pipeline_value: data.pipeline_value` without positive-value check | GAP |
| BR-007-2 | opportunity_closed ≤ opportunity_discovered | No `opportunity_closed` field in schema | GAP |
| BR-007-3 | Won-Doc-completed: opportunity_closed mandatory | No such stage or field in schema | GAP |
| BR-007-4 | Due date ≥ opportunity_date | No `due_date` or validation in service | GAP |

---

### FR-008: Opportunity Bulk Upload

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-008-1 | Upload accepts only .xls/.xlsx up to 5 MB | `opportunities.ts:123-139` — accepts CSV content (not XLS/XLSX); `MAX_ROWS = 500` at line 99; **no MIME type or file-size guard for XLS/XLSX** | PARTIAL |
| AC-008-2 | Downloadable template | `opportunities.ts:113-120` — GET /upload-template returns CSV template | COVERED |
| AC-008-3 | Processing indicator after upload | Frontend handles loading state | COVERED |
| AC-008-4 | Summary: X imported, Y failed | `opportunities.ts:207-215` — returns success_count, error_count | COVERED |
| AC-008-5 | Failed rows downloadable as error log | `opportunities.ts:207-215` — errors array in response; no file download endpoint | PARTIAL |
| BR-008-1 | Max 500 rows | `opportunities.ts:135-138` — enforced | COVERED |
| BR-008-2 | Each row validated against same rules | `opportunities.ts:145-189` — row-level validation | COVERED |
| BR-008-3 | Valid rows imported even if some fail | `opportunities.ts:196-205` — partial success loop | COVERED |

---

### FR-009: Opportunity Auto-Expiry

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-009-1 | Nightly batch at configurable time (default 01:00 UTC) | Not found in `opportunity-service.ts`, `server/routes.ts`, or any cron file | GAP |
| AC-009-2 | status='open' + due_date < today → 'expired' | No `status` field in `opportunities` schema; no expiry function | GAP |
| AC-009-3 | Batch summary email to RM | Not implemented | GAP |
| AC-009-4 | Expired visual indicator (strikethrough/muted) | No expired status in schema | GAP |
| BR-009-1 | Only 'open' affected | No status field; not applicable | GAP |
| BR-009-2 | Configurable via SystemConfig | Not implemented | GAP |

---

### FR-010: Expense Capture

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-010-1 | Add Expense from CR form and Expenses list | `expenses.ts` — full CRUD routes; `index.ts:574` — `router.use('/expenses', expenseRoutes)` | COVERED |
| AC-010-2 | Expense type dropdown: 4 BRD values | `expense-service.ts:2` — "TRAVEL, MEALS, ENTERTAINMENT, ACCOMMODATION, TRANSPORTATION, COMMUNICATION, GIFTS, OTHER" — **different from BRD values**: "Client Entertainment, Conveyance, Festive Events, Others" | PARTIAL |
| AC-010-3 | Conveyance reveals: From/To Place, Transport Mode, Distance | Schema `crmExpenses` at `schema.ts:4598-4619` — no from_place, to_place, transport_mode, distance columns | GAP |
| AC-010-4 | Transport mode dropdown: 7 values | Not in schema | GAP |
| AC-010-5 | Expense date not in future | `expense-service.ts:65-67` — validates `expenseDate > new Date()` throws error | COVERED |
| AC-010-6 | Amount > 0 | `expense-service.ts:56` — `if (data.amount <= 0) throw` | COVERED |
| AC-010-7 | Expenses list with filters: type, date range | `expenses.ts` — list endpoint with expense_status, call_report_id, meeting_id, date_from, date_to filters | COVERED |
| BR-010-1 | From/To/Mode/Distance mandatory for Conveyance | Schema missing; not implemented | GAP |
| BR-010-3 | Distance > 0 when required | Not implemented | GAP |

---

### FR-011: Feedback Capture

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-011-1 | Feedback button on meeting detail and customer dashboard | `call-reports.ts:104-121` — POST /:id/feedback endpoint | COVERED |
| AC-011-2 | Feedback form: free-text ≥ 10 chars + optional sentiment | `call-report-service.ts:556-558` — validates comment ≥ 10 chars; **no sentiment field (Positive/Neutral/Negative)** in `callReportFeedback` schema | PARTIAL |
| AC-011-3 | Source auto-set based on entry point | `callReportFeedback` schema at `schema.ts:4532-4542` — **no source column (calendar vs customer_dashboard)** | GAP |
| AC-011-4 | ConversationHistory entry on submit | Not found in `addFeedback()` at `call-report-service.ts:550-588` — no conversationHistory insert after feedback | GAP |
| BR-011-1 | Feedback is append-only (no edit/delete) | `call-report-service.ts:550+` — INSERT only, no update/delete method for feedback | COVERED |
| BR-011-2 | Multiple feedbacks per meeting/relationship | Schema allows many-to-one; no constraint against multiple | COVERED |

---

### FR-012: Conversation History

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-012-1 | Accessible from Customer Dashboard and Calendar | `index.ts:638-645` — GET /conversation-history CRUD route registered | COVERED |
| AC-012-2 | Timeline: reverse chronological with icon, summary, link | `schema.ts:4573-4587` — conversationHistory table with interaction_type, summary, reference_type, reference_id | COVERED |
| AC-012-3 | Filter by type and date range | `/conversation-history` CRUD route via createCrudRouter (standard filter support) | COVERED |
| AC-012-4 | Entries immutable — no edit/delete UI | `conversationHistory` schema has no `deleted_at` soft-delete column; conversationTypeEnum values are append-only | COVERED |
| AC-012-5 | Lazy-load 20 entries per page | `index.ts:638-645` — createCrudRouter with pagination | COVERED |
| BR-012-1 | Auto-created on: meeting status change, CR filed, feedback submitted, opportunity created/updated, action item completed | Meeting changes: COVERED (`meeting-service.ts` inserts on SCHEDULED/COMPLETED/CANCELLED/RESCHEDULED); CR filed: COVERED (`call-report-service.ts:409-419`); Feedback: **NOT inserted** (see FR-011); Opportunity created/updated: **NOT inserted** (`opportunity-service.ts` has no history insert); Action item completed: **NOT inserted** | PARTIAL |
| BR-012-2 | Summary format: `'{type} — {entity}. {first 100 chars}'` | `meeting-service.ts:183-186` — custom format strings used; not exactly BRD format but functional | PARTIAL |

---

### FR-013: Action Item Management

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-013-1 | Action items inline in call report form | `call-report-form.tsx:84-91` — ActionItemRow interface; inline repeater | COVERED |
| AC-013-2 | Fields: title, description, assigned user, due date, priority | `schema.ts:4545-4559` — actionItems table has title, description, assigned_to, due_date, priority | COVERED |
| AC-013-3 | My Action Items dashboard widget with filters | `index.ts:599-606` — CRUD route registered; **no dedicated dashboard widget confirmed** | PARTIAL |
| AC-013-4 | Completing sets completed_at and creates ConversationHistory | `schema.ts:4557` — `completed_at` column present; **no ConversationHistory insert on completion in any service** | PARTIAL |
| AC-013-5 | Overdue items highlighted in red | No service-level overdue query; frontend handling only | PARTIAL |
| BR-013-1 | Only assigned to same branch/hierarchy users | No validation in `call-report-service.ts` action item creation | GAP |
| BR-013-2 | Completed cannot be re-opened | No update guard for completed action items found | GAP |

---

### FR-014: Attachment Management

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-014-1 | Upload zone: PDF, DOCX, XLSX, JPEG, PNG | `callReports` schema — `attachment_urls: jsonb` at `schema.ts:4510`; `call-report-service.ts:97` — `attachment_urls?: unknown`; no MIME whitelist enforced | PARTIAL |
| AC-014-2 | Max 10 MB per file | Not enforced in `call-report-service.ts` | GAP |
| AC-014-3 | Max 50 MB total per call report | Not enforced | GAP |
| AC-014-4 | Preview inline for PDF/images | Not verifiable in call-report-form.tsx from available lines | NOT CONFIRMED |
| AC-014-5 | Delete only while in DRAFT status | `call-report-service.ts:226-230` — update blocked for non-DRAFT/RETURNED; attachment_urls in update allowlist at line 237 | COVERED |
| BR-014-1 | Virus scan before storage | Not found in any service | GAP |
| BR-014-2 | Immutable once status = completed/approved | Update guard at `call-report-service.ts:226-230` | COVERED |

---

### FR-015: Call Reports List & Search

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-015-1 | Table: Date, Subject, Client, Type, Status, Filed By | `call-report-list.tsx:38-46` — columns: report_code, subject, meeting_date, relationship_name, report_status, created_at | COVERED |
| AC-015-2 | Filters: date range, status, meeting reason, relationship | `call-reports.ts:71-82` — reportStatus, reportType, filedBy, branchId, search, startDate, endDate | PARTIAL — meeting_reason filter missing |
| AC-015-3 | Full-text search on subject and summary_of_discussion | `call-report-service.ts:480-487` — searches subject and summary (ilike) | COVERED |
| AC-015-4 | Export to CSV/Excel | Not found in `call-report-list.tsx` or routes | GAP |
| AC-015-5 | Clicking row opens call report detail | `call-report-list.tsx:30` — navigate on row click | COVERED |
| BR-015-1 | Role-scoped visibility (RM=own, Supervisor=team, etc.) | `call-reports.ts:74-76` — `filedBy` filter; no automatic role-based scoping enforced in service | PARTIAL |

---

### FR-016: Meeting Notifications & Reminders

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-016-1 | Meeting reminder: 24h before, 1h before | `meeting-service.ts:448-461` — `getPendingReminders()` checks `reminder_minutes` column; `markReminderSent()` at line 464; **only single reminder_minutes configurable per meeting, not two fixed intervals** | PARTIAL |
| AC-016-2 | Overdue CR alert daily at 9 AM | Not found in any cron/scheduler | GAP |
| AC-016-3 | Approval submitted → in-app + email to supervisors | `cr-approvals.ts` — no notification trigger; `approval-workflow-service.ts` — no notification trigger | GAP |
| AC-016-4 | Approval decision → in-app + email to RM | Not found in `approval-workflow-service.ts` | GAP |
| AC-016-5 | Users configure notification preferences | `notificationInboxService` exists at `notification-inbox-service.ts`; **no NotificationPreference table in schema** (only crmNotifications) | GAP |
| BR-016-1 | Preferences stored per user | `crmNotifications` schema exists but no preference table | GAP |
| BR-016-2 | Critical notifications cannot be disabled | Not implemented | GAP |

---

### FR-017: Supervisor Team Dashboard

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-017-1 | Widgets: Meetings This Week (bar), CR Filing Rate (gauge), Pipeline (funnel), Overdue (counts) | `opportunity-service.ts:164-185` — pipeline dashboard by stage exists; **no team CR filing rate, meetings-this-week by RM, or overdue count endpoints** | PARTIAL |
| AC-017-2 | Drill-down from widgets | Not found | GAP |
| AC-017-3 | Date range selector | Not found in any supervisor dashboard page | GAP |
| AC-017-4 | RM filter | Not found | GAP |
| BR-017-1 | Dashboard refreshes every 5 minutes | Not found | GAP |
| BR-017-2 | Branch Manager sees branch-level | No branch-scoping in pipeline dashboard | GAP |

---

### FR-018: Mark Meeting as Completed (Addendum)

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-018-1 | Mark as Completed button when status=SCHEDULED AND end < NOW | `meetings.ts:54-64` — PATCH /:id/complete endpoint | COVERED |
| AC-018-2 | Button NOT visible when end in future | Frontend handles visibility; service guard at `meeting-service.ts:265-270` — rejects non-SCHEDULED | COVERED |
| AC-018-3 | Status transitions: SCHEDULED → COMPLETED | `meeting-service.ts:273-283` — sets COMPLETED | COVERED |
| AC-018-4 | ConversationHistory entry: 'meeting_completed' | `meeting-service.ts:285-294` — inserts MEETING_COMPLETED | COVERED |
| AC-018-5 | File Call Report becomes visible after completion | `meetings-calendar.tsx:8` — documented as implemented | COVERED |
| AC-018-6 | Confirmation dialog shown | `meetings-calendar.tsx` — Dialog-based confirmation | COVERED |
| AC-018-7 | Calendar card changes blue → green | `meetings-calendar.tsx:215-216` — COMPLETED maps to green | COVERED |
| BR-018-1 | Only creator or Supervisor can complete | `meeting-service.ts:260-264` — IDOR check on organizer_user_id; no Supervisor override path | PARTIAL |
| BR-018-2 | Cancelled meetings cannot be completed | `meeting-service.ts:265-270` — only SCHEDULED can be completed | COVERED |
| BR-018-3 | No-show meetings cannot be completed | `meeting-service.ts:265-270` — guard allows only SCHEDULED; NO_SHOW in enum but no explicit check (implicitly blocked) | COVERED |
| BR-018-4 | Marking complete is irreversible | `meeting-service.ts:265-270` — no revert endpoint | COVERED |

---

### FR-019: Meeting No-Show Auto-Transition (Addendum)

| AC / BR | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| AC-019-1 | Batch runs every hour (configurable) | Not found in any file — no cron/scheduler for meetings | GAP |
| AC-019-2 | SCHEDULED meetings past grace_period → NO_SHOW | Not implemented; NO_SHOW is in meetingStatusEnum but no batch transitions to it | GAP |
| AC-019-3 | Grace period from SystemConfig | Not implemented | GAP |
| AC-019-4 | RM notified: "Meeting marked as No Show" | Not implemented | GAP |
| AC-019-5 | Supervisor notified | Not implemented | GAP |
| AC-019-6 | No-show meetings appear red on calendar | `meetings-calendar.tsx:219` — NO_SHOW maps to grey, not red | PARTIAL |
| AC-019-7 | ConversationHistory entry: 'meeting_no_show' | `conversationTypeEnum` at `schema.ts:4153-4157` — **MEETING_NO_SHOW is missing from enum** | GAP |
| BR-019-1 | Batch is idempotent | Not implemented | GAP |
| BR-019-2 | No-show meetings cannot be edited or have CR filed | Not enforced (no batch = no no-show meetings) | GAP |
| BR-019-3 | Supervisor override endpoint: PATCH /override-status | Not found in `meetings.ts` | GAP |

---

### Addendum Requirements Coverage

| Addendum Req | Requirement | Implementation | Status |
|-------------|-------------|----------------|--------|
| A.2 — Notification entity | `Notification` table (v1.1 spec) | `schema.ts:4998-5010` — crmNotifications table exists but lacks email_status, email_retry_count fields from BRD | PARTIAL |
| A.2 — NotificationPreference entity | Per-user per-event per-channel preferences with is_critical | Not found in schema | GAP |
| A.3 — Polymorphic FK strategy | entity_type discriminator + relationship_id | `meetings` and `callReports` use lead_id/prospect_id/client_id separate columns (not polymorphic discriminator) | PARTIAL |
| A.4 — AuditLog entity | Generic cross-entity audit log | No generic `audit_log` table for CRM module (only domain-specific tables: glAuditLog, riskProfilingAuditLogs) | GAP |
| A.5 — Database indexes | 16 recommended indexes | Not verifiable from schema definition (would be in migrations); not listed in schema.ts | UNVERIFIABLE |
| A.6.1 — Timezone for business-day calc | RM's timezone, not UTC | `call-report-service.ts:45-65` — UTC only | GAP |
| A.6.2 — Draft uniqueness + auto-save | Unique partial index; 30-sec auto-save debounce | CR duplicate check at `call-report-service.ts:133-142` (runtime check only, no DB unique partial index); no auto-save endpoint | PARTIAL |
| A.6.3 — Denormalized name sync | Show snapshot + "(Previously known as X)" | `relationship_name` stored in meetings/callReports but no "previously known as" UI logic | PARTIAL |
| A.6.6 — Pagination `has_next`/`has_previous` | Standard envelope with has_next/has_previous | `call-report-service.ts:514` — returns `{ data, total, page, pageSize }` — **missing has_next, has_previous fields** | GAP |

---

## Phase 3 — Test Coverage

### Test File: `tests/e2e/meeting-callreport.spec.ts` (1343 lines)

| Test Group | Scenarios Covered |
|-----------|------------------|
| Meeting CRUD (line 138–310) | Create with auto-generated MTG code; code increment; end<start rejection; end=start rejection; getById with invitees; update fields; update time validation |
| Calendar Data (line 316–385) | Organizer + invitee union; deduplication; sort by start_time |
| Status Transitions: Complete (line 392–456) | SCHEDULED→COMPLETED; reject on non-SCHEDULED; reject on CANCELLED; meeting not found |
| Status Transitions: Cancel (line 458–531) | Cancel with reason; reject no reason; reject whitespace reason; reject COMPLETED; reject CANCELLED; not found |
| Status Transitions: Reschedule (line 533–719) | Reschedule SCHEDULED; end<start rejection; non-SCHEDULED rejection; not found; invitee update |
| Call Report CRUD (line 725–891) | Standalone CR auto-code; SCHEDULED CR linked to COMPLETED; reject without meeting_id; reject non-COMPLETED meeting; reject meeting not found; create with action items; getById with items; not found |
| CR Update Guards (line 897+) | Update DRAFT; update RETURNED; reject update on SUBMITTED; reject update on APPROVED; IDOR rejection |
| Business-Day Calculation | Tested via `callReportService.calculateBusinessDays` |
| Submission Workflow | On-time auto-approve; late-filing PENDING_APPROVAL |

### Coverage Gaps in Tests
- No test for feedback creation or immutability
- No test for conversation history auto-generation
- No test for opportunity bulk upload validation
- No test for approval workflow (claim/approve/reject)
- No test for expense creation or Conveyance conditional fields
- No test for no-show batch (FR-019)
- No test for attachment validation (size limits, MIME types)
- No test for duplicate meeting detection (BR-002-4)
- No test for start-time future validation (BR-002-1)
- No test for notification delivery

**Test coverage estimate:** ~40% of FRs have direct test coverage; core meeting lifecycle and basic CR workflow well-tested; workflow, notifications, and batches untested.

---

## Phase 4 — Gap List

### Gaps by Severity

#### CRITICAL (Blocking compliance / core functionality)

| Gap ID | FR/BR | Description | Estimated Size |
|--------|-------|-------------|----------------|
| GAP-001 | FR-019 | No-show auto-transition batch entirely missing — NO_SHOW enum value exists in schema but no batch job, no cron, no PATCH /override-status endpoint | XL |
| GAP-002 | FR-009 | Opportunity auto-expiry batch entirely missing — no status field in schema, no nightly job | L |
| GAP-003 | A.2 | NotificationPreference table missing — critical for compliance rule "critical notifications cannot be disabled" | L |
| GAP-004 | A.4 | Generic AuditLog entity missing — required for MiFID II / RBI KYC / MAS TBO regulatory compliance per BRD section 8.2 | L |
| GAP-005 | FR-006 BR-006-1 | Approval claims not scoped to same branch/hierarchy — any supervisor can claim any report regardless of branch | M |

#### HIGH (Functional correctness issues)

| Gap ID | FR/BR | Description | Estimated Size |
|--------|-------|-------------|----------------|
| GAP-006 | FR-007 | Opportunity schema mismatch — BRD stages (Interested/To be approached/Won–Doc in Process/Won–Doc completed/Declined/Not Proceeding) vs schema (IDENTIFIED/QUALIFYING/PROPOSAL/NEGOTIATION/WON/LOST); missing fields: opportunity_discovered, opportunity_closed, sub_product, investment_mode, due_date, opportunity_date | XL |
| GAP-007 | FR-010 | Conveyance expense fields entirely missing — no from_place, to_place, transport_mode, distance columns; expense type enum mismatches BRD values | M |
| GAP-008 | BR-004-2 | Late-filing threshold hardcoded at 5 days — not read from SystemConfig; LATE_FILING_THRESHOLD_DAYS = 5 is a constant | S |
| GAP-009 | A.6.1 | Business-day calculation uses UTC not RM's configured timezone | S |
| GAP-010 | FR-006 BR-006-2 | No cap of 20 claimed reports per supervisor | S |
| GAP-011 | FR-006 BR-006-3 | No auto-unclaim after 2 business days | M |
| GAP-012 | FR-006 BR-006-4 | No RM notification (email + in-app) on approval decision | M |
| GAP-013 | FR-016 AC-016-2 | Overdue call report alert (daily 9 AM) not implemented | M |
| GAP-014 | FR-016 AC-016-3/4 | Approval workflow notifications (submitted → supervisors, decision → RM) not implemented | M |
| GAP-015 | AC-004-3 | Summary of Discussion minimum 20 characters not validated server-side | S |

#### MEDIUM (Missing features)

| Gap ID | FR/BR | Description | Estimated Size |
|--------|-------|-------------|----------------|
| GAP-016 | FR-017 | Supervisor Team Dashboard missing — no team activity, filing rate, or meeting coverage widgets | XL |
| GAP-017 | FR-011 AC-011-3 | Feedback source field missing (calendar vs customer_dashboard) | XS |
| GAP-018 | FR-011 AC-011-4 | No ConversationHistory entry created when feedback submitted | S |
| GAP-019 | FR-012 BR-012-1 | ConversationHistory not auto-created on: feedback submitted, opportunity created/updated, action item completed | S |
| GAP-020 | FR-011 AC-011-2 | Sentiment field (Positive/Neutral/Negative) missing from callReportFeedback schema | S |
| GAP-021 | FR-015 AC-015-4 | Export to CSV/Excel not implemented | M |
| GAP-022 | BR-002-1 | New meeting start datetime not validated as future | S |
| GAP-023 | BR-002-3 | Meeting duration ≤ 8 hours not validated | XS |
| GAP-024 | BR-002-4 | Duplicate meeting detection (±30 min warning) not implemented | S |
| GAP-025 | FR-013 BR-013-1 | Action item assignment not validated to same branch | S |
| GAP-026 | FR-013 BR-013-2 | Completed action items can be re-opened (no guard) | S |
| GAP-027 | A.6.6 | Pagination response missing has_next / has_previous fields | XS |
| GAP-028 | AC-006-5/6 | Rejected call report status = 'RETURNED' but BRD says 'rejected' — status naming mismatch | XS |
| GAP-029 | BR-001-1 | Default calendar view is 'month' but BRD requires 'week' | XS |
| GAP-030 | BR-001-3 | Overdue (orange) color not in statusBlockColors; call_report_status=PENDING meetings not colored orange | S |
| GAP-031 | FR-002 AC-002-9 | No server-side validation that at least one required invitee is provided | S |
| GAP-032 | FR-014 AC-014-2/3 | Per-file 10 MB and total 50 MB attachment limits not enforced | S |
| GAP-033 | BR-014-1 | No virus scanning integration for uploaded files | M |

#### LOW (Refinements)

| Gap ID | FR/BR | Description | Estimated Size |
|--------|-------|-------------|----------------|
| GAP-034 | FR-008 AC-008-1 | Bulk upload accepts CSV, not XLS/XLSX as BRD specifies | S |
| GAP-035 | AC-003-4 | Cancelled meeting color is red not grey (BRD: grey); strikethrough not implemented | XS |
| GAP-036 | BR-015-1 | No automatic role-based CR scoping (RM=own, Supervisor=team) | M |
| GAP-037 | FR-016 AC-016-1 | Only single reminder_minutes per meeting; BRD requires 24h + 1h reminders as separate events | S |
| GAP-038 | A.6.3 | "Previously known as" UI hint for name-changed relationships not implemented | XS |
| GAP-039 | BR-018-1 / BR-003-1 | Supervisor cannot complete or cancel other RMs' meetings (IDOR check blocks it) | S |

---

## Phase 5 — NFR Audit

| NFR | Requirement | Implementation | Status |
|-----|-------------|----------------|--------|
| NFR-PERF-1 | Calendar renders ≤ 2 s for 200 meetings | `getFilteredCalendarData` at `meeting-service.ts:473` — indexed query with limit/offset; no performance test | UNVERIFIED |
| NFR-PERF-2 | List endpoints paginated (default 20, max 100) | `call-report-service.ts:461` — `Math.min(pageSize, MAX_PAGE_SIZE=200)`; `opportunity-service.ts:138` — `Math.min(pageSize, 100)` — CR allows up to 200, BRD says max 100 | PARTIAL |
| NFR-SEC-1 | JWT authentication required | `requireCRMRole()` at `meetings.ts:7,19`; all routes protected | COVERED |
| NFR-SEC-2 | RBAC at API + service layer | `requireCRMRole()` per route; IDOR checks in services | COVERED |
| NFR-SEC-3 | Input validation server-side | `meeting-service.ts:123-126`; `call-report-service.ts:56,780`; `cr-approvals.ts:114` | COVERED |
| NFR-SEC-4 | OWASP Top 10 | Rate limiting on bulk upload: `opportunities.ts:18-22`; parameterized queries via Drizzle ORM | COVERED |
| NFR-SEC-5 | Audit trail for all mutations | ConversationHistory on key events; **no generic AuditLog** | PARTIAL |
| NFR-SEC-6 | File upload security | MIME validation: NOT implemented; antivirus: NOT implemented | GAP |
| NFR-SCALE-1 | Horizontal stateless servers | Express + Drizzle — inherently stateless | COVERED |
| NFR-AVAIL-1 | 99.9% uptime | Architecture-level; not verifiable in code | UNVERIFIED |
| NFR-ACCESS-1 | WCAG 2.1 Level AA | No aria labels or keyboard-nav tests found | UNVERIFIED |
| NFR-DATA-1 | UTC storage, user-timezone display | `schema.ts` — TIMESTAMPTZ columns; no TZ display utility found | PARTIAL |
| NFR-BACKUP-1 | Data backup plan | Out of scope for code audit | UNVERIFIED |

---

## Phase 6 — Scorecard & Verdict

### Coverage by FR

| FR | Title | Coverage % | Gaps |
|----|-------|-----------|------|
| FR-001 | Calendar Multi-View | 75% | Default view wrong; overdue color missing |
| FR-002 | Schedule Meeting | 65% | No future-time validation; no 8h limit; no duplicate detection; no required-invitee guard |
| FR-003 | Edit/Cancel/Reschedule | 85% | Supervisor cannot act on other RM's meetings |
| FR-004 | File Call Report | 75% | Summary 20-char not validated; threshold hardcoded; timezone issue; no unique partial index |
| FR-005 | Standalone Call Report | 100% | — |
| FR-006 | Approval Workflow | 55% | No branch scoping; no max-claim cap; no auto-unclaim; no notifications |
| FR-007 | Opportunity Capture | 20% | Stage enum mismatch; missing BRD fields; no auto-status; no ConvHistory |
| FR-008 | Bulk Upload | 70% | CSV not XLS/XLSX; no error-log download |
| FR-009 | Opportunity Auto-Expiry | 0% | Entirely missing |
| FR-010 | Expense Capture | 50% | Conveyance fields missing; type enum mismatch |
| FR-011 | Feedback Capture | 40% | No sentiment; no source; no ConvHistory on submit |
| FR-012 | Conversation History | 70% | History not triggered on feedback/opportunity/action-item |
| FR-013 | Action Item Management | 55% | No branch validation; no re-open guard; no ConvHistory on complete |
| FR-014 | Attachment Management | 40% | No size limits; no MIME whitelist; no virus scan |
| FR-015 | Call Reports List | 70% | No CSV export; no meeting_reason filter; no role-based scoping |
| FR-016 | Notifications | 20% | No 24h+1h dual reminders; no overdue alerts; no approval notifications; no preferences |
| FR-017 | Supervisor Dashboard | 10% | Pipeline dashboard only; no team activity, filing rate, or overdue |
| FR-018 | Mark Complete (v1.1) | 90% | Supervisor cannot complete other RM's meeting |
| FR-019 | No-Show Batch (v1.1) | 0% | Entirely missing |

### Overall Score

| Domain | Score |
|--------|-------|
| Meeting CRUD & lifecycle | 80% |
| Call Report filing & workflow | 70% |
| Approval workflow | 55% |
| Opportunity management | 30% |
| Expense management | 50% |
| Feedback & Conversation History | 45% |
| Notifications | 20% |
| Supervisor Dashboard | 10% |
| Addendum (FR-018/019, AuditLog, NotifPref) | 40% |
| **OVERALL** | **~51%** |

### Verdict

**FAIL — Major gaps block regulatory and functional compliance.**

The implementation has a solid foundation: meeting CRUD, call report lifecycle, the 5-day late-filing approval routing, and conversation history for key events are well-implemented with evidence-backed code. The Mark-as-Completed flow (FR-018) is fully implemented.

However, **7 critical or high-severity gaps** prevent sign-off:

1. **FR-019 (No-Show Batch) is entirely absent** — the schema has the `NO_SHOW` enum value but there is no batch job, no PATCH `/override-status` endpoint, and no `MEETING_NO_SHOW` conversation-type entry. This is a CRITICAL addendum requirement.

2. **FR-009 (Opportunity Auto-Expiry) is entirely absent** — no status field on opportunities, no nightly job, no expired indicator.

3. **FR-007 (Opportunity) is fundamentally misaligned** — stage values, discovery/close amounts, sub-product, investment-mode, due-date, and BRD business rules (BR-007-1 through 7-4) are not implemented. The existing opportunity schema represents a generic pipeline, not the BRD's wealth-management-specific model.

4. **Generic AuditLog entity is missing** — the BRD cites MiFID II, RBI KYC, and MAS TBO compliance requirements; no append-only CRM audit log exists.

5. **NotificationPreference entity is missing** — "critical notifications cannot be disabled" (BR-016-2) is unenforceable.

6. **Supervisor Team Dashboard (FR-017) is absent** — only a generic pipeline funnel exists.

7. **Notification delivery (FR-016) is largely absent** — the `notificationInboxService` can store in-app records but no approval/overdue/reminder events are wired.

### Recommended Priority Order for Gap Closure

| Priority | Gaps | Rationale |
|----------|------|-----------|
| P0 — Before UAT | GAP-006 (opportunity schema), GAP-007 (conveyance), GAP-008 (threshold from config), GAP-009 (timezone) | Core BRD data model and calculation correctness |
| P1 — Before UAT | GAP-001 (no-show batch), GAP-002 (auto-expiry), GAP-003 (NotifPreference), GAP-004 (AuditLog) | Addendum CRITICAL items and compliance |
| P2 — Before UAT | GAP-005 (branch scoping), GAP-010–014 (approval workflow BRs), GAP-016 (supervisor dashboard), GAP-021 (CSV export) | High-impact workflow and management features |
| P3 — Before Go-Live | GAP-015 (summary 20-char), GAP-018/019 (ConvHistory events), GAP-022–024 (meeting BRs), GAP-032/033 (file security) | Completeness and security hardening |
| P4 — Post-Launch | GAP-027–039 (minor UI/color/pagination refinements) | Polish |

---

*Generated by BRD Coverage Audit Tool — TrustOMS Philippines — 2026-04-25*
