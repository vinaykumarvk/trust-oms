# TrustOMS Philippines — Functional Test Cases
## Traceable QA Test Suite Derived from BRD v1.0-FINAL

**Project**: TrustOMS Philippines (Trust Banking Order Management System)
**Source**: TrustOMS-Philippines-BRD-FINAL.md
**Author**: ADS Softek
**Date**: 17 April 2026
**Version**: 1.0
**Classification**: CONFIDENTIAL

---

## 1. Test Coverage Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 564 |
| FRs Covered | 140 + 72 GAP FRs / 212 |
| Happy-Path Tests | 212 |
| Negative / Error Tests | 144 |
| Boundary Tests | 70 |
| Workflow / State Tests | 62 |
| Permission / Authorization Tests | 34 |
| Integration / E2E Tests | 24 |
| Process-Flow Traversal Tests | 12 |
| Gap Test Cases (BDO RFI) | 252 |
| Critical Priority | 172 |
| High Priority | 218 |
| Medium Priority | 138 |
| Low Priority | 36 |

### Format

Each test case is rendered as a Markdown table. All fields are mandatory:
`Test ID | Name | Category | Linked FR | Priority | Preconditions | Test Steps | Test Data | Expected Result | Postconditions`.

Boundary tests follow the **n–1 / n / n+1** rule at every numeric threshold in the BRD (e.g., tiered approvals at PHP 50 M and PHP 500 M, NAV deviation 0.25 %, STP ≥ 92 %, file upload 10 000 rows).

---

## 2. Traceability Matrix (FR → Test IDs)

| FR | Module | Test IDs |
|----|--------|----------|
| FR-ONB-001 | Onboarding | TC-ONB001-01, -02, -03 |
| FR-ONB-002 | Onboarding | TC-ONB002-01, -02, -03 |
| FR-ONB-003 | Onboarding | TC-ONB003-01, -02 |
| FR-ONB-004 | Onboarding | TC-ONB004-01, -02 |
| FR-ONB-005 | Onboarding | TC-ONB005-01, -02, -03 |
| FR-ONB-006 | Onboarding | TC-ONB006-01, -02 |
| FR-ONB-007 | Onboarding | TC-ONB007-01, -02 |
| FR-MNT-001…015 | Maintenance | TC-MNT001-01..02 … TC-MNT015-01..02 |
| FR-ORD-001…020 | Order Capture | TC-ORD001-01..03 … TC-ORD020-01..02 |
| FR-AUT-001…003 | Authorization | TC-AUT001-01..04, TC-AUT002-01..04, TC-AUT003-01..04 |
| FR-AGG-001…006 | Aggregation | TC-AGG001..006 (each × 2) |
| FR-EXE-001…008 | Execution | TC-EXE001..008 (each × 2) |
| FR-CFR-001…006 | Confirmation | TC-CFR001..006 (each × 2) |
| FR-STL-001…010 | Settlement | TC-STL001..010 (each × 2) |
| FR-TRF-001…007 | Transfer | TC-TRF001..007 (each × 2) |
| FR-CON-001…005 | Contribution | TC-CON001..005 (each × 2) |
| FR-WDL-001…006 | Withdrawal | TC-WDL001..006 (each × 2) |
| FR-CA-001…005 | Corporate Actions | TC-CA001..005 (each × 2) |
| FR-NAV-001…005 | Fund Accounting / NAV | TC-NAV001..005 (each × 2–3) |
| FR-FEE-001…005 | Fee & Billing | TC-FEE001..005 (each × 2) |
| FR-CSH-001…004 | Cash / FX | TC-CSH001..004 (each × 2) |
| FR-TAX-001…004 | Taxation | TC-TAX001..004 (each × 2) |
| FR-REV-001…004 | Reversal | TC-REV001..004 (each × 2) |
| FR-UPL-001…006 | Upload | TC-UPL001..006 (each × 2–3) |
| FR-SRV-001…003 | Trade Surveillance | TC-SRV001..003 (each × 2) |
| FR-KSW-001…003 | Kill-Switch | TC-KSW001..003 (each × 2) |
| FR-ORE-001…004 | Op-Risk Events | TC-ORE001..004 (each × 2) |
| FR-WHB-001…003 | Whistleblower | TC-WHB001..003 (each × 2) |
| FR-AID-001…003 | AI Fraud | TC-AID001..003 (each × 2) |
| **GAP FRs (BDO RFI)** | | |
| FR-GAP-OTF-001…006 | Order Type & TIF | TC-GAP-OTF001-01..03 … TC-GAP-OTF006-01..02 |
| FR-GAP-OML-001…008 | Order Maintenance | TC-GAP-OML001-01..02 … TC-GAP-OML008-01..03 |
| FR-GAP-EAF-001…008 | Execution & Allocation | TC-GAP-EAF001-01..02 … TC-GAP-EAF008-01..02 |
| FR-GAP-VAL-001…020 | Validation & Compliance | TC-GAP-VAL001-01..03 … TC-GAP-VAL020-01..02 |
| FR-GAP-PMR-001…011 | Portfolio Modeling | TC-GAP-PMR001-01..02 … TC-GAP-PMR011-01..02 |
| FR-GAP-RSK-001…011 | Risk & Asset Mgmt | TC-GAP-RSK001-01..02 … TC-GAP-RSK011-01..02 |
| FR-GAP-CHL-001…010 | Channel & Portal | TC-GAP-CHL001-01..02 … TC-GAP-CHL010-01..02 |
| FR-GAP-CPS-001…009 | Cash/Payment/Settlement | TC-GAP-CPS001-01..02 … TC-GAP-CPS009-01..02 |
| FR-GAP-SRP-001…012 | Scheduled & Retirement | TC-GAP-SRP001-01..03 … TC-GAP-SRP012-01..02 |

---

## 3. Test Cases — Module: Client Onboarding & KYC

### TC-ONB001-01 — Capture identity (happy)

| Field | Value |
|---|---|
| Test ID | TC-ONB001-01 |
| Name | RM captures new client identity successfully |
| Category | Happy Path |
| Linked FR | FR-ONB-001 |
| Priority | Critical |
| Preconditions | RM is logged in; no existing client with TIN 123-456-789-000. |
| Test Steps | 1. Click **New Client**. 2. Enter legal_name "Juan D. Cruz". 3. Enter TIN "123-456-789-000". 4. Enter DOB "1982-06-15". 5. Upload Government ID (PNG ≤ 5 MB). 6. Click **Submit**. |
| Test Data | legal_name=Juan D. Cruz; TIN=123-456-789-000; DOB=1982-06-15; ID-type=PhilID; ID-image=passport.png (2 MB). |
| Expected Result | Client record created with status=**KYC-Pending**; client_id=**CL-000125** returned; e-KYC verification task auto-created; audit entry written. |
| Postconditions | One new client exists in KYC-Pending queue. |

### TC-ONB001-02 — Duplicate TIN rejected (negative)

| Field | Value |
|---|---|
| Test ID | TC-ONB001-02 |
| Name | Duplicate TIN prevented at onboarding |
| Category | Negative |
| Linked FR | FR-ONB-001 |
| Priority | High |
| Preconditions | A client with TIN 123-456-789-000 already exists (CL-000123). |
| Test Steps | 1. Click **New Client**. 2. Enter TIN "123-456-789-000". 3. Click **Submit**. |
| Test Data | TIN duplicate. |
| Expected Result | Error: `{"error":{"code":"CONFLICT","message":"A client with this TIN already exists","field":"TIN"}}`; form blocks submit. |
| Postconditions | No new client created. |

### TC-ONB001-03 — Invalid TIN format (negative)

| Field | Value |
|---|---|
| Test ID | TC-ONB001-03 |
| Name | Malformed TIN rejected |
| Category | Negative |
| Linked FR | FR-ONB-001 |
| Priority | High |
| Preconditions | RM logged in. |
| Test Steps | 1. New Client → TIN "ABC-123". 2. Submit. |
| Test Data | TIN=ABC-123 |
| Expected Result | Inline field error: "TIN must be ###-###-###-000 (12 digits + 3)." Submit blocked. |
| Postconditions | No client created. |

### TC-ONB002-01 — Risk rating assigned (happy)

| Field | Value |
|---|---|
| Test ID | TC-ONB002-01 |
| Name | System computes Medium risk for standard individual |
| Category | Happy Path |
| Linked FR | FR-ONB-002 |
| Priority | Critical |
| Preconditions | Client CL-000125 in KYC-Pending with full questionnaire complete. |
| Test Steps | 1. Open client CL-000125. 2. Click **Compute Risk**. 3. Observe score. |
| Test Data | Occupation=Salaried; Country=PH; PEP=No; CashTxn=No. |
| Expected Result | risk_score=Medium; audit written with score components; no auto-escalation. |
| Postconditions | Client risk=Medium. |

### TC-ONB002-02 — High-risk auto-escalation (boundary/workflow)

| Field | Value |
|---|---|
| Test ID | TC-ONB002-02 |
| Name | PEP flag forces High and routes to Compliance |
| Category | Boundary / Workflow |
| Linked FR | FR-ONB-002 |
| Priority | Critical |
| Preconditions | Client CL-000126 KYC-Pending. |
| Test Steps | 1. Set PEP=Yes. 2. Compute risk. |
| Test Data | PEP=Yes |
| Expected Result | risk_score=High; case auto-routed to Compliance Officer; notification NTF-015; status=**Pending-Compliance-Review**. |
| Postconditions | Compliance queue has the case. |

### TC-ONB002-03 — Missing questionnaire blocks scoring (negative)

| Field | Value |
|---|---|
| Test ID | TC-ONB002-03 |
| Name | Incomplete questionnaire prevents risk compute |
| Category | Negative |
| Linked FR | FR-ONB-002 |
| Priority | High |
| Preconditions | Client with only 40% questionnaire. |
| Test Steps | 1. Click **Compute Risk**. |
| Test Data | incomplete |
| Expected Result | Error "VALIDATION_ERROR: Questionnaire completion < 100 %." |
| Postconditions | No score written. |

### TC-ONB003-01 — UBO chain capture (happy)

| Field | Value |
|---|---|
| Test ID | TC-ONB003-01 |
| Name | Corporate client with ≥ 25 % UBO captured |
| Category | Happy Path |
| Linked FR | FR-ONB-003 |
| Priority | Critical |
| Preconditions | Corporate onboarding (ACME Mfg). |
| Test Steps | 1. Add UBO "Ana Reyes" 30 %. 2. Add UBO "Ben Santos" 40 %. 3. Add UBO "Carla Lim" 30 %. 4. Save. |
| Test Data | 3 UBOs totalling 100 %. |
| Expected Result | UBO chain saved; each ≥ 25 % flagged for screening (FR-ONB-005). |
| Postconditions | 3 UBO records. |

### TC-ONB003-02 — UBO aggregate ≤ 25 % warns (boundary)

| Field | Value |
|---|---|
| Test ID | TC-ONB003-02 |
| Name | No UBO reaches the 25 % threshold |
| Category | Boundary |
| Linked FR | FR-ONB-003 |
| Priority | High |
| Preconditions | Corporate client with 10 shareholders @ 10 % each. |
| Test Steps | 1. Enter all 10 shareholders. 2. Save. |
| Test Data | 10 × 10 % |
| Expected Result | Warning: "No shareholder meets 25 %; disclose control basis." Case flagged for Compliance review. |
| Postconditions | Client saved with warning flag. |

### TC-ONB004-01 — FATCA self-cert captured (happy)

| Field | Value |
|---|---|
| Test ID | TC-ONB004-01 |
| Name | US-person flag propagates to tax engine |
| Category | Happy Path |
| Linked FR | FR-ONB-004 |
| Priority | Critical |
| Preconditions | New individual client. |
| Test Steps | 1. Complete FATCA form. 2. Tick "US person = Yes". 3. Enter US-TIN. 4. Save. |
| Test Data | US-TIN=123-45-6789 |
| Expected Result | Client tagged FATCA=Reportable; tax engine subscribes client for annual IDES export. |
| Postconditions | FATCA flag set; consent log row written. |

### TC-ONB004-02 — Missing US-TIN on US-person blocks save (negative)

| Field | Value |
|---|---|
| Test ID | TC-ONB004-02 |
| Name | US-person without US-TIN is rejected |
| Category | Negative |
| Linked FR | FR-ONB-004 |
| Priority | High |
| Preconditions | New individual. |
| Test Steps | 1. US-person=Yes; US-TIN blank; Save. |
| Test Data | missing |
| Expected Result | VALIDATION_ERROR on US-TIN; submit blocked. |
| Postconditions | none. |

### TC-ONB005-01 — Sanctions clear (happy)

| Field | Value |
|---|---|
| Test ID | TC-ONB005-01 |
| Name | Sanctions screening returns no hit |
| Category | Happy Path |
| Linked FR | FR-ONB-005 |
| Priority | Critical |
| Preconditions | Client onboarded; World-Check mock returns 0 hits. |
| Test Steps | 1. Trigger **Screen**. 2. Observe result. |
| Test Data | name=Juan D. Cruz |
| Expected Result | screening_result=Clear; audit written; case auto-continues. |
| Postconditions | Status advances. |

### TC-ONB005-02 — Sanctions positive hit blocks (negative)

| Field | Value |
|---|---|
| Test ID | TC-ONB005-02 |
| Name | Positive sanctions hit halts onboarding |
| Category | Negative / Workflow |
| Linked FR | FR-ONB-005 |
| Priority | Critical |
| Preconditions | Screening returns 1 UN-list match ≥ 85 %. |
| Test Steps | 1. Screen. |
| Test Data | test_name=Osama Example |
| Expected Result | status=Onboarding-Blocked; notification to CCO + CRO; STR candidate auto-created. |
| Postconditions | Case frozen. |

### TC-ONB005-03 — Rescreening cadence runs (integration)

| Field | Value |
|---|---|
| Test ID | TC-ONB005-03 |
| Name | Daily rescreen job flags newly-listed client |
| Category | Integration |
| Linked FR | FR-ONB-005 |
| Priority | High |
| Preconditions | Existing client; vendor list updated overnight. |
| Test Steps | 1. Trigger daily rescreen batch. 2. Inspect results. |
| Test Data | vendor_delta=1 hit |
| Expected Result | Flagged case appears in Compliance Workbench; NTF sent. |
| Postconditions | Alert raised. |

### TC-ONB006-01 — Suitability profile saved (happy)

| Field | Value |
|---|---|
| Test ID | TC-ONB006-01 |
| Name | Client suitability version created |
| Category | Happy Path |
| Linked FR | FR-ONB-006 |
| Priority | Critical |
| Preconditions | KYC=Cleared. |
| Test Steps | 1. Fill risk tolerance questionnaire. 2. Save. |
| Test Data | horizon=5y; risk=Moderate |
| Expected Result | suitability_version=1 stored; used by order-capture suitability check. |
| Postconditions | Version available. |

### TC-ONB006-02 — Re-save creates new version (workflow)

| Field | Value |
|---|---|
| Test ID | TC-ONB006-02 |
| Name | Editing suitability creates v2, v1 retained |
| Category | Workflow |
| Linked FR | FR-ONB-006 |
| Priority | High |
| Preconditions | v1 exists. |
| Test Steps | 1. Edit. 2. Save. |
| Test Data | risk=Aggressive |
| Expected Result | v2 active; v1 read-only in history. |
| Postconditions | Two versions. |

### TC-ONB007-01 — Annual KYC refresh reminder (happy)

| Field | Value |
|---|---|
| Test ID | TC-ONB007-01 |
| Name | High-risk client notified 30 days before due |
| Category | Happy Path |
| Linked FR | FR-ONB-007 |
| Priority | High |
| Preconditions | High-risk client; last refresh 11 months ago. |
| Test Steps | 1. Run scheduler. |
| Test Data | risk=High; cadence=1y |
| Expected Result | NTF-015 sent via Email+SMS+In-app to Client+RM+Compliance. |
| Postconditions | Notification logged. |

### TC-ONB007-02 — Refresh overdue auto-blocks transactions (negative/workflow)

| Field | Value |
|---|---|
| Test ID | TC-ONB007-02 |
| Name | Overdue KYC blocks new orders |
| Category | Negative / Workflow |
| Linked FR | FR-ONB-007 |
| Priority | Critical |
| Preconditions | KYC overdue by > 30 days. |
| Test Steps | 1. RM attempts Order Capture. |
| Test Data | client has overdue KYC. |
| Expected Result | UNPROCESSABLE error "Client KYC overdue; refresh required before transacting." |
| Postconditions | No order created. |

---

## 4. Test Cases — Module: Maintenance (Reference Data)

(15 FRs × avg 2 tests = 30 test cases)

### TC-MNT001-01 — Create portfolio record (happy)

| Field | Value |
|---|---|
| Test ID | TC-MNT001-01 |
| Name | Maintenance Maker creates a new portfolio |
| Category | Happy Path |
| Linked FR | FR-MNT-001 |
| Priority | Critical |
| Preconditions | Maker logged in; client CL-000123 cleared. |
| Test Steps | 1. Maintenance → Portfolios → Create. 2. type=IMA-Directed; base_ccy=PHP; mandate_id=MAN-IMA-DIR-V3. 3. Save. |
| Test Data | as above |
| Expected Result | status=Pending-Auth; mailbox task to Maintenance Checker. |
| Postconditions | Portfolio in Pending-Auth. |

### TC-MNT001-02 — Checker authorises (workflow)

| Field | Value |
|---|---|
| Test ID | TC-MNT001-02 |
| Name | Maintenance Checker approves portfolio |
| Category | Workflow |
| Linked FR | FR-MNT-001 |
| Priority | Critical |
| Preconditions | Pending-Auth record from TC-MNT001-01. |
| Test Steps | 1. Checker opens record. 2. Approve. |
| Test Data | — |
| Expected Result | status=Active; reference-data bus event emitted; cache invalidated. |
| Postconditions | Portfolio usable. |

### TC-MNT002-01 — Same-user maker/checker blocked (permission)

| Field | Value |
|---|---|
| Test ID | TC-MNT002-01 |
| Name | Maker cannot authorise own record |
| Category | Permission |
| Linked FR | FR-MNT-002 |
| Priority | Critical |
| Preconditions | Same user as maker. |
| Test Steps | 1. Same user clicks Approve on own draft. |
| Test Data | — |
| Expected Result | FORBIDDEN "SoD violation: maker ≠ checker". |
| Postconditions | unchanged. |

### TC-MNT003-01 — Security master create (happy)

| Field | Value |
|---|---|
| Test ID | TC-MNT003-01 |
| Name | New ISIN added and priced |
| Category | Happy Path |
| Linked FR | FR-MNT-003 |
| Priority | High |
| Preconditions | Bloomberg feed up. |
| Test Steps | 1. Security → Add ISIN "PHY7225E1116". 2. Save. |
| Test Data | ISIN=PHY7225E1116 |
| Expected Result | Record Pending-Auth; on approval, price feed subscription active. |
| Postconditions | security usable. |

### TC-MNT003-02 — Invalid ISIN checksum (negative)

| Field | Value |
|---|---|
| Test ID | TC-MNT003-02 |
| Name | ISIN rejected on failed checksum |
| Category | Negative |
| Linked FR | FR-MNT-003 |
| Priority | High |
| Preconditions | — |
| Test Steps | 1. Add ISIN "PHY7225E1119" (bad checksum). 2. Save. |
| Test Data | invalid ISIN |
| Expected Result | VALIDATION_ERROR field=ISIN. |
| Postconditions | none. |

### TC-MNT004-01 — Counterparty with LEI (happy)

| Field | Value |
|---|---|
| Test ID | TC-MNT004-01 |
| Name | Broker added with valid LEI/BIC |
| Category | Happy Path |
| Linked FR | FR-MNT-004 |
| Priority | High |
| Preconditions | — |
| Test Steps | 1. Counterparty → Add "BK PH". 2. LEI, BIC. 3. Save. |
| Test Data | BIC=BKPHPHMMXXX |
| Expected Result | Pending-Auth. |
| Postconditions | — |

### TC-MNT004-02 — Invalid BIC (negative)

| Field | Value |
|---|---|
| Test ID | TC-MNT004-02 |
| Name | BIC length ≠ 8/11 rejected |
| Category | Negative |
| Linked FR | FR-MNT-004 |
| Priority | Medium |
| Preconditions | — |
| Test Steps | 1. BIC="BKPHPH". Save. |
| Test Data | BIC=6 chars |
| Expected Result | VALIDATION_ERROR. |
| Postconditions | — |

### TC-MNT005-01 — Limit update creates new version (workflow)

| Field | Value |
|---|---|
| Test ID | TC-MNT005-01 |
| Name | Limit record versioned on change |
| Category | Workflow |
| Linked FR | FR-MNT-005 |
| Priority | High |
| Preconditions | Existing limit record v1. |
| Test Steps | 1. Edit limit_amount. 2. Save. 3. Checker approve. |
| Test Data | new_amount=PHP 100 M |
| Expected Result | v2 active; v1 kept as history. |
| Postconditions | Two versions. |

### TC-MNT006-01 — ECL rule create (happy)

| Field | Value |
|---|---|
| Test ID | TC-MNT006-01 |
| Name | ECL threshold rule created |
| Category | Happy Path |
| Linked FR | FR-MNT-006 |
| Priority | Medium |
| Preconditions | — |
| Test Steps | 1. Rules → ECL → Add. 2. PD=2%, LGD=40%. Save. |
| Test Data | PD,LGD |
| Expected Result | rule stored Pending-Auth. |
| Postconditions | — |

### TC-MNT006-02 — ECL probability > 100 % (boundary)

| Field | Value |
|---|---|
| Test ID | TC-MNT006-02 |
| Name | PD > 100 % rejected |
| Category | Boundary |
| Linked FR | FR-MNT-006 |
| Priority | High |
| Preconditions | — |
| Test Steps | 1. PD=101. Save. |
| Test Data | PD=101 |
| Expected Result | VALIDATION_ERROR "0 ≤ PD ≤ 100". |
| Postconditions | — |

### TC-MNT007-01 — Soft-delete preserves history (workflow)

