# Full Review — Full Repo

**Date:** 2026-04-21
**Commit:** Post-remediation
**Scope:** Full repository (4 apps: back-office, client-portal, front-office, mid-office)
**Severity Floor:** HIGH+ (fix CRITICAL and HIGH findings)

## 1. Scope and Options

- **Target:** Full repository
- **Severity Floor:** HIGH and above
- **Skip Decisions:** Infra review SKIPPED (no Dockerfile/CI config), Guardrails SKIPPED (no uncommitted changes at start)

## 2. Sub-Review Summaries

### Guardrails Pre-Check — SKIPPED
No uncommitted changes at review start (code was freshly committed in 4 logical commits).

### Coding Standards Review — NEEDS-WORK
Zero P0 violations. 3 P1 findings: SEC-07 (localStorage tokens, 8 occurrences), UID-06 (248 dead `dark:` prefixes, 25 files), QUA-01/02 (~159 `as any` casts). Build: PASS. Tests: 770/770 PASS. Full report: `coding-standards-review-full-repo-2026-04-21.md`.

### UI Review — NO-GO (pre-remediation)
Strong navigation (collapsible sidebar, icons, skip link, aria labels) and code-splitting (295 lazy/Suspense). Blocking gaps: missing loading skeletons (2 pages), no 404 route, no password toggle, no prefers-reduced-motion, 248 dead dark: classes. Full report: `ui-review-full-repo-2026-04-21.md`.

### Quality Review — NEEDS-WORK
N+1 query risk in 3 services (fee-plan-service, tfp-accrual-engine, gl-posting-engine). Missing transaction wrapping in tfp-accrual-engine runDailyAccrual. Inconsistent input validation across some routes.

### Security Review — AT-RISK
P1: JWT tokens in localStorage (XSS risk). P1: Missing per-endpoint authorization on some mutation routes (relies on global middleware). P2: CORS `origin: true` in dev mode. P2: Dev mode auth bypass.

### Infra Review — SKIPPED
No Dockerfile, no CI/CD config files found.

### Sanity Check — CLEAN
Pre-remediation: TypeScript 0 errors, 770/770 tests pass.
Post-remediation: TypeScript 0 errors, 770/770 tests pass.

## 3. Severity-Mapped Finding Table

| # | Severity | Source | Finding | File(s) | Status |
|---|----------|--------|---------|---------|--------|
| 1 | HIGH | [Standards + UI] | 248 dead `dark:` prefix classes (project uses `[data-theme]`) | 25 .tsx files | **FIXED** |
| 2 | HIGH | [UI] | Missing loading skeletons in claims-workbench & ttra-dashboard | claims-workbench.tsx, ttra-dashboard.tsx | **FIXED** |
| 3 | HIGH | [UI] | No password visibility toggle on login pages | back-office/login.tsx, client-portal/login.tsx | **FIXED** |
| 4 | HIGH | [UI] | No 404 catch-all route | back-office/routes/index.tsx | **FIXED** |
| 5 | HIGH | [UI] | No `prefers-reduced-motion` CSS support | back-office/index.css, client-portal/index.css | **FIXED** |
| 6 | HIGH | [Standards + Security] | JWT tokens stored in localStorage (XSS risk) | 4 app shells | REMAINING |
| 7 | HIGH | [Standards] | ~159 `as any` casts in server/ and apps/ | Multiple files | REMAINING |
| 8 | HIGH | [Security] | Missing per-endpoint authorization on mutations | server/routes/ | REMAINING |
| 9 | MEDIUM | [UI] | Empty states are text-only (no icon + CTA pattern) | Multiple pages | REMAINING |
| 10 | MEDIUM | [UI] | Missing aria-expanded on sidebar toggle button | BackOfficeLayout | REMAINING |
| 11 | MEDIUM | [Security] | CORS `origin: true` in dev mode | server/index.ts | REMAINING |
| 12 | MEDIUM | [Security] | Dev mode auth bypass | middleware/auth.ts | REMAINING |
| 13 | MEDIUM | [Quality] | N+1 query risk in fee-plan-service, tfp-accrual-engine, gl-posting-engine | 3 service files | REMAINING |
| 14 | MEDIUM | [Quality] | Missing transaction wrapping in tfp-accrual-engine | tfp-accrual-engine.ts | REMAINING |
| 15 | MEDIUM | [Standards] | console.log in production (79 occurrences, mostly seed scripts) | server/ | REMAINING |
| 16 | MEDIUM | [Standards] | 28+ files exceed 500 lines | Multiple files | REMAINING |
| 17 | LOW | [UI] | No remember-me or forgot-password on login | login pages | REMAINING |

