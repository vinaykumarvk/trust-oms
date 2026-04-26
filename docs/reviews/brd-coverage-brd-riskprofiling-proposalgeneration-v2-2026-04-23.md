# BRD Coverage Audit: Risk Profiling & Proposal Generation Management
## Date: 2026-04-23
## BRD: `docs/BRD-RiskProfiling-ProposalGeneration-v2.docx` (v2.0 Final)

---

## Phase 0 — Preflight

| Item | Value |
|------|-------|
| BRD File | `docs/BRD-RiskProfiling-ProposalGeneration-v2.docx` (82 KB) |
| BRD Version | 2.0 (Post-Adversarial Review), Final |
| Functional Requirements | 42 FRs across 7 modules (FR-001 to FR-042) |
| Deferred FRs | FR-041 (i18n), FR-042 (archival) |
| Actionable FRs | 40 |
| Total auditable line items | 221 (ACs + BRs, excl. 3 deferred items) |
| Git branch | `main` |
| Last commit | `1d0f244` fix(types): reduce as-any casts |
| Tech stack | Node.js/Express, TypeScript, React/Vite, Drizzle ORM, PostgreSQL |
| API routes | `server/routes/back-office/risk-profiling.ts`, `server/routes/back-office/proposals.ts`, `server/routes/client-portal.ts` |
| Services | `server/services/risk-profiling-service.ts`, `server/services/proposal-service.ts` |
| UI (back-office) | `apps/back-office/src/pages/` — 6 pages |
| UI (client portal) | `apps/client-portal/src/pages/` — 2 pages |
| Schema | `packages/shared/src/schema.ts` (lines 4510–4900) |
| Tests | `tests/e2e/` — no RP-specific e2e test file found |
| Scope | Full (all phases) |

---

## Phase 1 — Requirement Extraction Summary

| Module | FRs | ACs | BRs | Total Items |
|--------|-----|-----|-----|-------------|
| A: Questionnaire Maintenance | FR-001–008 | 35 | 8 | 43 |
| B: Risk Appetite & Asset Allocation | FR-009–014 | 15 | 4 | 19 |
| C: Customer Risk Assessment | FR-015–020 | 35 | 4 | 39 |
| D: Product Risk Deviation & Compliance | FR-021–023 | 13 | 1 | 14 |
| E: Investment Proposal Generation | FR-024–031 | 46 | 8 | 54 |
| F: Supervisor Dashboard & Reporting | FR-032–037 | 26 | 3 | 29 |
| G: Compliance Hardening (Post-Review) | FR-038–040 | 14 | 2 | 16 |
| NFRs (Security, API, Performance) | — | — | — | 7 |
| **Total (excl. deferred)** | **40** | **184** | **30** | **221** |

---

## Phase 2 — Code Traceability (Full Traceability Matrix)

### Module A: Risk Profiling Questionnaire Maintenance

#### FR-001: List Questionnaires

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Grid shows non-deleted questionnaires for entity | DONE | `risk-profiling-service.ts:62-63` — `eq(is_deleted,false)`, `eq(entity_id,…)` |
| AC2: Columns sortable/filterable | PARTIAL | `questionnaire-maintenance.tsx:476-507` — search + status + category filters CONFIRMED; column sorting NOT_FOUND |
| AC3: Pagination 10/25/50 per page | PARTIAL | `questionnaire-maintenance.tsx:597-611` — prev/next pagination DONE; page-size selector (10/25/50) NOT_FOUND — hardcoded 25 at line 214 |
| AC4: Status badges color-coded (grey/amber/green/red) | PARTIAL | `questionnaire-maintenance.tsx:37-42` — UNAUTHORIZED=yellow (not grey per spec), MODIFIED=blue (not amber), AUTHORIZED=green ✓, REJECTED=red ✓ |
| AC5: View/Edit/Delete based on status | DONE | `questionnaire-maintenance.tsx:557-587` — Authorize/Reject restricted to UNAUTHORIZED/MODIFIED; Edit/Delete always shown |
| BR1: Only UNAUTHORIZED/MODIFIED editable/deleteable | NOT_FOUND | No service-level guard prevents edit/delete of AUTHORIZED records; UI shows buttons for all statuses |

#### FR-002: Add Questionnaire

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: All mandatory fields marked * | DONE | `questionnaire-maintenance.tsx:747,757,768` — Name *, Category *, Type * |
| AC2: Questionnaire Type dropdown | DONE | `questionnaire-maintenance.tsx:769-776` — QUESTIONNAIRE_TYPES array |
| AC3: Start Date defaults to today; End > Start | PARTIAL | Service validates End > Start at `risk-profiling-service.ts:176-180`; UI defaults to empty string (not today) at line 150 |
| AC4: Add Question button | DONE | `questionnaire-maintenance.tsx:689-691` |
| AC5: Question fields (Desc, Mandatory, Multi-Select, Scoring, Computation) | DONE | `questionnaire-maintenance.tsx:887-955` |
| AC6: Add Options with description + weightage | DONE | `questionnaire-maintenance.tsx:959-972` |
| AC7: Save → UNAUTHORIZED status | DONE | `risk-profiling-service.ts:201` — `authorization_status:'UNAUTHORIZED'` |
| AC8: Success toast 'Record Modified Successfully' | NOT_FOUND | `questionnaire-maintenance.tsx:249,256` — shows "Questionnaire created"/"updated" (spec requires exact text "Record Modified Successfully") |
| AC9: Grid refreshes after save | DONE | `questionnaire-maintenance.tsx:241-244` — `invalidateAll()` |
| BR1: Uniqueness per (category, type, overlapping dates) | NOT_FOUND | `risk-profiling-service.ts:139-175` — checked at service level but only validates "Both" covers Individual/Non-Individual conceptually; no DB unique constraint on overlapping date ranges found |

#### FR-003: View Questionnaire (Read-Only)

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: All fields non-editable | DONE | `questionnaire-maintenance.tsx:619-680` — data displayed as text labels, not inputs |
| AC2: Questions as collapsible sections | DONE | `questionnaire-maintenance.tsx:1140-1184` — ChevronDown/Right toggle per question |
| AC3: Back button | DONE | `questionnaire-maintenance.tsx:439-442` |
| AC4: No Save/Reset buttons in view | DONE | `questionnaire-maintenance.tsx:619-680` — only Authorize/Reject/Edit shown |

#### FR-004: Modify Questionnaire

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Form pre-populated | DONE | `questionnaire-maintenance.tsx:348-363` — `openEditDialog()` fills form |
| AC2: Add/Remove Question and Option buttons | DONE | `questionnaire-maintenance.tsx:689,961,1000-1006` |
| AC3: Status → MODIFIED; version incremented | DONE | `risk-profiling-service.ts:250-251` — `authorization_status:'MODIFIED'`, `version: existing.version+1` |
| BR1: Cannot modify REJECTED records | NOT_FOUND | No guard at service or UI level prevents editing REJECTED questionnaires |

