# Phased Development Plan: Campaign Management Module (CRM-CAM)

**Source:** [Gap Analysis 2026-04-22](/Users/n15318/Trust OMS/doc/gap-analysis-campaign-management-2026-04-22.md)
**Gap items addressed:** 31 (7 CRITICAL, 8 HIGH, 10 MEDIUM, 6 LOW)
**Phases:** 8
**Total tasks:** 31

---

## Phase 1: Enum Conflicts and Schema Fixes
**Depends on:** None
**Estimated tasks:** 5

All CONFLICT items must be resolved before any feature work, because new code built on mismatched enums will produce invalid data. This phase also adds missing DB constraints and the revenue-attribution column -- pure schema-layer work with no UI or API dependencies.

### Task 1.1: Fix campaign_type enum conflict (C1)
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx` (line 65)
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (line 3940)
**What:** The UI defines 8 campaign types (PRODUCT_LAUNCH, EVENT_INVITATION, EDUCATIONAL, REFERRAL, CROSS_SELL, UP_SELL, RETENTION, RE_ENGAGEMENT) but the schema enum only defines 2 (EVENT, PRODUCT_PROMOTION). Decision required: either expand the schema enum to include all 8 types, or restrict the UI to match the schema. Recommended: expand the schema enum to support the richer set, since the BRD Section 4.1 only requires the 2-value enum but the UI types represent a valid business taxonomy. Add the 8 values to `campaignTypeEnum` in schema.ts, then verify the UI dropdown reads from a shared constant.
**Gap items addressed:** #3

### Task 1.2: Fix meeting_type enum conflict (C2, C5)
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/meetings-calendar.tsx` (line 114)
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (line 15)
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (line 3972)
**What:** UI and service both use FACE_TO_FACE, but schema defines IN_PERSON. Change UI (line 114) and service validation (line 15) from FACE_TO_FACE to IN_PERSON to match the authoritative schema enum. Grep the entire codebase for FACE_TO_FACE to catch any other references.
**Gap items addressed:** #4

### Task 1.3: Fix meeting_purpose enum conflict (C3)
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/meetings-calendar.tsx` (lines 116-124)
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (lines 3974-3976)
**What:** UI defines 7 purpose values; schema defines 4 completely different values (CAMPAIGN_FOLLOW_UP, SERVICE_REQUEST, GENERAL, REVIEW). Decision required: expand the schema enum to include the richer UI set, or restrict the UI. Recommended: expand the schema enum since the UI values are more granular and useful for CRM reporting. Add INITIAL_MEETING, PORTFOLIO_REVIEW, PRODUCT_PRESENTATION, RELATIONSHIP_CHECK_IN, COMPLAINT_RESOLUTION, ONBOARDING to the schema enum (keeping CAMPAIGN_FOLLOW_UP, SERVICE_REQUEST, GENERAL, REVIEW as well), then update the UI to use the unified superset.
**Gap items addressed:** #5

### Task 1.4: Fix response_type validation in service (C4)
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (line 14)
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (response_type enum definition)
**What:** The service validates against values not in the schema enum (MAYBE, NO_RESPONSE, CALLBACK_REQUESTED). Either add these to the schema enum or remove them from the service validation array. Recommended: add them to the schema enum since they represent valid CRM response states, then derive the service validation array from the schema to prevent future drift.
**Gap items addressed:** #14

### Task 1.5: Add unique constraints and revenue-attribution column
**Files:**
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (lines 4079-4085 for lead_list_members; lines 4316-4324 for campaign_translations; lines 504-516 for portfolios)
**What:** (a) Add unique constraint on `lead_list_members(lead_list_id, lead_id)`. (b) Add unique constraint on `campaign_translations(campaign_id, locale)`. (c) Add `source_campaign_id` integer column with FK reference to `campaigns.id` on the `portfolios` table for revenue attribution per BRD 15.4.1.
**Gap items addressed:** #13, #24

---

## Phase 2: Navigation and Discoverability
**Depends on:** None (can run in parallel with Phase 1)
**Estimated tasks:** 3

Users cannot reach any CRM page today. These are zero-logic changes that unblock QA testing of everything built in later phases.

### Task 2.1: Add CRM section to back-office sidebar navigation
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/config/navigation.ts`
**What:** Add a new "Campaign Management" (or "CRM") navigation section with links to all 7 existing CRM routes: Campaign Dashboard (/crm/campaigns), Lead Lists (/crm/lead-lists), Prospects (/crm/prospects), Meetings (/crm/meetings), Interaction Logger (/crm/interactions), Campaign Analytics (/crm/analytics), RM Handovers (/crm/handovers). Use an appropriate icon (e.g., Megaphone or Users). Place the section between Operations and Compliance, or per UX team guidance.
**Gap items addressed:** #1

