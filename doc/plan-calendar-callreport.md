# Development Plan: Calendar & Call Report Management — Phase 1 MVP

## Overview
Build the core Calendar & Call Report module for Trust OMS: multi-view calendar (Month/Week/Day), enhanced meeting scheduling with invitees, mark-meeting-completed workflow, file call report (scheduled + standalone), 5-day threshold supervisor approval routing, and a searchable call report list. This plan covers only Phase 1 MVP; later phases (Opportunities, Expenses, Feedback, Conversation History, Supervisor Dashboard) are deferred.

## Architecture Decisions

- **Extend, don't replace**: The existing `meetings`, `callReports`, `meetingInvitees`, `actionItems` tables are extended with BRD fields. No breaking changes to existing CRM Campaign module consumers.
- **Enum expansion via new enums**: PostgreSQL `ALTER TYPE … ADD VALUE` is irreversible and cannot be rolled back inside a transaction. Instead, we create new enums (e.g., `meeting_reason_enum`, `mode_of_meeting_enum`) as separate columns rather than modifying existing enums. The existing `meetingStatusEnum` needs `NO_SHOW` added — this is safe as an append-only ADD VALUE.
- **Separate FK columns**: Follow existing polymorphic pattern with `lead_id`, `prospect_id`, `client_id` as separate nullable FK columns (not a single `relationship_id`).
- **Service layer for business logic**: Custom business logic (status transitions, 5-day threshold, approval routing) lives in dedicated service files. Basic CRUD stays on `createCrudRouter`.
- **Custom route files**: Meeting and call report endpoints that go beyond CRUD (complete, submit, cancel) get dedicated route files mounted alongside the CRUD router.
- **Code generation**: Use existing pattern `${PREFIX}-${YYYYMM}-${random4digits}` for `meeting_code` and `report_code`.

## Conventions

- **Schema**: Drizzle `pgTable`/`pgEnum` in `packages/shared/src/schema.ts`. Spread `...auditFields` into every table. See existing `meetings` at line 4295 as reference.
- **Service**: Object-literal export in `server/services/<name>-service.ts`. Methods: `create`, `getAll`, `getById`, `update`, plus domain-specific actions. See `server/services/fee-plan-service.ts` for pattern.
- **Routes**: Express Router in `server/routes/back-office/<name>.ts`. Use `asyncHandler`, `requireBackOfficeRole()`. See `server/routes/back-office/fee-plans.ts`.
- **CRUD Factory**: `createCrudRouter(schema.table, { searchableColumns, defaultSort, entityKey })` in `server/routes/back-office/index.ts`. See line 530 for meetings example.
- **UI Pages**: React component with default export in `apps/back-office/src/pages/crm/<name>.tsx`. Use TanStack Query, shadcn/ui components, lucide-react icons. See `meetings-calendar.tsx`.
- **Routing**: Lazy import + Suspense in `apps/back-office/src/routes/index.tsx`. Add to `apps/back-office/src/config/navigation.ts` NavSection.
- **API calls**: `fetch('/api/v1/...')` with `authHeaders()` helper returning Bearer token.

---

## Dependency Graph

```
Phase 1 (Schema & Data Model)
    ├──────────────┬──────────────┐
    v              v              v
Phase 2         Phase 3       Phase 4
(Meeting Svc)   (CallReport    (Navigation
 + Routes)       Svc + Routes)  + Routing)
    │              │              │
    v              v              v
Phase 5         Phase 6          │
(Calendar UI) ← (Call Report UI)─┘
    │              │
    └──────┬───────┘
           v
       Phase 7
    (Integration Tests)
```

Phases 2, 3, 4 run in parallel. Phases 5, 6 run in parallel (Phase 5 needs Phase 2+4; Phase 6 needs Phase 3+4).

---

## Phase 1: Schema & Data Model Extensions
**Dependencies:** none

**Description:**
Extend existing Drizzle schema with BRD-required fields on meetings, callReports, meetingInvitees, and actionItems tables. Add new enums and new entities (CallReportApproval, ConversationHistory, SystemConfig). This phase is the foundation — all backend services depend on it.

**Tasks:**

