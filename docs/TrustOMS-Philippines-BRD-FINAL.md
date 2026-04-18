# TrustOMS Philippines
## Business Requirements Document — v1.0-FINAL
### Cutting-Edge Order Management System for Trust Banking Operations

**Document Owner**: ADS Softek
**Date**: 17 April 2026
**Status**: Sign-off Ready (post-adversarial review)
**Classification**: CONFIDENTIAL

---

## Document Control

| Version | Date       | Author      | Change                                                                |
|---------|------------|-------------|-----------------------------------------------------------------------|
| 0.1     | 2026-04-10 | ADS Softek  | Initial outline from OMS PAD source                                   |
| 0.5     | 2026-04-14 | ADS Softek  | Sections 1–7 drafted (Exec, Scope, Roles, Data Model, FRs, UI, APIs)  |
| 1.0     | 2026-04-16 | ADS Softek  | Sections 8–14 added; draft complete                                   |
| 1.0-FIN | 2026-04-17 | ADS Softek  | 31 adversarial findings integrated; sign-off ready                    |
| 1.1-GAP | 2026-04-18 | ADS Softek  | BDO RFI gap analysis integrated; 9 gap themes, 2 new modules, expanded validations |

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
12. Migration & Launch Plan
13. Glossary
14. Appendices

---

# 1. Executive Summary

## 1.1 Project Name
**TrustOMS Philippines** — an end-to-end, cutting-edge Order Management System purpose-built for Philippine Trust Banking operations, spanning Front, Middle, and Back Office.

## 1.2 Project Description
TrustOMS Philippines modernises the entire trust-banking transaction lifecycle — Maintenance, Order Capture, Aggregation, Placement, Execution, Confirmation, Settlement, Transfers, Contributions, Withdrawals, Reversals, Taxation, and Bulk Upload — across every trust product class (IMA-Directed, IMA-Discretionary, PMT, UITF, Pre-Need, Employee Benefit, Escrow, Agency, Safekeeping). The platform is event-driven, cloud-native, zero-trust, and regulator-aligned (BSP, SEC, IC, BIR, AMLC, NPC). It provides intelligent suitability, real-time analytics, a client self-service portal, a mobile RM cockpit, and an immutable hash-chained audit trail.

## 1.3 Business Objectives
- Consolidate Front/Middle/Back Office on a single fiduciary platform to eliminate reconciliations and manual handoffs.
- Achieve Straight-Through-Processing (STP) of ≥ 92 % on eligible orders by end of Year 1.
- Deliver regulator-ready reporting to BSP (MORB Part 9, Circulars 1036, 982, 1086, 1108, 1122, 1140), SEC (MC-6-2007), IC, BIR (FATCA/CRS/WHT), AMLC, and NPC.
- Elevate client experience: self-service portal, mobile statements, intelligent mandate monitoring, 24×7 status.
- Strengthen fiduciary controls: tiered maker-checker, hash-chained audit, real-time mandate & AML monitoring, kill-switch.
- Reduce operating cost-to-serve by 35 % over 3 years; cut order-capture time by 60 %.

## 1.4 Target Users & Pain Points
- **Relationship Managers** — slow order capture, limited on-the-go visibility, fragmented suitability assessment.
- **Traders / Dealers** — no real-time aggregation view, manual broker routing, disjoint post-trade.
- **Middle Office** — manual matching, late confirmations, lagging mandate monitoring.
- **Back Office** — multi-system reconciliations, SWIFT/FIN gateway handoffs, late BSP reporting.
- **Compliance / Risk** — retrospective breach detection, slow STR workflows, manual limit checks.
- **Clients** — poor transparency, slow statement delivery, limited self-service.

## 1.5 Success Metrics (KPIs)
| KPI                                          | Target                      |
|----------------------------------------------|-----------------------------|
| STP rate on eligible orders                  | ≥ 92 % by Month 12          |
| Order-capture time (per order, median)       | ≤ 60 s                      |
| Post-trade confirmation SLA                  | ≥ 99 % within T+0 cut-off   |
| Regulatory reports filed on time             | 100 % (zero late filings)   |
| Mandate breach MTTD (mean-time-to-detect)    | ≤ 60 s                      |
| Client Portal adoption                       | ≥ 70 % of eligible clients  |
| Incident Sev-1 MTTR                          | ≤ 60 min                    |
| System uptime (Core OMS)                     | ≥ 99.9 %                    |

---

# 2. Scope & Boundaries

