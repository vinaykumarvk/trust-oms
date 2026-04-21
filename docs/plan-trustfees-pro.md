# Development Plan: TrustFees Pro — Unified Fees & Charges Management Platform

## Overview
TrustFees Pro replaces the existing basic fee-billing system with a comprehensive, template-driven Fee Plan platform covering 31 functional requirements across 6 modules. It introduces reusable Pricing, Eligibility, and Accrual Schedule libraries; a 4-step Fee Plan wizard; a multi-formula accrual engine integrated with the EOD batch process; multi-line invoicing with tax; universal override lane; exception queue with SLA management; and full audit trail with batched HMAC chain. All front-end pages are added to the back-office app; all fee computation hooks into the existing EOD orchestrator DAG.

## Architecture Decisions

- **Front-end placement**: All TrustFees Pro UI pages are added to `apps/back-office/src/pages/` under a new `trustfees/` subdirectory to keep the feature organized. Navigation is updated to add a dedicated "Fees & Charges" collapsible section in the sidebar.
- **Schema evolution**: All new tables and enums are added to the existing `packages/shared/src/schema.ts` using Drizzle ORM `pgTable`/`pgEnum` definitions, following the established pattern (see existing `feeSchedules`, `feeInvoices`, `feeAccruals` tables).
- **Service layer**: Each domain module gets its own service file under `server/services/` following the singleton-export pattern used by `fee-engine-service.ts` and `eod-orchestrator.ts`.
- **Route layer**: New API routes under `server/routes/back-office/` with registration in `server/routes.ts`, following the Express router pattern in `server/routes/back-office/fees.ts`.
- **EOD integration**: The existing `eod-orchestrator.ts` JOB_DEFINITIONS array is extended with new jobs (`invoice_generation`, `notional_accounting`, `reversal_check`, `exception_sweep`) and the existing `fee_accrual` job is wired to the new accrual engine.
- **Maker-checker**: Fee Plan approval, override approval, and ad-hoc fee approval all use the existing `server/services/maker-checker.ts` and `server/middleware/maker-checker.ts` infrastructure.
- **Existing tables preserved**: The current `feeSchedules`, `feeAccruals`, `feeInvoices` tables remain for backward compatibility. The new `feePlans` table is the canonical fee configuration entity; `feeSchedules` becomes a legacy view. New accrual and invoice tables (`tfpAccruals`, `tfpInvoices`, `tfpInvoiceLines`) are created with the full BRD schema.
- **UI patterns**: All new pages use React 18 + TanStack Query v5 + Radix UI components from `packages/ui`, following the patterns in existing pages like `fee-billing-desk.tsx`, `settlement-desk.tsx`, and `eod-dashboard.tsx`. Summary cards, tabs, data tables, dialogs, and skeleton loading are standard.
- **Monetary precision**: All monetary fields use `numeric(21,4)` with Drizzle's `numeric()` type. Percentages use `numeric(9,6)`.

## Conventions

- **File naming**: Kebab-case for all files (e.g., `fee-plan-service.ts`, `fee-plan-wizard.tsx`)
- **Service exports**: Default export as singleton object (e.g., `export const feePlanService = { ... }`)
- **Route pattern**: Express Router with async handlers, try/catch, `res.json()` responses. See `server/routes/back-office/fees.ts`
- **Page pattern**: Single default-exported React component per page. Use `useQuery`/`useMutation` from TanStack Query. 30s refetch interval. See `apps/back-office/src/pages/fee-billing-desk.tsx`
- **Schema pattern**: `pgTable('table_name', { ... })` with `serial('id').primaryKey()`, audit fields (`created_at`, `updated_at`, `created_by`, `updated_by`). See existing fee tables in `packages/shared/src/schema.ts`
- **API URL pattern**: `/api/v1/{resource}` with RESTful verbs. Registered in `server/routes.ts`
- **Navigation pattern**: Items added to `navSections` array in `apps/back-office/src/config/navigation.ts` with icon from `lucide-react`
- **Enum pattern**: `pgEnum('enum_name', ['VALUE1', 'VALUE2', ...])` at top of schema.ts

---

## Phase 1: Schema Foundation — Tables, Enums & Seed Data
**Dependencies:** none

**Description:**
Create all database tables and enums required by TrustFees Pro. This is the foundation that every subsequent phase depends on. Extends the existing `packages/shared/src/schema.ts` with ~20 new tables and ~25 new enums. Also seeds reference data for jurisdictions, fee types, and templates.

**Tasks:**
1. Add all new pgEnum definitions to `packages/shared/src/schema.ts`:
   - `chargeBasisEnum`: EVENT, PERIOD
   - `pricingTypeEnum`: FIXED_AMOUNT, FIXED_RATE, SLAB_CUMULATIVE_AMOUNT, SLAB_CUMULATIVE_RATE, SLAB_INCREMENTAL_AMOUNT, SLAB_INCREMENTAL_RATE, STEP_FUNCTION
   - `pricingBindingModeEnum`: STRICT, LATEST_APPROVED
   - `feePlanStatusEnum`: DRAFT, PENDING_APPROVAL, ACTIVE, EXPIRED, SUSPENDED, SUPERSEDED
   - `feePlanFeeTypeEnum`: CUSTODY, MANAGEMENT, PERFORMANCE, SUBSCRIPTION, REDEMPTION, COMMISSION, TAX, TRUST, ESCROW, ADMIN, OTHER
   - `sourcePartyEnum`: INVESTOR, ISSUER
   - `targetPartyEnum`: BANK, BROKER, PORTFOLIO_MANAGER
   - `comparisonBasisEnum`: PRICE, TXN_AMOUNT, NUM_TXNS, AUM, NOMINAL, XIRR, YTM, COUPON_PCT, DIVIDEND_PCT
   - `valueBasisEnum`: AUM, BUM, TXN_AMOUNT, NOTIONAL, AVG_INVESTMENT, FACE_VALUE, PRINCIPAL, COST
   - `rateTypeEnum`: FLAT, ANNUALIZED
   - `accrualFrequencyEnum`: DAILY, MONTHLY, QUARTERLY, SEMI_ANNUAL, ANNUAL
   - `accrualMethodEnum`: ABSOLUTE, AVERAGE, ABSOLUTE_INCR, AVERAGE_INCR
   - `tfpAccrualStatusEnum`: OPEN, ACCOUNTED, INVOICED, REVERSED
   - `tfpInvoiceStatusEnum`: DRAFT, ISSUED, PAID, PARTIALLY_PAID, OVERDUE, DISPUTED, CANCELLED
   - `paymentMethodEnum`: DEBIT_MEMO, CHECK, PESONET, INSTAPAY, SWIFT, INTERNAL_JV
   - `paymentStatusEnum`: POSTED, REVERSED, FAILED
   - `overrideStageEnum`: ORDER_CAPTURE, ACCRUAL, INVOICE, PAYMENT
   - `overrideStatusEnum`: PENDING, APPROVED, REJECTED, AUTO_APPROVED
   - `exceptionTypeEnum`: MISSING_FX, ACCRUAL_MISMATCH, INVOICE_PDF_FAILURE, PAYMENT_AMBIGUITY, DISPUTE_OPEN, REVERSAL_CANDIDATE, OTHER
   - `exceptionSeverityEnum`: P1, P2, P3
   - `exceptionStatusEnum`: OPEN, IN_PROGRESS, RESOLVED, ESCALATED, WONT_FIX
   - `contentPackCategoryEnum`: TAX_RULE_PACK, REPORT_PACK, TEMPLATE_PACK
   - `contentPackStatusEnum`: STAGED, ACTIVE, SUPERSEDED, ROLLED_BACK
   - `dsarTypeEnum`: ACCESS, ERASURE, RECTIFICATION, PORTABILITY, RESTRICTION
   - `dsarStatusEnum`: NEW, IN_PROGRESS, DPO_REVIEW, COMPLETED, REJECTED
   - `disputeStatusEnum`: OPEN, INVESTIGATING, RESOLVED, REJECTED
   - `creditNoteStatusEnum`: ISSUED, APPLIED, CANCELLED
   - `taxTypeEnum`: VAT, WHT, DST, OTHER
   - `piiClassEnum`: NON_PII, PII, SPI, FINANCIAL_PII
   - `redactionRuleEnum`: NONE, MASK, HASH, TOKENIZE, EXCLUDE
   - `templateCategoryEnum`: TRUST_DISC, TRUST_DIR, RETIREMENT, ESCROW, TXN, ADHOC
   - `libraryStatusEnum`: DRAFT, PENDING_APPROVAL, ACTIVE, RETIRED
   - `eventTypeEnum`: BUY, SELL, MATURITY, COUPON, DIVIDEND, PRE_TERMINATION, REDEMPTION, CORPORATE_ACTION

