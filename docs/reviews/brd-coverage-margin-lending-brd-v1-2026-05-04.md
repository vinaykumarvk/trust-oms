# BRD Coverage Audit: Margin Lending BRD v1
## Date: 2026-05-04

## Compliance Verdict

**AT-RISK, with the partial-gap remediation pass completed on 2026-05-04.** The implementation now closes the previously identified PARTIAL Margin Lending gaps around maker-checker copy/error behavior, authorized rule/haircut lookup, RM/auditor access separation, facility read-only filtering, persisted portfolio-link use, credit-view drilldowns, asset-setting UI fields, margin-call process/action history, reports/CSV/totals, EOD idempotency/notification behavior, and simulation action semantics.

The verdict remains **AT-RISK** because the earlier audit also identified unimplemented requirements outside the partial-gap pass, especially branch context/switching, localized notifications, exposure and concentration breach logic, facility maturity/status enforcement, duplicate active-authorized portfolio-link guards, overlapping setting detection, source sync evidence, and transaction rollback semantics.

## Partial Gap Remediation Pass

| Area | Status | Evidence |
|---|---|---|
| Lifecycle copy and exact maker-checker error | CLOSED | `copyRecord()` and `/copy` lifecycle routes were added; self-approval now raises `MAKER_CHECKER_VIOLATION`; tests updated in `tests/e2e/margin-lending.spec.ts`. |
| Authorized rule, asset override, and FX haircut lookup | CLOSED | `loadAuthorizedRuleSets()` and `resolveAuthorizedRuleHierarchy()` now filter authorized/effective-dated attribute, scrip, asset, and haircut records for credit view, EOD LTV refresh, and simulation. |
| RM/auditor route and navigation entitlements | CLOSED | ML routes now separate read, maintenance, write, checker, operator, report, and audit roles; `INTERNAL_AUDITOR`/`AUDITOR` are read/report/audit-only; navigation item roles are filtered in `BackOfficeLayout`. |
| Facilities view filters and read-only import model | CLOSED | `/facilities` supports facility group/status/asset/sub-asset/currency filters; user write import moved to `/facilities/imports` behind operator roles. |
| Portfolio links and cross-pledge partials | CLOSED | Credit view and EOD load authorized portfolio links; ownership evidence is enforced at authorization; cross pledges check `SELL_OUT_LOCKED` and active sell-out cases. |
| Credit view and asset-setting UI partials | CLOSED | Workbench now exposes facility group, currency inputs, full asset-setting fields, and linked portfolio/holding drilldown tables. |
| Margin-call process/action history/closure evidence | CLOSED | Added on-demand `/margin-call-cases/process`, GET action history, and sell-out manual closure evidence validation. |
| Reports and CSV | CLOSED | Product Details includes attribute/scrip/asset levels; Facilities report includes market value, exposure, NCMV, margin amount, and status; margin-call reports include days overdue; CSV endpoint added. |
| EOD idempotency and source outage notification | CLOSED | EOD now checks existing job/date/type runs for replay, resolves authorized notice period references, refreshes LTV hierarchy, and emits an operations notification audit event for source outages. |
| Simulation add/delete/modify semantics | CLOSED | Simulation now applies asset/exposure action semantics when after metrics are omitted and resolves rule hierarchy as of business date. |

Latest verification:
- `npm run test:run -- tests/e2e/margin-lending.spec.ts`: PASS, 12 tests.
- `npm run build -w apps/back-office`: PASS.
- `npm run check`: blocked only by pre-existing `server/scripts/seed-demo-supplement.ts` unknown-type errors; no Margin Lending errors remained.

Note: the detailed traceability matrix and original gap table below are retained as the strict pre-remediation baseline. The remediation table in this section is the current status for the formerly PARTIAL gaps.

## Phase 0: Preflight

| Item | Result |
|---|---|
| BRD file | `docs/Margin-Lending-BRD-v1.md`, 56 KB |
| Source document | `docs/WQ_Margin Lending_V1.0_CCV.1.0.docx`; extracted text exists in `docs/extracted/` |
| FR count | 16 |
| Auditable line items | 122: 65 AC, 39 BR, 2 EC, 16 FH |
| Phase | Full audit |
| Tech stack | TypeScript, Express, Drizzle ORM, React/Vite, shadcn/Radix, Vitest |
| Source directories discovered | `server/routes`, `server/services`, `server/middleware`, `packages/shared/src`, `apps/back-office/src/pages`, `apps/back-office/src/routes`, `apps/back-office/src/config`, `drizzle` |
| Test directories discovered | `tests`, `tests/e2e` |
| Git state | Branch `main`, commit `c0b68c6`, dirty worktree with OEMS and Margin Lending work |

## Phase 1: Requirement Inventory

| Type | Count |
|---|---:|
| Acceptance Criteria | 65 |
| Business Rules | 39 |
| Edge Cases | 2 |
| Failure Handling | 16 |
| Total | 122 |

## Phase 2-3: Traceability Matrix

Legend:
- Implementation: `DONE`, `PARTIAL`, `NOT_FOUND`
- Test: `TESTED`, `INDIRECT`, `UNTESTED`
- Evidence labels are `CONFIRMED` where exact code exists and `GAP` where implementation is incomplete.

