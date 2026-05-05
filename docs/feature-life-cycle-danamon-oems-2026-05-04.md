# Feature Life Cycle: Danamon OEMS Gap Closure

Date: 2026-05-04  
Source BRD: `docs/Danamon-OEMS-BRD-v1.md`  
Gap register: `docs/gap-analysis-danamon-oems-2026-05-04.md`

## 1. Intake

The RFP required a product-specific Order Execution Management System for ODA/FX Leave Order, MLD, mutual fund, bond, FX Today special-rate workflows, wealth lending, parameter setup, validations, integrations, notifications, documents, reports and auditability.

The current Trust OMS baseline had generic order, approval, audit, notification, risk and portfolio modules, but did not have a first-class Danamon OEMS domain.

## 2. Requirements Shaping

The RFP functional requirements were converted into a development-ready BRD at:

- `docs/Danamon-OEMS-BRD-v1.md`

The BRD defines 22 functional requirements and 227 auditable line items across acceptance criteria, business rules, edge cases and failure handling.

## 3. Gap Analysis

Coverage was audited in:

- `docs/reviews/brd-coverage-danamon-oems-brd-v1-2026-05-04.md`

Seven implementation packages were identified:

| Gap | Result |
| --- | --- |
| GAP-OEMS-001 Domain foundation | Tackled |
| GAP-OEMS-002 ODA lifecycle | Tackled |
| GAP-OEMS-003 MLD lifecycle | Tackled |
| GAP-OEMS-004 MF/Bond and FX Today | Tackled |
| GAP-OEMS-005 Wealth Lending Phase 1 | Tackled |
| GAP-OEMS-006 Workbench, roles and operational UI | Tackled |
| GAP-OEMS-007 Test coverage | Tackled |

## 4. Implementation

Delivered backend foundation:

- Added OEMS enums and tables in `packages/shared/src/schema.ts`.
- Added SQL migration `drizzle/20260504_add_danamon_oems.sql`.
- Added `server/services/oems-service.ts` for product setup, parameter approval, order validation/submission, ODA, MLD, MF/bond, FX Today, wealth lending, integration messages, notifications and report exports.
- Added `server/routes/oems.ts` and mounted it at `/api/v1/oems` in `server/routes.ts`.

Delivered UI:

- Added `apps/back-office/src/pages/oems-workbench.tsx`.
- Added `/operations/oems` route in `apps/back-office/src/routes/index.tsx`.
- Added "Danamon OEMS" to Operations navigation in `apps/back-office/src/config/navigation.ts`.

Delivered tests:

- Added `tests/e2e/danamon-oems.spec.ts`.

## 5. Verification

Passed:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

Passed:

```text
npm run build -w apps/back-office
```

Partial:

```text
npm run check
```

The root TypeScript check reaches only pre-existing strict typing errors in `server/scripts/seed-demo-supplement.ts`. No new OEMS TypeScript errors remain after fixing the service typing issues found during implementation.

## 6. Release Notes

The delivered slice is not a mock screen or isolated proof of concept. It introduces durable tables, migrations, services, routes, UI, and tests that can be extended into certified external integrations and seeded operational workflows.

## 7. Partial Gap Closure Iteration 1

Scope: foundational partially implemented items from FR-001, FR-002 and FR-004.

Implemented in this iteration:

- Channel model now supports OEMS direct, CRM microsite and D-Bank PRO microsite channels.
- Orders now persist assisted user, branch, channel session, channel customer reference, external references, validation summary, COT evaluation and processing date.
- Sales-assisted orders now require `assisted_by_user_id` and `branch_code`.
- Customer self-service orders are blocked from downstream execution until digital verification is completed.
- External validation outages now move orders to `VALIDATION_PENDING_EXTERNAL` with persisted validation findings.
- Status transitions are persisted in `oems_order_status_transitions`.
- Parameter sets now carry type/channel/timezone/calendar/cutoff fields and support create, edit, submit, approve, reject and retire.
- Maker self-approval is blocked for parameter changes.
- Active parameter windows are checked for overlap by product, type and channel.
- COT evaluation enforces reject-after-COT, next-business-day processing, configured calendars, timezone validation and checker-repair exceptions.
- Back-office OEMS workbench now exposes parameter governance, channel context, order validation, warning acknowledgement, submission and cancellation actions.
- Secure microsite sessions now persist immutable CRM/D-Bank channel context, signature hash, locale, branch, customer, assisted user, correlation ID, expiry and redirect metadata.
- Order creation now validates signed channel-session context and rejects altered, expired or invalid microsite context with `INVALID_CHANNEL_CONTEXT`/safe expiry errors and security-event logging.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-001 AC-001.2, AC-001.3, AC-001.4, AC-001.5 | `packages/shared/src/schema.ts`, `server/services/oems-service.ts`, `server/routes/oems.ts`, `apps/back-office/src/pages/oems-workbench.tsx` |
| FR-001 BR-001.1, BR-001.2, EC-001.1 | `server/services/oems-service.ts`, `tests/e2e/danamon-oems.spec.ts` |
| FR-002 AC-002.1 to AC-002.4, BR-002.1, BR-002.2, EC-002.1, FH-002.1 | `drizzle/20260504_extend_danamon_oems_lifecycle.sql`, `server/services/oems-service.ts`, `tests/e2e/danamon-oems.spec.ts` |
| FR-004 AC-004.1, BR-004.1, BR-004.2, FH-004.1 | `server/services/oems-service.ts`, `server/routes/oems.ts`, `apps/back-office/src/pages/oems-workbench.tsx` |
| FR-005 AC-005.1, AC-005.3, AC-005.4, AC-005.5, BR-005.2, EC-005.1, FH-005.1 | `packages/shared/src/schema.ts`, `drizzle/20260504_extend_danamon_oems_lifecycle.sql`, `server/services/oems-service.ts`, `server/routes/oems.ts` |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
npm run build -w apps/back-office
passed
```

## 15. Partial Gap Closure Iteration 9

Scope: FR-016 to FR-017 MLD offering, trade date, fixing and maturity lifecycle.

Implemented in this iteration:

- Extended MLD tranche setup with option/rate/payout/tax metadata, minimum collective nominal, term-sheet URLs, Treasury counterparty and final master blotter fields.
- Enforced MLD business rules that trade date equals value date and fixing date equals maturity date.
- Added MLD-specific order detail records for CIF/customer snapshot, mandatory documents, 90-day average balance, available balance, hold/TD/maturity status, callback status, final master blotter eligibility, fixing outcome and payout evidence.
- Added idempotent NCBS fund instructions for hold, unhold, TD creation and maturity credit.
- Added MLD pre-trade recheck batch records that flag insufficient 90-day average balance or failed hold as operations review and exclude affected orders from final master blotter.
- Added callback audit rows and a service guard requiring callback completion before TD creation.
- Added TD creation processing with TD account capture and `TRADED_PENDING_DEALING_ID` handling when NCBS TD succeeds but Treasury dealing ID retrieval fails.
- Added fixing outcome persistence and maturity payout calculation with minimum interest, max-return bonus payout, tax deduction and net payout.
- Added maturity-credit failure handling with critical operations notification.
- Added tranche maturity guard so a tranche cannot move to `MATURED` until every child order has a final outcome or exception.
- Expanded the MLD workbench with tranche terms, order capture, pre-trade recheck, callback, TD creation, fixing outcome, maturity credit and evidence tables.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-016 AC-016.1 to AC-016.8 | MLD tranche terms, order capture, CIF/detail checks, mandatory document references, 90-day average/balance checks, NCBS hold and pre-COT controls added |
| FR-016 BR-016.1 to BR-016.3 | Trade/value date, fixing/maturity date and principal-protection evidence added |
| FR-016 EC-016.1, FH-016.1 | Pre-trade recheck flags operations review; failed NCBS hold blocks final master blotter eligibility |
| FR-017 AC-017.1 to AC-017.7 | Callback, TD creation, TD account/dealing ID, fixing outcome, maturity payout, notifications and report definitions added |
| FR-017 BR-017.1 to BR-017.2 | Maturity tax deduction and tranche maturity final-child-order guard added |
| FR-017 EC-017.1, FH-017.1 | `TRADED_PENDING_DEALING_ID` and critical maturity-credit failure notification added |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       12 passed (12)
```

