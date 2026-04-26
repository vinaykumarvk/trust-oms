# Full Review: Risk Profiling & Proposal Generation

## Date: 2026-04-22
## Reviewer: Automated Code Review (Claude Opus 4.6)
## Module: Risk Profiling & Proposal Generation
## Files Reviewed: 10

### Files In Scope

| # | File | Type | Lines |
|---|------|------|-------|
| 1 | `server/services/risk-profiling-service.ts` | Backend Service | ~1810 |
| 2 | `server/services/proposal-service.ts` | Backend Service | ~1074 |
| 3 | `server/routes/back-office/risk-profiling.ts` | API Routes | ~414 |
| 4 | `server/routes/back-office/proposals.ts` | API Routes | ~292 |
| 5 | `apps/back-office/src/pages/questionnaire-maintenance.tsx` | UI Page | ~850+ |
| 6 | `apps/back-office/src/pages/risk-appetite-mapping.tsx` | UI Page | ~592 |
| 7 | `apps/back-office/src/pages/asset-allocation-config.tsx` | UI Page | ~749 |
| 8 | `apps/back-office/src/pages/risk-assessment-wizard.tsx` | UI Page | ~612 |
| 9 | `apps/back-office/src/pages/investment-proposals.tsx` | UI Page | ~1041 |
| 10 | `apps/back-office/src/pages/supervisor-dashboard-rp.tsx` | UI Page | ~819 |

---

## Findings