### FR-001 Common Record Lifecycle and Maker-Checker

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-001.AC-01 | DONE | INDIRECT | CONFIRMED: supported statuses in `server/services/margin-lending-service.ts:166`; schemas carry `record_status` such as `packages/shared/src/schema.ts:5407`. |
| FR-001.AC-02 | DONE | INDIRECT | CONFIRMED: create paths default saved records to `UNAUTHORIZED` via `recordStatus()` at `server/services/margin-lending-service.ts:166`; lifecycle routes at `server/routes/margin-lending.ts:55`. |
| FR-001.AC-03 | PARTIAL | UNTESTED | GAP: schemas have `record_status`, but credit view/EOD/simulation accept request payloads and do not filter authorized maintenance records at `server/services/margin-lending-service.ts:738`, `:894`, `:966`. |
| FR-001.AC-04 | DONE | TESTED | CONFIRMED: maker-checker guard at `server/services/margin-lending-service.ts:242`; exercised at `tests/e2e/margin-lending.spec.ts:117`. |
| FR-001.AC-05 | PARTIAL | INDIRECT | CONFIRMED for add/modify/delete/authorize/reject audit at `server/services/margin-lending-service.ts:320`, `:624`, `:649`, `:685`; GAP: no copy action is implemented. |
| FR-001.BR-01 | DONE | INDIRECT | CONFIRMED: authorized hard-delete blocked in `server/services/margin-lending-service.ts:685`. |
| FR-001.BR-02 | DONE | INDIRECT | CONFIRMED: rejected/non-authorized records can be updated and resubmitted through `updateRecord()` at `server/services/margin-lending-service.ts:649`. |
| FR-001.BR-03 | NOT_FOUND | UNTESTED | GAP: no copy route or copy service found. Searched: `copy`, `COPY`, `copied record`, `new business ID`. |
| FR-001.EC-01 | PARTIAL | TESTED | CONFIRMED self-approval blocked at `server/services/margin-lending-service.ts:242`; GAP: API error code is derived from `ForbiddenError`, not exact `MAKER_CHECKER_VIOLATION`, in `server/routes/margin-lending.ts:28`. |
| FR-001.FH-01 | NOT_FOUND | UNTESTED | GAP: no transaction wrapper around authorization status update and audit write in `server/services/margin-lending-service.ts:624`. Searched: `transaction`, `rollback`, `db.transaction`. |

### FR-002 Access, Branch, Language, and Entitlements

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-002.AC-01 | PARTIAL | INDIRECT | CONFIRMED API role guard at `server/routes/margin-lending.ts:10`; navigation route at `apps/back-office/src/config/navigation.ts:214`; GAP: UI navigation is not role-filtered for ML-specific entitlements. |
| FR-002.AC-02 | NOT_FOUND | UNTESTED | GAP: branch context is not captured in ML create/modify/authorize/audit payloads. Searched: `branch`, `branch_code`, `active branch`, `actor branch`. |
| FR-002.AC-03 | NOT_FOUND | UNTESTED | GAP: no ML branch switcher or branch context selector in `apps/back-office/src/pages/margin-lending-workbench.tsx`. Searched: `branch`, `switch branch`, `branchContext`. |
| FR-002.AC-04 | NOT_FOUND | UNTESTED | GAP: no ML notification localization or language preference logic. Searched: `language`, `locale`, `localized`, `notification`. |
| FR-002.BR-01 | PARTIAL | UNTESTED | GAP: relationship-manager roles are granted all ML routes at `server/routes/margin-lending.ts:10`, including maintenance and EOD. |
| FR-002.BR-02 | PARTIAL | UNTESTED | GAP: auditor role is not represented as read-only; it is absent from `requireMarginLendingRole()` at `server/routes/margin-lending.ts:10`. |
| FR-002.FH-01 | DONE | INDIRECT | CONFIRMED: ML routes are protected before handlers through `router.use(requireMarginLendingRole())` at `server/routes/margin-lending.ts:24`. |

### FR-003 Generic Maintenance

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-003.AC-01 | PARTIAL | INDIRECT | CONFIRMED add/view/modify/delete/authorize/reject through lifecycle routes at `server/routes/margin-lending.ts:55`; GAP: copy is not implemented. |
| FR-003.AC-02 | DONE | INDIRECT | CONFIRMED deposit-style sub-asset/currency fields in `packages/shared/src/schema.ts:5407` and form submission at `apps/back-office/src/pages/margin-lending-workbench.tsx:418`. |
| FR-003.AC-03 | DONE | INDIRECT | CONFIRMED fixed-income fields in `packages/shared/src/schema.ts:5407`; service maps these fields at `server/services/margin-lending-service.ts:353`. |
| FR-003.AC-04 | DONE | INDIRECT | CONFIRMED fund fields in `packages/shared/src/schema.ts:5407` and service mapping at `server/services/margin-lending-service.ts:353`. |
| FR-003.AC-05 | DONE | INDIRECT | CONFIRMED scrip settings schema at `packages/shared/src/schema.ts:5468`; service at `server/services/margin-lending-service.ts:418`. |
| FR-003.BR-01 | DONE | TESTED | CONFIRMED percentage validation through `assertPercent()` used by attribute and scrip creation at `server/services/margin-lending-service.ts:353`, `:418`; behavior covered by calculation tests at `tests/e2e/margin-lending.spec.ts:82`. |
| FR-003.BR-02 | DONE | TESTED | CONFIRMED threshold ordering at `server/services/margin-lending-service.ts:353`; calculation behavior covered at `tests/e2e/margin-lending.spec.ts:82`. |
| FR-003.BR-03 | NOT_FOUND | UNTESTED | GAP: no implemented rule hierarchy applies non-inherited scrip settings over attribute settings in calculations. Searched: `inheritance_flag`, `scrip`, `attribute`, `hierarchy`, `override`. |
| FR-003.BR-04 | NOT_FOUND | UNTESTED | GAP: no calculation path queries authorized/effective-dated settings. Searched: `record_status`, `AUTHORIZED`, `effective_from`, `businessDate`. |
| FR-003.EC-01 | NOT_FOUND | UNTESTED | GAP: no fallback from missing scrip setting to most specific attribute setting. Searched: `most specific`, `fallback`, `scrip setting`, `attribute setting`. |
| FR-003.FH-01 | NOT_FOUND | UNTESTED | GAP: no overlap detection or `OVERLAPPING_ML_SETTING` error. Searched: `OVERLAPPING_ML_SETTING`, `overlap`, `effective_to`, `unique`. |

