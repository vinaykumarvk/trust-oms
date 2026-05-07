# OMS NFR Evidence

Date: 2026-05-07  
Scope: Danamon OEMS world-class remediation cycles, including remaining-gap closure.

## Verified In This Cycle

| NFR Area | Evidence |
|---|---|
| Type safety | `npm run check` passed. |
| Functional regression | `npm run test:run -- tests/e2e/danamon-oems.spec.ts tests/e2e/oems-deaggregation-allocation.spec.ts` passed. |
| Frontend build | `npm run build -w apps/back-office` and `npm run build -w apps/client-portal` passed. |
| Auditability | ODA and product ticket submission write audit, status transition, outbox, source evidence, settlement/export replay evidence, and traceability evidence. |
| Resilience | ODA/product ticket submission and approval decisions are grouped in `db.transaction`; outbox uses idempotency keys. |
| Control ownership | Durable owner, attestation, reconciliation, incident linking, and recertification APIs/UI exist. |
| Production integration readiness | Certified-adapter production gates and readiness report are implemented for FP8007, Wealth Core, NCBS, and Treasury SND handoffs. |
| Frontend operator coverage | ODA ticket, product ticket workbench, control tower, rule traceability, document persistence, and digital verification paths build successfully. |
| Deployed revisions | `trust-banking-api-00028-vsj`, `trust-banking-bo-00021-dvd`, and `trust-banking-portal-00017-nz2` are serving 100% traffic in `wealthmanagement-491511 / asia-southeast1`. |
| Deployed health/readiness | API `/health`, API `/readiness`, API `/api/v1/health`, BO `/api/v1/health`, portal `/api/v1/health`, BO root, and portal root returned HTTP 200. |
| Light API/frontend load smoke | 150 requests at concurrency 15 across API health/readiness and BO/portal health returned 150/150 HTTP 200; p50 88 ms, p95 218 ms, p99 258 ms, max 261 ms. |
| Authenticated OEMS concurrency smoke | 80 authenticated read requests at concurrency 8 across rule traceability, control ownership, migration compatibility, and feature-flag endpoints returned 80/80 HTTP 200; p50 77 ms, p95 189 ms, p99 208 ms, max 219 ms. |
| Accessibility smoke | `@axe-core/cli` against deployed BO login and portal login returned 0 violations and 0 incomplete checks after fixing contrast and heading order. |
| Browser rendering smoke | Headless Chrome 148 rendered deployed portal DOM successfully; headless Chrome screenshots for BO login/OEMS route produced nonblank screenshots. |
| Observability/log cleanliness | Cloud Logging returned no severity `ERROR` entries for final revisions `trust-banking-api-00028-vsj`, `trust-banking-bo-00021-dvd`, and `trust-banking-portal-00017-nz2` after sanity checks. |
| Backup availability | Cloud SQL `wealth-management` has recent successful automated backups on 2026-05-02, 2026-05-03, 2026-05-04, 2026-05-05, and 2026-05-06. |

## Remaining External NFR Evidence Needed

| NFR Area | Required Evidence |
|---|---|
| Performance | Full production-like load test for write paths: order capture, ticket validation, approval queue mutation, audit replay, and product-security search under realistic data volumes. The deployed smoke only covers low-risk read/health paths. |
| Concurrency | Write-race tests against maker-checker decisions, duplicate ticket submission, outbox idempotency, and fee/tax schedule approval in a controlled staging environment. |
| Accessibility | Manual keyboard and screen-reader review of authenticated OEMS ticket, control tower, and rule traceability screens. Automated login checks are now clean. |
| Browser support | Edge, Safari, and mobile viewport smoke tests for authenticated back-office OEMS pages. Chrome smoke evidence exists. |
| Observability | Screenshot/export proof of dashboards and alert policies for adapter failures, reconciliation breaches, outbox dead letters, and SLA aging. Error-log smoke is clean. |
| Backup/restore | Non-production restore drill proving new OEMS control, ticket, audit, and outbox tables restore correctly. Automated backups are present. |
| HA/DR | Measured RTO/RPO and failover exercise for OMS database and API tier. |
