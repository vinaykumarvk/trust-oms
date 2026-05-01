# TrustOMS Philippines BRD Enhancement Addendum
## Metrobank and BDO Gap Remediation Requirements

**Version:** 1.0  
**Date:** 2026-05-01  
**Source Gap Documents:** `Metrobank gaps.md`, `BDO RFI gaps.md`  
**Parent BRD:** `docs/TrustOMS-Philippines-BRD-FINAL.md`  
**Status:** Ready for remediation planning

---

## 1. Purpose

This addendum converts the Metrobank and BDO gap findings into expanded BRD-ready requirements. It is intended to be read with the parent TrustOMS Philippines BRD and used as the implementation reference for the remaining functional, integration, reporting, accounting, document-management, and non-functional gaps.

Each requirement below includes business intent, acceptance criteria, business rules, and failure or edge-case handling. One-line gap findings from the audit files have been expanded into auditable requirements suitable for design, build, test-case generation, and UAT sign-off.

## 2. Requirement Priority

| Priority | Meaning |
|----------|---------|
| P0 | Required for enterprise trust-banking go-live or regulatory readiness |
| P1 | Required for target operating model completeness |
| P2 | Required for operational efficiency, reporting depth, or later-phase optimization |

---

# 3. External Integration Hub

## FR-EXT-001: Enterprise Interface Registry and Adapter Framework

**Priority:** P0  
**Source:** Metrobank external interface gaps; BDO settlement, reporting, and AML file gaps

The system shall provide a governed interface registry and adapter framework for bank, market, regulator, custodian, payment, pricing, loan, tax, and document-management integrations. Each interface must have an owner, protocol, data contract, SLA, retry policy, exception queue, reconciliation control, and audit trail.

**Acceptance Criteria:**
- The interface registry captures source system, target system, direction, protocol, authentication method, file/API schema, frequency, cut-off, retry policy, SLA, and support owner.
- Supported channels include REST, SOAP where required by legacy systems, SFTP, message queue, SWIFT, payment-file upload, and manual fallback file ingestion.
- Every inbound and outbound message receives a correlation ID and immutable audit record from initiation through acknowledgement or rejection.
- Failed messages are routed to an exception queue with error category, payload reference, retry count, owning team, and resolution status.
- Authorized operations users can replay eligible failed messages without changing original business timestamps.

**Business Rules:**
- PII-bearing messages must be encrypted in transit and at rest.
- Regulatory, GL, settlement, and AML interfaces require maker-checker approval before production activation.
- Interface schema changes require versioning, regression testing, and back-out plan approval.

**Failure and Edge Cases:**
- If an upstream system is unavailable, the adapter must mark the dependency unavailable, suppress duplicate submissions, and notify operations.
- If acknowledgement is not received within SLA, the system must escalate without automatically assuming success.
- If duplicate files or messages are received, the system must reject or quarantine them using idempotency keys.

## FR-EXT-002: Core Banking CASA Validation and Settlement Interface

**Priority:** P0  
**Source:** Metrobank CASA account/balance validation and real-time settlement gaps; BDO T-1 settlement gaps

The system shall integrate with core banking CASA services to validate settlement accounts, retrieve available balances, reserve funds where applicable, and post settlement movements for subscriptions, redemptions, fees, disbursements, and loan-related cash flows.

**Acceptance Criteria:**
- Users can validate account existence, account name, currency, account status, branch, product type, and ownership before saving a settlement instruction.
- Available balance checks are performed before cash settlement, including hold, lien, freeze, dormant, closed, garnished, and post-no-debit states.
- The system supports same-day, T+0, T+1, and scheduled future settlement depending on product and cut-off configuration.
- Settlement responses update the transaction with success, pending, rejected, reversed, or timed-out status.
- Operations can generate an exception report for failed CASA validations, rejected debits, and unresolved pending settlements.

**Business Rules:**
- Currency mismatch between trust transaction and CASA account requires explicit configured FX workflow or rejection.
- Accounts under legal hold, garnishment, deceased status, or post-no-debit restriction cannot be debited unless an authorized override policy permits it.
- Balance checks must use available balance, not ledger balance, unless the bank explicitly configures otherwise.

**Failure and Edge Cases:**
- If balance validation succeeds but posting fails, the transaction remains unsettled and must not be marked complete.
- If settlement status is unknown, the system must block duplicate reposting until reconciliation determines the outcome.
- If a core banking reversal arrives after trust accounting has posted, a linked reversal workflow must be triggered.

## FR-EXT-003: Regulatory, AML, Tax, and Datawarehouse Interfaces

**Priority:** P0  
**Source:** Metrobank AMLA, Datawarehouse, eBIR, BSP PERA contributor, regulatory reporting gaps; BDO SAS AML and report dispatch gaps

The system shall generate, validate, encrypt, and transmit regulatory, AML, tax, and datawarehouse extracts according to destination-specific schedules and formats.

**Acceptance Criteria:**
- Supported outputs include AMLA/AMLC transaction extracts, SAS AML files where required, BIR forms and tax files, BSP PERA contributor and transaction files, CTR/escheat reports, and enterprise datawarehouse feeds.
- Users can configure schedule, target path, file naming convention, retention period, encryption method, and recipient for each extract.
- Each extract run records source criteria, record counts, totals, validation errors, approval status, dispatch status, and acknowledgement status.
- Rejected records can be corrected and resubmitted without regenerating already accepted records unless full resubmission is approved.
- The system produces a control total report for every extract.

