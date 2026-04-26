# Gap Analysis: Lead & Prospect Management (Phase 1)
## Date: 2026-04-22
## BRD: docs/LeadProspect_BRD_v2_FINAL.docx (extracted to /tmp/brd_v2_text.txt)

---

## Summary

| Metric | Count |
|---|---|
| Total Phase 1 Requirements Analyzed | 17 |
| EXISTS (no work needed) | 3 |
| PARTIAL (modification needed) | 8 |
| MISSING (new implementation) | 6 |
| CONFLICTS (resolution needed) | 5 |

Phase 1 scope (per BRD Section 12.2 / Addendum G):
- Lead CRUD with dedupe and blacklist screening (FR-001 through FR-007)
- Prospect CRUD with dedupe and blacklist screening (FR-018 through FR-022)
- Lead-to-Prospect conversion (FR-023)
- Prospect-to-Customer mapping (FR-024)
- My Leads and My Prospects dashboards (FR-005, FR-019)
- Negative list management with pg_trgm fuzzy matching
- Communication preferences + consent capture (FR-038)
- Data retention policies + enforcement job (FR-041)
- Optimistic locking on leads, prospects
- Basic audit trail

---

## 1. Data Model Gaps

### 1.1 leads Table

| Field (BRD) | Status | Existing (schema.ts:4054-4076) | Gap Details |
|---|---|---|---|
| id (UUID) | CONFLICT | `id: serial('id').primaryKey()` | BRD requires UUID PK; schema uses auto-increment integer |
| lead_number (L-XXXXXXXX) | PARTIAL | `lead_code: text('lead_code')` | Field exists but named `lead_code` not `lead_number`; auto-generation logic not in schema |
| lead_type (INDIVIDUAL/NON_INDIVIDUAL) | PARTIAL | `entity_type: entityTypeEnum` | Field exists but named `entity_type`; enum values match |
| middle_name | MISSING | Not present | BRD requires middle_name on leads |
| short_name | MISSING | Not present | BRD requires short_name/alias field |
| entity_name | MISSING | Not present on leads | BRD requires entity_name for NON_INDIVIDUAL leads; only company_name exists |
| date_of_birth | MISSING | Not present on leads | BRD requires DOB on leads for age validation |
| gender | MISSING | Not present on leads | BRD requires gender field |
| nationality | MISSING | Not present on leads | BRD requires nationality |
| country_of_residence | MISSING | Not present | BRD requires country_of_residence |
| marital_status | MISSING | Not present | BRD requires marital_status enum |
| occupation | MISSING | Not present | BRD requires occupation field |
| industry | MISSING | Not present | BRD requires industry field |
| country_code | MISSING | Not present | BRD requires phone country code |
| primary_contact_no | PARTIAL | `mobile_phone: text('mobile_phone')` | Field name mismatch; BRD uses primary_contact_no |
| fixed_line_no | MISSING | Not present | BRD requires fixed_line_no |
| gross_monthly_income | MISSING | Not present | BRD requires income band enum |
| estimated_aum | PARTIAL | `total_aum: numeric('total_aum')` | Field name mismatch (total_aum vs estimated_aum) |
| aum_currency | MISSING | Not present | BRD requires AUM currency |
| trv | MISSING | Not present | BRD requires Total Relationship Value on leads |
| trv_currency | MISSING | Not present | BRD requires TRV currency |
| risk_appetite | EXISTS | `risk_profile: riskProfileEnum` | Present but named risk_profile; enum values slightly differ (BRD has 4, schema has 5 including GROWTH, BALANCED) |
| product_interest | EXISTS | `product_interest: jsonb` | Present |
| classification | MISSING | Not present | BRD requires Bronze/Silver/Gold/Platinum/Titanium tier |
| politically_exposed | MISSING | Not present on leads | BRD requires PEP boolean flag |
| referral_type | MISSING | Not present | BRD requires referral type enum |
| referral_id | MISSING | Not present | BRD requires referral entity ID |
| assigned_rm_id | EXISTS | `assigned_rm_id: integer` | Present |
| branch_id | MISSING | Not present on leads | BRD requires branch FK |
| converted_prospect_id | PARTIAL | `converted_prospect_id: integer` (on campaignResponses, not leads) | Field exists on campaignResponses but BRD requires it on leads table |
| conversion_date | MISSING | Not present | BRD requires conversion_date on leads |
| drop_reason | MISSING | Not present on leads | BRD requires drop_reason on leads (exists on prospects) |
| status enum values | CONFLICT | `['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DROPPED']` | BRD requires: NEW, CONTACTED, QUALIFIED, CLIENT_ACCEPTED, CONVERTED, NOT_INTERESTED, DO_NOT_CONTACT. Schema is missing CLIENT_ACCEPTED, NOT_INTERESTED, DO_NOT_CONTACT |
| source enum values | CONFLICT | `['CAMPAIGN', 'REFERRAL', 'WALK_IN', 'UPLOADED', 'SYSTEM_GENERATED']` | BRD requires: CAMPAIGN, MANUAL, UPLOAD, REFERRAL, WALK_IN, WEBSITE. Schema is missing MANUAL, WEBSITE; has extra SYSTEM_GENERATED, UPLOADED vs UPLOAD |
| dedup_hash | EXISTS | `dedup_hash: text('dedup_hash')` | Present (not in BRD but useful) |
| existing_client_id | EXISTS | `existing_client_id: text` | Present |

