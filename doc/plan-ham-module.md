# Development Plan: Handover & Assignment Management (HAM) Module

## Overview
Implement the complete HAM module for Trust OMS: permanent RM handover (Lead/Prospect/Client) with maker-checker authorization, temporary delegation with auto-expiry, bulk CSV upload with preview, batch authorization, delegation extension, dashboard, calendar, history, notifications, and audit trail. The BRD defines 17 FRs, 27 API endpoints, and 9 data entities.

## Architecture Decisions

- **Schema strategy**: Extend the existing newer `handovers` schema (schema.ts lines 5050-5215) with missing fields. Add new tables for delegation, bulk upload, and notifications. Do NOT modify the legacy `rmHandovers` table — it will be deprecated but left intact to avoid breaking existing references.
- **Service pattern**: Create `server/services/handover-service.ts` as a singleton object export (following `claimsService` pattern in `server/services/claims-service.ts`).
- **Route pattern**: Create `server/routes/back-office/handover.ts` with Express Router, `asyncHandler`, and role-auth middleware (following `server/routes/back-office/consent.ts` pattern).
- **Frontend pattern**: Create new page files under `apps/back-office/src/pages/crm/`. Use React + TanStack Query + shadcn/ui + Tailwind + Sonner toasts (following `apps/back-office/src/pages/crm/rm-handover.tsx` and `apps/back-office/src/pages/trustfees/fee-plan-detail.tsx` patterns).
- **API path prefix**: `/api/v1/ham` — registered via `server/routes.ts` as `app.use('/api/v1/ham', hamRouter)`.
- **ID strategy**: Keep `serial('id').primaryKey()` (integer auto-increment) consistent with all other tables in schema.ts, not UUID as BRD suggests.
- **Enum casing**: Use lowercase enum values consistent with existing codebase enums (e.g., `'pending_auth'` not `'PENDING'`).

## Conventions

- **Services**: Export singleton object. Methods are async, return data or throw. See `server/services/claims-service.ts`.
- **Routes**: Express Router with `asyncHandler`. Apply `requireBackOfficeRole()` globally, endpoint-specific guards via `requireAnyRole()`. See `server/routes/back-office/consent.ts`.
- **Frontend pages**: Functional component with `useQuery`/`useMutation`. Auth token from localStorage. Toasts via `sonner`. See `apps/back-office/src/pages/crm/rm-handover.tsx`.
- **Schema**: Tables use `pgTable`, enums use `pgEnum`, relations use `relations()`. Always include `...auditFields`. See `packages/shared/src/schema.ts` lines 5050+.
- **Navigation**: `NavSection` with `label`, `icon`, `items[]`. See `apps/back-office/src/config/navigation.ts`.

---

## Phase 1: Schema Extensions + Core Backend Service
**Dependencies:** none

**Description:**
Extend the existing HAM schema with missing fields and new tables (delegation, bulk upload, notification). Create the handover service with core business logic for handover CRUD, entity listing, scrutiny checklist, and audit logging. Create the route file with core handover endpoints (entity lists, create request, get request, history, checklist config, client impact, RM list). Register routes in `server/routes.ts`.

**Tasks:**
1. **Extend schema** — Add missing fields to existing `handovers` table: `version` (integer, default 1), `branch_code` (varchar), `outgoing_rm_name` (varchar), `incoming_rm_name` (varchar), `incoming_srm_name` (varchar). Add `applies_to` enum and field to `scrutinyTemplates`. Add missing enum values to `handoverAuditEventTypeEnum`: `'handover_amended'`, `'delegation_early_terminated'`, `'delegation_extension_requested'`, `'delegation_extended'`, `'batch_authorize'`, `'batch_reject'`, `'bulk_upload_preview'`. Create new tables: `delegationRequests` (18 fields including status enum with active/expired/cancelled/early_terminated, extended_from_id, extension_count), `delegationItems` (8 fields), `bulkUploadLogs` (11 fields with status enum processing/completed/failed), `handoverNotifications` (12 fields with notification_type enum). Add delegation status enum. Add delegation relations.