1. **Add new enums** to `packages/shared/src/schema.ts` (insert after line 4112, before the CRM tables section):
   - `meetingReasonEnum`: `['INITIAL_MEETING', 'PORTFOLIO_REVIEW', 'PRODUCT_PRESENTATION', 'RELATIONSHIP_CHECK_IN', 'COMPLAINT_RESOLUTION', 'ONBOARDING', 'REGULATORY', 'OTHER']`
   - `modeOfMeetingEnum`: `['FACE_TO_FACE', 'VIRTUAL', 'PHONE', 'VIDEO_CALL', 'BRANCH_VISIT', 'CLIENT_OFFICE', 'LUNCH_MEETING', 'OTHER']`
   - `callReportTypeEnum`: `['SCHEDULED', 'STANDALONE']`
   - `approvalActionEnum`: `['PENDING', 'CLAIMED', 'APPROVED', 'REJECTED']`
   - `conversationTypeEnum`: `['MEETING_SCHEDULED', 'MEETING_COMPLETED', 'MEETING_CANCELLED', 'MEETING_RESCHEDULED', 'CALL_REPORT_FILED', 'CALL_REPORT_APPROVED', 'CALL_REPORT_REJECTED', 'ACTION_ITEM_COMPLETED', 'FEEDBACK_ADDED']`
   - Append `'NO_SHOW'` to existing `meetingStatusEnum` (line 4098): `['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW']`
   - Append `'PENDING_APPROVAL'` to existing `callReportStatusEnum` (line 4106): `['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING_APPROVAL']`

2. **Extend `meetings` table** (line 4295) — add columns after `meeting_status`:
   - `meeting_reason`: `meetingReasonEnum('meeting_reason')` — nullable
   - `meeting_reason_other`: `text('meeting_reason_other')` — when reason = OTHER
   - `mode_of_meeting`: `modeOfMeetingEnum('mode_of_meeting')` — nullable
   - `is_all_day`: `boolean('is_all_day').default(false).notNull()`
   - `relationship_name`: `text('relationship_name')` — denormalized display name
   - `contact_phone`: `text('contact_phone')` — auto-populated from relationship
   - `contact_email`: `text('contact_email')` — auto-populated from relationship
   - `remarks`: `text('remarks')`
   - `call_report_status`: `text('call_report_status')` — denormalized: 'PENDING' | 'FILED'
   - `branch_id`: `integer('branch_id')` — for branch-scoped queries
   - `completed_at`: `timestamp('completed_at', { withTimezone: true })` — when marked complete
   - `completed_by`: `integer('completed_by').references(() => users.id)` — who marked it

3. **Extend `meetingInvitees` table** (line 4315) — add:
   - `invitee_type`: `text('invitee_type').default('REQUIRED').notNull()` — 'REQUIRED' | 'OPTIONAL'
   - `...auditFields` (currently missing audit fields)

4. **Extend `callReports` table** (line 4327) — add columns:
   - `report_type`: `callReportTypeEnum('report_type').notNull().default('SCHEDULED')` — SCHEDULED or STANDALONE
   - `meeting_reason`: `meetingReasonEnum('call_report_meeting_reason')` — copied from meeting or entered for standalone
   - `person_met`: `text('person_met')` — name of person met
   - `client_status`: `text('client_status')` — client sentiment/status at time of meeting
   - `state_of_mind`: `text('state_of_mind')` — emotional state assessment
   - `summary_of_discussion`: `text('summary_of_discussion')` — detailed discussion (existing `summary` kept for backward compat)
   - `next_meeting_start`: `timestamp('next_meeting_start', { withTimezone: true })`
   - `next_meeting_end`: `timestamp('next_meeting_end', { withTimezone: true })`
   - `filed_date`: `timestamp('filed_date', { withTimezone: true })` — when submitted
   - `days_since_meeting`: `integer('days_since_meeting')` — computed on submit
   - `branch_id`: `integer('branch_id')`
   - `approval_submitted_at`: `timestamp('approval_submitted_at', { withTimezone: true })`

5. **Extend `actionItems` table** (line 4356) — add:
   - `title`: `text('title')` — short title (description remains for details)
   - `created_by_user_id`: `integer('created_by_user_id').references(() => users.id)`

