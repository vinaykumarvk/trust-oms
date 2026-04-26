# Gap Analysis: HAM (Handover & Assignment Management) Release 1

**Date:** 2026-04-22
**Analyst:** Claude Opus 4.6
**Codebase Commit:** `1d0f244` (main branch)
**BRD Reference:** `docs/Handover_Assignment_Management_BRD_v2_FINAL.docx`

---

## Executive Summary

The Trust OMS codebase contains a **rudimentary RM handover table** (`rm_handovers`) and a basic CRUD route, but lacks the full HAM module infrastructure required by Release 1. Of the 11 functional requirements, **0 are fully met**, **3 are partially addressed** by existing primitives, and **8 are entirely missing**. All 7 new data model tables are absent. Significant net-new work is required across schema, services, routes, and frontend layers.

---

## Summary

| Classification | Count | Percentage |
|---------------|-------|------------|
| **EXISTS**    | 0     | 0%         |
| **PARTIAL**   | 3     | 27%        |
| **MISSING**   | 8     | 73%        |
| **CONFLICT**  | 0     | 0%         |
| **Total**     | **11**| 100%       |

---

## 1. Functional Requirement Gap Matrix

| FR ID | Requirement | Status | Evidence / Notes |
|-------|------------|--------|------------------|
| FR-001 | Lead Handover Initiation | **PARTIAL** | `rm_handovers` table exists with `entity_type` text field (could be "LEAD") and `from_rm_id`/`to_rm_id` FK refs. However: missing `handover_code` auto-generation, missing `handover_items` child table for multi-entity bundling, missing status enum (`draft`, `pending_auth`, etc.), missing the `bulk_pending_review` workflow. CRUD route at `/rm-handovers` exists but lacks domain logic (initiation, validation, state machine). |
| FR-002 | Prospect Handover Initiation | **PARTIAL** | Same `rm_handovers` table can hold `entity_type = 'PROSPECT'`. `prospects` table exists with `assigned_rm_id` FK. However: no prospect-specific handover validation (e.g., negative list clearance check), no handover_items grouping, no multi-entity batch support. |
| FR-003 | Client Handover with Scrutiny Checklist | **MISSING** | `clients` table exists with `client_id` PK. However: no `scrutiny_checklist_items` table, no `scrutiny_templates` table (13 default items), no checklist completion gate logic. The `rm_handovers` table has no FK to a scrutiny checklist. No service enforcing "all mandatory items must be marked PASS/WAIVED before authorization". |
| FR-004 | Handover Authorization (Checker Approval) | **PARTIAL** | Existing maker-checker infrastructure: `approvalRequests` table, `approvalWorkflowDefinitions` table, `maker-checker.ts` middleware, `denyBusinessApproval()` guard. Roles `BO_MAKER`/`BO_CHECKER` exist. However: no handover-specific authorization flow, no self-handover prevention (from_rm !== checker), no SoD enforcement specific to handovers, no status transition `pending_auth -> authorized/rejected`. |
| FR-012 | Compliance Gate Checks | **MISSING** | No `compliance_gates` table. No service checking KYC status, sanctions screening status, or open regulatory items before authorizing a handover. `sanctionsScreeningLog` and `kycCases` tables exist and could be queried, but no integration point for handover compliance gating. |
| FR-021 | Handover Reversal | **MISSING** | `reversal-service.ts` exists as a pattern reference (for transaction reversals), but no handover reversal logic. No status transition `authorized -> reversed`. No reversal reason capture, no re-assignment of entities back to original RM, no reversal audit trail entry. |
| FR-022 | Client Notification on RM Change | **MISSING** | `notificationService` exists with `dispatch()` method supporting IN_APP, EMAIL, SMS, PUSH channels. `notificationTemplates` table exists with `template_code`, `channel`, `locale`, `body_template`. However: no `RM_CHANGE` event type template seeded, no handover-triggered notification dispatch, no client-facing notification (existing notifications are internal/RM-facing). |
| FR-013 | SLA Tracking and Escalation | **MISSING** | No `sla_configurations` table. `approvalRequests` has `sla_deadline` and `is_sla_breached` fields (partial concept), and `approvalWorkflowDefinitions` has `sla_hours`. However: no SLA cron/scheduler for handovers, no escalation chain, no SLA breach notification dispatch. |
| FR-014 | Handover Dashboard | **MISSING** | No handover dashboard page exists in `apps/back-office/src/pages/`. No route registered in `apps/back-office/src/routes/index.tsx`. Pattern references available: `claims-workbench.tsx` (tabbed workbench with filters, KPIs, status badges), `tco-dashboard.tsx` (metrics cards + tables). |
| FR-016 | Notification Engine | **MISSING** | `notificationService` (server) exists with `dispatch()`, `send()`, retry/DLQ logic, PII sanitization for SMS, consent-aware bypass for regulatory events. `notificationTemplates` table exists. However: no handover event types registered, no template seeding for handover events (e.g., `HANDOVER_INITIATED`, `HANDOVER_AUTHORIZED`, `HANDOVER_REVERSED`, `RM_CHANGE_NOTICE`). |
| FR-018 | Audit Trail Viewer | **MISSING** | `auditRecords` table exists (hash-chained, append-only with `previous_hash`/`record_hash`). `auditEvents` table exists (TFP-specific). Audit dashboard page exists at `/compliance/audit`. However: no `handover_audit_log` table (HAM-specific append-only log), no handover-specific audit viewer UI, no "before/after" snapshot for RM assignment changes. |

