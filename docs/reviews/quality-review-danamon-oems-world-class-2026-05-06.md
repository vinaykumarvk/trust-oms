# Danamon OEMS Independent OMS Evaluation

Date: 2026-05-06
Scope: Danamon OEMS workbench, order entry, product/security setup, backend validation, workflow, document/verification, integrations, and product-specific order processes.
Reviewer stance: OMS domain expert evaluation, not limited to existing implementation.

## Executive Verdict

Danamon OEMS has a strong domain scaffold and several important banking controls already represented: ODA aggregation, MLD tranches, MF/Bond pre-trade gates, FX Today quote confirmation, document checklist rules, digital verification, risk profile validation, lending LTV monitoring, integration adapter controls, and approval queue primitives.

It is not yet a world-class OMS. The main gap is that the system behaves like a broad operational workbench with product-specific service methods, while a globally competitive OMS needs a governed product/security master, product-specific order tickets, deterministic validation/rules, formal workflow orchestration, transactional execution, certified integrations, exception queues, and complete audit-grade operator/customer journeys.

## Evidence Reviewed

- Main route/page: `apps/back-office/src/pages/oems-workbench.tsx`
- Order wizard: `apps/back-office/src/pages/oems-order-wizard.tsx`
- ODA and MLD setup pages: `apps/back-office/src/pages/oems-product-setup-oda.tsx`, `apps/back-office/src/pages/oems-product-setup-mld.tsx`
- Schema: `packages/shared/src/schema.ts`
- Service layer and routes: `server/services/oems-service.ts`, `server/routes/oems.ts`
- Tests run: `npm run test:run -- tests/e2e/danamon-oems.spec.ts tests/e2e/oems-deaggregation-allocation.spec.ts`
- Result: 2 files passed, 50 tests passed.

## Current Strengths

1. Product coverage is broad. The schema covers ODA, MLD, Mutual Fund, Bond, FX Today, and Wealth Lending product families (`packages/shared/src/schema.ts:4150`).
2. Lifecycle vocabulary exists for orders, ODA, MLD, documents, verification, integration, and lending (`packages/shared/src/schema.ts:4178`, `packages/shared/src/schema.ts:4268`, `packages/shared/src/schema.ts:4309`).
3. ODA and MLD have richer product setup than a generic order book. ODA setup captures allowed transaction types, effective-date types, cutoffs, eligibility, sales certification, and trade ideas (`apps/back-office/src/pages/oems-product-setup-oda.tsx:194`, `apps/back-office/src/pages/oems-product-setup-oda.tsx:256`, `apps/back-office/src/pages/oems-product-setup-oda.tsx:286`). MLD setup captures tranche dates, payoff terms, quota, balance validation, documents, eligibility, risk rating, suitability, cutoff, and callback flags (`apps/back-office/src/pages/oems-product-setup-mld.tsx:69`).
4. Document controls are real backend controls. Checklist generation applies product/channel/transaction rules and missing or rejected required documents block submission or execution (`server/services/oems-service.ts:3887`, `server/services/oems-service.ts:3966`).
5. Digital verification is modelled beyond a simple status flag: method, provider, TTL, max attempts, payload hash, fallback, outage, signed document and evidence are captured (`server/services/oems-service.ts:4580`).
6. Some integration hardening exists. Adapters enforce TLS, address allow-listing, masking, encryption settings, idempotency, retry metadata, and reconciliation flags (`server/services/oems-service.ts:8166`, `server/services/oems-service.ts:8358`).

## Findings And Recommendations

### 1. Product-Specific Order Capture Is Too Thin

Severity: Critical

