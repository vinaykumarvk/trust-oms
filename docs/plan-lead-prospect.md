# Development Plan: Lead & Prospect Management Module

## Date: 2026-04-22
## BRD: docs/LeadProspect_BRD_v2_FINAL.docx
## Gap Analysis: docs/gap-analysis-lead-prospect-2026-04-22.md

---

## Overview

Implement the Lead & Prospect Management module for Trust OMS, covering the complete lead-to-customer lifecycle: lead CRUD with 7-section forms, configurable dedupe and negative-list screening, campaign management with approval workflows, prospect lifecycle and conversion, RM calendar/meeting management, call reports with approval, opportunity pipeline, task management, handover/delegation, service requests, and management dashboards. The codebase has ~25% coverage from an earlier CRM PAD implementation; this plan extends and modifies that foundation to match the full BRD specification across 4 phases (Foundation, Campaign & Lists, Engagement Tools, Operations & Governance).

## Architecture Decisions

- **Decision 1: Extend existing CRM schema rather than replace.** The 18 existing CRM tables in `packages/shared/src/schema.ts` (lines 4056-4457) will be modified in-place (add columns, update enums) rather than creating parallel tables. This preserves existing data and avoids migration complexity. New sub-entity tables (family members, addresses, identifications, lifestyle, documents) are added alongside.

- **Decision 2: Resolve entity_type enum to BRD values (`INDIVIDUAL`/`NON_INDIVIDUAL`).** The existing `CORPORATE` value is renamed to `NON_INDIVIDUAL` to align with BRD terminology, which is more inclusive of trusts, foundations, and partnerships. All references updated.

- **Decision 3: Consolidate handover on HAM module `handovers` table.** The HAM `handovers` table (line 4930) is more comprehensive than the simple `rmHandovers` table (line 4370). BRD API paths (`/handovers`) will map to the HAM implementation. The `rmHandovers` table is retained but deprecated.

- **Decision 4: Campaign approval sets APPROVED, not ACTIVE.** Fix the conflict where approval currently sets status to `ACTIVE`. BRD requires `APPROVED` first, then `ACTIVE` only when `start_date` is reached (via a scheduled daily job at 06:00).

- **Decision 5: Meeting type/purpose restructure.** Add a `mode` field to meetings for the physical mode (IN_PERSON/PHONE/VIDEO/BRANCH_VISIT). The existing `meeting_type` enum is repurposed to hold the BRD purpose categories. The existing `purpose` enum is deprecated.

- **Decision 6: Split campaign-service.ts into domain services.** The existing 701-line `campaign-service.ts` contains campaign, lead list, prospect, dispatch, and interaction logic. This plan splits it into `lead-service.ts`, `prospect-service.ts`, `dedupe-service.ts`, `negative-list-service.ts` while keeping `campaign-service.ts` for campaign-specific logic.

- **Decision 7: Keep existing `action_items` table alongside new `tasks` table.** The BRD defines a broader `tasks` entity while the existing `action_items` is call-report/campaign-specific. Both are retained. `action_items` continues to serve call reports; `tasks` provides standalone task management.

- **Decision 8: Add CRM navigation section.** The existing CRM pages are route-registered but have no sidebar navigation. A "CRM" section is added to `apps/back-office/src/config/navigation.ts` with items: Customer Workspace, Calendar, Campaign, Lead Lists, Reports.

## Conventions

- **Schema**: Use `pgTable` + `pgEnum` in `packages/shared/src/schema.ts`, always include `...auditFields` spread. Reference existing tables at lines 4056-4457 for CRM patterns.
- **Routes (CRUD)**: Register via `createCrudRouter()` in `server/routes/back-office/index.ts` (see line 448-596 for CRM examples). Custom lifecycle endpoints go in dedicated route files (see `server/routes/back-office/campaigns.ts`).
- **Routes (Custom)**: Use `Router()` from Express, guard with `requireBackOfficeRole()`, use `try/catch` with `errMsg()` pattern (see `server/routes/back-office/campaigns.ts` line 15-17).
- **Services**: Export named service objects with async methods. Follow pattern in `server/services/campaign-service.ts` and `server/services/service-request-service.ts`.
- **UI**: React + TypeScript, `@tanstack/react-query`, shadcn/ui components from `@ui/components/ui/*`, `lucide-react` icons, `sonner` toasts. See `apps/back-office/src/pages/crm/campaign-dashboard.tsx` for pattern.
- **Tests**: Vitest with `describe/it/expect`, mock DB with `vi.mock()`. See `tests/e2e/role-auth.spec.ts` for pattern.
- **Code generation**: Use format `L-XXXXXXXX` for leads, `P-XXXXXXXX` for prospects, `CMP-XXXXX` for campaigns (see `campaign-service.ts` lines 29-42).

---

## Dependency Graph

```
Phase 1 (Conflict Resolution + Schema Foundation)
    |
    +---> Phase 2 (Lead & Prospect Services + API) -------+
    |                                                       |
    +---> Phase 3 (Dedupe, Negative List, Screening) ------+
    |                                                       |
    +---> Phase 4 (Lead & Prospect UI)                      |
              |                                             |
              v                                             v
         Phase 5 (Campaign & List Schema + Services) ------+
              |                                             |
              v                                             |
         Phase 6 (Campaign UI + Lead Rule Builder)          |
              |                                             |
              v                                             v
         Phase 7 (Calendar, Meetings, Call Reports) --------+
              |                                             |
              v                                             |
         Phase 8 (Opportunity, Tasks, Notifications) ------+
              |                                             |
              v                                             v
         Phase 9 (Handover, Service Requests, Reports) ----+
              |                                             |
              v                                             v
         Phase 10 (Integration Testing + Navigation + Polish)
```

---

## Phase 1: Conflict Resolution & Schema Foundation
**Dependencies:** none

**Description:**
Resolves the 4 identified conflicts (entity type enum, campaign approval status, meeting type/purpose, handover duplication) and adds all new sub-entity tables for leads and prospects, plus supporting tables (dedupe_rules, negative_list, dedupe_overrides). This phase touches only the schema file and is the foundation everything else depends on.

**Tasks:**

1. **Resolve Conflict #1 — entity_type enum**: Change `crm_entity_type` values from `['INDIVIDUAL', 'CORPORATE']` to `['INDIVIDUAL', 'NON_INDIVIDUAL']` at `packages/shared/src/schema.ts` line 4074. Update all usages in the file.

2. **Resolve Conflict #2 — campaign status enum**: Add `APPROVED`, `CLOSED`, `REJECTED` to `campaignStatusEnum` at line 4062. New values: `['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CLOSED', 'REJECTED']`. Add new campaign_type values: `SEASONAL`, `REFERRAL`, `CROSS_SELL`, `UP_SELL` to `campaignTypeEnum` at line 4060.

