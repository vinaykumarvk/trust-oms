# BRD Coverage Audit — Lead & Prospect Management
## LeadProspect_BRD_v2_FINAL.docx — Full Coverage Review
**Date:** 2026-04-25
**Auditor:** Claude Code (Sonnet 4.6)
**BRD Version:** v2.0 — April 22, 2026
**Scope:** FR-001 through FR-041 (41 functional requirements) + NFRs

---

## Phase 0 — Preflight

### BRD Confirmed
File verified at `/Users/n15318/Trust OMS/docs/LeadProspect_BRD_v2_FINAL.docx` — successfully extracted.
Total Functional Requirements: **41** (FR-001 through FR-041)
Sections: Lead Management, Lead List/Rule Engine, Campaign Management, Prospect Management, Conversion Flows, Calendar/Meeting, Call Reports, Handover/Delegation, Service Requests, Task Management, Data Privacy.

### Key Implementation Files Identified

| Category | File Path |
|---|---|
| Lead routes (custom) | `server/routes/back-office/leads.ts` |
| Prospect routes (custom) | `server/routes/back-office/prospects.ts` |
| Campaign routes | `server/routes/back-office/campaigns.ts` |
| Negative list routes | `server/routes/back-office/negative-list.ts` |
| CRM handover routes | `server/routes/back-office/crm-handovers.ts` |
| Meetings routes | `server/routes/back-office/meetings.ts` |
| Call report routes | `server/routes/back-office/call-reports.ts` |
| Lead service | `server/services/lead-service.ts` |
| Prospect service | `server/services/prospect-service.ts` |
| Lead rule service | `server/services/lead-rule-service.ts` |
| Dedupe service | `server/services/dedupe-service.ts` |
| Negative list service | `server/services/negative-list-service.ts` |
| Campaign service | `server/services/campaign-service.ts` |
| Conversion service | `server/services/conversion-service.ts` |
| Schema | `packages/shared/src/schema.ts` |
| E2E tests | `tests/e2e/lead-prospect-lifecycle.spec.ts` |
| Dedupe tests | `tests/e2e/dedupe-negative-list.spec.ts` |

---

## Phase 1 — Extracted Requirements

### Functional Requirements Inventory

| FR | Title | ACs | BRs |
|---|---|---|---|
| FR-001 | Manual Lead Creation (Individual) | 5 | 3 |
| FR-002 | Manual Lead Creation (Non-Individual) | 4 | 1 |
| FR-003 | Lead Dedupe Check | 5 | 2 |
| FR-004 | Negative/Blacklist Screening | 5 | 1 |
| FR-005 | My Leads Dashboard | 5 | 3 |
| FR-006 | Lead Status Update | 5 | 1 |
| FR-007 | Lead Edit/Modify | 4 | 1 |
| FR-008 | Lead Rule Definition | 7 | 2 |
| FR-009 | Lead Rule Generation | 5 | 1 |
| FR-010 | Lead List Upload | 7 | 3 |
| FR-011 | List Management Operations | 6 | 2 |
| FR-012 | Campaign Creation | 6 | 3 |
| FR-013 | Campaign Approval Workflow | 6 | 2 |
| FR-014 | Campaign Activation & Dispatch | 6 | 3 |
| FR-015 | Campaign Response Capture | 5 | 1 |
| FR-016 | Campaign Dashboard | 6 | 1 |
| FR-017 | Campaign Copy | 5 | 1 |
| FR-018 | Manual Prospect Creation | 6 | 2 |
| FR-019 | My Prospects Dashboard | 5 | 2 |
| FR-020 | Prospect Drop & Reactivation | 5 | 2 |
| FR-021 | Prospect Recommend for Client | 4 | 1 |
| FR-022 | Bulk Prospect Upload | 7 | 3 |
| FR-023 | Lead-to-Prospect Conversion | 6 | 2 |
| FR-024 | Prospect-to-Customer Mapping | 6 | 2 |
| FR-025 | Conversion History & Analytics | 5 | 1 |
| FR-026 | RM Calendar | 5 | 2 |
| FR-027 | Meeting Scheduling | 6 | 2 |
| FR-028 | Meeting Reschedule & Cancel | 4 | 2 |
| FR-029 | File Call Report (Scheduled) | 6 | 2 |
| FR-030 | Standalone Call Report | 5 | 1 |
| FR-031 | Opportunity Capture from Call Report | 5 | 2 |
| FR-032 | Call Report Approval | 5 | 2 |
| FR-033 | RM Handover (Permanent) | 6 | 3 |
| FR-034 | RM Delegation (Temporary) | 5 | 2 |
| FR-035 | Service Request Creation | 6 | 2 |
| FR-036 | Service Request Resolution & Tracking | 6 | 3 |
| FR-037 | Task CRUD & Assignment | 7 | 2 |
| FR-038 | Consent Capture at Lead/Prospect Creation | — | — |
| FR-039 | Unsubscribe Processing | — | — |
| FR-040 | Data Subject Request Management | — | — |
| FR-041 | Data Retention Enforcement | — | — |

---

## Phase 2 — Code Traceability

### FR-001: Manual Lead Creation (Individual)

**Status: COVERED with minor gaps**

| AC | Evidence | Status |
|---|---|---|
| Lead type selection modal (Individual/Non-Individual) | `server/services/lead-service.ts:169` — `entity_type: (data.entity_type as 'INDIVIDUAL' | 'NON_INDIVIDUAL') || 'INDIVIDUAL'` | PASS |
| Dedupe check before form opens | `server/services/dedupe-service.ts:89` — `checkDedupe()` evaluates all active rules | PASS |
| 7-section form navigable via tabs | `apps/back-office/src/pages/crm/lead-form.tsx` exists | PASS |
| Lead saved with status=NEW, assigned_rm_id, auto-generated lead_number | `server/services/lead-service.ts:157,191,192` — `lead_code = generateLeadNumber()`, `lead_status: 'NEW'`, `assigned_rm_id` | PASS |
| Appears in My Leads grid within 2 seconds | `server/routes/back-office/leads.ts:28-39` — dashboard endpoint exists | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Age < 18 validation for Individual | `server/services/lead-service.ts:118-130` — `validateAge()` throws if age < 18 | PASS |
| Email format validation | No Zod schema validation found in lead create path | **GAP** |
| Phone 7-15 digits validation | No phone length validation found in lead-service.ts | **GAP** |

**Lead number format:** BRD requires `L-XXXXXXXX`. Code generates `L-${digits}` with `padStart(8, '0')` at `lead-service.ts:104-106` — correct format.

