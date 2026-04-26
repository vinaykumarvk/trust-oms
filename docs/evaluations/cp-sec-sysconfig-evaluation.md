# Adversarial Evaluation: CP-SEC + SYSCONFIG

**Evaluation Date**: 2026-04-25
**Proposal**: Client Portal Ownership Middleware (CP-SEC) and System Configuration Table (SYSCONFIG)
**Verdict**: **APPROVE WITH CONDITIONS**

---

## 1. Executive Summary

This evaluation examines two tightly coupled proposals for the TrustOMS Philippines platform: **CP-SEC**, a middleware function `validatePortalOwnership()` that enforces per-request client identity binding in the client portal, and **SYSCONFIG**, a `system_config` PostgreSQL table providing a REST-accessible key-value store for operational thresholds — most immediately, a replacement for the existing `CRM_LATE_FILING_DAYS` environment variable.

The proposals address a genuine and documented IDOR vulnerability pattern observed in the existing `server/routes/client-portal.ts`, where multiple routes (e.g. `GET /portfolio-summary/:clientId`, `GET /statements/:clientId`, `GET /notifications/:clientId`) accept a URL-supplied `clientId` parameter with no comparison to the authenticated user's identity from `req.userId`. The SYSCONFIG proposal addresses the operational inflexibility of compile-time environment variable configuration for business thresholds that must adapt to regulatory or operational changes without a deployment cycle.

The adversarial evaluation found that both proposals have genuine and substantial value. However, each carries risks that are non-trivial in a regulated wealth management context:

- **CP-SEC** succeeds in the common authenticated case but has dangerous failure modes when `req.user.clientId` is absent (staff masquerade, service accounts, portal users with incomplete JWT payloads), and the 3-violations-in-15-minutes threshold is not evidence-based. The session-identity model also breaks under legitimate delegation and multi-account scenarios.
- **SYSCONFIG** correctly moves operational configuration from environment variables to a database, but the current schema lacks the fields described in the proposal (`value_type`, `min_value`, `max_value`, `requires_approval`, `is_sensitive`) while the `config-versioning-service.ts` is entirely in-memory with no PostgreSQL persistence. The route registration via `createCrudRouter` grants all back-office roles GET and PUT access, contradicting the BO_HEAD/ADMIN-only PUT restriction specified in the proposal. The 5-minute in-memory cache has unacknowledged multi-instance race conditions.

The final verdict is **Approve with Conditions**: both features address real problems and the core designs are sound, but they must not be deployed without resolving the schema gap, the role restriction gap on PUT, the `clientId`-undefined failure mode, and the multi-instance cache invalidation problem.

---

## 2. Proposal Description

### CP-SEC: Client Portal Ownership Middleware

A new Express middleware function `validatePortalOwnership()` to be applied to all client-portal routes that accept a `:clientId` URL parameter. The middleware:

1. Checks `req.user.clientId` from the authenticated session. If absent, returns HTTP 401.
2. Compares `req.user.clientId` to `req.params.clientId`. If they differ, returns HTTP 403.
3. Logs violations to the hash-chained audit log (`logAuditEvent` with action `PORTAL_OWNERSHIP_VIOLATION`).
4. Tracks violation counts per session and creates a security alert in the exception queue if 3 or more violations occur within a 15-minute window.

The immediate motivation is to close the IDOR gap in routes such as `GET /api/v1/client-portal/portfolio-summary/:clientId` where any authenticated client can substitute a different `clientId` in the URL and receive another client's data.

### SYSCONFIG: System Configuration Table

A `system_config` PostgreSQL table with columns: `config_key` (text, unique, not null), `config_value` (text, not null), `value_type`, `description`, `min_value`, `max_value`, `requires_approval`, `version`, `is_sensitive`, `updated_by`. REST CRUD:

- `GET /api/v1/back-office/system-config` — read all config, accessible to all back-office roles.
- `PUT /api/v1/back-office/system-config/:id` — update config, restricted to BO_HEAD and ADMIN only.

Config values are cached in-memory with a 5-minute TTL, with event-driven cache invalidation triggered on every successful PUT. The immediate use case is replacing the `CRM_LATE_FILING_DAYS` environment variable, read as a module-level constant in `server/services/call-report-service.ts` line 22, with a live-reloadable DB value.

**Existing schema state** (confirmed from `packages/shared/src/schema.ts` lines 4626–4633):

```ts
export const systemConfig = pgTable('system_config', {
  id: serial('id').primaryKey(),
  config_key: text('config_key').unique().notNull(),
  config_value: text('config_value').notNull(),
  description: text('description'),
  ...auditFields,  // created_at, created_by, updated_at, updated_by, version, status, is_deleted, tenant_id, correlation_id, audit_hash
});
```

The proposal's additional fields (`value_type`, `min_value`, `max_value`, `requires_approval`, `is_sensitive`) do not yet exist in the schema.

---

## 3. Debate Transcript

### Round 1: Opening Arguments

**PROPONENT:**

These two proposals together represent a mature, defence-in-depth approach to a real production risk. Let me explain why both are necessary and why the design choices are defensible.

**CP-SEC is urgently needed.** The current client portal routes are wide open to horizontal privilege escalation. A review of `server/routes/client-portal.ts` shows that `GET /portfolio-summary/:clientId`, `GET /statements/:clientId`, and `GET /notifications/:clientId` accept the `clientId` from the URL with no ownership check whatsoever — the handler simply calls `clientPortalService.getPortfolioSummary(clientId)`. Any authenticated client can replace their own clientId with another client's ID and receive a full portfolio summary, statements, and notifications. This is a textbook IDOR (Insecure Direct Object Reference) and would be categorised as a Critical finding in a VAPT (Vulnerability Assessment and Penetration Testing) exercise. The BSP Circular 1140 and the SEC Memorandum Circular on cybersecurity require financial institutions to maintain data confidentiality; an exploitable IDOR in client-facing routes is a direct regulatory violation.

CP-SEC solves this cleanly by moving the ownership check out of individual route handlers and into a reusable middleware, following the same pattern already established by `requireConsent()` in `server/middleware/consent-check.ts`. The rate-based security alerting (3 violations / 15 minutes) adds an intrusion detection layer that creates an exception queue entry for operations staff to investigate — this is exactly the kind of layered response required by BSP Circular 1140 Section 5 on incident detection and response.

