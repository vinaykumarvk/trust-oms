# Gap Analysis: Handover & Assignment Management (HAM) Module

**Date:** 2026-04-22
**BRD Reference:** BRD-TRUSTOMS-HAM-2026-001 v2.0 (Post-Adversarial Review)
**Codebase Reference:** Trust OMS main branch @ commit 1d0f244

---

## 1. Executive Summary

The HAM BRD defines 17 functional requirements (FR-001 through FR-017), 9 data model entities, 27 API endpoints, and supporting UI/navigation requirements. The codebase contains two independent schema layers for handover functionality: a **legacy CRM-era table** (`rm_handovers`) and a **newer HAM-specific schema** (`handovers`, `handoverItems`, `scrutinyTemplates`, `scrutinyChecklistItems`, `complianceGates`, `handoverAuditLog`, `slaConfigurations`). The newer schema is significantly more comprehensive but is missing several BRD-required entities. There are **no dedicated server routes**, **no dedicated server services**, and **no dedicated tests** for the HAM module. The frontend has a basic handover page that targets the legacy schema only.

### Classification Summary

| Status     | Count | Percentage |
|------------|-------|------------|
| EXISTS     | 0     | 0%         |
| PARTIAL    | 6     | 35%        |
| MISSING    | 11    | 65%        |
| CONFLICT   | 3     | (overlay)  |

> Note: CONFLICT items overlap with PARTIAL/MISSING counts -- they indicate where existing code contradicts the BRD.

---

## 2. Schema Analysis

### 2.1 BRD Entity vs Codebase Mapping

The BRD defines 9 data model entities. The codebase has two competing schema layers:

| # | BRD Entity | BRD Fields | Codebase Entity | Status | Notes |
|---|-----------|-----------|----------------|--------|-------|
| 1 | HandoverRequest | 17 fields | `handovers` (newer, lines 5050-5074) + `rmHandovers` (legacy, lines 4371-4386) | **PARTIAL / CONFLICT** | Two competing tables; see section 2.2 |
| 2 | HandoverItem | 14 fields | `handoverItems` (lines 5076-5102) | **PARTIAL** | Exists but missing several BRD fields |
| 3 | ScrutinyChecklist | 8 fields | `scrutinyChecklistItems` (lines 5115-5125) | **PARTIAL** | Exists with different field naming |
| 4 | ChecklistItemConfig | 10 fields | `scrutinyTemplates` (lines 5104-5113) | **PARTIAL** | Exists but missing `applies_to` field |
| 5 | DelegationRequest | 18 fields | None | **MISSING** | No delegation-specific table exists |
| 6 | DelegationItem | 8 fields | None | **MISSING** | No delegation item table exists |
| 7 | BulkUploadLog | 11 fields | None (HAM-specific) | **MISSING** | Generic `leadUploadBatches` exists for CRM but not for HAM bulk handover |
| 8 | HandoverAuditLog | 12 fields | `handoverAuditLog` (lines 5140-5159) | **PARTIAL** | Exists but BRD specifies additional fields |
| 9 | HandoverNotification | 12 fields | None | **MISSING** | No HAM-specific notification table exists |

### 2.2 Dual Schema Conflict (HandoverRequest)

There are **two competing tables** for handover requests:

**Legacy table: `rm_handovers`** (schema.ts line 4371)
- File: `/Users/n15318/Trust OMS/packages/shared/src/schema.ts`
- Uses `handoverTypeEnum` with values: `['PERMANENT', 'TEMPORARY']`
- Simple flat structure: `from_rm_id`, `to_rm_id`, `entity_type` (text), `entity_id`, `reason`, `effective_date`, `end_date`, `handover_status` (uses generic `approvalStatusEnum`)
- **Used by the existing frontend page** via CRUD API at `/api/v1/rm-handovers`
- Missing: version field, incoming SRM, branch code, scrutiny checklist, items relationship

