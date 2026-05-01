# BRD: Corporate Trust / Loan Management Module

**Version:** 1.1
**Date:** 2026-05-01
**Author:** TrustOMS Development Team
**Module:** Corporate Trust — Loan Administration & Management
**BDO RFI References:** PSM-70 through PSM-94, AFM-6, AFM-10, AFM-11, AFM-20, AFM-26
**Metrobank Gap References:** Loan facility agency, managed trust investments, life insurance trust, collateral/document safekeeping, external loan-system integration

---

## 1. Executive Summary

The Corporate Trust / Loan Management Module provides end-to-end loan lifecycle administration for BDO Trust Group's corporate trust business. This includes loan facility setup, drawdown/availment tracking, principal and interest collections, prepayments, rollovers, extensions, amortization schedule computation, collateral management, Mortgage Participation Certificate (MPC) issuance, receivable/payable monitoring, fee billing, document tracking, and a comprehensive monitoring dashboard.

**Business Context:** BDO Trust Group acts as trustee, collateral agent, or facility agent for syndicated loans, project finance, and corporate lending facilities. The system must support the trustee's responsibilities: collecting and distributing payments, monitoring collateral values, tracking loan terms, generating payment notices, and ensuring compliance with loan covenants.

---

## 2. Scope

### 2.1 In Scope

| Domain | Description |
|--------|-------------|
| Loan Master Entity | Full-attribute loan facility record with all terms |
| Loan Lifecycle | Create, approve, disburse, amend, mature, close |
| Payment Processing | Principal repayments, interest collections, prepayments |
| Amortization Engine | Multiple computation methods, schedule generation |
| Collateral Management | Collateral registry, valuations, sound-value monitoring |
| MPC Management | Issuance, cancellation, transfer of MPCs |
| Receivables/Payables | AR/AP monitoring for loan-related cash flows |
| Fee Billing | Corporate trust fees, computation, monitoring, billing |
| Document Tracking | Title safekeeping, securities agreements, covenants |
| Reporting | Payment schedules, outstanding loans, creditor letters |
| Dashboard | Real-time loan monitoring with alerts |

### 2.2 Out of Scope

- Direct bank settlement (SWIFT/RTGS) — handled by existing OPS settlement module
- GL posting details — handled by existing `gl-posting-engine.ts`
- Client onboarding — handled by existing CO module
- PERA/UITF specific workflows

### 2.3 Integration Points

| System | Direction | Description |
|--------|-----------|-------------|
| Trust Accounts | Read/Write | Loan facilities linked to trust accounts |
| Cash Ledger | Write | Post principal/interest payments |
| GL Engine | Write | Generate journal entries for loan events |
| Fee Engine | Read/Write | Compute and bill corporate trust fees |
| Tax Engine | Write | WHT on interest income |
| ECL Service | Read | IFRS 9 impairment staging for loan exposures |
| Accrual Engine | Read/Write | Interest accrual schedules |
| Document Service | Read/Write | Loan document storage/retrieval |
| Notification Service | Write | Payment due alerts, covenant breach warnings |

---

## 3. Data Model

### 3.1 New Enums

```
loanFacilityStatusEnum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'MATURED', 'DEFAULTED', 'RESTRUCTURED', 'CLOSED', 'CANCELLED']

loanTypeEnum: ['TERM_LOAN', 'REVOLVING_CREDIT', 'BRIDGE_LOAN', 'PROJECT_FINANCE', 'SYNDICATED_LOAN', 'BILATERAL_LOAN', 'MORTGAGE_LOAN', 'WORKING_CAPITAL']

interestTypeEnum: ['FIXED', 'FLOATING', 'HYBRID']

interestBasisEnum: ['ACT_360', 'ACT_365', 'ACT_ACT', '30_360', '30_365']

amortizationTypeEnum: ['EQUAL_AMORTIZATION', 'EQUAL_PRINCIPAL', 'BULLET', 'BALLOON', 'INCREASING', 'DECREASING', 'CUSTOM']

paymentFrequencyEnum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'AT_MATURITY', 'CUSTOM']

collateralTypeEnum: ['REAL_ESTATE', 'EQUIPMENT', 'INVENTORY', 'RECEIVABLES', 'SECURITIES', 'DEPOSIT', 'GUARANTEE', 'ASSIGNMENT_OF_PROCEEDS', 'OTHER']

mpcStatusEnum: ['ACTIVE', 'CANCELLED', 'TRANSFERRED', 'MATURED']

loanPaymentTypeEnum: ['PRINCIPAL', 'INTEREST', 'PRINCIPAL_AND_INTEREST', 'PREPAYMENT', 'PENALTY', 'FEE']

loanPaymentStatusEnum: ['SCHEDULED', 'DUE', 'OVERDUE', 'PAID', 'PARTIALLY_PAID', 'WAIVED', 'CANCELLED']

loanDocumentTypeEnum: ['LOAN_AGREEMENT', 'PROMISSORY_NOTE', 'MORTGAGE_DEED', 'COLLATERAL_ASSIGNMENT', 'TITLE_DEED', 'INSURANCE_POLICY', 'COVENANT_CERTIFICATE', 'AMENDMENT', 'WAIVER', 'SECURITY_AGREEMENT', 'GUARANTEE', 'OTHER']

availmentStatusEnum: ['REQUESTED', 'APPROVED', 'DISBURSED', 'REJECTED', 'CANCELLED']
```

### 3.2 New Tables

#### 3.2.1 `loan_facilities` — Master Entity (PSM-77)

