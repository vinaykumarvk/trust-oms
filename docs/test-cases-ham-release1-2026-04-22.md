# HAM Release 1 -- Functional Test Cases

**Module**: Handover & Assignment Management (HAM)
**Release**: Release 1 (Core Handover)
**Date**: 2026-04-22
**Functional Requirements Covered**: FR-001, FR-002, FR-003, FR-004, FR-012, FR-013, FR-014, FR-016, FR-018, FR-021, FR-022
**Total Test Cases**: 142

---

## Roles Reference

| Role | Description |
|------|-------------|
| BO_MAKER | Back-office maker -- initiates handovers |
| BO_CHECKER | Back-office checker -- authorizes handovers |
| BO_HEAD | Back-office head -- global visibility, admin |
| RELATIONSHIP_MANAGER | Front-office RM -- incoming/outgoing RM target |
| SENIOR_RM | Senior RM -- branch-level visibility, valid incoming RM |
| COMPLIANCE_OFFICER | Compliance gate overrides, audit viewer |
| SYSTEM_ADMIN | System administration |
| TRADER | Front-office trader -- no HAM access |

## Status Lifecycle Reference

```
draft --> pending_authorization --> authorized --> (optionally) reversed
                                |-> rejected
```

---

## FR-001: Lead Handover Initiation

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-001 | FR-001 | Happy Path | Successfully initiate a single lead handover | BO_MAKER logged in; at least one lead assigned to an outgoing RM; at least one RELATIONSHIP_MANAGER or SENIOR_RM available as incoming RM | 1. Navigate to Lead Handover grid. 2. Filter leads by outgoing RM. 3. Select one lead from the grid. 4. Select an incoming RM from the dropdown. 5. Enter Handover Reason (>= 10 chars). 6. Click Submit. | Handover record created with status `pending_authorization`. Outgoing RM, incoming RM, lead ID, and reason are persisted. Audit log entry created with action `HANDOVER_INITIATED`, actor = BO_MAKER. | P0 |
| TC-002 | FR-001 | Happy Path | Successfully initiate a multi-lead handover | BO_MAKER logged in; 5+ leads assigned to same outgoing RM | 1. Filter grid by outgoing RM. 2. Select 5 leads using multi-select checkboxes. 3. Assign incoming RM (SENIOR_RM). 4. Enter Handover Reason. 5. Submit. | A single handover record created with 5 handover_items, all with status `included`. Audit log records creation of handover and each item. | P0 |
| TC-003 | FR-001 | Happy Path | Grid filtering works correctly | BO_MAKER logged in; leads exist for multiple RMs, branches, statuses | 1. Apply filter: outgoing RM = "RM-A". 2. Clear filter. 3. Apply filter: branch = "Branch-X". 4. Apply combined filters: branch + date range. | Grid returns only leads matching the filter criteria. Counts update accordingly. Clearing a filter restores the full set. | P1 |
| TC-004 | FR-001 | Happy Path | Incoming RM dropdown shows only valid roles | BO_MAKER logged in; users exist with roles RELATIONSHIP_MANAGER, SENIOR_RM, BO_MAKER, TRADER | 1. Open the incoming RM dropdown. | Dropdown contains only users with role RELATIONSHIP_MANAGER or SENIOR_RM. No BO_MAKER, TRADER, BO_CHECKER, or other roles appear in the list. | P0 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-005 | FR-001 | Negative | Submit without selecting any leads | BO_MAKER logged in; grid visible | 1. Do not select any leads. 2. Fill incoming RM and reason. 3. Click Submit. | Submit button is disabled or validation error: "At least one lead must be selected." | P0 |
| TC-006 | FR-001 | Negative | Handover Reason below minimum length | BO_MAKER logged in; 1 lead selected, incoming RM assigned | 1. Enter Handover Reason with 9 characters (e.g., "Too short"). 2. Click Submit. | Validation error: "Handover Reason must be at least 10 characters." Form does not submit. | P0 |
| TC-007 | FR-001 | Negative | Handover Reason is empty | BO_MAKER logged in; 1 lead selected, incoming RM assigned | 1. Leave Handover Reason blank. 2. Click Submit. | Validation error: "Handover Reason is required." Form does not submit. | P0 |
| TC-008 | FR-001 | Negative | Incoming RM equals outgoing RM | BO_MAKER logged in; lead selected belonging to RM-A; RM-A has role RELATIONSHIP_MANAGER | 1. Select a lead owned by RM-A. 2. Select RM-A as incoming RM. 3. Click Submit. | Validation error: "Incoming RM must be different from the outgoing RM." Form does not submit. | P0 |
| TC-009 | FR-001 | Negative | No incoming RM selected | BO_MAKER logged in; 1 lead selected | 1. Do not select any incoming RM. 2. Enter valid Handover Reason. 3. Click Submit. | Validation error: "Incoming RM is required." Form does not submit. | P0 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-010 | FR-001 | Edge Case | Lead already in a pending handover (DB unique constraint) | Lead L-100 is already part of handover HO-001 with status `pending_authorization` | 1. BO_MAKER selects lead L-100. 2. Assigns a different incoming RM. 3. Submits. | Error: "Lead L-100 is already part of a pending handover (HO-001)." Submission blocked. DB unique constraint on (entity_id, status IN ('included','transferred')) prevents duplicate. | P0 |
| TC-011 | FR-001 | Edge Case | Outgoing RM has zero leads | BO_MAKER logged in; outgoing RM "RM-Empty" has no leads | 1. Filter grid by RM-Empty. | Grid displays empty state: "No leads found for this RM." Submit button is disabled. | P1 |
| TC-012 | FR-001 | Edge Case | Handover Reason exactly 10 characters | BO_MAKER logged in; 1 lead selected, incoming RM selected | 1. Enter Handover Reason with exactly 10 characters (e.g., "Retirement"). 2. Submit. | Handover is accepted. Boundary value of 10 chars satisfies the minimum. | P1 |
| TC-013 | FR-001 | Edge Case | Large batch selection (100+ leads) | BO_MAKER logged in; outgoing RM has 150 leads | 1. Select all 150 leads. 2. Assign incoming RM. 3. Enter reason. 4. Submit. | Handover created with 150 items. System handles large batch without timeout. All items have status `included`. | P1 |
| TC-014 | FR-001 | Edge Case | Concurrent handover attempts for same lead | Two BO_MAKERs (User-A, User-B) both have lead L-200 selected and ready to submit | 1. User-A submits handover for L-200. 2. User-B submits handover for L-200 within seconds. | User-A's handover succeeds. User-B receives a conflict error: "Lead L-200 is already part of a pending handover." DB unique constraint enforced via serializable transaction. | P0 |