2. Add `jurisdictions` table: id (uuid PK), code (varchar(8) unique), name (varchar(128)), locale (varchar(16)), tax_pack_id (uuid nullable FK), report_pack_id (uuid nullable FK), residency_zone (varchar(64)), is_active (boolean default true), audit fields.

3. Add `pricingDefinitions` table: id (uuid PK), pricing_code (varchar(32) unique), pricing_name (varchar(128)), pricing_type (pricingTypeEnum), currency (char(3) default 'PHP'), pricing_tiers (jsonb default []), step_windows (jsonb nullable), version (integer default 1), status (libraryStatusEnum default DRAFT), audit fields.

4. Add `eligibilityExpressions` table: id (uuid PK), eligibility_code (varchar(32) unique), eligibility_name (varchar(128)), expression (jsonb), status (libraryStatusEnum default DRAFT), audit fields.

5. Add `accrualSchedules` table: id (uuid PK), schedule_code (varchar(32) unique), schedule_name (varchar(128)), accrual_enabled (boolean default true), accrual_frequency (accrualFrequencyEnum), accrual_method (accrualMethodEnum default ABSOLUTE), basis_frequency (accrualFrequencyEnum nullable), accounting_enabled (boolean default false), accounting_frequency (accrualFrequencyEnum nullable), invoice_frequency (accrualFrequencyEnum default MONTHLY), due_date_offset_days (integer default 20), reversal_enabled (boolean default false), reversal_age_days (integer nullable), recovery_mode (varchar(16) default 'USER'), recovery_frequency (accrualFrequencyEnum nullable), upfront_amortization (boolean default false), status (libraryStatusEnum default DRAFT), audit fields.

6. Add `feePlanTemplates` table: id (uuid PK), template_code (varchar(32) unique), template_name (varchar(128)), category (templateCategoryEnum), default_payload (jsonb), jurisdiction_id (uuid FK → jurisdictions), is_active (boolean default true), audit fields.

7. Add `feePlans` table: id (uuid PK), fee_plan_code (varchar(32) unique), fee_plan_name (varchar(128)), description (varchar(512) nullable), charge_basis (chargeBasisEnum), fee_type (feePlanFeeTypeEnum), pricing_definition_id (uuid FK → pricingDefinitions), pricing_binding_mode (pricingBindingModeEnum default STRICT), pricing_binding_version (integer nullable), eligibility_expression_id (uuid FK → eligibilityExpressions), accrual_schedule_id (uuid nullable FK → accrualSchedules), jurisdiction_id (uuid FK → jurisdictions), source_party (sourcePartyEnum), target_party (targetPartyEnum), comparison_basis (comparisonBasisEnum), value_basis (valueBasisEnum), event_type (eventTypeEnum nullable), min_charge_amount (numeric(21,4) default 0), max_charge_amount (numeric(21,4) nullable), lower_threshold_pct (numeric(9,6) default 0.05), upper_threshold_pct (numeric(9,6) default 0.40), rate_type (rateTypeEnum default FLAT), modification_allowed (boolean default true), aum_basis_include_uitf (boolean default false), aum_basis_include_3p_funds (boolean default false), market_value_includes_accruals_override (boolean nullable), effective_date (date), expiry_date (date nullable), status (feePlanStatusEnum default DRAFT), template_id (uuid nullable FK → feePlanTemplates), audit fields.

8. Add `tfpAccruals` table: id (uuid PK), fee_plan_id (uuid FK → feePlans), customer_id (uuid), portfolio_id (uuid nullable), security_id (uuid nullable), transaction_id (uuid nullable), base_amount (numeric(21,4)), computed_fee (numeric(21,4)), applied_fee (numeric(21,4)), currency (char(3)), fx_rate_locked (numeric(18,8) nullable), accrual_date (date), status (tfpAccrualStatusEnum default OPEN), override_id (uuid nullable), exception_id (uuid nullable), idempotency_key (varchar(128)), audit fields.

9. Add `tfpInvoices` table: id (uuid PK), invoice_number (varchar(32) unique), customer_id (uuid), jurisdiction_id (uuid FK), currency (char(3) default 'PHP'), fx_rate (numeric(18,8) nullable), total_amount (numeric(21,4)), tax_amount (numeric(21,4) default 0), grand_total (numeric(21,4)), invoice_date (date), due_date (date), status (tfpInvoiceStatusEnum default DRAFT), pdf_url (varchar(512) nullable), tax_pack_version (varchar(32) nullable), audit fields.

10. Add `tfpInvoiceLines` table: id (uuid PK), invoice_id (uuid FK → tfpInvoices), accrual_id (uuid FK → tfpAccruals), description (varchar(512)), quantity (numeric(21,4) default 1), unit_amount (numeric(21,4)), line_amount (numeric(21,4)), tax_code (varchar(16) nullable), tax_amount (numeric(21,4) default 0), audit fields.

11. Add `tfpPayments` table: id (uuid PK), invoice_id (uuid nullable FK → tfpInvoices), amount (numeric(21,4)), currency (char(3) default 'PHP'), payment_date (date), method (paymentMethodEnum), reference_no (varchar(64)), status (paymentStatusEnum default POSTED), audit fields.

12. Add `feeOverrides` table: id (uuid PK), stage (overrideStageEnum), accrual_id (uuid nullable FK → tfpAccruals), invoice_id (uuid nullable FK → tfpInvoices), original_amount (numeric(21,4)), overridden_amount (numeric(21,4)), delta_pct (numeric(9,6)), reason_code (varchar(32)), reason_notes (varchar(1024)), requested_by (uuid), approved_by (uuid nullable), status (overrideStatusEnum default PENDING), audit fields.

13. Add `exceptionItems` table: id (uuid PK), type (exceptionTypeEnum), severity (exceptionSeverityEnum default P3), customer_id (uuid nullable), source_aggregate_type (varchar(64)), source_aggregate_id (uuid), title (varchar(256)), details (jsonb), assigned_to_team (varchar(64)), assigned_to_user (uuid nullable), status (exceptionStatusEnum default OPEN), sla_due_at (timestamp), escalated_at (timestamp nullable), resolution_notes (varchar(2048) nullable), resolved_at (timestamp nullable), audit fields.

14. Add `contentPacks` table: id (uuid PK), category (contentPackCategoryEnum), version (varchar(32)), jurisdiction_id (uuid FK → jurisdictions), effective_date (date), signed_by (varchar(128)), signature (varchar(256)), hash (char(64)), status (contentPackStatusEnum default STAGED), activated_at (timestamp nullable), audit fields.

15. Add `taxRules` table: id (uuid PK), tax_code (varchar(16)), name (varchar(128)), type (taxTypeEnum), rate (numeric(9,6)), jurisdiction_id (uuid FK → jurisdictions), applicable_fee_types (jsonb default []), effective_date (date), expiry_date (date nullable), source_pack_id (uuid nullable FK → contentPacks), audit fields.

16. Add `disputes` table: id (uuid PK), invoice_id (uuid FK → tfpInvoices), raised_by (uuid), reason (varchar(1024)), status (disputeStatusEnum default OPEN), resolution_notes (varchar(2048) nullable), resolved_at (timestamp nullable), credit_note_id (uuid nullable), audit fields.

17. Add `creditNotes` table: id (uuid PK), credit_note_number (varchar(32) unique), related_invoice_id (uuid FK → tfpInvoices), amount (numeric(21,4)), currency (char(3)), reason_code (varchar(32)), status (creditNoteStatusEnum default ISSUED), issued_at (timestamp default now()), audit fields.

18. Add `dataSubjectRequests` table: id (uuid PK), subject_customer_id (uuid), type (dsarTypeEnum), submitted_via (varchar(16)), status (dsarStatusEnum default NEW), response_deadline (date), approver_id (uuid nullable), artifact_bundle_url (varchar(512) nullable), notes (varchar(2048) nullable), audit fields.

19. Add `piiClassifications` table: id (uuid PK), aggregate_type (varchar(64)), field_path (varchar(256)), classification (piiClassEnum), redaction_rule (redactionRuleEnum default NONE), audit fields.

20. Add `auditWindowSignatures` table: id (uuid PK), window_start (timestamp), window_end (timestamp), event_count (integer), hash (char(64)), previous_hash (char(64) nullable), signature (varchar(256)), created_at (timestamp default now()).

21. Add `customerReferences` table: id (uuid PK), customer_id (uuid unique), display_name (varchar(256)), customer_type (varchar(32)), domicile (char(2) default 'PH'), billing_currency (char(3) default 'PHP'), tin (varchar(32) nullable), tax_exempt (boolean default false), jurisdiction_id (uuid FK → jurisdictions), audit fields.

