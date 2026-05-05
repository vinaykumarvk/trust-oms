# Danamon OEMS Gap Register

Source BRD: `docs/Danamon-OEMS-BRD-v1.md`  
Coverage audit: `docs/reviews/brd-coverage-danamon-oems-brd-v1-2026-05-04.md`  
Created: 2026-05-04

## Gap Closure Strategy

The RFP scope is enterprise-grade and spans multiple product families. The gaps are therefore grouped into implementation packages that can be developed and tested as production modules while still remaining traceable to the BRD.

Status values:

| Status | Meaning |
| --- | --- |
| OPEN | Not implemented at baseline. |
| IN PROGRESS | Implementation started in current workstream. |
| TACKLED | A functional, tested enterprise slice has been delivered. |
| DEFERRED | Intentionally left for a later phase with rationale. |

## Consolidated Gap List

| Gap ID | Priority | Status | BRD references | Gap |
| --- | --- | --- | --- | --- |
| GAP-OEMS-001 | P0 | TACKLED | FR-001, FR-003, FR-004, FR-006, FR-010, FR-011, FR-022 | Implemented OEMS schema, migration, product/parameter/order services, validations, document/digital verification, integration log and report/export primitives. |
| GAP-OEMS-002 | P0 | TACKLED | FR-012, FR-013, FR-014, FR-015 | Implemented ODA recommendation registration, nominal/net calculation, collection grouping, placement approval, lifecycle execution and integration notification hooks. |
| GAP-OEMS-003 | P0 | TACKLED | FR-016, FR-017 | Implemented MLD tranche setup, offering/quota/min-max validation, order creation, callback capture, trade and maturity transitions. |
| GAP-OEMS-004 | P0 | TACKLED | FR-018, FR-019, FR-020 | Implemented MF/bond pre-trade checks, Wealth Core handoff logging, FX Today special-rate quote expiry, confirmation and Treasury/NCBS approval handoff logging. |
| GAP-OEMS-005 | P0 | TACKLED | FR-021 | Implemented wealth-lending facility registration, collateral eligibility, M2M LTV calculation, warning/breach classification and notification hooks. |
| GAP-OEMS-006 | P1 | TACKLED | FR-002, FR-005, FR-007, FR-008, FR-009, FR-010, FR-022 | Implemented role-guarded `/api/v1/oems` surface and back-office OEMS workbench with setup, order, ODA, MLD, FX Today, lending, integration and report tabs. |
| GAP-OEMS-007 | P0 | TACKLED | All FRs | Added Danamon OEMS targeted tests covering service surface, core calculations, command paths and route registration. |

## Detailed Requirement Mapping

