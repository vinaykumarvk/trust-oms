# Gap Analysis: Trust Banking Hardening BRD v1.0
## Date: 2026-04-25

## Summary

| Metric | Count |
|--------|-------|
| Total requirements audited | 33 |
| EXISTS (fully implemented) | 3 |
| PARTIAL (some aspects implemented) | 3 |
| MISSING (no implementation) | 27 |
| CONFLICTS | 0 |

**Implementation rate:** 6/33 = 18% (prior to this sprint)

---

## Detailed Gap Table

| ID | Requirement | Status | Evidence (file:line) | Gap Details |
|----|-------------|--------|---------------------|-------------|
| **CP-SEC-1** | `validatePortalOwnership()` middleware checks `req.user.clientId === :clientId` | MISSING | Not found in `server/middleware/` or `server/routes/client-portal.ts` | No ownership middleware exists; routes extract clientId from params without session validation |
| **CP-SEC-2** | Security alert after 3 violations in 15 minutes | MISSING | `server/services/exception-queue-service.ts` — no violation tracking | No session-level violation counter; no threshold-based alert creation |
| **CP-SEC-3** | Middleware applied to all client-portal routes with `:clientId` | PARTIAL | `server/routes/client-portal.ts` — some routes use `req.user?.clientId` for scoping | Routes filter data by `clientId` from URL param without verifying session match; 1 proposal route has a guard (SEC-07 fix), others do not |
| **MSG-1** | `client_messages` table in schema | MISSING | `packages/shared/src/schema.ts` — no such table | No messaging table; `notificationInbox` (line ~4580) exists but is unidirectional |
| **MSG-2** | Message service (create/list/markRead/unreadCount) | MISSING | `server/services/` — no message service file | Must be created from scratch |
| **MSG-3** | `GET /api/v1/client-portal/messages` | MISSING | `server/routes/client-portal.ts` — no messages route | Not registered |
| **MSG-4** | `POST /api/v1/client-portal/messages` | MISSING | Same | Not registered |
| **MSG-5** | `PATCH /api/v1/client-portal/messages/:id/read` | MISSING | Same | Not registered |
| **MSG-6** | `GET /api/v1/client-portal/messages/unread-count` | MISSING | Same | Not registered |
| **MSG-7** | `GET /api/v1/back-office/client-messages` (RM inbox) | MISSING | `server/routes/back-office/index.ts` — no client-messages route registered | Not registered |
| **MSG-8** | `POST /api/v1/back-office/client-messages/:id/reply` | MISSING | Same | Not registered |
| **MSG-9** | Unread count badge in ClientPortalLayout | MISSING | `apps/client-portal/src/components/layout/ClientPortalLayout.tsx` — no badge logic | Navigation renders static items; no polling or badge count |
| **MSG-10** | Messages page connected to real API | PARTIAL | `apps/client-portal/src/pages/messages.tsx` — exists but uses `initialMessages` hardcoded array (lines 32–90), local state only | Must replace with `useQuery` calling the real API |
| **STMT-1** | Statement table columns: `file_reference`, `file_size_bytes`, `delivery_status`, `download_count` | MISSING | `packages/shared/src/schema.ts` — statements table does not have these columns | Statements table exists but lacks all 6 new metadata columns |
| **STMT-2** | `GET /statements/:clientId/:statementId/download` endpoint | MISSING | `server/routes/client-portal.ts` — only a basic list route exists for statements | No download endpoint registered |
| **STMT-3** | Placeholder PDF generation | MISSING | `server/services/` — no PDF generation for statements | Existing `pdfInvoiceService` is for fee invoices only |
| **STMT-4** | Download audit logging | MISSING | No audit log call on statement access in any route | Must be added to download handler |
| **STMT-5** | BO statement regenerate endpoint `POST /:id/regenerate` | MISSING | `server/routes/back-office/` — no statement management route | Not registered |
| **SC-1** | `system_config` table with full BRD-required fields | PARTIAL | `packages/shared/src/schema.ts:4627` — table exists with `config_key`, `config_value`, `description`, `auditFields` | Missing 7 BRD-required columns: `value_type`, `min_value`, `max_value`, `requires_approval`, `is_sensitive`, `version`, `approved_by` |
| **SC-2** | `GET/PUT /api/v1/back-office/system-config` endpoints | PARTIAL | `server/routes/back-office/index.ts:788-794` — auto-generated CRUD router exists | GET exists. PUT may exist via CRUD but: no BO_HEAD/ADMIN role restriction, no type validation, no min/max validation, no audit log, no optimistic concurrency (version field missing from table) |
| **SC-3** | Config cache with 5-min TTL in `call-report-service.ts` | MISSING | `server/services/call-report-service.ts:21-22` — uses `process.env.CRM_LATE_FILING_DAYS` directly | No DB config lookup, no cache |
| **SC-4** | Business-day calculation via `MarketCalendarService` in late-filing | EXISTS | `server/services/market-calendar-service.ts` — service exists and is importable; used by order/CA services | Service exists but NOT yet used in call-report late-filing calculation (still uses calendar days from env) |
| **SC-5** | System config admin UI page | MISSING | `apps/back-office/src/pages/` — no system-config page | Must be created |
| **DOCS-1** | `service_request_documents` table | MISSING | `packages/shared/src/schema.ts` — no such table | `serviceRequests.documents` is a JSONB `string[]` column (line ~6124) |
| **DOCS-2** | Document upload endpoint with scan, MIME check, size limit | MISSING | No upload endpoint in client-portal or back-office routes | Must be created |
| **DOCS-3** | Async scan job/function | MISSING | No scan logic anywhere in `server/services/` | Must be created |
| **DOCS-4** | Document download with scan_status check | MISSING | No document download endpoint | Must be created |
| **DOCS-5** | Back-office document download with quarantine warning header | MISSING | Same | Must be created |
| **FEED-1** | `feed_health_snapshots` table | MISSING | `packages/shared/src/schema.ts` — no such table | `feedRouting` table exists (~line 2904) but is different |
| **FEED-2** | Startup reload of feed state from DB | MISSING | `server/services/degraded-mode-service.ts:42-48` — in-memory Map initialized at module load from hardcoded values | No DB query on startup; registry initialized from code constants |
| **FEED-3** | `GET /api/v1/back-office/feed-health` | EXISTS | `server/routes/back-office/degraded-mode.ts:9` — implemented, served from in-memory registry | Fully implemented |
| **FEED-4** | `POST /feed-health/:feed/override` (BO_HEAD/ADMIN) | MISSING | No override endpoint in degraded-mode routes | Must be created |
| **FEED-5** | `POST /feed-health/:feed/clear-override` | MISSING | Same | Must be created |

