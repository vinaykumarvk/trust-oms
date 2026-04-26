# Adversarial Evaluation: MSG (Client Messaging) + FEED (Feed Health) Modules

**Modules Under Review:** MSG — Client Messaging System; FEED — Feed Health Registry with Override
**Date:** 2026-04-25
**Evaluator Framework:** Proponent / Opponent / Judge (5-round adversarial debate)

---

## 1. Executive Summary

This report evaluates two Phase 5 infrastructure modules added to TrustOMS Philippines: a bidirectional client-RM messaging system (MSG) backed by a `client_messages` PostgreSQL table with 60-second React Query polling for unread counts, and a feed health monitoring system (FEED) backed by an in-memory registry seeded from `feed_health_snapshots` on startup with a `GET /feed-health` endpoint served entirely from process memory.

After five rounds of rigorous adversarial debate, the Judge issues a verdict of **APPROVE WITH CONDITIONS**. Both modules demonstrate sound architectural intent appropriate for a Phase 1 trust operations platform, but each carries specific risks that must be addressed before production deployment at scale.

**MSG module** requires conditions on: (1) polling strategy replacement or augmentation with server-sent events, (2) database indexing enforcement for the unread-count query, (3) thread isolation enforcement (IDOR prevention between clients), (4) SR cross-reference linkage design, and (5) a formal retention and archival policy.

**FEED module** requires conditions on: (1) mandatory expiry TTL on OVERRIDE_UP/OVERRIDE_DOWN states, (2) a startup DB hydration mechanism to avoid amnesia after server restart, (3) removal of the OVERRIDE_UP/OVERRIDE_DOWN states from the in-memory-only `FeedHealthEntry` interface (since the current schema.ts has no corresponding enum values and they appear only in the module description), and (4) an explicit ops runbook for override lifecycle.

Combined, the modules are implementable and deliverable within the Trust OMS architecture, but the five conditions listed above represent genuine production risks that must be resolved in the next sprint.

---

## 2. Proposal Description

### 2.1 MSG — Client Messaging System

**Storage layer:** A `client_messages` PostgreSQL table with the following structure:
- `sender_id` (integer FK to users)
- `sender_type` (enum: RM / CLIENT / SYSTEM)
- `recipient_client_id` (integer FK to clients)
- `subject` (text)
- `body` (text)
- `is_read` (boolean, default false)
- `thread_id` (UUID or integer, for grouping)
- `parent_message_id` (self-referential FK for threading)
- `read_at` (timestamp)

**Client portal API endpoints:**
- `GET /messages` — paginated inbox list for the authenticated client
- `POST /messages` — client sends a new message to their assigned RM
- `PATCH /messages/:id/read` — mark a specific message as read (sets `is_read=true`, `read_at=now()`)
- `GET /messages/unread-count` — returns integer count of unread messages for the client

**Back-office API endpoints:**
- `GET /client-messages` — RM inbox, lists messages from all assigned clients
- `POST /client-messages/:id/reply` — RM posts a reply to a specific client message

**Frontend behavior:** The client portal sidebar refreshes the unread count badge every 60 seconds via React Query polling (`refetchInterval: 60000`). The current `apps/client-portal/src/pages/messages.tsx` implementation is a fully client-side stub with hardcoded initial messages and no API integration — the server-side schema and routes described above represent the intended production architecture.

### 2.2 FEED — Feed Health Registry with Override

**Storage layer:** A `feed_health_snapshots` PostgreSQL table with the following columns:
- `feed_name` (text, name of the external data feed, e.g. BLOOMBERG, REUTERS, DTCC, PDTC, SWIFT)
- `health_score` (integer 0–100)
- `status` (enum: UP / DEGRADED / DOWN / OVERRIDE_UP / OVERRIDE_DOWN)
- `failure_count` (integer)
- `last_error` (text, nullable)
- `override_by` (text, nullable, user who set the override)
- `override_reason` (text, 10–500 chars when present)

**Startup behavior:** On server startup, the system loads the most recent snapshot per feed from `feed_health_snapshots` into an in-memory `feedHealthRegistry` Map (keyed by feed name). The existing `degradedModeService.ts` shows the operational pattern: a `Map<string, FeedHealthEntry>` initialized with hardcoded baseline values (BLOOMBERG, REUTERS, DTCC, PDTC, SWIFT) at module load time with health scores of 100. The `updateFeedHealth()` function mutates this map in-place.

**API surface:**
- `GET /feed-health` — returns current feed health status served entirely from in-memory registry (no DB query per request); protected by `requireBackOfficeRole()`
- Override endpoint (BO_HEAD/ADMIN only) — sets OVERRIDE_UP or OVERRIDE_DOWN on a named feed with a mandatory 10–500 character reason; logged to an audit table

**EOD integration:** A `feed_health_check` job runs in the DAG-based EOD orchestrator, calling `degradedModeService.checkFeedHealth()` which evaluates the in-memory registry and triggers automatic feed switches when primary feeds drop below the configurable health threshold (default 80).

---

## 3. Debate Transcript

### Round 1: Opening Arguments

**PROPONENT:**

Both MSG and FEED are lean, well-scoped additions that close genuine operational gaps in TrustOMS Philippines without over-engineering for Phase 1.

On MSG: The relational database table approach for client messages is the correct choice for a regulated trust operations environment. Unlike external messaging platforms (Twilio Conversations, AWS Connect, Zendesk), a PostgreSQL table gives us first-class participation in the existing Drizzle ORM ecosystem, automatic inclusion in data retention sweeps, BSP audit trail compliance, and zero additional vendor contracts. The data is co-located with the client record it belongs to, enabling future JOIN queries for compliance reporting (e.g., "show me all messages sent within 30 days of a major portfolio event"). The 60-second polling interval is appropriate for a business-hours messaging context — this is not a chat app, it is asynchronous advisor communication where a 60-second latency is operationally acceptable.

