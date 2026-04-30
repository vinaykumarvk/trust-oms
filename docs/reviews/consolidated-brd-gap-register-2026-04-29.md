# Consolidated BRD Gap Register
**Date:** 2026-04-29  
**Scope:** BRD coverage artifacts and BRD-adjacent lifecycle gap analyses in `docs/` and `doc/`  
**Method:** `brd-coverage` style consolidation: each available BRD coverage report was reviewed, latest reports were preferred, superseded BRD versions were excluded from the active list, and repeated gaps were normalized into shared remediation workstreams.

## Source BRDs And Audit Artifacts

| BRD / Area | Active Source | Coverage / Gap Artifact Used | Current Verdict |
|---|---|---|---|
| TrustOMS Philippines platform | `docs/TrustOMS-Philippines-BRD-FINAL.md` | `docs/reviews/brd-coverage-trustoms-philippines-brd-final-2026-04-28.md` | GAPS-FOUND |
| General Ledger | `docs/GL-business_requirements_document.md` | `docs/reviews/brd-coverage-gl-business_requirements_document-2026-04-23.md` | GAPS-FOUND |
| Corporate Actions | `docs/BRD_CorporateActions_TRUST-CA-360_FINAL.md` | `docs/reviews/brd-coverage-brd-corporateactions-trust-ca-360-final-2026-04-21.md` | AT-RISK |
| TrustFeesPro | `docs/TrustFeesPro-BRD-v2-FINAL.docx` | `docs/reviews/brd-coverage-trustfeespro-brd-v2-final-2026-04-21.md` | GAPS-FOUND |
| Risk Profiling & Proposal Generation | `docs/BRD-RiskProfiling-ProposalGeneration-v2.docx` | `docs/reviews/brd-coverage-brd-riskprofiling-proposalgeneration-v2-2026-04-23.md` | GAPS-FOUND |
| Service Request & Task Management | `docs/ServiceRequest_TaskManagement_BRD_v2_FINAL.docx` | `docs/reviews/brd-coverage-servicerequest-taskmanagement-brd-v2-final-2026-04-23.md`, plus lifecycle closure artifacts | Previously AT-RISK, closure sprint exists |
| Campaign Management | `docs/Campaign_Management_BRD_v2_Final.docx` | `docs/reviews/brd-coverage-campaign-management-brd-v2-final-2026-04-25.md` | CONDITIONAL PASS |
| Lead / Prospect | `docs/LeadProspect_BRD_v2_FINAL.docx` | `docs/reviews/brd-coverage-leadprospect-brd-v2-final-2026-04-25.md` | GAPS-FOUND |
| Calendar / Call Report | `docs/Calendar_CallReport_Management_BRD_v1.1_Addendum.docx` | `docs/reviews/brd-coverage-calendar-callreport-management-brd-2026-04-25.md` | GAPS-FOUND |
| Handover Assignment Management | `docs/Handover_Assignment_Management_BRD_v4_FINAL.docx` | `docs/reviews/brd-coverage-handover-assignment-management-brd-v4-final-2026-04-25.md` | GAPS-FOUND |
| Trust Banking Hardening | `docs/TrustBanking_Hardening_BRD_v2_Final.docx` | `docs/gap-analysis-tb-hardening-2026-04-25.md`, `docs/feature-life-cycle-tb-hardening-2026-04-26.md`, `docs/reviews/full-review-tb-hardening-2026-04-26.md` | Closure sprint completed; residual hardening only |
| CRM PAD / CIM | `docs/CRM_PAD_Final.docx`, `docs/CIM_BRD_Draft.docx` | `docs/reviews/brd-coverage-crm-pad-final-2026-04-22.md`, `docs/reviews/brd-coverage-cim_brd_draft-2026-04-23.md` | GAPS-FOUND |

Superseded versions such as BRD v1 documents were not listed as active implementation targets where a v2/final document and a later coverage artifact exist. `docs/BDO-RFI-vs-BRD-OMS-Gaps.md` is treated as an input gap note, not a standalone BRD.

## Consolidated Gap Summary