3. **Resolve Conflict #3 — meeting type/purpose**: Add `meetingModeEnum` with values `['IN_PERSON', 'PHONE', 'VIDEO', 'BRANCH_VISIT']`. Update `meetingTypeEnum` at line 4092 to BRD purpose categories: `['CAMPAIGN_FOLLOW_UP', 'PRODUCT_PRESENTATION', 'SERVICE_REVIEW', 'RELATIONSHIP_BUILDING', 'GENERAL']`. Add `mode` column using `meetingModeEnum` to `meetings` table. Add `reminder_minutes`, `notes`, `cancel_reason` columns to `meetings`. Add `related_entity_type` and `related_entity_id` columns for polymorphic entity reference.

4. **Resolve Conflict #4 — handover duplication**: Add a comment at `rmHandovers` table (line 4370) marking it `@deprecated — use handovers table from HAM module (line 4930)`. No structural changes needed; routing changes happen in Phase 9.

5. **Extend lead_status enum** at line 4066: Add `CLIENT_ACCEPTED`, `NOT_INTERESTED`, `DO_NOT_CONTACT`. New values: `['NEW', 'CONTACTED', 'QUALIFIED', 'CLIENT_ACCEPTED', 'CONVERTED', 'NOT_INTERESTED', 'DO_NOT_CONTACT', 'DROPPED']`.

6. **Extend lead_source enum** at line 4070: Replace with BRD values: `['CAMPAIGN', 'MANUAL', 'UPLOAD', 'REFERRAL', 'WALK_IN', 'WEBSITE']`.

7. **Extend leads table** at line 4174: Add columns: `lead_number` (alias for lead_code), `middle_name`, `short_name`, `entity_name`, `date_of_birth`, `gender`, `nationality`, `country_of_residence`, `marital_status`, `occupation`, `industry`, `country_code`, `primary_contact_no`, `fixed_line_no`, `gross_monthly_income`, `estimated_aum`, `aum_currency`, `trv`, `trv_currency`, `risk_appetite`, `classification`, `politically_exposed`, `referral_type`, `referral_id`, `branch_id`, `converted_prospect_id`, `conversion_date`, `drop_reason`, `deleted_at`.

8. **Extend prospect_status enum** at line 4088: Replace with `['ACTIVE', 'DROPPED', 'REACTIVATED', 'RECOMMENDED', 'CONVERTED']`.

9. **Extend prospects table** at line 4252: Add columns: `prospect_number` (alias for prospect_code), `country_of_residence`, `marital_status`, `country_code`, `primary_contact_no`, `fixed_line_no`, `gross_monthly_income`, `aum_currency`, `trv`, `trv_currency`, `risk_profile_comments`, `referral_type`, `referral_id`, `branch_id`, `cif_number`, `drop_date`, `reactivation_date`, `ageing_days`, `deleted_at`. Rename `lead_id` to `source_lead_id` (or add `source_lead_id` as alias column).

10. **Extend campaigns table** at line 4137: Add columns: `channel` (new enum `campaign_channel_enum` with `EMAIL/SMS/MIXED`), `campaign_manager_id` (FK to users), `advertisement_cost`, `campaign_cost`, `email_subject`, `email_body`, `email_signature`, `sms_content`, `brochure_paths` (JSONB array), `deleted_at`.

11. **Extend campaign_responses table** at line 4216: Add columns: `list_member_id` (FK to lead_list_members), `follow_up_action`. Update `responseTypeEnum` at line 4078 to add `NO_RESPONSE`, `CALLBACK_REQUESTED`.

12. **Extend lead_lists table** at line 4162: Add columns: `source_rule_id` (FK), `is_active`. Update `listSourceEnum` at line 4076 to add `MERGE`.

13. **Extend lead_list_members table** at line 4198: Add columns: `external_name`, `external_email`, `external_phone`, `external_data` (JSONB), `is_removed`.

14. **Extend call_reports table** at line 4327: Add columns: `report_number`, `report_type` (enum `SCHEDULED/STANDALONE`), `related_entity_type`, `related_entity_id`, `discussion_summary`, `follow_up_report_id`, `return_reason`. Update `callReportStatusEnum` to replace `REJECTED` with `RETURNED`.

15. **Extend meeting_invitees table** at line 4314: Add column: `is_required`.

16. **Create 5 lead sub-entity tables**: `lead_family_members`, `lead_addresses`, `lead_identifications`, `lead_lifestyle`, `lead_documents` — each with `lead_id` FK and BRD-specified columns.

17. **Create 5 prospect sub-entity tables**: `prospect_family_members`, `prospect_addresses`, `prospect_identifications`, `prospect_lifestyle`, `prospect_documents` — each with `prospect_id` FK and identical structure to lead counterparts.

18. **Create supporting tables**: `dedupe_rules` (entity_type, person_type, field_combination, stop_type enum SOFT_STOP/HARD_STOP, priority, is_active), `negative_list` (list_type enum NEGATIVE/BLACKLIST/SANCTIONS/PEP, identity fields, reason, source, effective/expiry dates), `dedupe_overrides` (entity references, matched entity, triggering rule, override reason/user).

19. **Create additional tables**: `conversion_history` (source/target entity type/ID, campaign link, converting user, timestamp, notes), `upload_logs` (upload_type enum LEAD_LIST/PROSPECT/NEGATIVE_LIST, file details, error_details JSONB, started_at/completed_at), `rm_history` (entity_type/ID, previous/new RM, change_type enum INITIAL_ASSIGNMENT/HANDOVER/DELEGATION/DELEGATION_RETURN, linked handover, effective_date).

20. **Add database indexes**: Create indexes on `leads.assigned_rm_id`, `leads.lead_status`, `leads.lead_code`, `prospects.assigned_rm_id`, `prospects.prospect_status`, `prospects.prospect_code`, `meetings.organizer_user_id`, `meetings.start_time`, `call_reports.filed_by`, `call_reports.report_status`, `negative_list.email`, `negative_list.phone`, `negative_list.id_number`.

21. **Add Drizzle relations** for all new tables: lead sub-entities reference `leads`, prospect sub-entities reference `prospects`, dedupe_overrides references dedupe_rules, conversion_history references leads/prospects/users.

**Files to create/modify:**
- `packages/shared/src/schema.ts` — All enum changes, table extensions, new table definitions, indexes, relations

**Acceptance criteria:**
- All 4 conflicts are resolved with BRD-compatible values
- 10 new sub-entity tables (5 lead, 5 prospect) exist with correct FKs
- 6 supporting tables (dedupe_rules, negative_list, dedupe_overrides, conversion_history, upload_logs, rm_history) exist
- All existing CRM tables have BRD-required columns added
- All enum values match BRD specification
- TypeScript compiles without errors (`npx tsc --noEmit`)

---

