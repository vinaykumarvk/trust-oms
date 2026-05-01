# Phased Plan: Corporate Trust / Loan Management Module

**Date:** 2026-05-01
**BRD:** doc/brd-corporate-trust-loan-management.md
**Status:** Greenfield (all MISSING)

---

## Phase 1: Schema — Enums & Tables (DB Layer)

**Files:** `packages/shared/src/schema.ts`
**Dependencies:** None

### Tasks:
1. Add 12 new enums (loanFacilityStatusEnum, loanTypeEnum, etc.)
2. Add 13 new tables:
   - loan_facilities (master)
   - loan_participants
   - loan_availments
   - loan_payments
   - loan_amortization_schedules
   - loan_collaterals
   - loan_collateral_valuations
   - loan_documents
   - mpcs
   - loan_interest_accruals
   - loan_receivables
   - loan_amendments
   - loan_tax_insurance
3. Add indexes and foreign keys

**Verification:** `npm run build` passes

---

## Phase 2: Core Service — loan-service.ts

**Files:** `server/services/loan-service.ts`
**Dependencies:** Phase 1

### Tasks:
1. CRUD for loan facilities (create, get, list, update)
2. Status transitions (approve, activate, close, default)
3. Maker-checker workflow integration
4. Facility ID auto-generation (LF-YYYY-NNNN)
5. Balance reconciliation (outstanding = disbursed - payments)
6. Participant management (add, update, remove)
7. Loan purchase/sale recording

**Verification:** Build passes

---

## Phase 3: Amortization Service — loan-amortization-service.ts

**Files:** `server/services/loan-amortization-service.ts`
**Dependencies:** Phase 1

### Tasks:
1. Equal amortization (French method) computation
2. Equal principal computation
3. Bullet payment schedule
4. Balloon payment schedule
5. Increasing/decreasing amortization
6. Custom schedule support
7. Schedule regeneration after prepayment/amendment
8. Interest calculation with all day count conventions (ACT/360, ACT/365, etc.)

**Verification:** Build passes

---

## Phase 4: Supporting Services

**Files:** `server/services/loan-collateral-service.ts`, `server/services/mpc-service.ts`, `server/services/loan-payment-service.ts`
**Dependencies:** Phase 2

### Tasks:

#### 4a. loan-payment-service.ts
1. Record principal/interest payment
2. Prepayment with penalty calculation
3. Pretermination penalty computation
4. Interest penalty for past-due
5. WHT deduction
6. Receivable creation and aging
7. GL posting integration

#### 4b. loan-collateral-service.ts
1. CRUD for collaterals
2. Revaluation recording
3. LTV computation
4. Alert generation for LTV breach / insurance expiry

#### 4c. mpc-service.ts
1. Issue MPC with auto-certificate number
2. Cancel MPC
3. Transfer MPC
4. Validation (total ≤ facility amount)

**Verification:** Build passes

---

## Phase 5: Routes — Back Office API

**Files:** `server/routes/back-office/loans.ts`
**Dependencies:** Phases 2, 3, 4

### Tasks:
1. All CRUD endpoints for facilities
2. Payment endpoints
3. Availment endpoints
4. Amortization endpoints
5. Collateral endpoints
6. MPC endpoints
7. Amendment endpoints
8. Document endpoints
9. Receivables/aging endpoints
10. Dashboard/report endpoints
11. Mount in back-office index router

**Verification:** Build passes

---

## Phase 6: UI — Dashboard & Detail Pages

**Files:** `apps/back-office/src/pages/loan-dashboard.tsx`, `loan-detail.tsx`
**Dependencies:** Phase 5

### Tasks:
1. Loan Dashboard page with summary cards, filterable table, charts, alerts
2. Loan Detail page with tabbed sections
3. Create/Edit Loan dialog
4. Navigation registration in sidebar
5. Route registration

**Verification:** Build passes, pages render

---

## Phase 7: UI — Supplementary Pages

**Files:** `apps/back-office/src/pages/loan-collateral.tsx`, `loan-mpc.tsx`, `loan-amortization.tsx`
**Dependencies:** Phase 6

### Tasks:
1. Collateral management page
2. MPC management page
3. Amortization schedule viewer
4. Payment recording dialog
5. Amendment dialog

**Verification:** Build passes

---

## Phase 8: Seed Data

**Files:** `server/scripts/seed-demo-data.ts` or new seed script
**Dependencies:** Phase 1

### Tasks:
1. Seed 5 sample loan facilities
2. Seed participants, payments, amortization schedules
3. Seed collaterals with valuations
4. Seed MPCs
5. Seed documents, amendments, receivables

**Verification:** Seed runs without errors
