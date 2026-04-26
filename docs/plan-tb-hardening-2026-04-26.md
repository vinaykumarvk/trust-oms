# Development Plan: Trust Banking Hardening

## Overview

Implement six confirmed gaps from the Trust Banking Gap Register: client portal ownership enforcement (P0), client messaging backend, statement download, DB-backed SLA configuration, service-request document storage, and degraded-mode feed state persistence. All gaps were confirmed against live code; 27 of 33 requirements are MISSING. This plan targets the final BRD v2 (Final) at `docs/TrustBanking_Hardening_BRD_v2_Final.docx`.

## Architecture Decisions

- **CP-SEC: Use req.user.clientId from JWT claim** — Codebase inspection confirmed `req.user?.clientId` is already used in client-portal routes (e.g., campaign-inbox at line 477 of client-portal.ts). The JWT payload includes `clientId`. The ownership middleware will read `req.user?.clientId` directly and compare to the `:clientId` route param.
- **SYSCONFIG: Custom route file instead of createCrudRouter** — The existing `createCrudRouter` at `back-office/index.ts:787` wraps all CRUD under `requireBackOfficeRole()`, granting BO_MAKER/CHECKER write access (SoD violation). A dedicated `server/routes/back-office/system-config.ts` with per-endpoint role guards replaces the CRUD registration.
- **StorageProvider abstraction** — `server/services/storage-provider.ts` exports a `StorageProvider` interface and a `LocalStorageProvider` (default). `STORAGE_PROVIDER=LOCAL|S3` env var selects the implementation. Services call the interface; the file system is never referenced directly.
- **SCAN_PROVIDER env var** — `server/services/document-scan-service.ts` reads `SCAN_PROVIDER` at startup. If unset the process throws on boot. Values: `SIMULATED` (dev), `CLAMAV`, `EXTERNAL_WEBHOOK`.
- **Feed write-back: fire-and-forget** — All `degradedModeService` functions that mutate `feedHealthRegistry` call a non-blocking DB snapshot write. A write failure is logged but never re-thrown.
- **Parallel Phase 2 work** — Phases 2A (FEED), 2B (SYSCONFIG), and 2C (CP-SEC) have no code dependencies on each other; they all depend only on Phase 1's schema additions.

## Conventions

- Error classes: `NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError` from `server/services/service-errors.ts`.
- Route error handling: `httpStatusFromError(err)` + `safeErrorMessage(err)` — see `server/routes/back-office/call-reports-custom.ts` as canonical example.
- Back-office route file pattern: see `server/routes/back-office/meetings.ts` (Router export, `requireBackOfficeRole()` or `requireAnyRole()` per handler, `asyncHandler` wrapper).
- Client portal route pattern: see existing handlers in `server/routes/client-portal.ts` (inline `asyncHandler`, `req.user?.clientId` for identity).
- Schema: `packages/shared/src/schema.ts` — Drizzle `pgTable` with `pgEnum` for enums (see `trustProductTypeEnum` at line 30).
- UI imports: always `@ui/components/ui/...` (NOT `@/components/ui/...`).
- React data fetching: React Query `useQuery`/`useMutation` with `apiRequest()` and `apiUrl()` helpers.
- `requireBackOfficeRole()` takes NO arguments. For role-specific restriction use `requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')`.

---

## Phase 1: Schema Foundation
**Dependencies:** none

**Description:**
All new tables and column additions go into `packages/shared/src/schema.ts` in a single phase so all subsequent service and route phases compile cleanly. Includes: enriching `system_config`, adding `client_messages`, `service_request_documents`, `feed_health_snapshots`, and statement metadata columns.

