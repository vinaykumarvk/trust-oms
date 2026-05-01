# Metrobank Gaps — BRD Coverage Audit

**Audit date:** 2026-05-01  
**Source BRD:** `docs/Annex A_Business Requirements_Trust Portfolio Management System_RFP_v1.6.1-23Jun2017.xlsx`  
**Skill used:** `brd-coverage`  
**Codebase:** TrustOMS Philippines, branch `main`, commit `473ad54`  
**Verdict:** `GAPS-FOUND`

## Scope And Method

The workbook has one sheet, `page 1`, with 1,213 auditable requirement-like rows after excluding headings and blank rows. The audit treated each workbook row with requirement text as a line item and grouped findings by workbook section for remediation planning.

Priority profile:

| Priority | Count |
|---|---:|
| Must-have | 1,060 |
| Nice-to-have | 52 |
| Unspecified/header-like requirement rows | 101 |

Project context discovered:

| Area | Evidence |
|---|---|
| Stack | TypeScript monorepo, Express API, React apps, Drizzle ORM, PostgreSQL, Vitest. See `package.json`. |
| Backend layers | `server/routes`, `server/services`, `server/middleware` |
| Frontend layers | `apps/back-office`, `apps/front-office`, `apps/mid-office`, `apps/client-portal` |
| Shared schema | `packages/shared/src/schema.ts` |
| Tests | `tests/e2e`, `tests/security` |
| Git state | Dirty worktree with existing remediation changes; this audit does not treat uncommitted app code as a problem, but evidence is against the current working tree. |

## Coverage Scorecard

These counts are line-item-level classifications based on direct evidence searches. `DONE` means there is clear implementation evidence for the row's core requirement. `PARTIAL` means a related module/table/service exists but the exact Metrobank behavior is incomplete. `NOT_FOUND` means no concrete code evidence was found after keyword/entity/semantic searches.

| Workbook Section | Rows | DONE | PARTIAL | NOT_FOUND | Implementation Rate |
|---|---:|---:|---:|---:|---:|
| 1. General Requirements | 67 | 24 | 31 | 12 | 35.8% |
| 2. Interface & Job/Task Scheduler | 23 | 6 | 10 | 7 | 26.1% |
| 3. Client Management | 37 | 18 | 14 | 5 | 48.6% |
| 4. Trust Account Maintenance | 73 | 22 | 30 | 21 | 30.1% |
| 5. Portfolio Management | 89 | 31 | 38 | 20 | 34.8% |
| 6. Product Setup/Master Tables | 84 | 34 | 35 | 15 | 40.5% |
| 7. Compliance, Restrictions, Risk Management | 43 | 21 | 16 | 6 | 48.8% |
| 8. Security Management / Investment Instruments | 116 | 45 | 37 | 34 | 38.8% |
| 9. Transaction | 155 | 64 | 57 | 34 | 41.3% |
| 10. Settlements | 88 | 46 | 33 | 9 | 52.3% |
| 11. Document Management | 19 | 6 | 8 | 5 | 31.6% |
| 12. Provident Fund | 99 | 8 | 25 | 66 | 8.1% |
| 13. Other Fiduciary Services | 77 | 8 | 22 | 47 | 10.4% |
| 14. UITF | 66 | 28 | 26 | 12 | 42.4% |
| 15. Reports | 39 | 10 | 18 | 11 | 25.6% |
| 16. Accounting | 136 | 55 | 49 | 32 | 40.4% |
| 17. Others | 2 | 0 | 1 | 1 | 0.0% |
| **Total** | **1,213** | **426** | **450** | **337** | **35.1% full / 72.2% partial-or-better** |

## Confirmed Coverage Evidence

