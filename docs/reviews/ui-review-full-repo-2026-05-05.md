# UI Review: Trust OMS Login Stabilisation

Date: 2026-05-05  
Scope: Full UI inventory with focused remediation of implemented login pages  
Skill: `ui-review`

## Verdict

Conditionally pass for the remediated login surfaces. Back-office and client-portal login pages now meet the expected full-page, responsive, accessible login baseline inspired by the PS-WMS login implementations.

Residual UI gaps remain outside the remediated login scope, mainly backend-backed recovery, session-expiration propagation, and app-wide design-token cleanup in older pages.

Follow-up update on 2026-05-06:
- Front-office and mid-office now have explicit `/login` pages and protected routes.
- The PUDA page seen locally was traced to an unrelated running dev server at `127.0.0.1:5174` from `/Users/n15318/PUDA_workflow_engine/apps/officer`, not to Trust OMS source.
- Trust OMS app dev ports now use `strictPort` so port collisions fail loudly instead of silently moving to another port.

## Scope And Preflight

- Repository: `/Users/n15318/Trust OMS`
- Branch: `main`
- Baseline commit: `e0ae3d6`
- Worktree note: repository was already dirty before this review. Existing unrelated OEMS/schema/test changes and `login-credentials.csv` were left untouched.
- UI apps reviewed:
  - `apps/back-office/src`
  - `apps/client-portal/src`
  - `apps/front-office/src`
  - `apps/mid-office/src`
- Reference inspiration inspected:
  - `/Users/n15318/PS-WMS/apps/ops/src/pages/login.tsx`
  - `/Users/n15318/PS-WMS/apps/rm/src/pages/login.tsx`
  - `/Users/n15318/PS-WMS/apps/client-portal/src/pages/login.tsx`

## Inventory

| Area | Status |
| --- | --- |
| Back-office login route | Present at `/login`; remediated |
| Client-portal login route | Present at `/login`; remediated |
| Front-office login route | Present at `/login`; remediated on 2026-05-06 |
| Mid-office login route | Present at `/login`; remediated on 2026-05-06 |
| Error boundaries | Present in all four app `App.tsx` files |
| Lazy loading | Present in all route modules |
| 404 handling | Back/client/front/mid have wildcard redirects; no dedicated not-found UI |

## Findings

### UI-001 - P1 - Client portal login was not full-featured

Status: Fixed  
Files: `apps/client-portal/src/pages/login.tsx`

The client login had a narrow centered card, hardcoded teal/gray dark-mode classes, no remember-username control, no forgot-password flow, and limited ARIA treatment.

Remediation:
- Rebuilt as a full split login experience using design tokens and lucide icons.
- Added remember username, forgot access panel, password reveal, loading spinner, toast feedback, status/error alerts, and no-password-storage copy.
- Preserved `/api/v1/auth/login` and cookie-based auth contract.

### UI-002 - P1 - Protected redirects discarded intended destination

Status: Fixed  
Files: `apps/back-office/src/routes/index.tsx`, `apps/client-portal/src/routes/index.tsx`

Unauthenticated redirects always went to `/login` without preserving the protected route.

Remediation:
- Added `useLocation`.
- Redirect now passes `state={{ from: pathname + search }}`.
- Login pages navigate back to the intended route after successful authentication.

### UI-003 - P1 - Back-office login did not match stabilisation quality bar

Status: Fixed  
Files: `apps/back-office/src/pages/login.tsx`

The previous back-office login had functional basics but did not provide a mature trust-banking login experience.

Remediation:
- Rebuilt with a PS-WMS-inspired full-page layout.
- Added trust banking context panels, operational workspace messaging, responsive split layout, tokenized styling, and accessible form states.

### UI-004 - P2 - Mobile first render scrolled past key content

Status: Fixed  
Files: `apps/back-office/src/pages/login.tsx`, `apps/client-portal/src/pages/login.tsx`

Initial username focus caused mobile screenshots to start mid-page instead of at the login entry point.

Remediation:
- Removed mount-time autofocus.
- Reordered mobile layout so the login panel appears first with a compact brand signal.
- Kept focus management after failed sign-in and when entering forgot-access mode.

### UI-005 - P2 - Front-office and mid-office logout target missing login route

Status: Fixed on 2026-05-06  
Files: `apps/front-office/src/routes/index.tsx`, `apps/mid-office/src/routes/index.tsx`, `apps/front-office/src/pages/login.tsx`, `apps/mid-office/src/pages/login.tsx`, `packages/ui/src/components/trust-login-page.tsx`

Both layouts remove `trustoms-user` and navigate to `/login`, but their route modules do not define `/login`. Current wildcard behavior redirects unknown routes back to `/`.

Remediation:
- Added shared Trust OMS login experience for front-office and mid-office.
- Added protected route wrappers that preserve intended destinations via route state.
- Kept existing logout navigation to `/login`, now backed by a real route.

### UI-006 - P2 - Forgot-password flow is still a client-side request capture

Status: Open  
Files: `apps/back-office/src/pages/login.tsx`, `apps/client-portal/src/pages/login.tsx`

The UI has a complete forgot-access state, but no backend recovery endpoint is wired yet.

Recommended next fix:
- Add API-backed recovery initiation, rate limiting, audit events, and user-safe success messaging.

### UI-007 - P3 - App-wide legacy hardcoded color classes remain

Status: Open  
Scope: older app pages outside login

