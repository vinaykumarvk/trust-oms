# Local Deployment Verification Report
## Feature: Trust Banking Hardening Sprint
## Date: 2026-04-26

---

## LOCAL DEPLOYMENT VERIFICATION REPORT
=====================================

**App:** Back-Office (`apps/back-office`) + Client Portal (`apps/client-portal`)
**Feature:** Trust Banking Hardening (CP-SEC, MSG, STMT, SYSCONFIG, DOCS, FEED)
**Branch:** main
**Commit:** b2899d8 (latest)

---

## CHECKS

| Check | Status | Details |
|-------|--------|---------|
| Build | PASS | TypeScript compiles clean; `npm run build` succeeds |
| Database | PASS | PostgreSQL@17 (local) running; 252 tables pushed via `db:push` |
| API startup | PASS | Express API running on port 5000; uptime ~611s |
| BO Frontend startup | PASS | Vite running on port 5175; HTTP 200 |
| Client Portal startup | PASS | Vite running on port 5176; HTTP 200 |
| Authentication | PASS | JWT login/verify working for bo_maker, bo_head, admin roles |
| Vite→API proxy | PASS | All three proxy targets verified (5175→5000, 5176→5000) |
| Feed health endpoints | PASS | GET, POST override, POST clear-override all return 200 |
| Feed role restriction | PASS | BO_MAKER override correctly rejected with 403 |
| System config GET | PASS | Returns 200 with empty array on fresh DB |
| System config PUT role | PASS | BO_MAKER PUT correctly rejected with 403 |
| Client messages GET | PASS | Returns 200; paginated list with seed data |
| Client messages reply | PASS | POST /:id/reply → 201 with reply object |
| Statements GET | PASS | Returns 200 |
| Client portal auth guard | PASS | Unauthenticated portal MSG routes correctly return 401 |
| Portal ownership RBAC | PASS | BO tokens blocked from portal `:clientId` routes (401) |

---

## ISSUES FOUND AND FIXED DURING DEPLOYMENT

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | `dsar_requests.subject_client_id: integer` FK mismatch with `clients.client_id: text` | Changed column type to `text` in schema.ts |
| 2 | `callReportStatusEnum` missing `'CANCELLED'` value (used in partial unique index) | Added `'CANCELLED'` to enum definition in schema.ts |
| 3 | `multer` npm package not installed (only a TypeScript stub existed) | `npm install multer @types/multer --save` + removed stub `server/types/multer.d.ts` |
| 4 | Auth dev-mode role defaults to `'rm'` — BO routes returned 403 until using proper JWT | Used correct JWT Bearer tokens for all BO endpoint tests |

---

## ENDPOINT VERIFICATION

### Feed Health Module (FEED-*)

| Endpoint | Method | Role | HTTP | Status |
|----------|--------|------|------|--------|
| `/api/v1/degraded-mode/feed-health` | GET | BO_HEAD | 200 | ✅ PASS |
| `/api/v1/degraded-mode/BLOOMBERG/override` | POST | BO_HEAD | 200 | ✅ PASS |
| `/api/v1/degraded-mode/BLOOMBERG/clear-override` | POST | BO_HEAD | 200 | ✅ PASS |
| `/api/v1/degraded-mode/BLOOMBERG/override` | POST | BO_MAKER | 403 | ✅ PASS (role guard) |

### System Config Module (SC-*)

| Endpoint | Method | Role | HTTP | Status |
|----------|--------|------|------|--------|
| `/api/v1/system-config` | GET | BO_HEAD | 200 | ✅ PASS |
| `/api/v1/system-config/:key` | PUT | BO_MAKER | 403 | ✅ PASS (role guard) |

### Client Messages Module (MSG-*)

| Endpoint | Method | Role | HTTP | Status |
|----------|--------|------|------|--------|
| `/api/v1/client-messages` | GET | BO_HEAD | 200 | ✅ PASS |
| `/api/v1/client-messages/:id/reply` | POST | BO_HEAD | 201 | ✅ PASS |
| `/api/v1/client-portal/messages` | GET | none | 401 | ✅ PASS (auth guard) |
| `/api/v1/client-portal/messages/unread-count` | GET | none | 401 | ✅ PASS (auth guard) |

### Statements Module (STMT-*)

| Endpoint | Method | Role | HTTP | Status |
|----------|--------|------|------|--------|
| `/api/v1/statements` | GET | BO_HEAD | 200 | ✅ PASS |
| `/api/v1/client-portal/statements/:clientId` | GET | BO_HEAD (no clientId in JWT) | 401 | ✅ PASS (ownership guard) |

---

## CONDITIONAL NOTES

### Client Portal Authentication Gap

The client portal MSG/STMT/SR routes use `req.user?.clientId` from the JWT payload. The current
`authService.signAccessToken()` only includes `sub`, `role`, `email`, `name`, `office` claims —
no `clientId`.

**Impact:** Client portal MSG/STMT routes return 401 for any BO token (expected — security feature
working correctly). Client-facing portal routes are blocked until a dedicated client-portal login
endpoint is added that issues JWTs with `clientId` in the payload.

**This is EXPECTED behavior** per the CP-SEC-1/CP-SEC-3 ownership middleware spec. The auth
extension is out of scope for the TB Hardening sprint.

**Affected BRD items:** MSG-3, MSG-4, MSG-5, MSG-6, STMT-2 (client-portal side only).
The **back-office** counterparts (MSG-7, MSG-8, STMT-1, STMT-5) are fully functional.

---

## ACCESS INFORMATION

| Resource | URL | Credentials |
|----------|-----|-------------|
| API | http://localhost:5000 | — |
| Back-Office Frontend | http://localhost:5175 | `bo_head` / `password123` (role: BO_HEAD) |
| Client Portal Frontend | http://localhost:5176 | Login page reachable; requires client JWT |
| Health Check | http://localhost:5000/health | public |

### Test Users (all passwords: `password123`)

| Username | Role | DB ID |
|----------|------|-------|
| `admin` | SYSTEM_ADMIN | 1 |
| `bo_maker` | BO_MAKER | 2 |
| `bo_head` | BO_HEAD | 3 |

---

## ISSUES REMAINING

None blocking. All TB hardening BO endpoints verified working. Client portal authenticated
routes are blocked by design pending a client-JWT issuance feature.

---

## STOP SERVERS

```bash
lsof -ti:5000 | xargs kill    # API
lsof -ti:5175 | xargs kill    # BO Frontend
lsof -ti:5176 | xargs kill    # Client Portal
```

---

## READY FOR TESTING: **YES (CONDITIONAL)**

All back-office TB hardening endpoints are ready for manual testing.

**Conditional:** Client portal MSG/STMT routes require a client-JWT issuance endpoint
(out of scope for this sprint) before end-to-end client portal testing is possible.