| Field | Value |
|---|---|
| Test ID | TC-MNT007-01 |
| Name | Security marked inactive retains holdings visibility |
| Category | Workflow |
| Linked FR | FR-MNT-007 |
| Priority | Medium |
| Preconditions | Existing security with open positions. |
| Test Steps | 1. Deactivate. 2. Checker approve. |
| Test Data | — |
| Expected Result | status=Inactive; no new orders allowed; positions still visible. |
| Postconditions | — |

### TC-MNT008-01 — Benchmark curve import (happy)

| Field | Value |
|---|---|
| Test ID | TC-MNT008-01 |
| Name | BVAL curve imported for given date |
| Category | Happy Path |
| Linked FR | FR-MNT-008 |
| Priority | High |
| Preconditions | Feed reachable. |
| Test Steps | 1. Trigger import. |
| Test Data | date=2026-04-17 |
| Expected Result | 20+ tenors stored; used by NAV pricing fall-back. |
| Postconditions | — |

### TC-MNT008-02 — Missing tenor point (negative)

| Field | Value |
|---|---|
| Test ID | TC-MNT008-02 |
| Name | Missing 10Y tenor raises alert |
| Category | Negative |
| Linked FR | FR-MNT-008 |
| Priority | Medium |
| Preconditions | vendor returns gap. |
| Test Steps | 1. Import. |
| Test Data | gap at 10Y |
| Expected Result | ingest partial; NTF-019 raised; Ops ticket opened. |
| Postconditions | — |

### TC-MNT009-01 — Mandate create (happy)

| Field | Value |
|---|---|
| Test ID | TC-MNT009-01 |
| Name | Mandate digitized with asset-mix constraints |
| Category | Happy Path |
| Linked FR | FR-MNT-009 |
| Priority | Critical |
| Preconditions | — |
| Test Steps | 1. Mandate → Add. 2. Equity ≤ 40%, Bond ≥ 50%. Save. |
| Test Data | as above |
| Expected Result | Pending-Auth. |
| Postconditions | — |

### TC-MNT009-02 — Sum of mins > 100 % (boundary)

| Field | Value |
|---|---|
| Test ID | TC-MNT009-02 |
| Name | Infeasible constraints rejected |
| Category | Boundary |
| Linked FR | FR-MNT-009 |
| Priority | Critical |
| Preconditions | — |
| Test Steps | 1. Set equity_min=60%, bond_min=50%. Save. |
| Test Data | 60+50=110 |
| Expected Result | UNPROCESSABLE "Minimum allocations sum > 100 %". |
| Postconditions | — |

### TC-MNT010…015 — (Counterparty, tax-rate, holiday-calendar, pricing-source hierarchy, SSI, broker SLA)

Each follows the maker-checker happy-path + negative template:

- **TC-MNT010-01/02** Counterparty SSI create / invalid IBAN.
- **TC-MNT011-01/02** WHT rate create / rate > 50 % rejected.
- **TC-MNT012-01/02** PH holiday calendar update / overlapping entries rejected.
- **TC-MNT013-01/02** Pricing source hierarchy create / missing fall-back rejected.
- **TC-MNT014-01/02** SSI create / missing BIC rejected.
- **TC-MNT015-01/02** Broker SLA create / SLA <= 0 rejected.

---

## 5. Test Cases — Module: Order Capture (FR-ORD-001…020)

### TC-ORD001-01 — Capture equity BUY (happy)

| Field | Value |
|---|---|
| Test ID | TC-ORD001-01 |
| Name | RM creates equity BUY within mandate |
| Category | Happy Path |
| Linked FR | FR-ORD-001 |
| Priority | Critical |
| Preconditions | Client CL-000123 active; KYC cleared; suitability v1 active; PORT-00045 active. |
| Test Steps | 1. New Order → PORT-00045. 2. Side=BUY; ISIN=PHY7225E1116; qty=50000; LIMIT=102.35; value_date=2026-04-20. 3. Submit. |
| Test Data | as above |
| Expected Result | order_no=2026-04-17-000123; status=Pending-Auth; suitability_check=PASSED; tier=2-eyes. |
| Postconditions | SRM queue has 1 item. |

### TC-ORD001-02 — Quantity 0 (boundary, negative)

| Field | Value |
|---|---|
| Test ID | TC-ORD001-02 |
| Name | Quantity must be > 0 |
| Category | Boundary / Negative |
| Linked FR | FR-ORD-001 |
| Priority | High |
| Preconditions | — |
| Test Steps | 1. qty=0. Submit. |
| Test Data | qty=0 |
| Expected Result | VALIDATION_ERROR "Quantity must be a positive integer". |
| Postconditions | none. |

### TC-ORD001-03 — Negative price rejected (negative)

| Field | Value |
|---|---|
| Test ID | TC-ORD001-03 |
| Name | Limit price must be > 0 |
| Category | Negative |
| Linked FR | FR-ORD-001 |
| Priority | High |
| Preconditions | — |
| Test Steps | 1. LIMIT=-1. |
| Test Data | LIMIT=-1 |
| Expected Result | VALIDATION_ERROR. |
| Postconditions | — |

### TC-ORD002-01 — Mandate breach flagged (happy workflow)

| Field | Value |
|---|---|
| Test ID | TC-ORD002-01 |
| Name | Pre-trade mandate check detects equity > 40 % |
| Category | Workflow |
| Linked FR | FR-ORD-002 |
| Priority | Critical |
| Preconditions | PORT-00045 currently 39 % equity; order would push to 42 %. |
| Test Steps | 1. Capture order. 2. Submit. |
| Test Data | — |
| Expected Result | Pre-trade breach warning; order status=Pending-Auth-Breach; mailbox to Risk + Compliance. |
| Postconditions | Breach visible on Compliance Workbench. |

### TC-ORD002-02 — Hard block on prohibited security (negative)

| Field | Value |
|---|---|
| Test ID | TC-ORD002-02 |
| Name | Security flagged prohibited blocked |
| Category | Negative |
| Linked FR | FR-ORD-002 |
| Priority | Critical |
| Preconditions | ISIN on prohibited list. |
| Test Steps | 1. Capture. Submit. |
| Test Data | prohibited ISIN |
| Expected Result | FORBIDDEN; order not created. |
| Postconditions | — |

### TC-ORD003-01 — Suitability fail on aggressive product (negative)

| Field | Value |
|---|---|
| Test ID | TC-ORD003-01 |
| Name | Conservative client blocked from aggressive UITF |
| Category | Negative |
| Linked FR | FR-ORD-003 |
| Priority | Critical |
| Preconditions | client risk=Conservative. |
| Test Steps | 1. Buy Aggressive-Equity-UITF. |
| Test Data | mismatch |
| Expected Result | UNPROCESSABLE "Suitability mismatch". |
| Postconditions | — |

### TC-ORD004-01 — Intraday price refresh (happy)

| Field | Value |
|---|---|
| Test ID | TC-ORD004-01 |
| Name | Price refreshed from Bloomberg on ISIN lookup |
| Category | Happy Path |
| Linked FR | FR-ORD-004 |
| Priority | High |
| Preconditions | Market open. |
| Test Steps | 1. Type ISIN. 2. Observe last_px. |
| Test Data | — |
| Expected Result | last_px shown within 2 s; trend ↑/↓ arrow. |
| Postconditions | — |

### TC-ORD005-01 — Draft save & resume (workflow)

| Field | Value |
|---|---|
| Test ID | TC-ORD005-01 |
| Name | Draft persists across session |
| Category | Workflow |
| Linked FR | FR-ORD-005 |
| Priority | High |
| Preconditions | RM captured partial order. |
| Test Steps | 1. Save draft. 2. Log out. 3. Log in. 4. My Drafts. |
| Test Data | — |
| Expected Result | draft visible, editable. |
| Postconditions | — |

### TC-ORD006-01…ORD020-02

Each FR in capture covers a specific facet (GTD order, all-or-none, odd-lot, short-sale flag, FX indicator, reason code, fund-transfer linkage, client reference, remarks, attach file, clone-from-template, split by portfolio, allocation method, block link, post-trade audit, etc.). Pattern:

- **TC-ORDxxx-01** Happy path with valid field.
- **TC-ORDxxx-02** Invalid value → VALIDATION_ERROR.
- **TC-ORDxxx-03** Boundary where numeric.

Example — **FR-ORD-010 (GTD expiry)**:

| Test ID | Category | Data | Expected |
|---|---|---|---|
| TC-ORD010-01 | Happy | good_till=2026-04-30 | GTD stored, expiry logic fires on date. |
| TC-ORD010-02 | Boundary | good_till=today | Accepted as DAY order; auto-expires 15:30. |
| TC-ORD010-03 | Negative | good_till=past | VALIDATION_ERROR "Date must be today or future". |

(Exhaustive list retained in companion .docx; same pattern applies to ORD-006 through ORD-020.)

---

## 6. Test Cases — Module: Authorization (Tiered)

### TC-AUT001-01 — 2-eyes approves PHP 5 M order (happy)

| Field | Value |
|---|---|
| Test ID | TC-AUT001-01 |
| Name | SRM approves order ≤ PHP 50 M |
| Category | Happy Path |
| Linked FR | FR-AUT-001 |
| Priority | Critical |
| Preconditions | Order 5 M in Pending-Auth by different Maker. |
| Test Steps | 1. SRM opens. 2. Approve. |
| Test Data | amount=5 M |
| Expected Result | status=Authorized; event `order.authorized.v1`; TSA reservation posted. |
| Postconditions | — |

### TC-AUT001-02 — 2-eyes same-user blocked (permission)

| Field | Value |
|---|---|
| Test ID | TC-AUT001-02 |
| Name | Maker cannot self-approve |
| Category | Permission |
| Linked FR | FR-AUT-001 |
| Priority | Critical |
| Preconditions | same user. |
| Test Steps | 1. Maker opens own order. 2. Click Approve. |
| Test Data | — |
| Expected Result | FORBIDDEN SoD. |
| Postconditions | — |

### TC-AUT001-03 — Boundary PHP 49 999 999 = 2-eyes (boundary)

| Test ID | Name | Data | Expected |
|---|---|---|---|
| TC-AUT001-03 | Amount 1 below threshold routes to 2-eyes | amount=49 999 999 | tier=2-eyes |

### TC-AUT001-04 — Exactly PHP 50 M = 2-eyes (boundary)

| Test ID | Name | Data | Expected |
|---|---|---|---|
| TC-AUT001-04 | Inclusive boundary rule | amount=50 000 000 | tier=2-eyes (rule: ≤) |

### TC-AUT002-01 — 4-eyes at PHP 100 M (happy)

| Field | Value |
|---|---|
| Test ID | TC-AUT002-01 |
| Name | SRM + Risk jointly approve PHP 100 M |
| Category | Happy Path / Workflow |
| Linked FR | FR-AUT-002 |
| Priority | Critical |
| Preconditions | Order 100 M captured. |
| Test Steps | 1. SRM approves. 2. Risk approves. |
| Test Data | 100 M |
| Expected Result | status advances only after 2 distinct approvals; event emitted; audit has two approver IDs. |
| Postconditions | — |

### TC-AUT002-02 — Only SRM approved, Risk pending (negative)

| Field | Value |
|---|---|
| Test ID | TC-AUT002-02 |
| Name | Single approval insufficient at tier-2 |
| Category | Negative |
| Linked FR | FR-AUT-002 |
| Priority | Critical |
| Preconditions | 100 M order, only SRM signed. |
| Test Steps | 1. Attempt to place. |
| Test Data | — |
| Expected Result | UNPROCESSABLE; must remain Pending-Auth-2. |
| Postconditions | — |

### TC-AUT002-03 — Boundary PHP 50 000 001 = 4-eyes (boundary)

| Data | Expected |
|---|---|
| amount=50 000 001 | tier=4-eyes |

### TC-AUT002-04 — Boundary PHP 500 000 000 = 4-eyes (inclusive)

| Data | Expected |
|---|---|
| amount=500 000 000 | tier=4-eyes |

### TC-AUT003-01 — 6-eyes at PHP 800 M (happy)

| Test ID | Name | Approvers | Expected |
|---|---|---|---|
| TC-AUT003-01 | SRM + Risk + Compliance required | 3 distinct approvers | status advances only after all three; audit shows IDs. |

### TC-AUT003-02 — Threshold PHP 500 000 001 = 6-eyes (boundary)

| Data | Expected |
|---|---|
| amount=500 000 001 | tier=6-eyes |

### TC-AUT003-03 — Two approvers only at 6-eyes (negative)

| Expected |
|---|
| Block placement; "6-eyes required". |

### TC-AUT003-04 — Committee override visible in audit (workflow)

| Expected |
|---|
| approver chain captured; regulator-pack export includes the three IDs. |

---

*(Test cases continue in the next section — see Part 2 below.)*

---

## 7. Test Cases — Module: Aggregation & Placement

### TC-AGG001-01 — Aggregate 5 RM orders into one block (happy)

| Field | Value |
|---|---|
| Test ID | TC-AGG001-01 |
| Name | Authorized orders combined into a block |
| Category | Happy Path |
| Linked FR | FR-AGG-001 |
| Priority | Critical |
| Preconditions | 5 Authorized orders, same ISIN PHY7225E1116, BUY. |
| Test Steps | 1. Trader queue → Aggregate. 2. Select 5 orders. 3. Create block. |
| Test Data | qty sum=250 000 |
| Expected Result | Block order with 5 child links; event `order.aggregated.v1`. |
| Postconditions | Child orders status=Aggregated. |

### TC-AGG001-02 — Mixed side rejected (negative)

| Expected |
|---|
| VALIDATION_ERROR: "Block requires same side"; block not created. |

### TC-AGG002-01 — Pro-rata allocation (happy)

| Data | Expected |
|---|---|
| Fill 80 % of block | Each child allocated 80 % of its qty; audit has pro-rata formula. |

### TC-AGG002-02 — Priority allocation (workflow)

| Expected |
|---|
| Priority client fully filled first; remainder pro-rata; audit captures method. |

### TC-AGG003-01 — Place to broker via FIX (happy)

| Expected |
|---|
| NewOrderSingle (35=D) sent; ClOrdID unique; timestamp stored. |

### TC-AGG003-02 — Broker DOWN → failover (negative/workflow)

| Expected |
|---|
| Primary broker session DOWN; auto-fail to secondary; alert NTF-019; order still Placed. |

### TC-AGG004-01 — Cancel placed order (workflow)

| Expected |
|---|
| Trader+SRM approve; 35=F cancel sent; status=Cancelled after broker ack. |

### TC-AGG004-02 — Cancel without SRM (permission)

| Expected |
|---|
| FORBIDDEN. |

### TC-AGG005-01 — Partial fill (workflow)

| Data | Expected |
|---|---|
| Block 250 000 → fill 100 000 | status=Partially-Filled; residual still working. |

### TC-AGG005-02 — Over-fill (negative)

| Expected |
|---|
| Broker sends qty > block; system rejects with UNPROCESSABLE; ops alert. |

### TC-AGG006-01 — FIX heartbeat lost (workflow)

| Expected |
|---|
| 30 s no heartbeat → session resynch; missed messages replay; no duplicate fills. |

### TC-AGG006-02 — Duplicate ClOrdID (negative)

| Expected |
|---|
| Session rejects duplicate; alert raised. |

---

## 8. Test Cases — Module: Execution & Fill (FR-EXE-001…008)

### TC-EXE001-01 — Fill ticket created (happy)

| Expected |
|---|
| Trade record created with price, qty, venue, exec_id; position updated intraday. |

### TC-EXE001-02 — Fill before Placed (negative)

| Expected |
|---|
| UNPROCESSABLE "Order not in Placed state". |

### TC-EXE002-01 — Slippage computed (happy)

| Data | Expected |
|---|---|
| limit 102.35, fill 102.40 | slippage=0.05; benchmark VWAP stored. |

### TC-EXE002-02 — Slippage beyond tolerance (workflow)

| Expected |
|---|
| slippage > 10 bps → breach alert; compliance notified. |

### TC-EXE003-01 — Allocation back to children (happy)

| Expected |
|---|
| Each child receives proportional fill; position update per portfolio; allocation_audit row. |

### TC-EXE003-02 — Under-fill < min allocation lot (boundary)

| Expected |
|---|
| Allocation uses rounding rule; residual to priority client; no orphan lot. |

### TC-EXE004-01 — Average price computed (happy)

| Expected |
|---|
| Multi-fill block → VWAP computed; stored on parent. |

### TC-EXE004-02 — Zero fills at end-of-day (workflow)

| Expected |
|---|
| DAY order with zero fills auto-expires at 15:30; status=Expired. |

### TC-EXE005-01 — Cancel on disconnect (workflow)

| Expected |
|---|
| Broker FIX disconnect → all working orders auto-cancelled; state=Cancelled. |

### TC-EXE005-02 — Resume after reconnect (workflow)

| Expected |
|---|
| On reconnect, no ghost orders; user-confirmed resume. |

### TC-EXE006-01 — Cross/off-exchange trade (happy)

| Expected |
|---|
| Manual trade ticket captured; Trader+SRM required; audit shows both. |

### TC-EXE006-02 — Missing counterparty (negative)

| Expected |
|---|
| VALIDATION_ERROR. |

### TC-EXE007-01 — Allocation audit export (happy)

| Expected |
|---|
| Regulator CSV includes every child allocation; checksum matches block. |

### TC-EXE007-02 — Edit audit after lock (permission)

| Expected |
|---|
| FORBIDDEN; audit record immutable. |

### TC-EXE008-01 — Real-time P&L refresh (happy)

| Expected |
|---|
| Trader Cockpit updates P&L within 2 s of fill event. |

### TC-EXE008-02 — Stale market data > 5 s (workflow)

| Expected |
|---|
| Banner "Market data stale"; NTF-019 triggered. |

---

## 9. Test Cases — Module: Confirmation & Settlement

### TC-CFR001-01 — Auto-match with broker note (happy)

| Data | Expected |
|---|---|
| Broker MT515 arrives; fields match within tolerance | status=Confirmed; Middle-Office alert cleared. |

### TC-CFR001-02 — Mismatch on qty > tolerance (negative)

| Expected |
|---|
| status=Exception; MO queue; email NTF-005. |

### TC-CFR002-01 — MO manual confirm (workflow)

| Expected |
|---|
| MO-M proposes match; MO-C approves; audit captures both. |

### TC-CFR002-02 — MO approves without evidence (negative)

| Expected |
|---|
| UNPROCESSABLE "Evidence attachment required". |

### TC-CFR003-01 — Large-size tolerance (boundary)

| Data | Expected |
|---|---|
| Qty diff 1 on 10 M block | within tolerance 0.00001% → auto-match. |

### TC-CFR003-02 — Qty diff above threshold (boundary)

| Data | Expected |
|---|---|
| Qty diff 10 | exception raised. |

### TC-CFR004-01 — Duplicate confirm arrives (negative)

| Expected |
|---|
| Idempotency-key catches; single confirmation retained; warning logged. |

### TC-CFR005-01 — CFR on cancelled order (negative)

| Expected |
|---|
| UNPROCESSABLE. |

### TC-CFR006-01 — End-of-day rec batch (integration)

| Expected |
|---|
| 20 000 trades reconcile in ≤ 15 min; exceptions shown. |

### TC-STL001-01 — Settle via PhilPaSS (happy)

| Expected |
|---|
| MT103/PhilPaSS sent; cash debit on TSA; GL posted to Finacle; client advice. |

### TC-STL001-02 — Insufficient funds (negative)

| Expected |
|---|
| UNPROCESSABLE "TSA balance insufficient"; status=Settlement-Pending-Funds. |

### TC-STL002-01 — SWIFT MT541 (delivery vs payment) happy |

| Expected |
|---|
| MT541 sent; custodian ack; status=Settled. |

### TC-STL002-02 — Custodian reject (workflow)

| Expected |
|---|
| MT548 reject; status=Settlement-Failed; NTF-007; ops ticket. |

### TC-STL003-01 — Value-date splitting (happy)

| Data | Expected |
|---|---|
| T+2 equity | Settles on calendar day T+2; ignores PH holiday. |

### TC-STL003-02 — Holiday shift (boundary)

| Expected |
|---|
| Value date falls on holiday → auto-shift to next business day; advice updated. |

### TC-STL004-01 — Partial settle (workflow)

| Expected |
|---|
| Partial qty settles; residual stays Pending. |

### TC-STL005-01 — Reconciliation auto-match (happy)

| Expected |
|---|
| Bank statement + Finacle GL reconcile to 0. |

### TC-STL005-02 — Break detected (negative)

| Expected |
|---|
| Reconciliation break > PHP 1 → NTF-007; ops queue. |

### TC-STL006-01 — Cut-off enforcement (boundary)

| Data | Expected |
|---|---|
| Submit 15:29:59 | accepted T. |
| Submit 15:30:01 | moved to T+1. |

### TC-STL007-01 — GL posting reversal on rollback (workflow)

| Expected |
|---|
| Settlement rollback reverses GL entries; audit trail preserved. |

### TC-STL008-01 — Settlement fail > PHP 10 M escalates (boundary)

| Expected |
|---|
| Case auto-escalates to BO-Head; NTF P1. |

### TC-STL009-01 — Client advice delivered (happy)

| Expected |
|---|
| NTF-006 on settle via Email + SMS + Push + In-app. |

### TC-STL009-02 — Client opted out of SMS (workflow)

| Expected |
|---|
| SMS suppressed; other channels still fire; log shows consent. |

### TC-STL010-01 — 7-year retention archive (workflow)

| Expected |
|---|
| At T+7y, trade record moves to WORM cold storage; still readable by auditor. |

---

## 10. Test Cases — Module: Transfers / Contributions / Withdrawals

### TC-TRF001-01 — Intra-portfolio transfer (happy)

| Expected |
|---|
| Transfer moves qty between PORT-A and PORT-B of same client; cash impact zero; SWIFT MT542/540 pair. |

### TC-TRF001-02 — Free-shares check fails (negative)

| Expected |
|---|
| UNPROCESSABLE "Insufficient free shares" (encumbrance found). |

### TC-TRF002-01 — Custodian reject (workflow)

| Expected |
|---|
| MT548 reject; status=Transfer-Failed; compensating entry; Ops ticket. |