**Newer table: `handovers`** (schema.ts line 5050)
- Uses `handoverStatusEnum` with values: `['draft', 'pending_auth', 'authorized', 'rejected', 'cancelled', 'bulk_pending_review', 'reversed', 'pending_reversal']`
- Uses `handoverEntityTypeEnum` with values: `['lead', 'prospect', 'client']`
- Much richer structure: `handover_number`, `incoming_srm_id`, `incoming_referring_rm_id`, `incoming_branch_rm_id`, `sla_deadline`, reversal fields, `is_bulk_upload`, `requires_client_consent`
- Has full relations defined (items, scrutinyChecklistItems, complianceGates)
- **Not registered in any route file** -- no API serves this table
- **Not used by any frontend page**

**CONFLICT:** The BRD `HandoverRequest.handover_type` expects `'LEAD' | 'PROSPECT' | 'CLIENT'` (the entity type being handed over). The legacy table conflates this with transfer type (`'PERMANENT' | 'TEMPORARY'`). The newer table uses `entity_type` enum correctly but calls the parent field `entity_type` rather than `handover_type`.

### 2.3 Detailed Field-Level Gaps

#### HandoverRequest (BRD 4.1) vs `handovers` table

| BRD Field | Codebase Field | Status |
|-----------|---------------|--------|
| id (UUID) | id (serial integer) | **CONFLICT** -- BRD says UUID, codebase uses auto-increment integer |
| handover_type (ENUM: LEAD/PROSPECT/CLIENT) | entity_type (handoverEntityTypeEnum) | EXISTS (renamed) |
| status (PENDING/AUTHORIZED/REJECTED) | status (handoverStatusEnum) | **PARTIAL** -- codebase has more states (draft, cancelled, reversed, etc.) which is a superset |
| version (INTEGER, optimistic locking) | Not present | **MISSING** -- No optimistic locking field |
| outgoing_rm_id | outgoing_rm_id | EXISTS |
| outgoing_rm_name | Not present | **MISSING** -- BRD requires denormalized name |
| incoming_rm_id | incoming_rm_id | EXISTS |
| incoming_rm_name | Not present | **MISSING** -- BRD requires denormalized name |
| incoming_srm_id | incoming_srm_id | EXISTS |
| incoming_srm_name | Not present | **MISSING** |
| branch_code | Not present | **MISSING** |
| handover_reason | reason | EXISTS (renamed) |
| reject_reason | rejection_reason | EXISTS (renamed) |
| initiated_by | created_by (via auditFields) | EXISTS |
| authorized_by | authorized_by | EXISTS |
| authorized_at | authorized_at | EXISTS |
| created_at / updated_at | via auditFields | EXISTS |

**Extra fields in codebase not in BRD:** `handover_number`, `incoming_referring_rm_id`, `incoming_branch_rm_id`, `sla_deadline`, `is_bulk_upload`, `requires_client_consent`, `client_notified_at`, `reversed_at`, `reversed_by`, `reversal_reason`, `reversal_approved_by`, `is_deleted`. These are generally additions/extensions and not conflicts.

#### HandoverItem (BRD 4.2) vs `handoverItems` table

| BRD Field | Codebase Field | Status |
|-----------|---------------|--------|
| entity_type (ENUM) | Not present | **MISSING** -- BRD has per-item entity_type; codebase only has it at parent level |
| entity_id | entity_id | EXISTS |
| entity_name | entity_name_en + entity_name_local | EXISTS (split into two fields, which is better) |
| branch_code | Not present | **MISSING** |
| cust_id | Not present | **MISSING** |
| outgoing_rm_id / outgoing_rm_name | previous_rm_id (FK, no name) | PARTIAL |
| referring_rm_id | Not present | **MISSING** |
| branch_rm_id | Not present | **MISSING** |
| aum_amount | aum_at_handover | EXISTS (renamed) |
| pending_orders_count | open_orders_count | EXISTS (renamed) |

**Extra fields in codebase:** `product_count`, `pending_settlements_count`, `last_interaction_date`, `tenure_years`, `status`, `failure_reason`, `has_trades_post_handover`.

#### ChecklistItemConfig (BRD 4.4) vs `scrutinyTemplates` table

| BRD Field | Codebase Field | Status |
|-----------|---------------|--------|
| label | label | EXISTS |
| description | description | EXISTS |
| is_mandatory | is_mandatory | EXISTS |
| applies_to (HANDOVER_ONLY/DELEGATION_ONLY/BOTH) | Not present | **MISSING** -- Critical for FR-008 (configurable delegation checklist) |
| display_order | sort_order | EXISTS (renamed) |
| is_active | is_active | EXISTS |

