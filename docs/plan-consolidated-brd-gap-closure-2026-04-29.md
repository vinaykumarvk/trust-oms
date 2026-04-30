# Feature Lifecycle Plan: Consolidated BRD Gap Closure
**Date:** 2026-04-29  
**Input gap document:** `docs/reviews/consolidated-brd-gap-register-2026-04-29.md`  
**Lifecycle entry point:** Existing BRDs and gap analysis already exist, so this plan starts at feature-life-cycle Step 6 (phased execution plan) and preserves the Step 7 approval gate before code execution.

## Summary

The consolidated register contains 20 remediation workstreams spanning platform controls, CRM workflows, trust banking operations, accounting, external integrations, NFRs, UI, and automated tests. The work is too broad for a single safe code patch. Execution should proceed in dependency order, with each phase producing code, tests, validation notes, and an updated BRD coverage delta.

## Dependency Graph

```text
Phase 1: Control Foundation
  -> Phase 2: Scheduler, Upload, Notification Foundation
    -> Phase 3: CRM Operational Workflows
      -> Phase 4: Trust Banking + Portal Evidence
        -> Phase 5: Accounting, Settlement, Fees
          -> Phase 6: External Integration Adapters
            -> Phase 7: NFR, UI, Accessibility, Reporting
              -> Phase 8: Consolidated BRD Regression Tests
```

## Phase 1 — Control Foundation

| Task | Workstreams | Output |
|---|---|---|
| Object-level authorization review and fixes | WS-03 | Shared ownership/branch/hierarchy guards; client portal and back-office route application; tests for IDOR boundaries. |
| Normalized audit/status-history service | WS-04 | Shared audit/event shape, before/after payload helpers, correlation IDs, status-history writes for high-risk transitions. |
| Configuration governance baseline | WS-18 | System config validation, versioning, role gate, and cached lookup helper for late-filing/threshold consumers. |
| Test harness baseline | WS-01 | Shared Vitest helpers, seeded auth contexts, route/service test patterns. |

**Exit gate:** TypeScript compiles, control tests pass, and high-risk route clusters have object-authorization coverage.

## Phase 2 — Scheduler, Notification, Upload, And File Foundations

| Task | Workstreams | Output |
|---|---|---|
| Durable scheduler framework | WS-06 | Registered jobs for no-show, opportunity expiry, campaign activation, stale approval unclaim, retention, and late-filing reminders. |
| Notification preference model | WS-05 | Preference schema, critical-notification enforcement, in-app/email/SMS delivery abstraction, delivery audit. |
| Upload/document security layer | WS-07 | MIME/size validation, virus-scan adapter, validation report generation, document metadata/download guards. |
| External gateway adapter contracts | WS-02, WS-05 | SendGrid/Twilio-style webhook and retry interfaces with local simulated implementation. |

**Exit gate:** Scheduler jobs are idempotent; uploads reject invalid files; notification preferences cannot suppress critical events.

## Phase 3 — CRM Operational Workflows

| Task | Workstreams | Output |
|---|---|---|
| Campaign and lead rules | WS-08 | Rule dry-run endpoint, all BRD filter dimensions, 10-condition enforcement, dedupe wiring, 10K upload path, active campaign/list guards. |
| Campaign lifecycle corrections | WS-08 | APPROVED vs ACTIVE state fix, modification reapproval, completed/archive write protection, response uniqueness and gateway webhook handling. |
| Meetings/call reports/opportunities | WS-09 | Future/duration/conflict validation, business-day/timezone late filing, call report summary rules, branch-scoped approval claims, opportunity stage/status fields and expiry. |
| Calendar/call report reporting | WS-09, WS-19 | Supervisor dashboard, exports, overdue/no-show indicators, pagination envelope consistency. |

**Exit gate:** Campaign and CRM E2E tests cover create/approve/activate/dispatch/respond/report flows.

## Phase 4 — Trust Banking, Portal, HAM, And Evidence Workflows