### 1.2 prospects Table

| Field (BRD) | Status | Existing (schema.ts:4133-4172) | Gap Details |
|---|---|---|---|
| id (UUID) | CONFLICT | `id: serial('id').primaryKey()` | BRD requires UUID PK; schema uses auto-increment integer |
| prospect_number | PARTIAL | `prospect_code: text` | Named prospect_code not prospect_number |
| prospect_type | PARTIAL | `entity_type: entityTypeEnum` | Named entity_type |
| short_name | MISSING | Not present | BRD requires alias |
| entity_name | PARTIAL | `company_name: text` | Named company_name; BRD uses entity_name for non-individual |
| country_of_residence | MISSING | Not present | BRD requires |
| marital_status | MISSING | Not present | BRD requires |
| occupation | MISSING | Not present | BRD requires |
| industry | MISSING | Not present | BRD requires |
| country_code | MISSING | Not present | BRD requires phone country code |
| primary_contact_no | PARTIAL | `mobile_phone: text` | Field name mismatch |
| fixed_line_no | PARTIAL | `office_phone: text` | Named office_phone vs fixed_line_no |
| gross_monthly_income | MISSING | Not present | BRD requires income band |
| estimated_aum | PARTIAL | `total_aum: numeric` | Name mismatch |
| aum_currency | MISSING | Not present | |
| trv | MISSING | Not present on prospects table | BRD requires TRV |
| trv_currency | MISSING | Not present | |
| risk_profile_comments | MISSING | Not present | BRD requires RM notes on risk |
| classification | PARTIAL | `client_category: text` | Uses client_category freetext instead of BRD's BRONZE/SILVER/GOLD/PLATINUM/TITANIUM enum |
| politically_exposed | MISSING | Not present | BRD requires PEP flag |
| referral_type | MISSING | Not present | |
| referral_id | MISSING | Not present | |
| branch_id | MISSING | Not present | BRD requires branch FK |
| cif_number | MISSING | Not present | BRD requires existing CIF for bank customers |
| linked_customer_id | PARTIAL | `converted_client_id: text` | Named converted_client_id vs linked_customer_id |
| conversion_date | MISSING | Not present | |
| drop_date | MISSING | Not present | |
| reactivation_date | MISSING | Not present | |
| ageing_days | PARTIAL | `days_since_creation: integer` | Exists but as stored integer; BRD says computed |
| status enum values | CONFLICT | `['ACTIVE', 'DROPPED', 'REACTIVATED', 'RECOMMENDED_FOR_CLIENT']` | BRD requires: ACTIVE, DROPPED, REACTIVATED, RECOMMENDED, CONVERTED. Schema has RECOMMENDED_FOR_CLIENT vs RECOMMENDED; missing CONVERTED |