### FR-004 Reference Maintenance

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-004.AC-01 | DONE | INDIRECT | CONFIRMED references schema at `packages/shared/src/schema.ts:5448`; route at `server/routes/margin-lending.ts:103`; service at `server/services/margin-lending-service.ts:394`. |
| FR-004.AC-02 | PARTIAL | UNTESTED | GAP: EOD computes notice due date from request `noticePeriodDays`, not authorized ML Reference records, at `server/services/margin-lending-service.ts:796`. |
| FR-004.AC-03 | NOT_FOUND | UNTESTED | GAP: concentration references are not retrieved by credit-view/report calculations. Searched: `ISSUER_CONCENTRATION`, `SECURITY_CONCENTRATION`, `reference_type`, `getCreditView`, `getReport`. |
| FR-004.BR-01 | DONE | INDIRECT | CONFIRMED unique type/code index in `drizzle/20260504_add_margin_lending.sql:428`; schema has `ux_ml_reference_type_code` at `packages/shared/src/schema.ts:5448`. |
| FR-004.BR-02 | DONE | INDIRECT | CONFIRMED notice value validation in `server/services/margin-lending-service.ts:394`. |
| FR-004.FH-01 | NOT_FOUND | UNTESTED | GAP: no `ML_REFERENCE_MISSING` handling or audit logging. Searched: `ML_REFERENCE_MISSING`, `reference missing`, `no silent default`. |

### FR-005 Exposure Maintenance

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-005.AC-01 | DONE | INDIRECT | CONFIRMED exposure lifecycle route at `server/routes/margin-lending.ts:119`; service at `server/services/margin-lending-service.ts:450`. |
| FR-005.AC-02 | DONE | INDIRECT | CONFIRMED fields in `packages/shared/src/schema.ts:5494` and `server/services/margin-lending-service.ts:450`. |
| FR-005.AC-03 | NOT_FOUND | UNTESTED | GAP: no threshold-warning calculation against exposure limits. Searched: `threshold_percent`, `threshold warning`, `exposure limit`, `breach`. |
| FR-005.AC-04 | NOT_FOUND | UNTESTED | GAP: credit view/report outputs do not include exposure-limit breach evidence. Searched: `breach evidence`, `threshold`, `exposureLimit`. |
| FR-005.BR-01 | DONE | INDIRECT | CONFIRMED amount validation at `server/services/margin-lending-service.ts:450`. |
| FR-005.BR-02 | DONE | INDIRECT | CONFIRMED threshold validation at `server/services/margin-lending-service.ts:450`. |
| FR-005.BR-03 | DONE | INDIRECT | CONFIRMED date-range helper used at `server/services/margin-lending-service.ts:450`. |
| FR-005.FH-01 | DONE | INDIRECT | CONFIRMED source outage marks EOD failed and no generated cases at `server/services/margin-lending-service.ts:894`. |

### FR-006 Cross Currency Haircut

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-006.AC-01 | DONE | INDIRECT | CONFIRMED lifecycle route at `server/routes/margin-lending.ts:127`; service at `server/services/margin-lending-service.ts:477`. |
| FR-006.AC-02 | DONE | INDIRECT | CONFIRMED schema fields at `packages/shared/src/schema.ts:5520`. |
| FR-006.AC-03 | DONE | TESTED | CONFIRMED calculation at `server/services/margin-lending-service.ts:252`; tested at `tests/e2e/margin-lending.spec.ts:66`. |
| FR-006.AC-04 | PARTIAL | TESTED | CONFIRMED credit view/simulation can apply a supplied haircut at `server/services/margin-lending-service.ts:738`, `:966`; GAP: no lookup of authorized haircut records. |
| FR-006.BR-01 | DONE | TESTED | CONFIRMED source/target block at `server/services/margin-lending-service.ts:252`; tested at `tests/e2e/margin-lending.spec.ts:66`. |
| FR-006.BR-02 | DONE | TESTED | CONFIRMED percent validation at `server/services/margin-lending-service.ts:252`; tested through `tests/e2e/margin-lending.spec.ts:66`. |
| FR-006.FH-01 | DONE | TESTED | CONFIRMED missing mismatch haircut error at `server/services/margin-lending-service.ts:744`; tested at `tests/e2e/margin-lending.spec.ts:124`. |