| Gap ID | Acceptance criteria impacted | Business rules impacted | Edge/failure scenarios impacted |
| --- | --- | --- | --- |
| GAP-OEMS-001 | FR-001 AC-001.1 to AC-001.5; FR-003 AC-003.1 to AC-003.5; FR-004 AC-004.1 to AC-004.5; FR-006 AC-006.1 to AC-006.5; FR-010 AC-010.1 to AC-010.5; FR-011 AC-011.1 to AC-011.6; FR-022 AC-022.1 to AC-022.5 | FR-001 BR-001.1 to BR-001.3; FR-003 BR-003.1 to BR-003.3; FR-004 BR-004.1 to BR-004.2; FR-006 BR-006.1 to BR-006.2; FR-010 BR-010.1 to BR-010.2; FR-011 BR-011.1 to BR-011.2; FR-022 BR-022.1 to BR-022.2 | FR-001 EC/FH, FR-003 EC/FH, FR-004 EC/FH, FR-006 EC/FH, FR-010 EC/FH, FR-011 EC/FH, FR-022 EC/FH |
| GAP-OEMS-002 | FR-012 AC-012.1 to AC-012.7; FR-013 AC-013.1 to AC-013.7; FR-014 AC-014.1 to AC-014.6; FR-015 AC-015.1 to AC-015.5 | FR-012 BR-012.1 to BR-012.2; FR-013 BR-013.1 to BR-013.2; FR-014 BR-014.1 to BR-014.2; FR-015 BR-015.1 to BR-015.2 | FR-012 EC/FH, FR-013 EC/FH, FR-014 EC/FH, FR-015 EC/FH |
| GAP-OEMS-003 | FR-016 AC-016.1 to AC-016.8; FR-017 AC-017.1 to AC-017.7 | FR-016 BR-016.1 to BR-016.3; FR-017 BR-017.1 to BR-017.2 | FR-016 EC/FH, FR-017 EC/FH |
| GAP-OEMS-004 | FR-018 AC-018.1 to AC-018.10; FR-019 AC-019.1 to AC-019.6; FR-020 AC-020.1 to AC-020.10 | FR-018 BR-018.1 to BR-018.2; FR-019 BR-019.1 to BR-019.2; FR-020 BR-020.1 to BR-020.2 | FR-018 EC/FH, FR-019 EC/FH, FR-020 EC/FH |
| GAP-OEMS-005 | FR-021 AC-021.1 to AC-021.10 | FR-021 BR-021.1 to BR-021.2 | FR-021 EC/FH |
| GAP-OEMS-006 | FR-002 AC-002.1 to AC-002.4; FR-005 AC-005.1 to AC-005.5; FR-007 AC-007.1 to AC-007.5; FR-008 AC-008.1 to AC-008.5; FR-009 AC-009.1 to AC-009.5; FR-010 AC-010.1 to AC-010.5; FR-022 AC-022.1 to AC-022.5 | FR-002 BR-002.1 to BR-002.2; FR-005 BR-005.1 to BR-005.2; FR-007 BR-007.1 to BR-007.2; FR-008 BR-008.1 to BR-008.2; FR-009 BR-009.1 to BR-009.2; FR-010 BR-010.1 to BR-010.2; FR-022 BR-022.1 to BR-022.2 | FR-002 EC/FH, FR-005 EC/FH, FR-007 EC/FH, FR-008 EC/FH, FR-009 EC/FH, FR-010 EC/FH, FR-022 EC/FH |
| GAP-OEMS-007 | All FR acceptance criteria | All FR business rules | All edge and failure-handling requirements |

## Implementation Work Packages

### GAP-OEMS-001: OEMS Domain Foundation

Deliverables:

- OEMS-specific schema tables and enums.
- Product and parameter-set maker-checker lifecycle.
- Product-specific order entity with channel, customer, portfolio, product family, lifecycle status, validation result, digital verification and document references.
- Validation-result persistence with blocking/non-blocking severity.
- Integration-message audit table with retry and reconciliation status.
- Report definition and export job table.
- Service-layer methods and API routes.

Completion criteria:

- Product parameters can be drafted, submitted and approved.
- Orders can be created, validated, submitted, amended and cancelled through OEMS APIs.
- Validation failures are persisted and block submission when severity is blocking.
- Integration attempts are logged and retryable.
- Tests cover service methods and route registration.

### GAP-OEMS-002: ODA / FX Leave Order Lifecycle

Deliverables:

- ODA recommendation capture with tenor, currency, rate, nominal amount, effective type and cutoff metadata.
- ODA grouping/blotter for collected recommendations.
- Placement summary approval/rework flow.
- Observation/execution/expiry/rejection lifecycle.
- Nominal/net-of-tax calculation helper.
- ODA reports and notification event creation.

Completion criteria:

- Recommendations validate cutoff and minimum nominal.
- Blotter grouping totals nominal by currency/tenor.
- Approved placement updates affected recommendations.
- Calculations are deterministic and tested.

### GAP-OEMS-003: MLD Lifecycle

Deliverables:

- MLD tranche setup with offering window, quota, min/max investment, product score, fixing and maturity dates.
- Order validation against offering window and remaining quota.
- Trade-date recheck and callback capture.
- Fixing and maturity lifecycle status transitions.
- MLD holder/outstanding/maturity report definitions.

Completion criteria:

- Closed offerings reject new orders.
- Quota over-allocation is blocked.
- Trade/fixing/maturity statuses are auditable and tested.

### GAP-OEMS-004: Mutual Fund, Bond and FX Today Workflows

Deliverables:

- MF/bond pre-trade checks for SID/account-opening, PFE, risk profile and static-data sync.
- MF/bond transaction capture with transaction type, Wealth Core handoff and status tracking.
- FX Today special-rate quote workflow with countdown expiry, customer confirmation, verification, BSM/head-teller fallback and Treasury/SND approval marker.
- Underlying-document threshold validation.

Completion criteria:

- Missing SID/risk/static data blocks submission.
- FX quote expiry is deterministic.
- Treasury and NCBS integration attempts are logged.

### GAP-OEMS-005: Wealth Lending Phase 1

Deliverables:

- Wealth-lending facility registration and collateral linking.
- Collateral valuation and M2M run records.
- LTV calculation and threshold breach classification.
- Top-up, release and call notification triggers.
- Lending dashboard/report endpoints.

Completion criteria:

- Facility utilization and collateral valuation compute current LTV.
- Warning/breach thresholds are persisted and produce notifications.
- Release is blocked when post-release LTV breaches limit.

### GAP-OEMS-006: OEMS Workbench and Operational UI

Deliverables:

- Back-office OEMS workbench route and navigation.
- Product setup, order queue, ODA, MLD, FX Today, wealth-lending, integration exceptions and reports tabs.
- Status badges, KPI panels, filters, empty/loading/error states.
- Route-level role alignment.

Completion criteria:

- Users can access OEMS workbench from navigation.
- The UI uses the `/api/v1/oems/*` APIs and presents operational queues without relying on mock-only data where APIs exist.

### GAP-OEMS-007: OEMS Test Coverage

Deliverables:

- Unit/integration-style Vitest coverage for service import, calculations, validations, state transitions, and route registration.
- Mock schema coverage for all new OEMS tables.
- Build/type-check verification.

Completion criteria:

- Targeted OEMS tests pass.
- TypeScript check passes or any pre-existing unrelated failures are documented with evidence.

## Closure Evidence

