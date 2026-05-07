# Deployment Readiness Report — wealthmanagement

Date: 2026-05-07  
Target: `vkumar@primesoft.net / wealthmanagement`  
Resolved GCP project: `wealthmanagement-491511`  
Region: `asia-southeast1`  
Scope: Trust Banking full stack for Danamon OEMS (`trust-banking-api`, `trust-banking-bo`, `trust-banking-portal`)

## Preflight Context

- Active gcloud account corrected to `vkumar@primesoft.net`.
- Active gcloud project set to `wealthmanagement-491511`.
- Active Cloud Run region set to `asia-southeast1`.
- Source commit: `6a3c85f2067f068a113b9d1065390f84144c0d65`.
- Local Docker daemon unavailable: `docker ps` could not connect to Docker Desktop, so deployment followed the deploy-app cloud-only path with Cloud Build.
- Existing Cloud Run services before deploy:
  - `trust-banking-api`: `trust-banking-api-00026-5z6`
  - `trust-banking-bo`: `trust-banking-bo-00018-9zv`
  - `trust-banking-portal`: `trust-banking-portal-00014-p2w`

## Readiness Scorecard

| Check | Result | Evidence |
|---|---:|---|
| TypeScript check | PASS | `npm run check` completed successfully. |
| Focused OEMS tests | PASS | `npx vitest run tests/e2e/danamon-oems.spec.ts`: 21 tests passed. |
| App builds | PASS | Back office, client portal, front office, and mid office workspace builds passed before deploy. |
| Dependency tree | PASS | `npm ls --depth=0` completed without dependency errors. |
| Docker local build | SKIPPED | Docker daemon unavailable; Cloud Build used instead. |
| Cloud SQL migration | PASS | Applied `drizzle/20260506_add_oems_minimum_trustworthy_order.sql`; verified `oems_migration_compatibility_queue` exists. |
| Cloud Build full stack | PASS | Build `c420c46b-79c9-46d3-996d-bc1868d8c685` succeeded. |
| API rebuild after hardening fix | PASS | Build `d89398c0-dab8-41d8-aa6d-05936eab811c` succeeded. |
| Frontend rebuild after accessibility fix | PASS | Builds `d47e3331-4d77-495b-9aa2-2ddb84508167` and `f92e08ef-4fbb-4b39-a450-c696a5ed7976` succeeded. |
| Cloud Run deploy | PASS | Final revisions listed below are serving 100 percent traffic. |
| Cloud sanity | PASS | Health, readiness, frontend proxy health, CORS, login, `/me`, and OEMS API smoke checks passed. |
| Error logs | PASS | No severity `ERROR` entries found for final revisions after sanity checks. |
| Frontend accessibility smoke | PASS | `@axe-core/cli` against deployed BO and portal login pages returned 0 violations and 0 incomplete checks after remediation. |

## Fixes Applied During Deployment

### P1 — Cloud Run forwarded-header rate-limit validation

- Severity: P1
- Confidence: High
- Status: Fixed
- Evidence: `trust-banking-api-00027-5x6` emitted express-rate-limit validation errors for `X-Forwarded-For` and `Forwarded` headers.
- Fix: Production API now trusts exactly one Cloud Run proxy hop in `server/index.ts`.
- Verification:
  - `npm run check` passed.
  - Focused OEMS tests passed.
  - API rebuilt and redeployed as `trust-banking-api-00028-vsj`.
  - No severity `ERROR` logs found for `trust-banking-api-00028-vsj`.

### P3 — NFR evidence heading contract drift

- Severity: P3
- Confidence: High
- Status: Fixed
- Evidence: Focused OEMS test expected `Remaining NFR Evidence Needed`, while the report heading had been refined to `Remaining External NFR Evidence Needed`.
- Fix: Updated the focused test assertion to the current report heading.
- Verification: Focused OEMS test suite passed.

### P2 — Deployed login accessibility smoke failures