### TC-TRF003-01 — Reverse transfer (workflow)

| Expected |
|---|
| Maker requests; Compliance approves; status=Reverse-Pending-Auth then Reversed. |

### TC-TRF004-01 — Cross-border transfer blocked (negative)

| Expected |
|---|
| Data-residency rule blocks without BSP notification; UNPROCESSABLE. |

### TC-TRF005-01 — Authorisation by unauthorised role (permission)

| Expected |
|---|
| FORBIDDEN. |

### TC-TRF006-01 — Audit chain verifiable (integration)

| Expected |
|---|
| Hash chain of transfer events validates end-to-end. |

### TC-TRF007-01 — High-value transfer tiered approval (workflow)

| Expected |
|---|
| > PHP 500 M requires 6-eyes. |

### TC-CON001-01 — Cheque contribution matched (happy)

| Expected |
|---|
| Funds matched within T+1; status=Contribution-Confirmed; CSA credited; NAV refresh if UITF. |

### TC-CON001-02 — Funds not received > T+1 (negative/workflow)

| Expected |
|---|
| status=Contribution-Failed; client advised; auto-cancel. |

### TC-CON002-01 — Wire contribution (happy)

| Expected |
|---|
| SWIFT MT103 inbound matched; units issued at next NAVpu. |

### TC-CON002-02 — Wrong reference (negative)

| Expected |
|---|
| Funds held in suspense; ops ticket; no units issued. |

### TC-CON003-01 — Online portal contribution (integration)

| Expected |
|---|
| Client clicks "Top up"; payment rail invoked; confirmation in real time. |

### TC-CON004-01 — Unit issuance cut-off (boundary)

| Data | Expected |
|---|---|
| Funds at 11:29 | unit issued at today NAVpu. |
| Funds at 11:31 | unit issued at next-day NAVpu. |

### TC-CON005-01 — AML hold on unusual contribution (workflow)

| Expected |
|---|
| Pattern triggers AML hold; Compliance reviews; release or STR. |

### TC-WDL001-01 — UITF redemption (happy)

| Expected |
|---|
| Liquidity check; funds earmarked on TSA; MT103 pay-out; units cancelled. |

### TC-WDL001-02 — UITF early redemption penalty (boundary)

| Expected |
|---|
| Penalty applied per mandate; client advice itemises fee. |

### TC-WDL002-01 — Insufficient liquidity (negative/workflow)

| Expected |
|---|
| status=Withdrawal-Rejected; NTF; partial redemption suggested. |

### TC-WDL003-01 — WHT on interest withdrawal (integration)

| Expected |
|---|
| WHT computed; gross, net, certificate generated. |

### TC-WDL004-01 — Cross-currency withdrawal (workflow)

| Expected |
|---|
| FX booked; spot rate from BAP-PDEx; MT103 in target CCY. |

### TC-WDL005-01 — Regulatory notification cannot be opted out (workflow)

| Expected |
|---|
| Pay-out notification always fires; consent log shows policy. |

### TC-WDL006-01 — Overdue liquidity escalation (workflow)

| Expected |
|---|
| > T+3 pending → auto-escalate CRO; NTF P1. |


---

## 11. Test Cases — Module: Corporate Actions

### TC-CA001-01 — Ingest mandatory CA from Bloomberg (happy)

| Field | Value |
|---|---|
| Test ID | TC-CA001-01 |
| Name | Cash dividend ingested, entitlement pre-computed |
| Category | Happy Path |
| Linked FR | FR-CA-001 |
| Priority | High |
| Preconditions | Bloomberg CA feed up; client holds 10 000 shares ex-date –2. |
| Test Steps | 1. Trigger CA feed ingest. 2. Open CA calendar. |
| Test Data | cash_div=PHP 2.50/share; record=2026-04-20 |
| Expected Result | CA record created; entitlement=PHP 25 000; status=Scheduled; NTF-010 to client+RM. |
| Postconditions | CA on calendar. |

### TC-CA001-02 — Duplicate CA suppressed (negative)

| Expected |
|---|
| Duplicate CA_ID from vendor is idempotently ignored; no duplicate entitlement. |

### TC-CA002-01 — Entitlement notice at ex-date-2 (workflow)

| Expected |
|---|
| Scheduler fires 48 h pre-ex; NTF-010 to every eligible client; mailbox task for RM. |

### TC-CA002-02 — Client has unit trade between record and ex (workflow)

| Expected |
|---|
| Ex-right vs cum-right logic applied; entitlement adjusted; audit captures rule. |

### TC-CA003-01 — Rights election captured (happy)

| Expected |
|---|
| Client elects "exercise 50 %"; deadline honoured; post-deadline edits rejected. |

### TC-CA003-02 — Default election after deadline (workflow)

| Expected |
|---|
| No response → mandate default (e.g., lapse/take-cash); rationale recorded. |

### TC-CA004-01 — DRIP accrual (happy)

| Expected |
|---|
| Dividend Re-Investment posts new units at NAVpu of payment date; tax withheld correctly. |

### TC-CA004-02 — Tax treatment by security residency (boundary)

| Expected |
|---|
| PH-domiciled dividend: 10 % WHT; foreign: per treaty; certificate generated. |

### TC-CA005-01 — Post-CA position adjustment (workflow)

| Expected |
|---|
| Share split 2-for-1: position doubles, avg cost halved; historical P&L preserved. |

### TC-CA005-02 — CA reversal by issuer (workflow)

| Expected |
|---|
| Issuer cancels CA; system reverses entitlement postings; client advice sent. |

---

## 12. Test Cases — Module: Fund Accounting & NAV

### TC-NAV001-01 — Daily NAVpu computed at 11:30 (happy)

| Field | Value |
|---|---|
| Test ID | TC-NAV001-01 |
| Name | UITF-MMF-A NAVpu computed and published |
| Category | Happy Path |
| Linked FR | FR-NAV-001 |
| Priority | Critical |
| Preconditions | Pricing feed up; all positions valued. |
| Test Steps | 1. Scheduler runs 11:30 cut-off. 2. Verify NAVpu in Fund-Accounting Console. |
| Test Data | Previous NAVpu=1.234567 |
| Expected Result | NAVpu computed to 6 dp; published by 12:00; NTF-013; audit trail captures sources. |
| Postconditions | NAVpu stored; fact_navpu row. |

### TC-NAV001-02 — Feed outage falls back to Level-2 (workflow)

| Expected |
|---|
| Primary feed down → system pulls BVAL; source=Level-2 logged; flag on NAV. |

### TC-NAV002-01 — Level-3 fair-value (happy)

| Expected |
|---|
| Illiquid bond valued via discounted cash-flow model with stored inputs; evidence attached. |

### TC-NAV002-02 — Fair-value override requires maker-checker (workflow)

| Expected |
|---|
| FA-M proposes override; FA-C approves; audit captures both; delta vs model stored. |

### TC-NAV003-01 — Unit issuance on contribution (happy)

| Data | Expected |
|---|---|
| PHP 1 M contribution | Units = 1 000 000 / NAVpu; unit book balanced; GL posted. |

### TC-NAV003-02 — Partial-unit fractional rounding (boundary)

| Expected |
|---|
| Rounding to 6 dp; residual centavo to reserve account; reconciliation = 0. |

### TC-NAV004-01 — Post-cut-off order rolls to next day (boundary)

| Data | Expected |
|---|---|
| Submit 11:29 | today NAVpu. |
| Submit 11:31 | next-day NAVpu. |

### TC-NAV004-02 — Holiday cut-off handling (workflow)

| Expected |
|---|
| On PH holiday, NAV is not computed; queued orders use first following business day. |

### TC-NAV005-01 — Dual-source deviation > 0.25 % flags exception (boundary)

| Data | Expected |
|---|---|
| BBG=102.35, Refinitiv=102.65 (0.29 %) | exception raised; FA review before publish. |

### TC-NAV005-02 — Deviation exactly 0.25 % (boundary)

| Expected |
|---|
| Inclusive threshold → no exception; logged for trend. |

### TC-NAV005-03 — Deviation 0.24 % (boundary)

| Expected |
|---|
| No exception. |

---

## 13. Test Cases — Module: Fee & Billing

### TC-FEE001-01 — Tiered AUM schedule created (happy)

| Expected |
|---|
| Schedule: 1 % up to 50 M, 0.75 % 50–500 M, 0.50 % above. Saved. Pending-Auth. |

### TC-FEE001-02 — Negative fee rate (negative)

| Expected |
|---|
| VALIDATION_ERROR "Rate must be ≥ 0". |

### TC-FEE002-01 — Daily accrual (happy)

| Data | Expected |
|---|---|
| Portfolio AUM end-of-day | Daily accrual row; sum at month-end equals schedule × avg AUM. |

### TC-FEE002-02 — Missed day recovered (workflow)

| Expected |
|---|
| Missed run auto-detected; back-fill job; audit shows recovery. |

### TC-FEE003-01 — Monthly invoice posted (happy)

| Expected |
|---|
| Invoice generated; portfolio debited; Finacle GL posted; client advice emailed. |

### TC-FEE003-02 — Insufficient cash in portfolio (negative)

| Expected |
|---|
| Fee deferred; task to RM; visible on Fee Desk. |

### TC-FEE004-01 — UITF TER published (happy)

| Expected |
|---|
| TER % computed and published to client portal and KIIDS refresh schedule. |

### TC-FEE004-02 — TER > cap (boundary)

| Expected |
|---|
| Cap per BSP 1036 enforced; amount above cap is waived; audit logged. |

### TC-FEE005-01 — Fee reversal workflow (workflow)

| Expected |
|---|
| Maker requests waiver; Checker + Compliance approve; GL reverses; client credit. |

### TC-FEE005-02 — Reversal without evidence (negative)

| Expected |
|---|
| FORBIDDEN; evidence required. |

---

## 14. Test Cases — Module: Cash & FX

### TC-CSH001-01 — Nostro reconciliation (happy)

| Expected |
|---|
| Daily nostro match between custodian statement and internal ledger; 0 break. |

### TC-CSH001-02 — Break detected (negative)

| Expected |
|---|
| Break > PHP 1 → ticket; treasury notified; root-cause workflow opened. |

### TC-CSH002-01 — FX spot deal captured (happy)

| Data | Expected |
|---|---|
| USD/PHP=57.25 | Deal captured; rate vs BAP-PDEx within 0.1 %; deal_id issued. |

### TC-CSH002-02 — Off-market rate > tolerance (negative)

| Expected |
|---|
| Rate 2 % off market → warning; requires SRM re-confirmation + rationale. |

### TC-CSH003-01 — FX hedge linked to settlement (happy)

| Expected |
|---|
| Forward booked; hedge mapped to exposure; effectiveness test passes. |

### TC-CSH003-02 — Hedge ratio outside 80–125 % (boundary)

| Expected |
|---|
| Effectiveness fails; hedge accounting de-designated; audit entry. |

### TC-CSH004-01 — Liquidity heat-map (happy)

| Expected |
|---|
| T/T+1/T+2 obligations shown per CCY; drill-down to instructions works. |

### TC-CSH004-02 — Empty state on new CCY (negative/edge)

| Expected |
|---|
| Heat-map renders "No obligations" placeholder; no crash. |

---

## 15. Test Cases — Module: Taxation

### TC-TAX001-01 — WHT on interest (happy)

| Data | Expected |
|---|---|
| Interest PHP 100 000, resident individual | WHT 20 % = PHP 20 000; net credited PHP 80 000; cert generated. |

### TC-TAX001-02 — Treaty-reduced rate (boundary)

| Data | Expected |
|---|---|
| Non-resident, treaty 10 % | WHT 10 %; treaty code captured. |

### TC-TAX002-01 — BIR 2307 generated (happy)

| Expected |
|---|
| Quarterly 2307 XLS generated; totals tie to GL; digital signature applied. |

### TC-TAX002-02 — 2306 creditable for year-end (integration)

| Expected |
|---|
| Annual 2306 with all WHT events; downloadable to client. |

### TC-TAX003-01 — FATCA IDES XML valid (happy)

| Expected |
|---|
| XML validates against IDES schema; IRS portal upload 200 OK. |

### TC-TAX003-02 — Missing US-TIN blocks filing (negative)

| Expected |
|---|
| Pre-upload validation flags missing US-TIN; filing blocked until fixed. |

### TC-TAX004-01 — eBIRForms 1601-FQ (happy)

| Expected |
|---|
| Monthly file generated by 10th; submission reference stored. |

### TC-TAX004-02 — Filing after deadline (workflow)

| Expected |
|---|
| Late flag set; CRO alert; penalty accrued; audit. |

---

## 16. Test Cases — Module: Reversal

### TC-REV001-01 — Ops Maker requests (happy)

| Expected |
|---|
| Maker raises reversal; case opened; settlement frozen; mailbox to Compliance. |

### TC-REV001-02 — Reversal on non-existent order (negative)

| Expected |
|---|
| NOT_FOUND. |

### TC-REV002-01 — Compliance approves (workflow)

| Expected |
|---|
| CCO approves; status=Reversal-Approved; reversing entries posted. |

### TC-REV002-02 — Compliance rejects (workflow)

| Expected |
|---|
| Case closed with rationale; original state restored; no ledger impact. |

### TC-REV003-01 — Reversing entries balance (integration)

| Expected |
|---|
| GL balances post-reversal; client statement shows both entries. |

### TC-REV003-02 — Partial reversal (workflow)

| Expected |
|---|
| Only affected allocation reversed; other children untouched. |

### TC-REV004-01 — Client advice (happy)

| Expected |
|---|
| NTF-017 to client + RM; includes reason code. |

### TC-REV004-02 — Reversal without SoD (permission)

| Expected |
|---|
| Same user as Maker attempts approve → FORBIDDEN. |

---

## 17. Test Cases — Module: Bulk Upload

### TC-UPL001-01 — CSV 5 000 rows validated (happy)

| Expected |
|---|
| Batch ID issued; status=Validated; row counts match. |

### TC-UPL001-02 — Row validation errors (negative)

| Data | Expected |
|---|---|
| Row 3: qty=0, Row 7: invalid ISIN | Error report CSV generated; rows 3 and 7 listed with reason; batch partially Validated. |

### TC-UPL001-03 — Antivirus positive (negative)

| Expected |
|---|
| File quarantined; upload rejected; SecOps alert. |

### TC-UPL002-01 — Boundary 10 000 rows (boundary)

| Expected |
|---|
| Processed within ≤ 3 min SLA. |

### TC-UPL002-02 — 10 001 rows (boundary)

| Expected |
|---|
| UNPROCESSABLE "Max 10 000 rows". |

### TC-UPL003-01 — SRM authorises batch (happy)

| Expected |
|---|
| On approve, all accepted rows fan-out to individual orders. |

### TC-UPL003-02 — SRM refers back (workflow)

| Expected |
|---|
| Rejected rows editable; re-uploaded; delta flagged. |

### TC-UPL004-01 — Fan-out events (integration)

| Expected |
|---|
| N `order.submitted.v1` events emitted equal to accepted_rows. |

### TC-UPL005-01 — Merge with intraday flow (integration)

| Expected |
|---|
| Orders follow standard lifecycle; trader aggregates alongside manual orders. |

### TC-UPL006-01 — Batch rollback after partial placement (workflow) [FR-UPL-006]

| Field | Value |
|---|---|
| Test ID | TC-UPL006-01 |
| Name | Rollback aborts in-flight batch mid-way |
| Category | Workflow |
| Linked FR | FR-UPL-006 |
| Priority | Critical |
| Preconditions | Batch of 1 000 rows: 500 placed, 500 still authorising. |
| Test Steps | 1. RM raises Rollback. 2. SRM approves. |
| Test Data | — |
| Expected Result | Placed orders → Trader+SRM cancel FIX out; authorising 500 moved to Rejected-Partial; compensating GL entries where applicable; audit captures every reversal. |
| Postconditions | Batch status=Rolled-Back-Partial. |

### TC-UPL006-02 — Rollback without checker (permission)

| Expected |
|---|
| FORBIDDEN. |

### TC-UPL006-03 — Rollback after full settlement (negative)

| Expected |
|---|
| UNPROCESSABLE "Use Reversal workflow for settled orders". |

---

## 18. Test Cases — Module: Trade Surveillance

### TC-SRV001-01 — Spoofing pattern detected (happy)

| Data | Expected |
|---|---|
| 10 orders placed and cancelled within 3 s at widening prices | Alert raised; score > threshold; Compliance notified. |

### TC-SRV001-02 — Genuine reprice not flagged (negative)

| Expected |
|---|
| Market-move reprice not flagged; baseline rule. |

### TC-SRV002-01 — Peer-baseline anomaly (happy)

| Expected |
|---|
| RM's trade count 3σ above peer mean → score; alert. |

### TC-SRV002-02 — Sparse data suppression (edge)

| Expected |
|---|
| New RM with < 30 days history excluded from scoring. |

### TC-SRV003-01 — Disposition workflow (happy)

| Expected |
|---|
| Compliance marks FP/Investigate/Escalate; case closes; audit captures rationale. |

### TC-SRV003-02 — Escalate to STR (integration)

| Expected |
|---|
| On Escalate, STR draft pre-filled; CCO reviews and files. |

---

## 19. Test Cases — Module: Kill-Switch / Trading-Halt

### TC-KSW001-01 — CRO invokes (happy) [FR-KSW-001]

| Field | Value |
|---|---|
| Test ID | TC-KSW001-01 |
| Name | CRO halts PSE equities desk |
| Category | Happy Path |
| Linked FR | FR-KSW-001 |
| Priority | Critical |
| Preconditions | CRO logged in with MFA. |
| Test Steps | 1. Kill-Switch → scope=PSE/Equity. 2. Reason. 3. Authorise with CRO + CCO MFA. |
| Test Data | market=PSE; asset_class=EQUITY |
| Expected Result | All working equity orders → FIX cancel-on-disconnect; new orders blocked with 423 Locked; NTF broadcast; halt_id stored. |
| Postconditions | Halt active. |

### TC-KSW001-02 — Single authoriser blocked (permission)

| Expected |
|---|
| Need CRO+CCO; FORBIDDEN with single MFA. |

### TC-KSW002-01 — Scope selector granular (happy)

| Data | Expected |
|---|---|
| scope=portfolio=PORT-00045 | only that portfolio halted; others operate. |

### TC-KSW002-02 — Overlapping halts merged (edge)

| Expected |
|---|
| Existing halt superset → new halt subset ignored with message. |

### TC-KSW003-01 — Resumption dual approval (happy)

| Expected |
|---|
| CRO + CCO click Resume; resumption logged; audit with both IDs. |

### TC-KSW003-02 — Unauthorised resume (permission)

| Expected |
|---|
| FORBIDDEN; attempt logged; SecOps alerted. |

---

## 20. Test Cases — Module: Operational Risk Event Ledger (ORE)

### TC-ORE001-01 — Create ORE with Basel tag (happy)

| Expected |
|---|
| Category = "Execution, Delivery & Process Management"; required fields captured; case ID issued. |

### TC-ORE001-02 — Missing category (negative)

| Expected |
|---|
| VALIDATION_ERROR. |

### TC-ORE002-01 — Loss quantification (happy)

| Data | Expected |
|---|---|
| Gross=PHP 1.5 M; recovery=PHP 0.5 M | Net=PHP 1.0 M stored. |

### TC-ORE002-02 — Recovery > gross (boundary)

| Expected |
|---|
| VALIDATION_ERROR "Recovery cannot exceed gross". |

### TC-ORE003-01 — Root-cause & corrective action (happy)

| Expected |
|---|
| RCA template completed; corrective action due date captured. |

### TC-ORE003-02 — Overdue corrective action (workflow)

| Expected |
|---|
| Auto-escalate to CRO; case stays open. |

### TC-ORE004-01 — Quarterly export (integration)

| Expected |
|---|
| CSV/PDF pack generated; aggregate by Basel category; filed to CRO + BSP. |

### TC-ORE004-02 — Late filing alert (workflow)

| Expected |
|---|
| Alert on day D+1 past deadline. |

---

## 21. Test Cases — Module: Whistleblower & Conduct Risk

### TC-WHB001-01 — Anonymous intake (happy)

| Expected |
|---|
| Submission stored with case_id; no user-attribution; CCO+DPO NTF. |

### TC-WHB001-02 — PII in body auto-masked (edge)

| Expected |
|---|
| Regex-detected PII masked before storage; original retained encrypted for DPO only. |

### TC-WHB002-01 — CCO review workflow (happy)

| Expected |
|---|
| Case assigned; disposition logged; audit trail. |

### TC-WHB002-02 — Retaliation protection flag (workflow)

| Expected |
|---|
| Flag limits visibility; only CCO+DPO see full content. |

### TC-WHB003-01 — Dashboard renders data (happy)

| Expected |
|---|
| Complaint trend, churn, surveillance hits displayed correctly. |

### TC-WHB003-02 — Empty state (edge)

| Expected |
|---|
| Placeholder "No data yet"; no crash. |

---

## 22. Test Cases — Module: AI Fraud & Anomaly Detection (Phase 3)

### TC-AID001-01 — Model trained on historical data (happy)

| Expected |
|---|
| Training job completes; metrics (AUC, precision, recall) captured; model version stored. |

### TC-AID001-02 — Model drift monitor (workflow)

| Expected |
|---|
| Drift > threshold → alert; retraining queued. |

### TC-AID002-01 — Real-time scoring on capture (happy)

| Expected |
|---|
| Score returned within 200 ms; logged. |

### TC-AID002-02 — Score above threshold escalates (workflow)

| Expected |
|---|
| Order flagged Pending-Review; Compliance inbox. |

### TC-AID003-01 — Human disposition (happy)

| Expected |
|---|
| Analyst marks FP/TP; feedback loop to model. |

### TC-AID003-02 — Model governance pack (integration)

| Expected |
|---|
| Explainability report + bias test run per BSP 1108 pre-prod. |

---

## 23. Integration / End-to-End Test Cases

### TC-INT-001 — Full straight-through order (equity BUY)

| Steps |
|---|
| 1. RM captures 5 M equity BUY. 2. SRM approves (2-eyes). 3. Trader aggregates + places. 4. Fill received via FIX. 5. MO confirms. 6. BO settles via PhilPaSS. 7. Client advice sent. |

