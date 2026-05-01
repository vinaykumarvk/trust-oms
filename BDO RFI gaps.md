# BDO RFI Gaps — TrustOMS Philippines vs Transcend RFI Functional Requirements

**Audit Date:** 2026-05-01
**RFI Document:** `docs/Transcend RFI - Request for Information.xlsx - Functional Requirements.pdf`
**Codebase:** TrustOMS Philippines (commit `473ad54`, branch `main`)

---

## Executive Summary

| Category | Total FRs | DONE | PARTIAL | NOT_FOUND | Coverage % |
|----------|-----------|------|---------|-----------|------------|
| Product/Services Mgmt (PSM 1-23) | 23 | 16 | 5 | 2 | 69.6% |
| EBT (PSM 24-69) | 19 | 1 | 9 | 9 | 5.3% |
| Corporate Trust (PSM 70-96) | 22 | 1 | 8 | 13 | 4.5% |
| Securities Services (PSM 97-120) | 24 | 12 | 6 | 6 | 50.0% |
| PERA (PSM 121-129) | 9 | 7 | 2 | 0 | 77.8% |
| Asset Management (AM 1-32) | 32 | 25 | 5 | 2 | 78.1% |
| Client Onboarding (CO 1-29) | 29 | 27 | 2 | 0 | 93.1% |
| Document Management (DM 1-11) | 11 | 5 | 4 | 2 | 45.5% |
| Account & Fund Mgmt (AFM 1-77) | 80 | 45 | 21 | 14 | 56.3% |
| Order Management (OM 1-96) | 96 | 77 | 16 | 3 | 80.2% |
| Operations (OPS 1-78) | 78 | 55 | 16 | 7 | 70.5% |
| Risk Management (RM 1-37) | 37 | 31 | 4 | 2 | 83.8% |
| Reporting & Analytics (RA 1-28) | 28 | 8 | 18 | 2 | 28.6% |
| General Requirements (GR 1-93) | 93 | 50 | 38 | 5 | 53.8% |
| Channel Systems (CH 1-34) | 34 | 22 | 12 | 0 | 64.7% |
| **TOTAL** | **635** | **382** | **166** | **67** | **60.2%** |

**Verdict: GAPS-FOUND** — 60.2% fully implemented, 86.1% at least partially addressed. 67 requirements have no code evidence.

---

## Critical Gap Categories

### A. NOT_FOUND — No Code Evidence (67 items)

These requirements have zero implementation in the codebase.

---

### 1. EMPLOYEE BENEFIT TRUST (EBT) — 9 NOT_FOUND

The EBT module is almost entirely absent. TrustOMS supports the `EMPLOYEE_BENEFIT` trust product type in its enum, but no EBT-specific business logic exists.

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| EBT-01 | PSM-25 | Working sheet to show how balance was derived for each employee | L | P1 |
| EBT-02 | PSM-30 | Reinstatement while posting Contribution; validate re-contribution after withdrawal (parameter for years/months/days/cut-off date to reinstate membership) | M | P1 |
| EBT-03 | PSM-35 | Validations on eligibility of separating employee | M | P1 |
| EBT-04 | PSM-36 | Add other types of benefits (unused Leaves, CBA benefits, honoraria pay, etc.) | L | P2 |
| EBT-05 | PSM-37 | Add/edit reasons/nature of separation | S | P2 |
| EBT-06 | PSM-38 | Interfacing of loan balances from bank's Loan system to Employee Benefit Trust (EBT) | L | P1 |
| EBT-07 | PSM-39 | Facility to edit/update Loan balances | M | P2 |
| EBT-08 | PSM-41 | Facility to bypass rules if client/3rd party provides the retirement benefit calculation | M | P2 |
| EBT-09 | PSM-42 | Facility to determine the higher benefits in case of Minimum benefits/floor amount required | M | P2 |

**Additional EBT PARTIAL gaps (need completion):**

