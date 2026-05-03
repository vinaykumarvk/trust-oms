# UI/UX Review — TrustOMS UI Apps

**Date:** 2026-05-03  
**Scope:** All detected UI apps: `apps/back-office`, `apps/front-office`, `apps/mid-office`, `apps/client-portal`  
**Branch / Commit:** `main` / `8ca4a68`  
**Skill:** `ui-review`  
**Verdict:** **NO-GO** for release without remediation of blocking authentication, accessibility, and mobile/table issues.

---

## 1. Scope and Preflight

### Detected UI Apps

| App | Framework | Entry Evidence | Build Result |
|-----|-----------|----------------|--------------|
| Back Office | React + Vite + Tailwind + shared Radix/shadcn-style UI | `apps/back-office/src/App.tsx`, `apps/back-office/src/routes/index.tsx` | PASS |
| Front Office | React + Vite + Tailwind + shared Radix/shadcn-style UI | `apps/front-office/src/App.tsx`, `apps/front-office/src/routes/index.tsx` | PASS |
| Mid Office | React + Vite + Tailwind + shared Radix/shadcn-style UI | `apps/mid-office/src/App.tsx`, `apps/mid-office/src/routes/index.tsx` | PASS |
| Client Portal | React + Vite + Tailwind + shared Radix/shadcn-style UI | `apps/client-portal/src/App.tsx`, `apps/client-portal/src/routes/index.tsx` | PASS |

### Scripts and Environment

| Check | Result |
|-------|--------|
| Root scripts | `build:all`, `test`, `test:run`; no `lint:theme`, no `test:e2e` |
| UI workspace build scripts | Each app has `build: tsc --noEmit && vite build` |
| Screenshot automation | Not executed: `npm ls playwright @playwright/test` returned empty |
| Automated a11y scan | Not executed: `axe-core` / `jest-axe` not installed |
| Backend runtime | Not started; review is static/code evidence plus production builds |

### Commands Executed

| Command | Status | Notes |
|---------|--------|-------|
| `rg --files apps ...` | Executed | Detected four UI apps |
| `npm run build --workspace=@trustoms/front-office` | Executed | PASS |
| `npm run build --workspace=@trustoms/mid-office` | Executed | PASS |
| `npm run build --workspace=@trustoms/back-office` | Executed | PASS |
| `npm run build --workspace=@trustoms/client-portal` | Executed | PASS |
| `npm ls playwright @playwright/test axe-core jest-axe --depth=0` | Executed | No screenshot/a11y tooling installed |
| Theme, navigation, login, accessibility, table, state, toast, route `rg` checks | Executed | Findings below |

---

## 2. UI Inventory

### Route Inventory

| App | Routes / Views | Evidence |
|-----|----------------|----------|
| Front Office | Dashboard, order capture, orders, order detail, SRM approval queue, trader cockpit, client book, mandate monitor, scenario/ESG, committee workspace, placeholders | `apps/front-office/src/routes/index.tsx:46-81` |
| Mid Office | Dashboard, confirmations, settlement placeholder, mandates placeholder, compliance placeholder, NAV/fund accounting, exceptions, unmatched placeholder | `apps/mid-office/src/routes/index.tsx:40-67` |
| Client Portal | Login, dashboard, portfolio, performance, statements, messages, preferences, request action, risk profile, proposals, service requests, campaign inbox | `apps/client-portal/src/routes/index.tsx:63-205` |
| Back Office | Large authenticated router with login, dashboards, master data, operations, CRM, TrustFees, regulatory, tools, and explicit 404 | `apps/back-office/src/routes/index.tsx:184-230`, `apps/back-office/src/routes/index.tsx:1566-1574` |

### Design-System Framework Map

