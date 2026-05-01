# Feature Life Cycle Report: Provident Fund Module (MB-GAP-023)
**Date:** 2026-05-01

## Pipeline Status

| Step | Status | Output |
|------|--------|--------|
| 1. BRD Generation | DONE | Inline (existing EBT module covers 80%) |
| 2-3. Eval | SKIPPED | skip-eval |
| 4. Test Cases | SKIPPED | skip-tests |
| 5. Gap Analysis | DONE | 9 sub-gaps identified on existing EBT module |
| 6-7. Plan + Execute | DONE | Schema + service + routes |
| 8. Build Validation | DONE | 0 new TS errors |
| 9. Full Review | CONDITIONAL | |
| 10. Local Deployment | DEFERRED | |

## Key Finding

The existing EBT (Employee Benefit Trust) module already implements ~80% of MB-GAP-023 requirements. "Employee Benefit Trust" is the Philippine trust industry's term for provident funds. The existing module covers: fund setup, member management, contributions, vesting, benefits processing, loans, gratuity, tax computation, income distribution, separation, and reinstatement.

## Sub-Gaps Closed

| Sub-Gap | What Was Done |
|---------|---------------|
| Multi-employer transfer | pfMemberTransferService.transferMember() — moves member between plans with balance portability |
| Member merge | pfMemberMergeService.mergeDuplicate() — consolidates balances, reassigns contributions, soft-deletes duplicate |
| Forfeiture | pfForfeitureService.computeForfeiture() + executeForfeiture() — computes/applies unvested forfeiture |
| Fund NAVPU valuation | pfFundValuationService — record daily valuations, track NAVPU history, daily returns |
| Member unit balance | pfMemberUnitService — unit subscription/redemption ledger with running balance and market value |
| Loan amortization | pfLoanAmortizationService.generateSchedule() — PMT formula, monthly schedule generation |
| Benefit payment scheduling | pfBenefitPaymentService — LUMP_SUM / MONTHLY_ANNUITY / QUARTERLY_ANNUITY options |
| Payment tracking | markPaid() with auto-completion (all paid → claim RELEASED) |

## New Schema Tables

| Table | Description |
|-------|-------------|
| pf_fund_valuations | Daily NAVPU / total assets / units outstanding |
| pf_member_units | Member unit transaction ledger |
| pf_benefit_payments | Benefit payment schedule (lump-sum vs annuity) |
| pf_loan_amortization | Loan repayment schedule |

## New API Endpoints (13)

| Method | Path | Description |
|--------|------|-------------|
| POST | /ebt/members/:id/transfer | Transfer member between plans |
| POST | /ebt/members/merge | Merge duplicate members |
| GET | /ebt/members/:id/forfeiture | Compute forfeiture preview |
| POST | /ebt/members/:id/forfeiture | Execute forfeiture |
| POST | /ebt/valuations | Record fund valuation |
| GET | /ebt/valuations/:planId | Valuation history |
| GET | /ebt/valuations/:planId/latest | Latest NAVPU |
| POST | /ebt/member-units | Record unit transaction |
| GET | /ebt/member-units/:memberId/:planId | Unit ledger |
| GET | /ebt/member-units/:memberId/:planId/balance | Unit balance + market value |
| POST | /ebt/loans/:loanId/amortization | Generate amortization schedule |
| GET | /ebt/loans/:loanId/amortization | Get schedule |
| POST | /ebt/claims/:claimId/schedule-payments | Schedule benefit payments |
| GET | /ebt/claims/:claimId/payments | Get payment schedule |
| POST | /ebt/payments/:paymentId/mark-paid | Mark payment as paid |

## Files Changed

| File | Change |
|------|--------|
| packages/shared/src/schema.ts | +4 tables (pfFundValuations, pfMemberUnits, pfBenefitPayments, pfLoanAmortization) |
| server/services/pf-extension-service.ts | NEW ~420 lines |
| server/routes/back-office/ebt.ts | +15 endpoints (~130 lines) |
