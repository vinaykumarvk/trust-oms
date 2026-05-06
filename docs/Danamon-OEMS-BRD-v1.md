# Business Requirements Document: Danamon Wealth Order Execution Management System

Document version: 1.0  
Source: `docs/RFP Order Execution Management System (OEMS) v.1.0.docx`  
Prepared date: 2026-05-04  
Classification: Confidential

## Table of Contents

1. Executive Summary
2. Scope and Boundaries
3. User Roles and Permissions
4. Data Model
5. Functional Requirements
6. User Interface Requirements
7. API and Integration Requirements
8. Non-Functional Requirements
9. Workflow and State Diagrams
10. Notification and Communication Requirements
11. Reporting and Analytics
12. Migration and Launch Plan
13. Glossary
14. Appendices

# 1. Executive Summary

## 1.1 Project Description

The Danamon Wealth Order Execution Management System (OEMS) is an enterprise order management and execution platform for wealth products. It digitizes branch-assisted and customer self-service order capture, product setup, validations, document registration, digital verification, order blotters, reporting, portfolio visibility, risk profiling, sales certification checks, and integration with internal and external systems. Phase 1 covers FX Leave Order (ODA), Market Linked Deposit (MLD), Mutual Funds and Bonds order capture, FX Today Special Rate transactions, and phase-1 Wealth Lending registration and mark-to-market monitoring.

## 1.2 Business Objectives

- Replace paper-based wealth order forms with governed e-forms and digital transaction records.
- Enable customers and sales users to initiate wealth product transactions from D-Bank PRO, CRM microsite, or OEMS directly.
- Reduce order turnaround time by automating validation, approval routing, customer authorization, notifications, and downstream handoff.
- Increase transaction volume, CASA balances, fee income, customer stickiness, and NTB onboarding through convenient digital channels.
- Provide a single source of truth for order history, portfolio view, audit trail, and regulatory reporting.

## 1.3 Target Users and Pain Points

| User Group | Pain Points Addressed |
|---|---|
| Customer | Must visit branch or use PFE for many transactions; limited combined portfolio visibility; manual notifications; fragmented authorization. |
| Relationship Manager / Sales | Manual forms, manual eligibility checks, fragmented customer data, no CRM-integrated order capture, limited visibility of sales certification constraints. |
| Branch Sales Manager / Supervisor | Manual document checks, manual customer call back, inconsistent approval trail, limited view of pending orders. |
| Treasury Trader / Treasury Sales | Spreadsheet-based ODA and MLD blotters, manual collective-order monitoring, manual status updates, limited maker-checker control. |
| Wealth Management Operations | Manual MLD recap, term sheet distribution, confirmation letters, maturity result communications, and reconciliation. |
| Branch Operations / SSO / TIWO | Manual hold/unhold, time deposit creation, overbooking, PFE registration, and settlement follow-up. |
| Product / Business Admin | Needs configurable product, pricing, cut-off, risk, validation, notification, and recommendation parameters with maker-checker. |
| Compliance / Risk / Audit | Needs immutable audit logs, risk profile enforcement, document evidence, and reports for OJK, LBU, Antasena, and internal audit. |
| IT / Integration Operations | Needs secure API, resilient integration monitoring, retry, reconciliation, and traceability across NCBS, RBS, Avantrade, Treasury, D-Bank PRO, CRM, Big Data, reporting, document management, KSEI, and notification gateways. |

## 1.4 Success Metrics

| KPI | Target |
|---|---|
| Paper form replacement | 95% of in-scope wealth orders captured via e-form within 6 months of rollout. |
| Order submission TAT | 50% reduction from current manual branch process for ODA and MLD order taking. |
| Validation automation | 90% of standard checks executed automatically before order submission. |
| Notification delivery visibility | 100% of customer-facing notifications logged with delivered, failed, or retry status. |
| Audit completeness | 100% of create, amend, approve, reject, cancel, execute, expire, export, and integration actions hash-audited. |
| API availability | 99.9% monthly availability for production OEMS APIs excluding planned maintenance. |
| Response time | 95th percentile under 2 seconds for interactive screen reads and under 5 seconds for order submission excluding external-system latency. |

# 2. Scope and Boundaries

## 2.1 In Scope

- General OEMS order process, e-form management, eKYC integration hooks, product-specific workflows, order submission, amendment, cancellation, observation, execution, maturity, renewal, and closing states.
- Product coverage for Phase 1:
  - FX Leave Order (ODA), including order taking, collective-order validation, blotter, observation, execution, expiration, hold/unhold, and reporting.
  - Market Linked Deposit (MLD), including tranche setup, offering period order capture, 90-day average balance validation, trade/value date processing, fixing/maturity result processing, customer confirmation letters, and reports.
  - Mutual Funds and Bonds order capture and handoff to Wealth Core systems, including SID/account opening, PFE registration, risk profiling, sales certification, digital verification, product performance, and supported transaction types.
  - FX Today Special Rate transactions, including live rate display, countdown confirmation, underlying document trigger, core banking execution instruction, and FX blotter.
  - Wealth Lending phase 1, including manual facility registration, collateral registration, daily mark-to-market, LTV parameters, overdraft-limit monitoring, breach actions, notifications, and reports.
- Channels:
  - OEMS direct internal web application.
  - CRM-embedded secure microsite for sales-assisted transactions.
  - D-Bank PRO secure microsite for customer self-service and customer authorization.
- Product and parameter setup for all in-scope wealth products with maker-checker.
- Document checklist, e-form document generation, document registration, document storage metadata, digital signature embedding, and internal DMS integration hooks.
- Risk profile questionnaire setup, scoring, expiry validation, reporting, and integration with RBS and Avantrade.
- Portfolio management for wealth and core-banking holdings with original and local-currency views, performance, realized and unrealized gain/loss, export, and transaction redirection.
- Notifications by email, SMS, D-Bank PRO, and in-app OEMS with configurable templates and delivery tracking.
- Reports and transaction history for order, product, regulatory, static data, fee, lead, portfolio, audit, and integration monitoring needs.
- Secure APIs for internal and external integrations, including data exchange with KSEI and other third parties.
- Audit, security, role-based permissions, integration traceability, non-editable audit logs, encrypted transport, and Active Directory integration support.

## 2.2 Out of Scope

- Wealth Lending phase 2 credit analysis, collateral binding, disbursement, renewal, and closing automation, except for capturing future-state data fields and marking them deferred.
- Real production connections to Danamon systems in local development; integrations are implemented as adapters, API contracts, queues, mocks, and reconciliation logs until credentials and network access are provided.
- Native mobile application development for D-Bank PRO; OEMS provides secure responsive microsite pages and APIs for embedding.
- Replacement of RBS, Avantrade, Treasury System, NCBS, CRM, Big Data, Reporting System, Document Management System, or KSEI.
- Procurement, commercial proposal, staffing, contract penalty, and vendor eligibility sections of the RFP.

## 2.3 Assumptions

- OEMS uses Bank Danamon identity and role data via LDAP/Active Directory integration in production.
- NCBS is the system of record for customer CIF, account status, balance, hold/unhold, debit/credit, overbooking, time deposit creation, PFE registration, and FP 8007 status.
- RBS and Avantrade are systems of record for bond, mutual fund, SID, account portfolio, risk profile, and wealth core transaction processing where specified.
- Treasury System is the source or destination for FX reference rates, ODA placement, MLD option dealing, and dealing IDs.
- D-Bank PRO and CRM embed OEMS through secure microsite sessions with channel, user, customer, and transaction context.
- External systems may be unavailable; OEMS must log, retry, and expose reconciliation status instead of silently losing requests.

## 2.4 Constraints

- All production interfaces must use secure channels with encryption and address filtering.
- Audit logs and transaction logs must be non-editable and protected from unauthorized deletion.
- The solution must support English and Bahasa Indonesia labels and messages.
- Production, DRC, SIT, UAT, DEV, PT/pre-production, and reporting environments must be planned.
- Supported operating system and platform stack must remain supported for at least the next 6 years.
- Application security must comply with Bank Danamon security standards, Indonesian banking regulations, and relevant Bank Indonesia/OJK rules.

# 3. User Roles and Permissions

## 3.1 Role Definitions

| Role | Description |
|---|---|
| Customer | Wealth customer using D-Bank PRO microsite for self-service transactions, document signing, and portfolio visibility. |
| Sales/RM | Sales or relationship manager creating assisted orders through OEMS or CRM microsite. |
| Senior RM / Sales Checker | Approver for sales-originated transactions where customer digital verification is not active or where supervisor approval is required. |
| BSM | Branch Sales Manager reviewing assisted orders, authorizing where required, performing or tracking customer callback, and monitoring branch orders. |
| Branch Operations / SSO | Handles document completion, customer callback, PFE registration, hold/unhold follow-up, and manual overbook follow-up. |
| Treasury Trader | Updates ODA summary status and swap points, manages Treasury placement and MLD option outcomes. |
| Treasury Sales | Reviews ODA summary blotter, exports or emails Treasury Summary Deal Report, handles FX approval when rates are outside range. |
| Wealth Management Operations | Maintains MLD products, compiles tranches, monitors trade/fixing/maturity processes, reports, and communications. |
| Product Admin | Maintains product, pricing, calendar, validation, risk, notification, and recommendation parameters. |
| Product Checker | Maker-checker approver for product and parameter setup. |
| Compliance/Risk Officer | Reviews risk profile, suitability, regulatory reports, large FX underlying-document triggers, and exceptions. |
| Audit User | Read-only access to transaction, audit, report, and integration evidence. |
| IT Operations | Monitors integrations, retries, degraded mode, certificates, API health, and support incidents. |
| System Admin | Maintains technical configuration and user access, but cannot approve business transactions unless separately assigned a business role. |

## 3.2 Permissions Matrix

| Capability | Customer | Sales/RM | BSM | Branch Ops | Treasury | WM Ops | Product Admin | Product Checker | Compliance/Risk | Audit | IT Ops | System Admin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View own portfolio | Y | On assigned customers | Branch scope | Branch scope | N | N | N | N | Exception scope | Read | N | Config only |
| Create self-service order | Y | N | N | N | N | N | N | N | N | N | N | N |
| Create assisted order | N | Y | Y | Y | N | N | N | N | N | N | N | N |
| Amend order before COT | Own draft only | Own/branch draft or rejected | Branch scope | Branch scope | ODA summary only | MLD tranche only | N | N | N | N | N | N |
| Cancel order before COT | Own draft only | Own/branch before COT | Branch scope | Branch scope | ODA summary only | MLD tranche only | N | N | N | N | N | N |
| Approve sales order | Digital verify only | N | Y | Callback result only | N | N | N | N | N | N | N | N |
| Update ODA summary execution status | N | N | N | N | Y | N | N | N | N | Read | N | N |
| Approve ODA summary update | N | N | N | N | Treasury checker | N | N | N | N | Read | N | N |
| Maintain products/parameters | N | N | N | N | Limited treasury fields | MLD fields | Maker | Approver | Review | Read | N | Config only |
| Submit digital verification | Y | N | N | N | N | N | N | N | N | N | N | N |
| View reports | Own history | Assigned/branch | Branch | Branch ops | Treasury reports | WM reports | Product reports | Product reports | Regulatory/risk | All read-only | Ops reports | Config reports |
| Export reports | Own allowed formats | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | N |
| Manage notification templates | N | N | N | N | N | N | Maker | Approver | Review | Read | N | Config only |
| Retry failed integrations | N | N | N | N | N | N | N | N | N | Read | Y | Y |
| Delete audit records | N | N | N | N | N | N | N | N | N | N | N | N |

# 4. Data Model

## 4.1 Modeling Standards

- Every persistent entity must include `id`, `status`, `created_at`, `created_by`, `updated_at`, `updated_by`, `is_deleted`, and audit hash fields unless the table is an append-only event log.
- Monetary values must store currency, precision, scale, and source exchange rate where conversion is used.
- External-system calls must produce immutable integration messages with request payload hash, response payload hash, status, retry count, correlation ID, and external reference.
- Document entities must distinguish generated documents, signed documents, uploaded evidence, and registration status in NCBS or DMS.

## 4.2 Core Entities

### Customer

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| customer_id | string | Y | Unique internal customer key. |
| cif | string | Y | Unique NCBS CIF, alphanumeric, 6-20 chars. |
| customer_type | enum | Y | INDIVIDUAL, CORPORATE. |
| legal_name | string | Y | 2-200 chars. |
| id_number | string | N | KTP/passport/company ID. |
| npwp | string | N | Indonesian tax ID. |
| email | string | Y | Valid email for confirmations. |
| mobile_number | string | Y | E.164 or local normalized format. |
| branch_code | string | Y | Existing branch reference. |
| risk_profile_id | string | N | Latest active risk profile. |
| pfe_status | enum | Y | NOT_REGISTERED, PENDING, ACTIVE, EXPIRED. |
| sku_status | enum | Y | NOT_SIGNED, ACTIVE, EXPIRED. |
| kyc_status | enum | Y | PENDING, ACTIVE, EDD_REQUIRED, EXPIRED, REJECTED. |
| language_preference | enum | Y | EN or ID; default EN. |
| created_at / updated_at | timestamp | Y | System maintained. |

