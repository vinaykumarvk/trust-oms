# Margin Lending Business Requirements Document v1

Document status: Draft for implementation  
Source document: `docs/WQ_Margin Lending_V1.0_CCV.1.0.docx`  
Generated date: 2026-05-04  
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

## 1.1 Project Name

Margin Lending and Portfolio Leverage Management.

## 1.2 Project Description

The Margin Lending module supports wealth and private-banking operations for defining loanable-value rules, maintaining exposure limits, applying cross-currency haircuts, grouping facilities, linking portfolios including cross-pledged portfolios, calculating credit views, monitoring margin-call and sell-out breaches, running EOD margin processes, simulating collateral/exposure changes, and producing operational reports. The module must be maker-checker controlled, auditable, role-based, and integrated with customer, portfolio, security, pricing, FX, product-processor, and notification services.

## 1.3 Business Objectives

- Provide a governed back-office module for margin lending maintenance, transactions, EOD, simulation, and reporting.
- Ensure only authorized loanable-value, exposure, concentration, and haircut definitions are used for credit and margin calculations.
- Detect margin-call and sell-out conditions at portfolio and security level after EOD or on-demand recalculation.
- Support customer/facility exposure management through facility groups, facility records, portfolio linking, and cross pledge.
- Provide traceable advice generation, deferral, due/manual-closure updates, and maker-checker authorization for margin-call processes.

## 1.4 Target Users and Pain Points

| User | Pain Point |
|---|---|
| Operations Maker | Needs a single workspace to maintain rules, create facility groups, link portfolios, run EOD, and prepare margin-call updates. |
| Operations Checker | Needs clear pending queues and immutable maker/checker separation before records become effective. |
| Relationship Manager | Needs fast credit view and leveraged client view to understand client LTV, exposure, drawing power, and margin-call status. |
| Risk / Credit Officer | Needs concentration, exposure, haircut, and margin-call evidence by customer, security, issuer, currency, and portfolio. |
| System Operator | Needs repeatable EOD jobs, job status, error details, and rerun evidence. |
| Auditor | Needs full audit trail of Add, Modify, Authorize, Reject, Delete, Margin Call, EOD, and Simulation actions. |

## 1.5 Success Metrics

| KPI | Target |
|---|---:|
| Authorized maintenance rules used in calculations | 100% of credit and EOD calculations |
| Maker-checker self-approval violations | 0 |
| EOD margin-call process completion | 99% before configured business cutoff |
| Margin-call advice traceability | 100% of generated cases have advice reference and audit event |
| Credit-view response time | p95 under 2 seconds for 500 linked holdings |
| Audit completeness | 100% of add/modify/authorize/reject/delete/process actions logged |

# 2. Scope and Boundaries

## 2.1 In Scope

- Generic maintenance for Deposits, Fixed Income, Funds, Others, References, and Scrip Settings.
- Exposure maintenance for asset/sub-asset, currency, customer nationality/residency, and security combinations.
- Cross-currency haircut maintenance with buffer, volatility, and computed haircut percentage.
- Facility group creation, modification, deletion, authorization, and customer-level exposure tracking.
- Facility view for asset/sub-asset exposure limits imported or synchronized from product processors.
- Portfolio linking to facility groups, including many-to-many portfolio/facility combinations.
- Cross-pledge linking of another customer base portfolio to a facility group.
- Credit view with Base, Facility, Exposure, GCMV, NCMV, Top Up, Sell Out, Market Value, Status, linked portfolios, and holding details.
- Asset settings for customer-security level LTV, top-up, sell-out, security concentration, and issuer concentration overrides.
- Margin-call process at portfolio and security level, including advice generation, deferral, due/manual closure, history, and authorization.
- EOD execution for LTV logic refresh and margin-call process refresh.
- Margin simulation for assets, exposures, GCMV, and credit-view before/after comparison.
- Reports: product details, audit trail, list of facilities, margin-call portfolio, margin-call security, rating maintenance, and leveraged client view.
- Role-based access control, maker-checker, audit trail, notifications, and CSV report export.

## 2.2 Out of Scope

- Core loan origination, loan documentation, and disbursement workflow outside margin lending.
- Native mobile application changes; this BRD covers responsive back-office and API behavior.
- Replacement of upstream product processor, portfolio accounting, market data, FX, or security master systems.
- Legal agreement generation beyond margin-call advice/reference metadata.
- Regulatory capital calculations not directly required for margin lending operational monitoring.

## 2.3 Assumptions

- Customer, base, portfolio, holding, security master, rating, product processor, market price, and FX rate data already exist or are retrievable through existing integration services.
- Margin Lending uses the platform authentication, role guard, audit, and database infrastructure.
- Authorized maintenance records are effective-dated and only one active record may apply to a given rule scope at calculation time.
- Percentage values are stored as decimal percentages from 0 to 100, not ratios from 0 to 1.
- Currency codes use ISO 4217 format.

## 2.4 Constraints

- All maintenance and transaction records must follow maker-checker; maker and checker must be different users.
- Authorized records cannot be physically deleted; deletion is soft-delete and unavailable for authorized records unless an explicit retirement flow is added.
- EOD jobs must be idempotent per business date and job type.
- Sensitive customer/facility values must be masked in logs unless the user has explicit permission.
- All APIs must use authenticated sessions and standardized error responses.

# 3. User Roles and Permissions

| Role | Read Permissions | Write Permissions | Explicit Denials |
|---|---|---|---|
| ML Operations Maker | View all ML maintenance, transactions, margin-call cases, EOD runs, simulations, and reports. | Add/modify/delete draft or unauthorized maintenance, facility groups, portfolio links, cross pledges, asset settings, margin-call updates, EOD run requests, simulations. | Cannot authorize own records; cannot delete authorized records; cannot change audit events. |
| ML Operations Checker | View pending authorization queues and full record details. | Authorize or reject maintenance, facility groups, portfolio links, cross pledges, asset settings, and margin-call updates. | Cannot modify maker fields during approval; cannot authorize records made by self. |
| Relationship Manager | View credit view, leveraged client view, linked portfolios, margin-call status for assigned customers. | Run simulations for assigned customers; add comments where permitted. | Cannot maintain global rules, run EOD, or authorize records. |
| Risk / Credit Officer | View exposure, concentration, asset settings, margin-call and sell-out reports. | Enter risk review comments; export reports. | Cannot change operational records unless also assigned maker/checker role. |
| System Operator | View and run EOD jobs; view job failures and rerun evidence. | Start EOD jobs, mark technical rerun notes. | Cannot change financial parameters or authorize business records. |
| Auditor | View all records, audit trail, and reports. | Export audit evidence. | Cannot create, modify, authorize, reject, delete, or run EOD jobs. |
| System Administrator | View configuration and user-role mappings. | Manage role access and integration configuration. | Cannot bypass maker-checker for business records. |

# 4. Data Model

All entities include audit fields unless explicitly stated: `created_at`, `created_by`, `updated_at`, `updated_by`, `version`, `status`, `is_deleted`, `tenant_id`, `correlation_id`, and `audit_hash`.

