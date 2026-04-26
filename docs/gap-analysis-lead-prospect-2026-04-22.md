# Gap Analysis: Lead & Prospect Management Module
## Date: 2026-04-22
## BRD: docs/LeadProspect_BRD_v2_FINAL.docx

---

## Summary

| Metric | Count |
|--------|-------|
| Total requirement areas analyzed | 148 |
| Existing (no work needed) | 12 |
| Partial (modification needed) | 52 |
| Missing (new implementation) | 80 |
| Conflicts (resolution needed) | 4 |

The Lead & Prospect Management module is approximately **25% implemented** across the codebase. A core CRM foundation exists with schema tables for campaigns, leads, prospects, meetings, call reports, and handovers, plus corresponding routes, services, and UI pages. However, the existing implementation was built against an earlier CRM PAD (Product Adoption Document) specification and diverges significantly from the detailed BRD requirements in field-level structure, lifecycle states, business logic, and supporting entities. The BRD introduces 12+ new entities with no existing counterparts and demands substantial modifications to 10+ existing entities.

---

## Data Model Gaps

### Core Entities

| Entity | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| `leads` | **PARTIAL** | `packages/shared/src/schema.ts` line 4054 | Table exists but is **significantly simplified** vs BRD. Missing fields: `lead_number` (uses `lead_code`), `lead_type` (uses `entity_type` with values `INDIVIDUAL`/`CORPORATE` instead of `INDIVIDUAL`/`NON_INDIVIDUAL`), `middle_name`, `short_name`, `entity_name`, `date_of_birth`, `gender`, `nationality`, `country_of_residence`, `marital_status`, `occupation`, `industry`, `country_code`, `primary_contact_no` (uses `mobile_phone`), `fixed_line_no`, `gross_monthly_income`, `estimated_aum` (uses `total_aum`), `aum_currency`, `trv`, `trv_currency`, `risk_appetite`, `classification`, `politically_exposed`, `referral_type`, `referral_id`, `branch_id`, `converted_prospect_id`, `conversion_date`, `drop_reason`, `deleted_at`. Status values differ: existing has `NEW/CONTACTED/QUALIFIED/CONVERTED/DROPPED`; BRD requires `NEW/CONTACTED/QUALIFIED/CLIENT_ACCEPTED/CONVERTED/NOT_INTERESTED/DO_NOT_CONTACT`. Source values differ: existing has `CAMPAIGN/REFERRAL/WALK_IN/UPLOADED/SYSTEM_GENERATED`; BRD requires `CAMPAIGN/MANUAL/UPLOAD/REFERRAL/WALK_IN/WEBSITE`. |
| `prospects` | **PARTIAL** | `packages/shared/src/schema.ts` line 4133 | Table exists with many fields but has structural differences. Missing fields: `prospect_number` (uses `prospect_code`), `prospect_type` (uses `entity_type`), `source_lead_id` (uses `lead_id`), `country_of_residence`, `marital_status`, `country_code`, `primary_contact_no` (uses `mobile_phone`), `fixed_line_no`, `gross_monthly_income`, `aum_currency`, `trv_currency`, `risk_profile_comments`, `referral_type`, `referral_id`, `branch_id`, `cif_number`, `linked_customer_id` (uses `converted_client_id`), `drop_date`, `reactivation_date`, `ageing_days` (uses `days_since_creation`), `deleted_at`. Uses `classification` via `client_category` (text, not enum). Status enum differs: existing has `ACTIVE/DROPPED/REACTIVATED/RECOMMENDED_FOR_CLIENT`; BRD requires `ACTIVE/DROPPED/REACTIVATED/RECOMMENDED/CONVERTED`. |
| `campaigns` | **PARTIAL** | `packages/shared/src/schema.ts` line 4017 | Table exists but is **simplified**. Missing fields: `campaign_code` naming format (BRD: `CMP-XXXXX`), `channel` enum, `target_list_id` (single FK), `campaign_manager_id` (uses `owner_user_id`), `advertisement_cost`, `campaign_cost`, `email_subject`, `email_body`, `email_signature`, `sms_content`, `brochure_paths` (uses single `brochure_url`), `rejection_reason` exists but status values differ: existing has `DRAFT/PENDING_APPROVAL/ACTIVE/COMPLETED/ARCHIVED`; BRD requires `DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/COMPLETED/CLOSED/REJECTED`. Campaign type enum differs: existing has `EVENT/PRODUCT_PROMOTION`; BRD requires `EVENT/PRODUCT_PROMOTION/SEASONAL/REFERRAL/CROSS_SELL/UP_SELL`. Missing `deleted_at` for soft delete. |
| `campaign_responses` | **PARTIAL** | `packages/shared/src/schema.ts` line 4097 | Table exists. Missing fields: `list_member_id`, `captured_by_rm_id` (uses `assigned_rm_id`), `follow_up_action`. Response type enum differs: existing has `INTERESTED/NOT_INTERESTED/NEED_MORE_INFO/CONVERTED/OTHER`; BRD requires `INTERESTED/NOT_INTERESTED/NEED_MORE_INFO/CONVERTED/NO_RESPONSE/CALLBACK_REQUESTED`. |
| `meetings` | **PARTIAL** | `packages/shared/src/schema.ts` line 4175 | Table exists. Missing fields: `scheduled_date` / `start_time` / `end_time` as separate DATE+TIME (uses combined timestamps), `mode` enum (BRD: `IN_PERSON/PHONE/VIDEO/BRANCH_VISIT`; existing `meeting_type` has `IN_PERSON/VIRTUAL/PHONE`), `related_entity_type` + `related_entity_id` as polymorphic refs (existing uses separate `lead_id`/`prospect_id`/`client_id` FKs), `reminder_minutes`, `notes`, `cancel_reason`. Meeting type/purpose enums differ from BRD spec. |
| `meeting_invitees` | **PARTIAL** | `packages/shared/src/schema.ts` line 4195 | Table exists. Missing fields: `is_required`. Has extra fields not in BRD: `lead_id`, `prospect_id`, `client_id`, `attended`. RSVP status matches BRD. |
| `call_reports` | **PARTIAL** | `packages/shared/src/schema.ts` line 4207 | Table exists with good field coverage. Missing fields: `report_number` (uses `report_code`), `report_type` enum (`SCHEDULED/STANDALONE`), `related_entity_type` + `related_entity_id` as polymorphic refs (existing uses separate FKs), `discussion_summary` (uses `summary`), `action_items` as JSONB (existing uses separate `action_items` table which is better but different from BRD), `products_discussed` as VARCHAR (existing is JSONB array), `follow_up_report_id`, `return_reason`, `attachments` (uses `attachment_urls`). Status values differ: existing has `DRAFT/SUBMITTED/APPROVED/REJECTED`; BRD requires `DRAFT/SUBMITTED/APPROVED/RETURNED`. |
| `rm_handovers` | **PARTIAL** | `packages/shared/src/schema.ts` line 4251 | Table exists but simplified. Missing fields: `entity_ids` as JSONB array (existing handles single `entity_id`), `outgoing_rm_id` / `incoming_rm_id` (existing uses `from_rm_id` / `to_rm_id`), `effective_date` exists, `end_date` exists, `pending_issues`, `maker_id` / `checker_id` (existing uses `approved_by`), `checked_at`, `rejection_reason`. Status enum differs: existing uses `approvalStatusEnum` (`PENDING/APPROVED/REJECTED/CANCELLED`); BRD requires `PENDING_APPROVAL/APPROVED/REJECTED/EXECUTED/EXPIRED`. The HAM module (line 4930) has a more complete `handovers` table that is closer to BRD but still different. |
| `lead_lists` | **PARTIAL** | `packages/shared/src/schema.ts` line 4042 | Table exists. Missing fields: `source_rule_id` FK (uses inline `rule_definition` JSONB), `is_active`. Source type enum differs: existing has `RULE_BASED/UPLOADED/MANUAL`; BRD requires `RULE/UPLOAD/MANUAL/MERGE`. |
| `lead_list_members` | **PARTIAL** | `packages/shared/src/schema.ts` line 4079 | Table exists. Missing fields: `external_name`, `external_email`, `external_phone`, `external_data`, `is_removed`. Existing is a simple junction table; BRD requires richer fields to support upload records not yet converted to leads. |
| `service_requests` | **PARTIAL** | `packages/shared/src/schema.ts` line 5128 | Table exists with different field structure. Missing fields: `request_number` (uses `request_id`), `request_type` enum differs (existing has `REVIEW_PORTFOLIO/MULTIPLE_MANDATE_REGISTRATION/...`; BRD has `ADDRESS_CHANGE/KYC_UPDATE/PRODUCT_QUERY/...`), `sla_hours`, `sla_breach_at`, `escalation_level`, `resolution_notes`, `resolved_at`, `closed_at`. Priority enum differs (existing has `LOW/MEDIUM/HIGH`; BRD adds `CRITICAL`). Status flow is different (existing: `NEW/APPROVED/READY_FOR_TELLER/COMPLETED/INCOMPLETE/REJECTED/CLOSED`; BRD: `NEW/ASSIGNED/IN_PROGRESS/ESCALATED/RESOLVED/CLOSED/REJECTED`). |