| Gap ID | FR ID | Requirement | What's Missing | Size |
|--------|-------|-------------|----------------|------|
| EBT-10 | PSM-18 | Gratuity calculation rules | No gratuity_rules or EBT-specific calculation service | L |
| EBT-11 | PSM-19 | Tax structure setup for EBT | EBT-specific tax structure (contribution, income, withdrawal tax rules) not implemented | M |
| EBT-12 | PSM-20 | Tax exemption rules for EBT | Explicit tax exemption application logic (EBT thresholds) missing | M |
| EBT-13 | PSM-21 | Income distribution rules for EBT | EBT-specific income distribution policy not implemented | M |
| EBT-14 | PSM-40 | Edit/update plan rules setup (multi-employer) | No multi-employer scenario handling or employer-switching logic | M |

---

### 2. CORPORATE TRUST — 13 NOT_FOUND

The Corporate Trust / Loan Management module is entirely absent. No loan entity, loan lifecycle, or corporate trust workflow exists.

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| CT-01 | PSM-70 | Purchase and sale of loans by investor | XL | P0 |
| CT-02 | PSM-71 | Loan contribution/withdrawal (receive free/deliver free) | L | P0 |
| CT-03 | PSM-72 | Collection of principal and income repayments | L | P0 |
| CT-04 | PSM-73 | Prepayments, rollovers, and extensions | L | P1 |
| CT-05 | PSM-75 | Adjustments/amendments to loan terms | M | P1 |
| CT-06 | PSM-76 | Outstanding loans monitoring dashboard | L | P1 |
| CT-07 | PSM-77 | Loan detail master entity | L | P0 |
| CT-08 | PSM-78 | Mortgage Participation Certificate (MPC) issuances and cancellation | L | P1 |
| CT-09 | PSM-79 | Loans and collateral revaluations | L | P1 |
| CT-10 | PSM-80 | Loan availability and availments tracking | M | P1 |
| CT-11 | PSM-81 | Computation/generation of reports on regular interest and/or principal payments (10-15 days before payment date) | M | P1 |
| CT-12 | PSM-82 | Monitoring of receivables and payables | M | P2 |
| CT-13 | PSM-87 | Monitor sound value of collateral and loans and credit facilities | L | P1 |

**Additional Corporate Trust PARTIAL gaps:**

| Gap ID | FR ID | Requirement | What's Missing | Size |
|--------|-------|-------------|----------------|------|
| CT-14 | PSM-74 | Accruals and other financial activities | Accrual engine exists but not loan-interest specific | M |
| CT-15 | PSM-85 | Prompt schedule of interest payments | Loan-coupon scheduling and payment notification missing | M |
| CT-16 | PSM-86 | Safekeeping of titles, securities agreements | Loan-title document management not separate | M |
| CT-17 | PSM-89 | Reports and letters to creditors | No creditor/lender letter templates | M |
| CT-18 | PSM-91 | Different amortization computations for loans | Loan amortization schedule computation missing | L |

---

### 3. SECURITIES SERVICES — 6 NOT_FOUND

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| SS-01 | PSM-101 | Maintenance of Stock Transfer Files | M | P2 |
| SS-02 | PSM-108 | Processing of certificated and scripless shares with different class of securities | M | P2 |
| SS-03 | PSM-110 | Process stock rights | M | P2 |
| SS-04 | PSM-112 | Inventory of unclaimed stock certificates with corresponding tagging as to where items are | M | P2 |
| SS-05 | PSM-113 | Capture record details from former Transfer Agent through file upload | M | P2 |
| SS-06 | PSM-116 | Account for registration, proxy tabulation and votation during Annual/Special Stockholders Meeting | L | P2 |

---

