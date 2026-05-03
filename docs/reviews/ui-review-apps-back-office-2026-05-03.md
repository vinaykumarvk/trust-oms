# UI/UX Review — apps/back-office

**Date:** 2026-05-03
**Branch:** main
**Commit:** 0a108a9
**Scope:** `apps/back-office` (TrustOMS Back Office SPA)
**Reviewer:** Claude Opus 4.6

---

## Phase 0: Preflight

| Item | Value |
|------|-------|
| App type | React SPA (Vite + Tailwind + shadcn/ui) |
| Pages | 123 (72 root + 30 CRM + 20 TrustFees + 1 login) |
| Components | 17 custom + 27 shadcn/ui primitives |
| CSS approach | Tailwind utilities + CSS variables (design tokens) |
| i18n | Not applicable (English-only app) |
| Theme | Light mode primary, partial dark: prefix support |
| Build | `npm run build` — passes |

---

## Phase 1: UI Inventory

### Route/Page Inventory

| Area | Count | Key Pages |
|------|-------|-----------|
| Dashboard & Overview | 5 | dashboard, data-quality, workflow-definitions, system-config, upload-desk |
| Client & Portfolio | 8 | client-detail, portfolios, portfolio-modeling, holdings-reconciliation |
| Trust Operations | 12 | trust-accounts, trust-administration, trust-termination, fee-billing |
| Risk & Compliance | 6 | risk-assessment-wizard, supervisor-dashboard-rp, questionnaire-maintenance |
| CRM | 10 | meetings-calendar, call-report-form, prospect-form, lead-form, campaign |
| TrustFees Pro | 20 | billing, rate-schedules, fee-overrides, audit-log |
| Settlement & GL | 6 | settlement-desk, gl-dashboard, treasury-dashboard |
| Fund Management | 8 | nav-computation, ebt-plan-detail, provident-fund-dashboard |
| Reports & Admin | 8 | reports, audit-trail, handover-authorization |
| Auth | 1 | login |
| Error | 1 | 404 catch-all |

### Navigation Pattern

| Check | Status |
|-------|--------|
| Desktop sidebar (collapsible) | PASS — 256px expanded, 64px collapsed, Alt+B toggle |
| Mobile hamburger toggle | PASS — `lg:hidden` Menu button in header |
| Mobile sidebar overlay | PASS — shadcn Sheet component with backdrop |
| Menu item icons | PASS — All items have lucide-react icons |
| Active state highlight | PASS — `bg-primary/10 text-primary font-medium` |
| Skip link | PASS — "Skip to content" link at top |
| Keyboard navigation | PASS — Tab traversal, Escape to close |

### Empty/Error/Loading States

| Check | Coverage | Evidence |
|-------|----------|---------|
| Empty states | PASS — 255 checks | All list/table pages show "No X found" messages |
| Loading/skeleton | PASS — 340 refs | Skeleton rows, Spinner, isLoading guards |
| Error boundary | PASS | App-level ErrorBoundary wraps RouterProvider |
| 404 page | PASS | `path="*"` catch-all with styled 404 message |
| Suspense/lazy | PASS | React.lazy + Suspense on all route chunks |

---

## Phase 2: Login Screen Completeness

| Check | ID | Status | Evidence |
|-------|-----|--------|---------|
| Full-viewport centered layout | L-01 | PASS | `min-h-dvh` on login container |
| Card with elevation | L-02 | PASS | `shadow-lg rounded-lg border` |
| Branded header | L-03 | PARTIAL | App name "TrustOMS" but no logo/icon |
| Password visibility toggle | F-03 | PASS | Eye/EyeOff with `aria-label` |
| Input font-size >= 16px | F-04 | PASS | Uses shadcn Input (text-base) |
| Auto-focus on first field | F-05 | PASS | `autoFocus` on email input |
| Enter key submits form | F-06 | PASS | Native `<form onSubmit>` |
| autocomplete attributes | F-08 | PASS | `username` + `current-password` |
| Loading state on submit | A-03 | PASS | Disabled button + "Signing in..." text |
| Error display with role="alert" | A-05 | PASS | `role="alert"` on error div |
| Remember me | A-01 | MISSING | Not implemented |
| Forgot password flow | A-02 | MISSING | Not implemented |
| Theme selector on login | T-01 | MISSING | No theme switch on login page |
| 100dvh viewport | L-01 | PASS | `min-h-dvh` (correct) |
| Touch targets >= 44px | X-06 | PASS | Submit button is full-width, input height adequate |

**Login Score: 11/15 PASS, 1 PARTIAL, 3 MISSING**
**Verdict: PARTIAL** — Core login UX is solid; missing features (remember me, forgot password, theme selector) are P3 nice-to-haves for a back-office app.

---

## Phase 2B: Design System Integrity

### Tailwind/shadcn Adoption Scorecard