The primary order wizard validates only customer, transaction type, amount, and a few family-specific fields (`apps/back-office/src/pages/oems-order-wizard.tsx:284`). The UI then posts a small base payload plus minimal family details (`apps/back-office/src/pages/oems-order-wizard.tsx:315`). For Mutual Fund and Bond, the UI captures only quantity for Bond (`apps/back-office/src/pages/oems-order-wizard.tsx:670`) and posts only `quantity` beyond the base payload (`apps/back-office/src/pages/oems-order-wizard.tsx:344`). The backend, however, has a much richer MF/Bond contract including SID, portfolio registration, PFE, risk profile currency, static data sync, sales certification, digital verification expiry, cherry-pick lots, switch details, auction, buyback, document refs, source statuses, quota, offering window, and performance claims (`server/services/oems-service.ts:6851`).

Impact: Operators can create orders through the main workbench without capturing the domain data that a real OMS ticket needs. This pushes missing information into backend defaults, payload JSON, or later exception handling.

Recommendation:

- Modify the generic wizard into product-specific tickets: ODA ticket, MLD subscription ticket, MF subscription/redemption/switch ticket, Bond buy/sell/switch/auction/buyback ticket, FX Today special-rate ticket, and Wealth Lending facility/instruction ticket.
- Add structured fields for source-system statuses, account identifiers, settlement accounts, investor identifiers, suitability evidence, product documents, holdings/cash checks, quote metadata, and product-specific execution instructions.
- Delete the generic catch-all order wizard as the primary production entry point. Keep it only as an internal diagnostic or fallback tool with elevated role access.
- Verify with browser or component tests that each product family can capture every backend-required field and that omitted required fields block before draft creation.

### 2. Product And Security Master Is Not Yet World-Class

Severity: Critical

The main product table is a mixed product/config table with generic fields plus ODA-specific columns and free-form `parameter_json` (`packages/shared/src/schema.ts:4358`). Orders can reference `product_id`, but `product_id` is nullable (`packages/shared/src/schema.ts:4434`). Parameter sets store critical configuration in JSON (`packages/shared/src/schema.ts:4406`).

Impact: A global OMS needs a reliable security/product master that can drive order capture, eligibility, pricing, settlement, risk, documentation, and execution. The current model is a workable feature scaffold, but it is not enough for institutional-grade product governance.

Recommendation:

- Add a governed security master with product/security identity: ISIN, issuer, instrument type, market, exchange/venue, country, currency, tenor, coupon/payoff, ratings, tax category, Sharia/ESG flags if relevant, issuer limits, concentration limits, settlement method, custodian/depository, holiday calendar, price source, valuation source, and documentation pack.
- Add versioned product eligibility and distribution rules by channel, customer segment, risk band, account type, residency, branch, currency, and effective date.
- Modify `oemsProducts` so critical fields are structured columns or child tables, not production-critical JSON.
- Delete or deprecate free-form JSON as the authority for validation-critical product rules. JSON can remain for evidence snapshots, not for primary governance.

### 3. Backend Validation Is Useful But Not Industrial-Grade

Severity: Critical

`createOrder` validates product family, channel, transaction type, positive amount, and sales-assisted branch/user data (`server/services/oems-service.ts:3037`). It does not require an active product, does not verify `product_id` belongs to the selected product family, and does not check allowed transaction types at order creation (`server/services/oems-service.ts:3066`). Product min/max checks only run if `order.product_id` is present (`server/services/oems-service.ts:3465`).

The Mutual Fund redemption holdings check only blocks when `heldAmount > 0` and requested quantity exceeds holdings (`server/services/oems-service.ts:3554`). If no holding row exists or holding amount is zero, a positive redemption quantity is not blocked by this condition.

Self-service digital verification is only a warning during validation (`server/services/oems-service.ts:3410`), while submission later routes the order to `PENDING_CUSTOMER_VERIFICATION` if verification is not ready (`server/services/oems-service.ts:3688`). This is acceptable as a staging model, but it should be explicit in a formal rule matrix.

Impact: Validation is currently hardcoded and partially conditional. A world-class OMS must explain exactly which rule fired, which source provided the data, whether the rule is hard/soft, who can override it, and what product/channel/customer scope it applies to.

Recommendation:

- Add a declarative validation/rules engine with versioned rules, rule severity, override authority, evidence source, expiry, source-system SLA, and product/channel/customer applicability.
- Require active product/security selection for all orderable product families, except explicitly approved manual fallback orders.
- Enforce product family, product active status, transaction type, account eligibility, minimum/maximum, quota, cash, holdings, suitability, sanctions/AML, KYC, document, verification, cutoff, holiday calendar, settlement, tax, and duplicate rules through one policy layer.
- Fix the MF redemption logic so missing or zero holdings blocks redemption unless a covered exception is approved.
- Add negative-path tests for product mismatch, inactive product, missing product, zero holdings redemption, expired risk profile, missing source statuses, stale price, expired quote, missing document, and cutoff breach.

### 4. Workflow State Is Broad But Not Governed By One Orchestrator

Severity: High

The order status enum is broad (`packages/shared/src/schema.ts:4178`), and `submitOrder` transitions orders to documents, customer verification, or approval status (`server/services/oems-service.ts:3653`). Approval queue primitives exist and can block maker self-approval (`server/services/oems-service.ts:8600`, `server/services/oems-service.ts:8675`). However, `submitOrder` only queues a notification after status update (`server/services/oems-service.ts:3709`); it does not visibly enqueue an approval queue item. Approval decisions update order status directly without recording an order status transition (`server/services/oems-service.ts:8708`).

A repository search for `db.transaction` in `server/services/oems-service.ts` and `server/routes/oems.ts` returned no matches, even though flows such as MLD order creation insert an order, insert detail, issue a fund instruction, and update tranche booked amount (`server/services/oems-service.ts:6136`, `server/services/oems-service.ts:6161`, `server/services/oems-service.ts:6183`, `server/services/oems-service.ts:6193`).

Impact: Multi-step product workflows can leave partial state if one write succeeds and a later write fails. Approval and status history can diverge.

Recommendation:

- Add a central workflow engine/state machine with allowed transitions by product, current status, role, source event, and blocking conditions.
- Wrap multi-table product workflows in database transactions.
- Add an outbox pattern for integration messages and notifications so external side effects are consistent with committed state.
- Modify approval decisions to use the same `updateOrderWithTransition` path as other order status changes.
- Automatically enqueue approval queue items from `submitOrder` based on workflow definition, product family, transaction type, amount, channel, and exception flags.

### 5. Product-Specific Processes Need To Be Made Complete

Severity: High

ODA is the strongest process, with prechecks, cutoff checks, recommendation lifecycle, fund hold, collection, treasury update, FP8007 sync, and deaggregation/allocation tests (`server/services/oems-service.ts:5035`, `server/services/oems-service.ts:5116`). But configured ODA product rules such as allowed transaction types, effective-date types, and eligible account codes need to be consistently enforced in the generic order validation path, not only captured in setup UI.

MLD has tranche workflow and pretrade recheck, but tranche date validation currently enforces exact equality for trade/value and fixing/maturity dates with confusing messages (`server/services/oems-service.ts:6010`). A real MLD product should support governed date ordering and product-specific calendars, not hard equality unless the product definition explicitly requires it.

MF/Bond has meaningful pre-trade checks in the backend (`server/services/oems-service.ts:6930`), but the primary UI does not capture enough fields to use them correctly. It also defaults several source statuses toward ready states when booleans/statuses are omitted (`server/services/oems-service.ts:6891`), which is risky for production order entry.

FX Today captures countdown-bound quote confirmation, hash, source status, underlying document threshold, Treasury request, SND approval, LHBU purpose code, overbook, blotter, and confirmation notice (`server/services/oems-service.ts:7163`, `server/services/oems-service.ts:7321`, `server/services/oems-service.ts:7372`, `server/services/oems-service.ts:7398`). The UI should capture debit/credit accounts, purpose code, source statuses, underlying document, quote source, TTL, and manual fallback reason directly in the order journey.

