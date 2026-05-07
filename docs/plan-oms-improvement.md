# Development Plan: OMS Improvement Modernization

## Overview

This plan turns the revised `OMS improvement BRD.md` into an execution path for Danamon OEMS. The first objective is not broad UI modernization; it is proving the minimum trustworthy order spine through an ODA-first slice: active product/security reference, product-specific capture, source evidence, deterministic validation, workflow queue, audit event, and outbox event.

## Assumptions

- Existing Danamon OEMS functionality must remain backward compatible while new controls are introduced behind feature flags.
- The first executable product slice is ODA because the existing backend and tests are strongest there.
- External systems remain simulated locally, but production-facing adapter certification and mock-mode gates must be represented in data and tests.
- Full control tower analytics, all product-family tickets, and fee/tax/calendar engines are later phases after the foundation is reliable.
- Phase execution should start with Phase 1 only unless the user explicitly approves broader implementation.

## Codebase Findings

- `packages/shared/src/schema.ts` - Existing OEMS schema already contains products, orders, validation findings, documents, digital verification, ODA recommendations, integration adapters, approval workflows, and approval queues.
- `server/services/oems-service.ts` - Most OEMS domain methods live in one service. `createOrder`, `validateOrder`, `submitOrder`, `createOdaRecommendation`, approval queue, documents, verification, integrations, ODA, MLD, MF/Bond, FX Today, and lending are already implemented.
- `server/services/oems-service.ts` - `updateOrderWithTransition` and `recordOrderStatusTransition` exist, but approval queue decision updates order status directly and should be routed through the same transition discipline.
- `server/services/oems-service.ts` and `server/routes/oems.ts` - A search for `db.transaction` returned no OEMS service/route matches, so multi-table workflows need a transaction helper pattern.
- `apps/back-office/src/pages/oems-order-wizard.tsx` - The generic wizard is the current production-like order capture surface and is too thin for product-specific tickets.
- `apps/back-office/src/pages/oems-product-setup-oda.tsx` - ODA setup already captures many required product rules and can feed the ODA-first proof slice.
- `tests/e2e/danamon-oems.spec.ts` - Existing tests verify service surface, ODA calculations/prechecks, durable command paths, route registration, and source strings.
- `tests/e2e/oems-deaggregation-allocation.spec.ts` - Existing ODA allocation/deaggregation tests should remain green.
- `drizzle/20260504_add_danamon_oems.sql` and `drizzle/20260505_extend_oems_product_setup_and_order_mgmt.sql` - OEMS migrations use additive table/column creation and idempotent `IF NOT EXISTS` patterns.

## Architecture Decisions

- **Foundation Before Breadth**: Build shared controls first and prove them with ODA before migrating MLD, FX Today, MF/Bond, or Wealth Lending.
- **Additive Schema**: Add new target tables and compatibility references without deleting existing OEMS columns or routes.
- **Feature Flags For Cutover**: Product-specific ticket creation is enabled per product family and role; generic wizard remains fallback until cutover.
- **Policy-To-Rule Traceability**: Production rules require certified traceability records before they can authorize or block production orders.
- **Source Evidence Is First-Class**: Source statuses must be explicit records, not ad hoc payload fields.
- **Workflow Engine As Gatekeeper**: New approval/status paths use workflow transition helpers and write status transition, queue, audit, and outbox evidence.
- **Negative-Path Led Testing**: Missing product, inactive product, family mismatch, source stale/pending, cutoff breach, maker self-approval, and transaction rollback are first-class tests.

## Dependency Graph

```text
Phase 1: Foundation Schema & Contracts
        |
        v
Phase 2: Foundation Services & Validation
        |
        v
Phase 3: ODA Ticket API & Workflow Proof
        |
        v
Phase 4: ODA UI Proof Slice
        |
        v
Phase 5: Migration, Release Gates & Operability
        |
        v
Phase 6: Product Family Expansion
        |
        v
Phase 7: Integration, Regression & Deployment Verification
```

## Conventions

- Use Drizzle schema patterns already present in `packages/shared/src/schema.ts`.
- Use additive migrations with `IF NOT EXISTS` and no destructive table rewrites.
- Keep legacy routes operational while adding new routes under `/api/v1/oems`.
- Use existing `serviceRoute`, `actor(req)`, and role guard patterns in `server/routes/oems.ts`.
- Use `updateOrderWithTransition` or its successor for order status changes.
- Keep UI consistent with existing React, Tailwind, shadcn/ui, Radix, lucide, TanStack Query patterns.
- Keep tests close to the changed behavior and run `npm run test:run -- tests/e2e/danamon-oems.spec.ts tests/e2e/oems-deaggregation-allocation.spec.ts` after each phase touching OEMS.

