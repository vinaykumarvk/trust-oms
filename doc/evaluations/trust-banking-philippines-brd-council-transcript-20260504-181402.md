# Trust Banking Philippines BRD - Adversarial Council Transcript

**Generated:** 2026-05-04 18:14:02 Asia/Kolkata
**Source document:** `docs/Trust_Banking_Philippines_BRD_Grouped_Requirements.docx`
**Extracted text:** `/tmp/trustoms_eval/trust_banking_grouped_requirements.txt`
**Method:** 5 advisor council, anonymized peer review, chairman synthesis.

## Original Question
Take the Trust Banking Philippines grouped requirements BRD and assess if Trust OMS needs all the features in the Trust banking app and whether the suggested approach needs enhancement.

## Framed Question
Should Trust OMS include the full feature set described in the grouped Trust Banking Philippines BRD, and does the BRD approach need enhancement before implementation planning?

## Context Enrichment
- The BRD expands 49 workbook one-liners into seven logical groups: core trust/IMA products, UITF, instruments/portfolio operations, fiduciary/agency/escrow/safekeeping, enterprise data, digital channels, and cross-cutting controls.
- It reports 25 items as OOTB, 9 as configurable, and 7 as customization, while marking all detailed requirements as Must.
- Appendix D flags high fit-gap attention for currencies, IRS, cross-currency swaps, total return swaps, credit default swaps, receiving/paying agency for IPO/FOO, and life insurance trust; medium attention for FX forwards/options, bond forwards/futures/options, equity warrants, repos/back-to-back collateral, and notes/paying agency.
- Existing project audits show broad coverage but 0 automated test coverage and remaining P0/P1 gaps in data foundation, object authorization, fee formulas, corporate-action feeds/reconciliation, and portal evidence.

## Regulatory And Source References
- Source BRD: docs/Trust_Banking_Philippines_BRD_Grouped_Requirements.docx
- Extracted BRD text: /tmp/trustoms_eval/trust_banking_grouped_requirements.txt
- Existing TrustOMS BRD: docs/TrustOMS-Philippines-BRD-FINAL.md
- Latest TrustOMS BRD coverage audit: docs/reviews/brd-coverage-trustoms-philippines-brd-final-2026-04-28.md
- Current trust-banking gap register: docs/codebase-document-gap-analysis-trust-banking-2026-04-25.md
- BSP MORB Part IV - Trust and Other Fiduciary Business: https://www.bsp.gov.ph/Regulations/MORB/2023_MORB/2023_MORB%20P4/2023_Part%20IV_02%20Trust%20and%20Other%20Fiduciary%20Business.pdf
- BSP MORB Part IX - AML/CFT Regulations: https://www.bsp.gov.ph/Regulations/MORB/2023_MORB/2023_MORB_P9/2023_Part%20IX_01_AML%20CFT%20Regulations.pdf
- BSP Circular 1152 - UITF amendments: https://www.bsp.gov.ph/Regulations/Issuances/2022/1152.pdf
- BSP Circular 982 - Information Security Management: https://www.bsp.gov.ph/Regulations/Issuances/2017/c982.pdf
- BSP Circular 1203 - Operational Resilience: https://www.bsp.gov.ph/Regulations/Issuances/2024/1203.pdf
- National Privacy Commission - Data Privacy Act: https://privacy.gov.ph/data-privacy-act/

## Advisor Responses
### The Proponent
Trust OMS should keep the full BRD feature set as the target-state scope. The breadth is not excess for a Philippine trust-banking platform; it reflects the real operating model. Trust, IMA, UITF, fiduciary agency, escrow, instruments, portals, governance, AML, privacy, cyber, and resilience are not separate wishlist modules. They share the same fiduciary controls, party-role model, entitlement model, audit trail, valuation evidence, accounting, and regulatory proof requirements. Cutting whole capability groups now would likely create hidden rework later, especially around G5 data governance, G7 controls, UITF NAVPU evidence, beneficial-owner/CDD workflows, and channel provenance.

