# Deployment Report: Trust Banking OMS — 2026-05-06

## Preflight Summary

| Field | Value |
|-------|-------|
| Target | trust-banking-api + trust-banking-bo + trust-banking-portal |
| App Type | API (Express+tsx) + 2 Frontends (Vite→nginx) |
| Tech Stack | Node 22, TypeScript, Vite 8, nginx 1.27 |
| Cloud Project | wealthmanagement-491511 |
| Cloud Region | asia-southeast1 |
| Commit | e0ae3d6 (main) |
| Docker Desktop | Not running → cloud-only mode |
| Account | vkumar@primesoft.net |

## Readiness Scorecard

| # | Check | Severity | Status | Evidence |
|---|-------|----------|--------|----------|
| 1.1-1.4 | Environment variables | — | PASS | All required vars configured on Cloud Run (DATABASE_URL, JWT_SECRET, SESSION_SECRET as secrets; CORS_ORIGINS, platform URLs as env vars) |
| 2.1 | Dependency completeness | — | PASS | `npm ci` succeeds in Docker builds |
| 2.2 | Dockerfile audit | — | PASS | Multi-stage builds, health checks, non-root user (API), nginx for frontends |
| 2.3 | Asset availability | — | PASS | Vite build produces assets in dist/ |
| 2.4 | Version compatibility | — | PASS | Node 22, React/ReactDOM match |
| 2.5 | Path mapping | — | PASS | `dist/back-office` → Dockerfile COPY match; `dist/client-portal` → Dockerfile COPY match |
| 2.6 | Relative paths | — | PASS | tsx resolves paths via tsconfig at runtime |
| 2.7 | Duplicate config | — | PASS | No conflicts found |
| 2.8 | Code cleanup | — | N/A | No cleanup needed |
| 2.9 | Build tool production | — | PASS | Vite is devDependency only |
| 2.10 | Cloud Run PORT | — | PASS | API: `process.env.PORT \|\| 5000`, binds `0.0.0.0`; Frontends: nginx on 8080 |
| 2.11 | Docker include/exclude | — | PASS | .dockerignore excludes node_modules, .git, .env, dist, docs |
| 2.12 | CORS configuration | — | PASS | CORS_ORIGINS includes both BO and Portal URLs |
| 2.13 | Health check | — | PASS | `/health` + `/readiness` endpoints; Dockerfiles have HEALTHCHECK |
| 2.14 | Local build | — | PASS | `npm run build:all` + `tsc --noEmit` both clean |

## Cloud Build

| Service | Build ID | Status | Duration |
|---------|----------|--------|----------|
| trust-banking-api | b81fdb21-413b-4e19-af2c-eb5fe257b1db | SUCCESS | ~90s |
| trust-banking-bo | 44225fc9-5d7c-4569-9a1f-9c9249a7b4d4 | SUCCESS | ~120s |
| trust-banking-portal | 184d6bf5-e613-47d0-869e-0a412c0892d7 | SUCCESS | ~120s |

## Cloud Run Deployments

| Service | Revision | URL |
|---------|----------|-----|
| trust-banking-api | trust-banking-api-00023-ntn | https://trust-banking-api-91358942094.asia-southeast1.run.app |
| trust-banking-bo | trust-banking-bo-00016-f2h | https://trust-banking-bo-91358942094.asia-southeast1.run.app |
| trust-banking-portal | trust-banking-portal-00012-l55 | https://trust-banking-portal-91358942094.asia-southeast1.run.app |

## Cloud Sanity Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| API /health | 200 + JSON | `{"status":"ok","uptime":65.5}` | PASS |
| API /readiness | 200 + DB ok | `{"status":"ready","database":"ok"}` | PASS |
| BO root | 200 | HTTP 200, 8269B, 0.19s | PASS |
| Portal root | 200 | HTTP 200, 2649B, 0.21s | PASS |
| BO /login | 200 | HTTP 200 | PASS |
| Portal /login | 200 | HTTP 200 | PASS |
| Auth (admin/password123) | Token returned | httpOnly cookie set | PASS |
| BO → API proxy | 200 | HTTP 200 | PASS |
| Portal → API proxy | 200 | HTTP 200 | PASS |
| Clients endpoint | Data returned | 10 clients | PASS |
| Securities endpoint | Data returned | 16 securities | PASS |
| BO JS assets | Served | index-C3EtvdvB.js | PASS |
| Portal JS assets | Served | index-DnzJ48VJ.js | PASS |
| SPA fallback | 200 for deep routes | HTTP 200 | PASS |
| Cloud logs | No errors | 2 P3 warnings (rate-limiter trust proxy) | PASS |

## Rollback Information

| Service | Previous Revision | Rollback Command |
|---------|-------------------|------------------|
| trust-banking-api | trust-banking-api-00022-9tn | `gcloud run services update-traffic trust-banking-api --to-revisions trust-banking-api-00022-9tn=100 --region asia-southeast1` |
| trust-banking-bo | trust-banking-bo-00015-pr7 | `gcloud run services update-traffic trust-banking-bo --to-revisions trust-banking-bo-00015-pr7=100 --region asia-southeast1` |
| trust-banking-portal | trust-banking-portal-00011-w9m | `gcloud run services update-traffic trust-banking-portal --to-revisions trust-banking-portal-00011-w9m=100 --region asia-southeast1` |

## P3 Findings (Deferred)

| # | Finding | Severity | Details |
|---|---------|----------|---------|
| 1 | Express trust proxy not set | P3 | `express-rate-limit` warns about `X-Forwarded-For` header being ignored. Add `app.set('trust proxy', 1)` for accurate client IP behind Cloud Run LB. |

## Final Verdict

```
Preflight:           COMPLETE
Env Var Audit:       ALL ACCOUNTED
Readiness Checks:    15/15 PASS
Code Fixes:          0 fixes needed
Local Docker Build:  SKIPPED (Docker not running)
Local Sanity:        SKIPPED (cloud-only)
Cloud Deploy:        SUCCESS (all 3 services)
Cloud Sanity:        15/15 PASS
Cloud Logs:          2 P3 WARNINGS (non-blocking)
Deployment Status:   DEPLOYED
```

### Service URLs

- **API**: https://trust-banking-api-91358942094.asia-southeast1.run.app
- **Back Office**: https://trust-banking-bo-91358942094.asia-southeast1.run.app
- **Client Portal**: https://trust-banking-portal-91358942094.asia-southeast1.run.app

### Login Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | password123 | system_admin |
| bo_head | password123 | bo_head |
| bo_maker | password123 | bo_maker |
| bo_checker | password123 | bo_checker |