The primary loan record containing all facility terms and attributes.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | PK | Internal auto-increment |
| facility_id | text | NOT NULL, UNIQUE | Business identifier (e.g., "LF-2026-0001") |
| trust_account_id | text | FK → trust_accounts | Parent trust account |
| client_id | text | FK → clients | Borrower/obligor |
| counterparty_id | integer | FK → counterparties | Lender/agent |
| facility_name | text | NOT NULL | Descriptive name |
| loan_type | loanTypeEnum | NOT NULL | Type of facility |
| loan_status | loanFacilityStatusEnum | NOT NULL | Current status |
| currency | text | NOT NULL | Facility currency (default: 'PHP') |
| facility_amount | numeric(21,4) | NOT NULL | Total approved amount |
| outstanding_principal | numeric(21,4) | NOT NULL | Current outstanding |
| available_amount | numeric(21,4) | NOT NULL | Remaining availability |
| disbursed_amount | numeric(21,4) | NOT NULL | Total disbursed |
| interest_type | interestTypeEnum | NOT NULL | Fixed/floating/hybrid |
| interest_rate | numeric(9,6) | NOT NULL | Current interest rate |
| spread | numeric(9,6) | | Spread over benchmark |
| benchmark_rate | text | | Reference rate (e.g., "BVAL-91D", "TBILL-364D") |
| interest_basis | interestBasisEnum | NOT NULL | Day count convention |
| amortization_type | amortizationTypeEnum | NOT NULL | Amortization method |
| payment_frequency | paymentFrequencyEnum | NOT NULL | Payment schedule |
| repricing_frequency | paymentFrequencyEnum | | Interest repricing schedule |
| origination_date | date | NOT NULL | Facility signing date |
| effective_date | date | NOT NULL | Effective/start date |
| maturity_date | date | NOT NULL | Final maturity |
| first_payment_date | date | | First payment due date |
| next_payment_date | date | | Next scheduled payment |
| next_repricing_date | date | | Next interest repricing |
| penalty_rate | numeric(9,6) | | Past-due penalty rate |
| pretermination_penalty_rate | numeric(9,6) | | Pretermination penalty |
| pretermination_penalty_type | text | | 'FLAT' or 'PERCENTAGE' |
| grace_period_days | integer | | Payment grace period |
| purpose | text | | Loan purpose description |
| security_description | text | | Collateral description |
| covenant_summary | text | | Key covenant summary |
| trustee_role | text | | 'TRUSTEE', 'COLLATERAL_AGENT', 'FACILITY_AGENT' |
| syndication_flag | boolean | default false | Syndicated loan indicator |
| number_of_participants | integer | | Number of syndicate members |
| maker_checker_status | text | | Authorization status |
| approved_by | integer | FK → users | Approver |
| approved_at | timestamp | | Approval timestamp |
| remarks | text | | Free-text remarks |
| ...auditFields | | | Standard audit columns |

**Indexes:** `facility_id` (unique), `trust_account_id`, `client_id`, `loan_status`, `maturity_date`

#### 3.2.2 `loan_participants` — Syndicate Members

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| facility_id | text | FK → loan_facilities.facility_id |
| counterparty_id | integer | FK → counterparties |
| participant_role | text | 'LEAD_ARRANGER', 'PARTICIPANT', 'AGENT' |
| commitment_amount | numeric(21,4) | Committed amount |
| share_percentage | numeric(9,6) | Pro-rata share |
| ...auditFields | | |

#### 3.2.3 `loan_availments` — Drawdowns/Availments (PSM-80)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| availment_id | text | Business ID (e.g., "AV-2026-0001") |
| facility_id | text | FK → loan_facilities.facility_id |
| availment_date | date | Drawdown date |
| amount | numeric(21,4) | Amount drawn |
| availment_status | availmentStatusEnum | Status |
| purpose | text | Availment purpose |
| approved_by | integer | FK → users |
| approved_at | timestamp | |
| remarks | text | |
| ...auditFields | | |

#### 3.2.4 `loan_payments` — Principal & Interest Payments (PSM-72, PSM-73)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| payment_id | text | Business ID (e.g., "LP-2026-0001") |
| facility_id | text | FK → loan_facilities.facility_id |
| payment_type | loanPaymentTypeEnum | PRINCIPAL, INTEREST, etc. |
| payment_status | loanPaymentStatusEnum | SCHEDULED, DUE, PAID, etc. |
| scheduled_date | date | Original due date |
| actual_date | date | Actual payment date |
| principal_amount | numeric(21,4) | Principal portion |
| interest_amount | numeric(21,4) | Interest portion |
| penalty_amount | numeric(21,4) | Penalty amount (if any) |
| total_amount | numeric(21,4) | Total payment |
| payment_reference | text | Check/wire reference |
| wht_amount | numeric(21,4) | Withholding tax deducted |
| net_amount | numeric(21,4) | Net after WHT |
| is_prepayment | boolean | Prepayment indicator |
| days_overdue | integer | Days past scheduled date |
| remarks | text | |
| ...auditFields | | |

**Indexes:** `facility_id`, `payment_status`, `scheduled_date`

#### 3.2.5 `loan_amortization_schedules` — Amortization (PSM-91, PSM-92)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| facility_id | text | FK → loan_facilities.facility_id |
| period_number | integer | Amortization period (1, 2, ...) |
| payment_date | date | Scheduled payment date |
| beginning_balance | numeric(21,4) | Balance at period start |
| principal_payment | numeric(21,4) | Principal due |
| interest_payment | numeric(21,4) | Interest due |
| total_payment | numeric(21,4) | Total due |
| ending_balance | numeric(21,4) | Balance at period end |
| interest_rate | numeric(9,6) | Rate for this period |
| cumulative_principal | numeric(21,4) | Cumulative principal paid |
| cumulative_interest | numeric(21,4) | Cumulative interest paid |
| payment_status | loanPaymentStatusEnum | Status of this installment |
| ...auditFields | | |

**Indexes:** `facility_id` + `period_number` (unique), `payment_date`