## Phase 2: Lead & Prospect Services + API
**Dependencies:** Phase 1

**Description:**
Implements the core lead and prospect CRUD business logic with status lifecycle state machines, auto-numbering, field validation, RM ownership, and conversion workflows. Creates dedicated service files split from the existing campaign-service.ts and registers custom API routes.

**Tasks:**

1. **Create `server/services/lead-service.ts`**: Implement lead CRUD with:
   - Auto-generation of `lead_number` in `L-XXXXXXXX` format (refactor from `campaign-service.ts` line 37)
   - Status lifecycle state machine: NEW -> CONTACTED -> QUALIFIED -> CLIENT_ACCEPTED -> CONVERTED (via conversion only); NEW/CONTACTED/QUALIFIED -> NOT_INTERESTED; any -> DO_NOT_CONTACT (terminal); any non-terminal -> DROPPED with mandatory `drop_reason`
   - RM ownership filtering (own leads for RM, team leads for SRM, all for BranchMgr)
   - Sub-entity CRUD (family members, addresses, identifications, lifestyle, documents)
   - Field locking when status is CONVERTED (only `notes` editable)
   - Age validation (>= 18 for Individual)
   - Lead list filtering with multi-status, AUM range, date range, 20-per-page pagination
   - Zod validation schemas for all input fields per BRD spec

2. **Create `server/services/prospect-service.ts`**: Implement prospect CRUD with:
   - Auto-generation of `prospect_number` in `P-XXXXXXXX` format (refactor from `campaign-service.ts` line 41)
   - Status lifecycle: ACTIVE -> DROPPED (mandatory drop_reason, min 10 chars, sets drop_date) -> REACTIVATED (sets reactivation_date) -> RECOMMENDED (mandatory field validation) -> CONVERTED
   - RM ownership filtering identical to leads
   - Sub-entity CRUD (family, addresses, identifications, lifestyle, documents)
   - Classification tier logic (Bronze/Silver/Gold/Platinum/Titanium based on AUM)
   - Ageing indicator calculation (green < 30d, yellow 30-60d, red > 60d from creation)
   - Bulk prospect upload with per-record validation and error reporting

3. **Create `server/services/conversion-service.ts`**: Implement:
   - Lead-to-Prospect conversion: verify CLIENT_ACCEPTED status, copy all lead data + sub-tables (family, addresses, identifications, lifestyle, documents) to prospect equivalents in atomic transaction, create `conversion_history` record, set lead status to CONVERTED with `converted_prospect_id` and `conversion_date`
   - Prospect-to-Customer mapping: verify RECOMMENDED status, non-destructive data merge (copy prospect fields only where customer field is empty), create `conversion_history` record, set prospect status to CONVERTED with `linked_customer_id`
   - Conversion funnel analytics: Leads -> Qualified -> Client Accepted -> Converted to Prospect -> Recommended -> Converted to Customer, with drop-off rates and average time per stage

4. **Refactor `server/services/campaign-service.ts`**: Remove lead/prospect CRUD logic that moves to dedicated services. Keep campaign lifecycle, analytics, and dispatch logic. Update imports.

5. **Create `server/routes/back-office/leads.ts`**: Custom lead endpoints beyond CRUD:
   - `POST /leads/:id/convert` — Lead-to-Prospect conversion (calls conversion-service)
   - `GET /leads/dashboard` — My Leads dashboard data with KPI tiles
   - Guard with `requireBackOfficeRole()`, add RM ownership checks

6. **Create `server/routes/back-office/prospects.ts`**: Custom prospect endpoints:
   - `POST /prospects/:id/drop` — Drop with mandatory reason
   - `POST /prospects/:id/reactivate` — Reactivate
   - `POST /prospects/:id/recommend` — Recommend for client conversion
   - `POST /prospects/:id/link-customer` — Prospect-to-Customer mapping
   - `POST /prospects/upload` — Bulk prospect upload
   - `GET /prospects/dashboard` — My Prospects dashboard data

7. **Register routes** in `server/routes.ts`: Import and mount lead/prospect routers at `/api/v1/lead-mgmt` and `/api/v1/prospect-mgmt`.

8. **Update CRUD routers** in `server/routes/back-office/index.ts`: Update `leads` CRUD router (line 470) to add new searchable columns. Update `prospects` CRUD router (line 519) similarly.

9. **Create `tests/e2e/lead-prospect-lifecycle.spec.ts`**: Test lead status transitions, prospect lifecycle, conversion flows, ownership filtering, field locking, validation rules.

**Files to create/modify:**
- `server/services/lead-service.ts` — New: lead CRUD, lifecycle, sub-entities
- `server/services/prospect-service.ts` — New: prospect CRUD, lifecycle, sub-entities
- `server/services/conversion-service.ts` — New: conversion workflows, funnel analytics
- `server/services/campaign-service.ts` — Modify: remove lead/prospect logic, update imports
- `server/routes/back-office/leads.ts` — New: custom lead endpoints
- `server/routes/back-office/prospects.ts` — New: custom prospect endpoints
- `server/routes/back-office/index.ts` — Modify: update CRUD router configs
- `server/routes.ts` — Modify: mount new routers
- `tests/e2e/lead-prospect-lifecycle.spec.ts` — New: lifecycle tests

**Acceptance criteria:**
- Lead CRUD works with all BRD fields and auto-numbering
- Lead status transitions follow the full BRD state machine (including DO_NOT_CONTACT terminal state)
- Prospect CRUD works with classification, ageing, and all BRD fields
- Lead-to-Prospect conversion copies all sub-table data atomically
- Prospect-to-Customer mapping performs non-destructive merge
- conversion_history records are created on every conversion
- RM ownership filtering restricts data access correctly
- All tests pass

---

## Phase 3: Dedupe Engine & Negative List Screening
**Dependencies:** Phase 1

**Description:**
Implements the configurable deduplication engine (replacing the simple hash-based approach) and negative list screening service with Levenshtein fuzzy matching. These are standalone services that Phase 2 and Phase 5 integrate with but do not block.

**Tasks:**

1. **Create `server/services/dedupe-service.ts`**: Implement configurable dedupe engine:
   - Load active `dedupe_rules` ordered by priority
   - For each rule, check field_combination match (e.g., first_name+last_name+email, entity_name+phone)
   - Support INDIVIDUAL and NON_INDIVIDUAL person types with different field combinations
   - HARD_STOP: block entity creation entirely, return matched entity details
   - SOFT_STOP: warn user, allow override with mandatory reason (creates `dedupe_overrides` record)
   - Cross-entity dedupe: check against leads AND prospects AND clients tables
   - Standalone endpoint: `POST /api/v1/dedupe-check` with entity data payload, returns matches with stop type
   - Performance target: < 2s for 500K record check (use indexed columns, limit result set)