22. Update `server/scripts/seed-reference-data.ts` to seed:
    - Jurisdictions: PH (Philippines, en-PH), SG (Singapore, en-SG), ID (Indonesia, id-ID)
    - Expanded fee types: TRUST, ESCROW, COMMISSION, SUBSCRIPTION, REDEMPTION, ADMIN, OTHER (add to existing seed array)
    - Tax rules: VAT12 (12% VAT for PH), WHT2 (2% WHT for PH), DST (Documentary Stamp Tax for PH)
    - Fee Plan Templates: TPL_DISC_STD_PH, TPL_ESCROW_BS_PH, TPL_RET_FUND_PH, TPL_DIR_BOND_PH, TPL_EQUITY_BROKERAGE
    - Sample Pricing Definitions: CUST_SLAB_3T, DISC_TIER, ESC_STEP_3M10K
    - Sample Eligibility Expressions: EQ_BOA, ALL_BUY_EX_IPO, ALL_DISCRETIONARY
    - Sample Accrual Schedules: SCH_DLY_MTH, SCH_DLY_QTR, SCH_MTH_MTH

23. Run `drizzle-kit generate` and `drizzle-kit push` to apply schema changes (or generate migration SQL).

**Files to create/modify:**
- `packages/shared/src/schema.ts` — Add ~25 enums + ~20 tables with relations
- `server/scripts/seed-reference-data.ts` — Add jurisdiction, template, and sample library seed data
- `drizzle.config.ts` — Verify configuration (should need no changes)

**Acceptance criteria:**
- All new tables and enums are defined in schema.ts without TypeScript errors
- `npm run build` passes in `packages/shared`
- Database migration applies cleanly (drizzle-kit push succeeds)
- Seed script runs without errors and populates jurisdictions, templates, sample pricing/eligibility/schedules
- Existing tables (feeSchedules, feeAccruals, feeInvoices) are preserved and unchanged

---

## Phase 2: Pricing Library — Service, Routes & UI
**Dependencies:** Phase 1

**Description:**
Build the complete Pricing Definition library with versioning, approval, and retirement blocking. This is one of the three reusable libraries that Fee Plans reference. Delivers FR-003 (Manage Pricing Library).

**Tasks:**
1. Create `server/services/pricing-definition-service.ts`:
   - `create(data)` — Create new pricing definition (status=DRAFT, version=1)
   - `update(id, data)` — Creates new version (increments version field, clones record with updated fields)
   - `getAll(filters?)` — List with optional status/type filters, pagination
   - `getById(id)` — Single pricing definition with version history
   - `submit(id)` — Transition DRAFT → PENDING_APPROVAL
   - `approve(id, approverId)` — Transition PENDING_APPROVAL → ACTIVE (SoD: approverId ≠ created_by)
   - `reject(id, approverId, comment)` — Transition PENDING_APPROVAL → DRAFT
   - `retire(id)` — Transition ACTIVE → RETIRED. Block if any ACTIVE FeePlan pins this version (query feePlans where pricing_definition_id=id AND pricing_binding_mode='STRICT' AND status='ACTIVE')
   - `getVersionHistory(pricingCode)` — All versions for a given pricing_code
   - Validation: pricing_tiers must have contiguous, non-overlapping ranges; STEP_FUNCTION requires step_windows; tier amounts/rates must be positive

2. Create `server/routes/back-office/pricing-definitions.ts`:
   - `GET /` — List pricing definitions (query params: status, pricing_type, page, pageSize, search)
   - `GET /:id` — Get single pricing definition
   - `GET /:id/versions` — Version history
   - `POST /` — Create new pricing definition
   - `PUT /:id` — Update (creates new version)
   - `POST /:id/submit` — Submit for approval
   - `POST /:id/approve` — Approve (role: ops_checker)
   - `POST /:id/reject` — Reject with comment
   - `POST /:id/retire` — Retire (with blocking check)

3. Register route in `server/routes.ts`: `app.use('/api/v1/pricing-definitions', pricingDefinitionsRouter)`

4. Create `apps/back-office/src/pages/trustfees/pricing-library.tsx`:
   - Summary cards: Total definitions, Active count, Pending approval count, Recently versioned
   - Data table with columns: Code, Name, Type, Currency, Version, Status, Last Updated
   - Status badge colors: DRAFT=gray, PENDING_APPROVAL=amber, ACTIVE=green, RETIRED=red
   - Row actions: Edit, Submit, View versions, Retire
   - "Add Pricing Definition" dialog with form fields: pricing_code, pricing_name, pricing_type (select), currency (select), and dynamic pricing_tiers editor (add/remove rows with from/to/rate or amount fields). For STEP_FUNCTION, show step_windows editor instead.
   - Version history drawer (slide-in panel showing version timeline)
   - Follow UI patterns from `apps/back-office/src/pages/fee-billing-desk.tsx` (summary cards, tabs, tables, dialogs)

5. Add route to `apps/back-office/src/routes/index.tsx`: `/operations/pricing-library` → lazy-loaded PricingLibrary component

**Files to create/modify:**
- `server/services/pricing-definition-service.ts` — NEW: Pricing library business logic
- `server/routes/back-office/pricing-definitions.ts` — NEW: REST API routes
- `server/routes.ts` — Register pricing-definitions router
- `apps/back-office/src/pages/trustfees/pricing-library.tsx` — NEW: Back-office UI page
- `apps/back-office/src/routes/index.tsx` — Add route for pricing library

**Acceptance criteria:**
- CRUD operations work end-to-end (create, read, update, list with filters)
- Version increments correctly on update
- Retirement is blocked when ACTIVE Fee Plans reference the pricing definition
- Approval flow enforces SoD (approver ≠ creator)
- Pricing tiers validation rejects overlapping or non-contiguous ranges
- UI renders data table with all columns, status badges, and action buttons
- Add/Edit dialog renders dynamic tier editor based on pricing_type selection

---

## Phase 3: Eligibility Library — Service, Routes, AST Engine & UI
**Dependencies:** Phase 1

**Description:**
Build the Eligibility Expression library with a composable boolean expression engine, form-based builder, JSON expert mode, and test evaluation. Delivers FR-004 (Manage Eligibility Library) and FR-029 (Unified Expression Builder).

**Tasks:**
1. Create `server/services/eligibility-engine.ts`:
   - `evaluate(expression: ASTNode, context: Record<string, any>): { result: boolean, trace: TraceNode[] }` — Evaluate an eligibility AST against a context object. Returns the boolean result plus an evaluation trace showing which nodes matched/failed.
   - AST node types: `{ op: 'AND'|'OR'|'NOT'|'EQ'|'NEQ'|'IN'|'BETWEEN', field?: string, value?: any, children?: ASTNode[] }`
   - AND: all children must be true
   - OR: at least one child must be true
   - NOT: single child, inverted
   - EQ: context[field] === value
   - NEQ: context[field] !== value
   - IN: value (array) includes context[field]
   - BETWEEN: context[field] >= value[0] && context[field] <= value[1]
   - `validate(expression: ASTNode): ValidationResult` — Check AST structure is valid (no empty children, valid ops, fields exist in allowed list)
   - Allowed fields: asset_class, sub_asset_class, security_id, security_type, customer_id, customer_type, portfolio_id, portfolio_type, customer_domicile, market, market_group, broker_id, event_type, txn_subtype

2. Create `server/services/eligibility-expression-service.ts`:
   - `create(data)` — Create expression (status=DRAFT)
   - `update(id, data)` — Update expression (validate AST before save)
   - `getAll(filters?)` — List with pagination
   - `getById(id)` — Single expression
   - `submit(id)` / `approve(id)` / `reject(id)` — Approval workflow
   - `retire(id)` — Block if referenced by ACTIVE Fee Plans
   - `testExpression(expressionId, sampleContext)` — Evaluate against sample context, return trace

3. Create `server/routes/back-office/eligibility-expressions.ts`:
   - Standard CRUD + approval endpoints
   - `POST /:id/test` — Test expression against sample context (body: { context: {...} })

4. Register route in `server/routes.ts`

5. Create `apps/back-office/src/pages/trustfees/eligibility-library.tsx`:
   - Data table listing all expressions with code, name, status, expression summary
   - Add/Edit dialog with two modes:
     - **Form mode** (default): Visual builder with nested groups. Each group has AND/OR toggle. Within groups, add conditions (field select + operator select + value input). Support nested groups via "Add Group" button.
     - **JSON mode** (role-gated toggle): Raw JSON editor with syntax highlighting (textarea with monospace font)
   - "Test" button that opens a dialog with sample context fields (key-value pairs) and shows evaluation result + trace tree
   - Both modes produce/consume the same AST JSON structure (round-trip fidelity)

6. Add route to `apps/back-office/src/routes/index.tsx`: `/operations/eligibility-library`

**Files to create/modify:**
- `server/services/eligibility-engine.ts` — NEW: AST evaluation engine with trace
- `server/services/eligibility-expression-service.ts` — NEW: CRUD + approval
- `server/routes/back-office/eligibility-expressions.ts` — NEW: REST API
- `server/routes.ts` — Register eligibility router
- `apps/back-office/src/pages/trustfees/eligibility-library.tsx` — NEW: UI with form builder + JSON mode
- `apps/back-office/src/routes/index.tsx` — Add route