### Permission Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-015 | FR-001 | Permission | BO_CHECKER cannot initiate a lead handover | BO_CHECKER logged in | 1. Navigate to Lead Handover Initiation page. 2. Attempt to select leads and submit. | Access denied (HTTP 403). The initiation form is either not visible or the submit action is blocked. Error: "Insufficient permissions." | P0 |
| TC-016 | FR-001 | Permission | RELATIONSHIP_MANAGER cannot initiate a lead handover | RELATIONSHIP_MANAGER logged in | 1. Navigate to Lead Handover Initiation page. | Access denied (HTTP 403). Route is restricted to BO_MAKER. | P0 |
| TC-017 | FR-001 | Permission | TRADER cannot access HAM module at all | TRADER logged in | 1. Attempt to access any HAM endpoint. | Access denied (HTTP 403). TRADER role is not included in any HAM route guard. | P1 |
| TC-018 | FR-001 | Permission | BO_HEAD can initiate a lead handover | BO_HEAD logged in (if permitted by design) | 1. Navigate to Lead Handover Initiation. 2. Select lead, assign incoming RM, enter reason, submit. | Verify whether BO_HEAD is permitted to initiate. If yes: handover created. If no (maker-only design): access denied. Document the expected behavior based on the RBAC matrix. | P1 |

---

## FR-002: Prospect Handover Initiation

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-019 | FR-002 | Happy Path | Successfully initiate a single prospect handover | BO_MAKER logged in; prospect P-100 assigned to RM-A; RM-B (RELATIONSHIP_MANAGER) available | 1. Navigate to Prospect Handover grid. 2. Select prospect P-100. 3. Select RM-B as incoming RM. 4. Enter Handover Reason (>= 10 chars). 5. Submit. | Handover record created with entity_type = `prospect`, status = `pending_authorization`. Audit log entry with action `HANDOVER_INITIATED`. | P0 |
| TC-020 | FR-002 | Happy Path | Multi-prospect handover | BO_MAKER logged in; 3 prospects assigned to RM-A | 1. Select all 3 prospects. 2. Assign SENIOR_RM as incoming RM. 3. Enter reason. 4. Submit. | Handover with 3 items created. All items have status `included`. | P0 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-021 | FR-002 | Negative | Incoming RM same as outgoing RM (prospect) | BO_MAKER logged in; prospect belongs to RM-A | 1. Select prospect. 2. Set incoming RM = RM-A. 3. Submit. | Validation error: "Incoming RM must be different from the outgoing RM." | P0 |
| TC-022 | FR-002 | Negative | Prospect already in pending handover | Prospect P-200 already in handover HO-010 with status `pending_authorization` | 1. Select P-200. 2. Submit new handover. | Error: "Prospect P-200 is already part of a pending handover." DB unique constraint enforced. | P0 |
| TC-023 | FR-002 | Negative | Handover Reason too short for prospect | BO_MAKER logged in; prospect selected, incoming RM selected | 1. Enter 5-character reason. 2. Submit. | Validation error on reason field. Minimum 10 characters enforced. | P0 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-024 | FR-002 | Edge Case | Prospect with no associated data (minimal record) | Prospect P-300 has only mandatory fields filled | 1. Select P-300. 2. Assign incoming RM. 3. Enter reason. 4. Submit. | Handover created successfully. Minimal data does not cause errors. | P2 |
| TC-025 | FR-002 | Edge Case | All prospects for an RM selected and handed over | RM-C has exactly 2 prospects, no leads, no clients | 1. Select both prospects. 2. Assign incoming RM. 3. Submit. | Handover created. After authorization, RM-C has zero entities. System handles empty-RM state gracefully. | P2 |

---

## FR-003: Client Handover with Scrutiny Checklist

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-026 | FR-003 | Happy Path | Successful client handover with all scrutiny items completed | BO_MAKER logged in; client C-100 assigned to RM-A; all 13 scrutiny checklist items have templates configured; compliance gates all pass | 1. Navigate to Client Handover. 2. Select client C-100. 3. Assign incoming RM (RM-B). 4. Assign Incoming Referring RM. 5. Assign Branch RM. 6. Enter Handover Reason (>= 10 chars). 7. Complete all 13 mandatory scrutiny checklist items (set each to a status != `pending`). 8. Save. | Compliance gates auto-run: KYC (pass), sanctions (pass), complaints (pass), COI (pass), settlement threshold (pass). Handover created with status `pending_authorization`. Scrutiny checklist persisted. Portfolio Complexity Indicators displayed (aggregate AUM, product count, open orders, settlements, tenure). Audit log created. | P0 |
| TC-027 | FR-003 | Happy Path | Portfolio Complexity Indicators displayed correctly | BO_MAKER logged in; client C-100 has AUM = $5M, 12 products, 3 open orders, 1 pending settlement, 8-year tenure | 1. Open client handover form for C-100. | Portfolio Complexity Indicators panel shows: Aggregate AUM = $5M, Product Count = 12, Open Orders = 3, Pending Settlements = 1, Tenure = 8 years. BO_MAKER sees aggregate data only (not individual holdings). | P0 |
| TC-028 | FR-003 | Happy Path | Incoming Referring RM and Branch RM fields accepted | BO_MAKER logged in; valid RMs exist for all fields | 1. Select client. 2. Set Incoming RM = RM-B. 3. Set Incoming Referring RM = RM-C. 4. Set Branch RM = RM-D. 5. Complete scrutiny checklist. 6. Enter reason. 7. Save. | All three RM fields are persisted on the handover record. Each RM is validated as an active user with appropriate role. | P1 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-029 | FR-003 | Negative | Mandatory scrutiny item left in pending status | BO_MAKER logged in; 12 of 13 scrutiny items completed; item #7 still `pending` | 1. Attempt to save the handover. | Validation error: "All mandatory scrutiny checklist items must be completed (item #7 is still pending)." Save is blocked. | P0 |
| TC-030 | FR-003 | Negative | Multiple scrutiny items left incomplete | 5 of 13 items still `pending` | 1. Attempt to save. | Validation error listing all 5 incomplete items. Save blocked. | P0 |
| TC-031 | FR-003 | Negative | Compliance gate fails -- KYC pending | Client C-200 has KYC status = `PENDING` | 1. Complete all scrutiny items. 2. Save. 3. Compliance gates auto-run. | KYC gate returns `failed`. Client C-200 handover item gets status = `failed`. Other passing items proceed. User sees: "Client C-200 blocked by compliance gate: KYC review pending." | P0 |
| TC-032 | FR-003 | Negative | Compliance gate fails -- active sanctions alert | Client C-300 has an unresolved sanctions alert | 1. Complete all scrutiny items. 2. Save. | Sanctions gate returns `failed`. Item status = `failed`. User informed of the block reason. | P0 |
| TC-033 | FR-003 | Negative | Compliance gate fails -- open complaint | Client C-400 has an open complaint | 1. Save after completing scrutiny. | Complaints gate returns `failed`. Item blocked. | P0 |
| TC-034 | FR-003 | Negative | Compliance gate fails -- conflict of interest detected | Incoming RM-B has a COI flag with client C-500 | 1. Select C-500 for handover to RM-B. 2. Save. | COI gate returns `failed`. Item blocked. User sees: "Conflict of interest detected between incoming RM and client." | P0 |
| TC-035 | FR-003 | Negative | Compliance gate fails -- pending settlement above threshold | Client C-600 has pending settlements exceeding configured threshold | 1. Save. | Settlement threshold gate returns `failed`. Item blocked. | P0 |
| TC-036 | FR-003 | Negative | Missing Incoming Referring RM (if mandatory) | BO_MAKER logged in; Incoming Referring RM field left empty | 1. Fill all other fields. 2. Leave Incoming Referring RM blank. 3. Save. | If field is mandatory: validation error. If optional: save proceeds. Document the expected behavior per specification. | P1 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-037 | FR-003 | Edge Case | Client with zero AUM and no products | Client C-700 is newly onboarded with AUM = 0, product count = 0, no orders, no settlements, tenure = 0 | 1. Open handover form for C-700. | Portfolio Complexity Indicators show all zeros. No errors. Handover can still be initiated. | P2 |
| TC-038 | FR-003 | Edge Case | Multiple compliance gates fail for same client | Client C-800 has KYC pending AND sanctions alert AND open complaint | 1. Save handover. | All three gates return `failed`. All failure reasons are displayed to the user. Item status = `failed`. | P1 |
| TC-039 | FR-003 | Edge Case | Mixed batch: some clients pass, some fail compliance | Handover includes C-100 (all pass), C-200 (KYC fail), C-300 (all pass) | 1. Select C-100, C-200, C-300. 2. Complete scrutiny for all. 3. Save. | C-100 and C-300 items: status = `included`. C-200 item: status = `failed`. Handover proceeds with 2 of 3 items. User is notified which items failed and why. | P0 |