**Business Rules:**
- Tax and regulatory extracts require locked accounting or transaction periods unless marked as preliminary.
- Personal data must be masked or tokenized in non-production and restricted reports.
- Regulatory extract reruns require audit reason and maker-checker approval.

**Failure and Edge Cases:**
- If an extract contains validation errors, the system must block dispatch and show field-level causes.
- If a regulator or downstream endpoint rejects a file, the original file and rejection response must remain retained.
- If a schedule is missed, the system must create an operational incident and notify configured owners.

---

# 4. Trust Account and Client Master Enrichment

## FR-ACCT-001: Complete Trust Account Metadata

**Priority:** P0  
**Source:** Metrobank account enrichment gaps; BDO AFM account metadata gaps

The trust account master shall support complete product, legal, operational, tax, fee, settlement, restriction, and servicing metadata needed for account administration across IMA, PMT, UITF, EBT, escrow, agency, safekeeping, corporate trust, and special fiduciary services.

**Acceptance Criteria:**
- Account setup captures product type, trust arrangement, governing document, branch, RM, servicing unit, tax status, risk classification, investment policy linkage, fee schedule, settlement instruction, statement preference, reporting calendar, and account-level restrictions.
- Accounts can be linked to multiple clients, related parties, beneficiaries, employers, plan members, issuers, creditors, investors, and authorized representatives with role-specific permissions.
- Users can copy an existing account into a new account template while excluding balances, transactions, audit history, and sensitive documents.
- Account dashboards show active restrictions, pending documents, fee exceptions, linked products, related accounts, and unresolved operational exceptions.
- Account metadata changes are versioned and require maker-checker approval for controlled fields.

**Business Rules:**
- Mandatory fields vary by product type, client type, account purpose, and regulatory classification.
- Settlement account changes require ownership validation and a cooling or approval rule where configured.
- Account closure is blocked while pending transactions, unreconciled balances, open fees, active holds, or mandatory documents remain unresolved.

**Failure and Edge Cases:**
- If copied account metadata contains inactive reference data, the user must replace it before submission.
- If linked-party ownership totals exceed 100 percent where percentages apply, the system must reject the setup.
- If account restrictions conflict, the strictest restriction must apply until resolved.

## FR-ACCT-002: Joint, Related, Group, Mother, and Linked Accounts

**Priority:** P1  
**Source:** Metrobank joint account and related-party gaps; BDO mother/group/linked account gaps

The system shall support joint accounts, family office groups, corporate groups, mother accounts, project accounts, and many-to-many account relationships with clear ownership, authority, reporting, and fee implications.

**Acceptance Criteria:**
- Users can define relationship type, effective dates, ownership percentages, operating authority, report consolidation rules, and fee aggregation rules.
- Linked account views show all related accounts, balances, AUM, restrictions, fees, open orders, and pending approvals.
- Project accounts can be linked to funding priority rules and collateral trustee relationships.
- Transfers between linked accounts support one-to-one, one-to-many, many-to-one, and many-to-many patterns when permitted by mandate.
- Relationship changes preserve historical reporting by effective date.

**Business Rules:**
- Joint account signing rules must be enforced during orders, withdrawals, settlement instruction changes, and document releases.
- Fee aggregation cannot override product-specific or regulatory fee restrictions.
- Group reporting must not expose accounts to users without data-access permission.

**Failure and Edge Cases:**
- If one linked account is frozen or dormant, group-level actions must identify and exclude or block the affected account according to configured rule.
- If relationship dates overlap inconsistently, the system must require correction before approval.
- If a client is removed from a group, past reports must remain reproducible.

## FR-ACCT-003: Dormant, Closed, Reopened, Hold-Out, Freeze, and Garnishment Controls

**Priority:** P0  
**Source:** Metrobank dormant/closure/reopen/hold-out gaps; BDO AFM dormant, freeze, deceased, garnished, security holdout history gaps

The system shall manage legal and operational account restrictions including dormant, closed, reopened, hold-out, post-no-debit, freeze, deceased, garnished, and security holdout states.

**Acceptance Criteria:**
- Authorized users can place, approve, amend, expire, release, and audit restrictions at account, client, asset, cash, instrument, or transaction level.
- Each restriction captures reason, legal reference, source document, start date, expiry date, affected amount or asset, permitted actions, approver, and release condition.
- Dormancy can be auto-marked based on inactivity thresholds and excluded products.
- Closure and reopening workflows validate balances, pending transactions, documents, fees, tax obligations, and restrictions.
- Security holdout history is visible with amount, instrument, expiry, release status, and related transaction.

**Business Rules:**
- Legal restrictions override ordinary operational requests.
- Closed accounts cannot accept new orders except approved reopening, corrections, or regulatory adjustments.
- Dormant fees can be assessed only when product and regulatory configuration allows them.

**Failure and Edge Cases:**
- If a restriction expires on a non-business day, expiry treatment follows the configured holiday rule.
- If a release document is incomplete, the release request remains pending and actions remain blocked.
- If multiple restrictions apply, the system must preserve all active restriction reasons in transaction rejection messages.

---

# 5. Employee Benefit, Provident Fund, and Retirement Plans

## FR-EBT-001: Employer Plan and Member Master