**Acceptance criteria:**
- AST evaluation correctly handles AND/OR/NOT/EQ/NEQ/IN/BETWEEN operators
- Nested expressions evaluate correctly (e.g., AND(asset_class=EQUITY, OR(broker_id=BOA, broker_id=GS)))
- Test endpoint returns evaluation trace showing which nodes matched/failed
- Form builder produces valid AST; JSON editor round-trips identically
- Retirement blocked when referenced by ACTIVE Fee Plans
- Expression validation rejects malformed ASTs (empty children, invalid ops)

---

## Phase 4: Accrual Schedule Library & Fee Plan Templates
**Dependencies:** Phase 1

**Description:**
Build the Accrual Schedule library with frequency validation and the Fee Plan Template library. These are the remaining prerequisites for the Fee Plan wizard. Delivers FR-005 (Accrual Schedule Library) and FR-006 (Fee Plan Template Library).

**Tasks:**
1. Create `server/services/accrual-schedule-service.ts`:
   - Standard CRUD + approval lifecycle (same pattern as pricing-definition-service)
   - Validation rules:
     - basis_frequency ≤ accrual_frequency (DAILY ≤ MONTHLY ≤ QUARTERLY ≤ SEMI_ANNUAL ≤ ANNUAL)
     - accounting_frequency between accrual_frequency and invoice_frequency
     - upfront_amortization only when invoice_frequency=ANNUAL
     - If accrual_enabled=true, accrual_frequency is required
     - If accounting_enabled=true, accounting_frequency is required
     - If reversal_enabled=true, reversal_age_days is required
   - Retirement blocking when referenced by ACTIVE Fee Plans

2. Create `server/services/fee-plan-template-service.ts`:
   - `create(data)` — Create template with default_payload (JSONB skeleton of Fee Plan fields)
   - `update(id, data)` / `getAll()` / `getById(id)` / `toggleActive(id)`
   - `getByCategory(category)` — Filter by template category
   - `instantiate(templateId)` — Returns a FeePlan draft pre-filled from the template's default_payload

3. Create `server/routes/back-office/accrual-schedules.ts` — Standard CRUD + approval endpoints
4. Create `server/routes/back-office/fee-plan-templates.ts` — CRUD endpoints
5. Register both routes in `server/routes.ts`

6. Create `apps/back-office/src/pages/trustfees/accrual-schedule-library.tsx`:
   - Data table: code, name, accrual freq, invoice freq, method, reversal enabled, status
   - Add/Edit dialog with conditional field visibility (show reversal fields only when reversal_enabled=true, upfront only when invoice_frequency=ANNUAL)
   - Frequency ordering validation in the form

7. Create `apps/back-office/src/pages/trustfees/fee-plan-templates.tsx`:
   - Data table: code, name, category, jurisdiction, active status
   - Add/Edit dialog with default_payload JSON editor
   - Preview: show what fields would be pre-filled when instantiating from template

8. Add routes to `apps/back-office/src/routes/index.tsx`

**Files to create/modify:**
- `server/services/accrual-schedule-service.ts` — NEW
- `server/services/fee-plan-template-service.ts` — NEW
- `server/routes/back-office/accrual-schedules.ts` — NEW
- `server/routes/back-office/fee-plan-templates.ts` — NEW
- `server/routes.ts` — Register both routers
- `apps/back-office/src/pages/trustfees/accrual-schedule-library.tsx` — NEW
- `apps/back-office/src/pages/trustfees/fee-plan-templates.tsx` — NEW
- `apps/back-office/src/routes/index.tsx` — Add routes

**Acceptance criteria:**
- Frequency ordering validation correctly rejects invalid combinations
- Upfront amortization only available when invoice_frequency=ANNUAL
- Template instantiation correctly pre-fills a Fee Plan draft from default_payload
- Retirement blocking works on accrual schedules
- All CRUD operations work end-to-end

---

## Phase 5: Fee Plan Core — Service, Wizard UI & Approval
**Dependencies:** Phase 2, Phase 3, Phase 4

**Description:**
Build the central Fee Plan entity with its 4-step wizard, maker-checker approval, pricing binding governance, and lifecycle management. This is the canonical fee configuration artifact. Delivers FR-001 (Fee Plan Wizard), FR-002 (Approval), FR-027 (Pricing Binding Governance).

**Tasks:**
1. Create `server/services/fee-plan-service.ts`:
   - `create(data)` — Create Fee Plan (status=DRAFT). If template_id provided, merge template default_payload. Validate: unique fee_plan_code; charge_basis=PERIOD requires accrual_schedule_id; charge_basis=EVENT requires event_type; pricing_binding_mode=STRICT captures pricing_binding_version from referenced PricingDefinition's current version; jurisdiction must be ACTIVE.
   - `update(id, data)` — Update DRAFT plan
   - `getAll(filters)` — List with filters (status, fee_type, jurisdiction, search), pagination
   - `getById(id)` — With resolved references (pricing, eligibility, schedule, template, jurisdiction names)
   - `submit(id)` — DRAFT → PENDING_APPROVAL. Emit audit event FEE_PLAN_SUBMITTED.
   - `approve(id, approverId)` — PENDING_APPROVAL → ACTIVE. SoD: approverId ≠ created_by. Emit FEE_PLAN_ACTIVATED.
   - `reject(id, approverId, comment)` — PENDING_APPROVAL → DRAFT with rejection reason.
   - `suspend(id)` — ACTIVE → SUSPENDED (blocks new accruals)
   - `supersede(id)` — ACTIVE → SUPERSEDED (creates new DRAFT version)
   - `expire(id)` — ACTIVE → EXPIRED (auto-triggered when expiry_date reached)
   - `rebindPricing(id, newPricingVersionId)` — Update pricing_binding_version for STRICT-bound plan. Requires Maker-Checker. Emit audit event.
   - `computePreview(feePlanId, context)` — Live calculation preview using pricing tiers and sample AUM/transaction. Must return in ≤300ms. Returns: { computed_fee, breakdown: { tier, rate, amount }[], eligibility_result, trace }.
   - `getFeePlansForPricingVersion(pricingId)` — List all ACTIVE plans pinning a given pricing version (for re-bind wizard)

2. Create `server/routes/back-office/fee-plans.ts`:
   - `GET /` — List fee plans
   - `GET /:id` — Get single plan with resolved references
   - `POST /` — Create fee plan
   - `PUT /:id` — Update draft plan
   - `POST /:id/submit` — Submit for approval
   - `POST /:id/approve` — Approve
   - `POST /:id/reject` — Reject
   - `POST /:id/suspend` — Suspend
   - `POST /:id/supersede` — Supersede
   - `POST /:id/rebind-pricing` — Rebind to new pricing version
   - `POST /compute-preview` — Live fee computation preview
   - `GET /by-pricing/:pricingId` — Plans referencing a pricing definition

3. Register route in `server/routes.ts`

4. Create `apps/back-office/src/pages/trustfees/fee-plan-wizard.tsx`:
   - **Step 1 — Basics**: fee_plan_code, fee_plan_name, description, charge_basis (EVENT/PERIOD toggle), fee_type (select), jurisdiction (select), source_party, target_party, template selector (optional — pre-fills all fields on select)
   - **Step 2 — Pricing & Eligibility**: pricing_definition_id (searchable select with preview of tiers), pricing_binding_mode (STRICT default, LATEST_APPROVED with warning banner), eligibility_expression_id (searchable select with expression preview), comparison_basis, value_basis
   - **Step 3 — Schedule & Thresholds** (visible only for PERIOD charge_basis): accrual_schedule_id (searchable select with schedule preview), rate_type, min/max_charge_amount, lower/upper_threshold_pct, AUM basis toggles (include_uitf, include_3p_funds, mv_includes_accruals_override), effective_date, expiry_date
   - **Step 4 — Review & Preview**: Read-only summary of all fields. Live calculation preview panel showing computed fee for a sample AUM value (user-adjustable input). Submit button (saves as DRAFT).
   - Stepper navigation with progress indicator. Draft auto-save on step change.

5. Create `apps/back-office/src/pages/trustfees/fee-plan-list.tsx`:
   - Summary cards: Total plans, Active, Pending approval, Suspended
   - Filterable data table: code, name, fee_type, charge_basis, jurisdiction, status, effective_date
   - Row actions: View, Edit (if DRAFT), Submit, Approve/Reject (if PENDING_APPROVAL, role-gated), Suspend, Supersede
   - Click row → Fee Plan detail view
   - "New Fee Plan" button → navigates to wizard
   - Approval diff viewer: when status=PENDING_APPROVAL, show field-level diff vs last approved version