#### FR-005: Delete Questionnaire

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Confirmation dialog | DONE | `questionnaire-maintenance.tsx:858-877` |
| AC2: Only UNAUTHORIZED/MODIFIED deleteable | NOT_FOUND | Delete button shown for all statuses; no status check in UI or service before soft-delete |
| AC3: Record removed from grid | DONE | `questionnaire-maintenance.tsx:277-281` — `invalidateAll()` |
| BR1: AUTHORIZED cannot be deleted | NOT_FOUND | Service `deleteQuestionnaire()` does not check authorization_status before setting is_deleted=true |

#### FR-006: Authorize/Reject Questionnaire

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Authorization queue for pending records | PARTIAL | `questionnaire-maintenance.tsx:486-497` — can filter by UNAUTHORIZED/MODIFIED; not a dedicated queue UI |
| AC2: Supervisor can view full details | DONE | `questionnaire-maintenance.tsx:425-428` — detail view accessible |
| AC3: Authorize sets AUTHORIZED, checker_id, authorized_at | DONE | `risk-profiling-service.ts:293-297` — all three fields set |
| AC4: Reject sets REJECTED with mandatory reason | PARTIAL | `risk-profiling-service.ts:320` — status set to REJECTED; rejection reason NOT stored in questionnaire record |
| AC5: Maker cannot authorize own (four-eyes) | DONE | `risk-profiling-service.ts:286-287` — `if (maker_id === checkerId) throw` |
| AC6: Notification sent to maker on authorize/reject | NOT_FOUND | No notification service call after authorization actions |

#### FR-007: Score Normalization for Multi-Select

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Add Range button when scoring_type=RANGE | DONE | `questionnaire-maintenance.tsx:1172-1175` |
| AC2: Each range: From, To, Score fields | DONE | `questionnaire-maintenance.tsx:1037-1072` — min, max, normalized_score |
| AC3: Ranges non-overlapping, full coverage | NOT_FOUND | `risk-profiling-service.ts:373-400` — ranges stored; overlap/gap validation NOT implemented |
| AC4: Validation: From < To, Score ≥ 0, no gaps | NOT_FOUND | No explicit validation for these constraints at service or UI level |
| BR1: scoring_type auto-NONE when is_multi_select=No | NOT_FOUND | No auto-conversion logic found; default is 'NONE' but not enforced based on is_multi_select value |

#### FR-008: Warning/Acknowledgement/Disclaimer Config

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Three collapsible sections at bottom | NOT_FOUND | `questionnaire-maintenance.tsx:818-845` — shown as flat textarea fields, NOT collapsible sections |
| AC2: Each supports rich text | NOT_FOUND | Using `<textarea>` (plain text) not a rich text editor |
| AC3: Content is optional | DONE | Defaults to empty string at `questionnaire-maintenance.tsx:154-156` |
| AC4: Content displayed during risk profiling | PARTIAL | `risk-assessment-wizard.tsx:519-537` — acknowledgement/disclaimer shown at step 3 (review); warning shown at step 0 but not from questionnaire config |

---

### Module B: Risk Appetite Mapping & Asset Allocation

#### FR-009: List Risk Appetite Mappings

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Grid with mapping data and actions | DONE | `risk-appetite-mapping.tsx:367-436` |
| AC2: Sortable, filterable, paginated | PARTIAL | Entity filter implemented; sort and pagination controls NOT_FOUND |

#### FR-010: Add/Modify Risk Appetite Mapping

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Header: Name, dates | DONE | `risk-appetite-mapping.tsx:370-406` |
| AC2: Bands table with Score From/To, Category dropdown, Risk Code 1-6 | DONE | `risk-appetite-mapping.tsx:490-579` |
| AC3: Bands contiguous and non-overlapping | DONE | `risk-profiling-service.ts:552-575` — overlap and gap validation enforced |
| AC4: Save → UNAUTHORIZED | DONE | `risk-profiling-service.ts:584` |
| BR1: Risk code 1=lowest; inclusive-lower, exclusive-upper | DONE | `risk-appetite-mapping.tsx:1157-1170` — band logic documented |
| BR2: Bands cover 0 to max possible score | NOT_FOUND | No validation that first band starts at 0 or that bands are exhaustive |

#### FR-011: Authorize Risk Appetite Mapping

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Same workflow as FR-006 | DONE | `risk-profiling.ts:196-216` |
| AC2: Four-eyes principle | DONE | `risk-profiling-service.ts:717-718` |
| AC3: Notifications sent | NOT_FOUND | No notification service calls |

#### FR-012: List Asset Allocation Configs

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Grid with all columns | DONE | `asset-allocation-config.tsx:414-520` |

#### FR-013: Add/Modify Asset Allocation

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Per-category rows with %, expected return, std dev | DONE | `asset-allocation-config.tsx:612-703` |
| AC2: Allocation % per category must sum to 100% | DONE | `asset-allocation-config.tsx:279-289` — `Math.abs(total-100)>0.01` check |
| AC3: Donut chart preview real-time | PARTIAL | Bar chart shown at line 469; donut chart NOT implemented (spec requires donut) |
| AC4: Save → UNAUTHORIZED | DONE | `risk-profiling-service.ts:831` |
| BR1: All 6 risk categories must have allocation | NOT_FOUND | Only 5 pre-populated categories in UI; no validation requiring all 6 |
| BR2: Asset classes must match product taxonomy | NOT_FOUND | Free-text entry, no product taxonomy lookup |

#### FR-014: Authorize Asset Allocation

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Same workflow as FR-006 | DONE | `risk-profiling.ts:250-270` |

---

### Module C: Customer Risk Assessment Journey

#### FR-015: Initiate Risk Profiling

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Customer search by name/ID/account | DONE | `risk-assessment-wizard.tsx:361-372` |
| AC2: If active profile exists, show with re-assess option | PARTIAL | Profile status shown at line 218-223; explicit "re-assess" action NOT_FOUND |
| AC3: Navigate to Assess Risk if no profile or expired | DONE | `risk-assessment-wizard.tsx:373-389` |
| AC4: Step indicator: Edit Profile → Assess Risk → Transact | PARTIAL | 3-step indicator exists at line 29-33 but labels are "Select Customer / Answer Questionnaire / Review & Submit" (not as spec) |
| AC5: Back button at each step | DONE | `risk-assessment-wizard.tsx:570-571` |