**Priority:** P0  
**Source:** Metrobank provident fund gaps; BDO EBT member and working-sheet gaps

The system shall maintain employer-sponsored benefit plans, provident funds, retirement plans, and member records with plan rules, employment history, contribution history, vesting, eligibility, balances, loans, and benefit computation data.

**Acceptance Criteria:**
- Plan setup captures employer, plan type, benefit formula, contribution rules, vesting schedule, credited-service rules, forfeiture rules, retirement age, portability rules, tax treatment, and governing plan document.
- Member setup captures employee ID, employment status, hire date, separation date, reason and nature of separation, salary basis, beneficiary data, membership status, contribution balances, loan balances, and plan-specific overrides.
- The system produces a member working sheet showing beginning balance, contributions, income allocations, withdrawals, loans, forfeitures, taxes, fees, and ending balance.
- Member transfer, merge, reinstatement after withdrawal, suspension, termination, and reactivation are supported with effective-dated history.
- Multi-employer plans support portability, employer-specific rules, and consolidated member balances.

**Business Rules:**
- Vesting and credited-service calculations must follow the approved plan document and effective dates.
- Reinstatement must restore only eligible balances and service credits according to configured rules.
- Member merges require duplicate detection, supporting evidence, and maker-checker approval.

**Failure and Edge Cases:**
- If employment dates conflict with contribution dates, the system must flag the member for review.
- If a member changes employer in a multi-employer plan, portability rules determine whether balances transfer, remain, or split.
- If loan balances are received from an external payroll or loan system, imported values must be reconcilable to prior balances.

## FR-EBT-002: Benefit Computation, Loans, Tax, and Forfeiture Processing

**Priority:** P0  
**Source:** Metrobank benefit processing gaps; BDO EBT benefit, tax, loan, gratuity, floor/minimum benefit gaps

The system shall calculate separation, retirement, disability, death, gratuity, withdrawal, and other plan benefits using plan-defined formulas, statutory or contractual minimums, loan offsets, tax exemptions, and forfeiture rules.

**Acceptance Criteria:**
- Benefit computation supports defined contribution, defined benefit, hybrid, gratuity, minimum benefit, floor benefit, and higher-of configured benefit formulas.
- Users can include unused leaves, CBA benefits, honoraria, employer special credits, and externally calculated amounts where plan rules permit.
- Loan balances can be imported, edited with approval, amortized, offset against benefits, or bypassed when client or third-party calculation rules apply.
- Taxability and exemption rules can be configured by benefit type, member status, tenure, age, separation reason, and statutory basis.
- The system generates a computation sheet, approval workflow, accounting entries, tax withholding, payment instruction, and member advice.

**Business Rules:**
- Manual override of computed benefits requires reason, supporting document, dual approval, and audit trail.
- Forfeitures must be allocated according to plan rules and cannot be posted until benefit approval is final.
- Third-party calculation bypass must still capture source, approver, amount, and reconciliation control.

**Failure and Edge Cases:**
- If member data required for a formula is missing, the benefit case remains incomplete and cannot be paid.
- If the computed benefit is lower than configured statutory or plan floor, the higher required amount must be selected and explained.
- If tax exemption criteria are not met, the system must default to taxable treatment unless approved override exists.

## FR-EBT-003: Contributions, Income Distribution, and Plan Accounting

**Priority:** P1  
**Source:** Metrobank provident fund accounting gaps; BDO EBT income distribution and contribution gaps

The system shall process member and employer contributions, allocate plan income and expenses, maintain member-level balances, and reconcile plan-level accounting to member working sheets.

**Acceptance Criteria:**
- Contributions can be uploaded in bulk, keyed manually, validated against payroll/member records, and corrected through controlled reversal.
- Income distribution supports pro-rata, unitized, balance-weighted, employer-specific, and plan-specific allocation rules.
- Plan-level accounting reconciles to member-level balances by contribution source, income, expense, forfeiture, loan, withdrawal, and tax category.
- Users can produce employer, member, and trustee reports for contribution history, allocated income, outstanding loans, forfeitures, and benefit payments.
- Exceptions for unknown members, inactive members, duplicate contributions, negative amounts, and invalid periods are reported before posting.

**Business Rules:**
- Contribution periods cannot be posted twice unless the second run is marked as adjustment.
- Negative member balances are prohibited unless expressly enabled for loan or correction accounts.
- Income allocation must be reproducible for any prior effective date.

**Failure and Edge Cases:**
- If bulk upload partially fails, accepted records can be posted only if the batch control policy permits partial posting.
- If income allocation totals do not match plan income, the batch must remain unposted.
- If a member is inactive but eligible for income, eligibility rules determine whether allocation proceeds.

---

# 6. Corporate Trust, Loan Agency, MTI, and Fiduciary Services

## FR-CT-001: Loan Facility Agency Lifecycle

**Priority:** P0  
**Source:** BDO corporate trust PSM-70 through PSM-94 gaps; Metrobank loan facility agency gaps

The system shall support the full agency and trustee lifecycle for corporate trust loans, including facility setup, investor participations, purchases, sales, contributions, withdrawals, availments, repayments, prepayments, rollovers, extensions, amendments, and closure.