Wealth Lending has facility, collateral, market price retrieval, outstanding retrieval, M2M, margin call, overdraft block, visibility, cure, and collateral sale flows (`server/services/oems-service.ts:7490`, `server/services/oems-service.ts:7635`, `server/services/oems-service.ts:7745`, `server/services/oems-service.ts:7800`). The generic order wizard's Wealth Lending fields (`apps/back-office/src/pages/oems-order-wizard.tsx:706`) do not reflect the facility/collateral/instruction lifecycle.

Recommendation:

- Modify each product family into a guided lifecycle with required preconditions, source checks, approvals, customer actions, settlement actions, and exception states.
- Add product-specific dashboards: ODA collection and allocation, MLD tranche book and callback queue, MF/Bond Wealth Core handoff queue, FX quote confirmation and settlement queue, Wealth Lending LTV/cure queue.
- Delete default-ready behavior for source-system validations where absence of evidence should mean pending or unavailable.

### 6. Charge, Tax, Settlement, And Calendar Logic Is Too Simplistic

Severity: High

Charge calculation uses simple defaults and product parameter JSON (`server/services/oems-service.ts:3213`). Mutual Fund fees default to static percentages (`server/services/oems-service.ts:3246`). Bond charges include a hard-coded “PHP” documentary stamp tax comment and formula (`server/services/oems-service.ts:3287`), while the Danamon flow defaults currency to IDR (`server/services/oems-service.ts:3211`). Settlement dates are computed by adding calendar days for T+0/T+1/T+2/T+3 (`server/services/oems-service.ts:3320`).

Impact: This is not adequate for a globally competitive OMS. Fees, taxes, and settlement must be governed by market, product, channel, customer classification, trade venue, holiday calendar, and effective date.

Recommendation:

- Add a fee/tax schedule engine with versioned rules, waivers, caps/floors, trailer fees, VAT/WHT/capital-gain regimes where applicable, and product-specific tax reporting.
- Add business-day calendar services for trade date, value date, settlement date, maturity date, cutoff repair, and holiday exceptions.
- Delete hardcoded jurisdiction-specific tax formulas from the generic order charge engine.

### 7. Documents And Digital Verification Are Strong In Backend But Disconnected In UX

Severity: Medium

The order wizard shows Upload/Renew/View buttons for document requirements but does not wire them to document upload, signing, DMS registration, NCBS registration, or retry actions (`apps/back-office/src/pages/oems-order-wizard.tsx:901`). Digital verification is managed on a separate workbench tab with JSON payload/evidence textareas (`apps/back-office/src/pages/oems-workbench.tsx:3162`).

Impact: Operators must leave the order flow to complete core customer/document steps. In production this increases abandonment, manual errors, and reconciliation burden.

Recommendation:

- Add inline document capture, e-form generation, upload, e-sign, DMS/NCBS registration, retry, and waiver approval inside the order journey.
- Add inline customer verification issuance, resend, expiry, fallback, manual verification approval, and signed-document retrieval.
- Replace JSON textareas with structured controls and evidence upload panels.
- Preserve JSON as audit payload, not as the operator input surface.

### 8. Integration Layer Needs Production Certification And Reconciliation Closure

Severity: High

Adapters default to `mock_mode` true and `UNCERTIFIED` unless configured otherwise (`server/services/oems-service.ts:8222`). Execution returns `ACKNOWLEDGED` in mock mode or `QUEUED` otherwise (`server/services/oems-service.ts:8402`). This is good for controlled development, but a world-class OMS requires certified live interfaces, conformance testing, idempotent replay, reconciliation, and dead-letter closure.

Recommendation:

- Add certification gates that block production activation unless contract schema, transformation, idempotency key, security policy, reconciliation rule, alert owner, retry policy, and runbook are approved.
- Add dead-letter queues, retry exhaustion workflows, replay tooling, and reconciliation break workbenches.
- Add interface-level SLAs and source availability to validation. Orders should distinguish “source unavailable,” “source stale,” “source negative,” and “source contradictory.”
- Delete mock-mode defaults from any production profile.