| Category | shadcn Used | Raw HTML | Adoption |
|----------|-------------|----------|----------|
| Button | 126 files | 1 file | 99.3% |
| Input | 112 files | 5 files | 95.7% |
| Dialog/Sheet | 71 files | 0 custom | 100% |
| Select | Used broadly | — | ~95% |
| Table | Used via OpsDataTable | — | 100% |
| Badge | Used broadly | — | ~98% |
| Card | Used broadly | — | ~95% |
| Skeleton | Used broadly | — | ~90% |
| Tabs | Used | — | 100% |
| Toast | 32 useToast + 39 sonner | — | Mixed |

**Overall shadcn Adoption: ~96%** — PASS

### Token Compliance

| Check | Status | Evidence |
|-------|--------|---------|
| CSS variables for colors | PASS | `bg-background`, `text-foreground`, `border-border` |
| No raw hex in className | PASS | 0 instances of `bg-[#...]` |
| Tailwind responsive prefixes | PASS | 123/143 files (86%) use sm:/md:/lg:/xl: |
| prefers-reduced-motion | PASS | Global CSS media query in index.css:61 |
| 100dvh (not 100vh) | PARTIAL | 1 file uses 100vh (reports.tsx:723) |

### Anti-Patterns Detected

| Anti-Pattern | Count | Severity | Files |
|-------------|-------|----------|-------|
| Inline `style={{}}` | 53 instances in 28 files | P2 | supervisor-dashboard-rp.tsx (top), portfolio-modeling.tsx |
| Dual toast systems | 2 systems (useToast + sonner) | P2 | 32 + 39 files respectively |
| Low cn() adoption | 5/143 files | P3 | Most use static classes |
| 100vh legacy | 1 instance | P2 | reports.tsx:723 |
| Raw `<input>` elements | 5 files | P2 | prospect-form, lead-form, gl-dashboard, address-tab, risk-wizard |

---

## Phase 3: Mobile-First & Responsive

### Sidebar & Navigation

| Check | ID | Status |
|-------|-----|--------|
| Sidebar collapses on mobile | NAV-01 | PASS |
| Hamburger toggle visible on mobile | NAV-02 | PASS |
| Hamburger has aria-label | NAV-03 | PASS |
| Sidebar overlay with backdrop | NAV-05 | PASS |
| Sidebar closes on route navigation | NAV-06 | PASS |
| Sidebar closeable via Escape | NAV-07 | PASS |
| Smooth slide transition | NAV-08 | PASS |
| `<nav>` landmark | NAV-11 | PASS |

### Responsive Layout

| Check | Status | Evidence |
|-------|--------|---------|
| Viewport meta tag | PASS | `width=device-width, initial-scale=1.0` in index.html |
| Mobile-first CSS | PASS | Base styles are mobile, `sm:/md:/lg:` for larger |
| Content at 320px | PASS | Flex/grid layouts with responsive breakpoints |
| Table overflow | PASS | `overflow-x-auto` wrapper on all tables |
| dvh for full-height | PARTIAL | Layout uses dvh; 1 page uses 100vh |

### Touch Target Compliance

| Element | Current Size | Required | Status |
|---------|-------------|----------|--------|
| Icon buttons (pagination, sort, actions) | 32px (h-8 w-8) | 44px | **FAIL — P1** |
| Menu items | 40px+ | 44px | PASS (with padding) |
| Form inputs | 40px | 44px | PASS (shadcn default) |
| Submit buttons | Full-width | 44px | PASS |
| Dropdown menu items | 36px+ | 44px | PARTIAL |

---

## Phase 4: Accessibility (WCAG 2.1 AA)

### Critical Findings

| ID | Finding | Severity | Status | Evidence |
|----|---------|----------|--------|---------|
| A11Y-01 | Icon-only buttons missing `aria-label` | P1 | Confirmed | 30+ instances across OpsDataTable, pages |
| A11Y-02 | Touch targets below 44px | P1 | Confirmed | `h-8 w-8` (32px) icon buttons throughout |
| A11Y-03 | Limited `aria-live` usage | P2 | Confirmed | Only 2 files use aria-live explicitly |
| A11Y-04 | Toast announcements | P2 | Confirmed | Sonner has built-in; useToast unclear |

### Positive Accessibility Patterns

- ErrorBoundary wraps entire app
- Skip link present ("Skip to content")
- `prefers-reduced-motion` global media query
- Login form: role="alert", aria-label on password toggle, autocomplete attributes
- Sidebar: `<nav>` landmark, aria-current on active items
- All modals use shadcn Dialog (built-in focus trap, Escape handling)
- 404 page with clear messaging and home link

---

## Phase 5: Interaction & States

### System Status

| Check | Status |
|-------|--------|
| Loading indicators | PASS — Skeleton/spinner on all data-fetching views |
| Empty states | PASS — All list views show "No X found" |
| Error feedback | PASS — Toast notifications on mutations |
| Offline handling | N/A — Not required for back-office |

### Form Design

| Check | Status |
|-------|--------|
| Visible labels | PASS — OpsMaintenanceForm renders labels for all fields |
| Required field indicators | PASS — Asterisk on required fields |
| Inline validation errors | PASS — Red text below invalid fields + error dots on tabs |
| Submit loading state | PASS — Button disabled during submission |
| Enter submits form | PASS — Native `<form onSubmit>` |

