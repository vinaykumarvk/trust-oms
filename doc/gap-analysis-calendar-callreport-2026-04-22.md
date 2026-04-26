# Gap Analysis: Calendar & Call Report Management Module

## Date: 2026-04-22

## Summary

| Category | Total Requirements | EXISTS | PARTIAL | MISSING | CONFLICT |
|----------|-------------------|--------|---------|---------|----------|
| Data Model Entities | 15 | 4 | 0 | 11 | 0 |
| API Endpoints | 36 | 4 (basic CRUD) | 0 | 32 | 0 |
| Backend Services | 8 | 0 | 1 | 7 | 0 |
| UI Pages/Screens | 8 | 1 | 0 | 7 | 0 |
| Business Workflows | 4 | 0 | 0 | 4 | 0 |
| **Total** | **71** | **9** | **1** | **61** | **0** |

**Overall Completion: ~14%** — Significant foundation exists for core entities but most BRD-specific functionality is missing.

---

## Data Model Gaps

| Entity | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| Meeting | EXISTS | `packages/shared/src/schema.ts:4295` | Exists with basic fields (title, meeting_type, purpose, start_time, end_time, location, meeting_status). Missing BRD fields: meeting_reason, meeting_reason_other, mode_of_meeting, is_all_day, relationship_name, contact_phone, contact_email, remarks, call_report_status, branch_id. Enum values differ from BRD. |
| MeetingInvitee | EXISTS | `packages/shared/src/schema.ts:4315` | Exists with meeting_id, user_id, lead_id, prospect_id, client_id, rsvp_status, attended. Missing: invitee_type (required/optional). |
| CallReport | EXISTS | `packages/shared/src/schema.ts:4327` | Exists with meeting_id, subject, summary, report_status, requires_supervisor_approval. Missing BRD fields: report_type (scheduled/standalone), meeting_reason, person_met, client_status, state_of_mind, summary_of_discussion (mapped to summary), next_meeting_start/end, filed_date, days_since_meeting, requires_approval, approval_submitted_at, branch_id. Status enum differs (DRAFT/SUBMITTED/APPROVED/REJECTED vs BRD's draft/pending/completed/pending_approval/approved/rejected). |
| ActionItem | EXISTS | `packages/shared/src/schema.ts:4356` | Exists with call_report_id, description, assigned_to, due_date, priority, action_status, completed_at. Missing: title (uses description), created_by. Priority stored as text vs enum. |
| CallReportApproval | MISSING | — | Entity does not exist. BRD requires separate approval tracking with supervisor_id, claimed_at, decided_at, reviewer_comments, status (pending/claimed/approved/rejected). |
| Opportunity | MISSING | — | Entity does not exist. BRD requires: opportunity_type, relationship_id, sub_product, investment_mode, opportunity_discovered, currency, opportunity_date, due_date, opportunity_closed, status, stage. |
| Expense | MISSING | — | Entity does not exist. BRD requires: expense_type, expense_date, amount, currency, purpose, entity_type, relationship_id, from_place, to_place, transport_mode, distance_km. |
| Feedback | MISSING | — | Entity does not exist. BRD requires: meeting_id, call_report_id, relationship_id, feedback_text, sentiment, source. |
| ConversationHistory | MISSING | — | Entity does not exist. BRD requires: relationship_id, interaction_type, interaction_date, summary, reference_type, reference_id. INSERT-ONLY. |
| Attachment | MISSING | — | Entity does not exist. CallReport has attachment_urls JSONB field but BRD requires separate entity with file_name, file_type, file_size_bytes, storage_path. |
| OpportunityUpload | MISSING | — | Entity does not exist. BRD requires bulk upload tracking. |
| SystemConfig | MISSING | — | Entity does not exist. BRD requires key-value config store for thresholds. |
| Notification | MISSING | — | Entity does not exist (notification_templates exists but not the notification records table). |
| NotificationPreference | MISSING | — | Entity does not exist. |
| AuditLog | MISSING | — | Entity does not exist as a dedicated table (auditFields exist on each entity via created_at/updated_at but no dedicated audit trail). |

---

## API Gaps

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| GET /api/v1/meetings | EXISTS | `server/routes/back-office/index.ts:531` via createCrudRouter | Basic CRUD list. Missing: calendar-specific filters (date range, status, reason), color-coded status logic. |
| POST /api/v1/meetings | EXISTS | via createCrudRouter | Basic create. Missing: invitee creation in same transaction, duplicate detection, validation rules per BRD. |
| GET /api/v1/meetings/:id | EXISTS | via createCrudRouter | Exists. |
| PUT /api/v1/meetings/:id | EXISTS | via createCrudRouter | Basic update. Missing: status transition validation, ConversationHistory side effects. |
| PATCH /api/v1/meetings/:id/cancel | MISSING | — | No cancel endpoint with status transition logic. |
| PATCH /api/v1/meetings/:id/complete | MISSING | — | FR-018: No "mark as completed" endpoint. |
| PATCH /api/v1/meetings/:id/override-status | MISSING | — | FR-019: No supervisor override endpoint. |
| GET /api/v1/call-reports | EXISTS | `server/routes/back-office/index.ts:550` via createCrudRouter | Basic CRUD list. Missing: full-text search, role-based filtering, export. |
| POST /api/v1/call-reports | EXISTS | via createCrudRouter | Basic create. Missing: 5-day threshold calculation, auto-approval routing, ConversationHistory creation, next-meeting auto-creation. |
| PATCH /api/v1/call-reports/:id/submit | MISSING | — | No submit endpoint with threshold check and approval routing. |
| GET /api/v1/approvals | MISSING | — | No approval queue endpoint for supervisors. |
| PATCH /api/v1/approvals/:id/claim | MISSING | — | No claim endpoint. |
| PATCH /api/v1/approvals/:id/approve | MISSING | — | No approve endpoint. |
| PATCH /api/v1/approvals/:id/reject | MISSING | — | No reject endpoint. |
| GET /api/v1/opportunities | MISSING | — | No opportunities endpoints. |
| POST /api/v1/opportunities | MISSING | — | |
| PUT /api/v1/opportunities/:id | MISSING | — | |
| POST /api/v1/opportunities/upload | MISSING | — | |
| GET /api/v1/expenses | MISSING | — | No expenses endpoints. |
| POST /api/v1/expenses | MISSING | — | |
| PUT /api/v1/expenses/:id | MISSING | — | |
| POST /api/v1/feedback | MISSING | — | No feedback endpoint. |
| GET /api/v1/conversation-history/:relId | MISSING | — | No conversation history endpoint. |
| GET /api/v1/action-items | EXISTS | via createCrudRouter | Basic CRUD. Missing: role-based filtering, overdue detection. |
| PATCH /api/v1/action-items/:id/complete | MISSING | — | No complete endpoint with ConversationHistory side effect. |
| POST /api/v1/call-reports/:id/attachments | MISSING | — | No file upload endpoint. |
| DELETE /api/v1/call-reports/:id/attachments/:id | MISSING | — | |
| GET /api/v1/dashboard/supervisor | MISSING | — | No supervisor dashboard data endpoint. |
| GET /api/v1/notifications | MISSING | — | No notifications endpoints. |
| PATCH /api/v1/notifications/:id/read | MISSING | — | |
| GET /api/v1/notification-preferences | MISSING | — | |
| PUT /api/v1/notification-preferences | MISSING | — | |
| GET /api/v1/system-config | MISSING | — | No system config endpoints. |
| PUT /api/v1/system-config/:key | MISSING | — | |

---

## Backend Service Gaps

| Service | Status | Existing Location | Gap Details |
|---------|--------|-------------------|-------------|
| MeetingService | MISSING | — | No dedicated meeting service. CRUD via factory only. Need: calendar data aggregation, meeting completion logic, no-show batch job, conflict detection. |
| CallReportService | MISSING | — | No dedicated service. Need: 5-day threshold calculation, approval routing, draft auto-save, submit workflow. |
| ApprovalWorkflowService | MISSING | — | No approval workflow. Need: claim/unclaim, approve/reject, auto-unclaim after 2 days, supervisor queue. |
| OpportunityService | MISSING | — | Need: CRUD, bulk upload with validation, auto-expiry batch job. |
| ExpenseService | MISSING | — | Need: CRUD with conditional validation for conveyance. |
| ConversationHistoryService | MISSING | — | Need: auto-creation on events, timeline query. |
| NotificationService | PARTIAL | `server/services/campaign-service.ts` has some notification logic | Need: meeting reminders, overdue alerts, approval notifications, preference checking, email retry. Existing notification_templates table provides a foundation. |
| MeetingAnalyticsService | MISSING | — | Need: supervisor dashboard data, RM activity metrics, compliance metrics. |

---

## UI Gaps

| Screen | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| Calendar Main View | PARTIAL | `apps/back-office/src/pages/crm/meetings-calendar.tsx` | Has: KPI cards, tabbed view (Upcoming/Past/Call Reports/Action Items), create meeting dialog, table listings. Missing: Month/Week/Day calendar grid views (only has table list), color-coded status, calendar navigation, filter panel, status legend. |
| Schedule Meeting Modal | PARTIAL | `meetings-calendar.tsx:184-228` | Has basic form (title, type, start/end, location, purpose, agenda). Missing: meeting_reason, mode_of_meeting, is_all_day, relationship type-ahead, contact auto-populate, invitee picker, remarks. |
| Call Report Form | MISSING | — | No call report creation/edit form. Only table listing exists. Need: full-page form with sections (Meeting Info, Interaction Details, Opportunities, Action Items, Attachments, Next Steps). |
| Supervisor Approval Workspace | MISSING | — | No approval workspace. Need: Pending/My Approvals tabs, claim/approve/reject actions, detail panel. |
| Opportunities List | MISSING | — | No opportunities page. Need: data table, filters, add/edit/upload, auto-expiry visual. |
| Expenses List | MISSING | — | No expenses page. Need: data table, filters, conditional conveyance fields. |
| Conversation History | MISSING | — | No conversation history timeline. Need: vertical timeline component, filters, lazy-load. |
| Notification Preferences | MISSING | — | No notification preferences page. Need: event × channel grid. |

---

## Navigation & Routing Gaps

| Item | Status | Details |
|------|--------|---------|
| CRM > Meetings Calendar route | EXISTS | `apps/back-office/src/pages/crm/meetings-calendar.tsx` is registered |
| CRM > Call Reports route | MISSING | No standalone call reports page/route |
| CRM > Opportunities route | MISSING | No opportunities page/route |
| CRM > Expenses route | MISSING | No expenses page/route |
| CRM > Conversation History route | MISSING | No conversation history page/route |
| Supervisor > Approval Queue route | MISSING | No approval workspace route |
| Supervisor > Team Dashboard route | MISSING | No supervisor CRM dashboard |
| Settings > Notification Preferences | MISSING | No notification preferences route |

---

## Business Logic Gaps

| Workflow/Rule | Status | Gap Details |
|---------------|--------|-------------|
| Meeting Lifecycle (scheduled→completed→call_report_filed) | MISSING | No status transition logic. Existing meetings table has meeting_status enum but no transition enforcement. |
| 5-Day Threshold Rule | MISSING | No business-day calculation, no threshold checking, no auto-routing to supervisor. |
| Call Report Approval Workflow | MISSING | No claim/approve/reject logic. CallReport has requires_supervisor_approval flag but no approval queue or workflow. |
| Opportunity Auto-Expiry | MISSING | No batch job, no expiry logic. |
| No-Show Auto-Transition | MISSING | No batch job for FR-019. |
| Overdue Detection | MISSING | No scheduled check for overdue call reports. |

---

## Integration Gaps

| Integration | Status | Gap Details |
|-------------|--------|-------------|
| CRM Relationship Lookup | PARTIAL | Leads, Prospects, Clients tables exist in schema. Meeting table has lead_id, prospect_id, client_id FKs. Missing: unified type-ahead search API, relationship_name denormalization. |
| File Upload (S3) | MISSING | No file upload infrastructure for call report attachments. |
| Email Notifications | PARTIAL | notification_templates table exists. Missing: actual send logic, retry mechanism. |
| Business Calendar | MISSING | No business day/holiday calendar for threshold calculations. |

---

## Key Implementation Decisions

1. **Extend vs Replace**: The existing Meeting/CallReport/ActionItem schemas should be **extended** with BRD fields rather than replaced, to preserve compatibility with the CRM Campaign module that already uses them.

2. **Enum Migration**: Existing enums (meeting_type, meeting_purpose, meeting_status, call_report_status) need to be expanded to match BRD values. This requires ALTER TYPE ... ADD VALUE migrations.

3. **Polymorphic FK**: The existing schema already uses separate FK columns (lead_id, prospect_id, client_id) rather than a single relationship_id. The BRD's discriminator pattern should adapt to this existing pattern.

4. **CRUD Factory**: New entities can leverage the existing `createCrudRouter` factory for basic CRUD. Custom endpoints (submit, claim, approve, reject, complete) need dedicated route handlers.

5. **Auth Pattern**: The existing `requireBackOfficeRole()` middleware provides role-based access. Additional per-endpoint guards are needed for supervisor-only operations.

---

## Implementation Roadmap (Dependency-Ordered)

### Phase 1 — Schema & Core Backend (Sprint 1-2)
1. Extend Meeting schema with BRD fields
2. Extend CallReport schema with BRD fields
3. Extend ActionItem schema
4. Add new entities: CallReportApproval, Opportunity, Expense, Feedback, ConversationHistory, Attachment, OpportunityUpload, SystemConfig, Notification, NotificationPreference, AuditLog
5. Create MeetingService with lifecycle logic
6. Create CallReportService with threshold calculation

### Phase 2 — Enhanced Calendar UI (Sprint 2-3)
7. Rebuild meetings-calendar.tsx with Month/Week/Day views
8. Enhanced meeting creation modal with all BRD fields
9. Meeting completion and status management
10. Call report form (scheduled + standalone)
11. Basic call report list with search/filter

### Phase 3 — Approval Workflow (Sprint 3-4)
12. ApprovalWorkflowService
13. Supervisor approval workspace UI
14. Notification service for approvals

### Phase 4 — Opportunity & Expense (Sprint 4-5)
15. OpportunityService with bulk upload
16. ExpenseService with conditional validation
17. Opportunities list page
18. Expenses list page

### Phase 5 — Conversation History, Feedback, Dashboard (Sprint 5-6)
19. ConversationHistory auto-generation
20. Feedback capture
21. Conversation history timeline UI
22. Supervisor team dashboard
23. Notification preferences