### Sub-entities (Lead Detail)

| Entity | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| `lead_family_members` | **MISSING** | N/A | No table exists. BRD requires full family member tracking with relationship, DOB, wedding anniversary, dependent flag, existing CIF link. |
| `lead_addresses` | **MISSING** | N/A | No table exists. BRD requires multi-address support with address type (PRESENT/PERMANENT/BUSINESS), structured fields, is_preferred flag. |
| `lead_identifications` | **MISSING** | N/A | No table exists. BRD requires ID document tracking with type, number, issue/expiry dates, country of issue. |
| `lead_lifestyle` | **MISSING** | N/A | No table exists. BRD requires 1:1 lifestyle preferences (hobbies, cuisine, sports, music, clubs, special dates, communication preference). |
| `lead_documents` | **MISSING** | N/A | No table exists. BRD requires file attachment storage with document type, file path, size, MIME type, upload metadata. |

### Sub-entities (Prospect Detail)

| Entity | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| `prospect_family_members` | **MISSING** | N/A | No table exists. BRD requires identical structure to `lead_family_members` but referencing `prospect_id`. Existing `prospects.family_members` is a JSONB field, not a normalized table. |
| `prospect_addresses` | **MISSING** | N/A | No table exists. BRD requires structured address table. Existing `prospects` has `residential_address` and `correspondence_address` as JSONB blobs, not normalized. |
| `prospect_identifications` | **MISSING** | N/A | No table exists. BRD requires separate identification documents table for prospects. |
| `prospect_lifestyle` | **MISSING** | N/A | No table exists. Existing `prospects.lifestyle_interests` is a JSONB array, not a normalized table. |
| `prospect_documents` | **MISSING** | N/A | No table exists. BRD requires file attachment storage for prospects. |

### Supporting Entities

