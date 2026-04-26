# BRD Coverage Audit — CRM Product Adoption Document (CRM_PAD_Final.docx)

**Date**: 2026-04-22
**Auditor**: Claude Code (automated)
**Document**: `docs/CRM_PAD_Final.docx`
**Source**: Intellect Design Arena / China Banking Corporation (CBC)
**Document Version**: FinalVer1.0 (June 2017)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **User Journeys in BRD** | 14 |
| **User Journeys DONE** | 2 |
| **User Journeys PARTIAL** | 6 |
| **User Journeys NOT IMPLEMENTED** | 6 |
| **Overall Implementation Rate** | ~35% |
| **P0 Gaps (Blockers)** | 4 |
| **P1 Gaps (Major)** | 18 |
| **P2 Gaps (Minor/Enhancement)** | 12 |
| **Total Gaps** | 34 |
| **Verdict** | **GAPS-FOUND** |

To reach COMPLIANT: must close all 4 P0 gaps and at least 14 of 18 P1 gaps.

---

## User Journey Assessment

### UJ-1.2: Manage Prospect
| Aspect | Status |
|--------|--------|
| **Implementation** | NOT IMPLEMENTED |
| **Coverage** | 0% |

**Required by BRD:**
- Prospect creation (manual + file upload)
- De-duplication check (First Name + Last Name + Email/Mobile — soft stop with override)
- Negative/Blacklist check (hard stop)
- Prospect lifecycle: Active → Dropped → Re-activated → Recommended for Client
- Prospect grid with filtering (Entity Type, Company, RM ID, Category, Assets, TRV, Risk Profile)
- Prospect assignment/handover to RM
- Prospect number generation (P-XXXXXXXX)
- Ageing in days display
- Corporate prospect: 2 contact persons, Group Company tab
- Maker-checker on prospect modification (not on creation)
- 54+ data fields: Personal Info, Family Members, Address, Identification, Lifestyle, Product Type

**What Exists:** Nothing. No prospect tables, services, routes, or UI pages.

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-01 | No prospect schema/table | P0 | Need `prospects` table with all 54+ fields, status lifecycle, RM mapping |
| G-02 | No de-duplication engine | P1 | Soft-stop matching on name+email/mobile with override+reason |
| G-03 | No negative/blacklist check | P1 | Hard-stop check against pre-uploaded negative list |
| G-04 | No prospect CRUD service | P1 | Create, modify, drop, activate, recommend-for-client |
| G-05 | No prospect UI page | P1 | Grid with filters, detail form, action buttons |
| G-06 | No file upload for bulk prospects | P2 | CSV/Excel upload with validation |

---

### UJ-1.3: On-boarding a Customer
| Aspect | Status |
|--------|--------|
| **Implementation** | PARTIAL (70%) |
| **Coverage** | Onboarding wizard exists, KYC + suitability + screening present |

**Required by BRD:**
- Client data fetch from Finacle (core banking) by CustID, or manual entry
- When fetching: check if CustID exists in Trust system → error if yes → fetch from Finacle if no
- Prospect-to-CIF conversion: copy prospect data, don't override existing CIF data
- De-duplication + Negative/Blacklist checks (same as prospect)
- Internal Trust customer number generation (XXXXXXXX, 8-digit)
- Exception queue for validation errors
- Maker-checker: 1-level (Associate→Senior Associate) or 2-level (Branch→Associate)
- Welcome letter generation on product subscription (except UITF)
- CIF modification with authorization workflow
- ECRAF rating display with re-profiling alerts (High=1yr, Medium=2yr, Low=3yr)
- US Person alert with override
- AMLA-related fields
- TAPS Header No. storage

**What Exists:**
- `apps/back-office/src/pages/client-onboarding.tsx` — 7-step wizard (identity, risk, UBO, FATCA/CRS, suitability, screening, review)
- `server/services/kyc-service.ts` — KYC case management, risk rating
- `server/services/suitability-service.ts` — Suitability scoring
- `clients` table in schema with core fields
- Screening integration stub

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-07 | No Finacle/CIF integration | P1 | No interface to fetch client data from core banking by CustID |
| G-08 | No prospect-to-CIF conversion | P1 | Depends on G-01; no workflow to convert prospect → client |
| G-09 | No welcome letter generation | P2 | Template-based letter on product subscription |
| G-10 | No ECRAF rating + re-profiling alerts | P2 | Risk-based re-profiling schedule (1/2/3 year cadence) |
| G-11 | No US Person alert | P2 | Flag + override when CIF is US Person |
| G-12 | No TAPS Header No. field | P2 | Minor schema addition |

