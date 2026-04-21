# Development Plan: TRUST-CA 360 — Corporate Actions Management Platform

## Overview
Implement the TRUST-CA 360 Corporate Actions platform per BRD v2.0, adding 8 new database entities, 6 new back-office pages, enhancing 4 existing modules (Corporate Actions, Tax, Reconciliation, EOD), and wiring computation into batch/EOD processes. Front-end links to the back-office app (`apps/back-office/`); computation engines run as server services invoked from existing pages or the EOD pipeline.

## Architecture Decisions

- **Monorepo pattern preserved**: New tables in `packages/shared/src/schema.ts`, new services in `server/services/`, new routes in `server/routes/back-office/`, new pages in `apps/back-office/src/pages/`. No new apps or packages.
- **EDEF for reference data CRUD**: Market Calendar, Legal Entity, Feed Routing, and Data Stewardship use the existing Entity Definition Framework (`createCrudRouter` + `entity-generic.tsx`) with entity configs in `packages/shared/src/entity-configs/`. Custom pages only for complex workflows (Claims, TTRA, Degraded Mode, Privacy Center).
- **Maker-checker on all mutations**: New entity routes use `requireApproval()` middleware following the pattern in `server/routes/back-office/index.ts`.
- **EOD wiring**: The existing `eod-orchestrator.ts` DAG is extended with CA-specific jobs (ca_entitlement_calc, ca_tax_calc, ca_settlement, ca_recon_triad). The stub `executeJob()` is replaced with real service calls.
- **Existing gap fixes bundled into Phase 1**: Missing API endpoints (`/summary`, `/history`), parameter mismatches, and enum alignment are fixed as foundational work before new features.
- **Tax engine enhancement**: The hardcoded 25% WHT stub in `corporateActionsService.applyTaxTreatment()` is replaced with a proper call to `taxEngineService` with TTRA-aware rate lookup.
- **Batch processes**: Fee accrual, CA entitlement calculation, reconciliation triad, and tax filing generation run as batch endpoints AND as EOD jobs (dual invocation path: manual trigger via UI button, or automatic via EOD pipeline).

## Conventions

- **Schema**: Follow `auditFields` pattern on all new tables (see any existing table in `packages/shared/src/schema.ts`). Use `pgEnum()` for new enums.
- **Routes**: Express routers in `server/routes/back-office/`. Use `asyncHandler()` from `server/middleware/async-handler.ts`. Register in `server/routes/back-office/index.ts` and `server/routes.ts`.
- **Services**: Stateless service objects in `server/services/`. Export as singleton. Use `db` from `server/db.ts`.
- **UI pages**: React lazy-loaded pages in `apps/back-office/src/pages/`. Use `@tanstack/react-query` for data fetching. Use `@trustoms/ui` components (Card, Table, Badge, Dialog, Tabs, Button, Input, Select). Follow the existing page patterns (summary cards at top, tabs, data tables with filters).
- **Navigation**: Add items to `apps/back-office/src/config/navigation.ts` in the appropriate section.
- **Routes registration**: Add lazy imports and route entries in `apps/back-office/src/routes/index.tsx`.
- **Naming**: snake_case for DB columns, camelCase for TypeScript, kebab-case for file names and URL paths.
- **Test patterns**: Vitest specs in `tests/e2e/`. Follow `tests/e2e/order-lifecycle.spec.ts` as template.

---

## Phase 1: Schema Foundation & Existing Gap Fixes
**Dependencies:** none

**Description:**
Add all new database tables and enums required by the BRD, enhance existing tables with new columns, and fix existing API parameter mismatches and missing endpoints. This unblocks all subsequent phases.

**Tasks:**
1. Add new PostgreSQL enums to `packages/shared/src/schema.ts`:
   - `corporateActionStatusEnum`: ANNOUNCED, SCRUBBED, GOLDEN_COPY, ENTITLED, ELECTED, SETTLED, CANCELLED, REVERSED
   - `corporateActionTypeEnum` expansion: add DIVIDEND_STOCK, BONUS_ISSUE, COUPON, PARTIAL_REDEMPTION, FULL_REDEMPTION, MATURITY, CAPITAL_DISTRIBUTION, RETURN_OF_CAPITAL, NAME_CHANGE, ISIN_CHANGE, TICKER_CHANGE, PAR_VALUE_CHANGE, SECURITY_RECLASSIFICATION, BUYBACK, DUTCH_AUCTION, EXCHANGE_OFFER, WARRANT_EXERCISE, CONVERSION, PROXY_VOTE, CLASS_ACTION, DIVIDEND_WITH_OPTION, MERGER_WITH_ELECTION, SPINOFF_WITH_OPTION
   - `ttraStatusEnum`: APPLIED, UNDER_REVIEW, APPROVED, REJECTED, EXPIRED, RENEWAL_PENDING
   - `claimStatusEnum`: DRAFT, INVESTIGATING, PENDING_APPROVAL, APPROVED, PAID, REJECTED, WITHDRAWN, DISCLOSED
   - `claimOriginationEnum`: CLIENT_RAISED, INTERNALLY_DETECTED, REGULATOR_RAISED
   - `claimRootCauseEnum`: DEADLINE_MISSED, TAX_ERROR, FEE_ERROR, WRONG_OPTION, SYSTEM_OUTAGE, DATA_QUALITY, VENDOR_FAILURE, OTHER
   - `claimApprovalTierEnum`: AUTO, MANAGER, HEAD, EXEC_COMMITTEE
   - `degradedModeComponentEnum`: BLOOMBERG, REUTERS, DTCC, PDTC, SWIFT, AI, DB
   - `consentPurposeEnum`: OPERATIONAL, MARKETING, AUTOMATED_DECISION, RESEARCH_AGGREGATE
   - `consentLegalBasisEnum`: CONSENT, CONTRACT, LEGAL_OBLIGATION, LEGITIMATE_INTEREST
   - `feedCostTierEnum`: BASELINE, PREMIUM
   - `securitySegmentEnum`: PH_BLUE_CHIP, PH_MID_CAP, PH_SMALL_CAP, FOREIGN_G10, FOREIGN_EM, FIXED_INCOME
   - `dataSegregationEnum`: HARD, SOFT
   - `stewardshipApprovalEnum`: SINGLE_APPROVER, DUAL_APPROVAL, COMMITTEE_APPROVAL