**Acceptance Criteria:**
- Facility setup captures borrower, lenders, trustee role, agency role, facility amount, currency, availability period, interest basis, amortization method, payment dates, covenants, fees, collateral, and documents.
- Users can record loan purchases and sales by investor and update participation percentages after settlement.
- Loan contribution and withdrawal free-of-payment movements update positions without creating cash settlement.
- Principal, interest, fees, prepayments, penalties, rollovers, and extensions update facility balances, amortization schedules, receivables/payables, and GL postings.
- A loan dashboard shows outstanding principal, availability, overdue items, payment calendar, collateral coverage, covenant alerts, and next 10-to-15-day payment notices.

**Business Rules:**
- Participant ownership cannot exceed 100 percent of facility exposure.
- Prepayments and amendments require schedule recalculation and amendment history.
- Payments must be allocated pro-rata unless the facility agreement defines a different waterfall.

**Failure and Edge Cases:**
- If a payment is received without matching facility or schedule, it must be posted to suspense and routed for resolution.
- If a rollover occurs on a holiday, the configured business-day convention determines effective date.
- If amendment approval fails, original terms remain active.

## FR-CT-002: Collateral, MPC, Receivables, and Safekeeping

**Priority:** P0  
**Source:** BDO collateral, MPC, revaluation, receivables/payables, document safekeeping gaps

The system shall maintain collateral, Mortgage Participation Certificates, receivables/payables, and safekeeping records for corporate trust facilities.

**Acceptance Criteria:**
- Collateral records capture collateral type, title reference, valuation, sound value, insurance, lien priority, custodian location, revaluation frequency, and supporting documents.
- The system computes loan-to-value and sound-value coverage, alerts on threshold breach, and stores valuation history.
- MPC issuance, cancellation, transfer, maturity, and certificate inventory are controlled with unique certificate numbers.
- Receivables and payables monitor principal, interest, fee, tax, penalty, insurance, and reimbursement balances with aging buckets.
- Creditor, lender, borrower, and investor letters can be generated from approved facility and payment data.

**Business Rules:**
- MPC face value cannot exceed approved participation or facility constraints.
- Collateral release is blocked while outstanding exposure exceeds configured coverage threshold.
- Original title and security agreement release requires document checklist completion and approval.

**Failure and Edge Cases:**
- If collateral valuation is stale, the system must warn or block actions according to facility rule.
- If certificate numbers are missing or duplicated, issuance must be blocked.
- If collateral sound value falls below threshold, the system must create an exception and notification.

## FR-CT-003: Managed Trust Investments and Life Insurance Trust

**Priority:** P1  
**Source:** Metrobank MTI and life insurance trust gaps

The system shall support managed trust investment services and life insurance trust administration as fiduciary product variants with product-specific documents, parties, asset rules, fees, events, and reporting.

**Acceptance Criteria:**
- Product setup distinguishes MTI, life insurance trust, agency, escrow, safekeeping, and loan facility agency arrangements.
- Life insurance trust records capture policy owner, insured person, beneficiaries, policy number, insurer, premium schedule, cash value, death benefit, premium payment source, and claim documents.
- MTI records capture mandate, trustor instructions, investment restrictions, fee schedule, income distribution rule, and reporting calendar.
- Product-specific event workflows support premium due alerts, policy lapse monitoring, beneficiary change, claim proceeds receipt, investment instruction change, and termination.
- Reports include product inventory, upcoming events, unpaid premiums, claim status, and fiduciary account valuation.

**Business Rules:**
- Beneficiary and insured-party changes require evidence, approval, and effective-date control.
- Premium payment must pass available cash and restriction checks.
- Product variant must determine mandatory checklist, fee rule, and reporting template.

**Failure and Edge Cases:**
- If premium payment fails, the system must escalate before lapse grace period expires.
- If claim documents are incomplete, proceeds cannot be distributed.
- If investment instruction conflicts with mandate, order capture must block or require authorized override.

---

# 7. UITF, Online Channels, and Order Enhancements

## FR-UITF-001: UITF Subscription, Redemption, Switching, and Online Processing

**Priority:** P0  
**Source:** Metrobank UITF online, NAVPU, cutoff, inter-branch, PTA/COT/TOF gaps; BDO switch and NAVPU holiday gaps

The system shall support UITF subscriptions, redemptions, switch-in, switch-out, scheduled plans, online orders, inter-branch transactions, and trust settlement account movements with NAVPU and cut-off controls.

**Acceptance Criteria:**
- Users and eligible online clients can create subscriptions, redemptions, and switches with fund, amount or units, settlement account, channel, branch, and instruction source.
- The system validates fund eligibility, client risk profile, cut-off, holiday calendar, settlement account, minimum investment, maintaining balance, fees, and tax treatment.
- NAVPU application rules support same-day, next-business-day, holiday, and late-order treatment.
- Switch transactions create linked redemption and subscription legs with traceable status and accounting.
- Notifications are sent for order receipt, acceptance, rejection, NAVPU assignment, settlement, and completion.

**Business Rules:**
- Orders received after cut-off use the next eligible dealing date unless override policy applies.
- Online UITF orders must pass client authentication, eligibility, risk suitability, and channel limit checks.
- Inter-branch orders preserve originating branch, booking branch, RM, and channel lineage.

**Failure and Edge Cases:**
- If NAVPU is unavailable by publication cut-off, affected orders remain pending and users are alerted.
- If one leg of a switch fails, the linked transaction must follow configured cancellation or repair rules.
- If settlement fails after unit issuance, reversal or suspense handling must be initiated.

## FR-UITF-002: Bulk Orders, Scheduled Plans, and Payment Modes