2. **Create `server/services/negative-list-service.ts`**: Implement screening:
   - Match against `negative_list` table by list_type (NEGATIVE/BLACKLIST/SANCTIONS/PEP)
   - Exact matching on email, phone, ID number
   - Fuzzy name matching using Levenshtein distance <= 2 (implement in SQL with `levenshtein()` function from pg_trgm or application-level)
   - Hard-stop on any match: block entity creation
   - Return matched records with match type and confidence score
   - CRUD for negative list entries: add, edit, deactivate, bulk upload from CSV
   - Standalone endpoint: `POST /api/v1/blacklist-check`

3. **Create `server/routes/back-office/negative-list.ts`**: Endpoints:
   - `GET /negative-list` — List entries with filters (type, status, search)
   - `POST /negative-list` — Add entry
   - `PATCH /negative-list/:id` — Edit entry
   - `POST /negative-list/upload` — Bulk upload from CSV/Excel
   - `POST /negative-list/check` — Standalone screening check

4. **Create `tests/e2e/dedupe-negative-list.spec.ts`**: Test hard-stop blocking, soft-stop with override, cross-entity dedupe, Levenshtein matching, negative list CRUD.

**Files to create/modify:**
- `server/services/dedupe-service.ts` — New: configurable dedupe engine
- `server/services/negative-list-service.ts` — New: screening with fuzzy matching
- `server/routes/back-office/negative-list.ts` — New: negative list CRUD + check endpoints
- `server/routes.ts` — Modify: mount negative-list router
- `tests/e2e/dedupe-negative-list.spec.ts` — New: dedupe and screening tests

**Acceptance criteria:**
- Dedupe rules are loaded from DB and evaluated in priority order
- Hard-stop prevents entity creation; soft-stop allows override with reason
- Cross-entity dedupe checks leads, prospects, and clients tables
- Negative list screening matches on exact email/phone/ID and fuzzy name (Levenshtein <= 2)
- Negative list CRUD and bulk upload work correctly
- Dedupe check completes within 2s for single-record operations
- All tests pass

---

## Phase 4: Lead & Prospect UI
**Dependencies:** Phase 2, Phase 3

**Description:**
Builds the front-end pages for lead and prospect management: 7-tab creation forms, My Leads/My Prospects dashboards with card-based grids, dedupe check modals, and the RM workspace landing page.

**Tasks:**

1. **Create `apps/back-office/src/pages/crm/lead-form.tsx`**: 7-tab lead creation/edit form:
   - Tab 1: Lead Information (type, salutation, name fields, DOB, gender, nationality, etc.)
   - Tab 2: Family Members (dynamic list with add/remove)
   - Tab 3: Address/Contact (multi-address with type selector, phone numbers)
   - Tab 4: Identification (ID documents with type, number, issue/expiry dates)
   - Tab 5: Lifestyle (hobbies, cuisine, sports, clubs, special dates, communication preference)
   - Tab 6: Documents (file upload with type, drag-and-drop)
   - Tab 7: Preferences (product interests, risk appetite, communication consent)
   - Confirm button triggers dedupe check -> negative list check -> save
   - Uses shadcn/ui Tabs, form components, and toast notifications

2. **Create `apps/back-office/src/pages/crm/lead-dashboard.tsx`**: My Leads dashboard:
   - KPI tiles: Total Leads, New, Contacted, Qualified, Converted this month
   - Card-based grid (not table) with: name, lead number, status badge, source, AUM, assigned RM, created date
   - Per-card actions: View, Edit, Schedule Meeting, File Call Report, Convert
   - Filters: search by name/number/ID, multi-select status, source, date range, AUM range
   - Sort: name, date, AUM, status
   - Pagination: 20 per page
   - "Add Lead" button opens lead-form

3. **Create `apps/back-office/src/pages/crm/prospect-form.tsx`**: 7-tab prospect form:
   - Same structure as lead form with additional fields: classification tier, TRV, risk_profile, risk_profile_comments, CIF number
   - Pre-population from lead data when converting

4. **Update `apps/back-office/src/pages/crm/prospect-manager.tsx`**: Enhance existing page:
   - Switch from table layout to card-based grid per BRD
   - Add ageing indicator (green/yellow/red dot based on days since creation)
   - Add classification filter, TRV range filter
   - Add per-card actions: View, Edit, Drop, Recommend, Schedule Meeting, File Call Report
   - Add Dropped sub-tab with reactivation button
   - Add "Add Prospect" button that opens prospect-form

5. **Create `apps/back-office/src/components/crm/dedupe-modal.tsx`**: Reusable dedupe check modal:
   - Hard-stop variant: red border, "Duplicate Found" title, matched entity details, only Cancel button
   - Soft-stop variant: yellow border, "Possible Duplicate" title, matched entity details, "Override with Reason" text input + Proceed button, Cancel button
   - Used by both lead-form and prospect-form

6. **Create `apps/back-office/src/pages/crm/rm-workspace.tsx`**: RM workspace landing page (My Space):
   - Count tiles: My Leads, My Prospects, Meetings Today, Pending Tasks, Pipeline Value
   - Quick actions: Add Lead, Add Prospect, Schedule Meeting, File Call Report
   - Recent activity feed (last 10 activities)
   - Pipeline summary chart (mini funnel)

7. **Register new routes** in `apps/back-office/src/routes/index.tsx`: Add lazy imports and route entries for lead-form, lead-dashboard, prospect-form, rm-workspace.

**Files to create/modify:**
- `apps/back-office/src/pages/crm/lead-form.tsx` — New: 7-tab lead form
- `apps/back-office/src/pages/crm/lead-dashboard.tsx` — New: My Leads dashboard
- `apps/back-office/src/pages/crm/prospect-form.tsx` — New: 7-tab prospect form
- `apps/back-office/src/pages/crm/prospect-manager.tsx` — Modify: card layout, filters, actions
- `apps/back-office/src/components/crm/dedupe-modal.tsx` — New: dedupe check modal
- `apps/back-office/src/pages/crm/rm-workspace.tsx` — New: RM workspace
- `apps/back-office/src/routes/index.tsx` — Modify: add new route entries

**Acceptance criteria:**
- Lead creation form has all 7 tabs with correct fields per BRD
- Lead form triggers dedupe then negative list check before saving
- Dedupe modal shows hard-stop (red) or soft-stop (yellow) variants correctly
- My Leads dashboard displays card-based grid with all filters, sort, and pagination
- Prospect form has 7 tabs with classification/TRV/risk fields
- Prospect manager uses card layout with ageing indicators and per-card actions
- RM workspace shows count tiles and quick actions
- All pages render without console errors

---

## Phase 5: Campaign & List Schema Extensions + Services
**Dependencies:** Phase 1, Phase 2

