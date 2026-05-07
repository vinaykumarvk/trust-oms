# OMS Improvement BRD

Document status: Revised v1.0 after adversarial council review
Date: 2026-05-06
Classification: Confidential
System: Danamon OEMS

## Table Of Contents

1. Executive Summary
2. Scope And Boundaries
3. User Roles And Permissions
4. Data Model
5. Functional Requirements
6. User Interface Requirements
7. API And Integration Requirements
8. Non-Functional Requirements
9. Workflow And State Diagrams
10. Notification And Communication Requirements
11. Reporting And Analytics
12. Migration And Launch Plan
13. Glossary
14. Appendices
15. Adversarial Council Incorporation Notes

# 1. Executive Summary

## 1.1 Project Name

Danamon OEMS World-Class Modernization Program

## 1.2 Project Description

The project will modernize Danamon OEMS from a broad operational workbench into a governed, product-driven, globally competitive order management system for ODA, MLD, Mutual Fund, Bond, FX Today, and Wealth Lending products. The target state includes product-specific order tickets, a governed product and security master, deterministic validation rules, formal workflow orchestration, transactional multi-table processing, certified integrations, embedded documents and digital verification, role-based exception queues, and production-grade observability.

The governing principle is the **Minimum Trustworthy Order**. An order cannot become production-intent unless it has an active product/security reference, required product-specific capture data, explicit source-system evidence state, deterministic rule decisions, an accountable owner queue, immutable transition history, and a clear next-state decision. Broad dashboards, full product-family expansion, and control tower analytics must follow this spine, not precede it.

## 1.3 Business Objectives

- Reduce preventable order validation failures by 60 percent within 90 days after rollout.
- Ensure 100 percent of production orders reference an active governed product or approved manual exception.
- Reduce manual follow-up for missing documents, source statuses, and customer verification by 50 percent.
- Improve approval SLA compliance to at least 95 percent for product operations, treasury, compliance, and back-office queues.
- Establish audit replay capability for every order lifecycle event, validation decision, approval decision, document action, verification action, and integration message.
- Establish policy-to-rule traceability so every executable rule version maps to approved bank policy, product terms, regulatory obligation, owner, and test evidence.

## 1.4 Target Users And Pain Points

| User group | Pain points today | Target outcome |
|---|---|---|
| Relationship Manager and Branch Maker | Generic ticket misses product-specific fields and source evidence. | Guided product tickets with pre-trade checks before draft creation. |
| Back Office Maker | Must use broad workbench tabs and manual follow-up. | Role queue with next action, blocker reason, SLA, and bulk operations. |
| Back Office Checker | Approval status and order transition evidence can diverge. | Central workflow and approval decision trail. |
| Treasury | FX/ODA actions need source rate, quote, and execution traceability. | Treasury queue with quote expiry, cutoff, LHBU, SND, overbook, and blotter controls. |
| Compliance and Risk | Suitability, risk profile, documents, and overrides are not governed by one rules catalog. | Versioned rules with severity, evidence source, and override authority. |
| Document Operations | Document actions are split from order journey. | Embedded upload, e-form, e-sign, DMS, NCBS, waiver, and retry flow. |
| Integration Operations | Mock/certification state and reconciliation need production closure. | Certified adapters, dead-letter queues, replay, SLA, and reconciliation workbench. |

## 1.5 Success Metrics

| KPI | Baseline | Target |
|---|---:|---:|
| Orders with active product/security reference | To be measured from existing order table | 100 percent excluding approved manual exceptions |
| Orders blocked after draft due to missing capture data | To be measured | 60 percent reduction |
| Approval SLA compliance | To be measured | 95 percent within configured SLA |
| Integration messages reconciled by SLA | To be measured | 98 percent |
| Document checklist completion before submission | To be measured | 90 percent |
| Customer verification completion before approval | To be measured | 90 percent |
| Audit replay completeness | Partial | 100 percent for in-scope OEMS events |
| Orders with ambiguous product/rule provenance | To be measured | 0 after product-family cutover |
| Approval/status divergence | To be measured | 0 for new workflow-engine transitions |

## 1.6 Minimum Trustworthy Order Release Gate

No product family may go live on the improved OMS unless the following controls are proven by tests and UAT evidence:

1. Active product/security reference is mandatory.
2. Product-specific capture schema blocks incomplete tickets before draft order creation.
3. Source-system evidence state is explicit: AVAILABLE, STALE, FAILED, PENDING, or DEGRADED_APPROVED.
4. Validation decisions include rule version, source evidence, severity, owner, and repair hint.
5. Workflow transition creates queue item, audit event, and outbox event in one committed unit.
6. Maker-checker conflict is enforced.
7. Audit replay reconstructs rule versions, source evidence, user decisions, document state, verification state, integration messages, retries, and final order status.
8. Production adapter mock mode is disabled or the product family is blocked from production use.

# 2. Scope And Boundaries

## 2.1 In Scope

- Product/security master for ODA, MLD, Mutual Fund, Bond, FX Today, and Wealth Lending.
- Product rule sets for eligibility, distribution, transaction types, limits, cutoff, documents, verification, source-system evidence, fee/tax, settlement, and approval routing.
- Product-specific order tickets for all OEMS product families.
- Deterministic validation rules engine with rule versioning, blocking severity, override rights, and evidence snapshots.
- Formal workflow orchestration with allowed transitions, role triggers, side effects, and order status transition records.
- Transactional service-layer changes for multi-table workflows.
- Outbox-backed notifications and integration messages for state consistency.
- Production integration adapter certification and dead-letter/replay workflows.
- Embedded document, e-form, signing, DMS, NCBS, waiver, renewal, and retry flows.
- Embedded digital verification, resend, expiry, manual fallback, signed document, and evidence flows.
- Role-based operator queues and control tower dashboards.
- Functional tests, service tests, route tests, UI workflow tests, and migration tests for all new critical controls.
- Policy-to-rule control matrix and product-family migration runbook, starting with ODA.
- Post-launch operating model, RACI, rule recertification, incident feedback, and reconciliation ownership.

## 2.2 Out Of Scope

- Replacing NCBS, RBS, Avantrade, Treasury, Wealth Core, DMS, DBank Pro, CRM, or loan systems.
- Real external credential setup in local development.
- Regulatory advice or legal interpretation outside configurable rule representation.
- Complete replacement of the existing Danamon OEMS database in one release.
- Low-level market execution algorithms beyond configured routing, approval, and integration handoff.

## 2.3 Assumptions

- Existing OEMS tables and service methods remain available during migration.
- The application continues to use the current TypeScript, Drizzle, React, shadcn/ui, and Vitest patterns.
- External systems can provide source statuses, account data, customer data, product data, quotes, holdings, balances, and acknowledgements through existing or future adapters.
- Production rollout will use feature flags and role-based enablement.
- Local development can simulate external systems, but production certification must disable mock-mode defaults.

## 2.4 Constraints

- Existing orders must remain readable and auditable.
- Backward-compatible API behavior must be preserved until product-specific tickets are fully adopted.
- Changes to financial workflows require maker-checker controls and audit evidence.
- No production-critical validation rule may be stored only as ungoverned free-form JSON.
- UI must remain usable on desktop and tablet; mobile support is required for review and approval, not full complex ticket entry.
- The BRD is not itself regulatory approval. Compliance, legal, product, operations, and technology owners must certify the rule-control matrix before any product-family go-live.
- Full product-family modernization is not approved as one large release. ODA must prove the minimum trustworthy order spine before broader rollout.

## 2.5 Program Sequencing Principle

The modernization shall be executed as a controlled banking change program:

1. Foundation: product/security master, policy-to-rule matrix, validation decision log, workflow transition model, outbox/audit foundation, feature flags, and migration controls.
2. Proof slice: ODA product-specific ticket and lifecycle using the foundation end to end.
3. Expansion: MLD, FX Today, MF/Bond, and Wealth Lending only after ODA release gates pass.
4. Optimization: role cockpits, control tower, analytics, broad fee/tax/calendar enhancements, and advanced reconciliation dashboards.

# 3. User Roles And Permissions

| Role | Read permissions | Write permissions | Explicit denials |
|---|---|---|---|
| RM_MAKER | Customer, assigned portfolios, product catalog, own draft tickets | Create product-specific tickets, upload supporting documents, issue customer verification | Cannot approve own orders, change product master, certify adapters, override blocking rules |
| BRANCH_MAKER | Branch customers, branch order queue, approved products | Create branch-assisted tickets, capture branch evidence | Cannot approve own orders, modify global rules, execute treasury actions |
| BO_MAKER | Operational order queues, documents, validation findings | Repair returned tickets, upload/register documents, request verification, retry integrations | Cannot approve own work, change security master, waive risk rules |
| BO_CHECKER | Orders pending approval, repair history, audit evidence | Approve, reject, return, assign queue items | Cannot approve items where maker_user_id equals own user ID |
| TREASURY | ODA, FX Today, rate sources, treasury queue, blotters | Approve treasury SND, update rates, confirm treasury references, approve ODA treasury update | Cannot override compliance risk blocks or document blocks |
| COMPLIANCE_RISK | Risk profiles, validation findings, overrides, exception reports | Approve rule overrides within authority, mark risk review outcome | Cannot execute orders or alter external source acknowledgements |
| DOCUMENT_OPS | Document queues, checklist rules, DMS/NCBS statuses | Generate e-forms, register documents, retry DMS/NCBS, mark verified, request renewal | Cannot approve product/order financial decisions |
| INTEGRATION_OPS | Adapter catalog, messages, executions, reconciliation breaks | Certify adapters, replay dead letters, update adapter security within authority | Cannot alter order economics or approve orders |
| PRODUCT_GOVERNANCE | Product/security master, rule sets, fees, calendars, documents | Create and submit master data/rules for approval | Cannot approve own product/rule changes |
| SUPERVISOR | All queues, SLA, approvals, exceptions, reports | Reassign queues, approve escalations, authorize manual fallback | Cannot bypass immutable audit or approve if maker conflict exists |
| AUDITOR | Full read-only audit trail and reports | Export approved audit reports | Cannot create, edit, approve, cancel, execute, or replay anything |
| SYSTEM | Technical event processing | Write outbox, integration, notification, SLA, reconciliation state | Cannot initiate business approvals without a user event |

## 3.1 Operating Model RACI