| BRD Area | Coverage Verdict | Evidence |
|---|---|---|
| Client/KYC foundation | `PARTIAL/DONE` | Clients, profiles, KYC, UBO, FATCA/CRS exist in `packages/shared/src/schema.ts:499`, `packages/shared/src/schema.ts:515`, `packages/shared/src/schema.ts:531`, `packages/shared/src/schema.ts:544`, `packages/shared/src/schema.ts:554`. |
| Portfolio and mandates | `PARTIAL/DONE` | Portfolio and mandate schemas exist at `packages/shared/src/schema.ts:567` and `packages/shared/src/schema.ts:582`. |
| Trust account foundation | `PARTIAL` | Trust accounts, holding accounts, security accounts, TSA/CSA settlement accounts, mandates, related parties and events exist at `packages/shared/src/schema.ts:601`, `packages/shared/src/schema.ts:630`, `packages/shared/src/schema.ts:651`, `packages/shared/src/schema.ts:671`, `packages/shared/src/schema.ts:695`, `packages/shared/src/schema.ts:717`, `packages/shared/src/schema.ts:742`. Default foundation creation creates portfolio, trust account, holding accounts, security account and TSA/CSA at `server/services/trust-account-foundation-service.ts:140`, `server/services/trust-account-foundation-service.ts:157`, `server/services/trust-account-foundation-service.ts:172`, `server/services/trust-account-foundation-service.ts:191`, `server/services/trust-account-foundation-service.ts:218`, `server/services/trust-account-foundation-service.ts:230`. |
| Order lifecycle | `DONE/PARTIAL` | Orders include type, side, security, quantity, currency, value date, authorization tier, future trade, disposal method, FX fields and backdating fields at `packages/shared/src/schema.ts:813`. Creation and TRN generation are in `server/services/order-service.ts:8` and `server/services/order-service.ts:23`; submission/edit restrictions are at `server/services/order-service.ts:66` and `server/services/order-service.ts:129`. |
| Maker-checker and approval workflow | `DONE/PARTIAL` | Tiered approval thresholds and approval request lifecycle are implemented in `server/services/maker-checker.ts:1`, `server/services/maker-checker.ts:54`, `server/services/maker-checker.ts:117`, `server/services/maker-checker.ts:215`, `packages/shared/src/schema.ts:1820`, `packages/shared/src/schema.ts:1831`. |
| Settlement lifecycle | `PARTIAL/DONE` | Settlement instructions and DVP/RVP lifecycle events exist at `packages/shared/src/schema.ts:913` and `packages/shared/src/schema.ts:933`. Settlement initialization, SSI resolution, lifecycle evidence and matching are in `server/services/settlement-service.ts:37`, `server/services/settlement-service.ts:84`, `server/services/settlement-service.ts:124`, `server/services/settlement-service.ts:262`, `server/services/settlement-service.ts:311`. |
| Settlement reports, bulk settlement, netting | `PARTIAL` | Bulk settle and netting exist at `server/services/settlement-service.ts:1027` and `server/services/settlement-service.ts:1110`. |
| Cash ledger and transactions | `DONE/PARTIAL` | Cash ledger and cash transaction schemas exist at `packages/shared/src/schema.ts:975` and `packages/shared/src/schema.ts:986`. |
| Transfers and SWIFT evidence | `PARTIAL` | Transfers and external transfer message evidence exist at `packages/shared/src/schema.ts:1558` and `packages/shared/src/schema.ts:1569`. |
| Contributions and withdrawals | `DONE/PARTIAL` | Contribution and withdrawal tables exist at `packages/shared/src/schema.ts:1600` and `packages/shared/src/schema.ts:1611`; withdrawal tax calculation writes schedule evidence through `tax_events.calculation_payload` at `packages/shared/src/schema.ts:1502`. |
| Fees and tax | `PARTIAL` | Fee schedules and tax events exist at `packages/shared/src/schema.ts:1104` and `packages/shared/src/schema.ts:1502`; settlement amount calculation with taxes/fees is implemented in `server/services/settlement-service.ts:985`. |
| Uploads and import/export | `PARTIAL` | Upload batches exist at `packages/shared/src/schema.ts:1540`; generic bulk upload supports parse/export at `server/services/bulk-upload-service.ts:509` and `server/services/bulk-upload-service.ts:568`. |
| Audit trail | `DONE/PARTIAL` | Hash-chain capable audit records exist at `packages/shared/src/schema.ts:1748`; PII masking is tested in `tests/e2e/audit-trail.spec.ts`. |
| Dynamic master data / UDF-like field config | `PARTIAL` | Entity registry, field config and cross-validations exist at `packages/shared/src/schema.ts:1776`, `packages/shared/src/schema.ts:1789`, `packages/shared/src/schema.ts:1810`. |
| Reference data | `DONE/PARTIAL` | Countries, currencies, asset classes, branches, exchanges, trust product types, fee types and tax codes exist at `packages/shared/src/schema.ts:1853`, `packages/shared/src/schema.ts:1861`, `packages/shared/src/schema.ts:1870`, `packages/shared/src/schema.ts:1878`, `packages/shared/src/schema.ts:1887`, `packages/shared/src/schema.ts:1896`, `packages/shared/src/schema.ts:1904`, `packages/shared/src/schema.ts:1913`. |
| Scheduled plans and PERA | `PARTIAL` | Scheduled plans and PERA account/transaction schemas exist at `packages/shared/src/schema.ts:1954`, `packages/shared/src/schema.ts:1973`, `packages/shared/src/schema.ts:1987`. |
| Reporting UI | `PARTIAL` | Back-office has Reports and Report Builder routes at `apps/back-office/src/routes/index.tsx:1323` and `apps/back-office/src/routes/index.tsx:1332`; CSV client-side export is visible in `apps/back-office/src/pages/report-builder.tsx:275` and `apps/back-office/src/pages/reports.tsx:297`. |
| Client portal | `PARTIAL` | Client portal routes for dashboard, portfolio, statements, risk profile, service requests and messages exist at `apps/client-portal/src/routes/index.tsx:17`, `apps/client-portal/src/routes/index.tsx:91`, `apps/client-portal/src/routes/index.tsx:151`, `apps/client-portal/src/routes/index.tsx:171`. |