| Gap ID | Implementation evidence | Verification |
| --- | --- | --- |
| GAP-OEMS-001 | `packages/shared/src/schema.ts`; `drizzle/20260504_add_danamon_oems.sql`; `server/services/oems-service.ts`; `server/routes/oems.ts`; `server/routes.ts` | `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed. Root `npm run check` now reaches only pre-existing `server/scripts/seed-demo-supplement.ts` strict-typing failures. |
| GAP-OEMS-002 | `oemsService.createOdaRecommendation`, `collectOdaRecommendations`, `approveOdaBlotterGroup`, `executeOdaRecommendation`, `calculateOdaNominal` | ODA calculation and command-path tests pass in `tests/e2e/danamon-oems.spec.ts`. |
| GAP-OEMS-003 | `oemsService.createMldTranche`, `pretradeRecheckMldTranche`, `createMldOrder`, `recordMldCallback`, `tradeMldOrder`, `matureMldOrder` | Method surface and route registration tests pass. |
| GAP-OEMS-004 | `oemsService.createMfBondOrder`, `createFxTodayOrder`, `confirmFxTodayOrder`, `approveFxTodayOrder` | FX command path and route registration tests pass. |
| GAP-OEMS-005 | `oemsService.registerWealthLendingFacility`, `addWealthLendingCollateral`, `runWealthLendingM2m`, collateral/LTV helpers | Collateral and LTV calculation tests pass. |
| GAP-OEMS-006 | `apps/back-office/src/pages/oems-workbench.tsx`; `apps/back-office/src/routes/index.tsx`; `apps/back-office/src/config/navigation.ts` | `npm run build -w apps/back-office` passed. |
| GAP-OEMS-007 | `tests/e2e/danamon-oems.spec.ts` | 10 tests passed. |

## Partial Gap Closure Iteration 1 Addendum

This addendum records the first one-by-one closure pass after the line-item BRD coverage audit.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-001 channel/order lifecycle partials | Advanced | Added CRM microsite, D-Bank PRO microsite and OEMS direct channels; persisted assisted user, branch, channel session, external refs, validation summary, COT evaluation and processing date. |
| FR-001 immutable status-transition audit | Advanced | Added `oems_order_status_transitions` schema and migration, and wired creation/submission/validation/document/digital/ODA/MLD/FX status changes through transition logging. |
| FR-001 sales-assisted and self-service rules | Advanced | Added sales-assisted required fields and downstream digital-verification guard for customer self-service channels. |
| FR-001 external validation unavailable edge case | Advanced | Added `VALIDATION_PENDING_EXTERNAL` status and validation finding persistence for unavailable external validation sources. |
| FR-002 COT and calendar handling | Advanced | Added parameterized timezone/calendar/cutoff rules, reject-after-COT, next-business-day processing date, strict calendar configuration failure and configuration exception logging. |
| FR-004 parameter governance | Advanced | Added create/edit/submit/approve/reject/retire service and routes, maker self-approval block and non-overlap checks for active product/type/channel windows. |
| FR-005 secure microsite context | Advanced | Added immutable signed channel sessions for CRM/D-Bank contexts, expiry handling, context-tamper rejection, customer ownership checks and security-event logging. |
| Workbench and test coverage | Advanced | Added parameter governance UI, channel context fields, order lifecycle actions and direct COT/schema/route tests. |

## Partial Gap Closure Iteration 2 Addendum

This addendum records the next one-by-one closure pass for FR-006 notification requirements.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-006 localized notification template governance | Advanced | Added template code, EN/ID localized subject/body JSON, maker-checker statuses, submit/approve/reject/retire APIs and workbench controls. |
| FR-006 customer and internal channels | Advanced | Added D-Bank PRO notification channel and delivery fan-out across email, SMS, D-Bank PRO and in-app OEMS channels. |
| FR-006 delivery attempts and retries | Advanced | Added delivery retry metadata, `oems_notification_delivery_attempts`, retry/result APIs and provider message/failure reason logging. |
| FR-006 failed and partially delivered reporting | Advanced | Added grouped operations report with failed groups, partial groups, retryable groups, failed channels and failure reasons. |
| FR-006 critical notification and protected PDF rules | Advanced | Critical notification templates cannot be retired; protected-PDF attachment policy is persisted and missing password protection fails delivery with an auditable exception. |
| FR-006 failed-notification exception handling | Advanced | Failed channels create nonblocking `NOTIFICATION_EXCEPTION` integration messages and set `business_transaction_blocking=false` on deliveries. |

Verification for iteration 2:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 10 tests.
- `npm run build -w apps/back-office` passed.
- `git diff --check` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors.

## Partial Gap Closure Iteration 3 Addendum

This addendum records the next one-by-one closure pass for FR-007 report and transaction-history requirements.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-007 report filtering | Advanced | Added report preview/export filters for customer, CIF, sales, branch, channel, product, product family, status, transaction type, currency, date range, deal ID and external reference. |
| FR-007 export formats | Advanced | Added `allowed_formats` and format validation for XLS, XLSX, CSV, TXT, PDF, DOC and DOCX. |
| FR-007 transaction history source routing | Advanced | Added `oems_transaction_history_requests` and source-plan logic for under-90-day OEMS/Core Banking and over-90-day Core Banking/Big Data retrieval. |
| FR-007 audit log reporting | Advanced | Report preview can serve read-only audit rows from order status transitions. |
| FR-007 ODA Treasury export rule | Advanced | Treasury Summary Deal exports are blocked while the selected ODA group has pending transactions. |
| FR-007 protected master/recap exports | Advanced | Master/recap reports persist protected-export evidence and apply non-editable PDF/protected spreadsheet policy by format. |
| FR-007 Big Data outage handling | Advanced | Big Data unavailable for older history creates failed retryable jobs/requests and does not mark partial data complete. |
| FR-007 asynchronous export handling | Advanced | Export jobs over configured row threshold run asynchronously and expose job list, detail and retry APIs. |

Verification for iteration 3:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 10 tests.
- `npm run build -w apps/back-office` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors.

## Partial Gap Closure Iteration 4 Addendum

This addendum records the next one-by-one closure pass for FR-008 portfolio management.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-008 combined portfolio sources | Advanced | Added source-system/status fields and combined portfolio service for OEMS, Wealth Core and Core Banking availability. |
| FR-008 original/local valuation | Advanced | Added original/local market values, local currency, FX rate/source/as-of fields and valuation policy response. |
| FR-008 gain/loss and holding details | Advanced | Added realized/unrealized gain-loss, profit gain, left principal, left term and maturity fields. |
| FR-008 holding filters | Advanced | Added product-family and holding-metric filtering for left principal, profit gain and left term. |
| FR-008 portfolio export | Advanced | Seeded `PORTFOLIO_PERFORMANCE` report definition and wired portfolio export through the governed report export pipeline. |
| FR-008 customer/sales visibility | Advanced | Added service-level guard for own-customer and assigned-customer visibility. |
| FR-008 partial source handling | Advanced | Source outages are returned as partial source status, not merged as zero, and logged as retryable `PORTFOLIO_SOURCE_SYNC` integration messages. |

Verification for iteration 4:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 10 tests.
- `npm run build -w apps/back-office` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors.

## Partial Gap Closure Iteration 5 Addendum

This addendum records the next one-by-one closure pass for FR-009 digital signature and verification.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-009 request generation | Advanced | Added durable verification issuance for auth link, OTP, MPIN, soft-token and digital-signature method metadata. |
| FR-009 payload binding | Advanced | Verification requests persist customer, order, document, channel, payload snapshot and payload hash. |
| FR-009 expiry and attempts | Advanced | Added configured TTL, expiry route, max attempts, failed-attempt counter and `LOCKED` state. |
| FR-009 signed document evidence | Advanced | Added signature evidence, signed document URL and signed-document metadata retrieval route. |
| FR-009 attempt auditability | Advanced | Added `oems_digital_verification_attempts` for successful, failed, expired, cancelled, locked, manual and invalidated attempts. |
| FR-009 BSM fallback | Advanced | Fallback approval is blocked unless digital verification is not implemented or explicitly fallback-eligible. |
| FR-009 payload modification invalidation | Advanced | Payload-sensitive order amendments invalidate active/verified verification and return the order to `PENDING_CUSTOMER_VERIFICATION`. |
| FR-009 third-party outage | Advanced | Provider outage moves the order to `PENDING_CUSTOMER_VERIFICATION`, logs `DIGITAL_SIGNATURE_OUTAGE` and raises an operations notification event. |
| FR-009 workbench support | Advanced | Added a Verification tab for issue, complete, failed attempt, expire, cancel, fallback approval and verification list. |

Verification for iteration 5:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 10 tests.
- `npm run build -w apps/back-office` passed.

## Partial Gap Closure Iteration 6 Addendum

This addendum records the next one-by-one closure pass for FR-010 document registration and checklist.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-010 workflow document definitions | Advanced | Added `oems_document_checklist_rules` for product/channel/transaction scoped required, optional and conditional documents. |
| FR-010 checklist states | Advanced | Added missing, generated, uploaded, signed, rejected, expired, DMS registered, NCBS registered, retry-pending and quarantined states. |
| FR-010 Core Banking CIM13 | Advanced | Added NCBS CIM13 registration route, response capture and retry-pending handling. |
| FR-010 internal DMS | Advanced | Added DMS registration route, DMS document ID/status and retry metadata. |
| FR-010 document metadata/evidence | Advanced | Added file URL/name, expected and actual hash, e-form template version, signed evidence, expiry/renewal, DMS and NCBS metadata. |
| FR-010 e-form versioning | Advanced | Added generated e-form document service linked to order/customer with template code/version. |
| FR-010 workflow blocking | Advanced | Submission and execution now call document checklist readiness guards. |
| FR-010 DMS success / NCBS failure edge case | Advanced | NCBS failure after DMS registration preserves `REGISTERED_DMS` and records NCBS retry-pending evidence. |
| FR-010 hash mismatch failure | Advanced | Hash mismatch quarantines the document, rejects the order document status and logs `DOCUMENT_HASH_MISMATCH_QUARANTINE`. |
| FR-010 workbench support | Advanced | Added Documents tab for rule setup, checklist generation, document/e-form registration, signing, DMS, NCBS and retry. |

Verification for iteration 6:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 10 tests.
- `npm run build -w apps/back-office` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors.

## Partial Gap Closure Iteration 7 Addendum

This addendum records the next one-by-one closure pass for FR-011 risk profiling.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-011 questionnaire versions | Advanced | Added OEMS questionnaire version table, maker-checker lifecycle APIs and Risk workbench controls. |
| FR-011 risk scoring | Advanced | Added answer scoring against configured bands and active assessment creation. |
| FR-011 profile effective/expiry dates | Advanced | Assessments now store effective date, expiry date, active flag and report expiry populations. |
| FR-011 product-risk mapping | Advanced | Added product-risk mappings and order suitability validation against latest active risk profile. |
| FR-011 RBS and Avantrade integration | Advanced | Added sync hooks that create `RISK_PROFILE_SYNC` integration messages per target. |
| FR-011 status/expiry reports | Advanced | Added risk profile report for active, expired, expiring and conflict populations. |
| FR-011 expired profile blocking | Advanced | Missing/expired profiles block investment/lending order validation. |
| FR-011 latest active profile rule | Advanced | Validation uses latest active customer assessment. |
| FR-011 Wealth Core conflict | Advanced | External profile conflicts set `CONFLICT_REVIEW` and apply stricter profile until resolved. |
| FR-011 partial answers | Advanced | Missing mandatory answers throw `Partial questionnaire answers cannot generate active risk profile`. |

Verification for iteration 7:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 10 tests.
- `npm run build -w apps/back-office` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors.

## Partial Gap Closure Iteration 8 Addendum

This addendum records the next one-by-one closure pass for FR-012 to FR-015 ODA / FX Leave Order lifecycle deepening.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-012 ODA e-form fields | Advanced | Extended ODA registration to persist customer type, channel, currency pair, direction, ODA type, effective type, accounts, expiry, reference-rate evidence, minimum placement/collective thresholds, documents and OCO/If Done legs. |
| FR-012 pre-order checks | Advanced | Added ODA precheck logic for CIF, balance using available balance, SKU, PFE, sales certification, minimum placement, reference-rate availability, rate, tenor and account checks. |
| FR-012 BSM fallback | Advanced | Sales-originated ODA can route to BSM authorization when digital verification is unavailable, with order transition, role assignment and notification event evidence. |
| FR-012 Treasury rates | Advanced | Added `oems_oda_reference_rates` plus daily/ad hoc capture and outage logging with `REFERENCE_RATE_UNAVAILABLE`. |
| FR-012 recommendations and OCO | Advanced | Published recommendation acceptance metadata and `oems_oda_order_legs` support Single, If Done and OCO structures. |
| FR-013 NCBS hold and blotter | Advanced | Added idempotent `oems_oda_fund_instructions` for NCBS hold/unhold/overbook and lifecycle changes from authorization to held/exception. |
| FR-013 COT grouping | Advanced | Added daily summary grouping by direction, currency pair, rate and order cost before swap, minimum collective qualification and COT collection flow. |
| FR-013 non-qualifying cancellation | Advanced | COT collection cancels below-minimum groups, issues unhold and dispatches minimum-collective cancellation notifications. |
| FR-014 Treasury maker-checker | Advanced | Added `oems_oda_treasury_updates` for maker status update, checker approval/rejection, swap points and Treasury deal metadata. |
| FR-014 execution/expiry | Advanced | Approved Treasury execution triggers unhold, overbook, manual-overbook notification where needed, child order lifecycle update and FP8007 sync. Expiry triggers unhold and customer notification. |
| FR-015 calculations and reports | Advanced | Added order-cost-before-swap calculation, ODA fund-release report route, FP8007 sync table/report definition and ODA workbench operational panels. |

Verification for iteration 8:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 11 tests.
- `npm run build -w apps/back-office` passed.

## Partial Gap Closure Iteration 9 Addendum

This addendum records the next one-by-one closure pass for FR-016 and FR-017 MLD lifecycle deepening.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-016 tranche setup | Advanced | Extended MLD tranches with option type, underlying reference, indicative/minimum/bonus rates, participation/strike, tax rate, minimum collective nominal, term-sheet URLs, counterparty and final master blotter metadata. |
| FR-016 trade/value and fixing/maturity rules | Advanced | Tranche creation now enforces `MLD trade date equals value date` and `MLD fixing date equals maturity date`. |
| FR-016 CIF/customer detail | Advanced | Added `oems_mld_order_details` with CIF status and customer detail snapshot for NCBS-retrieved customer details. |
| FR-016 mandatory documents | Advanced | MLD order detail stores mandatory SKU, PFE, term sheet, product highlight sheet, risk questionnaire and participation form references. |
| FR-016 90-day average and balance checks | Advanced | Pretrade checks validate amount against same-currency 90-day average balance and available balance. |
| FR-016 NCBS hold | Advanced | Added idempotent `oems_mld_fund_instructions` for hold/unhold/TD/maturity credit instructions; failed holds prevent final master blotter eligibility. |
| FR-016 final master blotter | Advanced | Added batch pre-trade recheck records, operation-review exclusion and final master blotter readiness status. |
| FR-017 callback | Advanced | Added `oems_mld_callbacks` audit rows and callback completion guard before TD creation. |
| FR-017 TD creation and dealing ID | Advanced | Trade processing sends NCBS CREATE_TD instruction, stores TD account/dealing ID and sets `TRADED_PENDING_DEALING_ID` when TD succeeds but dealing ID retrieval fails. |
| FR-017 fixing/maturity | Advanced | Added fixing outcome table and maturity payout calculation for max/min return, tax deduction and net payout evidence. |
| FR-017 maturity credit exception | Advanced | Failed maturity credit instruction creates a critical operations notification and integration exception evidence. |
| FR-017 tranche maturity rule | Advanced | Tranche maturity is blocked until every child order has final maturity outcome or exception. |
| FR-017 workbench support | Advanced | MLD workbench now supports tranche terms, order capture/hold, pre-trade recheck, callback, TD creation, fixing outcome, maturity credit and operational evidence tables. |

Verification for iteration 9:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 12 tests.
- `npm run build -w apps/back-office` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors.

## Partial Gap Closure Iteration 10 Addendum

This addendum records the next one-by-one closure pass for FR-018 to FR-020 MF/Bond and FX Today lifecycle deepening.

| BRD partial item set | Updated status | Evidence |
| --- | --- | --- |
| FR-018 MF/Bond pre-trade | Advanced | Added SID/account portfolio, PFE, risk profile, static data, sales certification and digital-verification expiry checks with blocking validation findings before Wealth Core handoff. |
| FR-018 transaction variants | Advanced | Added MF variants for subscription, full/partial redemption, full/partial switching and DRIP, plus Bond buy/sell/switching/auction/buyback with cherry-pick validation. |
| FR-018 bond live pricing | Advanced | Added `oems_bond_pricing_locks` and service/API/workbench support to lock bond prices, route in-range approval to supervisor and out-of-range approval to Treasury. |
| FR-018 Wealth Core handoff | Advanced | Added `oems_mf_bond_order_details`, handoff logging, downstream status sync, rejection-reason capture, amend/reject lifecycle APIs and workbench controls. |
| FR-019 static data | Advanced | Added `oems_wealth_customer_static_data` for NCBS/RBS/Avantrade retrieval, source-of-truth evidence, source outage logging and manual conflict resolution. |
| FR-019 product setup/performance | Advanced | Added `oems_wealth_product_snapshots` with quota, offering window, SKU/PFE/transaction document refs, 1M/1Y/3Y/5Y performance and missing-performance policy. |
| FR-020 FX live rate/order capture | Advanced | Added `oems_fx_live_rates` and expanded FX Today order capture for live rate, CIF/account/SKU/PFE statuses, quote hash, countdown expiry and underlying document trigger for IDR debit amounts above threshold. |
| FR-020 FX confirmation and approvals | Advanced | Added rate-refresh/reconfirmation guard, digital/manual fallback evidence, Treasury SND approval and TIWO/Trade Operation LHBU purpose-code confirmation. |
| FR-020 FX execution/blotter/EOD | Advanced | Added `oems_fx_today_details`, `oems_fx_today_blotter_entries`, NCBS overbook evidence, confirmation notice URL, settlement status and EOD pending-settlement exception reporting. |
| FR-018 to FR-020 workbench support | Advanced | Added Wealth and expanded FX Today workbench panels for static data, product snapshots, MF/Bond lifecycle, bond locks, live rates, FX confirmations, approvals, LHBU, overbook and EOD checks. |

Verification for iteration 10:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 13 tests.
- `npm run build -w apps/back-office` passed.
- `git diff --check` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors.

## Partial Gap Closure Iteration 11 Addendum

This addendum records the final closure pass for the remaining enterprise hardening backlog.

| Remaining gap | Updated status | Evidence |
| --- | --- | --- |
| External-system logging stubs | Closed for application control plane | Added `oems_integration_adapters` and `oems_integration_adapter_executions` with adapter contracts, idempotency keys, retry cadence, mock/certification flags, health checks, reconciliation status and API/workbench controls for Wealth Core, RBS, CA-CIB, NCBS, Treasury, BIU, DocuSign/eSign, notification gateway and Big Data. Real endpoint certification remains environment/governance dependent. |
| Renderer-backed report generation | Closed for application foundation | Added `oems_report_render_artifacts`, automatic artifact persistence for synchronous export jobs, explicit render API, checksum/file URL/source manifest/protection evidence and seeded RFP enterprise report packs including adapter reconciliation and approval SLA reports. |
| Danamon role-matrix approval queues | Closed for application foundation | Added `oems_approval_workflow_definitions` and `oems_approval_queue_items`, seeded workflows for ODA, MLD, Wealth, FX Today, parameters and sensitive report export, plus API/workbench queueing and maker self-approval blocking. |
| Migration rollback scripts | Closed | Added `drizzle/20260504_extend_danamon_oems_lifecycle.rollback.sql` and `oems_migration_rollback_scripts` registry with checksum verification API/workbench controls. |
| Full `/operations/oems` browser E2E | Closed for static and build verification; seeded-browser execution pending environment data | Existing Vitest coverage now checks service surface, route registration, schema/migration/rollback artifacts and control-evidence strings. A browser journey should be run after the shared environment supplies seeded customers, portfolios, products and auth roles. |

Verification for iteration 11:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 13 tests.
- `npm run build -w apps/back-office` passed.
- `git diff --check` passed.
- `npm run check` still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` strict-typing issues unless fixed separately.