#### 3.2.6 `loan_collaterals` — Collateral Registry (PSM-79, PSM-86, PSM-87)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| collateral_id | text | Business ID (e.g., "COL-2026-0001") |
| facility_id | text | FK → loan_facilities.facility_id |
| collateral_type | collateralTypeEnum | Type of collateral |
| description | text | Detailed description |
| location | text | Physical location (vault, custodian) |
| title_reference | text | Title/deed number |
| appraised_value | numeric(21,4) | Latest appraised value |
| appraisal_date | date | Last appraisal date |
| market_value | numeric(21,4) | Current market value |
| forced_sale_value | numeric(21,4) | Forced sale/liquidation value |
| insurance_policy | text | Insurance policy number |
| insurance_expiry | date | Insurance expiry date |
| insurance_amount | numeric(21,4) | Insurance coverage amount |
| lien_position | integer | Lien priority (1st, 2nd) |
| ltv_ratio | numeric(9,6) | Loan-to-value ratio |
| next_revaluation_date | date | Next scheduled revaluation |
| revaluation_frequency | text | Revaluation frequency |
| custodian | text | Where title is held |
| remarks | text | |
| ...auditFields | | |

**Indexes:** `facility_id`, `collateral_type`, `next_revaluation_date`

#### 3.2.7 `loan_collateral_valuations` — Revaluation History (PSM-79)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| collateral_id | text | FK → loan_collaterals.collateral_id |
| valuation_date | date | Valuation date |
| appraised_value | numeric(21,4) | New appraised value |
| market_value | numeric(21,4) | New market value |
| forced_sale_value | numeric(21,4) | New FSV |
| appraiser | text | Appraiser/firm name |
| valuation_method | text | Method used |
| ltv_ratio | numeric(9,6) | Updated LTV |
| remarks | text | |
| ...auditFields | | |

#### 3.2.8 `loan_documents` — Document Tracking (PSM-86, PSM-90)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| document_id | text | Business ID |
| facility_id | text | FK → loan_facilities.facility_id |
| document_type | loanDocumentTypeEnum | Type of document |
| document_name | text | Display name |
| file_reference | text | Storage path/key |
| file_size_bytes | integer | File size |
| mime_type | text | MIME type |
| expiry_date | date | Document expiry (if any) |
| custodian_location | text | Physical storage location |
| vault_reference | text | Vault/safe deposit ref |
| received_date | date | Date received |
| return_date | date | Date returned (if applicable) |
| is_original | boolean | Original vs copy |
| remarks | text | |
| ...auditFields | | |

#### 3.2.9 `mpcs` — Mortgage Participation Certificates (PSM-78)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| mpc_id | text | Business ID (e.g., "MPC-2026-0001") |
| facility_id | text | FK → loan_facilities.facility_id |
| certificate_number | text | Certificate serial number |
| holder_client_id | text | FK → clients |
| face_value | numeric(21,4) | MPC face value |
| issue_date | date | Issuance date |
| maturity_date | date | Maturity date |
| interest_rate | numeric(9,6) | Certificate rate |
| mpc_status | mpcStatusEnum | ACTIVE, CANCELLED, etc. |
| cancellation_date | date | Cancellation date (if any) |
| cancellation_reason | text | |
| transfer_date | date | Transfer date (if transferred) |
| transferred_to | text | New holder client_id |
| participation_percentage | numeric(9,6) | % of total facility |
| remarks | text | |
| ...auditFields | | |

#### 3.2.10 `loan_interest_accruals` — Interest Accrual Records (PSM-74)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| facility_id | text | FK → loan_facilities.facility_id |
| accrual_date | date | Accrual date |
| opening_balance | numeric(21,4) | Opening principal |
| interest_rate | numeric(9,6) | Rate used |
| day_count_numerator | integer | Days in period |
| day_count_denominator | integer | Day count basis |
| accrued_amount | numeric(21,4) | Accrued interest |
| cumulative_accrued | numeric(21,4) | Cumulative accrued |
| gl_posted | boolean | GL posting flag |
| gl_batch_id | integer | FK → gl_journal_batches |
| ...auditFields | | |

#### 3.2.11 `loan_receivables` — Receivable/Payable Monitoring (PSM-82)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| facility_id | text | FK → loan_facilities.facility_id |
| receivable_type | text | 'PRINCIPAL', 'INTEREST', 'FEE', 'PENALTY', 'INSURANCE', 'TAX' |
| dr_cr | text | 'DR' (receivable) or 'CR' (payable) |
| due_date | date | Due date |
| amount | numeric(21,4) | Amount due |
| paid_amount | numeric(21,4) | Amount collected |
| balance | numeric(21,4) | Outstanding balance |
| aging_bucket | text | 'CURRENT', '1-30', '31-60', '61-90', '90+' |
| counterparty_id | integer | FK → counterparties |
| payment_id | integer | FK → loan_payments (if settled) |
| ...auditFields | | |

#### 3.2.12 `loan_amendments` — Term Amendments (PSM-75)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| amendment_id | text | Business ID |
| facility_id | text | FK → loan_facilities.facility_id |
| amendment_date | date | Effective date |
| amendment_type | text | 'RATE_CHANGE', 'MATURITY_EXTENSION', 'AMOUNT_INCREASE', 'COVENANT_WAIVER', 'RESTRUCTURE', 'OTHER' |
| field_changed | text | Which field was amended |
| old_value | text | Previous value |
| new_value | text | New value |
| reason | text | Reason for amendment |
| approved_by | integer | FK → users |
| approved_at | timestamp | |
| ...auditFields | | |

#### 3.2.13 `loan_tax_insurance` — Tax & Insurance Payments (PSM-83)

| Column | Type | Description |
|--------|------|-------------|
| id | serial | PK |
| facility_id | text | FK → loan_facilities.facility_id |
| payment_type | text | 'DST', 'WHT', 'REAL_PROPERTY_TAX', 'FIRE_INSURANCE', 'MORTGAGE_INSURANCE', 'OTHER' |
| due_date | date | Due date |
| amount | numeric(21,4) | Amount |
| paid_date | date | Actual payment date |
| paid_amount | numeric(21,4) | Amount paid |
| reference | text | Tax receipt / policy ref |
| remarks | text | |
| ...auditFields | | |

---

## 4. Functional Requirements

### FR-LF-001: Loan Facility Master Entity (PSM-77)