---

### UJ-1.5: Manage Customer Relationship
| Aspect | Status |
|--------|--------|
| **Implementation** | PARTIAL (55%) |
| **Coverage** | Portfolio + account structures exist; base/holding pattern missing |

**Required by BRD:**
- **Base creation**: Holding pattern — single or multiple (up to 6 CIFs), primary holder designation
- Base duplicate check (same CIF combination = same base)
- **Portfolio creation** under base: name, number (ProductCode-BaseNo), risk profile (inherited), mandate (Directed/Managed), model portfolio, status (Holdout/Free), review date
- Product linking: IMA, PMT, Retirement Fund, UITF, etc.
- Document upload per product-mandate-customer type combination
- Fee structure definition
- Related parties: Beneficiaries, PoA, Signatories (with full AMLA details)
- **Account setup**: Per portfolio, branch+tax combination; Account No = PortfolioNo-BranchCode
- **TSA linking**: One active TSA per currency per portfolio (from Finacle)
- **CSA linking**: Create or Enter+Validate from Finacle; default CSA flag; link/delink
- Mailing instructions (email/collect-branch/hold-HO/mail) at base level
- Preferred Communication Address at base and portfolio level
- Coupon/Dividend/Maturity disposition: Pay-out CSA, Pay-out check, Reinvest, Retain-TSA
- AMLA Regulatory Report: accounts opened/terminated
- Holdout at security level, Garnishment at portfolio level
- Risk Disclosure Form upload at portfolio level
- Escrow signatories, numbered account flag
- Multi-employer fund: separate employer/employee contribution tracking
- FS quarter cut-off date for auto-generation trigger

**What Exists:**
- `portfolios` table with client_id, type, AUM, status, currency
- `positions` table tracking holdings
- `contributions` / `withdrawals` tables
- Portfolio management in back-office pages
- `trustProductTypeEnum` with IMA, PMT, UITF, etc.
- `modelPortfolios` table

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-13 | No base/holding pattern entity | P0 | Core CRM concept — base groups CIFs into holding pattern; portfolios hang under base |
| G-14 | No TSA/CSA account linking | P1 | No Finacle account lookup, linking, default flag, delink workflow |
| G-15 | No document management per product-mandate-customer | P1 | No document checklist or upload tracking by combination |
| G-16 | No related parties (Beneficiary/PoA/Signatory) at portfolio level | P1 | Need full AMLA details per related party |
| G-17 | No mailing instruction / communication preferences at base level | P2 | Disposition and address preferences |
| G-18 | No coupon/dividend/maturity disposition config | P1 | Pay-out CSA, check, reinvest, retain-TSA per account |
| G-19 | No AMLA regulatory report (accounts opened/closed) | P2 | Periodic report generation |
| G-20 | No holdout/garnishment tracking | P2 | Security-level holdout, portfolio-level garnishment amount |

---

### UJ-1.6: Handover and Assignment
| Aspect | Status |
|--------|--------|
| **Implementation** | NOT IMPLEMENTED (5%) |
| **Coverage** | RM dashboard exists as read-only aggregation; no handover/assignment workflow |

**Required by BRD:**
- **Handover** (permanent): Senior RM selects outgoing RM → sees all mapped clients → selects incoming RM → picks clients → sets effective date → saves with pending issues/call reports
- **Assignment** (temporary): RM/Supervisor initiates → start/end date → dual notification during period → auto-expires
- RM History tracking at client level
- Notifications to incoming and outgoing RM
- Maker-checker: Senior RM (maker) → RM Head (checker)
- Base-level assignment: All bases where client is primary holder move; secondary holder bases moved separately

**What Exists:**
- `server/services/rm-dashboard-service.ts` — Read-only RM book-of-business aggregation
- No assignment/handover tables or services

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-21 | No RM handover service | P0 | Permanent reassignment with maker-checker, effective date, history |
| G-22 | No RM temporary assignment | P1 | Time-bound dual visibility with auto-expiry |
| G-23 | No RM history tracking | P1 | Audit trail of all RM changes per client/base |

---

### UJ-1.7: Manage Campaign
| Aspect | Status |
|--------|--------|
| **Implementation** | NOT IMPLEMENTED |
| **Coverage** | 0% |

