# Consolidated BRD Gap Remediation Register
**Date:** 2026-05-01  
**Skill:** `brd-coverage` consolidation  
**Scope:** latest BRD versions only; superseded drafts and generated helper artifacts excluded  
**Purpose:** one remediation-ready gap document covering all active BRDs.

## Method

Each latest BRD was matched to its latest available BRD coverage report or BRD-adjacent gap analysis. Existing `brd-coverage` artifacts were used as the detailed evidence record, then reconciled against the later consolidated closure plan and completed regression runs so remediated items are not treated as current gaps.

This file is the working remediation backlog. The individual source reports remain the evidence trail with requirement-by-requirement traceability, searched implementation paths, and raw verdicts.

## Active BRDs And Coverage Artifacts

| # | Latest BRD | Coverage / Gap Artifact Used | Source Verdict | Current Consolidation Note |
|---:|---|---|---|---|
| 1 | `docs/TrustOMS-Philippines-BRD-FINAL.md` | `docs/reviews/brd-coverage-trustoms-philippines-brd-final-2026-04-28.md` | GAPS-FOUND | Broad platform implementation is high, but tests, NFRs, and external banking/settlement integrations remain open. |
| 2 | `docs/GL-business_requirements_document.md` | `docs/reviews/brd-coverage-gl-business_requirements_document-2026-04-23.md` | GAPS-FOUND | GL accounting hardening and tests remain open. |
| 3 | `docs/BRD_CorporateActions_TRUST-CA-360_FINAL.md` | `docs/reviews/brd-coverage-brd-corporateactions-trust-ca-360-final-2026-04-21.md` | AT-RISK | Production feed, election, reconciliation, correction, privacy, and integration work remains open. |
| 4 | `docs/TrustFeesPro-BRD-v2-FINAL.docx` | `docs/reviews/brd-coverage-trustfeespro-brd-v2-final-2026-04-21.md` | GAPS-FOUND | Billing formulas, FX, invoices, DSAR/content packs, and accounting events remain open. |
| 5 | `docs/BRD-RiskProfiling-ProposalGeneration-v2.docx` | `docs/reviews/brd-coverage-brd-riskprofiling-proposalgeneration-v2-2026-04-23.md` | GAPS-FOUND | Risk deviation, supervisor review, proposal what-if, suitability blockers, and notification gaps remain open. |
| 6 | `docs/ServiceRequest_TaskManagement_BRD_v2_FINAL.docx` | `docs/reviews/brd-coverage-servicerequest-taskmanagement-brd-v2-final-2026-04-23.md`; closure plan evidence | AT-RISK | Earlier client-portal ownership and document upload controls were closed; SR sequence/history/reassignment/pagination gaps need re-verification. |
| 7 | `docs/Campaign_Management_BRD_v2_Final.docx` | `docs/reviews/brd-coverage-campaign-management-brd-v2-final-2026-04-25.md`; closure plan evidence | CONDITIONAL PASS | Many campaign lifecycle/upload/webhook gaps were closed; remaining gaps are mainly advanced reporting, dry-run completeness, and external gateway productionization. |
| 8 | `docs/LeadProspect_BRD_v2_FINAL.docx` | `docs/reviews/brd-coverage-leadprospect-brd-v2-final-2026-04-25.md`; closure plan evidence | GAPS-FOUND | Screening, consent, ownership, retention, and status alignment were closed; remaining gaps need refreshed coverage before implementation. |
| 9 | `docs/Calendar_CallReport_Management_BRD_v1.1_Addendum.docx` | `docs/reviews/brd-coverage-calendar-callreport-management-brd-2026-04-25.md`; closure plan evidence | GAPS-FOUND | No-show, expiry, branch-scoped approval, notifications, route/filter, timezone, and audit items were closed; opportunity schema, dashboards, attachments, and some UI/business-rule gaps remain. |
| 10 | `docs/Handover_Assignment_Management_BRD_v4_FINAL.docx` | `docs/reviews/brd-coverage-handover-assignment-management-brd-v4-final-2026-04-25.md` | GAPS-FOUND | HAM async processing, reporting, delegation, and notification hardening remain open. |
| 11 | `docs/TrustBanking_Hardening_BRD_v2_Final.docx` | `docs/gap-analysis-tb-hardening-2026-04-25.md`; `docs/feature-life-cycle-tb-hardening-2026-04-26.md` | Closure sprint completed; residuals remain | Hardening sprint closed tactical v2 items; foundational trust banking models, evidence workflows, integrations, and portal flows remain open. |
| 12 | `docs/CIM_BRD_Draft.docx` | `docs/reviews/brd-coverage-cim_brd_draft-2026-04-23.md` | GAPS-FOUND | Data stewardship, relationship intelligence, client/profile depth, workflow, UI, and tests remain open. |
| 13 | `docs/CRM_PAD_Final.docx` | `docs/reviews/brd-coverage-crm-pad-final-2026-04-22.md` | GAPS-FOUND | CRM PAD remains a large module gap set; overlapping campaign/lead/calendar fixes were reconciled separately above. |