#### FR-016: Display Risk Questionnaire

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Auto-identify questionnaire by category + type + date | PARTIAL | `risk-profiling-service.ts:978-1019` — server-side lookup DONE; UI presents a manual selector dropdown at step 2 — partially manual |
| AC2: 3 collapsible sections: Part A, Part B, Part C | NOT_FOUND | `risk-assessment-wizard.tsx:424-450` — questions rendered as flat list, no Part A/B/C grouping |
| AC3: First section auto-expanded | NOT_FOUND | No collapsible section structure to auto-expand |
| AC4: Radio/checkbox for single/multi-select | DONE | `risk-assessment-wizard.tsx:440` — `type={q.is_multi_select ? "checkbox" : "radio"}` |
| AC5: Mandatory questions marked * | DONE | `risk-assessment-wizard.tsx:431` |
| AC6: Warning/Acknowledgement/Disclaimer at bottom | DONE | `risk-assessment-wizard.tsx:404-408, 519-537` |
| AC7: Confirm button | DONE | `risk-assessment-wizard.tsx:560` |
| BR1: Error if no authorized questionnaire found | DONE | `risk-profiling-service.ts:1019-1020` |

#### FR-017: Compute Risk Score

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Single-select score = selected weightage | DONE | `risk-profiling-service.ts:1107` |
| AC2: Multi-select NONE: sum of weightages | DONE | `risk-profiling-service.ts:1111-1113` |
| AC3: Multi-select RANGE: raw_sum → normalize | DONE | `risk-profiling-service.ts:1116-1130` |
| AC4: Total = sum of all question scores | DONE | `risk-profiling-service.ts:1143` |
| AC5: Map to RiskAppetiteBand → category + code | DONE | `risk-profiling-service.ts:1149-1170` |
| AC6: Non-scored parts recorded, don't contribute | DONE | `risk-profiling-service.ts:1070-1081` |
| BR1: Error if score out of all bands | DONE | `risk-profiling-service.ts:1172-1176` |
| BR2: Inclusive-lower, exclusive-upper; last band inclusive both ends | DONE | `risk-profiling-service.ts:1157-1169` |

#### FR-018: Display Recommended Risk Profile

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Risk Score prominent (large display) | DONE | `risk-assessment-wizard.tsx:459` — text-3xl font-bold |
| AC2: Risk Category with color coding | PARTIAL | Category shown at line 460 but no color-coded badge applied |
| AC3: Interactive donut chart with model allocation | NOT_FOUND | `risk-assessment-wizard.tsx:465-487` — table layout only; no donut chart |
| AC4: Expected Return % and Std Dev % | DONE | `risk-assessment-wizard.tsx:461` |
| AC5: Risk Profile Date + Expiry Date shown | NOT_FOUND | Dates calculated in service (`risk-profiling-service.ts:1220-1222`) but not displayed in UI review step |
| AC6: Continue/Submit button | DONE | `risk-assessment-wizard.tsx:580-583` |

#### FR-019: Risk Profile Deviation

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Dialog "Do you agree on your Risk Profile?" Yes/No | NOT_FOUND | `risk-assessment-wizard.tsx:494` — checkbox approach, not a Yes/No dialog |
| AC2: If No: category dropdown + mandatory reason | DONE | `risk-assessment-wizard.tsx:504-512` |
| AC3: Deviation recorded (is_deviated=true, category, reason) | DONE | `risk-profiling-service.ts:1224-1230` |
| AC4: Deviation requires supervisor approval | DONE | `risk-profiling-service.ts:1266` — supervisor_approved=false |
| AC5: Configurable per entity (can be disabled) | NOT_FOUND | No entity-level config flag for risk_deviation_enabled |
| BR1: SBI disables, 360One/JBR enables | NOT_FOUND | No entity-level feature flag found |

#### FR-020: Supervisor Risk Profile Approval

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Supervisor Dashboard → pending risk profiles | DONE | `risk-assessment-wizard.tsx:257-289` — pending deviations table |
| AC2: View full questionnaire responses | NOT_FOUND | `risk-assessment-wizard.tsx:268-276` — only shows computed vs deviated category; full responses NOT accessible to supervisor |
| AC3: Highlight deviation | DONE | `risk-assessment-wizard.tsx:276` — orange badge for deviation |
| AC4: Approve or Reject with comments | PARTIAL | `risk-assessment-wizard.tsx:279-281` — Approve button exists; Reject button and comments field NOT_FOUND |
| AC5: supervisor_approved = true on approval | DONE | `risk-profiling-service.ts:1400` |
| AC6: Notification sent to RM | NOT_FOUND | No notification dispatch |

---

### Module D: Product Risk Deviation & Compliance

#### FR-021: Product Rating Alert

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Alert popup with exact text 'ALERT! Selected product(s) has Higher Risk…' | NOT_FOUND | No modal/popup component found with this text anywhere in codebase |
| AC2: Customer Risk Profile + product table in alert | NOT_FOUND | No dedicated alert component |
| AC3: Footer disclaimer in popup | NOT_FOUND | No popup footer |
| AC4: Cancel and 'Confirm Notified to Customer' buttons | NOT_FOUND | No such button pattern |
| AC5: Deviation recorded in ProductRiskDeviation table | DONE | `schema.ts:5455` — `productRiskDeviations` table exists; `investment-proposals.tsx:812-822` — `risk_deviation_flagged` shown |
| BR1: Alert on all product screens (RM Office + Client Portal) | PARTIAL | Flag visible in RM proposal screen; popup NOT implemented; Client Portal has no alert |

#### FR-022: Risk Rating Filter

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Risk Rating dropdown (High/Low/LowMod/…) | NOT_FOUND | No risk rating filter dropdown in any product selection screen |
| AC2: Multi-select checkboxes | NOT_FOUND | — |
| AC3: Real-time filtering | NOT_FOUND | — |
| AC4: Clear filter option | NOT_FOUND | — |

#### FR-023: Risk Profile Display Across Screens

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Product risk badge numeric 1-6 | PARTIAL | `investment-proposals.tsx:812` — product_risk_code column shown; no badge styling |
| AC2: Color coding 1-2=green, 3-4=amber, 5-6=red | NOT_FOUND | No color-coding by risk code level found |
| AC3: Tooltip 'Risk Rating: {code}' on hover | NOT_FOUND | No tooltip implementation |
| AC4: Consistent RM Office + Client Portal | NOT_FOUND | Client portal proposals page doesn't show risk codes |

---

### Module E: Investment Proposal Generation