**User Story:** As a Trust Officer, I want to create and maintain a complete loan facility record with all financial terms and attributes so that I have a single source of truth for each corporate trust loan.

**Acceptance Criteria:**
- AC-001: Can create a new loan facility with all fields in §3.2.1
- AC-002: Facility ID auto-generated in format "LF-YYYY-NNNN"
- AC-003: Can edit facility in DRAFT or PENDING_APPROVAL status only
- AC-004: Can view full facility details including related entities (payments, collateral, MPCs)
- AC-005: Search/filter by status, client, loan type, maturity date range
- AC-006: Maker-checker workflow: create → PENDING_APPROVAL → APPROVED → ACTIVE

**Business Rules:**
- BR-001: `outstanding_principal` must always equal `disbursed_amount` minus sum of principal payments
- BR-002: `available_amount` must equal `facility_amount` minus `disbursed_amount` for revolving facilities
- BR-003: `maturity_date` must be after `effective_date`
- BR-004: Cannot delete a facility that has any payments or active MPCs

### FR-LF-002: Purchase and Sale of Loans (PSM-70)

**User Story:** As a Trust Officer, I want to record the purchase and sale of loan participations by investors so that I can track ownership and distribute payments pro-rata.

**Acceptance Criteria:**
- AC-007: Record loan purchase with buyer, amount, price, settlement date
- AC-008: Record loan sale with seller, amount, price, settlement date
- AC-009: Update participant share percentages upon trade settlement
- AC-010: Generate trade confirmation for buyer/seller

**Business Rules:**
- BR-005: Total participant shares must not exceed 100% of facility amount
- BR-006: Sale amount cannot exceed seller's current participation

### FR-LF-003: Loan Contribution/Withdrawal — Free of Payment (PSM-71)

**User Story:** As a Trust Officer, I want to process receive-free and deliver-free loan transfers so that I can handle non-cash movements of loan positions.

**Acceptance Criteria:**
- AC-011: Process receive-free (incoming loan position without cash)
- AC-012: Process deliver-free (outgoing loan position without cash)
- AC-013: Update outstanding positions and participant records
- AC-014: Maker-checker approval required

### FR-LF-004: Collection of Principal & Interest (PSM-72)

**User Story:** As a Trust Officer, I want to collect and distribute principal and interest repayments so that payments are properly allocated to participants.

**Acceptance Criteria:**
- AC-015: Record incoming principal payment against facility
- AC-016: Record incoming interest payment against facility
- AC-017: Auto-calculate WHT deduction on interest
- AC-018: Distribute collected amounts pro-rata to participants
- AC-019: Post entries to cash ledger and GL
- AC-020: Update outstanding principal balance
- AC-021: Mark corresponding amortization schedule entry as PAID

**Business Rules:**
- BR-007: Interest calculation uses the facility's day count convention
- BR-008: WHT rate defaults from system config (currently 20% for PH)

### FR-LF-005: Prepayments, Rollovers, Extensions (PSM-73)

**User Story:** As a Trust Officer, I want to process prepayments, rollovers, and maturity extensions so that I can handle non-standard payment events.

**Acceptance Criteria:**
- AC-022: Process full or partial prepayment with pretermination penalty calculation
- AC-023: Regenerate amortization schedule after partial prepayment
- AC-024: Process rollover (extend maturity with new terms)
- AC-025: Record maturity extension amendment
- AC-026: Calculate pretermination penalty per facility terms (PSM-94)

**Business Rules:**
- BR-009: Prepayment penalty = outstanding × pretermination_penalty_rate × remaining_tenor / 360 (or as defined)
- BR-010: Rollover creates a new amendment record and updates maturity_date

### FR-LF-006: Interest Accruals (PSM-74)

**User Story:** As a Trust Officer, I want the system to compute daily interest accruals so that I can accurately track accrued interest at any point.

**Acceptance Criteria:**
- AC-027: Daily accrual computation using correct day count convention
- AC-028: Support for ACT/360, ACT/365, ACT/ACT, 30/360, 30/365
- AC-029: Accrual reversal on payment date
- AC-030: GL posting of accrued interest (DR: Accrued Interest, CR: Interest Income)
- AC-031: Month-end accrual batch processing

**Business Rules:**
- BR-011: Daily accrual = outstanding_principal × annual_rate × (1 / day_count_denominator)
- BR-012: Accrual must stop on maturity date or default date

### FR-LF-007: Amendments to Loan Terms (PSM-75)

**User Story:** As a Trust Officer, I want to record amendments to loan terms so that changes are tracked with full audit trail.

**Acceptance Criteria:**
- AC-032: Amend interest rate (fixed rate change or spread change)
- AC-033: Amend maturity date (extension)
- AC-034: Amend facility amount (increase/decrease)
- AC-035: Record covenant waiver
- AC-036: Amendment requires maker-checker approval
- AC-037: All amendments logged with old_value, new_value, reason

### FR-LF-008: Outstanding Loans Dashboard (PSM-76)

**User Story:** As a Trust Officer/Manager, I want a dashboard showing all outstanding loans with key metrics so that I can monitor the portfolio at a glance.

**Acceptance Criteria:**
- AC-038: Summary cards: total facilities, total outstanding, total available, total overdue
- AC-039: Filterable table of all active loans with key columns
- AC-040: Color-coded status badges (ACTIVE=green, MATURED=blue, DEFAULTED=red)
- AC-041: Drill-down to loan detail from dashboard
- AC-042: Charts: outstanding by loan type, maturity profile, interest rate distribution
- AC-043: Overdue payments alert panel
- AC-044: Upcoming payments in next 10-15 days (PSM-81)

### FR-LF-009: MPC Issuance and Cancellation (PSM-78)

**User Story:** As a Trust Officer, I want to issue and cancel Mortgage Participation Certificates so that investor participations are properly documented.