The strongest argument for the broad scope is that it converts a 49-line workbook into an enterprise implementation map. It protects the bank from building a narrow product catalogue that cannot support BSP trust governance, UITF suitability/disclosure, AML/CFT covered-person obligations, NPC privacy safeguards, cyber governance, or operational resilience expectations. It also creates a moat: a configurable product factory plus multi-asset portfolio accounting, fiduciary case/event processing, and portal entitlements would make Trust OMS harder to displace than a collection of point solutions.

The approach does need enhancement before implementation planning, but enhancement should preserve ambition rather than shrink the vision. "All Must" should be reframed as "target-state mandatory," then sequenced into release gates: foundation first, regulated revenue flows second, complex/custom instruments and agency variants third. Given existing gaps in data foundation, object authorization, fee formulas, corporate-action feeds/reconciliation, portal evidence, and zero automated test coverage, the BRD should add explicit fit-gap evidence packs, OOTB demo scripts, customization spikes, traceability to tests, and regulatory-evidence acceptance criteria.

Recommendation: include the full feature set as the contractual/product roadmap baseline, but do not implement it as one undifferentiated big bang. Convert it into a phased, risk-weighted delivery plan anchored on G5/G7 foundations, UITF/core trust operations, then high-complexity Appendix D items.

### The Contrarian
The likely fatal flaw is not that the feature set is wrong; it is that the BRD treats breadth as certainty. Marking every detailed requirement "Must" across seven domains turns a trust banking replacement into a high-risk enterprise transformation with no prioritization mechanism. That is how banking builds fail: data model, controls, product edge cases, portals, reconciliations, and regulatory evidence all become critical path at once.

The highest-risk items are the ones Appendix D already exposes: multi-currency complexity, swaps/CDS/TRS, IPO/FOO agency flows, life insurance trust, collateralized repo structures, and notes/paying agency. These are not just product variants. They stress valuation, accounting, confirmations, limits, beneficial ownership, disclosures, tax, approvals, maker-checker, audit trails, and downstream reporting. If implemented before the foundational gaps are closed, they will produce bespoke exceptions that corrupt the core model.

The BRD also appears to underweight current delivery risk. Existing coverage shows 0 automated test coverage, remaining P0/P1 gaps in data foundation, object authorization, fee formulas, corporate action reconciliation, and portal evidence. Adding the full grouped BRD now compounds unresolved weaknesses. In regulated trust operations, "mostly implemented" is not acceptable if evidence, authorization, NAVPU controls, AML/CDD, cyber controls, and resilience obligations cannot be demonstrated.

Recommendation: do not implement the full feature set as a single Must-have scope. Reframe the BRD into phased regulatory and operational releases. Phase 1 should prove the trust data foundation, object-level authorization, audit evidence, fee/NAV/valuation controls, corporate-action reconciliation, and core trust/UITF servicing. Phase 2 can add configurable product breadth. Phase 3 should handle the customization-heavy instruments and specialized agency products only after fit-gap prototypes and test harnesses exist.

The BRD needs enhancement before implementation planning: priority tiers, explicit regulatory traceability, dependency mapping, non-functional acceptance criteria, test obligations, and "defer/omit" rationale for low-volume or high-customization products. Without that, the plan is over-scoped and likely to create an impressive requirements inventory but a fragile banking system.

### The First Principles Thinker
From first principles, Trust OMS is not trying to "implement a BRD"; it is trying to support regulated fiduciary operations with defensible records, controls, valuation, authorization, reporting, and customer/legal entity accountability. The feature question should therefore be reframed: which capabilities are necessary to safely administer Philippine trust, fiduciary, UITF, agency, escrow, and safekeeping obligations, and which are product breadth or commercial optionality?

