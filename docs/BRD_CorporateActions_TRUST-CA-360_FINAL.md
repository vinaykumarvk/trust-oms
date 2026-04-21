# Business Requirements Document (BRD)
## Project: **TRUST-CA 360** — Best-in-Class Corporate Actions Management Platform for Philippine Trust Banking

**Document Version:** 2.0 FINAL (post-adversarial review)
**Date:** 20 April 2026
**Classification:** Confidential
**Prepared for:** Philippine Trust Banking Operations (Trust & Investment Services)
**Prepared by:** ADS Softek — Solutions Advisory
**Baseline Reference:** Intellect CA PAD (Sprint 5, v1.05 — China Bank Corporation)

> **Change Log from v1.0 Draft → v2.0 Final**
> Driven by a 5-round structured adversarial evaluation (Proponent/Opponent/Judge). Seventeen enhancements integrated — summarized in Appendix F.

---

## Table of Contents
1. Executive Summary
2. Scope & Boundaries
3. User Roles & Permissions
4. Data Model
5. Functional Requirements
6. User Interface Requirements
7. API & Integration Requirements
8. Non-Functional Requirements
9. Workflow & State Diagrams
10. Notification & Communication Requirements
11. Reporting & Analytics
12. Migration, Launch & Change Management
13. Glossary
14. Appendices (A–F)

---

## 1. Executive Summary

### 1.1 Project Name
**TRUST-CA 360** — A Corporate Actions (CA) transformation platform purpose-built for Philippine Trust Banking. Positioned as **STP-and-Regulation-first**, with AI/ML as an opt-in amplifier rather than a foundational dependency (per adversarial Round 5 refinement).

### 1.2 Project Description
TRUST-CA 360 ingests multi-source CA announcements (SWIFT MT564–568, ISO 20022 seev.031–seev.036, DTCC GCAV, Bloomberg CACS or Reuters RDF — tiered by feed economics, PDTC messaging, licensed PSE-Edge aggregator feeds, and manual uploads), golden-copies them, and drives the full event lifecycle — *Announcement → Scrubbing & Golden Copy → Event Definition → Entitlement Simulation → Client Election → Entitlement Calculation → Philippine-Tax Computation → Settlement → Internal + External Reconciliation → Claims & Compensation → Regulatory Reporting* — with maker-checker controls, BSP/SEC/AMLA/BIR/DPA regulatory alignment, Market-Calendar-aware date math, Business-Continuity degraded modes, Data Governance, privacy-by-design, and explainable AI.

### 1.3 Business Objectives
- Eliminate manual effort and achieve >=90% STP on mandatory CAs (cash/stock dividend, coupon, redemption, maturity) within 6 months post go-live; >=95% within 12 months.
- Eliminate client-compensation claims arising from missed deadlines or tax/fee mis-computation; reduce CA-related P&L leakage by >=80%.
- Automate Philippines-specific tax treatment (FWT, DST, STT, tax-treaty relief under NIRC/TRAIN/CREATE) and BIR form generation (2306, 2307, 1601-FQ, 1604-E).
- Provide omnichannel client elections (mobile, web, email, SMS, branch, RM-assisted, phone) with biometric/PIN/OTP and full evidentiary chain.
- **Release staff capacity** equivalent to 40% of current CA FTE hours, reinvested in higher-value client servicing and exception management (reframed from "headcount reduction" per Round 5 change-management concern).
- Align with BSP Circular 1108, SEC MCs on custody/investment companies, AMLA (R.A. 9160), Data Privacy Act (R.A. 10173), FATCA/CRS, and BIR issuances; exit-ready with ISO 20022 and neutral-format data export.

### 1.4 Target Users & Pain Points
| User Group | Current Pain Points |
|---|---|
| Trust Operations | Manual scrubbing across feeds; Excel-based entitlement; late events missed; tax errors on cross-border holdings |
| Trust Officers / RMs | No real-time view of client elections; inbound client calls about dividends; bespoke HNI instructions handled offline |
| Portfolio Managers | No pre-emptive CA-impact simulation on NAV |
| Compliance & Risk | Fragmented audit trail; difficulty proving regulatory adherence |
| Tax & Finance | TTRA lifecycle unmanaged; BIR forms produced manually; reconciliation breaks across custody vs. accounting |
| Clients | Delayed notifications, paper elections, no mobile-first UX, opaque tax |
| Ops Head / COO | Silent claims bleeding P&L; no compensation workflow |

### 1.5 Success Metrics (KPIs)
- STP rate (mandatory CAs): >=90% in 6 months, >=95% in 12 months
- Event ingestion-to-notification SLA: <=15 minutes
- Claims rate: <=0.5 bps of CA-impacted AUM (new KPI — Round 3)
- TTRA on-time approval rate: >=95% (new KPI — Round 3)
- Feed-degraded-mode days per year: <=3 (new KPI — Round 4)
- Digital election adoption: >=60% within 12 months
- Reconciliation break rate: <0.5% per EOD cycle
- Tax accuracy: 100% match with BIR-certified calculators on sample audits
- Client NPS on CA processing: +15 points YoY
- FTE capacity release: 40% within 18 months (re-invested, not cut)

---

## 2. Scope & Boundaries

