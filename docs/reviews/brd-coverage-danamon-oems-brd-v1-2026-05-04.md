# BRD Coverage Audit: Danamon OEMS BRD v1

Audit date: 2026-05-04  
BRD file: `docs/Danamon-OEMS-BRD-v1.md`  
Skill: `$brd-coverage`  
Scope: current worktree, full functional requirements plus non-functional requirements.

## Executive Verdict

Compliance verdict: **AT-RISK**

The Trust OMS codebase now contains a substantial Danamon OEMS implementation, not a throwaway proof of concept: dedicated schema, migrations, service workflows, API routes, an operations workbench, adapter control plane, approval queue, report artifact registry, rollback registry, and targeted automated tests are present.

Strict BRD compliance is still not fully closed. The remaining gaps are enterprise-readiness gaps rather than broad absence of OEMS functionality: live/certified external interfaces, LDAP/AD user management, dead-letter closure, production report-rendering proof, direct end-to-end tests, and NFR proof are not yet complete. The focused gaps for OEMS adapter security controls and Wealth Lending downstream lifecycle have now been implemented at application/schema/API/workbench/test level; live external certification remains under G01.

## Inventory And Scorecard

| Scope | Count |
|---|---:|
| Functional requirements | 22 |
| Acceptance criteria | 136 |
| Business rules | 47 |
| Edge cases | 22 |
| Failure-handling requirements | 22 |
| Total auditable functional line items | 227 |

Strict implementation score:

| Type | DONE | PARTIAL | NOT_FOUND | Total |
|---|---:|---:|---:|---:|
| Acceptance criteria | 124 | 11 | 1 | 136 |
| Business rules | 39 | 6 | 2 | 47 |
| Edge cases | 18 | 4 | 0 | 22 |
| Failure handling | 16 | 5 | 1 | 22 |
| Total | 197 | 26 | 4 | 227 |

Test coverage score:

| Verdict | Count | Notes |
|---|---:|---|
| TESTED | 79 | Direct behavior tests for calculations, COT rules, command paths, route registration, schema/migration checks. |
| INDIRECT | 117 | Covered by service surface, route existence, schema/migration static assertions, or broader command-path checks. |
| UNTESTED | 31 | Mostly external-provider, microsite-browser, adapter-certification, NFR, and operational failure flows. |

Reason for `AT-RISK`: The BRD compliance gate requires no P0 gaps and at least 70% line-item behavioral test coverage. Current code passes build and targeted tests, but strict enterprise BRD closure still has more than three P0/P1 residual gap categories and many items are only indirectly tested.

## Verification Run

| Command | Result |
|---|---|
| `npm run test:run -- tests/e2e/danamon-oems.spec.ts` | PASS, 1 file, 15 tests |
| `npm run build -w apps/back-office` | PASS, TypeScript and Vite build |

## Evidence Baseline

| Area | Evidence |
|---|---|
| OEMS route mount | `server/routes.ts:115-116` mounts `/api/v1/oems`. |
| Role guard and approval guard | `server/routes/oems.ts:10-29`, `server/middleware/role-auth.ts:42`, `server/middleware/role-auth.ts:79`. |
| Platform security middleware | `server/index.ts:32-59` request ID, compression, Helmet, CORS, rate limit, cookie parsing, auth middleware. |
| Core OEMS schema | `packages/shared/src/schema.ts:3870`, `:3890`, `:3918`, `:3969`, `:3994`, `:4011`. |
| Digital/doc/risk schema | `packages/shared/src/schema.ts:4027`, `:4098`, `:4121`, `:4174`, `:4200`. |
| ODA/MLD/MF/Bond/FX schema | `packages/shared/src/schema.ts:4348`, `:4482`, `:4706`, `:4787`. |
| Integration/report/approval/rollback schema | `packages/shared/src/schema.ts:4906`, `:4934`, `:5099`, `:5122`, `:5174`. |
| Wealth lending and portfolio schema | `packages/shared/src/schema.ts:4848`, `:5217`, `:5235`, `:5253`. |
| Core lifecycle service | `server/services/oems-service.ts:2276`, `:2335`, `:2515`, `:2658`, `:2863`, `:3102`, `:3168`. |
| Status-transition audit | `server/services/oems-service.ts:1954-1972`, `server/services/oems-service.ts:2816`. |
| COT and calendar handling | `server/services/oems-service.ts:827`, `:852`, `:1861`, `:1886`, `tests/e2e/danamon-oems.spec.ts:254`, `:269`, `:293`. |
| Channel-context validation | `server/services/oems-service.ts:1763`, `:2612-2645`, `:2721`. |
| Digital verification | `server/services/oems-service.ts:3963`, `:4066`, `:4192`. |
| Document registration | `server/services/oems-service.ts:3358`, `:3489`, `:3530`, `:3573`. |
| Risk profiling | `server/services/oems-service.ts:3719`, `:3832`. |
| ODA workflows | `server/services/oems-service.ts:4499`, `:4707`, `:4969`, `:5069`. |
| MLD workflows | `server/services/oems-service.ts:5335`, `:5721`, `:5778`, `:5824`. |
| Mutual fund/bond workflows | `server/services/oems-service.ts:6208`, `:6416`. |
| FX Today workflows | `server/services/oems-service.ts:6520`, `:6755`. |
| Wealth lending workflows | `server/services/oems-service.ts:6847`, `:6910`. |
| Integration adapters | `server/services/oems-service.ts:6998`, `:7060`, `:7175`, `server/routes/oems.ts:746-782`. |
| Approval/report/rollback lifecycle | `server/services/oems-service.ts:7358`, `:7402`, `:7500`, `server/routes/oems.ts:789-818`, `:888-946`. |
| Workbench UI | `apps/back-office/src/pages/oems-workbench.tsx:2541`, `:2682`, `:2774`, `:2975`, `:3091`, `:3224`, `:3412`, `:3650`, `:3772`, `:3918`, `:4054`, `:4137`, `:4567`. |
| Navigation | `apps/back-office/src/config/navigation.ts:213`, `apps/back-office/src/routes/index.tsx:868-870`. |
| Migration and rollback | `drizzle/20260504_extend_danamon_oems_lifecycle.sql:59`, `:669`, `:754`, `:791`, `:873`, `:922`, `:1002`; rollback at `drizzle/20260504_extend_danamon_oems_lifecycle.rollback.sql:39`. |
| Automated tests | `tests/e2e/danamon-oems.spec.ts:45`, `:159`, `:173`, `:197`, `:212`, `:233`, `:254`, `:269`, `:296`, `:328`, `:441`. |