### 1.3 Missing Tables (Required by BRD, Not in Schema)

| Entity | BRD Section | Status | Notes |
|---|---|---|---|
| **lead_family_members** | 4.2 | MISSING | Per-lead family member records with relationship, DOB, wedding anniversary |
| **lead_addresses** | 4.3 | MISSING | Per-lead addresses (PRESENT, PERMANENT, BUSINESS) with structured fields |
| **lead_identifications** | 4.4 | MISSING | Per-lead ID documents (PASSPORT, LICENSE, NATIONAL_ID, etc.) |
| **lead_lifestyle** | 4.5 | MISSING | 1:1 lead lifestyle preferences (hobbies, cuisine, sports, clubs, contact prefs) |
| **lead_documents** | 4.6 | MISSING | Per-lead file attachments (KYC docs, photos) |
| **prospect_family_members** | 4.8 | MISSING | Mirrors lead_family_members for prospects |
| **prospect_addresses** | 4.8 | MISSING | Mirrors lead_addresses for prospects |
| **prospect_identifications** | 4.8 | MISSING | Mirrors lead_identifications for prospects |
| **prospect_lifestyle** | 4.8 | MISSING | Mirrors lead_lifestyle for prospects |
| **prospect_documents** | 4.8 | MISSING | Mirrors lead_documents for prospects |
| **dedupe_rules** | 4.14 | MISSING | Configurable dedupe rule definitions (entity_type, person_type, field_combination, stop_type, priority) |
| **dedupe_overrides** | 4.16 | MISSING | Records of soft-stop overrides with reason and user |
| **negative_list** | 4.15 | MISSING | Negative/blacklist/sanctions/PEP entries with name, email, phone, ID, fuzzy matching support |
| **conversion_history** | 4.26 | MISSING | Tracks lead-to-prospect and prospect-to-customer conversions |
| **communication_preferences** | A.2 | MISSING | Per-entity per-channel opt-in/opt-out tracking |
| **data_retention_policies** | A.3 | MISSING | Retention rules per entity type with anonymize/delete/archive actions |

Note: The existing `campaignConsentLog` table (schema.ts:4298-4313) tracks campaign-level consent but is **not** the same as the BRD's `communication_preferences` entity which is a per-entity per-channel preference store.

### 1.4 Existing Tables (Adequate or Adaptable)

| Entity | Status | Location | Notes |
|---|---|---|---|
| campaigns | EXISTS | schema.ts:4017-4039 | Adequate for Phase 2; not Phase 1 critical |
| lead_lists | EXISTS | schema.ts:4042-4051 | Adequate |
| lead_list_members | EXISTS | schema.ts:4079-4085 | Adequate |
| campaign_responses | EXISTS | schema.ts:4097-4111 | Adequate |
| meetings | EXISTS | schema.ts:4175-4192 | Adequate for Phase 3 |
| call_reports | EXISTS | schema.ts:4207-4233 | Adequate for Phase 3 |
| rm_handovers | EXISTS | schema.ts:4251-4266 | Adequate for Phase 4 |
| lead_upload_batches | EXISTS | schema.ts:4282-4295 | Adequate |
| notification_templates | EXISTS | schema.ts:4269-4279 | Adequate |

---

## 2. API / Route Gaps