### 4. ACCOUNT & FUND MANAGEMENT — 14 NOT_FOUND

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| AFM-01 | AFM-4 | Copy account function (duplicate an existing account and modify) — copy portfolio models, investment considerations, trust fee structure | M | P1 |
| AFM-02 | AFM-10 | Input required level and priority of funding for project accounts (Corporate Trust Accounts) | M | P2 |
| AFM-03 | AFM-11 | Link project accounts to collateral trustee account (Corporate Trust) | M | P2 |
| AFM-04 | AFM-12 | Consolidate Trust Accounts and Portfolios under Mother Accounts / group of accounts | L | P1 |
| AFM-05 | AFM-20 | View/display all accounts linked to collateral trustee account | M | P2 |
| AFM-06 | AFM-26 | Advanced Loan and Collateral Management — detailed tracking system for loan payments, schedules, interest calculations; collateral management with tagging consistent with vault records (Corporate Trust) | XL | P1 |
| AFM-07 | AFM-27 | Auto facility to mark accounts as dormant; Monitor and trigger Designated User for dormant accounts | M | P1 |
| AFM-08 | AFM-30 | Auto closing facility/closed tagging for Account and Portfolio based on defined parameters | M | P2 |
| AFM-09 | AFM-31 | Facility to reopen closed accounts with manual review and approval process | S | P2 |
| AFM-10 | AFM-33 | Allow tagging/untagging of account for hold-out, post no debit, Hold Out — Can classify to different types of hold-out (on client, account, holdings, hold-out/freeze/deceased/garnished/special) | M | P1 |
| AFM-11 | AFM-34 | Full or partial hold-out of security and store historical movement of hold-out tagging; Promissory Notes details; loan amount being secured; borrower details; maturity date of loan count order details | L | P2 |
| AFM-12 | AFM-52 | Family office fee / Corporation Management fees for each holding company | M | P2 |
| AFM-13 | AFM-60 | Trust Fee Dormant accounts — fee handling for dormant accounts | S | P2 |
| AFM-14 | AFM-61 | Fee Sharing Arrangement — monitoring and collection of Trust Fees under Fee Sharing Arrangement on specified parameters; Fund-level trust fee based on actual placements | L | P2 |

---

### 5. ORDER MANAGEMENT — 3 NOT_FOUND

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| OM-01 | OM-18 | Allow import of trade transactions; allow multiple entry of transactions for a single security (uploaded from an excel file with validations) | M | P1 |
| OM-02 | OM-21 | Switch In/Switch Out order type — explicit SWITCH order type enum value | S | P1 |
| OM-03 | OM-10 | Booking of Held-Away Assets — dedicated held-away booking workflow | M | P2 |

---

### 6. OPERATIONS — 7 NOT_FOUND

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| OPS-01 | OPS-25 | Loan refunds (for Unibank/partner bank) | M | P2 |
| OPS-02 | OPS-61 | Depreciation of Properties on Defined Parameters | L | P2 |
| OPS-03 | OPS-75 | Bank reconciliation for checks issued, paid, voided, stale (including reports relative to it) | L | P1 |
| OPS-04 | OPS-76 | Maintenance of check number file and certificate number file (alphanumeric issuance with prefix, suffix, increments) | M | P2 |
| OPS-05 | OPS-77 | Check printing facility for refund, commissions and proceeds of IPO and Receiving Agency Accounts | L | P2 |
| OPS-06 | OPS-78 | Generate checks for settlement payment, retirement benefit payment, and account withdrawal | L | P2 |
| OPS-07 | OPS-34 | Reversal of LGF — Loan Guarantee Fund (for Unibank) | M | P2 |

---

### 7. RISK MANAGEMENT — 2 NOT_FOUND

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| RM-01 | AM-10 | Trust fees booking on asset swap — dedicated asset swap fee booking service | M | P2 |
| RM-02 | AM-11 | Asset Swap Monitoring of coupons and charges on underlying bonds/securities | M | P2 |

---

### 8. REPORTING & ANALYTICS — 2 NOT_FOUND

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| RA-01 | RA-21 | Covered Transaction Reporting (CTR) | L | P0 |
| RA-02 | RA-22 | Escheats reporting and processing | L | P1 |

---

### 9. GENERAL REQUIREMENTS — 5 NOT_FOUND

