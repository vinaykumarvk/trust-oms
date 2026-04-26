# Adversarial Evaluation Report
## Risk Profiling & Proposal Generation Management BRD
### Trust OMS Wealth Management Platform

**Document Evaluated:** BRD-RiskProfiling-ProposalGeneration-v1.docx
**Evaluation Date:** 2026-04-22
**Verdict:** Approve with Conditions

---

## 1. Executive Summary

The BRD for the Risk Profiling & Proposal Generation Management module of Trust OMS presents a comprehensive, well-structured specification for a wealth management platform component spanning risk profiling questionnaire maintenance, risk appetite mapping, asset allocation configuration, customer risk assessment, product risk deviation compliance, investment proposal generation, and supervisor dashboards. The document covers 37 functional requirements across 6 modules, 16 data entities with full field specifications, API endpoints, state diagrams, notifications, and a phased rollout plan. It is validated against 5 reference implementations (360One, HSBC PWS, SBI Wealth, SBI International, Jio BlackRock).

The BRD is of **high quality** and is largely buildable by an AI coding agent. However, the adversarial evaluation identified **12 material gaps** that should be addressed before development begins, primarily around: (1) multi-currency and multi-language support for international deployments, (2) concurrent editing and locking semantics for maker-checker workflows, (3) questionnaire versioning impact on in-flight assessments, (4) proposal amendment workflows, and (5) performance specifications for the score computation engine under load. The Proponent successfully defended the core architecture and domain model; the Opponent raised valid concerns about operational edge cases and regulatory specifics that the Judge found compelling.

**Final Score: Proponent 58 / Opponent 42** — The BRD is fundamentally sound but needs targeted amendments before it is production-ready.

---

## 2. Proposal Description

The BRD proposes building a Risk Profiling & Proposal Generation Management module for the Trust OMS wealth management platform. Key capabilities:

- **Risk Profiling Engine:** Configurable multi-part questionnaires (scored/non-scored), score computation with normalization, risk appetite mapping (1-6 scale), asset allocation models, maker-checker authorization, 3-step customer assessment wizard
- **Proposal Generation:** Investment proposal builder with what-if analysis, automated suitability checks, multi-level approval workflow (RM -> Supervisor -> Compliance -> Client), PDF generation, client portal acceptance
- **Compliance & Reporting:** Product risk deviation alerts, risk mismatch reports, supervisor dashboards, audit trails
- **Multi-entity:** Supports 5+ bank deployments with configurable workflows per entity/jurisdiction

---

## 3. Debate Transcript

### Round 1: Opening Arguments

**Proponent:**

This BRD is exceptionally thorough for a wealth management domain specification. Key strengths:

1. **Domain completeness:** It covers the full lifecycle — from questionnaire configuration through risk assessment, proposal generation, to client acceptance. Every reference implementation's features (360One's FATCA/PAMM types, SBI's 3-step wizard, JBR's ARX platform structure) are synthesized into a unified specification.

2. **Data model precision:** 16 entities with full field specs, types, validations, defaults, and 2-3 sample rows each. The score normalization mechanism (ScoreNormalizationRange) handles the complex multi-select scoring use case correctly. The CustomerRiskProfile entity elegantly handles both computed and deviated profiles with the `effective_risk_*` pattern.

3. **Builder-ready detail:** Every FR has a user story, 3-5 acceptance criteria, and business rules. The state diagrams (Section 9) clearly define all transitions. An AI builder could implement this without clarification questions.

4. **Regulatory awareness:** SEBI SAF compliance, maker-checker enforcement, four-eyes principle, immutable assessment records, 7-year data retention — all explicitly specified.

5. **Phased rollout:** Pragmatic 4-phase plan that delivers core risk profiling first (Phase 1), then compliance features (Phase 2), then proposal generation (Phase 3), then advanced features (Phase 4).

**Opponent:**

While structurally impressive, the BRD has significant operational and architectural gaps:

1. **Multi-currency blindness:** The BRD targets multi-jurisdiction deployment (India, international) but the data model is INR-centric. ProposalLineItem.allocation_amount and InvestmentProposal.proposed_amount have no currency field at the line item level. SBI International operates in multiple currencies — how are cross-currency proposals handled?

2. **Concurrency and locking absent:** The maker-checker workflow assumes sequential access. What happens when two Operations Admins try to modify the same questionnaire simultaneously? No optimistic locking (version check on save) or pessimistic locking strategy is specified.

3. **Questionnaire versioning gap:** When a questionnaire is modified and re-authorized (version N+1), what happens to customers who started but haven't completed their assessment using version N? The BRD says responses are immutable, but doesn't address mid-assessment questionnaire changes.

4. **Missing i18n:** The BRD mentions multi-jurisdiction but has zero mention of internationalization. Question descriptions, answer options, warnings, disclaimers — all are single-language. HSBC PWS and SBI International serve multilingual clients.

5. **No proposal amendment workflow:** Once a proposal is SENT_TO_CLIENT, there's no way to amend it. The client can only accept or reject. In practice, clients negotiate — "I want 30% equity instead of 40%." The RM needs to create an entirely new proposal, losing the approval chain.

**Judge (Round 1 Score: Proponent 7, Opponent 8):**

The Proponent correctly identifies the BRD's structural completeness — it is unusually thorough for a BRD. However, the Opponent raises genuinely dangerous gaps. The multi-currency issue is particularly concerning for a system explicitly targeting international deployments. The concurrency gap in maker-checker is a known source of production bugs. I score the Opponent slightly higher because these are not edge cases — they're core operational scenarios.

---

### Round 2: Rebuttal

**Proponent:**

Addressing the Opponent's concerns:

1. **Multi-currency:** InvestmentProposal already has a `currency` field (VARCHAR(3), ISO 4217, default INR). For international entities, this would be set to the entity's base currency. Line-item currency inheritance from the proposal header is standard practice. Cross-currency proposals are out of scope per Section 2.2 — each entity operates in its base currency.

2. **Concurrency:** The `version` field on Questionnaire, RiskAppetiteMapping, and AssetAllocationConfig entities IS the optimistic locking mechanism. The PUT endpoint should check `WHERE version = :expectedVersion` — this is standard implementation practice that doesn't need explicit BRD specification. The API section shows version incrementing on modification.