| Control domain | Accountable owner | Responsible roles | Consulted roles | Evidence required |
|---|---|---|---|---|
| Product/security master | PRODUCT_GOVERNANCE_HEAD | PRODUCT_GOVERNANCE, BO_CHECKER | COMPLIANCE_RISK, TREASURY, INTEGRATION_OPS | Approved product record, maker/checker history |
| Policy-to-rule traceability | COMPLIANCE_RISK_HEAD | COMPLIANCE_RISK, PRODUCT_GOVERNANCE | Legal, Operations, Technology | Control matrix, rule version, test evidence |
| ODA order capture | OPERATIONS_HEAD | RM_MAKER, BRANCH_MAKER, BO_MAKER | TREASURY, COMPLIANCE_RISK | Ticket audit trail, validation decisions |
| Workflow approvals | OPERATIONS_HEAD | BO_CHECKER, SUPERVISOR | Audit | Queue decision, SLA evidence |
| Source-system SLA | TECHNOLOGY_OPS_HEAD | INTEGRATION_OPS | Source system owner, Operations | Adapter health, reconciliation evidence |
| Document controls | DOCUMENT_OPS_HEAD | DOCUMENT_OPS | BO_MAKER, Compliance | Document hash, DMS/NCBS evidence |
| Digital verification fallback | OPERATIONS_HEAD | SUPERVISOR, BO_CHECKER | COMPLIANCE_RISK | Fallback reason, customer impact, post-fallback reconciliation |
| Production incidents | TECHNOLOGY_OPS_HEAD | INTEGRATION_OPS, SUPPORT | Operations, Compliance, Product | Incident record, remediation, rule/test updates |
| Periodic rule recertification | COMPLIANCE_RISK_HEAD | COMPLIANCE_RISK, PRODUCT_GOVERNANCE | Audit, Legal | Quarterly attestation and exception list |

# 4. Data Model

The data model below defines the target new and modified entities required to implement the improvement program. Existing OEMS tables remain in place and are extended or referenced where possible.

## 4.1 Entity: ProductSecurityMaster

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| security_id | text | Yes | Unique, prefix `SEC-` | Generated |
| product_code | text | Yes | Unique uppercase code | None |
| product_family | enum | Yes | ODA, MLD, MUTUAL_FUND, BOND, FX_TODAY, WEALTH_LENDING | None |
| instrument_type | text | Yes | Controlled vocabulary by family | None |
| display_name | text | Yes | 3-200 chars | None |
| issuer_name | text | No | 1-200 chars | Null |
| isin | text | No | 12-char ISIN when present | Null |
| market | text | No | ISO or internal market code | ID |
| currency | text | Yes | ISO 4217 3-letter code | IDR |
| risk_score | integer | Yes | 1-6 | 1 |
| settlement_calendar_key | text | Yes | Must reference MarketCalendar | ID_BUSINESS |
| price_source | text | No | TREASURY, RBS, AVANTRADE, WEALTH_CORE, MANUAL_APPROVED | Null |
| tax_category | text | Yes | Must reference FeeTaxSchedule category | STANDARD |
| status | enum | Yes | DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, INACTIVE | DRAFT |
| effective_from | date | Yes | Must be <= effective_to when effective_to exists | Today |
| effective_to | date | No | Must be >= effective_from | Null |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |
| is_deleted | boolean | Yes | Soft delete only | false |

Relationships: one ProductSecurityMaster has many ProductRuleSet, FeeTaxSchedule, ProductDocumentRule, and ProductOrderTicket records.

Sample data:

| security_id | product_code | product_family | instrument_type | display_name | currency | risk_score | status |
|---|---|---|---|---|---|---:|---|
| SEC-ODA-USDIDR-001 | ODA-USD-IDR | ODA | DUAL_CURRENCY_DEPOSIT | USD/IDR Optimum Deposit | IDR | 4 | ACTIVE |
| SEC-MLD-IDR-001 | MLD-IDR-1T-NOTOUCH | MLD | NO_TOUCH_NOTE | IDR No Touch MLD Tranche | IDR | 5 | ACTIVE |
| SEC-BOND-IDGOV-10Y | IDGOV10Y | BOND | GOVERNMENT_BOND | Indonesia Government Bond 10Y | IDR | 3 | ACTIVE |

## 4.2 Entity: ProductRuleSet

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| rule_set_id | text | Yes | Unique, prefix `PRS-` | Generated |
| security_id | text | Yes | References ProductSecurityMaster | None |
| rule_type | enum | Yes | ELIGIBILITY, LIMIT, CUTOFF, VALIDATION, APPROVAL, DISTRIBUTION, SETTLEMENT | None |
| rule_code | text | Yes | Unique per version | None |
| version_no | integer | Yes | Positive integer | 1 |
| channel | enum | No | OEMS channel | Null means all |
| customer_segment | text | No | Controlled segment code | Null |
| rule_status | enum | Yes | DRAFT, PENDING_APPROVAL, ACTIVE, RETIRED | DRAFT |
| severity | enum | Yes | INFO, WARNING, BLOCKING | BLOCKING |
| override_role | text | No | Role allowed to override | Null |
| effective_from | date | Yes | Required | Today |
| effective_to | date | No | Must be >= effective_from | Null |
| condition_json | jsonb | Yes | Valid JSON schema for rule type | `{}` |
| action_json | jsonb | Yes | Valid JSON schema for rule type | `{}` |
| evidence_required | boolean | Yes | true when source proof required | true |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |
| is_deleted | boolean | Yes | Soft delete only | false |

Relationships: many ProductRuleSet records belong to one ProductSecurityMaster and are referenced by ValidationDecision.

Sample data:

| rule_set_id | security_id | rule_type | rule_code | severity | rule_status |
|---|---|---|---|---|---|
| PRS-001 | SEC-ODA-USDIDR-001 | LIMIT | ODA-MIN-PLACEMENT-IDR | BLOCKING | ACTIVE |
| PRS-002 | SEC-MLD-IDR-001 | CUTOFF | MLD-OFFERING-CUTOFF | BLOCKING | ACTIVE |
| PRS-003 | SEC-BOND-IDGOV-10Y | VALIDATION | BOND-HOLDINGS-SELL | BLOCKING | ACTIVE |

## 4.2A Entity: PolicyRuleTraceability

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| traceability_id | text | Yes | Unique, prefix `PRT-` | Generated |
| rule_set_id | text | Yes | References ProductRuleSet | None |
| policy_reference | text | Yes | Bank policy, product terms, or regulatory obligation reference | None |
| policy_owner_role | text | Yes | Accountable role | COMPLIANCE_RISK |
| control_objective | text | Yes | 20-500 chars | None |
| test_reference | text | Yes | Automated or UAT test ID | None |
| certification_status | enum | Yes | DRAFT, CERTIFIED, EXPIRED, REVOKED | DRAFT |
| certified_by | text | No | Required when CERTIFIED | Null |
| certified_at | timestamp | No | Required when CERTIFIED | Null |
| recertification_due_at | date | Yes | Future date | Quarter end |
| evidence_json | jsonb | Yes | Policy and test evidence | `{}` |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| traceability_id | rule_set_id | policy_reference | policy_owner_role | certification_status | test_reference |
|---|---|---|---|---|---|
| PRT-001 | PRS-001 | ODA Product Terms 4.2 | PRODUCT_GOVERNANCE | CERTIFIED | OEMS-ODA-MIN-001 |
| PRT-002 | PRS-002 | ODA Cutoff Policy 2.1 | OPERATIONS_HEAD | CERTIFIED | OEMS-ODA-COT-001 |
| PRT-003 | PRS-003 | Suitability Policy 5.4 | COMPLIANCE_RISK | DRAFT | OEMS-BOND-HOLD-001 |

## 4.3 Entity: ProductOrderTicket

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| ticket_id | text | Yes | Unique, prefix by family | Generated |
| order_id | text | No | References oems_orders after draft creation | Null |
| product_family | enum | Yes | In-scope family | None |
| security_id | text | Yes | Active ProductSecurityMaster unless manual exception | None |
| ticket_type | text | Yes | Product-specific ticket type | None |
| customer_id | text | Yes | Existing client ID | None |
| portfolio_id | text | Yes | Active portfolio ID | None |
| channel | enum | Yes | Existing OEMS channel | OEMS_DIRECT |
| transaction_type | text | Yes | Must be allowed by ProductRuleSet | None |
| amount | numeric | Yes | > 0 | None |
| quantity | numeric | No | Required for unit-based sell/switch | Null |
| currency | text | Yes | ISO 4217 | Product currency |
| source_status_json | jsonb | Yes | Required statuses by product | `{}` |
| product_payload_json | jsonb | Yes | Validated against family ticket schema | `{}` |
| capture_status | enum | Yes | DRAFT, READY_FOR_VALIDATION, VALIDATION_FAILED, READY_FOR_SUBMISSION, CANCELLED | DRAFT |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |
| is_deleted | boolean | Yes | Soft delete only | false |

Relationships: one ProductOrderTicket creates or references one OEMS order; one ticket has many ValidationDecision, DocumentRegistration, and DigitalVerificationRequest records.

Sample data:

| ticket_id | product_family | security_id | customer_id | transaction_type | amount | capture_status |
|---|---|---|---|---|---:|---|
| ODA-TCK-001 | ODA | SEC-ODA-USDIDR-001 | CIF-10001 | ODA_INTRADAY_BUY | 250000000 | READY_FOR_VALIDATION |
| MLD-TCK-001 | MLD | SEC-MLD-IDR-001 | CIF-10002 | MLD_SUBSCRIPTION | 500000000 | DRAFT |
| BND-TCK-001 | BOND | SEC-BOND-IDGOV-10Y | CIF-10003 | SELL | 100000000 | VALIDATION_FAILED |

## 4.4 Entity: ValidationDecision

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| decision_id | text | Yes | Unique, prefix `VAL-` | Generated |
| ticket_id | text | Yes | References ProductOrderTicket | None |
| order_id | text | No | References oems_orders | Null |
| rule_set_id | text | No | References ProductRuleSet | Null |
| rule_code | text | Yes | Non-empty | None |
| severity | enum | Yes | INFO, WARNING, BLOCKING | BLOCKING |
| result | enum | Yes | PASS, WARN, FAIL, PENDING_SOURCE | None |
| source_system | text | No | NCBS, RBS, AVANTRADE, TREASURY, WEALTH_CORE, OEMS | Null |
| message | text | Yes | User-facing deterministic message | None |
| override_allowed | boolean | Yes | True only when override_role exists | false |
| override_role | text | No | Required if override_allowed | Null |
| evidence_json | jsonb | Yes | Source snapshot or reason | `{}` |
| evaluated_at | timestamp | Yes | System timestamp | Now |
| created_by | text | Yes | User or SYSTEM | SYSTEM |
| is_deleted | boolean | Yes | Soft delete only | false |

Sample data:

| decision_id | ticket_id | rule_code | severity | result | source_system |
|---|---|---|---|---|---|
| VAL-001 | ODA-TCK-001 | ODA-MIN-PLACEMENT-IDR | BLOCKING | PASS | OEMS |
| VAL-002 | MLD-TCK-001 | MLD-90D-AVG-BALANCE | BLOCKING | PENDING_SOURCE | NCBS |
| VAL-003 | BND-TCK-001 | BOND-HOLDINGS-SELL | BLOCKING | FAIL | RBS |

## 4.5 Entity: WorkflowDefinition

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| workflow_id | text | Yes | Unique, prefix `WFD-` | Generated |
| workflow_code | text | Yes | Unique active code | None |
| product_family | enum | No | Null means cross-family | Null |
| ticket_type | text | No | Product-specific type | Null |
| trigger_status | text | Yes | Must be valid ticket/order status | READY_FOR_SUBMISSION |
| maker_roles | text[] | Yes | At least one role | `{BO_MAKER}` |
| checker_roles | text[] | Yes | At least one role | `{BO_CHECKER}` |
| required_approval_count | integer | Yes | 1-5 | 1 |
| sla_minutes | integer | Yes | 5-10080 | 240 |
| workflow_status | enum | Yes | DRAFT, ACTIVE, RETIRED | DRAFT |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |
| is_deleted | boolean | Yes | Soft delete only | false |

Sample data:

| workflow_id | workflow_code | product_family | trigger_status | checker_roles | sla_minutes |
|---|---|---|---|---|---:|
| WFD-001 | WF-ODA-BO-CHECK | ODA | PENDING_APPROVAL | `{BO_CHECKER}` | 120 |
| WFD-002 | WF-FX-TREASURY-SND | FX_TODAY | PENDING_APPROVAL | `{TREASURY}` | 30 |
| WFD-003 | WF-MFBOND-COMPLIANCE | BOND | EXCEPTION_REVIEW | `{COMPLIANCE_RISK}` | 240 |

## 4.6 Entity: WorkflowTransition

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| transition_id | text | Yes | Unique, prefix `WFT-` | Generated |
| workflow_id | text | Yes | References WorkflowDefinition | None |
| from_status | text | Yes | Controlled status | None |
| action_code | text | Yes | Controlled action | None |
| to_status | text | Yes | Controlled status | None |
| required_role | text | Yes | Existing role | None |
| side_effects_json | jsonb | Yes | Valid side-effect contract | `{}` |
| active | boolean | Yes | true or false | true |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| transition_id | workflow_id | from_status | action_code | to_status | required_role |
|---|---|---|---|---|---|
| WFT-001 | WFD-001 | PENDING_APPROVAL | APPROVE | APPROVED | BO_CHECKER |
| WFT-002 | WFD-002 | PENDING_APPROVAL | TREASURY_APPROVE | APPROVED | TREASURY |
| WFT-003 | WFD-003 | EXCEPTION_REVIEW | RETURN | RETURNED_FOR_REPAIR | COMPLIANCE_RISK |

## 4.7 Entity: FeeTaxSchedule

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| schedule_id | text | Yes | Unique, prefix `FTS-` | Generated |
| security_id | text | No | Null means family-level rule | Null |
| product_family | enum | Yes | In-scope family | None |
| fee_type | text | Yes | FRONT_END_LOAD, BROKERAGE, TAX, FACILITY_FEE, SPREAD | None |
| rate_type | enum | Yes | PERCENTAGE, FLAT, PER_UNIT, INFORMATIONAL | None |
| rate_value | numeric | No | Required unless informational | Null |
| min_fee | numeric | No | >= 0 | Null |
| max_fee | numeric | No | >= min_fee | Null |
| tax_jurisdiction | text | Yes | ID, GLOBAL, INTERNAL | ID |
| effective_from | date | Yes | Required | Today |
| effective_to | date | No | >= effective_from | Null |
| status | enum | Yes | DRAFT, ACTIVE, RETIRED | DRAFT |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| schedule_id | product_family | fee_type | rate_type | rate_value | tax_jurisdiction | status |
|---|---|---|---|---:|---|---|
| FTS-001 | MUTUAL_FUND | FRONT_END_LOAD | PERCENTAGE | 1.25 | ID | ACTIVE |
| FTS-002 | BOND | BROKERAGE | PERCENTAGE | 0.20 | ID | ACTIVE |
| FTS-003 | WEALTH_LENDING | FACILITY_FEE | PERCENTAGE | 0.50 | ID | ACTIVE |

## 4.8 Entity: MarketCalendar

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| calendar_key | text | Yes | Unique uppercase | None |
| market | text | Yes | Market or internal calendar code | None |
| timezone | text | Yes | IANA timezone | Asia/Jakarta |
| business_days | text[] | Yes | MON to SUN values | `{MON,TUE,WED,THU,FRI}` |
| holidays_json | jsonb | Yes | Array of ISO dates and reason | `[]` |
| cutoff_rules_json | jsonb | Yes | Time and action contracts | `{}` |
| status | enum | Yes | ACTIVE, RETIRED | ACTIVE |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| calendar_key | market | timezone | business_days | status |
|---|---|---|---|---|
| ID_BUSINESS | Indonesia | Asia/Jakarta | MON,TUE,WED,THU,FRI | ACTIVE |
| TREASURY_FX_ID | Treasury FX | Asia/Jakarta | MON,TUE,WED,THU,FRI | ACTIVE |
| GLOBAL_BOND | Global Bond | Asia/Jakarta | MON,TUE,WED,THU,FRI | ACTIVE |

## 4.9 Entity: DocumentRegistration

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| document_id | text | Yes | Unique, prefix `DOC-` | Generated |
| ticket_id | text | No | References ProductOrderTicket | Null |
| order_id | text | No | References oems_orders | Null |
| document_type | text | Yes | Controlled type | None |
| requirement_level | enum | Yes | REQUIRED, OPTIONAL, CONDITIONAL | REQUIRED |
| blocking_stage | enum | Yes | CAPTURE, SUBMISSION, EXECUTION, NONE | SUBMISSION |
| status | enum | Yes | MISSING, UPLOADED, SIGNED, VERIFIED, REGISTERED_DMS, REGISTERED_NCBS, WAIVED, REJECTED, EXPIRED, QUARANTINED | MISSING |
| file_hash | text | No | SHA-256 when file exists | Null |
| expected_file_hash | text | No | SHA-256 when template-bound | Null |
| dms_reference | text | No | DMS ID | Null |
| ncbs_reference | text | No | NCBS ID | Null |
| waiver_approval_id | text | No | Required for WAIVED | Null |
| expires_at | timestamp | No | Future date | Null |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| document_id | ticket_id | document_type | requirement_level | status | blocking_stage |
|---|---|---|---|---|---|
| DOC-001 | ODA-TCK-001 | CUSTOMER_CONFIRMATION | REQUIRED | SIGNED | SUBMISSION |
| DOC-002 | MLD-TCK-001 | TERM_SHEET | REQUIRED | MISSING | SUBMISSION |
| DOC-003 | BND-TCK-001 | CHERRY_PICK_LOTS | REQUIRED | VERIFIED | EXECUTION |

## 4.10 Entity: DigitalVerificationRequest

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| verification_id | text | Yes | Unique, prefix `DVS-` | Generated |
| ticket_id | text | No | References ProductOrderTicket | Null |
| order_id | text | No | References oems_orders | Null |
| method | enum | Yes | AUTH_LINK, OTP, MPIN, SOFT_TOKEN, DIGITAL_SIGNATURE | AUTH_LINK |
| provider | text | Yes | DANAMON_IDENTITY, SIGNATURE_GATEWAY, MANUAL_APPROVED | DANAMON_IDENTITY |
| status | enum | Yes | PENDING, SENT, CONFIRMED, FAILED, MANUAL_VERIFIED, EXPIRED, CANCELLED, LOCKED, INVALIDATED | PENDING |
| payload_hash | text | Yes | SHA-256 | Generated |
| max_attempts | integer | Yes | 1-5 | 3 |
| failed_attempts | integer | Yes | 0-max_attempts | 0 |
| expires_at | timestamp | Yes | Future timestamp | Now plus 15 minutes |
| fallback_allowed | boolean | Yes | true or false | false |
| fallback_role | text | No | Required for manual fallback | Null |
| signed_document_url | text | No | URL or storage key | Null |
| evidence_json | jsonb | Yes | Provider and user evidence | `{}` |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| verification_id | ticket_id | method | provider | status | max_attempts |
|---|---|---|---|---|---:|
| DVS-001 | ODA-TCK-001 | DIGITAL_SIGNATURE | SIGNATURE_GATEWAY | CONFIRMED | 3 |
| DVS-002 | FX-TCK-001 | AUTH_LINK | DANAMON_IDENTITY | SENT | 3 |
| DVS-003 | MLD-TCK-001 | OTP | DANAMON_IDENTITY | EXPIRED | 3 |

## 4.11 Entity: IntegrationAdapterCertification

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| certification_id | text | Yes | Unique, prefix `CERT-` | Generated |
| adapter_id | text | Yes | References existing adapter | None |
| target_system | text | Yes | Uppercase | None |
| contract_version | text | Yes | Semantic or system version | v1 |
| certification_status | enum | Yes | UNCERTIFIED, TESTING, CERTIFIED, REVOKED | UNCERTIFIED |
| mock_mode_allowed | boolean | Yes | false in production | false |
| idempotency_rule_json | jsonb | Yes | Required | `{}` |
| reconciliation_rule_json | jsonb | Yes | Required | `{}` |
| dead_letter_policy_json | jsonb | Yes | Required | `{}` |
| runbook_url | text | Yes | URL or internal path | None |
| owner_team | text | Yes | Team code | INTEGRATION_OPS |
| approved_by | text | No | Required when certified | Null |
| approved_at | timestamp | No | Required when certified | Null |
| created_by | text | Yes | User ID | Current user |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| certification_id | adapter_id | target_system | contract_version | certification_status | owner_team |
|---|---|---|---|---|---|
| CERT-001 | ADP-NCBS | NCBS | v1.2 | CERTIFIED | CORE_BANKING_OPS |
| CERT-002 | ADP-TREASURY | TREASURY | v2.0 | TESTING | TREASURY_TECH |
| CERT-003 | ADP-WEALTH-CORE | WEALTH_CORE | v1.4 | UNCERTIFIED | WEALTH_TECH |