On FEED: The hybrid in-memory-plus-DB-snapshot pattern is elegantly suited to the performance requirement of `GET /feed-health`. Feed health dashboards are polled frequently by monitoring systems; adding a DB round-trip per poll would create unnecessary load on the primary PostgreSQL instance for data that changes rarely and should already be loaded into memory. The snapshot table provides durability and auditability without coupling the hot read path to the database. The override mechanism with a mandatory 10–500 character reason and BO_HEAD/ADMIN restriction is an exemplary safety pattern — it prevents unauthorized state manipulation while allowing legitimate operational overrides during vendor maintenance windows.

Both modules follow existing TrustOMS architectural patterns exactly: `requireBackOfficeRole()` guards, Drizzle ORM for persistence, React Query for data synchronization, and the existing EOD orchestrator integration for batch health checks. These are production-ready patterns proven elsewhere in the codebase.

**OPPONENT:**

Both modules have fundamental design problems that will manifest as production incidents.

On MSG — the 60-second polling creates a DB load problem at scale that the proponent is dismissing too casually. Each active client session executes `SELECT COUNT(*) FROM client_messages WHERE recipient_client_id = $1 AND is_read = false` every 60 seconds. If TrustOMS has 500 simultaneous client portal sessions (plausible for a Philippine bank trust department serving retail clients), that is 500 COUNT queries per minute — 8.3 per second — hitting a shared PostgreSQL instance that is also running EOD batch jobs, NAV ingestion, settlement processing, and fee accrual. This is not a hypothetical concern; COUNT(*) with a WHERE clause on a growing table without a composite index on `(recipient_client_id, is_read)` degrades from O(index scan) to O(full table scan) as the message table grows. The proponent claims 60 seconds is acceptable latency — I challenge that assertion. The existing service request sidebar already polls at 60 seconds (`refetchInterval: 60000` in `ClientPortalLayout.tsx`). Adding a second 60-second poll from the same layout component doubles the query frequency from each session with zero architectural benefit.

Furthermore, the current implementation in `messages.tsx` is entirely a client-side stub with hardcoded data and no API integration at all. The "production architecture" described in the proposal exists only on paper. The stub sends no HTTP requests, maintains no server state, and fires no real-time updates. This means the unread-count badge in the sidebar (referenced in the module description) is also not wired up — the badge in `ClientPortalLayout.tsx` uses only the service request action count query. The MSG module as currently committed is a UI mockup, not a delivered feature.

On FEED — the in-memory registry pattern has a critical operational failure mode: server restart causes complete amnesia. When the Node.js process restarts (deployment, crash recovery, OOM kill), the `feedHealthRegistry` Map re-initializes to all feeds at health score 100, status UP. Any OVERRIDE_DOWN states set by operators to mark a known-bad feed are silently lost. The next EOD health check will see a healthy feed and potentially route live market data through a feed the operations team had manually overridden as DOWN. This is a data integrity risk for pricing and NAV calculations.

The OVERRIDE_UP and OVERRIDE_DOWN states are described in the proposal but they do not appear in the existing `degradedModeService.ts` `FeedHealthEntry` interface, which uses only UP / DEGRADED / DOWN. There is a gap between the specification and the implementation — the override states are referenced in the feature description but the in-memory type system cannot represent them, and the snapshot table schema does not yet exist in `packages/shared/src/schema.ts`. The feature is partially designed.

**JUDGE:**

Both sides have landed legitimate points in round 1. I note the following as credible concerns requiring deeper examination:

1. The COUNT query scalability issue at 500+ sessions is a real concern, not a hypothetical.
2. The server-restart amnesia for OVERRIDE states is a genuine operational gap.
3. The stub-vs-production gap in messages.tsx must be clarified — is this an evaluation of the proposed architecture or the currently committed code?
4. The missing composite index on `(recipient_client_id, is_read)` would be critical for the polling query.

Round 1 goes to the Opponent on technical depth, but the Proponent's core architectural choices remain defensible.

---

### Round 2: Rebuttal

**PROPONENT:**

I accept the opponent's point that messages.tsx is currently a stub, but I reject the characterization that this invalidates the architecture evaluation. This evaluation is of the proposed design — the table schema, API routes, and frontend integration pattern — not the maturity of the current commit. The stub is the correct Phase 1 approach: validate the UX pattern before wiring up the backend. The architecture is sound.

On the 60-second poll load: the opponent correctly identifies that COUNT(*) can be slow on a large table without an index, but this is a solved problem. A composite index `CREATE INDEX idx_messages_unread ON client_messages(recipient_client_id, is_read) WHERE is_read = false` (a partial index covering only unread messages) makes this query O(1) regardless of table size. With that index, the query cost per poll is approximately 0.1ms — 500 sessions × 8.3/second = negligible overhead. The opponent's concern about double-polling (messages + service requests) is valid, but both polling intervals should be measured against the actual DB connection pool capacity, not assumed to be additive problems.

On the FEED restart amnesia: the proposal explicitly states the system loads "the most recent snapshot per feed from `feed_health_snapshots` into the in-memory registry on startup." Therefore, if OVERRIDE states are written to the snapshot table before a restart, they will be restored on startup. The opponent is attacking a missing implementation detail, not a design flaw. The design intent is correct — the startup hydration from DB is the safety net.

On OVERRIDE_UP/OVERRIDE_DOWN types: the proponent acknowledges that the current `FeedHealthEntry` interface in `degradedModeService.ts` does not have these states — this is a pre-existing implementation gap, not a design rejection of the approach.

**OPPONENT:**

The proponent's rebuttal introduces a partial index as the solution to the polling load, but this assumes the index will be created and maintained. Looking at the actual schema.ts file, the `client_messages` table does not yet exist. There is no migration, no index definition, and no enforcement mechanism. The proponent is proposing a future index as the answer to a current gap. This is exactly the kind of "we'll add it later" technical debt that causes production incidents.