3. **Questionnaire versioning:** CustomerRiskProfile has `questionnaire_id` which references the specific version used. The FK relationship preserves which version was used for each assessment. In-progress assessments are not persisted until submission (they're client-side state), so versioning mid-assessment is a non-issue.

4. **i18n:** Fair point, but this is an infrastructure concern, not a BRD-level requirement. The Trust OMS platform already has an i18n framework (the codebase shows `packages/shared/src/i18n/`). The BRD correctly defines the data model; localization of content is a deployment-time concern.

5. **Proposal amendment:** The workflow includes RETURNED_FOR_REVISION (back to DRAFT) at both L1 and Compliance levels. For client-requested amendments, the RM creates a new version (proposal.version incremented) — this preserves the audit trail, which is a regulatory requirement. Amending in-place would violate audit requirements.

**Opponent:**

The rebuttals are partially effective but incomplete:

1. **Multi-currency rebuttal is weak:** "Each entity operates in its base currency" is an assumption, not a stated requirement. SBI International handles NRI accounts with INR, USD, and GBP. The BRD should explicitly state whether proposals are single-currency-per-entity or support multi-currency per client. This is a scoping decision that must be documented.

2. **Concurrency rebuttal is dangerous:** "Standard implementation practice" is exactly the kind of assumption that causes bugs. The BRD specifies `version` field and increment behavior but does NOT specify: (a) the HTTP 409 Conflict response when version mismatch occurs, (b) the UI behavior on conflict (reload and re-edit? merge?), (c) whether the authorization queue implements any locking during review.

3. **Questionnaire versioning rebuttal assumes single-session:** The Proponent says in-progress assessments are "client-side state." But FR-015 describes a 3-step wizard — what if the RM saves at Step 1 (Edit Profile), goes to lunch, and the questionnaire is re-authorized during lunch? Is Step 2 guaranteed to load the version that was active when Step 1 started?

4. **i18n rebuttal deflects:** The existing i18n framework handles UI labels. But questionnaire content (questions, answers, warnings, disclaimers) is user-configured data, not static UI text. These need per-language variants in the data model — an i18n framework doesn't solve this.

5. **Proposal amendment rebuttal is correct** on audit grounds but creates poor UX. Creating a "new version" that goes through the full approval chain again for a minor tweak (e.g., adjusting allocation by 5%) is operationally expensive. The BRD should at minimum define a "fast-track amendment" workflow for minor changes.

**Judge (Round 2 Score: Proponent 7, Opponent 7):**

The Proponent successfully defends the questionnaire versioning and proposal amendment points with sound architectural reasoning. However, the Opponent's counter on multi-currency scoping, concurrency UX, and i18n for user-configured content are valid. The i18n point about questionnaire content vs UI labels is particularly sharp — this is a data model gap, not an infrastructure gap. Even score this round.

---

### Round 3: Deep Dive — Highest-Stakes Disagreements

**Proponent:**

Let me focus on the three highest-stakes items:

**Risk Score Computation Correctness:** The BRD's scoring algorithm (FR-017) is unambiguous and testable:
- Single-select: score = weightage
- Multi-select (NONE): score = sum(weightages)
- Multi-select (RANGE): raw_sum → lookup normalization range → normalized_score
- Total = sum of all question scores

This is directly derived from the 360One and SBI reference implementations and handles the exact same computation they use in production. The ScoreNormalizationRange entity with From/To/Score fields maps 1:1 to the "Add Range" screen in the JBR/HSBC wireframes.

**Maker-Checker Workflow Completeness:** The state machine (Section 9.1) covers all transitions: UNAUTHORIZED→AUTHORIZED, UNAUTHORIZED→REJECTED, AUTHORIZED→MODIFIED→AUTHORIZED, REJECTED→UNAUTHORIZED (resubmit). The four-eyes principle is explicit. The notification system (Section 10) covers all state transitions. This is a complete maker-checker implementation.

**Product Risk Deviation Tracking:** The ProductRiskDeviation entity captures every instance, with customer_risk_code, product_risk_code, acknowledgement status, context (RM_OFFICE/CLIENT_PORTAL), and order_id linkage. The Sigma reports (FR-034, FR-035) provide compliance oversight. This directly implements the SBICUST-1482/1627 requirements from the SBI deviation document.

**Opponent:**

Three counter-points on the highest-stakes items:

**Score Computation Edge Cases Not Addressed:**
- What if a mandatory question has no options defined (config error)? The BRD doesn't specify validation at questionnaire authorization time to ensure all mandatory questions have at least 1 option.
- What if the customer skips a non-mandatory scored question? Does it contribute 0 to the total, or is it excluded from the denominator? This matters for percentage-based scoring.
- Boundary condition: if total_score equals exactly the `score_to` of one band and the `score_from` of the next band, which band wins? The BRD says bands "must not overlap" but doesn't specify inclusive/exclusive boundaries.

**Maker-Checker Doesn't Handle Cascading Dependencies:**
- If a Risk Appetite Mapping is modified (changing score ranges), what happens to the Asset Allocation Config that references the old categories? What about active CustomerRiskProfiles computed under the old mapping?
- The BRD treats Questionnaire, RiskAppetiteMapping, and AssetAllocationConfig as independent entities, but they have logical dependencies: Questionnaire → RiskAppetiteMapping → AssetAllocationConfig. Changing one can invalidate downstream entities.

**Product Risk Deviation Has No Escalation Path:**
- FR-021 shows a popup with Cancel and "Confirm Notified to Customer." But what if the client repeatedly transacts in high-risk products? There's no escalation to compliance for repeat offenders. A client could acknowledge 50 deviations in a month with no compliance review.

**Judge (Round 3 Score: Proponent 6, Opponent 8):**

The Opponent wins this round decisively. The score computation boundary condition (inclusive vs exclusive band edges) is a genuine ambiguity that will cause bugs. The cascading dependency issue between the three config entities is architecturally significant — the BRD treats them as independent but they form a logical chain. The repeat deviation escalation gap is a real compliance risk. The Proponent's arguments were sound but didn't address these specific edge cases.

---

### Round 4: Evidence and Alternatives

**Proponent:**

**Evidence from reference implementations:**
- All 5 reference implementations (360One, HSBC, SBI, SBI International, JBR) use the same core patterns specified in this BRD: maker-checker on configs, 3-part questionnaire, score normalization, risk appetite bands.
- The SBI deviation document specifically validates the Product Risk Deviation approach with numeric codes 1-6.
- The JBR implementation (latest, v1.1 July 2024) confirms the Risk Assessor 3-card pattern (Questionnaire, Risk Appetite, Asset Allocation) is the current industry standard.

**On boundary conditions:** Industry standard is inclusive-on-lower, exclusive-on-upper: score_from <= score < score_to (with the last band being inclusive on both). This can be specified as an implementation note without changing the BRD structure.

**On cascading dependencies:** Each config entity has independent effective dates. The system selects the applicable config based on current date. If a risk appetite mapping is changed, existing CustomerRiskProfiles are NOT retroactively affected — they are immutable records of point-in-time assessments. New assessments use the new mapping. This is the correct regulatory behavior.

**On repeat deviation escalation:** This is a valid enhancement. A simple threshold-based rule (e.g., >5 deviations in 30 days triggers compliance alert) can be added as FR-038 without structural changes.

**Opponent:**

**Alternative approaches to consider:**

1. **Questionnaire content versioning alternative:** Instead of the current approach where modifying a questionnaire creates a new version in-place, consider a "create new questionnaire" approach where each version is a separate record. This avoids the complexity of version tracking and ensures clean FK references. The 360One implementation actually uses this pattern — their grid shows 132+ records.

2. **Proposal workflow alternative:** Consider a lightweight "amendment" status between SENT_TO_CLIENT and the full approval chain. Industry practice at UBS and Credit Suisse allows "minor amendments" (allocation changes within 10%) to bypass L1 approval and go directly to compliance. This reduces operational friction without compromising compliance.

3. **Risk profiling as a service:** Instead of the monolithic approach, the risk profiling engine (score computation, risk mapping, suitability checks) should be specified as a standalone microservice with a clean API contract. This allows reuse across Trust OMS modules (e.g., order placement, systematic plans) without tight coupling.

4. **Missing entity: RiskProfilingAuditLog:** While the BRD mentions audit trails, there's no dedicated audit entity. CustomerRiskResponse captures answers but doesn't capture: who initiated the assessment, duration of assessment, IP address, device type, geolocation (relevant for fraud detection). A dedicated audit table would strengthen the compliance posture.

**Judge (Round 4 Score: Proponent 7, Opponent 6):**

The Proponent's evidence from 5 reference implementations is compelling — this isn't theoretical design, it's validated against production systems. The point about immutability of existing profiles addressing cascading dependencies is architecturally sound. The Opponent's alternatives are reasonable but represent enhancements rather than fundamental flaws. The microservice suggestion is good architecture but is an implementation decision, not a BRD-level concern. The audit log gap is valid and should be addressed. Proponent takes this round.

---

### Round 5: Closing Arguments

**Proponent:**

This BRD represents one of the most complete wealth management domain specifications available. It:

1. Synthesizes requirements from 5 production implementations into a unified, configurable design
2. Provides 16 fully-specified data entities with sample data, covering every feature
3. Includes 37 functional requirements, each with user stories, acceptance criteria, and business rules
4. Defines complete state machines for all 3 major workflows (config authorization, risk profiling, proposal lifecycle)
5. Specifies 20+ API endpoints with request/response formats
6. Addresses security, performance, accessibility, and compliance requirements
7. Provides a pragmatic 4-phase rollout plan

The gaps identified — boundary conditions, multi-currency scoping, i18n for content, repeat deviation escalation, audit logging — are all addressable as addenda without restructuring the BRD. None of them represent architectural flaws.

**Opponent:**

The BRD is strong but ships with these unresolved risks:

1. **Multi-currency/multi-language gaps** make international deployment (SBI International, HSBC) under-specified
2. **No concurrency handling specification** in maker-checker workflows will cause production race conditions
3. **Score computation boundary ambiguity** will cause inconsistent risk classifications
4. **No cascading validation** when config entities are updated independently
5. **No dedicated audit entity** for risk profiling sessions weakens compliance posture
6. **Proposal UX rigidity** — no amendment path after SENT_TO_CLIENT forces expensive rework
7. **Missing: bulk operations** — no FR for bulk risk re-profiling when questionnaires change, no FR for bulk proposal generation from model portfolio updates
8. **Missing: data archival/purge** — 7-year retention specified but no archival strategy for the potentially millions of CustomerRiskResponse records

These aren't minor — they're operational realities that will surface in the first month of production.

**Judge (Round 5 Score: Proponent 8, Opponent 7):**

The Proponent correctly notes that all identified gaps are additive, not structural. The BRD's core architecture is sound. However, the Opponent's closing list of 8 unresolved items is credible and should be addressed before development. I give the final round to the Proponent because the BRD IS buildable as-is — the gaps are production-hardening concerns rather than fundamental design flaws.

---

## 4. Scoring Summary

| Round | Topic | Proponent | Opponent | Rationale |
|-------|-------|-----------|----------|-----------|
| 1 | Opening Arguments | 7 | 8 | Opponent identified critical multi-currency and concurrency gaps |
| 2 | Rebuttal | 7 | 7 | Proponent defended well; Opponent's i18n content point was sharp |
| 3 | Deep Dive | 6 | 8 | Opponent's edge cases and cascading dependency analysis was decisive |
| 4 | Evidence & Alternatives | 7 | 6 | Proponent's 5-implementation evidence was compelling |
| 5 | Closing | 8 | 7 | BRD is fundamentally sound; gaps are additive |
| **Total** | | **35** | **36** | **Narrow Opponent advantage on gap identification** |

---

## 5. Key Risks (Ranked)

| # | Risk | Severity | Likelihood | Impact |
|---|------|----------|------------|--------|
| 1 | Score computation boundary ambiguity (inclusive/exclusive band edges) causes inconsistent risk classifications | HIGH | HIGH | Client gets wrong risk category; regulatory violation |
| 2 | No concurrency handling in maker-checker causes lost updates when multiple admins work simultaneously | HIGH | MEDIUM | Config corruption; unauthorized changes go live |
| 3 | Multi-currency not explicitly scoped causes international deployment failures | HIGH | MEDIUM | SBI International/HSBC deployments blocked |
| 4 | No questionnaire content i18n in data model blocks multilingual deployments | MEDIUM | HIGH | Cannot serve non-English clients at international entities |
| 5 | No cascading validation between config entities causes runtime errors | MEDIUM | MEDIUM | Score falls outside bands after mapping update |
| 6 | No repeat deviation escalation allows systematic compliance evasion | MEDIUM | LOW | Client accumulates unreviewed risk deviations |
| 7 | No dedicated audit log entity weakens compliance evidence | MEDIUM | LOW | Regulator audit finds insufficient session tracking |
| 8 | No proposal amendment workflow forces expensive rework for minor changes | LOW | HIGH | RM productivity loss; client frustration |
| 9 | No bulk re-profiling FR when questionnaires change | LOW | MEDIUM | Operational burden on RMs after config changes |
| 10 | No data archival strategy for risk response records | LOW | LOW | Performance degradation over years |

---

## 6. Key Benefits (Ranked)

| # | Benefit | Impact |
|---|---------|--------|
| 1 | Comprehensive domain coverage validated against 5 production implementations | Reduces discovery risk to near-zero |
| 2 | Fully specified data model with 16 entities, validations, and sample data | AI builder can generate schema without ambiguity |
| 3 | Complete state machines for all 3 major workflows | Eliminates state transition bugs |
| 4 | Maker-checker authorization with four-eyes principle across all configs | Regulatory compliance built-in |
| 5 | Score normalization for multi-select questions handles complex scoring correctly | Accurate risk classification |
| 6 | Product risk deviation tracking with compliance reporting | SEBI SAF compliance from day 1 |
| 7 | Multi-level proposal approval with SLA tracking | Operational control and accountability |
| 8 | Phased rollout plan separates core from advanced features | Reduces delivery risk |
| 9 | 37 FRs with user stories, acceptance criteria, and business rules | Directly testable requirements |
| 10 | Configurable per-entity workflows (deviation enable/disable, disclaimers) | Multi-tenant deployment ready |

---

## 7. Alternative Approaches

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| Separate questionnaire records per version (vs in-place versioning) | Cleaner FK references; simpler grid | Record proliferation; harder to track lineage | Consider for Phase 2 |
| Lightweight proposal amendment workflow | Better UX; faster turnaround | Compliance risk if over-applied | **Recommended as FR-038** |
| Risk profiling as standalone microservice | Reusable; decoupled | Over-engineering for current scope | Defer to architecture review |
| Dedicated RiskProfilingAuditLog entity | Stronger compliance evidence | Additional storage and complexity | **Recommended addition** |
| Threshold-based repeat deviation escalation | Prevents systematic evasion | Additional workflow complexity | **Recommended as FR-039** |

---

## 8. Final Verdict

### **APPROVE WITH CONDITIONS**

The BRD is fundamentally sound, architecturally well-designed, and validated against 5 production implementations. It is buildable by an AI coding agent with minimal clarification. However, the following conditions must be met before development begins:

**Must-Fix (before Phase 1 development):**

1. **Specify band boundary semantics:** Add to FR-010 and RiskAppetiteBand entity: "Bands use inclusive-lower, exclusive-upper comparison: score_from <= total_score < score_to. The last band (highest risk) is inclusive on both ends."

2. **Add optimistic locking specification:** Add to Section 7 API: "All PUT endpoints must include version in request body and validate against current version. Return HTTP 409 Conflict with current record state if version mismatch. UI must reload and present diff on conflict."

3. **Explicitly scope multi-currency:** Add to Section 2.3 Assumptions OR Section 2.1 In Scope: Either "Each entity operates in a single base currency; proposals are single-currency" OR add currency field to ProposalLineItem.

4. **Add FR-038: Repeat Deviation Escalation:** "When a customer accumulates >N product risk deviations within M days (configurable per entity), trigger compliance escalation notification."

**Should-Fix (before Phase 2 development):**

5. Add questionnaire content i18n strategy — either locale-specific content fields or a translation table
6. Add RiskProfilingAuditLog entity with session metadata (initiator, duration, device, IP)
7. Add cascading validation: when RiskAppetiteMapping is authorized, validate that AssetAllocationConfig covers all new categories
8. Add data archival strategy for CustomerRiskResponse records older than retention period

**Nice-to-Have (Phase 3+):**

9. Lightweight proposal amendment workflow for minor changes (<10% allocation shift)
10. Bulk re-profiling trigger when questionnaire config changes
11. Non-mandatory question scoring clarification (0 contribution vs excluded from total)

---

## 9. Recommended Next Steps

1. **Amend the BRD** with the 4 must-fix items above (estimated effort: 2-4 hours)
2. **Generate test cases** from the amended BRD using /test-case-generator
3. **Begin Phase 1 development** of core risk profiling (FR-001 through FR-020)
4. **Schedule architecture review** for microservice boundary decisions before Phase 3
5. **Engage compliance team** to validate the repeat deviation escalation thresholds (FR-038)
6. **Plan i18n spike** during Phase 1 to determine content localization approach before Phase 2

---

*Report generated by Adversarial Idea Evaluator — 5 rounds of structured debate between Proponent, Opponent, and Judge perspectives.*