## Major Gap Register

### A. P0/P1 Functional Gaps

| Gap ID | Workbook Rows | Area | Verdict | Gap | Size | Evidence / Notes |
|---|---:|---|---|---|---|---|
| MB-GAP-001 | 5-6, 1159 | General/NFR | `PARTIAL` | No hard evidence for unlimited concurrent users, no hanging/blocking during reports, report-generation isolation, or load-tested performance targets. | L | Some performance tests exist under `tests/performance`, but no BRD-specific SLA proof for these rows. |
| MB-GAP-002 | 8-14 | User admin / active transaction validation | `PARTIAL` | User add/modify/access exists conceptually, but no direct evidence that user deletion/branch reassignment is blocked when authorizer/inputter has pending transactions, or that inputter is blocked when no active authorizer exists. | M | Users/roles/sessions exist in schema, but no concrete guard found for these row-specific validations. |
| MB-GAP-003 | 21-36, 1139-1140 | UDF and report writer | `PARTIAL` | UDF-like entity field config exists, but there is no full business-user UDF lifecycle across all listed tables and no confirmed use of UDFs inside report formulas/calculations. | L | `entity_field_config` supports field metadata, but not the full UDF/report-writer integration requested. |
| MB-GAP-004 | 78-95, 604-606, 824-830 | External interfaces | `PARTIAL` | CASA, RM system, AMLA, Customer Insight, Datawarehouse, Trust GL to Bank GL, Private Banking, Metrobank Direct, Online UITF, pricing vendors, custodian, loan system, eBIR, BSP PERA contributors and real-time CASA balance validation are mostly not production integrations. | XL | App has adapter/stub-style services and some SWIFT/PhilPaSS evidence, but no production Metrobank interface contracts found. |
| MB-GAP-005 | 96-103, 1149-1151 | Scheduler | `PARTIAL` | Generic schedulers exist, but no complete row-specific scheduler for coupon/maturity posting, report scheduling by all accounts/portfolio officer/selective accounts, standing payment, backup/reindex, target path/filename and email dispatch. | L | There are scheduler tests and jobs, but not complete Metrobank schedule semantics. |
| MB-GAP-006 | 151-187 | Trust account build-up | `PARTIAL` | New trust account foundation covers core account/portfolio/TSA/CSA creation, but many Metrobank account fields are missing or not first-class: sales officer, account officer, portfolio manager, referring unit, TBG division, SA no/name, mailing instructions, statement frequency, AMLA type, discretion flag, tax status and escrow contract expiry. | L | Core foundation evidence exists, but row-level account metadata is incomplete. |
| MB-GAP-007 | 188-193 | Joint accounts / relationships | `PARTIAL` | Related parties exist, but no confirmed joint-account setup workflow, max joint holder parameter, co-trustor/beneficiary classification rules, or relationship graph. | M | `trust_related_parties` can hold relationship data but does not fully implement joint-account rules. |
| MB-GAP-008 | 198-202 | Special instructions | `NOT_FOUND` | No complete special instruction trigger/prompt workflow, birthday/event notifications, or escrow contract-expiry monitor tied to trust accounts. | M | CRM special dates exist for leads, but not trust account special instructions. |
| MB-GAP-009 | 203-217 | Account status, dormant, hold-out/garnishment | `PARTIAL` | Account status exists, but no complete validation for closing accounts with holdings/accruals, dormant automation, hold-out/garnishment multi-tagging, lifting approval, full metadata and history. | L | Some hold-out concepts appear in tests/services, but no complete trust-account hold-out lifecycle. |
| MB-GAP-010 | 223-230, 719 | Trust fee schedule monitoring | `PARTIAL` | Fee schedules exist, but account-level TF schedule/floor fee linkage, AUM deviation alerts, deferred fee collection, long-outstanding uncollected fee monitoring and collection cycles are incomplete. | L | TrustFees Pro modules exist but not all Metrobank account-level monitoring rows are covered. |
| MB-GAP-011 | 262-326, 1309-1320 | Performance measurement / ROI attribution | `PARTIAL` | Risk analytics and report exports exist, but ROI calculations across TA, portfolio, client, security, asset class, fund manager and GIPS/time-weighted methods are not fully implemented. | L | Portfolio risk analytics exists; full attribution/ROI engine is incomplete. |
| MB-GAP-012 | 375-416, 719, 1092-1094 | Fees/tax policies and penalty schedules | `PARTIAL` | Some withdrawal penalty/WHT and fee schedule evidence exists, but full product-specific fee/tax maintenance, overrides, approval-based waivers and UITF front/back-end fee processing are incomplete. | L | Withdrawal schedule evidence and fee modules help, but not full matrix. |
| MB-GAP-013 | 428-465, 593, 610-613, 720-727, 1096-1102 | Restrictions and validations | `PARTIAL` | Pre-trade/compliance rules exist, but the workbook requires broad product/security/transaction/account restrictions including nationality, US indicia, residency, min principal by regulation, document deficiency, holdout, and waiver of suitability. Coverage is uneven. | L | Compliance/risk services exist but not complete row-by-row restriction catalog. |
| MB-GAP-014 | 470-557, 738-739 | Security master / non-financial assets | `PARTIAL` | Security master supports broad securities, but many instrument-specific fields/behaviors are absent or partial: callable/putable structures, T-bills/FXTN/RTBs/ROPs, deposits, properties, TCT/CCT, loans as investments, life insurance policies and safekeeping assets. | XL | Securities and positions exist, but exotic instrument lifecycle and non-financial asset workflows are limited. |
| MB-GAP-015 | 602-603, 763-764, 1076-1078, 1122 | Standing payment / regular subscription plans | `PARTIAL` | Scheduled plans exist, but standing payment instructions with banking-day rules, hold/cancel on closure, RSP change restrictions and automated time-based client-initiated subscriptions are incomplete. | L | `scheduled_plans` provides foundation only. |
| MB-GAP-016 | 604-606, 825 | CASA balance/account validation | `NOT_FOUND` | No production real-time CASA interface for account name, settlement account available balance, or debit sufficiency validation. | XL | Cash ledger is internal, not CASA integration. |
| MB-GAP-017 | 607, 718, 724-726, 1099-1102 | Withdrawal disposition | `PARTIAL` | Withdrawal services exist, but automatic income-then-principal application, manual override, holdout/document-deficiency disposition rules and remarks are incomplete. | M | Withdrawal service handles cash debit and tax, not full disposition engine. |
| MB-GAP-018 | 609, 771, 794-795 | Inter-account transfers and settlement netting | `PARTIAL` | 1-to-1 transfers and settlement netting exist, but richer one-to-many/many-to-many transfer balancing and full counterparty/day settlement consolidation rules remain incomplete. | L | Transfer and netting services exist but are not full transfer matrix. |
| MB-GAP-019 | 615-696, 765-797 | Trade transactions and corporate actions | `PARTIAL` | Orders/trades/corporate actions exist, but full lifecycle coverage for every listed fixed income/equity/deposit/derivative trade, corporate action retrieval from market data, stock rights, tender offers, conversions, mergers, voluntary elections and exception procedures is incomplete. | XL | Corporate action module exists but production feed/election/reconciliation gaps remain. |
| MB-GAP-020 | 806-831, 838-850 | Settlement modes and pre-numbered forms | `PARTIAL` | PhilPass/SWIFT concepts exist, but check inventory/printing, SRT/provisional receipt inventory, PDDTS, pre-numbered forms, reprint approvals and start/end number printing are not implemented. | L | Settlement service is cash-ledger/SWIFT/PhilPaSS oriented, not check/SRT media management. |
| MB-GAP-021 | 832-837 | Reconciliation | `PARTIAL` | Reconciliation tables/services exist elsewhere, but automated holdings/trade reconciliation against custodians/registries/SOA in PDF/Excel/different formats and PERA custodian cash balance report import are incomplete. | L | Recon foundation exists but not all import formats and exception workflows. |
| MB-GAP-022 | 852-870 | Document management | `PARTIAL` | Document deficiencies exist, but product/transaction checklist setup, mandatory/optional document rules, document access rights, deficiency approval, original-copy tagging, aging reports, DMS integration, branch deficiency files and secure PERA document downloads are incomplete. | L | `document_deficiencies` exists; full DMS workflow not complete. |
| MB-GAP-023 | 872-955 | Provident Fund | `NOT_FOUND/PARTIAL` | Provident fund is largely missing: fund/member setup, multi-employer portability, vesting, credited service, forfeitures, benefit taxability, defined benefit/hybrid plans, member transfer/merge/status, loans, amortization and separation benefit processing. | XL | Only generic `EMPLOYEE_BENEFIT` product type and isolated EIP employee helper traces were found. No Provident Fund module. |
| MB-GAP-024 | 979-993 | Stock transfer | `NOT_FOUND` | Issuer/stockholder registry, stock certificate issuance/cancellation, authorized share validation, certificate inventory/printing/status/replacement and deceased stockholding monitoring are not implemented as a module. | XL | No stock transfer service/table evidence. |
| MB-GAP-025 | 994-1021 | Stock-transfer corporate actions | `PARTIAL/NOT_FOUND` | Corporate action engine exists, but stockholder-facing check/certificate printing, proxy registration/vote tabulation, stockholder notices/transmittal monitoring, archiving/query-on-archive and report writer integration are incomplete. | XL | Existing corporate actions are portfolio/security oriented, not full transfer-agent operations. |
| MB-GAP-026 | 1022-1056 | Loan facility agency / MTI | `NOT_FOUND` | Borrower/lender maintenance, loan facility agency workflows, MPC issuance/monitoring, collateral setup/sufficiency, collateral document reminders, trust fee based on outstanding MPC/loan and nominal MPC values are missing. | XL | Only limited borrower-limit compliance helper was found, no loan agency/MTI module. |
| MB-GAP-027 | 1057-1060 | Life insurance trust | `NOT_FOUND` | Premium frequency/amount setup, premium monitoring and flat trust-fee computation for life insurance trusts are absent. | M | No dedicated life insurance trust service/table. |
| MB-GAP-028 | 1062-1128 | UITF and Online UITF | `PARTIAL` | Unit transactions, NAVPU and client portal exist, but complete UITF subscription/redemption/switching/cutoff/inter-branch rules, PTA/COT/TOF document generation, NAVPU notifications, online UITF enrollment and cross-currency switching are incomplete. | XL | Foundation exists but complete UITF transaction suite is not finished. |
| MB-GAP-029 | 1131-1170 | Reports/MIS | `PARTIAL` | Report pages/export exist, but complete standard templates, custom report writer with font controls, Word export, automatic scheduler, target path, email/SMS delivery, report encryption, dispatch monitoring and access matrix are incomplete. | XL | CSV/PDF coverage exists in some modules; full enterprise reporting is not complete. |
| MB-GAP-030 | 1172-1186 | Chart of accounts | `PARTIAL` | GL schema exists, but complete 10-level configurable COA, multiple books for trustor/trustee/PFRS9, format sequencing and client-specific COA variants need completion. | L | GL tables exist but not all COA constraints/workflows. |
| MB-GAP-031 | 1187-1242 | Accounting transactions and valuations | `PARTIAL` | Journal posting/reversal/accrual/MTM modules exist, but full investment accruals, trust fee/custody/audit accruals, premium/discount amortization methods, impairment, property revaluation/depreciation, ADB, accounting imports and full exception reports remain incomplete. | XL | GL foundation is strong but not all accounting rows are complete. |
| MB-GAP-032 | 1243-1308 | Accounting/regulatory/financial reports | `PARTIAL` | Trial balance, regulatory templates and financial statement generation are partial; BSP/BIR/SEC/Insurance Commission templates, GL/SL reconciliation during FS prep, dispatch receipt monitoring and multi-currency financial statement consolidation are incomplete. | XL | Regulatory report tests exist for selected reports, not full workbook scope. |
| MB-GAP-033 | 1330-1331 | Vendor support / implementation timeline | `OUT_OF_SCOPE` | Local vendor support and implementation timeline are procurement/project delivery requirements, not application features. | N/A | Should be answered outside codebase audit. |