**Required by BRD:**
- List management: Create from filtered CIF/Prospect data → save as named list → modify → merge 2+ lists
- Campaign creation: unique code, general info, financial info, admin info, brochures, target list
- Campaign notification dispatch to recipients
- Response capture: per-recipient responses (Interested, Not Interested, Need More Info, Converted, Others)
- RM name/ID per response row
- Product Management team manages campaigns; RMs capture responses

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-24 | No campaign management module | P1 | Campaign CRUD, list management, response capture |

---

### UJ-1.11: Manage Hierarchy and Groups
| Aspect | Status |
|--------|--------|
| **Implementation** | PARTIAL (70%) |
| **Coverage** | Users, roles, branches, legal entities exist; service groups/units missing |

**Required by BRD:**
- Legal Entity creation
- Service Group creation with entitlements (maker-checker)
- Service Unit creation under Service Group (maker-checker)
- Role definition (RM, Adviser, Region Head, Ops Manager, Admin)
- User mapping to roles (view/modify only in CRM; creation in ARX)

**What Exists:**
- `users`, `roles`, `permissions`, `userRoles` tables
- `legalEntities`, `branches` tables
- Role-based middleware in `server/middleware/role-auth.ts`
- Comprehensive role enum including many domain-specific roles

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-25 | No service group/unit hierarchy | P2 | Additional org layer for entitlement segregation |

---

### UJ-1.12: Product Definition
| Aspect | Status |
|--------|--------|
| **Implementation** | PARTIAL (60%) |
| **Coverage** | Product types + fund master exist; subscription workflow missing |

**Required by BRD:**
- Product class selection: Agency, Trust, Other Fiduciary Services
- Product selection under class (Agency-Pre Need, Trust-PMT, Agency-Employee Benefit-Retirement Fund, etc.)
- Product definition fields per product type
- Product subscription workflow at portfolio level
- Product activation with account creation/linking

**What Exists:**
- `trustProductTypeEnum` with IMA_DIRECTED, IMA_DISCRETIONARY, PMT, UITF, PRE_NEED, EMPLOYEE_BENEFIT, ESCROW, AGENCY, SAFEKEEPING
- `trustProductTypes` and `fundMaster` tables
- `modelPortfolios` table

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-26 | No product subscription/activation workflow | P1 | End-to-end product enrollment with document checklist and account setup |

---

### UJ-1.4: Risk Profiling and Asset Allocation
| Aspect | Status |
|--------|--------|
| **Implementation** | IMPLEMENTED (85%) |
| **Coverage** | Questionnaires, scoring, risk categories all present |

**Required by BRD:**
- Select customer/prospect → identify questionnaire by type (Individual/Non-Individual)
- Score calculation → benchmark mapping → risk profile
- RM override: lower→higher requires approval doc + SRM authorization
- Record original + modified profile
- Asset allocation linked to risk profile; customer can override → approval
- Model portfolio recommendation based on risk score + time horizon
- Branch users: risk profiling only for customers (UITF only), not prospects
- Risk profile expiry notification to RM

**What Exists:**
- `server/services/suitability-service.ts` — Risk tolerance scoring (CONSERVATIVE through AGGRESSIVE)
- `server/services/kyc-service.ts` — KYC risk rating with auto-escalation
- `server/services/ai-suitability-service.ts` — AI-powered suitability
- `clientProfiles` table with risk_tolerance, investment_horizon, knowledge_level
- `kycCases` with risk_rating
- `modelPortfolios` table

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-27 | No RM override approval workflow for risk profile changes | P2 | Lower→higher risk requires doc upload + SRM auth |
| G-28 | No asset allocation recommendation engine | P2 | Auto-suggest allocation based on risk score + time horizon |

---

### UJ-8.1: Manage Financial Information
| Aspect | Status |
|--------|--------|
| **Implementation** | IMPLEMENTED (85%) |
| **Coverage** | Income, assets, liabilities, cash flows tracked |

**Required by BRD:**
- Income capture (various sources)
- Expense capture
- Assets with other banks + assets with CBC (real-time from DB)
- Liabilities with other banks + with CBC
- Insurance capture
- Future cash flows

**What Exists:**
- `clientProfiles` with source_of_wealth, net_worth, annual_income
- `heldAwayAssets` table for assets at other institutions
- `positions` for CBC-held assets
- `cashLedger` + `cashTransactions` for cash management
- `contributions` / `withdrawals` for cash flows

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-29 | No detailed expense/liability/insurance capture | P2 | Only high-level net worth; no itemized expense/liability/insurance fields |