---

## EXISTS Items (No Work Needed)

| ID | File | Notes |
|----|------|-------|
| SC-4 (MarketCalendarService) | `server/services/market-calendar-service.ts` | Fully implemented; just needs integration into call-report-service |
| FEED-3 (GET /feed-health) | `server/routes/back-office/degraded-mode.ts:9` | Implemented and serving from in-memory registry |

---

## PARTIAL Items (Modification Required)

| ID | What Exists | What's Missing |
|----|-------------|----------------|
| CP-SEC-3 | Proposal route has SEC-07 IDOR guard | Ownership check not applied systematically to all :clientId routes via middleware |
| MSG-10 (messages.tsx) | Page renders; compose UI exists | Must wire to real API via `useQuery` / `useMutation` |
| SC-1 (system_config table) | Table with 3 base columns | Add `value_type`, `min_value`, `max_value`, `requires_approval`, `is_sensitive`, `version`, `approved_by` |
| SC-2 (system-config API) | Auto-CRUD GET endpoint | PUT needs role restriction, validation, audit log, concurrency guard |

---

## Conflicts Requiring Resolution

None. Existing code is additive-compatible with all BRD requirements.

---

## Implementation Priority Order

Based on gap status and BRD priorities:

1. **Phase 1 (P0 Security):** CP-SEC-1, CP-SEC-2, CP-SEC-3 — ownership middleware
2. **Phase 2 (Schema additions):** MSG-1, SC-1 (add columns), DOCS-1, FEED-1 — all new tables + schema changes
3. **Phase 3 (Services):** MSG-2, DOCS-2/3, FEED-2 — new service methods
4. **Phase 4 (API routes):** MSG-3 through MSG-8, STMT-2/3/4/5, SC-2/3/5, DOCS-4/5, FEED-4/5 — route registration
5. **Phase 5 (UI):** MSG-9, MSG-10, SC-5, STMT client-side download button