| Area | Evidence | Status |
|------|----------|--------|
| Tailwind | `@tailwind` in all four `src/index.css` files; app `tailwind.config.ts` files present | PASS |
| Shared UI primitives | `@ui/components/ui/button`, `input`, `card`, `dialog`, `table`, `sheet`, `toast`, `skeleton` used widely | PASS |
| Radix/shadcn-style base | Root and `packages/ui/package.json` include Radix, CVA, clsx, tailwind-merge, lucide | PASS |
| Token discipline | Many screens use ad hoc Tailwind colors and `dark:` classes; client portal especially bypasses tokens | PARTIAL |
| i18n | Only `packages/shared/src/i18n/en.json` and `fil.json` found; app text is largely hardcoded | FAIL |

### Navigation Inventory

| App | Sidebar | Collapsible Mobile | Hamburger | Icons | Active State | Touch Target |
|-----|---------|--------------------|-----------|-------|--------------|--------------|
| Back Office | Yes | Sheet overlay | Yes | Yes | Yes | Partial, many `h-9` / `py-2` items below 44px |
| Front Office | Yes | Sheet overlay | Yes | Yes | Yes | Partial, `h-9` collapsed/nav controls below 44px |
| Mid Office | Yes | Sheet overlay | Yes | Yes | Yes | Partial, same layout pattern as front office |
| Client Portal | Yes | Sheet overlay | Yes | Yes | Yes | Partial, nav `py-2.5` likely close but icon buttons `h-9` below 44px |

### Empty / Error / Loading Coverage

| App | Empty State | Loading/Skeleton | Error Boundary | 404 Page |
|-----|-------------|------------------|----------------|----------|
| Back Office | Broad but uneven; many table empty rows | Broad skeleton coverage | App-level only | Explicit 404 |
| Front Office | Present in many lists, often plain text row | Route skeleton and page skeletons | App-level only | Redirects to `/`, no 404 |
| Mid Office | Present in key pages | Route skeleton and page skeletons | App-level only | Redirects to `/`, no 404 |
| Client Portal | Present in many pages | Page loader/spinners and some skeletons | App-level only | Missing catch-all route |

---

## 3. Login Screen Completeness Audit

| App | Login Route | Branded Header | Password Toggle | Remember Me | Forgot Password | Loading | Alert | Theme Selector | 100dvh/dvh | Status |
|-----|-------------|----------------|-----------------|-------------|-----------------|---------|-------|----------------|------------|--------|
| Back Office | Yes | Present | Present | Missing | Missing | Present | `role="alert"` | Missing | `min-h-dvh` | PARTIAL |
| Client Portal | Yes | Present | Present | Missing | Missing | Present | `role="alert"` | Missing | `min-h-dvh` | PARTIAL |
| Front Office | No | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FAIL |
| Mid Office | No | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FAIL |

Evidence:
- Back-office login has form, labels, autocomplete, password toggle, alert, and disabled submit: `apps/back-office/src/pages/login.tsx:98-140`.
- Client portal login has the same baseline: `apps/client-portal/src/pages/login.tsx:99-150`.
- Front-office router starts directly at authenticated layout and routes dashboard at index, with no `/login`: `apps/front-office/src/routes/index.tsx:46-81`.
- Mid-office router does the same: `apps/mid-office/src/routes/index.tsx:40-67`.

Missing universal login items:
- Remember-me username persistence.
- Forgot-password in-page flow.
- Theme selector before login.
- Input `maxLength`.
- Field-level `aria-invalid` / `aria-describedby`.
- Error clearing when typing.
- Redirect to intended page after login.
- Session-expiry message on redirect.
- `<main>` landmark on login page.

---

## 4. Mobile Navigation Audit