**Description:**
Implements BRD Phase 2 functionality: lead rule engine with configurable criteria, lead list management enhancements, campaign lifecycle fixes (APPROVED status, scheduled activation, rejection), campaign dashboard analytics (ROI, funnel, cost per lead), and conversion history tracking.

**Tasks:**

1. **Create `lead_rules` table** in schema (if not done in Phase 1): `id`, `rule_name`, `criteria_name`, `criteria_json` (recursive tree structure supporting AND/OR/NOT operators), `is_active`, `last_generated_at`, `last_generated_count`, `...auditFields`.

2. **Create `opportunities` table** in schema: `id`, `opportunity_code`, `name`, `lead_id`, `prospect_id`, `client_id`, `campaign_id`, `call_report_id`, `product_type`, `pipeline_value`, `pipeline_currency`, `probability`, `stage` (enum: IDENTIFIED/QUALIFYING/PROPOSAL/NEGOTIATION/WON/LOST), `expected_close_date`, `loss_reason`, `won_date`, `...auditFields`.

3. **Update `server/services/campaign-service.ts`**: Fix campaign approval workflow:
   - `approve()`: Set status to `APPROVED` (not `ACTIVE`). On rejection, set status to `REJECTED` (not `DRAFT`).
   - Add `reject()` method: separate from approve, sets `REJECTED` status with mandatory reason.
   - Add `getDashboardStats()` enhancements: ROI calculation = (revenue from converted leads - campaign cost) / campaign cost, cost per lead, pipeline value aggregation, response breakdown data for pie chart, conversion funnel data.
   - Add `listResponses(campaignId)`: paginated list of campaign responses.

4. **Create `server/services/campaign-activation-job.ts`**: Scheduled daily job (06:00):
   - Find all campaigns with status `APPROVED` where `start_date <= today`
   - Set status to `ACTIVE`
   - Trigger campaign dispatch (email/SMS to target list members)
   - Find all campaigns with status `ACTIVE` where `end_date < today`
   - Set status to `COMPLETED`

5. **Enhance `server/services/campaign-service.ts` dispatch**: Add:
   - Template substitution: `{{lead_name}}`, `{{rm_name}}`, `{{campaign_name}}`
   - Unsubscribe link inclusion in every email
   - Rate limiting: 100 email/min, 50 SMS/min
   - Retry with exponential backoff (3 retries)
   - Initialize `NO_RESPONSE` for all target list members on dispatch

6. **Create `server/services/lead-rule-service.ts`**: Lead Rule Engine:
   - CRUD for `lead_rules` entity
   - Criteria JSON tree evaluator: supports AND/OR/NOT operators, field conditions (EQ, GT, LT, GTE, LTE, CONTAINS, IN, BETWEEN), max 5 nesting levels, max 20 conditions
   - Preview match count (dry-run without creating list)
   - Generate list: execute criteria against clients table, create/update lead_list with source_type=RULE and source_rule_id FK
   - Refactor from existing `leadListService.executeRule()` in `campaign-service.ts` line 243

7. **Enhance lead list management**: In lead service or new lead-list-service:
   - Upload endpoint: CSV/Excel parsing, intra-file dedupe (Name+Email, Name+Phone), upload_logs creation, async processing for large files (>1000 rows)
   - Merge endpoint: already EXISTS, keep existing implementation
   - Delete with active campaign check: block delete if list is assigned to an ACTIVE or APPROVED campaign
   - Member-level drill-down with remove action

8. **Add conversion history endpoints**: In `server/routes/back-office/leads.ts` or new `conversion.ts`:
   - `GET /conversion-history` — paginated list with filters (date range, RM, branch, campaign, type)
   - `GET /conversion-history/funnel` — funnel analytics data

9. **Register new routes** for lead-rules, campaign reject, campaign responses list, conversion history.

10. **Create `tests/e2e/campaign-lifecycle.spec.ts`**: Test campaign approval -> APPROVED -> scheduled activation -> ACTIVE, rejection -> REJECTED, copy, analytics, ROI, dispatch with template substitution, lead rule criteria evaluation.

**Files to create/modify:**
- `packages/shared/src/schema.ts` — Modify: add lead_rules, opportunities tables if not in Phase 1
- `server/services/campaign-service.ts` — Modify: fix approval, add reject, enhance analytics
- `server/services/campaign-activation-job.ts` — New: scheduled activation/completion job
- `server/services/lead-rule-service.ts` — New: rule CRUD, criteria evaluator, list generation
- `server/routes/back-office/campaigns.ts` — Modify: add reject endpoint, responses list
- `server/routes/back-office/leads.ts` — Modify: add conversion history endpoints
- `server/routes.ts` — Modify: mount any new routers
- `tests/e2e/campaign-lifecycle.spec.ts` — New: campaign and rule engine tests

**Acceptance criteria:**
- Campaign approval sets status to APPROVED (not ACTIVE)
- Campaign rejection sets status to REJECTED with mandatory reason
- Scheduled activation job activates APPROVED campaigns on start_date
- Campaign dashboard returns ROI, cost per lead, pipeline value, funnel data
- Lead rule criteria builder supports AND/OR/NOT with up to 5 nesting levels
- Lead rule preview returns match count without creating list
- Lead list upload handles CSV/Excel with intra-file dedupe
- Conversion history endpoint returns paginated results with funnel analytics
- All tests pass

---

## Phase 6: Campaign UI + Lead Rule Builder
**Dependencies:** Phase 4, Phase 5

**Description:**
Builds the campaign definition 5-tab form, enhances the campaign dashboard with BRD-required analytics, and creates the visual lead rule builder UI.

**Tasks:**

1. **Create `apps/back-office/src/pages/crm/campaign-form.tsx`**: 5-tab campaign definition form:
   - Tab 1: General (name, type, channel, start/end date, status)
   - Tab 2: Financial (budget, currency, advertisement cost, campaign cost)
   - Tab 3: Admin (lead list selector with search, campaign manager assignment)
   - Tab 4: Campaign Notes (rich text email body using a textarea or basic rich editor, SMS content, email subject, email signature)
   - Tab 5: Brochure (multi-file upload with drag-and-drop, file type/size validation)
   - Campaign code auto-generated as `CMP-XXXXX`

2. **Update `apps/back-office/src/pages/crm/campaign-dashboard.tsx`**: Enhance existing:
   - Add BRD-required columns: Code, Name, Type, Channel, Status badge (color-coded), dates, Manager, Budget, Leads Count
   - Add Delete action (soft delete)
   - Add "View Dashboard" action navigating to campaign analytics page
   - Add rejection flow (separate from approve) with reason dialog

3. **Update `apps/back-office/src/pages/crm/campaign-analytics.tsx`**: Enhance existing:
   - Add response breakdown pie chart (using recharts or similar)
   - Add conversion funnel chart
   - Add ROI calculation display
   - Add cost per lead metric
   - Add pipeline value from linked opportunities
   - Add drill-down from chart segments to lead list