## Functional Traceability

| FR | BRD line | Strict status | Coverage summary | Residual gaps |
|---|---:|---|---|---|
| FR-001 General E-Form Order Capture and Lifecycle | 646 | DONE with indirect test gaps | Product-specific order capture, channel sessions, order lifecycle, amendment/cancellation, validation, and status-transition audit are implemented. | G09 |
| FR-002 Cut-Off Handling and Business Calendar | 677 | DONE | Product timezone, COT reject/next-business-day behavior, calendar missing errors, and tests are present. | None material |
| FR-003 Calculation and Validation Engine | 700 | DONE with indirect test gaps | Validation results, hard/soft findings, ODA calculation, MLD payout, LTV calculations, product risk checks, document checks, and warning acknowledgement are implemented. | G09 |
| FR-004 Product and Parameter Management | 725 | DONE with indirect test gaps | Product/parameter sets, versioning, maker-checker, overlap checks, effective dates, and parameter UI are implemented. | G09 |
| FR-005 Secure Microsite Channel Integration | 749 | PARTIAL | Channel sessions, signed context validation, role guard, customer context checks, and security-event logging are implemented. | G07, G09 |
| FR-006 Notifications and Delivery Tracking | 773 | PARTIAL | Templates, maker-checker activation, delivery attempts, retries, operations report, password attachment policy metadata, and non-blocking transaction behavior are implemented. | G01, G09 |
| FR-007 Reports and Transaction History | 797 | PARTIAL | Report definitions, filters, export jobs, async jobs, transaction-history requests, retry, render artifacts, checksum/source manifest/protection evidence are implemented. | G06, G08, G09 |
| FR-008 Portfolio Management | 821 | PARTIAL | Portfolio holding sources, IDR conversion, source status, missing-source handling, export, and role/customer filtering are implemented. | G01, G09 |
| FR-009 Digital Signature and Verification | 845 | PARTIAL | Verification requests, attempts, payload hashes, expiry, cancellation, fallback approval, signed document retrieval, and mutation invalidation are implemented. | G01, G09 |
| FR-010 Document Registration and Checklist | 869 | PARTIAL | Checklist rules, document generation, document signing, hash quarantine, DMS registration, NCBS CIM13 registration, retries, and blockers are implemented. | G01, G09 |
| FR-011 Risk Profiling | 893 | PARTIAL | Questionnaire versions, risk assessments, product-risk mapping, expiry, strict profile resolution, external sync records, and reports are implemented. | G01, G09 |
| FR-012 FX Leave Order Pre-Order Check and Registration | 918 | DONE with external-certification caveat | ODA form capture, Treasury rates, recommendations, BSM fallback, daily summary, COT validation, OCO behavior, and reference-rate outage handling are implemented. | G01, G09 |
| FR-013 ODA Order Collection and Placement | 944 | PARTIAL | NCBS hold/unhold instruction records, ODA blotter grouping, COT collection, minimum collective amount handling, Summary Blotter, retries, and fund-release report are implemented. | G01, G09 |
| FR-014 ODA Observation and Execution | 970 | PARTIAL | Treasury maker/checker update, child status update, unhold/overbook instruction records, non-auto-settle notification, FP8007 sync records, and idempotent payloads are implemented. | G01, G09 |
| FR-015 ODA Calculation, Parameters, Notification, and Reports | 995 | PARTIAL | ODA nominal/cost calculations, parameter support, notification events, reports, FP8007 status sync, export jobs, and report failure handling are implemented. | G06, G09 |
| FR-016 MLD Offering Period Order Process | 1019 | PARTIAL | Tranche setup, order creation, documents, minimum amount, 90-day average checks, balance hold instruction records, recap, pre-trade recheck, and pre-COT amendment/cancel are implemented. | G01, G09 |
| FR-017 MLD Trade Date, Fixing, Maturity, Notifications, and Reports | 1047 | PARTIAL | Callback, TD creation instruction records, dealing ID handling, fixing outcome, maturity payout with tax, tranche maturity guard, reports, and failed credit notifications are implemented. | G01, G06, G09 |
| FR-018 Mutual Funds and Bonds Order Capture and Handoff | 1073 | PARTIAL | SID/PFE registration, risk check, MF/Bond order variants, cherry-pick rules, bond price locks, digital verification, Wealth Core handoff/status sync, and certification sync are implemented. | G01, G09 |
| FR-019 Mutual Funds and Bonds Static Data and Product Performance | 1102 | PARTIAL | Static data retrieval records, maintenance, conflict resolution, document links, product snapshots, performance periods, quota/offering validation, and source-of-truth display are implemented. | G01, G09 |
| FR-020 FX Today Special Rate Transaction | 1127 | PARTIAL | Live-rate records, CIF/account/SKU/PFE payload, countdown quote hash, digital confirmation, BSM/Head Teller fallback, Treasury SND, LHBU, overbook, blotter, notice, and EOD alerts are implemented. | G01, G09 |
| FR-021 Wealth Lending Phase-1 Registration and Mark-to-Market | 1156 | PARTIAL | Manual facility/collateral registration, market-price retrieval snapshots, outstanding-loan snapshots, eligible collateral, LTV/breach calculation, cure amount calculation, D-Bank/CRM visibility publishing, overdraft block/unblock instructions, RBS sell-collateral instruction, failure escalation, M2M run, breach notification, and workbench screens are implemented. | G01, G09 |
| FR-022 Integration Services and API Exposure | 1185 | PARTIAL | Integration messages, adapter registry, executions, correlation/status, retries, health, reconciliation status, standard error response, operation dashboard controls, TLS enforcement, address filtering, payload masking, and payload encryption envelopes are implemented. | G01, G02, G05, G09 |