### 2.1 In Scope
1. Multi-source CA ingestion with **tiered feed economics** (Section 7.7): baseline = DTCC GCAV + PDTC + SWIFT issuer-agent + one of (Bloomberg CACS **or** Reuters RDF) + licensed PSE-Edge aggregator. Premium tier adds the second commercial feed.
2. Golden-copy scrubbing and event definition (dynamic fields per CA type).
3. Entitlement simulation ("what-if") and final entitlement computation with **market-calendar-aware date math** (new FR-008a).
4. Omnichannel customer elections (mobile, web, email, SMS, branch, RM-assisted, phone, fax) with evidentiary capture.
5. **Philippine Tax Engine** including **TTRA Lifecycle Module** (application → approval → expiry → fallback; new FR-019a–d).
6. Fees & Charges (trust, custody, interest advice, account maintenance, regulatory levies).
7. Settlement, multi-currency accounting, GL posting.
8. **Internal + External Reconciliation** (PDTC, global custodians, NOSTRO/VOSTRO, and the new internal triad: Custody-position ↔ Accounting-valuation ↔ Client-statement; FR-027a).
9. **Claims & Compensation Module** (new FR-045–048) — origination, investigation, root-cause, P&L impact, approval hierarchy, payout, disclosure.
10. Client communication (multilingual EN/FIL templates) with separated marketing vs. operational consent (privacy-by-design).
11. Dashboards, operational reports, regulatory returns (BSP, SEC, BIR, AMLC, FATCA, CRS).
12. Audit trail (signed, immutable), rollback, correction, replay.
13. **AI/ML amplifier modules (Phase 2+)**: anomaly detection, NLP parsing, predictive elections — each with **model cards** and human-readable explanations (Round 4 explainability).
14. Integration with Core Trust / OMS / CRM / Accounting / BI via **Contract-First Integration Kit** (OpenAPI spec + 12 canonical messages + conformance harness — new Section 7.8).
15. RBAC + ABAC, maker-checker, SoD, 4-eyes.
16. **Legal-Entity multi-tenancy** (Trust Business vs. IMA vs. Custody; new FR-064).
17. **Data Governance** with named Data Steward and master-data stewardship processes (new FR-065).
18. **Business Continuity & Degraded Modes** (new NFR §8.10).
19. **Exit / Portability** (ISO 20022 + neutral-format export; new FR-066).
20. Support for all CA types per Appendix A.

### 2.2 Out of Scope
Trading/order execution (OMS is upstream); core GL as system of record (TRUST-CA 360 posts to it); KYC/client onboarding; research/analyst content; benchmark/index calculation; sell-side broker-dealer trading UX.

### 2.3 Assumptions
- Core Trust Banking system exposes positions, holdings, client, and static data via APIs.
- PHP is the primary base currency; non-PHP valuations use BSP reference rate or BAP rate.
- PDTC is the primary domestic depository; PSE equities; BTr / PDEx fixed income.
- BIR TRAIN / CREATE current; future amendments handled by rule-set versions.
- Client tax residency, TIN, treaty claims, FATCA/CRS status maintained upstream.
- Bank holds valid SWIFT BIC and commercial CA data subscription.

### 2.4 Constraints
- **Regulatory**: BSP Circular 1108, SEC MCs, AMLA (R.A. 9160), DPA (R.A. 10173), BIR issuances, AMLC rules.
- **Technical**: Must integrate via REST/SOAP/MQ; mainframe legacy requires adapter layer.
- **Performance**: EOD <=2h; real-time ingestion <1 min.
- **Data Residency**: Customer PII must remain in PH jurisdiction unless explicit consent; cloud must use sovereign PH zones (DPA).
- **Budget/Timeline**: 18-month phased program; Phase 1 GO-LIVE in 9 months.
- **Language**: EN + FIL at minimum.
- **TCO ceiling**: target TCO <= PHP 250M/yr steady state for mid-size trust bank (Round 5 economics discipline).

### 2.5 Scale Profiles (new — Round 5)
- **Profile A — Large Trust Bank** (AUM > USD 2B): full platform with Phase 3 AI.
- **Profile B — Mid-Size Trust Bank** (AUM USD 500M–2B): full platform; Phase 3 AI optional.
- **Profile C — Small Trust Bank** (AUM < USD 500M): pared-down Phase 1 only; reuse shared SaaS instance; no multi-tenant AI.

---

## 3. User Roles & Permissions

### 3.1 Roles (expanded)
- CA Ingestion Officer, CA Maker, CA Checker, Trust Officer, RM, Portfolio Manager, Tax Officer, Compliance Officer, Risk Officer, Accountant, System Administrator, Auditor, Client (self-service).
- **New:** Data Steward (master-data governance), Claims Officer, Claims Approver, Privacy Officer (DPO delegate), Market-Calendar Admin, Legal-Entity Admin.

### 3.2 Permissions Matrix (summary — extended columns for new roles)
| Function | IngOff | Maker | Checker | TO | RM | PM | TaxOff | Compl | Risk | Acct | SysAdm | Audit | Client | **DataStw** | **ClaimOff** | **ClaimAppr** | **DPO** | **CalAdm** | **LEAdm** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| View feeds | R | R | R | R | - | - | - | R | R | - | R | R | - | R | - | - | - | - | - |
| Create event | - | C/U | - | R | - | - | - | R | - | - | R | R | - | - | - | - | - | - | - |
| Authorize event | - | - | A | R | - | - | - | R | - | - | R | R | - | - | - | - | - | - | - |
| Simulate entitlement | - | X | X | X | X | X | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Approve entitlement | - | - | A | R | - | - | - | R | - | R | - | R | - | - | - | - | - | - | - |
| Capture election | - | X | - | X | X | - | - | - | - | - | - | - | X(self) | - | - | - | - | - | - |
| Override tax | - | - | - | - | - | - | C/U | R | - | - | - | R | - | - | - | - | R | - | - |
| Post GL | - | - | A | - | - | - | R | - | - | R | - | R | - | - | - | - | - | - | - |
| Configure roles | - | - | - | - | - | - | - | - | - | - | CRUD | R | - | - | - | - | R | - | - |
| Manage reference / master data | - | - | - | - | - | - | R | R | - | - | R | R | - | **CRUD** | - | - | R | R | R |
| Originate claim | - | - | - | X | X | - | - | X | - | X | - | R | X | - | **CRUD** | - | - | - | - |
| Approve claim | - | - | - | - | - | - | - | A | - | - | - | R | - | - | - | **A** | R | - | - |
| Manage market calendar | - | - | - | - | - | - | - | - | - | - | - | R | - | - | - | - | - | **CRUD** | - |
| Manage legal entity partition | - | - | - | - | - | - | - | R | - | - | - | R | - | - | - | - | - | - | **CRUD** |
| Handle DPA rights (access/erasure) | - | - | - | - | - | - | - | R | - | - | - | R | X(self) | - | - | - | **X** | - | - |