### FR-007 Facility Group

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-007.AC-01 | DONE | INDIRECT | CONFIRMED lifecycle route at `server/routes/margin-lending.ts:135`; service at `server/services/margin-lending-service.ts:504`. |
| FR-007.AC-02 | DONE | INDIRECT | CONFIRMED fields in `packages/shared/src/schema.ts:5541`; UI form at `apps/back-office/src/pages/margin-lending-workbench.tsx:481`. |
| FR-007.AC-03 | DONE | TESTED | CONFIRMED drawing power calculation at `server/services/margin-lending-service.ts:504`; durable path tested at `tests/e2e/margin-lending.spec.ts:137`. |
| FR-007.AC-04 | NOT_FOUND | UNTESTED | GAP: credit view does not inspect facility maturity/expired/suspended state. Searched: `maturity_date`, `expired`, `suspended`, `getCreditView`. |
| FR-007.BR-01 | DONE | TESTED | CONFIRMED limit validation at `server/services/margin-lending-service.ts:504`; tested via durable path at `tests/e2e/margin-lending.spec.ts:137`. |
| FR-007.BR-02 | DONE | INDIRECT | CONFIRMED date-range validation at `server/services/margin-lending-service.ts:504`. |
| FR-007.BR-03 | NOT_FOUND | UNTESTED | GAP: portfolio linking does not load facility group status or require authorized group at `server/services/margin-lending-service.ts:556`. |
| FR-007.FH-01 | NOT_FOUND | UNTESTED | GAP: expired maturity date does not block new portfolio links. Searched: `maturity_date`, `createPortfolioLink`, `expired`. |

### FR-008 Facility View

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-008.AC-01 | PARTIAL | INDIRECT | CONFIRMED list by group/status at `server/routes/margin-lending.ts:143`; GAP: asset class, sub-asset, and currency filters are not implemented. |
| FR-008.AC-02 | DONE | INDIRECT | CONFIRMED fields in `packages/shared/src/schema.ts:5566`. |
| FR-008.AC-03 | PARTIAL | UNTESTED | GAP: records are modeled as imported, but API exposes `POST /facilities` to users at `server/routes/margin-lending.ts:150`; no read-only enforcement. |
| FR-008.BR-01 | DONE | INDIRECT | CONFIRMED mandatory source-system validation in `server/services/margin-lending-service.ts:532`. |
| FR-008.BR-02 | NOT_FOUND | UNTESTED | GAP: inactive/expired facilities are not excluded from drawing-power aggregation because aggregation is not implemented. |
| FR-008.FH-01 | NOT_FOUND | UNTESTED | GAP: product-processor sync failure evidence is not implemented. Searched: `sync failure`, `product processor`, `integration error`, `PMX`. |

### FR-009 Portfolio Linking

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-009.AC-01 | DONE | INDIRECT | CONFIRMED lifecycle route at `server/routes/margin-lending.ts:155`; service at `server/services/margin-lending-service.ts:556`. |
| FR-009.AC-02 | NOT_FOUND | UNTESTED | GAP: UI does not show linked-to-selected, linked-to-other, unlinked, and linked-to-other-base groupings. Searched in `margin-lending-workbench.tsx` for those categories. |
| FR-009.AC-03 | PARTIAL | UNTESTED | CONFIRMED link persistence at `packages/shared/src/schema.ts:5588`; GAP: credit view/EOD use request payloads and do not query authorized links. |
| FR-009.BR-01 | NOT_FOUND | UNTESTED | GAP: no active-authorized duplicate portfolio-link guard or partial unique index. Searched: `portfolio_id`, `facility_group_id`, `unique`, `duplicate`. |
| FR-009.BR-02 | NOT_FOUND | UNTESTED | GAP: calculations do not filter authorized portfolio links. Searched: `record_status`, `AUTHORIZED`, `mlPortfolioLinks`, `getCreditView`, `runEod`. |
| FR-009.FH-01 | PARTIAL | UNTESTED | CONFIRMED missing ownership evidence error at `server/services/margin-lending-service.ts:564`; GAP: it blocks create, not authorization as specified. |

### FR-010 Portfolio Linking with Cross Pledge

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-010.AC-01 | DONE | INDIRECT | CONFIRMED cross-pledge uses portfolio-link lifecycle at `server/routes/margin-lending.ts:155`. |
| FR-010.AC-02 | DONE | INDIRECT | CONFIRMED fields in `packages/shared/src/schema.ts:5588`; UI captures cross pledge flag and pledgor base at `apps/back-office/src/pages/margin-lending-workbench.tsx:512`. |
| FR-010.AC-03 | PARTIAL | UNTESTED | CONFIRMED credit view can mark request-supplied cross-pledged portfolios at `server/services/margin-lending-service.ts:738`; GAP: it does not retrieve cross-pledge records. |
| FR-010.AC-04 | NOT_FOUND | UNTESTED | GAP: GCMV/NCMV calculations do not include authorized cross-pledge records. |
| FR-010.BR-01 | DONE | INDIRECT | CONFIRMED pledgor base validation at `server/services/margin-lending-service.ts:556`. |
| FR-010.BR-02 | NOT_FOUND | UNTESTED | GAP: cross-pledged portfolios are not queried/filtered by authorization status before use. |
| FR-010.FH-01 | PARTIAL | UNTESTED | CONFIRMED input-level `SELL_OUT_LOCKED` block at `server/services/margin-lending-service.ts:556`; GAP: no lookup against active sell-out cases. |