2. Add new tables to `packages/shared/src/schema.ts`:
   - `legalEntities` (§4.1): legal_entity_id UUID PK, entity_code, entity_name, regulator, license_ref, base_currency, data_segregation_scope
   - `marketCalendar` (§4.3): calendar_key+date composite PK, is_business_day, is_settlement_day, holiday_name, source
   - `ttraApplications` (§4.4): ttra_id UUID PK, client_id FK, treaty_country, cor_document_ref, bir_ctrr_ruling_no, status (ttraStatusEnum), effective_from, effective_to, next_review_due
   - `claims` (§4.5): claim_id UUID PK, claim_reference unique, event_id FK nullable, account_id FK, origination, root_cause_code, claim_amount, currency, pnl_impact_account, approval_tier, status (claimStatusEnum), compensation_settlement_id FK nullable, regulatory_disclosure_required, supporting_docs jsonb
   - `dataStewardship` (§4.6): dataset_key PK, steward_user_id FK, approval_policy, change_frequency_cap, last_reviewed_at
   - `consentRecords` (§4.7): consent_id UUID PK, client_id FK, purpose (consentPurposeEnum), channel_scope jsonb, granted boolean, granted_at, withdrawn_at, legal_basis (consentLegalBasisEnum), dpa_ref
   - `feedRouting` (§4.8): routing_id UUID PK, security_segment, primary_source, secondary_source, cost_tier, active_flag
   - `degradedModeLogs` (§4.9): incident_id UUID PK, started_at, ended_at, failed_component, fallback_path, impacted_event_ids jsonb, rca_completed

3. Enhance existing tables with new columns:
   - `corporateActions`: add `legal_entity_id` (integer FK nullable), `calendar_key` (text nullable), `degraded_mode_flag` (boolean default false), `golden_copy_source` (text nullable), `scrub_status` (text nullable)
   - `clients`: add `dpa_erasure_requested_at` (timestamp nullable), `automated_decision_consent` (boolean default false)
   - `portfolios`: add `legal_entity_id` (integer FK nullable), `marketing_consent` (boolean default false), `ttra_id` (UUID FK nullable)
   - `taxEvents`: add `ttra_id` (UUID FK nullable), `model_version` (text nullable)

4. Fix existing API parameter mismatches in routes:
   - `server/routes/back-office/reconciliation.ts`: accept both `run_date` and `date` in POST `/runs/transaction`; derive `resolvedBy` from `req.userId` in POST `/breaks/:id/resolve`
   - `server/routes/back-office/eod.ts`: accept both `run_date` and `runDate` in POST `/trigger`
   - `server/routes/back-office/fees.ts`: accept both `from`/`to` and `periodFrom`/`periodTo` in GET `/ter/:portfolioId`; derive `waivedBy` from `req.userId` in POST `/invoices/:id/waive`

5. Add missing API endpoints:
   - `server/routes/back-office/corporate-actions.ts`: add GET `/summary` (pending count, upcoming 30d, processed today, total entitlements) and GET `/history` (paginated historical CAs with date range filter)
   - `server/routes/back-office/reconciliation.ts`: add GET `/summary` (total runs, last run status, open breaks, resolved today)
   - `server/routes/back-office/fees.ts`: add GET `/summary` (active schedules, pending invoices, accrued today, avg TER)

**Files to create/modify:**
- `packages/shared/src/schema.ts` — add 13 new enums, 8 new tables, enhance 4 existing tables
- `server/routes/back-office/corporate-actions.ts` — add GET `/summary` and GET `/history` endpoints
- `server/routes/back-office/reconciliation.ts` — add GET `/summary`, fix parameter handling
- `server/routes/back-office/fees.ts` — add GET `/summary`, fix parameter handling
- `server/routes/back-office/eod.ts` — fix parameter handling
- `server/services/corporate-actions-service.ts` — add `getSummary()` and `getHistory()` methods
- `server/services/reconciliation-service.ts` — add `getSummary()` method
- `server/services/fee-engine-service.ts` — add `getSummary()` method

**Acceptance criteria:**
- `npm run db:push` succeeds — all new tables and columns created in PostgreSQL
- `npm run check` passes — no TypeScript errors
- All 5 previously-missing API endpoints return valid JSON
- All 4 parameter-mismatch fixes verified (UI calls work without 400/500 errors)
- Existing tests continue to pass (`npm run test:run`)

---

## Phase 2: Market Calendar & Legal Entity Administration
**Dependencies:** Phase 1

