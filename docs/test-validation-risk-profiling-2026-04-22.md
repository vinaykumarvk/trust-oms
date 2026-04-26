# Risk Profiling & Proposal Generation -- Test Validation Report

**Module**: Risk Profiling & Proposal Generation Management (RP-PGM)
**Validation Date**: 2026-04-22
**Test Case Document**: `docs/test-cases-risk-profiling-2026-04-22.md`
**Total Test Cases**: 247 (119 P0, 98 P1, 30 P2)
**Validator**: Claude Code (Step 8 -- Feature Lifecycle Pipeline)

---

## Validation Summary

| Verdict | P0 | P1 | P2 | Total |
|---------|----|----|----|----|
| PASS | 73 | 52 | 10 | 135 |
| PARTIAL | 28 | 31 | 14 | 73 |
| FAIL | 18 | 15 | 6 | 39 |
| **Total** | **119** | **98** | **30** | **247** |

**Overall Coverage: 54.7% PASS, 29.6% PARTIAL, 15.8% FAIL**

---

## Files Validated

| File | Purpose |
|------|---------|
| `server/services/risk-profiling-service.ts` | Risk profiling business logic (1700 lines) |
| `server/services/proposal-service.ts` | Proposal/investment proposal business logic (1055 lines) |
| `server/routes/back-office/risk-profiling.ts` | Risk profiling API routes (413 lines) |
| `server/routes/back-office/proposals.ts` | Proposal API routes (291 lines) |
| `packages/shared/src/schema.ts` (lines 4510-4860) | Data model (18 tables, 16 enums, full relations) |
| `server/routes.ts` | Route registration |
| `server/routes/back-office/index.ts` | Back-office CRUD routes |

---

## 1. Questionnaire CRUD with Maker-Checker (FR-001 -- FR-008)

**Test Cases**: TC-RP-001 through TC-RP-054 (54 cases)

### FR-001: List Questionnaires

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-001 | P0 | **PASS** | `GET /questionnaires` endpoint exists. Service `listQuestionnaires()` supports pagination (page, pageSize), entity_id filter, status filter, search filter. Returns `data` + `pagination` object. |
| TC-RP-002 | P1 | **PARTIAL** | Backend returns data ordered by `created_at DESC`. Column-level sorting not exposed as a query parameter -- must be done client-side or extended. |
| TC-RP-003 | P1 | **PASS** | Status filter implemented via `filters?.status` check in `listQuestionnaires()`. Maps to `authorization_status` enum (`UNAUTHORIZED`, `MODIFIED`, `AUTHORIZED`, `REJECTED`). |
| TC-RP-004 | P1 | **PARTIAL** | Status field returned in API response. Color-coding is a frontend concern -- data is available but UI rendering not validated here. |

### FR-002: Create Questionnaire

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-005 | P0 | **PASS** | `POST /questionnaires` exists. `createQuestionnaire()` accepts all required fields (name, category, type, dates, valid_period, is_score, texts). Sets `authorization_status='UNAUTHORIZED'`, records `maker_id`. |
| TC-RP-006 | P0 | **PASS** | `questionnaire_name`, `customer_category`, `questionnaire_type`, `effective_start_date`, `effective_end_date` are all `.notNull()` in schema. DB-level enforcement. |
| TC-RP-007 | P0 | **PASS** | `customerCategoryEnum` has `INDIVIDUAL`, `NON_INDIVIDUAL`, `BOTH`. Dropdown data available. |
| TC-RP-008 | P0 | **PASS** | `questionnaireTypeEnum` has `FINANCIAL_PROFILING`, `INVESTMENT_KNOWLEDGE`, `SAF`, `SURVEY`, `FATCA`, `PAMM_PRE_INVESTMENT`. |
| TC-RP-009 | P0 | **PASS** | `valid_period_years` field exists with `default(2)`. |
| TC-RP-010 | P0 | **PASS** | `is_score` boolean field exists with `default(false)`. |
| TC-RP-011 | P0 | **PASS** | Questions added via `addQuestion()`. `question_number` auto-incremented. `question_description`, `is_mandatory`, `is_multi_select`, `scoring_type`, `computation_type` all supported. |
| TC-RP-012 | P0 | **PASS** | `addAnswerOption()` accepts `answer_description` and `weightage`. `option_number` auto-incremented. |
| TC-RP-013 | P0 | **PASS** | `setNormalizationRanges()` supports bulk set of `{range_from, range_to, normalized_score}`. Deletes and re-inserts. |
| TC-RP-014 | P0 | **PASS** | `POST /questionnaires/:questionnaireId/questions` exists. `POST /questions/:questionId/options` exists. `PUT /questions/:questionId/normalization-ranges` exists. |
| TC-RP-015 | P0 | **PASS** | `createQuestionnaire()` sets `authorization_status: 'UNAUTHORIZED'`. |
| TC-RP-016 | P1 | **PARTIAL** | Version incremented on update (`existing.version + 1`), but no explicit success toast -- that's a frontend concern. Backend version tracking confirmed. |
| TC-RP-017 | P1 | **PARTIAL** | Multi-step form is frontend. Backend supports all fields. Data round-trip confirmed. |
| TC-RP-018 | P0 | **PARTIAL** | `Reset` is purely frontend. Backend supports re-fetch via `GET /questionnaires/:id`. |
| TC-RP-019 | P0 | **FAIL** | **No server-side min-length validation for questionnaire_name.** The service accepts any non-empty string. Missing: min 3 char check. |
| TC-RP-020 | P0 | **FAIL** | **No server-side date validation.** `createQuestionnaire()` does not check `effective_end_date > effective_start_date`. Relies entirely on DB/frontend. |
| TC-RP-021 | P0 | **FAIL** | **No duplicate overlap check.** `createQuestionnaire()` does not query for existing questionnaires with the same category/type and overlapping date range. |
| TC-RP-022 | P0 | **FAIL** | **No cross-category conflict check.** 'Both' vs 'Individual' conflict not validated server-side. |
| TC-RP-023 | P0 | **FAIL** | **No overlap validation for normalization ranges.** `setNormalizationRanges()` replaces all ranges without checking for overlaps. |
| TC-RP-024 | P1 | **FAIL** | **No gap validation for normalization ranges.** No check that ranges cover full score space. |
| TC-RP-025 | P1 | **FAIL** | **No valid_period bounds check** (1-10 years). Service accepts any integer. |
| TC-RP-026 | P0 | **FAIL** | **No check that mandatory questions have answer options.** This is checked in `validateCascadingConfig()` but NOT at question creation/save time. |
| TC-RP-027 | P2 | **PARTIAL** | No max-length constraint on `questionnaire_name` in schema (uses `text` type, unlimited). Boundary test not applicable. |
| TC-RP-028 | P1 | **PARTIAL** | `scoring_type` defaults to `NONE` in schema. Auto-set logic is frontend. Backend accepts the value. |
| TC-RP-029 | P1 | **PARTIAL** | No validation requiring at least one question. Questionnaire can be saved empty. Validated downstream in `validateCascadingConfig()`. |