| Expected |
|---|
| All 7 steps succeed within SLA; STP = YES; no manual intervention; audit chain verifies; NAV impact reflected on UITF. |

### TC-INT-002 — High-value 6-eyes with mandate breach

| Expected |
|---|
| 800 M order captured → pre-trade mandate breach → Risk + Compliance approve (6-eyes) with override rationale → place → settle. Full audit captures three IDs. |

### TC-INT-003 — UITF redemption with FX, WHT, unit cancellation

| Expected |
|---|
| Client requests USD pay-out from PHP UITF → FX booked → units cancelled at next NAV → WHT computed → MT103 out → cert generated. |

### TC-INT-004 — CA cash-dividend E2E

| Expected |
|---|
| Ingest → entitlement → ex-date accrual → pay-date credit → WHT → cert → client portal reflects. |

### TC-INT-005 — Settlement failure → reversal → re-instruction

| Expected |
|---|
| Settlement fails (MT548) → ops raises reversal → Compliance approves → re-instruction with new SSI → settles T+1. |

### TC-INT-006 — Bulk upload, partial rollback, re-submit

| Expected |
|---|
| 1 000-row file; 500 placed; rollback; fix 20 error rows; re-upload; full cycle completes. |

### TC-INT-007 — Regulator pack generation

| Expected |
|---|
| Month-end FRP + UITF pack + STR + WHT 1601-FQ generated, signed, filed; no late flag. |

### TC-INT-008 — DR failover drill

| Expected |
|---|
| Primary region halted → Singapore DR takes over within 60 s (stateless) / 5 min (DB); transactions resume; RPO < 5 min; reconciliation matches. |

### TC-INT-009 — Kill-switch during trading storm

| Expected |
|---|
| Feed degraded → CRO+CCO halt → in-flight orders cancelled cleanly → resumption → no duplicate fills. |

### TC-INT-010 — Reversal post-settlement with client statement refresh

| Expected |
|---|
| Prior-day trade reversed; client statement re-generated with reversal note; reg report reflects both. |

### TC-INT-011 — Mandate change triggers portfolio-wide re-test

| Expected |
|---|
| Mandate v2 activated; all existing positions re-checked; breaches listed; RM given 30-day cure period. |

### TC-INT-012 — Parallel-run reconciliation (migration)

| Expected |
|---|
| Legacy + TrustOMS produce identical NAVpu, cash, and position figures within Week-3 tolerances for 5 consecutive days. |

---

## 24. Process-Flow Traversal Path Coverage

The BRD defines several multi-actor state machines (Order, Transfer, Contribution/Withdrawal, Upload, Reversal, Maintenance, Corporate Action, NAV). Distinct traversal paths that must be exercised end-to-end:

| Path ID | Description | Covered By |
|---|---|---|
| P-01 | Straight-through order (Capture → Authorize → Aggregate → Place → Fill → Confirm → Settle) | TC-INT-001 |
| P-02 | Order referred back at SRM stage → redraft → resubmit → authorise | TC-ORD005-01, TC-AUT001-01 |
| P-03 | Order rejected at SRM → cancelled (terminal) | TC-AUT001-02 + TC-ORD001-02 |
| P-04 | Order path through 4-eyes (Risk + SRM) | TC-AUT002-01 |
| P-05 | Order path through 6-eyes (Risk + SRM + Compliance committee) | TC-AUT003-01 + TC-INT-002 |
| P-06 | Partial fill → multiple fills → full fill | TC-AGG005-01 |
| P-07 | Confirmation exception → manual MO match with evidence | TC-CFR002-01/02 |
| P-08 | Settlement failure → reversal → re-instruction | TC-INT-005 |
| P-09 | Upload → fan-out → partial rollback → resubmit | TC-INT-006 |
| P-10 | Corporate action full cycle | TC-INT-004 |
| P-11 | UITF unit contribution → NAVpu → unit issue → redemption → FX pay-out | TC-INT-003 |
| P-12 | Kill-switch activation and resumption | TC-INT-009 |

### Process-Flow Traversal Path Tests (dedicated)

### TC-PFT-01 — P-02 Redraft loop (single iteration)

| Expected |
|---|
| SRM refers back once; RM edits; re-submits; SRM authorises; history shows 2 versions. |

### TC-PFT-02 — P-02 Redraft loop (multiple iterations)

| Expected |
|---|
| SRM refers back 3 times; RM edits each time; final authorisation carries v4 diff; audit chain intact. |

### TC-PFT-03 — P-08 Re-instruction after rejection

| Expected |
|---|
| MT548 reject → reversal → new SSI captured → re-instruction issues fresh MT541 → settles T+1. |

### TC-PFT-04 — P-09 Upload partial rollback, re-upload same batch

| Expected |
|---|
| After TC-UPL006-01, user re-uploads the 500 rejected rows only; new batch ID; merges into main flow without duplication. |

### TC-PFT-05 — P-11 Multi-CCY UITF redemption with holiday-shift

| Expected |
|---|
| Redemption requested Friday 12:30 PHT; NAVpu cut-off missed → Tuesday (PH holiday Monday); FX on settlement day; WHT on payment date. |

### TC-PFT-06 — P-12 Kill-switch during ongoing settlement batch

| Expected |
|---|
| Halt invoked mid-settlement batch; in-flight MT541s allowed to complete (idempotent); new SSIs blocked until resume. |

---

## 25. Permission / SoD Tests Consolidated

| Test ID | Action | Authorized Role | Unauthorized Role Tried | Expected |
|---|---|---|---|---|
| TC-PERM-01 | Order Authorize 2-eyes | SRM | Trader | FORBIDDEN |
| TC-PERM-02 | Approve Reversal | Compliance | BO-Head | FORBIDDEN |
| TC-PERM-03 | Kill-Switch | CRO + CCO | SRM | FORBIDDEN |
| TC-PERM-04 | Create User / Role | Admin | Compliance | FORBIDDEN |
| TC-PERM-05 | Mandate Override | Compliance | Risk | FORBIDDEN |
| TC-PERM-06 | File STR | Compliance | RM | FORBIDDEN |
| TC-PERM-07 | Maintenance Authorize | Maintenance Checker | Maintenance Maker (same user) | FORBIDDEN (SoD) |
| TC-PERM-08 | Audit Log Write | nobody (immutable) | Admin | FORBIDDEN |
| TC-PERM-09 | Client Portal Transact | nobody | Client | FORBIDDEN (read-only + request-action only) |
| TC-PERM-10 | Trader Self-Authorize own capture | nobody | Trader | FORBIDDEN |
| TC-PERM-11 | RM executes order | nobody | RM | FORBIDDEN |
| TC-PERM-12 | BA on non-SSA portfolio | nobody | BA | FORBIDDEN |
| TC-PERM-13 | Garnishment override | BO-Head | BO-Maker | FORBIDDEN |
| TC-PERM-14 | Cross-border transfer without BSP notice | nobody | Any role | FORBIDDEN |
| TC-PERM-15 | Fee waiver without evidence | Compliance (with evidence) | Fee-Officer alone | FORBIDDEN |
| TC-PERM-16 | Edit suitability after lock | owner + Compliance | RM alone | FORBIDDEN |

---

---

# PART B — GAP TEST CASES (BDO RFI Coverage)

**Source**: BDO-RFI-vs-BRD-OMS-Gaps.md (18 April 2026)
**Purpose**: Test cases for OMS capabilities identified in the BDO RFI but absent from the original BRD.
**FR Prefix**: FR-GAP-{module}-{seq}

---

## 27. Test Cases — Gap Module: Order Type & Time-in-Force (FR-GAP-OTF)

### TC-GAP-OTF001-01 — Market order captured (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF001-01 |
| Name | RM captures MARKET order without limit price |
| Category | Happy Path |
| Linked FR | FR-GAP-OTF-001 |
| Priority | High |
| Preconditions | Client CL-000123 active; PORT-00045 active; PSE market open. |
| Test Steps | 1. New Order → PORT-00045. 2. Side=BUY; ISIN=PHY7225E1116; qty=10000; order_type=MARKET. 3. Verify price field is disabled/auto. 4. Submit. |
| Test Data | order_type=MARKET; qty=10000; ISIN=PHY7225E1116 |
| Expected Result | Order created with order_type=MARKET; no limit_price stored; status=Pending-Auth; time_in_force defaults to DAY. |
| Postconditions | Order in authorization queue. |

### TC-GAP-OTF001-02 — GTC order persists across sessions (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF001-02 |
| Name | GTC order survives end-of-day and remains working |
| Category | Workflow |
| Linked FR | FR-GAP-OTF-001 |
| Priority | High |
| Preconditions | LIMIT order with TIF=GTC placed and authorized. |
| Test Steps | 1. Place GTC order at 14:00. 2. Market closes 15:30. 3. Next trading day opens. 4. Verify order status. |
| Test Data | TIF=GTC; LIMIT=102.35 |
| Expected Result | Order remains status=Working after market close; re-appears on trader blotter next day; no auto-expiry. |
| Postconditions | Order active across days. |

### TC-GAP-OTF001-03 — DAY order auto-expires at close (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF001-03 |
| Name | DAY order with zero fills expires at 15:30 |
| Category | Boundary |
| Linked FR | FR-GAP-OTF-001 |
| Priority | High |
| Preconditions | LIMIT order with TIF=DAY placed at 10:00; zero fills by 15:30. |
| Test Steps | 1. Verify order status at 15:29:59. 2. Verify at 15:30:01. |
| Test Data | TIF=DAY |
| Expected Result | At 15:29:59 status=Working; at 15:30:01 status=Expired; NTF to RM; audit entry "Auto-expired DAY order". |
| Postconditions | Order terminal. |

### TC-GAP-OTF002-01 — Future-dated trade order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF002-01 |
| Name | Order with future trade date accepted and held |
| Category | Happy Path |
| Linked FR | FR-GAP-OTF-002 |
| Priority | High |
| Preconditions | RM logged in; today=2026-04-18. |
| Test Steps | 1. New Order. 2. trade_date=2026-04-25; Side=BUY; qty=5000. 3. Submit. |
| Test Data | trade_date=2026-04-25 (T+5 business days) |
| Expected Result | Order created status=Pending-Auth; trade_date stored as future; order does not appear on trader placement queue until 2026-04-25. |
| Postconditions | Scheduled order visible in "Future Orders" view. |

### TC-GAP-OTF002-02 — Past trade date rejected (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF002-02 |
| Name | Trade date in the past is blocked |
| Category | Negative |
| Linked FR | FR-GAP-OTF-002 |
| Priority | High |
| Preconditions | Today=2026-04-18. |
| Test Steps | 1. New Order → trade_date=2026-04-15. 2. Submit. |
| Test Data | trade_date=2026-04-15 |
| Expected Result | VALIDATION_ERROR "Trade date must be today or a future business day." Submit blocked. |
| Postconditions | No order created. |

### TC-GAP-OTF003-01 — Switch-In/Out order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF003-01 |
| Name | Client switches from UITF-MMF to UITF-Equity without redeem-then-subscribe |
| Category | Happy Path |
| Linked FR | FR-GAP-OTF-003 |
| Priority | High |
| Preconditions | Client holds 100 000 units in UITF-MMF-A; UITF-EQ-B is eligible. |
| Test Steps | 1. Order → type=SWITCH. 2. From=UITF-MMF-A; To=UITF-EQ-B. 3. Units=50000. 4. Submit. |
| Test Data | switch_from=UITF-MMF-A; switch_to=UITF-EQ-B; units=50000 |
| Expected Result | Single switch order created; redeem + subscribe linked atomically; NAVpu used for both legs from same cut-off; status=Pending-Auth. |
| Postconditions | Switch order in auth queue. |

### TC-GAP-OTF003-02 — Switch to ineligible fund blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF003-02 |
| Name | Switch to fund outside client suitability rejected |
| Category | Negative |
| Linked FR | FR-GAP-OTF-003 |
| Priority | High |
| Preconditions | Client risk=Conservative; target fund=Aggressive-Equity-UITF. |
| Test Steps | 1. Order → type=SWITCH → to=Aggressive-Equity-UITF. 2. Submit. |
| Test Data | suitability mismatch |
| Expected Result | UNPROCESSABLE "Suitability mismatch on switch target fund." |
| Postconditions | No order created. |

### TC-GAP-OTF004-01 — Scheduled recurring withdrawal (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF004-01 |
| Name | Client sets up monthly auto-withdrawal |
| Category | Happy Path |
| Linked FR | FR-GAP-OTF-004 |
| Priority | High |
| Preconditions | Client account active with sufficient balance. |
| Test Steps | 1. Scheduled Orders → New. 2. Type=Withdrawal; frequency=Monthly; day=15; amount=PHP 50000; start=2026-05-15. 3. Save. |
| Test Data | frequency=Monthly; amount=50000; start_date=2026-05-15 |
| Expected Result | Schedule created status=Active; next_run=2026-05-15; maker-checker applied; audit logged. |
| Postconditions | Schedule visible in "Recurring Orders" list. |

### TC-GAP-OTF004-02 — Scheduled order on holiday auto-shifts (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF004-02 |
| Name | Scheduled run falling on PH holiday shifts to next business day |
| Category | Boundary |
| Linked FR | FR-GAP-OTF-004 |
| Priority | Medium |
| Preconditions | Next run date=2026-06-12 (PH Independence Day holiday). |
| Test Steps | 1. Scheduler triggers overnight. 2. Check next_run. |
| Test Data | holiday=2026-06-12 |
| Expected Result | Execution deferred to 2026-06-13; audit note "Holiday shift applied". |
| Postconditions | Order generated on 2026-06-13. |

### TC-GAP-OTF005-01 — Subsequent allocation to existing block (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF005-01 |
| Name | New order added to an already-placed block |
| Category | Happy Path |
| Linked FR | FR-GAP-OTF-005 |
| Priority | High |
| Preconditions | Block BLK-001 placed for ISIN PHY7225E1116 BUY; status=Working. |
| Test Steps | 1. Authorize new order same ISIN/side. 2. Trader selects "Add to Block BLK-001". 3. Confirm. |
| Test Data | existing block BLK-001; new qty=20000 |
| Expected Result | Block qty increased; child link added; FIX amend (35=G) sent to broker; audit captures amendment. |
| Postconditions | Block has N+1 children. |

### TC-GAP-OTF005-02 — Subsequent allocation to filled block rejected (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF005-02 |
| Name | Cannot add to a fully-filled block |
| Category | Negative |
| Linked FR | FR-GAP-OTF-005 |
| Priority | Medium |
| Preconditions | Block BLK-002 status=Fully-Filled. |
| Test Steps | 1. Attempt "Add to Block BLK-002". |
| Test Data | — |
| Expected Result | UNPROCESSABLE "Block is fully filled; create a new block." |
| Postconditions | Unchanged. |

### TC-GAP-OTF006-01 — Inter-portfolio block one-to-many (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF006-01 |
| Name | Single sell from PORT-A allocated to PORT-B, PORT-C, PORT-D |
| Category | Happy Path |
| Linked FR | FR-GAP-OTF-006 |
| Priority | High |
| Preconditions | PORT-A holds 100 000 units; PORT-B/C/D same client or related accounts. |
| Test Steps | 1. Inter-Portfolio Transaction → From=PORT-A. 2. To=PORT-B(40k), PORT-C(30k), PORT-D(30k). 3. Submit. |
| Test Data | one-to-many; total=100000 |
| Expected Result | IPT order created with 3 allocation legs; all legs Pending-Auth; settlement at T+0; audit trail. |
| Postconditions | 3 child allocations linked. |

### TC-GAP-OTF006-02 — Inter-portfolio with co-mingling blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OTF006-02 |
| Name | IMA-to-IMA different trust accounts blocked |
| Category | Negative |
| Linked FR | FR-GAP-OTF-006 |
| Priority | High |
| Preconditions | PORT-A=IMA Trust-1; PORT-B=IMA Trust-2 (different trust). |
| Test Steps | 1. Inter-Portfolio Transaction → From=PORT-A → To=PORT-B. 2. Submit. |
| Test Data | cross-trust IMA |
| Expected Result | FORBIDDEN "No co-mingling between IMA trust accounts." |
| Postconditions | No IPT created. |

---

## 28. Test Cases — Gap Module: Order Maintenance / Lifecycle (FR-GAP-OML)

### TC-GAP-OML001-01 — Back-dated contribution with override (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML001-01 |
| Name | Authorised user back-dates a contribution by 2 business days |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-001 |
| Priority | Medium |
| Preconditions | RM logged in; contribution received 2 days ago but not yet captured. |
| Test Steps | 1. New Contribution → value_date=2026-04-16 (T-2). 2. System shows "Back-date requires override". 3. Enter override_reason="Late cheque clearance". 4. Submit. 5. SRM approves override. |
| Test Data | value_date=2026-04-16; override_reason="Late cheque clearance" |
| Expected Result | Contribution created with back-dated value_date; override_flag=true; approver_id captured; NAVpu used from 2026-04-16. |
| Postconditions | Back-dated contribution in system; audit trail with override. |

### TC-GAP-OML001-02 — Back-date without authorization rejected (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML001-02 |
| Name | RM without override privilege cannot back-date |
| Category | Negative |
| Linked FR | FR-GAP-OML-001 |
| Priority | Medium |
| Preconditions | RM lacks back-date override RBAC permission. |
| Test Steps | 1. New Contribution → value_date=T-3. 2. Submit. |
| Test Data | value_date=T-3 |
| Expected Result | FORBIDDEN "Back-dating requires authorised override." |
| Postconditions | No contribution created. |

### TC-GAP-OML002-01 — Edit order in Pending-Auth status (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML002-01 |
| Name | RM edits qty on order still in Pending-Auth |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-002 |
| Priority | High |
| Preconditions | Order ORD-500 in status=Pending-Auth. |
| Test Steps | 1. Open ORD-500. 2. Click Edit. 3. Change qty from 10000 to 15000. 4. Save. |
| Test Data | new_qty=15000 |
| Expected Result | Order updated; version incremented to v2; re-submitted for authorization; audit shows diff. |
| Postconditions | Order v2 in Pending-Auth. |

### TC-GAP-OML002-02 — Edit order in Placed status blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML002-02 |
| Name | Cannot edit an order already placed with broker |
| Category | Negative |
| Linked FR | FR-GAP-OML-002 |
| Priority | High |
| Preconditions | Order ORD-501 in status=Placed. |
| Test Steps | 1. Open ORD-501. 2. Click Edit. |
| Test Data | — |
| Expected Result | Edit button disabled; tooltip "Order in Placed status cannot be edited. Use Cancel/Replace." |
| Postconditions | Unchanged. |

### TC-GAP-OML003-01 — Partial liquidation by cash proceeds (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML003-01 |
| Name | Sell enough to generate PHP 5M proceeds |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-003 |
| Priority | High |
| Preconditions | PORT-00045 holds 200 000 units of ISIN-A at market price PHP 50/unit. |
| Test Steps | 1. Partial Liquidation → target_proceeds=PHP 5000000. 2. System computes qty=100000. 3. Confirm. 4. Submit. |
| Test Data | target_proceeds=5000000; computed_qty=100000 |
| Expected Result | Sell order created for 100 000 units; order notes "Partial liquidation: target proceeds PHP 5M"; Pending-Auth. |
| Postconditions | Order in auth queue. |

### TC-GAP-OML003-02 — Target exceeds holdings value (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML003-02 |
| Name | Requested proceeds exceed total holding value |
| Category | Negative |
| Linked FR | FR-GAP-OML-003 |
| Priority | Medium |
| Preconditions | Holdings value=PHP 8M. |
| Test Steps | 1. target_proceeds=PHP 10000000. 2. Submit. |
| Test Data | target_proceeds=10000000 |
| Expected Result | VALIDATION_ERROR "Target proceeds exceed current holding value of PHP 8,000,000." |
| Postconditions | No order. |

### TC-GAP-OML004-01 — Change funding account on captured order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML004-01 |
| Name | RM switches funding account before authorization |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-004 |
| Priority | Medium |
| Preconditions | Order ORD-600 Pending-Auth; funding_acct=CA-001. |
| Test Steps | 1. Open ORD-600. 2. Change funding_acct to CA-002. 3. Save. |
| Test Data | new_funding_acct=CA-002 |
| Expected Result | Funding account updated; version incremented; re-authorization required; audit diff logged. |
| Postconditions | Order shows CA-002. |

### TC-GAP-OML004-02 — Change funding on authorized order blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML004-02 |
| Name | Funding change after authorization requires re-auth |
| Category | Negative |
| Linked FR | FR-GAP-OML-004 |
| Priority | Medium |
| Preconditions | Order ORD-601 status=Authorized. |
| Test Steps | 1. Attempt funding account change. |
| Test Data | — |
| Expected Result | Warning "Changing funding account will de-authorize order. Proceed?" On confirm, status reverts to Pending-Auth. |
| Postconditions | Re-authorization required. |

### TC-GAP-OML005-01 — Revert cancelled order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML005-01 |
| Name | SRM reverts a recently cancelled order |
| Category | Happy Path / Workflow |
| Linked FR | FR-GAP-OML-005 |
| Priority | Medium |
| Preconditions | Order ORD-700 cancelled < 1 hour ago; no settlement impact. |
| Test Steps | 1. Open ORD-700. 2. Click "Revert Cancel". 3. Enter reason "Cancelled in error". 4. SRM approves. |
| Test Data | reason="Cancelled in error" |
| Expected Result | Order restored to pre-cancel status (Authorized); revert audit trail with SRM approval; NTF to RM. |
| Postconditions | Order back in workflow. |

### TC-GAP-OML005-02 — Revert settled order blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML005-02 |
| Name | Cannot revert a cancelled order that had partial settlement |
| Category | Negative |
| Linked FR | FR-GAP-OML-005 |
| Priority | Medium |
| Preconditions | Order ORD-701 cancelled after partial settlement. |
| Test Steps | 1. Attempt Revert Cancel. |
| Test Data | — |
| Expected Result | UNPROCESSABLE "Order has settlement history; use Reversal workflow." |
| Postconditions | Unchanged. |