Sample data:

| customer_id | cif | customer_type | legal_name | email | pfe_status | sku_status | kyc_status |
|---|---|---|---|---|---|---|---|
| CUST-10001 | 0034567890 | INDIVIDUAL | Andi Wijaya | andi@example.co.id | ACTIVE | ACTIVE | ACTIVE |
| CUST-20001 | 0088123456 | CORPORATE | PT Nusantara Export | treasury@nusantara.co.id | NOT_REGISTERED | ACTIVE | EDD_REQUIRED |

### Sales Certification

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| certification_id | string | Y | Unique. |
| user_id | string | Y | Sales user. |
| product_family | enum | Y | ODA, MLD, MUTUAL_FUND, BOND, FX, WEALTH_LENDING. |
| certificate_no | string | Y | External or internal cert reference. |
| effective_date | date | Y | <= expiry_date. |
| expiry_date | date | Y | Must be future for ACTIVE status. |
| status | enum | Y | ACTIVE, EXPIRED, REVOKED, PENDING_SYNC. |
| wealth_core_sync_status | enum | N | NOT_REQUIRED, PENDING, SENT, FAILED. |

Sample data:

| certification_id | user_id | product_family | certificate_no | expiry_date | status |
|---|---|---|---|---|---|
| CERT-ODA-001 | U-RM-01 | ODA | ODA-2026-001 | 2026-12-31 | ACTIVE |
| CERT-MF-010 | U-RM-02 | MUTUAL_FUND | WAPERD-991 | 2026-08-31 | ACTIVE |

### Wealth Product

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| product_id | string | Y | Unique. |
| product_family | enum | Y | ODA, MLD, MUTUAL_FUND, BOND, FX, WEALTH_LENDING. |
| product_code | string | Y | Unique within family. |
| product_name | string | Y | 2-200 chars. |
| currency | string | Y | ISO currency. |
| risk_rating | enum | Y | LOW, MEDIUM, HIGH, VERY_HIGH. |
| product_status | enum | Y | DRAFT, PENDING_APPROVAL, ACTIVE, SUSPENDED, EXPIRED. |
| source_system | enum | Y | OEMS, NCBS, RBS, AVANTRADE, TREASURY, THIRD_PARTY. |
| pricing_source | string | N | Reuters, Bloomberg, Treasury, RBS, Avantrade, NCBS. |
| effective_from / effective_to | date | Y/N | Active date range. |

Sample data:

| product_id | product_family | product_code | product_name | currency | risk_rating | product_status |
|---|---|---|---|---|---|---|
| PROD-ODA-USDIDR | ODA | ODA-USDIDR | USD/IDR Leave Order | IDR | HIGH | ACTIVE |
| PROD-MLD-USD-1M | MLD | MLD-USD-1M | USD One Touch MLD 1M | USD | HIGH | DRAFT |

### Product Parameter Set

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| parameter_set_id | string | Y | Unique. |
| product_family | enum | Y | Product family. |
| product_id | string | N | Null means family-level. |
| parameter_type | enum | Y | PRICING, CALENDAR, RISK, CUTOFF, VALIDATION, STATIC_DATA, NOTIFICATION, RECOMMENDATION, LTV. |
| parameter_payload | json | Y | Versioned JSON schema per type. |
| version_no | integer | Y | Increment on change. |
| status | enum | Y | DRAFT, PENDING_APPROVAL, APPROVED, ACTIVE, RETIRED, REJECTED. |
| maker_id | string | Y | Creator. |
| checker_id | string | N | Approver. |
| effective_from | timestamp | Y | Required for ACTIVE. |

Sample data:

| parameter_set_id | product_family | parameter_type | version_no | status |
|---|---|---|---:|---|
| PAR-ODA-COT-001 | ODA | CUTOFF | 1 | ACTIVE |
| PAR-WL-LTV-001 | WEALTH_LENDING | LTV | 1 | PENDING_APPROVAL |

### Wealth Order

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| order_id | string | Y | Unique, generated. |
| order_no | string | Y | Human-readable unique order number. |
| product_family | enum | Y | ODA, MLD, MUTUAL_FUND, BOND, FX, WEALTH_LENDING. |
| product_id | string | Y | Active product. |
| customer_id | string | Y | Existing customer. |
| cif | string | Y | Must match customer. |
| customer_type | enum | Y | INDIVIDUAL or CORPORATE. |
| channel | enum | Y | OEMS, CRM_MICROSITE, DBANK_PRO_MICROSITE. |
| assisted_by_user_id | string | N | Required for assisted orders. |
| branch_code | string | Y | Required for branch-assisted order. |
| order_type | string | Y | Family-specific type. |
| side | enum | N | BUY, SELL, SUBSCRIPTION, REDEMPTION, SWITCH, AUCTION, BUYBACK, FACILITY_REGISTER. |
| amount | decimal | Y | > 0. |
| currency | string | Y | ISO currency. |
| debit_account_no | string | N | Required where funds are debited. |
| credit_account_no | string | N | Required where funds are credited. |
| rate | decimal | N | FX/ODA/MLD rate when applicable. |
| fees | decimal | N | >= 0. |
| tax | decimal | N | >= 0. |
| gross_amount | decimal | N | Calculated amount before fees/tax. |
| net_amount | decimal | N | Calculated amount after fees/tax. |
| cutoff_decision | enum | Y | ACCEPTED, REJECTED_AFTER_CUTOFF, NEXT_BUSINESS_DAY. |
| order_status | enum | Y | DRAFT, PENDING_VALIDATION, VALIDATION_FAILED, PENDING_CUSTOMER_VERIFICATION, PENDING_BSM_APPROVAL, AUTHORIZED, HELD, COLLECTED, PLACED, OBSERVATION, EXECUTED, EXPIRED, CANCELLED, REJECTED, MATURED, TERMINATED, FAILED. |
| validation_result | json | N | Detailed checks. |
| digital_verification_id | string | N | Required when customer authorization is digital. |
| external_refs | json | N | NCBS, RBS, Avantrade, Treasury, CRM, D-Bank refs. |

Sample data:

| order_id | product_family | customer_id | channel | amount | currency | order_status |
|---|---|---|---|---:|---|---|
| WO-20260504-0001 | ODA | CUST-10001 | OEMS | 150000 | USD | HELD |
| WO-20260504-0002 | MLD | CUST-10001 | CRM_MICROSITE | 250000 | USD | PENDING_CUSTOMER_VERIFICATION |

### Order Validation Result

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| validation_id | string | Y | Unique. |
| order_id | string | Y | Parent order. |
| validation_code | string | Y | MIN_AMOUNT, BALANCE, CIF, RISK_PROFILE, SALES_CERTIFICATION, CUTOFF, SKU, PFE, UNDERLYING_DOC, etc. |
| severity | enum | Y | HARD, SOFT, INFO. |
| result | enum | Y | PASS, FAIL, WAIVED, PENDING_EXTERNAL. |
| message | string | Y | User-facing message. |
| source_system | string | N | OEMS, NCBS, RBS, Avantrade, Treasury. |
| checked_at | timestamp | Y | System maintained. |

Sample data:

| validation_id | order_id | validation_code | severity | result |
|---|---|---|---|---|
| VAL-0001 | WO-20260504-0001 | BALANCE | HARD | PASS |
| VAL-0002 | WO-20260504-0002 | AVG_90_DAY_BALANCE | HARD | FAIL |

### ODA Recommendation

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| recommendation_id | string | Y | Unique. |
| currency_pair | string | Y | Format `CCY/CCY`, e.g. USD/IDR. |
| direction | enum | Y | BUY_BASE, SELL_BASE. |
| recommended_rate | decimal | Y | > 0. |
| valid_from / valid_until | timestamp | Y | valid_until > valid_from. |
| rationale | string | N | Trade idea text. |
| status | enum | Y | DRAFT, ACTIVE, EXPIRED, CANCELLED. |
| created_by | string | Y | Treasury or product user. |

Sample data:

| recommendation_id | currency_pair | direction | recommended_rate | status |
|---|---|---|---:|---|
| REC-ODA-001 | USD/IDR | BUY_BASE | 16200 | ACTIVE |
| REC-ODA-002 | EUR/IDR | SELL_BASE | 17300 | DRAFT |

### ODA Blotter Group

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| blotter_group_id | string | Y | Unique. |
| business_date | date | Y | Order COT date. |
| direction | enum | Y | BUY_BASE, SELL_BASE. |
| currency_pair | string | Y | Required. |
| target_rate | decimal | Y | Required. |
| oda_type | enum | Y | SINGLE, IF_DONE, OCO. |
| effective_type | enum | Y | INTRADAY, OVERNIGHT, GOOD_TILL_DATE_TIME. |
| aggregate_order_cost | decimal | Y | Before swap points. |
| minimum_collective_order | decimal | Y | From parameter. |
| collective_status | enum | Y | PENDING, MET, NOT_MET. |
| treasury_status | enum | Y | NOT_PLACED, PLACED, OBSERVATION, EXECUTED, EXPIRED. |
| swap_points | decimal | N | Treasury update. |
| maker_checker_status | enum | Y | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED. |

Sample data:

| blotter_group_id | business_date | currency_pair | target_rate | collective_status | treasury_status |
|---|---|---|---:|---|---|
| ODA-BLT-20260504-01 | 2026-05-04 | USD/IDR | 16200 | MET | PLACED |
| ODA-BLT-20260504-02 | 2026-05-04 | EUR/IDR | 17300 | NOT_MET | NOT_PLACED |

### MLD Tranche

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| tranche_id | string | Y | Unique. |
| product_id | string | Y | MLD product. |
| tranche_code | string | Y | Unique. |
| offer_start_at / offer_end_at | timestamp | Y | offer_end_at > offer_start_at. |
| trade_date | date | Y | Equals value_date. |
| value_date | date | Y | Equals trade_date. |
| fixing_date | date | Y | Equals maturity_date. |
| maturity_date | date | Y | >= trade_date. |
| placement_currency | string | Y | ISO currency. |
| underlying_reference | string | Y | FX underlying reference. |
| option_type | enum | Y | ONE_TOUCH, NO_TOUCH, DOUBLE_NO_TOUCH. |
| option_style | enum | Y | AMERICAN, EUROPEAN. |
| upper_limit | decimal | N | Required for some options. |
| lower_limit | decimal | N | Required for some options. |
| min_interest_rate_pa | decimal | Y | >= 0. |
| max_interest_rate_pa | decimal | Y | >= min. |
| bonus_payout_pa | decimal | N | >= 0. |
| minimum_placement | decimal | Y | > 0. |
| minimum_collective_nominal | decimal | Y | > 0. |
| early_termination_allowed | boolean | Y | Default false. |
| status | enum | Y | DRAFT, PENDING_APPROVAL, OFFERING, CLOSED, TRADED, FIXED, MATURED, TERMINATED. |

Sample data:

| tranche_id | tranche_code | placement_currency | offer_end_at | minimum_placement | status |
|---|---|---|---|---:|---|
| MLD-TR-001 | MLD-USD-202605-1M | USD | 2026-05-10T15:00:00+07:00 | 25000 | OFFERING |
| MLD-TR-002 | MLD-SGD-202605-3M | SGD | 2026-05-12T15:00:00+07:00 | 30000 | DRAFT |

### Digital Verification

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| verification_id | string | Y | Unique. |
| order_id | string | N | Order reference. |
| document_id | string | N | Document reference. |
| customer_id | string | Y | Customer. |
| verification_method | enum | Y | AUTH_LINK, OTP, MPIN, SOFT_TOKEN, DIGITAL_SIGNATURE. |
| verification_status | enum | Y | CREATED, SENT, VERIFIED, EXPIRED, FAILED, CANCELLED. |
| expires_at | timestamp | Y | Required. |
| verified_at | timestamp | N | Set on success. |
| signature_hash | string | N | Required for signed documents. |
| failure_reason | string | N | Required on FAILED. |

Sample data:

| verification_id | order_id | verification_method | verification_status | expires_at |
|---|---|---|---|---|
| DV-0001 | WO-20260504-0001 | OTP | VERIFIED | 2026-05-04T16:10:00+07:00 |
| DV-0002 | WO-20260504-0002 | AUTH_LINK | SENT | 2026-05-04T16:30:00+07:00 |

### Document Registration

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| document_id | string | Y | Unique. |
| customer_id | string | Y | Customer. |
| order_id | string | N | Optional order. |
| document_type | enum | Y | SKU, PFE, INDEMNITY, RISK_PROFILE, TERMSHEET, PRODUCT_HIGHLIGHT, PARTICIPATION_FORM, UNDERLYING, CONFIRMATION, OTHER. |
| required_flag | boolean | Y | Default true. |
| document_status | enum | Y | MISSING, GENERATED, UPLOADED, SIGNED, REGISTERED_NCBS, REGISTERED_DMS, REJECTED, EXPIRED. |
| file_url | string | N | Internal storage URL. |
| file_hash | string | N | SHA-256. |
| signed_file_url | string | N | Generated after digital signature. |
| ncbs_registration_ref | string | N | CIM13/NCBS ref. |
| dms_ref | string | N | DMS ref. |
| expiry_date | date | N | Required for expiring docs. |