## Recently Closed Since Older Coverage Reports

The following gap themes were present in older coverage artifacts but have later implementation and passing regression evidence in `docs/plan-consolidated-brd-gap-closure-2026-04-29.md`.

| Area | Closed / Reconciled Items |
|---|---|
| Client portal authorization | Portfolio ownership checks for allocations, performance, holdings, transactions, and service-request document upload. |
| Notification preferences | Persistent preferences, critical-notification enforcement, and DB-backed dispatch checks. |
| Upload validation | Bulk lead upload file validation, row validation, JSON-string upload replay, and CSV error-report generation. |
| Scheduler wiring | Import/config fixes, no-show meetings, opportunity expiry, campaign activation/completion, stale campaign handover cancellation, retention purge, late-filing alerts, and approval auto-unclaim. |
| Lead/prospect controls | Negative-list expiry filtering, create-path screening, prospect ownership/audit, automatic marketing consent, retention purge, criteria uniqueness, inverted operators, criteria preview, and canonical `RECOMMENDED_FOR_CLIENT` status. |
| Campaign controls | Active-list locks, unsubscribe/STOP intake, provider-neutral delivery webhook, scheduler lifecycle, interaction integrity, archived/completed response modification guard, and event invitation field validation. |
| Call report controls | Branch-scoped approval claims, workload cap, decision audit, filing-RM notifications, action-item branch checks, action-item update authorization, custom route ordering, meeting-reason filtering, dual reminders, approval notifications, actor propagation, opportunity conversation history, and RM-timezone business-day calculation. |
| Task controls | CRM task reassignment branch guard and authenticated actor context. |

## Consolidated Gap Register