**Priority:** P1  
**Source:** BDO contribution/order bulk upload, scheduled plan, payment-mode, bank-upload gaps

The system shall support bulk UITF and trust order ingestion, recurring plans, and bank payment file generation across configured payment modes.

**Acceptance Criteria:**
- Bulk uploads validate file structure, client identity, fund, transaction type, amount, settlement account, channel, and duplicate instruction IDs.
- Recurring plans support start date, end date, frequency, day-of-month rules, holiday handling, debit account, fund, amount, suspension, cancellation, and failed-debit retry rules.
- Payment mode options include book transfer, check, debit memo, credit memo, RTGS/PhilPaSS, SWIFT MT103/MT202 where applicable, and bank upload file.
- Users can produce debit/credit memo, ticket, confirmation, and advice documents from approved transactions.
- Bulk batches support preview, maker-checker approval, partial rejection policy, rollback, and audit trail.

**Business Rules:**
- Day-of-month schedules falling on a non-business day follow fund-level calendar convention.
- Duplicate external references within a configurable window must be rejected.
- Bulk rollback is allowed only before downstream settlement or unitization finality.

**Failure and Edge Cases:**
- If only some rows fail validation, the batch follows configured all-or-nothing or partial-acceptance policy.
- If payment file generation fails, approved orders remain pending settlement and cannot be marked settled.
- If a recurring debit fails repeatedly, plan status changes according to configured retry threshold.

---

# 8. Document Management and Checklist Controls

## FR-DOC-001: Product-Aware Document Checklist

**Priority:** P0  
**Source:** Metrobank document checklist, mandatory/optional, approval, aging, DMS gaps; BDO advice, confirmation, loan document safekeeping gaps

The system shall maintain product-aware document checklists covering account opening, orders, corporate trust, EBT, UITF, escrow, stock transfer, safekeeping, PERA, tax, legal restrictions, and document release workflows.

**Acceptance Criteria:**
- Checklist rules define product, event, client type, required/optional status, original/copy requirement, expiry, aging threshold, waiver eligibility, and approval requirement.
- Users can upload, tag, approve, reject, replace, expire, archive, and link documents to accounts, clients, transactions, facilities, members, instruments, and restrictions.
- Document records capture original/copy flag, physical location, vault reference, DMS reference, custodian, received date, expiry date, version, and access class.
- Aging dashboards show missing, expiring, expired, rejected, waived, and pending-approval documents.
- Integration with enterprise DMS supports reference linking, metadata synchronization, access check, and retrieval.

**Business Rules:**
- Mandatory documents block workflow progress unless an approved waiver rule applies.
- Original document release requires maker-checker approval and, where configured, legal or operations approval.
- PERA and sensitive client documents require secure access class and audit of every view/download.

**Failure and Edge Cases:**
- If DMS retrieval fails, the system must show metadata and mark document content unavailable without losing checklist status.
- If an uploaded file fails malware scan, it must be quarantined and excluded from approval.
- If a document expires after account opening, the account remains open but creates an exception based on checklist rule.

---

# 9. Stock Transfer and Securities Services

## FR-ST-001: Stock Transfer Agency Master and Inventory

**Priority:** P1  
**Source:** Metrobank stock transfer gaps; BDO securities services gaps

The system shall support stock transfer agency operations for certificated and scripless securities, shareholder records, certificate inventory, unclaimed certificates, stock rights, and data migration from prior transfer agents.

**Acceptance Criteria:**
- Issuer setup captures issuer, security class, certificated/scripless indicator, par value, authorized shares, issued shares, transfer restrictions, and service calendar.
- Shareholder records capture holdings, certificate numbers, scripless positions, tax classification, address, contact, and related documents.
- Certificate inventory supports issued, cancelled, replaced, lost, stale, unclaimed, and void statuses.
- Users can upload historical shareholder and certificate files from a former transfer agent with validation and exception reporting.
- Stock rights, entitlements, and corporate action events can be recorded and reported.

**Business Rules:**
- Certificate numbers must be unique within issuer and security class.
- Issued plus treasury plus cancelled/replaced positions must reconcile to authorized and issued share controls.
- Transfer restrictions must be checked before transfer approval.

**Failure and Edge Cases:**
- If uploaded historical files do not balance to issuer control totals, migration cannot be finalized.
- If a certificate is marked lost or stopped, any attempted transfer must be blocked.
- If shareholder tax status is missing, tax-sensitive distributions require exception handling.

## FR-ST-002: Proxy, Voting, and Shareholder Event Processing

**Priority:** P2  
**Source:** BDO proxy tabulation and voting gaps

The system shall support shareholder meeting events, proxy capture, vote tabulation, eligibility determination, and reporting for stock transfer agency clients.

**Acceptance Criteria:**
- Meeting setup captures issuer, record date, meeting date, agenda items, voting classes, quorum rules, and proxy submission deadlines.
- Eligible shareholders are determined as of record date with holdings and voting rights.
- Proxy submissions capture shareholder, proxy holder, shares represented, vote instructions, receipt channel, and validation status.
- Vote tabulation produces quorum, votes for/against/abstain, invalid proxies, late submissions, and final certified results.
- Reports can be exported for issuer, trustee, regulator, and meeting records.

