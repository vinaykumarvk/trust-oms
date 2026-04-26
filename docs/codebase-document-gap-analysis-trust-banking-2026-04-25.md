# Trust Banking Gap Register - Current Code Review

**Source documents:** `/docs` BRDs, design notes, and Trust Banking workflows reviewed in the broader gap analysis  
**Codebase reviewed:** current workspace as of 2026-04-25  
**Scope:** only gaps still relevant to a Trust Banking business and still visible after recent code changes  
**Companion file:** `docs/codebase-document-gap-analysis-2026-04-25.md`

## Refresh Summary

Many previously listed gaps have been implemented or materially reduced. This version keeps only items that still need development, hardening, or validation before they should be part of an immediate Trust Banking plan.

Notable improvements found in the current code:

- Lead and prospect onboarding now include format validation, field-level audit, consent audit, negative-list screening, and inactive/expired negative-list filtering.
- Service requests now include status history, document-name persistence, reassignment support, DB-level filtering, validation notes, terminal-state guards, and notifications.
- Meeting and call-report workflows now include attendee validation, duration validation, cancellation/reschedule notifications, duplicate call-report protection, and a DB partial unique index for meeting-linked call reports.
- Handover and RM delegation now include branch/location/language filters, per-row bulk-upload audit, branch-aware delegation checks, and reassignment updates across lead/prospect/client records.
- Risk-profiling admin workflows now include stronger normalization validation, overlap checks, readiness checks, and approval/rejection notifications.
- TrustFees now has PDF invoice generation, ad-hoc fee maker-checker flow, FX stamping/variance controls, DSAR/content-pack services, and stronger fee-plan audit.
- GL reversal and batch failure handling have been materially improved.
- Corporate Actions now includes amend/cancel/replay paths, anomaly checks, client election UI, tax recomputation/correction flows, STT and 1604-E handling, and degraded-mode scaffolding.
- Common Trust functions now include NAV deviation dual-source support and FX hedge-linkage logic.

## Immediate Trust Banking Gap Register

### A. Core Trust Banking Entity Model and Base Account Foundation

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-A-001 | P0 | Trust Banking base account, holding account, security account, CIF, TSA, CSA, and related-party models are still not implemented as first-class product foundations. | Shared schema and services still center on clients, leads, prospects, TrustFees, GL, and Corporate Actions rather than the base account stack described in Trust Banking docs. | These are foundational for onboarding, settlement, custody, billing, statements, and regulatory reporting. |
| TB-A-002 | P0 | Onboarding conversion still does not appear to produce the full Trust Banking account structure after prospect/client conversion. | `server/services/conversion-service.ts` exists, but current evidence does not show creation of base accounts, holding accounts, security accounts, TSA/CSA, mandate records, or related-party structures. | Trust Banking cannot reliably move from prospect to operational client without account foundation creation. |
| TB-A-003 | P1 | External core-banking integration remains mostly stubbed or partial. | Finacle-style integration services and several domain connectors still appear to be local/in-memory or placeholder implementations. | Trust Banking needs durable synchronization with CIF, accounts, payments, settlement, tax, and statement systems. |

### B. Lead, Prospect, and Client Onboarding

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-B-001 | P1 | Duplicate detection is still not consistently enforced as a controlled onboarding decision with override/audit workflow. | Lead/prospect create paths now compute or store more fields and run negative-list checks, but current evidence does not show a unified dedupe service call, soft-stop decisioning, override reason capture, or reviewer approval. | Trust Banking onboarding needs defensible duplicate handling across individuals, entities, beneficial owners, and related parties. |
| TB-B-002 | P1 | UBO/authorized signatory/related-party onboarding remains incomplete. | Current onboarding evidence is still lead/prospect/client centric; no full related-party capture, ownership hierarchy, or signatory mandate workflow was found. | Trust Banking client structures often require legal entity relationships, UBO checks, signatory controls, and mandate limits. |
| TB-B-003 | P2 | Onboarding validations are stronger but not yet product-specific to Trust Banking mandates. | Format checks, mandatory fields, and negative-list checks exist; product-specific mandate/account setup validations are not evident. | Generic onboarding validation is not enough for trust, custody, escrow, agency, and nominee services. |