**Acceptance Criteria:**
- AC-045: Issue MPC with certificate number, holder, face value, rate, dates
- AC-046: Auto-generate unique certificate number
- AC-047: Cancel MPC with reason
- AC-048: Transfer MPC to new holder
- AC-049: View all MPCs for a facility with status
- AC-050: MPC total face value cannot exceed facility amount

**Business Rules:**
- BR-013: Certificate number format: "MPC-YYYY-NNNNNN" (sequential)
- BR-014: Cannot cancel MPC if there are pending interest distributions
- BR-015: Transfer creates audit trail with old/new holder

### FR-LF-010: Collateral Management & Revaluation (PSM-79, PSM-86, PSM-87)

**User Story:** As a Trust Officer, I want to manage loan collaterals, track their values, and monitor LTV ratios so that the security of loans is maintained.

**Acceptance Criteria:**
- AC-051: Register collateral with type, description, values, custodian location
- AC-052: Record title deed safekeeping location (vault, safe deposit box)
- AC-053: Perform collateral revaluation with new appraised/market values
- AC-054: Track revaluation history
- AC-055: Auto-compute LTV ratio (outstanding_principal / appraised_value)
- AC-056: Alert when LTV exceeds threshold (configurable, default 80%)
- AC-057: Track insurance policy expiry and alert before expiry (30 days)
- AC-058: Monitor sound value across all collaterals for a facility

**Business Rules:**
- BR-016: LTV threshold alert is configurable per facility or globally via system_config
- BR-017: Insurance must be maintained for the full loan term
- BR-018: Revaluation frequency must be enforced (annual minimum for real estate)

### FR-LF-011: Loan Availability & Availments (PSM-80)

**User Story:** As a Trust Officer, I want to track loan availability and process drawdowns so that I can manage revolving credit facilities.

**Acceptance Criteria:**
- AC-059: View current availability (facility_amount - disbursed + principal_repaid for revolving)
- AC-060: Process availment/drawdown request
- AC-061: Maker-checker approval for availments
- AC-062: Update outstanding and available balances upon disbursement
- AC-063: Track all availments with dates and amounts
- AC-064: Block availment if facility is not ACTIVE or fully drawn

### FR-LF-012: Payment Schedule Reports (PSM-81, PSM-85)

**User Story:** As a Trust Officer, I want to generate reports on upcoming principal and interest payments 10-15 days before payment date so that I can send timely collection notices.

**Acceptance Criteria:**
- AC-065: Generate upcoming payments report (configurable look-ahead: 10, 15, 30 days)
- AC-066: Include facility details, borrower, amount due, type (P, I, P+I)
- AC-067: System notification/alert for approaching payment dates
- AC-068: Prompt schedule showing all interest payment dates for a facility

**Business Rules:**
- BR-019: Alert generated at 15 days and again at 10 days before due date
- BR-020: Include past-due payments highlighted in overdue report

### FR-LF-013: Receivables & Payables Monitoring (PSM-82)

**User Story:** As a Trust Officer, I want to monitor all loan-related receivables and payables so that I can track collections and disbursements.

**Acceptance Criteria:**
- AC-069: View all outstanding receivables grouped by facility
- AC-070: View all outstanding payables grouped by facility
- AC-071: Aging analysis: current, 1-30, 31-60, 61-90, 90+ days
- AC-072: Summary totals by aging bucket
- AC-073: Drill-down to individual receivable/payable

### FR-LF-014: Tax & Insurance Payments (PSM-83)

**User Story:** As a Trust Officer, I want to track and process applicable taxes and insurance payments on loans.

**Acceptance Criteria:**
- AC-074: Record DST, WHT, real property tax, insurance payments
- AC-075: Track due dates and payment status
- AC-076: Alert when insurance or tax payment is due (30 days before)
- AC-077: Generate tax payment schedule for a facility

### FR-LF-015: Corporate Trust Fee Billing (PSM-88)

**User Story:** As a Trust Officer, I want to compute, monitor, and generate billing letters for corporate trust fees.

**Acceptance Criteria:**
- AC-078: Configure fee schedule per facility (percentage-based or fixed)
- AC-079: Auto-compute periodic trust fees based on outstanding principal
- AC-080: Generate billing letter/invoice for corporate trust fees
- AC-081: Track fee payment status (billed, paid, overdue)
- AC-082: Integration with existing TrustFees Pro module

### FR-LF-016: Reports and Letters to Creditors (PSM-89)

**User Story:** As a Trust Officer, I want to generate standard reports and notification letters to creditors/participants.

**Acceptance Criteria:**
- AC-083: Generate payment distribution notice to participants
- AC-084: Generate outstanding balance certificate
- AC-085: Generate interest rate reset notice
- AC-086: Generate covenant compliance certificate
- AC-087: All letters use configurable templates

### FR-LF-017: Document Tracking (PSM-90)

**User Story:** As a Trust Officer, I want to track all corporate trust documents with their physical and digital locations.

**Acceptance Criteria:**
- AC-088: Register document with type, dates, physical location
- AC-089: Upload digital copy
- AC-090: Track original vs copy status
- AC-091: Alert when document is expiring (insurance, permits)
- AC-092: Checklist view of required documents per facility

### FR-LF-018: Amortization Schedule Computation (PSM-91)

**User Story:** As a Trust Officer, I want the system to compute amortization schedules using different methods so that I can accommodate various loan structures.

**Acceptance Criteria:**
- AC-093: Equal amortization (equal total payment — French)
- AC-094: Equal principal (declining payment — constant principal)
- AC-095: Bullet payment (interest only, principal at maturity)
- AC-096: Balloon payment (partial amortization, lump sum at end)
- AC-097: Increasing amortization (graduated payments)
- AC-098: Decreasing amortization
- AC-099: Custom schedule (manually input each period)
- AC-100: Print/export amortization schedule (PDF, Excel)
- AC-101: Regenerate schedule after amendment or prepayment

**Business Rules:**
- BR-021: Equal amortization: PMT = P × [r(1+r)^n] / [(1+r)^n - 1]
- BR-022: Equal principal: principal = P/n, interest = outstanding × rate × period
- BR-023: Schedule must balance (sum of principal payments = facility amount)