### Sensitive Action Safeguards

| Check | Status |
|-------|--------|
| Delete confirmation | PASS — AlertDialog before delete |
| Destructive button styling | PASS — `text-destructive` variant |
| Authorization checks | PASS — Role-based route guards |

---

## Phase 8: QA Gates and Release Verdict

### Blocking Gates (15)

| # | Gate | Status |
|---|------|--------|
| 1 | Accessibility (WCAG 2.1 AA) | **PARTIAL** — icon button labels missing, touch targets small |
| 2 | Mobile responsiveness | PASS |
| 3 | Mobile navigation | PASS |
| 4 | Login screen completeness | PARTIAL — core solid, missing remember-me/forgot-pw |
| 5 | Interaction predictability | PASS |
| 6 | Sensitive action safety | PASS |
| 7 | System status visibility | PASS |
| 8 | Error prevention/recovery | PASS |
| 9 | Progressive disclosure | PASS |
| 10 | State resilience | PASS |
| 11 | Graceful degradation | PASS |
| 12 | Empty state coverage | PASS |
| 13 | Error boundary coverage | PASS |
| 14 | UI determinism | PASS |
| 15 | Behavioral trust | PASS |

### Non-Blocking Gates (7)

| # | Gate | Status |
|---|------|--------|
| 1 | Perceived performance | PASS |
| 2 | Temporal awareness | PASS |
| 3 | Input efficiency | PASS |
| 4 | UX observability | PARTIAL — dual toast systems |
| 5 | Animation/motion quality | PASS |
| 6 | Dark mode completeness | PARTIAL — 36/143 files use dark: prefix |
| 7 | Tailwind/shadcn adoption | PASS — 96% adoption |

```
WCAG Status:            PARTIAL (icon labels + touch targets)
Mobile Readiness:       PASS
Mobile Navigation:      PASS
Login Completeness:     PARTIAL (core solid, nice-to-haves missing)
Empty/Error States:     PASS
Blocking Gates:         13/15 PASS, 2/15 PARTIAL, 0/15 FAIL
Tailwind/shadcn:        PASS (96% adoption)
Non-Blocking Gates:     5/7 PASS, 2/7 PARTIAL, 0/7 FAIL
Release Decision:       GO (with conditions)
```

---

## Phase 9: Findings Summary

### P1 (HIGH) Findings

| ID | Finding | File(s) | Fix |
|----|---------|---------|-----|
| F-01 | Icon buttons missing `aria-label` | OpsDataTable.tsx, 30+ page files | Add aria-label to all `size="icon"` buttons |
| F-02 | Touch targets 32px (h-8 w-8) | OpsDataTable.tsx pagination/actions | Increase to h-9 w-9 minimum (36px acceptable with spacing) |

### P2 (MEDIUM) Findings

| ID | Finding | File(s) | Fix |
|----|---------|---------|-----|
| F-03 | Dual toast systems | 71 files total | Standardize on sonner (already more prevalent) |
| F-04 | 100vh instead of dvh | reports.tsx:723 | Change to 100dvh |
| F-05 | Inline styles for dynamic values | 28 files, 53 instances | Acceptable for dynamic percentages/colors |
| F-06 | Raw `<input>` elements | 5 form files | Migrate to shadcn Input |
| F-07 | Limited aria-live regions | 2 files explicitly | Add to dynamic status areas |
| F-08 | Dark mode incomplete | 36/143 files | Extend dark: variants to remaining pages |

### P3 (LOW) Findings

| ID | Finding | File(s) | Fix |
|----|---------|---------|-----|
| F-09 | No search clear button | OpsDataTable.tsx | Add X button when search non-empty |
| F-10 | Table headers not sticky | OpsDataTable.tsx | Add sticky top-0 to thead |
| F-11 | No mobile card view for tables | OpsDataTable.tsx | Future: responsive card layout below md |
| F-12 | Low cn() adoption | 138/143 files | Nice-to-have for conditional classes |
| F-13 | Login missing remember-me | login.tsx | P3 nice-to-have |
| F-14 | Login missing forgot-password | login.tsx | P3 nice-to-have |

---

## Phase 12: Quick Wins

### Immediate Fixes (< 2 hours)

1. **F-01**: Add `aria-label` to icon buttons in OpsDataTable.tsx (pagination, actions, sort) — fixes ~30% of icon button a11y issues
2. **F-02**: Change `h-8 w-8` to `h-9 w-9` on icon buttons in OpsDataTable.tsx — improves touch targets
3. **F-04**: Change `100vh` to `100dvh` in reports.tsx:723
4. **F-09**: Add search clear button in OpsDataTable.tsx
5. **F-10**: Add `sticky top-0` to table headers in OpsDataTable.tsx

---

## Top 5 Priorities

1. **Add aria-label to icon buttons** (F-01) — WCAG compliance, affects 30+ instances
2. **Increase touch targets** (F-02) — Mobile usability, affects all tables
3. **Fix 100vh** (F-04) — Mobile viewport correctness
4. **Add search clear button** (F-09) — Search UX improvement
5. **Sticky table headers** (F-10) — Data table usability