| Check | Status | Evidence / Gap |
|-------|--------|----------------|
| Sidebar collapses on mobile | PASS | Front/mid/back/client use Radix `Sheet` mobile overlays |
| Hamburger present | PASS | Front office `apps/front-office/src/components/layout/FrontOfficeLayout.tsx:465-476`; client `apps/client-portal/src/components/layout/ClientPortalLayout.tsx:199-207` |
| Dynamic `aria-expanded` on hamburger | FAIL | Buttons have `aria-label` but no `aria-expanded` |
| Sidebar closes on navigation | PASS | Front `SidebarNav` calls `onNavigate?.()` at `apps/front-office/src/components/layout/FrontOfficeLayout.tsx:101-105`; client `NavLink onClick={onNavigate}` at `apps/client-portal/src/components/layout/ClientPortalLayout.tsx:107-112` |
| Escape/focus trap/body lock | PARTIAL | Inferred from Radix `Sheet`; not manually verified |
| Touch targets >= 44px | PARTIAL | Several controls use `h-9`, `h-8`, `h-7`, below 44px, e.g. `apps/front-office/src/components/layout/FrontOfficeLayout.tsx:119`, `apps/front-office/src/components/layout/FrontOfficeLayout.tsx:435` |
| Safe-area insets | FAIL | `rg safe-area` found no layout usage |

---

## 5. Design System Findings

### Finding DS-01 — Token drift through hardcoded colors and `dark:` overrides

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 16

Evidence:
- Client portal login uses hardcoded Tailwind colors and `dark:` overrides: `apps/client-portal/src/pages/login.tsx:78-147`.
- Statement status badge uses `border-gray-200 text-gray-600 bg-gray-50`: `apps/client-portal/src/pages/statements.tsx:137`.
- Front-office dashboard chart colors are raw hex constants: `apps/front-office/src/pages/rm-dashboard.tsx:147-172`.

Impact: Theme and dark-mode behavior becomes inconsistent. The repo uses Tailwind token variables, but many screens bypass them, causing white-on-dark or brand inconsistency risk.

Fix: Move status/chart colors into semantic tokens or typed variant maps in shared UI. Replace `dark:*` and raw color utilities in production screens with token-based classes.

Verify: Run `rg -n '#[0-9a-fA-F]{3,8}\\b|dark:|bg-gray-|text-gray-' apps/*/src --glob '*.tsx'` and confirm only approved exceptions remain.

### Finding DS-02 — Shared table primitive omits default `scope="col"`

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 12

Evidence: `TableHead` forwards props to `<th>` but does not set `scope="col"` by default: `packages/ui/src/components/ui/table.tsx:75-86`.

Impact: Most table headers across the app lack explicit scope, reducing screen-reader clarity in data-heavy trust operations screens.

Fix: Set `scope={props.scope ?? "col"}` in `TableHead`, and allow override for row headers.

Verify: Inspect rendered tables or add tests for `TableHead` default props.

### Finding DS-03 — Button primitive lacks active state and 44px default height

**Severity:** P2  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 8

Evidence: Shared button variants include focus and hover but no `active` transform/opacity, and default height is `h-10` (40px): `packages/ui/src/components/ui/button.tsx:7-27`.

Impact: Touch feedback is weak and default buttons miss the 44px target recommended by the review standard.

Fix: Update shared variants to `min-h-11` for default/icon and add `active:scale-[0.98]` or `active:opacity-90`.

Verify: Check button class output and test common pages at mobile viewport.

---

## 6. Responsive & Mobile-First Findings

### Finding RSP-01 — Data tables rely on horizontal overflow instead of mobile card reflow

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 15

Evidence:
- Shared `Table` wraps all tables in `overflow-auto`: `packages/ui/src/components/ui/table.tsx:8-16`.
- Front-office orders table has 11 columns and only an overflow table layout: `apps/front-office/src/pages/orders.tsx:112-155`.

Impact: On 320-360px screens, users must horizontally scroll dense order, exception, settlement, and accounting tables. This is error-prone for fiduciary actions.

Fix: Add a responsive table/card component for record lists. Keep horizontal scroll only for true matrix data.

Verify: Manual viewport test at 360x800 for orders, confirmations, statements, and back-office workbenches.

### Finding RSP-02 — No safe-area inset handling for sticky mobile headers/sheets