| Entity | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| `lead_rules` | **MISSING** | N/A | No table exists. BRD requires configurable rule definitions with `criteria_name`, `criteria_json` (recursive tree structure), `is_active`, generation tracking fields. Existing `lead_lists.rule_definition` stores rules inline as JSONB on the list itself, not as reusable rule entities. |
| `dedupe_rules` | **MISSING** | N/A | No table exists. BRD requires configurable deduplication rules with entity_type, person_type, field_combination, stop_type (SOFT_STOP/HARD_STOP), priority ordering. Existing implementation uses a hash-based approach (`dedup_hash` field on leads) which is simpler but not configurable. |
| `negative_list` | **MISSING** | N/A | No table exists. BRD requires a full negative/blacklist screening table with list_type (NEGATIVE/BLACKLIST/SANCTIONS/PEP), identity fields, reason, source, effective/expiry dates. |
| `dedupe_overrides` | **MISSING** | N/A | No table exists. BRD requires tracking of soft-stop overrides with entity references, matched entity, triggering rule, override reason and user. |
| `opportunities` | **MISSING** | N/A | No table exists. BRD requires full opportunity/pipeline tracking with product type, pipeline value, probability, stage (IDENTIFIED through WON/LOST), expected close date, linked to call reports and campaigns. |
| `tasks` | **MISSING** | N/A | No table exists for standalone tasks per BRD spec. Existing `action_items` table (line 4236) is linked to call reports/campaign responses only. BRD `tasks` entity is broader: standalone task creation, SRM assignment, related to any entity type (lead/prospect/client/campaign/call_report), with priority, due_date, reminder, completion tracking. |
| `rm_history` | **MISSING** | N/A | No table exists. BRD requires RM assignment change history tracking with entity type/ID, previous/new RM, change type (INITIAL_ASSIGNMENT/HANDOVER/DELEGATION/DELEGATION_RETURN), linked handover record, effective date. |
| `upload_logs` | **MISSING** | N/A | No table matching BRD spec exists. Existing `uploadBatches` (line 1281) and `leadUploadBatches` (line 4282) exist but with different structures. BRD requires `upload_type` (LEAD_LIST/PROSPECT/NEGATIVE_LIST), detailed `error_details` JSONB, `started_at`/`completed_at` timestamps. |
| `conversion_history` | **MISSING** | N/A | No table exists. BRD requires tracking of all lead-to-prospect and prospect-to-customer conversions with source/target entity IDs, campaign link, converting user, timestamp, notes. |
| `notifications` | **MISSING** | N/A | No table matching BRD spec exists. Existing `notification_log` (line 1415) is a dispatch log for system notifications, not a user-facing notification inbox. BRD requires a recipient-scoped notification table with type (MEETING_REMINDER, TASK_DUE, etc.), title, message, channel, related entity, read/unread tracking. |

### Additional Existing Entities (not in BRD)

| Entity | Status | Existing Location | Notes |
|--------|--------|-------------------|-------|
| `action_items` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4236 | Exists as a CRM entity linked to call reports and campaign responses. BRD does not specify this as a separate entity; instead uses JSONB `action_items` field on `call_reports` and a separate `tasks` entity. May need to reconcile or keep both. |
| `campaign_communications` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4114 | Exists for dispatch tracking. BRD does not define this as a separate entity but references campaign email/SMS dispatch functionality. Can be retained as implementation detail. |
| `campaign_consent_log` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4298 | Consent tracking for campaign communications. Not in BRD but adds GDPR/privacy compliance. Should be retained. |
| `notification_templates` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4269 | Template system for notifications. BRD references notification messages but does not define a templates entity. Valuable addition. |
| `lead_upload_batches` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4282 | Upload batch tracking. BRD defines `upload_logs` with different structure. Needs reconciliation. |
| `lead_list_generation_jobs` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4327 | Async job tracking for rule-based list generation. Not in BRD but operationally useful. Should be retained. |
| `campaign_translations` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4316 | i18n for campaigns. BRD says English only in v1 (Section 2.2). Can be retained for future use. |
| `campaign_lists` | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4088 | Junction table for campaigns-to-lead-lists (M:N). BRD uses a single `target_list_id` FK on campaigns (1:N). Existing is more flexible. |
| `handovers` (HAM module) | **EXISTS** (non-BRD) | `packages/shared/src/schema.ts` line 4930 | More complete handover entity from HAM BRD with items, scrutiny checklists, compliance gates, audit log, SLA configs. More comprehensive than BRD spec. |

### Enum Gaps

| Enum | Status | Gap Details |
|------|--------|-------------|
| `entity_type` / `crm_entity_type` | **CONFLICT** | Existing: `INDIVIDUAL/CORPORATE`. BRD: `INDIVIDUAL/NON_INDIVIDUAL`. Values differ. |
| `lead_status` | **PARTIAL** | Existing: `NEW/CONTACTED/QUALIFIED/CONVERTED/DROPPED`. BRD adds: `CLIENT_ACCEPTED/NOT_INTERESTED/DO_NOT_CONTACT`. Missing critical lifecycle states. |
| `lead_source` | **PARTIAL** | Existing: `CAMPAIGN/REFERRAL/WALK_IN/UPLOADED/SYSTEM_GENERATED`. BRD: `CAMPAIGN/MANUAL/UPLOAD/REFERRAL/WALK_IN/WEBSITE`. Different values. |
| `campaign_type` | **PARTIAL** | Existing: `EVENT/PRODUCT_PROMOTION`. BRD adds: `SEASONAL/REFERRAL/CROSS_SELL/UP_SELL`. |
| `campaign_status` | **PARTIAL** | Existing: `DRAFT/PENDING_APPROVAL/ACTIVE/COMPLETED/ARCHIVED`. BRD: `DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/COMPLETED/CLOSED/REJECTED`. Missing `APPROVED` (separate from `ACTIVE`), `CLOSED`, `REJECTED`. |
| `prospect_status` | **PARTIAL** | Existing: `ACTIVE/DROPPED/REACTIVATED/RECOMMENDED_FOR_CLIENT`. BRD: `ACTIVE/DROPPED/REACTIVATED/RECOMMENDED/CONVERTED`. Value naming differs; missing `CONVERTED`. |
| `response_type` | **PARTIAL** | Existing: `INTERESTED/NOT_INTERESTED/NEED_MORE_INFO/CONVERTED/OTHER`. BRD adds: `NO_RESPONSE/CALLBACK_REQUESTED`. Missing key response types. |
| `meeting_type` / `meeting_purpose` | **CONFLICT** | Existing splits concept into two enums (type=mode, purpose=reason). BRD uses `meeting_type` as purpose category and `mode` as a separate field. Structural mismatch. |
| `call_report_status` | **PARTIAL** | Existing: `DRAFT/SUBMITTED/APPROVED/REJECTED`. BRD: `DRAFT/SUBMITTED/APPROVED/RETURNED`. `REJECTED` vs `RETURNED` naming difference (semantic: returned allows resubmission). |
| `list_source` | **PARTIAL** | Existing: `RULE_BASED/UPLOADED/MANUAL`. BRD: `RULE/UPLOAD/MANUAL/MERGE`. Missing `MERGE` source type. |

