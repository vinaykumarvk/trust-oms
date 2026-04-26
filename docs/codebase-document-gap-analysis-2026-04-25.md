# Codebase vs. Docs Gap Analysis

**Date:** 2026-04-25  
**Scope:** `/docs` requirements corpus compared against current Trust OMS codebase  
**Purpose:** Consolidated functional gap register grouped by affinity, to support staged development planning.

---

## 1. Method and Source Coverage

This review used the documents and review artifacts currently present in `/docs`, with cross-checks against the current source tree. The most useful requirement-to-code mappings were the BRD coverage audits under `docs/reviews`, especially the April 25 reviews for CRM modules.

### Primary Requirement Sources Reviewed

| Functional Area | Source Documents / Existing Reviews |
|---|---|
| Core Trust OMS Philippines | `TrustOMS-Philippines-BRD-FINAL.md`, `TrustOMS-Philippines-TestCases.md`, `brd-coverage-trustoms-philippines-brd-final-*` |
| Corporate Actions / CA 360 | `BRD_CorporateActions_TRUST-CA-360_FINAL.md`, `plan-trust-ca-360.md`, `brd-coverage-brd-corporateactions-*` |
| Enterprise GL | `GL-business_requirements_document.md`, `enterprise_gl_architecture.md`, `posting_engine.md`, `brd-coverage-gl-*` |
| TrustFees Pro | `TrustFeesPro-BRD-v2-FINAL.docx`, `plan-trustfees-pro.md`, `brd-coverage-trustfeespro-*` |
| Lead / Prospect | `LeadProspect_BRD_v2_FINAL.docx`, `gap-analysis-lead-prospect-*`, `brd-coverage-leadprospect-*` |
| Campaign Management | `Campaign_Management_BRD_v2_Final.docx`, campaign journey PDFs, `brd-coverage-campaign-management-*` |
| Handover and Assignment | `Handover_Assignment_Management_BRD_v4_FINAL.docx`, handover journey PDFs, `brd-coverage-handover-*` |
| Calendar / Call Reports / CIM | `Calendar_CallReport_Management_BRD_v1*.docx`, `CIM_BRD_Draft.docx`, meeting journey PDFs, `brd-coverage-calendar-*`, `brd-coverage-cim_*` |
| Risk Profiling / Proposals | `BRD-RiskProfiling-ProposalGeneration-v2.docx`, risk profiling PDFs, `brd-coverage-brd-riskprofiling-*` |
| Service Requests / Tasks | `ServiceRequest_TaskManagement_BRD_v2_FINAL.docx`, service request PDFs, `brd-coverage-servicerequest-*` |
| CRM PAD / Legacy CRM | `CRM_PAD_Final.docx`, `brd-coverage-crm-pad-final-*` |

### Current Code Surface Checked

The current codebase has a broad implemented surface:

- Backend services in `server/services/*` for CRM, HAM, GL, CA, TrustFees, orders, KYC, service requests, risk profiling, tax, settlement, reconciliation, etc.
- API routes mounted in `server/routes.ts`, including `/api/v1/campaign-mgmt`, `/api/v1/lead-mgmt`, `/api/v1/prospect-mgmt`, `/api/v1/ham`, `/api/v1/meetings`, `/api/v1/call-reports`, `/api/v1/service-requests`, `/api/v1/risk-profiling`, `/api/v1/proposals`, `/api/v1/gl`.
- Back-office screens under `apps/back-office/src/pages`, CRM-specific screens under `apps/back-office/src/pages/crm`, TrustFees screens under `apps/back-office/src/pages/trustfees`, and client portal screens under `apps/client-portal/src/pages`.
- E2E/spec coverage under `tests/e2e`, including CRM, GL, CA, service request, HAM, risk analytics, order, settlement, tax, etc.

### Important Caveat

Some `.docx` and PDF sources are best represented by existing extracted review artifacts. This register therefore consolidates:

1. Direct document findings already extracted into `docs/reviews/*`.
2. Current codebase existence checks for pages, routes, services, tests, and placeholder/stub markers.
3. Known outdated findings where current code has since added modules; these are treated as superseded unless still supported by newer audits or current code inspection.

---

## 2. Executive Gap Summary