6. Create `apps/back-office/src/pages/trustfees/fee-plan-detail.tsx`:
   - Full detail view with all fields resolved (pricing name, eligibility name, schedule name)
   - Pricing binding section: current version, re-bind button (opens re-bind wizard dialog)
   - Lifecycle timeline showing status transitions with timestamps and actors
   - Related data tabs: Accruals (linked tfpAccruals), Invoices (linked tfpInvoices), Overrides (linked feeOverrides)

7. Add routes to `apps/back-office/src/routes/index.tsx`:
   - `/operations/fee-plans` → FeePlanList
   - `/operations/fee-plans/new` → FeePlanWizard
   - `/operations/fee-plans/:id` → FeePlanDetail
   - `/operations/fee-plans/:id/edit` → FeePlanWizard (edit mode)

**Files to create/modify:**
- `server/services/fee-plan-service.ts` — NEW: Fee Plan business logic
- `server/routes/back-office/fee-plans.ts` — NEW: REST API
- `server/routes.ts` — Register fee-plans router
- `apps/back-office/src/pages/trustfees/fee-plan-wizard.tsx` — NEW: 4-step wizard
- `apps/back-office/src/pages/trustfees/fee-plan-list.tsx` — NEW: List page
- `apps/back-office/src/pages/trustfees/fee-plan-detail.tsx` — NEW: Detail page
- `apps/back-office/src/routes/index.tsx` — Add 4 new routes

**Acceptance criteria:**
- Fee Plan wizard completes in 4 steps with live preview updating in ≤2 seconds
- Template-seeded plans pre-fill all references correctly
- Draft auto-saves on step navigation
- Maker-checker approval enforces SoD (approver ≠ creator)
- STRICT pricing binding captures version at save time
- LATEST_APPROVED toggle shows warning banner
- Pricing re-bind wizard shows affected Fee Plans and triggers audit event
- Status lifecycle transitions are correctly guarded (only valid transitions allowed)
- Compute preview returns breakdown with tier/rate/amount detail

---

## Phase 6: Accrual Engine & EOD Integration
**Dependencies:** Phase 5

**Description:**
Build the full-featured accrual engine with all BRD formulae (Discretionary, Directional, Bonds, Escrow step, etc.) and integrate it with the EOD orchestrator DAG. Also implements event-based fee computation. Delivers FR-007 (Period-Based Accrual), FR-008 (Event-Based Calculation), and EOD batch integration.

**Tasks:**
1. Create `server/services/tfp-accrual-engine.ts` — the production accrual engine replacing the basic fee-engine-service calculations:
   - `runDailyAccrual(businessDate: string)` — Main entry point called by EOD job. For each ACTIVE FeePlan with charge_basis=PERIOD:
     a. Resolve eligible (plan × customer × portfolio × security) combinations using eligibility engine
     b. For each combination, compute daily accrual based on fee_type and pricing definition:
        - **Discretionary Trust**: ADB × rate × days / 360 (daily: ADB × rate / 360)
        - **Directional Deposits (short-term)**: Deposit × rate × term / 360 (collected at maturity)
        - **Directional Deposits (long-term)**: Deposit × rate × interest_payment_days / 360
        - **Bonds**: Face_Value × rate × coupon_days / 360 at coupon; between coupons prorata daily
        - **Preferred Equities**: Acquisition_Cost × rate × dividend_days / 360; between dividends prorata
        - **Loans**: Balance × rate × interest_payment_days / 360; pre-payment prorata
        - **T-Bills / Commercial Papers**: Cost × rate × term / 360 at maturity; early sale prorata
        - **Escrow (Buy-Sell) with step**: Apply step_window amount for months-since-engagement
        - **Generic SLAB pricing**: Apply slab cumulative or incremental rate/amount tiers
     c. Apply min_charge_amount and max_charge_amount caps
     d. Generate idempotency_key = `{fee_plan_id}:{portfolio_id}:{accrual_date}` to prevent duplicate accruals
     e. Check if override exists (from order-capture stage) — apply overridden amount
     f. Insert into tfpAccruals (status=OPEN)
     g. If any computation fails (missing FX, missing price, etc.), create ExceptionItem instead of accrual
     h. Return summary: { processed, created, skipped (idempotent), exceptions }
   - `getADB(portfolioId, date)` — Calculate Average Daily Balance from nav_computations table (average of total_nav over the month-to-date)
   - `getBaseAmount(feePlan, portfolio, security, date)` — Resolve base amount based on value_basis (AUM, BUM, TXN_AMOUNT, FACE_VALUE, etc.) from relevant source tables (nav_computations, positions, etc.)
   - `applyPricingTiers(pricingDef, baseAmount)` — Apply pricing tiers (FIXED_AMOUNT, FIXED_RATE, SLAB_CUMULATIVE_RATE, SLAB_INCREMENTAL_RATE, STEP_FUNCTION, etc.)
   - `applyStepFunction(stepWindows, monthsSinceEngagement)` — For Escrow step-function pricing

2. Create `server/services/tfp-event-fee-service.ts`:
   - `computePreview(feePlanId, transactionContext)` — For EVENT-based fees (e.g., brokerage commission on trade). Evaluates eligibility, applies pricing, returns computed fee with breakdown and eligibility trace. Must complete in ≤300ms.
   - `captureEventFee(feePlanId, transactionId, transactionContext)` — Persist event-based fee as tfpAccrual record
   - Used by order management and trade execution flows

3. Modify `server/services/eod-orchestrator.ts`:
   - Update JOB_DEFINITIONS to wire `fee_accrual` job to call `tfpAccrualEngine.runDailyAccrual(runDate)`
   - Add new jobs after fee_accrual:
     - `{ name: 'invoice_generation', displayName: 'Invoice Generation', dependsOn: ['fee_accrual'] }`
     - `{ name: 'notional_accounting', displayName: 'Notional Accounting', dependsOn: ['invoice_generation'] }`
     - `{ name: 'reversal_check', displayName: 'Reversal Check', dependsOn: ['notional_accounting'] }`
     - `{ name: 'exception_sweep', displayName: 'Exception Sweep', dependsOn: ['reversal_check', 'data_quality_check'] }`
   - Update `executeJob()` to dispatch to the actual service methods based on job_name (currently a stub with setTimeout)

4. Create `server/routes/back-office/tfp-accruals.ts`:
   - `GET /` — List accruals with filters (date, portfolio, fee_plan, status, page, pageSize)
   - `GET /summary` — Summary for date: total accrued, count, by fee_type breakdown
   - `POST /run` — Manual daily accrual trigger (body: { date })
   - `GET /:id` — Single accrual detail with fee plan and portfolio info

5. Register route in `server/routes.ts`

6. Create `apps/back-office/src/pages/trustfees/accrual-workbench.tsx`:
   - Summary cards: Today's accruals (count + total PHP), MTD accruals, exceptions raised, pending overrides
   - Date picker for viewing specific business date
   - Data table: accrual_date, portfolio, fee_plan_code, fee_type, base_amount, computed_fee, applied_fee, currency, status
   - Status badges: OPEN=blue, ACCOUNTED=green, INVOICED=purple, REVERSED=red
   - "Run Daily Accrual" button (manual trigger with date input)
   - Breakdown drawer: click a row to see computation breakdown (tiers applied, ADB value, rate, days, formula used)
   - Link to EOD Dashboard for batch monitoring
   - 30-second auto-refresh

7. Add route to `apps/back-office/src/routes/index.tsx`: `/operations/accrual-workbench`

**Files to create/modify:**
- `server/services/tfp-accrual-engine.ts` — NEW: Full accrual engine with all BRD formulae
- `server/services/tfp-event-fee-service.ts` — NEW: Event-based fee computation
- `server/services/eod-orchestrator.ts` — MODIFY: Wire fee_accrual job, add invoice_generation/notional_accounting/reversal_check/exception_sweep jobs
- `server/routes/back-office/tfp-accruals.ts` — NEW: Accrual API routes
- `server/routes.ts` — Register tfp-accruals router
- `apps/back-office/src/pages/trustfees/accrual-workbench.tsx` — NEW: Accrual workbench UI
- `apps/back-office/src/routes/index.tsx` — Add route

**Acceptance criteria:**
- Daily accrual runs for all ACTIVE period-based Fee Plans
- Discretionary formula: ADB × rate / 360 produces correct daily amounts
- Escrow step-function applies correct step_window amounts based on months-since-engagement
- Slab pricing (cumulative and incremental) calculates correctly for tiered rates
- Idempotency prevents duplicate accruals for same plan×portfolio×date
- Failed computations create ExceptionItems instead of crashing the batch
- EOD fee_accrual job calls the real accrual engine (not the stub)
- EOD DAG includes invoice_generation, notional_accounting, reversal_check, exception_sweep jobs
- Event-based compute-preview returns in ≤300ms with eligibility trace
- Accrual Workbench displays data with computation breakdown drawer

---

## Phase 7: Invoice Generation, Payment & Reversal
**Dependencies:** Phase 6

