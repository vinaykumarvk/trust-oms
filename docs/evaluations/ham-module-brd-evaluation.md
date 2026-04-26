# Adversarial Evaluation: Handover & Assignment Management (HAM) Module BRD

**Evaluation Date**: 2026-04-22
**Proposal**: Trust OMS Handover & Assignment Management Module v1.0
**Verdict**: **APPROVE WITH CONDITIONS**

---

## 1. Executive Summary

The Handover & Assignment Management (HAM) module proposes a comprehensive system for managing permanent RM transfers (Handovers) and temporary assignments (Delegations) of Leads, Prospects, and Clients in a wealth management back-office platform. The BRD is thorough, well-structured, and demonstrates strong domain awareness with 20 functional requirements, 11 data model entities, 29 API endpoints, and a 5-phase rollout over 12 weeks.

The adversarial evaluation identified significant strengths: the module addresses a genuine regulatory and operational need, leverages existing Trust OMS patterns effectively, and includes critical compliance safeguards. However, the evaluation also surfaced several material concerns: the bulk upload authorization bypass creates a compliance gap, the Relationship Continuity Score formula is arbitrary and needs empirical validation, the 12-week timeline is ambitious given integration dependencies, and several features (team/pool delegation, downloadable reports) could be deferred to reduce v1 risk.

The final verdict is **Approve with Conditions** — the core handover/delegation functionality is essential and well-designed, but the BRD should be revised to (1) add post-hoc audit review for bulk uploads, (2) defer team/pool delegation and reports to v2, (3) validate the continuity score formula with real portfolio data, (4) add data minimization controls to the portfolio context panel, and (5) extend the timeline to 14-16 weeks to account for integration testing.

---

## 2. Proposal Description

Build a module within Trust OMS that formalizes the governance of Relationship Manager transitions in wealth management. The module supports:

- **Handover**: Permanent transfer of Leads, Prospects, and Clients between RMs with maker-checker dual control, scrutiny checklists (client only), compliance gates, and SLA tracking.
- **Delegation**: Temporary assignment with auto-revert, supporting both individual RM and team/pool delegation.
- **Supporting capabilities**: Portfolio context panel, continuity scoring, conflict of interest management, bulk upload, dashboard, reports, notifications, and audit trail.
- **Integration**: GL fee reassignment, consent management, corporate actions, KYC/sanctions modules.
- **Technical approach**: Extends existing Drizzle ORM schema, Express.js routes, React+shadcn/ui frontend patterns.

---

## 3. Debate Transcript

### Round 1: Opening Arguments

**PROPONENT:**

The HAM module addresses a critical gap in the Trust OMS platform. In wealth management, RM-to-client relationships are the cornerstone of the business — a poorly managed transition can result in client attrition, regulatory penalties, and revenue loss. Industry data from McKinsey (2024) shows that wealth management firms lose 5-8% of AUM during RM transitions without formal handover processes.

The BRD's strengths are substantial:

1. **Regulatory alignment**: MAS IAC guidelines and BSP circulars explicitly require formal accountability for client relationships. The maker-checker workflow, scrutiny checklist, and audit trail directly address these requirements. Without this module, the firm faces regulatory risk during audits.

2. **Leverages existing infrastructure**: The BRD doesn't reinvent the wheel — it extends the existing CRUD factory pattern, RBAC middleware, and maker-checker workflow already proven across 50+ routes. This dramatically reduces implementation risk and ensures architectural consistency.

3. **Comprehensive compliance coverage**: The 5-gate compliance check (KYC, sanctions, complaints, conflict of interest, settlement threshold) goes beyond minimum regulatory requirements. The immutable audit trail satisfies inspection-readiness demands.

4. **Operational efficiency gains**: The 60% reduction target in RM transition time is achievable given the current manual (spreadsheet/email) process. Automation of scrutiny checklists, compliance checks, and notifications eliminates multiple handoff points.

5. **Well-phased delivery**: The 5-phase rollout is pragmatic — core handover first, delegation second, enrichment third. This allows early value delivery and iterative learning.