#### FR-024: Create Investment Proposal

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Select client from customer search | DONE | `investment-proposals.tsx` — customer_id field in create form |
| AC2: Blocks if no active risk profile | DONE | `proposal-service.ts:168-169` — throws if no active profile |
| AC3: Auto-suggest model portfolio from AssetAllocationConfig | PARTIAL | `proposal-service.ts` — risk_profile_id resolved; model allocation data available but no UI auto-population of line items found |
| AC4: Customize allocation, add/remove products | PARTIAL | `investment-proposals.tsx:938-944` — line items shown; add/remove in create dialog NOT implemented with product search |
| AC5: Real-time validation: sum to 100% | DONE | `proposal-service.ts:366-379` |
| AC6: Concentration: max 40% single asset class, max 10% single issuer | DONE | `proposal-service.ts:588-603` |
| AC7: Suitability check runs on save | DONE | `proposal-service.ts:727-728` |
| AC8: Save as DRAFT or Submit for approval | DONE | `schema.ts:5395` — DRAFT default; submit endpoint at `proposals.ts:144-151` |
| BR1: Active, non-expired, supervisor-approved risk profile required | DONE | `proposal-service.ts:156-192` |

#### FR-025: What-If Analysis

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Slider/input per asset class for what-if | PARTIAL | `investment-proposals.tsx:869-875` — what-if panel exists; inputs for weights; sliders NOT implemented |
| AC2: Real-time recalculation (Return, Std Dev, Sharpe, Drawdown) | DONE | `proposal-service.ts:647-707` — all 4 metrics computed |
| AC3: Visual bar chart: current vs model allocation | NOT_FOUND | No comparison bar chart found |
| AC4: Warning if >15% drift from model | NOT_FOUND | No drift threshold warning |
| AC5: Reset to Model button | NOT_FOUND | No reset button |
| BR1: Sharpe = (Return - 6.5%) / Std Dev | DONE | `proposal-service.ts:24,680-683` — RISK_FREE_RATE = 6.5 |

#### FR-026: Automated Suitability Check

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Product risk_code ≤ client risk_code check | DONE | `proposal-service.ts:548-571` |
| AC2: Product type matches investment experience (Part B) | NOT_FOUND | No Part B experience matching logic in suitability check |
| AC3: Concentration limits | DONE | `proposal-service.ts:588-603` |
| AC4: Investment mandate alignment (advisory/discretionary) | NOT_FOUND | No mandate alignment check found |
| AC5: Results in suitability_check_passed + JSONB details | DONE | `proposal-service.ts:623-631` |
| AC6: Failed checks shown with BLOCKER/WARNING severity | PARTIAL | `proposal-service.ts:606-622` — issues array with messages; BLOCKER/WARNING labels NOT implemented |
| BR1: BLOCKER prevents submission; WARNING allows with acknowledgement | NOT_FOUND | `proposals.ts:144-151` — submit proceeds regardless of suitability_check_passed value |

#### FR-027: Proposal Approval Workflow

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Submit → SUBMITTED | DONE | `proposal-service.ts:716-737` |
| AC2: L1 Supervisor: APPROVE/REJECT/RETURN | DONE | `proposal-service.ts:742-775` |
| AC3: L1 approved → Compliance notified | NOT_FOUND | No notification dispatch after L1 approval |
| AC4: Compliance: APPROVE/REJECT/RETURN | DONE | `proposal-service.ts:780-813` |
| AC5: Compliance approved → SENT_TO_CLIENT | DONE | `proposal-service.ts:819-846` |
| AC6: Each action in ProposalApproval table | DONE | `proposal-service.ts:746-751` |
| AC7: SLA 24h escalation | NOT_FOUND | No SLA timer or escalation job found |
| BR1: Returned proposals → DRAFT | DONE | `proposal-service.ts` — `returnForRevision()` sets DRAFT |
| BR2: Rejected = terminal state | DONE | `proposal-service.ts` — no re-open after rejection |

#### FR-028: Generate Proposal PDF

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: PDF includes logo, RM, client info, allocation chart, product table, disclaimers | STUB | `proposal-service.ts:977-997` — generates placeholder URL; no actual PDF content |
| AC2: Configurable template per entity | NOT_FOUND | No template config |
| AC3: Server-side generation (Puppeteer) | NOT_FOUND | Puppeteer not installed; stub only |
| AC4: PDF URL stored on proposal | DONE | `proposal-service.ts:986` — `proposal_pdf_url` set |
| AC5: Downloadable from RM Office and Client Portal | PARTIAL | URL field exists; no actual download endpoint returning PDF binary |
| BR1: PDF regenerated on modification; prior versions archived | NOT_FOUND | No regeneration or versioning |

#### FR-029: Client Proposal View & Accept/Reject

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Client Portal shows SENT_TO_CLIENT proposals | DONE | `client-portal/proposals.tsx:156-187` |
| AC2: Detail with interactive charts | PARTIAL | `client-portal/proposals.tsx:425-556` — line items table + allocation bar; no interactive pie/bar chart |
| AC3: Accept with digital acknowledgement + e-signature | PARTIAL | Accept button at line 573-580; no e-signature integration; no acknowledgement checkbox |
| AC4: Reject with mandatory reason | DONE | `client-portal/proposals.tsx:210-228` |
| AC5: Accepted proposals trigger downstream order generation | NOT_FOUND | `proposal-service.ts:844-876` — clientAccept() sets status only; no order creation trigger |
| AC6: PDF downloadable | PARTIAL | `proposal_pdf_url` field accessible; actual PDF binary not generated |
| BR1: Proposals expire after 30 days; auto-transition | PARTIAL | `proposal-service.ts:820-821` — expires_at set; no scheduled job to auto-transition expired proposals |

#### FR-030: Model Portfolio Management

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: CRUD for model portfolios (name, risk category, benchmark, rebalance freq, drift threshold) | PARTIAL | `schema.ts:5441` — ModelPortfolio entity exists; no dedicated management UI found in back-office pages |
| AC2: Portfolio line items | PARTIAL | JSON allocations in model portfolio service; no UI CRUD |
| AC3: Performance tracking vs benchmark | NOT_FOUND | No performance tracking implementation |
| AC4: Drift alert when actual deviates > threshold | NOT_FOUND | No drift alert |
| AC5: Bulk proposal refresh when model changes | PARTIAL | `getRebalancingActions()` and `comparePortfolioToModel()` exist in service; no UI trigger |
| BR1: Model portfolio changes require authorization | NOT_FOUND | No maker-checker workflow for model portfolios |

#### FR-031: Proposal Comparison

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Select 2-3 proposals for comparison | NOT_FOUND | No multi-select UI |
| AC2: Side-by-side comparison view | NOT_FOUND | — |
| AC3: Visual chart overlay | NOT_FOUND | — |
| AC4: Highlight differences | NOT_FOUND | — |

---

### Module F: Supervisor Dashboard & Reporting