**Business Rules:**
- Late proxies are rejected unless an authorized rule allows acceptance.
- A later valid proxy supersedes an earlier proxy according to issuer rules.
- Voting rights must reflect security class and record-date holdings.

**Failure and Edge Cases:**
- Duplicate proxy submissions require conflict review.
- If holdings are adjusted after record date due to correction, vote eligibility recalculates only with approved adjustment.
- If quorum is not reached, final reporting must state failure reason and meeting status.

---

# 10. Reporting, Report Writer, and Dispatch

## FR-RPT-001: Standard Report Catalogue and Templates

**Priority:** P0  
**Source:** Metrobank standard templates and MIS gaps; BDO CTR, escheats, SOA, tax and report-schedule gaps

The system shall maintain a standard report catalogue for operations, accounting, client, regulator, management, tax, risk, EBT, corporate trust, UITF, stock transfer, and audit reporting.

**Acceptance Criteria:**
- Each report has owner, purpose, data source, filter set, output format, frequency, access class, retention period, and sign-off owner.
- Standard reports include account master, holdings, transactions, cash projection, SOA, confirmations, advices, CTR, escheats, fee collection, tax forms, EBT member reports, loan payment notices, collateral exceptions, and audit activity.
- Reports support Excel, CSV, PDF, and Word where document-style output is required.
- Scheduled reports can run daily, weekly, monthly, quarterly, annually, ad hoc, or event-triggered.
- Report runs capture parameters, row counts, totals, run time, output location, dispatcher, recipient, and delivery status.

**Business Rules:**
- Sensitive reports require role-based access and masking based on recipient and channel.
- Official regulatory reports require approval before external dispatch.
- Report version used for a period must remain reproducible after template changes.

**Failure and Edge Cases:**
- If a scheduled report fails, the system must retry per policy and notify report owner.
- If report output exceeds configured size, the system must use secure link delivery or split files.
- If source data is incomplete, the report must show preliminary status or block official release.

## FR-RPT-002: Custom Report Writer with Controlled Distribution

**Priority:** P1  
**Source:** Metrobank custom report writer gaps; BDO nested calculation and password-protected report gaps

The system shall provide a controlled report writer for authorized users to build parameterized reports with fields, filters, grouping, sorting, formulas, nested calculations, layout controls, and secure distribution.

**Acceptance Criteria:**
- Users can select approved data domains, fields, joins, filters, sort order, grouping, subtotals, formulas, and nested calculations without direct database access.
- Layout controls include header/footer, orientation, font, column labels, page breaks, totals, and export format.
- Reports can be saved as private, shared, department, or enterprise templates with approval workflow.
- Distribution supports email, secure file path, SFTP, report inbox, and password-protected output where required.
- Every custom report execution is audited with user, parameters, data domain, output format, and recipients.

**Business Rules:**
- Users cannot expose fields beyond their RBAC/ABAC data permissions.
- New enterprise templates require data-owner approval.
- Passwords for protected reports must be generated or transmitted according to security policy, not embedded in email body.

**Failure and Edge Cases:**
- If a formula references a removed field, the report must be marked invalid until corrected.
- If a query exceeds performance limits, the system must stop it and suggest filters or asynchronous execution.
- If distribution fails for one recipient, other successful deliveries remain recorded and the failure is actionable.

---

# 11. Accounting, Valuation, and Reconciliation

## FR-GL-001: Trust Accounting Books, COA, and GL/SL Reconciliation

**Priority:** P0  
**Source:** Metrobank accounting, COA, multi-book, GL/SL reconciliation gaps; BDO year-end and LGF reversal gaps

The system shall maintain trust accounting books across trustee, trustor, product, fund, and regulatory perspectives, with chart of accounts, journal generation, sub-ledger controls, GL/SL reconciliation, period close, year-end close, and controlled reversal.

**Acceptance Criteria:**
- Chart of accounts supports product, client, account, fund, currency, book, branch, department, and regulatory dimensions.
- Journal generation covers orders, settlement, fees, tax, valuation, accrual, amortization, impairment, income distribution, loan events, EBT events, and reversals.
- GL/SL reconciliation compares journal balances with transaction, holding, cash, member, facility, and certificate sub-ledgers.
- Month-end and year-end close check unposted journals, unreconciled breaks, pending valuations, failed interfaces, and open reversals.
- LGF and other controlled reversal workflows preserve original entry, reversal entry, reason, approver, and accounting period.

**Business Rules:**
- Posted official-period journals cannot be edited; correction must use reversal and repost.
- Trustor and trustee books must remain separately identifiable.
- PFRS 9 classification and impairment rules apply where configured for financial assets.

**Failure and Edge Cases:**
- If an accounting event cannot derive an account code, it must remain in exception status and not post to suspense unless configured.
- If GL and sub-ledger balances differ, period close must show break details and require approval to proceed.
- If reversal crosses closed periods, accounting policy determines current-period correction or reopening workflow.

## FR-GL-002: Valuation, Accrual, Amortization, Impairment, and Property Accounting

**Priority:** P0  
**Source:** Metrobank valuation/accrual/amortization/impairment/property gaps; BDO property depreciation and asset swap gaps

The system shall support valuation and accounting workflows for marketable securities, loans, non-marketable assets, property, held-away assets, asset swaps, accruals, amortization, depreciation, and impairment.