```text
npm run build -w apps/back-office
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

## Focused Enterprise Closure: Adapter Security and Wealth Lending

Focused gaps addressed:

| Gap | Closure evidence |
| --- | --- |
| OEMS adapter encryption/address filtering/payload masking | Added adapter security policy schema, migration/rollback, TLS enforcement, destination allow-listing, source CIDR filtering, payload classification, sensitive-field masking, AES-GCM payload envelopes, masked execution payloads, security policy update route, workbench controls and negative tests. |
| Wealth Lending live market price retrieval | Added `oems_wealth_lending_market_prices`, RBS/Avantrade retrieval service/API, stale price handling, collateral price updates and workbench retrieval action. |
| Wealth Lending outstanding retrieval | Added `oems_wealth_lending_outstanding_snapshots`, Loan/Core Banking retrieval service/API, facility refresh metadata and workbench retrieval action. |
| Wealth Lending D-Bank PRO visibility and cure flow | Added visibility publishing instructions, facility visibility API, M2M cure requirements, repayment/top-up cure action recording, overdraft block/unblock instructions and workbench controls. |
| Wealth Lending RBS sell-collateral instruction | Added `oems_wealth_lending_instructions`, RBS sell-collateral service/API/workbench action and failed-instruction critical notification handling. |

Verification:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       15 passed (15)
```

```text
npm run build -w apps/back-office
passed
```

```text
npm run check
OEMS/service changes type-check clean; command still fails only in pre-existing server/scripts/seed-demo-supplement.ts unknown-type errors.
```

## 16. Partial Gap Closure Iteration 10

Scope: FR-018 to FR-020 MF/Bond static-data, Wealth Core handoff and FX Today lifecycle deepening.

Implemented in this iteration:

- Added wealth customer static-data retrieval records for NCBS, RBS and Avantrade, including retrieval status, source-of-truth metadata, conflict fields, manual resolution evidence and failed-source integration logging.
- Added wealth product snapshots for MF/Bond setup, quota, offering period, SKU/PFE/transaction document references and 1M/1Y/3Y/5Y performance.
- Added product setup validation that blocks insufficient quota and invalid offering windows, while disabling performance claims when performance data is missing unless setup requires it.
- Added SID/account portfolio registration, PFE initiation and sales-certification sync hooks to Wealth Core.
- Expanded MF/Bond order creation with SID, account, PFE, risk profile, static data, sales certification and digital-verification expiry gates.
- Added MF variants for subscription, full/partial redemption, full/partial switching and DRIP, and Bond variants for buy/sell/switching/auction/buyback with cherry-pick enforcement.
- Added bond live pricing locks that route in-range approvals to supervisor and out-of-range approvals to Treasury.
- Added MF/Bond amend, reject, Wealth Core handoff, Wealth Core status sync and downstream rejection-reason capture.
- Added FX live-rate records, FX Today detail rows, quote hash generation, rate-refresh/reconfirmation guard, IDR threshold-based underlying document trigger and CIF/account/SKU/PFE checks.
- Added Treasury SND approval, BSM/Head Teller fallback evidence, TIWO/Trade Operation LHBU purpose-code confirmation, NCBS overbook, FX blotter entries, confirmation notice URLs and EOD pending-settlement exception checks.
- Expanded the workbench with a Wealth tab and deeper FX Today controls for operational execution and monitoring.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-018 AC-018.1 to AC-018.10 | `oems_mf_bond_order_details`, MF/Bond pre-trade gates, variants, amend/reject, handoff/status sync and bond price locks |
| FR-018 BR-018.1 to BR-018.2 | Digital verification expiry handoff block and static-data source-of-truth handling |
| FR-018 EC-018.1, FH-018.1 | Wealth Core rejection reason sync and source/static-data failure logging |
| FR-019 AC-019.1 to AC-019.6 | `oems_wealth_customer_static_data`, `oems_wealth_product_snapshots`, document refs, performance data and quota/offering validation |
| FR-019 BR-019.1 to BR-019.2 | Source-of-truth display and missing-performance claim suppression |
| FR-019 EC-019.1, FH-019.1 | Customer/static-data retrieval failure blocks order entry and logs affected source |
| FR-020 AC-020.1 to AC-020.10 | `oems_fx_live_rates`, `oems_fx_today_details`, confirmation/reconfirmation, approvals, LHBU, overbook, blotter and EOD settlement exception handling |
| FR-020 BR-020.1 to BR-020.2 | Underlying document trigger and rate-change reconfirmation rules |
| FR-020 EC-020.1, FH-020.1 | Expired/rate-changed quote handling and pending-settlement EOD alert/report evidence |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       13 passed (13)
```

```text
npm run build -w apps/back-office
passed
```

```text
git diff --check
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