Sample data:

| document_id | customer_id | document_type | document_status | ncbs_registration_ref |
|---|---|---|---|---|
| DOC-0001 | CUST-10001 | SKU | SIGNED | CIM13-10001 |
| DOC-0002 | CUST-10001 | TERMSHEET | GENERATED | |

### Portfolio Holding

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| holding_id | string | Y | Unique. |
| customer_id | string | Y | Customer. |
| source_system | enum | Y | OEMS, NCBS, RBS, AVANTRADE, LOAN_SYSTEM. |
| product_family | enum | Y | SAVINGS, TIME_DEPOSIT, LOAN, MUTUAL_FUND, BOND, MLD, ODA, FX, WEALTH_LENDING. |
| product_id | string | N | Product ref. |
| quantity | decimal | N | Holdings quantity. |
| principal_amount | decimal | N | Remaining principal. |
| market_value_original | decimal | Y | Value in original currency. |
| original_currency | string | Y | ISO currency. |
| market_value_local | decimal | Y | IDR value. |
| local_currency | string | Y | IDR. |
| realized_gain_loss | decimal | N | IDR or original currency as tagged. |
| unrealized_gain_loss | decimal | N | IDR or original currency as tagged. |
| valuation_date | date | Y | As-of date. |

Sample data:

| holding_id | customer_id | product_family | market_value_original | original_currency | market_value_local |
|---|---|---|---:|---|---:|
| HOLD-001 | CUST-10001 | MUTUAL_FUND | 100000000 | IDR | 100000000 |
| HOLD-002 | CUST-10001 | BOND | 50000 | USD | 810000000 |

### Risk Questionnaire and Assessment

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| questionnaire_id | string | Y | Unique. |
| version_no | integer | Y | Active version. |
| language | enum | Y | EN, ID. |
| questions | json | Y | Question, options, score, mandatory flags. |
| scoring_rules | json | Y | Risk profile mapping and expiry tenor. |
| status | enum | Y | DRAFT, PENDING_APPROVAL, ACTIVE, RETIRED. |

Sample data:

| questionnaire_id | version_no | language | status |
|---|---:|---|---|
| RQ-EN-001 | 1 | EN | ACTIVE |
| RQ-ID-001 | 1 | ID | ACTIVE |

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| assessment_id | string | Y | Unique. |
| customer_id | string | Y | Customer. |
| questionnaire_id | string | Y | Questionnaire version. |
| answers | json | Y | Raw answers. |
| score | integer | Y | >= 0. |
| risk_profile | enum | Y | CONSERVATIVE, MODERATE, BALANCED, GROWTH, AGGRESSIVE. |
| effective_date | date | Y | Assessment date. |
| expiry_date | date | Y | Based on configured tenor. |
| source_system | enum | Y | OEMS, RBS, AVANTRADE. |

Sample data:

| assessment_id | customer_id | risk_profile | effective_date | expiry_date |
|---|---|---|---|---|
| RA-0001 | CUST-10001 | BALANCED | 2026-04-01 | 2027-04-01 |
| RA-0002 | CUST-20001 | AGGRESSIVE | 2025-03-01 | 2026-03-01 |

### Wealth Lending Facility and Collateral

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| facility_id | string | Y | Unique. |
| customer_id | string | Y | Customer. |
| facility_ref | string | Y | Manually created facility reference. |
| facility_limit | decimal | Y | > 0. |
| outstanding_amount | decimal | Y | >= 0. |
| currency | string | Y | ISO currency. |
| facility_start_date | date | Y | Required. |
| facility_expiry_date | date | Y | > start date. |
| facility_status | enum | Y | REGISTERED, ACTIVE, BREACHED, BLOCKED, EXPIRED, CLOSED, DEFAULTED. |
| limit_source | enum | Y | MANUAL, M2M_CALCULATED, CORE_BANKING. |

Sample data:

| facility_id | customer_id | facility_limit | outstanding_amount | currency | facility_status |
|---|---|---:|---:|---|---|
| WLF-001 | CUST-10001 | 500000000 | 200000000 | IDR | ACTIVE |
| WLF-002 | CUST-20001 | 100000 | 95000 | USD | BREACHED |

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| collateral_id | string | Y | Unique. |
| facility_id | string | Y | Parent facility. |
| holding_id | string | Y | Pledged wealth holding. |
| collateral_type | enum | Y | BOND, MUTUAL_FUND. |
| pledged_units | decimal | Y | > 0. |
| market_price | decimal | Y | Latest market price. |
| market_value | decimal | Y | pledged_units * market_price. |
| haircut_pct | decimal | Y | 0-100. |
| eligible_collateral_value | decimal | Y | market value after haircut. |
| maturity_date | date | N | Required where product matures. |
| collateral_status | enum | Y | ACTIVE, TOP_UP_REQUIRED, RELEASED, SOLD, BLOCKED. |

Sample data:

| collateral_id | facility_id | collateral_type | market_value | haircut_pct | collateral_status |
|---|---|---|---:|---:|---|
| WLC-001 | WLF-001 | BOND | 600000000 | 20 | ACTIVE |
| WLC-002 | WLF-002 | MUTUAL_FUND | 100000 | 30 | TOP_UP_REQUIRED |

### Notification Template and Delivery

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| template_id | string | Y | Unique. |
| event_type | string | Y | ORDER_SUBMITTED, ORDER_EXECUTED, etc. |
| channel | enum | Y | EMAIL, SMS, DBANK_PRO, IN_APP. |
| language | enum | Y | EN, ID. |
| subject_template | string | N | Required for email. |
| body_template | string | Y | Tokenized content. |
| status | enum | Y | DRAFT, PENDING_APPROVAL, ACTIVE, RETIRED. |

Sample data:

| template_id | event_type | channel | language | status |
|---|---|---|---|---|
| NT-ODA-EXEC-EN | ORDER_EXECUTED | EMAIL | EN | ACTIVE |
| NT-MLD-MAT-ID | MLD_MATURITY_RESULT | EMAIL | ID | ACTIVE |

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| delivery_id | string | Y | Unique. |
| template_id | string | Y | Template. |
| recipient_type | enum | Y | CUSTOMER, SALES, BSM, BRANCH_OPS, TREASURY, WM_OPS. |
| recipient_id | string | Y | User or customer ID. |
| channel | enum | Y | EMAIL, SMS, DBANK_PRO, IN_APP. |
| delivery_status | enum | Y | QUEUED, SENT, DELIVERED, FAILED, RETRYING, CANCELLED. |
| failure_reason | string | N | Required on failed. |
| retry_count | integer | Y | Default 0. |
| sent_at / delivered_at | timestamp | N | Maintained by notification engine. |

Sample data:

| delivery_id | template_id | recipient_type | channel | delivery_status |
|---|---|---|---|---|
| ND-0001 | NT-ODA-EXEC-EN | CUSTOMER | EMAIL | DELIVERED |
| ND-0002 | NT-MLD-MAT-ID | CUSTOMER | EMAIL | FAILED |

### Integration Message

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| message_id | string | Y | Unique. |
| source_system | string | Y | OEMS or external system. |
| target_system | string | Y | NCBS, RBS, AVANTRADE, TREASURY, CRM, DBANK_PRO, BIG_DATA, REPORTING, DMS, KSEI, NOTIFICATION_GATEWAY. |
| message_type | string | Y | HOLD_FUNDS, UNHOLD_FUNDS, CREATE_TD, SYNC_STATUS, etc. |
| business_key | string | Y | order_id/facility_id/tranche_id. |
| request_payload | json | Y | Stored or hashed per sensitivity. |
| response_payload | json | N | Stored or hashed per sensitivity. |
| status | enum | Y | PENDING, SENT, ACKED, FAILED, RETRYING, RECONCILED, DEAD_LETTER. |
| retry_count | integer | Y | Default 0. |
| external_ref | string | N | External transaction ID. |
| correlation_id | string | Y | Request trace ID. |

Sample data:

| message_id | target_system | message_type | business_key | status |
|---|---|---|---|---|
| IM-0001 | NCBS | HOLD_FUNDS | WO-20260504-0001 | ACKED |
| IM-0002 | TREASURY | GET_REFERENCE_RATE | USD/IDR | ACKED |

### Report Definition and Export Job

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| report_id | string | Y | Unique. |
| report_code | string | Y | Unique. |
| report_name | string | Y | 2-200 chars. |
| report_category | enum | Y | ODA, MLD, MUTUAL_FUND, BOND, FX, WEALTH_LENDING, PORTFOLIO, AUDIT, REGULATORY, STATIC_DATA, LEADS, FEES. |
| allowed_formats | json | Y | XLS, XLSX, CSV, TXT, PDF, DOC, DOCX. |
| filters_schema | json | Y | Search and filter definitions. |
| status | enum | Y | ACTIVE, RETIRED. |

Sample data:

| report_id | report_code | report_name | report_category | status |
|---|---|---|---|---|
| REP-ODA-001 | ODA_MASTER_RECAP | Master / Recap Blotter ODA | ODA | ACTIVE |
| REP-MLD-005 | MLD_TAX_CALC | MLD Tax Calculation Report | MLD | ACTIVE |

| Field | Type | Required | Validation / Default |
|---|---|---:|---|
| export_job_id | string | Y | Unique. |
| report_id | string | Y | Report definition. |
| requested_by | string | Y | User. |
| requested_format | enum | Y | XLS, XLSX, CSV, TXT, PDF, DOC, DOCX. |
| filters | json | Y | Applied filters. |
| export_status | enum | Y | QUEUED, GENERATING, READY, FAILED. |
| file_url | string | N | Required when READY. |
| generated_at | timestamp | N | Maintained by engine. |

Sample data:

| export_job_id | report_id | requested_format | export_status |
|---|---|---|---|
| EXP-0001 | REP-ODA-001 | XLSX | READY |
| EXP-0002 | REP-MLD-005 | PDF | GENERATING |

# 5. Functional Requirements

## FR-001 General E-Form Order Capture and Lifecycle

Description: OEMS shall replace paper-based order forms with configurable e-forms for all in-scope wealth products. It shall support product-specific workflows from registration and submission through cancellation, amendment, collection, observation, execution, maturity, renewal, and closing.

User story: As a Sales/RM or Customer, I want to capture wealth orders through a governed e-form so that transactions can be validated, authorized, tracked, and processed without manual paper handoff.

Acceptance criteria:

- AC-001.1 The system provides product-specific e-forms for ODA, MLD, Mutual Fund, Bond, FX, and Wealth Lending phase-1 registration.
- AC-001.2 The system supports order creation from OEMS direct, CRM microsite, and D-Bank PRO microsite channels.
- AC-001.3 The system stores channel, customer, sales user, branch, product, order amount, currency, status, validation result, and external references for every order.
- AC-001.4 The system supports amendment and cancellation before configured COT where product rules allow it.
- AC-001.5 The system records every status transition in an immutable audit trail.

Business rules:

- BR-001.1 Sales-assisted orders require `assisted_by_user_id` and `branch_code`.
- BR-001.2 Customer self-service orders require digital verification before downstream execution.
- BR-001.3 Product-specific workflow rules override generic order rules when there is a conflict.

UI behavior notes:

- The order form is split into product, customer, transaction, documents, validation, authorization, and review sections.
- Save Draft persists incomplete data without submitting downstream calls.
- Submit runs validations and shows field-level and business-rule errors.

Edge cases and error handling:

- EC-001.1 If external validation is unavailable, the order status becomes `VALIDATION_PENDING_EXTERNAL` and the user sees the affected check.
- FH-001.1 If order save fails, no downstream external instruction is sent and the user receives a retry-safe error with correlation ID.

## FR-002 Cut-Off Handling and Business Calendar

Description: OEMS shall support configurable cut-off scenarios per product, transaction type, currency pair, branch, channel, and holiday calendar. It shall enforce reject-after-COT or next-business-day processing based on the parameter setup.

User story: As a Product Admin, I want configurable cut-off rules so that each product can follow correct processing windows without code changes.

Acceptance criteria:

- AC-002.1 Product Admin can maintain cut-off parameters with maker-checker.
- AC-002.2 Orders after a reject-after-COT rule cannot be submitted.
- AC-002.3 Orders after a next-business-day rule can be submitted but receive next working day processing date.
- AC-002.4 The system applies Indonesian and international holiday calendars where configured.

Business rules:

- BR-002.1 COT is evaluated using the product timezone and channel timestamp.
- BR-002.2 Amendment and cancellation must be blocked after COT unless a product-specific exception allows checker repair.

Edge cases and error handling:

- EC-002.1 If the calendar is missing for a currency/product combination, submission fails with `CALENDAR_NOT_CONFIGURED`.
- FH-002.1 If daylight-saving or timezone conversion cannot be resolved, the system rejects the submission and logs an integration/configuration exception.

## FR-003 Calculation and Validation Engine

Description: OEMS shall perform validation and calculation for all in-scope products using internal parameters, surrounding system parameters, and validations from NCBS, RBS, Avantrade, Treasury, D-Bank PRO, and third-party systems.

User story: As a Compliance/Risk Officer, I want every order validated before execution so that unsuitable, underfunded, uncertified, or rule-breaking transactions are blocked or escalated.

Acceptance criteria:

- AC-003.1 The validation engine supports minimum amount, maximum amount, balance sufficiency, CIF, account status, currency pair, reference rate, SKU, PFE, minimum collective order, terms and conditions, monthly FX limit, sales certification, product risk rating, risk profile expiry, and underlying document checks.
- AC-003.2 Hard validation failures block submission or execution.
- AC-003.3 Soft validation warnings require explicit user acknowledgement or approval.
- AC-003.4 The system stores each validation result with code, source, severity, message, and timestamp.
- AC-003.5 The calculation engine computes debit, credit, fee, tax, FX conversion, mark-to-market, switching, ODA nominal overbook, and MLD maturity payout amounts where applicable.

Business rules:

- BR-003.1 Product risk rating cannot exceed customer risk profile unless an approved exception flow exists.
- BR-003.2 Sales certification must be active for the product family at submission time.
- BR-003.3 Balance checks must use available balance, not ledger balance, when NCBS returns both.

Edge cases and error handling:

- EC-003.1 If a validation source returns stale data, the system marks the check `PENDING_EXTERNAL` or `FAIL` based on parameterized tolerance.
- FH-003.1 If a calculation input is missing, the system rejects with the missing input name and does not infer values silently.

## FR-004 Product and Parameter Management

Description: OEMS shall allow business users to maintain products, pricing, fees, spreads, margins, holidays, risk profile logic, cut-offs, transaction validations, static data, notifications, and recommendations using a maker-checker workflow.

User story: As a Product Admin, I want configurable product and parameter setup so that wealth products can be managed without developer intervention.

Acceptance criteria:

- AC-004.1 Product Admin can create, edit, submit, approve, reject, activate, retire, and version parameter sets.
- AC-004.2 Checker approval is required before a parameter set affects live transactions.
- AC-004.3 Product pricing can display live and historical data and support filters by period, tenor, coupon, yield, and performance where product data supports it.
- AC-004.4 Product risk rating is configurable and used by the validation engine.
- AC-004.5 Product or transaction recommendations can be configured and published to sales/customer channels.

Business rules:

- BR-004.1 A maker cannot approve their own parameter changes.
- BR-004.2 Active parameter versions must have non-overlapping effective windows for the same product, type, and channel.

Edge cases and error handling:

- EC-004.1 If an external pricing source is unavailable, the UI must show stale timestamp and disable live order submission where the product requires a live price.
- FH-004.1 Rejected parameter changes must retain review comments and remain auditable.

## FR-005 Secure Microsite Channel Integration

Description: OEMS shall expose responsive secure microsites and APIs for D-Bank PRO and CRM. Customer self-service, RM-assisted order capture, and customer authorization must share the same governed order and validation services.

User story: As a Channel Owner, I want OEMS embedded securely in CRM and D-Bank PRO so that customers and RMs use consistent order workflows across channels.

Acceptance criteria:

- AC-005.1 Microsite sessions carry channel, user/customer, branch, locale, and correlation context.
- AC-005.2 Pages are responsive on mobile, tablet, and desktop.
- AC-005.3 Customer self-service actions are limited to own accounts and products.
- AC-005.4 CRM-assisted actions require assigned or authorized customer relationship context.
- AC-005.5 All microsite APIs use the standard error contract and correlation ID.

Business rules:

- BR-005.1 A customer must authorize assisted transactions themselves unless digital verification is not active and the BSM fallback flow is enabled.
- BR-005.2 Channel context cannot be altered by client-side input after session creation.

Edge cases and error handling:

- EC-005.1 Expired microsite sessions redirect to the originating channel with a safe error code.
- FH-005.1 Invalid channel signature returns `INVALID_CHANNEL_CONTEXT` and logs a security event.

## FR-006 Notifications and Delivery Tracking

Description: OEMS shall generate configurable notifications for order submission, executed, expired, cancelled, terminated, callback order, verification reminder, MLD result, facility breach, and other business events.

User story: As a Customer or Sales/RM, I want timely notifications with delivery visibility so that I know when action is required or a transaction status changes.

Acceptance criteria:

- AC-006.1 Notification templates support EN and ID content and maker-checker activation.
- AC-006.2 Customer channels include email, SMS, and D-Bank PRO integration.
- AC-006.3 Internal channels include email and in-app OEMS.
- AC-006.4 Delivery attempts, retries, delivered status, failed status, and failure reasons are logged.
- AC-006.5 Operations users can report potentially undelivered customer email due to invalid recipient or SMTP issue.

Business rules:

- BR-006.1 Critical transactional notifications cannot be disabled by user preferences.
- BR-006.2 PDF attachments with password policy are required for ODA trade confirmation and MLD maturity confirmation where configured.

Edge cases and error handling:

- EC-006.1 If SMS fails but email succeeds, the event is partially delivered and remains visible in operations report.
- FH-006.1 A failed notification never rolls back a successfully authorized business transaction; it creates an exception for follow-up.

## FR-007 Reports and Transaction History

Description: OEMS shall provide display, filtering, export, and data-passing capabilities for all transaction and activity reports required by business, operations, CRM, and regulators.

User story: As an Operations or Audit user, I want complete transaction reports and history so that I can monitor, export, reconcile, and evidence all wealth order activity.

Acceptance criteria:

- AC-007.1 Reports support filters by customer, CIF, sales, branch, channel, product, product family, status, transaction type, currency, date range, deal ID, and external reference where applicable.
- AC-007.2 Reports can export XLS, XLSX, CSV, TXT, PDF, DOC, and DOCX where enabled by report definition.
- AC-007.3 Transaction history under 90 days is retrieved from OEMS and core systems as configured.
- AC-007.4 Transaction history over 90 days can be retrieved from Core Banking and/or Big Data.
- AC-007.5 Audit log report covers all transactions and activities in read-only form.

Business rules:

- BR-007.1 Treasury Summary Deal Report cannot be downloaded if there are pending transactions in the selected ODA group.
- BR-007.2 Downloaded Master/Recap Blotter reports must be generated as non-editable PDFs or protected spreadsheets where format supports protection.

Edge cases and error handling:

- EC-007.1 If Big Data is unavailable for older history, report job fails with retry option and no partial data is labeled complete.
- FH-007.1 Export jobs larger than synchronous threshold run asynchronously and expose job status.

## FR-008 Portfolio Management

Description: OEMS shall display holistic portfolio performance for each customer, combining mandatory wealth products and core banking products such as savings, time deposit, and loan. It shall show original and local currency values, realized and unrealized gain/loss, specific holding details, exports, and redirection to transaction pages.

User story: As a Customer or Sales/RM, I want a combined portfolio view so that I can understand holdings and initiate suitable transactions from the portfolio context.

Acceptance criteria:

- AC-008.1 Portfolio view combines holdings from OEMS, Wealth Core, and Core Banking based on configured source availability.
- AC-008.2 Holdings show original currency and local IDR value.
- AC-008.3 Realized and unrealized gain/loss are shown per wealth product where source data supports it.
- AC-008.4 User can filter to specific holdings such as left principal, profit gain, and left term.
- AC-008.5 Portfolio export supports configured formats.

Business rules:

- BR-008.1 Local currency conversion uses approved FX rate source and as-of date.
- BR-008.2 Customer users only see their own portfolio; sales users see only authorized/assigned customers.

Edge cases and error handling:

- EC-008.1 If one source is unavailable, the UI displays stale or partial source status and does not merge missing values as zero.
- FH-008.1 Failed portfolio-source calls are logged as integration messages with retry and reconciliation status.

## FR-009 Digital Signature and Verification

Description: OEMS shall support customer digital signature or digital verification through in-app capability or third-party integration. Verification applies to registration, transaction authorization, and mandatory documents such as SKU, PFE, term sheet, product highlight sheet, risk profile questionnaire, MLD participation form, and trade confirmations.

User story: As a Customer, I want to authorize orders and sign mandatory documents digitally so that I do not need paper-based branch processing.

Acceptance criteria:

- AC-009.1 System can generate authentication links, OTP, MPIN, soft-token, or digital-signature requests.
- AC-009.2 Verification requests expire after configured duration.
- AC-009.3 Signed documents embed signature evidence and can be downloaded.
- AC-009.4 Failed, expired, cancelled, and successful verification attempts are auditable.
- AC-009.5 BSM fallback approval is available only where digital verification has not been implemented for a channel/product.

Business rules:

- BR-009.1 Digital verification must bind to customer, order/document, timestamp, channel, and payload hash.
- BR-009.2 A verified payload cannot be modified without invalidating the verification and requiring re-verification.

Edge cases and error handling:

- EC-009.1 Multiple failed OTP attempts lock the verification request and require new issuance.
- FH-009.1 Third-party signature outage places orders in `PENDING_CUSTOMER_VERIFICATION` and raises an operations alert.

## FR-010 Document Registration and Checklist

Description: OEMS shall provide document checklist, e-form document generation, document registration, signed document storage, NCBS CIM13 update integration, and internal DMS integration for all wealth product transactions and registrations.

User story: As Branch Operations, I want a transaction document checklist and registration status so that missing or unsigned documents block orders before execution.

Acceptance criteria:

- AC-010.1 Each product workflow defines required, optional, and conditional documents.
- AC-010.2 The checklist shows missing, generated, uploaded, signed, rejected, NCBS-registered, and DMS-registered states.
- AC-010.3 The system can update documents registered in Core Banking CIM13 or related system.
- AC-010.4 OEMS stores metadata and evidence for all WM-related documents.
- AC-010.5 E-form documents are versioned and linked to order/customer.

Business rules:

- BR-010.1 Required missing or rejected documents block submission or execution based on workflow rule.
- BR-010.2 Expired SKU, PFE, risk profile, or regulatory documents trigger renewal flow.

Edge cases and error handling:

- EC-010.1 If DMS accepts upload but NCBS update fails, document status is `REGISTERED_DMS` with NCBS retry pending.
- FH-010.1 File hash mismatch quarantines the document and prevents use in authorization.

## FR-011 Risk Profiling

Description: OEMS shall support configurable risk profile questionnaires, scoring, storage, expiry validation, integration with RBS and Avantrade, reassessment, parameterized product-risk mapping, and reports.

User story: As a Compliance/Risk Officer, I want customer risk profiles calculated and enforced so that customers transact only in suitable products unless an approved exception exists.

Acceptance criteria:

- AC-011.1 Business users can maintain standard and custom questionnaire versions with maker-checker.
- AC-011.2 The system calculates and displays customer risk profile from answers.
- AC-011.3 Risk profile is saved with effective and expiry dates.
- AC-011.4 Orders validate active risk profile and product risk rating.
- AC-011.5 OEMS can retrieve and send risk profile data to RBS and Avantrade.
- AC-011.6 Reports show risk profile status and expiry population.

Business rules:

- BR-011.1 Expired risk profile blocks new investment orders until reassessment or approved exception.
- BR-011.2 Latest active assessment is used for validation.

Edge cases and error handling:

- EC-011.1 If external Wealth Core profile conflicts with OEMS profile, conflict is flagged for review and the stricter profile is used until resolved.
- FH-011.1 Partial questionnaire answers cannot generate active risk profile.

## FR-012 FX Leave Order Pre-Order Check and Registration

Description: OEMS shall capture ODA orders through e-form from Sales via OEMS, Sales via CRM microsite, and Customer via D-Bank PRO. It shall support individual and corporate customers, Single, If Done, and OCO order types, Intraday, Overnight, and Good-till date/time effective types, Treasury reference rate retrieval, ODA recommendations, daily summary by currency pair and rate, and cut-off enforcement.

User story: As a Sales/RM, I want to capture ODA orders with automated pre-checks and trade ideas so that customer orders are valid before branch or Treasury processing.

Acceptance criteria:

- AC-012.1 ODA order form supports customer, currency pair, direction, ODA type, effective type, rate, amount, accounts, expiry, recommendation reference, and documents.
- AC-012.2 Submission validates minimum placement amount, balance, CIF, currency pairing/rate, SKU, and PFE.
- AC-012.3 Sales-originated orders route to BSM authorization when digital verification is unavailable.
- AC-012.4 The system retrieves Treasury reference rates daily and ad hoc.
- AC-012.5 Published ODA recommendations can prefill order rate when accepted by customer/sales.
- AC-012.6 Sales can view daily order summary by currency pair and rate against minimum collective order.
- AC-012.7 Orders after parameterized COT cannot be submitted.

Business rules:

- BR-012.1 Corporate and individual customers are both supported but may have different document and approval rules.
- BR-012.2 Good-till order must have future expiry date/time before maximum allowed tenor.

Edge cases and error handling:

- EC-012.1 OCO orders must define linked legs and cancel the alternate leg when one leg executes.
- FH-012.1 Missing Treasury rate source blocks rate-dependent submission with `REFERENCE_RATE_UNAVAILABLE`.

## FR-013 ODA Order Collection and Placement

Description: Once ODA orders are submitted and authorized, OEMS shall instruct NCBS to hold funds, record the transaction in the ODA Blotter, group orders at COT by direction, currency pair, rate, and order cost before swap points, compare with minimum collective order, include qualifying orders in Summary Blotter, cancel non-qualifying orders, unhold funds, and notify customers/sales/BSM.

User story: As Treasury Sales, I want ODA orders grouped automatically so that placement decisions are based on reliable minimum collective-order calculations.

Acceptance criteria:

- AC-013.1 Authorized ODA order triggers NCBS hold instruction for transaction amount.
- AC-013.2 Held order appears in FX ODA Blotter.
- AC-013.3 At COT, system groups by direction, currency pair, rate, and order cost before swap points.
- AC-013.4 Orders meeting minimum collective order are placed into Summary Blotter.
- AC-013.5 Orders not meeting minimum collective order are cancelled, excluded from Summary Blotter, unheld in NCBS, and notified.
- AC-013.6 Treasury can download daily Summary ODA Blotter after COT.
- AC-013.7 Amendment and cancellation are allowed before COT when checker rejects or user cancels.

Business rules:

- BR-013.1 Cancellation before COT is equivalent to deleting business intent but must retain audit history.
- BR-013.2 Summary Blotter cannot be exported while eligible group contains unresolved pending transactions.

Edge cases and error handling:

- EC-013.1 If NCBS hold succeeds but blotter write fails, order enters exception state and no duplicate hold is sent on retry.
- FH-013.1 Failed unhold instructions appear in Fund Release Report and retry queue.

## FR-014 ODA Observation and Execution

Description: Treasury traders shall update ODA summary status and swap points manually in OEMS with maker-checker. If executed, OEMS shall unhold funds, instruct NCBS to overbook, retrieve auto-settle result, notify manual overbook if required, sync status to FP 8007, and notify customer/sales/BSM. If expired, OEMS shall unhold funds and notify. If still observing, OEMS keeps the order active until executed or expired.

User story: As a Treasury Trader, I want controlled ODA execution status updates so that Treasury and branch operations can complete overbook, settlement, and customer communication reliably.

Acceptance criteria:

- AC-014.1 Treasury maker can update Summary Blotter status to EXECUTED, EXPIRED, or OBSERVATION and enter swap points.
- AC-014.2 Treasury checker approval is required before status update affects child orders.
- AC-014.3 Executed orders trigger NCBS unhold and overbook instruction.
- AC-014.4 Non-auto-settle result triggers notification to BSM/SSO for manual overbook.
- AC-014.5 Expired orders trigger NCBS unhold and customer/sales notification.
- AC-014.6 User can view ODA transaction status from OEMS and synced FP 8007 status.

Business rules:

- BR-014.1 Order remains in observation until executed, expired, or cancelled by valid process.
- BR-014.2 Execution updates must be idempotent per blotter group and child order.

Edge cases and error handling:

- EC-014.1 If NCBS overbook succeeds but Treasury sync fails, order is executed with integration exception requiring retry.
- FH-014.1 If checker rejects Treasury update, child orders retain prior status and maker receives comments.

## FR-015 ODA Calculation, Parameters, Notification, and Reports

Description: OEMS shall calculate ODA nominal order at submission, execution, and expiry; maintain ODA-specific parameters and validations; send ODA notifications; and provide ODA reports including Master/Recap Blotter, Summary/Recap, Sales Report, Treasury Summary Deal, Fund Release, Outstanding/Observation, transaction history, FP 8007 sync report, and exports.

User story: As Treasury and Branch Operations, I want complete ODA calculations, parameters, notifications, and reports so that order monitoring and execution are operationally controlled.

Acceptance criteria:

- AC-015.1 ODA nominal overbook amount is calculated from order amount and hit rate at submission, execution, and expiry.
- AC-015.2 ODA parameter setup covers sales certification, COT, order/effective types, currency pairing, minimum placement, minimum collective order, transaction type, reference rate, account type/code, and spread/rate.
- AC-015.3 ODA notification events include success/failure, cancellation due to minimum collective order, trade confirmation with password-protected PDF, and delivery failure tracking.
- AC-015.4 ODA reports listed in the description are available with filters and exports.
- AC-015.5 FP 8007 statuses are synchronized to OEMS transaction statuses.

Business rules:

- BR-015.1 Fund Release Report must distinguish unhold success and failure.
- BR-015.2 ODA transaction history over 90 days must identify whether data source is Core Banking or Big Data.

Edge cases and error handling:

- EC-015.1 Negative or zero calculated nominal amount is rejected.
- FH-015.1 Report generation failure creates a failed export job with visible error and no corrupt file link.

## FR-012A Blotter Deaggregation

Description: OEMS shall allow authorized users to remove one or more orders from a blotter group before treasury placement, with full lifecycle guards and audit trail.

User story: As a Treasury Dealer or Operations user, I want to remove orders from an aggregated blotter group so that incorrectly grouped or withdrawn orders do not proceed to placement.

Acceptance criteria:

- AC-012A.1 Deaggregation is allowed only when group lifecycle is SUMMARY_PENDING, COLLECTED, or SUMMARY_APPROVED.
- AC-012A.2 Deaggregation is rejected for groups in PLACED or EXECUTED status.
- AC-012A.3 Removed recommendations revert to lifecycle HELD with placement_group_id cleared.
- AC-012A.4 If all orders are removed, the group is cancelled (lifecycle → CANCELLED).
- AC-012A.5 Remaining group totals (total_nominal, average_rate, order_cost_before_swap) are recalculated.
- AC-012A.6 Minimum collective threshold is rechecked after removal; flag set if below threshold.
- AC-012A.7 A deaggregation event is recorded per removed recommendation with before/after state.
- AC-012A.8 Original total_nominal and order_count are preserved on first deaggregation.
- AC-012A.9 A reason (minimum 3 characters) is mandatory for each deaggregation action.

Business rules:

- BR-012A.1 Deaggregation log (jsonb) accumulates all removal events for group history.
- BR-012A.2 Integration message logged for audit on every deaggregation action.

Edge cases and error handling:

- EC-012A.1 Recommendation IDs not belonging to the group return 400 with specific invalid IDs.
- EC-012A.2 Empty recommendation list returns 400.
- FH-012A.1 Deaggregation on an already-cancelled group returns 409 ConflictError.

## FR-012B Partial Fulfillment — Proportionate Allocation

Description: OEMS shall support pro-rata allocation when treasury executes only a fraction of the blotter group total nominal, distributing fills proportionally across all member orders.

User story: As a Treasury Dealer, I want to proportionally allocate a partial fill across all orders in a group so that each customer receives a fair share of the executed amount.

Acceptance criteria:

- AC-012B.1 Allocation is allowed when group lifecycle is SUMMARY_APPROVED, PLACED, or TREASURY_UPDATE_PENDING.
- AC-012B.2 Executed amount must be > 0 and ≤ group total nominal.
- AC-012B.3 Each order receives: floor(proportion × executedAmount, 4dp).
- AC-012B.4 Last order absorbs remainder to ensure sum equals executed amount exactly.
- AC-012B.5 Orders with fill_status FULL or PARTIAL transition to lifecycle EXECUTED with nominal reduced to filled amount.
- AC-012B.6 Fund release (UNHOLD + OVERBOOK) uses filled_amount, not original nominal.
- AC-012B.7 Allocation log records per-recommendation detail with sequence number.

Business rules:

- BR-012B.1 proportion = order_nominal / group_total_nominal.
- BR-012B.2 Rounding uses floor to 4 decimal places; remainder on last order.

Edge cases and error handling:

- EC-012B.1 Single-order group with partial fill results in that order receiving the full executed amount.
- FH-012B.1 Executed amount exceeding total nominal returns 400.

## FR-012C Partial Fulfillment — FIFO Allocation

Description: OEMS shall support first-in-first-out allocation where orders are filled sequentially by creation time.

User story: As a Treasury Dealer, I want to fill orders in time priority so that earlier orders are satisfied first.

Acceptance criteria:

- AC-012C.1 Orders are processed in ascending created_at order.
- AC-012C.2 Each order is fully filled until executed amount is exhausted.
- AC-012C.3 The boundary order (where remaining < nominal) receives a partial fill.
- AC-012C.4 All subsequent orders receive fill_status UNFILLED and revert to lifecycle HELD.
- AC-012C.5 Unfilled orders have placement_group_id cleared for re-aggregation.

Business rules:

- BR-012C.1 FIFO sequence is determined by recommendation created_at timestamp.
- BR-012C.2 Partial boundary fill rounded to 4 decimal places.

## FR-012D Partial Fulfillment — Manual Allocation

Description: OEMS shall support dealer-specified allocation amounts for maximum operational flexibility.

User story: As a Treasury Dealer, I want to manually specify how much each order receives from a partial fill when business judgment requires non-formulaic distribution.

Acceptance criteria:

- AC-012D.1 Manual allocations array must be provided with recommendationId and filledAmount per entry.
- AC-012D.2 Sum of manual allocations must not exceed executed amount.
- AC-012D.3 Each individual allocation must not exceed its order nominal.
- AC-012D.4 Negative allocations are rejected.
- AC-012D.5 Orders not specified in manual allocations receive fill_status UNFILLED.
- AC-012D.6 Recommendation IDs must belong to the group.

Business rules:

- BR-012D.1 Manual allocation allows under-allocation (sum < executedAmount) for staged fills.

Edge cases and error handling:

- EC-012D.1 Duplicate recommendation IDs in allocations array uses the last entry.
- FH-012D.1 Invalid recommendation ID returns 400 with identification.

## FR-012E Blotter Aggregation Rules

Description: OEMS aggregation engine enforces 10 segregation policies when grouping ODA recommendations into blotter groups.

Acceptance criteria:

- AC-012E.1 Rule 1 (Same Rate) — orders must share identical rate for aggregation.
- AC-012E.2 Rule 2 (Same Currency Pair) — orders must share currency_pair.
- AC-012E.3 Rule 3 (Same Direction) — BUY and SELL cannot mix.
- AC-012E.4 Rule 4 (Same Tenor) — tenor_days must match.
- AC-012E.5 Rule 5 (Same Value Date) — value_date must match.
- AC-012E.6 Rule 6 (Same Effective Date) — effective_date must match.
- AC-012E.7 Rule 7 (Same Channel) — channel must match.
- AC-012E.8 Rule 8 (Same Customer Type) — INDIVIDUAL vs CORPORATE cannot mix.
- AC-012E.9 Rule 9 (Same ODA Type) — SINGLE vs RECURRING cannot mix.
- AC-012E.10 Rule 10 (Minimum Collective) — group must meet minimum_collective_amount threshold.

Business rules:

- BR-012E.1 Rules 1-9 are MANDATORY enforcement; violations prevent aggregation.
- BR-012E.2 Rule 10 is ADVISORY; below-threshold groups are flagged but allowed.
- BR-012E.3 Composite key for bucket assignment: (rate, currency_pair, direction, tenor_days, value_date, effective_date, channel, customer_type, oda_type).

## FR-016 MLD Offering Period Order Process

Description: OEMS shall support MLD product/tranche setup, sales offering with indicative term sheet, customer CIF check, customer detail display, mandatory document signing, digital MLD participation form, order submission, minimum term sheet amount validation, maximum 90-day average balance validation, balance sufficiency, hold funds, daily order recap, final master blotter, pre-trade-date 90-day average recheck, amendment, and cancellation before COT.

User story: As WM Operations and Sales/RM, I want a controlled MLD offering workflow so that customer participation is validated and compiled correctly before trade date.

Acceptance criteria:

- AC-016.1 Treasury/WM team can create MLD tranches with required option, date, rate, payout, minimum placement, and collective nominal parameters.
- AC-016.2 Sales can show indicative term sheet and create order during offering period.
- AC-016.3 CIF validation retrieves customer details from NCBS.
- AC-016.4 Mandatory documents include SKU, PFE, term sheet, product highlight sheet, risk profile questionnaire, and participation form.
- AC-016.5 Submission checks minimum placement and amount <= same-currency 90-day average balance.
- AC-016.6 Submission checks balance sufficiency and sends NCBS hold when sufficient.
- AC-016.7 Before trade date, OEMS rechecks all customers in the tranche for 90-day average balance.
- AC-016.8 Amendment and cancellation are allowed only before COT.

Business rules:

- BR-016.1 MLD trade date equals value date.
- BR-016.2 MLD fixing date equals maturity date.
- BR-016.3 Principal protection applies only if held until maturity.

Edge cases and error handling:

- EC-016.1 If customer balance becomes insufficient at pre-trade recheck, order is flagged for operations review and excluded from final master blotter until resolved.
- FH-016.1 If NCBS hold fails, MLD order cannot reach final master blotter.

## FR-017 MLD Trade Date, Fixing, Maturity, Notifications, and Reports

Description: On trade/value date, OEMS shall support SSO/BSM callback recording, TD creation instruction to NCBS, TD account retrieval, Treasury counterparty deal tracking, Treasury dealing ID retrieval, final term sheet/trade confirmation email, fixing/maturity status update, TD unhold, principal/interest/payout credit instructions, maturity and termination notifications, and MLD reports.

User story: As WM Operations, I want MLD trade, fixing, and maturity processing tracked in OEMS so that customer outcomes and downstream instructions are auditable.

Acceptance criteria:

- AC-017.1 Callback result can be recorded before TD creation instruction.
- AC-017.2 Confirmed MLD order sends create TD instruction to NCBS and stores TD account number.
- AC-017.3 Treasury dealing ID is retrieved or captured and added to final master blotter.
- AC-017.4 Fixing status update determines max-return or min-return outcome.
- AC-017.5 Maturity instruction credits principal plus minimum interest and bonus payout where max return applies; min return credits principal plus minimum interest.
- AC-017.6 MLD emails include final term sheet, trade confirmation, maturity confirmation with password-protected PDF, result confirmation, and termination confirmation where applicable.
- AC-017.7 MLD reports include recap blotter, confirmation letter delivery, transaction history, regulatory reporting, tax calculation, filtered detail, and exports.

Business rules:

- BR-017.1 Maturity payout must deduct tax according to active tax rules.
- BR-017.2 A tranche cannot move to MATURED until all child orders have a final outcome or exception.

Edge cases and error handling:

- EC-017.1 If NCBS TD creation succeeds but dealing ID retrieval fails, trade status becomes `TRADED_PENDING_DEALING_ID`.
- FH-017.1 Failed maturity credit instruction creates a critical operations exception and notification.

## FR-018 Mutual Funds and Bonds Order Capture and Handoff

Description: OEMS shall support order capture for mutual funds and bonds to existing Wealth Core systems, including SID registration/account opening, PFE registration, investment risk profiling, static data maintenance, create/reject/amend order, mutual fund subscription/redemption/switching/DRIP, bond buy/sell with cherry pick, switching with cherry pick, auction, buyback, validations, digital authentication, transaction history, reporting, and sales certification sync.

User story: As a Sales/RM, I want to capture mutual fund and bond orders in OEMS and pass them to Wealth Core so that customer instructions are digitally authorized and tracked.

Acceptance criteria:

- AC-018.1 OEMS supports SID and account portfolio registration for New To Investment customers.
- AC-018.2 OEMS supports PFE registration process initiation.
- AC-018.3 OEMS supports risk profile assessment before transaction.
- AC-018.4 OEMS can create, reject, and amend mutual fund and bond orders.
- AC-018.5 Mutual fund orders support subscription, full/partial redemption, full/partial switching, and DRIP.
- AC-018.6 Bond orders support buy/sell with cherry pick, switching with cherry pick, auction, and buyback.
- AC-018.7 Bond live pricing inquiry can lock rate and route in-range rates to supervisor approval and out-of-range rates to Treasury approval.
- AC-018.8 Customer confirms transaction through digital verification.
- AC-018.9 Captured orders are sent to RBS and/or Avantrade for further processing.
- AC-018.10 OEMS verifies sales certification status and sends certification registration/update to Wealth Core where related.

Business rules:

- BR-018.1 Product quota and offering period validations follow RBS/Avantrade product setup.
- BR-018.2 Static data mandatory in Core Banking must still be updated in Core Banking unless OEMS receives an approved write integration.

Edge cases and error handling:

- EC-018.1 If Wealth Core accepts a transaction but later rejects it, OEMS must sync rejected status with reason.
- FH-018.1 If digital verification expires, order remains pending and is not sent to Wealth Core.

## FR-019 Mutual Funds and Bonds Static Data and Product Performance

Description: OEMS shall retrieve customer data from RBS, Avantrade, and NCBS, maintain Wealth Core-required static data, assess risk profile, view customer static data, store SKU/PFE/transaction documents, display active product details, show past performance charts, and validate against Wealth Core product setup.

User story: As a Sales/RM, I want customer and product data available in OEMS so that I can complete wealth orders without switching systems for every check.

Acceptance criteria:

- AC-019.1 OEMS can retrieve customer static data from NCBS, RBS, and Avantrade.
- AC-019.2 OEMS can maintain static data required by RBS or Avantrade for existing wealth customers.
- AC-019.3 Customer documents such as SKU, PFE, and transaction documents can be stored and linked.
- AC-019.4 Active product list and details are visible in OEMS.
- AC-019.5 Product past performance chart supports configurable periods such as 1 month, 1 year, 3 years, and 5 years.
- AC-019.6 Product validation follows Wealth Core setup, including quota and offering period.

Business rules:

- BR-019.1 Static data source of truth is displayed per field.
- BR-019.2 Manual conflict resolution is required when external systems return different mandatory values.

Edge cases and error handling:

- EC-019.1 Missing product performance data displays no chart and disables performance-based claims; it does not block order unless product setup requires it.
- FH-019.1 Failed customer data retrieval blocks order entry and logs affected source.

## FR-020 FX Today Special Rate Transaction

Description: OEMS shall support e-form order input for FX Today Special Rate transactions using bank live exchange rate across IDR-FCY, FCY-IDR, and FCY-FCY. It shall retrieve customer CIF details, account balance, SKU and PFE tagging, support digital confirmation with countdown, fallback BSM/Head Teller verification, Treasury SND Sales approval for certain transaction types, TIWO/Trade Operation LHBU purpose-code checks, NCBS/Treasury flow, end-of-day finished status monitoring, validation, overbooking instruction, individual/corporate support, confirmation notice, FX transaction blotter, parameter setup, and underlying document trigger.

User story: As a Sales/RM, I want to capture FX Today Special Rate transactions with live-rate confirmation and required validations so that branch FX deals are digitally controlled.

Acceptance criteria:

- AC-020.1 FX homepage displays live rate for configured currency pairs.
- AC-020.2 Sales enters CIF and OEMS retrieves customer details, account balance, SKU, and PFE/non-PFE tagging.
- AC-020.3 Confirmation page displays countdown timer for customer rate confirmation.
- AC-020.4 Customer can authorize through digital verification.
- AC-020.5 If digital verification is not active, BSM/Head Teller verifies auto-settle cases and calls back customer for manual-settle cases.
- AC-020.6 Certain transaction types route to Treasury SND Sales approval.
- AC-020.7 TIWO/Trade Operation can confirm LHBU purpose code and settlement status.
- AC-020.8 Orders passing validation instruct NCBS to overbook.
- AC-020.9 FX transaction blotter and confirmation notice are generated.
- AC-020.10 Underlying document notification is shown for debit currency IDR and amount > USD 100,000 equivalent or configured regulatory amount.

Business rules:

- BR-020.1 Countdown expiry invalidates the quoted rate and requires refresh.
- BR-020.2 Max amount without underlying applies to FCY to IDR where debit currency is IDR as configured.

Edge cases and error handling:

- EC-020.1 If rate changes during confirmation, customer must reconfirm with refreshed rate.
- FH-020.1 Pending Settlement status at EOD triggers branch/teller alert and exception report.

## FR-021 Wealth Lending Phase-1 Registration and Mark-to-Market

Description: OEMS shall support phase-1 Wealth Lending by registering manually created facilities, loan information, collateral, daily market price retrieval for bonds and mutual funds, outstanding loan retrieval, mark-to-market calculation, collateral value versus loan limit monitoring, limit update instruction/reporting, D-Bank PRO and CRM/OEMS visibility, overdraft facility block instruction/reporting, repay or top-up calculation, unblocking after cure, and sell-collateral instruction on default.

User story: As Wealth Lending Operations, I want collateralized facilities monitored by market value so that margin breaches are detected, customers are notified, and credit limits are controlled.

Acceptance criteria:

- AC-021.1 User can register manually created loan facility and collateral used.
- AC-021.2 System retrieves daily market price data for bonds and mutual funds from RBS and Avantrade.
- AC-021.3 System retrieves outstanding loan facility amount from Loan System or Core Banking.
- AC-021.4 System calculates collateral market value, eligible collateral value, LTV, overdraft limit, and breach status.
- AC-021.5 System updates limit amount by direct instruction or generated report.
- AC-021.6 Customer can view overdraft limit in D-Bank PRO and Sales can view in OEMS/CRM microsite.
- AC-021.7 System blocks overdraft/credit facility by instruction or report if breach occurs.
- AC-021.8 System calculates repayment amount or collateral top-up amount and cure period based on configured collateral decrease percentage.
- AC-021.9 Repayment or collateral top-up triggers recalculation and facility unblocking if cured.
- AC-021.10 If not cured by period end, OEMS instructs RBS to sell collateral.

Business rules:

- BR-021.1 LTV, mark-to-market levels, notification rules, and cure periods are configurable.
- BR-021.2 Collateral product maturity must be considered in limit validation.

Edge cases and error handling:

- EC-021.1 If a collateral price is unavailable, the previous price can be used only if within configured stale tolerance; otherwise facility is flagged for manual review.
- FH-021.1 Sell-collateral instruction failure creates a critical exception and escalation notification.

## FR-022 Integration Services and API Exposure

Description: OEMS shall integrate with CRM, NCBS, D-Bank PRO, Middleware, Treasury System, RBS, Avantrade, Big Data, Reporting System, Document Management System, KSEI, notification gateways, PAM, LDAP, DNS, monitoring tools, and SIEM through secure APIs, adapters, queues, and reconciliation logs.

User story: As IT Operations, I want every external interaction tracked and retryable so that OEMS remains supportable under enterprise operations.

Acceptance criteria:

- AC-022.1 Every external call creates an integration message with correlation ID and status.
- AC-022.2 API endpoints follow a standardized error response format.
- AC-022.3 Integration failures are visible in operations dashboard with retry and dead-letter controls.
- AC-022.4 Interfaces use secure transport, encryption/decryption, and address filtering where applicable.
- AC-022.5 Active Directory or LDAP integration supports user ID management.

Business rules:

- BR-022.1 Idempotency keys are required for hold, unhold, debit, credit, overbook, TD creation, DMS registration, Wealth Core order handoff, and sell-collateral instructions.
- BR-022.2 Integration payloads containing financial or sensitive personal data must be classified and masked in logs.

Edge cases and error handling:

- EC-022.1 Duplicate external acknowledgement must not create duplicate business events.
- FH-022.1 Dead-letter messages require manual resolution comment before closure.

# 6. User Interface Requirements

## 6.1 Design System

- React applications shall use the existing Tailwind CSS and shadcn/Radix-style primitives in `packages/ui`.
- Tables, forms, dialogs, tabs, selects, checkboxes, switches, tooltips, badges, cards, toasts, and sheets must use shared primitives.
- Screens must be operational, dense, responsive, and suitable for repeated enterprise use.
- No feature page should be a marketing landing page.

## 6.2 Screens

| Screen | Purpose | Layout and Components | Navigation |
|---|---|---|---|
| OEMS Dashboard | Operational overview of orders, exceptions, integrations, notifications, and COT windows. | KPI strip, status charts, exception queue, COT calendar, integration health table. | Back-office operations and front-office dashboard links. |
| Product and Parameter Workbench | Create and approve product/parameter setup. | Versioned list, filter tabs by product family, detail form, approval drawer, audit tab. | Reference Data / Product Setup. |
| Order Capture | Product-specific e-form for ODA, MLD, MF/Bond, FX, and Wealth Lending registration. | Product selector, customer lookup, validation panel, document checklist, verification panel, review and submit. | Front-office New Order and CRM/D-Bank microsite entry. |
| ODA Blotter | Monitor ODA orders, grouping, collective order status, hold/unhold, Treasury updates. | Tabs for Transaction Blotter, Summary Blotter, Observation, Fund Release, Reports. | Operations / ODA Blotter. |
| MLD Tranche Workbench | Manage MLD tranche, offering, trade date, fixing, maturity. | Tranche list, tranche form, final master blotter, callback queue, maturity queue, reports. | Operations / MLD. |
| MF/Bond Order Desk | Capture and monitor mutual fund/bond orders and Wealth Core handoff. | Product search, live pricing, customer static data, risk profile, order ticket, handoff status. | Front-office and Operations. |
| FX Today Desk | Capture live-rate FX special transactions. | Live rate grid, CIF lookup, order ticket, countdown confirmation, underlying document uploader, FX blotter. | Front-office and Branch Ops. |
| Wealth Lending Monitor | Register facilities and monitor mark-to-market and breaches. | Facility list, collateral table, M2M run results, LTV scenario panel, notification history. | Back-office Wealth Lending. |
| Portfolio View | Combined customer holdings and performance. | Customer header, holdings table, charts, gain/loss, source freshness, export. | Client portal, RM client book, portfolio page. |
| Risk Profile Assessment | Questionnaire setup and customer assessment. | Questionnaire builder, scoring rules, assessment wizard, expiry report. | Risk Profiling. |
| Document Center | Checklist, document generation, upload, signing, NCBS/DMS registration. | Checklist table, document preview, upload dialog, signing status, integration log. | Order capture and customer detail. |
| Notification Operations | Template setup and delivery tracking. | Template list, delivery search, failed delivery report, retry action. | Operations / Notifications. |
| Integration Monitor | External calls, retries, reconciliation, dead letters. | Searchable table, payload metadata, retry controls, SLA badges. | IT Operations. |
| Report Builder / Report Catalogue | Generate and export all report types. | Report catalogue, filters, export jobs, schedule settings. | Reports. |