| ID | Severity | Size | BRD Sources | Current Gap | Remediation Direction |
|---|---:|---:|---|---|---|
| CG-001 | P0 | XL | All major BRDs | Automated BRD-mapped regression coverage is still incomplete across platform, GL, Corporate Actions, TrustFeesPro, Risk, HAM, CIM, and CRM PAD. | Build requirement-tagged test suites per BRD area and refresh coverage reports after each remediation wave. |
| CG-002 | P0 | XL | TrustOMS, Corporate Actions, Campaign, Lead/Prospect, TrustFeesPro, Trust Banking | External integrations remain simulated, stubbed, or metadata-only: SWIFT/FIX, Finacle, BSP PERA-Sys, PSE/DTCC/ISO feeds, SendGrid/Twilio-style gateways, eFPS/tax, and banking rails. | Define typed adapter contracts with local fakes, contract tests, retry/dead-letter behavior, and production configuration hooks. |
| CG-003 | P0 | L | Service Requests, GL, HAM, TrustFeesPro, CIM/CRM PAD | Normalized audit/status history is uneven outside recently closed CRM paths. Several modules still lack before/after payloads, actor propagation, correlation IDs, and domain transition history. | Introduce shared audit/status-history helpers, migrate high-risk module transitions, and add route/service tests for actor attribution. |
| CG-004 | P0 | L | Service Requests, Calendar/Call Report, Lead/Prospect, Campaign, Trust Banking | File/document security remains partial: virus scanning, quarantine, secure document storage/download authorization, attachment limits, and downloadable validation packs are inconsistent. | Add document service controls, MIME/size policy, scan adapter, secure download guards, and per-module tests. |
| CG-005 | P1 | L | Calendar/Call Report, Campaign, Lead/Prospect, HAM, Trust Banking | Durable background processing is still incomplete as a platform capability even though several CRM jobs now exist. Larger batch/bulk workloads need queue persistence, idempotency, and monitoring. | Promote scheduler jobs into a durable job abstraction with retry, locking, execution audit, and operational metrics. |
| CG-006 | P1 | XL | Trust Banking, TrustOMS | First-class trust banking foundation is incomplete: trust accounts, holding accounts, security accounts, CIF/TSA/CSA structures, mandates, related parties, and conversion-account lifecycle. | Design schema and services for account foundation before building downstream settlement, statement, and portal evidence flows. |
| CG-007 | P1 | XL | TrustOMS, Trust Banking | Settlement, cash, contribution, withdrawal, and transfer workflows are partial: external trustee transfers, DVP/RVP lifecycle, auto-netting, cost-basis propagation, tax/penalty schedules, upload fan-out, and FX auto-conversion. | Implement state machines and accounting events behind adapter-friendly services with audit and regression tests. |
| CG-008 | P1 | L | TrustOMS | EIP/ERP/PERA and core banking integration surfaces are not productionized. | Add order generation, Finacle/PERA adapter boundaries, status reconciliation, and failure handling. |
| CG-009 | P1 | L | Risk Profiling, Trust Banking | Risk deviation and proposal workflows remain partial: deviation configuration/dialog, supervisor full-questionnaire view, rejection comments, product-risk alerts, filters, what-if charts, suitability blockers, mandate/experience checks, and disclosure evidence. | Complete risk/proposal UX plus server rules and add suitability regression tests. |
| CG-010 | P1 | XL | TrustFeesPro | Billing and fee operations remain incomplete: circuit breakers, cached FX fallback, notional accounting events, PDF invoices, ad-hoc maker-checker, FX reconciliation, product formulas, content packs, DSAR workflow, collection triggers, and report packs. | Close fee engine gaps in accounting-safe phases and generate invoice/report artifacts through tested services. |
| CG-011 | P1 | L | GL | GL hardening remains open: retry orchestration, fund equalization, impairment assessment, NAV rounding, min/max fee rules, MTM classification posting, NAVPU/interest/factsheet reports, and tests. | Add GL retry/event services, accounting rule tests, and dedicated report endpoints/exports. |
| CG-012 | P1 | XL | Corporate Actions | Corporate Actions productionization is incomplete: feed parsers/connectors, dynamic fields, amendments/corrections/replay, external reconciliation, election channels, tax authority integration, anomaly flags, degraded mode, and DSAR/privacy workflows. | Build feed/election/reconciliation adapters and operational correction workflows with contract and replay tests. |
| CG-013 | P1 | L | HAM, Trust Banking | HAM remaining gaps include async bulk processing, cross-branch routing verification, entity-master assignment updates, delegation expiry reversal, delegate constraints, email delivery adapter, rate limits, filters, and dedicated reports. | Implement HAM-specific job/reporting workflow and verify branch/delegation rules with tests. |
| CG-014 | P1 | L | Service Request v2 | SR v2 gaps need fresh verification after trust-banking hardening: database sequence IDs, SQL filtering/pagination, status history timeline, reassignment, auth user propagation, badges, and document display/upload. | Re-run SR traceability against current code, then close remaining service and portal deltas. |
| CG-015 | P1 | L | Calendar/Call Report | Remaining call-report/calendar gaps include opportunity schema/stage mismatch, expense/conveyance field mismatch, feedback source/sentiment, action-item completion history, attachment limits/scanning, supervisor dashboard widgets, exports, auto-save/draft uniqueness, and some calendar display/color rules. | Split into schema/business-rule work and UI/reporting work; preserve already closed scheduler/approval/notification behavior. |
| CG-016 | P1 | L | Campaign, Lead/Prospect, CRM PAD | CRM rule/reporting gaps remain after tactical fixes: complete rule dry-run parity, all BRD filter dimensions, advanced scorecards, PDF/Excel exports, manual dedupe workflow depth, and production email/SMS gateway semantics. | Refresh campaign/lead coverage and close only verified residuals to avoid duplicating recent fixes. |
| CG-017 | P1 | XL | Platform, TrustFeesPro, Lead/Prospect, Calendar/Call Report | NFR and security controls remain partial: real MFA/OIDC/mTLS, encryption/KMS integration, hash-chained audit, per-tier rate limits, OpenTelemetry/Prometheus/Grafana, DR/RPO/RTO evidence, Kafka/CloudEvents, and comprehensive WCAG/i18n verification. | Treat as platform hardening wave with config-driven controls and observable acceptance criteria. |
| CG-018 | P2 | L | CIM, CRM PAD, HAM, Calendar, Risk, Campaign | UI completion and accessibility remain uneven: supervisor dashboards, stewardship screens, RM/mobile/regulator views, filters, badges/tooltips, client portal message/statement flows, responsive behavior, and WCAG evidence. | Run module-by-module UI closure with screenshots/accessibility checks after backend gaps are stable. |
| CG-019 | P2 | L | Calendar, Campaign, HAM, GL, TrustFeesPro, Trust Banking | Reporting/export coverage is inconsistent: CSV/Excel/PDF exports, dashboard drill-downs, ageing reports, scorecards, regulatory packs, invoice packs, and history exports. | Standardize export/report helpers and add tests for filters, permissions, and generated content. |

