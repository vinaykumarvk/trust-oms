## Summary

<!-- Briefly describe what this PR does and why. -->

---

## Accounting Impact

> **Complete this section for any PR that touches GL posting, journal entries, accounting rules, balances, NAV, FX revaluation, FRPTI, or fee/accrual logic. Leave blank if not applicable.**

### BRD Requirement IDs

<!-- List every GL BRD requirement this PR implements or modifies. -->
<!-- Format: ID — Description -->
<!-- Examples: POST-005 — Balance validation (debits = credits) -->
<!--           AE-007 — Rule simulation/dry-run -->
<!--           ACCR-001 — Interest accrual engine -->

- [ ] _requirement_id_ — _description_

### Accounting Rule Changes

<!-- If this PR modifies any accounting rule, criteria, or event definition, complete the following: -->

| Field | Value |
|-------|-------|
| Event code(s) affected | |
| Rule version before | |
| Rule version after | |
| SME approval obtained? | Yes / No / N/A |
| Golden test case updated? | Yes / No / N/A |
| Simulation run against sample events? | Yes / No / N/A |

### Journal Entry Invariants

<!-- Confirm that these accounting invariants still hold after this change: -->

- [ ] Every journal batch produced by this code is balanced (sum DR = sum CR)
- [ ] Posted journal entries are immutable — no UPDATE/DELETE on `gl_journal_lines` or `gl_journal_batches` after posting
- [ ] Reversals create compensating entries; originals remain untouched
- [ ] Idempotency key prevents duplicate posting for the same source event
- [ ] Maker cannot authorize own journal or own master change

### Test Evidence

<!-- Link or list the test cases that cover the accounting behaviour in this PR. -->

| Test File | Test Name | Requirement ID |
|-----------|-----------|----------------|
| | | |

---

## Type of Change

- [ ] Bug fix
- [ ] New feature / requirement implementation
- [ ] Accounting rule change
- [ ] Schema migration
- [ ] Refactor (no functional change)
- [ ] Docs / config only

## Checklist

- [ ] Code compiles with `tsc --noEmit`
- [ ] Relevant tests pass (`tests/e2e/gl-posting-lifecycle.spec.ts`)
- [ ] No direct mutations to posted journal tables (`gl_journal_lines`, `gl_journal_batches` with `batch_status = 'POSTED'`)
- [ ] If accounting rule changed: rule version incremented and effective date set
- [ ] If schema changed: migration script added and tested
- [ ] Security: no new IDOR, SQL injection, or privilege escalation surface