### 9. Operations Workbench Is Too Broad For Day-To-Day OMS Work

Severity: Medium

The workbench places setup, orders, verification, documents, risk, wealth, ODA, MLD, FX, lending, portfolio, integrations, notifications, and reports into one large tab set (`apps/back-office/src/pages/oems-workbench.tsx:2977`). The order tab embeds the wizard and a table with Validate/Ack/Submit/Cancel buttons (`apps/back-office/src/pages/oems-workbench.tsx:3136`).

Impact: The page is useful for demos and administration, but production users need role-specific cockpits and exception queues. Traders, RMs, branch users, operations, compliance, treasury, and supervisors should not all work through one broad surface.

Recommendation:

- Add role-based dashboards: RM/branch capture, BO maker, BO checker, treasury, compliance/suitability, document ops, integration ops, product governance, and supervisor exception management.
- Add queue metrics: SLA aging, owner, next action, blocking reason, customer pending, source pending, document pending, approval pending, settlement pending, failed integration, and reconciliation break.
- Add saved filters, bulk actions, exportable blotters, keyboard shortcuts, and audit drilldowns.

### 10. Observability And Controls Need A Production Control Tower

Severity: Medium

KPIs exist for open orders, validation failures, integrations, LTV breaches, and active parameters (`apps/back-office/src/pages/oems-workbench.tsx:2965`). That is a start, but not enough for a production OMS.

Recommendation:

- Add a real-time control tower for order throughput, validation failure distribution, customer verification aging, document aging, approval SLA, source-system SLA, adapter failures, retry exhaustion, reconciliation breaks, settlement failures, manual override count, and revenue/fee leakage.
- Add immutable audit/event streaming so every order can be reconstructed from events.
- Add maker-checker reports and override heatmaps by user, role, branch, product, and rule.

## World-Class Target Architecture

1. Product/security master: governed, versioned, structured, source-linked, effective-dated.
2. Product-specific tickets: no generic primary capture for complex products.
3. Rules engine: deterministic, versioned, explainable, override-aware.
4. Workflow engine: formal state machine plus audit event store.
5. Transactional service layer: database transactions for multi-table workflows and outbox for side effects.
6. Certified adapters: contract-first, idempotent, encrypted/masked, reconciled, monitored.
7. Operator cockpits: role-specific queues and SLA management.
8. Customer journey: digital verification, document signing, customer confirmation, and notifications embedded in each product flow.
9. Fee/tax/calendar engines: market-aware and effective-dated.
10. Controls and observability: control tower, exception aging, audit replay, reconciliation closure.

## Delete, Modify, Add

Delete:

- Generic order wizard as the primary production path.
- Hardcoded fee/tax formulas in the generic charge engine.
- Production-critical JSON textareas and JSON-only configuration for validation rules.
- Default-ready source status behavior for missing evidence.
- Mock-mode defaults in production integration profiles.

Modify:

- `createOrder` to require active product/security and enforce family/transaction compatibility.
- `validateOrder` into a rules-engine-backed validation layer.
- `submitOrder` to enqueue approval work items and use a formal workflow engine.
- Approval decisions to write order status transitions.
- Product setup to separate security master, distribution rules, fee/tax rules, calendars, and documents.
- UI to route each product family into a dedicated order process.

Add:

- Security master, eligibility rules, settlement calendars, fee/tax schedules, order event store, outbox, reconciliation workbench, exception queues, product-specific order tickets, production adapter certification, and full negative-path test coverage.

## Final Opinion

The current Danamon OEMS is a strong foundation and demonstrates many required concepts, especially around ODA, documents, verification, integrations, and lending. To become world-class, it must shift from “broad workbench plus service methods” to “governed product/security-driven OMS.” The biggest investment should go into product-specific capture, a real security master, deterministic validation, workflow orchestration, transactional consistency, certified integrations, and role-based operations.