**Description:**
Build the Market Calendar engine (FR-008a) and Legal Entity multi-tenancy admin (FR-064) as EDEF-backed reference data pages in the back-office. These are foundational reference data that other modules depend on (CA date validation uses calendar; all entities reference legal_entity_id).

**Tasks:**
1. Create entity configs for EDEF:
   - `packages/shared/src/entity-configs/market-calendar.ts` — fields: calendar_key (PH/US/HK/SG/PDEx), date, is_business_day, is_settlement_day, holiday_name, source. Search on calendar_key + date.
   - `packages/shared/src/entity-configs/legal-entity.ts` — fields: entity_code, entity_name, regulator, license_ref, base_currency, data_segregation_scope. Search on entity_code, entity_name.
   - `packages/shared/src/entity-configs/feed-routing.ts` — fields: security_segment, primary_source, secondary_source, cost_tier, active_flag. Search on security_segment.
   - `packages/shared/src/entity-configs/data-stewardship.ts` — fields: dataset_key, steward_user_id, approval_policy, change_frequency_cap, last_reviewed_at. Search on dataset_key.
   - Export all from `packages/shared/src/entity-configs/index.ts`

2. Register new entities in `server/routes/back-office/index.ts`:
   - `/market-calendar` — makerChecker enabled (Market-Calendar Admin role)
   - `/legal-entities` — makerChecker enabled (Legal-Entity Admin role)
   - `/feed-routing` — makerChecker enabled
   - `/data-stewardship` — makerChecker enabled

3. Register entity tables in `server/scripts/seed-entity-registry.ts` — add entries for market_calendar, legal_entities, feed_routing, data_stewardship with their field configs.

4. Create Market Calendar service in `server/services/market-calendar-service.ts`:
   - `isBusinessDay(calendarKey, date)` — lookup against marketCalendar table
   - `nextBusinessDay(calendarKey, date, offset)` — skip non-business days, return T+N business day
   - `validateCADates(calendarKey, exDate, recordDate, paymentDate)` — validate dates fall on business/settlement days, suggest corrections
   - `getHolidays(calendarKey, year)` — list holidays for a calendar in a year

5. Add Market Calendar and Legal Entity to navigation in `apps/back-office/src/config/navigation.ts`:
   - Under **Reference Data** section: "Market Calendar" → `/reference-data/market-calendar`
   - Under **Reference Data** section: "Legal Entities" → `/reference-data/legal-entities`
   - Under **Reference Data** section: "Feed Routing" → `/reference-data/feed-routing`

6. Seed initial Philippine market calendar data (PH holidays 2026–2027) and default legal entities (TRUST, IMA, CUST) in `server/scripts/seed-reference-data.ts`.

**Files to create/modify:**
- `packages/shared/src/entity-configs/market-calendar.ts` — new EDEF config
- `packages/shared/src/entity-configs/legal-entity.ts` — new EDEF config
- `packages/shared/src/entity-configs/feed-routing.ts` — new EDEF config
- `packages/shared/src/entity-configs/data-stewardship.ts` — new EDEF config
- `packages/shared/src/entity-configs/index.ts` — register new configs
- `server/routes/back-office/index.ts` — register 4 new CRUD routes
- `server/scripts/seed-entity-registry.ts` — seed EDEF metadata
- `server/scripts/seed-reference-data.ts` — seed PH calendar + legal entities
- `server/services/market-calendar-service.ts` — new service
- `apps/back-office/src/config/navigation.ts` — add nav items

**Acceptance criteria:**
- Market Calendar CRUD works via back-office UI at `/reference-data/market-calendar`
- Legal Entity CRUD works at `/reference-data/legal-entities`
- Feed Routing CRUD works at `/reference-data/feed-routing`
- `marketCalendarService.isBusinessDay('PH', '2026-04-09')` returns `false` (Araw ng Kagitingan)
- `marketCalendarService.nextBusinessDay('PH', '2026-04-08', 1)` returns `2026-04-10`
- Seed script populates PH calendar and 3 legal entities (TRUST, IMA, CUST)

---

## Phase 3: Enhanced Corporate Actions Engine
**Dependencies:** Phase 1, Phase 2

**Description:**
Overhaul the Corporate Actions module to support the full BRD event lifecycle (Announcement → Scrubbing → Golden Copy → Event Definition → Entitlement → Election → Settlement), market-calendar-aware date validation, expanded CA types, and maker-checker on event authorization. The existing `corporate-actions.tsx` page is enhanced; computation runs via explicit API calls and EOD jobs.

**Tasks:**
1. Enhance `server/services/corporate-actions-service.ts`:
   - Add `scrubEvent(caId)` — validates fields, cross-references against security master, marks status SCRUBBED
   - Add `goldenCopy(caId)` — marks as GOLDEN_COPY after multi-source merge (single-source for Phase 1; multi-source deferred)
   - Enhance `ingestCorporateAction()` — accept all 30+ CA types; validate ex/record/payment dates against MarketCalendar via `marketCalendarService.validateCADates()`; suggest date corrections; set status to ANNOUNCED
   - Enhance `calculateEntitlement()` — handle all new CA types: COUPON (face_value × coupon_rate × day_count_fraction), PARTIAL_REDEMPTION (qty × redemption_pct × face_value), FULL_REDEMPTION/MATURITY (qty × face_value), CAPITAL_DISTRIBUTION (qty × amount_per_share), DIVIDEND_WITH_OPTION (present options), SPINOFF_WITH_OPTION (ratio-based new security allocation)
   - Add `simulateEntitlement(caId, portfolioId)` — what-if simulation that returns projected impact without persisting (FR-009 what-if)
   - Replace `applyTaxTreatment()` stub — delegate to `taxEngineService.calculateCAWHT()` (new method, built in Phase 5)
   - Add `getHistory(filters)` — paginated history with date range, type, status filters
   - Add `getSummary()` — aggregated counts by status