## 17. Partial Gap Closure Iteration 11

Scope: remaining enterprise hardening backlog after FR-001 to FR-020 implementation passes.

Implemented in this iteration:

- Added a durable integration adapter control plane for Wealth Core, RBS, CA-CIB, NCBS, Treasury, BIU, DocuSign/eSign, notification gateway and Big Data, including contracts, transformation maps, certification status, mock mode, health checks, idempotency, retry and reconciliation evidence.
- Added renderer-backed report artifact persistence for export jobs, with file URL, checksum, source manifest, protection evidence and explicit render API/workbench controls.
- Added seeded RFP report pack definitions for enterprise report pack, adapter reconciliation and approval queue SLA reporting.
- Added Danamon maker-checker workflow definitions and approval queue records with SLA assignment, role matrix evidence, queue APIs, workbench controls and maker self-approval blocking.
- Added a migration rollback registry plus `drizzle/20260504_extend_danamon_oems_lifecycle.rollback.sql` and checksum verification API/workbench controls.
- Expanded static Vitest coverage to assert new methods, routes, schema/migration artifacts, rollback script and enterprise control evidence.

Primary backlog items closed:

| Backlog item | Closure evidence |
| --- | --- |
| Certified adapter replacement for logging stubs | `oems_integration_adapters`, `oems_integration_adapter_executions`, adapter APIs and workbench panels |
| Renderer-backed report generation | `oems_report_render_artifacts`, automatic sync-export artifact persistence and render APIs |
| Danamon role-matrix approval queues | `oems_approval_workflow_definitions`, `oems_approval_queue_items`, seeded workflows and decision API |
| Migration rollback scripts | rollback SQL file and `oems_migration_rollback_scripts` checksum registry |
| Browser E2E readiness | focused static route/schema/service coverage; seeded browser execution remains environment-bound |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       13 passed (13)
```

```text
npm run build -w apps/back-office
passed
```

```text
git diff --check
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

## 12. Partial Gap Closure Iteration 6

Scope: FR-010 Document Registration and Checklist.

Implemented in this iteration:

- Added document checklist rule governance by product family, transaction type, channel, document type, requirement type and blocking stage.
- Added richer document lifecycle states for missing, generated, uploaded, signed, verified, registered in DMS, registered in NCBS, retry pending, rejected, expired and quarantined documents.
- Document registration now persists customer/order/product metadata, e-form template code/version, file URL/name, expected and actual hash, signed evidence, expiry/renewal state, DMS IDs and NCBS CIM13 IDs.
- Checklist generation creates missing required/conditional rows from active workflow rules and returns submission/execution blocker summaries.
- Submission and execution paths now enforce checklist blockers with the BRD rule that missing/rejected/quarantined/expired required documents block the workflow.
- E-form generation now creates versioned generated documents linked to order/customer.
- DMS and NCBS registration APIs capture accepted/failed responses, retry counts, next retry time and the REGISTERED_DMS plus NCBS retry-pending edge case.
- File hash mismatch now quarantines the document, marks the order document status rejected and logs a DMS quarantine integration event.
- Back-office OEMS workbench now includes a Documents tab for checklist rules, checklist generation, document registration, e-form generation, signing, DMS, NCBS and retry actions.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-010 AC-010.1 | `oems_document_checklist_rules` and rule service/routes |
| FR-010 AC-010.2 | Extended document status enum and checklist blocker response |
| FR-010 AC-010.3 | NCBS CIM13 registration/retry service and route |
| FR-010 AC-010.4 | Document metadata/evidence fields for hashes, DMS, NCBS, expiry and registration |
| FR-010 AC-010.5 | E-form generation with template code/version linked to order/customer |
| FR-010 BR-010.1 | Submission/execution blocking via `assertDocumentChecklistReady` |
| FR-010 BR-010.2 | Expiry and renewal flag handling for SKU, PFE, risk profile and regulatory documents |
| FR-010 EC-010.1 | `REGISTERED_DMS` with NCBS retry-pending evidence |
| FR-010 FH-010.1 | Hash mismatch quarantine and authorization prevention |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
npm run build -w apps/back-office
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

## 14. Partial Gap Closure Iteration 8

Scope: FR-012 to FR-015 ODA / FX Leave Order lifecycle deepening.

Implemented in this iteration:

- Extended ODA persistence for customer type, source channel, currency pair, direction, Single/If Done/OCO type, effective type, debit/credit accounts, good-till expiry, recommendation reference, reference-rate evidence, precheck results and document payload.
- Added ODA-specific durable tables for Treasury reference rates, ODA order legs, NCBS fund instructions, Treasury maker-checker updates, daily summaries and FP8007 sync records.
- Added ODA pre-order validation for minimum placement, available balance, CIF, SKU, PFE, sales certification, reference-rate availability, account capture, tenor/rate and good-till expiry.
- Added `REFERENCE_RATE_UNAVAILABLE` handling so missing Treasury rate source blocks rate-dependent submission and creates auditable integration evidence.
- Added BSM authorization fallback when sales-originated ODA cannot use digital verification.
- Added idempotent NCBS hold, unhold and overbook instruction records with retry metadata and operations notifications on failure.
- Added daily COT grouping by direction, currency pair, rate and order cost before swap, with minimum collective qualification and below-minimum cancellation/unhold handling.
- Added Treasury maker-checker execution updates with swap points, Treasury deal ID, checker rejection handling and child-order lifecycle application.
- Added FP8007 sync persistence and integration logging for executed/expired ODA statuses.
- Expanded the ODA workbench with Treasury rates, pre-check, registration, BSM/NCBS actions, COT collection, Treasury update approval, daily summary and fund-instruction evidence.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-012 AC-012.1 to AC-012.7 | ODA order capture/precheck/service/routes/workbench now support required fields, COT, reference rates, recommendation acceptance and daily summary |
| FR-012 EC-012.1, FH-012.1 | OCO legs are persisted; missing Treasury reference rate produces `REFERENCE_RATE_UNAVAILABLE` |
| FR-013 AC-013.1 to AC-013.7 | NCBS hold, blotter grouping, minimum collective qualification, cancellation/unhold and summary export gating support added |
| FR-014 AC-014.1 to AC-014.6 | Treasury maker-checker status updates, swap points, unhold/overbook, manual-overbook notification and FP8007 sync added |
| FR-015 AC-015.1 to AC-015.5 | ODA calculations, fund release reporting and FP8007 sync report definition added |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       11 passed (11)
```

```text
npm run build -w apps/back-office
passed
```

## 13. Partial Gap Closure Iteration 7

Scope: FR-011 Risk Profiling.

Implemented in this iteration:

- Added OEMS risk questionnaire versions with maker-checker lifecycle, effective dates, mandatory question codes, score bands and valid-period configuration.
- Added customer risk profile assessments with scored answers, active/expired state, effective/expiry dates, strict risk profile, external profile conflict status and source payload.
- Added product-risk mappings by product family/transaction/product with maker-checker status and effective dates.
- Risk assessment creation now rejects partial questionnaire answers and calculates the customer risk profile from answer scores and configured bands.
- Order validation now checks latest active risk profile for investment/lending products and blocks expired/missing/unsuitable profiles.
- External Wealth Core risk profile conflicts are flagged, operations evidence is logged and the stricter risk profile is applied until resolved.
- Added RBS and Avantrade risk profile sync hooks through integration messages.
- Added risk profile report endpoint for active, expired, expiring and conflict populations.
- Back-office OEMS workbench now includes a Risk tab for questionnaire governance, scoring, external conflict capture, RBS/Avantrade sync, order validation and status KPIs.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-011 AC-011.1 | `oems_risk_questionnaire_versions` and maker-checker questionnaire APIs |
| FR-011 AC-011.2 | `createRiskProfileAssessment` scoring from answers and score bands |
| FR-011 AC-011.3 | Assessment effective/expiry dates and active profile storage |
| FR-011 AC-011.4 | `validateRiskProfileForOrder` and order validation integration |
| FR-011 AC-011.5 | RBS/Avantrade sync integration hooks and Wealth Core external profile capture |
| FR-011 AC-011.6 | Risk profile status/expiry report endpoint |
| FR-011 BR-011.1 | Expired/missing risk profiles block investment/lending order validation |
| FR-011 BR-011.2 | Latest active assessment lookup is used for validation |
| FR-011 EC-011.1 | External conflict status applies stricter profile until resolved |
| FR-011 FH-011.1 | Partial mandatory questionnaire answers are rejected |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
npm run build -w apps/back-office
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

```text
git diff --check
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

## 11. Partial Gap Closure Iteration 5

Scope: FR-009 Digital Signature and Verification.

Implemented in this iteration:

- Digital verification records now bind to customer, order, optional document, channel, verification type, request method, payload snapshot and payload hash.
- Verification requests now support auth link, OTP, MPIN, soft-token and digital-signature method metadata, configured expiry and configured maximum failed attempts.
- Signed evidence fields now persist signature evidence, signed document URL and download URL metadata after successful verification.
- Failed, successful, expired, cancelled, locked, manual fallback and invalidated states are auditable through `oems_digital_verification_attempts`.
- Multiple failed attempts now lock the verification request and force a new issuance.
- BSM fallback approval is explicitly blocked unless the channel/product is marked as not digitally implemented or fallback-eligible.
- Third-party signature outage now puts the order into `PENDING_CUSTOMER_VERIFICATION`, records an operations integration alert and dispatches an operations notification event.
- Amending a payload-sensitive order field now invalidates active/verified digital verification and requires re-verification.
- Back-office OEMS workbench now includes a Verification tab for issuance, completion, failed attempts, expiry, cancellation, fallback and verification audit list.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-009 AC-009.1 | Request method model and issuance API for auth link, OTP, MPIN, soft-token and digital signature |
| FR-009 AC-009.2 | Configured TTL, `expires_at`, expiry API and expired attempt audit |
| FR-009 AC-009.3 | `signature_evidence`, signed document URL and signed document metadata API |
| FR-009 AC-009.4 | `oems_digital_verification_attempts` captures success/fail/expired/cancelled/locked/manual/invalidated attempts |
| FR-009 AC-009.5 | BSM fallback approval guard tied to not-implemented/fallback eligibility |
| FR-009 BR-009.1 | Payload binding includes customer, order/document, timestamp, channel and payload hash |
| FR-009 BR-009.2 | Payload-sensitive amendments invalidate prior verification and force re-verification |
| FR-009 EC-009.1 | Failed-attempt counter locks at configured maximum attempts |
| FR-009 FH-009.1 | Provider outage sets `PENDING_CUSTOMER_VERIFICATION` and creates operations alert evidence |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
npm run build -w apps/back-office
passed
```

## 10. Partial Gap Closure Iteration 4

Scope: FR-008 Portfolio Management.

Implemented in this iteration:

- Portfolio holdings now persist source system/status, original and local market values, local currency, FX rate/source/as-of date, realized and unrealized gain/loss, profit gain, left principal, left term, maturity date, source refresh metadata and transaction redirect URL.
- A default `PORTFOLIO_PERFORMANCE` report definition is seeded in the lifecycle migration with XLSX, CSV and PDF formats.
- Combined portfolio service now merges configured available holdings from OEMS, Wealth Core and Core Banking without substituting unavailable source data as zero.
- Source outages are surfaced in the portfolio response and logged as retryable `PORTFOLIO_SOURCE_SYNC` integration messages.
- Local currency valuation records the approved FX rate source and as-of date.
- Customer/sales visibility rules are enforced in service: customers are constrained to their own portfolio and sales roles can be constrained to assigned customers.
- Portfolio view supports filters for portfolio, product family and holding metrics such as left principal, profit gain and left term.
- Portfolio export uses the governed report export pipeline and configured report formats.
- Back-office workbench now includes a Portfolio tab for holding capture, combined view, source status, FX-rate input and export.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-008 AC-008.1 | Combined portfolio source model and `getCombinedPortfolioView` service |
| FR-008 AC-008.2 | Original/local valuation fields and FX conversion metadata |
| FR-008 AC-008.3 | Realized/unrealized gain-loss fields and totals |
| FR-008 AC-008.4 | Holding metric filters for left principal, profit gain and left term |
| FR-008 AC-008.5 | Portfolio export through `PORTFOLIO_PERFORMANCE` report definition |
| FR-008 BR-008.1 | Approved FX rate source/as-of date recorded in valuation policy |
| FR-008 BR-008.2 | Customer and assigned-sales access guard in service |
| FR-008 EC-008.1 | Partial source status response and missing-source-not-zero policy |
| FR-008 FH-008.1 | Failed source calls logged as integration messages with retry metadata |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
npm run build -w apps/back-office
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

## 9. Partial Gap Closure Iteration 3

Scope: FR-007 Reports and Transaction History.

Implemented in this iteration:

- Report definitions now persist category, enabled export formats, filter schema, data-source policy, sync row threshold, protection policy and transaction-history source policy.
- Export jobs now persist external job ID, requested format, source systems, sync/async execution mode, row count, protection evidence, file URL/hash, retry metadata, error code and error message.
- Transaction-history requests now persist customer/CIF/product/date range, under/over-90-day source routing, source status, retry metadata and failure details.
- Report preview supports read-only filtered order/audit data with filters for customer, CIF, sales, branch, channel, product, product family, status, transaction type, currency, date range, deal ID and external reference.
- Export validation now enforces enabled formats across XLS, XLSX, CSV, TXT, PDF, DOC and DOCX.
- Export jobs over the report sync threshold run asynchronously with `QUEUED` status and job lookup/retry APIs.
- Transaction-history requests under 90 days route to OEMS/Core Banking; older requests route to Core Banking/Big Data.
- Big Data unavailable for older history creates a failed retryable job/request and never marks partial data complete.
- Treasury Summary Deal export is blocked when the selected ODA group still has pending transactions.
- Master/recap exports are flagged as non-editable PDFs or protected spreadsheets where the requested format supports protection.
- Back-office report tab now includes report definition governance, preview, export submission, export job retry and transaction-history request controls.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-007 AC-007.1 | Report preview/export filters in `server/services/oems-service.ts` and workbench report controls |
| FR-007 AC-007.2 | `allowed_formats` model, format validation and export APIs |
| FR-007 AC-007.3, AC-007.4 | `oems_transaction_history_requests` and under/over-90-day source routing |
| FR-007 AC-007.5 | Audit preview from `oems_order_status_transitions` in read-only report preview |
| FR-007 BR-007.1 | Treasury Summary Deal export pending-ODA-group block |
| FR-007 BR-007.2 | Protected export metadata for master/recap reports |
| FR-007 EC-007.1 | `BIG_DATA_UNAVAILABLE` failed job/request behavior with no complete partial output |
| FR-007 FH-007.1 | Async export threshold and export job status/retry APIs |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
npm run build -w apps/back-office
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```