#### HandoverAuditLog (BRD 4.8) vs `handoverAuditLog` table

| BRD Field | Codebase Field | Status |
|-----------|---------------|--------|
| action_type (15 values) | event_type (13 values) | **PARTIAL** -- Missing: HANDOVER_AMENDED, DELEGATION_EARLY_TERMINATED, DELEGATION_EXTENSION_REQUESTED, DELEGATION_EXTENDED, BATCH_AUTHORIZE, BATCH_REJECT, BULK_UPLOAD_PREVIEW. Has extras: handover_cancelled, reversal_approved, compliance_check, compliance_override, client_notified |
| reference_type | reference_type | EXISTS |
| reference_id | reference_id | EXISTS |
| entity_type | Not present | **MISSING** |
| entity_id | Not present | **MISSING** |
| from_rm_id | Not present | **MISSING** |
| to_rm_id | Not present | **MISSING** |
| action_by | actor_id + actor_role | EXISTS (split into two fields) |
| action_details (JSON) | details (jsonb) | EXISTS |
| ip_address | ip_address | EXISTS |

#### Additional Schema (not in BRD but in codebase)

- **`complianceGates`** table (lines 5127-5138): Not in BRD. Provides per-item compliance gate checking (KYC pending, sanctions alert, etc.). This is an **extension beyond BRD scope** -- not a conflict but a codebase addition.
- **`slaConfigurations`** table (lines 5161-5169): Not in BRD. Provides configurable SLA deadlines per entity type. Extension beyond BRD scope.

### 2.4 Enum Value Mismatches

| Enum | BRD Values | Codebase Values | Status |
|------|-----------|----------------|--------|
| handover_type | LEAD, PROSPECT, CLIENT | PERMANENT, TEMPORARY (legacy) / lead, prospect, client (newer) | **CONFLICT** on legacy; case mismatch on newer (lowercase vs uppercase) |
| handover_status | PENDING, AUTHORIZED, REJECTED | draft, pending_auth, authorized, rejected, cancelled, bulk_pending_review, reversed, pending_reversal | PARTIAL -- superset but different naming (pending_auth vs PENDING) |
| scrutiny_item_status | NOT_STARTED, WORK_IN_PROGRESS, COMPLETED | pending, completed, not_applicable, work_in_progress | **CONFLICT** -- `NOT_STARTED` maps to `pending`; codebase adds `not_applicable` |
| delegation_status | ACTIVE, EXPIRED, CANCELLED, EARLY_TERMINATED | Not applicable (no delegation table) | **MISSING** |

---

## 3. Server Routes Analysis

### 3.1 Route Registration

**File:** `/Users/n15318/Trust OMS/server/routes.ts`

There is **no dedicated HAM route import or registration** in `routes.ts`. The only handover-related route is the generic CRUD route for `rm-handovers` registered in the back-office index:

```typescript
// File: /Users/n15318/Trust OMS/server/routes/back-office/index.ts (line 569-577)
router.use(
  '/rm-handovers',
  createCrudRouter(schema.rmHandovers, {
    searchableColumns: ['entity_type', 'reason'],
    defaultSort: 'effective_date',
    defaultSortOrder: 'desc',
    entityKey: 'rm-handovers',
    makerChecker: 'rm-handovers',
  }),
);
```

This provides only basic CRUD (GET list, GET by id, POST create, PUT update, DELETE) against the **legacy** `rmHandovers` table. It does **not** provide any of the 27 BRD-specified API endpoints.

### 3.2 BRD API Endpoints vs Codebase