**Explicit denials**: Maker≠Checker on same record; Clients can only see own accounts; Auditor read-only; SysAdmin cannot approve business transactions; Claims Officer cannot be Claims Approver on the same claim; DPO operates independently of line Operations.

---

## 4. Data Model (v2 — enhanced)

### 4.1 Entity: LegalEntity (NEW — FR-064)
| Field | Type | Required | Notes |
|---|---|---|---|
| legal_entity_id | UUID | Yes | PK |
| entity_code | String(20) | Yes | Unique (e.g., TRUST, IMA, CUST) |
| entity_name | String(255) | Yes | - |
| regulator | String(50) | Yes | BSP / SEC |
| license_ref | String(100) | Yes | Trust License / IMA authority |
| base_currency | String(3) | Yes | - |
| data_segregation_scope | Enum | Yes | Hard / Soft |

**Sample:** `TRUST / Trust Business / BSP / TL-001 / PHP / Hard`; `IMA / Investment Mgmt Account / SEC / IMA-055 / PHP / Hard`; `CUST / Custodial Service / BSP / CL-010 / PHP / Soft`.

### 4.2 Entity: Security, Issuer, CorporateActionEvent, CAType, CAOption, Account, Client, Holding, Entitlement, ClientElection, Resolution, TaxRule, TaxCalculation, SettlementInstruction, CashAccount, GLEntry, ReconciliationRecord, Notification, AuditLog, User, AnomalyFlag
*(See v1 draft — all fields retained verbatim. Below lists the changes only.)*

**Changes applied to existing entities:**

- **CorporateActionEvent**: add `legal_entity_id FK NOT NULL` (tenant partition); add `calendar_key` (ref to MarketCalendar for ex/record/settlement validation); add `degraded_mode_flag Boolean` (true if authorized in BCP fallback).
- **Account**: add `legal_entity_id FK NOT NULL`; add `marketing_consent_flag Boolean` (DPA-separated from operational consent); add `ttra_on_file_id FK(TTRA) nullable`.
- **Client**: add `dpa_right_to_erasure_requested_at Datetime nullable`; add `automated_decision_consent_flag Boolean` (per DPA automated-decisions guidance).
- **TaxCalculation**: add `ttra_id FK nullable` (if treaty applied); `model_version String(20)` if AI-assisted.
- **AnomalyFlag**: add `model_card_ref String(255)` (link to published model card); `explanation_text Text` (human-readable plain-language reason).

### 4.3 Entity: MarketCalendar (NEW — FR-008a)
| Field | Type | Required | Notes |
|---|---|---|---|
| calendar_key | String(20) | Yes | PK (e.g., PH, US, HK, PDEx) |
| date | Date | Yes | - |
| is_business_day | Boolean | Yes | - |
| is_settlement_day | Boolean | Yes | - |
| holiday_name | String(255) | No | - |
| source | String(50) | Yes | BSP / PSE / Exchange website |

**Sample:** `PH / 2026-04-09 / false / false / Araw ng Kagitingan / BSP`; `PH / 2026-04-17 / false / false / Maundy Thursday / BSP`.

### 4.4 Entity: TTRA (NEW — FR-019a–d)
| Field | Type | Required | Notes |
|---|---|---|---|
| ttra_id | UUID | Yes | PK |
| client_id | FK | Yes | - |
| treaty_country | String(2) | Yes | ISO 3166-1 |
| cor_document_ref | String(255) | Yes | Certificate of Residence attachment |
| bir_ctrr_ruling_no | String(100) | Cond | If issued |
| status | Enum | Yes | Applied / UnderReview / Approved / Rejected / Expired / RenewalPending |
| effective_from | Date | Yes | - |
| effective_to | Date | Yes | Auto-populated from CoR validity |
| next_review_due | Date | Yes | Auto: effective_to minus 60d |

**Sample:** `T-001 / C-2001 / US / cor-abc.pdf / CTRR-2026-055 / Approved / 2026-01-01 / 2026-12-31 / 2026-11-01`.

### 4.5 Entity: Claim (NEW — FR-045–048)
| Field | Type | Required | Notes |
|---|---|---|---|
| claim_id | UUID | Yes | PK |
| claim_reference | String(30) | Yes | Unique (e.g., CLM-2026-000001) |
| event_id | FK | No | Linked CA (if applicable) |
| account_id | FK | Yes | - |
| origination | Enum | Yes | ClientRaised / InternallyDetected / RegulatorRaised |
| root_cause_code | Enum | Cond | DeadlineMissed / TaxError / FeeError / WrongOption / SystemOutage / DataQuality / VendorFailure / Other |
| claim_amount | Decimal(24,4) | Yes | - |
| currency | String(3) | Yes | - |
| pnl_impact_account | String(30) | Cond | GL code for P&L hit |
| approval_tier | Enum | Yes | Auto (<=PHP50k) / Manager / Head / Exec Committee |
| status | Enum | Yes | Draft / Investigating / Approved / Paid / Rejected / Withdrawn |
| compensation_settlement_id | FK | Cond | Payment instruction |
| regulatory_disclosure_required | Boolean | Yes | - |
| supporting_docs | JSON[] | No | Document refs |

**Sample:** `CLM-2026-000001 / CA-2026-000123 / TR-00012345 / ClientRaised / DeadlineMissed / 22,500.00 / PHP / 89210-CA-Loss / Manager / Approved / SI-... / false`.

