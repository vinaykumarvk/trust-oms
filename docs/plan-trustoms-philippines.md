# Development Plan: TrustOMS Philippines — Order Management System

## Overview

TrustOMS Philippines is a full-fledged Order Management System for Philippine Trust Banking operations spanning Front Office (RM order capture, suitability, trader aggregation), Middle Office (dealing desk, confirmation, mandate monitoring, NAV computation), and Back Office (settlement, reconciliation, EOD, corporate actions, fees, taxation, regulatory reporting). The system serves 23+ roles across IMA, UITF, PMT, Pre-Need, Escrow, Agency, and Safekeeping trust products, with tiered 2/4/6-eyes maker-checker, hash-chained audit trail, and full BSP/SEC/BIR/AMLC regulatory compliance. Blue ocean features (AI suitability, intelligent routing, predictive settlement, what-if scenarios, ESG scoring) differentiate the platform for leading Philippine trust banks.

**Reference implementation**: PS-WMS monorepo at `/Users/n15318/PS-WMS` — React 18 + TypeScript + Vite + TanStack Query + shadcn/ui + Tailwind CSS frontend; Express.js + Drizzle ORM + PostgreSQL backend. The EDEF framework (Entity Definition Framework), CRUD factory, maker-checker, and audit trail patterns from PS-WMS are replicated and enhanced for trust banking.

**BRD**: `/Users/n15318/Trust OMS/docs/TrustOMS-Philippines-BRD-FINAL.md` — 140+ FRs, 23 screens, 27+ entities, 20 modules.

## Architecture Decisions

- **Decision 1: Monorepo with workspace packages** — Matches PS-WMS pattern. `apps/back-office` (ops), `apps/front-office` (RM + Trader), `apps/mid-office` (dealing desk + fund accounting), `apps/client-portal`, `packages/shared` (Drizzle schema, entity configs, validators, types, constants), `packages/ui` (shadcn/ui + custom components), `server/` (Express API). This allows code sharing while keeping deployment boundaries clean.

- **Decision 2: Supabase for PostgreSQL + Auth + Realtime + Storage** — Accelerates development with managed PostgreSQL 15, built-in auth with RBAC via custom claims, real-time subscriptions for live dashboards, and object storage for documents. Supabase Row-Level Security (RLS) provides an additional security layer beyond application-level RBAC.

- **Decision 3: EDEF (Entity Definition Framework) from PS-WMS** — The `createCrudRouter()` factory, `useOpsCrud()` hook, `OpsDataTable`, and `OpsMaintenanceForm` pattern is replicated to enable zero-code maintenance screens. Every reference data entity gets a full CRUD screen by registering in `entity_registry`. This dramatically reduces development time for the 27+ entities.

- **Decision 4: Hash-chained audit trail (enhancement over PS-WMS)** — PS-WMS uses standard append-only audit. TrustOMS enhances this with SHA-256 hash chaining (`audit_hash = SHA256(previous_hash + record_hash)`) per BRD requirement for immutable, tamper-evident audit with WORM storage and 10-year retention.

- **Decision 5: Event-driven architecture with CloudEvents 1.0** — All state transitions emit CloudEvents on Supabase Realtime channels (Phase 1) and Kafka topics (Phase 2+). This enables loose coupling, real-time UIs, and regulatory audit of every event.

- **Decision 6: Trust product type system** — A `trust_product_type` enum (IMA-Directed, IMA-Discretionary, PMT, UITF, Pre-Need, Employee-Benefit, Escrow, Agency, Safekeeping) drives conditional logic throughout — order validation rules, fee schedules, regulatory reporting, suitability requirements, and mandate structures all vary by product type.

- **Decision 7: Tiered authorization as first-class workflow** — The 2/4/6-eyes authorization model (PHP 0–50M / 50–500M / 500M+) is implemented as a configurable workflow engine, not hard-coded thresholds. This allows the bank to adjust tiers without code changes.

- **Decision 8: PII classification and data residency tags on every field** — Every database column carries `pii_classification` (None/PII/Sensitive-PII/Financial-PII) and `data_residency` (PH-only/Allowed-offshore) metadata in the entity config system, enforced at the application layer for display masking, export filtering, and cross-border data transfer controls.

## Conventions

All conventions follow the PS-WMS patterns established in the reference codebase:

- **File naming**: React components in `PascalCase.tsx`, hooks in `use-kebab-case.ts`, server routes in `kebab-case.ts`, entity configs in `kebab-case.ts` matching entity key
- **API patterns**: RESTful CRUD on `/api/v1/{resource}`, cursor-based pagination (`page`, `pageSize`, `search`, `sortBy`, `sortOrder`), `PaginatedResponse<T>` shape `{ data: T[], total, page, pageSize }`
- **Error responses**: `{ error: { code, message, field?, correlation_id } }` per BRD Section 7.3
- **Component patterns**: See `/Users/n15318/PS-WMS/apps/ops/src/components/crud/OpsDataTable.tsx` for table pattern, `OpsMaintenanceForm.tsx` for form pattern, `OpsDeleteConfirm.tsx` for delete pattern
- **Hook patterns**: See `/Users/n15318/PS-WMS/apps/ops/src/hooks/useOpsCrud.ts` for the standard CRUD hook
- **Server patterns**: See `/Users/n15318/PS-WMS/server/routes/ops/crud-factory.ts` for the CRUD factory, `/Users/n15318/PS-WMS/server/middleware/maker-checker.ts` for approval flow
- **Auth pattern**: JWT Bearer + session dual-mode per `/Users/n15318/PS-WMS/server/middleware/auth.ts`; role guard per `/Users/n15318/PS-WMS/server/middleware/ops-auth.ts`
- **Imports**: `@/` for app-local, `@shared/` for shared package, `@ui/` for UI package
- **Testing**: Vitest for unit/integration, Playwright for E2E; tests co-located with implementation

---

## Phase 0A: Monorepo Scaffold & Build Tooling
**Dependencies:** none

**Description:**
Initialize the TrustOMS monorepo with npm workspaces, TypeScript config, Vite builds for three frontend apps, Express server setup, and Supabase project connection. This is the foundation everything else builds on. Replicate the PS-WMS monorepo structure (see `/Users/n15318/PS-WMS/package.json` for workspace config and `/Users/n15318/PS-WMS/tsconfig.base.json` for TS config).

**Tasks:**
1. Create root `package.json` with npm workspaces: `["packages/*", "apps/*"]`, type `"module"`, scripts for `dev`, `dev:ops`, `dev:fo`, `dev:mo`, `dev:portal`, `build:all`, `db:push`, `db:generate`, `db:studio`.
2. Create `tsconfig.base.json` with target ES2022, module ESNext, moduleResolution bundler, strict mode, path aliases (`@shared/*`, `@ui/*`).
3. Scaffold `packages/shared/` — `package.json` (`@trustoms/shared`), `tsconfig.json`, `src/index.ts` barrel export, `src/schema.ts` (empty, populated in Phase 0B), `src/entity-configs/types.ts` (copy type system from `/Users/n15318/PS-WMS/packages/shared/src/entity-configs/types.ts`), `src/entity-configs/index.ts`, `src/validators/index.ts`, `src/constants/index.ts` (trust product types, order statuses, PII classifications, regulatory codes).
4. Scaffold `packages/ui/` — `package.json` (`@trustoms/ui`), `tsconfig.json`, `src/index.ts`, copy all shadcn/ui primitives from `/Users/n15318/PS-WMS/packages/ui/src/components/ui/`, copy providers (`auth-provider.tsx`, `theme-provider.tsx`, `accessibility-provider.tsx`), copy `src/lib/queryClient.ts`, `src/lib/api-url.ts`, `src/lib/utils.ts`. Adapt auth provider for Supabase Auth.
5. Scaffold `apps/back-office/` — Vite + React 18 + TypeScript app on port 5175. `package.json` (`@trustoms/back-office`), `vite.config.ts` with path aliases, `tailwind.config.ts`, `postcss.config.js`, `src/App.tsx` with providers (QueryClient, Tooltip, Accessibility, Theme, ErrorBoundary), `src/main.tsx`, `src/index.css` with Tailwind directives and shadcn CSS variables. Follow `/Users/n15318/PS-WMS/apps/ops/src/App.tsx` pattern.
6. Scaffold `apps/front-office/` — Same Vite setup on port 5173 for RM and Trader cockpits.
7. Scaffold `apps/mid-office/` — Same Vite setup on port 5174 for dealing desk and fund accounting.
8. Scaffold `apps/client-portal/` — Same Vite setup on port 5176 for client self-service.
9. Scaffold `server/` — Express.js entry point (`index.ts`), `db.ts` (Drizzle + Supabase PostgreSQL connection following `/Users/n15318/PS-WMS/server/db.ts` pattern), `routes.ts` (route registration), `middleware/` directory with `auth.ts`, `async-handler.ts`, `request-id.ts`, `validate.ts`, `query-timeout.ts`. Adapt auth middleware for Supabase JWT verification.
10. Create `.env.example` with all required environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, JWT_SECRET, REDIS_URL, etc.).
11. Create `docker-compose.yml` for local development (Redis for BullMQ, optional local PostgreSQL fallback).
12. Create `.gitignore`, `.prettierrc`, `.eslintrc.cjs` with shared config.

**Files to create/modify:**
- `package.json` — root workspace config
- `tsconfig.base.json` — shared TypeScript config
- `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/schema.ts`, `packages/shared/src/entity-configs/types.ts`, `packages/shared/src/entity-configs/index.ts`, `packages/shared/src/validators/index.ts`, `packages/shared/src/constants/index.ts`
- `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`, `packages/ui/src/components/ui/*.tsx` (all shadcn primitives), `packages/ui/src/providers/*.tsx`, `packages/ui/src/hooks/*.ts`, `packages/ui/src/lib/*.ts`
- `apps/back-office/package.json`, `apps/back-office/vite.config.ts`, `apps/back-office/tsconfig.json`, `apps/back-office/tailwind.config.ts`, `apps/back-office/postcss.config.js`, `apps/back-office/index.html`, `apps/back-office/src/App.tsx`, `apps/back-office/src/main.tsx`, `apps/back-office/src/index.css`
- `apps/front-office/` — same set of files
- `apps/mid-office/` — same set of files
- `apps/client-portal/` — same set of files
- `server/index.ts`, `server/db.ts`, `server/routes.ts`, `server/middleware/auth.ts`, `server/middleware/async-handler.ts`, `server/middleware/request-id.ts`, `server/middleware/validate.ts`, `server/middleware/query-timeout.ts`
- `.env.example`, `docker-compose.yml`, `.gitignore`, `.prettierrc`, `.eslintrc.cjs`

**Acceptance criteria:**
- `npm install` succeeds from root
- `npm run dev` starts Express server on port 5000 and connects to Supabase PostgreSQL
- `npm run dev:ops` starts back-office Vite dev server on port 5175
- `npm run dev:fo` starts front-office on port 5173
- `npm run dev:mo` starts mid-office on port 5174
- `npm run dev:portal` starts client-portal on port 5176
- All apps render a basic "TrustOMS" placeholder page
- TypeScript compilation passes with zero errors across all packages
- Path aliases (`@shared/*`, `@ui/*`) resolve correctly in all apps

---

## Phase 0B: Core Database Schema
**Dependencies:** Phase 0A

