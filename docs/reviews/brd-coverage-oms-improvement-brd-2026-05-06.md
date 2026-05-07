# BRD Coverage Audit: OMS Improvement BRD

Audit date: 2026-05-07  
BRD file: `docs/OMS improvement BRD.md`  
Skill: `$brd-coverage`  
Scope: current worktree after remaining-gap remediation.

## Executive Verdict

Compliance verdict: **CODE-REMEDIABLE BRD GAPS CLOSED / DEPLOYED RELEASE-CANDIDATE FOR CONTROLLED PILOT**

The remediation loop closed the previously open functional gaps for product-family ticket capture, transactional submission/approval side effects, production integration gates, market-calendar settlement calculation, control tower UI, incident linking, structured rule traceability, ODA document/digital-verification binding, audit replay, rollback rehearsal, and migration compatibility management.

The remaining gap is not a code gap: **formal external NFR certification evidence**. The local workspace now proves type safety, focused regression coverage, production bundle generation, deployed Cloud Run health, light load/concurrency smoke, deployed login accessibility smoke, Cloud Logging cleanliness, and automated Cloud SQL backup availability. Full production sign-off still needs destructive or operations-owned evidence such as write-race testing, restore drill, HA/DR failover, authenticated cross-browser certification, and dashboard/alert sign-off.

## Verification Run

| Command | Result |
|---|---|
| `npm run check` | PASS |
| `npm run test:run -- tests/e2e/danamon-oems.spec.ts tests/e2e/oems-deaggregation-allocation.spec.ts` | PASS, 2 files, 56 tests |
| `npm run build -w apps/back-office` | PASS |
| `npm run build -w apps/client-portal` | PASS |
| Cloud Run deployed health/readiness smoke | PASS |
| Light deployed load/concurrency smoke | PASS |
| `@axe-core/cli` deployed BO/portal login smoke | PASS, 0 violations |

## Evidence Added In Final Remediation Cycle

| Area | Evidence |
|---|---|
| Product-family ticket workbench | `apps/back-office/src/pages/oems-product-ticket-workbench.tsx:175`, `apps/back-office/src/pages/oems-product-ticket-workbench.tsx:232`; route wiring at `apps/back-office/src/routes/index.tsx:922`; navigation at `apps/back-office/src/config/navigation.ts:217`. |
| Transactional non-ODA ticket submission | `server/services/oems-service.ts:4337`, `server/services/oems-service.ts:4410`, `server/services/oems-service.ts:4424`, `server/services/oems-service.ts:4452`. |
| Transactional approval decisions | `server/services/oems-service.ts:11466`, `server/services/oems-service.ts:11516`. |
| Production handoff gates and readiness | `server/services/oems-service.ts:8441`, `server/services/oems-service.ts:9661`, `server/services/oems-service.ts:9975`, `server/services/oems-service.ts:10008`, `server/services/oems-service.ts:10975`; route at `server/routes/oems.ts:1101`. |
| Market-calendar settlement schedule | `server/services/oems-service.ts:956`, `server/services/oems-service.ts:5902`. |
| Control tower UI and reassignment | `apps/back-office/src/pages/oems-control-tower.tsx:49`, `apps/back-office/src/pages/oems-control-tower.tsx:88`; route wiring at `apps/back-office/src/routes/index.tsx:930`; navigation at `apps/back-office/src/config/navigation.ts:218`. |
| Control incident linking | `server/services/oems-service.ts:3825`, `server/services/oems-service.ts:3862`; route at `server/routes/oems.ts:227`; UI at `apps/back-office/src/pages/oems-control-tower.tsx:123`. |
| Structured rule traceability UI | `server/services/oems-service.ts:3545`; routes at `server/routes/oems.ts:148`, `server/routes/oems.ts:153`, `server/routes/oems.ts:162`; UI at `apps/back-office/src/pages/oems-rule-traceability.tsx:61`; navigation at `apps/back-office/src/config/navigation.ts:219`. |
| ODA document and digital-verification persistence binding | `apps/back-office/src/pages/oems-ticket-oda.tsx:150`, `apps/back-office/src/pages/oems-ticket-oda.tsx:156`, `apps/back-office/src/pages/oems-ticket-oda.tsx:178`, `apps/back-office/src/pages/oems-ticket-oda.tsx:195`, `apps/back-office/src/pages/oems-ticket-oda.tsx:388`, `apps/back-office/src/pages/oems-ticket-oda.tsx:481`. |
| Settlement/export audit replay | `server/services/oems-service.ts:4929`, `server/services/oems-service.ts:4950`, `server/services/oems-service.ts:5005`, `server/services/oems-service.ts:5039`. |
| Rollback rehearsal and compatibility queue | `packages/shared/src/schema.ts:6123`, `drizzle/20260506_add_oems_minimum_trustworthy_order.sql:381`, `server/services/oems-service.ts:11668`, `server/services/oems-service.ts:11738`, `server/services/oems-service.ts:11793`; routes at `server/routes/oems.ts:1297`, `server/routes/oems.ts:1301`, `server/routes/oems.ts:1310`, `server/routes/oems.ts:1315`. |
| Regression coverage | `tests/e2e/danamon-oems.spec.ts` now asserts new service methods, routes, schema/migration artifacts, UI route wiring, and ODA document/verification bindings. |
| NFR evidence document | `docs/reviews/oms-nfr-evidence-2026-05-06.md`. |
| Deployed NFR evidence | Light load/concurrency smoke, deployed BO/portal login axe checks, Cloud Run log checks, and Cloud SQL automated backup evidence are recorded in `docs/reviews/oms-nfr-evidence-2026-05-06.md`. |