On that basis, the full BRD should not be treated as a single Must-build scope. Marking every detailed requirement as Must collapses risk, regulatory necessity, revenue opportunity, and edge-case product support into one priority bucket. That is not a planning model; it is a backlog inflation mechanism. The existing system already has broad BRD coverage but zero automated test coverage, plus unresolved P0/P1 gaps in data foundation, authorization, fee formulas, corporate action reconciliation, and portal evidence. Adding the expanded grouped BRD wholesale would likely increase implementation surface before the control spine is trustworthy.

The minimum fiduciary/regulatory value appears to be: canonical party/account/product/instrument data; object-level authorization; trust accounting and cash/security position integrity; NAVPU/valuation controls for UITF; fee/tax/accrual formulas with auditability; AML/CDD/beneficial-owner evidence; maker-checker workflow; reconciliations; immutable audit logs; regulatory/customer reporting; cyber, privacy, resilience, and third-party controls. These are platform capabilities. Product variants should sit behind them.

The high fit-gap items in Appendix D should be treated as separate product decisions, not baseline scope. IRS, CDS, TRS, cross-currency swaps, IPO/FOO agency, life insurance trust, and complex currency handling may be legitimate eventually, but they should require business volume, regulatory operating model, data feeds, valuation source, accounting treatment, and operational ownership before implementation.

Recommendation: do not implement the full feature set as-is. Enhance the BRD before planning by converting it into a tiered capability roadmap: regulatory/control foundation, core Philippine trust and UITF operations, configurable product extensions, and bespoke/custom products gated by fit-gap evidence. The first thing to do is reclassify every "Must" into regulatory mandatory, operational MVP, configurable later, or custom business case.

### The Outsider
As an outsider, I would not approve the full BRD feature set as an immediate implementation scope. The document reads less like a buildable release plan and more like an enterprise capability catalogue. That is useful for vision and fit-gap discovery, but it is risky if treated as "everything is Must."

The biggest problem is prioritization. Core trust accounts, UITF operations, portfolio accounting, derivatives, escrow/agency services, portals, enterprise data governance, AML, privacy, cyber resilience, and regulatory evidence are all framed as required. To a newcomer, that collapses business-critical obligations and optional product breadth into one bucket. A buyer or implementation team would ask: which features are legally mandatory to operate, which generate near-term revenue, which are only needed for specific client deals, and which are vendor roadmap aspirations?

I would also challenge the OOTB/configuration/customization labels. They are not evidence; they are claims that need demo scripts, sample data, exception flows, accounting outputs, regulatory reports, and sign-off criteria. The "high fit-gap" items like currencies, complex swaps, CDS, IPO/FOO agency, and life insurance trust should not sit beside ordinary account lifecycle requirements as equal Musts.

The BRD approach needs enhancement before implementation planning. It should be converted into a phased roadmap: foundation first, then core trust/IMA and UITF, then portfolio/instrument breadth, then specialized fiduciary products and advanced channels. Given existing P0/P1 gaps in data foundation, object authorization, fee formulas, corporate action reconciliation, and portal evidence, expanding scope now would compound unfinished foundations. The absence of automated test coverage is another implementation risk signal.

Recommendation: keep the full BRD as a target-state capability map, but do not implement it all. Create a regulated MVP with hard compliance controls, core product flows, auditability, data model, authorization, fee engine, and reconciliation. Defer complex instruments and niche agency products until each has a business owner, revenue case, regulatory need, and proven vendor fit-gap evidence.

### The Executor
Recommendation: do not plan implementation from this BRD as-is. Treat the full feature set as a target-state catalogue, not a build backlog. With every detailed requirement marked `Must`, plus known P0/P1 gaps and zero automated coverage, the current approach is not executable at speed.

The fastest path is to enhance the BRD into a sequenced delivery plan:

1. Define MVP scope: core trust/IMA, UITF essentials, portfolio/instrument basics, valuation, fees, compliance evidence.
2. Defer specialized/high-complexity products: IRS, cross-currency swaps, TRS, CDS, IPO/FOO agency, life insurance trust, complex derivatives.
3. Fix foundations first: enterprise data model, object authorization, fee formula engine, corporate action feeds/reconciliation, audit evidence, and automated test coverage.
4. Convert "all Must" into `Regulatory Must`, `Operational Must`, `Commercial Should`, and `Future`.
5. Add fit-gap work packages for the flagged customization items before committing timelines.

Monday morning: run a one-day BRD triage workshop and produce a ranked backlog with phase boundaries, dependencies, and acceptance tests. If the BRD remains "everything is Must," there is no credible first implementation step.

## Anonymous Peer Review Mapping
- Response A: The First Principles Thinker
- Response B: The Proponent
- Response C: The Outsider
- Response D: The Contrarian
- Response E: The Executor

## Peer Reviews
### Peer Reviewer 1
1. Strongest: Response D. It gives the clearest risk argument: the problem is not the feature catalogue itself, but treating breadth as certainty. It also explains why Appendix D items are structurally dangerous, not merely "later features": they stress valuation, accounting, approvals, disclosures, audit, and reporting. Its phased recommendation is concrete and tied to the known P0/P1 gaps.

2. Biggest blind spot: Response B. It is right that the full BRD may be a useful target-state map, but calling it a contractual/product roadmap baseline risks preserving the "everything is Must" problem under softer wording. It underweights cost, delivery capacity, evidence quality, and stakeholder expectation management. A roadmap baseline can quickly become committed scope.

3. What all responses missed: none squarely addressed migration and operating readiness. A trust banking OMS is not just built; it is cut over from existing books, data sources, workflows, reports, entitlements, reconciliations, and evidence stores. Before implementation planning, the BRD needs legacy-system inventory, data migration strategy, integration ownership, parallel-run criteria, operational runbooks, exception handling, and go-live control gates. Without that, even a well-prioritized MVP may be unlaunchable.

### Peer Reviewer 2
1. Strongest: Response D. It best connects the core defect, "all Must," to implementation risk. It does not just say "phase it"; it identifies the critical-path foundations: data model, object authorization, audit evidence, fee/NAV/valuation, corporate-action reconciliation, and core trust/UITF flows. It also names the BRD enhancements needed before planning: tiers, traceability, dependency mapping, NFR acceptance, test obligations, and defer rationale.

2. Biggest blind spot: Response B. It is directionally sensible in treating the full BRD as target-state rather than big bang, but it over-credits breadth as strategic moat. Given 0 automated test coverage and known P0/P1 gaps, "preserve ambition" risks becoming contractual overcommitment unless every target-state item has a source, owner, evidence standard, and implementation class.

3. What all responses missed: none squarely requires a source-of-obligation traceability model. The BRD should separate requirements derived from Philippine regulation, client contract, internal policy, operational preference, vendor aspiration, and future commercial opportunity. They also understate governance for fit-gap resolution: who signs off high/medium gaps, what evidence is sufficient, what happens when a fit-gap item fails prototype validation, and how exceptions are documented.

### Peer Reviewer 3
1. Strongest: Response D. It best connects the core failure mode, "all Must," to delivery reality. It maps Phase 1 directly to the known P0/P1 gaps: data foundation, object authorization, audit evidence, fee/NAV/valuation, corporate-action reconciliation, and core trust/UITF flows. Unlike the others, it names dependency mapping, NFR acceptance, test obligations, and defer rationale.

2. Biggest blind spot: Response B. It correctly argues that the BRD may represent a legitimate target-state operating model, but it underweights the risk of legitimizing the whole catalogue as scope before evidence exists. "Moat" and "prevents rework" are plausible only after proving configurability, accounting correctness, authorization boundaries, and regulatory evidence.