### B. Implemented But Under-Tested / Evidence Gaps

| Gap ID | Area | Issue | Size |
|---|---|---|---|
| MB-TEST-001 | Trust Account Maintenance | New trust account foundation has source-level tests, but not full route/UI/browser tests for all account setup and mandate authority flows. | M |
| MB-TEST-002 | External interfaces | Most external interface behavior lacks contract tests with Metrobank-specific payloads, retries, dead-lettering and reconciliation. | L |
| MB-TEST-003 | Reports | Report generation and export are tested in selected modules, but not at workbook row level for scheduled reports, delivery, encryption and access matrix. | L |
| MB-TEST-004 | Provident Fund / Other Fiduciary | Missing modules naturally have no automated tests. | XL |
| MB-TEST-005 | NFRs | No conclusive automated evidence for concurrent user limits, non-blocking report generation, backup/reindex jobs or report-generation performance SLAs. | L |

## NFR And Constraint Audit

| NFR/Constraint | Verdict | Notes |
|---|---|---|
| Web-based application | `DONE` | Multiple React apps and Express backend exist. |
| Unlimited concurrent user access | `UNTESTED/PARTIAL` | No explicit capacity, concurrency, or load benchmark tied to row 5. |
| No hanging/blocking during reports/processing/table maintenance | `UNTESTED/PARTIAL` | No queue/report isolation proof tied to row 6 and row 1159. |
| Role-based access | `PARTIAL/DONE` | Role middleware and auth exist, but account/group-level segregation per portfolio officer/fund manager is incomplete. |
| Audit trail | `DONE/PARTIAL` | Audit schema and tests exist; coverage is uneven across all modules. |
| PII masking | `PARTIAL/DONE` | PII redaction exists in audit/report contexts, but not all report/export delivery paths are proven. |
| Report encryption/password protection | `NOT_FOUND/PARTIAL` | Some PDF/download flows exist, but auto-encryption/password protection for client reports is not proven. |
| External integration resilience | `PARTIAL` | Some adapter/circuit breaker patterns exist, but Metrobank-specific production interfaces are not complete. |
| Backup/reindex scheduler | `NOT_FOUND` | Row 103 asks for backup/reindex maintenance scheduling; no concrete implementation found. |