6. **Create `callReportApprovals` table** (new, after actionItems):
   ```
   callReportApprovals = pgTable('call_report_approvals', {
     id: serial('id').primaryKey(),
     call_report_id: integer('call_report_id').references(() => callReports.id).notNull(),
     supervisor_id: integer('supervisor_id').references(() => users.id).notNull(),
     action: approvalActionEnum('action').notNull().default('PENDING'),
     claimed_at: timestamp('claimed_at', { withTimezone: true }),
     decided_at: timestamp('decided_at', { withTimezone: true }),
     reviewer_comments: text('reviewer_comments'),
     ...auditFields,
   })
   ```

7. **Create `conversationHistory` table** (new):
   ```
   conversationHistory = pgTable('conversation_history', {
     id: serial('id').primaryKey(),
     lead_id: integer('lead_id').references(() => leads.id),
     prospect_id: integer('prospect_id').references(() => prospects.id),
     client_id: text('client_id').references(() => clients.client_id),
     interaction_type: conversationTypeEnum('interaction_type').notNull(),
     interaction_date: timestamp('interaction_date', { withTimezone: true }).defaultNow().notNull(),
     summary: text('summary').notNull(),
     reference_type: text('reference_type'), — 'MEETING' | 'CALL_REPORT' | 'ACTION_ITEM'
     reference_id: integer('reference_id'),
     created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     created_by: text('created_by'),
     tenant_id: text('tenant_id').default('default').notNull(),
   })
   ```
   Note: INSERT-ONLY — no update/delete columns. No auditFields spread (intentionally minimal).

8. **Create `systemConfig` table** (new):
   ```
   systemConfig = pgTable('system_config', {
     id: serial('id').primaryKey(),
     config_key: text('config_key').unique().notNull(),
     config_value: text('config_value').notNull(),
     description: text('description'),
     ...auditFields,
   })
   ```

9. **Add Drizzle relations** for new tables (after existing relations at line 4502):
   - `callReportApprovals` → `callReports` (many-to-one)
   - `callReportApprovals` → `users` (supervisor)
   - `conversationHistory` → `leads`, `prospects`, `clients`

10. **Add CRUD route registrations** in `server/routes/back-office/index.ts` (after line 566):
    - `/call-report-approvals` → `createCrudRouter(schema.callReportApprovals, { ... })`
    - `/conversation-history` → `createCrudRouter(schema.conversationHistory, { searchableColumns: ['summary'], defaultSort: 'interaction_date', defaultSortOrder: 'desc', entityKey: 'conversation-history' })`
    - `/system-config` → `createCrudRouter(schema.systemConfig, { searchableColumns: ['config_key'], defaultSort: 'config_key', entityKey: 'system-config' })`

**Files to create/modify:**
- `packages/shared/src/schema.ts` — extend enums, extend tables, add new tables + relations
- `server/routes/back-office/index.ts` — register CRUD routes for new entities

**Acceptance criteria:**
- All new enums and table extensions compile without TypeScript errors
- `npm run build` passes
- New CRUD endpoints respond to GET requests (return empty arrays)
- Existing meetings/callReports CRUD endpoints still work with backward-compatible schema

---

## Phase 2: Meeting Service & Custom Routes
**Dependencies:** Phase 1

**Description:**
Create `MeetingService` with business logic for meeting lifecycle (schedule, complete, cancel, reschedule) and custom API endpoints beyond CRUD. Implements FR-002 (Schedule Meeting), FR-003 (Edit/Cancel/Reschedule), FR-018 (Mark Meeting Completed).

**Tasks:**

1. **Create `server/services/meeting-service.ts`** with methods:
   - `create(data)`: Validate required fields, generate `meeting_code` via `MTG-${YYYYMM}-${random4}`, resolve relationship name from lead/prospect/client, auto-populate contact_phone/email, create meeting + invitees in transaction, insert ConversationHistory entry, return created meeting.
   - `getById(id)`: Fetch meeting with invitees joined.
   - `getCalendarData(filters)`: Return meetings for date range with status color mapping. Support filters: `startDate`, `endDate`, `meetingStatus`, `meetingReason`, `organizerUserId`, `branchId`. Return shape: `{ data, total, page, pageSize }`.
   - `complete(id, userId)`: Validate meeting is SCHEDULED, set `meeting_status = 'COMPLETED'`, `completed_at = now()`, `completed_by = userId`, set `call_report_status = 'PENDING'`, insert ConversationHistory. Return updated meeting.
   - `cancel(id, userId)`: Validate meeting is SCHEDULED, set `meeting_status = 'CANCELLED'`, insert ConversationHistory.
   - `reschedule(id, data, userId)`: Validate meeting is SCHEDULED, update `start_time`, `end_time`, set `meeting_status = 'RESCHEDULED'` then back to `SCHEDULED`, insert ConversationHistory with old/new times.
   - `updateInvitees(meetingId, invitees)`: Replace invitees for a meeting (delete + insert in transaction).