#### FR-032: Supervisor Leads Widget

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Level 1 bar chart with 5 status bars | DONE | `supervisor-dashboard-rp.tsx:443-469` |
| AC2: Drill-down → Level 2 table | DONE | `supervisor-dashboard-rp.tsx:434-436` |
| AC3: Level 2 columns (RM Name, totals by status) | DONE | `supervisor-dashboard-rp.tsx:486-494` |
| AC4: Only active campaign leads | DONE | `supervisor-dashboard-rp.tsx:136` |
| AC5: Sorted by Client Accepted ascending | PARTIAL | Service returns data; explicit ascending sort by Client Accepted NOT confirmed |
| AC6: Search by RM name | DONE | `supervisor-dashboard-rp.tsx:476-481` |
| AC7: Pagination | DONE | `supervisor-dashboard-rp.tsx:520-532` |
| BR1: Supervisor sees only own hierarchy (branch_id) | DONE | `risk-profiling-service.ts:1749-1766` |

#### FR-033: Risk Profiling Completion Report

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Filters (Date range, RM, Branch, Entity) | NOT_FOUND | No completion report endpoint or page found |
| AC2: Columns (RM, Total, Profiled, Pending, Expired, %) | NOT_FOUND | — |
| AC3: Export CSV/Excel | NOT_FOUND | — |
| AC4: Drill-down to individual clients | NOT_FOUND | — |

#### FR-034: Transaction by Product Rating

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Columns (RM Name, RM ID, Account, Client Risk, Product Rating, Product Name) | PARTIAL | `proposal-service.ts:1082-1121` — `getTransactionByProductRatingReport()` exists with product_risk_code; RM Employee ID mapping incomplete |
| AC2: Filters (Date range, RM, Client Risk Profile, Product Rating) | PARTIAL | Date range and status filters present; product rating filter NOT_FOUND |
| AC3: Highlight mismatches | NOT_FOUND | No highlighting logic |
| AC4: Export CSV/Excel | NOT_FOUND | No export endpoint |
| BR1: Product Rating = numeric 1-6 | DONE | `proposal-service.ts:1082-1121` — code stored numerically |

#### FR-035: Product Risk Mismatch Report

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Same columns + Deviation Acknowledged + Date | PARTIAL | `proposal-service.ts:1044-1077` — `getRiskMismatchReport()` exists; sources from `proposalLineItems.risk_deviation_flagged` (spec requires `ProductRiskDeviation` table); missing deviation_acknowledged column |
| AC2: Summary stats at top (total, acknowledged %, unacknowledged count) | NOT_FOUND | No summary stats computed in report |
| BR1: Sources from ProductRiskDeviation table | PARTIAL | Uses proposalLineItems flag instead of productRiskDeviations table |

#### FR-036: Proposal Pipeline Dashboard

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Funnel chart DRAFT→SUBMITTED→…→ACCEPTED | PARTIAL | `proposal-service.ts:1011-1039` — pipeline data by status; no funnel visualization |
| AC2: Cards (Total, Avg time-to-accept, Conversion rate, Pending) | PARTIAL | `supervisor-dashboard-rp.tsx:357-415` — total and pending cards; avg time-to-accept and conversion rate NOT_FOUND |
| AC3: Filters (Date range, RM, Entity) | PARTIAL | `proposal-service.ts:36-43` — rmId, status filters; date range filter NOT implemented |
| AC4: Table view | DONE | `investment-proposals.tsx` — full proposal table |
| BR1: Conversion = CLIENT_ACCEPTED / SENT_TO_CLIENT × 100 | NOT_FOUND | Not computed |

#### FR-037: Risk Distribution Analytics

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Pie chart: % clients per risk category | PARTIAL | `supervisor-dashboard-rp.tsx:710-776` — bar chart shown (not pie chart per spec) |
| AC2: Bar chart by branch/entity | NOT_FOUND | No branch breakdown chart |
| AC3: Trend line over time | NOT_FOUND | No trend line |
| AC4: Filters (Entity, Branch, Date range) | NOT_FOUND | No filters on distribution widget |

---

### Module G: Compliance Hardening (Post-Review)

#### FR-038: Repeat Deviation Escalation

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Configurable threshold (default: 5 deviations in 30 days) | DONE | `risk-profiling-service.ts:1498-1532` — `checkRepeatDeviationThreshold()` with defaults |
| AC2: Create ComplianceEscalation record | DONE | `risk-profiling-service.ts:1534-1555` |
| AC3: Notification to Compliance Officer | NOT_FOUND | No notification dispatch in escalation creation |
| AC4: Compliance can Acknowledge/Flag/Restrict | DONE | `risk-profiling-service.ts:1832-1849` — `resolveEscalation()` with NOTED/FLAGGED_FOR_REVIEW/CLIENT_RESTRICTED |
| AC5: Status OPEN→ACKNOWLEDGED→RESOLVED | DONE | `schema.ts:5470-5484` — escalationStatusEnum |
| BR1: Threshold check on every new ProductRiskDeviation insert | NOT_FOUND | No automatic trigger; `checkRepeatDeviationThreshold()` not called on deviation insert; must be called manually |

#### FR-039: Risk Profiling Audit Log

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: Log created on assessment initiation | DONE | `risk-profiling-service.ts:1313-1326` — in `assessCustomerRiskProfile()` |
| AC2: Captures session_id, customer_id, initiated_by, initiated_at, device_type, user_agent, IP | DONE | `risk-profiling-service.ts:1313-1326` — all fields present |
| AC3: Updated on completion (completed_at, duration, outcome, risk_profile_id) | DONE | `risk-profiling-service.ts:1318-1320` |
| AC4: Client self-service captures client_id as initiator | NOT_FOUND | Client portal risk profiling not implemented (only RM-initiated) |
| AC5: Logs immutable, 7-year retention | PARTIAL | `schema.ts:5487-5502` — no UPDATE columns (write-only design); 7-year retention NOT enforced in code |
| BR1: Write-only; only Compliance/Audit roles can read | PARTIAL | No authorization middleware found on audit log read endpoints |

#### FR-040: Cascading Config Validation

| Item | Verdict | Evidence |
|------|---------|----------|
| AC1: On RiskAppetiteMapping auth: check AssetAllocationConfig per category (warning) | DONE | `risk-profiling-service.ts:1561-1677` — `validateCascadingConfig()` |
| AC2: On AssetAllocationConfig auth: check categories match active mapping | DONE | `risk-profiling-service.ts:1639-1645` |
| AC3: On Questionnaire auth: mandatory questions have ≥1 answer (blocker) | DONE | `risk-profiling-service.ts:1679-1720` |
| AC4: Warnings (non-blocking) vs blockers (question-option check) | PARTIAL | Issues array returned but no explicit BLOCKING vs WARNING classification in response |

---