**SYSCONFIG addresses a real operational constraint.** The `CRM_LATE_FILING_DAYS` constant is read as a module-level variable at process start (`const LATE_FILING_THRESHOLD_DAYS = parseInt(process.env.CRM_LATE_FILING_DAYS ?? '5', 10) || 5` — call-report-service.ts line 22). Changing this threshold today requires a deployment: update the environment variable in the secrets store, trigger a new pod rollout, wait for health checks. In a regulated environment, the BSP may require a 5-to-3 day reduction in filing deadlines on short notice, or a branch manager may need to temporarily relax the threshold during a holiday period. SYSCONFIG enables these changes in seconds without a deployment.

The flat key-value table is a deliberate and correct choice for this domain. Complex configuration hierarchies (per-environment, per-branch, per-product) are over-engineering for thresholds that are institution-wide business rules. Every bank using SWIFT messaging uses a flat key-value config table for operational parameters. The `system_config` table already exists in the shared schema and is already registered in the back-office CRUD router, meaning the infrastructure cost of this feature is essentially zero — it's enabling an existing table for a specific use case.

The 5-minute TTL cache is a well-established pattern in configuration management. It provides sub-second read performance for the hot call-report-service.submit() path while ensuring changes propagate within a bounded time window. The tradeoff between cache duration and propagation lag is explicit and documented.

**OPPONENT:**

Both proposals have genuine value but each has a potentially catastrophic failure mode that the proponent has glossed over. I will demonstrate that as currently designed, CP-SEC can silently pass on unsafe requests, and SYSCONFIG has a schema gap, a role control gap, and a cache consistency problem that makes it operationally dangerous in a multi-instance deployment.

**CP-SEC's Achilles heel: when `req.user.clientId` is undefined.** The middleware's security guarantee rests entirely on the assumption that every authenticated request to the client portal carries a populated `req.user.clientId`. Let me show why this assumption does not hold universally:

First, look at the existing auth middleware (`server/middleware/auth.ts` lines 31–81). It populates `req.userId`, `req.userRole`, and `req.userEmail` from the JWT payload. It does **not** populate `req.user` as an object, and it does **not** extract a `clientId` claim. The JWT payload has no `clientId` field defined in the type declaration (lines 5–15). This means `req.user.clientId` will be `undefined` on every request using the standard JWT flow unless a separate middleware is added to populate it. If the proposed middleware treats `undefined` as grounds for a 401, that is correct. But the proposal spec says "Returns HTTP 401 if unauthenticated" — it conflates "no token" with "authenticated user without a clientId claim". A back-office staff member who is fully authenticated (valid JWT, role=BO_MAKER) hits the client portal routes for monitoring purposes and gets a 401. That breaks legitimate workflows.

Second, the proposal spec says `req.user.clientId` is extracted "from the session." But this is a JWT-based stateless API, not a session-based application. There is no server-side session. The clientId must come from the JWT payload. The JWT type declaration in `auth.ts` has no `clientId` field. So where does `req.user.clientId` come from? The answer is: nowhere, currently. This is not a minor implementation detail — it means the middleware, as specified, requires a non-trivial change to the JWT issuance process (adding a `clientId` claim) or the introduction of a session store (a significant architectural change).

Third, the 3-violations-in-15-minutes threshold is arbitrary. What is the empirical basis for 3? A client who misremembers their account number and tries 3 slightly different IDs within 15 minutes (a plausible UX scenario for a multi-account holder) will trigger a security alert and potentially have their portal access interrupted. Conversely, a patient attacker who probes every 6 minutes will never trigger the alert. The threshold needs to be calibrated against actual usage patterns, and the proposal provides no data.

**SYSCONFIG's schema gap is a blocking issue.** The proposal specifies a table with `value_type`, `min_value`, `max_value`, `requires_approval`, and `is_sensitive` columns. These do not exist in the current `packages/shared/src/schema.ts`. The table registered at `server/routes/back-office/index.ts` line 789 is the existing minimal `systemConfig` table. The CRUD router will happily accept a PUT to update any field in the table — including fields that don't exist. More critically, there is no `requires_approval` column to enforce maker-checker on config changes, and no `is_sensitive` column to redact values from the GET response. Without these, the proposed security controls are simply not present.

The role restriction is also missing. The proposal says PUT is BO_HEAD/ADMIN only. But the back-office index router applies `requireBackOfficeRole()` at line 30, which grants access to BO_MAKER, BO_CHECKER, BO_HEAD, and SYSTEM_ADMIN. A BO_MAKER can currently update system configuration values through the generic CRUD PUT endpoint, which is a Segregation of Duties violation for configuration governance.

**JUDGE:**

Round 1 raised substantive points on both sides. The Proponent correctly identifies a real IDOR vulnerability and a real operational constraint. The Opponent correctly identifies that the `req.user.clientId` assumption is not grounded in the current JWT implementation and that the SYSCONFIG schema diverges from the proposal's specification.

Key questions I want answered in subsequent rounds:
1. Can the `req.user.clientId` gap be solved with a minimal JWT claim addition, or does it require architectural changes?
2. Is the 3-violations-in-15-minutes threshold too sensitive, and is there a principled basis for it?
3. Does the flat SYSCONFIG table design adequately serve future use cases, or will the absence of per-branch/per-environment overrides become a limitation within 12 months?
4. Can the multi-instance cache invalidation problem be solved within the existing architecture?
5. What is the migration path from `CRM_LATE_FILING_DAYS` env var to the DB-backed value without a service disruption window?

**Score — Round 1: Proponent 6/10, Opponent 8/10.** The Opponent identified a concrete, blocking technical gap that the Proponent did not acknowledge. The Proponent's case is directionally correct but lacks specificity about the implementation.

---

### Round 2: Rebuttal

**PROPONENT:**

The Opponent's criticism of `req.user.clientId` being undefined is valid as a concern about the current state, but it is not a reason to reject the proposal — it is a reason to specify the implementation contract correctly. The resolution is straightforward: the JWT issued by the auth-service for client-portal users must include a `clientId` claim. This is a one-time change to `server/routes/auth.ts` when issuing tokens for client-portal logins. The `apps/client-portal/src/pages/login.tsx` already stores `clientId: String(user.id)` in the client-side user object (line 63). The same value should be embedded in the JWT `clientId` claim.