| Gap ID | FR ID | Requirement | Size | Priority |
|--------|-------|-------------|------|----------|
| GR-01 | GR-76 | Migrate historical ADB (Average Daily Balance) | L | P2 |
| GR-02 | GR-82 | Migrate Employee Benefit Trust client, account, employee and employee registry details | L | P2 |
| GR-03 | RA-26 | Report writer facility equipped with nested calculation function | XL | P2 |
| GR-04 | GR-26 | Password protection for generated forms/notices/reports (e.g. Financial Statements) | M | P2 |
| GR-05 | GR-62 | Facility to set up password protection for generated forms/notices/reports to clients (Financial Statements) | M | P2 |

---

## B. PARTIAL — Significant Gaps Requiring Completion (Top 50)

These are the most impactful PARTIAL items where foundational code exists but key functionality is missing.

### High Priority (P0-P1)

| Gap ID | FR ID | Category | Requirement | What's Missing | Size |
|--------|-------|----------|-------------|----------------|------|
| P-01 | PSM-7 | PSM | Automated process timing (Monthly-5th, 10th, 15th, 20th, 30th, Bi-Monthly) | Day-of-month specific scheduling triggers; only generic frequencies (DAILY, WEEKLY, MONTHLY) supported | M |
| P-02 | PSM-16 | PSM | UITF NAVPU validation on holiday | Explicit holiday validation before NAV computation; relies on manual status management | M |
| P-03 | OM-4 | OM | Single or multiple contributions via bulk file upload with validations | Bulk CSV/Excel import endpoint and UI for contributions | M |
| P-04 | OM-12 | OM | Input order via single entry or bulk file upload | Bulk import dialog and endpoint for orders | M |
| P-05 | OM-19 | OM | Inter-account transactions (one-to-many, many-to-one, many-to-many) | Only 1-to-1 transfers implemented; many-to-many aggregation routes missing | L |
| P-06 | AFM-1 | AFM | Account creation with bulk/API batch entry methods | Bulk CSV/Excel import dialog; API batch endpoint for bulk account creation | M |
| P-07 | AFM-25 | AFM | Projected cash position (30 days forward with trust fees, maturities, coupon, dividend) | Forward projection engine with maturity/coupon/dividend forecasting | L |
| P-08 | AFM-36 | AFM | Cash flow projection (1 week, post-dated checks, restricted to Account Managers) | Post-dated check tracking; forward-looking cash projection | L |
| P-09 | OPS-15 | OPS | Settlement of investments (SWIFT MT103, MT202, RTGS, PB Transfer, BDO Transfer, check) | SWIFT message format generation not explicitly visible | L |
| P-10 | OPS-3 | OPS | Generate file for uploading to bank settlement accounts (debit/credit) | Bank upload format (SWIFT, etc.) service not visible | M |
| P-11 | OPS-6 | OPS | Generate debit/credit memos, tickets, advices for bank CASA Core System interface | Memo/ticket generation templates missing | M |
| P-12 | RA-9 | RA | Export reports in various formats (Excel/CSV/PDF) | Actual Excel/CSV/PDF export not implemented; only JSON download stubs | M |
| P-13 | RA-3 | RA | Year-end fiscal closing entries | Fiscal closing workflow not fully implemented | M |
| P-14 | RA-20 | RA | Generate Transaction Advice/Confirmation of Participation on every Admission/Redemption/Buy/Sell | Confirmation service exists but advice document generation is stub | M |
| P-15 | GR-91 | GR | Integrate with Bank system for real-time settlement (T-1) | Bank integration stub exists but T-1 settlement logic incomplete | L |

### Medium Priority (P2)