| Endpoint/Feature | Status | Existing Location | Gap Details |
|---|---|---|---|
| **Lead CRUD (GET/POST/PUT/DELETE)** | PARTIAL | `server/routes/back-office/index.ts:469-478` | Generic CRUD via `createCrudRouter(schema.leads)`. Provides basic list/get/create/update/delete. Missing: 7-section form validation, auto-generation of lead_code (L-XXXXXXXX format), status transition enforcement, dedupe pre-check, negative list screening, ownership-scoped access |
| **Prospect CRUD** | PARTIAL | `server/routes/back-office/index.ts:518-528` | Generic CRUD via `createCrudRouter(schema.prospects)`. Same gaps as leads plus missing: classification auto-calculation, prospect-specific validation |
| **Lead Dedupe Check API** | MISSING | -- | BRD FR-003 requires `POST /api/leads/dedupe-check` that evaluates configurable rules against both leads and prospects tables with soft-stop/hard-stop responses. No dedicated endpoint exists |
| **Negative/Blacklist Screening API** | MISSING | -- | BRD FR-004 requires screening against negative_list table with fuzzy matching. Existing `sanctions-service.ts` screens against a hardcoded in-memory list for clients/counterparties only -- not leads/prospects, and does not use pg_trgm |
| **Lead Status Transition API** | MISSING | -- | BRD FR-006 requires enforced status transitions (NEW->CONTACTED->QUALIFIED->CLIENT_ACCEPTED->CONVERTED). Generic PUT allows any status value |
| **Lead-to-Prospect Conversion API** | MISSING | -- | BRD FR-023 requires atomic conversion: create prospect from lead data, copy sub-table records, update lead status to CONVERTED, create conversion_history record |
| **Prospect-to-Customer Mapping API** | MISSING | -- | BRD FR-024 requires non-destructive merge of prospect data into existing client CIF, with selective field application |
| **Prospect Drop/Reactivate API** | MISSING | -- | BRD FR-020 requires dedicated endpoints with mandatory drop_reason validation and ownership checks |
| **Prospect Recommend for Client API** | MISSING | -- | BRD FR-021 requires status change to RECOMMENDED with mandatory field completeness validation |
| **Bulk Prospect Upload API** | MISSING | -- | BRD FR-022 requires CSV/Excel upload with batch processing (100-row batches), dedupe, progress tracking |
| **Communication Preferences API** | MISSING | -- | BRD FR-038 requires CRUD for communication_preferences per entity per channel |
| **Data Retention Enforcement Job** | MISSING | -- | BRD FR-041 requires scheduled daily job for anonymize/delete/archive based on retention policies |
| **My Leads / My Prospects scoped queries** | MISSING | -- | Current generic CRUD returns all records. BRD requires `assigned_rm_id = current_user` scoping with SRM team view and Branch Manager branch view |
| **Lead/Prospect PII Data Access Logging** | EXISTS | `server/routes/back-office/index.ts:471,520` | `logDataAccess('leads')` and `logDataAccess('prospects')` are applied |
| **Optimistic Locking (version-based)** | EXISTS | `server/routes/crud-factory.ts:812-825` | CRUD factory already implements version-based optimistic locking with 409 Conflict response. The `auditFields` in schema.ts includes `version: integer('version').default(1)` on all tables |
| **Audit Trail** | EXISTS | `server/routes/crud-factory.ts` | CRUD factory logs create/update/delete with hash-chained audit via `logAuditEvent` |
| **Per-endpoint Role Guards** | PARTIAL | `server/routes/back-office/index.ts:21` | `requireBackOfficeRole()` applied at router level. BRD requires finer-grained guards: RM can only edit own leads, SRM has team view, Branch Manager has branch view, Compliance manages blacklists |

---

## 3. UI Gaps

