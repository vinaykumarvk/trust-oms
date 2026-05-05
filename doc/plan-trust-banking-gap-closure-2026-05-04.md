# Trust Banking Gap Closure Plan

**Date:** 2026-05-04  
**Scope:** One-by-one closure plan for the active Trust Banking gaps in `docs/codebase-document-gap-analysis-trust-banking-2026-04-25.md`  
**Related evaluation:** `doc/evaluations/trust-banking-philippines-brd-council-transcript-20260504-181402.md`

## Planning Position

The grouped Trust Banking BRD is a target-state capability catalogue, not the immediate build backlog. Gap closure should proceed through the active P0/P1 trust-banking gaps first, because those gaps determine whether later product breadth can be safely added.

Each gap should be executed as a bounded ticket:

1. Confirm current code evidence.
2. Define acceptance criteria and test scope.
3. Implement only the gap under work.
4. Add focused automated tests where feasible.
5. Update the gap register with evidence and residual risk.

## Execution Order

| Seq | Gap ID | Priority | Work Item | Why This Order | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| 1 | TB-K-001 / TB-E-001 | P0 | Enforce object-level authorization and session-derived client ownership on client-facing APIs, starting with service requests. | This is a privacy and tenant-boundary control. It is also a contained first closure that can establish the ownership-checking pattern for statements, messages, documents, elections, and service requests. | No client-facing route trusts a caller-supplied `clientId` without session ownership validation; tests cover cross-client denial. |
| 2 | TB-A-001 | P0 | Implement first-class Trust Banking base account, holding account, security account, CIF, TSA, CSA, mandate, and related-party foundations. | Most later product, billing, statement, custody, and regulatory flows depend on a stable account foundation. | Schema and service layer expose canonical trust account foundations with audit fields and relationship links. |
| 3 | TB-A-002 | P0 | Extend onboarding conversion so prospect/client conversion creates the required trust account structure. | The base account model only becomes useful when onboarding creates operational records consistently. | Conversion creates base account, holding/security accounts, TSA/CSA links, mandate shell, and related-party records or controlled pending tasks. |
| 4 | TB-G-001 | P0 | Complete product-specific fee formulas and base amount sourcing for trust products. | Fee correctness depends on account/product foundations and affects billing, tax, GL, and client disputes. | Fee calculations identify product, formula, base source, rate, period, tax, override status, and audit evidence. |
| 5 | TB-H-001 | P0 | Productionize corporate-action external feed parser/connector boundary. | Corporate actions need authoritative event ingestion before entitlement reconciliation can be trusted. | Feed ingestion has durable source records, validation, idempotency, exception states, and replay controls. |
| 6 | TB-H-002 | P0 | Add election and entitlement reconciliation against custody feed, accounting books, and client statements. | This closes the highest financial-risk corporate-action gap. | Reconciliation compares the triad, records breaks, supports investigation, and prevents unsupported completion. |
| 7 | TB-A-003 | P1 | Harden external core-banking integration contracts and adapter behavior. | Integration is needed for settlement, cash movement, CIF/account validation, tax, and statements. | Adapter registry defines contract, owner, idempotency, retries, acknowledgements, exception queue, and audit trail. |
| 8 | TB-B-002 | P1 | Complete UBO, authorized signatory, ownership hierarchy, and related-party onboarding. | Related-party structure is required for fiduciary, AML/CDD, signing authority, and account control. | Onboarding supports role-specific parties, ownership percentages, effective dates, authority documents, and history. |
| 9 | TB-B-001 | P1 | Add controlled duplicate detection with override, reason, reviewer approval, and audit evidence. | Dedupe decisions are safer after related-party scope is represented. | Duplicate candidates produce soft stops; overrides require reason and approval; audit trail is searchable. |
| 10 | TB-G-002 | P1 | Enforce complete tier/window validation for step-function fee schedules. | This prevents billing leakage and overcharging once product-specific fees are active. | Fee schedules reject gaps, overlaps, invalid bounds, missing base coverage, and invalid effective periods. |
| 11 | TB-G-003 | P1 | Define production-grade accounting-event contract for billing/accrual events. | Fee and accrual outputs must reconcile downstream. | Events have schema version, idempotency key, source transaction, acknowledgement status, replay behavior, and exception handling. |
| 12 | TB-I-002 | P1 | Build a unified operational exception queue. | Multiple later gaps need a shared control surface for failed integrations, unmatched contributions, report failures, and CA breaks. | Exceptions have severity, owner, SLA, source object, assignment, history, resolution evidence, and reporting. |
| 13 | TB-I-001 | P1 | Build contribution matching and unmatched inventory workbench. | The exception framework provides the operational model for unmatched cash/securities. | Unmatched items can be aged, investigated, linked, resolved, and audited. |
| 14 | TB-G-004 | P1 | Complete report-pack generation with delivery, retry, and audit. | Reports should use stable data/accounting foundations and exception handling. | Report packs have templates, run records, outputs, dispatch status, retry history, masking, and audit evidence. |
| 15 | TB-E-002 | P1 | Implement durable service-request document evidence workflow. | Service-request ownership is already secured by Seq 1; document storage can then be hardened safely. | Upload/download/storage have object records, access checks, scanning hook or quarantine state, retention metadata, and audit. |
| 16 | TB-E-003 | P1 | Replace service-request ID generation with an atomic database-backed sequence/counter. | This is narrow and reduces concurrency risk. | Concurrent creation cannot duplicate request IDs; tests cover parallel creation behavior. |
| 17 | TB-E-004 | P1 | Tighten RM reassignment role gating. | Assignment control is a small authority hardening item after service-request foundations are improved. | Only configured roles can reassign; denials and approvals are audited. |
| 18 | TB-J-001 | P1 | Replace static client-portal messages with authenticated persistent messaging. | Messaging depends on ownership checks and notification governance. | Messages are session-scoped, persisted, audited, and cannot leak across clients. |
| 19 | TB-J-002 | P1 | Implement official statement download with audit and retention. | Statement delivery depends on report-pack generation, ownership checks, and document evidence controls. | Statements are generated or retrieved from durable outputs with access control, download audit, and retention metadata. |
| 20 | TB-K-002 | P1 | Normalize audit event names, before/after payload shape, actor/source fields, and correlation IDs. | Once core high-risk workflows exist, audit consistency can be standardized across them. | Audit events follow shared taxonomy and can be searched by actor, source, object, event type, and correlation ID. |
| 21 | TB-K-003 | P1 | Govern operational notifications with acknowledgement, escalation, assignment, SLA, and closure. | Notifications should become accountable workflow, not loose alerts. | Notifications have lifecycle, owner, escalation path, due date, acknowledgement, and closure evidence. |
| 22 | TB-H-003 | P1 | Add dynamic corporate-action event fields by event type. | Best sequenced after feed and reconciliation foundations. | Event types enforce their own required fields, validation, and audit history. |
| 23 | TB-H-004 | P1 | Add assisted corporate-action election channels. | Election assistance is safer after event models and reconciliation are stable. | Branch/RM/back-office assisted elections are captured with authority evidence, maker-checker, and channel provenance. |
| 24 | TB-H-006 | P1 | Persist degraded-mode and feed-failover state. | This hardens CA operations after the core CA lifecycle is reliable. | Degraded state survives restart and records owner, start/end, reason, affected feeds, decisions, and resolution. |
| 25 | TB-C-001 | P1 | Drive late call-report filing from governed configuration, timezone, business calendar, and holiday rules. | Important but not on the core trust-account critical path. | SLA computation is explainable, configured, auditable, and tested for timezone/holiday cases. |
| 26 | TB-D-001 | P1 | Explicit cross-branch handover authorization routing and escalation. | Handover is operationally important but can follow foundation/security work. | Routing rules identify checker ownership, escalation, audit, and branch restrictions. |
| 27 | TB-D-002 | P1 | Move bulk handover to durable background processing with upload limits and retry controls. | Builds on handover routing and exception framework. | Bulk jobs are durable, resumable, bounded, retryable, and auditable. |
| 28 | TB-F-001 | P1 | Make rejected risk questionnaires immutable except through controlled versioning. | Governance hardening after high-risk platform work. | Rejected/authorized records cannot be edited/deleted except via versioned replacement workflow. |
| 29 | TB-F-002 | P1 | Bind asset-allocation classes to product/security taxonomy. | Suitability outputs should align to actual products and reporting categories. | Asset classes are controlled reference data and validate against approved taxonomy. |

## External Deployment Dependencies

These are not open application feature gaps, but they still require business or external-system readiness before production use:

- TB-H-005 is now closed for the application-side boundary. Live BIR/eFPS submission still depends on production credentials, target-system onboarding, and bank approval for the credential profile.
- TB-C-002, TB-C-003, TB-D-003, TB-F-003, TB-G-005, TB-H-007, TB-I-003, TB-J-003, TB-K-004: valid P2 hardening items, now closed for the current application scope.
- Complex BRD Appendix D product breadth such as IRS, CDS, TRS, cross-currency swaps, IPO/FOO agency, life insurance trust, complex FX and bond derivatives, repos, collateral, warrants, and notes/paying agency: each requires separate fit-gap spike and business sign-off.

## First Implementation Ticket

**Ticket:** Close TB-K-001 / TB-E-001 client-facing object authorization.

**Implementation intent:** Establish a reusable ownership guard for client-facing routes. The route should derive client identity from the authenticated session/token and reject cross-client object access, rather than trusting caller-supplied IDs.

**Likely write scope to inspect first:**

- `server/routes/client-portal.ts`
- Shared auth/session helpers used by client-portal routes
- Service-request service methods used by portal routes
- Client portal tests or Vitest test setup