### TC-GAP-OML006-01 — Unmatched inventory view with live decrement (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML006-01 |
| Name | Portfolio officer sees available lots and picks for matching |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-006 |
| Priority | Medium |
| Preconditions | Security ISIN-A has 5 unmatched lots across custodians. |
| Test Steps | 1. Open Unmatched Inventory → ISIN-A. 2. Verify 5 lots displayed with folio, qty, custodian. 3. Match lot-3 to order ORD-800. 4. Verify lot-3 qty decrements. |
| Test Data | 5 lots; match lot-3 |
| Expected Result | After matching, lot-3 available_qty decreases in real-time; matched_to shows ORD-800; 4 lots remain available. |
| Postconditions | Lot-3 partially/fully matched. |

### TC-GAP-OML006-02 — Empty unmatched inventory (edge)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML006-02 |
| Name | No unmatched lots displays empty state |
| Category | Negative |
| Linked FR | FR-GAP-OML-006 |
| Priority | Low |
| Preconditions | All lots matched for ISIN-B. |
| Test Steps | 1. Open Unmatched Inventory → ISIN-B. |
| Test Data | zero lots |
| Expected Result | "No unmatched inventory for this security." placeholder; no crash. |
| Postconditions | — |

### TC-GAP-OML007-01 — Auto-compute gross from units and price (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML007-01 |
| Name | System auto-computes gross amount |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-007 |
| Priority | Medium |
| Preconditions | Order capture form open. |
| Test Steps | 1. Enter qty=50000. 2. Enter price=102.50. 3. Tab out of price field. |
| Test Data | qty=50000; price=102.50 |
| Expected Result | gross_amount auto-populated as PHP 5,125,000.00; field is editable for override. |
| Postconditions | — |

### TC-GAP-OML007-02 — Auto-compute price from units and gross (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML007-02 |
| Name | System derives price when units and gross provided |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-007 |
| Priority | Medium |
| Preconditions | Order capture form. |
| Test Steps | 1. Enter qty=50000. 2. Enter gross_amount=5000000. 3. Tab out. |
| Test Data | qty=50000; gross=5000000 |
| Expected Result | price auto-populated as 100.00; tooltip "Auto-computed". |
| Postconditions | — |

### TC-GAP-OML008-01 — Redemption by FIFO disposal (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML008-01 |
| Name | Partial redemption uses FIFO lot selection |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-008 |
| Priority | High |
| Preconditions | Client holds 3 lots: Lot-1 (oldest, 20k), Lot-2 (15k), Lot-3 (10k). |
| Test Steps | 1. Redeem 25000 units. 2. disposal_method=FIFO. 3. Submit. |
| Test Data | qty=25000; disposal=FIFO |
| Expected Result | Lot-1 fully redeemed (20k); Lot-2 partially redeemed (5k); gain/loss computed per lot; audit shows FIFO selection. |
| Postconditions | Remaining: Lot-2=10k, Lot-3=10k. |

### TC-GAP-OML008-02 — Redemption by pick-and-choose (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML008-02 |
| Name | Client selects specific lots for redemption |
| Category | Happy Path |
| Linked FR | FR-GAP-OML-008 |
| Priority | High |
| Preconditions | 3 lots available. |
| Test Steps | 1. Redeem → disposal=Pick-and-Choose. 2. Select Lot-3 (10k). 3. Submit. |
| Test Data | disposal=Pick-and-Choose; selected=Lot-3 |
| Expected Result | Only Lot-3 redeemed; gain/loss for Lot-3 only; Lot-1 and Lot-2 untouched. |
| Postconditions | Lot-3 removed. |

### TC-GAP-OML008-03 — Redemption qty exceeds selected lot (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-OML008-03 |
| Name | Pick-and-choose qty exceeds lot available |
| Category | Negative |
| Linked FR | FR-GAP-OML-008 |
| Priority | Medium |
| Preconditions | Lot-3 has 10000 units. |
| Test Steps | 1. Pick-and-Choose Lot-3. 2. qty=15000. 3. Submit. |
| Test Data | qty=15000 vs lot=10000 |
| Expected Result | VALIDATION_ERROR "Selected lot has only 10,000 units available." |
| Postconditions | No order. |

---

## 29. Test Cases — Gap Module: Execution, Allocation & Fill Handling (FR-GAP-EAF)

### TC-GAP-EAF001-01 — Auto-combine similar open orders (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF001-01 |
| Name | System combines 3 BUY orders for same ISIN at same price |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-001 |
| Priority | High |
| Preconditions | 3 authorized BUY orders for ISIN-A at LIMIT=102.50; qty=10k, 20k, 15k. |
| Test Steps | 1. Trader opens placement queue. 2. System suggests "Combine 3 similar orders?" 3. Trader confirms. |
| Test Data | 3 orders same ISIN/side/price; total=45000 |
| Expected Result | Combined block created qty=45000; 3 child links; single FIX NewOrderSingle sent; audit "Auto-combined". |
| Postconditions | Block in Working status. |

### TC-GAP-EAF001-02 — Different prices not combined (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF001-02 |
| Name | Orders at different limit prices stay separate |
| Category | Negative |
| Linked FR | FR-GAP-EAF-001 |
| Priority | Medium |
| Preconditions | 2 BUY orders ISIN-A: LIMIT=102.50 and LIMIT=103.00. |
| Test Steps | 1. Open placement queue. 2. Verify no combine suggestion. |
| Test Data | different prices |
| Expected Result | No combine prompt; orders remain separate. |
| Postconditions | 2 independent orders. |

### TC-GAP-EAF002-01 — Time-receipt allocation with waitlist (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF002-01 |
| Name | Fill allocated by order receipt time; residual waitlisted |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-002 |
| Priority | High |
| Preconditions | Block 50k; children: ORD-A (10k, received 09:01), ORD-B (20k, 09:05), ORD-C (30k, 09:10). Fill=40k. |
| Test Steps | 1. Fill arrives 40k. 2. Observe allocation. |
| Test Data | fill=40000; time-receipt order: A→B→C |
| Expected Result | ORD-A gets 10k (full); ORD-B gets 20k (full); ORD-C gets 10k (partial); 20k residual on waitlist for ORD-C. |
| Postconditions | Waitlist queue has ORD-C=20k. |

### TC-GAP-EAF002-02 — Waitlist re-allocation on back-out (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF002-02 |
| Name | Back-out returns qty to waitlist for next eligible order |
| Category | Workflow |
| Linked FR | FR-GAP-EAF-002 |
| Priority | High |
| Preconditions | ORD-A allocated 10k; ORD-A cancels (back-out). |
| Test Steps | 1. ORD-A back-out processed. 2. 10k returned to pool. 3. Waitlist re-allocates. |
| Test Data | back-out=10000 |
| Expected Result | 10k re-allocated to ORD-C (next on waitlist); ORD-C allocation becomes 20k; audit "Re-allocated from back-out". |
| Postconditions | ORD-C fully filled. |

### TC-GAP-EAF003-01 — IPO allocation engine (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF003-01 |
| Name | Primary issuance allocated pro-rata across 50 accounts |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-003 |
| Priority | Critical |
| Preconditions | IPO issue ISIN-NEW; total available=1M units; 50 orders totalling 2M units. |
| Test Steps | 1. IPO Allocation → run engine. 2. Method=Pro-Rata. 3. Confirm. |
| Test Data | issue=1M; demand=2M; 50 accounts |
| Expected Result | Each account receives 50% of requested qty; rounding applied per board-lot; allocation report generated; total allocated=1M. |
| Postconditions | 50 allocation tickets created. |

### TC-GAP-EAF003-02 — IPO volume exhausted rejects new orders (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF003-02 |
| Name | Order after IPO fully allocated is auto-rejected |
| Category | Negative |
| Linked FR | FR-GAP-EAF-003 |
| Priority | Critical |
| Preconditions | IPO ISIN-NEW fully allocated; cumulative=issue limit. |
| Test Steps | 1. New order for ISIN-NEW. 2. Submit. |
| Test Data | post-exhaustion order |
| Expected Result | UNPROCESSABLE "Volume not available — primary issuance fully allocated." |
| Postconditions | No order. |

### TC-GAP-EAF004-01 — IMA/TA IPO advance order with volume cap (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF004-01 |
| Name | Advance IPO order tracked against cumulative volume |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-004 |
| Priority | High |
| Preconditions | IPO issue limit=500k; cumulative orders so far=400k. |
| Test Steps | 1. Capture advance IPO order qty=80000. 2. Submit. |
| Test Data | qty=80000; cumulative_after=480000 |
| Expected Result | Order accepted; cumulative tracker updated to 480k; warning "80% of issue limit allocated". |
| Postconditions | Tracker at 480k/500k. |

### TC-GAP-EAF004-02 — Advance order exceeds issue limit (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF004-02 |
| Name | Order that would breach issue limit capped |
| Category | Boundary |
| Linked FR | FR-GAP-EAF-004 |
| Priority | High |
| Preconditions | Cumulative=480k; issue_limit=500k. |
| Test Steps | 1. Order qty=30000. 2. Submit. |
| Test Data | qty=30000; would push to 510k |
| Expected Result | Warning "Order exceeds remaining issue capacity (20k). Reduce to 20,000?" Auto-caps at 20k if confirmed. |
| Postconditions | Cumulative=500k. |

### TC-GAP-EAF005-01 — Rounding adjustment pre-posting (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF005-01 |
| Name | Ops adjusts rounding on charges before GL posting |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-005 |
| Priority | Medium |
| Preconditions | Trade confirmed; charges computed with fractions. |
| Test Steps | 1. Pre-Posting Review → open trade. 2. Adjust doc_stamp from PHP 1234.567 to PHP 1234.57. 3. Save. |
| Test Data | original=1234.567; adjusted=1234.57 |
| Expected Result | Adjustment saved; delta logged; GL posts with adjusted amount; audit shows pre/post values. |
| Postconditions | Charges adjusted. |

### TC-GAP-EAF005-02 — Adjustment exceeds tolerance (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF005-02 |
| Name | Manual adjustment beyond ±PHP 100 requires escalation |
| Category | Negative |
| Linked FR | FR-GAP-EAF-005 |
| Priority | Medium |
| Preconditions | Tolerance=±PHP 100. |
| Test Steps | 1. Adjust charge by PHP 150. 2. Save. |
| Test Data | delta=150 |
| Expected Result | UNPROCESSABLE "Adjustment exceeds tolerance ±PHP 100; escalate to BO-Head." |
| Postconditions | Unchanged. |

### TC-GAP-EAF006-01 — Override minimum transaction charge (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF006-01 |
| Name | SRM overrides minimum brokerage fee for large block |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-006 |
| Priority | Medium |
| Preconditions | Minimum brokerage=PHP 500; block warrants PHP 300 override. |
| Test Steps | 1. Fee Override → new_min=PHP 300. 2. Reason="Volume discount negotiated". 3. SRM approves. |
| Test Data | original_min=500; override_to=300 |
| Expected Result | Override applied; audit captures approver, reason, original vs overridden; GL uses PHP 300. |
| Postconditions | Fee overridden for this trade. |

### TC-GAP-EAF006-02 — Override without SRM approval blocked (permission)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF006-02 |
| Name | Trader alone cannot override minimum charges |
| Category | Permission |
| Linked FR | FR-GAP-EAF-006 |
| Priority | Medium |
| Preconditions | Trader logged in; no SRM co-approval. |
| Test Steps | 1. Attempt Fee Override. |
| Test Data | — |
| Expected Result | FORBIDDEN "Fee override requires SRM authorization." |
| Postconditions | Unchanged. |

### TC-GAP-EAF007-01 — Daily broker charge distribution (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF007-01 |
| Name | EOD batch distributes PDTC charges across 20 trades |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-007 |
| Priority | Medium |
| Preconditions | 20 settled trades today via PDTC broker. |
| Test Steps | 1. Run EOD broker-charge distribution. 2. Review report. |
| Test Data | 20 trades; total PDTC charge=PHP 50000 |
| Expected Result | Charges distributed pro-rata by trade value; each trade's charge updated; summary report generated; GL posted. |
| Postconditions | All 20 trades have charge allocated. |

### TC-GAP-EAF007-02 — No trades for broker (edge)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF007-02 |
| Name | Broker with zero trades skipped in distribution |
| Category | Negative |
| Linked FR | FR-GAP-EAF-007 |
| Priority | Low |
| Preconditions | Broker XYZ had zero trades today. |
| Test Steps | 1. Run distribution. |
| Test Data | zero trades |
| Expected Result | Broker XYZ skipped; no charge entry; report shows "0 trades — skipped". |
| Postconditions | — |

### TC-GAP-EAF008-01 — Stock transaction charge and net settlement (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF008-01 |
| Name | System computes net settlement amount after all charges |
| Category | Happy Path |
| Linked FR | FR-GAP-EAF-008 |
| Priority | Medium |
| Preconditions | Equity BUY 50k shares at PHP 100 = PHP 5M gross. |
| Test Steps | 1. Confirm trade. 2. View settlement breakdown. |
| Test Data | gross=5M; commission=0.25%=12500; VAT=1500; SCCP=250; total_charges=14250 |
| Expected Result | Net settlement=PHP 5,014,250 (BUY: gross+charges); breakdown displayed; matches GL posting. |
| Postconditions | Settlement instruction uses net amount. |

### TC-GAP-EAF008-02 — Charge computation on zero-commission trade (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-EAF008-02 |
| Name | Inter-account transfer with zero commission |
| Category | Boundary |
| Linked FR | FR-GAP-EAF-008 |
| Priority | Low |
| Preconditions | IPT with commission waived. |
| Test Steps | 1. Compute charges. |
| Test Data | commission=0 |
| Expected Result | Net settlement = gross amount; VAT on zero commission = 0; no divide-by-zero errors. |
| Postconditions | — |

---

## 30. Test Cases — Gap Module: Order Validation & Pre/Post-Trade Compliance (FR-GAP-VAL)

### TC-GAP-VAL001-01 — Pre-trade trader limit check (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL001-01 |
| Name | Order within trader's daily limit passes |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-001 |
| Priority | Critical |
| Preconditions | Trader-A daily limit=PHP 500M; today's traded=PHP 200M. |
| Test Steps | 1. Trader places order PHP 100M. 2. Observe limit check. |
| Test Data | order=100M; cumulative_after=300M; limit=500M |
| Expected Result | Limit check passes; order proceeds; remaining capacity shown=PHP 200M. |
| Postconditions | Trader utilization updated. |

### TC-GAP-VAL001-02 — Trader limit breach blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL001-02 |
| Name | Order exceeding trader daily limit rejected |
| Category | Negative |
| Linked FR | FR-GAP-VAL-001 |
| Priority | Critical |
| Preconditions | Trader-A limit=PHP 500M; today=PHP 480M. |
| Test Steps | 1. Order PHP 30M. 2. Submit. |
| Test Data | order=30M; would push to 510M |
| Expected Result | HARD_BREACH "Trader daily limit exceeded (510M > 500M limit)." Order blocked. |
| Postconditions | No order. |

### TC-GAP-VAL001-03 — Counterparty limit breach (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL001-03 |
| Name | Exposure exactly at counterparty limit |
| Category | Boundary |
| Linked FR | FR-GAP-VAL-001 |
| Priority | High |
| Preconditions | Counterparty limit=PHP 1B; current exposure=PHP 999M. |
| Test Steps | 1. Order PHP 1M (exactly at limit). |
| Test Data | order=1M; exposure_after=1B |
| Expected Result | Passes (inclusive ≤ rule); warning "Counterparty limit 100% utilized." |
| Postconditions | Limit fully used. |

### TC-GAP-VAL002-01 — SBL (Single Borrower Limit) check (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL002-01 |
| Name | Issuer exposure within SBL |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-002 |
| Priority | Critical |
| Preconditions | Issuer-X SBL=25% of fund; current=20%. |
| Test Steps | 1. BUY order for Issuer-X that would bring exposure to 23%. |
| Test Data | post-trade exposure=23% |
| Expected Result | SBL check passes; remaining headroom displayed. |
| Postconditions | — |

### TC-GAP-VAL002-02 — SBL breach soft override (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL002-02 |
| Name | Soft breach on SBL allows documented override |
| Category | Workflow |
| Linked FR | FR-GAP-VAL-002 |
| Priority | Critical |
| Preconditions | Order would push Issuer-X to 26% (above 25% SBL). |
| Test Steps | 1. Submit order. 2. Soft breach alert displayed. 3. Compliance officer enters override_reason. 4. Approves with MFA. |
| Test Data | post-trade=26%; SBL=25%; override_reason="Temporary, approved by IC" |
| Expected Result | Order proceeds with soft_breach_flag=true; override_audit captures Compliance ID, reason, timestamp; breach appears in Compliance Workbench. |
| Postconditions | Order authorized with override. |

### TC-GAP-VAL003-01 — Hard vs soft validation (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL003-01 |
| Name | Hard validation blocks without override path |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-003 |
| Priority | High |
| Preconditions | Security on prohibited list (hard block). |
| Test Steps | 1. Order for prohibited security. 2. Submit. |
| Test Data | prohibited ISIN |
| Expected Result | HARD_BREACH "Security is prohibited." No override button available. Order blocked. |
| Postconditions | No order. |

### TC-GAP-VAL003-02 — Soft validation override without RBAC (permission)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL003-02 |
| Name | User without override RBAC cannot approve soft breach |
| Category | Permission |
| Linked FR | FR-GAP-VAL-003 |
| Priority | High |
| Preconditions | Soft breach raised; RM (no override role) attempts override. |
| Test Steps | 1. Click "Override Breach". |
| Test Data | — |
| Expected Result | FORBIDDEN "Override requires Compliance or Risk role with override RBAC." |
| Postconditions | Breach still pending. |

### TC-GAP-VAL004-01 — Short-sell alert (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL004-01 |
| Name | Selling security not held triggers short-sell flag |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-004 |
| Priority | High |
| Preconditions | Portfolio has 0 units of ISIN-Z. |
| Test Steps | 1. SELL order for ISIN-Z qty=5000. 2. Submit. |
| Test Data | holding=0; sell_qty=5000 |
| Expected Result | Short-sell alert displayed; order flagged with short_sell=true; requires additional SRM+Risk approval. |
| Postconditions | Order in special approval queue. |

### TC-GAP-VAL004-02 — Overselling beyond held quantity (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL004-02 |
| Name | Sell qty exceeds position |
| Category | Negative |
| Linked FR | FR-GAP-VAL-004 |
| Priority | High |
| Preconditions | Portfolio holds 10k units of ISIN-A. |
| Test Steps | 1. SELL 15000. 2. Submit. |
| Test Data | holding=10000; sell=15000 |
| Expected Result | VALIDATION_ERROR "Sell quantity (15,000) exceeds available position (10,000)." |
| Postconditions | No order. |

### TC-GAP-VAL005-01 — Hold-out flag blocks sale (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL005-01 |
| Name | Security under hold-out cannot be sold |
| Category | Negative |
| Linked FR | FR-GAP-VAL-005 |
| Priority | High |
| Preconditions | ISIN-H has hold_out_flag=true on PORT-00045. |
| Test Steps | 1. SELL order for ISIN-H. 2. Submit. |
| Test Data | hold_out=true |
| Expected Result | FORBIDDEN "Security is under hold-out; sale not permitted until released." |
| Postconditions | No order. |

### TC-GAP-VAL005-02 — Stock dividend receivable blocks sale (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL005-02 |
| Name | Pending stock dividend receivable blocks sale |
| Category | Negative |
| Linked FR | FR-GAP-VAL-005 |
| Priority | Medium |
| Preconditions | ISIN-S has pending stock_dividend_receivable on portfolio. |
| Test Steps | 1. SELL ISIN-S. 2. Submit. |
| Test Data | stock_div_pending=true |
| Expected Result | Warning "Pending stock dividend receivable on this security. Sale blocked until settled." |
| Postconditions | No order. |

### TC-GAP-VAL006-01 — IMA minimum face PHP 1M (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL006-01 |
| Name | IMA trade below PHP 1M minimum blocked |
| Category | Boundary |
| Linked FR | FR-GAP-VAL-006 |
| Priority | Critical |
| Preconditions | Portfolio type=IMA-Directed. |
| Test Steps | 1. BUY bond face_amount=PHP 999999. 2. Submit. |
| Test Data | face=999999 |
| Expected Result | VALIDATION_ERROR "IMA minimum face amount is PHP 1,000,000." |
| Postconditions | No order. |

### TC-GAP-VAL006-02 — IMA trade exactly PHP 1M accepted (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL006-02 |
| Name | IMA trade at exactly PHP 1M passes |
| Category | Boundary |
| Linked FR | FR-GAP-VAL-006 |
| Priority | Critical |
| Preconditions | Portfolio type=IMA. |
| Test Steps | 1. BUY bond face=PHP 1000000. 2. Submit. |
| Test Data | face=1000000 |
| Expected Result | Validation passes; order Pending-Auth. |
| Postconditions | Order created. |

### TC-GAP-VAL006-03 — No co-mingling between IMA accounts (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL006-03 |
| Name | Cross-IMA trust account transaction blocked |
| Category | Negative |
| Linked FR | FR-GAP-VAL-006 |
| Priority | Critical |
| Preconditions | Source=IMA-Trust-A; Destination=IMA-Trust-B (different trust). |
| Test Steps | 1. IPT from Trust-A to Trust-B. 2. Submit. |
| Test Data | cross-trust |
| Expected Result | FORBIDDEN "Co-mingling between IMA trust accounts is prohibited." |
| Postconditions | No transaction. |

### TC-GAP-VAL007-01 — IPT T+0 same tax status accepted (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL007-01 |
| Name | Inter-portfolio T+0 between same tax-status accounts |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-007 |
| Priority | High |
| Preconditions | Buyer=tax-exempt; Seller=tax-exempt; settle=T+0. |
| Test Steps | 1. IPT settle_date=today. 2. Submit. |
| Test Data | buyer_tax=exempt; seller_tax=exempt |
| Expected Result | Validation passes; T+0 settlement accepted. |
| Postconditions | IPT created. |