2. Add maker-checker to corporate actions route:
   - Wrap POST `/` (ingest), POST `/:id/calculate`, POST `/entitlements/:id/elect`, POST `/entitlements/:id/post` with `requireApproval('corporate_action')`
   - Add PUT `/:id/scrub` — triggers scrubbing workflow
   - Add PUT `/:id/golden-copy` — marks golden copy
   - Add POST `/:id/simulate` — what-if simulation (no approval needed, read-only)

3. Enhance `apps/back-office/src/pages/corporate-actions.tsx`:
   - Add new tabs: **Pipeline** (Kanban view: Announced → Scrubbed → Golden Copy → Entitled → Settled), **Simulation** (what-if calculator)
   - Pipeline tab: drag-drop-style cards per CA, click to view details, action buttons per stage (Scrub, Golden Copy, Calculate, Elect, Post)
   - Simulation tab: select CA + portfolio → preview entitlement + tax + fee impact without committing
   - Enhance Calendar tab: color-code by market calendar; show holiday markers
   - Add expanded CA type selector with all 30+ types grouped by category (Mandatory-Financial, Mandatory-Non-Financial, Voluntary-Financial, Voluntary-Non-Financial, Mandatory-With-Choice)
   - Show market-calendar validation warnings on date entry (red border + tooltip if date falls on holiday)

**Files to create/modify:**
- `server/services/corporate-actions-service.ts` — major enhancement (scrub, golden-copy, expanded types, simulation, calendar validation)
- `server/routes/back-office/corporate-actions.ts` — add scrub, golden-copy, simulate endpoints; add maker-checker
- `apps/back-office/src/pages/corporate-actions.tsx` — add Pipeline and Simulation tabs, expanded CA types, calendar markers
- `server/services/market-calendar-service.ts` — consumed by CA service (already built in Phase 2)

**Acceptance criteria:**
- Full event lifecycle: Announce → Scrub → Golden Copy → Calculate Entitlement → Elect → Post → Settled
- All 30+ CA types selectable in the UI and processable by the engine
- What-if simulation returns projected impact without persisting data
- Date validation warns when ex/record/payment dates fall on PH holidays
- Maker-checker required for event ingestion, calculation, election, and posting
- Pipeline Kanban view shows correct CA counts per stage

---

## Phase 4: TTRA Lifecycle Module
**Dependencies:** Phase 1

**Description:**
Build the Tax Treaty Relief Application (TTRA) lifecycle management module (FR-019a–d) with application intake, BIR review tracking, expiry monitoring with automated reminders, and automatic fallback to statutory rates on lapse. Front-end is a new dedicated page in back-office.

**Tasks:**
1. Create `server/services/ttra-service.ts`:
   - `createApplication(data)` — intake with CoR document ref, treaty country, client validation; status = APPLIED; auto-compute effective_to from CoR validity; set next_review_due = effective_to - 60 days
   - `updateStatus(ttraId, newStatus, rulingNo?)` — state transitions: APPLIED → UNDER_REVIEW → APPROVED (with ruling no) or REJECTED; APPROVED → EXPIRED; any → RENEWAL_PENDING
   - `getExpiringApplications(daysAhead)` — find TTRAs with next_review_due within N days
   - `processExpiryFallback()` — batch job: find APPROVED TTRAs past effective_to, set status=EXPIRED, clear ttra_id on linked portfolios (forces statutory rate fallback in tax engine)
   - `sendExpiryReminders()` — batch: at T-60, T-30, T-15, T-1, send notifications to Tax Officer + Client
   - `getApplications(filters)` — paginated list with status, treaty_country, client filters
   - `getApplicationById(ttraId)` — full detail with linked client and portfolio info
   - `getDashboardSummary()` — counts by status, expiring soon counts

2. Create `server/routes/back-office/ttra.ts`:
   - GET `/` — list applications (paginated, filtered)
   - GET `/summary` — dashboard summary
   - GET `/expiring` — applications expiring within N days
   - POST `/` — create application (maker-checker)
   - PUT `/:id/status` — update status (maker-checker)
   - POST `/batch/expiry-check` — trigger batch expiry fallback
   - POST `/batch/reminders` — trigger reminder batch
   - GET `/:id` — single application detail

3. Register route in `server/routes/back-office/index.ts` and `server/routes.ts` under `/api/v1/ttra`.

4. Create `apps/back-office/src/pages/ttra-dashboard.tsx`:
   - Summary cards: Applied, Under Review, Approved, Expiring (T-60), Expired
   - Pipeline view: Applied → Under Review → Approved → Expiring → Expired (horizontal flow with counts)
   - Table view: sortable/filterable list of all TTRAs with status badges, treaty country flags, client name, dates
   - Detail drawer: full TTRA info, CoR document preview link, BIR ruling linkage, per-client TTRA history timeline
   - Action buttons: Create New, Update Status, Send Reminders, Run Expiry Check
   - Expiry calendar: visual calendar showing upcoming expirations

5. Add to navigation under **Compliance** section: "TTRA Management" → `/compliance/ttra`
6. Add route in `apps/back-office/src/routes/index.tsx`: lazy-load `ttra-dashboard.tsx` at `/compliance/ttra`