2. **Create `server/routes/back-office/meetings.ts`** (custom route file):
   - `PATCH /meetings/:id/complete` → `meetingService.complete()`
   - `PATCH /meetings/:id/cancel` → `meetingService.cancel()`
   - `PATCH /meetings/:id/reschedule` → `meetingService.reschedule()`
   - `GET /meetings/calendar` → `meetingService.getCalendarData()` (accepts `startDate`, `endDate` query params)
   - `PUT /meetings/:id/invitees` → `meetingService.updateInvitees()`
   - Apply `requireBackOfficeRole()` middleware.
   - Use `asyncHandler` wrapper for all handlers.

3. **Mount custom meeting routes** in `server/routes/back-office/index.ts`:
   - Import and mount: `router.use('/meetings', meetingRoutes)` — mount BEFORE the createCrudRouter so custom routes take priority.
   - Keep existing CRUD router for basic GET/POST/PUT/DELETE.

4. **Write unit-style tests** in `tests/e2e/meeting-service.spec.ts`:
   - Test meeting creation with code generation
   - Test complete: SCHEDULED → COMPLETED transition
   - Test complete: reject if already COMPLETED or CANCELLED
   - Test cancel: SCHEDULED → CANCELLED
   - Test reschedule: updates times and creates ConversationHistory
   - Test getCalendarData with date range filter

**Files to create/modify:**
- `server/services/meeting-service.ts` — new file, meeting business logic
- `server/routes/back-office/meetings.ts` — new file, custom meeting endpoints
- `server/routes/back-office/index.ts` — mount custom routes
- `tests/e2e/meeting-service.spec.ts` — new file, tests

**Acceptance criteria:**
- `PATCH /api/v1/meetings/:id/complete` transitions meeting to COMPLETED and returns updated record
- `PATCH /api/v1/meetings/:id/cancel` transitions meeting to CANCELLED
- `PATCH /api/v1/meetings/:id/reschedule` updates times and returns SCHEDULED meeting
- `GET /api/v1/meetings/calendar?startDate=...&endDate=...` returns filtered meeting list
- Invalid transitions (e.g., completing a cancelled meeting) return 400 with descriptive error
- ConversationHistory records are created for each state transition
- All tests pass

---

## Phase 3: Call Report Service & Custom Routes
**Dependencies:** Phase 1

**Description:**
Create `CallReportService` with business logic for filing call reports (scheduled from a completed meeting, or standalone), 5-business-day threshold calculation, supervisor approval routing, submit workflow, and basic approval queue endpoints. Implements FR-004, FR-005, FR-006, FR-015.

**Tasks:**

1. **Create `server/services/call-report-service.ts`** with methods:
   - `create(data)`: Generate `report_code` via `CR-${YYYYMM}-${random4}`. If `report_type = 'SCHEDULED'`, validate `meeting_id` exists and meeting is COMPLETED, pre-populate fields from meeting. If standalone, require meeting_date. Set `report_status = 'DRAFT'`. Return created report.
   - `update(id, data)`: Only allow updates when `report_status = 'DRAFT'` or `'REJECTED'`. Return updated report.
   - `submit(id, userId)`: Validate report is DRAFT or REJECTED. Calculate `days_since_meeting` = business days between `meeting_date` and now. Set `filed_date = now()`. If `days_since_meeting > 5`, set `requires_supervisor_approval = true`, `report_status = 'PENDING_APPROVAL'`, create `CallReportApproval` record with action='PENDING'. Else set `report_status = 'SUBMITTED'` then auto-advance to `'APPROVED'`. Update meeting's `call_report_status = 'FILED'`. Insert ConversationHistory. If `next_meeting_start` provided, auto-create a new meeting.
   - `getAll(filters)`: Support filters: `reportStatus`, `reportType`, `filedBy`, `branchId`, `search` (full-text on subject+summary), `startDate`, `endDate`. Paginated.
   - `getById(id)`: Fetch report with associated action items.
   - `calculateBusinessDays(startDate, endDate)`: Count weekdays between two dates (exclude Sat/Sun). Future enhancement: integrate with holiday calendar.