---

## API Gaps

### Lead Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/leads` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router for `leads`) | Generic CRUD exists. Missing: auto-generation of `lead_number`, dedupe check integration, negative list screening, Zod validation per BRD field spec, RM auto-assignment. |
| `GET /api/back-office/leads` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Generic list endpoint exists. Missing: RM ownership filtering (own vs team vs all), multi-select status filter, AUM range filter, date range filter, 20-per-page default pagination. |
| `GET /api/back-office/leads/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: RM ownership check, include of sub-entity data (family, addresses, identifications, lifestyle, documents). |
| `PATCH /api/back-office/leads/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: RM ownership check, status transition validation, lock fields when CONVERTED, field-level audit trail. |
| `POST /api/back-office/leads/:id/convert` | **PARTIAL** | `server/routes/back-office/campaigns.ts` line 184 | Exists. Missing: CLIENT_ACCEPTED status prerequisite check, sub-table data copy (family, addresses, identifications, lifestyle, documents), `conversion_history` record creation, atomic transaction guarantee. |
| `POST /api/back-office/leads/dedupe-check` | **MISSING** | N/A | No standalone dedupe check endpoint. BRD requires dedicated endpoint using configurable `dedupe_rules` with priority ordering, hard-stop/soft-stop logic. Existing uses hash-based dedup at service layer. |
| `POST /api/back-office/leads/blacklist-check` | **MISSING** | N/A | No negative list screening endpoint. BRD requires Levenshtein fuzzy name matching, exact email/phone/ID matching against `negative_list` table. |

### Prospect Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/prospects` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Generic CRUD exists. Missing: dedupe against both prospects AND leads, negative list screening, `prospect_number` auto-generation, classification tier logic. |
| `GET /api/back-office/prospects` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: RM ownership filtering, ageing indicator logic, classification/risk profile filters, TRV range filter. |
| `GET /api/back-office/prospects/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: sub-entity data inclusion. |
| `PATCH /api/back-office/prospects/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: ownership check, status-based field locking. |
| `POST /api/back-office/prospects/:id/drop` | **MISSING** | N/A | No drop endpoint. BRD requires mandatory `drop_reason` (min 10 chars), status change to DROPPED, `drop_date` set. |
| `POST /api/back-office/prospects/:id/reactivate` | **MISSING** | N/A | No reactivate endpoint. BRD requires status change to REACTIVATED, `reactivation_date` set. |
| `POST /api/back-office/prospects/:id/recommend` | **MISSING** | N/A | No recommend endpoint. BRD requires mandatory field validation check before RECOMMENDED status. |
| `POST /api/back-office/prospects/:id/link-customer` | **MISSING** | N/A | No prospect-to-customer linking endpoint. BRD requires non-destructive data merge, type-ahead search of RECOMMENDED prospects, `conversion_history` record. |
| `POST /api/back-office/prospects/upload` | **MISSING** | N/A | No bulk prospect upload endpoint per BRD spec. Existing upload routes (`server/routes/back-office/uploads.ts`) handle generic uploads, not prospect-specific bulk import with dedupe and RM assignment. |

### Lead Rule & List Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/lead-rules` | **MISSING** | N/A | No lead rules CRUD. BRD requires separate `lead_rules` entity with criteria builder tree structure. |
| `GET /api/back-office/lead-rules` | **MISSING** | N/A | Not implemented. |
| `PATCH /api/back-office/lead-rules/:id` | **MISSING** | N/A | Not implemented. |
| `DELETE /api/back-office/lead-rules/:id` | **MISSING** | N/A | Not implemented. |
| `POST /api/back-office/lead-rules/:id/generate` | **PARTIAL** | `server/routes/back-office/campaigns.ts` line 101 (`/lead-lists/:id/refresh`) | Partially exists as list refresh. BRD requires generating from a rule entity, previewing match count, creating new list with source_type=RULE. Existing refreshes an existing list's rule. |
| `GET /api/back-office/lead-lists` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router for `leadLists`) | Generic list exists. Missing: member-level drill-down, source type filtering. |
| `POST /api/back-office/lead-lists/upload` | **MISSING** | N/A | No dedicated lead list upload endpoint. BRD requires CSV/Excel parsing, intra-file dedupe, upload_logs creation, async processing for large files. |
| `POST /api/back-office/lead-lists/merge` | **EXISTS** | `server/routes/back-office/campaigns.ts` line 111 | Exists with Name+Email/Phone deduplication. Matches BRD requirements. |
| `DELETE /api/back-office/lead-lists/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Generic delete exists. Missing: active campaign usage check ("List is in use by active campaign"). |

### Campaign Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/campaigns` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Generic create exists. Missing: 5-tab form validation, campaign code auto-generation format (CMP-XXXXX), brochure multi-file upload, rich text email body. |
| `GET /api/back-office/campaigns` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: role-based filtering by manager, status badge coloring. |
| `PATCH /api/back-office/campaigns/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. |
| `POST /api/back-office/campaigns/:id/submit` | **EXISTS** | `server/routes/back-office/campaigns.ts` line 34 | Exists. Sets status to PENDING_APPROVAL. |
| `POST /api/back-office/campaigns/:id/approve` | **PARTIAL** | `server/routes/back-office/campaigns.ts` line 44 | Exists but sets status to ACTIVE on approval (BRD: should set to APPROVED, then ACTIVE on start_date). Self-approval check exists. Missing: rejection sets REJECTED status (existing sets DRAFT). |
| `POST /api/back-office/campaigns/:id/reject` | **MISSING** | N/A | No separate reject endpoint. Existing combines approve/reject into single `/approve` endpoint with `approved` boolean. BRD specifies separate endpoints. |
| `POST /api/back-office/campaigns/:id/copy` | **EXISTS** | `server/routes/back-office/campaigns.ts` line 64 | Exists. Matches BRD requirement. |
| `GET /api/back-office/campaigns/:id/dashboard` | **PARTIAL** | `server/routes/back-office/campaigns.ts` line 77 (`/analytics`) | Exists as `/campaigns/:id/analytics`. Missing: ROI calculation, cost per lead, pipeline value aggregation, response breakdown pie chart data, conversion funnel data. Path differs from BRD (`/analytics` vs `/dashboard`). |
| `POST /api/back-office/campaigns/:id/responses` | **PARTIAL** | `server/routes/back-office/campaigns.ts` line 160 (`/interactions`) | Response capture exists as unified interaction logger. Path differs (`/interactions` vs `/campaigns/:id/responses`). Missing: per-campaign scoping, NO_RESPONSE initialization on dispatch. |
| `GET /api/back-office/campaigns/:id/responses` | **MISSING** | N/A | No list responses endpoint. |

### Meeting & Calendar Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/meetings` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router for `meetings`) | Generic create exists. Missing: invitee notification, reminder scheduling, RSVP initialization, end_time > start_time validation. |
| `GET /api/back-office/meetings` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: calendar view data formatting (day/week/month), RM-scoped filtering, team calendar for SRM. |
| `PATCH /api/back-office/meetings/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: reschedule notification to invitees, organizer-only check. |
| `DELETE /api/back-office/meetings/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists as soft delete. Missing: mandatory `cancel_reason`, notification to invitees, past meeting check. |