**Files to create/modify:**
- `server/services/ttra-service.ts` — new service
- `server/routes/back-office/ttra.ts` — new route file
- `server/routes/back-office/index.ts` — register ttra route
- `server/routes.ts` — register `/api/v1/ttra`
- `apps/back-office/src/pages/ttra-dashboard.tsx` — new page
- `apps/back-office/src/config/navigation.ts` — add nav item
- `apps/back-office/src/routes/index.tsx` — add route

**Acceptance criteria:**
- TTRA application can be created with CoR document reference and treaty country
- Status transitions work: APPLIED → UNDER_REVIEW → APPROVED (with ruling no) → EXPIRED
- `next_review_due` auto-computed as `effective_to - 60 days`
- Batch expiry check sets expired TTRAs to EXPIRED status and clears portfolio linkage
- Expiring applications appear in the pipeline view with correct countdown
- Maker-checker required for create and status update

---

## Phase 5: Enhanced Tax Engine with TTRA Integration
**Dependencies:** Phase 1, Phase 4

**Description:**
Enhance the tax engine to support TTRA-aware WHT rates, expand the rate table for all Philippine tax scenarios (NIRC/TRAIN/CREATE), integrate CA-derived income into tax events, and improve BIR form generation. Computation linked to the existing Tax Management page and EOD batch.

**Tasks:**
1. Enhance `server/services/tax-engine-service.ts`:
   - Replace hardcoded `WHT_RATES` with a database-driven rate table (using existing `taxCodes` reference table, enhanced with treaty_rate column)
   - Add `calculateCAWHT(entitlementId)` — new method called from `corporateActionsService.applyTaxTreatment()`:
     - Look up client residency and TTRA status via portfolio → client → clientFatcaCrs + ttraApplications
     - If TTRA approved and not expired: use treaty rate from TTRA.treaty_country
     - If TTRA expired/rejected or no TTRA: use statutory rate per NIRC
     - Create `taxEvent` linked to the CA entitlement (not trade), with `ttra_id` if treaty applied
   - Add residency-based rate lookup: RESIDENT, NON_RESIDENT_ENGAGED_TRADE (NRA-ETB), NON_RESIDENT_NOT_ENGAGED_TRADE (NRA-NETB), CORP_DOMESTIC, CORP_FOREIGN_RESIDENT, CORP_FOREIGN_NON_RESIDENT
   - Add rate table per BRD Appendix D: FWT on dividends (10% resident individual, 25% NRA-NETB, 15% treaty), FWT on interest (20% for <5y, 0% for >=5y long-term deposits), DST handling
   - Enhance `generateBIRForm()` — include CA-derived tax events; add retry-with-backoff for eFPS integration stub
   - Add `generate1601FQ(month)` — aggregate monthly WHT from both trade-based and CA-based tax events

2. Enhance `apps/back-office/src/pages/tax-management.tsx`:
   - Add **TTRA** tab (links to `/compliance/ttra` dashboard with a summary widget showing active treaties, expiring soon)
   - Fix WHT Rate Reference dialog to match actual engine rates
   - Add CA-sourced tax events in the Tax Events tab (filter: `source=TRADE|CORPORATE_ACTION`)
   - Show TTRA indicator badge on tax events where treaty rate was applied

3. Wire CA → Tax integration:
   - In `corporateActionsService.postCaAdjustment()`, after posting cash/position: call `taxEngineService.calculateCAWHT(entitlementId)` to create the tax event
   - Tax amount deducted from the cash credit (net of WHT)

**Files to create/modify:**
- `server/services/tax-engine-service.ts` — major enhancement (TTRA lookup, CA WHT, expanded rates, residency classification)
- `server/services/corporate-actions-service.ts` — wire `postCaAdjustment()` to call tax engine
- `apps/back-office/src/pages/tax-management.tsx` — add TTRA tab, fix rate display, CA filter
- `server/routes/back-office/tax.ts` — no new endpoints needed (existing endpoints cover the enhanced data)

**Acceptance criteria:**
- CA cash dividend triggers automatic WHT calculation: 10% for PH resident, 25% for NRA-NETB, treaty rate if TTRA approved
- Tax event created with `ttra_id` populated when treaty rate applied
- When TTRA expires, subsequent CA WHT falls back to statutory rate automatically
- BIR form generation includes CA-derived tax events
- Tax Management page shows both trade and CA tax events with clear source indicator
- Rate table matches BRD Appendix D cases (Cases 1-5)

---

## Phase 6: Claims & Compensation Module
**Dependencies:** Phase 1, Phase 3

**Description:**
Build the Claims & Compensation module (FR-045–048) for tracking operational losses from CA processing errors. Includes claim origination, investigation workflow, tiered approval, payout with GL posting, and regulatory disclosure. New dedicated page in back-office.