---

### UJ-8.5: Generate Proposal
| Aspect | Status |
|--------|--------|
| **Implementation** | NOT IMPLEMENTED |
| **Coverage** | 0% |

**Required by BRD:**
- Investment proposal report generation per agreed format
- Based on agreed portfolio + model portfolio
- Downloadable/printable output

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-30 | No investment proposal generation | P1 | Template-based proposal with portfolio + model portfolio + risk profile |

---

### UJ-1.8: Manage Service Request
| Aspect | Status |
|--------|--------|
| **Implementation** | PARTIAL (50%) |
| **Coverage** | Dispute/claims management exists; formal SR workflow missing |

**Required by BRD:**
- Complaint definition: type, initiator unit, resolver unit, escalation mechanism, levels
- Complaint definition maker-checker
- Request initiation by RM/CSE on behalf of customer
- Resolution queue: assigned/escalated/forwarded view
- Status tracking: Resolved, Closed, Interim Response
- Forwarding to another resolver unit/user
- SLA-based alerts: assigned resolver, escalation matrix, RM breach alert

**What Exists:**
- `server/services/dispute-service.ts` — Invoice dispute lifecycle (OPEN→INVESTIGATING→RESOLVED/REJECTED)
- `server/services/claims-service.ts` — Claims processing with approval workflow
- `apps/back-office/src/pages/claims-workbench.tsx` — Claims UI with SLA ageing
- `disputes` and `claims` tables

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-31 | No generic service request module | P1 | Complaint definition, resolver queue, escalation matrix, forwarding |

---

### UJ-1.9: Manage Calendar
| Aspect | Status |
|--------|--------|
| **Implementation** | NOT IMPLEMENTED |
| **Coverage** | 0% |

**Required by BRD:**
- Calendar with day/week/month view
- Meeting scheduling: date, time, location, invitees
- Meeting invites to all invitees
- Meeting reminders
- Reschedule/cancel meetings
- Overlapping meetings allowed

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-32 | No calendar/meeting system | P1 | Full calendar with scheduling, invites, reminders, reschedule/cancel |

---

### UJ-1.9b: Task List
| Aspect | Status |
|--------|--------|
| **Implementation** | NOT IMPLEMENTED (5%) |
| **Coverage** | GL authorization tasks only; no general task management |

**Required by BRD:**
- RM creates tasks via to-do
- RM Head assigns tasks to RM
- Task reminders for upcoming tasks
- Task status update on completion

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-33 | No general task management system | P1 | Task CRUD, assignment, reminders, status tracking |

---

### UJ-1.10: Manage Call Report
| Aspect | Status |
|--------|--------|
| **Implementation** | NOT IMPLEMENTED |
| **Coverage** | 0% |

**Required by BRD:**
- Meeting particulars: reason, subject, start/end time, location
- Meeting information: type, mode, discussion summary, action items
- Invitees list
- Document attachments
- Status: Draft → Submitted (after meeting date passes)
- Follow-up call report creation (linked chain)
- Call reports report for management
- Product field for what was discussed

**What Exists:** Only `auditRecords` table (system-level audit, not CRM interaction tracking)

**Gaps:**

| # | Gap | Priority | Detail |
|---|-----|----------|--------|
| G-34 | No call report/interaction tracking | P1 | Full meeting lifecycle with notes, action items, follow-ups, reporting |

---

## Gap Summary by Priority

### P0 — Critical / Blockers (4 gaps)
| # | Gap | User Journey |
|---|-----|-------------|
| G-01 | No prospect schema/table | UJ-1.2 |
| G-13 | No base/holding pattern entity | UJ-1.5 |
| G-21 | No RM handover service | UJ-1.6 |
| G-24 | No campaign management module | UJ-1.7 |

> **Rationale**: Prospects, bases, RM handover, and campaigns are core CRM concepts that the entire system revolves around. Without these, the CRM cannot fulfill its primary purpose of managing the prospect→customer→relationship lifecycle.