**Acceptance criteria:**

- Client portal service-request list/detail/update/close/resubmit routes cannot access another client's request.
- Routes either remove `:clientId` from the trust boundary or validate it against session ownership before use.
- Unauthorized cross-client attempts return 403 or 404 consistently without leaking object existence.
- Audit/security logging records denied access attempts without exposing sensitive payloads.
- Focused tests cover own-client success and cross-client denial.

**Suggested verification:**

- Add route/service tests for ownership success and denial.
- Run `npm test -- --run` or the focused Vitest target used by the repo.
- Run `npm run check`.

## Execution Log

### 2026-05-04 - TB-K-001 / TB-E-001 Closed For Current Scope

**Implemented controls:**

- Reused portal ownership violation logging for service-request object mismatches, not only `:clientId` route mismatches.
- Added `requirePortalClientIdentity` so client-facing routes can consistently use the authenticated session client after URL ownership validation.
- Updated client portal service-request list and action-count routes to use the session-derived client ID rather than `req.params.clientId`.
- Updated portfolio summary, statements list, notifications, and risk-profile routes to use the same session-derived client ID pattern after `validatePortalOwnership`.
- Added service-request ownership verification before document download.
- Bound service-request document downloads to both the requested `docId` and the service-request `:id` path so a document cannot be downloaded through the wrong SR path.
- Added message creation guards so a client cannot attach a new message to another client's parent message, thread, or related service request.

**Files changed:**

- `server/middleware/portal-ownership.ts`
- `server/routes/client-portal.ts`
- `server/services/client-message-service.ts`
- `server/services/sr-document-service.ts`
- `tests/e2e/client-portal-ownership.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/client-portal-ownership.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/(routes/client-portal|middleware/portal-ownership|services/sr-document-service|services/client-message-service)|tests/e2e/client-portal-ownership" || true`
- Blocked: full `npm run check` still fails on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors unrelated to this ticket.

**Residual scope for later hardening:**

- Decide whether to remove URL `:clientId` from client portal APIs entirely in a later compatibility-breaking cleanup.

### 2026-05-04 - TB-A-001 / TB-A-002 Verified Closed By Current Implementation

**Current evidence:**

- Trust account foundation schema exists for base trust accounts, holding accounts, security accounts, settlement accounts, mandates, related parties, and foundation events.
- `trustAccountFoundationService.createDefaultFoundation` creates the canonical account stack and emits foundation lifecycle evidence.
- Prospect-to-customer conversion calls `trustAccountFoundationService.createDefaultFoundation` and returns `trust_foundation` in the conversion result.
- Mandate-aware transaction paths use `trustAccountFoundationService.assertPortfolioMandateAuthority`.
- Back-office trust account routes and UI are present for account foundation visibility.

**Files verified:**

- `packages/shared/src/schema.ts`
- `drizzle/20260501_add_trust_account_foundation.sql`
- `server/services/trust-account-foundation-service.ts`
- `server/services/conversion-service.ts`
- `server/routes/back-office/trust-accounts.ts`
- `apps/back-office/src/pages/trust-accounts.tsx`
- `tests/e2e/trust-account-foundation.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/trust-account-foundation.spec.ts`

**Residual scope for later hardening:**

- Product-specific onboarding enrichment remains a later fit-gap item for complex Appendix D products, but the P0 foundation and conversion stack are implemented.

### 2026-05-04 - TB-G-001 Closed For Current Scope

**Implemented controls:**

- Added a testable TrustFees Pro calculation policy that maps product/value basis to explicit formula code, product family, base source, period basis, Act/360 basis, and tax treatment.
- Replaced synthetic ADB fallback in the TrustFees Pro accrual engine with auditable source resolution: month-to-date NAV average, latest NAV, or explicit portfolio AUM fallback.
- Added explicit position-level fee bases for face value, principal balance, notional amount, and acquisition cost.
- Added security-level fee metadata for par value and product period hints such as coupon, dividend, interest-payment, and term days.
- Hardened position-based fees so face-value, cost, principal, and notional plans require real position evidence rather than falling back to generic AUM.
- Added calculation audit events for created accruals with formula code, base source evidence, pricing breakdown, period evidence, tax treatment, override status, FX lock evidence, and idempotency key.

**Files changed:**

- `server/services/tfp-fee-calculation-policy.ts`
- `server/services/tfp-accrual-engine.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_tfp_product_fee_bases.sql`
- `tests/e2e/tfp-product-fee-calculation.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/tfp-product-fee-calculation.spec.ts`
- Passed: `npm test -- --run tests/e2e/trustfees-pro-lifecycle.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/tfp-(accrual-engine|fee-calculation-policy)|packages/shared/src/schema|tests/e2e/tfp-product-fee-calculation" || true`

**Residual scope for later hardening:**

- TB-G-002 and TB-G-003 were closed later in this same gap-closure run.
- Invoice tax rules already run later in the TrustFees pipeline; this ticket records accrual tax treatment as deferred evidence rather than calculating invoice tax at accrual time.

### 2026-05-04 - TB-H-001 Closed For Current Scope

**Implemented controls:**

- Added a pure corporate-action feed parser boundary for normalized JSON, PSE EDGE JSON, ISO 20022-style JSON, SWIFT MT564-style messages, and DTCC GCAV CSV.
- Added durable `corporate_action_feed_messages` records with source system, feed format, payload hash, idempotency key, raw payload, normalized payload, parse status, validation errors, linked corporate action, and replay metadata.
- Added idempotency checks so duplicate feed messages return the existing feed record rather than creating duplicate corporate actions.
- Added validation failure persistence so incomplete external messages are stored with errors and can be replayed after correction or parser enhancement.
- Added replay of stored failed feed messages from the original raw payload.
- Added hash-chained audit events for feed parse, validation failure, duplicate detection, ingestion, and replay.
- Added back-office routes for external feed ingestion and replay.

**Files changed:**

- `server/services/corporate-action-feed-parser.ts`
- `server/services/corporate-action-feed-service.ts`
- `server/routes/back-office/corporate-actions.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_ca_feed_messages.sql`
- `tests/e2e/corporate-action-feed-parser.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/corporate-action-feed-parser.spec.ts`
- Passed: `npm test -- --run tests/e2e/corporate-actions-lifecycle.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/(services/corporate-action-feed|routes/back-office/corporate-actions)|packages/shared/src/schema|tests/e2e/corporate-action-feed-parser" || true`

**Residual scope for later hardening:**

- Production connector credentials, licensed vendor adapters, and automated feed failover remain separate integration/deployment items.
- External security identifier resolution currently requires the message to provide an internal `securityId`; unresolved ISIN/CUSIP mappings are retained as validation failures for operations review.

### 2026-05-04 - TB-H-002 Closed For Current Scope

**Implemented controls:**

- Added durable custody-confirmation records for corporate-action entitlements and elections.
- Added durable client-statement line records for corporate-action entitlement/election disclosure checks.
- Added deterministic CA entitlement triad reconciliation across internal entitlements, custody confirmations, client statement lines, and accounting posted state.
- Reconciliation now emits `recon_breaks` for missing custody confirmations, custody quantity mismatches, custody election mismatches, missing client statement lines, client statement quantity mismatches, client statement election mismatches, and accounting not-posted cases.
- Added a back-office CA route to trigger entitlement reconciliation for a specific corporate action.
- Replaced the risky simulated/random statement leg for this CA-specific workflow with persisted statement-line evidence.

**Files changed:**

- `server/services/reconciliation-service.ts`
- `server/routes/back-office/corporate-actions.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_ca_entitlement_recon_sources.sql`
- `tests/e2e/ca-entitlement-reconciliation.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/ca-entitlement-reconciliation.spec.ts`
- Passed: `npm test -- --run tests/e2e/corporate-actions-lifecycle.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/(services/reconciliation-service|routes/back-office/corporate-actions)|packages/shared/src/schema|tests/e2e/ca-entitlement-reconciliation" || true`

**Residual scope for later hardening:**

- EOD scheduling for CA recon remains in a later orchestration hardening step.
- Custody confirmations and statement lines now have durable source tables; production adapter ingestion into those tables remains dependent on vendor/client statement feed integration.

### 2026-05-04 - TB-A-003 Closed For Current Scope

**Implemented controls:**

- Added explicit core-banking operation contracts for CIF lookup, account validation, balance inquiry, CASA debit/credit, GL posting, statement fetch, and tax payment.
- Added deterministic idempotency-key generation from operation-specific business fields.
- Added retry-window policy based on operation contract retry/backoff settings.
- Added durable `core_banking_instructions` records with target system, adapter, owner team, operation, entity, idempotency key, request/response payloads, status, acknowledgement status, retry metadata, exception link, and audit fields.
- Added queueing logic that validates payloads, prevents duplicate instructions, links to the active adapter registry, and creates exception queue records when validation or adapter availability fails.
- Added acknowledgement handling for bank ACK/reject/return responses with exception creation for negative acknowledgements.
- Added back-office integration routes for queueing core-banking instructions and recording acknowledgements.

**Files changed:**

- `server/services/core-banking-contract-policy.ts`
- `server/services/core-banking-integration-service.ts`
- `server/routes/back-office/integrations.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_core_banking_instructions.sql`
- `tests/e2e/core-banking-contract-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/core-banking-contract-policy.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/(services/core-banking|routes/back-office/integrations)|packages/shared/src/schema|tests/e2e/core-banking-contract-policy" || true`

**Residual scope for later hardening:**

- Live Finacle/NCBS credentials and transport adapters remain deployment dependencies.
- Existing settlement/IMASI flows can now migrate from direct stubs onto the durable core-banking instruction ledger incrementally.