| # | BRD Endpoint | Method | Codebase | Status |
|---|-------------|--------|----------|--------|
| 1 | `/api/back-office/handover/leads` | GET | None | **MISSING** |
| 2 | `/api/back-office/handover/prospects` | GET | None | **MISSING** |
| 3 | `/api/back-office/handover/clients` | GET | None | **MISSING** |
| 4 | `/api/back-office/handover/request` | POST | Generic CRUD POST on `/api/v1/rm-handovers` | **PARTIAL** -- exists as generic CRUD, missing BRD-specific logic (scrutiny checklist, items, validation) |
| 5 | `/api/back-office/handover/request/:id` | GET | Generic CRUD GET on `/api/v1/rm-handovers/:id` | **PARTIAL** -- exists as generic CRUD, no relations/items |
| 6 | `/api/back-office/handover/pending` | GET | None | **MISSING** |
| 7 | `/api/back-office/handover/authorize/:id` | POST | None | **MISSING** |
| 8 | `/api/back-office/handover/reject/:id` | POST | None | **MISSING** |
| 9 | `/api/back-office/handover/history` | GET | None | **MISSING** |
| 10 | `/api/back-office/handover/bulk-upload` | POST | None | **MISSING** |
| 11 | `/api/back-office/handover/upload-log/:id` | GET | None | **MISSING** |
| 12 | `/api/back-office/delegation/leads` | GET | None | **MISSING** |
| 13 | `/api/back-office/delegation/prospects` | GET | None | **MISSING** |
| 14 | `/api/back-office/delegation/clients` | GET | None | **MISSING** |
| 15 | `/api/back-office/delegation/request` | POST | None | **MISSING** |
| 16 | `/api/back-office/delegation/active` | GET | None | **MISSING** |
| 17 | `/api/back-office/delegation/cancel/:id` | POST | None | **MISSING** |
| 18 | `/api/back-office/delegation/calendar` | GET | None | **MISSING** |
| 19 | `/api/back-office/handover/dashboard` | GET | None | **MISSING** |
| 20 | `/api/back-office/handover/checklist-config` | GET | None | **MISSING** |
| 21 | `/api/back-office/handover/client-impact/:clientId` | GET | None | **MISSING** |
| 22 | `/api/back-office/handover/rms` | GET | None | **MISSING** |
| 23 | `/api/back-office/handover/request/:id` | PATCH | None | **MISSING** |
| 24 | `/api/back-office/delegation/extend/:id` | POST | None | **MISSING** |
| 25 | `/api/back-office/handover/batch-authorize` | POST | None | **MISSING** |
| 26 | `/api/back-office/handover/batch-reject` | POST | None | **MISSING** |
| 27 | `/api/back-office/handover/bulk-upload/preview` | POST | None | **MISSING** |

**Summary:** 0 of 27 BRD endpoints are fully implemented. 2 have partial coverage via generic CRUD (endpoints 4 and 5). 25 are completely missing.

### 3.3 Missing Route File

No file exists at `server/routes/back-office/handover.ts` or similar. A search across all files in `server/routes/` for "handover" or "delegation" returns only the generic CRUD registration in `index.ts`.

### 3.4 Missing Service File

No file exists at `server/services/handover-service.ts`, `server/services/delegation-service.ts`, or similar. A grep for "handover" and "delegation" across all service files returns only an unrelated reference in `gl-authorization-service.ts`.

---

## 4. Frontend Analysis

### 4.1 Existing Page

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/rm-handover.tsx`

A basic handover page exists (533 lines) with the following functionality:

| Feature | Status | Notes |
|---------|--------|-------|
| Handover list table | EXISTS | Shows handover_code, type, from/to RM, clients, dates, status |
| Create handover dialog | EXISTS | Simple form with type, from/to RM IDs (manual text input), client IDs (comma-separated CSV text), dates, reason, notes |
| KPI summary cards | EXISTS | Total, Pending, Completed, Active Delegations counts |
| Status filter tabs | EXISTS | All, Pending, Completed |
| Skeleton loading states | EXISTS | Proper loading UI |

**What is MISSING from the frontend page relative to BRD:**

| BRD Requirement | Status |
|----------------|--------|
| Leads/Prospects/Clients entity selection grids with checkboxes, column filters, pagination | **MISSING** -- Current page uses comma-separated text input for client IDs |
| Searchable RM dropdown (from RM master) | **MISSING** -- Current page uses manual text input for RM IDs |
| Scrutiny checklist section for client handovers | **MISSING** |
| AUM impact summary / portfolio impact assessment | **MISSING** |
| Pending activities warning (open orders, service requests, maturity dates) | **MISSING** |
| Authorization screen (Checker view with approve/reject) | **MISSING** |
| Delegation-specific screens (separate from handover) | **MISSING** |
| Delegation calendar (month/week visual) | **MISSING** |
| Handover history / audit trail screen | **MISSING** |
| Bulk CSV upload with preview/dry-run | **MISSING** |
| Batch authorize/reject with multi-select | **MISSING** |
| Delegation extension UI | **MISSING** |
| Accordion layout (Lead/Prospect/Client sections) | **MISSING** |
| Incoming SRM auto-population | **MISSING** |

**CONFLICT:** The existing page uses `handover_type` values of `'PERMANENT' | 'TEMPORARY' | 'DELEGATION'` from the legacy schema, whereas the BRD separates handover and delegation into entirely different request types with separate screens and workflows.

### 4.2 Route Registration

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` (line 98, 359-367)

