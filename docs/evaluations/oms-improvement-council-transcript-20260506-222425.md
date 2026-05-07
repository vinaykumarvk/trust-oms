# OMS Improvement BRD Adversarial Council Transcript

Date: 2026-05-06 22:24:25 Asia/Kolkata
Subject: `docs/OMS improvement BRD.md`
Supporting evidence: `docs/reviews/quality-review-danamon-oems-world-class-2026-05-06.md`

## Framed Question

Should the OMS improvement BRD be used to modernize Danamon OEMS toward a world-class order management system, and what changes are required before it becomes a safe execution plan?

## Advisor Responses

### The Proponent

The strongest case for the OMS modernization plan is that it directly converts an already capable but fragmented Danamon OEMS into a governable financial-order platform. The current system already has valuable assets: product coverage across ODA, MLD, Mutual Fund, Bond, FX Today, and Wealth Lending; early document and verification controls; integration primitives; and tested workflow scaffolding. The BRD does not propose a speculative rebuild. It proposes turning those partial strengths into a controlled operating model: governed product/security master, product-specific tickets, deterministic rules, formal workflow orchestration, transactional writes, certified integrations, and audit replay.

The timing is favorable because the gap is now well understood and measurable. The quality review shows the system is beyond prototype maturity, with 50 OEMS tests passing, but still short of “world-class” due to generic capture, hardcoded validation, production-critical JSON, weak transaction boundaries, mock integration defaults, and broad workbench UX. That makes modernization defensible: the business is not funding vague enhancement work, but closing known control, audit, and operational gaps.

Business value is clear. The plan targets fewer preventable validation failures, less manual follow-up, higher SLA compliance, stronger maker-checker governance, better regulatory defensibility, and faster exception resolution. For a bank OMS, these are not cosmetic improvements; they reduce operational risk, failed orders, audit exposure, customer friction, and integration breaks.

To make the plan stronger, add explicit phased sequencing: first security master plus product tickets, then rules/workflow engine, then transactional outbox and adapter certification, then role cockpits and control tower. Add baseline measurement before build starts, especially validation failure rate, approval aging, document aging, and reconciliation breaks. Also require negative-path test coverage per product family and a production readiness gate that blocks launch if mock adapters, JSON-only critical rules, or generic production order entry remain enabled.

### The Contrarian

The fatal flaw is that the BRD treats “world-class OMS” as an additive implementation backlog, not as a controlled banking change program. It specifies many correct target capabilities, but the failure mode is organizational and regulatory: six product families, a new product/security master, rules engine, workflow engine, transactional outbox, adapter certification, document/e-sign flows, audit replay, fee/tax/calendar engines, and role cockpits are all interdependent. If one layer lands partially, the bank could create a more dangerous system than today: modern UI, incomplete controls, and false confidence.

The largest regulatory risk is rule governance. The BRD says regulatory advice is out of scope while also making configurable rules the authority for suitability, eligibility, cutoffs, documents, overrides, fee/tax, and approval routing. That boundary is unsafe. Someone must certify that every rule version maps to bank policy, BI/OJK obligations, product terms, customer segment restrictions, AML/KYC controls, and evidence retention. Without a formal policy-to-rule traceability process, the rules engine becomes a compliance black box.

Migration is under-specified. “Map existing products,” “backfill security references,” and “produce exception file” are not enough for live orders, in-flight approvals, legacy documents, stale source statuses, partial product mappings, duplicated customers/accounts, or orders created during rollout. The rollback criterion says old-flow data is preserved, but not how mixed old/new workflow state, audit event sequences, outbox events, adapter messages, and customer notifications are reversed or reconciled.

Implementation risk is extreme because the quality review shows current gaps are foundational: nullable product references, generic capture, hardcoded validation, no clear transactions, mock adapters, and broad workbench UX. The BRD’s phases still defer integration certification and audit replay until late, even though those should constrain earlier design.

Contrarian recommendation: do not approve the full BRD as an execution plan. First produce a regulatory control matrix and migration runbook for one product family, including policy ownership, rule certification, data lineage, rollback/reconciliation, and audit replay acceptance. Without that, the program can fail while appearing to progress.

### The First Principles Thinker

From first principles, the modernization is not really solving “make Danamon OEMS world-class.” That is a packaging phrase. The real problem is narrower: orders currently appear able to enter the system without enough governed product identity, source evidence, validation certainty, workflow consistency, and operational ownership to make downstream execution auditable and low-friction.

The BRD should simplify around that core failure mode. The first target should not be every product family, every adapter, every dashboard, every document flow, and every control tower at once. It should define the minimum trustworthy order: an order cannot exist as production-intent unless it has an active product/security reference, required capture fields, source-system evidence state, deterministic rule decisions, ownership queue, and immutable transition history. Everything else should sequence behind that.

The current BRD also mixes capability layers with product breadth. A cleaner sequence would be:

1. Build the governed product/security master, rule model, validation decision log, workflow transition model, and transactional/outbox foundation.
2. Convert one or two highest-risk product journeys end to end, probably ODA and FX Today or ODA and MLD, including documents, verification, approval, integration, and reconciliation.
3. Expand product families only after the platform proves it can block bad orders, explain why, route exceptions, and replay the lifecycle.
4. Add control tower analytics after the underlying events are reliable.

Success should be redefined away from “world-class architecture exists” toward operational proof: fewer orders repaired after submission, fewer missing-evidence exceptions, no orders with ambiguous product/rule provenance, no approval/status divergence, and measurable SLA aging by blocker type. “100 percent audit replay” is meaningful only if the replay reconstructs rule versions, source evidence, user decisions, document state, integration messages, and failed/retried side effects.

The BRD’s strongest simplification would be to demote broad UI modernization and dashboards until the system can answer one question perfectly: should this order be allowed to move to the next state, and why?