| Screen | Status | Existing Location | Gap Details |
|---|---|---|---|
| **My Leads Dashboard** (FR-005) | MISSING | -- | No dedicated lead dashboard page exists. No route in `apps/back-office/src/routes/index.tsx`. No navigation entry in `apps/back-office/src/config/navigation.ts`. BRD requires card-based grid with status badges, AUM display, filters, RM-scoped view |
| **My Prospects Dashboard** (FR-019) | MISSING | -- | Same as above for prospects |
| **Lead Creation Form** (FR-001, FR-002) | MISSING | -- | No 7-section tabbed form (Lead Info, Family, Address, Identification, Lifestyle, Documents, Preferences). The generic `EntityGenericPage` auto-generates flat forms from schema columns -- unsuitable for the multi-tab UX required |
| **Prospect Creation Form** (FR-018) | MISSING | -- | Same as lead creation form with additional wealth fields |
| **Lead Detail View** (FR-007) | MISSING | -- | No dedicated detail page with tabbed sections and audit history |
| **Prospect Detail View** | MISSING | -- | Same |
| **Dedupe Check Modal** (FR-003) | MISSING | -- | Hard-stop / soft-stop dialog with override-with-reason UX |
| **Negative List Match Modal** (FR-004) | MISSING | -- | Blocking modal showing match details |
| **Lead-to-Prospect Conversion UX** (FR-023) | MISSING | -- | Convert button on CLIENT_ACCEPTED leads, pre-populated prospect form, confirmation |
| **Prospect-to-Customer Mapping UX** (FR-024) | MISSING | -- | Link Prospect action on customer card, type-ahead search, non-destructive merge preview |
| **Prospect Drop/Reactivate UX** (FR-020) | MISSING | -- | Drop modal with mandatory reason, reactivation confirmation |
| **Prospect Recommend UX** (FR-021) | MISSING | -- | Recommend confirmation with mandatory field validation |
| **Consent Capture Section** (FR-038) | MISSING | -- | Channel checkboxes during lead/prospect creation, source-dependent defaults |
| **Optimistic Lock Conflict Modal** | MISSING | -- | 409 handling: "Record modified by another user" with Refresh & Retry / Discard actions |
| **CRM Navigation Section** | MISSING | `apps/back-office/src/config/navigation.ts` | No CRM/Lead/Prospect section in sidebar navigation. Need to add section with My Leads, My Prospects, Negative List Management |
| **CRM Routes** | MISSING | `apps/back-office/src/routes/index.tsx` | No lead/prospect routes defined in the router configuration |

Note: The existing generic entity page (`apps/back-office/src/pages/entity-generic.tsx`) can serve as a fallback for simple CRUD views of leads/prospects via the `/master-data/:entityKey` route, but it lacks the domain-specific features required by the BRD (7-tab form, dedupe integration, conversion flows, dashboards).

---

## 4. Business Logic Gaps

