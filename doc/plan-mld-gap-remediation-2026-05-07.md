# MLD OMS Gap Remediation — Phased Plan

## Context
Remediating 9 NOT_FOUND/PARTIAL gaps from BRD coverage audit + adding test coverage.

## Phase 1: Early Termination Logic (FR-11.EC-01, FR-11.EC-02) — Service
**Files**: `server/services/oems-service.ts`
- Add `earlyTerminateMldOrder(orderId, data, userId)` method
  - data: `{ terminationAmount, terminationReason, penaltyRatePercent?, penaltyType? }`
  - Supports full + partial termination (partial = pro-rata principal + min interest only)
  - Penalty formula: configurable per tranche via `payoff_formula.earlyTerminationPenalty`
  - Issues UNHOLD for terminated portion
  - Updates fixing_outcome to TERMINATED, calculates net payout
  - Fires notification event
- Add `calculateEarlyTerminationPayout()` pure function
  - Inputs: principalAmount, terminatedAmount, minimumInterestRate, taxRate, penaltyRate, daysHeld, tenorDays
  - Accrued interest = terminatedAmount × (minRate/100) × (daysHeld/tenorDays)
  - Penalty = terminatedAmount × (penaltyRate/100)
  - Net = terminatedAmount + accruedInterest - penalty - tax

## Phase 2: Market Data Client + Barrier Observation (FR-10.EC-01, FR-10.EC-02)
**Files**: `server/services/mld-market-data-client.ts` (NEW), `server/jobs/mld-barrier-observation.ts` (NEW)
- Market data client following platform-feature-client.ts pattern
  - Env: `MLD_MARKET_DATA_URL`, `MLD_MARKET_DATA_API_KEY`
  - `fetchFixingLevel(underlying, date?)` → `{ level, source, timestamp }`
  - Graceful null when unconfigured
- Background job: `mld-barrier-observation.ts`
  - npm script: `"mld:observe-barriers"`
  - Queries all tranches with lifecycle=FIXING_PENDING and observation_period active
  - For each: fetches fixing level from market data client
  - Compares against upper_limit/lower_limit based on option_type
  - If barrier hit: records fixing outcome automatically, transitions lifecycle
  - Logs results, exits

## Phase 3: OJK Regulatory Report (FR-13.EC-01, FR-13.AC-05)
**Files**: `server/services/oems-service.ts`, `server/routes/oems.ts`
- Add `generateMldOjkReport(params, userId)` method
  - params: `{ reportDate, periodFrom, periodTo, reportType: 'MONTHLY' | 'QUARTERLY' }`
  - Queries all matured MLD orders in period
  - Aggregates: total placements, total payouts, tax collected, tranche count
  - Returns structured JSON + updates tranche `regulatory_report_status`
- Route: `GET /mld/reports/ojk` with query params
- Report fields per OJK format: product type, underlying, tenor, amount, rate, tax

## Phase 4: Trade Confirmation + Bloomberg STP Stub (FR-13.EC-02, FR-08.EC-01, FR-08.EC-02)
**Files**: `server/services/oems-service.ts`, `server/services/mld-treasury-client.ts` (NEW)
- Trade confirmation notification in `tradeMldOrder()`:
  - After successful trade, dispatch `OEMS_MLD_TRADE_CONFIRMATION` with final_term_sheet_url
  - Channels: EMAIL + IN_APP
  - Attachment policy: passwordProtected: true
- Bloomberg/FXGO STP client stub:
  - `mld-treasury-client.ts` following platform-feature-client.ts pattern
  - Env: `MLD_TREASURY_STP_URL`, `MLD_TREASURY_STP_API_KEY`
  - `submitDealToBloomberg(deal)` → `{ dealId, status } | null`
  - `subscribeDealingFeed(callback)` → unsubscribe function
  - Graceful null when unconfigured (all methods)

## Phase 5: Route + Early Termination Route
**Files**: `server/routes/oems.ts`
- `POST /mld/orders/:orderId/early-terminate` → earlyTerminateMldOrder()

## Phase 6: E2E Test Suite
**Files**: `tests/e2e/oems-mld-lifecycle.spec.ts` (NEW)
- Vitest suite following oems-deaggregation-allocation.spec.ts pattern
- Test groups:
  1. Schema presence (6 MLD tables, lifecycle enum values)
  2. calculateMldPayout() (MAX_RETURN, MIN_RETURN, TERMINATED, edge cases)
  3. calculateEarlyTerminationPayout() (full, partial, penalty, zero-days)
  4. normalizeMldOutcome() (valid + invalid inputs)