| Workstream | Severity | Size | Source Coverage | Consolidated Gap |
|---|---:|---:|---|---|
| WS-01 Automated test coverage | P0 | XL | Platform, GL, SR, TrustFees, module BRDs | Coverage reports repeatedly show low or zero automated tests for implemented BRD behavior. Platform audit reports 0/213 automated test coverage in the broad FR scorecard. |
| WS-02 External integrations | P0 | XL | Platform, Corporate Actions, Campaign, Lead/Prospect, TrustFees, Trust Banking | SWIFT/FIX/Finacle/BSP PERA-Sys/PSE/DTCC/ISO/SendGrid/Twilio/eFPS integrations are stubbed, simulated, or metadata-only in multiple modules. |
| WS-03 Client/object-level authorization | P0 | M | Trust Banking, SR, Lead/Prospect, HAM, Calendar/Call Report | Ownership and branch/hierarchy checks are inconsistent across client portal routes, prospect actions, approval claims, handover routing, and action item assignment. |
| WS-04 Governed audit trail and status history | P0 | L | SR, GL, Lead/Prospect, Calendar/Call Report, HAM, TrustFees | Several CUD/status transitions lack normalized audit records, before/after payloads, status history, or domain-specific retry/audit orchestration. |
| WS-05 Messaging, notifications, and preferences | P0 | L | Calendar/Call Report, Campaign, Lead/Prospect, HAM, Trust Banking | Notification preferences are missing, critical notifications are not protected, operational alerts are uneven, and external email/SMS delivery plus webhooks are not production-ready. |
| WS-06 Batch jobs and schedulers | P0 | L | Calendar/Call Report, Lead/Prospect, Campaign, HAM, Trust Banking | No-show transitions, opportunity expiry, campaign activation, retention purge, stale approval unclaim, late filing alerts, and upload processing need durable scheduler/background job support. |
| WS-07 Upload, document, and file security | P0 | L | SR, Calendar/Call Report, Lead/Prospect, Campaign, Trust Banking | File limits, XLS/XLSX support, downloadable validation/error reports, virus scanning, document storage/download, and quarantine controls are incomplete. |
| WS-08 CRM campaign and lead rule correctness | P1 | L | Campaign, Lead/Prospect | Rule preview, BRD filter dimensions, condition limits, dedupe wiring, manual lead validation, upload row limits, campaign state transitions, archived write protection, and active-list deletion guards remain inconsistent. |
| WS-09 Calendar, meetings, call reports, and opportunities | P1 | XL | Calendar/Call Report, Campaign | Meeting conflict detection, timezone/business-day calculations, call report summary rules, supervisor scoping, opportunity schema/stage mismatch, opportunity expiry, conveyance fields, dashboards, and exports remain incomplete. |
| WS-10 Handover and delegation | P1 | L | HAM, Trust Banking | Cross-branch authorization routing, async bulk processing, delegation expiry assignment reversal, supervisor notifications, email engine, HAM-specific rate limits, and dedicated reports remain incomplete or partial. |
| WS-11 Trust banking account foundation | P1 | XL | Trust Banking gap register, platform BRD | First-class trust banking account, holding account, security account, CIF/TSA/CSA, mandate, related-party, and conversion-account structures remain incomplete. |
| WS-12 Settlement, transfer, contribution, withdrawal, and cash | P1 | L | Platform BRD | External trustee transfers are not implemented; DVP/RVP lifecycle, auto-netting, cost-basis propagation, contribution tax events, withdrawal penalty schedules, upload fan-out, and FX auto-conversion are partial. |
| WS-13 EIP/ERP/PERA and banking integrations | P1 | L | Platform BRD | EIP/ERP order generation is stubbed; Finacle transmission and BSP PERA-Sys integration are not production integrations. |
| WS-14 Risk profiling and proposal generation | P1 | L | Risk Profiling BRD, Trust Banking | Deviation dialog/config, supervisor response visibility, reject/comment flow, product risk alerts, filters, proposal what-if charts, suitability blockers, notifications, and disclosure evidence are incomplete. |
| WS-15 TrustFeesPro billing, DSAR, content packs | P1 | XL | TrustFeesPro, Trust Banking | Circuit breakers, cached FX fallback, notional accounting events, PDF invoice, maker-checker, FX reconciliation, product formulas, content packs, DSAR workflow, collection triggers, and report packs remain incomplete in the older coverage report. |
| WS-16 GL and accounting hardening | P1 | L | GL | GL-specific retry orchestration, fund equalization, impairment assessment, NAV rounding, min/max fee rules, classification MTM journal posting, dedicated NAVPU/interest/factsheet reports, and testing remain gaps. |
| WS-17 Corporate Actions productionization | P1 | XL | Corporate Actions, Trust Banking | Feed parsers/connectors, dynamic CA fields, amendments/corrections/replay, election channels, tax authority integration, PDTC/triad reconciliation, anomaly flags, degraded mode, and privacy workflows need production hardening. |
| WS-18 Security, NFR, and observability | P1 | XL | Platform, TrustFees, Lead/Prospect, Calendar/Call Report | OIDC/mTLS, real MFA, encryption/KMS, hash-chain audit, per-tier rate limits, OpenTelemetry/Prometheus/Grafana, WCAG verification, i18n completion, DR/RPO/RTO, and CloudEvents/Kafka are incomplete or deferred. |
| WS-19 Reporting and exports | P2 | L | Calendar/Call Report, Campaign, HAM, GL, TrustFees, Trust Banking | CSV/Excel/PDF exports, dashboard drill-down, dedicated regulatory/report-pack generation, ageing reports, scorecards, and history exports are uneven across modules. |
| WS-20 UI completion and accessibility | P2 | L | CRM PAD, CIM, Calendar/Call Report, HAM, Risk, Campaign | Several screens are partial: supervisor dashboards, data stewardship, RM/mobile/regulator views, filters, risk badges/tooltips, client portal statement/message flows, and WCAG evidence. |