| # | Severity | Domain | File:Line | Description | Fix |
|---|----------|--------|-----------|-------------|-----|
| 1 | CRITICAL | Security | `proposals.ts:117` | **Suitability check endpoint missing auth guard.** `POST /:proposalId/suitability-check` has no `requireBackOfficeRole()` middleware, allowing any unauthenticated user to trigger suitability checks that mutate proposal data (updates `suitability_check_passed` and `risk_deviation_flagged` on line items). | Add `requireBackOfficeRole()` middleware to the route. |
| 2 | CRITICAL | Security | `proposals.ts:130` | **What-if analysis endpoint missing auth guard.** `POST /:proposalId/what-if` has no `requireBackOfficeRole()` middleware. This endpoint persists computed metrics (expected_return, std_dev, sharpe_ratio, max_drawdown) to the database, meaning unauthenticated users can overwrite financial analytics on any proposal. | Add `requireBackOfficeRole()` middleware to the route. |
| 3 | CRITICAL | Security | `proposals.ts:201,211` | **Client accept/reject endpoints missing auth guard.** `POST /:id/client-accept` and `POST /:id/client-reject` have no authentication middleware. Any unauthenticated user can accept or reject any proposal on behalf of any client, bypassing the entire approval workflow. | Add `requireBackOfficeRole()` (or a client-portal auth middleware) to both routes. |
| 4 | CRITICAL | Security | `proposals.ts:221` | **Return-for-revision endpoint missing auth guard.** `POST /:id/return-for-revision` has no `requireBackOfficeRole()` middleware. Any unauthenticated user can revert any proposal to DRAFT status, disrupting the approval workflow and potentially overriding compliance decisions. | Add `requireBackOfficeRole()` middleware to the route. |
| 5 | CRITICAL | Security | `proposals.ts:240` | **PDF generation endpoint missing auth guard.** `POST /:id/generate-pdf` has no `requireBackOfficeRole()` middleware. Allows unauthenticated users to generate/overwrite the `proposal_pdf_url` field on any proposal. | Add `requireBackOfficeRole()` middleware to the route. |
| 6 | CRITICAL | Security | `risk-profiling.ts:270` | **Compute-score endpoint missing auth guard.** `POST /assessments/compute-score` has no `requireBackOfficeRole()` middleware. While computation alone doesn't persist data, it validates against internal questionnaire configs and exposes risk appetite band mappings in the response, leaking sensitive business rules to unauthenticated callers. | Add `requireBackOfficeRole()` middleware to the route. |
| 7 | CRITICAL | Security | `risk-profiling.ts:340,349` | **Deviation recording and acknowledgement endpoints missing auth guard.** `POST /deviations` and `POST /deviations/:id/acknowledge` have no `requireBackOfficeRole()` middleware. Any unauthenticated user can record product risk deviations against any customer and auto-acknowledge them, potentially bypassing compliance controls (FR-038 escalation thresholds). | Add `requireBackOfficeRole()` middleware to both routes. |
| 8 | CRITICAL | Security | `risk-profiling.ts:66,76,196,206,248,258,282,318,405` & `proposals.ts:47,154,164,174,184,203,213,223` | **User ID fallback `\|\| 1` allows privilege escalation.** All routes extract the user ID with `(req as any).user?.id \|\| 1`. If the auth middleware fails to populate `req.user` (e.g., expired token, misconfigured middleware), the system silently uses userId=1. If userId=1 is an admin/system account, every unauthenticated request operates with admin privileges. In maker-checker flows, this means the same fallback user (1) could act as both maker AND checker, bypassing the dual-control validation. | Replace `\|\| 1` with a strict check: `if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' })`. |
| 9 | HIGH | Quality | `proposal-service.ts:174-183` | **Proposal number generation has a race condition.** The sequence number is derived from `count(*)` of existing proposals with the same date prefix. Under concurrent requests, two transactions can read the same count and generate duplicate proposal numbers. This will either fail with a unique constraint violation (if one exists) or produce duplicates (if it does not). | Use a database sequence or `SELECT ... FOR UPDATE` pattern, or add a unique constraint on `proposal_number` and implement retry logic. |
| 10 | HIGH | Quality | `risk-profiling-service.ts:1190-1228` | **createRiskAssessment performs multi-table writes without a transaction.** This method: (1) deactivates existing profiles, (2) inserts a new profile, (3) inserts customer risk responses, and (4) inserts an audit log -- all outside a transaction. If step 3 fails (e.g., FK violation), the customer ends up with a new active profile but no recorded responses, creating an orphaned and unverifiable assessment. | Wrap the entire method body in `db.transaction(async (tx) => { ... })`. |
| 11 | HIGH | Quality | `risk-profiling-service.ts:668-693` | **updateRiskAppetiteMapping deletes and re-inserts bands without a transaction.** The mapping update + band deletion + band insertion are three separate operations. If the insert fails after the delete, all existing bands are lost permanently. | Wrap the delete-then-insert block in `db.transaction()`. |
| 12 | HIGH | Quality | `risk-profiling-service.ts:882-905` | **updateAssetAllocationConfig deletes and re-inserts lines without a transaction.** Same pattern as #11: the config update + line deletion + line insertion are three separate operations without transactional protection. | Wrap the delete-then-insert block in `db.transaction()`. |
| 13 | HIGH | Quality | `proposal-service.ts:682-693` | **approveL1 status transition and approval record insertion are not atomic.** `_transitionStatus` updates the proposal status, then a separate INSERT adds the approval record. If the INSERT fails, the proposal moves to L1_APPROVED but has no audit trail of who approved it. Same pattern applies to `rejectL1`, `approveCompliance`, `rejectCompliance`, and `returnForRevision`. | Wrap status transition + approval insert in `db.transaction()`. |
| 14 | HIGH | Quality | `proposal-service.ts:795-813` | **clientAccept updates status and inserts approval record without a transaction.** The proposal status is set to CLIENT_ACCEPTED, then a separate INSERT records the client approval. If the INSERT fails, the proposal is marked as accepted with no record of client action. | Wrap both operations in `db.transaction()`. |
| 15 | HIGH | Security | `risk-profiling.ts:389,297,306` & `proposals.ts:104,253,267,277` | **Read-only data endpoints missing auth guard.** Multiple GET endpoints expose sensitive data without authentication: `GET /validate-config` (exposes config validation gaps), `GET /assessments/customer/:customerId` (exposes full assessment history including risk scores), `GET /assessments/customer/:customerId/active` (exposes active risk profile), `GET /:proposalId/validate-allocation`, `GET /reports/pipeline`, `GET /reports/risk-mismatch`, `GET /reports/product-rating`. These expose customer PII, financial data, and internal business rule configurations. | Add `requireBackOfficeRole()` middleware to all sensitive GET endpoints. |
| 16 | HIGH | Quality | `risk-profiling-service.ts:1775-1788` | **listEscalations filters by `customer_id` instead of `entity_id`.** The route passes `entity_id` from the query parameter, but the service method uses it as `customer_id` in the WHERE clause (`eq(schema.complianceEscalations.customer_id, entityId)`). This means the endpoint will never return the expected entity-level escalations -- it looks for a customer whose ID matches the entity ID string (e.g., "default"), which will always return zero results. | Change the filter to use the correct `entity_id` column if one exists on the escalations table, or remove the entity filter and use a proper entity-scoped query. |
| 17 | HIGH | Quality | `proposal-service.ts:330-341` | **addLineItem does not verify proposal is in DRAFT status.** The method validates the proposal exists and checks allocation percentage, but allows adding line items to proposals in any status (SUBMITTED, L1_APPROVED, SENT_TO_CLIENT, etc.). The `updateLineItem` and `deleteLineItem` methods have the same issue. This violates the immutability contract of non-DRAFT proposals. | Add a status check: `if (proposal.proposal_status !== 'DRAFT') throw new Error('Cannot modify line items on non-DRAFT proposals')`. |
| 18 | HIGH | Security | `asset-allocation-config.tsx:104-117` | **Token read from localStorage contradicts httpOnly cookie migration.** The `authHeaders()` function reads the token from `localStorage.getItem("trustoms-user")` and sends it as a Bearer token. Per recent commit `10a01af` ("migrate token storage from localStorage to httpOnly cookies"), this pattern is outdated and contradicts the security fix. The same pattern exists in `risk-assessment-wizard.tsx:51-64`, `investment-proposals.tsx:61-86`, `supervisor-dashboard-rp.tsx:41-66`, and `questionnaire-maintenance.tsx:115-137`. | Remove manual token handling from these pages and rely on the httpOnly cookie mechanism (credentials: 'include') as implemented in the shared apiRequest utility. Use the shared `apiRequest` from `@ui/lib/queryClient` consistently across all pages. |
| 19 | HIGH | Quality | `supervisor-dashboard-rp.tsx:210-270` | **Dashboard silently falls back to hardcoded mock data on API failure.** All five query functions catch errors and return mock/placeholder data instead of showing errors. This means: (1) supervisors see fabricated numbers (e.g., 1248 active profiles, 17 pending approvals) and could make real business decisions based on fake data; (2) API errors are silently swallowed, making debugging impossible; (3) there's no visual indicator that mock data is being shown vs real data. | Remove mock data fallbacks. Let queries fail and show proper error states. If mock data is needed for development, gate it behind an environment variable (e.g., `import.meta.env.DEV`). |
| 20 | HIGH | Quality | `supervisor-dashboard-rp.tsx:318-326` | **"Return to RM" button calls reject-l1 instead of return-for-revision.** The `returnProposal` mutation calls `POST /${proposalId}/reject-l1` (line 320) instead of `POST /${proposalId}/return-for-revision`. This means "returning" a proposal actually rejects it (L1_REJECTED), which is a different workflow state than DRAFT. The proposal cannot be edited again after L1_REJECTED without a separate return-for-revision flow. | Change the mutation URL to `/${proposalId}/return-for-revision` with appropriate body `{ level: 'L1_SUPERVISOR', comments: 'Returned for revision' }`. |
| 21 | HIGH | Quality | `risk-profiling-service.ts:73` | **Search parameter used directly in ilike without escaping SQL wildcards.** User-supplied search input `filters.search` is interpolated directly into the ilike pattern: `ilike(questionnaire_name, '%${filters.search}%')`. If a user enters `%` or `_` characters (SQL wildcards), they can craft patterns that match unintended rows or cause performance issues (e.g., `%_%_%_%_` forces expensive pattern matching). While Drizzle ORM parameterizes the value, the wildcards within the string itself are still interpreted by PostgreSQL. | Escape `%` and `_` characters in the search string before using in ilike: `filters.search.replace(/%/g, '\\%').replace(/_/g, '\\_')`. |
| 22 | HIGH | Quality | `proposal-service.ts:140-204` | **createProposal accepts `risk_profile_id` but the create dialog (investment-proposals.tsx) never sends it.** The service requires `risk_profile_id` and validates it against the customer's active profile. However, the UI create form (lines 601-687) collects `customer_id`, `title`, `investment_objective`, `time_horizon_years`, `proposed_amount`, and `currency` -- but never a `risk_profile_id`. The API call will fail because the service tries to look up a profile with an undefined ID. | Either auto-resolve the active risk profile from the customer_id in the service layer, or add a risk profile selector to the create dialog. |
| 23 | MEDIUM | UI | `risk-appetite-mapping.tsx:446` | **Dialog missing DialogDescription for accessibility.** The create/edit dialog has a `DialogTitle` but no `DialogDescription`. Screen readers require both for proper ARIA compliance. Same issue in `asset-allocation-config.tsx:537`. | Add `<DialogDescription>` after `<DialogTitle>` in each dialog. |
| 24 | MEDIUM | UI | `questionnaire-maintenance.tsx`, `risk-assessment-wizard.tsx`, `investment-proposals.tsx` | **Labels not using htmlFor attribute.** Many `<label>` elements use `className="text-sm font-medium"` but don't have `htmlFor` attributes linking them to their corresponding input elements. This breaks keyboard navigation and screen reader association. | Add `htmlFor` attributes to labels and matching `id` attributes to inputs. |
| 25 | MEDIUM | Quality | `proposal-service.ts:20-22` | **Hardcoded financial constants should be configurable.** `RISK_FREE_RATE = 6.5`, `CONCENTRATION_LIMIT_PCT = 40`, and `CLIENT_OFFER_EXPIRY_DAYS = 30` are hardcoded. These are business-critical values that change with market conditions and regulatory requirements. | Move to a configuration table or environment variables that can be changed without a code deployment. |
| 26 | MEDIUM | Quality | `proposal-service.ts:604-611` | **What-if std dev calculation uses a simplistic heuristic.** The standard deviation is estimated as `ret * 0.6` (60% of expected return), which is a rough approximation that could produce misleading analytics for investment decisions. | Document the limitation clearly and plan to use actual product-level volatility data. |
| 27 | MEDIUM | Code | `risk-appetite-mapping.tsx:157` | **API function inconsistency.** This page uses the shared `apiRequest` from `@ui/lib/queryClient`, while `asset-allocation-config.tsx` (line 119-129) defines its own local `apiFetch` function. `risk-assessment-wizard.tsx` and `investment-proposals.tsx` also define local `apiFetch` functions. This creates maintenance burden and inconsistent error handling. | Standardize all pages to use the shared `apiRequest` utility. |
| 28 | MEDIUM | Quality | `proposal-service.ts:931-960` | **Pipeline report passes date parameters directly to SQL.** While Drizzle parameterizes values, `dateFrom` and `dateTo` from user input are not validated as valid date strings before being cast with `::timestamptz`. Invalid date strings would cause a PostgreSQL error rather than a user-friendly validation error. Same issue in `getTransactionByProductRatingReport`. | Validate date format (ISO 8601) before passing to the query. Return 400 with a clear error message for invalid dates. |
| 29 | MEDIUM | Quality | `risk-profiling-service.ts:490-514` | **setNormalizationRanges deletes all existing ranges before insert without a transaction.** If the insert fails, all normalization ranges for the question are permanently deleted. | Wrap the delete + insert in `db.transaction()`. |
| 30 | MEDIUM | Quality | `proposal-service.ts:430-445` | **deleteLineItem performs a hard DELETE instead of soft delete.** All other delete operations in the module use soft-delete (`is_deleted = true`), but `deleteLineItem` uses `db.delete()` which permanently removes the record. This prevents audit trail recovery and is inconsistent with the codebase pattern. | Change to soft delete using `db.update().set({ is_deleted: true })` if the schema supports it, or document the intentional hard delete. |
| 31 | MEDIUM | Security | `proposals.ts:253-289` | **Report endpoints missing auth guard.** Three reporting endpoints (`/reports/pipeline`, `/reports/risk-mismatch`, `/reports/product-rating`) are accessible without authentication. These reports aggregate sensitive financial data including proposal amounts, customer IDs, and risk deviation details. | Add `requireBackOfficeRole()` middleware. |
| 32 | MEDIUM | Quality | `risk-profiling-service.ts:970-973` | **computeRiskScore accepts `questionId` in request body but the route passes it as `question_id`.** The route (line 272) destructures `req.body.questionnaire_id` and `req.body.responses`, but the compute function expects `responses[].questionId` (camelCase). Meanwhile the UI `handleCompute` (risk-assessment-wizard.tsx:242) sends `question_id` (snake_case) in the response array. This field name mismatch means the backend will not find responses by question ID. | Standardize to one naming convention. The route handler should transform `question_id` to `questionId` or the service should accept both. |