For back-office staff accessing client portal routes in monitoring/support roles, the middleware should check `req.userRole` and bypass the ownership check if the role is `BO_HEAD`, `SYSTEM_ADMIN`, or `COMPLIANCE_OFFICER`. This is a two-path design: portal clients are ownership-checked, staff are role-checked. The proposal already implies this distinction ("Returns HTTP 401 if unauthenticated") — extending it to a role-bypass path for staff is a clarification, not a rearchitecting.

Regarding the SYSCONFIG schema gap: yes, the additional columns (`value_type`, `min_value`, `max_value`, `requires_approval`, `is_sensitive`) are missing from the current schema. This is a known migration that must be included in the implementation plan. The proposal's spec is aspirational; the implementation plan closes the gap. This is a development task, not a design flaw.

On the role restriction for PUT: the resolution is to add a custom `beforeUpdate` hook in the `createCrudRouter` call for `system-config` that checks `req.userRole` and rejects BO_MAKER and BO_CHECKER requests. Alternatively, register the system-config route outside the `requireBackOfficeRole()` umbrella with its own `requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')` guard. Either approach resolves the gap without requiring a new pattern.

**OPPONENT:**

The Proponent's rebuttal on the JWT clientId claim is directionally correct but understates the blast radius. A JWT claim addition requires changes to: (a) the auth-service issuance logic, (b) the `auth.ts` JWT verification handler to extract and populate the new claim on `req.user`, (c) all existing client portal tokens that are in-flight (requiring either a forced re-login or a grace period where the old token format is still accepted). This is not a "one-time change" — it is a multi-step migration that must be coordinated across the auth system. If a client hits the portal with an old token (no `clientId` claim) during the grace period, the middleware must fail open (bypassing the check) or fail closed (blocking access). Failing open defeats the security goal; failing closed breaks the user experience. The proposal must specify which failure mode is acceptable and for how long.

On the staff bypass for monitoring roles: adding a role-bypass path inside a security middleware is itself a security surface. If the bypass logic is `if (req.userRole in ['BO_HEAD', 'SYSTEM_ADMIN', ...])`, then a compromised BO_HEAD token bypasses all client data isolation in the portal. The principle of least privilege says staff monitoring of client data should go through an explicitly designed back-office route (e.g. `GET /api/v1/back-office/clients/:clientId/portfolio`) with its own audit trail, not through the client portal routes with a role bypass that silently defeats the ownership control.

On the multi-instance cache problem for SYSCONFIG: a single-node cache invalidation does nothing in a Kubernetes deployment where 3–5 back-office instances are running. When `Instance A` receives a PUT for `CRM_LATE_FILING_DAYS`, it invalidates its own cache. `Instance B`, `C`, and `D` continue serving the old value for up to 5 minutes. In those 5 minutes, some call reports get evaluated against the old threshold and some against the new one. For a threshold change from 5 days to 3 days, this means call reports filed during the cache propagation window receive inconsistent approval routing — some routed to supervisor, some auto-approved, depending on which instance handled the request. In a regulated environment, this inconsistency is a compliance defect.

**JUDGE:**

The Proponent's rebuttals are partially satisfying but the Opponent introduced two new issues of substance: the token migration grace period failure mode and the multi-instance cache invalidation producing non-deterministic SLA evaluations. Both must be resolved. The staff monitoring bypass is a legitimate design concern — routing back-office staff through a purpose-built admin endpoint is cleaner than a role-bypass flag in a security middleware.

**Score — Round 2: Proponent 5/10, Opponent 8/10.** The Opponent's identification of the multi-instance cache inconsistency is the strongest point raised so far. It changes the SYSCONFIG from "cache propagation delay" (acceptable) to "inconsistent compliance decisions" (not acceptable in a regulated context).

---

### Round 3: Deep Dive

**PROPONENT:**

Let me address the core technical concerns with specific solutions.

**For CP-SEC — token migration failure mode**: The correct approach is fail-closed with a circuit breaker. During the JWT migration period, the middleware should check for the `clientId` claim. If it is absent and the request is to a client-portal route, issue a `401` with a specific error code `CLIENT_TOKEN_UPGRADE_REQUIRED` and a 30-second client-side retry flag. The client portal frontend detects this error code and forces a re-login. Client portal sessions are short-lived (typically 24–48 hours for financial applications), so within 48 hours of deployment the entire active client base will have re-authenticated and received new tokens with the `clientId` claim. This is a clean, bounded migration window with no grey period of open bypass.

For the staff monitoring concern: the Opponent's rebuttal correctly identifies that a role bypass inside the ownership middleware is architecturally wrong. I agree the monitoring access pattern should use back-office routes. The middleware should apply only to the client-portal router — staff should not be accessing `GET /api/v1/client-portal/*` routes for monitoring purposes in the first place. This is a policy and route registration decision, not a middleware design decision. The correct remedy is to document that the client portal router is exclusively for client users, and that any back-office staff needing client portfolio data must use the dedicated `GET /api/v1/back-office/clients/:clientId/...` endpoints.

**For SYSCONFIG — multi-instance cache invalidation**: The solution does not require a distributed cache (Redis). It requires a database polling pattern for critical SLA thresholds. Specifically, for `CRM_LATE_FILING_DAYS` and any other threshold that drives compliance decisions, the read path should be: (1) check in-memory cache, (2) if stale (>5 min), re-query the database, (3) update cache and return. On a PUT, in addition to clearing the local instance's cache, emit a PostgreSQL `NOTIFY` event on the `config_changed` channel. Each server instance should `LISTEN` on this channel and immediately invalidate the relevant cache key. PostgreSQL `LISTEN/NOTIFY` is available in the existing `pg` connection pool used by Drizzle ORM, requires no additional infrastructure, and propagates within milliseconds. This eliminates the 5-minute inconsistency window.

**For SYSCONFIG — schema migration**: The Drizzle migration for the missing columns is a single `ALTER TABLE system_config ADD COLUMN` operation. The columns are nullable at the DB level (with application-layer defaults), so the migration is non-destructive and can be applied without a downtime window. The `config-versioning-service.ts` is a separate in-memory service and should be deprecated in favour of the DB-backed version field that already exists in `auditFields` on the `systemConfig` table.

**OPPONENT:**

Let me take each solution and probe its limits.