| Workflow/Rule | Status | Existing Location | Gap Details |
|---|---|---|---|
| **Lead Status Lifecycle** (FR-006) | MISSING | -- | No service enforcing valid transitions: NEW -> CONTACTED -> QUALIFIED -> CLIENT_ACCEPTED -> CONVERTED. BRD specifies DO_NOT_CONTACT as terminal state. CONVERTED only via conversion action. NOT_INTERESTED allows reactivation to CONTACTED |
| **Dedupe Engine** (FR-003) | MISSING | -- | No service implementing configurable dedupe rules. BRD requires: evaluate active rules by priority, check against both leads AND prospects, support HARD_STOP (block) and SOFT_STOP (warn with override), log overrides. Individual dedupe: campaign_id+first_name+last_name+email = hard; +phone = hard; first_name+last_name = soft. Non-individual: entity_name+email = hard; entity_name+phone = hard; entity_name = soft |
| **Negative/Blacklist Screening** (FR-004) | PARTIAL | `server/services/sanctions-service.ts` | Existing sanctions service uses in-memory list with Dice coefficient matching. BRD requires: separate `negative_list` table, pg_trgm extension for fuzzy matching, Levenshtein distance <= 2, exact match on email/phone/ID, screening of leads AND prospects (current service only handles clients/counterparties), GIN trigram indexes for < 200ms performance against 500K records |
| **Lead Auto-Numbering** | MISSING | -- | BRD requires auto-generated lead_number in L-XXXXXXXX format (8-digit zero-padded) |
| **Prospect Auto-Numbering** | MISSING | -- | BRD requires P-XXXXXXXX format |
| **Lead-to-Prospect Conversion** (FR-023) | MISSING | -- | No service implementing atomic conversion: copy lead + sub-tables to prospect + sub-tables, update lead status, create conversion_history. Must be transactional |
| **Prospect-to-Customer Mapping** (FR-024) | MISSING | -- | No service implementing non-destructive data merge from prospect to existing client CIF. Must only fill empty fields, present "suggested updates" for fields where client already has data |
| **Classification Auto-Calculation** | MISSING | -- | BRD specifies AUM-based classification: Bronze (<1M), Silver (1-5M), Gold (5-25M), Platinum (25-100M), Titanium (>100M). Thresholds configurable by admin |
| **Age Validation** | MISSING | -- | BRD: if date_of_birth provided and age < 18 for Individual, block save |
| **Consent Default Logic** (FR-038) | MISSING | -- | CAMPAIGN-sourced leads: email consent defaults opted-in. MANUAL/UPLOAD sources: all channels default opted-out. Pre-checked boxes prohibited per GDPR |
| **Data Retention Enforcement** (FR-041) | MISSING | -- | Daily scheduled job at 02:00 UTC to anonymize/delete/archive records exceeding retention periods. Must respect legal holds. BRD specifies defaults: DO_NOT_CONTACT leads -> 30-day anonymize, NOT_INTERESTED leads -> 730-day anonymize, CONVERTED leads -> 2555-day archive |
| **RM Ownership Scoping** | MISSING | -- | BRD requires: RM sees own leads only, SRM sees team, Branch Manager sees branch, Admin sees all. No ownership-aware query logic exists in current CRUD |
| **Bulk Upload with Batch Processing** (FR-022) | PARTIAL | `server/services/bulk-upload-service.ts` | Existing bulk upload service handles generic CSV/Excel import. BRD requires prospect-specific upload with: 100-row batch transactions, per-row dedupe, progress tracking via polling, SHA-256 file hash for idempotency |

---

## 5. Conflicts Requiring Resolution

### CONFLICT-1: Primary Key Type (Integer vs UUID)

**BRD Requirement:** All entities use UUID primary keys (`uuid_generate_v4()`).
**Existing Code:** All tables use `serial('id').primaryKey()` (auto-increment integer).
**Impact:** All foreign key references between CRM tables and to/from existing tables (users, clients) use integer IDs.
**Resolution Options:**
- (A) Keep integer PKs and document deviation from BRD. Integer PKs are already consistent across the entire Trust OMS schema. Add a UUID `external_id` column for external reference if needed.
- (B) Use UUID for new CRM tables only. This creates FK type mismatches with existing tables (users.id is integer).
- **Recommended:** Option A -- keep integer PKs for consistency with the existing 100+ table schema. The BRD's UUID recommendation appears to be a generic best practice, not a hard requirement driven by a specific integration need.

### CONFLICT-2: Lead Status Enum Values

**BRD Requirement:** `NEW, CONTACTED, QUALIFIED, CLIENT_ACCEPTED, CONVERTED, NOT_INTERESTED, DO_NOT_CONTACT`
**Existing Code:** `['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DROPPED']` (schema.ts:3946-3948)
**Impact:** Missing states CLIENT_ACCEPTED, NOT_INTERESTED, DO_NOT_CONTACT break the lifecycle workflow. DROPPED is not in BRD.
**Resolution:** Alter enum to add CLIENT_ACCEPTED, NOT_INTERESTED, DO_NOT_CONTACT. Map existing DROPPED -> NOT_INTERESTED if any data exists. PostgreSQL enum alteration requires `ALTER TYPE lead_status ADD VALUE 'CLIENT_ACCEPTED'` etc.

### CONFLICT-3: Lead Source Enum Values

