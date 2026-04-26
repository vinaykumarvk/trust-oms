# Phased Plan: BRD Gap Closure (14 Items)

**Date:** 2026-04-22
**Source Audit:** `docs/reviews/brd-coverage-trustoms-philippines-brd-final-2026-04-22.md`
**Target:** Bring implementation rate from 90.3% → 96%+ DONE

---

## Phase 1: Schema Additions (Foundation)

All new tables/columns needed by subsequent phases. No service logic changes yet.

| Task | Schema Change | Used By |
|------|--------------|---------|
| 1A | Add `documentDeficiencies` table (client_id, doc_type, required, submitted, deficiency_status, deadline) | FR-PTC-015 |
| 1B | Add `complianceBreachCuring` table (breach_id, detected_at, curing_deadline, escalation_level, cured_at) | FR-PTC-022 |
| 1C | Add `fxHedgeLinkages` table (order_id, hedge_type, notional, forward_rate, maturity_date, linked_settlement_id) | FR-CSH-003 |
| 1D | Add `settlement_status` enum value + `is_receivable` boolean to `positions` table | FR-PTC-012 |
| 1E | Add `secondary_nav_source`, `secondary_nav_value`, `deviation_pct`, `deviation_flagged` to `navComputations` | FR-NAV-005 |
| 1F | Add `blockWaitlistEntries` table (block_id, order_id, priority_rank, requested_qty, allocated_qty, waitlist_status) | FR-AGG-009 |
| 1G | Add `risk_product_category` to `securities`, `csa_waiver_status` + `csa_waiver_expiry` to `clientProfiles` | FR-PTC-021 |
| 1H | Add `postTradeReviewSchedules` table (portfolio_id, frequency, last_run, next_run, is_active) | FR-PTC-005 |

**Dependencies:** None (foundation layer)

---

## Phase 2: Pre-Trade Validation — P1 NOT_FOUND (3 gaps)

New checks added to `pre-trade-validation-service.ts` `validateOrder()` orchestrator.

| Task | FR | Check Function | Logic |
|------|------|---------------|-------|
| 2A | FR-PTC-015 | `checkDocumentDeficiency()` | Query `documentDeficiencies` for client; hard-block if any OUTSTANDING past deadline |
| 2B | FR-PTC-021 | `checkHigherRiskProduct()` | Compare `securities.risk_product_category` vs `clientProfiles.risk_tolerance`; soft-breach + CSA waiver prompt if mismatch |
| 2C | FR-PTC-022 | `checkBreachCuringPeriod()` | Query `complianceBreachCuring` for portfolio; hard-block if uncured breaches past curing deadline |

**Dependencies:** Phase 1 (1A, 1G, 1B)

---

## Phase 3: Pre-Trade Validation — P2 PARTIAL (6 gaps)

Fixes/additions to existing pre-trade checks in the validation orchestrator.

| Task | FR | Change | Logic |
|------|------|--------|-------|
| 3A | FR-PTC-010 | `checkTaxStatusIPT()` | For inter-portfolio T+0 transfers, verify both portfolios share same tax status |
| 3B | FR-PTC-012 | `checkTradeHoldingsReceivable()` | Tag unsettled buy positions as receivable; exclude from available qty |
| 3C | FR-PTC-013 | `checkFatcaProductRestriction()` | Query `clientFatcaCrs.us_person`; if true, block orders on FATCA-restricted products |
| 3D | FR-PTC-014 | `checkPendingOrdersPrompt()` | Show pending orders in same security (not just duplicates) as soft warning |
| 3E | FR-PTC-017 | `checkIPOVolumeAvailable()` | Query IPO available volume; hard-block if order qty exceeds remaining |
| 3F | FR-PTC-005 | Add scheduled post-trade review service | Configurable daily/weekly job runner using `postTradeReviewSchedules` |

**Dependencies:** Phase 1 (1D, 1H), Phase 2

---

## Phase 4: Cross-Module Service Gaps (5 gaps)

| Task | FR | Service | Change |
|------|------|---------|--------|
| 4A | FR-ONB-004 | `tax-engine-service.ts` | Auto-propagate FATCA/CRS flags from `clientFatcaCrs` when computing WHT |
| 4B | FR-NAV-005 | NAV service | Add dual-source deviation check with 0.25% threshold auto-flagging |
| 4C | FR-CSH-003 | `fx-rate-service.ts` | Add FX hedge linkage CRUD + exposure-to-hedge linking |
| 4D | FR-CON-006 | `contribution-service.ts` | Add unmatched inventory endpoint with live volume decrement |
| 4E | FR-AGG-009 | `aggregation-service.ts` | Add waitlist queue for residual fills + auto-reallocation on backout |

**Dependencies:** Phase 1 (1C, 1E, 1F)

---

## Phase 5: Test Coverage

Add test cases covering all 14 new/modified checks.

| Task | Test File | Coverage |
|------|-----------|----------|
| 5A | `tests/e2e/pre-trade-compliance.spec.ts` | New tests for FR-PTC-015, 021, 022, 010, 012, 013, 014, 017 |
| 5B | Existing service specs | Tests for FR-ONB-004, NAV-005, CSH-003, CON-006, AGG-009, PTC-005 |

**Dependencies:** Phases 2, 3, 4

---

## Execution Order (Dependency Graph)

```
Phase 1 (Schema) ──────────────────────┐
    │                                    │
    ├── Phase 2 (P1 Pre-Trade) ──┐      │
    │                             │      │
    ├── Phase 3 (P2 Pre-Trade) ──┤      │
    │                             │      │
    └── Phase 4 (Cross-Module) ──┤      │
                                  │      │
                                  └── Phase 5 (Tests)
```

Phase 1 runs first. Phases 2, 3, 4 can run in parallel after Phase 1. Phase 5 runs last.