### Data Minimization Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-040 | FR-003 | Permission | BO_MAKER sees only aggregate portfolio data | BO_MAKER logged in; client has detailed holdings | 1. Open client handover form. 2. View Portfolio Complexity Indicators. | BO_MAKER sees aggregate AUM, product count, open orders, settlements, tenure. Does NOT see individual holdings, account numbers, or position-level data. | P0 |
| TC-041 | FR-003 | Permission | BO_CHECKER sees full portfolio detail | BO_CHECKER logged in; viewing handover in authorization queue | 1. Open handover detail for a client handover. 2. View portfolio section. | BO_CHECKER sees full portfolio detail including individual holdings, positions, and account-level data. | P0 |

---

## FR-004: Handover Authorization (Checker Approval)

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-042 | FR-004 | Happy Path | Successfully authorize a lead handover | BO_CHECKER logged in; handover HO-100 (lead) with status `pending_authorization` created by different user | 1. Navigate to Authorization Queue. 2. Verify queue is sorted by SLA deadline (earliest first). 3. Open HO-100 detail view. 4. Review items, compliance results. 5. Click Authorize. | Handover status changes to `authorized`. RM reassignment executes: lead now belongs to incoming RM. Audit log entry: action = `HANDOVER_AUTHORIZED`. Notification sent to outgoing RM, incoming RM. | P0 |
| TC-043 | FR-004 | Happy Path | Successfully authorize a client handover | BO_CHECKER logged in; handover HO-200 (client) with scrutiny checklist and compliance results | 1. Open HO-200 detail view. 2. Review scrutiny checklist (all items completed). 3. Review compliance results (all passed). 4. Review full portfolio detail. 5. Click Authorize. | Status -> `authorized`. Client RM reassignment executes. Full portfolio visible to checker. Audit log created. | P0 |
| TC-044 | FR-004 | Happy Path | Reject a handover with valid reason | BO_CHECKER logged in; handover HO-300 in `pending_authorization` | 1. Open HO-300. 2. Click Reject. 3. Enter rejection reason (>= 10 chars) in modal. 4. Confirm. | Status -> `rejected`. Rejection reason persisted. Audit log: action = `HANDOVER_REJECTED`. Notification sent to maker. RM reassignment does NOT execute. | P0 |
| TC-045 | FR-004 | Happy Path | Authorization queue sorted by SLA deadline | BO_CHECKER logged in; 3 handovers: HO-A (SLA 2h remaining), HO-B (SLA 24h remaining), HO-C (SLA overdue) | 1. Navigate to Authorization Queue. | Queue order: HO-C (overdue, top), HO-A (2h, second), HO-B (24h, third). SLA badges displayed correctly. | P1 |
| TC-046 | FR-004 | Happy Path | Detail view shows all required information | BO_CHECKER logged in; client handover HO-400 with 2 items, scrutiny, compliance, portfolio | 1. Open HO-400 detail. | View displays: (1) Handover items with entity details, (2) Scrutiny checklist with all 13 items and their statuses, (3) Compliance gate results (5 gates with pass/fail for each item), (4) Full portfolio for client items. | P0 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-047 | FR-004 | Negative | Rejection reason below minimum length | BO_CHECKER logged in; rejecting handover HO-500 | 1. Click Reject. 2. Enter reason with 9 characters. 3. Confirm. | Validation error: "Rejection reason must be at least 10 characters." Modal does not close. Handover remains in `pending_authorization`. | P0 |
| TC-048 | FR-004 | Negative | Rejection reason is empty | BO_CHECKER rejecting HO-500 | 1. Click Reject. 2. Leave reason blank. 3. Confirm. | Validation error: "Rejection reason is required." | P0 |
| TC-049 | FR-004 | Negative | Checker attempts to authorize own handover (self-approval) | BO_CHECKER "User-X" logged in; HO-600 was created by User-X (who also has BO_MAKER role or dual role) | 1. Open HO-600. 2. Click Authorize. | Error: "You cannot authorize a handover that you initiated." Authorize button may be hidden or disabled for own handovers. Status remains `pending_authorization`. | P0 |
| TC-050 | FR-004 | Negative | Items with status=failed excluded from transfer | HO-700 has 3 items: item-A (included), item-B (failed -- KYC), item-C (included) | 1. BO_CHECKER authorizes HO-700. | Only item-A and item-C have RM reassigned. Item-B is skipped (status remains `failed`). Authorization proceeds for passing items. Audit log notes excluded items. | P0 |