### TC-GAP-VAL007-02 — IPT T+0 different tax status blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL007-02 |
| Name | T+0 IPT between different tax statuses rejected |
| Category | Negative |
| Linked FR | FR-GAP-VAL-007 |
| Priority | High |
| Preconditions | Buyer=taxable; Seller=tax-exempt. |
| Test Steps | 1. IPT settle_date=today (T+0). 2. Submit. |
| Test Data | mixed tax status |
| Expected Result | VALIDATION_ERROR "T+0 IPT permitted only between same tax-status accounts." |
| Postconditions | No IPT. |

### TC-GAP-VAL008-01 — Currency mismatch warning (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL008-01 |
| Name | PHP portfolio buying USD security shows warning |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-008 |
| Priority | Medium |
| Preconditions | Portfolio base_ccy=PHP; security ccy=USD. |
| Test Steps | 1. BUY USD-denominated bond. 2. Observe. |
| Test Data | portfolio_ccy=PHP; security_ccy=USD |
| Expected Result | Warning "Currency mismatch: portfolio (PHP) vs security (USD). FX conversion required." User can acknowledge and proceed. |
| Postconditions | Order proceeds with FX flag. |

### TC-GAP-VAL009-01 — FATCA non-resident product restriction (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL009-01 |
| Name | Non-resident blocked from restricted product |
| Category | Negative |
| Linked FR | FR-GAP-VAL-009 |
| Priority | High |
| Preconditions | Client residency=Non-Resident; product restricted for non-residents. |
| Test Steps | 1. Order restricted product. 2. Submit. |
| Test Data | FATCA=Non-Resident |
| Expected Result | FORBIDDEN "Product not available for non-resident clients per FATCA restrictions." |
| Postconditions | No order. |

### TC-GAP-VAL010-01 — Cut-off time enforcement (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL010-01 |
| Name | UITF order at 11:29:59 accepted for today NAVpu |
| Category | Boundary |
| Linked FR | FR-GAP-VAL-010 |
| Priority | Critical |
| Preconditions | UITF cut-off=11:30 AM. |
| Test Steps | 1. Submit UITF order at 11:29:59. |
| Test Data | submit_time=11:29:59 |
| Expected Result | Accepted; NAVpu=today's; timestamp captured. |
| Postconditions | Order uses today NAVpu. |

### TC-GAP-VAL010-02 — Order after cut-off auto-rejected or rolled (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL010-02 |
| Name | UITF order at 11:30:01 rolls to next business day |
| Category | Boundary |
| Linked FR | FR-GAP-VAL-010 |
| Priority | Critical |
| Preconditions | UITF cut-off=11:30 AM. |
| Test Steps | 1. Submit at 11:30:01. |
| Test Data | submit_time=11:30:01 |
| Expected Result | Warning "Order received after cut-off. NAVpu will be next business day." Order accepted with next-day NAV flag. |
| Postconditions | NAVpu=next day. |

### TC-GAP-VAL011-01 — Unfunded order rejected (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL011-01 |
| Name | BUY order with insufficient funds in TSA |
| Category | Negative |
| Linked FR | FR-GAP-VAL-011 |
| Priority | High |
| Preconditions | TSA balance=PHP 2M; order=PHP 5M. |
| Test Steps | 1. Submit BUY PHP 5M. |
| Test Data | balance=2M; order=5M |
| Expected Result | VALIDATION_ERROR "Insufficient funds (PHP 2M available vs PHP 5M required)." |
| Postconditions | No order. |

### TC-GAP-VAL011-02 — Unfunded with "funding in transit" override (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL011-02 |
| Name | SRM overrides unfunded check with transit proof |
| Category | Workflow |
| Linked FR | FR-GAP-VAL-011 |
| Priority | High |
| Preconditions | TSA insufficient; wire transfer confirmed in transit. |
| Test Steps | 1. Submit order. 2. Unfunded warning. 3. SRM selects "Funding in transit". 4. Attaches proof. 5. Approves. |
| Test Data | transit_proof=wire receipt |
| Expected Result | Order accepted with funding_override=true; settlement blocked until funds clear; audit captures override. |
| Postconditions | Order conditional on funding. |

### TC-GAP-VAL012-01 — Withdrawal hierarchy: income first (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL012-01 |
| Name | Default withdrawal draws from income before principal |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-012 |
| Priority | Medium |
| Preconditions | Account has income=PHP 200k; principal=PHP 1M. |
| Test Steps | 1. Withdraw PHP 150k. |
| Test Data | withdraw=150000; income=200000; principal=1000000 |
| Expected Result | PHP 150k deducted from income component; principal untouched; breakdown shown. |
| Postconditions | Income=50k; principal=1M. |

### TC-GAP-VAL012-02 — Override withdrawal hierarchy (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL012-02 |
| Name | Override to draw principal first requires SRM approval |
| Category | Workflow |
| Linked FR | FR-GAP-VAL-012 |
| Priority | Medium |
| Preconditions | Client requests principal-first withdrawal. |
| Test Steps | 1. Select hierarchy_override=Principal-First. 2. Submit. 3. SRM approves override. |
| Test Data | override=Principal-First |
| Expected Result | Withdrawal applies to principal first; override_flag=true; audit captures SRM approval. |
| Postconditions | Principal reduced. |

### TC-GAP-VAL013-01 — Minimum balance check on withdrawal (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL013-01 |
| Name | Withdrawal that breaches minimum balance blocked |
| Category | Boundary |
| Linked FR | FR-GAP-VAL-013 |
| Priority | High |
| Preconditions | Balance=PHP 110k; minimum_balance=PHP 100k. |
| Test Steps | 1. Withdraw PHP 20k (would leave 90k). 2. Submit. |
| Test Data | withdraw=20000; remaining=90000; min=100000 |
| Expected Result | VALIDATION_ERROR "Withdrawal would breach minimum balance (PHP 100,000). Maximum withdrawable: PHP 10,000." |
| Postconditions | No withdrawal. |

### TC-GAP-VAL014-01 — CSA waiver for higher-risk product (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL014-01 |
| Name | Client acknowledges CSA waiver for aggressive product |
| Category | Workflow |
| Linked FR | FR-GAP-VAL-014 |
| Priority | High |
| Preconditions | Client risk=Moderate; product=Aggressive. |
| Test Steps | 1. BUY aggressive product. 2. Suitability mismatch warning. 3. Client signs CSA waiver. 4. RM uploads waiver. 5. Submit. |
| Test Data | waiver=signed |
| Expected Result | Order proceeds with csa_waiver=true; waiver document attached; Compliance notified; audit trail. |
| Postconditions | Order with waiver. |

### TC-GAP-VAL014-02 — CSA waiver not signed blocks order (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL014-02 |
| Name | Order blocked without CSA waiver |
| Category | Negative |
| Linked FR | FR-GAP-VAL-014 |
| Priority | High |
| Preconditions | Suitability mismatch; no waiver uploaded. |
| Test Steps | 1. Attempt submit without waiver. |
| Test Data | waiver=none |
| Expected Result | UNPROCESSABLE "CSA waiver required for higher-risk product." |
| Postconditions | No order. |

### TC-GAP-VAL015-01 — Document deficiency blocks order (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL015-01 |
| Name | Missing Letter of Instruction blocks transaction |
| Category | Negative |
| Linked FR | FR-GAP-VAL-015 |
| Priority | High |
| Preconditions | Account has outstanding_doc_deficiency=true (missing LOI). |
| Test Steps | 1. New Order for this account. 2. Submit. |
| Test Data | deficiency=LOI missing |
| Expected Result | UNPROCESSABLE "Outstanding document deficiency: Letter of Instruction required before transacting." |
| Postconditions | No order. |

### TC-GAP-VAL015-02 — Deficiency cleared allows order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL015-02 |
| Name | Order proceeds after deficiency resolved |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-015 |
| Priority | Medium |
| Preconditions | LOI uploaded and approved; deficiency cleared. |
| Test Steps | 1. New Order. 2. Submit. |
| Test Data | deficiency=cleared |
| Expected Result | No deficiency warning; order created normally. |
| Postconditions | Order in queue. |

### TC-GAP-VAL016-01 — Unsettled order prompt on new related order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL016-01 |
| Name | System prompts about existing unsettled order for same security |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-016 |
| Priority | Medium |
| Preconditions | Existing BUY for ISIN-A pending settlement. |
| Test Steps | 1. New BUY for ISIN-A same portfolio. 2. Observe prompt. |
| Test Data | existing unsettled BUY |
| Expected Result | Warning "Existing unsettled order for ISIN-A (ORD-XXX, PHP 5M, settle T+2). Proceed?" User acknowledges. |
| Postconditions | New order created. |

### TC-GAP-VAL017-01 — Post-trade compliance scheduled review (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL017-01 |
| Name | Scheduled post-trade review runs and flags breaches |
| Category | Happy Path |
| Linked FR | FR-GAP-VAL-017 |
| Priority | High |
| Preconditions | EOD batch configured; portfolios with 3 positions near limits. |
| Test Steps | 1. Trigger scheduled post-trade review. 2. Check results. |
| Test Data | 3 positions near limit |
| Expected Result | Review report generated; 3 positions flagged with utilization %; NTF to Risk; dashboard updated. |
| Postconditions | Review report available. |

### TC-GAP-VAL017-02 — Expiring credit line reminder (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-VAL017-02 |
| Name | Line expiring in 30 days triggers reminder |
| Category | Workflow |
| Linked FR | FR-GAP-VAL-017 |
| Priority | Medium |
| Preconditions | Counterparty line expires in 28 days. |
| Test Steps | 1. Scheduler runs daily check. |
| Test Data | expiry=28 days |
| Expected Result | NTF to RM + Risk: "Counterparty line for XYZ expires in 28 days. Renew or reduce exposure." |
| Postconditions | Alert logged. |

---

## 31. Test Cases — Gap Module: Portfolio Modeling & Rebalancing (FR-GAP-PMR)

### TC-GAP-PMR001-01 — What-if simulation on portfolio (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR001-01 |
| Name | Simulate adding equity position and see portfolio impact |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-001 |
| Priority | Critical |
| Preconditions | PORT-00045 loaded; current allocation visible. |
| Test Steps | 1. Portfolio Modeling → Simulate. 2. Add hypothetical BUY ISIN-A qty=50000 at PHP 100. 3. Run simulation. |
| Test Data | hypothetical BUY PHP 5M equity |
| Expected Result | Simulated allocation displayed: equity % increases; duration impact shown; yield impact calculated; no actual orders created. |
| Postconditions | Simulation saved in "My Simulations". |

### TC-GAP-PMR001-02 — Simulation on empty portfolio (edge)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR001-02 |
| Name | Simulation on portfolio with zero holdings |
| Category | Negative |
| Linked FR | FR-GAP-PMR-001 |
| Priority | Medium |
| Preconditions | Empty portfolio. |
| Test Steps | 1. Open Simulate on empty portfolio. |
| Test Data | zero holdings |
| Expected Result | "Portfolio has no current holdings. Add simulated positions to begin." No crash. |
| Postconditions | — |

### TC-GAP-PMR002-01 — ROI/yield/duration projection (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR002-01 |
| Name | Projected ROI and duration for asset switch |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-002 |
| Priority | Critical |
| Preconditions | PORT with bonds and equities; benchmark loaded. |
| Test Steps | 1. Simulate switch: sell Bond-A, buy Bond-B. 2. View projected ROI, yield, modified duration. |
| Test Data | sell Bond-A yield=4.5%; buy Bond-B yield=5.2% |
| Expected Result | Projected portfolio yield increases; duration change displayed; gain/loss on Bond-A computed; quarterly ROI forecast shown. |
| Postconditions | Projection saved. |

### TC-GAP-PMR002-02 — Gain/loss projection accuracy (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR002-02 |
| Name | Trading gain/loss projection matches manual calculation |
| Category | Boundary |
| Linked FR | FR-GAP-PMR-002 |
| Priority | High |
| Preconditions | Bond-A book=PHP 100; market=PHP 98. |
| Test Steps | 1. Simulate sell Bond-A at market. 2. Verify gain/loss. |
| Test Data | book=100; sell=98; qty=100k |
| Expected Result | Projected loss=PHP 200,000 ((98-100)×100k); matches manual calc. |
| Postconditions | — |

### TC-GAP-PMR003-01 — Stress test scenario (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR003-01 |
| Name | Apply +200bps rate shock to bond portfolio |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-003 |
| Priority | High |
| Preconditions | Bond portfolio loaded; yield curve available. |
| Test Steps | 1. Stress Test → Scenario="Parallel +200bps". 2. Run. |
| Test Data | shock=+200bps |
| Expected Result | Stressed NAV computed; P&L impact per position; total portfolio loss displayed; downloadable report. |
| Postconditions | Stress test report stored. |

### TC-GAP-PMR003-02 — Stress test with missing yield curve (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR003-02 |
| Name | Stress test fails gracefully when curve unavailable |
| Category | Negative |
| Linked FR | FR-GAP-PMR-003 |
| Priority | Medium |
| Preconditions | Yield curve feed down. |
| Test Steps | 1. Run stress test. |
| Test Data | curve_missing=true |
| Expected Result | Error "Yield curve data unavailable. Import curve or retry after feed restoration." |
| Postconditions | No result. |

### TC-GAP-PMR004-01 — Constant-mix rebalancing simulation (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR004-01 |
| Name | Simulate rebalancing to target 60/40 |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-004 |
| Priority | Critical |
| Preconditions | Portfolio currently 70% equity / 30% bonds; target=60/40. |
| Test Steps | 1. Rebalance → Model=60/40 Balanced. 2. Simulate. |
| Test Data | current=70/30; target=60/40 |
| Expected Result | Trades generated: sell equity ~10% AUM, buy bonds ~10% AUM; trade list editable before execution; compliance pre-check runs. |
| Postconditions | Simulated trade blotter displayed. |

### TC-GAP-PMR004-02 — Rebalance violates client restriction (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR004-02 |
| Name | Rebalance blocked by investor-specific restriction |
| Category | Negative |
| Linked FR | FR-GAP-PMR-004 |
| Priority | High |
| Preconditions | Client restricts ISIN-X ("do not sell"); rebalance wants to sell ISIN-X. |
| Test Steps | 1. Run rebalance. 2. ISIN-X in sell list. |
| Test Data | restricted security |
| Expected Result | Warning "ISIN-X restricted by investor; excluded from sell list." Rebalance recalculated without ISIN-X. |
| Postconditions | Adjusted trade blotter. |

### TC-GAP-PMR005-01 — Compare portfolio vs benchmark (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR005-01 |
| Name | Portfolio deviation from benchmark displayed |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-005 |
| Priority | High |
| Preconditions | Portfolio and benchmark loaded. |
| Test Steps | 1. Compare → select benchmark "PSEi". 2. View deviation. |
| Test Data | benchmark=PSEi |
| Expected Result | Sector-by-sector deviation displayed; overweight/underweight positions highlighted; tracking error calculated. |
| Postconditions | — |

### TC-GAP-PMR005-02 — Benchmark not available (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR005-02 |
| Name | Missing benchmark data shows error |
| Category | Negative |
| Linked FR | FR-GAP-PMR-005 |
| Priority | Low |
| Preconditions | Benchmark "Custom-Index" not imported. |
| Test Steps | 1. Select benchmark "Custom-Index". |
| Test Data | missing |
| Expected Result | "Benchmark data not available. Import benchmark composition first." |
| Postconditions | — |

### TC-GAP-PMR006-01 — Rebalance on new cash contribution (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR006-01 |
| Name | PHP 10M new cash invested per model allocation |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-006 |
| Priority | Critical |
| Preconditions | Portfolio model=60/40; new cash=PHP 10M. |
| Test Steps | 1. Rebalance → "On new cash" → PHP 10M. 2. Simulate. |
| Test Data | new_cash=10M; model=60/40 |
| Expected Result | PHP 6M allocated to equity, PHP 4M to bonds; buy orders generated per model securities; trade blotter editable. |
| Postconditions | Trade blotter ready. |

### TC-GAP-PMR006-02 — Rebalance on withdrawal (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR006-02 |
| Name | PHP 5M withdrawal rebalanced across asset classes |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-006 |
| Priority | High |
| Preconditions | Portfolio model=60/40; withdrawal=PHP 5M. |
| Test Steps | 1. Rebalance → "On withdrawal" → PHP 5M. 2. Simulate. |
| Test Data | withdrawal=5M |
| Expected Result | Sell orders generated proportionally (PHP 3M equity, PHP 2M bonds); maintains 60/40 post-withdrawal. |
| Postconditions | Trade blotter ready. |

### TC-GAP-PMR007-01 — Group rebalance across family accounts (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR007-01 |
| Name | Rebalance 5 family accounts against single model |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-007 |
| Priority | High |
| Preconditions | 5 portfolios in family group; all linked to model "Growth-60/40". |
| Test Steps | 1. Group Rebalance → select family group. 2. Model=Growth-60/40. 3. Simulate. |
| Test Data | 5 portfolios |
| Expected Result | Trade blotter generated for each portfolio; aggregate block orders suggested; per-portfolio compliance pre-checked. |
| Postconditions | 5 trade blotters ready. |

### TC-GAP-PMR007-02 — One portfolio in group has restriction (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR007-02 |
| Name | Group rebalance flags restricted portfolio separately |
| Category | Workflow |
| Linked FR | FR-GAP-PMR-007 |
| Priority | Medium |
| Preconditions | PORT-3 of 5 has security restriction. |
| Test Steps | 1. Run group rebalance. |
| Test Data | PORT-3 restricted |
| Expected Result | PORT-3 flagged with warning; other 4 proceed normally; PORT-3 excluded or adjusted. |
| Postconditions | PORT-3 requires manual review. |

### TC-GAP-PMR008-01 — Held-away assets in rebalancing (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR008-01 |
| Name | Held-away real estate included in allocation calculation |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-008 |
| Priority | Medium |
| Preconditions | Portfolio has PHP 20M trust assets + PHP 5M held-away real estate. |
| Test Steps | 1. Include held-away=true. 2. Rebalance. |
| Test Data | trust=20M; held_away=5M; total=25M |
| Expected Result | Total AUM=PHP 25M used for allocation %; held-away real estate counted as "Alternatives" in allocation; trade blotter adjusts trust-only portion. |
| Postconditions | — |

### TC-GAP-PMR009-01 — Trade blotter from rebalance (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR009-01 |
| Name | Generated trade blotter converted to live orders |
| Category | Happy Path |
| Linked FR | FR-GAP-PMR-009 |
| Priority | Critical |
| Preconditions | Rebalance simulation complete; trade blotter has 8 trades. |
| Test Steps | 1. Review blotter. 2. Edit trade-3 qty. 3. Click "Submit as Orders". |
| Test Data | 8 trades; edit trade-3 |
| Expected Result | 8 orders created in Pending-Auth; trade-3 uses edited qty; orders linked to rebalance_run_id; audit trail. |
| Postconditions | 8 orders in authorization queue. |

### TC-GAP-PMR009-02 — Empty trade blotter (edge)

| Field | Value |
|---|---|
| Test ID | TC-GAP-PMR009-02 |
| Name | Portfolio already at target shows no trades needed |
| Category | Negative |
| Linked FR | FR-GAP-PMR-009 |
| Priority | Low |
| Preconditions | Portfolio exactly at model allocation. |
| Test Steps | 1. Run rebalance. |
| Test Data | allocation matches model |
| Expected Result | "Portfolio is within tolerance of model allocation. No trades required." |
| Postconditions | — |

---

## 32. Test Cases — Gap Module: Risk & Asset Management (FR-GAP-RSK)

### TC-GAP-RSK001-01 — VAR computation (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK001-01 |
| Name | Daily VaR computed for bond portfolio |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-001 |
| Priority | High |
| Preconditions | Portfolio with 15 bond positions; market data available. |
| Test Steps | 1. Risk Dashboard → VaR → PORT-00045. 2. Confidence=99%; horizon=1-day. 3. Compute. |
| Test Data | confidence=99%; horizon=1d |
| Expected Result | VaR figure displayed (e.g., PHP 2.3M); component VaR per position; VaR % of AUM shown. |
| Postconditions | VaR stored for trend analysis. |

### TC-GAP-RSK001-02 — VaR back-test (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK001-02 |
| Name | Back-test VaR vs actual P&L for past 250 days |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-001 |
| Priority | High |
| Preconditions | 250 days of VaR and actual P&L data. |
| Test Steps | 1. VaR Back-Test → period=250 days. 2. Run. |
| Test Data | 250 days |
| Expected Result | Exceptions count displayed (days actual loss > VaR); chart of VaR vs actual P&L; Basel traffic-light zone (Green/Yellow/Red). |
| Postconditions | Back-test report stored. |

### TC-GAP-RSK002-01 — Macaulay/modified duration (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK002-01 |
| Name | Weighted portfolio duration computed as of today |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-002 |
| Priority | Medium |
| Preconditions | Bond portfolio with 10 positions; market data available. |
| Test Steps | 1. Risk → Duration → PORT-00045. 2. As-of=2026-04-18. |
| Test Data | as_of=today |
| Expected Result | Macaulay duration and modified duration displayed; benchmark duration shown side-by-side; duration gap computed. |
| Postconditions | — |

### TC-GAP-RSK002-02 — Historical duration as-of past date (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK002-02 |
| Name | Duration computed as of a historical date |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-002 |
| Priority | Medium |
| Preconditions | Historical positions and curves available for 2026-03-31. |
| Test Steps | 1. As-of=2026-03-31. 2. Compute. |
| Test Data | as_of=2026-03-31 |
| Expected Result | Duration computed using 2026-03-31 positions and yield curve. |
| Postconditions | — |

### TC-GAP-RSK003-01 — Stress test download per portfolio (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK003-01 |
| Name | Download stress test report for Q1 2026 |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-003 |
| Priority | Medium |
| Preconditions | Stress tests completed for Q1. |
| Test Steps | 1. Reports → Stress Test → PORT-00045. 2. Period=Q1-2026. 3. Download. |
| Test Data | period=2026-Q1 |
| Expected Result | PDF/Excel generated with per-scenario P&L impact; timestamp; digital signature. |
| Postconditions | File downloaded. |