| Affinity Group | Status Summary | Planning Priority |
|---|---|---|
| Platform controls: auth, audit, data isolation, notifications | Cross-cutting gaps remain across CRM, HAM, SR, RP, CA, TrustFees | Stage 1 foundation |
| CRM master lifecycle: leads, prospects, conversion, campaigns | Large surface exists, but field validation, audit, upload limits, conversion integrity, and analytics gaps remain | Stage 2 CRM closure |
| Calendar, meetings, call reports, tasks, opportunities | Core workflows exist; gaps are mostly workflow rules, notification dispatch, calendar UX details, supervisor constraints | Stage 2 CRM closure |
| Handover and assignment | Strong module exists; remaining gaps are branch routing, same-supervisor enforcement, bulk background processing, and entity master reassignment | Stage 2 or 3 |
| Service requests and task management | Core implemented; gaps around JWT ownership, status history, sequence IDs, documents, reassignment, pagination | Stage 2 client service closure |
| Risk profiling and proposal generation | Broad implementation exists; gaps around authorization guards, scoring validation, notifications, rich text, proposal controls | Stage 3 advisory |
| TrustFees Pro | Broad implementation exists; gaps around specialized fee formulas, event integration, PDF generation, FX controls, DSAR/content-pack stubs | Stage 3 fees |
| GL and accounting | Strongest coverage; remaining gaps are exception retry orchestration and a few partial rule validations | Stage 4 hardening |
| Corporate Actions / CA 360 | Significant partials in ingestion, elections, tax corrections, reconciliation, AI, privacy, DR | Stage 4 CA closure |
| Legacy CRM/PAD concepts | Base/holding-pattern, Finacle CIF/TSA/CSA linkage, related parties and relationship preferences are major product gaps | Stage 5 CRM expansion |
| Client portal / digital channels | Service and campaign UI exists, but messages/statements are stubs and multi-channel journeys are incomplete | Stage 5 digital |

---

## 3. Gap Register by Functional Affinity

### A. Platform Controls, Security, Audit, Notifications

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| A-001 | Several modules update business-critical records without field-level audit events. | Lead status/edit audit gaps in `brd-coverage-leadprospect-*`; TrustFees exceptions missing audit transitions; CA privacy/governance gaps. | Weak compliance traceability and difficult regulator/auditor review. |
| A-002 | Notification model exists in parts, but event dispatch is inconsistent across meeting reschedule/cancel, call report approval, RP authorization, SR updates, campaign responses. | Calendar audit: missing attendee notifications and approval notifications; RP audit: no maker notification; SR audit: nav badge/status history missing. | Users will not receive required workflow prompts; SLA and approval workflows can stall. |
| A-003 | Role and data ownership are not consistently enforced from JWT/session at API level. | SR audit: client_id comes from URL/body instead of JWT; Calendar approval lacks same-branch supervisor constraint; HAM delegation lacks same-supervisor/branch check. | IDOR and incorrect visibility/authorization risk. |
| A-004 | Multi-branch / hierarchy / legal-entity isolation is partial. | TrustOMS Philippines and CA 360 audits cite partial legal-entity multi-tenancy, no RLS/enforcement middleware, branch routing gaps. | Cross-branch data leakage and wrong checker routing possible. |
| A-005 | Maker-checker is strong in GL/HAM/TrustFees, but not uniformly applied to all required maintenance and transactional flows. | Prospect modifications, ad-hoc TrustFees, RP questionnaire delete/edit status guards, SR reassignment are partial/missing. | BRD-defined control model is uneven across product areas. |
| A-006 | Data retention, archival, DSAR, and erasure conflict handling are incomplete. | HAM evaluation cites 7-year archival gap; TrustFees DSAR is partly schema/stub; CA consent/erasure lacks retention conflict detector and signed response. | Regulatory and privacy obligations remain incomplete. |
| A-007 | Generic placeholder pages remain in back-office route groups. | `apps/back-office/src/routes/index.tsx` still routes some Operations, Compliance, Analytics, Tools, Regulatory paths to `PlaceholderPage`. | Navigation may expose non-functional modules that appear complete in docs. |