**Tasks:**
1. Add 7 missing columns to `systemConfig` table (after `description`): `value_type` (text, default 'STRING'), `min_value` (text, nullable), `max_value` (text, nullable), `requires_approval` (boolean, default false), `is_sensitive` (boolean, default false), `version` (integer, default 1), `approved_by` (integer, nullable, FK to users.id).
2. Add `document_class_enum` pgEnum: `['TRUST_ACCOUNT_OPENING', 'KYC', 'TRANSACTION', 'OTHER']`.
3. Add `delivery_status_enum` pgEnum: `['PENDING', 'GENERATING', 'AVAILABLE', 'FAILED']`.
4. Add `scan_status_enum` pgEnum: `['PENDING', 'CLEAN', 'QUARANTINED', 'SKIPPED']`.
5. Add `sender_type_enum` pgEnum: `['RM', 'CLIENT', 'SYSTEM']`.
6. Add `client_messages` table with all columns from BRD Section 4.1 (including `is_deleted`, `deleted_at`, `related_sr_id` FK to serviceRequests.id).
7. Add `service_request_documents` table with all columns from BRD Section 4.4 (using `scan_status_enum`, `document_class_enum`).
8. Add `feed_health_snapshots` table with all columns from BRD Section 4.6 (including `override_expires_at`).
9. Add 7 new columns to the existing `statements` table (look for the statements table in schema.ts — it should be near NAV records): `file_reference` (text, nullable), `file_size_bytes` (integer, nullable), `delivery_status` (delivery_status_enum, default 'PENDING'), `delivery_error` (text, nullable), `download_count` (integer, default 0), `last_downloaded_at` (timestamptz, nullable), `generated_at` (timestamptz, nullable).
10. Add partial unique index on `client_messages(recipient_client_id)` WHERE `is_read = false` using `uniqueIndex(...).where(sql\`is_read = false\`)` — follow the pattern at the `callReports` table definition (partial index added in recent commit).

**Files to create/modify:**
- `packages/shared/src/schema.ts` — add 5 pgEnums, 3 new tables, 7 columns on systemConfig, 7 columns on statements, 1 partial index

**Acceptance criteria:**
- `npx tsc --noEmit` passes with 0 errors after schema changes.
- All new tables are exported from schema.ts.
- All new enum types are exported and used in their respective tables.
- No existing table definitions are altered (only additive changes).

---

## Phase 2A: Feed Health State Persistence
**Dependencies:** Phase 1

**Description:**
Extend `degradedModeService` so that every health state mutation writes to `feed_health_snapshots`, server startup reloads from DB, override expiry is enforced, and two new back-office endpoints (override + clear-override) are registered.

**Tasks:**
1. In `server/services/degraded-mode-service.ts`:
   - Add a `persistSnapshot(feedName: string, entry: FeedHealthEntry): Promise<void>` helper that fire-and-forgets an upsert into `feed_health_snapshots` (insert or update where `feed_name = feedName AND last_updated = last in table`). Use a simple INSERT with conflict handling.
   - Call `persistSnapshot()` (non-blocking: `void persistSnapshot(...)` not `await`) at the end of every function that mutates `feedHealthRegistry`: `reportIncident`, `updateFeedHealth`, `switchFeed`.
   - Add an `initializeFeedRegistry(): Promise<void>` export that queries `SELECT DISTINCT ON (feed_name) * FROM feed_health_snapshots ORDER BY feed_name, created_at DESC` and populates `feedHealthRegistry`. Writes a baseline snapshot for any feed not in DB. Call this function from `server/index.ts` (or main Express init) as `await degradedModeService.initializeFeedRegistry()` before the server starts listening.
   - Add `applyOverride(feedName, status, reason, expiresAt, overrideBy)` that sets the in-memory entry status and calls `persistSnapshot`.
   - Add `clearOverride(feedName)` that recomputes status from health_score and calls `persistSnapshot`.
2. In `server/routes/back-office/degraded-mode.ts`, add:
   - `POST /:feed/override` — `requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')`; body `{ status: 'OVERRIDE_UP' | 'OVERRIDE_DOWN', reason: string (10-500 chars), expires_hours?: number (default 24) }`; calls `degradedModeService.applyOverride()`; writes audit log.
   - `POST /:feed/clear-override` — same role; calls `degradedModeService.clearOverride()`; writes audit log.