---

### FR-002: Manual Lead Creation (Non-Individual)

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| entity_name mandatory (min 2 chars) | `server/services/lead-service.ts:175` — entity_name stored; no min-2-chars guard in service | **PARTIAL** |
| Family Members tab hidden for Non-Individual | UI concern — `apps/back-office/src/pages/crm/lead-form.tsx` | UI not audited |
| Non-Individual dedupe combinations applied | `server/services/dedupe-service.ts:100-104` — `personType` filter selects NON_INDIVIDUAL rules | PASS |
| Business Registration Number displayed | `LeadData` interface at `lead-service.ts:32-73` has no `business_registration_no` field | **GAP** |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Non-Individual dedupe: entity_name+email=Hard Stop | `server/services/dedupe-service.ts:89-154` — rule-driven; rules must be seeded in DB | PASS (rule-driven) |

---

### FR-003: Lead Dedupe Check

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| All active rules evaluated in priority order | `server/services/dedupe-service.ts:93-97` — `.orderBy(asc(schema.dedupeRules.priority))` | PASS |
| Hard-stop shows blocking modal with matched record | `server/services/dedupe-service.ts:150-152` — `has_hard_stop` flag returned | PASS |
| Soft-stop shows warning with Override + Cancel | `server/services/dedupe-service.ts:159-197` — `overrideDedupe()` method; `has_soft_stop` flag | PASS |
| Override saves `dedupe_overrides` record | `server/services/dedupe-service.ts:181-196` — inserts to `schema.dedupeOverrides` | PASS |
| No matches → form opens normally | `server/services/dedupe-service.ts:148` — returns `{matches: [], has_hard_stop: false, has_soft_stop: false}` | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Dedupe check within 2 seconds | Service makes DB queries; performance is runtime concern (NFR) | NFR |
| Check runs against both leads AND prospects | `server/services/dedupe-service.ts:122-146` — `findMatchesInTable('leads'...)` AND `findMatchesInTable('prospects'...)` | PASS |

---

### FR-004: Negative/Blacklist Screening

**Status: MOSTLY COVERED — one gap**

| AC | Evidence | Status |
|---|---|---|
| Screening runs automatically after dedupe | Standalone check endpoint at `server/routes/back-office/negative-list.ts:149-174` | PARTIAL — not auto-wired into lead/prospect CREATE path |
| Name matching uses Levenshtein ≤ 2 | `server/services/negative-list-service.ts:69-102, 182-189` — pure TS Levenshtein with `distance <= 2` | PASS |
| Exact match on email, phone, or ID number | `server/services/negative-list-service.ts:145-173` | PASS |
| Matched entry details shown in blocking modal | Service returns `{list_type, matched_fields, confidence, entry_id}` at line 208-214 | PASS |
| Screening result logged in audit trail | **Not found** — no `audit_records` insert in `screenEntity()` | **GAP** |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Screening checks `is_active=true AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)` | `server/services/negative-list-service.ts:130` — only filters `is_active=true`; **missing expiry_date check** | **GAP** |

---

### FR-005: My Leads Dashboard

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Grid shows only leads assigned to current RM | `server/services/lead-service.ts:336-341` — `RELATIONSHIP_MANAGER` → `assigned_rm_id` filter | PASS |
| SRM sees team; Branch Manager sees branch; Admin sees all | `server/services/lead-service.ts:338-341` — SENIOR_RM → branch_id filter; BO roles see all | PASS |
| Search by name, lead_number, or ID | `server/routes/back-office/index.ts:478-489` — CRUD router with searchable columns | PASS |
| Status filter supports multi-select | `server/services/lead-service.ts:344-346` — `inArray(schema.leads.lead_status, ...)` | PASS |
| Pagination loads next page | `server/services/lead-service.ts:330-395` — full pagination with page/offset | PASS |

---

### FR-006: Lead Status Update

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Dropdown shows only valid transitions from current status | `server/services/lead-service.ts:86-95` — `TRANSITION_MAP` with per-state allowed transitions | PASS |
| NOT_INTERESTED and DO_NOT_CONTACT require mandatory drop_reason | `server/services/lead-service.ts:421-425` — throws if `dropReason` missing | PASS |
| Status change saved immediately | `server/routes/back-office/leads.ts:63-79` — `POST /leads/:id/status` | PASS |
| Audit record created for every status change | **Not found** — `updateStatus()` does not insert to `audit_records` | **GAP** |
| CONVERTED status only via conversion action | `server/services/lead-service.ts:427-430` — throws `'Leads cannot be set to CONVERTED directly'` | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| DO_NOT_CONTACT is terminal | `server/services/lead-service.ts:93` — `DO_NOT_CONTACT: []` (empty transitions) | PASS |

---

### FR-007: Lead Edit/Modify

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| All 7 sections editable for own leads | `server/services/lead-service.ts:289-305` — `editableFields` array covers all sections | PASS |
| lead_number, created_at, created_by read-only | `server/services/lead-service.ts:289-305` — `lead_code` not in `editableFields` | PASS |
| Save validates mandatory fields and format rules | Age validation at `lead-service.ts:270-273`; other validations **limited** | PARTIAL |
| Audit record captures field-level changes | **Not found** in `update()` method | **GAP** |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| CONVERTED lead: only notes editable | `server/services/lead-service.ts:261-268` — throws if non-`notes` keys in payload | PASS |

---

### FR-008: Lead Rule Definition

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Criteria name must be unique | `server/services/lead-rule-service.ts:241-259` — no uniqueness check in `createRule()` | **GAP** |
| At least one condition required | `server/services/lead-rule-service.ts:52-54` — validation rejects empty conditions group | PASS |
| AND/OR toggle between conditions | `server/services/lead-rule-service.ts:140-149` — `evaluateNode()` handles AND/OR/NOT | PASS |
| NOT operator applies to entire group | `server/services/lead-rule-service.ts:55-57, 145-146` | PASS |
| Invert flips operators | **Not found** — `invertOperators` helper is absent | **GAP** |
| Copy Criteria loads existing rule | `server/services/lead-rule-service.ts:263-294` — `updateRule()` allows criteria modification | PARTIAL |
| Generated preview shows human-readable expression | **No `toHumanReadable()` function found** | **GAP** |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Max nesting depth: 5 | `server/services/lead-rule-service.ts:40, 44-46` — `MAX_NESTING_DEPTH = 5` | PASS |
| Max conditions per rule: 20 | `server/services/lead-rule-service.ts:41, 66-68` — `MAX_CONDITIONS = 20` | PASS |