### B. CRM Lead, Prospect, Conversion, Campaign

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| B-001 | Lead creation validation is incomplete for BRD format rules. | LeadProspect audit: missing Zod/API validation for email and phone length in lead create path. | Invalid lead/contact data enters downstream campaign and conversion flows. |
| B-002 | Non-individual lead fields are incomplete. | LeadProspect audit: missing `business_registration_no`, min-length validation for `entity_name`. | Corporate lead onboarding cannot fully match BRD/PAD. |
| B-003 | Negative list screening is not fully auto-wired or audited. | LeadProspect audit: screening endpoint exists, but audit log and expiry-date filter are missing/partial. | Blocklist compliance evidence is weak; expired records may still affect decisions or active records may be mishandled. |
| B-004 | Lead and prospect status/edit field changes lack field-level audit. | LeadProspect audit: update/status paths lack audit inserts. | Cannot reconstruct lifecycle decisions. |
| B-005 | Campaign rule builder supports only a subset of BRD filter dimensions. | Campaign audit: `product_subscription`, `TRV`, `asset_class`, `branch`, `country` not mapped in rule executor. | Business users cannot create required target segments. |
| B-006 | Campaign lead-list preview is missing as a dry-run endpoint. | Campaign audit: no `/lead-lists/preview`; existing rule execution writes to DB. | Users cannot validate segment size before saving. |
| B-007 | Campaign bulk upload row limit conflicts with BRD. | Campaign audit: backend max 500 rows vs BRD 10,000 rows / 5 MB. | Ops cannot upload expected production campaign lists. |
| B-008 | Campaign upload error-report CSV is not generated. | Campaign audit: `error_report_url` column exists but is not populated. | Users cannot download validation failures for correction. |
| B-009 | Campaign manual lead creation can bypass dedupe/code generation depending on CRUD path. | Campaign audit: upload path uses campaign service; generic CRUD path does not invoke dedupe or auto-code consistently. | Duplicate leads and inconsistent IDs possible. |
| B-010 | Campaign approval lifecycle has BRD status mismatches. | Older gap analysis: approval set ACTIVE instead of APPROVED in some path; rejection/status naming differed. Needs current endpoint-level recheck before implementation. | Reporting and workflow state machines can diverge. |
| B-011 | Campaign analytics is incomplete for ROI, cost-per-lead, funnel, response breakdown, and pipeline value. | Campaign audit and older plan identify dashboard gaps. | Campaign performance cannot support BRD decisioning. |
| B-012 | Client portal campaign journeys are only partial. | Campaign audit covers campaign inbox; PAD/journey PDFs require invitation, RSVP, meeting view and multi-channel dispatch behavior. | Customer-facing campaign experience remains incomplete. |
| B-013 | CRM PAD base/holding-pattern concept is missing. | CRM PAD audit: no base entity grouping CIFs with single/multiple holders. | Major relationship-model gap; portfolios cannot hang from BRD-defined base structure. |
| B-014 | Finacle/CIF, TSA, and CSA integrations are missing or stubs. | CRM PAD audit: no core banking fetch by CustID; no TSA/CSA lookup/link/default/delink workflow. | Customer onboarding and account setup cannot match bank operating model. |
| B-015 | Related parties and product-mandate-customer document checklists are incomplete. | CRM PAD audit: missing beneficiary/PoA/signatory details and document tracking by combination. | AMLA, onboarding, and relationship governance incomplete. |

### C. Calendar, Meetings, Call Reports, Tasks, Opportunities

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| C-001 | Calendar default view and calendar UX details differ from BRD/addendum. | Calendar audit: default is month while BRD says week; CIM audit: weekend/holiday badges, overlap rendering, drag-to-reschedule not found. | User workflow differs from specified RM calendar behavior. |
| C-002 | Meeting creation lacks several server-side business rules. | Calendar audit: no required invitee validation, no future-time validation, no duration <= 8h check, no duplicate warning. | Bad meeting records and schedule conflicts can be saved. |
| C-003 | Meeting edit/reschedule is partial. | Calendar/CIM audits: update allowlist omits some fields; reschedule may update in place instead of creating new child meeting; reschedule notifications/history missing. | Auditability of reschedules and attendee communication are incomplete. |
| C-004 | Cancelled/completed/no-show meeting visual and workflow rules are incomplete. | Calendar/CIM audits: grey/strikethrough missing; no-show batch and auto-transition requirements partly missing depending source; urgent warning missing. | Calendar status semantics are inconsistent with BRD. |
| C-005 | Call report summary validation and late-filing config are incomplete. | Calendar audit: summary min length missing; threshold hardcoded; timezone not based on RM config. | Late filing decisions can be wrong and validation weak. |
| C-006 | Call report one-to-one meeting relationship is enforced in service but lacks DB-level partial unique index. | Calendar audit: duplicate service check exists; schema unique partial index not found. | Race conditions can create duplicate call reports. |
| C-007 | Call report approval constraints are incomplete. | Calendar audit: same-branch/hierarchy supervisor claim, max 20 claimed reports, auto-unclaim, and RM notifications not found. | Supervisor workflow can violate BRD controls and become stale. |
| C-008 | Opportunity and task automation around late filing is incomplete. | CIM audit: >5 business days task for BO_HEAD not found; some action/task flows are partial. | Escalation and follow-up obligations may be missed. |
| C-009 | Notification dispatch for meeting/call-report lifecycle is incomplete. | Calendar/CIM audits: missing notifications on reschedule/cancel and approval decisions. | Users may not know when action is required. |