**BRD Requirement:** `CAMPAIGN, MANUAL, UPLOAD, REFERRAL, WALK_IN, WEBSITE`
**Existing Code:** `['CAMPAIGN', 'REFERRAL', 'WALK_IN', 'UPLOADED', 'SYSTEM_GENERATED']` (schema.ts:3950-3952)
**Impact:** MANUAL and WEBSITE missing; UPLOADED vs UPLOAD naming difference; SYSTEM_GENERATED not in BRD.
**Resolution:** Add MANUAL, UPLOAD, WEBSITE to enum. Rename/alias UPLOADED -> UPLOAD if feasible, or keep both. Retain SYSTEM_GENERATED for backward compatibility.

### CONFLICT-4: Prospect Status Enum Values

**BRD Requirement:** `ACTIVE, DROPPED, REACTIVATED, RECOMMENDED, CONVERTED`
**Existing Code:** `['ACTIVE', 'DROPPED', 'REACTIVATED', 'RECOMMENDED_FOR_CLIENT']` (schema.ts:3968-3970)
**Impact:** Missing CONVERTED; RECOMMENDED_FOR_CLIENT vs RECOMMENDED naming difference.
**Resolution:** Add CONVERTED to enum. Either rename RECOMMENDED_FOR_CLIENT -> RECOMMENDED or alias.

### CONFLICT-5: Sanctions Service Architecture vs BRD Negative List

**BRD Requirement:** Dedicated `negative_list` table with pg_trgm GIN indexes, Levenshtein fuzzy matching, screening of leads/prospects at creation time.
**Existing Code:** `server/services/sanctions-service.ts` uses hardcoded in-memory sanctions list with Dice coefficient matching, only supports CLIENT and COUNTERPARTY entity types.
**Resolution:** Create new `negative_list` table and a dedicated `negative-list-screening-service.ts` that:
- Queries the database table (not in-memory)
- Uses pg_trgm similarity() for name matching
- Supports LEAD and PROSPECT entity types
- Exact match on email, phone, ID number
- The existing sanctions service can remain for its current use cases (client/counterparty screening)

---

## 6. Infrastructure & Extension Dependencies

| Dependency | Status | Notes |
|---|---|---|
| PostgreSQL pg_trgm extension | UNKNOWN | Required for FR-004 negative list fuzzy matching. Must run `CREATE EXTENSION IF NOT EXISTS pg_trgm;` |
| GIN trigram indexes on negative_list | MISSING | Required for < 200ms screening against 500K records |
| Scheduled job infrastructure | PARTIAL | EOD orchestrator exists (`server/services/eod-orchestrator.ts`) but no generic cron/scheduler for daily retention enforcement at 02:00 UTC |
| Email/SMS gateway integration | MISSING | BRD assumes SendGrid/Twilio for campaign dispatch. Not Phase 1 critical but FR-038 consent capture must create records |

---

## 7. Implementation Priority Matrix

Based on dependency ordering for Phase 1:

### Tier 1: Schema Foundation (must be done first)
1. Add missing columns to `leads` table (20+ fields)
2. Add missing columns to `prospects` table (15+ fields)
3. Alter `leadStatusEnum` to add CLIENT_ACCEPTED, NOT_INTERESTED, DO_NOT_CONTACT
4. Alter `leadSourceEnum` to add MANUAL, UPLOAD, WEBSITE
5. Alter `prospectStatusEnum` to add CONVERTED
6. Create `lead_family_members`, `lead_addresses`, `lead_identifications`, `lead_lifestyle`, `lead_documents` tables
7. Create `prospect_family_members`, `prospect_addresses`, `prospect_identifications`, `prospect_lifestyle`, `prospect_documents` tables
8. Create `dedupe_rules` table with seed data (6 default rules from BRD Section 4.14)
9. Create `dedupe_overrides` table
10. Create `negative_list` table with pg_trgm indexes
11. Create `conversion_history` table
12. Create `communication_preferences` table
13. Create `data_retention_policies` table with default policy seed data