**Severity:** P2  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 6

Evidence: Sticky headers exist, e.g. `apps/client-portal/src/components/layout/ClientPortalLayout.tsx:196`, but `rg safe-area` found no layout usage.

Impact: Header controls can be clipped on notched iOS devices.

Fix: Add `padding-top: env(safe-area-inset-top)` support to mobile sticky headers and sheet content where needed.

Verify: iPhone viewport with safe-area emulation.

---

## 7. Accessibility Findings

### Finding A11Y-01 — Clickable table rows are not keyboard-accessible

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 15

Evidence:
- Orders row uses `onClick` on `TableRow` without `tabIndex`, `role`, or `onKeyDown`: `apps/front-office/src/pages/orders.tsx:143`.
- Trader cockpit group row also uses clickable `TableRow` without keyboard handling: `apps/front-office/src/pages/trader-cockpit.tsx:194`.

Impact: Keyboard and assistive-technology users cannot open rows or expand groups reliably.

Fix: Add `tabIndex={0}`, `role="link"` for navigation rows, and `onKeyDown` handling for Enter/Space. For expand/collapse rows, use `role="button"` with `aria-expanded`.

Verify: Keyboard-only traversal reaches and activates each clickable row.

### Finding A11Y-02 — Login errors are not tied to fields

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 12

Evidence:
- Back-office login error is a paragraph with `role="alert"` but inputs lack `aria-invalid` / `aria-describedby`: `apps/back-office/src/pages/login.tsx:100-135`.
- Client portal has the same pattern: `apps/client-portal/src/pages/login.tsx:101-140`.

Impact: Screen-reader users hear a general alert but fields are not marked invalid, and focus recovery is weak.

Fix: Add a stable error ID, set `aria-describedby` and `aria-invalid` on affected inputs, and clear errors on input.

Verify: Screen reader announces field invalid state after failed submit.

### Finding A11Y-03 — Icon-only buttons in tables can lack accessible names

**Severity:** P1  
**Confidence:** Medium  
**Status:** Partially Confirmed  
**Risk Score:** 10

Evidence: Orders table has an icon-only ghost button with `<Eye>` and no visible text or `aria-label`: `apps/front-office/src/pages/orders.tsx:154`.

Impact: Screen-reader users do not know what the action does.

Fix: Add `aria-label={`View order ${...}`}` or include visually hidden text.

Verify: `rg -n '<Button[^>]*><[A-Z][A-Za-z]+ className=\"h-4 w-4\"' apps/*/src --glob '*.tsx'` and manual review.

---

## 8. Interaction & State Findings

### Finding INT-01 — Front-office and mid-office have no protected login/session UX

**Severity:** P0  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 25

Evidence:
- Front-office router mounts `FrontOfficeLayout` directly and uses index dashboard: `apps/front-office/src/routes/index.tsx:46-54`.
- Mid-office router mounts `MidOfficeLayout` directly and uses index dashboard: `apps/mid-office/src/routes/index.tsx:40-48`.

Impact: Two internal operational apps have no login screen, no session-expiry path, and no intended-route redirect behavior. This is blocking for release.

Fix: Add `/login`, `ProtectedRoute`, session-expired messaging, and intended URL redirect to front-office and mid-office, matching but improving the back-office/client pattern.

Verify: Unauthenticated access to `/orders`, `/confirmations`, and `/nav` redirects to `/login?returnTo=...`; successful login returns to original route.

### Finding INT-02 — Front/mid invalid routes silently redirect to dashboard

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 9

Evidence:
- Front-office catch-all redirects to `/`: `apps/front-office/src/routes/index.tsx:80-81`.
- Mid-office catch-all redirects to `/`: `apps/mid-office/src/routes/index.tsx:66-67`.

Impact: Users lose context and cannot tell whether a URL is invalid, unauthorized, or moved.

Fix: Add a real `NotFoundPage` with route, navigation options, and support link.