### C. Meetings, Call Reports, and RM Supervision

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-C-001 | P1 | Late call-report filing logic is not yet fully driven by governed system configuration, RM timezone, business calendar, and holiday rules. | `server/services/call-report-service.ts` uses an environment fallback for late-filing days and Date-based calculation; full SystemConfig/timezone/holiday enforcement is not evident. | SLA breaches and supervisory escalation must be consistent, explainable, and auditable. |
| TB-C-002 | P2 | Meeting conflict and market-holiday warning logic remains incomplete. | Meeting validation now checks future time, duration, invitees, and cancellation/reschedule rules; no clear duplicate/conflict or holiday-warning logic was found. | RMs need scheduling controls for client meetings, branch calendars, and regulated market events. |
| TB-C-003 | P2 | Approval auto-unclaim is implemented but needs business-day and branch-calendar hardening. | `server/services/approval-workflow-service.ts` includes stale auto-unclaim handling, but current evidence points to a simple age-based rule rather than branch/business-calendar calculation. | Checker workload management should match documented two-working-day rules, not just elapsed calendar time. |

### D. RM Handover, Delegation, and Bulk Maintenance

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-D-001 | P1 | Cross-branch handover authorization routing and escalation are still not explicit enough. | Handover listing supports branch and supervisor filters, and reassignment updates core entities, but a dedicated cross-branch checker routing/escalation model is not evident. | RM moves across branches need clear authorization ownership and audit defensibility. |
| TB-D-002 | P1 | Bulk handover processing still appears synchronous and request-payload driven rather than background-job based with upload limits. | Bulk preview/process routes and per-row audit exist, but durable background processing, file-size enforcement, resumability, and operational retry controls are not evident. | Large RM portfolio transfers should not depend on a single web request or unbounded payload. |
| TB-D-003 | P2 | Bulk-upload failure remediation is audited but not yet a full operational workbench. | Per-row success/failure audit exists; no clear queue, retry, assignment, or exception-resolution workflow was found. | Operations teams need to resolve failed handover rows without rerunning entire files. |

### E. Client Portal Service Requests and Evidence Handling

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-E-001 | P0 | Client portal service-request ownership is still not consistently session-derived or enforced. | `server/routes/client-portal.ts` still exposes paths using `:clientId`; detail/update/close/resubmit style routes are not visibly guarded by ownership checks for the authenticated client. | This is a tenant/privacy boundary for Trust Banking clients. |
| TB-E-002 | P1 | Service-request document evidence currently stores names/metadata, not a durable upload/download/scanning workflow. | Client portal create/detail pages pass file names into `documents`; no clear storage object, virus scan, evidence download, or retention workflow was found. | Many Trust Banking requests require proof documents and regulated retention. |
| TB-E-003 | P1 | Service-request ID generation is safer but still not a true database sequence. | `server/services/service-request-service.ts` uses MAX-based generation with retry, not a PostgreSQL sequence or atomic counter. | Request IDs must remain deterministic under concurrency and audit review. |
| TB-E-004 | P1 | RM reassignment exists but role gating still needs tightening. | Back-office service-request routes are protected by back-office access, but reassignment does not clearly enforce Ops Manager/Admin-only authority. | Assignment changes affect client service ownership and should be limited to approved roles. |

### F. Risk Profiling and Investment Suitability

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-F-001 | P1 | Rejected risk questionnaires may still be deletable or editable through inconsistent guards. | Service guards block authorized/rejected questionnaire edits, but delete protection appears focused on authorized status; UI disablement also appears inconsistent. | Authorized and rejected governance records should remain immutable except through controlled versioning. |
| TB-F-002 | P1 | Asset-allocation asset classes are not clearly governed by a product/security taxonomy. | Asset allocation validations check percentage totals and categories, but no clear controlled taxonomy binding was found. | Suitability outputs must map to actual products, asset classes, and reporting categories. |
| TB-F-003 | P2 | Suitability disclosures and acceptance evidence remain basic. | Disclaimer/disclosure fields exist, but no rich content versioning, client acceptance capture, or proposal-level disclosure evidence was found. | Risk-profile recommendations need client-facing disclosure traceability. |