3. Add an EOD-style background job (can be a `setInterval` every 5 minutes in server init) that checks `feed_health_snapshots` for rows where `override_expires_at < NOW()` and calls `clearOverride()` for each expired feed.

**Files to create/modify:**
- `server/services/degraded-mode-service.ts` — add `persistSnapshot`, `initializeFeedRegistry`, `applyOverride`, `clearOverride`; add write-back calls to all mutating functions
- `server/routes/back-office/degraded-mode.ts` — add override and clear-override POST routes
- `server/index.ts` (or wherever Express app starts) — add `await degradedModeService.initializeFeedRegistry()` before `app.listen()`

**Acceptance criteria:**
- After a `reportIncident()` call, a row exists in `feed_health_snapshots` for that feed.
- After server restart, `feedHealthRegistry` state matches last DB snapshot (not hardcoded defaults).
- `POST /:feed/override` with a BO_MAKER token returns 403.
- `POST /:feed/override` with `reason.length < 10` returns 400.
- `GET /feed-health` still returns from in-memory (no DB query added to the GET path).
- `npx tsc --noEmit` passes.

---

## Phase 2B: System Configuration Hardening
**Dependencies:** Phase 1

**Description:**
Replace the auto-CRUD system-config registration with a custom route file that enforces BO_HEAD/ADMIN-only writes, adds type/range validation, audit logging, optimistic concurrency via the `version` field, and DB-backed cache in `callReportService`.

**Tasks:**
1. Create `server/routes/back-office/system-config.ts`:
   - `GET /` — `requireBackOfficeRole()` (all BO roles); query all systemConfig rows; mask `config_value` as `'****'` for rows where `is_sensitive = true`.
   - `GET /:key` — same role; return single row (masked if sensitive).
   - `PUT /:key` — `requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')`; validate `config_value` against `value_type` (parseInt for INTEGER, parseFloat for DECIMAL, JSON.parse for JSON, 'true'/'false' for BOOLEAN); validate against `min_value`/`max_value` if set; check `version` in request body matches DB version (409 if stale); increment `version`; set `updated_by = req.user.id`; write audit log with `event='SYSTEM_CONFIG_UPDATED', config_key, old_value, new_value, updated_by`; invalidate config cache.
2. In `server/routes/back-office/index.ts`:
   - Remove the `createCrudRouter` block for `/system-config` (lines 787-794).
   - Import and register the new `system-config` router: `router.use('/system-config', systemConfigRoutes)`.
3. In `server/services/call-report-service.ts`:
   - Add a module-level config cache: `let _lateFilingDays: number | null = null; let _cacheExpiry = 0;`
   - Add `async function getLateFilingDays(): Promise<number>` that: reads from cache if `_cacheExpiry > Date.now()`; else queries `systemConfig WHERE config_key = 'CRM_LATE_FILING_DAYS'`; falls back to `parseInt(process.env.CRM_LATE_FILING_DAYS ?? '5')` if no DB row; falls back to `5` if env parse fails; sets `_cacheExpiry = Date.now() + 5 * 60 * 1000`; returns value.
   - Export `invalidateLateFilingCache()` that sets `_cacheExpiry = 0`. Call this from the system-config PUT handler after a successful update to `CRM_LATE_FILING_DAYS`.
   - Replace the hardcoded `LATE_FILING_THRESHOLD_DAYS` constant usage in the `submit()` method with `await getLateFilingDays()`.
   - Replace calendar-day calculation with `MarketCalendarService.nextBusinessDay(calendarKey, meetingDate, threshold)` where `calendarKey = 'PSE'` (existing calendar key). Import `marketCalendarService` from `'./market-calendar-service'`.