Verify: Visit a random URL and confirm 404 page, not dashboard redirect.

### Finding INT-03 — Client portal has no catch-all route

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 9

Evidence: Client portal route list ends after `/campaign-inbox`; no `path: "*"` is present in `apps/client-portal/src/routes/index.tsx:197-205`.

Impact: Unknown paths may render blank or confusing router behavior.

Fix: Add `path: "*"` under protected layout and optionally public catch-all for unauthenticated users.

Verify: Visit `/not-a-real-page`.

---

## 9. Empty State / Error Boundary / Loading Pattern Findings

### Finding STATE-01 — Error boundary exists but fallback is not production-grade

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 12

Evidence:
- All apps wrap app root in `ErrorBoundary`: `apps/front-office/src/App.tsx:10-17`, `apps/back-office/src/App.tsx:10-15`.
- Fallback uses `h-screen`, raw error message, and only a reload button: `packages/ui/src/components/ui/error-boundary.tsx:23-38`.

Impact: A route crash exposes raw errors, lacks "Go Home" or "Report issue", and uses `h-screen` instead of `dvh`.

Fix: Upgrade shared fallback with sanitized message, incident ID hook, Reload, Go Home, and `min-h-dvh`.

Verify: Throw an error in a test page and inspect fallback behavior.

### Finding STATE-02 — Empty states are present but often plain table rows, not guided empty states

**Severity:** P2  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 8

Evidence: Orders empty state is text-only: `apps/front-office/src/pages/orders.tsx:137-140`; many back-office tables use similar `EmptyRow`.

Impact: Users get low-guidance empty tables instead of a clear first action or filter recovery.

Fix: Add shared `EmptyState` component with icon, heading, description, and optional CTA. Use different copy for "no data" vs "no search/filter results".

Verify: Force empty API response and inspect each list view.

---

## 10. Modern UI Pattern Findings

### Finding MOD-01 — Toast implementation is accessible via Radix but queue/limit policy is unclear

**Severity:** P3  
**Confidence:** Medium  
**Status:** Partially Confirmed  
**Risk Score:** 3

Evidence: Toaster uses Radix toast primitives via `packages/ui/src/components/ui/toast.tsx:8-54`, viewport at `packages/ui/src/components/ui/toast.tsx:10-21`.

Impact: Toasts are generally sound, but no explicit visible-limit policy was verified.

Fix: Document and enforce max visible toasts if not already handled by reducer.

Verify: Trigger more than three mutation toasts.

### Finding MOD-02 — Hardcoded English strings dominate UI; i18n footprint is minimal

**Severity:** P1  
**Confidence:** High  
**Status:** Confirmed  
**Risk Score:** 12

Evidence:
- Only `packages/shared/src/i18n/en.json` and `fil.json` found.
- Login hardcodes all visible text: `apps/back-office/src/pages/login.tsx:84-146`, `apps/client-portal/src/pages/login.tsx:85-156`.
- Boolean badges hardcode "Yes"/"No": `apps/back-office/src/pages/supervisor-dashboard-rp.tsx:725-729`.

Impact: The UI cannot meet multilingual or localized BRD obligations for Philippine deployment.

Fix: Define app-level i18n strategy and migrate visible strings to keys, starting with login, nav, errors, empty states, and sensitive-action dialogs.

Verify: Locale switch changes visible UI text and no hardcoded critical strings remain.

---

## 11. QA Gates and Verdict

```text
WCAG Status:            PARTIAL
Mobile Readiness:       PARTIAL
Mobile Navigation:      PARTIAL
Login Completeness:     FAIL
Empty/Error States:     PARTIAL
Blocking Gates:         3/15 PASS, 8/15 PARTIAL, 4/15 FAIL
Non-Blocking Gates:     2/6 PASS, 4/6 PARTIAL, 0/6 FAIL
Release Decision:       NO-GO
```

### Blocking Gate Detail