3. What all responses missed: none fully specifies the evidence standard for converting a requirement from catalogue item into committed scope. Hard gates should include named business owner, regulatory citation or revenue case, data lineage, control evidence, automated regression tests, reconciliation proof, performance/security criteria, operational runbook, and sign-off authority.

### Peer Reviewer 4
1. Strongest: Response D. It gives the best risk-adjusted answer. It names the fatal flaw, ties Appendix D complexity to concrete system stress points, and sequences work around the known P0/P1 gaps: data foundation, object authorization, audit evidence, fee/NAV/valuation controls, corporate-action reconciliation, and core trust/UITF. It also adds the missing execution machinery: priority tiers, dependency mapping, NFR acceptance, test obligations, and explicit defer/omit rationale.

2. Biggest blind spot: Response B. B usefully defends the BRD as a target-state operating model, but it risks preserving the core problem under softer language. Calling everything "target-state mandatory" can still keep too much psychological and governance pressure on delivery teams, especially with 0 automated coverage and unresolved control gaps.

3. What all responses missed: none directly define a governance mechanism for changing the BRD after reclassification. The key artifact should not just be a phased backlog; it should be a controlled requirements ledger with regulatory citation, business owner, control owner, implementation type, evidence required, test mapping, dependency, release phase, and formal sign-off. They also understate migration and operating readiness: legacy data quality, historical positions, audit trail backfill, reconciliation cutover, user entitlement cleanup, production support, and regulator/client evidence packs.

### Peer Reviewer 5
1. Strongest: Response D. It best connects the BRD problem to the known delivery risks: zero automated coverage, P0/P1 foundation gaps, Appendix D complexity, and the danger of an all-Must critical path. Its phased structure is more executable than A/C's reframing and more disciplined than B's target-state defense.

2. Biggest blind spot: Response B. B is directionally useful in preserving the full operating-model vision, but it risks laundering scope bloat into "target-state mandatory." It does not draw a hard enough line between target architecture, contractual commitment, and release obligation.

3. What all responses missed: none directly addressed migration and production readiness. For a trust OMS, the risky path is not only building features; it is moving live accounts, positions, tax lots, historical transactions, documents, limits, approvals, fee histories, NAV records, and audit evidence into a controlled system with parallel-run reconciliation and sign-off. The BRD needs explicit cutover criteria, data-quality thresholds, backout plans, operational SOPs, ownership of exceptions, and regulator/auditor evidence packs for go-live.

## Chairman Synthesis
### Where the Council Agrees
Trust OMS should not treat the Trust banking app BRD as a buildable "all Must" delivery backlog. The council converges that the document is a target-state capability catalogue: useful for describing the long-range operating model, but unsafe as a release plan.

Everyone agrees the foundations matter more than product breadth. The non-negotiable core is canonical data, object-level authorization, accounting and position integrity, UITF NAVPU controls, fees/tax/accruals, AML/CDD/beneficial ownership, maker-checker, reconciliation, audit, regulatory reporting, cybersecurity, privacy, and operational resilience.

The council also agrees that OOTB/configurable/custom labels are not evidence. They must be converted into demonstrated fit-gap proof: working demos, configuration walkthroughs, valuation/accounting examples, exception handling, reports, audit trails, and test evidence.

### Where the Council Clashes
The main clash is how much of the full Trust banking feature set should remain "in scope." The Proponent argues for preserving the whole feature set as target-state scope because the breadth reflects real trust operations and shared controls. The Contrarian, First Principles, Outsider, and Executor reject treating that breadth as committed delivery scope.

The stronger position is the Contrarian view: breadth can stay as a catalogue, but commitments must be tiered. "All Must" creates a false critical path, especially for Appendix D items like IRS, cross-currency swaps, total return swaps, credit default swaps, IPO/FOO agency, life insurance trust, complex FX and bond derivatives, repos, collateral, warrants, and notes/paying agency.