**Tasks:**
1. Create `server/services/claims-service.ts`:
   - `createClaim(data)` — auto-generate claim_reference (CLM-YYYY-NNNNNN); determine approval_tier by amount (<=PHP50k AUTO, <=PHP500k MANAGER, <=PHP5M HEAD, >PHP5M EXEC_COMMITTEE); status = DRAFT; assign Claims Officer
   - `submitForInvestigation(claimId)` — status DRAFT → INVESTIGATING; SLA clock starts (5 business days P95)
   - `addEvidence(claimId, documents)` — append to supporting_docs JSON array
   - `classifyRootCause(claimId, rootCauseCode)` — set root_cause_code from enum
   - `submitForApproval(claimId)` — status INVESTIGATING → PENDING_APPROVAL; route to appropriate approver tier
   - `approve(claimId, approverId)` — status PENDING_APPROVAL → APPROVED; generate settlement instruction for payout
   - `reject(claimId, approverId, reason)` — status PENDING_APPROVAL → REJECTED; notify originator
   - `settlePayout(claimId)` — status APPROVED → PAID; post to GL (CA-Loss P&L account); notify client
   - `withdraw(claimId)` — any status before APPROVED → WITHDRAWN
   - `checkDisclosure(claimId)` — if regulatory_disclosure_required: status PAID → DISCLOSED; generate BSP/NPC filing stub
   - `getClaims(filters)` — paginated with status, origination, root_cause filters
   - `getClaimById(claimId)` — full detail with linked CA event and settlement
   - `getDashboardSummary()` — counts by status, total claim amount by root cause, aging SLA
   - `getAgingReport()` — claims aging by SLA breach status

2. Create `server/routes/back-office/claims.ts`:
   - GET `/` — list claims
   - GET `/summary` — dashboard summary
   - GET `/aging` — aging report
   - POST `/` — create claim (maker-checker)
   - GET `/:id` — claim detail
   - PUT `/:id/investigate` — submit for investigation
   - PUT `/:id/evidence` — add evidence
   - PUT `/:id/root-cause` — classify root cause
   - PUT `/:id/submit-approval` — submit for approval
   - PUT `/:id/approve` — approve (maker-checker, Claims Approver role)
   - PUT `/:id/reject` — reject
   - PUT `/:id/settle` — settle payout
   - PUT `/:id/withdraw` — withdraw

3. Register route in `server/routes/back-office/index.ts` and `server/routes.ts` under `/api/v1/claims`.

4. Create `apps/back-office/src/pages/claims-workbench.tsx`:
   - Summary cards: New Claims, Investigating, Pending Approval, Total Paid (PHP), SLA Breaches
   - Tabs: **New** | **Investigating** | **Pending Approval** | **Paid** | **Rejected** | **All**
   - Card view per claim: root-cause badge, amount, aging SLA indicator (green/amber/red), approval tier, linked CA event link
   - Action toolbar per claim: Escalate, Add Evidence, Approve, Reject, Withdraw
   - Create claim dialog: select origination type, link to CA event (optional), enter amount/currency, upload supporting docs
   - Root cause heat map chart (Recharts bar chart grouped by root_cause_code)
   - Claims rate KPI: total claim amount / AUM in bps

5. Add to navigation under **Operations** section: "Claims" → `/operations/claims`
6. Add route in `apps/back-office/src/routes/index.tsx`: lazy-load `claims-workbench.tsx` at `/operations/claims`

**Files to create/modify:**
- `server/services/claims-service.ts` — new service
- `server/routes/back-office/claims.ts` — new route file
- `server/routes/back-office/index.ts` — register claims route
- `server/routes.ts` — register `/api/v1/claims`
- `apps/back-office/src/pages/claims-workbench.tsx` — new page
- `apps/back-office/src/config/navigation.ts` — add nav item
- `apps/back-office/src/routes/index.tsx` — add route

**Acceptance criteria:**
- Full claim lifecycle: Draft → Investigating → Pending Approval → Approved → Paid (→ Disclosed if required)
- Approval tier auto-determined by claim amount per BRD thresholds
- SLA tracking: 5 business day investigation P95
- Claims Officer cannot approve their own claim (SoD enforced)
- Root cause heat map populated with accurate data
- Claims rate calculated as bps of AUM

---

## Phase 7: Enhanced Reconciliation — Internal Triad
**Dependencies:** Phase 1, Phase 3

**Description:**
Add the internal reconciliation triad (FR-027a): three-way reconciliation across Custody position, Accounting valuation, and Client statement. Enhances the existing Reconciliation page with a new "Internal Recon" tab and batch process. Also linked to EOD as a job.

**Tasks:**
1. Enhance `server/services/reconciliation-service.ts`:
   - Add `runInternalTriadRecon(date, triggeredBy?)` — new method:
     - Query `positions` (custody source of truth) for all portfolios as-of date
     - Query `navComputations` (accounting valuation) for same portfolios/date
     - Cross-reference: position qty × market price vs. NAV component values
     - Compare position market_value vs. nav total_nav component
     - Generate `reconBreaks` with type='INTERNAL_TRIAD' and break_type = 'CUSTODY_VS_ACCOUNTING' | 'ACCOUNTING_VS_CLIENT' | 'CUSTODY_VS_CLIENT'
     - Auto-assign breaks by entity/asset class
   - Add break type 'INTERNAL_TRIAD' to recon break handling
   - Enhance `getBreaks()` to include type='INTERNAL_TRIAD' in filters

2. Add route endpoints in `server/routes/back-office/reconciliation.ts`:
   - POST `/runs/internal-triad` — trigger internal triad recon (body: `date`, `triggeredBy?`)

3. Enhance `apps/back-office/src/pages/reconciliation.tsx`:
   - Add **Internal Recon** tab showing triad-specific results
   - Three-panel comparison view: Custody | Accounting | Client with variance highlighting
   - Summary card: Internal Breaks count, variance percentage
   - "Run Internal Recon" button with date picker

4. Enhance `apps/back-office/src/pages/position-reconciliation.tsx`:
   - Add link to Internal Recon tab on the main Reconciliation page
   - Show triad status indicator on position rows

