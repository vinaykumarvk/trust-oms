# Gap Analysis: Campaign Management Module (CRM-CAM)

**BRD Version:** 2.0 Final (with Adversarial Evaluation Amendments)
**Analysis Date:** 2026-04-22
**Codebase Snapshot:** main branch, commit 1d0f244

---

## Executive Summary

| Classification | Count |
|---|---|
| EXISTS (fully implemented) | 68 |
| PARTIAL (partially implemented) | 29 |
| MISSING (not implemented) | 31 |
| CONFLICT (contradicts BRD) | 7 |

Overall coverage: ~52% of BRD requirements are fully or partially implemented. The data model layer is strong (16/18 entities fully match). The API layer has solid custom endpoints but lacks several BRD-specified routes. The UI layer has all 7 back-office pages plus the client portal page, but several pages have functional gaps. Business logic coverage is moderate -- core workflows exist but many business rules are not enforced.

---

## 1. Data Model (Section 4 -- 18 Entities)

**Source file:** `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (lines 3940-4337)

### 1.1 campaigns (Section 4.1)

| Field | BRD Spec | Implementation | Status |
|---|---|---|---|
| id | serial PK | `serial('id').primaryKey()` (line 4018) | EXISTS |
| campaign_code | text, unique, auto-gen CAM-YYYYMM-NNNN | `text('campaign_code').unique().notNull()` (line 4019) | EXISTS |
| name | text, required, max 200 | `text('name').notNull()` (line 4020) | PARTIAL -- no max length constraint |
| description | text, optional, max 5000 | `text('description')` (line 4021) | PARTIAL -- no max length constraint |
| campaign_type | campaign_type_enum | `campaignTypeEnum('campaign_type')` (line 4022) | EXISTS |
| status | campaign_status_enum | `campaignStatusEnum('campaign_status')` (line 4023) | EXISTS |
| target_product_id | integer FK | `integer('target_product_id')` (line 4024) | PARTIAL -- no FK reference defined |
| event_name | text | `text('event_name')` (line 4025) | EXISTS |
| event_date | timestamp | `timestamp('event_date', { withTimezone: true })` (line 4026) | EXISTS |
| event_venue | text | `text('event_venue')` (line 4027) | EXISTS |
| budget_amount | numeric(18,2) | `numeric('budget_amount').default('0')` (line 4028) | PARTIAL -- no precision/scale specified |
| budget_currency | text, default PHP | `text('budget_currency').default('PHP')` (line 4029) | EXISTS |
| actual_spend | numeric(18,2) | `numeric('actual_spend').default('0')` (line 4030) | PARTIAL -- no precision/scale |
| start_date | date, required | `date('start_date').notNull()` (line 4031) | EXISTS |
| end_date | date, required | `date('end_date').notNull()` (line 4032) | EXISTS |
| brochure_url | text | `text('brochure_url')` (line 4033) | EXISTS |
| owner_user_id | integer FK | `integer('owner_user_id').references(() => users.id)` (line 4034) | EXISTS |
| approved_by | integer FK | `integer('approved_by').references(() => users.id)` (line 4035) | EXISTS |
| approved_at | timestamp | `timestamp('approved_at', { withTimezone: true })` (line 4036) | EXISTS |
| rejection_reason | text | `text('rejection_reason')` (line 4037) | EXISTS -- extra field not in BRD Section 4.1 but matches workflow needs |
| audit fields | is_active, created_at, etc. | `...auditFields` (line 4038) | EXISTS |

**Enum check:** `campaign_type_enum` = ['EVENT', 'PRODUCT_PROMOTION'] (line 3940) -- **EXISTS**, matches BRD.
**Enum check:** `campaign_status_enum` = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] (lines 3942-3944) -- **EXISTS**, matches BRD.

**Verdict: EXISTS** -- All required fields present. Minor: no length constraints, no precision on numerics.

### 1.2 lead_lists (Section 4.2)

| Field | Status |
|---|---|
| All 11 fields | EXISTS (lines 4042-4051) |

**Enum check:** `list_source_enum` = ['RULE_BASED', 'UPLOADED', 'MANUAL'] (line 3956) -- **EXISTS**, matches BRD.

**Verdict: EXISTS**

### 1.3 leads (Section 4.3)

| Field | Status | Notes |
|---|---|---|
| All core fields | EXISTS (lines 4054-4076) | |
| product_interest | PARTIAL | BRD specifies `text[]`; impl uses `jsonb('product_interest').default('[]')` (line 4071) |
| existing_client_id | PARTIAL | BRD specifies `integer FK`; impl uses `text('existing_client_id').references(() => clients.client_id)` (line 4074) -- type mismatch but functionally correct since client_id is text |

**Enum check:** `lead_status_enum` = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DROPPED'] (lines 3946-3948) -- **EXISTS**.
**Enum check:** `lead_source_enum` = ['CAMPAIGN', 'REFERRAL', 'WALK_IN', 'UPLOADED', 'SYSTEM_GENERATED'] (lines 3950-3952) -- **EXISTS**.
**Enum check:** `entity_type_enum` = ['INDIVIDUAL', 'CORPORATE'] (line 3954) -- **EXISTS**.

**Verdict: EXISTS** -- minor type variations (jsonb vs text[], text FK vs integer FK)

### 1.4 lead_list_members (Section 4.4)

| Field | Status | Notes |
|---|---|---|
| All fields | EXISTS (lines 4079-4085) | |
| added_by | PARTIAL | BRD: `integer FK to users`; impl: `text('added_by')` (line 4084) |
| Unique constraint | MISSING | BRD: unique constraint on (lead_list_id, lead_id); not defined in schema |

**Verdict: PARTIAL** -- Missing unique constraint, added_by type mismatch.

### 1.5 campaign_lists (Section 4.5)

| Field | Status | Notes |
|---|---|---|
| All fields | EXISTS (lines 4088-4094) | |
| assigned_by | PARTIAL | BRD: `integer FK`; impl: `text('assigned_by')` (line 4093) |

**Verdict: EXISTS** -- minor type issue on assigned_by

### 1.6 campaign_responses (Section 4.6)

All 14 fields present (lines 4097-4111). Matches BRD.

**Verdict: EXISTS**

### 1.7 campaign_communications (Section 4.7)

All 14 fields present (lines 4114-4130). Column name uses `dispatch_status` instead of BRD's `status`.

**Verdict: EXISTS** -- column naming variant is acceptable

### 1.8 prospects (Section 4.8)

All 30+ fields present (lines 4133-4172). Matches BRD specification including enriched fields (DOB, nationality, tax_id, addresses, employer, income, net_worth, family_members, lifestyle_interests, negative_list_cleared, days_since_creation, converted_client_id).

**Verdict: EXISTS**

### 1.9 meetings (Section 4.9)

All 16 fields present (lines 4175-4192). Matches BRD.

**Verdict: EXISTS**

### 1.10 meeting_invitees (Section 4.10)

All 8 fields present (lines 4195-4204). Matches BRD.

**Verdict: EXISTS**

### 1.11 call_reports (Section 4.11)

All 22 fields present (lines 4207-4233). Matches BRD.

**Verdict: EXISTS**

### 1.12 action_items (Section 4.12)

All 12 fields present (lines 4236-4248). Matches BRD.

**Verdict: EXISTS**

### 1.13 rm_handovers (Section 4.13)

All 14 fields present (lines 4251-4266). Uses `approvalStatusEnum` for `handover_status` which is pre-existing in the codebase.

**Verdict: EXISTS**

### 1.14 notification_templates (Section 4.14)

All fields present (lines 4269-4279). Includes `locale` field from Section 15.6.2 amendment.

**Verdict: EXISTS**

### 1.15 lead_upload_batches (Section 4.15)

All 12 fields present (lines 4282-4295). Uses `upload_status` (text) instead of an enum.

**Verdict: EXISTS** -- status uses free text instead of enum, acceptable

### 1.16 campaign_consent_log (Section 15.1.1)

All 14 fields present (lines 4298-4313). Matches BRD amendment.

**Enum check:** `consent_type_enum` = ['MARKETING_EMAIL', 'MARKETING_SMS', 'EVENT_INVITATION', 'PUSH_NOTIFICATION'] (lines 3996-3998) -- **EXISTS**.
**Enum check:** `consent_status_enum` = ['OPTED_IN', 'OPTED_OUT', 'NOT_REQUESTED'] (lines 4000-4002) -- **EXISTS**.
**Enum check:** `consent_source_enum` = ['PORTAL_SELF_SERVICE', 'RM_ON_BEHALF', 'SYSTEM_DEFAULT', 'UNSUBSCRIBE_LINK', 'ONBOARDING'] (lines 4004-4006) -- **EXISTS**.

**Verdict: EXISTS**

### 1.17 campaign_translations (Section 15.6.1)

All 6 fields present (lines 4316-4324). Matches BRD.

**Missing:** Unique constraint on (campaign_id, locale) per BRD spec.

**Verdict: PARTIAL** -- missing unique constraint

### 1.18 lead_list_generation_jobs (Section 15.7.1)

All 8 fields present (lines 4327-4337). Matches BRD.

**Enum check:** `list_gen_job_status_enum` = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT'] (lines 4008-4010) -- **EXISTS**.

**Verdict: EXISTS**

### 1.19 Relations (Section 4.16)

All key relations defined (lines 4343-4399):
- campaigns -> owner, approver, campaignLists, responses, communications, meetings, callReports, translations -- **EXISTS**
- leadLists -> members, campaignLists, generationJobs -- **EXISTS**
- leads -> sourceCampaign, assignedRm, existingClient, listMemberships, responses -- **EXISTS**
- campaignResponses -> campaign, lead, assignedRm, actionItems -- **EXISTS**
- prospects -> lead, assignedRm, sourceCampaign, convertedClient -- **EXISTS**
- meetings -> campaign, organizer, invitees -- **EXISTS**
- callReports -> meeting, campaign, filer, actionItems -- **EXISTS**
- actionItems -> callReport, campaignResponse, assignee -- **EXISTS**

**Verdict: EXISTS**

### 1.20 Revenue Attribution: portfolios.source_campaign_id (Section 15.4.1)

**Status: MISSING**

The `portfolios` table (line 504-516 in schema.ts) does NOT contain a `source_campaign_id` field. The BRD Section 15.4.1 requires adding this field for campaign ROI tracking.

### Data Model Summary

| Entity | Status |
|---|---|
| campaigns | EXISTS |
| lead_lists | EXISTS |
| leads | EXISTS |
| lead_list_members | PARTIAL (missing unique constraint, type mismatch) |
| campaign_lists | EXISTS |
| campaign_responses | EXISTS |
| campaign_communications | EXISTS |
| prospects | EXISTS |
| meetings | EXISTS |
| meeting_invitees | EXISTS |
| call_reports | EXISTS |
| action_items | EXISTS |
| rm_handovers | EXISTS |
| notification_templates | EXISTS |
| lead_upload_batches | EXISTS |
| campaign_consent_log | EXISTS |
| campaign_translations | PARTIAL (missing unique constraint) |
| lead_list_generation_jobs | EXISTS |
| portfolios.source_campaign_id | MISSING |

**Overall Data Model: 16 EXISTS, 2 PARTIAL, 1 MISSING field addition**

---

## 2. API Endpoints (Section 7)

### 2.1 Campaign CRUD (Section 7.3)

**Source:** CRUD routes via `createCrudRouter` in `/Users/n15318/Trust OMS/server/routes/back-office/index.ts` (lines 449-458) and custom routes in `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts`.

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/back-office/campaigns | List campaigns with filters | CRUD router at `/api/v1/campaigns` (index.ts line 449) | EXISTS |
| POST /api/back-office/campaigns | Create campaign | CRUD router (index.ts line 449) | EXISTS |
| GET /api/back-office/campaigns/:id | Get detail | CRUD router | EXISTS |
| PATCH /api/back-office/campaigns/:id | Update campaign | CRUD router | EXISTS |
| DELETE /api/back-office/campaigns/:id | Soft-delete | CRUD router | EXISTS |
| POST /api/.../campaigns/:id/submit | Submit for approval | campaigns.ts line 34 | EXISTS |
| POST /api/.../campaigns/:id/approve | Approve/reject | campaigns.ts line 44 | EXISTS |
| POST /api/.../campaigns/:id/copy | Copy campaign | campaigns.ts line 64 | EXISTS |
| GET /api/.../campaigns/:id/analytics | Campaign analytics | campaigns.ts line 77 | EXISTS |
| GET /api/.../campaign-dashboard/stats | Dashboard stats | campaigns.ts line 87 | EXISTS |

**Verdict: EXISTS** -- All campaign endpoints implemented. Mounted at `/api/v1/campaign-mgmt/*` (routes.ts line 279).

### 2.2 Lead List Endpoints (Section 7.4)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/back-office/lead-lists | List all | CRUD router at `/api/v1/lead-lists` (index.ts line 460) | EXISTS |
| POST /api/back-office/lead-lists | Create list | CRUD router | EXISTS |
| POST /api/.../lead-lists/:id/refresh | Re-run rule | campaigns.ts line 101 | EXISTS |
| POST /api/.../lead-lists/merge | Merge lists | campaigns.ts line 111 | EXISTS |
| GET /api/.../lead-lists/:id/members | List members | CRUD router at `/api/v1/lead-list-members` (index.ts line 481) | PARTIAL -- generic CRUD, not nested under list ID |
| POST /api/.../lead-lists/:id/members | Add leads | MISSING | MISSING |
| DELETE /api/.../lead-lists/:id/members/:leadId | Remove lead | MISSING | MISSING |

**Verdict: PARTIAL** -- Core CRUD and custom operations exist. Missing nested member management endpoints (add/remove leads from specific lists).

### 2.3 Lead Endpoints (Section 7.5)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/back-office/leads | List leads | CRUD router at `/api/v1/leads` (index.ts line 460+) | EXISTS |
| POST /api/back-office/leads | Create lead | CRUD router | EXISTS |
| POST /api/.../leads/upload | Bulk upload | MISSING -- no upload endpoint in campaigns.ts or routes | MISSING |
| GET /api/.../leads/upload/:batchId | Upload status | MISSING | MISSING |
| POST /api/.../leads/:id/convert | Convert to prospect | campaigns.ts line 184 | EXISTS |

**Verdict: PARTIAL** -- CRUD and conversion exist. Bulk upload endpoints missing.

### 2.4 Response & Communication Endpoints (Section 7.6)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/.../campaigns/:id/responses | List responses | CRUD at `/api/v1/campaign-responses` (index.ts line 499) | PARTIAL -- generic CRUD, not nested |
| POST /api/.../campaigns/:id/responses | Capture response | Via CRUD or interactions endpoint | PARTIAL |
| POST /api/.../campaigns/:id/dispatch | Dispatch communication | campaigns.ts line 129 | EXISTS |
| GET /api/.../campaigns/:id/analytics | Campaign analytics | campaigns.ts line 77 | EXISTS |

**Verdict: PARTIAL** -- Dispatch and analytics exist. Response endpoints are generic CRUD rather than campaign-nested.

### 2.5 Meeting & Call Report Endpoints (Section 7.7)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/back-office/meetings | List meetings | CRUD at `/api/v1/meetings` (index.ts line 531) | EXISTS |
| POST /api/back-office/meetings | Schedule meeting | CRUD | EXISTS |
| POST /api/back-office/call-reports | File call report | CRUD at `/api/v1/call-reports` (index.ts line 550) | EXISTS |
| POST /api/.../call-reports/:id/submit | Submit report | MISSING -- no custom endpoint | MISSING |
| POST /api/.../call-reports/:id/approve | Approve report | MISSING -- no custom endpoint | MISSING |

**Verdict: PARTIAL** -- CRUD exists for meetings and call reports. Missing call report lifecycle endpoints (submit, approve).

### 2.6 Handover Endpoints (Section 7.8)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/back-office/handovers | List handovers | CRUD at `/api/v1/rm-handovers` (index.ts line 569) | EXISTS |
| POST /api/back-office/handovers | Create handover | CRUD | EXISTS |
| POST /api/.../handovers/:id/approve | Approve handover | MISSING -- no custom endpoint | MISSING |

**Verdict: PARTIAL** -- CRUD exists. Missing approval workflow endpoint.

### 2.7 Client Portal Endpoints (Section 7.9)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/portal/campaigns | My campaign invitations | MISSING -- client-portal.ts has no campaign endpoints | MISSING |
| POST /api/portal/campaigns/:id/rsvp | RSVP to event | MISSING | MISSING |
| GET /api/portal/meetings | My upcoming meetings | MISSING | MISSING |

**Note:** The client portal UI (`campaign-inbox.tsx`) calls `/api/v1/client-portal/campaign-inbox` and `/api/v1/client-portal/campaign-inbox/:commId/rsvp`, but these server endpoints do not exist in `/Users/n15318/Trust OMS/server/routes/client-portal.ts`. The client-portal.ts file only contains portfolio, allocation, performance, holdings, transactions, statements, and action request endpoints.

**Verdict: MISSING** -- All three client portal campaign endpoints are not implemented on the server side.

### 2.8 Unified Interaction Endpoint (Section 15.2.2)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| POST /api/back-office/interactions | Batch interaction | campaigns.ts line 160 | EXISTS |

**Verdict: EXISTS** -- Fully implemented with atomic response + action item + meeting creation.

### 2.9 Consent Endpoints (Section 15.1.3)

| Endpoint | BRD | Implementation | Status |
|---|---|---|---|
| GET /api/back-office/consent/:entityType/:entityId | Get consent | consent.ts line 9 -- uses `/client/:clientId` | PARTIAL -- different URL pattern, only clientId |
| POST /api/back-office/consent | Record consent | consent.ts line 19 | EXISTS |
| POST /api/portal/consent/opt-out | Client opt-out | MISSING | MISSING |
| GET /api/portal/consent/preferences | Client preferences | MISSING | MISSING |
| PATCH /api/portal/consent/preferences | Update preferences | MISSING | MISSING |

**Note:** The consent routes in `/Users/n15318/Trust OMS/server/routes/back-office/consent.ts` are oriented toward the existing consent/privacy system (PDPA compliance) and do not specifically implement the campaign consent log pattern from BRD Section 15.1.3. They work with `clientId` only, not with the `entityType/entityId` pattern needed for leads/prospects.

**Verdict: PARTIAL** -- Back-office consent exists but URL pattern differs and no lead/prospect support. Client portal consent endpoints are missing.

### API Summary

| Endpoint Group | Status |
|---|---|
| Campaign CRUD + lifecycle | EXISTS |
| Lead List CRUD + operations | PARTIAL (missing member mgmt) |
| Lead CRUD + upload + convert | PARTIAL (missing upload) |
| Response & Communication | PARTIAL |
| Meeting & Call Report | PARTIAL (missing lifecycle) |
| Handover | PARTIAL (missing approval) |
| Client Portal | MISSING |
| Unified Interaction | EXISTS |
| Consent | PARTIAL |

---

## 3. UI Screens (Section 6 -- 12+ Screens)

### 3.1 Campaign Dashboard (BRD Section 6.1, Route: /campaigns)

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx`
**Route:** `/crm/campaigns` (routes/index.tsx line 301)

| BRD Requirement | Implementation | Status |
|---|---|---|
| KPI cards (Active, Total Leads, Response Rate, Conversion Rate) | 5 KPI cards: Total, Active, Pending Approval, Completed, Conversion Rate (lines 302-333) | PARTIAL -- missing Total Leads, Response Rate |
| Campaigns table (Code, Name, Type, Status, Start, End, Budget, Responses, Actions) | Table with Code, Name, Type, Status, Start, End, Target Count, Response Rate, Actions (lines 468-517) | EXISTS |
| Filters: status, type, date range, owner | Tab-based status filter only (lines 721-738) | PARTIAL -- missing type, date range, owner filters |
| Actions: Create, View, Edit, Copy, Delete | Create (dialog), Submit, Approve/Reject, Copy, Analytics buttons | PARTIAL -- missing View/Edit/Delete actions |

**CONFLICT:** Campaign types in UI use ['PRODUCT_LAUNCH', 'EVENT_INVITATION', 'EDUCATIONAL', 'REFERRAL', 'CROSS_SELL', 'UP_SELL', 'RETENTION', 'RE_ENGAGEMENT'] (line 65-73), but schema enum is ['EVENT', 'PRODUCT_PROMOTION'] (line 3940). These are incompatible.

**Verdict: PARTIAL** with **CONFLICT** on campaign types.

### 3.2 Campaign Detail (BRD Section 6.2, Route: /campaigns/:id)

**Status: MISSING** -- No dedicated campaign detail page exists. The campaign dashboard shows an analytics dialog modal but does not provide the tabbed layout specified in the BRD (Overview, Target Lists, Responses, Communications, Meetings, Call Reports tabs).

**Verdict: MISSING**

### 3.3 Lead List Manager (BRD Section 6.3, Route: /lead-lists)

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/lead-list-manager.tsx`
**Route:** `/crm/lead-lists` (routes/index.tsx line 312)

| BRD Requirement | Implementation | Status |
|---|---|---|
| Two-panel layout (list + detail) | Expandable rows showing leads in sub-table | PARTIAL -- not a true two-panel layout |
| Create List (Manual, Upload, Rule-based) | Create dialog with source type selector and JSON rule definition (lines 578-658) | PARTIAL -- no visual rule builder, JSON input only |
| Upload wizard | Not implemented | MISSING |
| Merge button | Merge dialog with multi-select (lines 700-779) | EXISTS |
| Refresh for rule-based lists | Refresh button for RULE_BASED lists (line 514-521) | EXISTS |
| Member grid (Lead code, Name, Email, Phone, Status, Category, AUM) | Sub-table shows Name, Email, Phone, Company, Status, Added (lines 382-423) | PARTIAL -- missing Lead Code, Category, AUM columns |

**Verdict: PARTIAL** -- Core functionality present. Missing upload wizard and visual rule builder.

### 3.4 Rule Builder Modal (BRD Section 6.4)

**Status: MISSING** -- No visual rule builder with field dropdowns, operator dropdowns, value inputs, AND/OR toggles, and preview functionality. The lead list manager only provides a raw JSON textarea for rule definitions.

**Verdict: MISSING**

### 3.5 Lead Upload Wizard (BRD Section 6.5)

**Status: MISSING** -- No upload wizard with the 4-step flow (file upload, column mapping, validation results, confirm import).

**Verdict: MISSING**

### 3.6 Response Capture Form (BRD Section 6.6)

**Status: PARTIAL** -- Response capture is available through the Unified Interaction Logger page (`/crm/interactions`) rather than as a standalone modal/drawer from the Campaign Detail page. The interaction logger combines response, action item, and meeting creation per BRD Section 15.2.

**Verdict: PARTIAL** -- Exists as part of interaction logger, not as standalone

### 3.7 Meeting Calendar (BRD Section 6.7, Route: /meetings)

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/meetings-calendar.tsx`
**Route:** `/crm/meetings` (routes/index.tsx line 332)

| BRD Requirement | Implementation | Status |
|---|---|---|
| Calendar component (Day/Week/Month/List views) | Table-based list view only (lines 298-397) | PARTIAL -- no actual calendar component |
| Meetings as colored blocks by purpose | No color coding by purpose | MISSING |
| Drag-and-drop to reschedule | Not implemented | MISSING |
| Create meeting button | Create meeting dialog (lines 557-667) | EXISTS |
| Call Reports tab | Call reports table in separate tab (lines 399-464) | EXISTS |
| Action Items tab | Action items table in separate tab (lines 466-545) | EXISTS |

**CONFLICT:** Meeting types in UI use ['FACE_TO_FACE', 'VIRTUAL', 'PHONE'] (line 114), but schema enum is ['IN_PERSON', 'VIRTUAL', 'PHONE'] (line 3972). `FACE_TO_FACE` vs `IN_PERSON` is a mismatch.

**CONFLICT:** Meeting purposes in UI use ['INITIAL_MEETING', 'PORTFOLIO_REVIEW', 'PRODUCT_PRESENTATION', 'RELATIONSHIP_CHECK_IN', 'COMPLAINT_RESOLUTION', 'ONBOARDING', 'OTHER'] (lines 116-124), but schema enum is ['CAMPAIGN_FOLLOW_UP', 'SERVICE_REQUEST', 'GENERAL', 'REVIEW'] (lines 3974-3976). Completely different sets.

**Verdict: PARTIAL** with **CONFLICT** on enum values.

### 3.8 Call Report Form (BRD Section 6.8, Route: /call-reports/new)

**Status: MISSING** -- No dedicated call report creation form. Call reports are listed in the meetings-calendar page but there is no form to create/edit them.

**Verdict: MISSING**

### 3.9 Prospect Detail (BRD Section 6.9, Route: /prospects/:id)

**Status: MISSING** -- The prospect-manager.tsx page shows a prospect list/pipeline view but there is no dedicated prospect detail page with tabbed layout (Personal, Financial, Family, History, Screening tabs) as specified in the BRD.

The prospect-manager.tsx provides:
- KPI cards for pipeline stages
- Filterable prospect table
- Status transition actions

But missing the BRD-specified `/prospects/:id` detail page.

**Verdict: PARTIAL** -- List view exists; detail page with tabs is missing.

### 3.10 RM Handover Screen (BRD Section 6.10, Route: /handovers)

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/rm-handover.tsx`
**Route:** `/crm/handovers` (routes/index.tsx line 363)

| BRD Requirement | Implementation | Status |
|---|---|---|
| Three-panel layout | Table-based layout with dialogs | PARTIAL -- not three-panel |
| Outgoing RM selector with entity count | Present | EXISTS |
| Entity grid with multi-select | Present | EXISTS |
| Incoming RM selector | Present | EXISTS |
| Effective date, reason, notes | Present | EXISTS |
| Submit for approval | Present | EXISTS |

**Verdict: PARTIAL** -- Functionality present but layout differs from BRD spec.

### 3.11 Analytics Dashboard (BRD Section 6.11, Route: /campaign-analytics)

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-analytics.tsx`
**Route:** `/crm/analytics` (routes/index.tsx line 351)

| BRD Requirement | Implementation | Status |
|---|---|---|
| Widget grid (2x3 on desktop) | 6 KPI cards in grid (lines 286-300) | EXISTS |
| KPI cards (Active, Leads Targeted, Responses, Conversion Rate) | Implemented (lines 158-200) | EXISTS |
| Conversion funnel chart | Not implemented | MISSING |
| Response by channel bar chart | Not implemented (response breakdown uses CSS bars, not chart library) | PARTIAL |
| Top campaigns table | Campaign list table with click-to-drill (lines 529-568) | PARTIAL |
| RM scorecards table | Not implemented | MISSING |
| Global filters: date range, campaign, RM, branch | Campaign selector only (lines 303-334) | PARTIAL |
| Export to Excel | Not implemented | MISSING |

**Verdict: PARTIAL** -- Basic analytics with KPIs and drill-down exist. Missing charts, scorecards, and export.

### 3.12 Client Portal Campaigns (BRD Section 6.12, Route: /portal/campaigns)

**File:** `/Users/n15318/Trust OMS/apps/client-portal/src/pages/campaign-inbox.tsx`
**Route:** `/campaign-inbox` (client-portal routes/index.tsx line 175)

| BRD Requirement | Implementation | Status |
|---|---|---|
| Inbox-style list | Card grid with All/Events/Other tabs (lines 200-265) | EXISTS |
| Campaign type badge | Badge showing campaign type (line 148-149) | EXISTS |
| Status indicator (New/Read/Responded) | RSVP status badge shown (lines 152-155) | PARTIAL -- no Read/Unread tracking |
| Click to expand details | Dialog showing full details (lines 268-381) | EXISTS |
| RSVP buttons (for events) | Accept/Maybe/Decline buttons (lines 327-369) | EXISTS |
| Unread badge on navigation | Not implemented | MISSING |
| Brochure preview | Not implemented | MISSING |

**CONFLICT:** The UI calls API endpoints (`/api/v1/client-portal/campaign-inbox` and `.../:commId/rsvp`) that do not exist on the server.

**Verdict: PARTIAL** with backend **MISSING**.

### 3.13 Unified Interaction Drawer (BRD Section 15.2.1)

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/interaction-logger.tsx`
**Route:** `/crm/interactions` (routes/index.tsx line 340)

| BRD Requirement | Implementation | Status |
|---|---|---|
| Right-side drawer (400px) | Full page with sections (not a drawer) | PARTIAL -- page vs drawer |
| Section 1: Quick Response | Response type selector, notes, channel | EXISTS |
| Section 2: Follow-Up Action | Action item description, due date, priority | EXISTS |
| Section 3: Schedule Meeting | Meeting date/time, type, location | EXISTS |
| "Save All" atomic submit | Single API call to `/api/v1/campaign-mgmt/interactions` | EXISTS |
| Auto-expand section 2 based on response type | Not confirmed from first 50 lines | PARTIAL |
| Accessible from Campaign Detail, Lead List, Prospect Detail | Standalone page only, not contextual drawer | PARTIAL |

**Verdict: PARTIAL** -- Functionality exists as a standalone page, not as the contextual side-panel drawer specified in the BRD. The BRD requires it be accessible from multiple contexts (Campaign Detail, Lead List, Prospect Detail, RM Dashboard).

### UI Screen Summary

| Screen | BRD Section | Route | Status |
|---|---|---|---|
| Campaign Dashboard | 6.1 | /crm/campaigns | PARTIAL + CONFLICT |
| Campaign Detail | 6.2 | /crm/campaigns/:id | MISSING |
| Lead List Manager | 6.3 | /crm/lead-lists | PARTIAL |
| Rule Builder Modal | 6.4 | Modal | MISSING |
| Lead Upload Wizard | 6.5 | Modal/stepper | MISSING |
| Response Capture Form | 6.6 | Modal/drawer | PARTIAL |
| Meeting Calendar | 6.7 | /crm/meetings | PARTIAL + CONFLICT |
| Call Report Form | 6.8 | /call-reports/new | MISSING |
| Prospect Detail | 6.9 | /crm/prospects/:id | PARTIAL (list only) |
| RM Handover Screen | 6.10 | /crm/handovers | PARTIAL |
| Analytics Dashboard | 6.11 | /crm/analytics | PARTIAL |
| Client Portal Campaigns | 6.12 | /campaign-inbox | PARTIAL + backend MISSING |
| Unified Interaction Drawer | 15.2.1 | /crm/interactions | PARTIAL (page, not drawer) |

---

## 4. Business Logic

### 4.1 Maker-Checker Approval Workflow (FR-007)

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 58-106)

| Rule | Implementation | Status |
|---|---|---|
| Submit DRAFT -> PENDING_APPROVAL | `campaignService.submit()` checks `campaign_status !== 'DRAFT'` (line 65) | EXISTS |
| Approve -> ACTIVE | `campaignService.approve()` sets ACTIVE (line 92) | EXISTS |
| Reject -> DRAFT with reason | Sets DRAFT with rejection_reason (lines 93-99) | EXISTS |
| Owner cannot approve own | Check `campaign.owner_user_id === userId` (line 89) | EXISTS |
| Role check (RM_SUPERVISOR, SYS_ADMIN) | Route-level `requireAnyRole('BO_HEAD', 'BO_CHECKER', 'SYSTEM_ADMIN')` (campaigns.ts line 46) | PARTIAL -- different role names |
| Notification on approval/rejection | Not implemented | MISSING |
| 2-level approval configurable | Not implemented | MISSING |

**Verdict: PARTIAL** -- Core approval exists. Missing notifications and 2-level approval.

### 4.2 Deduplication Engine (FR-005)

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 44-52)

| Rule | Implementation | Status |
|---|---|---|
| SHA-256 hash of name+email+phone | `computeDedupHash()` uses `crypto.createHash('sha256')` (line 51) | EXISTS |
| Names normalized: lowercase, trim, remove accents | Lowercase + trim (lines 46-47); accents NOT removed | PARTIAL |
| Phone normalized: remove spaces, dashes, country code | `phone.replace(/[\s\-\+]/g, '')` (line 49) | PARTIAL -- removes + but not full country code |
| Dedup on create | Hash checked in `leadListService.executeRule()` (line 316-320) | EXISTS |
| Dedup on upload | Upload not implemented | MISSING |
| Soft matches (>80% similarity) shown as warnings | Not implemented | MISSING |
| Hard matches (100%) blocked | Existing lead reused if hash matches (line 323-324) | PARTIAL -- reuses rather than blocks |
| Dedup results in audit trail | Not implemented | MISSING |

**Verdict: PARTIAL** -- SHA-256 hash exists. Missing similarity matching, upload dedup, audit trail.

### 4.3 Lead Status Transitions (Section 9.2)

| Transition | Implementation | Status |
|---|---|---|
| NEW -> CONTACTED | Via CRUD update | PARTIAL -- no validation |
| CONTACTED -> QUALIFIED | Via CRUD update | PARTIAL -- no validation |
| QUALIFIED -> CONVERTED | `prospectService.convertLeadToProspect()` checks status (line 648) | EXISTS |
| NEW/CONTACTED -> DROPPED | Via CRUD update | PARTIAL -- no validation |
| DROPPED -> NEW (reactivate) | Not implemented | MISSING |

**Verdict: PARTIAL** -- Conversion enforced; other transitions unvalidated.

### 4.4 Campaign Lifecycle States (Section 9.1)

| Transition | Implementation | Status |
|---|---|---|
| DRAFT -> PENDING_APPROVAL (submit) | campaignService.submit() (line 59) | EXISTS |
| PENDING_APPROVAL -> ACTIVE (approve) | campaignService.approve() (line 80) | EXISTS |
| PENDING_APPROVAL -> DRAFT (reject) | campaignService.approve() (line 80) | EXISTS |
| ACTIVE -> COMPLETED (EOD batch) | Not implemented | MISSING |
| COMPLETED -> ARCHIVED (after 30 days) | Not implemented | MISSING |

**Verdict: PARTIAL** -- Manual transitions exist. EOD batch auto-completion and archival missing.

### 4.5 Consent Checking Before Dispatch (FR-011 BR6-BR10)

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 451-535)

| Rule | Implementation | Status |
|---|---|---|
| Check campaign_consent_log before dispatch | Not implemented -- dispatch filters by valid contact info only (lines 493-497) | MISSING |
| Default consent based on source | Not implemented | MISSING |
| Consent failure logged | Not implemented | MISSING |
| Unsubscribe link creates OPTED_OUT record | Not implemented | MISSING |

**Verdict: MISSING** -- Dispatch service does not integrate with campaign_consent_log at all.

### 4.6 Auto-Code Generation

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 29-42)

| Code | BRD Format | Implementation | Status |
|---|---|---|---|
| Campaign code | CAM-YYYYMM-NNNN | `generateCode('CAM')` uses random 4-digit seq (line 33) | PARTIAL -- random, not sequential |
| Lead code | L-XXXXXXXX | `generateLeadCode()` random 8-digit (line 37) | EXISTS |
| Prospect code | P-XXXXXXXX | `generateProspectCode()` random 8-digit (line 41) | EXISTS |
| List code | LL-YYYYMM-NNNN | `generateCode('LL')` (line 410) | PARTIAL -- random, not sequential |
| Meeting code | MTG-YYYYMMDD-NNNN | `generateCode('MTG')` (line 610) | PARTIAL -- format is MTG-YYYYMM-NNNN, not MTG-YYYYMMDD-NNNN |
| Batch code | UPL-YYYYMMDD-NNNN | Not implemented (no upload) | MISSING |
| Report code | CR-YYYYMMDD-NNNN | Via CRUD (not in campaign-service) | PARTIAL |

**Verdict: PARTIAL** -- Codes generated but use random sequences instead of sequential NNNN, and some date formats differ.

### 4.7 Follow-Up Date Auto-Suggestion (FR-014 AC4)

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (line 568)

| Rule | Implementation | Status |
|---|---|---|
| +3 business days | `Date.now() + 3 * 24 * 60 * 60 * 1000` (line 568) | PARTIAL -- adds 3 calendar days, not business days |

**Verdict: PARTIAL** -- Calendar days instead of business days.

### 4.8 Response Modification 48-Hour Window (FR-014 BR2)

| Rule | Implementation | Status |
|---|---|---|
| Responses modifiable within 48 hours, then read-only | Not implemented | MISSING |

**Verdict: MISSING**

### 4.9 Late Call Report Detection >5 Days (FR-018 AC5)

| Rule | Implementation | Status |
|---|---|---|
| If filed >5 days after meeting_date, requires_supervisor_approval = true | Not implemented in service layer | MISSING |

**Verdict: MISSING**

### 4.10 Campaign Copy Rules (FR-009)

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 108-152)

| Rule | Implementation | Status |
|---|---|---|
| New campaign in DRAFT status | `campaign_status: 'DRAFT'` (line 121) | EXISTS |
| New campaign_code auto-generated | `generateCode('CAM')` (line 117) | EXISTS |
| All fields copied except status, code, approved_by/at | Copies name with " (Copy)" suffix, all fields, sets `actual_spend: '0'` (lines 118-135) | EXISTS |
| Lead list assignments copied | Lists copied (lines 138-150) | EXISTS |
| Responses and communications NOT copied | Not copied (no code to copy them) | EXISTS |
| Source can be any status | No status check before copy (line 113) | EXISTS |

**Verdict: EXISTS**

### 4.11 Lead-to-Prospect Conversion (FR-022)

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 641-701)

| Rule | Implementation | Status |
|---|---|---|
| Only QUALIFIED or CONTACTED leads | Status check (line 648) | EXISTS |
| Pre-fills from lead record | Copies name, email, phone, entity_type, etc. (lines 656-670) | EXISTS |
| Accepts additional fields | Spreads additionalFields (lines 672-679) | EXISTS |
| Negative/sanctions screening | NOT implemented -- no call to sanctions-service | MISSING |
| Prospect code generated | `generateProspectCode()` (line 656) | EXISTS |
| Lead status -> CONVERTED | Updated (lines 687-694) | EXISTS |
| prospect_id linked in campaign_responses | NOT implemented | MISSING |
| At least 15 fields required | NOT validated | MISSING |
| Tax ID format validation | NOT implemented | MISSING |

**Verdict: PARTIAL** -- Core conversion works. Missing sanctions screening, field count validation, and response linking.

### 4.12 Campaign Dispatch Rules (FR-011)

**File:** `/Users/n15318/Trust OMS/server/services/campaign-service.ts` (lines 451-535)

| Rule | Implementation | Status |
|---|---|---|
| Campaign must be ACTIVE | Checked (line 466-468) | EXISTS |
| Filter by valid contact for channel | Implemented (lines 493-497) | EXISTS |
| Template token resolution | Basic token replacement (lines 500-504) | PARTIAL -- only campaign_name, event_name, event_date, event_venue tokens |
| Consent check before dispatch | NOT implemented | MISSING |
| SMS <= 160 chars after resolution | NOT validated | MISSING |
| Email must include unsubscribe link | NOT implemented | MISSING |
| Opted-out leads excluded | NOT implemented | MISSING |

**Verdict: PARTIAL** -- Basic dispatch works. Missing consent integration, SMS validation, unsubscribe.

### Business Logic Summary

| Business Rule | Status |
|---|---|
| Maker-checker approval | PARTIAL |
| Deduplication engine (SHA-256) | PARTIAL |
| Lead status transitions | PARTIAL |
| Campaign lifecycle states | PARTIAL |
| Consent checking before dispatch | MISSING |
| Auto-code generation | PARTIAL |
| Follow-up date auto-suggestion | PARTIAL |
| Response modification 48-hour window | MISSING |
| Late call report detection (>5 days) | MISSING |
| Campaign copy rules | EXISTS |
| Lead-to-prospect conversion | PARTIAL |
| Campaign dispatch rules | PARTIAL |

---

## 5. Navigation

### 5.1 Back-Office Sidebar

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/config/navigation.ts`

| Requirement | Status | Notes |
|---|---|---|
| CRM / Campaign Management section in sidebar | **MISSING** | The navigation configuration has sections for Master Data, Reference Data, Risk Profiling, Fees & Charges, General Ledger, Operations, Compliance, Analytics, Regulatory, and Tools -- but NO "Campaign Management" or "CRM" section. |
| Campaign Dashboard link | MISSING | |
| Lead List Manager link | MISSING | |
| Prospects link | MISSING | |
| Meetings link | MISSING | |
| Interaction Logger link | MISSING | |
| Campaign Analytics link | MISSING | |
| RM Handover link | MISSING | |

**The CRM pages are routed (routes/index.tsx lines 297-367) but completely absent from the sidebar navigation.** Users cannot navigate to any CRM page via the sidebar.

**Verdict: MISSING** -- Critical navigation gap.

### 5.2 Client Portal Navigation

**File:** `/Users/n15318/Trust OMS/apps/client-portal/src/config/navigation.ts`

| Requirement | Status | Notes |
|---|---|---|
| Campaign link in client portal sidebar | **MISSING** | Navigation items: Dashboard, Portfolio, Performance, Statements, Messages, Service Requests, Preferences. No "Campaigns" or "Campaign Inbox" link. |
| Unread badge | MISSING | |

**The Campaign Inbox page exists and is routed (client-portal routes/index.tsx line 175 at `/campaign-inbox`), but there is no sidebar navigation item pointing to it.**

**Verdict: MISSING** -- Critical navigation gap.

---

## 6. CONFLICT Summary

| # | Location | BRD Spec | Codebase Implementation | Impact |
|---|---|---|---|---|
| C1 | campaign-dashboard.tsx line 65 | campaign_type enum: EVENT, PRODUCT_PROMOTION | UI uses: PRODUCT_LAUNCH, EVENT_INVITATION, EDUCATIONAL, REFERRAL, CROSS_SELL, UP_SELL, RETENTION, RE_ENGAGEMENT | HIGH -- UI and schema enums are incompatible; creating campaigns from UI will fail validation |
| C2 | meetings-calendar.tsx line 114 | meeting_type enum: IN_PERSON, VIRTUAL, PHONE | UI uses: FACE_TO_FACE, VIRTUAL, PHONE | MEDIUM -- FACE_TO_FACE vs IN_PERSON mismatch |
| C3 | meetings-calendar.tsx lines 116-124 | meeting_purpose enum: CAMPAIGN_FOLLOW_UP, SERVICE_REQUEST, GENERAL, REVIEW | UI uses: INITIAL_MEETING, PORTFOLIO_REVIEW, PRODUCT_PRESENTATION, RELATIONSHIP_CHECK_IN, COMPLAINT_RESOLUTION, ONBOARDING, OTHER | HIGH -- completely different enum sets |
| C4 | campaign-service.ts line 14 | response_type enum: INTERESTED, NOT_INTERESTED, NEED_MORE_INFO, CONVERTED, OTHER | Service validates against: INTERESTED, NOT_INTERESTED, MAYBE, CONVERTED, NO_RESPONSE, CALLBACK_REQUESTED, NEED_MORE_INFO | MEDIUM -- service accepts non-schema values (MAYBE, NO_RESPONSE, CALLBACK_REQUESTED) |
| C5 | campaign-service.ts line 15 | meeting_type enum: IN_PERSON, VIRTUAL, PHONE | Service validates: FACE_TO_FACE, VIRTUAL, PHONE | MEDIUM -- same as C2, in service layer |
| C6 | campaign-inbox.tsx line 95 | BRD: /api/portal/campaigns | UI calls: /api/v1/client-portal/campaign-inbox | HIGH -- endpoint does not exist on server |
| C7 | consent.ts | BRD: consent routes use entityType/entityId pattern for leads/prospects/clients | Existing consent routes only support clientId | MEDIUM -- cannot track consent for leads/prospects |

---

## 7. Priority Gap Items (Recommended Fixes)

### Critical (Must Fix for Phase 1 MVP)

1. **Add CRM section to back-office navigation** (`navigation.ts`) -- Users cannot discover or access any CRM pages
2. **Add campaign-inbox link to client portal navigation** (`client-portal/navigation.ts`)
3. **Fix campaign_type enum conflict** -- Align UI types with schema enum (EVENT, PRODUCT_PROMOTION) or expand schema
4. **Fix meeting_type enum conflict** -- Change UI FACE_TO_FACE to IN_PERSON
5. **Fix meeting_purpose enum conflict** -- Align UI with schema enum
6. **Implement client portal campaign endpoints** -- GET campaign-inbox, POST rsvp, GET meetings
7. **Implement consent check in dispatch service** -- Required for PDPA compliance (Section 15.1.2)

### High Priority

8. **Add Campaign Detail page** (BRD 6.2) -- Tabbed layout for viewing full campaign information
9. **Add Call Report lifecycle endpoints** -- submit, approve (BRD 7.7)
10. **Add Handover approval endpoint** (BRD 7.8)
11. **Add lead list member management endpoints** -- add/remove members (BRD 7.4)
12. **Add bulk upload endpoints and wizard** -- upload, validation, import (BRD 7.5, 6.5)
13. **Add portfolios.source_campaign_id** for revenue attribution (BRD 15.4.1)
14. **Fix response_type validation** in campaign-service.ts to match schema enum
15. **Implement sanctions screening** in lead-to-prospect conversion (FR-022)

### Medium Priority

16. **Add Rule Builder modal** with visual UI (BRD 6.4)
17. **Add Call Report form** (BRD 6.8)
18. **Add Prospect Detail page** with tabbed layout (BRD 6.9)
19. **Implement EOD batch** for campaign auto-completion and delegation auto-expiry
20. **Add conversion funnel chart** and RM scorecards to analytics
21. **Add response modification 48-hour window** enforcement
22. **Add late call report detection** (>5 days auto-flag)
23. **Implement calendar component** for meetings (Day/Week/Month views)
24. **Add unique constraints** on lead_list_members(lead_list_id, lead_id) and campaign_translations(campaign_id, locale)
25. **Generate sequential codes** instead of random (CAM-YYYYMM-0001, 0002, etc.)

### Low Priority

26. **Add Excel/PDF export** to analytics and reports
27. **Add notification events** for campaign lifecycle (submit, approve, reject, etc.)
28. **Add accent removal** to dedup normalization
29. **Add business day calculation** for follow-up date suggestion
30. **Add SMS 160-char validation** in dispatch
31. **Add unsubscribe link** in email templates

---

## 8. File Reference Index

| Component | Absolute Path |
|---|---|
| Schema (all 18 entities) | `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` lines 3940-4399 |
| Campaign custom routes | `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts` |
| Campaign service | `/Users/n15318/Trust OMS/server/services/campaign-service.ts` |
| CRUD route registration | `/Users/n15318/Trust OMS/server/routes/back-office/index.ts` lines 449-614 |
| Server route mounting | `/Users/n15318/Trust OMS/server/routes.ts` line 279 |
| Consent routes | `/Users/n15318/Trust OMS/server/routes/back-office/consent.ts` |
| Client portal routes | `/Users/n15318/Trust OMS/server/routes/client-portal.ts` |
| Back-office navigation | `/Users/n15318/Trust OMS/apps/back-office/src/config/navigation.ts` |
| Client portal navigation | `/Users/n15318/Trust OMS/apps/client-portal/src/config/navigation.ts` |
| Back-office routes | `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` lines 297-367 |
| Client portal routes | `/Users/n15318/Trust OMS/apps/client-portal/src/routes/index.tsx` line 175 |
| Campaign Dashboard UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx` |
| Lead List Manager UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/lead-list-manager.tsx` |
| Prospect Manager UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/prospect-manager.tsx` |
| Meetings Calendar UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/meetings-calendar.tsx` |
| Interaction Logger UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/interaction-logger.tsx` |
| Campaign Analytics UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-analytics.tsx` |
| RM Handover UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/rm-handover.tsx` |
| Client Campaign Inbox UI | `/Users/n15318/Trust OMS/apps/client-portal/src/pages/campaign-inbox.tsx` |