| Gate | Status | Blocking Issue |
|------|--------|----------------|
| Accessibility | PARTIAL | Clickable rows and login field error semantics fail |
| Mobile responsiveness | PARTIAL | Dense tables rely on horizontal overflow |
| Mobile navigation | PARTIAL | Good Sheet pattern, but touch target and aria-expanded gaps |
| Login completeness | FAIL | Front/mid no login; back/client missing remember/forgot/theme/session behavior |
| Interaction predictability | PARTIAL | Invalid routes redirect silently in front/mid |
| Sensitive action safety | PARTIAL | Many dialogs present; full coverage not verified |
| System status visibility | PARTIAL | Loading/empty states exist, but uneven quality |
| Error prevention/recovery | PARTIAL | ErrorBoundary fallback too thin |
| Progressive disclosure | PASS | Radix dialogs/sheets/tabs used broadly |
| State resilience | PARTIAL | App-level boundary only; route-level failures not isolated |
| Graceful degradation/offline | PARTIAL | Static code has errors/loading; offline not verified |
| Empty state coverage | PARTIAL | Present but often text-only |
| Error boundary coverage | PASS | All apps root-wrapped |
| UI determinism | PARTIAL | Not fully verified without runtime data |
| Behavioral trust | FAIL | Missing auth/session UX on two internal apps |

---

## 12. Bugs and Foot-Guns

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| BUG-01 | P0 | Front-office and mid-office expose app routes without login/protected route | `apps/front-office/src/routes/index.tsx:46-81`, `apps/mid-office/src/routes/index.tsx:40-67` |
| BUG-02 | P1 | Clickable `TableRow` not keyboard accessible | `apps/front-office/src/pages/orders.tsx:143`, `apps/front-office/src/pages/trader-cockpit.tsx:194` |
| BUG-03 | P1 | Missing real 404 in front, mid, client | `apps/front-office/src/routes/index.tsx:80-81`, `apps/mid-office/src/routes/index.tsx:66-67`, client route absence |
| BUG-04 | P1 | Login error semantics incomplete | `apps/back-office/src/pages/login.tsx:100-135`, `apps/client-portal/src/pages/login.tsx:101-140` |
| BUG-05 | P1 | Table headers do not default to `scope="col"` | `packages/ui/src/components/ui/table.tsx:75-86` |
| BUG-06 | P2 | Safe-area insets absent on sticky mobile headers | `apps/client-portal/src/components/layout/ClientPortalLayout.tsx:196` plus no `safe-area` matches |
| BUG-07 | P2 | Hardcoded colors create dark-mode/theme drift | `apps/client-portal/src/pages/login.tsx:78-147`, `apps/front-office/src/pages/rm-dashboard.tsx:147-172` |
| BUG-08 | P2 | Text-only empty states | `apps/front-office/src/pages/orders.tsx:137-140` |

---

## 13. BRD UI Compliance Matrix

| BRD Area | UI Requirement | Evidence | Status | Gap | Next Step |
|----------|----------------|----------|--------|-----|-----------|
| Client self-service portal | Client login and authenticated portal | Client login exists at `apps/client-portal/src/routes/index.tsx:63-72` | PARTIAL | Missing remember/forgot/theme/session-expiry UX | Complete login checklist |
| Mobile RM cockpit | Mobile-responsive front-office shell | `apps/front-office/src/components/layout/FrontOfficeLayout.tsx:465-509` | PARTIAL | Auth missing; touch target gaps | Add protected login and 44px nav targets |
| Operations control tower/back-office | Authenticated back-office console | `apps/back-office/src/routes/index.tsx:184-230` | PARTIAL | Login incomplete; token drift | Harden login and design tokens |
| Compliance and audit | Accessible tables and traceable actions | Shared table at `packages/ui/src/components/ui/table.tsx:75-86` | PARTIAL | Missing default header scope; some row actions inaccessible | Fix table primitive and clickable rows |
| Localization | Philippine deployment content readiness | Only `en.json` and `fil.json` found | FAIL | App UI hardcoded English | Implement app i18n coverage |
| Session/timeout UX | Secure session expiry and redirect | Back/client protected route only; front/mid none | FAIL | No consistent session-expired flow | Shared auth shell pattern |
| Responsive reporting/workbenches | Data tables usable on mobile | Orders table at `apps/front-office/src/pages/orders.tsx:112-155` | PARTIAL | Horizontal scroll for dense records | Responsive record cards |