The proponent says "the startup hydration from DB is the safety net" — but the current `degradedModeService.ts` does NOT implement startup hydration from the database. The registry is initialized with hardcoded values at module load time (lines 42-48):

```typescript
const feedHealthRegistry = new Map<string, FeedHealthEntry>([
  ['BLOOMBERG', { ..., healthScore: 100, status: 'UP', ... }],
  ['REUTERS',   { ..., healthScore: 100, status: 'UP', ... }],
  ...
]);
```

There is no `await db.select().from(schema.feedHealthSnapshots)` on startup. The DB hydration is specified but not implemented. This means the restart-amnesia problem is real and present in the current code, not a hypothetical. Every server restart resets all feeds to UP/100 regardless of what was in the database.

Furthermore, the FEED override endpoint with a 10–500 character reason requirement has no expiry mechanism. An OVERRIDE_DOWN set on a Friday evening for a weekend maintenance window will still be active on Monday morning unless manually cleared. In a regulated environment with weekend skeleton staff, a forgotten override that keeps a primary market data feed marked as DOWN could cause incorrect pricing, failed NAV calculations, and missed settlement instructions. There is no TTL, no expiry, no automated alert for overrides older than N hours.

**JUDGE:**

The rebuttal round has sharpened the gap between design intent and current implementation on both modules. Key findings:

- The partial index solution for MSG is architecturally correct but not implemented — this is a pre-deployment requirement, not a design flaw.
- The startup hydration gap in FEED is a genuine code-level deficiency. The proponent's defense relies on a feature that does not exist in the code.
- The OVERRIDE expiry gap is a legitimate operational risk the proponent did not rebut.

Round 2 goes to the Opponent. The burden of proof for production readiness lies with the implementation, not with the design intent.

---

### Round 3: Deep Dive

**PROPONENT — MSG Deep Dive:**

Let me address the five key questions from the brief in turn.

**Q1: Is a relational DB table the right storage for client messages?**

Yes, for Phase 1 of a regulated trust platform. The alternatives are: (a) an external messaging platform (Twilio Conversations, Intercom, Zendesk), or (b) a message queue / notification service (SNS, SQS, RabbitMQ). External platforms introduce vendor lock-in, additional data residency compliance requirements (BSP data localization rules require PH-resident data), and a second authentication plane for client identity. Message queues are appropriate for event streams, not for asynchronous advisor communication that must be queried by date range, searched by subject, linked to service requests, and exported for regulatory review. A PostgreSQL table with proper indexing and full-text search capability is the best fit. It participates natively in the existing Drizzle ORM data model, can be JOIN-ed with client, portfolio, and service-request tables for compliance reporting, and requires no additional infrastructure.

**Q2: Will 60-second polling create DB load problems?**

With a partial index on `(recipient_client_id, is_read) WHERE is_read = false`, the answer is no for expected scale. A Philippine trust bank client portal typically serves hundreds, not tens of thousands, of concurrent users. At 500 sessions polling every 60 seconds, the query rate is 8.3/second, each taking ~0.1ms with proper indexing — a total of 0.83ms/second of DB time, which is negligible relative to the EOD batch workload. However, a better long-term architecture would be WebSocket or Server-Sent Events (SSE) for the unread-count badge, eliminating polling entirely. This should be a Phase 2 enhancement.

**Q5: Should Phase 1 messages support file attachments?**

No. Text-only with cross-reference to SR documents (via a future `related_sr_id` FK column) is correct for Phase 1. File attachment support requires: (1) file storage infrastructure (S3/MinIO), (2) virus scanning pipeline, (3) download authorization checks (prevent cross-client file access), (4) storage quota management, and (5) malware scanning. These are non-trivial additions. The cross-reference pattern — where a message body contains "Please see Service Request SR-2026-0042 for the attached mandate change documents" — gives clients visibility into related documents without the file storage overhead. Phase 2 can introduce attachments once storage infrastructure is proven.

**OPPONENT — FEED Deep Dive:**

**Q3: Is the hybrid in-memory + DB-snapshot approach appropriate?**

The approach is appropriate in concept but the implementation has three concrete gaps:

First, the startup hydration is not implemented. The registry always starts from hardcoded values. This violates the stated design.

Second, there is no write-back mechanism from the EOD health check to the snapshot table. The `checkFeedHealth()` function in `degradedModeService.ts` updates the in-memory registry but does not persist the new health scores to `feed_health_snapshots`. This means the snapshot table will remain stale (reflecting only the initial override values, not the live health scores computed during EOD runs). The DB has no useful data to hydrate from even if startup hydration were implemented.

Third, the `feed_health_snapshots` table does not exist in `packages/shared/src/schema.ts`. There is a `feedRouting` table in the schema (registered in `back-office/index.ts` as a CRUD endpoint), but no snapshots table. The proposed architecture references a table that has not been defined in the ORM.

**Q4: Do OVERRIDE states need time-limited expiry?**