## Residual Gap Register

| Gap ID | Severity | Affected BRD items | Current evidence | Gap |
|---|---|---|---|---|
| G01 | P0 | External-call items across FR-006, FR-008 through FR-020, FR-021, FR-022 | Adapter registry and execution exist at `packages/shared/src/schema.ts:4906`, `server/services/oems-service.ts:6998`, `:7060`, seeded adapter rows at `drizzle/20260504_extend_danamon_oems_lifecycle.sql:922`. | External interactions are adapter-controlled and auditable, but still mock/certification-pending. There is no evidence of certified live contracts for NCBS, RBS, Avantrade, DMS, DocuSign/e-sign, D-Bank PRO, Treasury, FP8007, Big Data, SMTP/SMS, Loan/Core Banking, KSEI, SIEM, or monitoring tools. |
| G02 | P0 | AC-022.5 | Search across `packages/shared`, `server`, `apps`, `tests`, `drizzle` found no OEMS LDAP/AD implementation. | Active Directory/LDAP user ID management is not implemented. |
| G03 | P0 | AC-022.4, BR-022.2 | Closed at application-control level by `drizzle/20260504_harden_oems_adapters_and_lending.sql`, `packages/shared/src/schema.ts`, `server/services/oems-service.ts`, `server/routes/oems.ts`, `apps/back-office/src/pages/oems-workbench.tsx`, and `tests/e2e/danamon-oems.spec.ts`. | **CLOSED FOR APPLICATION CONTROL.** Adapters now enforce TLS policy, destination allow-listing, source CIDR checks, security policy state, sensitive-field masking, encrypted payload envelopes, masked execution previews, and workbench controls. Residual live connector certification remains under G01. |
| G04 | P0 | AC-021.2, AC-021.3, AC-021.6, AC-021.8, AC-021.9, AC-021.10, EC-021.1, FH-021.1 | Closed at application-control level by `drizzle/20260504_harden_oems_adapters_and_lending.sql`, Wealth Lending service methods/routes/UI, and focused tests. | **CLOSED FOR APPLICATION CONTROL.** Wealth Lending now supports RBS/Avantrade price retrieval snapshots, Loan/Core Banking outstanding snapshots, D-Bank PRO/CRM visibility publishing, cure calculation and action recording, overdraft block/unblock instructions, RBS sell-collateral instruction, and failed sell-collateral escalation notification. Residual live downstream certification remains under G01. |
| G05 | P1 | FH-022.1 | Integration retry exists at `server/services/oems-service.ts:6979` and route `server/routes/oems.ts:755`. | Dead-letter closure with mandatory manual resolution comment is not modeled on OEMS integration messages. |
| G06 | P1 | AC-007.2, BR-007.2, AC-015.4, AC-017.7 | Render artifact metadata exists at `packages/shared/src/schema.ts:5099` and `server/services/oems-service.ts:7402`. | Report artifacts persist URL/hash/source/protection evidence, but no production renderer evidence proves real XLS/XLSX/PDF/DOC/DOCX generation, password protection, or non-editable output enforcement. |
| G07 | P1 | AC-005.2, EC-005.1 | Workbench route and channel security exist at `apps/back-office/src/routes/index.tsx:868-870`, `server/services/oems-service.ts:2515`, `:2580`. | No browser/mobile/responsive tests or originating-channel redirect tests prove microsite behavior across CRM and D-Bank PRO contexts. |
| G08 | P1 | NFR 8.1 through 8.9 | Build and unit/E2E tests pass. | Missing enterprise NFR proof: 500-concurrent-user benchmark, 2-second response evidence, HA/DR/PITR evidence, backup/restore test, penetration/security audit, WCAG/browser matrix, i18n verification, observability dashboards/alerts, and deployment topology. |
| G09 | P1 | Many implemented functional items | `tests/e2e/danamon-oems.spec.ts` has 15 passing tests and broad static assertions, including adapter security and Wealth Lending cure behavior. | Many BRD line items are still covered by service surface, route existence, or schema assertions rather than full behavior-driven happy-path and failure-path tests with realistic data. |