## 2.1 In Scope
1. Maintenance of reference data (portfolios, mandates, securities, counterparties, ECL rules, limits).
2. Client Onboarding & KYC (new; full lifecycle including risk profile, suitability, FATCA/CRS, AML screening). *(Added per adversarial finding #1.)*
3. Full Order Lifecycle: Capture → Authorize → Aggregate → Place → Execute → Confirm → Settle.
4. Transfers (inter- / intra-portfolio, scripless and certificated), Contributions, Withdrawals.
5. Bulk Upload (Excel/CSV, up to 10 000 rows, with batch-rollback). *(Finding #28.)*
6. Reversal workflow with compliance gate.
7. Taxation engine (WHT, FATCA, CRS, BIR Forms 2306 / 2307 / 2316 generation). *(Finding #24.)*
8. Fee & Billing Engine (trustee, management, custody, UITF TER). *(Finding #2.)*
9. Corporate Actions (mandatory, voluntary, elective) with entitlement accrual. *(Finding #3.)*
10. Fund Accounting & UITF NAV computation (including fair-value hierarchy, unit issuance/redemption). *(Finding #4.)*
11. Cash & FX Management (nostro/vostro, FX hedging, liquidity monitoring). *(Finding #5.)*
12. Trade Surveillance (layering, spoofing, wash-trading, front-running). *(Finding #8.)*
13. Kill-Switch / Trading-Halt Module. *(Finding #9.)*
14. Operational-Risk-Event (ORE) Ledger (Basel taxonomy). *(Finding #10.)*
15. Whistleblower & Conduct-Risk module. *(Finding #7.)*
16. AI-based Fraud & Anomaly Detection (Phase 3). *(Finding #11.)*
17. Client Self-Service Portal (web + mobile) and Mobile RM Cockpit.
18. Compliance Workbench, Operations Control Tower, Executive Dashboard.
19. Regulatory reporting (BSP, SEC, IC, BIR, AMLC).
20. Hash-chained audit log, WORM storage, 10-year retention.
21. Portfolio Modeling & Rebalancing (simulation, what-if, stress-test, model-portfolio, trade-blotter generation). *(BDO RFI Gap #5.)*
22. Scheduled-Plan & PERA Module — EIP (Easy Investment Plan), ERP (Easy Redemption Plan), PERA (Personal Equity Retirement Account) with BSP PERA-Sys API integration. *(BDO RFI Gaps #9.)*
23. Enhanced Order-Type Coverage — Time-in-Force (Day/GTC/GTD), Switch-In/Out, Future-dated orders, Scheduled/recurring orders, Subsequent-allocation, Inter-portfolio block transactions. *(BDO RFI Gap #1.)*
24. Pre/Post-Trade Compliance Engine with limit taxonomy (trader, counterparty, broker, issuer, SBL, sector, group) and hard/soft validation with override workflow. *(BDO RFI Gap #4.)*
25. Branch & Channel Portability — cross-channel order lineage, branch visibility rules, branch dashboard, trader-ID tagging. *(BDO RFI Gap #7.)*
26. Enhanced Settlement — book-only settlement, bulk settlement, multi-currency orders, inline FX conversion, payment-mode enumeration. *(BDO RFI Gap #8.)*
27. Risk Analytics — VAR computation, back-testing, Macaulay/modified duration, stress-test downloads, IREP. *(BDO RFI Gap #6.)*

## 2.2 Out of Scope (Initial Release)
- Full treasury / derivatives pricing library (use Bloomberg BVAL / Numerix externally).
- Core-banking general-ledger ownership (posts to Finacle via APIs; does not replace it).
- Securities Lending & Repo (Phase 3 evaluation).
- Personal Financial Planning / Goals-based wealth advisory (separate product).
- Crypto / digital-asset custody.
- Robo-advisory execution.

## 2.3 Assumptions
- Finacle core banking continues to be the book of record for general ledger and customer cash accounts.
- Bloomberg B-Pipe provides primary market data and reference data; Refinitiv is secondary.
- The Bank already holds a SWIFT BIC and is a member of PhilPaSS-plus, PDEx, PSE.
- Cloud deployment is permitted subject to BSP Circular 1086 notification. *(Finding #20.)*
- Identity is federated through Azure AD / Okta.
- UITF NAV publication cut-off is 11:30 PHT (pricing) with publication by 12:00 PHT.

## 2.4 Constraints
- **Regulatory**: BSP MORB Part 9; Circulars 1036 (UITF), 982 (Info-Sec), 1086 (Cloud), 1108 (Cybersecurity), 1122 (Liquidity), 1140 (Op-Risk); SEC MC-6-2007 (IMA); IC circulars (Pre-Need); RA 9160 (AMLA) as amended; RA 10173 (DPA); FATCA/CRS. *(Findings #20–23.)*
- **Data residency**: Client PII resides within the Philippines unless explicit customer consent + BSP notification.
- **Retention**: 10 years post-closure for client records; 7 years for transactional records.
- **Budget**: Firm Phase 1+2 budget PHP 420 M (infra + licences + data feeds + implementation, indicative).
- **Timeline**: Phase 1 MVP in Month 8; Phase 2 full OMS in Month 14.

---

# 3. User Roles & Permissions

## 3.1 Roles (Summary)
Each role is formally defined in the Admin Console and mapped 1-to-1 to an Azure AD / Okta group.

| Role | Office | Primary Responsibility |
|------|--------|------------------------|
| Branch Associate (BA) | Front | Branch-level order capture on IMA-SSA. |
| Relationship Manager (RM) | Front | Client advisory, order capture, suitability. |
| Senior / Supervisory RM (SRM) | Front | Maker-Checker approval; portfolio oversight. |
| Trader / Dealer | Front | Aggregation, market-placement, execution. |
| Senior Trader | Front | Authorise large trades, desk supervision. |
| Middle-Office Maker (MO-M) | Middle | Trade confirmation, matching, mandate monitoring. |
| Middle-Office Checker (MO-C) | Middle | Confirmation authorise, breach adjudication. |
| Back-Office Maker (BO-M) | Back | Settlement booking, reconciliation. |
| Back-Office Checker (BO-C) | Back | Settlement authorise, corporate-action posting. |
| Back-Office Head | Back | Exceptions, reversals, cut-offs. |
| Risk Officer | Cross | Limits, mandate controls, ORE review. |
| Compliance Officer | Cross | AML/KYC, STR, reversal approvals, surveillance. |
| Fund Accountant | Middle | UITF NAV, pricing, fair-value, unit book. |
| Fee & Billing Officer | Back | Fee scheduling, billing runs, reconciliations. |
| Treasury Liaison | Back | Cash/FX, nostro/vostro, liquidity monitoring. |
| Trust Business Head | Executive | Governance, approvals > PHP 500 M. |
| Chief Risk Officer (CRO) | Executive | Enterprise risk, committee overrides. |
| Chief Compliance Officer (CCO) | Executive | Conduct, regulator liaison, whistleblower. |
| System Administrator | IT | Users, roles, technical config. |
| Data Protection Officer (DPO) | Legal | Privacy, ROPA, DSAR, breach. |
| Internal Auditor | Assurance | Read-only access to audit log and evidence. |
| Client | External | Read-own-account, request-action (self-service). |
| Client POA / Signatory | External | Delegated access per signing mandate. |
| Regulator (Portal only) | External | Pre-generated regulatory packs. |

## 3.2 Permissions Matrix (Privileged Actions)
Legend: **C**=Create, **R**=Read, **U**=Update, **A**=Authorize, **A\***=Six-eyes / committee, **—**=No access.

| Action | RM | SRM | Trader | MO-M | MO-C | BO-M | BO-C | Risk | Compliance | Admin |
|--------|----|-----|--------|------|------|------|------|------|------------|-------|
| Order Capture (≤ threshold) | C | C | — | — | — | — | — | — | — | — |
| Order Authorize (2-eyes, ≤ PHP 50 M) | — | A | — | — | — | — | — | — | — | — |
| Order Authorize (4-eyes, PHP 50–500 M) | — | A | — | — | — | — | — | A | — | — |
| Order Authorize (6-eyes, > PHP 500 M) | — | A | — | — | — | — | — | A\* | A\* | — |
| Aggregate / Place / Execute | — | — | C/U/A | — | — | — | — | R | R | — |
| Confirm Trade | — | — | — | C/U | A | — | — | — | — | — |
| Settle Trade | — | — | — | — | — | C/U | A | — | — | — |
| Request Reversal | R | R | — | R | — | C | — | — | — | — |
| Approve Reversal | — | — | — | — | — | — | — | — | A | — |
| Mandate Override | — | — | — | — | — | — | — | — | A | — |
| File STR | — | — | — | — | — | — | — | — | C/A | — |
| Kill-Switch Invocation | — | — | — | — | — | — | — | A | A | — |
| Batch Rollback (upload abort) | C (request) | A | — | — | — | — | — | — | — | — |
| Create User / Role | — | — | — | — | — | — | — | — | — | C/U/A |

*(Tiered approval thresholds per finding #26.)*

## 3.3 Explicit Denials
- No user — including System Admin — may modify a closed audit record.
- No single user may act as both Maker and Checker on the same transaction.
- Traders may not authorise their own captured orders or contracting.
- RMs may not execute orders, enter contracting prices, or approve garnishments.
- Client portal users cannot create, modify or cancel transactions — only **request** actions.

---

# 4. Data Model

> **Every entity below carries the mandatory audit fields** (created_at, created_by, updated_at, updated_by, version, status, is_deleted, tenant_id, correlation_id, audit_hash) and **PII classification tags** (None / PII / Sensitive-PII / Financial-PII) and **data-residency** (PH-only / Allowed-offshore) on every field. *(Findings #17–19.)*

## 4.1 Core Entities (Summary)

| Entity | Purpose | Key PII Fields |
|--------|---------|----------------|
| **Client** | Natural/juridical person the Trustee serves. | name (PII), TIN (Sensitive-PII), birth-date (PII), address (PII), contact (PII) |
| **Client Profile / Suitability** | Risk tolerance, investment horizon, knowledge, source of wealth. | income (Financial-PII), source-of-wealth (Sensitive-PII) |
| **KYC Case** | Onboarding and periodic refresh evidence. | ID-number (Sensitive-PII), utility-bill (PII) |
| **Beneficial Owner** | UBO chain to ≥ 25 %. | UBO-name (PII), UBO-TIN (Sensitive-PII) |
| **Portfolio** | Trust account / mandate container. | none (owner-FK only) |
| **Mandate** | Investment policy, asset allocation, constraints. | none |
| **Security** | ISIN, CUSIP, local code; pricing source hierarchy. | none |
| **Counterparty / Broker** | LEI, BIC, settlement instructions. | none |
| **Order** | Fiduciary instruction (capture → settle). | none (tied to portfolio) |
| **Trade / Execution** | Filled portion of an order. | none |
| **Confirmation** | Matched vs broker / counterparty. | none |
| **Settlement Instruction** | SSI, SWIFT routing, value-dating. | none |
| **Position** | Holdings by portfolio × security. | none |
| **Cash Ledger** | TSA / CSA / TCA balances. | none |
| **Corporate Action** | Entitlement, election, entitlement accrual. | none |
| **Fee Schedule** | Trustee / mgmt / custody / TER. | none |
| **Fee Invoice** | Posted fees by period. | none |
| **NAV Computation** | Units, price, per-UITF daily. | none |
| **Tax Event** | Withholding, gross-up, certificate ref. | TIN (Sensitive-PII) |
| **Reversal Case** | Evidence + approval trail. | none |
| **Upload Batch** | Source row, schema, errors, state. | none |
| **Ops Risk Event (ORE)** | Basel taxonomy mapping. | none |
| **Trade Surveillance Alert** | Pattern hit, score, disposition. | none |
| **Kill-Switch Event** | Who, when, why, scope. | none |
| **Notification Log** | Deliveries and consents. | none |
| **Audit Record** | Hash-chained immutable. | none |
| **User / Role / Permission** | IAM entities. | none |
| **Consent Log (ROPA)** | DPA record of processing activities. | lawful-basis, purpose, retention |
- **model_portfolios** — model allocation definitions (id, name, asset_allocations_jsonb, benchmark_id, rebalance_frequency, is_active).
- **rebalancing_runs** — rebalancing execution log (id, portfolio_id/group_id, model_portfolio_id, proposed_trades_jsonb, status, executed_at).
- **scheduled_plans** — EIP/ERP enrollment (id, client_id, portfolio_id, plan_type [EIP/ERP], amount, frequency, nominated_account, status, next_execution_date).
- **pera_accounts** — PERA contributor records (id, client_id, pera_admin_id, tin, contribution_limit, ytd_contributions, status).
- **pera_transactions** — PERA transaction log (id, pera_account_id, type, amount, tax_credit, status).
- **compliance_limits** — Pre-trade limit definitions (id, limit_type [trader/counterparty/broker/issuer/SBL/sector/group], entity_id, max_value, current_utilization, currency, is_active).
- **validation_overrides** — Hard/soft override log (id, order_id, rule_id, override_type [soft/hard], justification, overridden_by, approved_by).
- **held_away_assets** — Assets held at other custodians (id, portfolio_id, asset_description, asset_class, custodian, quantity, market_value, as_of_date).
- **standing_instructions** — Auto-roll/auto-credit/auto-withdrawal rules (id, portfolio_id, instruction_type, parameters_jsonb, is_active).

## 4.2 Sample Data Snapshots (selected)

### Client
| client_id | legal_name | type | TIN | risk_profile | status |
|-----------|-----------|------|-----|--------------|--------|
| CL-000123 | Juan D. Cruz | Individual | 123-456-789-000 | Moderate | Active |
| CL-000124 | ACME Manufacturing Corp | Corporate | 004-567-891-000 | Conservative | Active |

### Portfolio
| portfolio_id | client_id | type | base_ccy | AUM_PHP |
|--------------|-----------|------|----------|---------|
| PORT-00045 | CL-000123 | IMA-Discretionary | PHP | 120,450,000.00 |
| UITF-MMF-A  | pooled    | UITF               | PHP | 8,400,000,000.00 |

### Order
| order_id | order_no | portfolio_id | type | side | isin | qty | limit_px | status |
|----------|----------|--------------|------|------|------|-----|----------|--------|
| 01HK7C5N | 2026-04-17-000123 | PORT-00045 | EQUITY | BUY | PHY7225E1116 | 50,000 | 102.35 | Authorized |

*(Full field tables omitted for Markdown brevity; every entity above is fully specified in the companion .docx and is AI-builder ready.)*

---

# 5. Functional Requirements (Summary by Module)

> **Complete list**: 250+ requirements across 24 modules. This Markdown reproduces IDs with one-line summaries; acceptance criteria and business rules are in the companion .docx. Every FR has an explicit user story: "As a [role], I want to [action] so that [benefit]."

## 5.1 Client Onboarding & KYC *(New — finding #1)*
- **FR-ONB-001** Capture identity (name, DOB, IDs) with e-KYC.
- **FR-ONB-002** Risk-rating score (low/medium/high) with auto-escalation rule.
- **FR-ONB-003** UBO chain capture up to 25 % threshold; link to KYC case.
- **FR-ONB-004** FATCA/CRS self-certification intake with flag propagation to tax engine.
- **FR-ONB-005** Sanctions & PEP screening at onboarding and on every counterparty add. *(Finding #25.)*
- **FR-ONB-006** Suitability profile capture + version.
- **FR-ONB-007** Periodic KYC refresh on a 1/2/3-year cadence by risk band.

## 5.2 Maintenance
- FR-MNT-001 to 015: CRUD for portfolios, mandates, securities, counterparties, limits, ECL rules; all with Maker-Checker.

## 5.3 Order Capture *(Expanded — BDO RFI Gaps #1, #2)*
- FR-ORD-001 to 020: 56-field order ticket (per source PAD); validations; intraday-price refresh; suitability real-time check.
- **FR-ORD-021** Time-in-Force field: DAY (expires at market close), GTC (Good-Till-Cancelled, max 90 calendar days), GTD (Good-Till-Date, user-specified). System auto-cancels expired GTC/GTD orders in the nightly EOD batch.
- **FR-ORD-022** Future-dated orders: trade date may be set up to T+30 for buy/sell; value date for contributions/withdrawals may be set beyond standard T+n with maker-checker override for back-dating.
- **FR-ORD-023** Switch-In / Switch-Out order type: atomic UITF switch (redeem Fund A → subscribe Fund B) without two separate order tickets. System validates both legs before submission, computes any gain/loss and applicable WHT, and processes both legs in a single settlement cycle.
- **FR-ORD-024** Scheduled / Recurring orders: RM or client may set up a recurring order (frequency: daily/weekly/bi-weekly/monthly/quarterly). System auto-generates child orders per schedule, subject to cash-availability check at execution time. Pause/resume/cancel lifecycle.
- **FR-ORD-025** Subsequent-allocation orders: add additional portfolio allocations to an already-placed (but not yet fully filled) block order. New allocations inherit the block's execution price and allocation policy.
- **FR-ORD-026** Inter-portfolio block transactions: support one-to-one, one-to-many, many-to-one, and many-to-many portfolio block transactions. Bulk import via CSV for large-scale rebalancing blocks. Each leg validates independently against the source portfolio's mandate and cash availability.
- **FR-ORD-027** Auto-compute missing field: when two of {units, price, gross_amount} are provided, system auto-calculates the third. Calculation formula displayed to user for transparency.
- **FR-ORD-028** Full/Partial redemption by disposal method: user selects disposal method — FIFO, LIFO, Weighted Average, Specific Lot (pick-and-choose), Highest Cost, or per COP/DS/Folio. Default is FIFO; IMA accounts default to Specific Lot. Tax impact preview shown before confirmation.
- **FR-ORD-029** Payment-mode selection: order ticket includes payment mode field — Debit CA/SA (with real-time balance check), Cash, Cheque, Wire Transfer. For Debit CA/SA, system validates available balance at capture and debits on settlement. Funding account may be changed post-capture with maker-checker.
- **FR-ORD-030** Inline FX conversion: when order currency differs from client's funding account currency, system shows live FOREX rate (TOAP / treasury rate), client confirms conversion, and FX deal is booked atomically with the order. Supports PHP↔USD, PHP↔EUR, and cross-currency pairs.
- **FR-ORD-031** System-generated chronological transaction reference number with date-time stamp (format: `TRN-YYYYMMDD-HHMMSS-NNNNN`). Unique across all channels.
- **FR-ORD-032** Trader-ID tagging: every order — whether captured manually, uploaded via CSV, or routed via API — is stamped with the trader ID who owns execution. Orders are filterable/searchable by Trader-ID across all screens.

## 5.4 Authorization (Tiered) *(Enhanced — finding #26)*
- FR-AUT-001 2-eyes ≤ PHP 50 M.
- FR-AUT-002 4-eyes PHP 50–500 M (adds Risk).
- FR-AUT-003 6-eyes > PHP 500 M (adds Compliance + committee).
- **FR-AUT-004** Order edit post-submission: orders in `Pending-Auth` or `Authorized` status may be edited by the original submitter, subject to an explicit **allowed-order-status matrix** (configurable per entity type). Edits re-trigger authorization from the beginning.
- **FR-AUT-005** Revert / un-cancel: an order in `Cancelled` status may be reverted to `Draft` by BO-Head or Compliance, subject to: (a) original order is less than T+3 old, (b) no offsetting transaction has settled, (c) audit trail records the revert with justification.
- **FR-AUT-006** Back-dating override: contributions/withdrawals may be back-dated up to T-5 with BO-Head approval (4-eyes). Back-dates beyond T-5 require CCO approval (6-eyes). All back-dates are flagged in the audit trail with `backdated: true` and require a documented business justification.

## 5.5 Aggregation & Placement
- FR-AGG-001 to 006: Block creation, parent-child link, allocation policy (pro-rata / priority), broker selection, FIX outbound.
- **FR-AGG-007** Automated combining: system auto-detects similar open orders (same security, same side, same price type) and proposes combining them into a single block for better execution. User confirms or overrides.
- **FR-AGG-008** IPO allocation engine: for primary issuances, capture advance IPO orders from multiple portfolios, track cumulative volume against issue limit, and allocate fills using configurable policy (pro-rata, priority, time-receipt). Cap enforcement: system blocks new IPO orders once cumulative volume reaches the issue limit.
- **FR-AGG-009** Time-receipt allocation with waitlist: when a block is partially filled, allocate fills to participating portfolios by order of receipt time. Unfilled portfolios enter a waitlist; when back-outs/returns occur, waitlisted portfolios are auto-allocated.

## 5.6 Execution & Fill
- FR-EXE-001 to 008: Fill capture, slippage, allocation-back, allocation audit.
- **FR-EXE-009** Rounding-off / calculation adjustments: after fill allocation, display computed charges, taxes, and transaction costs. User may adjust rounding before posting. All adjustments are audit-logged.
- **FR-EXE-010** Fee/charge override: designated users (BO-Head, Fee Officer) may override minimum/required transaction charges with documented justification. Override is audit-logged.
- **FR-EXE-011** Daily broker charge distribution: compute and distribute daily transaction charges per broker (e.g., PDTC fees). Generate broker-wise charge summary report.
- **FR-EXE-012** Stock transaction-charge calculator: embedded calculator that computes net settlement amount = (price × quantity) ± charges ± taxes. Supports stock broker commission, exchange fees, PDTC clearing fee, WHT, and documentary stamp tax.

## 5.7 Confirmation & Settlement
- FR-CFR-001 to 006: Auto-match (FIX 8=35=AK / MT515), tolerance, exception queue.
- FR-STL-001 to 010: SSI resolution, SWIFT MT54x / PhilPaSS routing, cash ledger posting, Finacle GL.
- **FR-STL-011** Book-only settlement: for Private-Bank / in-house cases, support "book-only" settlement that updates the GL without generating SWIFT or RTGS instructions. Flagged in audit as "book-only".
- **FR-STL-012** Bulk settlement: batch-process multiple settlement instructions in a single run. Group by counterparty, currency, and value date for netting efficiency.
- **FR-STL-013** Clearing and admin current accounts: maintain clearing and admin current accounts with automatic sweep rules into Trust settlement accounts. Sweep runs in EOD batch.
- **FR-STL-014** Official Receipt (OR) generation: on every cash-receipt transaction (contribution, coupon, dividend), auto-generate an Official Receipt with sequential numbering, client details, amount, and transaction reference.
- **FR-STL-015** Coupon/maturity processing per custodian: group coupon and maturity processing by custodian (PDTC, depository banks, registries) for efficient reconciliation and settlement.
- **FR-STL-016** Trust settlement accounts: support settlement accounts at both account-level and portfolio-level, with multi-currency capability. Configurable per portfolio at onboarding.

## 5.8 Transfers / Contributions / Withdrawals
- FR-TRF-001 to 007, FR-CON-001 to 005, FR-WDL-001 to 006 (workflows in Section 9).
- **FR-TRF-008** Asset transfer from/to other Trustee banks: support in-kind asset transfers (securities, not cash) between TrustOMS and external trustee banks. Track transfer status (initiated → confirmed → settled). Generate transfer documentation.
- **FR-CON-006** Unmatched-inventory view: show available lots/folios for portfolio officers to select from during contribution/allocation. Live volume decrement as matches are posted.
- **FR-WDL-007** Withdrawal hierarchy enforcement: default order is income first, then principal. Configurable per portfolio; override requires client written instruction.
- **FR-WDL-008** Partial liquidation by required proceeds: user specifies the target cash amount; system auto-computes the required quantity to sell (using selected disposal method) to achieve the target proceeds net of taxes and fees.

## 5.9 Corporate Actions *(New — finding #3)*
- FR-CA-001 Ingest from Bloomberg / PSE EDGE.
- FR-CA-002 Entitlement calc on ex-date – 2 with client communication.
- FR-CA-003 Election workflow (dividend re-investment, tender, rights).
- FR-CA-004 Accrual & tax treatment by security type.
- FR-CA-005 Post-CA position adjustment and audit.

## 5.10 Fund Accounting & NAV *(New — finding #4)*
- FR-NAV-001 Daily NAVpu per UITF computed at 11:30 PHT.
- FR-NAV-002 Fair-value hierarchy (Level 1 → 2 → 3) with fall-back pricing rules.
- FR-NAV-003 Unit issuance & redemption journal; PAR-to-NAVpu reconciliation.
- FR-NAV-004 Cut-off enforcement (unit transactions after cut-off roll to next day).
- FR-NAV-005 NAV audit (dual-source price deviation > 0.25 % flags exception).

## 5.11 Fee & Billing Engine *(New — finding #2)*
- FR-FEE-001 Schedule definition (flat / tiered / %AUM / performance).
- FR-FEE-002 Accrual engine (daily) and billing run (monthly / quarterly).
- FR-FEE-003 Invoice generation, portfolio debit, GL posting.
- FR-FEE-004 UITF TER tracking and publication.
- FR-FEE-005 Fee reversal / waiver workflow.

## 5.12 Cash & FX *(New — finding #5)*
- FR-CSH-001 Nostro/Vostro account register and daily reconciliation.
- FR-CSH-002 FX spot & forward booking (TOAP rates + deal capture).
- FR-CSH-003 FX-hedge linkage to settlement exposure.
- FR-CSH-004 Liquidity heat-map by currency (T / T+1 / T+2).
- **FR-CSH-005** Multi-currency transaction handling: a single order may involve multiple currencies (e.g., buy USD security from PHP account). System handles FX conversion atomically as part of the order settlement.
- **FR-CSH-006** Payment-mode tracking: track payment mode (Debit CA/SA, Cash, Cheque, Wire Transfer) as a first-class field on every cash transaction. Support real-time CA/SA balance check and debit on contribution.

## 5.13 Taxation
- FR-TAX-001 WHT calculation by security and residency.
- FR-TAX-002 BIR Form 2306 (creditable), 2307 (expanded), 2316 (wages, where applicable) generation. *(Finding #24.)*
- FR-TAX-003 FATCA / CRS annual report generation (IDES XML).
- FR-TAX-004 eBIRForms 1601-FQ monthly filing interface.

## 5.14 Reversal
- FR-REV-001 Ops-initiated; FR-REV-002 Compliance approval; FR-REV-003 Post reversing entries; FR-REV-004 Client advice.

## 5.15 Bulk Upload
- FR-UPL-001 to 005: Schema validation; row-level errors; SRM authorise; fan-out.
- FR-UPL-006 **Batch rollback** with compensating entries for already-placed rows. *(Finding #28.)*

## 5.16 Trade Surveillance *(New — finding #8)*
- FR-SRV-001 Rule engine: layering, spoofing, wash-trading, front-running.
- FR-SRV-002 RM anomaly scoring (transaction pattern vs peer baseline).
- FR-SRV-003 Disposition workflow (false-positive / investigate / escalate).

## 5.17 Kill-Switch / Trading-Halt *(New — finding #9)*
- FR-KSW-001 Invocation: CRO or CCO, MFA + second-factor.
- FR-KSW-002 Scope selector: market / asset-class / portfolio / desk.
- FR-KSW-003 Automatic FIX cancel-on-disconnect; halt logged; resumption requires dual approval.

## 5.18 Operational Risk Event Ledger *(New — finding #10)*
- FR-ORE-001 Basel 7-category taxonomy.
- FR-ORE-002 Loss quantification (gross / net / recovery).
- FR-ORE-003 Root-cause and corrective-action fields.
- FR-ORE-004 Quarterly ORE reporting to CRO and BSP.

## 5.19 Whistleblower & Conduct-Risk *(New — finding #7)*
- FR-WHB-001 Anonymous intake channel (web + call-centre).
- FR-WHB-002 Case workflow, CCO review, audit.
- FR-WHB-003 Conduct-risk dashboard (complaints, churn, surveillance hits).

## 5.20 AI Fraud & Anomaly Detection *(New — finding #11, Phase 3)*
- FR-AID-001 Trained on historical ORE + surveillance hits.
- FR-AID-002 Real-time scoring on order-capture events.
- FR-AID-003 Human-in-the-loop disposition; model-governance per BSP Circular 1108.

## 5.21 Portfolio Modeling & Rebalancing *(New — BDO RFI Gap #5)*
- **FR-PMR-001** Simulation & what-if analysis: user selects a portfolio, proposes asset switches (buy X / sell Y), and the system displays projected impact on ROI, yield, duration, sector allocation, and mandate compliance — all in read-only simulation mode. No actual orders are created until the user confirms.
- **FR-PMR-002** Stress-test modeling: apply user-defined or pre-configured macro scenarios (e.g., "interest rates +200bps", "equity market −20%", "PHP depreciation 10%") to a portfolio or group of portfolios. Display impact on market value, duration, unrealised P&L, and mandate breaches.
- **FR-PMR-003** Model-portfolio management: define named model portfolios with target asset-class allocations (e.g., "Balanced 60/40": Equity 60%, Fixed-Income 40%). Each model has a benchmark, rebalance frequency (monthly/quarterly/annual), and tolerance bands (±5%).
- **FR-PMR-004** Portfolio-vs-model comparison: for any portfolio, show current allocation vs. model allocation with drift analysis (overweight/underweight per asset class, absolute and relative). Highlight breached tolerance bands in red.
- **FR-PMR-005** Rebalancing engine: given a portfolio (or group of portfolios) and a target model, compute the set of buy/sell orders needed to bring the portfolio within tolerance bands. Support rebalancing on: (a) existing holdings, (b) new cash contribution, (c) withdrawal proceeds. Respect client restrictions (restricted securities, max single-issuer %, sector limits).
- **FR-PMR-006** Group rebalancing: rebalance a group of portfolios (by investor, family, or related accounts) against a single model in one action. System generates individual orders per portfolio, each independently validated against its mandate.
- **FR-PMR-007** Held-away assets: include assets held at other custodians/trustee banks in the portfolio view and rebalancing calculation. Held-away assets are read-only (no order generation) but affect allocation percentages and compliance checks.
- **FR-PMR-008** Trade-blotter generation: from a rebalancing run, generate a trade blotter (list of proposed orders). User may review, edit individual order quantities, remove specific orders, then submit the blotter as a batch. Submitted blotter creates actual orders that flow through the standard order lifecycle (capture → authorize → aggregate → place).
- **FR-PMR-009** Rebalancing audit: every rebalancing run is logged with: model used, input parameters, proposed orders, user edits, final submitted orders, and any compliance overrides. Hash-chained audit trail applies.
- **FR-PMR-010** ROI/Yield/Duration projections: for Discretionary, Directional, and UITF portfolios, compute quarterly ROI forecast based on current holdings, expected coupons/dividends, and assumed reinvestment rate. Display as table and chart.

## 5.22 Scheduled Plans & PERA Module *(New — BDO RFI Gap #9)*

### 5.22.1 Easy Investment Plan (EIP)
- **FR-EIP-001** EIP Enrollment: client enrolls in an EIP by selecting a UITF product, investment amount, frequency (monthly/quarterly), and nominated CA/SA for auto-debit. System generates a standing instruction and schedules the first execution.
- **FR-EIP-002** EIP Modification: client may modify amount, frequency, or nominated account. Changes take effect on the next scheduled execution. Modification audit-logged.
- **FR-EIP-003** EIP Unsubscription: client may unsubscribe from an EIP at any time. Outstanding scheduled executions are cancelled. Existing holdings remain untouched.
- **FR-EIP-004** EIP Execution: on each scheduled date, system auto-generates a subscription order for the EIP amount, validates cash availability in the nominated CA/SA, and processes the order through the standard lifecycle. Failed executions (insufficient funds) are retried once on T+1; if still failed, the client is notified and the EIP is paused.
- **FR-EIP-005** Core-system transmission: on successful EIP execution, system transmits the debit instruction to Finacle Core Banking via REST/JMS for auto-debit of the nominated CA/SA.

### 5.22.2 Easy Redemption Plan (ERP)
- **FR-ERP-001** ERP Enrollment: client enrolls in an ERP by selecting a UITF product, redemption amount or percentage, frequency, and nominated CA/SA for auto-credit.
- **FR-ERP-002** ERP Execution: on each scheduled date, system auto-generates a redemption order. Proceeds are credited to the nominated CA/SA via Finacle integration.
- **FR-ERP-003** ERP Unsubscription: client may cancel the ERP. Remaining scheduled redemptions are cancelled.

### 5.22.3 PERA (Personal Equity Retirement Account)
- **FR-PERA-001** PERA Onboarding: new contributor enrollment capturing: TIN, employer details, designated beneficiaries, selected PERA products. Supports both "New to PERA" and "Transfer from another PERA Administrator" flows.
- **FR-PERA-002** BSP PERA-Sys / ePERA-Sys API integration: (a) TIN existence check against BSP system, (b) duplicate-PERA check (max 5 PERA products per contributor as per BSP rules), (c) submit contributor registration file, (d) submit transaction file.
- **FR-PERA-003** PERA contribution processing: validate against annual contribution limit (PHP 200,000 for employed, PHP 100,000 for self-employed/OFW as per current BSP rules). Track YTD contributions. Compute applicable tax credit (5% of contribution or PHP 10,000, whichever is lower).
- **FR-PERA-004** PERA product cut-off: enforce product-specific cut-off times. Transactions after cut-off roll to the next business day.
- **FR-PERA-005** PERA qualified withdrawal: contributor has reached age 55 and contributed for at least 5 years. Proceeds are tax-free. System validates qualification criteria.
- **FR-PERA-006** PERA unqualified withdrawal: early withdrawal with penalty — system applies the penalty rate (currently income tax on income earned + return of tax incentives) and generates the BIR computation worksheet.
- **FR-PERA-007** Transfer to Another Product: contributor may switch between PERA-eligible products within the same administrator. No tax event triggered.
- **FR-PERA-008** Transfer to Another PERA Administrator: contributor initiates transfer-out. System generates the BSP transfer file, freezes the account, and coordinates with the receiving administrator.
- **FR-PERA-009** BSP PERA reporting: auto-generate the BSP PERA System Contributor File and Transaction File per BSP format. Monthly submission via SFTP/API.
- **FR-PERA-010** Tax Credit Certificate (TCC): system generates or imports TCCs for PERA contributors. Viewable in the client portal with download option.
- **FR-PERA-011** Modify contributor & beneficiary details with maker-checker.
- **FR-PERA-012** PERA e-Learning: onboarding flow includes mandatory e-Learning module completion (English + Taglish) before first contribution is accepted, per BSP requirement.

### 5.22.4 IMA/TA Standing Instructions & Lifecycle
- **FR-IMASI-001** Acceptance with standing instructions: at account onboarding, define auto-roll, auto-credit (coupon/dividend to CA/SA), and auto-withdrawal rules. Standing instructions execute automatically on trigger events (maturity, ex-date, scheduled date).
- **FR-IMASI-002** Pretermination workflow: client requests early termination of an IMA/TA. System computes: (a) accrued management fee, (b) early termination penalty (if applicable per trust agreement), (c) net proceeds. Workflow: RM captures → BO-Head approves → proceeds payout → account closure.

## 5.23 Pre/Post-Trade Compliance Engine *(Expanded — BDO RFI Gap #4)*
- **FR-PTC-001** Limit taxonomy: define and maintain compliance limits across 10 dimensions — trader, counterparty, broker, issuer, asset class, borrower, SBL (Single Borrower's Limit per BSP MORB), sector/industry, group (related-party), outlet/security. Each limit has: max_value, warning_threshold (%), currency, effective_from/to, is_active.
- **FR-PTC-002** Pre-trade limit check: on every order capture, run the full limit taxonomy check. System computes post-trade exposure (current utilization + proposed order notional) against each applicable limit. Breaches block the order (hard) or warn (soft) based on limit configuration.
- **FR-PTC-003** Hard vs. Soft validation: each compliance rule is classified as `hard` (blocks order, no override) or `soft` (warns, requires documented override). Soft breach override requires: (a) a user with explicit `COMPLIANCE_OVERRIDE` permission, (b) written justification, (c) audit trail entry. Override is a separate record linked to the order.
- **FR-PTC-004** Post-trade compliance analysis: after order execution, re-run compliance checks against actual fill price and quantity. Detect post-trade breaches (e.g., fill price moved the portfolio beyond a limit that was within tolerance pre-trade). Generate alerts for Compliance Officer.
- **FR-PTC-005** Scheduled post-trade reviews: configurable daily/weekly review that scans all active portfolios against all limit rules. Flag expiring limits (within 30 days of effective_to) and generate reminder/alarm notifications.
- **FR-PTC-006** Short-sell detection: if an order is a SELL and the portfolio does not hold the security (or holds less than the sell quantity), flag as potential short-sell. Hard-block by default; override requires Risk Officer approval.
- **FR-PTC-007** Overselling validation: validate sell quantity against actual settled positions (not pending). If sell quantity exceeds settled position, block the order.
- **FR-PTC-008** Hold-out flag: securities flagged as "hold-out" (e.g., legal hold, pledged, stock-dividend receivable) cannot be sold. System checks hold-out register on every sell order.
- **FR-PTC-009** IMA-specific validations: (a) minimum face amount PHP 1M for IMA trades — warn at capture, hard-block at submission; (b) no co-mingling between IMA trust accounts — inter-portfolio transfer between two IMA accounts is prohibited; (c) minimum-participation / minimum-balance rules per trust agreement.
- **FR-PTC-010** Tax-status validation for IPT: Inter-Portfolio Transactions at T+0 are only allowed between buyer and seller with the same tax status. System checks tax-status of both portfolios and blocks mismatched IPTs.
- **FR-PTC-011** Currency mismatch warning: if order currency differs from portfolio base currency, display a prominent warning with the implied FX conversion impact.
- **FR-PTC-012** Trade-date vs. settle-date holdings: system updates holdings on trade date (T+0) and tags unsettled positions as "receivables" until settlement. Compliance checks consider both settled and unsettled positions.
- **FR-PTC-013** FATCA/Non-Resident product restriction: clients flagged as FATCA-reportable or non-resident are blocked from investing in restricted products (configurable list). Override requires CCO approval.
- **FR-PTC-014** Unsettled-pending-orders prompt: when capturing a new order for a portfolio that has pending (unsettled) orders in the same security, display a warning with the pending order details.
- **FR-PTC-015** Outstanding-document-deficiency blocker: if a client/account has outstanding document deficiencies (missing LOI, expired ID, etc.), block all new orders until deficiencies are resolved. Compliance Officer may grant a time-limited waiver.
- **FR-PTC-016** Cut-off-time enforcement: define cut-off times per order/transaction type (e.g., UITF subscription cut-off 12:00 PHT, sell orders cut-off 14:00 PHT). Orders captured after cut-off are automatically rejected or rolled to the next business day (configurable per type).
- **FR-PTC-017** Volume-not-available rejection: for primary issuances (IPO), if cumulative orders exceed the issue limit, auto-reject new orders with a clear message.
- **FR-PTC-018** Unfunded-order rejection: if the portfolio's available cash is insufficient for a buy order, block the order. Override path: if funding is "in transit" (documented), RM may override with BO-Head approval; the order is flagged as "funding-pending".
- **FR-PTC-019** Withdrawal hierarchy: default withdrawal order is income first, then principal. Configurable per portfolio; override requires client's written instruction.
- **FR-PTC-020** Minimum-balance check: on contributions/withdrawals, validate against the portfolio's minimum-balance requirement. Warn on breach; block if final balance would be below minimum.
- **FR-PTC-021** Higher-risk product prompt (CSA waiver): if a client's risk profile is lower than the product's risk rating, display a prominent warning. Proceeding requires an explicit "Client Suitability Assessment (CSA) waiver" action by the client (or documented client instruction for non-portal channels).
- **FR-PTC-022** Aging/curing-period monitoring: compliance breaches have a configurable curing period (e.g., 30 days to cure a passive breach). System tracks aging, sends escalation reminders, and auto-escalates to CRO if curing deadline is missed.

## 5.24 Risk Analytics *(New — BDO RFI Gap #6)*
- **FR-RSK-001** VAR computation: compute daily Value-at-Risk for each portfolio using Historical Simulation (default) and Parametric methods. Configurable confidence level (95% / 99%) and holding period (1-day / 10-day). Results stored historically for trend analysis.
- **FR-RSK-002** VAR back-testing: compare predicted VAR against actual P&L. Flag instances where actual loss exceeded VAR (exceptions). Generate Basel-style traffic-light report (green/yellow/red zones based on exception count over rolling 250 days).
- **FR-RSK-003** Duration analytics: compute Macaulay and Modified duration for each fixed-income portfolio and its benchmark, as of any user-specified date. Display weighted portfolio duration, contribution by security, and deviation from benchmark.
- **FR-RSK-004** Stress-test downloads: generate downloadable stress-test reports per portfolio for specified periods. Reports include scenario parameters, portfolio impact, and breach analysis.
- **FR-RSK-005** IREP (Investment Risk Escalation Process): RM captures client's disposition to specific price-movement percentage thresholds (e.g., "client accepts up to −10% before contact"). System monitors portfolio performance against thresholds and triggers escalation alerts when breached.
- **FR-RSK-006** Price-movement threshold check: for each client's holdings, monitor daily price movements against configurable thresholds. Alert RM and Risk Officer when a security's price moves beyond the threshold.
- **FR-RSK-007** Embedded-derivative tagging: securities that contain embedded derivatives are tagged in the security master. Tagged securities trigger additional risk-disclosure requirements and may be restricted for certain client risk profiles.
- **FR-RSK-008** Derivative-security setup: support setup and lifecycle management for Asset Swaps, Cross-Currency Swaps (CCS), Interest Rate Swaps (IRS), Options, and Forwards. Include mark-to-market capability with daily MTM valuations and collateral monitoring.

---

# 6. User Interface Requirements (High-Level)

The platform ships **29 principal screens** organised into the six role-aligned cockpits below. Full layout-by-section descriptions are in the companion .docx; summary here.

1. **Front-Office Cockpit (RM)** — book-of-business view, order ticket, suitability card, mandate breaches, birthdays, pending tasks.
2. **SRM Approval Queue** — tiered thresholds, side-by-side order comparison, one-click approve / refer.
3. **Trader Cockpit** — working orders, block builder, FIX heat-map, fills, slippage, P&L.
4. **Middle-Office Workbench** — confirmations, mandate monitor, exceptions, reversal queue.
5. **Back-Office Settlement Desk** — cut-off clock, SWIFT traffic, failed queue, cash-ledger heat-map.
6. **Fund-Accounting Console** — NAV run, pricing-source dashboard, unit book.
7. **Compliance Workbench** — breaches, AML hits, surveillance alerts, STR queue, reversals, whistleblower.
8. **Operations Control Tower** — system-wide SLA heat-map, STP rate, incidents.
9. **Executive Dashboard** — AUM, revenue, risk, regulatory filings.
10. **Client Self-Service Portal (Web)** — portfolio, allocation, performance, statements, messaging, preferences.
11. **Client Mobile App** — biometric login, portfolio snapshot, push notifications, document vault.
12. **RM Mobile Cockpit** — offline-capable order capture, client CRM, suitability card.
13. **Admin Console** — users, roles, permissions, notification templates, feature flags.
14. **Audit Log Reader** — read-only, filtered, export-watermarked.
15. **Kill-Switch Console** — scoped halt, evidence capture, timer.
16. **Whistleblower Portal (external)** — anonymous intake.
17. **Regulator Portal (external)** — pre-generated pack downloads.
18. **Fee & Billing Desk** — schedules, runs, waivers.
19. **Corporate-Actions Desk** — calendar, entitlements, elections.
20. **Cash & FX Dashboard** — liquidity heat-map, nostro.
21. **ORE Case Manager** — Basel-tagged cases.
22. **Trade-Surveillance Case Manager** — scored alerts, dispositions.
23. **Upload Desk** — files, validations, rollbacks.
24. **Branch Dashboard** — IMA/TA maturities due today, quick-links to Trust products, Trust advisories, branch-specific client search (by CIF No. or Account Name). Branch users see only clients booked to their branch (RBAC).
25. **Portfolio Modeling Workbench** — simulation builder, what-if analysis, stress-test scenarios, model-portfolio comparison, rebalancing wizard, trade-blotter review.
26. **PERA Administrator Console** — contributor management, BSP PERA-Sys file generation, TCC tracking, compliance dashboard.
27. **Scheduled Plans Dashboard** — EIP/ERP enrollment list, execution status, failed-execution queue, pause/resume controls.
28. **Order Explorer (Trader-Tagged)** — filterable order view by Client / Account / Account Officer / Branch / Trader-ID. Supports all order statuses and types.
29. **Client Portal Enhancements** — personalizable widget dashboard (hide/unhide), COP/Disclosure Statement download (PDF/CSV/Excel), restricted-account view showing only accounts available for redemption.

### UI Standards
- Responsive Web: Chrome / Edge / Safari / Firefox (last 2) — min 1440×900 for trader; 360 px for client.
- Mobile: iOS 15+, Android 11+; biometric login; offline mode for RM Cockpit.
- Accessibility: WCAG 2.1 AA; keyboard-only nav; ARIA labels; 4.5:1 contrast.
- Theming: Bank brand; dark-mode support.

---

# 7. API & Integration Requirements

## 7.1 External Integrations
| System | Protocol | Purpose |
|--------|----------|---------|
| Finacle Core Banking | REST + JMS | Cash GL, customer-account lookups. |
| Bloomberg B-Pipe | BLPAPI / FIX | Market data, reference, FIX routing. |
| Refinitiv Elektron | FIX | Secondary market data. |
| PDEx / BAP-PDEx | FIX / SFTP | Fixed-income, FX reference. |
| PSE EDGE | REST | Corporate actions, disclosures. |
| SWIFT (MT515, 518, 535, 537, 540-548, 103) | FIN gateway | Custody, settlement, payments. |
| PhilPaSS-plus | RTGS | Large-value PHP payments. |
| BSP eFRS | SFTP / portal | Regulatory reports. |
| AMLC goAML | Portal JSON | STR / CTR filings. |
| BIR IDES / eBIRForms | SFTP / portal | FATCA, CRS, WHT forms. |
| Sanctions vendor (World-Check / Dow Jones) | REST | Screening, rescreening. *(Finding #25.)* |
| BSP PERA-Sys / ePERA-Sys | REST / SFTP | PERA contributor registration, TIN validation, transaction files. *(BDO RFI Gap #9.)* |

## 7.2 Internal API Contract (Standard)
- Protocol: HTTPS REST (JSON), gRPC for internal service-to-service.
- AuthN/Z: OIDC (human) + mTLS (service); OAuth 2.1 scopes.
- Versioning: `/api/v{n}/...`; deprecation policy 12 months with header `Sunset`.
- Pagination: cursor-based (`next_cursor`, `limit`).
- Idempotency: `Idempotency-Key` header on all POST/PUT.
- Rate limits: 600 req/min per user, 10 000 req/min per service (burstable).

## 7.3 Standardised Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Quantity must be a positive integer",
    "field": "quantity",
    "correlation_id": "01HK7C5N..."
  }
}
```

## 7.4 Representative Endpoints

### Create Order
**POST** `/api/v1/orders`
```json
{
  "portfolio_id": "PORT-00045",
  "side": "BUY",
  "instrument": { "isin": "PHY7225E1116" },
  "quantity": 50000,
  "price": { "type": "LIMIT", "value": 102.35, "currency": "PHP" },
  "value_date": "2026-04-20",
  "time_in_force": "DAY",
  "payment_mode": "DEBIT_CASA",
  "trader_id": "TR-004",
  "reason_code": "REBALANCE",
  "client_reference": "CL-778231"
}
```
**201 Created**
```json
{
  "order_id": "01HK7C5N...",
  "order_no": "2026-04-17-000123",
  "status": "Pending-Auth",
  "authorisation_tier": "2-eyes",
  "suitability_check": "PASSED"
}
```

### Upload Batch
**POST** `/api/v1/uploads` (multipart) → **202 Accepted**
```json
{
  "batch_id": "01HK7C7Z0F4BAT99",
  "status": "Validated",
  "row_count": 845,
  "accepted_rows": 843,
  "rejected_rows": 2,
  "error_report_url": "/api/v1/uploads/01HK7C7Z/errors.csv",
  "next_action": "Pending-Auth"
}
```

### Kill-Switch Invoke
**POST** `/api/v1/kill-switch`
```json
{
  "scope": { "market": "PSE", "asset_class": "EQUITY" },
  "reason": "Market-data feed degraded",
  "authorised_by": ["CRO-01", "CCO-01"],
  "mfa_tokens": ["...", "..."]
}
```
**200 OK** returns halt_id, active_since, auto_resume_at.

## 7.5 Event-Streaming Contract (CloudEvents 1.0 on Kafka)
```json
{
  "specversion": "1.0",
  "id": "01HK7CXX...",
  "source": "/oms/orders",
  "type": "com.trustoms.order.authorized.v1",
  "time": "2026-04-17T09:17:03.001Z",
  "subject": "order-2026-04-17-000123",
  "datacontenttype": "application/json",
  "data": {
    "order_id": "01HK7C5N...",
    "status": "Authorized",
    "maker_id": "RM-018",
    "checker_id": "SRM-005",
    "amount": 5117500.00,
    "currency": "PHP"
  }
}
```

---

# 8. Non-Functional Requirements

## 8.1 Performance
| Metric | Target |
|--------|--------|
| Order-capture screen first contentful paint | ≤ 1.5 s P95 |
| Order submit → Validated | ≤ 800 ms P95 |
| Checker queue render (500 items) | ≤ 2 s P95 |
| Aggregation 5 000 orders | ≤ 60 s |
| EOD confirmation reconciliation (20 000 trades) | ≤ 15 min |
| Upload 10 000 rows validated | ≤ 3 min |
| Portfolio dashboard refresh | ≤ 2 s P95 |
| STP rate | ≥ 92 % (eligible) |
| Throughput | 2 500 orders/h sustained; 10 000/day |
| Concurrent active users | 1 200 |

## 8.2 Security
OIDC + MFA (TOTP/FIDO2); mTLS service-to-service; OAuth 2.1; RBAC + ABAC; JWT 15 min / 8 h refresh; AES-256 GCM at rest (HSM-backed KMS); TLS 1.3 only; HSTS; cert pinning (mobile); Vault-backed secrets with 90-day rotation; OWASP SAST/DAST/SCA on every build; annual external pen-test; quarterly red-team; hash-chained append-only audit log (WORM, 10 yr); **tiered maker-checker (2/4/6-eyes)**; zero-trust service mesh (Istio mTLS); **BSP Circular 1108 cybersecurity controls**; **BSP Circular 1086 cloud-outsourcing notification workflow**. *(Findings #20, #22, #26.)*

## 8.3 Scalability
Kubernetes (EKS/AKS); PostgreSQL 15 + read-replicas + DR sync replica; Kafka MSK, RF=3, retention 30 d hot + 7 y cold; Redis Cluster; design for 3× headroom (30 M orders/y, 100 M trades/y, 50 TB by Y5); Manila primary, Singapore DR (active-passive; active-active **only after BSP approval**). *(Finding #24 architectural.)*

## 8.4 Availability
| Component | Uptime |
|-----------|--------|
| Core OMS | 99.9 % |
| Settlement (during cut-off) | 99.95 % |
| Client Portal | 99.5 % |
| Reporting | 99.0 % |

Multi-AZ with auto-failover; monthly chaos-engineering drills.

## 8.5 DR / Backup
RPO ≤ 5 min (transactional) / ≤ 1 h (analytical); RTO ≤ 1 h Tier-1 / ≤ 4 h Tier-2; continuous WAL shipping; 6-hourly full snapshot; 7-year cold retention; **immutable object-lock 30 d**; quarterly full-regional failover drill; annual tabletop.

## 8.6 Accessibility & UX
WCAG 2.1 AA; keyboard-only; ARIA; 4.5:1 contrast; 200 % zoom; English primary, Filipino roadmap.

## 8.7 Observability (Consolidated) *(Finding #3 Round 3)*
**One** metrics stack (Prometheus/CloudWatch), **one** logs stack (Loki/CloudWatch), **one** tracing stack (OpenTelemetry), **one** alerting (PagerDuty), **one** dashboarding (Grafana). Correlation-id end-to-end; 100 % error-trace sampling, 10 % baseline; 14-day trace retention.

## 8.8 Data Classification & Privacy *(Findings #17–19, #21)*
- **Every field tagged** with {None, PII, Sensitive-PII, Financial-PII}.
- **Every field tagged** with residency {PH-only, Allowed-offshore}.
- **ROPA** (Record of Processing Activities) maintained centrally.
- NPC-compliant consent management; DSAR workflow (access, correction, erasure).
- DPIA mandatory for any feature touching new PII classes.

## 8.9 Capacity & Performance Test Plan *(Finding #14)*
- Load test (JMeter/k6) at 1×, 2×, 3× design load quarterly.
- Soak test 24 h monthly.
- Spike test twice a year (10×-burst for 5 min).
- Test report published to CRO and SRE; go/no-go gate for releases.

## 8.10 Regulatory & Compliance Roster *(Findings #20–23)*
| Circular / Law | Scope in TrustOMS |
|----------------|-------------------|
| BSP MORB Part 9 | Trust ops core |
| BSP Circular 1036 | UITF lifecycle |
| BSP Circular 982 | Info-Sec mgmt |
| **BSP Circular 1086** | **Cloud outsourcing notification** |
| **BSP Circular 1108** | **Cybersecurity** |
| **BSP Circular 1122** | **UITF liquidity risk** |
| **BSP Circular 1140** | **Operational risk** |
| SEC MC-6-2007 | IMA rules |
| IC Circulars | Pre-Need trust |
| RA 9160 (AMLA) | AML/CTF, STR, CTR |
| RA 10173 (DPA) | Privacy, ROPA, DSAR |
| FATCA / OECD-CRS | Tax reporting |

---

# 9. Workflow & State Diagrams

## 9.1 Order Lifecycle (State → Action → Next → Side-effects)
| From | Action | By | To | Side-effects |
|------|--------|----|----|--------------|
| (new) | Create | RM | Draft | Audit |
| Draft | Submit | RM | Pending-Auth | `order.submitted`; task to SRM |
| Pending-Auth | Authorize | SRM (tier match) | Authorized | `order.authorized`; fund reservation |
| Pending-Auth | Reject/Refer | SRM | Rejected / Draft | Notification |
| Authorized | Aggregate | Trader | Aggregated | Block linkage |
| Aggregated | Place | Trader | Placed | FIX out |
| Placed | Fill | Broker | Partially-Filled / Filled | Trade ticket |
| Filled | Confirm | MO | Confirmed | Settlement eligible |
| Confirmed | Settle | BO | Settled | GL, SWIFT, advice |
| Settled | Reversal request | Ops | Reversal-Pending | Freeze |
| Reversal-Pending | Approve | Compliance | Reversed | Reverse postings |

## 9.2–9.9 Other Workflows
- Transfer, Contribution, Withdrawal, Upload (+ **Batch Rollback**), Reversal, Maintenance, **Corporate Action**, **NAV**, **Fee Billing**, **Kill-Switch**, **Whistleblower Case** — each has an explicit state machine in the companion .docx.

---

# 10. Notification & Communication Requirements

## 10.1 Notification Matrix (Extract)
| Event | Channels | Recipient | Opt-Out |
|-------|----------|-----------|---------|
| Order submitted | In-app + Email | SRM | N |
| Order authorized | In-app + Email | RM + Trader | N |
| Order rejected | In-app + Email + SMS | RM | N |
| Order filled | In-app + Email | RM + Client (opt-in) | Y |
| Settlement completed | Email + SMS + Push | Client + RM | Y (non-reg) |
| Settlement failed | In-app + Email + SMS (P1) | BO + Ops Head | N |
| Mandate breach | In-app + Email (High: SMS) | RM + Compliance + Client | N |
| Suitability refresh due | Email + In-app | Client + RM | N |
| AML/KYC refresh | Email + SMS + In-app | Client + RM + Compliance | N |
| Corporate-action entitlement | Email + In-app | Client + RM | Y |
| Kill-switch invoked | In-app + PagerDuty + SMS | All trading + CRO | N |
| Whistleblower case intake | Email | CCO + DPO | N |
| Reversal approved | In-app + Email | Ops + Client | N |
| BSP report generated | In-app + Email | Compliance Head + CRO | N |

## 10.2 Delivery SLA
In-app ≤ 2 s, Push ≤ 10 s, Email ≤ 5 min E2E, SMS ≤ 30 s; 3× retry + DLQ after 24 h.

## 10.3 Template Standards
Bank brand; responsive HTML email; SMS ≤ 160 chars, no PII; English primary (Filipino Phase 2); regulator-mandated notifications marked "Regulatory".

## 10.4 Consent
Client-Portal Preferences per-channel; consent log (ROPA-linked); regulator-mandated cannot opt out.

---

# 11. Reporting & Analytics

## 11.1 Operational Dashboards
RM Cockpit, Trader Cockpit, Compliance Workbench, Operations Control Tower, Executive Dashboard, Client Portal Dashboard — each real-time or ≤ 15 min.

## 11.2 Regulatory Reports
| Report | Regulator | Cadence |
|--------|-----------|---------|
| FRP Trust Schedules | BSP | Monthly |
| UITF NAVpu / Participations | BSP / TOAP | Daily |
| IMA Quarterly | SEC | Quarterly |
| Pre-Need Statement of Obligations | IC | Quarterly |
| STR | AMLC | On occurrence |
| CTR ≥ PHP 500k | AMLC | Daily trigger |
| FATCA IDES | BIR | Annual |
| CRS XML | BIR | Annual |
| WHT 1601-FQ | BIR | Monthly |
| **Forms 2306 / 2307 / 2316** | **BIR** | **Per event / annual** *(Finding #24)* |
| BSP Circular 1036 disclosures | BSP / Clients | Quarterly |
| Large Exposure | BSP | Monthly |
| ORE Quarterly | CRO / BSP | Quarterly *(Finding #23)* |

## 11.3 Analytical Marts
Star-schema (Snowflake/BigQuery); CDC every 15 min; facts (order, trade, settlement, position, navpu, fee, ore); dims (client, portfolio, security, counterparty, date, currency, branch, rm); dbt metric store; Power BI / Tableau with row-level security.

## 11.4 Performance Calculation
TWR (Modified Dietz), IRR, Brinson-Fachler attribution, Volatility, Sharpe, Max Drawdown, Tracking Error, 1-day 95 % VaR; GIPS-compliant composites (Phase 2).

## 11.5 Ad-hoc
Governed SQL workbench (Hex/JupyterHub); all queries logged and attributed; PII access requires elevated approval.

## 11.6 Additional Analytical Reports *(BDO RFI Gaps)*
- **RPT-ADD-001** Broker charge distribution report: daily/weekly/monthly transaction charges broken down by broker with PDTC, exchange, and clearing fees.
- **RPT-ADD-002** IREP dashboard: per-client investment risk escalation status, price-movement threshold breaches, RM actions taken.
- **RPT-ADD-003** Rebalancing summary report: per run — model used, portfolios affected, trades generated, execution status, post-rebalance allocation vs. target.
- **RPT-ADD-004** PERA regulatory reporting pack: BSP Contributor File, Transaction File, TCC summary, contribution-limit utilization.
- **RPT-ADD-005** Scheduled-plan execution report: EIP/ERP execution success/failure rates, retry outcomes, paused plans.
- **RPT-ADD-006** VAR back-testing report: Basel traffic-light zone analysis, exception count, model performance.
- **RPT-ADD-007** Compliance override report: all hard/soft overrides with justifications, override frequency by rule and user.

---

# 12. Migration & Launch Plan

## 12.1 Migration Scope (Highlights)
| Domain | Volume | Strategy |
|--------|--------|----------|
| Clients & KYC | 120k | One-shot + 30-day delta |
| Portfolios & Mandates | 45k | One-shot + digitization |
| Securities | 8k | Subscribe + reconcile |
| Open Orders / Positions | 400k | Cut-off snapshot + parallel run |
| Historical Txns (7 yr) | 20 M | Bulk COPY with checksum |
| NAVpu History (10 yr × 500 UITF) | ~1.8 M | Bulk load + recompute |
| Documents (PDF/KYC) | 3 M docs / 4 TB | Object copy + manifest |

## 12.2 Parallel Run — Graduated Tolerance *(Finding #27)*
| Week | NAVpu tolerance | Cash tolerance | Position tolerance |
|------|-----------------|----------------|--------------------|
| 1 | ± 0.25 % | ± PHP 10 000 | ± 0.1 % |
| 2 | ± 0.10 % | ± PHP 1 000 | ± 0.02 % |
| 3+ | ± 0.01 % | ± PHP 1 | 0 |

Exit criterion: **5 consecutive zero-break days** on Week-3 tolerances.

## 12.3 Phased Rollout
| Phase | Scope | Months |
|-------|-------|--------|
| 0 Foundation | Infra, IAM, reference-data, audit, onboarding | 1–3 |
| 1 FO MVP | Capture, Authorize, Aggregate, Place, stubs | 4–8 |
| 2 Full OMS | Execute, Confirm, Settle, Transfers, C/W, Reversal, Upload, Tax, Fees, CA, NAV, Portal | 9–14 |
| 3 Advanced | AI Suitability, AI Fraud, Real-time analytics, Active-Active DR (post-BSP), RM Mobile v2, Open-API | 15–20 |

## 12.4 Go-Live Checklist
Regulatory (BSP 1086 notification, DPA, BCP, TOAP); Security (pentest clean, DR drill); Operational (runbook 2× rehearsed, RTO < 2 h, 24×7 war-room 10 days); Business (Trust Head/CRO/CCO sign-off, client comms); Technical (DNS plan, kill-switches wired, synthetics); Training (100 % certified); Monitoring (72 h green shadow); Data (zero-breaks × 5 days; legacy read-only).

## 12.5 Training & Change Management *(Finding #12)*
| Role | Training hours | Certification | Refresher |
|------|----------------|---------------|-----------|
| RM / SRM | 24 h | Mandatory | Annual |
| Trader | 32 h | Mandatory | Semi-annual |
| Middle / Back Office | 40 h | Mandatory | Semi-annual |
| Compliance / Risk | 32 h | Mandatory | Annual |
| Fund Accounting | 24 h | Mandatory | Annual |
| Client (self-service) | 15-min video + help-centre | n/a | On-demand |

Quick-reference cards printed; role-based LMS modules; competency quiz ≥ 80 %; change-champion network in every branch; post-go-live town halls at D+7, D+30, D+90.

## 12.6 Legacy Retention *(Finding #29)*
Legacy system in **read-only mode for 7 years** to satisfy BSP retention; decommission planned at Year 7 + regulator sign-off.

## 12.7 Vendor Change Management *(Finding #31)*
Named-vendor register; 90-day advance-notice clauses; dual-vendor availability for mission-critical data (Bloomberg + Refinitiv); quarterly vendor-risk review.

## 12.8 People-Risk & Succession *(Finding #31)*
Key-person matrix; 1:1 cover for every Tier-1 role; documented runbooks; 30-day handover SOPs.

## 12.9 Test Strategy & UAT *(Findings #13, #30)*
- **Unit** ≥ 80 % coverage (branch).
- **Integration** ≥ 90 % of API contracts.
- **UAT** ≥ 95 % of FRs exercised.
- **Performance** per Section 8.9.
- **Security** SAST/DAST/SCA on every build + annual pen-test.
- **UAT Entry**: build green for 5 consecutive days; no open Sev-1/Sev-2.
- **UAT Exit**: 0 Sev-1, ≤ 3 Sev-2 with workaround, ≤ 25 Sev-3, defect trend downward ≥ 2 weeks.
- **Defect tolerance at go-live**: 0 Sev-1, 0 Sev-2, ≤ 10 Sev-3.

---

# 13. Glossary

**AFS** Available-for-Sale. **AMLA** Anti-Money Laundering Act (RA 9160). **AMLC** Anti-Money Laundering Council. **AUM** Assets Under Management. **BSP** Bangko Sentral ng Pilipinas. **BIR** Bureau of Internal Revenue. **CSA** Client Settlement Account. **CTR** Covered Transaction Report. **DPA** Data Privacy Act (RA 10173). **DPO** Data Protection Officer. **DSAR** Data Subject Access Request. **ECL** Expected Credit Loss. **Escrow** Fiduciary holding on conditions. **FATCA** Foreign Account Tax Compliance Act. **FVPL** Fair Value through Profit or Loss. **HTM** Held-to-Maturity. **IC** Insurance Commission. **IMA** Investment Management Account. **IMA-D / IMA-DS** Directed / Discretionary. **INMS** Investment in Non-Marketable Securities. **KIIDS** Key Investor Information Document Summary. **KYC** Know Your Customer. **LEI** Legal Entity Identifier. **Maker-Checker** 2-person control. **Mandate** Investment policy. **MORB** Manual of Regulations for Banks. **NAVpu** Net Asset Value per Unit. **NPC** National Privacy Commission. **OMS** Order Management System. **ORE** Operational Risk Event. **PDEx** Philippine Dealing & Exchange. **PhilPaSS** BSP RTGS. **PMT** Personal Management Trust. **Portfolio** Managed asset grouping. **ROPA** Record of Processing Activities. **RM / SRM** Relationship Manager / Senior RM. **RPO / RTO** Recovery Point / Time Objective. **SEC** Securities and Exchange Commission. **SoD** Segregation of Duties. **SSI** Standard Settlement Instruction. **STP** Straight-Through Processing. **STR** Suspicious Transaction Report. **SWIFT** SWIFT network messages. **TCA** Trust Clearing Account. **TOAP** Trust Officers Association of the Philippines. **TSA** Trust Settlement Account. **Trustee** Fiduciary legal person. **UDSCL** Unquoted Debt Securities Classified as Loans. **UITF** Unit Investment Trust Fund. **UBO** Ultimate Beneficial Owner. **WHT** Withholding Tax. **WORM** Write-Once Read-Many.

---

# 14. Appendices

## 14.1 A — Regulatory Reference
BSP MORB Part 9; BSP Circulars 1036, 982, **1086**, **1108**, **1122**, **1140**; SEC MC-6-2007; IC Pre-Need circulars; RA 9160 (as amended); RA 10173; BIR regulations (WHT, FATCA, CRS); TOAP rules.

## 14.2 B — Standard Error Codes
| Code | HTTP | Meaning | Retryable |
|------|------|---------|-----------|
| VALIDATION_ERROR | 400 | Field fail | N |
| UNAUTHORIZED | 401 | Missing/invalid creds | N |
| FORBIDDEN | 403 | RBAC/ABAC deny | N |
| NOT_FOUND | 404 | Missing resource | N |
| CONFLICT | 409 | Version conflict | Y (refresh) |
| UNPROCESSABLE | 422 | Business rule violated | N |
| RATE_LIMITED | 429 | Quota | Y |
| DEPENDENCY_UNAVAILABLE | 503 | Upstream down | Y |
| INTERNAL | 500 | Unhandled | Y |

## 14.3 C — CSV Upload Template
Headers (UTF-8, no BOM, ISO dates):
`portfolio_id,transaction_type,side,security_isin,quantity,price,currency,value_date,settlement_account,broker_bic,instruction_type,good_till,client_reference,remarks`

Example row:
`PORT-00045,BUY,B,PHY7225E1116,50000,102.35,PHP,2026-04-20,TSA-PHP,BKPHPHMMXXX,LIMIT,2026-04-20,CL-778231,"Roll-over of PDS matured on 2026-04-18"`

## 14.4 D — Mandatory Audit Fields
`created_at, created_by, updated_at, updated_by, version, status, is_deleted, tenant_id, correlation_id, audit_hash` — on every entity.

## 14.5 E — Market-Data Vendors
Bloomberg B-Pipe (primary); Refinitiv Elektron (secondary); PDEx BondTrader; PSE EDGE; BAP-PDEx; BSP Reference Rate.

## 14.6 F — Indicative Cost Summary *(Finding #15)*
| Category | Year 1 (PHP M) | Run-rate (PHP M/yr) |
|----------|----------------|---------------------|
| Cloud infra (multi-AZ + DR) | 55 | 65 |
| Platform licences (DB, Kafka, observability) | 40 | 35 |
| Market-data (Bloomberg + Refinitiv + PDEx) | 85 | 95 |
| SWIFT fees | 18 | 18 |
| Sanctions-screening (World-Check/Dow Jones) | 12 | 12 |
| Implementation partner | 140 | — |
| SRE + platform engineering | 50 | 70 |
| Training & change management | 20 | 8 |
| Contingency (10 %) | 42 | 30 |
| **Total** | **462** | **333** |

## 14.7 G — BSP Cloud Outsourcing Workstream *(Finding #20)*
1. Notification to BSP ≥ 30 days pre-go-live.
2. Cloud Service Provider (CSP) due-diligence pack.
3. Data-classification & residency evidence.
4. Exit plan & data-portability clause in CSP contract.
5. Annual attestation to BSP.

## 14.8 H — ROPA Artifact *(Finding #19)*
Structure: {processing_activity, lawful_basis, data_subjects, data_categories (with PII tags), recipients, retention, cross-border_transfers, security_measures, last_reviewed_by, last_reviewed_at}. Maintained by the DPO.

## 14.9 I — Document Sign-off
| Role | Name | Signature / Date |
|------|------|------------------|
| Trust Business Head | | |
| Chief Risk Officer | | |
| Chief Compliance Officer | | |
| Chief Information Officer / CTO | | |
| Head of Operations | | |
| Data Protection Officer | | |
| Project Sponsor | | |

---

## Appendix J — Adversarial-Review Change Log (v1.0 → v1.0-FINAL)

All 31 findings from the adversarial evaluation have been integrated:

**Missing modules**: #1 Onboarding/KYC, #2 Fee & Billing, #3 Corporate Actions, #4 Fund Accounting/NAV, #5 Cash/FX, #7 Whistleblower, #8 Trade Surveillance, #9 Kill-Switch, #10 ORE Ledger, #11 AI Fraud (Phase 3), #12 Training & Change Mgmt, #13 Test Strategy, #14 Capacity Plan, #15 Cost Summary, #16 Vendor Change Mgmt.
**Data-model**: #17 PII tags, #18 Residency tags, #19 ROPA.
**Regulatory**: #20 BSP 1086, #21 BSP 1108, #22 BSP 1122, #23 BSP 1140, #24 BIR 2306/2307/2316, #25 Sanctions vendor.
**Controls**: #26 Tiered 2/4/6-eyes, #27 Graduated parallel tolerance, #28 Batch rollback, #29 Legacy 7-year read-only.
**Delivery**: #30 UAT entry/exit + defect tolerance, #31 People-risk & vendor-change.

— End of Document —