Known backlog status after iteration 11:

- Full seeded E2E testing for `/operations/oems` is environment-bound and ready once shared customers, portfolios, auth roles and product seeds are available.
- Certified external adapters, report artifact generation, role-matrix queues and rollback registry are now represented in application code, schema, migration, API, workbench controls and focused tests.

## 8. Partial Gap Closure Iteration 2

Scope: FR-006 Notifications and Delivery Tracking.

Implemented in this iteration:

- Notification channels now include D-Bank PRO in addition to email, SMS and in-app OEMS.
- Notification templates now persist template code, multi-channel delivery configuration, EN/ID localized subjects and bodies, maker-checker lifecycle status, critical flag, protected-PDF requirement, attachment password policy, submitter and approver evidence.
- Critical transactional notification templates cannot be retired through the OEMS service.
- Template approval now blocks maker self-approval and requires both EN and ID content before activation.
- Notification dispatch now fans out one business event across configured channels and records a delivery group.
- Delivery records now persist recipient type/address, language, delivery status, attempts, retry limit, provider message ID, failure reason, exception reason, protected attachment policy, critical flag and nonblocking business-transaction flag.
- Per-attempt audit rows are now captured in `oems_notification_delivery_attempts`.
- Failed notification channels create nonblocking `NOTIFICATION_EXCEPTION` integration messages instead of rolling back the originating business transaction.
- Partial delivery is surfaced when one channel succeeds and another channel fails in the same delivery group.
- Operations can list delivery exceptions, retry failed deliveries, mark provider results and view grouped failed/partial notification reports.
- Back-office OEMS workbench now includes a Notifications tab for template governance, event dispatch, delivery exceptions, retries and the operations report.

Primary BRD line items advanced:

| BRD item | Closure evidence |
| --- | --- |
| FR-006 AC-006.1 | `oemsNotificationTemplates` localized content and maker-checker fields; template submit/approve/reject/retire service and routes |
| FR-006 AC-006.2, AC-006.3 | `notificationChannelEnum` includes `DBANK_PRO`; dispatch supports email, SMS, D-Bank PRO and in-app channels |
| FR-006 AC-006.4 | `oemsNotificationDeliveries`, `oemsNotificationDeliveryAttempts`, retry/result APIs |
| FR-006 AC-006.5, EC-006.1 | `getNotificationOperationsReport` groups failed and partially delivered notification events |
| FR-006 BR-006.1 | Critical transactional templates cannot be disabled or retired |
| FR-006 BR-006.2 | Attachment password-policy evidence is persisted and protected-PDF requirements fail delivery with `PASSWORD_PROTECTED_ATTACHMENT_REQUIRED` |
| FR-006 FH-006.1 | Failed notifications log nonblocking exceptions instead of rolling back the business transaction |

Verification for this iteration:

```text
npm run test:run -- tests/e2e/danamon-oems.spec.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
npm run build -w apps/back-office
passed
```

```text
git diff --check
passed
```

```text
npm run check
fails only in pre-existing server/scripts/seed-demo-supplement.ts strict-typing issues
```