2. **Create handover service** — `server/services/handover-service.ts`. Implement core methods: `listLeads(filters)`, `listProspects(filters)`, `listClients(filters)` — query entity masters filtering out those with pending handovers/active delegations; `createHandoverRequest(data)` — validate incoming != outgoing RM, no concurrent pending, create HandoverRequest + HandoverItems + ScrutinyChecklist records, create audit log, return created request; `getHandoverRequest(id)` — return request with items, checklist, audit entries; `getHandoverHistory(filters)` — search audit log with date range, type, status, RM filters; `getChecklistConfig()` — return active scrutiny templates; `getClientImpact(clientId)` — return AUM, pending orders, service requests, maturity dates; `listRMs(filters)` — query users table for active RMs filterable by branch/supervisor. Follow `claimsService` pattern from `server/services/claims-service.ts`.

3. **Create handover route file** �� `server/routes/back-office/handover.ts`. Implement endpoints: `GET /leads`, `GET /prospects`, `GET /clients`, `POST /request`, `GET /request/:id`, `GET /history`, `GET /checklist-config`, `GET /client-impact/:clientId`, `GET /rms`. Apply `requireBackOfficeRole()` as default middleware. Use `asyncHandler` wrapper. Follow pattern from `server/routes/back-office/consent.ts`.

4. **Register routes** — In `server/routes.ts`, import `hamRouter` from `./routes/back-office/handover` and add `app.use('/api/v1/ham', hamRouter)`. In `server/routes/back-office/index.ts`, keep the existing `rm-handovers` CRUD registration for backwards compatibility.

**Files to create/modify:**
- `packages/shared/src/schema.ts` — Add delegation enums, delegation tables, bulk upload table, notification table, extend existing handover/scrutiny tables, add relations
- `server/services/handover-service.ts` — NEW: Core handover service (entity listing, request CRUD, checklist, impact, RM list, audit)
- `server/routes/back-office/handover.ts` — NEW: Express router with 9 core endpoints
- `server/routes.ts` — Add HAM router import and registration

**Acceptance criteria:**
- Schema extends without migration errors (tables are defined in Drizzle, pushed via `db:push`)
- `GET /api/v1/ham/leads`, `/prospects`, `/clients` return filterable entity lists
- `POST /api/v1/ham/request` creates a handover request with items and checklist
- `GET /api/v1/ham/request/:id` returns full request with related items and checklist
- `GET /api/v1/ham/rms` returns active RM list for dropdown population
- `GET /api/v1/ham/history` returns audit trail with date filters
- Build succeeds: `npm run build`

---

## Phase 2: Authorization, Delegation & Auto-Expiry
**Dependencies:** Phase 1

**Description:**
Implement maker-checker authorization workflow (authorize, reject with optimistic locking and concurrent conflict resolution), full delegation lifecycle (create, cancel, auto-expiry, extension), and batch operations. Add HAM-specific role guards.

**Tasks:**
1. **Authorization service methods** — In `server/services/handover-service.ts`, add: `getPendingRequests(filters)` — list PENDING handover requests for Checker queue; `authorizeRequest(id, version, checkerId)` — validate version match (409 on mismatch), validate checker != maker (segregation), update status to authorized, update RM assignments in entity masters, auto-cancel any active delegation for same entities (EARLY_TERMINATED), create audit log, send notifications; `rejectRequest(id, version, checkerId, reason)` — validate version, update status to rejected, free entities, create audit log; `batchAuthorize(requestIds, versions, checkerId)` — process each independently, return per-request results; `batchReject(requestIds, versions, checkerId, reason)` — same pattern; `amendRequest(id, data, makerId)` — update pending request, increment version.

2. **Delegation service methods** — In `server/services/handover-service.ts`, add: `listDelegationLeads/Prospects/Clients(filters)` — entity lists excluding those with active delegations; `createDelegation(data)` — validate delegate RM same branch/supervisor, date range <= 90 days, no overlapping delegation, create DelegationRequest + DelegationItems, auto-authorize, create audit log; `cancelDelegation(id)` — revert RM assignments, update status to cancelled, audit log; `getActiveDelegations(filters)` — list active delegations; `getDelegationCalendar(filters)` — delegation periods for calendar view; `extendDelegation(id, newEndDate, reason)` — validate extension_count < 1, total period <= 180 days, create extension request, notify supervisor; `processExpiredDelegations()` — find delegations where end_date < today and status = active, revert assignments, update to expired, audit log, notifications.