### FR-011 Credit View

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-011.AC-01 | PARTIAL | INDIRECT | CONFIRMED API accepts base/facility group at `server/services/margin-lending-service.ts:738`; GAP: UI does not render a credit-view facility group field. |
| FR-011.AC-02 | DONE | TESTED | CONFIRMED calculations at `server/services/margin-lending-service.ts:266`; tested at `tests/e2e/margin-lending.spec.ts:82`. |
| FR-011.AC-03 | DONE | TESTED | CONFIRMED status logic at `server/services/margin-lending-service.ts:266`; tested at `tests/e2e/margin-lending.spec.ts:82`. |
| FR-011.AC-04 | PARTIAL | UNTESTED | CONFIRMED response includes linked portfolios/holdings at `server/services/margin-lending-service.ts:738`; GAP: UI has no drill-down interaction. |
| FR-011.BR-01 | DONE | TESTED | CONFIRMED GCMV formula at `server/services/margin-lending-service.ts:266`; tested at `tests/e2e/margin-lending.spec.ts:82`. |
| FR-011.BR-02 | DONE | TESTED | CONFIRMED NCMV formula at `server/services/margin-lending-service.ts:266`; tested at `tests/e2e/margin-lending.spec.ts:82`. |
| FR-011.BR-03 | DONE | TESTED | CONFIRMED sell-out priority at `server/services/margin-lending-service.ts:266`; tested at `tests/e2e/margin-lending.spec.ts:82`. |
| FR-011.FH-01 | DONE | INDIRECT | CONFIRMED partial-source behavior at `server/services/margin-lending-service.ts:738`. |

### FR-012 Asset Settings

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-012.AC-01 | DONE | INDIRECT | CONFIRMED route at `server/routes/margin-lending.ts:163`; schema at `packages/shared/src/schema.ts:5612`. |
| FR-012.AC-02 | PARTIAL | INDIRECT | CONFIRMED service supports base/inherit/concentration/LTV fields at `server/services/margin-lending-service.ts:589`; GAP: UI only exposes a subset at `apps/back-office/src/pages/margin-lending-workbench.tsx:521`. |
| FR-012.AC-03 | NOT_FOUND | UNTESTED | GAP: non-inherited asset settings do not override scrip/attribute settings in credit/EOD/simulation calculations. |
| FR-012.BR-01 | NOT_FOUND | UNTESTED | GAP: if inherit flag is true, supplied override percentages are still persisted rather than ignored at `server/services/margin-lending-service.ts:589`. |
| FR-012.BR-02 | DONE | INDIRECT | CONFIRMED mandatory values when inheritance is false at `server/services/margin-lending-service.ts:589`. |
| FR-012.FH-01 | DONE | INDIRECT | CONFIRMED `ML_ASSET_SETTING_INVALID` error at `server/services/margin-lending-service.ts:595`. |

### FR-013 Margin Call Process

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-013.AC-01 | PARTIAL | TESTED | CONFIRMED EOD creates margin-call cases at `server/services/margin-lending-service.ts:894`; GAP: no separate on-demand margin-call process route. |
| FR-013.AC-02 | DONE | TESTED | CONFIRMED sell-out case generation in `server/services/margin-lending-service.ts:796`; EOD durable test at `tests/e2e/margin-lending.spec.ts:137`. |
| FR-013.AC-03 | PARTIAL | UNTESTED | CONFIRMED cases list route at `server/routes/margin-lending.ts:179`; GAP: no action-history list endpoint. |
| FR-013.AC-04 | DONE | INDIRECT | CONFIRMED case action types at `server/services/margin-lending-service.ts:835`; route at `server/routes/margin-lending.ts:186`. |
| FR-013.AC-05 | DONE | INDIRECT | CONFIRMED case decision route at `server/routes/margin-lending.ts:191`; service at `server/services/margin-lending-service.ts:875`. |
| FR-013.BR-01 | DONE | INDIRECT | CONFIRMED deferral validation at `server/services/margin-lending-service.ts:835`. |
| FR-013.BR-02 | DONE | INDIRECT | CONFIRMED manual-closure validation at `server/services/margin-lending-service.ts:835`. |
| FR-013.BR-03 | PARTIAL | UNTESTED | GAP: sell-out can be manually closed with remarks, but no structured closure evidence guard exists at `server/services/margin-lending-service.ts:875`. |
| FR-013.FH-01 | DONE | INDIRECT | CONFIRMED advice failure source payload with `ML_ADVICE_GENERATION_FAILED` at `server/services/margin-lending-service.ts:827`. |

### FR-014 Reports

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-014.AC-01 | PARTIAL | UNTESTED | GAP: `PRODUCT_DETAILS` report only returns attribute settings, not scrip and asset-setting levels, at `server/services/margin-lending-service.ts:1038`. |
| FR-014.AC-02 | DONE | INDIRECT | CONFIRMED audit trail report at `server/services/margin-lending-service.ts:1038`; audit event schema at `packages/shared/src/schema.ts:5735`. |
| FR-014.AC-03 | PARTIAL | UNTESTED | GAP: facilities report returns facility rows but lacks market value, NCMV, and margin amount required at `server/services/margin-lending-service.ts:1038`. |
| FR-014.AC-04 | PARTIAL | UNTESTED | GAP: margin-call reports include core values but not days overdue at `server/services/margin-lending-service.ts:1038`. |
| FR-014.AC-05 | PARTIAL | UNTESTED | GAP: report preview exposes `csvExportAvailable`, headers, timestamp, and rows, but no CSV file/export endpoint exists at `server/routes/margin-lending.ts:220`. |
| FR-014.BR-01 | PARTIAL | UNTESTED | GAP: report totals are not aggregated/reconciled back to credit-view calculation logic. |
| FR-014.BR-02 | DONE | INDIRECT | CONFIRMED generated timestamp and user in report response at `server/services/margin-lending-service.ts:1038`. |
| FR-014.FH-01 | DONE | INDIRECT | CONFIRMED report response includes headers and row count, enabling zero-row CSV output metadata at `server/services/margin-lending-service.ts:1038`. |

