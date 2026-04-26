# Trust Banking Hardening BRD v1.0 — Comprehensive Test Cases
**TrustOMS Philippines**
**Document Date:** 2026-04-25
**Scope:** 6 Modules, 21 Functional Requirements, 148 Test Cases

---

## Table of Contents

1. [Module CP-SEC: Client Portal Ownership](#module-cp-sec-client-portal-ownership)
2. [Module MSG: Client Messaging](#module-msg-client-messaging)
3. [Module STMT: Statement Download](#module-stmt-statement-download)
4. [Module SYSCONFIG: System Configuration](#module-sysconfig-system-configuration)
5. [Module DOCS: Document Storage](#module-docs-document-storage)
6. [Module FEED: Feed Health Persistence](#module-feed-feed-health-persistence)

---

## Module CP-SEC: Client Portal Ownership

### FR-CP-SEC-001: validatePortalOwnership() Middleware

Checks `req.user.clientId === route :clientId param`; returns 403 on mismatch; returns 401 if unauthenticated; writes audit log on violation.

---

#### TC-CP-SEC-001: Happy path — authenticated client accesses own resource

**Preconditions:** Client `CLT-001` is authenticated; session contains `req.user.clientId = 'CLT-001'`
**Input:** `GET /client-portal/clients/CLT-001/portfolio`
**Expected Result:**
- HTTP 200
- Middleware calls `next()`; no audit log entry created
- Response body contains portfolio data for CLT-001

---

#### TC-CP-SEC-002: Happy path — ownership check passes for statements endpoint

**Preconditions:** Client `CLT-042` authenticated with `req.user.clientId = 'CLT-042'`
**Input:** `GET /client-portal/clients/CLT-042/statements`
**Expected Result:**
- HTTP 200
- Middleware passes; statements for CLT-042 returned
- `unread_count` present in response envelope

---

#### TC-CP-SEC-003: Happy path — ownership check passes for service requests

**Preconditions:** Client `CLT-100` authenticated
**Input:** `POST /client-portal/clients/CLT-100/service-requests` with valid body
**Expected Result:**
- HTTP 201; service request created
- Middleware allows through without audit entry

---

#### TC-CP-SEC-004: Mismatch — authenticated client accesses another client's resource

**Preconditions:** Client `CLT-001` authenticated; route param is `:clientId = 'CLT-002'`
**Input:** `GET /client-portal/clients/CLT-002/portfolio`
**Expected Result:**
- HTTP 403
- Response body: `{ "error": { "code": "PORTAL_OWNERSHIP_VIOLATION", "message": "...", ... } }`
- Audit log entry created with `event_type = 'PORTAL_OWNERSHIP_VIOLATION'`, `actor_id = 'CLT-001'`, `resource_id = 'CLT-002'`
- `next()` NOT called

---

#### TC-CP-SEC-005: Unauthenticated request — no session user

**Preconditions:** No active session; `req.user` is null or undefined
**Input:** `GET /client-portal/clients/CLT-001/portfolio`
**Expected Result:**
- HTTP 401
- Response body: `{ "error": { "code": "UNAUTHENTICATED", "message": "Authentication required" } }`
- No audit log entry created (no actor to attribute)
- `next()` NOT called

---

#### TC-CP-SEC-006: Unauthenticated request — session exists but clientId missing

**Preconditions:** `req.user` object exists but `req.user.clientId` is null/undefined
**Input:** `GET /client-portal/clients/CLT-001/statements`
**Expected Result:**
- HTTP 401
- Same unauthenticated error response as TC-CP-SEC-005

---

#### TC-CP-SEC-007: Audit log entry structure on violation

**Preconditions:** Client `CLT-010` attempts to access `CLT-999`'s data
**Input:** `GET /client-portal/clients/CLT-999/documents`
**Expected Result:**
- Audit record contains:
  - `actor_id`: `'CLT-010'`
  - `action`: `'PORTAL_OWNERSHIP_VIOLATION'`
  - `resource_type`: `'CLIENT_PORTAL_ROUTE'`
  - `resource_id`: `'CLT-999'`
  - `created_at`: timestamp within 1 second of request
  - `ip_address`: client IP address
  - `correlation_id`: request correlation ID from `req.id`

---

#### TC-CP-SEC-008: Middleware applied to all protected routes — messages endpoint

**Preconditions:** Client `CLT-005` authenticated
**Input:** `GET /client-portal/clients/CLT-999/messages` (mismatched client)
**Expected Result:**
- HTTP 403; ownership violation
- Audit log entry written

---

#### TC-CP-SEC-009: Route with no :clientId param — middleware skips check

**Preconditions:** Client authenticated; route has no :clientId parameter (e.g., `/client-portal/health`)
**Input:** `GET /client-portal/health`
**Expected Result:**
- HTTP 200; middleware calls `next()` without ownership check
- No audit log entry

---

#### TC-CP-SEC-010: Case sensitivity of clientId comparison

**Preconditions:** Session `clientId = 'clt-001'`; route param `:clientId = 'CLT-001'`
**Input:** `GET /client-portal/clients/CLT-001/portfolio`
**Expected Result:**
- HTTP 403 (comparison is case-sensitive; `'clt-001' !== 'CLT-001'`)
- Audit log entry created

---

### FR-CP-SEC-002: Security Alert on Repeated Ownership Violations

Security alert triggered after 3+ ownership violations within 15 minutes from the same session; creates exception queue entry; notifies BO_HEAD.

---

#### TC-CP-SEC-011: Happy path — fewer than 3 violations, no alert

**Preconditions:** Client `CLT-001` has made 2 ownership violation attempts within 15 minutes
**Input:** Any request causing a 3rd violation after >15 minutes have passed since first violation (window reset)
**Expected Result:**
- HTTP 403 on the 3rd attempt
- No security alert created
- No exception queue entry

---

#### TC-CP-SEC-012: Security alert triggers on exactly 3rd violation within 15 minutes

**Preconditions:** Client `CLT-001` session makes violation #1 at T+0, violation #2 at T+5min, violation #3 at T+10min
**Input:** 3rd mismatched ownership request within 15-minute window
**Expected Result:**
- HTTP 403 returned to client
- Exception queue entry created with:
  - `exception_type`: `'PORTAL_SECURITY_ALERT'`
  - `severity`: `'P1'`
  - `description`: contains session ID and violation count
  - `aggregate_type`: `'CLIENT_SESSION'`
- BO_HEAD notification dispatched via `notificationInboxService`
- Notification `message` references the client and session

---

#### TC-CP-SEC-013: Security alert on 4th and 5th violations — no duplicate alerts

**Preconditions:** Alert already created at 3rd violation; 4th violation occurs
**Input:** 4th ownership violation in same 15-minute window
**Expected Result:**
- HTTP 403
- No second exception queue entry created (alert is per window, not per violation)
- Or: one new alert entry with updated violation count depending on implementation; either way only one BO_HEAD notification per window

---

#### TC-CP-SEC-014: Window resets after 15 minutes — new alert on fresh violations

**Preconditions:** Client had 3 violations at T=0; 16 minutes elapse; 3 new violations occur
**Input:** 3rd violation in new window
**Expected Result:**
- New exception queue entry created
- BO_HEAD notified again for the new window

---

#### TC-CP-SEC-015: Exception queue entry SLA — P1 severity

**Preconditions:** Security alert triggers (TC-CP-SEC-012 scenario)
**Expected Result:**
- `sla_due_at` on exception entry = `created_at + 4 hours` (P1 SLA per exception-queue-service)

---

#### TC-CP-SEC-016: Different sessions from same client — violations tracked per session

**Preconditions:** Client `CLT-001` has 2 sessions; each session makes 2 violations
**Expected Result:**
- Neither session reaches 3-violation threshold individually
- No security alert created
- Violations counted per session, not per clientId

---

## Module MSG: Client Messaging

### FR-MSG-001: GET /messages — Paginated Message List

Returns paginated list for session client; `unread_count` in envelope; sorted `sent_at` DESC.

---

#### TC-MSG-001: Happy path — client retrieves own messages

**Preconditions:** Client `CLT-001` authenticated; 5 messages exist for `CLT-001`
**Input:** `GET /client-portal/messages` (session resolves clientId automatically)
**Expected Result:**
- HTTP 200
- Response envelope:
  ```json
  {
    "data": [...],
    "unread_count": <number>,
    "pagination": { "page": 1, "pageSize": 20, "total": 5 }
  }
  ```
- Messages sorted by `sent_at` DESC (most recent first)
- All returned messages belong to CLT-001

---

#### TC-MSG-002: Happy path — unread_count reflects actual unread messages

**Preconditions:** Client has 3 unread and 4 read messages
**Input:** `GET /client-portal/messages`
**Expected Result:**
- `unread_count = 3`
- `data` array contains 7 messages total (or first page)
- Read/unread messages intermixed per date order

---

#### TC-MSG-003: Pagination — page 2 returns correct slice

**Preconditions:** Client has 25 messages
**Input:** `GET /client-portal/messages?page=2&pageSize=10`
**Expected Result:**
- HTTP 200
- `data` contains messages 11–20 (0-indexed: items at positions 10–19)
- `pagination.page = 2`, `pagination.pageSize = 10`, `pagination.total = 25`

---

#### TC-MSG-004: Empty mailbox — returns empty array, unread_count 0

**Preconditions:** Client `CLT-NEW` has no messages
**Input:** `GET /client-portal/messages`
**Expected Result:**
- HTTP 200
- `data = []`, `unread_count = 0`
- `pagination.total = 0`

---

#### TC-MSG-005: Unauthenticated access — 401

**Preconditions:** No valid session
**Input:** `GET /client-portal/messages`
**Expected Result:**
- HTTP 401
- No message data returned

---

#### TC-MSG-006: Messages from other clients NOT included

**Preconditions:** `CLT-001` and `CLT-002` each have messages; `CLT-001` is authenticated
**Input:** `GET /client-portal/messages`
**Expected Result:**
- Response contains ONLY messages where `client_id = 'CLT-001'`
- CLT-002's messages never appear

---

### FR-MSG-002: POST /messages — Send Message

Subject required for new threads; body 1–5000 chars; `sender_type = CLIENT` set server-side.

---

#### TC-MSG-007: Happy path — new thread with subject and body

**Preconditions:** Client `CLT-001` authenticated
**Input:**
```json
POST /client-portal/messages
{
  "subject": "Quarterly Review Question",
  "body": "I would like to discuss my portfolio allocation. When are you available?",
  "thread_id": null
}
```
**Expected Result:**
- HTTP 201
- Response contains created message: `{ id, subject, body, sender_type: "CLIENT", sent_at, thread_id }`
- `sender_type` is always `"CLIENT"` regardless of request body value
- `thread_id` auto-generated or assigned

---

#### TC-MSG-008: Happy path — reply to existing thread (no subject required)

**Preconditions:** Thread `TH-001` exists; client is participant
**Input:**
```json
POST /client-portal/messages
{
  "thread_id": "TH-001",
  "body": "Thursday 2pm works for me."
}
```
**Expected Result:**
- HTTP 201
- Message created under `TH-001`
- `subject` defaults to existing thread subject or null
- `sender_type = "CLIENT"` server-side

---

#### TC-MSG-009: Validation — subject required for new thread

**Preconditions:** Client authenticated; no `thread_id` provided
**Input:**
```json
POST /client-portal/messages
{ "body": "Hello, no subject provided" }
```
**Expected Result:**
- HTTP 422 (or 400)
- Response: `{ "error": { "code": "VALIDATION_ERROR", "message": "subject is required for new threads" } }`

---

#### TC-MSG-010: Validation — body minimum length (1 char boundary)

**Preconditions:** New thread request
**Input:** `body = ""` (empty string)
**Expected Result:**
- HTTP 422; `"body must be at least 1 character"`

**Input:** `body = "A"` (1 character)
**Expected Result:**
- HTTP 201; message accepted

---

#### TC-MSG-011: Validation — body maximum length (5000 char boundary)

**Preconditions:** New thread request with subject
**Input:** `body` = string of exactly 5000 characters
**Expected Result:**
- HTTP 201; message accepted

**Input:** `body` = string of 5001 characters
**Expected Result:**
- HTTP 422; `"body must not exceed 5000 characters"`

---

#### TC-MSG-012: Server-side sender_type enforcement — client cannot set sender_type to RM

**Preconditions:** Client `CLT-001` authenticated
**Input:**
```json
POST /client-portal/messages
{
  "subject": "Test",
  "body": "Test message",
  "sender_type": "RM"
}
```
**Expected Result:**
- HTTP 201; message created
- `sender_type` in DB and response is `"CLIENT"` (server overrides input)

---

#### TC-MSG-013: Unauthenticated POST — 401

**Preconditions:** No session
**Input:** `POST /client-portal/messages` with valid body
**Expected Result:**
- HTTP 401; no message created

---

### FR-MSG-003: PATCH /messages/:id/read — Mark Message Read

Idempotent; ownership check enforced.

---

#### TC-MSG-014: Happy path — mark unread message as read

**Preconditions:** Message `MSG-001` belongs to `CLT-001`; `read = false`
**Input:** `PATCH /client-portal/messages/MSG-001/read`
**Expected Result:**
- HTTP 200
- Message `read = true` in DB
- Response confirms updated state

---

#### TC-MSG-015: Idempotent — mark already-read message as read

**Preconditions:** Message `MSG-002` already has `read = true`
**Input:** `PATCH /client-portal/messages/MSG-002/read`
**Expected Result:**
- HTTP 200 (not 409 or error)
- No error returned; state unchanged
- DB record not duplicated

---

#### TC-MSG-016: Ownership check — client cannot mark another client's message as read

**Preconditions:** Message `MSG-099` belongs to `CLT-002`; `CLT-001` is authenticated
**Input:** `PATCH /client-portal/messages/MSG-099/read`
**Expected Result:**
- HTTP 403
- `read` field NOT updated in DB

---

#### TC-MSG-017: Message not found — 404

**Preconditions:** Message `MSG-FAKE` does not exist
**Input:** `PATCH /client-portal/messages/MSG-FAKE/read`
**Expected Result:**
- HTTP 404; `"Message not found"`

---

### FR-MSG-004: GET /back-office/client-messages — RM Inbox

Scoped to assigned clients; BO_HEAD sees all.

---

#### TC-MSG-018: Happy path — RM sees only messages from assigned clients

**Preconditions:** RM `RM-001` authenticated with `BO_MAKER` role; assigned to `CLT-001`, `CLT-002`; `CLT-003` assigned to different RM
**Input:** `GET /back-office/client-messages`
**Expected Result:**
- HTTP 200
- Response contains messages for `CLT-001` and `CLT-002` only
- `CLT-003` messages NOT included

---

#### TC-MSG-019: BO_HEAD sees all client messages

**Preconditions:** User authenticated with `BO_HEAD` role
**Input:** `GET /back-office/client-messages`
**Expected Result:**
- HTTP 200
- Response contains messages from ALL clients
- No client scope filtering applied

---

#### TC-MSG-020: Pagination and filters available on RM inbox

**Preconditions:** RM with 50 messages from assigned clients
**Input:** `GET /back-office/client-messages?page=2&pageSize=15&status=unread`
**Expected Result:**
- HTTP 200
- Returns page 2 of unread messages scoped to RM's clients
- `pagination` envelope present

---

#### TC-MSG-021: Non-BO role blocked from RM inbox

**Preconditions:** Client portal user (CLIENT role) attempts access
**Input:** `GET /back-office/client-messages`
**Expected Result:**
- HTTP 403; role guard blocks access

---

### FR-MSG-005: POST /back-office/client-messages/:id/reply — RM Reply

RM reply to client message; notifies client.

---

#### TC-MSG-022: Happy path — RM replies to client message

**Preconditions:** Message `MSG-001` from `CLT-001`; RM `RM-001` assigned to `CLT-001`
**Input:**
```json
POST /back-office/client-messages/MSG-001/reply
{
  "body": "Thank you for your inquiry. I will call you tomorrow at 10am."
}
```
**Expected Result:**
- HTTP 201
- Reply created with `sender_type = "RM"` and `sender_id = "RM-001"`
- Client `CLT-001` receives notification (via `notificationInboxService`)
- Notification contains message ID and RM name

---

#### TC-MSG-023: RM cannot reply to message from unassigned client

**Preconditions:** Message `MSG-050` from `CLT-099` (assigned to different RM); `RM-001` authenticated
**Input:** `POST /back-office/client-messages/MSG-050/reply` with valid body
**Expected Result:**
- HTTP 403; `"Access denied: client not in RM's portfolio"`
- No reply created; no notification sent

---

#### TC-MSG-024: BO_HEAD can reply to any client message

**Preconditions:** BO_HEAD authenticated; message from any client
**Input:** `POST /back-office/client-messages/MSG-050/reply` with valid body
**Expected Result:**
- HTTP 201; reply created
- Client notified

---

#### TC-MSG-025: Reply body validation — empty body rejected

**Input:**
```json
POST /back-office/client-messages/MSG-001/reply
{ "body": "" }
```
**Expected Result:**
- HTTP 422; `"body is required"`

---

#### TC-MSG-026: Reply to non-existent message — 404

**Input:** `POST /back-office/client-messages/MSG-FAKE/reply`
**Expected Result:**
- HTTP 404; message not found

---

### FR-MSG-006: GET /messages/unread-count — Unread Badge Count

Refreshed every 60 seconds; badge hidden at 0.

---

#### TC-MSG-027: Happy path — returns correct unread count

**Preconditions:** Client `CLT-001` has 5 unread messages
**Input:** `GET /client-portal/messages/unread-count`
**Expected Result:**
- HTTP 200
- Response: `{ "unread_count": 5 }`
- Response time < 200ms (lightweight endpoint)

---

#### TC-MSG-028: Zero unread — badge hidden (count = 0)

**Preconditions:** Client has 0 unread messages
**Input:** `GET /client-portal/messages/unread-count`
**Expected Result:**
- HTTP 200
- Response: `{ "unread_count": 0 }`
- UI implication: badge with class `hidden` or count not rendered (frontend behavior)

---

#### TC-MSG-029: Unauthenticated — 401

**Input:** `GET /client-portal/messages/unread-count` without session
**Expected Result:**
- HTTP 401

---

#### TC-MSG-030: Count decrements after marking messages read

**Preconditions:** 3 unread messages; client marks 2 as read
**Input:** `GET /client-portal/messages/unread-count` after PATCH operations
**Expected Result:**
- `unread_count = 1`

---

## Module STMT: Statement Download

### FR-STMT-001: Statement List Enriched with Metadata

List enriched with `delivery_status`, `file_size_bytes`, `generated_at`; ownership enforced.

---

#### TC-STMT-001: Happy path — client retrieves own statement list

**Preconditions:** Client `CLT-001` authenticated; 6 statements exist for CLT-001
**Input:** `GET /client-portal/clients/CLT-001/statements`
**Expected Result:**
- HTTP 200
- Each statement object includes:
  - `id`, `period`, `type`
  - `delivery_status` (e.g., `"DELIVERED"`, `"PENDING"`, `"FAILED"`)
  - `file_size_bytes` (integer, null if not yet generated)
  - `generated_at` (ISO 8601 timestamp or null)
- Ownership middleware passes

---

#### TC-STMT-002: Statement list — ownership enforced, cross-client access blocked

**Preconditions:** `CLT-001` authenticated; attempts to list `CLT-002`'s statements
**Input:** `GET /client-portal/clients/CLT-002/statements`
**Expected Result:**
- HTTP 403; `PORTAL_OWNERSHIP_VIOLATION`
- Audit log entry written (per FR-CP-SEC-001)

---

#### TC-STMT-003: Statement list — delivery_status values are valid enum members

**Preconditions:** Statements exist with various statuses
**Expected Result:**
- Each `delivery_status` value is one of: `PENDING`, `GENERATING`, `DELIVERED`, `FAILED`
- No null `delivery_status` values (has a default)

---

#### TC-STMT-004: Statement list — period filter by year

**Preconditions:** Statements from 2024, 2025, and 2026 exist
**Input:** `GET /client-portal/clients/CLT-001/statements?year=2025`
**Expected Result:**
- HTTP 200
- Only 2025 statements returned
- `generated_at` timestamps all within 2025

---

#### TC-STMT-005: Empty statement list — 200 with empty array

**Preconditions:** New client with no statements
**Input:** `GET /client-portal/clients/CLT-NEW/statements`
**Expected Result:**
- HTTP 200; `data = []`

---

### FR-STMT-002: Statement Download Endpoint

Streams file if available; generates placeholder PDF if not; audits download; P95 < 2 seconds.

---

#### TC-STMT-006: Happy path — download existing generated statement

**Preconditions:** Statement `STMT-001` has `delivery_status = "DELIVERED"` and valid `storage_reference`
**Input:** `GET /client-portal/clients/CLT-001/statements/STMT-001/download`
**Expected Result:**
- HTTP 200
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="statement-STMT-001.pdf"` (or similar)
- File streamed from storage
- Audit log entry: `action = "STATEMENT_DOWNLOAD"`, `actor_id = "CLT-001"`, `resource_id = "STMT-001"`

---

#### TC-STMT-007: Statement not yet generated — placeholder PDF returned

**Preconditions:** Statement `STMT-002` has `delivery_status = "PENDING"` or `storage_reference = null`
**Input:** `GET /client-portal/clients/CLT-001/statements/STMT-002/download`
**Expected Result:**
- HTTP 200
- Response is a valid PDF (placeholder with generation-in-progress message)
- Audit log entry created for the download attempt
- No 404 or 500 error

---

#### TC-STMT-008: Download audit log structure

**Preconditions:** Client downloads statement STMT-001
**Expected Result:**
- Audit record contains:
  - `event_type`: `'STATEMENT_DOWNLOAD'`
  - `actor_id`: session client ID
  - `resource_type`: `'STATEMENT'`
  - `resource_id`: `'STMT-001'`
  - `ip_address`: client IP
  - `created_at`: within 1 second of request

---

#### TC-STMT-009: Ownership check — cannot download another client's statement

**Preconditions:** Statement `STMT-099` belongs to `CLT-002`; `CLT-001` authenticated
**Input:** `GET /client-portal/clients/CLT-002/statements/STMT-099/download`
**Expected Result:**
- HTTP 403
- No file streamed; no download audit log with `CLT-001` as downloader

---

#### TC-STMT-010: Statement not found — 404

**Input:** `GET /client-portal/clients/CLT-001/statements/STMT-FAKE/download`
**Expected Result:**
- HTTP 404; `"Statement not found"`

---

#### TC-STMT-011: Performance — P95 response time under 2 seconds

**Preconditions:** Load test with 100 concurrent download requests for existing statements
**Expected Result:**
- 95th percentile response time <= 2000ms
- No HTTP 500 errors under load
- P99 may be higher; P50 should be <= 500ms

---

### FR-STMT-003: Back-Office Statement Management

BO: list all statements; POST /:id/regenerate triggers async re-generation; 409 if already GENERATING.

---

#### TC-STMT-012: Happy path — BO lists all statements across all clients

**Preconditions:** BO_MAKER authenticated; 50 statements across 20 clients
**Input:** `GET /back-office/statements`
**Expected Result:**
- HTTP 200
- All 50 statements returned (paginated)
- Includes enriched fields: `delivery_status`, `file_size_bytes`, `generated_at`
- No client scoping (BO sees all)

---

#### TC-STMT-013: Happy path — BO triggers statement regeneration

**Preconditions:** Statement `STMT-005` with `delivery_status = "FAILED"`
**Input:** `POST /back-office/statements/STMT-005/regenerate`
**Expected Result:**
- HTTP 202 (accepted, async)
- Statement `delivery_status` updated to `"GENERATING"` in DB
- Background job enqueued for regeneration
- Response: `{ "message": "Regeneration initiated", "statement_id": "STMT-005" }`

---

#### TC-STMT-014: Regeneration — 409 if already GENERATING

**Preconditions:** Statement `STMT-006` already has `delivery_status = "GENERATING"`
**Input:** `POST /back-office/statements/STMT-006/regenerate`
**Expected Result:**
- HTTP 409
- Response: `{ "error": { "code": "ALREADY_GENERATING", "message": "Statement is already being generated" } }`
- No duplicate job enqueued

---

#### TC-STMT-015: Regeneration — non-BO role blocked

**Preconditions:** CLIENT role user authenticated
**Input:** `POST /back-office/statements/STMT-005/regenerate`
**Expected Result:**
- HTTP 403; role guard blocks access

---

#### TC-STMT-016: Regeneration — statement not found

**Input:** `POST /back-office/statements/STMT-FAKE/regenerate`
**Expected Result:**
- HTTP 404; `"Statement not found"`

---

## Module SYSCONFIG: System Configuration

### FR-SC-001: GET /system-config — Read All Configuration

All roles; sensitive values masked with `'****'`.

---

#### TC-SC-001: Happy path — BO_MAKER reads system config

**Preconditions:** BO_MAKER authenticated; config contains keys: `CRM_LATE_FILING_DAYS`, `MAX_FILE_SIZE_MB`, `JWT_SECRET`
**Input:** `GET /back-office/system-config`
**Expected Result:**
- HTTP 200
- Response is array or object of config entries
- `JWT_SECRET` value is `"****"` (masked)
- `CRM_LATE_FILING_DAYS` value is unmasked (e.g., `"5"` or `5`)
- `MAX_FILE_SIZE_MB` value is unmasked

---

#### TC-SC-002: Sensitive key masking — all sensitive keys masked

**Preconditions:** Config contains keys: `DB_PASSWORD`, `SMTP_PASSWORD`, `API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`
**Input:** `GET /back-office/system-config`
**Expected Result:**
- All of the above keys have value `"****"` in response
- Non-sensitive keys (e.g., `CRM_LATE_FILING_DAYS`, `DEFAULT_CURRENCY`) show real values

---

#### TC-SC-003: All BO roles can read config — BO_CHECKER

**Preconditions:** BO_CHECKER role authenticated
**Input:** `GET /back-office/system-config`
**Expected Result:**
- HTTP 200; same masked response as TC-SC-001

---

#### TC-SC-004: All BO roles can read config — BO_HEAD

**Preconditions:** BO_HEAD role authenticated
**Input:** `GET /back-office/system-config`
**Expected Result:**
- HTTP 200

---

#### TC-SC-005: Unauthenticated — 401

**Input:** `GET /back-office/system-config` without session
**Expected Result:**
- HTTP 401

---

#### TC-SC-006: CLIENT role blocked — 403

**Preconditions:** Client portal user authenticated
**Input:** `GET /back-office/system-config`
**Expected Result:**
- HTTP 403

---

### FR-SC-002: PUT /system-config/:key — Update Configuration

BO_HEAD/ADMIN only; type validation; min/max validation; audit log; optimistic concurrency via `version`; 409 on version mismatch.

---

#### TC-SC-007: Happy path — BO_HEAD updates CRM_LATE_FILING_DAYS

**Preconditions:** BO_HEAD authenticated; current version of `CRM_LATE_FILING_DAYS` is `5` at `version = 3`
**Input:**
```json
PUT /back-office/system-config/CRM_LATE_FILING_DAYS
{
  "value": 7,
  "version": 3
}
```
**Expected Result:**
- HTTP 200
- Config updated to `7`
- New version = 4
- Audit log entry: `action = "SYSTEM_CONFIG_UPDATE"`, `actor_id = BO_HEAD user`, `resource_id = "CRM_LATE_FILING_DAYS"`, `old_value = "5"`, `new_value = "7"`

---

#### TC-SC-008: Happy path — ADMIN updates a numeric config

**Preconditions:** ADMIN role authenticated; config `MAX_FILE_SIZE_MB` currently `20` at version `1`
**Input:**
```json
PUT /back-office/system-config/MAX_FILE_SIZE_MB
{
  "value": 25,
  "version": 1
}
```
**Expected Result:**
- HTTP 200; `MAX_FILE_SIZE_MB` updated to `25`

---

#### TC-SC-009: Role guard — BO_MAKER cannot update config

**Preconditions:** BO_MAKER authenticated
**Input:** `PUT /back-office/system-config/CRM_LATE_FILING_DAYS` with valid body
**Expected Result:**
- HTTP 403; `"Insufficient permissions"` or `"FORBIDDEN"`
- Config NOT updated

---

#### TC-SC-010: Role guard — BO_CHECKER cannot update config

**Preconditions:** BO_CHECKER authenticated
**Input:** `PUT /back-office/system-config/CRM_LATE_FILING_DAYS`
**Expected Result:**
- HTTP 403

---

#### TC-SC-011: Type validation — string value for numeric key rejected

**Preconditions:** BO_HEAD authenticated; `CRM_LATE_FILING_DAYS` is an integer config
**Input:**
```json
PUT /back-office/system-config/CRM_LATE_FILING_DAYS
{
  "value": "five",
  "version": 3
}
```
**Expected Result:**
- HTTP 422; `"value must be a number for key CRM_LATE_FILING_DAYS"`
- Config NOT updated

---

#### TC-SC-012: Min/max validation — value below minimum

**Preconditions:** `CRM_LATE_FILING_DAYS` has `min = 1`
**Input:**
```json
PUT /back-office/system-config/CRM_LATE_FILING_DAYS
{
  "value": 0,
  "version": 3
}
```
**Expected Result:**
- HTTP 422; `"value must be at least 1"`

---

#### TC-SC-013: Min/max validation — value above maximum

**Preconditions:** `CRM_LATE_FILING_DAYS` has `max = 30`
**Input:**
```json
PUT /back-office/system-config/CRM_LATE_FILING_DAYS
{
  "value": 31,
  "version": 3
}
```
**Expected Result:**
- HTTP 422; `"value must not exceed 30"`

---

#### TC-SC-014: Optimistic concurrency — stale version rejected with 409

**Preconditions:** BO_HEAD submits update with `version = 2` but current version is `3`
**Input:**
```json
PUT /back-office/system-config/CRM_LATE_FILING_DAYS
{
  "value": 7,
  "version": 2
}
```
**Expected Result:**
- HTTP 409
- Response: `{ "error": { "code": "VERSION_CONFLICT", "message": "Config has been updated by another user. Please refresh and retry.", "current_version": 3 } }`
- Config NOT updated

---

#### TC-SC-015: Optimistic concurrency — concurrent updates, second writer gets 409

**Preconditions:** Two BO_HEAD users both read config at `version = 5`; user A updates successfully (now at version 6); user B submits with `version = 5`
**Expected Result:**
- User A: HTTP 200
- User B: HTTP 409 with `current_version = 6`

---

#### TC-SC-016: Unknown config key — 404

**Input:** `PUT /back-office/system-config/NONEXISTENT_KEY` with valid body and version
**Expected Result:**
- HTTP 404; `"Configuration key not found"`

---

#### TC-SC-017: Audit log entry structure on successful update

**Preconditions:** BO_HEAD updates `CRM_LATE_FILING_DAYS` from `5` to `7`
**Expected Result:**
- Audit record:
  - `action`: `'SYSTEM_CONFIG_UPDATE'`
  - `actor_id`: BO_HEAD user ID
  - `resource_type`: `'SYSTEM_CONFIG'`
  - `resource_id`: `'CRM_LATE_FILING_DAYS'`
  - `metadata.old_value`: `5`
  - `metadata.new_value`: `7`
  - `metadata.version_from`: `3`
  - `metadata.version_to`: `4`

---

### FR-SC-003: callReportService — Dynamic Late Filing Threshold

Reads `CRM_LATE_FILING_DAYS` from DB (cached 5 min); falls back to env var then to `5`; business-day calculation; cache invalidated on PUT.

---

#### TC-SC-018: Happy path — callReportService reads DB config

**Preconditions:** `CRM_LATE_FILING_DAYS = 7` in DB config
**Expected Result:**
- Late filing threshold is 7 business days (not the env var value or default of 5)
- Call report filed within 7 business days of meeting: auto-approved
- Call report filed on day 8+: routed for late-filing approval

---

#### TC-SC-019: Fallback to env var when DB has no config entry

**Preconditions:** `CRM_LATE_FILING_DAYS` not set in DB; `process.env.CRM_LATE_FILING_DAYS = "3"`
**Expected Result:**
- callReportService uses threshold of `3` business days

---

#### TC-SC-020: Fallback to default (5) when no DB and no env var

**Preconditions:** `CRM_LATE_FILING_DAYS` not in DB; env var not set
**Expected Result:**
- callReportService uses threshold of `5` business days

---

#### TC-SC-021: Cache — DB not queried on repeated calls within 5 minutes

**Preconditions:** First call populates cache; subsequent calls within 5 minutes
**Expected Result:**
- DB query executed only once
- Subsequent reads within 5-minute window use cached value
- Observable via spy on DB query (mock test)

---

#### TC-SC-022: Cache invalidation — PUT to system-config clears cache

**Preconditions:** `CRM_LATE_FILING_DAYS` cached as `5`; BO_HEAD updates to `10`
**Expected Result:**
- Immediately after PUT: next callReportService invocation fetches fresh value (`10`) from DB
- Cache TTL reset to 5 minutes from invalidation point

---

#### TC-SC-023: Business-day calculation — weekend days excluded

**Preconditions:** Meeting held on Friday 2026-04-24; CRM_LATE_FILING_DAYS = 5
**Expected Result:**
- Deadline = Friday 2026-05-01 (5 business days: Mon Apr 27, Tue Apr 28, Wed Apr 29, Thu Apr 30, Fri May 01)
- Saturday and Sunday NOT counted
- Call report filed Friday May 01 = on time (day 5)
- Call report filed Monday May 04 = late (day 6)

---

#### TC-SC-024: Business-day calculation — meeting on Monday

**Preconditions:** Meeting on Monday 2026-04-21; threshold = 5 business days
**Expected Result:**
- Deadline = Monday 2026-04-28 (Tue 22, Wed 23, Thu 24, Fri 25, Mon 28)
- Report filed Mon Apr 28 = on time

---

## Module DOCS: Document Storage

### FR-DOCS-001: POST /client-portal/sr/:id/documents — Upload

Ownership check; save to `uploads/sr-documents/{sr_id}/{uuid}-{filename}`; async scan; 20MB limit; quarantine blocked extensions immediately; MIME whitelist.

---

#### TC-DOCS-001: Happy path — PDF upload for own service request

**Preconditions:** Client `CLT-001` authenticated; owns SR `SR-2026-000001`; file is a valid PDF <= 20MB
**Input:**
```
POST /client-portal/sr/SR-2026-000001/documents
Content-Type: multipart/form-data
file: [valid.pdf, 2MB]
```
**Expected Result:**
- HTTP 201
- Document record created in DB with:
  - `sr_id = 'SR-2026-000001'`
  - `status = 'PENDING_SCAN'`
  - `storage_reference`: path matching `uploads/sr-documents/SR-2026-000001/{uuid}-valid.pdf`
  - `file_size_bytes = 2097152`
  - `mime_type = 'application/pdf'`
- Async virus scan job enqueued (non-blocking; upload returns 201 immediately)

---

#### TC-DOCS-002: Storage path structure — UUID prefixed filename

**Preconditions:** File named `report.pdf` uploaded to SR `SR-2026-000042`
**Expected Result:**
- `storage_reference` matches regex: `^uploads/sr-documents/SR-2026-000042/[0-9a-f-]{36}-report\.pdf$`
- No filename collision possible with UUID prefix

---

#### TC-DOCS-003: Ownership check — cannot upload to another client's SR

**Preconditions:** SR `SR-2026-000099` belongs to `CLT-002`; `CLT-001` authenticated
**Input:** `POST /client-portal/sr/SR-2026-000099/documents` with valid file
**Expected Result:**
- HTTP 403; `"PORTAL_OWNERSHIP_VIOLATION"`
- No document record created; no file saved

---

#### TC-DOCS-004: File size limit — exactly 20MB allowed

**Preconditions:** Valid PDF of exactly 20,971,520 bytes (20MB)
**Input:** Upload to own SR
**Expected Result:**
- HTTP 201; upload accepted

---

#### TC-DOCS-005: File size limit — over 20MB rejected

**Preconditions:** File of 20,971,521 bytes (20MB + 1 byte)
**Input:** Upload to own SR
**Expected Result:**
- HTTP 413 (Payload Too Large)
- Response: `{ "error": { "code": "FILE_TOO_LARGE", "message": "File must not exceed 20MB" } }`
- No file saved; no DB record

---

#### TC-DOCS-006: Blocked extension — .exe file quarantined immediately

**Preconditions:** File `malware.exe` uploaded
**Input:** `POST /client-portal/sr/SR-2026-000001/documents` with `malware.exe`
**Expected Result:**
- HTTP 201 (or 202) — upload accepted at endpoint level
- Document immediately quarantined in DB: `status = 'QUARANTINED'`
- No async scan needed; quarantine is synchronous for blocked extensions
- `storage_reference` set but download blocked

---

#### TC-DOCS-007: Blocked extension — .bat file quarantined immediately

**Input:** File `setup.bat`
**Expected Result:**
- Same as TC-DOCS-006; status = `'QUARANTINED'` synchronously

---

#### TC-DOCS-008: Blocked extension — .sh file quarantined immediately

**Input:** File `install.sh`
**Expected Result:**
- Status = `'QUARANTINED'`; immediate quarantine

---

#### TC-DOCS-009: Blocked extension — .cmd file quarantined immediately

**Input:** File `run.cmd`
**Expected Result:**
- Status = `'QUARANTINED'`; immediate quarantine

---

#### TC-DOCS-010: Blocked extension — .ps1 file quarantined immediately

**Input:** File `script.ps1`
**Expected Result:**
- Status = `'QUARANTINED'`; immediate quarantine

---

#### TC-DOCS-011: MIME whitelist — non-whitelisted MIME type rejected

**Preconditions:** File has `.pdf` extension but MIME type `application/x-msdownload`
**Input:** Upload with mismatched MIME
**Expected Result:**
- HTTP 415 (Unsupported Media Type) or 422
- Response: `{ "error": { "code": "INVALID_MIME_TYPE", "message": "File type not permitted" } }`
- No file saved

---

#### TC-DOCS-012: MIME whitelist — image/jpeg accepted

**Preconditions:** Valid JPEG file <= 20MB
**Input:** Upload JPEG to own SR
**Expected Result:**
- HTTP 201; upload accepted with `mime_type = 'image/jpeg'`

---

#### TC-DOCS-013: MIME whitelist — application/pdf accepted

**Input:** Valid PDF
**Expected Result:**
- HTTP 201; `mime_type = 'application/pdf'`

---

#### TC-DOCS-014: Async scan — upload returns before scan completes

**Preconditions:** Virus scanner is artificially slowed (mock delay 5 seconds)
**Expected Result:**
- Upload endpoint returns HTTP 201 within 1 second
- `status = 'PENDING_SCAN'` at time of response
- After scan completes: status updated to `'CLEAN'` or `'QUARANTINED'`

---

#### TC-DOCS-015: SR not found — 404

**Input:** `POST /client-portal/sr/SR-FAKE/documents`
**Expected Result:**
- HTTP 404; `"Service request not found"`

---

### FR-DOCS-002: GET /client-portal/sr/:id/documents — Document List

Lists documents including QUARANTINED (flagged); download blocked for QUARANTINED.

---

#### TC-DOCS-016: Happy path — lists all documents including quarantined

**Preconditions:** SR `SR-2026-000001` has 3 documents: 2 CLEAN, 1 QUARANTINED
**Input:** `GET /client-portal/sr/SR-2026-000001/documents`
**Expected Result:**
- HTTP 200
- All 3 documents in response
- QUARANTINED document has `status = 'QUARANTINED'` and `download_blocked = true` (or flag)
- CLEAN documents have `status = 'CLEAN'` and `download_blocked = false`

---

#### TC-DOCS-017: Quarantined document flagged in list response

**Preconditions:** Document `DOC-003` is QUARANTINED
**Expected Result:**
- Response includes `DOC-003` with visual flag: `quarantine_flag = true` or `status = 'QUARANTINED'`
- `download_url` for quarantined document is absent or blocked

---

#### TC-DOCS-018: Ownership check on document list

**Preconditions:** SR belongs to `CLT-002`; `CLT-001` authenticated
**Input:** `GET /client-portal/sr/SR-2026-000099/documents`
**Expected Result:**
- HTTP 403; ownership violation; audit log written

---

#### TC-DOCS-019: Empty document list — 200 with empty array

**Preconditions:** SR has no documents
**Input:** `GET /client-portal/sr/SR-2026-000001/documents`
**Expected Result:**
- HTTP 200; `data = []`

---

### FR-DOCS-003: GET Download Endpoint — Client Portal

Ownership check; 403 if QUARANTINED; 404 if deleted/null storage_reference.

---

#### TC-DOCS-020: Happy path — download CLEAN document

**Preconditions:** Document `DOC-001` is CLEAN; belongs to client's SR
**Input:** `GET /client-portal/sr/SR-2026-000001/documents/DOC-001/download`
**Expected Result:**
- HTTP 200
- File streamed with `Content-Type` matching document MIME type
- `Content-Disposition: attachment; filename="original-filename.pdf"`

---

#### TC-DOCS-021: Quarantined document — client download blocked

**Preconditions:** Document `DOC-003` is QUARANTINED
**Input:** `GET /client-portal/sr/SR-2026-000001/documents/DOC-003/download`
**Expected Result:**
- HTTP 403
- Response: `{ "error": { "code": "DOCUMENT_QUARANTINED", "message": "This document is quarantined and cannot be downloaded" } }`
- File NOT streamed

---

#### TC-DOCS-022: Deleted document — 404

**Preconditions:** Document `DOC-004` has `storage_reference = null` or is soft-deleted
**Input:** `GET /client-portal/sr/SR-2026-000001/documents/DOC-004/download`
**Expected Result:**
- HTTP 404; `"Document not found or unavailable"`

---

#### TC-DOCS-023: Ownership check on download

**Preconditions:** Document belongs to `CLT-002`'s SR; `CLT-001` authenticated
**Input:** Download endpoint for CLT-002's document
**Expected Result:**
- HTTP 403; ownership violation

---

#### TC-DOCS-024: PENDING_SCAN document — download behavior

**Preconditions:** Document `DOC-005` is in `PENDING_SCAN` status
**Input:** Download request
**Expected Result:**
- HTTP 202 (Accepted) or HTTP 423 (Locked) with message `"Document scan in progress, please try again later"`
- File NOT streamed until scan completes

---

### FR-DOCS-004: Back-Office Document Management

BO can download QUARANTINED documents with warning header.

---

#### TC-DOCS-025: Happy path — BO downloads CLEAN document

**Preconditions:** BO_MAKER authenticated; CLEAN document `DOC-001`
**Input:** `GET /back-office/sr/SR-2026-000001/documents/DOC-001/download`
**Expected Result:**
- HTTP 200; file streamed
- No special warning headers
- Audit log: `action = "DOCUMENT_DOWNLOAD_BO"`, `actor_id = BO_MAKER user ID`

---

#### TC-DOCS-026: Happy path — BO downloads QUARANTINED document with warning header

**Preconditions:** BO_MAKER authenticated; QUARANTINED document `DOC-003`
**Input:** `GET /back-office/sr/SR-2026-000001/documents/DOC-003/download`
**Expected Result:**
- HTTP 200; file streamed despite quarantine
- Response header: `X-Quarantine-Warning: true` (or `X-Document-Status: QUARANTINED`)
- Audit log entry with `metadata.quarantined = true`

---

#### TC-DOCS-027: BO document list — all documents visible including quarantined

**Preconditions:** SR has documents in all statuses: PENDING_SCAN, CLEAN, QUARANTINED
**Input:** `GET /back-office/sr/SR-2026-000001/documents`
**Expected Result:**
- HTTP 200
- All documents listed regardless of status
- `status` field accurately reflects each document's state

---

#### TC-DOCS-028: Client portal role blocked from BO document endpoint

**Preconditions:** CLIENT role user authenticated
**Input:** `GET /back-office/sr/SR-2026-000001/documents/DOC-001/download`
**Expected Result:**
- HTTP 403; role guard blocks access

---

## Module FEED: Feed Health Persistence

### FR-FEED-001: Persist Feed Snapshots on Incident Report

Persist to DB on every `reportIncident` call; reload on startup; fire-and-forget (non-blocking).

---

#### TC-FEED-001: Happy path — incident report triggers DB snapshot persistence

**Preconditions:** Feed health in-memory registry has BLOOMBERG at health score 45 (DEGRADED)
**Input:** `reportIncident({ failedComponent: 'BLOOMBERG', fallbackPath: 'REUTERS', impactedEventIds: ['EVT-001'] })`
**Expected Result:**
- Incident record saved to DB with:
  - `incident_id`: format `INC-{timestamp}`
  - `failed_component`: `'BLOOMBERG'`
  - `fallback_path`: `'REUTERS'`
  - `impacted_event_ids`: `['EVT-001']`
  - `started_at`: current timestamp
- Current feed health snapshot saved alongside incident
- `reportIncident` returns without waiting for DB write (fire-and-forget)
- Response time < 50ms regardless of DB write time

---

#### TC-FEED-002: Fire-and-forget — main thread not blocked by DB write

**Preconditions:** DB write is artificially slowed (mock 500ms delay)
**Expected Result:**
- `reportIncident` resolves/returns within 10ms
- DB write completes asynchronously without affecting caller

---

#### TC-FEED-003: Startup reload — in-memory registry populated from last DB snapshot

**Preconditions:** DB contains feed health snapshot from last incident
**Expected Result:**
- On server restart, `feedHealthRegistry` in-memory map is populated from DB snapshot
- Feed statuses reflect persisted values, not hardcoded defaults
- Startup completes without error even if DB snapshot is empty/missing

---

#### TC-FEED-004: Startup reload — empty DB does not crash server

**Preconditions:** No feed snapshots in DB (first start or cleared)
**Expected Result:**
- Server starts with hardcoded defaults (BLOOMBERG: UP, REUTERS: UP, etc.)
- No crash or uncaught exception
- Log message indicating "no feed snapshot found, using defaults"

---

#### TC-FEED-005: Multiple incidents — each creates separate DB record

**Preconditions:** Three separate incident reports made
**Expected Result:**
- Three distinct `degradedModeLogs` records in DB
- Each has unique `incident_id`

---

### FR-FEED-002: GET /feed-health — In-Memory Read

Served from in-memory registry; no DB query; any BO role.

---

#### TC-FEED-006: Happy path — BO_MAKER reads feed health

**Preconditions:** BO_MAKER authenticated; BLOOMBERG health = 100 (UP), DTCC health = 55 (DEGRADED)
**Input:** `GET /back-office/feed-health`
**Expected Result:**
- HTTP 200
- Response contains array of feed entries:
  ```json
  [
    { "name": "BLOOMBERG", "status": "UP", "healthScore": 100, "latencyMs": 45, ... },
    { "name": "DTCC", "status": "DEGRADED", "healthScore": 55, "latencyMs": 38, ... }
  ]
  ```
- Response served from in-memory (fast; no DB hit)

---

#### TC-FEED-007: Performance — response served from in-memory, no DB query

**Preconditions:** DB is offline/unavailable
**Input:** `GET /back-office/feed-health`
**Expected Result:**
- HTTP 200; data returned from in-memory registry
- No DB connection attempted
- Response time < 50ms

---

#### TC-FEED-008: Any BO role can read — BO_CHECKER

**Preconditions:** BO_CHECKER authenticated
**Input:** `GET /back-office/feed-health`
**Expected Result:**
- HTTP 200

---

#### TC-FEED-009: Any BO role can read — BO_HEAD

**Preconditions:** BO_HEAD authenticated
**Input:** `GET /back-office/feed-health`
**Expected Result:**
- HTTP 200

---

#### TC-FEED-010: Non-BO role blocked — 403

**Preconditions:** CLIENT role authenticated
**Input:** `GET /back-office/feed-health`
**Expected Result:**
- HTTP 403

---

#### TC-FEED-011: Unauthenticated — 401

**Input:** `GET /back-office/feed-health` without session
**Expected Result:**
- HTTP 401

---

#### TC-FEED-012: Feed status derivation — health score thresholds

**Preconditions:** In-memory feeds at various health scores
**Expected Result:**
- Score >= 80: `status = "UP"`
- Score 40–79: `status = "DEGRADED"`
- Score < 40: `status = "DOWN"`
- Boundary: score exactly 80 → `"UP"`; score 79 → `"DEGRADED"`
- Boundary: score exactly 40 → `"DEGRADED"`; score 39 → `"DOWN"`

---

### FR-FEED-003: POST /feed-health/:feed/override — Manual Override

BO_HEAD/ADMIN only; reason 10–500 chars; audit log; POST /clear-override to restore.

---

#### TC-FEED-013: Happy path — BO_HEAD overrides feed status

**Preconditions:** BO_HEAD authenticated; BLOOMBERG currently shows `DOWN`
**Input:**
```json
POST /back-office/feed-health/BLOOMBERG/override
{
  "override_status": "UP",
  "reason": "Bloomberg feed is operational; automated score lagging due to network blip."
}
```
**Expected Result:**
- HTTP 200
- BLOOMBERG in-memory entry updated with `override_status = "UP"` and `override_reason`
- `GET /feed-health` shows BLOOMBERG as `"UP"` with override indicator
- Audit log entry: `action = "FEED_HEALTH_OVERRIDE"`, `actor_id = BO_HEAD user`, `resource_id = "BLOOMBERG"`, `metadata.reason = "..."`

---

#### TC-FEED-014: Happy path — ADMIN overrides feed status

**Preconditions:** ADMIN role authenticated
**Input:** Override request with valid reason
**Expected Result:**
- HTTP 200; override applied; audit log written

---

#### TC-FEED-015: Role guard — BO_MAKER cannot override

**Preconditions:** BO_MAKER authenticated
**Input:** `POST /back-office/feed-health/BLOOMBERG/override` with valid body
**Expected Result:**
- HTTP 403; `"Insufficient permissions — BO_HEAD or ADMIN required"`

---

#### TC-FEED-016: Role guard — BO_CHECKER cannot override

**Preconditions:** BO_CHECKER authenticated
**Input:** Same as TC-FEED-015
**Expected Result:**
- HTTP 403

---

#### TC-FEED-017: Reason validation — minimum 10 characters

**Preconditions:** BO_HEAD authenticated
**Input:** `reason = "Short"` (5 chars)
**Expected Result:**
- HTTP 422; `"reason must be at least 10 characters"`
- No override applied; no audit log

---

#### TC-FEED-018: Reason validation — exactly 10 characters accepted

**Input:** `reason = "1234567890"` (exactly 10 chars)
**Expected Result:**
- HTTP 200; override applied

---

#### TC-FEED-019: Reason validation — exactly 500 characters accepted

**Input:** `reason = "A" * 500` (500 chars)
**Expected Result:**
- HTTP 200; override applied

---

#### TC-FEED-020: Reason validation — 501 characters rejected

**Input:** `reason = "A" * 501`
**Expected Result:**
- HTTP 422; `"reason must not exceed 500 characters"`

---

#### TC-FEED-021: Unknown feed ID — 404

**Input:** `POST /back-office/feed-health/UNKNOWN_FEED/override`
**Expected Result:**
- HTTP 404; `"Feed not found: UNKNOWN_FEED"`

---

#### TC-FEED-022: Clear override — restores health-score-derived status

**Preconditions:** BLOOMBERG has manual override of `UP` but health score is 30 (DOWN)
**Input:** `POST /back-office/feed-health/BLOOMBERG/clear-override`
**Expected Result:**
- HTTP 200
- Override removed from in-memory entry
- `GET /feed-health` now shows BLOOMBERG as `"DOWN"` (derived from score 30)
- Audit log: `action = "FEED_HEALTH_OVERRIDE_CLEARED"`, `resource_id = "BLOOMBERG"`

---

#### TC-FEED-023: Clear override — BO_HEAD required

**Preconditions:** BO_MAKER authenticated
**Input:** `POST /back-office/feed-health/BLOOMBERG/clear-override`
**Expected Result:**
- HTTP 403; role guard blocks

---

#### TC-FEED-024: Audit log structure on override

**Preconditions:** BO_HEAD successfully overrides REUTERS
**Expected Result:**
- Audit record:
  - `event_type`: `'FEED_HEALTH_OVERRIDE'`
  - `actor_id`: BO_HEAD user ID
  - `resource_type`: `'FEED'`
  - `resource_id`: `'REUTERS'`
  - `metadata.override_status`: value set
  - `metadata.reason`: reason text
  - `created_at`: within 1 second of request

---

#### TC-FEED-025: Override persists across in-memory refresh cycles

**Preconditions:** BLOOMBERG overridden to `UP`; `updateFeedHealth` called with score 20 for BLOOMBERG
**Expected Result:**
- Manual override takes precedence over health score update
- `GET /feed-health` still shows BLOOMBERG as `"UP"` until override is cleared
- OR: `updateFeedHealth` clears override only if explicitly designed to; document behavior

---

---

## Appendix A: Test Data Prerequisites

| Entity | ID | Notes |
|---|---|---|
| Client | CLT-001 | Default test client; all happy-path tests |
| Client | CLT-002 | Second client for cross-ownership tests |
| Client | CLT-NEW | New client with no data |
| Service Request | SR-2026-000001 | Owned by CLT-001; APPROVED status |
| Service Request | SR-2026-000099 | Owned by CLT-002 |
| Statement | STMT-001 | CLT-001; DELIVERED; valid storage_reference |
| Statement | STMT-002 | CLT-001; PENDING; null storage_reference |
| Statement | STMT-005 | CLT-001; FAILED (regeneratable) |
| Statement | STMT-006 | CLT-001; GENERATING (regeneration conflict) |
| Document | DOC-001 | SR-2026-000001; CLEAN |
| Document | DOC-003 | SR-2026-000001; QUARANTINED |
| Document | DOC-004 | SR-2026-000001; deleted (null storage_reference) |
| Document | DOC-005 | SR-2026-000001; PENDING_SCAN |
| Message | MSG-001 | CLT-001; unread; thread TH-001 |
| Message | MSG-002 | CLT-001; read |
| Message | MSG-099 | CLT-002; unread |
| RM User | RM-001 | BO_MAKER; assigned to CLT-001, CLT-002 |
| Config Key | CRM_LATE_FILING_DAYS | Integer; min=1; max=30; current=5 |
| Config Key | MAX_FILE_SIZE_MB | Integer; current=20 |
| Config Key | JWT_SECRET | Sensitive; masked in GET |

---

## Appendix B: Role Matrix for Access Control Tests

| Endpoint | CLIENT | BO_MAKER | BO_CHECKER | BO_HEAD | ADMIN |
|---|---|---|---|---|---|
| GET /client-portal/messages | Own only | — | — | — | — |
| POST /client-portal/messages | Own only | — | — | — | — |
| GET /back-office/client-messages | — | Scoped | Scoped | All | All |
| POST /back-office/.../reply | — | Scoped | Scoped | All | All |
| GET /back-office/system-config | — | Yes | Yes | Yes | Yes |
| PUT /back-office/system-config/:key | — | No | No | Yes | Yes |
| GET /back-office/feed-health | — | Yes | Yes | Yes | Yes |
| POST /back-office/feed-health/:feed/override | — | No | No | Yes | Yes |
| POST /back-office/feed-health/:feed/clear-override | — | No | No | Yes | Yes |
| GET /back-office/statements | — | Yes | Yes | Yes | Yes |
| POST /back-office/statements/:id/regenerate | — | Yes | Yes | Yes | Yes |
| GET /back-office/sr/:id/documents | — | Yes | Yes | Yes | Yes |
| GET /back-office/sr/:id/documents/:doc/download | — | Yes (QUARANTINED+warning) | Yes | Yes | Yes |

---

## Appendix C: Error Code Reference

| Code | HTTP Status | Description |
|---|---|---|
| `PORTAL_OWNERSHIP_VIOLATION` | 403 | Client accessing another client's resource |
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Role not permitted |
| `VALIDATION_ERROR` | 422 | Input validation failure |
| `ALREADY_GENERATING` | 409 | Statement regeneration already in progress |
| `VERSION_CONFLICT` | 409 | Optimistic concurrency failure on config update |
| `FILE_TOO_LARGE` | 413 | Upload exceeds 20MB limit |
| `INVALID_MIME_TYPE` | 415 | MIME type not in whitelist |
| `DOCUMENT_QUARANTINED` | 403 | Client download blocked for quarantined document |
| `FEED_NOT_FOUND` | 404 | Feed ID does not exist in registry |
| `CONSENT_REQUIRED` | 403 | Client has not granted consent for operation |

---

*Generated from Trust Banking Hardening BRD v1.0 — TrustOMS Philippines*
*Test case count: 148 across 21 functional requirements in 6 modules*