### 4.6 Entity: DataStewardship (NEW — FR-065)
| Field | Type | Required | Notes |
|---|---|---|---|
| dataset_key | String(50) | Yes | PK (e.g., ca_type, tax_rule, market_calendar) |
| steward_user_id | FK | Yes | Named Data Steward |
| approval_policy | Enum | Yes | SingleApprover / DualApproval / CommitteeApproval |
| change_frequency_cap | String(20) | No | e.g., Monthly, Quarterly |
| last_reviewed_at | Datetime | Yes | - |

### 4.7 Entity: ConsentRecord (NEW — Privacy-by-Design)
| Field | Type | Required | Notes |
|---|---|---|---|
| consent_id | UUID | Yes | PK |
| client_id | FK | Yes | - |
| purpose | Enum | Yes | Operational / Marketing / AutomatedDecision / ResearchAggregate |
| channel_scope | Enum[] | Yes | Email/SMS/Push/InApp |
| granted | Boolean | Yes | - |
| granted_at | Datetime | Yes | - |
| withdrawn_at | Datetime | Cond | - |
| legal_basis | Enum | Yes | Consent / Contract / LegalObligation / LegitimateInterest |
| dpa_ref | String(50) | Yes | DPA article citation |

### 4.8 Entity: FeedRouting (NEW — tiered feed economics)
| Field | Type | Required | Notes |
|---|---|---|---|
| routing_id | UUID | Yes | PK |
| security_segment | Enum | Yes | PH-Blue-Chip / PH-Mid-Cap / PH-Small-Cap / Foreign-G10 / Foreign-EM / Fixed-Income |
| primary_source | Enum | Yes | DTCC / Bloomberg / Reuters / PDTC / SWIFT |
| secondary_source | Enum | Yes | - |
| cost_tier | Enum | Yes | Baseline / Premium |
| active_flag | Boolean | Yes | - |

### 4.9 Entity: DegradedModeLog (NEW — BCP)
| Field | Type | Required | Notes |
|---|---|---|---|
| incident_id | UUID | Yes | PK |
| started_at, ended_at | Datetime | Yes | - |
| failed_component | Enum | Yes | Bloomberg / Reuters / DTCC / PDTC / SWIFT / AI / DB |
| fallback_path | Text | Yes | Actions taken |
| impacted_event_ids | UUID[] | No | - |
| rca_completed | Boolean | Yes | - |

---

## 5. Functional Requirements (v2 — enhanced)

*All FRs from v1 retained. Added/modified FRs below, with cross-reference to the adversarial finding that produced them.*

### 5.1 Event Ingestion & Golden-Copy
**FR-001 Multi-source CA feed ingestion** — unchanged from v1.

**FR-001a Tiered feed routing** *(Round 2)* — *As a* CA Ops Head *I want* to route feed consumption by security segment and cost tier via FeedRouting entity *so that* we avoid paying for premium feeds on securities that don't warrant them. AC: Baseline tier covers PH-Blue-Chip via DTCC+Bloomberg; Small-Cap via PDTC+PSE-aggregator; switching logic documented; monthly cost report.

**FR-002 AI-powered unstructured announcement parsing** — now marked **Phase 2+ opt-in**. *As a* CA Ingestion Officer *I want* NLP extraction from PDFs/press releases, **WITH** an explanation panel showing which tokens drove each extracted field *so that* extractions are explainable and auditable per DPA automated-decisions guidance. AC: Confidence scores + token-level highlights + model_card_ref shown with every extraction; low-confidence fields must be human-confirmed.

**FR-003 Golden-copy scrubbing** — unchanged.

**FR-004 Manual event creation** — unchanged.

**FR-005 Schedule-based auto-creation** — unchanged.

**FR-005a PSE-Edge content access (Round 2)** — *As a* CA Ingestion Officer *I want* PSE disclosures ingested via a licensed aggregator (e.g., PDS Vector / IHS Markit / REDI / Thomson ONE) *so that* ToS/legal risk from scraping is eliminated. AC: no direct scraping of PSE Edge; licensed-feed credentials in secrets vault; feed health monitored.

### 5.2 Event Definition & Enrichment
**FR-006 Dynamic field capture** — unchanged.

**FR-007 Maker-checker authorization** — unchanged.

**FR-008 Event amendment / cancellation** — unchanged.

**FR-008a Market-calendar-aware date validation (Round 3)** — *As a* CA Maker *I want* ex/record/settlement date validation to honor the market calendar of the issuer's primary exchange *so that* date errors across PH/US/HK/SG holidays are prevented. AC: validation uses MarketCalendar; configurable T+N business-day offsets per asset class; suggests corrections; override requires reason.

### 5.3 Entitlement Engine — unchanged (FR-009 to FR-012).

### 5.4 Client Election — unchanged (FR-013 to FR-017).

**FR-017a Accessibility-first RM-assisted capture (Round 1)** — *As an* RM *I want* a simplified wizard (3 screens max) for elderly / non-digital clients *so that* the majority of our current book is well-served during digital transition. AC: large-font variant; FIL default; one-tap submission; phone-channel voice consent recorded.

### 5.5 Philippine Tax Engine
**FR-018 Rule-based tax computation** — unchanged.

**FR-019 Tax treaty relief** — unchanged conceptually; see FR-019a–d below for lifecycle.

**FR-019a TTRA application intake** *(Round 3)* — *As a* Tax Officer *I want* to capture client TTRA applications with Certificate of Residence upload and treaty country selection *so that* BIR submissions are tracked from day one.

**FR-019b TTRA status tracking** — *As a* Tax Officer *I want* to track BIR review stages (Applied, UnderReview, Approved, Rejected) with ruling number linkage *so that* reduced rates are applied only when approved.

**FR-019c TTRA expiry monitor** — *As a* Tax Officer *I want* auto-reminders at T-60, T-30, T-15, T-1 days *so that* renewals are filed before lapse. AC: notifications to Tax Officer + Client; automatic fallback to statutory rate if expired.

**FR-019d TTRA fallback on lapse** — *As a* Tax Officer *I want* the tax engine to auto-revert to statutory rate when TTRA is Expired/Rejected *so that* under-withholding is prevented.

