# TrustOMS API Reference

**Base URL**: `/api/v1`
**Authentication**: JWT Bearer token via `Authorization` header or `trustoms-access-token` httpOnly cookie
**Content-Type**: `application/json`
**Rate Limit**: 600 requests/minute per client

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Entity Registry](#2-entity-registry)
3. [Reference Data (CRUD)](#3-reference-data-crud)
4. [Master Data (CRUD)](#4-master-data-crud)
5. [Orders](#5-orders)
6. [Trades & Execution](#6-trades--execution)
7. [Confirmations & Matching](#7-confirmations--matching)
8. [Settlements & Cash Ledger](#8-settlements--cash-ledger)
9. [NAV & Fund Accounting](#9-nav--fund-accounting)
10. [Contributions](#10-contributions)
11. [Withdrawals](#11-withdrawals)
12. [Transfers](#12-transfers)
13. [Reversals](#13-reversals)
14. [Fee Engine](#14-fee-engine)
15. [EOD Processing](#15-eod-processing)
16. [Reconciliation](#16-reconciliation)
17. [Rebalancing & Model Portfolios](#17-rebalancing--model-portfolios)
18. [Risk Profiling](#18-risk-profiling)
19. [Investment Proposals](#19-investment-proposals)
20. [Suitability](#20-suitability)
21. [Compliance Workbench](#21-compliance-workbench)
22. [KYC Management](#22-kyc-management)
23. [Kill Switch](#23-kill-switch)
24. [Whistleblower](#24-whistleblower)
25. [CRM - Meetings](#25-crm---meetings)
26. [CRM - Call Reports](#26-crm---call-reports)
27. [CRM - Campaign Management](#27-crm---campaign-management)
28. [Service Requests](#28-service-requests)
29. [Approvals (Maker-Checker)](#29-approvals-maker-checker)
30. [Notifications](#30-notifications)
31. [System Configuration](#31-system-configuration)
32. [Degraded Mode / Feed Health](#32-degraded-mode--feed-health)
33. [Client Messages (Back Office)](#33-client-messages-back-office)
34. [Statements (Back Office)](#34-statements-back-office)
35. [Executive Dashboard](#35-executive-dashboard)
36. [RM Dashboard](#36-rm-dashboard)
37. [Scenario & ESG](#37-scenario--esg)
38. [AI Suitability & Intelligent Routing](#38-ai-suitability--intelligent-routing)
39. [Platform Features](#39-platform-features)
40. [Platform Intelligence](#40-platform-intelligence)
41. [Real-time / Workspace](#41-real-time--workspace)
42. [Client Portal](#42-client-portal)

---

## Role Reference

| Role Key | Description |
|---|---|
| `BO_MAKER` | Back-office maker |
| `BO_CHECKER` | Back-office checker/approver |
| `BO_HEAD` | Back-office department head |
| `SYSTEM_ADMIN` | System administrator |
| `FO_TRADER` | Front-office trader |
| `FO_RM` | Front-office relationship manager |
| `SENIOR_RM` / `SENIOR_TRADER` | Senior front-office roles |
| `CRM_USER` | CRM user (RM/branch associate) |
| `COMPLIANCE_OFFICER` | Compliance officer |
| `CRO` / `CCO` | Chief Risk/Compliance Officer |
| `HEAD_TRADER` | Head of trading desk |
| `PORTAL_CLIENT` | Client portal user |

`requireBackOfficeRole()` grants access to BO_MAKER, BO_CHECKER, BO_HEAD, and SYSTEM_ADMIN.
`requireFrontOfficeRole()` grants access to FO_TRADER, FO_RM, and senior variants.
`requireCRMRole()` grants access to CRM users (RMs, branch associates).

---

## Common Patterns

### Pagination
Most list endpoints accept:
- `page` (integer, default 1)
- `pageSize` (integer, default 25, max 100)

Response shape:
```json
{ "data": [...], "total": 100, "page": 1, "pageSize": 25 }
```

### CRUD Factory Endpoints
Entities registered via `createCrudRouter` all expose:
- `GET /` -- Paginated list with `?search=`, `?sort=`, `?order=asc|desc`, `?page=`, `?pageSize=`
- `GET /:id` -- Get by ID
- `POST /` -- Create (with Zod validation)
- `PUT /:id` -- Update (with optimistic locking via `version` field)
- `DELETE /:id` -- Soft delete (`is_deleted = true`)
- `POST /bulk-import` -- Bulk import from JSON/CSV
- `GET /export` -- CSV export

### Error Shape
```json
{
  "error": {
    "code": "NOT_FOUND | INVALID_INPUT | CONFLICT | FORBIDDEN | UNAUTHORIZED",
    "message": "Human-readable message"
  }
}
```

---

## 1. Authentication

**Mount**: `/api/v1/auth`

### POST /api/v1/auth/login
**Auth**: None (public)
**Request**: `{ username: string, password: string }`
**Response**: `{ data: { user, accessToken, refreshToken, expiresIn } }`
**Description**: Authenticates user credentials. Sets httpOnly cookies (`trustoms-access-token`, `trustoms-refresh-token`). Returns JWT token pair.

### POST /api/v1/auth/refresh
**Auth**: None (public)
**Request**: `{ refreshToken?: string }` (also reads from httpOnly cookie)
**Response**: `{ data: { user, accessToken, refreshToken, expiresIn } }`
**Description**: Exchanges a valid refresh token for a new token pair.

### POST /api/v1/auth/logout
**Auth**: Authenticated
**Request**: `{ refreshToken?: string }` (optional)
**Response**: `{ data: { message: "Logged out successfully" } }`
**Description**: Revokes the current session. Clears httpOnly cookies.

### POST /api/v1/auth/logout-all
**Auth**: Authenticated
**Request**: None
**Response**: `{ data: { message: "All sessions revoked" } }`
**Description**: Revokes all sessions for the current user.

### GET /api/v1/auth/me
**Auth**: Authenticated
**Response**: `{ data: { id, username, full_name, email, role, ... } }`
**Description**: Returns the authenticated user's profile.

### PUT /api/v1/auth/change-password
**Auth**: Authenticated
**Request**: `{ oldPassword: string, newPassword: string }` (min 8 chars)
**Response**: `{ data: { message: "Password changed..." } }`
**Description**: Changes password. Revokes all sessions after change.

---

## 2. Entity Registry

**Mount**: `/api/v1/entity-registry`

### GET /api/v1/entity-registry
**Auth**: Authenticated
**Query**: `?category=master_data|reference_data`, `?active=true|false`
**Response**: `{ data: [{ entity_key, display_name, category, schema_table_name, is_active, tier }] }`
**Description**: Lists all registered entities. Falls back to mock data if DB table does not exist.

### GET /api/v1/entity-registry/:entityKey
**Auth**: Authenticated
**Response**: `{ entityKey, displayName, fieldGroups, fields: [{ fieldName, label, inputType, required, ... }] }`
**Description**: Returns entity metadata and field configuration for dynamic form rendering.

### GET /api/v1/entity-registry/:entityKey/fields
**Auth**: Authenticated
**Response**: `{ data: [{ field_name, label, input_type, required, editable, ... }] }`
**Description**: Lists field configurations for an entity.

---

## 3. Reference Data (CRUD)

All reference data entities use the standard CRUD factory pattern (see [Common Patterns](#crud-factory-endpoints)).
**Auth**: Back Office (BO_MAKER+) with maker-checker approval.

| Mount Path | Entity | Searchable Fields |
|---|---|---|
| `/api/v1/countries` | Countries | code, name |
| `/api/v1/currencies` | Currencies | code, name |
| `/api/v1/asset-classes` | Asset Classes | code, name |
| `/api/v1/branches` | Branches | code, name, region |
| `/api/v1/exchanges` | Exchanges | code, name |
| `/api/v1/trust-product-types` | Trust Product Types | code, name |
| `/api/v1/fee-types` | Fee Types | code, name |
| `/api/v1/tax-codes` | Tax Codes | code, name, type |
| `/api/v1/market-calendar` | Market Calendar | calendar_key, holiday_name |
| `/api/v1/legal-entities` | Legal Entities | entity_code, entity_name |
| `/api/v1/feed-routing` | Feed Routing | security_segment |
| `/api/v1/data-stewardship` | Data Stewardship | dataset_key |

---

## 4. Master Data (CRUD)

All master data entities use the standard CRUD factory pattern.
**Auth**: Back Office (BO_MAKER+) with maker-checker approval.

| Mount Path | Entity | Searchable Fields |
|---|---|---|
| `/api/v1/counterparties` | Counterparties | name, lei, bic, type |
| `/api/v1/brokers` | Brokers | -- |
| `/api/v1/securities` | Securities | name, isin, cusip, sedol, bloomberg_ticker, local_code |
| `/api/v1/portfolios` | Portfolios | portfolio_id, client_id |
| `/api/v1/clients` | Clients | client_id, legal_name, type |
| `/api/v1/users` | Users | username, full_name, email, role |

### Nested CRUD Sub-Resources

| Mount Path | Entity |
|---|---|
| `/api/v1/clients/:parentId/profiles` | Client Profiles |
| `/api/v1/clients/:parentId/kyc-cases` | KYC Cases |
| `/api/v1/clients/:parentId/beneficial-owners` | Beneficial Owners |
| `/api/v1/clients/:parentId/fatca-crs` | FATCA/CRS Records |
| `/api/v1/portfolios/:parentId/mandates` | Mandates |
| `/api/v1/portfolios/:parentId/fee-schedules` | Fee Schedules |
| `/api/v1/portfolios/:parentId/positions` | Positions |
| `/api/v1/pera-accounts/:parentId/transactions` | PERA Transactions |

### Additional CRUD Entities

| Mount Path | Entity | Notes |
|---|---|---|
| `/api/v1/model-portfolios` | Model Portfolios | maker-checker |
| `/api/v1/compliance-limits` | Compliance Limits | maker-checker |
| `/api/v1/scheduled-plans` | Scheduled Plans | maker-checker |
| `/api/v1/pera-accounts` | PERA Accounts | maker-checker, PII logging |
| `/api/v1/held-away-assets` | Held Away Assets | maker-checker |
| `/api/v1/standing-instructions` | Standing Instructions | maker-checker |
| `/api/v1/settlement-account-configs` | Settlement Configs | maker-checker |
| `/api/v1/broker-charge-schedules` | Broker Charge Schedules | maker-checker |
| `/api/v1/cash-sweep-rules` | Cash Sweep Rules | maker-checker |
| `/api/v1/derivative-setups` | Derivative Setups | maker-checker |
| `/api/v1/sanctions-screening` | Sanctions Screening Log | -- |
| `/api/v1/stress-test-results` | Stress Test Results | -- |
| `/api/v1/workflow-definitions` | Approval Workflows | -- |
| `/api/v1/notification-templates` | Notification Templates | email templates require `{{unsubscribe_link}}` |

---

## 5. Orders

**Mount**: `/api/v1/orders`
**Auth**: Front Office (FO_TRADER, FO_RM)

### POST /api/v1/orders
**Request**: `{ portfolio_id, security_id, side, order_type, quantity?, limit_price?, ... }`
**Response**: `{ data: { order_id, ..., authorization_tier, suitability_check } }`
**Description**: Creates a new order. Automatically runs suitability check and determines authorization tier.

### GET /api/v1/orders
**Query**: `?status=`, `?portfolio_id=`, `?side=`, `?search=`, `?trader_id=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists orders with filtering and pagination.

### POST /api/v1/orders/auto-compute
**Request**: `{ quantity?, limit_price?, total_amount? }` (any two of three)
**Response**: `{ data: { quantity, limit_price, total_amount } }`
**Description**: Auto-computes the missing field from the other two.

### GET /api/v1/orders/pending-auth
**Query**: `?tier=`
**Response**: `{ data: [...], total }`
**Description**: Returns orders pending authorization, optionally filtered by tier.

### GET /api/v1/orders/:id
**Response**: `{ data: { order_id, ... } }`
**Description**: Returns a single order by ID.

### PUT /api/v1/orders/:id
**Request**: `{ ...fields to update }`
**Response**: `{ data: { order_id, ... } }`
**Description**: Updates a draft order.

### POST /api/v1/orders/:id/submit
**Response**: `{ data: { order_id, status: "PENDING_AUTH" } }`
**Description**: Submits order for authorization.

### POST /api/v1/orders/:id/authorize
**Auth**: SENIOR_RM, SENIOR_TRADER, or BO_CHECKER
**Request**: `{ decision: "APPROVED"|"REJECTED", comment?: string }`
**Response**: `{ data: { ... } }`
**Description**: Authorizes or rejects an order.

### POST /api/v1/orders/:id/reject
**Auth**: SENIOR_RM, SENIOR_TRADER, or BO_CHECKER
**Request**: `{ comment?: string }`
**Response**: `{ data: { ... } }`
**Description**: Shortcut to reject an order.

### DELETE /api/v1/orders/:id
**Response**: `{ data: { order_id, status: "CANCELLED" } }`
**Description**: Cancels an order.

### POST /api/v1/orders/:id/revert
**Response**: `{ data: { order_id, ... } }`
**Description**: Reverts a cancelled order back to its previous state.

### GET /api/v1/orders/:id/timeline
**Response**: `{ data: [{ from_status, to_status, changed_by, changed_at }], total }`
**Description**: Returns the state transition history for an order.

### GET /api/v1/orders/:id/authorizations
**Response**: `{ data: [{ approver_id, decision, comment, ... }], total }`
**Description**: Returns the authorization chain for an order.

---

## 6. Trades & Execution

**Mount**: `/api/v1/trades`
**Auth**: Front Office (FO_TRADER, FO_RM)

### GET /api/v1/trades/aggregation-view
**Query**: `?traderId=`
**Response**: `{ data: [...], total }`
**Description**: Returns the aggregation view showing groupable orders.

### GET /api/v1/trades/brokers/compare
**Query**: `?securityId=` (required)
**Response**: `{ data: [...], total }`
**Description**: Returns broker comparison data for a security.

### POST /api/v1/trades/blocks
**Request**: `{ orderIds: string[], traderId: number }`
**Response**: `{ data: { block_id, ... } }`
**Description**: Creates a block (aggregation) from multiple orders.

### GET /api/v1/trades/blocks
**Response**: `{ data: [...], total }`
**Description**: Lists all working (open) blocks.

### GET /api/v1/trades/blocks/suggestions
**Response**: `{ data: [...], total }`
**Description**: Returns auto-combine suggestions for orders that can be blocked together.

### GET /api/v1/trades/blocks/:id
**Response**: `{ data: { block_id, orders: [...], ... } }`
**Description**: Returns block detail with child orders.

### POST /api/v1/trades/blocks/:id/allocate
**Request**: `{ policy: "PRO_RATA"|"PRIORITY" }`
**Response**: `{ data: { ... } }`
**Description**: Sets the allocation policy for fill distribution.

### POST /api/v1/trades/blocks/:id/place
**Request**: `{ brokerId: number }`
**Response**: `{ data: { ... } }`
**Description**: Places a block with a broker for execution.

### DELETE /api/v1/trades/blocks/:id/placement
**Response**: `{ data: { ... } }`
**Description**: Cancels an active placement.

### GET /api/v1/trades/blocks/:id/fills
**Response**: `{ data: [...], total }`
**Description**: Returns fills recorded against a block.

### POST /api/v1/trades/fills
**Request**: `{ blockId, brokerId, executionPrice, executionQty, executionTime? }`
**Response**: `{ data: { ... } }`
**Description**: Records a fill execution.

### GET /api/v1/trades/fills/order/:orderId
**Response**: `{ data: [...], total }`
**Description**: Returns all fills allocated to a specific order.

---

## 7. Confirmations & Matching

**Mount**: `/api/v1/confirmations`
**Auth**: Authenticated

### GET /api/v1/confirmations
**Query**: `?status=`, `?search=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Returns the confirmation queue with filters.

### GET /api/v1/confirmations/summary
**Response**: `{ data: { matched, unmatched, exceptions, confirmed } }`
**Description**: Summary counts by confirmation status.

### GET /api/v1/confirmations/exceptions
**Query**: `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Exception queue with aging information.

### POST /api/v1/confirmations/bulk-confirm
**Request**: `{ confirmationIds: number[], confirmedBy: number }`
**Response**: `{ data: { confirmed, failed } }`
**Description**: Bulk confirms multiple matched confirmations.

### POST /api/v1/confirmations/:tradeId/match
**Request**: `{ counterparty_ref, execution_price, execution_qty, settlement_date? }`
**Response**: `{ data: { match_result, ... } }`
**Description**: Auto-matches a trade against counterparty data.

### POST /api/v1/confirmations/:tradeId/exception
**Request**: `{ reason: string }`
**Response**: `{ data: { ... } }`
**Description**: Manually flags a trade as an exception.

### POST /api/v1/confirmations/:id/resolve
**Request**: `{ action: "CONFIRM"|"REJECT"|"REMATCH", resolvedBy: number, notes?: string }`
**Response**: `{ data: { ... } }`
**Description**: Resolves a confirmation exception.

---

## 8. Settlements & Cash Ledger

**Mount**: `/api/v1/settlements`
**Auth**: Back Office

### GET /api/v1/settlements
**Query**: `?status=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Returns the settlement queue.

### GET /api/v1/settlements/cut-offs
**Response**: `{ data: { ... } }`
**Description**: Returns today's settlement cut-off times.

### POST /api/v1/settlements/bulk-settle
**Request**: `{ counterparty?, currency?, valueDate? }`
**Response**: `{ data: { settled, skipped } }`
**Description**: Bulk settles matching settlements.

### GET /api/v1/settlements/cash-ledger/liquidity-heatmap
**Response**: `{ data: { T: {...}, T1: {...}, T2: {...} } }`
**Description**: Returns a liquidity heatmap for T/T+1/T+2.

### GET /api/v1/settlements/cash-ledger/:portfolioId
**Query**: `?currency=`, `?startDate=`, `?endDate=`, `?page=`, `?pageSize=`
**Response**: `{ data: { balances: [...], transactions: [...] }, pagination: {...} }`
**Description**: Returns cash balances and transaction history for a portfolio.

### POST /api/v1/settlements/:confirmationId/initiate
**Response**: `{ data: { settlement_id, ... } }`
**Description**: Initializes settlement from a confirmed trade.

### POST /api/v1/settlements/:id/settle
**Response**: `{ data: { settlement_id, status: "SETTLED" } }`
**Description**: Marks a settlement as settled.

### POST /api/v1/settlements/:id/fail
**Request**: `{ reason: string }`
**Response**: `{ data: { ... } }`
**Description**: Marks a settlement as failed.

### POST /api/v1/settlements/:id/retry
**Response**: `{ data: { ... } }`
**Description**: Retries a failed settlement.

---

## 9. NAV & Fund Accounting

**Mount**: `/api/v1/nav`
**Auth**: Authenticated

### GET /api/v1/nav/status
**Query**: `?date=YYYY-MM-DD`
**Response**: `{ data: [...], total }`
**Description**: Returns NAV status for all funds on a given date.

### POST /api/v1/nav/compute/:portfolioId
**Request**: `{ navDate: "YYYY-MM-DD" }`
**Response**: `{ data: { nav_id, total_nav, navpu, ... } }`
**Description**: Computes NAV for a portfolio.

### POST /api/v1/nav/units/issue
**Request**: `{ portfolioId, amount, investorId, transactionDate? }`
**Response**: `{ data: { units_issued, navpu_used, ... } }`
**Description**: Issues units for a UITF subscription.

### POST /api/v1/nav/units/redeem
**Request**: `{ portfolioId, units, investorId, transactionDate? }`
**Response**: `{ data: { amount_redeemed, navpu_used, ... } }`
**Description**: Redeems units for a UITF withdrawal.

### POST /api/v1/nav/units/reconcile
**Request**: `{ portfolioId: string }`
**Response**: `{ data: { ... } }`
**Description**: Reconciles unit positions for a portfolio.

### GET /api/v1/nav/:portfolioId/history
**Query**: `?startDate=`, `?endDate=`
**Response**: `{ data: [...], total }`
**Description**: Returns NAV history for a portfolio.

### POST /api/v1/nav/:id/validate
**Response**: `{ data: { valid, warnings: [...], errors: [...] } }`
**Description**: Validates a computed NAV.

### POST /api/v1/nav/:id/publish
**Request**: `{ publishedBy: number }`
**Response**: `{ data: { ... } }`
**Description**: Publishes a validated NAV.

---

## 10. Contributions

**Mount**: `/api/v1/contributions`
**Auth**: Back Office

### GET /api/v1/contributions
**Query**: `?portfolioId=`, `?status=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists contributions with optional filters.

### POST /api/v1/contributions
**Request**: `{ portfolioId, amount, currency, sourceAccount, type }`
**Response**: `{ data: { ... } }`
**Description**: Records a new contribution.

### POST /api/v1/contributions/:id/approve
**Request**: `{ approvedBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Approves a pending contribution.

### POST /api/v1/contributions/:id/post
**Response**: `{ data: { ... } }`
**Description**: Posts an approved contribution to the cash ledger.

---

## 11. Withdrawals

**Mount**: `/api/v1/withdrawals`
**Auth**: Back Office

### GET /api/v1/withdrawals
**Query**: `?portfolioId=`, `?status=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists withdrawals.

### POST /api/v1/withdrawals
**Request**: `{ portfolioId, amount, currency, destinationAccount, type }`
**Response**: `{ data: { ... } }`
**Description**: Requests a new withdrawal.

### POST /api/v1/withdrawals/:id/calculate-tax
**Response**: `{ data: { withholding_tax, net_amount, ... } }`
**Description**: Calculates withholding tax for a withdrawal.

### POST /api/v1/withdrawals/:id/approve
**Request**: `{ approvedBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Approves a pending withdrawal.

### POST /api/v1/withdrawals/:id/execute
**Response**: `{ data: { ... } }`
**Description**: Executes an approved withdrawal.

---

## 12. Transfers

**Mount**: `/api/v1/transfers`
**Auth**: Back Office

### GET /api/v1/transfers
**Query**: `?status=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists transfers.

### POST /api/v1/transfers
**Request**: `{ fromPortfolioId, toPortfolioId, securityId, quantity, type }`
**Response**: `{ data: { ... } }`
**Description**: Initiates an in-kind transfer between portfolios.

### POST /api/v1/transfers/:id/approve
**Request**: `{ approvedBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Approves a pending transfer.

### POST /api/v1/transfers/:id/execute
**Response**: `{ data: { ... } }`
**Description**: Executes an approved transfer with cost-basis propagation.

### POST /api/v1/transfers/external
**Request**: `{ fromPortfolioId, externalCustodian: { bic, account }, securityId, quantity }`
**Response**: `{ data: { ... } }`
**Description**: Initiates an external inter-custodian transfer (SWIFT).

### POST /api/v1/transfers/:id/confirm-external
**Request**: `{ custodianRef?, confirmedBy? }`
**Response**: `{ data: { ... } }`
**Description**: Confirms external transfer on custodian settlement.

---

## 13. Reversals

**Mount**: `/api/v1/reversals`
**Auth**: Back Office (request/approve/reject/execute require COMPLIANCE_OFFICER or OPERATIONS_HEAD)

### GET /api/v1/reversals
**Query**: `?status=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Returns the reversal queue.

### POST /api/v1/reversals
**Auth**: COMPLIANCE_OFFICER or OPERATIONS_HEAD
**Request**: `{ transactionId, reason, evidence?, requestedBy }`
**Response**: `{ data: { ... } }`
**Description**: Requests a new reversal case.

### GET /api/v1/reversals/:id
**Response**: `{ data: { ... } }`
**Description**: Returns reversal case detail.

### POST /api/v1/reversals/:id/approve
**Auth**: COMPLIANCE_OFFICER or OPERATIONS_HEAD
**Request**: `{ approvedBy: number }`
**Response**: `{ data: { ... } }`
**Description**: Approves a reversal (self-approval blocked).

### POST /api/v1/reversals/:id/reject
**Auth**: COMPLIANCE_OFFICER or OPERATIONS_HEAD
**Request**: `{ reason: string, rejectedBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Rejects a reversal.

### POST /api/v1/reversals/:id/execute
**Auth**: COMPLIANCE_OFFICER or OPERATIONS_HEAD
**Response**: `{ data: { ... } }`
**Description**: Executes an approved reversal.

---

## 14. Fee Engine

**Mount**: `/api/v1/fees`
**Auth**: Back Office

### GET /api/v1/fees/summary
**Response**: `{ data: { ... } }`
**Description**: Fee engine summary dashboard.

### GET /api/v1/fees/schedules
**Query**: `?portfolioId=`
**Response**: `{ data: [...] }`
**Description**: Lists fee schedules.

### POST /api/v1/fees/schedules
**Request**: `{ portfolioId, feeType, method, ratePct?, tieredRates?, effectiveFrom, effectiveTo? }`
**Response**: `{ data: { ... } }`
**Description**: Defines a new fee schedule.

### POST /api/v1/fees/accruals/run
**Request**: `{ date: "YYYY-MM-DD" }`
**Response**: `{ data: { ... } }`
**Description**: Runs daily fee accrual.

### GET /api/v1/fees/accruals/status
**Query**: `?date=YYYY-MM-DD`
**Response**: `{ data: { ... } }`
**Description**: Returns accrual status for a date.

### POST /api/v1/fees/billing/run
**Request**: `{ periodFrom: "YYYY-MM-DD", periodTo: "YYYY-MM-DD" }`
**Response**: `{ data: { ... } }`
**Description**: Runs billing period to generate invoices.

### GET /api/v1/fees/invoices
**Query**: `?portfolioId=`, `?status=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists invoices.

### POST /api/v1/fees/invoices/:id/waive
**Request**: `{ reason: string, waivedBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Processes a fee waiver.

### GET /api/v1/fees/ter/:portfolioId
**Query**: `?periodFrom=&periodTo=` (required)
**Response**: `{ data: { ter_pct, ... } }`
**Description**: Calculates UITF Total Expense Ratio.

---

## 15. EOD Processing

**Mount**: `/api/v1/eod`
**Auth**: Back Office

### GET /api/v1/eod/status
**Response**: `{ data: { run_id, status, jobs: [...] } }`
**Description**: Returns the latest EOD run status.

### GET /api/v1/eod/status/:runId
**Response**: `{ data: { run_id, status, jobs: [...] } }`
**Description**: Returns status for a specific EOD run.

### POST /api/v1/eod/trigger
**Auth**: BO_HEAD or BO_CHECKER
**Request**: `{ runDate: "YYYY-MM-DD", triggeredBy: number }`
**Response**: `{ data: { run_id, ... } }`
**Description**: Triggers a new EOD processing run.

### GET /api/v1/eod/history
**Query**: `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Returns EOD run history.

### GET /api/v1/eod/definitions
**Response**: `{ data: [{ job_name, dependencies: [...], ... }] }`
**Description**: Returns the static job DAG definitions.

### POST /api/v1/eod/jobs/:id/retry
**Response**: `{ data: { ... } }`
**Description**: Retries a failed EOD job.

### POST /api/v1/eod/jobs/:id/skip
**Response**: `{ data: { ... } }`
**Description**: Skips a stuck EOD job.

---

## 16. Reconciliation

**Mount**: `/api/v1/reconciliation`
**Auth**: Back Office

### GET /api/v1/reconciliation/summary
**Response**: `{ data: { ... } }`
**Description**: Reconciliation dashboard summary.

### GET /api/v1/reconciliation/runs
**Query**: `?type=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Returns recon run history.

### POST /api/v1/reconciliation/runs/internal-triad
**Request**: `{ date: "YYYY-MM-DD", triggeredBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Triggers internal triad reconciliation (OMS vs GL vs Custodian).

### POST /api/v1/reconciliation/runs/transaction
**Request**: `{ date: "YYYY-MM-DD", triggeredBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Triggers transaction reconciliation.

### POST /api/v1/reconciliation/runs/position
**Request**: `{ date: "YYYY-MM-DD", triggeredBy?: number }`
**Response**: `{ data: { ... } }`
**Description**: Triggers position reconciliation.

### GET /api/v1/reconciliation/breaks
**Query**: `?type=`, `?status=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Returns reconciliation breaks.

### GET /api/v1/reconciliation/breaks/aging
**Response**: `{ data: { 0_1d, 1_3d, 3_7d, 7_plus } }`
**Description**: Returns break aging bucket counts.

### POST /api/v1/reconciliation/breaks/:id/resolve
**Request**: `{ resolvedBy: number, notes: string }`
**Response**: `{ data: { ... } }`
**Description**: Resolves a reconciliation break.

---

## 17. Rebalancing & Model Portfolios

**Mount**: `/api/v1/rebalancing`
**Auth**: Back Office

### GET /api/v1/rebalancing/models
**Query**: `?isActive=true|false`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists model portfolios.

### POST /api/v1/rebalancing/models
**Request**: `{ name, description?, allocations: [{ asset_class, target_pct }], benchmarkId? }`
**Response**: `{ data: { ... } }`
**Description**: Creates a model portfolio.

### PUT /api/v1/rebalancing/models/:id
**Request**: `{ name?, description?, allocations?, benchmarkId?, isActive? }`
**Response**: `{ data: { ... } }`
**Description**: Updates a model portfolio.

### DELETE /api/v1/rebalancing/models/:id
**Response**: `{ data: { ... } }`
**Description**: Soft deletes a model portfolio.

### GET /api/v1/rebalancing/models/:id/compare/:portfolioId
**Response**: `{ data: [{ asset_class, model_pct, actual_pct, deviation }] }`
**Description**: Compares a portfolio against a model.

### GET /api/v1/rebalancing/models/:id/actions/:portfolioId
**Response**: `{ data: [{ action, security_id, quantity, ... }] }`
**Description**: Computes rebalancing actions needed.

### POST /api/v1/rebalancing/simulate/what-if
**Request**: `{ portfolioId, proposedTrades: [{ securityId, side, quantity, price }] }`
**Response**: `{ data: { before, after, impact } }`
**Description**: Simulates what-if trade impact.

### POST /api/v1/rebalancing/simulate/stress-test
**Request**: `{ portfolioId, scenario: "INTEREST_RATE_SHOCK"|"EQUITY_CRASH"|"CREDIT_WIDENING"|"CURRENCY_DEVALUATION" }`
**Response**: `{ data: { ... } }`
**Description**: Runs a stress test simulation.

### POST /api/v1/rebalancing/simulate/constant-mix
**Request**: `{ portfolioId, modelId }`
**Response**: `{ data: { ... } }`
**Description**: Simulates constant-mix rebalancing.

### POST /api/v1/rebalancing/rebalance/single
**Request**: `{ portfolioId, modelId, runType?, includeHeldAway? }`
**Response**: `{ data: { run_id, blotter: [...] } }`
**Description**: Creates a rebalancing run for a single portfolio.

### POST /api/v1/rebalancing/rebalance/group
**Request**: `{ portfolioIds: string[], modelId, runType?, includeHeldAway? }`
**Response**: `{ data: { run_id, blotter: [...] } }`
**Description**: Creates a rebalancing run for multiple portfolios.

### POST /api/v1/rebalancing/rebalance/cash-event
**Request**: `{ portfolioId, cashAmount, direction: "INFLOW"|"OUTFLOW", modelId }`
**Response**: `{ data: { run_id, blotter: [...] } }`
**Description**: Rebalances on a cash event.

### GET /api/v1/rebalancing/runs
**Query**: `?status=`, `?portfolioId=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists rebalancing runs.

### GET /api/v1/rebalancing/runs/:id
**Response**: `{ data: { run_id, status, blotter: [...] } }`
**Description**: Returns run detail.

### PUT /api/v1/rebalancing/runs/:id/blotter
**Request**: `{ blotter: [...] }`
**Response**: `{ data: { ... } }`
**Description**: Edits the blotter on a DRAFT run.

### POST /api/v1/rebalancing/runs/:id/approve
**Request**: `{ approvedBy: number }`
**Response**: `{ data: { ... } }`
**Description**: Approves a draft run.

### POST /api/v1/rebalancing/runs/:id/execute
**Request**: `{ executedBy: number }`
**Response**: `{ data: { ... } }`
**Description**: Executes an approved run (generates orders).

---

## 18. Risk Profiling

**Mount**: `/api/v1/risk-profiling`
**Auth**: Back Office

### Questionnaire Maintenance

| Method | Path | Description |
|---|---|---|
| GET | `/questionnaires` | List questionnaires (`?entity_id=`, `?search=`, `?status=`, `?page=`, `?page_size=`) |
| GET | `/questionnaires/:id` | Get questionnaire detail |
| POST | `/questionnaires` | Create questionnaire |
| PUT | `/questionnaires/:id` | Update questionnaire |
| POST | `/questionnaires/:id/authorize` | Authorize (checker) |
| POST | `/questionnaires/:id/reject` | Reject with reason |

### Risk Appetite & Asset Allocation

| Method | Path | Description |
|---|---|---|
| GET | `/risk-appetite-map` | List risk appetite mappings |
| POST | `/risk-appetite-map` | Create mapping |
| PUT | `/risk-appetite-map/:id` | Update mapping |
| DELETE | `/risk-appetite-map/:id` | Delete mapping |
| GET | `/asset-allocation-config` | List asset allocation configs |
| POST | `/asset-allocation-config` | Create config |
| PUT | `/asset-allocation-config/:id` | Update config |
| DELETE | `/asset-allocation-config/:id` | Delete config |

### Customer Risk Assessment

| Method | Path | Description |
|---|---|---|
| POST | `/assess` | Run risk assessment for a customer |
| GET | `/profiles` | List customer risk profiles |
| GET | `/profiles/:id` | Get profile detail |
| POST | `/profiles/:id/override` | Override risk rating (with reason) |
| GET | `/profiles/:id/history` | Profile version history |

### Deviations & Escalations

| Method | Path | Description |
|---|---|---|
| GET | `/deviations` | List deviations |
| POST | `/deviations/:id/approve` | Approve deviation |
| POST | `/deviations/:id/reject` | Reject deviation |
| GET | `/escalations` | List escalations |

### Supervisor Dashboard

| Method | Path | Description |
|---|---|---|
| GET | `/supervisor/dashboard` | Summary stats for supervisor |
| GET | `/supervisor/pending` | Pending reviews |

### Reports

| Method | Path | Description |
|---|---|---|
| GET | `/reports/completion` | Completion report with date/RM filters |

---

## 19. Investment Proposals

**Mount**: `/api/v1/proposals`
**Auth**: Back Office

### CRUD

| Method | Path | Description |
|---|---|---|
| GET | `/` | List proposals (`?entity_id=`, `?rm_id=`, `?customer_id=`, `?status=`, `?page=`, `?page_size=`) |
| GET | `/:id` | Get proposal detail |
| POST | `/` | Create proposal |
| PUT | `/:id` | Update proposal |
| DELETE | `/:id` | Delete proposal |

### Line Items

| Method | Path | Description |
|---|---|---|
| POST | `/:proposalId/line-items` | Add line item |
| PUT | `/line-items/:id` | Update line item |
| DELETE | `/line-items/:id` | Delete line item |
| GET | `/:proposalId/validate-allocation` | Validate total allocation = 100% |

### Workflow

| Method | Path | Description |
|---|---|---|
| POST | `/:proposalId/suitability-check` | Run suitability check |
| POST | `/:proposalId/what-if` | Compute what-if metrics |
| POST | `/:id/submit` | Submit for approval |
| POST | `/:id/approve-l1` | L1 approval |
| POST | `/:id/reject-l1` | L1 rejection |
| POST | `/:id/approve-compliance` | Compliance approval |
| POST | `/:id/reject-compliance` | Compliance rejection |
| POST | `/:id/send-to-client` | Send to client |
| POST | `/:id/client-accept` | Client accepts |
| POST | `/:id/client-reject` | Client rejects (with reason) |
| POST | `/:id/return-for-revision` | Return for revision |
| POST | `/:id/generate-pdf` | Generate proposal PDF |

### Reports

| Method | Path | Description |
|---|---|---|
| GET | `/reports/pipeline` | Proposal pipeline report |
| GET | `/reports/risk-mismatch` | Risk mismatch report |
| GET | `/reports/product-rating` | Transaction by product rating |

---

## 20. Suitability

**Mount**: `/api/v1/suitability`
**Auth**: Authenticated

### POST /api/v1/suitability/:clientId/capture
**Request**: `{ risk_tolerance, investment_horizon, income_source, ... }`
**Response**: `{ data: { profile, riskProfile } }`
**Description**: Captures or updates a client suitability profile and computes risk score.

### GET /api/v1/suitability/:clientId/current
**Response**: `{ data: { ... } }`
**Description**: Returns the current suitability profile for a client.

### GET /api/v1/suitability/:clientId/history
**Response**: `{ data: [...], total }`
**Description**: Returns suitability profile history.

### POST /api/v1/suitability/check-order/:orderId
**Response**: `{ data: { suitable, reasons: [...] } }`
**Description**: Checks an order against the client's suitability profile.

---

## 21. Compliance Workbench

**Mount**: `/api/v1/compliance`
**Auth**: Back Office

### Breaches

| Method | Path | Request | Description |
|---|---|---|---|
| GET | `/breaches` | `?portfolioId=`, `?status=open\|resolved`, `?severity=`, `?page=`, `?pageSize=` | List breaches |
| GET | `/breaches/:id` | -- | Get breach detail |
| POST | `/breaches/:id/resolve` | `{ resolution: string }` | Resolve a breach |

### Alerts & Scoring

| Method | Path | Query | Description |
|---|---|---|---|
| GET | `/aml-alerts` | `?riskRating=`, `?page=`, `?pageSize=` | AML alerts |
| GET | `/surveillance-alerts` | `?pattern=`, `?disposition=`, `?page=`, `?pageSize=` | Trade surveillance alerts |
| GET | `/str-queue` | -- | Suspicious Transaction Reports queue |
| GET | `/score` | -- | Compliance health score |

### Rules Engine

| Method | Path | Request | Description |
|---|---|---|---|
| GET | `/rules` | `?ruleType=`, `?entityType=`, `?isActive=`, `?page=`, `?pageSize=` | List rules |
| GET | `/rules/:id` | -- | Get rule detail |
| POST | `/rules` | `{ ruleType, entityType, condition, action, severity }` | Create rule |
| PUT | `/rules/:id` | `{ ruleType?, entityType?, condition?, action?, severity?, isActive? }` | Update rule |
| DELETE | `/rules/:id` | -- | Soft delete rule |
| POST | `/rules/evaluate-order` | `{ orderId }` | Evaluate an order against all active rules |
| POST | `/rules/evaluate-position` | `{ portfolioId }` | Evaluate portfolio positions |

---

## 22. KYC Management

**Mount**: `/api/v1/kyc`
**Auth**: Back Office

### GET /api/v1/kyc/summary
**Response**: `{ pending, verified, rejected, expired, total }`
**Description**: KYC dashboard summary statistics.

### GET /api/v1/kyc/expiring
**Query**: `?days=30`
**Response**: `{ data: [...], total }`
**Description**: KYC cases expiring within N days.

### POST /api/v1/kyc/:clientId/initiate
**Request**: `{ id_type, id_number, ... }`
**Response**: `{ id, kyc_status: "PENDING", ... }`
**Description**: Initiates a new KYC case.

### POST /api/v1/kyc/:clientId/verify
**Response**: `{ id, kyc_status: "VERIFIED" }`
**Description**: Verifies the latest pending KYC case.

### POST /api/v1/kyc/:clientId/reject
**Response**: `{ id, kyc_status: "REJECTED" }`
**Description**: Rejects the latest pending KYC case.

### POST /api/v1/kyc/bulk-renewal
**Request**: `{ clientIds: string[] }`
**Response**: `{ data: [...], total }`
**Description**: Bulk-renews KYC for multiple clients.

### GET /api/v1/kyc/:clientId/history
**Response**: `{ data: [...], total }`
**Description**: Returns KYC history for a client.

### GET /api/v1/kyc/:clientId/risk-rating
**Response**: `{ clientId, riskRating: "LOW"|"MEDIUM"|"HIGH" }`
**Description**: Calculates AML risk rating.

---

## 23. Kill Switch

**Mount**: `/api/v1/kill-switch`
**Auth**: CRO, CCO, HEAD_TRADER, or COMPLIANCE_OFFICER

### POST /api/v1/kill-switch
**Request**: `{ scope: { type: string, value: string }, reason: string, mfaToken?: string }`
**Response**: `{ data: { halt, cancelledOrders } }`
**Description**: Invokes the kill switch to halt trading. Cancels open orders in scope. Supports TOTP MFA verification.

### GET /api/v1/kill-switch/active
**Response**: `{ data: [...] }`
**Description**: Returns all currently active (non-resumed) halts.

### GET /api/v1/kill-switch/history
**Query**: `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Returns paginated kill switch event history.

### GET /api/v1/kill-switch/:id
**Response**: `{ data: { ... } }`
**Description**: Returns a single halt record.

### POST /api/v1/kill-switch/:id/resume
**Request**: `{ approvedBy: { userId1: number, userId2: number } }`
**Response**: `{ data: { ... } }`
**Description**: Resumes trading. Requires dual approval (two different users).

---

## 24. Whistleblower

**Mount**: `/api/v1/whistleblower`
**Auth**: Authenticated (assign/update/notify-dpo require COMPLIANCE_OFFICER or ETHICS_OFFICER)

### GET /api/v1/whistleblower
**Query**: `?status=`, `?anonymous=true|false`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists whistleblower cases.

### GET /api/v1/whistleblower/conduct-risk
**Response**: `{ data: { ... } }`
**Description**: Returns conduct risk dashboard metrics.

### GET /api/v1/whistleblower/:id
**Response**: `{ data: { ... } }`
**Description**: Returns a single case.

### POST /api/v1/whistleblower
**Request**: `{ channel, description, anonymous: boolean }`
**Response**: `{ data: { ... } }`
**Description**: Submits a new whistleblower case.

### POST /api/v1/whistleblower/:id/assign
**Auth**: COMPLIANCE_OFFICER or ETHICS_OFFICER
**Request**: `{ ccoId: number }`
**Response**: `{ data: { ... } }`
**Description**: Assigns a CCO reviewer to the case.

### PUT /api/v1/whistleblower/:id
**Auth**: COMPLIANCE_OFFICER or ETHICS_OFFICER
**Request**: `{ status?, resolution? }`
**Response**: `{ data: { ... } }`
**Description**: Updates case status or resolution.

### POST /api/v1/whistleblower/:id/notify-dpo
**Auth**: COMPLIANCE_OFFICER or ETHICS_OFFICER
**Response**: `{ data: { ... } }`
**Description**: Sends notification to Data Protection Officer.

---

## 25. CRM - Meetings

**Mount**: `/api/v1/meetings`
**Auth**: CRM users (+ standard CRUD via factory)

### Custom Meeting Routes

| Method | Path | Description |
|---|---|---|
| GET | `/calendar` | Calendar data with filters (`?startDate=`, `?endDate=`, `?status=`, `?reason=`, `?organizer=`, `?branch=`, `?search=`, `?page=`, `?pageSize=`) |
| POST | `/:id/complete` | Mark meeting as completed |
| POST | `/:id/cancel` | Cancel meeting (requires `cancel_reason`, min 10 chars) |
| POST | `/:id/reschedule` | Reschedule to new time (creates new meeting, marks old RESCHEDULED) |
| GET | `/:id/invitees` | List invitees for a meeting |
| POST | `/:id/invitees` | Add invitee |
| DELETE | `/:id/invitees/:inviteeId` | Remove invitee |

### Standard CRUD (via factory)
Standard GET/POST/PUT/DELETE on `/api/v1/meetings` with search on `meeting_code, title`.

---

## 26. CRM - Call Reports

**Mount**: `/api/v1/call-reports`
**Auth**: CRM users (+ standard CRUD via factory)

### Custom Call Report Routes

| Method | Path | Description |
|---|---|---|
| POST | `/:id/submit` | Submit for approval (triggers late-filing check and AI auto-tagging) |
| PATCH | `/:id` | Update draft call report |
| GET | `/search` | Advanced search with filters |
| GET | `/supervisor-queue` | Supervisor approval queue |
| GET | `/:id/feedback` | Get feedback for a report |
| POST | `/:id/feedback` | Add feedback comment |
| GET | `/:id/chain` | Get report chain (linked reports) |

### Standard CRUD (via factory)
Standard GET/POST/PUT/DELETE on `/api/v1/call-reports` with search on `report_code, subject`.

---

## 27. CRM - Campaign Management

**Mount**: `/api/v1/campaign-mgmt`
**Auth**: CRM users

### Campaign Lifecycle

| Method | Path | Description |
|---|---|---|
| POST | `/campaigns/:id/submit` | Submit campaign for approval |
| POST | `/campaigns/:id/approve` | Approve campaign (self-approval blocked) |
| POST | `/campaigns/:id/reject` | Reject campaign |
| POST | `/campaigns/:id/copy` | Deep-copy campaign |
| GET | `/campaigns/:id/analytics` | Campaign analytics |

### Lead List Operations

| Method | Path | Description |
|---|---|---|
| POST | `/lead-lists/:id/execute-rules` | Execute segmentation rules to populate list |
| POST | `/lead-lists/preview` | Dry-run rule execution preview |
| POST | `/lead-lists/merge` | Merge multiple lead lists |

### Campaign Dispatch

| Method | Path | Description |
|---|---|---|
| POST | `/communications/:id/dispatch` | Dispatch communication to leads |
| POST | `/communications/:id/retry` | Retry failed dispatch |

### Conversion

| Method | Path | Description |
|---|---|---|
| POST | `/convert/lead-to-prospect` | Convert lead to prospect |

### Standard CRUD
Campaigns, lead-lists, leads, campaign-responses, campaign-communications, prospects, etc. are also available via CRUD factory endpoints at `/api/v1/campaigns`, `/api/v1/lead-lists`, `/api/v1/leads`, etc.

---

## 28. Service Requests

**Mount**: `/api/v1/service-requests`
**Auth**: Back Office

### GET /api/v1/service-requests
**Query**: `?status=`, `?priority=`, `?search=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Paginated service request queue.

### GET /api/v1/service-requests/summary
**Response**: `{ pending, in_progress, completed, overdue, ... }`
**Description**: KPI dashboard summary.

### GET /api/v1/service-requests/:id
**Response**: `{ data: { ... } }`
**Description**: Service request detail.

### GET /api/v1/service-requests/:id/history
**Response**: `{ data: [...] }`
**Description**: Status history timeline.

### PUT /api/v1/service-requests/:id
**Request**: `{ ...fields }`
**Description**: RM updates (branch, unit, date, docs).

### PUT /api/v1/service-requests/:id/send-for-verification
**Description**: Sends to teller for verification.

### PUT /api/v1/service-requests/:id/complete
**Request**: `{ teller_id? }`
**Description**: Teller marks as complete.

### PUT /api/v1/service-requests/:id/incomplete
**Request**: `{ teller_id?, notes? }`
**Description**: Teller marks as incomplete.

### PUT /api/v1/service-requests/:id/reject
**Request**: `{ reason: string }`
**Description**: Rejects with reason.

### PUT /api/v1/service-requests/:id/reassign
**Request**: `{ new_rm_id: number }`
**Description**: Reassigns to another RM.

---

## 29. Approvals (Maker-Checker)

**Mount**: `/api/v1/approvals`
**Auth**: Back Office

### GET /api/v1/approvals
**Query**: `?status=PENDING|APPROVED|REJECTED`, `?entityType=`, `?search=`, `?dateFrom=`, `?dateTo=`, `?view=my-submissions`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Paginated approval queue with filters.

### GET /api/v1/approvals/summary
**Response**: `{ pending, approvedToday, rejectedToday, slaBreached }`
**Description**: Dashboard summary counts.

### GET /api/v1/approvals/:id
**Response**: `{ id, entity_type, action, approval_status, payload, submitted_by, ... }`
**Description**: Single approval request detail.

### POST /api/v1/approvals/:id/approve
**Request**: `{ comment?: string }`
**Response**: `{ success: true, message }`
**Description**: Approves a pending request.

### POST /api/v1/approvals/:id/reject
**Request**: `{ comment: string }` (required)
**Response**: `{ success: true, message }`
**Description**: Rejects a pending request.

### POST /api/v1/approvals/:id/cancel
**Response**: `{ success: true, message }`
**Description**: Cancels own pending request.

### POST /api/v1/approvals/batch-approve
**Request**: `{ ids: number[], comment?: string }`
**Response**: `{ approved, failed }`
**Description**: Batch approve multiple requests.

### POST /api/v1/approvals/batch-reject
**Request**: `{ ids: number[], comment: string }` (comment required)
**Response**: `{ rejected, failed }`
**Description**: Batch reject multiple requests.

---

## 30. Notifications

**Mount**: `/api/v1/notifications`
**Auth**: Authenticated

### GET /api/v1/notifications
**Query**: `?recipientId=` (required), `?channel=`, `?status=`, `?unreadOnly=true`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists notifications for a recipient.

### GET /api/v1/notifications/preferences/:userId
**Response**: `{ data: { email, sms, push, inApp } }`
**Description**: Returns notification preferences.

### PUT /api/v1/notifications/preferences/:userId
**Request**: `{ email?, sms?, push?, inApp? }`
**Response**: `{ data: { ... } }`
**Description**: Updates notification preferences.

### POST /api/v1/notifications/dispatch
**Auth**: BO_MAKER, BO_CHECKER, or BO_HEAD
**Request**: `{ eventType, channel, recipientId, recipientType?, content }`
**Response**: `{ data: { ... } }`
**Description**: Dispatches a notification.

### POST /api/v1/notifications/retry-failed
**Auth**: BO_HEAD
**Response**: `{ data: { retried, failed } }`
**Description**: Retries all failed notifications.

### GET /api/v1/notifications/:id
**Response**: `{ data: { ... } }`
**Description**: Returns a single notification.

### PUT /api/v1/notifications/:id/read
**Response**: `{ data: { ... } }`
**Description**: Marks a notification as read.

---

## 31. System Configuration

**Mount**: `/api/v1/system-config`
**Auth**: Back Office (reads: BO_MAKER+; writes: BO_HEAD or SYSTEM_ADMIN only)

### GET /api/v1/system-config
**Response**: `{ data: [{ config_key, config_value, value_type, ... }] }`
**Description**: Lists all config entries. Sensitive values are masked with `****`.

### GET /api/v1/system-config/:key
**Response**: `{ data: { config_key, config_value, ... } }`
**Description**: Returns a single config entry by key.

### PUT /api/v1/system-config/:key
**Auth**: BO_HEAD or SYSTEM_ADMIN
**Request**: `{ config_value: string, version?: number }`
**Response**: `{ data: { ... } }`
**Description**: Updates a config value. Supports optimistic concurrency via `version`. Returns 409 on version conflict, 422 on type/range validation failure. Triggers audit log and cache invalidation.

---

## 32. Degraded Mode / Feed Health

**Mount**: `/api/v1/degraded-mode`
**Auth**: Back Office

### GET /api/v1/degraded-mode/feed-health
**Response**: `{ feeds: { ... } }`
**Description**: Returns current feed health status.

### GET /api/v1/degraded-mode/active
**Response**: `{ data: [...], hasActiveIncident }`
**Description**: Returns active degraded-mode incidents.

### GET /api/v1/degraded-mode/history
**Query**: `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Incident history.

### GET /api/v1/degraded-mode/kpi/:year
**Response**: `{ data: { ... } }`
**Description**: Degraded-mode KPI metrics for a year.

### POST /api/v1/degraded-mode/report
**Request**: `{ failedComponent, fallbackPath, impactedEventIds? }`
**Response**: `{ data: { ... } }`
**Description**: Reports a new degraded-mode incident.

### PUT /api/v1/degraded-mode/:incidentId/resolve
**Response**: `{ data: { ... } }`
**Description**: Resolves an incident.

### PUT /api/v1/degraded-mode/:incidentId/rca
**Response**: `{ data: { ... } }`
**Description**: Marks RCA as complete.

### POST /api/v1/degraded-mode/:feed/override
**Auth**: BO_HEAD or SYSTEM_ADMIN
**Request**: `{ status: "OVERRIDE_UP"|"OVERRIDE_DOWN", reason: string (10-500 chars), expires_hours?: number }`
**Response**: `{ feed, status, reason, expiresAt, overrideBy }`
**Description**: Overrides feed health status. Creates audit log.

### POST /api/v1/degraded-mode/:feed/clear-override
**Auth**: BO_HEAD or SYSTEM_ADMIN
**Response**: `{ feed, overrideCleared: true }`
**Description**: Clears a feed override.

---

## 33. Client Messages (Back Office)

**Mount**: `/api/v1/client-messages`
**Auth**: Back Office

### GET /api/v1/client-messages
**Query**: `?client_id=`, `?is_read=true|false`, `?status=read|unread`, `?sender_type=`, `?date_from=`, `?date_to=`, `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists all client messages (BO sees all clients).

### POST /api/v1/client-messages/:id/reply
**Request**: `{ body: string }`
**Response**: `{ data: { ... } }`
**Description**: RM replies to an existing message thread.

---

## 34. Statements (Back Office)

**Mount**: `/api/v1/statements`
**Auth**: Back Office

### GET /api/v1/statements
**Query**: `?page=`, `?pageSize=`
**Response**: `{ data: [...], total, page, pageSize }`
**Description**: Lists all client statements.

### POST /api/v1/statements/:id/regenerate
**Response (202)**: `{ data: { message: "Statement queued for regeneration" } }`
**Description**: Triggers async statement regeneration.

---

## 35. Executive Dashboard

**Mount**: `/api/v1/executive`
**Auth**: Authenticated

### GET /api/v1/executive/aum
**Response**: `{ data: { total_aum, breakdown: [...], trend: [...] } }`
**Description**: AUM summary with breakdown and trend data.

### GET /api/v1/executive/revenue
**Response**: `{ data: { total_revenue, by_fee_type: [...], by_product: [...] } }`
**Description**: Revenue summary.

### GET /api/v1/executive/risk
**Response**: `{ data: { breaches, ore_score, surveillance_alerts } }`
**Description**: Risk summary.

### GET /api/v1/executive/regulatory-status
**Response**: `{ data: [...] }`
**Description**: Regulatory filing status table.

### GET /api/v1/executive/operations
**Response**: `{ data: { stp_rate, settlement_sla, recon_breaks } }`
**Description**: Operations metrics.

### GET /api/v1/executive/service-sla
**Response**: `{ data: { ... } }`
**Description**: Service SLA heatmap data.

---

## 36. RM Dashboard

**Mount**: `/api/v1/rm-dashboard`
**Auth**: Authenticated

All endpoints require `?rmId=` query parameter.

### GET /api/v1/rm-dashboard/summary
**Response**: `{ data: { book_of_business, pending_tasks, order_pipeline, client_alerts } }`
**Description**: Combined RM dashboard overview.

### GET /api/v1/rm-dashboard/aum-breakdown
**Response**: `{ data: [...] }`
**Description**: AUM breakdown by product type.

### GET /api/v1/rm-dashboard/pipeline
**Response**: `{ data: { ... } }`
**Description**: Order pipeline funnel.

### GET /api/v1/rm-dashboard/alerts
**Response**: `{ data: [...] }`
**Description**: Client alerts.

### GET /api/v1/rm-dashboard/pending-tasks
**Response**: `{ data: { ... } }`
**Description**: Pending tasks summary.

---

## 37. Scenario & ESG

**Mount**: `/api/v1/scenario`
**Auth**: Authenticated

### POST /api/v1/scenario/analyze
**Request**: `{ portfolioId, proposedOrder: { securityId, side, quantity, price } }`
**Response**: `{ data: { before, after, impact } }`
**Description**: What-if impact analysis of a proposed trade on portfolio.

### GET /api/v1/scenario/history/:portfolioId
**Response**: `{ data: [...], total }`
**Description**: Recent scenario simulation history.

### GET /api/v1/scenario/esg/security/:securityId
**Response**: `{ data: { environment, social, governance, overall } }`
**Description**: Individual security ESG scores.

### GET /api/v1/scenario/esg/portfolio/:portfolioId
**Response**: `{ data: { weighted_esg, ... } }`
**Description**: Portfolio-level ESG scores.

### GET /api/v1/scenario/esg/breakdown/:portfolioId
**Response**: `{ data: [...] }`
**Description**: Detailed ESG breakdown per holding.

### GET /api/v1/scenario/esg/screening/:portfolioId
**Response**: `{ data: { exclusions: [...], warnings: [...] } }`
**Description**: ESG exclusion screening results.

---

## 38. AI Suitability & Intelligent Routing

**Mount**: `/api/v1/ai`
**Auth**: Authenticated

### AI Suitability

| Method | Path | Description |
|---|---|---|
| POST | `/suitability/predict` | Predict risk profile from client features |
| GET | `/suitability/explain/:predictionId` | Explain a prediction (SHAP values) |
| GET | `/suitability/shadow/:clientId` | Run shadow-mode comparison (AI vs rule-based) |
| GET | `/suitability/metrics` | Model performance metrics (accuracy, drift) |
| GET | `/suitability/history` | Prediction history (`?clientId=`, `?page=`, `?pageSize=`) |
| GET | `/suitability/shadow-results` | All shadow mode results |

### Intelligent Order Routing

| Method | Path | Description |
|---|---|---|
| POST | `/routing/recommend` | Get broker recommendation (`{ securityId, quantity, side }`) |
| GET | `/routing/quality/:brokerId` | Broker execution quality analytics (`?period=`) |
| GET | `/routing/leaderboard` | Broker leaderboard |
| GET | `/routing/decisions` | Routing decision log (`?brokerId=`, `?side=`, `?outcome=`, `?page=`, `?pageSize=`) |
| GET | `/routing/brokers` | List all brokers |

---

## 39. Platform Features

**Mount**: `/api/v1/features`
**Auth**: Back Office

### GET /api/v1/features/platform-status
**Response**: `{ available: boolean, configured: boolean }`
**Description**: Checks if the platform feature service is reachable.

### GET /api/v1/features/definitions
**Query**: `?entity=portfolio`, `?priority=P0`
**Response**: `{ definitions: [...] }`
**Description**: Lists feature definitions.

### GET /api/v1/features/:entityType/:entityId
**Query**: `?features=portfolio.market_value_php,portfolio.return_ytd`
**Response**: `{ entity_type, entity_id, features: { ... } }`
**Description**: Returns precomputed features for a single entity.

### GET /api/v1/features/:entityType/:entityId/history
**Query**: `?feature_id=` (required), `?from=` (required), `?to=` (required)
**Response**: `{ entity_type, entity_id, feature_id, history: [...] }`
**Description**: Returns feature value history over time.

### POST /api/v1/features/batch
**Request**: `{ entity_type, entity_ids: string[], feature_ids?: string[] }` (max 100 IDs)
**Response**: `{ entity_type, features: { ... } }`
**Description**: Batch fetch features for multiple entities.

### POST /api/v1/features/compute
**Request**: `{ priority?: "P0"|"P1"|"P2", entity_type?: string }`
**Response**: `{ run_id, status, ... }`
**Description**: Triggers an on-demand feature compute run.

---

## 40. Platform Intelligence

**Mount**: `/api/v1/intelligence`
**Auth**: Back Office

### GET /api/v1/intelligence/platform-status
**Response**: `{ available: boolean, configured: boolean }`
**Description**: Checks if the platform intelligence service is reachable.

### POST /api/v1/intelligence/copilot/stream
**Request**: `{ messages: [{ role: "user"|"assistant"|"system", content: string }], context?: { clientId?, portfolioId? } }`
**Response**: SSE stream of `{ content: string }` chunks
**Description**: AI Copilot streaming chat. Returns Server-Sent Events.

### GET /api/v1/intelligence/morning-briefing
**Response**: `{ ... }`
**Description**: Returns the daily morning briefing for the authenticated RM.

### GET /api/v1/intelligence/nba
**Query**: `?limit=10` (max 50)
**Response**: `{ actions: [...] }`
**Description**: Returns ranked Next Best Actions for the authenticated RM.

### GET /api/v1/intelligence/alerts
**Response**: `{ alerts: [...] }`
**Description**: Returns active platform alerts.

### POST /api/v1/intelligence/tag-call-report
**Request**: `{ report_id: number, summary: string, client_id?: string }`
**Response**: `{ topics, sentiment, action_items, keywords }`
**Description**: Auto-tags a call report with AI-extracted topics and sentiment.

### GET /api/v1/intelligence/meeting-prep/:meetingId
**Query**: `?client_id=` (required)
**Response**: `{ ... }`
**Description**: Returns AI-generated meeting preparation brief.

### POST /api/v1/intelligence/documents
**Request**: `{ source_type: "regulatory"|"research_report"|"client_email"|"meeting_note", title, text, client_ids?: string[], is_shared?: boolean }`
**Response (202)**: `{ ... }`
**Description**: Ingests a document into the intelligence knowledge base.

---

## 41. Real-time / Workspace

**Mount**: `/api/v1/realtime`
**Auth**: Authenticated

### Channel Management

| Method | Path | Description |
|---|---|---|
| GET | `/channels` | List available real-time channels |
| POST | `/subscribe` | Subscribe to channel (`{ channel }`) |
| POST | `/unsubscribe` | Unsubscribe from channel (`{ channel }`) |
| GET | `/channels/:channel/subscribers` | Active subscribers for a channel |
| POST | `/publish` | Publish event (`{ channel, event: { type, data } }`) |
| GET | `/channels/:channel/events` | Recent events (`?limit=`) |

### Workspace Collaboration

| Method | Path | Description |
|---|---|---|
| GET | `/workspace/:workspaceId/presence` | List active users in workspace |
| POST | `/workspace/:workspaceId/join` | Join workspace (`{ userName }`) |
| POST | `/workspace/:workspaceId/leave` | Leave workspace |
| POST | `/workspace/:workspaceId/vote` | Cast committee vote (`{ decision, comments? }`) |
| GET | `/workspace/:workspaceId/votes` | Get votes and resolution status |
| POST | `/workspace/:workspaceId/chat` | Send chat message (`{ userName, message }`) |
| GET | `/workspace/:workspaceId/messages` | Get chat message history |

---

## 42. Client Portal

**Mount**: `/api/v1/client-portal`
**Auth**: Portal client (JWT with `clientId`). All endpoints enforce ownership validation.

### Portfolio & Holdings

| Method | Path | Description |
|---|---|---|
| GET | `/portfolio-summary/:clientId` | Aggregated portfolio overview |
| GET | `/allocation/:portfolioId` | Asset allocation breakdown |
| GET | `/performance/:portfolioId` | Performance metrics (TWR/IRR) |
| GET | `/holdings/:portfolioId` | Detailed holdings list |
| GET | `/transactions/:portfolioId` | Recent transactions (`?page=`, `?pageSize=`) |

### Statements

| Method | Path | Description |
|---|---|---|
| GET | `/statements/:clientId` | Available statements list (`?page=`, `?pageSize=`) |
| GET | `/statements/:clientId/download/:statementId` | Download statement file |

### Service Requests

| Method | Path | Description |
|---|---|---|
| POST | `/request-action` | Request an action (creates service request) |
| GET | `/service-requests/:clientId` | List client's service requests |
| GET | `/service-requests/:clientId/:id` | Service request detail |
| POST | `/service-requests/:clientId/:id/documents` | Upload document (multipart, max 20MB) |

### Messaging

| Method | Path | Description |
|---|---|---|
| GET | `/messages` | List client messages (`?is_read=`, `?page=`, `?pageSize=`) |
| POST | `/messages` | Compose new message (`{ subject, body }`) |
| POST | `/messages/:id/reply` | Reply to message (`{ body }`) |
| PATCH | `/messages/:id/read` | Mark message as read |

### Risk Profiling & Proposals

| Method | Path | Description |
|---|---|---|
| GET | `/risk-profile/:clientId` | Current risk profile |
| GET | `/proposals/:clientId` | List proposals (`?status=`, `?page=`, `?pageSize=`) |
| GET | `/proposals/:clientId/:id` | Proposal detail |
| POST | `/proposals/:clientId/:id/accept` | Accept proposal |
| POST | `/proposals/:clientId/:id/reject` | Reject proposal (`{ reason }`) |

### Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/notifications/:clientId` | Client notifications |

---

## Additional CRUD Modules

The following modules are registered as CRUD or custom route files. They follow the standard patterns described above.

| Mount Path | Description |
|---|---|
| `/api/v1/audit` | Audit trail queries |
| `/api/v1/corporate-actions` | Corporate action processing |
| `/api/v1/pricing-definitions` | Pricing definitions (CRUD) |
| `/api/v1/eligibility-expressions` | Fee eligibility expressions (CRUD) |
| `/api/v1/accrual-schedules` | Accrual schedules (CRUD) |
| `/api/v1/fee-plan-templates` | Fee plan templates (CRUD) |
| `/api/v1/fee-plans` | Fee plans (CRUD) |
| `/api/v1/tfp-accruals` | TrustFees Pro accruals |
| `/api/v1/tfp-invoices` | TrustFees Pro invoices |
| `/api/v1/tfp-payments` | TrustFees Pro payments |
| `/api/v1/tfp-adhoc-fees` | TrustFees Pro ad-hoc fees |
| `/api/v1/tfp-event-fees` | TrustFees Pro event fees |
| `/api/v1/tfp-audit` | TrustFees Pro audit trail |
| `/api/v1/tax` | Tax calculations |
| `/api/v1/ttra` | Trust tax return automation |
| `/api/v1/claims` | Claims management |
| `/api/v1/uploads` | File uploads |
| `/api/v1/compliance-limits` | Compliance limit definitions |
| `/api/v1/scheduled-plans` | Scheduled investment plans (EIP/ERP) |
| `/api/v1/pera` | PERA account management |
| `/api/v1/risk-analytics` | Risk analytics |
| `/api/v1/surveillance` | Trade surveillance |
| `/api/v1/ore` | Operational risk events |
| `/api/v1/reports` | Report generation |
| `/api/v1/integrations` | External integrations |
| `/api/v1/fee-overrides` | Fee overrides |
| `/api/v1/exceptions` | Exception management |
| `/api/v1/consent` | Consent management |
| `/api/v1/disputes` | Fee disputes |
| `/api/v1/credit-notes` | Credit notes |
| `/api/v1/fee-reports` | Fee reporting |
| `/api/v1/circuit-breakers` | Circuit breaker configuration |
| `/api/v1/collection-triggers` | Collection triggers |
| `/api/v1/content-packs` | Content pack management |
| `/api/v1/dsar` | Data subject access requests |
| `/api/v1/regulatory-calendar` | Regulatory calendar |
| `/api/v1/gl` | General ledger integration |
| `/api/v1/lead-mgmt` | Lead management (custom routes) |
| `/api/v1/prospect-mgmt` | Prospect management (custom routes) |
| `/api/v1/negative-list` | Negative list screening |
| `/api/v1/ham` | Handover & assignment management |
| `/api/v1/opportunities` | Opportunity pipeline |
| `/api/v1/crm-tasks` | CRM task management |
| `/api/v1/crm-notifications` | CRM notifications |
| `/api/v1/crm-handovers` | CRM handovers |
| `/api/v1/mfa` | Multi-factor authentication (TOTP) |
| `/api/v1/ecl` | Expected credit loss |

---

*Generated: 2026-04-30*
*Source: `server/routes/` directory -- 90+ route files across back-office, front-office, CRM, and client portal modules*