**Description:**
Define the complete PostgreSQL schema using Drizzle ORM for all 27+ core entities specified in BRD Section 4. Every entity carries the mandatory audit fields (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`, `status`, `is_deleted`, `tenant_id`, `correlation_id`, `audit_hash`) and PII classification. This phase creates the database tables — no API or UI yet.

**Tasks:**
1. Define enums in `packages/shared/src/schema.ts`: `trust_product_type` (IMA-Directed, IMA-Discretionary, PMT, UITF, Pre-Need, Employee-Benefit, Escrow, Agency, Safekeeping), `order_status` (Draft, Pending-Auth, Authorized, Rejected, Aggregated, Placed, Partially-Filled, Filled, Confirmed, Settled, Reversal-Pending, Reversed, Cancelled), `order_side` (BUY, SELL), `order_type` (MARKET, LIMIT, STOP), `pii_classification` (None, PII, Sensitive-PII, Financial-PII), `data_residency` (PH-only, Allowed-offshore), `approval_status` (pending, approved, rejected, cancelled), `audit_action` (create, update, delete, login, logout, access, export, authorize, reject, reverse), `risk_profile` (Conservative, Moderate, Balanced, Growth, Aggressive), `kyc_status` (Pending, Verified, Expired, Rejected), `settlement_status` (Pending, Matched, Failed, Settled, Reversed), `fee_type` (Trustee, Management, Custody, Performance, UITF-TER), `tax_type` (WHT, FATCA, CRS), `corporate_action_type` (Dividend-Cash, Dividend-Stock, Split, Reverse-Split, Rights, Merger, Tender, Bonus), `surveillance_pattern` (Layering, Spoofing, Wash-Trading, Front-Running), `notification_channel` (InApp, Email, SMS, Push, PagerDuty), `maker_checker_tier` (two-eyes, four-eyes, six-eyes).
2. Create **IAM tables**: `users` (id, username, password_hash, full_name, email, role, department, office, branch_id, is_active, mfa_enabled, last_login, + audit fields), `roles` (id, name, office, description, azure_ad_group), `permissions` (id, role_id, resource, action, conditions_jsonb), `user_roles` (user_id, role_id).
3. Create **Client & KYC tables** (BRD 4.1 + FR-ONB): `clients` (client_id text PK, legal_name [PII], type, tin [Sensitive-PII], birth_date [PII], address_jsonb [PII], contact_jsonb [PII], risk_profile, status, + audit fields), `client_profiles` (client_id FK, risk_tolerance, investment_horizon, knowledge_level, source_of_wealth [Sensitive-PII], income [Financial-PII], net_worth [Financial-PII]), `kyc_cases` (id, client_id, risk_rating, status, id_number [Sensitive-PII], id_type, expiry_date, refresh_cadence_years, next_review_date), `beneficial_owners` (id, client_id, ubo_name [PII], ubo_tin [Sensitive-PII], ownership_pct, verified), `client_fatca_crs` (client_id, us_person, reporting_jurisdictions, tin_foreign).
4. Create **Portfolio & Mandate tables**: `portfolios` (portfolio_id text PK, client_id FK, type trust_product_type, base_currency, aum, inception_date, status), `mandates` (id, portfolio_id FK, min_allocation_jsonb, max_allocation_jsonb, restricted_securities_jsonb, benchmark_id, max_single_issuer_pct, max_sector_pct, duration_band, credit_floor, currency_constraints_jsonb).
5. Create **Security & Counterparty tables**: `securities` (id, isin, cusip, sedol, bloomberg_ticker, local_code, name, asset_class, sector, exchange, currency, pricing_source_hierarchy_jsonb, is_active), `counterparties` (id, name, lei, bic, settlement_instructions_jsonb, type, is_active), `brokers` (id, counterparty_id FK, commission_schedule_jsonb, fix_session_config_jsonb).
6. Create **Order lifecycle tables** (BRD 4.1): `orders` (order_id text PK, order_no, portfolio_id FK, type, side, security_id FK, quantity, limit_price, stop_price, currency, value_date, reason_code, client_reference, status order_status, authorization_tier, suitability_check_result, created_by_role, + audit fields), `order_authorizations` (id, order_id FK, tier, approver_id FK, approver_role, decision, comment, decided_at).
7. Create **Trade & Execution tables**: `trades` (trade_id text PK, order_id FK, block_id, broker_id FK, execution_price, execution_qty, execution_time, slippage_bps, allocation_pct, fill_type), `blocks` (block_id text PK, security_id FK, side, total_qty, allocation_policy, status, trader_id FK).
8. Create **Confirmation & Settlement tables**: `confirmations` (id, trade_id FK, match_method, match_status, counterparty_ref, tolerance_check, exception_reason, confirmed_by, confirmed_at), `settlement_instructions` (id, trade_id FK, ssi_id, swift_message_type, routing_bic, value_date, status settlement_status, cash_amount, currency, settled_at, finacle_gl_ref, philpass_ref).
9. Create **Position & Cash tables**: `positions` (id, portfolio_id FK, security_id FK, quantity, cost_basis, market_value, unrealized_pnl, as_of_date), `cash_ledger` (id, portfolio_id FK, account_type, currency, balance, available_balance, as_of_date), `cash_transactions` (id, cash_ledger_id FK, type, amount, currency, counterparty, reference, value_date).
10. Create **Corporate Action tables** (BRD FR-CA): `corporate_actions` (id, security_id FK, type corporate_action_type, ex_date, record_date, payment_date, ratio, amount_per_share, election_deadline, source, status), `corporate_action_entitlements` (id, corporate_action_id FK, portfolio_id FK, entitled_qty, elected_option, tax_treatment, posted).
11. Create **Fee & Billing tables** (BRD FR-FEE): `fee_schedules` (id, portfolio_id, fee_type, calculation_method, rate_pct, tiered_rates_jsonb, effective_from, effective_to), `fee_invoices` (id, portfolio_id FK, fee_schedule_id FK, period_from, period_to, gross_amount, tax_amount, net_amount, status, gl_ref), `fee_accruals` (id, fee_schedule_id FK, accrual_date, amount).
12. Create **NAV & Fund Accounting tables** (BRD FR-NAV): `nav_computations` (id, portfolio_id FK, computation_date, nav_per_unit, total_nav, units_outstanding, pricing_source, fair_value_level, status, published_at), `unit_transactions` (id, portfolio_id FK, type, units, nav_per_unit, amount, investor_id, transaction_date, cut_off_applied).
13. Create **Tax tables** (BRD FR-TAX): `tax_events` (id, trade_id FK, portfolio_id FK, tax_type, gross_amount, tax_rate, tax_amount, certificate_ref, tin [Sensitive-PII], bir_form_type, filing_status).
14. Create **Reversal & Upload tables**: `reversal_cases` (id, original_transaction_id, type, reason, evidence_url, requested_by, approved_by, status, reversing_entries_jsonb), `upload_batches` (id, filename, row_count, accepted_rows, rejected_rows, error_report_url, status, uploaded_by, authorized_by, rollback_status).
15. Create **Transfer / Contribution / Withdrawal tables**: `transfers` (id, from_portfolio_id FK, to_portfolio_id FK, security_id, quantity, type, status, + audit fields), `contributions` (id, portfolio_id FK, amount, currency, source_account, type, status), `withdrawals` (id, portfolio_id FK, amount, currency, destination_account, type, tax_withholding, status).
16. Create **Compliance & Risk tables**: `compliance_rules` (id, rule_type, entity_type, condition_jsonb, action, severity, is_active), `compliance_breaches` (id, rule_id FK, portfolio_id, order_id, breach_description, detected_at, resolved_at, resolution), `trade_surveillance_alerts` (id, pattern surveillance_pattern, score, order_ids_jsonb, disposition, analyst_id, disposition_date), `ore_events` (id, basel_category, description, gross_loss, net_loss, recovery, root_cause, corrective_action, reported_to_bsp), `kill_switch_events` (id, scope_jsonb, reason, invoked_by_jsonb, active_since, resumed_at, resume_approved_by_jsonb).
17. Create **Whistleblower tables**: `whistleblower_cases` (id, intake_channel, anonymous, description, cco_reviewer_id, dpo_notified, status, resolution, + audit fields).
18. Create **Notification & Consent tables**: `notification_log` (id, event_type, channel, recipient_id, recipient_type, content_hash, sent_at, delivered_at, status), `consent_log` (id, client_id FK, processing_activity, lawful_basis, purpose, retention_period, consented_at, withdrawn_at).
19. Create **Audit tables** (enhanced with hash chain): `audit_records` (id bigserial, entity_type, entity_id, action audit_action, actor_id, actor_role, changes_jsonb, previous_hash text, record_hash text, metadata_jsonb, ip_address, correlation_id, created_at). Index on `(entity_type, entity_id)`, `(actor_id)`, `(created_at)`.
20. Create **EDEF tables**: `entity_registry` (entity_key text PK, display_name, display_name_plural, schema_table_name, category, searchable_columns_jsonb, default_sort_column, max_page_size, is_active), `entity_field_config` (id, entity_key FK, field_name, label, input_type, group_name, group_order, display_order, visible_in_table, visible_in_form, required, editable, pii_sensitive, validation_regex, unique_check, select_options_source, help_text), `entity_cross_validations` (id, entity_key FK, rule_name, condition_jsonb, error_message, is_active), `approval_workflow_definitions` (id, entity_type, action, required_approvers, sla_hours, auto_approve_roles_jsonb, is_active), `approval_requests` (id, entity_type, entity_id, action, status approval_status, payload_jsonb, previous_values_jsonb, submitted_by FK, submitted_at, reviewed_by FK, reviewed_at, review_comment, sla_deadline, is_sla_breached).
21. Create Drizzle relations for all FK relationships.
22. Run `npm run db:push` to apply schema to Supabase PostgreSQL.

**Files to create/modify:**
- `packages/shared/src/schema.ts` — complete Drizzle schema (all tables above)
- `packages/shared/src/schema/enums.ts` — all enum definitions
- `packages/shared/src/schema/relations.ts` — Drizzle relations
- `drizzle.config.ts` — Drizzle Kit configuration

**Acceptance criteria:**
- `npm run db:push` succeeds — all tables created in Supabase PostgreSQL
- `npm run db:studio` opens Drizzle Studio showing all 40+ tables
- All FK constraints are valid
- All enum types are created
- Every table has the 10 mandatory audit fields
- PII classification comments/tags are present on sensitive columns

---

## Phase 0C: CRUD Framework & Audit Trail
**Dependencies:** Phase 0A, Phase 0B

**Description:**
Implement the core infrastructure that every feature depends on: the CRUD factory (server-side), CRUD hooks and components (client-side), hash-chained audit trail, and maker-checker workflow. This replicates and enhances the PS-WMS EDEF pattern. See `/Users/n15318/PS-WMS/server/routes/ops/crud-factory.ts`, `/Users/n15318/PS-WMS/apps/ops/src/hooks/useOpsCrud.ts`, `/Users/n15318/PS-WMS/apps/ops/src/components/crud/`.

**Tasks:**
1. **Server CRUD factory** — Create `server/routes/crud-factory.ts` replicating `/Users/n15318/PS-WMS/server/routes/ops/crud-factory.ts` with these enhancements: (a) `Idempotency-Key` header support on POST/PUT per BRD 7.2, (b) API versioning prefix `/api/v1/`, (c) `correlation_id` on all responses, (d) rate limiting per BRD (600 req/min user, 10000 req/min service). Include: paginated list with ilike search, single get, create with Zod validation, update with optimistic locking (`_expectedUpdatedAt`), soft-delete with FK dependency guard, bulk import, CSV export (10k limit, formula injection protection), duplicate check, cross-field validation from `entity_cross_validations` table.
2. **Nested CRUD factory** — Create `server/routes/nested-crud-factory.ts` for parent-scoped sub-resources (e.g., client addresses, portfolio mandates). Follow `/Users/n15318/PS-WMS/server/routes/ops/nested-crud-factory.ts`.
3. **Hash-chained audit logger** — Create `server/services/audit-logger.ts`. Enhancement over PS-WMS: implement SHA-256 hash chaining where `record_hash = SHA256(JSON.stringify({entity_type, entity_id, action, actor_id, changes, timestamp}) + previous_hash)`. Fetch the last `audit_records` entry for the entity to get `previous_hash`. Include PII redaction (pattern-based for TIN, phone, email + entity-specific from config), XSS sanitization. Export `logAuditEvent()`, `logAuditBatch()`, `computeDiff()`. Fire-and-forget pattern (never throws, never delays response).
4. **Maker-checker middleware** — Create `server/middleware/maker-checker.ts` replicating `/Users/n15318/PS-WMS/server/middleware/maker-checker.ts` with enhancements: (a) tiered approval support (2-eyes/4-eyes/6-eyes based on transaction amount), (b) amount-threshold extraction from request body, (c) committee approval tracking for 6-eyes, (d) SLA deadline calculation. Returns 202 for pending, 200/201 for auto-approved, 403 for no workflow, 409 for duplicate.
5. **Maker-checker service** — Create `server/services/maker-checker.ts` with `submitForApproval()`, `reviewRequest()`, `applyApprovedChange()`, `batchApprove()`, `batchReject()`, `cancelRequest()`. Self-approval prevention. Audit logging on every action.
6. **Role-based auth middleware** — Create `server/middleware/role-auth.ts` with guards for each office: `requireBackOfficeRole()` (BO-M, BO-C, BO-Head, Admin), `requireFrontOfficeRole()` (RM, SRM, Trader, Senior-Trader), `requireMidOfficeRole()` (MO-M, MO-C, Fund-Accountant), `requireComplianceRole()`, `requireRiskRole()`, `requireExecutiveRole()`, `requireAnyRole(...roles)`. Plus `logDataAccess(resourceType)` for PII-sensitive routes.
7. **Client-side CRUD hook** — Create `apps/back-office/src/hooks/useOpsCrud.ts` replicating `/Users/n15318/PS-WMS/apps/ops/src/hooks/useOpsCrud.ts`. TanStack Query v5 with paginated list query, create/update/delete mutations, auto-invalidation, toast feedback, 202 maker-checker detection.
8. **Client-side entity config hook** — Create `apps/back-office/src/hooks/use-entity-config.ts` replicating `/Users/n15318/PS-WMS/apps/ops/src/hooks/use-entity-config.ts`. Fetches entity registry config and merges with code defaults.
9. **OpsDataTable component** — Create `apps/back-office/src/components/crud/OpsDataTable.tsx` replicating `/Users/n15318/PS-WMS/apps/ops/src/components/crud/OpsDataTable.tsx` (638 lines). Paginated sortable table with search, CSV export, row actions, loading/error/empty states. Auto-column generation from `entityFieldConfig`.
10. **OpsMaintenanceForm component** — Create `apps/back-office/src/components/crud/OpsMaintenanceForm.tsx` replicating `/Users/n15318/PS-WMS/apps/ops/src/components/crud/OpsMaintenanceForm.tsx` (1037 lines). Right-side Sheet form with Zod/entity-config field generation, tabbed layout, cross-field validation, duplicate check on blur, draft auto-save to localStorage, PII-aware error messages.
11. **OpsDeleteConfirm component** — Create `apps/back-office/src/components/crud/OpsDeleteConfirm.tsx`.
12. **OpsCSVImport component** — Create `apps/back-office/src/components/crud/OpsCSVImport.tsx`.
13. **EntityAuditHistory component** — Create `apps/back-office/src/components/crud/EntityAuditHistory.tsx` with hash-chain verification display (shows chain integrity status).
14. **AuditDiffView component** — Create `apps/back-office/src/components/crud/AuditDiffView.tsx` for before/after change visualization.
15. **CRUD barrel export** — Create `apps/back-office/src/components/crud/index.ts`.

**Files to create/modify:**
- `server/routes/crud-factory.ts` — generic CRUD router factory
- `server/routes/nested-crud-factory.ts` — nested CRUD factory
- `server/services/audit-logger.ts` — hash-chained audit service
- `server/middleware/maker-checker.ts` — approval interceptor
- `server/services/maker-checker.ts` — approval business logic
- `server/middleware/role-auth.ts` — role-based access guards
- `apps/back-office/src/hooks/useOpsCrud.ts` — CRUD data hook
- `apps/back-office/src/hooks/use-entity-config.ts` — entity config hook
- `apps/back-office/src/components/crud/OpsDataTable.tsx`
- `apps/back-office/src/components/crud/OpsMaintenanceForm.tsx`
- `apps/back-office/src/components/crud/OpsDeleteConfirm.tsx`
- `apps/back-office/src/components/crud/OpsCSVImport.tsx`
- `apps/back-office/src/components/crud/EntityAuditHistory.tsx`
- `apps/back-office/src/components/crud/AuditDiffView.tsx`
- `apps/back-office/src/components/crud/index.ts`

**Acceptance criteria:**
- `createCrudRouter(anyTable, options)` generates all 8 endpoints (list, get, create, update, delete, bulk, export, check-duplicate)
- Maker-checker returns 202 for pending approvals with correct tier detection
- Self-approval prevention works (same user cannot approve own submission)
- Hash-chained audit: each record's `record_hash` includes `previous_hash`, verifiable chain
- `OpsDataTable` renders paginated data with search, sort, export
- `OpsMaintenanceForm` renders config-driven forms with validation
- Draft auto-save persists and resumes correctly
- PII fields are masked in display when `piiSensitive: true`
- Optimistic locking returns 409 on version conflict

---

## Phase 0D: Back-Office Layout & Navigation
**Dependencies:** Phase 0A

**Description:**
Create the back-office application shell with collapsible sidebar navigation, role-aware menu sections, and the generic entity page. This establishes the UI framework all back-office features plug into. Follow `/Users/n15318/PS-WMS/apps/ops/src/components/layout/OpsLayout.tsx` and `/Users/n15318/PS-WMS/apps/ops/src/config/navigation.ts`.

**Tasks:**
1. **Navigation config** — Create `apps/back-office/src/config/navigation.ts` defining all sidebar sections. Initial sections: Dashboard, Master Data (Portfolios, Securities, Clients, Counterparties, Brokers, Users), Reference Data (Countries, Currencies, Asset Classes, Branches, Trust Product Types, Fee Types, Tax Codes), Operations (EOD Processing, Transaction Monitor, NAV Updates, Corporate Actions, Position Recon, Transaction Recon, Cash & FX, Integration Hub), Compliance (Pending Approvals, Workflow Definitions, Audit Trail, KYC Dashboard, Compliance Rules, Surveillance), Analytics (Reports, Report Builder, Data Quality), Tools (Bulk Upload, Test Data, Automation). Follow the type system from `/Users/n15318/PS-WMS/apps/ops/src/config/navigation.ts`.
2. **Layout component** — Create `apps/back-office/src/components/layout/BackOfficeLayout.tsx` with collapsible sidebar (64px icons-only / 256px full), mobile Sheet drawer, user info footer, skip-link for accessibility. Follow `/Users/n15318/PS-WMS/apps/ops/src/components/layout/OpsLayout.tsx`.
3. **Router setup** — Create `apps/back-office/src/routes/index.tsx` with `createBrowserRouter`, lazy-loaded routes, `ProtectedRoute` wrapper. All routes wrapped in `BackOfficeLayout`.
4. **Entity navigation hook** — Create `apps/back-office/src/hooks/use-entity-navigation.ts` to fetch dynamic entity sections from registry and merge with static nav.
5. **Generic entity page** — Create `apps/back-office/src/pages/entity-generic.tsx` replicating `/Users/n15318/PS-WMS/apps/ops/src/pages/entity-generic.tsx`. Single page that renders full CRUD for any registered entity using the EDEF framework.
6. **Login page** — Create `apps/back-office/src/pages/login.tsx` with Supabase Auth sign-in (email/password + MFA TOTP).
7. **Dashboard placeholder** — Create `apps/back-office/src/pages/dashboard.tsx` with placeholder cards for operations metrics.
8. **Entity registry API** — Create `server/routes/entity-registry.ts` with CRUD for entity_registry, entity_field_config, entity_cross_validations tables. Follow `/Users/n15318/PS-WMS/server/routes/ops/entity-registry.ts`.

**Files to create/modify:**
- `apps/back-office/src/config/navigation.ts`
- `apps/back-office/src/components/layout/BackOfficeLayout.tsx`
- `apps/back-office/src/routes/index.tsx`
- `apps/back-office/src/hooks/use-entity-navigation.ts`
- `apps/back-office/src/pages/entity-generic.tsx`
- `apps/back-office/src/pages/login.tsx`
- `apps/back-office/src/pages/dashboard.tsx`
- `server/routes/entity-registry.ts`

**Acceptance criteria:**
- Back-office app loads with collapsible sidebar showing all navigation sections
- Sidebar collapses to icon-only mode on toggle
- Mobile view shows hamburger menu with Sheet drawer
- Login authenticates via Supabase Auth and redirects to dashboard
- Generic entity page renders CRUD for any registered entity key
- Route-based lazy loading works (no full-bundle initial load)
- Skip-link and keyboard navigation work (WCAG 2.1 AA)

---

## Phase 0E: Reference Data & Maintenance Screens
**Dependencies:** Phase 0C, Phase 0D

**Description:**
Register all reference data entities in the entity registry and create their entity configs. This gives the back-office all basic maintenance screens (CRUD) for: countries, currencies, asset classes, branches, trust product types, fee types, tax codes, counterparties, brokers. Each entity gets a maintenance page via the EDEF framework — no custom page code needed, just entity config + registry entry.

**Tasks:**
1. **Entity configs** — Create entity config files in `packages/shared/src/entity-configs/` for each reference entity. Follow the pattern from `/Users/n15318/PS-WMS/packages/shared/src/entity-configs/country.ts` etc. Create: `country.ts`, `currency.ts`, `asset-class.ts`, `branch.ts`, `trust-product-type.ts`, `fee-type.ts`, `tax-code.ts`, `counterparty.ts`, `broker.ts`, `security.ts` (security master), `portfolio.ts`, `client.ts` (comprehensive with 8+ field groups matching BRD Client entity).
2. **Seed entity registry** — Create a seed script `server/scripts/seed-entity-registry.ts` that inserts all entity configs into `entity_registry` and `entity_field_config` tables. Include cross-validations (e.g., `effective_to > effective_from` for rate tables).
3. **Seed reference data** — Create `server/scripts/seed-reference-data.ts` with: Philippine provinces/cities for countries, PHP/USD/EUR/JPY/SGD/HKD for currencies, Equity/Fixed-Income/Money-Market/Alternatives/Real-Estate for asset classes, sample branches (Manila HQ, Makati, Cebu, Davao), all trust product types.
4. **Register CRUD routes** — In `server/routes/back-office/index.ts`, register CRUD routes for each entity table using `createCrudRouter()` with appropriate `searchableColumns`, `defaultSort`, and `makerChecker` options. Follow the pattern from `/Users/n15318/PS-WMS/server/routes/ops/index.ts`.
5. **Register nested CRUD routes** — For sub-entities: `client_profiles` under clients, `client_fatca_crs` under clients, `beneficial_owners` under clients, `kyc_cases` under clients, `mandates` under portfolios, `fee_schedules` under portfolios.
6. **Seed approval workflows** — Insert `approval_workflow_definitions` for all entity types (initially `is_active: false` for auto-approve during development).
7. **Custom entity pages where needed** — Create `apps/back-office/src/pages/clients.tsx` (enhanced client master with detail view showing sub-entities in tabs: Profile, KYC, Beneficiaries, FATCA/CRS, Portfolios, Audit History). Create `apps/back-office/src/pages/client-detail.tsx`. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/clients.tsx`.
8. **Security master page** — Create `apps/back-office/src/pages/security-master.tsx` with ISIN/CUSIP/SEDOL lookups, pricing source hierarchy, asset class drill-down.
9. **Portfolio master page** — Create `apps/back-office/src/pages/portfolios.tsx` with mandate tab, position summary, AUM display.

**Files to create/modify:**
- `packages/shared/src/entity-configs/country.ts`, `currency.ts`, `asset-class.ts`, `branch.ts`, `trust-product-type.ts`, `fee-type.ts`, `tax-code.ts`, `counterparty.ts`, `broker.ts`, `security.ts`, `portfolio.ts`, `client.ts`
- `packages/shared/src/entity-configs/index.ts` — updated with all new configs
- `server/scripts/seed-entity-registry.ts`
- `server/scripts/seed-reference-data.ts`
- `server/routes/back-office/index.ts` — all CRUD route registrations
- `apps/back-office/src/pages/clients.tsx`
- `apps/back-office/src/pages/client-detail.tsx`
- `apps/back-office/src/pages/security-master.tsx`
- `apps/back-office/src/pages/portfolios.tsx`

**Acceptance criteria:**
- All reference data entities have working CRUD screens in the back-office
- Entity registry API returns all registered entities
- Client master shows tabbed detail view with sub-entities
- Security master supports ISIN/CUSIP search
- Portfolio master shows mandate summary and positions
- Maker-checker workflow is wired (auto-approve in dev mode)
- Audit trail captures all CRUD operations with hash chaining
- CSV import works for bulk data loading
- Search, sort, pagination work on all entity tables
- Cross-field validations fire correctly (e.g., date range checks)

---

## Phase 0F: Approval Queue & Audit Dashboard
**Dependencies:** Phase 0C, Phase 0D

**Description:**
Build the approval queue (pending approvals, batch approve/reject, diff view) and audit trail dashboard for the back-office. These are cross-cutting compliance features used by all offices. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/approvals.tsx` and `/Users/n15318/PS-WMS/apps/ops/src/pages/audit-dashboard.tsx`.

**Tasks:**
1. **Approval routes** — Create `server/routes/back-office/approvals.ts` with: `GET /api/v1/approvals` (paginated, filterable by entity type, status, date range), `GET /api/v1/approvals/summary` (pending/approved/rejected/breached counts), `POST /api/v1/approvals/:id/approve`, `POST /api/v1/approvals/:id/reject`, `POST /api/v1/approvals/:id/cancel`, `POST /api/v1/approvals/batch-approve`, `POST /api/v1/approvals/batch-reject`.
2. **Approval queue page** — Create `apps/back-office/src/pages/approvals.tsx` with: summary cards (Pending, Approved Today, Rejected Today, SLA Breached), tabs (Pending Review, My Submissions, History), batch approve/reject with checkbox selection, SLA countdown badge (green/yellow/red), detail Sheet with before/after diff (`AuditDiffView`), review comment textarea. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/approvals.tsx`.
3. **Audit routes** — Create `server/routes/back-office/audit.ts` with: `GET /api/v1/audit` (paginated, filterable by entity type, action, actor, date range, search), `GET /api/v1/audit/summary` (events today, by action type, most active user), `GET /api/v1/audit/verify-chain/:entityType/:entityId` (hash chain integrity check).
4. **Audit dashboard page** — Create `apps/back-office/src/pages/audit-dashboard.tsx` with: summary cards, filterable table with expandable rows showing `AuditDiffView`, user activity summary, chain integrity indicator. Enhancement: "Verify Chain" button that checks hash integrity for a specific entity's audit trail.
5. **Workflow definitions page** — Create `apps/back-office/src/pages/workflow-definitions.tsx` for managing approval workflow rules (entity type, action, required approvers, SLA, auto-approve roles, tiered thresholds). Admin-only.

**Files to create/modify:**
- `server/routes/back-office/approvals.ts`
- `server/routes/back-office/audit.ts`
- `apps/back-office/src/pages/approvals.tsx`
- `apps/back-office/src/pages/audit-dashboard.tsx`
- `apps/back-office/src/pages/workflow-definitions.tsx`

**Acceptance criteria:**
- Approval queue shows all pending requests with correct SLA countdown
- Batch approve/reject works for multiple selections
- Self-approval is prevented (403 error with clear message)
- Before/after diff view shows changes clearly
- Audit dashboard filters work (entity type, action, date range, search)
- Hash chain verification detects tampered records
- SLA breach detection marks overdue approvals
- Workflow definitions CRUD works with proper validation

---

## Phase 0G: Schema Expansion for BDO RFI Gaps
**Dependencies:** Phase 0B

**Description:**
Add new database tables, fields, and enums required by the BDO RFI gap items. Phase 0B created the original 55 tables; this phase extends the schema with 9 new tables and new columns/enums needed by Gaps #1–#9. This must run before any gap-enhanced phase executes.

**Tasks:**
1. **New enums** — Add to `packages/shared/src/schema.ts`: `time_in_force_type` (DAY, GTC, IOC, FOK), `payment_mode_type` (DEBIT_CA_SA, CASH, CHEQUE, WIRE_TRANSFER), `disposal_method` (FIFO, LIFO, WEIGHTED_AVG, SPECIFIC_LOT, HIGHEST_COST), `validation_severity` (HARD, SOFT), `scheduled_plan_type` (EIP, ERP), `scheduled_plan_status` (ACTIVE, PAUSED, CANCELLED, COMPLETED), `pera_transaction_type` (CONTRIBUTION, QUALIFIED_WITHDRAWAL, UNQUALIFIED_WITHDRAWAL, TRANSFER_PRODUCT, TRANSFER_ADMIN), `standing_instruction_type` (AUTO_ROLL, AUTO_CREDIT, AUTO_WITHDRAWAL), `rebalancing_status` (DRAFT, APPROVED, EXECUTED, CANCELLED).
2. **Extend `orders` table** — Add columns: `time_in_force time_in_force_type DEFAULT 'DAY'`, `payment_mode payment_mode_type`, `trader_id integer REFERENCES users(id)`, `future_trade_date date`, `disposal_method disposal_method`, `parent_order_id text REFERENCES orders(order_id)` (for switch legs and scheduled children), `scheduled_plan_id integer` (FK to scheduled_plans), `transaction_ref_no text UNIQUE` (TRN-YYYYMMDD-HHMMSS-NNNNN).
3. **New table: `model_portfolios`** — (id, name, description, allocations_jsonb, benchmark_id, created_by, is_active, + audit fields). Allocations is `[{asset_class, target_pct, min_pct, max_pct}]`.
4. **New table: `rebalancing_runs`** — (id, portfolio_ids_jsonb, model_portfolio_id FK, run_type, status rebalancing_status, input_params_jsonb, generated_blotter_jsonb, executed_at, executed_by, + audit fields).
5. **New table: `scheduled_plans`** — (id, client_id FK, portfolio_id FK, plan_type scheduled_plan_type, product_id, amount, currency, frequency, ca_sa_account, next_execution_date, status scheduled_plan_status, + audit fields).
6. **New table: `pera_accounts`** — (id, contributor_id FK references clients, administrator, product_id, balance, contribution_ytd, max_contribution_annual, tin text, bsp_pera_id text, status, + audit fields).
7. **New table: `pera_transactions`** — (id, pera_account_id FK, type pera_transaction_type, amount, penalty_amount, tcc_ref, target_product_id, target_admin, status, + audit fields).
8. **New table: `compliance_limits`** — (id, limit_type text, dimension text, dimension_id text, limit_amount numeric, current_exposure numeric, warning_threshold_pct integer, is_active boolean, effective_from date, effective_to date, + audit fields). Limit types: trader, counterparty, broker, issuer, sector, sbl, group, outlet.
9. **New table: `validation_overrides`** — (id, order_id FK, validation_rule text, severity validation_severity, breach_description text, override_justification text, overridden_by integer FK references users, approved_by integer FK references users, overridden_at timestamp, + audit fields).
10. **New table: `held_away_assets`** — (id, portfolio_id FK, asset_class, description, custodian, location, market_value numeric, currency, as_of_date date, + audit fields).
11. **New table: `standing_instructions`** — (id, account_id text, portfolio_id FK, instruction_type standing_instruction_type, params_jsonb, is_active boolean, next_execution_date date, + audit fields).
12. **Extend `securities` table** — Add: `is_derivative boolean DEFAULT false`, `derivative_type text`, `underlying_security_id integer`, `embedded_derivative boolean DEFAULT false`, `consent_fee_pct numeric`.
13. **Extend `settlement_instructions` table** — Add: `is_book_only boolean DEFAULT false`, `official_receipt_no text`, `custodian_group text`, `settlement_account_level text` (account/portfolio).
14. **New entity configs** — Create entity config files for: `model-portfolio.ts`, `compliance-limit.ts`, `scheduled-plan.ts`, `pera-account.ts`, `held-away-asset.ts`, `standing-instruction.ts` in `packages/shared/src/entity-configs/`. Register in `entityFieldDefaultsMap`.
15. **Seed entity registry** — Update `server/scripts/seed-entity-registry.ts` to include the new entities.
16. **Register CRUD routes** — Add CRUD routes for new entities in `server/routes/back-office/index.ts`.

**Files to create/modify:**
- `packages/shared/src/schema.ts` — add new enums, tables, and column extensions
- `packages/shared/src/entity-configs/model-portfolio.ts`, `compliance-limit.ts`, `scheduled-plan.ts`, `pera-account.ts`, `held-away-asset.ts`, `standing-instruction.ts`
- `packages/shared/src/entity-configs/index.ts` — register new configs
- `server/scripts/seed-entity-registry.ts` — add new entities
- `server/routes/back-office/index.ts` — add new CRUD routes

**Acceptance criteria:**
- All 9 new tables created in PostgreSQL
- New columns added to `orders`, `securities`, `settlement_instructions`
- All new enums defined and usable
- Entity configs registered — new entities visible in back-office CRUD screens
- TypeScript compilation passes with zero errors
- Existing 55 tables and data are unaffected

---

## Phase 1A: Client Onboarding & KYC Module
**Dependencies:** Phase 0E

**Description:**
Implement the full client onboarding lifecycle (BRD FR-ONB-001 through FR-ONB-007): identity capture with e-KYC, risk-rating scoring, UBO chain capture, FATCA/CRS self-certification, sanctions & PEP screening, suitability profile, and periodic KYC refresh. This is a prerequisite for order capture — every order requires a client with valid KYC and suitability profile.

**Tasks:**
1. **KYC service** — Create `server/services/kyc-service.ts` with: `initiateKyc(clientId)`, `updateKycStatus(caseId, status)`, `calculateRiskRating(clientId)` (auto-escalation rule: high-risk if PEP, sanctions hit, or cash-intensive business), `scheduleKycRefresh(clientId, riskBand)` (1yr for high, 2yr for medium, 3yr for low), `getExpiringKyc(daysAhead)`, `bulkRenewal(clientIds)`.
2. **Suitability service** — Create `server/services/suitability-service.ts` with: `captureSuitabilityProfile(clientId, answers)`, `scoreSuitability(profile)` → risk_profile enum, `checkOrderSuitability(orderId)` → PASSED/FAILED/OVERRIDE-REQUIRED with reasons, `getProfileVersion(clientId)` (versioned history).
3. **Sanctions screening stub** — Create `server/services/sanctions-service.ts` with: `screenClient(clientId)` → {hit: boolean, matches: []}, `screenCounterparty(counterpartyId)`, `rescreenAll()`. Initially returns mock results; Phase 2 integrates with World-Check/Dow Jones.
4. **KYC routes** — Create `server/routes/back-office/kyc.ts` with: `GET /api/v1/kyc/summary`, `GET /api/v1/kyc/expiring?days=30`, `POST /api/v1/kyc/:clientId/verify`, `POST /api/v1/kyc/:clientId/reject`, `POST /api/v1/kyc/:clientId/send-reminder`, `POST /api/v1/kyc/bulk-renewal`, `GET /api/v1/kyc/:clientId/history`.
5. **KYC dashboard page** — Create `apps/back-office/src/pages/kyc-dashboard.tsx` with: summary cards (total clients, verified %, pending, expiring in 30 days, expired), KYC pipeline visualization, document expiry tracking, completion score per client, traffic light indicators, expiring KYC table with search/sort/remind, pending verification queue. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/kyc-dashboard.tsx`.
6. **Client onboarding wizard** — Create `apps/back-office/src/pages/client-onboarding.tsx` as a multi-step form: Step 1 (Identity: name, DOB, IDs, e-KYC), Step 2 (Risk Assessment: questionnaire-based scoring), Step 3 (UBO: chain capture up to 25%), Step 4 (FATCA/CRS: self-certification, flag propagation), Step 5 (Suitability: investment horizon, knowledge, risk tolerance, source of wealth), Step 6 (Sanctions Screening: auto-run on submit), Step 7 (Review & Submit).
7. **Suitability routes** — Create `server/routes/suitability.ts` with: `POST /api/v1/suitability/:clientId/capture`, `GET /api/v1/suitability/:clientId/current`, `GET /api/v1/suitability/:clientId/history`, `POST /api/v1/suitability/check-order/:orderId`.

**Files to create/modify:**
- `server/services/kyc-service.ts`
- `server/services/suitability-service.ts`
- `server/services/sanctions-service.ts`
- `server/routes/back-office/kyc.ts`
- `server/routes/suitability.ts`
- `apps/back-office/src/pages/kyc-dashboard.tsx`
- `apps/back-office/src/pages/client-onboarding.tsx`

**Acceptance criteria:**
- Client onboarding wizard captures all required fields across 7 steps
- Risk rating auto-calculates (low/medium/high) with escalation rule
- UBO chain capture works to 25% threshold with visual chain display
- FATCA/CRS flags propagate to client record
- Sanctions screening runs at onboarding (mock results for now)
- KYC refresh schedule auto-sets based on risk band (1/2/3 years)
- KYC dashboard shows expiring/expired clients with actionable buttons
- Suitability profile is versioned — history is preserved

---

## Phase 1B: Order Capture & Authorization
**Dependencies:** Phase 0E, Phase 1A

**Description:**
Implement the front-office order capture flow (BRD FR-ORD-001 through FR-ORD-032) and tiered authorization (FR-AUT-001 through FR-AUT-006). This is the core front-office MVP: RM creates orders, SRM authorizes them with 2/4/6-eyes based on amount thresholds. Real-time suitability check runs on capture. This phase also scaffolds the front-office app layout. **Expanded per BDO RFI Gap #1 (Order Types/TIF) and Gap #2 (Order Maintenance)** to include: time-in-force, future-dated orders, switch-in/out, scheduled/recurring, subsequent-allocation, inter-portfolio blocks, auto-compute, disposal methods, payment-mode, inline FX, trader-ID tagging, order edit post-submission, revert/un-cancel, back-dating override, partial liquidation by proceeds, and unmatched-inventory view.

**Tasks:**
1. **Front-office layout** — Create `apps/front-office/src/components/layout/FrontOfficeLayout.tsx` with role-aware navigation: RM sees order capture + client book; SRM sees approval queue; Trader sees working orders. Collapsible sidebar, mobile responsive.
2. **Front-office navigation** — Create `apps/front-office/src/config/navigation.ts` with sections: Dashboard, Order Capture, My Orders, Approval Queue (SRM), Client Book, Suitability, Mandate Monitor.
3. **Front-office router** — Create `apps/front-office/src/routes/index.tsx` with lazy routes.
4. **Order service** — Create `server/services/order-service.ts` with: `createOrder(orderData, userId)` (validates: client exists, KYC valid, suitability check, mandate compliance, fund reservation), `submitForAuthorization(orderId)`, `getOrdersByPortfolio(portfolioId)`, `getOrdersByStatus(status)`, `getOrderTimeline(orderId)` (full state transition history).
5. **Order authorization service** — Create `server/services/authorization-service.ts` implementing tiered approval: `determineAuthTier(orderAmount)` → 2-eyes (≤ PHP 50M), 4-eyes (50–500M), 6-eyes (>500M). `authorizeOrder(orderId, approverId, decision, comment)`, `getRequiredApprovers(tier)`, `checkAuthorizationComplete(orderId)`.
6. **Order routes** — Create `server/routes/orders.ts` with: `POST /api/v1/orders` (create, returns order_id + status + authorization_tier + suitability_check per BRD 7.4), `GET /api/v1/orders` (paginated, filterable by status/portfolio/date/side), `GET /api/v1/orders/:id`, `PUT /api/v1/orders/:id` (update draft only), `POST /api/v1/orders/:id/submit` (transition Draft → Pending-Auth), `POST /api/v1/orders/:id/authorize` (SRM/Risk/Compliance), `POST /api/v1/orders/:id/reject`, `DELETE /api/v1/orders/:id` (cancel draft only), `GET /api/v1/orders/:id/timeline`.
7. **Order capture page** — Create `apps/front-office/src/pages/order-capture.tsx`: the 56-field order ticket. Sections: Portfolio selection (with mandate summary), Security selection (with real-time price), Order details (side, type, quantity, limit price, stop price, currency, value date, good-till, reason code, client reference, remarks), Suitability card (real-time check result displayed as PASSED/FAILED/OVERRIDE with reasons), Mandate compliance card (allocation check, concentration check, restricted list check). Use `react-hook-form` with Zod validation. Intraday price refresh via periodic refetch.
8. **Order list page** — Create `apps/front-office/src/pages/orders.tsx` with filterable table showing all orders by status, portfolio, date range. Status badges color-coded.
9. **SRM approval queue** — Create `apps/front-office/src/pages/srm-approval-queue.tsx` with: tiered threshold display, side-by-side order comparison, one-click approve/refer, mandate compliance summary per order, suitability result display. Tabs by tier (2-eyes, 4-eyes, 6-eyes requiring committee).
10. **Order detail page** — Create `apps/front-office/src/pages/order-detail.tsx` with full order timeline (state transitions with actors and timestamps), authorization chain display, suitability report.
11. **Notification events** — Emit events on order state transitions: `order.submitted` (notify SRM), `order.authorized` (notify RM + Trader), `order.rejected` (notify RM via in-app + email + SMS per BRD 10.1). Create `server/services/notification-service.ts` with channel dispatch (in-app initially; email/SMS in later phase).
12. **[Gap #1] Order type & TIF extensions** — Extend `order-service.ts` to support: `time_in_force` field (DAY, GTC, IOC, FOK), `order_type` (MARKET, LIMIT, STOP, STOP_LIMIT), `future_trade_date` for pre-deal orders, and Switch-In/Switch-Out order type (validates both legs, computes gain/loss and WHT, single settlement cycle per FR-ORD-023).
13. **[Gap #1] Scheduled/recurring orders** — Add `scheduled_orders` service with frequency (daily/weekly/bi-weekly/monthly/quarterly), auto-generate child orders per schedule with cash-availability check, pause/resume/cancel lifecycle per FR-ORD-024.
14. **[Gap #1] Inter-portfolio blocks & subsequent-allocation** — Support one-to-one, one-to-many, many-to-one, many-to-many portfolio block transactions with CSV bulk import (FR-ORD-026). Allow adding allocations to placed-but-unfilled blocks (FR-ORD-025).
15. **[Gap #1] Auto-compute & disposal methods** — When 2 of {units, price, gross_amount} provided, auto-calculate the third (FR-ORD-027). Redemption disposal methods: FIFO, LIFO, Weighted Average, Specific Lot, Highest Cost, per COP/DS/Folio. Default FIFO; IMA defaults to Specific Lot. Tax impact preview (FR-ORD-028).
16. **[Gap #1] Payment mode & inline FX** — Order ticket includes payment mode field (Debit CA/SA with real-time balance check, Cash, Cheque, Wire Transfer) per FR-ORD-029. Inline FX conversion when order currency differs from funding account currency with live rate display per FR-ORD-030.
17. **[Gap #1] Trader-ID tagging & TRN** — Every order stamped with trader ID, filterable by Trader-ID across all screens (FR-ORD-032). System-generated chronological TRN format `TRN-YYYYMMDD-HHMMSS-NNNNN` (FR-ORD-031).
18. **[Gap #2] Order maintenance** — Order edit post-submission gated by allowed-order-status matrix (FR-AUT-004). Revert/un-cancel with T+3 age limit and no-offsetting-settlement check (FR-AUT-005). Back-dating override with tiered approval: T-5 → 4-eyes, beyond T-5 → 6-eyes (FR-AUT-006).
19. **[Gap #2] Partial liquidation by proceeds** — User specifies target cash amount; system auto-computes required sell quantity using selected disposal method, net of taxes/fees (FR-WDL-008). Unmatched-inventory view showing available lots with live volume decrement (FR-CON-006).
20. **[Gap #2] Order explorer page** — Create `apps/back-office/src/pages/order-explorer.tsx` (BRD Screen #29): filterable by Client/Account/Account Officer/Branch/Trader-ID, gated by RBAC. Chronological TRN display with date-time stamp.

**Files to create/modify:**
- `apps/front-office/src/components/layout/FrontOfficeLayout.tsx`
- `apps/front-office/src/config/navigation.ts`
- `apps/front-office/src/routes/index.tsx`
- `apps/front-office/src/pages/order-capture.tsx`
- `apps/front-office/src/pages/orders.tsx`
- `apps/front-office/src/pages/srm-approval-queue.tsx`
- `apps/front-office/src/pages/order-detail.tsx`
- `apps/back-office/src/pages/order-explorer.tsx`
- `server/services/order-service.ts`
- `server/services/authorization-service.ts`
- `server/services/notification-service.ts`
- `server/services/scheduled-order-service.ts`
- `server/routes/orders.ts`

**Acceptance criteria:**
- RM can create a 56-field order with real-time suitability check
- Order transitions: Draft → Pending-Auth → Authorized/Rejected
- Suitability check returns PASSED/FAILED with clear reasons
- Mandate compliance checks run on capture (allocation, concentration, restricted)
- Authorization tiers correctly determined by amount threshold
- 2-eyes: SRM approves alone (≤ PHP 50M)
- 4-eyes: SRM + Risk Officer (PHP 50–500M)
- 6-eyes: SRM + Risk + Compliance + committee (> PHP 500M)
- Self-authorization prevented (RM who captured cannot authorize)
- Order timeline shows complete state transition history
- Notifications fire on state transitions
- P95 order capture time ≤ 60s (BRD KPI)
- [Gap #1] Time-in-force (DAY/GTC) correctly gates order expiry
- [Gap #1] Switch-In/Out processes both legs atomically
- [Gap #1] Scheduled orders auto-generate per frequency
- [Gap #1] Auto-compute calculates missing field correctly
- [Gap #1] Disposal methods compute correct tax impact
- [Gap #1] Payment mode debit validates CA/SA balance
- [Gap #1] Inline FX shows live rate and books atomically
- [Gap #2] Order edit respects status matrix
- [Gap #2] Un-cancel respects T+3 and settlement checks
- [Gap #2] Partial liquidation by proceeds computes correctly

---

## Phase 1C: RM Cockpit & Dashboard
**Dependencies:** Phase 1B

**Description:**
Build the RM cockpit dashboard — the primary front-office screen showing book-of-business view, pending tasks, mandate breaches, suitability refresh reminders, and order pipeline. This is BRD UI Screen #1 (Front-Office Cockpit).

**Tasks:**
1. **RM dashboard service** — Create `server/services/rm-dashboard-service.ts` with: `getBookOfBusiness(rmId)` (client count, total AUM, by product type), `getPendingTasks(rmId)` (orders pending auth, suitability refreshes due, KYC expiring, mandate breaches), `getOrderPipeline(rmId)` (funnel: draft → pending → authorized → placed → filled → settled), `getClientAlerts(rmId)` (birthdays, anniversaries, mandate breaches, suitability changes).
2. **RM dashboard routes** — Create `server/routes/rm-dashboard.ts` with aggregation endpoints.
3. **RM cockpit page** — Create `apps/front-office/src/pages/rm-dashboard.tsx` with: AUM summary card (total, by product type), order pipeline funnel (Recharts), pending tasks list (actionable), mandate breaches panel (click to view), suitability refresh reminders, client alerts (birthdays, upcoming KYC). Auto-refresh every 60s.
4. **Client book page** — Create `apps/front-office/src/pages/client-book.tsx` with: searchable client list with AUM, risk profile, last contact, product count. Click-through to client detail with portfolios, positions, order history, suitability profile, mandate summary.
5. **Mandate monitor page** — Create `apps/front-office/src/pages/mandate-monitor.tsx` showing: all active mandates with current vs allowed allocation, breach status (red/yellow/green), historical breach timeline. This is the RM's view — Compliance gets a more detailed view later.

**Files to create/modify:**
- `server/services/rm-dashboard-service.ts`
- `server/routes/rm-dashboard.ts`
- `apps/front-office/src/pages/rm-dashboard.tsx`
- `apps/front-office/src/pages/client-book.tsx`
- `apps/front-office/src/pages/mandate-monitor.tsx`

**Acceptance criteria:**
- RM dashboard shows accurate AUM by product type
- Order pipeline funnel updates in real-time
- Pending tasks are actionable (click navigates to relevant page)
- Mandate breaches are highlighted with severity
- Client book supports search and shows key metrics
- Dashboard auto-refreshes every 60s
- All data scoped to the logged-in RM's clients only

---

## Phase 2A: Aggregation, Placement & Trader Cockpit
**Dependencies:** Phase 1B

**Description:**
Implement the middle-office aggregation and placement flow (BRD FR-AGG-001 through FR-AGG-009, FR-EXE-001 through FR-EXE-012) and the trader cockpit (BRD UI Screen #3). Authorized orders are aggregated into blocks by security, blocks are placed with brokers. This is the bridge between front-office capture and middle-office execution. **Expanded per BDO RFI Gap #3 (Execution & Allocation)** to include: automated order combining, IPO allocation engine, time-receipt allocation with waitlist, rounding/fee adjustments, fee override, broker charge distribution, and stock transaction-charge calculator.

**Tasks:**
1. **Aggregation service** — Create `server/services/aggregation-service.ts` with: `aggregateOrders(securityId, orderIds)` → creates block with parent-child links, `allocateBlock(blockId, policy)` (pro-rata / priority), `getAggregationView(traderId)` → all authorized orders grouped by security with block suggestions.
2. **Placement service** — Create `server/services/placement-service.ts` with: `selectBroker(blockId, criteria)` (best execution, commission, historical fill rate), `placeBlock(blockId, brokerId)` → transitions block to Placed, generates FIX-like order message (stub), `cancelPlacement(blockId)`.
3. **Trade routes** — Create `server/routes/trades.ts` with: `POST /api/v1/blocks` (create block from orders), `PUT /api/v1/blocks/:id/allocate`, `POST /api/v1/blocks/:id/place`, `GET /api/v1/blocks` (working blocks), `POST /api/v1/trades` (fill capture from broker), `GET /api/v1/trades/:id`.
4. **Trader cockpit page** — Create `apps/front-office/src/pages/trader-cockpit.tsx` (BRD Screen #3): working orders panel (authorized, ready for aggregation), block builder (drag orders into blocks), broker selection with heat-map (fill rate, commission, latency), placed orders with fill status, P&L summary. Real-time updates via polling (Supabase Realtime in later phase).
5. **Fill capture** — Implement `server/services/fill-service.ts` with: `recordFill(blockId, fillData)` → creates trade record, updates block status (Partially-Filled/Filled), allocates fills back to child orders, calculates slippage.
6. **Mid-office layout** — Create `apps/mid-office/src/components/layout/MidOfficeLayout.tsx` and `apps/mid-office/src/config/navigation.ts` with sections: Dashboard, Confirmations, Mandate Monitor, NAV Computation, Exceptions.
7. **Mid-office router** — Create `apps/mid-office/src/routes/index.tsx`.

**Files to create/modify:**
- `server/services/aggregation-service.ts`
- `server/services/placement-service.ts`
- `server/services/fill-service.ts`
- `server/routes/trades.ts`
- `apps/front-office/src/pages/trader-cockpit.tsx`
- `apps/mid-office/src/components/layout/MidOfficeLayout.tsx`
- `apps/mid-office/src/config/navigation.ts`
- `apps/mid-office/src/routes/index.tsx`

**Acceptance criteria:**
- Authorized orders can be aggregated into blocks by security
- Block allocation works (pro-rata distributes fills proportionally)
- Broker selection shows comparative metrics
- Fill capture records trades with slippage calculation
- Fills allocate back to child orders correctly
- Trader cockpit shows real-time working order view
- Block builder allows grouping orders visually
- Order status transitions: Authorized → Aggregated → Placed → Filled
- [Gap #3] Auto-combining detects and proposes similar open orders
- [Gap #3] IPO allocation engine caps at issue limit, allocates per policy
- [Gap #3] Waitlisted portfolios auto-allocated on back-outs
- [Gap #3] Rounding adjustments editable before posting
- [Gap #3] Fee override audit-logged with justification
- [Gap #3] Daily broker charge distribution report generates

---

## Phase 2B: Confirmation & Matching
**Dependencies:** Phase 2A

**Description:**
Implement trade confirmation and matching (BRD FR-CFR-001 through FR-CFR-006). Middle office confirms trades by matching internal records against broker/counterparty confirmations. Auto-match with tolerance, exception queue for breaks.

**Tasks:**
1. **Confirmation service** — Create `server/services/confirmation-service.ts` with: `autoMatch(tradeId, counterpartyConfirmation)` (match on: security, quantity, price within tolerance, settlement date, counterparty), `getMatchTolerance()` → configurable price tolerance (BRD: dual-source deviation > 0.25% flags exception), `flagException(tradeId, reason)`, `resolveException(confirmationId, resolution)`, `getConfirmationQueue(filters)`.
2. **Confirmation routes** — Create `server/routes/confirmations.ts` with: `GET /api/v1/confirmations` (queue with status filter), `POST /api/v1/confirmations/:tradeId/match`, `POST /api/v1/confirmations/:tradeId/exception`, `POST /api/v1/confirmations/:id/resolve`, `GET /api/v1/confirmations/summary`.
3. **Confirmation page** — Create `apps/mid-office/src/pages/confirmations.tsx`: confirmation queue with status filters (Unmatched, Matched, Exception), auto-match trigger, exception detail with resolution workflow, side-by-side comparison (internal vs counterparty), bulk confirm for matched items. MO-M creates/updates, MO-C authorizes.
4. **Exception queue** — Create `apps/mid-office/src/pages/exceptions.tsx` with: all unresolved trade exceptions, aging indicators, resolution workflow (assign, investigate, resolve, escalate).

**Files to create/modify:**
- `server/services/confirmation-service.ts`
- `server/routes/confirmations.ts`
- `apps/mid-office/src/pages/confirmations.tsx`
- `apps/mid-office/src/pages/exceptions.tsx`

**Acceptance criteria:**
- Auto-match correctly identifies matching trades within tolerance
- Price deviation > 0.25% flags exception (per BRD FR-NAV-005)
- Exception queue shows all unresolved items with aging
- MO-M can create/update confirmations, MO-C authorizes
- Bulk confirm works for matched items
- Confirmation status transitions: Unmatched → Matched → Confirmed (or Exception)
- Post-trade confirmation SLA tracking (≥ 99% within T+0 cut-off per BRD KPI)

---

## Phase 2C: Fund Accounting & NAV Computation
**Dependencies:** Phase 0E

**Description:**
Implement UITF NAV computation (BRD FR-NAV-001 through FR-NAV-005) and fund accounting console. Daily NAVpu per UITF computed at 11:30 PHT, fair-value hierarchy (Level 1→2→3), unit issuance/redemption, cut-off enforcement.

**Tasks:**
1. **NAV service** — Create `server/services/nav-service.ts` with: `computeNav(portfolioId, date)` (sum positions × prices, subtract liabilities, divide by units), `applyFairValueHierarchy(securityId)` (Level 1: market price, Level 2: model with observable inputs, Level 3: model with unobservable inputs), `validateNav(navId)` (dual-source price deviation check), `publishNav(navId)`, `getNavHistory(portfolioId, dateRange)`.
2. **Unit transaction service** — Create `server/services/unit-service.ts` with: `issueUnits(portfolioId, amount, investorId)`, `redeemUnits(portfolioId, units, investorId)`, `enforceCutOff(transactionDate, cutOffTime)` (after 11:30 PHT → next day), `reconcileUnits(portfolioId)` (PAR-to-NAVpu reconciliation).
3. **NAV routes** — Create `server/routes/nav.ts` with: `POST /api/v1/nav/compute/:portfolioId`, `GET /api/v1/nav/:portfolioId/history`, `POST /api/v1/nav/:id/publish`, `GET /api/v1/nav/status` (all funds' NAV status for today), `POST /api/v1/units/issue`, `POST /api/v1/units/redeem`.
4. **Fund accounting console** — Create `apps/mid-office/src/pages/fund-accounting.tsx` (BRD Screen #6): NAV run dashboard (per-fund status: Not Started, Computing, Validated, Published), pricing source dashboard (Level 1/2/3 distribution), unit book (issuance/redemption journal), NAV history chart. 11:30 PHT cut-off countdown timer.
5. **NAV updates page (back-office)** — Create `apps/back-office/src/pages/nav-updates.tsx` for operations to monitor NAV ingestion status and staleness. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/nav-updates.tsx` pattern.

**Files to create/modify:**
- `server/services/nav-service.ts`
- `server/services/unit-service.ts`
- `server/routes/nav.ts`
- `apps/mid-office/src/pages/fund-accounting.tsx`
- `apps/back-office/src/pages/nav-updates.tsx`

**Acceptance criteria:**
- NAV computed correctly: total_nav = sum(position_qty × price) - liabilities
- NAVpu = total_nav / units_outstanding
- Fair-value hierarchy applies fallback pricing (L1→L2→L3)
- Dual-source price deviation > 0.25% flags exception
- Cut-off enforcement: transactions after 11:30 PHT roll to next day
- Unit issuance/redemption correctly adjusts units_outstanding
- NAV status dashboard shows all funds' computation status
- NAV publication deadline 12:00 PHT tracked with countdown

---

## Phase 3A: Settlement & Cash Ledger
**Dependencies:** Phase 2B

**Description:**
Implement the back-office settlement flow (BRD FR-STL-001 through FR-STL-010): SSI resolution, SWIFT message generation (stub), PhilPaSS routing (stub), cash ledger posting, Finacle GL integration (stub). The back-office settlement desk (BRD Screen #5) shows cut-off clocks, failed queue, and cash-ledger heat-map.

**Tasks:**
1. **Settlement service** — Create `server/services/settlement-service.ts` with: `initializeSettlement(confirmationId)` → creates settlement instruction from SSI, `resolveSSI(tradeId)` → lookup standard settlement instructions for counterparty + security type, `generateSwiftMessage(settlementId, messageType)` → stub for MT540-548 generation, `routeToPhilPaSS(settlementId)` → stub for RTGS routing, `postCashLedger(settlementId)` → debit/credit TSA/CSA/TCA accounts, `postToFinacle(settlementId)` → stub for GL posting, `markSettled(settlementId)`, `markFailed(settlementId, reason)`.
2. **Cash ledger service** — Create `server/services/cash-ledger-service.ts` with: `getBalance(portfolioId, currency)`, `postEntry(portfolioId, type, amount, currency, reference)`, `getTransactions(portfolioId, dateRange)`, `getLiquidityHeatMap()` → T/T+1/T+2 cash positions by currency (BRD FR-CSH-004).
3. **Settlement routes** — Create `server/routes/settlements.ts` with: `GET /api/v1/settlements` (queue by status), `POST /api/v1/settlements/:confirmationId/initiate`, `POST /api/v1/settlements/:id/settle`, `POST /api/v1/settlements/:id/fail`, `GET /api/v1/settlements/cut-offs` (today's cut-off times), `GET /api/v1/cash-ledger/:portfolioId`, `GET /api/v1/cash-ledger/liquidity-heatmap`.
4. **Settlement desk page** — Create `apps/back-office/src/pages/settlement-desk.tsx` (BRD Screen #5): cut-off clock (real-time countdown to settlement deadlines), SWIFT traffic panel (pending/sent/confirmed/failed message counts), failed settlement queue (with retry/escalate actions), cash-ledger heat-map (by currency showing T/T+1/T+2 positions). BO-M books, BO-C authorizes.
5. **Cash & FX dashboard** — Create `apps/back-office/src/pages/cash-fx-dashboard.tsx` (BRD Screen #20): liquidity heat-map by currency, nostro/vostro account register, FX spot & forward booking form (stub), FX-hedge linkage display.

**Files to create/modify:**
- `server/services/settlement-service.ts`
- `server/services/cash-ledger-service.ts`
- `server/routes/settlements.ts`
- `apps/back-office/src/pages/settlement-desk.tsx`
- `apps/back-office/src/pages/cash-fx-dashboard.tsx`

**Acceptance criteria:**
- Confirmed trades can be settled with SSI resolution
- Cash ledger correctly debits/credits on settlement
- Failed settlements enter exception queue with retry capability
- Cut-off clock displays correct deadlines
- Liquidity heat-map shows T/T+1/T+2 projections by currency
- Settlement status transitions: Pending → Matched → Settled (or Failed → Retried)
- BO-M/BO-C maker-checker enforced on settlement
- [Gap #8] Book-only settlement updates GL without SWIFT/RTGS
- [Gap #8] Bulk settlement batches by counterparty/currency/date
- [Gap #8] Clearing accounts sweep into Trust settlement accounts in EOD
- [Gap #8] Official Receipt auto-generated on cash-receipt transactions
- [Gap #8] Coupon/maturity grouped by custodian for processing
- [Gap #8] Settlement accounts configurable at account or portfolio level, multi-currency

---

## Phase 3B: EOD Processing & Reconciliation
**Dependencies:** Phase 3A

**Description:**
Implement the EOD job orchestration DAG (following PS-WMS `/Users/n15318/PS-WMS/server/services/eod-orchestrator.ts`) and transaction/position reconciliation (PS-WMS `/Users/n15318/PS-WMS/apps/ops/src/pages/reconciliation.tsx`). The EOD chain runs: NAV ingestion → validation → portfolio revaluation → position snapshot → settlement processing → fee accrual → data quality check → daily report.

**Tasks:**
1. **EOD orchestrator** — Create `server/services/eod-orchestrator.ts` replicating `/Users/n15318/PS-WMS/server/services/eod-orchestrator.ts` pattern. DAG-based job chain stored in `sys_job_definitions` + `sys_job_dependencies`. Jobs: `nav_ingestion`, `nav_validation`, `portfolio_revaluation`, `position_snapshot`, `settlement_processing`, `fee_accrual`, `commission_accrual`, `data_quality_check`, `regulatory_report_gen`, `daily_report`. Each job: pending → running → completed/failed/skipped. `checkAndAdvance()` fires dependent jobs when prerequisites complete.
2. **EOD routes** — Create `server/routes/back-office/eod.ts` with: `GET /api/v1/eod/status`, `GET /api/v1/eod/status/:runId`, `POST /api/v1/eod/trigger`, `POST /api/v1/eod/jobs/:id/retry`, `POST /api/v1/eod/jobs/:id/skip`, `GET /api/v1/eod/history`, `GET /api/v1/eod/definitions`.
3. **EOD dashboard** — Create `apps/back-office/src/pages/eod-dashboard.tsx` following `/Users/n15318/PS-WMS/apps/ops/src/pages/eod-dashboard.tsx`: visual job chain DAG with color-coded borders (green/yellow/red/gray), progress bar, per-job cards (status, duration, records, SLA, errors), actions (trigger/retry/skip), execution history with expandable rows. Auto-polls 5s when running.
4. **Reconciliation service** — Create `server/services/reconciliation-service.ts` with: `runTransactionRecon(date)` → compare internal trades vs external confirmations, `runPositionRecon(date)` → compare positions vs custodian records, `getBreaks(filters)`, `resolveBreak(breakId, resolution)`, `getBreakAging()` → 0-1d, 2-3d, 4-7d, 7+d buckets.
5. **Reconciliation routes** — Create `server/routes/back-office/reconciliation.ts`.
6. **Reconciliation pages** — Create `apps/back-office/src/pages/reconciliation.tsx` (transaction recon) and `apps/back-office/src/pages/position-reconciliation.tsx` (position recon). Follow PS-WMS patterns. Summary cards, break aging chart, runs/breaks/upload tabs.

**Files to create/modify:**
- `server/services/eod-orchestrator.ts`
- `server/routes/back-office/eod.ts`
- `apps/back-office/src/pages/eod-dashboard.tsx`
- `server/services/reconciliation-service.ts`
- `server/routes/back-office/reconciliation.ts`
- `apps/back-office/src/pages/reconciliation.tsx`
- `apps/back-office/src/pages/position-reconciliation.tsx`

**Acceptance criteria:**
- EOD trigger runs all jobs in correct dependency order
- DAG visualization shows real-time progress
- Failed jobs can be retried; stuck jobs can be skipped to unblock dependents
- Transaction reconciliation identifies breaks between internal and external records
- Position reconciliation compares with custodian records
- Break aging correctly buckets unresolved items
- EOD history shows all past runs with per-job detail

---

## Phase 3C: Corporate Actions & Fee Engine
**Dependencies:** Phase 0E, Phase 3A

**Description:**
Implement corporate actions processing (BRD FR-CA-001 through FR-CA-005) and the fee & billing engine (BRD FR-FEE-001 through FR-FEE-005). These are critical back-office functions that affect position, cash, and accounting.

**Tasks:**
1. **Corporate actions service** — Create `server/services/corporate-actions-service.ts` with: `ingestCorporateAction(data)` (from Bloomberg/PSE EDGE — stub), `calculateEntitlement(caId, portfolioId)` (on ex-date – 2), `processElection(entitlementId, option)` (dividend reinvest, tender, rights), `applyTaxTreatment(entitlementId)`, `postCaAdjustment(entitlementId)` (position + cash adjustment with audit).
2. **Corporate actions routes** — Create `server/routes/back-office/corporate-actions.ts`.
3. **Corporate actions desk** — Create `apps/back-office/src/pages/corporate-actions.tsx` (BRD Screen #19): calendar view (upcoming CAs), entitlements table (per portfolio), election workflow form, impact preview dialog, processed history. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/corporate-actions.tsx`.
4. **Fee engine service** — Create `server/services/fee-engine-service.ts` with: `defineSchedule(portfolioId, feeType, method, rates)`, `runDailyAccrual(date)` → accrue fees across all active schedules, `runBillingPeriod(periodFrom, periodTo)` → generate invoices from accruals, `generateInvoice(portfolioId, period)` → debit portfolio, post to GL, `processWaiver(invoiceId, reason)`, `calculateUITFTER(portfolioId, period)`.
5. **Fee routes** — Create `server/routes/back-office/fees.ts`.
6. **Fee & billing desk** — Create `apps/back-office/src/pages/fee-billing-desk.tsx` (BRD Screen #18): fee schedule management (CRUD), accrual status, billing run trigger, invoice list with status, waiver workflow, UITF TER tracking.

**Files to create/modify:**
- `server/services/corporate-actions-service.ts`
- `server/routes/back-office/corporate-actions.ts`
- `apps/back-office/src/pages/corporate-actions.tsx`
- `server/services/fee-engine-service.ts`
- `server/routes/back-office/fees.ts`
- `apps/back-office/src/pages/fee-billing-desk.tsx`

**Acceptance criteria:**
- Corporate actions can be created with all types (dividend, split, rights, etc.)
- Entitlement calculation runs correctly on ex-date – 2
- Election workflow supports multiple options (reinvest, cash, tender)
- Tax treatment applies per security type and residency
- Post-CA position and cash adjustments are audited
- Fee schedules support all calculation methods (flat, tiered, %AUM, performance)
- Daily accrual runs correctly across all active schedules
- Billing run generates invoices for the period
- Fee waiver workflow includes audit trail
- UITF TER is calculated and tracked

---

## Phase 3D: Taxation Engine
**Dependencies:** Phase 3A, Phase 3C

**Description:**
Implement the taxation engine (BRD FR-TAX-001 through FR-TAX-004): WHT calculation by security and residency, BIR form generation (2306/2307/2316), FATCA/CRS annual report generation (IDES XML), eBIRForms 1601-FQ monthly filing interface.

**Tasks:**
1. **Tax engine service** — Create `server/services/tax-engine-service.ts` with: `calculateWHT(tradeId)` (rate by security type × investor residency), `generateBIRForm(formType, params)` (2306 creditable, 2307 expanded, 2316 wages), `generateFATCAReport(year)` → IDES XML for US-reportable accounts, `generateCRSReport(year)` → OECD CRS XML for reportable jurisdictions, `generate1601FQ(month)` → monthly WHT filing, `getTaxEvents(portfolioId, dateRange)`.
2. **Tax routes** — Create `server/routes/back-office/tax.ts`.
3. **Tax management page** — Create `apps/back-office/src/pages/tax-management.tsx`: tax event log, WHT summary by period, BIR form generation queue, FATCA/CRS report status, 1601-FQ filing tracker. Integrates with fee billing for tax-on-fees.

**Files to create/modify:**
- `server/services/tax-engine-service.ts`
- `server/routes/back-office/tax.ts`
- `apps/back-office/src/pages/tax-management.tsx`

**Acceptance criteria:**
- WHT calculates correctly by security type and investor residency
- BIR forms 2306/2307/2316 generate with correct data
- FATCA IDES XML generates for US-reportable accounts
- CRS XML generates for all reportable jurisdictions
- 1601-FQ monthly filing data is correct
- Tax events are linked to source trades and audited

---

## Phase 3E: Reversals & Bulk Upload
**Dependencies:** Phase 3A

**Description:**
Implement the reversal workflow with compliance gate (BRD FR-REV-001 through FR-REV-004) and bulk upload with batch rollback (BRD FR-UPL-001 through FR-UPL-006). Both are critical back-office operational tools.

**Tasks:**
1. **Reversal service** — Create `server/services/reversal-service.ts` with: `requestReversal(transactionId, reason, evidence)` (Ops-initiated), `approveReversal(caseId, complianceOfficerId)` (Compliance gate), `executeReversal(caseId)` → generate reversing entries, unwind position/cash, `generateClientAdvice(caseId)`.
2. **Reversal routes** — Create `server/routes/back-office/reversals.ts`.
3. **Bulk upload service** — Create `server/services/bulk-upload-service.ts` with: `validateUpload(file, schema)` → row-level validation per BRD CSV template (Appendix C), `submitBatch(batchId)` → fan-out validated rows as individual orders, `rollbackBatch(batchId)` → generate compensating entries for already-placed rows (BRD FR-UPL-006), `getErrorReport(batchId)`.
4. **Upload routes** — Create `server/routes/back-office/uploads.ts` with: `POST /api/v1/uploads` (multipart, returns 202 per BRD 7.4), `GET /api/v1/uploads/:batchId/status`, `GET /api/v1/uploads/:batchId/errors`, `POST /api/v1/uploads/:batchId/authorize`, `POST /api/v1/uploads/:batchId/rollback`.
5. **Upload desk page** — Create `apps/back-office/src/pages/upload-desk.tsx` (BRD Screen #23): file upload with drag-drop, validation progress, error report display (row-level with downloadable CSV), batch status tracking, rollback button with confirmation.
6. **Reversal queue page** — Update compliance workbench (Phase 4A) or create `apps/back-office/src/pages/reversals.tsx` showing pending/approved/executed reversals.

**Files to create/modify:**
- `server/services/reversal-service.ts`
- `server/routes/back-office/reversals.ts`
- `server/services/bulk-upload-service.ts`
- `server/routes/back-office/uploads.ts`
- `apps/back-office/src/pages/upload-desk.tsx`
- `apps/back-office/src/pages/reversals.tsx`

**Acceptance criteria:**
- Reversals require compliance approval (cannot bypass)
- Reversing entries correctly unwind position and cash
- Client advice generates automatically on reversal execution
- Bulk upload validates up to 10,000 rows within 3 minutes (BRD NFR)
- Row-level errors are reported with line numbers and reasons
- Batch rollback generates compensating entries for placed orders
- SRM authorization required before batch fan-out
- Upload follows BRD Appendix C CSV template format

---

## Phase 3F: Transfers, Contributions & Withdrawals
**Dependencies:** Phase 3A

**Description:**
Implement inter/intra-portfolio transfers, contributions, and withdrawals (BRD FR-TRF-001 through FR-TRF-007, FR-CON-001 through FR-CON-005, FR-WDL-001 through FR-WDL-006). These are common trust operations beyond buy/sell orders.

**Tasks:**
1. **Transfer service** — Create `server/services/transfer-service.ts` with: `initiateTransfer(fromPortfolioId, toPortfolioId, securityId, quantity, type)` (inter-portfolio, intra-portfolio, scripless, certificated), `approveTransfer(transferId)`, `executeTransfer(transferId)` → debit source position, credit target position, audit both.
2. **Contribution service** — Create `server/services/contribution-service.ts` with: `recordContribution(portfolioId, amount, currency, sourceAccount, type)`, `approveContribution(contributionId)`, `postContribution(contributionId)` → credit cash ledger, update AUM.
3. **Withdrawal service** — Create `server/services/withdrawal-service.ts` with: `requestWithdrawal(portfolioId, amount, currency, destinationAccount, type)`, `calculateWithholdingTax(withdrawalId)`, `approveWithdrawal(withdrawalId)`, `executeWithdrawal(withdrawalId)` → debit cash ledger, generate payment instruction.
4. **Routes** — Create `server/routes/back-office/transfers.ts`, `contributions.ts`, `withdrawals.ts`.
5. **Transfers page** — Create `apps/back-office/src/pages/transfers.tsx` with transfer form, pending queue, history.
6. **Contributions & withdrawals pages** — Create `apps/back-office/src/pages/contributions.tsx` and `withdrawals.tsx`.

**Files to create/modify:**
- `server/services/transfer-service.ts`
- `server/services/contribution-service.ts`
- `server/services/withdrawal-service.ts`
- `server/routes/back-office/transfers.ts`, `contributions.ts`, `withdrawals.ts`
- `apps/back-office/src/pages/transfers.tsx`
- `apps/back-office/src/pages/contributions.tsx`
- `apps/back-office/src/pages/withdrawals.tsx`

**Acceptance criteria:**
- Inter-portfolio transfers correctly debit/credit both portfolios
- Scripless and certificated transfer types supported
- Contributions credit cash ledger and update AUM
- Withdrawals calculate withholding tax correctly
- All operations require maker-checker approval
- Audit trail captures all state transitions

---

## Phase 3G: Pre/Post-Trade Compliance Engine *(BDO RFI Gap #4)*
**Dependencies:** Phase 1B, Phase 0F

**Description:**
Implement the granular pre/post-trade compliance engine (BRD FR-PTC-001 through FR-PTC-022). The BRD's original compliance rules were summary-level; this phase adds the full limit taxonomy, hard/soft validation distinction, IMA-specific validations, and specialized checks from the BDO RFI. This is **Gap #4 (High severity)** — fiduciary control with auditable override paths.

**Tasks:**
1. **Compliance limit service** — Create `server/services/compliance-limit-service.ts` with limit taxonomy: `checkTraderLimit(traderId, amount)`, `checkCounterpartyLimit(counterpartyId, amount)`, `checkBrokerLimit(brokerId, amount)`, `checkIssuerLimit(issuerId, portfolioId)`, `checkSectorLimit(sector, portfolioId)`, `checkSingleBorrowersLimit(borrowerId)`, `checkGroupLimit(groupId)`. Each returns `{passed, breachType, currentExposure, limit, severity: 'hard'|'soft'}`.
2. **Pre-trade validation engine** — Create `server/services/pre-trade-validation-service.ts` orchestrating all checks on order capture: short-sell detection (FR-PTC-006), overselling vs actual positions (FR-PTC-007), hold-out flag blocking (FR-PTC-008), IMA minimum face PHP 1M (FR-PTC-009), no co-mingling between IMA accounts (FR-PTC-010), tax-status IPT T+0 validation (FR-PTC-012), currency mismatch warning (FR-PTC-013), FATCA/non-resident product restriction (FR-PTC-014), outstanding document deficiency blocker (FR-PTC-016), cut-off time enforcement (FR-PTC-017), volume-not-available rejection (FR-PTC-018), unfunded-order rejection with "funding in transit" override (FR-PTC-019), minimum-balance check (FR-PTC-021), CSA waiver prompt for higher-risk products (FR-PTC-022).
3. **Hard/soft validation framework** — Implement distinction: hard breaches block the order; soft breaches require documented override by designated authoriser with RBAC. Override path creates `validation_overrides` record with justification, authoriser, and timestamp (FR-PTC-004, FR-PTC-005).
4. **Post-trade compliance service** — Create `server/services/post-trade-compliance-service.ts` with: scheduled post-trade reviews, expiring-line reminders/alarms, multi-portfolio analysis (FR-PTC-003).
5. **Aging/curing period monitor** — Track breach aging and curing periods; escalate unresolved breaches per configurable thresholds (FR-PTC-023 mapped from RFI R490).
6. **Compliance limit maintenance pages** — Create `apps/back-office/src/pages/compliance-limits.tsx` for CRUD management of all limit types. Create `apps/back-office/src/pages/validation-overrides.tsx` for audit trail of all soft-breach overrides.

**Files to create/modify:**
- `server/services/compliance-limit-service.ts`
- `server/services/pre-trade-validation-service.ts`
- `server/services/post-trade-compliance-service.ts`
- `server/routes/back-office/compliance-limits.ts`
- `apps/back-office/src/pages/compliance-limits.tsx`
- `apps/back-office/src/pages/validation-overrides.tsx`

**Acceptance criteria:**
- All 22 FR-PTC requirements implemented and testable
- Hard breaches block orders; soft breaches require authorized override
- Override audit trail captures justification and authoriser
- Limit taxonomy covers all 8 dimensions (trader, counterparty, broker, issuer, sector, SBL, group, outlet)
- IMA-specific validations enforce PHP 1M minimum, no co-mingling
- Cut-off time enforcement auto-rejects after deadline
- Post-trade review scheduler fires at configured intervals
- Aging monitor escalates unresolved breaches

---

## Phase 3H: Portfolio Modeling & Rebalancing *(BDO RFI Gap #5 — Critical)*
**Dependencies:** Phase 1B, Phase 0E

**Description:**
Implement the Portfolio Modeling & Rebalancing module (BRD FR-PMR-001 through FR-PMR-010). This is entirely absent from the original BRD and is **Gap #5 (Critical severity)** — a core discretionary-mandate capability. Covers simulation, what-if analysis, stress-test modeling, model-portfolio management, and automated rebalancing with trade-blotter generation.

**Tasks:**
1. **Model portfolio service** — Create `server/services/model-portfolio-service.ts` with: `createModel(name, allocations)`, `getModels()`, `comparePortfolioToModel(portfolioId, modelId)` → deviation report, `getRebalancingActions(portfolioId, modelId)` → list of trades needed to align.
2. **Simulation engine** — Create `server/services/simulation-engine-service.ts` with: `simulateWhat If(portfolioId, proposedTrades)` → ROI/yield/duration impact, trading gain/loss projection, `simulateStressTest(portfolioId, scenario)` → scenarios: interest rate shock, equity crash, credit widening, currency devaluation. `simulateConstantMixRebalance(portfolioId, modelId)`.
3. **Rebalancing service** — Create `server/services/rebalancing-service.ts` with: `rebalanceSingle(portfolioId, modelId, options)` → generates trade blotter, `rebalanceGroup(portfolioIds, modelId)` → rebalance multiple portfolios against single model, `rebalanceOnCashEvent(portfolioId, cashAmount, direction)` → rebalance considering new contribution/withdrawal, `includeHeldAwayAssets(portfolioId, heldAwayData)`. All rebalancing respects client restrictions and compliance limits. Generates `rebalancing_runs` audit record.
4. **Trade blotter from rebalance** — Auto-generate trade blotter from rebalancing run with post-generation edit capability. Blotter feeds directly into order capture (Phase 1B).
5. **Rebalancing routes** — Create `server/routes/back-office/rebalancing.ts`.
6. **Portfolio Modeling Workbench page** — Create `apps/back-office/src/pages/portfolio-modeling.tsx` (BRD Screen #25): model portfolio CRUD, portfolio-vs-model comparison chart, rebalancing wizard (select portfolios → select model → preview trades → approve → generate blotter), simulation results panel (ROI/yield/duration projections), stress-test scenario selector and results.

**Files to create/modify:**
- `server/services/model-portfolio-service.ts`
- `server/services/simulation-engine-service.ts`
- `server/services/rebalancing-service.ts`
- `server/routes/back-office/rebalancing.ts`
- `apps/back-office/src/pages/portfolio-modeling.tsx`

**Acceptance criteria:**
- Model portfolios can be created and maintained
- Portfolio-vs-model comparison shows deviation per asset class
- Rebalancing generates correct trade blotter
- Group rebalancing works across multiple portfolios
- Held-away assets included in rebalancing calculations
- Stress-test scenarios produce meaningful projections
- ROI/yield/duration impact shown before rebalancing execution
- Trade blotter is editable and feeds into order capture
- All rebalancing runs are audit-logged

---

## Phase 3I: Scheduled Plans & PERA Module *(BDO RFI Gap #9 — Critical)*
**Dependencies:** Phase 1B, Phase 3A

**Description:**
Implement the Scheduled Plans & PERA module (BRD FR-EIP-001 through FR-EIP-005, FR-ERP-001 through FR-ERP-003, FR-PERA-001 through FR-PERA-012, FR-IMASI-001 through FR-IMASI-002). These are full product lifecycles from the BDO RFI with no prior equivalent in the BRD. PERA is **Critical** — a BSP-regulated product requiring compliance and reporting.

**Tasks:**
1. **EIP service** — Create `server/services/eip-service.ts` with: `enrollEIP(clientId, productId, amount, frequency, caAccount)`, `modifyEIP(planId, changes)`, `unsubscribeEIP(planId, reason)`, `processAutoDebit(planId)` → transmit to core system for CA/SA debit, `getEIPDashboard(clientId)`.
2. **ERP service** — Create `server/services/erp-service.ts` with: `enrollERP(clientId, portfolioId, amount, frequency, caAccount)`, `unsubscribeERP(planId)`, `processAutoCredit(planId)`.
3. **PERA service** — Create `server/services/pera-service.ts` with: `onboardContributor(data)` (new or transfer from another administrator), `validateMaxProducts(contributorId)`, `processContribution(peraAccountId, amount)` with cut-off enforcement, `processQualifiedWithdrawal(peraAccountId)`, `processUnqualifiedWithdrawal(peraAccountId, penalty)`, `transferToProduct(peraAccountId, targetProductId)`, `transferToAdministrator(peraAccountId, targetAdmin)`, `generateBSPContributorFile()`, `generateBSPTransactionFile()`, `processTCC(contributorId)`, `modifyContributor(contributorId, data)`.
4. **BSP PERA-Sys integration stub** — Create `server/services/bsp-pera-sys-service.ts` with: `checkTINExistence(tin)`, `checkDuplicatePERA(contributorId)` — REST/SFTP stubs initially.
5. **IMA/TA Standing Instructions** — Create `server/services/standing-instructions-service.ts` with: `createStandingInstruction(accountId, type, params)` (auto-roll, auto-credit, auto-withdrawal), `processPreTermination(accountId)` with proceeds payout.
6. **Scheduled plans routes** — Create `server/routes/back-office/scheduled-plans.ts` and `server/routes/back-office/pera.ts`.
7. **PERA Administrator Console** — Create `apps/back-office/src/pages/pera-console.tsx` (BRD Screen #26): contributor onboarding, contribution/withdrawal processing, BSP file generation, TCC processing, e-Learning link management.
8. **Scheduled Plans Dashboard** — Create `apps/back-office/src/pages/scheduled-plans.tsx` (BRD Screen #27): EIP/ERP enrollment list, auto-debit/credit status, modification/cancellation forms.

**Files to create/modify:**
- `server/services/eip-service.ts`
- `server/services/erp-service.ts`
- `server/services/pera-service.ts`
- `server/services/bsp-pera-sys-service.ts`
- `server/services/standing-instructions-service.ts`
- `server/routes/back-office/scheduled-plans.ts`
- `server/routes/back-office/pera.ts`
- `apps/back-office/src/pages/pera-console.tsx`
- `apps/back-office/src/pages/scheduled-plans.tsx`

**Acceptance criteria:**
- EIP enrollment, modification, unsubscription lifecycle works
- ERP enrollment and auto-credit processing works
- PERA contributor onboarding validates max products per contributor
- PERA qualified/unqualified withdrawal applies correct rules
- BSP PERA Contributor File and Transaction File generate correctly
- TCC processing and viewing works
- Standing instructions (auto-roll, auto-credit, auto-withdrawal) fire on schedule
- Pre-termination workflow computes and pays proceeds
- All plans audit-logged with full lifecycle tracking

---

## Phase 3J: Risk Analytics *(BDO RFI Gap #6)*
**Dependencies:** Phase 1B, Phase 2A

**Description:**
Implement the Risk Analytics module (BRD FR-RSK-001 through FR-RSK-008). Covers VAR computation, back-testing, duration analytics, stress-test downloads, IREP, price-movement monitoring, embedded-derivative tagging, and derivative setup. This is **Gap #6 (Medium severity)** — risk-office reporting expectation.

**Tasks:**
1. **VAR service** — Create `server/services/var-service.ts` with: `computeVAR(portfolioId, method, confidenceLevel, horizon)` (methods: Historical, Parametric, Monte Carlo), `backTestVAR(portfolioId, period)` → compare VAR predictions vs actual P&L, `backTestVsTheoreticalIncome(portfolioId, period)`.
2. **Duration service** — Create `server/services/duration-service.ts` with: `computeMacaulayDuration(portfolioId, asOfDate)`, `computeModifiedDuration(portfolioId, asOfDate)`, `computeBenchmarkDuration(benchmarkId, asOfDate)`.
3. **IREP service** — Create `server/services/irep-service.ts` with: `captureClientDisposition(clientId, priceMovementPct, disposition)`, `checkPriceMovementThreshold(securityId, threshold)`, `getIREPDashboard()`.
4. **Derivative setup** — Extend security service to support derivative types (Asset Swap, CCS, IRS, Options, Forwards) with mark-to-market capability. Embedded-derivative tagging on securities.
5. **Risk analytics routes** — Create `server/routes/back-office/risk-analytics.ts`.
6. **Risk analytics dashboard** — Add risk analytics tab to existing compliance/risk pages or create `apps/back-office/src/pages/risk-analytics.tsx`: VAR computation panel, back-testing chart (VAR vs actual), duration display, stress-test download, IREP dashboard.

**Files to create/modify:**
- `server/services/var-service.ts`
- `server/services/duration-service.ts`
- `server/services/irep-service.ts`
- `server/routes/back-office/risk-analytics.ts`
- `apps/back-office/src/pages/risk-analytics.tsx`

**Acceptance criteria:**
- VAR computes for all three methods (Historical, Parametric, Monte Carlo)
- Back-testing compares VAR vs actual P&L with pass/fail zone chart
- Macaulay and modified duration compute correctly
- IREP captures client disposition to price-movement thresholds
- Derivative securities can be set up with mark-to-market
- Embedded-derivative tagging works on securities
- Stress-test results downloadable per portfolio

---

## Phase 4A: Compliance Workbench
**Dependencies:** Phase 1B, Phase 0F

**Description:**
Build the compliance workbench (BRD Screen #7): centralized compliance view with mandate breaches, AML hits, surveillance alerts, STR queue, reversals, and whistleblower cases. This is the CCO and Compliance Officer's primary interface.

**Tasks:**
1. **Compliance service** — Create `server/services/compliance-service.ts` with: `getBreaches(filters)` → all active mandate/limit breaches, `getAmlAlerts(filters)` → KYC/sanctions alerts, `getSurveillanceAlerts(filters)`, `getStrQueue()` → pending STR filings, `getReversalQueue()`, `getComplianceScore()` → aggregate compliance health metric.
2. **Compliance rules engine** — Create `server/services/compliance-rules-service.ts` with: CRUD for compliance rules (restricted list, policy limits, suitability rules, IPS rules), `evaluateOrder(orderId)` → run all applicable rules and return pass/fail/warn, `evaluatePosition(portfolioId)` → check concentration limits, sector limits, duration bands.
3. **Compliance routes** — Create `server/routes/back-office/compliance.ts`.
4. **Compliance workbench page** — Create `apps/back-office/src/pages/compliance-workbench.tsx` (BRD Screen #7): dashboard summary (active breaches, AML hits, pending STRs, surveillance alerts), tabs for each domain (Breaches, AML/KYC, Surveillance, STR, Reversals, Whistleblower), drill-down to individual cases, disposition workflow. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/compliance-rules.tsx` for rules management.
5. **Compliance rules page** — Create `apps/back-office/src/pages/compliance-rules.tsx` with four rule types: restricted list, policy limits, suitability rules, IPS rules. Follow PS-WMS pattern.

**Files to create/modify:**
- `server/services/compliance-service.ts`
- `server/services/compliance-rules-service.ts`
- `server/routes/back-office/compliance.ts`
- `apps/back-office/src/pages/compliance-workbench.tsx`
- `apps/back-office/src/pages/compliance-rules.tsx`

**Acceptance criteria:**
- Compliance workbench shows all active breaches, alerts, and cases
- Compliance rules CRUD works for all four types
- Order evaluation runs all applicable rules and returns results
- Position evaluation checks concentration and sector limits
- STR queue allows filing with AMLC goAML format (stub)
- Compliance score aggregates across all domains

---

## Phase 4B: Trade Surveillance & Kill-Switch
**Dependencies:** Phase 2A, Phase 4A

**Description:**
Implement trade surveillance (BRD FR-SRV-001 through FR-SRV-003) and kill-switch/trading halt (BRD FR-KSW-001 through FR-KSW-003). Surveillance detects market manipulation patterns; kill-switch halts trading by scope.

**Tasks:**
1. **Surveillance service** — Create `server/services/surveillance-service.ts` with: `evaluatePattern(orderId, pattern)` (layering: multiple orders same direction then cancel; spoofing: large order placed then cancelled; wash-trading: same-beneficial-owner both sides; front-running: RM order before client), `scoreAnomaly(rmId)` (vs peer baseline), `getAlerts(filters)`, `dispositionAlert(alertId, decision)` (false-positive / investigate / escalate).
2. **Kill-switch service** — Create `server/services/kill-switch-service.ts` with: `invokeKillSwitch(scope, reason, authorizedBy, mfaTokens)` (scope: market / asset-class / portfolio / desk per BRD FR-KSW-002), `cancelOpenOrders(scope)` → cancel all in-flight orders matching scope, `getActiveHalts()`, `resumeTrading(haltId, approvedBy)` → requires dual approval (BRD FR-KSW-003).
3. **Surveillance routes** — Create `server/routes/back-office/surveillance.ts`.
4. **Kill-switch routes** — Create `server/routes/kill-switch.ts` with: `POST /api/v1/kill-switch` (per BRD 7.4), `GET /api/v1/kill-switch/active`, `POST /api/v1/kill-switch/:id/resume`.
5. **Surveillance case manager page** — Create `apps/back-office/src/pages/trade-surveillance.tsx` (BRD Screen #22): scored alerts table, pattern type filters, disposition workflow, RM anomaly scoring chart.
6. **Kill-switch console page** — Create `apps/back-office/src/pages/kill-switch-console.tsx` (BRD Screen #15): scope selector, evidence capture form, active halts with timer, resume workflow requiring dual approval.

**Files to create/modify:**
- `server/services/surveillance-service.ts`
- `server/services/kill-switch-service.ts`
- `server/routes/back-office/surveillance.ts`
- `server/routes/kill-switch.ts`
- `apps/back-office/src/pages/trade-surveillance.tsx`
- `apps/back-office/src/pages/kill-switch-console.tsx`

**Acceptance criteria:**
- Surveillance detects all four patterns (layering, spoofing, wash-trading, front-running)
- Alerts are scored and can be dispositioned (false-positive/investigate/escalate)
- Kill-switch invocation requires CRO or CCO + MFA (per BRD)
- Scope selector works for market/asset-class/portfolio/desk
- Active halts show with timer since invocation
- Resume requires dual approval
- All kill-switch events are audit-logged with full evidence

---

## Phase 4C: ORE Ledger & Whistleblower
**Dependencies:** Phase 4A

**Description:**
Implement the Operational Risk Event ledger (BRD FR-ORE-001 through FR-ORE-004) and Whistleblower/Conduct-Risk module (BRD FR-WHB-001 through FR-WHB-003). Both feed into the compliance workbench.

**Tasks:**
1. **ORE service** — Create `server/services/ore-service.ts` with: `recordEvent(data)` (Basel 7-category taxonomy: Internal Fraud, External Fraud, Employment Practices, Clients/Products, Damage to Assets, Business Disruption, Execution/Delivery), `quantifyLoss(oreId, gross, net, recovery)`, `recordRootCause(oreId, cause, correctiveAction)`, `generateQuarterlyReport(quarter)`.
2. **Whistleblower service** — Create `server/services/whistleblower-service.ts` with: `submitCase(channel, description, anonymous)`, `assignReviewer(caseId, ccoId)`, `updateCase(caseId, status, resolution)`, `notifyDPO(caseId)`.
3. **Routes** — Create `server/routes/back-office/ore.ts` and `server/routes/whistleblower.ts`.
4. **ORE case manager page** — Create `apps/back-office/src/pages/ore-case-manager.tsx` (BRD Screen #21): Basel-tagged cases, loss quantification form, root-cause and corrective-action fields, quarterly report generator.
5. **Whistleblower portal** — Create `apps/back-office/src/pages/whistleblower.tsx` for CCO case management. The external anonymous intake will be a separate minimal page.
6. **Conduct-risk dashboard** — Add to compliance workbench: complaints count, churn rate, surveillance hits trend, RM conduct scores.

**Files to create/modify:**
- `server/services/ore-service.ts`
- `server/services/whistleblower-service.ts`
- `server/routes/back-office/ore.ts`
- `server/routes/whistleblower.ts`
- `apps/back-office/src/pages/ore-case-manager.tsx`
- `apps/back-office/src/pages/whistleblower.tsx`

**Acceptance criteria:**
- ORE events recorded with Basel 7-category taxonomy
- Loss quantification (gross/net/recovery) captured
- Root-cause and corrective-action fields required
- Quarterly ORE report generates for CRO and BSP
- Whistleblower cases can be submitted anonymously
- CCO can review, assign, and resolve cases
- DPO automatically notified on new cases
- Conduct-risk dashboard aggregates data across domains

---

## Phase 5A: Reports & Analytics Hub
**Dependencies:** Phase 3B, Phase 3C, Phase 3D

**Description:**
Build the operational reports hub (BRD Screen #9 for reports, Section 11 for regulatory reports) and ad-hoc report builder. Includes all BRD regulatory reports: BSP FRP Trust Schedules, UITF NAVpu, IMA Quarterly, STR, CTR, FATCA, CRS, WHT, ORE. Follow PS-WMS `/Users/n15318/PS-WMS/apps/ops/src/pages/reports.tsx` and `/Users/n15318/PS-WMS/apps/ops/src/pages/report-builder.tsx`.

**Tasks:**
1. **Report generator service** — Create `server/services/report-generator-service.ts` with generators for all BRD 11.2 regulatory reports. Each report: query data, format to required schema, generate output (PDF/CSV/XML as required by regulator).
2. **Report routes** — Create `server/routes/back-office/reports.ts` with: catalogue endpoint, per-report generation, download, scheduling.
3. **Reports hub page** — Create `apps/back-office/src/pages/reports.tsx`: left sidebar report catalogue organized by regulator (BSP, SEC, IC, BIR, AMLC), right panel with date range picker, summary cards, data table, CSV/PDF export. Follow PS-WMS pattern.
4. **Ad-hoc report builder** — Create `apps/back-office/src/pages/report-builder.tsx`: table selector (whitelisted), column picker, filter builder, sort config, run query, results table, CSV export, save/load templates. Follow `/Users/n15318/PS-WMS/apps/ops/src/pages/report-builder.tsx`.
5. **Data quality dashboard** — Create `apps/back-office/src/pages/data-quality.tsx` following `/Users/n15318/PS-WMS/apps/ops/src/pages/data-quality.tsx`: overall quality score, domain scores (Clients, Portfolios, Positions, Prices, Transactions, Securities), run quality checks, issues table with drill-down.

**Files to create/modify:**
- `server/services/report-generator-service.ts`
- `server/routes/back-office/reports.ts`
- `apps/back-office/src/pages/reports.tsx`
- `apps/back-office/src/pages/report-builder.tsx`
- `apps/back-office/src/pages/data-quality.tsx`

**Acceptance criteria:**
- All BRD 11.2 regulatory reports generate correctly
- Reports downloadable in required formats (PDF/CSV/XML)
- Report catalogue organized by regulator
- Ad-hoc report builder executes whitelisted queries only
- Data quality dashboard shows scores across 6 domains
- 100% of regulatory reports filed on time (BRD KPI)

---

## Phase 5B: Executive Dashboard & Operations Control Tower
**Dependencies:** Phase 3B, Phase 5A

**Description:**
Build the executive dashboard (BRD Screen #9) and operations control tower (BRD Screen #8). These are aggregate views for Trust Business Head, CRO, and ops leadership.

**Tasks:**
1. **Executive dashboard service** — Create `server/services/executive-dashboard-service.ts` with: `getAumSummary()` (total AUM, by product type, by branch, trend), `getRevenueSummary()` (fees, commissions, by product), `getRiskSummary()` (mandate breaches, compliance score, ORE count), `getRegulatoryFilingStatus()`.
2. **Executive routes** — Create `server/routes/executive.ts`.
3. **Executive dashboard page** — Create `apps/back-office/src/pages/executive-dashboard.tsx` (BRD Screen #9): AUM card with trend chart, revenue card with breakdown, risk summary, regulatory filing status (green/red), top clients by AUM, product distribution pie chart.
4. **Operations control tower page** — Create `apps/back-office/src/pages/operations-control-tower.tsx` (BRD Screen #8): system-wide SLA heat-map (by service: orders, settlement, NAV, reporting), STP rate gauge (target ≥ 92%), incidents panel, EOD status, reconciliation breaks summary.
5. **Admin console page** — Create `apps/back-office/src/pages/admin-console.tsx` (BRD Screen #13): user management (CRUD with role assignment), notification template management, feature flags, system configuration.

**Files to create/modify:**
- `server/services/executive-dashboard-service.ts`
- `server/routes/executive.ts`
- `apps/back-office/src/pages/executive-dashboard.tsx`
- `apps/back-office/src/pages/operations-control-tower.tsx`
- `apps/back-office/src/pages/admin-console.tsx`

**Acceptance criteria:**
- Executive dashboard shows accurate AUM, revenue, risk metrics
- Operations control tower shows SLA compliance across all services
- STP rate gauge displays current rate against 92% target
- Admin console allows user/role management with proper authorization
- All dashboards auto-refresh at appropriate intervals

---

## Phase 5C: Client Self-Service Portal
**Dependencies:** Phase 1B, Phase 3A

**Description:**
Build the client self-service portal (BRD Screens #10 and #11): portfolio view, allocation breakdown, performance charts, statement download, messaging, preferences. Clients can view but not directly transact — they can only "request" actions.

**Tasks:**
1. **Client portal service** — Create `server/services/client-portal-service.ts` with: `getPortfolioSummary(clientId)`, `getAllocation(portfolioId)`, `getPerformance(portfolioId, period)` (TWR, IRR), `getStatements(clientId, period)`, `requestAction(clientId, actionType, details)` (request-only per BRD 3.3), `getNotifications(clientId)`, `updatePreferences(clientId, prefs)`.
2. **Client portal routes** — Create `server/routes/client-portal.ts`.
3. **Client portal layout** — Create `apps/client-portal/src/components/layout/ClientPortalLayout.tsx` with: modern, clean design, mobile-first (360px min per BRD), biometric login support.
4. **Client portal pages** — Create: `dashboard.tsx` (portfolio snapshot, allocation pie, performance line chart, recent transactions), `portfolio.tsx` (detailed holdings, security-level P&L), `performance.tsx` (TWR, IRR, benchmark comparison, attribution), `statements.tsx` (downloadable PDF statements), `messages.tsx` (secure messaging with RM), `preferences.tsx` (notification channels, communication language), `request-action.tsx` (contribution/withdrawal/transfer request form).
5. **Client portal router** — Create `apps/client-portal/src/routes/index.tsx`.

**Files to create/modify:**
- `server/services/client-portal-service.ts`
- `server/routes/client-portal.ts`
- `apps/client-portal/src/components/layout/ClientPortalLayout.tsx`
- `apps/client-portal/src/config/navigation.ts`
- `apps/client-portal/src/routes/index.tsx`
- `apps/client-portal/src/pages/dashboard.tsx`, `portfolio.tsx`, `performance.tsx`, `statements.tsx`, `messages.tsx`, `preferences.tsx`, `request-action.tsx`

**Acceptance criteria:**
- Client can log in and see own portfolio only (RLS enforced)
- Allocation breakdown shows accurate asset distribution
- Performance shows TWR and IRR with benchmark
- Statements are downloadable as PDF
- Action requests are created (not direct transactions)
- Mobile-responsive design works at 360px width
- Client cannot create/modify/cancel transactions directly (BRD 3.3)
- Client portal adoption target: ≥ 70% of eligible clients (BRD KPI)
- [Gap #7] Cross-channel order portability: orders from branch visible on portal and vice versa
- [Gap #7] Branch search by CIF No. or Account Name
- [Gap #7] Branch visibility rules: users see only their branch's clients
- [Gap #7] Branch quick-view dashboard: IMA/TA maturities due today, Trust advisories
- [Gap #7] Client dashboard personalisation: hide/unhide widgets
- [Gap #7] COP/DS download in PDF, read-only CSV, and Excel formats
- [Gap #7] Client restricted-account view: show only outstanding accounts for redemption

---

## Phase 5D: Notification System
**Dependencies:** Phase 1B

**Description:**
Implement the full notification system (BRD Section 10): in-app, email, SMS, push channels with delivery SLA, consent management, and opt-out controls. All BRD 10.1 notification events are wired.

**Tasks:**
1. **Notification service (full)** — Enhance `server/services/notification-service.ts` with: multi-channel dispatch (in-app ≤ 2s, push ≤ 10s, email ≤ 5min, SMS ≤ 30s per BRD 10.2), template resolution (bank brand, responsive HTML email, SMS ≤ 160 chars no PII), retry logic (3× retry + DLQ after 24h), consent check before dispatch (regulatory notifications cannot opt out per BRD 10.4).
2. **Notification routes** — Create `server/routes/notifications.ts` with: `GET /api/v1/notifications` (user's notifications), `PUT /api/v1/notifications/:id/read`, `GET /api/v1/notifications/preferences`, `PUT /api/v1/notifications/preferences`.
3. **In-app notification component** — Create `packages/ui/src/components/notification-bell.tsx`: bell icon with unread count badge, dropdown panel with notification list, mark-as-read on click. Used in all app layouts.
4. **Wire all BRD 10.1 events** — Connect notification dispatch to all order lifecycle events, settlement events, mandate breaches, KYC reminders, corporate actions, kill-switch, whistleblower, BSP reports.

**Files to create/modify:**
- `server/services/notification-service.ts` (enhance)
- `server/routes/notifications.ts`
- `packages/ui/src/components/notification-bell.tsx`
- Update all relevant services to emit notification events

**Acceptance criteria:**
- In-app notifications appear within 2s of event
- Email sends within 5 minutes E2E
- SMS contains no PII and is ≤ 160 chars
- Consent check prevents dispatch for opted-out channels
- Regulatory notifications cannot be opted out
- Retry logic works (3× retry, DLQ after 24h)
- Notification preferences can be set per channel

---

## Phase 6A: Integration Hub & External Connectors
**Dependencies:** Phase 3A

**Description:**
Build the integration hub (following PS-WMS `/Users/n15318/PS-WMS/apps/ops/src/pages/integrations.tsx`) with connector stubs for all BRD 7.1 external systems. This establishes the integration framework — actual live connections are configured during deployment.

**Tasks:**
1. **Integration service** — Create `server/services/integration-service.ts` with: connector registry (Finacle, Bloomberg, Refinitiv, PDEx, PSE EDGE, SWIFT, PhilPaSS, BSP eFRS, AMLC goAML, BIR IDES, Sanctions vendor), health check per connector, routing rules for order flow, activity logging.
2. **Integration routes** — Create `server/routes/back-office/integrations.ts`.
3. **Integration hub page** — Create `apps/back-office/src/pages/integration-hub.tsx` (following PS-WMS pattern): connector cards with status/success-rate/test-connection, routing rules table, activity log, order simulation form.

**Files to create/modify:**
- `server/services/integration-service.ts`
- `server/routes/back-office/integrations.ts`
- `apps/back-office/src/pages/integration-hub.tsx`

**Acceptance criteria:**
- All 11 BRD external system connectors are registered with health check stubs
- Connector status shows on dashboard (healthy/degraded/down)
- Routing rules can be configured per connector
- Activity log captures all integration events
- Order simulation allows dry-run of routing logic

---

## Phase 6B: Blue Ocean — What-If Scenario Engine & ESG
**Dependencies:** Phase 1B, Phase 2C

**Description:**
Implement the what-if scenario engine (pre-trade impact analysis on portfolio and mandate compliance) and ESG scoring integration. These are differentiating features beyond the BRD.

**Tasks:**
1. **Scenario engine service** — Create `server/services/scenario-engine-service.ts` with: `analyzeImpact(portfolioId, proposedOrder)` → returns: post-trade allocation, mandate compliance status, concentration impact, sector exposure change, performance attribution estimate, tax impact estimate. No actual order created — simulation only.
2. **ESG service** — Create `server/services/esg-service.ts` with: `getESGScore(securityId)` (mock data initially), `getPortfolioESG(portfolioId)` → weighted average ESG score, `getESGBreakdown(portfolioId)` → E/S/G component scores, carbon intensity.
3. **What-if page** — Create `apps/front-office/src/pages/what-if-scenario.tsx`: order simulation form, impact visualization (before/after allocation charts, mandate compliance heatmap, tax preview).
4. **ESG dashboard** — Add ESG scores to portfolio views across all apps.

**Files to create/modify:**
- `server/services/scenario-engine-service.ts`
- `server/services/esg-service.ts`
- `apps/front-office/src/pages/what-if-scenario.tsx`

**Acceptance criteria:**
- What-if analysis shows accurate post-trade impact without creating actual orders
- Mandate compliance preview identifies potential breaches
- ESG scores display for securities and portfolios
- Portfolio ESG is correctly weighted by position

---

## Phase 6C: Blue Ocean — AI Suitability & Intelligent Routing
**Dependencies:** Phase 1A, Phase 2A

**Description:**
Implement AI-powered suitability engine (beyond questionnaire-based, using ML on historical data) and intelligent order routing (smart broker selection based on execution quality). These are BRD Phase 3 features (FR-AID-001 through FR-AID-003) plus blue ocean enhancements.

**Tasks:**
1. **AI suitability service** — Create `server/services/ai-suitability-service.ts` with: `predictRiskProfile(clientFeatures)` → ML-enhanced risk scoring using demographic, financial, and behavioral features (not just questionnaire), `explainPrediction(predictionId)` → human-readable explanation, `shadowMode(clientId)` → compare AI prediction with questionnaire result for validation.
2. **Intelligent routing service** — Create `server/services/intelligent-routing-service.ts` with: `recommendBroker(securityId, quantity, side)` → ranked broker list with scores (historical fill rate, average slippage, commission, latency), `analyzeExecutionQuality(brokerId, period)` → execution analytics.
3. **AI model governance** — Create audit trail for all AI recommendations per BSP Circular 1108.
4. **AI dashboard** — Add AI shadow mode and cost tracking dashboards to back-office.

**Files to create/modify:**
- `server/services/ai-suitability-service.ts`
- `server/services/intelligent-routing-service.ts`
- `apps/back-office/src/pages/ai-shadow-mode.tsx`
- `apps/back-office/src/pages/ai-costs.tsx`

**Acceptance criteria:**
- AI suitability provides risk profile prediction with explanation
- Shadow mode compares AI vs questionnaire results without affecting production
- Intelligent routing recommends brokers with execution quality scores
- Human-in-the-loop: all AI recommendations require human disposition
- Model governance audit trail captures all AI decisions per BSP 1108

---

## Phase 6D: Blue Ocean — Real-time Dashboards & Collaborative Workspaces
**Dependencies:** Phase 5B

**Description:**
Implement WebSocket-driven real-time AUM dashboards and collaborative workspaces for committee decisions (6-eyes authorization). These leverage Supabase Realtime for live data updates.

**Tasks:**
1. **Real-time subscription service** — Create `server/services/realtime-service.ts` with: Supabase Realtime channel management for position changes, NAV updates, order status transitions, settlement events.
2. **Real-time AUM dashboard** — Enhance executive dashboard with live AUM updates (no polling — WebSocket push on position/price changes).
3. **Collaborative workspace** — Create `apps/front-office/src/pages/committee-workspace.tsx`: shared view for 6-eyes authorization showing order details, suitability report, mandate compliance, risk analysis — all participants see the same real-time view with presence indicators, chat, and vote/approve buttons.
4. **Live order board** — Enhance trader cockpit with real-time order status updates via Supabase Realtime.

**Files to create/modify:**
- `server/services/realtime-service.ts`
- `apps/back-office/src/pages/executive-dashboard.tsx` (enhance with real-time)
- `apps/front-office/src/pages/committee-workspace.tsx`
- `apps/front-office/src/pages/trader-cockpit.tsx` (enhance with real-time)

**Acceptance criteria:**
- AUM dashboard updates within 2 seconds of position/price change
- Committee workspace shows all participants' presence
- 6-eyes votes are captured in real-time with audit trail
- Trader cockpit reflects order fills without manual refresh

---

## Phase 7: Integration Testing & Go-Live Readiness
**Dependencies:** Phase 0E, Phase 0F, Phase 1A, Phase 1B, Phase 1C, Phase 2A, Phase 2B, Phase 2C, Phase 3A, Phase 3B, Phase 3C, Phase 3D, Phase 3E, Phase 3F, Phase 4A, Phase 4B, Phase 4C, Phase 5A, Phase 5B, Phase 5C, Phase 5D, Phase 6A

**Description:**
Final integration testing, cross-cutting validation, performance testing, security verification, and go-live readiness per BRD Section 12. This phase ensures the complete system works end-to-end.

**Tasks:**
1. **End-to-end order lifecycle test** — Verify complete flow: Client onboarding → KYC → Suitability → Order capture → Authorization (2/4/6-eyes) → Aggregation → Placement → Fill → Confirmation → Settlement → Cash posting → Position update → NAV recompute → Statement generation.
2. **Cross-office integration test** — Verify handoffs: Front-office order → Mid-office confirmation → Back-office settlement work seamlessly across all three apps.
3. **Maker-checker comprehensive test** — Verify all entity types have working approval workflows with correct tiers.
4. **Audit trail integrity test** — Verify hash chain integrity across all entity types; attempt tampering to confirm detection.
5. **Regulatory report validation** — Generate all BRD 11.2 regulatory reports and validate formats against BSP/SEC/BIR/AMLC requirements.
6. **Performance test** — Run load tests: 2500 orders/hour sustained, 10000/day, 1200 concurrent users (BRD 8.1). Verify P95 latencies: order capture ≤ 800ms, checker queue render ≤ 2s, dashboard refresh ≤ 2s.
7. **Security test** — Verify: RBAC enforcement (23 roles), no self-approval, no cross-tenant data leakage, PII masking, audit log immutability, session timeout, MFA enforcement.
8. **Compliance rules test** — Verify: restricted list blocks orders, policy limits trigger breaches, suitability check gates authorization, mandate compliance checks fire correctly.
9. **Kill-switch test** — Invoke kill-switch, verify all orders halted in scope, verify resume requires dual approval.
10. **Build and deployment verification** — All apps build, all tests pass, Docker images build, health checks pass.

**Files to create/modify:**
- `tests/e2e/order-lifecycle.spec.ts`
- `tests/e2e/cross-office-integration.spec.ts`
- `tests/e2e/maker-checker.spec.ts`
- `tests/e2e/audit-trail.spec.ts`
- `tests/e2e/regulatory-reports.spec.ts`
- `tests/performance/load-test.k6.ts`
- `tests/security/rbac-test.spec.ts`

**Acceptance criteria:**
- Complete order lifecycle executes end-to-end without manual intervention
- All 23 roles can access only their authorized functions
- Audit hash chain verifies correctly for 1000+ records
- All regulatory reports generate in correct format
- Performance: 2500 orders/hour with ≤ 800ms P95 latency
- Security: no RBAC bypass, no PII leakage, no self-approval
- Zero Sev-1 bugs, ≤ 3 Sev-2 with workaround, ≤ 25 Sev-3 (BRD 12.9 UAT exit criteria)
- All builds pass, all apps start successfully

---

---

## Run Schedule

Phases are grouped into execution runs. Each run is executed using `/phase-executor` with parallel agents where phases are independent.

| Run | Phases | Description | Status |
|-----|--------|-------------|--------|
| **Run 1** | 0A, 0B, 0C, 0D | Foundation: monorepo, schema, CRUD framework, layout | ✅ Complete |
| **Run 2** | 0E, 0F | Reference data, approvals, audit dashboard | ✅ Complete |
| **Run 3** | 0G, 1A, 1B | Schema expansion (gap tables) + Client onboarding/KYC + Order capture (with Gap #1 & #2) | Pending |
| **Run 4** | 1C, 2A | RM cockpit + Aggregation/placement (with Gap #3) | Pending |
| **Run 5** | 2B, 2C | Confirmation/matching + Fund accounting/NAV | Pending |
| **Run 6** | 3A, 3B | Settlement (with Gap #8) + EOD/reconciliation | Pending |
| **Run 7** | 3C, 3D, 3E, 3F | Corp actions, tax, reversals, transfers | Pending |
| **Run 8** | 3G, 3H, 3I, 3J | **Gap phases**: Pre-trade compliance, portfolio modeling, PERA, risk analytics | Pending |
| **Run 9** | 4A, 4B, 4C | Compliance workbench, surveillance, ORE/whistleblower | Pending |
| **Run 10** | 5A, 5B, 5C (with Gap #7), 5D | Reports, dashboards, client portal (with branch/channel), notifications | Pending |
| **Run 11** | 6A, 6B, 6C, 6D | Integration hub, blue ocean features | Pending |
| **Run 12** | Phase 7 | Integration testing & go-live readiness | Pending |

### BDO RFI Gap Coverage by Run

| Gap # | Theme | Severity | Covered In |
|-------|-------|----------|------------|
| 1 | Order-Type & Time-in-Force | High | Run 3 (Phase 1B) |
| 2 | Order Maintenance / Lifecycle | High | Run 3 (Phase 1B) |
| 3 | Execution, Allocation & Fill | High | Run 4 (Phase 2A) |
| 4 | Pre/Post-Trade Compliance Engine | High | Run 8 (Phase 3G) |
| 5 | Portfolio Modeling & Rebalancing | **Critical** | Run 8 (Phase 3H) |
| 6 | Risk Analytics (VAR, Duration) | Medium | Run 8 (Phase 3J) |
| 7 | Channel, Branch & Client Portal | Medium | Run 10 (Phase 5C) |
| 8 | Cash, Payment & Settlement | Medium | Run 6 (Phase 3A) |
| 9 | Scheduled Plans & PERA | **Critical** | Run 8 (Phase 3I) |

---

*End of Plan*