## Highest-Priority Raw Findings By BRD

| BRD | Priority Findings |
|---|---|
| TrustOMS Philippines | External trustee transfers; sanctions vendor integration; ECL engine; unified settlement calculator; cross-portfolio netting; DVP/RVP lifecycle; tax/penalty schedule completion; upload fan-out; kill-switch MFA/FIX disconnect; ML fraud; FX conversion; EIP/ERP/PERA integrations; automated tests. |
| GL | EOD exception retry orchestration; fund equalization; impairment assessment; NAV rounding; fee min/max and override flows; MTM classification posting; dedicated GL reports; broad GL test coverage. |
| Corporate Actions | Production feed parsers, event amendment/correction/replay, dynamic CA fields, external reconciliation, omnichannel elections, tax filing integration, anomaly flag model, degraded mode persistence, DPA/DSAR/breach workflows. |
| TrustFeesPro | Circuit breakers, cached FX fallback, notional accounting event emission, PDF invoice rendering, ad-hoc fee maker-checker, payment FX reconciliation, DSAR/content-pack implementation, product-specific formulas, collection triggers, report packs, and tests. |
| Risk Profiling | Risk deviation Yes/No dialog and entity config, supervisor full-questionnaire review and rejection comments, notifications, product-risk popup, risk filters, proposal what-if visualization, suitability blockers, mandate/experience checks. |
| Service Requests | Earlier audit identified SR sequence, status history, authenticated user propagation, document upload, notifications, reassignment, pagination, and E2E tests. The TB hardening lifecycle indicates a closure sprint was completed; residual verification is required before treating these as closed across all BRDs. |
| Campaign Management | Rule preview/dry-run, missing rule dimensions, upload limit mismatch, error report download, manual dedupe, campaign approval lifecycle, gateway webhooks, response uniqueness, calendar conflict, RM scorecards, PDF exports. |
| Lead/Prospect | Negative-list expiry filter and create-path wiring, audit records, criteria uniqueness/invert/preview, bulk upload limits and reports, SMS gateway/retry/rate limits/STOP, threshold mismatches, ownership checks, bulk prospect upload, consent capture, unsubscribe webhook, retention job. |
| Calendar/Call Report | No-show batch, opportunity expiry, notification preferences, generic audit log, branch/hierarchy approval scope, opportunity schema mismatch, conveyance fields, business-day/timezone config, notifications, dashboards, exports, file security. |
| HAM | Cross-branch routing, async bulk processing, entity master assignment updates, delegation expiry reversal, delegate constraints, per-row audit/notifications, filters, history params, email delivery, rate limits, dedicated reports. |
| Trust Banking Hardening | Completed lifecycle sprint covers the v2 hardening plan; residual register still calls out account foundation, onboarding structures, evidence/document workflow hardening, core banking integration, client portal messaging/statements, event idempotency, audit normalization, and configuration governance. |

## Consolidated Execution Recommendation

1. Close cross-cutting security/control gaps first: object authorization, normalized audit/status history, notification preferences, upload/file controls, and scheduler foundation.
2. Close high-reuse CRM operational gaps next: campaign/lead rules, meetings/call reports/opportunities, handover/delegation, client portal messages/statements/documents.
3. Close accounting and operations gaps: GL retry/reports, settlement/transfers/cash, TrustFees formulas/FX/events, EIP/ERP/PERA.
4. Productionize external integrations last behind typed adapter interfaces and simulated contract tests so local builds remain reliable.
5. Add automated regression coverage alongside every closure workstream; otherwise many `DONE` items remain non-compliant under the BRD coverage scorecard.

## Notes And Limitations

- This document consolidates existing BRD coverage artifacts rather than reprinting every line-item table from each report. The source reports listed above remain the detailed evidence record with file/line references and searched terms.
- Several older module reports likely contain gaps that were partially remediated after their audit date. The execution plan includes a re-verification step before code changes for each workstream to avoid re-implementing already-closed items.
- External vendor integrations are treated as adapter/scaffold deliverables unless production credentials and vendor specifications are available.