### Call Report Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/call-reports` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router for `callReports`) | Generic create exists. Missing: meeting pre-population for SCHEDULED type, report_number auto-generation, 48h filing deadline check, meeting status update to COMPLETED. |
| `GET /api/back-office/call-reports` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: RM ownership filtering, team view for SRM. |
| `PATCH /api/back-office/call-reports/:id` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router) | Exists. Missing: ownership check. |
| `POST /api/back-office/call-reports/:id/submit` | **MISSING** | N/A | No submit endpoint. BRD requires explicit submission for approval, auto-submit after meeting date. |
| `POST /api/back-office/call-reports/:id/approve` | **MISSING** | N/A | No approval endpoint. BRD requires SRM/BranchMgr approval with notification. |
| `POST /api/back-office/call-reports/:id/return` | **MISSING** | N/A | No return endpoint. BRD requires mandatory `return_reason`, RETURNED status, RM notification. |

### Opportunity Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/opportunities` | **MISSING** | N/A | No opportunities entity or routes. BRD requires full pipeline tracking CRUD. |
| `PATCH /api/back-office/opportunities/:id` | **MISSING** | N/A | Not implemented. |
| `GET /api/back-office/opportunities` | **MISSING** | N/A | Not implemented. |

### Handover & Task Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `POST /api/back-office/handovers` | **PARTIAL** | `server/routes/back-office/index.ts` (CRUD router for `rmHandovers`) | Generic CRUD exists for simpler `rmHandovers` table. HAM module `handovers` table has more complete routes but differs from BRD API paths. Missing: multi-entity selection, maker-checker enforcement per BRD spec. |
| `POST /api/back-office/handovers/:id/authorize` | **MISSING** | N/A | No authorization endpoint matching BRD path. HAM module has its own authorization flow. |
| `POST /api/back-office/tasks` | **MISSING** | N/A | No tasks CRUD. Only `action_items` linked to call reports. BRD requires standalone task management. |
| `PATCH /api/back-office/tasks/:id` | **MISSING** | N/A | Not implemented. |
| `GET /api/back-office/tasks` | **MISSING** | N/A | Not implemented. |

### Other Endpoints

| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| `GET /api/back-office/upload-logs` | **MISSING** | N/A | No upload logs endpoint per BRD spec. |
| `GET /api/back-office/upload-logs/:id/errors` | **MISSING** | N/A | Not implemented. |
| `GET /api/back-office/conversion-history` | **MISSING** | N/A | No conversion history or funnel analytics endpoint. |
| `GET /api/back-office/negative-list` | **MISSING** | N/A | No negative list management endpoints. |
| `POST /api/back-office/negative-list` | **MISSING** | N/A | Not implemented. |
| `POST /api/back-office/negative-list/upload` | **MISSING** | N/A | Not implemented. |
| `GET /api/back-office/notifications` | **MISSING** | N/A | No user notification inbox endpoint. Existing notification system is dispatch-oriented. |
| `PATCH /api/back-office/notifications/:id/read` | **MISSING** | N/A | Not implemented. |

---

## UI Gaps