---

## Phase 1: Foundation Schema, Contracts, And BRD Traceability

**Dependencies:** none

**Description:**
Create the minimum trustworthy order data foundation without changing existing production behavior. This phase adds schema/migration scaffolding and service/API contracts for product security, policy-rule traceability, source evidence, outbox, audit events, and feature flags.

**Tasks:**
1. Add Drizzle schema tables in `packages/shared/src/schema.ts` for:
   - `oemsProductSecurityMaster`
   - `oemsPolicyRuleTraceability`
   - `oemsProductOrderTickets`
   - `oemsSourceSystemEvidence`
   - `oemsOutboxEvents`
   - `oemsAuditEvents`
   - `oemsFeatureFlags` if no suitable existing config feature flag table is available.
2. Add migration `drizzle/20260506_add_oems_minimum_trustworthy_order.sql` with idempotent enum/table/index creation and legacy product mapping columns where needed.
3. Add TypeScript helper types and normalization functions in `server/services/oems-service.ts` for:
   - Source evidence statuses.
   - Policy traceability certification statuses.
   - Product security status.
   - Feature flag lookup fallback.
4. Add service method stubs with real validation but minimal persistence where possible:
   - `createProductSecurityMaster`
   - `listProductSecurityMaster`
   - `createPolicyRuleTraceability`
   - `recordSourceSystemEvidence`
   - `recordOemsAuditEvent`
   - `enqueueOemsOutboxEvent`
   - `isOemsFeatureEnabled`
5. Add route registration under `server/routes/oems.ts` for foundation endpoints needed by tests.
6. Add tests in `tests/e2e/danamon-oems.spec.ts` proving:
   - New methods are exported.
   - Routes are registered.
   - Migration contains required tables, indexes, and rollback-safe additive statements.
   - Source evidence accepts only known statuses.
   - Policy traceability blocks production certification without required fields.

**Files to create/modify:**
- `packages/shared/src/schema.ts` - Add target tables/enums.
- `drizzle/20260506_add_oems_minimum_trustworthy_order.sql` - Additive migration.
- `server/services/oems-service.ts` - Foundation method stubs and helpers.
- `server/routes/oems.ts` - Foundation API route registration.
- `tests/e2e/danamon-oems.spec.ts` - Service surface, route, migration, and helper tests.
- `docs/OMS improvement BRD.md` - Already updated; keep as traceability source.

**Acceptance criteria:**
- Existing Danamon OEMS tests still pass.
- New foundation tables are represented in schema and migration.
- No existing OEMS route or service method is removed.
- New source evidence and policy traceability helpers reject invalid states.
- Phase 1 does not change generic wizard behavior.

---

## Phase 2: Foundation Services, Validation Spine, And Workflow Discipline

**Dependencies:** Phase 1

**Description:**
Implement the shared service behavior that future product tickets use: active product/security enforcement, policy-to-rule checks, source evidence-aware validation decisions, workflow transition discipline, audit event writes, and outbox event enqueueing.

**Tasks:**
1. Implement active product/security lookup and compatibility validation:
   - Product family match.
   - Active status.
   - Effective dates.
   - Optional mapping from legacy `oemsProducts.id` to target `security_id`.
2. Implement policy traceability certification checks for production rules.
3. Add validation helper to classify source evidence as AVAILABLE, STALE, FAILED, PENDING, CONFLICT, or DEGRADED_APPROVED.
4. Add a transaction helper pattern for OEMS multi-table service operations.
5. Refactor approval queue decision path so order status updates use order transition recording.
6. Add shared audit/outbox writes for new workflow-driven status changes.
7. Add tests for missing active product, inactive product, family mismatch, missing traceability, source pending, source stale, maker self-approval, and outbox idempotency.

**Files to create/modify:**
- `server/services/oems-service.ts` - Implement shared validation/workflow/audit/outbox behavior.
- `tests/e2e/danamon-oems.spec.ts` - Negative-path and workflow discipline tests.
- `server/routes/oems.ts` - Add or adjust validation/workflow endpoints if needed.