## Remediation Progress

| Date | Gap | Status | Evidence |
|---|---|---|---|
| 2026-05-01 | CG-006 Trust Banking account foundation | PARTIAL | Added first-class schema and migration for trust accounts, holding accounts, security accounts, TSA/CSA settlement accounts, mandates, related parties, and foundation events. Added `trustAccountFoundationService.createDefaultFoundation()`, list/detail accessors, back-office `/trust-accounts` routes, and prospect-to-customer conversion creation of the default account stack. Verified with `tests/e2e/trust-account-foundation.spec.ts`, conversion lifecycle tests, full `npm run test:run`, and `npm run check`. Remaining CG-006 work: richer mandate/signatory workflows, onboarding UI, and downstream settlement/statement integration. |
| 2026-05-01 | CG-006 Mandate/signatory controls | PARTIAL | Added mandate authority validation for active mandate presence, required signatory count, related-party signer membership, authorized-signatory flag, action scope, and per-signatory signing limits. Exposed through back-office `POST /trust-accounts/:accountId/authority-check`. Remaining work: connect this authority check into settlement/cash movement approval paths and add UI affordances. |
| 2026-05-01 | CG-006 Settlement account integration | PARTIAL | Updated settlement SSI resolution to prefer default trust settlement accounts (`TSA`) for the order portfolio and currency before falling back to generic settlement account configs or hardcoded defaults. Remaining work: enforce mandate authority checks inside cash movement submission/approval and expose settlement-account setup in the UI. |
| 2026-05-01 | CG-006 Cash movement mandate enforcement | PARTIAL | Added portfolio-level mandate authority enforcement to withdrawal, contribution, and transfer approval paths. Back-office approval routes now accept `signerPartyIds`, and services reject approvals when the source portfolio has a trust account whose active mandate/signatory policy is not satisfied. Remaining work: UI signer selection and richer maker-checker evidence capture. |
| 2026-05-01 | CG-006 Mandate evidence capture | PARTIAL | Mandate authority checks now write trust foundation events for pass/fail decisions, including action, amount, provided signer IDs, valid signer IDs, related movement entity, signatory counts, and failure reasons. Withdrawal, contribution, and transfer approvals pass actor/entity context into this evidence trail. Remaining work: surface the evidence in UI/history views and align with central maker-checker dashboards. |
| 2026-05-01 | CG-006 Back-office account foundation UI | PARTIAL | Added a focused back-office Trust Accounts page under Master Data. It lists accounts by client, displays holding/security/TSA-CSA/mandate/related-party/event tabs, and provides an authority-check form for action, amount, and signer party IDs. Remaining work: inline signer picker from related parties and create/edit onboarding workflow screens. |
| 2026-05-01 | CG-006 Back-office onboarding/signature UI | PARTIAL | Extended the Trust Accounts page with a compact create-foundation form and replaced manual signer ID entry with checkbox selection from the account's authorized related parties. Remaining work: full edit workflow for existing mandates/related parties and central maker-checker dashboard integration. |
| 2026-05-01 | CG-007 External trustee transfer evidence | PARTIAL | Added `external_transfer_messages` schema/migration to persist SWIFT message metadata, generated payload, gateway status, custodian confirmation reference, portfolio/trust-account linkage, and confirmation actor/time. External transfer initiation now records dedicated SWIFT evidence, routes accept `signerPartyIds`, and confirmation updates the evidence row to `CONFIRMED`. Verified with source-level regression coverage in `tests/e2e/transfer-cost-basis.spec.ts`. Remaining CG-007 work: DVP/RVP state machine, auto-netting, tax/penalty schedules, upload fan-out, and FX auto-conversion. |
| 2026-05-01 | CG-007 DVP/RVP settlement lifecycle evidence | PARTIAL | Added `settlement_lifecycle_events` schema/migration and settlement-service lifecycle recording for initialization, SWIFT generation, PhilPaSS submission, cash ledger posting, Finacle posting, match, failure, retry, and settlement completion. Added `matchSettlement()` and `POST /api/v1/settlements/:id/match` so DVP/RVP delivery/payment-leg evidence can be captured before settlement. Verified with source-level regression coverage in `tests/e2e/settlement-service.spec.ts`. Remaining CG-007 work: richer matching engine/state guards, auto-netting, tax/penalty schedules, upload fan-out, and FX auto-conversion. |
| 2026-05-01 | CG-007 Auto-netting workflow | PARTIAL | Surfaced existing cross-portfolio settlement netting through `POST /api/v1/settlements/net-settle`, added actor propagation via `nettedBy`, and records lifecycle evidence for both `NET_SETTLEMENT_CREATED` and `SETTLEMENT_NETTED` events with original settlement IDs, counterparty, currency, value date, and net amount. Verified with source-level and service regression coverage in `tests/e2e/settlement-service.spec.ts`. Remaining CG-007 work: stronger state guards, tax/penalty schedules, upload fan-out, and FX auto-conversion. |
| 2026-05-01 | CG-007 FX auto-conversion for settlement cash posting | PARTIAL | Settlement cash posting now checks the portfolio base currency and, when the settlement currency differs, looks up FX through `fxRateService`, posts a converted base-currency cash leg through `cashLedgerService`, and stores FX rate, converted amount, stale-rate flag, ledger ID, and transaction ID in `CASH_LEDGER_POSTED` lifecycle evidence. Verified with source-level regression coverage in `tests/e2e/settlement-service.spec.ts`. Remaining CG-007 work: tax/penalty schedules, upload fan-out, and stronger exception handling around stale FX rates. |
| 2026-05-01 | CG-007 Withdrawal tax/penalty schedule evidence | PARTIAL | Withdrawal tax calculation now records the penalty/WHT schedule source, rates, amounts, total deductions, and net amount into `tax_events.calculation_payload` with migration support. This preserves the existing `systemConfig` schedule lookup and default schedule fallback while adding auditable tax evidence for withdrawal execution. Verified with source-level regression coverage in `tests/e2e/withdrawal-service.spec.ts`. Remaining CG-007 work: product-specific tax schedule maintenance UI, upload fan-out, and stronger stale-FX exception handling. |