### D. Handover and Assignment Management

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| D-001 | Handover grids use global search, not all required per-column filters and quick filters. | HAM audit: location/preferred-language quick filters and all-column filters not found. | Large RM books are harder to filter and validate. |
| D-002 | Handover reason validation differs from BRD. | HAM audit: service enforces min 10 chars while BRD states min 5 in several places. | UX/API acceptance differs from spec. |
| D-003 | Bulk handover processing is synchronous and lacks some server-side guards. | HAM audit: no server-side file size/max-row guard; BRD wants background queue. | Large uploads can block requests and bypass capacity controls. |
| D-004 | Bulk upload audit is upload-level, not per-row. | HAM audit: BRD requires per-row `BULK_UPLOAD` audit. | Weak traceability for bulk reassignment. |
| D-005 | Handover authorization may not update source entity master RM assignments in primary service. | HAM audit: status updated; entity master assigned RM update not found. | Authorized handover may not actually move ownership everywhere. |
| D-006 | Cross-branch authorization routing is missing. | HAM audit: no branch-based checker/escalation logic. | Requests can route to wrong or no checker. |
| D-007 | Delegation same-supervisor/same-branch constraint is missing. | HAM audit: duration and overlap enforced; supervisor/branch check not found. | Delegations can violate BRD control boundary. |
| D-008 | Local-language / denormalized selected-list columns are partial. | HAM audit: local-language column not separate; selected list summary lacks full column set. | Regulatory/localization details are incomplete. |

### E. Service Request and Task Management

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| E-001 | Client portal SR list pagination and badge behavior are incomplete. | SR audit: page size hardcoded/no pagination controls in earlier review; nav badge missing. | Client users cannot manage large SR histories effectively. |
| E-002 | Client ownership comes from URL/body instead of JWT in some SR paths. | SR audit: `client_id` from route/body; not consistently derived from authenticated JWT. | IDOR/data ownership risk. |
| E-003 | Document upload and re-upload are missing in SR create/detail. | SR audit: no file input/upload handler/documents field. | BRD document evidence workflow cannot be executed. |
| E-004 | Status history table/timeline is missing. | SR audit: no `sr_status_history` records on create/close/resubmit/send/complete/reject. | Users and auditors cannot see lifecycle timeline. |
| E-005 | Request ID generation is count-based, not sequence-based. | SR audit: `COUNT(*)` generation; no PostgreSQL sequence. | Race condition under concurrent creates. |
| E-006 | RM reassignment is missing. | SR audit: no endpoint/method/UI/role check for V2 reassignment. | Ops cannot reassign active service requests per BRD. |
| E-007 | Back-office list filtering/pagination is partial. | SR audit: in-memory filtering and missing 10/25/50/100 page-size controls in earlier review. | Performance and usability risks for production volumes. |
| E-008 | Some dialog validation and irreversible warnings are incomplete. | SR audit: incomplete/reject min-length and irreversible warning gaps. | User can enter weak operational notes and miss critical warning. |