### Task 2.2: Add Campaign Inbox link to client portal navigation
**Files:**
- `/Users/n15318/Trust OMS/apps/client-portal/src/config/navigation.ts`
**What:** Add a "Campaigns" or "Campaign Inbox" navigation item pointing to `/campaign-inbox`. Include an unread badge counter (initially static; will be wired to API in Phase 3).
**Gap items addressed:** #2

### Task 2.3: Generate sequential codes instead of random
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 29-42)
**What:** Replace the random 4-digit suffix in `generateCode()` with a sequential counter. Query the max existing code for the given prefix+month, parse the numeric suffix, and increment. For example, if the latest CAM-202604-NNNN is 0003, the next should be 0004. Apply to campaign codes (CAM-YYYYMM-NNNN), list codes (LL-YYYYMM-NNNN), and meeting codes (MTG-YYYYMMDD-NNNN -- note: BRD requires YYYYMMDD, not YYYYMM).
**Gap items addressed:** #25

---

## Phase 3: Client Portal API and Consent Backend
**Depends on:** Phase 1 (schema enum fixes must land before building new endpoints that reference those enums)
**Estimated tasks:** 4

This phase builds the missing server-side endpoints that the client portal UI already tries to call (C6), plus the consent-checking logic required for PDPA compliance before any dispatch operations.

### Task 3.1: Implement client portal campaign endpoints
**Files:**
- `/Users/n15318/Trust OMS/server/routes/client-portal.ts`
- `/Users/n15318/Trust OMS/server/routes.ts` (line 279, route mounting)
**What:** Add three new endpoints to `client-portal.ts`: (a) `GET /api/v1/client-portal/campaign-inbox` -- returns campaigns targeted at the authenticated client, with dispatch status and response info. (b) `POST /api/v1/client-portal/campaign-inbox/:commId/rsvp` -- records RSVP (accept/maybe/decline) for an event campaign communication. (c) `GET /api/v1/client-portal/meetings` -- returns upcoming meetings for the authenticated client. These match the URLs already called by `campaign-inbox.tsx` (line 95).
**Gap items addressed:** #6

### Task 3.2: Implement consent check in dispatch service
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 451-535, dispatch method)
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (campaign_consent_log table, lines 4298-4313)
**What:** Before dispatching a communication, query `campaign_consent_log` for each target lead/prospect. Filter out any entity with `consent_status = 'OPTED_OUT'` for the relevant `consent_type` (MARKETING_EMAIL for email channel, MARKETING_SMS for SMS). Log skipped entities with reason. Default consent logic: if no consent record exists, apply the default based on source (per BRD Section 15.1.2). Write a unit test covering: opted-in passes, opted-out blocked, no-record defaults.
**Gap items addressed:** #7

### Task 3.3: Add SMS 160-char validation and unsubscribe link
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (dispatch method, lines 493-535)
**What:** (a) After template token resolution for SMS channel, validate that the resolved message length is <= 160 characters. If exceeded, return a validation error with the actual length. (b) For email channel dispatches, append an unsubscribe link to the email body using a tokenized URL pattern (e.g., `{{unsubscribe_url}}`). The unsubscribe endpoint should create an OPTED_OUT record in campaign_consent_log with source UNSUBSCRIBE_LINK. Add tests for both validations.
**Gap items addressed:** #30, #31

### Task 3.4: Add client portal consent self-service endpoints
**Files:**
- `/Users/n15318/Trust OMS/server/routes/client-portal.ts`
- `/Users/n15318/Trust OMS/server/routes/back-office/consent.ts`
**What:** Add to client-portal.ts: (a) `GET /api/v1/client-portal/consent/preferences` -- returns the client's consent preferences across all consent types. (b) `PATCH /api/v1/client-portal/consent/preferences` -- updates consent preferences (opt-in/opt-out). (c) `POST /api/v1/client-portal/consent/opt-out` -- quick opt-out for a specific consent type. Also update the back-office consent route to support `entityType/entityId` pattern (not just clientId) so leads and prospects can have consent tracked.
**Gap items addressed:** Part of #7 (consent infrastructure)

---