## 4.1 ML Attribute Setting

Defines LTV, top-up, and sell-out values at asset/sub-asset attribute level.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| setting_id | string | Y | Unique, prefix `ML-AS-`. |
| maintenance_type | enum | Y | `DEPOSIT_ATTRIBUTE`, `FIXED_INCOME_ATTRIBUTE`, `FUND_ATTRIBUTE`, `OTHER_ATTRIBUTE`. |
| definition_type | string | Y | Bank-defined definition category. |
| asset_class | string | N | Security asset class. |
| sub_asset_classes | string[] | N | Multi-select. |
| currencies | string[] | N | ISO 4217 list. |
| industry_codes | string[] | N | Fixed income only. |
| market_groups | string[] | N | Fixed income only. |
| security_domiciles | string[] | N | Fixed income only. |
| security_issuers | string[] | N | Fixed income only. |
| rating_agencies | string[] | N | Fixed income only. |
| ratings | string[] | N | Fixed income only. |
| residual_tenors | string[] | N | Fixed income/deposit rules. |
| issuer_categories | string[] | N | Fixed income only. |
| capital_protection | enum | N | `YES`, `NO`, `PARTIAL`. |
| fund_domiciles | string[] | N | Funds only. |
| security_risk_profiles | string[] | N | Funds only. |
| fund_houses | string[] | N | Funds only. |
| ltv_percent | decimal | Y | 0 to 100. |
| top_up_percent | decimal | Y | 0 to 100 and must be greater than or equal to LTV trigger policy. |
| sell_out_percent | decimal | Y | 0 to 100 and must be greater than top-up percent. |
| record_status | enum | Y | `DRAFT`, `UNAUTHORIZED`, `AUTHORIZED`, `REJECTED`, `MODIFIED`; default `DRAFT`. |
| effective_from | date | Y | Business date. |
| effective_to | date | N | Must be after effective_from. |

Sample data:

| setting_id | maintenance_type | sub_asset_classes | currencies | ltv_percent | top_up_percent | sell_out_percent | record_status |
|---|---|---|---|---:|---:|---:|---|
| ML-AS-20260504-001 | FIXED_INCOME_ATTRIBUTE | ["GOVT_BOND"] | ["IDR"] | 70 | 80 | 90 | AUTHORIZED |
| ML-AS-20260504-002 | FUND_ATTRIBUTE | ["MONEY_MARKET"] | ["USD"] | 65 | 75 | 85 | UNAUTHORIZED |

## 4.2 ML Reference

Defines global reference rules such as deposit tenor LTV, issuer concentration, margin-call notice period, and security concentration.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| reference_id | string | Y | Unique, prefix `ML-REF-`. |
| reference_type | enum | Y | `DEPOSIT_TENOR_LTV`, `ISSUER_CONCENTRATION`, `MARGIN_CALL_NOTICE_PERIOD`, `SECURITY_CONCENTRATION`. |
| code | string | Y | Uppercase unique per reference_type. |
| reference_value | decimal/string | Y | Numeric for percentages/days; string allowed for bank code values. |
| reference_external_id | string | N | Upstream reference ID. |
| record_status | enum | Y | Maker-checker status. |

Sample data:

| reference_id | reference_type | code | reference_value | record_status |
|---|---|---|---|---|
| ML-REF-20260504-001 | MARGIN_CALL_NOTICE_PERIOD | MC_NOTICE_DAYS | 5 | AUTHORIZED |
| ML-REF-20260504-002 | ISSUER_CONCENTRATION | GOVT_ISSUER_MAX | 35 | UNAUTHORIZED |

## 4.3 ML Scrip Setting

Defines security-level overrides that supersede matching attribute settings.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| scrip_setting_id | string | Y | Unique, prefix `ML-SCRIP-`. |
| security_id | string | Y | Security master identifier. |
| security_name | string | Y | Display name. |
| security_concentration_flag | boolean | Y | Default false. |
| inheritance_flag | boolean | Y | True means values inherited from higher-level setting. |
| ltv_percent | decimal | Y if inheritance false | 0 to 100. |
| top_up_percent | decimal | Y if inheritance false | 0 to 100. |
| sell_out_percent | decimal | Y if inheritance false | 0 to 100. |
| record_status | enum | Y | Maker-checker status. |

Sample data:

| scrip_setting_id | security_id | security_name | inheritance_flag | ltv_percent | top_up_percent | sell_out_percent |
|---|---|---|---|---:|---:|---:|
| ML-SCRIP-20260504-001 | BOND-ID-GOV-10Y | ID Gov 10Y | false | 60 | 75 | 85 |
| ML-SCRIP-20260504-002 | MF-IDR-MM | IDR Money Market | true | 0 | 0 | 0 |

## 4.4 ML Exposure Limit

Defines absolute exposure and warning threshold by category/sub-category combinations.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| exposure_limit_id | string | Y | Unique, prefix `ML-EXP-`. |
| limit_code | string | Y | Uppercase unique. |
| limit_name | string | Y | Human-readable name. |
| currency | string | Y | ISO 4217. |
| amount | decimal | Y | Greater than 0. |
| effective_from | date | Y | Start date. |
| effective_to | date | Y | After effective_from. |
| threshold_percent | decimal | Y | 0 to 100. |
| category | enum | Y | `ASSET`, `SUB_ASSET`, `CURRENCY`, `CUSTOMER`, `SECURITY`, `NATIONALITY`, `RESIDENCY`. |
| category_value | string | Y | Selected value. |
| sub_category | string | N | Optional nested category. |
| sub_category_value | string | N | Optional nested value. |
| record_status | enum | Y | Maker-checker status. |

Sample data:

| exposure_limit_id | limit_code | currency | amount | threshold_percent | category | category_value |
|---|---|---|---:|---:|---|---|
| ML-EXP-20260504-001 | USD_FI_LIMIT | USD | 100000000 | 90 | ASSET | FIXED_INCOME |
| ML-EXP-20260504-002 | IDR_SEC_LIMIT | IDR | 50000000000 | 80 | SECURITY | BOND-ID-GOV-10Y |

## 4.5 ML Cross Currency Haircut

Defines the haircut applied when facility currency differs from security currency.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| haircut_id | string | Y | Unique, prefix `ML-FXHC-`. |
| source_currency | string | Y | ISO 4217 security/asset currency. |
| target_currency | string | Y | ISO 4217 facility currency; cannot equal source_currency. |
| buffer_percent | decimal | Y | 0 to 100. |
| volatility_percent | decimal | Y | 0 to 100. |
| haircut_percent | decimal | Y | Computed as buffer_percent + volatility_percent. |
| remarks | string | N | Free text. |
| record_status | enum | Y | Maker-checker status. |

Sample data:

| haircut_id | source_currency | target_currency | buffer_percent | volatility_percent | haircut_percent | record_status |
|---|---|---|---:|---:|---:|---|
| ML-FXHC-20260504-001 | USD | IDR | 2 | 3 | 5 | AUTHORIZED |
| ML-FXHC-20260504-002 | EUR | IDR | 3 | 4 | 7 | UNAUTHORIZED |