**Description:**
Build invoice generation (aggregation per customer×currency with tax lines), payment capture with partial/over-payment handling, automatic reversal engine, and ad-hoc fee support. Delivers FR-011 through FR-016 (Accounting, Invoicing, Payment & Reversal module) and FR-013 (Ad-hoc Fees).

**Tasks:**
1. Create `server/services/tfp-invoice-service.ts`:
   - `generateInvoices(periodFrom, periodTo)` — Aggregate OPEN accruals by (customer_id × currency):
     a. Group accruals within period
     b. For each group, create tfpInvoice (status=DRAFT) with auto-generated invoice_number (INV-YYYY-NNNNNNN)
     c. Create tfpInvoiceLine for each accrual (link accrual_id, calculate tax per line using TaxRule)
     d. Apply tax rules from jurisdiction's active Tax Rule Pack (VAT, WHT, DST)
     e. Sum total_amount, tax_amount, grand_total
     f. Set due_date = invoice_date + accrual_schedule.due_date_offset_days
     g. Mark accruals as INVOICED
     h. Return: { invoices_created, total_amount, exceptions }
   - `issueInvoice(invoiceId)` — DRAFT → ISSUED. Generate PDF URL (stub).
   - `getInvoices(filters)` — Paginated list with filters (status, customer, date range, currency)
   - `getInvoiceDetail(id)` — Invoice with lines, related payments, dispute info
   - `markOverdue()` — Batch: find ISSUED invoices past due_date → update status to OVERDUE
   - `getAgeing()` — Ageing buckets: current, 1-30, 31-60, 61-90, 90+ days overdue

2. Create `server/services/tfp-payment-service.ts`:
   - `capturePayment(data)` — Record payment against invoice. Handle partial (update invoice to PARTIALLY_PAID), full (update to PAID), and over-payment (log excess, create ExceptionItem for reconciliation).
   - `getPayments(filters)` — List payments
   - `reversePayment(paymentId, reason)` — Reverse a posted payment (POSTED → REVERSED)
   - `reconcileFxDiff(paymentId)` — If FX difference ≤1%, auto-post to gain/loss. If >1%, create approval request.

3. Create `server/services/tfp-reversal-service.ts`:
   - `checkReversals(businessDate)` — Called by EOD reversal_check job. Find OVERDUE invoices where related accrual_schedule has reversal_enabled=true and age ≥ reversal_age_days. For each candidate:
     a. Create reversal accrual entries (negative amounts)
     b. Emit notional accounting reversal events
     c. Update invoice status to CANCELLED
     d. Mark related accruals as REVERSED
   - `getReversalCandidates()` — List upcoming reversals for review

4. Create `server/services/tfp-adhoc-fee-service.ts`:
   - `captureAdhocFee(data)` — Create ad-hoc fee accrual (requires maker-checker). Fields: customer_id, portfolio_id, fee_type, amount, currency, reason_code, reason_notes.
   - `getAdhocFees(filters)` — List ad-hoc fees
   - Ad-hoc fees flow through the same invoice pipeline (aggregated into next invoice cycle or immediate invoice)

5. Create `server/routes/back-office/tfp-invoices.ts`, `server/routes/back-office/tfp-payments.ts`, `server/routes/back-office/tfp-adhoc-fees.ts` — REST endpoints for each service

6. Register all routes in `server/routes.ts`

7. Create `apps/back-office/src/pages/trustfees/invoice-workbench.tsx`:
   - Summary cards: Total invoices, Outstanding amount, Overdue count, This month's revenue
   - Tabs: All Invoices, Draft, Issued, Overdue, Paid
   - Data table: invoice_number, customer, currency, total_amount, tax_amount, grand_total, invoice_date, due_date, status
   - Row actions: View detail, Issue (if DRAFT), Record Payment
   - Invoice detail drawer: shows all invoice lines with accrual references, payment history, dispute status
   - "Generate Invoices" button (dialog with period_from/period_to inputs)
   - Ageing report panel: bar chart showing overdue distribution by bucket
   - 30-second auto-refresh

8. Create `apps/back-office/src/pages/trustfees/payment-application.tsx`:
   - Search for invoice by number or customer
   - Payment form: amount, currency, payment_date, method (select), reference_no
   - FX difference handling: show warning if payment currency ≠ invoice currency, compute difference
   - Payment history table for selected invoice
   - Partial payment progress bar

9. Create `apps/back-office/src/pages/trustfees/adhoc-fee-capture.tsx`:
   - Form: customer (searchable select), portfolio (searchable select), fee_type, amount, currency, reason_code (controlled vocabulary select), reason_notes
   - Preview calculation panel
   - Submit for approval (maker-checker)

10. Update EOD orchestrator `executeJob()`: wire `invoice_generation` to call `tfpInvoiceService.generateInvoices()` and `reversal_check` to call `tfpReversalService.checkReversals()`

11. Add routes to `apps/back-office/src/routes/index.tsx`

**Files to create/modify:**
- `server/services/tfp-invoice-service.ts` — NEW: Invoice generation & lifecycle
- `server/services/tfp-payment-service.ts` — NEW: Payment capture & reconciliation
- `server/services/tfp-reversal-service.ts` — NEW: Automatic reversal engine
- `server/services/tfp-adhoc-fee-service.ts` — NEW: Ad-hoc fee capture
- `server/routes/back-office/tfp-invoices.ts` — NEW
- `server/routes/back-office/tfp-payments.ts` — NEW
- `server/routes/back-office/tfp-adhoc-fees.ts` — NEW
- `server/routes.ts` — Register 3 new routers
- `server/services/eod-orchestrator.ts` — MODIFY: Wire invoice_generation and reversal_check job execution
- `apps/back-office/src/pages/trustfees/invoice-workbench.tsx` — NEW
- `apps/back-office/src/pages/trustfees/payment-application.tsx` — NEW
- `apps/back-office/src/pages/trustfees/adhoc-fee-capture.tsx` — NEW
- `apps/back-office/src/routes/index.tsx` — Add 3 routes

**Acceptance criteria:**
- Invoice generation aggregates accruals by customer×currency correctly
- Tax lines calculated per jurisdiction's Tax Rule Pack (12% VAT for PH)
- Invoice numbering follows INV-YYYY-NNNNNNN format with sequential uniqueness
- Partial payments update invoice to PARTIALLY_PAID with correct remaining balance
- Full payments update invoice to PAID
- Over-payments create ExceptionItem for reconciliation
- FX difference ≤1% auto-posted; >1% requires approval
- Automatic reversal correctly reverses notional entries for overdue invoices past reversal_age_days
- Ad-hoc fees go through maker-checker approval
- EOD invoice_generation and reversal_check jobs execute real service methods

---

## Phase 8: Override Lane & Exception Queue
**Dependencies:** Phase 6, Phase 7

**Description:**
Build the universal override lane (4 lifecycle stages with threshold auto-approval) and the Exception Queue workbench with SLA timers, assignment, escalation, and KPI dashboard. Delivers FR-010 (Override Lane), FR-024 (Exception Queue Management).

**Tasks:**
1. Create `server/services/fee-override-service.ts`:
   - `requestOverride(data)` — Create override request. Calculate delta_pct = |overridden - original| / original. If delta_pct within lower_threshold_pct…upper_threshold_pct of the Fee Plan → AUTO_APPROVED (apply immediately). Otherwise → PENDING (requires Checker approval).
   - `approveOverride(overrideId, approverId)` — PENDING → APPROVED. Apply overridden amount to the linked accrual or invoice. SoD: approverId ≠ requested_by.
   - `rejectOverride(overrideId, approverId, comment)` — PENDING → REJECTED. Original amount retained.
   - `getOverrides(filters)` — List with filters (stage, status, date range)
   - `getPendingOverrides()` — Queue for approval
   - Override stages: ORDER_CAPTURE (at trade entry), ACCRUAL (during accrual run), INVOICE (on invoice), PAYMENT (at payment application)

2. Create `server/services/exception-queue-service.ts`:
   - `createException(data)` — Create ExceptionItem. Compute SLA deadline based on severity (P1=4h, P2=8h, P3=24h from now). Auto-assign to team via round-robin.
   - `assignException(exceptionId, userId)` — OPEN → IN_PROGRESS with assignee
   - `resolveException(exceptionId, resolutionNotes, linkedAuditEventId?)` — IN_PROGRESS/ESCALATED → RESOLVED
   - `escalateException(exceptionId, reason?)` — IN_PROGRESS → ESCALATED. Notify manager.
   - `markWontFix(exceptionId, reason)` — Any → WONT_FIX with compliance review flag
   - `checkSlaBreaches()` — Called by EOD exception_sweep job. Find OPEN/IN_PROGRESS exceptions past sla_due_at → auto-escalate.
   - `getExceptions(filters)` — Filterable list (severity, type, team, status, SLA state, customer)
   - `getKpiDashboard()` — SLA adherence %, backlog age distribution, type mix, assignment load by analyst
   - `bulkReassign(exceptionIds, newUserId)` — Bulk reassign
   - `bulkResolve(exceptionIds, resolutionTemplate)` — Bulk resolve with template