3. **Authorization & delegation route endpoints** — In `server/routes/back-office/handover.ts`, add: `GET /pending` (ops-checker), `POST /authorize/:id` (ops-checker), `POST /reject/:id` (ops-checker), `POST /batch-authorize` (ops-checker), `POST /batch-reject` (ops-checker), `PATCH /request/:id` (ops-maker), `GET /delegation/leads` (ops-maker), `GET /delegation/prospects` (ops-maker), `GET /delegation/clients` (ops-maker), `POST /delegation/request` (ops-maker), `GET /delegation/active` (ops-maker/checker/branch-mgr), `POST /delegation/cancel/:id` (ops-maker), `GET /delegation/calendar` (ops-maker/checker/branch-mgr), `POST /delegation/extend/:id` (ops-maker). Use `requireAnyRole('BO_CHECKER', 'BO_HEAD')` for authorization endpoints and `requireAnyRole('BO_MAKER')` for initiation endpoints.

4. **Bulk upload service methods** — In `server/services/handover-service.ts`, add: `previewBulkUpload(csvData)` — parse CSV, validate each row, return preview with affected count/AUM/errors without committing; `processBulkUpload(csvData, uploaderId)` — create BulkUploadLog, process each row independently, create per-row audit entries, auto-cancel conflicting delegations, notify supervisor; `getUploadLog(id)` — return upload processing results.

5. **Bulk upload route endpoints** — In `server/routes/back-office/handover.ts`, add: `POST /bulk-upload/preview` (ops-maker), `POST /bulk-upload` (ops-maker), `GET /upload-log/:id` (ops-maker). Dashboard endpoint: `GET /dashboard` (ops-maker/checker/branch-mgr) — returns pending count, recent transfers, active delegations, AUM impact.

**Files to create/modify:**
- `server/services/handover-service.ts` — Add authorization, delegation, bulk upload, and dashboard methods
- `server/routes/back-office/handover.ts` — Add remaining 18 endpoints (27 total)

**Acceptance criteria:**
- `POST /authorize/:id` with matching version updates status and RM assignments
- `POST /authorize/:id` with wrong version returns 409 Conflict
- `POST /authorize/:id` auto-cancels active delegation for same entities
- Checker cannot authorize own submissions (returns 403)
- `POST /delegation/request` creates active delegation with date validation
- `POST /delegation/cancel/:id` reverts RM assignments
- `POST /delegation/extend/:id` validates extension limits
- `POST /bulk-upload/preview` returns preview without committing
- `POST /bulk-upload` processes rows and creates per-row audit entries
- `GET /dashboard` returns aggregated summary data
- `POST /batch-authorize` processes multiple requests independently
- Build succeeds: `npm run build`

---

## Phase 3: Frontend — Handover & Authorization Pages
**Dependencies:** Phase 1, Phase 2

**Description:**
Build the primary frontend pages: handover list/create with entity selection grids, authorization queue for Checkers, and handover detail page. These are the most critical UI pieces for FR-001 through FR-005.

**Tasks:**
1. **Handover list & create page** — `apps/back-office/src/pages/crm/handover-list.tsx`. Replace the existing `rm-handover.tsx` approach. Implement: Tab navigation (Lead / Prospect / Client handover), entity selection grid with column-level filtering and checkbox multi-select per tab, selected entities list section, incoming RM searchable dropdown (populated from `GET /rms`), auto-populated SRM field, handover reason text area, scrutiny checklist section (for client tab only, loaded from `GET /checklist-config`), AUM impact summary bar, pending activities warning icons, Save button that calls `POST /request`, success/error toasts. Follow the accordion/tab pattern from the BRD. Use `useQuery` for entity lists (`GET /leads`, `/prospects`, `/clients`) and `useMutation` for create. Use shadcn/ui components: Card, Tabs, Table, Dialog, Select, Input, Textarea, Badge, Button, Checkbox. Follow pattern from `apps/back-office/src/pages/crm/rm-handover.tsx` for auth/fetching and `apps/back-office/src/pages/trustfees/fee-plan-detail.tsx` for complex UI.

2. **Authorization queue page** — `apps/back-office/src/pages/crm/handover-authorization.tsx`. Implement: pending requests table loaded from `GET /pending` with filterable columns (entity type, count, from/to RM, date, status), multi-select checkboxes for batch operations, detail view dialog showing items list + incoming RM + scrutiny checklist + AUM impact, Authorize button calling `POST /authorize/:id` with version, Reject button opening reject reason overlay calling `POST /reject/:id`, Batch Authorize/Reject buttons (visible when 2+ selected) calling `/batch-authorize` or `/batch-reject` with confirmation dialog requiring typed "CONFIRM", results summary toast after batch operations.