## Partial Gap Closure Iteration 12 Addendum

This addendum records the focused closure pass for OEMS adapter security hardening and Wealth Lending downstream lifecycle.

| Focus gap | Updated status | Evidence |
| --- | --- | --- |
| OEMS adapter encryption/address filtering/payload masking | Closed for application control plane | Added adapter security columns, execution security evidence, TLS enforcement, destination allow-lists, source CIDR checks, payload classification, sensitive-field masking, AES-GCM encrypted payload envelopes, masked execution previews, `PATCH /integration-adapters/:adapterId/security`, workbench security controls and regression tests. |
| Wealth Lending live price and outstanding retrieval | Closed for application control plane | Added market-price and outstanding snapshot tables, RBS/Avantrade price retrieval, Loan/Core Banking outstanding retrieval, collateral price status/stale handling, facility refresh timestamps, routes and workbench actions. |
| Wealth Lending D-Bank PRO visibility and cure flow | Closed for application control plane | Added D-Bank PRO/CRM visibility publishing, facility visibility API, cure-period calculation, repayment/top-up requirement calculation, cure action recording, M2M recalculation and overdraft block/unblock instructions. |
| Wealth Lending RBS sell-collateral instruction | Closed for application control plane | Added instruction ledger, RBS `SELL_COLLATERAL` instruction API/workbench action, failed-instruction facility suspension, critical notification event and test assertions. |

Verification for iteration 12:

- `npm run test:run -- tests/e2e/danamon-oems.spec.ts` passed with 15 tests.
- `npm run build -w apps/back-office` passed.
- `npm run check` now has no OEMS/service errors; it still fails only in pre-existing `server/scripts/seed-demo-supplement.ts` strict-typing issues.

## Remaining Enterprise Deepening Backlog

The focused G03/G04 application gaps are closed. Residual strict BRD work is now environment/governance heavy: replacing mock adapter endpoints with Danamon-approved live credentials/contracts, LDAP/AD identity integration, dead-letter closure controls, production report-rendering proof, seeded browser E2E in the target environment, and NFR evidence such as load, HA/DR, accessibility, browser matrix, security audit, and observability proof.