## 4.12 Entity: OmsOutboxEvent

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| outbox_id | text | Yes | Unique, prefix `OUT-` | Generated |
| event_type | text | Yes | Uppercase code | None |
| aggregate_type | text | Yes | ORDER, TICKET, DOCUMENT, VERIFICATION, INTEGRATION | None |
| aggregate_id | text | Yes | Non-empty | None |
| payload_json | jsonb | Yes | Valid event payload | `{}` |
| publish_status | enum | Yes | PENDING, SENT, FAILED, DEAD_LETTER | PENDING |
| attempt_count | integer | Yes | >= 0 | 0 |
| next_attempt_at | timestamp | No | Required for retry | Null |
| last_error | text | No | Required for FAILED | Null |
| created_at | timestamp | Yes | System timestamp | Now |
| sent_at | timestamp | No | Set when SENT | Null |

Sample data:

| outbox_id | event_type | aggregate_type | aggregate_id | publish_status | attempt_count |
|---|---|---|---|---|---:|
| OUT-001 | ORDER_SUBMITTED | ORDER | OEMS-ORD-001 | SENT | 1 |
| OUT-002 | DOCUMENT_REGISTERED | DOCUMENT | DOC-002 | PENDING | 0 |
| OUT-003 | ADAPTER_EXECUTION_FAILED | INTEGRATION | MSG-003 | DEAD_LETTER | 5 |

## 4.13 Entity: OperatorQueueItem

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| queue_item_id | text | Yes | Unique, prefix `Q-` | Generated |
| queue_type | enum | Yes | CAPTURE_REPAIR, DOCUMENT, VERIFICATION, APPROVAL, TREASURY, INTEGRATION, RECONCILIATION, LTV_CURE | None |
| aggregate_type | text | Yes | TICKET, ORDER, DOCUMENT, VERIFICATION, INTEGRATION, FACILITY | None |
| aggregate_id | text | Yes | Non-empty | None |
| assigned_role | text | Yes | Role code | BO_CHECKER |
| assigned_user_id | text | No | User ID | Null |
| priority | enum | Yes | LOW, NORMAL, HIGH, CRITICAL | NORMAL |
| blocker_code | text | No | Rule or issue code | Null |
| blocker_message | text | No | User-facing action required | Null |
| sla_due_at | timestamp | Yes | Future timestamp | Now plus SLA |
| queue_status | enum | Yes | PENDING, CLAIMED, COMPLETED, RETURNED, ESCALATED, CANCELLED | PENDING |
| created_by | text | Yes | User or SYSTEM | SYSTEM |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| queue_item_id | queue_type | aggregate_type | aggregate_id | assigned_role | queue_status |
|---|---|---|---|---|---|
| Q-001 | APPROVAL | ORDER | OEMS-ORD-001 | BO_CHECKER | PENDING |
| Q-002 | DOCUMENT | DOCUMENT | DOC-002 | DOCUMENT_OPS | CLAIMED |
| Q-003 | INTEGRATION | INTEGRATION | MSG-003 | INTEGRATION_OPS | ESCALATED |

## 4.14 Entity: AuditEvent

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| audit_event_id | text | Yes | Unique, prefix `AUD-` | Generated |
| event_code | text | Yes | Uppercase code | None |
| aggregate_type | text | Yes | Controlled aggregate type | None |
| aggregate_id | text | Yes | Non-empty | None |
| actor_user_id | text | No | User or SYSTEM | Null |
| actor_role | text | No | Role code | Null |
| before_json | jsonb | No | Prior state | Null |
| after_json | jsonb | No | New state | Null |
| evidence_json | jsonb | Yes | Source evidence | `{}` |
| occurred_at | timestamp | Yes | System timestamp | Now |
| correlation_id | text | Yes | Request or workflow ID | Generated |

Sample data:

| audit_event_id | event_code | aggregate_type | aggregate_id | actor_role | correlation_id |
|---|---|---|---|---|---|
| AUD-001 | TICKET_CREATED | TICKET | ODA-TCK-001 | RM_MAKER | COR-001 |
| AUD-002 | VALIDATION_FAILED | TICKET | BND-TCK-001 | SYSTEM | COR-002 |
| AUD-003 | APPROVAL_DECIDED | ORDER | OEMS-ORD-001 | BO_CHECKER | COR-003 |

## 4.15 Entity: SourceSystemEvidence

| Field | Type | Required | Validation rules | Default |
|---|---|---:|---|---|
| evidence_id | text | Yes | Unique, prefix `SRC-` | Generated |
| ticket_id | text | No | References ProductOrderTicket | Null |
| order_id | text | No | References oems_orders | Null |
| source_system | text | Yes | NCBS, RBS, AVANTRADE, TREASURY, WEALTH_CORE, DMS, DBANK_PRO, CRM | None |
| evidence_type | text | Yes | HOLDINGS, BALANCE, CIF, QUOTE, DOCUMENT, RISK_PROFILE, ACCOUNT, ACK | None |
| evidence_status | enum | Yes | AVAILABLE, STALE, FAILED, PENDING, DEGRADED_APPROVED | PENDING |
| owner_role | text | Yes | Responsible operating role | INTEGRATION_OPS |
| source_timestamp | timestamp | No | Required when AVAILABLE or STALE | Null |
| stale_after_at | timestamp | No | Required for source data with freshness window | Null |
| failure_code | text | No | Required when FAILED | Null |
| fallback_approval_id | text | No | Required when DEGRADED_APPROVED | Null |
| evidence_payload | jsonb | Yes | Masked source payload | `{}` |
| created_by | text | Yes | User or SYSTEM | SYSTEM |
| created_at | timestamp | Yes | System timestamp | Now |
| updated_by | text | No | User ID | Null |
| updated_at | timestamp | Yes | System timestamp | Now |

Sample data:

| evidence_id | ticket_id | source_system | evidence_type | evidence_status | owner_role |
|---|---|---|---|---|---|
| SRC-001 | ODA-TCK-001 | TREASURY | QUOTE | AVAILABLE | TREASURY |
| SRC-002 | ODA-TCK-001 | NCBS | BALANCE | PENDING | INTEGRATION_OPS |
| SRC-003 | BND-TCK-001 | RBS | HOLDINGS | FAILED | INTEGRATION_OPS |

# 5. Functional Requirements

## FR-001 Product And Security Master

Description: The system shall provide a governed product/security master that becomes the authority for all in-scope OEMS product families. Product/security records must be effective-dated, approval-controlled, searchable, and referenced by all production order tickets.

User story: As a Product Governance user, I want to maintain structured product/security records so that every order is linked to an approved, active, and auditable product definition.

Acceptance criteria:

1. A product/security record cannot become ACTIVE until required identity, product family, currency, risk score, settlement calendar, and tax category fields are populated.
2. A maker cannot approve their own product/security change.
3. An order ticket cannot be submitted without active `security_id` unless a manual exception is approved by SUPERVISOR and COMPLIANCE_RISK.
4. Search supports product code, ISIN, product family, status, currency, and issuer.
5. Inactive products are visible for audit but not selectable for new orders.

Business rules:

- Product status transitions are DRAFT -> PENDING_APPROVAL -> ACTIVE or REJECTED.
- ACTIVE -> INACTIVE requires deactivation reason and checker approval.
- Effective date overlap for the same product code is blocked.

UI behavior:

- Save validates required fields inline.
- Submit for approval disables fields and creates a queue item.
- Rejected records reopen in repair mode with reviewer comments.

Edge cases and error handling:

- Duplicate product code returns `PRODUCT_CODE_DUPLICATE`.
- Missing calendar returns `CALENDAR_REQUIRED`.
- Date overlap returns `PRODUCT_EFFECTIVE_DATE_OVERLAP`.

## FR-002 Versioned Product Rules

Description: The system shall store eligibility, limits, cutoffs, validation, approval, distribution, settlement, document, and verification rules as versioned rule sets tied to product/security records. Rules must be executable by the validation service and explainable to users.

User story: As a Compliance and Risk user, I want validation and approval rules to be versioned and auditable so that every order decision can be reconstructed.

Acceptance criteria:

1. Rules have version number, effective date range, status, severity, and optional override role.
2. Only ACTIVE rules are used for new validation.
3. Retired rules remain visible for audit and historical replay.
4. Rule changes require maker-checker approval.
5. Validation results record the exact rule version used.
6. Every ACTIVE BLOCKING or WARNING rule has a certified PolicyRuleTraceability record before production use.

Business rules:

- BLOCKING rules prevent submission unless a configured override role approves an exception.
- PENDING_SOURCE results block submission until source response or approved degraded mode.
- Rule severity cannot be lowered in-place; a new version is required.
- Uncertified rules can run in simulation but cannot block or permit production orders.

UI behavior:

- Rule editor uses structured forms by rule type.
- JSON preview is read-only evidence, not the primary entry surface.

Edge cases and error handling:

- Invalid condition schema returns `RULE_SCHEMA_INVALID`.
- Missing override role on override-enabled rule returns `OVERRIDE_ROLE_REQUIRED`.
- Missing certified policy traceability returns `RULE_POLICY_TRACEABILITY_REQUIRED`.

## FR-002A Policy-To-Rule Traceability And Recertification

Description: The system shall require every executable product rule to map to an approved bank policy, product term, regulatory obligation, control objective, accountable owner, and test reference. The traceability record must be certified before the rule can be used in production.

User story: As a Compliance and Risk Head, I want every executable rule mapped to an approved control source so that the rules engine cannot become an unaudited compliance black box.

Acceptance criteria:

1. ACTIVE production rules require certified traceability.
2. Certification captures certifier, timestamp, recertification due date, policy reference, and test reference.
3. Expired traceability moves dependent rules to non-production simulation mode unless an extension is approved.
4. Rule change automatically invalidates prior certification and requires recertification.
5. Quarterly recertification report lists certified, expiring, expired, revoked, and orphaned rules.

Business rules:

- Compliance owns suitability, eligibility, override, and disclosure rules.
- Product Governance owns product-term and distribution rules.
- Operations owns cutoff, queue, and SLA rules.
- Finance owns fee/tax schedule certification.

UI behavior:

- Rule editor shows certification status and blocks production activation when traceability is missing or expired.

Edge cases and error handling:

- Activating uncertified rule returns `RULE_POLICY_TRACEABILITY_REQUIRED`.
- Expired certification returns `RULE_CERTIFICATION_EXPIRED`.

## FR-003 Product-Specific Order Tickets

Description: The system shall replace the generic production order wizard with product-specific ticket capture flows for ODA, MLD, Mutual Fund, Bond, FX Today, and Wealth Lending. Each ticket must capture all required domain fields before draft order creation.

User story: As an RM Maker, I want the order ticket to change based on product type so that I capture the right customer, account, product, source, document, and execution data the first time.

Acceptance criteria:

1. ODA ticket captures pair, direction, tenor, nominal, rate, effective type, value date, reference rate, cutoff, eligibility, and hold instruction.
2. MLD ticket captures tranche, amount, 90-day average balance, available balance, CIF status, callback requirement, documents, and debit account.
3. MF ticket captures transaction variant, source/target product for switch, SID/account/PFE/risk/static/sales certification statuses, quota, offering window, and documents.
4. Bond ticket captures buy/sell/switch/auction/buyback variant, price/yield, lots, holdings, custody account, pricing lock, and approval route.
5. FX Today ticket captures currency pair, dealt/counter/debit currencies, debit/credit accounts, special rate, quote hash, TTL, source statuses, underlying document, LHBU purpose code, and fallback reason.
6. Wealth Lending ticket captures facility, collateral, haircut, market prices, outstanding snapshot, LTV thresholds, cure terms, and instruction type.

Business rules:

- Ticket cannot move to READY_FOR_VALIDATION until all required fields for its product schema are complete.
- Missing source status is PENDING_SOURCE, not PASS.
- Manual fallback must capture reason, role, and evidence.
- ODA is the first product-family implementation slice. Other product family tickets remain behind feature flags until ODA proves minimum trustworthy order controls.

UI behavior:

- Product family selection routes to a dedicated ticket screen.
- Required source checks display as checklist rows with source, status, timestamp, and retry action.
- Draft creation is blocked before order creation when required capture fields are absent.

Edge cases and error handling:

- Missing holdings for redemption returns `HOLDINGS_REQUIRED`.
- Expired FX quote returns `QUOTE_EXPIRED`.
- Missing MLD tranche returns `TRANCHE_REQUIRED`.

## FR-004 Deterministic Validation Engine

Description: The system shall evaluate all order tickets through a deterministic validation engine that combines product rules, customer data, account data, holdings, cash, suitability, documents, verification, cutoffs, settlement calendars, fees, taxes, duplicate checks, and source-system status.

User story: As a Back Office Maker, I want validation findings to be deterministic and actionable so that I can repair orders without guessing.

Acceptance criteria:

1. Validation returns PASS, WARN, FAIL, or PENDING_SOURCE per rule.
2. Each finding includes rule code, severity, source, evidence, message, override eligibility, and repair hint.
3. Missing product/security, inactive product, family mismatch, transaction mismatch, expired risk profile, missing holdings, insufficient cash, and cutoff breach are BLOCKING.
4. Validation decisions persist before any status transition.
5. Repeat validation with unchanged inputs returns the same result set and correlation ID changes only by run.
6. Validation consumes SourceSystemEvidence records and distinguishes AVAILABLE, STALE, FAILED, PENDING, and DEGRADED_APPROVED states.

Business rules:

- WARN findings requiring acknowledgement block submission until acknowledged by authorized role.
- BLOCKING findings block submission unless a specific override path exists.
- Source unavailable findings block until source recovery or degraded-mode approval.
- Degraded-mode approval must specify customer impact, source owner, approval role, expiry, and reconciliation obligation.

UI behavior:

- Findings appear grouped by Capture, Product, Customer, Account, Risk, Document, Verification, Settlement, Fee/Tax, and Integration.
- Clicking a finding opens evidence and repair action.

Edge cases and error handling:

- Source timeout returns `SOURCE_TIMEOUT_PENDING`.
- Rule engine failure returns `VALIDATION_ENGINE_UNAVAILABLE` and blocks submission.
- Stale evidence returns `SOURCE_EVIDENCE_STALE`.

## FR-005 Formal Workflow Orchestration

Description: The system shall enforce state transitions through a central workflow engine instead of scattered direct status updates. Workflow definitions must control valid transitions, roles, side effects, queue creation, audit events, and SLA.

User story: As a Supervisor, I want order transitions governed by one workflow engine so that status, approval, notification, and audit evidence cannot diverge.

Acceptance criteria:

1. Every order status change uses a workflow transition or a documented system transition.
2. Invalid transition attempts return `WORKFLOW_TRANSITION_DENIED`.
3. Submit action creates the correct approval or operational queue item.
4. Approval decision writes both approval record and order status transition.
5. Workflow transitions emit audit event and outbox event in the same committed unit.

Business rules:

- Maker cannot approve own queue item.
- Required approval count must be met before status becomes APPROVED.
- Returned orders move to repair queue with reason.

UI behavior:

- Actions are shown only when the current user has role and status permission.
- Disabled actions show reason on hover.

Edge cases and error handling:

- Stale approval item returns `QUEUE_ITEM_ALREADY_DECIDED`.
- Missing workflow definition returns `WORKFLOW_NOT_CONFIGURED`.

## FR-006 Transactional Processing And Outbox

Description: Multi-table OEMS operations shall execute inside database transactions and emit side effects through an outbox. This prevents partial MLD, ODA, FX, MF/Bond, lending, document, approval, and integration state.

User story: As an Integration Operations user, I want committed order state and outbound messages to stay consistent so that retries and reconciliation are reliable.

Acceptance criteria:

1. MLD order creation commits order, detail, fund instruction, tranche amount, audit event, and outbox event atomically.
2. ODA group approval commits child order statuses, group status, treasury update, release/overbook instructions, audit event, and outbox event atomically.
3. FX approval commits order status, detail status, blotter entry, audit event, and outbox event atomically.
4. Outbox retry updates attempt count and dead-letter status after configured max attempts.
5. Failed transaction rolls back all writes in the unit.

Business rules:

- No external call is executed before database commit.
- External calls are triggered only by outbox workers or explicit replay.

UI behavior:

- Integration state displays PENDING, SENT, FAILED, DEAD_LETTER, and RECONCILED with replay controls.

Edge cases and error handling:

- Duplicate outbox idempotency key returns existing event state.
- Dead-letter replay requires INTEGRATION_OPS role and reason.

## FR-007 Embedded Documents And Digital Verification

Description: The order journey shall embed document checklist, upload, e-form generation, signing, DMS registration, NCBS registration, waiver, retry, verification issuance, resend, expiry, fallback, and signed document retrieval.

User story: As a Document Operations user, I want document and verification actions in the order journey so that I can complete customer evidence without leaving the ticket.

Acceptance criteria:

1. Document checklist is generated before submission.
2. Missing required documents block the configured stage.
3. Hash mismatch quarantines the document and creates a blocking finding.
4. Digital verification binds to order payload hash and invalidates when sensitive fields change.
5. Manual fallback requires eligible role, reason, evidence, and audit event.

Business rules:

- Waiver can only be approved by configured waiver role.
- Expired documents require renewal or approved waiver.
- Digital verification cannot be completed after expiry.

UI behavior:

- Document rows include Upload, Generate E-Form, Sign, Register DMS, Register NCBS, Retry, Waive, Renew, and View.
- Verification panel shows countdown, attempts, provider, payload hash, fallback eligibility, and signed document link.

Edge cases and error handling:

- Hash mismatch returns `DOCUMENT_HASH_MISMATCH`.
- Verification expired returns `VERIFICATION_EXPIRED`.

## FR-008 Certified Integrations And Reconciliation

Description: External integrations shall require certification before production activation. Adapter execution must support idempotency, masking, encryption, retry, dead-letter, replay, reconciliation, owner team, SLA, and runbook.

User story: As an Integration Operations user, I want adapters certified and reconciled so that production orders do not depend on ungoverned mocks or logging-only stubs.

Acceptance criteria:

1. Production adapter cannot be ACTIVE unless certification status is CERTIFIED.
2. Production adapter cannot use mock mode.
3. Each adapter has idempotency, retry, reconciliation, dead-letter, owner, and runbook configuration.
4. Failed messages enter retry and then dead-letter after max attempts.
5. Reconciliation break can be assigned, repaired, replayed, waived, or closed with evidence.
6. Each source system has an owner role, latency SLA, stale threshold, degraded-mode rule, and reconciliation responsibility.

Business rules:

- Replay requires INTEGRATION_OPS role and reason.
- Reconciliation closure requires evidence and cannot be performed by original maker when conflict rule applies.
- Source-system outage classification controls whether tickets block, wait, degrade, or route to manual fallback.

UI behavior:

- Adapter screen shows certification checklist and blockers.
- Reconciliation workbench shows unmatched messages, stale ACK, failed retry, and dead-letter items.

Edge cases and error handling:

- Missing certification returns `ADAPTER_NOT_CERTIFIED`.
- Production mock mode returns `MOCK_MODE_BLOCKED`.

## FR-008A Source Failure And Degraded-Mode Handling

Description: The system shall define explicit behavior for unavailable, stale, contradictory, or delayed source-system evidence. Operators must see who owns the source issue, what action is allowed, and what reconciliation is required after fallback.

User story: As an Integration Operations user, I want source-system failures classified and routed so that orders do not proceed on ambiguous evidence.

Acceptance criteria:

1. Every source evidence row has owner role, status, timestamp, stale threshold, and next action.
2. PENDING source evidence blocks submission unless the product rule allows waitlisted capture.
3. STALE evidence blocks production unless stale use is explicitly permitted by rule and approved by required role.
4. FAILED evidence routes to integration queue with retry or manual fallback options.
5. DEGRADED_APPROVED evidence creates a reconciliation obligation and expiry.

Business rules:

- Manual fallback never closes the source evidence item; it creates a post-fallback reconciliation item.
- Customer-facing impact must be captured for fallback on customer confirmation, document, quote, holdings, balance, or account source failures.

UI behavior:

- Source checklist displays source, status, age, owner, SLA, retry, fallback, and reconciliation obligation.

Edge cases and error handling:

- Contradictory source data returns `SOURCE_CONFLICT_REVIEW_REQUIRED`.
- Fallback without owner returns `SOURCE_OWNER_REQUIRED`.

## FR-009 Fee, Tax, And Calendar Engine

Description: The system shall replace hardcoded charge, tax, and settlement assumptions with effective-dated fee/tax schedules and market calendars.

User story: As a Back Office Checker, I want fees, taxes, and settlement dates calculated from approved schedules and calendars so that order economics are correct and auditable.

Acceptance criteria:

1. Fee and tax schedule is selected by product family, security, transaction type, market, customer segment, and effective date.
2. Settlement date is calculated with configured market calendar and holiday rules.
3. Fee/tax result includes schedule ID and version in the order charge record.
4. Missing schedule blocks submission unless fee is explicitly informational.
5. Hardcoded jurisdiction formulas are not used in production charge calculation.

Business rules:

- Fee waiver requires configured approval role.
- Calendar missing for product blocks submission.

UI behavior:

- Charge preview shows fee type, schedule ID, rate, base, amount, tax, net, settlement date, and warnings.