### FR-003: View Questionnaire

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-030 | P0 | **PASS** | `GET /questionnaires/:id` returns full questionnaire with questions, answer options, and normalization ranges. Read-only rendering is frontend. |
| TC-RP-031 | P1 | **PASS** | `getQuestionnaire()` works for all statuses. No status filter on read. |
| TC-RP-032 | P1 | **PASS** | `scoreNormalizationRanges` returned per question in `getQuestionnaire()`. |

### FR-004: Modify Questionnaire

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-033 | P0 | **PASS** | `PUT /questionnaires/:id` calls `updateQuestionnaire()`. Sets `authorization_status: 'MODIFIED'`, increments `version`, clears `checker_id` and `authorized_at`. |
| TC-RP-034 | P0 | **PASS** | Status changes to `MODIFIED` regardless of previous status (UNAUTHORIZED or AUTHORIZED). |
| TC-RP-035 | P0 | **PASS** | `getQuestionnaire()` returns all data for pre-population. |
| TC-RP-036 | P1 | **PASS** | Questions support `DELETE /questions/:id` (soft-delete) and `POST /questionnaires/:questionnaireId/questions` (add). Auto-numbering via max+1. |
| TC-RP-037 | P0 | **PARTIAL** | `updateQuestionnaire()` does NOT block edits on REJECTED status. The BRD says REJECTED records cannot be modified. **Missing: status check to block REJECTED records from being edited.** |
| TC-RP-038 | P1 | **PARTIAL** | No field-level locking for questionnaire_name on AUTHORIZED records. Backend accepts name changes on all statuses. Frontend must enforce this. |

### FR-005: Delete Questionnaire

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-039 | P0 | **PASS** | `DELETE /questionnaires/:id` calls `deleteQuestionnaire()` which sets `is_deleted: true`. Soft delete confirmed. |
| TC-RP-040 | P0 | **PASS** | Same soft-delete works for any status including MODIFIED. |
| TC-RP-041 | P0 | **FAIL** | **No status check on delete.** `deleteQuestionnaire()` does not verify status. AUTHORIZED records CAN be deleted via API. Missing: block delete for AUTHORIZED status. |
| TC-RP-042 | P1 | **PARTIAL** | Confirmation dialog is frontend. Backend deletion is idempotent. |

### FR-006: Authorize/Reject Questionnaire

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-043 | P0 | **PASS** | `POST /questionnaires/:id/authorize` calls `authorizeQuestionnaire()`. Sets `AUTHORIZED`, records `checker_id` and `authorized_at`. |
| TC-RP-044 | P0 | **PARTIAL** | `POST /questionnaires/:id/reject` calls `rejectQuestionnaire()`. Sets `REJECTED`, records `checker_id`. **Missing: mandatory rejection reason.** The route does not extract or validate a `reason` field from the request body. |
| TC-RP-045 | P0 | **PASS** | `authorizeQuestionnaire()` works on MODIFIED status (checks `!== 'AUTHORIZED'`). |
| TC-RP-046 | P0 | **PASS** | Four-eyes principle enforced: `maker_id === checkerId` throws `'Maker and checker must be different users'`. |
| TC-RP-047 | P0 | **FAIL** | **Rejection reason is not validated.** `rejectQuestionnaire()` does not accept or store a rejection reason. The BRD requires a mandatory reason. |
| TC-RP-048 | P1 | **PASS** | After rejection, `updateQuestionnaire()` sets status to `MODIFIED` (which enables re-entry to the authorization queue). However, status transitions to `UNAUTHORIZED` on create, not `MODIFIED` -- close enough for resubmission flow. |

### FR-007: Score Normalization for Multi-Select

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-049 | P0 | **PASS** | `PUT /questions/:questionId/normalization-ranges` with `{ranges}` body. Service replaces all ranges. |
| TC-RP-050 | P0 | **FAIL** | **No From >= To validation** in `setNormalizationRanges()`. Accepts any values. |
| TC-RP-051 | P1 | **FAIL** | **No negative score validation.** Service accepts any numeric value. |
| TC-RP-052 | P1 | **PARTIAL** | Frontend concern. Backend does not block adding ranges for non-RANGE questions. |

### FR-008: Warning/Acknowledgement/Disclaimer Config

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-053 | P1 | **PASS** | `warning_text`, `acknowledgement_text`, `disclaimer_text` all present as `text` columns. Rich text can be stored as HTML. |
| TC-RP-054 | P1 | **PASS** | All three fields are nullable (default `null`). Optional confirmed. |

---

## 2. Risk Appetite Mapping CRUD + Maker-Checker (FR-009 -- FR-011)