### FR-015 EOD Execution

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-015.AC-01 | DONE | TESTED | CONFIRMED EOD route at `server/routes/margin-lending.ts:206`; durable test at `tests/e2e/margin-lending.spec.ts:137`. |
| FR-015.AC-02 | PARTIAL | UNTESTED | GAP: LTV logic job sets a result flag but does not refresh authorized rule hierarchy at `server/services/margin-lending-service.ts:894`. |
| FR-015.AC-03 | DONE | TESTED | CONFIRMED margin-call status recalculation from snapshots at `server/services/margin-lending-service.ts:894`; test at `tests/e2e/margin-lending.spec.ts:137`. |
| FR-015.AC-04 | DONE | INDIRECT | CONFIRMED EOD run fields in `packages/shared/src/schema.ts:5696`; service result at `server/services/margin-lending-service.ts:894`. |
| FR-015.BR-01 | PARTIAL | UNTESTED | CONFIRMED unique idempotency index at `drizzle/20260504_add_margin_lending.sql:431`; GAP: service uses plain insert with no idempotent lookup/upsert handling. |
| FR-015.BR-02 | DONE | INDIRECT | CONFIRMED source outage returns failed run without generated cases at `server/services/margin-lending-service.ts:894`. |
| FR-015.FH-01 | PARTIAL | UNTESTED | GAP: source outage records result-payload notification text but does not emit a notification event at `server/services/margin-lending-service.ts:894`. |

### FR-016 Margin Simulation

| Item | Implementation | Test | Evidence |
|---|---|---|---|
| FR-016.AC-01 | DONE | TESTED | CONFIRMED customer-only validation at `server/services/margin-lending-service.ts:966`; test at `tests/e2e/margin-lending.spec.ts:176`. |
| FR-016.AC-02 | PARTIAL | UNTESTED | GAP: simulation accepts asset payload but does not apply asset/exposure add/delete/modify semantics; it calculates from supplied before/after metrics at `server/services/margin-lending-service.ts:966`. |
| FR-016.AC-03 | DONE | TESTED | CONFIRMED widgets in `comparisonPayload` at `server/services/margin-lending-service.ts:966`; tested at `tests/e2e/margin-lending.spec.ts:176`. |
| FR-016.AC-04 | DONE | TESTED | CONFIRMED before/after deltas at `server/services/margin-lending-service.ts:966`; tested at `tests/e2e/margin-lending.spec.ts:176`. |
| FR-016.AC-05 | DONE | TESTED | CONFIRMED grid, summary chart, and details chart data at `server/services/margin-lending-service.ts:966`; tested at `tests/e2e/margin-lending.spec.ts:176`. |
| FR-016.BR-01 | DONE | TESTED | CONFIRMED simulation writes only `mlSimulationRuns` and does not update live entities at `server/services/margin-lending-service.ts:966`; tested at `tests/e2e/margin-lending.spec.ts:176`. |
| FR-016.BR-02 | NOT_FOUND | UNTESTED | GAP: simulation does not query authorized rule hierarchy as of business date. Searched: `AUTHORIZED`, `effective_from`, `businessDate`, `rule hierarchy`, `runSimulation`. |
| FR-016.FH-01 | DONE | INDIRECT | CONFIRMED invalid before/after payload throws before insert at `server/services/margin-lending-service.ts:966`. |

## Phase 4: Comprehensive Gap List