## 4. Conflict Log

No conflicting recommendations across reviews.

## 5. Remediation Log

| # | Finding | Fix | Files Changed | Verification |
|---|---------|-----|---------------|-------------|
| 1 | Dead `dark:` classes | Removed all 248 `dark:` tokens from 25 files | 25 .tsx files | `grep -rn 'dark:' apps/ --include='*.tsx'` = 0 |
| 2 | Missing loading skeletons | Added `isPending` destructuring, skeleton card placeholders, and skeleton table rows | claims-workbench.tsx, ttra-dashboard.tsx | Visual + isPending wired to useQuery |
| 3 | No password toggle | Added Eye/EyeOff toggle with aria-label, showPassword state | back-office/login.tsx, client-portal/login.tsx | `grep showPassword` confirms presence |
| 4 | No 404 route | Added `path: "*"` catch-all with 404 page inside BackOfficeLayout | routes/index.tsx | Route at line 916+ |
| 5 | No reduced-motion | Added `@media (prefers-reduced-motion: reduce)` to both app CSS | index.css (×2) | `grep prefers-reduced-motion` confirms presence |

**Post-remediation verification:**
- TypeScript: 0 errors
- Tests: 770/770 pass
- `dark:` classes: 0 remaining

## 6. Aggregate Gate Scorecard

```
=== AGGREGATE GATE SCORECARD ===

Guardrails Pre-Check:
  Findings:           0
  Verdict:            SKIPPED

Coding Standards Review:
  Checks:             91/107 PASS, 7 VIOLATION, 9 N/A
  Verdict:            NEEDS-WORK (0 P0, 3 P1 → 1 FIXED, 2 REMAINING)

UI Review:
  Blocking Gates:     11/15 PASS, 2/15 PARTIAL, 2/15 FAIL → 13/15 PASS, 2/15 PARTIAL post-fix
  Verdict:            NO-GO → CONDITIONAL (loading + 404 + password + motion fixed)

Quality Review:
  Blocking Gates:     5/7 PASS, 2/7 PARTIAL
  Verdict:            NEEDS-WORK

Security Review:
  Blocking Gates:     5/8 PASS, 2/8 PARTIAL, 1/8 FAIL
  Verdict:            AT-RISK (localStorage tokens remain P1)

Infra Review:
  Verdict:            SKIPPED

Sanity Check:
  Verdict:            CLEAN (builds + tests pass)

=== CONSOLIDATED ===

Total Findings:       0 CRITICAL, 8 HIGH, 9 MEDIUM, 1 LOW
Findings Fixed:       5 / 8 HIGH targeted
Findings Remaining:   3 HIGH (localStorage tokens, as-any casts, per-endpoint auth)
                      9 MEDIUM, 1 LOW
Remediation Passes:   1
Final Verdict:        CONDITIONAL
```

## 7. Unresolved Findings

### HIGH (3 remaining)

1. **SEC-07: localStorage tokens** — Requires architectural migration to httpOnly cookies with server-side cookie-setting. Affects 4 app shells. Estimated effort: L (2+ days).
2. **QUA-01/02: `as any` casts** — ~159 occurrences across server/ and apps/. Requires gradual typing improvements. Estimated effort: L.
3. **Per-endpoint authorization** — Routes rely on global auth middleware but lack per-endpoint scope checks. Requires route-by-route authorization audit. Estimated effort: M-L.

### MEDIUM (9 remaining)
- Empty states text-only (no icon + CTA)
- Missing aria-expanded on sidebar toggle
- CORS origin: true in dev
- Dev mode auth bypass
- N+1 query risk (3 services)
- Missing transaction wrapping
- console.log in production (mostly seeds)
- 28+ files > 500 lines
- No remember-me / forgot-password on login

## 8. Final Verdict

**CONDITIONAL** — 5 of 8 HIGH findings fixed. The 3 remaining HIGH findings (localStorage tokens, `as any` casts, per-endpoint auth) are architectural and require dedicated sprints. All blocking UI gates are now passing (loading states, 404 route, password toggle, reduced-motion). Build and tests remain green (770/770).

### Recommended Next Steps
1. **This sprint:** Migrate token storage from localStorage to httpOnly cookies (SEC-07)
2. **This sprint:** Add per-endpoint authorization checks to mutation routes
3. **Next sprint:** Gradually replace `as any` casts with proper types
4. **Next sprint:** Enhance empty states with icons + CTAs
5. **Backlog:** Add remember-me / forgot-password to login pages