### NFRs

| Item | Verdict | Evidence |
|------|---------|----------|
| SEC-1: httpOnly JWT cookie auth | DONE | `middleware/auth.ts:39-44` — `req.cookies['trustoms-access-token']` |
| SEC-2: Parameterized queries (no SQL injection) | DONE | `risk-profiling-service.ts:73` — Drizzle ORM with escaped ilike; all queries parameterized |
| SEC-3: RBAC on all endpoints | DONE | `role-auth.ts` — `requireBackOfficeRole()` on all RP/proposal mutations |
| SEC-4: OWASP input sanitization | PARTIAL | Wildcard escaping at line 73; no comprehensive input sanitization framework |
| API-1: Standardized `{error: {code, message}}` format | DONE | `role-auth.ts:45-52` — consistent error structure |
| API-2: Optimistic locking on versioned entities | DONE | `proposal-service.ts:250-254` — version check with 409 Conflict |
| API-3: API versioning at `/api/v1/` | DONE | All RP/proposal routes use `/api/v1/` prefix |

---

## Phase 3 — Test Coverage

| Category | Status |
|----------|--------|
| Automated e2e tests (RP-specific) | UNTESTED — no `tests/e2e/risk-*.spec.ts` file found |
| Test cases document | TC_ONLY — `docs/test-cases-risk-profiling-2026-04-22.md` (247 cases, doc only) |
| Score computation logic | INDIRECT — covered via service unit review |
| Proposal lifecycle | INDIRECT — covered via `tests/e2e/cross-office-integration.spec.ts` references |

**Overall test verdict: UNTESTED** for all 221 line items (no automated e2e tests; test case doc only)

---

## Phase 4 — Comprehensive Gap List

### Category A — Unimplemented (NOT_FOUND): 63 items

| ID | FR | Requirement | Priority | Size |
|----|-----|-------------|----------|------|
| G-001 | FR-001.BR1 | Edit/delete restricted to UNAUTHORIZED/MODIFIED only | P1 | S |
| G-002 | FR-002.AC8 | Toast text must be 'Record Modified Successfully' | P2 | XS |
| G-003 | FR-002.BR1 | Uniqueness constraint (category, type, overlapping dates) | P0 | M |
| G-004 | FR-004.BR1 | Cannot edit REJECTED questionnaires | P1 | S |
| G-005 | FR-005.AC2 | Delete button only for UNAUTHORIZED/MODIFIED | P1 | S |
| G-006 | FR-005.BR1 | Service blocks delete of AUTHORIZED questionnaires | P1 | S |
| G-007 | FR-006.AC4 | Rejection reason stored (mandatory field) | P1 | S |
| G-008 | FR-006.AC6 | Notification on questionnaire authorize/reject | P2 | M |
| G-009 | FR-007.AC3 | Score range overlap/gap validation | P1 | M |
| G-010 | FR-007.AC4 | Validate From < To; Score ≥ 0; no range gaps | P1 | S |
| G-011 | FR-007.BR1 | Auto-set scoring_type=NONE when is_multi_select=No | P1 | S |
| G-012 | FR-008.AC1 | Warning/Acknowledgement/Disclaimer as collapsible sections | P2 | S |
| G-013 | FR-008.AC2 | Rich text editor (not plain textarea) | P2 | M |
| G-014 | FR-010.BR2 | Bands must cover 0 to max possible score (exhaustiveness check) | P1 | S |
| G-015 | FR-011.AC3 | Notification on risk appetite mapping authorization | P2 | M |
| G-016 | FR-013.BR1 | Validate all 6 risk categories have allocation | P1 | S |
| G-017 | FR-013.BR2 | Asset classes must match product taxonomy | P2 | M |
| G-018 | FR-016.AC2 | 3 collapsible sections Part A/B/C in questionnaire | P1 | M |
| G-019 | FR-016.AC3 | First section auto-expanded | P2 | XS |
| G-020 | FR-018.AC3 | Interactive donut chart (has bar chart instead) | P1 | M |
| G-021 | FR-018.AC5 | Risk Profile Date + Expiry Date shown in UI review step | P1 | S |
| G-022 | FR-019.AC1 | Dialog asking "Do you agree?" Yes/No (has checkbox instead) | P2 | S |
| G-023 | FR-019.AC5 | Entity-configurable risk_deviation_enabled flag | P1 | M |
| G-024 | FR-020.AC2 | Supervisor can view full questionnaire responses | P1 | M |
| G-025 | FR-020.AC4 | Reject button + comments in supervisor approval | P1 | S |
| G-026 | FR-020.AC6 | Notification to RM on supervisor approval | P2 | M |
| G-027 | FR-021.AC1 | Product Rating Alert popup with exact text | P0 | M |
| G-028 | FR-021.AC2 | Alert shows customer risk profile + product table | P0 | S |
| G-029 | FR-021.AC3 | Alert footer disclaimer | P0 | S |
| G-030 | FR-021.AC4 | Cancel + 'Confirm Notified to Customer' buttons | P0 | S |
| G-031 | FR-021.BR1 | Alert in Client Portal product selection | P0 | L |
| G-032 | FR-022.AC1 | Risk Rating dropdown filter (High/Low/…) | P1 | M |
| G-033 | FR-022.AC2 | Multi-select checkboxes for filter | P1 | S |
| G-034 | FR-022.AC3 | Real-time product filtering by risk rating | P1 | S |
| G-035 | FR-022.AC4 | Clear filter option | P1 | XS |
| G-036 | FR-023.AC2 | Color-coded badge: 1-2=green, 3-4=amber, 5-6=red | P1 | S |
| G-037 | FR-023.AC3 | Tooltip 'Risk Rating: {code}' on hover | P2 | S |
| G-038 | FR-023.AC4 | Consistent display in Client Portal | P1 | S |
| G-039 | FR-025.AC3 | Bar chart: current vs model allocation | P2 | M |
| G-040 | FR-025.AC4 | Warning if >15% drift from model | P1 | S |
| G-041 | FR-025.AC5 | Reset to Model button | P2 | S |
| G-042 | FR-026.AC2 | Product type vs investment experience (Part B) matching | P1 | L |
| G-043 | FR-026.AC4 | Investment mandate alignment check | P2 | L |
| G-044 | FR-026.BR1 | BLOCKER prevents submission; WARNING allows with ack | P0 | M |
| G-045 | FR-027.AC3 | Notification: L1 approved → Compliance notified | P1 | M |
| G-046 | FR-027.AC7 | SLA 24h escalation notification | P2 | L |
| G-047 | FR-028.AC1 | Actual PDF content (logo, charts, disclaimers) | P1 | XL |
| G-048 | FR-028.AC2 | Configurable PDF template per entity | P2 | L |
| G-049 | FR-028.AC3 | Puppeteer / server-side PDF generation | P1 | XL |
| G-050 | FR-028.BR1 | PDF regeneration on modification + version archival | P2 | M |
| G-051 | FR-029.AC5 | Downstream order generation trigger on acceptance | P1 | L |
| G-052 | FR-030.AC3 | Performance tracking vs benchmark | P2 | L |
| G-053 | FR-030.AC4 | Drift alert implementation | P2 | M |
| G-054 | FR-030.BR1 | Maker-checker for model portfolio changes | P1 | M |
| G-055 | FR-031.AC1-4 | Proposal comparison (entire feature) | P2 | XL |
| G-056 | FR-033.AC1-4 | Risk Profiling Completion Report (entire feature) | P1 | L |
| G-057 | FR-034.AC3 | Highlight mismatches in product rating report | P1 | S |
| G-058 | FR-034.AC4 | Export CSV/Excel | P2 | M |
| G-059 | FR-035.AC2 | Summary stats (total mismatches, ack%) | P1 | S |
| G-060 | FR-035.BR1 | Source from ProductRiskDeviation table (not proposalLineItems) | P1 | S |
| G-061 | FR-036.BR1 | Conversion rate computation | P2 | S |
| G-062 | FR-037.AC2 | Risk distribution by branch/entity bar chart | P2 | M |
| G-063 | FR-037.AC3 | Risk category trend line over time | P2 | M |
| G-064 | FR-038.BR1 | Auto-trigger deviation threshold check on every insert | P0 | M |
| G-065 | FR-038.AC3 | Notification to Compliance Officer on escalation | P1 | M |