Edge cases and error handling:

- Missing fee schedule returns `FEE_SCHEDULE_MISSING`.
- Holiday adjustment returns adjusted date with reason.

## FR-010 Role-Based Control Tower And Queues

Description: The workbench shall evolve into role-based cockpits with queue metrics, SLA aging, blocker reason, next action, assigned owner, and audit drilldown.

User story: As a Supervisor, I want role-specific queues and a control tower so that I can manage operational risk, SLA, and exceptions in real time.

Acceptance criteria:

1. Queues are available for capture repair, documents, verification, approval, treasury, integration, reconciliation, and LTV cure.
2. Each queue item shows priority, SLA due time, blocker code, next action, assigned role/user, and age.
3. Supervisor can reassign queue items with reason.
4. Queue completion writes audit event.
5. Control tower charts refresh within 60 seconds in normal load.

Business rules:

- Critical queue items escalate before SLA breach based on configured percentage.
- Queue item cannot be completed while blocking findings remain unresolved.

UI behavior:

- Users land on their role cockpit, not the generic all-tabs workbench.
- Filters persist per user.

Edge cases and error handling:

- Queue claim conflict returns `QUEUE_ALREADY_CLAIMED`.
- Reassign without reason returns `REASSIGN_REASON_REQUIRED`.

## FR-011 Audit Replay And Evidence

Description: Every critical action shall write immutable audit events with before/after state, actor, role, correlation ID, and evidence. Auditors must be able to replay an order timeline.

User story: As an Auditor, I want to replay the complete lifecycle of an order so that I can verify compliance and operational controls.

Acceptance criteria:

1. Ticket creation, validation, document, verification, approval, integration, execution, cancellation, and settlement actions write audit events.
2. Audit event cannot be edited or deleted from UI.
3. Timeline view groups events by order, ticket, document, verification, integration, and workflow.
4. Export includes event code, actor, role, timestamp, before, after, evidence, and correlation ID.
5. Audit query supports product family, customer, order, actor, role, event code, and date range.

Business rules:

- Audit export requires AUDITOR or SUPERVISOR role.
- Sensitive payloads are masked unless user has explicit audit-sensitive permission.

UI behavior:

- Timeline is read-only with expandable evidence panels.

Edge cases and error handling:

- Missing audit event on critical transition fails test and blocks release.

## FR-012 Migration And Feature Flags

Description: The modernization shall be released through backward-compatible migrations and feature flags so existing OEMS operations continue while new product-specific flows are introduced.

User story: As an Operations Supervisor, I want gradual rollout controls so that the team can adopt the new OMS without interrupting active order processing.

Acceptance criteria:

1. Existing orders remain readable after migration.
2. Feature flag controls product-specific tickets by product family and role.
3. Existing generic wizard is retained as internal fallback until all product family flows are live.
4. Migration report identifies orders without product/security reference.
5. Rollback plan preserves data written by old flows.
6. ODA migration runbook covers open orders, in-flight approvals, legacy documents, source evidence, product mapping exceptions, and orders created during rollout.

Business rules:

- New production orders must use product-specific tickets once family flag is enabled.
- Fallback generic wizard requires SUPERVISOR role and reason after cutover.
- Mixed old/new state must route to a compatibility queue before cutover completion.

UI behavior:

- Feature flag disabled shows existing screen.
- Feature flag enabled redirects create order action to product-specific ticket launcher.

Edge cases and error handling:

- Missing migration mapping returns `SECURITY_MAPPING_REQUIRED`.
- In-flight order conflict returns `MIXED_WORKFLOW_STATE_REVIEW_REQUIRED`.

## FR-013 ODA-First Proof Slice

Description: The first implementation release shall prove the minimum trustworthy order through the ODA product family before other product families are migrated. This slice must include active security reference, structured ODA capture, rule-policy traceability, validation decisions, source evidence, workflow queue, maker-checker approval, audit event, outbox event, and negative-path tests.

User story: As an Operations Head, I want ODA to prove the new OMS control spine before broader rollout so that the bank does not deploy partially controlled workflows across all products.

Acceptance criteria:

1. ODA ticket cannot be created as production-intent without active `security_id`.
2. ODA disallowed transaction type, inactive product, missing source evidence, cutoff breach, and maker self-approval are blocked by tests.
3. ODA submit creates approval queue, audit event, and outbox event through the workflow engine.
4. ODA order lifecycle can be replayed from audit events with rule version and source evidence.
5. Generic order wizard is blocked for ODA production order creation when ODA feature flag is enabled, except supervisor fallback with reason.

Business rules:

- ODA release gate must pass before MLD, FX Today, MF/Bond, or Wealth Lending implementation begins.
- ODA UAT must include happy path, repair path, source failure path, approval return path, and rollback rehearsal.

UI behavior:

- ODA launcher opens a dedicated ODA ticket screen.
- ODA ticket shows capture completeness, source evidence, validation decisions, documents, verification, queue status, and audit timeline.

Edge cases and error handling:

- Missing ODA security mapping returns `ODA_SECURITY_MAPPING_REQUIRED`.
- ODA source timeout returns `ODA_SOURCE_TIMEOUT_PENDING`.

## FR-014 Post-Launch Control Ownership

Description: The system and operating process shall define durable ownership for product master changes, rule changes, source SLAs, exception queues, audit disputes, reconciliation breaks, production incidents, and periodic recertification.

User story: As an Auditor, I want clear post-launch ownership and recertification evidence so that the OMS remains controlled after go-live.

Acceptance criteria:

1. Every rule, queue type, source system, adapter, report, and exception class has an accountable owner role.
2. Rule recertification report is generated at least quarterly.
3. Production incidents can link to affected rules, orders, source evidence, and remediation tests.
4. Reconciliation breaks cannot be closed without owner, evidence, and reason.
5. Control owner attestation history is retained for audit.

Business rules:

- Source-system SLA breach escalates to accountable owner before the queue SLA expires.
- Repeated incident class requires rule/test review before closure.

UI behavior:

- Control ownership screen lists domain, owner, SLA, open exceptions, last attestation, and next recertification due date.

Edge cases and error handling:

- Missing owner on a production control returns `CONTROL_OWNER_REQUIRED`.

# 6. User Interface Requirements

Design system: Use existing React, Tailwind, shadcn/ui, Radix primitives, lucide icons, data tables, forms, dialogs, badges, toasts, tabs, and existing app navigation patterns. Screens must be dense, operational, keyboard-friendly, and role-specific. Avoid marketing layouts and free-form JSON input for production workflows.

## 6.1 Product/Security Master Screen

Purpose: Govern product/security definitions.

Layout: Header with filters and Create button; table with product code, family, instrument, currency, risk score, status, effective dates; right-side detail drawer; create/edit modal with sections for identity, economics, settlement, source systems, documents, rules, and approval history.

Navigation: Operations -> Danamon OEMS -> Setup -> Product/Security Master.

Responsive behavior: Desktop table is primary. Tablet shows condensed columns and detail drawer. Mobile is read-only list plus approval actions.

## 6.2 Product Rule Set Screen

Purpose: Configure executable product rules.

Layout: Product selector at top; grouped rule tabs for Eligibility, Limits, Cutoffs, Validation, Approval, Settlement, Documents, Verification, Fee/Tax; rule table; structured rule editor; read-only JSON preview.

Navigation: From Product/Security Master detail or Setup tab.

Responsive behavior: Rule table condenses to cards on tablet.

## 6.3 Product Ticket Launcher

Purpose: Start order capture with product-specific flow.

Layout: Role-specific panel with product family icons, recent products, customer search, product search, channel selector, and create ticket action.

Navigation: Operations -> Danamon OEMS -> Orders -> New Order.

Responsive behavior: Cards collapse to two columns on tablet and one column on mobile.

## 6.4 ODA Ticket Screen

Purpose: Capture and validate ODA order.

Layout: Customer/account panel, product/rate panel, ODA details, source status checklist, document checklist, validation findings, charge preview, submit action bar.

Key components: Selects, numeric inputs, date picker, source checklist, validation accordion, charge table.

Happy path: user selects customer and active ODA security, enters direction/tenor/rate/value date, source evidence is available, validation passes, documents and verification are completed, and submit creates an approval queue.

Repair path: validation finding opens the exact field/source/rule to repair, user updates the ticket or refreshes source evidence, revalidates, and proceeds only after blockers clear.

## 6.5 MLD Ticket Screen

Purpose: Capture MLD subscription and tranche workflow.

Layout: Tranche summary, offering window, customer/account, balance evidence, callback, document pack, validation, approval status.

Key components: Tranche selector, quota progress, callback panel, document checklist.

## 6.6 MF/Bond Ticket Screen

Purpose: Capture Mutual Fund and Bond orders with transaction variants.

Layout: Variant selector, source/target products, holdings/cash, SID/PFE/static/risk/source statuses, lot picker for bond sell/switch, price lock, validation, handoff status.

Key components: Segmented controls, searchable security selects, holdings table, lot picker, source status table.

## 6.7 FX Today Ticket Screen

Purpose: Capture and confirm FX Today special-rate orders.

Layout: Currency pair and quote panel with countdown, accounts, source status checklist, underlying document panel, customer verification, Treasury SND, LHBU, approval, settlement.

Key components: Rate countdown, hash badge, account selectors, document upload, confirmation actions.

## 6.8 Wealth Lending Cockpit

Purpose: Manage lending facility, collateral, M2M, cure, and instructions.

Layout: Facility header, collateral table, price/outstanding snapshots, LTV chart, cure action panel, instruction history, visibility publish status.

Key components: Data tables, charts, action drawer, status badges.

## 6.9 Role Queue Cockpits

Purpose: Let users work their queue.

Layout: KPI strip, queue filters, priority/SLA table, detail drawer, action toolbar, audit timeline.

Navigation: Role landing page after login or Danamon OEMS -> Queues.

## 6.10 Control Tower

Purpose: Supervisor real-time operational overview.

Layout: KPI grid, SLA aging chart, blocker heatmap, integration failure chart, queue distribution, product family throughput, drilldown tables.

Launch sequencing: Control tower is not part of the first production release. It becomes release scope only after ODA audit/event/outbox data is reliable.

## 6.11 Audit Replay Screen

Purpose: Read-only event timeline.

Layout: Search panel, timeline grouped by correlation ID, expandable evidence panels, export button.

# 7. API And Integration Requirements

## 7.1 Authentication

Use the existing application authentication and role model. APIs must require authenticated users and enforce role permissions in service and route layers.

## 7.2 Standard Error Response