| Gap ID | FR ID | Category | Requirement | What's Missing | Size |
|--------|-------|----------|-------------|----------------|------|
| P-16 | AM-6 | AM | Securities interest resetting for declared holidays | Holiday-specific interest resetting not implemented in service | S |
| P-17 | AM-9 | AM | Asset Swap, FX conversion between portfolios | Asset swap mechanics not detailed in service layer | M |
| P-18 | AM-21 | AM | Location of all securities (GS-NBRS, Custodian Bank, PDTC) | No GS-NBRS/PDTC custodian lookup table | S |
| P-19 | AM-23 | AM | Prompt when interest resetting dates are due | No notification service for interest resetting dates | S |
| P-20 | AM-24 | AM | Additional interest computation for declared holidays | Holiday-specific interest computation not implemented | S |
| P-21 | CO-8 | CO | System assigns unique mnemonic code to clients | Clients use `client_id` text PK; no explicit mnemonic code field | S |
| P-22 | CO-10 | CO | Generate forms (Client information sheet, Proposal Letter) | No "Client Info Sheet" template; only proposals/invoices | M |
| P-23 | AFM-47 | AFM | Trust Fee Exceptions — exclusion of certain securities from calculation | No explicit security exclusion list in fee tables | S |
| P-24 | AFM-59 | AFM | TRB-based trust fee re-assessment with tiering (Total Relationship Balance) | TRB integration not mapped to fee tiering | M |
| P-25 | AFM-64 | AFM | Trust Fees Collection Report per period, per Account Officer, per Team, per Unit | Detailed breakdown by officer/team not found | M |
| P-26 | OM-14 | OM | Full or Partial redemption with participation disclosure statement generation | Participation disclosure statement generation missing | M |
| P-27 | OM-51 | OM | Daily distribution of transaction charges per broker (PDTC charges) | Broker charge service exists but daily batch logic not visible | M |
| P-28 | OM-65 | OM | Flag hold-out securities or stock dividend receivable (available for sale) | Hold-out flagging logic not explicitly coded | M |
| P-29 | OM-73 | OM | Flag/alert when selling security not in current holdings (short-selling) | Overselling prevention exists; explicit short-sell flag missing | S |
| P-30 | OPS-2 | OPS | SATT — Securities Account for Tax Tracking | Tax event table exists; dedicated SATT account structure not separate | M |
| P-31 | OPS-42 | OPS | Monitoring of disbursement of tax on retirement benefits | PERA withdrawal tax handled; disbursement monitoring report missing | M |
| P-32 | OPS-43 | OPS | Handling of tax exemptions, WE-BEN forms | Tax exemption flags exist; WE-BEN specific workflow missing | M |
| P-33 | OPS-49 | OPS | BIR Forms Module (Form 2307, Annual Income Tax Return) | 1601-FQ implemented; Form 2307 and AIR not separately detailed | L |
| P-34 | RA-7 | RA | Schedule/frequency of report sending (monthly/quarterly/upon request) | Scheduled delivery stubs exist but not fully wired | M |
| P-35 | RA-17 | RA | Customizable format of statement of account | Statement service exists; format customization not implemented | M |
| P-36 | RA-25 | RA | Anti Money Laundering Reporting via SAS AML (Daily AMLA files) | AMLA integration stub exists; actual file upload/download missing | L |
| P-37 | GR-7 | GR | Consolidation on Master Trust and Account Level | Trust account foundation exists; consolidation aggregations incomplete | M |
| P-38 | GR-11 | GR | Multi-entity setup (parent companies, subsidiaries, business units) | Business unit concept in schema; hierarchy incomplete | L |
| P-39 | GR-28 | GR | Auto-log out feature for idle time on the system | JWT 15min expiry exists; client-side idle logout incomplete | S |
| P-40 | GR-32 | GR | Masking of client and account names (only mnemonics visible) | Audit logger has PII redaction; UI-level masking incomplete | M |
| P-41 | GR-66-75 | GR | Data migration facilities (clients, accounts, holdings, UITF products, tax schemes, trust fees, documents, GL/SL) | Schema supports imports; comprehensive migration tooling/scripts incomplete | XL |
| P-42 | CH-6 | CH | Auto-logout on idle | JWT expiry exists; client-side inactivity detection incomplete | S |
| P-43 | CH-7 | CH | Concurrent login prevention | Session table exists; concurrent session check incomplete | M |
| P-44 | CH-10 | CH | PII data masking in email notifications | Audit logger redacts; notification-level masking incomplete | M |
| P-45 | CH-24 | CH | Client eligibility validation (age and nationality restrictions) | KYC service exists; eligibility rules engine incomplete | M |