4. **Create `apps/back-office/src/pages/crm/lead-rule-builder.tsx`**: Visual rule builder:
   - Criteria tree visualization (nested AND/OR/NOT groups)
   - Condition builder: field dropdown (age, AUM, risk_profile, branch, product_interest, etc.), operator dropdown (equals, greater than, contains, in, between), value input
   - Action buttons: Add Rule, Add Group, NOT toggle, Invert, Delete, Reset, Copy
   - Human-readable preview panel showing the rule in plain English
   - Preview Match Count button (calls API, shows count without generating list)
   - Generate List button (calls API, creates lead_list)
   - Max 5 nesting levels, max 20 conditions enforcement in UI

5. **Update `apps/back-office/src/pages/crm/lead-list-manager.tsx`**: Enhance existing:
   - Add member-level drill-down with remove action
   - Add upload dialog with CSV/Excel file picker, validation preview, error summary
   - Add source badge formatting per BRD (RULE=blue, UPLOAD=green, MANUAL=gray, MERGE=purple)
   - Add active campaign usage check on delete (show warning dialog)

6. **Create `apps/back-office/src/pages/crm/conversion-history.tsx`**: Conversion history screen:
   - Table: type (Lead->Prospect / Prospect->Customer), source entity, target entity, campaign, RM, date
   - Filters: date range, RM, branch, campaign, product interest
   - Funnel chart: Leads -> Qualified -> Client Accepted -> Converted to Prospect -> Recommended -> Converted to Customer
   - Drill-down from funnel stages to individual records

7. **Register new routes** in `apps/back-office/src/routes/index.tsx`.

**Files to create/modify:**
- `apps/back-office/src/pages/crm/campaign-form.tsx` — New: 5-tab campaign form
- `apps/back-office/src/pages/crm/campaign-dashboard.tsx` — Modify: BRD columns, delete, rejection
- `apps/back-office/src/pages/crm/campaign-analytics.tsx` — Modify: pie chart, funnel, ROI, pipeline
- `apps/back-office/src/pages/crm/lead-rule-builder.tsx` — New: visual rule builder
- `apps/back-office/src/pages/crm/lead-list-manager.tsx` — Modify: member drill-down, upload, badges
- `apps/back-office/src/pages/crm/conversion-history.tsx` — New: conversion history + funnel
- `apps/back-office/src/routes/index.tsx` — Modify: add new route entries

**Acceptance criteria:**
- Campaign form has 5 tabs with all BRD fields including multi-file brochure upload
- Campaign dashboard shows BRD-required columns with color-coded status badges
- Campaign analytics displays pie chart, funnel, ROI, cost per lead
- Lead rule builder supports nested AND/OR/NOT groups with up to 5 levels
- Rule preview shows match count; generate creates a list
- Lead list manager shows member drill-down and handles CSV upload
- Conversion history displays table and funnel chart with filters
- All pages render without console errors

---

## Phase 7: Calendar, Meetings, Call Reports
**Dependencies:** Phase 2

**Description:**
Implements BRD Phase 3 engagement tools: full calendar with Day/Week/Month views, meeting CRUD with reminders and invitee notifications, call report filing with meeting pre-population, approval workflow (submit/approve/return), and 48-hour filing deadline enforcement.

**Tasks:**

1. **Create `server/services/meeting-service.ts`**: Meeting management:
   - Create meeting with invitee notification (in-app), RSVP initialization (all PENDING), end_time > start_time validation
   - Reschedule with notification to all invitees
   - Cancel with mandatory `cancel_reason`, notification to invitees, block cancel for past meetings
   - Calendar data formatting: group meetings by day/week/month for calendar views
   - Team calendar for SRM: aggregate meetings from all team RMs
   - Reminder scheduling: configurable `reminder_minutes`, trigger in-app notification before meeting

2. **Create `server/services/call-report-service.ts`**: Call report management:
   - Create: auto-generate `report_number`, if type=SCHEDULED pre-populate from meeting data, update meeting status to COMPLETED
   - Submit: explicit submission for approval workflow, status DRAFT -> SUBMITTED
   - Approve: SRM/BranchMgr approval, status SUBMITTED -> APPROVED, set approved_by/at, notify RM
   - Return: mandatory `return_reason`, status SUBMITTED -> RETURNED, notify RM. Returned reports can be modified and resubmitted
   - 48-hour filing deadline: check if meeting date + 48h has passed without a call report; send reminder notification
   - Auto-submit: DRAFT reports automatically change to SUBMITTED when meeting date has passed
   - 5-day escalation: reports not approved within 5 days auto-escalate to Branch Manager
   - Structured action items (JSONB array on call_report, plus optionally create `action_items` records for backward compatibility)

3. **Create `server/routes/back-office/meetings.ts`**: Custom meeting endpoints beyond CRUD:
   - `GET /meetings/calendar` — Calendar-formatted data (day/week/month view)
   - `POST /meetings/:id/cancel` — Cancel with reason
   - `POST /meetings/:id/reschedule` — Reschedule with notification

4. **Create `server/routes/back-office/call-reports.ts`**: Custom endpoints:
   - `POST /call-reports/:id/submit` — Submit for approval
   - `POST /call-reports/:id/approve` — SRM approval
   - `POST /call-reports/:id/return` — Return with reason
   - `GET /call-reports/pending-approval` — SRM queue of pending reports