2. **Create `server/services/approval-workflow-service.ts`** with methods:
   - `getPendingApprovals(supervisorId, filters)`: Get call reports pending approval scoped to supervisor's branch. Paginated.
   - `claim(approvalId, supervisorId)`: Set `action = 'CLAIMED'`, `claimed_at = now()`. Validate not already claimed by someone else.
   - `approve(approvalId, supervisorId, comments)`: Validate claimed by this supervisor. Set `action = 'APPROVED'`, `decided_at = now()`. Update call report `report_status = 'APPROVED'`, `approved_by`, `approved_at`. Insert ConversationHistory.
   - `reject(approvalId, supervisorId, comments)`: Same as approve but set REJECTED. Update call report `report_status = 'REJECTED'`, `rejection_reason`. Insert ConversationHistory.

3. **Create `server/routes/back-office/call-reports-custom.ts`**:
   - `PATCH /call-reports/:id/submit` → `callReportService.submit()`
   - `GET /call-reports/search` → `callReportService.getAll()` with full-text search support
   - Apply `requireBackOfficeRole()`.

4. **Create `server/routes/back-office/approvals.ts`**:
   - `GET /approvals` → `approvalWorkflowService.getPendingApprovals()`
   - `PATCH /approvals/:id/claim` → `approvalWorkflowService.claim()`
   - `PATCH /approvals/:id/approve` → `approvalWorkflowService.approve()`
   - `PATCH /approvals/:id/reject` → `approvalWorkflowService.reject()`
   - Apply `requireBackOfficeRole()`.

5. **Mount routes** in `server/routes/back-office/index.ts`:
   - Mount call-reports-custom BEFORE the CRUD router
   - Mount approvals router at `/approvals`

6. **Write tests** in `tests/e2e/call-report-service.spec.ts`:
   - Test scheduled call report creation from completed meeting
   - Test standalone call report creation
   - Test submit with ≤5 days → auto-approved
   - Test submit with >5 days → pending approval
   - Test business day calculation (skip weekends)
   - Test approval claim/approve/reject flow
   - Test rejection → re-submit cycle

**Files to create/modify:**
- `server/services/call-report-service.ts` — new file
- `server/services/approval-workflow-service.ts` — new file
- `server/routes/back-office/call-reports-custom.ts` — new file
- `server/routes/back-office/approvals.ts` — new file
- `server/routes/back-office/index.ts` — mount new routes
- `tests/e2e/call-report-service.spec.ts` — new file

**Acceptance criteria:**
- Scheduled call report pre-populates from completed meeting
- Standalone call report does not require meeting_id
- Submit with ≤5 business days auto-approves
- Submit with >5 business days creates approval record and sets PENDING_APPROVAL
- Approval claim/approve/reject endpoints work with proper state transitions
- Re-submit after rejection works
- Business day calculation correctly skips weekends
- All tests pass

---

## Phase 4: Navigation, Routing & Shared UI Utilities
**Dependencies:** Phase 1

**Description:**
Add CRM navigation section to the sidebar, register new routes for call reports and approvals pages, and create shared UI utilities (relationship type-ahead component, status badge helpers) that Phase 5 and 6 will use.

**Tasks:**

1. **Add CRM section** to `apps/back-office/src/config/navigation.ts`:
   - Add a "CRM" NavSection (if not already present) with icon `Users` from lucide-react
   - Items:
     - `{ label: "Calendar", path: "/crm/meetings", icon: Calendar }`
     - `{ label: "Call Reports", path: "/crm/call-reports", icon: FileText }`
     - `{ label: "Action Items", path: "/crm/action-items", icon: ClipboardList }`
     - `{ label: "Approvals", path: "/crm/approvals", icon: CheckSquare }`