| Screen | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| RM Workspace (My Space) | **MISSING** | N/A | No RM workspace landing page with lead/prospect/meeting/task count tiles, pipeline summary, quick action buttons. Existing `dashboard.tsx` is a generic placeholder. |
| Customer Workspace (tabs) | **MISSING** | N/A | No tabbed workspace with My Leads / My Prospects / My Customers tabs. BRD requires card-based grid per entity type with action buttons per card. |
| Lead Creation Form (7-tab) | **MISSING** | N/A | No dedicated lead creation form. Existing generic CRUD provides basic field entry. BRD requires 7-section tabbed form: Lead Info, Family Members, Address/Contact, Identification, Lifestyle, Documents, Preferences. |
| Prospect Creation Form (7-tab) | **MISSING** | N/A | No dedicated prospect creation form. BRD requires same 7-tab form as leads plus classification, TRV, risk_profile fields. |
| Dedupe Check Modal | **MISSING** | N/A | No dedupe check UI. BRD requires two modal variants: hard-stop (red, blocking) and soft-stop (yellow, overridable with reason). |
| My Leads Dashboard | **MISSING** | N/A | No leads dashboard. BRD requires card-based grid with search by name/number/ID, multi-select status filter, source filter, date range, AUM range, sort, pagination (20 per page). |
| My Prospects Dashboard | **PARTIAL** | `apps/back-office/src/pages/crm/prospect-manager.tsx` | Prospect pipeline manager exists with KPI cards and filterable tabs. Missing: card-based layout (existing uses table), ageing indicator (green/yellow/red), classification filter, TRV range filter, per-card action buttons (View/Edit/Drop/Recommend/Schedule Meeting/File Call Report), Dropped sub-tab with reactivation. |
| Campaign Management Screen | **PARTIAL** | `apps/back-office/src/pages/crm/campaign-dashboard.tsx` | Campaign dashboard exists with CRUD, submission, approval, copy, and analytics. Missing: per-BRD column layout (Code, Name, Type, Channel, Status badge, dates, Manager, Budget, Leads Count), Delete action, View Dashboard action as separate navigation. |
| Campaign Definition Form (5-tab) | **MISSING** | N/A | No 5-tab campaign form. Existing uses dialog-based creation. BRD requires tabs: General, Financial, Admin (with lead list selector), Campaign Notes (rich text email body, SMS content), Brochure (multi-file upload). |
| Campaign Dashboard (Analytics) | **PARTIAL** | `apps/back-office/src/pages/crm/campaign-analytics.tsx` | Analytics page exists with KPI cards and per-campaign drill-down. Missing: response breakdown pie chart, conversion funnel chart, ROI calculation, cost per lead, pipeline value, drill-down from chart segments to lead list. |
| Lead Rule Builder | **MISSING** | N/A | No visual rule builder. BRD requires criteria tree visualization, condition builder (field/operator/value), Add Rule/Group/NOT/Invert/Delete/Reset/Copy actions, human-readable preview. Existing lead list manager supports JSON rule definition but not the visual builder. |
| Calendar Screen | **PARTIAL** | `apps/back-office/src/pages/crm/meetings-calendar.tsx` | Meetings & calendar page exists with meeting CRUD and tabbed views (Upcoming/Past/Call Reports/Action Items). Missing: full calendar widget with Day/Week/Month views, color-coded meeting blocks by type, click-date-to-add, sidebar upcoming meetings list, SRM team calendar toggle. |
| Call Report Form | **PARTIAL** | `apps/back-office/src/pages/crm/meetings-calendar.tsx` (embedded) | Call report filing exists within meetings page. Missing: standalone call report form, meeting pre-population for scheduled type, structured action items table (item/owner/due_date), Add Opportunity button, Save/Submit/Cancel actions, approval workflow UI. |
| Handover/Delegation Screen | **PARTIAL** | `apps/back-office/src/pages/crm/rm-handover.tsx` | RM handover page exists with basic handover/delegation CRUD. Missing: 3-section expandable layout (Lead/Prospect/Client), left/center/right panel design, multi-select entity grid, pending issues field, Checker authorization view with Approve/Reject. |
| Service Request Screen | **PARTIAL** | `apps/back-office/src/pages/service-request-workbench.tsx` | Service request workbench exists with list/detail view. Missing: split view layout per BRD, status timeline visualization, SLA breach indicators, Assign/Forward/Escalate actions, SLA-sorted resolution queue. |
| Interaction Logger | **EXISTS** | `apps/back-office/src/pages/crm/interaction-logger.tsx` | Unified interaction logger exists for response + action item + meeting capture. Matches BRD concept of combined interaction logging. |
| Lead List Manager | **PARTIAL** | `apps/back-office/src/pages/crm/lead-list-manager.tsx` | Lead list manager exists with KPI cards, tabs, create/merge/refresh. Missing: member-level drill-down with remove action, upload dialog with CSV/Excel parsing, source badge formatting per BRD, active campaign usage check on delete. |

### Navigation Gaps

| Nav Item | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| CRM / Lead & Prospect section | **MISSING** | `apps/back-office/src/config/navigation.ts` | No CRM section in navigation config. All CRM pages exist in `pages/crm/` directory and are route-registered but have no sidebar navigation entries. BRD requires sidebar items: Customer Workspace, Calendar, Campaign, Reports. |

---

## Business Logic Gaps