### FR-LF-019: Different Payment & Repricing Schedules (PSM-92)

**User Story:** As a Trust Officer, I want to support different principal payment and interest repricing schedules with alerts.

**Acceptance Criteria:**
- AC-102: Set separate frequencies for principal and interest payments
- AC-103: Set repricing dates independent of payment dates
- AC-104: System alerts for upcoming repricing dates (7 days before)
- AC-105: Record repricing result (old rate → new rate, spread adjustment)

### FR-LF-020: Interest Penalty Computation (PSM-93)

**User Story:** As a Trust Officer, I want the system to compute interest penalties for past-due loans.

**Acceptance Criteria:**
- AC-106: Auto-compute penalty interest on overdue principal
- AC-107: Penalty rate configurable per facility
- AC-108: Penalty accrues daily on overdue amount
- AC-109: Include penalty in payment demand/collection notice
- AC-110: Stop penalty accrual on payment or write-off

**Business Rules:**
- BR-024: Penalty interest = overdue_amount × penalty_rate × overdue_days / 360

### FR-LF-021: Pretermination Penalty (PSM-94)

**User Story:** As a Trust Officer, I want the system to compute pretermination penalties for early loan payoff.

**Acceptance Criteria:**
- AC-111: Compute pretermination fee based on facility terms
- AC-112: Support flat fee or percentage-based penalty
- AC-113: Factor remaining tenor into computation
- AC-114: Display breakdown in prepayment confirmation dialog

---

## 5. Non-Functional Requirements

### NFR-001: Performance
- Dashboard loads within 2 seconds for up to 10,000 active loans
- Amortization schedule computation completes within 1 second for 360 periods
- Batch accrual processing handles 10,000 facilities within 5 minutes

### NFR-002: Security
- All endpoints require `requireBackOfficeRole()` authentication
- Maker-checker workflow for facility creation, amendments, and payments
- Full audit trail on all loan record changes
- `safeErrorMessage()` pattern on all error responses

### NFR-003: Data Integrity
- `outstanding_principal` must always reconcile with payment history
- Amortization schedule must balance (sum of principal = facility amount)
- Collateral LTV computation must use latest valuation

### NFR-004: Accessibility
- All UI pages support keyboard navigation
- ARIA labels on interactive elements
- Responsive layout for back-office desktop use

---

## 6. API Endpoints

### 6.1 Loan Facilities
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans | List facilities (filtered, paginated) |
| GET | /api/v1/loans/:facilityId | Get facility detail |
| POST | /api/v1/loans | Create facility |
| PATCH | /api/v1/loans/:facilityId | Update facility |
| POST | /api/v1/loans/:facilityId/approve | Approve facility |
| POST | /api/v1/loans/:facilityId/activate | Activate (post-approval) |
| GET | /api/v1/loans/:facilityId/participants | List participants |
| POST | /api/v1/loans/:facilityId/participants | Add participant |

### 6.2 Payments
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/:facilityId/payments | List payments |
| POST | /api/v1/loans/:facilityId/payments | Record payment |
| POST | /api/v1/loans/:facilityId/prepay | Process prepayment |

### 6.3 Availments
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/:facilityId/availments | List availments |
| POST | /api/v1/loans/:facilityId/availments | Process drawdown |
| POST | /api/v1/loans/:facilityId/availments/:id/approve | Approve availment |

### 6.4 Amortization
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/:facilityId/amortization | Get schedule |
| POST | /api/v1/loans/:facilityId/amortization/generate | Generate/regenerate |

### 6.5 Collaterals
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/:facilityId/collaterals | List collaterals |
| POST | /api/v1/loans/:facilityId/collaterals | Register collateral |
| PATCH | /api/v1/loans/:facilityId/collaterals/:id | Update collateral |
| POST | /api/v1/loans/:facilityId/collaterals/:id/revalue | Record revaluation |
| GET | /api/v1/loans/:facilityId/collaterals/:id/valuations | Valuation history |

### 6.6 MPCs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/:facilityId/mpcs | List MPCs |
| POST | /api/v1/loans/:facilityId/mpcs | Issue MPC |
| POST | /api/v1/loans/:facilityId/mpcs/:id/cancel | Cancel MPC |
| POST | /api/v1/loans/:facilityId/mpcs/:id/transfer | Transfer MPC |

### 6.7 Amendments
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/:facilityId/amendments | List amendments |
| POST | /api/v1/loans/:facilityId/amendments | Record amendment |

### 6.8 Documents
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/:facilityId/documents | List documents |
| POST | /api/v1/loans/:facilityId/documents | Upload document |
| GET | /api/v1/loans/:facilityId/documents/:id/download | Download document |

### 6.9 Receivables
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/receivables | List all receivables |
| GET | /api/v1/loans/receivables/aging | Aging analysis |

### 6.10 Dashboard & Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/loans/dashboard/summary | Dashboard metrics |
| GET | /api/v1/loans/dashboard/upcoming-payments | Upcoming payments (10-15 days) |
| GET | /api/v1/loans/dashboard/overdue | Overdue payments |
| GET | /api/v1/loans/reports/payment-schedule | Payment schedule report |
| GET | /api/v1/loans/reports/outstanding | Outstanding loans report |

---

## 7. UI Pages

### 7.1 Loan Dashboard (`loan-dashboard.tsx`)
- Summary cards (total facilities, outstanding, available, overdue)
- Filterable/sortable data table of all loans
- Charts: by type, maturity profile, rate distribution
- Alert panels: overdue, upcoming payments, expiring insurance
- Quick actions: create new facility, search

### 7.2 Loan Detail (`loan-detail.tsx`)
- Facility header with key terms and status badge
- Tabbed sections: Overview, Payments, Amortization, Collateral, MPCs, Documents, Amendments, Receivables
- Action buttons: Approve, Activate, Amend, Record Payment, Add Collateral
- Timeline of key events