## 4.6 ML Facility Group

Defines customer-level exposure limit grouping.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| facility_group_id | string | Y | Unique, prefix `ML-FG-`. |
| base_number | string | Y | Customer base number, system-populated where available. |
| base_name | string | Y | Customer base name. |
| description | string | Y | Business description. |
| facility_start_date | date | Y | Start date. |
| facility_maturity_date | date | Y | After start date. |
| limit_amount | decimal | Y | Greater than 0. |
| utilized_amount | decimal | Y | Default 0. |
| available_drawing_power | decimal | Y | Computed. |
| currency | string | Y | ISO 4217. |
| remarks | string | N | Free text. |
| record_status | enum | Y | Maker-checker status. |

Sample data:

| facility_group_id | base_number | base_name | limit_amount | utilized_amount | available_drawing_power | record_status |
|---|---|---|---:|---:|---:|---|
| ML-FG-20260504-001 | BASE-1001 | PT Sinar Wealth | 5000000000 | 2000000000 | 3000000000 | AUTHORIZED |
| ML-FG-20260504-002 | BASE-1002 | Nadia Pratama | 1000000000 | 0 | 1000000000 | UNAUTHORIZED |

## 4.7 ML Facility

Represents asset/sub-asset level facility view synchronized from product processor or maintained as a view record.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| facility_id | string | Y | Unique, prefix `ML-FAC-`. |
| facility_group_id | string | Y | FK to ML Facility Group. |
| asset_class | string | Y | Asset class. |
| sub_asset_class | string | N | Sub asset class. |
| facility_limit_amount | decimal | Y | Greater than 0. |
| utilized_amount | decimal | Y | Default 0. |
| currency | string | Y | ISO 4217. |
| source_system | string | Y | `PMX`, `PRODUCT_PROCESSOR`, `MANUAL`. |
| facility_status | enum | Y | `ACTIVE`, `INACTIVE`, `EXPIRED`, `SUSPENDED`. |

Sample data:

| facility_id | facility_group_id | asset_class | sub_asset_class | facility_limit_amount | utilized_amount | source_system |
|---|---|---|---|---:|---:|---|
| ML-FAC-20260504-001 | ML-FG-20260504-001 | FIXED_INCOME | GOVT_BOND | 3000000000 | 1200000000 | PMX |
| ML-FAC-20260504-002 | ML-FG-20260504-001 | FUNDS | MONEY_MARKET | 2000000000 | 800000000 | PMX |

## 4.8 ML Portfolio Link

Links portfolios to facility groups, including cross-pledged portfolios from another base.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| link_id | string | Y | Unique, prefix `ML-LINK-`. |
| facility_group_id | string | Y | FK to ML Facility Group. |
| base_number | string | Y | Owning customer base. |
| portfolio_id | string | Y | Portfolio identifier. |
| linked_flag | boolean | Y | True for linked, false for explicitly unlinked. |
| cross_pledge_flag | boolean | Y | Default false. |
| pledgor_base_number | string | Required if cross_pledge true | Base that owns pledged portfolio. |
| pledge_priority | integer | N | Lower number means higher priority. |
| record_status | enum | Y | Maker-checker status. |

Sample data:

| link_id | facility_group_id | base_number | portfolio_id | linked_flag | cross_pledge_flag | pledgor_base_number |
|---|---|---|---|---|---|---|
| ML-LINK-20260504-001 | ML-FG-20260504-001 | BASE-1001 | PF-1001-A | true | false |  |
| ML-LINK-20260504-002 | ML-FG-20260504-001 | BASE-1001 | PF-2009-B | true | true | BASE-2009 |

## 4.9 ML Asset Setting

Defines customer-security overrides for LTV, top-up, sell-out, issuer concentration, and security concentration.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| asset_setting_id | string | Y | Unique, prefix `ML-AST-`. |
| base_number | string | Y | Customer base. |
| security_id | string | Y | Security master identifier. |
| inherit_flag | boolean | Y | True means use scrip/attribute rule. |
| ltv_percent | decimal | Required if inherit false | 0 to 100. |
| top_up_percent | decimal | Required if inherit false | 0 to 100. |
| sell_out_percent | decimal | Required if inherit false | 0 to 100. |
| issuer_concentration_percent | decimal | N | 0 to 100. |
| security_concentration_percent | decimal | N | 0 to 100. |
| record_status | enum | Y | Maker-checker status. |

Sample data:

| asset_setting_id | base_number | security_id | inherit_flag | ltv_percent | issuer_concentration_percent |
|---|---|---|---|---:|---:|
| ML-AST-20260504-001 | BASE-1001 | BOND-ID-GOV-10Y | false | 55 | 25 |
| ML-AST-20260504-002 | BASE-1002 | MF-IDR-MM | true | 0 | 0 |

## 4.10 ML Margin Call Case

Tracks margin-call and sell-out cases at portfolio or security level.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| case_id | string | Y | Unique, prefix `ML-MC-`. |
| business_date | date | Y | EOD/process date. |
| facility_group_id | string | Y | Related facility group. |
| portfolio_id | string | N | Required for portfolio-level case. |
| security_id | string | N | Required for security-level case. |
| exposure_amount | decimal | Y | Greater than or equal to 0. |
| market_value | decimal | Y | Greater than or equal to 0. |
| gcmv_amount | decimal | Y | Gross collateral margin value. |
| ncmv_amount | decimal | Y | Net collateral margin value. |
| top_up_amount | decimal | Y | Trigger amount. |
| sell_out_amount | decimal | Y | Trigger amount. |
| shortfall_amount | decimal | Y | Amount required to restore status. |
| case_status | enum | Y | `NORMAL`, `MARGIN_CALL`, `SELL_OUT`, `DEFERRED`, `DUE`, `MANUAL_CLOSED`, `AUTHORIZED`, `REJECTED`. |
| advice_reference | string | N | Generated advice ID/file reference. |
| notice_due_date | date | N | Based on notice period reference. |
| days_overdue | integer | Y | Default 0. |

Sample data:

| case_id | facility_group_id | portfolio_id | exposure_amount | gcmv_amount | case_status | shortfall_amount |
|---|---|---|---:|---:|---|---:|
| ML-MC-20260504-001 | ML-FG-20260504-001 | PF-1001-A | 2100000000 | 2000000000 | MARGIN_CALL | 100000000 |
| ML-MC-20260504-002 | ML-FG-20260504-001 | PF-1001-B | 2600000000 | 2200000000 | SELL_OUT | 400000000 |

## 4.11 ML EOD Run

Tracks EOD job execution for LTV logic refresh and margin-call process.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| eod_run_id | string | Y | Unique, prefix `ML-EOD-`. |
| job_id | string | Y | User-entered job ID. |
| job_type | enum | Y | `LTV_LOGIC`, `MARGIN_CALL_PROCESS`. |
| business_date | date | Y | EOD date. |
| run_status | enum | Y | `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`. |
| started_at | timestamp | N | Set when job starts. |
| completed_at | timestamp | N | Set when complete. |
| records_processed | integer | Y | Default 0. |
| records_failed | integer | Y | Default 0. |
| error_message | string | N | Failure reason. |