### 2026-05-04 - TB-B-002 Closed For Current Scope

**Implemented controls:**

- Added a pure related-party onboarding policy for UBO threshold checks, authorized-signatory evidence, ownership percentage validation, effective-date validation, hierarchy reference validation, and compliance-review warnings.
- Extended `trust_related_parties` with durable onboarding evidence: logical party references, parent references, relationship-to-account, ownership path, control type, authority document reference, authority verification fields, verification status, UBO threshold flag, screening required flag, screening case reference, and compliance-review required flag.
- Wired trust-account foundation creation through the related-party policy so invalid related-party payloads are rejected before account foundation records are created.
- Added foundation event payload evidence for related-party warnings and summary counts.
- Updated the Trust Accounts back-office page so users can capture role-specific related parties, UBO/signatory flags, ownership percentages, hierarchy parent references, authority documents, and signing limits during foundation creation.

**Files changed:**

- `server/services/trust-related-party-policy.ts`
- `server/services/trust-account-foundation-service.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_trust_related_parties_onboarding.sql`
- `apps/back-office/src/pages/trust-accounts.tsx`
- `tests/e2e/trust-related-party-policy.spec.ts`
- `tests/e2e/trust-account-foundation.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/trust-related-party-policy.spec.ts`
- Passed: `npm test -- --run tests/e2e/trust-account-foundation.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/trust-(account-foundation-service|related-party-policy)|packages/shared/src/schema|apps/back-office/src/pages/trust-accounts|tests/e2e/trust-related-party-policy|tests/e2e/trust-account-foundation" || true`

**Residual scope for later hardening:**

- Existing generic client `beneficial_owners` CRUD remains separate from the richer trust-account related-party ledger; a later cleanup can provide migration/sync tooling if operations need one master BO source.
- External sanctions/PEP case creation can consume the new `screening_required` and `screening_case_ref` fields, but this ticket intentionally stops at onboarding evidence and validation.

### 2026-05-04 - TB-B-001 Closed For Current Scope

**Implemented controls:**

- Added a pure dedupe decision policy that distinguishes clear, hard-stop, soft-stop, and approved-override outcomes.
- Hardened soft-stop overrides so they require a documented reason, reviewer approval, and reviewer distinct from maker.
- Extended `dedupe_overrides` to store text entity identifiers, matched fields, reason code, reviewer user, override status, request/decision timestamps, reviewer comments, and decision snapshot.
- Fixed dedupe person-type matching so seeded `NATURAL` and `ENTITY` rules are honored alongside `INDIVIDUAL` and `NON_INDIVIDUAL`.
- Added TIN/tax ID aliases to the dedupe engine so client/prospect TIN duplication can be controlled through rules such as `tin`, `tax_id`, or `tin_number`.
- Wired controlled duplicate decisions into lead, prospect, and client create paths, including audit records for pre-create checks and approved override persistence after creation.

**Files changed:**

- `server/services/dedupe-decision-policy.ts`
- `server/services/dedupe-service.ts`
- `server/services/lead-service.ts`
- `server/services/prospect-service.ts`
- `server/routes/back-office/index.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_dedupe_override_workflow.sql`
- `tests/e2e/dedupe-decision-policy.spec.ts`
- `tests/e2e/dedupe-negative-list.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/dedupe-decision-policy.spec.ts`
- Passed: `npm test -- --run tests/e2e/dedupe-negative-list.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(dedupe-service|dedupe-decision-policy|lead-service|prospect-service)|server/routes/back-office/index|packages/shared/src/schema|tests/e2e/dedupe-(decision-policy|negative-list)" || true`

**Residual scope for later hardening:**

- Product-specific onboarding dedupe rules remain configurable data; this ticket provides the enforceable workflow and TIN aliases, but production rule calibration should be owned by Compliance/Operations.
- The generic CRUD path accepts approved override evidence on resubmission; a richer UI queue for pending dedupe approvals can be added later if operations want asynchronous review instead of same-session reviewer approval evidence.

### 2026-05-04 - TB-G-002 Closed For Current Scope

**Implemented controls:**

- Added a pure TrustFees pricing-window validator for fixed pricing, slab tiers, step-function windows, and fee-plan effective periods.
- Slab pricing now rejects missing tiers, invalid bounds, gaps, overlaps, missing rate/amount fields, negative rate/amount values, non-final open-ended tiers, and missing open-ended final coverage.
- Step-function pricing now rejects missing windows, invalid month bounds, gaps, overlaps, missing amounts, negative amounts, non-final open-ended windows, and missing open-ended final coverage.
- Fee-plan create/update now rejects invalid effective windows, including expiry dates before effective dates.
- Pricing-definition create/update now uses the shared validator, so DRAFT changes cannot move forward with incomplete tier/window coverage.

**Files changed:**

- `server/services/pricing-window-validation-service.ts`
- `server/services/pricing-definition-service.ts`
- `server/services/fee-plan-service.ts`
- `tests/e2e/pricing-window-validation.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/pricing-window-validation.spec.ts`
- Passed: `npm test -- --run tests/e2e/trustfees-pro-lifecycle.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(pricing-window-validation-service|pricing-definition-service|fee-plan-service)|tests/e2e/pricing-window-validation" || true`

**Residual scope for later hardening:**

- Existing legacy `fee_schedules.tiered_rates` CRUD is still separate from the TrustFees Pro pricing library; production billing should prefer `pricing_definitions` and `fee_plans` for governed tier validation.

### 2026-05-04 - TB-G-003 Closed For Current Scope

**Implemented controls:**

- Added a versioned TrustFees accounting-event contract for accrual creation, accrual reversal, invoice issuance, and payment posting.
- Added deterministic idempotency keys from schema version, event type, source transaction type, and source event/source transaction identifier.
- Added durable `tfp_accounting_events` records with source transaction, aggregate, customer/portfolio/fee-plan/accrual/invoice links, amount, currency, accounting date, event payload, publish status, acknowledgement status, acknowledgement reference/payload, replay counters, failure reason, retry timestamp, exception link, and audit fields.
- Added queueing, duplicate detection, acknowledgement, replay, and list APIs in the TrustFees accounting-event service.
- Wired daily accrual creation to queue `TFP_ACCRUAL_CREATED` accounting events.
- Wired invoice issuance to queue `TFP_INVOICE_ISSUED` accounting events.
- Added back-office routes for listing, acknowledging, and replaying TrustFees accounting events.

**Files changed:**

- `server/services/tfp-accounting-event-contract.ts`
- `server/services/tfp-accounting-event-service.ts`
- `server/services/tfp-accrual-engine.ts`
- `server/services/tfp-invoice-service.ts`
- `server/routes/back-office/tfp-accounting-events.ts`
- `server/routes.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_tfp_accounting_events.sql`
- `tests/e2e/tfp-accounting-event-contract.spec.ts`
- `tests/e2e/trustfees-pro-lifecycle.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/tfp-accounting-event-contract.spec.ts`
- Passed: `npm test -- --run tests/e2e/trustfees-pro-lifecycle.spec.ts`
- Passed: `npm test -- --run tests/e2e/tfp-product-fee-calculation.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(tfp-accounting-event|tfp-accrual-engine|tfp-invoice-service)|server/routes(.ts|/back-office/tfp-accounting-events)|packages/shared/src/schema|tests/e2e/tfp-accounting-event-contract|tests/e2e/trustfees-pro-lifecycle" || true`

**Residual scope for later hardening:**

- The event ledger now provides the durable contract; a later integration deployment still needs the actual downstream GL/finance transport adapter and scheduler that publishes `PENDING` events.

### 2026-05-04 - TB-I-002 Closed For Current Scope

**Implemented controls:**

- Extended operational exceptions into a unified queue with domain, source system, source object URI, SLA start/breach timestamps, assignment history, status history, resolution code/evidence, root-cause code, client-impact flag, regulatory-impact flag, retry count, and retry timestamp.
- Added a shared exception queue policy for severity-based SLA calculation and auditable status/assignment history entries.
- Updated exception creation so callers can classify exceptions by operational domain while preserving existing TrustFees callers.
- Updated assignment, resolution, manual escalation, won't-fix, and SLA-breach sweeps to maintain auditable status history and lifecycle timestamps.
- Added route support for filtering by exception domain and for supplying domain/source/resolution evidence metadata.
- Routed core-banking integration exceptions into the unified queue with `CORE_BANKING` domain metadata and deterministic source object URIs.
- Routed TrustFees accrual and payment exception creation through the unified queue so they receive consistent SLA/history controls.

**Files changed:**

- `server/services/exception-queue-policy.ts`
- `server/services/exception-queue-service.ts`
- `server/services/core-banking-integration-service.ts`
- `server/services/tfp-accrual-engine.ts`
- `server/services/tfp-payment-service.ts`
- `server/routes/back-office/exceptions.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_exception_items_unified_queue.sql`
- `tests/e2e/exception-queue-policy.spec.ts`
- `tests/e2e/exception-queue-service-unified.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/exception-queue-policy.spec.ts tests/e2e/exception-queue-service-unified.spec.ts`
- Passed: `npm test -- --run tests/e2e/trustfees-pro-lifecycle.spec.ts`
- Passed: `npm test -- --run tests/e2e/exception-queue-policy.spec.ts tests/e2e/exception-queue-service-unified.spec.ts tests/e2e/trustfees-pro-lifecycle.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(exception-queue-service|exception-queue-policy|core-banking-integration-service|tfp-payment-service|tfp-accrual-engine)|server/routes/back-office/exceptions|packages/shared/src/schema|tests/e2e/(exception-queue-policy|exception-queue-service-unified|trustfees-pro-lifecycle)" || true`