**The CP-SEC re-login forced migration**: The fail-closed approach works for web browser clients. However, TrustOMS Philippines may support API integrations or mobile applications where forcing a re-login is not trivial — a background API process running on behalf of a client may not have a user-facing login flow to trigger. Does the proposal scope include API clients? If yes, the token migration plan must include a mechanism for programmatic token refresh. If no, the proposal must explicitly document the exclusion of non-browser clients from the client portal.

More importantly, the forced re-login on `CLIENT_TOKEN_UPGRADE_REQUIRED` creates a denial-of-service vector: an attacker who can intercept HTTP responses (e.g. on an insecure network) could craft responses with this error code to force repeated re-logins, degrading availability. The error response must not be user-visible in a way that is triggerable by a passive eavesdropper. This means the token upgrade must use a back-channel refresh (sending the current token to the refresh endpoint, which validates it and issues a new token with the `clientId` claim) rather than a forced re-login.

**The PostgreSQL LISTEN/NOTIFY for cache invalidation**: This is a sound technical approach. However, it introduces a new operational dependency: the `pg` connection designated for NOTIFY must be persistent (not from the connection pool, which returns connections after each query). Establishing a dedicated persistent connection per instance adds memory overhead and requires careful lifecycle management (reconnect on disconnect, circuit breaker on the NOTIFY channel, monitoring). For a 3-instance deployment this is manageable; for a 50-instance deployment it becomes a coordination problem. The proposal should acknowledge this operational overhead and specify the connection management pattern.

Also, the `config-versioning-service.ts` is entirely in-memory (arrays and Maps) with zero persistence. After a process restart, all version history is lost. The in-memory version counter starts at 1 regardless of the DB state. This service needs to be either (a) removed and replaced with the audit log as the source of version truth, or (b) populated from the DB on startup. The Proponent said "deprecated in favour of the DB-backed version field" — but the `version` field in `auditFields` is a simple integer increment with no history. There is no rollback capability in the current DB schema. If rollback is a requirement of the proposal, it needs dedicated version history tables, not the generic `version` counter.

**JUDGE:**

The deep dive has clarified the technical paths significantly. The LISTEN/NOTIFY approach for cache invalidation is architecturally sound. The token migration approach is workable but the back-channel refresh refinement is important. The versioning/rollback gap for SYSCONFIG is a significant finding — the proposal claims rollback capability, but neither the existing DB schema nor the in-memory `config-versioning-service.ts` provides durable rollback.

**Score — Round 3: Proponent 7/10, Opponent 7/10.** Both sides are now engaging at the implementation level. The Opponent's rollback durability finding is material. The Proponent's LISTEN/NOTIFY solution is technically sound and resolves the cache consistency problem if properly implemented.

---

### Round 4: Evidence and Alternatives

**PROPONENT:**

Let me present evidence from within the existing codebase that supports the proposal's approach.

**Evidence for CP-SEC**: The same ownership check pattern is already implemented correctly in two places in the existing code, demonstrating that the team knows how to do this:

1. `server/routes/client-portal.ts` lines 376–406: The `/proposals/detail/:id` route checks `if (proposal.customer_id !== clientId)` before returning data, with a comment `// IDOR guard: only the proposal's customer may view it`. This was added by commit `a213a66` ("fix(security): resolve P0 IDOR in client-portal proposal routes (SEC-07, G3.1)").

2. `server/services/call-report-service.ts` lines 292–294: The update method checks `if (userId && existing.filed_by !== userId)` and throws `ForbiddenError('Not authorized to modify this call report')`.

However, these are inline ownership checks — each route handler must independently implement the guard. The IDOR vulnerability in the portfolio, statements, and notifications routes exists precisely because the inline guard was not applied there. CP-SEC is the correct architectural response: extract the common pattern into a middleware to prevent future routes from being added without the guard.

**Evidence for SYSCONFIG**: The `proposal-service.ts` line 22 contains this comment: `// In a future iteration, move them to a configuration table (e.g. system_config`. The intent to use the `system_config` table for configurable thresholds is already documented in the codebase. The `config-versioning-service.ts` exists as a placeholder service for this capability, even if its current implementation is in-memory only. SYSCONFIG is the formalisation of an architectural intention that has already been documented by the engineering team.

**Alternative for CP-SEC**: An alternative to middleware-based ownership checking is to enforce it at the service layer. Instead of `clientPortalService.getPortfolioSummary(clientId)` (which trusts the caller to pass the right clientId), the service method signature becomes `getPortfolioSummary(requestingClientId: string, targetClientId: string)`. If `requestingClientId !== targetClientId` the service throws a `ForbiddenError`. This pushes the check closer to the data, which is the most defence-in-depth approach. However, it requires modifying every service method signature — higher implementation cost than middleware. I advocate for middleware because it provides guaranteed coverage without requiring every service to implement the check.

**Alternative for SYSCONFIG**: An alternative is a hybrid approach: keep `CRM_LATE_FILING_DAYS` as an environment variable for the current deployment cycle but add a database override that takes precedence when present. The read logic becomes: `config = db_cache.get('CRM_LATE_FILING_DAYS') ?? parseInt(process.env.CRM_LATE_FILING_DAYS ?? '5', 10)`. This provides a migration path that does not require changing the env var setup immediately and allows gradual adoption of the DB-backed config.

**OPPONENT:**

The Proponent's evidence is fair. The inline IDOR guards in the proposal and call-report services confirm that the team is aware of the problem and has begun addressing it inconsistently. A middleware approach is architecturally preferable to ad-hoc inline checks.

However, I want to examine the **alternative approaches more rigorously** to demonstrate that simpler solutions to the key question — "is session-based clientId reliable?" — exist.

**For CP-SEC — an approach that avoids the clientId JWT claim entirely**: Rather than adding a `clientId` claim to the JWT (which carries the migration risk discussed in Round 3), the server can derive ownership from the database. After JWT verification, a one-time lookup `SELECT client_id FROM clients WHERE user_account_id = req.userId` (or equivalent) populates `req.portalClientId` with the authoritative client identity from the database. This is cached in a request-scoped variable (not in the JWT, not in a session). Benefits: no JWT migration needed, clientId is always current (database is the source of truth), no stale client identity problem if a client changes accounts. Cost: one additional DB query per request. For financial applications where latency is less critical than correctness and security, this tradeoff is acceptable. With a 60-second in-memory LRU keyed by `userId`, the DB hit per client is once per minute maximum.