Sample data:

| eod_run_id | job_id | job_type | business_date | run_status | records_processed |
|---|---|---|---|---|---:|
| ML-EOD-20260504-001 | ML-LTV-DAILY | LTV_LOGIC | 2026-05-04 | COMPLETED | 415 |
| ML-EOD-20260504-002 | ML-MC-DAILY | MARGIN_CALL_PROCESS | 2026-05-04 | RUNNING | 100 |

## 4.12 ML Simulation Run

Stores customer/facility simulation input and before/after results.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| simulation_id | string | Y | Unique, prefix `ML-SIM-`. |
| simulation_type | enum | Y | `CUSTOMER`. |
| base_number | string | Y | Customer base. |
| facility_group_id | string | Y | Facility group. |
| assets_payload | json | Y | Asset additions/deletions/modifications. |
| exposures_payload | json | Y | Exposure additions/deletions/modifications. |
| before_result | json | Y | GCMV/credit view before simulation. |
| after_result | json | Y | GCMV/credit view after simulation. |
| comparison_result | json | Y | Difference metrics. |

Sample data:

| simulation_id | simulation_type | base_number | facility_group_id | before_result | after_result |
|---|---|---|---|---|---|
| ML-SIM-20260504-001 | CUSTOMER | BASE-1001 | ML-FG-20260504-001 | {"gcmv":2000000000} | {"gcmv":2300000000} |
| ML-SIM-20260504-002 | CUSTOMER | BASE-1002 | ML-FG-20260504-002 | {"status":"NORMAL"} | {"status":"MARGIN_CALL"} |

## 4.13 ML Audit Event

Stores immutable operational audit events for ML.

| Field | Type | Required | Validation / Default |
|---|---|---|---|
| audit_event_id | string | Y | Unique, prefix `ML-AUD-`. |
| entity_type | string | Y | Entity/table name. |
| entity_id | string | Y | Business key. |
| action | enum | Y | `ADD`, `MODIFY`, `COPY`, `DELETE`, `AUTHORIZE`, `REJECT`, `EOD_RUN`, `SIMULATE`, `MARGIN_CALL_UPDATE`. |
| before_payload | json | N | Redacted previous data. |
| after_payload | json | N | Redacted new data. |
| remarks | string | N | User remarks. |

Sample data:

| audit_event_id | entity_type | entity_id | action | remarks |
|---|---|---|---|---|
| ML-AUD-20260504-001 | ML_ATTRIBUTE_SETTING | ML-AS-20260504-001 | AUTHORIZE | Approved LTV update |
| ML-AUD-20260504-002 | ML_MARGIN_CALL_CASE | ML-MC-20260504-001 | MARGIN_CALL_UPDATE | Deferred to client funding date |

# 5. Functional Requirements

## FR-001 Common Record Lifecycle and Maker-Checker

Description: The module shall support Add, View, Modify, Save, Authorize, Copy, Delete, and Reject actions across Margin Lending maintenance and transaction records. Draft and unauthorized records can be modified or deleted according to role permissions; authorized records are used for processing and cannot be hard-deleted.

User story: As an ML Operations Checker, I want maker-created records routed to authorization so that only reviewed records affect margin calculations.

Acceptance criteria:

- FR-001.AC-01 The system supports `DRAFT`, `UNAUTHORIZED`, `AUTHORIZED`, `REJECTED`, and `MODIFIED` statuses for maker-checker controlled records.
- FR-001.AC-02 A saved record becomes `UNAUTHORIZED` and is available for authorize, reject, or permitted delete.
- FR-001.AC-03 Only `AUTHORIZED` records are eligible for EOD, credit-view, margin-call, and simulation calculations.
- FR-001.AC-04 The checker cannot be the same user as the maker for the same record.
- FR-001.AC-05 All Add, Modify, Copy, Delete, Authorize, and Reject actions create ML audit events.

Business rules:

- FR-001.BR-01 Authorized records cannot be hard-deleted.
- FR-001.BR-02 Rejected records can be modified and resubmitted for authorization.
- FR-001.BR-03 A copied record must receive a new business ID and start as `DRAFT` or `UNAUTHORIZED`.

Edge cases and failure handling:

- FR-001.EC-01 If a checker attempts self-approval, the API returns `MAKER_CHECKER_VIOLATION`.
- FR-001.FH-01 If authorization fails after status update, the transaction must roll back and the record must remain unchanged.

## FR-002 Access, Branch, Language, and Entitlements

Description: The ML application shall be accessible to users in Operations and Relationship groups based on entitlements. Users mapped to multiple branches can switch branch context, and users can change language where configured by the platform.

User story: As a Relationship Manager, I want to access only customer credit views assigned to my entitlement and branch so that confidential lending information remains protected.

Acceptance criteria:

- FR-002.AC-01 Only entitled users can access Margin Lending screens and APIs.
- FR-002.AC-02 The active branch context is captured on create/modify/authorize/audit events.
- FR-002.AC-03 Users mapped to multiple branches can switch branch context before performing ML actions.
- FR-002.AC-04 Language preference is stored and used by ML notifications where localized templates exist.

Business rules:

- FR-002.BR-01 Relationship-group users cannot perform global maintenance or EOD execution unless granted an operations role.
- FR-002.BR-02 Auditor role is read-only.

Edge cases and failure handling:

- FR-002.FH-01 Unauthorized access returns `FORBIDDEN` without exposing record existence.

## FR-003 Generic Maintenance

Description: The module shall maintain loanable values at attribute level for Deposits, Fixed Income, Funds, and Others, and shall also maintain References and Scrip Settings. Scrip Settings override the matching attribute-level setting when inheritance is disabled.

User story: As an ML Operations Maker, I want to maintain LTV, top-up, and sell-out definitions by asset attributes and security so that margin calculations use bank-approved loanable values.

Acceptance criteria:

- FR-003.AC-01 Users can add, view, modify, copy, delete, authorize, and reject attribute-level settings.
- FR-003.AC-02 Deposits settings support sub-asset class and currency multi-select.
- FR-003.AC-03 Fixed Income settings support sub-asset, industry, market group, domicile, issuer, rating agency, rating, residual tenor, issuer category, and capital protection attributes.
- FR-003.AC-04 Funds settings support sub-asset, fund domicile, security risk profile, and fund house attributes.
- FR-003.AC-05 Scrip Settings support security concentration flag, inheritance flag, LTV, top-up, and sell-out overrides.

Business rules:

- FR-003.BR-01 LTV, top-up, and sell-out percentages must be between 0 and 100.
- FR-003.BR-02 Sell-out percentage must be greater than or equal to top-up percentage.
- FR-003.BR-03 Scrip-level non-inherited values override attribute-level values.
- FR-003.BR-04 Only authorized settings with effective dates covering the calculation business date are used.

Edge cases and failure handling:

- FR-003.EC-01 If no matching scrip setting exists, the most specific authorized attribute-level setting is used.
- FR-003.FH-01 Overlapping authorized settings for the same scope are rejected with `OVERLAPPING_ML_SETTING`.

## FR-004 Reference Maintenance

Description: Users shall maintain deposit tenor LTV, issuer concentration, security concentration, and margin-call notice period references. References are global rules used by calculations, advice due dates, and concentration monitoring.

User story: As a Risk Officer, I want global concentration and notice-period rules to be versioned and authorized so that risk policy changes are controlled.

Acceptance criteria:

- FR-004.AC-01 Users can maintain reference type, code, reference value, and reference ID.
- FR-004.AC-02 Margin-call notice period can be used to compute notice due date.
- FR-004.AC-03 Concentration references can be retrieved by credit-view and report calculations.

Business rules:

- FR-004.BR-01 Reference code is unique per reference type.
- FR-004.BR-02 Notice period value must be a positive integer number of days.

Edge cases and failure handling:

- FR-004.FH-01 Missing required reference for a calculation logs `ML_REFERENCE_MISSING` and uses no silent default.

## FR-005 Exposure Maintenance

Description: Exposure limits shall be maintained as absolute amounts for combinations of asset/sub-asset, currency, customer nationality/residency, and security. Threshold percentages provide early-warning breach monitoring.

User story: As a Credit Officer, I want exposure limits and thresholds monitored by selected categories so that concentration breaches can be identified before limit exhaustion.

Acceptance criteria:

- FR-005.AC-01 Users can add, view, modify, delete, authorize, and reject exposure limits.
- FR-005.AC-02 Exposure limit supports limit code, name, currency, amount, effective dates, threshold percentage, category, sub-category, and category values.
- FR-005.AC-03 Credit and EOD calculations flag threshold warning when exposure exceeds amount multiplied by threshold percentage.
- FR-005.AC-04 Breach evidence is available in reports and credit view.

Business rules:

- FR-005.BR-01 Exposure amount must be greater than zero.
- FR-005.BR-02 Threshold percentage must be greater than 0 and less than or equal to 100.
- FR-005.BR-03 Effective-to date must be after effective-from date.

Edge cases and failure handling:

- FR-005.FH-01 If exposure data source is unavailable, EOD marks run `FAILED` and does not publish new margin statuses.

## FR-006 Cross Currency Haircut

Description: When facility currency differs from security currency, a cross-currency haircut shall reduce loanable value. Haircut percentage is buffer percentage plus volatility percentage.

User story: As a Risk Officer, I want currency mismatch buffers applied to collateral values so that FX volatility risk is reflected in drawing power.

Acceptance criteria:

- FR-006.AC-01 Users can add, view, modify, delete, authorize, and reject cross-currency haircuts.
- FR-006.AC-02 Source currency, target currency, buffer, volatility, haircut, and remarks are captured.
- FR-006.AC-03 Haircut is automatically calculated as buffer plus volatility.
- FR-006.AC-04 Credit view and simulation apply authorized haircut when asset currency differs from facility currency.

Business rules:

- FR-006.BR-01 Source currency and target currency cannot be the same.
- FR-006.BR-02 Buffer, volatility, and haircut percentages must be between 0 and 100.

Edge cases and failure handling:

- FR-006.FH-01 Missing cross-currency haircut for mismatched currencies blocks calculation with `ML_CROSS_CURRENCY_HAIRCUT_MISSING`.

## FR-007 Facility Group

Description: Facility Group manages customer-level exposure limit, utilized limit, and available drawing power. All facilities and portfolio utilization map to a facility group.

User story: As an ML Operations Maker, I want to create and authorize facility groups so that customer-level margin lending exposure is controlled.

Acceptance criteria:

- FR-007.AC-01 Users can add, view, modify, delete, authorize, and reject facility groups.
- FR-007.AC-02 Facility group captures base name, base number, description, start date, maturity date, limit amount, currency, and remarks.
- FR-007.AC-03 Available drawing power is computed from authorized limit and utilized exposure.
- FR-007.AC-04 Facility maturity date drives expired/suspended behavior in credit view.

Business rules:

- FR-007.BR-01 Facility group limit amount must be greater than zero.
- FR-007.BR-02 Maturity date must be after start date.
- FR-007.BR-03 Only authorized facility groups can be linked to portfolios.

Edge cases and failure handling:

- FR-007.FH-01 Facility groups with expired maturity date cannot accept new portfolio links.

## FR-008 Facility View

Description: Facility records represent asset/sub-asset level exposure limits synchronized from product processors such as PMX. ML users can view facility data but do not maintain upstream facility definitions in this module.

User story: As an ML Operations user, I want to view facility details by asset/sub-asset so that I can understand how utilization maps to facility groups.

Acceptance criteria:

- FR-008.AC-01 Users can list and view facilities by facility group, asset class, sub-asset class, currency, and status.
- FR-008.AC-02 Facility view shows facility limit, utilized amount, available amount, source system, and status.
- FR-008.AC-03 Facility records imported from product processor are read-only in ML.

Business rules:

- FR-008.BR-01 Facility source-system reference is mandatory.
- FR-008.BR-02 Inactive/expired facilities are excluded from available drawing-power calculation.

Edge cases and failure handling:

- FR-008.FH-01 Product-processor sync failure creates integration error evidence.

## FR-009 Portfolio Linking

Description: Portfolios can be linked to facility groups in many-to-many combinations. Users select base and facility group, then mark linked flag for portfolios.

User story: As an ML Operations Maker, I want to link portfolios to facility groups so that collateral holdings are considered in credit calculations.

Acceptance criteria:

- FR-009.AC-01 Users can add, view, modify, authorize, and reject portfolio links.
- FR-009.AC-02 The UI displays portfolios linked to selected facility group, portfolios linked to other facility groups within same base, unlinked portfolios, and portfolios linked to another base facility group.
- FR-009.AC-03 Linked flag values are persisted and used by credit view and EOD calculations.

Business rules:

- FR-009.BR-01 A portfolio cannot be linked twice to the same facility group in active authorized state.
- FR-009.BR-02 Only authorized portfolio links are included in calculations.

Edge cases and failure handling:

- FR-009.FH-01 Missing portfolio ownership evidence blocks authorization with `ML_PORTFOLIO_OWNERSHIP_MISSING`.

## FR-010 Portfolio Linking with Cross Pledge

Description: Cross pledge allows a portfolio owned by another base to support a facility group. The cross-pledged portfolio is selected through a dialog and added to the pledged portfolio list.

User story: As an ML Operations Maker, I want to cross-pledge a related customer portfolio so that margin shortfalls can be covered by approved third-party collateral.

Acceptance criteria:

- FR-010.AC-01 Users can add, view, modify, authorize, and reject cross-pledge links.
- FR-010.AC-02 Cross pledge captures pledgor base number, pledged portfolio, target facility group, linked flag, and priority.
- FR-010.AC-03 Credit view identifies cross-pledged portfolios separately from same-base linked portfolios.
- FR-010.AC-04 Cross pledge is included in GCMV/NCMV calculations only after authorization.