| Gap ID | Requirement | Category | Priority | Size | Gap |
|---|---|---|---|---|---|
| ML-GAP-001 | FR-001.AC-03 | Partial | P0 | M | Calculations do not enforce authorized-only maintenance records. |
| ML-GAP-002 | FR-001.AC-05 | Partial | P1 | S | Copy action is missing from lifecycle/audit. |
| ML-GAP-003 | FR-001.BR-03 | Unimplemented | P1 | S | Copy record workflow missing. |
| ML-GAP-004 | FR-001.EC-01 | Partial | P1 | XS | Self-approval error code is not exact `MAKER_CHECKER_VIOLATION`. |
| ML-GAP-005 | FR-001.FH-01 | Unimplemented | P0 | M | Authorization is not transactionally rolled back with audit failure. |
| ML-GAP-006 | FR-002.AC-01 | Partial | P1 | S | UI/entitlement-level ML access filtering incomplete. |
| ML-GAP-007 | FR-002.AC-02 | Unimplemented | P1 | M | Branch context is not captured in ML actions/audit. |
| ML-GAP-008 | FR-002.AC-03 | Unimplemented | P2 | M | Branch switching is missing from ML UI/workflow. |
| ML-GAP-009 | FR-002.AC-04 | Unimplemented | P2 | M | Language preference/localized notification handling missing. |
| ML-GAP-010 | FR-002.BR-01 | Partial | P0 | S | Relationship-manager role can access global maintenance/EOD routes. |
| ML-GAP-011 | FR-002.BR-02 | Partial | P1 | S | Auditor read-only role behavior missing. |
| ML-GAP-012 | FR-003.AC-01 | Partial | P1 | S | Attribute-level copy missing. |
| ML-GAP-013 | FR-003.BR-03 | Unimplemented | P0 | L | Scrip/attribute hierarchy not applied in calculations. |
| ML-GAP-014 | FR-003.BR-04 | Unimplemented | P0 | L | Authorized/effective-dated settings not selected by business date. |
| ML-GAP-015 | FR-003.EC-01 | Unimplemented | P1 | M | Fallback from scrip to most-specific attribute setting missing. |
| ML-GAP-016 | FR-003.FH-01 | Unimplemented | P1 | M | Overlapping authorized setting rejection missing. |
| ML-GAP-017 | FR-004.AC-02 | Partial | P1 | M | Notice due date uses request value, not authorized reference. |
| ML-GAP-018 | FR-004.AC-03 | Unimplemented | P1 | M | Concentration references not used by credit/report calculations. |
| ML-GAP-019 | FR-004.FH-01 | Unimplemented | P1 | S | `ML_REFERENCE_MISSING` handling missing. |
| ML-GAP-020 | FR-005.AC-03 | Unimplemented | P0 | M | Exposure threshold warning calculation missing. |
| ML-GAP-021 | FR-005.AC-04 | Unimplemented | P1 | M | Exposure breach evidence missing in reports/credit view. |
| ML-GAP-022 | FR-006.AC-04 | Partial | P0 | M | Haircut can be supplied but is not looked up from authorized records. |
| ML-GAP-023 | FR-007.AC-04 | Unimplemented | P1 | M | Facility maturity does not drive expired/suspended credit-view behavior. |
| ML-GAP-024 | FR-007.BR-03 | Unimplemented | P0 | M | Portfolio links do not require authorized facility groups. |
| ML-GAP-025 | FR-007.FH-01 | Unimplemented | P1 | S | Expired facility groups can still accept links. |
| ML-GAP-026 | FR-008.AC-01 | Partial | P2 | S | Facility filters by asset/sub-asset/currency missing. |
| ML-GAP-027 | FR-008.AC-03 | Partial | P1 | S | Imported facilities are not read-only; `POST /facilities` is exposed. |
| ML-GAP-028 | FR-008.BR-02 | Unimplemented | P1 | M | Inactive/expired facilities are not excluded from drawing power. |
| ML-GAP-029 | FR-008.FH-01 | Unimplemented | P1 | M | Product-processor sync failure evidence missing. |
| ML-GAP-030 | FR-009.AC-02 | Unimplemented | P2 | M | Portfolio linking UI grouping categories missing. |
| ML-GAP-031 | FR-009.AC-03 | Partial | P0 | L | Persisted links are not used by credit/EOD calculations. |
| ML-GAP-032 | FR-009.BR-01 | Unimplemented | P1 | M | Duplicate active-authorized portfolio-link guard missing. |
| ML-GAP-033 | FR-009.BR-02 | Unimplemented | P0 | M | Authorized portfolio-link filtering missing from calculations. |
| ML-GAP-034 | FR-009.FH-01 | Partial | P1 | S | Ownership evidence blocks create, not authorization. |
| ML-GAP-035 | FR-010.AC-03 | Partial | P1 | M | Credit view identifies request-supplied cross pledges, not persisted records. |
| ML-GAP-036 | FR-010.AC-04 | Unimplemented | P0 | L | Authorized cross pledges are not included in GCMV/NCMV. |
| ML-GAP-037 | FR-010.BR-02 | Unimplemented | P0 | M | Cross-pledge authorization-before-use missing. |
| ML-GAP-038 | FR-010.FH-01 | Partial | P1 | M | Active sell-out pledge lock lookup missing. |
| ML-GAP-039 | FR-011.AC-01 | Partial | P2 | XS | UI does not expose facility-group selector in credit view form. |
| ML-GAP-040 | FR-011.AC-04 | Partial | P2 | M | Linked portfolio/holding drill-down UI missing. |
| ML-GAP-041 | FR-012.AC-02 | Partial | P2 | S | Asset-setting UI exposes only a subset of fields. |
| ML-GAP-042 | FR-012.AC-03 | Unimplemented | P0 | L | Asset settings do not override scrip/attribute settings in calculations. |
| ML-GAP-043 | FR-012.BR-01 | Unimplemented | P1 | S | Inherited asset settings do not ignore override percentages. |
| ML-GAP-044 | FR-013.AC-01 | Partial | P1 | M | On-demand margin-call process route missing. |
| ML-GAP-045 | FR-013.AC-03 | Partial | P1 | M | Margin-call action history list missing. |
| ML-GAP-046 | FR-013.BR-03 | Partial | P0 | M | Sell-out manual closure lacks structured closure evidence guard. |
| ML-GAP-047 | FR-014.AC-01 | Partial | P1 | M | Product Details report omits scrip and asset-setting levels. |
| ML-GAP-048 | FR-014.AC-03 | Partial | P1 | M | Facilities report omits market value, NCMV, and margin amount required. |
| ML-GAP-049 | FR-014.AC-04 | Partial | P1 | S | Margin-call reports omit days overdue. |
| ML-GAP-050 | FR-014.AC-05 | Partial | P1 | M | CSV export endpoint/file generation missing. |
| ML-GAP-051 | FR-014.BR-01 | Partial | P1 | M | Report totals are not reconciled to credit-view logic. |
| ML-GAP-052 | FR-015.AC-02 | Partial | P0 | L | LTV Logic EOD does not refresh authorized loanable-value hierarchy. |
| ML-GAP-053 | FR-015.BR-01 | Partial | P1 | S | EOD has DB uniqueness but no idempotent upsert/read behavior. |
| ML-GAP-054 | FR-015.FH-01 | Partial | P1 | M | Source outage does not emit an operations notification event. |
| ML-GAP-055 | FR-016.AC-02 | Partial | P1 | M | Simulation accepts asset payload but does not apply add/delete/modify semantics. |
| ML-GAP-056 | FR-016.BR-02 | Unimplemented | P0 | L | Simulation does not use authorized rule hierarchy as of business date. |