3. Create `server/routes/back-office/fee-overrides.ts` and `server/routes/back-office/exceptions.ts`
4. Register routes in `server/routes.ts`

5. Create `apps/back-office/src/pages/trustfees/override-approval-queue.tsx`:
   - Summary cards: Pending overrides, Auto-approved today, Rejected today, Average delta %
   - Data table: stage, fee_plan_code, customer, original_amount, overridden_amount, delta_pct, reason_code, status, requested_by
   - Approve/Reject actions with confirmation dialog
   - Filter by stage, status, date range
   - Threshold visualization: show lower/upper thresholds for each override

6. Create `apps/back-office/src/pages/trustfees/exception-workbench.tsx`:
   - **Filter bar**: severity (P1/P2/P3 toggles), type, team, SLA state (on-time/at-risk/breached), customer search
   - **Grid with virtual scroll**: exception_id, type, severity, title, customer, assigned_to, SLA countdown timer (live), status
   - **SLA indicators**: Green (>50% time remaining), Amber (25-50%), Red (<25% or breached), with animated countdown
   - **Detail drawer** (slide-in on row click): Full exception detail, source aggregate link, action buttons (Progress → IN_PROGRESS, Resolve, Escalate, Reassign)
   - **KPI side panel**: SLA adherence % (gauge chart), Backlog by severity (bar chart), Type distribution (pie), Age distribution (histogram)
   - **Bulk actions toolbar**: Select multiple → Reassign, Resolve with template, Escalate
   - 15-second auto-refresh

7. Wire EOD exception_sweep job to call `exceptionQueueService.checkSlaBreaches()`

8. Add routes to `apps/back-office/src/routes/index.tsx`

**Files to create/modify:**
- `server/services/fee-override-service.ts` — NEW
- `server/services/exception-queue-service.ts` — NEW
- `server/routes/back-office/fee-overrides.ts` — NEW
- `server/routes/back-office/exceptions.ts` — NEW
- `server/routes.ts` — Register 2 routers
- `server/services/eod-orchestrator.ts` — MODIFY: Wire exception_sweep job
- `apps/back-office/src/pages/trustfees/override-approval-queue.tsx` — NEW
- `apps/back-office/src/pages/trustfees/exception-workbench.tsx` — NEW
- `apps/back-office/src/routes/index.tsx` — Add 2 routes

**Acceptance criteria:**
- Override within threshold auto-approves immediately
- Override beyond threshold requires Checker approval with SoD
- Override delta_pct calculated correctly
- Approved override updates the linked accrual/invoice applied_fee
- Exception SLA deadlines computed correctly (P1=4h, P2=8h, P3=24h)
- SLA breach auto-escalation works in EOD sweep
- Round-robin assignment distributes exceptions evenly
- KPI dashboard shows accurate SLA adherence %, backlog distribution
- Bulk actions (reassign, resolve) work for multiple selected exceptions
- Exception workbench countdown timers update in real-time

---

## Phase 9: Audit Trail, Tax Module & Dispute Management
**Dependencies:** Phase 7, Phase 8

**Description:**
Build the batched HMAC audit chain, tax rule engine with jurisdiction awareness, dispute management with credit notes, and the collection-at-event trigger system. Delivers FR-021 (Audit), FR-023 (Disputes), FR-016 (Collection at CA/Maturity), and the tax sub-module.

**Tasks:**
1. Create `server/services/tfp-audit-service.ts`:
   - `logEvent(aggregateType, aggregateId, eventType, payload, actorId)` — Append audit event. Events are buffered in memory for the current 1-minute window.
   - `flushWindow()` — Called every 60 seconds. Takes all buffered events, computes HMAC signature linking to previous window's hash (chain integrity), inserts auditWindowSignature record, associates all events with this window.
   - `verifyChain(fromDate?, toDate?)` — Walk the chain of auditWindowSignatures, verify each window's HMAC against its events and previous hash. Return: { verified: boolean, windows_checked, first_broken_window? }
   - `searchEvents(filters)` — Search audit events by aggregate_type, aggregate_id, event_type, actor, date range. Paginated.
   - `exportEvents(filters, format)` — Export audit events as CSV/JSON with PII redaction applied per PiiClassification catalog

2. Create `server/services/tax-rule-engine.ts`:
   - `getApplicableRules(jurisdictionId, feeType, date)` — Find active TaxRules for jurisdiction + fee type on given date
   - `computeTax(amount, rules)` — Apply tax rules (VAT additive, WHT subtractive, DST per-transaction)
   - `getTaxSummary(periodFrom, periodTo, jurisdictionId?)` — Aggregate tax amounts by type and period

3. Create `server/services/dispute-service.ts`:
   - `raiseDispute(invoiceId, raisedBy, reason)` — Create Dispute (OPEN). Update invoice status to DISPUTED. Suspend any pending reversals.
   - `investigate(disputeId)` — OPEN → INVESTIGATING
   - `resolve(disputeId, resolution, refundAmount?)` — If refund: create CreditNote, link to dispute. Update invoice: if full refund → CANCELLED, partial → recalculate balance. INVESTIGATING → RESOLVED.
   - `rejectDispute(disputeId, reason)` — INVESTIGATING → REJECTED. Restore invoice to prior status (ISSUED or OVERDUE).
   - `getDisputes(filters)` — List disputes with invoice info

4. Create `server/services/credit-note-service.ts`:
   - `issueCreditNote(relatedInvoiceId, amount, currency, reasonCode)` — Create CreditNote (CN-YYYY-NNNNNNN format). Update invoice balance.
   - `applyCreditNote(creditNoteId)` — ISSUED → APPLIED
   - `cancelCreditNote(creditNoteId)` — ISSUED → CANCELLED

5. Create `server/services/collection-trigger-service.ts`:
   - `onCorporateAction(caEvent)` — When custody emits CA event (dividend, coupon, etc.), trigger same-day invoicing of accrued trust fees. Calculate prorata if between CA dates.
   - `onMaturity(maturityEvent)` — Trigger fee collection at bond/deposit maturity
   - `onPreTermination(preTermEvent)` — Trigger fee collection at early termination
   - `onRedemptionViaSale(saleEvent)` — Trigger fee collection on fund redemption
   - Each trigger: find all OPEN accruals for the portfolio/security, generate immediate invoice, link to the triggering event

6. Create routes: `server/routes/back-office/tfp-audit.ts`, `server/routes/back-office/disputes.ts`

7. Register routes in `server/routes.ts`

8. Create `apps/back-office/src/pages/trustfees/audit-explorer.tsx`:
   - Search panel: aggregate_type, aggregate_id, event_type, actor, date range
   - Timeline view of audit events (vertical timeline with event cards)
   - "Verify Chain" button with progress indicator and result (green checkmark or red alert with broken window details)
   - Export button (CSV/JSON)

9. Create `apps/back-office/src/pages/trustfees/dispute-management.tsx`:
   - Data table: dispute_id, invoice_number, customer, reason (truncated), status, raised_date
   - Status workflow buttons: Investigate, Resolve (with refund option), Reject
   - Resolve dialog: refund amount (partial or full), reason, credit note preview
   - Linked invoice and credit note display

10. Add routes to `apps/back-office/src/routes/index.tsx`

**Files to create/modify:**
- `server/services/tfp-audit-service.ts` — NEW: Batched HMAC audit chain
- `server/services/tax-rule-engine.ts` — NEW: Tax calculation engine
- `server/services/dispute-service.ts` — NEW: Dispute lifecycle
- `server/services/credit-note-service.ts` — NEW: Credit note management
- `server/services/collection-trigger-service.ts` — NEW: CA/maturity/pre-termination triggers
- `server/routes/back-office/tfp-audit.ts` — NEW
- `server/routes/back-office/disputes.ts` — NEW
- `server/routes.ts` — Register routers
- `apps/back-office/src/pages/trustfees/audit-explorer.tsx` — NEW
- `apps/back-office/src/pages/trustfees/dispute-management.tsx` — NEW
- `apps/back-office/src/routes/index.tsx` — Add routes

**Acceptance criteria:**
- Audit events are buffered into 1-minute windows with HMAC chain linking
- Chain verification detects tampered or missing windows
- Tax rules apply correct rates per jurisdiction and fee type
- VAT (12% for PH) adds correctly to invoice lines
- Dispute raises correctly transition invoice to DISPUTED and suspend reversals
- Credit notes generate with CN-YYYY-NNNNNNN format
- Partial refunds correctly reduce invoice balance
- Corporate action triggers produce same-day invoices for accrued fees
- Maturity and pre-termination triggers work for respective fee types
- Audit explorer displays timeline and supports chain verification

---