**Acceptance criteria:**
- Missing or inactive product/security blocks new production-intent ticket validation.
- Approval decisions write status transition evidence.
- Source evidence PENDING/STALE/FAILED produces deterministic validation result.
- Outbox idempotency prevents duplicate events for same aggregate/action.
- Existing ODA, MLD, FX, MF/Bond, lending tests remain green.

---

## Phase 3: ODA Ticket API And Workflow Proof

**Dependencies:** Phase 2

**Description:**
Build the ODA-first proof slice using the minimum trustworthy order spine. This phase adds structured ODA ticket creation, validation, submit, queue, audit, and outbox behavior behind a feature flag.

**Tasks:**
1. Add ODA ticket schema validation for required fields:
   - Active `security_id`
   - Customer and portfolio
   - Currency pair, direction, tenor, rate, effective type, value date
   - Reference/source evidence
   - Product transaction compatibility
2. Implement `createOdaOrderTicket`, `validateOdaOrderTicket`, and `submitOdaOrderTicket`.
3. Use existing ODA product setup fields for allowed transaction types, effective-date types, cutoff, eligibility, min placement, min collective, spread tolerance, and sales certification.
4. Submit creates or links an `oemsOrders` draft through existing order infrastructure while preserving ticket evidence.
5. Submit creates approval queue, status transition, audit event, and outbox event.
6. Add feature flag `OEMS_ODA_TICKET_V1`; when disabled, existing ODA flow remains unchanged.
7. Add negative-path tests for missing security, inactive security, disallowed transaction, missing source evidence, cutoff breach, incomplete capture, maker self-approval, and transaction rollback.

**Files to create/modify:**
- `server/services/oems-service.ts` - ODA ticket service methods.
- `server/routes/oems.ts` - ODA ticket routes.
- `tests/e2e/danamon-oems.spec.ts` - ODA ticket tests.
- `tests/e2e/oems-deaggregation-allocation.spec.ts` - Ensure existing ODA allocation behavior remains compatible if touched.

**Acceptance criteria:**
- ODA ticket happy path creates ticket, validates, submits, and creates queue/audit/outbox evidence.
- ODA repair path returns actionable validation findings.
- Generic ODA order creation remains available when feature flag is disabled.
- ODA feature flag enabled path blocks incomplete production-intent tickets before order submission.

---

## Phase 4: ODA UI Proof Slice

**Dependencies:** Phase 3

**Description:**
Add a dedicated ODA ticket UI that proves product-specific capture without replacing the entire workbench. The UI should be operational and dense, showing capture completeness, source evidence, validation findings, documents, verification, queue status, and audit timeline entry points.

**Tasks:**
1. Add `apps/back-office/src/pages/oems-ticket-oda.tsx` or an ODA ticket component under existing OEMS pages.
2. Add route/navigation entry behind existing Operations/OEMS navigation.
3. Add product/security selector, customer/portfolio selector, ODA details, source evidence checklist, validation panel, and submit action bar.
4. Wire create, validate, and submit mutations to Phase 3 routes.
5. Keep `OemsOrderWizard` available as fallback but show ODA-specific launcher when feature flag is enabled.
6. Add UI tests or component-level test coverage where available; otherwise add route/source tests in existing E2E pattern.

**Files to create/modify:**
- `apps/back-office/src/pages/oems-ticket-oda.tsx` - New ODA ticket UI.
- `apps/back-office/src/routes/index.tsx` - Route registration.
- `apps/back-office/src/config/navigation.ts` - Navigation entry if appropriate.
- `apps/back-office/src/pages/oems-workbench.tsx` - ODA launcher/feature flag integration.
- `apps/back-office/src/pages/oems-order-wizard.tsx` - Optional ODA redirect/fallback messaging.
- `tests/e2e/danamon-oems.spec.ts` - Static route/source assertions if browser tests are not available.

**Acceptance criteria:**
- ODA ticket screen captures all required ODA fields.
- Missing required ODA fields are blocked before create/submit.
- Validation findings display rule code, severity, source, message, and repair hint.
- Feature flag disabled behavior remains unchanged.
- UI follows existing shadcn/Tailwind operational design patterns.

---

## Phase 5: Migration, Release Gates, And Operability

**Dependencies:** Phase 4

**Description:**
Prepare ODA for controlled rollout with migration mapping, mixed-state handling, release gates, source failure runbook, and post-launch ownership controls.