3. **Handover detail page** — `apps/back-office/src/pages/crm/handover-detail.tsx`. Implement: Load handover request from `GET /request/:id`, display header with status badge and handover number, items table with entity details (name, branch, RM, AUM), scrutiny checklist section with status/remarks, audit trail timeline loaded from request history, action buttons based on status (authorize/reject for pending, view-only for authorized/rejected). Use `useParams` for ID from URL.

4. **Register new routes** — In `apps/back-office/src/routes/index.tsx`, add lazy imports for HandoverList, HandoverAuthorization, HandoverDetail. Add routes: `/crm/handovers` → HandoverList (replace existing RMHandover), `/crm/handover-authorization` → HandoverAuthorization, `/crm/handovers/:id` → HandoverDetail.

**Files to create/modify:**
- `apps/back-office/src/pages/crm/handover-list.tsx` — NEW: Main handover page with entity selection, create workflow
- `apps/back-office/src/pages/crm/handover-authorization.tsx` — NEW: Checker authorization queue with batch operations
- `apps/back-office/src/pages/crm/handover-detail.tsx` — NEW: Handover request detail view with audit trail
- `apps/back-office/src/routes/index.tsx` — Add new page imports and route registrations

**Acceptance criteria:**
- Handover list page loads with Lead/Prospect/Client tabs
- Entity selection grids support multi-select with column filters
- Incoming RM dropdown populated from API
- Client handover shows scrutiny checklist (loaded from config)
- Save creates handover request and shows success toast
- Authorization page shows pending requests with filterable table
- Authorize/Reject buttons work with version-based optimistic locking
- Batch authorize shows confirmation dialog with CONFIRM input
- Detail page shows full request with items, checklist, and audit trail
- All pages have proper loading/error states
- Build succeeds: `npm run build`

---

## Phase 4: Frontend — Delegation, Dashboard, Calendar, History, Upload & Navigation
**Dependencies:** Phase 3

**Description:**
Build remaining frontend pages: delegation screens, handover dashboard, delegation calendar, handover history with export, bulk upload with preview, and navigation configuration to make all pages accessible from sidebar.

**Tasks:**
1. **Delegation page** — `apps/back-office/src/pages/crm/delegation-list.tsx`. Implement: Tab navigation (Lead / Prospect / Client delegation), entity selection grid with checkbox multi-select, delegate RM dropdown (filtered to same branch/supervisor from `GET /rms`), date range pickers (Start Date, End Date with 90-day max validation), delegation reason text area, optional scrutiny checklist for client delegation, active delegations table loaded from `GET /delegation/active` with Extend and Cancel actions, cancel confirmation dialog calling `POST /delegation/cancel/:id`, extend dialog with new end date and reason calling `POST /delegation/extend/:id`.

2. **Dashboard page** — `apps/back-office/src/pages/crm/handover-dashboard.tsx`. Implement: 4 KPI cards (Pending Authorizations with count by type, Recent Transfers last 30 days, Active Delegations with expiring-soon highlight, AUM Impact total). Data from `GET /dashboard`. Below cards: recent transfers table with click-through navigation. Side panel: mini delegation calendar. KPI cards are clickable — pending navigates to authorization page, delegations navigates to delegation page.

3. **Delegation calendar page** — `apps/back-office/src/pages/crm/delegation-calendar.tsx`. Implement: Month/week toggle calendar view with delegation periods as colored bars. Data from `GET /delegation/calendar`. Each bar shows: outgoing RM → delegate RM, entity count, date range. Click bar opens delegation detail dialog. Filter by branch, RM, delegation type. Use a simple table-based Gantt view (no external calendar library needed — render weeks as columns, RMs as rows, delegations as colored spans).

4. **Handover history page** — `apps/back-office/src/pages/crm/handover-history.tsx`. Implement: Filter panel (date range pickers, handover type select, status select, RM search, entity ID search). Results table from `GET /history` with columns: Date, Action Type, Entity Type, Entity ID, Entity Name, From RM, To RM, Status, Initiated By, Authorized By. Drill-down to handover detail on row click. Export to CSV button (client-side CSV generation from current filtered data).