## BRD-Specific Gap Themes

### 1. TrustOMS Philippines

Current open themes are external trustee transfers, sanctions vendor integration, ECL engine completion, unified settlement calculator, cross-portfolio netting, DVP/RVP lifecycle, tax/penalty schedule completion, upload fan-out, kill-switch MFA/FIX disconnect, ML fraud controls, FX conversion, EIP/ERP/PERA integrations, NFRs, and automated tests.

### 2. General Ledger

Current open themes are EOD retry orchestration, fund equalization, impairment assessment, NAV rounding, fee min/max and override flows, MTM classification posting, NAVPU/interest/factsheet reports, and broad GL regression coverage.

### 3. Corporate Actions

Current open themes are production feed parsers, event amendments/corrections/replay, dynamic CA fields, external reconciliation, election channels, tax filing integration, anomaly flags, degraded-mode persistence, DPA/DSAR/breach workflows, and integration tests.

### 4. TrustFeesPro

Current open themes are circuit breakers, cached FX fallback, notional accounting event emission, PDF invoice rendering, ad-hoc fee maker-checker, payment FX reconciliation, DSAR/content-pack implementation, product-specific formulas, collection triggers, report packs, and tests.

### 5. Risk Profiling And Proposal Generation

Current open themes are deviation Yes/No dialog and configuration, supervisor full-questionnaire review, rejection comments, notifications, product-risk popup, risk filters, proposal what-if visualization, suitability blockers, mandate/experience checks, and disclosure evidence.