**FR-020 BIR form generation** — unchanged; ensure eFPS integration has retry-with-backoff given BIR system reliability (Round 2 realism).

**FR-021 Tax correction and re-computation** — unchanged.

### 5.6 Fees & Charges — unchanged (FR-022).

### 5.7 Settlement & Accounting — unchanged (FR-023 to FR-026).

### 5.8 Reconciliation — enhanced
**FR-027 PDTC reconciliation** — unchanged.

**FR-027a Internal reconciliation triad (Round 3)** — *As an* Accountant *I want* automated three-way reconciliation across (1) Custody position, (2) Accounting valuation, (3) Client statement *so that* internal inconsistencies are detected before client-facing exposure. AC: daily EOD run; variance >0 flags a break; auto-assigned by entity/asset class.

**FR-028 to FR-030** — unchanged.

### 5.9 Corrections, Reversals & Replays — unchanged (FR-035, FR-036).

### 5.10 AI/ML Intelligence (re-scoped as Phase 2+ amplifier)
**FR-040 Anomaly detection** — **de-risked**: Phase 1 uses deterministic rule-based checks (e.g., rate deviates >3σ from issuer 3-year history); Phase 2+ adds ML scoring seeded with post-live labeled data. AC: every flag includes plain-English `explanation_text` and `model_card_ref`.

**FR-041 Predictive election modeling** — Phase 2+; opt-in; requires client `automated_decision_consent_flag=true` per DPA.

**FR-042 Client segmentation & nudges** — **requires explicit marketing consent** (ConsentRecord.purpose=Marketing); separated from operational communications.

**FR-043 AI Explainability & Model Cards (Round 4 — NEW)** — *As a* Compliance Officer *I want* each AI/ML component to publish a model card (purpose, training data, performance, limitations, update log) and every automated decision to carry a plain-English reason *so that* DPA automated-decisions obligations are met. AC: public model-card URL per module; updated on every model version.

### 5.11 Reporting & Dashboards — unchanged (FR-050 to FR-053).

### 5.12 Administration
**FR-060 User & role management** — unchanged.

**FR-061 Reference data management** — unchanged.

**FR-062 Configuration versioning** — unchanged.

**FR-063 Audit trail export** — unchanged.

**FR-064 Legal-entity multi-tenancy (Round 2 — NEW)** — *As a* Legal-Entity Admin *I want* hard/soft partitioning of data by LegalEntity *so that* Trust Business, IMA, and Custody books are regulator-cleanly segregated. AC: Row-level security on all core entities; hard partitions enforce schema/DB separation for Trust Business vs IMA; soft partitions allow shared reference data (e.g., Market Calendar); per-entity regulatory reporting.

**FR-065 Data governance with named Data Steward (Round 4 — NEW)** — *As a* Data Steward *I want* ownership of each reference dataset (CAType, TaxRule, MarketCalendar, FeedRouting, FeeSchedule, GLMap) with approval policies and review cadence *so that* reference data remains trustworthy. AC: Stewardship metadata on every dataset; changes require steward sign-off per DataStewardship.approval_policy; quarterly review required.

**FR-066 Exit / Portability (Round 4 — NEW)** — *As an* IT Governance Lead *I want* all operational data and configuration exportable to ISO 20022 messages (where applicable) and neutral CSV/JSON *so that* vendor lock-in is minimized and future migration is feasible. AC: Full export completes in <=24h; exported data is semantically complete; re-import drill conducted annually.

### 5.13 Claims & Compensation (Round 3 — NEW module)
**FR-045 Claim origination** — *As a* Trust Officer / Client *I want* to raise a claim (mis-dividend, wrong tax, missed election) via UI or portal *so that* operational losses are transparent.

**FR-046 Investigation workflow** — *As a* Claims Officer *I want* a structured investigation (evidence upload, root-cause classification, decision memo) *so that* claims are resolved consistently. AC: SLA 5 business days P95 for investigation.

**FR-047 Approval hierarchy by amount** — *As a* Claims Approver *I want* tiered approval (Auto <=PHP50k, Manager <=PHP500k, Head <=PHP5M, ExCo >PHP5M) *so that* authority is proportional to risk.

**FR-048 Compensation payout & disclosure** — *As a* Claims Officer *I want* approved claims auto-generate settlement instruction to client's cash account with GL hit to CA-Loss P&L *and* flag regulatory-disclosure requirement where breach thresholds are met *so that* the full lifecycle is closed.

### 5.14 Business Continuity & Degraded Modes (Round 3 — NEW)
**FR-070 Feed degraded mode** — if primary feed fails by 16:00 PHT, automatic failover to secondary; logged in DegradedModeLog.

**FR-071 Manual degraded mode** — if all feeds fail, Ops can manually create from issuer letter with `degraded_mode_flag=true`; settlement still proceeds post maker-checker.

**FR-072 DR fail-over run** — quarterly live DR drill; measured RTO/RPO reported to Risk Committee.

### 5.15 Privacy-by-Design (Round 2 — NEW)
**FR-075 Consent separation** — Operational, Marketing, Automated-Decision, Research-Aggregate consents tracked independently in ConsentRecord.

**FR-076 Right-to-erasure workflow** — *As a* DPO *I want* to process DPA Sec. 16 erasure requests within 30 calendar days where no regulatory retention obligation applies *so that* DPA compliance is demonstrable. AC: erasure queue; retention-vs-erasure conflict detector; signed response to requestor.

**FR-077 Purpose-limitation enforcement** — attempts to use Operational data for Marketing/Research must be blocked unless Marketing/Research consent present.

**FR-078 Breach-notification workflow** — <=72h to NPC per DPA; playbook auto-triggered on data-incident flag.

---

## 6. User Interface Requirements (v2 — additions)

All v1 UI requirements retained. Additions:

### 6.13 Claims Workbench (NEW)
Tabs: New / Investigating / Pending Approval / Paid / Rejected. Card view per claim: root-cause, amount, ageing SLA, approval tier, impact link to original event. Action toolbar: Escalate, Add Evidence, Approve, Reject, Withdraw.