## Phase 5: NFR and Constraint Audit

| Area | Verdict | Evidence / Gap |
|---|---|---|
| Authentication and role guard | PARTIAL | API route guard exists at `server/routes/margin-lending.ts:10`, but role separation is too broad for RM/auditor requirements. |
| Maker-checker separation | PARTIAL | Same-user approval blocked at `server/services/margin-lending-service.ts:242`; exact error code and transactional rollback missing. |
| Auditability | PARTIAL | ML audit table exists at `packages/shared/src/schema.ts:5735`; branch context, copy audit, and full authorization rollback semantics missing. |
| Data model and migrations | DONE | ML tables in `packages/shared/src/schema.ts:5407`; SQL migration at `drizzle/20260504_add_margin_lending.sql:3`; rollback at `drizzle/20260504_add_margin_lending.rollback.sql:3`. |
| Performance | PARTIAL | Indexes exist, but no load test evidence for p95 credit-view target. |
| Accessibility/UI | PARTIAL | Uses shared UI primitives, but key screens lack some BRD controls/drilldowns. |
| Internationalization | NOT_FOUND | No ML localized notification/template behavior. |
| External integrations | PARTIAL | Source status and PMX references modeled, but live sync/error evidence incomplete. |

## Phase 6: Scorecard

| Metric | Count |
|---|---:|
| Total auditable line items | 122 |
| DONE | 66 |
| PARTIAL | 30 |
| NOT_FOUND | 26 |
| Acceptance Criteria DONE | 34 / 65 = 52.3% |
| Acceptance Criteria DONE or PARTIAL | 55 / 65 = 84.6% |
| Business Rules DONE | 24 / 39 = 61.5% |
| Business Rules DONE or PARTIAL | 29 / 39 = 74.4% |
| Edge Cases DONE or PARTIAL | 1 / 2 = 50.0% |
| Failure Handling DONE or PARTIAL | 11 / 16 = 68.8% |
| Implementation Rate (DONE + PARTIAL) | 96 / 122 = 78.7% |
| Total implementation gaps | 56 |
| P0 gaps | 14 |

## Top 10 Priority Actions

| Rank | Action | Gap IDs |
|---:|---|---|
| 1 | Implement authorized/effective-dated rule hierarchy across attribute, scrip, asset setting, haircut, portfolio link, and cross pledge records. | ML-GAP-001, 013, 014, 022, 031, 033, 036, 037, 042, 056 |
| 2 | Tighten role model by separating RM read/simulation access from operations maintenance/EOD and adding auditor read-only access. | ML-GAP-006, 010, 011 |
| 3 | Add transaction-safe maker-checker decisions with exact error codes and copy workflow. | ML-GAP-002, 003, 004, 005, 012 |
| 4 | Implement exposure/concentration threshold calculations and breach evidence in credit view and reports. | ML-GAP-018, 020, 021 |
| 5 | Use facility maturity/status and active facility rules in linking and drawing-power calculations. | ML-GAP-023, 024, 025, 028 |
| 6 | Complete portfolio linking and cross-pledge UI/DB usage, duplicate guards, and sell-out pledge lock checks. | ML-GAP-030, 032, 034, 035, 038 |
| 7 | Complete EOD LTV logic refresh, true idempotency behavior, and operations notification emission. | ML-GAP-052, 053, 054 |
| 8 | Complete reports and CSV export for all BRD report columns and totals. | ML-GAP-047, 048, 049, 050, 051 |
| 9 | Complete margin-call on-demand process, action history, and sell-out closure evidence. | ML-GAP-044, 045, 046 |
| 10 | Add simulation asset/exposure action semantics and expand automated test coverage for all gap closures. | ML-GAP-055 |

## Verification Run During Audit

| Command | Result |
|---|---|
| `npm run test:run -- tests/e2e/margin-lending.spec.ts` | Previously passing: 9 tests. |
| `npm run test:run -- tests/e2e/margin-lending.spec.ts tests/e2e/danamon-oems.spec.ts` | Previously passing: 24 tests. |
| `npm run build -w apps/back-office` | Previously passing. |
| `npm run check` | Known unrelated failure remains in `server/scripts/seed-demo-supplement.ts`; no Margin Lending-specific TypeScript failure was observed in prior check. |

## Quality Checklist

- Every FR in the BRD has a traceability section: yes.
- Every AC, BR, EC, and FH has its own row: yes.
- Every verdict has evidence or searched terms: yes.
- PARTIAL verdicts explain what is implemented and missing: yes.
- Gap list includes all non-DONE implementation items: yes.
- Gap sizes and priorities assigned: yes.
- Scorecard arithmetic reconciles to 122 line items: yes.
- Verdict follows skill criteria: yes, `AT-RISK`.
- Project structure auto-detected: yes.