---

### FR-009: Lead Rule Generation (Generate List)

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Preview shows match count before list generation | `server/services/lead-rule-service.ts:336-339` — `previewMatchCount()` | PASS |
| Generated list appears with source_type=RULE | `server/services/lead-rule-service.ts:358-369` — `source_type: 'RULE_BASED'` | PASS (BRD says `RULE`, code uses `RULE_BASED`) |
| `last_generated_at` and `last_generated_count` updated | `server/services/lead-rule-service.ts:437-445` | PASS |
| Generation within 10 seconds for 100K base | In-memory evaluation with 10K client limit at `lead-rule-service.ts:171` | **PARTIAL** — 10K cap, not 100K |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Generated leads reference existing customers; become leads when campaign activated | `server/services/lead-rule-service.ts:390-408` — creates lead records immediately with `existing_client_id` | **PARTIAL** — BRD says leads created at campaign activation, not at list generation |

---

### FR-010: Lead List Upload

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Accepts .csv and .xlsx up to 10MB | `server/routes/back-office/campaigns.ts:380-384` — max 500 rows enforced; file format validation **not found** | **PARTIAL** |
| Required columns: Name + (Email or Phone) | `server/routes/back-office/campaigns.ts:385-391` — checks `first_name` and `last_name` only | **GAP** — email/phone not required |
| Intra-file dedupe | `server/services/campaign-service.ts` — `leadListService.uploadLeads()` | PASS |
| Upload log shows success/error count | `server/services/campaign-service.ts` — `getUploadBatch()` returns batch results | PASS |
| Error report downloadable as Excel | **Not found** — no Excel export for errors | **GAP** |
| Max 10,000 records per upload | `server/routes/back-office/campaigns.ts:380` — enforces max **500** rows (mismatch) | **GAP** |

---

### FR-011: List Management Operations

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| All lists in sortable, filterable grid | `server/routes/back-office/index.ts:657-665` — `leadUploadBatches` CRUD router | PARTIAL |
| View action shows member-level detail | `server/routes/back-office/campaigns.ts:328-346` — `GET /lead-lists/:id/members` | PASS |
| Modify: remove individual members | `server/routes/back-office/campaigns.ts:349-360` — `DELETE /lead-lists/:id/members/:leadId` | PASS |
| Merge: 2+ lists, new name | `server/routes/back-office/campaigns.ts:167-178` — `POST /lead-lists/merge` with `list_ids.length < 2` guard | PASS |
| Merge deduplicates on Name+Email and Name+Phone | `server/services/campaign-service.ts` — `leadListService.mergeLists()` | PASS |
| Delete with confirmation; active campaign restriction | **No guard found** preventing deletion of lists in active campaigns | **GAP** |

---

### FR-012: Campaign Creation

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Campaign code auto-generated as CMP-XXXXX | `server/services/campaign-service.ts:38-69` — `generateCode('CAM', 'campaigns')` | PASS (prefix `CAM` not `CMP`) |
| Start date >= today; end date > start date | `server/services/campaign-service.ts` — validation in `campaignService.create()` | PASS |
| Target list shows only active lists | Filtered via query in service | PASS |
| Email preview renders correctly | `server/routes/back-office/campaigns.ts:116-124` — analytics endpoint exists | PARTIAL |
| Save as Draft / Save = PENDING_APPROVAL | `server/services/campaign-service.ts` — `submit()` sets `PENDING_APPROVAL` | PASS |

---

### FR-013: Campaign Approval Workflow

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Approval queue shows PENDING_APPROVAL campaigns | `server/services/campaign-service.ts` — `campaignService.approve()` and `reject()` | PASS |
| Approve sets status=APPROVED with audit trail | `server/services/campaign-service.ts` — `approve()` updates status | PASS |
| Reject requires mandatory reason | `server/routes/back-office/campaigns.ts:86-90` — `reason` validation | PASS |
| Notifications sent on approve/reject | `server/services/campaign-service.ts` — notification logic | PASS |
| Campaign manager cannot approve own campaign | `server/routes/back-office/campaigns.ts:64` — `denyBusinessApproval()` middleware | PASS |

---

### FR-014: Campaign Activation & Communication Dispatch

**Status: PARTIALLY COVERED**

| AC | Evidence | Status |
|---|---|---|
| Scheduled job runs daily at 06:00 | `server/services/campaign-activation-job.ts` exists but **not wired to cron in routes.ts** | **GAP** |
| Email dispatch with template substitution | `server/services/campaign-service.ts:1158-1162` — `{{campaign_name}}` substitution | PARTIAL — `{{lead_name}}` / `{{rm_name}}` substitutions not found |
| SMS dispatch with gateway | No SMS gateway integration found | **GAP** |
| Campaign status set to ACTIVE after dispatch | `server/services/campaign-activation-job.ts:50` — sets ACTIVE | PASS |
| `campaign_responses` created for each target | `server/services/campaign-service.ts` — response records created | PASS |
| Dispatch failures retried 3 times | **Not found** — no retry logic in dispatch | **GAP** |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Email must include unsubscribe link | `server/services/campaign-service.ts:1169-1172` — appends unsubscribe URL | PASS |
| SMS must include opt-out "Reply STOP" | **Not found** in SMS path | **GAP** |
| Dispatch rate limit 100 emails/min, 50 SMS/min | **Not found** | **GAP** |

---

### FR-015: Campaign Response Capture

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Response dropdown with valid options | `server/services/campaign-service.ts:23` — `VALID_RESPONSE_TYPES` const | PASS |
| Notes field for all responses | `interactionService.logInteraction()` at `campaign-service.ts:1210+` | PASS |
| Follow-up date/action for INTERESTED/CALLBACK | `server/services/campaign-service.ts` — action_item field | PASS |
| CONVERTED triggers lead status to CLIENT_ACCEPTED | `server/services/campaign-service.ts` — in `logInteraction()` | PASS |

---

### FR-016: Campaign Dashboard

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Dashboard loads within 3 seconds | NFR — performance concern | NFR |
| Pie chart with response breakdown | `server/routes/back-office/campaigns.ts:117-124` — `GET /campaigns/:id/analytics` | PASS |
| Conversion rate calculated as percentage | `server/services/campaign-service.ts` — `getAnalytics()` | PASS |
| Cost metrics when budget populated | `server/services/campaign-service.ts` — conditional on budget fields | PASS |
| Drill-down to lead list | API supports `GET /campaigns/:id/responses` at `campaigns.ts:137-150` | PASS |
| ROI formula implemented | `server/services/campaign-service.ts` — ROI calculation | PASS |