**Residual scope for later hardening:**

- The unified queue now has the control surface required by later gaps; product-specific workbenches can add richer UI filters and dashboards as their exception domains come online.

### 2026-05-04 - TB-I-001 Closed For Current Scope

**Implemented controls:**

- Added a durable `contribution_match_items` ledger for inbound cash/security contribution items with source system, external reference, amount/quantity, portfolio/trust-account links, received/value dates, match status, match evidence, owner notes, resolution evidence, and linked exception.
- Extended recorded contributions with external reference, match status, linked match item, match confidence/evidence, unmatched reason, and exception link.
- Added a pure contribution matching policy for exact auto-match, review routing, no-match decisions, and ageing calculation.
- Added contribution service operations to ingest inbound items, run matching, manually link items, resolve unmatched items, and list unresolved inventory with age days.
- Integrated unmatched/review contribution items with the unified exception queue under the `CONTRIBUTIONS` domain.
- Added back-office contribution matching APIs for ingest, run, unresolved inventory, manual link, and resolution.
- Extended the Contributions page with a matching workbench tab, ageing visibility, ingest action, run-matching action, manual link, and resolve workflow.

**Files changed:**

- `server/services/contribution-matching-policy.ts`
- `server/services/contribution-service.ts`
- `server/routes/back-office/contributions.ts`
- `apps/back-office/src/pages/contributions.tsx`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_contribution_matching_inventory.sql`
- `tests/e2e/contribution-matching-policy.spec.ts`
- `tests/e2e/contribution-tax-event.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/contribution-matching-policy.spec.ts tests/e2e/contribution-tax-event.spec.ts tests/e2e/trust-account-foundation.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(contribution-service|contribution-matching-policy|exception-queue-service|exception-queue-policy)|server/routes/back-office/contributions|apps/back-office/src/pages/contributions|packages/shared/src/schema|tests/e2e/(contribution-matching-policy|contribution-tax-event|trust-account-foundation)" || true`

**Residual scope for later hardening:**

- Production bank/custody feed adapters can now ingest into `contribution_match_items`; this ticket provides the operational queue and matching controls rather than the licensed external feed transport.

### 2026-05-04 - TB-G-004 Closed For Current Scope

**Implemented controls:**

- Extended report-pack templates with output formats, default delivery channels, default recipients, retention years, and masking policy.
- Added durable report-pack run records with run IDs, template links, parameters, requester, lifecycle timestamps, report/output counts, failure reason, and exception link.
- Added durable report-pack output records with report type, format, row count, file reference, file size, content hash, generated payload, retention date, delivery channel/recipient, delivery status, retry counters, retry timestamps, delivery error, and exception link.
- Added report-pack policy helpers for run IDs, output references, content hashing, retention dates, retry windows, recipient/channel normalization, and row-count estimation.
- Added a report-pack service that generates reports from templates, applies masking policy, records outputs, logs report generation, dispatches outputs with notification audit evidence, and schedules delivery retries or dead-letters exhausted retries.
- Added report-pack APIs under `/api/v1/reports` for generating durable pack runs, listing runs, dispatching runs, and retrying outputs.

**Files changed:**

- `server/services/report-pack-policy.ts`
- `server/services/report-pack-service.ts`
- `server/routes/back-office/reports.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_report_pack_operations.sql`
- `tests/e2e/report-pack-policy.spec.ts`
- `tests/e2e/report-pack-service.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/report-pack-policy.spec.ts tests/e2e/report-pack-service.spec.ts tests/e2e/regulatory-reports.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(report-pack-service|report-pack-policy|report-generator-service|exception-queue-service)|server/routes/back-office/reports|packages/shared/src/schema|tests/e2e/(report-pack-policy|report-pack-service|regulatory-reports)" || true`

**Residual scope for later hardening:**

- The service now records generated payloads and file references; a production storage renderer can replace JSON payload persistence with signed PDF/CSV object storage without changing the operational run/output contract.

### 2026-05-04 - TB-E-002 Closed For Current Scope

**Implemented controls:**

- Extended service-request document records with storage provider, content hash, upload IP, quarantine reason, retention policy, legal hold, download count, last-access metadata, and bounded access history.
- Added a service-request document evidence policy for SHA-256 content hashes, retention-policy classification, and upload/download access history entries.
- Updated uploads to persist content hash, storage provider provenance, quarantine reason, retention policy, and upload access evidence.
- Updated client and back-office downloads to record auditable access history, download counters, requester identity, requester type, and IP address.
- Tightened back-office SR document download so the document must belong to the `:srId` route path, matching the client portal object-binding guard.

**Files changed:**

- `server/services/sr-document-evidence-policy.ts`
- `server/services/sr-document-service.ts`
- `server/routes/client-portal.ts`
- `server/routes/back-office/sr-documents.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_sr_document_evidence.sql`
- `tests/e2e/sr-document-evidence-policy.spec.ts`
- `tests/e2e/client-portal-ownership.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/sr-document-evidence-policy.spec.ts tests/e2e/client-portal-ownership.spec.ts tests/e2e/trust-account-foundation.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(sr-document-service|sr-document-evidence-policy|document-scan-service)|server/routes/(client-portal|back-office/sr-documents)|packages/shared/src/schema|tests/e2e/(sr-document-evidence-policy|client-portal-ownership|trust-account-foundation)" || true`

**Residual scope for later hardening:**

- The scan provider abstraction remains in place; production still needs a real ClamAV or external scanning adapter configured instead of the current simulated/stub providers.

### 2026-05-04 - TB-E-003 Closed For Current Scope

**Implemented controls:**

- Added a year-scoped `service_request_id_counters` table for atomic service-request sequence allocation.
- Added migration backfill logic that initializes per-year counters from existing `SR-YYYY-NNNNNN` request IDs.
- Added service-request ID policy helpers for formatting and validating returned counter sequences.
- Replaced the prior MAX/SUBSTRING request-ID generation loop with an atomic `INSERT ... ON CONFLICT(counter_year) DO UPDATE ... RETURNING last_sequence` counter operation.
- Kept a local fallback only for unit-test mocks that do not implement `db.execute`; production code uses the database-backed counter path.

**Files changed:**

- `server/services/service-request-id-policy.ts`
- `server/services/service-request-service.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_service_request_id_counters.sql`
- `tests/e2e/service-request-id-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/service-request-id-policy.spec.ts tests/e2e/handover-sla.spec.ts tests/e2e/service-request-lifecycle.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(service-request-service|service-request-id-policy|notification-inbox-service)|packages/shared/src/schema|tests/e2e/(service-request-id-policy|handover-sla|service-request-lifecycle)" || true`

**Residual scope for later hardening:**

- If the business wants numbering to reset only after an explicit yearly close process rather than automatically by calendar year, the counter table can support that by adding an authorized year-open workflow.

### 2026-05-04 - TB-E-004 Closed For Current Scope

**Implemented controls:**

- Added a service-request reassignment policy that normalizes actor roles and allows only `BO_HEAD` and `SYSTEM_ADMIN` to reassign RMs.
- Added a required reassignment reason with minimum length validation.
- Enforced the role gate inside `serviceRequestService.reassignRM`, not only at the route edge.
- Added audit logging for unauthorized reassignment attempts and successful reassignment decisions.
- Extended service-request records with bounded reassignment history, last reassignment actor, role, reason, and timestamp evidence.
- Updated the back-office reassignment route to pass session-derived actor ID, actor role, IP address, correlation ID, and reason into the service.

**Files changed:**

- `server/services/service-request-reassignment-policy.ts`
- `server/services/service-request-service.ts`
- `server/routes/back-office/service-requests.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_service_request_reassignment_controls.sql`
- `tests/e2e/service-request-reassignment-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/service-request-reassignment-policy.spec.ts tests/e2e/service-request-lifecycle.spec.ts tests/e2e/handover-sla.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(service-request-service|service-request-reassignment-policy|audit-logger)|server/routes/back-office/service-requests|packages/shared/src/schema|tests/e2e/(service-request-reassignment-policy|service-request-lifecycle|handover-sla)" || true`

**Residual scope for later hardening:**

- A future RBAC cleanup should reconcile the seeded `bo_admin` role name with the route middleware role matrix so all back-office admin semantics are consistent across modules.

### 2026-05-04 - TB-J-001 Closed For Current Scope

**Implemented controls:**

- Confirmed client portal messaging is backed by the persisted `client_messages` table and live API calls rather than hardcoded message arrays.
- Added tamper-evident audit events for client message creation, read acknowledgement, and back-office replies.
- Populated message row `created_by` and `updated_by` evidence from the authenticated actor.
- Replaced timestamp-derived thread IDs with UUID-backed thread IDs.
- Tightened client portal message sends so they require an authenticated numeric portal user ID instead of falling back to user ID `1`.
- Removed `CLT-001` and local-storage identity dependence from the messages page query keys; message data is keyed to the authenticated session and fetched from session-scoped APIs.
- Updated layout message unread-count query keys to use a session-safe key instead of a static client fallback.

**Files changed:**

- `server/services/client-message-service.ts`
- `server/routes/client-portal.ts`
- `server/routes/back-office/client-messages.ts`
- `apps/client-portal/src/pages/messages.tsx`
- `apps/client-portal/src/components/layout/ClientPortalLayout.tsx`
- `tests/e2e/client-message-persistence.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/client-message-persistence.spec.ts tests/e2e/client-portal-ownership.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/(services/client-message-service|routes/client-portal|routes/back-office/client-messages)|apps/client-portal/src/(pages/messages|components/layout/ClientPortalLayout)|tests/e2e/(client-message-persistence|client-portal-ownership)" || true`

**Residual scope for later hardening:**