## Phase 4: Back-Office API Endpoints (Call Reports, Handovers, Lead Lists, Uploads)
**Depends on:** Phase 1 (enum fixes), Phase 3 (consent check available for integration tests)
**Estimated tasks:** 5

These are the remaining HIGH-priority API gaps -- lifecycle endpoints for call reports and handovers, member management for lead lists, and the bulk upload pipeline.

### Task 4.1: Add call report lifecycle endpoints (submit, approve)
**Files:**
- `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts`
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts`
- `/Users/n15318/Trust OMS/server/routes/back-office/index.ts` (CRUD registration, lines 550+)
**What:** Add two new endpoints: (a) `POST /api/v1/campaign-mgmt/call-reports/:id/submit` -- transitions call report from DRAFT to PENDING_REVIEW. Validates required fields (meeting_id, summary, outcome). (b) `POST /api/v1/campaign-mgmt/call-reports/:id/approve` -- transitions to APPROVED or returns to DRAFT with feedback. Implement late detection: if `filed_date - meeting_date > 5 days`, automatically set `requires_supervisor_approval = true`. Add role guard (RM_SUPERVISOR). Include tests for the >5-day auto-flag scenario.
**Gap items addressed:** #9, #22

### Task 4.2: Add handover approval endpoint
**Files:**
- `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts`
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts`
**What:** Add `POST /api/v1/campaign-mgmt/handovers/:id/approve` -- approves or rejects an RM handover request. On approval: update all associated leads/prospects/meetings to the new RM. On rejection: revert status to DRAFT with reason. Add role guard. Include test for entity reassignment on approval.
**Gap items addressed:** #10

### Task 4.3: Add lead list member management endpoints
**Files:**
- `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts`
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts`
**What:** Add two endpoints nested under lead lists: (a) `POST /api/v1/campaign-mgmt/lead-lists/:id/members` -- adds one or more leads to a list. Validates against the unique constraint (lead_list_id, lead_id) added in Phase 1. (b) `DELETE /api/v1/campaign-mgmt/lead-lists/:id/members/:leadId` -- removes a lead from a list. Returns 404 if not a member. Include tests for duplicate-add rejection and successful removal.
**Gap items addressed:** #11

### Task 4.4: Add bulk upload endpoints and service
**Files:**
- `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts`
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts`
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (lead_upload_batches table, lines 4282-4295)
**What:** Add: (a) `POST /api/v1/campaign-mgmt/leads/upload` -- accepts a CSV/Excel file, creates a `lead_upload_batches` record with status VALIDATING, parses rows, runs dedup hash check per row, returns batch_id with validation summary (valid/duplicate/error counts). (b) `GET /api/v1/campaign-mgmt/leads/upload/:batchId` -- returns batch status and row-level results. (c) `POST /api/v1/campaign-mgmt/leads/upload/:batchId/confirm` -- imports validated rows as leads. Generate batch code in UPL-YYYYMMDD-NNNN format. Include test for duplicate detection during upload.
**Gap items addressed:** #12

### Task 4.5: Implement sanctions screening in lead-to-prospect conversion
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 641-701, convertLeadToProspect)
- `/Users/n15318/Trust OMS/server/services/sanctions-service.ts`
**What:** Before creating a prospect record, call `sanctionsService.screen()` with the lead's name and entity_type. If a match is found, block conversion and return an error with the match details. If screening passes, set `negative_list_cleared = true` on the new prospect. Add test covering both pass and block scenarios.
**Gap items addressed:** #15

---

## Phase 5: Back-Office UI Pages (New Pages and Major Enhancements)
**Depends on:** Phase 4 (API endpoints must exist before UI pages call them)
**Estimated tasks:** 5

Build the missing UI pages and major UI components. Each task includes its own component-level tests.

### Task 5.1: Add Campaign Detail page (tabbed layout)
**Files:**
- New: `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-detail.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` (add route at /crm/campaigns/:id)
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx` (add "View" action linking to detail page)
**What:** Create a tabbed detail page with 6 tabs: Overview (campaign info, status, budget, dates), Target Lists (assigned lead lists with member counts), Responses (response table with filters), Communications (dispatch history), Meetings (meetings linked to this campaign), Call Reports (call reports for this campaign). Include a status badge, action buttons (Submit, Approve/Reject, Copy), and breadcrumb navigation back to dashboard.
**Gap items addressed:** #8

### Task 5.2: Add Call Report form
**Files:**
- New: `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/call-report-form.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` (add route at /crm/call-reports/new and /crm/call-reports/:id/edit)
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/meetings-calendar.tsx` (add "File Report" action button on meeting rows)
**What:** Create a form page for filing call reports. Fields: meeting selector (pre-populated if navigated from a meeting), campaign selector, summary (rich text), outcome, next steps, follow-up date (auto-suggested +3 business days), attendees, topics discussed, action items (inline add/remove). Submit and Save Draft buttons. Late filing warning if meeting date is >5 days ago.
**Gap items addressed:** #17