### 6.14 TTRA Dashboard (NEW)
Pipeline: Applied → Under Review → Approved → Expiring (T-60/30/15/1) → Expired. Bulk reminder send; CoR document preview; BIR ruling linkage; per-client TTRA history timeline.

### 6.15 Data Stewardship Console (NEW)
Dataset catalog; per-dataset owner badge; pending-changes review queue with dual-approval where required; change-history timeline; overdue-review indicators.

### 6.16 Degraded Mode Monitor (NEW)
Traffic-light view of each feed; toggle to activate manual degraded mode; active-incident banner across the app; degraded-mode days tally against KPI.

### 6.17 Consent & Privacy Center (Client-facing)
Granular consent toggles (Operational / Marketing / Automated-Decision / Research-Aggregate); request "Access My Data"; request "Erasure" with estimated response date; downloadable consent log.

### 6.18 Accessibility-first RM Wizard (NEW)
Three-screen flow for elderly/non-digital clients; large-font mode; FIL primary; high-contrast theme; voice-over support; simple confirmations.

### 6.19 AI Explanation Panel (NEW)
Every AI-flagged item shows: plain-English reason; model-card link; confidence; override with reason (captured to retraining backlog).

---

## 7. API & Integration Requirements

### 7.1 – 7.6 (v1 content retained)

### 7.7 External Integrations (tiered economics, Round 2)
**Baseline Tier (must-have):**
- SWIFT MT564–568 via SWIFTNet
- DTCC GCA Validation Service via MQ (at least during Phase 1 — validation only, not full Bloomberg replacement)
- PDTC messaging
- One of Bloomberg CACS (B-Pipe / SFTP) **or** Reuters LSEG RDF (SFTP/API)
- Licensed PSE-Edge aggregator (PDS Vector / REDI / IHS Markit)
- BIR eFPS / eBIRForms (with retry-with-backoff)
- BSP Reporting Portal
- Core Trust Banking via Contract-First Integration Kit (see 7.8)
- Email (SMTP + DKIM/DMARC), SMS (Globe/Smart/DITO), Push (APNs/FCM)
- eSign (DocuSign / Adobe Sign / local PH provider)
- Biometric auth (FIDO2/WebAuthn / SIM-OTP / voice)
- Object storage (S3-compatible PH region)
- BI (PowerBI/Tableau/Superset) via read-only replica

**Premium Tier (optional, activated per TCO):** second commercial CA feed (Bloomberg + Reuters in parallel for cross-validation on foreign securities).

### 7.8 Contract-First Integration Kit (Round 2 — NEW)
To avoid the typical 60% project-failure rate at Core-Trust integration, Phase 0 delivers:
- OpenAPI 3.1 spec published in a shared developer portal
- 12 canonical message types versioned: `PositionSnapshot`, `HoldingsAdjustment`, `SecurityMaster`, `ClientMaster`, `AccountMaster`, `CashAccountBalance`, `CorporateActionEvent`, `Entitlement`, `ClientElection`, `SettlementInstruction`, `GLPosting`, `ReconRecord`
- **Conformance test harness** (JUnit + Postman + Newman) that Core Trust vendor must pass before Phase 1 integration sign-off
- Sandbox environment with synthetic data
- mTLS + mutual-JWT between platforms; message idempotency via `Idempotency-Key`

### 7.9 API Style, Pagination, Errors — v1 content retained

---

## 8. Non-Functional Requirements (v2 — enhanced)

### 8.1 Performance — unchanged.

### 8.2 Availability — unchanged.

### 8.3 Scalability — unchanged.

### 8.4 Security
Additions to v1:
- **SOC 2 Type II** target certification within 18 months of go-live.
- **ISO/IEC 27001** certification within 24 months.
- **OWASP ASVS L2** verification annually.
- Philippine Data Privacy Act: registered DPO, NPC registration, DPIA for each new major module, 72-hour breach notification playbook.

### 8.5 Backup & Recovery — unchanged (RPO <=15 min, RTO <=2h).

### 8.6 Accessibility — WCAG 2.1 AA; plus PH-specific: FIL translation, elderly-client simplified RM wizard (FR-017a).

### 8.7 Browser/Device Support — unchanged.

### 8.8 Observability — unchanged.

### 8.9 Data Retention — unchanged (10y transactional, tamper-evident).

### 8.10 Business Continuity & Degraded Modes (Round 3 — NEW)
- **Tier 1 (primary feed down):** auto-failover to secondary feed within 60s.
- **Tier 2 (all feeds down):** manual degraded mode; events created from issuer letters with `degraded_mode_flag=true`.
- **Tier 3 (core service down):** read-only mode with cached data; no new transactions; client portal shows maintenance notice; staff use BCP spreadsheet template that re-imports post-recovery.
- **Tier 4 (DR invocation):** fail-over to secondary PH region; RTO <=2h; RPO <=15 min.
- **KPI**: degraded-mode days <=3 per year.

### 8.11 Environmental, Social, Governance (ESG) (NEW)
- Support ESG-related CAs (e.g., green bond coupons, climate-linked structured notes) via `esg_related_flag`.
- ESG tagging drives UITF sustainability reporting.

### 8.12 Vendor Exit / Portability — see FR-066.

### 8.13 TCO Discipline (Round 5 — NEW)
- Target TCO <= PHP 250M/yr steady state for mid-size trust bank (Profile B).
- Annual TCO review against KPIs; scale back Phase 3 AI if ROI thin.

---

## 9. Workflow & State Diagrams (v2 — additions)

All v1 state machines retained. New:

### 9.5 Claim State Machine
| Current | Action | Next | Side Effects |
|---|---|---|---|
| (none) | Origination | Draft | Audit; assign Claims Officer |
| Draft | Submit | Investigating | SLA clock starts (5 BD) |
| Investigating | Evidence complete | PendingApproval | Route by approval_tier |
| PendingApproval | Approve | Approved | Generate SettlementInstruction |
| PendingApproval | Reject | Rejected | Notify originator w/ reason |
| Approved | Payment settled | Paid | GL post; client notification |
| Paid | Regulatory disclosure threshold | Disclosed | BSP/NPC filing |
| Any | Withdraw (before approval) | Withdrawn | Audit |

### 9.6 TTRA State Machine
Applied → UnderReview → Approved → Active → Expiring (T-60/30/15/1) → Expired (fallback to statutory) → RenewalPending → (cycle) OR Rejected.

### 9.7 Degraded-Mode Incident State Machine
Detected → Mitigated (auto-failover) OR Manual (degraded_mode_flag) → Recovered → RCA → Closed.

---

## 10. Notification & Communication (v2 — additions)

v1 triggers retained. Additions:

| Event Trigger | Channels | Recipient | Template | Language | Consent Required |
|---|---|---|---|---|---|
| TTRA expiry (T-60/30/15/1) | Email + in-app | Tax Officer + Client | TT-EXP-{d} | EN/FIL | Operational |
| Claim raised (client-facing) | Email + Push | Client | CL-CLM-001 | EN/FIL | Operational |
| Claim approved | Email + Push | Client | CL-CLM-APR | EN/FIL | Operational |
| Degraded mode active | In-app banner | All staff users | OP-DEG-001 | EN | n/a |
| AI anomaly flagged | In-app + email | Ops | AI-ANM-001 | EN | Operational |
| Data erasure acknowledgement | Email | Client | DP-ERS-ACK | EN/FIL | Operational (legal) |

**Privacy-by-Design principle**: Operational notifications (settlement, tax cert, election ack) are sent under legal-obligation basis. Marketing nudges require explicit `marketing_consent_flag=true`.

---

## 11. Reporting & Analytics (v2 — additions)

v1 reports retained. Additions:

### 11.1 Operational Reports (additions)
- Claims Ageing & Root-Cause Heat Map
- TTRA Pipeline & Expiry Calendar
- Feed Health & Degraded-Mode Days
- Data Stewardship Review Compliance

### 11.2 Regulatory Reports (additions)
- NPC annual DPA compliance report
- DPIA registry (per new module)
- SOC 2 evidence pack (read-only exports to auditors)

### 11.3 Management & Analytics (additions)
- Claims rate (bps AUM) trend — new KPI
- TTRA on-time approval %
- Feed-cost per event (baseline vs premium)
- AI model performance cards (precision, recall, drift, override %)

---

## 12. Migration, Launch & Change Management (v2 — enhanced)

### 12.1 Data Migration
- Historical CA events (5 years), elections, entitlements, tax calculations, claims (if any).
- ETL scripts with field-level lineage; reconciliation against GL; sign-off from Ops Head and CFO.

### 12.2 Phased Rollout (re-baselined)
- **Phase 0 (Months 0–3):** Contract-First Integration Kit published; Core Trust vendor conformance-test pass; Data Governance setup; Legal-Entity partitions configured; Market Calendar populated; TTRA migration from spreadsheets.
- **Phase 1 (Months 3–9):** Mandatory CAs (Cash/Stock Dividend, Coupon, Redemption, Maturity); PHP base; Staff UI; Essential BSP/BIR reporting; Claims Module; Privacy-by-Design; BCP Tier 1–2.
- **Phase 2 (Months 9–12):** Voluntary CAs (Rights, Tender, Proxy, Mergers); multi-currency; Client Portal + Mobile; TTRA Lifecycle; Internal Reconciliation triad; Rule-based Anomaly Detection; DR Tier 3–4.
- **Phase 3 (Months 12–18):** Opt-in AI/ML amplifiers (NLP parsing, predictive elections) with model cards; advanced analytics; FATCA/CRS automation; SOC 2 audit.

### 12.3 Change Management (NEW — Round 5)
- **Stakeholder map** with RACI per module.
- **FTE capacity-release plan**: positions redeployed to exception management, client relationship, and claims investigation (not cut).
- **Training**: 40 hours per Ops user; 16 hours per RM; digital literacy program for clients.
- **Parallel run tolerance**: 30 calendar days; break variance <=0.1% day-on-day; >0.5% triggers go-live hold.
- **Communications**: internal newsletter, client letters in EN/FIL, branch poster campaign.
- **External counsel sign-off** by BSP-accredited firm before Phase 1 go-live (Round 5 recommendation).

### 12.4 Go-Live Checklist
Penetration test, DR drill passed, regulatory counsel sign-off, training 100%, parallel-run variance <=0.1%, BCP runbooks signed, sign-off by CRO, COO, Compliance Head, Trust Committee Chair.

---

## 13. Glossary

v1 terms retained. Additions:

| Term | Definition |
|---|---|
| Claim | Operational loss event attributed to CA processing; compensates client from bank P&L |
| CoR | Certificate of Residence (for tax treaty relief) |
| CTRR | Certificate of Tax Treaty Relief Ruling (BIR) |
| DPA | Data Privacy Act (R.A. 10173) |
| DPIA | Data Protection Impact Assessment |
| DPO | Data Protection Officer |
| Degraded Mode | Operational state where one or more feeds/services are unavailable; manual/secondary paths used |
| Data Steward | Named owner of a reference dataset, responsible for quality and change approval |
| Golden Copy | Authoritative event record consolidated from multiple sources |
| Model Card | Document describing an AI model's purpose, training data, performance, limits — published per DPA guidance |
| NPC | National Privacy Commission (PH) |
| Privacy-by-Design | Architecture principle embedding data protection from the start |
| TCO | Total Cost of Ownership |
| TTRA | Tax Treaty Relief Application |
| Tier (Feed / Service) | Operational tier for BCP fallback prioritization |

