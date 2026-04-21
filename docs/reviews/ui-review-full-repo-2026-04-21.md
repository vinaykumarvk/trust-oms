# UI/UX Review — Full Repo

**Date:** 2026-04-21
**Commit:** `aea3345`
**Scope:** Full repository (4 apps: back-office, client-portal, front-office, mid-office)

## Executive Summary

**Verdict: NO-GO** — 3 blocking gate failures identified. The back-office app has strong navigation (collapsible sidebar, icons, skip link, aria labels) and good code-splitting (295 lazy/Suspense usages). However, critical gaps exist in loading states, login completeness, and dark mode implementation.

## Top Findings

| # | Severity | Finding | Impact |
|---|----------|---------|--------|
| 1 | P1 | 248 dead `dark:` prefix classes across 25 files | Code bloat, confusing maintenance |
| 2 | P1 | Missing loading skeletons in claims-workbench & ttra-dashboard | Blank screens during fetch |
| 3 | P1 | No password visibility toggle on login pages | Poor mobile UX |
| 4 | P1 | No 404 catch-all route | Blank page on invalid URLs |
| 5 | P1 | No `prefers-reduced-motion` CSS support | Accessibility violation |
| 6 | P1 | Tokens stored in localStorage (not httpOnly cookies) | Security concern (XSS risk) |
| 7 | P2 | No remember-me or forgot-password on login | Incomplete login UX |
| 8 | P2 | Empty states are text-only (no icon + CTA pattern) | Poor first-run experience |

## Login Screen Audit

| Feature | Back-Office | Client-Portal |
|---------|------------|---------------|
| Semantic `<form>` | PASS | PASS |
| autocomplete attrs | PASS | PASS |
| Loading on submit | PASS | PASS |
| Error role="alert" | PASS | PASS |
| 100dvh layout | PASS (min-h-dvh) | PASS (min-h-dvh) |
| Password toggle | **FAIL** | **FAIL** |
| Remember-me | **FAIL** | **FAIL** |
| Forgot password | **FAIL** | **FAIL** |
| Theme selector | **FAIL** | **FAIL** |

## Navigation Audit

| Check | Status | Evidence |
|-------|--------|---------|
| Collapsible sidebar | PASS | Sheet overlay on mobile, collapse to 64px on desktop |
| Hamburger toggle | PASS | Menu button with aria-label="Open menu" |
| Menu item icons | PASS | All nav items have lucide-react icons |
| Active route highlighting | PASS | aria-current="page" + primary bg color |
| Skip link | PASS | Skip to #main-content |
| Sidebar aria-label | PASS | "Main navigation" |
| aria-expanded | PARTIAL | Missing on sidebar toggle button |
| Sidebar state persistence | PASS | localStorage |

## Empty State Audit

| Page | Has Empty State | Icon | CTA | Status |
|------|----------------|------|-----|--------|
| corporate-actions (4 tabs) | Yes | No | No | PASS |
| claims-workbench | Partial | No | No | PARTIAL |
| ttra-dashboard | Yes | No | No | PARTIAL |
| fee-dashboard (3 sections) | Yes | No | No | PASS |
| gl-dashboard | Not verified | — | — | — |

## Loading State Audit

| Page | Skeletons | Spinners | Status |
|------|-----------|----------|--------|
| corporate-actions | Yes (SkeletonRows) | Yes (isPending) | **PASS** |
| claims-workbench | **None** | **None** | **FAIL** |
| ttra-dashboard | **None** | **None** | **FAIL** |
| fee-dashboard | Yes (comprehensive) | Yes | **PASS** |

## Dark Mode Audit

- `dark:` prefix usages: **248** across 25 files (all dead code)
- Tailwind config: `darkMode: ["class"]` but `.dark` class never applied
- Feature flag: `DARK_MODE` = `enabled: false`
- **Verdict: FAIL** — Remove dead `dark:` classes or implement toggle

## Error Handling Audit

| Check | Status | Evidence |
|-------|--------|---------|
| ErrorBoundary | PASS | Wraps entire app in App.tsx |
| Suspense fallback | PASS | PageLoader on all lazy routes |
| 404 catch-all | **FAIL** | No root-level catch-all route |

## Accessibility Audit

| Check | Status |
|-------|--------|
| prefers-reduced-motion | **FAIL** (zero in app CSS) |
| Code splitting / Suspense | PASS (295 usages) |
| Viewport meta | PASS |
| 100dvh usage | PASS |
| Semantic forms | PASS |
| aria-live on errors | PASS |

## QA Gates

```
WCAG Status:            PARTIAL (missing reduced-motion, password toggle)
Mobile Readiness:       PASS
Mobile Navigation:      PASS
Login Completeness:     PARTIAL (missing 4 features)
Empty/Error States:     PARTIAL (text-only, no 404)
Blocking Gates:         9/15 PASS, 4/15 PARTIAL, 2/15 FAIL
Non-Blocking Gates:     3/6 PASS, 2/6 PARTIAL, 1/6 FAIL
Release Decision:       NO-GO (2 blocking FAIL: loading states, 404 route)
```
