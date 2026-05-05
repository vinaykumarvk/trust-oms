# Feature Life Cycle Report: Margin Lending
## Date: 2026-05-04

## Pipeline Status

| Step | Status | Output |
|---|---|---|
| 1. BRD Generation | DONE | `docs/Margin-Lending-BRD-v1.md` |
| 2. Gap Analysis | DONE | `docs/gap-analysis-margin-lending-2026-05-04.md` |
| 3. Phased Plan | DONE | Embedded in gap report priority plan |
| 4. Plan Execution | DONE | Schema, migration, service, routes, UI, tests |
| 5. Test Validation | DONE | `npm run test:run -- tests/e2e/margin-lending.spec.ts tests/e2e/danamon-oems.spec.ts` passed |
| 6. BRD Re-Coverage | DONE | `docs/reviews/brd-coverage-margin-lending-brd-v1-2026-05-04.md` |
| 7. Back-Office Build | DONE | `npm run build -w apps/back-office` passed |
| 8. Local Deployment | DONE | API `http://localhost:5001`, back-office `http://localhost:5176/operations/margin-lending` |
| 9. Partial Gap Remediation | DONE | Former PARTIAL gaps addressed across lifecycle, entitlements, credit view, reports, EOD, margin calls, and simulation |

## Key Metrics

| Metric | Count |
|---|---:|
| Functional requirements in BRD | 16 |
| Auditable line items | 122 |
| Initial application gaps | 7 grouped gaps |
| Closed application gaps | 7 |
| Open application gaps | 0 |
| New automated tests | 12 focused Margin Lending tests |
| Focused/regression tests passed | 12 Margin Lending tests; back-office build passed |

## Code Changes

| Area | Files |
|---|---|
| Database schema | `packages/shared/src/schema.ts` |
| Migration and rollback | `drizzle/20260504_add_margin_lending.sql`, `drizzle/20260504_add_margin_lending.rollback.sql` |
| Domain service | `server/services/margin-lending-service.ts` |
| API routes | `server/routes/margin-lending.ts`, `server/routes.ts` |
| Back-office UI | `apps/back-office/src/pages/margin-lending-workbench.tsx`, `apps/back-office/src/routes/index.tsx`, `apps/back-office/src/config/navigation.ts` |
| Navigation entitlement filtering | `apps/back-office/src/components/layout/BackOfficeLayout.tsx`, `apps/back-office/src/config/navigation.ts` |
| Tests | `tests/e2e/margin-lending.spec.ts` |
| Documentation | `docs/Margin-Lending-BRD-v1.md`, `docs/gap-analysis-margin-lending-2026-05-04.md`, `docs/reviews/brd-coverage-margin-lending-brd-v1-2026-05-04.md` |

## Partial Gap Remediation

| Gap Area | Result |
|---|---|
| OEMS-style enterprise controls | API guards now separate read/write/checker/operator/report/audit responsibilities; RM cannot operate global maintenance/EOD, and auditors are read/report/audit-only. |
| Lifecycle and maker-checker | Copy workflow, copy audit action, exact maker-checker violation code, and authorization-time ownership evidence checks were added. |
| Rule and haircut hierarchy | Credit view, EOD LTV refresh, and simulation now resolve authorized/effective-dated attribute, scrip, asset override, and FX haircut records. |
| Facility and portfolio usage | Facilities are read-only through `/facilities` with import under `/facilities/imports`; credit/EOD load authorized portfolio links and cross-pledge lock evidence. |
| Margin-call operations | Added on-demand processing, action history, and sell-out closure evidence validation. |
| Reports and exports | Product Details, Facilities, and Margin Call reports now include the missing levels/calculated fields; CSV export endpoint is implemented. |
| Simulation | Add/delete/modify asset and exposure actions are applied when after metrics are not supplied. |

## Validation Results

| Check | Result | Notes |
|---|---|---|
| Margin Lending focused tests | PASS | 12 tests passed |
| Margin Lending + Danamon OEMS regression tests | NOT RERUN IN PARTIAL PASS | Prior pass was green; this remediation pass reran the focused Margin Lending suite. |
| Back-office build | PASS | Vite production build completed |
| Root TypeScript check | BLOCKED BY PRE-EXISTING ISSUE | `server/scripts/seed-demo-supplement.ts` has unrelated unknown-type errors; no Margin Lending errors were reported |
| Local API health | PASS | `GET http://localhost:5001/health` returned `ok` |
| Local back-office route | PASS | `GET http://localhost:5176/operations/margin-lending` returned HTTP 200 |

## Residual Items

| Item | Status | Reason |
|---|---|---|
| External PMX/product-processor integration certification | Deferred to environment validation | Requires live system credentials and controlled test data |
| Market-data/FX/notification live testing | Deferred to environment validation | Code paths and error evidence exist, live endpoints are environment-bound |
| Load test for p95 credit-view target | Deferred to performance test cycle | Requires production-like holdings volume |
| Staging migration rehearsal | Deferred to release management | SQL and rollback are ready; execution needs DBA/staging access |