### F. Risk Profiling and Proposal Generation

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| F-001 | Questionnaire edit/delete guards are incomplete. | RP audit: AUTHORIZED/REJECTED edit/delete restrictions not enforced consistently at service/UI. | Approved risk questionnaires can be changed contrary to control rules. |
| F-002 | Questionnaire scoring-range validation is incomplete. | RP audit: no full coverage/no-gap/no-overlap validation for multi-select range scoring. | Risk scores can be invalid or ambiguous. |
| F-003 | Warning/acknowledgement/disclaimer config is not rich/collapsible. | RP audit: flat textareas, no rich text editor. | Business-configured customer disclosures cannot match BRD. |
| F-004 | Risk appetite mapping does not validate complete 0-to-max coverage. | RP audit: contiguous band checks exist, but exhaustive coverage not found. | Some scores may map to no risk category. |
| F-005 | Asset allocation taxonomy and category coverage are incomplete. | RP audit: no validation all 6 categories; free-text asset classes; donut chart missing. | Proposal allocation can diverge from product taxonomy. |
| F-006 | Authorization notifications are missing. | RP audit: no notification service calls after authorize/reject actions. | Makers may not know when records are approved/rejected. |
| F-007 | Proposal and client-portal RP test coverage was previously absent or thin. | RP audit: no RP-specific e2e test file found at that time; current tests include broader risk analytics but should be rechecked for RP workflow coverage. | High-risk advisory flows need stronger regression coverage. |

### G. TrustFees Pro

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| G-001 | Fee plan wizard lacks draft auto-save/resume. | TrustFees audit: no localStorage/auto-save logic. | Long setup flows can lose user work. |
| G-002 | Fee formula validation for min/max and step windows is incomplete. | TrustFees audit: min <= max and step-function completeness gaps. | Invalid fee plans can be configured. |
| G-003 | Specialized fee accrual formulas are missing/stubbed. | TrustFees audit: deposits, bonds, preferred equities, loans, T-bills/CPs are header comments or stubs. | Fee computation may be wrong for several product types. |
| G-004 | FX rate locking/source config is incomplete. | TrustFees audit: FX rate source/timing not configured; invoice FX not populated consistently. | Multi-currency invoices and accruals lack required controls. |
| G-005 | Accounting event integration is a stub. | TrustFees audit: `trustfees.accounting.v1` event path is random-delay stub; no Avro/schema registry. | Downstream GL/event integration not production-ready. |
| G-006 | PDF invoice rendering is missing or incomplete. | TrustFees audit: `pdf_url` exists; no renderer in earlier review, though `pdf-invoice-service.ts` now exists and needs current verification. | Invoice delivery may not meet BRD. |
| G-007 | Ad-hoc fee maker-checker is missing. | TrustFees audit: no approval middleware on ad-hoc POST. | Manual charges can bypass controls. |
| G-008 | Payment FX-difference handling is missing. | TrustFees audit: no FX reconciliation with <=1% auto-post / >1% approval. | Payment application may leave unexplained differences. |
| G-009 | Collection trigger service may be dead code unless route integration is verified. | TrustFees audit says handlers exist but were not imported then; current `server/routes.ts` mounts collection triggers, so this requires endpoint-level verification. | Trigger invoicing may be partially closed but needs validation. |
| G-010 | Report pack templates and generation log retention are missing. | TrustFees audit: hard-coded reports, no `report_generation_log`. | Regulatory reporting governance incomplete. |
| G-011 | Content pack lifecycle and DSAR controls are mostly stub/partial. | TrustFees audit: signature verification, activation scheduler, rollback, DPO signoff, AMLA retention check incomplete. | Compliance content/privacy features are not production-ready. |
| G-012 | Circuit breaker and cached FX/staleness controls were missing in older audit; current routes/services exist and need focused verification. | `server/routes.ts` now mounts circuit breakers; `server/services/circuit-breaker.ts` exists. | Potentially reduced gap, but not proven closed. |

### H. Enterprise GL and Posting

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| H-001 | GL-specific EOD exception retry orchestration remains partial. | GL audit: shared `exceptionQueueService` exists, but GL-specific retry queue not implemented in GL services. | Failed accounting jobs may lack BRD-specific retry controls. |
| H-002 | Reversal reason mandatory enforcement needs verification. | GL audit: reason field exists, mandatory enforcement not confirmed. | Reversals may be posted without required justification. |
| H-003 | Some older GL report/control gaps may be closed by new services but should be regression-tested. | GL audit notes major improvement with new accrual, batch, auth, report builder/scheduler services. | GL is high-risk; keep final stage focused on verification rather than feature build. |