- Relationship-manager assignment scoping for the back-office message inbox remains a separate operations/RBAC policy decision; current back-office access still follows the broad back-office role guard.

### 2026-05-04 - TB-J-002 Closed For Current Scope

**Implemented controls:**

- Added statement download policy helpers for SHA-256 content hashes, statement retention policy mapping, retention date calculation, and bounded download access history.
- Extended client statements with report-pack output linkage, storage provider, content hash, retention policy, retention date, legal hold, last download actor/IP, and access history.
- Updated statement downloads to verify stored content hashes, populate missing hash/size/retention metadata, append download access history, and audit every successful download.
- Added integrity-failure audit events when a stored statement hash does not match the file bytes.
- Added session-scoped `GET /client-portal/statements` and `GET /client-portal/statements/:statementId/download` routes so the client UI no longer needs a URL client ID for statements.
- Kept the legacy `:clientId` routes protected by ownership middleware for compatibility.
- Replaced the client portal download path with a real `fetch(...).blob()` flow instead of trying to parse PDF responses through the JSON API helper.
- Added secure download headers including content disposition, content length, statement hash, and retention date.

**Files changed:**

- `server/services/statement-download-policy.ts`
- `server/services/statement-service.ts`
- `server/routes/client-portal.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_client_statement_download_controls.sql`
- `apps/client-portal/src/pages/statements.tsx`
- `tests/e2e/statement-download-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/statement-download-policy.spec.ts tests/e2e/client-portal-ownership.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/(statement-service|statement-download-policy|storage-provider|audit-logger)|server/routes/client-portal|apps/client-portal/src/pages/statements|packages/shared/src/schema|tests/e2e/(statement-download-policy|client-portal-ownership)" || true`

**Residual scope for later hardening:**

- Production statement generation should ensure every new statement is linked to a report-pack output and has a content hash before it becomes `AVAILABLE`; the download path now backfills hash evidence for existing records.

### 2026-05-04 - TB-K-002 Closed For Current Scope

**Implemented controls:**

- Added normalized audit context fields to `audit_records`: `event_type`, `actor_source`, `source_system`, and `source_channel`.
- Added indexes for event type, source system/channel, and correlation ID searches.
- Updated the hash-chained audit logger to normalize rich domain event names into the existing `audit_action` enum while preserving the original domain event in `event_type`.
- Added a consistent audit changes envelope with `before`, `after`, and `diff` fields.
- Added source/actor metadata normalization with `audit_schema_version`, normalized action, actor source, source system, source channel, and source component.
- Updated audit hash computation to include normalized metadata as well as normalized changes.
- Added migration backfill so existing audit rows receive event/source defaults.

**Files changed:**

- `server/services/audit-logger.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_audit_records_normalized_context.sql`
- `tests/e2e/audit-trail.spec.ts`
- `tests/e2e/audit-normalization-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/audit-trail.spec.ts tests/e2e/audit-normalization-policy.spec.ts tests/e2e/client-message-persistence.spec.ts tests/e2e/statement-download-policy.spec.ts tests/e2e/service-request-reassignment-policy.spec.ts`
- Passed: targeted TypeScript error scan for touched files with `npm run check -- --pretty false 2>&1 | rg "server/services/audit-logger|packages/shared/src/schema|tests/e2e/(audit-trail|audit-normalization-policy|client-message-persistence|statement-download-policy|service-request-reassignment-policy)|server/services/(client-message-service|statement-service|service-request-service)" || true`

**Residual scope for later hardening:**

- Some legacy services still insert directly into `audit_records`; those should be migrated gradually to `logAuditEvent` so they also receive normalized source metadata and change envelopes.

### 2026-05-04 - TB-K-003 Closed For Current Scope

**Implemented controls:**

- Extended CRM notifications with severity, lifecycle status, owner, owner team, SLA due date, acknowledgement fields, escalation fields, closure evidence, and governance history.
- Added a migration that backfills existing notifications with default owner, SLA, and CREATED history evidence.
- Added a notification governance policy for severity normalization, SLA calculation, lifecycle history entries, and closure evidence validation.
- Updated notification creation paths so every new inbox notification starts as an owned OPEN work item with SLA and history.
- Updated read/bulk-read behavior to acknowledge notifications, not just flip `is_read`.
- Added explicit acknowledgement, escalation, and closure service methods with audit events and append-only lifecycle history.
- Exposed acknowledgement, escalation, closure, and audited bulk acknowledgement through the back-office CRM notification routes.

**Files changed:**

- `server/services/notification-governance-policy.ts`
- `server/services/notification-inbox-service.ts`
- `server/routes/back-office/notifications.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_crm_notifications_governance.sql`
- `tests/e2e/notification-governance-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/notification-governance-policy.spec.ts tests/e2e/opportunity-task-notification.spec.ts tests/e2e/call-report-approval-notifications.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The inbox now has governed lifecycle controls; downstream dashboards can add SLA breach views and role-specific work queues without changing the notification ledger contract.

### 2026-05-04 - TB-H-003 Closed For Current Scope

**Implemented controls:**

- Added a corporate-action event-field policy with event-type specific required fields and type validation for cash dividends, stock dividends, splits, redemptions, rights, tenders, exchange offers, conversions, mergers, spinoffs, proxy votes, class actions, and informational changes.
- Extended corporate-action records with dynamic event payload, required-field snapshot, validation status, validation errors, and append-only field history.
- Updated ingestion to persist field validation metadata for every event while still allowing incomplete external feed events to land as ANNOUNCED with validation evidence.
- Updated scrub so an event cannot pass SCRUBBED unless the field policy passes for that event type.
- Updated amendments to create a new version with recomputed dynamic-field validation and AMENDED field-history evidence.
- Passed dynamic fields through back-office create/amend routes and feed ingest/replay.
- Added audit events for passed and failed corporate-action field validation.

**Files changed:**

- `server/services/corporate-action-event-field-policy.ts`
- `server/services/corporate-actions-service.ts`
- `server/services/corporate-action-feed-service.ts`
- `server/routes/back-office/corporate-actions.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_corporate_actions_dynamic_fields.sql`
- `tests/e2e/corporate-action-dynamic-fields.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/corporate-action-dynamic-fields.spec.ts tests/e2e/corporate-actions-lifecycle.spec.ts tests/e2e/corporate-action-feed-parser.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The dynamic-field ledger is now enforceable at scrub; production UI can use the required-field snapshot to render event-type specific forms and prevent incomplete submissions earlier in the workflow.

### 2026-05-04 - TB-H-004 Closed For Current Scope

**Implemented controls:**

- Added a corporate-action election policy for valid options, election channels, assisted-user/branch requirements, authority evidence, and maker-checker evidence separation.
- Extended CA entitlements with election status, election channel, assisted user, branch code, captured-by/captured-at, maker/checker users, maker-checker status, authority evidence, authority verification, capture notes, and election history.
- Updated election capture so assisted branch/RM/back-office/call-center elections require authority evidence and record append-only election history.
- Added audit logging for captured elections with channel provenance, authority evidence, and maker-checker status.
- Updated the back-office election route to pass capture channel, authority evidence, assisted-user context, branch code, and maker/checker evidence.
- Updated the Corporate Actions Desk election dialog to capture channel and authority reference before submitting an election.

**Files changed:**

- `server/services/corporate-action-election-policy.ts`
- `server/services/corporate-actions-service.ts`
- `server/routes/back-office/corporate-actions.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_ca_entitlement_assisted_elections.sql`
- `apps/back-office/src/pages/corporate-actions.tsx`
- `tests/e2e/corporate-action-assisted-elections.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/corporate-action-assisted-elections.spec.ts tests/e2e/corporate-actions-lifecycle.spec.ts tests/e2e/corporate-action-dynamic-fields.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- Client-portal initiated CA elections still use the separate `client_elections` model; a later consolidation can bridge portal elections into the entitlement election ledger with `CLIENT_PORTAL` channel provenance.

### 2026-05-04 - TB-H-006 Closed For Current Scope

**Implemented controls:**

- Extended degraded-mode incidents with status, owner user/team, severity, reason, affected feeds, failover decisions, resolution notes/evidence, resolved-by, status history, and last status change timestamp.
- Extended feed-health snapshots with primary/fallback state, last switch timestamp, and switch reason so failover routing state can be restored after restart.
- Updated feed registry initialization to restore persisted primary/fallback/switch state from the latest feed-health snapshots.
- Updated failover switching to persist SWITCHED and ROLLBACK decisions into degraded-mode incidents.
- Updated DR failover incident reporting to use persisted owner/team and affected-feed context.
- Updated resolution and RCA completion to append status-history entries and store resolution evidence.
- Updated degraded-mode routes and monitor UI to capture owner team, reason, affected feeds, resolution notes, and resolution evidence context.

**Files changed:**

- `server/services/degraded-mode-service.ts`
- `server/routes/back-office/degraded-mode.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_degraded_mode_persistence.sql`
- `apps/back-office/src/pages/degraded-mode-monitor.tsx`
- `tests/e2e/degraded-mode-persistence.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/degraded-mode-persistence.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The failover ledger is now durable; production feed adapters can call `updateFeedHealth` and `checkFeedHealth` on real probe results rather than seeded/mock health scores.

### 2026-05-04 - TB-C-001 Closed For Current Scope

**Implemented controls:**

- Added a governed late-filing SLA policy for call reports with configurable threshold, calendar key, and RM timezone.
- Added policy validation so invalid late-filing thresholds, calendar keys, or timezone settings are rejected before SLA evaluation.
- Evaluated scheduled call-report filings through the market calendar so holidays and non-business days are included in the explanation.
- Persisted late-filing calendar key, timezone, threshold days, due date, evaluated-at timestamp, and full SLA evaluation evidence on submitted call reports.
- Added a configurable `CRM_LATE_FILING_CALENDAR_KEY` lookup with environment fallback.
- Updated existing call-report notification tests to anchor on the governed SLA evaluation path.