### Permission Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-051 | FR-004 | Permission | BO_MAKER cannot authorize handovers | BO_MAKER logged in | 1. Navigate to Authorization Queue. 2. Attempt to authorize a handover. | Access denied (HTTP 403). Authorize action is restricted to BO_CHECKER (and possibly BO_HEAD). | P0 |
| TC-052 | FR-004 | Permission | RELATIONSHIP_MANAGER cannot access authorization queue | RELATIONSHIP_MANAGER logged in | 1. Attempt to access the authorization queue endpoint. | Access denied (HTTP 403). | P0 |
| TC-053 | FR-004 | Permission | BO_HEAD can authorize handovers | BO_HEAD logged in; handover HO-800 pending | 1. Open HO-800. 2. Authorize. | Verify whether BO_HEAD is permitted to act as checker. If yes: authorization succeeds. If no: access denied. Document per RBAC matrix. | P1 |

---

## FR-012: Compliance Gate Checks

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-054 | FR-012 | Happy Path | All 5 compliance gates pass | Client has: valid KYC, no sanctions alerts, no open complaints, no COI, no pending settlements above threshold | 1. Submit client handover. 2. Compliance gates auto-run. | All 5 gates return `passed`. Item status = `included`. No blocks. Gate results persisted with the handover. | P0 |
| TC-055 | FR-012 | Happy Path | COMPLIANCE_OFFICER overrides a failed gate | Client C-900 has KYC pending (gate fails) | 1. Submit handover -- KYC gate fails, item status = `failed`. 2. COMPLIANCE_OFFICER logs in. 3. Navigates to the failed compliance gate. 4. Enters override reason. 5. Approves override. | Gate overridden. Item status changes from `failed` to `included`. Override reason logged in audit trail. Audit entry includes: actor = COMPLIANCE_OFFICER, action = `COMPLIANCE_OVERRIDE`, gate = `KYC`, reason = provided text. | P0 |
| TC-056 | FR-012 | Happy Path | Each gate type checked independently | Client has: KYC valid, sanctions alert active, no complaints, no COI, no settlements issue | 1. Submit handover. 2. Gates auto-run. | KYC = passed, Sanctions = failed, Complaints = passed, COI = passed, Settlements = passed. Only sanctions gate fails. Item blocked with specific failure reason for sanctions only. | P0 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-057 | FR-012 | Negative | Non-compliance role attempts gate override | BO_MAKER logged in; compliance gate failed for a client | 1. Attempt to access compliance override endpoint. | Access denied (HTTP 403). Only COMPLIANCE_OFFICER can override. | P0 |
| TC-058 | FR-012 | Negative | Override without providing a reason | COMPLIANCE_OFFICER logged in; gate failed | 1. Attempt to override without entering a reason. | Validation error: "Override reason is required." Override not applied. | P0 |

### Edge Cases / Circuit Breaker

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-059 | FR-012 | Edge Case | Circuit breaker trips after 3 failures | KYC external service is down; circuit breaker configured with failureThreshold = 3, resetTimeoutMs = 60000 | 1. Submit handover for client-1 -- KYC service call fails (failure count = 1). 2. Submit for client-2 -- fails (count = 2). 3. Submit for client-3 -- fails (count = 3). 4. Submit for client-4 immediately. | First 3 calls: KYC gate returns service error; items marked with gate error. After 3rd failure: circuit breaker state = `OPEN`. 4th call: immediately rejected with "Circuit breaker 'kyc-gate' is OPEN -- request rejected" without calling external service. Fail-fast within ~60s window. | P0 |
| TC-060 | FR-012 | Edge Case | Circuit breaker recovers after timeout | Circuit breaker is OPEN; 60 seconds have elapsed | 1. Wait 60 seconds after circuit opens. 2. Submit handover for client-5. | Circuit breaker transitions to `HALF_OPEN`. KYC service call is attempted. If succeeds: circuit returns to `CLOSED`, gate result is returned normally. If fails: circuit returns to `OPEN`. | P1 |
| TC-061 | FR-012 | Edge Case | All 5 gates fail for a single client | Client has: KYC pending, sanctions alert, open complaint, COI flag, high pending settlements | 1. Submit handover. | All 5 gates return `failed`. All 5 failure reasons displayed. Item status = `failed`. Handover can still proceed if other items pass. | P1 |
| TC-062 | FR-012 | Edge Case | Compliance gate service returns unexpected error (non-boolean) | External KYC service returns HTTP 500 | 1. Submit handover. | System handles the error gracefully. Gate is treated as `error` (not `passed`). User sees: "KYC gate check failed due to a service error. Please retry or contact support." Item is not auto-passed. | P1 |
| TC-063 | FR-012 | Edge Case | Override audit trail is immutable | COMPLIANCE_OFFICER overrides a gate | 1. Override gate with reason. 2. Attempt to modify or delete the override audit entry via API. | Audit entry is immutable. No update or delete endpoint exists. Override event is permanently recorded. | P1 |

---