The remediated login pages use design tokens, but broader app pages still contain hardcoded semantic colors and dark-mode utility classes. Some are valid status colors; others should be normalized into tokenized variants.

Recommended next fix:
- Run a design-token sweep by module, starting with client-portal dashboards and statement/proposal pages.

## Login Completeness Matrix

| Requirement | Back Office | Client Portal |
| --- | --- | --- |
| Full-page branded login | Fixed | Fixed |
| Username/password form | Present | Present |
| Password visibility toggle | Present | Present |
| Remember username only | Present | Present |
| Forgot-access state | Present, UI-only | Present, UI-only |
| Loading state | Present | Present |
| Error state with live region | Present | Present |
| Success toast | Present | Present |
| Intended-route redirect | Present | Present |
| Session-expired display hook | Present if state is supplied | Present if state is supplied |
| Mobile first viewport | Verified | Verified |
| Tablet/desktop visual QA | Verified | Verified |

## Accessibility

Fixed in login pages:
- Explicit labels and `htmlFor` bindings.
- `autoComplete="username"` and `autoComplete="current-password"`.
- `aria-invalid` and `aria-describedby` on invalid fields.
- `role="alert"` and `aria-live` for error messaging.
- Icon-only controls have accessible names.
- Touch targets use 44px-ish control heights (`h-11` for primary controls).
- Removed mount-time autofocus to avoid mobile scroll jumps.

Residual:
- Full app keyboard walkthrough and screen-reader pass were not completed for every route in this turn.

## Responsive And Visual QA

Screenshots captured with Playwright CLI:

- `docs/reviews/artifacts/ui-review-login-2026-05-05/back-office-desktop.png` - 1440x900
- `docs/reviews/artifacts/ui-review-login-2026-05-05/back-office-tablet.png` - 768x1024
- `docs/reviews/artifacts/ui-review-login-2026-05-05/back-office-mobile.png` - 390x844
- `docs/reviews/artifacts/ui-review-login-2026-05-05/client-portal-desktop.png` - 1440x900
- `docs/reviews/artifacts/ui-review-login-2026-05-05/client-portal-tablet.png` - 768x1024
- `docs/reviews/artifacts/ui-review-login-2026-05-05/client-portal-mobile.png` - 390x844
- `docs/reviews/artifacts/ui-review-login-2026-05-06/front-office-desktop.png` - 1440x900
- `docs/reviews/artifacts/ui-review-login-2026-05-06/front-office-mobile.png` - 390x844
- `docs/reviews/artifacts/ui-review-login-2026-05-06/mid-office-desktop.png` - 1440x900
- `docs/reviews/artifacts/ui-review-login-2026-05-06/mid-office-mobile.png` - 390x844

Observed result:
- Login content is visible and usable at mobile, tablet, and desktop widths.
- No obvious text overlap in reviewed screenshots.
- Desktop split layout matches the PS-WMS-inspired pattern without copying project-specific assets.
- Mobile opens on the login task with a compact brand header and exposes the richer trust narrative below.

## QA Gates

Commands run:

```bash
npm run build -w apps/back-office
npm run build -w apps/client-portal
npm run build -w apps/front-office
npm run build -w apps/mid-office
```

Result: both passed.
Follow-up result: all four targeted UI app builds passed.

```bash
curl -s -o /dev/null -w "%{url_effective} %{http_code}\n" http://127.0.0.1:6175/login
curl -s -o /dev/null -w "%{url_effective} %{http_code}\n" http://127.0.0.1:6176/login
```

Result: both returned `200`.

```bash
rg -n "100vh|text-red-|text-gray-|bg-gray-|dark:text-gray|bg-teal|focus:ring-teal|dark:bg-gray" apps/back-office/src/pages/login.tsx apps/client-portal/src/pages/login.tsx
```

Result: no matches in the remediated login pages.

Note: Vite emitted the existing Node version warning: Node.js `22.11.0` is below Vite's stated `22.12+` range, but the targeted builds completed successfully.

## BRD / Product Fit Matrix

| Trust banking expectation | Login impact | Status |
| --- | --- | --- |
| Secure operational access | Clear back-office secure sign-in with no password persistence | Fixed |
| Client self-service portal | Dedicated client login copy, support path, client-specific persistence key | Fixed |
| Auditability and controlled access | UI avoids token storage and keeps auth cookie flow | Preserved |
| Role-aware return to work | Intended destination preserved during auth redirect | Fixed |
| Recovery governance | UI request capture exists, API workflow pending | Open |
| Front/mid office access boundary | `/login` route and protected redirect now present | Fixed |

## Backlog

1. Wire forgot-access UI to backend recovery endpoints with rate limiting and audit events.
2. Add explicit session-expiration detection and pass `sessionExpired: true` into login redirects.
3. Add automated Playwright login-page checks for empty-submit, password-toggle, forgot-access, and redirect-state behavior.
4. Run app-wide design-token cleanup for older hardcoded color utilities.
5. Replace wildcard redirects with a proper not-found page where user intent should be visible.
6. Add dark-mode screenshot QA for the remediated login pages.

## Top 5 Recommended Next Actions

1. Add backend-backed password recovery initiation.
2. Add Playwright interaction tests for all four login pages.
3. Add session-expired state propagation from auth failures.
4. Run a broader UI consistency pass across client-portal pages.
5. Add dedicated not-found pages instead of wildcard redirects.