### Category B — Stubbed: 2 items

| ID | FR | Requirement | Priority | Size |
|----|-----|-------------|----------|------|
| G-066 | FR-028.AC1 | PDF generation (stub returns placeholder URL) | P1 | XL |
| G-067 | FR-039.AC5 | 7-year retention enforcement (design exists, not enforced) | P2 | M |

### Category C — Partially Implemented: 32 items

| ID | FR | What's Missing | Priority | Size |
|----|-----|----------------|----------|------|
| G-068 | FR-001.AC2 | Column sorting (filters present, sort missing) | P2 | S |
| G-069 | FR-001.AC3 | Page-size selector 10/25/50 (hardcoded 25) | P2 | S |
| G-070 | FR-001.AC4 | Badge colors: Unauthorized=grey not yellow | P3 | XS |
| G-071 | FR-002.AC3 | Start Date default = today (empty string) | P2 | XS |
| G-072 | FR-006.AC1 | Dedicated authorization queue (filter workaround only) | P2 | M |
| G-073 | FR-008.AC4 | Warning shown statically, not from questionnaire config | P2 | S |
| G-074 | FR-009.AC2 | Grid sorting and pagination controls | P2 | S |
| G-075 | FR-013.AC3 | Bar chart used instead of donut chart spec | P2 | S |
| G-076 | FR-015.AC2 | No explicit re-assess button when profile exists | P2 | S |
| G-077 | FR-015.AC4 | Step labels don't match spec (Edit Profile/Assess Risk/Transact) | P3 | XS |
| G-078 | FR-016.AC1 | Questionnaire auto-selection (manual dropdown present) | P1 | M |
| G-079 | FR-018.AC2 | Risk category color coding on profile display | P2 | S |
| G-080 | FR-019.AC1 | Yes/No dialog (checkbox used instead) | P2 | S |
| G-081 | FR-020.AC4 | Only Approve; no Reject + comments | P1 | S |
| G-082 | FR-021.BR1 | Risk deviation flag shown as icon, not popup | P0 | M |
| G-083 | FR-023.AC1 | No badge styling on risk code number | P2 | S |
| G-084 | FR-024.AC3 | Model portfolio not auto-populated in create dialog | P1 | M |
| G-085 | FR-024.AC4 | No product search/select within create dialog | P1 | M |
| G-086 | FR-025.AC1 | Inputs for weights present; sliders missing | P2 | S |
| G-087 | FR-026.AC6 | Check issues shown but no BLOCKER/WARNING labels | P1 | S |
| G-088 | FR-029.AC2 | No interactive charts in client portal detail | P2 | M |
| G-089 | FR-029.AC3 | Accept lacks e-signature + acknowledgement checkbox | P1 | M |
| G-090 | FR-029.AC6 | PDF URL present but no actual PDF binary | P1 | L |
| G-091 | FR-029.BR1 | expires_at set but no scheduled auto-expiry job | P1 | M |
| G-092 | FR-030.AC1 | Model portfolio entity exists; no back-office management UI | P1 | L |
| G-093 | FR-030.AC5 | Bulk refresh logic exists; no UI trigger | P2 | M |
| G-094 | FR-034.AC1 | RM Employee ID column missing | P2 | S |
| G-095 | FR-034.AC2 | Product Rating filter missing | P2 | S |
| G-096 | FR-036.AC2 | Avg time-to-accept and conversion rate cards missing | P2 | M |
| G-097 | FR-036.AC3 | Date range filter missing from pipeline report | P2 | S |
| G-098 | FR-039.BR1 | No authorization guard on audit log read endpoints | P1 | S |
| G-099 | FR-040.AC4 | Blocking vs warning not classified in validation response | P2 | S |

### Category D — Implemented but Untested: ALL 221 items

No automated e2e tests exist for the RP-PGM module. All 221 items classified as UNTESTED.

---

## Phase 5 — NFR Audit

| NFR | Status | Evidence / Gap |
|-----|--------|----------------|
| Performance: API <500ms for CRUD | UNKNOWN | No performance tests; architecture is stateless Node.js (favorable) |
| Performance: <2s for score computation | UNKNOWN | Computation is single-pass O(n) — likely compliant |
| Performance: 500 concurrent RMs | UNKNOWN | No load tests |
| Security: httpOnly JWT cookies | DONE | `middleware/auth.ts:39-44` |
| Security: RBAC on all endpoints | DONE | `requireBackOfficeRole()` on all RP/proposal routes |
| Security: Parameterized queries | DONE | Drizzle ORM |
| Security: OWASP Top 10 | PARTIAL | Wildcard escaping; no XSS sanitization middleware; no CSP headers checked |
| Security: Field-level PII encryption | NOT_FOUND | No field-level encryption found for customer_id, deviation_reason, or IP address in audit log |
| Scalability: Horizontal scaling | DONE | Stateless service design |
| Scalability: DB read replicas for reports | NOT_FOUND | No read replica routing |
| Accessibility: WCAG 2.1 AA | PARTIAL | htmlFor labels fixed; aria-labels on dialogs added; color contrast and keyboard nav not fully verified |
| Availability: 99.9% | UNKNOWN | Infrastructure not in scope of code audit |
| Data retention: 7-year audit logs | PARTIAL | Design correct; retention enforcement missing |
| Audit trail: Immutable records | DONE | Audit log entity is INSERT-only; CustomerRiskProfile immutable (new version on re-assess) |
| Multi-entity deployment | PARTIAL | entity_id on all configs DONE; entity-level feature flags (risk_deviation_enabled) NOT_FOUND |