---

## C. Document Management Gaps

| Gap ID | FR ID | Requirement | Status | Size |
|--------|-------|-------------|--------|------|
| DM-01 | DM-1 | Tag documents (submitted, unrecieved, deferred, returned); expiry date tracking; tag/status upload via manual/single/bulk with validations | PARTIAL | M |
| DM-02 | DM-2 | Printable/downloadable report of document status for selected accounts/portfolios/clients or outstanding documents | PARTIAL | M |
| DM-03 | DM-9 | Facility to track changes/notes/remarks and history of upload image of documents | PARTIAL | M |
| DM-04 | DM-10 | Monitoring alert/report on documents expiry date, submission dates, required/deficient documents | NOT_FOUND | M |
| DM-05 | DM-11 | Monitoring alert/report on the aging of document deficiencies | NOT_FOUND | M |

---

## D. Portfolio Modeling Gaps

| Gap ID | FR ID | Requirement | Status | What's Missing | Size |
|--------|-------|-------------|--------|----------------|------|
| PM-01 | AFM-65 | Portfolio simulation — effect on ROI, yield, duration (asset switch, trading gain/loss) for Discretionary and Directional accounts including UITFs | PARTIAL | Simulation engine exists; full ROI/yield/duration impact on UI incomplete | L |
| PM-02 | AFM-67 | Stress test modelling/scenarios | DONE | Stress test service implemented | — |
| PM-03 | AFM-68 | Constant mixed portfolio rebalancing (simulation only) | PARTIAL | Rebalancing service exists; simulation-only mode not clearly separated | M |
| PM-04 | AFM-73 | Can include stocks/held-away assets for consideration in rebalancing client requirements | PARTIAL | Held-away assets not integrated into rebalancing engine | M |
| PM-05 | AFM-74 | Create Trade Blotters after rebalancing and ability to adjust the trade blotters | PARTIAL | Rebalancing output exists; trade blotter generation/edit missing | M |
| PM-06 | AFM-77 | Validate investor-specific rules, audit and compliance measures; considerations in the rebalancing process | PARTIAL | Compliance check exists; investor-specific rule validation incomplete | M |

---

## Top 10 Priority Actions

| # | Action | Impact | Effort | Gaps Closed |
|---|--------|--------|--------|-------------|
| 1 | **Build Corporate Trust / Loan Management module** — loan master entity, lifecycle (purchase/sale/collection/prepayment/rollover), collateral tracking, MPC, amortization schedules | Closes 13 NOT_FOUND + 5 PARTIAL = 18 gaps in CT module | XL (30+ days) | CT-01 to CT-18 |
| 2 | **Build EBT (Employee Benefit Trust) module** — employee registry, gratuity rules, separation workflow, benefit types, plan rules, loan interfacing, tax structures | Closes 9 NOT_FOUND + 5 PARTIAL = 14 gaps in EBT module | XL (20+ days) | EBT-01 to EBT-14 |
| 3 | **Implement bulk import for orders/contributions/accounts** — CSV/Excel upload endpoints with validation, error reporting, and UI | Closes 4 PARTIAL gaps across Order/Account modules | L (5 days) | OM-01, P-03, P-04, P-06 |
| 4 | **Implement report export (Excel/CSV/PDF)** — actual file generation using ExcelJS/PDFKit or similar; download endpoints for all report types | Closes RA-9 and improves 10+ report-related PARTIAL gaps | L (5 days) | P-12, RA-* |
| 5 | **Implement Covered Transaction Reporting (CTR) and Escheats** — BSP AMLA compliance reporting; dormant account escheatment | Closes 2 NOT_FOUND P0/P1 regulatory gaps | L (5 days) | RA-01, RA-02 |
| 6 | **Implement account consolidation (Mother Accounts)** — portfolio grouping, consolidated reporting, collateral trustee linking | Closes 4 NOT_FOUND + 2 PARTIAL in AFM module | L (5 days) | AFM-04, P-37 |
| 7 | **Implement dormancy, hold-out, and auto-close features** — auto-dormancy detection, hold-out tagging/untagging, account closure/reopen workflow | Closes 4 NOT_FOUND + 2 PARTIAL | M (3 days) | AFM-07, AFM-08, AFM-09, AFM-10 |
| 8 | **Implement SWIFT message generation** — MT103/MT202/RTGS format generation for settlement instructions | Closes 3 PARTIAL in Operations | L (5 days) | P-09, P-10, P-11 |
| 9 | **Implement check printing and bank reconciliation** — check register, print queue, bank recon workflow | Closes 4 NOT_FOUND in Operations | L (5 days) | OPS-03 to OPS-06 |
| 10 | **Implement data migration toolkit** — bulk import scripts for clients, accounts, securities, holdings, GL balances, historical transactions | Closes 2 NOT_FOUND + 10 PARTIAL in GR | XL (10 days) | GR-01, GR-02, P-41 |