**Files to create/modify:**
- `server/services/reconciliation-service.ts` — add `runInternalTriadRecon()`
- `server/routes/back-office/reconciliation.ts` — add POST `/runs/internal-triad`
- `apps/back-office/src/pages/reconciliation.tsx` — add Internal Recon tab
- `apps/back-office/src/pages/position-reconciliation.tsx` — add triad indicator

**Acceptance criteria:**
- Internal triad recon runs successfully, comparing positions vs NAV computations
- Breaks generated with type='INTERNAL_TRIAD' and specific break types
- Variance >0 between custody and accounting flags a break
- New Internal Recon tab displays results with three-panel comparison
- Daily EOD can invoke this as a job (wiring in Phase 9)

---

## Phase 8: Privacy, Consent & Degraded Mode
**Dependencies:** Phase 1

**Description:**
Build the Privacy & Consent module (FR-075–078) for DPA compliance and the Degraded Mode monitoring module (FR-070–072) for BCP. Both are new back-office pages. Privacy Center tracks consent separately for operational/marketing/automated-decision purposes. Degraded Mode monitor shows feed health and allows manual fallback activation.

**Tasks:**
1. Create `server/services/consent-service.ts`:
   - `grantConsent(clientId, purpose, channels, legalBasis)` — create ConsentRecord
   - `withdrawConsent(consentId)` — set withdrawn_at
   - `getClientConsents(clientId)` — all active consents for a client
   - `checkConsent(clientId, purpose)` — boolean: does client have active consent for purpose?
   - `requestErasure(clientId)` — set dpa_erasure_requested_at on client; create erasure queue entry
   - `processErasure(clientId)` — verify no regulatory retention conflict; soft-delete PII; log
   - `getErasureQueue()` — pending erasure requests with 30-day SLA tracking

2. Create `server/services/degraded-mode-service.ts`:
   - `reportIncident(failedComponent, fallbackPath)` — create DegradedModeLog entry
   - `resolveIncident(incidentId)` — set ended_at
   - `getActiveIncidents()` — open incidents (no ended_at)
   - `getIncidentHistory(filters)` — paginated history
   - `getDegradedModeDays(year)` — count distinct days with active incidents for KPI
   - `getFeedHealthStatus()` — mock feed health check (BLOOMBERG: UP, REUTERS: UP, DTCC: UP, PDTC: UP, SWIFT: UP)

3. Create routes:
   - `server/routes/back-office/consent.ts` — CRUD for consents, erasure workflow
   - `server/routes/back-office/degraded-mode.ts` — incident reporting, feed health

4. Register in `server/routes/back-office/index.ts` and `server/routes.ts`.

5. Create `apps/back-office/src/pages/consent-privacy-center.tsx`:
   - Client lookup → show all consents with purpose toggles (Operational/Marketing/Automated-Decision/Research)
   - Erasure request queue with SLA countdown
   - Consent audit log timeline
   - DPA compliance summary card

6. Create `apps/back-office/src/pages/degraded-mode-monitor.tsx`:
   - Traffic-light feed status panel (green/yellow/red per feed: Bloomberg, Reuters, DTCC, PDTC, SWIFT)
   - Active incident banner component (reusable, shown across app when incident active)
   - Toggle to activate manual degraded mode
   - Incident history table
   - Degraded-mode days KPI counter (target: <=3/year)

7. Add to navigation:
   - Under **Compliance**: "Privacy Center" → `/compliance/privacy`
   - Under **Operations**: "Feed Monitor" → `/operations/feed-monitor`

8. Add routes in `apps/back-office/src/routes/index.tsx`.

**Files to create/modify:**
- `server/services/consent-service.ts` — new service
- `server/services/degraded-mode-service.ts` — new service
- `server/routes/back-office/consent.ts` — new route
- `server/routes/back-office/degraded-mode.ts` — new route
- `server/routes/back-office/index.ts` — register 2 new routes
- `server/routes.ts` — register `/api/v1/consent` and `/api/v1/degraded-mode`
- `apps/back-office/src/pages/consent-privacy-center.tsx` — new page
- `apps/back-office/src/pages/degraded-mode-monitor.tsx` — new page
- `apps/back-office/src/config/navigation.ts` — add 2 nav items
- `apps/back-office/src/routes/index.tsx` — add 2 routes

**Acceptance criteria:**
- Consent can be granted and withdrawn per purpose independently
- Erasure request triggers 30-day SLA workflow
- Consent check blocks marketing communications when marketing consent not granted
- Feed health panel shows 5 feeds with UP/DOWN status
- Manual degraded mode toggle creates DegradedModeLog entry
- Degraded-mode days KPI calculates correctly
- Active incident triggers banner visible across the app

---

## Phase 9: EOD Pipeline Enhancement & Batch Wiring
**Dependencies:** Phase 3, Phase 5, Phase 6, Phase 7

**Description:**
Wire the EOD orchestrator to execute real service methods instead of stubs. Add CA-specific jobs to the DAG: CA entitlement calculation, CA tax computation, CA settlement, and internal reconciliation triad. The existing EOD dashboard page already visualizes the DAG — this phase makes the jobs actually execute.