### I. Corporate Actions, Tax, Reconciliation, CA 360

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| I-001 | Corporate action feed ingestion lacks format-specific parsers. | CA audit: source free-text; no SWIFT MT564-568, ISO 20022, DTCC GCAV parsers. | Production feed onboarding incomplete. |
| I-002 | Tiered feed routing lacks runtime switching and monthly cost reporting. | CA audit: schema/seed exists; switching logic and cost report missing. | Licensed aggregator fallback/cost control not operational. |
| I-003 | PSE Edge connector is a stub. | CA audit: connector definition only. | Local market ingestion incomplete. |
| I-004 | Event amendment/cancellation service logic is missing. | CA audit: status enum has CANCELLED/REVERSED but no routes/service logic. | Operational correction workflow incomplete. |
| I-005 | CA event dynamic field capture is static, not per CA type. | CA audit: static schema fields. | New CA types require code/schema changes. |
| I-006 | Omnichannel client election workflow is partial. | CA audit: web BO only; no mobile/email/SMS/branch/RM channels. | Customer election journeys from PDFs/BRD incomplete. |
| I-007 | Accessibility-first RM election wizard is missing. | CA audit: entire screen not found. | RM-assisted accessibility flow unavailable. |
| I-008 | STT and some BIR forms/retries are incomplete. | CA audit: STT missing; 1604-E and eFPS retry missing. | Tax compliance output incomplete. |
| I-009 | Tax correction/re-computation workflow is missing. | CA audit: no correction/recompute logic. | Incorrect tax events cannot be remediated per BRD. |
| I-010 | PDTC reconciliation and internal triad reconciliation are partial. | CA audit: random/stub position recon; two-way only, no client statement leg, no daily schedule/auto-assign. | Break management is not production-grade. |
| I-011 | Replay workflow is missing. | CA audit: no replay logic. | Failed/corrected events cannot be deterministically replayed. |
| I-012 | CA anomaly detection lacks the required table/engine. | CA audit: no `AnomalyFlag`, no 3-sigma engine. | AI/rules exception monitoring incomplete. |
| I-013 | Claims/TTRA/Data Stewardship UI gaps remain. | CA audit: claims tabs/card/escalation ageing, TTRA document preview/history, stewardship review queue/timeline missing. | Ops users lack required workbenches. |
| I-014 | Degraded mode auto-failover and DR drills are incomplete. | CA audit: feed health mock; no auto-failover/16:00 PHT trigger; no DR drill logic. | Business continuity not complete. |
| I-015 | Privacy breach notification workflow is missing. | CA audit: no 72h NPC notification/playbook. | Regulatory incident response gap. |

### J. Core Trust OMS / Order, Settlement, Portfolio, Risk Analytics

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| J-001 | IPO/time-receipt waitlist auto-allocation is partial. | TrustOMS Philippines audit: waitlist not fully implemented. | Oversubscribed allocations cannot fully follow BRD. |
| J-002 | Contribution unmatched-inventory view is partial. | TrustOMS Philippines audit: no dedicated unmatched-inventory endpoint and no live volume decrement UI. | Operations cannot manage unmatched contribution inventory as specified. |
| J-003 | NAV dual-source deviation flagging is partial. | TrustOMS Philippines audit: pricing source hierarchy exists; no explicit 0.25% deviation flagging. | NAV audit controls incomplete. |
| J-004 | FX hedge linkage is partial. | TrustOMS Philippines audit: order FX fields exist, no dedicated hedge-to-settlement exposure linkage. | Treasury exposure tracking incomplete. |
| J-005 | Several integrations are stubs despite functional wrappers. | TrustOMS audit notes vendor/core connectors for sanctions/FX/feed flows are stubbed in places. | Production readiness depends on real adapters. |