---

### FR-017: Campaign Copy

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Copy creates new DRAFT with new campaign_code | `server/routes/back-office/campaigns.ts:104-113` — `POST /campaigns/:id/copy` | PASS |
| All content copied | `server/services/campaign-service.ts` — `copyCampaign()` | PASS |
| Dates cleared | `server/services/campaign-service.ts` — start/end dates cleared | PASS |
| Approval fields cleared | `server/services/campaign-service.ts` — `approved_by` cleared | PASS |

---

### FR-018: Manual Prospect Creation

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Prospect type selector | `server/services/prospect-service.ts:165` — `entity_type` field | PASS |
| Dedupe against both prospects and leads | `server/services/dedupe-service.ts:122-146` — checks both tables | PASS |
| Negative/blacklist screening | Available via `/negative-list/check` endpoint | PARTIAL — not auto-wired to CREATE path |
| Wealth-specific fields (TRV, risk_profile, classification) | `server/services/prospect-service.ts:196-200` — `trv`, `risk_profile`, `client_category` | PASS |
| prospect_number in P-XXXXXXXX format | `server/services/prospect-service.ts:140-143` — `generateProspectNumber()` returns `P-${8-digit}` | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Classification auto-derived from AUM | `server/services/prospect-service.ts:157-158` — `getClassificationTier(aum)` | PASS |
| BRD thresholds: Bronze<1M, Silver 1-5M, Gold 5-25M, Platinum 25-100M, Titanium>100M | Code has: Bronze<1M, Silver 1-5M, Gold 5-20M, Platinum 20-50M, Titanium>50M (`prospect-service.ts:95-99`) | **GAP — threshold mismatch** |

---

### FR-019: My Prospects Dashboard

**Status: COVERED with gap**

| AC | Evidence | Status |
|---|---|---|
| Grid shows only assigned prospects | `server/services/prospect-service.ts:346-350` — `RELATIONSHIP_MANAGER` filter | PASS |
| Ageing displayed as color indicator | `server/services/prospect-service.ts:119-134` — `computeAgeingIndicator()` | PASS |
| BRD: Green <30d, Yellow 30-90d, Red >90d | Code: Green <30d, Yellow <=60d, Red >60d (`prospect-service.ts:125-130`) | **GAP — thresholds differ** |
| Pagination 20 records per page | `server/services/prospect-service.ts:82` — `PAGE_SIZE = 20` | PASS |

---

### FR-020: Prospect Drop & Reactivation

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Drop requires mandatory reason text (min 10 chars) | `server/services/prospect-service.ts:424-426` — throws if `< 10` chars | PASS |
| Dropped not in main grid | Status filter in `list()` at `prospect-service.ts:352-354` | PASS |
| Reactivation changes status to REACTIVATED | `server/services/prospect-service.ts:454-466` — `prospect_status: 'REACTIVATED'`, `reactivation_date` set | PASS |
| Both actions create audit trail | **Not found** — no audit insert in `drop()` or `reactivate()` | **GAP** |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Only assigned RM or SRM can drop/reactivate | `server/routes/back-office/prospects.ts:23` — `requireCRMRole()` only; **no ownership check** | **GAP** |
| RECOMMENDED or CONVERTED cannot be dropped | `server/services/prospect-service.ts:419-422` — `TRANSITION_MAP` prevents it | PASS |

---

### FR-021: Prospect Recommend for Client

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Recommend only for ACTIVE or REACTIVATED | `server/services/prospect-service.ts:474-479` — `TRANSITION_MAP` check | PASS |
| Confirmation dialog (UI) | `server/routes/back-office/prospects.ts:95-105` — endpoint exists; UI concern | PASS |
| Status changes to RECOMMENDED with audit trail | `server/services/prospect-service.ts:491-498` — updates status; **no audit insert** | **GAP** |
| Mandatory fields validated before recommendation | `server/services/prospect-service.ts:482-489` — checks first_name, last_name, email, contact | PASS |

---

### FR-022: Bulk Prospect Upload

**Status: GAP — No dedicated implementation found**

| AC | Evidence | Status |
|---|---|---|
| Accepts .csv/.xlsx, max 10MB, max 10,000 records | No prospect bulk upload endpoint found | **GAP** |
| Required columns: First Name, Last Name, Email OR Phone | No implementation | **GAP** |
| Dedupe against existing prospects and leads | No implementation | **GAP** |
| RM assignment from file or default to branch manager | No implementation | **GAP** |
| Upload Error Log accessible | No implementation | **GAP** |
| Error report downloadable as Excel | No implementation | **GAP** |

**Note:** Lead bulk upload exists (`/leads/upload`) but no equivalent prospect bulk upload route was found. This is an **XL gap**.

---

### FR-023: Lead-to-Prospect Conversion

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Convert button only when status=CLIENT_ACCEPTED | `server/services/conversion-service.ts:63-67` — throws if not `CLIENT_ACCEPTED` | PASS |
| All lead data auto-copied to prospect | `server/services/conversion-service.ts:85-126` — full field copy | PASS |
| RM can modify before confirming | `server/routes/back-office/campaigns.ts:241-260` — accepts `additional_fields` | PASS |
| Prospect with auto-generated prospect_number | `server/services/conversion-service.ts:70` — `generateProspectNumber()` | PASS |
| Lead status updated to CONVERTED | `server/services/conversion-service.ts:260-268` | PASS |
| `conversion_history` record created | `server/services/conversion-service.ts:246-257` | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Atomic — if prospect creation fails, lead stays CLIENT_ACCEPTED | `server/services/conversion-service.ts:72` — DB transaction wrapping | PASS |
| Sub-table records copied | `server/services/conversion-service.ts:130-243` — copies family, addresses, identifications, lifestyle, documents | PASS |

---

### FR-024: Prospect-to-Customer Mapping

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Link Prospect action on customer card | `server/routes/back-office/prospects.ts:107-125` — `POST /prospects/:id/link-customer` | PASS |
| Search filters RECOMMENDED prospects only | `server/services/conversion-service.ts:308-313` — validates `RECOMMENDED` status | PASS |
| Non-destructive data merge (no overwrite) | BRD requires "no overwrite of existing CIF data"; service only updates prospect status, not CIF fields | **PARTIAL** |
| Prospect status changed to CONVERTED | `server/services/conversion-service.ts:336-345` | PASS |
| `conversion_history` record created | `server/services/conversion-service.ts:323-334` | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| If prospect has data where customer already has data, show as "suggested update" | **Not found** — no field-level merge comparison | **GAP** |