---

## Gap Sizing Summary

| Size | Count | Definition |
|------|-------|------------|
| XS | 0 | Config change or single-line fix |
| S | 12 | < 2 hours |
| M | 98 | 2 hours - 2 days |
| L | 47 | 2-5 days |
| XL | 8 | > 5 days |

**Estimated total effort to close all NOT_FOUND gaps: ~120 developer-days**
**Estimated total effort to complete all PARTIAL gaps: ~80 developer-days**

---

## Strengths (What TrustOMS Does Well)

The following modules have strong coverage (>75%):

1. **Client Onboarding (93.1%)** — Full prospect-to-client lifecycle, CRM integration, FATCA/CRS, sanctions screening, risk profiling, suitability assessment with maker-checker
2. **Risk Management (83.8%)** — VaR (Historical/Parametric/Monte Carlo), stress testing, duration analysis, ECL (IFRS 9), pre/post trade compliance, limit monitoring with hard/soft severity
3. **Order Management (80.2%)** — Full order lifecycle (DRAFT→SETTLED), GTC orders, block trading, pro-rata allocation, IPO allocation, waitlisting, confirmation matching
4. **Asset Management (78.1%)** — Securities master for all instrument types, corporate actions, FRPTI classifications, counterparty management, coupon calculation, broker fees
5. **PERA (77.8%)** — Account setup, contribution limits, monthly accrual, auto-notification, qualified/unqualified withdrawal, investment product handling
6. **Operations (70.5%)** — Settlement processing, cash ledger, GL/SL with FRPTI mapping, ECL engine, tax engine, FX revaluation, NAV computation, amortization

---

## Module-Specific Notes

### Modules Requiring Full Build (No Existing Code)

1. **Corporate Trust / Loan Management** — No loan entity, no loan lifecycle service, no collateral tracking, no MPC workflow. Requires entirely new schema tables + services + routes + UI pages.
2. **EBT / Employee Benefit Trust** — The trust product type enum includes `EMPLOYEE_BENEFIT` but no employee registry, gratuity engine, separation workflow, or benefit-type management exists.
3. **Check Printing & Bank Reconciliation** — No check register, check printing queue, or bank reconciliation workflow exists. Settlement handles electronic methods only.

### Modules Requiring Enhancement (Foundation Exists)

1. **Reporting & Analytics** — Report generator service and ad-hoc query engine exist, but actual file export (Excel/CSV/PDF), scheduled delivery, and many specific report types are stubs.
2. **Data Migration** — Schema supports bulk import patterns, but no migration scripts, reconciliation tools, or ETL workflows are implemented.
3. **Document Management** — Service request document service exists for file upload/download, but document expiry alerts, deficiency aging, and status tracking dashboards are incomplete.
4. **Account Consolidation** — Trust account hierarchy exists (primary→holding→security→settlement) but Mother Account grouping, collateral trustee linking, and consolidated reporting are missing.