---

## 2. Data Model Gaps

### 2.1 Required Tables vs. Existing

| Table | Status | Notes |
|-------|--------|-------|
| `handovers` | **MISSING** | `rm_handovers` exists but is structurally insufficient. Lacks: `handover_code` (auto-gen), proper status enum (needs `draft`, `pending_auth`, `authorized`, `rejected`, `cancelled`, `bulk_pending_review`, `reversed`), `scrutiny_complete` flag, `compliance_gate_result` JSONB, `sla_deadline` timestamp, `reversed_at`/`reversed_by`/`reversal_reason` fields. Current table uses `approvalStatusEnum` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`) which is missing `DRAFT`, `BULK_PENDING_REVIEW`, `REVERSED`. **Recommendation:** Create new `handovers` table rather than alter `rm_handovers` to avoid breaking CRM module. |
| `handover_items` | **MISSING** | No equivalent exists. Needed for multi-entity bundling with columns: `handover_id` FK, `entity_type` (LEAD/PROSPECT/CLIENT), `entity_id`, `item_status` (INCLUDED/EXCLUDED/TRANSFERRED), plus unique constraint on `(entity_id) WHERE item_status IN ('INCLUDED','TRANSFERRED')`. |
| `scrutiny_checklist_items` | **MISSING** | No equivalent. Needs: `handover_id` FK, `template_item_id` FK, `result` (PASS/FAIL/WAIVED/PENDING), `checked_by`, `checked_at`, `notes`. |
| `scrutiny_templates` | **MISSING** | No equivalent. Needs: `item_code`, `description`, `category`, `is_mandatory`, `entity_type_applicability`. 13 default items to be seeded. |
| `compliance_gates` | **MISSING** | No equivalent. Needs: `handover_id` FK, `gate_type` (KYC_VALID/SANCTIONS_CLEAR/NO_PENDING_CA/AML_CLEAR), `gate_status` (PASS/FAIL/OVERRIDE), `checked_at`, `details` JSONB. |
| `handover_audit_log` | **MISSING** | No equivalent. Existing `auditRecords` is a general-purpose table. HAM BRD requires a dedicated append-only log with: `handover_id` FK, `action`, `from_status`, `to_status`, `actor_id`, `actor_role`, `timestamp`, `ip_address`, `snapshot` JSONB. |
| `sla_configurations` | **MISSING** | No equivalent. Needs: `entity_type`, `action`, `sla_hours`, `escalation_chain` JSONB, `is_active`. Related: `approvalWorkflowDefinitions.sla_hours` exists but is not handover-specific. |

### 2.2 Existing Tables Referenced by HAM

The following tables exist and will be referenced by the HAM module:

| Table | Purpose in HAM | Exists | PK Type |
|-------|---------------|--------|---------|
| `users` | `from_rm_id`, `to_rm_id`, `approved_by`, `actor_id` FKs | Yes | `serial (id)` |
| `clients` | Entity being handed over; `assigned_rm` concept (implicit via portfolios) | Yes | `text (client_id)` |
| `leads` | Entity being handed over; has `assigned_rm_id` FK | Yes | `serial (id)` |
| `prospects` | Entity being handed over; has `assigned_rm_id` FK | Yes | `serial (id)` |
| `kyc_cases` | Compliance gate: KYC validity check | Yes | `serial (id)` |
| `sanctions_screening_log` | Compliance gate: sanctions clearance check | Yes | `serial (id)` |
| `notification_log` | Notification dispatch logging | Yes | `serial (id)` |
| `notification_templates` | Template-based notifications | Yes | `serial (id)` |
| `audit_records` | General audit trail (hash-chained) | Yes | `bigserial (id)` |
| `approval_requests` | Maker-checker queue integration | Yes | `serial (id)` |
| `approval_workflow_definitions` | Workflow config | Yes | `serial (id)` |
| `portfolios` | Client-portfolio relationship for handover scope | Yes | `text (portfolio_id)` |

### 2.3 Existing Enums Reusable or Needing Extension

| Enum | Current Values | HAM Needs | Action |
|------|---------------|-----------|--------|
| `handover_type` | `PERMANENT`, `TEMPORARY` | Same | **REUSE** |
| `approval_status` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` | `DRAFT`, `PENDING_AUTH`, `AUTHORIZED`, `REJECTED`, `CANCELLED`, `BULK_PENDING_REVIEW`, `REVERSED` | **NEW ENUM** needed (`handover_status`) |
| `audit_action` | `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `ACCESS`, `EXPORT`, `AUTHORIZE`, `REJECT`, `REVERSE` | `INITIATE`, `SUBMIT`, `AUTHORIZE`, `REJECT`, `REVERSE`, `CANCEL` | **EXTEND** or create HAM-specific enum |
| `notification_channel` | `IN_APP`, `EMAIL`, `SMS`, `PUSH`, `PAGER_DUTY` | Same | **REUSE** |
| `maker_checker_tier` | `TWO_EYES`, `FOUR_EYES`, `SIX_EYES` | Same | **REUSE** |

---

## 3. API / Route Gaps

### 3.1 Current State

| Route | File | Status |
|-------|------|--------|
| `/api/v1/rm-handovers` | `server/routes/back-office/index.ts` (line 569-577) | **EXISTS** but CRUD-only via `createCrudRouter`. No domain-specific endpoints. |
| `/api/v1/handovers` | N/A | **MISSING** |

### 3.2 Required Endpoints (HAM Release 1)

The following endpoints are **all MISSING** and need to be created in a new route file `server/routes/back-office/handovers.ts`:

| Method | Endpoint | FR | Description |
|--------|---------|-----|-------------|
| `POST` | `/api/v1/handovers` | FR-001/002/003 | Create handover (draft or submit) |
| `GET` | `/api/v1/handovers` | FR-014 | List handovers (paginated, filterable) |
| `GET` | `/api/v1/handovers/:id` | FR-014 | Get handover detail with items + checklist |
| `PATCH` | `/api/v1/handovers/:id` | FR-001/002/003 | Update draft handover |
| `POST` | `/api/v1/handovers/:id/submit` | FR-001/002/003 | Submit for authorization (`draft -> pending_auth`) |
| `POST` | `/api/v1/handovers/:id/authorize` | FR-004 | Checker approves (`pending_auth -> authorized`) |
| `POST` | `/api/v1/handovers/:id/reject` | FR-004 | Checker rejects (`pending_auth -> rejected`) |
| `POST` | `/api/v1/handovers/:id/cancel` | FR-001 | Cancel draft/pending (`draft/pending_auth -> cancelled`) |
| `POST` | `/api/v1/handovers/:id/reverse` | FR-021 | Reverse authorized handover (`authorized -> reversed`) |
| `GET` | `/api/v1/handovers/:id/compliance-gates` | FR-012 | Run/get compliance gate checks |
| `POST` | `/api/v1/handovers/:id/compliance-gates/run` | FR-012 | Execute compliance gate checks |
| `GET` | `/api/v1/handovers/:id/scrutiny` | FR-003 | Get scrutiny checklist for handover |
| `PATCH` | `/api/v1/handovers/:id/scrutiny/:itemId` | FR-003 | Update scrutiny checklist item result |
| `GET` | `/api/v1/handovers/:id/audit` | FR-018 | Get audit trail for a handover |
| `GET` | `/api/v1/handovers/dashboard/summary` | FR-014 | Dashboard KPI summary |
| `GET` | `/api/v1/handovers/sla/breached` | FR-013 | SLA breach list |
| `GET` | `/api/v1/scrutiny-templates` | FR-003 | List scrutiny templates |
| `POST` | `/api/v1/scrutiny-templates` | FR-003 | Create scrutiny template |

### 3.3 Route Registration

`server/routes.ts` will need a new import and registration:

```typescript
import handoversRouter from './routes/back-office/handovers';
// ...
app.use('/api/v1/handovers', handoversRouter);
```

### 3.4 Route Pattern Reference

The `campaigns.ts` route file (line 1-50 of `server/routes/back-office/campaigns.ts`) provides the best pattern to follow:
- Uses `requireBackOfficeRole()` for base guard
- Uses `denyBusinessApproval()` + `requireAnyRole()` for approval endpoints
- Domain service imports with explicit method calls
- Standard error handling pattern with `try/catch` and `res.status(400).json()`

---

## 4. Service Gaps

### 4.1 Required Services

| Service | File | Status | Notes |
|---------|------|--------|-------|
| `handover-service.ts` | `server/services/handover-service.ts` | **MISSING** | Core domain service. Handles: initiation, validation, state machine transitions, entity re-assignment, multi-entity bundling. Pattern reference: `reversal-service.ts` (state machine), `claims-service.ts` (lifecycle + notification). |
| `handover-compliance-gate-service.ts` | `server/services/handover-compliance-gate-service.ts` | **MISSING** | Compliance gate orchestrator. Must query: `kycCases` (KYC validity), `sanctionsScreeningLog` (sanctions clearance), open corporate actions, AML flags. Pattern reference: `sanctions-service.ts` (entity screening). |
| `handover-scrutiny-service.ts` | `server/services/handover-scrutiny-service.ts` | **MISSING** | Scrutiny checklist management. Template CRUD, instance creation per handover, completion validation. |
| `handover-sla-service.ts` | `server/services/handover-sla-service.ts` | **MISSING** | SLA deadline computation, breach detection (cron-driven), escalation dispatch. Pattern: Could integrate with existing `approvalRequests.sla_deadline` concept. |
| `handover-notification-service.ts` | `server/services/handover-notification-service.ts` | **MISSING** | Handover-specific notification orchestrator. Delegates to existing `notificationService.dispatch()`. Manages template selection by event type and channel. |
| `handover-audit-service.ts` | `server/services/handover-audit-service.ts` | **MISSING** | Append-only audit log writer. Captures before/after snapshots. Optionally integrates with existing `auditRecords` for cross-module audit queries. |

### 4.2 Existing Services to Integrate With

| Service | File | Integration Point |
|---------|------|-------------------|
| `notification-service.ts` | `server/services/notification-service.ts` | Dispatch handover notifications (exists, reusable) |
| `sanctions-service.ts` | `server/services/sanctions-service.ts` | Compliance gate: sanctions screening (exists, callable) |
| `consent-service.ts` | `server/services/consent-service.ts` | Optional: consent check before RM change notification |
| `circuit-breaker.ts` | `server/services/circuit-breaker.ts` | Wrap external calls (sanctions API) in circuit breaker |
| `audit-logger.ts` | `server/services/audit-logger.ts` | `logAuditEvent()` for role-auth audit entries (exists) |

---

## 5. Frontend Gaps

### 5.1 Pages

| Page | Path | Status | Notes |
|------|------|--------|-------|
| Handover Dashboard | `/operations/handover-dashboard` or `/crm/handovers` | **MISSING** | No page file exists. Need: KPI summary cards (pending, authorized, reversed, SLA breached), filterable handover list table, status badges, action buttons. Pattern: `claims-workbench.tsx` |
| Handover Detail/Wizard | `/crm/handovers/:id` or `/crm/handovers/new` | **MISSING** | Multi-step form: select entities, fill reason, scrutiny checklist, compliance gates, submit. Pattern: `fee-plan-wizard.tsx` |
| Scrutiny Checklist Panel | (embedded in detail) | **MISSING** | Checklist items with PASS/FAIL/WAIVE toggles. |
| Audit Trail Viewer | (embedded tab or standalone) | **MISSING** | Timeline view of handover actions. Pattern: `audit-explorer.tsx` (TrustFees Pro) |

### 5.2 Route Registration

`apps/back-office/src/routes/index.tsx` needs new entries. No handover routes exist. Need to add:

```tsx
const HandoverDashboard = React.lazy(() => import("@/pages/handover-dashboard"));
const HandoverWizard = React.lazy(() => import("@/pages/handover-wizard"));
// Route entries under CRM or Operations section
```

### 5.3 Navigation

The `BackOfficeLayout` sidebar navigation needs a "Handovers" menu item. This is not currently present.

---

## 6. Middleware Gaps

### 6.1 Role Authorization

| Requirement | Status | Notes |
|-------------|--------|-------|
| `BO_MAKER` can initiate handovers | **EXISTS** | Role defined in `role-auth.ts` |
| `BO_CHECKER` can authorize handovers | **EXISTS** | Role defined in `role-auth.ts` |
| `RELATIONSHIP_MANAGER` can initiate own handovers | **EXISTS** | Role defined in `requireFrontOfficeRole()` |
| `SENIOR_RM` can authorize handovers | **EXISTS** | Role defined in `requireFrontOfficeRole()` |
| `COMPLIANCE_OFFICER` can override compliance gates | **EXISTS** | Role defined in `requireComplianceRole()` |
| Handover-specific role guard (e.g., `requireHandoverRole()`) | **MISSING** | Need new guard combining BO + FO + Compliance roles for handover operations |
| Self-handover prevention middleware | **MISSING** | Ensure `from_rm_id !== checker_id` and `from_rm_id !== to_rm_id` |

### 6.2 Permission Matrix

The `PERMISSION_MATRIX` in `role-auth.ts` (line 163-168) needs handover entries:

```typescript
handover: {
  create: ['BO_MAKER', 'RELATIONSHIP_MANAGER', 'SENIOR_RM'],
  authorize: ['BO_CHECKER', 'BO_HEAD', 'SENIOR_RM'],
  reverse: ['BO_HEAD', 'COMPLIANCE_OFFICER'],
  override_compliance: ['COMPLIANCE_OFFICER', 'CCO'],
}
```

### 6.3 Consent Check

`server/middleware/consent-check.ts` exists with `requireConsent(purpose)`. Could be applied to client notification endpoints to ensure marketing consent is checked before non-regulatory RM change notifications.

---

## 7. Integration Gaps

### 7.1 Cross-Module Integration Points

| Integration | Source Module | Target Module | Status | Notes |
|-------------|-------------|---------------|--------|-------|
| KYC validity check | HAM | KYC (`kyc_cases`) | **MISSING** | Need to query `kyc_status` for all entities in handover |
| Sanctions re-screening | HAM | Sanctions (`sanctions_screening_log`) | **MISSING** | Need to call `sanctionsService.screenEntity()` as compliance gate |
| Notification dispatch | HAM | Notifications (`notification_log`) | **MISSING** | Need to call `notificationService.dispatch()` on state transitions |
| Audit trail write | HAM | Audit (`audit_records`) | **MISSING** | Need to call `logAuditEvent()` on every state transition |
| Maker-checker queue | HAM | Approvals (`approval_requests`) | **MISSING** | Optional: integrate with existing approval queue for handover authorization |
| Entity re-assignment (Leads) | HAM | CRM (`leads.assigned_rm_id`) | **MISSING** | On `authorized` status, update `leads.assigned_rm_id` to `to_rm_id` |
| Entity re-assignment (Prospects) | HAM | CRM (`prospects.assigned_rm_id`) | **MISSING** | On `authorized` status, update `prospects.assigned_rm_id` to `to_rm_id` |
| Entity re-assignment (Clients) | HAM | Clients | **MISSING** | Clients don't have a direct `assigned_rm_id`; may need portfolio-level RM assignment or a new field on `clients` |

### 7.2 Data Consistency Risk: Client RM Assignment

**CONFLICT RISK:** The `clients` table has no `assigned_rm_id` column. Client-to-RM assignment is implied through portfolio-level relationships. The HAM module needs a clear FK path for "who manages this client." Options:
1. Add `assigned_rm_id` to `clients` table (schema change, migration needed)
2. Use `portfolios` as the join path (complex, one client may have multiple portfolios with different RMs)
3. Introduce a new `client_rm_assignments` junction table

This is flagged as a **design decision** required before implementation.

---

## 8. Non-Functional Gaps

### 8.1 i18n (Internationalization)

| Requirement | Status | Notes |
|-------------|--------|-------|
| i18n framework | **EXISTS** | `packages/shared/src/i18n/index.ts` with `t(locale, key)` function |
| English translations | **EXISTS** | `en.json` with common UI strings |
| Filipino translations | **EXISTS** | `fil.json` |
| Handover-specific translations | **MISSING** | No `handover.*` keys in either locale file |

### 8.2 Accessibility

| Requirement | Status | Notes |
|-------------|--------|-------|
| Accessibility utilities | **EXISTS** | `apps/back-office/src/lib/accessibility.ts` |
| Handover page ARIA labels | **MISSING** | No handover pages exist yet |

### 8.3 Testing

| Requirement | Status | Notes |
|-------------|--------|-------|
| E2E test infrastructure | **EXISTS** | Multiple spec files in `tests/e2e/` (e.g., `reversal-service.spec.ts`, `sanctions-service.spec.ts`) |
| Handover E2E tests | **MISSING** | No `handover*.spec.ts` file exists |

---

## 9. Migration Strategy Recommendation

### Phase 1: Schema & Data Model (Week 1)
1. Create new `handover_status` pgEnum with all 7 values
2. Create all 7 new tables with proper FKs and constraints
3. Seed `scrutiny_templates` with 13 default items
4. Add `assigned_rm_id` to `clients` table (or alternative - design decision)
5. Seed `notification_templates` with handover event types
6. Add `handover` entry to `PERMISSION_MATRIX`

### Phase 2: Services & Routes (Week 2)
1. Implement `handover-service.ts` (core state machine)
2. Implement `handover-compliance-gate-service.ts`
3. Implement `handover-scrutiny-service.ts`
4. Implement `handover-audit-service.ts`
5. Create `server/routes/back-office/handovers.ts` with all endpoints
6. Register in `server/routes.ts`

### Phase 3: Frontend & Integration (Week 3)
1. Build `handover-dashboard.tsx` page
2. Build `handover-wizard.tsx` page
3. Register routes in `apps/back-office/src/routes/index.tsx`
4. Add navigation menu item
5. Add i18n translations

### Phase 4: SLA, Notifications & Testing (Week 4)
1. Implement `handover-sla-service.ts` with cron scheduler
2. Implement notification dispatch integration
3. Write E2E tests
4. Add handover-specific audit trail viewer

---

## 10. Existing Code Reuse Opportunities

| Asset | Location | Reuse for |
|-------|----------|-----------|
| `createCrudRouter` | `server/routes/crud-factory.ts` | Base CRUD for `scrutiny_templates`, `sla_configurations` |
| `reversal-service.ts` | `server/services/reversal-service.ts` | State machine pattern (request -> approve -> execute) |
| `claims-service.ts` | `server/services/claims-service.ts` | Lifecycle + notification + approval tier pattern |
| `campaigns.ts` route | `server/routes/back-office/campaigns.ts` | Custom domain route pattern (lifecycle endpoints beyond CRUD) |
| `sanctions-service.ts` | `server/services/sanctions-service.ts` | Compliance gate: entity screening callable |
| `consent-check.ts` | `server/middleware/consent-check.ts` | Optional consent middleware for client notifications |
| `circuit-breaker.ts` | `server/services/circuit-breaker.ts` | Wrapping external dependency calls |
| `claims-workbench.tsx` | `apps/back-office/src/pages/claims-workbench.tsx` | Dashboard UI pattern (tabs, KPIs, status badges, table) |
| `fee-plan-wizard.tsx` | `apps/back-office/src/pages/trustfees/fee-plan-wizard.tsx` | Multi-step wizard UI pattern |
| `notificationService` | `server/services/notification-service.ts` | Dispatch notifications on handover events |
| `auditRecords` table + `logAuditEvent()` | `server/services/audit-logger.ts` | General audit trail writing |
| `approvalRequests` table | `packages/shared/src/schema.ts` | Maker-checker queue integration |
| `denyBusinessApproval()` | `server/middleware/role-auth.ts` | Block SYSTEM_ADMIN from authorizing handovers |

---

## 11. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| `clients` table lacks `assigned_rm_id` column | **HIGH** | Design decision needed before schema migration. Recommend adding column. |
| `rm_handovers` table collision with HAM `handovers` table | **MEDIUM** | Create new `handovers` table; deprecate or keep `rm_handovers` for CRM backward compatibility. Avoid renaming to prevent breaking existing CRM CRUD routes. |
| `entity_id` type mismatch: `leads.id` is `serial(int)`, `clients.client_id` is `text` | **MEDIUM** | `handover_items.entity_id` must be `text` to accommodate both. Cast lead/prospect integer IDs to text. |
| No cron/scheduler infrastructure visible for SLA breach detection | **MEDIUM** | Check if EOD orchestrator (`eod-orchestrator.ts`) can be extended, or introduce a lightweight `node-cron` job. |
| Notification templates not seeded for handover events | **LOW** | Add seed migration with handover notification templates. |

---

## Appendix A: File Reference

| File | Path | Relevance |
|------|------|-----------|
| Schema | `/Users/n15318/Trust OMS/packages/shared/src/schema.ts` | All table/enum definitions |
| Route index (back-office) | `/Users/n15318/Trust OMS/server/routes/back-office/index.ts` | CRUD route registration (rm-handovers at line 569) |
| Route registry | `/Users/n15318/Trust OMS/server/routes.ts` | Top-level API route registration |
| Role auth middleware | `/Users/n15318/Trust OMS/server/middleware/role-auth.ts` | Role guards + permission matrix |
| Consent check middleware | `/Users/n15318/Trust OMS/server/middleware/consent-check.ts` | Consent gating middleware |
| Frontend routes | `/Users/n15318/Trust OMS/apps/back-office/src/routes/index.tsx` | React router configuration |
| Reversal service | `/Users/n15318/Trust OMS/server/services/reversal-service.ts` | State machine pattern reference |
| Claims service | `/Users/n15318/Trust OMS/server/services/claims-service.ts` | Lifecycle + notification pattern |
| Sanctions service | `/Users/n15318/Trust OMS/server/services/sanctions-service.ts` | Entity screening pattern |
| Consent service | `/Users/n15318/Trust OMS/server/services/consent-service.ts` | Consent management pattern |
| Notification service | `/Users/n15318/Trust OMS/server/services/notification-service.ts` | Notification dispatch engine |
| Circuit breaker | `/Users/n15318/Trust OMS/server/services/circuit-breaker.ts` | Circuit breaker pattern |
| i18n framework | `/Users/n15318/Trust OMS/packages/shared/src/i18n/index.ts` | Translation function `t()` |
| i18n English | `/Users/n15318/Trust OMS/packages/shared/src/i18n/en.json` | English locale strings |
| i18n Filipino | `/Users/n15318/Trust OMS/packages/shared/src/i18n/fil.json` | Filipino locale strings |
| Claims workbench UI | `/Users/n15318/Trust OMS/apps/back-office/src/pages/claims-workbench.tsx` | Dashboard UI pattern |
| Campaigns route | `/Users/n15318/Trust OMS/server/routes/back-office/campaigns.ts` | Domain route pattern |
| HAM BRD | `/Users/n15318/Trust OMS/docs/Handover_Assignment_Management_BRD_v2_FINAL.docx` | Requirements source |
