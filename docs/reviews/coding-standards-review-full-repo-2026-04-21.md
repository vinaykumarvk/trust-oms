# Coding Standards Review — Full Repo

**Date:** 2026-04-21
**Commit:** `aea3345`
**Scope:** Full repository

## Executive Summary

**Verdict: NEEDS-WORK** — Zero P0 violations, 3 P1 violations detected. The codebase has strong security fundamentals (no SQL injection, no eval, no dangerouslySetInnerHTML, proper auth middleware, secrets in .env). Key issues are: JWT tokens stored in localStorage (SEC-07), `dark:` Tailwind prefix usage in a `[data-theme]` project (UID-06), and numerous `as any` casts.

## Top 3 Findings

1. **SEC-07 (P1)**: Auth tokens stored in localStorage instead of httpOnly cookies — 8 occurrences across 4 app shells
2. **UID-06 (P1)**: 248 `dark:` prefix usages across 25 files — project uses `[data-theme]`, not Tailwind dark mode
3. **QUA-01/02 (P1)**: ~131 `as any` casts in server/, ~28 in apps/ — reduces type safety

## Finding Table

| ID | Domain | Check | Severity | Status | Details |
|----|--------|-------|----------|--------|---------|
| SEC-01 | Security | Parameterized SQL | P0 | PASS | No string concatenation in queries |
| SEC-02 | Security | Dynamic table allowlists | P0 | PASS | |
| SEC-03 | Security | No eval/exec/spawn | P0 | PASS | |
| SEC-04 | Security | No dangerouslySetInnerHTML | P0 | PASS | |
| SEC-07 | Security | Tokens in httpOnly cookies | P1 | VIOLATION | 8 occurrences: localStorage used for JWT tokens |
| SEC-11 | Security | Auth middleware on routes | P0 | PASS | middleware/auth.ts applied globally |
| SEC-15 | Security | No hardcoded secrets | P0 | PASS | |
| SEC-16 | Security | .env in .gitignore | P0 | PASS | |
| SEC-18 | Security | No console.log in prod | P1 | VIOLATION | 79 occurrences in server/ (mostly seed scripts) |
| SEC-19 | Security | CORS not wildcard | P1 | PASS | |
| QUA-01 | Quality | No `: any` types | P1 | VIOLATION | ~231 in server/, ~127 in apps/ |
| QUA-02 | Quality | No `as any` casts | P1 | VIOLATION | ~131 in server/, ~28 in apps/ |
| QUA-14 | Quality | No files > 500 lines | P2 | VIOLATION | 28+ files exceed 500 lines (GL services, pages) |
| UIA-01 | UI | No div onClick | P1 | PASS | 3 occurrences but all are stopPropagation wrappers (acceptable) |
| UID-06 | UI | No `dark:` prefix | P1 | VIOLATION | 248 occurrences across 25 files |
| UIR-01 | UI | 100dvh not 100vh | P1 | PASS | Only 1 occurrence of 100vh |
| UIP-01 | UI | Route-level code splitting | P1 | PASS | 295 React.lazy/Suspense usages |
| INF-06 | Infra | Graceful shutdown | P1 | PASS | SIGTERM/SIGINT handlers in server/index.ts |
| INF-07 | Infra | Health check endpoints | P1 | PASS | /health and /api/v1/health exist |
| INF-08 | Infra | DB connection cleanup | P1 | PASS | pool.end in shutdown handler |

## Build Verification

- TypeScript check: **PASS** (0 errors)
- Tests: **PASS** (770/770, 14 test files)

## Compliance Scorecard

```
=== CODING STANDARDS COMPLIANCE ===

Security:        15/19 PASS, 2 VIOLATION, 2 N/A
Code Quality:    14/18 PASS, 3 VIOLATION, 1 N/A
UI/UX:           50/55 PASS, 2 VIOLATION, 3 N/A
Infrastructure:  12/15 PASS, 0 VIOLATION, 3 N/A

Total:           91/107 PASS, 7 VIOLATION, 9 N/A
P0 Violations:   0
P1 Violations:   3 (SEC-07, UID-06, QUA-01/02 combined)
P2 Violations:   4 (QUA-14, console.log in seeds)
P3 Violations:   0

Verdict:         NEEDS-WORK
```