The council also clashes on enhancement severity. The Proponent says enhance sequencing and evidence. The others say the suggested approach needs structural correction: reclassify requirements, attach source-of-obligation, define phase gates, and defer niche/custom products until business ownership, revenue case, regulatory need, and implementation evidence exist.

### Blind Spots Caught
Peer review caught the missing control mechanism: a requirements ledger. Trust OMS needs a controlled ledger with regulatory citation, business owner, control owner, evidence artifact, test case, dependency, release phase, sign-off, and defer/accept rationale for each requirement.

Peer review also caught the missing source-of-obligation model. Some features are legal/regulatory obligations, some are revenue operations, some are deal-specific, and some are roadmap optionality. They should not carry the same priority just because they appear in the Trust banking BRD.

The biggest operational blind spot is migration and production readiness: legacy data, historical positions, tax lots, documents, limits, approvals, fee histories, NAV records, audit backfill, reconciliation cutover, runbooks, backout plans, and regulator/auditor evidence packs. Without this, even correctly scoped features can fail at go-live.

### Risk Register
| Severity | Source | Mitigation |
| --- | --- | --- |
| Critical | All requirements marked Must | Reclassify every item into regulatory mandatory, operating mandatory, revenue-priority, deal-specific, or roadmap. No item enters delivery without owner, evidence, acceptance tests, and phase assignment. |
| Critical | Existing P0/P1 gaps in data foundation, object authorization, fee formulas, corporate action feeds/reconciliation, and portal evidence | Freeze expansion of niche product scope until these gaps are closed or explicitly accepted with compensating controls. |
| High | Appendix D complex instruments and custom products | Run customization spikes for valuation, accounting, back-office flows, tax, reporting, audit, and reconciliation before committing derivatives, life insurance trust, IPO/FOO agency, or complex collateral workflows. |
| High | OOTB/config/custom labels treated as vendor/project claims | Require hard proof: demo scripts, configured examples, test outputs, report samples, exception scenarios, and sign-off by operations, compliance, technology, and audit/control owners. |
| High | Regulatory obligations across MORB, BSP Circulars 1152/982/1203, AML/CFT, and Data Privacy Act | Map each regulatory obligation to controls, records, reports, approval flows, retention evidence, and test cases. Do not rely on product feature names as compliance proof. |
| Medium | Portal and digital-access scope | Treat portals as controlled access channels, not UI nice-to-haves. Require entitlement evidence, consent/privacy handling, audit logs, document access controls, and resilience criteria. |
| Medium | Migration and cutover under-specified | Create a production-readiness workstream covering legacy history, reconciled opening balances, NAV history, approvals, documents, runbooks, rollback, and auditor/regulator evidence packs. |

### The Recommendation
Trust OMS does not need all features in the Trust banking app as committed delivery scope now. It does need the Trust banking BRD as a target-state capability catalogue and regulatory/operating-model reference.

The suggested approach needs enhancement. The right approach is to separate catalogue from backlog, then commit only the features that are legally required, operationally foundational, revenue-critical, or already evidenced as fit-for-purpose.

Phase 1 should be foundations and regulated core: enterprise data model, object authorization, accounting/position integrity, UITF NAVPU, fees/tax/accruals, AML/CDD/BO, maker-checker, reconciliation, audit, reporting, cybersecurity, privacy, and resilience.

Phase 2 should add configurable breadth where evidence proves it works and where business owners confirm near-term use.

Phase 3 should cover complex/custom products only after spikes prove valuation, accounting, operations, reporting, tax, audit, and reconciliation feasibility.

The current "all Must" posture should be replaced with controlled prioritization, dependency mapping, explicit defer rationale, and testable acceptance criteria.

### The One Thing To Do First
Run a one-day triage workshop and produce a controlled requirements ledger. For every requirement, capture: source of obligation, business owner, control owner, regulatory citation if any, fit-gap evidence, dependency, acceptance test, release phase, and sign-off status. That ledger becomes the authority for what Trust OMS actually builds next.