Business rules:

- FR-010.BR-01 Cross pledge requires explicit pledgor base number different from target base number.
- FR-010.BR-02 Cross-pledged portfolios require authorization before use.

Edge cases and failure handling:

- FR-010.FH-01 If a pledged portfolio is already pledged to another active sell-out case, authorization is blocked.

## FR-011 Credit View

Description: Credit View provides base, facility, exposure, GCMV, NCMV, top-up, sell-out, market value, status, linked portfolios, and holding details. Users can drill into portfolio links and holding details.

User story: As a Relationship Manager, I want a complete customer credit view so that I can see exposure, collateral value, drawing power, and breach status before advising a client.

Acceptance criteria:

- FR-011.AC-01 Users can select base name and facility group to load credit view.
- FR-011.AC-02 Credit view calculates market value, GCMV, NCMV, top-up amount, sell-out amount, exposure, utilized LTV, and available drawing power.
- FR-011.AC-03 Credit view displays status `NORMAL`, `MARGIN_CALL`, or `SELL_OUT`.
- FR-011.AC-04 Users can drill into linked portfolios and holding details.

Business rules:

- FR-011.BR-01 GCMV equals market value multiplied by effective LTV percentage after applicable cross-currency haircut.
- FR-011.BR-02 NCMV equals GCMV minus exposure.
- FR-011.BR-03 Sell-out status has priority over margin-call status when both thresholds are breached.

Edge cases and failure handling:

- FR-011.FH-01 Missing price/holding data marks credit view partial and identifies unavailable source.

## FR-012 Asset Settings

Description: Asset Settings allow customer-security level LTV, top-up, sell-out, security concentration, and issuer concentration overrides. Users can inherit higher-level settings or enter customer-specific values.

User story: As a Risk Officer, I want customer-security overrides so that high-risk customers or securities can receive stricter margin rules.

Acceptance criteria:

- FR-012.AC-01 Users can add, view, modify, authorize, and reject asset settings.
- FR-012.AC-02 Users can select base and update inherit flag, issuer concentration, security concentration, LTV, top-up, and sell-out values.
- FR-012.AC-03 Non-inherited customer-security settings override scrip and attribute settings.

Business rules:

- FR-012.BR-01 If inherit flag is true, override percentages are ignored.
- FR-012.BR-02 If inherit flag is false, LTV/top-up/sell-out values are mandatory.

Edge cases and failure handling:

- FR-012.FH-01 Invalid override hierarchy returns `ML_ASSET_SETTING_INVALID`.

## FR-013 Margin Call Process

Description: The system shall track margin-call process at portfolio and security level. After EOD, portfolios whose exposure exceeds top-up amount become Margin Call; portfolios whose exposure exceeds sell-out amount become Sell Out. The system generates advice with shortfall amount and supports deferral, due, manual closure, history, and authorization.

User story: As an ML Operations Maker, I want to update margin-call cases and generate advice so that customers are notified and breach remediation is controlled.

Acceptance criteria:

- FR-013.AC-01 EOD or on-demand process creates margin-call cases when exposure exceeds top-up threshold.
- FR-013.AC-02 EOD or on-demand process creates sell-out cases when exposure exceeds sell-out threshold.
- FR-013.AC-03 Users can view case details, advice reference, and history.
- FR-013.AC-04 Users can modify case update type as `DEFERRAL`, `DUE`, or `MANUAL_CLOSURE`.
- FR-013.AC-05 Case modifications require authorization or rejection.

Business rules:

- FR-013.BR-01 Deferral requires deferral expiry date and reason.
- FR-013.BR-02 Manual closure requires remarks.
- FR-013.BR-03 Sell-out cases cannot be downgraded to normal without authorized closure evidence.

Edge cases and failure handling:

- FR-013.FH-01 Advice generation failure keeps case open and records `ML_ADVICE_GENERATION_FAILED`.

## FR-014 Reports

Description: The module shall provide product details, audit trail, list of facilities, margin-call portfolio, margin-call security, rating maintenance, and leveraged client view reports. CSV export is required where specified.

User story: As a Risk Officer, I want standardized margin lending reports so that exposure, breaches, ratings, and client leverage can be monitored and exported.

Acceptance criteria:

- FR-014.AC-01 Product Details report shows LTV, top-up, and sell-out values at attribute, scrip, and asset setting levels.
- FR-014.AC-02 Audit Trail report shows Add, Modify, Authorize, Delete, EOD, simulation, and margin-call actions.
- FR-014.AC-03 List of Facilities report shows facility market value, exposure, NCMV, status, and margin amount required.
- FR-014.AC-04 Margin Call Portfolio and Margin Call Security reports show market value, GCMV, exposure, NCMV, status, shortfall, and days overdue.
- FR-014.AC-05 Reports can be filtered and exported to CSV.

Business rules:

- FR-014.BR-01 Report totals must match credit-view calculation logic.
- FR-014.BR-02 CSV export uses current filters and includes generation timestamp and user.

Edge cases and failure handling:

- FR-014.FH-01 Empty result exports create a CSV with headers and zero rows.

## FR-015 EOD Execution

Description: EOD updates the ML module with product-processor or external-source data and runs two processes: LTV Logic calculation and Margin Call Process. Users enter an EOD job ID and run the selected job.

User story: As a System Operator, I want repeatable EOD jobs so that daily margin lending statuses reflect latest definitions, holdings, prices, exposures, and FX rates.

Acceptance criteria:

- FR-015.AC-01 Users can run EOD by job ID and job type.
- FR-015.AC-02 LTV Logic job refreshes effective loanable-value hierarchy.
- FR-015.AC-03 Margin Call Process job recalculates margin-call and sell-out statuses.
- FR-015.AC-04 EOD run records status, start time, completion time, processed count, failed count, and error reason.

Business rules:

- FR-015.BR-01 EOD is idempotent per business date, job type, and job ID.
- FR-015.BR-02 Failed EOD must not publish partial status silently.

Edge cases and failure handling:

- FR-015.FH-01 Source outage marks EOD failed and emits operations notification.

## FR-016 Margin Simulation

Description: Simulation allows users to simulate and compare GCMV and Credit View for a customer/facility group. Users can add or delete assets and exposures, refresh GCMV/Credit View, simulate modified values, and compare before/after results.

User story: As a Relationship Manager, I want to simulate asset and exposure changes so that I can advise the client how top-ups, repayments, or new pledges affect margin status.

Acceptance criteria:

- FR-016.AC-01 Users can run simulation type `CUSTOMER` by base and facility group.
- FR-016.AC-02 Simulation supports asset and exposure additions, deletions, and modifications.
- FR-016.AC-03 Simulation returns Assets, Exposure, GCMV, and Credit View widgets.
- FR-016.AC-04 Compare action shows before and after GCMV, NCMV, exposure, status, and available drawing power.
- FR-016.AC-05 Credit View widget supports grid, summary chart, and details chart data.

Business rules:

- FR-016.BR-01 Simulation does not update live facility, portfolio link, margin-call, or exposure records.
- FR-016.BR-02 Simulation must use authorized rule hierarchy as of selected business date.

Edge cases and failure handling:

- FR-016.FH-01 Invalid simulation payload returns field-level validation errors and persists no simulation run.

# 6. User Interface Requirements

## 6.1 Margin Lending Workbench

Purpose: Single operational workspace for maintenance, transactions, margin-call, EOD, simulation, and reports.

Layout:

- Top-level tabs: Maintenance, Transactions, Margin Calls/EOD, Simulation/Reports, Audit.
- Use Tailwind CSS, shadcn/ui cards, tabs, tables, inputs, selects, textareas, badges, and buttons.
- Tables support search/filter, status badges, row selection, and empty/loading states.
- Forms use four-column desktop grid and one-column mobile layout.
- Action buttons use icons for add, save, authorize, reject, run, download, simulate, and refresh.

Navigation:

- Back-office Operations navigation includes Margin Lending.
- `/operations/margin-lending` opens the workbench.

Responsive behavior:

- On mobile, tabs remain scrollable, tables become horizontally scrollable, and form fields stack vertically.

## 6.2 Maintenance Screens

Screens: Attribute Settings, References, Scrip Settings, Exposure Maintenance, Cross Currency Haircut.

Key components:

- Maintenance type selector.
- Add/Modify form.
- Authorization queue table.
- Maker/checker status badges.
- Effective-date fields and percentage validation.

## 6.3 Transaction Screens

Screens: Facility Group, Facility View, Portfolio Linking, Cross Pledge, Credit View, Asset Settings.

Key components:

- Base and facility group selector.
- Linked/unlinked/cross-pledged portfolio grid.
- Facility and credit summary tiles.
- Holding detail drill-down table.

## 6.4 Margin Call and EOD Screens

Screens: Margin Call Process, EOD Execution.

Key components:

- Margin-call case grid with status, shortfall, overdue days, advice reference.
- Update type form for deferral, due, manual closure.
- Authorization panel.
- EOD job ID/type form and run-history table.

## 6.5 Simulation and Reports Screens

Screens: Margin Simulation, Product Details, Audit Trail, List of Facilities, Margin Call Portfolio, Margin Call Security, Rating Maintenance, Leveraged Client View.

Key components:

- Simulation asset/exposure JSON editor or structured grid.
- Before/after comparison summary.
- Report code selector, filters, table preview, and CSV export button.

# 7. API and Integration Requirements

## 7.1 Standard Error Response

All APIs return:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "LTV percent must be between 0 and 100",
    "field": "ltvPercent",
    "correlationId": "REQ-20260504-0001"
  }
}
```

## 7.2 Internal API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/margin-lending/summary` | Workbench KPIs. |
| POST | `/api/v1/margin-lending/attribute-settings` | Create attribute setting. |
| POST | `/api/v1/margin-lending/attribute-settings/:settingId/authorize` | Authorize/reject attribute setting. |
| POST | `/api/v1/margin-lending/references` | Create reference. |
| POST | `/api/v1/margin-lending/scrip-settings` | Create scrip setting. |
| POST | `/api/v1/margin-lending/exposure-limits` | Create exposure limit. |
| POST | `/api/v1/margin-lending/cross-currency-haircuts` | Create cross-currency haircut. |
| POST | `/api/v1/margin-lending/facility-groups` | Create facility group. |
| GET | `/api/v1/margin-lending/facilities` | List facility view records. |
| POST | `/api/v1/margin-lending/portfolio-links` | Create portfolio/cross-pledge link. |
| POST | `/api/v1/margin-lending/asset-settings` | Create asset setting. |
| GET | `/api/v1/margin-lending/credit-view` | Load credit view. |
| GET | `/api/v1/margin-lending/margin-call-cases` | List margin-call cases. |
| POST | `/api/v1/margin-lending/margin-call-cases/:caseId/actions` | Update margin-call case. |
| POST | `/api/v1/margin-lending/eod-runs` | Run EOD job. |
| POST | `/api/v1/margin-lending/simulations` | Run simulation. |
| GET | `/api/v1/margin-lending/reports/:reportCode` | Report preview/export metadata. |
| GET | `/api/v1/margin-lending/audit-events` | Audit trail. |

## 7.3 Complex API Examples

Create cross-currency haircut request:

```json
{
  "sourceCurrency": "USD",
  "targetCurrency": "IDR",
  "bufferPercent": 2,
  "volatilityPercent": 3,
  "remarks": "USD collateral for IDR facility"
}
```

Create cross-currency haircut response:

```json
{
  "haircut_id": "ML-FXHC-20260504-001",
  "source_currency": "USD",
  "target_currency": "IDR",
  "buffer_percent": "2.000000",
  "volatility_percent": "3.000000",
  "haircut_percent": "5.000000",
  "record_status": "UNAUTHORIZED"
}
```

Run EOD request:

```json
{
  "jobId": "ML-MC-DAILY",
  "jobType": "MARGIN_CALL_PROCESS",
  "businessDate": "2026-05-04",
  "portfolioSnapshots": [
    {
      "facilityGroupId": "ML-FG-20260504-001",
      "portfolioId": "PF-1001-A",
      "marketValue": 3000000000,
      "exposureAmount": 2500000000,
      "ltvPercent": 70,
      "topUpPercent": 80,
      "sellOutPercent": 90
    }
  ]
}
```

Run simulation request:

```json
{
  "simulationType": "CUSTOMER",
  "baseNumber": "BASE-1001",
  "facilityGroupId": "ML-FG-20260504-001",
  "before": { "marketValue": 3000000000, "exposureAmount": 1800000000, "ltvPercent": 70, "topUpPercent": 80, "sellOutPercent": 90 },
  "after": { "marketValue": 3300000000, "exposureAmount": 1800000000, "ltvPercent": 70, "topUpPercent": 80, "sellOutPercent": 90 }
}
```

## 7.4 External Integrations

| System | Direction | Data |
|---|---|---|
| Product Processor / PMX | Receive | Facility records, utilization, product-processor exposure. |
| Portfolio Accounting | Receive | Portfolio holdings, blocked quantity, market value. |
| Security Master | Receive | Security attributes, issuer, rating, domicile, asset class. |
| Market Data | Receive | Security prices and ratings. |
| FX Rate Service | Receive | Currency conversion for cross-currency haircut. |
| Notification Gateway | Send | Margin-call advice and operations alerts. |
| Report/Export Service | Send | CSV and report artifacts. |

# 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Credit view p95 under 2 seconds for 500 holdings; EOD processes 50,000 holdings within 30 minutes. |
| Security | Authenticated APIs, role-based authorization, maker-checker enforcement, encrypted sensitive data in transit and at rest, OWASP controls. |
| Scalability | EOD and reports must support async execution and pagination. |
| Availability | 99.9% application availability during business hours. |
| Backup and Recovery | Daily backups, RPO 15 minutes, RTO 4 hours for production. |
| Accessibility | WCAG 2.1 AA for all back-office screens. |
| Browser Support | Latest Chrome, Edge, Safari, and Firefox desktop; responsive tablet support. |
| Observability | EOD run status, integration errors, margin-call generation, and failed advice generation must produce logs and metrics. |