The page is correctly imported and routed:

```typescript
const RMHandover = React.lazy(() => import("@/pages/crm/rm-handover"));
// ...
{ path: "/crm/handovers", element: <RMHandover /> }
```

Status: **EXISTS** -- route is registered but points to the inadequate legacy page.

### 4.3 Navigation Configuration

**File:** `/Users/n15318/Trust OMS/apps/back-office/src/config/navigation.ts`

There is **no navigation entry** for HAM/Handover in the sidebar. A grep for "crm", "CRM", "Handover", and "handover" returns no matches. The page at `/crm/handovers` is accessible only by direct URL navigation.

**MISSING:** BRD section 6.1 requires:
- "Relationship" menu item in left sidebar
- Card-based sub-menu with: Family Grouping, Handover, Delegation, FID Grouping
- Search bar to filter cards

### 4.4 Navigation Gap Details

The BRD specifies the following navigation structure that does not exist:

| BRD Menu Item | Expected Path | Codebase Status |
|--------------|--------------|----------------|
| Relationship > Handover | `/crm/handovers` or equivalent | Route exists but no nav entry |
| Relationship > Delegation | `/crm/delegations` or equivalent | **MISSING** entirely |
| Relationship > File Upload | `/crm/handover-upload` or equivalent | **MISSING** entirely |
| Authorization > Authorize (Handover type) | `/crm/handover-authorization` or equivalent | **MISSING** entirely |
| Dashboard (Handover) | `/crm/handover-dashboard` or equivalent | **MISSING** entirely |
| Delegation Calendar | `/crm/delegation-calendar` or equivalent | **MISSING** entirely |
| Handover History | `/crm/handover-history` or equivalent | **MISSING** entirely |

---

## 5. Middleware / Authorization Analysis

**File:** `/Users/n15318/Trust OMS/server/middleware/role-auth.ts`

### 5.1 BRD Role Requirements vs Codebase

| BRD Role | Expected Permissions | Codebase Guard | Status |
|----------|---------------------|---------------|--------|
| Operations Maker | Initiate handover/delegation, upload CSV | `requireBackOfficeRole()` allows BO_MAKER | **PARTIAL** -- generic guard exists, but no HAM-specific guard |
| Operations Checker | Authorize/reject handovers | `requireBackOfficeRole()` allows BO_CHECKER | **PARTIAL** -- same generic guard, no segregation enforcement |
| Branch Manager | Read-only dashboard/calendar | No specific guard | **MISSING** |
| System Administrator | Configure checklist, upload templates | SYSTEM_ADMIN in various guards | **PARTIAL** |
| Relationship Manager | Read own history, receive notifications | `requireFrontOfficeRole()` allows RM/SENIOR_RM | **PARTIAL** |

### 5.2 Missing HAM-Specific Guards

The BRD requires:
1. **Maker-Checker segregation**: Checker cannot authorize their own submissions. No middleware enforces this for HAM.
2. **HAM-specific role guard**: e.g., `requireHandoverRole()` combining BO_MAKER + BO_CHECKER with endpoint-level differentiation.
3. **Branch-scoped access**: Branch Manager should only see their branch's handovers.
4. **RM self-service restriction**: RMs cannot initiate handovers, only view their own history.

The `PERMISSION_MATRIX` in role-auth.ts (line 163) does not include any `handover` or `delegation` entries.

---

## 6. Functional Requirement Gap Details

### FR-001: Lead Handover
**Status: PARTIAL**