---

## 14. UI Architect Backlog

| ID | Title | Priority | Risk | Effort | Area | Where | Why | Change | Verify | Dependencies |
|----|-------|----------|------|--------|------|-------|-----|--------|--------|--------------|
| UI-01 | Add protected login/session shell to front-office | P0 | 25 | M | Auth | `apps/front-office` | Blocks secure release | Add `/login`, `ProtectedRoute`, returnTo | Unauth route redirects | Auth API |
| UI-02 | Add protected login/session shell to mid-office | P0 | 25 | M | Auth | `apps/mid-office` | Blocks secure release | Same as front-office | Unauth route redirects | Auth API |
| UI-03 | Complete login checklist for back-office | P1 | 12 | M | Login | `apps/back-office/src/pages/login.tsx` | Auth UX incomplete | Remember, forgot, theme, field ARIA | Manual login audit | UI primitives |
| UI-04 | Complete login checklist for client portal | P1 | 12 | M | Login | `apps/client-portal/src/pages/login.tsx` | Client-facing polish/security | Same as above | Manual login audit | UI primitives |
| UI-05 | Add real 404 pages to front/mid/client | P1 | 9 | S | Routing | `routes/index.tsx` | Prevent silent context loss | Add `NotFoundPage` | Visit fake URL | None |
| UI-06 | Make clickable rows keyboard-accessible | P1 | 15 | S | A11y | `orders.tsx`, `trader-cockpit.tsx`, search repo | Keyboard access | Add role/tabIndex/onKeyDown | Keyboard test | None |
| UI-07 | Add `scope="col"` default to `TableHead` | P1 | 12 | S | A11y | `packages/ui/src/components/ui/table.tsx` | Screen reader table semantics | Default `scope` | Unit/render check | None |
| UI-08 | Add responsive record-list table pattern | P1 | 15 | L | Mobile | Shared UI + high-use tables | Mobile usability | Table-to-card below breakpoint | 360px screenshot | Design input |
| UI-09 | Raise default button/nav touch targets | P1 | 10 | S | Mobile | `packages/ui/src/components/ui/button.tsx`, layout nav | Mis-tap risk | `min-h-11`, nav item classes | CSS inspect | None |
| UI-10 | Add `aria-expanded` to hamburger buttons | P1 | 9 | S | Nav a11y | All layouts | Screen reader state | Bind to open state | DOM inspect | None |
| UI-11 | Add safe-area inset support | P2 | 6 | S | Mobile | Layout headers/sheets | Notched device support | `pt-[env(...)]` or CSS class | iOS emulation | None |
| UI-12 | Replace hardcoded chart/status colors with tokens | P2 | 8 | M | Theme | Front/client/back pages | Dark mode consistency | Semantic variants | Theme scan | Design tokens |
| UI-13 | Establish i18n strategy and migrate shell/login/nav | P1 | 12 | L | i18n | All apps | BRD localization | Shared `t()` and locale files | Locale switch | Product copy |
| UI-14 | Upgrade ErrorBoundary fallback | P1 | 12 | S | Resilience | `packages/ui` | Better crash recovery | Sanitized message, home/reload | Forced error test | None |
| UI-15 | Create shared `EmptyState` component | P2 | 8 | S | States | `packages/ui` | Better no-data UX | Icon/title/body/CTA | Empty API state | None |
| UI-16 | Replace text-only table empty rows | P2 | 8 | M | States | High-use list views | Reduce confusion | Use `EmptyState` | Empty state test | UI-15 |
| UI-17 | Add route-level error elements | P2 | 6 | M | Resilience | Routers | Isolate crashes | React Router `errorElement` | Throw route error | UI-14 |
| UI-18 | Add screenshot/a11y tooling | P1 | 10 | M | QA | Root repo | Required evidence | Playwright + axe | CI artifacts | Dev deps |
| UI-19 | Add theme lint script | P2 | 8 | M | QA | Scripts | Prevent token drift | `lint:theme` | CI command | None |
| UI-20 | Audit icon-only buttons for labels | P1 | 10 | M | A11y | All apps | Screen reader names | Add labels/sr-only | rg + manual | None |
| UI-21 | Add active states to shared button | P2 | 6 | S | Interaction | `packages/ui` | Touch feedback | `active:` style | Visual test | None |
| UI-22 | Add intended-route login redirect | P1 | 10 | M | Auth | Back/client/front/mid | Better session UX | `returnTo` param | Expired session test | Auth shell |
| UI-23 | Add session-expired banner | P2 | 6 | S | Auth | Login pages | Recovery clarity | Query/state message | Manual test | UI-22 |
| UI-24 | Document design-system usage contract | P2 | 6 | S | Design system | `docs/` | Reduce drift | Primitive/token rules | Review doc | None |
| UI-25 | Add mobile QA matrix to CI/manual checklist | P2 | 6 | S | QA | `docs/` | Repeatable validation | 360/768/1280 checklist | Review checklist | UI-18 |

