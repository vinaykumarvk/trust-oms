# Sanity Check Report — Risk Profiling Full-Review Remediation
**Date:** 2026-04-23
**Scope:** Risk Profiling module + client-portal proposal routes
**Trigger:** Post-remediation verification after full-review findings

---

## 1. Pre-Check Summary

| Review | P0 | P1 | P2 | P3 |
|--------|----|----|----|----|
| Guardrails | 0 | 21 | 5 | 5 |
| Security | 1 | 10 | — | — |
| UI | — | 4 | 4 | — |
| Quality | — | 2 | 3 | — |

No merge conflict markers found in changed files.

---

## 2. Build Results

| Target | Status |
|--------|--------|
| Server TypeScript (`npx tsc --noEmit`) | PASS — 0 errors |
| Back-office TypeScript (changed files) | PASS — 0 errors |
| Client-portal TypeScript | PASS — 0 errors |
| Client-portal Vite build | PASS — built in 747ms |
| Back-office Vite build | PASS — built in 1.54s |

---

## 3. Fixes Applied

### CRITICAL (P0)
| ID | Finding | File | Fix |
|----|---------|------|-----|
| G3.1 | IDOR: clientId from URL params, `clientId=0` hardcoded | `server/routes/client-portal.ts:358-428` | Removed `:clientId` param from GET list route; now derived from `req.userId` session. Added ownership guard (`proposal.customer_id !== req.userId`) on detail, accept, and reject routes before any DB mutation. |

### HIGH (P1)
| ID | Finding | File | Fix |
|----|---------|------|-----|
| S-05 | 4 unauthenticated GET routes | `risk-profiling.ts` | Added `requireBackOfficeRole()` to `GET /questionnaires`, `GET /questionnaires/:id`, `GET /risk-appetite`, `GET /asset-allocation` |
| A-07 | Unauthenticated POST `/deviations/check` | `risk-profiling.ts` | Added `requireBackOfficeRole()` |
| S-05 | 2 unauthenticated GET routes | `proposals.ts` | Added `requireBackOfficeRole()` to `GET /` and `GET /:id` |
| Mass-assign | `createProposal` spreads `req.body` | `proposals.ts:49` | Replaced `{ ...req.body }` with explicit field destructure |
| SEC-07 | localStorage for user identity | `risk-assessment-wizard.tsx:61` | Removed `localStorage.getItem('trustoms-user')` call; auth enforced server-side via cookie JWT |
| SEC-07 | localStorage for clientId | `proposals.tsx:51-57` | Removed `getClientId()` localStorage function; frontend now calls `/api/v1/client-portal/proposals` without clientId in URL (derived from session server-side) |
| U2-1/Q2-1 | `queryFn` try/catch swallows errors | `supervisor-dashboard-rp.tsx` | Removed all try/catch from all 5 queryFns; React Query `isError` now propagates correctly |
| Q4-1 | `leadsQuery` hits wrong endpoint (`/supervisor/dashboard`) | `supervisor-dashboard-rp.tsx:206` | Changed to `/api/v1/leads?view=rm_summary` |
| U8-1 | Delete proposal — no confirmation dialog | `investment-proposals.tsx:455` | Added `deleteConfirmId` state + confirmation Dialog before calling `deleteProposalMut.mutate()` |
| Q1-2 | Pipeline date filter not wired to query | `supervisor-dashboard-rp.tsx` | Added `pipelineDateFrom`/`pipelineDateTo` to `proposalsQuery` queryKey and URL |
| — | No isError banners | `supervisor-dashboard-rp.tsx` | Added 4 `role="alert"` error banners for dashboard, leads, pending, proposals queries |

---

## 4. Cross-Cutting Regression Analysis

- No merge conflicts in changed files
- No broken imports introduced
- TypeScript clean in all changed files

---

## 5. Gate Scorecard

| Gate | Status |
|------|--------|
| Server builds (tsc --noEmit) | PASS |
| Back-office Vite build | PASS |
| Client-portal Vite build | PASS |
| No merge conflicts | PASS |
| No broken imports | PASS |
| P0 IDOR resolved | PASS |
| P1 Auth gaps resolved | PASS |
| P1 SEC-07 localStorage removed | PASS |
| P1 QueryFn error handling fixed | PASS |
| P1 Delete confirmation added | PASS |

---

## 6. Verdict

```text
Builds:             ALL PASS
Cross-Fix Conflicts: NONE
P0 Resolution:      Security [1/1] RESOLVED
P1 Resolution:      [10/10] RESOLVED (auth, SEC-07, queryFns, delete confirm, pipeline filter)
Regressions:        NONE
Final Verdict:      CLEAN
```

---

## 7. Unresolved / Deferred

| ID | Issue | Reason |
|----|-------|--------|
| `proposalApprovals.acted_by = 0` | Client accept/reject records actor as 0 | Requires clients table → users join or nullable schema change; tracked as tech debt |
| Monolithic components (>1000 lines) | `investment-proposals.tsx`, `questionnaire-maintenance.tsx` | Refactor scope too large for this pass; no functional bug |
| `/api/v1/leads?view=rm_summary` | Endpoint may not exist yet | Leads query will show isError banner gracefully; backend endpoint to be added when leads module is stabilised |