### Task 5.3: Add Prospect Detail page with tabbed layout
**Files:**
- New: `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/prospect-detail.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` (add route at /crm/prospects/:id)
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/prospect-manager.tsx` (add row click or "View" action)
**What:** Create a tabbed detail page with 5 tabs per BRD 6.9: Personal (name, DOB, nationality, contact, addresses), Financial (income, net worth, employer, tax ID), Family (family members array), History (timeline of interactions, responses, meetings, status changes), Screening (sanctions screening status, negative_list_cleared flag, re-screen button). Include status transition buttons (e.g., Qualify, Convert to Client, Drop) and breadcrumb navigation.
**Gap items addressed:** #18

### Task 5.4: Add Rule Builder modal with visual UI
**Files:**
- New: `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/components/rule-builder-modal.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/lead-list-manager.tsx` (replace JSON textarea with Rule Builder component)
**What:** Create a modal component for visual rule building. Layout: rows of conditions with field dropdown (AUM, age, region, product_type, account_type, days_since_last_contact, etc.), operator dropdown (equals, not_equals, greater_than, less_than, contains, in), value input (text, number, or multi-select depending on field type). AND/OR toggle between condition groups. Preview button that calls the lead list refresh endpoint and shows the count of matching leads. The modal outputs a JSON rule definition compatible with the existing `executeRule()` method in campaign-service.ts.
**Gap items addressed:** #16

### Task 5.5: Add Lead Upload Wizard (4-step flow)
**Files:**
- New: `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/components/lead-upload-wizard.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/lead-list-manager.tsx` (add "Upload" button that opens wizard)
**What:** Create a stepper/wizard component with 4 steps: (1) File Upload -- drag-and-drop or file picker for CSV/Excel, (2) Column Mapping -- auto-detect columns, allow user to map source columns to lead fields via dropdowns, (3) Validation Results -- show table of rows with status (valid, duplicate, error) and error details, allow deselecting invalid rows, (4) Confirm Import -- summary of rows to import, confirm button. Calls the bulk upload API endpoints from Phase 4 Task 4.4.
**Gap items addressed:** #12 (UI portion)

---

## Phase 6: Business Logic Enhancements
**Depends on:** Phase 4 (service layer must exist)
**Estimated tasks:** 5

Implement the remaining business rules that enforce BRD-specified logic -- auto-completion batch, response modification windows, dedup improvements, and follow-up date calculation.

### Task 6.1: Implement EOD batch for campaign auto-completion and delegation auto-expiry
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts`
- `/Users/n15318/Trust OMS/server/services/eod-orchestrator.ts`
**What:** Add a new EOD job step that: (a) Finds all ACTIVE campaigns where `end_date < today` and transitions them to COMPLETED. (b) Finds all COMPLETED campaigns where `end_date + 30 days < today` and transitions them to ARCHIVED. (c) Finds all pending RM handovers where the delegation period has expired and auto-cancels them. Register this step in the EOD orchestrator. Include test covering each transition scenario.
**Gap items addressed:** #19