All new APIs return this error shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Product code is required",
    "field": "product_code",
    "correlationId": "COR-20260506-0001"
  }
}
```

## 7.3 Internal API Endpoints

| Method | Path | Purpose | Success | Error codes |
|---|---|---|---|---|
| POST | `/api/v1/oems/product-security-master` | Create product/security draft | 201 ProductSecurityMaster | PRODUCT_CODE_DUPLICATE, CALENDAR_REQUIRED |
| POST | `/api/v1/oems/product-security-master/:securityId/submit` | Submit for approval | 200 ProductSecurityMaster | WORKFLOW_NOT_CONFIGURED |
| POST | `/api/v1/oems/product-rule-sets` | Create product rule set | 201 ProductRuleSet | RULE_SCHEMA_INVALID |
| POST | `/api/v1/oems/tickets/:family` | Create product-specific ticket | 201 ProductOrderTicket | CAPTURE_FIELD_REQUIRED |
| POST | `/api/v1/oems/tickets/:ticketId/validate` | Run validation engine | 200 ValidationResult | VALIDATION_ENGINE_UNAVAILABLE |
| POST | `/api/v1/oems/tickets/:ticketId/submit` | Submit ticket to workflow | 200 Order | BLOCKING_FINDINGS_EXIST |
| POST | `/api/v1/oems/workflow/queue/:queueItemId/decision` | Approve, reject, return | 200 QueueItem | QUEUE_ITEM_ALREADY_DECIDED |
| POST | `/api/v1/oems/documents/:documentId/action` | Execute document action | 200 DocumentRegistration | DOCUMENT_HASH_MISMATCH |
| POST | `/api/v1/oems/verifications/:verificationId/action` | Execute verification action | 200 DigitalVerificationRequest | VERIFICATION_EXPIRED |
| POST | `/api/v1/oems/integration-adapters/:adapterId/certify` | Certify adapter | 200 Certification | ADAPTER_NOT_CERTIFIED |
| POST | `/api/v1/oems/outbox/:outboxId/replay` | Replay dead-letter event | 202 OutboxEvent | REPLAY_REASON_REQUIRED |

## 7.4 Complex Endpoint Examples

### Create Bond Ticket Request

```json
{
  "productFamily": "BOND",
  "securityId": "SEC-BOND-IDGOV-10Y",
  "customerId": "CIF-10003",
  "portfolioId": "PF-30003",
  "channel": "BRANCH",
  "transactionType": "SELL",
  "amount": 100000000,
  "quantity": 100000000,
  "currency": "IDR",
  "productPayload": {
    "price": 98.25,
    "yield": 6.95,
    "custodyAccountNo": "CUST-001",
    "selectedLots": [
      { "lotId": "LOT-001", "nominal": 60000000 },
      { "lotId": "LOT-002", "nominal": 40000000 }
    ]
  },
  "sourceStatus": {
    "holdings": "AVAILABLE",
    "staticData": "SYNCED",
    "riskProfile": "CURRENT",
    "pfe": "CAPTURED",
    "salesCertification": "ACTIVE"
  }
}
```

### Create Bond Ticket Response

```json
{
  "ticketId": "BND-TCK-001",
  "captureStatus": "READY_FOR_VALIDATION",
  "requiredNextAction": "VALIDATE",
  "correlationId": "COR-20260506-0002"
}
```

### Validate Ticket Response

```json
{
  "ticketId": "BND-TCK-001",
  "overallResult": "FAIL",
  "hasBlocking": true,
  "findings": [
    {
      "ruleCode": "BOND-HOLDINGS-SELL",
      "severity": "BLOCKING",
      "result": "FAIL",
      "sourceSystem": "RBS",
      "message": "Requested sell quantity exceeds available settled holdings.",
      "repairHint": "Reduce selected lots or refresh holdings.",
      "overrideAllowed": false
    }
  ],
  "correlationId": "COR-20260506-0003"
}
```

### Workflow Decision Request

```json
{
  "decision": "APPROVED",
  "comment": "Documents, customer verification, and source validations reviewed.",
  "reviewerRole": "BO_CHECKER"
}
```

### Adapter Certification Request

```json
{
  "targetSystem": "NCBS",
  "contractVersion": "v1.2",
  "mockModeAllowed": false,
  "idempotencyRule": { "keyFields": ["messageType", "entityId", "payloadHash"] },
  "reconciliationRule": { "ackDeadlineMinutes": 15, "matchingFields": ["entityId", "externalRef"] },
  "deadLetterPolicy": { "maxAttempts": 5, "escalationRole": "INTEGRATION_OPS" },
  "runbookUrl": "/docs/runbooks/ncbs-oems.md",
  "ownerTeam": "CORE_BANKING_OPS"
}
```

## 7.5 External Services

| System | Purpose | Required controls |
|---|---|---|
| NCBS | CIF, account, balance, hold, overbook, document registration | Certified adapter, idempotency, reconciliation, retry |
| RBS | Holdings, risk, market data, collateral | Certified adapter, source timestamp, stale-price policy |
| Avantrade | Wealth product, holdings, market prices | Certified adapter, reconciliation |
| Treasury | ODA/FX rates, SND approval, treasury references | Quote hash, TTL, SLA, reconciliation |
| Wealth Core | MF/Bond setup, SID/PFE, handoff | Contract validation, source status, handoff ACK |
| DMS | Document registration and retrieval | Hash evidence, retry, quarantine |
| DBank Pro | Wealth lending visibility and overdraft block | Idempotent instructions, reconciliation |
| CRM | Assisted channels and notifications | Channel session validation |

## 7.5A Source Ownership And Failure Classes

| Failure class | Meaning | Default behavior | Owner | Required evidence |
|---|---|---|---|---|
| PENDING | Source request not completed within synchronous window | Block submission and route to source queue | INTEGRATION_OPS | Request ID, timestamp, SLA |
| STALE | Source data exists but is past freshness threshold | Block unless stale use rule and approval exist | Source owner role | Source timestamp, stale threshold, approver |
| FAILED | Source returned negative technical status | Block and retry or dead-letter | INTEGRATION_OPS | Error code, retry attempts |
| CONFLICT | Two sources disagree or source conflicts with OEMS state | Block and route to conflict review | COMPLIANCE_RISK or source owner | Conflicting payload snapshots |
| DEGRADED_APPROVED | Authorized temporary use without current source success | Permit only for configured stage and expiry | SUPERVISOR plus domain owner | Customer impact, reason, reconciliation task |

## 7.6 Rate Limiting

- Ticket create/update: 60 requests per user per minute.
- Validation: 30 requests per ticket per hour.
- Adapter replay: 10 requests per adapter per hour.
- Audit export: 5 exports per user per hour.

# 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Product search p95 under 500 ms; ticket validation p95 under 2 seconds when sources are cached; queue list p95 under 1 second for 10,000 open items. |
| Concurrency | Support 500 concurrent back-office users and 5,000 daily OEMS orders in v1 target. |
| Security | Role-based access, maker-checker separation, masked sensitive payloads, encrypted configured fields, OWASP Top 10 controls, audit export permissions. |
| Availability | 99.9 percent monthly availability for internal OEMS. |
| Recovery | RPO 15 minutes, RTO 2 hours for production database and event/outbox records. |
| Scalability | Queue, validation, outbox, and reconciliation workers must scale horizontally by product family and target system. |
| Accessibility | WCAG 2.1 AA for core workflows. |
| Browser support | Latest Chrome, Edge, Safari desktop; tablet support for approvals and queues. |
| Observability | Structured logs with correlation ID; dashboards for validation, workflow, integration, queue, and SLA metrics. |
| Data retention | Audit, approval, validation, and integration evidence retained according to bank policy and never hard-deleted through UI. |

# 9. Workflow And State Diagrams

## 9.1 Product/Security Master Workflow

| Current state | Action | Actor | Next state | Side effects |
|---|---|---|---|---|
| DRAFT | Save | PRODUCT_GOVERNANCE | DRAFT | Audit event PRODUCT_SAVED |
| DRAFT | Submit | PRODUCT_GOVERNANCE | PENDING_APPROVAL | Approval queue item created |
| PENDING_APPROVAL | Approve | BO_CHECKER or PRODUCT_GOVERNANCE_CHECKER | ACTIVE | Product selectable for tickets |
| PENDING_APPROVAL | Reject | Checker | REJECTED | Repair queue item created |
| ACTIVE | Deactivate | Product Governance maker | PENDING_APPROVAL | Deactivation approval queue |
| PENDING_APPROVAL | Approve deactivation | Checker | INACTIVE | Product removed from new ticket selection |

## 9.2 Ticket To Order Workflow

| Current state | Action | Actor | Next state | Side effects |
|---|---|---|---|---|
| DRAFT | Complete capture | Maker | READY_FOR_VALIDATION | Capture completeness audit |
| READY_FOR_VALIDATION | Validate | Maker or SYSTEM | VALIDATION_FAILED | Findings persisted, repair queue created |
| READY_FOR_VALIDATION | Validate | Maker or SYSTEM | READY_FOR_SUBMISSION | Validation decisions persisted |
| READY_FOR_SUBMISSION | Submit | Maker | PENDING_DOCUMENTS | Document queue created |
| READY_FOR_SUBMISSION | Submit | Maker | PENDING_CUSTOMER_VERIFICATION | Verification issued |
| READY_FOR_SUBMISSION | Submit | Maker | PENDING_APPROVAL | Approval queue created |
| PENDING_APPROVAL | Approve | Checker | APPROVED | Integration/outbox event created |
| PENDING_APPROVAL | Return | Checker | RETURNED_FOR_REPAIR | Repair queue created |
| PENDING_APPROVAL | Reject | Checker | REJECTED | Customer and maker notified |
| APPROVED | Execute | Product-specific executor | EXECUTED | Blotter/integration events |
| EXECUTED | Book/settle | SYSTEM or Ops | BOOKED/SETTLED | Reconciliation events |

## 9.3 Document Workflow

| Current state | Action | Actor | Next state | Side effects |
|---|---|---|---|---|
| MISSING | Upload | Maker or DOCUMENT_OPS | UPLOADED | Hash calculated |
| UPLOADED | Verify hash | DOCUMENT_OPS | VERIFIED | Document readiness recalculated |
| UPLOADED | Hash mismatch | SYSTEM | QUARANTINED | Blocking finding created |
| VERIFIED | Register DMS | DOCUMENT_OPS or SYSTEM | REGISTERED_DMS | DMS outbox event |
| REGISTERED_DMS | Register NCBS | DOCUMENT_OPS or SYSTEM | REGISTERED_NCBS | NCBS outbox event |
| MISSING | Waive | Authorized waiver role | WAIVED | Waiver audit event |
| EXPIRED | Renew | Maker or DOCUMENT_OPS | UPLOADED | Renewal audit event |

## 9.4 Integration Workflow

| Current state | Action | Actor | Next state | Side effects |
|---|---|---|---|---|
| PENDING | Publish | SYSTEM | SENT | Attempt count increments |
| SENT | Acknowledge | Target system | ACKNOWLEDGED | Reconciliation timer starts |
| SENT | Fail | SYSTEM | FAILED | Retry scheduled |
| FAILED | Retry before max | SYSTEM | PENDING | Outbox retry event |
| FAILED | Max attempts reached | SYSTEM | DEAD_LETTER | Integration queue escalated |
| DEAD_LETTER | Replay | INTEGRATION_OPS | PENDING | Replay audit event |
| ACKNOWLEDGED | Reconcile | SYSTEM | RECONCILED | Break closed |

# 10. Notification And Communication Requirements

| Event | Channel | Recipient | Trigger | Template |
|---|---|---|---|---|
| PRODUCT_PENDING_APPROVAL | In-app, email | Product checker | Product submitted | `Product {product_code} is pending approval.` |
| TICKET_VALIDATION_FAILED | In-app | Ticket maker | Blocking validation finding | `Ticket {ticket_id} has blocking findings: {codes}.` |
| DOCUMENT_REQUIRED | In-app | DOCUMENT_OPS | Submission blocked by document | `Document {document_type} is required for {ticket_id}.` |
| VERIFICATION_SENT | SMS/email/push | Customer | Digital verification issued | `Please verify transaction {order_no} before {expiry}.` |
| VERIFICATION_EXPIRED | In-app | Maker, BO_MAKER | Verification expired | `Verification expired for {order_no}. Reissue or request fallback.` |
| APPROVAL_PENDING | In-app | Assigned checker role | Order submitted | `Order {order_no} is pending your approval.` |
| APPROVAL_RETURNED | In-app | Maker | Checker returns order | `Order {order_no} was returned: {reason}.` |
| INTEGRATION_DEAD_LETTER | In-app, email | INTEGRATION_OPS | Retry exhausted | `Message {message_id} moved to dead letter.` |
| RECONCILIATION_BREAK | In-app | INTEGRATION_OPS | ACK not reconciled by SLA | `Reconciliation break for {target_system} and {entity_id}.` |
| LTV_BREACH | In-app, email, SMS if configured | Lending ops, RM | Wealth lending M2M breach | `Facility {facility_no} breached LTV. Cure due {date}.` |

Notification preferences: Customers can opt out of promotional messages, not transactional verification messages. Internal users can configure digest frequency but cannot disable critical alerts assigned to their role.

# 11. Reporting And Analytics

| Report | Audience | Data sources | Filters | Refresh |
|---|---|---|---|---|
| Order Control Tower | Supervisors | Tickets, orders, queues, validation, integrations | Product family, branch, channel, status, date | 60 seconds |
| Validation Failure Heatmap | Risk, Ops | ValidationDecision | Rule code, source, product, channel | 5 minutes |
| Approval SLA Report | Supervisors, Audit | Workflow, Queue, AuditEvent | Role, user, product, branch | 5 minutes |
| Document Aging Report | Document Ops | DocumentRegistration | Type, status, product, due date | 15 minutes |
| Digital Verification Report | Ops, Risk | DigitalVerificationRequest | Provider, method, status, channel | 5 minutes |
| Integration Reliability Report | Integration Ops | Outbox, adapters, executions | Target system, status, SLA | 5 minutes |
| Product Governance Report | Product Governance | ProductSecurityMaster, ProductRuleSet | Status, effective date, maker, checker | Daily |
| Fee/Tax Exception Report | Finance, Ops | FeeTaxSchedule, charges, audit | Product, fee type, waiver | Daily |
| Audit Replay Export | Auditor | AuditEvent | Order, customer, actor, event, date | On demand |

Metric calculations:

- Approval SLA compliance = completed approvals within SLA / total completed approvals.
- Validation failure rate = tickets with blocking finding / total validated tickets.
- Reconciliation break rate = unreconciled messages past SLA / total acknowledged messages.
- Document completion rate = tickets with all required docs ready / submitted tickets.

# 12. Migration And Launch Plan

## 12.1 Data Migration Needs

- Map existing `oems_products` to ProductSecurityMaster.
- Map ODA-specific product fields into structured ODA rule sets.
- Map MLD tranches to ProductSecurityMaster and ProductRuleSet where applicable.
- Backfill security references on open orders where product_id exists.
- Produce exception file for orders without product/security mapping.
- Preserve existing order, document, verification, integration, and approval data.

## 12.2 Phased Rollout

| Release | Scope | Exit criteria |
|---|---|---|
| v1 | Minimum trustworthy order foundation: security master, policy-to-rule traceability, source evidence, validation decisions, workflow transitions, audit/outbox, feature flags | Foundation tests pass; ODA migration runbook approved |
| v2 | ODA-first proof slice with dedicated ticket, validation, source evidence, workflow queue, audit replay, outbox, and rollback rehearsal | ODA happy, repair, source failure, approval return, and rollback tests pass |
| v3 | MLD and FX Today product slices after ODA gate | MLD and FX E2E tests pass with source failure handling |
| v4 | MF/Bond and Wealth Lending product slices, fee/tax/calendar enhancements | MF/Bond and lending tests pass |
| v5 | Certified integration expansion, reconciliation workbench, role cockpits, control tower | UAT, smoke, audit, support, and operational readiness pass |

## 12.3 Go-Live Checklist

- All migrations applied in staging and verified.
- Feature flags configured by role and product family.
- Production adapters certified and mock mode disabled.
- Backfill report reviewed and exceptions approved.
- Operational runbooks published.
- Support users trained on queue workflows.
- Rollback plan rehearsed.
- Audit replay sample validated by audit role.
- ODA minimum trustworthy order gate passed.
- Policy-to-rule matrix certified for enabled product families.
- Source ownership and failure handling runbook approved.
- Post-launch RACI and recertification calendar approved.

## 12.4 ODA Migration Runbook Requirements

The ODA migration runbook must include:

1. Mapping from existing ODA `oems_products` rows to ProductSecurityMaster records.
2. Exception report for inactive, duplicate, unmapped, or ambiguous ODA products.
3. Handling for open ODA orders, collected groups, treasury update pending records, documents, digital verifications, and integration messages.
4. Freeze/cutover window for ODA create-order actions.
5. Compatibility queue for ODA orders created during rollout.
6. Rollback procedure for feature flag disablement, new ticket read-only retention, and old-flow continuation.
7. Reconciliation checklist after cutover and after rollback rehearsal.

# 13. Glossary

| Term | Definition |
|---|---|
| OEMS | Order and Execution Management System for Danamon product order workflows. |
| ODA | Optimum Deposit Account or dual-currency deposit workflow in OEMS. |
| MLD | Market Linked Deposit with tranche, payoff, callback, and maturity lifecycle. |
| Product/Security Master | Governed record describing a tradable or orderable product/security. |
| Product Rule Set | Versioned executable configuration for validation, eligibility, cutoff, document, settlement, and approval rules. |
| Ticket | Product-specific order capture record before or alongside an OEMS order. |
| Validation Decision | Persisted result of one validation rule execution. |
| Outbox | Database-backed event table used to publish integration and notification side effects after commit. |
| Dead Letter | Failed outbound event that exhausted retry attempts and requires operator repair or replay. |
| Reconciliation Break | Difference between OEMS expected state and external target-system acknowledgement or booking state. |
| Maker-Checker | Control requiring one user to create/submit and another eligible user to approve. |
| LHBU | Bank Indonesia reporting purpose code step for eligible FX workflows. |
| SND | Treasury sales or special-rate approval workflow for FX Today. |
| LTV | Loan-to-value ratio used in Wealth Lending monitoring. |
| Minimum Trustworthy Order | Required control spine proving an order has governed product identity, complete capture, source evidence, deterministic validation, owner queue, immutable transitions, and audit replay before production progression. |
| Policy-To-Rule Traceability | Evidence that each executable rule maps to an approved policy, product term, regulatory obligation, control objective, owner, and test. |
| Source Evidence | Timestamped source-system data or status used by validation and workflow decisions. |
| Degraded Mode | Controlled temporary operation when a source is unavailable, requiring approval, expiry, customer impact, and later reconciliation. |

# 14. Appendices

## 14.1 Source Evidence

- `docs/reviews/quality-review-danamon-oems-world-class-2026-05-06.md`
- `docs/reviews/brd-coverage-danamon-oems-brd-v1-2026-05-04.md`
- `server/services/oems-service.ts`
- `server/routes/oems.ts`
- `packages/shared/src/schema.ts`
- `apps/back-office/src/pages/oems-workbench.tsx`
- `apps/back-office/src/pages/oems-order-wizard.tsx`
- `apps/back-office/src/pages/oems-product-setup-oda.tsx`
- `apps/back-office/src/pages/oems-product-setup-mld.tsx`
- `tests/e2e/danamon-oems.spec.ts`
- `tests/e2e/oems-deaggregation-allocation.spec.ts`

## 14.2 BRD Quality Checklist

| Check | Result |
|---|---|
| Data model specifies entities, fields, relationships, and sample data | Pass |
| Functional requirements have user stories, acceptance criteria, rules, UI notes, and errors | Pass |
| UI screens specify layout, components, navigation, and responsive behavior | Pass |
| API section defines error format and complex examples | Pass |
| Notifications and reports are specified | Pass |
| Workflow states and transitions are specified | Pass |
| Glossary terms are used in the BRD | Pass |

# 15. Adversarial Council Incorporation Notes

## 15.1 Council Summary

The adversarial council agreed that the original BRD contained the right target capabilities but was too broad to serve as a safe execution plan. The main recommendation was to reframe modernization as a controlled banking change program, prove the minimum trustworthy order spine through ODA first, and delay broad dashboards/product expansion until governance, validation, workflow, audit, source evidence, and operating ownership are demonstrably reliable.

## 15.2 Changes Incorporated

- Added Minimum Trustworthy Order principle and release gate.
- Added policy-to-rule traceability and recertification requirements.
- Added SourceSystemEvidence entity and degraded-mode failure classes.
- Added operating model RACI and post-launch control ownership requirement.
- Added ODA-first proof slice as FR-013.
- Revised rollout to foundation plus ODA proof before broader product families.
- Added ODA migration runbook requirements.
- Added happy path and repair path expectations for the ODA ticket.
- Clarified that control tower and broad UI modernization follow reliable event/audit foundations.