### P1 — Major (18 gaps)
| # | Gap | User Journey |
|---|-----|-------------|
| G-02 | No de-duplication engine | UJ-1.2 |
| G-03 | No negative/blacklist check | UJ-1.2 |
| G-04 | No prospect CRUD service | UJ-1.2 |
| G-05 | No prospect UI page | UJ-1.2 |
| G-07 | No Finacle/CIF integration | UJ-1.3 |
| G-08 | No prospect-to-CIF conversion | UJ-1.3 |
| G-14 | No TSA/CSA account linking | UJ-1.5 |
| G-15 | No document management per product-mandate | UJ-1.5 |
| G-16 | No related parties at portfolio level | UJ-1.5 |
| G-18 | No coupon/dividend disposition config | UJ-1.5 |
| G-22 | No RM temporary assignment | UJ-1.6 |
| G-23 | No RM history tracking | UJ-1.6 |
| G-26 | No product subscription workflow | UJ-1.12 |
| G-30 | No investment proposal generation | UJ-8.5 |
| G-31 | No generic service request module | UJ-1.8 |
| G-32 | No calendar/meeting system | UJ-1.9 |
| G-33 | No general task management | UJ-1.9b |
| G-34 | No call report/interaction tracking | UJ-1.10 |

### P2 — Minor / Enhancement (12 gaps)
| # | Gap | User Journey |
|---|-----|-------------|
| G-06 | No bulk prospect file upload | UJ-1.2 |
| G-09 | No welcome letter generation | UJ-1.3 |
| G-10 | No ECRAF rating + re-profiling alerts | UJ-1.3 |
| G-11 | No US Person alert | UJ-1.3 |
| G-12 | No TAPS Header No. field | UJ-1.3 |
| G-17 | No mailing instruction at base level | UJ-1.5 |
| G-19 | No AMLA regulatory report | UJ-1.5 |
| G-20 | No holdout/garnishment tracking | UJ-1.5 |
| G-25 | No service group/unit hierarchy | UJ-1.11 |
| G-27 | No RM override approval for risk profile | UJ-1.4 |
| G-28 | No asset allocation recommendation engine | UJ-1.4 |
| G-29 | No detailed expense/liability/insurance capture | UJ-8.1 |

---

## Implementation Heatmap

```
UJ-1.2  Prospect Management     [__________] 0%   NOT IMPLEMENTED
UJ-1.3  Customer Onboarding     [=======___] 70%  PARTIAL
UJ-1.4  Risk Profiling          [========__] 85%  IMPLEMENTED
UJ-1.5  Customer Relationship   [=====_____] 55%  PARTIAL
UJ-1.6  Handover & Assignment   [__________] 5%   NOT IMPLEMENTED
UJ-1.7  Campaign Management     [__________] 0%   NOT IMPLEMENTED
UJ-1.8  Service Requests        [=====_____] 50%  PARTIAL
UJ-1.9  Calendar / Meetings     [__________] 0%   NOT IMPLEMENTED
UJ-1.9b Task List               [__________] 5%   NOT IMPLEMENTED
UJ-1.10 Call Reports            [__________] 0%   NOT IMPLEMENTED
UJ-1.11 Hierarchy & Groups      [=======___] 70%  PARTIAL
UJ-1.12 Product Definition      [======____] 60%  PARTIAL
UJ-8.1  Financial Information   [========__] 85%  IMPLEMENTED
UJ-8.5  Generate Proposal       [__________] 0%   NOT IMPLEMENTED
```

---

## Recommended Fix Order

**Phase 1 — Foundation (P0 schema + core services)**
1. Prospect table + CRUD service + de-dupe + blacklist (G-01 through G-06)
2. Base/Holding pattern entity + linking to portfolios (G-13)
3. RM handover/assignment service + history (G-21, G-22, G-23)

**Phase 2 — Relationship Workflows**
4. TSA/CSA linking + related parties + document management (G-14, G-15, G-16)
5. Product subscription/activation workflow (G-26)
6. Prospect-to-CIF conversion (G-08)
7. Coupon/dividend disposition config (G-18)

**Phase 3 — CRM Engagement Tools**
8. Campaign management module (G-24)
9. Calendar/meeting system (G-32)
10. Task management system (G-33)
11. Call report/interaction tracking (G-34)

**Phase 4 — Reports & Polish**
12. Investment proposal generation (G-30)
13. Generic service request module (G-31)
14. Finacle CIF integration (G-07)
15. All P2 enhancements (G-09 through G-12, G-17, G-19, G-20, G-25, G-27, G-28, G-29)

---

*Generated by Claude Code — BRD Coverage Audit Tool*