# 9. Workflow and State Diagrams

## 9.1 Maker-Checker Workflow

| Current State | Action | Next State | Side Effects |
|---|---|---|---|
| New | Save Draft | DRAFT | Audit Add Draft. |
| DRAFT | Save | UNAUTHORIZED | Queue for checker. |
| UNAUTHORIZED | Authorize | AUTHORIZED | Record becomes effective; audit authorize. |
| UNAUTHORIZED | Reject | REJECTED | Maker can modify; audit reject. |
| REJECTED | Modify | MODIFIED | Queue for checker after save. |
| DRAFT/UNAUTHORIZED | Delete | DELETED | Soft-delete if not authorized; audit delete. |

## 9.2 Margin Call Workflow

| Current State | Action | Next State | Side Effects |
|---|---|---|---|
| NORMAL | EOD detects exposure > top-up | MARGIN_CALL | Create case, advice reference, notification. |
| NORMAL/MARGIN_CALL | EOD detects exposure > sell-out | SELL_OUT | Create sell-out case and escalation. |
| MARGIN_CALL/SELL_OUT | Maker records deferral | DEFERRED | Require expiry/reason; queue authorization. |
| MARGIN_CALL/SELL_OUT | Maker marks due | DUE | Queue authorization; update overdue counters. |
| MARGIN_CALL/SELL_OUT | Maker manual closes | MANUAL_CLOSED | Require remarks; queue authorization. |
| Any pending update | Checker authorizes | AUTHORIZED | Publish case update and audit. |
| Any pending update | Checker rejects | REJECTED | Revert pending update and audit. |

## 9.3 EOD Workflow

| Current State | Action | Next State | Side Effects |
|---|---|---|---|
| QUEUED | Start job | RUNNING | Capture started_at. |
| RUNNING | Complete all records | COMPLETED | Capture counts, create/update cases. |
| RUNNING | Source outage or validation failure | FAILED | Capture failed count and error. |
| FAILED | Rerun same business date/job | RUNNING | Link rerun to prior job in audit. |

# 10. Notification and Communication Requirements

| Event | Channel | Recipient | Trigger | Template |
|---|---|---|---|---|
| Maintenance pending authorization | In-app | ML Checker group | Record saved as unauthorized | `ML maintenance {id} is pending authorization.` |
| Margin call generated | Email, SMS, in-app | Customer, RM, Operations | EOD detects margin-call case | `Margin call for {portfolioId}: shortfall {amount}, due by {noticeDueDate}.` |
| Sell-out generated | Email, SMS, in-app | Customer, RM, Operations, Risk | EOD detects sell-out case | `Sell-out alert for {portfolioId}: exposure exceeds sell-out threshold.` |
| EOD failed | In-app, email | System Operator, Operations Head | EOD run failed | `ML EOD {jobId} failed: {errorMessage}.` |
| Deferral expiring | In-app, email | Operations, RM | Deferral expiry within configured days | `Deferral for {caseId} expires on {date}.` |

Critical margin-call and sell-out notifications cannot be disabled. Non-critical reminders can be opted out by user preference if bank policy permits.

# 11. Reporting and Analytics

| Report | Audience | Data Sources | Filters | Refresh |
|---|---|---|---|---|
| Product Details | Operations, Risk | Attribute, scrip, asset settings | Asset class, security, status | On demand |
| Audit Trail | Auditor | ML audit events | Entity, action, user, date | Real time |
| List of Facilities | Operations, RM | Facility group, facility, credit view | Customer, facility, status | On demand / daily |
| Margin Call Portfolio | Operations, Risk | Margin-call cases | Business date, status, overdue days | Daily EOD |
| Margin Call Security | Operations, Risk | Case and security-level holdings | Security, issuer, status | Daily EOD |
| Rating Maintenance | Risk | Security master, rating definitions | Rating agency, security | Daily |
| Leveraged Client View | RM, Risk | Facility group and credit view | Customer, RM, branch | On demand |

# 12. Migration and Launch Plan

## 12.1 Migration Needs

- Import authorized LTV/top-up/sell-out definitions from existing ML spreadsheets or source systems.
- Load facility groups and facility records from product processor/PMX.
- Link existing portfolios to facility groups using current credit-operations mapping.
- Import open margin-call and sell-out cases with history and advice references.

## 12.2 Phased Rollout

| Phase | Scope |
|---|---|
| Phase 1 | Schema, maintenance, maker-checker, facility group, portfolio linking, audit. |
| Phase 2 | Credit view, asset settings, cross-currency haircut, exposure validation. |
| Phase 3 | EOD margin-call process, margin-call workflow, reports. |
| Phase 4 | Simulation, integrations, NFR/load/accessibility proof. |

## 12.3 Go-Live Checklist

- All initial maintenance records loaded and authorized.
- PMX/product-processor, portfolio, market price, FX, and notification integrations certified.
- EOD dry run completed with reconciliation sign-off.
- Maker/checker role mappings signed off.
- Reports reconciled against legacy output.
- Backout plan and rollback scripts approved.

# 13. Glossary

| Term | Definition |
|---|---|
| ML | Margin Lending. |
| LTV | Loan To Value percentage used for loanable collateral value. |
| GCMV | Gross Collateral Margin Value, before exposure deduction. |
| NCMV | Net Collateral Margin Value, GCMV minus exposure. |
| Top Up | Threshold at which margin call is triggered. |
| Sell Out | Threshold at which sell-out escalation is triggered. |
| Facility Group | Customer-level exposure limit grouping. |
| Facility | Asset/sub-asset level facility view under a facility group. |
| Cross Pledge | Pledge of another base customer's portfolio to support target facility. |
| Scrip Setting | Security-level LTV/top-up/sell-out override. |
| EOD | End-of-day batch processing for LTV and margin-call refresh. |

# 14. Appendices

## 14.1 Source Manual Sections Mapped

| Manual Section | BRD Mapping |
|---|---|
| Common Functions/Processes | FR-001 |
| Accessing ML | FR-002 |
| Generic Maintenance | FR-003, FR-004 |
| Exposure Maintenance | FR-005 |
| Cross Currency Haircut | FR-006 |
| Facility Group | FR-007 |
| Facility | FR-008 |
| Portfolio Linking | FR-009 |
| Portfolio Linking with Cross Pledge | FR-010 |
| Credit View | FR-011 |
| Asset Settings | FR-012 |
| Margin Call Process | FR-013 |
| Reports | FR-014 |
| EOD | FR-015 |
| Simulation | FR-016 |

## 14.2 Blue Ocean Enhancements Included

- Explicit source-outage failure handling for EOD and credit-view partial data.
- Chart-ready simulation output for summary and details chart views.
- Strong maker-checker self-approval prevention across all ML entities.
- Integration-ready EOD and report metadata for operational observability.