5. **Update `apps/back-office/src/pages/crm/meetings-calendar.tsx`**: Enhance existing:
   - Add full calendar widget with Day/Week/Month views (use a React calendar library or custom grid)
   - Color-coded meeting blocks by meeting type/mode
   - Click-date-to-add: clicking a date opens meeting creation form
   - Sidebar: upcoming meetings list
   - SRM team calendar toggle (show all team members' meetings)
   - Cancel meeting dialog with mandatory reason

6. **Create `apps/back-office/src/pages/crm/call-report-form.tsx`**: Standalone call report form:
   - Meeting pre-population for SCHEDULED type (auto-fill from selected meeting)
   - Fields: subject, discussion_summary, topics_discussed, products_discussed, outcome, follow_up
   - Structured action items table: item description, owner (dropdown), due_date
   - "Add Opportunity" button to create opportunity from call report context
   - Save as Draft / Submit / Cancel buttons
   - SRM approval view: Approve/Return buttons with return_reason dialog

7. **Register routes** in `server/routes.ts` and `apps/back-office/src/routes/index.tsx`.

8. **Create `tests/e2e/meeting-callreport.spec.ts`**: Test meeting CRUD, cancel with reason, reschedule notifications, call report lifecycle (draft->submit->approve/return), 48h deadline, auto-submit, escalation.

**Files to create/modify:**
- `server/services/meeting-service.ts` — New: meeting CRUD, calendar, reminders
- `server/services/call-report-service.ts` — New: call report lifecycle, approval, deadlines
- `server/routes/back-office/meetings.ts` — New: custom meeting endpoints
- `server/routes/back-office/call-reports.ts` — New: call report lifecycle endpoints
- `apps/back-office/src/pages/crm/meetings-calendar.tsx` — Modify: full calendar, team view
- `apps/back-office/src/pages/crm/call-report-form.tsx` — New: standalone call report form
- `server/routes.ts` — Modify: mount new routers
- `apps/back-office/src/routes/index.tsx` — Modify: add new route entries
- `tests/e2e/meeting-callreport.spec.ts` — New: meeting and call report tests

**Acceptance criteria:**
- Calendar displays Day/Week/Month views with color-coded meeting blocks
- Click-date opens meeting creation form
- Meeting cancel requires reason and notifies invitees
- Call report auto-populates from meeting for SCHEDULED type
- Call report submit/approve/return workflow functions correctly
- Returned reports can be edited and resubmitted
- 48h deadline check identifies overdue meetings
- Auto-submit changes DRAFT to SUBMITTED after meeting date
- SRM team calendar shows all team members' meetings
- All tests pass

---

## Phase 8: Opportunity Pipeline, Tasks, Notifications
**Dependencies:** Phase 7

**Description:**
Implements opportunity/pipeline tracking, standalone task management, and the user-facing notification system with read/unread tracking. These are supporting features from BRD Phase 3.

**Tasks:**

1. **Create `notifications` table** in schema (if not done earlier): `id`, `recipient_user_id` (FK to users), `type` (enum: MEETING_REMINDER, TASK_DUE, TASK_ASSIGNED, CALL_REPORT_RETURNED, HANDOVER_PENDING, SLA_BREACH, CAMPAIGN_APPROVED, LEAD_ASSIGNED, etc.), `title`, `message`, `channel` (IN_APP/EMAIL/SMS), `related_entity_type`, `related_entity_id`, `is_read`, `read_at`, `...auditFields`.

2. **Create `tasks` table** in schema (if not done earlier): `id`, `task_code`, `title`, `description`, `task_type`, `priority` (LOW/MEDIUM/HIGH/CRITICAL), `due_date`, `reminder_date`, `assigned_to` (FK users), `assigned_by` (FK users), `related_entity_type`, `related_entity_id`, `task_status` (enum: PENDING/IN_PROGRESS/COMPLETED/CANCELLED), `completed_at`, `completion_notes`, `...auditFields`.

3. **Create `server/services/opportunity-service.ts`**: Opportunity pipeline:
   - CRUD with auto-generated `opportunity_code`
   - Stage progression: IDENTIFIED -> QUALIFYING -> PROPOSAL -> NEGOTIATION -> WON/LOST
   - Mandatory `loss_reason` for LOST stage
   - WON opportunities contribute to campaign ROI if linked to campaign
   - Pipeline dashboard data: total value, by stage, by probability, by expected close date

4. **Create `server/services/task-service.ts`**: Task management:
   - CRUD with auto-generated `task_code`
   - Self-assigned or SRM-assigned (SRM can assign to team RMs)
   - Status flow: PENDING -> IN_PROGRESS -> COMPLETED/CANCELLED
   - Overdue detection: tasks past due_date with status != COMPLETED/CANCELLED
   - Reminder notifications at configured `reminder_date`

5. **Create `server/services/notification-inbox-service.ts`**: User notification inbox:
   - Create notification for specific user or role
   - List notifications for user (paginated, newest first)
   - Mark as read
   - Unread count
   - Event-triggered notification creation (called by other services): meeting reminder, task due, call report returned, handover pending, SLA breach, etc.
   - Integration point: other services call `notificationInboxService.notify()` to create user-visible notifications

6. **Create routes**: `server/routes/back-office/opportunities.ts`, `server/routes/back-office/tasks.ts`, add notification endpoints to existing routes or create `server/routes/back-office/notifications.ts`.

7. **Create UI pages**:
   - `apps/back-office/src/pages/crm/opportunity-pipeline.tsx`: Pipeline dashboard with stage columns (kanban-style or table), total pipeline value, probability-weighted value, filters by product/RM/date
   - `apps/back-office/src/pages/crm/task-manager.tsx`: Task list with filters (status, priority, due date, assigned to), create task form, status change actions
   - Notification bell icon in header with unread count badge (modify layout component)

8. **Register routes** in `server/routes.ts` and `apps/back-office/src/routes/index.tsx`.

9. **Create `tests/e2e/opportunity-task-notification.spec.ts`**: Test opportunity lifecycle, task assignment, notification creation and read marking.

**Files to create/modify:**
- `packages/shared/src/schema.ts` — Modify: add notifications, tasks, opportunity stage enum if not done
- `server/services/opportunity-service.ts` — New: opportunity pipeline CRUD
- `server/services/task-service.ts` — New: task management CRUD
- `server/services/notification-inbox-service.ts` — New: user notification inbox
- `server/routes/back-office/opportunities.ts` — New: opportunity endpoints
- `server/routes/back-office/tasks.ts` — New: task endpoints
- `server/routes/back-office/notifications.ts` — New: notification endpoints
- `apps/back-office/src/pages/crm/opportunity-pipeline.tsx` — New: pipeline dashboard
- `apps/back-office/src/pages/crm/task-manager.tsx` — New: task management page
- `apps/back-office/src/routes/index.tsx` — Modify: add new routes
- `server/routes.ts` — Modify: mount new routers
- `tests/e2e/opportunity-task-notification.spec.ts` — New: tests

**Acceptance criteria:**
- Opportunity pipeline tracks stages from IDENTIFIED through WON/LOST
- LOST requires mandatory loss_reason
- WON opportunities contribute to campaign ROI calculation
- Task CRUD works with assignment and status transitions
- Overdue tasks are detected and trigger notifications
- Notification inbox shows user-scoped notifications with unread count
- Marking notification as read updates is_read and read_at
- Pipeline dashboard displays value by stage
- All tests pass

---

## Phase 9: Handover, Service Requests, Reports
**Dependencies:** Phase 8

**Description:**
Implements BRD Phase 4 operations and governance features: RM handover/delegation consolidation on HAM module, service request SLA engine enhancement, and management reporting dashboards.

**Tasks:**

1. **Consolidate handover routing**: Map BRD API paths to HAM `handovers` implementation:
   - Create `server/routes/back-office/crm-handovers.ts` that wraps the HAM handover service with CRM-specific logic:
     - Multi-entity selection (leads, prospects, clients in one handover)
     - Maker-checker workflow: maker creates, checker authorizes/rejects
     - `POST /handovers/:id/authorize` endpoint for checker approval
     - `rm_history` record creation on every RM change
   - Delegation auto-expiry: scheduled job checks `end_date`, returns entities to original RM, creates `rm_history` records

2. **Enhance service request service** (`server/services/service-request-service.ts`):
   - Add BRD-required fields: `sla_hours`, `sla_breach_at`, `escalation_level`, `resolution_notes`, `resolved_at`, `closed_at`
   - Add `CRITICAL` priority with 1-day SLA
   - Implement auto-escalation: L1 at 75% SLA elapsed (notify resolver's manager), L2 at 100% breach (notify branch manager), L3 at 150% (notify regional head)
   - Status flow: NEW -> ASSIGNED -> IN_PROGRESS -> ESCALATED -> RESOLVED -> CLOSED / REJECTED

3. **Update handover UI** (`apps/back-office/src/pages/crm/rm-handover.tsx`):
   - 3-section expandable layout: Lead, Prospect, Client sections
   - Left/center/right panel design per BRD
   - Multi-select entity grid within each section
   - Pending issues text field
   - Checker authorization view: Approve/Reject buttons with reason dialog

4. **Update service request UI** (`apps/back-office/src/pages/service-request-workbench.tsx`):
   - Split view layout per BRD (list left, detail right)
   - Status timeline visualization
   - SLA breach indicators (color-coded progress bar)
   - Assign/Forward/Escalate action buttons
   - SLA-sorted resolution queue

5. **Create reporting dashboards**: Create `apps/back-office/src/pages/crm/crm-reports.tsx`:
   - RM Productivity Report: meetings held, call reports filed, leads converted, pipeline value per RM
   - Campaign Performance Report: by campaign — leads generated, responses, conversions, ROI
   - Pipeline Report: total pipeline by stage, by product, by RM, by branch
   - Conversion Funnel: Lead -> Prospect -> Customer conversion rates and average time
   - Prospect Ageing Report: prospects by ageing bucket (0-30, 31-60, 61-90, 90+)
   - SLA Compliance Report: service requests by SLA status, breach rate
   - Export to CSV/Excel for all reports

6. **Register routes** and update `server/routes.ts`.

7. **Create `tests/e2e/handover-sla.spec.ts`**: Test handover multi-entity, maker-checker, delegation auto-expiry, SLA escalation, rm_history records.

**Files to create/modify:**
- `server/routes/back-office/crm-handovers.ts` — New: CRM handover endpoints wrapping HAM
- `server/services/service-request-service.ts` — Modify: SLA engine, escalation
- `apps/back-office/src/pages/crm/rm-handover.tsx` — Modify: 3-section layout, multi-select, checker view
- `apps/back-office/src/pages/service-request-workbench.tsx` — Modify: split view, SLA indicators
- `apps/back-office/src/pages/crm/crm-reports.tsx` — New: management reporting dashboards
- `server/routes.ts` — Modify: mount CRM handover router
- `apps/back-office/src/routes/index.tsx` — Modify: add report route
- `tests/e2e/handover-sla.spec.ts` — New: handover and SLA tests

**Acceptance criteria:**
- Handover supports multi-entity selection (leads + prospects + clients in one request)
- Maker-checker workflow enforced: maker creates, checker authorizes
- Delegation auto-expiry returns entities to original RM on end_date
- rm_history records created for every RM assignment change
- SLA auto-escalation triggers at 75%, 100%, 150% thresholds
- Service request workbench shows SLA breach indicators
- All 6 reporting dashboards render with correct data
- All tests pass

---

## Phase 10: Integration Testing, Navigation & Polish
**Dependencies:** Phase 4, Phase 6, Phase 7, Phase 8, Phase 9

**Description:**
Final integration phase: adds CRM navigation to the sidebar, runs cross-cutting integration tests, verifies build, and polishes edge cases.

**Tasks:**

1. **Add CRM navigation section** to `apps/back-office/src/config/navigation.ts`:
   - Section: "CRM" (or "Lead & Prospect")
   - Items: RM Workspace (/crm/workspace), My Leads (/crm/leads), My Prospects (/crm/prospects), Calendar (/crm/calendar), Campaigns (/crm/campaigns), Lead Lists (/crm/lead-lists), Pipeline (/crm/pipeline), Tasks (/crm/tasks), Reports (/crm/reports), Handovers (/crm/handovers), Service Requests (/crm/service-requests)
   - Use appropriate lucide-react icons for each item

2. **Add CRM role guards** to `server/middleware/role-auth.ts`:
   - Define CRM-specific role requirements per BRD permissions matrix (Section 3)
   - RM: CRUD own leads/prospects, create meetings/call reports/tasks
   - SRM: view team data, approve call reports, assign tasks to team
   - BranchMgr: approve campaigns, view branch-wide data, authorize handovers
   - CampaignMgr: CRUD campaigns, manage lead lists/rules
   - Compliance: manage negative lists, review PEP flags
   - Apply to all CRM endpoints

3. **Create `tests/e2e/crm-integration.spec.ts`**: Cross-cutting integration tests:
   - Full lead-to-customer journey: create lead -> dedupe check -> qualify -> CLIENT_ACCEPTED -> convert to prospect -> recommend -> link to customer
   - Campaign lifecycle: create -> submit -> approve -> activate on start_date -> dispatch -> capture responses -> analytics
   - Meeting -> call report -> opportunity pipeline flow
   - Handover with maker-checker and rm_history
   - Service request with SLA escalation
   - Role-based access: RM cannot see other RM's leads, SRM can see team leads

4. **Build verification**: Run `npx tsc --noEmit` to verify TypeScript compilation. Run full test suite. Verify all new routes are correctly mounted.

5. **Polish**:
   - Ensure dark mode support on all new CRM pages (use existing theme tokens)
   - Verify responsive layout on tablet (768px-1279px) for key pages (lead dashboard, prospect manager, calendar)
   - Add ARIA labels to interactive elements for WCAG 2.1 AA compliance
   - Add optimistic locking (version column check) on lead, prospect, call_report updates to prevent concurrent edit conflicts

**Files to create/modify:**
- `apps/back-office/src/config/navigation.ts` — Modify: add CRM navigation section
- `server/middleware/role-auth.ts` — Modify: add CRM role guards
- `tests/e2e/crm-integration.spec.ts` — New: cross-cutting integration tests
- Various UI files — Modify: dark mode, responsive, ARIA labels

**Acceptance criteria:**
- CRM section appears in sidebar navigation with all items
- All CRM routes are accessible from navigation
- Role guards enforce BRD permissions matrix (RM sees own data, SRM sees team, etc.)
- Full lead-to-customer journey integration test passes
- Full campaign lifecycle integration test passes
- TypeScript compiles without errors
- All tests pass (unit + e2e)
- Dark mode renders correctly on all CRM pages
- No console errors in browser