**For SYSCONFIG — configuration as code with feature flags**: The alternative is to treat threshold values as typed constants in a configuration module (`server/config/thresholds.ts`) populated at startup from environment variables, with an optional admin override endpoint that persists to the DB and updates the in-process value via Node.js `process.env` or module-level reassignment. No 5-minute cache, no LISTEN/NOTIFY complexity, no schema migration. Changes require a DB write and a brief delay (next request picks up the new value). This is simpler but less auditable and does not support rollback.

**On the flat vs hierarchical config debate**: The proposal argues that a flat key-value table is sufficient because all thresholds are institution-wide. This is true today. But in 12 months, a branch manager may legitimately require a different late-filing threshold from the main office due to a different regulator. A flat table cannot represent `{ key: 'CRM_LATE_FILING_DAYS', branch_id: 5, value: '3' }` without schema changes. Starting with a flat table and migrating to a hierarchical one later is painful because every consumer must be updated. Starting with a hierarchical table (with a `NULL branch_id` meaning institution-wide default) is forward-compatible. The schema cost of adding a nullable `scope_id` and `scope_type` column now is trivial compared to the migration cost later.

**JUDGE:**

Round 4 has produced two important alternative approaches that deserve serious consideration: (1) the DB-derived client identity (avoiding the JWT migration) and (2) the forward-compatible hierarchical config schema. Both alternatives are architecturally sound and lower risk than the proposed approaches in their respective areas.

The DB-derived client identity approach with LRU caching is particularly attractive because it eliminates the JWT migration risk entirely. The Opponent's hierarchical schema suggestion is forward-looking and the incremental schema cost is genuinely low.

**Score — Round 4: Proponent 6/10, Opponent 9/10.** The Opponent's DB-derived identity alternative and the hierarchical schema argument are the strongest contributions in the debate. The Proponent's evidence from the codebase confirming the IDOR pattern was useful but did not rebut the alternatives.

---

### Round 5: Closing Arguments

**PROPONENT:**

Both proposals must move forward because the status quo has specific, demonstrable security and operational failures:

1. The client portal IDOR is not theoretical. The existing code has at least five unprotected clientId routes (`/portfolio-summary/:clientId`, `/statements/:clientId`, `/notifications/:clientId`, `/risk-profile/:clientId`, `/service-requests/:clientId`). The proposals and calls page (`/portfolio-summary`) returns the client's complete financial position. Any authenticated client can access any other client's financial data today. This is not acceptable in a Philippine SEC-regulated trust company.

2. The `CRM_LATE_FILING_DAYS` hardcoded constant means a regulatory change — which in the Philippine financial sector can be issued with 30 days notice — requires an engineering sprint, code review, UAT, and deployment. SYSCONFIG gives the operations team the ability to respond within minutes.

The Opponent's DB-derived identity alternative is worth adopting as part of the CP-SEC implementation — it is strictly better than the JWT claim approach for the reasons stated. I advocate for it as the implementation mechanism, with CP-SEC as the architectural pattern (middleware location and failure modes) and the DB lookup as the identity resolution mechanism.

The Opponent's hierarchical schema observation is a valid future-proofing concern. I recommend adding a nullable `branch_id` and `scope_type` column to the schema migration as a forward-compatible extension, with no change to the current read logic (which treats NULL scope as institution-wide). The cost is two nullable columns. The benefit is avoiding a breaking schema change in 12–18 months.

The violation alerting threshold of 3-in-15-minutes should be made configurable — stored in the `system_config` table as `CP_SEC_VIOLATION_THRESHOLD` and `CP_SEC_VIOLATION_WINDOW_SECONDS`. This closes the feedback loop between the two proposals and allows the operations team to tune the sensitivity based on observed false-positive rates.

**OPPONENT:**

My closing argument focuses on what must be conditions for approval rather than grounds for rejection.

**CP-SEC conditions that are non-negotiable**:
1. The implementation must use DB-derived client identity (not JWT claim) to avoid the token migration risk and the stale identity problem.
2. The middleware must explicitly document and test three failure modes: unauthenticated request (401), authenticated portal user with mismatched clientId (403), and authenticated back-office user (which must be rejected at the route registration level, not bypassed silently inside the middleware).
3. The 3-violations-in-15-minutes threshold must be stored in `system_config`, not hardcoded, and must come with a documented rationale (preferably based on a baseline measurement from production logs once available).
4. A load test must demonstrate that the DB-derived identity lookup (with LRU cache) does not degrade client portal response times by more than 10ms at p95.

**SYSCONFIG conditions that are non-negotiable**:
1. The schema migration must include all proposed columns (`value_type`, `min_value`, `max_value`, `requires_approval`, `is_sensitive`) before the feature goes to UAT.
2. The PUT endpoint for system-config must be separately guarded with `requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')`, not relying solely on `requireBackOfficeRole()` which includes BO_MAKER and BO_CHECKER.
3. The PostgreSQL LISTEN/NOTIFY cache invalidation must be implemented and tested across at least 2 application instances before production deployment.
4. The `config-versioning-service.ts` must either be deleted (using the audit log as the version history source) or rewritten to populate from the DB on startup and persist to the DB on every change. The current in-memory-only implementation is a rollback-capability illusion.
5. A `requires_approval` flag of `true` must route system-config changes through the existing maker-checker workflow.

If these conditions are met, both proposals deliver genuine value and should be approved.

**JUDGE:**

Both parties have presented substantive arguments throughout this debate. The Proponent established a genuine security need (IDOR in client portal) and a genuine operational need (runtime-configurable thresholds). The Opponent successfully identified that the implementation as specified contains gaps that must be resolved before deployment:

- The `req.user.clientId` source is undefined in the current JWT architecture (resolved by adopting the DB-derived identity alternative)
- The 3-violations threshold is arbitrary and should be configurable
- The staff monitoring bypass creates a problematic security pattern (resolved by restricting the client portal router to client-only use)
- The SYSCONFIG schema is missing required columns
- The PUT role restriction is not enforced by the current `requireBackOfficeRole()` guard
- The multi-instance cache inconsistency can produce non-deterministic compliance decisions (resolved by LISTEN/NOTIFY)
- The `config-versioning-service.ts` provides a rollback-capability illusion with no DB persistence