---

## Phase 6 — Scorecard and Verdict

### Line-Item Coverage

```
LINE-ITEM COVERAGE
==================
Total auditable items:               221
  Acceptance Criteria (AC):          184
  Business Rules (BR):                30
  NFR items:                           7

Implementation Results:
  DONE:                               98  (44%)
  PARTIAL:                            49  (22%)
  NOT_FOUND:                          63  (29%)
  STUB:                                2  ( 1%)
  DEFERRED (excl. from calc):          3

Implementation Rate (DONE+PARTIAL):   147 / 214 = 69%
Test Coverage (automated):              0 / 221 =  0%
Test Coverage (doc only):             221 / 221 = 100% (TC_ONLY)

Total Gaps (non-DONE):               114
  P0 Gaps (Critical blockers):          6
  P1 Gaps (High priority):             44
  P2/P3 Gaps (Medium/Low):             64
```

### P0 Gaps (Blockers)

| Gap | FR | Description |
|-----|----|-------------|
| G-003 | FR-002.BR1 | No uniqueness constraint on (category, type, overlapping dates) — duplicate configs possible |
| G-027–030 | FR-021.AC1-4 | Product Rating Alert popup entirely missing — compliance requirement |
| G-031 | FR-021.BR1 | No alert in Client Portal for product risk deviations |
| G-044 | FR-026.BR1 | BLOCKER suitability failures don't prevent proposal submission |
| G-064 | FR-038.BR1 | Repeat deviation threshold check not triggered on insert — escalation only works if called manually |

### Top 10 Priority Actions

| # | Action | Impact | Effort | FRs Affected |
|---|--------|--------|--------|--------------|
| 1 | Implement Product Rating Alert popup with "Confirm Notified to Customer" (entire FR-021) | Regulatory compliance blocker | M | FR-021 |
| 2 | Add uniqueness constraint for questionnaire (category, type, overlapping dates) | Data integrity / P0 | M | FR-002.BR1 |
| 3 | Enforce BLOCKER suitability check prevents proposal submission | Compliance / P0 | S | FR-026.BR1 |
| 4 | Wire checkRepeatDeviationThreshold() to ProductRiskDeviation insert | Compliance auto-escalation / P0 | S | FR-038.BR1 |
| 5 | Add risk_deviation_enabled entity config flag + skip deviation step when false | Multi-entity support / P1 | M | FR-019.AC5 |
| 6 | Build Risk Profiling Completion Report (FR-033) | Missing entire report | L | FR-033 |
| 7 | Implement PDF generation (Puppeteer) for proposals | FR-028 deferred | XL | FR-028 |
| 8 | Add questionnaire selector auto-selection by customer_category + type + date | FR-016.AC1 manual workaround | M | FR-016 |
| 9 | Implement Part A/B/C collapsible sections in questionnaire wizard | UX spec compliance | M | FR-016.AC2-3 |
| 10 | Build Risk Rating Filter dropdown on product screens | Product screen feature | M | FR-022 |

---

## Aggregate Gate Scorecard

```
=== BRD COVERAGE GATE SCORECARD ===

Module A – Questionnaire Maintenance:
  ACs Covered:    22/35 DONE or PARTIAL  (63%)
  BRs Covered:     4/8  DONE or PARTIAL  (50%)
  P0 Gaps:         1 (uniqueness constraint)

Module B – Risk Appetite & Asset Allocation:
  ACs Covered:    13/15 DONE or PARTIAL  (87%)
  BRs Covered:     3/4  DONE or PARTIAL  (75%)
  P0 Gaps:         0

Module C – Customer Risk Assessment:
  ACs Covered:    26/35 DONE or PARTIAL  (74%)
  BRs Covered:     4/4  DONE             (100%)
  P0 Gaps:         0

Module D – Product Risk Deviation:
  ACs Covered:     3/13 DONE or PARTIAL  (23%)  ← CRITICAL GAP
  BRs Covered:     0/1  NOT_FOUND        (0%)
  P0 Gaps:         5 (entire alert popup missing + Client Portal missing)

Module E – Investment Proposals:
  ACs Covered:    30/46 DONE or PARTIAL  (65%)
  BRs Covered:     6/8  DONE or PARTIAL  (75%)
  P0 Gaps:         1 (BLOCKER suitability check)

Module F – Reporting & Analytics:
  ACs Covered:    13/26 DONE or PARTIAL  (50%)
  BRs Covered:     2/3  DONE or PARTIAL  (67%)
  P0 Gaps:         0

Module G – Compliance Hardening:
  ACs Covered:    12/14 DONE or PARTIAL  (86%)
  BRs Covered:     1/2  DONE or PARTIAL  (50%)
  P0 Gaps:         1 (auto-trigger on deviation insert)

NFRs:
  Coverage:        5/7  DONE             (71%)
  P0 Gaps:         0

=== CONSOLIDATED ===

Total Line Items:       221
Implementation Rate:    147 / 221 = 66%
Test Coverage:          0 automated; 221 TC_ONLY
Total Gaps:             114
  P0 (blockers):          6
  P1 (high):             44
  P2/P3 (medium/low):    64

Compliance Verdict:   ⚠️  AT-RISK
```

### Verdict Rationale

**AT-RISK** because:
1. Implementation rate 66% < 70% threshold
2. 6 P0 gaps present (> 3 allowed for GAPS-FOUND)
3. Module D (Product Risk Deviation) at 23% — entire compliance-critical alert mechanism missing
4. Zero automated tests (only test case documents)
5. FR-033 (Risk Profiling Completion Report) entirely unimplemented

---

## Unresolved Items Summary

| Category | Count | Notes |
|----------|-------|-------|
| NOT_FOUND (P0) | 6 | Must fix before production |
| NOT_FOUND (P1) | 38 | Fix in current sprint |
| NOT_FOUND (P2/P3) | 19 | Fix next sprint |
| PARTIAL (P0) | 1 | FR-021.BR1 — alert in Client Portal |
| PARTIAL (P1) | 18 | Various UX + suitability gaps |
| STUB | 2 | PDF generation (placeholder only) |
| DEFERRED | 3 | FR-041 (i18n), FR-042 (archival), audit retention enforcement |
| No automated tests | 221 | All line items untested via e2e |