### TC-GAP-RSK004-01 — IREP client disposition capture (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK004-01 |
| Name | RM records client disposition for 5% price-drop scenario |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-004 |
| Priority | Medium |
| Preconditions | Client CL-000123 has holdings with price-movement thresholds configured. |
| Test Steps | 1. IREP → Client CL-000123. 2. Threshold=-5%. 3. Disposition="Hold". 4. Save. |
| Test Data | threshold=-5%; disposition=Hold |
| Expected Result | IREP record saved; linked to client; triggers escalation if -5% is breached; audit logged. |
| Postconditions | IREP active for client. |

### TC-GAP-RSK004-02 — Price movement breach triggers IREP alert (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK004-02 |
| Name | Holding drops 6% triggering IREP notification |
| Category | Workflow |
| Linked FR | FR-GAP-RSK-004 |
| Priority | Medium |
| Preconditions | IREP threshold=-5%; market price drops 6%. |
| Test Steps | 1. EOD price update. 2. IREP engine runs. |
| Test Data | price_change=-6% |
| Expected Result | Alert raised to RM; client disposition shown ("Hold"); RM must acknowledge and contact client within SLA. |
| Postconditions | IREP alert active. |

### TC-GAP-RSK005-01 — Embedded derivative tag on security (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK005-01 |
| Name | Security tagged with embedded derivative flag |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-005 |
| Priority | Medium |
| Preconditions | Structured note ISIN-SN has callable feature. |
| Test Steps | 1. Security Master → ISIN-SN. 2. Check "Has embedded derivative". 3. Type="Call option". 4. Save. |
| Test Data | embedded_deriv=Call option |
| Expected Result | Flag saved; security appears in "Embedded Derivatives" report; bifurcation reminder if PFRS 9 applies. |
| Postconditions | Tag active. |

### TC-GAP-RSK006-01 — Derivative security setup with MTM (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK006-01 |
| Name | IRS (Interest Rate Swap) set up with mark-to-market |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-006 |
| Priority | High |
| Preconditions | Derivative module enabled; yield curve available. |
| Test Steps | 1. Derivatives → New IRS. 2. Notional=PHP 100M; fixed=5%; float=6M-BVAL+50bps; tenor=5Y. 3. Save. 4. Run MTM. |
| Test Data | IRS notional=100M; fixed=5% |
| Expected Result | IRS created; MTM computed showing fair value; P&L attribution captured; GL entries for MTM posted. |
| Postconditions | IRS on portfolio. |

### TC-GAP-RSK006-02 — Missing curve for MTM (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK006-02 |
| Name | MTM fails when discount curve unavailable |
| Category | Negative |
| Linked FR | FR-GAP-RSK-006 |
| Priority | Medium |
| Preconditions | Curve feed down. |
| Test Steps | 1. Run MTM on IRS. |
| Test Data | curve_missing |
| Expected Result | Error "Discount curve unavailable; MTM deferred. Previous day MTM retained with stale flag." |
| Postconditions | Stale flag set. |

### TC-GAP-RSK007-01 — Breach aging and curing monitor (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK007-01 |
| Name | Sector breach aging tracked and curing deadline shown |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-007 |
| Priority | Medium |
| Preconditions | Sector limit breach raised 15 days ago; curing period=30 days. |
| Test Steps | 1. Compliance Workbench → Open Breaches. 2. View sector breach. |
| Test Data | breach_age=15 days; cure_deadline=15 days remaining |
| Expected Result | Breach shows aging=15 days; cure_deadline=2026-05-03; progress bar at 50%; NTF if curing overdue. |
| Postconditions | — |

### TC-GAP-RSK007-02 — Curing period expired escalation (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK007-02 |
| Name | Expired curing period auto-escalates to CRO |
| Category | Workflow |
| Linked FR | FR-GAP-RSK-007 |
| Priority | Medium |
| Preconditions | Curing period expired yesterday. |
| Test Steps | 1. Scheduler runs daily. |
| Test Data | cure_expired=true |
| Expected Result | Auto-escalation to CRO; NTF P1; breach status=Curing-Expired; mandatory action required. |
| Postconditions | CRO inbox has escalation. |

### TC-GAP-RSK008-01 — Held-away asset booking (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK008-01 |
| Name | Book held-away real estate asset for consolidated view |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-008 |
| Priority | Medium |
| Preconditions | Client has real estate not managed by trust. |
| Test Steps | 1. Held-Away → Add. 2. Type=Real Estate; value=PHP 15M; location="Makati CBD". 3. Save. |
| Test Data | type=Real Estate; value=15M |
| Expected Result | Asset booked; appears in consolidated client view; excluded from NAV but included in total wealth. |
| Postconditions | Held-away asset visible. |

### TC-GAP-RSK008-02 — Held-away with negative value (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK008-02 |
| Name | Negative value rejected for held-away asset |
| Category | Negative |
| Linked FR | FR-GAP-RSK-008 |
| Priority | Low |
| Preconditions | — |
| Test Steps | 1. value=-5000000. 2. Save. |
| Test Data | value=-5M |
| Expected Result | VALIDATION_ERROR "Asset value must be ≥ 0." |
| Postconditions | — |

### TC-GAP-RSK009-01 — Asset transfer from another trustee bank (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK009-01 |
| Name | In-kind asset transfer received from external trustee |
| Category | Happy Path |
| Linked FR | FR-GAP-RSK-009 |
| Priority | High |
| Preconditions | Transfer agreement signed; securities list received. |
| Test Steps | 1. Asset Transfer → Inbound. 2. Source=BPI Trust. 3. Upload securities list (10 ISINs). 4. Submit. |
| Test Data | source=BPI Trust; 10 ISINs |
| Expected Result | Transfer record created; positions booked at transfer value; cost basis carried over; Pending-Auth by Compliance; custodian instructions generated. |
| Postconditions | 10 new positions pending settlement. |

### TC-GAP-RSK009-02 — Transfer with missing cost basis (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-RSK009-02 |
| Name | Transfer blocked when cost basis not provided |
| Category | Negative |
| Linked FR | FR-GAP-RSK-009 |
| Priority | Medium |
| Preconditions | Incoming transfer; 3 of 10 ISINs missing cost basis. |
| Test Steps | 1. Upload list. 2. Validate. |
| Test Data | 3 ISINs missing cost |
| Expected Result | VALIDATION_ERROR "Cost basis required for: ISIN-1, ISIN-5, ISIN-8." Partial upload blocked. |
| Postconditions | No transfer until resolved. |

---

## 33. Test Cases — Gap Module: Channel, Portal & Branch (FR-GAP-CHL)

### TC-GAP-CHL001-01 — Cross-channel order portability (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL001-01 |
| Name | Order captured at branch visible on online portal |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-001 |
| Priority | High |
| Preconditions | RM at Branch-Makati captures order ORD-900. |
| Test Steps | 1. RM captures ORD-900 at branch. 2. Client logs into online portal. 3. Checks "My Orders". |
| Test Data | — |
| Expected Result | ORD-900 visible with full details; channel_origin="Branch-Makati" displayed; status real-time. |
| Postconditions | — |

### TC-GAP-CHL001-02 — Portal order visible at branch (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL001-02 |
| Name | Order submitted via portal actionable at branch |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-001 |
| Priority | High |
| Preconditions | Client submits redemption request via portal. |
| Test Steps | 1. Client submits online. 2. Branch RM opens client profile. 3. Verifies order visible. |
| Test Data | — |
| Expected Result | Portal order visible in branch view; channel_origin="Portal"; RM can process. |
| Postconditions | — |

### TC-GAP-CHL002-01 — Branch search by CIF (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL002-01 |
| Name | Search client by CIF number at branch |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-002 |
| Priority | Medium |
| Preconditions | Branch user logged in. |
| Test Steps | 1. Search → CIF="CIF-0001234567". |
| Test Data | CIF=CIF-0001234567 |
| Expected Result | Client record found; profile displayed with accounts and recent transactions. |
| Postconditions | — |

### TC-GAP-CHL002-02 — Search with no match (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL002-02 |
| Name | CIF search returns no results |
| Category | Negative |
| Linked FR | FR-GAP-CHL-002 |
| Priority | Low |
| Preconditions | — |
| Test Steps | 1. Search CIF="CIF-9999999999". |
| Test Data | non-existent CIF |
| Expected Result | "No client found with CIF CIF-9999999999." |
| Postconditions | — |

### TC-GAP-CHL003-01 — Branch visibility restriction (permission)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL003-01 |
| Name | Branch user sees only own branch clients |
| Category | Permission |
| Linked FR | FR-GAP-CHL-003 |
| Priority | High |
| Preconditions | User-A at Branch-Makati; User-B at Branch-BGC; Client-X booked to Branch-BGC. |
| Test Steps | 1. User-A searches for Client-X. |
| Test Data | cross-branch |
| Expected Result | Client-X not found; "No matching clients in your branch." |
| Postconditions | — |

### TC-GAP-CHL003-02 — Head office user sees all branches (permission)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL003-02 |
| Name | Head office user has cross-branch visibility |
| Category | Permission |
| Linked FR | FR-GAP-CHL-003 |
| Priority | Medium |
| Preconditions | User with role=Head-Office. |
| Test Steps | 1. Search Client-X (Branch-BGC). |
| Test Data | — |
| Expected Result | Client-X visible; branch label shown. |
| Postconditions | — |

### TC-GAP-CHL004-01 — Branch quick-view dashboard (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL004-01 |
| Name | Dashboard shows IMA/TA maturities due today |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-004 |
| Priority | Medium |
| Preconditions | Branch has 3 IMA accounts maturing today. |
| Test Steps | 1. Branch Dashboard → Maturities Due Today. |
| Test Data | 3 maturities |
| Expected Result | 3 maturity items listed with account, amount, maturity_action (auto-roll/credit); quick-links to Trust products; Trust advisories section visible. |
| Postconditions | — |

### TC-GAP-CHL004-02 — Dashboard no maturities (edge)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL004-02 |
| Name | Dashboard shows placeholder when no maturities |
| Category | Negative |
| Linked FR | FR-GAP-CHL-004 |
| Priority | Low |
| Preconditions | No maturities today. |
| Test Steps | 1. View dashboard. |
| Test Data | zero maturities |
| Expected Result | "No maturities due today." placeholder. |
| Postconditions | — |

### TC-GAP-CHL005-01 — Client dashboard widget personalization (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL005-01 |
| Name | Client hides "Performance" widget |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-005 |
| Priority | Medium |
| Preconditions | Client logged into portal. |
| Test Steps | 1. Dashboard → Settings. 2. Toggle off "Performance Chart". 3. Save. 4. Refresh. |
| Test Data | hide_widget=Performance |
| Expected Result | Performance widget hidden; persists across sessions; other widgets unaffected. |
| Postconditions | Preference saved. |

### TC-GAP-CHL005-02 — Re-enable hidden widget (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL005-02 |
| Name | Client re-enables hidden widget |
| Category | Workflow |
| Linked FR | FR-GAP-CHL-005 |
| Priority | Low |
| Preconditions | Performance widget hidden. |
| Test Steps | 1. Settings → Toggle on "Performance Chart". 2. Save. |
| Test Data | — |
| Expected Result | Widget reappears immediately. |
| Postconditions | — |

### TC-GAP-CHL006-01 — COP/DS download in PDF (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL006-01 |
| Name | Client downloads Certificate of Participation as PDF |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-006 |
| Priority | High |
| Preconditions | Client has active UITF account with COP. |
| Test Steps | 1. My Accounts → UITF-MMF. 2. Click "Download COP" → PDF. |
| Test Data | format=PDF |
| Expected Result | PDF generated with account details, unit balance, NAVpu, date; digitally signed; downloaded. |
| Postconditions | Download audit logged. |

### TC-GAP-CHL006-02 — Disclosure Statement in Excel (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL006-02 |
| Name | Client downloads Disclosure Statement as Excel |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-006 |
| Priority | Medium |
| Preconditions | DS available for IMA account. |
| Test Steps | 1. Download DS → Excel. |
| Test Data | format=Excel |
| Expected Result | Excel file with read-only protection; contains portfolio composition, fees, performance; timestamp in header. |
| Postconditions | — |

### TC-GAP-CHL007-01 — Restricted-account view for redemption (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL007-01 |
| Name | Portal shows only redeemable accounts |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-007 |
| Priority | High |
| Preconditions | Client has 5 accounts: 3 active/redeemable, 2 dormant/locked. |
| Test Steps | 1. Portal → Redeem. 2. View account list. |
| Test Data | 3 active, 2 locked |
| Expected Result | Only 3 active accounts displayed; locked/dormant accounts hidden from redemption view. |
| Postconditions | — |

### TC-GAP-CHL007-02 — No redeemable accounts (edge)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL007-02 |
| Name | All accounts locked shows empty state |
| Category | Negative |
| Linked FR | FR-GAP-CHL-007 |
| Priority | Low |
| Preconditions | All accounts dormant. |
| Test Steps | 1. Portal → Redeem. |
| Test Data | all locked |
| Expected Result | "No accounts available for redemption. Contact your RM." |
| Postconditions | — |

### TC-GAP-CHL008-01 — Trader-ID tagging on order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL008-01 |
| Name | Every order tagged with executing trader ID |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-008 |
| Priority | High |
| Preconditions | Trader-T1 executes order. |
| Test Steps | 1. Trader-T1 places order. 2. View order detail. |
| Test Data | trader=T1 |
| Expected Result | trader_id=T1 stored; filter-by-trader returns this order; audit trail includes trader. |
| Postconditions | — |

### TC-GAP-CHL008-02 — Filter orders by trader (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL008-02 |
| Name | Order Explorer filtered by Trader-ID |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-008 |
| Priority | Medium |
| Preconditions | 50 orders today by 5 traders. |
| Test Steps | 1. Order Explorer → Filter: Trader=T1. |
| Test Data | trader=T1; expected ~10 orders |
| Expected Result | Only T1's orders displayed; count matches; exportable. |
| Postconditions | — |

### TC-GAP-CHL009-01 — Order filter by branch RBAC (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL009-01 |
| Name | SRM filters orders by branch with RBAC |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-009 |
| Priority | Medium |
| Preconditions | SRM with multi-branch access. |
| Test Steps | 1. Order Explorer → Filter: Branch=Makati. |
| Test Data | branch=Makati |
| Expected Result | Only Makati branch orders displayed; other branches filtered out. |
| Postconditions | — |

### TC-GAP-CHL009-02 — Branch-restricted SRM cannot see other branch (permission)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL009-02 |
| Name | SRM limited to Makati cannot filter BGC orders |
| Category | Permission |
| Linked FR | FR-GAP-CHL-009 |
| Priority | Medium |
| Preconditions | SRM role restricted to Branch-Makati only. |
| Test Steps | 1. Filter: Branch=BGC. |
| Test Data | — |
| Expected Result | "No permission to view BGC branch orders." or BGC not in dropdown. |
| Postconditions | — |

### TC-GAP-CHL010-01 — Chronological reference number generated (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL010-01 |
| Name | Transaction reference with date-time stamp auto-generated |
| Category | Happy Path |
| Linked FR | FR-GAP-CHL-010 |
| Priority | High |
| Preconditions | Order being submitted. |
| Test Steps | 1. Submit order at 2026-04-18 10:15:30. |
| Test Data | timestamp=2026-04-18T10:15:30 |
| Expected Result | ref_no format "TXN-20260418-101530-XXXX" (chronological, unique); stored on order and visible to client. |
| Postconditions | — |

### TC-GAP-CHL010-02 — Concurrent submissions get unique refs (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CHL010-02 |
| Name | Two orders at same second get distinct references |
| Category | Boundary |
| Linked FR | FR-GAP-CHL-010 |
| Priority | Medium |
| Preconditions | Two users submit at exact same second. |
| Test Steps | 1. Simultaneous submit. 2. Compare ref_nos. |
| Test Data | concurrent |
| Expected Result | Both get unique refs (sequence suffix differs); no collision. |
| Postconditions | — |

---

## 34. Test Cases — Gap Module: Cash, Payment & Settlement (FR-GAP-CPS)

### TC-GAP-CPS001-01 — Online FX at order capture (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS001-01 |
| Name | PHP client buying USD bond gets embedded FX conversion |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-001 |
| Priority | High |
| Preconditions | Client has PHP account only; buying USD bond. |
| Test Steps | 1. BUY USD bond. 2. System detects currency mismatch. 3. Embedded FX: rate=57.25 displayed. 4. Client confirms. |
| Test Data | rate=USD/PHP 57.25; bond_value=USD 100k |
| Expected Result | FX booked at 57.25; PHP equivalent=5,725,000 debited; FX deal linked to order; single transaction from client view. |
| Postconditions | FX deal + order linked. |

### TC-GAP-CPS001-02 — FX rate stale > 60s (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS001-02 |
| Name | Stale FX rate requires refresh before proceeding |
| Category | Negative |
| Linked FR | FR-GAP-CPS-001 |
| Priority | Medium |
| Preconditions | FX rate last refreshed > 60s ago. |
| Test Steps | 1. Proceed with stale rate. |
| Test Data | rate_age=90s |
| Expected Result | Warning "FX rate is stale (90s). Refresh required." Rate auto-refreshes; user re-confirms. |
| Postconditions | — |

### TC-GAP-CPS002-01 — Payment mode: Debit CA/SA (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS002-01 |
| Name | Contribution paid via real-time CA debit |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-002 |
| Priority | High |
| Preconditions | Client has CA-001 with PHP 500k balance. |
| Test Steps | 1. Contribution PHP 100k. 2. Payment mode=Debit CA/SA. 3. Select CA-001. 4. Submit. |
| Test Data | payment=Debit CA/SA; amount=100k |
| Expected Result | Real-time debit on CA-001; balance decreases by 100k; contribution confirmed immediately; receipt generated. |
| Postconditions | CA-001 debited; contribution credited. |

### TC-GAP-CPS002-02 — Insufficient CA balance (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS002-02 |
| Name | CA debit fails on insufficient funds |
| Category | Negative |
| Linked FR | FR-GAP-CPS-002 |
| Priority | High |
| Preconditions | CA-001 balance=PHP 50k. |
| Test Steps | 1. Contribute PHP 100k via Debit CA/SA. |
| Test Data | balance=50k; amount=100k |
| Expected Result | VALIDATION_ERROR "Insufficient funds in CA-001 (PHP 50,000 available vs PHP 100,000 required)." |
| Postconditions | No debit. |

### TC-GAP-CPS003-01 — Multi-currency order (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS003-01 |
| Name | Order with PHP payment settling in USD |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-003 |
| Priority | Medium |
| Preconditions | Multi-currency order enabled. |
| Test Steps | 1. BUY USD bond. 2. Payment_ccy=PHP; settle_ccy=USD. 3. FX auto-computed. 4. Submit. |
| Test Data | payment=PHP; settle=USD |
| Expected Result | Order captures both currencies; FX conversion linked; settlement in USD; GL entries in both currencies. |
| Postconditions | Multi-ccy order created. |

### TC-GAP-CPS003-02 — Unsupported currency pair (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS003-02 |
| Name | Unsupported currency pair rejected |
| Category | Negative |
| Linked FR | FR-GAP-CPS-003 |
| Priority | Low |
| Preconditions | — |
| Test Steps | 1. Payment=PHP; settle=THB (not configured). |
| Test Data | unsupported pair |
| Expected Result | VALIDATION_ERROR "Currency pair PHP/THB not configured. Contact Treasury." |
| Postconditions | — |

### TC-GAP-CPS004-01 — Book-only settlement (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS004-01 |
| Name | Private bank trade settled book-only (GL only) |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-004 |
| Priority | Medium |
| Preconditions | Trade flagged settlement_type=Book-Only; Private Bank account. |
| Test Steps | 1. Settle trade. 2. Select "Book-Only". 3. Confirm. |
| Test Data | settlement_type=Book-Only |
| Expected Result | GL entries posted (debit/credit); no SWIFT MT541/103 generated; status=Settled; audit shows "Book-Only". |
| Postconditions | Trade settled without payment instruction. |

### TC-GAP-CPS004-02 — Book-only on non-PB account blocked (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS004-02 |
| Name | Book-only not available for retail UITF |
| Category | Negative |
| Linked FR | FR-GAP-CPS-004 |
| Priority | Medium |
| Preconditions | UITF retail account. |
| Test Steps | 1. Attempt Book-Only settlement. |
| Test Data | account_type=UITF-Retail |
| Expected Result | FORBIDDEN "Book-only settlement restricted to Private Bank accounts." |
| Postconditions | — |

### TC-GAP-CPS005-01 — Bulk settlement processing (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS005-01 |
| Name | 200 settlement instructions processed in batch |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-005 |
| Priority | Medium |
| Preconditions | 200 confirmed trades pending settlement. |
| Test Steps | 1. Settlement → Bulk Process. 2. Select all 200. 3. Execute. |
| Test Data | 200 trades |
| Expected Result | All 200 processed; SWIFT messages generated in batch; failures flagged individually; summary report. |
| Postconditions | Settled count + exception count = 200. |

### TC-GAP-CPS005-02 — Partial bulk failure (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS005-02 |
| Name | 5 of 200 fail; 195 succeed |
| Category | Workflow |
| Linked FR | FR-GAP-CPS-005 |
| Priority | Medium |
| Preconditions | 5 have insufficient funds. |
| Test Steps | 1. Bulk settle. |
| Test Data | 5 failures |
| Expected Result | 195 settled; 5 flagged with reason; ops queue populated; no rollback of successful ones. |
| Postconditions | 5 exceptions in queue. |

### TC-GAP-CPS006-01 — Admin account sweep to TSA (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS006-01 |
| Name | Clearing account auto-sweeps into trust settlement account |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-006 |
| Priority | Medium |
| Preconditions | Clearing account has PHP 2M; sweep threshold configured. |
| Test Steps | 1. EOD sweep job runs. |
| Test Data | clearing_balance=2M |
| Expected Result | PHP 2M swept to TSA; GL entries posted; clearing account zeroed; audit trail. |
| Postconditions | TSA credited. |