**Files changed:**

- `server/services/call-report-late-filing-policy.ts`
- `server/services/call-report-service.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_call_report_late_filing_evidence.sql`
- `tests/e2e/call-report-late-filing-policy.spec.ts`
- `tests/e2e/call-report-timezone-business-days.spec.ts`
- `tests/e2e/call-report-approval-notifications.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/call-report-late-filing-policy.spec.ts tests/e2e/call-report-timezone-business-days.spec.ts tests/e2e/call-report-approval-notifications.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The SLA evaluator now stores explainable evidence; operations can later expose the evaluated date-by-date calendar trail in the call-report approval screen.

### 2026-05-04 - TB-D-001 Closed For Current Scope

**Implemented controls:**

- Added deterministic handover authorization routing for same-branch, cross-branch, and branch-unresolved handovers.
- Persisted source/target branch, checker branch, secondary source branch, required checker role, authorization owner team, due/escalation timestamps, routing snapshot, and routing history on `handovers`.
- Enforced branch-aware checker authorization so target-branch checkers own cross-branch handovers, with BO_HEAD/SYSTEM_ADMIN override and maker-checker separation.
- Added overdue authorization escalation processing that moves breached handovers to BO_HEAD ownership, writes routing history, audit evidence, and notification records when an owner user is known.
- Added a protected back-office endpoint to process overdue handover authorization escalations.

**Files changed:**

- `server/services/handover-routing-policy.ts`
- `server/services/handover-service.ts`
- `server/routes/back-office/handover.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_handover_authorization_routing.sql`
- `tests/e2e/handover-authorization-routing.spec.ts`
- `tests/e2e/handover-lifecycle.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/handover-authorization-routing.spec.ts tests/e2e/handover-lifecycle.spec.ts tests/e2e/handover-sla.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The route now records owner team and target branch. If operations require named queue owners, the next hardening step is assigning branch checker users/groups from a branch-role directory rather than team labels.

### 2026-05-04 - TB-D-002 Closed For Current Scope

**Implemented controls:**

- Added durable bulk handover upload policy with row-count limits, payload-size limits, deterministic grouping, resumable group results, retry decisioning, and bounded exponential backoff.
- Extended `bulk_upload_logs` with persisted input rows, group/row results, processing cursor, retry counters, retry schedule, lock metadata, resume token, idempotency key, and background-job status fields.
- Changed bulk processing to persist the upload before creating any handover requests, skip already-successful groups on retry, and update progress after each group.
- Added retry-pending, partial-completion, and terminal status handling with audit events for queueing, attempt start/completion, row success/failure, and scheduled retry.
- Added a protected processing endpoint so queued or retry-pending jobs can be resumed by an operator/worker while keeping the old immediate-processing wrapper compatible.

**Files changed:**

- `server/services/handover-bulk-upload-policy.ts`
- `server/services/handover-service.ts`
- `server/routes/back-office/handover.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_bulk_handover_jobs.sql`
- `tests/e2e/handover-bulk-upload-policy.spec.ts`
- `tests/e2e/handover-lifecycle.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/handover-bulk-upload-policy.spec.ts tests/e2e/handover-lifecycle.spec.ts tests/e2e/delegation-lifecycle.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The durable job path is ready for a scheduler/worker process. A production deployment should wire `retry_pending` jobs to the platform queue rather than relying on manual `process` calls.

### 2026-05-04 - TB-F-001 Closed For Current Scope

**Implemented controls:**

- Added risk-questionnaire versioning policy that treats `AUTHORIZED` and `REJECTED` questionnaires as immutable and directs changes through replacement versions.
- Extended questionnaire records with parent/supersedes/replaced-by lineage, explicit `version_no`, immutable lock metadata, rejection reason, and version history.
- Locked rejected questionnaires against direct soft-delete and locked questionnaire child objects against direct question, answer-option, and score-range edits/deletes.
- Added a controlled replacement-version service and route that clones questionnaire content into a new `UNAUTHORIZED` version while preserving lineage and source history.
- Updated rejection and authorization flows to stamp immutable lock metadata and version history evidence.

**Files changed:**

- `server/services/risk-questionnaire-versioning-policy.ts`
- `server/services/risk-profiling-service.ts`
- `server/routes/back-office/risk-profiling.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_risk_questionnaire_versioning.sql`
- `tests/e2e/risk-questionnaire-versioning-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/risk-questionnaire-versioning-policy.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The replacement-version workflow clones current questionnaire content. A later UI enhancement should expose a dedicated "Create replacement version" action and show lineage/version history to operations users.

### 2026-05-04 - TB-F-002 Closed For Current Scope

**Implemented controls:**

- Added asset-allocation taxonomy policy that normalizes user-entered asset-class labels and validates them against approved `asset_classes` reference data.
- Extended asset-allocation lines with `asset_class_id`, canonical `asset_class_code`, taxonomy validation timestamp, and taxonomy snapshot evidence.
- Bound create/update asset-allocation config flows to the taxonomy validator before any line records are persisted.
- Added authorization guard so legacy/unbound allocation lines cannot be authorized until reconciled to approved asset-class taxonomy.
- Added migration backfill that attempts to resolve existing allocation lines to `asset_classes` and marks unmatched lines in the taxonomy snapshot.

**Files changed:**