**OPPONENT:**

While the operational need is real, this BRD exhibits classic over-engineering that risks delivering a mediocre v1 instead of an excellent focused product. My core concerns:

1. **Scope bloat for v1**: 20 functional requirements, 11 database tables, 29 API endpoints, and 7 screens for a first release is excessive. The BRD tries to solve every conceivable problem simultaneously rather than focusing on the highest-impact workflows. Team/pool delegation (FR-009), downloadable reports (FR-015), and conflict of interest management (FR-017) are nice-to-haves that add weeks of development without addressing the core problem.

2. **Bulk upload bypasses authorization — a compliance time bomb**: The BRD explicitly states bulk uploads "bypass the standard authorization workflow" (FR-005, BR3). In a regulated wealth management environment, this is alarming. A single bulk upload of 5,000 records could reassign clients worth billions in AUM without checker approval. The rationale that bulk uploads are "assumed pre-validated" is an unverified assumption that would not survive a regulatory audit. This is the single most dangerous design decision in the BRD.

3. **Relationship Continuity Score is pseudo-science**: The formula `(tenure × 10) + (aum_millions × 5) + (active_orders × 15) + (pending_settlements × 20) + (interactions_30d × 10)` appears to be invented without empirical basis. Why does one pending settlement (20 points) outweigh $4M in AUM (20 points)? Why are 30-day interactions weighted equally to tenure? Without backtesting against actual churn data, this score creates a false sense of precision and could mislead decision-makers.

4. **12-week timeline ignores integration complexity**: The BRD lists 6 internal integrations (GL, consent, corporate actions, KYC, sanctions, notifications). Each integration requires API contracts, error handling, and end-to-end testing. Based on the existing codebase complexity (60+ tables, 50+ routes), integration testing alone could consume 3-4 weeks. The 12-week plan leaves no buffer.

5. **Portfolio context panel raises data privacy concerns**: Showing AUM, holdings, and revenue attribution to Operations Makers during handover may violate data minimization principles. Does an operations user need to see a client's complete portfolio breakdown to initiate a handover? This looks like convenience over privacy.

**JUDGE — Round 1 Assessment:**

Both sides present substantive arguments. The Proponent correctly identifies the regulatory imperative and the advantage of building on existing patterns. The Opponent raises three genuinely concerning issues:

- **Bulk upload authorization bypass**: This is the strongest point. The Proponent has not yet addressed how a 5,000-record unauthorized reassignment is acceptable in a regulated environment. The "assumed pre-validated" justification is insufficient. **Advantage: Opponent.**
- **Continuity Score formula**: The Opponent's criticism about arbitrary weighting is valid. The formula may be directionally useful but should not be presented as authoritative without validation. **Advantage: Opponent.**
- **Scope concerns**: Both sides have merit. The BRD is comprehensive but the Opponent hasn't demonstrated that reducing scope would actually improve outcomes. **Even.**
- **Timeline**: The Opponent's concern about integration testing is credible but not yet quantified. **Slight advantage: Opponent.**
- **Portfolio privacy**: Valid concern but likely addressable through role-based field visibility without removing the feature. **Slight advantage: Opponent.**

**Round 1 Score: Proponent 4/10, Opponent 6/10**

---

### Round 2: Rebuttal