### 6. Service Request And Task Management

Closed items include client portal ownership enforcement and service-request document upload ownership. Current suspected residuals are sequence-based SR IDs, SQL-side filtering/pagination, status history and timeline UI, reassignment workflow, authenticated actor propagation, portal badges, and document UI. These should be re-verified before editing because the latest trust-banking hardening sprint may have closed some older findings.

### 7. Campaign Management

Closed items include upload validation/error reports, active-list locks, unsubscribe/STOP, provider webhook aggregation, scheduler lifecycle, campaign response integrity, response modification guards, and event invitation validation. Current residuals are advanced rule dry-run parity, complete filter dimensions, production gateway behavior, scorecards, dashboard drill-down, PDF/Excel exports, and full BRD-mapped tests.

### 8. Lead / Prospect

Closed items include negative-list expiry filtering, create-path screening, marketing consent capture, ownership/audit controls, retention purge, criteria uniqueness/inverted operators/preview, and `RECOMMENDED_FOR_CLIENT` status alignment. Current residuals should be refreshed from the source BRD before implementation; likely areas are reporting/export completeness, advanced bulk workflows, production SMS/email semantics, and full BRD regression coverage.

### 9. Calendar / Call Report

Closed items include no-show, opportunity expiry, approval branch scoping, auto-unclaim, approval notifications, late-filing notifications, route/filter fixes, action item branch/update authorization, dual reminders, actor propagation, opportunity creation audit, and RM-timezone business-day calculation. Current residuals are opportunity schema/stage mismatch, conveyance fields, feedback source/sentiment, action-item completion history, attachment limits/scanning, supervisor dashboards, exports, auto-save/draft uniqueness, and display refinements.

### 10. Handover Assignment Management

Current open themes are cross-branch routing verification, async bulk processing, entity-master assignment updates, delegation expiry reversal, delegate constraints, per-row audit/notifications, filters/history params, email delivery, rate limits, and dedicated HAM reports.

### 11. Trust Banking Hardening

The v2 hardening sprint has closure evidence for tactical items. Current open themes are foundational trust banking account models, onboarding structures, evidence/document workflow hardening, core banking integrations, client portal messaging/statements, event idempotency, audit normalization, configuration governance, settlement/cash workflows, and production adapter coverage.

### 12. CIM

Current open themes are data stewardship workflows, relationship intelligence, client/profile depth, dedupe/governance, workflow routing, incomplete UI surfaces, reporting, and automated tests.

### 13. CRM PAD

Current open themes overlap with CRM modules but remain broader: PAD workflow completeness, dashboards, reporting/export coverage, stewardship views, relationship intelligence, advanced campaign/lead/call-report surfaces, permissions, and full test coverage.

## Recommended Remediation Order

1. Re-run targeted coverage refresh for stale CRM/SR areas only, because many Apr 23-25 findings were closed later.
2. Close P0 cross-cutting controls: audit/status history, file/document security, durable jobs, and BRD-mapped tests.
3. Close residual CRM/HAM operational gaps: opportunity schema, call-report dashboards/exports, SR v2 residuals, HAM async/reporting.
4. Build trust banking foundation before settlement, statements, and portal evidence flows.
5. Close accounting and fee engines: GL, TrustFeesPro, settlement/cash, tax/penalty, FX, and reports.
6. Productionize external adapters and Corporate Actions feeds/elections/reconciliation behind typed contracts.
7. Finish NFR, observability, accessibility, i18n, and reporting/export hardening.
8. Refresh all individual `brd-coverage` reports and this consolidated register after each wave.

## Exclusions

Superseded BRD versions were excluded where a later v2, addendum, final, or draft-latest document exists. Generated scripts, test-case documents, implementation plans, and older gap notes were not treated as standalone BRDs.