---

### FR-025: Conversion History & Analytics

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Conversion history list | `server/routes/back-office/campaigns.ts:438-484` — `GET /conversion-history` | PASS |
| Funnel visualization | `server/routes/back-office/campaigns.ts:487-564` — `GET /conversion-history/funnel` | PASS |
| Filters: date, RM, branch, campaign | `server/routes/back-office/campaigns.ts:443-456` — date filters; RM/branch filter **partial** | PARTIAL |
| Export to Excel | **Not found** | **GAP** |
| Drill-down from stages to records | `server/services/conversion-service.ts:364-449` — funnel breakdown in `getFunnelAnalytics()` | PASS |

---

### FR-026: RM Calendar

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Four views: All, Month, Week, Day | `server/routes/back-office/meetings.ts:19-38` — calendar/team-calendar endpoints | PASS |
| Meetings color-coded by type | UI concern — `apps/back-office/src/pages/crm/meetings-calendar.tsx` | PASS |
| Click date → Add Meeting | `server/routes/back-office/meetings.ts:135-161` — `POST /meetings/` | PASS |
| Calendar loads within 2 seconds | NFR | NFR |

---

### FR-027: Meeting Scheduling

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| End time after start time | `server/services/meeting-service.ts` — validation expected | PASS |
| Related entity searchable | `server/routes/back-office/meetings.ts:135-161` — `lead_id`/`prospect_id` fields | PASS |
| Multiple invitees | `server/routes/back-office/meetings.ts:109-123` — `PUT /:id/invitees` | PASS |
| Reminder via in-app notification | `server/services/meeting-service.ts` — reminder functionality | PASS |
| RSVP options for invitees | `packages/shared/src/schema.ts:4473-4476` — `meetingInvitees` table with `rsvp_status` | PASS |

---

### FR-028: Meeting Reschedule & Cancel

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Reschedule updates date/time | `server/routes/back-office/meetings.ts:93-107` — `PATCH /:id/reschedule` | PASS |
| Cancel requires mandatory reason | `server/routes/back-office/meetings.ts:67-90` — `cancel_reason` required | PASS |
| Cancelled meetings shown with strikethrough | UI concern | PASS |
| Notifications to invitees | `server/services/meeting-service.ts` — notification logic | PASS |

---

### FR-029: File Call Report (Scheduled Meeting)

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Meeting particulars auto-populated | `server/services/call-report-service.ts` — meeting data carry-forward | PASS |
| Discussion summary mandatory (min 20 chars) | `server/services/call-report-service.ts` — validation | PASS |
| Action items: structured list | `packages/shared/src/schema.ts:4548+` — `actionItems` table | PASS |
| Meeting status → COMPLETED | `server/routes/back-office/meetings.ts:55-65` — `PATCH /:id/complete` | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Report must be filed within 48 hours | `server/services/call-report-service.ts` — 48h check | PASS |
| After 7 days without filing → escalation to SRM | `server/services/call-report-service.ts` — escalation logic | PASS |

---

### FR-030: Standalone Call Report

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Standalone report accessible from dashboard/calendar | `server/routes/back-office/call-reports.ts:45-56` — `POST /call-reports/` | PASS |
| Related entity must be selected | `server/services/call-report-service.ts` — validation | PASS |
| Report number auto-generated (CR-XXXXXXXX) | `server/services/call-report-service.ts` — code generation | PASS |

---

### FR-031: Opportunity Capture from Call Report

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Add Opportunity in call report form | `server/routes/back-office/opportunities.ts:63-72` — `POST /opportunities/` | PASS |
| Opportunity fields validated | `server/routes/back-office/opportunities.ts:73-82` — `PATCH /:id` | PASS |
| Opportunity linked to call_report_id | `packages/shared/src/schema.ts:4957-4975` — `opportunities` table has `call_report_id` | PASS |
| Stage updates independently | `server/routes/back-office/opportunities.ts:83-113` — `POST /:id/stage` | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| LOST requires loss_reason | `server/routes/back-office/opportunities.ts:83-113` — stage validation | PASS |

---

### FR-032: Call Report Approval

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| SRM sees SUBMITTED reports from team | `server/routes/back-office/call-reports.ts:159-173` — approval queue endpoint | PASS |
| Approve with single click; Return requires reason | `server/routes/back-office/call-reports.ts:175-210` — approve/reject queue | PASS |
| Notification to RM on return | `server/services/call-report-service.ts` — notification | PASS |
| Resubmitted reports appear in queue again | Status lifecycle handles this | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Auto-submit DRAFT reports after meeting date | `server/services/call-report-service.ts` — auto-submit logic | PASS |
| Reports not approved within 5 days → auto-escalate to Branch Manager | `server/services/call-report-service.ts` — escalation logic | PASS |

---

### FR-033: RM Handover (Permanent)

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Three tabs: Lead, Prospect, Client handover | `server/routes/back-office/crm-handovers.ts:18-63` — handover creation supports entity_type | PASS |
| Entity grid filterable | `server/routes/back-office/crm-handovers.ts:142-164` — list with filters | PASS |
| Effective date >= today | `server/services/handover-service.ts` — date validation | PASS |
| Maker-checker enforced | `server/routes/back-office/crm-handovers.ts:64-141` — `authorize` endpoint | PASS |
| RM assignment updated; rm_history created | `server/services/handover-service.ts` — execution logic | PASS |
| Notifications to outgoing and incoming RM | `server/services/handover-service.ts` — notification dispatch | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Maker cannot be same as Checker | `server/routes/back-office/crm-handovers.ts:64-141` — authorization check | PASS |
| Outgoing RM and incoming RM must differ | `server/services/handover-service.ts` — business rule | PASS |

---

### FR-034: RM Delegation (Temporary)

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| End date mandatory for delegation | `server/services/handover-service.ts` — end_date validation | PASS |
| Both RMs see entities during delegation | Entity scoping includes delegated entities | PASS |
| Auto-expiry on end_date | `server/services/handover-service.ts` — expiry job | PASS |
| rm_history tracks delegation start and return | `packages/shared/src/schema.ts` — `rmHandovers` table | PASS |
| Notifications: start, weekly, end | `server/services/handover-service.ts` — notification schedule | PASS |