| Task | Workstreams | Output |
|---|---|---|
| Trust banking account foundation design and schema | WS-11 | First-class account, holding, security, mandate, related-party, TSA/CSA structures and conversion creation path. |
| Client portal messages/statements/evidence | WS-07, WS-11, WS-20 | Persistent messages, statement download audit, document/evidence history, portal UI wired to APIs. |
| HAM and delegation closure | WS-10 | Cross-branch routing, async bulk job, entity master assignment reversal on expiry, delegate constraint enforcement, email delivery adapter, reporting. |
| Service request residual verification | WS-04, WS-07, WS-11 | Re-run SR gap tests against completed TB hardening sprint and patch any remaining deltas. |

**Exit gate:** Portal object authorization, evidence download, HAM assignment mutation, and service-request status history tests pass.

## Phase 5 — Accounting, Settlement, Fees, Risk, And Proposals

| Task | Workstreams | Output |
|---|---|---|
| Settlement and cash completion | WS-12 | External trustee transfer adapter, DVP/RVP state machine, cross-portfolio netting, cost-basis propagation, FX auto-conversion. |
| EIP/ERP/PERA completion | WS-13 | Scheduled order generation and adapter-based Finacle/BSP PERA-Sys integration surfaces. |
| GL hardening | WS-16 | GL retry queue, equalization/impairment scaffolding, fee min/max/override, MTM posting, GL reports. |
| TrustFeesPro completion | WS-15 | Product formula coverage, FX fallback/stamping/reconciliation, notional events, DSAR/content packs, collection triggers, report packs. |
| Risk/proposal completion | WS-14 | Deviation dialog/config, supervisor reject/comments, risk alerts/filter badges, what-if charts, suitability blockers and disclosure evidence. |

**Exit gate:** Accounting and suitability regression suites pass and produce auditable event histories.

## Phase 6 — External Integrations And Production Adapters

| Task | Workstreams | Output |
|---|---|---|
| Integration adapter interfaces | WS-02 | Typed adapters for SWIFT/FIX/Finacle/BSP/PSE/DTCC/ISO/eFPS/email/SMS with fake/local implementations. |
| Corporate Actions productionization | WS-17 | Feed parser contracts, dynamic field validations, election channels, reconciliation workflow, anomaly flags, degraded-mode persistence. |
| Gateway webhooks and retries | WS-02, WS-05 | Delivery status ingestion, exponential retry, dead-letter handling, operator dashboards. |

**Exit gate:** Contract tests pass for every adapter; production credentials remain configurable and absent from repo.

## Phase 7 — NFR, UI, Reporting, And Accessibility

| Task | Workstreams | Output |
|---|---|---|
| Observability and reliability | WS-18 | Health checks, metrics/tracing hooks, structured logs, dashboard-ready event counters. |
| Security hardening | WS-18 | MFA wiring where required, HSTS/TLS config documentation, rate limiting by tier/endpoint, encryption/KMS integration points. |
| Reporting and exports | WS-19 | PDF/CSV/Excel exports, report-pack generation, scorecards, ageing reports, history exports. |
| UI completion and WCAG verification | WS-20 | Missing views, filters, badges/tooltips, keyboard/ARIA improvements, responsive checks. |

**Exit gate:** Build, unit tests, route smoke tests, and UI accessibility spot checks pass.

## Phase 8 — Consolidated BRD Regression And Coverage Refresh

| Task | Workstreams | Output |
|---|---|---|
| Automated regression expansion | WS-01 | BRD-mapped test suites for platform, GL, CRM, HAM, TrustFees, CA, SR, risk/proposal, and portal. |
| Re-run coverage audit | All | Updated `docs/reviews/brd-coverage-*` delta reports and a refreshed consolidated gap register. |
| Lifecycle completion report | All | Final feature-life-cycle report with code changes, tests, residual deferred items, and local deployment status. |

**Exit gate:** No P0 BRD gaps remain; every intentionally deferred item has owner, reason, and future acceptance criteria.

## Execution Rules