- Severity: P2
- Confidence: High
- Status: Fixed
- Evidence: Initial deployed `@axe-core/cli` smoke found color-contrast and heading-order violations on BO and portal login pages.
- Fix: Updated BO, portal, and shared login components to use accessible heading hierarchy and higher-contrast text/action colors.
- Verification:
  - `npm run check` passed.
  - `npm run build -w apps/back-office` passed.
  - `npm run build -w apps/client-portal` passed.
  - BO login axe smoke returned 0 violations and 0 incomplete.
  - Portal login axe smoke returned 0 violations and 0 incomplete.

## Cloud SQL Migration

Applied additive migration:

```text
drizzle/20260506_add_oems_minimum_trustworthy_order.sql
```

Verification query result:

```text
migration_table_present
```

Secret values were not printed in deployment notes or logs.

## Build And Deploy Results

### Cloud Build

Full-stack image build:

```text
c420c46b-79c9-46d3-996d-bc1868d8c685  SUCCESS
```

API rebuild after proxy fix:

```text
d89398c0-dab8-41d8-aa6d-05936eab811c  SUCCESS
```

Images:

```text
asia-southeast1-docker.pkg.dev/wealthmanagement-491511/trust-banking/trust-banking-api:latest
asia-southeast1-docker.pkg.dev/wealthmanagement-491511/trust-banking/trust-banking-bo:latest
asia-southeast1-docker.pkg.dev/wealthmanagement-491511/trust-banking/trust-banking-portal:latest
```

### Final Cloud Run Revisions

| Service | Revision | URL |
|---|---|---|
| `trust-banking-api` | `trust-banking-api-00028-vsj` | `https://trust-banking-api-91358942094.asia-southeast1.run.app` |
| `trust-banking-bo` | `trust-banking-bo-00021-dvd` | `https://trust-banking-bo-91358942094.asia-southeast1.run.app` |
| `trust-banking-portal` | `trust-banking-portal-00017-nz2` | `https://trust-banking-portal-91358942094.asia-southeast1.run.app` |

## Cloud Sanity Evidence

Health and readiness:

```text
API /health                         200
API /readiness                      200
API /api/v1/health                  200
Back office /api/v1/health proxy    200
Portal /api/v1/health proxy         200
```

Accessibility:

```text
BO login axe smoke      0 violations, 0 incomplete
Portal login axe smoke  0 violations, 0 incomplete
```

CORS:

```text
Origin trust-banking-bo      OPTIONS /api/v1/auth/login -> 204, allow-origin set, credentials true
Origin trust-banking-portal  OPTIONS /api/v1/auth/login -> 204, allow-origin set, credentials true
```

Authentication:

```text
POST /api/v1/auth/login -> 200
GET /api/v1/auth/me     -> 200
Validated user: bo_head / bo_head
Set-Cookie names: trustoms-refresh-token, trustoms-access-token
```

OEMS smoke checks:

```text
GET /api/v1/oems/policy-rule-traceability                         200
GET /api/v1/oems/control-ownership                                200
GET /api/v1/oems/migration-compatibility-queue?blocking=true      200
GET /api/v1/oems/feature-flags/OEMS_MINIMUM_TRUSTWORTHY_ORDER/enabled 200
```

Back office SPA routes:

```text
/operations/oems                    200
/operations/oems-ticket-oda         200
/operations/oems-product-tickets    200
/operations/oems-control-tower      200
/operations/oems-rule-traceability  200
```

## Commit Status

Commit was skipped. The worktree already contains a broad mixed set of OEMS implementation files and untracked review artifacts that were outside this deployment command. Deployment proceeded from the working tree, and rollback anchors are the previous Cloud Run revisions listed in this report.

## Final Verdict

PASS — the wealthmanagement Trust Banking stack is deployed and cloud sanity checks pass. The production log issue and deployed login accessibility issues found during continued verification were fixed, rebuilt, redeployed, and verified clean on the final revisions.