---

## Summary by Severity

| Severity | Count | Breakdown |
|----------|-------|-----------|
| CRITICAL | 8 | 7 missing auth guards on mutation endpoints, 1 user ID fallback to admin |
| HIGH | 14 | 6 missing transactions, 3 data integrity, 2 security, 1 mock data, 1 wrong API call, 1 field mismatch |
| MEDIUM | 10 | 3 quality, 3 accessibility/UI, 2 code consistency, 1 security, 1 input validation |

## Summary by Domain

| Domain | CRITICAL | HIGH | MEDIUM | Total |
|--------|----------|------|--------|-------|
| Security | 8 | 3 | 1 | 12 |
| Quality | 0 | 9 | 7 | 16 |
| UI | 0 | 0 | 2 | 2 |
| Code | 0 | 2 | 0 | 2 |

## Key Observations

### Positive Findings (not counted as issues)

1. **Drizzle ORM prevents SQL injection.** All database queries use Drizzle ORM's typed query builder. No raw SQL string concatenation was found. Parameters are properly bound.
2. **No XSS vulnerabilities.** No `dangerouslySetInnerHTML` usage found. React's JSX auto-escapes rendered content.
3. **No secrets in code.** No API keys, passwords, or credentials found in any reviewed file.
4. **No console.log statements.** All 10 files are free of debug logging statements.
5. **Maker-checker validation is solid.** The maker-checker workflow correctly prevents the same user from acting as both maker and checker (e.g., `authorizeQuestionnaire` checks `maker_id !== checkerId`).
6. **Optimistic locking implemented.** All update methods require a `version` field and verify it matches before applying changes, preventing lost-update race conditions.
7. **Good UI patterns.** Loading states (skeleton rows), empty states, and error handling via toast notifications are consistently implemented across all UI pages.
8. **Soft deletes used consistently.** All primary entities use `is_deleted` flags rather than hard deletes (except `deleteLineItem` -- see finding #30).

### Architecture Risks

1. **Auth guard coverage is inconsistent.** Of the 39 route handlers across both files, 12 mutation endpoints and 7 read endpoints lack authentication middleware. The codebase appears to have gone through a partial security remediation (commit `ef815a6`) but these routes were missed.
2. **Transaction usage is absent.** Neither service uses `db.transaction()` anywhere, despite having multiple multi-table operations that require atomicity. The GL module uses transactions extensively (8+ usages in `gl-posting-engine.ts`), showing the pattern is available in the codebase.
3. **localStorage token pattern conflicts with httpOnly cookie migration.** Five of six UI pages read tokens from localStorage, contradicting the security improvement in commit `10a01af`. Only `risk-appetite-mapping.tsx` correctly uses the shared `apiRequest` utility.

---

## Verdict

**CONDITIONAL**

The module has a solid functional design with proper maker-checker workflows, optimistic locking, and comprehensive risk scoring engine. However, it has **8 CRITICAL security findings** (unprotected mutation endpoints and user ID fallback) and **14 HIGH findings** (missing transactions, data integrity gaps) that must be resolved before the module can be considered production-ready.

### Required for Production

1. Add `requireBackOfficeRole()` to all 12 unprotected mutation endpoints (findings #1-#7)
2. Remove `|| 1` user ID fallback and enforce strict authentication (finding #8)
3. Wrap all multi-table operations in `db.transaction()` (findings #10-#14)
4. Fix the wrong API call in supervisor dashboard return action (finding #20)
5. Remove hardcoded mock data fallbacks from supervisor dashboard (finding #19)
6. Migrate all UI pages to use shared `apiRequest` with httpOnly cookies (finding #18)
7. Fix the listEscalations entity_id/customer_id bug (finding #16)
8. Add proposal status check to line item mutations (finding #17)