## Updated Gap Register

| Gap ID | Severity | Status | Coverage Verdict |
|---|---|---|---|
| G01 | P0 | DONE | Product-specific ticket capture and UI now cover MLD, Mutual Fund, Bond, FX Today, and Wealth Lending. |
| G02 | P0 | DONE | ODA/product ticket submission and approval decision side effects are wrapped in transactions with audit/outbox evidence. |
| G03 | P0 | DONE | Production integration handoff gates are enforced and exposed through a readiness report. |
| G04 | P0 | DONE | Fee/tax schedules use market-calendar settlement adjustment with fallback evidence. |
| G05 | P0 | DONE | OEMS Control Tower UI exposes SLA buckets, queue blockers, reassignment, and operator drill-down inputs. |
| G06 | P0 | DONE | Control ownership supports durable attestation, recertification, and incident linking through API and UI. |
| G07 | P1 | DONE | Rule traceability can be listed, certified, invalidated, and operated through a structured UI. |
| G08 | P1 | DONE | ODA ticket UI now persists order documents and binds digital verification issue/confirm actions to the submitted order. |
| G09 | P1 | DONE | `DEGRADED_APPROVED` source evidence creates reconciliation obligations with customer impact, owner, due date, and closure evidence. |
| G10 | P1 | DONE | Audit replay includes audit/source/outbox/document/verification/integration plus settlement and export evidence. |
| G11 | P1 | DONE | Rollback rehearsal and migration compatibility queue are implemented with schema, service, and routes. |
| G12 | P1 | DEPLOYMENT-EVIDENCED / OPS-SIGNOFF REMAINS | Local and deployed smoke evidence now covers type safety, tests, build, read-path load, authenticated read concurrency, deployed login accessibility, browser render, error-log cleanliness, and backup availability. Full write-path load, race testing, manual a11y, cross-browser/mobile, dashboard proof, restore drill, and HA/DR evidence remain operations-owned certification items. |
| G13 | P1 | DONE | Error envelope normalizes stable enum-style error codes with correlation ID. |
| G14 | P2 | DONE | Rule traceability status and structured editor UI are implemented. |

## Global OMS Expert Evaluation

Best-in-class verdict: **Functionally strong and deployed-pilot ready; not fully best-in-class until operations-owned NFR certification is completed.**

The application now has the institutional controls expected of a globally competitive OMS: governed instruments, product-family ticket capture, source evidence, deterministic validation, maker-checker queues, production adapter gates, market-calendar settlement, fee/tax schedules, audit replay, document and digital-verification binding, control ownership, incident linkage, rollback rehearsal, and migration compatibility controls.

Remaining enhancement areas are operational certification gaps rather than application-code gaps:

1. Execute load and concurrency tests against a production-like database and API tier.
2. Run accessibility and browser certification over the new OEMS screens.
3. Prove observability dashboards and alerts for adapters, outbox, SLA aging, reconciliation breaches, and audit replay failures.
4. Complete backup/restore and HA/DR drills with measured RTO/RPO.
5. Obtain operations sign-off on certified adapter credentials and downstream endpoint contracts.