## FR-021: Handover Reversal

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-064 | FR-021 | Happy Path | Successfully reverse a handover within 7-day window | Handover HO-100 authorized 3 days ago; incoming RM has NOT executed any trades for the client; original RM is active | 1. BO_MAKER navigates to the authorized handover. 2. Clicks "Request Reversal." 3. Enters reversal reason (mandatory). 4. Submits. | Reversal request created with status `pending_authorization`. Audit log: action = `REVERSAL_REQUESTED`. | P0 |
| TC-065 | FR-021 | Happy Path | Checker approves reversal | Reversal REV-100 in `pending_authorization`; created by different user than checker | 1. BO_CHECKER opens reversal REV-100. 2. Reviews details. 3. Approves. | Reversal status -> `authorized`. Client is reassigned back to original (outgoing) RM. All entity associations restored. Audit log: `REVERSAL_AUTHORIZED`. Notifications sent to both RMs. | P0 |
| TC-066 | FR-021 | Happy Path | Reversal with COMPLIANCE_OFFICER approval (incoming RM has trades) | Handover HO-200 authorized 5 days ago; incoming RM-B has executed 2 trades for the client since handover | 1. BO_MAKER requests reversal. 2. BO_CHECKER approves. 3. System detects incoming RM has trades. 4. Additional approval required from COMPLIANCE_OFFICER. 5. COMPLIANCE_OFFICER approves. | Reversal requires 3-step approval (maker -> checker -> compliance). Only after all three approvals does the reversal execute. Audit trail records all three approval steps. | P0 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-067 | FR-021 | Negative | Reversal after 7-day window expired | Handover HO-300 authorized 8 days ago; default reversal window = 7 days | 1. BO_MAKER attempts to request reversal. | Error: "Reversal window expired. This handover was authorized more than 7 days ago." Reversal button is disabled or hidden. | P0 |
| TC-068 | FR-021 | Negative | Reversal reason is empty | BO_MAKER requesting reversal within window | 1. Click Request Reversal. 2. Leave reason blank. 3. Submit. | Validation error: "Reversal reason is required." | P0 |
| TC-069 | FR-021 | Negative | Reversal when original RM is deactivated | Handover authorized 2 days ago; original RM has been deactivated (status = inactive) | 1. BO_MAKER requests reversal for this handover. | Error: "Reversal blocked -- the original RM (RM-A) has been deactivated." Reversal cannot proceed because the target RM is no longer active. | P0 |
| TC-070 | FR-021 | Negative | COMPLIANCE_OFFICER rejects reversal (incoming RM has trades) | Reversal requires compliance approval; COMPLIANCE_OFFICER reviews and rejects | 1. COMPLIANCE_OFFICER opens the reversal. 2. Rejects with reason. | Reversal status -> `rejected`. Client stays with incoming RM. Audit log: `REVERSAL_REJECTED` with compliance officer reason. | P1 |
| TC-071 | FR-021 | Negative | BO_CHECKER rejects reversal | Reversal REV-200 in `pending_authorization` | 1. BO_CHECKER opens REV-200. 2. Rejects with reason (>= 10 chars). | Reversal rejected. Original handover remains `authorized`. No RM changes. | P1 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-072 | FR-021 | Edge Case | Reversal window configured to maximum (30 days) | System admin has configured reversal window = 30 days | 1. Handover authorized 29 days ago. 2. Request reversal. | Reversal allowed (within 30-day window). | P2 |
| TC-073 | FR-021 | Edge Case | Reversal window configured above maximum (31 days) | Admin attempts to set reversal window = 31 days | 1. Set configuration. | Validation error: "Maximum reversal window is 30 days." Configuration rejected. | P2 |
| TC-074 | FR-021 | Edge Case | Reversal on day 7 at 23:59:59 (boundary) | Handover authorized exactly 7 days ago minus 1 second | 1. Request reversal at boundary time. | Reversal is allowed (within window). System uses precise timestamp comparison, not just date. | P1 |
| TC-075 | FR-021 | Edge Case | Reversal of a handover that included mixed pass/fail items | Handover HO-400 had 3 items: 2 authorized (RM changed), 1 failed (not transferred) | 1. Request reversal of HO-400. | Only the 2 successfully transferred items are reversed. The failed item (which was never transferred) is unaffected. | P1 |
| TC-076 | FR-021 | Edge Case | Double reversal attempt on same handover | Reversal REV-300 already `pending_authorization` for HO-500 | 1. Another BO_MAKER attempts to request a second reversal for HO-500. | Error: "A reversal is already pending for this handover." Only one active reversal per handover allowed. | P1 |
| TC-077 | FR-021 | Edge Case | Reversal of lead/prospect handover (no trade check needed) | Lead handover authorized 3 days ago | 1. Request reversal. | Reversal follows standard maker-checker flow. No compliance approval needed (trade check only applies to client handovers). | P1 |

### Permission Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-078 | FR-021 | Permission | RELATIONSHIP_MANAGER cannot request reversal | RELATIONSHIP_MANAGER logged in | 1. Attempt to request reversal. | Access denied (HTTP 403). Only BO_MAKER can initiate reversals. | P0 |
| TC-079 | FR-021 | Permission | BO_MAKER cannot self-approve reversal | BO_MAKER "User-A" created reversal REV-400 | 1. User-A (if also BO_CHECKER) attempts to approve REV-400. | Error: "You cannot approve a reversal that you initiated." Self-approval blocked. | P0 |

---

## FR-022: Client Notification on RM Change

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-080 | FR-022 | Happy Path | Client notification triggered on authorization | Client handover HO-100 authorized; client has valid email on file | 1. BO_CHECKER authorizes HO-100. | Notification triggered to client about RM change. Email sent to client's registered email address. In-app notification created (if applicable). Audit log: `CLIENT_NOTIFICATION_SENT`. | P0 |
| TC-081 | FR-022 | Happy Path | Consent recording via manual checkbox | Handover has `requires_consent` = true; client email received | 1. Checker sees consent is required before authorization. 2. Maker records consent: checks the "consent obtained" checkbox. 3. Enters consent date and method (e.g., "Phone call, 2026-04-20"). 4. Saves. | Consent recorded with date and method. Authorization can now proceed. | P0 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-082 | FR-022 | Negative | `requires_consent` blocks authorization when consent not recorded | Handover has `requires_consent` = true; no consent recorded | 1. BO_CHECKER attempts to authorize. | Authorization blocked. Error: "Client consent is required before this handover can be authorized." | P0 |
| TC-083 | FR-022 | Negative | Client has no email address | Client handover authorized; client has no email on file | 1. System attempts to send notification after authorization. | Notification logged as "undeliverable". Audit entry created: action = `NOTIFICATION_UNDELIVERABLE`, reason = "No email address on file." Handover authorization is NOT blocked (notification failure does not prevent the handover). | P0 |
| TC-084 | FR-022 | Negative | Lead/prospect handover does NOT trigger client notification | Lead handover authorized | 1. BO_CHECKER authorizes lead handover. | No client notification is sent. Client notifications apply only to client-type handovers. | P1 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-085 | FR-022 | Edge Case | Notification for batch client handover | Handover contains 5 clients, all with valid emails | 1. Authorize the handover. | 5 individual notifications sent, one per client. Each notification references the specific client and their new RM. | P1 |
| TC-086 | FR-022 | Edge Case | Mixed batch: some clients have email, some do not | Handover: C-100 (has email), C-200 (no email), C-300 (has email) | 1. Authorize. | C-100 and C-300: notifications sent. C-200: logged as "undeliverable". All three handover items are authorized regardless of notification deliverability. | P1 |
| TC-087 | FR-022 | Edge Case | Consent required for one client in a multi-client handover | 3 clients in handover: C-100 (requires_consent=false), C-200 (requires_consent=true, consent not recorded), C-300 (requires_consent=false) | 1. Attempt to authorize. | Authorization blocked for the entire handover (or just C-200, depending on implementation). Error identifies C-200 as needing consent. Document expected behavior per specification. | P1 |