| What Exists | What is Missing |
|------------|----------------|
| Legacy `rm_handovers` table can store lead transfers | Dedicated entity selection grid for leads with column filtering |
| Basic create dialog in frontend | Lead-specific columns (Lead ID, Lead Name EN/Local, RM Owner) |
| | Incoming RM/SRM auto-population from RM master |
| | Validation rules (incoming != outgoing RM, no concurrent pending) |
| | HandoverItems creation (multiple leads per request) |
| | Dedicated API endpoint `GET /handover/leads` |
| | Success toast pattern as specified in BRD |

### FR-002: Prospect Handover
**Status: PARTIAL**

Same as FR-001 but for prospects. Prospect master data exists but no prospect-specific handover workflow.

### FR-003: Client Handover (with scrutiny checklist)
**Status: PARTIAL**

| What Exists | What is Missing |
|------------|----------------|
| `handovers` schema has structure for client handover | Scrutiny checklist enforcement before save |
| `scrutinyTemplates` and `scrutinyChecklistItems` tables exist | Scrutiny checklist UI section in frontend |
| | Client-specific columns (Branch, Cust ID, Referring RM, Branch RM) |
| | AUM impact summary display |
| | Pending activities warning (open orders, maturity dates) |
| | Incoming RM/Branch RM/Referring RM assignment UI |
| | All mandatory checklist items must be COMPLETED validation |

### FR-004: Bulk Client Handover via CSV Upload
**Status: MISSING**

| What Exists | What is Missing |
|------------|----------------|
| Generic bulk upload service exists (`server/services/bulk-upload-service.ts`) | HAM-specific CSV upload processing |
| `leadUploadBatches` table exists for CRM lead uploads | `BulkUploadLog` table for HAM bulk handover |
| | Preview/dry-run endpoint (`POST /bulk-upload/preview`) |
| | CSV format: Client ID, Incoming RM ID, Handover Reason |
| | File validation (10MB limit, 5000 row max) |
| | Per-row audit logging |
| | Supervisor email notification |
| | Async background job processing |
| | Active delegation auto-cancellation |

### FR-005: Handover Authorization (Maker-Checker)
**Status: MISSING**

| What Exists | What is Missing |
|------------|----------------|
| Generic `makerChecker` flag on `rm-handovers` CRUD route | Dedicated authorization screen |
| | `POST /handover/authorize/:id` endpoint |
| | `POST /handover/reject/:id` endpoint with mandatory reject reason |
| | Optimistic locking (version field + HTTP 409 conflict) |
| | Concurrent delegation conflict resolution |
| | Cross-branch authorization routing |
| | Segregation of duties enforcement (maker != checker) |
| | Detail view with items, scrutiny checklist, AUM impact |

### FR-006: Lead Delegation
**Status: MISSING**

No delegation tables, no delegation routes, no delegation UI, no delegation service.

### FR-007: Prospect Delegation
**Status: MISSING**

Same as FR-006.

### FR-008: Client Delegation (configurable scrutiny checklist)
**Status: MISSING**

Missing delegation infrastructure plus the `applies_to` field on `scrutinyTemplates` that controls whether checklist is required for delegations.

### FR-009: Delegation Auto-Expiry
**Status: MISSING**

| What is Missing |
|----------------|
| `DelegationRequest` table with `auto_revert_completed` flag |
| Scheduled job (daily midnight cron) to check expired delegations |
| RM assignment revert logic |
| Expiry notification (at expiry + 2-day warning) |
| Audit log entries for auto-expiry |

### FR-010: Handover Dashboard
**Status: PARTIAL**

| What Exists | What is Missing |
|------------|----------------|
| Frontend page has 4 KPI cards (Total, Pending, Completed, Active Delegations) | Dashboard API endpoint (`GET /handover/dashboard`) |
| | Pending Authorizations widget with click-through |
| | Recent Transfers widget (last 30 days, top 10) |
| | Active Delegations with expiring-soon highlighting |
| | AUM Impact summary widget |
| | Backend aggregation logic |

### FR-011: Delegation Calendar
**Status: MISSING**

No calendar component, no calendar API endpoint (`GET /delegation/calendar`), no visual delegation timeline.