## Not Found Items

These are the strict `NOT_FOUND` items after current-code search:

| Item | Requirement | Search result |
|---|---|---|
| AC-022.5 | Active Directory or LDAP integration supports user ID management. | No OEMS LDAP/AD schema, service, route, UI, test, or migration evidence found. |

## NFR Coverage

| NFR | BRD line | Status | Evidence / gap |
|---|---:|---|---|
| 8.1 Performance | 1468 | PARTIAL | Build/tests pass, but no load test or latency benchmark for the OEMS workbench/API. |
| 8.2 Security | 1475 | PARTIAL | Helmet, CORS, rate limiting, cookie auth, role guard, request IDs, adapter TLS/address filtering, masking, and encryption envelopes exist; LDAP/AD and penetration-test proof are missing. |
| 8.3 Scalability and Capacity | 1485 | PARTIAL | Async export jobs and adapter retry fields exist; no capacity benchmark or deployment sizing evidence. |
| 8.4 Availability and Resilience | 1491 | PARTIAL | Retry queues and rollback registry exist; no HA topology or failover proof. |
| 8.5 Backup and Recovery | 1498 | PARTIAL | Rollback SQL and rollback registry exist; no backup/PITR restore test evidence. |
| 8.6 Accessibility | 1504 | PARTIAL | React/shadcn UI exists; no WCAG audit or assistive-technology test evidence. |
| 8.7 Browser and Device Support | 1508 | PARTIAL | Vite build passes; no Playwright/browser matrix for the OEMS workbench. |
| 8.8 Internationalization | 1513 | PARTIAL | Notification templates support localized text; no full OEMS UI i18n runtime coverage. |
| 8.9 Observability | 1518 | PARTIAL | Integration/message/status records exist; no production metrics, dashboards, SIEM integration, or alert runbooks proven. |

## Development-Ready Remediation Order

1. Implement G02 LDAP/AD identity integration or a formal enterprise SSO adapter with user ID synchronization, role mapping, audit trail, and tests.
2. Convert G01 adapter stubs into certified connectors or contract-tested adapter simulators with idempotency, retry, reconciliation, and certification evidence per downstream system.
3. Close G05 dead-letter closure by modeling `dead_letter_status`, `resolution_comment`, resolver, timestamps, and route/UI controls.
4. Close G06 report rendering by producing real protected files for required formats and asserting file metadata/checksums/protection in tests.
5. Add behavior-driven tests for each FR happy path, blocking validation path, retry path, and audit trail path.
6. Produce NFR evidence: load test, accessibility/browser matrix, backup/restore test, observability dashboard/runbook, and deployment/HA notes.

## Final Assessment

Application-level OEMS feature coverage is broad and materially improved. Strict BRD coverage is **not complete** because enterprise integrations, security controls, Wealth Lending downstream actions, NFR evidence, and direct test coverage remain open.