The Proponent's concession to use DB-derived identity and add hierarchical scope columns is a significant improvement to the proposal. The Opponent's concession that both features should be approved with conditions is appropriate.

**Final Round Score — Round 5: Proponent 8/10, Opponent 8/10.** Both parties converged on a set of conditions that make both features viable.

---

## 4. Scoring Summary

| Round | Topic | Proponent | Opponent | Notes |
|-------|-------|-----------|----------|-------|
| Round 1: Opening | Core validity of proposals | 6/10 | 8/10 | Opponent identified concrete blocking gap (JWT clientId source, schema divergence) |
| Round 2: Rebuttal | Resolution paths and new issues | 5/10 | 8/10 | Opponent introduced multi-instance cache problem — most consequential finding |
| Round 3: Deep Dive | Technical solutions | 7/10 | 7/10 | LISTEN/NOTIFY solution is sound; rollback durability gap surfaced |
| Round 4: Evidence & Alternatives | Codebase evidence; alternatives | 6/10 | 9/10 | DB-derived identity and hierarchical schema alternatives are materially superior |
| Round 5: Closing | Conditions for approval | 8/10 | 8/10 | Convergence on conditions; Proponent conceded key improvements |
| **Totals** | | **32/50** | **40/50** | |

**Debate Winner: Opponent** — by demonstrating that the proposals as specified cannot be deployed safely without specific changes, the Opponent performed the primary function of adversarial evaluation: surfacing non-obvious risks before implementation commits begin.

**Proposal Disposition: Approve with Conditions** — both proposals address real problems and should proceed, subject to the conditions enumerated below.

---

## 5. Key Risks (Ranked)

### Risk 1 — CRITICAL: `req.user.clientId` is not populated by the current JWT auth flow
**Severity**: Critical (blocks CP-SEC from functioning at all)
**Description**: The `server/middleware/auth.ts` populates `req.userId`, `req.userRole`, and `req.userEmail` from the JWT. It does not extract or populate a `clientId` field on `req.user`. The `req.user` property itself does not exist on the Express Request type as declared. If the middleware naively reads `req.user.clientId`, it will always receive `undefined`, causing all portal requests to return HTTP 401 (if fail-closed) or bypass the check entirely (if fail-open). Neither outcome is acceptable.
**Mitigation**: Implement DB-derived client identity: post-authentication, perform `SELECT client_id FROM clients WHERE user_account_id = req.userId` with a 60-second LRU cache. Populate `req.portalClientId` from the result. This eliminates the JWT migration dependency.

### Risk 2 — HIGH: Multi-instance cache produces inconsistent SLA compliance decisions
**Severity**: High (compliance defect in regulated environment)
**Description**: The `call-report-service.ts` reads `LATE_FILING_THRESHOLD_DAYS` as a module-level constant at startup. If SYSCONFIG replaces this with a 5-minute in-memory cache, and a change is made to `CRM_LATE_FILING_DAYS` while 3 application instances are running, those instances will serve the old value for up to 5 minutes each. During this window, call reports submitted for the same number of days late will be routed differently (supervisor approval vs. auto-approval) depending on which instance handles the request. In a Philippine BSP audit, this inconsistency would require explanation.
**Mitigation**: Implement PostgreSQL `LISTEN/NOTIFY` on a `config_changed` channel. On PUT, emit `NOTIFY config_changed, 'CRM_LATE_FILING_DAYS'`. Each instance maintains a persistent listener connection and invalidates the specific cache key immediately.

### Risk 3 — HIGH: SYSCONFIG PUT is accessible to BO_MAKER and BO_CHECKER
**Severity**: High (Segregation of Duties violation)
**Description**: The `/api/v1/back-office/system-config` route is registered inside `createCrudRouter` at `server/routes/back-office/index.ts` line 789, inside the `router.use(requireBackOfficeRole())` umbrella at line 30. `requireBackOfficeRole()` grants access to BO_MAKER, BO_CHECKER, BO_HEAD, and SYSTEM_ADMIN. A BO_MAKER can issue a PUT to update `CRM_LATE_FILING_DAYS` from 5 to 30, removing supervisor approval requirements for all call reports, without any checker approval. This is a SoD violation and a potential fraud vector.
**Mitigation**: Register the system-config route outside the blanket `requireBackOfficeRole()` middleware, or add a `beforeUpdate` hook that enforces `requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')` for PUT operations.

### Risk 4 — HIGH: SYSCONFIG schema is missing required columns
**Severity**: High (proposal features are unavailable without schema migration)
**Description**: The proposal specifies `value_type`, `min_value`, `max_value`, `requires_approval`, and `is_sensitive` columns. None of these exist in the current `systemConfig` table definition in `packages/shared/src/schema.ts`. Without `is_sensitive`, the GET endpoint will return raw config values (including any sensitive thresholds) to all back-office roles. Without `requires_approval`, the maker-checker workflow cannot be applied to config changes. Without `min_value`/`max_value`, there is no server-side input validation for numeric thresholds.
**Mitigation**: Execute a Drizzle schema migration adding these columns before the feature reaches UAT. The columns should be nullable with safe defaults.

### Risk 5 — MEDIUM: 3-violations-in-15-minutes threshold is uncalibrated
**Severity**: Medium (false positives will create alert fatigue; false negatives allow slow enumeration attacks)
**Description**: The alert threshold of 3 violations in 15 minutes has no empirical basis. A multi-account client who bookmarks URLs for different accounts and switches between them could trigger the alert through normal usage. A patient attacker who probes every 6 minutes will never appear in a 15-minute window. Alert fatigue from false positives will cause operations staff to dismiss legitimate alerts.
**Mitigation**: Store the threshold in `system_config` as `CP_SEC_VIOLATION_THRESHOLD` (default 3) and `CP_SEC_VIOLATION_WINDOW_SECONDS` (default 900). After 30 days of production data, analyse the distribution of violation counts per session and calibrate the threshold. Document the alert-handling SLA for the operations team.