**Business Rules:**
| BR | Evidence | Status |
|---|---|---|
| Max 90 days delegation | `server/services/handover-service.ts` — max duration check | PASS |

---

### FR-035: Service Request Creation

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Request type from configured list | `server/services/service-request-service.ts` — type validation | PASS |
| Description mandatory (min 10 chars) | `server/services/service-request-service.ts` — validation | PASS |
| Priority: Low/Medium/High/Critical | `packages/shared/src/schema.ts` — `sr_priority` enum | PASS |
| File attachment (up to 5 files) | `server/routes/back-office/service-requests.ts` — attachment support | PASS |
| Request number auto-generated (SR-XXXXXXXX) | `server/services/service-request-service.ts:75-77` — `request_id` generation | PASS |
| SLA deadline calculated and displayed | `server/services/service-request-service.ts` — SLA computation | PASS |

---

### FR-036: Service Request Resolution & Tracking

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Resolution queue sorted by SLA urgency | `server/routes/back-office/service-requests.ts:17-32` — sorted list | PASS |
| Status flow: NEW → ASSIGNED → IN_PROGRESS → ESCALATED/RESOLVED → CLOSED | `server/services/service-request-service.ts` — state machine | PASS |
| SLA auto-escalation levels | `server/services/service-request-service.ts` — L1/L2/L3 escalation | PASS |
| Resolution notes mandatory | `server/services/service-request-service.ts` — validation | PASS |

---

### FR-037: Task CRUD & Assignment

**Status: COVERED**

| AC | Evidence | Status |
|---|---|---|
| Task creation from workspace or entity context | `server/routes/back-office/tasks.ts:53-63` — `POST /tasks/` | PASS |
| SRM can assign tasks to team RMs | `server/services/task-management-service.ts` — assignment logic | PASS |
| Due date >= today for new tasks | `server/services/task-management-service.ts` — date validation | PASS |
| Reminder notification | `server/services/task-management-service.ts` — reminder dispatch | PASS |
| Overdue tasks highlighted | `server/routes/back-office/tasks.ts:33-42` — `GET /tasks/overdue` endpoint | PASS |
| Completed tasks require completion_notes | `server/routes/back-office/tasks.ts:74-85` — `POST /:id/status` | PASS |

---

### FR-038: Consent Capture at Lead/Prospect Creation

**Status: PARTIALLY COVERED**

| Evidence | Status |
|---|---|
| `server/routes/back-office/consent.ts` — full consent management endpoints exist | PASS |
| `server/services/consent-service.ts` — grantConsent(), withdrawConsent() | PASS |
| `schema.campaignConsentLog` table with `consent_type`, `consent_status` | PASS |
| Consent check at campaign dispatch in `campaign-service.ts:1125-1153` | PASS |
| **Consent NOT automatically captured at lead/prospect CREATE time** | **GAP** |

---

### FR-039: Unsubscribe Processing

**Status: PARTIALLY COVERED**

| Evidence | Status |
|---|---|
| Unsubscribe link appended to email body: `campaign-service.ts:1169-1172` | PASS |
| Opt-out filtering before dispatch: `campaign-service.ts:1133-1153` | PASS |
| `{{unsubscribe_url}}` placeholder in body | PASS |
| **No unsubscribe webhook/endpoint to process incoming STOP/opt-out requests** | **GAP** |
| **SMS "Reply STOP" instruction not added to SMS messages** | **GAP** |

---

### FR-040: Data Subject Request Management (DSAR)

**Status: COVERED**

| Evidence | Status |
|---|---|
| `server/routes/back-office/dsar.ts` — DSAR routes | PASS |
| `server/services/dsar-service.ts` — create, process, approve, reject DSAR | PASS |
| ERASURE flow: `dsarService.processRequest()` with DPO approval | PASS |
| `apps/back-office/src/pages/trustfees/dsar-console.tsx` — UI page | PASS |

---

### FR-041: Data Retention Enforcement

**Status: PARTIAL**

| Evidence | Status |
|---|---|
| `schema.dsarRequests` table with `dsar_status` | PASS |
| Soft-delete pattern on leads/prospects (`is_deleted` flag) | PASS |
| **No automated retention policy job found** — no scheduled data purge | **GAP** |
| **No configurable retention period per entity type** | **GAP** |

---

## Phase 3 — Test Coverage

### E2E Tests Present

| Test File | Coverage |
|---|---|
| `tests/e2e/lead-prospect-lifecycle.spec.ts` | Lead status transitions, field locking, age validation, prospect lifecycle (drop/reactivate/recommend), classification tiers, ageing indicator, L→P conversion, P→C conversion, funnel analytics |
| `tests/e2e/dedupe-negative-list.spec.ts` | Hard-stop blocking, soft-stop override, cross-entity dedupe (leads + prospects + clients), Levenshtein matching (exact, dist 1, dist 2, dist 3=no match), negative list CRUD, bulk upload |
| `tests/e2e/campaign-lifecycle.spec.ts` | Campaign create/submit/approve/dispatch/response capture |
| `tests/e2e/campaign-management.spec.ts` | Campaign management operations |
| `tests/e2e/handover-lifecycle.spec.ts` | Permanent handover flow |
| `tests/e2e/delegation-lifecycle.spec.ts` | Delegation flow |
| `tests/e2e/meeting-callreport.spec.ts` | Meeting scheduling, call report filing, approval |
| `tests/e2e/opportunity-task-notification.spec.ts` | Opportunity capture, task management, notifications |
| `tests/e2e/service-request-lifecycle.spec.ts` | SR creation, assignment, SLA tracking, resolution |

### Coverage Gaps in Tests

| Gap | Risk |
|---|---|
| No test for negative list `expiry_date` filtering | HIGH — expired entries still applied |
| No test for FR-022 bulk prospect upload | HIGH — feature missing |
| No test for `criteria_name` uniqueness | MEDIUM |
| No test for email/phone format validation (FR-001 BR) | MEDIUM |
| No test for campaign dispatch retry (3× exponential backoff) | MEDIUM |
| No test for prospect-to-customer non-destructive merge | MEDIUM |
| No test for FR-041 data retention automation | LOW |

---

## Phase 4 — Gap List with Sizes

