# Feature Life Cycle Report: Metrobank Remaining Gap Closures
**Date:** 2026-05-01

## Pipeline Status

| Step | Status | Output |
|------|--------|--------|
| 1. BRD Generation | SKIPPED | Gap requirements from Metrobank gaps.md |
| 2-3. Eval | SKIPPED | skip-eval |
| 4. Test Cases | SKIPPED | skip-tests |
| 5. Gap Analysis | DONE | 9 remaining PARTIAL/MISSING gaps identified |
| 6-7. Plan + Execute | DONE | Schema + service + routes |
| 8. Build Validation | DONE | 0 new TS errors |
| 9. Full Review | CONDITIONAL | |
| 10. Local Deployment | DEFERRED | |

## Gaps Closed

| Gap ID | Area | What Was Done |
|--------|------|---------------|
| MB-GAP-002 | User Admin Guards | userAdminGuardService: validateUserDeactivation() checks pending orders/approvals/settlements before deactivation; validateBranchAuthorizerCoverage() ensures at least one active authorizer in branch |
| MB-GAP-005 | Scheduler Extensions | schedulerExtensionService: scheduleCouponEvents() for fixed-income coupon scheduling; scheduleMaturityEvents() for maturity date monitoring; listUpcomingEvents() |
| MB-GAP-010 | Fee Monitoring | feeMonitoringService: checkAumDeviations() scans fee plans for threshold breaches; getUncollectedFees() finds overdue invoices; listAlerts()/acknowledgeAlert() for alert lifecycle |
| MB-GAP-011 | Performance (TWR/IRR) | performanceCalculationService: computeTWR() using Modified Dietz method; computeIRR() using Newton's XIRR approximation; snapshotPerformance() persists YTD snapshots; getPerformanceHistory() |
| MB-GAP-012 | Fee Waivers | feeWaiverService: requestWaiver() with FULL/PARTIAL/DISCOUNT_PCT/DISCOUNT_ABS types + exemption classes; approveWaiver() with segregation-of-duties; rejectWaiver(); listWaivers() |
| MB-GAP-015 | Standing Payments | standingPaymentService: createInstruction() with frequency/banking-day-rule; suspendInstruction(); resumeInstruction(); cancelInstruction(); executeDueInstructions() for EOD scheduler |
| MB-GAP-020 | Check Management | checkManagementExtService: stopPayment() with reason tracking; detectStaleChecks() auto-marks stale; reconcileChecks() batch matching; getOutstandingChecks() |
| MB-GAP-022 | Document Checklists | documentChecklistService: createChecklist() with items; assignChecklist() creates per-item tracking; updateAssignment() for submission/review; getCompletionStatus() with mandatory completion %; getDeficiencyAging() |
| MB-GAP-032 | Regulatory Reports | regulatoryReportExtService: queueReportRun() for BSP/BIR/SEC/AMLC/IC types; startReportRun()/completeReportRun()/failReportRun(); markDispatched(); listReportRuns(); getDispatchSummary() |

## New Schema Tables

| Table | Description |
|-------|-------------|
| fee_monitoring_alerts | AUM deviation alerts with severity, threshold, acknowledgement lifecycle |
| performance_snapshots | TWR/IRR snapshots with GIPS compliance flag, attribution by asset class/security |
| fee_waivers | Waiver requests with approval workflow, exemption classes, discount computation |
| standing_payment_instructions | Recurring payment instructions with frequency, banking-day rules, execution tracking |
| document_checklists | Checklist templates per product/transaction type |
| document_checklist_items | Individual documents within checklists (mandatory/optional, copy type, max age) |
| document_checklist_assignments | Per-account tracking of document submission/review status |
| regulatory_report_runs | Report execution queue with dispatch tracking, encryption flag, email recipients |

## Schema Extensions

| Table | Columns Added |
|-------|--------------|
| check_register | stop_payment_date, stop_payment_reason, stop_payment_requested_by, reconciled, reconciled_date, bank_statement_ref |

## New API Endpoints (38)