## Remediation Priority

1. **External Metrobank interfaces:** CASA, RM, AMLA, Datawarehouse, Bank GL, Metrobank Direct, Online UITF, pricing vendors, custodian, loan system, eBIR and BSP PERA. This is the largest P0/P1 gap cluster.
2. **Trust account enrichment:** add missing account metadata, joint accounts, special instructions, hold-out/garnishment, dormant/closure/reopen validation and account-level fee schedule monitoring.
3. **Provident Fund:** decide whether it is in scope. If yes, build a dedicated fund/member/benefit/loan module; the current app only has generic product-type coverage.
4. **Other fiduciary services:** stock transfer, loan facility agency, MTI and life insurance trust are mostly absent and should be separate domain modules.
5. **UITF transaction suite:** implement full subscription/redemption/switching/cutoff/PTA/COT/TOF/NAVPU-notification workflows.
6. **Enterprise reporting:** scheduled reports, standard templates, report writer, PDF/Excel/Word/CSV exports, report encryption, delivery/dispatch monitoring and access matrix.
7. **Accounting completeness:** finish multi-book COA, GL/SL reconciliation, valuation/accrual/amortization/impairment/property workflows and regulatory report templates.
8. **Document management:** checklist rules, mandatory/optional documents, DMS integration, original-copy tags, deficiency aging, branch notification files and secure downloads.
9. **NFR proof:** add load tests and operational evidence for concurrency, non-blocking reporting, background jobs and backup/reindex scheduling.