Yes, emphatically. The pattern of manual overrides without expiry in a production financial system is a known incident vector. A common scenario: an operator sets OVERRIDE_DOWN on the BLOOMBERG feed at 18:00 on a Friday during planned maintenance. The maintenance completes at 21:00. The operator forgets to clear the override (skeleton staff, it's end of week). On Saturday morning, the automated feed health check sees BLOOMBERG as OVERRIDE_DOWN and routes all pricing data to REUTERS. If REUTERS has a higher latency or data quality issue on that day, pricing calculations are silently degraded. No alert fires because the override was explicitly set by a human — the system assumes it's intentional.

The minimum viable safety mechanism is: an `override_expires_at` timestamp field, defaulting to `now() + 24 hours`, with an automated job (run every 15 minutes or as part of the EOD feed_health_check job) that clears any expired overrides and logs the clearance to the audit trail. BO_HEAD/ADMIN can extend the expiry explicitly if needed.

**JUDGE — Deep Dive Assessment:**

The proponent's Q1 and Q5 answers are well-reasoned and I accept them. The DB-table approach for messages is appropriate for this context. Text-only Phase 1 is justified.

The opponent's three concrete gaps in the FEED implementation are damning:
1. No startup hydration (implementation gap, not design gap)
2. No write-back from EOD check to snapshot table (data integrity gap)
3. The `feed_health_snapshots` table does not exist in schema.ts (implementation gap)

The override expiry argument is compelling and well-illustrated. A mandatory `override_expires_at` with 24-hour default is a reasonable, low-effort safety mechanism.

Round 3 is a split: Proponent wins on MSG rationale (Q1, Q5), Opponent wins on FEED implementation gaps and override expiry.

---

### Round 4: Evidence and Alternatives

**PROPONENT — Evidence from Codebase:**

The 60-second polling pattern is already established and proven in the client portal layout. Reviewing `ClientPortalLayout.tsx` line 70-76, the existing service request action count polling uses exactly this pattern:

```typescript
const { data: actionCountData } = useQuery({
  queryKey: ["sr-action-count", clientId],
  queryFn: () => fetch(`/api/v1/client-portal/service-requests/action-count/${clientId}`, ...),
  refetchInterval: 60000,
});
```

This is not a new pattern being introduced by MSG — it is an extension of an existing, deployed pattern. The architectural coherence argument is strong: adding a second `useQuery` with the same `refetchInterval` on the messages unread count follows the same pattern the codebase already validates.

The feed health in-memory pattern is also well-precedented in the codebase. The `circuit-breaker.ts` service (lines 106-113) maintains a named circuit breaker registry entirely in memory:

```typescript
const registry = new Map<string, CircuitBreaker>();
export function getBreaker(name: string, ...): CircuitBreaker { ... }
```

The circuit breaker state — which can be CLOSED, OPEN, or HALF_OPEN — is also not persisted to the database and also resets to CLOSED on restart. This is accepted practice in the codebase for operational state that should self-heal. The FEED registry follows the same pattern with the same tradeoffs explicitly understood.

The `notificationInboxService.ts` (for CRM notifications) also uses the COUNT(*) pattern without concern:

```typescript
async getUnreadCount(userId: number): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.crmNotifications)
    .where(and(
      eq(schema.crmNotifications.recipient_user_id, userId),
      eq(schema.crmNotifications.is_read, false),
    ));
  return count;
}
```

This exact same query structure is already serving the back-office notification system. The MSG unread count query is architecturally identical. If it's acceptable for CRM notifications, it's acceptable for client messages.

**OPPONENT — Alternatives Analysis:**

**MSG Alternative 1: Server-Sent Events (SSE)**

Instead of 60-second polling, a `GET /messages/unread-stream` endpoint using SSE (`Content-Type: text/event-stream`) would push unread count updates to clients only when a new message arrives. The server emits an event when an RM posts a reply (`POST /client-messages/:id/reply`). Benefits: eliminates 500 polling queries per minute, sub-second latency for new message notification, significantly reduced DB load. Costs: requires sticky sessions or a shared event broker (Redis pub/sub) in a multi-process deployment, and adds complexity to the auth flow (SSE connections must maintain authentication across the long-lived HTTP connection). For Phase 2, this is the right answer.

**MSG Alternative 2: Long Polling**

A hybrid approach: `GET /messages/unread-count` with a 20-second server-side timeout, returning immediately if the count changes or after timeout if unchanged. This is simpler than SSE, requires no infrastructure changes, and reduces query frequency from 8.3/second to approximately 2/second with 500 sessions — a 75% reduction. This is implementable within the existing Express/React Query stack today.

**FEED Alternative 1: Fully DB-Backed with Redis Cache**

Every `GET /feed-health` request hits Redis (with 5-second TTL) backed by PostgreSQL. On cache miss, read from DB. Override writes invalidate the cache. Benefits: survives process restart with full state fidelity, no amnesia problem. Costs: requires Redis infrastructure, adds operational complexity. For a Phase 2 deployment expecting high monitoring poll frequency, this is the right architecture.

**FEED Alternative 2: Materialized View**

Use a PostgreSQL materialized view `feed_health_current` that selects the most recent snapshot per feed. The override endpoint updates the snapshots table directly. Refresh the view every 30 seconds via a pg_cron job. `GET /feed-health` queries the materialized view — read-only, fast. Override persistence is automatic. No in-memory drift. Costs: requires pg_cron extension, adds schema complexity.

**FEED Alternative 3: Write-Through Cache (minimal change)**

Keep the current in-memory registry but add: (a) a startup hydration query (`SELECT DISTINCT ON (feed_name) * FROM feed_health_snapshots ORDER BY feed_name, created_at DESC`), and (b) a write-back call whenever `updateFeedHealth()` is invoked. This is the minimum viable fix for the amnesia and stale-snapshot problems. It requires approximately 20 lines of code change to `degradedModeService.ts`.

The write-through option (Alternative 3) is the recommended pragmatic path for Phase 1: low effort, no new infrastructure, closes the implementation gaps identified in Round 3.

**JUDGE — Evidence Assessment:**

The proponent's codebase evidence strengthens the case for MSG significantly. The COUNT(*) pattern in `notificationInboxService.ts` and the existing 60-second poll in the layout are direct precedents that cannot be dismissed. The proponent has demonstrated architectural consistency, not architectural novelty.

The opponent's alternative analysis is well-structured. For MSG, SSE is clearly the right long-term direction but the bar for Phase 1 is met by polling + proper indexing. For FEED, the write-through cache (Alternative 3) is the correct pragmatic recommendation — it closes both the amnesia and stale-data gaps with minimal change.

On the circuit breaker parallel: the proponent is correct that the codebase already accepts in-memory-only state for the circuit breaker registry. However, circuit breaker state is designed to self-heal (OPEN → HALF_OPEN → CLOSED automatically), whereas OVERRIDE states are explicitly intentional and should not self-clear. This distinction matters — the parallel is not exact.

Round 4 is even: both sides presented strong evidence. The alternative paths for FEED are actionable and well-prioritized.

---

### Round 5: Closing Arguments

**PROPONENT:**

Both MSG and FEED are Phase 1 features that deliberately scope themselves to deliver value without over-engineering. The architectural decisions — relational DB for messages, in-memory registry for feed health — are appropriate for the deployment scale, team size, and timeline of TrustOMS Philippines. They follow established patterns in the codebase and avoid introducing new infrastructure dependencies.

The implementation gaps identified by the opponent are real but they are pre-deployment checklist items, not fundamental design rejections. They can be closed in the same sprint:

- Add the `client_messages` table to `schema.ts` with the partial index
- Add startup hydration to `degradedModeService.ts` (~10 lines)
- Add write-back on `updateFeedHealth()` (~5 lines)
- Add `override_expires_at` field to the snapshot table schema
- Add a cleanup sweep in the EOD `feed_health_check` job

None of these require architectural rethinking. The core design is correct and the path to production readiness is clear.

The MSG module provides a communication channel that trust clients genuinely need — direct, auditable, advisor-mediated messaging that is integrated with their portfolio data and accessible within the same authenticated session they use for everything else. External messaging platforms cannot provide this integration. The FEED module provides operations staff with a reliable, low-latency dashboard for critical market data feed health — the query-free hot read path is a real performance benefit, not premature optimization.

I recommend approval with the implementation conditions specified above.

**OPPONENT:**

I maintain that both modules have non-trivial production risk that must be addressed before go-live, and I want to ensure the conditions in the final verdict are specific and unambiguous.

For MSG, the critical risks in priority order are:

1. **IDOR (Insecure Direct Object Reference)**: The `PATCH /messages/:id/read` endpoint must verify that the message with `:id` belongs to the authenticated client. Without this check, a client who knows (or guesses) another client's message ID can mark it as read. The `POST /client-messages/:id/reply` BO endpoint must verify that the message belongs to a client in the RM's assigned portfolio. These authorization checks are not visible in the current stub and must be explicitly implemented.

2. **Missing index**: The `(recipient_client_id, is_read)` partial index must be created in the same migration that creates the `client_messages` table. It must not be deferred.

3. **Thread isolation**: The `thread_id` and `parent_message_id` columns create a threading model. A client must not be able to retrieve messages in a thread that includes messages directed to a different client. The `GET /messages` endpoint must filter strictly by `recipient_client_id = authenticated_client_id`.

4. **Retention policy**: Messages contain personally identifiable information (client name in sender context) and potentially investment advice. BSP Circular 808 and PDPA require documented retention periods. The `client_messages` table must have a retention policy (recommended: 7 years, consistent with the rest of the platform).

For FEED, the critical risks in priority order are:

1. **Startup hydration is missing**: Must be implemented before production deployment. Server restart must not reset operational overrides.

2. **No write-back**: Every call to `updateFeedHealth()` must persist the new score to `feed_health_snapshots` so the DB and in-memory state remain synchronized.

3. **Override expiry**: `override_expires_at` must default to `now() + 24 hours`. An automated clearance job must run at least hourly.

4. **`feed_health_snapshots` schema**: The table does not exist in `schema.ts` and must be added with a proper Drizzle ORM table definition before the override endpoint can function.

I do not recommend rejection — the architectural approach is sound — but I strongly recommend that the conditions above be treated as P0 blockers for the production release of these modules, not as post-release enhancements.

**JUDGE:**

Both closing arguments are well-structured. The proponent correctly characterizes the gap between design intent and current implementation as a pre-deployment checklist. The opponent correctly identifies that the checklist items are non-trivial and include at least one security item (IDOR) that qualifies as a P0 blocker.

The debate has produced a clear, actionable set of conditions. The architectural foundation of both modules is approved; the conditions below are required for production readiness.

---

## 4. Scoring Summary

| Round | Topic | Proponent Score | Opponent Score | Winner |
|-------|-------|-----------------|----------------|--------|
| Round 1: Opening | Core architectural choices | 6/10 | 8/10 | Opponent |
| Round 2: Rebuttal | Index solution vs. startup hydration gap | 7/10 | 8/10 | Opponent |
| Round 3: Deep Dive | MSG rationale (Q1, Q5) + FEED gaps | 7/10 | 7/10 | Draw |
| Round 4: Evidence & Alternatives | Codebase precedents vs. concrete alternatives | 8/10 | 8/10 | Draw |
| Round 5: Closing | Conditions specificity and prioritization | 8/10 | 9/10 | Opponent |
| **Total** | | **36/50** | **40/50** | **Opponent** |

**Overall Assessment:** The Opponent wins the debate on technical depth and implementation gap identification. However, winning the debate does not mean rejecting the proposal — the Proponent's core architectural choices are sound and the path to production readiness is clear.

**Rationale for "Approve with Conditions" rather than "Needs More Information":** The five conditions are all implementable within a single sprint by the existing team. The design intent is clearly specified. The risks are identified and bounded. Requesting more information would delay delivery without producing new architectural clarity.

---

## 5. Key Risks (Ranked)

### MSG Module Risks

**Risk MSG-01: IDOR on message ownership (Severity: CRITICAL)**
The `PATCH /messages/:id/read` and `GET /messages` endpoints must enforce client-scoped authorization. Without ownership validation, any authenticated client portal user with knowledge of a message ID can mark another client's message as read or retrieve it. Given that client IDs are sequential integers (common in the schema), this is a trivially exploitable vulnerability. Consistent with the SEC-07 IDOR pattern already fixed in proposal routes (commit `a213a66`), this must be treated as P0.

**Risk MSG-02: Missing `(recipient_client_id, is_read)` index (Severity: HIGH)**
Without the partial index, the 60-second unread-count poll degrades from O(index scan) to O(full table scan) as message volume grows. On a platform with 1,000 clients each with 50 messages, a full scan of 50,000 rows every 60 seconds from 500 sessions creates 25 million row-reads per minute — manageable on fast hardware but a predictable performance cliff. This must be included in the initial migration.

**Risk MSG-03: Thread isolation — cross-client message visibility (Severity: HIGH)**
The `thread_id` column groups messages into conversation threads. If a RM-initiated thread branches to multiple clients (e.g., a group advisory message), the `GET /messages` query must not expose thread members to each other. The current stub has no threading logic; the production implementation must explicitly filter by `recipient_client_id` at the row level, not the thread level.

**Risk MSG-04: No SR cross-reference linkage (Severity: MEDIUM)**
The module description lacks a `related_sr_id` FK column. Messages that reference service requests cannot be linked without this column, forcing clients to search for related SRs by date and subject. Adding this column in Phase 1 (even if nullable) avoids a breaking schema migration later.

**Risk MSG-05: No retention/archival policy (Severity: MEDIUM)**
Messages contain PII (client identity implicit in `recipient_client_id`), investment advice content (body), and potentially regulatory communications (SYSTEM sender_type). BSP Circular 808 Section 5 requires 7-year retention of client-facing communications. A retention policy must be documented and enforced (soft-delete with `is_deleted` + `deleted_at` + a purge job at year 7+).

**Risk MSG-06: Double polling from same layout component (Severity: LOW)**
`ClientPortalLayout.tsx` already polls service request action counts at 60-second intervals. Adding a second 60-second poll for message unread counts from the same component doubles the per-session query frequency. At moderate scale this is acceptable, but it sets a precedent for badge-count proliferation. A consolidated `/client/badge-counts` endpoint returning all counts in one query would be more efficient.

### FEED Module Risks

**Risk FEED-01: Server restart clears all override states (Severity: HIGH)**
The `feedHealthRegistry` Map is initialized from hardcoded values, not from the database, on every process start. An OVERRIDE_DOWN state set by an operator is lost on any restart (deployment, crash, OOM kill). The next automatic health check after restart will route traffic back through a feed the operator had explicitly marked as down. This risk is present in the current code and must be fixed by implementing startup hydration.

**Risk FEED-02: No override expiry — forgotten overrides cause silent data quality degradation (Severity: HIGH)**
An OVERRIDE_DOWN on a primary market data feed without expiry can persist across days or weeks if the clearing operator is unavailable. During this time, the system silently uses secondary feeds with potentially different latency, data quality, or coverage characteristics. For NAV calculations, pricing, and settlement processing, this is a data integrity risk. An `override_expires_at` field with 24-hour default is the minimum viable safeguard.

**Risk FEED-03: `feed_health_snapshots` table not in schema.ts (Severity: HIGH)**
The override endpoint cannot function without the snapshot table. The table must be defined in `packages/shared/src/schema.ts` using Drizzle ORM before any override functionality is deployed. Without it, the override endpoint has no persistence layer and any overrides are lost on restart.

**Risk FEED-04: No write-back from updateFeedHealth() to DB (Severity: MEDIUM)**
`updateFeedHealth()` in `degradedModeService.ts` modifies the in-memory registry but does not write to `feed_health_snapshots`. Even if startup hydration were implemented, the DB would reflect only the last explicit override, not the live health scores computed by the EOD feed health check job. DB queries for historical feed health analysis would be misleading.

**Risk FEED-05: Feed registry accepts hardcoded feed names only (Severity: MEDIUM)**
The feedHealthRegistry is initialized with exactly 5 feeds: BLOOMBERG, REUTERS, DTCC, PDTC, SWIFT. `updateFeedHealth()` silently ignores unknown feed names (`if (!entry) return`). If a new feed is added (e.g., PSE data feed for Philippine equities) without updating the hardcoded initialization, the system will never track its health. The registry initialization should be driven by configuration or by loading feed names from the `feedRouting` table in `schema.ts`, which already exists and is managed via CRUD endpoints.

**Risk FEED-06: Override audit log not specified (Severity: LOW)**
The module description mentions "logged to an audit table" for overrides, but no audit table structure is specified and no existing audit pattern (e.g., the `auditLogger` used elsewhere) is referenced. The audit requirement is present but the implementation path is unspecified.

---

## 6. Key Benefits (Ranked)

### MSG Module Benefits

**Benefit MSG-B1: Auditable advisor-client communication in the regulatory record**
All messages are stored in PostgreSQL with timestamps, sender identity, and recipient identity. This gives BSP examiners a complete, queryable record of all advisor-client communications — a regulatory requirement that external messaging platforms would require complex data extraction pipelines to satisfy.

**Benefit MSG-B2: Zero additional infrastructure or vendor dependencies**
The relational table approach requires no external message broker, no vendor API keys, no additional authentication plane. It deploys entirely within the existing Trust OMS stack — a material advantage for a Phase 1 deployment where infrastructure cost and complexity must be minimized.

**Benefit MSG-B3: Native JOIN capability with portfolio and SR data**
Because messages are in the same database as portfolios, service requests, and client records, future reports ("show all messages within 30 days of a portfolio allocation change") are trivial SELECT + JOIN queries. This is impossible with external platforms without expensive ETL pipelines.

**Benefit MSG-B4: Consistent UX within the client portal session**
Clients interact with their messages in the same authenticated session, same UI design language, and same dark-mode theme as the rest of the portal. No context switch to an external chat widget, no re-authentication, no separate notification channel.

**Benefit MSG-B5: SYSTEM sender_type enables automated client communications**
The `sender_type: SYSTEM` value allows the back-office to send automated notifications (statement ready, contribution received, risk profile expiry) via the message thread. This creates a single inbox for all advisor and system communications, improving client experience versus scattered email + in-portal notifications.

### FEED Module Benefits

**Benefit FEED-B1: Zero-latency feed health dashboard**
Serving `GET /feed-health` from the in-memory registry means operations staff see the current feed status with no DB round-trip latency. For a monitoring dashboard that may be refreshed frequently during market hours, this is a genuine performance benefit.

**Benefit FEED-B2: Explicit override mechanism with reason capture**
The mandatory 10–500 character reason requirement for overrides creates an implicit runbook — operators must articulate why they are overriding a feed's status. This reduces careless overrides and creates an audit trail of operational decisions. The BO_HEAD/ADMIN restriction is appropriate for a control that can affect market data routing.

**Benefit FEED-B3: EOD integration for automated failover**
The `feed_health_check` EOD job integrates feed health monitoring with the existing DAG-based orchestration, enabling automatic failover (e.g., BLOOMBERG → REUTERS) when health scores drop below threshold, with 5-minute cooldown to prevent flapping. This is a mature operational pattern (comparable to AWS Route 53 health check failover) implemented natively in the existing infrastructure.

**Benefit FEED-B4: Feed switch history for post-incident analysis**
The `feedSwitchHistory` in-memory array (last 20 switches) and DB-backed `degradedModeLogs` provide an audit trail for post-incident analysis: "When did we switch away from DTCC? What was the health score? Was there an open incident?" This supports the BRD RPO/RTO targets (1-hour RPO, 4-hour RTO).

**Benefit FEED-B5: Configuration-driven thresholds**
`FEED_HEALTH_THRESHOLD` (default 80) and `FEED_SWITCH_COOLDOWN_MS` (default 5 minutes) are named constants that can be tuned without code changes if exposed via system configuration. The override endpoint supplements these thresholds for situations where the automated score does not reflect operational reality.

---

## 7. Alternative Approaches

### MSG Alternatives

**Alternative MSG-A1: WebSocket / Server-Sent Events for unread count (Recommended for Phase 2)**
Replace the 60-second React Query poll with a server-sent events stream on `GET /messages/events`. The server pushes an `unread_count` event whenever an RM posts a reply via `POST /client-messages/:id/reply`. Benefits: sub-second latency for new message notification, eliminates polling DB load. Implementation cost: medium (requires SSE endpoint, auth persistence on long-lived connection). Recommended as the Phase 2 upgrade path.

**Alternative MSG-A2: Consolidated badge-count endpoint**
Instead of individual polling calls for service request action count and message unread count, introduce `GET /client-portal/badge-counts` that returns `{ sr_action_count: N, message_unread_count: M }` in one query. Both counts can be computed in a single round-trip with two subqueries. This halves the polling frequency from the client portal layout at no architectural cost.

**Alternative MSG-A3: External messaging platform (SendGrid Inbound, Intercom, Freshdesk)**
For a future phase where TrustOMS serves tens of thousands of clients, an external platform may be more appropriate. However, for Phase 1 with a Philippine trust bank client base of hundreds to low thousands of clients, the complexity and compliance overhead (data residency, API key management, separate authentication) outweighs the benefit. This is a Phase 3+ consideration.

### FEED Alternatives

**Alternative FEED-A1: Write-through cache with startup hydration (Recommended immediate fix)**
Keep the current in-memory registry but add two changes: (1) a startup hydration query that reads the most recent snapshot per feed from `feed_health_snapshots` on service initialization, and (2) a write-back call in `updateFeedHealth()` that persists the new score and status to the snapshots table. Estimated implementation: ~30 lines of code. This closes both the restart-amnesia and stale-data gaps without new infrastructure.

**Alternative FEED-A2: Redis cache with PostgreSQL backing**
Use Redis as the primary store for the feed health registry with a 30-second TTL. Override writes invalidate the cache and write through to PostgreSQL. On TTL expiry, the cache is refreshed from DB. Benefits: survives process restart, supports multi-instance deployments (horizontal scaling). Costs: requires Redis infrastructure, adds operational complexity. Recommended for Phase 2 if the platform scales to multi-instance deployment.

**Alternative FEED-A3: PostgreSQL materialized view**
Define a `feed_health_current` materialized view (`SELECT DISTINCT ON (feed_name) * FROM feed_health_snapshots ORDER BY feed_name, snapshot_at DESC`). Refresh every 60 seconds via `REFRESH MATERIALIZED VIEW CONCURRENTLY`. `GET /feed-health` queries the view. Benefits: no in-memory drift, survives restart, no new infrastructure. Costs: requires pg_cron or a scheduled job, view refresh adds minor DB load, concurrent refresh requires a unique index. Viable alternative to the write-through cache for teams that prefer DB-native solutions.

**Alternative FEED-A4: Feed registry driven by `feedRouting` table**
Instead of hardcoding BLOOMBERG, REUTERS, DTCC, PDTC, SWIFT in the registry initialization, load feed names from `schema.feedRouting` at startup. This eliminates the silent-ignore problem for new feeds and aligns the registry with the existing CRUD-managed feed configuration. When a new feed is added via the `POST /api/v1/back-office/feed-routing` endpoint, it automatically appears in the health registry on next restart.

---

## 8. Final Verdict

### Verdict: APPROVE WITH CONDITIONS

Both MSG and FEED modules are approved for continued development toward production deployment, subject to the following conditions being treated as P0 blockers (i.e., they must be resolved before the production release of either module):

**Conditions for MSG:**

1. **MSG-COND-01 (Security — P0):** Implement ownership validation on all MSG endpoints. `PATCH /messages/:id/read` must verify `recipient_client_id = authenticated_client_id`. `POST /client-messages/:id/reply` must verify the message belongs to a client assigned to the authenticated RM. `GET /messages` must filter strictly by `recipient_client_id`. This mirrors the IDOR fix applied in commit `a213a66` for the proposal routes.

2. **MSG-COND-02 (Performance — P0):** The initial migration creating `client_messages` must include a partial index: `CREATE INDEX idx_client_messages_unread ON client_messages(recipient_client_id) WHERE is_read = false`. This index must be present before the first production query executes.

3. **MSG-COND-03 (Data Integrity — P1):** Define and document the retention policy for `client_messages` (recommended: 7 years, soft-delete pattern with `is_deleted` + `deleted_at` columns). The `client_messages` table definition in `schema.ts` must include these columns.

4. **MSG-COND-04 (Schema — P1):** Add `related_sr_id` (nullable FK to service_requests) to the `client_messages` table definition to support SR cross-referencing from day one.

5. **MSG-COND-05 (Performance — P2):** Plan the Phase 2 upgrade from 60-second polling to Server-Sent Events for unread count notification. Include this in the Phase 2 backlog with a concrete implementation estimate.

**Conditions for FEED:**

1. **FEED-COND-01 (Schema — P0):** Define the `feed_health_snapshots` table in `packages/shared/src/schema.ts` with the following columns: `id` (serial PK), `feed_name` (text), `health_score` (integer 0–100), `status` (enum: UP / DEGRADED / DOWN / OVERRIDE_UP / OVERRIDE_DOWN), `failure_count` (integer), `last_error` (text nullable), `override_by` (text nullable), `override_reason` (text nullable), `override_expires_at` (timestamp nullable), `snapshot_at` (timestamp, default now()), `created_by` (text).

2. **FEED-COND-02 (Data Integrity — P0):** Implement startup hydration in `degradedModeService.ts`. On service initialization (before any `GET /feed-health` request is served), load the most recent row per feed from `feed_health_snapshots` and apply it to the in-memory registry. If no snapshot exists for a feed, retain the hardcoded default.

3. **FEED-COND-03 (Data Integrity — P0):** Implement write-back in `updateFeedHealth()`. Each call must persist the updated health score and derived status to a new row in `feed_health_snapshots`. The snapshot table is the source of truth for historical analysis and startup hydration.

4. **FEED-COND-04 (Operations — P1):** Add `override_expires_at` to the override endpoint contract. The field must default to `now() + 24 hours` if not specified by the caller. The EOD `feed_health_check` job must include a step that clears any overrides whose `override_expires_at < now()` and logs the clearance to the audit trail. BO_HEAD/ADMIN may specify a custom expiry (up to 7 days) when setting an override.

5. **FEED-COND-05 (Maintainability — P2):** Replace the hardcoded feed name list in `feedHealthRegistry` initialization with a query to `schema.feedRouting` at startup, so new feeds added via the CRUD endpoint are automatically registered in the health monitoring system.

---

## 9. Recommended Next Steps

### Immediate (Current Sprint)

1. **Define `client_messages` in `schema.ts`** with all specified columns (`sender_id`, `sender_type`, `recipient_client_id`, `subject`, `body`, `is_read`, `thread_id`, `parent_message_id`, `read_at`, `related_sr_id`, `is_deleted`, `deleted_at`) and the partial index on `(recipient_client_id) WHERE is_read = false`.

2. **Define `feed_health_snapshots` in `schema.ts`** with all specified columns including `override_expires_at`. Generate the Drizzle migration.

3. **Implement MSG server-side routes** replacing the stub in `messages.tsx` with real React Query calls to the actual endpoints. Wire the unread-count badge in `ClientPortalLayout.tsx` using the same `useQuery` / `refetchInterval: 60000` pattern as the service request action count.

4. **Implement ownership guards on all MSG endpoints** following the IDOR fix pattern from commit `a213a66`.

5. **Implement FEED startup hydration** in `degradedModeService.ts`: add an `async initialize()` function that reads the latest snapshot per feed from `feed_health_snapshots` and applies it to the registry. Call this function from `server/index.ts` during application startup.

6. **Implement FEED write-back** in `updateFeedHealth()`: add an `await db.insert(schema.feedHealthSnapshots).values(...)` call after updating the in-memory entry.

### Short-Term (Next Sprint)

7. **Implement the override endpoint** on the back-office router with BO_HEAD/ADMIN role guard, mandatory reason validation (10–500 chars), `override_expires_at` defaulting to `+24h`, and audit log write.

8. **Add override expiry clearance** to the `feed_health_check` EOD job: before checking feed health, clear any snapshots where `override_expires_at < now()` and reset the in-memory registry entries to computed status.

9. **Wire the RM inbox** (`GET /client-messages`, `POST /client-messages/:id/reply`) in the back-office layout and any relevant RM dashboard pages.

10. **Write E2E tests** covering: (a) client sends message → appears in RM inbox, (b) RM replies → appears in client inbox with unread badge, (c) client marks message as read → badge clears, (d) FEED override set → survives restart → clears after expiry.

### Medium-Term (Phase 2)

11. **SSE upgrade for MSG unread count**: Replace the 60-second poll with a `GET /messages/events` SSE endpoint that pushes unread count on reply events. Evaluate whether the existing `realtime-service.ts` infrastructure can support this.

12. **Feed registry driven by `feedRouting` table**: Modify startup hydration to load feed names from the CRUD-managed `feedRouting` table, eliminating the hardcoded feed list.

13. **Consolidated badge-count endpoint**: Introduce `GET /client-portal/badge-counts` that returns service request and message unread counts in one query, replacing both individual polling calls from `ClientPortalLayout.tsx`.

14. **MSG retention sweep job**: Add a scheduled EOD job that soft-deletes (sets `is_deleted = true`) messages older than 7 years and logs the deletion count to the audit trail.

---

*Report prepared by the TrustOMS Philippines Adversarial Evaluation Framework — 2026-04-25*
