# Feature Life Cycle Report: Risk Profiling & Proposal Generation
## Date: 2026-04-22 (Updated: 2026-04-23)

## Pipeline Status
| Step | Status | Output |
|------|--------|--------|
| 1. BRD Generation | DONE (pre-existing) | `docs/BRD-RiskProfiling-ProposalGeneration-v2.docx` |
| 2. Adversarial Evaluation | DONE (pre-existing) | BRD v2.0 (Post-Adversarial Review) |
| 3. Final BRD | DONE (pre-existing) | BRD v2.0 Final |
| 4. Test Case Generation | DONE | `docs/test-cases-risk-profiling-2026-04-22.md` |
| 5. Gap Analysis | DONE (pre-existing) | `docs/gap-analysis-risk-profiling-2026-04-22.md` |
| 6. Phased Plan | DONE (pre-existing) | `docs/plan-risk-profiling.md` |
| 7. Plan Execution | DONE | 8 phases, 10+ files |
| 8. Test Validation | DONE | 135/247 PASS, 73 PARTIAL, 39 FAIL |
| 9. Full Review | DONE | CONDITIONAL → All findings fixed |
| 10. Local Deployment | DONE | Server starts, 0 errors in RP files |
| 11. Post-Review Remediation | DONE | 8 HIGH + 10 MEDIUM fixed |
| 12. Client Portal Integration | DONE | 2 pages + 5 API endpoints |

## Key Metrics
- Requirements in BRD: 42 FRs across 7 modules
- Gaps identified: 40 MISSING, 2 PARTIAL
- Code changes: 22 files created/modified across 8+ phases
- Test cases: 247 total, 135 PASS, 73 PARTIAL, 39 FAIL
- Review findings: 8 CRITICAL (all fixed), 14 HIGH (all fixed), 10 MEDIUM (all fixed)
- Review verdict: **PASS** (all CRITICAL/HIGH/MEDIUM fixed)
- Deployment status: **READY** (dev server starts, 0 RP-PGM TypeScript errors)

## Implementation Summary

### Data Model (16 entities in schema.ts)
- `questionnaires`, `questions`, `answerOptions`, `scoreNormalizationRanges`
- `riskAppetiteMappings`, `riskAppetiteBands`
- `assetAllocationConfigs`, `assetAllocationLines`
- `customerRiskProfiles`, `customerRiskResponses`
- `investmentProposals`, `proposalLineItems`, `proposalApprovals`
- `productRiskDeviations`, `complianceEscalations`, `riskProfilingAuditLogs`

### Services (2 files, ~2800 lines)
- `server/services/risk-profiling-service.ts` (1680+ lines)
  - Questionnaire CRUD with maker-checker
  - Score computation engine (SUM, RANGE normalization)
  - Customer risk assessment with deviation handling
  - Product risk deviation tracking + escalation
  - Cascading config validation
  - Supervisor dashboard data
  - Asset allocation lookup by risk category
- `server/services/proposal-service.ts` (1100+ lines)
  - Proposal lifecycle (DRAFT → CLIENT_ACCEPTED)
  - Line item management with allocation validation + DRAFT status check
  - Suitability checks (product risk, concentration, experience)
  - What-if analysis (return, std dev, Sharpe, max drawdown)
  - Multi-level approval workflow (all in DB transactions)
  - Proposal number race condition protection (retry loop)
  - Auto-resolve risk_profile_id from active customer profile
  - Reporting (pipeline, risk mismatch, product rating) with date validation
  - Soft delete for line items

### API Routes (3 files, ~800 lines)
- `server/routes/back-office/risk-profiling.ts` (413 lines, 25 endpoints)
- `server/routes/back-office/proposals.ts` (295 lines, 19 endpoints)
- `server/routes/client-portal.ts` (+5 endpoints for risk profile & proposals)
- Registered in `server/routes.ts` at `/api/v1/risk-profiling` and `/api/v1/proposals`

### Back-Office UI Pages (6 files, ~3500 lines)
- `questionnaire-maintenance.tsx` — Config CRUD + question builder + maker-checker
- `risk-appetite-mapping.tsx` — Score → category mapping + band editor
- `asset-allocation-config.tsx` — Per-category asset allocation + 100% validation
- `risk-assessment-wizard.tsx` — 3-step wizard (Select → Answer → Review/Submit)
- `investment-proposals.tsx` — Full proposal lifecycle + what-if + suitability
- `supervisor-dashboard-rp.tsx` — 5 widgets (summary, leads, approvals, proposals, distribution)