### The Outsider

The BRD is ambitious and detailed, but a newcomer would struggle to tell what must be built first, what is mandatory for launch, and what is aspirational “world-class” language. Terms like ODA, MLD, LHBU, SND, NCBS, RBS, Avantrade, PFE, FP8007, tranche, overbook, and source evidence appear before they are operationally explained. The glossary helps late in the document, but not enough to let a new engineer or operator understand the business flow.

The biggest hidden assumption is that all external systems can provide timely, reliable, structured evidence. The BRD says source statuses, acknowledgements, quotes, holdings, documents, and customer verification will be integrated, but it does not clearly define source ownership, latency expectations, failure modes, or what operators do when each source is unavailable. “Manual fallback” appears repeatedly, but the exact business authority, customer impact, and post-fallback reconciliation duty are still vague.

Prioritization is also unclear. The scope includes security master, rules engine, workflow engine, outbox, product tickets, document flows, verification, reconciliation, control tower, audit replay, fee/tax/calendar engines, and migration. That is several programs, not one build. The rollout table gives phases, but each phase is still too broad to estimate or staff confidently.

Usability risk is high. Product-specific tickets may fix the generic wizard problem, but the described screens are dense and could become compliance mazes. The BRD needs “happy path” and “repair path” walkthroughs for each role, showing the few decisions a user must make per step.

The supporting review is sharper than the BRD because it names concrete implementation gaps. I would convert its critical findings into release gates: no launch until active product reference, deterministic blocking validation, transaction boundaries, workflow-driven status changes, and non-mock certified integrations are proven by tests.

### The Executor

As Executor, I would not attempt the BRD as a broad modernization wave. It is feasible only if sequenced around control foundations first, then product slices. The fastest safe path is to build the minimum governed spine that all later product flows depend on: product/security master, active-product enforcement, versioned validation decisions, transactional status transitions, audit events, and feature flags.

The first implementation slice should be narrow: ODA ticket flow behind a role/product flag. ODA is the best candidate because the review says it already has the richest backend behavior and existing E2E coverage. The slice should include structured ODA ticket capture, mandatory active `security_id`, transaction compatibility checks, cutoff/eligibility/source evidence validation, workflow submit to approval queue, maker-checker decision through one transition path, audit event write, and outbox record creation. Do not start with MF/Bond, FX, or Wealth Lending; they depend on more missing capture fields, fee/calendar logic, and integration maturity.

Critical dependencies before coding: migration tables for product/security master and rule sets, a compatibility mapping from existing `oemsProducts` to new `security_id`, feature flag plumbing, a transaction helper pattern in the service layer, and a testable workflow transition API. Integration certification, full fee/tax engine, control tower, and all product cockpits should wait.

Test strategy should be negative-path led. Add service tests for missing product, inactive product, family mismatch, disallowed transaction, cutoff breach, failed transaction rollback, maker self-approval, missing workflow definition, and outbox idempotency. Add one ODA UI workflow test proving required fields block before draft creation and successful submission creates the expected queue/audit/outbox state. Keep existing E2E tests green.

Monday morning: create the v1 technical design and migration stub, define the ODA slice acceptance tests first, then implement only the shared spine needed to make those tests pass. Anything not needed for the ODA slice should stay out of the first build.

## Anonymous Peer Review Summary

Peer review mostly selected Response C as the strongest because it converts requirements into an executable ODA-first proof slice with tests. Response B was also viewed as critical because it reframes the work as a controlled banking change program and calls out rule-policy traceability and migration risk.

Response D was repeatedly identified as the largest blind spot because it is valuable for sponsorship but can become approval theater unless tied to operational proof, negative-path tests, migration safety, and production failure behavior.

The common missing element was durable post-launch control ownership: who owns rule changes, source SLAs, exception queues, adapter failures, reconciliation signoff, audit disputes, production incidents, and periodic recertification after go-live.

## Chairman Synthesis

### Where The Council Agrees

- The BRD has the right target capabilities but is too broad as a single execution plan.
- The real target is a minimum trustworthy order, not an abstract “world-class” label.
- The first proof should be a narrow product-family slice, with ODA as the preferred starting point.
- Rule-policy traceability, migration runbook, audit replay, and source failure handling are launch gates, not late enhancements.
- Control tower and broad UI modernization should wait until the event/audit/workflow foundation is reliable.

### Where The Council Clashes

- The proponent sees modernization as a defensible extension of existing strengths.
- The contrarian argues that partial modernization can increase banking risk by creating false confidence.
- The executor accepts the target but rejects broad execution, insisting on ODA-first test-driven proof.

### Blind Spots Caught

- Post-launch RACI and control ownership were not explicit enough.
- Source-system ownership, latency, stale data, degraded-mode approval, and reconciliation obligations needed more detail.
- Migration for in-flight orders and mixed old/new state needed a runbook, not a generic backfill note.

### Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Rules engine becomes compliance black box | Critical | Policy-to-rule traceability and recertification |
| Partial modernization creates false confidence | Critical | ODA-first proof and release gates |
| Migration breaks in-flight orders | High | ODA migration runbook and compatibility queue |
| Source-system failures remain ambiguous | High | Source evidence states and degraded-mode controls |
| Post-launch controls degrade | High | RACI, recertification, incident feedback loop |

### Recommendation

Approve the BRD only after revision around the minimum trustworthy order, ODA-first proof slice, policy-to-rule traceability, source failure handling, migration runbook, release gates, and durable operating ownership. Do not execute the full target-state backlog as one program.

### The One Thing To Do First

Build the ODA-first execution plan around the minimum trustworthy order spine and make the first implementation phase prove active product reference, validation decisions, workflow queue, audit event, and outbox event with negative-path tests.