| Workflow/Rule | Status | Existing Location | Gap Details |
|---------------|--------|-------------------|-------------|
| Lead status lifecycle | **PARTIAL** | `server/services/campaign-service.ts` | Basic status changes exist. Missing: full state machine per BRD (NEW -> CONTACTED -> QUALIFIED -> CLIENT_ACCEPTED -> CONVERTED; NOT_INTERESTED reactivation; DO_NOT_CONTACT terminal state), mandatory `drop_reason` enforcement, CONVERTED-only-via-conversion constraint. |
| Prospect status lifecycle | **PARTIAL** | `server/services/campaign-service.ts` | Drop/reactivate partially in prospect service. Missing: RECOMMENDED -> CONVERTED flow, mandatory field validation before recommend, status-based field locking. |
| Campaign approval workflow | **PARTIAL** | `server/services/campaign-service.ts` line 58-100 | Approval exists with self-approval prevention. **CONFLICT**: on approval, status is set to `ACTIVE` directly; BRD requires `APPROVED` first, then `ACTIVE` only on start_date (via scheduled job). Rejection sets status back to `DRAFT`; BRD requires `REJECTED` status. |
| Campaign activation (scheduled) | **MISSING** | N/A | No scheduled job to activate APPROVED campaigns on start_date and dispatch communications. BRD requires daily 06:00 job. |
| Campaign email/SMS dispatch | **PARTIAL** | `server/services/campaign-service.ts` | Dispatch service exists for email/SMS/push. Missing: template substitution ({{lead_name}}, {{rm_name}}), unsubscribe link inclusion, rate limiting (100 email/min, 50 SMS/min), retry with exponential backoff, dispatch failure logging. |
| Dedupe engine (configurable rules) | **MISSING** | N/A | No configurable dedupe engine. Existing uses SHA-256 hash of name+email+phone (`computeDedupHash` in campaign-service.ts). BRD requires configurable rule-based engine with priority ordering, field combination matching, soft-stop/hard-stop classification. |
| Negative list screening | **MISSING** | N/A | No negative list screening. BRD requires Levenshtein distance <= 2 fuzzy name matching, exact email/phone/ID matching, hard-stop blocking, audit trail. |
| Lead-to-Prospect conversion | **PARTIAL** | `server/services/campaign-service.ts` (`prospectService.convertLeadToProspect`) | Basic conversion exists. Missing: sub-table data copy (family, addresses, identifications, lifestyle, documents), `conversion_history` record, atomic transaction, CLIENT_ACCEPTED status prerequisite. |
| Prospect-to-Customer mapping | **MISSING** | N/A | No prospect-to-customer linking logic. BRD requires non-destructive data merge (prospect fields copied only where customer field is empty), RECOMMENDED status prerequisite, `conversion_history` record. |
| Call report 48h deadline | **MISSING** | N/A | No deadline enforcement. BRD requires auto-DRAFT status after 48h without filing, reminder notification, 7-day escalation to SRM. |
| Call report auto-submit | **MISSING** | N/A | No auto-submit logic. BRD requires DRAFT reports automatically change to SUBMITTED when meeting date has passed. |
| Call report 5-day escalation | **MISSING** | N/A | No escalation logic. BRD requires reports not approved within 5 days auto-escalate to Branch Manager. |
| Delegation auto-expiry | **MISSING** | N/A | No scheduled job for delegation end_date expiry. BRD requires auto-return of entities to original RM, rm_history records. |
| Service request SLA engine | **PARTIAL** | `server/services/service-request-service.ts` | SLA closure date computed. Missing: SLA breach detection, auto-escalation (L1 at 75%, L2 at 100%, L3 at 150%), escalation notifications to different management levels. |
| Task overdue notifications | **MISSING** | N/A | No task management system per BRD spec. |
| Meeting reminder system | **MISSING** | N/A | No reminder scheduling. BRD requires in-app notification at configured minutes before meeting. |
| Opportunity pipeline tracking | **MISSING** | N/A | No opportunity entity or pipeline logic. BRD requires stage progression (IDENTIFIED -> WON/LOST), mandatory `loss_reason` for LOST, contribution to campaign ROI. |
| Conversion funnel analytics | **MISSING** | N/A | No funnel calculation logic. BRD requires: Leads -> Qualified -> Client Accepted -> Converted to Prospect -> Recommended -> Converted to Customer, with drop-off rates and average time per stage. |
| Lead Rule criteria builder | **PARTIAL** | `server/services/campaign-service.ts` (`leadListService`) | Rule execution exists for generating lists. Missing: separate `lead_rules` entity management, criteria_json tree evaluation against clients table, preview match count, max nesting depth (5 levels) and conditions (20) enforcement. |
| Bulk upload with intra-file dedupe | **MISSING** | N/A | No intra-file deduplication during upload. BRD requires checking for duplicates within the uploaded file itself (Name+Email, Name+Phone combinations). |

---

## Integration Gaps

| Integration | Status | Gap Details |
|-------------|--------|-------------|
| Email gateway (SMTP) | **PARTIAL** | Campaign dispatch service references email sending. Missing: actual SMTP integration, template substitution engine, unsubscribe link generation, bounce handling. |
| SMS gateway | **PARTIAL** | Campaign dispatch service references SMS sending. Missing: actual SMS gateway integration, opt-out text inclusion ("Reply STOP"), delivery status tracking. |
| Core banking (Finacle) CIF lookup | **MISSING** | BRD Section 2.2 declares this out of scope (stub interfaces). No stubs exist yet. Needed for prospect-to-customer CIF linking. |
| Existing Trust OMS auth framework | **EXISTS** | `server/middleware/role-auth.ts` | Auth middleware exists with per-endpoint role guards, httpOnly cookies. CRM routes use `requireBackOfficeRole()`. Missing: CRM-specific roles (RM, SRM, CampaignMgr, Compliance) in role guard definitions for fine-grained endpoint authorization per BRD permissions matrix. |
| Audit trail system | **EXISTS** | `packages/shared/src/schema.ts` (`auditRecords` table), `server/services/audit-logger.ts` | Hash-chained audit system exists. CRM operations need to be instrumented to create audit records for all CUD operations. |
| Notification system | **PARTIAL** | `server/services/notification-service.ts` | Notification service exists for dispatch. Missing: user-facing notification inbox, read/unread tracking, per-event notification templates per BRD Section 10. |
| File upload/storage | **PARTIAL** | `server/services/bulk-upload-service.ts` | Bulk upload service exists. Missing: CRM-specific upload types (lead list, prospect, negative list), per-record error reporting, async processing with progress indication. |

---

## Non-Functional Gaps