## Phase 10: Dashboards, Reports & Navigation
**Dependencies:** Phase 6, Phase 7, Phase 8, Phase 9

**Description:**
Build the fee management dashboards, printable reports, and update the back-office navigation to incorporate all TrustFees Pro pages under a dedicated sidebar section. Also builds the Fee & Billing landing page that replaces the current basic fee-billing-desk. Delivers FR-017 (Dashboards), FR-018 (Reports).

**Tasks:**
1. Create `apps/back-office/src/pages/trustfees/fee-dashboard.tsx` — Main TrustFees Pro landing page:
   - **KPI Row**: Active Fee Plans count, Today's accruals (PHP), Outstanding invoices (PHP), Exception backlog, STP rate %, Revenue MTD
   - **Accrual trend chart** (recharts line chart): daily accrual amounts over last 30 days
   - **Invoice status distribution** (recharts pie chart): DRAFT, ISSUED, PAID, OVERDUE, DISPUTED
   - **Exception SLA gauge** (recharts radial chart): % within SLA
   - **Quick links**: Accrual Workbench, Invoice Workbench, Exception Queue, Fee Plans
   - **Recent activity feed**: Last 10 audit events related to fee operations
   - Role-aware: different KPI emphasis for Ops vs Finance vs RM
   - 60-second auto-refresh

2. Create `apps/back-office/src/pages/trustfees/fee-reports.tsx` — Report generation hub:
   - Report catalog with cards: Fee Plan Register, Daily Accrual Summary, Invoice Register, Overdue Invoice Ageing, Fee Override Register, Reversal Log, Ad-hoc Fee Register, Tax Summary, Exception KPI Report
   - Each card has: description, date range inputs, "Generate" button
   - Report viewer: displays generated report in table format with print button and CSV export
   - Parameters per report type (date range, customer filter, fee type filter, etc.)

3. Update `apps/back-office/src/config/navigation.ts` — Add new "Fees & Charges" section:
   ```
   Fees & Charges (icon: Receipt)
     ├── Fee Dashboard            → /operations/fee-dashboard
     ├── Fee Plans                → /operations/fee-plans
     ├── Accrual Workbench        → /operations/accrual-workbench
     ├── Invoice Workbench        → /operations/invoice-workbench
     ├── Payment Application      → /operations/payment-application
     ├── Ad-hoc Fees              → /operations/adhoc-fees
     ├── Override Queue           → /operations/override-queue
     ├── Exception Queue          → /operations/exception-queue
     ├── Disputes                 → /operations/disputes
     ├── Audit Explorer           → /operations/fee-audit
     └── Fee Reports              → /operations/fee-reports
   Libraries (icon: Library) — sub-section or separate section
     ├── Pricing Library          → /operations/pricing-library
     ├── Eligibility Library      → /operations/eligibility-library
     ├── Accrual Schedules        → /operations/accrual-schedule-library
     └── Fee Plan Templates       → /operations/fee-plan-templates
   ```
   Remove or redirect the old "Fee & Billing" nav item at `/operations/fee-billing`

4. Update `apps/back-office/src/routes/index.tsx`:
   - Add route `/operations/fee-dashboard` → FeeDashboard
   - Add route `/operations/fee-reports` → FeeReports
   - Redirect `/operations/fee-billing` → `/operations/fee-dashboard` for backward compatibility

5. Create `server/routes/back-office/fee-reports.ts`:
   - `GET /catalog` — List available report types
   - `POST /generate` — Generate report (body: { reportType, params }) → returns structured data
   - Each report type queries relevant tables and returns formatted data:
     - Fee Plan Register: query feePlans with joins
     - Daily Accrual Summary: aggregate tfpAccruals by date/fee_type
     - Invoice Register: query tfpInvoices with lines
     - Overdue Ageing: tfpInvoices with due_date bucketing
     - Override Register: feeOverrides with fee plan info
     - Reversal Log: reversed accruals and invoices
     - Tax Summary: aggregate tax_amount by tax_code and period
     - Exception KPI: exceptionItems with SLA adherence calculation

6. Register route in `server/routes.ts`

**Files to create/modify:**
- `apps/back-office/src/pages/trustfees/fee-dashboard.tsx` — NEW: Main dashboard
- `apps/back-office/src/pages/trustfees/fee-reports.tsx` — NEW: Report hub
- `apps/back-office/src/config/navigation.ts` — MODIFY: Add Fees & Charges section, remove old Fee & Billing item
- `apps/back-office/src/routes/index.tsx` — MODIFY: Add dashboard and reports routes, add redirect
- `server/routes/back-office/fee-reports.ts` — NEW: Report generation API
- `server/routes.ts` — Register fee-reports router

**Acceptance criteria:**
- Fee Dashboard shows accurate real-time KPI numbers
- Charts render correctly (accrual trend, invoice distribution, SLA gauge)
- All 9 report types generate correct data with proper filters
- Reports support CSV export
- Navigation sidebar shows "Fees & Charges" section with all sub-pages
- Libraries section shows all 4 library pages
- Old `/operations/fee-billing` redirects to new fee dashboard
- Role-aware dashboard shows relevant KPIs per user role
- 60-second auto-refresh works on dashboard

---

## Phase 11: Seed Data, EOD Full-Cycle & Integration Testing
**Dependencies:** Phase 6, Phase 7, Phase 8, Phase 9, Phase 10

**Description:**
Final integration phase. Create comprehensive seed data for demo/testing, verify the complete EOD cycle (accrual → invoice → accounting → reversal → exception sweep), ensure all navigation works, and validate cross-cutting concerns.

**Tasks:**
1. Create `server/scripts/seed-trustfees-pro.ts` — Comprehensive seed script:
   - 3 Jurisdictions (PH, SG, ID) with linked tax/report packs
   - 5 Pricing Definitions (CUST_SLAB_3T, DISC_TIER, ESC_STEP_3M10K, FIXED_RATE_1PCT, EQUITY_BROKERAGE)
   - 4 Eligibility Expressions (ALL_DISCRETIONARY, ALL_DIRECTIONAL, EQ_BOA, ALL_BUY_EX_IPO)
   - 3 Accrual Schedules (SCH_DLY_MTH, SCH_DLY_QTR, SCH_MTH_MTH)
   - 5 Fee Plan Templates (TPL_DISC_STD_PH, TPL_DIR_BOND_PH, TPL_ESCROW_BS_PH, TPL_RET_FUND_PH, TPL_EQUITY_BROKERAGE)
   - 5 Sample Fee Plans (TRUST_DISC_DFLT, TRUST_DIR_BOND, ESCROW_BUYSELL_STEP, TXN_BROKERAGE_EQ, RET_FUND_TIERED) — all in ACTIVE status
   - Tax Rules (VAT12, WHT2, DST)
   - 10 Sample accruals across different plans and dates
   - 3 Sample invoices (1 DRAFT, 1 ISSUED, 1 PAID)
   - 2 Sample exceptions (1 OPEN P1, 1 IN_PROGRESS P2)
   - PII classifications for customer fields

2. Verify EOD full-cycle end-to-end:
   - Trigger EOD run via API
   - Verify fee_accrual job executes tfp-accrual-engine and creates accruals
   - Verify invoice_generation job creates invoices from accruals
   - Verify notional_accounting job emits accounting events
   - Verify reversal_check job processes overdue invoices
   - Verify exception_sweep job auto-escalates breached SLAs
   - Verify all jobs complete without errors in the DAG

3. Verify all navigation links work:
   - Every page in the "Fees & Charges" navigation section loads without errors
   - Every page in the "Libraries" section loads without errors
   - Old fee-billing URL redirects correctly
   - All API endpoints return valid responses

4. Cross-cutting verification:
   - Maker-checker approval flow works for Fee Plans (create → submit → approve)
   - Override auto-approval within threshold works
   - Exception creation on computation failure works
   - Audit events are logged for all state transitions
   - HMAC chain verification passes
   - Tax amounts calculate correctly on invoices
   - Dispute → CreditNote flow works end-to-end

5. Build verification: `npm run build` passes across all workspaces (packages/shared, packages/ui, apps/back-office, server)

**Files to create/modify:**
- `server/scripts/seed-trustfees-pro.ts` — NEW: Comprehensive seed data
- `server/scripts/seed-reference-data.ts` — MODIFY: Add call to seed-trustfees-pro after base reference data

**Acceptance criteria:**
- Seed script runs without errors and creates all sample data
- EOD full-cycle completes: all 10 jobs (including 4 new) execute in correct dependency order
- All 15+ TrustFees Pro pages load without errors
- Navigation sidebar correctly shows Fees & Charges section
- Fee Plan wizard creates a plan end-to-end (draft → submit → approve → active)
- Accrual → Invoice → Payment flow works end-to-end
- Override and Exception flows work correctly
- Audit chain verification passes
- `npm run build` passes with no TypeScript errors
- No regressions in existing functionality (settlement, NAV, reconciliation)