2. **Register routes** in `apps/back-office/src/routes/index.tsx`:
   - Add lazy imports for new pages:
     ```
     const CallReportForm = React.lazy(() => import("@/pages/crm/call-report-form"));
     const CallReportList = React.lazy(() => import("@/pages/crm/call-report-list"));
     const ApprovalWorkspace = React.lazy(() => import("@/pages/crm/approval-workspace"));
     ```
   - Add route definitions:
     - `{ path: "/crm/call-reports", element: <CallReportList /> }`
     - `{ path: "/crm/call-reports/new", element: <CallReportForm /> }`
     - `{ path: "/crm/call-reports/:id", element: <CallReportForm /> }`
     - `{ path: "/crm/call-reports/:id/edit", element: <CallReportForm /> }`
     - `{ path: "/crm/approvals", element: <ApprovalWorkspace /> }`

3. **Create shared API helper** at `apps/back-office/src/lib/api.ts`:
   - Export `authHeaders()`, `fetcher(url)`, `mutationFn(method, url, data)` — extract from meetings-calendar.tsx to avoid duplication.

4. **Create shared status constants** at `apps/back-office/src/lib/crm-constants.ts`:
   - Meeting status colors, call report status colors, action priority colors (extract from meetings-calendar.tsx)
   - Meeting types, purposes, reasons, modes arrays with display labels
   - Export for reuse across CRM pages

**Files to create/modify:**
- `apps/back-office/src/config/navigation.ts` — add CRM section
- `apps/back-office/src/routes/index.tsx` — register new routes
- `apps/back-office/src/lib/api.ts` — new shared API helpers
- `apps/back-office/src/lib/crm-constants.ts` — new shared constants

**Acceptance criteria:**
- CRM section appears in sidebar with Calendar, Call Reports, Action Items, Approvals links
- All new routes resolve (even if pages are placeholder/empty initially)
- Shared API helpers work correctly with auth token
- No TypeScript errors in build

---

## Phase 5: Calendar UI — Multi-View & Enhanced Meeting Form
**Dependencies:** Phase 2, Phase 4

**Description:**
Rebuild `meetings-calendar.tsx` with Month/Week/Day calendar grid views, enhanced meeting creation dialog with all BRD fields (reason, mode, relationship type-ahead, invitees, remarks), and "Mark as Completed" button. Implements FR-001, FR-002, FR-018 UI.

**Tasks:**