- Re-verify each source gap before editing code because several reports predate later closure sprints.
- Prefer additive shared services over one-off module patches when a gap repeats across BRDs.
- Add tests in the same phase as the implementation, not as a final cleanup-only step.
- Keep external integrations behind typed adapters and local fakes unless vendor specs and credentials are supplied.
- Preserve existing user changes; the current dirty file `tsconfig.tsbuildinfo` is unrelated and must not be reverted.

## Approval Gate

Per the `feature-life-cycle` skill, execution pauses after this plan unless the user approves continuing or asks to run in autonomous mode. Recommended next action is Phase 1 only, because it closes cross-cutting P0 control risks and creates the test harness needed for later phases.

## Execution Progress — 2026-04-29

### Completed In This Pass

| Phase | Workstream | Closure |
|---|---|---|
| Phase 1 | WS-03 Client/object-level authorization | Added portfolio ownership enforcement for client portal allocation, performance, holdings, and transactions routes. |
| Phase 1 | WS-03 / WS-07 Portal evidence ownership | Added service-request ownership enforcement before client portal document upload. |
| Phase 2 | WS-05 Messaging, notifications, and preferences | Added persistent `notification_preferences` schema and async DB-backed preference checks for dispatch, including a service guard that critical notifications cannot be disabled. |
| Phase 2 | WS-06 Batch jobs and schedulers | Fixed scheduler jobs that imported `@shared/schema` via a nonexistent default export, and wired overdue call-report alerting to the governed `CRM_LATE_FILING_DAYS` system-config cache instead of reading only the environment fallback. |
| Phase 2 | WS-07 Upload, document, and file security | Added route-level bulk lead upload file validation for `.csv`/`.xlsx` only and optional 10MB `file_size_bytes` enforcement. |
| Phase 3 | WS-08 CRM campaign and lead rule correctness | Tightened bulk lead upload row validation to require `entity_type` and at least one contact method (`email` or `mobile_phone`) before a row is treated as valid. |
| Phase 3 | WS-08 CRM campaign and lead rule correctness | Added lead-list audience locking so lists assigned to `ACTIVE`, `APPROVED`, or `PENDING_APPROVAL` campaigns cannot be refreshed, manually changed, or populated through upload confirmation. |
| Phase 3 | WS-08 / WS-05 CRM campaign consent and opt-out correctness | Added public campaign unsubscribe/STOP intake that records append-only `OPTED_OUT` campaign consent events for email or SMS, and added regression coverage for SMS STOP footer behavior. |
| Phase 3 | WS-08 / WS-05 CRM campaign delivery tracking | Added a public provider-neutral campaign communication delivery webhook that updates aggregate delivery/bounce counts and maps provider callbacks to `DISPATCHING`, `COMPLETED`, or `FAILED`. |
| Phase 3 | WS-08 Lead/prospect negative-list screening | Added regression coverage proving negative-list screening filters expired entries and remains wired into lead creation. |
| Phase 3 | WS-03 / WS-08 Lead/prospect ownership and audit controls | Fixed prospect drop/reactivate route role propagation to use `req.userRole`, allowed `SENIOR_RM` as the SRM override role, and added regression coverage for ownership gates plus audit records. |
| Phase 3 | WS-05 / WS-08 Lead/prospect consent and create-path screening | Added regression coverage proving prospect creation is wired to negative-list screening, `PRE_CREATE` audit, and automatic marketing consent capture, matching the lead create path. |
| Phase 3 | WS-08 Lead rule criteria correctness | Enforced `criteria_name` uniqueness on rule updates, and added regression coverage for update/create uniqueness, inverted operators, NOT groups, and human-readable criteria preview routing. |
| Phase 3 | WS-09 Calendar, meetings, call reports, and opportunities | Replaced past scheduled-meeting auto-completion with a no-show scheduler path that marks stale meetings `NO_SHOW`, records `MEETING_NO_SHOW` conversation history, and notifies organizers. |
| Phase 3 | WS-09 Calendar, meetings, call reports, and opportunities | Moved opportunity expiry into `opportunityService.processExpiredOpportunities()`, preserved scheduler wiring, marked stale active opportunities `EXPIRED`, and recorded conversation-history evidence for automatic expiry. |
| Phase 3 | WS-09 Call report approval scheduler | Removed the duplicate inline auto-unclaim scheduler and retained a single service-owned `approvalWorkflowService.processExpiredClaims()` nightly job with regression coverage. |
| Phase 3 | WS-03 / WS-09 Call report approval controls | Normalized authenticated supervisor ids in approval claim/approve/reject routes and added regression coverage for branch-scoped claims, max claimed workload, decision audit history, and filing-RM notifications. |
| Phase 3 | WS-03 / WS-09 Call report action item controls | Tightened call-report action-item assignment so the service derives filer branch context when needed, stores the effective branch on the report, validates the final assignee after filing-RM defaulting, and rejects missing or cross-branch assignees. |
| Phase 3 | WS-09 / WS-19 Call report filtering and exports | Fixed call-report route ordering so `/approval-queue` and `/export` are not shadowed by `/:id`, and wired `meetingReason` through list/export filters into service-level query conditions. |
| Phase 3 | WS-05 / WS-09 Meeting reminder notifications | Wired meeting reminder jobs to the dedicated `reminder_24h_sent` and `reminder_1h_sent` flags so 24-hour and 1-hour reminders are independently idempotent. |
| Phase 3 | WS-06 / WS-08 Campaign scheduler lifecycle | Wired the campaign startup scheduler to run both activation/completion and the existing campaign EOD batch so stale completed campaigns are archived and expired campaign handovers are cancelled. |
| Phase 3 | WS-07 / WS-08 Campaign upload error reports | Fixed bulk lead upload parsing so persisted JSON-string `validated_data` feeds both CSV error report downloads and upload confirmation imports. |
| Phase 3 | WS-06 / WS-08 Lead/prospect retention job | Added service-owned retention purge methods and a nightly scheduler that soft-deletes stale dropped or not-interested leads and stale dropped prospects after the configured retention period. |
| Phase 3 | WS-09 Call report route correctness | Reordered mounted call-report routers so custom routes such as `/call-reports/search` are evaluated before dynamic `/:id` handlers. |
| Phase 3 | WS-09 Call report filtering | Wired `meetingReason` through the role-scoped custom `/call-reports/search` route, matching the standard list/export filter behavior. |
| Phase 3 | WS-03 / WS-09 Task assignment controls | Reused the CRM task branch-assignment guard for reassignment updates and passed authenticated actor role/branch context from task routes. |
| Phase 3 | WS-08 Campaign response integrity | Required `campaign_id` at the interaction logging route for campaign responses and added service protection for supplied-but-missing campaign records before response creation. |
| Phase 3 | WS-08 Campaign response modification controls | Extended the shared response update validator to block edits for archived campaigns and completed campaigns outside the 7-day response grace window. |
| Phase 3 | WS-03 / WS-09 Call report authenticated user propagation | Normalized authenticated user ids across call-report create, submit, feedback, parent-link, and approval-queue routes so owner-sensitive service calls cannot receive missing, string, or `NaN` actor ids. |
| Phase 3 | WS-03 / WS-09 Call report action item update authorization | Required authenticated actor context for action-item updates and restricted updates to the item assignee or creator. |
| Phase 3 | WS-04 / WS-09 Opportunity timeline audit | Added conversation-history creation for new opportunities and passed authenticated route actor context into opportunity creation for audit attribution. |
| Phase 3 | WS-05 / WS-09 Call report approval notification channels | Added persisted multi-channel CRM inbox notification helpers and wired late-submission plus approval-decision notifications to create both in-app and email-channel records, including call-report notification enum values. |
| Phase 3 | WS-08 Campaign event validation | Enforced `EVENT_INVITATION` conditional required fields (`event_name`, `event_date`, `event_venue`) on campaign create and update using merged current values. |
| Phase 3 | WS-08 / WS-14 Prospect recommendation status alignment | Added an additive `RECOMMENDED_FOR_CLIENT` prospect-status migration, made it the canonical recommendation status, and kept conversion/reporting compatible with legacy `RECOMMENDED` rows. |
| Phase 3 | WS-09 Call report timezone business-day calculation | Added RM timezone storage with an `Asia/Manila` fallback and changed late-filing business-day calculation to use the filing RM's timezone-local date. |

