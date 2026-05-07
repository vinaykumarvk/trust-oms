# ODA Cutover And Rollback Runbook

Date: 2026-05-06

## Scope

This runbook governs release of `OEMS_ODA_TICKET_V1`, product/security master enforcement, source evidence classification, transactional order submission, audit replay, outbox publishing, and degraded-mode reconciliation obligations.

## Pre-Cutover Gates

1. Product/security master records for ODA are `ACTIVE`, effective-dated, and linked to certified traceability rules.
2. `ODA_MINIMUM_TRUSTWORTHY_ORDER` policy traceability is `CERTIFIED` and not past recertification date.
3. `ODA_ORDER_APPROVAL` workflow is `ACTIVE` with maker and checker roles mapped.
4. Integration adapters used for production handoff are `ACTIVE`, `CERTIFIED`, security-policy `ACTIVE`, and `mock_mode=false`.
5. Fee/tax schedules for ODA are `ACTIVE`, effective on the cutover date, and linked to the correct settlement calendar.
6. Control ownership records exist for product governance, integration operations, back office checker, and compliance risk.
7. Latest verification has passed:
   - `npm run check`
   - `npm run test:run -- tests/e2e/danamon-oems.spec.ts tests/e2e/oems-deaggregation-allocation.spec.ts`
   - `npm run build -w apps/back-office`

## Cutover Steps

1. Apply `drizzle/20260506_add_oems_minimum_trustworthy_order.sql`.
2. Seed ODA product/security master and policy traceability records.
3. Seed fee/tax schedule and approval workflow records.
4. Enable `OEMS_ODA_TICKET_V1` for pilot roles.
5. Run one synthetic ODA ticket through create, validate, submit, approval queue, audit replay, and outbox verification.
6. Compare control tower queue, audit replay, and reconciliation obligation counts with the synthetic run log.
7. Expand role allow-list after first-day operational sign-off.

## Rollback Steps

1. Disable `OEMS_ODA_TICKET_V1`.
2. Stop outbound adapter workers and preserve outbox state.
3. Drain or cancel pending ODA product tickets that have no submitted order.
4. Reconcile submitted orders using `/api/v1/oems/audit-replay`.
5. Execute the reviewed rollback SQL for this migration only after confirming no production orders depend on newly added tables.
6. Register rollback evidence through the migration rollback script registry.

## Post-Cutover Controls

Control owners must attest within 5 business days, reconcile all `DEGRADED_APPROVED` obligations within SLA, and attach evidence to the quarterly recertification report.