**Acceptance Criteria:**
- Valuation sources can include market data vendors, custodian files, manual approved prices, appraisals, and held-away statements.
- Accrual and amortization engines support fixed income, deposits, loans, fees, premiums, discounts, and EBT/plan allocations.
- Property assets support acquisition value, appraisal, depreciation method, useful life, impairment indicator, disposal, and income/expense tracking.
- Asset swap workflows capture source asset, replacement asset, valuation basis, fee booking, underlying bond coupon/charges monitoring, approvals, and accounting entries.
- Impairment workflows support staging, indicators, allowance computation, approval, posting, and reporting.

**Business Rules:**
- Official valuation must use approved source hierarchy and as-of date.
- Manual prices require reason, evidence, and approval.
- Depreciation and amortization methods must remain reproducible for historical periods.

**Failure and Edge Cases:**
- If market price is missing, fallback hierarchy must determine whether to use prior price, alternate vendor, manual price, or hold valuation.
- If valuation changes after client reports are issued, correction and reissue controls must apply.
- If an asset swap creates cash residuals, settlement and accounting must handle the difference explicitly.

---

# 12. Settlement Instruments and Operations Controls

## FR-OPS-001: Check, SRT, Certificate, and Pre-Numbered Form Inventory

**Priority:** P1  
**Source:** Metrobank check/SRT inventory and pre-numbered forms gaps; BDO check/certificate number file and generated checks gaps

The system shall manage controlled inventories for checks, SRTs, certificates, stock certificates, advice forms, and other pre-numbered instruments.

**Acceptance Criteria:**
- Inventory setup captures instrument type, number range, storage location, custodian, status, assignment, issue date, void/cancel date, and related transaction.
- Check printing supports approved payment transactions, payee details, amount in figures and words, signatures where applicable, and print audit trail.
- Generated checks and certificates update inventory status and cannot reuse numbers.
- Operations can reconcile physical inventory against system status and produce exception reports.
- Voided, spoiled, lost, cancelled, or reprinted instruments require reason and approval.

**Business Rules:**
- Instrument numbers must be unique within type and issuing entity.
- Reprint must reference original instrument and preserve both records.
- Physical release requires inventory custody permission.

**Failure and Edge Cases:**
- If printer confirmation is unavailable, the instrument remains pending print confirmation.
- If a number gap is detected, inventory reconciliation must flag it before period close.
- If a cancelled instrument is presented later, the system must alert operations.

## FR-OPS-002: Payment Rails, PDDTS, SWIFT, RTGS, and Bank Uploads

**Priority:** P0  
**Source:** Metrobank PDDTS and settlement gaps; BDO SWIFT, RTGS, bank upload, payment mode gaps

The system shall generate, approve, transmit, and reconcile payments through book transfer, checks, PDDTS, RTGS/PhilPaSS, SWIFT MT103/MT202, debit/credit memo, and bank upload files.

**Acceptance Criteria:**
- Payment instruction capture includes beneficiary, bank, account, currency, amount, value date, purpose, charges, settlement rail, and supporting transaction.
- Payment files/messages are generated according to rail-specific format and require approval before release.
- Acknowledgements, rejects, returns, and confirmations update payment status and related transaction status.
- Charges, taxes, and bank fees can be allocated to client, trust account, or bank expense based on configuration.
- Payment monitoring dashboard shows pending release, released, acknowledged, rejected, returned, settled, and aged unresolved items.

**Business Rules:**
- High-value payments require enhanced approval tiers.
- Payment rail selection must honor currency, amount, beneficiary bank, cut-off, and product rule.
- Returned payments require repair or reversal workflow before transaction completion.

**Failure and Edge Cases:**
- If payment file is rejected by bank, no accounting settlement finality is assumed.
- If duplicate payment instruction is detected, release is blocked pending review.
- If payment is released after cut-off, value date rolls according to rail calendar rules.

---

# 13. Risk, Eligibility, Compliance, and Restrictions

## FR-RISK-001: Client Eligibility, Suitability, and Product Restrictions

**Priority:** P0  
**Source:** BDO client age/nationality eligibility, participation disclosure, short-sell, SATT, suitability gaps; Metrobank mandate and account validation gaps

The system shall validate client eligibility, investment suitability, mandate restrictions, product participation disclosures, and order-level compliance before transactions are accepted.

**Acceptance Criteria:**
- Eligibility rules support age, nationality, residency, client type, investor classification, KYC status, risk profile, product eligibility, and disclosure completion.
- Suitability checks compare product risk, asset class, concentration, currency, liquidity, and mandate restrictions against client/account profile.
- Participation disclosure, SATT, and product-specific acknowledgement documents can be required before order approval.
- Short-sell and restricted-asset alerts block or route orders according to policy.
- Compliance overrides capture reason, approver, expiry, and post-approval monitoring.

**Business Rules:**
- Missing mandatory disclosure blocks order approval.
- Hard-limit breaches cannot be overridden unless explicitly configured as overridable.
- Eligibility must be checked again when client profile or order economics change.

**Failure and Edge Cases:**
- If rules engine is unavailable, transactions requiring compliance validation must remain pending.
- If a client becomes ineligible after an order but before settlement, exception workflow determines cancellation or escalation.
- If suitability data is stale, the system must require profile refresh before new orders.

---

# 14. Data Migration, Bulk Load, and Master Data Quality

## FR-DATA-001: Controlled Data Migration and Bulk Maintenance

**Priority:** P0  
**Source:** BDO data migration, bulk account creation, bulk file upload gaps; Metrobank migration and enrichment gaps