### 7.3 Collateral Management (`loan-collateral.tsx`)
- Collateral registry table
- Revaluation dialog
- LTV monitoring with threshold alerts
- Insurance tracking panel

### 7.4 MPC Management (`loan-mpc.tsx`)
- MPC issuance form
- Active MPCs table
- Cancel/Transfer dialogs
- Certificate print preview

### 7.5 Amortization Schedule Viewer (`loan-amortization.tsx`)
- Schedule table with period details
- Chart: principal vs interest over time
- Generate/regenerate dialog with amortization type selector
- Export to PDF/Excel

---

## 8. Blue Ocean Enhancements

These are value-added features beyond the BDO RFI requirements:

### BOE-001: Loan Covenant Tracking
- Define covenants per facility (financial ratios, conditions)
- Record periodic covenant compliance test results
- Alert dashboard for upcoming covenant testing dates
- Auto-flag breach when test fails

### BOE-002: Loan Portfolio Analytics
- Concentration analysis by borrower, industry, collateral type
- Weighted average interest rate and tenor
- Maturity ladder chart
- NPL (Non-Performing Loan) ratio tracking

### BOE-003: Automated Payment Matching
- Auto-match incoming bank credits to expected loan payments
- Suggest allocation based on amount and reference matching
- Reduce manual reconciliation effort

### BOE-004: Participant Payment Distribution Engine
- Auto-compute pro-rata distribution to syndicate participants
- Generate distribution waterfall showing priority of payments
- Settlement advice generation for each participant

### BOE-005: Platform Intelligence Integration
- AI-powered loan risk scoring based on payment history
- Predictive default probability using payment patterns
- Smart alerts for deteriorating loan quality

---

## 9. Sample Data

### 9.1 Loan Facilities

```json
[
  {
    "facility_id": "LF-2026-0001",
    "facility_name": "SM Prime Holdings Term Loan",
    "client_id": "CLI-001",
    "loan_type": "TERM_LOAN",
    "loan_status": "ACTIVE",
    "currency": "PHP",
    "facility_amount": "5000000000.0000",
    "outstanding_principal": "3750000000.0000",
    "interest_rate": "6.500000",
    "interest_type": "FIXED",
    "interest_basis": "ACT_360",
    "amortization_type": "EQUAL_AMORTIZATION",
    "payment_frequency": "QUARTERLY",
    "effective_date": "2025-01-15",
    "maturity_date": "2030-01-15",
    "trustee_role": "TRUSTEE"
  },
  {
    "facility_id": "LF-2026-0002",
    "facility_name": "Ayala Land Revolving Credit",
    "client_id": "CLI-002",
    "loan_type": "REVOLVING_CREDIT",
    "loan_status": "ACTIVE",
    "currency": "PHP",
    "facility_amount": "2000000000.0000",
    "outstanding_principal": "800000000.0000",
    "available_amount": "1200000000.0000",
    "interest_rate": "5.750000",
    "interest_type": "FLOATING",
    "benchmark_rate": "BVAL-91D",
    "spread": "1.500000",
    "interest_basis": "ACT_365",
    "amortization_type": "BULLET",
    "payment_frequency": "MONTHLY",
    "effective_date": "2025-06-01",
    "maturity_date": "2028-06-01",
    "trustee_role": "FACILITY_AGENT"
  },
  {
    "facility_id": "LF-2026-0003",
    "facility_name": "DMCI Project Finance",
    "client_id": "CLI-003",
    "loan_type": "PROJECT_FINANCE",
    "loan_status": "ACTIVE",
    "currency": "PHP",
    "facility_amount": "10000000000.0000",
    "outstanding_principal": "9500000000.0000",
    "interest_rate": "7.250000",
    "interest_type": "FIXED",
    "interest_basis": "30_360",
    "amortization_type": "EQUAL_PRINCIPAL",
    "payment_frequency": "SEMI_ANNUAL",
    "effective_date": "2024-03-01",
    "maturity_date": "2034-03-01",
    "syndication_flag": true,
    "number_of_participants": 5,
    "trustee_role": "COLLATERAL_AGENT"
  }
]
```

### 9.2 Amortization Schedule (sample for LF-2026-0001)

| Period | Payment Date | Beginning Bal | Principal | Interest | Total | Ending Bal |
|--------|-------------|---------------|-----------|----------|-------|------------|
| 1 | 2025-04-15 | 5,000,000,000 | 250,000,000 | 81,250,000 | 331,250,000 | 4,750,000,000 |
| 2 | 2025-07-15 | 4,750,000,000 | 250,000,000 | 77,187,500 | 327,187,500 | 4,500,000,000 |
| ... | ... | ... | ... | ... | ... | ... |

---

## 10. Metrobank and BDO Gap Expansion

This section extends the corporate trust BRD with the BDO and Metrobank gap findings that sit specifically inside corporate trust, loan agency, collateral agency, managed trust investment, and life insurance trust operations. These requirements complement the enterprise addendum in `docs/TrustOMS-Philippines-BRD-Metrobank-BDO-Enhancement-Addendum.md`.

### FR-LF-024: External Loan-System and Bank Interface Integration

**User Story:** As a Corporate Trust Operations Officer, I want corporate trust loan events to integrate with bank settlement, GL, document, and external loan systems so that loan agency records remain reconciled with enterprise books and source systems.

**Acceptance Criteria:**
- AC-111: Loan facility, availment, repayment, prepayment, rollover, extension, amendment, and closure events publish interface-ready messages with facility ID, counterparty, amount, currency, value date, product, and accounting references.
- AC-112: Incoming external loan-system updates can be staged, validated, approved, rejected, and reconciled before updating the corporate trust record.
- AC-113: Settlement events can generate bank payment files or API instructions and consume bank acknowledgements, rejects, returns, and status updates.
- AC-114: GL postings carry trustor/trustee book, product, facility, participant, and accounting-period dimensions.
- AC-115: Interface failures create exception records with owner, retry policy, resolution status, and audit trail.