### FR-012: Handover History & Audit Trail
**Status: PARTIAL**

| What Exists | What is Missing |
|------------|----------------|
| `handoverAuditLog` table exists with indexes | History search API endpoint (`GET /handover/history`) |
| | Frontend history screen with date range/type/status/RM filters |
| | Export to CSV/Excel |
| | Drill-down to full audit trail per handover |
| | Delegation-specific audit event types |

### FR-013: Portfolio Impact Assessment
**Status: MISSING**

| What Exists | What is Missing |
|------------|----------------|
| `handoverItems.aum_at_handover` field exists | Client impact API endpoint (`GET /client-impact/:clientId`) |
| | AUM summary bar in frontend |
| | Auto-population from portfolio/account data |
| | AUM display in authorization detail view |

### FR-014: Pending Activities Warning
**Status: MISSING**

| What Exists | What is Missing |
|------------|----------------|
| `handoverItems.open_orders_count` field exists | Warning icon in Selected Client List |
| `handoverItems.pending_settlements_count` field exists | Detail popup (pending orders, service requests, maturity dates) |
| | Cross-entity query to orders, service requests, positions |
| | Integration with order-service and settlement-service |

### FR-015: Notification System (with retry/dead-letter)
**Status: MISSING**

| What Exists | What is Missing |
|------------|----------------|
| Generic notification system at `/api/v1/notifications` | HAM-specific notification templates |
| `notificationTemplates` table exists | `HandoverNotification` table |
| | Notification types: HANDOVER_INITIATED, AUTHORIZED, REJECTED, DELEGATION_STARTED, EXPIRING, EXPIRED |
| | Retry mechanism (3 retries with exponential backoff: 1/5/30 min) |
| | Dead-letter queue for failed deliveries |
| | Daily reconciliation report for failed notifications |

### FR-016: Batch Authorization
**Status: MISSING**