| Method | Path | Gap |
|--------|------|-----|
| GET | /metrobank/users/:userId/deactivation-check | MB-GAP-002 |
| GET | /metrobank/users/:userId/authorizer-coverage | MB-GAP-002 |
| POST | /metrobank/scheduler/coupon-events | MB-GAP-005 |
| POST | /metrobank/scheduler/maturity-events | MB-GAP-005 |
| GET | /metrobank/scheduler/upcoming/:portfolioId | MB-GAP-005 |
| POST | /metrobank/fee-monitoring/check-deviations | MB-GAP-010 |
| GET | /metrobank/fee-monitoring/uncollected | MB-GAP-010 |
| GET | /metrobank/fee-monitoring/alerts | MB-GAP-010 |
| POST | /metrobank/fee-monitoring/alerts/:alertId/acknowledge | MB-GAP-010 |
| GET | /metrobank/performance/:portfolioId/twr | MB-GAP-011 |
| GET | /metrobank/performance/:portfolioId/irr | MB-GAP-011 |
| POST | /metrobank/performance/:portfolioId/snapshot | MB-GAP-011 |
| GET | /metrobank/performance/:portfolioId/history | MB-GAP-011 |
| POST | /metrobank/fee-waivers | MB-GAP-012 |
| POST | /metrobank/fee-waivers/:waiverId/approve | MB-GAP-012 |
| POST | /metrobank/fee-waivers/:waiverId/reject | MB-GAP-012 |
| GET | /metrobank/fee-waivers | MB-GAP-012 |
| POST | /metrobank/standing-instructions | MB-GAP-015 |
| GET | /metrobank/standing-instructions/:portfolioId | MB-GAP-015 |
| POST | /metrobank/standing-instructions/:id/suspend | MB-GAP-015 |
| POST | /metrobank/standing-instructions/:id/resume | MB-GAP-015 |
| POST | /metrobank/standing-instructions/:id/cancel | MB-GAP-015 |
| POST | /metrobank/standing-instructions/execute-due | MB-GAP-015 |
| POST | /metrobank/checks/:checkId/stop-payment | MB-GAP-020 |
| POST | /metrobank/checks/detect-stale | MB-GAP-020 |
| POST | /metrobank/checks/reconcile | MB-GAP-020 |
| GET | /metrobank/checks/outstanding | MB-GAP-020 |
| POST | /metrobank/document-checklists | MB-GAP-022 |
| GET | /metrobank/document-checklists | MB-GAP-022 |
| POST | /metrobank/document-checklists/assign | MB-GAP-022 |
| PATCH | /metrobank/document-checklists/assignments/:assignmentId | MB-GAP-022 |
| GET | /metrobank/document-checklists/completion | MB-GAP-022 |
| GET | /metrobank/document-checklists/deficiency-aging | MB-GAP-022 |
| POST | /metrobank/regulatory-reports/queue | MB-GAP-032 |
| POST | /metrobank/regulatory-reports/:runId/start | MB-GAP-032 |
| POST | /metrobank/regulatory-reports/:runId/complete | MB-GAP-032 |
| POST | /metrobank/regulatory-reports/:runId/dispatch | MB-GAP-032 |
| GET | /metrobank/regulatory-reports | MB-GAP-032 |
| GET | /metrobank/regulatory-reports/dispatch-summary | MB-GAP-032 |

## Files Changed

| File | Change |
|------|--------|
| packages/shared/src/schema.ts | +8 tables, +6 columns on check_register, +7 columns on securities |
| server/services/metrobank-gap-closures-service.ts | NEW ~1200 lines |
| server/routes/back-office/metrobank-extensions.ts | NEW ~350 lines, 38 endpoints |
| server/routes/back-office/index.ts | +import and mount |

## Deferred Items

| Gap ID | Reason |
|--------|--------|
| MB-GAP-001 | NFR (concurrent user load testing) — requires infrastructure-level testing, not application code |
| MB-GAP-004 | External Metrobank integrations (CASA, RM, AMLA, etc.) — requires Metrobank API contracts |
| MB-GAP-016 | CASA real-time balance validation — requires production CASA interface |
| MB-GAP-033 | Vendor support/implementation timeline — procurement requirement, not application feature |