**Business Rules:**
- BR-035: External updates cannot overwrite approved corporate trust terms without an amendment workflow.
- BR-036: Settlement success cannot be inferred from file generation; bank acknowledgement or reconciliation evidence is required.
- BR-037: Interface replay must be idempotent using facility ID, event ID, and source reference.

### FR-LF-025: Managed Trust Investment Product Variant

**User Story:** As a Trust Product Officer, I want managed trust investments to be supported as a corporate fiduciary product variant so that mandates, investment restrictions, income distribution, fee rules, and reporting are administered consistently.

**Acceptance Criteria:**
- AC-116: MTI setup captures trustor, investment mandate, permitted assets, prohibited assets, income distribution rule, fee schedule, valuation rule, reporting calendar, and termination conditions.
- AC-117: MTI transactions validate against mandate restrictions before approval.
- AC-118: Income, expense, fee, valuation, and accounting events are allocated to the MTI account with audit traceability.
- AC-119: MTI statements and trustee reports show holdings, cash, income, fees, realized/unrealized gains, restrictions, and pending exceptions.
- AC-120: MTI termination validates pending transactions, unsettled cash, open documents, unpaid fees, and required approvals.

**Business Rules:**
- BR-038: MTI mandate breaches follow the same hard/soft override taxonomy as investment mandates in the parent BRD.
- BR-039: MTI fee calculation must use the product-specific fee schedule, not generic account fees, unless explicitly configured.
- BR-040: Historical MTI reports must remain reproducible after mandate or fee-schedule changes.

### FR-LF-026: Life Insurance Trust Administration

**User Story:** As a Trust Administrator, I want life insurance trust records and events to be administered in the system so that policy assets, beneficiaries, premiums, claims, and distributions are controlled under fiduciary rules.

**Acceptance Criteria:**
- AC-121: Life insurance trust setup captures policy owner, insured person, beneficiaries, insurer, policy number, cash value, death benefit, premium schedule, premium funding account, and claim-document checklist.
- AC-122: The system generates alerts for premium due dates, grace-period expiry, policy lapse risk, beneficiary review, and claim follow-up.
- AC-123: Premium payments validate available cash, account restrictions, settlement account status, and approval requirements before release.
- AC-124: Claim proceeds are receipted, reconciled, allocated, and distributed only after required claim documents and approvals are complete.
- AC-125: Beneficiary amendments preserve prior versions, supporting documents, effective dates, and approval evidence.

**Business Rules:**
- BR-041: Beneficiary changes require maker-checker approval and cannot be backdated before supporting evidence date.
- BR-042: Premium payments blocked by cash or restriction failures must remain pending and escalated before grace-period expiry.
- BR-043: Claim proceeds cannot be distributed while legal, tax, or document exceptions remain unresolved.

### FR-LF-027: Loan Document Safekeeping and Release Control

**User Story:** As a Custody and Documents Officer, I want title deeds, loan agreements, certificates, and collateral documents to be tracked through safekeeping and release so that physical and electronic fiduciary documents are controlled.

**Acceptance Criteria:**
- AC-126: Each loan document records document type, original/copy flag, vault or custodian location, received date, expiry date, release status, linked facility/collateral, and DMS reference.
- AC-127: Title deeds, security agreements, guarantees, insurance policies, MPCs, and covenant certificates have mandatory checklist rules by facility type.
- AC-128: Original release requires request, reason, recipient, approval, release date, expected return date, and return confirmation.
- AC-129: Aging reports show missing, expiring, expired, released-not-returned, and rejected documents.
- AC-130: Document release or waiver actions are included in the facility audit trail and dashboard exceptions.

**Business Rules:**
- BR-044: Collateral release is blocked if required original documents are missing or not approved for release.
- BR-045: Released-not-returned documents past expected return date must trigger escalation.
- BR-046: Document waivers require expiry date unless marked permanent by authorized legal approval.

### FR-LF-028: Payment Notice, Creditor Letter, and Investor Communication Pack

**User Story:** As a Corporate Trust Officer, I want creditor, lender, borrower, and investor communications to be generated from approved facility data so that stakeholders receive consistent notices before payment and event dates.

**Acceptance Criteria:**
- AC-131: The system generates notices for principal due, interest due, prepayment, rollover, extension, amendment, covenant breach, collateral exception, MPC event, and maturity.
- AC-132: Payment notices can be scheduled 10 to 15 days before payment date and regenerated after approved amendments.
- AC-133: Letter templates pull approved facility, participant, payment, tax, settlement, and contact data.
- AC-134: Dispatch status captures generated, reviewed, approved, sent, failed, resent, and acknowledged states.
- AC-135: Users can export communication packs to PDF and Word and dispatch through approved email or secure file channels.

**Business Rules:**
- BR-047: Notices generated from draft or unapproved facility data must be watermarked preliminary and cannot be externally dispatched.
- BR-048: Recipient lists must follow participant ownership, creditor role, borrower role, and contact authorization rules.
- BR-049: Failed dispatches remain open exceptions until resent, cancelled, or manually acknowledged.

## 11. Acceptance Test Scenarios

| Scenario | Expected Outcome |
|----------|-----------------|
| Create term loan facility | Facility created in DRAFT, auto-ID generated |
| Approve and activate facility | Status transitions DRAFT → PENDING → APPROVED → ACTIVE |
| Generate equal amortization schedule | 20 quarterly periods, sum of principal = facility amount |
| Record principal+interest payment | Outstanding reduced, schedule marked PAID, GL posted |
| Process prepayment with penalty | Penalty computed, schedule regenerated, amendment logged |
| Register collateral and revalue | Collateral recorded, LTV computed, alert if > 80% |
| Issue MPC | Certificate generated, total MPC ≤ facility amount |
| Amend interest rate | Old/new values logged, accruals recalculated |
| Dashboard shows overdue | Overdue panel shows payments past due date |
| Upcoming payments report | Lists payments due in next 10-15 days |