| What is Missing |
|----------------|
| `POST /handover/batch-authorize` endpoint |
| `POST /handover/batch-reject` endpoint |
| Multi-select checkboxes in authorization queue |
| Confirmation dialog with "type CONFIRM" safety check |
| Per-request independent processing (one failure doesn't roll back others) |
| Results summary ({X} authorized, {Y} failed) |
| Max 50 per batch limit |
| Optimistic locking per request in batch |
| Segregation of duties exclusion in batch |

### FR-017: Delegation Extension
**Status: MISSING**

| What is Missing |
|----------------|
| `POST /delegation/extend/:id` endpoint |
| `extended_from_id` and `extension_count` fields on DelegationRequest |
| Extension form UI (current end date, new end date, reason) |
| Supervisor approval workflow |
| Max 1 extension per delegation rule |
| Total delegation cap of 180 days |
| 24-hour escalation window when within 7 days of expiry |

---

## 7. Test Coverage

**No HAM-specific tests exist.** A search for `*handover*` and `*delegation*` in the `tests/` directory returns no matches.

| Test Type | Status |
|-----------|--------|
| E2E tests for handover lifecycle | **MISSING** |
| E2E tests for delegation lifecycle | **MISSING** |
| E2E tests for bulk upload | **MISSING** |
| E2E tests for batch authorization | **MISSING** |
| Unit tests for handover service | **MISSING** |
| Unit tests for delegation auto-expiry | **MISSING** |

---

## 8. Non-Functional Requirement Gaps

| NFR | BRD Requirement | Codebase Status |
|-----|----------------|----------------|
| Optimistic Locking | version field on HandoverRequest, HTTP 409 on conflict | **MISSING** -- no version field in any schema |
| Rate Limiting | 100 req/min read, 20 req/min write, 5 uploads/hour | **MISSING** -- no HAM-specific rate limits |
| Data Archival | Year-based partitioning of audit logs, cold storage after 2 years | **MISSING** -- no partitioning strategy |
| Maker-Checker Segregation | Same user cannot initiate and authorize | **MISSING** -- no enforcement middleware |
| CSV Injection Prevention | Server-side sanitization of uploaded CSV content | **MISSING** |
| Background Job Queue | Bulk upload processing via background job | **MISSING** |

---

## 9. Conflict Summary

### CONFLICT-1: Dual Schema
The codebase has two competing handover schemas (`rm_handovers` legacy and `handovers` newer). The frontend uses the legacy schema via CRUD API. The newer schema has no routes or services. **Resolution required:** Decide which schema to use and migrate/consolidate.

### CONFLICT-2: Handover Type Enum
BRD expects `handover_type` = entity being transferred (LEAD/PROSPECT/CLIENT). Legacy schema uses `handover_type` = transfer permanence (PERMANENT/TEMPORARY). Newer schema maps this correctly as `entity_type` but uses lowercase values. **Resolution required:** Align enum values with BRD or document the mapping.

### CONFLICT-3: Frontend Architecture
The existing frontend page treats handover as a single flat list with comma-separated client IDs, mixing permanent and temporary transfers. The BRD requires separate handover and delegation workflows with entity selection grids, scrutiny checklists, and maker-checker screens. **Resolution required:** Rebuild the frontend page to match BRD specifications, or create entirely new pages.

---

## 10. Implementation Priority Recommendations

Based on dependency analysis and BRD priority, the recommended implementation order is:

### Phase 1: Schema Consolidation & Core Backend (Critical Path)

1. **Resolve dual schema conflict** -- Adopt the newer `handovers` schema, add missing BRD fields (version, branch_code, denormalized names), deprecate `rmHandovers`
2. **Create DelegationRequest and DelegationItem tables** -- FR-006/007/008 depend on these
3. **Create BulkUploadLog table** -- FR-004 depends on this
4. **Create HandoverNotification table** -- FR-015 depends on this
5. **Add `applies_to` field to scrutinyTemplates** -- FR-008 depends on this
6. **Add missing audit event types** to `handoverAuditEventTypeEnum`
7. **Create handover-service.ts** with core business logic
8. **Create handover routes** (`server/routes/back-office/handover.ts`) with all 27 endpoints

### Phase 2: Authorization & Delegation

9. **Implement maker-checker authorization endpoints** (FR-005)
10. **Implement delegation endpoints** (FR-006 through FR-009)
11. **Implement delegation auto-expiry scheduled job** (FR-009)
12. **Add HAM-specific role guards** to middleware

### Phase 3: Bulk & Batch Operations

13. **Implement bulk upload with preview/dry-run** (FR-004)
14. **Implement batch authorize/reject** (FR-016)
15. **Implement delegation extension** (FR-017)

### Phase 4: Frontend

16. **Rebuild RM Handover page** with entity selection grids, scrutiny checklist, AUM impact
17. **Create delegation screens** (separate from handover)
18. **Create authorization screen** for Checker workflow
19. **Create delegation calendar** component
20. **Create handover history** screen with export
21. **Create bulk upload** screen with preview
22. **Add navigation entries** for Relationship menu

### Phase 5: Non-Functional & Testing

23. **Add optimistic locking** (version field + 409 conflict handling)
24. **Implement notification retry/dead-letter**
25. **Create E2E test suite** for handover lifecycle
26. **Create E2E test suite** for delegation lifecycle
27. **Implement data archival** strategy for audit logs

---

## 11. Files Referenced in This Analysis

| File | Path |
|------|------|
| Schema (HAM tables) | `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (lines 4988-5215) |
| Schema (legacy rmHandovers) | `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (lines 4370-4386) |
| Schema (legacy handoverTypeEnum) | `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` (line 4114) |
| Server routes registration | `/Users/n15318/Trust OMS/server/routes.ts` |
| Back-office CRUD routes | `/Users/n15318/Trust OMS/server/routes/back-office/index.ts` (lines 569-577) |
| Role-auth middleware | `/Users/n15318/Trust OMS/server/middleware/role-auth.ts` |
| Frontend handover page | `/Users/n15318/Trust OMS/apps/back-office/src/pages/crm/rm-handover.tsx` |
| Frontend route config | `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` (lines 98, 359-367) |
| Navigation config | `/Users/n15318/Trust OMS/apps/back-office/src/config/navigation.ts` |
| BRD generator script | `/Users/n15318/Trust OMS/docs/generate_ham_brd.py` |

---

*Generated by gap analysis comparing BRD-TRUSTOMS-HAM-2026-001 v2.0 against codebase on 2026-04-22.*