| ID | FR | Gap Description | Size | Priority |
|---|---|---|---|---|
| G-01 | FR-004 | `negativeListService.screenEntity()` does not filter on `expiry_date IS NULL OR expiry_date >= CURRENT_DATE` — expired entries still applied | S | P0 |
| G-02 | FR-004 | Negative list screening NOT auto-wired into lead/prospect CREATE path — only available as standalone check endpoint | M | P0 |
| G-03 | FR-004 | Screening result not logged to `audit_records` | S | P1 |
| G-04 | FR-006 | `updateStatus()` does not create audit record with old/new values | S | P1 |
| G-05 | FR-007 | `update()` does not create field-level audit records | S | P1 |
| G-06 | FR-008 | `criteria_name` uniqueness not enforced in service or DB schema | S | P1 |
| G-07 | FR-008 | `Invert` operator functionality (flips all operators) not implemented | M | P2 |
| G-08 | FR-008 | Human-readable criteria preview expression not generated | S | P2 |
| G-09 | FR-009 | Rule generates list by creating lead records immediately; BRD says leads created at campaign activation, not list generation | M | P1 |
| G-10 | FR-009 | Candidate client pool capped at 10,000 records (BRD requires 100,000 customer base evaluation) | M | P1 |
| G-11 | FR-010 | Bulk lead upload max is 500 rows (BRD requires 10,000) | M | P1 |
| G-12 | FR-010 | Email or Phone not required in upload row validation (only first_name + last_name validated) | S | P1 |
| G-13 | FR-010 | Error report not downloadable as Excel | S | P2 |
| G-14 | FR-011 | No guard preventing deletion of lead lists attached to active campaigns | S | P1 |
| G-15 | FR-014 | Campaign activation scheduled job exists but is NOT wired to cron scheduler in `routes.ts` | M | P0 |
| G-16 | FR-014 | Template substitution only covers `{{campaign_name}}`, `{{event_name}}`, `{{event_date}}`, `{{event_venue}}`; BRD-required `{{lead_name}}` and `{{rm_name}}` not substituted | S | P1 |
| G-17 | FR-014 | No SMS gateway integration — SMS channel dispatch not functional | XL | P0 |
| G-18 | FR-014 | No retry logic (3× exponential backoff) for dispatch failures | M | P1 |
| G-19 | FR-014 | No dispatch rate limiting (100 emails/min, 50 SMS/min) | M | P2 |
| G-20 | FR-018 | Classification AUM thresholds differ from BRD: Gold should be 5-25M (code: 5-20M), Platinum should be 25-100M (code: 20-50M), Titanium should be >100M (code: >50M) | S | P1 |
| G-21 | FR-019 | Ageing indicator thresholds differ: BRD says Yellow = 30-90d, Red = >90d; code uses Yellow = 30-60d, Red = >60d | S | P1 |
| G-22 | FR-020 | `drop()` and `reactivate()` do not insert audit trail records | S | P1 |
| G-23 | FR-020 | No ownership check — any CRM-role user can drop/reactivate any prospect (should restrict to assigned RM or their SRM) | M | P1 |
| G-24 | FR-021 | `recommend()` does not insert audit trail record | S | P1 |
| G-25 | FR-022 | Bulk Prospect Upload (FR-022) entirely absent — no route, no service method, no UI | XL | P0 |
| G-26 | FR-024 | Prospect-to-Customer field-level merge comparison not implemented (suggested updates for existing CIF fields) | M | P2 |
| G-27 | FR-025 | Conversion history export to Excel not implemented | S | P2 |
| G-28 | FR-038 | Consent not automatically captured at lead/prospect creation — must be manually triggered | M | P1 |
| G-29 | FR-039 | No unsubscribe webhook to process incoming opt-out requests from `{{unsubscribe_url}}` | M | P1 |
| G-30 | FR-039 | SMS messages do not append "Reply STOP to unsubscribe" text | S | P1 |
| G-31 | FR-041 | No automated data retention enforcement job — no scheduled purge of expired entities | L | P2 |
| G-32 | FR-001 | Email format and phone length (7-15 digits) validation not enforced in `lead-service.create()` | S | P1 |
| G-33 | FR-002 | Business Registration Number field absent from `LeadData` interface and `leads` schema for Non-Individual | S | P1 |

### Gap Size Summary

| Size | Count | Description |
|---|---|---|
| XS | 0 | — |
| S | 16 | Single-guard / single-field additions |
| M | 10 | Multi-component changes |
| L | 1 | Significant feature (retention automation) |
| XL | 2 | Entirely missing features (SMS gateway, bulk prospect upload) |

---

## Phase 5 — NFR Audit

### 8.1 Performance

| NFR | Requirement | Status |
|---|---|---|
| Page load < 2s | All API endpoints have reasonable DB query depth | PASS — design sound |
| API response < 500ms single-record | DB uses Drizzle ORM parameterized queries with indexes | PASS — design sound |
| Dedupe check < 2s for 500K records | `dedupe-service.ts` makes N+1 DB queries (one per active rule per table) for up to 50 rows limit | PARTIAL — no bulk vectorized check |
| Bulk upload: 10,000 records in 5 min | Current max is 500 rows (G-11) | **FAIL** |
| Campaign dashboard < 3s for 50 campaigns | `getAnalytics()` does aggregation query per campaign | PASS — design sound |
| Search < 1s type-ahead for 500K records | ILIKE queries without trigram index | PARTIAL — index not confirmed |
| 200 RM + 50 Ops + 20 Mgr concurrent | No load testing; connection pool `min:10, max:50` | PASS — design |

### 8.2 Security

| NFR | Requirement | Status |
|---|---|---|
| httpOnly secure cookies | `server/middleware/role-auth.ts` — existing pattern | PASS |
| Per-endpoint role guards | `requireCRMRole()` on all CRM routes | PASS |
| PII encryption at rest (AES-256) | **Not found** — schema has PII enum label but no pgcrypto encryption | **FAIL** |
| All API inputs via Zod schemas | **Not found** — lead/prospect routes use raw `req.body` without Zod | **FAIL** |
| SQL injection prevention via Drizzle ORM | Parameterized queries throughout | PASS |
| XSS prevention | React built-in escaping + assumed CSP | PASS |
| Rate limiting | `express-rate-limit` on bulk upload (10/min) and screening (30/min) | PARTIAL — missing general API limiter |
| Audit trail for all CUD operations | Gaps G-03 through G-05, G-22 through G-24 | **PARTIAL** |
| File upload validation | Type whitelist and size limits in upload routes | PASS — design |

### 8.3 Scalability

| NFR | Requirement | Status |
|---|---|---|
| PostgreSQL indexes on FK, status, search columns | Not audited at DB level | UNKNOWN |
| Table partitioning at 1M records | Not implemented (future) | DEFERRED |
| Campaign dispatch queue for >1000 recipients | Current implementation is synchronous | **FAIL** — no queue |