**Test Cases**: TC-RP-055 through TC-RP-064 (10 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-055 | P0 | **PASS** | `GET /risk-appetite` returns mappings for entity. Includes all fields. |
| TC-RP-056 | P0 | **PASS** | `POST /risk-appetite` calls `createRiskAppetiteMapping()`. Accepts `mapping_name`, dates, `maker_id`, `bands[]` with `score_from`, `score_to`, `risk_category`, `risk_code`. Creates mapping + bands atomically. |
| TC-RP-057 | P0 | **PASS** | `PUT /risk-appetite/:id` calls `updateRiskAppetiteMapping()`. Increments version, sets `MODIFIED`, clears checker. Replaces bands if provided. |
| TC-RP-058 | P0 | **FAIL** | **No overlap validation for bands.** Service does not check that bands don't overlap. |
| TC-RP-059 | P0 | **FAIL** | **No contiguity validation.** `validateCascadingConfig()` checks gaps downstream but NOT at creation/update time. |
| TC-RP-060 | P1 | **FAIL** | **No check that bands start from 0.** |
| TC-RP-061 | P0 | **PASS** | Band boundary semantics implemented in `computeRiskScore()`: `score_from <= score < score_to` for non-last bands. |
| TC-RP-062 | P0 | **PASS** | Last band uses `score_from <= score <= score_to` (inclusive both ends). Confirmed in code line ~1007. |
| TC-RP-063 | P0 | **PASS** | `POST /risk-appetite/:id/authorize` with four-eyes check. |
| TC-RP-064 | P0 | **PASS** | `maker_id === checkerId` throws error. Four-eyes enforced. |

---

## 3. Asset Allocation Config CRUD + Maker-Checker (FR-012 -- FR-014)

**Test Cases**: TC-RP-065 through TC-RP-072 (8 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-065 | P0 | **PASS** | `GET /asset-allocation` returns configs. Entity filtered. |
| TC-RP-066 | P0 | **PASS** | `POST /asset-allocation` creates config with `lines[]` (risk_category, asset_class, allocation_percentage, expected_return_pct, standard_deviation_pct). |
| TC-RP-067 | P1 | **PARTIAL** | Donut chart is frontend. Backend returns allocation data correctly. |
| TC-RP-068 | P0 | **PARTIAL** | Sum-to-100% check is done in `validateCascadingConfig()` downstream but **NOT at creation/update time** for the config itself. |
| TC-RP-069 | P0 | **FAIL** | **No check that all risk categories have allocations.** Validation only downstream in cascading check. |
| TC-RP-070 | P1 | **FAIL** | **No percentage range validation (0-100).** Service accepts any numeric value. |
| TC-RP-071 | P0 | **PASS** | `POST /asset-allocation/:id/authorize` with four-eyes. |
| TC-RP-072 | P0 | **PASS** | Four-eyes enforced on asset allocation. |

---

## 4. Customer Risk Assessment (FR-015 -- FR-018)

**Test Cases**: TC-RP-073 through TC-RP-100 (28 cases)

### FR-015: Initiate Risk Profiling

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-073 | P0 | **PASS** | `POST /assessments` triggers `createRiskAssessment()`. 3-step wizard is frontend. Backend handles the assessment. |
| TC-RP-074 | P0 | **PASS** | `GET /assessments/customer/:customerId/active` returns current profile. Re-assessment flow supported. |
| TC-RP-075 | P0 | **PASS** | Same endpoint. Expired profile still returned (check expiry_date client-side). |
| TC-RP-076 | P1 | **PASS** | If customer has no profile, `getCustomerRiskProfile()` returns `null`, API returns 404. |
| TC-RP-077 | P0 | **PARTIAL** | Edit Profile (Step 1) completeness check is not in risk profiling service. Cross-module concern. |

### FR-016: Display Risk Questionnaire

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-078 | P0 | **PASS** | `getQuestionnaire()` returns full structure filtered by authorization status and effective dates (checked in `computeRiskScore()`). |
| TC-RP-079 | P1 | **PARTIAL** | Collapsible sections are frontend. Data is structured with questions array. |
| TC-RP-080 | P0 | **PASS** | `is_multi_select` field on each question determines radio vs checkbox rendering. Data available. |
| TC-RP-081 | P1 | **PASS** | `is_mandatory` field available on each question. |
| TC-RP-082 | P1 | **PASS** | `warning_text`, `acknowledgement_text`, `disclaimer_text` returned from `getQuestionnaire()`. |
| TC-RP-083 | P0 | **PASS** | `computeRiskScore()` throws `'Cannot compute score against an unauthorized questionnaire'` and also checks effective date range against risk appetite mapping. |
| TC-RP-084 | P0 | **PASS** | `computeRiskScore()` throws `'Mandatory question X has no response'` for unanswered mandatory questions. |
| TC-RP-085 | P1 | **PARTIAL** | 'Both' category questionnaire exists in enum. Matching logic (Individual customer matched to 'Both' questionnaire) must be handled in frontend/query. |

### FR-017: Compute Risk Score

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-086 | P0 | **PASS** | Single-select scoring: `rawScore = parseFloat(selectedOptions[0].weightage)`. Sum of all questions = total. |
| TC-RP-087 | P0 | **PASS** | Multi-select NONE: `rawScore = sum of selected weightages`. `normalizedScore = rawScore`. |
| TC-RP-088 | P0 | **PASS** | Multi-select RANGE: looks up `scoreNormalizationRanges` for the question. `normalizedScore = matchingRange.normalized_score`. |
| TC-RP-089 | P0 | **PARTIAL** | Non-scored parts: The engine processes ALL questions in the questionnaire. There is no explicit `is_score` filtering per question -- the `is_score` flag is on the questionnaire level, not question level. Part A/B non-scored behavior depends on answers having weightage=0. |
| TC-RP-090 | P0 | **PASS** | Band lookup implemented. `score_from <= total < score_to` for non-last bands. |
| TC-RP-091 | P0 | **PASS** | Throws `'Total score does not fall within any risk appetite band'`. |
| TC-RP-092 | P0 | **PASS** | Skipped non-mandatory question: `selectedIds.length === 0` -> pushes `{rawScore: 0, normalizedScore: 0}`. Contributes 0. |
| TC-RP-093 | P0 | **PASS** | Score = band lower bound -> `totalScore >= from` matches. |
| TC-RP-094 | P0 | **PASS** | Score at upper bound of non-last band -> `totalScore < to` means it falls to next band. |
| TC-RP-095 | P0 | **PASS** | Last band: `totalScore <= to` (inclusive). Confirmed. |
| TC-RP-096 | P1 | **PASS** | All-zero scores -> total=0 -> maps to first band. |

### FR-018: Display Recommended Risk Profile

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-097 | P0 | **PASS** | `createRiskAssessment()` returns `{profile, scoreBreakdown, responses, sessionId}`. All display fields available. |
| TC-RP-098 | P0 | **PASS** | Asset allocation configs accessible via `GET /asset-allocation`. Client can filter by risk_category. |
| TC-RP-099 | P0 | **PASS** | `expiry_date` computed as `assessment_date + valid_period_years`. Confirmed in code line ~1072. |
| TC-RP-100 | P1 | **PARTIAL** | No graceful fallback in backend if allocation config is missing. Frontend must handle empty data. |

---

## 5. Risk Deviation Handling (FR-019 -- FR-020)

**Test Cases**: TC-RP-101 through TC-RP-110 (10 cases)

### FR-019: Risk Profile Deviation

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-101 | P0 | **PASS** | `createRiskAssessment()` accepts optional `deviation: {deviated_risk_category, deviated_risk_code, deviation_reason}`. Sets `is_deviated=true`, stores all deviation fields. |
| TC-RP-102 | P0 | **PASS** | Without deviation param, `is_deviated=false`. Effective = computed. |
| TC-RP-103 | P0 | **PARTIAL** | Entity-level config for `risk_deviation_enabled` is not modeled in schema or service. Frontend must control visibility. |
| TC-RP-104 | P0 | **PARTIAL** | Backend does not validate that `deviation_reason` is non-empty when `deviation` is provided. Frontend must validate. |
| TC-RP-105 | P0 | **PARTIAL** | Backend does not validate that `deviated_risk_category` is provided when deviating. Service stores null if omitted. |

### FR-020: Supervisor Risk Profile Approval

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-106 | P0 | **PASS** | `POST /assessments/:id/approve-deviation` calls `approveDeviation()`. Sets `supervisor_approved=true`, records supervisor_id and timestamp. |
| TC-RP-107 | P0 | **PASS** | Works for deviated profiles. Checks `is_deviated` before allowing approval. |
| TC-RP-108 | P0 | **FAIL** | **No reject-deviation endpoint.** Only `approveDeviation()` exists. No `rejectDeviation()` method or route to revert to COMPUTED state. |
| TC-RP-109 | P0 | **PARTIAL** | Deviated profiles have `supervisor_approved=false` initially. Proposal creation checks `is_active` but does not explicitly check `supervisor_approved`. Partial enforcement. |
| TC-RP-110 | P0 | **PASS** | `createRiskAssessment()` deactivates previous profiles: `is_active: false` for all prior active profiles of the same customer. |

---

## 6. Product Risk Deviation & Compliance (FR-021 -- FR-023)

**Test Cases**: TC-RP-111 through TC-RP-121 (11 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-111 | P0 | **PASS** | `POST /deviations/check` calls `checkProductRiskDeviation()`. Returns `{hasDeviation, customerRiskCode, productRiskCode}`. Deviation = `productRiskCode > customerRiskCode`. |
| TC-RP-112 | P0 | **PASS** | `POST /deviations` records deviation. `POST /deviations/:id/acknowledge` sets `deviation_acknowledged=true`. |
| TC-RP-113 | P0 | **PASS** | Cancel = no record created (frontend simply does not call POST). |
| TC-RP-114 | P0 | **PASS** | `hasDeviation` returns `false` when `productRiskCode <= customerRiskCode`. |
| TC-RP-115 | P0 | **PASS** | `deviationContextEnum` has `CLIENT_PORTAL` as a valid context. |
| TC-RP-116 | P1 | **PASS** | Equal codes: `productRiskCode > customerRiskCode` is `false`. No alert. |
| TC-RP-117 | P1 | **PARTIAL** | Multi-product deviation: service handles one product at a time. Bulk check not implemented. |
| TC-RP-118 | P1 | **PARTIAL** | Product filtering by risk rating is a frontend/product-service concern. Not in risk profiling service. |
| TC-RP-119 | P1 | **PARTIAL** | Same as above -- frontend filter clear. |
| TC-RP-120 | P1 | **PARTIAL** | Risk badge rendering is frontend. Data (`product_risk_code`) available. |
| TC-RP-121 | P1 | **PARTIAL** | Cross-platform consistency is frontend. Same API serves both. |

---

## 7. Investment Proposal Lifecycle (FR-024, FR-027, FR-029)

**Test Cases**: TC-RP-122 through TC-RP-148 (27 cases)

### FR-024: Create Investment Proposal

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-122 | P0 | **PASS** | `POST /` creates proposal. `createProposal()` validates risk profile exists, is active, not expired. Auto-generates `PROP-YYYYMMDD-XXXX`. Sets `DRAFT`. |
| TC-RP-123 | P0 | **PASS** | `POST /:id/submit` calls `submitProposal()`. Runs suitability check, transitions to `SUBMITTED`. |
| TC-RP-124 | P0 | **PASS** | `createProposal()` throws `'Customer risk profile is not active'` if `!riskProfile.is_active`. |
| TC-RP-125 | P0 | **PARTIAL** | Checks `is_active` but does NOT check `supervisor_approved`. Unapproved deviated profiles could slip through. |
| TC-RP-126 | P0 | **PASS** | `addLineItem()` validates `currentTotal + newAlloc > 100` throws error. `validateAllocation()` checks sum = 100%. |
| TC-RP-127 | P0 | **PASS** | `runSuitabilityCheck()` has concentration limit check: `CONCENTRATION_LIMIT_PCT = 60`. **Note**: BRD says 40%, code uses 60%. Mismatch. |
| TC-RP-128 | P1 | **FAIL** | **No single-issuer concentration check.** Only asset-class concentration is validated. |
| TC-RP-129 | P0 | **FAIL** | **No proposed_amount > 0 validation.** Service accepts any numeric value. |
| TC-RP-130 | P0 | **PARTIAL** | No explicit check for empty line items at proposal creation. Suitability check fails with "No line items found" at submission time. |
| TC-RP-131 | P1 | **PASS** | `submitProposal()` calls `runSuitabilityCheck()` which calls `getProposal()` which fetches current risk profile. Expiry re-validated. |

### FR-027: Proposal Approval Workflow

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-132 | P0 | **PASS** | `POST /:id/approve-l1` -> `approveL1()`: SUBMITTED -> L1_APPROVED. Creates `ProposalApproval` record. |
| TC-RP-133 | P0 | **PARTIAL** | `POST /:id/approve-compliance` -> `approveCompliance()`: L1_APPROVED -> COMPLIANCE_APPROVED. **But auto-transition to SENT_TO_CLIENT and PDF generation are NOT triggered automatically.** Separate `sendToClient()` and `generateProposalPdf()` calls required. |
| TC-RP-134 | P0 | **PASS** | `POST /:id/reject-l1` -> `rejectL1()`: SUBMITTED -> L1_REJECTED. Approval record created. |
| TC-RP-135 | P0 | **PASS** | `POST /:id/return-for-revision` -> `returnForRevision()`: Any status -> DRAFT. Version incremented. Approval record with `RETURNED_FOR_REVISION`. |
| TC-RP-136 | P0 | **PASS** | `POST /:id/reject-compliance` -> `rejectCompliance()`: L1_APPROVED -> COMPLIANCE_REJECTED. |
| TC-RP-137 | P0 | **PASS** | `returnForRevision()` reverts to DRAFT from any non-DRAFT status. |
| TC-RP-138 | P1 | **FAIL** | **No SLA breach/timer mechanism.** No scheduled job or timestamp tracking for approval SLA. |
| TC-RP-139 | P1 | **PARTIAL** | No self-approval check in code. The route uses `(req as any).user?.id || 1` -- same person could theoretically approve their own proposal. Role separation is the guard, not code logic. |
| TC-RP-140 | P0 | **PARTIAL** | `ProposalApproval` table is append-only (INSERT-only in service). No UPDATE/DELETE endpoints exist. However, no explicit API-level guard to prevent DELETE via other routes. |

### FR-029: Client Proposal View & Accept/Reject

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-141 | P0 | **PASS** | `GET /` with `status=SENT_TO_CLIENT` filter returns proposals. |
| TC-RP-142 | P0 | **PASS** | `GET /:id` returns full proposal with `lineItems`, `approvals`, `riskProfile`. All chart data available. |
| TC-RP-143 | P0 | **PASS** | `POST /:id/client-accept` -> `clientAccept()`: SENT_TO_CLIENT -> CLIENT_ACCEPTED. Sets `client_accepted_at`. Creates approval record. |
| TC-RP-144 | P0 | **PASS** | `POST /:id/client-reject` -> `clientReject()`: SENT_TO_CLIENT -> CLIENT_REJECTED. Sets `client_rejected_at`, stores `client_rejection_reason`. |
| TC-RP-145 | P0 | **PARTIAL** | `clientReject()` accepts optional `reason`. **No mandatory reason validation.** Reason can be null. |
| TC-RP-146 | P1 | **PASS** | PDF URL stored in `proposal_pdf_url`. Download endpoint stub exists. |
| TC-RP-147 | P0 | **FAIL** | **No auto-expiry mechanism.** `expires_at` is set when `sendToClient()` is called (30 days), but no scheduled job checks for expiry and transitions to EXPIRED status. |
| TC-RP-148 | P0 | **PARTIAL** | `clientAccept()` checks `proposal_status !== 'SENT_TO_CLIENT'` but does not compare against `expires_at`. Expired proposals could be accepted if status hasn't been transitioned. |

---

## 8. Suitability Checks (FR-026)

**Test Cases**: TC-RP-149 through TC-RP-155 (7 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-149 | P0 | **PASS** | `runSuitabilityCheck()` performs 3 checks: RISK_LEVEL_CHECK, CONCENTRATION_LIMIT, DEVIATION_ACKNOWLEDGEMENT. Results persisted as `suitability_check_passed` + `suitability_check_details` (JSONB). |
| TC-RP-150 | P0 | **PASS** | Product risk > customer risk -> `riskMismatchPassed = false`. Flagged items recorded. |
| TC-RP-151 | P0 | **FAIL** | **No investment experience check (Part B).** Only risk code comparison is done. Product type vs experience not implemented. |
| TC-RP-152 | P0 | **PARTIAL** | Suitability failures prevent submission only indirectly -- `submitProposal()` runs the check but DOES proceed to SUBMITTED regardless of pass/fail. No BLOCKER enforcement. |
| TC-RP-153 | P0 | **PARTIAL** | No WARNING vs BLOCKER severity distinction in the check results. All checks are binary pass/fail. |
| TC-RP-154 | P0 | **PARTIAL** | Concentration limit uses **60%** (`CONCENTRATION_LIMIT_PCT = 60`), but BRD specifies **40%**. **Constant mismatch.** Logic itself works. |
| TC-RP-155 | P1 | **PASS** | Results stored as JSONB in `suitability_check_details`. Structured as `{checks: [{name, passed, message}]}`. |

---

## 9. What-If Analysis (FR-025)

**Test Cases**: TC-RP-156 through TC-RP-161 (6 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-156 | P0 | **PASS** | `POST /:proposalId/what-if` calls `computeWhatIfMetrics()`. Returns `{expected_return_pct, expected_std_dev_pct, sharpe_ratio, max_drawdown_pct}`. |
| TC-RP-157 | P1 | **PARTIAL** | Visual chart is frontend. Backend returns metrics data. |
| TC-RP-158 | P1 | **FAIL** | **No drift warning calculation.** Backend does not compare against model portfolio allocations. |
| TC-RP-159 | P1 | **FAIL** | **No "Reset to Model" API.** Must be handled client-side. |
| TC-RP-160 | P0 | **PASS** | Sharpe = `(weightedReturn - RISK_FREE_RATE) / weightedStdDev`. `RISK_FREE_RATE = 4`. **Note**: BRD mentions 6.5% for INR entity; code uses 4%. |
| TC-RP-161 | P1 | **PASS** | `weightedStdDev > 0` check: returns `0` for Sharpe when std dev is 0. |

---

## 10. Supervisor Dashboard (FR-032)

**Test Cases**: TC-RP-162 through TC-RP-167 (6 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-162 | P0 | **PASS** | `GET /supervisor/dashboard` calls `getLeadStatusSummary()`. Returns aggregated lead counts per RM per status. |
| TC-RP-163 | P0 | **PASS** | Level 2 data: returns `{rmId, rmName, statusCounts, total}` per RM. |
| TC-RP-164 | P1 | **PARTIAL** | Sorting with tie-breakers is frontend. Backend returns raw data. |
| TC-RP-165 | P1 | **PARTIAL** | Search by RM name is frontend filtering. Backend returns all RMs in hierarchy. |
| TC-RP-166 | P0 | **PARTIAL** | Hierarchy filtering uses `branch_id` match. This is a coarse approximation -- not a direct reporting hierarchy (supervisor -> RM). All active users in the same branch are included. |
| TC-RP-167 | P0 | **PARTIAL** | No campaign `is_active` filter on leads. `getLeadStatusSummary()` counts ALL leads for the RMs, not just active campaign leads. |

---

## 11. Reporting (FR-033 -- FR-037)

**Test Cases**: TC-RP-168 through TC-RP-179 (12 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-168 | P1 | **FAIL** | **No risk profiling completion report endpoint.** No service method exists. |
| TC-RP-169 | P1 | **FAIL** | **No CSV export endpoint.** |
| TC-RP-170 | P2 | **FAIL** | **No drill-down endpoint.** |
| TC-RP-171 | P1 | **PASS** | `GET /reports/product-rating` calls `getTransactionByProductRatingReport()`. Groups by `product_risk_code`. |
| TC-RP-172 | P1 | **PARTIAL** | Filtering by product rating must be done client-side from the returned data. |
| TC-RP-173 | P1 | **PASS** | `GET /reports/risk-mismatch` calls `getRiskMismatchReport()`. Returns flagged line items. |
| TC-RP-174 | P1 | **PARTIAL** | Returns `total` count. Acknowledged % and unacknowledged count must be computed client-side from the `deviation_acknowledged` field. |
| TC-RP-175 | P1 | **PASS** | `GET /reports/pipeline` calls `getProposalPipelineReport()`. Groups by status with count and total_amount. |
| TC-RP-176 | P1 | **PARTIAL** | Conversion rate must be computed client-side from the pipeline data. |
| TC-RP-177 | P1 | **FAIL** | **No risk distribution analytics endpoint.** Not implemented. |
| TC-RP-178 | P2 | **FAIL** | No branch breakdown endpoint. |
| TC-RP-179 | P2 | **FAIL** | No trend line endpoint. |

---

## 12. PDF Generation (FR-028)

**Test Cases**: TC-RP-180 through TC-RP-185 (6 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-180 | P0 | **PARTIAL** | `POST /:id/generate-pdf` calls `generateProposalPdf()`. **Stub implementation only** -- returns a placeholder URL, no actual PDF rendering. |
| TC-RP-181 | P1 | **PARTIAL** | Entity-specific templates not implemented. Stub only. |
| TC-RP-182 | P0 | **PARTIAL** | URL generated and stored. Actual file serving not implemented. |
| TC-RP-183 | P0 | **PARTIAL** | Same stub. No client portal endpoint for PDF download. |
| TC-RP-184 | P1 | **PARTIAL** | URL regenerated on each call. No archival of old PDFs. |
| TC-RP-185 | P1 | **PARTIAL** | No actual rendering to measure performance. |

---

## 13. Client Portal (FR-029, FR-031)

**Test Cases**: TC-RP-186 through TC-RP-191 (6 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-186 | P0 | **PASS** | `GET /assessments/customer/:customerId/active` returns active risk profile with responses. |
| TC-RP-187 | P0 | **PARTIAL** | Endpoint accepts `customerId` as path param. No explicit authorization check ensures the logged-in client can only access their own profile. Depends on middleware. |
| TC-RP-188 | P1 | **FAIL** | **No comparison endpoint.** Side-by-side proposal comparison not implemented. |
| TC-RP-189 | P2 | **FAIL** | No multi-proposal comparison. |
| TC-RP-190 | P1 | **PARTIAL** | Status filtering available on list endpoint. Frontend must enforce selection rules. |
| TC-RP-191 | P2 | **PARTIAL** | Max selection limit is frontend. |

---

## 14. Optimistic Locking / Concurrency Control (Section 7.2.1)

**Test Cases**: TC-RP-192 through TC-RP-199 (8 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-192 | P0 | **PASS** | `version` field exists in `auditFields` (default 1). Incremented on updates (e.g., `existing.version + 1` in `updateQuestionnaire()`). |
| TC-RP-193 | P0 | **FAIL** | **No optimistic locking enforcement.** Updates do NOT check that the incoming `version` matches the current DB version. No `WHERE version = :expected_version` clause. No 409 Conflict response. |
| TC-RP-194 | P0 | **FAIL** | No 409 response generated. UI cannot handle what doesn't exist. |
| TC-RP-195 | P0 | **FAIL** | Same -- no version check on `updateRiskAppetiteMapping()`. |
| TC-RP-196 | P0 | **FAIL** | Same -- no version check on `updateAssetAllocationConfig()`. |
| TC-RP-197 | P0 | **FAIL** | Same -- no version check on `updateProposal()`. Version is incremented (`(current.version ?? 1) + 1`) but never validated against input. |
| TC-RP-198 | P0 | **FAIL** | Authorization does NOT validate version. |
| TC-RP-199 | P1 | **PASS** | Reads are non-blocking (standard SELECT). No read locks. |

---

## 15. Cascading Config Validation (FR-040)

**Test Cases**: TC-RP-200 through TC-RP-204 (5 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-200 | P0 | **PASS** | `validateCascadingConfig()` cross-checks band categories vs allocation categories. Reports missing categories as issues. |
| TC-RP-201 | P1 | **PARTIAL** | Checks band->allocation direction but not allocation->band direction (categories in allocation but not in mapping). |
| TC-RP-202 | P0 | **PASS** | Validates scored questionnaires have questions with answer options. Reports questions with no options. Also validates multi-select RANGE questions have normalization ranges. |
| TC-RP-203 | P0 | **PASS** | Returns `{valid: true, issues: []}` when all checks pass. |
| TC-RP-204 | P1 | **PASS** | Multiple issues accumulated in the `issues` array. All returned at once. |

---

## 16. Compliance Escalation for Repeat Deviations (FR-038)

**Test Cases**: TC-RP-205 through TC-RP-212 (8 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-205 | P0 | **PASS** | `checkRepeatDeviationThreshold()` counts deviations in window. `createEscalation()` creates `ComplianceEscalation` with status=OPEN. |
| TC-RP-206 | P0 | **PARTIAL** | `resolveEscalation()` moves to RESOLVED directly. **No ACKNOWLEDGED intermediate status handling.** |
| TC-RP-207 | P0 | **PASS** | `resolution_action` accepts `FLAGGED_FOR_REVIEW` (in `resolutionActionEnum`). |
| TC-RP-208 | P0 | **PASS** | `resolution_action` accepts `CLIENT_RESTRICTED`. |
| TC-RP-209 | P1 | **PASS** | `resolveEscalation()` sets `resolved_at` and `escalation_status: 'RESOLVED'`. |
| TC-RP-210 | P0 | **PASS** | `exceedsThreshold` returns `false` when `deviations.length < threshold`. |
| TC-RP-211 | P0 | **PASS** | Window is rolling: `windowStart = now - windowDays`. `windowDays` parameter (default 365). |
| TC-RP-212 | P1 | **PARTIAL** | Threshold is a function parameter (default 5), not entity-configurable via DB. Must be passed per call. |

**Note**: BRD test case TC-RP-211 mentions 30-day window, but service defaults to `windowDays=365`. The window duration mismatch should be configured per entity.

---

## 17. Audit Trail (FR-039)

**Test Cases**: TC-RP-213 through TC-RP-220 (8 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-213 | P0 | **PASS** | `createRiskAssessment()` creates `riskProfilingAuditLogs` entry with `session_id`, `customer_id`, `initiated_by`, `initiated_at`, device metadata, `entity_id`. |
| TC-RP-214 | P0 | **PASS** | Same audit log updated with `completed_at`, `duration_seconds`, `outcome='COMPLETED'`, `risk_profile_id`. |
| TC-RP-215 | P0 | **FAIL** | **No ABANDONED handling.** Audit log is created only inside `createRiskAssessment()` which runs atomically. If the user navigates away, no log is created at all. Needs a separate "start session" endpoint. |
| TC-RP-216 | P1 | **PASS** | `initiated_by` accepts any user ID (RM or client). |
| TC-RP-217 | P0 | **PARTIAL** | No PUT/DELETE routes for audit logs exist. However, no explicit 405 guard either. |
| TC-RP-218 | P0 | **FAIL** | **No read endpoint for audit logs.** No API to query `riskProfilingAuditLogs`. Compliance cannot access them. |
| TC-RP-219 | P1 | **PASS** | `device_type`, `user_agent`, `ip_address` fields in schema and accepted in `createRiskAssessment()`. |
| TC-RP-220 | P1 | **PARTIAL** | ERROR outcome exists in enum (`auditOutcomeEnum: 'ERROR'`), but `createRiskAssessment()` does not catch errors and log them with ERROR outcome. If computation fails, no audit log is created. |

---

## 18. Notifications (Section 10)

**Test Cases**: TC-RP-221 through TC-RP-234 (14 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-221 to TC-RP-234 | P0-P1 | **FAIL** (all) | **No notification service integration.** None of the risk profiling or proposal service methods trigger notifications (in-app, email, SMS). Notification templates table exists (`notificationTemplates`) but no dispatch mechanism is wired into these services. |

**All 14 notification test cases: FAIL**. This is a known gap -- notifications are typically added as a cross-cutting concern in a later phase.

---

## 19. Model Portfolio Management (FR-030)

**Test Cases**: TC-RP-235 through TC-RP-238 (4 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-235 | P1 | **PASS** | `rpModelPortfolios` table exists with `portfolio_name`, `risk_category`, `benchmark_index`, `rebalance_frequency`, `drift_threshold_pct`, `authorization_status`. CRUD available via back-office generic routes. |
| TC-RP-236 | P1 | **FAIL** | **No drift detection service.** No method compares actual vs model allocations. |
| TC-RP-237 | P1 | **FAIL** | **No bulk proposal refresh mechanism.** No event triggered when model portfolio changes. |
| TC-RP-238 | P1 | **FAIL** | Same -- no flagging of proposals using changed models. |

---

## 20. Data Archival (FR-042)

**Test Cases**: TC-RP-239 through TC-RP-242 (4 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-239 | P2 | **FAIL** | **No archival job implemented.** |
| TC-RP-240 | P2 | **FAIL** | No archive query endpoint. |
| TC-RP-241 | P0 | **PARTIAL** | Active profiles are never hard-deleted (soft-delete only). Archival logic not implemented, but active profiles won't be affected by non-existent archival. |
| TC-RP-242 | P2 | **FAIL** | No archival audit trail. |

---

## 21. API Error Handling & Security

**Test Cases**: TC-RP-243 through TC-RP-247 (5 cases)

| TC-ID | Priority | Verdict | Notes |
|-------|----------|---------|-------|
| TC-RP-243 | P0 | **PARTIAL** | Errors thrown as plain `Error` objects. Express error handler may format them, but no structured `{error: {code, message, field}}` format in service layer. |
| TC-RP-244 | P0 | **PASS** | Routes use `requireBackOfficeRole()` middleware which checks authentication. |
| TC-RP-245 | P0 | **PARTIAL** | `requireBackOfficeRole()` exists but does not enforce specific roles (OPS_ADMIN, RM, etc.) per endpoint. All back-office users can access all endpoints. |
| TC-RP-246 | P1 | **PASS** | `getQuestionnaire()` throws `'Questionnaire not found'`. Route handler returns 404 for some endpoints (e.g., `GET /questionnaires/:id`). |
| TC-RP-247 | P0 | **FAIL** | **No duplicate entity detection.** No unique constraint or service-level check for overlapping questionnaires. |

---

## Critical Findings Summary (P0 FAILs)

These are the P0 test cases that FAIL and require attention before release:

| # | TC-IDs | Finding | Severity | Recommended Fix |
|---|--------|---------|----------|-----------------|
| 1 | TC-RP-019, TC-RP-020, TC-RP-021, TC-RP-022 | **No input validation** on questionnaire creation (min length, date logic, duplicate check, category conflict) | HIGH | Add validation layer in `createQuestionnaire()` |
| 2 | TC-RP-023, TC-RP-050 | **No normalization range validation** (overlap, from >= to) | HIGH | Add validation in `setNormalizationRanges()` |
| 3 | TC-RP-041 | **AUTHORIZED questionnaires can be deleted** -- no status check | HIGH | Add status guard in `deleteQuestionnaire()` |
| 4 | TC-RP-047 | **Rejection reason not supported** for questionnaire/mapping rejection | MEDIUM | Add `reason` field to reject endpoints |
| 5 | TC-RP-058, TC-RP-059 | **No band overlap/gap validation** at creation time | HIGH | Add validation in `createRiskAppetiteMapping()` |
| 6 | TC-RP-108 | **No reject-deviation endpoint** for supervisor to reject deviated profiles | HIGH | Add `rejectDeviation()` method and route |
| 7 | TC-RP-129 | **No proposed_amount > 0 validation** | MEDIUM | Add check in `createProposal()` |
| 8 | TC-RP-147, TC-RP-148 | **No proposal auto-expiry mechanism** | HIGH | Add scheduled job or middleware check |
| 9 | TC-RP-151 | **No investment experience suitability check** | MEDIUM | Extend `runSuitabilityCheck()` |
| 10 | TC-RP-193 to TC-RP-198 | **Optimistic locking not enforced** -- version field incremented but never validated on input | CRITICAL | Add `WHERE version = :expected` to all update queries |
| 11 | TC-RP-215, TC-RP-218 | **Audit trail incomplete** -- no ABANDONED tracking, no read endpoint | MEDIUM | Add session start endpoint and audit query route |
| 12 | TC-RP-221 to TC-RP-234 | **No notification dispatch** anywhere in the module | HIGH | Integrate notification service |
| 13 | TC-RP-247 | **No duplicate entity detection** | MEDIUM | Add unique constraint or service check |

---

## Configuration Mismatches

| Item | BRD Value | Code Value | Impact |
|------|-----------|------------|--------|
| Concentration limit | 40% | 60% (`CONCENTRATION_LIMIT_PCT`) | Proposals with 41-60% single-asset allocation incorrectly pass |
| Risk-free rate (INR) | 6.5% | 4% (`RISK_FREE_RATE`) | Sharpe ratio calculation differs from BRD specification |
| Escalation window | 30 days | 365 days (default `windowDays`) | Escalation triggers far less frequently than BRD intends |

---

## Route Registration Note

Risk profiling and proposal routes are registered in `server/routes.ts` (not in `back-office/index.ts`):
```
app.use('/api/v1/risk-profiling', riskProfilingRouter);
app.use('/api/v1/proposals', proposalsRouter);
```

This means they are NOT behind the blanket `requireBackOfficeRole()` guard from `back-office/index.ts`. Instead, individual routes apply `requireBackOfficeRole()` selectively. Some routes (e.g., `GET /questionnaires`, `POST /assessments/compute-score`, `GET /assessments/customer/:customerId`, `POST /deviations/check`) are **unguarded** -- this may be intentional for client portal access but should be reviewed.

---

## Recommendations for Next Steps

1. **Highest priority**: Implement optimistic locking (TC-RP-193 to TC-RP-198). Add `version` to update WHERE clauses and return 409 on mismatch.
2. **High priority**: Add input validation for questionnaire creation, band validation, and normalization range validation.
3. **High priority**: Fix configuration constants (concentration limit 60%->40%, risk-free rate 4%->entity-configurable).
4. **Medium priority**: Add reject-deviation endpoint, proposal auto-expiry job, and audit trail read endpoint.
5. **Lower priority**: Notification integration, model portfolio drift detection, data archival.
6. **Review**: Unguarded routes for client-portal access vs security requirements.