1. **Refactor `meetings-calendar.tsx`** — replace existing component with enhanced version:
   - **View switcher**: Toolbar with Month / Week / Day / List toggle buttons
   - **Month view**: Grid calendar showing days of month. Each day cell shows meeting dots/chips color-coded by status (blue=Scheduled, green=Completed, red=Cancelled, gray=No-Show). Click a day → filter to that day's meetings in a side panel.
   - **Week view**: 7-column grid with time slots (8AM-6PM). Meetings rendered as blocks spanning their time range.
   - **Day view**: Single-column time grid with full meeting detail cards.
   - **List view**: Keep existing table view (current default) as a tab/view option.
   - **Calendar navigation**: Prev/Next buttons, Today button, month/year selector.
   - **Status legend**: Color key showing what each meeting status color means.
   - **KPI cards**: Keep existing (This Week's Meetings, Pending MOM, Open Action Items, Overdue).

2. **Enhanced Schedule Meeting dialog** — expand existing `createOpen` dialog:
   - Add fields: `meeting_reason` (dropdown from `meetingReasonEnum`), `meeting_reason_other` (text, shown when reason=OTHER), `mode_of_meeting` (dropdown from `modeOfMeetingEnum`), `is_all_day` (checkbox — hides time fields when checked), `remarks` (textarea).
   - **Relationship picker**: Type-ahead search that queries `/api/v1/leads?search=...`, `/api/v1/prospects?search=...`, `/api/v1/clients?search=...` and shows unified results. On selection, auto-populate `contact_phone`, `contact_email`, `relationship_name` fields. Set the appropriate FK (lead_id, prospect_id, or client_id).
   - **Invitee picker**: Multi-select that searches `/api/v1/users?search=...` for internal users. Add button to include external invitees (name + email). Show "Required"/"Optional" toggle per invitee.
   - Validation: title required, at least one time slot or all-day, purpose required, meeting_reason required.

3. **Mark as Completed button** — on each SCHEDULED meeting in the table/calendar view:
   - Show "Mark Complete" button (CheckCircle icon) only for SCHEDULED meetings.
   - On click: confirmation dialog ("Mark this meeting as completed? This will prompt you to file a call report.").
   - Call `PATCH /api/v1/meetings/:id/complete`.
   - On success: toast "Meeting marked as completed", show "File Call Report" link that navigates to `/crm/call-reports/new?meetingId=:id`.
   - Pulsing indicator: if a completed meeting has `call_report_status = 'PENDING'` for >24h, show a pulsing orange dot.

4. **Update data fetching** to use the new calendar endpoint:
   - Replace `fetcher('/api/v1/meetings?pageSize=200')` with `fetcher(\`/api/v1/meetings/calendar?startDate=${start}&endDate=${end}\`)` based on the current calendar view range.
   - Refetch when calendar view/date changes.

5. **Import shared utilities** from `lib/api.ts` and `lib/crm-constants.ts` — remove duplicated code from the component.

**Files to create/modify:**
- `apps/back-office/src/pages/crm/meetings-calendar.tsx` — major rewrite with calendar views
- (Uses shared files created in Phase 4)

**Acceptance criteria:**
- Month view renders a calendar grid with colored meeting indicators per day
- Week view shows meetings as time-blocked cards in a 7-column layout
- Day view shows a single-day time grid with meeting details
- List view preserves existing table functionality
- View switcher toggles between Month/Week/Day/List
- Calendar navigation (prev/next/today) works and refetches data for new date range
- Enhanced meeting dialog has all BRD fields (reason, mode, all-day, relationship picker, invitees, remarks)
- Relationship type-ahead searches leads/prospects/clients and auto-populates contact info
- Mark Complete button appears on SCHEDULED meetings, calls API, shows success toast
- Pulsing indicator appears on completed meetings without call reports after 24h

---

## Phase 6: Call Report Form & List UI
**Dependencies:** Phase 3, Phase 4

**Description:**
Create the call report creation/edit form (both scheduled and standalone), and the searchable call report list page. Implements FR-004, FR-005, FR-015 UI.

**Tasks:**

1. **Create `apps/back-office/src/pages/crm/call-report-form.tsx`**:
   - **Route params**: Read `meetingId` from query params (scheduled) or none (standalone).
   - **Scheduled mode** (meetingId provided):
     - Fetch meeting data from `/api/v1/meetings/:meetingId`
     - Pre-populate: subject (from meeting title), meeting_date, meeting_type, lead_id/prospect_id/client_id, meeting_reason, relationship_name
     - Show pre-populated fields as read-only with "Pre-filled from meeting" label
   - **Standalone mode** (no meetingId):
     - All fields editable
     - Show `report_type = 'STANDALONE'` badge
     - Require: meeting_date (date picker for past dates), subject, summary
   - **Form sections** (card-based layout):
     - **Meeting Info**: subject, meeting_date, meeting_type, meeting_reason, mode_of_meeting
     - **Relationship**: relationship picker (reuse from Phase 5), person_met, client_status, state_of_mind
     - **Discussion**: summary_of_discussion (rich textarea), topics_discussed (tag input), products_discussed (tag input), outcome (textarea)
     - **Action Items**: Inline editable table — each row: title, description, assigned_to (user picker), due_date, priority (LOW/MEDIUM/HIGH/URGENT). Add row button.
     - **Next Steps**: follow_up_required (checkbox), follow_up_date (date picker shown when checked), next_meeting_start/end (datetime pickers for auto-creating next meeting)
   - **Form actions**:
     - "Save as Draft" → POST/PUT with `report_status = 'DRAFT'`
     - "Submit" → POST/PUT then PATCH `/call-reports/:id/submit`
     - "Cancel" → navigate back
   - **5-day warning**: If days between meeting_date and today > 5 (business days), show warning banner: "This call report is being filed more than 5 business days after the meeting. It will require supervisor approval."
   - **Rejected report**: If loading an existing REJECTED report, show rejection reason in red banner with "Revise and Re-submit" button.

2. **Create `apps/back-office/src/pages/crm/call-report-list.tsx`**:
   - **Data table** with columns: Report Code, Subject, Meeting Date, Relationship, Filed By, Status, Days Since Meeting, Actions
   - **Filters**: Status dropdown (All/Draft/Submitted/Approved/Rejected/Pending Approval), Date range picker, Search input (searches subject + summary)
   - **Status badges**: Color-coded (Draft=gray, Submitted=blue, Approved=green, Rejected=red, Pending Approval=orange)
   - **Actions column**: View (eye icon → navigate to form in read mode), Edit (pencil → form in edit mode, only for DRAFT/REJECTED), Submit (send icon → call submit API, only for DRAFT)
   - **Pagination**: Server-side with page/pageSize
   - **"New Call Report" button**: Two options via dropdown — "From Meeting" (shows meeting picker) and "Standalone" (navigates to blank form)
   - Fetch data from `/api/v1/call-reports` with query params for filters

3. **Create `apps/back-office/src/pages/crm/approval-workspace.tsx`** (basic version):
   - **Two tabs**: "Pending Approvals" and "My Decisions"
   - **Pending Approvals tab**: Table of call reports with `PENDING_APPROVAL` status. Columns: Report Code, Subject, RM Name, Meeting Date, Days Since Meeting, Filed Date, Actions (Claim/View)
   - **Claim action**: PATCH `/approvals/:id/claim` → shows Approve/Reject buttons
   - **Approve**: Confirmation dialog with optional comments → PATCH `/approvals/:id/approve`
   - **Reject**: Dialog requiring comments → PATCH `/approvals/:id/reject`
   - **My Decisions tab**: Table of previously approved/rejected reports by this supervisor

**Files to create/modify:**
- `apps/back-office/src/pages/crm/call-report-form.tsx` — new file
- `apps/back-office/src/pages/crm/call-report-list.tsx` — new file
- `apps/back-office/src/pages/crm/approval-workspace.tsx` — new file

**Acceptance criteria:**
- Scheduled call report form pre-populates from meeting data
- Standalone call report form allows manual entry of all fields
- Action items can be added/edited inline in the form
- Save as Draft stores report without submitting
- Submit calls the submit API and shows success/error feedback
- 5-day warning banner appears when applicable
- Call report list shows all reports with status badges
- Filters (status, date range, search) work correctly
- Pagination works with server-side data
- Approval workspace shows pending approvals for supervisor
- Claim/approve/reject actions work and update status

---

## Phase 7: Integration Testing & Build Verification
**Dependencies:** Phase 5, Phase 6

**Description:**
End-to-end integration tests covering the full meeting-to-call-report lifecycle, cross-cutting concerns (ConversationHistory, status transitions), and build verification.

**Tasks:**

1. **Create `tests/e2e/calendar-callreport-lifecycle.spec.ts`**:
   - **Full lifecycle test**: Create meeting → mark complete → file call report (≤5 days) → auto-approved → verify ConversationHistory entries at each step
   - **5-day threshold test**: Create meeting with past date → file call report → verify PENDING_APPROVAL → claim → approve → verify APPROVED
   - **Standalone call report test**: File standalone report → submit → auto-approved (no 5-day rule for standalone)
   - **Rejection cycle test**: File late report → pending approval → reject → verify REJECTED → update and re-submit → pending approval again
   - **Meeting cancel test**: Schedule meeting → cancel → verify CANCELLED → verify cannot file call report for cancelled meeting
   - **Calendar data test**: Create multiple meetings across date range → query calendar endpoint → verify correct filtering

2. **Build verification**:
   - Run `npm run build` — verify zero errors
   - Verify TypeScript compilation passes for all packages
   - Verify all new routes are accessible (GET endpoints return valid JSON)

3. **Fix any integration issues** found during testing:
   - Schema inconsistencies
   - API response format mismatches
   - Missing error handling
   - Status transition edge cases

**Files to create/modify:**
- `tests/e2e/calendar-callreport-lifecycle.spec.ts` — new file

**Acceptance criteria:**
- All lifecycle tests pass
- `npm run build` succeeds with zero errors
- No TypeScript compilation errors
- All new API endpoints return valid JSON responses
- ConversationHistory entries correctly created for all state transitions
- 5-day threshold correctly distinguishes auto-approve vs. pending-approval paths