**Tasks:**
1. Enhance `server/services/eod-orchestrator.ts`:
   - Replace stub `executeJob()` with real dispatch logic:
     - `nav_ingestion` → call `navService.ingestDailyNAVs(runDate)` (stub with record count)
     - `nav_validation` → call `navService.validateNAVs(runDate)` (stub with validation checks)
     - `portfolio_revaluation` → update `positions.market_value` using latest NAV prices
     - `position_snapshot` → snapshot positions as-of EOD date
     - `settlement_processing` → call `settlementService.processSettlements(runDate)` for pending settlements
     - `fee_accrual` → call `feeEngineService.runDailyAccrual(runDate)`
     - `commission_accrual` → stub (commission engine out of scope)
     - `data_quality_check` → run basic data quality checks (null checks, range validation)
     - `regulatory_report_gen` → stub (report generation)
     - `daily_report` → stub (daily summary report)
   - Add new CA-specific jobs to `JOB_DEFINITIONS`:
     - `ca_entitlement_calc` (depends on: position_snapshot) — auto-calculate entitlements for all GOLDEN_COPY CAs with ex_date = runDate
     - `ca_tax_calc` (depends on: ca_entitlement_calc) — run WHT calculation for all new entitlements
     - `ca_settlement` (depends on: ca_tax_calc) — auto-post adjustments for entitled CAs where election is complete
     - `ca_recon_triad` (depends on: ca_settlement, fee_accrual) — run internal triad reconciliation
   - Wire each new job to the corresponding service method

2. Add TTRA batch jobs (run daily, before ca_tax_calc):
   - `ttra_expiry_check` (depends on: none, runs early) — call `ttraService.processExpiryFallback()`
   - `ttra_reminders` (depends on: ttra_expiry_check) — call `ttraService.sendExpiryReminders()`

3. Update `apps/back-office/src/pages/eod-dashboard.tsx`:
   - The new jobs will auto-appear in the DAG visualization (it reads from `/api/v1/eod/definitions`)
   - Add CA-specific job icons/colors: CA jobs in orange, TTRA jobs in purple
   - Show records_processed count from real service calls

4. Enhance fee_accrual EOD job to also trigger `feeEngineService.runDailyAccrual(runDate)` for real.

**Files to create/modify:**
- `server/services/eod-orchestrator.ts` — replace stubs with real service calls; add 6 new jobs to DAG
- `apps/back-office/src/pages/eod-dashboard.tsx` — add CA/TTRA job colors and icons

**Acceptance criteria:**
- EOD trigger executes real fee accrual (creates `feeAccruals` records)
- EOD trigger executes CA entitlement calculation for CAs with matching ex_date
- EOD trigger runs TTRA expiry check and sets expired TTRAs to EXPIRED
- EOD trigger runs internal triad reconciliation and generates breaks
- DAG visualization shows all 16 jobs (10 original + 6 new) with correct dependency arrows
- Failed jobs can be retried; skipped jobs don't block downstream
- EOD completes within 2-minute timeout for typical data volumes

---

## Phase 10: Integration Testing & Data Seeding
**Dependencies:** Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, Phase 9

**Description:**
End-to-end integration tests covering the full CA lifecycle, cross-module interactions, and regression on existing functionality. Seed comprehensive test data for manual verification.

**Tasks:**
1. Create `tests/e2e/corporate-actions-lifecycle.spec.ts`:
   - Test: Ingest CA → Scrub → Golden Copy → Calculate Entitlement → Elect → Post → Verify position + cash updated
   - Test: CA with market calendar validation — date on PH holiday rejected
   - Test: CA WHT calculation with resident vs non-resident vs treaty rate
   - Test: CA WHT fallback when TTRA expired
   - Test: What-if simulation returns results without persisting

2. Create `tests/e2e/claims-lifecycle.spec.ts`:
   - Test: Create claim → Investigate → Add Evidence → Approve → Settle → Verify GL posting
   - Test: Claim approval tier correctly determined by amount
   - Test: Self-approval blocked (Claims Officer ≠ Claims Approver on same claim)

3. Create `tests/e2e/ttra-lifecycle.spec.ts`:
   - Test: Create TTRA → Under Review → Approve → Verify treaty rate used in tax calc
   - Test: TTRA expiry → fallback to statutory rate
   - Test: Reminder generation at T-60

4. Create `tests/e2e/eod-ca-pipeline.spec.ts`:
   - Test: Full EOD run with CA jobs — entitlement calc, tax calc, settlement, recon triad
   - Test: EOD job failure and retry
   - Test: Fee accrual produces real accrual records

5. Enhance `server/scripts/seed-reference-data.ts`:
   - Add sample corporate actions (5 CAs across different types)
   - Add sample TTRA applications (2: one approved, one expiring)
   - Add sample claims (3: one investigating, one approved, one paid)
   - Add sample consent records
   - Add sample feed routing configuration

6. Build verification:
   - Run `npm run check` (TypeScript)
   - Run `npm run test:run` (all tests)
   - Run `npm run build:all` (all apps build)

**Files to create/modify:**
- `tests/e2e/corporate-actions-lifecycle.spec.ts` — new test file
- `tests/e2e/claims-lifecycle.spec.ts` — new test file
- `tests/e2e/ttra-lifecycle.spec.ts` — new test file
- `tests/e2e/eod-ca-pipeline.spec.ts` — new test file
- `server/scripts/seed-reference-data.ts` — enhanced with CA/TTRA/Claims/Consent seed data

**Acceptance criteria:**
- All new e2e tests pass
- All existing e2e tests still pass (no regressions)
- `npm run check` passes with zero errors
- `npm run build:all` completes successfully
- Seed script runs without errors and populates all new entities
- Manual walkthrough of full CA lifecycle in UI succeeds end-to-end