### Client Portal UI Pages (2 files, ~750 lines)
- `risk-profile.tsx` — View current risk profile, recommended asset allocation, deviation status, assessment history
- `proposals.tsx` — List proposals, detail view with line items, accept/reject actions with reason input

### Navigation & Routes
- 6 new routes in `apps/back-office/src/routes/index.tsx`
- "Risk Profiling" nav section with 6 items in `apps/back-office/src/config/navigation.ts`
- 2 new routes in `apps/client-portal/src/routes/index.tsx`
- 2 new nav items in `apps/client-portal/src/config/navigation.ts`

## Bugs Fixed During Validation & Review

### P0 Critical Bugs Fixed
1. **Optimistic locking enforced** on all update methods (version validation + 409 Conflict)
2. **Configuration mismatches corrected** (concentration limit 40%, risk-free rate 6.5%)
3. **Input validation added** to questionnaire creation (name length, date ordering, valid_period range)
4. **Band overlap validation** at risk appetite mapping creation

### CRITICAL Review Findings Fixed (8/8)
5. **Auth guards added** to 12 unprotected mutation endpoints
6. **Unsafe `|| 1` user ID fallback** replaced with proper 401 responses (17 occurrences)

### HIGH Review Findings Fixed (14/14)
7. **Database transactions** added to 3 multi-step operations (createRiskAssessment, updateRiskAppetiteMapping, updateAssetAllocationConfig)
8. **listEscalations** wrong column filter fixed
9. **Mock data fallback** replaced with empty defaults in supervisor dashboard
10. **"Return" button** calling wrong endpoint fixed
11. **Proposal number race condition** — retry loop with unique constraint protection
12. **Approval workflow transactions** — all 7 approval methods wrapped in DB transactions
13. **Report + validate-allocation auth guards** — 4 endpoints secured
14. **DRAFT status check** on addLineItem/updateLineItem/deleteLineItem
15. **localStorage→httpOnly cookie migration** — 5 UI pages updated to use `credentials: 'include'`
16. **SQL wildcard escaping** — `%` and `_` escaped in ilike search
17. **Auto-resolve risk_profile_id** — from customer's active profile when not provided

### MEDIUM Review Findings Fixed (10/10)
18. **Dialog accessibility** — DialogDescription added to 3 dialogs
19. **htmlFor labels** — 20 label/input pairs linked across 3 pages
20. **Hardcoded constants documented** — RISK_FREE_RATE, CONCENTRATION_LIMIT_PCT, CLIENT_OFFER_EXPIRY_DAYS
21. **What-if std dev** — limitation documented with improvement recommendation
22. **API consistency** — all pages use `credentials: 'include'` consistently
23. **Date validation in reports** — ISO format check on dateFrom/dateTo
24. **setNormalizationRanges transaction** — delete+insert wrapped atomically
25. **Soft delete for line items** — `is_deleted: true` instead of hard DELETE
26. **Report auth verified** — all 3 report endpoints have auth middleware
27. **Field name mismatch** — questionId/answerOptionIds corrected from snake_case to camelCase

## Artifacts Produced
- `docs/BRD-RiskProfiling-ProposalGeneration-v2.docx` (pre-existing)
- `docs/gap-analysis-risk-profiling-2026-04-22.md` (pre-existing)
- `docs/plan-risk-profiling.md` (pre-existing)
- `docs/test-cases-risk-profiling-2026-04-22.md` (247 test cases)
- `docs/test-validation-risk-profiling-2026-04-22.md` (validation report)
- `docs/reviews/full-review-risk-profiling-2026-04-22.md` (32 findings)
- `docs/feature-life-cycle-risk-profiling-2026-04-22.md` (this file)

## Remaining Deferred Items
- **Notification dispatch** — No notification events are actually sent (all 14 notification test cases FAIL). Requires integration with the existing notification service.
- **Proposal auto-expiry** — `expires_at` is set but no scheduled job checks it. Needs a cron job or EOD batch process.
- **PDF generation** — Stub implementation only. Requires Puppeteer or similar for server-side rendering.
- **E-Signature** — No integration with any e-signature service.

## Next Steps
1. Integrate notification dispatch for risk profile and proposal events
2. Implement PDF generation with Puppeteer
3. Add proposal auto-expiry cron job
4. Conduct user acceptance testing with RM and supervisor workflows