| Requirement | Status | Gap Details |
|-------------|--------|-------------|
| Page load < 2s | **UNKNOWN** | No performance benchmarks measured for CRM pages. Requires testing. |
| API response < 500ms (single) | **UNKNOWN** | No benchmarks. Generic CRUD may meet this; custom endpoints untested. |
| Dedupe < 2s for 500K records | **MISSING** | No configurable dedupe engine exists. When implemented, needs PostgreSQL indexing strategy and performance testing. |
| Bulk upload 10K records in 5 minutes | **PARTIAL** | Upload service exists with async processing. Not validated for CRM-specific upload types at 10K scale. |
| Campaign dashboard < 3s | **UNKNOWN** | Analytics endpoint exists but not tested at 50-campaign / 100K-lead scale. |
| Search < 1s type-ahead | **MISSING** | No type-ahead search implemented for CRM entities. Requires indexing on searchable columns. |
| PII encryption at rest (AES-256) | **MISSING** | No PII encryption for lead/prospect email, phone, ID numbers. BRD requires pgcrypto or application-level encryption. |
| Zod validation for all inputs | **PARTIAL** | Generic CRUD router may apply basic validation. CRM-specific Zod schemas with BRD field rules (min length, format, enum validation) not defined. |
| CSRF protection | **PARTIAL** | SameSite cookies exist. CSRF tokens may need verification for CRM mutation endpoints. |
| Rate limiting (100 req/min) | **UNKNOWN** | Global rate limiting status unknown for CRM endpoints. |
| WCAG 2.1 AA compliance | **UNKNOWN** | Existing CRM pages use standard UI components (shadcn/ui). ARIA labels, keyboard navigation, color contrast need auditing. |
| Dark mode support | **PARTIAL** | Trust OMS theme system exists. CRM pages use shared UI components which likely support dark mode. |
| Responsive design (tablet) | **UNKNOWN** | CRM pages not verified for tablet responsiveness (768px-1279px). |
| Database indexes | **MISSING** | CRM tables lack indexes on: `leads.assigned_rm_id`, `leads.lead_status`, `leads.lead_code`, `prospects.assigned_rm_id`, `prospects.prospect_status`, `meetings.organizer_user_id`, `meetings.start_time`, `call_reports.filed_by`, `call_reports.report_status`. BRD requires indexes on all FK columns, status columns, and search fields. |
| Table partitioning (>1M records) | **MISSING** | No partitioning strategy defined for leads/prospects tables. BRD requires monthly partitioning on `created_at` when exceeding 1M records. |
| Connection pooling (10-50) | **UNKNOWN** | Database connection pool configuration not verified. |
| Queue-based campaign dispatch | **MISSING** | No queue system for campaign dispatch. BRD requires queue-based processing for > 1000 recipients to avoid gateway throttling. |

---

## Conflict Resolution Required

| # | Conflict | Details | Recommended Resolution |
|---|----------|---------|----------------------|
| 1 | **Entity type enum values** | Existing: `INDIVIDUAL/CORPORATE`. BRD: `INDIVIDUAL/NON_INDIVIDUAL`. All CRM tables and logic reference this enum. | Migrate enum to BRD values. Update all references. `NON_INDIVIDUAL` is more inclusive (trusts, foundations, partnerships) than `CORPORATE`. |
| 2 | **Campaign approval -> status** | Existing: approval sets status directly to `ACTIVE`. BRD: approval sets status to `APPROVED`; status becomes `ACTIVE` only when start_date is reached via scheduled job. | Implement BRD flow. Add `APPROVED` status to campaign enum. Create scheduled activation job. |
| 3 | **Meeting type/purpose split** | Existing: `meeting_type` = mode (IN_PERSON/VIRTUAL/PHONE) and `meeting_purpose` = reason. BRD: `meeting_type` = purpose category, `mode` = separate field. | Add `mode` field to meetings table. Rename existing `meeting_type` to `mode` and `meeting_purpose` to `meeting_type` (or add new fields and deprecate old). |
| 4 | **Handover entity duplication** | Two handover tables exist: `rm_handovers` (line 4251, simple CRM version) and `handovers` (line 4930, comprehensive HAM module version). BRD defines `rm_handovers`. | Consolidate on HAM `handovers` table which is more comprehensive. Map BRD API paths to HAM implementation. Deprecate simple `rm_handovers`. |

---

## Priority Recommendations

### Phase 1 (Foundation) - Highest Priority
1. Create 12 new schema tables: `lead_family_members`, `lead_addresses`, `lead_identifications`, `lead_lifestyle`, `lead_documents`, `prospect_family_members`, `prospect_addresses`, `prospect_identifications`, `prospect_lifestyle`, `prospect_documents`, `dedupe_rules`, `negative_list`
2. Extend `leads` table with 25+ missing fields and update enum values
3. Extend `prospects` table with 15+ missing fields and update enum values
4. Implement configurable dedupe engine with soft-stop/hard-stop logic
5. Implement negative list screening with fuzzy matching
6. Build 7-tab Lead and Prospect creation forms
7. Build My Leads and My Prospects dashboards

### Phase 2 (Campaign & Lists)
1. Create `lead_rules`, `dedupe_overrides`, `conversion_history` tables
2. Extend `campaigns` table with missing fields and fix enum values
3. Build Lead Rule Builder visual UI
4. Build 5-tab Campaign Definition Form
5. Implement campaign activation scheduled job
6. Build Campaign Dashboard with full analytics

### Phase 3 (Engagement Tools)
1. Create `opportunities`, `tasks`, `notifications` tables
2. Extend `meetings` and `call_reports` tables
3. Build full Calendar screen with Day/Week/Month views
4. Implement Call Report approval workflow (submit/approve/return)
5. Build Opportunity pipeline CRUD and UI
6. Build Task management CRUD and UI

### Phase 4 (Operations & Governance)
1. Create `rm_history`, `upload_logs` tables
2. Consolidate handover implementations
3. Extend `service_requests` with SLA engine
4. Build all reporting dashboards (10 reports)
5. Implement full notification system with 20+ event types
6. Add CRM navigation section to sidebar

---

## Files Referenced

### Schema
- `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (lines 3937-5165)

### Routes
- `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts`
- `/Users/n15318/Trust OMS/server/routes/back-office/service-requests.ts`
- `/Users/n15318/Trust OMS/server/routes/back-office/index.ts` (CRUD routers)
- `/Users/n15318/Trust OMS/server/routes.ts` (route mounting, lines 69-70, 279-282)

### Services
- `/Users/n15318/Trust OMS/server/services/campaign-service.ts`
- `/Users/n15318/Trust OMS/server/services/service-request-service.ts`
- `/Users/n15318/Trust OMS/server/services/notification-service.ts`
- `/Users/n15318/Trust OMS/server/services/bulk-upload-service.ts`
- `/Users/n15318/Trust OMS/server/services/audit-logger.ts`

### UI Pages
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-dashboard.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/campaign-analytics.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/lead-list-manager.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/prospect-manager.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/meetings-calendar.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/interaction-logger.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/rm-handover.tsx`
- `/Users/n15318/Trust OMS/apps/back-office/src/pages/service-request-workbench.tsx`

### Navigation
- `/Users/n15318/Trust OMS/apps/back-office/src/config/navigation.ts`

### Routes (Frontend)
- `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` (lines 91-98)