The system shall support controlled data migration and bulk maintenance for clients, accounts, holdings, transactions, members, loans, documents, certificates, reference data, and historical balances.

**Acceptance Criteria:**
- Migration batches capture source file, source system, mapping version, validation rules, exception counts, control totals, approver, load status, and reconciliation result.
- Bulk account creation validates client, product, settlement account, KYC, document checklist, fee schedule, RM, branch, and mandate data.
- Historical data loads preserve original dates, source references, and audit lineage.
- Reconciliation compares migrated totals against source totals by account, product, currency, asset, member, facility, and period.
- Users can download error files with row number, field, value, rule, and correction guidance.

**Business Rules:**
- Production migration requires dry-run approval and sign-off of reconciliation breaks.
- Sensitive data in migration files must be encrypted and deleted or archived according to retention policy.
- Historical corrections after migration require controlled adjustment, not direct overwrite.

**Failure and Edge Cases:**
- If source data contains duplicates, the batch must identify possible matches and require resolution.
- If control totals do not balance, the batch cannot be finalized without approved exception.
- If a migration batch is rolled back, dependent downstream objects must also be reversed or quarantined.

---

# 15. Non-Functional Enhancements

## NFR-001: Non-Blocking Reports, Batch Processing, and Scheduler Reliability

**Priority:** P0  
**Source:** Metrobank concurrency, non-blocking reports, backup/reindex scheduler gaps; BDO scheduled report gaps

The system shall run long reports, data extracts, valuation batches, backup jobs, reindexing, and heavy reconciliation tasks asynchronously without blocking online transaction processing.

**Acceptance Criteria:**
- Long-running jobs execute through a job scheduler with queue, priority, retry, timeout, progress, cancellation, owner, and audit status.
- Online transaction screens remain usable while reports, extracts, and batch jobs run.
- Job history records start/end time, parameters, processed counts, errors, output location, and SLA status.
- Administrators can configure blackout windows, business calendars, dependencies, and alert thresholds.
- Failed jobs can be safely rerun idempotently where business rules allow.

**Business Rules:**
- Regulatory, accounting close, and settlement jobs must have explicit dependencies and cannot run out of sequence.
- Backup and reindex jobs must not degrade production transaction SLA beyond configured thresholds.
- Job outputs with sensitive data must follow report access and retention policies.

**Failure and Edge Cases:**
- If a job crashes mid-run, it must resume, roll back, or remain repairable according to job type.
- If scheduler is unavailable, critical missed jobs are detected at restart and escalated.
- If parallel jobs contend for the same data, lock and sequencing rules must prevent inconsistent results.

## NFR-002: Security, Masking, Session, and Access Controls

**Priority:** P0  
**Source:** BDO idle logout, concurrent login prevention, masking gaps; Metrobank access matrix and document security gaps

The system shall enforce enterprise security controls for data access, session management, masking, report access, document access, and notification privacy.

**Acceptance Criteria:**
- Role and attribute-based access controls protect clients, accounts, reports, documents, orders, accounting entries, and administrative functions.
- Client/account identifiers and sensitive personal data can be masked by role, channel, report, notification, and environment.
- Idle sessions expire according to policy and require re-authentication for sensitive actions.
- Concurrent login prevention or session policy is configurable by role and channel.
- Access to sensitive documents, reports, and exports is audited with user, timestamp, object, action, and purpose where required.

**Business Rules:**
- Privileged access requires periodic review and emergency-access logging.
- Notifications must not expose sensitive balances, identifiers, or personal data unless the recipient/channel policy permits it.
- Non-production environments must use masked or synthetic data unless exception is approved.

**Failure and Edge Cases:**
- If entitlement lookup fails, access must default to deny.
- If a user changes role during an active session, sensitive actions require entitlement refresh.
- If notification masking fails, message dispatch must be blocked.

---

# 16. Traceability Summary

| Gap Source Theme | Addendum Sections |
|------------------|-------------------|
| Metrobank external interfaces | Sections 3, 12, 15 |
| Metrobank account enrichment, joint accounts, holds, dormant/closure | Section 4 |
| Metrobank provident fund and retirement benefits | Section 5 |
| Metrobank other fiduciary services, MTI, life insurance trust | Section 6 |
| Metrobank UITF online and settlement processing | Section 7 |
| Metrobank document management and checklist | Section 8 |
| Metrobank accounting, GL/SL, valuation, regulatory reports | Sections 10, 11 |
| BDO EBT gaps | Section 5 |
| BDO corporate trust and loan management gaps | Section 6 |
| BDO securities services gaps | Section 9 |
| BDO AFM account management gaps | Section 4 |
| BDO OPS/RM/reporting gaps | Sections 10, 11, 12 |
| BDO bulk upload, migration, security gaps | Sections 13, 14, 15 |

---

## 17. UAT Exit Expectations for This Addendum

- Every P0 requirement has at least one positive, one negative, and one role/access test case.
- Every interface requirement has success, timeout, rejection, duplicate, and retry test cases.
- Every accounting requirement has journal, reversal, reconciliation, and period-close test cases.
- Every document requirement has missing, expired, waived, rejected, and approved-document test cases.
- Every report requirement has access, masking, format, schedule, and failed-dispatch test cases.
- Traceability from gap source to BRD requirement to implementation ticket to test evidence must be maintained.