### G. TrustFees, Billing, Accounting, and Reporting

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-G-001 | P0 | Product-specific fee formulas and base amount sourcing are still incomplete for all Trust Banking products. | Accrual and fee engines exist, but some fee base/formula paths still appear generic or placeholder-driven for escrow, custody, agency, and other variants. | Fee accuracy directly affects client invoices, revenue recognition, tax, and disputes. |
| TB-G-002 | P1 | Step-function fee validation still needs full window-completeness enforcement. | Fee-plan validation now checks several bounds and audit rules; no clear guarantee was found that tier windows are contiguous, non-overlapping, and cover the configured billing base. | Tier gaps or overlaps can create billing leakage or overcharging. |
| TB-G-003 | P1 | Accounting-event integration is not yet a production-grade event contract. | EOD/accrual services exist, but durable external accounting event publishing, schema registry/versioning, idempotency keys, and downstream acknowledgement are not clearly complete. | Billing and accruals must reconcile to the general ledger and finance systems. |
| TB-G-004 | P1 | Report-pack generation appears schema-backed but not complete as an operational service. | Report-pack tables/logs exist; current evidence does not show a complete template-to-output generation service with delivery, retry, and audit. | Trust Banking clients require recurring statements, billing packs, and regulatory packs. |
| TB-G-005 | P2 | DSAR/content-pack capabilities need end-to-end workflow hardening. | DSAR and content-pack services exist, but production controls such as approvals, delivery evidence, SLA tracking, and archival proof still need validation. | Privacy and client-data export workflows are operationally sensitive. |

### H. Corporate Actions

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-H-001 | P0 | Production-grade external feed parsers/connectors are still incomplete. | Corporate Actions now has richer service workflows, but SWIFT/ISO/DTCC/PSE-style feed parsing and connector implementations still appear stubbed, in-memory, or simulated. | Corporate Actions depend on authoritative external event feeds. |
| TB-H-002 | P0 | Election and entitlement reconciliation still lacks full external triad coverage. | Internal reconciliation and correction flows exist, but complete reconciliation against custody feed, accounting books, and client statements is not evident. | Entitlement errors create financial, client, and regulatory risk. |
| TB-H-003 | P1 | Dynamic corporate-action event fields remain incomplete. | Event workflows exist, but per-event-type dynamic fields and validation appear limited/static. | Dividends, rights, splits, tender offers, and redemptions require different data structures. |
| TB-H-004 | P1 | Client election channels are still incomplete beyond the portal/back-office path. | Client election UI exists, but branch-assisted, RM-assisted, SMS/email fallback, and maker-checker-assisted election capture are not clearly complete. | Trust Banking clients often submit elections through assisted channels. |
| TB-H-005 | P1 | eFPS/tax authority integration is still not production-grade. | Tax computation and retry scaffolding exist, but eFPS submission still appears simulated or connector-light. | Tax filings need external acknowledgement, retry, and evidence capture. |
| TB-H-006 | P1 | Degraded-mode and feed-failover state is not yet durable enough for production. | Degraded-mode and failover services exist, but current evidence points to in-memory/simulated operational state. | Feed outages must survive restarts and support audit review. |
| TB-H-007 | P2 | Privacy breach notification workflow remains incomplete. | Translation keys or labels exist, but no complete incident workflow, DPO approval, notification evidence, or regulator SLA tracking was found. | Corporate Actions and client data events can trigger privacy notification obligations. |

### I. Common Trust Operations and Data Quality

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-I-001 | P1 | Contribution matching and unmatched inventory workbench remains incomplete. | Matching status exists, but a full operational queue for unmatched contributions, investigation, resolution, and ageing is not evident. | Unmatched cash/securities must be tracked and resolved promptly. |
| TB-I-002 | P1 | Exception management is still fragmented by domain. | Several modules now create notifications, histories, and retries, but a unified exception queue with ownership, SLA, severity, and closure evidence is not evident. | Trust Operations needs one control surface for client-impacting exceptions. |
| TB-I-003 | P2 | Domain event idempotency and replay guarantees are inconsistent. | Some modules have replay/retry concepts; a shared idempotency model across onboarding, fees, CA, GL, service requests, and handover is not evident. | Recovery and reconciliation depend on predictable replay behavior. |