- `server/services/asset-allocation-taxonomy-policy.ts`
- `server/services/risk-profiling-service.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_bind_asset_allocation_taxonomy.sql`
- `tests/e2e/asset-allocation-taxonomy-policy.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/asset-allocation-taxonomy-policy.spec.ts tests/e2e/risk-questionnaire-versioning-policy.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The allocation line now binds to controlled asset-class reference data. Product/security-specific sub-taxonomy can be added later by linking `asset_classes` to a richer product taxonomy once the reference model is formally defined.

### 2026-05-04 - TB-B-003 Closed For Current Scope

**Implemented controls:**

- Added product-specific Trust Banking onboarding policy for mandate compatibility, minimum authorized signatories, required party types, document reference rules, and currency format.
- Added product-to-default-mandate mapping for IMA directed/discretionary, PMT, UITF, pre-need, employee benefit, escrow, agency, and safekeeping products.
- Extended trust accounts and trust mandates with onboarding/mandate validation status and evidence payloads.
- Wired foundation creation to run product-specific validation before creating the account stack and to persist validation evidence on the trust account, mandate, and foundation event.
- Added migration backfill to mark legacy trust account and mandate records as passed with warnings until formally revalidated.

**Files changed:**

- `server/services/trust-product-onboarding-policy.ts`
- `server/services/trust-account-foundation-service.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_trust_onboarding_product_validations.sql`
- `tests/e2e/trust-product-onboarding-policy.spec.ts`
- `tests/e2e/trust-account-foundation.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/trust-product-onboarding-policy.spec.ts tests/e2e/trust-account-foundation.spec.ts`
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- Product rules are now enforceable and auditable. Business can refine individual product rule thresholds, especially PMT, pre-need, and employee-benefit party requirements, through later configuration governance.

### 2026-05-04 - TB-C-002 Closed For Current Scope

**Implemented controls:**

- Added a reusable meeting scheduling policy that validates meeting windows and evaluates overlaps without treating adjacent meetings as conflicts.
- Promoted the existing ad hoc conflict warning into persisted scheduling evidence on `meetings`.
- Added market-calendar-aware non-business-day warnings using the configured CRM meeting calendar key and Manila timezone defaults.
- Extended meeting create, update, and reschedule flows to stamp validation status, conflict status, conflict details, warnings, holiday flag, and full evidence payload.
- Added route support for optional `calendar_key` and `branch_id` during meeting creation.
- Added migration backfill and indexes for scheduling-window and holiday-warning review.

**Files changed:**

- `server/services/meeting-scheduling-policy.ts`
- `server/services/meeting-service.ts`
- `server/routes/back-office/meetings.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_meeting_scheduling_controls.sql`
- `tests/e2e/meeting-scheduling-policy.spec.ts`
- `tests/e2e/meeting-callreport.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/meeting-scheduling-policy.spec.ts tests/e2e/meeting-callreport.spec.ts`
- Passed: targeted TypeScript error scan for touched meeting files.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- Invitee-to-invitee conflict detection currently records organizer, relationship, and invitee-vs-organizer overlaps. A later enhancement can add a direct invitee join once the calendar UI exposes full participant selection.

### 2026-05-04 - TB-C-003 Closed For Current Scope

**Implemented controls:**

- Added a reusable approval auto-unclaim policy that computes claim expiry by configured business days, timezone, and market calendar.
- Added branch-level `calendar_key` and `timezone` defaults so approval expiry can honor branch calendars.
- Made pending call-report approvals unowned until explicit claim instead of storing a placeholder supervisor.
- Extended approval claims with claim calendar, timezone, expiry date/timestamp, auto-unclaim count, last auto-unclaim timestamp, evidence payload, and bounded claim history.
- Updated claim processing to stamp business-day expiry evidence at claim time.
- Replaced the scheduler's two-calendar-day cutoff with per-claim business-day evaluation and supervisor notification when a claim is released.
- Added migration backfill and indexes for claimed approval expiry review.

**Files changed:**

- `server/services/approval-auto-unclaim-policy.ts`
- `server/services/approval-workflow-service.ts`
- `server/services/call-report-service.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_extend_call_report_approval_auto_unclaim.sql`
- `tests/e2e/approval-auto-unclaim-policy.spec.ts`
- `tests/e2e/approval-auto-unclaim-scheduler.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/approval-auto-unclaim-policy.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts`
- Passed: `npm test -- --run tests/e2e/meeting-callreport.spec.ts tests/e2e/call-report-approval-notifications.spec.ts tests/e2e/call-report-routing-filters.spec.ts`
- Passed: targeted TypeScript error scan for touched approval/call-report files.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- Branch calendar/timezone are now first-class fields with defaults. Operations should populate branch-specific values where a branch follows a non-PSE working calendar.

### 2026-05-04 - TB-D-003 Closed For Current Scope

**Implemented controls:**

- Added a durable `bulk_upload_failure_items` queue for failed handover bulk-upload rows.
- Each failed row now records upload, group key, row number, original row payload, error, status, assignment, retry state, resolution evidence, and linked handover when retry succeeds.
- Bulk processing now queues failure items on row failure and resolves matching open failure items when a later group retry succeeds.
- Added workbench service methods to list, assign, resolve/waive, and retry individual failed rows without rerunning the entire upload.
- Added protected back-office routes for failure list, assignment, resolution, and single-row retry.
- Added audit event types for failure queued, assigned, resolved, and retried.
- Added migration support, including backfill from existing failed group results into open failure items.

**Files changed:**

- `server/services/handover-service.ts`
- `server/routes/back-office/handover.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_bulk_upload_failure_workbench.sql`
- `tests/e2e/handover-bulk-remediation-workbench.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/handover-bulk-remediation-workbench.spec.ts tests/e2e/handover-bulk-upload-policy.spec.ts tests/e2e/handover-lifecycle.spec.ts`
- Passed: targeted TypeScript error scan for touched handover files.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The API workbench is complete. A later UI pass can surface the queue as a dedicated operations screen with filters and inline retry forms.

### 2026-05-04 - TB-F-003 Closed For Current Scope

**Implemented controls:**

- Added versioned suitability disclosure content with code, version number, effective dates, status, content payload, and SHA-256 content hash.
- Added proposal-level disclosure evidence records linked to proposal, risk profile, disclosure version, suitability snapshot, acceptance status, and final acceptance metadata.
- Extended investment proposals with disclosure status, disclosure version, evidence ID, disclosure snapshot, and client acceptance evidence payload.
- Preparing a proposal for client delivery now creates pending disclosure evidence with the exact disclosure version and suitability result snapshot.
- Client acceptance now requires pending disclosure evidence and stamps accepted-by, accepted-at, channel, method, IP/user-agent, disclosure hash, and version.
- Client rejection now records rejected disclosure evidence for pending proposal disclosures.
- Added back-office routes to list/create disclosure versions and pass acceptance metadata through the client acceptance action.

**Files changed:**

- `server/services/proposal-disclosure-policy.ts`
- `server/services/proposal-service.ts`
- `server/routes/back-office/proposals.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_suitability_disclosure_evidence.sql`
- `tests/e2e/proposal-disclosure-evidence.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/proposal-disclosure-evidence.spec.ts`
- Passed: targeted TypeScript error scan for touched proposal/disclosure files.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- Evidence is now durable and versioned. A later client-portal pass should surface the disclosure packet and collect acceptance directly from the authenticated client session rather than through back-office simulation.

### 2026-05-04 - TB-G-005 Closed For Current Scope

**Implemented controls:**

- Extended DSAR requests with response payload hash, SLA alerts, retention check, DPO decision evidence, delivery status/evidence, archival status/evidence, and artifact bundle hash URI.
- DSAR processing now compiles PII inventory, retention evidence, response bundle URI, and hash before DPO approval.
- DPO approval now stamps decision evidence and marks the response ready for delivery.
- Added DSAR delivery and archival service methods and back-office routes.
- SLA breach checks now persist alert evidence on open DSAR requests.
- Extended content packs with payload hash, signature verification evidence, activation approval evidence, rollback evidence, and archival proof.
- Content-pack activation now blocks if signature verification fails and archives superseded active packs with evidence.

**Files changed:**

- `server/services/dsar-service.ts`
- `server/services/content-pack-service.ts`
- `server/routes/back-office/dsar.ts`
- `server/routes/back-office/content-packs.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_harden_dsar_content_pack_workflows.sql`
- `tests/e2e/dsar-content-pack-workflow-hardening.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/dsar-content-pack-workflow-hardening.spec.ts`
- Passed: targeted TypeScript error scan for touched DSAR/content-pack files.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- Workflow evidence is now durable. Production deployments should connect DSAR delivery/archive URIs to the approved document vault and outbound secure-delivery provider.

### 2026-05-04 - TB-H-007 Closed For Current Scope

**Implemented controls:**

- Extended breach notifications into a privacy breach incident workflow with reported-by/time, affected-client scope, affected data categories, SPI/identity-fraud/serious-harm indicators, risk assessment, playbook steps, status history, containment evidence, notification evidence, closure evidence, and SLA alerts.
- Added a policy layer that classifies notifiable incidents, computes 72-hour NPC and data-subject notification timers from knowledge time, normalizes notification evidence, and enforces DPO closure evidence.
- Added service workflows to report, triage, contain, record NPC notification, record data-subject notification, close incidents, and stamp overdue notification SLA alerts.
- Added privacy-role protected API routes under `/api/v1/privacy-breaches`.
- Added a Privacy Center breach playbook tab with incident reporting, timer visibility, evidence badges, and workflow actions.
- Added migration support to backfill existing `breach_notifications` rows into the new playbook/evidence model.

**Files changed:**

- `server/services/privacy-breach-policy.ts`
- `server/services/privacy-breach-service.ts`
- `server/routes/back-office/privacy-breaches.ts`
- `server/routes.ts`
- `apps/back-office/src/pages/consent-privacy-center.tsx`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_privacy_breach_workflow.sql`
- `tests/e2e/privacy-breach-workflow.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/privacy-breach-workflow.spec.ts`
- Passed: targeted TypeScript error scan for touched privacy-breach/UI/schema files via full check output.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The workflow stores DBNMS/client-notice references and payload hashes. Production deployments should connect these actions to the actual NPC DBNMS submission process and outbound client-notification provider.

### 2026-05-04 - TB-I-003 Closed For Current Scope

**Implemented controls:**

- Added a shared `domain_events` ledger with domain event ID, event type/version, aggregate identity, source system/reference, deterministic idempotency key, event correlation/causation, payload hash, duplicate counters, replay state, replay counts, and replay history.
- Added `domain_event_replay_requests` to track replay requests from pending through in-progress, completed, or failed states with reason, actor, attempt count, result payload, and failure evidence.
- Added a shared policy for stable JSON hashing, deterministic idempotency-key generation, domain event envelopes, and replay reason validation.
- Added a domain event service for record/dedupe, replay request, replay start, replay completion, replay failure, and list/get workflows.
- Exposed back-office routes under `/api/v1/domain-events`.
- Wired TFP accounting events and corporate-action feed ingestion into the shared ledger while retaining their domain-specific tables.
- Added migration support with indexes and TFP accounting event backfill.

**Files changed:**

- `server/services/domain-event-idempotency-policy.ts`
- `server/services/domain-event-service.ts`
- `server/services/tfp-accounting-event-service.ts`
- `server/services/corporate-action-feed-service.ts`
- `server/routes/back-office/domain-events.ts`
- `server/routes.ts`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_domain_event_idempotency_replay.sql`
- `tests/e2e/domain-event-idempotency-replay.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/domain-event-idempotency-replay.spec.ts tests/e2e/tfp-accounting-event-contract.spec.ts tests/e2e/corporate-action-feed-parser.spec.ts`
- Passed: targeted TypeScript error scan for touched domain-event/TFP/CA/schema files via full check output.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The shared ledger is now available and adopted by two event-producing paths. Additional producers such as handover, onboarding, service requests, GL posting, and client portal events should migrate onto the same helper as their next feature work touches them.

### 2026-05-04 - TB-J-003 Closed For Current Scope

**Implemented controls:**

- Added a unified `client_portal_evidence_events` ledger for portal activity, messages, statement downloads, and notification history.
- Added a portal evidence policy for stable evidence event IDs and deterministic payload hashing.
- Added a portal evidence service with message, statement-download, notification, and session-scoped list methods.
- Wired client message send/read events into the shared evidence ledger.
- Wired official statement downloads into the shared evidence ledger with content hash, file size, retention, and source statement metadata.
- Wired notification retrieval to backfill/record notification evidence entries.
- Added a session-scoped client portal endpoint at `/api/v1/client-portal/evidence-history`.
- Added an Activity History panel to the client portal messages page.
- Added migration support and backfill from `client_messages`, `client_statements`, and `notification_log`.

**Files changed:**

- `server/services/client-portal-evidence-policy.ts`
- `server/services/client-portal-evidence-service.ts`
- `server/services/client-message-service.ts`
- `server/services/statement-service.ts`
- `server/services/client-portal-service.ts`
- `server/routes/client-portal.ts`
- `apps/client-portal/src/pages/messages.tsx`
- `packages/shared/src/schema.ts`
- `drizzle/20260504_add_client_portal_evidence_history.sql`
- `tests/e2e/client-portal-evidence-history.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/client-portal-evidence-history.spec.ts tests/e2e/client-portal-ownership.spec.ts tests/e2e/statement-download-policy.spec.ts`
- Passed: targeted TypeScript error scan for touched portal evidence/message/statement/schema files via full check output.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown` typing errors.

**Residual scope for later hardening:**

- The shared evidence ledger is now available from the portal. Future portal pages should record their own client-visible events through the same service instead of adding page-local history fields.