### Risk 6 — MEDIUM: `config-versioning-service.ts` provides rollback illusion with no DB persistence
**Severity**: Medium (rollback capability described in proposal is not durable)
**Description**: `server/services/config-versioning-service.ts` stores all version history in process-local `Map` and `Array` structures. After any process restart, all version history is lost. The `versionIdSeq` counter resets to 1, meaning new entries conflict with the pre-restart history if the DB audit log is used for reference. If a BO_HEAD mistakenly sets `CRM_LATE_FILING_DAYS = 99`, the rollback operation relies on the in-memory history of the current process, which may have been restarted since the mistake occurred.
**Mitigation**: Either (a) delete `config-versioning-service.ts` and rely on the hash-chained audit log as the version history source, or (b) persist version history to a `system_config_versions` database table and populate from DB on startup.

### Risk 7 — LOW: Flat config table cannot represent per-branch or per-environment overrides
**Severity**: Low (no immediate impact, but creates future migration risk)
**Description**: The `system_config` table has a single `config_key` with no `branch_id`, `environment`, or `scope` dimension. If BSP Circular 1140 or internal policy requires different late-filing thresholds for different branches (e.g. a newly opened provincial branch has a longer grace period), the schema cannot represent this distinction.
**Mitigation**: Add nullable `scope_type` (text, e.g. `INSTITUTION`, `BRANCH`) and `scope_id` (text, nullable) columns to the schema migration now. Institution-wide config uses `scope_type = 'INSTITUTION'`, `scope_id = NULL`. Branch-specific config uses `scope_type = 'BRANCH'`, `scope_id = '5'`. Read logic: `SELECT config_value FROM system_config WHERE config_key = ? ORDER BY scope_type DESC LIMIT 1` (branch-specific takes precedence over institution-wide).

---

## 6. Key Benefits (Ranked)

### Benefit 1 — Closes documented IDOR vulnerability in client portal
The IDOR vulnerability in `GET /portfolio-summary/:clientId`, `GET /statements/:clientId`, and `GET /notifications/:clientId` is exploitable today. CP-SEC eliminates the attack surface across all portal routes simultaneously by centralising the ownership check in middleware, rather than requiring every route handler to independently implement it. The evidence from commit `a213a66` ("fix(security): resolve P0 IDOR in client-portal proposal routes") confirms the team is already patching these issues reactively — CP-SEC provides proactive, structural prevention.

### Benefit 2 — Establishes a reusable security middleware pattern
CP-SEC follows the existing pattern of `requireConsent()` (`server/middleware/consent-check.ts`) — a purpose-built middleware for a specific cross-cutting security concern. Adding CP-SEC to the middleware library means future client portal routes are protected by applying a single well-tested middleware, reducing the probability of developers forgetting to add ownership checks. This follows the defence-in-depth principle: multiple independent layers of control reduce the probability of a single missed check creating a vulnerability.

### Benefit 3 — Enables runtime-configurable compliance thresholds without redeployment
A BSP Circular change affecting the call-report late-filing threshold can currently be applied only through a full deployment cycle (estimate: 4–8 hours with UAT). SYSCONFIG reduces this to a two-minute operation by a BO_HEAD user. During natural disasters, health emergencies, or other force majeure events common in Philippine operations, the ability to extend filing deadlines without an emergency deployment is a material operational capability.

### Benefit 4 — Provides intrusion detection for credential enumeration attacks
The 3-violations-in-15-minutes exception queue alert gives the operations team a signal when a client credential is being used to probe other clients' data. Without this, a systematic enumeration attack (trying sequential client IDs) would be invisible until a security audit. The alert integrates with the existing exception queue SLA framework (`exception-queue-service.ts`), meaning it will be routed to operations staff within the P1 4-hour SLA.

### Benefit 5 — Produces a DB-backed audit trail for config changes
The combination of SYSCONFIG with the existing hash-chained audit logger (`logAuditEvent` with `computeDiff`) means every change to a system configuration value is recorded with the actor's identity, role, timestamp, IP address, before/after diff, and a tamper-evident hash chain. This directly satisfies BSP Circular 1140 requirements for configuration management audit trails and supports the proof-of-change documentation required during regulatory inspections.

### Benefit 6 — Aligns with existing codebase architectural patterns at zero infrastructure cost
Both proposals leverage existing infrastructure. CP-SEC follows the `requireConsent()` middleware pattern. SYSCONFIG uses the existing `createCrudRouter` factory and the already-defined `systemConfig` table. The `config-versioning-service.ts` placeholder indicates the engineering team has already planned for this capability. Neither proposal requires new infrastructure (no Redis, no message broker, no new database). The PostgreSQL LISTEN/NOTIFY solution for cache invalidation uses the existing `pg` connection.

---

## 7. Alternative Approaches

### Alternative A: DB-Derived Client Identity (Preferred over JWT claim)
Instead of adding a `clientId` claim to the JWT (which requires auth-service changes and a token migration window), resolve client identity by database lookup after authentication: `SELECT client_portal_id FROM portal_clients WHERE user_id = req.userId`. Cache the result in a request-scoped 60-second LRU keyed by `userId`. This approach is architecturally superior because: (1) no JWT migration, (2) client identity is always current from the database (no stale token issue), (3) works with existing JWT format. The LRU cache bounds the DB overhead to one query per 60 seconds per unique client user.

### Alternative B: Service-Layer Ownership Enforcement (Deeper but higher cost)
Enforce ownership at the service method level rather than in middleware. `clientPortalService.getPortfolioSummary(portfolioId, requestingClientId)` throws `ForbiddenError` if the portfolio does not belong to `requestingClientId`. This provides the strongest defence-in-depth (the service cannot be called insecurely regardless of how the route is constructed) but requires modifying every service method signature. Recommended as a secondary layer after CP-SEC middleware is in place.

### Alternative C: Hierarchical SYSCONFIG Schema (Forward-compatible)
Extend the SYSCONFIG schema with nullable `scope_type` (INSTITUTION | BRANCH | PRODUCT) and `scope_id` columns. Institution-wide config is `scope_type = 'INSTITUTION'`, `scope_id = NULL`. The read logic resolves the most specific applicable value using precedence ordering. The incremental schema cost (two nullable columns) is trivially low versus the migration cost of changing from a flat to hierarchical schema after production data exists.

### Alternative D: Configuration as Code with DB Override (Lowest complexity)
Keep threshold values as typed constants in `server/config/thresholds.ts` populated from environment variables at startup. Add a single admin endpoint (`PUT /api/v1/back-office/system-config/override`) that writes a DB override value and updates the in-process constant via a module-level setter. No cache, no LISTEN/NOTIFY, no complex invalidation. The downside: no per-instance propagation guarantee (same problem as a cache without LISTEN/NOTIFY). This is acceptable only if single-instance deployment is guaranteed.