**Files to create/modify:**
- `server/routes/back-office/system-config.ts` — new file; full CRUD with role restriction
- `server/routes/back-office/index.ts` — replace createCrudRouter block with new import
- `server/services/call-report-service.ts` — add DB-backed config cache + market calendar integration

**Acceptance criteria:**
- `PUT /api/v1/back-office/system-config/CRM_LATE_FILING_DAYS` with a BO_MAKER token returns 403.
- `PUT` with stale `version` field returns 409 with code `CONFLICT`.
- After a PUT, subsequent call-report `submit()` calls use the new threshold value within 5 minutes (cache TTL).
- Late-filing calculation counts business days (not calendar days): a meeting on Friday should have a deadline of the following Friday if threshold=5, not the following Wednesday.
- `npx tsc --noEmit` passes.

---

## Phase 2C: Client Portal Ownership Middleware
**Dependencies:** Phase 1

**Description:**
Create `validatePortalOwnership` middleware using the existing `req.user?.clientId` JWT claim, apply it to the 5 confirmed IDOR-vulnerable routes in `client-portal.ts`, and implement the security alert logic for repeated violations.

**Tasks:**
1. Create `server/middleware/portal-ownership.ts`:
   - Export `validatePortalOwnership()` — a standard Express middleware `(req, res, next) => { ... }`.
   - Read `const sessionClientId = (req as any).user?.clientId`. If missing/undefined, return 401.
   - Read `const routeClientId = req.params.clientId`. If missing, call `next()` (route doesn't have :clientId param).
   - If `sessionClientId !== routeClientId`, write audit log (`event='CLIENT_PORTAL_OWNERSHIP_VIOLATION'`, actor_id, attempted_client_id, actual_client_id, ip), increment violation counter, check threshold, return 403.
   - Violation counter: use an in-memory `Map<sessionId, {count, windowStart}>` keyed by `req.user?.sub || req.userId`. If count reaches 3 within 15 minutes of `windowStart`, call `exceptionQueueService.createException({ exception_type: 'CLIENT_PORTAL_SECURITY_ALERT', severity: 'P1', title: 'Client Portal repeated ownership violations', ... })` and notify BO_HEAD. The Map entry resets after 15 minutes.
2. In `server/routes/client-portal.ts`:
   - Import `validatePortalOwnership` from `'../middleware/portal-ownership'`.
   - Apply it as middleware on these 5 routes (add as the second argument after the path string):
     - `GET /portfolio-summary/:clientId`
     - `GET /statements/:clientId`
     - `GET /notifications/:clientId`
     - `GET /risk-profile/:clientId`
     - `GET /service-requests/:clientId`
   - Also apply to any sub-routes under statements and service-requests that accept :clientId.

**Files to create/modify:**
- `server/middleware/portal-ownership.ts` — new file; ownership middleware + violation tracking
- `server/routes/client-portal.ts` — import and apply middleware to 5 routes

**Acceptance criteria:**
- Requesting `/api/v1/client-portal/statements/CL-999` with a session for `CL-001` returns 403.
- Requesting with matching clientId returns 200 (passes through).
- 3 mismatched requests within 15 minutes creates a P1 exception queue entry.
- Unauthenticated request (no `req.user`) returns 401.
- `npx tsc --noEmit` passes.

---

## Phase 3A: Client Messaging — Backend + UI
**Dependencies:** Phase 1, Phase 2C

**Description:**
Full messaging implementation: service layer, client portal endpoints (list/send/mark-read/unread-count), back-office RM inbox and reply endpoints, and replacement of the hardcoded messages.tsx with live API-driven data.

**Tasks:**
1. Create `server/services/client-message-service.ts`:
   - `create(data: { sender_id, sender_type, recipient_client_id, subject?, body, thread_id?, parent_message_id?, related_sr_id? }): Promise<ClientMessage>` — inserts into `client_messages`; generates `thread_id` as `thr-${Date.now()}` if null and no parent; validates body 1–5000 chars; validates subject required when `thread_id` is null.
   - `listForClient(clientId, filters: { page, pageSize }): Promise<{ data, total, unread_count }>` — queries messages where `recipient_client_id = clientId AND is_deleted = false`; sorted `sent_at DESC`; includes `unread_count` from a COUNT subquery.
   - `markRead(messageId, clientId): Promise<void>` — IDOR check: verify message `recipient_client_id = clientId`; idempotent (no-op if already read); sets `is_read = true, read_at = NOW()`.
   - `getUnreadCount(clientId): Promise<number>` — COUNT query.
   - `listAllForBO(filters: { client_id?, is_read?, sender_type?, date_from?, date_to?, page, pageSize }): Promise<{ data, total }>` — no client scoping (BO sees all or RM sees assigned clients).
   - `reply(parentMessageId, senderId, body): Promise<ClientMessage>` — looks up parent; creates reply with `thread_id` from parent, `sender_type = 'RM'`, `recipient_client_id` from parent; triggers notification via `notificationInboxService.create(...)`.
2. In `server/routes/client-portal.ts`, add routes (using `validatePortalOwnership` where :clientId is present):
   - `GET /messages` — calls `clientMessageService.listForClient(req.user.clientId, filters)`
   - `GET /messages/unread-count` — calls `clientMessageService.getUnreadCount(req.user.clientId)`
   - `POST /messages` — calls `clientMessageService.create({ sender_type: 'CLIENT', sender_id: req.user.id, recipient_client_id: req.user.clientId, ...body })`
   - `PATCH /messages/:id/read` — calls `clientMessageService.markRead(id, req.user.clientId)`
3. Create `server/routes/back-office/client-messages.ts`:
   - `GET /` with `requireBackOfficeRole()` — calls `clientMessageService.listAllForBO(filters)`
   - `POST /:id/reply` with `requireBackOfficeRole()` — calls `clientMessageService.reply(id, req.user.id, body.body)`
4. Register in `server/routes/back-office/index.ts`: `router.use('/client-messages', clientMessageRoutes)`.
5. Update `apps/client-portal/src/pages/messages.tsx`:
   - Remove `initialMessages` hardcoded array and all local-state-only logic.
   - Add `useQuery(['messages'], () => apiRequest('GET', apiUrl('/api/v1/client-portal/messages')), { refetchInterval: 60000 })` for message list.
   - Add `useQuery(['messages-unread'], () => apiRequest('GET', apiUrl('/api/v1/client-portal/messages/unread-count')), { refetchInterval: 60000 })` for badge.
   - Add `useMutation` for send and mark-read actions.
   - Keep the two-panel layout; wire left panel to `data.data`, right panel to selected thread.
6. Update `apps/client-portal/src/components/layout/ClientPortalLayout.tsx`:
   - Add unread count badge on the Messages navigation item using `useQuery(['messages-unread'])`.
   - Badge hidden when `unread_count === 0`.

**Files to create/modify:**
- `server/services/client-message-service.ts` — new service file
- `server/routes/client-portal.ts` — add 4 message endpoints
- `server/routes/back-office/client-messages.ts` — new route file
- `server/routes/back-office/index.ts` — register client-messages router
- `apps/client-portal/src/pages/messages.tsx` — replace stub with live API
- `apps/client-portal/src/components/layout/ClientPortalLayout.tsx` — add unread badge

**Acceptance criteria:**
- `GET /api/v1/client-portal/messages` returns `{ data: [...], total: N, unread_count: M }`.
- `POST /api/v1/client-portal/messages` with `sender_type: 'RM'` in body is overridden to `'CLIENT'` server-side.
- `POST /api/v1/client-portal/messages` with body > 5000 chars returns 400.
- `PATCH /messages/:id/read` with wrong clientId returns 403.
- Messages page renders live data (no hardcoded array).
- Unread badge appears on the nav item when unread_count > 0.
- `npx tsc --noEmit` passes.

---

## Phase 3B: Service Request Document Storage
**Dependencies:** Phase 1, Phase 2C

**Description:**
Introduce the StorageProvider abstraction, document scan service, and complete document upload/list/download endpoints for both client portal and back-office. Uses `service_request_documents` table from Phase 1.

**Tasks:**
1. Create `server/services/storage-provider.ts`:
   - Export `StorageProvider` interface: `{ save(buffer: Buffer, relativePath: string): Promise<string>; read(reference: string): Promise<Buffer>; delete(reference: string): Promise<void>; exists(reference: string): Promise<boolean>; }`.
   - Export `LocalStorageProvider implements StorageProvider` — uses `fs.promises` with base dir `path.join(process.cwd(), 'uploads')`. `save()` creates directories with `mkdirSync(recursive)` and writes file; returns relative path.
   - Export `getStorageProvider(): StorageProvider` — reads `process.env.STORAGE_PROVIDER`; returns `new LocalStorageProvider()` for `'LOCAL'`; throws startup error for unknown values; defaults to `LOCAL` in development.
   - On module load: validate `process.env.SCAN_PROVIDER` is set (throw if not, unless `NODE_ENV=test`).
2. Create `server/services/document-scan-service.ts`:
   - Export `async function scanDocument(docId: number, buffer: Buffer, filename: string): Promise<void>`.
   - Reads `SCAN_PROVIDER` env var.
   - `SIMULATED`: waits 2 seconds then marks CLEAN; marks QUARANTINED if filename matches `/\.(exe|bat|sh|cmd|ps1)$/i`.
   - `CLAMAV` / `EXTERNAL_WEBHOOK`: stubbed with TODO comment and immediate SKIPPED status.
   - Updates `service_request_documents` with `scan_status` and `scan_completed_at`.
3. Create `server/services/sr-document-service.ts`:
   - `upload(srId, file: Express.Multer.File, uploadedByType, uploadedById, documentClass?): Promise<SRDocument>` — validate MIME type; check blocked extension (`path.extname(file.originalname)`); sanitize: `const safe = path.basename(file.originalname)`; build path `${srId}/${uuid}-${safe}`; call `storageProvider.save(file.buffer, path)`; insert into `service_request_documents` with `scan_status = 'PENDING'`; fire-and-forget `void scanDocument(doc.id, file.buffer, safe)`.
   - `list(srId): Promise<SRDocument[]>` — query non-deleted docs for SR.
   - `download(docId, requesterClientId?): Promise<{ buffer: Buffer; document: SRDocument }>` — lookup doc; if `requesterClientId` provided, verify SR belongs to client (IDOR check); return 403 if QUARANTINED (for client requests); read buffer from storage.
4. In `server/routes/client-portal.ts`, add routes (with `validatePortalOwnership` by checking SR ownership in service):
   - `POST /service-requests/:id/documents` — multer upload (20MB limit, MIME whitelist); calls `srDocumentService.upload(...)`.
   - `GET /service-requests/:id/documents` — calls `srDocumentService.list(srId)`.
   - `GET /service-requests/:id/documents/:docId/download` — calls `srDocumentService.download(docId, req.user.clientId)`; streams buffer.
5. Create `server/routes/back-office/sr-documents.ts`:
   - `GET /:srId/documents` — `requireBackOfficeRole()`; calls `srDocumentService.list(srId)`.
   - `GET /:srId/documents/:docId/download` — `requireBackOfficeRole()`; calls `srDocumentService.download(docId)` (no client restriction); adds `X-Scan-Status` header for QUARANTINED files; streams buffer.
6. Register in `server/routes/back-office/index.ts`: `router.use('/service-requests', srDocumentsRoutes)` (or add to existing service-requests router if it exists).

**Files to create/modify:**
- `server/services/storage-provider.ts` — new file; StorageProvider interface + LocalStorageProvider
- `server/services/document-scan-service.ts` — new file; SCAN_PROVIDER-driven scan
- `server/services/sr-document-service.ts` — new file; upload/list/download logic
- `server/routes/client-portal.ts` — add 3 document endpoints
- `server/routes/back-office/sr-documents.ts` — new file; BO document routes
- `server/routes/back-office/index.ts` — register sr-documents router

**Acceptance criteria:**
- Upload with `.exe` extension returns 400 before any file is saved.
- Upload of a 21MB file returns 413.
- Uploaded file appears in `service_request_documents` with `scan_status = 'PENDING'`.
- After 2 seconds (simulated scan), scan_status updates to `CLEAN`.
- Client download of QUARANTINED document returns 403.
- BO download of QUARANTINED document returns 200 with `X-Scan-Status: QUARANTINED` header.
- storage_reference path never contains `../` (path.basename sanitization verified).
- `npx tsc --noEmit` passes.

---

## Phase 3C: Statement Download
**Dependencies:** Phase 1, Phase 2C

**Description:**
Enrich the statements table with delivery metadata, implement the statement download endpoint (no placeholder PDF per BSP compliance), and add BO statement management endpoints. Update the client portal statements page to show delivery status and enable download.

**Tasks:**
1. Create or extend `server/services/statement-service.ts` (check if it exists first):
   - `getForClient(clientId, filters): Promise<{ data: Statement[], total: number }>` — queries statements table with new columns included; returns enriched rows.
   - `download(statementId, clientId): Promise<{ buffer: Buffer; statement: Statement }>` — IDOR: verify statement belongs to clientId; if `delivery_status !== 'AVAILABLE'`, throw a `ValidationError` with code `NOT_AVAILABLE` and the delivery_status; read file from `storageProvider.read(statement.file_reference)`; increment `download_count`, set `last_downloaded_at`; write audit log (`event='STATEMENT_DOWNLOADED'`, client_id, statement_id, file_size_bytes, ip).
   - `triggerRegenerate(statementId): Promise<void>` — if `delivery_status = 'GENERATING'`, throw `ConflictError`; else set `delivery_status = 'GENERATING'`, clear `delivery_error`; in production this would enqueue a job; in dev log `'Statement regeneration triggered for statementId: ${id}'`.
2. In `server/routes/client-portal.ts`, update the existing `/statements/:clientId` route to call `statementService.getForClient()` and add:
   - `GET /statements/:clientId/:statementId/download` — `validatePortalOwnership` applied via route middleware; calls `statementService.download(statementId, req.user.clientId)`; if `ValidationError` with code `NOT_AVAILABLE`, return 202 `{ status, delivery_status, message }`; else stream buffer with `Content-Type: application/pdf`, `Content-Disposition: attachment`, `X-Delivery-Status: AVAILABLE`.
3. Create `server/routes/back-office/statements.ts`:
   - `GET /` — `requireBackOfficeRole()`; returns all statements with metadata (no client filter).
   - `POST /:id/regenerate` — `requireBackOfficeRole()`; calls `statementService.triggerRegenerate(id)`.
4. Register in `server/routes/back-office/index.ts`: `router.use('/statements', boStatementRoutes)`.
5. Update `apps/client-portal/src/pages/statements.tsx`:
   - Replace the stub `handleDownload` function with a real fetch: call `apiRequest('GET', apiUrl(\`/api/v1/client-portal/statements/${clientId}/${statement.id}/download\`))` with `responseType: 'blob'`; trigger browser download via `URL.createObjectURL`.
   - If API returns 202 (not available), show a toast: `'Statement is being prepared. You will be notified when it is ready.'`.
   - Show delivery_status badge in the statement list (AVAILABLE=green, GENERATING=amber, FAILED=red, PENDING=grey).
   - Download button disabled (grayed out) when `delivery_status !== 'AVAILABLE'`.

**Files to create/modify:**
- `server/services/statement-service.ts` — create or extend; add download, getForClient, triggerRegenerate
- `server/routes/client-portal.ts` — add download endpoint; update list to use service
- `server/routes/back-office/statements.ts` — new file; BO statement management
- `server/routes/back-office/index.ts` — register BO statements router
- `apps/client-portal/src/pages/statements.tsx` — replace stub download; add delivery_status badges

**Acceptance criteria:**
- `GET /statements/:clientId/:id/download` returns 403 for mismatched clientId.
- Download of a statement with `delivery_status = 'GENERATING'` returns HTTP 202 (not 200 or 404).
- Download of an AVAILABLE statement streams with `Content-Type: application/pdf`.
- `download_count` increments after each successful download.
- Audit log entry written for every successful download.
- Statement list shows delivery_status badges.
- Download button disabled for non-AVAILABLE statements in the UI.
- `npx tsc --noEmit` passes.

---

## Phase 4: Integration and Build Verification
**Dependencies:** Phase 2A, Phase 2B, Phase 2C, Phase 3A, Phase 3B, Phase 3C

**Description:**
Cross-cutting integration verification: TypeScript compilation, route registration checks, cross-module behavior, and review of the 148 test cases from `docs/test-cases-tb-hardening-2026-04-25.md`.

**Tasks:**
1. Run `npx tsc --noEmit` — fix any remaining type errors before proceeding.
2. Verify all new routes are registered by grepping `server/routes/back-office/index.ts` and `server/routes/client-portal.ts` for each new router import.
3. Verify system-config createCrudRouter block is removed from `index.ts`.
4. Cross-module test: verify that after a PUT to `/system-config/CRM_LATE_FILING_DAYS`, the `callReportService` cache is cleared (check that `invalidateLateFilingCache()` is called from the route handler).
5. Cross-module test: verify that a 3rd ownership violation creates an exception queue entry (trace through `portal-ownership.ts` → `exceptionQueueService.createException`).
6. Verify `uploads/` directory is created by LocalStorageProvider on first use; `.gitignore` has `uploads/` entry.
7. Review test cases in `docs/test-cases-tb-hardening-2026-04-25.md` — for each TC category, verify the implemented code satisfies the described behavior. Document any failed test cases.
8. Run build: `npm run build` (or `npx tsc --build`) — verify 0 errors.

**Files to create/modify:**
- `.gitignore` — add `uploads/` if not already present
- `server/routes/back-office/index.ts` — final review of all registrations
- Any files with remaining TypeScript errors

**Acceptance criteria:**
- `npx tsc --noEmit` passes with 0 errors.
- `npm run build` completes with 0 errors.
- All 6 new back-office route files are imported and registered in index.ts.
- `uploads/` is in .gitignore.
- System-config createCrudRouter block is absent from index.ts.
- At least 90% of the 148 test cases are satisfied by code inspection.

---

## Dependency Graph

```
Phase 1 (Schema)
    │
    ├──> Phase 2A (FEED persistence)       ─────────────────────────────────┐
    ├──> Phase 2B (SYSCONFIG hardening)    ──────────────────────────────┐  │
    └──> Phase 2C (CP-SEC middleware)      ─┐                            │  │
                                            ├─> Phase 3A (Messaging)    │  │
                                            ├─> Phase 3B (Documents)    │  │
                                            └─> Phase 3C (Statements)   │  │
                                                                         │  │
                                                Phase 4 (Integration) <─┴──┘
```

**Parallel opportunity:** Phases 2A, 2B, 2C can run simultaneously. Phases 3A, 3B, 3C can run simultaneously (after 2C).
**Critical path:** Phase 1 → Phase 2C → Phase 3A/3B/3C → Phase 4 (5 sequential steps minimum)