*(Other v1 glossary terms — BIR, BSP, DTCC GCA, ISIN, ISO 20022, NIRC, PDEx, PDTC, PSE, RM, RPO/RTO, SEC, STP, STT, TIN, TRAIN/CREATE, UITF, WCAG — retained.)*

---

## 14. Appendices

### Appendix A — Supported CA Types
**Mandatory-Financial:** Cash Dividend, Stock Dividend, Bonus Issue, Stock Split, Reverse Split, Consolidation, Interest Payment (Coupon), Partial Redemption, Full Redemption / Maturity, Capital Distribution, Capital Gains Distribution (UITF), Return of Capital.
**Mandatory-Non-Financial:** Name Change, ISIN Change, Ticker Change, Par Value Change, Security Reclassification.
**Voluntary-Financial:** Rights Issue, Tender Offer (cash/stock/mixed), Buyback / Share Repurchase, Dutch Auction, Exchange Offer, Warrant Exercise, Conversion.
**Voluntary-Non-Financial:** Proxy Voting (AGM/EGM), Class Action.
**Mandatory-With-Choice:** Dividend with Option (Cash/Stock/DRIP), Merger with Election, Spin-off with Option.

### Appendix B — Regulatory References
BSP Circular 1108 (Trust Regulations) and subsequent amendments; BSP Circular 706 (AML-CFT); NIRC §24–32 incl. §24(B)(1)/(2), §25(B), §32(B)(7)(g), §73(B); TRAIN Act (RA 10963); CREATE Act (RA 11534); SRC (RA 8799); SEC MCs on Investment Companies and Custody; Data Privacy Act (RA 10173) + IRR; AMLA (RA 9160 as amended); FATCA IGA Model 1; CRS; BIR Rev. Regs. on TTRA (RR 3-2019 and successors).

### Appendix C — ISO 20022 Message Usage
seev.031 (Notification), seev.032 (Preliminary Advice), seev.033 (Instruction), seev.034 (Instruction Status), seev.035 (Movement Confirmation), seev.036 (Reversal Advice). SWIFT MT564/565/566/567/568 equivalents.

### Appendix D — Sample Tax Calculation Illustrations
**Case 1 — Resident Individual, PHP cash dividend, holdings 10,000 @ PHP 2.50/share:**
Gross PHP 25,000 → FWT 10% (NIRC §24(B)(2)) PHP 2,500 → DST nil → Trust Fee (0.50%) PHP 125 → Net PHP 22,375.

**Case 2 — NRA-NETB on same dividend:** FWT 25% = PHP 6,250; Net PHP 18,625.

**Case 3 — Foreign corp with US tax treaty (TTRA approved):** Treaty rate 15% = PHP 3,750; Net PHP 21,125. If TTRA expires → fallback 25% = PHP 6,250.

**Case 4 — Long-term (>5y) peso deposit substitute, Resident Individual, coupon PHP 100,000:** FWT 0% (NIRC §24(B)(1)(c)); Net PHP 100,000.

**Case 5 — UITF redemption, Resident Individual, gain PHP 500,000:** Not subject to 20% FWT as instrument is UITF (not a deposit substitute); classified as ordinary income on participation unit redemption (depending on UITF structure and fund issuance documents — confirm with Tax Officer).

### Appendix E — Process Gaps Closed from Prior PAD
- Decimal precision = 8 on rate/percentage at event definition (PAD §1.1 gap).
- Entitlements include WHT, trust fee, interest advice fee, account maintenance fees (PAD §1.2 gap).
- Payout disposition captured at Investment Account level, modifiable at entitlement stage (PAD §1.2 gap).
- Payment-mode capture on CA Settlement (PAD §1.4 gap).

### Appendix F — Adversarial Review Enhancements (applied v1 → v2)
| # | Enhancement | Source Round | FR/NFR Ref |
|---|---|---|---|
| 1 | Tiered feed economics (Baseline vs Premium) | R2 | FR-001a, §7.7, Entity FeedRouting |
| 2 | AI re-scoped to Phase 2+ amplifier, rule-based first | R1 → R5 | FR-040, FR-041, §5.10 |
| 3 | Contract-First Integration Kit for Core Trust | R2 | §7.8 |
| 4 | Market-Calendar engine | R3 | FR-008a, Entity MarketCalendar |
| 5 | Business Continuity & Degraded Modes | R3 | FR-070–72, §8.10, Entity DegradedModeLog |
| 6 | Privacy-by-Design (consent separation, erasure, purpose-limit) | R2 | FR-075–78, Entity ConsentRecord |
| 7 | Legal-Entity multi-tenancy (Trust / IMA / Custody) | R2 | FR-064, Entity LegalEntity |
| 8 | TTRA Lifecycle Module | R3 | FR-019a–d, Entity TTRA |
| 9 | Claims & Compensation Module | R3 | FR-045–48, Entity Claim |
| 10 | Internal reconciliation triad (Custody/Accounting/Client) | R3 | FR-027a |
| 11 | Data Governance with Data Steward role | R4 | FR-065, Entity DataStewardship |
| 12 | Exit / Portability (ISO 20022 + neutral export) | R4 | FR-066 |
| 13 | AI Explainability & Model Cards | R4 | FR-043, §11.3 |
| 14 | Change Management workstream with parallel-run tolerance | R5 | §12.3 |
| 15 | Revised KPIs (Claims rate, TTRA on-time, Degraded-mode days); FTE reframed as capacity release | R5 | §1.5, §1.3 |
| 16 | PSE-Edge via licensed aggregator (no scraping) | R2 | FR-005a |
| 17 | Scale profiles for large/mid/small trust banks; TCO discipline | R5 | §2.5, §8.13 |

---

**END OF FINAL BRD v2.0 — TRUST-CA 360**
*This BRD is AI-buildable: all entities in §4 have full field specs; all FRs in §5 carry user stories and acceptance criteria; all screens in §6 describe layouts; all APIs in §7 include JSON examples for complex endpoints; all NFRs and workflows are concrete; glossary terms all appear in the document.*