### Alternative E: OpenFeature / LaunchDarkly-Style Feature Flags
For the long term, consider adopting an open-source feature flag library (e.g. OpenFeature SDK with a PostgreSQL backend) as the configuration management system. This provides per-user, per-segment, per-environment overrides, rollback, and audit trails out of the box. The initial setup cost is higher, but the operational flexibility is significantly greater. For a 3-year roadmap with multiple branches and regulatory environments, this is the enterprise-grade solution.

---

## 8. Final Verdict

**Verdict: APPROVE WITH CONDITIONS**

Both CP-SEC and SYSCONFIG address documented, non-theoretical problems in the current TrustOMS Philippines codebase. The IDOR vulnerability in the client portal is exploitable today. The `CRM_LATE_FILING_DAYS` module-level constant requires deployment cycles for regulatory threshold changes. Both proposals must proceed to implementation, subject to the following mandatory conditions:

### Mandatory Conditions (Blocking for Production Deployment)

**CP-SEC:**
1. **Implement DB-derived client identity** (Alternative A) instead of JWT claim extraction. The `req.user.clientId` assumption is not satisfied by the current `auth.ts` middleware. DB-derived identity is safer and avoids token migration complexity.
2. **Fail-closed, not fail-open**. If DB lookup fails to return a clientId for an authenticated user, the middleware must return HTTP 403 rather than proceeding.
3. **Restrict client portal router to client-only users** at the route registration level. Back-office staff must not access client portal routes — they must use dedicated back-office endpoints.
4. **Store violation thresholds in SYSCONFIG**. `CP_SEC_VIOLATION_THRESHOLD` and `CP_SEC_VIOLATION_WINDOW_SECONDS` must be runtime-configurable, not hardcoded.

**SYSCONFIG:**
1. **Execute schema migration** adding `value_type`, `min_value`, `max_value`, `requires_approval`, and `is_sensitive` columns before UAT.
2. **Add scoped role guard on PUT**. Register system-config PUT outside `requireBackOfficeRole()` with explicit `requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN')` enforcement.
3. **Implement PostgreSQL LISTEN/NOTIFY** for cache invalidation across all application instances. A TTL-only cache is not acceptable for compliance-driving thresholds.
4. **Remove or rewrite `config-versioning-service.ts`**. Its in-memory version history is not durable. The hash-chained audit log is the authoritative change history.
5. **Migrate `call-report-service.ts`** to read `CRM_LATE_FILING_DAYS` from SYSCONFIG with the DB-backed cache. Remove the module-level constant after successful UAT.

### Recommended Conditions (Strongly Advised)

1. Add nullable `scope_type` and `scope_id` columns to the `system_config` schema for forward compatibility with per-branch overrides.
2. Load test the DB-derived identity LRU lookup to verify p95 latency impact is under 10ms.
3. Document the alert-handling SLA for CP-SEC exception queue entries (recommended: P2, 8-hour SLA matching the existing exception queue framework).
4. After 30 days of production CP-SEC data, review false-positive rate on the 3-violations threshold and calibrate.

---

## 9. Recommended Next Steps

### Immediate (Before Development Begins)

1. **Clarify client portal JWT architecture**: Confirm with the auth-service owner that DB-derived client identity is the approved approach for CP-SEC. Document this in an Architecture Decision Record (ADR).
2. **Write the SYSCONFIG schema migration**: Create a Drizzle migration file adding the five missing columns. Include a seed migration for the `CRM_LATE_FILING_DAYS` initial value.
3. **Audit all client portal routes** in `server/routes/client-portal.ts` and produce a complete list of routes that accept a `:clientId` or similar parameter without an ownership check. There are at least five; there may be more.
4. **Confirm the role guard for system-config PUT** with the back-office team. Determine whether the `beforeUpdate` hook approach or the separate route registration approach is preferred.

### Short Term (Sprint 1-2)

5. **Implement DB-derived client identity resolver** as a standalone middleware (`server/middleware/portal-identity.ts`) with LRU cache. Cover with unit tests for: authenticated client (success), authenticated client with DB miss (403), unauthenticated request (401), network error during DB lookup (fail-closed, 503 with retry-after header).
6. **Implement CP-SEC middleware** consuming the portal identity. Apply to the client portal router. Write integration tests for IDOR scenarios with mismatched clientIds.
7. **Execute SYSCONFIG schema migration** and verify that the CRUD router correctly enforces the `is_sensitive` redaction on GET and the `requires_approval` maker-checker routing on PUT.
8. **Implement PostgreSQL LISTEN/NOTIFY** for cache invalidation. Test in a 2-instance local Docker environment.

### Medium Term (Sprint 3-4)

9. **Migrate `call-report-service.ts`** to read from SYSCONFIG. Run parallel evaluation (old env var vs new DB value) for 1 week in a staging environment to confirm parity.
10. **Remove `CRM_LATE_FILING_DAYS` environment variable** from all deployment manifests once DB migration is confirmed stable.
11. **Decommission `config-versioning-service.ts`** after the audit log is confirmed as the version history source.
12. **Production deployment** of CP-SEC on client portal routes, with monitoring dashboards for:
    - CP-SEC violation counts per session
    - Ownership middleware p95 latency impact
    - Exception queue entries from CP-SEC alerts
    - SYSCONFIG PUT event frequency and actor distribution

### Long Term (3-6 Months)

13. **Extend SYSCONFIG** to support per-branch scope overrides once the hierarchical schema migration is in place.
14. **Evaluate OpenFeature SDK** for enterprise-grade feature flag management as the number of configurable thresholds grows beyond 20 keys.
15. **Conduct VAPT** on the client portal with CP-SEC in place to confirm IDOR closure and verify no new attack surfaces were introduced by the portal identity resolver.
16. **Calibrate CP-SEC alert thresholds** using 30 days of production violation data and update `CP_SEC_VIOLATION_THRESHOLD` in SYSCONFIG accordingly.

---

*Evaluation conducted by adversarial review process — TrustOMS Philippines Engineering Review Board*
*Date: 2026-04-25*
*Status: APPROVE WITH CONDITIONS — 9 mandatory conditions to resolve before production deployment*