**Tasks:**
1. Add ODA migration report script or service method:
   - Existing ODA product to security mapping.
   - Unmapped/duplicate/inactive products.
   - Open ODA orders and in-flight approval/doc/verification states.
2. Add compatibility queue behavior for mixed old/new ODA state.
3. Add release gate report:
   - Active security reference.
   - Certified traceability.
   - Source evidence handling.
   - Workflow transition evidence.
   - Audit/outbox evidence.
   - Mock-mode gate status.
4. Add post-launch control ownership records or report for ODA rule owners, source owners, queue owners, and recertification due dates.
5. Document ODA cutover and rollback in `docs/runbooks/oems-oda-cutover.md`.

**Files to create/modify:**
- `server/services/oems-service.ts` - ODA migration/release gate methods.
- `server/routes/oems.ts` - Report/runbook endpoints if needed.
- `docs/runbooks/oems-oda-cutover.md` - Cutover, rollback, reconciliation, and support runbook.
- `tests/e2e/danamon-oems.spec.ts` - Migration report and release gate tests.

**Acceptance criteria:**
- ODA release gate report can pass/fail deterministically.
- ODA cutover runbook exists and references rollback and reconciliation.
- Mixed old/new state is detectable and routable to compatibility review.
- Control ownership gaps block release gate.

---

## Phase 6: Product Family Expansion

**Dependencies:** Phase 5

**Description:**
Expand the proven spine to other product families in controlled slices. Each product family gets product-specific capture, source evidence, validation, workflow, documents/verification integration, audit/outbox, and release gates.

**Tasks:**
1. Implement MLD ticket slice after ODA gate:
   - Tranche, balance evidence, callback, documents, hold, pretrade recheck, maturity lifecycle.
2. Implement FX Today ticket slice:
   - Quote TTL/hash, accounts, underlying document, Treasury SND, LHBU, confirmation, settlement.
3. Implement MF/Bond ticket slice:
   - SID/PFE/static/risk/source statuses, switch details, cherry-pick lots, pricing lock, Wealth Core handoff.
4. Implement Wealth Lending slice:
   - Facility, collateral, pricing, outstanding, M2M, cure, instructions, visibility.
5. Add fee/tax/calendar engine enhancements only where required by product slice acceptance criteria.

**Files to create/modify:**
- `server/services/oems-service.ts` - Product-specific ticket methods.
- `server/routes/oems.ts` - Product-specific ticket routes.
- `apps/back-office/src/pages/oems-ticket-mld.tsx` - MLD UI.
- `apps/back-office/src/pages/oems-ticket-fx-today.tsx` - FX UI.
- `apps/back-office/src/pages/oems-ticket-mf-bond.tsx` - MF/Bond UI.
- `apps/back-office/src/pages/oems-ticket-wealth-lending.tsx` - Lending UI.
- `tests/e2e/danamon-oems.spec.ts` - Product-specific service/route/negative tests.

**Acceptance criteria:**
- Each family passes its own minimum trustworthy order gate.
- Generic production entry is disabled per family after cutover except supervised fallback.
- Existing product-specific legacy workflows remain readable and auditable.

---

## Phase 7: Integration, Regression, And Deployment Verification

**Dependencies:** Phase 6

**Description:**
Validate the combined OEMS modernization surface, regression risk, operational readiness, and local deployment readiness.

**Tasks:**
1. Run targeted OEMS tests:
   - `npm run test:run -- tests/e2e/danamon-oems.spec.ts tests/e2e/oems-deaggregation-allocation.spec.ts`
2. Run broader TypeScript/build validation if feasible:
   - `npm run check`
   - `npm run build:all`
3. Run or update local deployment verification for the back-office app.
4. Verify migration files are additive and rollback-safe.
5. Verify security/privacy controls:
   - No unmasked sensitive source payload in UI/log evidence.
   - Maker-checker conflict enforced.
   - Production mock-mode gates represented.
6. Update final release notes and open risk register.

**Files to create/modify:**
- `docs/releases/oems-improvement-release-notes.md` - Release notes and known risks.
- `docs/runbooks/oems-operations-control-model.md` - Operating model and ownership.
- Tests and source files touched by prior phases.

**Acceptance criteria:**
- Targeted OEMS tests pass.
- Build/type checks pass or documented pre-existing blockers are isolated.
- Release notes and runbooks exist.
- Feature flags and rollback procedures are documented.
- ODA-first release gate evidence is complete before broader rollout.