### Task 6.2: Add response modification 48-hour window enforcement
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts`
- `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts` (or CRUD middleware)
**What:** On PATCH/PUT of a campaign_response record, check if `now - created_at > 48 hours`. If so, reject the update with a 403 error and message "Response modification window has expired (48 hours)". Supervisor role override: users with RM_SUPERVISOR role can modify responses at any time. Include test for both within-window and expired-window scenarios.
**Gap items addressed:** #21

### Task 6.3: Add accent removal to dedup normalization
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 44-52, computeDedupHash)
**What:** Add Unicode normalization (NFD) and accent/diacritic stripping to the name normalization step: `name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`. This ensures that "Jose" and "Jos\u00e9" produce the same hash. Also improve phone normalization to strip full country code prefix (e.g., +63 for Philippines). Include test with accented names.
**Gap items addressed:** #28

### Task 6.4: Add business day calculation for follow-up date suggestion
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (line 568)
**What:** Replace the simple `+3 calendar days` calculation with a business day calculation that skips weekends (Saturday/Sunday) and Philippine public holidays. Create a utility function `addBusinessDays(date, count)` that can be reused. For holidays, use a configurable list or a simple lookup table for the current year. Include test covering a Friday input (should skip to Wednesday) and a date before a holiday.
**Gap items addressed:** #29

### Task 6.5: Add notification events for campaign lifecycle
**Files:**
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (submit, approve methods)
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (notification_templates table, lines 4269-4279)
**What:** After each lifecycle transition (submit, approve, reject, complete, archive), emit a notification event using the existing notification_templates system. Events: CAMPAIGN_SUBMITTED (to approvers), CAMPAIGN_APPROVED (to owner), CAMPAIGN_REJECTED (to owner with reason), CAMPAIGN_COMPLETED (to owner), HANDOVER_APPROVED (to both RMs), CALL_REPORT_OVERDUE (to filer and supervisor). Seed default notification templates. Include test verifying notification creation on approval.
**Gap items addressed:** #27

---

## Phase 7: UI Enhancements and Analytics
**Depends on:** Phase 5 (base pages must exist), Phase 6 (business logic for data)
**Estimated tasks:** 4

Enhance existing UI pages with missing features -- calendar views, charts, scorecards, and export.

### Task 7.1: Implement calendar component for meetings
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/meetings-calendar.tsx`
**What:** Replace the table-only view with a calendar component supporting Day, Week, Month, and List views. Use a React calendar library (e.g., @fullcalendar/react or react-big-calendar). Meetings rendered as colored blocks based on meeting_purpose (e.g., blue for CAMPAIGN_FOLLOW_UP, green for PORTFOLIO_REVIEW, etc.). Clicking a meeting block opens a detail popover. Keep the existing Call Reports and Action Items tabs below the calendar.
**Gap items addressed:** #23

### Task 7.2: Add conversion funnel chart and RM scorecards to analytics
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-analytics.tsx`
**What:** Add two new sections: (a) Conversion Funnel Chart -- a horizontal funnel visualization showing Leads -> Contacted -> Qualified -> Converted -> Client counts, with drop-off percentages at each stage. Use a charting library (recharts is already in the project dependencies). (b) RM Scorecards Table -- a table showing each RM's name, assigned leads count, response rate, conversion rate, meetings held, and call reports filed. Add global filters: date range picker, campaign multi-select, RM selector, and branch selector.
**Gap items addressed:** #20

### Task 7.3: Add Excel/PDF export to analytics and reports
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-analytics.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx`
- `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts`
**What:** Add export buttons (Excel, PDF) to the analytics dashboard and campaign dashboard. For Excel: use xlsx library to generate a workbook with sheets for KPIs, campaign list, response data, and RM scorecards. For PDF: use the existing PDF generation service pattern (see pdf-invoice-service.ts) to produce formatted reports. Add server-side export endpoints: `GET /api/v1/campaign-mgmt/campaigns/export?format=xlsx|pdf` and `GET /api/v1/campaign-mgmt/analytics/export?format=xlsx|pdf`.
**Gap items addressed:** #26

### Task 7.4: Enhance campaign dashboard filters and actions
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx`
**What:** Add missing dashboard features: (a) Additional filters: campaign_type dropdown, date range picker (start_date/end_date), owner/RM selector. (b) Missing KPI cards: Total Leads (sum of leads across active campaigns), Response Rate (responses / leads). (c) View, Edit, and Delete action buttons in the table row actions column (View links to Campaign Detail page from Phase 5, Edit opens edit dialog, Delete performs soft-delete with confirmation).
**Gap items addressed:** Part of PARTIAL items from Section 3.1

---

## Phase 8: Polish, Edge Cases, and Integration Tests
**Depends on:** Phase 7 (all features built)
**Estimated tasks:** 4

Final hardening: edge-case validations, integration tests across the full CRM workflow, and minor quality improvements.

### Task 8.1: Wire end-to-end integration tests for CRM workflow
**Files:**
- New: `/Users/n15318/Trust OMS/tests/e2e/campaign-management.spec.ts`
**What:** Write integration tests covering the full campaign lifecycle: create campaign -> create lead list (rule-based) -> assign list to campaign -> dispatch (with consent check) -> capture responses -> convert lead to prospect (with sanctions screening) -> file call report -> approve call report -> campaign auto-completes at EOD. Also test: client portal inbox shows campaign, RSVP updates response, handover approval reassigns entities. These tests exercise the full stack from API to service to schema.
**Gap items addressed:** Validates all 31 gap items end-to-end

### Task 8.2: Add response modification window UI feedback
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-detail.tsx` (from Phase 5)
**What:** In the Responses tab (Campaign Detail) and any response editing UI, show a countdown timer or "Editable until [datetime]" label. After 48 hours, disable the edit button and show "Read-only (modification window expired)". Supervisor users see an override button. This is the UI counterpart to the 48-hour enforcement added in Phase 6 Task 6.2.
**Gap items addressed:** #21 (UI portion)