## Appendix A — Workbook Section Inventory

| Section | Auditable Rows |
|---|---:|
| 1.0 GENERAL REQUIREMENTS | 67 |
| 2.0 INTERFACE & JOB/TASK SCHEDULER | 23 |
| 3.0 CLIENT MANAGEMENT | 37 |
| 4.0 TRUST ACCOUNT MAINTENANCE | 73 |
| 5.0 PORTFOLIO MANAGEMENT | 89 |
| 6.0 PRODUCT SETUP/MASTER TABLES | 84 |
| 7.0 COMPLIANCE, RESTRICTIONS AND RISK MANAGEMENT | 43 |
| 8.0 SECURITY MANAGEMENT | 116 |
| 9.0 TRANSACTION | 155 |
| 10.0 SETTLEMENTS | 88 |
| 11.0 DOCUMENT MANAGEMENT | 19 |
| 12.0 PROVIDENT FUND | 99 |
| 13.0 OTHER FIDUCIARY SERVICES | 77 |
| 14.0 UITF | 66 |
| 15.0 REPORTS | 39 |
| 16.0 ACCOUNTING | 136 |
| 17.0 OTHERS | 2 |

## Appendix B — Automated Test Inventory

The repository currently has broad automated coverage under `tests/e2e` and `tests/security`; `rg` found 2,756 `describe`/`it` declarations. Important related suites include:

- `tests/e2e/trust-account-foundation.spec.ts`
- `tests/e2e/settlement-service.spec.ts`
- `tests/e2e/settlement-netting.spec.ts`
- `tests/e2e/transfer-cost-basis.spec.ts`
- `tests/e2e/withdrawal-service.spec.ts`
- `tests/e2e/withdrawal-penalty.spec.ts`
- `tests/e2e/contribution-tax-event.spec.ts`
- `tests/e2e/maker-checker.spec.ts`
- `tests/security/rbac-test.spec.ts`
- `tests/e2e/audit-trail.spec.ts`
- `tests/e2e/gl-posting-lifecycle.spec.ts`
- `tests/e2e/regulatory-reports.spec.ts`
- `tests/e2e/corporate-actions-lifecycle.spec.ts`
- `tests/e2e/risk-analytics.spec.ts`

These tests improve confidence in already-implemented foundation modules, but they do not close the missing Metrobank-specific modules and production interface gaps listed above.
