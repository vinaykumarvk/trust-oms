# Gap Analysis: Margin Lending
## Date: 2026-05-04

## Summary

- BRD: `docs/Margin-Lending-BRD-v1.md`
- Source manual: `docs/WQ_Margin Lending_V1.0_CCV.1.0.docx`
- Total functional requirements: 16
- Existing: 0 standalone Margin Lending requirements
- Partial: 3 requirements have reusable OEMS Wealth Lending foundations only
- Missing: 13 requirements require new implementation
- Conflicts: 0

## Existing Evidence

| Area | Status | Evidence | Gap Details |
|---|---|---|---|
| OEMS Wealth Lending foundation | PARTIAL | `packages/shared/src/schema.ts:5235`, `server/services/oems-service.ts:7085`, `server/routes/oems.ts:706`, `apps/back-office/src/pages/oems-workbench.tsx:1415`, `tests/e2e/danamon-oems.spec.ts:257` | Covers a Danamon OEMS lending slice: facility registration, collateral, market-price retrieval, outstanding retrieval, M2M, visibility, cure action, and sell-collateral instruction. It does not implement the standalone WQ Margin Lending manual module. |
| Standalone Margin Lending API | MISSING | Searched: `margin-lending`, `mlAttribute`, `ml_`, `margin-call-cases` | No `/api/v1/margin-lending` router, service, or module-specific routes existed before implementation. |
| Standalone Margin Lending UI | MISSING | Searched: `Margin Lending`, `/operations/margin-lending`, `margin-call-cases` | No back-office workbench or navigation entry existed before implementation. |

## Data Model Gaps

| Entity | Status | Existing Location | Gap Details |
|---|---|---|---|
| ML Attribute Setting | MISSING | None found | Required for FR-003 maintenance hierarchy. |
| ML Reference | MISSING | None found | Required for notice periods and concentration rules. |
| ML Scrip Setting | MISSING | None found | Required for security-level LTV/top-up/sell-out. |
| ML Exposure Limit | MISSING | None found | Required for FR-005 thresholds and exposure reporting. |
| ML Cross Currency Haircut | MISSING | None found | Required for FR-006 currency mismatch reduction. |
| ML Facility Group | MISSING | None found | Required for FR-007 customer-level exposure control. |
| ML Facility | PARTIAL | `packages/shared/src/schema.ts:5235` | OEMS lending facility exists, but no ML manual facility group/view model. |
| ML Portfolio Link and Cross Pledge | MISSING | None found | Required for FR-009 and FR-010. |
| ML Asset Setting | MISSING | None found | Required for FR-012 customer/security overrides. |
| ML Margin Call Case and Actions | MISSING | None found | Required for FR-013 case lifecycle. |
| ML EOD Run | MISSING | None found | Required for FR-015 idempotent jobs. |
| ML Simulation Run | MISSING | None found | Required for FR-016 what-if comparison. |
| ML Audit Event | MISSING | None found | Required for FR-014 audit trail and NFR evidence. |

## API Gaps

| Endpoint Group | Status | Gap Details |
|---|---|---|
| `/api/v1/margin-lending/summary` | MISSING | Required by BRD Section 7.2. |
| Maintenance endpoints | MISSING | Attribute settings, references, scrip settings, exposure limits, haircuts need CRUD and maker-checker decisions. |
| Transaction endpoints | MISSING | Facility groups, facilities, portfolio links, cross pledges, asset settings, and credit view absent. |
| Margin call and EOD endpoints | MISSING | Case list, case actions, case authorization, EOD runs absent. |
| Simulation and reports endpoints | MISSING | Simulation run, report preview/export metadata, audit events absent. |

## UI Gaps

| Screen | Status | Gap Details |
|---|---|---|
| Margin Lending Workbench | MISSING | BRD requires top-level tabs for Maintenance, Transactions, Margin Calls/EOD, Simulation/Reports, and Audit. |
| Operations navigation | MISSING | BRD requires `/operations/margin-lending` navigation. |
| Credit View | MISSING | No base/facility credit calculation screen for GCMV/NCMV/top-up/sell-out. |
| EOD and Simulation | MISSING | No screens for repeatable EOD jobs or before/after simulation. |

## Business Logic Gaps

| Workflow / Rule | Status | Gap Details |
|---|---|---|
| Maker-checker lifecycle | MISSING | Needs DRAFT/UNAUTHORIZED/AUTHORIZED/REJECTED/MODIFIED handling and same-user approval block. |
| LTV/top-up/sell-out hierarchy | MISSING | Needs attribute, reference, scrip, and asset override hierarchy. |
| Cross-currency haircut | MISSING | Needs buffer + volatility calculation and mandatory mismatch handling. |
| Credit View calculations | MISSING | Needs market value, GCMV, NCMV, utilized LTV, drawing power, threshold status, and partial-data evidence. |
| Margin Call process | MISSING | Needs margin-call and sell-out case creation, advice reference, deferral/due/manual-closure, authorization, and history. |
| EOD processing | MISSING | Needs idempotent LTV and margin-call job runs with failure evidence. |
| Simulation | MISSING | Needs non-mutating before/after asset/exposure comparison. |

## Integration Gaps

| Integration | Status | Gap Details |
|---|---|---|
| Product processor / PMX facility sync | PARTIAL | OEMS Wealth Lending has adjacent source references, but standalone ML sync/error evidence is absent. |
| Market data and FX | PARTIAL | Existing platform has market/risk services, but ML-specific source outage handling and haircut application are absent. |
| Notification/advice generation | MISSING | Margin-call advice generation and failure evidence absent. |

## Non-Functional Gaps

| Requirement | Status | Gap Details |
|---|---|---|
| Role-based API access | MISSING | No ML route guard existed. |
| Audit completeness | MISSING | No ML-specific audit events existed. |
| Migration and rollback | MISSING | No ML tables or rollback existed. |
| Test coverage | MISSING | No ML-specific automated tests existed. |
| Performance and external integration certification | DEFERRED | Requires environment/load/integration testing after local implementation. |

## Priority Plan

| Phase | Scope | Gaps Addressed |
|---|---|---|
| 1 | Schema, migration, rollback | Data model, audit, launch plan |
| 2 | Service calculations and lifecycle logic | Maker-checker, rules, credit view, margin calls, EOD, simulation |
| 3 | API routes and role guards | Endpoint coverage and error handling |
| 4 | Back-office workbench | UI coverage and navigation |
| 5 | Tests and coverage report | Automated evidence and BRD traceability |

## Partial Gap Remediation Update

On 2026-05-04, the PARTIAL gaps from the strict BRD coverage audit were addressed in the codebase. The remediation added lifecycle copy support, exact maker-checker error codes, role-separated API access, auditor read-only access, navigation entitlement filtering, authorized rule/haircut lookup, facility filters and read-only imports, authorized portfolio-link usage, margin-call on-demand processing and action history, sell-out closure evidence, fuller report outputs with CSV export, EOD idempotency/source-outage notification behavior, and simulation add/delete/modify action semantics.

Validation evidence:
- `npm run test:run -- tests/e2e/margin-lending.spec.ts`: PASS, 12 tests.
- `npm run build -w apps/back-office`: PASS.
- `npm run check`: still blocked by pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors only.