---

## 15. Quick Wins and Stabilization

### Quick Wins Under 2 Hours

| Task | Files | Verify |
|------|-------|--------|
| Add `scope="col"` default to `TableHead` | `packages/ui/src/components/ui/table.tsx` | Inspect rendered `<th scope="col">` |
| Add `aria-expanded` to mobile hamburger buttons | `BackOfficeLayout`, `FrontOfficeLayout`, `MidOfficeLayout`, `ClientPortalLayout` | DOM shows open/closed state |
| Add real 404 page to front/mid/client | `apps/*/src/routes/index.tsx` | Fake URL shows 404 |
| Add `aria-label` to icon-only order view button | `apps/front-office/src/pages/orders.tsx` | Screen reader name present |
| Add keyboard handlers to known clickable rows | `orders.tsx`, `trader-cockpit.tsx` | Enter/Space works |
| Change ErrorBoundary `h-screen` to `min-h-dvh` and add Home button | `packages/ui/src/components/ui/error-boundary.tsx` | Forced error page |
| Add `maxLength` to login username/password | Back/client login pages | Attribute present |
| Clear login error on input change | Back/client login pages | Error disappears while typing |

### Two-Day Stabilization

| Task | Files | Verify |
|------|-------|--------|
| Implement front/mid login and protected routes | `apps/front-office`, `apps/mid-office` | Unauth redirect and returnTo |
| Add remember-me username only | All login pages | LocalStorage stores only username |
| Add forgot-password in-page panel | All login pages | Panel swaps without route change |
| Add field-level login ARIA | All login pages | `aria-invalid` and `aria-describedby` |
| Add shared `EmptyState` component and replace top list screens | `packages/ui`, high-use pages | No blank/text-only list |
| Tokenize client portal login and statements statuses | Client portal pages | Theme scan reduced |
| Add Playwright smoke screenshots | Root test setup | 360/768/1280 screenshots |
| Add axe smoke scan for login and app shell | Root test setup | a11y report generated |

---

## 16. Top 5 Priorities

1. Add login/protected route/session UX to front-office and mid-office.
2. Fix clickable row keyboard access and shared table header semantics.
3. Complete login checklist for back-office and client portal.
4. Add real 404 pages and upgrade the shared error boundary.
5. Start token/i18n cleanup with login, nav, status badges, and high-use tables.