5. **Bulk upload page** — `apps/back-office/src/pages/crm/handover-upload.tsx`. Implement: Upload type dropdown (Client Handover), file browse button with drag-and-drop zone, file name display, Reset and Upload buttons. After file selection: call `POST /bulk-upload/preview` to show preview (total rows, valid/invalid, AUM impact, incoming RMs, errors). Confirm & Process button calls `POST /bulk-upload`. Results view from `GET /upload-log/:id` with success/error counts and row-level error details.

6. **Navigation & route wiring** — Add "Relationship Management" section to `apps/back-office/src/config/navigation.ts` with items: Handover Dashboard (/crm/handover-dashboard, LayoutDashboard icon), Handover (/crm/handovers, ArrowLeftRight icon), Delegation (/crm/delegations, UserCheck icon), Authorization (/crm/handover-authorization, ShieldCheck icon), Handover History (/crm/handover-history, History icon), Bulk Upload (/crm/handover-upload, Upload icon), Delegation Calendar (/crm/delegation-calendar, Calendar icon). Register all new routes in `apps/back-office/src/routes/index.tsx` with lazy imports and Suspense wrappers.

**Files to create/modify:**
- `apps/back-office/src/pages/crm/delegation-list.tsx` — NEW: Delegation create/manage page
- `apps/back-office/src/pages/crm/handover-dashboard.tsx` — NEW: HAM dashboard with KPI cards
- `apps/back-office/src/pages/crm/delegation-calendar.tsx` — NEW: Visual delegation calendar
- `apps/back-office/src/pages/crm/handover-history.tsx` — NEW: Audit trail search with export
- `apps/back-office/src/pages/crm/handover-upload.tsx` �� NEW: Bulk CSV upload with preview
- `apps/back-office/src/config/navigation.ts` ��� Add Relationship Management section
- `apps/back-office/src/routes/index.tsx` — Add all new page routes

**Acceptance criteria:**
- Delegation page creates delegations with date range validation (max 90 days)
- Active delegations table shows extend/cancel actions
- Dashboard shows 4 KPI widgets with data from API
- Calendar displays delegation periods as colored bars
- History page supports all filter combinations and CSV export
- Bulk upload shows preview before processing and results after
- Navigation sidebar shows "Relationship Management" section with all 7 items
- All pages accessible from sidebar navigation
- Build succeeds: `npm run build`

---

## Phase 5: E2E Tests & Integration Verification
**Dependencies:** Phase 3, Phase 4

**Description:**
Create E2E test suites for handover and delegation lifecycles. Verify build, run all tests, ensure no regressions.

**Tasks:**
1. **Handover lifecycle E2E tests** — `tests/e2e/handover-lifecycle.spec.ts`. Test: create lead/prospect/client handover → verify PENDING status → authorize with version → verify AUTHORIZED and RM assignments updated → test reject flow → test optimistic locking (409 on stale version) → test segregation of duties (403 when checker = maker) → test concurrent conflict (delegation auto-cancelled on authorize). Follow test pattern from `tests/e2e/cross-office-integration.spec.ts`.

2. **Delegation lifecycle E2E tests** — `tests/e2e/delegation-lifecycle.spec.ts`. Test: create delegation with date range → verify ACTIVE status → cancel delegation → verify CANCELLED and RM reverted → test extension → test auto-expiry (mock date advancement) → test overlapping delegation rejection → test delegation superseded by handover.

3. **Bulk upload & batch auth E2E tests** — `tests/e2e/handover-bulk-batch.spec.ts`. Test: bulk upload preview with valid/invalid rows → confirm and process → verify per-row audit entries → test batch authorize with mixed versions (some succeed, some 409) → test batch reject with reason propagation.

4. **Build and integration verification** — Run `npm run build` to verify no TypeScript errors. Run full test suite. Verify all new routes respond correctly. Check that existing `rm-handovers` CRUD still works (no regressions).

**Files to create/modify:**
- `tests/e2e/handover-lifecycle.spec.ts` — NEW: Handover create → authorize/reject lifecycle tests
- `tests/e2e/delegation-lifecycle.spec.ts` — NEW: Delegation create → cancel → extend → expiry tests
- `tests/e2e/handover-bulk-batch.spec.ts` — NEW: Bulk upload and batch authorization tests

**Acceptance criteria:**
- All E2E tests pass
- `npm run build` succeeds with zero errors
- Existing `rm-handovers` CRUD API still functional (no regressions)
- All 27 HAM API endpoints respond with correct status codes
- Frontend pages render without console errors