### K. Client Portal and Digital Channels

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| K-001 | Client portal messages are hardcoded stub data. | `apps/client-portal/src/pages/messages.tsx` header says message list is a stub. | Secure RM-client messaging is not functional. |
| K-002 | Statement download is a stub. | `apps/client-portal/src/pages/statements.tsx` header says download button is stub. | Client statements cannot be retrieved as expected. |
| K-003 | Service request document upload is missing from portal. | SR audit: create/detail pages lack upload/re-upload. | Customer evidence submission incomplete. |
| K-004 | Campaign and CA digital journeys are partial. | Campaign/CA audits and journey PDFs require RSVP/elections across web/mobile/email/SMS/branch/RM; current implementation is narrower. | Customer engagement channels do not match journeys. |
| K-005 | Client privacy center is partial. | CA audit: back-office consent center exists; client-facing “Access My Data” and downloadable log missing. | Customer privacy self-service incomplete. |

### L. Reporting, Exports, Performance, Test Coverage

| ID | Gap | Evidence / Source | Impact |
|---|---|---|---|
| L-001 | Several modules have export/report gaps. | Campaign error report, TrustFees report pack/logs, CA monthly feed cost report, PAD AMLA reports. | Operations cannot produce required extracts. |
| L-002 | Pagination/filtering is inconsistent across modules. | SR, Calendar, HAM, RP audits cite hardcoded page sizes, in-memory filtering, or missing per-column filters. | Performance and usability degrade at production volumes. |
| L-003 | DB-level constraints are missing where services enforce rules. | Calendar 1:1 call report, RP uniqueness/overlap constraints, SR sequence, GL reversal reason validation. | Race conditions and data integrity gaps possible. |
| L-004 | E2E coverage exists broadly but is uneven by module. | RP audit found no RP-specific e2e then; SR audit found zero SR tests then, though current tree now has `service-request-lifecycle.spec.ts`; gaps should be revalidated. | Need a verification stage before assuming closure. |
| L-005 | Placeholder/stub code remains in user-facing and integration areas. | Placeholder routes, client portal messages/statements, CA feed/degraded mode, TrustFees accounting events/content packs. | Product can appear complete while critical flows are non-functional. |

---

## 4. Suggested Stage Grouping for Development Plan

This is not the final plan, but the gap register naturally clusters into these execution stages.

### Stage 1 — Cross-Cutting Foundation

Close platform-level gaps that every later module depends on:

- JWT-derived ownership and branch/legal-entity scoping.
- Unified audit/event helper for field-level changes and lifecycle transitions.
- Notification dispatch contract and inbox/badge behavior.
- Pagination/filtering contract and DB-level query enforcement.
- Sequence/id-generation patterns.
- Shared file upload/document evidence service.
- Remove or label placeholder routes.

### Stage 2 — CRM Operational Closure

Focus on relationship-management workflows used daily by RMs/Ops:

- Lead/prospect validation, audit, negative-list expiry, conversion integrity.
- Campaign rule builder, preview, upload scale, error reports, analytics.
- Calendar/meeting/call-report rule enforcement and notifications.
- Service request history, documents, reassignment, JWT ownership.
- HAM branch routing, delegation constraints, entity master reassignment, bulk background processing.

### Stage 3 — Advisory and Fee Engines

Close business configuration and advisory/fee correctness:

- Risk questionnaire guards, scoring ranges, notifications, disclosures.
- Risk appetite/asset allocation taxonomy and completeness.
- TrustFees specialized formulas, FX locking, payment FX diffs, ad-hoc approvals.
- TrustFees DSAR/content-pack/circuit-breaker verification.

### Stage 4 — Accounting, Corporate Actions, Tax, Reconciliation

Close high-risk back-office and regulated workflows:

- CA feed parsers, PSE connector, feed routing failover/cost reports.
- CA amendment/correction/replay workflows.
- Omnichannel election and accessibility RM wizard.
- Tax correction, STT/forms/eFPS retry.
- PDTC/internal triad reconciliation.
- GL exception retry and reversal validation verification.

### Stage 5 — Strategic CRM/PAD and Digital Expansion

Build the larger product-model gaps:

- Base/holding-pattern entity.
- Finacle CIF/TSA/CSA integrations and account linking.
- Related parties, document checklist by product/mandate/customer.
- Mailing/communication/disposition preferences.
- Client portal messaging, statements, privacy self-service, campaign and CA digital channels.

---

## 5. Immediate Next Step

Use this register to produce a staged development plan with:

- Phase objectives.
- Gap IDs covered per phase.
- Data model migrations.
- API/service tasks.
- UI tasks.
- Test cases and verification gates.
- Dependency order, especially for Stage 1 controls before module-level closure.