### Tier 2: Business Logic Services
1. Lead status lifecycle service (transition enforcement)
2. Dedupe engine service (configurable rule evaluation)
3. Negative list screening service (pg_trgm fuzzy + exact matching)
4. Lead auto-numbering service (L-XXXXXXXX)
5. Prospect auto-numbering service (P-XXXXXXXX)
6. Lead-to-Prospect conversion service (atomic transaction)
7. Prospect-to-Customer mapping service (non-destructive merge)
8. Communication preference service (consent CRUD)
9. Data retention enforcement job (daily scheduler)
10. Classification auto-calculation helper

### Tier 3: API Routes
1. Enhanced lead routes (dedupe pre-check, screening, status transitions, ownership scoping)
2. Enhanced prospect routes (same + drop/reactivate/recommend)
3. Lead-to-Prospect conversion endpoint
4. Prospect-to-Customer mapping endpoint
5. Negative list management CRUD routes (Compliance role guard)
6. Dedupe rule management routes (Admin role guard)
7. Communication preferences routes
8. Bulk prospect upload endpoint

### Tier 4: UI Implementation
1. CRM navigation section in sidebar
2. CRM routes in router config
3. My Leads Dashboard (card grid, filters, RM-scoped)
4. My Prospects Dashboard (card grid, filters, ageing indicators)
5. Lead creation form (7-tab: Info, Family, Address, ID, Lifestyle, Docs, Preferences)
6. Prospect creation form (7-tab with wealth fields)
7. Dedupe check modal (hard-stop block, soft-stop with override)
8. Negative list screening modal (blocking on match)
9. Consent capture section (channel checkboxes with source-dependent defaults)
10. Lead-to-Prospect conversion UX
11. Prospect-to-Customer mapping UX
12. Optimistic lock conflict modal
13. Lead/Prospect detail views with edit capability

---

## 8. What Already Works (No Changes Needed)

| Feature | Location | Notes |
|---|---|---|
| Optimistic locking infrastructure | `server/routes/crud-factory.ts:787-825` | Both `_expectedUpdatedAt` and `version`-based locking implemented with 409 Conflict |
| Audit trail logging | `server/routes/crud-factory.ts` + `server/services/audit-logger.ts` | Hash-chained audit on all CRUD operations |
| Maker-checker workflow | `server/middleware/maker-checker.ts` | Can be applied to lead/prospect mutations |
| PII data access logging | `server/routes/back-office/index.ts:471,520` | Already applied to leads and prospects routes |
| Role-based auth middleware | `server/middleware/role-auth.ts` | Guards exist; need to add CRM-specific role checks |
| Generic CRUD factory | `server/routes/crud-factory.ts` | Provides base CRUD with pagination, search, sort, filter, bulk import, CSV export |
| Existing lead/prospect basic CRUD routes | `server/routes/back-office/index.ts:469-528` | Basic CRUD registered for leads, prospects, lead-lists, lead-list-members, campaign-responses, meetings, call-reports, etc. |
| Schema relations | `schema.ts:4354-4380` | Drizzle relations defined for leads, prospects, campaigns, etc. |

---

## 9. Estimated Effort (T-Shirt Sizing)

| Work Area | Size | Rationale |
|---|---|---|
| Schema migration (new tables + column additions) | L | 16 new tables/sub-tables, 35+ new columns on existing tables, 4 enum alterations |
| Dedupe engine service | M | Configurable rule evaluation with priority ordering, multi-table check |
| Negative list screening service | M | pg_trgm integration, fuzzy + exact matching, performance tuning |
| Lead-to-Prospect conversion | M | Atomic transaction copying 6 sub-tables + status updates |
| Prospect-to-Customer mapping | S-M | Non-destructive merge with selective field application |
| Status lifecycle services | S | Transition validation with enum-based state machine |
| Communication preferences + retention | S-M | New service + daily scheduled job |
| Enhanced API routes (all) | L | Custom endpoints beyond generic CRUD, ownership scoping, role guards |
| UI: Dashboards + forms + modals | XL | 2 dashboard pages, 2 multi-tab forms (7 tabs each), 5+ modals, navigation, routes |

**Total estimated effort: 4-6 developer-weeks for Phase 1**