### Task 8.3: Client portal campaign inbox polish
**Files:**
- `/Users/n15318/Trust OMS/apps/client-portal/src/pages/campaign-inbox.tsx`
- `/Users/n15318/Trust OMS/apps/client-portal/src/config/navigation.ts`
**What:** (a) Add Read/Unread tracking -- call a "mark as read" endpoint when a campaign card is expanded; show visual distinction (bold title for unread). (b) Wire the unread badge counter on the navigation item (Task 2.2) to the actual API count from `GET /api/v1/client-portal/campaign-inbox?unread_count=true`. (c) Add brochure preview -- if the campaign has a brochure_url, show a "View Brochure" button that opens the URL in a new tab or renders a PDF preview.
**Gap items addressed:** Remaining PARTIAL items from Section 3.12

### Task 8.4: Interaction Logger as contextual drawer
**Files:**
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/interaction-logger.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-detail.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/lead-list-manager.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/prospect-detail.tsx` (from Phase 5)
**What:** Refactor the interaction logger from a standalone full-page component into a reusable right-side drawer (400px wide, per BRD 15.2.1). Export it as `<InteractionDrawer campaignId={...} leadId={...} />`. Embed trigger buttons ("Log Interaction") in Campaign Detail, Lead List Manager, and Prospect Detail pages. The drawer pre-populates context (campaign, lead/prospect) based on where it was opened. Keep the standalone route as a fallback.
**Gap items addressed:** Remaining PARTIAL items from Section 3.13

---

## Dependency Graph

```
Phase 1 (Enum/Schema)  ─────────────────────────────┐
                                                      ├──> Phase 3 (Portal API + Consent)
Phase 2 (Navigation) ── runs in parallel with P1 ───┘          │
                                                                v
                                                     Phase 4 (BO API Endpoints)
                                                                │
                                                                v
                                                     Phase 5 (UI Pages)
                                                                │
                                                    ┌───────────┤
                                                    v           v
                                          Phase 6 (Biz Logic)  Phase 7 (UI Enhancements)
                                                    │           │
                                                    └─────┬─────┘
                                                          v
                                                  Phase 8 (Polish + E2E Tests)
```

## Gap Item Cross-Reference

| Gap # | Description | Phase.Task |
|---|---|---|
| 1 | CRM section in back-office nav | 2.1 |
| 2 | Campaign-inbox in client portal nav | 2.2 |
| 3 | campaign_type enum conflict | 1.1 |
| 4 | meeting_type enum conflict | 1.2 |
| 5 | meeting_purpose enum conflict | 1.3 |
| 6 | Client portal campaign endpoints | 3.1 |
| 7 | Consent check in dispatch | 3.2 |
| 8 | Campaign Detail page | 5.1 |
| 9 | Call Report lifecycle endpoints | 4.1 |
| 10 | Handover approval endpoint | 4.2 |
| 11 | Lead list member management | 4.3 |
| 12 | Bulk upload endpoints + wizard | 4.4, 5.5 |
| 13 | portfolios.source_campaign_id | 1.5 |
| 14 | response_type validation fix | 1.4 |
| 15 | Sanctions screening in conversion | 4.5 |
| 16 | Rule Builder modal | 5.4 |
| 17 | Call Report form | 5.2 |
| 18 | Prospect Detail page | 5.3 |
| 19 | EOD batch auto-completion | 6.1 |
| 20 | Conversion funnel + RM scorecards | 7.2 |
| 21 | Response modification 48-hour window | 6.2, 8.2 |
| 22 | Late call report detection | 4.1 |
| 23 | Calendar component for meetings | 7.1 |
| 24 | Unique constraints on DB | 1.5 |
| 25 | Sequential code generation | 2.3 |
| 26 | Excel/PDF export | 7.3 |
| 27 | Notification events | 6.5 |
| 28 | Accent removal in dedup | 6.3 |
| 29 | Business day calculation | 6.4 |
| 30 | SMS 160-char validation | 3.3 |
| 31 | Unsubscribe link in emails | 3.3 |