### TC-GAP-CPS006-02 — Sweep below threshold skipped (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS006-02 |
| Name | Balance below sweep threshold not swept |
| Category | Boundary |
| Linked FR | FR-GAP-CPS-006 |
| Priority | Low |
| Preconditions | Clearing balance=PHP 5k; threshold=PHP 10k. |
| Test Steps | 1. EOD sweep. |
| Test Data | balance=5k; threshold=10k |
| Expected Result | No sweep; balance retained; log "Below sweep threshold." |
| Postconditions | — |

### TC-GAP-CPS007-01 — Official Receipt generated (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS007-01 |
| Name | OR auto-generated on cash contribution |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-007 |
| Priority | High |
| Preconditions | Cash contribution confirmed. |
| Test Steps | 1. Contribution settled. 2. View generated documents. |
| Test Data | amount=PHP 500k |
| Expected Result | OR generated with sequential OR number; amount, date, payor, payee; digitally signed; printable; audit logged. |
| Postconditions | OR stored in document repository. |

### TC-GAP-CPS007-02 — Duplicate OR prevented (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS007-02 |
| Name | Same transaction cannot generate duplicate OR |
| Category | Negative |
| Linked FR | FR-GAP-CPS-007 |
| Priority | Medium |
| Preconditions | OR already generated for transaction TXN-001. |
| Test Steps | 1. Trigger OR generation again for TXN-001. |
| Test Data | duplicate |
| Expected Result | "OR already exists for this transaction (OR-XXXX). Use reprint." |
| Postconditions | — |

### TC-GAP-CPS008-01 — Coupon processing grouped by custodian (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS008-01 |
| Name | Coupon payments processed per custodian batch |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-008 |
| Priority | Medium |
| Preconditions | 50 bonds across 3 custodians with coupons due today. |
| Test Steps | 1. Coupon Processing → Run. |
| Test Data | 3 custodians; 50 bonds |
| Expected Result | Processing grouped: Custodian-A (20 bonds), PDTC (18 bonds), Registry-X (12 bonds); separate settlement batches; per-custodian reconciliation report. |
| Postconditions | Coupons credited. |

### TC-GAP-CPS009-01 — Trust settlement account at portfolio level (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS009-01 |
| Name | Portfolio-level TSA in USD created |
| Category | Happy Path |
| Linked FR | FR-GAP-CPS-009 |
| Priority | Medium |
| Preconditions | Portfolio PORT-00045 needs dedicated USD TSA. |
| Test Steps | 1. TSA Setup → Portfolio-level. 2. Portfolio=PORT-00045; CCY=USD. 3. Save. |
| Test Data | portfolio=PORT-00045; ccy=USD |
| Expected Result | TSA created linked to portfolio; USD settlements route to this TSA; multi-currency view shows PHP + USD. |
| Postconditions | TSA active. |

### TC-GAP-CPS009-02 — Duplicate TSA for same portfolio/ccy (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-CPS009-02 |
| Name | Duplicate TSA creation blocked |
| Category | Negative |
| Linked FR | FR-GAP-CPS-009 |
| Priority | Low |
| Preconditions | USD TSA already exists for PORT-00045. |
| Test Steps | 1. Create another USD TSA for PORT-00045. |
| Test Data | duplicate |
| Expected Result | CONFLICT "USD TSA already exists for PORT-00045." |
| Postconditions | — |

---

## 35. Test Cases — Gap Module: Scheduled Investment & Retirement Products (FR-GAP-SRP)

### TC-GAP-SRP001-01 — EIP enrollment (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP001-01 |
| Name | Client enrolls in Easy Investment Plan |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-001 |
| Priority | High |
| Preconditions | Client active; CA nominated; UITF-MMF eligible. |
| Test Steps | 1. EIP → Enroll. 2. Fund=UITF-MMF-A; amount=PHP 5000/month; debit_account=CA-001; start=2026-05-01. 3. Submit. 4. Checker approves. |
| Test Data | fund=UITF-MMF-A; amount=5000; monthly; CA-001 |
| Expected Result | EIP enrollment created; core-system auto-debit instruction transmitted; schedule active; first debit=2026-05-01; confirmation to client. |
| Postconditions | EIP active. |

### TC-GAP-SRP001-02 — EIP modification (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP001-02 |
| Name | Client increases EIP amount |
| Category | Workflow |
| Linked FR | FR-GAP-SRP-001 |
| Priority | Medium |
| Preconditions | EIP active at PHP 5000/month. |
| Test Steps | 1. EIP → Modify. 2. New amount=PHP 10000. 3. Effective next cycle. 4. Submit. |
| Test Data | new_amount=10000 |
| Expected Result | Modification saved; core-system instruction updated; next debit=PHP 10000; audit shows change. |
| Postconditions | EIP amount updated. |

### TC-GAP-SRP001-03 — EIP unsubscription (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP001-03 |
| Name | Client cancels EIP |
| Category | Workflow |
| Linked FR | FR-GAP-SRP-001 |
| Priority | Medium |
| Preconditions | Active EIP. |
| Test Steps | 1. EIP → Unsubscribe. 2. Reason="No longer needed". 3. Submit. |
| Test Data | reason="No longer needed" |
| Expected Result | EIP deactivated; future debits cancelled; core-system instruction revoked; accumulated units retained; confirmation sent. |
| Postconditions | EIP inactive. |

### TC-GAP-SRP002-01 — ERP enrollment (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP002-01 |
| Name | Client enrolls in Easy Redemption Plan |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-002 |
| Priority | High |
| Preconditions | Client holds UITF-MMF units; CA for credit nominated. |
| Test Steps | 1. ERP → Enroll. 2. Fund=UITF-MMF-A; amount=PHP 10000/month; credit_account=CA-001. 3. Submit. |
| Test Data | redeem=10000/month; credit=CA-001 |
| Expected Result | ERP created; monthly redemption scheduled; credit to CA-001 on settlement; confirmation sent. |
| Postconditions | ERP active. |

### TC-GAP-SRP002-02 — ERP insufficient units (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP002-02 |
| Name | ERP cycle fails when insufficient units |
| Category | Negative |
| Linked FR | FR-GAP-SRP-002 |
| Priority | Medium |
| Preconditions | ERP active; remaining units < 1 month's redemption. |
| Test Steps | 1. Scheduled ERP runs. |
| Test Data | units_short |
| Expected Result | Partial redemption of remaining units; ERP auto-deactivated; NTF to client and RM "Insufficient units for scheduled redemption." |
| Postconditions | ERP deactivated. |

### TC-GAP-SRP003-01 — PERA enrollment new contributor (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP003-01 |
| Name | New PERA contributor enrolled with TIN validation |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-003 |
| Priority | Critical |
| Preconditions | Client TIN verified; no existing PERA account. |
| Test Steps | 1. PERA → Enroll New. 2. Enter TIN, employer, contribution=PHP 100k/year. 3. BSP PERA-Sys TIN check. 4. e-Learning completed. 5. Submit. |
| Test Data | TIN=123-456-789-000; contribution=100k |
| Expected Result | PERA account created; BSP PERA-Sys returns "No existing PERA"; e-Learning completion logged; contributor file generated. |
| Postconditions | PERA active. |

### TC-GAP-SRP003-02 — Duplicate PERA blocked by BSP API (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP003-02 |
| Name | BSP PERA-Sys detects existing PERA account |
| Category | Negative |
| Linked FR | FR-GAP-SRP-003 |
| Priority | Critical |
| Preconditions | TIN already has PERA with another administrator. |
| Test Steps | 1. Enroll. 2. BSP check returns "Existing PERA found". |
| Test Data | duplicate TIN |
| Expected Result | UNPROCESSABLE "Contributor already has PERA account (Admin: XYZ Bank). Transfer-in required." |
| Postconditions | No enrollment. |

### TC-GAP-SRP003-03 — Max PERA products per contributor (boundary)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP003-03 |
| Name | Contributor exceeding max PERA products blocked |
| Category | Boundary |
| Linked FR | FR-GAP-SRP-003 |
| Priority | Critical |
| Preconditions | Contributor has 5 PERA products (max=5). |
| Test Steps | 1. Add 6th PERA product. |
| Test Data | products=5; max=5 |
| Expected Result | VALIDATION_ERROR "Maximum PERA products per contributor reached (5/5)." |
| Postconditions | No new product. |

### TC-GAP-SRP004-01 — PERA qualified withdrawal (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP004-01 |
| Name | Contributor age 55+ makes qualified withdrawal |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-004 |
| Priority | Critical |
| Preconditions | Contributor age=56; PERA contribution period ≥ 5 years. |
| Test Steps | 1. PERA → Withdraw → Qualified. 2. Amount=PHP 500k. 3. Submit. |
| Test Data | age=56; period=7y; amount=500k |
| Expected Result | Withdrawal processed; tax-free (qualified); BSP transaction file updated; proceeds credited; no penalty. |
| Postconditions | PERA balance reduced. |

### TC-GAP-SRP004-02 — PERA unqualified withdrawal with penalty (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP004-02 |
| Name | Early withdrawal triggers penalty |
| Category | Workflow |
| Linked FR | FR-GAP-SRP-004 |
| Priority | Critical |
| Preconditions | Contributor age=35; early withdrawal. |
| Test Steps | 1. PERA → Withdraw → Unqualified. 2. Amount=PHP 200k. 3. Acknowledge penalty. |
| Test Data | age=35; amount=200k |
| Expected Result | Penalty computed per BSP rules; tax credit reversed; net proceeds=200k minus penalty; BSP file updated; client advised of penalty amount. |
| Postconditions | Penalty applied. |

### TC-GAP-SRP005-01 — PERA transfer to another administrator (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP005-01 |
| Name | Contributor transfers PERA to another bank |
| Category | Workflow |
| Linked FR | FR-GAP-SRP-005 |
| Priority | High |
| Preconditions | PERA active with BDO. |
| Test Steps | 1. PERA → Transfer Out. 2. Target=XYZ Bank. 3. Submit. 4. Compliance approves. |
| Test Data | target_admin=XYZ Bank |
| Expected Result | Transfer request processed; BSP PERA-Sys notified; assets liquidated or transferred in-kind; contribution history exported; account closed. |
| Postconditions | PERA closed with BDO. |

### TC-GAP-SRP005-02 — Transfer without BSP notification (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP005-02 |
| Name | BSP notification failure blocks transfer |
| Category | Negative |
| Linked FR | FR-GAP-SRP-005 |
| Priority | High |
| Preconditions | BSP PERA-Sys API down. |
| Test Steps | 1. Submit transfer. |
| Test Data | API_down |
| Expected Result | Error "BSP PERA-Sys unreachable. Transfer deferred. Retry when API available." |
| Postconditions | Transfer pending. |

### TC-GAP-SRP006-01 — BSP contributor file generation (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP006-01 |
| Name | Monthly BSP PERA contributor file generated |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-006 |
| Priority | High |
| Preconditions | Month-end; 500 active PERA contributors. |
| Test Steps | 1. Reports → BSP PERA Files → Contributor File. 2. Generate. |
| Test Data | 500 contributors |
| Expected Result | CSV/XML generated per BSP schema; 500 rows; validated; digital signature applied; ready for BSP submission. |
| Postconditions | File ready. |

### TC-GAP-SRP006-02 — Transaction file generation (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP006-02 |
| Name | Monthly BSP PERA transaction file generated |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-006 |
| Priority | High |
| Preconditions | 200 PERA transactions this month. |
| Test Steps | 1. Generate Transaction File. |
| Test Data | 200 transactions |
| Expected Result | File generated per BSP format; all transaction types covered; totals reconcile to GL. |
| Postconditions | Filed. |

### TC-GAP-SRP007-01 — Tax Credit Certificate processing (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP007-01 |
| Name | TCC generated for qualified PERA contributor |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-007 |
| Priority | High |
| Preconditions | Contributor made PHP 100k annual contribution; eligible for 5% TCC. |
| Test Steps | 1. Year-end TCC processing. |
| Test Data | contribution=100k; TCC_rate=5% |
| Expected Result | TCC=PHP 5000 generated; certificate downloadable; filed with BIR; contributor notified. |
| Postconditions | TCC issued. |

### TC-GAP-SRP007-02 — TCC for non-eligible contributor (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP007-02 |
| Name | Contributor below minimum not issued TCC |
| Category | Negative |
| Linked FR | FR-GAP-SRP-007 |
| Priority | Medium |
| Preconditions | Contribution below minimum threshold. |
| Test Steps | 1. Year-end processing. |
| Test Data | below_minimum |
| Expected Result | No TCC generated; log shows "Below minimum contribution for TCC." |
| Postconditions | — |

### TC-GAP-SRP008-01 — IMA acceptance with standing instruction auto-roll (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP008-01 |
| Name | IMA matures and auto-rolls per standing instruction |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-008 |
| Priority | High |
| Preconditions | IMA-001 matures 2026-04-18; SI=Auto-Roll; new tenor=90 days. |
| Test Steps | 1. Maturity date reached. 2. System processes SI. |
| Test Data | SI=Auto-Roll; tenor=90d |
| Expected Result | Maturity proceeds rolled into new IMA placement; new maturity=2026-07-17; client advised; no manual intervention needed. |
| Postconditions | New IMA created. |

### TC-GAP-SRP008-02 — SI auto-credit to CA (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP008-02 |
| Name | Maturity proceeds auto-credited to CA per SI |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-008 |
| Priority | High |
| Preconditions | IMA-002 matures; SI=Auto-Credit to CA-001. |
| Test Steps | 1. Maturity date. 2. System processes. |
| Test Data | SI=Auto-Credit; target=CA-001 |
| Expected Result | Proceeds credited to CA-001; IMA closed; client advised; GL entries posted. |
| Postconditions | CA-001 credited. |

### TC-GAP-SRP008-03 — No SI configured prompts RM (workflow)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP008-03 |
| Name | Maturity without SI sends alert to RM |
| Category | Workflow |
| Linked FR | FR-GAP-SRP-008 |
| Priority | Medium |
| Preconditions | IMA-003 matures; no SI configured. |
| Test Steps | 1. T-5 days: scheduler runs. |
| Test Data | no SI |
| Expected Result | NTF to RM + Client: "IMA-003 maturing in 5 days. No standing instruction. Please advise." |
| Postconditions | Alert raised. |

### TC-GAP-SRP009-01 — Pretermination workflow (happy)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP009-01 |
| Name | Client preterminates IMA with early withdrawal penalty |
| Category | Happy Path |
| Linked FR | FR-GAP-SRP-009 |
| Priority | High |
| Preconditions | IMA-004 tenor=180d; current day=90 (50% elapsed). |
| Test Steps | 1. IMA → Preterminate. 2. Acknowledge penalty. 3. Submit. 4. Compliance approves. |
| Test Data | elapsed=90/180 days |
| Expected Result | Penalty computed per mandate; proceeds=principal minus penalty plus accrued interest; payout to CA; IMA closed; audit trail. |
| Postconditions | IMA preterminated. |

### TC-GAP-SRP009-02 — Pretermination without client acknowledgment (negative)

| Field | Value |
|---|---|
| Test ID | TC-GAP-SRP009-02 |
| Name | Pretermination blocked without penalty acknowledgment |
| Category | Negative |
| Linked FR | FR-GAP-SRP-009 |
| Priority | Medium |
| Preconditions | — |
| Test Steps | 1. Preterminate without ticking "I acknowledge penalty". |
| Test Data | — |
| Expected Result | UNPROCESSABLE "Client must acknowledge pretermination penalty before proceeding." |
| Postconditions | — |

---

## 36. Gap Integration / End-to-End Test Cases

### TC-GAP-INT-001 — Full rebalance-to-execution cycle

| Steps |
|---|
| 1. Portfolio officer runs rebalance simulation. 2. Edits trade blotter. 3. Submits as orders. 4. SRM authorizes (2-eyes). 5. Trader aggregates + places. 6. Fills received. 7. Settlement completes. |

| Expected |
|---|
| All steps succeed; portfolio allocation matches model post-settlement; audit trail links rebalance_run_id through to settlement. |

### TC-GAP-INT-002 — EIP auto-debit → UITF unit issuance → ERP auto-credit

| Expected |
|---|
| Monthly EIP debits CA; units issued at NAVpu; 6 months later, ERP redeems units; proceeds credited to CA; full cycle auditable. |

### TC-GAP-INT-003 — PERA enrollment → contribution → TCC → qualified withdrawal

| Expected |
|---|
| Contributor enrolled; annual contribution made; TCC issued; at age 55+, qualified withdrawal tax-free; BSP files generated at each stage. |

### TC-GAP-INT-004 — IPO advance order → volume cap → allocation → settlement

| Expected |
|---|
| Multiple advance orders captured; cumulative capped at issue limit; IPO allocation engine distributes pro-rata; settlement completes; audit trail end-to-end. |

### TC-GAP-INT-005 — Cross-channel switch order with FX

| Expected |
|---|
| Client initiates Switch-In/Out via portal; branch RM sees order; embedded FX conversion for USD→PHP leg; both legs settle atomically; COP updated. |

### TC-GAP-INT-006 — Hard/soft breach during rebalance submission

| Expected |
|---|
| Rebalance generates 10 orders; 1 hits hard breach (prohibited), 1 hits soft breach (sector limit); hard-breach order blocked; soft-breach overridden by Compliance; remaining 8 proceed normally. |

---

## 37. Gap Permission / SoD Tests

| Test ID | Action | Authorized Role | Unauthorized Role Tried | Expected |
|---|---|---|---|---|
| TC-GAP-PERM-01 | Back-date override | SRM + Compliance | RM alone | FORBIDDEN |
| TC-GAP-PERM-02 | Soft breach override | Compliance (override RBAC) | RM | FORBIDDEN |
| TC-GAP-PERM-03 | Fee charge override | SRM | Trader alone | FORBIDDEN |
| TC-GAP-PERM-04 | Rebalance submit as orders | Portfolio Officer | Client | FORBIDDEN |
| TC-GAP-PERM-05 | PERA transfer out | Compliance + BO | RM alone | FORBIDDEN |
| TC-GAP-PERM-06 | Kill-switch + book-only combo | CRO+CCO | BO-Maker | FORBIDDEN |
| TC-GAP-PERM-07 | Branch cross-visibility | Head-Office | Branch-User (other branch) | FORBIDDEN |
| TC-GAP-PERM-08 | IMA pretermination approve | Compliance | Trader | FORBIDDEN |
| TC-GAP-PERM-09 | IPO allocation override | BO-Head + Compliance | Trader | FORBIDDEN |
| TC-GAP-PERM-10 | Derivative setup | Risk + Treasury | RM | FORBIDDEN |

---

## 38. Gap Process-Flow Traversal Paths

| Path ID | Description | Covered By |
|---|---|---|
| P-GAP-01 | Rebalance simulation → trade blotter → order submission → execution → settlement | TC-GAP-INT-001 |
| P-GAP-02 | EIP enroll → monthly auto-debit → unit issuance → ERP redeem → auto-credit | TC-GAP-INT-002 |
| P-GAP-03 | PERA full lifecycle (enroll → contribute → TCC → withdraw) | TC-GAP-INT-003 |
| P-GAP-04 | IPO advance → volume cap → allocation → settlement | TC-GAP-INT-004 |
| P-GAP-05 | Cross-channel switch with FX | TC-GAP-INT-005 |
| P-GAP-06 | Rebalance with mixed hard/soft breaches | TC-GAP-INT-006 |

### TC-GAP-PFT-01 — Rebalance with client restriction loop

| Expected |
|---|
| Rebalance run → client restriction excludes 2 securities → adjusted blotter generated → orders submitted → compliance re-check passes → execution completes. |

### TC-GAP-PFT-02 — PERA transfer-in from another admin

| Expected |
|---|
| BSP PERA-Sys validates contributor → transfer-in request sent to source admin → assets received → positions booked → contribution history imported → PERA active. |

### TC-GAP-PFT-03 — IMA maturity → SI evaluation → auto-roll/credit

| Expected |
|---|
| T-5 pre-maturity NTF → maturity date → SI lookup → auto-roll creates new placement with fresh tenor → client advised → old IMA closed. |

### TC-GAP-PFT-04 — Scheduled order on holiday chain

| Expected |
|---|
| Scheduled withdrawal falls on Thursday (holiday) → shifts to Friday → Friday is also holiday → shifts to Monday → executes Monday → audit shows both shifts. |

### TC-GAP-PFT-05 — GTC order across 3 trading days → partial fills → full fill

| Expected |
|---|
| GTC placed Monday → partial fill Tuesday (40%) → partial fill Wednesday (35%) → full fill Thursday (25%) → all allocations correct; VWAP computed across 3 fills; settlement per fill date. |

### TC-GAP-PFT-06 — Back-dated contribution → NAVpu lookup → unit issuance at historical price

| Expected |
|---|
| Back-dated contribution T-3 approved → system retrieves NAVpu from T-3 → units issued at historical NAVpu → GL entries dated T-3 → audit shows override chain. |

---

## 39. Exit Criteria for UAT (Updated)

### Original BRD Coverage
- 100 % of FR happy-path tests pass (TC-ONB through TC-AID).
- ≥ 95 % of FR negative + boundary tests pass.
- 0 Sev-1, ≤ 3 Sev-2 defects with workaround, ≤ 25 Sev-3 defects.
- Performance tests meet P95 targets in Section 8.1 of BRD.
- All integration tests TC-INT-001 through TC-INT-012 pass.
- All process-flow traversal tests TC-PFT-01 through TC-PFT-06 pass.
- Zero open Critical security findings.

### BDO RFI Gap Coverage (Part B)
- 100 % of GAP happy-path tests pass (TC-GAP-OTF through TC-GAP-SRP).
- ≥ 90 % of GAP negative + boundary tests pass.
- All GAP integration tests TC-GAP-INT-001 through TC-GAP-INT-006 pass.
- All GAP process-flow traversal tests TC-GAP-PFT-01 through TC-GAP-PFT-06 pass.
- All GAP permission tests TC-GAP-PERM-01 through TC-GAP-PERM-10 pass.
- Critical-severity gaps (Portfolio Modeling, PERA lifecycle) at 100 % pass rate.
- BSP PERA-Sys API integration verified in staging with mock BSP endpoints.

---

*End of Test-Case Document.*