## 6.3 Responsive Behavior

- Microsite screens must support mobile viewport without horizontal scrolling.
- Operational tables may use horizontal scrolling with sticky headers and visible filters.
- Form sections collapse into an accordion on mobile.
- Countdown, validation status, document status, and primary submit actions remain visible in the review step.

# 7. API and Integration Requirements

## 7.1 Authentication

- Internal APIs use existing JWT/session authentication and RBAC.
- Microsite APIs require signed channel context, CSRF protection where browser sessions apply, and correlation ID.
- External callbacks require mTLS or signed webhook tokens depending on integration.

## 7.2 Standard Error Response

All endpoints return errors in this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Minimum placement amount is not met",
    "field": "amount",
    "details": {
      "minimum": 25000,
      "currency": "USD"
    },
    "correlation_id": "req-20260504-001"
  }
}
```

## 7.3 Internal API Endpoints

| Method | Path | Purpose | Key Errors |
|---|---|---|---|
| GET | `/api/v1/oems/products` | List active product catalogue and pricing summaries. | FORBIDDEN, SOURCE_UNAVAILABLE |
| POST | `/api/v1/oems/products` | Create product setup draft. | VALIDATION_ERROR, DUPLICATE_PRODUCT |
| POST | `/api/v1/oems/parameters` | Create parameter-set draft. | VALIDATION_ERROR, OVERLAPPING_EFFECTIVE_WINDOW |
| POST | `/api/v1/oems/parameters/{id}/submit` | Submit parameter for checker. | INVALID_STATUS |
| POST | `/api/v1/oems/parameters/{id}/approve` | Approve parameter. | MAKER_CANNOT_APPROVE |
| GET | `/api/v1/oems/orders` | List wealth orders. | FORBIDDEN |
| POST | `/api/v1/oems/orders` | Create order draft. | VALIDATION_ERROR |
| POST | `/api/v1/oems/orders/{id}/validate` | Run validations. | EXTERNAL_VALIDATION_FAILED |
| POST | `/api/v1/oems/orders/{id}/submit` | Submit order. | HARD_VALIDATION_FAILED, AFTER_CUTOFF |
| POST | `/api/v1/oems/orders/{id}/amend` | Amend before COT. | AFTER_CUTOFF, INVALID_STATUS |
| POST | `/api/v1/oems/orders/{id}/cancel` | Cancel before COT. | AFTER_CUTOFF, INVALID_STATUS |
| POST | `/api/v1/oems/orders/{id}/verify` | Create customer verification request. | DOCUMENT_CHANGED |
| GET | `/api/v1/oems/oda/blotter` | ODA transaction blotter. | FORBIDDEN |
| GET | `/api/v1/oems/oda/summary` | ODA summary blotter groups. | FORBIDDEN |
| POST | `/api/v1/oems/oda/cutoff-run` | Run COT grouping. | CALENDAR_NOT_CONFIGURED |
| POST | `/api/v1/oems/oda/summary/{id}/treasury-update` | Treasury maker updates status/swap points. | INVALID_STATUS |
| POST | `/api/v1/oems/oda/summary/{id}/approve` | Treasury checker approves update. | MAKER_CANNOT_APPROVE |
| GET | `/api/v1/oems/mld/tranches` | List MLD tranches. | FORBIDDEN |
| POST | `/api/v1/oems/mld/tranches` | Create MLD tranche draft. | VALIDATION_ERROR |
| POST | `/api/v1/oems/mld/tranches/{id}/pretrade-recheck` | Recheck 90-day average. | SOURCE_UNAVAILABLE |
| POST | `/api/v1/oems/mld/orders/{id}/callback` | Record callback result. | INVALID_STATUS |
| POST | `/api/v1/oems/mld/orders/{id}/trade` | Create TD and store dealing ID. | NCBS_FAILED |
| POST | `/api/v1/oems/mld/orders/{id}/maturity` | Process maturity result. | TAX_CALC_FAILED, NCBS_FAILED |
| POST | `/api/v1/oems/mf-bond/orders` | Create MF/Bond order. | RISK_PROFILE_EXPIRED |
| POST | `/api/v1/oems/fx/orders` | Create FX Today order. | RATE_EXPIRED, UNDERLYING_REQUIRED |
| GET | `/api/v1/oems/wealth-lending/facilities` | List facilities. | FORBIDDEN |
| POST | `/api/v1/oems/wealth-lending/facilities` | Register manual facility. | VALIDATION_ERROR |
| POST | `/api/v1/oems/wealth-lending/m2m-runs` | Run mark-to-market. | PRICE_SOURCE_UNAVAILABLE |
| GET | `/api/v1/oems/reports/{code}` | Report preview. | REPORT_NOT_FOUND |
| POST | `/api/v1/oems/reports/{code}/exports` | Start export job. | UNSUPPORTED_FORMAT |
| GET | `/api/v1/oems/integration-messages` | Monitor integrations. | FORBIDDEN |
| POST | `/api/v1/oems/integration-messages/{id}/retry` | Retry integration. | INVALID_STATUS |

## 7.4 Request and Response Examples

### Create ODA Order

Request:

```json
{
  "product_family": "ODA",
  "product_id": "PROD-ODA-USDIDR",
  "customer_id": "CUST-10001",
  "channel": "OEMS",
  "branch_code": "JKT-001",
  "assisted_by_user_id": "U-RM-01",
  "order_type": "SINGLE",
  "effective_type": "GOOD_TILL_DATE_TIME",
  "direction": "BUY_BASE",
  "currency_pair": "USD/IDR",
  "amount": "150000",
  "currency": "USD",
  "target_rate": "16200",
  "debit_account_no": "0012345678",
  "expiry_at": "2026-05-05T15:00:00+07:00",
  "recommendation_id": "REC-ODA-001"
}
```

Success response:

```json
{
  "data": {
    "order_id": "WO-20260504-0001",
    "order_status": "DRAFT",
    "validation_summary": {
      "hard_failures": 0,
      "soft_warnings": 1,
      "pending_external": 0
    },
    "correlation_id": "req-20260504-001"
  }
}
```

### Run ODA Cut-Off Grouping

Request:

```json
{
  "business_date": "2026-05-04",
  "product_id": "PROD-ODA-USDIDR",
  "cutoff_code": "ODA-GTD-1500"
}
```

Success response:

```json
{
  "data": {
    "run_id": "ODA-COT-20260504-001",
    "groups_created": 2,
    "orders_cancelled": 3,
    "orders_placed_in_summary": 14,
    "fund_release_messages": 3
  }
}
```

### Create MLD Tranche

Request:

```json
{
  "product_id": "PROD-MLD-USD-1M",
  "tranche_code": "MLD-USD-202605-1M",
  "offer_start_at": "2026-05-04T09:00:00+07:00",
  "offer_end_at": "2026-05-10T15:00:00+07:00",
  "trade_date": "2026-05-13",
  "value_date": "2026-05-13",
  "fixing_date": "2026-06-13",
  "maturity_date": "2026-06-13",
  "placement_currency": "USD",
  "underlying_reference": "USD/IDR",
  "option_type": "ONE_TOUCH",
  "option_style": "EUROPEAN",
  "upper_limit": "16400",
  "lower_limit": "15800",
  "minimum_interest_rate_pa": "2.000000",
  "max_interest_rate_pa": "8.000000",
  "bonus_payout_pa": "6.000000",
  "minimum_placement": "25000",
  "minimum_collective_nominal": "500000",
  "early_termination_allowed": false
}
```

Success response:

```json
{
  "data": {
    "tranche_id": "MLD-TR-001",
    "status": "DRAFT",
    "version_no": 1
  }
}
```

### Run Wealth Lending Mark-to-Market

Request:

```json
{
  "business_date": "2026-05-04",
  "facility_ids": ["WLF-001"],
  "price_source": "WEALTH_CORE"
}
```

Success response:

```json
{
  "data": {
    "run_id": "WLM2M-20260504-001",
    "facilities_processed": 1,
    "breaches_detected": 0,
    "notifications_queued": 0
  }
}
```

## 7.5 External Integration Events

| System | Direction | Events |
|---|---|---|
| NCBS/Core Banking | Send/Receive | CIF validation, account status, available balance, hold, unhold, debit, credit, overbook, create TD, retrieve TD number, PFE registration, FP 8007 sync, CIM13 document registration. |
| Treasury System | Send/Receive | ODA reference rate, ODA placement status, MLD dealing ID, MLD option result, FX approval/status. |
| RBS | Send/Receive | Bonds product setup, live price, SID/risk profile, order handoff, sales certification sync, collateral sale instruction. |
| Avantrade | Send/Receive | Mutual fund product setup, NAV/performance, account portfolio, risk profile, order handoff, sales certification sync. |
| CRM | Send/Receive | Microsite launch context, order status, transaction history, customer portfolio/performance, leads status. |
| D-Bank PRO | Send/Receive | Microsite launch context, customer authorization, self-service orders, in-app notifications, overdraft limit display. |
| Big Data | Receive | Transaction history older than 90 days, analytics datasets. |
| Reporting System | Send | Report extracts and regulatory datasets. |
| DMS | Send/Receive | Document upload, registration, retrieval, signed document storage. |
| KSEI | Send/Receive | External securities/investor data exchange where required. |
| Notification Gateways | Send/Receive | Email, SMS, and delivery status callbacks. |

## 7.6 Rate Limiting

- Interactive authenticated user APIs: 600 requests per minute per session, inherited from platform default unless stricter channel limits are configured.
- External callbacks: per-partner limit configurable by integration profile.
- Export APIs: 20 export requests per user per hour unless elevated by role.

# 8. Non-Functional Requirements

## 8.1 Performance

- 95th percentile interactive screen reads under 2 seconds excluding external-system latency.
- 95th percentile order submission under 5 seconds excluding external-system latency.
- ODA COT grouping must process 10,000 orders in under 5 minutes in production sizing.
- Report exports over 10,000 rows must run asynchronously.

## 8.2 Security

- All APIs require authentication and role-based authorization.
- Interfaces use TLS/mTLS or signed requests as required by partner profile.
- Sensitive data is encrypted in transit and at rest.
- Audit and transaction logs are read-only to business users and protected from update/delete.
- System integrates with LDAP/Active Directory for user ID management.
- System logs security admin actions, system admin actions, access, create, update, export, approval, rejection, and integration retry actions.
- OWASP controls apply for input validation, output encoding, CSRF, session security, rate limiting, and security headers.

## 8.3 Scalability and Capacity

- Architecture must support DEV, SIT, UAT, PT/pre-production, production, DRC, and reporting environments.
- Infrastructure sizing must support 5-year projected NOT, NOC/NOA, and internal user growth.
- API, worker, and reporting workloads should be horizontally scalable.

## 8.4 Availability and Resilience

- Production uptime target: 99.9% monthly excluding planned maintenance.
- Critical external instructions require retry, dead-letter, and reconciliation status.
- DRC deployment must support bank-defined RPO/RTO.
- Degraded mode must surface unavailable pricing, core banking, wealth core, notification, or reporting services.

## 8.5 Backup and Recovery

- Transactional database backup at least daily full backup plus point-in-time recovery where supported.
- RPO target: 15 minutes for production transaction data.
- RTO target: 4 hours for production service restoration unless Bank Danamon specifies stricter DRC objective.

## 8.6 Accessibility

- Internal web UI and microsites must meet WCAG 2.1 AA for forms, navigation, color contrast, keyboard use, focus management, and screen-reader labels.

## 8.7 Browser and Device Support

- Latest two stable versions of Chrome, Edge, Safari, and Firefox.
- D-Bank PRO microsite must support mobile webviews approved by the channel team.

## 8.8 Internationalization

- UI labels, validation messages, notifications, and document templates support EN and ID.
- User language preference drives default display language.

## 8.9 Observability

- All API requests have correlation ID.
- External calls, retries, dead letters, report jobs, notifications, and worker jobs emit structured logs.
- Monitoring integration supports SolarWinds and Elastic SIEM or configured equivalent.

# 9. Workflow and State Diagrams

## 9.1 Generic Order Workflow

| Current State | Action | Next State | Trigger | Side Effects |
|---|---|---|---|---|
| DRAFT | Save order | DRAFT | User | Audit create/update. |
| DRAFT | Submit | PENDING_VALIDATION | User | Run validations. |
| PENDING_VALIDATION | Hard fail | VALIDATION_FAILED | System | Store validation results and notify user. |
| PENDING_VALIDATION | Pass | PENDING_CUSTOMER_VERIFICATION or PENDING_BSM_APPROVAL | System | Create verification or approval task. |
| PENDING_CUSTOMER_VERIFICATION | Customer verifies | AUTHORIZED | Customer | Store verification evidence. |
| PENDING_BSM_APPROVAL | BSM approves | AUTHORIZED | BSM | Store approval evidence. |
| AUTHORIZED | Hold funds required | HELD | System/NCBS | Send hold instruction. |
| HELD | Product collection | COLLECTED | System | Add to blotter/recap. |
| COLLECTED | Place | PLACED | System/Treasury/Wealth Core | Send downstream handoff. |
| PLACED | Execute | EXECUTED | External/system | Send notification and reports. |
| PLACED/OBSERVATION | Expire | EXPIRED | System/Treasury | Unhold and notify. |
| Any pre-COT allowed | Cancel | CANCELLED | User/System | Unhold if held, notify, audit. |
| Executed product matures | Maturity | MATURED | System/Operations | Credit payout and notify. |

## 9.2 ODA Workflow

| Current State | Action | Next State | Side Effects |
|---|---|---|---|
| DRAFT | Submit ODA | PENDING_VALIDATION | Validate CIF, balance, SKU, PFE, currency pair, rate, min amount, COT. |
| PENDING_VALIDATION | Pass | PENDING_CUSTOMER_VERIFICATION or PENDING_BSM_APPROVAL | Create verification/approval task. |
| AUTHORIZED | Hold funds | HELD | NCBS hold instruction. |
| HELD | Record blotter | COLLECTED | Add to ODA transaction blotter. |
| COLLECTED | COT group meets minimum | PLACED | Add to Summary Blotter. |
| COLLECTED | COT group not met | CANCELLED | NCBS unhold and cancellation notifications. |
| PLACED | Treasury update observation | OBSERVATION | Continue monitoring. |
| OBSERVATION/PLACED | Treasury update executed approved | EXECUTED | NCBS unhold, overbook, FP 8007 sync, notifications. |
| OBSERVATION/PLACED | Treasury update expired approved | EXPIRED | NCBS unhold and expiration notifications. |

## 9.3 MLD Workflow

| Current State | Action | Next State | Side Effects |
|---|---|---|---|
| DRAFT_TRANCHE | Submit tranche | PENDING_APPROVAL | Checker task. |
| PENDING_APPROVAL | Approve tranche | OFFERING | Publish product/term sheet. |
| DRAFT_ORDER | Submit order | PENDING_VALIDATION | Check CIF, docs, min placement, 90-day avg balance, available balance. |
| PENDING_VALIDATION | Pass | PENDING_CUSTOMER_VERIFICATION | Generate participation form verification. |
| AUTHORIZED | Hold funds | HELD | NCBS hold and final master blotter entry. |
| HELD | Pretrade recheck pass | READY_FOR_TRADE | Confirm 90-day average still valid. |
| READY_FOR_TRADE | Customer callback confirmed | TRADED | NCBS create TD and Treasury dealing ID. |
| TRADED | Fixing outcome max return | FIXED_MAX_RETURN | Store outcome. |
| TRADED | Fixing outcome min return | FIXED_MIN_RETURN | Store outcome. |
| FIXED_* | Maturity process | MATURED | Credit principal, interest, payout/tax, notify customer. |
| Any pre-COT allowed | Cancel/amend | CANCELLED/DRAFT | Audit, unhold if required. |

## 9.4 Wealth Lending Mark-to-Market Workflow

| Current State | Action | Next State | Side Effects |
|---|---|---|---|
| REGISTERED | Run M2M | ACTIVE | Retrieve prices/outstanding and calculate limit. |
| ACTIVE | Breach detected | BREACHED | Notify customer/sales, calculate repay/top-up, optionally block overdraft. |
| BREACHED | Customer repays | ACTIVE | Recalculate and unblock if cured. |
| BREACHED | Customer tops up collateral | ACTIVE | Bind collateral, recalculate, unblock if cured. |
| BREACHED | Cure period expires | DEFAULTED | Instruct RBS to sell collateral and notify. |
| ACTIVE | Facility expiry near | ACTIVE | Send expiry warning. |

# 10. Notification and Communication Requirements

| Event | Channel | Recipient | Trigger | Template Summary | Opt-Out |
|---|---|---|---|---|---|
| Order submitted | Email, in-app | Customer, Sales, BSM as applicable | Order submission | Order number, product, amount, next action. | No |
| Verification reminder | Email, SMS, D-Bank PRO | Customer | Pending verification before expiry | Link/token reminder and expiry time. | No |
| ODA collective order not met | Email, SMS/in-app | Customer, Sales, BSM | COT grouping not met | Order cancelled and funds release status. | No |
| ODA executed | Email, SMS/in-app | Customer, Sales, BSM | Treasury execution approval | Trade confirmation and PDF attachment if configured. | No |
| ODA expired | Email, SMS/in-app | Customer, Sales, BSM | Treasury expiry approval | Expiry status and fund release status. | No |
| MLD callback required | Email, in-app | Branch Ops/BSM | Trade date callback queue | Customer, tranche, action due. | No |
| MLD final term sheet | Email | Customer | Trade confirmed | Final term sheet and trade confirmation. | No |
| MLD maturity result | Email | Customer | Maturity processed | Principal/return credited and password-protected PDF. | No |
| MF/Bond Wealth Core rejected | Email, in-app | Sales, Branch Ops | External rejection sync | Rejection reason and repair steps. | No |
| FX rate confirmation | D-Bank PRO/auth link | Customer | FX order confirmation | Rate, countdown expiry, amount. | No |
| FX underlying required | In-app, email | Sales, Customer | Threshold breached | Required underlying document details. | No |
| Wealth Lending limit changed | Email, D-Bank PRO, in-app | Customer, Sales | M2M limit update | New limit and reason. | No |
| Wealth Lending breach | Email, SMS, D-Bank PRO, in-app | Customer, Sales | LTV breach | Repay/top-up amount and cure deadline. | No |
| Facility near expiry | Email, D-Bank PRO, in-app | Customer, Sales | Configured days before expiry | Expiry date and next steps. | Configurable for non-critical reminders only |
| Integration dead letter | In-app, email | IT Ops | Retry exhausted | System, message type, business key. | No |

# 11. Reporting and Analytics

| Report | Audience | Data Sources | Filters | Refresh |
|---|---|---|---|---|
| FX Transaction Blotter | Branch Ops, Treasury, Audit | OEMS, NCBS, Treasury | Date, customer, status, branch, currency, channel | Near real-time |
| ODA Master / Recap Blotter | Treasury, WM Ops | OEMS ODA orders | Date, currency pair, rate, type, status | On demand/COT |
| ODA Summary & Recap | Treasury Sales | ODA groups | Direction, pair, rate, COT date | COT and on demand |
| ODA Sales Report | Sales leaders | ODA orders/leads | Sales, branch, customer, status | Daily |
| Treasury Summary Deal Report | Treasury Sales | ODA summary groups | COT date, pair, status | COT |
| ODA Fund Release Report | Branch Ops | NCBS unhold integration | Date, success/failure, customer | Near real-time |
| ODA Outstanding / Observation | Treasury, Branch Ops | ODA summary/order status | Pair, expiry, branch, sales | Near real-time |
| MLD Master / Recap Blotter | WM Ops, Treasury, TIWO | MLD tranches/orders | Tranche, customer, currency, status | Daily/trade date |
| MLD Confirmation Delivery | WM Ops | Notification delivery | Tranche, customer, status | Near real-time |
| MLD Transaction History | WM Ops, Audit | OEMS, NCBS, Big Data | CIF, dates, currency, tranche | On demand |
| MLD Regulatory Reporting | Compliance | OEMS, NCBS, Tax | Regulatory period, product | Periodic |
| MLD Tax Calculation | Tax/WM Ops | MLD outcomes, tax rules | Tranche, customer | Maturity |
| Mutual Fund Transaction Report | Sales, WM Ops | OEMS, Avantrade | Product, customer, status | Near real-time |
| Bonds Transaction Report | Sales, Treasury | OEMS, RBS | Bond, price, approval, status | Near real-time |
| FX Today Blotter | Branch, Treasury, TIWO | OEMS, NCBS, Treasury | Status, pair, amount, purpose code | Near real-time |
| Wealth Lending Report | Wealth Lending Ops | Facility, collateral, M2M | Breach, expiry, customer | Daily |
| Portfolio Performance | Customer, Sales | OEMS, NCBS, RBS, Avantrade | Customer, product, date | Daily/near real-time |
| Risk Profile Report | Risk/Compliance | Risk assessments, Wealth Core | Status, expiry, profile | Daily |
| Audit Log Report | Audit | Audit log | User, action, entity, date | Near real-time |
| Leads Status Report | Sales leaders, CRM | CRM/OEMS | Lead, campaign, order result | Daily |
| Static Data Report | Ops/Admin | Product/customer/static data | Entity, status | On demand |
| Transaction Fee Report | Finance | Orders, fee/tax data | Product, date, branch | Daily/monthly |

# 12. Migration and Launch Plan

## 12.1 Migration Needs

- Import existing product setup for in-scope wealth products from RBS, Avantrade, Treasury, NCBS, and current spreadsheets where available.
- Import sales certification records and sync with Wealth Core where applicable.
- Load branch, user, customer, CIF, portfolio, document, risk profile, and calendar reference data.
- Map current ODA spreadsheet blotter fields to OEMS ODA blotter model for open orders, if rollout starts while manual process has open orders.
- Load MLD open tranches and active participation orders if any exist at cutover.

## 12.2 Phased Rollout

| Release | Scope |
|---|---|
| Release 1 | General data integration, document registration, e-form for ODA and MLD, notifications, sales certification for ODA/MLD, ODA order taking, ODA product management, ODA order collection/placement, ODA reporting, MLD order taking, MLD product management, MLD reporting. |
| Release 2 | Combined portfolio, digital verification, e-forms and notifications for FX, bonds, mutual funds, sales certification for FX/bonds/MF, MF/Bond order taking, SID/risk profiling, FX transaction order taking. |
| Release 3 | Wealth Lending phase 1, ODA end-to-end observation/execution, ODA calculation, expanded ODA parameters/validation, ODA notifications. |

## 12.3 Go-Live Checklist

- All P0/P1 functional tests passed in SIT and UAT.
- All severity 1 and severity 2 defects closed.
- Security assessment and vulnerability findings remediated or accepted by risk.
- DR readiness and backup/restore verified.
- Integration endpoints, certificates, allowlists, and credentials configured.
- Data migration reconciled and signed off.
- Role/permission matrix loaded and verified.
- Operational runbooks, support contacts, and war-room procedure available.
- Training completed for Sales, Branch Ops, Treasury, WM Ops, Product Admins, IT Ops, and Audit.

# 13. Glossary

| Term | Definition |
|---|---|
| OEMS | Order Execution Management System for wealth products. |
| ODA | FX Leave Order facility for foreign exchange orders after domestic market close. |
| MLD | Market Linked Deposit, a structured product combining deposit and currency option exposure. |
| D-Bank PRO | Bank Danamon digital banking channel for customer self-service. |
| CRM Microsite | OEMS embedded context launched from CRM for sales-assisted transactions. |
| NCBS | Core Banking System used for CIF, account, hold/unhold, debit/credit, overbook, PFE, FP 8007, and document registration functions. |
| RBS | Retail Bond System / Wealth Core system for bonds. |
| Avantrade | Mutual Fund Wealth Core system. |
| PFE | Phone, Fax, or Email facility. |
| SKU | General terms and conditions document. |
| BSM | Branch Sales Manager. |
| SSO | Branch operation role handling operational inputs. |
| TIWO | Operations role for time deposit and structured product processing. |
| COT | Cut-off time. |
| SID | Investor identity for capital market/securities products. |
| KSEI | Indonesian Central Securities Depository. |
| LHBU | Regulatory purpose/reporting code context for FX transactions. |
| LTV | Loan to value. |
| Mark-to-Market | Daily valuation of collateral against market prices. |
| Maker-Checker | Dual control workflow where creator and approver are separate users. |
| FP 8007 | NCBS menu/status context referenced for FX Leave Order transaction synchronization. |

# 14. Appendices

## 14.1 Release Priority from RFP

1. FX Leave Order (ODA)
2. Structured Product - Market Linked Deposit (MLD)
3. Mutual Funds and Bonds
4. FX Transactions
5. Wealth Lending

## 14.2 Quality Checklist

- Every functional module from RFP section 4.2 is represented in Section 5.
- Every product family mentioned in functional requirements has data model coverage.
- Every major workflow has states and transitions.
- Every major API family has endpoint coverage and standard error response.
- Notifications, reports, risk, documents, digital verification, audit, and integrations are explicitly specified.