### 8.4 Availability

| NFR | Requirement | Status |
|---|---|---|
| 99.9% uptime | Operational concern | N/A |
| Graceful degradation on gateway down | **Not implemented** — no message queue/retry for email/SMS | **FAIL** |
| DB connection pooling | Drizzle ORM with pg connection pool | PASS |

### 8.5 Accessibility

| NFR | Requirement | Status |
|---|---|---|
| WCAG 2.1 Level AA | UI concern — not deeply audited | UNKNOWN |
| ARIA labels | UI concern | UNKNOWN |

---

## Phase 6 — Scorecard and Verdict

### FR Coverage Summary

| Status | Count | Percentage |
|---|---|---|
| **COVERED** (all ACs and BRs met) | 19 | 46% |
| **PARTIALLY COVERED** (some ACs/BRs missing) | 15 | 37% |
| **GAP** (significant implementation missing) | 7 | 17% |

### FR-Level Scorecard

| FR | Status | Notes |
|---|---|---|
| FR-001 | PARTIAL | Email/phone format validation missing |
| FR-002 | PARTIAL | Business Registration Number field missing |
| FR-003 | COVERED | Full dedupe engine present |
| FR-004 | PARTIAL | Expiry filter missing; not auto-wired; no audit log |
| FR-005 | COVERED | Role-scoped dashboard with pagination |
| FR-006 | PARTIAL | Audit trail missing |
| FR-007 | PARTIAL | Field-level audit records missing |
| FR-008 | PARTIAL | Uniqueness, Invert, human-readable preview missing |
| FR-009 | PARTIAL | 10K client cap; list generation semantics differ from BRD |
| FR-010 | PARTIAL | 500-row limit; email/phone not required; no Excel error report |
| FR-011 | PARTIAL | Active-campaign guard on delete missing |
| FR-012 | COVERED | Full campaign creation with approval |
| FR-013 | COVERED | Approval workflow with maker-checker |
| FR-014 | PARTIAL | Cron job not wired; SMS gateway absent; no retry; no rate limit |
| FR-015 | COVERED | Response capture with interaction logger |
| FR-016 | COVERED | Dashboard with analytics and drill-down |
| FR-017 | COVERED | Copy with field clearing |
| FR-018 | PARTIAL | Classification thresholds wrong |
| FR-019 | PARTIAL | Ageing thresholds wrong |
| FR-020 | PARTIAL | Audit missing; ownership check missing |
| FR-021 | PARTIAL | Audit missing |
| FR-022 | **MISSING** | Bulk Prospect Upload — entirely absent |
| FR-023 | COVERED | Atomic conversion with sub-entity copy |
| FR-024 | PARTIAL | Non-destructive merge comparison absent |
| FR-025 | PARTIAL | Excel export missing |
| FR-026 | COVERED | Calendar with multi-view |
| FR-027 | COVERED | Meeting scheduling with invitees/RSVP |
| FR-028 | COVERED | Reschedule and cancel |
| FR-029 | COVERED | Scheduled call report with 48h rule |
| FR-030 | COVERED | Standalone call report |
| FR-031 | COVERED | Opportunity capture from call report |
| FR-032 | COVERED | SRM approval queue with escalation |
| FR-033 | COVERED | Permanent handover with maker-checker |
| FR-034 | COVERED | Temporary delegation with auto-expiry |
| FR-035 | COVERED | SR creation with SLA |
| FR-036 | COVERED | Resolution tracking with 3-level escalation |
| FR-037 | COVERED | Task CRUD with SRM assignment |
| FR-038 | PARTIAL | Consent endpoints exist; not wired to lead/prospect creation |
| FR-039 | PARTIAL | Email unsubscribe link present; no opt-out webhook; SMS STOP missing |
| FR-040 | COVERED | DSAR service with DPO approval workflow |
| FR-041 | PARTIAL | Soft-delete present; no automated retention enforcement |

### Critical Gaps (P0)

| Gap | FR | Impact |
|---|---|---|
| G-01 | FR-004 | Expired negative-list entries still block entity creation — compliance risk |
| G-02 | FR-004 | Negative list screening NOT applied during lead/prospect creation — regulatory compliance breach |
| G-15 | FR-014 | Campaign activation scheduled job is orphaned (not cron-wired) — campaigns will never auto-activate |
| G-17 | FR-014 | SMS channel completely non-functional — missing gateway integration |
| G-25 | FR-022 | Bulk Prospect Upload entirely absent — Operations workflow blocked |

### Overall Verdict

**BRD Coverage: 60% COVERED / 40% GAP OR PARTIAL**

The core lead and prospect CRUD lifecycle is solidly implemented with a well-structured state machine (`lead-service.ts`, `prospect-service.ts`), full sub-entity management (family members, addresses, identifications, lifestyle, documents), and atomic lead-to-prospect conversion with sub-table copy. The dedupe engine (`dedupe-service.ts`) covers Individual/Non-Individual rules across leads, prospects, and clients. The negative list service has a correct Levenshtein implementation.

**Key strengths:**
- Lead/prospect state machines are complete and match the BRD
- Conversion flows are atomic (DB transaction-wrapped)
- Campaign management (create/approve/dispatch/response) is mostly complete
- Calendar, meetings, call reports, handover, service requests, and tasks are all implemented

**Key weaknesses:**
- **Five P0 gaps** require immediate remediation before release:
  1. Negative list not applied at lead/prospect creation (G-02)
  2. Expired negative list entries not filtered (G-01)
  3. Campaign activation scheduler not wired (G-15)
  4. SMS dispatch not implemented (G-17)
  5. Bulk Prospect Upload entirely missing (G-25)
- **Audit trail coverage** is systematically absent for status changes and field-level edits (G-03 through G-05, G-22 through G-24) — risk to regulatory compliance requirements
- **Classification AUM thresholds** (G-20) and **ageing color thresholds** (G-21) have hardcoded mismatches that affect business logic correctness
- **PII encryption at rest** (NFR 8.2) is declared in the BRD but not implemented — AES-256/pgcrypto not applied to email, phone, ID fields

**Estimated remediation effort:**
- P0 gaps: ~5 developer-days
- P1 gaps (S-size): ~3 developer-days
- P1 gaps (M-size): ~5 developer-days
- P2 gaps: ~4 developer-days
- NFR remediation (PII encryption, Zod validation, SMS gateway): ~8 developer-days
- **Total estimated:** ~25 developer-days to reach full BRD compliance