### 2026-05-04 - TB-K-004 Closed For Current Scope

**Implemented controls:**

- Extended active `system_config` records with scope, approval status, pending value, effective dates, change reason, approval timestamp, and last governance version linkage.
- Added durable `system_config_versions` history with version IDs, version numbers, previous/proposed/effective values, scope, approval state, reviewer evidence, rollback target linkage, diff hashes, and governance evidence payloads.
- Added a typed governance policy for key normalization, value-type validation, scoped configuration, change-reason enforcement, deterministic version IDs, and redacted diff evidence.
- Added a DB-backed governance service for submit, approve, reject, rollback, history listing, audit logging, and runtime cache invalidation.
- Replaced the previous process-local `config-versioning-service` implementation with a deprecated facade pointing callers to the durable governance service.
- Extended system-config routes with version history, submit-for-approval, approve, reject, and rollback endpoints while preserving existing masked reads, type validation, restricted PUT, and optimistic-lock behavior.
- Added PostgreSQL `pg_notify` publication plus a startup `LISTEN system_config_changed` hook for CRM late-filing cache invalidation across app instances.
- Added migration support with baseline backfill from existing `system_config` rows into `system_config_versions`.

**Files changed:**

- `packages/shared/src/schema.ts`
- `server/services/system-config-governance-policy.ts`
- `server/services/system-config-governance-service.ts`
- `server/services/config-versioning-service.ts`
- `server/services/call-report-service.ts`
- `server/routes/back-office/system-config.ts`
- `server/routes.ts`
- `drizzle/20260504_add_system_config_governance.sql`
- `tests/e2e/system-config-governance.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/system-config-governance.spec.ts`
- Passed: targeted TypeScript error scan for touched configuration-governance/schema/routes files via full check output.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown`/implicit-any typing errors.

**Residual scope for later hardening:**

- The active `system_config` table remains unique by `config_key` for backward compatibility. Scoped override resolution is now modelled in the ledger/schema fields; consumers can adopt scope-aware lookup once product/branch-specific rules are prioritized.

### 2026-05-04 - TB-H-005 Closed For Current Scope

**Implemented controls:**

- Added filing-level eFPS/tax-authority fields to `form1601fq`, including submission ID, channel, authority status/reference, acknowledgement payload, payload hash, attempt count, retry timestamp, last error, and evidence payload.
- Added durable `tax_authority_submissions` ledger for BIR/eFPS submissions with idempotency key, request/response payloads, payload hash, authority reference, submission/acknowledgement status, attempts, retry history, and evidence.
- Added a tax-authority integration policy for eFPS readiness validation, deterministic payload hashing/idempotency, submission ID generation, acknowledgement normalization, retry timing, and credential-profile separation.
- Added a tax-authority submission service for 1601-FQ submission packet creation, duplicate/idempotent reuse, acknowledgement capture, controlled retry scheduling, filing status synchronization, and audit logging.
- Exposed back-office tax routes for listing authority submissions, submitting a 1601-FQ eFPS packet, capturing acknowledgements, and scheduling retries.
- Added migration support with backfill from already-submitted `form1601fq` records.

**Files changed:**

- `packages/shared/src/schema.ts`
- `server/services/tax-authority-integration-policy.ts`
- `server/services/tax-authority-submission-service.ts`
- `server/routes/back-office/tax.ts`
- `drizzle/20260504_add_tax_authority_efps_submissions.sql`
- `tests/e2e/tax-authority-efps-integration.spec.ts`

**Verification:**

- Passed: `npm test -- --run tests/e2e/tax-authority-efps-integration.spec.ts`
- Passed: `npm test -- --run tests/e2e/tax-service.spec.ts`
- Passed: targeted TypeScript error scan for touched tax-authority/schema/routes files via full check output.
- Blocked: full `npm run check -- --pretty false --incremental false` still fails only on pre-existing `server/scripts/seed-demo-supplement.ts` `unknown`/implicit-any typing errors.

**Residual scope for later hardening:**

- The live external BIR/eFPS transport is intentionally behind a `LIVE` credential profile. Production enablement still requires bank-approved eFPS credentials, endpoint onboarding, certificate handling, and operational runbook sign-off.

### 2026-05-05 - Stabilization Pass 1

**Stabilization actions:**

- Fixed the full TypeScript blocker in `server/scripts/seed-demo-supplement.ts` by adding explicit row types for Drizzle select/returning results used by the demo data supplement.
- Ran the full workspace TypeScript check after the fix.
- Ran a focused Trust Banking stabilization test set across portal ownership, trust account foundation, fees/accounting events, corporate actions, service requests, config governance, tax/eFPS, domain events, privacy breach, notification governance, audit normalization, and tax service lifecycle.
- Ran all workspace production builds.
- Performed static migration readiness checks for the forward 20260504 migrations; no destructive `DROP`/`TRUNCATE` patterns were found outside explicit `.rollback.sql` files.
- Started the API on port `5099` and verified `/api/v1/health` and `/health`.

**Verification:**

- Passed: `npm run check -- --pretty false --incremental false`
- Passed: `npm test -- --run tests/e2e/client-portal-ownership.spec.ts tests/e2e/trust-account-foundation.spec.ts tests/e2e/tfp-product-fee-calculation.spec.ts tests/e2e/tfp-accounting-event-contract.spec.ts tests/e2e/corporate-action-feed-parser.spec.ts tests/e2e/corporate-action-dynamic-fields.spec.ts tests/e2e/corporate-action-assisted-elections.spec.ts tests/e2e/ca-entitlement-reconciliation.spec.ts tests/e2e/service-request-id-policy.spec.ts tests/e2e/service-request-reassignment-policy.spec.ts tests/e2e/sr-document-evidence-policy.spec.ts tests/e2e/system-config-governance.spec.ts tests/e2e/tax-authority-efps-integration.spec.ts tests/e2e/domain-event-idempotency-replay.spec.ts tests/e2e/client-portal-evidence-history.spec.ts tests/e2e/privacy-breach-workflow.spec.ts tests/e2e/notification-governance-policy.spec.ts tests/e2e/audit-normalization-policy.spec.ts tests/e2e/tax-service.spec.ts`
- Passed: `npm run build:all`
- Passed: `curl http://127.0.0.1:5099/api/v1/health`
- Passed: `curl http://127.0.0.1:5099/health`

**Environment blockers:**

- Live migration application and DB-backed smoke tests were not run because the local database was unavailable. The API boot logged `connect ECONNREFUSED 127.0.0.1:5433` for the configured local Postgres endpoint.
- Several production integrations remain in simulated mode without environment configuration: BSP PERA Sys, external ML fraud scoring, and real document virus scanning.

### 2026-05-05 - Cloud SQL Migration Stabilization

**Cloud SQL target:**

- Connected through Cloud SQL Auth Proxy to `wealthmanagement-491511:asia-southeast1:wealth-management`.
- Verified the application `DATABASE_URL` reaches database `trust-banking-db` as user `trust_banking`.

**Migration actions:**

- Applied the forward SQL migrations to Cloud SQL using a dependency-aware order for the 20260504 feature migrations.
- Moved report-pack operations ahead of client statement download controls because `client_statements.report_pack_output_id` references `report_pack_outputs`.
- Applied Danamon OEMS foundation/lifecycle before core-banking instructions and adapter hardening because core-banking instructions reference `oems_integration_adapters`.
- Applied TFP accounting events before domain-event replay backfill because the replay migration backfills from `tfp_accounting_events`.
- Applied corporate-action feed messages before entitlement reconciliation sources because custody confirmations reference `corporate_action_feed_messages`.
- Hardened migration SQL for future reruns by adding order-safe guards for bulk upload log JSON columns, client statement evidence columns, CA feed/custody FK creation, core-banking adapter FK creation, and TFP/domain-event backfill ordering.

**Cloud SQL verification:**

- Passed: schema object check for `system_config_versions`, `tax_authority_submissions`, `client_portal_evidence_events`, `domain_events`, `bulk_upload_failure_items`, `corporate_action_feed_messages`, `corporate_action_custody_confirmations`, `core_banking_instructions`, `report_pack_outputs`, and `oems_integration_adapters`.
- Passed: column check for `bulk_upload_logs.input_rows`, `bulk_upload_logs.row_results`, `bulk_upload_logs.group_results`, `client_statements.report_pack_output_id`, `client_statements.content_hash`, `client_statements.last_downloaded_by`, `client_statements.last_downloaded_ip`, `client_statements.access_history`, `oems_integration_adapters.require_tls`, and `oems_integration_adapters.security_policy_status`.
- Observed migrated row counts: `client_portal_evidence_events=19`, `system_config_versions=20`, `oems_integration_adapters=9`, `report_pack_outputs=0`, `tax_authority_submissions=0`.
- Passed: rollback-only syntax/idempotency check for the patched migration SQL.
- Passed: `npm run check -- --pretty false --incremental false`
- Passed: `npm test -- --run tests/e2e/handover-bulk-remediation-workbench.spec.ts tests/e2e/client-portal-evidence-history.spec.ts tests/e2e/system-config-governance.spec.ts tests/e2e/tax-authority-efps-integration.spec.ts tests/e2e/domain-event-idempotency-replay.spec.ts tests/e2e/danamon-oems.spec.ts`
- Passed: API boot against Cloud SQL and `curl -fsS http://127.0.0.1:5099/api/v1/health`

**Remaining environment notes:**

- `GOOGLE_APPLICATION_CREDENTIALS` points to a missing local service-account file, so the proxy was started with a `vkumar@primesoft.net` access token.
- Production integrations still remain in simulated mode until BSP PERA Sys, external ML fraud scoring, and real document virus scanning credentials/endpoints are configured.