---

## FR-013: SLA Tracking

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-088 | FR-013 | Happy Path | SLA auto-calculated from configuration | sla_configurations table has entry: entity_type = `client`, sla_hours = 72, warning_hours = 48 | 1. Submit a client handover at 10:00 AM. | SLA deadline set to 72 hours from submission (Day+3, 10:00 AM). Warning threshold = 48 hours from submission (Day+2, 10:00 AM). SLA badge = "On Track" (green). | P0 |
| TC-089 | FR-013 | Happy Path | SLA badge transitions: On Track -> At Risk -> Overdue | Client handover submitted; SLA = 72h, warning = 48h | 1. At T+0h: verify badge = "On Track" (green). 2. At T+48h: verify badge = "At Risk" (amber). 3. At T+72h: verify badge = "Overdue" (red). | Badge colors transition correctly at configured thresholds. Warning notification sent at T+48h. Escalation notification sent at T+72h. | P0 |
| TC-090 | FR-013 | Happy Path | Warning notification sent at threshold | SLA warning threshold reached | 1. Clock reaches warning threshold for HO-100. | In-app and/or email notification sent to assigned BO_CHECKER and BO_HEAD: "Handover HO-100 is approaching its SLA deadline." | P1 |
| TC-091 | FR-013 | Happy Path | Escalation notification sent when overdue | SLA deadline passed; handover still `pending_authorization` | 1. Clock passes SLA deadline. | Escalation notification sent to BO_HEAD. SLA badge = "Overdue" (red). Handover is surfaced at top of authorization queue. | P1 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-092 | FR-013 | Edge Case | No SLA configuration exists for entity type | Lead handover submitted; no sla_configurations entry for entity_type = `lead` | 1. Submit lead handover. | System defaults to 48-hour SLA with 24-hour warning. Badge calculation uses defaults. Audit log notes: "Default SLA applied -- no configuration found for entity_type=lead." | P0 |
| TC-093 | FR-013 | Edge Case | Handover authorized before warning threshold | Client handover submitted; SLA = 72h; authorized at T+12h | 1. BO_CHECKER authorizes at T+12h. | SLA tracking stops. No warning or escalation notifications are sent. Final SLA status = "Completed within SLA." | P2 |
| TC-094 | FR-013 | Edge Case | SLA configuration updated after handover created | Handover HO-100 created with SLA = 72h; admin changes SLA to 48h | 1. Admin updates sla_configurations. | HO-100 retains its original SLA of 72h (SLA snapshot at creation time). New handovers use updated 48h SLA. | P1 |

---

## FR-014: Handover Dashboard

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-095 | FR-014 | Happy Path | Dashboard renders 4 summary cards | User logged in with appropriate role; handover data exists | 1. Navigate to Handover Dashboard. | Four summary cards displayed showing key metrics (e.g., Total Pending, Authorized Today, Overdue, Average SLA Time). Values are accurate based on current data. | P0 |
| TC-096 | FR-014 | Happy Path | Pending handovers table displayed | Handovers exist in `pending_authorization` status | 1. View dashboard. | Pending table shows all pending handovers with columns: ID, entity type, outgoing RM, incoming RM, submitted date, SLA badge. Table is sortable. | P0 |
| TC-097 | FR-014 | Happy Path | SLA distribution chart renders | Mix of On Track, At Risk, Overdue handovers exist | 1. View SLA chart on dashboard. | Chart shows distribution of SLA statuses. Green/amber/red segments match actual counts. | P1 |
| TC-098 | FR-014 | Happy Path | Trend chart renders | Handover data exists across multiple weeks | 1. View trend chart. | Trend chart shows handover volume over time (e.g., weekly). Data points are accurate. | P1 |
| TC-099 | FR-014 | Happy Path | Filters work correctly | Handovers exist for multiple branches, RMs, date ranges, statuses | 1. Apply filter: date range = last 7 days. 2. Apply filter: entity_type = client. 3. Apply filter: status = pending_authorization. 4. Apply filter: branch = "Branch-A". 5. Apply filter: RM = "RM-B". | Each filter narrows results correctly. Combined filters apply AND logic. Summary cards and charts update to reflect filtered data. | P0 |
| TC-100 | FR-014 | Happy Path | CSV export | Dashboard shows filtered data | 1. Apply filters. 2. Click CSV Export. | CSV file downloaded containing the currently displayed/filtered data. Columns match the pending table columns. File name includes date stamp. | P1 |
| TC-101 | FR-014 | Happy Path | Auto-refresh at 60-second interval | Dashboard open; new handover submitted by another user | 1. Keep dashboard open. 2. Another user submits a new handover. 3. Wait up to 60 seconds. | Dashboard auto-refreshes and shows the new handover without manual page reload. Summary card counts update. | P1 |

### Permission / Role-Based Data Scoping

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-102 | FR-014 | Permission | RELATIONSHIP_MANAGER sees only own handovers | RM-A logged in; handovers exist for RM-A (outgoing or incoming) and for RM-B | 1. Navigate to dashboard. | RM-A sees only handovers where RM-A is the outgoing RM or incoming RM. RM-B's handovers are not visible. | P0 |
| TC-103 | FR-014 | Permission | SENIOR_RM sees branch-level handovers | SENIOR_RM logged in; assigned to Branch-X; handovers exist for Branch-X and Branch-Y | 1. Navigate to dashboard. | SENIOR_RM sees all handovers within Branch-X. Handovers from Branch-Y are not visible. | P0 |
| TC-104 | FR-014 | Permission | BO_HEAD sees global handovers | BO_HEAD logged in; handovers exist across all branches | 1. Navigate to dashboard. | BO_HEAD sees all handovers across all branches and RMs. No data scoping restriction. | P0 |
| TC-105 | FR-014 | Permission | BO_MAKER sees relevant handovers | BO_MAKER logged in | 1. Navigate to dashboard. | BO_MAKER sees handovers they have created or that are assigned to their purview. Verify scoping rules per RBAC design. | P1 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-106 | FR-014 | Edge Case | Dashboard with zero handovers | New deployment; no handover data exists | 1. Navigate to dashboard. | Dashboard renders without errors. Summary cards show 0. Pending table shows "No handovers found." Charts show empty state. | P1 |
| TC-107 | FR-014 | Edge Case | CSV export with no data (empty result) | Filters applied result in zero matching handovers | 1. Apply filters with no matches. 2. Click CSV Export. | Either: (a) CSV with headers only and no data rows, or (b) message "No data to export." No error. | P2 |
| TC-108 | FR-014 | Edge Case | Auto-refresh does not reset applied filters | Filters applied; 60-second refresh triggers | 1. Apply filters. 2. Wait for auto-refresh. | Filters remain applied after refresh. Data refreshes within the filtered scope only. User does not lose their filter context. | P1 |