### J. Client Portal, Statements, and Messaging

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-J-001 | P1 | Client portal messages remain mostly stub/static. | `apps/client-portal/src/pages/messages.tsx` still appears to use hardcoded or placeholder message data. | Client communications for service requests, CA elections, billing, and privacy notices need authenticated persistence. |
| TB-J-002 | P1 | Statement download remains incomplete or simulated. | `apps/client-portal/src/pages/statements.tsx` still appears to include stubbed download behavior. | Trust Banking clients need official statements with audit and retention. |
| TB-J-003 | P2 | Client portal evidence and notification history are not yet unified. | Service requests, CA elections, statements, and messages are still implemented as separate surfaces with uneven persistence. | Clients need a reliable record of requests, instructions, disclosures, and documents. |

### K. Cross-Cutting Security, Audit, and Compliance

| ID | Priority | Gap | Current Evidence | Why It Still Matters |
| --- | --- | --- | --- | --- |
| TB-K-001 | P0 | Some client-facing APIs still need ownership checks and object-level authorization review. | The service-request portal route is the clearest current example; similar object-level checks should be reviewed across statements, messages, elections, documents, and privacy workflows. | Trust Banking applications hold sensitive client and account data. |
| TB-K-002 | P1 | Audit coverage improved but is still not normalized across all domains. | Several services now write audit records, but audit event names, before/after payload shape, actor/source fields, and correlation IDs are inconsistent. | Regulatory review needs searchable, comparable audit evidence. |
| TB-K-003 | P1 | Operational notifications exist but are not yet a governed workflow layer. | Notifications are sent by several services; no universal acknowledgement, escalation, assignment, SLA, and closure model was found. | Operations teams need accountable handling, not only alerts. |
| TB-K-004 | P2 | Configuration governance is uneven. | Some rules are env-driven, some DB/config-driven, and some hardcoded. | Trust Banking thresholds should be reviewable, versioned, and auditable. |

## Dropped From Immediate Plan Since Previous Version

These items were removed from the active gap register because recent code now covers them fully or enough that they are no longer immediate Trust Banking planning items:

| Previous Area | Status |
| --- | --- |
| Lead/prospect basic validation, negative-list checks, consent audit, and field-level audit | Implemented or materially reduced |
| Service-request status history, basic document metadata, reassignment support, DB filtering, validation notes, and notifications | Implemented or materially reduced |
| Meeting invitee/duration/cancellation/reschedule validation and notifications | Implemented or materially reduced |
| Call-report meeting uniqueness and basic approval workflow constraints | Implemented or materially reduced |
| Handover branch/location/language filters, source-master coverage, per-row audit, and same-branch delegation checks | Implemented or materially reduced |
| Risk-profile normalization overlap/gap checks, readiness checks, and approval notifications | Implemented or materially reduced |
| TrustFees PDF invoice, ad-hoc fee maker-checker, payment variance controls, and FX stamping | Implemented or materially reduced |
| GL reversal reason capture and failed-batch retry/dead-letter handling | Implemented or materially reduced |
| Corporate Actions amend/cancel/replay, anomaly checks, client election screen, tax recompute/correction, STT, and 1604-E handling | Implemented or materially reduced |
| NAV deviation dual-source check and FX hedge-linkage logic | Implemented or materially reduced |

## Suggested Planning Stages

1. **Stage 1 - Control Boundary and Data Foundation:** TB-A, TB-E-001, TB-K-001.
2. **Stage 2 - Core Trust Operations:** TB-B, TB-D, TB-I.
3. **Stage 3 - TrustFees and Accounting Completion:** TB-G.
4. **Stage 4 - Corporate Actions Productionization:** TB-H.
5. **Stage 5 - Portal, Statements, and Communications:** TB-J plus remaining evidence workflows.
6. **Stage 6 - Governance Hardening:** TB-C, TB-F, TB-K.