**PROPONENT (addressing Opponent's Round 1):**

The Opponent raises valid concerns but overstates the severity of several issues:

1. **Bulk upload authorization**: The bypass is a deliberate operational decision, not an oversight. Mass RM transitions (branch closures, team restructurings) involve hundreds or thousands of clients that have been pre-approved at a management level. Requiring individual checker approval for each of 5,000 records would make bulk operations practically impossible. However, I concede the BRD should be strengthened with: (a) mandatory pre-approval reference number from BO_HEAD before bulk upload is permitted, (b) a 24-hour post-upload review window during which BO_CHECKER can flag and reverse individual items, and (c) automatic compliance gate checks per-client even in bulk mode (which is already specified in FR-005 AC8).

2. **Continuity Score**: The formula is a starting point, not a final answer. The BRD explicitly positions it as system-calculated and displayed as context. It doesn't gate any decisions — no handover is blocked based on the score. It's an advisory indicator, similar to credit risk scores that evolve through calibration. The alternative (no score at all) leaves the incoming RM with less context. I propose adding a feedback mechanism where RMs can flag if the score was misleading, enabling iterative calibration.

3. **Scope for v1**: The Opponent suggests deferring team/pool delegation, reports, and conflict of interest management. I partially agree — team/pool delegation (FR-009) could be v2. However, reports (FR-015) and conflict of interest (FR-017) are regulatory necessities, not nice-to-haves. Auditors ask "show me all handovers in Q1" (reports) and "how do you prevent inappropriate assignments?" (COI). These cannot wait for v2.

4. **Timeline**: I accept that integration testing needs more buffer. I propose extending to 14 weeks with a dedicated 2-week integration/UAT phase after Phase 4.

5. **Portfolio privacy**: I accept the data minimization concern. The BRD should be amended to: (a) show only aggregate AUM and product count to BO_MAKER (not individual holdings), (b) show full portfolio detail only to BO_CHECKER during authorization review, (c) add PII access logging on all portfolio context API calls (consistent with existing Trust OMS pattern).

**OPPONENT (addressing Proponent's Round 1):**

The Proponent's rebuttals are reasonable but don't fully resolve the issues:

1. **Bulk upload — improved but still risky**: The proposed mitigations (pre-approval reference, 24-hour review window) significantly improve the design, and I acknowledge this. However, the 24-hour window creates a period where clients are already reassigned but potentially under review. What happens to client interactions during this window? If incoming RM contacts a client and the assignment is then reversed, you've created client confusion. I propose: bulk uploads should create handovers in a "bulk_pending_review" status with a 24-hour window, THEN activate. This is safer than activate-then-review.

2. **Continuity Score — accept advisory framing**: I concede that as an advisory-only indicator, the score is lower risk than I initially argued. However, the BRD should explicitly state the formula is "v1 heuristic subject to calibration" and avoid presenting it as a validated risk metric. Remove the specific "High Risk Transfer" warning badge tied to score > 70 — calling a transfer "high risk" implies validated predictive power that doesn't exist yet. Replace with "Complex Transfer" or "High Context Transfer" language.

3. **Scope — partial concession**: I agree reports and COI management are needed for audit. I maintain that team/pool delegation (FR-009) and the downloadable PDF report (as distinct from the dashboard) should be deferred. Dashboard data export (CSV) is sufficient for v1 audit needs.

4. **Missing features I haven't yet raised**: The BRD is silent on several scenarios common in wealth management:
   - **Partial handover**: What if an RM wants to hand over some clients but keep others? The BRD supports this (multi-select), but there's no "retain list" confirmation showing which clients stay with the outgoing RM.
   - **Handover reversal**: What if a handover needs to be undone after authorization (e.g., incoming RM resigns within a week)? The BRD has no reversal workflow.
   - **Client notification/consent**: In some jurisdictions, clients must be notified (or consent to) RM changes. The BRD mentions integration with consent management but doesn't specify what consent checks are required before handover.
   - **Concurrent handover protection**: What prevents two makers from simultaneously creating handovers for the same outgoing RM's clients, resulting in conflicts?

**JUDGE — Round 2 Assessment:**

Significant progress in this round. Both sides demonstrate intellectual honesty through concessions:

- **Bulk upload**: The Proponent's mitigations are materially better. The Opponent's counter-proposal (create in pending state before activation) is the correct design pattern for regulated environments. **This round: Even — converging toward a good solution.**
- **Continuity Score**: Productive convergence. The Proponent accepts advisory framing; the Opponent accepts it's useful context. The "High Risk" → "High Context" language change is sensible. **Advantage: Opponent's specific language suggestion is better.**
- **Missing features**: The Opponent raises four genuine gaps. Handover reversal is the most critical — post-authorization reversal is a real scenario in wealth management that the BRD doesn't address. Concurrent handover protection is an important technical concern. **Strong advantage: Opponent.**
- **Timeline**: Both sides now agree 14 weeks is more realistic. **Converged.**

**Round 2 Score: Proponent 5/10, Opponent 5/10** (narrowing gap due to Proponent concessions and constructive rebuttals)

---

### Round 3: Deep Dive — Highest-Stakes Disagreements

**Focus areas**: (1) Bulk upload activation model, (2) Missing handover reversal workflow, (3) Client consent requirements, (4) Concurrent handover protection.

**PROPONENT:**

1. **Bulk upload activation model — I accept "stage-then-activate"**: The Opponent's proposal is superior. Bulk uploads should create handovers in `bulk_pending_review` status. After 24 hours (or earlier if BO_CHECKER explicitly approves), items transition to `authorized` and RM reassignment executes. This eliminates the activate-then-review risk. I propose amending FR-005 accordingly.

2. **Handover reversal — critical gap acknowledged**: This is a valid gap. I propose adding FR-021: Handover Reversal. An authorized handover can be reversed within a configurable window (default 30 days) by BO_MAKER with BO_CHECKER approval. Reversal moves clients back to the original RM, creates a new audit trail entry, and notifies all parties. After the reversal window, a new handover must be created instead. This mirrors the existing Trust OMS reversal patterns (the codebase already has a reversal-service.ts).

3. **Client consent**: The BRD mentions consent management integration. I propose making this explicit: before a client handover can be submitted, the system checks the client's consent profile. If the client has a "notify on RM change" preference, an automated notification is queued. If the jurisdiction requires explicit consent (configurable per client domicile), the handover is blocked until consent is obtained. This integrates with the existing consent-service.ts.

4. **Concurrent handover protection**: This is a standard database concurrency issue. I propose: when a maker opens the handover form for an outgoing RM, the system checks if any pending handovers exist for the same outgoing RM. If so, a warning is shown: "Pending handover HO-XXXX already exists for this RM's entities." At the database level, handover_items should have a unique constraint on (entity_id, status=included/transferred) to prevent double-assignment. The submit endpoint should use a serializable transaction.

**OPPONENT:**

The Proponent's responses to all four gaps are technically sound. I have remaining concerns on two points:

1. **Reversal window default of 30 days is too long**: In wealth management, a client may receive investment advice, execute trades, and have portfolio changes within 30 days of a new RM assignment. Reversing after significant RM-client interaction creates confusion and potential regulatory issues (who is responsible for advice given during that period?). I propose a 7-day reversal window as the default, configurable up to 30 days. The reversal should also check if the incoming RM has executed any trades for the client — if yes, a compliance review is mandatory before reversal can proceed.

2. **Client consent implementation scope**: The Proponent's consent integration is correct in principle but adds significant scope. Consent checking per jurisdiction means maintaining a jurisdiction-to-consent-rule mapping. For v1, I propose a simpler approach: (a) all client handovers trigger a notification to the client (configurable template), (b) a `requires_consent` boolean flag on the handover that, when true, blocks authorization until consent is recorded. The full jurisdiction-based automatic consent routing can be v2.

On all other points, I accept the Proponent's designs. The bulk upload staging model, concurrent protection via unique constraints, and reversal workflow are well-designed.

**JUDGE — Round 3 Assessment:**

This was the most productive round. Major gaps have been addressed:

- **Bulk upload**: Fully resolved. Stage-then-activate is the correct pattern. Both sides agree. **Resolved.**
- **Handover reversal**: Strong convergence. The Opponent's 7-day default and trade-check requirement are sensible refinements. **Advantage: Opponent's constraints are more realistic for wealth management.**
- **Client consent**: The Opponent's simplified v1 approach is pragmatic. Full jurisdiction routing is legitimately complex. **Advantage: Opponent's phased approach reduces v1 risk.**
- **Concurrent protection**: Resolved. Database-level constraints are the right solution. **Resolved.**

**Round 3 Score: Proponent 6/10, Opponent 6/10** (both sides contributing constructively; quality of debate improving)

---

### Round 4: Evidence and Alternatives

**PROPONENT — Evidence and supporting data:**

1. **Regulatory evidence**: I reviewed MAS Notice SFA 04-N11 on business conduct — it explicitly requires firms to "maintain clear records of client account responsibilities and transitions." The HAM module's audit trail, compliance gates, and maker-checker workflow directly satisfy this requirement. Without this module, the firm would need to produce manual evidence during MAS examinations, which is costly and error-prone.

2. **Industry benchmarks**: Major private banks (UBS, Credit Suisse legacy, Julius Baer) all have formalized RM transition systems. The typical feature set includes: handover checklists, client notification, AUM visibility, and management approval. The HAM module is feature-competitive with industry standard.

3. **Existing codebase advantage**: The Trust OMS already has:
   - `reversal-service.ts` — pattern for the handover reversal workflow
   - `consent-service.ts` — foundation for consent integration
   - `sanctions-service.ts` — compliance gate integration point
   - `bulk-upload-service.ts` — bulk processing pattern
   - CRUD factory with maker-checker support — reduces per-entity development effort by ~60%

   This means the 14-week timeline is more achievable than a greenfield build would be.

4. **Alternative considered — lightweight approach**: I evaluated building only the basic handover CRUD without compliance gates, SLA tracking, or portfolio context. This would reduce scope to ~8 FRs and ~8 weeks. However, this would fail the regulatory audit scenario (no compliance gates), leave RMs without context (no portfolio panel), and require a v2 almost immediately. The cost of rework exceeds the cost of building it right the first time.

**OPPONENT — Alternatives and risk mitigation:**

1. **Alternative: Two-release strategy instead of five phases**: Rather than 5 phases over 14 weeks, I propose 2 focused releases:
   - **Release 1 (8 weeks)**: Core handover (Lead/Prospect/Client) with maker-checker, scrutiny checklist, compliance gates, audit trail, basic dashboard, and notifications. This is FR-001 through FR-004, FR-012, FR-013 (simplified), FR-014 (dashboard only), FR-016 (notifications), FR-018 (audit viewer). That's 9 core FRs.
   - **Release 2 (6 weeks)**: Delegation (FR-006-008, FR-010), bulk upload (FR-005 with staging model), portfolio context (FR-011), reports (FR-015), COI management (FR-017), admin config (FR-019-020), and handover reversal (new FR-021). That's 11 FRs.

   This ensures the regulatory-critical features ship first and are production-hardened before adding operational convenience features.

2. **Alternative: Skip the Continuity Score entirely in v1**: Instead of a potentially misleading formula, display raw data points (AUM, tenure, open orders, last interaction date) and let human judgment assess transfer complexity. The score can be developed in v2 after collecting real handover outcome data to calibrate the formula empirically.

3. **Risk: Integration coupling**: The 6 internal integrations create coupling risk. If the sanctions service API changes, the HAM compliance gate breaks. I recommend: (a) use an anti-corruption layer (adapter pattern) for each integration, (b) make each compliance gate independently disableable via feature flags, (c) implement circuit breakers for external service calls.

4. **Risk: Scheduled job reliability**: The delegation auto-revert job (daily at 00:01) is a single point of failure. If it fails, delegations don't revert. I recommend: (a) implement the job as idempotent and retryable, (b) add a monitoring alert if any delegation is > 1 day past end_date and still active, (c) provide a manual revert button as a fallback.

**JUDGE — Round 4 Assessment:**

Both sides present strong evidence-based arguments:

- **Two-release strategy**: The Opponent's proposal is compelling. Delivering 9 regulatory-critical FRs in Release 1 (8 weeks) reduces time-to-first-value and allows production learning before adding complex features. **Strong advantage: Opponent — this is a better delivery strategy.**
- **Skip Continuity Score in v1**: Displaying raw data instead of a formula-based score is pragmatic and avoids the "false precision" problem. **Advantage: Opponent.**
- **Integration architecture**: Anti-corruption layers and circuit breakers are sound engineering practices that the BRD should specify. **Advantage: Opponent — these are important architectural requirements.**
- **Job reliability**: The concerns and mitigations are both valid and well-addressed. **Advantage: Opponent for raising it; the mitigations proposed are standard and should be adopted.**
- **Existing codebase advantage**: The Proponent correctly identifies significant reuse potential. This is a genuine accelerator. **Advantage: Proponent.**

**Round 4 Score: Proponent 4/10, Opponent 7/10** (Opponent's alternative delivery strategy and engineering recommendations are stronger)

---

### Round 5: Closing Arguments

**PROPONENT — Final synthesis:**

The HAM module is not optional — it's a regulatory requirement and an operational necessity. The debate has improved the BRD significantly:

1. **Core value is undeniable**: Formal handover governance reduces AUM attrition, satisfies regulators, and protects client relationships. Every major private bank has this capability.

2. **The BRD is comprehensive and well-integrated**: 20 FRs, 11 data entities, 29 APIs — this isn't over-engineering, it's what a real wealth management handover system requires. The existing codebase patterns make this achievable.

3. **Concessions strengthen the design**: I accept the following improvements surfaced through debate:
   - Bulk upload uses stage-then-activate model
   - Handover reversal (FR-021) added with 7-day default window and trade-check
   - Client notification/consent with simplified v1 approach
   - Concurrent handover protection via database constraints
   - Portfolio context with data minimization (aggregate for maker, detail for checker)
   - Two-release delivery strategy (Release 1: 9 core FRs in 8 weeks)
   - Raw data display instead of Continuity Score formula in v1
   - Anti-corruption layers for integrations
   - Circuit breakers for compliance gate service calls
   - Monitoring alerts for scheduled job failures

4. **The remaining risk is manageable**: With these amendments, the primary risks are timeline pressure and integration complexity — both manageable through the two-release strategy and proper engineering practices.

**OPPONENT — Final synthesis:**

The HAM module should be built — we agree on that. My closing arguments focus on ensuring it's built right:

1. **Reduce v1 scope to guarantee delivery**: The two-release strategy is critical. Release 1 (9 FRs, 8 weeks) delivers audit-ready handover governance. Release 2 (11 FRs, 6 weeks) adds operational efficiency. This is safer than a monolithic 14-week delivery with 20+ FRs.

2. **Three features should be cut from Release 1**:
   - Team/pool delegation (FR-009) → Release 2
   - Downloadable PDF reports (FR-015) → Release 2 (dashboard CSV export sufficient for v1)
   - Admin scrutiny template drag-and-drop reordering (FR-020 AC1) → Release 2 (simple add/edit sufficient)

3. **Two features must be added**:
   - Handover reversal (new FR-021) → Release 1 (critical for real-world operations)
   - Client notification on RM change (explicit FR) → Release 1 (regulatory requirement in many jurisdictions)

4. **Three architectural requirements must be specified**:
   - Anti-corruption layer for each integration
   - Circuit breaker on compliance gate external calls
   - Idempotent auto-revert job with monitoring

5. **The Continuity Score should be deferred**: Display raw portfolio metrics in v1. Build the scored model in v2 after collecting handover outcome data for calibration.

6. **Bulk upload must use stage-then-activate**: No exceptions. This is a non-negotiable compliance requirement.

My verdict: **Approve with the conditions listed above.** The core design is sound. The improvements surfaced through this evaluation make it significantly more robust.

**JUDGE — Final Assessment:**

This has been a productive adversarial evaluation. Both sides demonstrated genuine expertise in wealth management operations and software engineering.

**Strongest Proponent arguments:**
1. Regulatory necessity is clear and well-evidenced
2. Existing codebase reuse significantly de-risks implementation
3. Willingness to accept constructive amendments improved the design materially

**Strongest Opponent arguments:**
1. Bulk upload authorization bypass — correctly identified as a compliance risk, leading to the superior stage-then-activate design
2. Two-release delivery strategy — pragmatic and risk-reducing
3. Missing handover reversal — critical operational gap
4. Continuity Score deferral — prevents false precision
5. Data minimization on portfolio context — important privacy improvement

**Weakest arguments (either side):**
- Proponent's initial defense of bulk upload bypass ("assumed pre-validated") was weak
- Opponent's suggestion to skip reports entirely — reports are audit-necessary, though PDF can be v2

---

## 4. Scoring Summary

| Round | Proponent | Opponent | Key Factor |
|-------|-----------|----------|------------|
| Round 1 | 4 | 6 | Opponent identified bulk upload risk, score arbitrariness, and privacy concerns |
| Round 2 | 5 | 5 | Proponent made strong concessions; Opponent raised 4 new gaps |
| Round 3 | 6 | 6 | Both sides constructive; major gaps resolved collaboratively |
| Round 4 | 4 | 7 | Opponent's two-release strategy and architectural recommendations were compelling |
| Round 5 | 5 | 6 | Strong closing from both; Opponent's specific conditions are well-justified |
| **Total** | **24** | **30** | **Opponent had stronger critical analysis** |

---

## 5. Key Risks (Ranked)

| Rank | Risk | Severity | Mitigation |
|------|------|----------|------------|
| 1 | Bulk upload bypasses authorization, enabling mass unauthorized reassignment | Critical | Stage-then-activate model with 24-hour review window |
| 2 | Missing handover reversal workflow for post-authorization corrections | High | Add FR-021 with 7-day window and trade-check before reversal |
| 3 | Integration coupling with 6 internal services creates fragility | High | Anti-corruption layers + circuit breakers + feature flags per gate |
| 4 | 12-week timeline unrealistic for 20 FRs with integration testing | High | Two-release strategy: Release 1 (9 FRs, 8 weeks) + Release 2 (11 FRs, 6 weeks) |
| 5 | Continuity Score formula is arbitrary without empirical validation | Medium | Defer scored model; display raw metrics in v1 |
| 6 | Portfolio context panel exposes unnecessary PII to operations users | Medium | Data minimization: aggregate for maker, detail for checker |
| 7 | Delegation auto-revert job is a single point of failure | Medium | Idempotent job + monitoring alert + manual fallback button |
| 8 | Concurrent handover creation could cause conflicting assignments | Medium | Database unique constraints + serializable transactions |
| 9 | Client consent requirements vary by jurisdiction | Low | Simplified v1 (notify + flag); jurisdiction routing in v2 |
| 10 | Team/pool delegation adds complexity without core value | Low | Defer to Release 2 |

---

## 6. Key Benefits (Ranked)

| Rank | Benefit | Impact |
|------|---------|--------|
| 1 | Regulatory compliance — formal audit trail satisfies MAS/BSP requirements | Critical — avoids regulatory penalties |
| 2 | Reduced AUM attrition during RM transitions (5-8% industry average) | High — direct revenue protection |
| 3 | Operational efficiency — 60% faster RM transitions vs manual process | High — operations cost reduction |
| 4 | Client relationship continuity — portfolio context ensures smooth transitions | High — client satisfaction and retention |
| 5 | Compliance gates prevent inappropriate transfers (KYC, sanctions, COI) | High — risk mitigation |
| 6 | SLA tracking provides management visibility into operational bottlenecks | Medium — process improvement |
| 7 | Leverages existing Trust OMS patterns reducing implementation risk by ~60% | Medium — faster delivery, lower cost |
| 8 | Delegation auto-revert eliminates manual rollback errors | Medium — operational reliability |
| 9 | Dashboard provides real-time operational awareness | Medium — decision support |
| 10 | Immutable audit log enables retrospective compliance analysis | Medium — long-term regulatory value |

---

## 7. Alternative Approaches

### Alternative A: Two-Release Strategy (RECOMMENDED)
- **Release 1 (8 weeks)**: 9 core FRs — Handover (Lead/Prospect/Client), authorization, compliance gates, SLA tracking, dashboard, notifications, audit trail, handover reversal, client notification
- **Release 2 (6 weeks)**: 12 FRs — Delegation (all types), bulk upload, portfolio context, reports, COI management, admin config, team delegation
- **Rationale**: Delivers regulatory-critical features first; allows production learning before adding complexity

### Alternative B: Minimal Viable Handover (NOT RECOMMENDED)
- 6 FRs: Basic handover CRUD, maker-checker, minimal audit
- 6 weeks delivery
- **Rationale**: Faster but fails regulatory audit (no compliance gates, no scrutiny checklist)
- **Rejected**: Compliance risk outweighs speed benefit

### Alternative C: Buy vs Build (EVALUATED AND REJECTED)
- Evaluate commercial RM transition products (e.g., Avaloq Handover module)
- **Rationale**: Commercial products exist but would require expensive integration with Trust OMS's custom schema, RBAC, and workflow
- **Rejected**: Integration cost likely exceeds build cost given existing codebase

---

## 8. Final Verdict

### **APPROVE WITH CONDITIONS**

The HAM module addresses a genuine regulatory and operational need in wealth management. The core design is sound and leverages existing Trust OMS infrastructure effectively. However, the BRD must be revised to address the following conditions before development begins:

**Non-Negotiable Conditions:**
1. **Bulk upload must use stage-then-activate model** — create handovers in `bulk_pending_review` status with mandatory 24-hour review period before activation. Amend FR-005.
2. **Add Handover Reversal (FR-021)** — 7-day default reversal window (configurable up to 30 days), with mandatory compliance review if incoming RM has executed trades for the client.
3. **Add explicit Client Notification requirement** — all client handovers trigger client notification per configurable template. Add `requires_consent` flag that blocks authorization when set.
4. **Adopt two-release delivery strategy** — Release 1 (9 FRs, 8 weeks) for core handover; Release 2 (12 FRs, 6 weeks) for delegation and enrichment.
5. **Add concurrent handover protection** — database unique constraint on (entity_id, status IN ('included', 'transferred')) + serializable transactions on submit.

**Strongly Recommended Conditions:**
6. **Defer Continuity Score formula** — display raw portfolio metrics (AUM, tenure, open orders, last interaction) in v1. Build scored model in v2 with calibration data.
7. **Portfolio context data minimization** — aggregate AUM and product count for BO_MAKER; full detail for BO_CHECKER during authorization.
8. **Anti-corruption layers for integrations** — adapter pattern for each of the 6 internal service integrations.
9. **Circuit breakers on compliance gate calls** — prevent cascading failures if KYC/sanctions service is unavailable. Configurable fallback behavior per gate.
10. **Idempotent auto-revert job with monitoring** — alert if any delegation > 1 day past end_date and still active. Manual revert button as fallback.

**Deferral to Release 2:**
11. Team/Pool Delegation (FR-009)
12. Downloadable PDF reports (FR-015) — dashboard CSV export sufficient for Release 1
13. Scrutiny template drag-and-drop reordering — simple add/edit/deactivate sufficient for Release 1
14. Scored Relationship Continuity model

---

## 9. Recommended Next Steps

1. **Revise the BRD** incorporating all non-negotiable and strongly recommended conditions listed above
2. **Validate revised BRD** with Operations Head, Compliance Officer, and a Senior RM to confirm the two-release scope split
3. **Define integration contracts** — document API contracts for each of the 6 internal integrations before development starts
4. **Set up Release 1 backlog** — break the 9 core FRs into development tasks with effort estimates
5. **Plan UAT** — schedule user acceptance testing participants (BO_MAKER, BO_CHECKER, COMPLIANCE_OFFICER, RM) for Release 1 week 7
6. **Establish monitoring** — define SLA compliance, job health, and error rate dashboards before go-live
7. **Collect baseline data** — measure current manual handover process time and AUM attrition to validate post-launch KPIs