---

## FR-016: Notification Engine

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-109 | FR-016 | Happy Path | Email + in-app notification sent for handover lifecycle event | Handover authorized; incoming RM has email configured and in-app notifications enabled | 1. BO_CHECKER authorizes handover. | Incoming RM receives both email and in-app notification about the new assignment. Outgoing RM receives notification about entity transfer. | P0 |
| TC-110 | FR-016 | Happy Path | User configures notification preferences | RM-A logs in to notification preferences | 1. Disable email notifications for "Handover Initiated." 2. Keep in-app enabled. 3. Save preferences. | Preference saved. Next time a handover is initiated involving RM-A, only in-app notification is sent (no email). | P1 |
| TC-111 | FR-016 | Happy Path | Notification on handover rejection | Handover rejected by BO_CHECKER | 1. BO_CHECKER rejects handover. | BO_MAKER who created the handover receives notification (email + in-app) with rejection reason. | P1 |
| TC-112 | FR-016 | Happy Path | Notification on reversal request | Reversal requested | 1. BO_MAKER requests reversal. | Relevant parties (incoming RM, outgoing RM, BO_CHECKER) receive notification of reversal request. | P1 |

### Negative / Validation

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-113 | FR-016 | Negative | Email delivery failure with retry | Email server temporarily unavailable | 1. Handover authorized, triggering email notification. 2. Email delivery fails on first attempt. | System retries up to 3 times with exponential backoff (e.g., 1s, 2s, 4s). If all 3 retries fail, notification is logged as `failed` with error reason. In-app notification is still delivered independently. | P0 |
| TC-114 | FR-016 | Negative | All 3 email retries fail | Email server down for extended period | 1. Handover triggers email. 2. All 3 retry attempts fail. | Notification status = `failed`. Error logged with all 3 attempt timestamps and failure reasons. System does not retry indefinitely. In-app notification delivered successfully. | P1 |
| TC-115 | FR-016 | Negative | Compliance notifications cannot be opted out | COMPLIANCE_OFFICER attempts to disable compliance-related notifications | 1. Navigate to notification preferences. 2. Attempt to disable "Compliance Gate Override" or "SLA Escalation" notifications. | The toggle/checkbox for compliance notifications is disabled or hidden. Message: "Compliance notifications are mandatory and cannot be disabled." Preference save succeeds but compliance notifications remain enabled. | P0 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-116 | FR-016 | Edge Case | User has all non-compliance notifications disabled | RM-A has disabled all optional notifications | 1. Handover involving RM-A is authorized. | RM-A receives NO email and NO in-app for the handover event. However, if a compliance event occurs (e.g., compliance gate override involving RM-A's client), RM-A still receives that notification. | P1 |
| TC-117 | FR-016 | Edge Case | Notification for deactivated user | Outgoing RM has been deactivated after handover was submitted but before authorization | 1. Authorize handover. 2. System attempts notification to deactivated outgoing RM. | Notification to deactivated user is logged as "undeliverable" or skipped. No system error. Other recipients still receive their notifications. | P2 |
| TC-118 | FR-016 | Edge Case | High volume: 50 handovers authorized simultaneously | Batch authorization of 50 handovers | 1. System processes 50 authorizations. | All 50 sets of notifications are queued and delivered. No notifications lost. System handles concurrent notification generation without race conditions. | P2 |

---

## FR-018: Audit Trail Viewer

### Happy Path

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-119 | FR-018 | Happy Path | View audit trail with filters | COMPLIANCE_OFFICER logged in; audit entries exist | 1. Navigate to Audit Trail Viewer. 2. Apply filter: date range = last 24 hours. 3. Apply filter: action = `HANDOVER_AUTHORIZED`. | Read-only table displays matching audit entries. Columns include: timestamp, actor, actor_role, action, entity_type, entity_id, details. Table is sortable by timestamp. | P0 |
| TC-120 | FR-018 | Happy Path | View JSON detail for an audit event | COMPLIANCE_OFFICER logged in; audit entry with detailed metadata exists | 1. Click on an audit entry row. 2. JSON detail viewer opens. | JSON viewer displays the full event metadata including: before/after state, IP address, correlation_id, user_agent, and any additional context. JSON is formatted and readable. | P0 |
| TC-121 | FR-018 | Happy Path | CSV export of audit trail | BO_HEAD logged in; filtered audit data displayed | 1. Apply filters. 2. Click CSV Export. | CSV file downloaded with all columns from the audit table. Data matches the filtered view. Timestamps in ISO format. | P1 |
| TC-122 | FR-018 | Happy Path | Audit trail is read-only | COMPLIANCE_OFFICER logged in | 1. View audit trail. 2. Attempt to find any edit, delete, or modify control. | No edit or delete controls exist. All data is read-only. No API endpoints exist for modifying audit records. | P0 |

### Permission Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-123 | FR-018 | Permission | COMPLIANCE_OFFICER can access audit trail | COMPLIANCE_OFFICER logged in | 1. Navigate to Audit Trail Viewer. | Access granted. Full audit trail visible. | P0 |
| TC-124 | FR-018 | Permission | BO_HEAD can access audit trail | BO_HEAD logged in | 1. Navigate to Audit Trail Viewer. | Access granted. Full audit trail visible. | P0 |
| TC-125 | FR-018 | Permission | SYSTEM_ADMIN can access audit trail | SYSTEM_ADMIN logged in | 1. Navigate to Audit Trail Viewer. | Access granted. Full audit trail visible. | P0 |
| TC-126 | FR-018 | Permission | BO_MAKER cannot access audit trail | BO_MAKER logged in | 1. Attempt to navigate to Audit Trail Viewer. | Access denied (HTTP 403). Audit Trail menu item is hidden or disabled. | P0 |
| TC-127 | FR-018 | Permission | BO_CHECKER cannot access audit trail | BO_CHECKER logged in | 1. Attempt to access audit trail endpoint. | Access denied (HTTP 403). | P0 |
| TC-128 | FR-018 | Permission | RELATIONSHIP_MANAGER cannot access audit trail | RELATIONSHIP_MANAGER logged in | 1. Attempt to access audit trail endpoint. | Access denied (HTTP 403). | P0 |

### Edge Cases

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-129 | FR-018 | Edge Case | Audit trail with large dataset (10,000+ entries) | Production-scale audit data | 1. Navigate to Audit Trail Viewer with no filters. | Table loads with pagination. Performance is acceptable (< 3 seconds initial load). User can page through results. | P2 |
| TC-130 | FR-018 | Edge Case | Filter returns zero results | Filter by date range with no activity | 1. Apply filter: date range = "2020-01-01 to 2020-01-02." | Table displays: "No audit entries found for the selected filters." No error. | P2 |

---

## State Transition Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-131 | FR-001, FR-004 | State | Full lifecycle: draft -> pending_authorization -> authorized | Handover created and submitted | 1. BO_MAKER submits handover (status = `pending_authorization`). 2. BO_CHECKER authorizes (status = `authorized`). | State transitions are correct. Each transition is recorded in audit trail. RM reassignment occurs only on `authorized`. | P0 |
| TC-132 | FR-001, FR-004 | State | Lifecycle: draft -> pending_authorization -> rejected | Handover created and rejected | 1. BO_MAKER submits handover. 2. BO_CHECKER rejects with reason. | Status = `rejected`. No RM reassignment. Audit trail records both transitions. Maker notified of rejection. | P0 |
| TC-133 | FR-001, FR-004, FR-021 | State | Full lifecycle with reversal: pending_auth -> authorized -> reversal_pending -> reversed | Handover authorized, then reversed within window | 1. BO_MAKER submits. 2. BO_CHECKER authorizes. 3. BO_MAKER requests reversal (within 7 days). 4. BO_CHECKER approves reversal. | Final status = `reversed`. RM reassignment undone. Full audit trail from submission through reversal. Original RM re-associated with entities. | P0 |
| TC-134 | FR-004 | State | Cannot authorize an already authorized handover | Handover HO-100 already `authorized` | 1. Attempt to call authorize endpoint for HO-100 again. | Error: "Handover is already authorized." No state change. Idempotency or guard prevents double-authorization. | P1 |
| TC-135 | FR-004 | State | Cannot authorize a rejected handover | Handover HO-200 with status `rejected` | 1. Attempt to authorize HO-200. | Error: "Cannot authorize a handover with status 'rejected'." Only `pending_authorization` can transition to `authorized`. | P1 |
| TC-136 | FR-021 | State | Cannot reverse a rejected handover | Handover HO-300 with status `rejected` (was never authorized) | 1. Attempt to request reversal. | Error: "Reversal is only available for authorized handovers." Reversal button not visible. | P1 |
| TC-137 | FR-021 | State | Cannot reverse an already reversed handover | Handover HO-400 with status `reversed` | 1. Attempt to request a second reversal. | Error: "This handover has already been reversed." No double-reversal. | P1 |

---

## Integration Tests

| TC-ID | FR Ref | Category | Description | Preconditions | Steps | Expected Result | Priority |
|-------|--------|----------|-------------|---------------|-------|-----------------|----------|
| TC-138 | FR-003, FR-012 | Integration | Compliance gates integrate with KYC/sanctions services | Client handover submitted; KYC service and sanctions service are operational | 1. Save client handover. 2. Compliance gates auto-call KYC service. 3. Compliance gates auto-call sanctions service. | Both services are called via anti-corruption layer. Results are correctly mapped to gate pass/fail. Circuit breakers protect against service failures. Response times are within acceptable limits. | P0 |
| TC-139 | FR-004, FR-022, FR-016 | Integration | Authorization triggers notification and client notification | Client handover authorized | 1. BO_CHECKER authorizes client handover. | (a) RM reassignment executes. (b) Client notification triggered (FR-022). (c) Internal notifications sent to maker, incoming RM, outgoing RM (FR-016). (d) Audit log entry created (FR-018). All four events occur atomically or in correct order. | P0 |
| TC-140 | FR-004, FR-013 | Integration | SLA badge updates on authorization queue | Handover approaching SLA deadline | 1. View authorization queue at T+0 (green). 2. View at T+warning (amber). 3. View at T+deadline (red). | SLA badges in the authorization queue reflect real-time SLA status. Queue sorting by SLA deadline works correctly with live badge data. | P1 |
| TC-141 | FR-021, FR-016, FR-018 | Integration | Reversal triggers notifications and audit entries | Handover reversed | 1. Reversal approved. 2. Check notifications. 3. Check audit trail. | (a) RM reassignment undone. (b) Notifications sent to all parties: incoming RM, outgoing (restored) RM, maker, checker. (c) Audit trail entries for reversal request, approval, and execution. (d) If client handover, client notification sent about RM reversion. | P0 |
| TC-142 | FR-012, FR-018 | Integration | Compliance gate override appears in audit trail | COMPLIANCE_OFFICER overrides a failed KYC gate | 1. Override gate. 2. Navigate to Audit Trail Viewer. 3. Filter by action = `COMPLIANCE_OVERRIDE`. | Audit entry shows: actor = COMPLIANCE_OFFICER, action = COMPLIANCE_OVERRIDE, gate_type = KYC, override_reason = provided text, entity_id = client ID, timestamp. Entry is immutable and visible to all authorized audit viewers. | P0 |

---

## Summary by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 68 | Critical path tests -- must pass for release |
| P1 | 52 | Important tests -- should pass, minor workarounds possible |
| P2 | 22 | Nice-to-have -- edge cases with low probability |

## Summary by Category

| Category | Count |
|----------|-------|
| Happy Path | 38 |
| Negative / Validation | 30 |
| Edge Case | 36 |
| Permission | 22 |
| Integration | 5 |
| State Transition | 7 |
| Data Minimization | 2 |
| Circuit Breaker | 2 |

## Summary by FR

| FR | Test Cases | Description |
|----|-----------|-------------|
| FR-001 | TC-001 to TC-018 | Lead Handover Initiation |
| FR-002 | TC-019 to TC-025 | Prospect Handover Initiation |
| FR-003 | TC-026 to TC-041 | Client Handover with Scrutiny Checklist |
| FR-004 | TC-042 to TC-053 | Handover Authorization (Checker Approval) |
| FR-012 | TC-054 to TC-063 | Compliance Gate Checks |
| FR-021 | TC-064 to TC-079 | Handover Reversal |
| FR-022 | TC-080 to TC-087 | Client Notification on RM Change |
| FR-013 | TC-088 to TC-094 | SLA Tracking |
| FR-014 | TC-095 to TC-108 | Handover Dashboard |
| FR-016 | TC-109 to TC-118 | Notification Engine |
| FR-018 | TC-119 to TC-130 | Audit Trail Viewer |
| Cross-FR | TC-131 to TC-142 | State Transitions and Integration |