### Validation

| Command | Result |
|---|---|
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts` | PASS — 3 files, 7 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/scheduler-wiring.spec.ts` | PASS — 4 files, 9 tests |
| `npm run test:run -- tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/scheduler-wiring.spec.ts` | PASS — 2 files, 5 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts` | PASS — 5 files, 12 tests |
| `npm run test:run -- tests/e2e/opportunity-expiry-scheduler.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/scheduler-wiring.spec.ts` | PASS — 3 files, 9 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 6 files, 16 tests |
| `npm run test:run -- tests/e2e/campaign-upload-validation.spec.ts` | PASS — 1 file, 3 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 6 files, 17 tests |
| `npm run test:run -- tests/e2e/opportunity-task-notification.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 2 files, 67 tests |
| `npm run test:run -- tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-upload-validation.spec.ts` | PASS — 2 files, 6 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 7 files, 20 tests |
| `npm run test:run -- tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts` | PASS — 3 files, 10 tests |
| `npm run test:run -- tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/dedupe-negative-list.spec.ts` | PASS — 2 files, 40 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 9 files, 26 tests |
| `npm run test:run -- tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts` | PASS — 4 files, 59 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 11 files, 32 tests |
| `npm run test:run -- tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/campaign-lifecycle.spec.ts` | PASS — 2 files, 30 tests |
| `npm run test:run -- tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts` | PASS — 3 files, 7 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 13 files, 37 tests |
| `npm run test:run -- tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts` | PASS — 4 files, 14 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 14 files, 41 tests |
| `npm run test:run -- tests/e2e/approval-workflow-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts` | PASS — 2 files, 5 tests |
| `npm run test:run -- tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/meeting-callreport.spec.ts` | PASS — 2 files, 66 tests |
| `npm run test:run -- tests/e2e/call-report-routing-filters.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/meeting-callreport.spec.ts` | PASS — 3 files, 68 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 17 files, 48 tests |
| `npm run test:run -- tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/scheduler-wiring.spec.ts` | PASS — 3 files, 7 tests |
| `npm run test:run -- tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/campaign-management.spec.ts tests/e2e/campaign-lifecycle.spec.ts` | PASS — 3 files, 136 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 19 files, 52 tests |
| `npm run test:run -- tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-management.spec.ts` | PASS — 3 files, 113 tests |
| `npm run test:run -- tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-prospect-lifecycle.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts` | PASS — 4 files, 60 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 21 files, 58 tests |
| `npm run test:run -- tests/e2e/call-report-routing-filters.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/meeting-callreport.spec.ts` | PASS — 3 files, 69 tests |
| `npm run test:run -- tests/e2e/call-report-routing-filters.spec.ts` | PASS — 1 file, 3 tests |
| `npm run test:run -- tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/opportunity-task-notification.spec.ts` | PASS — 2 files, 65 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 22 files, 61 tests |
| `npm run test:run -- tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/campaign-management.spec.ts` | PASS — 2 files, 110 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 23 files, 64 tests |
| `npm run test:run -- tests/e2e/campaign-response-modification-lifecycle.spec.ts tests/e2e/campaign-management.spec.ts` | PASS — 2 files, 110 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/campaign-response-modification-lifecycle.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 24 files, 67 tests |
| `npm run test:run -- tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/meeting-callreport.spec.ts` | PASS — 3 files, 70 tests |
| `npm run test:run -- tests/e2e/call-report-action-item-update-auth.spec.ts tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/meeting-callreport.spec.ts` | PASS — 3 files, 69 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/campaign-response-modification-lifecycle.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 25 files, 70 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/campaign-response-modification-lifecycle.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-action-item-update-auth.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 26 files, 72 tests |
| `npm run test:run -- tests/e2e/opportunity-conversation-history.spec.ts tests/e2e/opportunity-task-notification.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts` | PASS — 3 files, 69 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/campaign-response-modification-lifecycle.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-action-item-update-auth.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts tests/e2e/opportunity-conversation-history.spec.ts` | PASS — 27 files, 74 tests |
| `npm run test:run -- tests/e2e/call-report-approval-notifications.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/meeting-callreport.spec.ts` | PASS — 4 files, 74 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/campaign-response-modification-lifecycle.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-action-item-update-auth.spec.ts tests/e2e/call-report-approval-notifications.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts tests/e2e/opportunity-conversation-history.spec.ts` | PASS — 28 files, 78 tests |
| `npm run test:run -- tests/e2e/campaign-event-validation.spec.ts tests/e2e/campaign-management.spec.ts tests/e2e/campaign-lifecycle.spec.ts` | PASS — 3 files, 136 tests |
| `npm run test:run -- tests/e2e/client-portal-ownership.spec.ts tests/e2e/notification-preferences.spec.ts tests/e2e/campaign-upload-validation.spec.ts tests/e2e/campaign-upload-error-report.spec.ts tests/e2e/campaign-interaction-integrity.spec.ts tests/e2e/campaign-response-modification-lifecycle.spec.ts tests/e2e/campaign-event-validation.spec.ts tests/e2e/lead-list-audience-lock.spec.ts tests/e2e/campaign-unsubscribe-optout.spec.ts tests/e2e/campaign-delivery-webhook.spec.ts tests/e2e/campaign-scheduler-lifecycle.spec.ts tests/e2e/negative-list-expiry-filter.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts tests/e2e/lead-prospect-retention-scheduler.spec.ts tests/e2e/lead-rule-criteria-controls.spec.ts tests/e2e/approval-auto-unclaim-scheduler.spec.ts tests/e2e/approval-workflow-controls.spec.ts tests/e2e/call-report-auth-user-propagation.spec.ts tests/e2e/call-report-action-item-controls.spec.ts tests/e2e/call-report-action-item-update-auth.spec.ts tests/e2e/call-report-approval-notifications.spec.ts tests/e2e/call-report-routing-filters.spec.ts tests/e2e/task-assignment-branch-controls.spec.ts tests/e2e/meeting-dual-reminders.spec.ts tests/e2e/scheduler-wiring.spec.ts tests/e2e/meeting-no-show-scheduler.spec.ts tests/e2e/opportunity-expiry-scheduler.spec.ts tests/e2e/opportunity-conversation-history.spec.ts` | PASS — 29 files, 80 tests |
| `npm run test:run` | PASS — 85 files, 2365 tests |
| `npm run test:run -- tests/e2e/prospect-recommended-status-migration.spec.ts tests/e2e/prospect-ownership-audit.spec.ts tests/e2e/lead-prospect-lifecycle.spec.ts tests/e2e/prospect-create-screening-consent.spec.ts` | PASS — 4 files, 60 tests |
| `npm run test:run` | PASS — 86 files, 2368 tests |
| `npm run test:run -- tests/e2e/call-report-timezone-business-days.spec.ts tests/e2e/meeting-callreport.spec.ts tests/e2e/scheduler-wiring.spec.ts` | PASS — 3 files, 69 tests |
| `npm run test:run` | PASS — 87 files, 2371 tests |
| `npm run check` | PASS |

### Remaining Scope

The larger later-phase items remain open: durable scheduler jobs, broader CRM opportunity/call-report schema work, HAM async processing/reporting, trust banking account foundation, settlement/cash completion, GL/TrustFees/Corporate Actions production hardening, external adapters, NFR/observability, and full BRD regression coverage.
